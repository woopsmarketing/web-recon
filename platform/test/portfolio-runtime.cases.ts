/**
 * The cases of the incremental portfolio publishing proof (portfolio-runtime.test.ts).
 *
 * ONE case = one site published incrementally (a shell package + its release's runtime kit) held to
 * the last ORDINARY package of the same site. The proof itself is the same for every case; a case
 * says only what differs between Templates:
 *
 *   reference        where the last ordinary package of the site is (a commit that carries it)
 *   dataset          how many records / categories the site's own dataset holds (a guard)
 *   shellSlots       the runtime slots of each shell page, in document order
 *   generatedIds     the ids a composed page writes where an ordinary build writes React's useId()
 *   differences      every accepted difference between a composed page and the built one, in words
 *   browser          how to drive the Template's pages in a real browser (selectors, one filter, the
 *                    detail gallery, anything else the Template's list can do)
 *   extra            further kit-level proofs that only make sense for this Template
 *
 * TO ADD A CASE (another Template that declares the portfolio runtime, with a site built as a shell):
 * write its `RuntimeProofCase` below and append it to RUNTIME_PROOF_CASES. Nothing in
 * portfolio-runtime.test.ts names a site, a Template or a section.
 * Run one case: PORTFOLIO_RUNTIME_CASES=<siteId>[,<siteId>] pnpm test:portfolio-runtime
 */
import type { Page } from "playwright";
import type { PortfolioSiteInput, PortfolioSiteResult } from "../portfolio-runtime/entry";

export type ProofViewport = "desktop" | "mobile";
export type ProofRecord = { id: string; slug: string; title: string; category: string; publishedAt: string; status: string; cover: { asset: string; alt?: string } } & Record<string, any>;
export type ProofAsset = { id: string; file: string; mediaType: string; width: number; height: number; sha256: string; size: number };
export type Composed = Extract<PortfolioSiteResult, { ok: true }>;

/** How a Template's composed pages are driven in a browser. Every action is a real click / key on a visible control. */
export interface ProofBrowserDriver {
  /** resolves once the list on /portfolio is hydrated and has read the URL */
  listReady(page: Page): Promise<void>;
  /** the cards the list shows now; each is identified by [data-project-card] or by its link */
  cards: string;
  /** a link to a project inside the home section that lists projects */
  homeProjectLink: string;
  /** the link of a card of the list on /portfolio (default: a link inside the list's `ul[data-shown]`) */
  listCardLink?: string;
  /**
   * the element of the homepage whose markup must still be the composed markup once the page is
   * hydrated: "main" (default), or `[attribute="value"]` of a runtime slot's section when <main>
   * opens with a section that changes its own attributes after hydration (a running slider)
   */
  hydrationProbe?: string;
  /** one choice that narrows the unfiltered list (fewer cards, not none) and writes it to the URL */
  applyFilter(page: Page, viewport: ProofViewport): Promise<void>;
  /** the gallery of the detail page the browser is on works; `record` is the one the page shows */
  detailGallery(page: Page, record: ProofRecord): Promise<void>;
  /** anything else the list can do — the page is on the unfiltered /portfolio, hydrated; leave it there */
  listExtras?(page: Page, t: { records: ProofRecord[]; viewport: ProofViewport; resultCount(): Promise<number>; cardIds(): Promise<string[]> }): Promise<void>;
}

/** What `extra` gets: the kit, this site's input, and the proof's own helpers. */
export interface ProofToolkit {
  check(name: string, fn: () => unknown | Promise<unknown>): Promise<boolean>;
  assert(cond: unknown, msg: string): asserts cond;
  eq(a: unknown, b: unknown, msg: string): void;
  /** the kit; never throws for a refusal */
  render(input: PortfolioSiteInput): PortfolioSiteResult;
  /** this site's input (its package documents and shell pages, its dataset as the export), with overrides */
  input(over?: Partial<PortfolioSiteInput>): PortfolioSiteInput;
  /** the site composed from its own dataset */
  composed: Composed;
  records: ProofRecord[];
  categories: { id: string; name: string }[];
  assets: ProofAsset[];
  /** the shell document of the package (`_runtime/portfolio/shell.json`) */
  shell: { schema: string; snapshot: Record<string, any> };
  /** a 9th record, newest, with an image no other record has — and that image */
  ninth: { record: ProofRecord; asset: ProofAsset };
  /** the body of a composed file */
  body(result: Composed, path: string): string;
  mainOf(html: string): string;
  /** the public path of a portfolio image of this site, by asset id */
  publicPath(assetId: string): string;
}

