/**
 * interior-02 · home.keywords — a chip shows the projects of ITS filter, or it is not shown
 * (`pnpm test:interior-02-home-keywords`).
 *
 * The defect this holds shut (releases up to 1.1.1): a chip's setting is normalized for the site's
 * vocabulary, which lists only what at least one project matches. A chip whose values no project
 * matched came out as the EMPTY filter — "no constraint" — and was shown with every project: a site
 * with one 27평 project showed it under "30평대" and "40평대 이상".
 *
 *   F  the function     the working tree's homeKeywords (= the bytes of the release of the working
 *                       tree's version) over a NEW site exactly as the provisioning starter makes
 *                       it (scaffolded here into a throwaway root): the three area chips against
 *                       27 / 34 / 45평, a project without an area, ㎡ records, the bucket bounds; a
 *                       chip of two dimensions (all / part / none of a dimension left); style /
 *                       type / price / keyword chips nothing matches; the empty setting ({} + a
 *                       label) still shows everything; `limit`; bucket ids of another area scale
 *   K  the runtime kit  the kit built from that release, against the kit of the frozen release
 *                       1.1.0 (the one the sites pin): the frozen kit shows the 27평 project
 *                       under all three chips, the new one under the first only; and with the
 *                       settings of boost-interior-demo-02 and the FROZEN demo dataset of this
 *                       repository (demo-frozen-dataset.ts — not what production holds today)
 *                       the two kits compose the same home.keywords
 *   C  compatibility    every interior-02 site of this checkout that sets a chip, each read
 *                       through the root the repository reads it by (testSiteRoot): the home page
 *                       data computed by the 1.1.0 release's own bundled runtime and by the new
 *                       release's — which chips exist and which projects each one holds
 *
 * The kit checks render a package that was BUILT with 1.1.0 and re-pinned in memory; a page of a
 * package built with the new release has not been opened by this file (no build, no browser).
 *
 * Reads the release store, the starter, the frozen dataset and data/sites/<the interior-02 sites>
 * (+ the current package of boost-interior-demo-02); writes only under the OS temp directory.
 * No build, no network.
 */
import assertNode from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { RUNTIME_FILE, SHELL_FILE } from "../portfolio-runtime/contract";
import type { PortfolioSiteInput, PortfolioSiteResult } from "../portfolio-runtime/entry";
import { templateRelOf } from "../portfolio-runtime/capability";
import { RENDERER_FILE, buildRuntimeKit, bundleRuntimeKit } from "../portfolio-runtime/kit";
import { scaffoldSite } from "../provision/scaffold";
import { STARTERS_DIR } from "../provision/starter";
import { loadRelease, releaseDir, verifyRelease } from "../release/release";
import { createSiteContext } from "../site/context";
import { buildSiteSnapshot } from "../site/load";
import { sha256 } from "../util/hash";
import { frozenDemoRoot, testSiteRoot } from "./demo-frozen-dataset";
import template from "../../templates/interior-02/v1/template";
import { homeKeywords } from "../../templates/interior-02/v1/sections/HomeKeywords";

const repoRoot = process.cwd();
const TEMPLATE = "interior-02";
/** the frozen release every interior-02 site of this checkout pins — the last one a site was built with before the fix */
const BEFORE_RELEASE = "interior-02-1.1.0-be2c1e2d3850";
const DEMO = "boost-interior-demo-02";
const SMOKE_SPEC = "platform/provision/fixtures/smoke-spec.json";
const AT = "2026-10-10T00:00:00.000Z";
const SECTION = "home.keywords";
const HOME_KEYWORDS_SOURCE = `templates/${TEMPLATE}/v1/sections/HomeKeywords.tsx`;

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
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8")) as any;
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ---------------------------------------------------------------- releases --
const headId = await (async () => {
  const ids = (await readdir(path.join(repoRoot, "data/template-releases", TEMPLATE))).filter((d) => d.startsWith(`${TEMPLATE}-${template.version}-`));
  if (ids.length !== 1) throw new Error(`releases of the working-tree version ${template.version}: ${ids.join(", ") || "none"} (run template:release ${TEMPLATE}@1)`);
  return ids[0]!;
})();
const head = await loadRelease(repoRoot, TEMPLATE, headId);
const before = await loadRelease(repoRoot, TEMPLATE, BEFORE_RELEASE);
const pinOf = (r: typeof head) => ({ templateId: r.templateId, templateVersion: r.templateVersion, releaseId: r.releaseId, releaseHash: r.releaseHash });
const headPin = pinOf(head);

// ------------------------------------------------------------ what a chip shows --
interface ChipView {
  id: string;
  label: string;
  href?: string;
  projects: string[];
}
type KeywordsData = { chips: { id: string; label: string; href?: string }[]; panels: Record<string, { id: string }[]> };
/** chip → its label, its "more" link and the ids of its cards in order; no section → [] */
function chipsOf(data: KeywordsData | undefined): ChipView[] {
  if (!data) return [];
  eq(Object.keys(data.panels).sort(), data.chips.map((c) => c.id).sort(), "one panel per chip");
  return data.chips.map((c) => ({ id: c.id, label: c.label, href: c.href, projects: data.panels[c.id]!.map((m) => m.id) }));
}
const chip = (id: string, label: string, href: string, projects: string[]): ChipView => ({ id, label, href, projects });

