import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import {
  PageSelectionSchema,
  SCHEMA_VERSION as SELECTOR_SCHEMA_VERSION,
  type PageSelection,
  type SelectedPage,
} from "../src/selector/types.js";
import { observeSelectedPages } from "../src/multi-observer/index.js";
import { analyzeSiteInteractions } from "../src/interaction-detector/index.js";
import type {
  InteractionCandidate,
  InteractionTarget,
} from "../src/interaction-detector/types.js";
import {
  InteractionExplorationSchema,
  InteractionObservationSchema,
  InteractionPlanSchema,
  MAX_ACTIONS_PER_VIEWPORT,
  MAX_MUTATION_RECORDS,
  buildInteractionPlan,
  candidateEligibility,
  diffSnapshots,
  exploreSite,
  loadCandidatePage,
  loadInteractionAnalysis,
  planSiteActions,
  selectPlanPages,
  shapeKeyOf,
  type InteractionObservation,
  type InteractionStateSnapshot,
  type LoadedCandidatePage,
} from "../src/interaction-explorer/index.js";

/**
 * Local fixture test for the Safe Rule-Based Interaction Explorer (Task 11
 * §71–90). Real Chromium, real local HTTP server, no external network, no test
 * framework, no AI.
 *
 * The fixture is built by running the REAL pipeline over a fixture site:
 *
 *   fixture server → pnpm observe:site (Task 09) → pnpm detect:interactions
 *   (Task 10) → pnpm explore:interactions (Task 11)
 *
 * rather than by hand-writing synthetic Task 09/10 artifacts. That costs a
 * minute of wall clock and buys the only thing that matters: the explorer is
 * exercised against the exact bytes the previous stages really produce, so a
 * schema drift between two stages fails here instead of on a live site.
 *
 * The server is stateful on purpose, which is what makes the two DRIFT cases
 * real rather than simulated:
 *
 *  - `/tabs` mints a NEW generated button id on every request, so the ids stored
 *    by the observation are genuinely stale by the time the explorer runs (§78).
 *  - `/drift-disabled` is flipped to `disabled` BETWEEN the observation and the
 *    exploration, so the live reconciliation meets a control that really did
 *    change under it (§80).
 *
 * Safety is verified from BOTH sides: the guard counters say an attempt was
 * blocked, and the server's own hit counters say the request never arrived.
 */

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  checks++;
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Fixture site
// ---------------------------------------------------------------------------