export interface RuntimeProofCase {
  /** data/sites/<site> — marked portfolio-source@2, its current package a shell */
  site: string;
  /** shown in the log */
  label: string;
  /** the last ordinary package of the site: read from a commit that carries it */
  reference: { commit: string; buildInputId: string; what: string };
  dataset: { records: number; categories: number };
  /** shell page file → its runtime slots, in document order (the first entry is the homepage) */
  shellSlots: Record<string, string[]>;
  /**
   * which shell page is which, for a Template that has more than the three of the default (the keys of
   * `shellSlots` in order: homepage, list, detail). `listPages` = a separate shell that list pages
   * 2…N are composed from (a Template whose header marks the current PAGE: on /portfolio the list link
   * is the current page, on /portfolio/page/2 it is only the current section). It is a shell page of
   * the package like the other three — never a built list page — and never served under its own URL.
   */
  shellRoles?: { home: string; list: string; detail: string; listPages?: string };
  /**
   * the 9th record of the proof is a copy of the last one with a NEW image as its cover, and the proof
   * holds its detail page to showing that image. A Template whose detail page shows the gallery and not
   * the cover (the cover is the card's picture and the page's og:image) says here where the record
   * carries the new image as well, so that the same assertion is about a picture the page really shows.
   */
  ninthRecord?(record: ProofRecord, newAssetId: string): ProofRecord;
  /** ids a composed page carries where an ordinary build carries React's "_R_…_" ids */
  generatedIds: RegExp;
  /** the complete list of what a composed page may differ in from the built one (normalised or not compared byte for byte) */
  differences: string[];
  /**
   * the image preload hints of a composed page's <head> vs the reference's: "identical" = the same
   * list in the same order; "same-set" = the same images at the same priority, order not held
   */
  imagePreloads: "identical" | "same-set";
  /**
   * images of a record that this Template puts on no page (asset ids). The kit lists every image a
   * visible record names (the platform's content model, as an ordinary build copies them all); a
   * Template that does not show some of them says which here, and the proof holds assets[] to exactly
   * "what the pages reference + these".
   */
  notShown?(record: ProofRecord): string[];
  /**
   * ids of the records whose TITLE the site's own copy quotes (a text the operator typed into
   * settings.json / slots.json — site data, in the package like any other copy; it does not follow the record when
   * that is renamed or withdrawn). The proof holds the package to exactly these and no other record's
   * title, and to no record's slug at all. Default: none.
   */
  siteCopyQuotes?: readonly string[];
  /** every compared page carries at least this many title / description / canonical / og / twitter tags */
  minHeadTags: number;
  browser: ProofBrowserDriver;
  extra?(t: ProofToolkit): Promise<void>;
}

const BOUNDARY_MARKERS = "Suspense boundary markers <!--$--> … <!--/$--> around each runtime slot (the shell renders a slot inside its own boundary; an ordinary build renders the section directly)";
const GENERATED_IDS = 'the values of React-generated ids: "_R_…_" in an ordinary build, "rs-<slot>-<name>" in a composed page (same elements, same references between them)';
const PRELOAD_ORDER =
  "the image preload hints of the <head>: the same images at the same priority, but in the order and attribute order React's HTML renderer writes them for a client-rendered section (the layout's own first), where the reference build (an earlier release line, the sections rendered on the server) wrote them through the flight renderer";