// ----------------------------------------------------------------- records --
const CATEGORIES = [
  { id: "full-remodel", name: "전체 리모델링" },
  { id: "kitchen-bath", name: "주방·욕실 리뉴얼" },
];
const COVER = { id: "hk-cover", file: "hk-cover.jpg", mediaType: "image/jpeg", width: 1600, height: 1200, sha256: "c".repeat(64), publicPath: `/assets/${"c".repeat(20)}.jpg` };
type Area = { value: number; unit: "pyeong" | "m2" | "sqft"; basis?: "supply" | "exclusive" | "unknown" };
interface RecordOptions {
  area?: Area;
  keywords?: string[];
  category?: string;
  title?: string;
  pricePerArea?: { amount: number; currency: string; unit: "pyeong" | "m2" | "sqft" };
}
/** `day` orders the records: a later day is a newer project (the default order is newest first) */
function rec(id: string, day: number, o: RecordOptions = {}) {
  return {
    id,
    slug: id,
    title: o.title ?? `시공사례 ${id}`,
    status: "published",
    publishedAt: `2026-09-${String(day).padStart(2, "0")}T09:00:00+09:00`,
    category: o.category ?? "full-remodel",
    cover: { asset: COVER.id, alt: "거실" },
    summary: "회귀 테스트용 시공사례입니다.",
    ...(o.area ? { area: o.area } : {}),
    ...(o.keywords ? { keywords: o.keywords } : {}),
    ...(o.pricePerArea ? { pricePerArea: o.pricePerArea } : {}),
  };
}
const py = (value: number): Area => ({ value, unit: "pyeong", basis: "supply" });
const m2 = (value: number): Area => ({ value, unit: "m2", basis: "exclusive" });
const P27 = rec("p27", 1, { area: py(27) });
const P34 = rec("p34", 2, { area: py(34) });
const P45 = rec("p45", 3, { area: py(45) });
const NO_AREA = rec("p-no-area", 4);

const L1 = "20평대 이하";
const L2 = "30평대";
const L3 = "40평대 이상";

