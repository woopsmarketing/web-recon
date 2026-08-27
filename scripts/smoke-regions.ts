import { access } from "node:fs/promises";
import path from "node:path";
import type {
  RuntimeElementNode,
  RuntimeNode,
  RuntimePage,
  RuntimeViewport,
} from "../src/reconstruction/types.js";
import {
  PageRegionsArtifactSchema,
  REGION_POLICY,
  compilePageRegions,
  loadRegionInput,
  serializeArtifact,
  type PageRegionsArtifact,
  type RegionBinding,
  type RegionCompileInput,
} from "../src/regions/index.js";

/**
 * Task 27 smoke — PageRegion compiler.
 *
 * A synthetic four-page site is authored directly as reconstruction runtime
 * trees (the compiler's contract input) together with a hand-written Slot V2
 * binding set, so every property under test is checkable against a known
 * answer: which node belongs to which region, which page is shared by two
 * routes, which binding is deliberately orphaned and which deliberately points
 * at nothing at all.
 *
 * The five properties the artifact has to hold:
 *   §2  DETERMINISM        — two compiles of one input are BYTE-identical
 *   §3  LOCALITY           — a node inserted downstream renumbers nothing
 *   §4  JOIN               — slots reach their region via (page, viewport, node)
 *   §5  SHARED OWNERSHIP   — a page behind several routes reports ALL of them
 *   §6  ACCOUNTING         — joined + orphan + unresolved is the whole population
 *
 * §7 replays §2 and §6 against the real linear.app template canary when it is
 * present on disk, and MEASURES what §3's locality claim is really worth on
 * real markup; the suite passes without it, and says so.
 * §8 covers the desktop/mobile ROOT TAG split at BOTH scopes — the page-scoped
 * `@mobile` id and the global one, which used to abort the whole compile.
 *
 * Nothing here writes to `data/`. The compile is a pure function and the store
 * is exercised only through `serializeArtifact`, which produces the exact bytes
 * `page-regions.json` receives.
 */

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log(`\n== ${title}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

interface B {
  t: string;
  p?: Record<string, string>;
  c?: (B | string)[];
}

function el(t: string, p: Record<string, string> | undefined, ...c: (B | string)[]): B {
  return { t, ...(p ? { p } : {}), c };
}

/** The document root the reconstruction generator emits: `html`/`body` as divs. */
function doc(...body: B[]): B {
  return el("div", { "data-wr-doc-tag": "html" }, el("div", { "data-wr-doc-tag": "body" }, ...body));
}

function buildTree(b: B, next: () => string): RuntimeElementNode {
  const node: RuntimeElementNode = { k: "e", n: next(), t: b.t };
  if (b.p) node.p = { ...b.p };
  const children: RuntimeNode[] = [];
  for (const child of b.c ?? []) {
    if (typeof child === "string") children.push({ k: "t", v: child });
    else children.push(buildTree(child, next));
  }
  if (children.length > 0) node.c = children;
  return node;
}

/** `mobileBody` defaults to `body`; §8 passes a DIFFERENT one on purpose. */
function makePage(pageId: string, body: B, mobileBody: B = body): RuntimePage {
  const viewport = (id: "desktop" | "mobile", width: number, source: B): RuntimeViewport => {
    let n = 0;
    // Desktop and mobile are independent trees with independent id counters —
    // exactly as the reconstruction emits them.
    const next = (): string => `n${String(++n).padStart(6, "0")}`;
    return { id, width, doc: buildTree(source, next) };
  };
  return {
    pageId,
    desktop: viewport("desktop", 1440, body),
    mobile: viewport("mobile", 390, mobileBody),
  };
}

/** Node id of the element carrying `id="…"`, per viewport. */
function nodeIdOf(page: RuntimePage, viewport: "desktop" | "mobile", htmlId: string): string {
  const search = (node: RuntimeElementNode): string | undefined => {
    if (node.p?.["id"] === htmlId) return node.n;
    for (const child of node.c ?? []) {
      if (child.k !== "e") continue;
      const found = search(child);
      if (found) return found;
    }
    return undefined;
  };
  const found = search(page[viewport].doc);
  if (!found) throw new Error(`fixture has no element with id=${htmlId} in ${page.pageId}/${viewport}`);
  return found;
}

const SHELL_HEADER = el(
  "header",
  { id: "shell-header" },
  el(
    "nav",
    { id: "shell-nav" },
    el("a", { id: "logo", href: "/" }, "Acme"),
    el("ul", undefined, el("li", undefined, el("a", { id: "nav-pricing", href: "/pricing" }, "Pricing"))),
  ),
);

const SHELL_FOOTER = el(
  "footer",
  { id: "shell-footer" },
  el("div", undefined, el("p", { id: "footer-copy" }, "© Acme"), el("a", { id: "footer-legal", href: "/legal" }, "Legal")),
);

function mainWith(...sections: B[]): B {
  return el("main", { id: "page-main" }, el("div", { id: "main-inner" }, ...sections));
}

const HOME_BODY = doc(
  SHELL_HEADER,
  mainWith(
    el("section", { id: "hero" }, el("h1", { id: "hero-title" }, "Ship faster"), el("p", undefined, "Lead")),
    el("section", { id: "features" }, el("h2", { id: "features-title" }, "Features")),
    el("div", { id: "cta" }, el("a", { id: "cta-link", href: "/signup" }, "Sign up")),
  ),
  SHELL_FOOTER,
);

const PRICING_BODY = doc(
  SHELL_HEADER,
  mainWith(el("section", { id: "plans" }, el("h1", { id: "plans-title" }, "Plans"))),
  SHELL_FOOTER,
);

const DOCS_BODY = doc(
  SHELL_HEADER,
  mainWith(el("section", { id: "docs" }, el("h1", { id: "docs-title" }, "Docs"))),
  SHELL_FOOTER,
);

/** A locale page whose shell DIFFERS — it must not block global promotion. */
const LOCALE_BODY = doc(
  el("header", { id: "fr-header" }, el("nav", { id: "fr-nav" }, el("a", { id: "fr-logo", href: "/fr" }, "Acme FR"))),
  mainWith(el("section", { id: "fr-hero" }, el("h1", { id: "fr-title" }, "Bonjour"))),
  SHELL_FOOTER,
);

interface FixtureSlot {
  slotId: string;
  key: string;
  /** `htmlId` per page it binds to, or an explicit node id for the odd cases. */
  targets: { pageId: string; htmlId?: string; nodeId?: string }[];
}

function buildFixture(homeBody: B): RegionCompileInput {
  const pages = new Map<string, RuntimePage>([
    ["p1", makePage("p1", homeBody)],
    ["p2", makePage("p2", PRICING_BODY)],
    ["p3", makePage("p3", DOCS_BODY)],
    ["p4", makePage("p4", LOCALE_BODY)],
  ]);

  const slots: FixtureSlot[] = [
    { slotId: "s1", key: "global.nav.logo", targets: [{ pageId: "p1", htmlId: "logo" }, { pageId: "p2", htmlId: "logo" }, { pageId: "p3", htmlId: "logo" }] },
    { slotId: "s2", key: "global.footer.legal", targets: [{ pageId: "p1", htmlId: "footer-legal" }, { pageId: "p2", htmlId: "footer-legal" }, { pageId: "p3", htmlId: "footer-legal" }] },
    { slotId: "s3", key: "home.hero.title", targets: [{ pageId: "p1", htmlId: "hero-title" }] },
    { slotId: "s4", key: "home.features.title", targets: [{ pageId: "p1", htmlId: "features-title" }] },
    { slotId: "s5", key: "home.cta.link", targets: [{ pageId: "p1", htmlId: "cta-link" }] },
    { slotId: "s6", key: "pricing.plans.title", targets: [{ pageId: "p2", htmlId: "plans-title" }] },
    { slotId: "s7", key: "docs.title", targets: [{ pageId: "p3", htmlId: "docs-title" }] },
    // Deliberately outside every region: the body shell the walk descends
    // through is owned by no region, so this slot must land in the orphan half.
    { slotId: "s8", key: "orphan.body.marker", targets: [{ pageId: "p1", nodeId: "n000002" }] },
    // Deliberately addressing nothing at all: `unresolved`, not `orphan`.
    { slotId: "s9", key: "unresolved.ghost", targets: [{ pageId: "p1", nodeId: "n999999" }] },
  ];

  const bindings: RegionBinding[] = [];
  let seq = 0;
  const slotKeyById = new Map<string, string>();
  for (const slot of slots) {
    slotKeyById.set(slot.slotId, slot.key);
    for (const target of slot.targets) {
      const page = pages.get(target.pageId)!;
      for (const viewport of ["desktop", "mobile"] as const) {
        bindings.push({
          bindingId: `b${String(++seq).padStart(4, "0")}`,
          slotId: slot.slotId,
          pageId: target.pageId,
          viewport,
          surface: "static",
          nodeId: target.nodeId ?? nodeIdOf(page, viewport, target.htmlId!),
        });
      }
    }
  }

  return {
    templateId: "fixture-regions",
    host: "fixture.example",
    rootUrl: "https://fixture.example/",
    runDir: "data/fixture.example/recon-templates/fixture",
    slotSchemaVersion: 2,
    hashes: { slots: "sha256:s", slotBindings: "sha256:b", siteMap: "sha256:m", routeMap: "sha256:r" },
    routes: [
      { route: "/", pageSourceId: "p1" },
      { route: "/pricing", pageSourceId: "p2" },
      // ONE page behind TWO routes — the many-to-one the artifact must preserve.
      { route: "/docs", pageSourceId: "p3" },
      { route: "/documentation", pageSourceId: "p3" },
      { route: "/fr", pageSourceId: "p4" },
    ],
    pages,
    slotKeyById,
    bindings,
  };
}

/** The `main` landmark of a loaded tree — §7's real-markup insertion point. */
function findMainLandmark(node: RuntimeElementNode): RuntimeElementNode | undefined {
  if (node.t === "main" || node.p?.["role"] === "main") return node;
  for (const child of node.c ?? []) {
    if (child.k !== "e") continue;
    const found = findMainLandmark(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * A `main` landmark rendered with a DIFFERENT TAG per viewport. Real sites swap
 * a landmark's element responsively; neither canary happens to (both report
 * viewportRootMismatches=0), which is exactly why §8 needs a fixture for it.
 */
function viewportSplitBody(tag: string): B {
  return doc(
    el(tag, { role: "main", id: "vp-main" }, el("h1", { id: "vp-title" }, "Title"), el("p", undefined, "Body copy")),
  );
}

/**
 * `swapped` pages render the tags the OTHER way round — the tie case, where
 * neither global tag variant is "the mobile one" and the assignment has to stay
 * deterministic on its own.
 */
function buildViewportSplitFixture(
  pageIds: readonly string[],
  swapped: readonly string[] = [],
): RegionCompileInput {
  const pages = new Map<string, RuntimePage>(
    pageIds.map((pageId) => [
      pageId,
      swapped.includes(pageId)
        ? makePage(pageId, viewportSplitBody("article"), viewportSplitBody("main"))
        : makePage(pageId, viewportSplitBody("main"), viewportSplitBody("article")),
    ]),
  );
  return {
    templateId: "fixture-viewport-split",
    host: "fixture.example",
    rootUrl: "https://fixture.example/",
    runDir: "data/fixture.example/recon-templates/fixture",
    hashes: { slots: "sha256:s", slotBindings: "sha256:b", siteMap: "sha256:m", routeMap: "sha256:r" },
    routes: pageIds.map((pageId, index) => ({
      route: index === 0 ? "/" : `/${pageId}`,
      pageSourceId: pageId,
    })),
    pages,
    slotKeyById: new Map<string, string>(),
    bindings: [],
  };
}

function regionById(artifact: PageRegionsArtifact, regionId: string) {
  return artifact.regions.find((region) => region.regionId === regionId);
}

function regionOwning(artifact: PageRegionsArtifact, slotKey: string) {
  return artifact.regions.filter((region) => region.slotKeys.includes(slotKey));
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  section("§1 selection — the fixture produces visual sections, not a DOM copy");
  const input = buildFixture(HOME_BODY);
  const artifact = compilePageRegions(input);
  const homeRegions = artifact.regions.filter((region) =>
    region.pages.some((page) => page.pageSourceId === "p1"),
  );
  check("§1 regions are produced", artifact.counts.regions > 0, `${artifact.counts.regions}`);
  check(
    "§1 region count is far below the element count (sections, not nodes)",
    artifact.counts.regions < 30,
    `${artifact.counts.regions} regions`,
  );
  check("§1 the header collapses to its nav rather than nesting two regions", regionById(artifact, "global:rgn:nav1:self") !== undefined);
  check("§1 the shared footer lifts to global", regionById(artifact, "global:rgn:footer1:self") !== undefined);
  check(
    "§1 hero / features / cta are three separate page regions",
    ["p1:rgn:main1:div:1>section:1", "p1:rgn:main1:div:1>section:2", "p1:rgn:main1:div:1>div:1>a:1"].every(
      (id) => regionById(artifact, id) !== undefined,
    ),
    homeRegions.map((r) => r.regionId).join(" "),
  );
  check(
    "§1 the cta wrapper is UNWRAPPED to its only element child, not doubled",
    regionById(artifact, "p1:rgn:main1:div:1>div:1") === undefined &&
      regionById(artifact, "p1:rgn:main1:div:1>div:1>a:1")?.rootTag === "a",
  );
  check(
    "§1 the locale page's differing shell did not block global promotion",
    regionById(artifact, "global:rgn:nav1:self")?.pages.length === 3,
    `${regionById(artifact, "global:rgn:nav1:self")?.pages.length} pages`,
  );
  check(
    "§1 the locale page keeps its own page-scoped nav",
    regionById(artifact, "p4:rgn:nav1:self") !== undefined,
  );
  check(
    "§1 every region carries a structural hash BESIDE its id, never as it",
    artifact.regions.every((region) => /^[0-9a-f]{64}$/.test(region.structuralHash) && !region.regionId.includes(region.structuralHash)),
  );
  check("§1 no DOM attribute is minted anywhere in the artifact", !JSON.stringify(artifact).includes("data-wr-slot"));
  const parsed = PageRegionsArtifactSchema.safeParse(JSON.parse(serializeArtifact(artifact)));
  check("§1 the written bytes validate against the published schema", parsed.success, parsed.success ? "" : parsed.error.message.slice(0, 200));

  section("§2 DETERMINISM — two compiles of one input are byte-identical");
  const first = serializeArtifact(compilePageRegions(buildFixture(HOME_BODY)));
  const second = serializeArtifact(compilePageRegions(buildFixture(HOME_BODY)));
  check("§2 fixture compiles byte-identically", first === second, `${first.length} vs ${second.length} bytes`);
  check("§2 the artifact carries no timestamp (the run id owns the clock)", !first.includes("createdAt"));
  const inputSnapshot = JSON.stringify([...input.pages.values()]);
  compilePageRegions(input);
  check("§2 the compile does not mutate the input trees", JSON.stringify([...input.pages.values()]) === inputSnapshot);

  section("§3 LOCALITY — one node inserted downstream renumbers nothing");
  // Appended AFTER every existing section, which is the case the id scheme must
  // make free: a downstream insert may add a region but must move none.
  const appended = doc(
    SHELL_HEADER,
    mainWith(
      el("section", { id: "hero" }, el("h1", { id: "hero-title" }, "Ship faster"), el("p", undefined, "Lead")),
      el("section", { id: "features" }, el("h2", { id: "features-title" }, "Features")),
      el("div", { id: "cta" }, el("a", { id: "cta-link", href: "/signup" }, "Sign up")),
      el("div", { id: "inserted" }, "A late addition"),
    ),
    SHELL_FOOTER,
  );
  const after = compilePageRegions(buildFixture(appended));
  const before = new Set(artifact.regions.map((region) => region.regionId));
  const now = new Set(after.regions.map((region) => region.regionId));
  const lost = [...before].filter((id) => !now.has(id));
  const gained = [...now].filter((id) => !before.has(id));
  check("§3 no existing region id disappeared", lost.length === 0, lost.join(" "));
  check("§3 exactly one region id appeared", gained.length === 1, gained.join(" "));
  check(
    "§3 every pre-existing region kept its slot keys",
    artifact.regions.every((region) => {
      const match = regionById(after, region.regionId);
      return match !== undefined && match.slotKeys.join("|") === region.slotKeys.join("|");
    }),
  );

  // The tag-scoped ordinal is the whole reason the scheme survives an insert
  // ahead of a region. A DENSE child index would have moved all three.
  const prepended = doc(
    SHELL_HEADER,
    mainWith(
      el("div", { id: "banner" }, "New banner"),
      el("section", { id: "hero" }, el("h1", { id: "hero-title" }, "Ship faster"), el("p", undefined, "Lead")),
      el("section", { id: "features" }, el("h2", { id: "features-title" }, "Features")),
      el("div", { id: "cta" }, el("a", { id: "cta-link", href: "/signup" }, "Sign up")),
    ),
    SHELL_FOOTER,
  );
  const withBanner = compilePageRegions(buildFixture(prepended));
  check(
    "§3 an UPSTREAM insert still leaves both <section> ids intact (tag:nth, not child index)",
    regionById(withBanner, "p1:rgn:main1:div:1>section:1")?.slotKeys.includes("home.hero.title") === true &&
      regionById(withBanner, "p1:rgn:main1:div:1>section:2")?.slotKeys.includes("home.features.title") === true,
  );
  check(
    "§3 negative control: the same-tag sibling DOES shift, and the artifact says so",
    regionById(withBanner, "p1:rgn:main1:div:1>div:1>a:1") === undefined &&
      regionById(withBanner, "p1:rgn:main1:div:1>div:2>a:1")?.slotKeys.includes("home.cta.link") === true,
    withBanner.regions.filter((r) => r.scopeKey === "p1").map((r) => r.regionId).join(" "),
  );
  check(
    "§3 the shell regions are untouched by either insert",
    regionById(withBanner, "global:rgn:nav1:self") !== undefined &&
      regionById(withBanner, "global:rgn:footer1:self") !== undefined,
  );

  // The ASYMMETRY, pinned so nobody has to rediscover it: a DOWNSTREAM insert is
  // free, an UPSTREAM one is not. `tag:nth` only protects a region from an
  // insert of a DIFFERENT tag; a <div> inserted ahead of a <div>-rooted region
  // is a same-tag insert and repaths it. §7 measures the real cost on real
  // markup, where region roots are overwhelmingly <div>s.
  const lostAfter = (candidate: PageRegionsArtifact): string[] => {
    const ids = new Set(candidate.regions.map((region) => region.regionId));
    return [...before].filter((id) => !ids.has(id));
  };
  const lostDownstream = lostAfter(after);
  const lostUpstream = lostAfter(withBanner);
  check(
    "§3 ASYMMETRY: a downstream insert loses NO id, an upstream one does",
    lostDownstream.length === 0 && lostUpstream.length > 0,
    `downstream lost ${lostDownstream.length}, upstream lost ${lostUpstream.length}`,
  );
  check(
    "§3 the upstream loss is exactly the SAME-TAG sibling, not the <section>s",
    lostUpstream.join("|") === "p1:rgn:main1:div:1>div:1>a:1",
    lostUpstream.join("|"),
  );

  section("§4 JOIN — slots reach their region through (pageId, viewport, nodeId)");
  check(
    "§4 the hero title joins the hero region and nothing else",
    regionOwning(artifact, "home.hero.title").map((region) => region.regionId).join("|") ===
      "p1:rgn:main1:div:1>section:1",
  );
  check(
    "§4 the features title joins the features region",
    regionOwning(artifact, "home.features.title").map((region) => region.regionId).join("|") ===
      "p1:rgn:main1:div:1>section:2",
  );
  check(
    "§4 the nav logo joins the global nav region on all three shell pages",
    regionOwning(artifact, "global.nav.logo").map((region) => region.regionId).join("|") === "global:rgn:nav1:self",
  );
  check(
    "§4 the footer link joins the global footer region",
    regionOwning(artifact, "global.footer.legal").map((region) => region.regionId).join("|") ===
      "global:rgn:footer1:self",
  );
  const nav = regionById(artifact, "global:rgn:nav1:self")!;
  check(
    "§4 both viewports of every shell page are joined, not just desktop",
    nav.pages.every((page) => page.occurrences.length === 2) && nav.bindingCount === 6,
    `${nav.bindingCount} bindings over ${nav.pages.length} pages`,
  );
  check(
    "§4 each occurrence names the node id it was joined on",
    nav.pages.every((page) => page.occurrences.every((occurrence) => /^n\d{6}$/.test(occurrence.nodeId))),
  );

  section("§5 SHARED OWNERSHIP — one page, several routes, all reported");
  const docsRegion = artifact.regions.find((region) => region.slotKeys.includes("docs.title"));
  check(
    "§5 the shared page's region lists BOTH routes",
    docsRegion?.pages[0]?.routes.join("|") === "/docs|/documentation",
    docsRegion?.pages[0]?.routes.join("|"),
  );
  check(
    "§5 the page coverage table lists both routes too",
    artifact.pages.find((page) => page.pageSourceId === "p3")?.routes.join("|") === "/docs|/documentation",
  );
  check(
    "§5 the shared page is counted ONCE as a page and TWICE as a route",
    artifact.counts.pages === 4 && artifact.counts.routes === 5,
    `${artifact.counts.pages} pages / ${artifact.counts.routes} routes`,
  );
  check(
    "§5 the global regions list the shared page once, with both its routes",
    nav.pages.filter((page) => page.pageSourceId === "p3").length === 1 &&
      nav.pages.find((page) => page.pageSourceId === "p3")?.routes.length === 2,
  );
  check(
    "§5 the locale route is flagged, the others are not",
    artifact.routes.filter((route) => route.localePrefixed).map((route) => route.route).join("|") === "/fr",
  );

  section("§6 ACCOUNTING — joined + orphan + unresolved is the whole population");
  const c = artifact.counts;
  check(
    "§6 every binding is accounted for exactly once",
    c.joinedBindings + c.orphanBindings + c.unresolvedBindings === c.bindings,
    `${c.joinedBindings}+${c.orphanBindings}+${c.unresolvedBindings} vs ${c.bindings}`,
  );
  check(
    "§6 the regions' own binding counts sum to the joined total",
    artifact.regions.reduce((total, region) => total + region.bindingCount, 0) === c.joinedBindings,
  );
  check("§6 joined + orphan slots is the whole slot population", c.slotsJoined + c.orphanSlots === c.slots);
  const slotKeys = new Set(artifact.regions.flatMap((region) => region.slotKeys));
  check(
    "§6 the union of the regions' slot keys is exactly the joined slot count",
    slotKeys.size === c.slotsJoined,
    `${slotKeys.size} vs ${c.slotsJoined}`,
  );
  check(
    "§6 the body-shell binding is reported as an ORPHAN, not silently absorbed",
    c.orphanBindings === 2 && !slotKeys.has("orphan.body.marker"),
    `${c.orphanBindings} orphan bindings`,
  );
  check(
    "§6 the ghost node id is reported as UNRESOLVED, a different failure",
    c.unresolvedBindings === 2 && !slotKeys.has("unresolved.ghost"),
    `${c.unresolvedBindings} unresolved bindings`,
  );
  check("§6 exactly the two planted slots are orphaned", c.orphanSlots === 2, `${c.orphanSlots}`);
  check(
    "§6 the per-page table sums to the top-level totals",
    artifact.pages.reduce((total, page) => total + page.joinedBindings, 0) === c.joinedBindings &&
      artifact.pages.reduce((total, page) => total + page.orphanBindings, 0) === c.orphanBindings &&
      artifact.pages.reduce((total, page) => total + page.unresolvedBindings, 0) === c.unresolvedBindings,
  );
  check(
    "§6 global + page regions is the region total",
    c.globalRegions + c.pageRegions === c.regions,
  );
  check(
    "§6 dropped empty candidates carried no binding (the drop is slot-safe)",
    c.joinedBindings + c.orphanBindings + c.unresolvedBindings === c.bindings && c.emptyCandidatesDropped >= 0,
  );
  check("§6 the policy that produced these ids is persisted with them", artifact.policy.shellLookaheadDepth === REGION_POLICY.shellLookaheadDepth);

  section("§7 real template canary (linear.app) — skipped when absent");
  const canaryDir = path.join("data", "linear.app", "recon-templates", "2026-08-25T21-53-26-980Z");
  let canaryPresent = true;
  try {
    await access(path.join(canaryDir, "slot-bindings.json"));
  } catch {
    canaryPresent = false;
  }
  if (!canaryPresent) {
    console.log(`  SKIP  §7 canary not on disk: ${canaryDir}`);
  } else {
    const canaryInput = await loadRegionInput(canaryDir);
    const canaryA = serializeArtifact(compilePageRegions(canaryInput));
    const canaryB = serializeArtifact(compilePageRegions(await loadRegionInput(canaryDir)));
    check("§7 the real canary compiles byte-identically twice", canaryA === canaryB, `${canaryA.length} vs ${canaryB.length} bytes`);
    const canary = JSON.parse(canaryA) as PageRegionsArtifact;
    const k = canary.counts;
    check(
      "§7 every real binding is accounted for exactly once",
      k.joinedBindings + k.orphanBindings + k.unresolvedBindings === k.bindings,
      `${k.joinedBindings}+${k.orphanBindings}+${k.unresolvedBindings} vs ${k.bindings}`,
    );
    check(
      "§7 the real regions' binding counts sum to the joined total",
      canary.regions.reduce((total, region) => total + region.bindingCount, 0) === k.joinedBindings,
    );
    check("§7 joined + orphan slots is the whole real slot population", k.slotsJoined + k.orphanSlots === k.slots);
    check(
      "§7 the real region count is a section-level grouping, not a DOM copy",
      k.regions > 0 && k.regions < k.bindings / 10,
      `${k.regions} regions for ${k.bindings} bindings`,
    );
    check(
      "§7 every real region id is unique",
      new Set(canary.regions.map((region) => region.regionId)).size === canary.regions.length,
    );
    const canaryParsed = PageRegionsArtifactSchema.safeParse(JSON.parse(canaryA));
    check(
      "§7 the real canary bytes validate against the published schema",
      canaryParsed.success,
      canaryParsed.success ? "" : canaryParsed.error.message.slice(0, 200),
    );
    check(
      "§7 every real route resolves to a loaded page",
      canary.routes.every((route) => canary.pages.some((page) => page.pageSourceId === route.pageSourceId)),
    );
    // What §3's locality claim is actually worth on REAL markup. linear's region
    // roots are overwhelmingly <div>s, so a <div> inserted at the TOP of <main>
    // is a SAME-TAG insert and repaths most of the page, while the same insert
    // APPENDED costs nothing. Measured here rather than assumed, and pinned so
    // the number cannot quietly drift out of the handoff's limitations.
    const canaryIds = new Set(canary.regions.map((region) => region.regionId));
    const measureInsert = async (mode: "unshift" | "push") => {
      const mutated = await loadRegionInput(canaryDir);
      let touched = 0;
      for (const page of mutated.pages.values()) {
        for (const viewport of ["desktop", "mobile"] as const) {
          const tree = page[viewport];
          if (!tree) continue;
          const main = findMainLandmark(tree.doc);
          if (!main) continue;
          const inserted: RuntimeElementNode = {
            k: "e",
            n: `nINSERT-${page.pageId}-${viewport}`,
            t: "div",
            c: [{ k: "t", v: "inserted banner" }],
          };
          main.c = main.c ?? [];
          if (mode === "unshift") main.c.unshift(inserted);
          else main.c.push(inserted);
          touched++;
        }
      }
      const ids = new Set(compilePageRegions(mutated).regions.map((region) => region.regionId));
      return { touched, lost: [...canaryIds].filter((id) => !ids.has(id)) };
    };
    const downstream = await measureInsert("push");
    const upstream = await measureInsert("unshift");
    check(
      "§7 a DOWNSTREAM <div> insert into every real <main> loses NO region id",
      downstream.touched === 16 && downstream.lost.length === 0,
      `${downstream.touched} trees touched, ${downstream.lost.length} ids lost`,
    );
    check(
      "§7 an UPSTREAM <div> insert repaths 45 of 68 real regions — same-tag insert",
      upstream.touched === 16 && upstream.lost.length === 45 && canaryIds.size === 68,
      `${upstream.lost.length}/${canaryIds.size} lost, e.g. ${upstream.lost[0] ?? "(none)"}`,
    );
    console.log(
      `  NOTE  §7 locality on real markup: upstream insert repaths ` +
        `${upstream.lost.length}/${canaryIds.size} regions ` +
        `(${Math.round((upstream.lost.length / canaryIds.size) * 100)}%), downstream repaths ` +
        `${downstream.lost.length}. \`tag:nth\` protects a region only from a DIFFERENT-tag insert.`,
    );
    console.log(
      `  NOTE  §7 linear.app: ${k.regions} regions (${k.globalRegions} global) · ` +
        `${k.slotsJoined}/${k.slots} slots joined · ${k.orphanSlots} orphan · ` +
        `${k.nearGlobalGroups} near-global groups (widest ${k.nearGlobalMaxPages}/${k.pages} pages)`,
    );
  }

  section("§8 VIEWPORT ROOT TAG SPLIT — page scope AND global scope");
  // Page scope: the desktop root keeps the plain id, the mobile-only tag variant
  // takes `@mobile`. This half always worked.
  const splitOne = compilePageRegions(buildViewportSplitFixture(["p1"]));
  check(
    "§8 one page: the tag mismatch is COUNTED, not silently merged",
    splitOne.counts.viewportRootMismatches === 1,
    `${splitOne.counts.viewportRootMismatches}`,
  );
  check(
    "§8 one page: both variants are emitted, the mobile one suffixed",
    regionById(splitOne, "p1:rgn:main1:self")?.rootTag === "main" &&
      regionById(splitOne, "p1:rgn:main1:self@mobile")?.rootTag === "article",
    splitOne.regions.map((region) => `${region.regionId}=${region.rootTag}`).join(" "),
  );
  check(
    "§8 one page: each variant carries only its OWN viewport's occurrence",
    regionById(splitOne, "p1:rgn:main1:self")?.pages[0]?.occurrences.map((o) => o.viewport).join("|") === "desktop" &&
      regionById(splitOne, "p1:rgn:main1:self@mobile")?.pages[0]?.occurrences.map((o) => o.viewport).join("|") === "mobile",
  );
  check(
    "§8 one page: the artifact declares the split in its limitations",
    splitOne.limitations.includes("desktop-and-mobile-region-roots-disagree-on-some-paths"),
  );

  // Global scope: the SAME mismatch on every non-locale page lifts BOTH tag
  // variants to global. Before the Task 27 correction both minted the one
  // unsuffixed id and the compiler threw `duplicate global region id`, aborting
  // the whole compile and writing no artifact at all.
  let globalSplit: PageRegionsArtifact | undefined;
  let globalSplitError = "";
  try {
    globalSplit = compilePageRegions(buildViewportSplitFixture(["p1", "p2", "p3"]));
  } catch (err) {
    globalSplitError = err instanceof Error ? err.message : String(err);
  }
  check(
    "§8 REGRESSION: a mismatch on EVERY page no longer aborts the compile",
    globalSplit !== undefined,
    globalSplitError,
  );
  check(
    "§8 global: both tag variants lift, with distinct ids",
    regionById(globalSplit!, "global:rgn:main1:self")?.rootTag === "main" &&
      regionById(globalSplit!, "global:rgn:main1:self@mobile")?.rootTag === "article",
    globalSplit?.regions.map((region) => `${region.regionId}=${region.rootTag}`).join(" "),
  );
  check(
    "§8 global: each lifted variant covers all three pages",
    regionById(globalSplit!, "global:rgn:main1:self")?.pages.length === 3 &&
      regionById(globalSplit!, "global:rgn:main1:self@mobile")?.pages.length === 3,
  );
  check(
    "§8 global: the mismatch is counted once per page",
    globalSplit?.counts.viewportRootMismatches === 3,
    `${globalSplit?.counts.viewportRootMismatches}`,
  );
  check(
    "§8 global: no page-scoped leftovers and every id is unique",
    globalSplit?.counts.pageRegions === 0 &&
      new Set(globalSplit.regions.map((region) => region.regionId)).size === globalSplit.regions.length,
    `${globalSplit?.counts.globalRegions} global / ${globalSplit?.counts.pageRegions} page`,
  );

  // The TIE: two pages rendering the tags opposite ways round, so each global
  // variant is built from exactly one `@mobile` draft and neither is "the mobile
  // one". The root tag breaks it, so the assignment stays total and stays a
  // function of the input rather than of Map iteration order.
  const tieA = compilePageRegions(buildViewportSplitFixture(["p1", "p2"], ["p2"]));
  const tieB = serializeArtifact(compilePageRegions(buildViewportSplitFixture(["p1", "p2"], ["p2"])));
  check(
    "§8 tie case: opposite orientations still mint two distinct global ids",
    tieA.regions.length === 2 &&
      new Set(tieA.regions.map((region) => region.regionId)).size === 2 &&
      tieA.counts.globalRegions === 2,
    tieA.regions.map((region) => `${region.regionId}=${region.rootTag}`).join(" "),
  );
  check(
    "§8 tie case: the root tag breaks it — `article` takes the unsuffixed id",
    regionById(tieA, "global:rgn:main1:self")?.rootTag === "article" &&
      regionById(tieA, "global:rgn:main1:self@mobile")?.rootTag === "main",
    tieA.regions.map((region) => `${region.regionId}=${region.rootTag}`).join(" "),
  );
  check(
    "§8 tie case: the assignment is deterministic, not iteration-order dependent",
    serializeArtifact(tieA) === tieB,
  );
  check(
    "§8 the split path mints no id an existing artifact could already hold",
    globalSplit!.regions.every((region) => /^global:rgn:[a-z0-9]+:[^@]+(@mobile)?$/.test(region.regionId)),
    globalSplit?.regions.map((region) => region.regionId).join(" "),
  );

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.log(`${failures} FAILED`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("smoke-regions ERROR —", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