// ─────────────────────────────────────────────────────────────────────────── interior-02 / Demo 02 ──
const interior02Demo02: RuntimeProofCase = {
  site: "boost-interior-demo-02",
  label: "interior-02 · Demo 02",
  /** release interior-02 1.0.1, all 8 records built in */
  reference: { commit: "da1f551171a7fcd70d967adb6fe1eb525cd674c4", buildInputId: "9314d888bf9bf4596693abf11c153242ba894b5ae36209e04a562fdbf21cffc6", what: "the last V1 package (interior-02 1.0.1)" },
  dataset: { records: 8, categories: 4 },
  shellSlots: {
    "index.html": ["home.hero", "home.projects", "home.keywords", "home.recent"],
    "portfolio.html": ["portfolio.index"],
    "portfolio/_shell.html": ["portfolio.detail"],
  },
  generatedIds: /rs-(?:home|portfolio)-[a-z]+-(?:browser|gallery|total)(?![a-z])/g,
  differences: [BOUNDARY_MARKERS, GENERATED_IDS, PRELOAD_ORDER],
  // (the proof did not compare preload hints before it was made parametric: the set is held now, the order is not the reference's on 9 of 10 pages)
  imagePreloads: "same-set",
  // the service page's three "대표 사례" rows are operator copy (slots.json, tier1Row5Value / tier2Row4Value / tier3Row5Value) that spell a project's title
  siteCopyQuotes: ["bi-01", "bi-04", "bi-08"],
  minHeadTags: 17,
  browser: {
    listReady: async (page) => {
      await page.locator('.i2-plist__row[data-ready="true"]').waitFor({ timeout: 10_000 });
    },
    cards: '[data-filter-results] [data-project-card], [data-section="portfolio.index"] ul[data-shown] > li',
    homeProjectLink: '[data-section="home.projects"] a[href^="/portfolio/"]',
    applyFilter: async (page, viewport) => {
      // a real click on a visible control: the panel is a side column on desktop, a sheet on mobile
      const option = page.locator("[data-filter-group] label.i2-pcheck").first();
      if (!(await option.isVisible())) await page.locator("[data-filter-open]").click();
      await option.click();
      await page.waitForFunction(() => location.search.length > 1);
      const apply = page.locator("[data-filter-apply]");
      if (viewport === "mobile" && (await apply.isVisible())) await apply.click();
    },
    detailGallery: async (page) => {
      const zoom = page.locator("[data-gallery-zoom]").first();
      await zoom.scrollIntoViewIfNeeded();
      await zoom.click();
      const viewer = page.locator("dialog[data-gallery-viewer]");
      await viewer.waitFor({ state: "visible", timeout: 5000 });
      if (!(await viewer.evaluate((d) => (d as HTMLDialogElement).open))) throw new Error("the dialog is not open");
      await page.locator("[data-viewer-img]").waitFor({ state: "visible" });
      if (!(await page.locator("[data-viewer-img]").evaluate((i) => (i as HTMLImageElement).decode().then(() => (i as HTMLImageElement).naturalWidth > 0)))) throw new Error("the viewer image did not load");
      await page.locator("[data-viewer-close]").click();
      await page.waitForFunction(() => !document.querySelector("dialog[data-gallery-viewer]") || !(document.querySelector("dialog[data-gallery-viewer]") as HTMLDialogElement).open);
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────── interior-03 / Demo 03 ──
/** [data-gallery-tile] of a homepage, in order: the category, where it links, the picture it shows */
function galleryTiles(main: string): { id: string; href: string | undefined; src: string; name: string }[] {
  return [...main.matchAll(/<li class="i3-gal__tile" data-gallery-tile="([^"]+)">([\s\S]*?)<\/li>/g)].map((m) => ({
    id: m[1]!,
    href: /<a[^>]*href="([^"]*)"/.exec(m[2]!)?.[1]?.replace(/&amp;/g, "&"),
    src: /<img[^>]*src="([^"]*)"/.exec(m[2]!)?.[1] ?? "",
    name: /<h3 class="i3-gal__name">([^<]*)<\/h3>/.exec(m[2]!)?.[1] ?? "",
  }));
}
const cardLinks = (section: string) => [...section.matchAll(/<li class="i3-card" data-project-card="([^"]+)"><a[^>]*href="([^"]*)"/g)].map((m) => ({ id: m[1]!, href: m[2]! }));
const sectionOf = (main: string, name: string) => {
  const at = main.indexOf(`data-section="${name}"`);
  if (at < 0) return undefined;
  const next = main.indexOf("data-section=", at + 20);
  return main.slice(at, next < 0 ? undefined : next);
};

