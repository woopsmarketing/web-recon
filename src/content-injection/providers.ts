import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CONTENT_GENERATOR_CONTRACT_VERSION,
  CONTENT_SCHEMA_VERSION,
  ContentGenerationResultSchema,
  ContentInputError,
  type ContentGenerationResult,
  type ContentIntent,
  type ContentPolicy,
  type ContentUnit,
  type ContentUnitSlot,
  type GenerationRequest,
  type ImageBrief,
  type RepairRequest,
  type SiteContentPlan,
  type SlotValueSource,
  type UnresolvedSlot,
} from "./types.js";

/**
 * Provider-neutral generation contract (Task 19 §3).
 *
 * The Content Engine is NOT coupled to any LLM vendor — and not to Claude
 * Code either. `ContentGenerator` is the whole surface; the output format and
 * the validator downstream are independent of who produced the JSON.
 *
 * Shipped implementations:
 *   - `FakeContentGenerator`  deterministic, offline, for tests and fixtures.
 *   - `loadManualGenerationResult`  the manual JSON seam: any operator (the
 *     MVP uses Claude Code reading the Content Task Packet) writes a result
 *     file and the engine ingests it exactly like a provider response.
 *
 * A future Anthropic / OpenAI / other remote provider implements the same
 * interface without any engine change.
 */

export interface ContentGenerationInput {
  mode: "initial" | "repair";
  intent: ContentIntent;
  policy: ContentPolicy;
  /** Initial: every unit in the request. Repair: only affected units. */
  units: ContentUnit[];
  request: GenerationRequest;
  /** Repair mode only: the bounded evidence packet (§27). */
  repair?: RepairRequest;
}

export interface ContentGenerator {
  readonly name: string;
  generate(input: ContentGenerationInput): Promise<ContentGenerationResult>;
}

// ---------------------------------------------------------------------------
// Deterministic fake provider
// ---------------------------------------------------------------------------

const FAKE_WORDS = [
  "practical",
  "automation",
  "for",
  "teams",
  "that",
  "value",
  "focus",
  "and",
  "steady",
  "delivery",
];

/** Deterministic filler text shaped to roughly the reference length. */
function fakeText(seed: string, targetLength: number | undefined): string {
  const base = `Fake ${seed.replace(/[^a-z0-9]+/gi, " ").trim()}`;
  const target = targetLength !== undefined && targetLength > 0 ? targetLength : base.length;
  if (base.length >= target) return base.slice(0, Math.max(4, target)).trimEnd();
  let out = base;
  let i = 0;
  while (out.length < target - 6) {
    out += ` ${FAKE_WORDS[i % FAKE_WORDS.length]}`;
    i++;
  }
  return out;
}

function sourceCharCount(slot: ContentUnitSlot): number | undefined {
  const constraints = slot.constraints as { sourceCharacterCount?: number } | undefined;
  return typeof constraints?.sourceCharacterCount === "number"
    ? constraints.sourceCharacterCount
    : undefined;
}

export class FakeContentGenerator implements ContentGenerator {
  readonly name = "fake";

