/**
 * Step 4 validation — portfolio list + detail + pagination on the SAME Template (spec §21 A–Y).
 * Run AFTER the new release is cut, the three fixtures are re-pinned and built:
 *   pnpm test:platform   (runs slice1.test.ts, then this file)
 * Throwaway-root builds (preview robots, "new newest project") never touch data/sites or data/site-builds.
 */
import { cp, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContentReader } from "../content/reader";
import { ProjectSchema, ProjectsDocSchema, type Project } from "../content/schema";
import { planRoutes, RoutePlanError } from "../site/routes";
import { buildSite, normalizePreflight, packageIntact, prepareSiteInput, pruneRoutes, unservedSlugWarnings } from "../build/site-build";
import { qaStaticPackage } from "../build/qa";
import { loadRelease, scanTemplateSource, verifyRelease } from "../release/release";
import template, { PORTFOLIO_PAGE_SIZE } from "../../templates/interior-01/v1/template";
import { formatArea, formatCount, formatPeriod, formatPricePerArea, groupDigits } from "../../templates/interior-01/v1/lib/format";
import { pageWindow } from "../../templates/interior-01/v1/components/Pagination";
import { IA_PATHS, withoutIaPages } from "./canonical-150";
import { sitemapIaPaths } from "./canonical-151";
import { homeHasCanonical } from "./canonical-152";
import { releaseFileSealed } from "./git-checkout";

const repoRoot = process.cwd();
const SITES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
const OLD_RELEASE = { id: "interior-01-1.0.0-f27823c3b837", hash: "f27823c3b8379ece2a341ca93561efb669b9e3e4fa7776d475195795a538b7a4" };
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
async function rejects(fn: () => unknown | Promise<unknown>, re: RegExp) {
  try {
    await fn();
  } catch (error) {
    assert(re.test((error as Error).message), `wrong error: ${(error as Error).message}`);
    return;
  }
  throw new Error(`expected failure matching ${re}`);
}
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));
const exists = async (f: string) => (await stat(f).catch(() => undefined)) !== undefined;
/** Semver order of "x.y.z" strings. */
const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};
/** the 1.5.0 static pages (/3d-portfolio, /about, /contact) a package built with ≥ 1.5.0 also has — asserted by ia150.test.ts */
const iaPathsOf = (record: { template: { templateVersion: string } }) => (versionAtLeast(record.template.templateVersion, "1.5.0") ? IA_PATHS : []);
/** the static pages a package's sitemap lists (1.5.1: no /contact on a site without a contact channel) — canonical-151.ts */
const sitemapIaPathsOf = async (s: string, record: { template: { templateVersion: string } }) =>
  sitemapIaPaths(record.template.templateVersion, Boolean((await readJson(path.join(repoRoot, "data/sites", s, "content/business.json"))).data?.contact?.email));
const routeHtml = (p: string) => (p === "/" ? "index.html" : `${p.slice(1)}.html`);
const cardIds = (html: string) => [...html.matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]!);

async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}

const byLatest = (a: Project, b: Project) => {
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  return ta !== tb ? tb - ta : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};
const mk = (id: string, publishedAt: string, extra: Partial<Project> = {}): Project => ({
  id,
  slug: id,
  title: id,
  status: "published",
  publishedAt,
  category: "c1",
  cover: { asset: "a" },
  ...extra,
});
const day = (n: number) => new Date(Date.UTC(2025, 0, 1) + n * 86_400_000).toISOString();

// ------------------------------------------------------------------ units --
console.log("\n[unit] content reader: paginate / getBySlug / listSlugs");
{
  const items = Array.from({ length: 173 }, (_, i) => mk(`p-${String(i + 1).padStart(3, "0")}`, day(i)));
  const reader = createContentReader({ business: {}, categories: [{ id: "c1", name: "C1" }], projects: items });
  const q = { type: "projects" as const, selection: { mode: "latest" as const } };

  await check("C (unit) 173 items at 30/page → 6 pages sized 30/30/30/30/30/23", () => {
    const sizes = [1, 2, 3, 4, 5, 6].map((n) => reader.paginate(q, { page: n, pageSize: 30 })?.items.length);
    assert(sizes.join() === "30,30,30,30,30,23", sizes.join());
    assert(reader.paginate(q, { page: 1, pageSize: 30 })!.pageCount === 6, "pageCount");
    assert(reader.paginate(q, { page: 1, pageSize: 30 })!.total === 173, "total");
  });
  await check("G (unit) out-of-range / non-integer pages → undefined (never an empty page)", () => {
    for (const page of [0, -1, 7, 1.5, Number.NaN]) assert(reader.paginate(q, { page, pageSize: 30 }) === undefined, `page ${page}`);
    const empty = createContentReader({ business: {}, categories: [], projects: [] });
    assert(empty.paginate(q, { page: 1, pageSize: 30 }) === undefined, "empty collection page 1 must not exist");
  });
  await check("K stable ordering: same input (any storage order) → same first/last item on every page", () => {
    const shuffled = [...items].reverse();
    const r2 = createContentReader({ business: {}, categories: [{ id: "c1", name: "C1" }], projects: shuffled });
    for (let n = 1; n <= 6; n++) {
      const a = reader.paginate(q, { page: n, pageSize: 30 })!.items;
      const b = r2.paginate(q, { page: n, pageSize: 30 })!.items;
      assert(a[0]!.id === b[0]!.id && a.at(-1)!.id === b.at(-1)!.id, `page ${n}`);
      assert(a.map((x) => x.id).join() === b.map((x) => x.id).join(), `page ${n} order`);
    }
  });
  await check("L equal publishedAt → stable id (ascending) tie-break across a page boundary", () => {
    const tie = "2025-06-01T00:00:00Z";
    const set = [mk("t-c", tie), mk("t-a", tie), mk("t-b", tie), mk("t-z", day(0))];
    const r = createContentReader({ business: {}, categories: [], projects: set });
    const p1 = r.paginate(q, { page: 1, pageSize: 2 })!.items.map((x) => x.id);
    const p2 = r.paginate(q, { page: 2, pageSize: 2 })!.items.map((x) => x.id);
    assert(p1.join() === "t-a,t-b" && p2.join() === "t-c,t-z", `${p1} | ${p2}`);
  });
  await check("M new newest project: first on page 1, boundaries shift by one, stored items untouched, no page field", () => {
    const before = JSON.stringify(items);
    const newest = mk("p-new", day(999));
    const r2 = createContentReader({ business: {}, categories: [{ id: "c1", name: "C1" }], projects: [...items, newest] });
    const oldP1 = reader.paginate(q, { page: 1, pageSize: 30 })!.items;
    const newP1 = r2.paginate(q, { page: 1, pageSize: 30 })!.items;
    const newP2 = r2.paginate(q, { page: 2, pageSize: 30 })!.items;
    assert(newP1[0]!.id === "p-new", "newest not first");
    assert(newP2[0]!.id === oldP1.at(-1)!.id, "old page-1 last item must move to page 2 first");
    assert(r2.paginate(q, { page: 6, pageSize: 30 })!.items.length === 24, "last page grows 23 → 24");
    assert(JSON.stringify(items) === before, "stored items mutated");
    assert(!ProjectSchema.safeParse({ ...mk("x", day(1)), page: 1 }).success, "a physical page field must be refused by the content model");
  });
  await check("getBySlug / listSlugs: served items only, latest order; drafts only in preview", () => {
    const draft = mk("d-1", day(500), { status: "draft", slug: "draft-one" });
    const pub = createContentReader({ business: {}, categories: [], projects: [...items, draft] });
    const prev = createContentReader({ business: {}, categories: [], projects: [...items, draft] }, { includeDrafts: true });
    assert(pub.getBySlug("projects", "draft-one") === undefined && prev.getBySlug("projects", "draft-one")?.id === "d-1", "draft visibility");
    assert(pub.getBySlug("projects", "no-such-slug") === undefined, "unknown slug");
    assert(pub.listSlugs("projects").join() === [...items].sort(byLatest).map((p) => p.slug).join(), "listSlugs order");
    assert(!pub.listSlugs("projects").includes("draft-one"), "draft slug listed publicly");
  });
  await check("J duplicate published slug → FAIL (stored-document schema AND reader)", async () => {
    const doc = { schema: "projects@1", origin: "synthetic-fixture", items: [mk("a-1", day(1), { slug: "same" }), mk("a-2", day(2), { slug: "same" })] };
    const r = ProjectsDocSchema.safeParse(doc);
    assert(!r.success && r.error.issues.some((i) => /duplicate slug "same"/.test(i.message)), "schema accepted a duplicate slug");
    await rejects(() => createContentReader({ business: {}, categories: [], projects: doc.items }), /duplicate project slug "same"/);
  });
}

