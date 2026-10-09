/**
 * interior-02 — the second authored Template, its fictional site (ongyeol-interior-demo) and its reuse
 * site (boost-interior-demo-02).
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
 * [reuse]   a second site on the SAME immutable release: its own identity, origin, content and theme
 *           as Site Data only, its own package, neither site's brand in the other's package, and the
 *           third-party script it declares (a per-site key) nowhere in the Template or its release.
 *
 * Every expected value is a literal or is read from the site's own authored data — never recomputed
 * with the Template code under test. Reads only: builds nothing, writes nothing.
 *
 * Run AFTER `template:release interior-02@1` + `site:build ongyeol-interior-demo` +
 * `site:build boost-interior-demo-02`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/interior-02.test.ts
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { prepareSiteInput } from "../build/site-build";
import { collectReleaseSources, gateTemplateSources, loadRelease, scanForbiddenTerms, verifyRelease } from "../release/release";
import { readPortfolioSource } from "../portfolio-sync/managed";
import { loadSiteInstance } from "../site/load";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-02/v1/template";
import { PORTFOLIO_PAGE_SIZE } from "../../templates/interior-02/v1/manifest/portfolio";
import { portfolioShell } from "../../templates/interior-02/v1/runtime/shell";

const repoRoot = process.cwd();
const TEMPLATE = "interior-02";
const OTHER_TEMPLATE = "interior-01";
/** A later Template with sites of its own (interior-03.test.ts): its sites are not this Template's either. */
const LATER_TEMPLATE = "interior-03";
const SITE = "ongyeol-interior-demo";
/** the same release under another brand: nothing but Site Data differs */
const REUSE_SITE = "boost-interior-demo-02";
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
await check("K interior-02 is pinned by its own two sites only: every other site stays on the first Template or on a later Template of its own", async () => {
  const pins: Record<string, string> = {};
  for (const id of (await readdir(path.join(repoRoot, "data/sites"))).filter((d) => !d.startsWith(".")).sort()) pins[id] = (await loadSiteInstance(repoRoot, id)).template.templateId;
  eq(Object.entries(pins).filter(([, t]) => t === TEMPLATE).map(([id]) => id), [REUSE_SITE, SITE].sort(), "sites on interior-02");
  // the first Template's sites, and the third Template's two sites (platform/test/interior-03.test.ts holds those to their own pins)
  eq([...new Set(Object.entries(pins).filter(([id]) => id !== SITE && id !== REUSE_SITE).map(([, t]) => t))].sort(), [OTHER_TEMPLATE, LATER_TEMPLATE].sort(), "the other sites' Templates");
});

