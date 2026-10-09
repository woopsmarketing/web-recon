/**
 * Preview renderer kit — parity with a real build (platform/preview, `pnpm site:preview-kit`).
 *
 * A kit (renderer.mjs + kit.json) is generated from a site's shell and its PINNED Template Release and
 * is called by another application to show ONE unpublished project "as the homepage will show it".
 * This test is the proof that what it shows is what the site will serve:
 *
 * [kit]      the kit of the demo: generated twice → identical bytes; generated from the development
 *            checkout too (where the demo's portfolio is not present and the site loader refuses it);
 *            renderer.mjs has no import of any kind and exports exactly `renderProjectPreview` + `kit`;
 *            the embedded stylesheet is the release's styles/template.css, byte for byte.
 * [build]    ONE real build in a throwaway root, made the way a published portfolio is made: an export
 *            document of the demo's QA corpus (19 records, platform/test/portfolio-qa-corpus.ts) →
 *            the REAL generator (portfolio-sync/generate.ts: planManagedPortfolio + applyFilePlan) →
 *            the REAL site build with the pinned release. data/sites and data/site-builds are never
 *            touched. (The build cannot be shared with detail-facts.test.ts: each test file is its own
 *            process and its own throwaway root.)
 * [parity]   for EVERY record of that export, the SAME export record given to the kit:
 *              <main> of the built detail page   ==  <main> of the kit's detailHtml   (byte for byte)
 *              the site header and footer        ==  the kit's                        (byte for byte)
 *              the record's card on /portfolio   ==  the card of the kit's cardHtml   (D2 aside)
 * [document] each kit document is complete and inert: doctype, charset, viewport, noindex, the three
 *            styles, no script, no handler, nothing the browser fetches but the caller's image URLs.
 * [contract] a refused record is `{ ok: false, problems }`, never an exception; a draft renders; the
 *            renderer runs in plain Node with the clock, randomness, timers, network and `process`
 *            trapped, and gives the same bytes there.
 *
 * NORMALISATION — none. The compared regions are equal BYTE FOR BYTE:
 *   - <main>, the site header and the site footer are cut out of both documents as text and compared
 *     as strings: every element, attribute, attribute order, entity, text node and even React's
 *     `<!-- -->` text separators (the kit renders with renderToString for exactly that reason: a
 *     browser shapes each text node on its own, so the separators decide sub-pixel kerning);
 *   - they are ALSO parsed (parse5) and compared as serialised DOM, comments included, so that the
 *     textual cut cannot be what makes them equal. Nothing is dropped, collapsed or sorted.
 * REAL DIFFERENCES — each is asserted as exactly what it is:
 *   D1  Outside <main>, the built <body> also holds Next's own nodes: one empty `<div hidden="">`
 *       (its metadata outlet), empty Suspense marker comments beside it and after <main>, and its
 *       <script> elements. The kit's <body> is header · main · footer and nothing else.
 *   D2  A card's cover `loading` attribute is a function of the card's POSITION in a list (the first
 *       three are "eager", the rest "lazy"), not of the record. A kit renders the card alone, as a
 *       first card ("eager"). For a card further down the built list the test requires: built "lazy",
 *       kit "eager", everything else identical.
 *   D3  The <head> is different by design (inline styles and noindex,nofollow instead of the page's
 *       stylesheet link, scripts and SEO metadata) and is checked on its own terms in [document].
 *
 *   tsx --tsconfig platform/tsconfig.json platform/test/preview-parity.test.ts
 */
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse, serializeOuter, type DefaultTreeAdapterMap } from "parse5";
import ts from "typescript";
import { AssetRegistryDocSchema, publicAssetPath } from "../assets/assets";
import { buildSite } from "../build/site-build";
import { GOLDEN_INPUT } from "../cli/integration-golden";
import { ProjectSchema, ProjectsDocSchema, projectAssetRefs } from "../content/schema";
import { EXPORT_SCHEMA, assetPathPrefix, type ExportAsset } from "../portfolio-sync/contract";
import { applyFilePlan, planManagedPortfolio, readSiteDirState } from "../portfolio-sync/generate";
import { MANAGED_FILE, readManagedManifest } from "../portfolio-sync/managed";
import type { PreviewKitInfo, ProjectPreviewInput, ProjectPreviewResult } from "../preview/entry";
import { KIT_FILE, RENDERER_FILE, buildPreviewKit, writePreviewKit } from "../preview/kit";
import { loadRelease, releaseDir } from "../release/release";
import { buildSiteSnapshot, loadSiteInstance } from "../site/load";
import { sha256 } from "../util/hash";
import { assertLiveNotADataset, frozenDemoRoot } from "./demo-frozen-dataset";
import { writeQaProjects } from "./portfolio-qa-corpus";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";

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
/** Two serialised DOMs are the same string; a failure shows where they part. */
function sameHtml(mine: string, built: string, what: string) {
  if (mine === built) return;
  let i = 0;
  while (i < mine.length && i < built.length && mine[i] === built[i]) i++;
  throw new Error(`${what} differs at offset ${i}\n  kit:   …${mine.slice(Math.max(0, i - 120), i + 160)}…\n  built: …${built.slice(Math.max(0, i - 120), i + 160)}…`);
}

