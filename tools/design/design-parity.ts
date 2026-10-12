/**
 * pnpm design:parity classic <outDir> --baseline <releaseId> [--profile regular8] [--widths 390,1440]
 * pnpm design:parity kit     <outDir> [--preset <presetId>] [--profile regular8] [--release <releaseId>]
 *
 * classic — THE REGRESSION PROOF (CONTRACTS E1). One fixture site, no design document, built twice:
 *           on the stored release `--baseline` and on the working tree. The five pages of each are
 *           screenshotted at every width and compared pixel by pixel; the markup of each page's
 *           <body> is compared too (scripts aside).
 *             <outDir>/baseline/…  <outDir>/working/…   screenshots + checks.json of each side
 *             <outDir>/diff/<page>-<width>.png          only where pixels differ
 *             <outDir>/parity.json                      the numbers, per page and width
 *           Exit 1 when any page differs.
 *
 * kit —     KIT PARITY. The same fixture as an ordinary build and as a shell build composed by the
 *           release's runtime kit: <main>, the markup around it and the head, page by page
 *           (tools/design/harness.ts kitParity). With --preset the composed pages carry the
 *           preset's variants in their slot data, and the result lists them per page.
 *             <outDir>/kit-parity.json
 *           Exit 1 when any page differs.
 *
 * Both run in a temporary design root; the working tree is cut into a dev release there first.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DesignError } from "../../platform/design/errors";
import { buildFixture, capture, comparePng, fixturePages, kitParity, openDesignRoot, servePackage } from "./harness";
import { FIXTURE_PROFILES, type FixtureProfile } from "../../platform/design/dev/make-fixture";

const args = process.argv.slice(2);
const [mode, outArg] = args;
const option = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i > 0 ? args[i + 1] : undefined;
};
const profile = (option("profile") ?? "regular8") as FixtureProfile;
if ((mode !== "classic" && mode !== "kit") || !outArg || outArg.startsWith("--") || !FIXTURE_PROFILES.includes(profile) || (mode === "classic" && !option("baseline"))) {
  console.error("usage: pnpm design:parity classic <outDir> --baseline <releaseId> [--profile …] [--widths 390,1440]\n       pnpm design:parity kit <outDir> [--preset <id>] [--profile …] [--release <releaseId>]");
  process.exit(2);
}
const repoRoot = process.cwd();
const outDir = path.resolve(outArg);
const templateId = option("template") ?? "interior-02";
const log = (line: string) => console.error(line);
const bodyMarkup = (html: string, siteId: string) =>
  html
    .slice(html.indexOf("<body"), html.indexOf("</body>"))
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replaceAll(siteId, "SITE");
/** React's useId values depend on how deep a component sits, not on what it renders: renamed in order of first appearance. */
const withoutGeneratedIds = (markup: string) => {
  const ids = new Map<string, string>();
  return markup.replace(/_R_[0-9a-z]+_/g, (id) => ids.get(id) ?? (ids.set(id, `ID${ids.size + 1}`), ids.get(id)!));
};

try {
  await mkdir(outDir, { recursive: true });
  const root = await openDesignRoot({ repoRoot, templateId, work: option("work"), log });

  if (mode === "kit") {
    const releaseId = option("release");
    const release = releaseId ? root.stored[releaseId] : root.dev;
    if (!release) throw new Error(`release ${releaseId} is not in the release store`);
    const { composed: _composed, shellSite: _shell, ordinarySite: _ordinary, ...result } = await kitParity({ repoRoot, root, release, profile, presetId: option("preset") ?? null, log });
    await writeFile(path.join(outDir, "kit-parity.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ ...result, pages: result.pages.length, differing: result.pages.filter((p) => !p.main || !p.aroundMain || !p.head) }, null, 2));
    if (!result.pass) process.exit(1);
  } else {
    const baselineId = option("baseline")!;
    const baseline = root.stored[baselineId];
    if (!baseline) throw new Error(`baseline release ${baselineId} is not in the release store (stored: ${Object.keys(root.stored).join(", ")})`);
    const widths = (option("widths") ?? "390,1440").split(",").map(Number);
    const sides = [
      { name: "baseline", release: baseline, siteId: "dsfx-baseline" },
      { name: "working", release: root.dev, siteId: "dsfx-working" },
    ] as const;
    const built: Record<string, Awaited<ReturnType<typeof buildFixture>>> = {};
    for (const side of sides) {
      built[side.name] = await buildFixture({ repoRoot, root: root.root, siteId: side.siteId, release: side.release, profile, presetId: null, log });
      const server = await servePackage(built[side.name]!.packageSite);
      try {
        log(`${side.name}: ${side.release.releaseId}`);
        await capture({ origin: server.origin, pages: fixturePages(built[side.name]!), widths, outDir: path.join(outDir, side.name), log });
      } finally {
        await server.close();
      }
    }
    await mkdir(path.join(outDir, "diff"), { recursive: true });
    const rows = [];
    for (const page of fixturePages(built.baseline!)) {
      if (page.path === undefined) continue;
      const file = page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`;
      const [a, b] = await Promise.all(sides.map(async (s) => bodyMarkup(await readFile(path.join(built[s.name]!.packageSite, file), "utf8"), s.siteId)));
      for (const width of widths) {
        const shot = `${page.name}-${width}.png`;
        const pixels = await comparePng(path.join(outDir, "baseline", shot), path.join(outDir, "working", shot), path.join(outDir, "diff", shot));
        rows.push({ page: page.name, path: page.path, width, bodyMarkupIdentical: withoutGeneratedIds(a!) === withoutGeneratedIds(b!), generatedIdsIdentical: a === b, ...pixels });
      }
    }
    const result = {
      what: "classic regression: one fixture with no design document, built on the baseline release and on the working tree",
      templateId,
      profile,
      baseline,
      working: root.dev,
      widths,
      pass: rows.every((r) => r.identical && r.bodyMarkupIdentical),
      pagesCompared: rows.length,
      identical: rows.filter((r) => r.identical).length,
      rows,
    };
    await writeFile(path.join(outDir, "parity.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ ...result, rows: rows.map((r) => `${r.page}@${r.width}: ${r.identical ? "identical" : `DIFFERENT ${r.different}/${r.pixels} px (max Δ ${r.maxChannelDelta}), sizes ${r.a.width}×${r.a.height} vs ${r.b.width}×${r.b.height}`} · body markup ${r.bodyMarkupIdentical ? `identical${r.generatedIdsIdentical ? "" : " (React useId values renamed)"}` : "DIFFERS"}`) }, null, 2));
    if (!result.pass) process.exit(1);
  }
} catch (error) {
  if (!(error instanceof DesignError)) throw error;
  console.error(`design:parity ${error.code}: ${error.message}`);
  process.exit(1);
}
