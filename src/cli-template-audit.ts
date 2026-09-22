import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AUDIT_DIR,
  SlotizedInputError,
  auditArtifactCompleteness,
  auditContentPackValidation,
  auditDuplicateIds,
  auditFitWarnings,
  auditHardcodedContent,
  auditSlotCompleteness,
  auditSourceLeakage,
  auditThemeCoverage,
  loadAuditContext,
  stableStringify,
  updateSummary,
  type AuditFile,
  type Verdict,
} from "./slotized-template/index.js";

/**
 * web-recon Slotized Template audit CLI — Task 29 Phase E1.
 *
 *   pnpm template:audit <slotized manifest.json> [--render <rendered app dir>] [--label default|mechanical|realistic]
 *
 * Static audits always run and land in `<run>/audits/`. Render-dependent audits
 * (source leakage, duplicate ids, fit warnings) need `--render` and are written
 * BOTH next to the render and, label-suffixed, into the run directory — so one
 * run dir can carry the verdicts of several packs without overwriting them.
 */

interface Args {
  manifest?: string;
  render?: string;
  pack?: string;
  label?: string;
  outDir?: string;
  skipStatic?: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {};
  const flags: Record<string, keyof Args> = {
    "--render": "render",
    "--pack": "pack",
    "--label": "label",
    "--out-dir": "outDir",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--skip-static") {
      args.skipStatic = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      if (args.manifest === undefined) args.manifest = arg;
      else throw new Error(`unexpected positional argument: ${arg}`);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const key = flags[name];
    if (key === undefined) throw new Error(`Unknown option: ${arg}`);
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (!value) throw new Error(`${name} requires a value`);
    (args as Record<string, unknown>)[key] = value;
  }
  return args;
}

/** `tmp/wr29/renders/rosee-realistic` → `realistic`. */
function labelOf(renderDir: string): string {
  const name = path.basename(path.resolve(renderDir));
  for (const known of ["default", "mechanical", "realistic"]) {
    if (name.endsWith(known)) return known;
  }
  return name;
}

async function write(dir: string, file: string, content: unknown): Promise<string> {
  await mkdir(dir, { recursive: true });
  const target = path.join(dir, file);
  await writeFile(target, stableStringify(content), "utf8");
  return target;
}

function line(name: string, audit: AuditFile): void {
  console.log(`[audit] ${audit.verdict.padEnd(11)} ${name}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.manifest === undefined) {
    console.log(
      "Usage: pnpm template:audit <slotized manifest.json> [--render <rendered app dir>] [--label <name>] [--out-dir <dir>] [--skip-static]",
    );
    process.exitCode = 1;
    return;
  }
  const ctx = await loadAuditContext(args.manifest);
  const runAuditDir = path.join(args.outDir ?? ctx.runDir, AUDIT_DIR);
  const gates: Record<string, Verdict> = {};
  const counts: Record<string, unknown> = {};

  if (args.skipStatic !== true) {
    const completeness = auditSlotCompleteness(ctx);
    const hardcoded = await auditHardcodedContent(ctx);
    const theme = await auditThemeCoverage(ctx);
    const packs = await auditContentPackValidation(ctx);
    const artifacts = await auditArtifactCompleteness(ctx);
    await write(runAuditDir, "slot-completeness.json", completeness);
    await write(runAuditDir, "hardcoded-content.json", hardcoded);
    await write(runAuditDir, "theme-coverage.json", theme);
    await write(runAuditDir, "content-pack-validation.json", packs);
    await write(runAuditDir, "artifact-completeness.json", artifacts);
    line("slot-completeness", completeness);
    line("hardcoded-content", hardcoded);
    line("theme-coverage", theme);
    line("content-pack-validation", packs);
    line("artifact-completeness", artifacts);
    gates["slotCompleteness"] = completeness.verdict;
    gates["hardcodedContent"] = hardcoded.verdict;
    gates["contentPackValidation"] = packs.verdict;
    gates["artifactCompleteness"] = artifacts.verdict;
    counts["slots"] = ctx.template.slots.length;
    counts["bindings"] = ctx.template.bindings.length;
    counts["unexplainedUnslotted"] = completeness["unexplainedCount"];
    counts["unslottedContent"] = hardcoded["unslottedContentCount"];
    counts["themeTokens"] = theme["tokens"];
  }

  if (args.render !== undefined) {
    const renderDir = args.render.endsWith(".json") ? path.dirname(path.resolve(args.render)) : path.resolve(args.render);
    const label = args.label ?? labelOf(renderDir);
    // Only a NON-default pack is gated on leakage: the default pack is the
    // accepted reconstruction and is EXPECTED to carry the source's identity.
    const gate = label === "realistic";
    const leakage = await auditSourceLeakage(ctx, renderDir, label, gate);
    const duplicates = await auditDuplicateIds(ctx, renderDir, label);
    const fit = await auditFitWarnings(ctx, renderDir, label);
    const renderAuditDir = path.join(renderDir, AUDIT_DIR);
    for (const [file, content] of [
      ["source-leakage.json", leakage],
      ["duplicate-ids.json", duplicates],
      ["fit-warnings.json", fit],
    ] as const) {
      await write(renderAuditDir, file, content);
      await write(runAuditDir, file.replace(/\.json$/, `.${label}.json`), content);
    }
    line(`source-leakage (${label})`, leakage);
    line(`duplicate-ids (${label})`, duplicates);
    line(`fit-warnings (${label})`, fit);
    console.log(
      `[audit] leaks ${(leakage["counts"] as Record<string, number>)["leaks"]} · unslottable ${(leakage["counts"] as Record<string, number>)["unslottableLeaks"]} · overlay ${(leakage["counts"] as Record<string, number>)["overlayLeaks"]} · unoverridden-bg ${(leakage["counts"] as Record<string, number>)["unoverriddenSourceBackgrounds"]} · public-identity ${(leakage["counts"] as Record<string, number>)["publicIdentityLeaks"]} · internal-provenance ${(leakage["counts"] as Record<string, number>)["internalProvenanceRefs"]} (allowed)`,
    );
    const gateKey = `sourceLeakage${label.charAt(0).toUpperCase()}${label.slice(1)}`;
    gates[gateKey] = leakage.verdict;
    gates["duplicateIds"] = duplicates.verdict;
    counts[`leaks.${label}`] = (leakage["counts"] as Record<string, number>)["leaks"];
    counts[`unslottableLeaks.${label}`] = (leakage["counts"] as Record<string, number>)["unslottableLeaks"];
    counts[`publicIdentityLeaks.${label}`] = (leakage["counts"] as Record<string, number>)["publicIdentityLeaks"];
    counts[`fitWarnings.${label}`] = fit["total"];
  }

  const summary = await updateSummary(args.outDir ?? ctx.runDir, ctx.template.manifest.templateId, { gates, counts });
  console.log(`[audit] gates ${JSON.stringify(summary.gates)}`);
  const failed = Object.values(summary.gates).filter((v) => v === "FAIL").length;
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  if (error instanceof SlotizedInputError) console.error(`[audit] ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
});