const interior03Demo03: RuntimeProofCase = {
  site: "boost-interior-demo-03",
  label: "interior-03 · Demo 03",
  /** release interior-03 1.0.0, all 8 records built in — packageHash d5a7904f…, the package live before the site became a shell */
  reference: { commit: "b2a29d2", buildInputId: "01bd9e87bc84a78cebe0d63c7be941e8b638ba195088e9013dfe99f605fe6b8a", what: "the last ordinary package (interior-03 1.0.0, packageHash d5a7904f…)" },
  dataset: { records: 8, categories: 4 },
  shellSlots: {
    "index.html": ["home.gallery", "home.portfolio"],
    "portfolio.html": ["portfolio.index"],
    "portfolio/_shell.html": ["portfolio.detail"],
  },
  generatedIds: /rs-portfolio-index-browser(?![a-z])/g,
  differences: [BOUNDARY_MARKERS, GENERATED_IDS, PRELOAD_ORDER],
  imagePreloads: "same-set",
  /** the detail page shows the cover and the gallery images; a `before` photo is on no page of this Template */
  notShown: (record) => ((record.galleryGroups ?? []) as { items: { before?: { asset: string } }[] }[]).flatMap((g) => g.items.flatMap((it) => (it.before ? [it.before.asset] : []))),
  minHeadTags: 17,
  browser: {
    listReady: async (page) => {
      await page.locator('[data-section="portfolio.index"][data-ready="true"]').waitFor({ timeout: 10_000 });
    },
    cards: '[data-section="portfolio.index"] ul[data-shown] > li',
    homeProjectLink: '[data-section="home.portfolio"] a[href^="/portfolio/"]',
    // <main> opens with the hero, a running slider (it is shell markup, not a slot); the first slot's section is static
    hydrationProbe: '[data-section="home.gallery"]',
    applyFilter: async (page) => {
      // the second category tab (the first cell is "All"): a button, visible on both viewports
      const tab = page.locator('[data-lnb] [data-lnb-item]:not([data-lnb-item="*"])').nth(1);
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      await page.waitForFunction(() => new URLSearchParams(location.search).has("category"));
      if ((await tab.getAttribute("aria-pressed")) !== "true") throw new Error("the chosen tab is not marked as pressed");
    },
    detailGallery: async (page, record) => {
      // the photo stack: the cover first, then every gallery image once, in group order; each one really loads
      const want = [record.cover.asset as string];
      for (const g of (record.galleryGroups ?? []) as { items: { image: { asset: string } }[] }[]) for (const it of g.items) if (!want.includes(it.image.asset)) want.push(it.image.asset);
      const photos = page.locator('[data-section="portfolio.detail"] [data-photos] img');
      const n = await photos.count();
      if (n !== want.length) throw new Error(`the photo stack shows ${n} images, the record has ${want.length}`);
      for (let i = 0; i < n; i++) {
        const img = photos.nth(i);
        await img.scrollIntoViewIfNeeded();
        const ok = await img.evaluate((el) => (el as HTMLImageElement).decode().then(() => (el as HTMLImageElement).naturalWidth > 0, () => false));
        if (!ok) throw new Error(`photo ${i + 1} of the stack did not load (${await img.getAttribute("src")})`);
      }
      const eager = await photos.evaluateAll((els) => els.filter((e) => e.getAttribute("loading") === "eager").length);
      if (eager !== 1) throw new Error(`${eager} photos load eagerly (the first one only)`);
      // the list button leads back to the list filtered to this record's category — a document load
      const back = page.locator("[data-detail-back]");
      const href = await back.getAttribute("href");
      if (href !== `/portfolio?category=${encodeURIComponent(record.category)}`) throw new Error(`the list button links ${href}`);
      await back.scrollIntoViewIfNeeded();
      await Promise.all([page.waitForURL((u) => u.pathname === "/portfolio" && u.searchParams.get("category") === record.category), back.click()]);
      await page.locator('[data-section="portfolio.index"][data-ready="true"][data-filtered="true"]').waitFor({ timeout: 10_000 });
      if ((await page.locator(`[data-lnb-item="${record.category}"]`).getAttribute("aria-pressed")) !== "true") throw new Error("the list did not open on the record's category");
    },
    listExtras: async (page, { records, resultCount, cardIds }) => {
      // the title search: a word that only some titles hold → those cards, ?q= in the URL; an emptied field clears it
      const word = "수성";
      const want = records.filter((r) => r.title.includes(word)).map((r) => r.id).sort();
      if (want.length === 0 || want.length === records.length) throw new Error(`the search word "${word}" does not split the dataset`);
      const field = page.locator('[data-list-search] input[name="q"]');
      await field.scrollIntoViewIfNeeded();
      await field.fill(word);
      await field.press("Enter");
      await page.waitForFunction((w) => new URLSearchParams(location.search).get("q") === w, word);
      const found = (await cardIds()).sort();
      if (JSON.stringify(found) !== JSON.stringify(want)) throw new Error(`searching "${word}" shows ${JSON.stringify(found)}, the titles say ${JSON.stringify(want)}`);
      if ((await resultCount()) !== want.length) throw new Error("the count line does not say the number of matches");
      if ((await page.locator('meta[name="robots"][content="noindex, follow"]').count()) !== 1) throw new Error("a filtered view is not marked noindex");
      // category AND text together, then nothing matches → the empty line
      await field.fill("이런 제목은 없습니다");
      await field.press("Enter");
      await page.locator("[data-list-empty]").waitFor({ timeout: 5000 });
      if ((await resultCount()) !== 0) throw new Error("an empty result is not counted as 0");
      await field.fill("");
      await page.waitForFunction(() => location.search === "");
      if ((await resultCount()) !== records.length) throw new Error("clearing the search did not restore the list");
    },
  },

  /**
   * interior-03 only: the homepage sections that are DERIVED from the portfolio — the category tiles
   * (home.gallery) and the project grid (home.portfolio) — follow what is published.
   */
  async extra(t) {
    const { check, eq } = t;
    const assert: ProofToolkit["assert"] = t.assert;
    const ok = (r: PortfolioSiteResult): Composed => {
      if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.problems)}`);
      return r;
    };
    const home = (r: Composed) => t.mainOf(t.body(r, "/"));
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
    const categories = [...t.categories].sort(byId);
    const latestOf = (records: ProofRecord[], category: string) => [...records].filter((r) => r.category === category).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || byId(a, b))[0];
    const slots = t.shell.snapshot.slots.values as Record<string, Record<string, any>>;
    const settings = t.shell.snapshot.settings.overrides as Record<string, Record<string, any>>;
    const siteAssets = new Map((t.shell.snapshot.assets as { id: string; publicPath: string }[]).map((a) => [a.id, a.publicPath]));
    const withShell = (change: (snapshot: Record<string, any>) => void) => {
      const snapshot = structuredClone(t.shell.snapshot);
      change(snapshot);
      return { ...t.shell, snapshot };
    };
    /** the same site without the four tile pictures it authored: a tile then shows its category's latest cover */
    const noTilePictures = withShell((s) => {
      for (const key of Object.keys(s.slots.values["home.gallery"])) if (/^tile\dMedia$/.test(key)) delete s.slots.values["home.gallery"][key];
    });

    await check("X1 home.gallery: one tile per category that has a published record (reader order, at most four), each linking the list filtered to it and showing the picture the site set for that tile", () => {
      const tiles = galleryTiles(home(t.composed));
      const used = categories.filter((c) => t.records.some((r) => r.category === c.id)).slice(0, 4);
      eq(tiles.map((x) => [x.id, x.name, x.href]), used.map((c) => [c.id, c.name, `/portfolio?category=${encodeURIComponent(c.id)}`]), "tiles");
      eq(tiles.map((x) => x.src), used.map((_, i) => siteAssets.get(slots["home.gallery"]![`tile${i + 1}Media`].asset)), "tile pictures = the site's own tile media, in tile order");
      assert(tiles.length === 4, `the dataset shows ${tiles.length} tiles`);
    });
    await check("X2 home.gallery without a tile picture: the cover of the category's latest record — a published image, listed in assets[]", () => {
      const r = ok(t.render(t.input({ shell: noTilePictures })));
      const tiles = galleryTiles(home(r));
      eq(tiles.map((x) => x.src), tiles.map((x) => t.publicPath(latestOf(t.records, x.id)!.cover.asset)), "tile pictures = the latest cover per category");
      for (const x of tiles) assert(r.assets.some((a) => a.publicPath === x.src), `the tile picture ${x.src} is not a listed portfolio image`);
    });
    await check("X3 a category that loses its last record loses its tile, its tab and every link to its filtered list; the other tiles close up in order", () => {
      const alone = categories.find((c) => t.records.filter((r) => r.category === c.id).length === 1);
      assert(alone, "the dataset has no category with exactly one record");
      const records = t.records.filter((r) => r.category !== alone.id);
      // the site's manual home selection may name the removed record: the release skips an id that is not served
      const r = ok(t.render(t.input({ portfolio: { categories: t.categories, projects: records, assets: t.assets } })));
      const tiles = galleryTiles(home(r));
      const used = categories.filter((c) => c.id !== alone.id);
      eq(tiles.map((x) => x.id), used.map((c) => c.id), "tiles");
      eq(tiles.map((x) => x.src), used.map((_, i) => siteAssets.get(slots["home.gallery"]![`tile${i + 1}Media`].asset)), "tile n keeps the n-th tile picture of the site (the pictures are positional slots)");
      const list = t.mainOf(t.body(r, "/portfolio"));
      eq([...list.matchAll(/data-lnb-item="([^"]+)"/g)].map((m) => m[1]), ["*", ...used.map((c) => c.id)], "list tabs");
      for (const f of r.files) assert(!f.body.includes(`category=${encodeURIComponent(alone.id)}`), `${f.path} still links the list of the emptied category`);
      // …and the same with pictures taken from the records: the emptied category's image is gone from the page and from assets[]
      const derived = ok(t.render(t.input({ shell: noTilePictures, portfolio: { categories: t.categories, projects: records, assets: t.assets } })));
      eq(galleryTiles(home(derived)).map((x) => x.src), used.map((c) => t.publicPath(latestOf(records, c.id)!.cover.asset)), "derived tile pictures");
    });
    await check("X4 a 9th record in a NEW category: the category gets a tile (in reader order; a fifth category is cut) and a tab; in an existing category it becomes that tile's derived picture", () => {
      const fresh = { id: "aa-proof-category", name: "증명용 새 유형" };
      const record = { ...t.ninth.record, category: fresh.id };
      const portfolio = { categories: [...t.categories, fresh], projects: [...t.records, record], assets: [...t.assets, t.ninth.asset] };
      const r = ok(t.render(t.input({ shell: noTilePictures, portfolio })));
      const tiles = galleryTiles(home(r));
      const used = [...categories, fresh].sort(byId).slice(0, 4);
      eq(tiles.map((x) => [x.id, x.name]), used.map((c) => [c.id, c.name]), "tiles");
      eq(tiles[0]!.src, t.publicPath(t.ninth.asset.id), "the new category's tile shows the new record's cover");
      assert(r.assets.some((a) => a.id === t.ninth.asset.id), "the new image is not listed");
      eq([...t.mainOf(t.body(r, "/portfolio")).matchAll(/data-lnb-item="([^"]+)"/g)].map((m) => m[1]), ["*", ...[...categories, fresh].sort(byId).map((c) => c.id)], "list tabs (all five)");
      // in an existing category: newest there → the tile's derived picture
      const same = ok(t.render(t.input({ shell: noTilePictures, portfolio: { categories: t.categories, projects: [...t.records, t.ninth.record], assets: [...t.assets, t.ninth.asset] } })));
      const tile = galleryTiles(home(same)).find((x) => x.id === t.ninth.record.category);
      eq(tile?.src, t.publicPath(t.ninth.asset.id), "the tile of the 9th record's category");
    });
    await check("X5 home.portfolio: this site names its six records by id, so a 9th record does not enter the grid; with the selection `latest` the same record leads it; a named record that is no longer published leaves it", () => {
      const selection = settings["home.portfolio"]!.selection as { mode: string; ids: string[] };
      eq(selection.mode, "manual", "the site's home selection");
      const grid = (r: Composed) => cardLinks(sectionOf(home(r), "home.portfolio") ?? "");
      eq(grid(t.composed).map((c) => c.id), selection.ids, "the grid = the named records, in the named order");
      const portfolio = { categories: t.categories, projects: [...t.records, t.ninth.record], assets: [...t.assets, t.ninth.asset] };
      eq(grid(ok(t.render(t.input({ portfolio })))).map((c) => c.id), selection.ids, "nine records, manual selection");
      const latest = withShell((s) => {
        s.settings.overrides["home.portfolio"] = { ...s.settings.overrides["home.portfolio"], selection: { mode: "latest" } };
      });
      const r = ok(t.render(t.input({ shell: latest, portfolio })));
      eq(grid(r)[0], { id: t.ninth.record.id, href: `/portfolio/${t.ninth.record.slug}` }, "nine records, latest selection: the first card");
      assert(sectionOf(home(r), "home.portfolio")!.includes(t.publicPath(t.ninth.asset.id)), "the new record's cover is not on the homepage");
      const gone = selection.ids[1]!;
      const without = ok(t.render(t.input({ portfolio: { categories: t.categories, projects: t.records.filter((x) => x.id !== gone), assets: t.assets } })));
      eq(grid(without).map((c) => c.id), selection.ids.filter((id) => id !== gone), "a named record that is not published is skipped");
    });
    await check("X7 more records than one list page holds: /portfolio shows the newest 18 and links /portfolio/page/2, which is composed from the same shell with its own canonical; every record is in the list data of both (tabs and search filter in place)", () => {
      const more = Array.from({ length: 12 }, (_, i) => ({
        ...t.records[i % t.records.length]!,
        id: `proof-${String(i + 1).padStart(2, "0")}`,
        slug: `proof-more-${i + 1}`,
        title: `증명용 추가 사례 ${i + 1}`,
        publishedAt: `2026-09-${String(i + 1).padStart(2, "0")}T09:00:00+09:00`,
      }));
      const records = [...t.records, ...more];
      const r = ok(t.render(t.input({ portfolio: { categories: t.categories, projects: records, assets: t.assets } })));
      const pages = r.files.map((f) => f.path).filter((p) => p === "/portfolio" || p.startsWith("/portfolio/page/"));
      eq(pages, ["/portfolio", "/portfolio/page/2"], "list pages");
      const newest = [...records].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || byId(a, b)).map((x) => x.id);
      const [first, second] = [t.body(r, "/portfolio"), t.body(r, "/portfolio/page/2")];
      eq(cardLinks(t.mainOf(first)).map((x) => x.id), newest.slice(0, 18), "page 1 cards (latest order)");
      eq(cardLinks(t.mainOf(second)).map((x) => x.id), newest.slice(18), "page 2 cards");
      // (the two step arrows are inert with a single block of pages: anchors without href)
      const pagerLinks = (main: string) => (main.match(/<a class="i3-pager__item"[^>]*>/g) ?? []).filter((a) => a.includes(" href=")).map((a) => `${/data-page="(\d+)"/.exec(a)?.[1]} → ${/href="([^"]*)"/.exec(a)?.[1]}`);
      eq([pagerLinks(t.mainOf(first)), pagerLinks(t.mainOf(second))], [["2 → /portfolio/page/2"], ["1 → /portfolio"]], "the pager links the two pages to each other");
      const origin = t.shell.snapshot.site.identity.publicOrigin as string;
      assert(second.includes(`<link rel="canonical" href="${origin}/portfolio/page/2"/>`) && first.includes(`<link rel="canonical" href="${origin}/portfolio"/>`), "canonical of the list pages");
      for (const body of [first, second]) {
        const data = JSON.parse(/<script type="application\/json" id="recon-portfolio-slots">([\s\S]*?)<\/script>/.exec(body)![1]!) as { "portfolio.index": { entries: { id: string }[]; pageCount: number; total: number; pagedRoute: boolean } };
        eq([data["portfolio.index"].entries.map((e) => e.id), data["portfolio.index"].pageCount, data["portfolio.index"].total, data["portfolio.index"].pagedRoute], [newest, 2, 20, true], "list data");
      }
      assert(t.body(r, "/sitemap.xml").includes(`<loc>${origin}/portfolio/page/2</loc>`), "the sitemap does not list page 2");
      eq(r.projects.length, 20, "detail pages");
    });
    await check("X6 nothing published: the homepage keeps its hero and band and drops both portfolio sections; no tile, no card, no link into /portfolio/…", () => {
      const r = ok(t.render(t.input({ portfolio: { categories: t.categories, projects: [], assets: [] } })));
      const main = home(r);
      eq([main.includes('data-section="home.hero"'), main.includes('data-section="home.band"'), main.includes('data-section="home.gallery"'), main.includes('data-section="home.portfolio"')], [true, true, false, false], "home sections");
      assert(!/href="\/portfolio[/?]/.test(main), "the empty homepage links into the portfolio");
      const list = t.mainOf(t.body(r, "/portfolio"));
      assert(list.includes("data-list-empty") && !list.includes("data-lnb-item") && !list.includes("data-project-card"), "/portfolio is not the empty list (the empty line, no tab, no card)");
    });
  },
};

