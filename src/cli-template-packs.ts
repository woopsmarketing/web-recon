import path from "node:path";
import {
  PACK_PATHS,
  SlotizedInputError,
  buildMechanicalPack,
  buildMutatedThemePack,
  buildRealisticPack,
  loadCorpus,
  loadPackContext,
  verifyExpectations,
  writePackFiles,
} from "./slotized-template/index.js";

/**
 * web-recon Slotized Template pack generator CLI — Task 29 Phase E1.
 *
 *   pnpm template:packs <slotized manifest.json> [--out-dir <run dir>] [--corpus <fixture.json>]
 *   pnpm template:packs <slotized manifest.json> --verify-expectations <rendered app dir>
 *
 * Writes `content-packs/mechanical.json` (+ its expectations),
 * `content-packs/realistic.json` and `theme-packs/mutated.json` into the run
 * directory. Nothing existing is ever rewritten: the generator only ADDS packs.
 */

interface Args {
  manifest?: string;
  outDir?: string;
  corpus?: string;
  verify?: string;
  expectations?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {};
  const flags: Record<string, keyof Args> = {
    "--out-dir": "outDir",
    "--corpus": "corpus",
    "--verify-expectations": "verify",
    "--expectations": "expectations",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.manifest === undefined) {
    console.log(
      "Usage: pnpm template:packs <slotized manifest.json> [--out-dir <dir>] [--corpus <fixture.json>] [--verify-expectations <render dir>]",
    );
    process.exitCode = 1;
    return;
  }
  const ctx = await loadPackContext(args.manifest);
  const runDir = path.resolve(args.outDir ?? path.dirname(path.resolve(args.manifest)));

  if (args.verify !== undefined) {
    const expectationsFile = args.expectations ?? path.join(runDir, PACK_PATHS.mechanicalExpectations);
    const result = await verifyExpectations(expectationsFile, args.verify);
    console.log(
      `[packs] expectations slots ${result.slots.passed}/${result.slots.checked} · repeaters ${result.repeaters.passed}/${result.repeaters.checked}`,
    );
    for (const failure of result.failures.slice(0, 15)) {
      console.log(`[packs] FAIL ${failure.kind} ${failure.id}: ${failure.detail}`);
    }
    const out = path.join(args.verify, "expectations-verification.json");
    await writePackFiles(args.verify, [{ relPath: "expectations-verification.json", content: result }]);
    console.log(`[packs] ${result.pass ? "PASS" : "FAIL"} → ${out}`);
    if (!result.pass) process.exitCode = 1;
    return;
  }

  const corpusFile =
    args.corpus ?? path.resolve("fixtures/task29", `${ctx.template.manifest.source.host}.corpus.json`);
  const corpus = await loadCorpus(corpusFile);

  const mechanical = buildMechanicalPack(ctx);
  const realistic = buildRealisticPack(ctx, corpus);
  const theme = await buildMutatedThemePack(ctx, corpus.theme);
  if (theme.missing.length > 0) {
    console.log(`[packs] WARNING theme token keys not found in this template: ${theme.missing.join(", ")}`);
  }

  const written = await writePackFiles(runDir, [
    { relPath: PACK_PATHS.mechanical, content: mechanical.pack },
    { relPath: PACK_PATHS.mechanicalExpectations, content: mechanical.expectations },
    { relPath: PACK_PATHS.realistic, content: realistic },
    { relPath: PACK_PATHS.themeMutated, content: theme.pack },
  ]);

  const drivenMechanical = Object.keys(mechanical.pack.repeaters).length;
  const drivenRealistic = Object.keys(realistic.repeaters).length;
  console.log(
    `[packs] mechanical: ${Object.keys(mechanical.pack.slots).length} slots · ${drivenMechanical} repeaters driven · ${mechanical.expectations.slots.length} slot expectations · ${mechanical.expectations.repeaters.length} repeater expectations`,
  );
  console.log(
    `[packs] realistic: ${Object.keys(realistic.slots).length} slots · ${drivenRealistic} repeaters driven · corpus ${path.relative(process.cwd(), corpusFile)}`,
  );
  for (const change of theme.resolved) {
    console.log(`[packs] theme ${change.key} ${change.from} → ${change.to}`);
  }
  for (const file of written) console.log(`[packs] wrote ${file}`);
}

main().catch((error: unknown) => {
  if (error instanceof SlotizedInputError) console.error(`[packs] ${error.message}`);
  else console.error(error);
  process.exitCode = 1;
});