// ------------------------------------------------------------------------- DOM --
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
const isElement = (n: Node): n is Element => "tagName" in n;
/** The parsed document, exactly as parsed: comments are kept. */
const dom = (html: string): Node => parse(html);
/** A region cut out of a document as TEXT (no parser): from its opening tag to its closing tag. */
function cut(html: string, open: string, close: string, what: string): string {
  const from = html.indexOf(open);
  const to = html.indexOf(close, from);
  assert(from >= 0 && to > from && html.indexOf(open, from + 1) === -1, `${what}: expected exactly one ${open}…${close}`);
  return html.slice(from, to + close.length);
}
const REGIONS: [what: string, open: string, close: string][] = [
  ["<main>", "<main", "</main>"],
  ["site header", '<header class="i1-header"', "</header>"],
  ["site footer", "<footer", "</footer>"],
];
function all(n: Node, pred: (el: Element) => boolean, out: Element[] = []): Element[] {
  if (isElement(n) && pred(n)) out.push(n);
  if ("childNodes" in n) for (const c of n.childNodes) all(c, pred, out);
  return out;
}
const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const elements = (el: Element) => el.childNodes.filter(isElement);
function one(n: Node, pred: (el: Element) => boolean, what: string): Element {
  const hits = all(n, pred);
  assert(hits.length === 1, `expected exactly one ${what}, found ${hits.length}`);
  return hits[0]!;
}
const mainOf = (d: Node) => one(d, (e) => e.tagName === "main", "<main>");
const headerOf = (d: Node) => one(d, (e) => e.tagName === "header" && attr(e, "data-section") === "site.header", "site header");
const footerOf = (d: Node) => one(d, (e) => e.tagName === "footer" && attr(e, "data-section") === "site.footer", "site footer");
const text = (el: Element): string => el.childNodes.map((c) => ("value" in c ? c.value : isElement(c) ? text(c) : "")).join("");
/** `tag.class` of every ancestor from <main> down to the element's parent */
function chain(el: Element): string[] {
  const out: string[] = [];
  for (let p = el.parentNode; p && isElement(p as Node); p = (p as Element).parentNode) {
    const e = p as Element;
    out.unshift(`${e.tagName}.${attr(e, "class") ?? ""}`);
    if (e.tagName === "main") break;
  }
  return out;
}

// ---------------------------------------------------------------------- fixtures --
const frozen = await frozenDemoRoot(repoRoot);
const pin = (await loadSiteInstance(frozen.root, DEMO)).template;
const release = await loadRelease(repoRoot, pin.templateId, pin.releaseId);
const cssRel = `templates/${pin.templateId}/v${pin.templateVersion.split(".")[0]}/styles/template.css`;
const releaseCss = await readFile(path.join(releaseDir(repoRoot, pin.templateId, pin.releaseId), "files", cssRel), "utf8");
const work = await mkdtemp(path.join(os.tmpdir(), "preview-parity-"));

type Render = (input: ProjectPreviewInput) => ProjectPreviewResult;
let render: Render | undefined;
let kitInfo: PreviewKitInfo | undefined;
let rendererFile = "";
function rendered(input: ProjectPreviewInput): Extract<ProjectPreviewResult, { ok: true }> {
  assert(render, "K1 kit missing");
  const r = render(input);
  assert(r.ok, `refused: ${JSON.stringify(r.ok ? [] : r.problems)}`);
  return r;
}
function refused(input: unknown): { path: string; message: string }[] {
  assert(render, "K1 kit missing");
  const r = render(input as ProjectPreviewInput);
  assert(!r.ok, "expected a refusal, got documents");
  assert(r.problems.length > 0 && r.problems.every((p) => typeof p.path === "string" && typeof p.message === "string" && p.message !== ""), `malformed problems ${JSON.stringify(r.problems)}`);
  return r.problems;
}