console.log("\n[unit] route plan (generation, pruning, reserved slugs)");
{
  const reader = (n: number, extra: Project[] = []) =>
    createContentReader({ business: {}, categories: [], projects: [...Array.from({ length: n }, (_, i) => mk(`r-${i + 1}`, day(i))), ...extra] });
  await check("page 1 is /portfolio; pages 2…N only under /portfolio/page/[n]; /portfolio/page/1 never planned", () => {
    const plan = planRoutes(template.routes, reader(61));
    const byKey = Object.fromEntries(plan.routes.map((r) => [r.key, r.paths]));
    assert(byKey["portfolio.index"]!.join() === "/portfolio", String(byKey["portfolio.index"]));
    assert(byKey["portfolio.page"]!.join() === "/portfolio/page/2,/portfolio/page/3", String(byKey["portfolio.page"]));
    assert(!plan.routes.flatMap((r) => r.paths).includes("/portfolio/page/1"), "page/1 planned");
    assert(plan.prune.length === 0, "nothing to prune");
  });
  await check("exactly one page (12 items) → portfolio.page pruned as a dynamic segment", () => {
    const plan = planRoutes(template.routes, reader(12));
    assert(plan.prune.map((p) => `${p.key}:${p.dir}:${p.scope}`).join() === "portfolio.page:portfolio/page/[n]:segment", JSON.stringify(plan.prune));
  });
  await check("zero items → list page, pages and details all pruned; home (and, 1.5.0, every other static page) stays", () => {
    const plan = planRoutes(template.routes, reader(0));
    const statics = template.routes.filter((r) => !("list" in r) && !("item" in r)).map((r) => r.path);
    assert(statics[0] === "/", "home first");
    assert(plan.routes.flatMap((r) => r.paths).join() === statics.join(), `only the static pages: ${plan.routes.flatMap((r) => r.paths).join()}`);
    assert(
      plan.prune.map((p) => `${p.key}:${p.dir}:${p.scope}`).join() ===
        "portfolio.index:portfolio:page,portfolio.page:portfolio/page/[n]:segment,portfolio.detail:portfolio/[slug]:segment",
      JSON.stringify(plan.prune),
    );
  });
  await check("I reserved slug `page` (static sibling segment) → validation FAIL", async () => {
    await rejects(() => planRoutes(template.routes, reader(3, [mk("x-page", day(50), { slug: "page" })])), /slug "page" is reserved under \/portfolio\/\[slug\]/);
    assert(planRoutes(template.routes, reader(1)).reservedSlugs["portfolio.detail"]!.join() === "index,page", "reserved set");
  });
  await check("I reserved slug `index` (static-export file collision) → validation FAIL", () =>
    rejects(() => planRoutes(template.routes, reader(3, [mk("x-index", day(50), { slug: "index" })])), /slug "index" is reserved/),
  );
  await check("route declarations are validated (bad pattern, dynamic static route, pageSize disagreement)", async () => {
    const r = reader(3);
    await rejects(() => planRoutes([{ key: "a", path: "/a/../b" }], r), /invalid segment/);
    await rejects(() => planRoutes([{ key: "a", path: "/a/[x]" }], r), /needs a list or item source/);
    await rejects(
      () =>
        planRoutes(
          [
            { key: "a", path: "/a", list: { collection: "projects", pageSize: 30, page: "first" } },
            { key: "b", path: "/a/page/[n]", list: { collection: "projects", pageSize: 12, page: "rest" } },
          ],
          r,
        ),
      /disagree on pageSize/,
    );
    await rejects(() => planRoutes([{ key: "a", path: "/" }, { key: "a", path: "/x" }], r), /duplicate route key/);
  });
  await check("Template page size is 30 (observed design), declared once for both list routes", () => {
    assert(PORTFOLIO_PAGE_SIZE === 30, String(PORTFOLIO_PAGE_SIZE));
    const sizes = template.routes.flatMap((r) => ("list" in r ? [r.list.pageSize] : []));
    assert(sizes.length === 2 && sizes.every((s) => s === 30), sizes.join());
  });
  await check("pagination window: all pages ≤ 7, else first · 5 around current · last", () => {
    assert(pageWindow(1, 6).join() === "1,2,3,4,5,6", pageWindow(1, 6).join());
    assert(pageWindow(1, 22).join() === "1,2,3,4,5,6,gap,22", pageWindow(1, 22).join());
    assert(pageWindow(10, 22).join() === "1,gap,8,9,10,11,12,gap,22", pageWindow(10, 22).join());
    assert(pageWindow(22, 22).join() === "1,gap,17,18,19,20,21,22", pageWindow(22, 22).join());
  });
  await check("builder prune re-validates entries (no escape from app/, route dir must exist)", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "step4-prune-"));
    try {
      await mkdir(path.join(tmp, "app/portfolio/page/[n]"), { recursive: true });
      await writeFile(path.join(tmp, "app/portfolio/page.tsx"), "");
      await writeFile(path.join(tmp, "app/portfolio/page/[n]/page.tsx"), "");
      await rejects(() => pruneRoutes(tmp, [{ key: "x", dir: "../../etc", scope: "segment" }]), /invalid route dir/);
      await rejects(() => pruneRoutes(tmp, [{ key: "x", dir: "portfolio/[slug]", scope: "segment" }]), /does not exist/);
      await rejects(() => pruneRoutes(tmp, [{ key: "x", dir: "portfolio", scope: "segment" }]), /requires a dynamic segment/);
      await pruneRoutes(tmp, [
        { key: "portfolio.page", dir: "portfolio/page/[n]", scope: "segment" },
        { key: "portfolio.index", dir: "portfolio", scope: "page" },
      ]);
      assert(!(await exists(path.join(tmp, "app/portfolio"))), "emptied route dirs must be swept");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
}