  async generate(input: ContentGenerationInput): Promise<ContentGenerationResult> {
    const slotValues: Record<string, unknown> = {};
    const sources: Record<string, SlotValueSource> = {};
    const unresolved: UnresolvedSlot[] = [];
    const imageBriefs: ImageBrief[] = [];

    if (input.mode === "repair" && input.repair) {
      // Repair rewrites CONTENT only: the fake shortens each flagged value to
      // its observed reference length (or half its current length).
      for (const item of input.repair.items) {
        if (typeof item.currentValue !== "string") continue;
        const unitSlot = input.units
          .flatMap((u) => u.slots)
          .find((s) => s.key === item.slotKey);
        const target = unitSlot
          ? (sourceCharCount(unitSlot) ?? Math.ceil(item.currentValue.length / 2))
          : Math.ceil(item.currentValue.length / 2);
        slotValues[item.slotKey] = fakeText(item.slotKey, target);
        sources[item.slotKey] = "generated-marketing";
      }
      return ContentGenerationResultSchema.parse({
        schemaVersion: CONTENT_SCHEMA_VERSION,
        contractVersion: CONTENT_GENERATOR_CONTRACT_VERSION,
        generator: { name: this.name },
        sitePlan: this.plan(input),
        slotValues,
        sources,
        unresolved,
        imageBriefs,
      });
    }

    for (const unit of input.units) {
      for (const slot of unit.slots) {
        if (slot.type === "text") {
          slotValues[slot.key] = fakeText(`${unit.kind} ${slot.role}`, sourceCharCount(slot));
          sources[slot.key] = "generated-marketing";
          continue;
        }
        if (slot.type === "url") {
          if (slot.urlKind === "external") {
            // No user-provided destination → never invent one (§17).
            unresolved.push({ slotKey: slot.key, reason: "needs factual input: external destination" });
            continue;
          }
          if (typeof slot.currentValue === "string") {
            slotValues[slot.key] = slot.currentValue;
            sources[slot.key] = "derived-copy";
          }
          continue;
        }
        // image: keep the default pixels, emit a brief (§19).
        const constraints = slot.constraints as
          | { desktop?: { aspectRatio?: number } }
          | undefined;
        imageBriefs.push({
          slotKey: slot.key,
          action: "keep-default",
          brief: {
            subject: `replacement visual for ${unit.purpose}`,
            mood: "professional",
            ...(constraints?.desktop?.aspectRatio !== undefined
              ? { aspectRatio: constraints.desktop.aspectRatio }
              : {}),
            purpose: unit.purpose,
          },
          warning: "default image retained from the source site; replace before production",
        });
      }
    }

    return ContentGenerationResultSchema.parse({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      contractVersion: CONTENT_GENERATOR_CONTRACT_VERSION,
      generator: { name: this.name },
      sitePlan: this.plan(input),
      slotValues,
      sources,
      unresolved,
      imageBriefs,
    });
  }

  private plan(input: ContentGenerationInput): SiteContentPlan {
    const routes = [...new Set(input.units.map((u) => u.route).filter((r): r is string => !!r))];
    return {
      planVersion: 1,
      siteIdentity: {
        workingName: input.intent.preferences["workingName"] ?? "Fake Company",
        category: "deterministic fixture category",
        audience: "deterministic fixture audience",
        positioning: `derived from intent (${input.intent.rawIntent.length} chars)`,
      },
      primaryConversion: "contact",
      tone: ["professional", "clear"],
      messages: ["deterministic fake message"],
      pagePlans: routes.map((route) => ({
        route,
        currentPurpose: "original page",
        newPurpose: "fake repurposed page",
        primaryMessage: "deterministic fake primary message",
        secondaryMessages: [],
        conversionGoal: "contact",
        contentStrategy: "deterministic fake strategy",
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// Manual JSON seam
// ---------------------------------------------------------------------------

/**
 * Ingest a generation result an operator (or any external tool) wrote by
 * hand. This is the MVP path where Claude Code reads the Content Task Packet
 * and authors the JSON — the file is parsed against the SAME schema and runs
 * through the SAME validator as any provider output.
 */
export async function loadManualGenerationResult(file: string): Promise<ContentGenerationResult> {
  let raw: string;
  try {
    raw = await readFile(path.resolve(file), "utf8");
  } catch {
    throw new ContentInputError(`cannot read generation result ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ContentInputError(`${file} is not valid JSON`);
  }
  const result = ContentGenerationResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new ContentInputError(
      `${file} does not match the generation result contract: ${result.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data;
}

export function resolveGenerator(name: string): ContentGenerator {
  if (name === "fake") return new FakeContentGenerator();
  throw new ContentInputError(
    `unknown provider "${name}" — available: fake (or pass --result <json> for the manual seam)`,
  );
}
