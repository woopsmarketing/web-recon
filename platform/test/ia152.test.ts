/**
 * Public demo SEO validation (interior-01 1.5.2) — docs/result/outreach-demo-151-to-152/:
 *   - the homepage has its own canonical; every canonical page carries OpenGraph from the SAME
 *     title / description / canonical, with the first home hero slide as og:image when it is a raster;
 *   - a new site-wide setting `site.seo.indexing` ("index" | "noindex", default "index") puts
 *     <meta name="robots" content="noindex"> on every page of a site that must not be indexed;
 *     robots.txt and the sitemap are unchanged (crawlers must be able to read the noindex);
 *   - boost-interior-demo (a fictional demo) is noindex, has its real public origin and the real
 *     contact address — all three are Site Data, none is Template code.
 * Browser behaviour (served <head>, the address on /contact + footer, mailto hand-off, long-inquiry
 * fallback) is exercised by scripts/template-platform-ia152-smoke.ts; this file asserts the
 * release, the site data, the built packages and the source shape.
 * Plus what must NOT have moved (against docs/result/outreach-demo-151-to-152/proof/before.json,
 * captured before the 1.5.2 work): every earlier release, platform/ runtime, the other site files.
 *
 * Pins are per site: the 1.5.2 cut re-pins ONLY boost-interior-demo. The fixtures keep their own
 * (1.5.1) pins and packages, and are asserted against their own pin; the 1.5.2 default (indexable,
 * no og:image for an SVG hero) is proven on a throwaway-root copy of a fixture (F2), never by
 * moving a fixture's pin.
 *
 * Run AFTER the 1.5.2 build of boost-interior-demo:
 *   tsx --tsconfig platform/tsconfig.json platform/test/ia152.test.ts
 */
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSite } from "../build/site-build";
import { loadRelease, verifyRelease } from "../release/release";
import { resolveEffectiveSettings } from "../settings/settings";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";
import { demoBuiltRelease, demoExpectedPages } from "./demo-rollout";
import { isIntegrationSurface } from "./integration-surface";
import { isPublishSurface } from "./publish-surface";
import { isPortfolioSyncSurface } from "./portfolio-sync-surface";
import { isRelease160Added, release160SurfaceBefore } from "./release-160-surface";
import { isRelease162Added, release162SurfaceBefore } from "./release-162-surface";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const FIXTURES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
const BEFORE_FILE = "docs/result/outreach-demo-151-to-152/proof/before.json";
const RELEASE_151 = "interior-01-1.5.1-6bbdd07eb9bf";
const TEMPLATE_REL = "templates/interior-01/v1";
/** the Template files 1.5.2 changed / added — nothing else in the release differs from 1.5.1 */
const CHANGED_TEMPLATE_FILES = ["app/layout.tsx", "app/page.tsx", "lib/seo.ts", "sections/HomeHero.tsx", "template.ts"].map((f) => `${TEMPLATE_REL}/${f}`);
const ADDED_TEMPLATE_FILES = ["sections/homeHeroData.ts"].map((f) => `${TEMPLATE_REL}/${f}`);
/** the demo's fallback copy, re-worded for any address: "{email}로" → "{email} 주소로" (…com로 reads wrong) */
const SLOT_WORDING = [
  ["afterSubmit", "메일 앱이 열리지 않으면 {email}로 보내 주세요.", "메일 앱이 열리지 않으면 {email} 주소로 보내 주세요."],
  ["tooLong", "아래 내용을 복사해 {email}로 보내 주세요.", "아래 내용을 복사해 {email} 주소로 보내 주세요."],
] as const;
/** the outreach values of the 1.5.2 re-pin (the task's decisions E / F / G) */
const DEMO_ORIGIN = "https://interior-demo.boostweb.co.kr";
const DEMO_EMAIL = "vnfm0580@gmail.com";

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));
const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};
async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === ".DS_Store") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}
const hashTree = async (dir: string, skip: (f: string) => boolean = () => false) =>
  Object.fromEntries(await Promise.all((await walkFiles(dir)).filter((f) => !skip(f)).map(async (f) => [f, sha256(await readFile(path.join(dir, f)))] as const)));
