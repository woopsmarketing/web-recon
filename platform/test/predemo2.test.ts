/**
 * Pre-Demo polish 2 validation (interior-01 1.4.2) — four Template-owned changes:
 *   1. home hero arrows at every width (stylesheet asserted here, real widths in
 *      scripts/template-platform-predemo2-smoke.ts — a real browser);
 *   2. a detail gallery with more than one room opens on a first "all" tab with every photo;
 *   3. every gallery photo is the button of a large-photo viewer (client-only <dialog>);
 *   4. an optional site.footer notice under the business facts.
 * Plus what must NOT have moved: the immutable 1.4.0 / 1.4.1 releases, the demo site's documents
 * and its 51 raster assets (against
 * docs/result/recon-template-platform-predemo-polish-2/proof/before.json, captured before the
 * 1.4.2 cut). canonical-142.ts removes exactly what G1 / G2 assert here.
 *
 * Run AFTER `pnpm site:build boost-interior-demo`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/predemo2.test.ts
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { AssetRegistryDocSchema } from "../assets/assets";
import { loadRelease, verifyRelease } from "../release/release";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const FIXTURES = ["fixture-large", "fixture-small", "fixture-empty"];
const FROZEN = [
  { id: "interior-01-1.4.0-9e1ea20da947", hash: "9e1ea20da9472d3bb003a27ff5f7374c76fa350c5941beb79457441576130961", capture: "release140Files" },
  { id: "interior-01-1.4.1-59179ca20368", hash: "59179ca20368d0f48093eacbe3930ce3f3de9b21a65ba27d9bc63defb67933bd", capture: "release141Files" },
] as const;
const BEFORE_FILE = "docs/result/recon-template-platform-predemo-polish-2/proof/before.json";
const NOTICE = "본 사이트는 서비스 시연을 위한 데모이며, 프로젝트 이미지·후기 등 일부 콘텐츠는 AI로 생성된 예시입니다.";
const NEW_DETAIL_LABELS = { allRoomsLabel: "전체", openPhotoLabel: "사진 크게 보기", closeViewerLabel: "닫기" };

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
const sortKeys = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
const escapeHtml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

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
const isDetail = (f: string) => /^portfolio\/(?!page\/)[^/]+(\.html|\/index\.html)$/.test(f) && f !== "portfolio/index.html";

// ------------------------------------------------------------- contract --
console.log("\n[contract] additive patch");
await check("S1 Template ≥ 1.4.2; three optional portfolio.detail labels with neutral defaults + one optional site.footer notice with NO default (every 1.4.1 slots document stays valid)", () => {
  assert(versionAtLeast(template.version, "1.4.2"), template.version);
  const detail = template.sections["portfolio.detail"].slots as Record<string, unknown>;
  eq(
    [detail.allRoomsLabel, detail.openPhotoLabel, detail.closeViewerLabel],
    [
      { type: "text", maxLength: 24, neutralDefault: "All" },
      { type: "text", maxLength: 32, neutralDefault: "View photo" },
      { type: "text", maxLength: 24, neutralDefault: "Close" },
    ],
    "portfolio.detail slots",
  );
  eq((template.sections["site.footer"].slots as Record<string, unknown>).notice, { type: "text", maxLength: 200 }, "site.footer notice slot");
});

// -------------------------------------------------------------- release --
console.log("\n[release] 1.4.0 and 1.4.1 stay immutable, the demo moved by an explicit re-pin");
await check("R1 the 1.4.0 and 1.4.1 releases verify and every file of them is byte-identical to the pre-cut capture; exactly one 1.4.0, one 1.4.1 and one 1.4.2 release dir", async () => {
  for (const frozen of FROZEN) {
    const rel = await loadRelease(repoRoot, "interior-01", frozen.id);
    await verifyRelease(repoRoot, rel);
    eq(rel.releaseHash, frozen.hash, `${frozen.id} releaseHash`);
    const dir = path.join(repoRoot, "data/template-releases/interior-01", frozen.id);
    const now = Object.fromEntries(await Promise.all((await walkFiles(dir)).map(async (f) => [f, sha256(await readFile(path.join(dir, f)))] as const)));
    eq(now, before[frozen.capture], `${frozen.id} release files`);
  }
  const dirs = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d.startsWith("interior-01-"));
  eq(["1.4.0", "1.4.1", "1.4.2"].map((v) => dirs.filter((d) => d.startsWith(`interior-01-${v}-`)).length), [1, 1, 1], "release dirs");
});
await check("R2 boost-interior-demo pins a verified release ≥ 1.4.2 and its current package was built with it (QA pass); the 1.4.1 package is the rollback (previous)", async () => {
  assert(versionAtLeast(pin.templateVersion, "1.4.2"), pin.templateVersion);
  const rel = await loadRelease(repoRoot, "interior-01", pin.releaseId);
  await verifyRelease(repoRoot, rel);
  eq([rel.releaseHash, rel.templateVersion], [pin.releaseHash, pin.templateVersion], "pin");
  eq([record.template.releaseId, record.template.releaseHash, record.status, record.qa.pass], [pin.releaseId, pin.releaseHash, "success", true], "build record");
  if (pin.templateVersion !== "1.4.2") return; // a later re-pin rotates the rollback pointer: theirs to assert
  const previous = await readJson(path.join(repoRoot, "data/site-builds", DEMO, "previous.json"));
  eq(previous.buildInputId, before.currentPointer.buildInputId, "previous = the package that was current before the cut");
  const prevRecord = await readJson(path.join(repoRoot, previous.packageDir, "build-record.json"));
  eq(prevRecord.template.releaseId, FROZEN[1].id, "rollback package release");
});

// ------------------------------------------------------------ site data --
console.log("\n[site data] nothing of the customer's moved except the pin, three labels and the notice");
await check("D1 every demo site file is byte-identical to the pre-cut capture except site.json (pin only) and slots.json (+3 detail labels, + the footer notice, nothing else)", async () => {
  if (pin.templateVersion !== "1.4.2") return; // point-in-time proof of the 1.4.2 re-pin; a later content edit is a later step's to assert
  const files = await walkFiles(demoDir);
  eq(files, Object.keys(before.siteFiles).sort(), "file list");
  const changed: string[] = [];
  for (const f of files) if (sha256(await readFile(path.join(demoDir, f))) !== before.siteFiles[f]) changed.push(f);
  eq(changed.sort(), ["site.json", "slots.json"], "changed files");
  const site = await readJson(path.join(demoDir, "site.json"));
  eq({ ...site, template: null }, { ...before.siteJson, template: null }, "site.json outside the pin");
  const slots = await readJson(path.join(demoDir, "slots.json"));
  const { allRoomsLabel, openPhotoLabel, closeViewerLabel, ...detailRest } = slots.values["portfolio.detail"];
  eq({ allRoomsLabel, openPhotoLabel, closeViewerLabel }, NEW_DETAIL_LABELS, "new labels");
  eq(sortKeys(detailRest), sortKeys(before.slotsJson.values["portfolio.detail"]), "portfolio.detail slots outside the new labels");
  const { notice, ...footerRest } = slots.values["site.footer"];
  eq(notice, NOTICE, "footer notice");
  eq(sortKeys(footerRest), sortKeys(before.slotsJson.values["site.footer"]), "site.footer slots outside the notice");
  eq(
    { ...slots, values: { ...slots.values, "portfolio.detail": null, "site.footer": null } },
    { ...before.slotsJson, values: { ...before.slotsJson.values, "portfolio.detail": null, "site.footer": null } },
    "slots.json outside portfolio.detail / site.footer",
  );
});
await check("D2 51 / 51 raster assets: registry = 51 rasters, 0 SVG stand-ins, and every one is served byte-identical from the current package", async () => {
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
console.log("\n[package] the built pages");
const html = await pagesOf(pkg);
const details = Object.entries(html).filter(([f]) => isDetail(f));

const ZOOM = /<button type="button" class="i1-gallery__zoom" aria-haspopup="dialog" aria-label="([^"<>]*)" data-gallery-zoom=""><\/button>/g;
interface Panel { id: string; hidden: boolean; seats: string[]; zoomLabels: string[] }
/** the gallery of one detail page: its tabs and, per panel, each photo seat's HTML without the viewer button */
function galleryOf(file: string, h: string) {
  const start = h.indexOf('<div class="i1-gallery" data-gallery="">');
  assert(start >= 0, `${file}: no gallery`);
  const gallery = h.slice(start, h.indexOf('<div class="i1-detail__info', start));
  const tabs = [...gallery.matchAll(/<button type="button" role="tab" id="i1-gallery-tab-([^"]+)" aria-selected="(true|false)" aria-controls="i1-gallery-panel-([^"]+)" tabindex="(0|-1)" class="i1-gallery__tab" data-gallery-tab="([^"]+)">([^<>]*)<!-- --> <span class="i1-gallery__count">\(<!-- -->(\d+)<!-- -->\)<\/span><\/button>/g)].map((m) => {
    eq([m[3], m[5]], [m[1], m[1]], `${file}: tab ${m[1]} ids`);
    return { id: m[1]!, selected: m[2] === "true", tabindex: m[4]!, name: m[6]!, count: Number(m[7]) };
  });
  const panels: Panel[] = gallery
    .split(/(?=<div id="i1-gallery-panel-)/)
    .slice(1)
    .map((p) => {
      const head = /^<div id="i1-gallery-panel-([^"]+)"[^>]*>/.exec(p)!;
      assert(head[0].includes(`data-gallery-panel="${head[1]}"`), `${file}: panel ${head[1]} data attribute`);
      const list = /<ul id="i1-gallery-strip-([^"]+)" class="i1-gallery__grid">([\s\S]*?)<\/ul>/.exec(p);
      assert(list && list[1] === head[1], `${file}: panel ${head[1]} strip`);
      const seats = list[2]!.split(/(?=<li class="i1-gallery__item")/).filter(Boolean);
      const zoomLabels = seats.map((s) => {
        const found = [...s.matchAll(ZOOM)];
        assert(found.length === 1 && s.endsWith(`${found[0]![0]}</li>`), `${file}: panel ${head[1]}: a seat must END with exactly one viewer button: ${s.slice(-260)}`);
        return found[0]![1]!;
      });
      return { id: head[1]!, hidden: / hidden=""/.test(head[0]), seats: seats.map((s) => s.replace(ZOOM, "")), zoomLabels };
    });
  return { tabs, panels };
}
/** the lead photo of a view is eager; as any later seat of the "all" view it is lazy */
const lazy = (seat: string) => seat.replace('loading="eager"', 'loading="lazy"');

