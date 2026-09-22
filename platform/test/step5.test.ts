/**
 * Step 5 validation — the complete interior-01 homepage (spec §35 A–AE).
 * Run AFTER the new release is cut, the three fixtures are re-pinned and built:
 *   pnpm test:platform   (slice1 → step4 → step41 → this file)
 * Browser behaviour (carousel interaction, reduced motion at runtime, non-local requests,
 * broken media, overflow) is covered by scripts/template-platform-step5-visual-smoke.ts.
 * Throwaway-root builds never touch data/sites or data/site-builds.
 */
import { cp, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContentReader } from "../content/reader";
import {
  BannerSchema,
  BannersDocSchema,
  MAX_BANNERS,
  PROVISIONAL_CONTENT_TYPES,
  ProjectsDocSchema,
  ReviewSchema,
  ReviewsDocSchema,
  type Banner,
  type Project,
  type Review,
} from "../content/schema";
import { resolveEffectiveSettings } from "../settings/settings";
import { resolveSlots } from "../slots/slots";
import { buildSiteSnapshot } from "../site/load";
import { buildSite, droppedDestinationWarnings, packageIntact, prepareSiteInput } from "../build/site-build";
import { gateTemplateSources, loadRelease, verifyRelease } from "../release/release";
import template from "../../templates/interior-01/v1/template";
import { canonical141 } from "./canonical-141";
import { canonical142 } from "./canonical-142";
import { canonical150Main, canonical150Sitemap, withoutIaPages } from "./canonical-150";

const repoRoot = process.cwd();
const SITES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
/** The Step 4.1 release every site was pinned to before this step (Step 5's rollback target). */
const OLD_RELEASE = { id: "interior-01-1.2.0-93fb66acda7d", hash: "93fb66acda7dab100069133fcfe15cb845840d9583d5a1de1eeb07d230425f89" };
/** Older retained releases must stay untouched too. */
const STEP4_RELEASE = { id: "interior-01-1.1.0-512e4dd932b4", hash: "512e4dd932b4e557aaa4278d599c0e2a75703d7c7d3e368169e1ce341cd562e5" };
/** The Step 5 release itself — immutable once a later release is current. */
const STEP5_RELEASE = { id: "interior-01-1.3.0-74a70c276f35", hash: "74a70c276f353446fb80d4419ed920533f371e5d16905310497702aab944f1f4" };
/** Semver order of "x.y.z" strings (Step 5 invariants must hold for 1.3.0 AND every later release). */
const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};
const HOME_ORDER = ["home.hero", "home.intro", "home.projects-a", "home.projects-b", "home.reviews", "home.image-band"] as const;
/** Source placement flags that must never enter the canonical model (spec: no placement fields). */
const PLACEMENT_FIELDS = ["isPcDisplay", "isMobileDisplay", "displayOrder", "isBottomArea1Display", "isBottomArea2Display", "projectsB"];

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
    if (re.test((error as Error).message)) return;
    throw new Error(`wrong error: ${(error as Error).message.slice(0, 400)}`);
  }
  throw new Error(`expected failure matching ${re}`);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));
const exists = async (f: string) => (await stat(f).catch(() => undefined)) !== undefined;
const fails = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => !schema.safeParse(v).success;

async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}

/** Outer HTML of the element carrying data-section="<id>" (nesting aware); "" when absent. */
function sectionHtml(html: string, id: string): string {
  const at = html.indexOf(`data-section="${id}"`);
  if (at < 0) return "";
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-z]+)/.exec(html.slice(start))?.[1] ?? "section";
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}
const sectionsOf = (h: string) => [...h.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]!);
const mainOf = (h: string) => /<main[\s\S]*<\/main>/.exec(h)?.[0] ?? "";
/**
 * React useId() values (`_R_…_`) encode the component's position in the whole tree, so they
 * change when the site shell changes around a page (1.4.0: the footer moved into the root
 * layout). Replaced by first-appearance ordinals: the ids' structure must still match exactly.
 */