const stripScripts = (h: string) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
const headOf = (h: string) => /<head>([\s\S]*?)<\/head>/.exec(h)?.[1] ?? "";
const mainOf = (h: string) => /<main[\s\S]*<\/main>/.exec(h)?.[0] ?? "";
const headerOf = (h: string) => /<header class="i1-header"[\s\S]*?<\/header>/.exec(h)?.[0] ?? "";
const footerOf = (h: string) => /<footer[\s\S]*<\/footer>/.exec(stripScripts(h))?.[0] ?? "";
const locsOf = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
const attrs = (head: string, re: RegExp) => [...head.matchAll(re)].map((m) => m[1]!);
/** the SEO facts of one static HTML page, as written (attribute values stay HTML-escaped on both sides) */
function seoOf(html: string) {
  const head = headOf(html);
  return {
    title: attrs(head, /<title>([^<]*)<\/title>/g),
    description: attrs(head, /<meta name="description" content="([^"]*)"\/>/g),
    robots: attrs(head, /<meta name="robots" content="([^"]*)"\/>/g),
    canonical: attrs(head, /<link rel="canonical" href="([^"]*)"\/>/g),
    ogTitle: attrs(head, /<meta property="og:title" content="([^"]*)"\/>/g),
    ogDescription: attrs(head, /<meta property="og:description" content="([^"]*)"\/>/g),
    ogUrl: attrs(head, /<meta property="og:url" content="([^"]*)"\/>/g),
    ogType: attrs(head, /<meta property="og:type" content="([^"]*)"\/>/g),
    ogImage: attrs(head, /<meta property="og:image" content="([^"]*)"\/>/g),
    ogImageSize: [...attrs(head, /<meta property="og:image:width" content="([^"]*)"\/>/g), ...attrs(head, /<meta property="og:image:height" content="([^"]*)"\/>/g)],
    ogAny: attrs(head, /<meta property="(og:[^"]*)"/g),
  };
}
/** a static-export HTML file → its route path (index.html → /, about.html → /about) */
const routeOf = (f: string) => (f === "index.html" ? "/" : `/${f.replace(/\.html$/, "")}`);
const NOT_FOUND = ["404.html", "_not-found.html"];

const demoDir = path.join(repoRoot, "data/sites", DEMO);
const site = await readJson(path.join(demoDir, "site.json"));
const pin = site.template as { templateVersion: string; releaseId: string; releaseHash: string };
const ORIGIN = site.identity.publicOrigin as string;
const EMAIL = (await readJson(path.join(demoDir, "content/business.json"))).data.contact.email as string;
const packageOf = async (siteId: string) => path.join(repoRoot, (await readJson(path.join(repoRoot, "data/site-builds", siteId, "current.json"))).packageDir);
async function pagesOf(packageDir: string): Promise<Record<string, string>> {
  const s = path.join(packageDir, "site");
  const files = (await walkFiles(s)).filter((f) => f.endsWith(".html"));
  return Object.fromEntries(await Promise.all(files.map(async (f) => [f, await readFile(path.join(s, f), "utf8")] as const)));
}
const pkg = await packageOf(DEMO);
const record = await readJson(path.join(pkg, "build-record.json"));
const html = await pagesOf(pkg);
const before = await readJson(path.join(repoRoot, BEFORE_FILE));
const atCut = pin.templateVersion === "1.5.2"; // point-in-time proofs of the 1.5.2 re-pin
type Pin = { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };
const pinOf = async (s: string) => (await readJson(path.join(repoRoot, "data/sites", s, "site.json"))).template as Pin;
/** a fixture still on the pin it had when before.json was captured (1.5.2 re-pinned no fixture) */
const keptPin = async (s: string) => sha256(await readFile(path.join(repoRoot, "data/sites", s, "site.json"))) === before.fixtureSites[s]["site.json"];

// ------------------------------------------------------------- contract --
console.log("\n[contract] additive patch");
await check("S1 Template ≥ 1.5.2, same routes as 1.5.1; one new settings section site.seo = { indexing: index | noindex }, default index, no slots; every 1.5.1 site's settings still resolve and stay indexable; the demo's resolve to noindex; anything else fails", async () => {
  assert(versionAtLeast(template.version, "1.5.2"), template.version);
  const manifest151 = (await readFile(path.join(repoRoot, "data/template-releases/interior-01", RELEASE_151, "files", TEMPLATE_REL, "template.ts"), "utf8")).replace(/\s+/g, " ");
  for (const r of template.routes) assert(manifest151.includes(`{ key: "${r.key}", path: "${r.path}"`), `route ${r.key} not in 1.5.1`);
  eq(template.routes.length, 7, "route count");
  const seo = template.sections["site.seo"];
  eq([seo.defaults, Object.keys(seo.slots ?? {})], [{ indexing: "index" }, []], "site.seo declaration");
  eq(seo.schema.safeParse({ indexing: "noindex" }).success && seo.schema.safeParse({ indexing: "index" }).success, true, "both values");
  for (const bad of [{ indexing: "none" }, { indexing: "noindex", follow: false }, {}]) assert(!seo.schema.safeParse(bad).success, `accepted ${JSON.stringify(bad)}`);
  eq(resolveEffectiveSettings(template, before.settingsJson)["site.seo"], { indexing: "index" }, "the demo's pre-cut settings (no site.seo) = index");
  for (const s of FIXTURES) eq(resolveEffectiveSettings(template, await readJson(path.join(repoRoot, "data/sites", s, "settings.json")))["site.seo"], { indexing: "index" }, `${s} = index`);
  eq(resolveEffectiveSettings(template, await readJson(path.join(demoDir, "settings.json")))["site.seo"], { indexing: "noindex" }, "demo = noindex");
  let threw = false;
  try {
    resolveEffectiveSettings(template, { ...before.settingsJson, overrides: { ...before.settingsJson.overrides, "site.seo": { indexing: "hidden" } } });
  } catch {
    threw = true;
  }
  assert(threw, "an invalid indexing value resolved");
});