await check('G1 a gallery with more than one room opens on the "all" view: first tab, selected, site label, count = every photo; its seats are the rooms\' seats in room order; rooms keep their ids 0..n-1, unselected and hidden; a one-room gallery has neither tabs nor an "all" view', () => {
  assert(details.length === 8, `detail pages: ${details.length}`);
  let withAll = 0;
  for (const [f, h] of details) {
    const { tabs, panels } = galleryOf(f, h);
    const rooms = panels.filter((p) => p.id !== "all");
    eq(rooms.map((p) => p.id), rooms.map((_, i) => String(i)), `${f}: room panel ids`);
    if (rooms.length === 1) {
      eq([tabs.length, panels.length, panels[0]!.hidden], [0, 1, false], `${f}: one-room gallery`);
      continue;
    }
    withAll++;
    eq(panels[0]!.id, "all", `${f}: first panel`);
    eq(tabs.map((t) => t.id), ["all", ...rooms.map((p) => p.id)], `${f}: tab order`);
    const total = rooms.reduce((n, p) => n + p.seats.length, 0);
    eq([tabs[0]!.name, tabs[0]!.count, tabs[0]!.selected, tabs[0]!.tabindex], [NEW_DETAIL_LABELS.allRoomsLabel, total, true, "0"], `${f}: "all" tab`);
    for (const t of tabs.slice(1)) eq([t.selected, t.tabindex, t.count], [false, "-1", rooms[Number(t.id)]!.seats.length], `${f}: room tab ${t.id}`);
    eq(panels.map((p) => p.hidden), [false, ...rooms.map(() => true)], `${f}: only the "all" panel shows`);
    const expected = rooms.flatMap((p) => p.seats).map((s, i) => (i === 0 ? s : lazy(s)));
    eq(panels[0]!.seats, expected, `${f}: "all" seats = the rooms' seats in room order`);
  }
  assert(withAll >= 1, "no demo project has more than one room");
});
await check("G2 every photo seat ends with ONE viewer button labelled «site label n / N: the photo's alt» for its own view; the viewer itself is client-only (no <dialog> in any page)", () => {
  let seats = 0;
  for (const [f, h] of details) {
    for (const p of galleryOf(f, h).panels) {
      // the name says which photo: the seat's own (after) alt, as the HTML already escapes it
      const alt = (seat: string) => /<img src="[^"]*" width="\d+" height="\d+" alt="([^"]*)"/.exec(seat)?.[1] ?? "";
      eq(p.zoomLabels, p.seats.map((s, i) => `${escapeHtml(NEW_DETAIL_LABELS.openPhotoLabel)} ${i + 1} / ${p.seats.length}${alt(s) ? `: ${alt(s)}` : ""}`), `${f} panel ${p.id}: viewer button labels`);
      seats += p.seats.length;
    }
  }
  assert(seats > 0, "no seats");
  for (const [f, h] of Object.entries(html)) assert(!/<dialog\b|data-gallery-viewer|i1-viewer/.test(h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")), `${f}: viewer markup in the server HTML`);
});
await check("N1 the footer notice: on EVERY demo page, once, the site's exact text, inside the footer after the business facts and before the floating CTA; a site without a value renders no notice element at all", async () => {
  for (const [f, h] of Object.entries(html)) {
    const footer = /<footer class="i1-footer"[\s\S]*?<\/footer>/.exec(h)?.[0];
    assert(footer, `${f}: no footer`);
    const found = [...h.matchAll(/<p class="i1-footer__notice" data-footer-notice="">([^<]*)<\/p>/g)];
    eq([found.length, found[0]?.[1]], [1, escapeHtml(NOTICE)], `${f}: notice`);
    const at = footer.indexOf(found[0]![0]);
    assert(at > footer.indexOf("</dl>") && footer.indexOf("</dl>") > 0, `${f}: notice is not after the business facts`);
    const cta = footer.indexOf("i1-fcta");
    assert(cta < 0 || at < cta, `${f}: notice after the floating CTA`);
  }
  for (const fixture of FIXTURES) {
    const slots = await readJson(path.join(repoRoot, "data/sites", fixture, "slots.json"));
    assert(slots.values?.["site.footer"]?.notice === undefined, `${fixture} sets a notice`);
    for (const [f, h] of Object.entries(await pagesOf(await packageOf(fixture)))) assert(!h.includes("i1-footer__notice") && !h.includes("data-footer-notice"), `${fixture} ${f}: a notice element without a value`);
  }
});
await check("H1 stylesheet: no rule hides the home hero arrows at any width (the only arrow-less hero is the one-slide hero, which renders no controls at all)", async () => {
  const css = (await readFile(path.join(repoRoot, "templates/interior-01/v1/styles/template.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1]!.split(",").some((s) => /\.i1-hero__arrow(?![\w-])/.test(s)));
  assert(rules.length >= 2, `hero arrow rules: ${rules.length}`);
  for (const r of rules) assert(!/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])/.test(r[2]!), `hides the arrows: ${r[0]!.trim()}`);
  // brace depth 0 = outside every @media block, i.e. the rule applies at every width
  const depth = (index: number) => css.slice(0, index).split("{").length - css.slice(0, index).split("}").length;
  assert(rules.some((r) => /display\s*:\s*inline-flex/.test(r[2]!) && depth(r.index! + r[1]!.length) === 0), "no base (every width) display rule");
  const home = html["index.html"];
  assert(home && /i1-hero__arrow--prev/.test(home) && /i1-hero__arrow--next/.test(home), "demo home hero has no arrows in its HTML");
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
