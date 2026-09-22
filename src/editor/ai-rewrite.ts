/**
 * "Rewrite with AI" — the request/response CONTRACT, and the seam it runs on.
 *
 * THERE IS NO LLM API KEY IN THIS REPO. `src/config/env.ts` declares exactly
 * one credential (Firecrawl), and no vendor SDK is installed. So this feature
 * is not a vendor call with a fallback: it is the EXISTING provider-neutral
 * `ContentGenerator` seam, driven from the editor, and it works two ways with
 * no credentials at all —
 *
 *   provider "fake"    `FakeContentGenerator`, deterministic and offline
 *   provider "result"  `loadManualGenerationResult(file)` — an operator (or
 *                      Claude Code reading the Content Task Packet) authors a
 *                      generation-result.json and the editor ingests it
 *                      through the SAME schema and the SAME validator
 *
 * A remote provider implements `ContentGenerator` and changes nothing here.
 *
 * THE RESPONSE IS KEYED, STRUCTURED SLOT VALUES — NEVER A PARAGRAPH.
 * `ContentGenerationResult.slotValues` is a map from slot key to value, and
 * this module additionally REFUSES any key outside the requested scope instead
 * of splitting, truncating or reassigning it. Nothing is applied
 * automatically: the editor returns a proposal the operator applies with the
 * ordinary Save path, so an AI rewrite creates exactly one revision, like any
 * other edit.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { CONTENT_POLICY } from "../content-injection/policy.js";
import { buildContentUnits } from "../content-injection/units.js";
import {
  loadManualGenerationResult,
  resolveGenerator,
  type ContentGenerationInput,
} from "../content-injection/providers.js";
import {
  CONTENT_GENERATOR_CONTRACT_VERSION,
  CONTENT_POLICY_ID,
  CONTENT_POLICY_VERSION,
  CONTENT_SCHEMA_VERSION,
  ContentIntentSchema,
  GenerationRequestSchema,
  type ContentIntent,
  type ContentUnit,
  type GenerationRequest,
  type SiteContentPlan,
} from "../content-injection/types.js";
import type { EditorSite } from "./catalog.js";
import { regionSlotKeys } from "./panels.js";

export interface AiRewriteScope {
  kind: "slot" | "region";
  slotKey?: string;
  regionId?: string;
  route?: string | null;
}

export interface AiRewriteContext {
  scope: AiRewriteScope;
  /** The customer brief, verbatim — never merged with an interpretation. */
  brief: {
    rawIntent: string;
    preferences: Record<string, string>;
    providedFacts: unknown[];
    truthMode: string | null;
    source: string;
  };
  /** The site's existing content plan, when a content run recorded one. */
  sitePlan: SiteContentPlan | null;
  sitePlanSource: string;
  route: string | null;
  region: {
    regionId: string;
    landmarkKind: string;
    landmarkKey: string;
    rootTag: string;
    slotCount: number;
  } | null;
  /** The Content Units the request carries — the deterministic LLM boundary. */
  units: ContentUnit[];
  slotKeysInScope: string[];
  constraintsIncluded: number;
  policyId: string;
  policyVersion: number;
  request: GenerationRequest;
}

export interface AiRewriteProposal {
  ok: boolean;
  provider: string;
  context: AiRewriteContext;
  /** slot key → proposed value. NOTHING is applied by this call. */
  proposed: Record<string, unknown>;
  sources: Record<string, string>;
  unresolved: Array<{ slotKey: string; reason: string }>;
  imageBriefs: unknown[];
  /** Keys the provider returned that are NOT in scope — refused, never split. */
  outOfScope: string[];
  sitePlanReturned: SiteContentPlan | null;
  note: string;
}

export class AiRewriteUnavailable extends Error {}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

/** The customer brief: the content run's recorded intent, else the project's. */
async function loadIntent(site: EditorSite, routes: string[], includeReview: boolean): Promise<{
  intent: ContentIntent;
  source: string;
}> {
  if (site.contentRunDir !== null) {
    const file = path.join(site.contentRunDir, "intent.json");
    if (existsSync(file)) {
      try {
        const parsed = ContentIntentSchema.parse(await readJson(file));
        return {
          intent: ContentIntentSchema.parse({
            ...parsed,
            requestedScope: { routes: routes.length > 0 ? routes : parsed.requestedScope.routes, includeReview },
          }),
          source: file,
        };
      } catch {
        /* fall through to the project intent */
      }
    }
  }
  const rawIntent = site.project.intent.rawIntent;
  if (rawIntent === null || rawIntent.trim() === "") {
    throw new AiRewriteUnavailable(
      "this project records no customer brief (content run intent.json absent and project.intent.rawIntent is null) — " +
        "a rewrite request has nothing to state the customer's intent with, and the editor will not invent one",
    );
  }
  return {
    intent: ContentIntentSchema.parse({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      rawIntent,
      requestedScope: { routes: routes.length > 0 ? routes : ["/"], includeReview },
      preferences: {},
      providedFacts: [],
    }),
    source: "release-project.json intent.rawIntent",
  };
}

