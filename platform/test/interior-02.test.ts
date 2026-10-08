/**
 * interior-02 — the second authored Template and its fictional site (ongyeol-interior-demo).
 *
 * [source]  the Template's working tree: declared identity and routes, the release gate (imports,
 *           identifiers, siteId literals, forbidden terms) over the tree as it is now, isolation from the
 *           first Template (no import either way, neither Template's source terms in the other) and no
 *           Template-owned static files.
 * [release] the site's pin: an immutable release that exists, verifies byte for byte, froze the
 *           provenance terms, passed every gate, and IS the working tree (no unreleased drift).
 * [package] the site's current package: built with that pin from the site's present data (identity
 *           recomputed here), QA pass, every page the fixture's data plans, no source term of either
 *           Template in any emitted text file, and no site of the first Template pinned to this one.
 *
 * Every expected value is a literal or is read from the site's own authored data — never recomputed
 * with the Template code under test. Reads only: builds nothing, writes nothing.
 *
 * Run AFTER `template:release interior-02@1` + `site:build ongyeol-interior-demo`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/interior-02.test.ts
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { prepareSiteInput } from "../build/site-build";
import { collectReleaseSources, gateTemplateSources, loadRelease, scanForbiddenTerms, verifyRelease } from "../release/release";
import { loadSiteInstance } from "../site/load";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-02/v1/template";
import { PORTFOLIO_PAGE_SIZE } from "../../templates/interior-02/v1/manifest/portfolio";

const repoRoot = process.cwd();
const TEMPLATE = "interior-02";
const OTHER_TEMPLATE = "interior-01";
const SITE = "ongyeol-interior-demo";
/** the fixed pages of the Template's route table (the list's later pages and the detail pages come from data) */
const FIXED_PAGES = ["index.html", "portfolio.html", "service.html", "about.html", "faq.html", "contact.html"] as const;
const TEXT_FILE = /\.(html|txt|js|css|json|xml|svg|map)$/;

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
const readJson = async (f: string) => JSON.parse(await readFile(path.join(repoRoot, f), "utf8"));
const exists = async (f: string) => stat(path.join(repoRoot, f)).then(() => true, () => false);
async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of (await readdir(path.join(dir, rel), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walkFiles(dir, next)));
    else if (entry.isFile()) out.push(next);
  }
  return out;
}
const templateDir = (id: string) => `templates/${id}/v1`;
const termsOf = async (id: string): Promise<string[]> => (await readJson(`${templateDir(id)}/provenance.json`)).forbiddenTerms;