// ------------------------------------------------------------------ reuse --
console.log("\n[reuse] a second site on the same release");
const reuse = await loadSiteInstance(repoRoot, REUSE_SITE);
const reuseCurrent = await readJson(`data/site-builds/${REUSE_SITE}/current.json`);
const reuseRecord = await readJson(`${reuseCurrent.packageDir}/build-record.json`);
const reuseSiteDir = path.join(repoRoot, reuseCurrent.packageDir, "site");
const textFiles = async (dir: string) => (await walkFiles(dir)).filter((f) => TEXT_FILE.test(f));
await check("L the reuse site pins the SAME release as the first site (id + full hash), and its current package was built with it from its present data, package QA pass", async () => {
  eq(reuse.template, pin, "pin");
  eq([reuseRecord.siteId, reuseRecord.status, reuseRecord.parts.mode], [REUSE_SITE, "success", "public"], "record");
  eq([reuseRecord.template.templateId, reuseRecord.template.releaseId, reuseRecord.template.releaseHash], [pin.templateId, pin.releaseId, pin.releaseHash], "the package's Template");
  eq([reuseRecord.qa.pass, reuseRecord.qa.failures], [true, []], "package QA");
  const input = await prepareSiteInput({ repoRoot, siteId: REUSE_SITE, mode: "public", at: reuseRecord.at });
  eq([input.parts.siteSnapshotHash, input.buildInputId], [reuseRecord.parts.siteSnapshotHash, reuseCurrent.buildInputId], "identity = the site's present data");
  assert(reuseCurrent.buildInputId !== current.buildInputId && reuseCurrent.packageDir !== current.packageDir, "the two sites share a package");
});
await check("M the two sites differ in Site Data only: identity, origin, projects, and theme values (the first site shows the Template defaults, the reuse site overrides declared tokens)", async () => {
  assert(reuse.siteId !== site.siteId && reuse.identity.brandName !== site.identity.brandName, "identity");
  assert(new URL(reuse.identity.publicOrigin!).origin !== new URL(site.identity.publicOrigin!).origin, "the two sites share an origin");
  const slugs = async (id: string): Promise<string[]> => (await readJson(`data/sites/${id}/content/projects.json`)).items.map((p: { slug: string }) => p.slug);
  const [a, b] = [await slugs(SITE), await slugs(REUSE_SITE)];
  eq(a.filter((s) => b.includes(s)), [], "project slugs in both sites");
  // the first site authors no theme.json (it shows the Template's default values); the reuse site overrides them
  assert(!(await exists(`data/sites/${SITE}/theme.json`)), "the first site authors a theme.json: compare the two documents instead");
  const defaults: Record<string, string> = (await readJson(`${templateDir(TEMPLATE)}/theme.default.json`)).tokens;
  const overrides: Record<string, string> = (await readJson(`data/sites/${REUSE_SITE}/theme.json`)).tokens;
  eq(Object.keys(overrides).filter((t) => !(t in defaults)), [], "tokens the Template does not declare");
  // the tonal roles a visitor sees first: page ground, the dark block colour, both accents
  for (const t of ["color.canvas", "color.action.primary", "color.accent.primary", "color.accent.secondary"]) {
    assert(typeof defaults[t] === "string" && typeof overrides[t] === "string", `${t} is not set on both sides`);
    assert(defaults[t] !== overrides[t], `${t}: the reuse site repeats the Template default (${defaults[t]})`);
  }
});
await check("N the reuse site's package: the pages its data plans, no source term of either Template, neither site's brand in the other's package", async () => {
  const projects: { slug: string; status: string }[] = (await readJson(`data/sites/${REUSE_SITE}/content/projects.json`)).items;
  const published = projects.filter((p) => p.status === "published");
  const pages = Math.ceil(published.length / PORTFOLIO_PAGE_SIZE);
  // Since 2026-10-10 the reuse site is published INCREMENTALLY (portfolio.source.json, publishing:
  // "incremental"): its package is a shell — the fixed pages plus the ONE detail shell the Template
  // declares — and its project pages are composed at publish time (held by portfolio-runtime.test.ts,
  // page by page against the last package that had them built in). A site that builds its own
  // portfolio is still held to one page per published project.
  const incremental = (await readPortfolioSource(path.join(repoRoot, "data/sites", REUSE_SITE))) === "incremental";
  const expected = incremental
    ? [...FIXED_PAGES, ...portfolioShell.pages.filter((p) => p.route === "portfolio.detail").map((p) => `${p.path.slice(1)}.html`)].sort()
    : [...FIXED_PAGES, ...published.map((p) => `portfolio/${p.slug}.html`), ...Array.from({ length: pages - 1 }, (_, i) => `portfolio/page/${i + 2}.html`)].sort();
  eq((await walkFiles(reuseSiteDir)).filter((f) => f.endsWith(".html") && !/^(404|_not-found)\.html$/.test(f)).sort(), expected, "pages");
  eq(reuseRecord.portfolioRuntime !== undefined, incremental, "the package carries the publisher's runtime documents exactly when the site is incremental");
  const terms = [...(await termsOf(TEMPLATE)), ...(await termsOf(OTHER_TEMPLATE)), OTHER_TEMPLATE];
  const hits: string[] = [];
  // a brand name, its Latin spelling and the site id each: none of them may cross into the other package
  const foreign: [string, string[]][] = [
    [reuseSiteDir, [site.identity.brandName, site.siteId, "온결", "ongyeol"]],
    [siteDir, [reuse.identity.brandName, reuse.siteId, "부스트", "boostinterior"]],
  ];
  for (const [dir, own] of [[siteDir, site.identity.brandName], [reuseSiteDir, reuse.identity.brandName]] as const) {
    assert((await readFile(path.join(dir, "index.html"), "utf8")).includes(own), `${own} is not in its own home page`);
  }
  for (const [dir, brand] of foreign) {
    for (const f of await textFiles(dir)) {
      const text = await readFile(path.join(dir, f), "utf8");
      if (dir === reuseSiteDir) hits.push(...scanForbiddenTerms(f, text, terms).map((h) => `${REUSE_SITE}/${h.file}: ${h.why}`));
      hits.push(...scanForbiddenTerms(f, text, brand).map((h) => `${path.basename(path.dirname(path.dirname(dir)))}/${h.file}: the other site's ${h.why}`));
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("O the third-party script the reuse site declares is Site Data: its host and key are in no Template or release file, in every page of its own package, and nowhere in the first site's package; no other remote reference", async () => {
  const scripts: { src: string; attrs?: Record<string, string> }[] = (await readJson(`data/sites/${REUSE_SITE}/scripts.json`)).headScripts;
  assert(scripts.length > 0, "the reuse site declares no head script");
  assert(!(await exists(`data/sites/${SITE}/scripts.json`)), "the first site declares head scripts too: this check assumes it does not");
  const needles = scripts.flatMap((sc) => [new URL(sc.src).host, ...Object.values(sc.attrs ?? {})]);
  const hits: string[] = [];
  const holds = (text: string) => needles.filter((n) => text.includes(n));
  const release = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
  const releaseDir = path.join(repoRoot, "data/template-releases", TEMPLATE, pin.releaseId);
  assert(release.files.length > 0, "the release lists no file");
  const scanned: Record<string, number> = {};
  for (const dir of [path.join(repoRoot, templateDir(TEMPLATE)), releaseDir, siteDir]) {
    for (const f of await walkFiles(dir)) {
      if (/(^|\/)(node_modules|\.next|out)\//.test(f) || (dir === siteDir && !TEXT_FILE.test(f))) continue;
      scanned[dir] = (scanned[dir] ?? 0) + 1;
      const found = holds(await readFile(path.join(dir, f), "utf8"));
      if (found.length) hits.push(`${path.relative(repoRoot, dir)}/${f}: ${found.join(", ")}`);
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
  // the scan read real trees: every file the release lists, and at least the Template's share of them in the working tree
  const ownShare = release.files.filter((r) => r.path.startsWith(`${templateDir(TEMPLATE)}/`)).length;
  assert(ownShare > 0 && (scanned[path.join(repoRoot, templateDir(TEMPLATE))] ?? 0) >= ownShare, `${templateDir(TEMPLATE)}: ${scanned[path.join(repoRoot, templateDir(TEMPLATE))] ?? 0} files scanned, the release lists ${ownShare}`);
  assert((scanned[releaseDir] ?? 0) >= release.files.length, `release: only ${scanned[releaseDir] ?? 0} files scanned`);
  const own = new URL(reuse.identity.publicOrigin!).origin;
  const declared = new Set(scripts.map((sc) => sc.src));
  for (const f of (await walkFiles(reuseSiteDir)).filter((p) => p.endsWith(".html"))) {
    const html = await readFile(path.join(reuseSiteDir, f), "utf8");
    for (const sc of scripts) {
      assert(html.includes(`src="${sc.src}"`), `${f}: the declared script ${sc.src} is missing`);
      for (const [k, v] of Object.entries(sc.attrs ?? {})) assert(html.includes(`${k}="${v}"`), `${f}: the declared attribute ${k} is missing`);
    }
    for (const m of html.matchAll(/\s(?:src|href|srcset|poster|action)="(https?:)?\/\/([^"]*)"/g)) {
      const url = `${m[1] ?? "https:"}//${m[2]}`;
      if (!url.startsWith(`${own}/`) && url !== own && !declared.has(url)) hits.push(`${f}: remote reference ${url.slice(0, 120)}`);
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});

// --------------------------------------------------------- corner widget --
console.log("\n[corner] the reuse site's third-party corner widget is Site Data (1.0.1)");
/** the Site Data declaration (settings.json, read as authored — never through the Template's manifest) */
const EXT_KEYS = ["width", "height", "right", "bottom"] as const;
const extOf = async (id: string): Promise<Record<string, unknown> | undefined> => (await readJson(`data/sites/${id}/settings.json`)).overrides?.["site.floater"]?.externalWidget;
await check("P the reuse site declares the widget's closed box as Site Data (site.floater.externalWidget: four positive integer px), the first site declares none", async () => {
  const ext = await extOf(REUSE_SITE);
  assert(ext && typeof ext === "object", `${REUSE_SITE} declares no site.floater.externalWidget`);
  eq(Object.keys(ext).sort(), [...EXT_KEYS].sort(), "keys");
  for (const k of EXT_KEYS) assert(Number.isInteger(ext[k]) && (ext[k] as number) > 0, `${k} is not a positive integer: ${JSON.stringify(ext[k])}`);
  eq((await readJson(`data/sites/${REUSE_SITE}/settings.json`)).overrides["site.floater"].contact, false, "the reuse site's own contact button stays off (the widget is the contact)");
  eq(await extOf(SITE), undefined, `${SITE} declares an external widget`);
});
await check("Q the reuse site's package marks every page for the widget (html[data-ext-widget] + the four --i2-ext-* custom properties = the declared numbers); no page of the first site's package carries the marker or a property", async () => {
  const ext = await extOf(REUSE_SITE);
  assert(ext, `${REUSE_SITE} declares no site.floater.externalWidget`);
  const expectStyle = `--i2-ext-w:${ext.width}px;--i2-ext-h:${ext.height}px;--i2-ext-right:${ext.right}px;--i2-ext-bottom:${ext.bottom}px`;
  const htmlTag = (html: string) => /<html\b[^>]*>/.exec(html)?.[0] ?? "";
  let reusePages = 0;
  for (const f of (await walkFiles(reuseSiteDir)).filter((p) => p.endsWith(".html") && !/^(404|_not-found)\.html$/.test(p))) {
    const tag = htmlTag(await readFile(path.join(reuseSiteDir, f), "utf8"));
    assert(/\sdata-ext-widget(=""|\s|>)/.test(tag), `${REUSE_SITE}/${f}: <html> has no data-ext-widget: ${tag.slice(0, 200)}`);
    assert(tag.includes(`style="${expectStyle}"`), `${REUSE_SITE}/${f}: <html> does not carry ${expectStyle}: ${tag.slice(0, 240)}`);
    reusePages++;
  }
  assert(reusePages >= FIXED_PAGES.length, `only ${reusePages} pages scanned in the reuse package`);
  let firstPages = 0;
  for (const f of (await walkFiles(siteDir)).filter((p) => p.endsWith(".html"))) {
    const html = await readFile(path.join(siteDir, f), "utf8");
    assert(!html.includes("data-ext-widget") && !html.includes("--i2-ext-"), `${SITE}/${f}: carries the corner-widget marker without declaring one`);
    firstPages++;
  }
  assert(firstPages >= FIXED_PAGES.length, `only ${firstPages} pages scanned in the first site's package`);
});
await check("R the Template knows no vendor: no source file of the Template names the widget's vendor, its key or either site, and its CSS reads the box through the custom properties only", async () => {
  const scripts: { src: string; attrs?: Record<string, string> }[] = (await readJson(`data/sites/${REUSE_SITE}/scripts.json`)).headScripts;
  const vendorHost = new URL(scripts[0]!.src).host; // e.g. vendor.example
  const vendorName = vendorHost.split(".")[0]!; // the brand word of the host
  const needles = ["boost", vendorName, ...scripts.flatMap((sc) => Object.values(sc.attrs ?? {})), SITE, REUSE_SITE];
  const dir = path.join(repoRoot, templateDir(TEMPLATE));
  const hits: string[] = [];
  let cssReadsExt = false;
  for (const f of await walkFiles(dir)) {
    if (f === "provenance.json") continue;
    const text = await readFile(path.join(dir, f), "utf8");
    const lower = text.toLowerCase();
    for (const n of needles) if (lower.includes(n.toLowerCase())) hits.push(`${f}: "${n}"`);
    if (f.endsWith(".css") && /html\[data-ext-widget\]/.test(text) && /var\(--i2-ext-(w|h|right|bottom)\)/.test(text)) cssReadsExt = true;
    // no site-specific coordinate: the declared numbers appear in no CSS rule under the marker
    if (f.endsWith(".css")) for (const m of text.matchAll(/html\[data-ext-widget\][^{]*\{([^}]*)\}/g)) assert(!/\b(64|18)px/.test(m[1]!), `${f}: a site's coordinate is hard-coded under html[data-ext-widget]: ${m[1]!.slice(0, 120)}`);
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
  assert(cssReadsExt, "no Template stylesheet reads the widget box through html[data-ext-widget] + var(--i2-ext-*)");
});

console.log(`\ninterior-02: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