async function loadSitePlan(site: EditorSite): Promise<{ plan: SiteContentPlan | null; source: string }> {
  if (site.contentRunDir === null) return { plan: null, source: "no content run on the accepted lineage" };
  const file = path.join(site.contentRunDir, "generation-result.json");
  if (!existsSync(file)) return { plan: null, source: `absent: ${file}` };
  try {
    const parsed = await readJson<{ sitePlan?: SiteContentPlan }>(file);
    return parsed.sitePlan === undefined
      ? { plan: null, source: `${file} records no sitePlan` }
      : { plan: parsed.sitePlan, source: file };
  } catch {
    return { plan: null, source: `unreadable: ${file}` };
  }
}

async function loadInstructions(site: EditorSite): Promise<{ instructions: string[]; allowedSources: string[] }> {
  if (site.contentRunDir !== null) {
    const file = path.join(site.contentRunDir, "generation-request.json");
    if (existsSync(file)) {
      try {
        const parsed = await readJson<{ instructions?: string[]; allowedSources?: string[] }>(file);
        if (Array.isArray(parsed.instructions) && parsed.instructions.length > 0) {
          return {
            instructions: parsed.instructions,
            allowedSources: parsed.allowedSources ?? ["user-provided", "derived-copy", "generated-marketing"],
          };
        }
      } catch {
        /* fall through */
      }
    }
  }
  // No recorded request on this lineage: restate the FIXED system policy
  // rather than inventing instructions of our own.
  return {
    instructions: CONTENT_POLICY.rules.map((rule) => `${rule.id}: ${rule.statement}`),
    allowedSources: ["user-provided", "derived-copy", "generated-marketing", "needs-input (via unresolved)"],
  };
}

export interface BuildAiRewriteContextOptions {
  site: EditorSite;
  scope: AiRewriteScope;
  /** Current route path, used to scope units when the scope is a slot. */
  route: string | null;
}