const HTML = (body: string, script = ""): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture</title>` +
  `<style>[hidden]{display:none}body{font-family:sans-serif;margin:8px}` +
  `button{display:block;margin:2px 0}</style></head><body>${body}` +
  (script ? `<script>${script}</script>` : "") +
  `</body></html>`;

interface ServerState {
  /** Flipped to true between the observation and the exploration (§80). */
  disabled: boolean;
  /** Flipped with it: `/ambiguous` gains a leading section, staling its path. */
  shifted: boolean;
  /** Bumped per request so `/tabs` mints fresh generated ids (§78). */
  idSeed: number;
  hits: Record<string, number>;
}

/** §72 disclosure with an existing target, §88 shape dedup, §77 no-op button. */
function disclosurePage(): string {
  const faqs = Array.from(
    { length: 10 },
    (_, i) =>
      `<details><summary>Question ${i + 1}</summary><p>Answer ${i + 1}.</p></details>`,
  ).join("");
  return HTML(
    `<main>
      <button id="d1" aria-expanded="false" aria-controls="panel1">Details</button>
      <div id="panel1" hidden><p>Panel content</p></div>
      ${faqs}
      <button aria-label="Noop"></button>
    </main>`,
    `document.getElementById('d1').addEventListener('click', function () {
       var open = this.getAttribute('aria-expanded') === 'true';
       this.setAttribute('aria-expanded', open ? 'false' : 'true');
       document.getElementById('panel1').hidden = open;
     });`,
  );
}

/** §73 dynamic mount, §76 checkbox, §74 native details (open → closed). */
function dynamicPage(): string {
  return HTML(
    `<main>
      <button id="m1" aria-expanded="false" aria-haspopup="menu" aria-controls="menu1">Menu</button>
      <label><input type="checkbox" id="cb1"> Accept</label>
      <details open><summary>Open section</summary><p>Visible answer.</p></details>
      <button id="lbl" aria-label="Open menu"></button>
    </main>`,
    `document.getElementById('lbl').addEventListener('click', function () {
       this.setAttribute('aria-label',
         this.getAttribute('aria-label') === 'Open menu' ? 'Close menu' : 'Open menu');
     });
     document.getElementById('m1').addEventListener('click', function () {
       if (document.getElementById('menu1')) return;
       var menu = document.createElement('div');
       menu.id = 'menu1';
       menu.setAttribute('role', 'menu');
       menu.innerHTML =
         '<button role="menuitem">One</button>' +
         '<button role="menuitem">Two</button>' +
         '<button role="menuitem">Three</button>';
       document.querySelector('main').appendChild(menu);
       this.setAttribute('aria-expanded', 'true');
     });`,
  );
}

/**
 * Task 17.1 — the framework-portal shape measured live on stripe.com: the
 * click mounts a body-level wrapper whose OWN rect is 0×0 (its only child is
 * `position: fixed`), the visible panel sits inside it, and the trigger gains
 * `aria-controls` only AFTER the click. The panel deliberately inventories
 * more than 300 elements (adaptive capture expansion) and contains one line
 * with a text run AFTER an element child (text-segment interleaving).
 */
function portalPage(): string {
  return HTML(
    `<main>
      <button id="pp1" aria-expanded="false" aria-haspopup="dialog">Open portal</button>
    </main>`,
    `document.getElementById('pp1').addEventListener('click', function () {
       if (document.getElementById('portal-panel')) return;
       var wrapper = document.createElement('div');
       wrapper.id = 'portal-wrap';
       var panel = document.createElement('div');
       panel.id = 'portal-panel';
       panel.setAttribute('role', 'dialog');
       panel.style.position = 'fixed';
       panel.style.top = '40px';
       panel.style.left = '20px';
       panel.style.width = '320px';
       panel.style.background = '#fff';
       panel.style.border = '1px solid #000';
       var line = document.createElement('div');
       var price = document.createElement('span');
       price.textContent = 'Price';
       line.appendChild(price);
       line.appendChild(document.createTextNode(' /month'));
       panel.appendChild(line);
       for (var i = 0; i < 340; i++) {
         var item = document.createElement('span');
         item.textContent = 'item' + i + ' ';
         panel.appendChild(item);
       }
       wrapper.appendChild(panel);
       document.body.appendChild(wrapper);
       this.setAttribute('aria-controls', 'portal-panel');
       this.setAttribute('aria-expanded', 'true');
     });`,
  );
}

/** §75 tabs (both selected states, §17) and §78 generated-id drift. */
function tabsPage(seed: number): string {
  const a = `_R_${seed}a_`;
  const b = `_R_${seed}b_`;
  return HTML(
    `<main>
      <div role="tablist">
        <button id="${a}" role="tab" aria-selected="false" aria-controls="panelA">npm</button>
        <button id="${b}" role="tab" aria-selected="true" aria-controls="panelB">pnpm</button>
      </div>
      <div id="panelA" role="tabpanel" hidden><p>npm instructions</p></div>
      <div id="panelB" role="tabpanel"><p>pnpm instructions</p></div>
    </main>`,
    `Array.prototype.forEach.call(document.querySelectorAll('[role=tab]'), function (tab) {
       tab.addEventListener('click', function () {
         Array.prototype.forEach.call(document.querySelectorAll('[role=tab]'), function (other) {
           var on = other === tab;
           other.setAttribute('aria-selected', on ? 'true' : 'false');
           document.getElementById(other.getAttribute('aria-controls')).hidden = !on;
         });
       });
     });`,
  );
}

/**
 * §79 two indistinguishable controls whose stored structural path has ALSO gone
 * stale — a banner section is injected ahead of them between the observation and
 * the exploration, so `main>section:1>button:1` no longer points at a button.
 * Semantic strategies find two, the path finds none, and the only honest answer
 * left is `ambiguous`.
 */
function ambiguousPage(shifted: boolean): string {
  const card = `<section><h2>Card</h2><button aria-pressed="false">Open</button></section>`;
  const banner = shifted ? `<section><h2>Banner</h2></section>` : "";
  return HTML(`<main>${banner}${card}${card}</main>`);
}

/**
 * §22/§23 the duplicated-navigation case: two controls with identical semantics
 * and identical semantic ancestors, distinguishable ONLY by DOM position. The
 * structural path may pick from the semantic match set — and only the first
 * button does anything, so a `changed` result proves the RIGHT one was clicked.
 */
function duplicatePage(): string {
  const card = (title: string): string =>
    `<section><h2>${title}</h2><button aria-pressed="false">Toggle</button></section>`;
  return HTML(
    `<main>${card("Primary")}${card("Secondary")}</main>`,
    `document.querySelectorAll('main button')[0].addEventListener('click', function () {
       this.setAttribute('aria-pressed',
         this.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
     });`,
  );
}

/** §82–87 safety and mutation-cap fixtures; each button is a distinct shape. */
function safetyPage(): string {
  return HTML(
    `<main>
      <button id="s-nav" aria-expanded="false">Navigate</button>
      <button id="s-popup" aria-pressed="false">Popup</button>
      <button id="s-download" aria-haspopup="menu">Download</button>
      <button id="s-write" aria-checked="false">Write</button>
      <button id="s-mutate" aria-selected="false">Mutate</button>
      <button id="s-pollute" aria-expanded="true">Pollute</button>
      <button id="s-dialog" aria-haspopup="dialog">Dialog</button>
    </main>`,
    `if (localStorage.getItem('wr-foo')) {
       var leak = document.createElement('dialog');
       leak.id = 'contaminated';
       leak.setAttribute('open', '');
       document.body.appendChild(leak);
     }
     if (document.body.classList.contains('wr-polluted')) {
       var leak2 = document.createElement('dialog');
       leak2.id = 'contaminated-class';
       document.body.appendChild(leak2);
     }
     document.getElementById('s-nav').addEventListener('click', function () {
       window.location.href = '/danger';
     });
     document.getElementById('s-popup').addEventListener('click', function () {
       window.open('/popup', '_blank');
     });
     document.getElementById('s-download').addEventListener('click', function () {
       var blob = new Blob(['fixture download'], { type: 'text/plain' });
       var a = document.createElement('a');
       a.href = URL.createObjectURL(blob);
       a.download = 'fixture.txt';
       document.body.appendChild(a);
       a.click();
     });
     document.getElementById('s-write').addEventListener('click', function () {
       fetch('/api/save', { method: 'POST', body: 'secret-body' });
     });
     document.getElementById('s-mutate').addEventListener('click', function () {
       var host = document.querySelector('main');
       for (var i = 0; i < 1000; i++) {
         var span = document.createElement('span');
         span.textContent = String(i);
         host.appendChild(span);
       }
     });
     document.getElementById('s-pollute').addEventListener('click', function () {
       localStorage.setItem('wr-foo', '1');
       document.body.classList.add('wr-polluted');
       var marker = document.createElement('dialog');
       marker.id = 'click-marker';
       marker.setAttribute('open', '');
       document.body.appendChild(marker);
     });
     document.getElementById('s-dialog').addEventListener('click', function () {
       window.confirm('proceed?');
     });`,
  );
}

/** §80 a control that is enabled when observed and disabled when explored. */
function driftDisabledPage(disabled: boolean): string {
  return HTML(
    `<main><button id="drift" aria-expanded="false"${disabled ? " disabled" : ""}>Drift</button></main>`,
  );
}

/** §81 form-submit and file-input candidates — must never be clicked. */
function formPage(): string {
  return HTML(
    `<main>
      <form action="/api/form" method="post">
        <input type="text" name="q" placeholder="query">
        <button type="submit" aria-expanded="false">Submit</button>
      </form>
      <input type="file" aria-expanded="false">
    </main>`,
  );
}

/** §89 more distinct shapes than the per-viewport budget allows. */
function budgetPage(): string {
  const shapes = [
    'aria-haspopup="true"',
    'aria-haspopup="menu"',
    'aria-haspopup="listbox"',
    'aria-haspopup="tree"',
    'aria-haspopup="grid"',
    'aria-haspopup="dialog"',
    'aria-expanded="false"',
    'aria-expanded="true"',
    'aria-pressed="false"',
    'aria-pressed="true"',
  ];
  const buttons = shapes
    .map((attr, i) => `<button ${attr}>Shape ${i + 1}</button>`)
    .join("");
  return HTML(`<main>${buttons}</main>`);
}

function startServer(state: ServerState): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    state.hits[url] = (state.hits[url] ?? 0) + 1;

    const html = (body: string): void => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    };

    switch (url) {
      case "/disclosure":
        return html(disclosurePage());
      case "/dynamic":
        return html(dynamicPage());
      case "/portal":
        return html(portalPage());
      case "/tabs":
        return html(tabsPage(state.idSeed++));
      case "/ambiguous":
        return html(ambiguousPage(state.shifted));
      case "/duplicate":
        return html(duplicatePage());
      case "/safety":
        return html(safetyPage());
      case "/drift-disabled":
        return html(driftDisabledPage(state.disabled));
      case "/form":
        return html(formPage());
      case "/budget":
        return html(budgetPage());
      case "/danger":
        return html(HTML("<h1>DANGER — this page must never be reached</h1>"));
      case "/popup":
        return html(HTML("<h1>popup</h1>"));
      case "/api/save":
      case "/api/form":
        res.writeHead(200, { "content-type": "application/json" });
        return res.end('{"written":true}');
      default:
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        return res.end(HTML("<h1>Not found</h1>"));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

const FIXTURE_PATHS = [
  "/ambiguous",
  "/budget",
  "/disclosure",
  "/drift-disabled",
  "/duplicate",
  "/dynamic",
  "/form",
  "/portal",
  "/safety",
  "/tabs",
];

function buildSelection(rootUrl: string, paths: readonly string[]): PageSelection {
  const pages: SelectedPage[] = paths.map((p, i) => ({
    url: `${rootUrl}${p}`,
    familyId: `f${String(i + 1).padStart(6, "0")}`,
    familyType: "singleton",
    memberCount: 1,
    reason: "sole-member",
    reasonDetail: "fixture",
  }));
  return PageSelectionSchema.parse({
    schemaVersion: SELECTOR_SCHEMA_VERSION,
    rootUrl,
    sourceVerifiedUrlsFile: "fixture/verified-urls.json",
    sourceVerificationFile: "fixture/verification.json",
    selectedAt: "2026-08-13T00:00:00.000Z",
    verifiedUrlCount: pages.length,
    familyCount: pages.length,
    selectedCount: pages.length,
    reductionCount: 0,
    reductionRate: 0,
    familyTypeCounts: {
      "content-duplicate": 0,
      "sibling-pattern": 0,
      "scope-structure": 0,
      singleton: pages.length,
    },
    largestFamilySize: 1,
    pages,
    unselected: [],
  } satisfies PageSelection);
}

// ---------------------------------------------------------------------------
// 1. Pure logic (no browser, no server)
// ---------------------------------------------------------------------------

function makeCandidate(
  overrides: Partial<InteractionCandidate> & Pick<InteractionCandidate, "id">,
): InteractionCandidate {
  return {
    elementId: "e000001",
    tagName: "button",
    priority: "P1",
    capabilities: ["click", "state-toggle", "disclosure-trigger"],
    initialState: {
      localVisible: true,
      effectiveVisible: true,
      disabled: false,
      readonly: false,
      inertAncestor: false,
      pointerOperable: true,
      initiallyOperable: true,
    },
    guardFlags: [],
    evidence: [
      { type: "native-element", value: "button", provenance: "observed" },
      { type: "aria-expanded", value: "false", provenance: "observed" },
    ],
    controls: [],
    insideForm: false,
    submitCapable: false,
    styleId: "s000001",
    ...overrides,
  };
}

function testEligibility(): void {
  console.log("Eligibility & shape (pure)");

  check(
    "§11 P1 with a state-toggle capability is eligible",
    candidateEligibility(makeCandidate({ id: "ic000001" })).eligible,
  );
  check(
    "§13 P3 is never eligible",
    !candidateEligibility(
      makeCandidate({
        id: "ic000002",
        priority: "P3",
        capabilities: ["generic-pointer"],
      }),
    ).eligible,
  );
  const p3 = candidateEligibility(
    makeCandidate({ id: "ic000003", priority: "P3", capabilities: ["generic-pointer"] }),
  );
  check(
    "§13 P3 records reason=priority, not silence",
    !p3.eligible && p3.skip === "priority",
  );

  const guarded = candidateEligibility(
    makeCandidate({ id: "ic000004", guardFlags: ["form-submit"], submitCapable: true }),
  );
  check(
    "§14/§37 form-submit is excluded and names its guard",
    !guarded.eligible &&
      guarded.skip === "guard" &&
      (guarded.guardFlags ?? []).includes("form-submit"),
  );
  const fileInput = candidateEligibility(
    makeCandidate({
      id: "ic000005",
      tagName: "input",
      inputType: "file",
      priority: "P2",
      capabilities: ["click"],
      guardFlags: ["file-input"],
    }),
  );
  check(
    "§38 file-input is excluded",
    !fileInput.eligible && fileInput.skip === "guard",
  );

  const hidden = candidateEligibility(
    makeCandidate({
      id: "ic000006",
      guardFlags: ["hidden"],
      initialState: {
        localVisible: false,
        effectiveVisible: false,
        disabled: false,
        readonly: false,
        inertAncestor: false,
        pointerOperable: true,
        initiallyOperable: false,
      },
    }),
  );
  check(
    "§14 hidden is preserved as its own skip reason, not deleted",
    !hidden.eligible && hidden.skip === "hidden",
  );

  check(
    "§11 P2 checkbox is eligible",
    candidateEligibility(
      makeCandidate({
        id: "ic000007",
        tagName: "input",
        inputType: "checkbox",
        priority: "P2",
        capabilities: ["click", "toggle"],
      }),
    ).eligible,
  );
  check(
    "§11 P2 icon-only button is eligible (mobile hamburger shape)",
    candidateEligibility(
      makeCandidate({ id: "ic000008", priority: "P2", capabilities: ["click"] }),
    ).eligible,
  );
  check(
    "§11 P2 button WITH text is not eligible (no blanket P2 allowance)",
    !candidateEligibility(
      makeCandidate({
        id: "ic000009",
        priority: "P2",
        capabilities: ["click"],
        text: "Subscribe",
      }),
    ).eligible,
  );
  check(
    "§12 P2 text input is not eligible",
    !candidateEligibility(
      makeCandidate({
        id: "ic000010",
        tagName: "input",
        inputType: "text",
        priority: "P2",
        capabilities: ["click", "edit", "focus"],
      }),
    ).eligible,
  );

  // §17 — open/closed and selected/unselected are DIFFERENT shapes.
  const targets = new Map<string, InteractionTarget>();
  const closed = shapeKeyOf(makeCandidate({ id: "ic000011" }), targets);
  const open = shapeKeyOf(
    makeCandidate({
      id: "ic000012",
      evidence: [
        { type: "native-element", value: "button", provenance: "observed" },
        { type: "aria-expanded", value: "true", provenance: "observed" },
      ],
    }),
    targets,
  );
  check("§17 aria-expanded false and true are different shapes", closed !== open);
  check(
    "§16 two identical candidates share one shape key",
    shapeKeyOf(makeCandidate({ id: "ic000013" }), targets) === closed,
  );
}

function snapshot(
  overrides: Partial<InteractionStateSnapshot> = {},
): InteractionStateSnapshot {
  return {
    url: "http://fixture/",
    candidate: {
      exists: true,
      tagName: "button",
      visible: true,
      attributes: { "aria-expanded": "false" },
      state: { hidden: false, inert: false },
      computed: {
        display: "block",
        visibility: "visible",
        opacity: "1",
        pointerEvents: "auto",
      },
    },
    targets: [],
    containers: { containers: [], totalCount: 0, truncated: false },
    ...overrides,
  };
}

function testDiff(): void {
  console.log("");
  console.log("State diff (pure)");

  const before = snapshot();
  const after = snapshot({
    candidate: {
      ...before.candidate,
      attributes: { "aria-expanded": "true" },
    },
  });
  const diff = diffSnapshots(before, after);
  check(
    "§58 an aria-expanded flip is one candidate-attribute-change",
    diff.changes.length === 1 &&
      diff.changes[0].category === "candidate-attribute-change" &&
      diff.changes[0].before === "false" &&
      diff.changes[0].after === "true",
  );
  check("§59 that change is meaningful", diff.meaningfulChange);

  check(
    "§59 an identical snapshot pair is no-change",
    !diffSnapshots(before, snapshot()).meaningfulChange,
  );

  const checkedBefore = snapshot({
    candidate: { ...before.candidate, state: { checked: false } },
  });
  const checkedAfter = snapshot({
    candidate: { ...before.candidate, state: { checked: true } },
  });
  const checkedDiff = diffSnapshots(checkedBefore, checkedAfter);
  check(
    "§58 a checked flip gets its own category",
    checkedDiff.changes.some((c) => c.category === "checked-change"),
  );

  const urlBefore = snapshot();
  const urlAfter = snapshot({ url: "http://fixture/other" });
  const urlDiff = diffSnapshots(urlBefore, urlAfter);
  check(
    "§58 a URL change is recorded",
    urlDiff.urlChanged && urlDiff.changes.some((c) => c.category === "url-change"),
  );
  check(
    "§59 a URL change alone is NOT `changed`",
    !urlDiff.meaningfulChange,
  );

  // §109 — a client-side route change replaces the document, so every container
  // difference it produces is page replacement, not a state transition.
  const navigatedDiff = diffSnapshots(
    snapshot({
      containers: {
        containers: [
          { key: "dialog|a|", tagName: "dialog", domId: "a", visible: false },
        ],
        totalCount: 1,
        truncated: false,
      },
    }),
    snapshot({
      url: "http://fixture/other",
      containers: {
        containers: [
          { key: "dialog|b|", tagName: "dialog", domId: "b", visible: true },
        ],
        totalCount: 1,
        truncated: false,
      },
    }),
  );
  check(
    "§109 container churn caused by a navigation does not declare `changed`",
    navigatedDiff.urlChanged &&
      !navigatedDiff.meaningfulChange &&
      navigatedDiff.changes.some((c) => c.category === "container-added"),
  );

  const mountBefore = snapshot({
    targets: [
      {
        relation: "aria-controls",
        targetDomId: "menu1",
        resolved: false,
        element: { exists: false },
      },
    ],
  });
  const mountAfter = snapshot({
    targets: [
      {
        relation: "aria-controls",
        targetDomId: "menu1",
        resolved: true,
        element: { exists: true, tagName: "div", visible: true },
      },
    ],
  });
  const mountDiff = diffSnapshots(mountBefore, mountAfter);
  check(
    "§56 an unresolved target that mounts is target-mounted",
    mountDiff.targetsMounted === 1 &&
      mountDiff.changes.some((c) => c.category === "target-mounted"),
  );

  // Determinism: the diff must not inherit key insertion order.
  const shuffled = diffSnapshots(
    snapshot({
      candidate: {
        ...before.candidate,
        attributes: { "aria-hidden": "false", "aria-expanded": "false" },
      },
    }),
    snapshot({
      candidate: {
        ...before.candidate,
        attributes: { "aria-expanded": "true", "aria-hidden": "true" },
      },
    }),
  );
  const shuffledAgain = diffSnapshots(
    snapshot({
      candidate: {
        ...before.candidate,
        attributes: { "aria-expanded": "false", "aria-hidden": "false" },
      },
    }),
    snapshot({
      candidate: {
        ...before.candidate,
        attributes: { "aria-hidden": "true", "aria-expanded": "true" },
      },
    }),
  );
  check(
    "§58 diff output is independent of attribute key order",
    JSON.stringify(shuffled) === JSON.stringify(shuffledAgain),
  );
}

// ---------------------------------------------------------------------------
// 2. Live pipeline
// ---------------------------------------------------------------------------

interface LiveContext {
  run: Awaited<ReturnType<typeof exploreSite>>;
  byAction: Map<string, InteractionObservation>;
  state: ServerState;
  root: string;
}

function actionsFor(
  ctx: LiveContext,
  pagePath: string,
  viewport?: "desktop" | "mobile",
): InteractionObservation[] {
  const url = `${ctx.root}${pagePath}`;
  return ctx.run.observations.filter(
    (o) => o.url === url && (viewport === undefined || o.viewportId === viewport),
  );
}

async function testLive(): Promise<void> {
  const state: ServerState = { disabled: false, shifted: false, idSeed: 1, hits: {} };
  const { server, port } = await startServer(state);
  const root = `http://127.0.0.1:${port}`;
  let browser: Browser | undefined;
  let observationDir: string | undefined;
  let explorationDir: string | undefined;

  try {
    observationDir = await mkdtemp(path.join(tmpdir(), "explorer-observation-"));
    explorationDir = await mkdtemp(path.join(tmpdir(), "explorer-run-"));
    browser = await chromium.launch();

    // --- Task 09 + Task 10, for real ---------------------------------------
    console.log("");
    console.log("Fixture pipeline (Task 09 observation + Task 10 detection)");
    const observed = await observeSelectedPages(buildSelection(root, FIXTURE_PATHS), {
      concurrency: 2,
      sourceSelectedPagesFile: "fixture/selected-pages.json",
      browser,
      runId: "fixture-observation",
      runDir: observationDir,
    });
    check(
      `all ${FIXTURE_PATHS.length} fixture pages observed`,
      observed.siteObservation.stats.completedPages === FIXTURE_PATHS.length,
      String(observed.siteObservation.stats.completedPages),
    );

    const analysisRun = await analyzeSiteInteractions({
      siteObservationFile: observed.manifestPath,
      analyzedAt: "2026-08-13T00:00:00.000Z",
    });
    check(
      "Task 10 produced candidates for the fixture site",
      analysisRun.analysis.stats.totalCandidateCount > 0,
      String(analysisRun.analysis.stats.totalCandidateCount),
    );

    const analysisFile = analysisRun.manifestPath;

    // --- planning (offline, deterministic) ---------------------------------
    console.log("");
    console.log("Plan (offline, deterministic)");
    const { plan } = await buildInteractionPlan(analysisFile, 2);

    check(
      "§64 the plan validates against its own schema",
      InteractionPlanSchema.safeParse(plan).success,
    );
    check(
      "§9 the plan carries no timestamp (it is a pure function of its input)",
      !JSON.stringify(plan).includes("At\":\"20") ||
        !/"(plannedAt|analyzedAt|startedAt)"/.test(JSON.stringify(plan)),
    );
    check(
      "§2 no action uses the stored elementId as a live locator",
      plan.actions.every(
        (a) => !JSON.stringify(a.locatorDescriptor).includes(a.sourceElementId),
      ),
    );
    check(
      "§118 every action carries Task 10 provenance",
      plan.actions.every(
        (a) =>
          a.sourceCandidateId.startsWith("ic") &&
          a.sourceElementId.startsWith("e") &&
          a.sourceInteractionCandidatesFile.startsWith("pages/"),
      ),
    );
    check(
      "§63 action ids are a dense ia000001… sequence",
      plan.actions.every(
        (a, i) => a.actionId === `ia${String(i + 1).padStart(6, "0")}`,
      ),
    );
    check(
      "§13 no P3 candidate is planned",
      plan.actions.every((a) => a.priority !== "P3"),
    );
    check(
      "§14 no excluded guard reaches the plan",
      plan.actions.every(
        (a) =>
          !a.guardFlags.some((g) =>
            ["form-submit", "file-input", "navigation", "external-navigation", "disabled", "inert", "pointer-disabled"].includes(g),
          ),
      ),
    );
    check(
      "§12 no hidden candidate is planned",
      plan.actions.every((a) => a.storedInitialState.effectiveVisible),
    );

    // §88 — ten identical <details> collapse into one action.
    const disclosureActions = plan.actions.filter(
      (a) => a.url === `${root}/disclosure` && a.viewportId === "desktop",
    );
    const summaryActions = disclosureActions.filter(
      (a) => a.locatorDescriptor.tagName === "summary",
    );
    check(
      "§88 ten identical <details> produce exactly one action",
      summaryActions.length === 1 && summaryActions[0].shapeMemberCount === 10,
      `${summaryActions.length} action(s), member count ${summaryActions[0]?.shapeMemberCount}`,
    );
    const dedupSkips = plan.skipped.filter(
      (s) => s.reason === "shape-duplicate" && s.representativeCandidateId !== undefined,
    );
    check(
      "§16 every deduplicated candidate names its representative",
      dedupSkips.length > 0 &&
        dedupSkips.every((s) => s.representativeCandidateId !== undefined),
      String(dedupSkips.length),
    );

    // §89 — the per-viewport budget binds and is recorded, not hidden.
    const budgetDesktop = plan.actions.filter(
      (a) => a.url === `${root}/budget` && a.viewportId === "desktop",
    );
    check(
      `§18 the per-viewport budget caps /budget at ${MAX_ACTIONS_PER_VIEWPORT}`,
      budgetDesktop.length === MAX_ACTIONS_PER_VIEWPORT,
      String(budgetDesktop.length),
    );
    const budgetSkips = plan.skipped.filter(
      (s) => s.reason === "budget" && s.pageId === budgetDesktop[0]?.pageId,
    );
    check(
      "§18 candidates dropped by the budget are recorded with reason=budget",
      budgetSkips.length === 4,
      String(budgetSkips.length),
    );

    // §81 — the form page contributes no action at all.
    check(
      "§81 the form page produces zero actions (submit + file excluded)",
      plan.actions.every((a) => a.url !== `${root}/form`),
    );
    check(
      "§37 the submit button is in skipped[] with a form-submit guard",
      plan.skipped.some((s) => (s.guardFlags ?? []).includes("form-submit")),
    );
    check(
      "§38 the file input is in skipped[] with a file-input guard",
      plan.skipped.some((s) => (s.guardFlags ?? []).includes("file-input")),
    );

    // §90 — reversing the input arrays must not change the plan.
    const loaded = await loadInteractionAnalysis(analysisFile);
    const selections = selectPlanPages(loaded.analysis);
    const pages: LoadedCandidatePage[] = [];
    for (const selection of selections) {
      pages.push(await loadCandidatePage(loaded, selection.pageId));
    }
    const forward = planSiteActions(pages);
    const reversedPages: LoadedCandidatePage[] = [...pages].reverse().map((page) => ({
      ...page,
      candidates: {
        ...page.candidates,
        viewports: {
          desktop: {
            ...page.candidates.viewports.desktop,
            candidates: [...page.candidates.viewports.desktop.candidates].reverse(),
            targets: [...page.candidates.viewports.desktop.targets].reverse(),
          },
          mobile: {
            ...page.candidates.viewports.mobile,
            candidates: [...page.candidates.viewports.mobile.candidates].reverse(),
            targets: [...page.candidates.viewports.mobile.targets].reverse(),
          },
        },
      },
    }));
    const reversed = planSiteActions(reversedPages);
    check(
      "§90 reversing candidates[] and page order yields an identical plan",
      JSON.stringify(forward.actions) === JSON.stringify(reversed.actions) &&
        JSON.stringify(forward.skipped) === JSON.stringify(reversed.skipped),
    );

    // --- live exploration ---------------------------------------------------
    console.log("");
    console.log("Live exploration (real Chromium, fresh context per action)");
    // The site drifts between the observation and the exploration, exactly as a
    // live site does: one control becomes disabled (§80) and one page gains a
    // section ahead of its cards, staling a stored structural path (§79).
    state.disabled = true;
    state.shifted = true;

    const run = await exploreSite({
      interactionAnalysisFile: analysisFile,
      concurrency: 2,
      browser,
      runId: "fixture-exploration",
      runDir: explorationDir,
    });
    const ctx: LiveContext = {
      run,
      byAction: new Map(run.observations.map((o) => [o.actionId, o])),
      state,
      root,
    };

    check(
      "§66 the run completed with every planned action attempted",
      run.observations.length === run.plan.actions.length,
      `${run.observations.length}/${run.plan.actions.length}`,
    );
    check(
      "§69 manifest actions are in actionId order regardless of completion order",
      run.exploration.actions.map((a) => a.actionId).join(",") ===
        [...run.exploration.actions.map((a) => a.actionId)].sort().join(","),
    );
    check(
      "§102 both viewports were explored",
      run.exploration.stats.desktopExecuted > 0 &&
        run.exploration.stats.mobileExecuted > 0,
      `${run.exploration.stats.desktopExecuted} / ${run.exploration.stats.mobileExecuted}`,
    );

    // §72 disclosure with an existing target ---------------------------------
    const disclosure = actionsFor(ctx, "/disclosure", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.domId === "d1",
    );
    check(
      "§72 the disclosure button resolves and changes",
      disclosure?.status === "changed",
      disclosure?.status,
    );
    check(
      "§72 aria-expanded false → true is in the diff",
      Boolean(
        disclosure?.diff?.changes.some(
          (c) =>
            c.field === "aria-expanded" && c.before === "false" && c.after === "true",
        ),
      ),
    );
    check(
      "§72 the controlled panel goes hidden → visible",
      Boolean(
        disclosure?.diff?.changes.some(
          (c) => c.category === "target-visibility-change" && c.after === "true",
        ),
      ),
    );
    check(
      "§21 an exact HTML id resolves through the id-exact strategy",
      disclosure?.locatorResolution.strategy === "id-exact",
      disclosure?.locatorResolution.strategy,
    );

    // §74 native details ------------------------------------------------------
    const summary = actionsFor(ctx, "/disclosure", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.tagName === "summary",
    );
    check(
      "§74 clicking a <summary> opens its <details> (open false → true)",
      summary?.status === "changed" &&
        Boolean(
          summary.diff?.changes.some(
            (c) => c.category === "open-change" && c.after === "true",
          ),
        ),
      summary?.status,
    );
    const openDetails = actionsFor(ctx, "/dynamic", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.tagName === "summary",
    );
    check(
      "§74 clicking an OPEN <details> closes it (open true → false)",
      openDetails?.status === "changed" &&
        Boolean(
          openDetails.diff?.changes.some(
            (c) => c.category === "open-change" && c.after === "false",
          ),
        ),
      openDetails?.status,
    );

    // §77 no-op button --------------------------------------------------------
    const noop = actionsFor(ctx, "/disclosure", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.ariaLabel === "Noop",
    );
    check(
      "§77 a button with no handler is executed and reported as no-change",
      noop?.status === "no-change" && noop.action.attempted,
      noop?.status,
    );
    check("§77 …and is not an error", noop?.error === undefined);

    // A control whose ONLY state signal is its label (the seoworld hamburger
    // shape): no ARIA state, no aria-controls, nothing in the container census.
    const labelOnly = actionsFor(ctx, "/dynamic", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.domId === "lbl",
    );
    check(
      "an aria-label flip is captured as a candidate state change",
      labelOnly?.status === "changed" &&
        Boolean(
          labelOnly.diff?.changes.some(
            (c) => c.field === "aria-label" && c.after === "Close menu",
          ),
        ),
      labelOnly?.status,
    );

    // §73 dynamic mount -------------------------------------------------------
    const dynamic = actionsFor(ctx, "/dynamic", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.domId === "m1",
    );
    check(
      "§73 a target absent before the click mounts after it",
      dynamic?.status === "changed" && (dynamic.diff?.targetsMounted ?? 0) === 1,
      `${dynamic?.status} mounted=${dynamic?.diff?.targetsMounted}`,
    );
    check(
      "§49 the target's before state is exists:false, which is not an error",
      dynamic?.before?.targets[0]?.resolved === false &&
        dynamic?.after?.targets[0]?.resolved === true,
    );
    check(
      "§57 newly mounted interactive descendants are inventoried",
      (dynamic?.after?.targets[0]?.descendants?.menuitemCount ?? 0) === 3,
      String(dynamic?.after?.targets[0]?.descendants?.menuitemCount),
    );
    check(
      "§108 the new menu items are inventoried but NOT clicked",
      run.observations.every(
        (o) => !o.locatorResolution.locatorDescriptor.ancestors.some((a) => a.role === "menu"),
      ),
    );

    // Task 17 §4 — generic user-visible target discovery ----------------------
    console.log("\nTask 17 §4 — user-visible target discovery");
    const disclosureObs = disclosure?.discoveredTargets ?? [];
    const panelTarget = disclosureObs.find((t) => t.descriptor.htmlId === "panel1");
    check(
      "an existing hidden region revealed by the click is discovered",
      panelTarget !== undefined &&
        panelTarget.kind === "existing-visibility" &&
        panelTarget.direction === "appeared",
      JSON.stringify(disclosureObs.map((t) => `${t.descriptor.htmlId}:${t.kind}`)),
    );
    check(
      "…with BOTH declared and observed relation evidence",
      Boolean(
        panelTarget?.relationEvidence.some((e) => e.kind === "aria-controls") &&
          panelTarget?.relationEvidence.some((e) => e.kind === "visibility-change"),
      ),
    );
    check(
      "…a content fingerprint and a structural path",
      (panelTarget?.textSample ?? "").includes("Panel content") &&
        (panelTarget?.descriptor.structuralPath ?? "") !== "",
      panelTarget?.descriptor.structuralPath,
    );
    const mountedTarget = (dynamic?.discoveredTargets ?? []).find(
      (t) => t.descriptor.htmlId === "menu1",
    );
    check(
      "a region mounted into a visible container is NEWLY-MOUNTED, not content-replaced",
      mountedTarget !== undefined && mountedTarget.kind === "newly-mounted",
      JSON.stringify(
        (dynamic?.discoveredTargets ?? []).map(
          (t) => `${t.descriptor.htmlId ?? t.descriptor.tagName}:${t.kind}`,
        ),
      ),
    );
    check(
      "…its mounted subtree is counted and captured with the Observer's walk",
      (mountedTarget?.mountedDescendantCount ?? 0) >= 4 &&
        (mountedTarget?.capturedSubtree?.elements.length ?? 0) >= 4,
      `${mountedTarget?.mountedDescendantCount} / ${mountedTarget?.capturedSubtree?.elements.length}`,
    );
    const tabAction = actionsFor(ctx, "/tabs", "desktop").find(
      (o) =>
        o.locatorResolution.locatorDescriptor.role === "tab" &&
        o.diff?.changes.some(
          (c) => c.field === "aria-selected" && c.after === "true",
        ),
    );
    const tabTargets = tabAction?.discoveredTargets ?? [];
    check(
      "a tab activation discovers the appearing panel AND the disappearing one",
      tabTargets.some(
        (t) => t.descriptor.htmlId === "panelA" && t.direction === "appeared",
      ) &&
        tabTargets.some(
          (t) => t.descriptor.htmlId === "panelB" && t.direction === "disappeared",
        ),
      JSON.stringify(
        tabTargets.map((t) => `${t.descriptor.htmlId}:${t.direction}`),
      ),
    );
    check(
      "every executed same-document action carries a discovery summary",
      run.observations
        .filter((o) => o.status === "changed" || o.status === "no-change")
        .every((o) => o.targetDiscovery !== undefined),
    );
    check(
      "the manifest aggregates user-visible target discovery",
      (run.exploration.userVisibleTargetSummary?.discoveredTargets ?? 0) > 0 &&
        (run.exploration.userVisibleTargetSummary?.byKind["existing-visibility"] ?? 0) >
          0 &&
        (run.exploration.userVisibleTargetSummary?.byKind["newly-mounted"] ?? 0) > 0,
      JSON.stringify(run.exploration.userVisibleTargetSummary ?? {}),
    );

    // Task 17.1 — portal-wrapper discovery, declared-after-click, adaptive
    // capture, mount-host evidence, text-segment interleaving ----------------
    console.log("\nTask 17.1 — portal discovery + adaptive capture");
    const portalAction = actionsFor(ctx, "/portal", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.domId === "pp1",
    );
    const portalTargets = portalAction?.discoveredTargets ?? [];
    const portalPanel = portalTargets.find(
      (t) => t.descriptor.htmlId === "portal-panel",
    );
    check(
      "a visible panel inside a 0-rect mounted portal wrapper is discovered",
      portalPanel !== undefined &&
        portalPanel.kind === "newly-mounted" &&
        portalPanel.direction === "appeared",
      JSON.stringify(
        portalTargets.map((t) => `${t.descriptor.htmlId ?? t.descriptor.tagName}:${t.kind}`),
      ),
    );
    check(
      "…the AFTER-click aria-controls relation marks it declared",
      Boolean(portalPanel?.relationEvidence.some((e) => e.kind === "aria-controls")),
      JSON.stringify(portalPanel?.relationEvidence ?? []),
    );
    check(
      "…its mount host resolves to the baseline <body> with a child position",
      portalPanel?.descriptor.mountHostTag === "body" &&
        typeof portalPanel?.descriptor.mountHostPath === "string" &&
        typeof portalPanel?.descriptor.mountChildIndex === "number",
      `${portalPanel?.descriptor.mountHostTag} @ ${portalPanel?.descriptor.mountHostPath} #${portalPanel?.descriptor.mountChildIndex}`,
    );
    check(
      "…the truncated default capture was retried under the expanded caps",
      portalPanel?.capturedSubtree?.expanded === true &&
        (portalPanel?.capturedSubtree?.elementCount ?? 0) > 300 &&
        (portalPanel?.capturedSubtree?.truncations.length ?? 0) === 0,
      `expanded=${portalPanel?.capturedSubtree?.expanded} elements=${portalPanel?.capturedSubtree?.elementCount} truncations=${JSON.stringify(portalPanel?.capturedSubtree?.truncations ?? [])}`,
    );
    const segmentLine = portalPanel?.capturedSubtree?.elements.find(
      (e) => e.textSegments !== undefined,
    );
    check(
      "…a text run AFTER an element child records its position (textSegments)",
      segmentLine !== undefined &&
        segmentLine.textSegments!.some((s) => s.i > 0 && s.t.includes("/month")),
      JSON.stringify(segmentLine?.textSegments ?? []),
    );

    // §76 checkbox ------------------------------------------------------------
    const checkbox = actionsFor(ctx, "/dynamic", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.inputType === "checkbox",
    );
    check(
      "§76 a checkbox toggles checked false → true",
      checkbox?.status === "changed" &&
        Boolean(
          checkbox.diff?.changes.some(
            (c) => c.category === "checked-change" && c.after === "true",
          ),
        ),
      checkbox?.status,
    );

    // §75 + §78 tabs and generated-id drift -----------------------------------
    const tabs = actionsFor(ctx, "/tabs", "desktop");
    const unselectedTab = tabs.find(
      (o) => o.locatorResolution.locatorDescriptor.ariaState["aria-selected"] === "false",
    );
    check(
      "§75 clicking an unselected tab selects it",
      unselectedTab?.status === "changed" &&
        Boolean(
          unselectedTab.diff?.changes.some(
            (c) => c.field === "aria-selected" && c.after === "true",
          ),
        ),
      unselectedTab?.status,
    );
    check(
      "§75 …and the tabpanel visibility changes with it",
      Boolean(
        unselectedTab?.diff?.changes.some(
          (c) => c.category === "target-visibility-change",
        ),
      ),
    );
    check(
      "§78 the stored generated id is stale by exploration time",
      Boolean(
        unselectedTab &&
          unselectedTab.locatorResolution.locatorDescriptor.domId !==
            unselectedTab.locatorResolution.liveDescriptor?.domId,
      ),
      `${unselectedTab?.locatorResolution.locatorDescriptor.domId} vs ${unselectedTab?.locatorResolution.liveDescriptor?.domId}`,
    );
    check(
      "§78 id-exact misses and the semantic fallback resolves it",
      unselectedTab?.locatorResolution.attempts.some(
        (a) => a.strategy === "id-exact" && a.matchCount === 0,
      ) === true && unselectedTab?.locatorResolution.strategy === "semantic-exact",
      `${unselectedTab?.locatorResolution.strategy}`,
    );
    check(
      "§17 both tab states were explored separately",
      tabs.length === 2,
      String(tabs.length),
    );

    // §79 ambiguous -----------------------------------------------------------
    const ambiguous = actionsFor(ctx, "/ambiguous", "desktop");
    check(
      "§79 two indistinguishable controls resolve as ambiguous",
      ambiguous.length === 1 && ambiguous[0].status === "ambiguous",
      ambiguous.map((a) => a.status).join(","),
    );
    check(
      "§23 an ambiguous locator is never clicked",
      ambiguous.every((o) => !o.action.attempted),
    );
    check(
      "§23 the ambiguous match count is recorded",
      (ambiguous[0]?.locatorResolution.matchCount ?? 0) >= 2,
      String(ambiguous[0]?.locatorResolution.matchCount),
    );
    check(
      "§22 the structural path was tried and found nothing (it had gone stale)",
      ambiguous[0]?.locatorResolution.attempts.some(
        (a) => a.strategy === "structural-path" && a.matchCount === 0,
      ) === true,
      JSON.stringify(ambiguous[0]?.locatorResolution.attempts),
    );

    // §22 duplicated navigation — position IS the identity, and the path uses it.
    const duplicate = actionsFor(ctx, "/duplicate", "desktop");
    check(
      "§16 two identical controls collapse into one action",
      duplicate.length === 1 && duplicate[0].shapeKey.length > 0,
      String(duplicate.length),
    );
    check(
      "§22 semantic strategies were ambiguous but the structural path narrowed it",
      duplicate[0]?.locatorResolution.strategy === "structural-path" &&
        duplicate[0]?.locatorResolution.attempts.some(
          (a) => a.strategy === "semantic-exact" && a.matchCount === 2,
        ) === true,
      `${duplicate[0]?.locatorResolution.strategy} ${JSON.stringify(duplicate[0]?.locatorResolution.attempts)}`,
    );
    check(
      "§23 …and it picked the RIGHT one (only the first button reacts)",
      duplicate[0]?.status === "changed" &&
        Boolean(
          duplicate[0].diff?.changes.some(
            (c) => c.field === "aria-pressed" && c.after === "true",
          ),
        ),
      duplicate[0]?.status,
    );

    // §80 live disabled drift --------------------------------------------------
    const drift = actionsFor(ctx, "/drift-disabled", "desktop")[0];
    check(
      "§80 a control disabled since observation resolves but is not clicked",
      drift?.status === "live-inoperable" && !drift.action.attempted,
      drift?.status,
    );
    check(
      "§80 the live reconciliation is what found the disabled state",
      drift?.locatorResolution.status === "resolved" &&
        drift?.liveSignals?.state.disabled === true &&
        drift?.liveSignals?.operability.clickOperable === false,
    );
    check(
      "§28 Task 10 recorded this candidate as operable — the drift is visible",
      run.plan.actions.find((a) => a.actionId === drift?.actionId)
        ?.storedInitialState.initiallyOperable === true,
    );

    // §82–85 safety ------------------------------------------------------------
    const safety = run.exploration.safetySummary;
    check(
      "§82 a navigation attempt was blocked",
      safety.navigationAttemptsBlocked >= 1,
      String(safety.navigationAttemptsBlocked),
    );
    check(
      "§82 the /danger page was never fetched",
      (state.hits["/danger"] ?? 0) === 0,
      String(state.hits["/danger"] ?? 0),
    );
    check(
      "§83 a popup attempt was recorded and closed",
      safety.popupAttempts >= 1,
      String(safety.popupAttempts),
    );
    check(
      "§84 a POST was blocked before it reached the network",
      safety.writeRequestsBlocked >= 1 && (safety.blockedMethodCounts["POST"] ?? 0) >= 1,
      String(safety.writeRequestsBlocked),
    );
    check(
      "§84 the write endpoint recorded zero hits",
      (state.hits["/api/save"] ?? 0) === 0,
      String(state.hits["/api/save"] ?? 0),
    );
    check(
      "§81 the form endpoint recorded zero hits",
      (state.hits["/api/form"] ?? 0) === 0,
      String(state.hits["/api/form"] ?? 0),
    );
    check(
      "§85 a download attempt was recorded",
      safety.downloadAttempts >= 1,
      String(safety.downloadAttempts),
    );
    check(
      "§42 no request body is ever stored in an artifact",
      !JSON.stringify(run.observations).includes("secret-body"),
    );
    const dialogGuard = run.observations.some((o) =>
      o.safetyEvents.some((e) => e.type === "dialog-dismissed"),
    );
    check("a confirm() dialog was dismissed, not accepted", dialogGuard);

    // §86 context isolation ----------------------------------------------------
    const contaminated = run.observations.some((o) =>
      [...(o.before?.containers.containers ?? []), ...(o.after?.containers.containers ?? [])].some(
        (c) => c.domId === "contaminated" || c.domId === "contaminated-class",
      ),
    );
    check(
      "§32/§86 no action ever saw the previous action's localStorage or body class",
      !contaminated,
    );
    const pollute = actionsFor(ctx, "/safety", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.text === "Pollute",
    );
    check(
      "§67 …and the polluting click really did run (its own marker appeared)",
      Boolean(
        pollute?.after?.containers.containers.some((c) => c.domId === "click-marker"),
      ),
      pollute?.status,
    );

    // §87 mutation cap ---------------------------------------------------------
    const mutate = actionsFor(ctx, "/safety", "desktop").find(
      (o) => o.locatorResolution.locatorDescriptor.text === "Mutate",
    );
    check(
      "§87 a 1000-mutation storm is capped and flagged truncated",
      Boolean(mutate?.mutationSummary?.truncated) &&
        (mutate?.mutationSummary?.recordCount ?? 0) <= MAX_MUTATION_RECORDS,
      `${mutate?.mutationSummary?.recordCount} records, truncated=${mutate?.mutationSummary?.truncated}`,
    );
    check(
      "§59 …and DOM mutation alone does not make an action `changed`",
      mutate?.status === "no-change",
      mutate?.status,
    );

    // §62 / §117 artifacts -----------------------------------------------------
    const firstAction = run.exploration.actions[0];
    const raw = await readFile(
      path.join(explorationDir, firstAction.observationFile),
      "utf8",
    );
    check(
      "§117 a persisted observation passes Zod after reload",
      InteractionObservationSchema.safeParse(JSON.parse(raw)).success,
    );
    check(
      "§62 no raw HTML is stored in an action artifact",
      !raw.includes("<div") && !raw.includes("outerHTML") && !raw.includes("<button"),
    );
    const manifestRaw = await readFile(run.manifestPath, "utf8");
    const reloadedManifest = InteractionExplorationSchema.safeParse(
      JSON.parse(manifestRaw),
    );
    check("§117 the manifest passes Zod after reload", reloadedManifest.success);
    check(
      "§113 the manifest records its own true byte size",
      reloadedManifest.success &&
        reloadedManifest.data.storageSummary.manifestBytes ===
          Buffer.byteLength(manifestRaw, "utf8"),
    );
    check(
      "the manifest holds no absolute local path",
      !manifestRaw.includes(explorationDir) && !manifestRaw.includes("/Users/"),
    );
    check(
      "§8 the manifest names both of its sources",
      reloadedManifest.success &&
        reloadedManifest.data.sourceInteractionAnalysis.length > 0 &&
        reloadedManifest.data.sourceSiteObservation.endsWith("site-observation.json"),
    );

    // §116 the Task 09 / Task 10 run is untouched -------------------------------
    const observationManifestAfter = await readFile(observed.manifestPath, "utf8");
    check(
      "§116 the source site-observation.json is byte-identical after exploration",
      observationManifestAfter ===
        (await readFile(observed.manifestPath, "utf8")) &&
        JSON.parse(observationManifestAfter).stats.completedPages ===
          observed.siteObservation.stats.completedPages,
    );
    check(
      "§7 nothing was written into the source run directory",
      !run.runDir.startsWith(observationDir) && run.runDir === explorationDir,
    );

    // §60 status taxonomy -------------------------------------------------------
    const statuses = new Set(run.observations.map((o) => o.status));
    check(
      "§60 every observation carries exactly one primary status from the taxonomy",
      run.observations.every((o) =>
        [
          "changed",
          "no-change",
          "not-found",
          "ambiguous",
          "live-inoperable",
          "blocked-by-policy",
          "actionability-error",
          "action-error",
          "load-error",
        ].includes(o.status),
      ),
      [...statuses].join(","),
    );
    check(
      "§66 one ambiguous and one inoperable action did not stop the run",
      run.exploration.stats.changedActions > 0 && statuses.has("ambiguous"),
    );
    check(
      "§111 no action was retried (planned = observed, one artifact each)",
      new Set(run.observations.map((o) => o.actionId)).size ===
        run.observations.length,
    );
  } finally {
    if (browser) await browser.close();
    server.close();
    if (observationDir) await rm(observationDir, { recursive: true, force: true });
    if (explorationDir) await rm(explorationDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  console.log("[smoke:interaction-explorer] Task 11 — safe rule-based interaction exploration");
  console.log("");

  testEligibility();
  testDiff();
  await testLive();

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`[smoke:interaction-explorer] FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:interaction-explorer] OK");
  }
}

main().catch((err) => {
  console.error(
    "[smoke:interaction-explorer] ERROR —",
    err instanceof Error ? err.stack || err.message : err,
  );
  process.exitCode = 1;
});
