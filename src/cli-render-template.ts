import { SlotizedRenderError, renderTemplate } from "./slotized-template/index.js";

/**
 * web-recon Slotized Template renderer CLI — Task 29.
 *
 *   pnpm render:template --template <slotized manifest.json> --content <pack.json>
 *                        [--theme <theme-pack.json>] [--identity <site-identity.json>]
 *                        [--out <dir>] [--assert-neutral]
 *
 * `--assert-neutral` is the template's honesty test: rendering the DEFAULT
 * content pack must reproduce the accepted reconstruction exactly (no tree
 * change, no route-map change, no CSS override). It exits non-zero otherwise.
 *
 * `--identity` (Task 29.1) names who the rendered site IS — public origin, slug,
 * brand, locale — and is applied only to site-level app-shell surfaces. The
 * template's source provenance is kept in the render manifest regardless.
 */

interface ParsedArgs {
  template?: string;
  content?: string;
  theme?: string;
  identity?: string;
  out?: string;
  runId?: string;
  assertNeutral?: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  const flags: Record<string, keyof ParsedArgs> = {
    "--template": "template",
    "--content": "content",
    "--theme": "theme",
    "--identity": "identity",
    "--out": "out",
    "--output": "out",
    "--run-id": "runId",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--assert-neutral") {
      args.assertNeutral = true;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.template || !args.content) {
    console.log(
      "Usage: pnpm render:template --template <slotized manifest.json> --content <pack.json> [--theme <pack.json>] [--identity <site-identity.json>] [--out <dir>] [--assert-neutral]",
    );
    process.exitCode = 1;
    return;
  }
  const startedAt = Date.now();
  const report = await renderTemplate({
    templateManifestFile: args.template,
    contentPackFile: args.content,
    ...(args.theme === undefined ? {} : { themePackFile: args.theme }),
    ...(args.identity === undefined ? {} : { siteIdentityFile: args.identity }),
    ...(args.out === undefined ? {} : { outDir: args.out }),
    ...(args.runId === undefined ? {} : { runId: args.runId }),
    ...(args.assertNeutral === undefined ? {} : { assertNeutral: args.assertNeutral }),
    log: (message) => console.log(message),
  });
  console.log(
    `[render] applied ${report.applied} · skipped ${report.skipped} · failed ${report.failed.length} · css overrides ${report.overrides}`,
  );
  for (const failure of report.failed.slice(0, 10)) {
    console.log(`[render] FAILED ${failure.bindingId}: ${failure.reason}`);
  }
  if (report.failed.length > 10) console.log(`[render] … ${report.failed.length - 10} more failures`);
  if (report.repeaters.length > 0) {
    const totals = report.repeaters.reduce(
      (acc, entry) => ({
        added: acc.added + entry.added,
        removed: acc.removed + entry.removed,
        cloned: acc.cloned + entry.clonedNodes,
        namespaced: acc.namespaced + entry.namespacedIds,
        fields: acc.fields + entry.fieldsApplied,
      }),
      { added: 0, removed: 0, cloned: 0, namespaced: 0, fields: 0 },
    );
    console.log(
      `[render] repeaters ${report.repeaters.length} driven · +${totals.added}/-${totals.removed} items · ${totals.cloned} cloned nodes · ${totals.namespaced} namespaced ids · ${totals.fields} field values`,
    );
    for (const entry of report.repeaters.slice(0, 10)) {
      console.log(
        `[render]   ${entry.key} (${entry.variant}) ${entry.defaultCount}→${entry.renderedCount}${entry.reordered ? " reordered" : ""}${entry.warnings.length > 0 ? ` [${entry.warnings.join(",")}]` : ""}`,
      );
    }
  }
  console.log(
    `[render] duplicate DOM ids: baseline ${report.duplicateIds.baseline} · introduced ${report.duplicateIds.introduced}`,
  );
  const fitWarnings = report.warnings.filter((w) => w.code === "CONTENT_FIT_WARNING").length;
  if (report.warnings.length > 0) {
    console.log(`[render] warnings ${report.warnings.length} (fit ${fitWarnings})`);
  }
  if (report.siteIdentity !== undefined) {
    console.log(
      `[render] site identity ${report.siteIdentity.slug} (${report.siteIdentity.publicOrigin ?? "no public origin"}) · provenance ${report.provenance.sourceOrigin}`,
    );
    for (const surface of report.identitySurfaces ?? []) {
      console.log(`[render]   ${surface.status.padEnd(9)} ${surface.surface}: ${surface.detail}`);
    }
  }
  console.log(`[render] wrote ${report.outDir} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  if (report.neutralityChecked) {
    if (report.neutral) {
      console.log("[render] NEUTRAL: the default pack reproduces the reconstruction exactly");
    } else {
      console.error(`[render] NOT NEUTRAL: ${(report.neutralityDiffs ?? []).join("; ")}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  if (error instanceof SlotizedRenderError) console.error(`[render] ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
});