console.log("\n[unit] project content model + fact formatting");
await check("optional detail facts: absent is valid; contracts enforced (period order, unique keywords, price bounds)", () => {
  assert(ProjectSchema.safeParse(mk("m-1", day(1))).success, "minimal project must be valid");
  const bad: [string, Partial<Project> | Record<string, unknown>][] = [
    ["period end < start", { period: { start: "2024-05", end: "2024-03" } }],
    ["period month 13", { period: { start: "2024-13" } }],
    ["duplicate keywords", { keywords: ["a", "a"] }],
    ["negative price", { pricePerArea: { amount: -1, currency: "USD", unit: "m2" } }],
    ["price above contract", { pricePerArea: { amount: 1e10, currency: "USD", unit: "m2" } }],
    ["price NaN", { pricePerArea: { amount: Number.NaN, currency: "USD", unit: "m2" } }],
    ["lowercase currency", { pricePerArea: { amount: 1, currency: "usd", unit: "m2" } }],
    ["unknown area unit", { area: { value: 10, unit: "acre" } }],
    ["duplicate gallery group", { galleryGroups: [{ name: "K", items: [{ image: { asset: "a" } }] }, { name: "K", items: [{ image: { asset: "b" } }] }] }],
    ["empty gallery group", { galleryGroups: [{ name: "K", items: [] }] }],
    ["unknown fact key", { aptName: "x" }],
  ];
  for (const [what, extra] of bad) assert(!ProjectSchema.safeParse({ ...mk("m-2", day(1)), ...extra }).success, `accepted: ${what}`);
});
await check("Q outlier price/area inside the contract render deterministically (no bucketing, no crash)", () => {
  assert(ProjectSchema.safeParse(mk("o-1", day(1), { pricePerArea: { amount: 987654321.5, currency: "USD", unit: "m2" }, area: { value: 99999, unit: "m2" } })).success, "outlier must be in contract");
  assert(formatPricePerArea({ amount: 987654321.5, currency: "USD", unit: "m2" }) === "USD 987,654,321.5 / m²", formatPricePerArea({ amount: 987654321.5, currency: "USD", unit: "m2" }));
  assert(formatArea({ value: 99999, unit: "m2" }) === "99,999 m²", formatArea({ value: 99999, unit: "m2" }));
  assert(formatPricePerArea({ amount: 2500000, currency: "KRW", unit: "pyeong" }) === "KRW 2,500,000 / 평", "KRW");
  assert(groupDigits(1234.005, 2) === "1,234.01" || groupDigits(1234.005, 2) === "1,234", groupDigits(1234.005, 2));
});

await check("formatting: singular/plural duration, open vs single-month period, 2-decimal contract renders exactly", () => {
  assert(formatCount({ one: "{n} week", other: "{n} weeks" }, 1) === "1 week" && formatCount({ one: "{n} week", other: "{n} weeks" }, 18) === "18 weeks", "duration");
  assert(formatCount({ one: "{n}주", other: "{n}주" }, 1) === "1주", "ko duration");
  assert(formatPeriod({ start: "2024-03" }) === "2024.03" && formatPeriod({ start: "2024-03", end: "2024-03" }) === "2024.03", "single month");
  assert(formatPeriod({ start: "2024-03", end: "2024-08" }) === "2024.03 – 2024.08", "range");
  assert(formatArea({ value: 84.95, unit: "m2" }) === "84.95 m²" && formatPricePerArea({ amount: 0.01, currency: "USD", unit: "sqft" }) === "USD 0.01 / sq ft", "exact decimals");
  for (const bad of [{ area: { value: 84.955, unit: "m2" } }, { pricePerArea: { amount: 0.004, currency: "USD", unit: "m2" } }]) {
    assert(!ProjectSchema.safeParse({ ...mk("d-1", day(1)), ...bad }).success, `accepted >2 decimals: ${JSON.stringify(bad)}`);
  }
});
await check("builder accepts the 1.0.0 preflight shape (routes = manifest, no prune) — class-B compatibility", async () => {
  const legacy = normalizePreflight({ settings: {}, theme: {}, selections: {}, warnings: [], routes: [{ key: "home", path: "/" }], slots: {} });
  assert(JSON.stringify(legacy.routes) === '[{"key":"home","pattern":"/","paths":["/"]}]' && legacy.prune.length === 0, JSON.stringify(legacy));
  await rejects(() => normalizePreflight({ settings: {}, theme: {}, selections: {}, warnings: [], routes: [{ key: "x", path: "/a/[b]" }], slots: {} }), /not a static route/);
});
await check("I (early) unserved draft/scheduled project with a reserved slug → build warning before publish day", () => {
  const w = unservedSlugWarnings([{ id: "d-9", slug: "page", status: "draft" }, { id: "d-8", slug: "fine-slug", status: "draft" }], { "portfolio.detail": ["index", "page"] });
  assert(w.length === 1 && /d-9 .*reserved slug "page"/.test(w[0]!), w.join(" | "));
});