const canonicalIds = (h: string) => {
  const seen = new Map<string, string>();
  return h.replace(/_R_[A-Za-z0-9]+_/g, (id) => seen.get(id) ?? (seen.set(id, `_ID${seen.size}_`), `_ID${seen.size - 1}_`));
};
const cardIds = (h: string) => [...h.matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]!);
const hrefs = (h: string) => [...h.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
const reviewIds = (h: string) => [...h.matchAll(/data-review="([^"]+)"/g)].map((m) => m[1]!);
const slideIds = (h: string) => [...h.matchAll(/data-hero-slide="([^"]+)"/g)].map((m) => m[1]!);
const routeFile = (href: string) => (href === "/" ? "index.html" : `${href.slice(1)}.html`);

// ------------------------------------------------------------------ units --
console.log("\n[unit] content model (PROVISIONAL homepage collections)");
const largeProjects = (await readJson(path.join(repoRoot, "data/sites/fixture-large/content/projects.json"))).items as Project[];
const aBanner: Banner = { id: "b1", status: "published", image: { asset: "hero-01" }, headline: "Fictional headline" };
const aReview: Review = { id: "r1", status: "published", text: "Fictional review text.", attribution: "A fictional client" };

await check("M no source placement field exists in the canonical model (projects, banners, reviews refuse them)", () => {
  for (const f of PLACEMENT_FIELDS) {
    const p = { ...largeProjects[0]!, [f]: f === "displayOrder" ? 1 : true };
    assert(fails(ProjectsDocSchema, { schema: "projects@1", origin: "synthetic-fixture", items: [p] }), `project accepted ${f}`);
    assert(fails(BannerSchema, { ...aBanner, [f]: true }), `banner accepted ${f}`);
    assert(fails(ReviewSchema, { ...aReview, [f]: true }), `review accepted ${f}`);
  }
  // …and the settings/slots boundary refuses them as section keys too
  for (const f of PLACEMENT_FIELDS) {
    let message = "";
    try {
      resolveEffectiveSettings(template, { schemaVersion: 1, templateId: "interior-01", overrides: { [f]: {} } });
    } catch (error) {
      message = (error as Error).message;
    }
    assert(message.includes(`unknown site settings key "${f}"`), `settings accepted section ${f} (${message})`);
  }
  // no Template section declares a placement concept either
  for (const [id, decl] of Object.entries(template.sections as Record<string, { defaults?: object; slots?: object }>)) {
    const keys = [...Object.keys(decl.defaults ?? {}), ...Object.keys(decl.slots ?? {})];
    assert(!keys.some((k) => PLACEMENT_FIELDS.includes(k) || /display|placement|order/i.test(k)), `${id}: ${keys.join()}`);
  }
});
await check("P reviews: no generated origin exists; no rating/date/photo/identity fields; text is plain + bounded", () => {
  for (const origin of ["generated", "ai-generated", "llm", "scraped"]) {
    assert(fails(ReviewsDocSchema, { schema: "reviews@1", origin, items: [] }), `origin ${origin} accepted`);
  }
  assert(!fails(ReviewsDocSchema, { schema: "reviews@1", origin: "customer", items: [aReview] }), "customer review refused");
  for (const extra of [{ rating: 5 }, { stars: 5 }, { date: "2026-01-01" }, { avatar: { asset: "x" } }, { authorPhoto: "x" }, { verified: true }, { source: "naver" }]) {
    assert(fails(ReviewSchema, { ...aReview, ...extra }), `review accepted ${JSON.stringify(extra)}`);
  }
  assert(fails(ReviewSchema, { ...aReview, text: "" }) && fails(ReviewSchema, { ...aReview, text: "x".repeat(601) }), "text bounds");
  assert(fails(ReviewSchema, { ...aReview, status: "scheduled" }), "reviews have no schedule");
});
await check("banners: PROVISIONAL; CTA is a closed target (project | contact), never a URL; ≤ 8 slides; image required", () => {
  eq([...PROVISIONAL_CONTENT_TYPES], ["banners"], "provisional content types");
  for (const cta of [{ label: "x", href: "https://example.com" }, { label: "x", target: { kind: "url", href: "/x" } }, { label: "x", target: { kind: "project" } }, { label: "x", target: { kind: "inquiry" } }]) {
    assert(fails(BannerSchema, { ...aBanner, cta }), `banner accepted cta ${JSON.stringify(cta)}`);
  }
  assert(!fails(BannerSchema, { ...aBanner, cta: { label: "x", target: { kind: "contact" } } }), "contact CTA refused");
  assert(!fails(BannerSchema, { ...aBanner, cta: { label: "x", target: { kind: "project", project: "hp-0001" } } }), "project CTA refused");
  assert(fails(BannerSchema, { ...aBanner, image: undefined }), "banner without image accepted");
  assert(fails(BannerSchema, { ...aBanner, video: { asset: "x" } }), "video accepted (image-only today)");
  const many = Array.from({ length: MAX_BANNERS + 1 }, (_, i) => ({ ...aBanner, id: `b${i}` }));
  assert(fails(BannersDocSchema, { schema: "banners@1", origin: "synthetic-fixture", items: many }), `${MAX_BANNERS + 1} banners accepted`);
  assert(!fails(BannersDocSchema, { schema: "banners@1", origin: "synthetic-fixture", items: many.slice(0, MAX_BANNERS) }), `${MAX_BANNERS} banners refused`);
});
await check("reader: reviews/banners are closed queries in STORED order; drafts only in preview; bad limits throw", () => {
  const reviews: Review[] = [
    { ...aReview, id: "r3" },
    { ...aReview, id: "r1", status: "draft" },
    { ...aReview, id: "r2" },
  ];
  const banners: Banner[] = [{ ...aBanner, id: "b2" }, { ...aBanner, id: "b1", status: "draft" }];
  const content = { business: {}, categories: [], projects: [], reviews, banners };
  const pub = createContentReader(content);
  eq(pub.list({ type: "reviews", limit: 10 }).items.map((r) => r.id), ["r3", "r2"], "public reviews");
  eq(pub.list({ type: "reviews", limit: 1 }).items.map((r) => r.id), ["r3"], "limit");
  eq(pub.list({ type: "banners", limit: 8 }).items.map((b) => b.id), ["b2"], "public banners");
  const pre = createContentReader(content, { includeDrafts: true });
  eq(pre.list({ type: "reviews", limit: 10 }).items.map((r) => r.id), ["r3", "r1", "r2"], "preview reviews");
  const none = createContentReader({ business: {}, categories: [], projects: [] });
  eq(none.list({ type: "reviews", limit: 6 }).items, [], "absent collection = empty");
  for (const limit of [0, -1, 1.5, Number.NaN]) {
    let threw = false;
    try {
      pub.list({ type: "reviews", limit });
    } catch {
      threw = true;
    }
    assert(threw, `limit ${limit} accepted`);
  }
});

console.log("\n[unit] Template declarations");
await check("Z home content uses NO per-item slots: slots are fixed section copy/link/media; items are content", async () => {
  const types = new Set(["text", "richText", "link", "media"]);
  for (const id of [...HOME_ORDER, "site.floating-cta"]) {
    const slots = (template.sections as Record<string, { slots?: Record<string, { type: string }> }>)[id]?.slots ?? {};
    for (const [k, d] of Object.entries(slots)) {
      assert(types.has(d.type), `${id}.${k}: slot type ${d.type}`);
      assert(!/\d|items|cards|reviews|slides|banners|list/i.test(k), `${id}.${k} looks like a per-item slot`);
    }
  }
  const slotDoc = (values: Record<string, Record<string, unknown>>) => ({ schemaVersion: 1, templateId: "interior-01", values });
  await rejects(() => resolveSlots(template, slotDoc({ "home.reviews": { items: [{ text: "x" }] } }), {}), /unknown slot "home\.reviews\.items"/);
  await rejects(() => resolveSlots(template, slotDoc({ "home.hero": { slide1: "x" } }), {}), /unknown slot "home\.hero\.slide1"/);
  await rejects(() => resolveSlots(template, slotDoc({ "home.projects-b": { card1Title: "x" } }), {}), /unknown slot "home\.projects-b\.card1Title"/);
});
await check("settings: homepage defaults; projects-b OFF by default (never silently duplicates A); strict keys", () => {
  const base = { schemaVersion: 1, templateId: "interior-01" };
  const eff = resolveEffectiveSettings(template, { ...base, overrides: {} });
  eq(eff["home.hero"], { enabled: true, autoplay: true }, "hero");
  eq(eff["home.intro"], { enabled: true }, "intro");
  eq(eff["home.projects-b"], { enabled: false, limit: 8, selection: { mode: "latest" } }, "projects-b");
  eq(eff["home.reviews"], { enabled: true, limit: 6 }, "reviews");
  eq(eff["site.floating-cta"], { enabled: true }, "floating cta");
  for (const [k, bad] of [
    ["home.reviews", { limit: 13 }],
    ["home.reviews", { limit: 0 }],
    ["home.hero", { slides: [] }],
    ["home.hero", { interval: 3000 }],
    ["home.projects-b", { placement: "bottom" }],
    ["home.projects-b", { selection: { mode: "featured" } }],
    ["home.image-band", { enabled: false }],
    ["site.floating-cta", { href: "/inquiry" }],
    ["home.intro", { title: "x" }],
  ] as const) {
    let threw = false;
    try {
      resolveEffectiveSettings(template, { ...base, overrides: { [k]: bad } });
    } catch {
      threw = true;
    }
    assert(threw, `accepted ${k} ${JSON.stringify(bad)}`);
  }
});
await check("AA Template imports/identifiers remain within the gate (no timers, window, fetch, Date, Intl …)", async () => {
  const siteIds = await readdir(path.join(repoRoot, "data/sites"));
  const provenance = await readJson(path.join(repoRoot, "templates/interior-01/v1/provenance.json"));
  const findings = await gateTemplateSources(repoRoot, "interior-01", 1, siteIds, provenance.forbiddenTerms);
  assert(findings.length === 0, JSON.stringify(findings).slice(0, 600));
  const files = await walkFiles(path.join(repoRoot, "templates/interior-01/v1"));
  for (const f of ["components/HeroCarousel.tsx", "components/SnapTrack.tsx", "components/Icon.tsx", "sections/HomeHero.tsx", "sections/HomeIntro.tsx", "sections/HomeProjects.tsx", "sections/HomeReviews.tsx", "sections/HomeImageBand.tsx", "sections/FloatingCta.tsx", "sections/links.ts"]) {
    assert(files.includes(f), `${f} missing (gate must scan it)`);
  }
  assert(!files.includes("sections/HomeProjectsA.tsx"), "legacy HomeProjectsA.tsx still present");
});
await check("Y (static) reduced motion never hides content: no opacity/visibility/display rule inside the reduced-motion block", async () => {
  const css = await readFile(path.join(repoRoot, "templates/interior-01/v1/styles/template.css"), "utf8");
  const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]!);
  assert(blocks.length >= 1, "no reduced-motion block");
  // Only the pause/play toggle may disappear (nothing rotates under reduced motion); every
  // other rule may stop movement but never hide anything.
  for (const b of blocks) {
    for (const [, selector, body] of b.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/opacity:\s*0|visibility:\s*hidden|display:\s*none/.test(body!)) continue;
      assert(selector!.trim() === ".i1-hero__toggle", `reduced-motion hides ${selector!.trim()}`);
    }
  }
  assert(/animation:\s*none/.test(blocks.join("\n")), "reduced motion must stop the autoplay timer animation");
});

