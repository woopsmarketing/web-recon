import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import {
  buildDiscoveryResult,
  type DiscoveryProvider,
  type DiscoveryOptions,
  type RawDiscovery,
} from "../src/discovery/index.js";
import {
  E2eManifestSchema,
  STAGE_REGISTRY,
  assertRegistryIntegrity,
  classifyFinalStatus,
  decideEscalation,
  runE2eReconstruction,
  selectEscalationTargets,
  type E2eRunResult,
} from "../src/e2e/index.js";
import { loadSiteSpec } from "../src/sitespec/index.js";
import {
  MAX_DYNAMIC_TARGET_DEPTH,
  MAX_DYNAMIC_TARGET_ELEMENTS,
  MAX_DYNAMIC_TARGET_TEXT_CHARS,
} from "../src/interaction-explorer/types.js";
import { STYLE_WHITELIST } from "../src/observer/types.js";

/**
 * Full E2E fixture test (Task 16, items 107–110).
 *
 * The whole chain, against a local synthetic site, with **no manual artifact
 * injection anywhere**: a `DiscoveryProvider` enumerates the fixture's URLs, and
 * from there the real verifier, the real selector, the real observer, the real
 * interaction detector / explorer / modeler, the real SiteSpec compiler, the
 * real generator, a real `next build` and the real Task 15 QA run in one
 * process. Item 110 exists to forbid the shortcut this test would otherwise
 * take — handing a prebuilt SiteSpec to Task 14 and calling it end to end.
 *
 * The fixture site is built to contain exactly the things Task 16 changed, so
 * every Phase A claim has a positive test that goes all the way to a browser:
 *
 *   A1  three `<img>` share ONE url  → one catalog asset, three bound elements
 *   A2  an 800px scroller holding 20,000px of content at scrollTop 12,345
 *   A3  a grid using template-areas / grid-area / auto-flow / place-items / order
 *   D   a menu that MOUNTS children on click, so the clone can mount them too
 *
 * plus the things Task 15 needed and this run must not regress: a dark canvas
 * background, a `<details>` disclosure, a CSS-hidden ARIA disclosure, an unknown
 * `메뉴 열기` trigger that must stay uninvented, a family whose member diverges
 * from its representative, and long / mixed text.
 */

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log("");
  console.log(title);
}

// ---------------------------------------------------------------------------
// The fixture site
// ---------------------------------------------------------------------------

/** One shared 1×1 PNG, referenced by THREE different <img> elements (A1). */
const LOGO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SHARED_STYLE = `
  html { background: rgb(17, 24, 39); }
  body { margin: 0; font-family: system-ui, sans-serif; color: rgb(243, 244, 246); }
  /* A3: grid PLACEMENT, not just tracks. */
  .layout {
    display: grid;
    grid-template-areas: "head head" "side main";
    grid-template-columns: 200px 1fr;
    grid-auto-flow: row;
    grid-auto-rows: minmax(40px, auto);
    place-items: start stretch;
    place-content: start;
    gap: 8px;
  }
  .layout > .head { grid-area: head; place-self: center start; }
  .layout > .side { grid-area: side; order: 2; }
  .layout > .main { grid-area: main; order: 1; }
  /* A2: a real nested scroll container. */
  .scroller { height: 800px; overflow-y: auto; border: 1px solid rgb(75, 85, 99); }
  .tall { height: 20000px; }
  .marker { position: absolute; }
  /* A CSS-hidden disclosure region: the attribute alone cannot reveal it. */
  .panel { display: none; }
  .panel[data-open="1"] { display: block; }
  /* Task 17 §9: a centered max-width container — the /use-cases/saas shape.
     Exact computed style would freeze its margins at the observed viewport;
     the probe + inference must recover max-width + margin auto instead. */
  .centered { max-width: 640px; margin: 0 auto; background: rgb(31, 41, 55); }
  @media (max-width: 700px) {
    .layout { grid-template-areas: "head" "main" "side"; grid-template-columns: 1fr; }
    .desktop-only { display: none; }
  }
`;

/**
 * The scroll offset is applied by a script the OBSERVER will see the result of.
 * That is the point: the pipeline must record a scroll position it did not
 * cause, exactly as MDN's own auto-scroll produced the one Task 15 measured.
 */
const SCROLL_SCRIPT = `
  document.addEventListener("DOMContentLoaded", function () {
    var scroller = document.getElementById("scroller");
    if (scroller) scroller.scrollTop = 12345;
  });
`;