console.log("\n[static] template source rules");
const templateRoot = path.join(repoRoot, "templates/interior-01/v1");
const templateFiles = (await walkFiles(templateRoot)).filter((f) => !/(^|\/)(node_modules|\.next|out)\//.test(f));
await check("allowlist widened narrowly: only `notFound` from next/navigation; other exports/forms and next/* refused", () => {
  const f = "templates/interior-01/v1/app/x/page.tsx";
  assert(scanTemplateSource(f, 'import { notFound } from "next/navigation";', []).length === 0, "notFound refused");
  assert(scanTemplateSource(f, 'import { notFound as nf } from "next/navigation";', []).length === 0, "aliased notFound refused");
  for (const bad of [
    'import { redirect } from "next/navigation";',
    'import { notFound, useRouter } from "next/navigation";',
    'import { permanentRedirect as notFound } from "next/navigation";',
    'import * as nav from "next/navigation";',
    'import nav from "next/navigation";',
    'import "next/navigation";',
    'export { redirect } from "next/navigation";',
    'export * from "next/navigation";',
    'const m = import("next/navigation");',
  ]) {
    assert(scanTemplateSource(f, bad, []).length > 0, `not refused: ${bad}`);
  }
  // "next" (Slice 1 allowlist entry) is type-only: the value export is the server factory
  for (const good of ['import type { Metadata } from "next";', 'import { type Metadata } from "next";', 'type M = import("next").Metadata;']) {
    assert(scanTemplateSource(f, good, []).length === 0, `refused: ${good}`);
  }
  for (const bad of ['import next from "next";', 'import { type Metadata, default as n } from "next";', 'import * as n from "next";', 'const n = import("next");', 'export { default } from "next";']) {
    assert(scanTemplateSource(f, bad, []).length > 0, `not refused: ${bad}`);
  }
  for (const bad of ['import { headers } from "next/headers";', 'import { NextResponse } from "next/server";', 'import Script from "next/script";', 'import x from "next/dist/server/lib/x";', 'import Image from "next/image";']) {
    assert(scanTemplateSource(f, bad, []).length > 0, `not refused: ${bad}`);
  }
});
await check("DETAIL_TEMPLATE_COUNT = 1: one detail route file, one detail section, no per-family variants", async () => {
  const pages = templateFiles.filter((f) => /^app\/portfolio\/.*page\.tsx$/.test(f));
  assert(pages.join() === "app/portfolio/[slug]/page.tsx,app/portfolio/page.tsx,app/portfolio/page/[n]/page.tsx", pages.join());
  const detailSections = templateFiles.filter((f) => /Detail/i.test(f));
  assert(detailSections.join() === "sections/PortfolioDetail.tsx", detailSections.join());
  for (const f of templateFiles) {
    if (!/\.(ts|tsx|css)$/.test(f)) continue;
    const text = await readFile(path.join(templateRoot, f), "utf8");
    assert(!/(?<!font-)family|f00001[12]|variant-[ab]\b/i.test(text), `per-family code in ${f}`);
  }
});

// ---------------------------------------------------------- integration --
console.log("\n[integration] fixture packages on the new release");
const pinOf = async (s: string) => (await readJson(path.join(repoRoot, "data/sites", s, "site.json"))).template;
const pointer = async (s: string, which: "current" | "previous") => {
  const ptr = await readJson(path.join(repoRoot, "data/site-builds", s, `${which}.json`));
  const dir = path.join(repoRoot, ptr.packageDir);
  return { ptr, dir, site: path.join(dir, "site"), record: await readJson(path.join(dir, "build-record.json")) };
};
const cur = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await pointer(s, "current")] as const)));
const prev = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await pointer(s, "previous").catch(() => undefined)] as const)));
const html = async (s: string, route: string) => readFile(path.join(cur[s]!.site, routeHtml(route)), "utf8");
const newPin = await pinOf("fixture-large");

/** Expected visible order computed independently from the stored content (not via the reader). */
async function expectedOrder(s: string): Promise<Project[]> {
  const at = Date.parse(cur[s]!.record.at);
  const all = (await readJson(path.join(repoRoot, "data/sites", s, "content/projects.json"))).items as Project[];
  return all.filter((p) => p.status === "published" && Date.parse(p.publishedAt) <= at).sort(byLatest);
}