await check("builder warns (never silently drops): unserved CTA project, contact CTA without destination, /path link that is not a page", () => {
  const snapshot = {
    content: {
      business: {},
      projects: [{ id: "p1" }],
      banners: [
        { ...aBanner, id: "a", cta: { label: "x", target: { kind: "project", project: "p2" } } },
        { ...aBanner, id: "b", cta: { label: "x", target: { kind: "project", project: "p1" } } },
        { ...aBanner, id: "c", cta: { label: "x", target: { kind: "contact" } } },
      ],
    },
    slots: { values: { "home.intro": { link: { label: "x", href: "/portfolio/nope" } }, "s.b": { link: { label: "y", href: "/portfolio" } }, "s.c": { link: { label: "z", href: "#reviews" } } } },
  } as unknown as Parameters<typeof droppedDestinationWarnings>[0];
  const w = droppedDestinationWarnings(snapshot, [{ id: "p2", slug: "p2", status: "draft" }], ["/", "/portfolio"]);
  eq(w, [
    "banner a: CTA target project p2 is not served in this build (draft) — that CTA is never rendered",
    "banner c: contact CTA but the site has no contact destination — that CTA is never rendered",
    "slot home.intro.link: link /portfolio/nope is not a page of this build — that link is never rendered",
  ], "warnings");
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
const home = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await readFile(path.join(cur[s]!.site, "index.html"), "utf8")] as const)));
const newPin = await pinOf("fixture-large");
const stored = async <T>(s: string, doc: string) => ((await readJson(path.join(repoRoot, "data/sites", s, doc))).items ?? []) as T[];