try {
  // =========================================================================== [kit] ==
  console.log(`\n[kit] the preview renderer kit of ${DEMO} (pin ${pin.releaseId})`);
  await check("K1 REPRODUCIBLE: two generations from the frozen demo composition are byte-identical (renderer.mjs and kit.json); kit.json names the site, the pin, the files and carries no clock value", async () => {
    const a = await buildPreviewKit({ repoRoot: frozen.root, siteId: DEMO, sourceCommit: "test" });
    const b = await buildPreviewKit({ repoRoot: frozen.root, siteId: DEMO, sourceCommit: "test" });
    assert(a.files[RENDERER_FILE] === b.files[RENDERER_FILE], "renderer.mjs differs between two generations");
    assert(a.files[KIT_FILE] === b.files[KIT_FILE], "kit.json differs between two generations");
    await writePreviewKit(a, path.join(work, "kit"));
    await writePreviewKit(b, path.join(work, "kit-again"));
    for (const f of [RENDERER_FILE, KIT_FILE]) eq(sha256(await readFile(path.join(work, "kit", f))), sha256(await readFile(path.join(work, "kit-again", f))), `written ${f}`);
    const json = JSON.parse(a.files[KIT_FILE]);
    eq(Object.keys(json), ["kitFormat", "siteId", "templateId", "templateVersion", "releaseId", "releaseHash", "templateCssSha256", "shellSha256", "shellAssets", "sourceCommit", "generatedBy", "files"], "kit.json keys");
    eq([json.kitFormat, json.siteId, json.templateId, json.templateVersion, json.releaseId, json.releaseHash], [1, DEMO, pin.templateId, pin.templateVersion, pin.releaseId, pin.releaseHash], "kit.json identity");
    eq(json.files, { [RENDERER_FILE]: sha256(a.files[RENDERER_FILE]) }, "kit.json files");
    eq(json.sourceCommit, "test", "sourceCommit");
    assert(/^web-recon platform\/preview\/kit\.ts \(pnpm site:preview-kit\) · esbuild \d+\.\d+\.\d+ · react \d+\.\d+\.\d+ · react-dom \d+\.\d+\.\d+ · zod \d+\.\d+\.\d+$/.test(json.generatedBy), `generatedBy ${json.generatedBy}`);
    assert(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(a.files[KIT_FILE]), "kit.json carries a timestamp");
    rendererFile = path.join(work, "kit", RENDERER_FILE);
    const mod = (await import(pathToFileURL(rendererFile).href)) as { renderProjectPreview: Render; kit: PreviewKitInfo };
    eq(Object.keys(mod).sort(), ["kit", "renderProjectPreview"], "renderer exports");
    eq(mod.kit, a.info, "the kit's own `kit` constant");
    eq({ ...mod.kit, sourceCommit: json.sourceCommit, generatedBy: json.generatedBy, files: json.files }, json, "kit.json = `kit` + provenance");
    render = mod.renderProjectPreview;
    kitInfo = mod.kit;
    console.log(`       renderer.mjs ${a.rendererBytes} B (${a.inputs.length} bundled sources) · sha256 ${json.files[RENDERER_FILE].slice(0, 16)}…`);
  });
  await check("K2 NO PORTFOLIO NEEDED: the kit of the LIVE site directory generates in this checkout — where the loader refuses the demo when its portfolio is not generated — and is the same renderer, byte for byte; the default sourceCommit is this checkout's HEAD and is in kit.json only", async () => {
    if (!frozen.live.dataset) {
      // adopted: the loader refuses it; published incrementally: it loads the shell, which holds no portfolio (demo-frozen-dataset.ts)
      await assertLiveNotADataset(frozen, () => buildSiteSnapshot({ repoRoot, siteId: DEMO, mode: "public", at: GOLDEN_INPUT.at }), "buildSiteSnapshot");
    }
    const live = await buildPreviewKit({ repoRoot, siteId: DEMO });
    eq(sha256(live.files[RENDERER_FILE]), sha256(await readFile(rendererFile)), "renderer.mjs of the live directory vs the frozen composition");
    const commit = JSON.parse(live.files[KIT_FILE]).sourceCommit as string;
    assert(/^(?:[0-9a-f]{40}(?:-dirty)?|unknown)$/.test(commit), `sourceCommit ${commit}`);
    assert(!live.files[RENDERER_FILE].includes(commit.slice(0, 40)) || commit === "unknown", "the commit leaked into renderer.mjs");
    assert(!(await readManagedManifest(path.join(repoRoot, "data/sites", DEMO))) === !frozen.live.managed, "the live site directory changed during the test");
  });
  await check("K3 IMPORT-FREE: renderer.mjs parses as one ES module with no import declaration, no re-export from a module, no import() and no require(); every bundled source is the release's, this platform's preview/schema code, or react / react-dom / zod at the release's pinned versions", async () => {
    const source = await readFile(rendererFile, "utf8");
    const sf = ts.createSourceFile("renderer.mjs", source, ts.ScriptTarget.ES2022, false, ts.ScriptKind.JS);
    const found: string[] = [];
    const exported: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) found.push("import declaration");
      if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) found.push("export … from");
        if (node.exportClause && ts.isNamedExports(node.exportClause)) exported.push(...node.exportClause.elements.map((e) => e.name.text));
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push("import()");
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") found.push("require()");
      if (ts.isMetaProperty(node)) found.push("import.meta");
      ts.forEachChild(node, visit);
    };
    visit(sf);
    eq(found, [], "module references");
    eq(exported.sort(), ["kit", "renderProjectPreview"], "export list");
    const kit = await buildPreviewKit({ repoRoot: frozen.root, siteId: DEMO, sourceCommit: "test" });
    const releasePrefix = `data/template-releases/${pin.templateId}/${pin.releaseId}/files/`;
    const allowed = [releasePrefix, "platform/preview/", "platform/portfolio-sync/contract.ts", "platform/content/", "platform/site/", "platform/assets/", "platform/settings/", "platform/theme/", "platform/slots/", "node_modules/.pnpm/react@", "node_modules/.pnpm/react-dom@", "node_modules/.pnpm/zod@"];
    eq(kit.inputs.filter((f) => !allowed.some((p) => f.startsWith(p))), [], "bundled sources outside the expected set");
    const manifest = JSON.parse(await readFile(path.join(releaseDir(repoRoot, pin.templateId, pin.releaseId), "files/package.json"), "utf8")).dependencies as Record<string, string>;
    for (const name of ["react", "react-dom", "zod"]) {
      const from = kit.inputs.filter((f) => f.startsWith(`node_modules/.pnpm/${name}@`));
      assert(from.length > 0 && from.every((f) => f.startsWith(`node_modules/.pnpm/${name}@${manifest[name]}`)), `${name} is not bundled at the release's ${manifest[name]}: ${from[0]}`);
    }
    // the render path is the release's: its sections, its components, its own platform runtime
    for (const f of ["sections/PortfolioDetail.tsx", "components/ProjectGallery.tsx", "sections/projectCards.ts", "components/ProjectCard.tsx", "sections/SiteHeader.tsx", "sections/SiteFooter.tsx", "template.ts"]) {
      assert(kit.inputs.includes(`${releasePrefix}templates/${pin.templateId}/v${pin.templateVersion.split(".")[0]}/${f}`), `the release's ${f} is not in the bundle`);
    }
    assert(kit.inputs.includes(`${releasePrefix}platform/site/context.ts`) && !kit.inputs.includes("platform/site/context.ts"), "createSiteContext must be the release's copy");
    assert(!kit.inputs.some((f) => f.startsWith("templates/")), "working-tree template code was bundled");
  });
  await check("K4 CSS: the stylesheet a kit embeds is the pinned release's styles/template.css — the hash release.json records for that file is kit.templateCssSha256", () => {
    assert(kitInfo, "K1 kit missing");
    const recorded = release.files.find((f) => f.path === cssRel)?.sha256;
    eq([kitInfo.templateCssSha256, sha256(releaseCss)], [recorded, recorded], "template.css sha256");
  });

  // ========================================================================= [build] ==
  console.log("\n[build] export → the real generator → the real build, in a throwaway root");
  const tmpRoot = path.join(work, "root");
  const siteDir = path.join(tmpRoot, "data/sites", DEMO);
  type ExportDoc = { categories: unknown[]; projects: { id: string; slug: string }[]; assets: ExportAsset[] };
  let exportDoc: ExportDoc | undefined;
  let site = "";
  /** asset id → the path the build serves it at: what the kit is given as that asset's URL */
  const publicUrl = new Map<string, string>();

  await check("B0 an export document of the demo's QA corpus (19 records) goes through planManagedPortfolio + applyFilePlan: the site directory is a managed portfolio, each generated record IS its export record (through ProjectSchema) and each generated registry entry IS its export asset minus sha256 / size / href", async () => {
    await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
    await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
    await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
    await cp(frozen.siteDir, siteDir, { recursive: true });
    await writeQaProjects(repoRoot, siteDir, path.join(frozen.siteDir, "content/projects.json"));

    // the export BoostChat would serve for this portfolio (contract §2)
    const readJson = async (rel: string) => JSON.parse(await readFile(path.join(siteDir, rel), "utf8"));
    const projectsDoc = await readJson("content/projects.json");
    const referenced = new Set(ProjectsDocSchema.parse(projectsDoc).items.flatMap(projectAssetRefs));
    const assets: ExportAsset[] = [];
    const bytes = new Map<string, Uint8Array>();
    for (const entry of AssetRegistryDocSchema.parse(await readJson("assets/registry.json")).items.filter((a) => referenced.has(a.id)).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const b = await readFile(path.join(siteDir, "assets", entry.file));
      bytes.set(entry.id, b);
      assets.push({ ...entry, mediaType: entry.mediaType as ExportAsset["mediaType"], sha256: sha256(b), size: b.length, href: `${assetPathPrefix(DEMO)}${entry.id}` });
    }
    const doc = {
      schema: EXPORT_SCHEMA,
      site: { siteId: DEMO, publicOrigin: (await readJson("site.json")).identity.publicOrigin, contentOrigin: projectsDoc.origin },
      revision: 1,
      liveRevision: 0,
      categories: (await readJson("content/categories.json")).items,
      projects: projectsDoc.items,
      assets,
      changes: { publishing: [], removing: [] },
    };
    const plan = planManagedPortfolio({ export: doc, assetBytes: bytes, site: await readSiteDirState(tmpRoot, DEMO) });
    await applyFilePlan(siteDir, plan);
    eq(plan.projects.length, 19, "records in the plan");
    assert((await readManagedManifest(siteDir))?.source.revision === 1, `${MANAGED_FILE} was not written`);
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
    eq((await readJson("content/projects.json")).items, doc.projects.map((p: unknown) => ProjectSchema.parse(p)).sort(byId), "generated projects.json vs the export records");
    const registry = new Map(((await readJson("assets/registry.json")).items as { id: string }[]).map((a) => [a.id, a]));
    for (const { sha256: _s, size: _z, href: _h, ...entry } of assets) eq(registry.get(entry.id), entry, `registry entry ${entry.id}`);
    for (const a of assets) publicUrl.set(a.id, publicAssetPath(a.sha256, a.mediaType));
    exportDoc = doc;
  });
  const pages = new Map<string, string>();
  await check(`B1 the generated site builds with its pin ${pin.releaseId}: status built, package QA pass, one detail page per export record`, async () => {
    assert(exportDoc, "B0 export missing");
    const r = await buildSite({ repoRoot: tmpRoot, siteId: DEMO, mode: GOLDEN_INPUT.mode, at: GOLDEN_INPUT.at });
    assert(r.status === "built", `status ${r.status}`);
    assert(r.record.qa.pass, `package QA: ${JSON.stringify(r.record.qa.failures ?? [])}`);
    eq([r.record.template.releaseId, r.record.template.releaseHash], [pin.releaseId, pin.releaseHash], "built release");
    site = path.join(r.packageDir, "site");
    for (const p of exportDoc.projects) pages.set(p.id, await readFile(path.join(site, "portfolio", `${p.slug}.html`), "utf8"));
    eq(pages.size, 19, "detail pages");
  });

  // ======================================================================== [parity] ==
  console.log("\n[parity] the same export record: built page vs kit");
  /** what BoostChat passes for one record: the export record, the export's categories, that record's export assets, one URL per image */
  const inputOf = (id: string, urls: "public-paths" | "project-only" = "public-paths"): ProjectPreviewInput => {
    assert(exportDoc && kitInfo, "B0 export / K1 kit missing");
    const project = exportDoc.projects.find((p) => p.id === id);
    assert(project, `no export record ${id}`);
    const refs = new Set(projectAssetRefs(ProjectSchema.parse(project)));
    const assetUrls: Record<string, string> = {};
    for (const ref of refs) assetUrls[ref] = publicUrl.get(ref)!;
    // the header logo is embedded in the kit; here it is pointed at its public path, as the built page has it
    if (urls === "public-paths") for (const a of kitInfo.shellAssets) assetUrls[a.id] = a.publicPath;
    return { project, categories: exportDoc.categories, assets: exportDoc.assets.filter((a) => refs.has(a.id)), assetUrls };
  };
  const docs = new Map<string, { detailHtml: string; cardHtml: string }>();
  await check("P1 DETAIL <main> 19/19: for every record, the built detail page's <main> is the kit's <main> for the same export record — byte for byte as text, and as parsed DOM with comments included (no normalisation)", () => {
    assert(pages.size === 19, "B1 pages missing");
    let bytes = 0;
    for (const { id } of exportDoc!.projects) {
      const r = rendered(inputOf(id));
      docs.set(id, r);
      const [mine, built] = [cut(r.detailHtml, "<main", "</main>", `${id} kit`), cut(pages.get(id)!, "<main", "</main>", `${id} built`)];
      sameHtml(mine, built, `${id} <main> (text)`);
      sameHtml(serializeOuter(mainOf(dom(r.detailHtml))), serializeOuter(mainOf(dom(pages.get(id)!))), `${id} <main> (DOM)`);
      assert(mine.includes("<!-- -->") || !/<span class="i1-gallery__count">/.test(mine), `${id}: the text separators of a hydratable render are missing`);
      bytes += mine.length;
    }
    eq(docs.size, 19, "records compared");
    console.log(`       19/19 <main> byte-identical (${bytes} B compared), no normalisation`);
  });
  await check("P2 CHROME 19/19: the built page's site header and site footer are the kit's, byte for byte; the kit's <body> is exactly header · main · footer, and the built <body> has nothing else but Next's own empty <div hidden>, marker comments and <script>s (D1)", () => {
    assert(docs.size === 19, "P1 documents missing");
    for (const [id, r] of docs) {
      const mine = dom(r.detailHtml);
      const built = dom(pages.get(id)!);
      for (const [what, open, close] of REGIONS.slice(1)) sameHtml(cut(r.detailHtml, open, close, `${id} kit`), cut(pages.get(id)!, open, close, `${id} built`), `${id} ${what} (text)`);
      sameHtml(serializeOuter(headerOf(mine)), serializeOuter(headerOf(built)), `${id} site header (DOM)`);
      sameHtml(serializeOuter(footerOf(mine)), serializeOuter(footerOf(built)), `${id} site footer (DOM)`);
      const body = (d: Node) => elements(one(d, (e) => e.tagName === "body", "<body>"));
      eq(body(mine).map((e) => e.tagName), ["header", "main", "footer"], `${id} kit <body>`);
      const nextOwn = body(built).filter((e) => e.tagName === "script" || (e.tagName === "div" && attr(e, "hidden") !== undefined && e.childNodes.every((c) => c.nodeName === "#comment")));
      eq(body(built).filter((e) => !nextOwn.includes(e)).map((e) => e.tagName), ["header", "main", "footer"], `${id} built <body> minus Next's own nodes`);
      eq(nextOwn.filter((e) => e.tagName === "div").length, 1, `${id} built <body>: Next's empty hidden div`);
      // no text and no comment of its own in the kit's <body>; the built one's are Next's markers only
      const loose = (d: Node) => one(d, (e) => e.tagName === "body", "<body>").childNodes.filter((c) => !isElement(c)).map((c) => ("data" in c ? `<!--${c.data}-->` : c.nodeName));
      eq(loose(mine), [], `${id} kit <body> loose nodes`);
      assert(loose(built).every((c) => c === "<!--$-->" || c === "<!--/$-->"), `${id} built <body> loose nodes ${JSON.stringify(loose(built))}`);
    }
  });
  await check("P3 CARD 19/19: the record's card on the built /portfolio is the kit's card; a card in the first three positions is identical, a later one differs in exactly the cover's position-dependent loading attribute (D2); the kit's wrappers are the list page's own ancestors of a card", async () => {
    assert(docs.size === 19, "P1 documents missing");
    const list = dom(await readFile(path.join(site, "portfolio.html"), "utf8"));
    const cards = all(mainOf(list), (e) => e.tagName === "li" && attr(e, "data-project-card") !== undefined);
    eq(cards.map((c) => attr(c, "data-project-card")).sort(), [...docs.keys()].sort(), "cards on the built /portfolio");
    let identical = 0;
    let lazy = 0;
    for (const [id, r] of docs) {
      const position = cards.findIndex((c) => attr(c, "data-project-card") === id);
      const built = cards[position]!;
      const mineDoc = dom(r.cardHtml);
      const mine = one(mineDoc, (e) => e.tagName === "li" && attr(e, "data-project-card") === id, "kit card");
      const cover = (li: Element) => one(li, (e) => e.tagName === "img", "card cover").attrs.find((a) => a.name === "loading")!;
      eq(cover(mine).value, "eager", `${id} kit cover loading`);
      if (position < 3) {
        sameHtml(serializeOuter(mine), serializeOuter(built), `${id} card (position ${position + 1})`);
        identical++;
      } else {
        eq(cover(built).value, "lazy", `${id} built cover loading at position ${position + 1}`);
        cover(mine).value = "lazy"; // D2 — the one attribute that depends on the position, set to the built list's
        sameHtml(serializeOuter(mine), serializeOuter(built), `${id} card (position ${position + 1}, loading aside)`);
        lazy++;
      }
      // the kit lays the card out inside the list's own ancestors (the filter island adds wrappers in between)
      const kitChain = chain(mine);
      const builtChain = chain(built);
      eq(kitChain, ["main.i1-main", "section.i1-plist", "div.i1-container", "ul.i1-plist__grid"], `${id} kit card ancestors`);
      let at = 0;
      for (const step of builtChain) if (step === kitChain[at]) at++;
      assert(at === kitChain.length && builtChain[0] === kitChain[0] && builtChain.at(-1) === kitChain.at(-1), `${id}: kit ancestors ${kitChain.join(" > ")} are not the built list's ${builtChain.join(" > ")}`);
      // and only the wrappers are marked preview-only: nothing of the card itself
      eq(all(mineDoc, (e) => attr(e, "data-preview-only") !== undefined).map((e) => e.tagName), ["style", "main", "section", "div", "ul"], `${id} preview-only nodes of the card document`);
    }
    eq([identical, lazy], [3, 16], "cards identical / differing only in loading");
  });

  // ====================================================================== [document] ==
  console.log("\n[document] each kit document is complete, self-contained and inert");
  await check("D-1 all 38 documents: <!DOCTYPE html>, <html lang>, charset first, viewport, robots noindex,nofollow, exactly the three styles (the release's template.css verbatim, then the site theme, then the marked preview-only style), no <script>, no event handler, no javascript: URL, nothing fetched but the image URLs the caller gave", () => {
    assert(docs.size === 19 && kitInfo, "P1 documents missing");
    for (const [id, r] of docs) {
      const given = new Set(Object.values(inputOf(id).assetUrls as Record<string, string>));
      for (const [kind, html] of [["detail", r.detailHtml], ["card", r.cardHtml]] as const) {
        const what = `${id} ${kind}`;
        assert(html.startsWith('<!DOCTYPE html><html lang="ko-KR"><head><meta charSet="utf-8"/>'), `${what}: document start ${html.slice(0, 80)}`);
        assert(html.endsWith("</body></html>"), `${what}: document end`);
        const d = dom(html);
        const head = one(d, (e) => e.tagName === "head", "<head>");
        eq(attr(elements(head)[0]!, "charset"), "utf-8", `${what} charset`);
        eq(all(head, (e) => e.tagName === "meta" && attr(e, "name") === "viewport").map((e) => attr(e, "content")), ["width=device-width, initial-scale=1"], `${what} viewport`);
        eq(all(d, (e) => e.tagName === "meta" && attr(e, "name") === "robots").map((e) => attr(e, "content")), ["noindex,nofollow"], `${what} robots`);
        eq(all(head, (e) => e.tagName === "title").length, 1, `${what} <title>`);
        // styles: the release's stylesheet first, then the theme (the page's cascade order), then the marked preview-only one
        const styles = all(d, (e) => e.tagName === "style");
        eq(styles.map((s) => [attr(s, "id"), s.parentNode === head, attr(s, "data-preview-only") !== undefined]), [["template-css", true, false], ["site-theme", true, false], ["preview-only", true, true]], `${what} styles`);
        assert(html.includes(`<style id="template-css">${releaseCss}</style>`), `${what}: template.css is not embedded verbatim`);
        eq(sha256(text(styles[0]!)), kitInfo.templateCssSha256, `${what} embedded CSS hash`);
        assert(/^:root\{--[a-z-]+:/.test(text(styles[1]!)), `${what} site theme`);
        for (const s of styles) assert(!/@import|url\(/i.test(text(s)), `${what}: a style loads a resource`);
        // inert
        eq(all(d, (e) => ["script", "iframe", "object", "embed", "base", "form", "video", "audio", "source", "template", "noscript"].includes(e.tagName)).map((e) => e.tagName), [], `${what} active elements`);
        const every = all(d, () => true);
        eq(every.flatMap((e) => e.attrs.filter((a) => /^on/i.test(a.name) || a.name === "srcset" || a.name === "style").map((a) => `${e.tagName}@${a.name}`)), [], `${what} handlers / srcset / inline styles`);
        eq(every.flatMap((e) => e.attrs.filter((a) => /^\s*(?:javascript|vbscript):/i.test(a.value)).map((a) => a.value)), [], `${what} script URLs`);
        // fetched resources: <img src> and React's image preloads — each one a URL the caller gave
        const links = all(d, (e) => e.tagName === "link");
        for (const l of links) eq([attr(l, "rel"), attr(l, "as")], ["preload", "image"], `${what} <link>`);
        const fetched = [...all(d, (e) => e.tagName === "img").map((e) => attr(e, "src")!), ...links.map((l) => attr(l, "href")!)];
        assert(fetched.length > 0 && fetched.every((u) => given.has(u)), `${what}: fetches ${fetched.filter((u) => !given.has(u)).join(", ")}`);
        // links are never fetched; they are the site's own paths and the business mail address
        for (const a of all(d, (e) => e.tagName === "a")) assert(/^(?:\/(?!\/)|mailto:)/.test(attr(a, "href") ?? ""), `${what}: link ${attr(a, "href")}`);
        if (kind === "detail") eq(all(d, (e) => attr(e, "data-preview-only") !== undefined).map((e) => e.tagName), ["style"], `${what} preview-only nodes`);
      }
    }
  });

  // ====================================================================== [contract] ==
  console.log("\n[contract] refusals, drafts, purity");
  await check("C1 NEVER THROWS: a record the content model refuses — and every malformed input — is { ok: false, problems: [{ path, message }] } naming the field", () => {
    const good = inputOf("bi-01");
    const project = good.project as Record<string, unknown>;
    const paths = (input: unknown) => refused(input).map((p) => p.path);
    const firstRef = (good.assets as ExportAsset[])[0]!.id;
    const cases: [string, unknown, string][] = [
      ["no title", { ...good, project: { ...project, title: undefined } }, "project.title"],
      ["unknown field", { ...good, project: { ...project, displayOrder: 1 } }, "project"],
      ["status outside the model", { ...good, project: { ...project, status: "publishing" } }, "project.status"],
      ["slug with a space", { ...good, project: { ...project, slug: "Not A Slug" } }, "project.slug"],
      ["publishedAt without offset", { ...good, project: { ...project, publishedAt: "2026-01-01" } }, "project.publishedAt"],
      ["category the export does not define (P2)", { ...good, categories: [{ id: "other", name: "기타" }] }, "project.category"],
      ["category entry without a name", { ...good, categories: [...(good.categories as unknown[]), { id: "x" }] }, `categories.${(good.categories as unknown[]).length}.name`],
      ["referenced image missing from assets (P3)", { ...good, assets: (good.assets as ExportAsset[]).slice(1) }, "assets"],
      ["asset entry with a text width", { ...good, assets: (good.assets as ExportAsset[]).map((a, i) => (i === 0 ? { ...a, width: "1600" } : a)) }, "assets.0.width"],
      ["no URL for a referenced image", { ...good, assetUrls: Object.fromEntries(Object.entries(good.assetUrls as object).filter(([id]) => id !== firstRef)) }, `assetUrls.${firstRef}`],
      ["a script URL for an image", { ...good, assetUrls: { ...(good.assetUrls as object), [firstRef]: "javascript:alert(1)" } }, `assetUrls.${firstRef}`],
      ["a protocol-relative URL for an image", { ...good, assetUrls: { ...(good.assetUrls as object), [firstRef]: "//elsewhere.example/a.jpg" } }, `assetUrls.${firstRef}`],
      ["assetUrls not an object", { ...good, assetUrls: [] }, "assetUrls"],
      ["an input key that does not exist", { ...good, assetUrl: {} }, "assetUrl"],
      ["a slug the release's routes reserve", { ...good, project: { ...project, slug: "page" } }, "(render)"],
    ];
    for (const [name, input, want] of cases) assert(paths(input).includes(want), `${name}: expected a problem at "${want}", got ${JSON.stringify(refused(input))}`);
    for (const garbage of [undefined, null, 42, "x", [], {}, { project: null, categories: null, assets: null, assetUrls: null }]) refused(garbage);
    // the same input twice is the same answer (no state survives a call)
    eq(refused({ ...good, project: { ...project, title: undefined } }), refused({ ...good, project: { ...project, title: undefined } }), "repeated refusal");
  });
  await check("C2 an UNPUBLISHED record renders (status draft → the same document); an extra asset entry is ignored; without a logo URL the header shows the embedded logo (a data: URI of the site's own file); another image URL scheme the caller may use (https, data:image) reaches every <img>", async () => {
    const good = inputOf("bi-04");
    const base = rendered(good);
    const draft = rendered({ ...good, project: { ...(good.project as object), status: "draft" } });
    eq(draft.detailHtml, base.detailHtml, "draft vs published document");
    eq(rendered({ ...good, assets: exportDoc!.assets }).detailHtml, base.detailHtml, "with every export asset passed");
    const embedded = rendered(inputOf("bi-04", "project-only"));
    const logo = attr(one(headerOf(dom(embedded.detailHtml)), (e) => e.tagName === "img", "header logo"), "src")!;
    const logoFile = AssetRegistryDocSchema.parse(JSON.parse(await readFile(path.join(siteDir, "assets/registry.json"), "utf8"))).items.find((a) => a.id === kitInfo!.shellAssets[0]!.id)!;
    eq(logo, `data:${logoFile.mediaType};base64,${(await readFile(path.join(siteDir, "assets", logoFile.file))).toString("base64")}`, "embedded logo");
    sameHtml(cut(embedded.detailHtml, "<main", "</main>", "embedded"), cut(base.detailHtml, "<main", "</main>", "base"), "<main> with the embedded logo");
    const signed = Object.fromEntries(Object.keys(good.assetUrls as object).map((id, i) => [id, i % 2 ? `https://admin.example/api/preview/${id}?sig=a&b=1` : `data:image/jpeg;base64,${Buffer.from(id).toString("base64")}`]));
    const other = dom(rendered({ ...good, assetUrls: signed }).detailHtml);
    const srcs = all(other, (e) => e.tagName === "img").map((e) => attr(e, "src")!);
    assert(srcs.length > 0 && srcs.every((s) => Object.values(signed).includes(s)), `an <img> does not use the caller's URL: ${srcs.find((s) => !Object.values(signed).includes(s))}`);
    // only the URLs moved: with them put back, the <body> is the base document's (the <head> also holds
    // React's image preloads, which it emits for fetchable URLs and not for data: URIs)
    const back = new Map(Object.entries(signed).map(([id, url]) => [url, (good.assetUrls as Record<string, string>)[id]!]));
    for (const el of all(other, (e) => e.tagName === "img")) for (const a of el.attrs) if (back.has(a.value)) a.value = back.get(a.value)!;
    sameHtml(serializeOuter(one(other, (e) => e.tagName === "body", "<body>")), serializeOuter(one(dom(base.detailHtml), (e) => e.tagName === "body", "<body>")), "<body> with the URLs put back");
  });
  await check("C3 PURE, PLAIN NODE: `await import(renderer.mjs)` in a bare node process (no tsx, no node_modules on its path) with Date.now / new Date() / Math.random / performance.now / crypto / timers / fetch / MessageChannel / process trapped — renders, twice the same, and the same bytes as here", async () => {
    const dir = path.join(work, "plain-node");
    await mkdir(dir, { recursive: true });
    await cp(rendererFile, path.join(dir, RENDERER_FILE));
    const input = inputOf("bi-01");
    await writeFile(path.join(dir, "input.json"), JSON.stringify(input));
    await writeFile(
      path.join(dir, "probe.mjs"),
      `import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const input = JSON.parse(readFileSync(new URL("./input.json", import.meta.url), "utf8"));
const out = process.stdout;
const real = process;
const calls = [];
const trap = (name) => function () { calls.push(name); throw new Error("impure call: " + name); };
const RealDate = Date;
RealDate.now = trap("Date.now");
globalThis.Date = new Proxy(RealDate, { construct(t, a) { if (a.length === 0) trap("new Date()")(); return Reflect.construct(t, a); }, apply() { trap("Date()")(); } });
Math.random = trap("Math.random");
performance.now = trap("performance.now");
crypto.getRandomValues = trap("crypto.getRandomValues");
crypto.randomUUID = trap("crypto.randomUUID");
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "MessageChannel", "BroadcastChannel", "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "require"]) globalThis[name] = trap(name);
globalThis.process = new Proxy({}, { get(_t, key) { trap("process." + String(key))(); } });
const mod = await import(new URL("./${RENDERER_FILE}", import.meta.url).href);
const a = mod.renderProjectPreview(input);
const b = mod.renderProjectPreview(input);
const bad = mod.renderProjectPreview({ project: {} });
const h = (s) => createHash("sha256").update(s ?? "").digest("hex");
out.write(JSON.stringify({ exports: Object.keys(mod).sort(), ok: a.ok, problems: a.problems, same: a.detailHtml === b.detailHtml && a.cardHtml === b.cardHtml, detail: h(a.detailHtml), card: h(a.cardHtml), badOk: bad.ok, calls, node: real.version }));
`,
    );
    const run = spawnSync(process.execPath, [path.join(dir, "probe.mjs")], { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv, timeout: 60_000 });
    assert(run.status === 0, `node exited ${run.status}: ${run.stderr.slice(-1500)}`);
    const got = JSON.parse(run.stdout);
    const here = rendered(input);
    eq(got.exports, ["kit", "renderProjectPreview"], "exports in plain node");
    eq([got.ok, got.same, got.badOk, got.calls], [true, true, false, []], "plain-node render [ok, twice the same, refusal ok, impure calls]");
    eq([got.detail, got.card], [sha256(here.detailHtml), sha256(here.cardHtml)], "plain-node bytes vs this process");
    assert(Number(String(got.node).slice(1).split(".")[0]) >= 22, `node ${got.node}`);
    console.log(`       plain ${got.node}: detail ${got.detail.slice(0, 12)}… card ${got.card.slice(0, 12)}… · 0 impure calls`);
  });
} finally {
  await rm(work, { recursive: true, force: true });
}

console.log(`\npreview-parity: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