await check("A all three sites pin + were built with the SAME new exact release (verified)", async () => {
  const pins = await Promise.all(SITES.map(pinOf));
  assert(new Set(pins.map((p) => `${p.releaseId}|${p.releaseHash}`)).size === 1, "pins differ");
  for (const s of SITES) assert(cur[s]!.record.template.releaseId === newPin.releaseId && cur[s]!.record.template.releaseHash === newPin.releaseHash, `${s} built with ${cur[s]!.record.template.releaseId}`);
  // pins are per site and may lag the working-tree Template (1.5.2 re-pinned only the demo), never lead it
  assert(newPin.releaseId !== OLD_RELEASE.id && versionAtLeast(template.version, newPin.templateVersion), `${newPin.releaseId} / ${template.version}`);
  await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", newPin.releaseId));
});
await check("B old release still exists, verifies, and is byte-for-byte unchanged (hash + read-only files)", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", OLD_RELEASE.id);
  assert(rel.releaseHash === OLD_RELEASE.hash, "old releaseHash changed");
  await verifyRelease(repoRoot, rel);
  // read-only as cut, or (a Git checkout drops the mode) tracked + identical to the commit
  assert(await releaseFileSealed(repoRoot, `data/template-releases/interior-01/${OLD_RELEASE.id}/files/templates/interior-01/v1/template.ts`), "old release file is writable");
  assert(!rel.files.some((f) => f.path.includes("portfolio")), "old release must not contain Step 4 routes");
  const all = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d !== newPin.releaseId && !d.startsWith("."));
  for (const id of all) await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", id));
  assert(all.includes(OLD_RELEASE.id) && all.length >= 2, `older releases: ${all.join()}`);
});
await check("C fixture-large: 173 visible → 6 list pages sized 30/30/30/30/30/23, exact expected order", async () => {
  const order = await expectedOrder("fixture-large");
  assert(order.length === 173, `visible ${order.length}`);
  const routes = ["/portfolio", "/portfolio/page/2", "/portfolio/page/3", "/portfolio/page/4", "/portfolio/page/5", "/portfolio/page/6"];
  const pages = await Promise.all(routes.map(async (r) => cardIds(await html("fixture-large", r))));
  assert(pages.map((p) => p.length).join() === "30,30,30,30,30,23", pages.map((p) => p.length).join());
  assert(pages.flat().join() === order.map((p) => p.id).join(), "list order ≠ publishedAt desc, id asc");
  assert(cur["fixture-large"]!.record.preflight.routes["portfolio.page"] === 5, "build record page count");
});
await check("D fixture-small: 12 projects → only /portfolio, no /portfolio/page/*", async () => {
  assert(cardIds(await html("fixture-small", "/portfolio")).length === 12, "cards");
  assert(!(await exists(path.join(cur["fixture-small"]!.site, "portfolio/page"))), "portfolio/page/ emitted");
  assert(!(await html("fixture-small", "/portfolio")).includes("data-pager"), "pager rendered for one page");
  assert(cur["fixture-small"]!.record.preflight.pruned.map((p: { key: string }) => p.key).join() === "portfolio.page", "pruned");
});
await check("E fixture-empty: no portfolio list/detail output at all", async () => {
  const files = await walkFiles(cur["fixture-empty"]!.site);
  assert(!files.some((f) => f.startsWith("portfolio")), files.filter((f) => f.startsWith("portfolio")).join());
  assert(cur["fixture-empty"]!.record.preflight.pruned.length === 3, "prune record");
});
await check("F every published fixture-large slug → exactly one detail page; nothing else under /portfolio", async () => {
  const order = await expectedOrder("fixture-large");
  const detail = (await walkFiles(path.join(cur["fixture-large"]!.site, "portfolio"))).filter((f) => /^[^/]+\.html$/.test(f)).map((f) => f.slice(0, -5));
  assert(detail.length === 173 && new Set(detail).size === 173, `detail pages ${detail.length}`);
  assert([...detail].sort().join() === order.map((p) => p.slug).sort().join(), "slug set differs");
  for (const p of order.slice(0, 5)) assert((await html("fixture-large", `/portfolio/${p.slug}`)).includes(`data-project="${p.id}"`), p.slug);
  const all = (await readJson(path.join(repoRoot, "data/sites/fixture-large/content/projects.json"))).items as Project[];
  const visible = new Set(order.map((p) => p.id));
  const hidden = all.filter((p) => !visible.has(p.id));
  assert(hidden.length > 0, "fixture has no draft/scheduled project to prove exclusion");
  for (const h of hidden) assert(!detail.includes(h.slug), `draft/scheduled ${h.id} emitted`);
});
await check("G/H out-of-range pages and unknown slugs are not emitted; package QA is exclusive", async () => {
  const site = cur["fixture-large"]!.site;
  for (const f of ["portfolio/page/1.html", "portfolio/page/7.html", "portfolio/page/0.html", "portfolio/no-such-project.html", "portfolio/index.html"]) {
    assert(!(await exists(path.join(site, f))), `${f} emitted`);
  }
  assert(await exists(path.join(site, "404.html")), "404 page missing");
  const htmlFiles = (await walkFiles(site)).filter((f) => f.endsWith(".html"));
  // (1.5.0 adds exactly its three static pages, set aside here and asserted by ia150.test.ts)
  assert(withoutIaPages(htmlFiles).length === 180 + 2, `html files ${htmlFiles.length} (180 planned + 404 + _not-found)`);
  assert(htmlFiles.length - withoutIaPages(htmlFiles).length === iaPathsOf(cur["fixture-large"]!.record).length, "1.5.0 static pages");
});
await check("V packages: no source host/API/brand/runtime/assets; every planned page present; nothing unplanned", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", newPin.releaseId);
  const terms = [...rel.forbiddenTerms, "amazonaws.com", "_next/data", "__NEXT_DATA__", "karrot", "kakao", "TOGGLED_UUIDS", "add-view-count", "?page=0"];
  for (const s of SITES) {
    const planned = Object.values(await plannedPaths(s)).flat();
    const qa = await qaStaticPackage({ outDir: cur[s]!.site, routes: planned.map((p) => ({ path: p })), exclusiveRoutes: true, forbiddenTerms: terms, publicOrigin: `https://${s}.example` });
    assert(qa.pass, `${s}: ${JSON.stringify(qa.failures.slice(0, 5))}`);
    const langs = new Set(Object.values(qa.pages).map((p) => p.lang));
    assert(![...langs].includes("kr"), `${s}: lang="kr"`);
  }
});
async function plannedPaths(s: string): Promise<Record<string, string[]>> {
  const { snapshot } = await prepareSiteInput({ repoRoot, siteId: s, mode: "public", at: cur[s]!.record.at });
  const plan = planRoutes(template.routes, createContentReader(snapshot.content));
  return Object.fromEntries(plan.routes.map((r) => [r.key, r.paths]));
}

// designated fixture projects (platform/dev/generate-fixtures.ts)
const A = "hp-0174"; // before/after + quote + all facts
const B = "hp-0175"; // no before/after, no quote, some facts missing
const OUTLIER = "hp-0173";
const MINIMAL = "hp-0172";
const slugOf = async (id: string) => ((await readJson(path.join(repoRoot, "data/sites/fixture-large/content/projects.json"))).items as Project[]).find((p) => p.id === id)!.slug;
const detailHtml = async (id: string) => html("fixture-large", `/portfolio/${await slugOf(id)}`);
const scripts = (h: string) => [...h.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]!).sort();

