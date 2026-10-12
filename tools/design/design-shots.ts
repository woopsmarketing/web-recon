/**
 * pnpm design:shots <outDir> [--profile regular8] [--preset <presetId>] [--release <releaseId>]
 *                            [--widths 390,768,1440] [--template interior-02] [--work <dir>]
 *                            [--accent #rrggbb] [--primary #rrggbb] [--surface warm|neutral|cool|dark]
 *                            [--typography modern-sans|editorial-serif]
 *
 * Build a fixture site → serve its package locally → Playwright Chromium → full-page screenshots of
 * home, listing, one detail, about and contact at every width, plus checks.json.
 *
 *   <outDir>/<page>-<width>.png     the screenshots
 *   <outDir>/checks.json            per page and width: horizontal overflow, <h1> count, images
 *                                   without alt, smallest computed font size of visible text,
 *                                   console errors, failed requests (a response ≥ 400 or a network
 *                                   error; the router's cancelled link prefetches are counted
 *                                   apart), total image count
 *   <outDir>/run.json               what was built: release, preset, profile, design document, font files
 *
 *   --profile   thin0 | thin1 | thin3 | regular8 | longname            (default regular8)
 *   --preset    a preset of data/site-presets/<template>/; omitted = the classic site
 *   --release   build on a STORED release instead of the working tree (e.g. the last cut one)
 *   --work      keep the design root there (default: a fresh temporary directory)
 *   --accent … --typography   a brand `appearance` on top of the fixture brand block
 *
 * The working tree is cut into a dev release in a temporary root first (every release gate runs).
 * Nothing is written into data/sites, data/site-builds or data/template-releases of the checkout;
 * the pages may request only the local server.
 */
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrandAppearance } from "../../platform/design/apply";
import { DesignError } from "../../platform/design/errors";
import { DEFAULT_WIDTHS, buildFixture, capture, fixturePages, openDesignRoot, servePackage } from "./harness";
import { FIXTURE_PROFILES, type FixtureProfile } from "../../platform/design/dev/make-fixture";

const args = process.argv.slice(2);
const outArg = args[0];
const option = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i > 0 ? args[i + 1] : undefined;
};
const profile = (option("profile") ?? "regular8") as FixtureProfile;
if (!outArg || outArg.startsWith("--") || !FIXTURE_PROFILES.includes(profile)) {
  console.error("usage: pnpm design:shots <outDir> [--profile thin0|thin1|thin3|regular8|longname] [--preset <id>] [--release <releaseId>] [--widths 390,768,1440] [--template interior-02] [--work <dir>] [--accent #rrggbb] [--primary #rrggbb] [--surface …] [--typography …]");
  process.exit(2);
}
const repoRoot = process.cwd();
const outDir = path.resolve(outArg);
const templateId = option("template") ?? "interior-02";
const presetId = option("preset") ?? null;
const widths = (option("widths") ?? DEFAULT_WIDTHS.join(",")).split(",").map(Number);
const appearance: BrandAppearance = {
  ...(option("accent") ? { accentColor: option("accent")! } : {}),
  ...(option("primary") ? { primaryColor: option("primary")! } : {}),
  ...(option("surface") ? { surface: option("surface") as BrandAppearance["surface"] } : {}),
  ...(option("typography") ? { typography: option("typography") as BrandAppearance["typography"] } : {}),
};
const log = (line: string) => console.error(line);

try {
  const root = await openDesignRoot({ repoRoot, templateId, work: option("work"), log });
  const releaseId = option("release");
  const release = releaseId ? root.stored[releaseId] : root.dev;
  if (!release) throw new Error(`release ${releaseId} is not in the release store (stored: ${Object.keys(root.stored).join(", ")})`);
  const fixture = await buildFixture({ repoRoot, root: root.root, siteId: `dsfx-${profile}`, release, profile, presetId, appearance: Object.keys(appearance).length > 0 ? appearance : undefined, log });
  const server = await servePackage(fixture.packageSite);
  let checks;
  try {
    log(`screenshots → ${outDir}`);
    checks = await capture({ origin: server.origin, pages: fixturePages(fixture), widths, outDir, log });
  } finally {
    await server.close();
  }
  const settings = JSON.parse(await readFile(path.join(fixture.siteDir, "settings.json"), "utf8")) as { overrides: Record<string, { config?: unknown }> };
  const fontsDir = path.join(fixture.packageSite, "_fonts");
  const fontSets = await readdir(fontsDir).catch(() => [] as string[]);
  const fonts: Record<string, { files: number; bytes: number }> = {};
  for (const set of fontSets) {
    const names = await readdir(path.join(fontsDir, set));
    let bytes = 0;
    for (const name of names) bytes += (await stat(path.join(fontsDir, set, name))).size;
    fonts[set] = { files: names.length, bytes };
  }
  const run = {
    templateId,
    release,
    builtFrom: releaseId ? "stored release" : "working tree (dev release)",
    profile,
    presetId,
    appearance,
    design: settings.overrides["site.design"]?.config ?? null,
    fontsInPackage: fonts,
    widths,
    pages: fixturePages(fixture),
    summary: {
      pages: checks.filter((c) => c.generated).length,
      notGenerated: checks.filter((c) => !c.generated).map((c) => `${c.page}@${c.width}`),
      horizontalOverflow: checks.filter((c) => (c.horizontalOverflow ?? 0) > 0).map((c) => `${c.page}@${c.width}: ${c.horizontalOverflow}px`),
      h1NotOne: checks.filter((c) => c.generated && c.h1Count !== 1).map((c) => `${c.page}@${c.width}: ${c.h1Count}`),
      imagesWithoutAlt: checks.filter((c) => (c.imagesWithoutAlt ?? 0) > 0).map((c) => `${c.page}@${c.width}: ${c.imagesWithoutAlt}`),
      smallestFontPx: Math.min(...checks.filter((c) => c.smallestFont).map((c) => c.smallestFont!.px)),
      consoleErrors: checks.reduce((n, c) => n + c.consoleErrors.length, 0),
      failedRequests: checks.reduce((n, c) => n + c.failedRequests.length, 0),
      cancelledPrefetches: checks.reduce((n, c) => n + c.cancelledRequests, 0),
      images: Object.fromEntries(checks.filter((c) => c.generated).map((c) => [`${c.page}@${c.width}`, c.images])),
      blockedExternalRequests: checks.reduce((n, c) => n + c.blockedExternalRequests.length, 0),
    },
  };
  await writeFile(path.join(outDir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
  console.log(JSON.stringify(run, null, 2));
} catch (error) {
  if (!(error instanceof DesignError)) throw error;
  console.error(`design:shots ${error.code}: ${error.message}`);
  process.exit(1);
}