export async function buildAiRewriteContext(
  options: BuildAiRewriteContextOptions,
): Promise<AiRewriteContext> {
  const { site, scope } = options;

  let targetKeys: string[];
  let region: AiRewriteContext["region"] = null;
  if (scope.kind === "region") {
    if (scope.regionId === undefined) throw new AiRewriteUnavailable("region scope needs a regionId");
    targetKeys = regionSlotKeys(site, scope.regionId);
    const found = site.regions.find((candidate) => candidate.regionId === scope.regionId);
    if (found === undefined) throw new AiRewriteUnavailable(`unknown regionId ${scope.regionId}`);
    region = {
      regionId: found.regionId,
      landmarkKind: found.landmark.kind,
      landmarkKey: found.landmark.key,
      rootTag: found.rootTag,
      slotCount: found.slotKeys.length,
    };
    if (targetKeys.length === 0) {
      throw new AiRewriteUnavailable(`region ${scope.regionId} owns no slots — there is nothing to rewrite`);
    }
  } else {
    if (scope.slotKey === undefined) throw new AiRewriteUnavailable("slot scope needs a slotKey");
    if (!site.index.slotByKey.has(scope.slotKey)) {
      throw new AiRewriteUnavailable(`unknown slot key ${scope.slotKey}`);
    }
    targetKeys = [scope.slotKey];
  }

  const targetSet = new Set(targetKeys);
  const routes = [
    ...new Set(
      targetKeys
        .map((key) => site.index.slotByKey.get(key)?.route)
        .filter((value): value is string => value !== undefined),
    ),
  ];
  const scopedRoutes = routes.length > 0 ? routes : options.route !== null ? [options.route] : site.routes.map((r) => r.path);

  // includeReview is TRUE here on purpose and it is not a loosened gate: the
  // operator selected this exact slot / region by hand. Review-flagged slots
  // stay excluded from every batch content run; only a hand-picked rewrite
  // reaches them, and doing so records nothing about human approval.
  const built = buildContentUnits(site.template, scopedRoutes, true);
  const units = built.units.filter((unit) => unit.slots.some((slot) => targetSet.has(slot.key)));
  if (units.length === 0) {
    throw new AiRewriteUnavailable(
      `no content unit contains ${targetKeys.length} requested slot key(s) — the units layer does not represent this selection`,
    );
  }
  const slotKeysInScope = units.flatMap((unit) => unit.slots.map((slot) => slot.key));
  const constraintsIncluded = units
    .flatMap((unit) => unit.slots)
    .filter((slot) => slot.constraints !== undefined).length;

  const { intent, source: briefSource } = await loadIntent(site, scopedRoutes, true);
  const { plan, source: planSource } = await loadSitePlan(site);
  const { instructions, allowedSources } = await loadInstructions(site);

  const request = GenerationRequestSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contractVersion: CONTENT_GENERATOR_CONTRACT_VERSION,
    runId: `editor-rewrite-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    templateId: site.templateId,
    policyId: CONTENT_POLICY_ID,
    policyVersion: CONTENT_POLICY_VERSION,
    steps: ["site-content-plan", "unit-values"],
    batches: [
      {
        batchId: "editor-rewrite-1",
        scope: units.every((unit) => unit.scope === "global") ? "global" : "page",
        ...(scopedRoutes.length === 1 ? { route: scopedRoutes[0] } : {}),
        unitIds: units.map((unit) => unit.unitId),
      },
    ],
    batchUnitLimit: units.length,
    ...(intent.truthMode !== undefined ? { truthMode: intent.truthMode } : {}),
    instructions,
    allowedSources,
  });

  return {
    scope,
    brief: {
      rawIntent: intent.rawIntent,
      preferences: intent.preferences,
      providedFacts: intent.providedFacts,
      truthMode: intent.truthMode ?? null,
      source: briefSource,
    },
    sitePlan: plan,
    sitePlanSource: planSource,
    route: options.route,
    region,
    units,
    slotKeysInScope,
    constraintsIncluded,
    policyId: CONTENT_POLICY_ID,
    policyVersion: CONTENT_POLICY_VERSION,
    request,
  };
}

export interface RunAiRewriteOptions extends BuildAiRewriteContextOptions {
  /** "fake" (offline deterministic) or "result" (ingest a result file). */
  provider: string;
  resultFile?: string;
}

export async function runAiRewrite(options: RunAiRewriteOptions): Promise<AiRewriteProposal> {
  const context = await buildAiRewriteContext(options);
  const intent = ContentIntentSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    rawIntent: context.brief.rawIntent,
    requestedScope: {
      routes: context.request.batches[0].route !== undefined ? [context.request.batches[0].route] : ["/"],
      includeReview: true,
    },
    preferences: context.brief.preferences,
    providedFacts: context.brief.providedFacts,
    ...(context.brief.truthMode !== null ? { truthMode: context.brief.truthMode } : {}),
  });

  const input: ContentGenerationInput = {
    mode: "initial",
    intent,
    policy: CONTENT_POLICY,
    units: context.units,
    request: context.request,
  };

  const result =
    options.provider === "result"
      ? await (async () => {
          if (options.resultFile === undefined) {
            throw new AiRewriteUnavailable('provider "result" needs a generation-result.json path');
          }
          return loadManualGenerationResult(options.resultFile);
        })()
      : await resolveGenerator(options.provider).generate(input);

  const inScope = new Set(context.slotKeysInScope);
  const proposed: Record<string, unknown> = {};
  const outOfScope: string[] = [];
  for (const [key, value] of Object.entries(result.slotValues)) {
    if (inScope.has(key)) proposed[key] = value;
    else outOfScope.push(key);
  }
  const sources: Record<string, string> = {};
  for (const [key, value] of Object.entries(result.sources)) {
    if (inScope.has(key)) sources[key] = value;
  }

  return {
    ok: true,
    provider: options.provider === "result" ? `result:${options.resultFile ?? ""}` : result.generator.name,
    context,
    proposed,
    sources,
    unresolved: result.unresolved.filter((entry) => inScope.has(entry.slotKey)),
    imageBriefs: result.imageBriefs.filter((brief) => inScope.has(brief.slotKey)),
    outOfScope,
    sitePlanReturned: result.sitePlan,
    note:
      "PROPOSAL ONLY — nothing has been written. Values are keyed by slot key; a key outside the requested scope is " +
      "refused, never split or reassigned. Applying the proposal goes through the ordinary Save path and appends " +
      "exactly one revision. Slots the provider could not resolve stay unresolved and are NOT filled in.",
  };
}