await check("B all three sites pin + were built with the SAME release ≥ 1.3.0 = the current template version (verified)", async () => {
  const pins = await Promise.all(SITES.map(pinOf));
  assert(new Set(pins.map((p) => `${p.releaseId}|${p.releaseHash}`)).size === 1, "pins differ");
  assert(versionAtLeast(newPin.templateVersion, "1.3.0") && template.version === newPin.templateVersion && newPin.releaseId !== OLD_RELEASE.id, newPin.releaseId);
  assert(newPin.templateVersion !== "1.3.0" || (newPin.releaseId === STEP5_RELEASE.id && newPin.releaseHash === STEP5_RELEASE.hash), `1.3.0 pin ${newPin.releaseId}`);
  for (const s of SITES) assert(cur[s]!.record.template.releaseHash === newPin.releaseHash, `${s} built with ${cur[s]!.record.template.releaseId}`);
  await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", newPin.releaseId));
});
await check("C old 1.2.0 (and 1.1.0) releases: hash + every file unchanged, read-only, no Step 5 files; the 1.3.0 release unchanged + read-only", async () => {
  for (const r of [OLD_RELEASE, STEP4_RELEASE, STEP5_RELEASE]) {
    const old = await loadRelease(repoRoot, "interior-01", r.id);
    assert(old.releaseHash === r.hash, `${r.id}: releaseHash changed`);
    await verifyRelease(repoRoot, old);
    if (r !== STEP5_RELEASE) assert(!old.files.some((f) => /HeroCarousel|HomeHero|HomeReviews|FloatingCta|SnapTrack/.test(f.path)), `${r.id} contains Step 5 files`);
    const st = await stat(path.join(repoRoot, "data/template-releases/interior-01", r.id, "files/templates/interior-01/v1/template.ts"));
    assert((st.mode & 0o222) === 0, `${r.id}: release file is writable`);
  }
});
await check("rollback: each site's previous package = an older release (≥ 1.2.0, < current), intact", async () => {
  for (const s of SITES) {
    const p = prev[s];
    assert(p, `${s}: no previous package`);
    const v = p.record.template.releaseId.split("-").at(-2)!;
    assert(p.record.template.releaseId !== newPin.releaseId && versionAtLeast(v, "1.2.0") && !versionAtLeast(v, newPin.templateVersion), `${s}: previous built with ${p.record.template.releaseId}`);
    // Step 5 itself (current = 1.3.0) rolls back to exactly the Step 4.1 packages
    assert(newPin.templateVersion !== "1.3.0" || p.record.template.releaseId === OLD_RELEASE.id, `${s}: 1.3.0 previous built with ${p.record.template.releaseId}`);
    assert(await packageIntact(p.dir), `${s}: previous package damaged`);
  }
});
await check("D homepage section order is exactly hero · intro · projects-a · projects-b · reviews · image-band between header/footer; CTA outside the flow", () => {
  for (const s of SITES) {
    const h = home[s]!;
    const all = sectionsOf(h);
    assert(all[0] === "site.header", `${s}: header not first (${all.join()})`);
    const inMain = sectionsOf(mainOf(h));
    const expected = HOME_ORDER.filter((id) => inMain.includes(id));
    eq(inMain, expected, `${s}: order in <main>`);
    const afterMain = sectionsOf(h.slice(h.indexOf("</main>")));
    assert(afterMain[0] === "site.footer", `${s}: footer must follow <main>`);
    assert(!mainOf(h).includes("site.floating-cta"), `${s}: floating CTA inside the section flow`);
    if (afterMain.includes("site.floating-cta")) eq(afterMain, ["site.footer", "site.floating-cta"], `${s}: CTA follows the footer's own sections (it is the footer's last child)`);
  }
  eq(sectionsOf(mainOf(home["fixture-large"]!)), [...HOME_ORDER], "large renders every home section");
  eq(sectionsOf(mainOf(home["fixture-small"]!)), [...HOME_ORDER], "small renders every home section");
});
await check("E fixture-large: every intended section renders with its data (3 slides, intro+media+link, A 8, B 6, 6 reviews, band, CTA)", () => {
  const h = home["fixture-large"]!;
  eq(slideIds(sectionHtml(h, "home.hero")), ["calm-rooms", "planned-kitchens", "quiet-materials"], "slides (draft excluded, stored order)");
  const intro = sectionHtml(h, "home.intro");
  assert(intro.includes("i1-intro--media") && intro.includes(">A small studio for calm, lived-in homes</h2>") && /href="mailto:hello@fixture-large\.example"/.test(intro), "intro");
  assert(cardIds(sectionHtml(h, "home.projects-a")).length === 8 && cardIds(sectionHtml(h, "home.projects-b")).length === 6, "A/B counts");
  assert(sectionHtml(h, "home.projects-b").includes(">From the archive</h2>"), "B title slot");
  assert(reviewIds(sectionHtml(h, "home.reviews")).length === 6, "reviews");
  assert(/<img class="i1-band__img" src="\/assets\/[0-9a-f]+\.svg"/.test(sectionHtml(h, "home.image-band")), "band");
  // the contact destination: the business mailto; from 1.5.0 the /contact page (it writes to that mailto)
  const ctaHref = versionAtLeast(cur["fixture-large"]!.record.template.templateVersion, "1.5.0") ? "/contact" : "mailto:hello@fixture-large.example";
  // (1.5.0: a next/link, which writes href last)
  const ctaTag = ctaHref === "/contact" ? `<a class="i1-fcta__link" data-floating-cta="" href="/contact">` : `<a class="i1-fcta__link" href="${ctaHref}"`;
  assert(sectionHtml(h, "site.floating-cta").includes(ctaTag), "CTA");
});
await check("F fixture-small: SAME Template, Korean slots, warm theme, different hero/intro/queries/reviews/band/CTA label", async () => {
  const [l, s] = [home["fixture-large"]!, home["fixture-small"]!];
  assert(/<html[^>]*lang="ko-KR"/.test(s), "lang");
  assert(cur["fixture-small"]!.record.template.templateSourceHash === cur["fixture-large"]!.record.template.templateSourceHash, "template source differs");
  const theme = (h: string) => /<style id="site-theme">([^<]*)<\/style>/.exec(h)?.[1] ?? "";
  assert(theme(s) !== theme(l) && theme(s).includes("--color-canvas:rgb(250, 245, 238)"), "warm theme");
  const hero = sectionHtml(s, "home.hero");
  assert(hero.includes('aria-label="주요 소식"') && hero.includes('aria-label="2장 중 1번째"') && hero.includes('aria-label="다음 슬라이드"'), "Korean hero labels");
  assert(hero.includes(">빛이 오래 머무는 가상의 집</h2>") && !hero.includes("Calm rooms"), "different hero copy");
  assert(sectionHtml(s, "home.intro").includes(">생활에 맞춘 공간을 함께 그립니다</h2>") && sectionHtml(s, "home.intro").includes(">메일로 문의하기<"), "Korean intro + operator link");
  assert(sectionHtml(s, "home.reviews").includes(">고객 후기</h2>") && reviewIds(sectionHtml(s, "home.reviews")).length === 3, "Korean reviews");
  assert(sectionHtml(s, "site.floating-cta").includes("<span>상담 문의</span>"), "CTA label");
  const imgs = (h: string, id: string) => [...sectionHtml(h, id).matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ["home.hero", "home.intro", "home.image-band"]) assert(imgs(s, id).join() !== imgs(l, id).join(), `${id}: same media as large`);
});
await check("G fixture-empty: no projects A/B, no reviews/band/CTA, no portfolio nav or route, no empty wrappers", async () => {
  const h = home["fixture-empty"]!;
  eq(sectionsOf(mainOf(h)), ["home.hero", "home.intro"], "main sections");
  for (const needle of ["home.projects-a", "home.projects-b", "home.reviews", "home.image-band", "site.floating-cta", "i1-projects", "i1-track", "i1-reviews", "i1-band", "i1-fcta", "data-project-card", "/portfolio", "mailto:"]) {
    assert(!h.includes(needle), `found ${needle}`);
  }
  assert(!(await exists(path.join(cur["fixture-empty"]!.site, "portfolio.html"))) && !(await exists(path.join(cur["fixture-empty"]!.site, "portfolio"))), "portfolio route emitted");
  assert(!sectionHtml(h, "home.intro").includes("<img") && !sectionHtml(h, "home.intro").includes("i1-pill"), "text-only intro rendered media/link");
});
await check("H hero with >1 slides ships working-control markup: prev/next, pause, one dot per slide, one active slide", () => {
  for (const [s, n] of [["fixture-large", 3], ["fixture-small", 2]] as const) {
    const hero = sectionHtml(home[s]!, "home.hero");
    assert(hero.includes('aria-roledescription="carousel"') && hero.includes(`data-slides="${n}"`) && hero.includes("data-hero-controls"), `${s}: carousel`);
    assert((hero.match(/data-hero-dot="/g) ?? []).length === n, `${s}: dots`);
    assert(/i1-hero__arrow--prev/.test(hero) && /i1-hero__arrow--next/.test(hero) && /data-hero-toggle/.test(hero), `${s}: arrows/toggle`);
    assert((hero.match(/data-active="true"/g) ?? []).length === 1 && (hero.match(/aria-hidden="true" inert=""/g) ?? []).length === n - 1, `${s}: one active slide`);
  }
});
await check("I hero with 1 slide: no prev/next, no dots, no pause, not announced as a carousel", () => {
  const hero = sectionHtml(home["fixture-empty"]!, "home.hero");
  assert(hero.includes('data-slides="1"') && slideIds(hero).length === 1, "one slide");
  for (const needle of ["data-hero-controls", "data-hero-dot", "data-hero-toggle", "i1-hero__arrow", 'aria-roledescription="carousel"', "inert"]) assert(!hero.includes(needle), `found ${needle}`);
});
await check("K/L/N projects A/B: SAME collection, different subsets per settings, cards link to real detail pages", async () => {
  for (const s of ["fixture-large", "fixture-small"] as const) {
    const all = await stored<Project>(s, "content/projects.json");
    const byId = new Map(all.map((p) => [p.id, p]));
    const a = cardIds(sectionHtml(home[s]!, "home.projects-a"));
    const b = cardIds(sectionHtml(home[s]!, "home.projects-b"));
    assert(a.length > 0 && b.length > 0, `${s}: empty showcase`);
    assert([...a, ...b].every((id) => byId.get(id)?.status === "published"), `${s}: card not a published stored project`);
    assert(!a.some((id) => b.includes(id)), `${s}: A and B overlap`);
    for (const id of ["home.projects-a", "home.projects-b"]) {
      const links = hrefs(sectionHtml(home[s]!, id)).filter((x) => x.startsWith("/portfolio/"));
      assert(links.length >= cardIds(sectionHtml(home[s]!, id)).length, `${s} ${id}: cards without links`);
      for (const href of links) assert(await exists(path.join(cur[s]!.site, routeFile(href))), `${s}: dead card link ${href}`);
    }
  }
  const settings = await readJson(path.join(repoRoot, "data/sites/fixture-large/settings.json"));
  eq(cardIds(sectionHtml(home["fixture-large"]!, "home.projects-b")), settings.overrides["home.projects-b"].selection.ids, "large B = manual list, in order");
  const small = new Map((await stored<Project>("fixture-small", "content/projects.json")).map((p) => [p.id, p]));
  assert(cardIds(sectionHtml(home["fixture-small"]!, "home.projects-a")).every((id) => small.get(id)?.category === "residential"), "small A residential");
  assert(cardIds(sectionHtml(home["fixture-small"]!, "home.projects-b")).every((id) => small.get(id)?.category === "commercial"), "small B commercial");
});
await check("O reviews: non-empty → published only, stored order, limit; empty collection → whole section absent", async () => {
  const large = await stored<Review>("fixture-large", "content/reviews.json");
  const expected = large.filter((r) => r.status === "published").slice(0, 6).map((r) => r.id);
  eq(reviewIds(sectionHtml(home["fixture-large"]!, "home.reviews")), expected, "large reviews");
  assert(!home["fixture-large"]!.includes("rv-draft") && !home["fixture-large"]!.includes("rv-07"), "draft / over-limit review leaked");
  eq((await stored<Review>("fixture-empty", "content/reviews.json")).length, 0, "empty has an empty collection");
  assert(!home["fixture-empty"]!.includes("i1-reviews"), "empty reviews rendered a wrapper");
});
await check("Q image band: media present → renders; absent → no wrapper", () => {
  assert(sectionHtml(home["fixture-large"]!, "home.image-band") && sectionHtml(home["fixture-small"]!, "home.image-band"), "band missing");
  assert(!home["fixture-empty"]!.includes("i1-band"), "empty band wrapper");
});
await check("R floating CTA: valid destination → crawlable <a href> in the static HTML; none → absent", () => {
  for (const s of ["fixture-large", "fixture-small"] as const) {
    const cta = sectionHtml(home[s]!, "site.floating-cta");
    // destination: the business mailto; from 1.5.0 the /contact page (ia150.test.ts asserts it needs that email)
    const href = versionAtLeast(cur[s]!.record.template.templateVersion, "1.5.0") ? /<a class="i1-fcta__link" data-floating-cta="" href="\/contact">/ : /<a class="i1-fcta__link" href="mailto:[^"]+"/;
    assert(/^<div class="i1-fcta" data-section="site\.floating-cta">/.test(cta) && href.test(cta), `${s}: CTA`);
    // in the contentinfo landmark, as its last child (not loose outside every landmark)
    assert(sectionHtml(home[s]!, "site.footer").endsWith(`${cta}</footer>`), `${s}: CTA not the footer's last child`);
  }
  assert(!home["fixture-empty"]!.includes("site.floating-cta"), "empty has no contact destination");
});
await check("S/T/W all homepage media resolve through the AssetResolver to local, present, hashed package files", async () => {
  for (const s of SITES) {
    const h = home[s]!;
    const srcs = [...h.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]!);
    assert(srcs.length > 0, `${s}: no images`);
    for (const src of srcs) {
      assert(/^\/assets\/[0-9a-f]{20}\.(svg|png|jpe?g|webp|avif)$/.test(src), `${s}: non-resolver src ${src}`);
      assert(await exists(path.join(cur[s]!.site, src)), `${s}: missing ${src}`);
    }
    assert(!/(src|srcset|poster)="(https?:)?\/\//.test(h) && !/url\((['"]?)(https?:)?\/\//.test(h), `${s}: remote media`);
    assert(!/<video|<iframe/.test(h), `${s}: video/iframe on the homepage`);
  }
});
await check("U no source hostname/API/runtime/brand/widget leakage in any package (package QA + explicit scan)", async () => {
  const provenance = await readJson(path.join(repoRoot, "templates/interior-01/v1/provenance.json"));
  const terms = [...provenance.forbiddenTerms, "boostchat", "supabase", "channel.io", "kakao", "apartmentary"].map((t: string) => t.toLowerCase());
  for (const s of SITES) {
    assert(cur[s]!.record.qa.pass, `${s}: package QA failed`);
    for (const f of await walkFiles(cur[s]!.site)) {
      if (!/\.(html|txt|xml|js|css|json|svg)$/.test(f)) continue;
      const text = (await readFile(path.join(cur[s]!.site, f), "utf8")).toLowerCase();
      const hit = terms.find((t) => text.includes(t));
      assert(!hit, `${s}/${f}: ${hit}`);
    }
  }
});
await check("AB same input stays deterministic: prepareSiteInput twice = the current package's buildInputId", async () => {
  for (const s of SITES) {
    const at = cur[s]!.record.at;
    const [a, b] = await Promise.all([1, 2].map(() => prepareSiteInput({ repoRoot, siteId: s, mode: "public", at })));
    assert(a!.buildInputId === b!.buildInputId && a!.buildInputId === cur[s]!.record.buildInputId, `${s}: ${a!.buildInputId} / ${b!.buildInputId} / ${cur[s]!.record.buildInputId}`);
  }
});
await check("AC the new release changes every site's buildInputId (and the release part of it)", () => {
  for (const s of SITES) {
    assert(cur[s]!.record.buildInputId !== prev[s]!.record.buildInputId, `${s}: buildInputId unchanged`);
    const p = prev[s]!.record;
    assert(cur[s]!.record.parts.releaseHash === newPin.releaseHash && p.parts.releaseHash === p.template.releaseHash && p.parts.releaseHash !== newPin.releaseHash, `${s}: release part`);
  }
});
await check("AD portfolio list/pages/details/filters/404 regression-free: every non-home page's <main> byte-identical to the previous package (React useId values canonicalised)", async () => {
  for (const s of SITES) {
    // the 1.5.0 static pages are set aside on both sides (asserted by ia150.test.ts): see canonical-150.ts
    const now = withoutIaPages((await walkFiles(cur[s]!.site)).filter((f) => f.endsWith(".html")));
    const before = withoutIaPages((await walkFiles(prev[s]!.site)).filter((f) => f.endsWith(".html")));
    eq(now, before, `${s}: page set changed`);
    const email = JSON.parse(await readFile(path.join(repoRoot, "data/sites", s, "content/business.json"), "utf8")).data?.contact?.email as string | undefined;
    for (const f of now.filter((x) => x !== "index.html")) {
      // 1.4.1 changed the detail <main> in two declared ways: see canonical-141.ts; 1.5.0 the CTA href: canonical-150.ts
      const locale = JSON.parse(await readFile(path.join(repoRoot, "data/sites", s, "site.json"), "utf8")).identity.locale as string;
      const a = canonical150Main(canonical142(canonical141(canonicalIds(mainOf(await readFile(path.join(cur[s]!.site, f), "utf8"))), locale)), email);
      const b = canonical150Main(canonical142(canonical141(canonicalIds(mainOf(await readFile(path.join(prev[s]!.site, f), "utf8"))), locale)), email);
      assert(a && a === b, `${s}/${f}: <main> changed`);
    }
  }
});
await check("AE sitemap.xml + robots.txt byte-identical to the previous package (no route-count drift); home stays un-canonicalised", async () => {
  for (const s of SITES) {
    for (const f of ["sitemap.xml", "robots.txt"]) {
      // sitemap: the 1.5.0 static pages' entries set aside on both sides (canonical-150.ts)
      const a = canonical150Sitemap(await readFile(path.join(cur[s]!.site, f), "utf8").catch(() => "∅"));
      const b = canonical150Sitemap(await readFile(path.join(prev[s]!.site, f), "utf8").catch(() => "∅"));
      assert(a === b, `${s}/${f} changed`);
    }
    const title = (h: string) => /<title>[^<]*<\/title>/.exec(h)?.[0];
    assert(title(home[s]!) === title(await readFile(path.join(prev[s]!.site, "index.html"), "utf8")), `${s}: home <title> changed`);
  }
});