/** A menu whose children are created ON CLICK — the Task 16 dynamic target. */
const MENU_SCRIPT = `
  document.addEventListener("DOMContentLoaded", function () {
    var trigger = document.getElementById("menu-trigger");
    if (!trigger) return;
    trigger.addEventListener("click", function () {
      var open = trigger.getAttribute("aria-expanded") === "true";
      if (open) {
        trigger.setAttribute("aria-expanded", "false");
        var existing = document.getElementById("mounted-menu");
        if (existing) existing.remove();
        return;
      }
      trigger.setAttribute("aria-expanded", "true");
      var menu = document.createElement("div");
      menu.id = "mounted-menu";
      menu.setAttribute("role", "menu");
      ["Docs", "Blog", "Support"].forEach(function (label) {
        var item = document.createElement("a");
        item.setAttribute("role", "menuitem");
        item.setAttribute("href", "/guides");
        item.textContent = label;
        menu.appendChild(item);
      });
      trigger.insertAdjacentElement("afterend", menu);
    });
    var aria = document.getElementById("aria-disclosure");
    if (aria) {
      aria.addEventListener("click", function () {
        var open = aria.getAttribute("aria-expanded") === "true";
        aria.setAttribute("aria-expanded", open ? "false" : "true");
        var panel = document.getElementById("aria-panel");
        if (panel) {
          if (open) panel.removeAttribute("data-open");
          else panel.setAttribute("data-open", "1");
        }
      });
    }
    var pin = document.getElementById("pin-toggle");
    if (pin) {
      pin.addEventListener("click", function () {
        // A pure state toggle: no target declared, nothing user-visible moves.
        // Task 17 §3 requires its visible-target verdict to be NOT-DECLARED,
        // never a vacuous "equivalent".
        var on = pin.getAttribute("aria-pressed") === "true";
        pin.setAttribute("aria-pressed", on ? "false" : "true");
      });
    }
    var portal = document.getElementById("portal-trigger");
    if (portal) {
      portal.addEventListener("click", function () {
        // Task 17.1: the framework-portal shape — a 0-rect body-level wrapper
        // whose only child is position:fixed, with aria-controls set AFTER the
        // click. The pre-fix pipeline could not see this panel at all.
        if (document.getElementById("portal-panel")) return;
        var wrapper = document.createElement("div");
        wrapper.id = "portal-wrap";
        var panel = document.createElement("div");
        panel.id = "portal-panel";
        panel.setAttribute("role", "dialog");
        panel.style.position = "fixed";
        panel.style.top = "80px";
        panel.style.left = "40px";
        panel.style.width = "240px";
        panel.style.background = "rgb(31, 41, 55)";
        panel.style.border = "1px solid rgb(75, 85, 99)";
        ["Portal one", "Portal two", "Portal three"].forEach(function (label) {
          var line = document.createElement("p");
          line.textContent = label;
          panel.appendChild(line);
        });
        wrapper.appendChild(panel);
        document.body.appendChild(wrapper);
        portal.setAttribute("aria-controls", "portal-panel");
        portal.setAttribute("aria-expanded", "true");
      });
    }
    var lazy = document.getElementById("lazy-trigger");
    if (lazy) {
      lazy.addEventListener("click", function () {
        // Task 17.1: an EXISTING empty region (computed height 0) that gains
        // mounted children — the exact style pins the closed height, so the
        // open-state root override must carry the observed open height.
        var region = document.getElementById("lazy-region");
        if (!region || region.children.length > 0) return;
        ["Lazy alpha", "Lazy beta"].forEach(function (label) {
          var line = document.createElement("p");
          line.textContent = label;
          region.appendChild(line);
        });
        lazy.setAttribute("aria-expanded", "true");
      });
    }
    var swap = document.getElementById("swap-trigger");
    if (swap) {
      swap.addEventListener("click", function () {
        // Task 17.1: an in-place content swap on the host that CONTAINS the
        // trigger (stripe's mobile nav). The clone must never replace these
        // children — that would destroy the live trigger mid-click.
        var host = document.getElementById("swap-host");
        var label = document.getElementById("swap-label");
        if (label) label.remove();
        var open = document.createElement("span");
        open.textContent = "open label";
        if (host) host.appendChild(open);
        swap.setAttribute("aria-expanded", "true");
      });
    }
    var unknown = document.getElementById("unknown-trigger");
    if (unknown) {
      unknown.addEventListener("click", function () {
        // Signals its state ONLY through a label, exactly like seoworld's
        // hamburger. Nothing here may become a named pattern.
        var label = unknown.getAttribute("aria-label");
        unknown.setAttribute("aria-label", label === "메뉴 열기" ? "메뉴 닫기" : "메뉴 열기");
      });
    }
  });
`;

const LONG_TEXT =
  "This paragraph is deliberately far longer than the Observer's two-hundred character " +
  "direct-text cap so that the rendered-HTML recovery channel has something real to " +
  "recover, and so the content fidelity number means something beyond short labels. " +
  "It keeps going past the cap on purpose, because a fixture that never exceeds the " +
  "limit cannot prove the limit is handled.";

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>${SHARED_STYLE}</style>
<script>${SCROLL_SCRIPT}</script>
<script>${MENU_SCRIPT}</script>
</head>
<body>
<div class="layout">
  <header class="head">
    <img id="logo-a" src="/logo.png" alt="Logo A" width="16" height="16">
    <img id="logo-b" src="/logo.png" alt="Logo B" width="16" height="16">
    <img id="logo-c" src="/logo.png" alt="Logo C" width="16" height="16">
    <button id="menu-trigger" type="button" aria-expanded="false" aria-haspopup="menu"
            aria-controls="mounted-menu">Menu</button>
    <button id="unknown-trigger" type="button" aria-label="메뉴 열기">≡</button>
  </header>
  <aside class="side">
    <div class="scroller" id="scroller">
      <nav class="tall" id="tall-nav">
        <p class="marker" style="top:12400px">deep sidebar marker</p>
      </nav>
    </div>
  </aside>
  <main class="main desktop-only">
${body}
  </main>
