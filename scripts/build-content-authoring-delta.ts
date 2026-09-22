import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AuthoringDeltaSchema,
  CONTENT_SCHEMA_VERSION,
  ContentGenerationResultSchema,
  loadReconTemplate,
  sha256OfFile,
  type AuthoringDelta,
  type AuthoringDeltaValue,
} from "../src/content-injection/index.js";

/**
 * Expand a hand-authored DECISIONS file into a content authoring delta.
 *
 * The decisions file is the HAND-WRITTEN surface: every individually authored
 * value and rationale lives there, plus CLASS RULES for homogeneous slot
 * populations where one editorial judgement covers every member (the Task 28
 * Phase 9 canary has exactly one such class: 106 in-page anchors whose only
 * correct value is the template's own fragment).
 *
 * This script does the mechanical half — it never invents a value and never
 * decides anything a class rule did not already state — and emits the delta
 * `composeAuthoredResult()` consumes. Running it again over the same inputs
 * produces the same bytes, so the canary is reproducible from the decisions
 * file plus the pinned base result alone.
 *
 *   npx tsx scripts/build-content-authoring-delta.ts \
 *     --decisions docs/result/handoffs/28-intel/phase9/authoring-decisions.json \
 *     --base data/linear.app/content-runs/<id>/generation-result.json \
 *     --template data/linear.app/recon-templates/<id>/manifest.json \
 *     --out docs/result/handoffs/28-intel/phase9/authoring-delta.json
 */

const DecisionValueSchema = z
  .object({
    slotKey: z.string(),
    value: z.union([z.string(), z.record(z.string(), z.unknown())]),
    source: z.enum(["user-provided", "derived-copy", "generated-marketing"]),
    synthetic: z.boolean().optional(),
    rationale: z.string().min(1),
  })
  .strict();

const DecisionsSchema = z
  .object({
    schemaName: z.literal("content-authoring-decisions-v1"),
    task: z.string(),
    authoredBy: z
      .object({
        agent: z.string(),
        procedure: z.string(),
        liveModelCall: z.literal(false),
        authoredAt: z.string(),
      })
      .strict(),
    generator: z.object({ name: z.string(), model: z.string().optional() }).strict(),
    classRules: z.array(
      z
        .object({
          id: z.literal("in-page-anchor"),
          selects: z.string(),
          source: z.enum(["user-provided", "derived-copy", "generated-marketing"]),
          value: z.string(),
          synthetic: z.boolean(),
          rationale: z.string().min(1),
        })
        .strict(),
    ),
    brief: z.record(z.string(), z.unknown()),
    sitePlan: z.record(z.string(), z.unknown()),
    resolutions: z.array(DecisionValueSchema),
    rewrites: z.array(DecisionValueSchema),
    keepUnresolved: z.array(z.object({ slotKey: z.string(), reason: z.string() }).strict()),
    notes: z.array(z.string()),
  })
  .strict();

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] !== undefined) return process.argv[index + 1]!;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

async function main(): Promise<void> {
  const decisionsFile = arg("decisions");
  const baseFile = arg("base");
  const templateFile = arg("template");
  const outFile = arg("out");

  const decisions = DecisionsSchema.parse(JSON.parse(await readFile(decisionsFile, "utf8")));
  const baseRaw = await readFile(baseFile, "utf8");
  const base = ContentGenerationResultSchema.parse(JSON.parse(baseRaw));
  const template = await loadReconTemplate(templateFile);

  const handWrittenKeys = new Set([
    ...decisions.resolutions.map((item) => item.slotKey),
    ...decisions.rewrites.map((item) => item.slotKey),
    ...decisions.keepUnresolved.map((item) => item.slotKey),
  ]);

  // ---- class expansion: the in-page anchors ------------------------------
  const rule = decisions.classRules.find((candidate) => candidate.id === "in-page-anchor");
  const classResolutions: AuthoringDeltaValue[] = [];
  const unmatchedByAnyDecision: string[] = [];
  for (const entry of base.unresolved) {
    if (handWrittenKeys.has(entry.slotKey)) continue;
    const slot = template.slotByKey.get(entry.slotKey);
    if (rule !== undefined && slot?.urlKind === "hash" && typeof slot.defaultValue === "string") {
      classResolutions.push({
        slotKey: entry.slotKey,
        value: slot.defaultValue,
        source: rule.source,
        ...(rule.synthetic ? { synthetic: true } : {}),
        rationale: `class rule ${rule.id}: ${rule.rationale}`,
      });
      continue;
    }
    unmatchedByAnyDecision.push(entry.slotKey);
  }
  if (unmatchedByAnyDecision.length > 0) {
    // LOUD, never silent. A base-unresolved key that neither a hand-written
    // decision nor a class rule covers would otherwise become an invisible
    // needs-input entry in the composed result.
    throw new Error(
      `${unmatchedByAnyDecision.length} base-unresolved slot key(s) are covered by neither a hand-written ` +
        `decision nor a class rule: ${unmatchedByAnyDecision.slice(0, 10).join(", ")}`,
    );
  }

  const delta: AuthoringDelta = AuthoringDeltaSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    schemaName: "content-authoring-delta-v1",
    authoredBy: decisions.authoredBy,
    base: {
      file: baseFile,
      sha256: sha256OfFile(baseRaw),
      generator: base.generator,
      slotValues: Object.keys(base.slotValues).length,
      unresolved: base.unresolved.length,
    },
    generator: decisions.generator,
    brief: decisions.brief,
    sitePlan: decisions.sitePlan,
    resolutions: [...decisions.resolutions, ...classResolutions],
    rewrites: decisions.rewrites,
    keepUnresolved: decisions.keepUnresolved,
    notes: [
      ...decisions.notes,
      `expanded from ${path.relative(process.cwd(), decisionsFile)}: ` +
        `${decisions.resolutions.length} hand-written resolution(s) + ${classResolutions.length} expanded by ` +
        `class rule in-page-anchor, ${decisions.rewrites.length} hand-written rewrite(s)`,
    ],
  });

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(delta, null, 2) + "\n", "utf8");
  console.log(`[delta] base            ${baseFile}`);
  console.log(`[delta] base sha256     ${delta.base.sha256}`);
  console.log(`[delta] hand-written    ${decisions.resolutions.length} resolution(s), ${decisions.rewrites.length} rewrite(s)`);
  console.log(`[delta] class-expanded  ${classResolutions.length} in-page anchor(s)`);
  console.log(`[delta] total           ${delta.resolutions.length} resolution(s), ${delta.rewrites.length} rewrite(s), ${delta.keepUnresolved.length} kept needs-input`);
  console.log(`[delta] out             ${outFile}`);
}

main().catch((err) => {
  console.error("[delta] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