// ----------------------------------------------------------------- source --
console.log("\n[source] the second Template's working tree");
await check("A declares its own identity (id, vertical, one major) and exactly its eight routes", () => {
  eq([template.id, template.vertical, /^1\.\d+\.\d+$/.test(template.version)], [TEMPLATE, "interior", true], "identity");
  eq(
    template.routes.map((r) => [r.key, r.path]),
    [
      ["home", "/"],
      ["portfolio.index", "/portfolio"],
      ["portfolio.page", "/portfolio/page/[n]"],
      ["portfolio.detail", "/portfolio/[slug]"],
      ["service", "/service"],
      ["about", "/about"],
      ["faq", "/faq"],
      ["contact", "/contact"],
    ],
    "routes",
  );
});
await check("B the release gate holds on the tree as it is now: imports, identifiers, no siteId literal, no source term", async () => {
  const siteIds = await readdir(path.join(repoRoot, "data/sites"));
  const findings = await gateTemplateSources(repoRoot, TEMPLATE, 1, siteIds, await termsOf(TEMPLATE));
  assert(findings.length === 0, JSON.stringify(findings).slice(0, 800));
});
await check("C the two Templates stand alone: no import reaches the other one, and neither holds the other's source terms", async () => {
  const hits: string[] = [];
  for (const [self, other] of [[TEMPLATE, OTHER_TEMPLATE], [OTHER_TEMPLATE, TEMPLATE]] as const) {
    const otherTerms = await termsOf(other);
    const dir = path.join(repoRoot, templateDir(self));
    for (const f of await walkFiles(dir)) {
      if (!/\.(tsx?|mjs|css|json)$/.test(f)) continue;
      const text = await readFile(path.join(dir, f), "utf8");
      for (const m of text.matchAll(/(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']([^"']+)["']/g)) {
        const spec = m[1]!;
        if (spec.includes(other) || (spec.startsWith(".") && !path.resolve(dir, path.dirname(f), spec).startsWith(dir + path.sep))) hits.push(`${self}/${f} imports ${spec}`);
      }
      if (f === "provenance.json") continue;
      hits.push(...scanForbiddenTerms(`${self}/${f}`, text, otherTerms).map((h) => `${h.file}: ${h.why}`));
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("D the Template ships no static files of its own (every image is a site asset) and names its source only in provenance.json", async () => {
  assert(!(await exists(`${templateDir(TEMPLATE)}/public`)), "templates/interior-02/v1/public exists");
  const dir = path.join(repoRoot, templateDir(TEMPLATE));
  const binary = (await walkFiles(dir)).filter((f) => /\.(png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp4|webm)$/i.test(f));
  eq(binary, [], "binary files in the Template");
  const terms = await termsOf(TEMPLATE);
  assert(terms.length >= 4, `provenance.json lists only ${terms.length} terms`);
  const hits = [];
  for (const f of await walkFiles(dir)) {
    if (f === "provenance.json") continue;
    hits.push(...scanForbiddenTerms(f, await readFile(path.join(dir, f), "utf8"), terms));
  }
  assert(hits.length === 0, JSON.stringify(hits).slice(0, 800));
});

// ---------------------------------------------------------------- release --
console.log("\n[release] the site's pin");
const site = await loadSiteInstance(repoRoot, SITE);
const pin = site.template;
await check("E the site pins an exact interior-02 release (id + full hash) that verifies byte for byte", async () => {
  eq([pin.templateId, pin.templateVersion], [TEMPLATE, template.version], "pin");
  const record = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
  eq(record.releaseHash, pin.releaseHash, "releaseHash");
  await verifyRelease(repoRoot, record);
});
await check("F the release froze the provenance terms and passed every gate", async () => {
  const record = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
  eq([...record.forbiddenTerms].sort(), [...(await termsOf(TEMPLATE))].sort(), "forbiddenTerms");
  const gates = Object.entries(record.gates);
  assert(gates.length > 0, "the release recorded no gate");
  eq(gates.filter(([, g]) => !g.pass).map(([k]) => k), [], "failed gates");
  assert(!record.files.some((f) => f.path.endsWith("provenance.json")), "provenance.json is inside the release");
});
await check("G the pinned release IS the working tree: same files, same bytes (no unreleased drift)", async () => {
  const record = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
  const { sources } = await collectReleaseSources(repoRoot, TEMPLATE, 1);
  const live: [string, string][] = [];
  for (const [rel, abs] of sources) live.push([rel, sha256(await readFile(abs))]);
  const released = new Map(record.files.map((f) => [f.path, f.sha256]));
  const drift = [
    ...live.filter(([rel, hash]) => released.get(rel) !== hash).map(([rel]) => (released.has(rel) ? `changed ${rel}` : `unreleased ${rel}`)),
    ...[...released.keys()].filter((rel) => !sources.has(rel)).map((rel) => `removed ${rel}`),
  ];
  assert(drift.length === 0, drift.slice(0, 12).join("\n"));
});

// ---------------------------------------------------------------- package --
console.log("\n[package] the site's current package");
const current = await readJson(`data/site-builds/${SITE}/current.json`);
const record = await readJson(`${current.packageDir}/build-record.json`);
const siteDir = path.join(repoRoot, current.packageDir, "site");
await check("H the current package was built with the pin, from the site's present data, and passed package QA", async () => {
  eq([record.siteId, record.status, record.parts.mode], [SITE, "success", "public"], "record");
  eq([record.template.templateId, record.template.releaseId, record.template.releaseHash], [pin.templateId, pin.releaseId, pin.releaseHash], "the package's Template");
  eq([record.qa.pass, record.qa.failures], [true, []], "package QA");
  const input = await prepareSiteInput({ repoRoot, siteId: SITE, mode: "public", at: record.at });
  eq([input.parts.siteSnapshotHash, input.buildInputId], [record.parts.siteSnapshotHash, current.buildInputId], "identity = the site's present data");
});
await check("I every page the fixture's data plans is emitted: the fixed pages, one detail per published project, the list's later pages", async () => {
  const projects: { slug: string; status: string }[] = (await readJson(`data/sites/${SITE}/content/projects.json`)).items;
  const published = projects.filter((p) => p.status === "published");
  assert(published.length > PORTFOLIO_PAGE_SIZE, `the fixture must fill more than one list page (${published.length} ≤ ${PORTFOLIO_PAGE_SIZE})`);
  const pages = Math.ceil(published.length / PORTFOLIO_PAGE_SIZE);
  const expected = [
    ...FIXED_PAGES,
    ...published.map((p) => `portfolio/${p.slug}.html`),
    ...Array.from({ length: pages - 1 }, (_, i) => `portfolio/page/${i + 2}.html`),
  ].sort();
  const emitted = (await walkFiles(siteDir)).filter((f) => f.endsWith(".html") && !/^(404|_not-found)\.html$/.test(f)).sort();
  eq(emitted, expected, "pages");
  for (const f of ["404.html", "robots.txt", "sitemap.xml"]) assert(await exists(path.join(current.packageDir, "site", f)), `${f} missing`);
});
await check("J no emitted text file holds a source term of either Template, the other Template's name, or a remote stylesheet / script / image", async () => {
  const terms = [...(await termsOf(TEMPLATE)), ...(await termsOf(OTHER_TEMPLATE)), OTHER_TEMPLATE];
  const own = new URL(site.identity.publicOrigin!).origin;
  const hits: string[] = [];
  for (const f of await walkFiles(siteDir)) {
    if (!TEXT_FILE.test(f)) continue;
    const text = await readFile(path.join(siteDir, f), "utf8");
    hits.push(...scanForbiddenTerms(f, text, terms).map((h) => `${h.file}: ${h.why}`));
    if (!f.endsWith(".html")) continue;
    for (const m of text.matchAll(/\s(?:src|href|srcset|poster|action)="(https?:)?\/\/([^"]*)"/g)) {
      const url = `${m[1] ?? "https:"}//${m[2]}`;
      if (!url.startsWith(`${own}/`) && url !== own) hits.push(`${f}: remote reference ${url.slice(0, 120)}`);
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("K interior-02 is pinned by its own site only: every other site stays on the first Template", async () => {
  const pins: Record<string, string> = {};
  for (const id of (await readdir(path.join(repoRoot, "data/sites"))).filter((d) => !d.startsWith(".")).sort()) pins[id] = (await loadSiteInstance(repoRoot, id)).template.templateId;
  eq(Object.entries(pins).filter(([, t]) => t === TEMPLATE).map(([id]) => id), [SITE], "sites on interior-02");
  eq([...new Set(Object.entries(pins).filter(([id]) => id !== SITE).map(([, t]) => t))], [OTHER_TEMPLATE], "the other sites' Template");
});

console.log(`\ninterior-02: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
