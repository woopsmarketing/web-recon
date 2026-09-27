/**
 * Pre-Demo tiny polish validation (interior-01 1.4.1) — two Template-owned display changes:
 *   1. the detail photo strip gets previous / next arrows (markup asserted here, behaviour in
 *      scripts/template-platform-predemo-gallery-smoke.ts — a real browser);
 *   2. Korean locale + KRW + pyeong renders "평당 290만 원"; every other combination stays generic.
 * Plus what must NOT have moved: the immutable 1.4.0 release, the demo site's documents and its
 * 51 raster assets (against docs/result/recon-template-platform-predemo-polish/proof/before.json,
 * captured before the 1.4.1 cut).
 *
 * Run AFTER `pnpm site:build boost-interior-demo`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/predemo.test.ts
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { AssetRegistryDocSchema } from "../assets/assets";
import { loadRelease, verifyRelease } from "../release/release";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";
import { demoBuiltRelease, demoExpectedPages } from "./demo-rollout";
import { formatPricePerArea } from "../../templates/interior-01/v1/lib/format";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const FLAGSHIP_SLUG = "suseong-white-34py-apartment-remodeling";
const RELEASE_140 = { id: "interior-01-1.4.0-9e1ea20da947", hash: "9e1ea20da9472d3bb003a27ff5f7374c76fa350c5941beb79457441576130961" };
const BEFORE_FILE = "docs/result/recon-template-platform-predemo-polish/proof/before.json";

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
const visibleText = (h: string) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const demoDir = path.join(repoRoot, "data/sites", DEMO);
const pin = (await readJson(path.join(demoDir, "site.json"))).template as { templateVersion: string; releaseId: string; releaseHash: string };
const ptr = await readJson(path.join(repoRoot, "data/site-builds", DEMO, "current.json"));
const pkg = path.join(repoRoot, ptr.packageDir);
const record = await readJson(path.join(pkg, "build-record.json"));
const before = await readJson(path.join(repoRoot, BEFORE_FILE));

// ------------------------------------------------------------ formatter --
console.log("\n[price] Korean per-pyeong notation, display only");
await check("F1 ko + KRW + pyeong → 평당 N만 원 (ko-KR and bare ko); exact 만 fractions stay exact", () => {
  const krw = (amount: number, locale?: string) => formatPricePerArea({ amount, currency: "KRW", unit: "pyeong" }, locale);
  eq([krw(2_900_000, "ko-KR"), krw(2_900_000, "ko"), krw(2_500_000, "KO-kr")], ["평당 290만 원", "평당 290만 원", "평당 250만 원"], "whole 만");
  eq([krw(12_500_000, "ko-KR"), krw(2_955_000, "ko-KR"), krw(2_955_500, "ko-KR"), krw(10_000, "ko-KR")], ["평당 1,250만 원", "평당 295.5만 원", "평당 295.55만 원", "평당 1만 원"], "grouping / fractions");
});
await check("F2 never rounds: an amount 만 cannot show exactly (or outside 1만–1억) stays in won", () => {
  const krw = (amount: number) => formatPricePerArea({ amount, currency: "KRW", unit: "pyeong" }, "ko-KR");
  eq([krw(2_955_550), krw(9_900), krw(100_000_000), krw(2_900_000.5)], ["평당 2,955,550원", "평당 9,900원", "평당 100,000,000원", "평당 2,900,000.5원"], "won fallback");
});
await check("F3 every other locale / currency / unit combination (and no locale) keeps the generic form", () => {
  eq(
    [
      formatPricePerArea({ amount: 2_900_000, currency: "KRW", unit: "pyeong" }),
      formatPricePerArea({ amount: 2_900_000, currency: "KRW", unit: "pyeong" }, "en-US"),
      formatPricePerArea({ amount: 2_900_000, currency: "KRW", unit: "pyeong" }, "kok-IN"),
      formatPricePerArea({ amount: 2_900_000, currency: "KRW", unit: "m2" }, "ko-KR"),
      formatPricePerArea({ amount: 2_000, currency: "USD", unit: "pyeong" }, "ko-KR"),
      formatPricePerArea({ amount: 0.01, currency: "USD", unit: "sqft" }, "en-US"),
    ],
    ["KRW 2,900,000 / 평", "KRW 2,900,000 / 평", "KRW 2,900,000 / 평", "KRW 2,900,000 / m²", "USD 2,000 / 평", "USD 0.01 / sq ft"],
    "generic",
  );
});

// ------------------------------------------------------------- contract --
console.log("\n[contract] additive patch");
await check("S1 Template ≥ 1.4.1; the two arrow labels are optional portfolio.detail slots with neutral defaults (every 1.4.0 slots document stays valid)", () => {
  assert(versionAtLeast(template.version, "1.4.1"), template.version);
  const slots = template.sections["portfolio.detail"].slots as Record<string, { type: string; neutralDefault?: string }>;
  eq([slots.previousPhotoLabel, slots.nextPhotoLabel], [{ type: "text", maxLength: 24, neutralDefault: "Previous photo" }, { type: "text", maxLength: 24, neutralDefault: "Next photo" }], "slots");
});

// -------------------------------------------------------------- release --
console.log("\n[release] 1.4.0 stays immutable, the demo moved by an explicit re-pin");
await check("R1 the 1.4.0 release verifies and every file of it is byte-identical to the pre-cut capture; exactly one 1.4.0 and one 1.4.1 release dir", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", RELEASE_140.id);
  await verifyRelease(repoRoot, rel);
  eq(rel.releaseHash, RELEASE_140.hash, "1.4.0 releaseHash");
  const dir = path.join(repoRoot, "data/template-releases/interior-01", RELEASE_140.id);
  const now = Object.fromEntries(await Promise.all((await walkFiles(dir)).map(async (f) => [f, sha256(await readFile(path.join(dir, f)))] as const)));
  eq(now, before.release140Files, "1.4.0 release files");
  const dirs = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d.startsWith("interior-01-"));
  eq([dirs.filter((d) => d.startsWith("interior-01-1.4.0-")).length, dirs.filter((d) => d.startsWith("interior-01-1.4.1-")).length], [1, 1], "release dirs");
});
await check("R2 boost-interior-demo pins a verified release ≥ 1.4.1 and its current package was built with it (QA pass) — pre-publish: with the V0.1 publish target (demo-rollout.ts)", async () => {
  assert(versionAtLeast(pin.templateVersion, "1.4.1"), pin.templateVersion);
  const rel = await loadRelease(repoRoot, "interior-01", pin.releaseId);
  await verifyRelease(repoRoot, rel);
  eq([rel.releaseHash, rel.templateVersion], [pin.releaseHash, pin.templateVersion], "pin");
  // = the pin once steady; in the Portfolio V0.2 pre-publish window, the frozen V0.1 package's release
  const built = await demoBuiltRelease(repoRoot, pin);
  assert(versionAtLeast(built.templateVersion, "1.4.1"), built.templateVersion);
  eq([record.template.releaseId, record.template.releaseHash, record.status, record.qa.pass], [built.releaseId, built.releaseHash, "success", true], "build record");
});

// ------------------------------------------------------------ site data --
console.log("\n[site data] nothing of the customer's moved except the pin and the two new labels");
await check("D1 every demo site file is byte-identical to the pre-cut capture except site.json (pin only) and slots.json (+2 labels only)", async () => {
  // a point-in-time proof up to the 1.4.2 re-pin; 1.5.0 edits the demo's copy (nav/list/detail labels +
  // three new page sections) and asserts that diff against its own pre-cut capture (ia150.test.ts D1)
  if (versionAtLeast(pin.templateVersion, "1.5.0")) return;
  const files = await walkFiles(demoDir);
  eq(files, Object.keys(before.siteFiles).sort(), "file list");
  const changed: string[] = [];
  for (const f of files) if (sha256(await readFile(path.join(demoDir, f))) !== before.siteFiles[f]) changed.push(f);
  eq(changed.sort(), ["site.json", "slots.json"], "changed files");
  const site = await readJson(path.join(demoDir, "site.json"));
  eq({ ...site, template: null }, { ...before.siteJson, template: null }, "site.json outside the pin");
  const slots = await readJson(path.join(demoDir, "slots.json"));
  // labels of later patches are theirs to assert (1.4.2: predemo2.test.ts D1) — here they are only set aside
  const { previousPhotoLabel, nextPhotoLabel, allRoomsLabel: _all, openPhotoLabel: _open, closeViewerLabel: _close, ...detailRest } = slots.values["portfolio.detail"];
  const { notice: _notice, ...footerRest } = slots.values["site.footer"];
  eq([previousPhotoLabel, nextPhotoLabel], ["이전 사진", "다음 사진"], "new labels");
  const sortKeys = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  eq(sortKeys(detailRest), sortKeys(before.slotsJson.values["portfolio.detail"]), "portfolio.detail slots outside the new labels");
  eq({ ...slots, values: { ...slots.values, "portfolio.detail": null, "site.footer": footerRest } }, { ...before.slotsJson, values: { ...before.slotsJson.values, "portfolio.detail": null } }, "slots.json outside portfolio.detail");
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
console.log("\n[package] the built demo pages");
const site = path.join(pkg, "site");
const htmlFiles = (await walkFiles(site)).filter((f) => f.endsWith(".html"));
const html = Object.fromEntries(await Promise.all(htmlFiles.map(async (f) => [f, await readFile(path.join(site, f), "utf8")] as const)));
const details = Object.entries(html).filter(([f]) => /^portfolio\/(?!page\/)[^/]+(\.html|\/index\.html)$/.test(f) && f !== "portfolio/index.html");
const expectedPages = await demoExpectedPages(repoRoot);
await check("P1 the flagship detail shows 평당 290만 원; no page shows the KRW … / 평 form", () => {
  const flagship = details.find(([f]) => f.includes(FLAGSHIP_SLUG));
  assert(flagship, `flagship page not found in ${details.map(([f]) => f).join(", ")}`);
  assert(visibleText(flagship[1]).includes("평당 290만 원"), "flagship price text");
  for (const [f, h] of Object.entries(html)) assert(!/KRW\s*[\d,]+\s*\/\s*평/.test(visibleText(h)), `${f}: generic KRW form`);
});
await check("P2 every multi-photo room has ONE previous + ONE next arrow (site labels, aria-controls its strip, previous disabled on the server HTML) and keeps its counter; single-photo rooms have neither", () => {
  eq(details.map(([f]) => f).sort(), expectedPages.details, "detail pages = one per packaged record");
  let multi = 0;
  for (const [f, h] of details) {
    const panels = h.split(/(?=<div[^>]*data-gallery-panel=")/).slice(1);
    assert(panels.length >= 1, `${f}: no gallery panel`);
    for (const p of panels) {
      const body = p.split('<div class="i1-detail__info')[0]!;
      const gi = /data-gallery-panel="(\d+|all)"/.exec(body)![1];
      const photos = (body.match(/data-gallery-item=""/g) ?? []).length;
      const prev = body.match(/<button[^>]*data-gallery-arrow="prev"[^>]*>/g) ?? [];
      const next = body.match(/<button[^>]*data-gallery-arrow="next"[^>]*>/g) ?? [];
      const counter = (body.match(/class="i1-gallery__counter"/g) ?? []).length;
      if (photos <= 1) {
        eq([prev.length, next.length, counter], [0, 0, 0], `${f} panel ${gi} (single photo)`);
        continue;
      }
      multi++;
      eq([prev.length, next.length, counter], [1, 1, 1], `${f} panel ${gi}`);
      assert(/aria-label="이전 사진"/.test(prev[0]!) && /aria-disabled="true"/.test(prev[0]!) && prev[0]!.includes(`aria-controls="i1-gallery-strip-${gi}"`), `${f} panel ${gi} prev: ${prev[0]}`);
      assert(/aria-label="다음 사진"/.test(next[0]!) && /aria-disabled="false"/.test(next[0]!) && next[0]!.includes(`aria-controls="i1-gallery-strip-${gi}"`), `${f} panel ${gi} next: ${next[0]}`);
      assert(body.includes(`id="i1-gallery-strip-${gi}"`), `${f} panel ${gi}: strip id`);
    }
  }
  assert(multi >= 8, `multi-photo rooms: ${multi}`);
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