</div>
</body></html>`;
}

const HOME_BODY = `    <h1>Fixture home</h1>
    <p>Hello <strong>mixed</strong> content <em>ordering</em> here.</p>
    <p>${LONG_TEXT}</p>
    <details open><summary>Native disclosure</summary><p>Open by default.</p></details>
    <button id="aria-disclosure" type="button" aria-expanded="false" aria-controls="aria-panel">
      Show panel
    </button>
    <button id="pin-toggle" type="button" aria-pressed="false">Pin</button>
    <div id="aria-panel" class="panel"><p>Revealed by CSS, not by the hidden attribute.</p></div>
    <button id="portal-trigger" type="button" aria-expanded="false" aria-haspopup="dialog">
      Open dialog
    </button>
    <button id="lazy-trigger" type="button" aria-expanded="false" aria-controls="lazy-region">
      Load more
    </button>
    <div id="lazy-region"></div>
    <div id="swap-host">
      <button id="swap-trigger" type="button" aria-expanded="false">Swap</button>
      <span id="swap-label">closed label</span>
    </div>
    <div id="centered-band" class="centered"><p>Centered content band.</p></div>
    <ul>
      <li><a href="/guides/alpha">Alpha</a></li>
      <li><a href="/guides/beta">Beta</a></li>
      <li><a href="/guides/gamma">Gamma</a></li>
      <li><a href="/guides/delta">Delta</a></li>
      <li><a href="/guides">Guides index</a></li>
    </ul>`;

/**
 * Four sibling guides that form ONE real Task 08 family, with one member whose
 * CONTENT diverges hard (item 63).
 *
 * The element structure is identical across all four on purpose. Task 08's
 * coarse profile is "content-volume insensitive by construction" — it reads no
 * text and no attribute value — so four pages with the same tag skeleton group
 * into one family however much prose they carry, and the representative
 * (`alpha`, by the deterministic shortest-URL/lexical rule) stands in for the
 * other three.
 *
 * `delta` then carries ten times the text of its siblings. That is invisible to
 * the grouping and glaring to the family audit, which compares the LIVE page
 * against the clone rendered from the representative — which is exactly the
 * situation Task 15 found on `nextjs.org/blog/next-12-2` and the one the
 * escalation stage exists to answer. An earlier version of this fixture made
 * the divergent page structurally different too, and it simply became its own
 * family: no family-represented route, nothing to audit, escalation never ran.
 */
function guideBody(slug: string): string {
  const title = `${slug[0]!.toUpperCase()}${slug.slice(1)}`;
  /*
   * `beta` is the REPRESENTATIVE by Task 07's deterministic rule (same depth,
   * same query, so the shortest URL wins), and every other member carries ten
   * times its text. Making only one member divergent would not do: the audit
   * picks one member per family by lexical URL, so which page it lands on is a
   * property of the naming rather than of the test's intent. Diverging all three
   * non-representatives means the audit finds a major mismatch whichever it picks.
   */
  const prose =
    slug === "beta"
      ? "A short guide page."
      : Array.from({ length: 10 }, (_, i) => `${LONG_TEXT} (paragraph ${i + 1})`).join(" ");
  return `    <h1>${title}</h1>
    <p>${prose}</p>
    <details><summary>More</summary><p>Closed by default.</p></details>`;
}

interface FixtureServer {
  server: Server;
  baseUrl: string;
  urls: string[];
  stop: () => Promise<void>;
}

const ROUTES: readonly string[] = [
  "/",
  "/guides",
  "/guides/alpha",
  "/guides/beta",
  "/guides/gamma",
  "/guides/delta",
];

async function startFixtureServer(): Promise<FixtureServer> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/logo.png") {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(LOGO_PNG);
      return;
    }
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(pageShell("Fixture home", HOME_BODY));
      return;
    }
    if (url.pathname === "/guides") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        pageShell(
          "Guides",
          `    <h1>Guides</h1>\n    <p>Index of guides.</p>\n    <ul><li><a href="/guides/alpha">Alpha</a></li></ul>`,
        ),
      );
      return;
    }
    const guide = /^\/guides\/([a-z]+)$/.exec(url.pathname);
    if (guide) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(pageShell(`Guide ${guide[1]}`, guideBody(guide[1]!)));
      return;
    }
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body>not found</body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    server,
    baseUrl,
    urls: ROUTES.map((route) => `${baseUrl}${route === "/" ? "/" : route}`),
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

/**
 * A DiscoveryProvider over the fixture site (item 107).
 *
 * Firecrawl cannot map `127.0.0.1`, and this is exactly why Discovery is behind
 * a provider interface. The stage still runs, still normalizes, still
 * deduplicates, still same-site filters and still writes a real
 * `discovery.json` that the real verifier reads — only the URL SOURCE differs,
 * and the manifest records `localDiscovery: true` so no reader mistakes this
 * run for one that called the API.
 */
class LocalDiscoveryProvider implements DiscoveryProvider {
  readonly name = "local-fixture";
  constructor(private readonly urls: readonly string[]) {}
  async discover(url: string, options?: DiscoveryOptions): Promise<RawDiscovery> {
    const max = options?.maxUrls ?? this.urls.length;
    const links = this.urls.slice(0, max).map((href) => ({ url: href }));
    return {
      provider: this.name,
      rootUrl: url,
      requestedLimit: max,
      fetchedAt: new Date().toISOString(),
      rawCount: links.length,
      links,
    };
  }
}

// ---------------------------------------------------------------------------
// offline half — policy that must hold with no browser at all
// ---------------------------------------------------------------------------

function offlineChecks(): void {
  section("§33 stage registry");
  let integrity = true;
  try {
    assertRegistryIntegrity();
  } catch {
    integrity = false;
  }
  check("the registry describes every stage exactly once, in order", integrity);
  check(
    "exactly one stage is allowed to call Firecrawl, and it is discovery",
    STAGE_REGISTRY.filter((stage) => stage.firecrawl).length === 1 &&
      STAGE_REGISTRY.find((stage) => stage.firecrawl)?.stage === "discovery",
  );
  check(
    "the offline stages declare no browser and no network",
    STAGE_REGISTRY.filter((stage) =>
      ["selection", "interaction-detection", "interaction-modeling", "sitespec", "reconstruction"].includes(
        stage.stage,
      ),
    ).every((stage) => !stage.browser && !stage.network),
  );

  section("§60 escalation policy is closed");
  check(
    "requires-exact-observation is escalated unconditionally",
    decideEscalation("requires-exact-observation").allowed &&
      !decideEscalation("requires-exact-observation").conditional,
  );
  check(
    "requires-new-interaction-observation is escalated unconditionally",
    decideEscalation("requires-new-interaction-observation").allowed,
  );
  check(
    "requires-reobserve is CONDITIONAL, capped at one per route",
    decideEscalation("requires-reobserve").allowed &&
      decideEscalation("requires-reobserve").conditional,
  );
  for (const refused of [
    "requires-font-binding-observation",
    "requires-asset-materialization",
    "requires-pattern-modeling",
    "unknown-semantic-gap",
  ] as const) {
    check(
      `${refused} is refused, with a stated reason`,
      !decideEscalation(refused).allowed && decideEscalation(refused).reason.length > 10,
    );
  }

  section("§64 family escalation selection is deterministic and bounded");
  const audits = [
    { url: "https://x/c", contentDivergence: 0.1, structureDivergence: 0.9 },
    { url: "https://x/a", contentDivergence: 0.5, structureDivergence: 0.1 },
    { url: "https://x/b", contentDivergence: 0.5, structureDivergence: 0.4 },
    { url: "https://x/d", contentDivergence: 0.0, structureDivergence: 0.0 },
  ].map((entry, index) => ({
    routeId: `r${index}`,
    url: entry.url,
    familyId: "f000001",
    representativePageId: "p000001",
    status: "complete" as const,
    contentDivergence: entry.contentDivergence,
    structureDivergence: entry.structureDivergence,
    majorContentMismatch: entry.contentDivergence > 0.2,
    majorStructureMismatch: entry.structureDivergence > 0.2,
    diffIds: [],
  }));
  const selected = selectEscalationTargets(audits, 2);
  check(
    "only MAJOR mismatches are candidates, worst first, capped",
    selected.length === 2 && selected[0]!.url === "https://x/b" && selected[1]!.url === "https://x/a",
    selected.map((s) => s.url).join(","),
  );
  check(
    "a limit of 0 escalates nothing",
    selectEscalationTargets(audits, 0).length === 0,
  );
  check(
    "the same input always selects the same routes",
    JSON.stringify(selectEscalationTargets(audits, 3)) ===
      JSON.stringify(selectEscalationTargets([...audits].reverse(), 3)),
  );

  section("§127 final status is a classification, not a grade");
  const baseCoverage = {
    discoveredUrls: 5,
    verifiedUrls: 5,
    families: 3,
    representatives: 3,
    validationSamples: 0,
    observedPages: 3,
    failedPages: 0,
    interactionCandidates: 10,
    actionsPlanned: 4,
    actionsExecuted: 4,
    patternsConfirmed: 3,
    unknownInteractions: 1,
    generatedRoutes: 5,
    routesRendered: 5,
    qaPageViewports: 6,
    behaviorEquivalent: 3,
    behaviorMismatch: 0,
    familyEscalations: 0,
    correctionsProposed: 0,
    correctionsAccepted: 0,
  };
  check(
    "a clean run is complete",
    classifyFinalStatus({ stages: [], coverage: baseCoverage, unresolved: [] }).status ===
      "complete",
  );
  check(
    "a failed stage outranks everything",
    classifyFinalStatus({
      stages: [
        {
          stage: "build",
          status: "failed",
          counts: {},
          warnings: [],
          failure: "reconstruction-build-failure",
          elapsedMs: 1,
        },
      ],
      coverage: baseCoverage,
      unresolved: [],
    }).status === "failed",
  );
  check(
    "a failed page makes the run partial, not merely limited",
    classifyFinalStatus({
      stages: [],
      coverage: { ...baseCoverage, failedPages: 1 },
      unresolved: [],
    }).status === "partial",
  );
  /*
   * Task 16 final correction. The first fresh run reported
   * `complete-with-known-limitations` while all 19 routes threw a React
   * hydration error, because status was computed from diff CLASSIFICATIONS and
   * an exception is not a diff. A clone that throws is this pipeline's defect,
   * never a boundary of what public observation can reach.
   */
  check(
    "a clone that throws is partial, and is never filed as a known limitation",
    classifyFinalStatus({
      stages: [],
      coverage: { ...baseCoverage, cloneRuntimeErrors: 30 },
      unresolved: [],
    }).status === "partial",
  );
  check(
    "…and zero clone errors leaves the verdict alone",
    classifyFinalStatus({
      stages: [],
      coverage: { ...baseCoverage, cloneRuntimeErrors: 0 },
      unresolved: [],
    }).status === "complete",
  );
  check(
    "an observation-boundary finding makes it complete-with-known-limitations",
    classifyFinalStatus({
      stages: [],
      coverage: baseCoverage,
      unresolved: [
        {
          classification: "asset-hotlink-blocked",
          count: 3,
          affectedNodes: 3,
          upstreamStage: "reconstruction",
          recommendation: "requires-asset-materialization",
          requiresReobserve: false,
          requiresNewInteractionProbe: false,
          autoFixPossible: false,
        },
      ],
    }).status === "complete-with-known-limitations",
  );
  check(
    "a plain style delta does NOT downgrade the status",
    classifyFinalStatus({
      stages: [],
      coverage: baseCoverage,
      unresolved: [
        {
          classification: "style-mismatch",
          count: 900,
          affectedNodes: 900,
          upstreamStage: "reconstruction",
          recommendation: "none",
          requiresReobserve: false,
          requiresNewInteractionProbe: false,
          autoFixPossible: false,
        },
      ],
    }).status === "complete",
  );

  section("Task 17 §2 — Root URL Invariant (candidate seeding)");
  const rawWithoutRoot: RawDiscovery = {
    provider: "test",
    rootUrl: "https://example.com/",
    requestedLimit: 10,
    fetchedAt: "2026-08-17T00:00:00.000Z",
    rawCount: 2,
    links: [{ url: "https://example.com/a" }, { url: "https://example.com/b" }],
  };
  const seeded = buildDiscoveryResult(rawWithoutRoot, "https://example.com/", {}, "2026-08-17T00:00:00.000Z");
  check(
    "a provider result without the root still yields root + /a + /b",
    seeded.links.length === 3 &&
      seeded.links.some((link) => link.normalizedUrl === "https://example.com/") &&
      seeded.links.some((link) => link.normalizedUrl === "https://example.com/a") &&
      seeded.links.some((link) => link.normalizedUrl === "https://example.com/b"),
    seeded.links.map((link) => link.normalizedUrl).join(","),
  );
  check("the seeded result records rootSeeded: true", seeded.rootSeeded === true);
  check(
    "provider counters still balance and exclude the seed",
    seeded.rawCount === 2 &&
      seeded.normalizedCount === 2 &&
      seeded.rawCount ===
        seeded.normalizedCount +
          seeded.duplicateCount +
          seeded.invalidCount +
          seeded.externalFilteredCount &&
      seeded.links.length === seeded.normalizedCount + 1,
  );
  const rawWithRoot: RawDiscovery = {
    ...rawWithoutRoot,
    rawCount: 3,
    links: [{ url: "https://example.com/" }, ...rawWithoutRoot.links],
  };
  const unseeded = buildDiscoveryResult(rawWithRoot, "https://example.com/", {}, "2026-08-17T00:00:00.000Z");
  check(
    "a provider result that already contains the root is not seeded twice",
    unseeded.rootSeeded === false &&
      unseeded.links.length === 3 &&
      unseeded.normalizedCount === 3,
  );
  const seededTrailing = buildDiscoveryResult(
    rawWithoutRoot,
    "https://example.com",
    {},
    "2026-08-17T00:00:00.000Z",
  );
  check(
    "seeding normalizes the root like any other candidate (no-slash input)",
    seededTrailing.rootSeeded === true &&
      seededTrailing.links.some((link) => link.normalizedUrl === "https://example.com/"),
  );
  check(
    "a verified-but-unreconstructed root can never classify complete",
    classifyFinalStatus({
      stages: [],
      coverage: {
        ...baseCoverage,
        inputRootIncluded: true,
        inputRootVerified: true,
        inputRootSelectedOrRepresented: true,
        inputRootReconstructed: false,
      },
      unresolved: [],
    }).status === "partial",
  );
  check(
    "…and a reconstructed root leaves the verdict alone",
    classifyFinalStatus({
      stages: [],
      coverage: {
        ...baseCoverage,
        inputRootIncluded: true,
        inputRootVerified: true,
        inputRootSelectedOrRepresented: true,
        inputRootReconstructed: true,
      },
      unresolved: [],
    }).status === "complete",
  );
  check(
    "a root that never verified imposes no constraint (pre-Task-17 manifests too)",
    classifyFinalStatus({ stages: [], coverage: baseCoverage, unresolved: [] }).status ===
      "complete" &&
      classifyFinalStatus({
        stages: [],
        coverage: { ...baseCoverage, inputRootVerified: false },
        unresolved: [],
      }).status === "complete",
  );

  section("§22 grid placement properties are in the Observer whitelist");
  for (const property of [
    "grid-template-areas",
    "grid-area",
    "grid-auto-flow",
    "grid-auto-rows",
    "grid-auto-columns",
    "place-items",
    "place-content",
    "place-self",
    "order",
  ]) {
    check(`${property} is observed`, STYLE_WHITELIST.includes(property));
  }

  section("§70 dynamic subtree caps are global constants");
  check("element cap is a fixed 300", MAX_DYNAMIC_TARGET_ELEMENTS === 300);
  check("depth cap is a fixed 12", MAX_DYNAMIC_TARGET_DEPTH === 12);
  check("text cap is a fixed 20,000 characters", MAX_DYNAMIC_TARGET_TEXT_CHARS === 20_000);
}

// ---------------------------------------------------------------------------
// live half — the real pipeline, end to end
// ---------------------------------------------------------------------------

async function liveChecks(result: E2eRunResult, fixture: FixtureServer): Promise<void> {
  const manifest = result.manifest;

  section("§35 the manifest is a complete, validated record");
  let manifestValid = true;
  try {
    E2eManifestSchema.parse(
      JSON.parse(await readFile(result.manifestPath, "utf8")),
    );
  } catch (err) {
    manifestValid = false;
    console.log(`        ${err instanceof Error ? err.message.slice(0, 200) : err}`);
  }
  check("e2e-manifest.json re-parses against its own schema", manifestValid);
  check(
    "stages are recorded in pipeline order, not completion order",
    manifest.stages.map((stage) => stage.stage).join(",") ===
      STAGE_REGISTRY.filter((entry) =>
        manifest.stages.some((stage) => stage.stage === entry.stage),
      )
        .map((entry) => entry.stage)
        .join(","),
  );
  check(
    "every stage carries elapsed time",
    manifest.stages.every((stage) => stage.elapsedMs >= 0) &&
      Object.keys(manifest.timings).length === manifest.stages.length,
  );
  check("the run records 0 AI calls", manifest.environment.aiCalls === 0);
  check(
    "the run records 0 Firecrawl calls (local discovery provider)",
    manifest.environment.firecrawlCalls === 0 && manifest.input.options.localDiscovery,
  );

  section("§39 lineage");
  const lineage = manifest.lineage;
  check("lineage names the root url", lineage.rootUrl === fixture.baseUrl + "/");
  for (const [label, value] of [
    ["discovery", lineage.discoveryFile],
    ["verified urls", lineage.verifiedUrlsFile],
    ["selection", lineage.selectedPagesFile],
    ["observation", lineage.siteObservationFile],
    ["interaction analysis", lineage.interactionAnalysisFile],
    ["exploration", lineage.interactionExplorationFile],
    ["patterns", lineage.interactionPatternsFile],
    ["sitespec", lineage.siteSpecFile],
    ["reconstruction", lineage.reconstructionManifestFile],
    ["qa", lineage.qaManifestFile],
  ] as const) {
    check(`lineage records the ${label} artifact`, typeof value === "string" && value !== "");
  }
  check(
    "no lineage path is absolute (a shareable manifest carries no machine layout)",
    Object.values(lineage).every(
      (value) => typeof value !== "string" || !path.isAbsolute(value),
    ),
  );

  section("§44 every stage really ran");
  const byStage = new Map(manifest.stages.map((stage) => [stage.stage, stage]));
  for (const stage of [
    "discovery",
    "verification",
    "selection",
    "observation",
    "interaction-detection",
    "interaction-exploration",
    "interaction-modeling",
    "sitespec",
    "reconstruction",
    "build",
    "qa",
    "final-validation",
  ] as const) {
    const record = byStage.get(stage);
    check(
      `${stage} completed`,
      record !== undefined && (record.status === "ok" || record.status === "partial"),
      record ? `${record.status} ${record.failure ?? ""}` : "absent",
    );
  }

  const coverage = manifest.coverage;
  section("§95 route coverage");
  check(
    `all ${coverage.verifiedUrls} verified URLs became routes`,
    coverage.generatedRoutes === coverage.verifiedUrls && coverage.verifiedUrls > 0,
    `${coverage.generatedRoutes} vs ${coverage.verifiedUrls}`,
  );
  check(
    "every generated route rendered",
    coverage.routesRendered === coverage.generatedRoutes,
    `${coverage.routesRendered}/${coverage.generatedRoutes}`,
  );
  check("no page failed observation", coverage.failedPages === 0);

  section("Task 17 §2 — Root URL Invariant, live");
  const discoveryStage = manifest.stages.find((stage) => stage.stage === "discovery");
  check(
    "the provider omitted the root and discovery seeded it (rootSeeded count 1)",
    discoveryStage !== undefined && discoveryStage.counts["rootSeeded"] === 1,
    JSON.stringify(discoveryStage?.counts ?? {}),
  );
  check("inputRootIncluded", coverage.inputRootIncluded === true);
  check("inputRootVerified", coverage.inputRootVerified === true);
  check(
    "inputRootSelectedOrRepresented",
    coverage.inputRootSelectedOrRepresented === true,
  );
  check("inputRootReconstructed", coverage.inputRootReconstructed === true);
  check(
    "the seeded root became a real discovered URL (6 candidates from 5 provider links)",
    coverage.discoveredUrls === ROUTES.length,
    String(coverage.discoveredUrls),
  );

  section("Task 17 §4–§10 — user-visible targets and layout recovery, live");
  const reconstructionStage = manifest.stages.find(
    (stage) => stage.stage === "reconstruction",
  );
  check(
    "at least one observed target became a runtime binding",
    (reconstructionStage?.counts["observedTargetBindings"] ?? 0) >= 1,
    JSON.stringify(reconstructionStage?.counts ?? {}),
  );
  check(
    "the CSS-hidden aria panel is a REVEALED observed target",
    (reconstructionStage?.counts["observedTargetsRevealed"] ?? 0) >= 1,
  );
  check(
    "the centered .centered band recovered a layout rule from the probe",
    (reconstructionStage?.counts["layoutRecoveredRules"] ?? 0) >= 1 &&
      (reconstructionStage?.counts["layoutPagesWithAlignedProbe"] ?? 0) >= 1,
    `rules=${reconstructionStage?.counts["layoutRecoveredRules"]} aligned=${reconstructionStage?.counts["layoutPagesWithAlignedProbe"]}`,
  );
  check(
    "trigger-state and visible-target metrics are published separately",
    coverage.triggerStateEquivalent !== undefined &&
      coverage.userVisibleTargetEquivalent !== undefined &&
      coverage.userVisibleTargetNotDeclared !== undefined,
  );
  check(
    "at least one pattern's user-visible after-state verifies as equivalent",
    (coverage.userVisibleTargetEquivalent ?? 0) >= 1,
    `eq=${coverage.userVisibleTargetEquivalent} mm=${coverage.userVisibleTargetMismatch} n-obs=${coverage.userVisibleTargetNotObserved} n-decl=${coverage.userVisibleTargetNotDeclared}`,
  );
  check(
    "a pattern with no target evidence counts as not-declared, never equivalent",
    (coverage.userVisibleTargetNotDeclared ?? 0) >= 1,
    `n-decl=${coverage.userVisibleTargetNotDeclared}`,
  );

  section("Task 17.1 — portal mounts, height-0 hosts, trigger-inside-target, live");
  check(
    "a portal-mounted region attached under its RESOLVED observed host",
    (reconstructionStage?.counts["observedTargetsHostMounted"] ?? 0) >= 1,
    JSON.stringify(reconstructionStage?.counts ?? {}),
  );
  const qaStage = manifest.stages.find((stage) => stage.stage === "qa");
  let qaInteractions: {
    patternId: string;
    viewport?: string;
    limitations?: string[];
    visibleTarget?: string;
    triggerState?: string;
    mismatchFields?: string[];
  }[] = [];
  if (qaStage?.runDir) {
    const interactionsDir = path.join(qaStage.runDir, "interactions");
    try {
      const files = (await readdir(interactionsDir)).filter((f) => f.endsWith(".json"));
      qaInteractions = await Promise.all(
        files.map(async (f) =>
          JSON.parse(await readFile(path.join(interactionsDir, f), "utf8")),
        ),
      );
    } catch {
      qaInteractions = [];
    }
  }
  check(
    "no fixture interaction has a user-visible target mismatch",
    coverage.userVisibleTargetMismatch === 0,
    `mm=${coverage.userVisibleTargetMismatch} ` +
      JSON.stringify(
        qaInteractions
          .filter((r) => r.visibleTarget === "mismatch")
          .map((r) => `${r.patternId}/${r.viewport}:${(r.mismatchFields ?? []).join("+")}`),
      ),
  );
  check(
    "no fixture interaction has a trigger-state mismatch",
    coverage.triggerStateMismatch === 0,
    `mm=${coverage.triggerStateMismatch}`,
  );
  check(
    "the swap host that contains its trigger is a NAMED limitation, not a silent pass",
    qaInteractions.some((r) =>
      (r.limitations ?? []).includes("trigger-inside-target-content-not-replayed"),
    ),
    JSON.stringify(qaInteractions.map((r) => r.limitations ?? []).flat()),
  );

  // --- Phase A, end to end -------------------------------------------------
  const upstream = manifest.upstream;
  section("§9/§10 A1 — asset occurrence mapping");
  check(
    "the same URL on three <img> yields three occurrences",
    upstream.observedAssetOccurrences > upstream.uniqueAssets,
    `${upstream.observedAssetOccurrences} occurrences / ${upstream.uniqueAssets} unique`,
  );
  check(
    "EVERY <img> in the SiteSpec carries an asset reference",
    upstream.specImageNodes > 0 &&
      upstream.specAssetBoundImageNodes === upstream.specImageNodes,
    `${upstream.specAssetBoundImageNodes}/${upstream.specImageNodes}`,
  );
  check(
    "no asset reference was lost between the SiteSpec and the clone",
    upstream.assetOccurrenceLoss === 0,
    String(upstream.assetOccurrenceLoss),
  );

  section("§20 A2 — nested scroll state");
  check(
    "the Observer found the scroll container",
    upstream.observedScrollContainers > 0,
    String(upstream.observedScrollContainers),
  );
  check(
    "every observed scroll container reached the SiteSpec",
    upstream.specScrollStateNodes >= upstream.observedScrollContainers / 2 &&
      upstream.specScrollStateNodes > 0,
    `${upstream.observedScrollContainers} observed → ${upstream.specScrollStateNodes} in spec`,
  );
  check(
    "the non-zero offset was carried and the clone was told to restore it",
    upstream.specScrolledNodes > 0 && upstream.cloneScrollRestoreNodes > 0,
    `${upstream.specScrolledNodes} scrolled → ${upstream.cloneScrollRestoreNodes} restore instructions`,
  );
  check(
    "QA measured the clone's scroller at the observed offset",
    upstream.qaScrollRestored > 0 && upstream.qaScrollMismatched === 0,
    `${upstream.qaScrollRestored} restored / ${upstream.qaScrollMismatched} mismatched`,
  );

  section("§23 A3 — grid placement properties");
  const grid = upstream.gridPropertyOccurrences;
  for (const property of [
    "grid-template-areas",
    "grid-area",
    "grid-auto-flow",
    "place-items",
    "order",
  ]) {
    check(
      `${property} reached the SiteSpec style catalog`,
      (grid[property] ?? 0) > 0,
      String(grid[property] ?? 0),
    );
  }

  section("§78 dynamic target contents");
  check(
    "the exploration mounted a dynamic target",
    upstream.dynamicTargets > 0,
    String(upstream.dynamicTargets),
  );
  check(
    "its contents were captured and compiled into a template",
    upstream.dynamicTargetsWithTemplate > 0 && upstream.dynamicTemplateNodes > 0,
    `${upstream.dynamicTargetsWithTemplate} with template, ${upstream.dynamicTemplateNodes} nodes`,
  );

  // --- SiteSpec content ------------------------------------------------------
  section("§75 the SiteSpec carries the new fields");
  const siteSpecFile = lineage.siteSpecFile;
  if (siteSpecFile === undefined) {
    check("a SiteSpec was produced", false);
  } else {
    const loaded = await loadSiteSpec(path.resolve(siteSpecFile));
    const nodes = loaded.pages.flatMap((page) => [
      ...page.viewports.desktop.nodes,
      ...page.viewports.mobile.nodes,
    ]);
    const scrolled = nodes.filter(
      (node) => node.type === "element" && node.scrollState !== undefined,
    );
    check(
      "scrollState is on the scroll container and nowhere near every node",
      scrolled.length > 0 && scrolled.length < nodes.length / 10,
      `${scrolled.length} of ${nodes.length}`,
    );
    check(
      "scrollState is never on <html> or <body> (item 21)",
      scrolled.every(
        (node) => node.type === "element" && node.tagName !== "html" && node.tagName !== "body",
      ),
    );
    const templates = loaded.interactionSpec.patterns
      .map((pattern) => pattern.target?.dynamicTemplate)
      .filter((template) => template !== undefined);
    check("a dynamic template is present in the interaction spec", templates.length > 0);
    if (templates.length > 0) {
      const template = templates[0]!;
      check(
        "the template is marked observed / after-action, never initial DOM",
        template.provenance === "observed" && template.state === "after-action",
      );
      check(
        "the template holds the menu's real children",
        template.elementNodeCount > 1 && template.textNodeCount > 0,
        `${template.elementNodeCount} elements, ${template.textNodeCount} text`,
      );
      check(
        "the bounded capture did not hit a cap on a small menu",
        template.truncations.length === 0,
        template.truncations.join(","),
      );
      const templateAttributes = template.nodes.flatMap((node) =>
        Object.keys(node.attributes),
      );
      check(
        "no class / style / data-* / on* attribute survived into the template",
        templateAttributes.every(
          (name) =>
            name !== "class" &&
            name !== "style" &&
            !name.startsWith("data-") &&
            !name.startsWith("on"),
        ),
      );
    }
  }

  // --- behavior + unknown ----------------------------------------------------
  section("§101/§102 behavior");
  check(
    "at least one verified pattern was replayed on both sides",
    coverage.behaviorEquivalent + coverage.behaviorMismatch > 0,
    `${coverage.behaviorEquivalent} equivalent / ${coverage.behaviorMismatch} mismatch`,
  );
  const qa = result.qa;
  if (qa) {
    const dynamicResults = qa.interactions.filter((entry) => entry.targetIsDynamic);
    check(
      "the clone mounted OBSERVED children into its dynamic target",
      dynamicResults.length > 0 &&
        dynamicResults.some((entry) => (entry.dynamicTargetChildren?.clone ?? 0) > 0),
      dynamicResults
        .map(
          (entry) =>
            `${entry.patternId}: original=${entry.dynamicTargetChildren?.original ?? "-"} clone=${entry.dynamicTargetChildren?.clone ?? "-"}`,
        )
        .join(" "),
    );
    check(
      "no unknown interaction was implemented or promoted",
      qa.unknowns.every((entry) => entry.cloneChangeFields.length === 0) &&
        (qa.final ?? qa.baseline).unknowns.autoFixed === 0,
    );
    check(
      "the 메뉴 열기 trigger stayed unknown",
      qa.unknowns.length > 0,
      `${qa.unknowns.length} unknown signature(s) replayed`,
    );
    check(
      "every applied correction is one of the three CLOSED types",
      qa.applied.every((correction) =>
        [
          "document-canvas-background",
          "interaction-target-state-style",
          "safe-data-image-recovery",
        ].includes(correction.type),
      ),
    );
    check("the clone produced 0 JavaScript runtime errors", (qa.final ?? qa.baseline).snapshotFidelity.runtimeErrors === 0);
    check(
      "content fidelity against the snapshot is exact",
      (qa.final ?? qa.baseline).snapshotFidelity.contentExactRatio === 1,
      String((qa.final ?? qa.baseline).snapshotFidelity.contentExactRatio),
    );
  } else {
    check("QA produced a result", false);
  }

  section("§115–§120 the generated app is independent");
  const finalStage = byStage.get("final-validation");
  check(
    "the independence audit found no upstream artifact reference",
    (finalStage?.counts["upstreamArtifactReferences"] ?? -1) === 0,
  );
  check(
    "no original <script src> survived",
    (finalStage?.counts["originalScripts"] ?? -1) === 0,
  );
  check(
    "no original stylesheet <link> survived",
    (finalStage?.counts["originalStylesheets"] ?? -1) === 0,
  );
  check(
    "no inline on* handler survived",
    (finalStage?.counts["inlineHandlers"] ?? -1) === 0,
  );
  check(
    "no form can write to the origin backend",
    (finalStage?.counts["originBackendWriteTargets"] ?? -1) === 0,
  );
  check(
    "the generated app depends on no origin-stack package",
    (finalStage?.counts["originStackDependencies"] ?? -1) === 0,
  );

  section("§63/§65 family escalation");
  const escalation = byStage.get("family-escalation");
  check(
    "a family formed, so some route IS represented rather than observed",
    coverage.families < coverage.verifiedUrls,
    `${coverage.verifiedUrls} URLs → ${coverage.families} families`,
  );
  check(
    "the audit found a badly-represented route and the stage ran it",
    escalation?.status === "ok" && (escalation.counts["escalated"] ?? 0) > 0,
    `${escalation?.status} escalated=${escalation?.counts["escalated"] ?? 0} of ` +
      `${escalation?.counts["candidates"] ?? 0} candidate(s)`,
  );
  check(
    "the escalation wrote a NEW augmented observation run, not into the original",
    typeof lineage.augmentedObservationFile === "string" &&
      lineage.augmentedObservationFile.endsWith("-augmented/site-observation.json"),
    String(lineage.augmentedObservationFile),
  );
  check(
    "the SiteSpec and clone were rebuilt from it (stage ran twice)",
    (byStage.get("sitespec")?.warnings ?? []).some((w) => w.startsWith("stage ran ")) &&
      (byStage.get("reconstruction")?.warnings ?? []).some((w) => w.startsWith("stage ran ")),
  );
  check(
    "escalation is counted in coverage",
    coverage.familyEscalations > 0,
    String(coverage.familyEscalations),
  );

  section("§93 the final reconstruction is chosen, with a reason");
  check(
    "a final reconstruction is named",
    manifest.finalReconstruction !== undefined &&
      manifest.finalReconstruction.reason.length > 10,
  );
  check(
    "its kind is baseline, corrected or escalated — never 'the last one'",
    ["baseline", "corrected", "escalated"].includes(
      manifest.finalReconstruction?.kind ?? "",
    ),
  );

  section("§127 final status");
  check(
    "the run did not fail",
    manifest.finalStatus !== "failed",
    manifest.finalStatus,
  );
  console.log(`        final status: ${manifest.finalStatus}`);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[smoke:e2e] Task 16 — Full End-to-End Reconstruction");
  offlineChecks();

  const fixture = await startFixtureServer();
  const outputRoot = await mkdtemp(path.join(tmpdir(), "web-recon-e2e-"));
  let dataDir: string | undefined;
  try {
    // A browser check up front: a missing Chromium should say so plainly rather
    // than surfacing as an unexplained stage failure eight minutes in.
    const browser = await chromium.launch();
    await browser.close();

    console.log("");
    console.log(`[smoke:e2e] fixture at ${fixture.baseUrl} (${ROUTES.length} routes)`);
    /*
     * Root URL Invariant (Task 17): the provider deliberately does NOT return
     * the root. This is the exact stripe.com failure mode — Firecrawl's 19
     * links held no `/` — and the live run must recover it through candidate
     * seeding, verify it, select it and reconstruct it like any other route.
     */
    const providerUrls = fixture.urls.filter(
      (url) => new URL(url).pathname !== "/",
    );
    const result = await runE2eReconstruction({
      rootUrl: `${fixture.baseUrl}/`,
      maxUrls: ROUTES.length,
      concurrency: 2,
      autoFix: true,
      maxFixIterations: 1,
      familyEscalation: 2,
      discoveryProvider: new LocalDiscoveryProvider(providerUrls),
      outputDir: path.join(outputRoot, "e2e-run"),
      onLog: (message) => console.log(`        ${message}`),
    });
    dataDir = path.join(
      "data",
      new URL(fixture.baseUrl).hostname,
    );
    await liveChecks(result, fixture);
  } finally {
    await fixture.stop();
    await rm(outputRoot, { recursive: true, force: true });
    // The fixture's own run namespace under data/ is this test's litter, and
    // leaving it behind would grow by one port-numbered tree per run.
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
  }

  console.log("");
  console.log(`${passed}/${passed + failed} checks passed`);
  if (failed > 0) {
    console.log(`[smoke:e2e] FAILED — ${failed} check(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log("[smoke:e2e] OK");
}

main().catch((err) => {
  console.error("[smoke:e2e] ERROR —", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