const tmp = await mkdtemp(path.join(os.tmpdir(), "interior-02-home-keywords-"));
try {
  // ══ the new site, as the starter makes it ════════════════════════════════════════════════════
  console.log("\n[fixture] a new site of the provisioning starter");
  let starterSnapshot: any;
  await check("S1 the starter scaffolds a new site whose home.keywords is the three area chips: 20평대 이하 {lt20, 20} · 30평대 {30} · 40평대 이상 {40, 50plus}, scale pyeong — and no fourth chip", async () => {
    const root = path.join(tmp, "root");
    await mkdir(path.join(root, "data/sites"), { recursive: true });
    await symlink(path.join(repoRoot, "data/template-releases"), path.join(root, "data/template-releases"));
    await symlink(path.join(repoRoot, STARTERS_DIR), path.join(root, STARTERS_DIR));
    const spec = await readJson(path.join(repoRoot, SMOKE_SPEC));
    await scaffoldSite({ repoRoot: root, spec });
    starterSnapshot = (await buildSiteSnapshot({ repoRoot: root, siteId: spec.siteId, mode: "public", at: AT })).snapshot;
    const settings = starterSnapshot.settings.overrides[SECTION];
    eq(
      [settings.areaScale, settings.chip1, settings.chip2, settings.chip3, settings.chip4, settings.chip5, settings.chip6],
      ["pyeong", { area: ["lt20", "20"] }, { area: ["30"] }, { area: ["40", "50plus"] }, undefined, undefined, undefined],
      "the starter's chip settings",
    );
    const slots = starterSnapshot.slots.values[SECTION];
    eq([slots.chip1Label, slots.chip2Label, slots.chip3Label, slots.chip4Label, slots.chip5Label, slots.chip6Label], [L1, L2, L3, undefined, undefined, undefined], "the starter's chip labels");
    eq([starterSnapshot.content.projects.length, starterSnapshot.content.categories.length], [0, 0], "a new site has no portfolio");
  });
  await check("S2 the function under test is the released one: the working tree's HomeKeywords.tsx is byte-identical to the file in the release of the working tree's version, which differs from the frozen 1.1.0 file", async () => {
    await verifyRelease(repoRoot, head);
    await verifyRelease(repoRoot, before);
    const live = sha256(await readFile(path.join(repoRoot, HOME_KEYWORDS_SOURCE)));
    eq(head.files.find((f) => f.path === HOME_KEYWORDS_SOURCE)?.sha256, live, `${headId} ${HOME_KEYWORDS_SOURCE}`);
    assert(before.files.find((f) => f.path === HOME_KEYWORDS_SOURCE)?.sha256 !== live, "the frozen release already has the working tree's HomeKeywords.tsx");
  });

  /**
   * The section's data for a site that publishes `projects`: the starter's site, the working tree's
   * Template. `settings` / `labels` are merged over the starter's home.keywords (a fourth chip, another scale).
   */
  function keywords(projects: ReturnType<typeof rec>[], over: { settings?: Record<string, unknown>; labels?: Record<string, string> } = {}) {
    const snap = structuredClone(starterSnapshot);
    snap.site.template = headPin;
    snap.content.projects = [...projects].sort(byId);
    snap.content.categories = CATEGORIES;
    snap.assets = [...snap.assets, COVER].sort(byId);
    Object.assign(snap.settings.overrides[SECTION], over.settings ?? {});
    Object.assign(snap.slots.values[SECTION], over.labels ?? {});
    const ctx = createSiteContext({ siteId: snap.siteId, template, templateRelease: headPin, mode: "public", at: AT, snapshot: snap });
    return homeKeywords(ctx);
  }
  const chips = (...args: Parameters<typeof keywords>) => chipsOf(keywords(...args));
  /** a fourth chip on top of the starter's three */
  const fourth = (label: string, setting: Record<string, unknown>, settings: Record<string, unknown> = {}) => ({ settings: { chip4: setting, ...settings }, labels: { chip4Label: label } });

  // ══ F. the function ═══════════════════════════════════════════════════════════════════════════
  console.log("\n[function] homeKeywords of the working tree, the starter's three area chips");
  await check("F1 one 27평 project → only 20평대 이하, holding it; its link names the one bucket the site has", () => {
    eq(chips([P27]), [chip("chip1", L1, "/portfolio?area=20", ["p27"])], "chips");
  });
  await check("F2 one 34평 project → only 30평대", () => {
    eq(chips([P34]), [chip("chip2", L2, "/portfolio?area=30", ["p34"])], "chips");
  });
  await check("F3 one 45평 project → only 40평대 이상 (one of its two buckets is enough)", () => {
    eq(chips([P45]), [chip("chip3", L3, "/portfolio?area=40", ["p45"])], "chips");
    eq(chips([rec("p55", 1, { area: py(55) })]), [chip("chip3", L3, "/portfolio?area=50plus", ["p55"])], "the other bucket");
  });
  await check("F4 27평 + 34평 → 20평대 이하 (27 only) and 30평대 (34 only); no 40평대 이상", () => {
    eq(chips([P27, P34]), [chip("chip1", L1, "/portfolio?area=20", ["p27"]), chip("chip2", L2, "/portfolio?area=30", ["p34"])], "chips");
  });
  await check("F5 27평 + 34평 + 45평 → three chips, one project each", () => {
    eq(chips([P27, P34, P45]), [chip("chip1", L1, "/portfolio?area=20", ["p27"]), chip("chip2", L2, "/portfolio?area=30", ["p34"]), chip("chip3", L3, "/portfolio?area=40", ["p45"])], "chips");
  });
  await check("F6 a project without an area is in no area chip: alone → no section; with a 34평 project → only 30평대, holding only the 34평 one", () => {
    eq(keywords([NO_AREA]), undefined, "alone");
    eq(chips([NO_AREA, P34]), [chip("chip2", L2, "/portfolio?area=30", ["p34"])], "with a 34평 project");
    eq(keywords([]), undefined, "no project at all");
  });
  await check("F7 ㎡ records are converted, not read as 평: 27㎡ (8.2평) and 89㎡ (26.9평) → 20평대 이하 only; 110㎡ (33.3평) → 30평대 only; 150㎡ (45.4평) → 40평대 이상 only", () => {
    eq(chips([rec("m27", 1, { area: m2(27) })]), [chip("chip1", L1, "/portfolio?area=lt20", ["m27"])], "27㎡");
    eq(chips([rec("m89", 1, { area: m2(89) })]), [chip("chip1", L1, "/portfolio?area=20", ["m89"])], "89㎡");
    eq(chips([rec("m110", 1, { area: m2(110) })]), [chip("chip2", L2, "/portfolio?area=30", ["m110"])], "110㎡");
    eq(chips([rec("m150", 1, { area: m2(150) })]), [chip("chip3", L3, "/portfolio?area=40", ["m150"])], "150㎡");
  });
  await check("F8 the bucket bounds are half-open: 29.99평 → 20평대 이하; exactly 30평 → 30평대; exactly 40평 → 40평대 이상; 19평 → 20평대 이하 (its other bucket)", () => {
    eq(chips([rec("b2999", 1, { area: py(29.99) })]).map((c) => c.id), ["chip1"], "29.99평");
    eq(chips([rec("b30", 1, { area: py(30) })]).map((c) => c.id), ["chip2"], "30평");
    eq(chips([rec("b40", 1, { area: py(40) })]).map((c) => c.id), ["chip3"], "40평");
    eq(chips([rec("b19", 1, { area: py(19) })]), [chip("chip1", L1, "/portfolio?area=lt20", ["b19"])], "19평");
    eq(chips([rec("b19", 1, { area: py(19) }), rec("b24", 2, { area: py(24) })]), [chip("chip1", L1, "/portfolio?area=lt20&area=20", ["b24", "b19"])], "19평 + 24평: both buckets, newest first");
  });

  console.log("\n[function] chips of other dimensions (a fourth chip beside the starter's three)");
  const WHITE34 = rec("w34", 5, { area: py(34), keywords: ["화이트", "미니멀"] });
  const MODERN34 = rec("o34", 6, { area: py(34), keywords: ["모던"] });
  const WHITE27 = rec("w27", 7, { area: py(27), keywords: ["화이트"] });
  const MODERN27 = rec("o27", 8, { area: py(27), keywords: ["모던"] });
  await check("F9 a chip of two dimensions ({area: 30, style: 화이트}) is their AND: both on the site → the projects that are both; one dimension with nothing left → no chip; both left but no project is both → no chip", () => {
    const two = fourth("30평대 화이트", { area: ["30"], style: ["화이트"] });
    const fourthOf = (projects: ReturnType<typeof rec>[]) => chips(projects, two).filter((c) => c.id === "chip4");
    eq(fourthOf([WHITE34, MODERN34, WHITE27]), [chip("chip4", "30평대 화이트", "/portfolio?area=30&style=%ED%99%94%EC%9D%B4%ED%8A%B8", ["w34"])], "both dimensions on the site");
    eq(fourthOf([WHITE27]), [], "no 30평대 project (the area is dropped; 화이트 alone must not carry the chip)");
    eq(fourthOf([MODERN34]), [], "no 화이트 project (the style is dropped; 30평대 alone must not carry the chip)");
    eq(fourthOf([WHITE27, MODERN34]), [], "a 화이트 project and a 30평대 project, none that is both");
    // the area chips beside it are unaffected
    eq(chips([WHITE27], two), [chip("chip1", L1, "/portfolio?area=20", ["w27"])], "the site with one 27평 화이트 project");
  });
  await check("F10 a style-only chip: its style on the site → the projects that have it; no project has it → no chip (also on a site where no project has any style word)", () => {
    const natural = fourth("내추럴", { style: ["내추럴"] });
    const fourthOf = (projects: ReturnType<typeof rec>[]) => chips(projects, natural).filter((c) => c.id === "chip4");
    eq(fourthOf([rec("n1", 1, { area: py(27), keywords: ["내추럴", "우드 포인트"] }), WHITE34]), [chip("chip4", "내추럴", "/portfolio?style=%EB%82%B4%EC%B6%94%EB%9F%B4", ["n1"])], "one 내추럴 project");
    eq(fourthOf([WHITE34, MODERN27]), [], "other styles only");
    eq(fourthOf([P27, P34]), [], "no style word at all");
  });
  await check("F11 a type-only chip: its category has a project → those; a category without a project, or an id that is no category → no chip", () => {
    const kitchen = rec("k1", 9, { area: py(27), category: "kitchen-bath" });
    const fourthOf = (projects: ReturnType<typeof rec>[], type: string) => chips(projects, fourth("주방·욕실", { type: [type] })).filter((c) => c.id === "chip4");
    eq(fourthOf([kitchen, P34], "kitchen-bath"), [chip("chip4", "주방·욕실", "/portfolio?type=kitchen-bath", ["k1"])], "one kitchen-bath project");
    eq(fourthOf([P27, P34], "kitchen-bath"), [], "the category exists, no project is in it");
    eq(fourthOf([P27, P34], "no-such-category"), [], "not a category of the site");
  });
  await check("F12 a price chip: a project in its bucket → that one; no project with a price, a price in another bucket, or a site without a price scale → no chip", () => {
    const priced = rec("pr1", 9, { area: py(34), pricePerArea: { amount: 2_900_000, currency: "KRW", unit: "pyeong" } });
    const fourthOf = (projects: ReturnType<typeof rec>[], settings: Record<string, unknown> = {}) => chips(projects, fourth("평당 250–300만 원", { price: ["250"] }, settings)).filter((c) => c.id === "chip4");
    eq(fourthOf([priced, P27]), [chip("chip4", "평당 250–300만 원", "/portfolio?price=250", ["pr1"])], "one project in the bucket");
    eq(fourthOf([P27, P34]), [], "no project has a price");
    eq(fourthOf([rec("pr2", 9, { area: py(34), pricePerArea: { amount: 3_200_000, currency: "KRW", unit: "pyeong" } })]), [], "a price in another bucket");
    eq(fourthOf([priced], { priceScale: "none" }), [], "the section has no price scale");
  });
  await check("F13 a keyword chip is never dropped by the vocabulary: it is evaluated — matching projects, or no chip; together with an area nothing has → no chip", () => {
    const named = rec("s1", 9, { area: py(34), title: "수성 화이트 34평 아파트" });
    const fourthOf = (projects: ReturnType<typeof rec>[], setting: Record<string, unknown>) => chips(projects, fourth("검색", setting)).filter((c) => c.id === "chip4");
    eq(fourthOf([named, P27], { keyword: "수성" }), [chip("chip4", "검색", "/portfolio?keyword=%EC%88%98%EC%84%B1", ["s1"])], "a matching keyword");
    eq(fourthOf([named, P27], { keyword: "어디에도없는말" }), [], "a keyword nothing matches");
    eq(fourthOf([named, P27], { keyword: "수성", area: ["40"] }), [], "a matching keyword and an area bucket no project is in");
  });
  await check("F14 the empty setting keeps its meaning: {} (or a blank keyword) + a label → a chip with EVERY project, newest first, linking to the plain list; without a label → no chip", () => {
    const all = [P27, P34, P45, NO_AREA];
    const everything = chip("chip4", "전체", "/portfolio", ["p-no-area", "p45", "p34", "p27"]);
    eq(chips(all, fourth("전체", {})).filter((c) => c.id === "chip4"), [everything], "{}");
    eq(chips(all, fourth("전체", { keyword: "" })).filter((c) => c.id === "chip4"), [everything], "a blank keyword");
    eq(chips([NO_AREA], fourth("전체", {})), [chip("chip4", "전체", "/portfolio", ["p-no-area"])], "the only chip of a site whose one project has no area");
    eq(chips(all, { settings: { chip4: {} } }).map((c) => c.id), ["chip1", "chip2", "chip3"], "{} without a label");
  });

  await check("F15 `limit` caps the cards, not the chip: more matches than the limit → the chip is shown with the newest `limit` projects, and its link still names the whole normalized filter", () => {
    const five = [rec("a21", 1, { area: py(21) }), rec("a22", 2, { area: py(22) }), rec("a19", 3, { area: py(19) }), rec("a27", 4, { area: py(27) }), rec("a29", 5, { area: py(29) }), P34];
    eq(chips(five, { settings: { limit: 2 } }), [chip("chip1", L1, "/portfolio?area=lt20&area=20", ["a29", "a27"]), chip("chip2", L2, "/portfolio?area=30", ["p34"])], "limit 2");
    eq(chips(five, { settings: { limit: 1 } }).map((c) => [c.id, c.projects]), [["chip1", ["a29"]], ["chip2", ["p34"]]], "limit 1");
    eq(chips(five)[0]!.projects, ["a29", "a27", "a19", "a22", "a21"], "the starter's limit (8) holds all five");
  });
  await check("F16 a chip of two dimensions where one is only PARTLY dropped stays: {area: [30, 40], style: [화이트, 내추럴]} on a site with 30평대 화이트 projects only → the chip, with the values that are left, and a link that names only those", () => {
    const partly = fourth("넓은 화이트", { area: ["30", "40"], style: ["화이트", "내추럴"] });
    const fourthOf = (projects: ReturnType<typeof rec>[]) => chips(projects, partly).filter((c) => c.id === "chip4");
    eq(fourthOf([WHITE34, MODERN34, WHITE27]), [chip("chip4", "넓은 화이트", "/portfolio?area=30&style=%ED%99%94%EC%9D%B4%ED%8A%B8", ["w34"])], "40평대 and 내추럴 are not on the site");
    const natural45 = rec("n45", 9, { area: py(45), keywords: ["내추럴"] });
    eq(fourthOf([WHITE34, natural45, WHITE27]), [chip("chip4", "넓은 화이트", "/portfolio?area=30&area=40&style=%ED%99%94%EC%9D%B4%ED%8A%B8&style=%EB%82%B4%EC%B6%94%EB%9F%B4", ["n45", "w34"])], "all four values on the site");
  });
  await check("F17 bucket ids that do not belong to the section's area scale name nothing: the starter's 평 chips under areaScale m2 → no chip, so no section (before the fix: every chip with every project); a chip that names a bucket of that scale is shown", () => {
    const all = [P27, P34, P45];
    eq(keywords(all, { settings: { areaScale: "m2" } }), undefined, "평 bucket ids, m2 scale");
    // 34평 = 112.4㎡ → bucket "90" of the m2 scale; 27평 = 89.3㎡ → "60"; 45평 = 148.8㎡ → "120"
    eq(chips(all, { settings: { areaScale: "m2", chip4: { area: ["90"] } }, labels: { chip4Label: "90–120㎡" } }), [chip("chip4", "90–120㎡", "/portfolio?area=90", ["p34"])], "a bucket of the m2 scale beside them");
  });
  await check("F18 exactly one chip left → the section's data is that one chip and its one panel, with the section's own copy (title, chip-group label, 'more' label)", () => {
    const data = keywords([P27, NO_AREA]);
    assert(data, "no section");
    eq([data.chips.length, Object.keys(data.panels)], [1, ["chip1"]], "chips, panels");
    eq(data.chips[0], { id: "chip1", label: L1, href: "/portfolio?area=20" }, "the chip");
    eq(data.panels.chip1!.map((m) => [m.id, m.href, m.area]), [["p27", "/portfolio/p27", { figure: "27", unit: "PY" }]], "its panel: the card of the 27평 project");
    const slots = starterSnapshot.slots.values[SECTION];
    eq([data.title, data.chipsLabel, data.moreLabel], [slots.title, slots.chipsLabel, slots.moreLabel], "the section's copy");
  });

  // ══ K. the runtime kit ════════════════════════════════════════════════════════════════════════
  console.log("\n[kit] the runtime kit of the release, against the frozen 1.1.0 kit");
  type Render = (input: PortfolioSiteInput) => PortfolioSiteResult;
  async function loadKit(releaseId: string): Promise<Render> {
    const kit = await buildRuntimeKit({ repoRoot, templateId: TEMPLATE, releaseId, sourceCommit: "test" });
    const dir = path.join(tmp, `kit-${releaseId}`);
    await mkdir(dir);
    await writeFile(path.join(dir, RENDERER_FILE), kit.files[RENDERER_FILE]);
    return ((await import(pathToFileURL(path.join(dir, RENDERER_FILE)).href)) as { renderPortfolioSite: Render }).renderPortfolioSite;
  }
  function slotData(html: string): Record<string, unknown> {
    const m = /<script[^>]*id="recon-portfolio-slots"[^>]*>([\s\S]*?)<\/script>/.exec(html);
    assert(m, "the page carries no slot data");
    return JSON.parse(m[1]!) as Record<string, unknown>;
  }
  function homeOf(result: PortfolioSiteResult): { body: string; slots: Record<string, unknown> } {
    if (!result.ok) throw new Error(`the kit refused: ${JSON.stringify(result.problems).slice(0, 600)}`);
    const home = result.files.find((f) => f.path === "/");
    assert(home, "no home page");
    return { body: home.body, slots: slotData(home.body) };
  }

  // The demo site: its current shell package (data/site-builds, built with the release it pins) and
  // a dataset for it. The site's portfolio is owned by BoostChat (portfolio-source@2): what its live
  // directory holds is not a dataset of this checkout and is not read here. The dataset is the FROZEN
  // one the site was authored with, composed into a throwaway copy of the site (frozenDemoRoot) —
  // not what production serves today.
  const demoFrozen = await frozenDemoRoot(repoRoot, DEMO);
  const demoDir = demoFrozen.siteDir;
  const current = await readJson(path.join(repoRoot, "data/site-builds", DEMO, "current.json"));
  const packageSite = path.join(repoRoot, current.packageDir as string, "site");
  const runtime = await readJson(path.join(packageSite, RUNTIME_FILE));
  const shell = await readJson(path.join(packageSite, SHELL_FILE));
  const shellPages: Record<string, string> = {};
  for (const file of runtime.shellPages as string[]) shellPages[file] = await readFile(path.join(packageSite, file), "utf8");
  const demoProjects = (await readJson(path.join(demoDir, "content/projects.json"))).items as any[];
  const demoCategories = (await readJson(path.join(demoDir, "content/categories.json"))).items as { id: string; name: string }[];
  const referenced = new Set<string>();
  JSON.stringify(demoProjects, (key, value) => (key === "asset" && typeof value === "string" ? (referenced.add(value), value) : value));
  const demoAssets: any[] = [];
  for (const entry of ((await readJson(path.join(demoDir, "assets/registry.json"))).items as any[]).filter((a) => referenced.has(a.id))) {
    const bytes = await readFile(path.join(demoDir, "assets", entry.file));
    demoAssets.push({ ...entry, sha256: sha256(bytes), size: bytes.length });
  }
  /**
   * The package's two documents for the kit of `release`. The package was built with the release the
   * site pins; a kit renders its own release only, so for the other kit the pin — and nothing else —
   * is rewritten in memory (the two releases differ in HomeKeywords.tsx and template.ts: no shell page).
   */
  function documentsFor(release: typeof head, starterChips: boolean): Pick<PortfolioSiteInput, "runtime" | "shell" | "shellPages"> {
    const r = structuredClone(runtime);
    const s = structuredClone(shell);
    r.template = pinOf(release);
    s.snapshot.site.template = pinOf(release);
    if (starterChips) {
      s.snapshot.settings.overrides[SECTION] = structuredClone(starterSnapshot.settings.overrides[SECTION]);
      s.snapshot.slots.values[SECTION] = structuredClone(starterSnapshot.slots.values[SECTION]);
    }
    return { runtime: r, shell: s, shellPages };
  }
  /** one real record of the demo site, with another id and area */
  const demoVariant = (id: string, area: Area | undefined) => {
    const { area: _area, ...rest } = demoProjects[0];
    return { ...rest, id, slug: id, ...(area ? { area } : {}) };
  };

  let renderBefore!: Render;
  let renderHead!: Render;
  await check(`K1 the two kits build from the release store: ${BEFORE_RELEASE} (frozen) and ${headId}; the package documents are those of ${DEMO}, pinned to the frozen release`, async () => {
    eq([runtime.siteId, runtime.template.releaseId, shell.snapshot.site.template.releaseId], [DEMO, BEFORE_RELEASE, BEFORE_RELEASE], "the demo package");
    assert(demoProjects.length >= 8 && demoCategories.length >= 4, `the demo dataset: ${demoProjects.length} records, ${demoCategories.length} categories`);
    const differs = (() => {
      const [a, b] = [new Map(before.files.map((f) => [f.path, f.sha256])), new Map(head.files.map((f) => [f.path, f.sha256]))];
      return [...new Set([...a.keys(), ...b.keys()])].filter((rel) => a.get(rel) !== b.get(rel)).sort();
    })();
    eq(differs, [HOME_KEYWORDS_SOURCE, `templates/${TEMPLATE}/v1/template.ts`], `files that differ between ${BEFORE_RELEASE} and ${headId}`);
    renderBefore = await loadKit(BEFORE_RELEASE);
    renderHead = await loadKit(headId);
  });
  const starterInput = (release: typeof head, projects: unknown[]): PortfolioSiteInput => ({ ...documentsFor(release, true), portfolio: { categories: demoCategories, projects, assets: demoAssets }, at: AT });
  await check("K2 one 27평 project, the starter's chips — the frozen kit shows it under all three chips (the defect: the same chips, links and cards a 1.1.0 site served with one 27평 project); the new kit under 20평대 이하 only", () => {
    const one = [demoVariant("hk-27", py(27))];
    const old = chipsOf(homeOf(renderBefore(starterInput(before, one))).slots[SECTION] as KeywordsData);
    eq(old, [chip("chip1", L1, "/portfolio?area=20", ["hk-27"]), chip("chip2", L2, "/portfolio", ["hk-27"]), chip("chip3", L3, "/portfolio", ["hk-27"])], `${BEFORE_RELEASE}`);
    const home = homeOf(renderHead(starterInput(head, one)));
    eq(chipsOf(home.slots[SECTION] as KeywordsData), [chip("chip1", L1, "/portfolio?area=20", ["hk-27"])], headId);
    // …and the page itself: one chip, one card in the section, no placeholder left
    const section = /<section[^>]*data-section="home\.keywords"[\s\S]*?<\/section>/.exec(home.body)?.[0] ?? "";
    assert(section.includes(L1) && !section.includes(L2) && !section.includes(L3), "the rendered section names a chip it does not have");
    assert(!home.body.includes("data-portfolio-slot"), "a placeholder is left on the home page");
  });
  await check("K3 the new kit, the starter's chips: 34평 → 30평대 only; 27 + 34평 → two chips; a project without an area → no section; nothing published → no section, the home page still composes", () => {
    const view = (projects: unknown[]) => chipsOf(homeOf(renderHead(starterInput(head, projects))).slots[SECTION] as KeywordsData | undefined);
    eq(view([demoVariant("hk-34", py(34))]), [chip("chip2", L2, "/portfolio?area=30", ["hk-34"])], "34평");
    eq(view([demoVariant("hk-27", py(27)), demoVariant("hk-34", py(34))]).map((c) => [c.id, c.projects]), [["chip1", ["hk-27"]], ["chip2", ["hk-34"]]], "27평 + 34평");
    eq(view([demoVariant("hk-none", undefined)]), [], "no area");
    const empty = homeOf(renderHead(starterInput(head, [])));
    assert(empty.slots[SECTION] === undefined && !empty.body.includes('data-section="home.keywords"') && !empty.body.includes("data-portfolio-slot"), "nothing published: the section is left out and no placeholder remains");
  });
  await check(`K4 ${DEMO}, its own settings and shell package with the frozen demo dataset of this repository (8 records): the new kit composes the same home.keywords as the frozen kit — six chips, the same labels, links and projects in the same order (the whole slot data is equal)`, () => {
    const demoInput = (release: typeof head): PortfolioSiteInput => ({ ...documentsFor(release, false), portfolio: { categories: demoCategories, projects: demoProjects, assets: demoAssets }, at: AT });
    const [old, now] = [homeOf(renderBefore(demoInput(before))), homeOf(renderHead(demoInput(head)))];
    const [oldChips, newChips] = [chipsOf(old.slots[SECTION] as KeywordsData), chipsOf(now.slots[SECTION] as KeywordsData)];
    eq(newChips, oldChips, "chips (id, label, link, projects in order)");
    eq(oldChips.map((c) => c.id), ["chip1", "chip2", "chip3", "chip4", "chip5", "chip6"], "the six chips of the demo site");
    assert(oldChips.every((c) => c.projects.length > 0 && c.href !== "/portfolio"), "a demo chip is empty or unfiltered");
    assertNode.deepStrictEqual(now.slots[SECTION], old.slots[SECTION], "home.keywords slot data");
    console.log(oldChips.map((c) => `         ${c.id} "${c.label}" ${c.href} → ${c.projects.join(", ")}`).join("\n"));
  });

  // ══ C. every interior-02 site of this checkout ════════════════════════════════════════════════
  console.log("\n[compatibility] every interior-02 site that sets a chip: the 1.1.0 release's own runtime against the new release's");
  /**
   * The release's OWN modules, bundled from its frozen files exactly as its kit is (the bundler of
   * every kit, with the release gate's probe): its manifest, its createSiteContext and its
   * runtime/portfolio.ts. Nothing of the working tree computes the "before".
   */
  interface ReleaseRuntime {
    template: unknown;
    createSiteContext(input: { siteId: string; template: unknown; templateRelease: ReturnType<typeof pinOf>; mode: "public"; at: string; snapshot: unknown }): unknown;
    portfolioRuntime: { pages(ctx: unknown): { path: string; slots: Record<string, unknown> }[] };
  }
  async function releaseRuntime(release: typeof head): Promise<ReleaseRuntime> {
    const bundle = await bundleRuntimeKit({ filesDir: path.join(releaseDir(repoRoot, TEMPLATE, release.releaseId), "files"), templateRel: templateRelOf(release), info: { kitFormat: 1, kind: "portfolio-runtime", ...pinOf(release) }, probe: true });
    const dir = path.join(tmp, `probe-${release.releaseId}`);
    await mkdir(dir);
    await writeFile(path.join(dir, RENDERER_FILE), bundle.renderer);
    return ((await import(pathToFileURL(path.join(dir, RENDERER_FILE)).href)) as { probe: { release: ReleaseRuntime } }).probe.release;
  }
  /** home.keywords of a whole site (its full snapshot, pinned to `release` in memory), computed by that release's runtime */
  function homeKeywordsBy(runtimeOf: ReleaseRuntime, release: typeof head, snapshot: any): KeywordsData | undefined {
    const snap = structuredClone(snapshot);
    snap.site.template = pinOf(release);
    const ctx = runtimeOf.createSiteContext({ siteId: snap.siteId, template: runtimeOf.template, templateRelease: pinOf(release), mode: "public", at: AT, snapshot: snap });
    const home = runtimeOf.portfolioRuntime.pages(ctx).find((p) => p.path === "/");
    assert(home, "the release's runtime produced no home page");
    // exactly what a page carries: the data as JSON
    return JSON.parse(JSON.stringify(home.slots))[SECTION] as KeywordsData | undefined;
  }
  const CHIP_KEYS = ["chip1", "chip2", "chip3", "chip4", "chip5", "chip6"];
  const sites: { siteId: string; chipKeys: string[] }[] = [];
  for (const siteId of (await readdir(path.join(repoRoot, "data/sites"))).sort()) {
    const site = await readJson(path.join(repoRoot, "data/sites", siteId, "site.json")).catch(() => undefined);
    if (site?.template?.templateId !== TEMPLATE) continue;
    const overrides = (await readJson(path.join(repoRoot, "data/sites", siteId, "settings.json"))).overrides?.[SECTION] ?? {};
    const chipKeys = CHIP_KEYS.filter((k) => overrides[k] !== undefined);
    if (chipKeys.length > 0) sites.push({ siteId, chipKeys });
  }
  let runtimeBefore!: ReleaseRuntime;
  let runtimeHead!: ReleaseRuntime;
  await check(`C1 the interior-02 sites of this checkout that set a chip: ${sites.map((s) => s.siteId).join(", ") || "none"} — all pinned to ${BEFORE_RELEASE}; the two releases' runtimes bundle from their own frozen files`, async () => {
    eq(sites.map((s) => s.siteId), ["boost-interior-demo-02", "ongyeol-interior-demo"], "sites (a new interior-02 site with chips: add its expectation to this file's report, nothing else)");
    for (const s of sites) eq((await readJson(path.join(repoRoot, "data/sites", s.siteId, "site.json"))).template.releaseId, BEFORE_RELEASE, `${s.siteId} pin`);
    runtimeBefore = await releaseRuntime(before);
    runtimeHead = await releaseRuntime(head);
  });
  for (const { siteId, chipKeys } of sites) {
    await check(`C2 ${siteId} (${chipKeys.length} chips set): with the new release no chip gains or loses a project; a chip disappears only if every value of one of its dimensions matches no project of the site — and for this site none does: the whole home.keywords data is identical`, async () => {
      // the root the repository reads this site by: itself, or — for a site whose portfolio BoostChat owns — the frozen composition
      const { root } = await testSiteRoot(repoRoot, siteId);
      const { snapshot } = await buildSiteSnapshot({ repoRoot: root, siteId, mode: "public", at: AT });
      assert(snapshot.content.projects.length > 0, `${siteId}: the snapshot holds no project (read through the wrong root?)`);
      const [old, now] = [homeKeywordsBy(runtimeBefore, before, snapshot), homeKeywordsBy(runtimeHead, head, snapshot)];
      const [oldChips, newChips] = [chipsOf(old), chipsOf(now)];
      const gone = oldChips.filter((c) => !newChips.some((n) => n.id === c.id)).map((c) => c.id);
      const added = newChips.filter((n) => !oldChips.some((c) => c.id === n.id)).map((n) => n.id);
      console.log(`         ${siteId}: ${snapshot.content.projects.length} projects · chips ${oldChips.length} → ${newChips.length}${gone.length ? ` · gone: ${gone.join(", ")}` : ""}`);
      console.log(newChips.map((c) => `           ${c.id} "${c.label}" ${c.href} → ${c.projects.join(", ")}`).join("\n"));
      eq(added, [], "chips only the new release shows");
      // whatever is still shown is shown exactly as before: same label, same link, same projects in the same order
      eq(newChips, oldChips.filter((c) => !gone.includes(c.id)), "the chips both releases show");
      eq(gone, [], "chips the new release leaves out (a real change on this site: name them here and report it)");
      eq(oldChips.map((c) => c.id), chipKeys, "every chip the site sets has a label and a match");
      assertNode.deepStrictEqual(now, old, "home.keywords data");
    });
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log(`\ninterior-02-home-keywords: ${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