// ------------------------------------------------------------- throwaway --
console.log("\n[integration] throwaway-root builds (absent sections, CTA targets, origins, old-release compatibility)");
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "step5-root-"));
/** Strip the 1.3.0 homepage data back to the 1.2.0 shape (old strict schemas refuse the new keys). */
async function toV120Shape(dir: string) {
  const settings = await readJson(path.join(dir, "settings.json"));
  for (const k of ["home.hero", "home.intro", "home.projects-b", "home.reviews", "site.floating-cta"]) delete settings.overrides[k];
  await writeFile(path.join(dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
  const slots = await readJson(path.join(dir, "slots.json"));
  for (const k of ["home.hero", "home.intro", "home.projects-b", "home.reviews", "home.image-band", "site.floating-cta"]) delete slots.values[k];
  delete slots.values["home.projects-a"]?.previousLabel;
  delete slots.values["home.projects-a"]?.nextLabel;
  // a site whose only slots were homepage slots had no slots document at all in 1.2.0
  if (Object.keys(slots.values).length === 0) await rm(path.join(dir, "slots.json"));
  else await writeFile(path.join(dir, "slots.json"), `${JSON.stringify(slots, null, 2)}\n`);
  await rm(path.join(dir, "content/banners.json"), { force: true });
  await rm(path.join(dir, "content/reviews.json"), { force: true });
}
async function copySite(from: string, to: string) {
  const dir = path.join(tmpRoot, "data/sites", to);
  await cp(path.join(repoRoot, "data/sites", from), dir, { recursive: true });
  const site = await readJson(path.join(dir, "site.json"));
  site.siteId = to;
  await writeFile(path.join(dir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
  return dir;
}
try {
  await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
  const at = cur["fixture-small"]!.record.at;

  await check("J/O/Q/R absent data → absent sections: 0 published slides, no reviews doc, no band media, CTA disabled; dead /path link hidden + warned", async () => {
    const dir = await copySite("fixture-small", "absent-small");
    const banners = await readJson(path.join(dir, "content/banners.json"));
    banners.items = banners.items.map((b: Banner) => ({ ...b, status: "draft" }));
    await writeFile(path.join(dir, "content/banners.json"), JSON.stringify(banners, null, 2));
    await rm(path.join(dir, "content/reviews.json"));
    const slots = await readJson(path.join(dir, "slots.json"));
    delete slots.values["home.image-band"];
    slots.values["home.intro"].link = { label: "후기 보기", href: "#reviews" }; // an in-page anchor whose section is absent here
    await writeFile(path.join(dir, "slots.json"), JSON.stringify(slots, null, 2));
    const settings = await readJson(path.join(dir, "settings.json"));
    settings.overrides["site.floating-cta"] = { enabled: false };
    await writeFile(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2));
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "absent-small", at });
    assert(r.status === "built" && r.record.qa.pass, r.status);
    const h = await readFile(path.join(r.packageDir, "site/index.html"), "utf8");
    eq(sectionsOf(mainOf(h)), ["home.intro", "home.projects-a", "home.projects-b"], "main sections");
    for (const needle of ["i1-hero", "i1-reviews", "i1-band", "i1-fcta", "빛이 오래"]) assert(!h.includes(needle), `found ${needle}`);
    // the intro's "#reviews" link must disappear with the reviews section (no dead in-page anchor)
    assert(!h.includes('href="#reviews"'), "dead #reviews anchor");
    // hero disabled by setting also removes it, even with published slides
    await cp(path.join(repoRoot, "data/sites/fixture-small/content/banners.json"), path.join(dir, "content/banners.json"));
    settings.overrides["home.hero"] = { enabled: false };
    await writeFile(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2));
    // …and a /path link slot that is not a page of this build is hidden, with a build warning
    slots.values["home.intro"].link = { label: "없는 페이지", href: "/portfolio/nope" };
    await writeFile(path.join(dir, "slots.json"), JSON.stringify(slots, null, 2));
    const r2 = await buildSite({ repoRoot: tmpRoot, siteId: "absent-small", at, force: true });
    const h2 = await readFile(path.join(r2.packageDir, "site/index.html"), "utf8");
    assert(r2.status === "built" && !h2.includes("i1-hero"), "disabled hero rendered");
    assert(sectionHtml(h2, "home.intro").includes("i1-intro__title"), "intro missing (the link check below would pass vacuously)");
    assert(!h2.includes("/portfolio/nope") && !h2.includes("없는 페이지"), "dead /path link rendered");
    assert(r2.record.preflight.warnings.some((w) => w.startsWith("slot home.intro.link: link /portfolio/nope is not a page of this build")), `dead /path warning missing: ${r2.record.preflight.warnings.join(" | ")}`);
  });
  await check("hero CTA targets: unserved (draft) project → slide without CTA; unknown project → build FAILS; no email → no contact CTA; live /path link kept", async () => {
    const dir = await copySite("fixture-large", "cta-large");
    const banners = await readJson(path.join(dir, "content/banners.json"));
    banners.items[0].cta.target.project = "hp-0040"; // a DRAFT project: stored, never served publicly
    await writeFile(path.join(dir, "content/banners.json"), JSON.stringify(banners, null, 2));
    const business = await readJson(path.join(dir, "content/business.json"));
    delete business.data.contact;
    await writeFile(path.join(dir, "content/business.json"), JSON.stringify(business, null, 2));
    const slots = await readJson(path.join(dir, "slots.json"));
    slots.values["home.intro"].link = { label: "Read the reviews", href: "#reviews" }; // anchor of a RENDERED section → kept
    await writeFile(path.join(dir, "slots.json"), JSON.stringify(slots, null, 2));
    const { snapshot } = await buildSiteSnapshot({ repoRoot: tmpRoot, siteId: "cta-large", mode: "public", at });
    assert(snapshot.content.banners?.length === 3, "public banners");
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "cta-large", at });
    assert(r.status === "built", r.status);
    const hero = sectionHtml(await readFile(path.join(r.packageDir, "site/index.html"), "utf8"), "home.hero");
    assert(!hero.includes("i1-pill") && !hero.includes("mailto:") && !hero.includes("hp-0040"), "CTA to an unserved project / missing contact rendered");
    const html = await readFile(path.join(r.packageDir, "site/index.html"), "utf8");
    assert(!html.includes("i1-fcta"), "floating CTA without destination");
    assert(sectionHtml(html, "home.intro").includes('href="#reviews"') && html.includes('id="reviews"'), "live in-page anchor dropped");
    // the drops are not silent: the build record names each one
    const w = r.record.preflight.warnings.join("\n");
    assert(w.includes("banner calm-rooms: CTA target project hp-0040 is not served in this build (draft)"), `project CTA warning missing: ${w}`);
    assert(w.includes("banner planned-kitchens: contact CTA but the site has no contact destination"), `contact CTA warning missing: ${w}`);
    // a /path link slot that IS a page of this build is kept (rendered as an internal link), unwarned
    slots.values["home.intro"].link = { label: "See the portfolio", href: "/portfolio" };
    await writeFile(path.join(dir, "slots.json"), JSON.stringify(slots, null, 2));
    const r3 = await buildSite({ repoRoot: tmpRoot, siteId: "cta-large", at, force: true });
    assert(r3.status === "built", r3.status);
    assert(sectionHtml(await readFile(path.join(r3.packageDir, "site/index.html"), "utf8"), "home.intro").includes('href="/portfolio"'), "live /path link dropped");
    assert(!r3.record.preflight.warnings.some((w) => w.startsWith("slot ")), `live link warned: ${r3.record.preflight.warnings.join(" | ")}`);
    banners.items[0].cta.target.project = "hp-9999";
    await writeFile(path.join(dir, "content/banners.json"), JSON.stringify(banners, null, 2));
    await rejects(() => buildSiteSnapshot({ repoRoot: tmpRoot, siteId: "cta-large", mode: "public", at }), /banner "calm-rooms" CTA targets unknown project "hp-9999"/);
  });
  await check("P reference-fixture reviews/banners under data/sites → FAIL; preview mode serves drafts, public never", async () => {
    const dir = await copySite("fixture-large", "origin-large");
    const { snapshot: pre } = await buildSiteSnapshot({ repoRoot: tmpRoot, siteId: "origin-large", mode: "preview", at });
    assert(pre.content.reviews?.some((r) => r.id === "rv-draft") && pre.content.banners?.some((b) => b.id === "draft-slide"), "preview drafts");
    const { snapshot: pub } = await buildSiteSnapshot({ repoRoot: tmpRoot, siteId: "origin-large", mode: "public", at });
    assert(!pub.content.reviews?.some((r) => r.status === "draft") && !pub.content.banners?.some((b) => b.status === "draft"), "public drafts");
    for (const doc of ["content/reviews.json", "content/banners.json"]) {
      const d = await readJson(path.join(dir, doc));
      const original = d.origin;
      d.origin = "reference-fixture";
      await writeFile(path.join(dir, doc), JSON.stringify(d, null, 2));
      await rejects(() => buildSiteSnapshot({ repoRoot: tmpRoot, siteId: "origin-large", mode: "public", at }), /origin "reference-fixture" is not allowed/);
      d.origin = original;
      await writeFile(path.join(dir, doc), JSON.stringify(d, null, 2));
    }
  });
  await check("old-release compatibility: 1.2.0-shaped data re-pinned to 1.2.0 reproduces the site's recorded 1.2.0 buildInputId", async () => {
    // the 1.2.0 package itself is pruned once a later release is current (retention = current + previous);
    // history.jsonl keeps every successful build's buildInputId. `at` only gates scheduled items
    // (fixtures schedule nothing between 2025 and 2031), so the record's finish time rebuilds the same inputs.
    const v120 = Object.fromEntries(await Promise.all(SITES.map(async (s) => {
      if (prev[s]?.record.template.releaseId === OLD_RELEASE.id) return [s, { buildInputId: prev[s]!.record.buildInputId as string, at: prev[s]!.record.at as string }] as const;
      const lines = (await readFile(path.join(repoRoot, "data/site-builds", s, "history.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l));
      const rec = lines.filter((r) => r.status === "success" && r.releaseId === OLD_RELEASE.id).at(-1);
      assert(rec, `${s}: no recorded 1.2.0 build`);
      return [s, { buildInputId: rec.buildInputId as string, at: rec.finishedAt as string }] as const;
    })));
    const root2 = path.join(tmpRoot, "compat");
    await mkdir(path.join(root2, "data/sites"), { recursive: true });
    await symlink(path.join(repoRoot, "data/template-releases"), path.join(root2, "data/template-releases"));
    await symlink(path.join(repoRoot, "node_modules"), path.join(root2, "node_modules"));
    for (const s of SITES) {
      const dir = path.join(root2, "data/sites", s);
      await cp(path.join(repoRoot, "data/sites", s), dir, { recursive: true });
      const site = await readJson(path.join(dir, "site.json"));
      site.template = { templateId: "interior-01", templateVersion: "1.2.0", releaseId: OLD_RELEASE.id, releaseHash: OLD_RELEASE.hash };
      await writeFile(path.join(dir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
      await toV120Shape(dir);
      const { buildInputId } = await prepareSiteInput({ repoRoot: root2, siteId: s, mode: "public", at: v120[s]!.at });
      assert(buildInputId === v120[s]!.buildInputId, `${s}: ${buildInputId} ≠ recorded 1.2.0 build ${v120[s]!.buildInputId}`);
    }
    // …and the CURRENT builder still builds it (strict 1.2.0 schemas accept the stripped data)
    const r = await buildSite({ repoRoot: root2, siteId: "fixture-small", at: v120["fixture-small"]!.at });
    assert(r.status === "built" && r.record.template.releaseId === OLD_RELEASE.id && r.record.qa.pass, r.status);
    assert(r.status === "built" && r.record.buildInputId === v120["fixture-small"]!.buildInputId, "rebuilt 1.2.0 buildInputId");
  });
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log(`\nstep5: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