// -------------------------------------------------------------- release --
console.log("\n[release] every earlier release immutable, a Template-only patch");
await check("R1 every release dir captured before the cut (1.0.0 … 1.5.1) verifies and is byte-identical to the capture; the only new dir is one 1.5.2 (+ later releases' own)", async () => {
  const dirs = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d.startsWith("interior-01-")).sort();
  const added = dirs.filter((d) => !before.releaseDirs.includes(d));
  const versionOf = (d: string) => d.split("-")[2]!;
  eq(added.filter((d) => versionOf(d) === "1.5.2").length, 1, "new 1.5.2 release dirs");
  for (const d of added) assert(versionAtLeast(versionOf(d), "1.5.2"), `${d}: an older version added after the capture`);
  eq(before.releaseDirs.length, 11, "captured release dirs");
  for (const d of before.releaseDirs as string[]) {
    assert(dirs.includes(d), `${d} missing`);
    eq(await hashTree(path.join(repoRoot, "data/template-releases/interior-01", d)), before.releases[d], `${d} files`);
    await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", d));
  }
});
await check("R2 the 1.5.2 release = the 1.5.1 release except exactly the five declared Template files + one new (sections/homeHeroData.ts) (platform runtime, package.json, lockfile byte-identical); every platform/ file captured before the work is unchanged", async () => {
  const d152 = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).find((d) => d.startsWith("interior-01-1.5.2-"))!;
  const r152 = await loadRelease(repoRoot, "interior-01", d152);
  await verifyRelease(repoRoot, r152);
  const a = await hashTree(path.join(repoRoot, "data/template-releases/interior-01", RELEASE_151, "files"));
  const b = await hashTree(path.join(repoRoot, "data/template-releases/interior-01", d152, "files"));
  eq(Object.keys(a).filter((f) => !(f in b)), [], "removed files");
  eq(Object.keys(b).filter((f) => !(f in a)), ADDED_TEMPLATE_FILES, "added files");
  eq(Object.keys(b).filter((f) => f in a && a[f] !== b[f]), CHANGED_TEMPLATE_FILES, "changed files");
  // files the later 1.6.0 cut changed / added (V0.2 schema + widget seam) are judged at their pre-1.6.0
  // hash / excluded (release-160-surface.ts); their current content is held by integration.test.ts I2b.
  // The 1.6.2 cut's surface (the inquiry seam + door, release-162-surface.ts) is treated the same way.
  // The 1.6.3 cut changed only the door (site/inquiry-client.ts), which that surface already excludes
  // as added by 1.6.2 — no further surface.
  const now = await hashTree(path.join(repoRoot, "platform"), (f) => f.startsWith("test/"));
  for (const [f, h] of Object.entries({ ...(await release160SurfaceBefore(repoRoot)), ...release162SurfaceBefore() })) if (f in now) now[f] = h;
  // the post-build publish surface never feeds a build, render or release (publish-surface.ts) — excluded as in ia150/step6
  eq(Object.keys(before.platformFiles).filter((f) => now[f] !== before.platformFiles[f] && !isIntegrationSurface(f) && !isPublishSurface(f)), [], "platform files changed");
  eq(Object.keys(now).filter((f) => !(f in before.platformFiles) && !isIntegrationSurface(f) && !isPublishSurface(f) && !isPortfolioSyncSurface(f) && !isRelease160Added(f) && !isRelease162Added(f)), [], "platform files added");
});
await check("R3 the demo pins a verified release ≥ 1.5.2 and its current package was built with it (QA pass), rollback = the pre-cut package; every fixture's current package was built with the fixture's OWN verified pin — a fixture the cut did not re-pin still serves its pre-cut package (pointers untouched, nothing rotated away)", async () => {
  assert(versionAtLeast(pin.templateVersion, "1.5.2"), pin.templateVersion);
  for (const s of [DEMO, ...FIXTURES]) {
    const sp = await pinOf(s);
    const rel = await loadRelease(repoRoot, "interior-01", sp.releaseId);
    await verifyRelease(repoRoot, rel);
    eq([rel.releaseHash, rel.templateVersion], [sp.releaseHash, sp.templateVersion], `${s}: pin`);
    const rec = await readJson(path.join(await packageOf(s), "build-record.json"));
    // the demo's package: its pin once steady; in the Portfolio V0.2 pre-publish window, the frozen
    // V0.1 package's release (demo-rollout.ts). Fixtures are always held to their own pin.
    const built = s === DEMO ? await demoBuiltRelease(repoRoot, sp) : sp;
    eq([rec.template.releaseId, rec.template.releaseHash, rec.status, rec.qa.pass], [built.releaseId, built.releaseHash, "success", true], `${s}: build record`);
    if (s === DEMO) {
      if (!atCut) continue; // a later re-pin rotates the rollback pointer: theirs to assert
      const previous = await readJson(path.join(repoRoot, "data/site-builds", s, "previous.json"));
      if (previous.buildInputId !== before.currentPointer.buildInputId) {
        // a later build of the SAME pin rotated the rollback pointer: which package is the rollback is that later work's to assert (integration.test.ts G4)
        const history = (await readFile(path.join(repoRoot, "data/site-builds", s, "history.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as { buildInputId: string; status: string });
        assert(history.some((h) => h.buildInputId === before.currentPointer.buildInputId && h.status === "success"), `${s}: history has no successful build of the pre-cut package`);
        const prevRecord = await readJson(path.join(repoRoot, previous.packageDir, "build-record.json"));
        eq([rec.template.releaseId, prevRecord.template.releaseId], [sp.releaseId, sp.releaseId], `${s}: current + rollback package release = the pin`);
      } else {
        eq(previous.buildInputId, before.currentPointer.buildInputId, `${s}: previous = the package current before the cut`);
        eq((await readJson(path.join(repoRoot, previous.packageDir, "build-record.json"))).template.releaseId, RELEASE_151, `${s}: rollback package release`);
      }
    } else if (await keptPin(s)) {
      eq((await readJson(path.join(repoRoot, "data/site-builds", s, "current.json"))).buildInputId, before.fixturePointers[s].buildInputId, `${s}: current = the pre-cut package`);
    }
  }
  if (atCut) {
    // mixed pins are the normal state: the cut moved the demo alone
    for (const s of FIXTURES) eq([await keptPin(s), (await pinOf(s)).releaseId], [true, RELEASE_151], `${s}: kept its 1.5.1 pin`);
  }
});

// ------------------------------------------------------------ site data --
console.log("\n[site data] only the pin, the public origin, the address and the indexing setting moved");
await check("D1 every demo site file is byte-identical to the pre-cut capture except site.json (pin + publicOrigin), settings.json (+ site.seo noindex), content/business.json (contact.email) and slots.json (exactly the two {email} sentences re-worded)", async () => {
  if (!atCut) return;
  const files = await walkFiles(demoDir);
  // integration.json (the site's first-party integration opt-in) is a builder input outside this
  // snapshot, added after the capture — asserted by integration.test.ts B2
  eq(files.filter((f) => f !== "integration.json"), Object.keys(before.siteFiles).sort(), "file list");
  const changed = [];
  for (const f of files) {
    if (f === "integration.json") continue;
    if (sha256(await readFile(path.join(demoDir, f))) !== before.siteFiles[f]) changed.push(f);
  }
  eq(changed.sort(), ["content/business.json", "settings.json", "site.json", "slots.json"], "changed files");
  const slots = await readJson(path.join(demoDir, "slots.json"));
  const want = structuredClone(before.slotsJson);
  for (const [k, from, to] of SLOT_WORDING) {
    assert(want.values["contact.page"][k].endsWith(from), `pre-cut ${k}`);
    want.values["contact.page"][k] = want.values["contact.page"][k].replace(from, to);
  }
  eq(slots, want, "slots.json");
  eq({ ...site, template: null, identity: { ...site.identity, publicOrigin: null } }, { ...before.siteJson, template: null, identity: { ...before.siteJson.identity, publicOrigin: null } }, "site.json outside the pin + origin");
  eq([site.identity.publicOrigin, before.siteJson.identity.publicOrigin], [DEMO_ORIGIN, "https://boost-interior-demo.example"], "publicOrigin");
  const settings = await readJson(path.join(demoDir, "settings.json"));
  eq(settings, { ...before.settingsJson, overrides: { ...before.settingsJson.overrides, "site.seo": { indexing: "noindex" } } }, "settings.json");
  const business = await readJson(path.join(demoDir, "content/business.json"));
  eq(business, { ...before.businessJson, data: { ...before.businessJson.data, contact: { email: DEMO_EMAIL } } }, "business.json");
});
await check("D2 every fixture's site files are byte-identical to the capture, except (only after a later re-pin of that fixture) site.json's pin", async () => {
  for (const s of FIXTURES) {
    const now = await hashTree(path.join(repoRoot, "data/sites", s));
    eq(Object.keys(now), Object.keys(before.fixtureSites[s]), `${s}: file list`);
    const changed = Object.keys(now).filter((f) => now[f] !== before.fixtureSites[s][f]);
    eq(changed, (await keptPin(s)) ? [] : ["site.json"], `${s}: changed files`);
  }
});

// -------------------------------------------------------------- package --
console.log("\n[package] the built demo pages");
await check("P1 every page except the 404: exactly one robots meta = noindex, exactly one canonical = the public origin + its path (the homepage included), OpenGraph from the same title / description / canonical, og:image = the first hero slide (absolute, 2400 × 1350)", async () => {
  eq(ORIGIN, DEMO_ORIGIN, "demo origin");
  const heroSrc = /<img class="i1-hero__img" src="([^"]+)"/.exec(html["index.html"]!)?.[1];
  assert(heroSrc && /^\/assets\/[0-9a-f]{20}\.jpg$/.test(heroSrc), `hero src ${heroSrc}`);
  const pages = Object.keys(html).filter((f) => !NOT_FOUND.includes(f));
  eq(pages.sort(), (await demoExpectedPages(repoRoot)).pages.filter((f) => !NOT_FOUND.includes(f)), "pages with a canonical = every expected page but Next's error pages");
  for (const f of pages) {
    const s = seoOf(html[f]!);
    const want = `${ORIGIN}${routeOf(f)}`;
    eq(s.robots, ["noindex"], `${f}: robots`);
    eq(s.canonical.length, 1, `${f}: canonical count`);
    // Next writes the root canonical as the bare origin — the same URL as origin + "/"
    eq(new URL(s.canonical[0]!).href, routeOf(f) === "/" ? `${ORIGIN}/` : want, `${f}: canonical`);
    eq([s.title.length, s.description.length], [1, 1], `${f}: one title, one description`);
    eq([s.ogTitle, s.ogDescription, s.ogUrl, s.ogType], [s.title, s.description, s.canonical, ["website"]], `${f}: OpenGraph`);
    eq([s.ogImage, s.ogImageSize], [[`${ORIGIN}${heroSrc}`], ["2400", "1350"]], `${f}: og:image`);
  }
});
await check("P2 the 404 page: noindex (exactly the framework's tag + the site's), no canonical, no OpenGraph", () => {
  for (const f of NOT_FOUND) {
    const s = seoOf(html[f]!);
    // Next's not-found page writes its own noindex; the site-wide noindex adds a second, identical one (harmless, known)
    eq(s.robots, ["noindex", "noindex"], `${f}: robots`);
    eq([s.canonical, s.ogAny], [[], []], `${f}: canonical / OpenGraph`);
  }
});
await check("P3 robots.txt allows the crawl (the noindex must be readable) and names the origin's sitemap; every sitemap <loc> is on the public origin; the page set, sitemap paths and robots.txt equal the 1.5.1 package's with only the origin moved", async () => {
  if (!(await readdir(path.join(repoRoot, before.currentPointer.packageDir, "site")).catch(() => null))) {
    console.log("       skipped: the pre-cut 1.5.1 package was pruned by a later build of the demo (keep-2); this proof stands at the cut commit");
    return;
  }
  const robots = await readFile(path.join(pkg, "site/robots.txt"), "utf8");
  eq(robots, `User-Agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`, "robots.txt");
  const sitemap = await readFile(path.join(pkg, "site/sitemap.xml"), "utf8");
  const locs = locsOf(sitemap);
  assert(locs.length === 13 && locs.every((l) => new URL(l).origin === ORIGIN), `sitemap: ${locs.length} locs`);
  if (!atCut) return;
  const prevDir = path.join(repoRoot, before.currentPointer.packageDir);
  const oldOrigin = before.siteJson.identity.publicOrigin as string;
  eq(Object.keys(html).sort(), Object.keys(await pagesOf(prevDir)).sort(), "HTML set");
  eq(sitemap, (await readFile(path.join(prevDir, "site/sitemap.xml"), "utf8")).replaceAll(oldOrigin, ORIGIN), "sitemap");
  eq(robots, (await readFile(path.join(prevDir, "site/robots.txt"), "utf8")).replaceAll(oldOrigin, ORIGIN), "robots.txt");
});
await check("P4 the <body> did not move: every page's header, <main> and footer equal the 1.5.1 package's with only the address changed", async () => {
  if (!(await readdir(path.join(repoRoot, before.currentPointer.packageDir, "site")).catch(() => null))) {
    console.log("       skipped: the pre-cut 1.5.1 package was pruned by a later build of the demo (keep-2); this proof stands at the cut commit");
    return;
  }
  if (!atCut) return;
  const prev = await pagesOf(path.join(repoRoot, before.currentPointer.packageDir));
  const oldEmail = before.businessJson.data.contact.email as string;
  for (const [f, h] of Object.entries(html)) {
    const p = prev[f]!.replaceAll(oldEmail, EMAIL);
    assert(mainOf(h) === mainOf(p), `${f}: <main> differs from 1.5.1`);
    assert(headerOf(h) === headerOf(p), `${f}: header differs`);
    assert(footerOf(h) === footerOf(p), `${f}: footer differs`);
  }
});
await check("P5 the address: the footer mailto on every page and the /contact direct address are the site's business email; a mail hand-off form's fallback copy names it via {email} — an online form (the site declares an inquiry endpoint, ≥ the 1.6.2 re-pin) ships no hand-off copy at all, only its endpoint and — built from ≥ 1.6.3 — the address once more, as the one other contact channel its alert may list; no page, payload, sitemap or script of the package still carries the old address or origin", async () => {
  eq(EMAIL, DEMO_EMAIL, "demo address");
  for (const [f, h] of Object.entries(html)) {
    const mailtos = [...h.matchAll(/href="(mailto:[^"]*)"/g)].map((m) => m[1]);
    eq(mailtos, f === "contact.html" ? [`mailto:${EMAIL}`, `mailto:${EMAIL}`] : [`mailto:${EMAIL}`], `${f}: mailto links`);
  }
  assert(mainOf(html["contact.html"]!).includes(`<dt>이메일</dt><dd><a href="mailto:${EMAIL}">${EMAIL}</a></dd>`), "/contact direct address");
  if (existsSync(path.join(demoDir, "inquiry.json"))) {
    // the demo's form posts to its declared endpoint: the island's props carry that endpoint (once)
    // and none of the mail hand-off copy. Up to the 1.6.2 package the address stayed on the page as
    // the direct address only; a package built from ≥ 1.6.3 carries it once more in the form's
    // props, as the other contact channel the alert lists after a failure another press may not
    // cure — for the demo exactly its business email under the page's own e-mail label (it sets
    // neither fallback link slot). A link inside the alert, never a hand-off, and not rendered
    // before such a failure (inquiry163.test.ts TPL-2 / TPL-4 / PKG-3 own the behaviour).
    const endpoint = (await readJson(path.join(demoDir, "inquiry.json"))).endpoint as string;
    eq(html["contact.html"]!.split(`\\"online\\":{\\"endpoint\\":\\"${endpoint}\\"`).length - 1, 1, "/contact: the form's props (RSC) carry the declared endpoint, once");
    eq(html["contact.html"]!.split(endpoint).length - 1, 1, "/contact: the endpoint appears nowhere else on the page");
    for (const gone of ["주소로 보내 주세요", "메일 앱", "복사", "mailSubject", "afterSubmit", "tooLong"]) assert(!html["contact.html"]!.includes(gone), `/contact: mail hand-off copy "${gone}" in an online form's page`);
    for (const [f, h] of Object.entries(html)) if (f !== "contact.html") assert(!h.includes(endpoint), `${f}: carries the inquiry endpoint`);
    const emailLabel = (await readJson(path.join(demoDir, "slots.json"))).values["contact.page"].emailLabel as string;
    assert(typeof emailLabel === "string" && emailLabel.length > 0, "the demo's contact.page emailLabel");
    if (versionAtLeast(record.template.templateVersion, "1.6.3")) {
      eq(html["contact.html"]!.split(`\\"fallback\\":[{\\"name\\":\\"${emailLabel}\\",\\"text\\":\\"${EMAIL}\\",\\"href\\":\\"mailto:${EMAIL}\\"}]`).length - 1, 1, "/contact: the form's props (RSC) list exactly one other contact channel — the business email — once");
      eq(html["contact.html"]!.split('\\"fallback\\":').length - 1, 1, "/contact: …and carry no second channel list");
    } else {
      assert(!html["contact.html"]!.includes('\\"fallback\\":'), "/contact: a form built before 1.6.3 carries no contact channels");
    }
    assert(!/data-inquiry-contacts|i1-form__contacts/.test(stripScripts(html["contact.html"]!)), "/contact: the contact channels are not in the server HTML (only after a failure)");
  } else {
    assert(html["contact.html"]!.includes(`아래 내용을 복사해 ${EMAIL} 주소로 보내 주세요.`) && html["contact.html"]!.includes(`메일 앱이 열리지 않으면 ${EMAIL} 주소로 보내 주세요.`), "/contact: the status copy (RSC props) names the address");
  }
  assert(!html["contact.html"]!.includes("{email}"), "/contact: an unsubstituted {email}");
  const oldEmail = before.businessJson.data.contact.email as string;
  const oldOrigin = before.siteJson.identity.publicOrigin as string;
  const hits: string[] = [];
  for (const f of await walkFiles(path.join(pkg, "site"))) {
    if (!/\.(html|txt|xml|js|json|css)$/.test(f)) continue;
    const t = await readFile(path.join(pkg, "site", f), "utf8");
    if (t.includes(oldEmail) || t.includes(oldOrigin) || t.includes("boost-interior-demo.example")) hits.push(f);
  }
  eq(hits, [], "files with the old address / origin");
});

// ------------------------------------------------------------- fixtures --
console.log("\n[fixtures] each on its own pin; the 1.5.2 default proven on a throwaway copy");
/** A fixture's pages as its Template version renders them: ≥ 1.5.2 = the new default shape, else the 1.5.1 shape (no home canonical, no OpenGraph). */
function assertFixturePages(label: string, pages: Record<string, string>, origin: string, templateVersion: string) {
  const v152 = versionAtLeast(templateVersion, "1.5.2");
  assert(/<img class="i1-hero__img" src="\/assets\/[0-9a-f]{20}\.svg"/.test(pages["index.html"]!), `${label}: hero is not an SVG`);
  for (const [f, h] of Object.entries(pages)) {
    const seo = seoOf(h);
    if (NOT_FOUND.includes(f)) {
      eq([seo.robots, seo.canonical, seo.ogAny], [["noindex"], [], []], `${label}/${f}: 404 head`);
      continue;
    }
    eq(seo.robots, [], `${label}/${f}: robots`);
    if (f === "index.html" && !v152) {
      eq([seo.canonical, seo.ogAny], [[], []], `${label}: a 1.5.1 home has no canonical / OpenGraph`);
      continue;
    }
    eq(seo.canonical.length, 1, `${label}/${f}: canonical count`);
    if (f === "index.html") eq(new URL(seo.canonical[0]!).href, `${origin}/`, `${label}: home canonical`);
    if (v152) eq([seo.ogTitle, seo.ogDescription, seo.ogUrl, seo.ogType, seo.ogImage], [seo.title, seo.description, seo.canonical, ["website"], []], `${label}/${f}: OpenGraph`);
    else eq(seo.ogAny, [], `${label}/${f}: a 1.5.1 page has no OpenGraph`);
  }
}
const bodyEq = (label: string, a: Record<string, string>, b: Record<string, string>) => {
  eq(Object.keys(a).sort(), Object.keys(b).sort(), `${label}: HTML set`);
  for (const [f, h] of Object.entries(a)) assert(mainOf(h) === mainOf(b[f]!) && headerOf(h) === headerOf(b[f]!) && footerOf(h) === footerOf(b[f]!), `${label}/${f}: body differs from 1.5.1`);
};
await check("F1 every fixture's current package matches ITS OWN pin: a 1.5.1 pin = the 1.5.1 head (no site robots meta, no home canonical, no OpenGraph); a pin ≥ 1.5.2 = the default shape (indexable, home canonical, OpenGraph, no og:image for an SVG hero)", async () => {
  for (const s of FIXTURES) {
    const dir = await packageOf(s);
    const origin = (await readJson(path.join(repoRoot, "data/sites", s, "site.json"))).identity.publicOrigin as string;
    const rec = await readJson(path.join(dir, "build-record.json"));
    eq(rec.template.templateVersion, (await pinOf(s)).templateVersion, `${s}: package vs pin`);
    assertFixturePages(s, await pagesOf(dir), origin, rec.template.templateVersion);
  }
});
await check("F2 the 1.5.2 default on a throwaway-root copy of fixture-small re-pinned to 1.5.2 (data/sites + data/site-builds untouched): no site robots meta, a homepage canonical, OpenGraph = title / description / canonical, no og:image (SVG hero = the raster guard); header, <main>, footer, robots.txt and sitemap equal its 1.5.1 package's", async () => {
  const S = "fixture-small";
  // the stored 1.5.2 release itself — not the demo's pin, which has since moved on (1.6.0)
  const d152 = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).find((d) => d.startsWith("interior-01-1.5.2-"))!;
  const rel152 = await loadRelease(repoRoot, "interior-01", d152);
  await verifyRelease(repoRoot, rel152);
  eq(rel152.templateVersion, "1.5.2", "the 1.5.2 cut");
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "ia152-root-"));
  try {
    await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
    await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
    await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
    const dir = path.join(tmpRoot, "data/sites", S);
    await cp(path.join(repoRoot, "data/sites", S), dir, { recursive: true });
    const siteJson = await readJson(path.join(dir, "site.json"));
    siteJson.template = { templateId: "interior-01", templateVersion: rel152.templateVersion, releaseId: rel152.releaseId, releaseHash: rel152.releaseHash };
    await writeFile(path.join(dir, "site.json"), `${JSON.stringify(siteJson, null, 2)}\n`);
    const current = await packageOf(S);
    const r = await buildSite({ repoRoot: tmpRoot, siteId: S, at: (await readJson(path.join(current, "build-record.json"))).at });
    assert(r.status === "built", r.status);
    assert(r.record.qa.pass && r.record.template.releaseId === rel152.releaseId, `${r.record.template.releaseId} qa ${r.record.qa.pass}`);
    const pages = await pagesOf(r.packageDir);
    assertFixturePages(`${S}@1.5.2`, pages, siteJson.identity.publicOrigin, "1.5.2");
    bodyEq(`${S}@1.5.2`, pages, await pagesOf(current));
    for (const f of ["robots.txt", "sitemap.xml"]) eq(await readFile(path.join(r.packageDir, "site", f), "utf8"), await readFile(path.join(current, "site", f), "utf8"), `${S}@1.5.2: ${f}`);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

// --------------------------------------------------------------- source --
console.log("\n[source] one SEO source, no customer in the Template");
await check("J1 pageMetadata derives canonical + OpenGraph from one { title, description, path } (og:url = canonical), only with a public origin, og:image only a raster; the homepage calls it with the layout's title / description; the layout's robots reads site.seo; no siteId, origin or address in the Template", async () => {
  const seo = await readFile(path.join(repoRoot, TEMPLATE_REL, "lib/seo.ts"), "utf8");
  assert(seo.includes("if (!ctx.identity.publicOrigin) {") && seo.includes("alternates: { canonical: page.path }") && seo.includes("url: page.path,") && seo.includes("title: page.title,"), "one source");
  assert(seo.includes("/\\.(jpe?g|png|webp|gif)$/.test(first.src)"), "raster only");
  assert(seo.includes('description: ogDescription') && seo.includes('page.description || ctx.content.getSingleton("business").summary'), "og:description = the effective meta description");
  // the hero's data comes from a plain module: metadata must not pull the client carousel into every page
  assert(seo.includes('from "../sections/homeHeroData"') && !seo.includes('"../sections/HomeHero"'), "seo imports the hero data module");
  const heroData = await readFile(path.join(repoRoot, TEMPLATE_REL, "sections/homeHeroData.ts"), "utf8");
  for (const m of heroData.matchAll(/^import (.*) from "([^"]+)";$/gm)) assert(!m[2]!.startsWith("../components/") || m[1]!.startsWith("type "), `homeHeroData.ts imports a component value: ${m[0]}`);
  const page = await readFile(path.join(repoRoot, TEMPLATE_REL, "app/page.tsx"), "utf8");
  assert(page.includes('pageMetadata(ctx, { title: ctx.identity.brandName, description: ctx.content.getSingleton("business").summary, path: "/" })'), "home metadata");
  const layout = await readFile(path.join(repoRoot, TEMPLATE_REL, "app/layout.tsx"), "utf8");
  assert(layout.includes('ctx.mode === "preview" ? { index: false, follow: false } : ctx.settings["site.seo"].indexing === "noindex" ? { index: false } : undefined'), "robots");
  for (const f of await walkFiles(path.join(repoRoot, TEMPLATE_REL))) {
    if (f.startsWith("node_modules/") || f.startsWith(".next/")) continue;
    const t = await readFile(path.join(repoRoot, TEMPLATE_REL, f), "utf8");
    for (const lit of [DEMO, DEMO_ORIGIN, "interior-demo.boostweb", DEMO_EMAIL, "@gmail"]) assert(!t.includes(lit), `${f}: "${lit}"`);
  }
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
