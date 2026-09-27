/**
 * Information architecture validation (interior-01 1.5.0):
 *   1. three new static pages for every site: /3d-portfolio (placeholder), /about, /contact
 *      (an inquiry form that composes an e-mail in the visitor's mail app — no backend);
 *   2. header nav = portfolio · 3D portfolio · about · the contact pill (→ /contact); below 900 px
 *      a menu button opening a client-only modal menu (behaviour: scripts/template-platform-ia-smoke.ts);
 *   3. every contact CTA (header pill, floating seat, detail CTA, hero contact slide) → /contact,
 *      only when the site has a contact channel (business email);
 *   4. the demo's copy: "프로젝트" → "포트폴리오" in nav / list title / back link / intro link, and
 *      the three new sections' Korean copy.
 * Plus what must NOT have moved: the immutable 1.4.x releases, platform/ (outside test/), the demo
 * site's other documents and its 51 raster assets (against
 * docs/result/recon-template-platform-ia-final/proof/before.json, captured before the 1.5.0 work).
 * canonical-150.ts sets aside, in the older regressions, exactly what is asserted here.
 *
 * Run AFTER `pnpm site:build boost-interior-demo`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/ia150.test.ts
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { AssetRegistryDocSchema } from "../assets/assets";
import { loadRelease, verifyRelease } from "../release/release";
import { resolveSlots } from "../slots/slots";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";
import { IA_HTML, IA_PATHS, IA_ROUTES, canonical150Sitemap } from "./canonical-150";
import { demoBuiltRelease, demoExpectedPages } from "./demo-rollout";
import { integrationSurfaceBefore, isIntegrationSurface } from "./integration-surface";
import { isPublishSurface } from "./publish-surface";
import { isRelease160Added, release160SurfaceBefore } from "./release-160-surface";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
// the demo's business address and public origin are Site Data (1.5.2 moved both to the real outreach
// values); the package must carry whatever the site declares
const EMAIL: string = JSON.parse(await readFile(path.join(repoRoot, "data/sites", DEMO, "content/business.json"), "utf8")).data.contact.email;
const ORIGIN: string = JSON.parse(await readFile(path.join(repoRoot, "data/sites", DEMO, "site.json"), "utf8")).identity.publicOrigin;
const FROZEN = [
  { id: "interior-01-1.4.0-9e1ea20da947", hash: "9e1ea20da9472d3bb003a27ff5f7374c76fa350c5941beb79457441576130961", capture: "release140Files" },
  { id: "interior-01-1.4.1-59179ca20368", hash: "59179ca20368d0f48093eacbe3930ce3f3de9b21a65ba27d9bc63defb67933bd", capture: "release141Files" },
  { id: "interior-01-1.4.2-a223ccd0759c", hash: "a223ccd0759c4a36012ec99147bc928de23f5602e0eeffb0248cb6d46f42dcaa", capture: "release142Files" },
] as const;
const BEFORE_FILE = "docs/result/recon-template-platform-ia-final/proof/before.json";
const NAV = [
  ["portfolio", "/portfolio", "포트폴리오"],
  ["portfolio3d", "/3d-portfolio", "3D 포트폴리오"],
  ["about", "/about", "소개"],
  ["contact", "/contact", "견적 문의"],
] as const;
const PAGE_CURRENT: Record<string, string> = { "portfolio.html": "portfolio", "3d-portfolio.html": "portfolio3d", "about.html": "about", "contact.html": "contact" };

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
const sortKeys = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const stripScripts = (h: string) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
const mainOf = (h: string) => /<main[\s\S]*<\/main>/.exec(h)?.[0] ?? "";
const headerOf = (h: string) => /<header class="i1-header"[\s\S]*?<\/header>/.exec(h)?.[0] ?? "";
const hrefsOf = (h: string) => [...h.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]!);

const demoDir = path.join(repoRoot, "data/sites", DEMO);
const pin = (await readJson(path.join(demoDir, "site.json"))).template as { templateVersion: string; releaseId: string; releaseHash: string };
const packageOf = async (siteId: string) => path.join(repoRoot, (await readJson(path.join(repoRoot, "data/site-builds", siteId, "current.json"))).packageDir);
const pkg = await packageOf(DEMO);
const record = await readJson(path.join(pkg, "build-record.json"));
const before = await readJson(path.join(repoRoot, BEFORE_FILE));
async function pagesOf(packageDir: string): Promise<Record<string, string>> {
  const site = path.join(packageDir, "site");
  const files = (await walkFiles(site)).filter((f) => f.endsWith(".html"));
  return Object.fromEntries(await Promise.all(files.map(async (f) => [f, await readFile(path.join(site, f), "utf8")] as const)));
}
const html = await pagesOf(pkg);

// ------------------------------------------------------------- contract --
console.log("\n[contract] additive minor");
await check("S1 Template ≥ 1.5.0 declares the three static routes (no list/item source → one page for every site) after the portfolio routes", () => {
  assert(versionAtLeast(template.version, "1.5.0"), template.version);
  eq(template.routes.slice(-3), IA_ROUTES, "routes");
  eq(template.routes.slice(0, 4).map((r) => r.key), ["home", "portfolio.index", "portfolio.page", "portfolio.detail"], "earlier routes unchanged");
});
await check("S2 new slots are optional or neutral-defaulted: every 1.4.2 site's slots document still resolves (demo pre-cut copy + the three fixtures); new sections have no settings", async () => {
  const header = template.sections["site.header"].slots as Record<string, { neutralDefault?: string }>;
  eq(
    ["portfolio3dNavLabel", "aboutNavLabel", "menuLabel", "menuOpenLabel", "menuCloseLabel"].map((k) => header[k]?.neutralDefault),
    ["3D portfolio", "About", "Menu", "Open menu", "Close menu"],
    "site.header defaults",
  );
  for (const section of ["about.page", "portfolio3d.page", "contact.page"] as const) eq(template.sections[section].defaults, {}, `${section} settings`);
  const bindings = { "business.summary": "A summary." };
  resolveSlots(template, before.slotsJson, bindings);
  for (const s of ["fixture-large", "fixture-small", "fixture-empty"]) resolveSlots(template, await readJson(path.join(repoRoot, "data/sites", s, "slots.json")), bindings);
});

// -------------------------------------------------------------- release --
console.log("\n[release] 1.4.x immutable, platform untouched, the demo moved by an explicit re-pin");
await check("R1 the 1.4.0, 1.4.1 and 1.4.2 releases verify and are byte-identical to the pre-cut capture; exactly one dir per version 1.4.0 / 1.4.1 / 1.4.2 / 1.5.0", async () => {
  for (const frozen of FROZEN) {
    const rel = await loadRelease(repoRoot, "interior-01", frozen.id);
    await verifyRelease(repoRoot, rel);
    eq(rel.releaseHash, frozen.hash, `${frozen.id} releaseHash`);
    eq(await hashTree(path.join(repoRoot, "data/template-releases/interior-01", frozen.id)), before[frozen.capture], `${frozen.id} release files`);
  }
  const dirs = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d.startsWith("interior-01-"));
  eq(["1.4.0", "1.4.1", "1.4.2", "1.5.0"].map((v) => dirs.filter((d) => d.startsWith(`interior-01-${v}-`)).length), [1, 1, 1, 1], "release dirs");
});
await check("R2 boost-interior-demo pins a verified release ≥ 1.5.0 and its current package was built with it (QA pass) — pre-publish: with the V0.1 publish target (demo-rollout.ts); at the 1.5.0 pin, the 1.4.2 package is the rollback (previous)", async () => {
  assert(versionAtLeast(pin.templateVersion, "1.5.0"), pin.templateVersion);
  const rel = await loadRelease(repoRoot, "interior-01", pin.releaseId);
  await verifyRelease(repoRoot, rel);
  eq([rel.releaseHash, rel.templateVersion], [pin.releaseHash, pin.templateVersion], "pin");
  // = the pin once steady; in the Portfolio V0.2 pre-publish window, the frozen V0.1 package's release
  const built = await demoBuiltRelease(repoRoot, pin);
  assert(versionAtLeast(built.templateVersion, "1.5.0"), built.templateVersion);
  eq([record.template.releaseId, record.template.releaseHash, record.status, record.qa.pass], [built.releaseId, built.releaseHash, "success", true], "build record");
  if (pin.templateVersion !== "1.5.0") return; // a later re-pin rotates the rollback pointer: theirs to assert
  const previous = await readJson(path.join(repoRoot, "data/site-builds", DEMO, "previous.json"));
  eq(previous.buildInputId, before.currentPointer.buildInputId, "previous = the package that was current before the cut");
  const prevRecord = await readJson(path.join(repoRoot, previous.packageDir, "build-record.json"));
  eq(prevRecord.template.releaseId, FROZEN[2].id, "rollback package release");
});
await check("R3 platform/ (test/ excluded) is byte-identical to the pre-change capture: a Template-only minor", async () => {
  // Files the first-party integration producer ADDED are excluded like publish/ and test/; files it
  // MODIFIED (but that pre-date it, and so are part of this capture) are instead judged at their
  // pre-integration hash: the capture is still proven for the tree as of the task's start commit
  // (be6b10a); the current content of those files is asserted by integration.test.ts instead.
  // The 1.6.0 surface (V0.2 schema + widget seam, release-160-surface.ts) is treated the same way.
  const overrides = { ...(await integrationSurfaceBefore(repoRoot)), ...(await release160SurfaceBefore(repoRoot)) };
  const now = await hashTree(path.join(repoRoot, "platform"), (f) => f.startsWith("test/") || isPublishSurface(f) || (isIntegrationSurface(f) && !(f in before.platformFiles)) || isRelease160Added(f));
  for (const f of Object.keys(overrides)) if (f in before.platformFiles) now[f] = overrides[f]!;
  eq(now, before.platformFiles, "platform files");
});

// ------------------------------------------------------------ site data --
console.log("\n[site data] only the pin and the declared copy moved");
const SET = {
  "site.header": { projectsNavLabel: "포트폴리오", contactLabel: "견적 문의", portfolio3dNavLabel: "3D 포트폴리오", aboutNavLabel: "소개", menuLabel: "메뉴", menuOpenLabel: "메뉴 열기", menuCloseLabel: "메뉴 닫기" },
} as const;
await check("D1 every demo site file is byte-identical to the pre-cut capture except site.json (pin only) and slots.json (nav labels, list title, back link, intro link label, + the three page sections — nothing else)", async () => {
  if (pin.templateVersion !== "1.5.0") return; // point-in-time proof of the 1.5.0 re-pin; a later content edit is a later step's to assert
  const files = await walkFiles(demoDir);
  eq(files, Object.keys(before.siteFiles).sort(), "file list");
  const changed: string[] = [];
  for (const f of files) if (sha256(await readFile(path.join(demoDir, f))) !== before.siteFiles[f]) changed.push(f);
  eq(changed.sort(), ["site.json", "slots.json"], "changed files");
  const site = await readJson(path.join(demoDir, "site.json"));
  eq({ ...site, template: null }, { ...before.siteJson, template: null }, "site.json outside the pin");
  const slots = await readJson(path.join(demoDir, "slots.json"));
  const v = slots.values;
  const b = before.slotsJson.values;
  eq(sortKeys(v["site.header"]), sortKeys({ ...b["site.header"], ...SET["site.header"] }), "site.header");
  eq([b["site.header"].projectsNavLabel, b["site.header"].contactLabel], ["프로젝트", "상담 문의"], "pre-cut header labels");
  eq(v["portfolio.index"], { ...b["portfolio.index"], title: "포트폴리오" }, "portfolio.index");
  eq(v["portfolio.detail"], { ...b["portfolio.detail"], backLabel: "포트폴리오 목록으로" }, "portfolio.detail");
  eq(v["home.intro"], { ...b["home.intro"], link: { ...b["home.intro"].link, label: "포트폴리오 둘러보기" } }, "home.intro");
  for (const section of ["about.page", "portfolio3d.page", "contact.page"]) assert(v[section] && !b[section], `${section}: new section`);
  const rest = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !["site.header", "portfolio.index", "portfolio.detail", "home.intro", "about.page", "portfolio3d.page", "contact.page"].includes(k)));
  eq({ ...slots, values: rest(v) }, { ...before.slotsJson, values: rest(b) }, "slots.json outside the declared sections");
  eq(v["portfolio3d.page"], { title: "3D 포트폴리오", body: "공간을 더 입체적으로 확인할 수 있는 3D 포트폴리오를 준비하고 있습니다.", portfolioLabel: "포트폴리오 보기" }, "portfolio3d.page copy");
  eq(v["about.page"].media.asset, "site-hero-02", "about photo = an existing site asset");
});
await check("D2 51 / 51 raster assets: registry = 51 rasters, 0 SVG stand-ins, unchanged, and every one is served byte-identical from the current package", async () => {
  const registry = AssetRegistryDocSchema.parse(await readJson(path.join(demoDir, "assets/registry.json")));
  const rasters = registry.items.filter((i) => i.mediaType !== "image/svg+xml");
  const standIns = registry.items.filter((i) => i.mediaType === "image/svg+xml" && i.id !== "logo");
  eq([rasters.length, standIns.length], [51, 0], "rasters / stand-ins");
  const served = await walkFiles(path.join(pkg, "site"));
  const servedHashes = new Set(await Promise.all(served.filter((f) => /\.(jpe?g|webp|png)$/.test(f)).map(async (f) => sha256(await readFile(path.join(pkg, "site", f))))));
  const missing: string[] = [];
  for (const r of rasters) if (!servedHashes.has(sha256(await readFile(path.join(demoDir, "assets", r.file))))) missing.push(r.id);
  eq(missing, [], "rasters not served byte-identical");
});

// -------------------------------------------------------------- package --
console.log("\n[package] the built demo pages");
await check("P1 the package = the 1.4.2 page set + exactly /3d-portfolio, /about, /contact; the route plan generates each once; the sitemap lists them on the demo origin", async () => {
  const files = Object.keys(html).sort();
  eq(files, (await demoExpectedPages(repoRoot)).pages, "HTML pages = the fixed IA pages + Next's error pages + one detail per packaged record");
  for (const f of IA_HTML) assert(files.includes(f), `${f}: page`);
  eq(IA_ROUTES.map((r) => record.preflight.routes[r.key]), [1, 1, 1], "route plan");
  const sitemap = await readFile(path.join(pkg, "site/sitemap.xml"), "utf8");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  eq(locs.slice(-3), IA_PATHS.map((p) => `${ORIGIN}${p}`), "sitemap entries");
  // point-in-time: the 1.4.2 package is the 1.5.0 pin's rollback; a later re-pin prunes it (one-rollback
  // rule) and asserts its own page set / sitemap against its predecessor (1.5.1: ia151.test.ts P1)
  if (pin.templateVersion !== "1.5.0") return;
  const prev = await pagesOf(path.join(repoRoot, before.currentPointer.packageDir));
  eq(files, [...Object.keys(prev), ...IA_HTML].sort(), "HTML set");
  eq(canonical150Sitemap(sitemap), await readFile(path.join(repoRoot, before.currentPointer.packageDir, "site/sitemap.xml"), "utf8"), "sitemap outside the new pages");
  for (const p of IA_PATHS) assert(html[`${p.slice(1)}.html`]!.includes(`<link rel="canonical" href="${ORIGIN}${p}"/>`), `${p}: canonical`);
});
await check("P2 header on EVERY page: brand, then portfolio · 3D · about · the contact pill (one contact link, → /contact), aria-current only on its own page (details: portfolio=true), then the menu button (collapsed, labelled, no aria-controls); no menu markup in the server HTML", () => {
  for (const [f, h] of Object.entries(html)) {
    const header = headerOf(h);
    const nav = [...header.matchAll(/<a class="(i1-header__link|i1-header__cta)" data-nav="([^"]+)"(?: aria-current="([^"]+)")? href="([^"]+)">([^<]*)<\/a>/g)].map((m) => [m[2], m[4], m[5], m[1], m[3] ?? null]);
    const current = PAGE_CURRENT[f] ?? (/^portfolio\/(?!page\/)/.test(f) ? "portfolio" : undefined);
    eq(
      nav,
      NAV.map(([key, href, label]) => [key, href, label, key === "contact" ? "i1-header__cta" : "i1-header__link", key === current ? (f.startsWith("portfolio/") ? "true" : "page") : null]),
      `${f}: nav`,
    );
    eq(hrefsOf(header), ["/", ...NAV.map((n) => n[1])], `${f}: header links`);
    assert(header.includes('<button type="button" class="i1-header__menu" aria-label="메뉴 열기" aria-haspopup="dialog" aria-expanded="false" data-menu-button="">'), `${f}: menu button`);
    assert(!/<dialog\b|data-menu=""|i1-menu__/.test(stripScripts(h)), `${f}: menu markup in the server HTML`);
  }
});
await check("P3 every contact CTA → /contact: the floating seat on every page, the detail CTA on every detail, the hero's contact slide; the only mailto links are the footer address (every page) and the /contact direct address", async () => {
  for (const [f, h] of Object.entries(html)) {
    const seat = [...h.matchAll(/<div class="i1-fcta" data-section="site\.floating-cta"><a class="i1-fcta__link" data-floating-cta="" href="([^"]+)">[\s\S]*?<span>([^<]*)<\/span><\/a><\/div>/g)].map((m) => [m[1], m[2]]);
    eq(seat, [["/contact", "상담 문의"]], `${f}: floating seat`);
    const mailtos = hrefsOf(h).filter((x) => x.startsWith("mailto:"));
    eq(mailtos, f === "contact.html" ? [`mailto:${EMAIL}`, `mailto:${EMAIL}`] : [`mailto:${EMAIL}`], `${f}: mailto links`);
  }
  const details = Object.entries(html).filter(([f]) => /^portfolio\/(?!page\/)[^/]+\.html$/.test(f));
  eq(details.map(([f]) => f).sort(), (await demoExpectedPages(repoRoot)).details, "details = one per packaged record");
  for (const [f, h] of details) assert(h.includes('<div class="i1-detail__cta" data-cta=""><p>비슷한 공사를 계획하고 계신가요?</p><a class="i1-button" href="/contact">상담 문의하기</a></div>'), `${f}: detail CTA`);
  const hero = /data-section="home\.hero"[\s\S]*?<\/section>/.exec(html["index.html"]!)?.[0] ?? "";
  assert(/<a class="i1-pill i1-pill--light" href="\/contact">/.test(hero), "hero contact slide");
});
await check("P4 /about: title, lead, the photo (existing site asset), body, the five principles in order, contact CTA + portfolio link", async () => {
  const m = mainOf(html["about.html"]!);
  const slots = (await readJson(path.join(demoDir, "slots.json"))).values["about.page"];
  assert(m.startsWith('<main class="i1-main" data-page="about"><div class="i1-page i1-about" data-section="about.page">'), "section");
  assert(m.includes('<h1 class="i1-page__title">소개</h1>'), "h1");
  assert(m.includes(`<div class="i1-page__lead"><p>${slots.lead.paragraphs[0]}</p></div>`), "lead");
  const registry = await readJson(path.join(demoDir, "assets/registry.json"));
  const asset = registry.items.find((i: { id: string }) => i.id === "site-hero-02");
  const img = /<div class="i1-about__media"><img src="([^"]+)" width="(\d+)" height="(\d+)" alt="([^"]*)"/.exec(m);
  assert(img, "photo");
  eq([Number(img[2]), Number(img[3]), img[4]], [asset.width, asset.height, slots.media.alt], "photo");
  eq(sha256(await readFile(path.join(pkg, "site", img[1]!))), sha256(await readFile(path.join(demoDir, "assets", asset.file))), "photo bytes");
  for (const p of slots.body.paragraphs) assert(m.includes(`<p>${p}</p>`), `body: ${p.slice(0, 20)}`);
  const points = [...m.matchAll(/<li class="i1-about__point"><span class="i1-about__num" aria-hidden="true">(\d\d)<\/span><h3 class="i1-about__point-title">([^<]*)<\/h3><p>([^<]*)<\/p><\/li>/g)].map((x) => [x[1], x[2]]);
  eq(points, [["01", "생활 동선"], ["02", "수납"], ["03", "채광"], ["04", "오래 편안한 공간"], ["05", "실거주 중심"]], "principles");
  assert(m.includes('<h2 id="i1-about-points" class="i1-about__points-title">공간을 설계하는 다섯 가지 기준</h2>'), "principles title");
  assert(/<a class="i1-pill" href="\/contact">견적 문의하기<svg/.test(m) && m.includes('<a class="i1-page__more" href="/portfolio">포트폴리오 보기</a>'), "actions");
});
await check("P5 /3d-portfolio: exactly a title, the one line and a link to the portfolio (no images, forms or other links)", () => {
  const m = mainOf(html["3d-portfolio.html"]!);
  assert(m.includes('<h1 class="i1-page__title">3D 포트폴리오</h1><p class="i1-soon__body">공간을 더 입체적으로 확인할 수 있는 3D 포트폴리오를 준비하고 있습니다.</p>'), "copy");
  eq(hrefsOf(m), ["/portfolio"], "links");
  assert(!/<img|<form|<iframe|<video|<canvas/.test(m), "nothing more");
});
await check("P6 /contact: 7 fields (name / phone / message required), the site's work types, the not-connected notice, an empty status, no form action/method (no backend), the direct address; no success wording anywhere", () => {
  const m = mainOf(html["contact.html"]!);
  assert(m.includes('<form class="i1-form" data-inquiry-form="">'), "form without action / method");
  const fields = [...m.matchAll(/<(input|select|textarea) id="i1-inquiry-(\w+)"[^>]*?>/g)].map((x) => [x[2], x[1], / required=""/.test(x[0])]);
  eq(fields, [["name", "input", true], ["phone", "input", true], ["region", "input", false], ["area", "input", false], ["workType", "select", false], ["schedule", "input", false], ["message", "textarea", true]], "fields");
  for (const [id, label] of [["name", "이름"], ["phone", "연락처"], ["region", "지역"], ["area", "평형"], ["workType", "공사 유형"], ["schedule", "예상 일정"], ["message", "문의 내용"]]) assert(m.includes(`for="i1-inquiry-${id}">${label}`), `label ${id}`);
  eq([...m.matchAll(/<option value="([^"]*)"/g)].map((x) => x[1]), ["", "전체 리모델링", "부분 리모델링", "주방·욕실 리뉴얼", "입주 전 홈스타일링", "기타"], "work types");
  assert(m.includes("온라인 접수는 아직 연결되어 있지 않습니다."), "notice");
  assert(m.includes('<p class="i1-form__status" role="status" data-inquiry-status=""></p>'), "empty status");
  assert(m.includes(`<dt>이메일</dt><dd><a href="mailto:${EMAIL}">${EMAIL}</a></dd>`), "direct address");
  for (const [f, h] of Object.entries(html)) assert(!/접수되었|접수 완료|전송되었|전송 완료|완료되었/.test(stripScripts(h)), `${f}: success wording`);
});

// ------------------------------------------------------------- fixtures --
console.log("\n[fixtures] the same Template on other sites (neutral copy, no-email site)");
await check("F1 every fixture has the three pages; with an email the CTAs → /contact and the form is there; without one (fixture-empty) no form, the neutral line, and no /contact link anywhere", async () => {
  for (const s of ["fixture-large", "fixture-small", "fixture-empty"]) {
    const pages = await pagesOf(await packageOf(s));
    for (const f of IA_HTML) assert(pages[f], `${s}: ${f} missing`);
    const business = await readJson(path.join(repoRoot, "data/sites", s, "content/business.json"));
    const email = business.data?.contact?.email as string | undefined;
    const contact = mainOf(pages["contact.html"]!);
    if (email) {
      assert(contact.includes('data-inquiry-form=""') && contact.includes(`href="mailto:${email}"`), `${s}: form`);
      assert(/<a class="i1-fcta__link" data-floating-cta="" href="\/contact">/.test(pages["index.html"]!) && /data-nav="contact"[^>]*href="\/contact"/.test(pages["index.html"]!), `${s}: CTAs`);
    } else {
      assert(!contact.includes("<form") && contact.includes('<p class="i1-contact__unavailable">Contact details are not available yet.</p>'), `${s}: no-email page`);
      for (const [f, h] of Object.entries(pages)) assert(!hrefsOf(h).includes("/contact") && !h.includes("mailto:"), `${s}/${f}: contact link`);
    }
  }
  const large = await pagesOf(await packageOf("fixture-large"));
  eq(
    [...headerOf(large["index.html"]!).matchAll(/data-nav="[^"]+" href="[^"]+">([^<]*)</g)].map((x) => x[1]),
    ["Projects", "3D portfolio", "About", "Contact"],
    "fixture-large neutral nav",
  );
  assert(mainOf(large["3d-portfolio.html"]!).includes('<h1 class="i1-page__title">3D portfolio</h1><p class="i1-soon__body">A 3D portfolio is in preparation.</p>'), "neutral 3D page");
  const summary = (await readJson(path.join(repoRoot, "data/sites/fixture-large/content/business.json"))).data.summary as string;
  assert(mainOf(large["about.html"]!).includes(`<h1 class="i1-page__title">About</h1><div class="i1-page__lead"><p>${summary.replaceAll("&", "&amp;")}</p></div>`), "about lead falls back to the business summary");
  assert(!mainOf(large["about.html"]!).includes("i1-about__points"), "no invented principles");
  const empty = await pagesOf(await packageOf("fixture-empty"));
  assert(!hrefsOf(mainOf(empty["3d-portfolio.html"]!)).includes("/portfolio"), "fixture-empty: no link to a portfolio it does not have");
});

// ------------------------------------------------------------ stylesheet --
console.log("\n[stylesheet] responsive header, menu lock, seat on /contact");
await check("C1 inline nav hidden below 900 and flex in the ≥ 900 band (menu button + menu hidden there); open menu locks the page and hides the seat; the seat hides on /contact", async () => {
  const css = (await readFile(path.join(repoRoot, "templates/interior-01/v1/styles/template.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const norm = css.replace(/\s+/g, " ");
  assert(norm.includes(".i1-header__nav { display: none; }"), "base nav hidden");
  assert(/@media \(min-width: 900px\) \{[^@]*\.i1-header__nav \{ display: flex; gap: 28px; \}[^@]*\.i1-header__menu, \.i1-menu \{ display: none; \}/.test(norm), "≥ 900 band");
  assert(norm.includes("html:has(.i1-menu[open]) { overflow: hidden; }") && norm.includes("html:has(.i1-menu[open]) .i1-fcta { display: none; }"), "menu lock / seat");
  assert(norm.includes('body:has(.i1-main[data-page="contact"]) .i1-fcta { display: none; }'), "seat on /contact");
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