await check("N before/after (A) and ordinary (B) projects: same detail Template, conditional output only", async () => {
  const a = await detailHtml(A);
  const b = await detailHtml(B);
  assert(a.includes('data-section="portfolio.detail"') && b.includes('data-section="portfolio.detail"'), "detail section");
  assert(a.includes('data-before-after="true"') && a.includes("data-ba-toggle") && a.includes('data-view="before"'), "A lacks before/after UI");
  assert(b.includes('data-before-after="false"') && !b.includes("data-ba-toggle") && !b.includes('data-view="before"') && !b.includes("data-has-before"), "B has a before control");
  assert(scripts(a).join() === scripts(b).join(), "different JS for the two detail pages (not the same Template route)");
  const baCount = (a.match(/data-ba-toggle/g) ?? []).length;
  const aProject = ((await readJson(path.join(repoRoot, "data/sites/fixture-large/content/projects.json"))).items as Project[]).find((p) => p.id === A)!;
  const pairs = aProject.galleryGroups!.flatMap((g) => g.items).filter((i) => i.before).length;
  // ≥ 1.4.2: a gallery with more than one room also shows every photo in its "all" view, so a pair has two seats there
  const allView = a.includes('data-gallery-panel="all"');
  assert(!allView || aProject.galleryGroups!.length > 1, 'an "all" view on a one-room gallery');
  const seats = pairs * (allView ? 2 : 1);
  assert(baCount === seats && pairs > 0, `toggles ${baCount} ≠ pair seats ${seats}`);
});
await check("O missing optional quote → no quote wrapper; present quote → rendered", async () => {
  const a = await detailHtml(A);
  const b = await detailHtml(B);
  assert(a.includes("data-quote") && a.includes("From the client"), "A quote missing");
  assert(!b.includes("data-quote") && !b.includes("From the client") && !b.includes("<blockquote"), "B renders a quote wrapper");
});
await check("P missing optional facts → no blank rows; empty keyword list → no keyword row", async () => {
  const b = await detailHtml(B);
  for (const k of ["builtYear", "period", "keywords", "price"]) assert(!b.includes(`data-fact="${k}"`), `B renders ${k}`);
  for (const k of ["location", "area", "scope", "duration"]) assert(b.includes(`data-fact="${k}"`), `B lacks ${k}`);
  const m = await detailHtml(MINIMAL);
  // category is a required project field, so the minimal project has exactly one fact row (Type)
  const rows = [...m.matchAll(/data-fact="([^"]+)"/g)].map((x) => x[1]);
  assert(rows.join() === "category", `minimal project fact rows: ${rows.join()}`);
  assert(!m.includes("data-body") && !m.includes("data-quote") && !m.includes("i1-detail__summary") && !m.includes("data-ba-toggle"), "minimal project renders empty regions");
  assert(m.includes("data-gallery-item"), "minimal project must still show its cover");
  const o = await detailHtml(OUTLIER);
  assert(!o.includes('data-fact="keywords"'), "keywords [] rendered a row");
  for (const s of ["fixture-large", "fixture-small"]) {
    for (const p of await expectedOrder(s)) {
      const h = await html(s, `/portfolio/${p.slug}`);
      assert(!/<dd>\s*<\/dd>|<dt>\s*<\/dt>/.test(h), `${s}/${p.slug}: blank fact row`);
    }
  }
});
await check("Q outlier price/area project builds and renders the value verbatim", async () => {
  const o = await detailHtml(OUTLIER);
  assert(o.includes("USD 987,654,321.5 / m²") && o.includes("99,999 m²"), "outlier values not rendered");
});
await check("R homepage project cards link to their detail pages; 'view all' → /portfolio", async () => {
  for (const s of ["fixture-large", "fixture-small"] as const) {
    const h = await html(s, "/");
    const order = await expectedOrder(s);
    const ids = cardIds(h);
    assert(ids.length > 0, `${s}: no home cards`);
    for (const id of ids) {
      const p = order.find((x) => x.id === id)!;
      assert(h.includes(`href="/portfolio/${p.slug}"`), `${s}: card ${id} not linked`);
    }
    assert(/data-more-link=""[^>]*>|href="\/portfolio" [^>]*data-more-link/.test(h) && h.includes('href="/portfolio"'), `${s}: view-all link`);
  }
});
await check("S portfolio nav link exists only when the route exists (every page of large/small; never in empty)", async () => {
  for (const s of ["fixture-large", "fixture-small"] as const) {
    for (const f of (await walkFiles(cur[s]!.site)).filter((x) => x.endsWith(".html") && !x.includes("not-found") && x !== "404.html")) {
      const h = await readFile(path.join(cur[s]!.site, f), "utf8");
      assert(h.includes('data-nav="portfolio"'), `${s}/${f}: nav link missing`);
    }
  }
  for (const f of (await walkFiles(cur["fixture-empty"]!.site)).filter((x) => x.endsWith(".html"))) {
    const h = await readFile(path.join(cur["fixture-empty"]!.site, f), "utf8");
    assert(!h.includes("/portfolio") && !h.includes('data-nav="portfolio"'), `fixture-empty/${f} links to /portfolio`);
  }
});
await check("T sitemap.xml lists exactly the generated routes (absolute on the declared origin)", async () => {
  for (const s of SITES) {
    const xml = await readFile(path.join(cur[s]!.site, "sitemap.xml"), "utf8");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    // expected routes computed from the stored content, independently of the route planner
    const order = await expectedOrder(s);
    const pages = Math.ceil(order.length / 30);
    const paths = ["/", ...(pages ? ["/portfolio"] : []), ...Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => `/portfolio/page/${i + 2}`), ...order.map((p) => `/portfolio/${p.slug}`), ...(await sitemapIaPathsOf(s, cur[s]!.record))];
    const expected = paths.map((p) => `https://${s}.example${p}`);
    assert(locs.join() === expected.join(), `${s}: ${locs.length} locs vs ${expected.length}`);
    for (const l of locs) {
      const rel = l.replace(`https://${s}.example`, "");
      assert(await exists(path.join(cur[s]!.site, routeHtml(rel === "/" ? "/" : rel))), `${s}: sitemap lists missing page ${l}`);
    }
  }
  assert((await readFile(path.join(cur["fixture-large"]!.site, "sitemap.xml"), "utf8")).split("<loc>").length - 1 === 180 + iaPathsOf(cur["fixture-large"]!.record).length, "large count");
  assert(!(await readFile(path.join(cur["fixture-empty"]!.site, "sitemap.xml"), "utf8")).includes("/portfolio"), "empty lists portfolio");
});
await check("U public robots.txt: allow + sitemap on the real origin only", async () => {
  const r = await readFile(path.join(cur["fixture-large"]!.site, "robots.txt"), "utf8");
  assert(/User-Agent: \*/i.test(r) && /Allow: \//.test(r) && r.includes("Sitemap: https://fixture-large.example/sitemap.xml"), r);
  assert(!/Disallow: \/\s*$/m.test(r), "public robots disallows");
});
await check("metadata: unique list titles incl. page number; detail = item title + brand; canonical on the declared origin", async () => {
  const titles = await Promise.all(["/portfolio", "/portfolio/page/2", "/portfolio/page/6"].map(async (r) => /<title>([^<]*)<\/title>/.exec(await html("fixture-large", r))?.[1]));
  assert(titles.join(" | ") === "Projects | Harbor &amp; Pine Studio | Projects — Page 2 | Harbor &amp; Pine Studio | Projects — Page 6 | Harbor &amp; Pine Studio", titles.join(" | "));
  const b = await detailHtml(B);
  const bTitle = ((await readJson(path.join(repoRoot, "data/sites/fixture-large/content/projects.json"))).items as Project[]).find((p) => p.id === B)!.title;
  assert(b.includes(`<title>${bTitle.replace(/&/g, "&amp;")} | Harbor &amp; Pine Studio</title>`), "detail title");
  assert(b.includes(`<link rel="canonical" href="https://fixture-large.example/portfolio/${await slugOf(B)}"/>`), "canonical");
  assert((await html("fixture-large", "/portfolio/page/2")).includes('<link rel="canonical" href="https://fixture-large.example/portfolio/page/2"/>'), "page canonical");
  const small = await html("fixture-small", "/portfolio");
  assert(small.includes("<title>프로젝트 | 마루 아틀리에 (가상)</title>"), "small list title (slot)");
  // before 1.5.2 the home page has no canonical; from 1.5.2 exactly one, the origin (canonical-152.ts)
  const homeCanonicals = [...(await html("fixture-large", "/")).matchAll(/<link rel="canonical" href="([^"]*)"\/>/g)].map((m) => m[1]);
  const wantHome = homeHasCanonical(cur["fixture-large"]!.record.template.templateVersion) ? ["https://fixture-large.example"] : [];
  assert(JSON.stringify(homeCanonicals) === JSON.stringify(wantHome), `home canonical: ${JSON.stringify(homeCanonicals)} ≠ ${JSON.stringify(wantHome)}`);
});
await check("404 page is the site's own (header/footer, localized slot copy, one <title>, noindex)", async () => {
  for (const [s, text] of [["fixture-large", "Page not found"], ["fixture-small", "페이지를 찾을 수 없습니다"], ["fixture-empty", "Page not found"]] as const) {
    const h = await readFile(path.join(cur[s]!.site, "404.html"), "utf8");
    assert(h.includes('data-section="site.not-found"') && h.includes(`>${text}</h1>`), `${s}: 404 content`);
    assert(h.includes('data-section="site.header"') && h.includes('data-section="site.footer"'), `${s}: 404 header/footer`);
    assert((h.match(/<title>/g) ?? []).length === 1 && h.includes(`<title>${text} | `) && /<meta name="robots" content="noindex"\/>/.test(h), `${s}: 404 head`);
    assert(!h.includes("This page could not be found"), `${s}: framework default 404 text`);
  }
});
await check("slot proof on new sections: same code, different labels per site; hidden media slot renders nothing", async () => {
  const lb = await detailHtml(B);
  const small = (await expectedOrder("fixture-small"))[0]!;
  const sb = await html("fixture-small", `/portfolio/${small.slug}`);
  assert(lb.includes("All projects") && sb.includes("프로젝트 목록") && !sb.includes("All projects"), "back label");
  assert((await html("fixture-large", "/portfolio")).includes("i1-plist__hero") && !(await html("fixture-small", "/portfolio")).includes("i1-plist__hero"), "media slot hide");
  const src = (s: string) => cur[s]!.record.preflight.slotSources;
  assert(src("fixture-large")["portfolio.index"].heroImage === "site" && src("fixture-small")["portfolio.index"].heroImage === "hidden", "recorded media sources");
  assert(src("fixture-small")["portfolio.detail"].backLabel === "site" && src("fixture-large")["portfolio.detail"].backLabel === "neutral-default", "recorded label sources");
});

console.log("\n[integration] release change, rollback, build identity");
await check("X buildInputId changed because the Template Release changed (parts.releaseHash old → new)", () => {
  for (const s of SITES) {
    assert(prev[s], `${s}: no previous package`);
    const c = cur[s]!.record;
    const p = prev[s]!.record;
    // previous = the package of the release before the current one (f27823 at Step 4; the Step 4 release after later re-pins)
    assert(c.parts.releaseHash === newPin.releaseHash && p.parts.releaseHash !== newPin.releaseHash, `${s}: ${p.parts.releaseHash.slice(0, 12)} → ${c.parts.releaseHash.slice(0, 12)}`);
    assert(c.buildInputId !== p.buildInputId, `${s}: same buildInputId`);
  }
});
await check("Y rollback: each site's previous package (an older, verified release) is present and intact", async () => {
  for (const s of SITES) {
    const p = prev[s];
    assert(p, `${s}: no previous package (rollback target)`);
    assert(p.record.template.releaseId !== newPin.releaseId, `${s}: previous built with the current release`);
    await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", p.record.template.releaseId));
    assert(await packageIntact(p.dir), `${s}: previous package damaged (hash ≠ build record)`);
    assert(await exists(path.join(p.site, "index.html")), `${s}: previous index.html`);
  }
});

console.log("\n[integration] throwaway-root builds (preview robots, new newest project)");
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "step4-root-"));
try {
  await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
  await cp(path.join(repoRoot, "data/sites/fixture-empty"), path.join(tmpRoot, "data/sites/fixture-empty"), { recursive: true });
  await cp(path.join(repoRoot, "data/sites/fixture-large"), path.join(tmpRoot, "data/sites/fixture-large"), { recursive: true });
  const at = cur["fixture-large"]!.record.at;

  await check("U preview build: robots disallow all, every page noindex (list/paged/detail), empty sitemap, drafts only here", async () => {
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-large", mode: "preview", at });
    assert(r.status === "built", r.status);
    const site = path.join(r.packageDir, "site");
    const robots = await readFile(path.join(site, "robots.txt"), "utf8");
    assert(/Disallow: \//.test(robots) && !/Sitemap:/.test(robots), robots);
    const all = (await readJson(path.join(tmpRoot, "data/sites/fixture-large/content/projects.json"))).items as Project[];
    const draft = all.find((p) => p.status === "draft")!;
    const pages = ["index.html", "portfolio.html", "portfolio/page/2.html", `portfolio/${await slugOf(B)}.html`, `portfolio/${draft.slug}.html`];
    for (const f of pages) {
      assert((await readFile(path.join(site, f), "utf8")).includes('<meta name="robots" content="noindex, nofollow"/>'), `${f}: noindex`);
    }
    assert(!(await exists(path.join(cur["fixture-large"]!.site, `portfolio/${draft.slug}.html`))), "draft detail in the PUBLIC package");
    assert(!(await readFile(path.join(site, "sitemap.xml"), "utf8")).includes("<url>"), "preview sitemap lists URLs");
  });
  await check("Y rollback by re-pin: the CURRENT builder still builds a site pinned to the old release (1.0.0-shaped data)", async () => {
    const dir = path.join(tmpRoot, "data/sites/legacy-small");
    await cp(path.join(repoRoot, "data/sites/fixture-small"), dir, { recursive: true });
    const siteJson = await readJson(path.join(dir, "site.json"));
    const old = await loadRelease(repoRoot, "interior-01", OLD_RELEASE.id);
    siteJson.siteId = "legacy-small";
    siteJson.template = { templateId: "interior-01", templateVersion: old.templateVersion, releaseId: old.releaseId, releaseHash: old.releaseHash };
    await writeFile(path.join(dir, "site.json"), JSON.stringify(siteJson, null, 2));
    // 1.0.0 content model / slots: strip the Step 4 fields and sections (old strict schemas refuse them)
    const keep = new Set(["id", "slug", "title", "status", "publishedAt", "category", "cover"]);
    const projects = await readJson(path.join(dir, "content/projects.json"));
    projects.items = projects.items.map((p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([k]) => keep.has(k))));
    await writeFile(path.join(dir, "content/projects.json"), JSON.stringify(projects, null, 2));
    const slots = await readJson(path.join(dir, "slots.json"));
    for (const k of ["portfolio.index", "portfolio.detail", "site.not-found"]) delete slots.values[k];
    delete slots.values["home.projects-a"].moreLabel;
    // 1.3.0 homepage sections / slot keys are unknown to 1.0.0 as well
    for (const k of ["home.hero", "home.intro", "home.projects-b", "home.reviews", "home.image-band", "site.floating-cta"]) delete slots.values[k];
    delete slots.values["home.projects-a"].previousLabel;
    delete slots.values["home.projects-a"].nextLabel;
    await writeFile(path.join(dir, "slots.json"), JSON.stringify(slots, null, 2));
    // settings: later (1.2.0+) sections are unknown to 1.0.0 as well
    const settings = await readJson(path.join(dir, "settings.json"));
    delete settings.overrides["portfolio.index"];
    for (const k of ["home.hero", "home.intro", "home.projects-b", "home.reviews", "site.floating-cta"]) delete settings.overrides[k];
    await writeFile(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2));
    // content: the 1.3.0 homepage collections (strict old snapshot schema refuses them)
    await rm(path.join(dir, "content/banners.json"), { force: true });
    await rm(path.join(dir, "content/reviews.json"), { force: true });
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "legacy-small", at });
    assert(r.status === "built", r.status);
    assert(r.record.template.releaseId === OLD_RELEASE.id, r.record.template.releaseId);
    assert(r.record.qa.pass && r.record.preflight.pruned.length === 0, "legacy QA / prune");
    const files = await walkFiles(path.join(r.packageDir, "site"));
    assert(files.includes("index.html") && !files.some((f) => f.startsWith("portfolio")), "legacy package shape");
  });
  await check("M new newest project (integration): first on /portfolio, boundaries shift, last page 23 → 24", async () => {
    const f = path.join(tmpRoot, "data/sites/fixture-large/content/projects.json");
    const doc = await readJson(f);
    const before = new Map((doc.items as Project[]).map((p) => [p.id, JSON.stringify(p)]));
    doc.items.push({
      id: "hp-9001",
      slug: "fresh-arrival-9001",
      title: "Fresh Arrival — newest project",
      status: "published",
      publishedAt: "2026-09-01T00:00:00Z",
      category: "kitchen",
      cover: { asset: "cover-01" },
    });
    await writeFile(f, JSON.stringify(doc, null, 2));
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-large", at });
    assert(r.status === "built", r.status);
    const site = path.join(r.packageDir, "site");
    const p1 = cardIds(await readFile(path.join(site, "portfolio.html"), "utf8"));
    const p2 = cardIds(await readFile(path.join(site, "portfolio/page/2.html"), "utf8"));
    const p6 = cardIds(await readFile(path.join(site, "portfolio/page/6.html"), "utf8"));
    const oldP1 = cardIds(await html("fixture-large", "/portfolio"));
    assert(p1[0] === "hp-9001" && p1.length === 30, `first ${p1[0]}`);
    assert(p2[0] === oldP1.at(-1), "page boundary did not shift by one");
    assert(p6.length === 24, `last page ${p6.length}`);
    assert(await exists(path.join(site, "portfolio/fresh-arrival-9001.html")), "detail page for the new project");
    const after = (await readJson(f)).items as Project[];
    for (const p of after) if (before.has(p.id)) assert(before.get(p.id) === JSON.stringify(p), `stored record ${p.id} changed`);
  });
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log(`\nstep4: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