// ─────────────────────────────────────────────────────────────────────────── interior-01 / Demo 01 ──
/** the count line of the list: the number of records the current filter leaves */
const i1ResultCount = async (page: Page) => Number(await page.locator("[data-result-count]").first().getAttribute("data-result-count"));

/**
 * interior-01 · Demo 01. What only this Template has — the home rules (two manual showcases, the
 * intro's anchor link, a hero call to action that names a record), before / after photos, 31 records →
 * page 2, the empty state — is proven in portfolio-runtime-interior-01.test.ts; this entry holds the
 * site to the proof every incrementally published site passes.
 */
const interior01Demo01: RuntimeProofCase = {
  site: "boost-interior-demo",
  label: "interior-01 · Demo 01",
  /** release interior-01 1.6.3, all 8 records built in — packageHash 3d250199…, the package live before the site became a shell */
  reference: { commit: "b2a29d2", buildInputId: "8a0c21182f47bd45bc26f087da4538fe101d8411445de2fe2e7a71ad41effd60", what: "the last ordinary package (interior-01 1.6.3, packageHash 3d250199…)" },
  dataset: { records: 8, categories: 4 },
  shellSlots: {
    "index.html": ["home.hero", "home.intro", "home.projects-a", "home.projects-b"],
    "portfolio.html": ["portfolio.index"],
    "portfolio/page/_shell.html": ["portfolio.index"],
    "portfolio/_shell.html": ["portfolio.detail"],
  },
  shellRoles: { home: "index.html", list: "portfolio.html", listPages: "portfolio/page/_shell.html", detail: "portfolio/_shell.html" },
  generatedIds: /rs-[a-z0-9-]+?-browser(?![a-z])/g,
  differences: [BOUNDARY_MARKERS, GENERATED_IDS, PRELOAD_ORDER],
  // the order differs on one page of ten (/portfolio)
  imagePreloads: "same-set",
  minHeadTags: 17,
  /** the detail page shows the gallery, not the cover: the new image is also the first photo of the 9th record's first gallery group */
  ninthRecord: (record, newAssetId) => {
    const galleryGroups = structuredClone(record.galleryGroups) as { items: { image: { asset: string } }[] }[];
    galleryGroups[0]!.items[0]!.image.asset = newAssetId;
    return { ...record, galleryGroups };
  },
  browser: {
    listReady: async (page) => {
      // the filter island is hydrated: React has attached to the count line it owns
      await page.waitForFunction(() => {
        const el = document.querySelector("[data-result-count]");
        return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
      }, undefined, { timeout: 10_000 });
    },
    cards: '[data-section="portfolio.index"] [data-project-card]',
    homeProjectLink: '[data-section="home.projects-a"] a[href^="/portfolio/"]',
    listCardLink: '[data-section="portfolio.index"] [data-project-card] a[href^="/portfolio/"]',
    // <main> opens with the hero, a running slider; the first showcase is a runtime slot whose section opens with static markup
    hydrationProbe: '[data-section="home.projects-a"]',
    applyFilter: async (page) => {
      // a real click on a visible control: the chips are open on desktop, behind the filter button on mobile
      const options = page.locator("[data-filter-group] label.i1-chip");
      if (!(await options.first().isVisible())) await page.locator(".i1-pfilter__toggle").click();
      const total = await i1ResultCount(page);
      // the first option that narrows the list (fewer cards, not none)
      for (let i = 0; i < (await options.count()); i++) {
        await options.nth(i).click();
        await page.waitForFunction(() => location.search.length > 1);
        const left = await i1ResultCount(page);
        if (left > 0 && left < total) return;
        await options.nth(i).click();
        await page.waitForFunction(() => location.search === "");
      }
      throw new Error(`no filter option narrowed the list of ${total}`);
    },
    detailGallery: async (page) => {
      const zoom = page.locator("[data-gallery-panel]:not([hidden]) [data-gallery-zoom]").first();
      await zoom.scrollIntoViewIfNeeded();
      await zoom.click();
      const viewer = page.locator("dialog[data-gallery-viewer]");
      await viewer.waitFor({ state: "visible", timeout: 5000 });
      if (!(await viewer.evaluate((d) => (d as HTMLDialogElement).open))) throw new Error("the dialog is not open");
      await page.locator("[data-viewer-img]").waitFor({ state: "visible" });
      if (!(await page.locator("[data-viewer-img]").evaluate((i) => (i as HTMLImageElement).decode().then(() => (i as HTMLImageElement).naturalWidth > 0)))) throw new Error("the viewer image did not load");
      await page.locator("[data-viewer-close]").click();
      await page.waitForFunction(() => !document.querySelector("dialog[data-gallery-viewer]") || !(document.querySelector("dialog[data-gallery-viewer]") as HTMLDialogElement).open);
    },
  },
};

export const RUNTIME_PROOF_CASES: readonly RuntimeProofCase[] = [interior02Demo02, interior03Demo03, interior01Demo01];
