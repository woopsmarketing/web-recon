import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ATTR_WHITELIST as OBSERVER_ATTR_WHITELIST,
  DESKTOP_PROFILE,
  MOBILE_PROFILE,
  SCHEMA_VERSION as OBSERVER_SCHEMA_VERSION,
  TEXT_MAX_LEN,
  type AssetObservation,
  type ElementObservation,
  type MatchedLayoutRule,
  type PageObservation,
  type StyleTable,
  type ViewportId,
  type ViewportObservation,
} from "../src/observer/types.js";
import {
  SCHEMA_VERSION as MULTI_SCHEMA_VERSION,
  type ObservedSitePage,
  type SiteObservation,
} from "../src/multi-observer/types.js";
import {
  SCHEMA_VERSION as SELECTOR_SCHEMA_VERSION,
  type PageFamily,
  type PageFamilySet,
  type PageSelection,
} from "../src/selector/types.js";
import {
  SCHEMA_VERSION as VERIFIER_SCHEMA_VERSION,
  type VerifiedUrlSet,
} from "../src/verifier/types.js";
import {
  SCHEMA_VERSION as EXPLORER_SCHEMA_VERSION,
  type InteractionExploration,
} from "../src/interaction-explorer/types.js";
import {
  REGISTRY_VERSION,
  SCHEMA_VERSION as PATTERN_SCHEMA_VERSION,
  type InteractionPatternInstance,
  type InteractionPatternsArtifact,
  type UnknownInteractionCase,
  type UnknownInteractionsArtifact,
} from "../src/interaction-patterns/types.js";
import {
  AI_PROMOTION_POLICY,
  AI_SCHEMA_VERSION,
  type AiAnalysisArtifact,
} from "../src/interaction-patterns/ai/types.js";
import {
  alignRenderedHtml,
  assertSiteSpecValid,
  assertSupplementalAttributePolicy,
  canonicalStyleKey,
  compileAttributes,
  compileSiteSpec,
  computeProbeAttachment,
  PROBE_PREFIX_MIN_ELEMENTS,
  loadInputs,
  loadSiteSpec,
  sanitizeSvgMarkup,
  saveSiteSpec,
  SCHEMA_VERSION,
  SiteSpecLoadError,
  summarizeSiteSpec,
  SUPPLEMENTAL_ATTRIBUTES,
  SUPPLEMENTAL_ATTRIBUTE_NAMES,
  SUPPLEMENTAL_DENIED_PREFIXES,
  SUPPLEMENTAL_DENYLIST,
  validateSiteSpec,
  type ElementSpecNode,
  type PageSpec,
  type SpecNode,
} from "../src/sitespec/index.js";

/**
 * Local deterministic fixture test for the SiteSpec Compiler (Task 13, items
 * 79–97, 125).
 *
 * Completely offline: **no HTTP server, no Playwright, no network, no browser,
 * no AI**. Task 13 is offline deterministic processing over files, so the
 * fixture's job is to produce a REALISTIC Task 06→12 run on disk and then check
 * what the compiler makes of it. Everything is written through the real upstream
 * zod schemas, so a fixture cannot describe a pipeline state that could not
 * actually occur.
 *
 * The `dom.json` files are hand-authored rather than derived from the fixture
 * HTML on purpose. If the fixture built the element list with the compiler's own
 * traversal, the alignment check would be testing itself; written by hand, it is
 * an independent statement of what the Task 03/04 Observer would have recorded,
 * and a divergence in the skip policy or the inline-SVG rule shows up as a real
 * failure.
 *
 * The cases are the ones that are easy to get wrong:
 *  - `<p>Hello <strong>world</strong> !</p>`, whose child ORDER no Task 09
 *    artifact records
 *  - a paragraph past the Observer's 200-character cap
 *  - `<pre>`, where whitespace is the design
 *  - an inline `<svg>` carrying a `<script>` and an `onload`
 *  - a page whose rendered.html and dom.json genuinely disagree
 *  - a confident, well-formed, fake AI artifact sitting right next to the inputs
 */

// ---------------------------------------------------------------------------
// Tiny check harness (same shape as the other smoke tests)
// ---------------------------------------------------------------------------

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
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

const ROOT_URL = "https://fixture.test";
const URL_HOME = `${ROOT_URL}/`;
const URL_A = `${ROOT_URL}/a`;
const URL_A2 = `${ROOT_URL}/a2`;
const URL_A3 = `${ROOT_URL}/a3`;
const URL_A4 = `${ROOT_URL}/a4`;
const URL_BROKEN = `${ROOT_URL}/broken`;

const OBSERVED_AT = "2026-08-13T10:00:00.000Z";

/** 250 characters — comfortably past the Observer's 200-character cap. */
const LONG_TEXT =
  "The quick brown fox jumps over the lazy dog while the observer records only the first two hundred characters of this paragraph, which is exactly the failure this compiler exists to repair by re-reading the rendered document instead. Extra tail text.";

const PRE_TEXT = "line 1\n    line 2\n";

/**
 * Task 13.1 fixtures §22–§27, appended to the home page's `<main>`.
 *
 * Everything here exercises the SUPPLEMENTAL channel, so the pattern is always
 * the same: the attribute exists in this markup and is deliberately absent from
 * the hand-written `dom.json` below, because that is exactly the shape of the
 * real gap — the Observer's whitelist never captured any of these.
 *
 * The last block is the attack: one `<form>` whose action, `formaction`,
 * `formmethod`, `formenctype`, `class`, `style`, `data-*`, `onclick`,
 * `javascript:` href, `download` and hidden-input `value` all appear ONLY here,
 * never in `dom.json`. If any of them reaches the IR, the only possible source
 * is this new channel — which is the whole point of testing it this way.
 */
const WIDGETS_HTML =
  '<table id="grid"><thead><tr>' +
  '<th id="h1" scope="col" colspan="2" aria-label="parsed-value">Header</th>' +
  "</tr></thead><tbody><tr>" +
  '<td id="c1" rowspan="2">A</td><td id="c2" colspan="2">B</td>' +
  "</tr></tbody></table>\n" +
  '<details id="acc" open><summary id="acc-sum">Open me</summary><p id="acc-body">Body</p></details>\n' +
  '<button id="dis" disabled="disabled">Disabled</button>\n' +
  '<input id="ro" type="text" value="fixed" readonly>\n' +
  '<input id="chk" type="checkbox" checked="">\n' +
  '<select id="sel" multiple><option id="o1" selected>A</option><option id="o2">B</option></select>\n' +
  '<input id="num" type="number" min="1" max="10" step="0.5" minlength="1" maxlength="4" pattern="[0-9.]+" required autofocus>\n' +
  '<input id="up" type="file" accept="image/png">\n' +
  '<div id="editor" contenteditable="plaintext-only" spellcheck="false">Type here</div>\n' +
  '<div id="untilfound" hidden="until-found">Findable</div>\n' +
  '<ol id="ol" start="3" reversed><li id="li1">one</li></ol>\n' +
  '<time id="when" datetime="2026-08-14T09:00">Aug 14</time>\n' +
  '<button id="pop-btn" popovertarget="pop" popovertargetaction="toggle">Open</button>\n' +
  '<div id="pop" popover="auto">Popover body</div>\n' +
  '<button id="pop-missing" popovertarget="ghost">Ghost</button>\n' +
  '<form id="attack" action="https://original.example/save" method="post" enctype="multipart/form-data">' +
  '<input id="atk-hidden" type="hidden" value="SUPPLEMENTAL-SECRET">' +
  '<button id="atk-btn" formaction="https://original.example/delete" formmethod="post"' +
  ' formenctype="text/plain" class="secret" style="color:red" data-secret="ATTACK-PAYLOAD"' +
  ' onclick="steal()" disabled>Delete</button>' +
  '<a id="atk-link" href="javascript:alert(1)" download="x.txt">go</a>' +
  "</form>\n";

const SVG_MARKUP =
  '<svg id="logo" viewBox="0 0 10 10" onload="boom()">' +
  "<g><circle cx=\"5\" cy=\"5\" r=\"4\"></circle></g>" +
  '<script>fetch("https://evil.test")</script>' +
  '<a href="javascript:alert(1)"><rect width="2" height="2"></rect></a>' +
  "</svg>";

/**
 * The home page's rendered DOM.
 *
 * Deliberately contains every noise element the Observer skips (`<head>` and its
 * children, `<script>`, `<style>`, `<noscript>`, `<template>`) plus an inline
 * `<svg>` whose subtree must stay opaque, so alignment only succeeds if the
 * compiler reproduces the Observer's traversal exactly.
 */
const HOME_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  "<title>Fixture Home</title><style>.x{color:red}</style>" +
  '<script>var a=1;</script><link rel="stylesheet" href="/s.css"></head>' +
  '<body class="theme-dark" data-secret="TOP-SECRET">\n' +
  '<header id="site-header"><h1>Fixture <em>Home</em></h1></header>\n' +
  "<main>\n" +
  `<p id="mixed">Hello <strong>world</strong> !</p>\n` +
  `<p id="long">${LONG_TEXT}</p>\n` +
  `<pre id="pre">${PRE_TEXT}</pre>\n` +
  SVG_MARKUP +
  "\n" +
  '<button id="trigger" aria-expanded="false" aria-controls="panel" onclick="go()" class="btn" data-state="closed">Toggle</button>\n' +
  '<div id="panel" role="region" aria-labelledby="trigger" hidden>Panel body</div>\n' +
  '<button id="menu-trigger" aria-haspopup="menu" aria-controls="dynamic-menu">Menu</button>\n' +
  '<form id="signup" action="https://fixture.test/api/subscribe" method="post">\n' +
  '<label for="email">Email</label>\n' +
  '<input id="email" name="email" type="email" value="a@b.c" placeholder="you@example.com">\n' +
  '<input id="pw" name="password" type="password">\n' +
  '<input id="tok" name="token" type="hidden">\n' +
  '<button type="submit">Sign up</button>\n' +
  "</form>\n" +
  '<a id="jump" href="#panel">Jump</a>\n' +
  '<a id="js" href="javascript:doThing()">JS link</a>\n' +
  '<img id="pic" src="/img/a.png" srcset="/img/a@2x.png 2x" alt="A picture" width="100" height="50">\n' +
  WIDGETS_HTML +
  "<noscript><p>no js</p></noscript>\n" +
  '<template id="tpl"><p>tpl</p></template>\n' +
  "</main>\n</body></html>";

/** Two shared style maps, reused across pages AND viewports (item 85). */
const STYLE_BLOCK: Record<string, string> = {
  display: "block",
  color: "rgb(17, 17, 17)",
  "font-family": "Inter, sans-serif",
  "font-size": "16px",
};
const STYLE_INLINE: Record<string, string> = {
  display: "inline",
  color: "rgb(0, 0, 238)",
  "font-family": "Inter, sans-serif",
  "font-size": "16px",
};
const STYLE_PSEUDO: Record<string, string> = { content: '"→"', display: "inline" };

const SHARED_STYLE_TABLE: StyleTable = {
  s000001: STYLE_BLOCK,
  s000002: STYLE_INLINE,
  s000003: STYLE_PSEUDO,
};

interface ElementSpec {
  tag: string;
  parent?: string;
  attrs?: Record<string, string>;
  text?: string;
  styleId?: string;
  pseudo?: boolean;
  hidden?: boolean;
  /**
   * Task 28.6 W3 — the Observer's matched authored declarations, verbatim.
   *
   * Present so that the OBSERVATION → `ViewportPageSpec.authoredBreakpoints`
   * path is exercised by the real compiler on the real fixture. Before this the
   * fixture carried zero `layoutRules` anywhere, so `compileSiteSpec` could
   * never produce the field and deleting the line that writes it left the suite
   * green: the histogram was unit-tested and integration-blind.
   */
  layoutRules?: MatchedLayoutRule[];
  /** …and the Observer's own per-node truncation flag, which is not the same as absence. */
  layoutRulesTruncated?: boolean;
}

/** Build a dom.json array from a compact hand-written element list. */
function buildDom(specs: readonly ElementSpec[]): ElementObservation[] {
  return specs.map((spec, index) => {
    const id = `e${String(index + 1).padStart(6, "0")}`;
    const element: ElementObservation = {
      id,
      ...(spec.parent ? { parentId: spec.parent } : {}),
      tagName: spec.tag,
      ...(spec.text !== undefined
        ? { text: spec.text.length > TEXT_MAX_LEN ? spec.text.slice(0, TEXT_MAX_LEN) : spec.text }
        : {}),
      attributes: spec.attrs ?? {},
      localVisible: !spec.hidden,
      effectiveVisible: !spec.hidden,
      boundingBox: {
        x: 0,
        y: index * 10,
        width: 100,
        height: 10,
        top: index * 10,
        right: 100,
        bottom: index * 10 + 10,
        left: 0,
      },
      styleId: spec.styleId ?? "s000001",
      ...(spec.pseudo ? { pseudo: { before: { content: '"→"', styleId: "s000003" } } } : {}),
      ...(spec.layoutRules ? { layoutRules: spec.layoutRules } : {}),
      ...(spec.layoutRulesTruncated ? { layoutRulesTruncated: true } : {}),
    };
    return element;
  });
}

const norm = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * The home page's elements, in the order the Observer's walk would emit them:
 * `<head>` and its children skipped, `<noscript>` / `<template>` skipped, and
 * the inline `<svg>` recorded as one opaque node with no descendants.
 */
/**
 * Task 28.6 W3 — the authored declarations the home fixture's Observer matched.
 *
 * Hand-written to make the BOUNDARY ADJACENCY invariant testable end to end,
 * because it is the property a band-edge snapper depends on and no fixture
 * exercised it:
 *
 *   `(max-width: 1024px)`  breakpointPx 1024, kind max, boundary {1024, 1025}
 *   `(min-width: 1025px)`  breakpointPx 1025, kind min, boundary {1024, 1025}
 *
 * Two spellings of ONE authored change, one pixel apart in `entries` and one
 * row in `boundaries`. The corpus on disk really does spell it both ways —
 * `(max-width: 899px)` beside `(min-width: 900px)` on stripe.com, 3,382 and
 * 46,250 declarations respectively — so this is the observed shape, not an
 * invented one.
 *
 * The rest of the block covers the accounting rules on the same path: an
 * `@container`-gated `@media` (skipped, counted), a bare unconditional
 * declaration, and a node whose list the Observer truncated.
 */
const HEADER_LAYOUT_RULES: MatchedLayoutRule[] = [
  { property: "display", value: "block", selector: "#site-header", media: "(max-width: 1024px)" },
  { property: "padding", value: "8px", selector: "#site-header", media: "(max-width: 1024px)" },
  { property: "margin", value: "0", selector: "#site-header", media: "(max-width: 1024px)" },
];
const H1_LAYOUT_RULES: MatchedLayoutRule[] = [
  { property: "display", value: "flex", selector: "h1", media: "(min-width: 1025px)" },
  { property: "gap", value: "16px", selector: "h1", media: "(min-width: 1025px)" },
];
const MAIN_LAYOUT_RULES: MatchedLayoutRule[] = [
  // A third, unrelated boundary so the fold is not a single-boundary special case.
  { property: "width", value: "100%", selector: "main", media: "(max-width: 640px)" },
  // Rule 1: an `@media` inside an `@container` gates on an element box, not the
  // window. Skipped from the histogram and counted in
  // `containerGatedSkippedDeclarations`.
  {
    property: "grid-template-columns",
    value: "1fr",
    selector: "main",
    media: "(min-width: 900px)",
    container: "(min-width: 400px)",
  },
  // Rule 2: no gate of any kind — the only genuinely unconditional shape.
  { property: "box-sizing", value: "border-box", selector: "main" },
];

const HOME_ELEMENTS: ElementSpec[] = [
  { tag: "html", attrs: { lang: "en" } }, // e000001
  { tag: "body", parent: "e000001", attrs: { class: "theme-dark", "data-secret": "TOP-SECRET" } }, // e000002
  {
    tag: "header",
    parent: "e000002",
    attrs: { id: "site-header" },
    layoutRules: HEADER_LAYOUT_RULES,
  }, // e000003
  { tag: "h1", parent: "e000003", text: "Fixture", layoutRules: H1_LAYOUT_RULES }, // e000004
  { tag: "em", parent: "e000004", text: "Home", styleId: "s000002", layoutRulesTruncated: true }, // e000005
  { tag: "main", parent: "e000002", layoutRules: MAIN_LAYOUT_RULES }, // e000006
  { tag: "p", parent: "e000006", attrs: { id: "mixed" }, text: norm("Hello  !") }, // e000007
  { tag: "strong", parent: "e000007", text: "world", styleId: "s000002" }, // e000008
  { tag: "p", parent: "e000006", attrs: { id: "long" }, text: LONG_TEXT }, // e000009
  { tag: "pre", parent: "e000006", attrs: { id: "pre" }, text: norm(PRE_TEXT) }, // e000010
  { tag: "svg", parent: "e000006", attrs: { id: "logo" } }, // e000011 (opaque)
  {
    tag: "button",
    parent: "e000006",
    attrs: {
      id: "trigger",
      "aria-expanded": "false",
      "aria-controls": "panel",
      onclick: "go()",
      class: "btn",
      "data-state": "closed",
    },
    text: "Toggle",
  }, // e000012
  {
    tag: "div",
    parent: "e000006",
    attrs: { id: "panel", role: "region", "aria-labelledby": "trigger" },
    text: "Panel body",
    hidden: true,
  }, // e000013
  {
    tag: "button",
    parent: "e000006",
    attrs: { id: "menu-trigger", "aria-haspopup": "menu", "aria-controls": "dynamic-menu" },
    text: "Menu",
  }, // e000014
  { tag: "form", parent: "e000006", attrs: { id: "signup" } }, // e000015
  { tag: "label", parent: "e000015", attrs: { for: "email" }, text: "Email" }, // e000016
  {
    tag: "input",
    parent: "e000015",
    attrs: {
      id: "email",
      name: "email",
      type: "email",
      value: "a@b.c",
      placeholder: "you@example.com",
    },
  }, // e000017
  // A password/hidden `value` the Observer would never have recorded — present
  // here so the SiteSpec's own policy is what is being tested, not the Observer's.
  { tag: "input", parent: "e000015", attrs: { id: "pw", name: "password", type: "password", value: "hunter2" } }, // e000018
  { tag: "input", parent: "e000015", attrs: { id: "tok", name: "token", type: "hidden", value: "SECRET-TOKEN" } }, // e000019
  { tag: "button", parent: "e000015", attrs: { type: "submit" }, text: "Sign up" }, // e000020
  { tag: "a", parent: "e000006", attrs: { id: "jump", href: "#panel" }, text: "Jump", styleId: "s000002", pseudo: true }, // e000021
  { tag: "a", parent: "e000006", attrs: { id: "js", href: "javascript:doThing()" }, text: "JS link", styleId: "s000002" }, // e000022
  {
    tag: "img",
    parent: "e000006",
    attrs: {
      id: "pic",
      src: "/img/a.png",
      srcset: "/img/a@2x.png 2x",
      alt: "A picture",
      width: "100",
      height: "50",
    },
  }, // e000023

  // --- Task 13.1 widgets (§22–§27) -------------------------------------------
  // Written as the Task 03/04 Observer WOULD have recorded them: every
  // allowlisted supplemental attribute is missing, because `ATTR_WHITELIST`
  // never contained one. Two deliberate exceptions carry the "existing source
  // wins" cases (§27): `h1` already has an `aria-label`, and `c2` already has a
  // `colspan` — neither may be touched by the parse tree.
  { tag: "table", parent: "e000006", attrs: { id: "grid" } }, // e000024
  { tag: "thead", parent: "e000024" }, // e000025
  { tag: "tr", parent: "e000025" }, // e000026
  {
    tag: "th",
    parent: "e000026",
    attrs: { id: "h1", "aria-label": "source-value" },
    text: "Header",
  }, // e000027
  { tag: "tbody", parent: "e000024" }, // e000028
  { tag: "tr", parent: "e000028" }, // e000029
  { tag: "td", parent: "e000029", attrs: { id: "c1" }, text: "A" }, // e000030
  { tag: "td", parent: "e000029", attrs: { id: "c2", colspan: "9" }, text: "B" }, // e000031
  { tag: "details", parent: "e000006", attrs: { id: "acc" } }, // e000032
  { tag: "summary", parent: "e000032", attrs: { id: "acc-sum" }, text: "Open me" }, // e000033
  { tag: "p", parent: "e000032", attrs: { id: "acc-body" }, text: "Body" }, // e000034
  { tag: "button", parent: "e000006", attrs: { id: "dis" }, text: "Disabled" }, // e000035
  {
    tag: "input",
    parent: "e000006",
    attrs: { id: "ro", type: "text", value: "fixed" },
  }, // e000036
  { tag: "input", parent: "e000006", attrs: { id: "chk", type: "checkbox" } }, // e000037
  { tag: "select", parent: "e000006", attrs: { id: "sel" } }, // e000038
  { tag: "option", parent: "e000038", attrs: { id: "o1" }, text: "A" }, // e000039
  { tag: "option", parent: "e000038", attrs: { id: "o2" }, text: "B" }, // e000040
  { tag: "input", parent: "e000006", attrs: { id: "num", type: "number" } }, // e000041
  { tag: "input", parent: "e000006", attrs: { id: "up", type: "file" } }, // e000042
  { tag: "div", parent: "e000006", attrs: { id: "editor" }, text: "Type here" }, // e000043
  { tag: "div", parent: "e000006", attrs: { id: "untilfound" }, text: "Findable" }, // e000044
  { tag: "ol", parent: "e000006", attrs: { id: "ol" } }, // e000045
  { tag: "li", parent: "e000045", attrs: { id: "li1" }, text: "one" }, // e000046
  { tag: "time", parent: "e000006", attrs: { id: "when" }, text: "Aug 14" }, // e000047
  { tag: "button", parent: "e000006", attrs: { id: "pop-btn" }, text: "Open" }, // e000048
  { tag: "div", parent: "e000006", attrs: { id: "pop" }, text: "Popover body" }, // e000049
  { tag: "button", parent: "e000006", attrs: { id: "pop-missing" }, text: "Ghost" }, // e000050
  // The attack block. `dom.json` carries NOTHING dangerous, so any endpoint,
  // secret, class, handler or javascript: URL that shows up in the compiled IR
  // can only have come from the parse tree (§26).
  { tag: "form", parent: "e000006", attrs: { id: "attack" } }, // e000051
  {
    tag: "input",
    parent: "e000051",
    attrs: { id: "atk-hidden", type: "hidden" },
  }, // e000052
  { tag: "button", parent: "e000051", attrs: { id: "atk-btn" }, text: "Delete" }, // e000053
  { tag: "a", parent: "e000051", attrs: { id: "atk-link" }, text: "go" }, // e000054
];

const HOME_ASSETS: AssetObservation[] = [
  {
    url: "https://fixture.test/img/a.png",
    type: "image",
    elementId: "e000023",
    alt: "A picture",
    width: 100,
    height: 50,
    naturalWidth: 200,
    naturalHeight: 100,
  },
  {
    url: "https://fixture.test/img/a@2x.png",
    type: "image-srcset",
    elementId: "e000023",
    descriptor: "2x",
    alt: "A picture",
  },
  { type: "inline-svg", elementId: "e000011", markup: SVG_MARKUP, width: 10, height: 10 },
  { url: "https://cdn.fixture.test/font.woff2", type: "font" },
];

const DETAILS_HTML = (label: string, body: string): string =>
  '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body>' +
  `<main><details id="d"><summary>${label}</summary><p>${body}</p></details></main>` +
  "</body></html>";

const detailsElements = (label: string, body: string): ElementSpec[] => [
  { tag: "html", attrs: { lang: "en" } },
  { tag: "body", parent: "e000001" },
  { tag: "main", parent: "e000002" },
  { tag: "details", parent: "e000003", attrs: { id: "d" } },
  { tag: "summary", parent: "e000004", text: label },
  { tag: "p", parent: "e000004", text: body, styleId: "s000002" },
];

/**
 * rendered.html for `/broken` carries one element dom.json never saw.
 *
 * Since Task 13.1 it also carries `open`, `colspan` and `disabled` (§28): a
 * viewport that failed alignment must recover exactly none of them, no matter
 * how plainly they are written here.
 */
const BROKEN_HTML =
  '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body>' +
  "<main><p>Broken <span>page</span></p>" +
  '<details id="bd" open><summary id="bs">S</summary></details>' +
  '<table id="bt"><tbody><tr><td id="bc" colspan="3" rowspan="2">c</td></tr></tbody></table>' +
  '<button id="bb" disabled>B</button>' +
  "<aside>extra</aside></main>" +
  "</body></html>";

const BROKEN_ELEMENTS: ElementSpec[] = [
  { tag: "html", attrs: { lang: "en" } },
  { tag: "body", parent: "e000001" },
  { tag: "main", parent: "e000002" },
  { tag: "p", parent: "e000003", text: "Broken page" },
  { tag: "span", parent: "e000004", text: "page", styleId: "s000002" },
  { tag: "details", parent: "e000003", attrs: { id: "bd" } },
  { tag: "summary", parent: "e000006", attrs: { id: "bs" }, text: "S" },
  { tag: "table", parent: "e000003", attrs: { id: "bt" } },
  { tag: "tbody", parent: "e000008" },
  { tag: "tr", parent: "e000009" },
  { tag: "td", parent: "e000010", attrs: { id: "bc" }, text: "c" },
  { tag: "button", parent: "e000003", attrs: { id: "bb" }, text: "B" },
  // `<aside>` is deliberately absent — this is what fails the alignment.
];

interface FixturePage {
  pageId: string;
  url: string;
  role: "representative" | "validation-sample";
  familyId: string;
  familyType: PageFamily["type"];
  familyMemberCount: number;
  title: string;
  html: string;
  elements: ElementSpec[];
  assets: AssetObservation[];
}

const FIXTURE_PAGES: FixturePage[] = [
  {
    pageId: "p000001",
    url: URL_HOME,
    role: "representative",
    familyId: "f000001",
    familyType: "singleton",
    familyMemberCount: 1,
    title: "Fixture Home",
    html: HOME_HTML,
    elements: HOME_ELEMENTS,
    assets: HOME_ASSETS,
  },
  {
    pageId: "p000002",
    url: URL_A,
    role: "representative",
    familyId: "f000002",
    familyType: "sibling-pattern",
    familyMemberCount: 4,
    title: "Alpha",
    html: DETAILS_HTML("More", "Alpha body"),
    elements: detailsElements("More", "Alpha body"),
    assets: [{ url: "https://fixture.test/img/a.png", type: "image", elementId: "e000006" }],
  },
  {
    pageId: "p000003",
    url: URL_A2,
    role: "validation-sample",
    familyId: "f000002",
    familyType: "sibling-pattern",
    familyMemberCount: 4,
    title: "Alpha 2",
    html: DETAILS_HTML("More", "Alpha two body"),
    elements: detailsElements("More", "Alpha two body"),
    assets: [],
  },
  {
    pageId: "p000004",
    url: URL_BROKEN,
    role: "representative",
    familyId: "f000003",
    familyType: "singleton",
    familyMemberCount: 1,
    title: "Broken",
    html: BROKEN_HTML,
    elements: BROKEN_ELEMENTS,
    assets: [],
  },
];

// ---------------------------------------------------------------------------
// Fixture writers (through the real upstream schemas)
// ---------------------------------------------------------------------------

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function viewportObservation(
  viewportId: ViewportId,
  page: FixturePage,
  elementCount: number,
): ViewportObservation {
  const profile = viewportId === "desktop" ? DESKTOP_PROFILE : MOBILE_PROFILE;
  return {
    profile,
    environment: {
      browser: "chromium",
      browserVersion: "151.0.0.0",
      userAgent: "fixture",
      viewportWidth: profile.width,
      viewportHeight: profile.height,
      deviceScaleFactor: profile.deviceScaleFactor,
      colorScheme: "light",
      reducedMotion: "no-preference",
      timestamp: OBSERVED_AT,
    },
    metadata: {
      requestedUrl: page.url,
      finalUrl: page.url,
      title: page.title,
      timestamp: OBSERVED_AT,
      viewportWidth: profile.width,
      viewportHeight: profile.height,
      documentWidth: profile.width,
      documentHeight: viewportId === "desktop" ? 2000 : 3200,
      scrollWidth: profile.width,
      scrollHeight: viewportId === "desktop" ? 2000 : 3200,
    },
    loadStrategy: {
      waitUntil: "load",
      navTimeoutMs: 45000,
      networkIdleTimeoutMs: 8000,
      networkIdleReached: true,
      fontsReadyTimeoutMs: 5000,
      fontsReadyReached: true,
      settleMs: 1200,
      prepareScroll: false,
      timings: { navMs: 1, networkIdleMs: 1, fontsReadyMs: 1, settleMs: 1, totalMs: 4 },
    },
    stats: {
      domElementCount: elementCount,
      elementsWithGeometry: elementCount,
      localVisibleCount: elementCount,
      effectiveVisibleCount: elementCount,
      elementsWithPseudo: 0,
      uniqueStyleCount: Object.keys(SHARED_STYLE_TABLE).length,
      rawStyleOccurrenceCount: elementCount,
      assetCount: page.assets.length,
      inlineSvgCount: page.assets.filter((a) => a.type === "inline-svg").length,
      linkCount: 0,
      internalLinkCount: 0,
      openShadowRootCount: 0,
      iframeCount: 0,
    },
    styleDedup: {
      rawStyleOccurrences: elementCount,
      uniqueStyleCount: Object.keys(SHARED_STYLE_TABLE).length,
      dedupRatio: 0.5,
    },
    shadow: { openShadowRootCount: 0, shadowHostIds: [] },
    sizes: {
      renderedHtmlBytes: 1,
      domJsonBytes: 1,
      stylesJsonBytes: 1,
      assetsJsonBytes: 1,
      linksJsonBytes: 1,
      framesJsonBytes: 1,
      screenshotBytes: 0,
      domPlusStylesBytes: 2,
      inlineStylesDomBytes: 3,
      viewportTotalBytes: 6,
    },
    files: {
      rendered: `viewports/${viewportId}/rendered.html`,
      dom: `viewports/${viewportId}/dom.json`,
      styles: `viewports/${viewportId}/styles.json`,
      assets: `viewports/${viewportId}/assets.json`,
      links: `viewports/${viewportId}/links.json`,
      frames: `viewports/${viewportId}/frames.json`,
      screenshot: `viewports/${viewportId}/screenshot.png`,
    },
  };
}

async function writePageArtifacts(
  runDir: string,
  page: FixturePage,
  reverseArrays: boolean,
): Promise<void> {
  const pageDir = path.join(runDir, "pages", page.pageId);
  const dom = buildDom(page.elements);
  const styleTable: StyleTable = {};
  const styleIds = Object.keys(SHARED_STYLE_TABLE);
  for (const key of reverseArrays ? [...styleIds].reverse() : styleIds) {
    styleTable[key] = SHARED_STYLE_TABLE[key]!;
  }
  const assets = reverseArrays ? [...page.assets].reverse() : page.assets;

  for (const viewportId of ["desktop", "mobile"] as ViewportId[]) {
    const dir = path.join(pageDir, "viewports", viewportId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "rendered.html"), page.html, "utf8");
    await writeJson(path.join(dir, "dom.json"), dom);
    await writeJson(path.join(dir, "styles.json"), styleTable);
    await writeJson(path.join(dir, "assets.json"), assets);
    await writeJson(path.join(dir, "links.json"), []);
    await writeJson(path.join(dir, "frames.json"), []);
  }

  const observation: PageObservation = {
    schemaVersion: OBSERVER_SCHEMA_VERSION,
    engine: "playwright-chromium",
    target: {
      requestedUrl: page.url,
      finalUrl: page.url,
      title: page.title,
      timestamp: OBSERVED_AT,
    },
    observationProfile: {
      locale: "ko-KR",
      timezone: "Asia/Seoul",
      colorScheme: "light",
      reducedMotion: "no-preference",
    },
    viewports: {
      desktop: viewportObservation("desktop", page, dom.length),
      mobile: viewportObservation("mobile", page, dom.length),
    },
    responsiveSummary: {
      desktop: {
        elementCount: dom.length,
        effectiveVisibleCount: dom.length,
        documentWidth: 1440,
        documentHeight: 2000,
        uniqueStyleCount: 3,
        assetCount: page.assets.length,
        linkCount: 0,
      },
      mobile: {
        elementCount: dom.length,
        effectiveVisibleCount: dom.length,
        documentWidth: 390,
        documentHeight: 3200,
        uniqueStyleCount: 3,
        assetCount: page.assets.length,
        linkCount: 0,
      },
    },
    sizes: { observationJsonBytes: 1, runTotalBytes: 2 },
  };
  await writeJson(path.join(pageDir, "observation.json"), observation);
}

interface FixturePaths {
  root: string;
  selectionDir: string;
  observationDir: string;
  explorationDir: string;
  modelDir: string;
  patternsFile: string;
  aiFile: string;
}

/** Write the whole Task 06 → 12 chain into `root`. */
async function writeFixture(root: string, reverseArrays = false): Promise<FixturePaths> {
  const selectionDir = path.join(root, "selection");
  const observationDir = path.join(root, "site-observation");
  const explorationDir = path.join(root, "exploration");
  const modelDir = path.join(root, "model");

  const rel = (p: string): string => path.relative(process.cwd(), p).split(path.sep).join("/");

  // --- Task 06 ---------------------------------------------------------------
  const verifiedOrder = [URL_HOME, URL_A, URL_A2, URL_A3, URL_A4, URL_BROKEN];
  const verified: VerifiedUrlSet = {
    schemaVersion: VERIFIER_SCHEMA_VERSION,
    rootUrl: ROOT_URL,
    sourceDiscoveryFile: rel(path.join(selectionDir, "discovery.json")),
    verifiedAt: OBSERVED_AT,
    count: verifiedOrder.length,
    urls: (reverseArrays ? [...verifiedOrder].reverse() : verifiedOrder).map((url) => ({
      url,
      sourceCandidateUrls: [url],
      httpStatus: 200,
      title: `title ${url}`,
    })),
  };
  await writeJson(path.join(selectionDir, "verified-urls.json"), verified);
  await writeJson(path.join(selectionDir, "verification.json"), {
    note: "not read by the SiteSpec compiler; recorded as provenance only",
  });

  // --- Task 07 / 08 ----------------------------------------------------------
  const member = (url: string, isRepresentative: boolean) => ({
    url,
    canonicalTarget: "self" as const,
    sourceCandidateUrls: [url],
    route: {
      url,
      pathname: new URL(url).pathname,
      pathSegments: new URL(url).pathname.split("/").filter(Boolean),
      pathDepth: new URL(url).pathname.split("/").filter(Boolean).length,
      parentPath: "/",
      queryKeys: [],
      queryKeySignature: "",
      terminalSegment: new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "",
      terminalKind: "text" as const,
    },
    isRepresentative,
  });

  const families: PageFamily[] = [
    {
      id: "f000001",
      type: "singleton",
      members: [member(URL_HOME, true)],
      representativeUrl: URL_HOME,
      signals: { memberCount: 1, sharedStructure: false, sharedText: false, rootProtected: true },
    },
    {
      id: "f000002",
      type: "sibling-pattern",
      inferredRoutePattern: "/<*>",
      structuralMatchReason: "shallowSkeleton+landmark; elements 6–6 (ratio 1.000)",
      members: [
        member(URL_A, true),
        member(URL_A2, false),
        member(URL_A3, false),
        member(URL_A4, false),
      ],
      representativeUrl: URL_A,
      signals: { memberCount: 4, sharedStructure: true, sharedText: false },
    },
    {
      id: "f000003",
      type: "singleton",
      members: [member(URL_BROKEN, true)],
      representativeUrl: URL_BROKEN,
      signals: { memberCount: 1, sharedStructure: false, sharedText: false },
    },
  ];
  const familySet: PageFamilySet = {
    schemaVersion: SELECTOR_SCHEMA_VERSION,
    rootUrl: ROOT_URL,
    sourceVerifiedUrlsFile: rel(path.join(selectionDir, "verified-urls.json")),
    sourceVerificationFile: rel(path.join(selectionDir, "verification.json")),
    builtAt: OBSERVED_AT,
    verifiedUrlCount: verifiedOrder.length,
    familyCount: families.length,
    familyTypeCounts: {
      "content-duplicate": 0,
      "sibling-pattern": 1,
      "scope-structure": 0,
      singleton: 2,
    },
    largestFamilySize: 4,
    families: reverseArrays
      ? families.map((f) => ({ ...f, members: [...f.members].reverse() })).reverse()
      : families,
  };
  await writeJson(path.join(selectionDir, "page-families.json"), familySet);

  const selection: PageSelection = {
    schemaVersion: SELECTOR_SCHEMA_VERSION,
    rootUrl: ROOT_URL,
    sourceVerifiedUrlsFile: rel(path.join(selectionDir, "verified-urls.json")),
    sourceVerificationFile: rel(path.join(selectionDir, "verification.json")),
    selectedAt: OBSERVED_AT,
    verifiedUrlCount: verifiedOrder.length,
    familyCount: families.length,
    selectedCount: 3,
    reductionCount: 3,
    reductionRate: 0.5,
    familyTypeCounts: {
      "content-duplicate": 0,
      "sibling-pattern": 1,
      "scope-structure": 0,
      singleton: 2,
    },
    largestFamilySize: 4,
    pages: [
      { url: URL_HOME, familyId: "f000001", familyType: "singleton", memberCount: 1, reason: "sole-member", reasonDetail: "only member" },
      { url: URL_A, familyId: "f000002", familyType: "sibling-pattern", memberCount: 4, reason: "representative-rule", reasonDetail: "shortest path" },
      { url: URL_BROKEN, familyId: "f000003", familyType: "singleton", memberCount: 1, reason: "sole-member", reasonDetail: "only member" },
    ],
    unselected: [URL_A2, URL_A3, URL_A4].map((url) => ({
      url,
      familyId: "f000002",
      representativeUrl: URL_A,
      reason: "represented-by-family" as const,
    })),
  };
  await writeJson(path.join(selectionDir, "selected-pages.json"), selection);

  // --- Task 09 ---------------------------------------------------------------
  for (const page of FIXTURE_PAGES) await writePageArtifacts(observationDir, page, reverseArrays);

  const observedPages: ObservedSitePage[] = FIXTURE_PAGES.map((page) => ({
    pageId: page.pageId,
    url: page.url,
    role: page.role,
    familyId: page.familyId,
    familyType: page.familyType,
    familyMemberCount: page.familyMemberCount,
    status: "success",
    startedAt: OBSERVED_AT,
    completedAt: OBSERVED_AT,
    elapsedMs: 1,
    pageObservationFile: `pages/${page.pageId}/observation.json`,
    finalUrl: page.url,
    title: page.title,
    bytes: 1,
  }));

  const siteObservation: SiteObservation = {
    schemaVersion: MULTI_SCHEMA_VERSION,
    engine: "playwright-chromium",
    rootUrl: ROOT_URL,
    sourceSelectedPagesFile: rel(path.join(selectionDir, "selected-pages.json")),
    sourcePageFamiliesFile: rel(path.join(selectionDir, "page-families.json")),
    startedAt: OBSERVED_AT,
    completedAt: OBSERVED_AT,
    status: "completed",
    config: {
      concurrency: 2,
      prepareScroll: false,
      viewportProfiles: [DESKTOP_PROFILE, MOBILE_PROFILE],
      maxValidationSamplesPerSite: 3,
      minValidationFamilySize: 3,
    },
    observationProfile: {
      locale: "ko-KR",
      timezone: "Asia/Seoul",
      colorScheme: "light",
      reducedMotion: "no-preference",
    },
    selection: {
      verifiedUrlCount: verifiedOrder.length,
      familyCount: families.length,
      selectedCount: 3,
      largestFamilySize: 4,
      selectedAt: OBSERVED_AT,
    },
    coverage: {
      familyCount: families.length,
      observedRepresentativeCount: 3,
      representedVerifiedUrlCount: 6,
      validationSampleCount: 1,
      totalObservedPageCount: 4,
      fullObservationPageCount: 6,
      observationReductionCount: 2,
      observationReductionRate: 0.3333,
    },
    stats: {
      requestedPages: 4,
      completedPages: 4,
      failedPages: 0,
      desktopObservations: 4,
      mobileObservations: 4,
      desktopBytes: 1,
      mobileBytes: 1,
      screenshotBytes: 0,
      jsonHtmlBytes: 2,
      pageBytes: 2,
      siteObservationJsonBytes: 1,
      totalBytes: 3,
      averageBytesPerObservedPage: 1,
      totalElapsedMs: 4,
    },
    pages: reverseArrays ? [...observedPages].reverse() : observedPages,
    validationSamples: [
      {
        familyId: "f000002",
        familyType: "sibling-pattern",
        familyMemberCount: 4,
        representativePageId: "p000002",
        samplePageId: "p000003",
        representativeUrl: URL_A,
        sampleUrl: URL_A2,
      },
    ],
  };
  await writeJson(path.join(observationDir, "site-observation.json"), siteObservation);

  // --- Task 11 ---------------------------------------------------------------
  const exploration: InteractionExploration = {
    schemaVersion: EXPLORER_SCHEMA_VERSION,
    engine: "playwright-chromium",
    rootUrl: ROOT_URL,
    sourceInteractionAnalysis: rel(path.join(observationDir, "interaction-analysis.json")),
    sourceSiteObservation: rel(path.join(observationDir, "site-observation.json")),
    startedAt: OBSERVED_AT,
    completedAt: OBSERVED_AT,
    status: "completed",
    config: {
      concurrency: 2,
      planOnly: false,
      viewportProfiles: [DESKTOP_PROFILE, MOBILE_PROFILE],
      loadTimeoutMs: 30000,
      loadSettleMs: 1000,
      afterSettleMs: 600,
      maxMutationRecords: 500,
      screenshots: false,
    },
    stats: {
      plannedActions: 4,
      executedActions: 4,
      changedActions: 3,
      noChangeActions: 1,
      desktopPlanned: 4,
      mobilePlanned: 0,
      desktopExecuted: 4,
      mobileExecuted: 0,
      desktopChanged: 3,
      mobileChanged: 0,
      locatorResolutionRate: 1,
      changeRate: 0.75,
      totalLoadMs: 4,
      totalActionMs: 4,
      averageActionMs: 1,
      totalElapsedMs: 8,
    },
    pages: [
      { pageId: "p000001", url: URL_HOME, role: "representative", familyId: "f000001", desktopPlanned: 3, mobilePlanned: 0, desktopExecuted: 3, mobileExecuted: 0, desktopChanged: 2, mobileChanged: 0 },
      { pageId: "p000002", url: URL_A, role: "representative", familyId: "f000002", desktopPlanned: 1, mobilePlanned: 0, desktopExecuted: 1, mobileExecuted: 0, desktopChanged: 1, mobileChanged: 0 },
    ],
    actions: [],
    actionStatusSummary: { changed: 3, "no-change": 1 },
    locatorStatusSummary: { resolved: 4 },
    locatorStrategySummary: { "id-exact": 4 },
    diffSummary: { "candidate-attribute-change": 2 },
    safetySummary: {
      formSubmitSkipped: 0,
      fileInputSkipped: 0,
      navigationGuardSkipped: 0,
      navigationAttemptsBlocked: 0,
      sameDocumentNavigations: 0,
      popupAttempts: 0,
      downloadAttempts: 0,
      writeRequestsBlocked: 0,
      dialogsDismissed: 0,
      blockedMethodCounts: {},
    },
    dynamicTargetSummary: {
      plannedUnresolvedTriggers: 1,
      executedUnresolvedTriggers: 1,
      resolvedAfterAction: 1,
      stillUnresolved: 0,
      failedBeforeAction: 0,
      newInteractiveDescendants: 3,
    },
    storageSummary: {
      planBytes: 1,
      manifestBytes: 1,
      actionArtifactBytes: 1,
      totalBytes: 3,
      averageBytesPerAction: 1,
    },
    mutationTruncatedCount: 0,
  };
  await writeJson(path.join(explorationDir, "interaction-exploration.json"), exploration);

  // --- Task 12 ---------------------------------------------------------------
  const explorationRunRef = rel(explorationDir);
  const patternSource = (actionId: string, pageId: string, elementId: string) => ({
    explorationRun: explorationRunRef,
    actionId,
    pageId,
    url: pageId === "p000001" ? URL_HOME : URL_A,
    viewport: "desktop" as const,
    sourceCandidateId: "ic000001",
    sourceElementId: elementId,
    observationFile: `pages/${pageId}/desktop/${actionId}.json`,
  });

  const patternInstances: InteractionPatternInstance[] = [
    {
      id: "ip000001",
      patternType: "disclosure",
      ruleId: "disclosure-aria-expanded-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: patternSource("ia000001", "p000001", "e000012"),
      trigger: { tagName: "button", text: "Toggle", priority: "P1", capabilities: ["click", "disclosure-trigger"] },
      mechanism: "aria-expanded",
      transition: { direction: "closed-to-open", field: "aria-expanded", before: "false", after: "true" },
      target: {
        relation: "aria-controls",
        targetDomId: "panel",
        tagName: "div",
        role: "region",
        existedBefore: true,
        existsAfter: true,
        mounted: false,
        unmounted: false,
        visibilityChanged: true,
        interactiveDescendantsAfter: 0,
      },
      evidence: [{ signal: "aria-expanded", source: "diff.changes", before: "false", after: "true", level: "observed" }],
      supportingEvidence: [],
      limitations: ["Only this one transition direction was observed."],
      signature: "disclosure||aria-expanded|closed-to-open|button||div|region|desktop",
    },
    {
      id: "ip000002",
      patternType: "menu",
      subtype: "menu",
      ruleId: "menu-target-mounted-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: patternSource("ia000002", "p000001", "e000014"),
      trigger: { tagName: "button", text: "Menu", priority: "P1", capabilities: ["click", "menu-trigger"] },
      mechanism: "target-mounted",
      transition: { direction: "closed-to-open", field: "target", before: "absent", after: "present" },
      target: {
        relation: "aria-controls",
        targetDomId: "dynamic-menu",
        tagName: "div",
        role: "menu",
        existedBefore: false,
        existsAfter: true,
        mounted: true,
        unmounted: false,
        visibilityChanged: false,
        interactiveDescendantsAfter: 3,
      },
      evidence: [{ signal: "target-mounted", source: "diff.changes", level: "observed" }],
      supportingEvidence: [],
      limitations: ["The mounted region's internal structure was never observed."],
      signature: "menu|menu|target-mounted|closed-to-open|button||div|menu|desktop",
    },
    {
      id: "ip000003",
      patternType: "disclosure",
      subtype: "details",
      ruleId: "disclosure-native-details-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: patternSource("ia000003", "p000002", "e000005"),
      trigger: { tagName: "summary", text: "More", priority: "P1", capabilities: ["click", "disclosure-trigger"] },
      mechanism: "native-details",
      transition: { direction: "closed-to-open", field: "open", before: "false", after: "true" },
      target: {
        relation: "details",
        tagName: "details",
        existedBefore: true,
        existsAfter: true,
        mounted: false,
        unmounted: false,
        visibilityChanged: false,
        interactiveDescendantsAfter: 1,
      },
      evidence: [{ signal: "open", source: "diff.changes", before: "false", after: "true", level: "observed" }],
      supportingEvidence: [],
      limitations: [],
      signature: "disclosure|details|native-details|closed-to-open|summary||details||desktop",
    },
  ];

  const patterns: InteractionPatternsArtifact = {
    schemaVersion: PATTERN_SCHEMA_VERSION,
    registryVersion: REGISTRY_VERSION,
    engine: "offline-deterministic",
    rootUrl: ROOT_URL,
    sourceExploration: rel(path.join(explorationDir, "interaction-exploration.json")),
    sourceExplorationRun: explorationRunRef,
    rules: [
      {
        id: "disclosure-aria-expanded-v1",
        patternType: "disclosure",
        version: 1,
        specificity: 20,
        description: "aria-expanded flipped on the trigger",
        requiredEvidence: ["aria-expanded"],
        optionalEvidence: [],
        rejectionConditions: [],
        matchCount: 1,
      },
      {
        id: "menu-target-mounted-v1",
        patternType: "menu",
        version: 1,
        specificity: 30,
        description: "a menu-role region mounted after the click",
        requiredEvidence: ["target-mounted", "role=menu"],
        optionalEvidence: [],
        rejectionConditions: [],
        matchCount: 1,
      },
      {
        id: "disclosure-native-details-v1",
        patternType: "disclosure",
        version: 1,
        specificity: 40,
        description: "a native <details open> flipped",
        requiredEvidence: ["open", "native-details-relation"],
        optionalEvidence: [],
        rejectionConditions: [],
        matchCount: 1,
      },
      {
        id: "unused-rule-v1",
        patternType: "dialog",
        version: 1,
        specificity: 10,
        description: "never matched in this fixture",
        requiredEvidence: [],
        optionalEvidence: [],
        rejectionConditions: [],
        matchCount: 0,
      },
    ],
    coverage: {
      totalActions: 4,
      executedActions: 4,
      changedActions: 3,
      confirmedPatternInstances: 3,
      unknownCases: 1,
      navigationTainted: 0,
      executionErrors: 0,
      unmatchedTransitions: 1,
      patternCoverageOfChanged: 1,
      patternCoverageOfExecuted: 0.75,
    },
    patternTypeSummary: { disclosure: 2, menu: 1 },
    mechanismSummary: { "aria-expanded": 1, "native-details": 1, "target-mounted": 1 },
    viewportSummary: [
      { viewport: "desktop", actions: 4, patterns: 3, unknowns: 1, patternTypeCounts: { disclosure: 2, menu: 1 } },
    ],
    pages: [
      { pageId: "p000001", url: URL_HOME, desktopPatternIds: ["ip000001", "ip000002"], mobilePatternIds: [], patternTypes: ["disclosure", "menu"], unknownCount: 1 },
      { pageId: "p000002", url: URL_A, desktopPatternIds: ["ip000003"], mobilePatternIds: [], patternTypes: ["disclosure"], unknownCount: 0 },
    ],
    patterns: reverseArrays ? [...patternInstances].reverse() : patternInstances,
    groups: [],
    ruleConflicts: [],
  };
  await writeJson(path.join(modelDir, "interaction-patterns.json"), patterns);

  const unknownCases: UnknownInteractionCase[] = [
    {
      id: "iu000001",
      reason: "unmatched-transition",
      source: {
        explorationRun: explorationRunRef,
        actionId: "ia000004",
        pageId: "p000001",
        url: URL_HOME,
        viewport: "desktop",
        candidateId: "ic000004",
        elementId: "e000021",
        observationFile: "pages/p000001/desktop/ia000004.json",
      },
      status: "changed",
      candidateSummary: {
        tagName: "a",
        priority: "P2",
        capabilities: ["click"],
        // A label that INVITES a wrong promotion. It must stay unknown (item 62).
        label: "메뉴 열기",
      },
      beforeStateSummary: { aria: {}, state: {}, exists: true },
      afterStateSummary: { aria: {}, state: {}, exists: true },
      diffCategories: ["container-visibility-change"],
      mutationSummary: {
        categories: ["class"],
        recordCount: 2,
        addedNodeCount: 0,
        removedNodeCount: 0,
        truncated: false,
      },
      safetySummary: [],
      partialPatternHints: [
        {
          ruleId: "menu-target-mounted-v1",
          patternType: "menu",
          matchedEvidence: ["container-visibility-change"],
          missingEvidence: ["role=menu"],
        },
      ],
      aiEligibility: "eligible",
      aiEligibilityReason: "a real transition no rule explains",
      preferredProbeState: "closed",
      signature: "unmatched-transition|changed|a||container-visibility-change",
      provenance: "derived",
    },
  ];

  const unknowns: UnknownInteractionsArtifact = {
    schemaVersion: PATTERN_SCHEMA_VERSION,
    engine: "offline-deterministic",
    rootUrl: ROOT_URL,
    sourceExploration: rel(path.join(explorationDir, "interaction-exploration.json")),
    sourceExplorationRun: explorationRunRef,
    stats: {
      totalCases: 1,
      signatureGroups: 1,
      aiEligibleGroups: 1,
      aiConditionalGroups: 0,
      aiExcludedGroups: 0,
      aiEligibleCases: 1,
      estimatedAiCalls: 1,
      reasonCounts: { "unmatched-transition": 1 },
    },
    signatureGroups: [
      {
        signature: "unmatched-transition|changed|a||container-visibility-change",
        reason: "unmatched-transition",
        status: "changed",
        triggerTag: "a",
        caseCount: 1,
        pageIds: ["p000001"],
        caseIds: ["iu000001"],
        representativeCaseId: "iu000001",
        aiEligibility: "eligible",
      },
    ],
    cases: reverseArrays ? [...unknownCases].reverse() : unknownCases,
  };
  await writeJson(path.join(modelDir, "unknown-interactions.json"), unknowns);

  // A CONFIDENT, WELL-FORMED, FAKE AI artifact, deliberately placed as a sibling
  // of the two files the CLI consumes by default (items 64, 93).
  const ai: AiAnalysisArtifact = {
    schemaVersion: AI_SCHEMA_VERSION,
    provider: "fake",
    rootUrl: ROOT_URL,
    sourceUnknownInteractions: rel(path.join(modelDir, "unknown-interactions.json")),
    analyzedCaseCount: 1,
    representedCaseCount: 1,
    analyses: [
      {
        caseId: "iu000001",
        status: "analyzed",
        proposedPattern: { type: "menu", subtype: "hamburger", confidence: "high" },
        rationale: "The label says it opens a menu.",
        evidenceUsed: ["candidate.label"],
        uncertainty: ["no role=menu was observed"],
        provenance: "inferred",
      },
    ],
    promotionPolicy: AI_PROMOTION_POLICY,
  };
  await writeJson(path.join(modelDir, "ai-analysis.json"), ai);

  return {
    root,
    selectionDir,
    observationDir,
    explorationDir,
    modelDir,
    patternsFile: path.join(modelDir, "interaction-patterns.json"),
    aiFile: path.join(modelDir, "ai-analysis.json"),
  };
}

// ---------------------------------------------------------------------------
// Helpers over a compiled SiteSpec
// ---------------------------------------------------------------------------

function nodesOf(page: PageSpec, viewport: ViewportId): SpecNode[] {
  return page.viewports[viewport].nodes;
}

function elementBySourceId(
  page: PageSpec,
  viewport: ViewportId,
  sourceElementId: string,
): ElementSpecNode | undefined {
  return nodesOf(page, viewport).find(
    (node): node is ElementSpecNode =>
      node.type === "element" && node.sourceElementId === sourceElementId,
  );
}

/** Render a subtree back to a compact string, for ordering assertions. */
function renderSubtree(page: PageSpec, viewport: ViewportId, nodeId: string): string {
  const byId = new Map(nodesOf(page, viewport).map((node) => [node.nodeId, node]));
  const walk = (id: string): string => {
    const node = byId.get(id);
    if (!node) return "";
    if (node.type === "text") return `T(${JSON.stringify(node.value)})`;
    return `<${node.tagName}>${node.childNodeIds.map(walk).join("")}</${node.tagName}>`;
  };
  return walk(nodeId);
}

async function snapshotTree(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const info = await stat(full);
        out.push(`${path.relative(dir, full)}|${info.size}|${info.mtimeMs}`);
      }
    }
  };
  await walk(dir);
  return out;
}

async function readAllFiles(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (current: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.set(path.relative(dir, full), await readFile(full, "utf8"));
    }
  };
  await walk(dir);
  return files;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Task 26 / Task 28.75 §07 — probe ↔ tree attachment decision (pure, offline).
 *
 * Task 26 replaced a ≥90% coverage floor with an exact structural (tag +
 * parent) PREFIX. Task 28.75 replaces the prefix with STRUCTURAL PATH identity,
 * because a prefix is a statement about positions and one inserted element
 * moves every position after it: on `linear.app /` a 1% difference between the
 * two page loads discarded 86.5% of the width evidence (311 of 2,306 elements
 * attached). These checks pin the new identity and, just as importantly, pin
 * what it still REFUSES.
 */
function probeAttachmentChecks(): void {
  console.log("§probe — attachment decision (Task 28.75 structural-path identity)");
  const n = 400;
  // A synthetic flat-ish walk: html(0) > body(1) > main(2) > 397 div children.
  const tags = ["html", "body", "main", ...Array.from({ length: n - 3 }, () => "div")];
  const parents = [-1, 0, 1, ...Array.from({ length: n - 3 }, () => 2)];

  const full = computeProbeAttachment({
    probe: { tags, parents, truncated: false },
    elementTags: tags,
    elementParentIndexes: parents,
  });
  check(
    "identical walks → aligned, everything attaches",
    full.aligned && full.attachCount === n,
    `${full.attachCount}/${n}`,
  );
  check(
    "…and every pair is the identity pair, so an aligned page is untouched by the new mechanism",
    full.pairs.length === n && full.pairs.every(([a, b], i) => a === i && b === i),
    `${full.pairs.length}`,
  );

  // The observation mounted an extra subtree at index 150 that the probe load
  // never rendered. Under the OLD prefix rule this attached exactly 150 of 400
  // elements — 62.5% of the page discarded over one inserted node.
  const divergedTags = [...tags.slice(0, 150), "section", ...tags.slice(150)];
  const divergedParents = [
    ...parents.slice(0, 150),
    2,
    ...parents.slice(150).map((p) => (p >= 150 ? p + 1 : p)),
  ];
  const inserted = computeProbeAttachment({
    probe: { tags, parents, truncated: false },
    elementTags: divergedTags,
    elementParentIndexes: divergedParents,
  });
  check(
    "an INSERTED element no longer discards the page after it (the 28.75 defect)",
    !inserted.aligned && inserted.attachCount === n,
    `attached ${inserted.attachCount} of ${n}, prefix ${inserted.structuralPrefix}`,
  );
  check(
    "…and the exact index prefix is still recorded, so where agreement ended is not lost",
    inserted.structuralPrefix === 150,
    `${inserted.structuralPrefix}`,
  );
  check(
    "…and no probe element is attached to the inserted node itself",
    inserted.pairs.every(([, elementIndex]) => divergedTags[elementIndex] !== "section"),
    JSON.stringify(
      inserted.pairs.filter(([, e]) => divergedTags[e] === "section").slice(0, 3),
    ),
  );
  check(
    "…and every pair maps a probe element to an element with the SAME tag",
    inserted.pairs.every(([p, e]) => tags[p] === divergedTags[e]),
  );

  // Same tags at the same offsets but a DIFFERENT ancestry for one element.
  // Its path differs, so it attaches nothing — tags alone are not identity.
  const reparented = [...parents];
  reparented[120] = 1; // claims body; the dom says main
  const parentMismatch = computeProbeAttachment({
    probe: { tags, parents: reparented, truncated: false },
    elementTags: tags,
    elementParentIndexes: parents,
  });
  check(
    "a REPARENTED element attaches nothing — ancestry is part of identity",
    !parentMismatch.aligned &&
      parentMismatch.pairs.every(([probeIndex]) => probeIndex !== 120),
    JSON.stringify(parentMismatch.pairs.filter(([p]) => p === 120)),
  );
  check(
    "…and the exact prefix still records that index agreement ended there",
    parentMismatch.structuralPrefix === 120,
    `${parentMismatch.structuralPrefix}`,
  );

  // A CHANGED ancestor must withhold its whole subtree: the descendants' paths
  // are built through it, so none of them can claim an identity either.
  const subtreeTags = [...tags];
  const subtreeParents = [...parents];
  subtreeTags[2] = "section"; // main → section, and everything hangs off it
  const changedAncestor = computeProbeAttachment({
    probe: { tags: subtreeTags, parents: subtreeParents, truncated: false },
    elementTags: tags,
    elementParentIndexes: parents,
  });
  check(
    "a CHANGED ANCESTOR withholds its entire subtree — no descendant borrows an identity",
    changedAncestor.attachCount === 0,
    `attached ${changedAncestor.attachCount}`,
  );

  // Attachment must never invent an ordering: pairs are ascending on both sides,
  // so a consumer walking them in order walks both trees in order.
  check(
    "pairs are strictly ascending on BOTH sides (no crossed or duplicated attachment)",
    (() => {
      let lastProbe = -1;
      let lastElement = -1;
      for (const [p, e] of inserted.pairs) {
        if (p <= lastProbe || e <= lastElement) return false;
        lastProbe = p;
        lastElement = e;
      }
      return true;
    })(),
  );

  const short = computeProbeAttachment({
    probe: { tags: tags.slice(0, 60), parents: parents.slice(0, 60), truncated: false },
    elementTags: tags,
    elementParentIndexes: parents,
  });
  check(
    `an attachment under ${PROBE_PREFIX_MIN_ELEMENTS} elements attaches nothing`,
    short.attachCount === 0 && short.pairs.length === 0,
    `${short.attachCount}`,
  );

  const truncated = computeProbeAttachment({
    probe: { tags, parents, truncated: true },
    elementTags: tags,
    elementParentIndexes: parents,
  });
  check(
    "a truncated probe attaches nothing",
    truncated.attachCount === 0 && !truncated.aligned && truncated.pairs.length === 0,
  );

  /*
   * Task 28.75 §07 — THE COLLAPSE ITSELF, as the compiler sees it.
   *
   * `linear.app /` run `2026-09-04T22-34-32-296Z`: the mobile probe walked
   * `html/body/pre` — an edge error body — against a 2,291-element page. The
   * attachment must refuse it outright rather than attach a two-element prefix.
   */
  const collapsed = computeProbeAttachment({
    probe: { tags: ["html", "body", "pre"], parents: [-1, 0, 1], truncated: false },
    elementTags: tags,
    elementParentIndexes: parents,
  });
  check(
    "28.75 CANARY: a 3-element error-page probe attaches NOTHING to a 400-element tree",
    collapsed.attachCount === 0 && !collapsed.aligned && collapsed.pairs.length === 0,
    `attached ${collapsed.attachCount}`,
  );
}

async function main(): Promise<void> {
  console.log("[smoke:sitespec] offline fixture — no server, no browser, no network, no AI\n");
  probeAttachmentChecks();
  let tmp: string | undefined;

  try {
    tmp = await mkdtemp(path.join(tmpdir(), "web-recon-sitespec-"));
    const fixtureRoot = path.join(tmp, "fixture");
    const paths = await writeFixture(fixtureRoot);

    const beforeSources = await snapshotTree(fixtureRoot);

    // --- default compile (no AI) ---------------------------------------------
    const inputs = await loadInputs({ patternsFile: paths.patternsFile });
    const compiled = await compileSiteSpec(inputs);
    assertSiteSpecValid(compiled, {
      expectedVerifiedUrls: inputs.verifiedUrls.urls.map((u) => u.url),
      expectedPageIds: inputs.siteObservation.pages
        .filter((p) => p.status === "success")
        .map((p) => p.pageId),
      expectedPatternIds: inputs.patterns.patterns.map((p) => p.id),
      expectedUnknownIds: inputs.unknowns.cases.map((c) => c.id),
    });

    const outDir = path.join(tmp, "out-1");
    const saved = await saveSiteSpec(outDir, compiled);
    const loaded = await loadSiteSpec(saved.siteSpecPath);
    const home = loaded.pageById.get("p000001")!;
    const alpha = loaded.pageById.get("p000002")!;
    const broken = loaded.pageById.get("p000004")!;

    console.log("\n§P0-C1.7 an observation WITHOUT the P0 evidence compiles with NO new field");
    /*
     * Responsive Core P0 §C1 — old artifacts must keep behaving exactly as
     * before. The main fixture predates the capture (no `initialDocument`, no
     * `inlineStyle`, no probe `s`), so none of the carry-through fields may
     * appear anywhere in its compiled, saved, reloaded pages.
     */
    check(
      "no viewport of a pre-P0 observation carries initialDocument / inlineStyleProvenanceCounts",
      [...loaded.pageById.values()].every(
        (page) =>
          page.viewports.desktop.initialDocument === undefined &&
          page.viewports.mobile.initialDocument === undefined &&
          page.viewports.desktop.inlineStyleProvenanceCounts === undefined &&
          page.viewports.mobile.inlineStyleProvenanceCounts === undefined,
      ),
    );
    check(
      "…and no node carries inlineStyle / inlineStyleProvenance / probe.s",
      [...loaded.pageById.values()].every((page) =>
        (["desktop", "mobile"] as const).every((vp) =>
          page.viewports[vp].nodes.every(
            (node) =>
              node.type !== "element" ||
              (node.inlineStyle === undefined &&
                node.inlineStyleProvenance === undefined &&
                node.probe?.s === undefined),
          ),
        ),
      ),
    );

    console.log(
      "\n§28.6-W3 authoredBreakpoints reaches the COMPILED, SAVED, RELOADED SiteSpec",
    );
    /*
     * The integration half of the histogram, and the reason it exists.
     *
     * Every other authored-breakpoint check in this suite calls
     * `computeAuthoredBreakpoints` directly or hands a hand-built object to the
     * schema. Deleting the one line in `compile-viewport.ts` that writes the
     * field left the whole suite green: the OBSERVATION → `ViewportPageSpec`
     * path had zero coverage, because the fixture carried no `layoutRules`
     * anywhere. It does now, and these checks read the spec that was compiled,
     * written to disk and parsed back — so the field has to survive the
     * compiler, the writer, the schema and the loader to pass.
     */
    const homeDesktopBreakpoints = home.viewports.desktop.authoredBreakpoints;
    check(
      "the compiled + reloaded home viewport CARRIES authoredBreakpoints",
      homeDesktopBreakpoints !== undefined,
      JSON.stringify(Object.keys(home.viewports.desktop)),
    );
    check(
      "…folding the fixture's 8 matched declarations, with every skip counted",
      homeDesktopBreakpoints !== undefined &&
        homeDesktopBreakpoints.declarationsExamined === 8 &&
        homeDesktopBreakpoints.mediaScopedDeclarations === 7 &&
        homeDesktopBreakpoints.foldedDeclarations === 6 &&
        homeDesktopBreakpoints.containerGatedSkippedDeclarations === 1 &&
        homeDesktopBreakpoints.unconditionalDeclarations === 1 &&
        homeDesktopBreakpoints.truncatedNodeCount === 1 &&
        homeDesktopBreakpoints.distinctConditions === 3 &&
        homeDesktopBreakpoints.distinctRawConditions === 3,
      JSON.stringify(homeDesktopBreakpoints),
    );
    check(
      "…and the histogram the author wrote, weighted by declaration",
      JSON.stringify(homeDesktopBreakpoints?.entries) ===
        JSON.stringify([
          { px: 640, kind: "max", count: 1 },
          { px: 1024, kind: "max", count: 3 },
          { px: 1025, kind: "min", count: 2 },
        ]),
      JSON.stringify(homeDesktopBreakpoints?.entries),
    );

    /*
     * THE BOUNDARY ADJACENCY INVARIANT, end to end.
     *
     * `(max-width: 1024px)` and `(min-width: 1025px)` are the two sides of ONE
     * authored change. In `entries` they are necessarily two rows one pixel
     * apart — 1024/max and 1025/min — because that is what the source literally
     * says. A band-edge snapper that reads `entries` therefore sees two
     * breakpoints where the author wrote one, and puts a real pixel at a width
     * nothing changes at.
     *
     * `boundaries` is the fold keyed on the change itself, and the invariant is
     * that both spellings land in ONE row whose `above === below + 1` and whose
     * `minCount + maxCount === count`. This is the number the reconstruction
     * lane snaps to.
     */
    const homeBoundaries = homeDesktopBreakpoints?.boundaries;
    check(
      "(max-width: 1024px) and (min-width: 1025px) fold to ONE boundary, not two breakpoints",
      JSON.stringify(homeBoundaries?.filter((b) => b.below === 1024)) ===
        JSON.stringify([{ below: 1024, above: 1025, count: 5, minCount: 2, maxCount: 3 }]),
      JSON.stringify(homeBoundaries),
    );
    check(
      "…while `entries` still shows BOTH spellings, so nothing is hidden by the fold",
      homeDesktopBreakpoints?.entries.filter((e) => e.px === 1024 || e.px === 1025).length === 2,
      JSON.stringify(homeDesktopBreakpoints?.entries),
    );
    check(
      "…every boundary is adjacent by construction: above === below + 1",
      (homeBoundaries?.length ?? 0) > 0 &&
        (homeBoundaries ?? []).every((b) => b.above === b.below + 1),
      JSON.stringify(homeBoundaries),
    );
    check(
      "…and no weight is lost or invented: minCount + maxCount === count on every row",
      (homeBoundaries ?? []).every((b) => b.minCount + b.maxCount === b.count),
      JSON.stringify(homeBoundaries),
    );
    check(
      "…and the boundary weights sum to the same folded declarations the entries do",
      (homeBoundaries ?? []).reduce((n, b) => n + b.count, 0) ===
        (homeDesktopBreakpoints?.entries ?? []).reduce((n, e) => n + e.count, 0),
      `${(homeBoundaries ?? []).reduce((n, b) => n + b.count, 0)} vs ${(homeDesktopBreakpoints?.entries ?? []).reduce((n, e) => n + e.count, 0)}`,
    );
    check(
      "the second, unrelated boundary is folded independently rather than merged in",
      JSON.stringify(homeBoundaries?.filter((b) => b.below === 640)) ===
        JSON.stringify([{ below: 640, above: 641, count: 1, minCount: 0, maxCount: 1 }]),
      JSON.stringify(homeBoundaries),
    );
    check(
      "the mobile viewport folds the same authored source independently, never merged",
      JSON.stringify(home.viewports.mobile.authoredBreakpoints?.boundaries) ===
        JSON.stringify(homeBoundaries),
      JSON.stringify(home.viewports.mobile.authoredBreakpoints?.boundaries),
    );
    check(
      "a page whose observation carried NO authored declaration has no record at all",
      alpha.viewports.desktop.authoredBreakpoints === undefined,
      JSON.stringify(alpha.viewports.desktop.authoredBreakpoints),
    );

    console.log("\n§79 static tree fidelity — mixed content ordering");
    const mixed = elementBySourceId(home, "desktop", "e000007")!;
    const rendered = renderSubtree(home, "desktop", mixed.nodeId);
    check(
      "<p>Hello <strong>world</strong> !</p> keeps text / element / text order",
      rendered === '<p>T("Hello ")<strong>T("world")</strong>T(" !")</p>',
      rendered,
    );
    const mixedChildren = mixed.childNodeIds.map(
      (id) => nodesOf(home, "desktop").find((n) => n.nodeId === id)!.type,
    );
    check(
      "the mixed paragraph has exactly three children in document order",
      mixedChildren.join(",") === "text,element,text",
      mixedChildren.join(","),
    );

    console.log("\n§80 long text recovery past the Observer's 200-char cap");
    const longEl = elementBySourceId(home, "desktop", "e000009")!;
    const longText = nodesOf(home, "desktop").find(
      (n) => n.type === "text" && n.parentNodeId === longEl.nodeId,
    );
    check("the long paragraph carries one text node", longText?.type === "text");
    check(
      `SiteSpec text (${longText?.type === "text" ? longText.value.length : 0}) is longer than the Observer's cap (${TEXT_MAX_LEN})`,
      longText?.type === "text" && longText.value.length > TEXT_MAX_LEN,
    );
    check(
      "the recovered text is the FULL original paragraph",
      longText?.type === "text" && longText.value === LONG_TEXT,
    );
    check(
      "content recovery counts the cap hit and the repair",
      home.viewports.desktop.contentRecovery.cappedSourceTextCount === 1 &&
        home.viewports.desktop.contentRecovery.recoveredLongTextCount === 1,
    );

    console.log("\n§81 <pre> whitespace is design, not noise");
    const preEl = elementBySourceId(home, "desktop", "e000010")!;
    const preText = nodesOf(home, "desktop").find(
      (n) => n.type === "text" && n.parentNodeId === preEl.nodeId,
    );
    check(
      "the <pre> text node preserves newlines and indentation verbatim",
      preText?.type === "text" && preText.value === PRE_TEXT,
      preText?.type === "text" ? JSON.stringify(preText.value) : "missing",
    );

    console.log("\n§82 inline SVG stays opaque and alignment survives it");
    const svgEl = elementBySourceId(home, "desktop", "e000011")!;
    check("the <svg> root is compiled as one node", svgEl.tagName === "svg");
    check("the <svg> subtree is NOT in the node tree", svgEl.childNodeIds.length === 0);
    check(
      "the <svg> node records why its subtree is absent",
      svgEl.limitations.includes("svg-subtree-opaque"),
    );
    check(
      "no <circle> / <g> / <rect> node leaked into the tree",
      !nodesOf(home, "desktop").some(
        (n) => n.type === "element" && ["circle", "g", "rect"].includes(n.tagName),
      ),
    );
    const svgAsset = loaded.assetCatalog.assets.find((a) => a.kind === "inline-svg")!;
    check("the inline SVG is preserved in the asset catalog", svgAsset !== undefined);
    check(
      "its <script> element was removed before storage",
      !/<script/i.test(svgAsset.inlineSvg?.markup ?? "") &&
        (svgAsset.inlineSvg?.removed ?? []).includes("script-element"),
      svgAsset.inlineSvg?.markup,
    );
    check(
      "its onload handler was removed before storage",
      !/onload/i.test(svgAsset.inlineSvg?.markup ?? "") &&
        (svgAsset.inlineSvg?.removed ?? []).includes("event-handler-attribute"),
    );
    check(
      "its javascript: href was removed before storage",
      !/javascript:/i.test(svgAsset.inlineSvg?.markup ?? "") &&
        (svgAsset.inlineSvg?.removed ?? []).includes("javascript-url"),
    );
    check(
      "the harmless SVG geometry survived sanitization",
      /<circle/.test(svgAsset.inlineSvg?.markup ?? "") &&
        /<rect/.test(svgAsset.inlineSvg?.markup ?? ""),
    );
    const cleanSvg = sanitizeSvgMarkup('<svg><circle r="1"></circle></svg>');
    check(
      "a clean SVG is reported as NOT sanitized",
      cleanSvg.sanitized === false && cleanSvg.removed.length === 0,
    );

    console.log("\n§83 noise elements never enter the content tree");
    const homeTags = new Set(
      nodesOf(home, "desktop")
        .filter((n): n is ElementSpecNode => n.type === "element")
        .map((n) => n.tagName),
    );
    for (const tag of ["head", "meta", "title", "style", "script", "link", "noscript", "template"]) {
      check(`<${tag}> is absent from the content tree`, !homeTags.has(tag));
    }
    check(
      "the home tree has exactly the Observer's element count",
      home.viewports.desktop.elementNodeCount === HOME_ELEMENTS.length,
      `${home.viewports.desktop.elementNodeCount} vs ${HOME_ELEMENTS.length}`,
    );
    check(
      "home content recovery aligned",
      home.viewports.desktop.contentRecovery.status === "aligned",
    );

    console.log("\n§84 alignment mismatch falls back — it never fuzzy-merges");
    check(
      "the broken page is marked fallback",
      broken.viewports.desktop.contentRecovery.status === "fallback",
      broken.viewports.desktop.contentRecovery.status,
    );
    check(
      "the failure reason is recorded",
      broken.viewports.desktop.contentRecovery.failure === "element-count-mismatch",
      String(broken.viewports.desktop.contentRecovery.failure),
    );
    check(
      "the fallback records mixed-content-order-not-recovered and text-may-be-truncated",
      broken.viewports.desktop.limitations.includes("mixed-content-order-not-recovered") &&
        broken.viewports.desktop.limitations.includes("text-may-be-truncated") &&
        broken.viewports.desktop.limitations.includes("content-recovery-fallback"),
      broken.viewports.desktop.limitations.join(","),
    );
    check(
      "the fallback tree still has every observed element",
      broken.viewports.desktop.elementNodeCount === BROKEN_ELEMENTS.length,
    );
    check(
      "no <aside> from rendered.html leaked into the fallback tree",
      !nodesOf(broken, "desktop").some((n) => n.type === "element" && n.tagName === "aside"),
    );
    check(
      "an aligned page and a broken page can coexist in one SiteSpec",
      home.viewports.desktop.contentRecovery.status === "aligned" &&
        broken.viewports.desktop.contentRecovery.status === "fallback",
    );

    console.log("\n§87/§88/§16 route coverage, representative fallback, validation override");
    const routeByUrl = new Map(loaded.siteSpec.routes.map((r) => [r.url, r]));
    check("all six verified URLs are routes", loaded.siteSpec.routes.length === 6);
    check(
      "route ids follow normalized-URL lexical order",
      loaded.siteSpec.routes.map((r) => r.routeId).join(",") ===
        ["r000001", "r000002", "r000003", "r000004", "r000005", "r000006"].join(","),
    );
    check("/a is exact-observed", routeByUrl.get(URL_A)?.coverage === "exact-observed");
    check(
      "/a2 is validation-sample-observed",
      routeByUrl.get(URL_A2)?.coverage === "validation-sample-observed",
    );
    check("/a3 is family-represented", routeByUrl.get(URL_A3)?.coverage === "family-represented");
    check("/a4 is family-represented", routeByUrl.get(URL_A4)?.coverage === "family-represented");
    check(
      "/a2 renders from its OWN observation, not the representative's",
      routeByUrl.get(URL_A2)?.renderSourcePageId === "p000003",
      routeByUrl.get(URL_A2)?.renderSourcePageId,
    );
    check(
      "/a3 renders from the family REPRESENTATIVE, never the validation sample",
      routeByUrl.get(URL_A3)?.renderSourcePageId === "p000002",
      routeByUrl.get(URL_A3)?.renderSourcePageId,
    );
    check(
      "/a3 does not claim to have been observed",
      routeByUrl.get(URL_A3)?.observedOnThisExactUrl === false &&
        routeByUrl.get(URL_A3)?.pageId === undefined,
    );
    check(
      "/a3 records the borrowed-source limitation",
      routeByUrl.get(URL_A3)?.limitations.includes("route-not-deeply-observed") === true,
    );

    console.log("\n§66/§114 family-represented behavior is never re-attributed");
    check(
      "/a (explored) has exact behavior evidence",
      routeByUrl.get(URL_A)?.behaviorCoverage === "exact-verified" &&
        routeByUrl.get(URL_A)?.behaviorSourcePageId === "p000002",
    );
    check(
      "/a3 behavior is family-represented-unverified, sourced from the representative",
      routeByUrl.get(URL_A3)?.behaviorCoverage === "family-represented-unverified" &&
        routeByUrl.get(URL_A3)?.behaviorSourcePageId === "p000002",
    );
    check(
      "/a2 was observed but not explored — and says so",
      routeByUrl.get(URL_A2)?.behaviorCoverage === "exact-not-explored" &&
        routeByUrl.get(URL_A2)?.behaviorSourcePageId === undefined,
    );
    check(
      "an unexplored page carries no confirmed patterns",
      loaded.pageById.get("p000003")!.interactionCoverage === "not-explored" &&
        loaded.pageById.get("p000003")!.patternIds.length === 0,
    );

    console.log("\n§18/§19 family model");
    const family2 = loaded.siteSpec.families.find((f) => f.familyId === "f000002")!;
    check("the family keeps all four member URLs", family2.memberCount === 4);
    check(
      "observed / represented-only arithmetic is exact",
      family2.exactObservedMemberCount === 2 && family2.representedOnlyMemberCount === 2,
    );
    check(
      "both observed variants are listed",
      family2.observedVariantPageIds.join(",") === "p000002,p000003",
    );
    check(
      "Task 08's coarse-signal evidence is preserved",
      family2.selectionEvidence?.startsWith("shallowSkeleton") === true,
    );
    check(
      "no SiteSpec field renames a family into a component",
      !JSON.stringify(loaded.siteSpec.families).toLowerCase().includes("componentid"),
    );

    console.log("\n§85/§86 global style catalog");
    const blockKey = canonicalStyleKey(STYLE_BLOCK);
    const inlineKey = canonicalStyleKey(STYLE_INLINE);
    check(
      "one identical style shared by two pages AND two viewports is ONE token",
      loaded.styleCatalog.tokenCount === 3,
      `tokens=${loaded.styleCatalog.tokenCount}`,
    );
    check(
      "canonical keys ignore property order",
      canonicalStyleKey({ color: "red", display: "block" }) ===
        canonicalStyleKey({ display: "block", color: "red" }),
    );
    check(
      "the catalog reports the dedup it achieved",
      loaded.styleCatalog.sourceLocalStyleRecordCount === 24 &&
        loaded.styleCatalog.dedupReductionRate > 0.8,
      `local=${loaded.styleCatalog.sourceLocalStyleRecordCount} rate=${loaded.styleCatalog.dedupReductionRate}`,
    );
    check(
      "every element node carries a resolvable style token",
      loaded.pages.every((page) =>
        (["desktop", "mobile"] as ViewportId[]).every((vp) =>
          nodesOf(page, vp).every(
            (n) =>
              n.type !== "element" ||
              (n.styleTokenId !== undefined &&
                loaded.styleCatalog.styles.some((s) => s.styleTokenId === n.styleTokenId)),
          ),
        ),
      ),
    );
    check(
      "a pseudo-element style also uses the global catalog",
      elementBySourceId(home, "desktop", "e000021")?.pseudo?.before?.styleTokenId !== undefined,
    );
    check(
      "no Tailwind/class/design-token vocabulary entered the style catalog",
      !JSON.stringify(loaded.styleCatalog).match(/tailwind|classname|--primary/i),
    );
    void blockKey;
    void inlineKey;

    console.log("\n§50–§53 asset catalog");
    check(
      "the shared image URL is ONE asset across two pages",
      loaded.assetCatalog.assets.filter((a) => a.kind === "image").length === 1,
    );
    const image = loaded.assetCatalog.assets.find((a) => a.kind === "image")!;
    // Two pages × two viewports = four occurrences of one file.
    check("its usage count spans every occurrence", image.usageCount === 4, String(image.usageCount));
    check(
      "it records the pages it was seen on",
      image.sourcePageIds.join(",") === "p000001,p000002",
      image.sourcePageIds.join(","),
    );
    check("a mime hint is derived from the extension", image.mimeHint === "image/png");
    check("same-origin is computed against the site root", image.sameOrigin === true);
    check(
      "a CDN font is correctly marked cross-origin",
      loaded.assetCatalog.assets.find((a) => a.kind === "font")?.sameOrigin === false,
    );
    check(
      "the srcset candidate keeps its descriptor as part of its identity",
      loaded.assetCatalog.assets.find((a) => a.kind === "image-srcset")?.descriptor === "2x",
    );
    const img = elementBySourceId(home, "desktop", "e000023")!;
    check(
      "the <img> node references both of its assets",
      img.assetRefs.length === 2 &&
        img.assetRefs.every((ref) =>
          loaded.assetCatalog.assets.some((a) => a.assetId === ref),
        ),
    );
    check(
      "a page-level asset with no element is still in the viewport reference list",
      home.viewports.desktop.assetRefs.length === 4,
      String(home.viewports.desktop.assetRefs.length),
    );

    console.log("\n§94 safe reconstruction attributes");
    const body = elementBySourceId(home, "desktop", "e000002")!;
    check("class is not compiled", body.attributes["class"] === undefined);
    check("data-* is not compiled", body.attributes["data-secret"] === undefined);
    check(
      "no data-* survives anywhere in the SiteSpec pages",
      !loaded.pages.some((page) =>
        (["desktop", "mobile"] as ViewportId[]).some((vp) =>
          nodesOf(page, vp).some(
            (n) => n.type === "element" && Object.keys(n.attributes).some((k) => k.startsWith("data-")),
          ),
        ),
      ),
    );
    const trigger = elementBySourceId(home, "desktop", "e000012")!;
    check("onclick is not compiled", trigger.attributes["onclick"] === undefined);
    check("style is not compiled", trigger.attributes["style"] === undefined);
    check("aria-* IS preserved", trigger.attributes["aria-expanded"] === "false");
    check("aria-controls IS preserved", trigger.attributes["aria-controls"] === "panel");
    check("id becomes sourceHtmlId, not an attribute", trigger.attributes["id"] === undefined && trigger.sourceHtmlId === "trigger");
    check(
      "sourceHtmlId is flagged as a hint, not identity",
      trigger.limitations.includes("source-html-id-not-identity"),
    );
    const panel = elementBySourceId(home, "desktop", "e000013")!;
    check("role IS preserved and lifted", panel.attributes["role"] === "region" && panel.role === "region");
    check("alt IS preserved", img.attributes["alt"] === "A picture");
    check("width/height IS preserved", img.attributes["width"] === "100" && img.attributes["height"] === "50");
    check("src is expressed as an asset, not an attribute", img.attributes["src"] === undefined);
    const jump = elementBySourceId(home, "desktop", "e000021")!;
    check("a normal href IS preserved", jump.attributes["href"] === "#panel");
    const jsLink = elementBySourceId(home, "desktop", "e000022")!;
    check("a javascript: href is dropped", jsLink.attributes["href"] === undefined);
    check(
      "…and the drop is recorded",
      jsLink.limitations.includes("javascript-href-removed"),
    );
    const emailInput = elementBySourceId(home, "desktop", "e000017")!;
    check("a public text input value IS preserved", emailInput.attributes["value"] === "a@b.c");
    check("placeholder IS preserved", emailInput.attributes["placeholder"] === "you@example.com");
    const password = elementBySourceId(home, "desktop", "e000018")!;
    const hidden = elementBySourceId(home, "desktop", "e000019")!;
    check("a password value is never compiled", password.attributes["value"] === undefined);
    check("a hidden input value is never compiled", hidden.attributes["value"] === undefined);
    check(
      "the hidden input NODE survives (structure) without its value",
      hidden.tagName === "input" && hidden.attributes["type"] === "hidden",
    );
    check(
      "…and both drops are recorded",
      password.limitations.includes("sensitive-input-value-not-compiled") &&
        hidden.limitations.includes("sensitive-input-value-not-compiled"),
    );
    const serializedPages = JSON.stringify(loaded.pages);
    check("no secret token value survives anywhere", !serializedPages.includes("SECRET-TOKEN"));
    check("no password value survives anywhere", !serializedPages.includes("hunter2"));
    check("no data-secret value survives anywhere", !serializedPages.includes("TOP-SECRET"));
    check("no inline handler source survives anywhere", !serializedPages.includes("go()"));

    console.log("\n§38 form safety");
    const form = elementBySourceId(home, "desktop", "e000015")!;
    check("the form's action endpoint is NOT in the IR", !serializedPages.includes("/api/subscribe"));
    check("only a diagnostic boolean records that one existed", form.sourceHasFormAction === true);
    check(
      "…and the limitation says why",
      form.limitations.includes("form-action-not-compiled"),
    );

    console.log("\n§95 node relations");
    const controls = trigger.relations.find((r) => r.type === "aria-controls")!;
    check(
      "aria-controls resolves to the panel node in the SAME viewport",
      controls.resolved && controls.resolvedNodeId === panel.nodeId,
      JSON.stringify(controls),
    );
    const menuTrigger = elementBySourceId(home, "desktop", "e000014")!;
    const unresolved = menuTrigger.relations.find((r) => r.type === "aria-controls")!;
    check(
      "an aria-controls with no static target is preserved as unresolved",
      unresolved.resolved === false &&
        unresolved.sourceValue === "dynamic-menu" &&
        unresolved.resolvedNodeId === undefined,
    );
    const labelledby = panel.relations.find((r) => r.type === "aria-labelledby")!;
    check("aria-labelledby resolves", labelledby.resolved && labelledby.resolvedNodeId === trigger.nodeId);
    const label = elementBySourceId(home, "desktop", "e000016")!;
    const labelFor = label.relations.find((r) => r.type === "label-for")!;
    check("label[for] resolves to its input", labelFor.resolvedNodeId === emailInput.nodeId);
    const fragment = jump.relations.find((r) => r.type === "href-fragment")!;
    check("an href fragment resolves to the target node", fragment.resolvedNodeId === panel.nodeId);
    const mobilePanel = elementBySourceId(home, "mobile", "e000013")!;
    check(
      "§42 relations never resolve across viewports",
      controls.resolvedNodeId !== undefined &&
        nodesOf(home, "desktop").some((n) => n.nodeId === controls.resolvedNodeId) &&
        mobilePanel.nodeId !== undefined,
    );

    // -----------------------------------------------------------------------
    // Task 13.1 — reconstruction-critical attribute recovery
    // -----------------------------------------------------------------------

    console.log("\n§6/§7 the supplemental allowlist is closed and disjoint");
    check(
      "every allowlisted name is outside the Observer's own whitelist",
      SUPPLEMENTAL_ATTRIBUTE_NAMES.every((name) => !OBSERVER_ATTR_WHITELIST.includes(name)),
    );
    check(
      "no denied name or prefix is on the allowlist",
      SUPPLEMENTAL_ATTRIBUTE_NAMES.every(
        (name) =>
          !SUPPLEMENTAL_DENYLIST.includes(name) &&
          !SUPPLEMENTAL_DENIED_PREFIXES.some((prefix) => name.startsWith(prefix)),
      ),
    );
    // The real guard runs at module load over the real list; these prove it
    // would actually reject the two mistakes it exists to catch.
    const policyRejects = (bad: Record<string, "value">): boolean => {
      try {
        assertSupplementalAttributePolicy({ ...SUPPLEMENTAL_ATTRIBUTES, ...bad });
        return false;
      } catch (err) {
        return err instanceof Error && err.message.includes(Object.keys(bad)[0]!);
      }
    };
    check("adding formaction to the allowlist fails the policy", policyRejects({ formaction: "value" }));
    check("adding a data-* name fails the policy", policyRejects({ "data-x": "value" }));
    check("adding an already-observed name fails the policy", policyRejects({ title: "value" }));
    check("the shipped allowlist itself passes the policy", (() => {
      try {
        assertSupplementalAttributePolicy();
        return true;
      } catch {
        return false;
      }
    })());

    console.log("\n§22 table semantics recovered from the aligned parse tree");
    const th = elementBySourceId(home, "desktop", "e000027")!;
    check("scope is recovered", th.attributes["scope"] === "col", JSON.stringify(th.attributes));
    check("colspan is recovered", th.attributes["colspan"] === "2");
    check(
      "…and both are named as recovered, sorted",
      th.recoveredAttributeNames?.join(",") === "colspan,scope",
      String(th.recoveredAttributeNames),
    );
    const c1 = elementBySourceId(home, "desktop", "e000030")!;
    check("rowspan is recovered", c1.attributes["rowspan"] === "2");
    check(
      "§15 a cell with no colspan does NOT gain an invented colspan=1",
      c1.attributes["colspan"] === undefined,
    );
    check(
      "§14 an ALIGNED viewport with table cells carries no table limitation",
      !home.viewports.desktop.limitations.includes("table-cell-attributes-not-recovered"),
      home.viewports.desktop.limitations.join(","),
    );

    console.log("\n§27 the existing observed value always wins");
    const c2 = elementBySourceId(home, "desktop", "e000031")!;
    check(
      "an observed colspan is not overwritten by the parsed one",
      c2.attributes["colspan"] === "9",
      c2.attributes["colspan"],
    );
    check(
      "…and it is not claimed as recovered",
      !(c2.recoveredAttributeNames ?? []).includes("colspan"),
    );
    check(
      "an observed aria-label survives a different parsed one",
      th.attributes["aria-label"] === "source-value",
      th.attributes["aria-label"],
    );
    check(
      "the parsed-only value exists nowhere in the IR",
      !serializedPages.includes("parsed-value"),
    );

    console.log("\n§23 native declarative state");
    const acc = elementBySourceId(home, "desktop", "e000032")!;
    check("<details open> is recovered as presence", acc.attributes["open"] === "");
    const dis = elementBySourceId(home, "desktop", "e000035")!;
    check(
      '§9 disabled="disabled" normalizes to presence',
      dis.attributes["disabled"] === "",
      JSON.stringify(dis.attributes["disabled"]),
    );
    const ro = elementBySourceId(home, "desktop", "e000036")!;
    check("readonly is recovered", ro.attributes["readonly"] === "");
    check("…without disturbing the observed value", ro.attributes["value"] === "fixed");
    const chk = elementBySourceId(home, "desktop", "e000037")!;
    check('checked="" is recovered as presence', chk.attributes["checked"] === "");
    const sel = elementBySourceId(home, "desktop", "e000038")!;
    check("<select multiple> is recovered", sel.attributes["multiple"] === "");
    const o1 = elementBySourceId(home, "desktop", "e000039")!;
    const o2 = elementBySourceId(home, "desktop", "e000040")!;
    check("a selected <option> is recovered", o1.attributes["selected"] === "");
    check("…and an unselected one stays unselected", o2.attributes["selected"] === undefined);
    const num = elementBySourceId(home, "desktop", "e000041")!;
    check(
      "required + autofocus are recovered together",
      num.attributes["required"] === "" && num.attributes["autofocus"] === "",
    );

    console.log("\n§24 editable / numeric / enumerated values");
    check(
      "min / max / step survive verbatim",
      num.attributes["min"] === "1" &&
        num.attributes["max"] === "10" &&
        num.attributes["step"] === "0.5",
    );
    check(
      "minlength / maxlength / pattern survive verbatim",
      num.attributes["minlength"] === "1" &&
        num.attributes["maxlength"] === "4" &&
        num.attributes["pattern"] === "[0-9.]+",
    );
    const upload = elementBySourceId(home, "desktop", "e000042")!;
    check("accept survives verbatim", upload.attributes["accept"] === "image/png");
    check(
      "§8 a file input still has no value",
      upload.attributes["value"] === undefined,
    );
    const editor = elementBySourceId(home, "desktop", "e000043")!;
    check(
      "§10 contenteditable keeps its enumerated value",
      editor.attributes["contenteditable"] === "plaintext-only",
      editor.attributes["contenteditable"],
    );
    check("spellcheck keeps its value", editor.attributes["spellcheck"] === "false");
    const untilFound = elementBySourceId(home, "desktop", "e000044")!;
    check(
      '§10 hidden="until-found" is NOT collapsed to presence',
      untilFound.attributes["hidden"] === "until-found",
      untilFound.attributes["hidden"],
    );
    check(
      "…while a bare hidden is stored as presence",
      panel.attributes["hidden"] === "",
      JSON.stringify(panel.attributes["hidden"]),
    );
    const list = elementBySourceId(home, "desktop", "e000045")!;
    check(
      "<ol start reversed> is recovered (it changes what the reader sees)",
      list.attributes["start"] === "3" && list.attributes["reversed"] === "",
    );
    const when = elementBySourceId(home, "desktop", "e000047")!;
    check(
      "<time datetime> keeps its machine-readable value",
      when.attributes["datetime"] === "2026-08-14T09:00",
    );

    console.log("\n§25 native popover + §18 relation");
    const popBtn = elementBySourceId(home, "desktop", "e000048")!;
    const pop = elementBySourceId(home, "desktop", "e000049")!;
    check(
      "popovertarget + popovertargetaction are recovered",
      popBtn.attributes["popovertarget"] === "pop" &&
        popBtn.attributes["popovertargetaction"] === "toggle",
    );
    check("popover keeps its enumerated state", pop.attributes["popover"] === "auto");
    const popRelation = popBtn.relations.find((r) => r.type === "popover-target");
    check(
      "a recovered popovertarget becomes a resolved viewport-local relation",
      popRelation?.resolved === true && popRelation.resolvedNodeId === pop.nodeId,
      JSON.stringify(popRelation),
    );
    const popMissing = elementBySourceId(home, "desktop", "e000050")!;
    const ghost = popMissing.relations.find((r) => r.type === "popover-target");
    check(
      "…and a popovertarget with no target stays honestly unresolved",
      ghost?.resolved === false && ghost.sourceValue === "ghost",
    );

    console.log("\n§26 the same aligned HTML is not a way in");
    const atkForm = elementBySourceId(home, "desktop", "e000051")!;
    const atkHidden = elementBySourceId(home, "desktop", "e000052")!;
    const atkBtn = elementBySourceId(home, "desktop", "e000053")!;
    const atkLink = elementBySourceId(home, "desktop", "e000054")!;
    check(
      "only the allowlisted attribute of the attack button is recovered",
      atkBtn.recoveredAttributeNames?.join(",") === "disabled" &&
        atkBtn.attributes["disabled"] === "",
      JSON.stringify(atkBtn.attributes),
    );
    for (const denied of [
      "class",
      "style",
      "data-secret",
      "onclick",
      "formaction",
      "formmethod",
      "formenctype",
      "download",
    ]) {
      check(`${denied} is not recovered`, atkBtn.attributes[denied] === undefined);
    }
    check(
      "the attack form's action is still only a boolean",
      atkForm.sourceHasFormAction === true &&
        atkForm.attributes["action"] === undefined &&
        atkForm.attributes["method"] === undefined &&
        atkForm.attributes["enctype"] === undefined,
    );
    check(
      "a hidden input value present ONLY in rendered.html is not recovered",
      atkHidden.attributes["value"] === undefined,
    );
    check(
      "a javascript: href present ONLY in rendered.html is not recovered",
      atkLink.attributes["href"] === undefined,
    );
    const wholeArtifact =
      serializedPages +
      JSON.stringify(loaded.siteSpec) +
      JSON.stringify(loaded.interactionSpec) +
      JSON.stringify(loaded.styleCatalog) +
      JSON.stringify(loaded.assetCatalog);
    for (const forbidden of [
      "original.example",
      "SUPPLEMENTAL-SECRET",
      "ATTACK-PAYLOAD",
      "steal()",
      "javascript:alert",
      "multipart/form-data",
      "color:red",
      '"secret"',
      "x.txt",
    ]) {
      check(`the string ${forbidden} exists nowhere in the SiteSpec`, !wholeArtifact.includes(forbidden));
    }

    console.log("\n§11/§35 recovery provenance is recorded, and only where real");
    const homeNodes = nodesOf(home, "desktop").filter(
      (n): n is ElementSpecNode => n.type === "element",
    );
    check(
      "ordinary nodes carry no recoveredAttributeNames field at all",
      homeNodes.some((n) => n.recoveredAttributeNames === undefined) &&
        !homeNodes.some((n) => n.recoveredAttributeNames?.length === 0),
    );
    check(
      "every named recovery really is in the attribute map and on the allowlist",
      homeNodes.every((n) =>
        (n.recoveredAttributeNames ?? []).every(
          (name) =>
            n.attributes[name] !== undefined &&
            Object.hasOwn(SUPPLEMENTAL_ATTRIBUTES, name),
        ),
      ),
    );
    const homeRecovery = home.viewports.desktop.contentRecovery;
    check(
      "§12 the viewport counts what it recovered",
      homeRecovery.supplementalElementCount ===
        homeNodes.filter((n) => n.recoveredAttributeNames !== undefined).length &&
        homeRecovery.supplementalAttributeCount ===
          homeNodes.reduce((t, n) => t + (n.recoveredAttributeNames?.length ?? 0), 0),
      `${homeRecovery.supplementalElementCount}/${homeRecovery.supplementalAttributeCount}`,
    );
    check(
      "…and names them",
      homeRecovery.supplementalAttributeNames.includes("colspan") &&
        homeRecovery.supplementalAttributeNames.includes("popover"),
      homeRecovery.supplementalAttributeNames.join(","),
    );
    check(
      "the site stats agree with the sum of the viewports",
      loaded.siteSpec.stats.supplementalAttributeCount ===
        loaded.pages.reduce(
          (total, page) =>
            total +
            page.viewports.desktop.contentRecovery.supplementalAttributeCount +
            page.viewports.mobile.contentRecovery.supplementalAttributeCount,
          0,
        ),
    );
    check(
      "the per-name site counts sum to the same total",
      Object.values(loaded.siteSpec.stats.supplementalAttributeNameCounts).reduce(
        (a, b) => a + b,
        0,
      ) === loaded.siteSpec.stats.supplementalAttributeCount,
    );

    console.log("\n§28 a fallback viewport recovers nothing at all");
    for (const viewportId of ["desktop", "mobile"] as ViewportId[]) {
      const fallbackViewport = broken.viewports[viewportId];
      check(
        `${viewportId}: the fallback viewport recovered 0 attributes`,
        fallbackViewport.contentRecovery.supplementalAttributeCount === 0 &&
          fallbackViewport.contentRecovery.supplementalElementCount === 0 &&
          fallbackViewport.contentRecovery.supplementalAttributeNames.length === 0,
      );
      check(
        `${viewportId}: no node claims a recovered attribute`,
        !nodesOf(broken, viewportId).some(
          (n) => n.type === "element" && n.recoveredAttributeNames !== undefined,
        ),
      );
      check(
        `${viewportId}: §13 the gap is recorded as a limitation`,
        fallbackViewport.limitations.includes("supplemental-attributes-not-recovered"),
      );
      check(
        `${viewportId}: §14 a fallback viewport WITH table cells keeps the table limitation`,
        fallbackViewport.limitations.includes("table-cell-attributes-not-recovered"),
        fallbackViewport.limitations.join(","),
      );
    }
    const brokenCell = elementBySourceId(broken, "desktop", "e000011")!;
    check(
      "a colspan plainly written in the unaligned HTML is still not compiled",
      brokenCell.tagName === "td" &&
        brokenCell.attributes["colspan"] === undefined &&
        brokenCell.attributes["rowspan"] === undefined,
    );
    const brokenDetails = elementBySourceId(broken, "desktop", "e000006")!;
    const brokenButton = elementBySourceId(broken, "desktop", "e000012")!;
    check(
      "…and neither are open / disabled",
      brokenDetails.attributes["open"] === undefined &&
        brokenButton.attributes["disabled"] === undefined,
    );

    console.log("\n§29 determinism of the supplemental channel");
    const miniDom = [
      { id: "e1", tagName: "html" },
      { id: "e2", parentId: "e1", tagName: "body" },
      { id: "e3", parentId: "e2", tagName: "input" },
    ];
    const compileMini = (attrs: string): string => {
      const html = `<!DOCTYPE html><html><body><input ${attrs}></body></html>`;
      const alignment = alignRenderedHtml(html, miniDom);
      if (alignment.status !== "aligned") return `NOT-ALIGNED:${alignment.failure}`;
      const compiled = compileAttributes(
        "input",
        {},
        alignment.supplementalAttributes.get(2) ?? {},
      );
      return JSON.stringify([compiled.attributes, compiled.recoveredAttributeNames]);
    };
    const orderA = compileMini("disabled required autofocus");
    const orderB = compileMini("autofocus disabled required");
    check(
      "attribute source order does not change the compiled output",
      orderA === orderB && orderA.includes("autofocus"),
      `${orderA} vs ${orderB}`,
    );
    check(
      "the serialized attribute keys are sorted",
      orderA.startsWith('[{"autofocus":"","disabled":"","required":""}'),
      orderA,
    );
    check(
      "§9 all three boolean spellings compile to the same fact",
      compileMini("disabled") === compileMini('disabled=""') &&
        compileMini("disabled") === compileMini('disabled="disabled"'),
      compileMini('disabled="disabled"'),
    );

    console.log("\n§89–§92 interaction join");
    const spec = loaded.interactionSpec;
    check("all three confirmed patterns are compiled", spec.patterns.length === 3);
    const p1 = spec.patterns.find((p) => p.patternId === "ip000001")!;
    check(
      "a pattern's trigger element id becomes a SiteSpec node id",
      p1.triggerNodeId === trigger.nodeId && p1.triggerSourceElementId === "e000012",
      `${p1.triggerNodeId} vs ${trigger.nodeId}`,
    );
    check(
      "a declared, static target resolves to a node",
      p1.target?.staticNodeResolved === true && p1.target.targetNodeId === panel.nodeId,
    );
    const p2 = spec.patterns.find((p) => p.patternId === "ip000002")!;
    check(
      "a dynamically mounted target is NOT resolved to a static node",
      p2.target?.staticNodeResolved === false && p2.target.targetNodeId === undefined,
    );
    check("…it is marked dynamic", p2.target?.dynamic === true);
    check("…its transition is recorded as mounted", p2.target?.transition === "mounted");
    check(
      "…its observed shape and descendant census survive",
      p2.target?.observedRole === "menu" &&
        p2.target.descendantsSummary?.interactiveDescendantsAfter === 3,
    );
    check(
      "…and the limitation states the structure was never observed",
      p2.limitations.includes("dynamic-target-not-in-static-dom"),
    );
    check(
      "§60 no invented node was inserted for the dynamic target",
      !nodesOf(home, "desktop").some(
        (n) => n.type === "element" && n.sourceHtmlId === "dynamic-menu",
      ),
    );
    check("the pattern itself is still preserved", p2.patternType === "menu");
    const p3 = spec.patterns.find((p) => p.patternId === "ip000003")!;
    const summary = elementBySourceId(alpha, "desktop", "e000005")!;
    const details = elementBySourceId(alpha, "desktop", "e000004")!;
    check(
      "§112 a native <summary> trigger links to its <details> target through the tree",
      p3.triggerNodeId === summary.nodeId && p3.target?.targetNodeId === details.nodeId,
    );
    check(
      "Task 12's own free-text limitations are preserved verbatim",
      p1.sourceLimitations[0] === "Only this one transition direction was observed.",
    );
    check(
      "rule provenance travels with the IR",
      p1.provenance.ruleId === "disclosure-aria-expanded-v1" && p1.provenance.level === "derived",
    );
    check(
      "only rules that produced a pattern are listed",
      spec.rules.length === 3 && !spec.rules.some((r) => r.ruleId === "unused-rule-v1"),
    );
    check(
      "pages index their own behaviors",
      home.patternIds.join(",") === "ip000001,ip000002" && alpha.patternIds.join(",") === "ip000003",
    );
    check(
      "an explored page is marked explored",
      home.interactionCoverage === "explored" && alpha.interactionCoverage === "explored",
    );
    check(
      "§65 an unexplored page is marked, not silently empty",
      broken.interactionCoverage === "not-explored" &&
        broken.limitations.includes("page-interactions-not-explored"),
    );

    console.log("\n§92/§62 unknown interactions are preserved, never promoted");
    check("the unknown case is compiled", spec.unknownInteractions.length === 1);
    const unknown = spec.unknownInteractions[0]!;
    check("its reason is unchanged", unknown.reason === "unmatched-transition");
    check("its Task 11 status is preserved", unknown.status === "changed");
    check("its trigger resolves to a node", unknown.triggerNodeId === jump.nodeId);
    check("its partial hints survive", unknown.partialPatternHints[0]?.ruleId === "menu-target-mounted-v1");
    check("its AI eligibility survives", unknown.aiEligibility === "eligible");
    check(
      "an inviting aria-label did NOT promote it to a menu pattern",
      !spec.patterns.some((p) => p.patternId === "iu000001") &&
        !spec.patterns.some((p) => p.triggerSourceElementId === "e000021"),
    );

    console.log("\n§93/§64 fake AI is ignored unless explicitly named");
    check(
      "ai-analysis.json sits right next to the inputs",
      (await stat(paths.aiFile)).isFile(),
    );
    check("the default compile has ZERO inferred interactions", spec.inferredInteractions.length === 0);
    check(
      "…and the provenance ledger says so",
      loaded.siteSpec.provenanceSummary.hasAiInference === false &&
        loaded.siteSpec.provenanceSummary.inferredFactCount === 0,
    );
    check(
      "…and no page claims inferred ids",
      loaded.pages.every((page) => page.inferredInteractionIds === undefined),
    );

    const aiInputs = await loadInputs({
      patternsFile: paths.patternsFile,
      aiAnalysisFile: paths.aiFile,
    });
    const aiCompiled = await compileSiteSpec(aiInputs);
    assertSiteSpecValid(aiCompiled);
    check(
      "an explicit --ai-analysis produces exactly one inference",
      aiCompiled.interactionSpec.inferredInteractions.length === 1,
    );
    check(
      "…it lands ONLY in inferredInteractions[]",
      aiCompiled.interactionSpec.patterns.length === 3 &&
        !aiCompiled.interactionSpec.patterns.some((p) => p.provenance.level === "inferred"),
    );
    check(
      "…it keeps provenance inferred and names its provider",
      aiCompiled.interactionSpec.inferredInteractions[0]?.provenance.level === "inferred" &&
        aiCompiled.interactionSpec.inferredInteractions[0]?.provider === "fake",
    );
    check(
      "…the confident wrong guess did NOT become a confirmed menu",
      aiCompiled.interactionSpec.inferredInteractions[0]?.proposedPatternType === "menu" &&
        aiCompiled.interactionSpec.unknownInteractions[0]?.reason === "unmatched-transition",
    );
    check(
      "…and the ledger flips to hasAiInference",
      aiCompiled.siteSpec.provenanceSummary.hasAiInference === true &&
        aiCompiled.siteSpec.provenanceSummary.inferredFactCount === 1,
    );

    console.log("\n§90 a pattern whose trigger is not in the tree FAILS the compile");
    const brokenModelDir = path.join(tmp, "broken-model");
    await cp(paths.modelDir, brokenModelDir, { recursive: true });
    const brokenPatternsFile = path.join(brokenModelDir, "interaction-patterns.json");
    const brokenPatterns = JSON.parse(await readFile(brokenPatternsFile, "utf8"));
    brokenPatterns.patterns[0].source.sourceElementId = "e999999";
    await writeFile(brokenPatternsFile, JSON.stringify(brokenPatterns, null, 2) + "\n", "utf8");
    let failed = false;
    let message = "";
    try {
      const bad = await loadInputs({ patternsFile: brokenPatternsFile });
      await compileSiteSpec(bad);
    } catch (err) {
      failed = true;
      message = err instanceof Error ? err.message : String(err);
    }
    check("compilation fails fast", failed, "it did not fail");
    check(
      "…and the error names the unresolvable trigger",
      message.includes("e999999") && message.toLowerCase().includes("trigger"),
      message,
    );

    console.log("\n§96 self-contained consumer: source artifacts deleted");
    const isolatedOut = path.join(tmp, "out-isolated");
    await cp(outDir, isolatedOut, { recursive: true });
    await rm(fixtureRoot, { recursive: true, force: true });
    const afterDeletion = await loadSiteSpec(path.join(isolatedOut, "site-spec.json"));
    check("loadSiteSpec still succeeds with every source run deleted", afterDeletion.pages.length === 4);
    check(
      "§30 the recovered attributes survive the deletion of rendered.html itself",
      (() => {
        const cell = afterDeletion.pages
          .find((p) => p.pageId === "p000001")!
          .viewports.desktop.nodes.find(
            (n): n is ElementSpecNode =>
              n.type === "element" && n.sourceElementId === "e000027",
          )!;
        return cell.attributes["colspan"] === "2" && cell.attributes["scope"] === "col";
      })(),
    );
    check(
      "…and the full invariant set still passes",
      validateSiteSpec(afterDeletion).length === 0,
      validateSiteSpec(afterDeletion).slice(0, 3).join(" | "),
    );
    check(
      "…with all reconstruction data present (nodes, text, styles, geometry, assets)",
      afterDeletion.pages.every((page) =>
        (["desktop", "mobile"] as ViewportId[]).every((vp) => {
          const viewport = page.viewports[vp];
          return (
            viewport.nodes.length > 0 &&
            viewport.rootNodeIds.length > 0 &&
            viewport.nodes.some((n) => n.type === "text") &&
            viewport.nodes.every(
              (n) => n.type !== "element" || (n.styleTokenId !== undefined && n.boundingBox !== undefined),
            )
          );
        }),
      ),
    );
    check(
      "…and the interaction joins still resolve",
      afterDeletion.interactionSpec.patterns.every((pattern) => {
        const page = afterDeletion.pageById.get(pattern.pageId);
        return page?.viewports[pattern.viewport].nodes.some(
          (n) => n.nodeId === pattern.triggerNodeId,
        );
      }),
    );
    check(
      "…the source paths are still recorded for AUDIT, pointing at the deleted runs",
      afterDeletion.siteSpec.source.siteObservation.length > 0,
    );
    check(
      "§73 no reconstruction data lives outside the SiteSpec root",
      afterDeletion.rootDir === path.resolve(isolatedOut),
    );

    console.log("\n§74 path safety");
    check(
      "every internal file reference is relative",
      [
        afterDeletion.siteSpec.styleCatalogFile,
        afterDeletion.siteSpec.assetCatalogFile,
        afterDeletion.siteSpec.interactionSpecFile,
        ...afterDeletion.siteSpec.pages.map((p) => p.file),
      ].every((ref) => !ref.startsWith("/") && !ref.includes("..")),
    );
    check(
      "§99 no absolute filesystem path anywhere in site-spec.json",
      !/"[A-Za-z]?:?\/(Users|home|var|tmp|private)\//.test(JSON.stringify(afterDeletion.siteSpec)),
    );
    const traversalDir = path.join(tmp, "traversal");
    await cp(isolatedOut, traversalDir, { recursive: true });
    const traversalSpecFile = path.join(traversalDir, "site-spec.json");
    const traversalSpec = JSON.parse(await readFile(traversalSpecFile, "utf8"));
    traversalSpec.styleCatalogFile = "../style-catalog.json";
    await writeFile(traversalSpecFile, JSON.stringify(traversalSpec, null, 2) + "\n", "utf8");
    let traversalRejected = false;
    try {
      await loadSiteSpec(traversalSpecFile);
    } catch (err) {
      traversalRejected = err instanceof SiteSpecLoadError && err.message.includes("escapes");
    }
    check("a `..` file reference is rejected by the loader", traversalRejected);

    const absoluteDir = path.join(tmp, "absolute");
    await cp(isolatedOut, absoluteDir, { recursive: true });
    const absoluteSpecFile = path.join(absoluteDir, "site-spec.json");
    const absoluteSpec = JSON.parse(await readFile(absoluteSpecFile, "utf8"));
    absoluteSpec.interactionSpecFile = "/etc/passwd";
    await writeFile(absoluteSpecFile, JSON.stringify(absoluteSpec, null, 2) + "\n", "utf8");
    let absoluteRejected = false;
    try {
      await loadSiteSpec(absoluteSpecFile);
    } catch (err) {
      absoluteRejected = err instanceof SiteSpecLoadError && err.message.includes("absolute");
    }
    check("an absolute file reference is rejected by the loader", absoluteRejected);

    console.log("\n§98 Zod round-trip + §99 invariants");
    check(
      "the artifact that was written parses back through the SiteSpec schemas",
      afterDeletion.siteSpec.schemaVersion === SCHEMA_VERSION &&
        afterDeletion.styleCatalog.schemaVersion === SCHEMA_VERSION &&
        afterDeletion.assetCatalog.schemaVersion === SCHEMA_VERSION &&
        afterDeletion.interactionSpec.schemaVersion === SCHEMA_VERSION,
    );
    const tampered = structuredClone(afterDeletion);
    (tampered.pages[0]!.viewports.desktop.nodes[1] as ElementSpecNode).styleTokenId = "st999999";
    check(
      "a dangling style token is caught by the invariants",
      validateSiteSpec(tampered).some((v) => v.includes("dangling styleTokenId")),
    );
    const tampered2 = structuredClone(afterDeletion);
    tampered2.siteSpec.routes.splice(0, 1);
    check(
      "a missing verified route is caught when the expectation is supplied",
      validateSiteSpec(tampered2, {
        expectedVerifiedUrls: [URL_HOME, URL_A, URL_A2, URL_A3, URL_A4, URL_BROKEN],
      }).some((v) => v.includes("missing from the route table")),
    );

    // Task 13.1: the same treatment for the new channel. Each of these is a way
    // a future change could quietly widen the recovery, so each one is a caught
    // violation rather than a convention.
    const findNode = (
      bundle: typeof afterDeletion,
      pageId: string,
      sourceElementId: string,
    ): ElementSpecNode =>
      bundle.pages
        .find((p) => p.pageId === pageId)!
        .viewports.desktop.nodes.find(
          (n): n is ElementSpecNode =>
            n.type === "element" && n.sourceElementId === sourceElementId,
        )!;

    const tamperedAllowlist = structuredClone(afterDeletion);
    const smuggled = findNode(tamperedAllowlist, "p000001", "e000027");
    smuggled.attributes["onclick"] = "boom()";
    smuggled.recoveredAttributeNames = ["colspan", "onclick", "scope"];
    check(
      "a recovered attribute outside the allowlist is caught",
      validateSiteSpec(tamperedAllowlist).some((v) => v.includes("not on the allowlist")),
    );

    const tamperedFallback = structuredClone(afterDeletion);
    const fallbackCell = findNode(tamperedFallback, "p000004", "e000011");
    fallbackCell.attributes["colspan"] = "3";
    fallbackCell.recoveredAttributeNames = ["colspan"];
    check(
      "a recovery claimed on a FALLBACK viewport is caught",
      validateSiteSpec(tamperedFallback).some((v) =>
        v.includes("claims recovered attributes on a fallback viewport"),
      ),
    );

    const tamperedBoolean = structuredClone(afterDeletion);
    findNode(tamperedBoolean, "p000001", "e000032").attributes["open"] = "open";
    check(
      "a boolean attribute stored as a string instead of presence is caught",
      validateSiteSpec(tamperedBoolean).some((v) => v.includes("instead of presence")),
    );

    const tamperedStats = structuredClone(afterDeletion);
    tamperedStats.siteSpec.stats.supplementalAttributeCount += 1;
    check(
      "a supplemental total that disagrees with the pages is caught",
      validateSiteSpec(tamperedStats).some((v) =>
        v.includes("stats.supplementalAttributeCount"),
      ),
    );

    console.log("\n§97 determinism");
    // The first fixture is gone (§96 deleted it), so determinism is measured on
    // a freshly written IDENTICAL copy: same content, different directory name.
    const rebuiltRoot = path.join(tmp, "fixture-2");
    const rebuilt = await writeFixture(rebuiltRoot);
    const rebuiltBefore = await snapshotTree(rebuiltRoot);

    const secondOut = path.join(tmp, "out-2");
    const runA = await compileSiteSpec(await loadInputs({ patternsFile: rebuilt.patternsFile }));
    await saveSiteSpec(secondOut, runA);

    const thirdOut = path.join(tmp, "out-3");
    const runARepeat = await compileSiteSpec(
      await loadInputs({ patternsFile: rebuilt.patternsFile }),
    );
    await saveSiteSpec(thirdOut, runARepeat);

    const reversedRoot = path.join(tmp, "fixture-reversed");
    const reversed = await writeFixture(reversedRoot, true);
    const runB = await compileSiteSpec(await loadInputs({ patternsFile: reversed.patternsFile }));
    const reversedOut = path.join(tmp, "out-reversed");
    await saveSiteSpec(reversedOut, runB);

    const filesA = await readAllFiles(secondOut);
    const filesARepeat = await readAllFiles(thirdOut);
    const filesB = await readAllFiles(reversedOut);
    check(
      "the same input compiled twice is byte-identical",
      filesA.size === filesARepeat.size &&
        [...filesA.keys()].every((name) => filesA.get(name) === filesARepeat.get(name)),
      [...filesA.keys()].filter((n) => filesA.get(n) !== filesARepeat.get(n)).join(", "),
    );
    // The two fixtures live in DIFFERENTLY NAMED directories, so the audit-only
    // provenance strings legitimately differ. Everything else must not.
    const stripProvenance = (name: string, raw: string): string => {
      const value = JSON.parse(raw);
      if (name === "site-spec.json") {
        delete value.source;
        for (const page of value.pages ?? []) delete page.sourceObservation;
      }
      if (name === "pages/" || name.startsWith("pages/")) delete value.sourceObservation;
      if (name === "interaction-spec.json") {
        for (const pattern of value.patterns ?? []) delete pattern.provenance.explorationRun;
        for (const unknown of value.unknownInteractions ?? []) {
          delete unknown.provenance.explorationRun;
        }
      }
      return JSON.stringify(value);
    };
    const logicalDiffs = [...filesA.keys()].filter(
      (name) =>
        stripProvenance(name, filesA.get(name)!) !== stripProvenance(name, filesB.get(name)!),
    );
    check(
      "reversing routes / families / assets / styles / patterns / unknowns changes nothing logical",
      logicalDiffs.length === 0,
      logicalDiffs.join(", "),
    );
    check(
      "no timestamp, clock or random id reached a deterministic artifact body",
      ![...filesA.entries()].some(
        ([name, body]) => name !== "site-spec.json" && /"generatedAt"|"compiledAt"|"runId"/.test(body),
      ) && !/"generatedAt"|"compiledAt"/.test(filesA.get("site-spec.json")!),
    );

    console.log("\n§119 existing artifacts are immutable to this Task");
    const rebuiltAfter = await snapshotTree(rebuiltRoot);
    check(
      "no Task 06–12 fixture artifact changed size or mtime across two compilations",
      JSON.stringify(rebuiltAfter) === JSON.stringify(rebuiltBefore),
      `${rebuiltBefore.length} files before, ${rebuiltAfter.length} after`,
    );
    check(
      "the source tree really was read (the snapshot is non-empty)",
      beforeSources.length > 0 && rebuiltBefore.length === beforeSources.length,
    );

    console.log("\n§68/§70 responsive model");
    check(
      "the responsive model claims only observed endpoints",
      afterDeletion.siteSpec.responsiveModel.mode === "observed-endpoints" &&
        afterDeletion.siteSpec.responsiveModel.observedViewports.length === 2,
    );
    check(
      "no breakpoint was invented",
      afterDeletion.siteSpec.responsiveModel.inferredBreakpoints.length === 0,
    );
    check(
      "the limitation states no cross-viewport matching was performed",
      afterDeletion.siteSpec.responsiveModel.limitations.includes(
        "cross-viewport-node-matching-not-performed",
      ),
    );
    check(
      "responsive differences are reported as numbers only",
      afterDeletion.siteSpec.responsiveDifferences.length === 4 &&
        !JSON.stringify(afterDeletion.siteSpec.responsiveDifferences).includes("nodeId"),
    );

    console.log("\n§76/§77/§78 what must NOT be in the IR");
    const wholeSpec =
      JSON.stringify(afterDeletion.siteSpec) +
      JSON.stringify(afterDeletion.pages) +
      JSON.stringify(afterDeletion.styleCatalog) +
      JSON.stringify(afterDeletion.interactionSpec);
    check("no framework concept appears in the schema output", !/ReactComponent|NextPage|TailwindClass|VueComponent/.test(wholeSpec));
    check("no original stylesheet source", !/@media|@font-face|\.btn\s*\{/.test(wholeSpec));
    check("no script source or inline handler body", !/var a=1|doThing\(\)|fetch\("https:\/\/evil/.test(wholeSpec));

    console.log("\n§100 provenance summary");
    check(
      "the ledger reports observed / derived / inferred separately",
      afterDeletion.siteSpec.provenanceSummary.observedFactCount > 0 &&
        afterDeletion.siteSpec.provenanceSummary.derivedFactCount > 0 &&
        afterDeletion.siteSpec.provenanceSummary.inferredFactCount === 0,
    );
    check(
      "pattern / unknown counts agree with the interaction spec",
      afterDeletion.siteSpec.provenanceSummary.verifiedPatternCount === 3 &&
        afterDeletion.siteSpec.provenanceSummary.unknownCount === 1,
    );
    const summaryOut = summarizeSiteSpec(afterDeletion);
    check(
      "route coverage is 100% while exact-observation coverage is not",
      summaryOut.routes.routeCoverage === 1 && summaryOut.routes.exactObservationCoverage < 1,
      `${summaryOut.routes.exactObservationCoverage}`,
    );
    check(
      "the limitation glossary explains every code the artifact uses",
      Object.keys(afterDeletion.siteSpec.limitationGlossary).length > 0 &&
        Object.values(afterDeletion.siteSpec.limitationGlossary).every((m) => m.length > 10),
    );

    console.log("\n§118 offline import graph");
    const graph = new Set<string>();
    const externals = new Set<string>();
    // Every module specifier this file STATICALLY imports.
    //
    // Anchored to a statement start on purpose. The previous form matched
    // `from "…"` anywhere in the file, comments included, so an ordinary English
    // sentence in a JSDoc block — `… tell one thing from "another"` — was read as
    // an import and reported as a phantom third-party dependency. That is a
    // scanner defect, not a dependency: it fires on prose written anywhere in a
    // 31-file graph, and the message it produces ("your only third-party deps are
    // parse5, zod and `was never looked at`") is nonsense a reader cannot act on.
    //
    // Anchoring cannot HIDE a real dependency, which is the direction that would
    // matter: a static import is always written as `import … from`, `export … from`
    // or the `}` line closing a multi-line import clause, all of which this matches.
    // Verified against the live graph — it reaches the same 31 files and the same
    // real specifiers as the unanchored form, minus the phantom.
    const importSpecifiers = (src: string): string[] =>
      [
        ...src.matchAll(
          /^[ \t]*(?:\}|import\b[^;'"]*?|export\b[^;'"]*?)[ \t]+from[ \t]+["']([^"']+)["']/gm,
        ),
      ].map((match) => match[1]!);
    const walkImports = (file: string): void => {
      const abs = path.resolve(file);
      if (graph.has(abs)) return;
      graph.add(abs);
      let src: string;
      try {
        src = readFileSync(abs, "utf8");
      } catch {
        return;
      }
      for (const spec of importSpecifiers(src)) {
        if (spec.startsWith(".")) {
          walkImports(path.resolve(path.dirname(abs), spec.replace(/\.js$/, ".ts")));
        } else {
          externals.add(spec);
        }
      }
    };
    walkImports("src/sitespec/index.ts");
    walkImports("src/cli-compile-sitespec.ts");
    check(
      "the import graph reaches no browser / crawler / HTTP / AI-provider module",
      graph.size > 10 &&
        ![...externals].some((spec) =>
          /playwright|firecrawl|undici|axios|node-fetch|openai|anthropic|@ai-sdk|node:http|node:https|node:net|node:dgram|node:tls/.test(
            spec,
          ),
        ),
      [...externals].sort().join(", "),
    );
    check(
      "…and its only third-party dependencies are the HTML parser and zod",
      [...externals]
        .filter((spec) => !spec.startsWith("node:"))
        .sort()
        .join(",") === "parse5,zod",
      [...externals].sort().join(", "),
    );
    check(
      "…and the dependency scan reads code, not prose: a comment cannot invent a dependency",
      (() => {
        const fixture = [
          "/**",
          " * A partial census cannot tell 'was not there' from \"was never looked at\",",
          " * so import { nothing } from \"a-phantom-package\" is prose, not an import.",
          " */",
          "// import realish from \"another-phantom\";",
          "import { z } from \"zod\";",
          "import type { Node } from \"parse5\";",
          "export { helper } from \"./helper.js\";",
          "import {",
          "  thing,",
          "} from \"node:path\";",
        ].join("\n");
        return (
          importSpecifiers(fixture).sort().join(",") === "./helper.js,node:path,parse5,zod"
        );
      })(),
      importSpecifiers(
        [
          " * cannot tell one thing from \"a-phantom-package\"",
          "import { z } from \"zod\";",
        ].join("\n"),
      ).join(","),
    );
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }

  mediaConditionChecks();
  authoredBreakpointChecks();
  // Responsive Core P0 §C1.4 / §C1.7.
  await inlineProvenanceChecks();
  // Independent-review fixes (B2 / M4 / M5 provenance half).
  inlineProvenanceReviewFixChecks();

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`[smoke:sitespec] FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:sitespec] OK");
  }
}

main().catch((err) => {
  console.error("[smoke:sitespec] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

// ---------------------------------------------------------------------------
// §28.6-W2 media condition tokenizer (appended section — Task 28.6, Lane W2)
//
// Imports are hoisted, so this trailing import is live for `mediaConditionChecks()`,
// which `main()` calls after its fixture teardown. Nothing above this line was
// renumbered or altered.
// ---------------------------------------------------------------------------

import {
  DEVICE_WIDTH_POLICY,
  MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX,
  MEDIA_CONDITION_MAX_LENGTH_PX,
  foldMediaBreakpoints,
  parseMediaCondition,
  type MediaConditionResult,
  type MediaWidthBound,
} from "../src/sitespec/media-condition.js";
import { computeAuthoredBreakpoints } from "../src/sitespec/authored-breakpoints.js";
import {
  AuthoredBreakpointsSchema,
  ViewportPageSpecSchema,
  READABLE_SCHEMA_VERSIONS,
} from "../src/sitespec/types.js";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Located from this module's own URL so the suite runs from any cwd (C2.4).
 *
 * `fileURLToPath`, never `new URL(...).pathname`: `pathname` is the PERCENT-ENCODED
 * URL component, so a checkout under a directory containing a space (or `#`, `?`,
 * a non-ASCII character…) resolves to `.../a%20b/src/...`, which exists nowhere.
 * The unguarded `readFileSync` below then threw ENOENT out of the suite and killed
 * every remaining check instead of failing one — the same class of environment
 * difference masquerading as a crash that the cwd fix was meant to remove.
 */
const MEDIA_CONDITION_SOURCE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "sitespec",
  "media-condition.ts",
);

/** Every distinct `media` string present in data/ at the time this was written. */
const OBSERVED_MEDIA_CORPUS: readonly string[] = [
  "(hover: none)",
  "(max-width: 1111px)",
  "(max-width: 599px)",
  "(max-width: 600px)",
  "(max-width: 640px)",
  "(max-width: 768px)",
  "(max-width: 899px)",
  "(max-width: 900px)",
  "(min-width: 1112px)",
  "(min-width: 1300px)",
  "(min-width: 450px)",
  "(min-width: 600px) and (max-width: 899px)",
  "(min-width: 600px)",
  "(min-width: 750px)",
  "(min-width: 900px) and (max-height: 900px)",
  "(min-width: 900px) and (min-height: 500px)",
  "(min-width: 900px)",
  "(min-width: 901px)",
  "(min-width: 930px)",
  "(prefers-reduced-motion:reduced)",
];

/** The nine non-width forms Task 28.6 names explicitly. */
const NON_WIDTH_CONDITIONS: readonly string[] = [
  "(prefers-reduced-motion: reduce)",
  "(any-hover: hover)",
  "(prefers-color-scheme: dark)",
  "(min-resolution: 192dpi)",
  "(min-device-pixel-ratio: 2)",
  "(min-aspect-ratio: 16 / 9)",
  "(dynamic-range: high) or (color-gamut: p3)",
  "(pointer: fine)",
  "(hover: none) and (pointer: coarse)",
];

function allBounds(result: MediaConditionResult): MediaWidthBound[] {
  return result.alternatives.flatMap((alt) => [...alt.bounds]);
}

function boundSig(bound: MediaWidthBound): string {
  return `${bound.kind}${bound.inclusive ? "=" : ""}${bound.px}[${bound.boundary.below},${bound.boundary.above}]`;
}

function sigOf(condition: string): string {
  return allBounds(parseMediaCondition(condition)).map(boundSig).join(" ");
}

function mediaConditionChecks(): void {
  console.log("\n§28.6-W2 media condition tokenizer — the common case");

  const maxOnly = parseMediaCondition("(max-width: 640px)");
  check(
    "'(max-width: 640px)' is width-relevant with exactly one inclusive max bound",
    maxOnly.status === "width" &&
      maxOnly.widthRelevant &&
      maxOnly.bounds.length === 1 &&
      maxOnly.bounds[0]!.kind === "max" &&
      maxOnly.bounds[0]!.px === 640 &&
      maxOnly.bounds[0]!.inclusive,
    `${maxOnly.status} / ${allBounds(maxOnly).map(boundSig).join(" ")}`,
  );
  check(
    "…and it implies the layout changes between 640 and 641",
    maxOnly.bounds[0]!.boundary.below === 640 && maxOnly.bounds[0]!.boundary.above === 641,
    JSON.stringify(maxOnly.bounds[0]!.boundary),
  );
  check(
    "…and its snap target (breakpointPx) is 640, the last width at which it holds",
    maxOnly.bounds[0]!.breakpointPx === 640,
    String(maxOnly.bounds[0]!.breakpointPx),
  );
  check("…and the raw input is preserved verbatim", maxOnly.raw === "(max-width: 640px)", maxOnly.raw);

  const minOnly = parseMediaCondition("(min-width: 1025px)");
  check(
    "'(min-width: 1025px)' is one inclusive min bound at 1025",
    minOnly.status === "width" &&
      minOnly.bounds.length === 1 &&
      minOnly.bounds[0]!.kind === "min" &&
      minOnly.bounds[0]!.px === 1025 &&
      minOnly.bounds[0]!.inclusive,
    allBounds(minOnly).map(boundSig).join(" "),
  );
  check(
    "…and it implies the layout changes between 1024 and 1025",
    minOnly.bounds[0]!.boundary.below === 1024 && minOnly.bounds[0]!.boundary.above === 1025,
    JSON.stringify(minOnly.bounds[0]!.boundary),
  );
  check(
    "…and its snap target is 1025, the first width at which it holds",
    minOnly.bounds[0]!.breakpointPx === 1025,
    String(minOnly.bounds[0]!.breakpointPx),
  );
  check(
    "a max-width and a min-width one pixel apart name the SAME boundary",
    parseMediaCondition("(max-width: 1024px)").bounds[0]!.boundary.above ===
      parseMediaCondition("(min-width: 1025px)").bounds[0]!.boundary.above,
    `${parseMediaCondition("(max-width: 1024px)").bounds[0]!.boundary.above} vs ${minOnly.bounds[0]!.boundary.above}`,
  );

  console.log("\n§28.6-W2 compound conditions");

  const compound = parseMediaCondition("screen and (min-width: 1025px) and (max-width: 1279px)");
  check(
    "'screen and (min-width: 1025px) and (max-width: 1279px)' keeps the media type",
    compound.status === "width" && compound.alternatives[0]!.mediaType === "screen",
    `${compound.status} / ${String(compound.alternatives[0]!.mediaType)}`,
  );
  check(
    "…and intersects to the interval 1025-1279",
    compound.interval?.min?.px === 1025 &&
      compound.interval?.max?.px === 1279 &&
      compound.interval?.empty === false,
    JSON.stringify({ min: compound.interval?.min?.px, max: compound.interval?.max?.px }),
  );
  const bandCompound = parseMediaCondition("(min-width: 1281px) and (max-width: 1440px)");
  check(
    "'(min-width: 1281px) and (max-width: 1440px)' yields both bounds with no media type",
    bandCompound.bounds.length === 2 &&
      bandCompound.alternatives[0]!.mediaType === undefined &&
      bandCompound.interval?.min?.breakpointPx === 1281 &&
      bandCompound.interval?.max?.breakpointPx === 1440,
    allBounds(bandCompound).map(boundSig).join(" "),
  );
  const withHeight = parseMediaCondition("(min-width: 900px) and (max-height: 900px)");
  check(
    "a height feature beside a width feature is recorded but never becomes a width bound",
    withHeight.status === "width" &&
      withHeight.bounds.length === 1 &&
      withHeight.bounds[0]!.kind === "min" &&
      withHeight.alternatives[0]!.features.join(",") === "max-height,min-width",
    withHeight.alternatives[0]!.features.join(","),
  );
  const tightest = parseMediaCondition("(min-width: 900px) and (min-width: 1200px)");
  check(
    "two min bounds intersect to the tighter one",
    tightest.interval?.min?.px === 1200,
    String(tightest.interval?.min?.px),
  );
  const contradiction = parseMediaCondition("(min-width: 1000px) and (max-width: 500px)");
  check(
    "a contradictory conjunction is reported as an EMPTY interval, not silently dropped",
    contradiction.status === "width" && contradiction.interval?.empty === true,
    JSON.stringify({ status: contradiction.status, empty: contradiction.interval?.empty }),
  );
  check(
    "a lone min bound leaves the interval's max undefined",
    parseMediaCondition("(min-width: 900px)").interval?.max === undefined,
  );

  console.log("\n§28.6-W2 comma lists are a disjunction, never one interval");

  const disj = parseMediaCondition("only screen and (min-width: 900px), print");
  check(
    "'only screen and (min-width: 900px), print' parses as two alternatives",
    disj.disjunction && disj.alternatives.length === 2,
    `${disj.disjunction} / ${disj.alternatives.length}`,
  );
  check(
    "…and the top-level bounds/interval stay EMPTY — no branch is silently picked",
    disj.bounds.length === 0 && disj.interval === undefined,
    `${disj.bounds.length} / ${String(disj.interval)}`,
  );
  check(
    "…while the first branch still carries its min bound at 900",
    disj.alternatives[0]!.status === "width" &&
      disj.alternatives[0]!.bounds[0]!.px === 900 &&
      disj.alternatives[0]!.qualifier === "only",
    allBounds(disj).map(boundSig).join(" "),
  );
  check(
    "…and the 'print' branch is width-irrelevant and marked non-screen",
    disj.alternatives[1]!.status === "width-irrelevant" &&
      disj.alternatives[1]!.mediaType === "print" &&
      disj.alternatives[1]!.screenApplicable === false,
    `${disj.alternatives[1]!.status} / ${String(disj.alternatives[1]!.mediaType)}`,
  );
  check(
    "…and the disjunction is called out in the notes",
    disj.notes.some((n) => n.includes("disjunction")),
    disj.notes.join(" | "),
  );
  check(
    "…and the legacy 'only' prefix is recorded as a no-op, not as meaning",
    disj.notes.some((n) => n.startsWith("'only' prefix ignored")),
    disj.notes.join(" | "),
  );
  const twoWidths = parseMediaCondition("(max-width: 640px), (min-width: 1200px)");
  check(
    "a disjunction of two DIFFERENT widths keeps both branches and refuses one interval",
    twoWidths.status === "width" &&
      twoWidths.interval === undefined &&
      twoWidths.alternatives[0]!.bounds[0]!.breakpointPx === 640 &&
      twoWidths.alternatives[1]!.bounds[0]!.breakpointPx === 1200,
    allBounds(twoWidths).map(boundSig).join(" "),
  );

  console.log("\n§28.6-W2 range syntax records strictness instead of fudging an epsilon");

  const gte = parseMediaCondition("(width >= 1024px)");
  check(
    "'(width >= 1024px)' is an INCLUSIVE min at 1024 (boundary 1023/1024)",
    gte.bounds.length === 1 &&
      gte.bounds[0]!.kind === "min" &&
      gte.bounds[0]!.inclusive &&
      gte.bounds[0]!.boundary.below === 1023 &&
      gte.bounds[0]!.boundary.above === 1024,
    sigOf("(width >= 1024px)"),
  );
  const gt = parseMediaCondition("(width > 1024px)");
  check(
    "'(width > 1024px)' is an EXCLUSIVE min: inclusive=false, boundary 1024/1025",
    gt.bounds[0]!.inclusive === false &&
      gt.bounds[0]!.px === 1024 &&
      gt.bounds[0]!.boundary.above === 1025 &&
      gt.bounds[0]!.breakpointPx === 1025,
    sigOf("(width > 1024px)"),
  );
  const lt = parseMediaCondition("(width < 640px)");
  check(
    "'(width < 640px)' is an EXCLUSIVE max: inclusive=false, boundary 639/640",
    lt.bounds[0]!.kind === "max" &&
      lt.bounds[0]!.inclusive === false &&
      lt.bounds[0]!.px === 640 &&
      lt.bounds[0]!.boundary.below === 639 &&
      lt.bounds[0]!.breakpointPx === 639,
    sigOf("(width < 640px)"),
  );
  check(
    "'(width < 640px)' and '(max-width: 640px)' are NOT collapsed to the same bound",
    sigOf("(width < 640px)") !== sigOf("(max-width: 640px)"),
    `${sigOf("(width < 640px)")} vs ${sigOf("(max-width: 640px)")}`,
  );
  check(
    "'(width <= 640px)' is inclusive where '(width < 640px)' is not",
    lt.bounds[0]!.boundary.above === 640 &&
      parseMediaCondition("(width <= 640px)").bounds[0]!.boundary.above === 641,
    sigOf("(width <= 640px)"),
  );
  const rangeBoth = parseMediaCondition("(1024px <= width <= 1440px)");
  check(
    "'(1024px <= width <= 1440px)' yields min 1024 and max 1440",
    rangeBoth.bounds.length === 2 &&
      rangeBoth.interval?.min?.px === 1024 &&
      rangeBoth.interval?.max?.px === 1440 &&
      rangeBoth.interval?.empty === false,
    sigOf("(1024px <= width <= 1440px)"),
  );
  check(
    "…and the reversed spelling '(1440px >= width >= 1024px)' is the same interval",
    parseMediaCondition("(1440px >= width >= 1024px)").interval?.min?.px === 1024 &&
      parseMediaCondition("(1440px >= width >= 1024px)").interval?.max?.px === 1440,
    sigOf("(1440px >= width >= 1024px)"),
  );
  check(
    "'(1024px <= width)' flips to a min bound, not a max",
    parseMediaCondition("(1024px <= width)").bounds[0]!.kind === "min",
    sigOf("(1024px <= width)"),
  );
  check(
    "'(width = 640px)' is an exact match — both an inclusive min and an inclusive max",
    parseMediaCondition("(width = 640px)").bounds.length === 2 &&
      parseMediaCondition("(width = 640px)").interval?.min?.px === 640 &&
      parseMediaCondition("(width = 640px)").interval?.max?.px === 640,
    sigOf("(width = 640px)"),
  );
  check(
    "'(min-width < 100px)' — a min-/max- name with a range operator — is invalid CSS and unparsed",
    parseMediaCondition("(min-width < 100px)").status === "unparsed",
    parseMediaCondition("(min-width < 100px)").reason ?? "",
  );

  console.log("\n§28.6-W2 units convert only under a recorded assumption");

  const em = parseMediaCondition("(min-width: 40em)");
  check(
    "'(min-width: 40em)' converts to 640px at the default 16px root font size",
    em.status === "width" &&
      em.bounds[0]!.px === 640 &&
      em.bounds[0]!.converted === true &&
      em.bounds[0]!.unit === "em",
    sigOf("(min-width: 40em)"),
  );
  check(
    "…and the assumption is RECORDED on the bound, not left implicit",
    em.bounds[0]!.assumedRootFontSizePx === MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX &&
      em.bounds[0]!.rawValue === "40em",
    String(em.bounds[0]!.assumedRootFontSizePx),
  );
  check(
    "…and a note names the value, the result and the assumed root font size",
    em.notes.some((n) => n.includes("40em") && n.includes("640px") && n.includes("16px root")),
    em.notes.join(" | "),
  );
  const em10 = parseMediaCondition("(min-width: 40em)", { rootFontSizePx: 10 });
  check(
    "a caller-supplied root font size changes the px AND the recorded assumption",
    em10.bounds[0]!.px === 400 &&
      em10.bounds[0]!.assumedRootFontSizePx === 10 &&
      em10.rootFontSizePx === 10 &&
      em10.notes.some((n) => n.includes("10px root")),
    `${em10.bounds[0]!.px} / ${String(em10.bounds[0]!.assumedRootFontSizePx)}`,
  );
  check(
    "an invalid root font size falls back to 16 rather than producing NaN",
    parseMediaCondition("(min-width: 40em)", { rootFontSizePx: 0 }).bounds[0]!.px === 640 &&
      parseMediaCondition("(min-width: 40em)", { rootFontSizePx: Number.NaN }).bounds[0]!.px === 640,
    String(parseMediaCondition("(min-width: 40em)", { rootFontSizePx: 0 }).bounds[0]!.px),
  );
  check(
    "'(max-width: 63.9375em)' — the fractional em idiom — lands on exactly 1023px",
    parseMediaCondition("(max-width: 63.9375em)").bounds[0]!.px === 1023,
    sigOf("(max-width: 63.9375em)"),
  );
  check(
    "rem converts the same way and records unit 'rem'",
    parseMediaCondition("(min-width: 40rem)").bounds[0]!.px === 640 &&
      parseMediaCondition("(min-width: 40rem)").bounds[0]!.unit === "rem",
    sigOf("(min-width: 40rem)"),
  );
  check(
    "a px bound is NOT marked converted and carries no root-font assumption",
    maxOnly.bounds[0]!.converted === false &&
      maxOnly.bounds[0]!.assumedRootFontSizePx === undefined,
  );
  check(
    "'(min-width: 12pt)' converts by the exact CSS ratio to 16px with no root-font assumption",
    parseMediaCondition("(min-width: 12pt)").bounds[0]!.px === 16 &&
      parseMediaCondition("(min-width: 12pt)").bounds[0]!.converted === true &&
      parseMediaCondition("(min-width: 12pt)").bounds[0]!.assumedRootFontSizePx === undefined,
    sigOf("(min-width: 12pt)"),
  );
  check(
    "a fractional px bound floors/ceils onto whole-pixel boundaries (767.98 -> 767/768)",
    parseMediaCondition("(max-width: 767.98px)").bounds[0]!.boundary.below === 767 &&
      parseMediaCondition("(max-width: 767.98px)").bounds[0]!.boundary.above === 768,
    sigOf("(max-width: 767.98px)"),
  );
  check(
    "unitless zero is legal CSS and parses",
    parseMediaCondition("(min-width: 0)").status === "width" &&
      parseMediaCondition("(min-width: 0)").bounds[0]!.px === 0,
    parseMediaCondition("(min-width: 0)").reason ?? "",
  );
  check(
    "unitless non-zero is NOT legal and is unparsed, not assumed to be px",
    parseMediaCondition("(min-width: 640)").status === "unparsed",
    parseMediaCondition("(min-width: 640)").reason ?? "",
  );
  check(
    "a negative width is unparsed",
    parseMediaCondition("(min-width: -10px)").status === "unparsed",
    parseMediaCondition("(min-width: -10px)").reason ?? "",
  );
  check(
    "a viewport-relative unit is UNSUPPORTED (not a guessed breakpoint)",
    parseMediaCondition("(min-width: 50vw)").status === "unsupported" &&
      allBounds(parseMediaCondition("(min-width: 50vw)")).length === 0,
    parseMediaCondition("(min-width: 50vw)").reason ?? "",
  );
  check(
    "a calc() bound is UNSUPPORTED rather than silently dropped",
    parseMediaCondition("(min-width: calc(100px + 2em))").status === "unsupported",
    parseMediaCondition("(min-width: calc(100px + 2em))").reason ?? "",
  );

  console.log("\n§28.6-W2 non-width conditions are recognised, never mistaken for breakpoints");

  for (const condition of NON_WIDTH_CONDITIONS) {
    const parsed = parseMediaCondition(condition);
    check(
      `'${condition}' is width-irrelevant with zero bounds`,
      parsed.status === "width-irrelevant" &&
        !parsed.widthRelevant &&
        allBounds(parsed).length === 0,
      `${parsed.status} / ${allBounds(parsed).length} bound(s) / ${parsed.reason ?? ""}`,
    );
  }
  check(
    "an 'or' between two NON-width features stays width-irrelevant (it is not a refusal case)",
    parseMediaCondition("(dynamic-range: high) or (color-gamut: p3)").status === "width-irrelevant",
    parseMediaCondition("(dynamic-range: high) or (color-gamut: p3)").reason ?? "",
  );
  check(
    "an 'or' that combines WIDTH constraints is unsupported — it cannot be one interval",
    parseMediaCondition("(min-width: 100px) or (min-width: 200px)").status === "unsupported" &&
      allBounds(parseMediaCondition("(min-width: 100px) or (min-width: 200px)")).length === 0,
    parseMediaCondition("(min-width: 100px) or (min-width: 200px)").reason ?? "",
  );
  check(
    "a nested group over width is unsupported rather than half-read",
    parseMediaCondition("((min-width: 100px) or (min-width: 200px))").status === "unsupported",
    parseMediaCondition("((min-width: 100px) or (min-width: 200px))").reason ?? "",
  );
  check(
    "the boolean feature '(width)' names no breakpoint and is width-irrelevant",
    parseMediaCondition("(width)").status === "width-irrelevant" &&
      allBounds(parseMediaCondition("(width)")).length === 0,
    parseMediaCondition("(width)").reason ?? "",
  );
  check(
    "a bare media type alone is width-irrelevant",
    parseMediaCondition("screen").status === "width-irrelevant" &&
      parseMediaCondition("all").status === "width-irrelevant",
  );

  console.log("\n§28.6-W2 deprecated device-width family");

  const deviceWidth = parseMediaCondition("(max-device-width: 480px)");
  check(
    "'(max-device-width: 480px)' IS treated as a width constraint (documented decision)",
    deviceWidth.status === "width" &&
      deviceWidth.bounds.length === 1 &&
      deviceWidth.bounds[0]!.breakpointPx === 480 &&
      DEVICE_WIDTH_POLICY === "treated-as-width-constraint",
    `${deviceWidth.status} / ${DEVICE_WIDTH_POLICY}`,
  );
  check(
    "…and the decision is recorded on the bound so a caller can exclude it",
    deviceWidth.bounds[0]!.deviceWidth === true &&
      deviceWidth.bounds[0]!.feature === "max-device-width",
    JSON.stringify({ deviceWidth: deviceWidth.bounds[0]!.deviceWidth }),
  );
  check(
    "…and a note names the deprecation and the policy",
    deviceWidth.notes.some(
      (n) => n.includes("max-device-width") && n.includes(DEVICE_WIDTH_POLICY),
    ),
    deviceWidth.notes.join(" | "),
  );
  check(
    "a plain max-width bound is NOT flagged as device-width",
    maxOnly.bounds[0]!.deviceWidth === false,
  );

  console.log("\n§28.6-W2 'not' is refused, never inverted");

  const notScreen = parseMediaCondition("not screen and (min-width: 900px)");
  check(
    "'not screen and (min-width: 900px)' is UNSUPPORTED with zero bounds",
    notScreen.status === "unsupported" &&
      !notScreen.widthRelevant &&
      allBounds(notScreen).length === 0,
    `${notScreen.status} / ${allBounds(notScreen).length}`,
  );
  check(
    "…and the qualifier and the reason both say why",
    notScreen.alternatives[0]!.qualifier === "not" &&
      (notScreen.reason ?? "").includes("'not'"),
    `${String(notScreen.alternatives[0]!.qualifier)} / ${notScreen.reason ?? ""}`,
  );
  check(
    "'not all' is unsupported too",
    parseMediaCondition("not all").status === "unsupported",
    parseMediaCondition("not all").reason ?? "",
  );
  check(
    "the modern inner form '(not (min-width: 100px))' is unsupported",
    parseMediaCondition("(not (min-width: 100px))").status === "unsupported",
    parseMediaCondition("(not (min-width: 100px))").reason ?? "",
  );
  check(
    "one 'not' branch poisons the whole comma list — the result errs toward unsupported",
    parseMediaCondition("(max-width: 640px), not print").status === "unsupported",
    parseMediaCondition("(max-width: 640px), not print").reason ?? "",
  );
  check(
    "'only screen and (min-width: 900px)' still parses — 'only' is not 'not'",
    parseMediaCondition("only screen and (min-width: 900px)").status === "width" &&
      parseMediaCondition("only screen and (min-width: 900px)").bounds[0]!.px === 900,
    sigOf("only screen and (min-width: 900px)"),
  );
  check(
    "'only' with no media type is unparsed",
    parseMediaCondition("only").status === "unparsed",
    parseMediaCondition("only").reason ?? "",
  );

  console.log("\n§28.6-W2 whitespace, casing and malformed input");

  check(
    "'( MIN-WIDTH : 900PX )' — padding and upper case — parses to min 900",
    parseMediaCondition("( MIN-WIDTH : 900PX )").bounds[0]?.px === 900,
    sigOf("( MIN-WIDTH : 900PX )"),
  );
  check(
    "'(width>=1024px)' with no spaces around the operator parses to min 1024",
    parseMediaCondition("(width>=1024px)").bounds[0]?.px === 1024,
    sigOf("(width>=1024px)"),
  );
  const corpusNoSpace = parseMediaCondition("(prefers-reduced-motion:reduced)");
  check(
    "the real-corpus '(prefers-reduced-motion:reduced)' (no space after the colon) is width-irrelevant",
    corpusNoSpace.status === "width-irrelevant",
    corpusNoSpace.reason ?? "",
  );
  check(
    "…and normalization restores the space so the string is usable as a key",
    corpusNoSpace.normalized === "(prefers-reduced-motion: reduced)",
    corpusNoSpace.normalized,
  );
  const malformed: readonly string[] = [
    "(max-width: 480px",
    "(((",
    "",
    "   ",
    "@media screen and (min-width: 900px)",
    "screenn and (min-width: 900px)",
    "and (min-width: 900px)",
    "(min-width: 900px) and",
    "(: 900px)",
    "(min-width:)",
    "()",
    ")(",
    "(min-width: 900px) (max-width: 1000px)",
  ];
  let malformedOk = 0;
  for (const bad of malformed) {
    let status = "THREW";
    try {
      status = parseMediaCondition(bad).status;
    } catch {
      status = "THREW";
    }
    if (status === "unparsed") malformedOk += 1;
  }
  check(
    `all ${malformed.length} malformed inputs return 'unparsed' and none throws`,
    malformedOk === malformed.length,
    `${malformedOk}/${malformed.length}`,
  );
  check(
    "an at-rule prelude is rejected — the caller must pass the CONDITION, not the whole @media line",
    parseMediaCondition("@media screen and (min-width: 900px)").status === "unparsed" &&
      allBounds(parseMediaCondition("@media screen and (min-width: 900px)")).length === 0,
    parseMediaCondition("@media screen and (min-width: 900px)").reason ?? "",
  );
  const adversarial = "(".repeat(500) + "min-width: 640px".repeat(60);
  let adversarialStatus = "THREW";
  try {
    adversarialStatus = parseMediaCondition(adversarial).status;
  } catch {
    adversarialStatus = "THREW";
  }
  check(
    "a 1460-char unbalanced-paren adversarial string is unparsed, not a throw or a hang",
    adversarialStatus === "unparsed",
    adversarialStatus,
  );
  const deepBalanced = "(".repeat(200) + "min-width: 100px" + ")".repeat(200);
  let deepStatus = "THREW";
  try {
    deepStatus = parseMediaCondition(deepBalanced).status;
  } catch {
    deepStatus = "THREW";
  }
  check(
    "a 200-deep BALANCED nest of parens over a width feature is unsupported, not a stack overflow",
    deepStatus === "unsupported",
    deepStatus,
  );
  check(
    "non-string input (undefined/null/number/object/array/boolean) is 'unparsed', never a throw",
    ([undefined, null, 42, {}, [], true] as unknown[]).every((bad) => {
      try {
        return parseMediaCondition(bad).status === "unparsed";
      } catch {
        return false;
      }
    }),
    parseMediaCondition(undefined).reason ?? "",
  );

  console.log("\n§28.6-W2 the observed corpus");

  const corpusResults = OBSERVED_MEDIA_CORPUS.map((c) => parseMediaCondition(c));
  check(
    `all ${OBSERVED_MEDIA_CORPUS.length} media strings observed in data/ parse with no 'unparsed' and no 'unsupported'`,
    corpusResults.every((r) => r.status === "width" || r.status === "width-irrelevant"),
    corpusResults
      .map((r, i) => `${OBSERVED_MEDIA_CORPUS[i]!}=${r.status}`)
      .filter((s) => !s.endsWith("=width") && !s.endsWith("=width-irrelevant"))
      .join(", "),
  );
  check(
    "…18 of them are width-relevant and 2 (hover, prefers-reduced-motion) are not",
    corpusResults.filter((r) => r.widthRelevant).length === 18 &&
      corpusResults.filter((r) => !r.widthRelevant).length === 2,
    `${corpusResults.filter((r) => r.widthRelevant).length} width / ${corpusResults.filter((r) => !r.widthRelevant).length} other`,
  );
  check(
    "…and every bound they produce has an adjacent boundary (above === below + 1)",
    corpusResults.flatMap(allBounds).every((b) => b.boundary.above === b.boundary.below + 1),
  );
  check(
    "…and every boundary is a whole number of pixels",
    corpusResults
      .flatMap(allBounds)
      .every((b) => Number.isInteger(b.boundary.below) && Number.isInteger(b.boundary.above)),
  );
  check(
    "the corpus pair '(max-width: 899px)' / '(min-width: 900px)' names ONE boundary at 899/900",
    parseMediaCondition("(max-width: 899px)").bounds[0]!.boundary.below === 899 &&
      parseMediaCondition("(max-width: 899px)").bounds[0]!.boundary.above === 900 &&
      parseMediaCondition("(min-width: 900px)").bounds[0]!.boundary.below === 899 &&
      parseMediaCondition("(min-width: 900px)").bounds[0]!.boundary.above === 900,
    `${sigOf("(max-width: 899px)")} / ${sigOf("(min-width: 900px)")}`,
  );

  console.log("\n§28.6-W2 breakpoint histogram folding");

  const histogram = foldMediaBreakpoints([
    parseMediaCondition("(max-width: 640px)"),
    { condition: parseMediaCondition("(max-width: 640px)"), count: 3 },
    parseMediaCondition("(min-width: 1025px)"),
    parseMediaCondition("(prefers-color-scheme: dark)"),
    parseMediaCondition("not screen"),
    parseMediaCondition("(((("),
    parseMediaCondition("only screen and (min-width: 900px), print"),
    parseMediaCondition("(max-device-width: 480px)"),
  ]);
  check(
    "the histogram is sorted by px ascending",
    histogram.entries.map((e) => e.px).join(",") === "480,640,900,1025",
    histogram.entries.map((e) => `${e.px}:${e.kind}`).join(","),
  );
  check(
    "…and weighted tallies aggregate (1 + 3 occurrences of max 640)",
    histogram.entries.find((e) => e.px === 640 && e.kind === "max")?.count === 4,
    JSON.stringify(histogram.entries),
  );
  check(
    "…and a disjunction contributes its width branch (min 900 from the comma list)",
    histogram.entries.find((e) => e.px === 900 && e.kind === "min")?.count === 1,
    JSON.stringify(histogram.entries.find((e) => e.px === 900)),
  );
  check(
    "…and the status counters partition the weighted total",
    histogram.totalCount === 10 &&
      histogram.widthCount +
        histogram.widthIrrelevantCount +
        histogram.unsupportedCount +
        histogram.unparsedCount ===
        histogram.totalCount,
    JSON.stringify({
      total: histogram.totalCount,
      width: histogram.widthCount,
      irrelevant: histogram.widthIrrelevantCount,
      unsupported: histogram.unsupportedCount,
      unparsed: histogram.unparsedCount,
    }),
  );
  check(
    "…and the UNPARSED counter is surfaced, not swallowed",
    histogram.unparsedCount === 1,
    String(histogram.unparsedCount),
  );
  check(
    "…and the unsupported counter is separate from it",
    histogram.unsupportedCount === 1 && histogram.widthIrrelevantCount === 1,
    JSON.stringify({
      unsupported: histogram.unsupportedCount,
      irrelevant: histogram.widthIrrelevantCount,
    }),
  );
  check(
    "…and the deprecated device-width contribution is counted separately",
    histogram.deviceWidthCount === 1 && histogram.disjunctionCount === 1,
    JSON.stringify({
      device: histogram.deviceWidthCount,
      disjunction: histogram.disjunctionCount,
    }),
  );
  const noBreakpoints = foldMediaBreakpoints(NON_WIDTH_CONDITIONS.map((c) => parseMediaCondition(c)));
  const unreadable = foldMediaBreakpoints(
    ["(((", "(min-width: 640)", ""].map((c) => parseMediaCondition(c)),
  );
  check(
    "'the source authored no breakpoints' is distinguishable from 'we could not read them'",
    noBreakpoints.entries.length === 0 &&
      noBreakpoints.unparsedCount === 0 &&
      noBreakpoints.widthIrrelevantCount === 9 &&
      unreadable.entries.length === 0 &&
      unreadable.unparsedCount === 3 &&
      unreadable.widthIrrelevantCount === 0,
    JSON.stringify({
      irrelevantUnparsed: noBreakpoints.unparsedCount,
      unreadableUnparsed: unreadable.unparsedCount,
    }),
  );
  const tieBreak = foldMediaBreakpoints([parseMediaCondition("(width: 640px)")]);
  check(
    "a min and a max at the same px are separate entries, 'max' sorted before 'min'",
    tieBreak.entries.map((e) => `${e.px}:${e.kind}`).join(",") === "640:max,640:min",
    tieBreak.entries.map((e) => `${e.px}:${e.kind}`).join(","),
  );
  const duplicated = foldMediaBreakpoints([
    parseMediaCondition("(min-width: 900px) and (min-width: 900px)"),
  ]);
  check(
    "one condition contributes at most 1 to any single (px, kind) bucket",
    duplicated.entries.length === 1 && duplicated.entries[0]!.count === 1,
    JSON.stringify(duplicated.entries),
  );
  const printWidth = foldMediaBreakpoints([parseMediaCondition("print and (min-width: 900px)")]);
  check(
    "a width authored under a non-screen media type is skipped and counted, not folded in",
    printWidth.entries.length === 0 &&
      printWidth.nonScreenSkippedCount === 1 &&
      printWidth.widthIrrelevantCount === 1,
    JSON.stringify(printWidth),
  );
  const emptyFold = foldMediaBreakpoints([]);
  check(
    "folding nothing yields all-zero counters and no entries",
    emptyFold.entries.length === 0 && emptyFold.totalCount === 0 && emptyFold.unparsedCount === 0,
    JSON.stringify(emptyFold),
  );
  const badCount = foldMediaBreakpoints([
    { condition: parseMediaCondition("(max-width: 640px)"), count: Number.NaN },
    { condition: parseMediaCondition("(max-width: 640px)"), count: -5 },
  ]);
  check(
    "a nonsense occurrence count degrades to 1 rather than corrupting the histogram",
    badCount.entries.length === 1 && badCount.entries[0]!.count === 2 && badCount.totalCount === 2,
    JSON.stringify(badCount.entries),
  );
  const corpusHistogram = foldMediaBreakpoints(corpusResults);
  check(
    "folding the real corpus yields the boundaries the sources actually authored",
    corpusHistogram.entries.map((e) => `${e.px}:${e.kind}`).join(",") ===
      "450:min,599:max,600:max,600:min,640:max,750:min,768:max,899:max,900:max,900:min,901:min,930:min,1111:max,1112:min,1300:min",
    corpusHistogram.entries.map((e) => `${e.px}:${e.kind}`).join(","),
  );
  check(
    "…with 18 width conditions, 2 width-irrelevant, and nothing unread",
    corpusHistogram.widthCount === 18 &&
      corpusHistogram.widthIrrelevantCount === 2 &&
      corpusHistogram.unparsedCount === 0 &&
      corpusHistogram.unsupportedCount === 0,
    JSON.stringify(corpusHistogram),
  );

  console.log("\n§28.6-W2.1 paren balance is not evidence of meaning");

  check(
    "'(())' is UNPARSED — balanced garbage must not report as a clean non-width group",
    parseMediaCondition("(())").status === "unparsed",
    `${parseMediaCondition("(())").status} / ${parseMediaCondition("(())").reason ?? ""}`,
  );
  check(
    "a deep balanced nest containing no width word is UNPARSED, not width-irrelevant",
    parseMediaCondition("((((()))))").status === "unparsed" &&
      !parseMediaCondition("((((()))))").widthRelevant,
    `${parseMediaCondition("((((()))))").status} / ${parseMediaCondition("((((()))))").reason ?? ""}`,
  );
  check(
    "a nested group of pure connectives names no feature and is UNPARSED",
    parseMediaCondition("((and))").status === "unparsed" &&
      parseMediaCondition("((or))").status === "unparsed",
    `${parseMediaCondition("((and))").status} / ${parseMediaCondition("((or))").status}`,
  );
  check(
    "…but a nested group that DOES name a non-width feature is still width-irrelevant",
    parseMediaCondition("((hover: hover))").status === "width-irrelevant" &&
      parseMediaCondition("((pointer: fine) and (hover: hover))").status === "width-irrelevant",
    `${parseMediaCondition("((hover: hover))").status} / ${parseMediaCondition("((pointer: fine) and (hover: hover))").status}`,
  );
  check(
    "…and a nested group over WIDTH is still unsupported, not unparsed (the refusal is unchanged)",
    parseMediaCondition("((min-width: 100px) or (min-width: 200px))").status === "unsupported",
    parseMediaCondition("((min-width: 100px) or (min-width: 200px))").reason ?? "",
  );
  const balancedGarbage = foldMediaBreakpoints([
    parseMediaCondition("(())"),
    parseMediaCondition("((((()))))"),
  ]);
  check(
    "the unparsedCount gate now actually catches balanced garbage",
    balancedGarbage.unparsedCount === 2 &&
      balancedGarbage.widthIrrelevantCount === 0 &&
      balancedGarbage.entries.length === 0,
    JSON.stringify({
      unparsed: balancedGarbage.unparsedCount,
      irrelevant: balancedGarbage.widthIrrelevantCount,
    }),
  );

  console.log("\n§28.6-W2.2 an unsatisfiable condition names no breakpoint");

  const unsatisfiable = parseMediaCondition("(min-width: 64px) and (max-width: 32px)");
  check(
    "'(min-width: 64px) and (max-width: 32px)' parses as width with an EMPTY interval",
    unsatisfiable.status === "width" && unsatisfiable.interval?.empty === true,
    JSON.stringify({ status: unsatisfiable.status, empty: unsatisfiable.interval?.empty }),
  );
  const emptyFolded = foldMediaBreakpoints([unsatisfiable]);
  check(
    "…and the FOLD contributes zero entries for it, not two phantom snap targets",
    emptyFolded.entries.length === 0,
    emptyFolded.entries.map((e) => `${e.px}:${e.kind}`).join(","),
  );
  check(
    "…the skip is counted in emptyIntervalCount, never silent",
    emptyFolded.emptyIntervalCount === 1,
    String(emptyFolded.emptyIntervalCount),
  );
  check(
    "…and it no longer inflates widthCount",
    emptyFolded.widthCount === 0 && emptyFolded.widthIrrelevantCount === 1,
    JSON.stringify({
      width: emptyFolded.widthCount,
      irrelevant: emptyFolded.widthIrrelevantCount,
    }),
  );
  check(
    "…while the four status counters still partition the weighted total",
    emptyFolded.widthCount +
      emptyFolded.widthIrrelevantCount +
      emptyFolded.unsupportedCount +
      emptyFolded.unparsedCount ===
      emptyFolded.totalCount,
    JSON.stringify(emptyFolded),
  );
  const weightedEmpty = foldMediaBreakpoints([{ condition: unsatisfiable, count: 5 }]);
  check(
    "an unsatisfiable condition is skipped by its full occurrence weight",
    weightedEmpty.emptyIntervalCount === 5 && weightedEmpty.entries.length === 0,
    JSON.stringify({
      empty: weightedEmpty.emptyIntervalCount,
      entries: weightedEmpty.entries.length,
    }),
  );
  const mixedEmpty = foldMediaBreakpoints([
    unsatisfiable,
    parseMediaCondition("(min-width: 900px)"),
  ]);
  check(
    "a satisfiable condition beside an unsatisfiable one still folds normally",
    mixedEmpty.entries.map((e) => `${e.px}:${e.kind}=${e.count}`).join(",") === "900:min=1" &&
      mixedEmpty.emptyIntervalCount === 1,
    mixedEmpty.entries.map((e) => `${e.px}:${e.kind}=${e.count}`).join(","),
  );
  const halfEmptyDisjunction = foldMediaBreakpoints([
    parseMediaCondition("(min-width: 64px) and (max-width: 32px), (min-width: 900px)"),
  ]);
  check(
    "inside a disjunction only the unsatisfiable BRANCH is skipped, the other still folds",
    halfEmptyDisjunction.entries.map((e) => `${e.px}:${e.kind}`).join(",") === "900:min" &&
      halfEmptyDisjunction.emptyIntervalCount === 1 &&
      halfEmptyDisjunction.widthCount === 1,
    JSON.stringify({
      entries: halfEmptyDisjunction.entries,
      empty: halfEmptyDisjunction.emptyIntervalCount,
    }),
  );

  console.log("\n§28.6-W2.3 width-relevant is NOT the same as screen-applicable");

  const printTrap = parseMediaCondition("print and (min-width: 900px)");
  check(
    "'print and (min-width: 900px)' really is widthRelevant with 900 on the TOP-LEVEL interval",
    printTrap.widthRelevant &&
      printTrap.bounds.length === 1 &&
      printTrap.interval?.min?.breakpointPx === 900,
    JSON.stringify({
      widthRelevant: printTrap.widthRelevant,
      bounds: printTrap.bounds.length,
      min: printTrap.interval?.min?.breakpointPx,
    }),
  );
  check(
    "…so the ONLY thing that says 'do not snap a screen band here' is alternatives[].screenApplicable",
    printTrap.alternatives.length === 1 &&
      printTrap.alternatives[0]!.screenApplicable === false &&
      parseMediaCondition("screen and (min-width: 900px)").alternatives[0]!.screenApplicable ===
        true,
    JSON.stringify({
      print: printTrap.alternatives[0]!.screenApplicable,
      screen: parseMediaCondition("screen and (min-width: 900px)").alternatives[0]!
        .screenApplicable,
    }),
  );
  const mixedTypes = parseMediaCondition("print and (min-width: 900px), screen and (min-width: 700px)");
  check(
    "…and screenApplicable is PER ALTERNATIVE, because one comma list can mix screen and print",
    mixedTypes.alternatives.map((a) => String(a.screenApplicable)).join(",") === "false,true",
    mixedTypes.alternatives.map((a) => `${a.mediaType}=${a.screenApplicable}`).join(","),
  );
  check(
    "…the documented safe read (foldMediaBreakpoints) drops the print branch and keeps the screen one",
    foldMediaBreakpoints([mixedTypes]).entries.map((e) => `${e.px}:${e.kind}`).join(",") ===
      "700:min" && foldMediaBreakpoints([mixedTypes]).nonScreenSkippedCount === 1,
    JSON.stringify(foldMediaBreakpoints([mixedTypes]).entries),
  );

  console.log("\n§28.6-W2.5 degenerate widths are refused, not asserted satisfiable");

  const negative = parseMediaCondition("(width < 0px)");
  check(
    "'(width < 0px)' matches no width, so its interval is EMPTY rather than a tiny range",
    negative.status === "width" && negative.interval?.empty === true,
    JSON.stringify({
      status: negative.status,
      empty: negative.interval?.empty,
      breakpointPx: negative.bounds[0]?.breakpointPx,
    }),
  );
  check(
    "…and the fold counts it as empty-skipped instead of folding a negative pixel in",
    foldMediaBreakpoints([negative]).entries.length === 0 &&
      foldMediaBreakpoints([negative]).emptyIntervalCount === 1,
    JSON.stringify(foldMediaBreakpoints([negative]).entries),
  );
  check(
    "…while '(max-width: 0px)' stays satisfiable: width 0 is degenerate but real",
    parseMediaCondition("(max-width: 0px)").interval?.empty === false &&
      parseMediaCondition("(max-width: 0px)").bounds[0]!.breakpointPx === 0,
    JSON.stringify(parseMediaCondition("(max-width: 0px)").interval?.empty),
  );
  const zeroMin = parseMediaCondition("(min-width: 0)");
  check(
    "'(min-width: 0)' keeps adjacency with below === -1, the documented notional index",
    zeroMin.bounds[0]!.boundary.below === -1 &&
      zeroMin.bounds[0]!.boundary.above === 0 &&
      zeroMin.bounds[0]!.boundary.above === zeroMin.bounds[0]!.boundary.below + 1,
    JSON.stringify(zeroMin.bounds[0]!.boundary),
  );
  check(
    `a length at exactly MEDIA_CONDITION_MAX_LENGTH_PX (${MEDIA_CONDITION_MAX_LENGTH_PX}) is accepted with an EXACT adjacency`,
    (() => {
      const at = parseMediaCondition(`(min-width: ${MEDIA_CONDITION_MAX_LENGTH_PX}px)`);
      const bound = at.bounds[0];
      return (
        at.status === "width" &&
        bound !== undefined &&
        bound.boundary.above === bound.boundary.below + 1 &&
        bound.boundary.above !== bound.boundary.below
      );
    })(),
    parseMediaCondition(`(min-width: ${MEDIA_CONDITION_MAX_LENGTH_PX}px)`).status,
  );
  check(
    "a length past that magnitude is UNSUPPORTED — never a boundary whose halves are one float",
    parseMediaCondition(`(min-width: ${MEDIA_CONDITION_MAX_LENGTH_PX + 1}px)`).status ===
      "unsupported" &&
      parseMediaCondition("(min-width: 99999999999999999999px)").status === "unsupported",
    parseMediaCondition("(min-width: 99999999999999999999px)").reason ?? "",
  );
  check(
    "…and 2^53, where above === below + 1 could only hold vacuously, is refused too",
    parseMediaCondition(`(max-width: ${Number.MAX_SAFE_INTEGER}px)`).status === "unsupported",
    parseMediaCondition(`(max-width: ${Number.MAX_SAFE_INTEGER}px)`).reason ?? "",
  );
  check(
    "…while a real large stylesheet value like '(max-width: 99999px)' is untouched",
    parseMediaCondition("(max-width: 99999px)").status === "width" &&
      parseMediaCondition("(max-width: 99999px)").bounds[0]!.breakpointPx === 99999,
    parseMediaCondition("(max-width: 99999px)").reason ?? "",
  );
  const degenerateBattery = [
    "(min-width: 0)",
    "(max-width: 0px)",
    "(width < 0px)",
    "(width > 0px)",
    "(min-width: 0.4px)",
    "(max-width: 767.98px)",
    `(min-width: ${MEDIA_CONDITION_MAX_LENGTH_PX}px)`,
  ].map((c) => parseMediaCondition(c));
  check(
    "every bound in the degenerate battery is a whole-pixel pair with above === below + 1",
    degenerateBattery
      .flatMap(allBounds)
      .every(
        (b) =>
          Number.isInteger(b.boundary.below) &&
          Number.isInteger(b.boundary.above) &&
          b.boundary.above === b.boundary.below + 1,
      ),
    degenerateBattery.flatMap(allBounds).map(boundSig).join(" "),
  );

  console.log("\n§28.6-W2 purity and determinism");

  check(
    "parsing the same condition twice yields byte-identical JSON",
    JSON.stringify(parseMediaCondition("screen and (min-width: 40em) and (max-width: 1440px)")) ===
      JSON.stringify(parseMediaCondition("screen and (min-width: 40em) and (max-width: 1440px)")),
  );
  check(
    "folding the same conditions twice yields byte-identical JSON",
    JSON.stringify(foldMediaBreakpoints(corpusResults)) ===
      JSON.stringify(foldMediaBreakpoints(corpusResults)),
  );
  check(
    "notes are deduped and lexicographically sorted",
    (() => {
      const notes = parseMediaCondition("only screen and (min-width: 40em), (min-width: 40em)").notes;
      return notes.length === new Set(notes).size && notes.join(" ") === [...notes].sort().join(" ");
    })(),
    parseMediaCondition("only screen and (min-width: 40em), (min-width: 40em)").notes.join(" | "),
  );
  // Resolved against THIS script's own module URL, never the cwd. Read
  // cwd-relative, `pnpm smoke:sitespec` from any directory but the repo root
  // threw out of readFileSync and aborted the whole suite instead of failing
  // one check — an environment difference silently masquerading as a crash.
  const moduleSource = readFileSync(MEDIA_CONDITION_SOURCE_PATH, "utf8");
  check(
    "the purity checks locate the module relative to this script, not the cwd",
    path.isAbsolute(MEDIA_CONDITION_SOURCE_PATH) &&
      MEDIA_CONDITION_SOURCE_PATH.endsWith(
        path.join("src", "sitespec", "media-condition.ts"),
      ) &&
      moduleSource.length > 0,
    MEDIA_CONDITION_SOURCE_PATH,
  );
  check(
    "…decoded with fileURLToPath, so a checkout path with a space is a real path, not %20",
    (() => {
      /*
       * THIS CHECK READS ITS OWN SOURCE, on purpose.
       *
       * The first version of it demonstrated that `new URL(u).pathname` encodes
       * a space and `fileURLToPath` does not, then asserted that
       * MEDIA_CONDITION_SOURCE_PATH contains no `%XX`. Both halves are true of
       * the BROKEN code as well whenever the checkout path happens to have no
       * space in it — measured: reverting the constant to the `pathname` form
       * left the suite at 432/432, exit 0. It pinned a fact about the URL API,
       * not a fact about this file.
       *
       * So it now pins the line that matters: the constant is resolved through
       * `fileURLToPath` of this module's own URL and NOT through that URL's
       * percent-encoded `pathname`, read out of this file's own bytes. (The
       * forbidden spelling is deliberately NOT written out anywhere in this
       * comment — the second regex below would match its own documentation and
       * the check would fail for the wrong reason.) The semantic demonstration
       * is kept beneath it, because it is what explains WHY the pinned spelling
       * is the required one.
       */
      const ownSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
      // Anchored on the DECLARATION. A bare `includes("fileURLToPath(import.meta.url)")`
      // would match this check's own body two lines above and pin nothing.
      const usesFileUrlToPath =
        /const MEDIA_CONDITION_SOURCE_PATH = path\.resolve\(\s*path\.dirname\(fileURLToPath\(import\.meta\.url\)\)/.test(
          ownSource,
        );
      const usesEncodedPathname = /new URL\(\s*import\.meta\.url\s*\)\s*\.pathname/.test(
        ownSource,
      );
      const spaced = "file:///tmp/a b/scripts/smoke-sitespec.ts";
      const encoded = new URL(spaced).pathname;
      return (
        usesFileUrlToPath &&
        !usesEncodedPathname &&
        encoded.includes("%20") &&
        fileURLToPath(spaced) === "/tmp/a b/scripts/smoke-sitespec.ts" &&
        !/%[0-9a-fA-F]{2}/.test(MEDIA_CONDITION_SOURCE_PATH)
      );
    })(),
    `${new URL("file:///tmp/a b/x.ts").pathname} vs ${fileURLToPath("file:///tmp/a b/x.ts")}`,
  );
  check(
    "…and the pin is effective: it resolves a real file through a URL containing a space",
    (() => {
      /*
       * The other half the verifier asked for — a positive proof rather than a
       * source grep. A real temp directory whose name contains a space, a real
       * file in it, and the two decodings raced against each other: the
       * `pathname` form must FAIL to read it and `fileURLToPath` must succeed.
       * If a future Node made `pathname` decode, this check goes red and the
       * source grep above stops being load-bearing — which is the correct
       * signal, not a silent pass.
       */
      const dir = mkdtempSync(path.join(tmpdir(), "web-recon sitespec-"));
      try {
        const file = path.join(dir, "probe.ts");
        writeFileSync(file, "// probe\n");
        const url = pathToFileURL(file).href;
        if (!url.includes("%20")) return false;
        let encodedFormThrew = false;
        try {
          readFileSync(new URL(url).pathname, "utf8");
        } catch {
          encodedFormThrew = true;
        }
        return encodedFormThrew && readFileSync(fileURLToPath(url), "utf8") === "// probe\n";
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })(),
  );
  check(
    "the module imports nothing at all — no node builtin, no third party",
    !/^\s*import\s/m.test(moduleSource),
    (moduleSource.match(/^\s*import\s.*$/m) ?? []).join(" | "),
  );
  check(
    "the module touches no clock and no randomness",
    !/\bDate\b|Math\.random|process\.hrtime|performance\.now/.test(moduleSource),
  );
}

// ---------------------------------------------------------------------------
// §28.6-W2.6 authored breakpoints — wiring the tokenizer into the SiteSpec
//
// The unit under test is `computeAuthoredBreakpoints`, fed hand-built nodes in
// the exact shape `ElementSpecNode.authoredLayout` carries. Hand-built on
// purpose: the point is to pin the SEMANTICS of `@container` / `@supports` /
// `@layer` / `origin`, and a fixture derived from a real observation could only
// exercise whatever those particular sheets happened to use.
// ---------------------------------------------------------------------------

interface FixtureDeclaration {
  readonly media?: string;
  readonly supports?: string;
  readonly container?: string;
  readonly layer?: string;
  readonly origin?: "cssom" | "fetched";
}

function fixtureNode(
  declarations: readonly FixtureDeclaration[],
  truncated = false,
): { authoredLayout: readonly FixtureDeclaration[]; authoredLayoutTruncated?: boolean } {
  return truncated
    ? { authoredLayout: declarations, authoredLayoutTruncated: true }
    : { authoredLayout: declarations };
}

function authoredBreakpointChecks(): void {
  console.log("\n§28.6-W2.6 authored breakpoints — absence means absence, not zero");

  check(
    "a viewport with NO authored declaration at all gets no record (the field stays optional)",
    computeAuthoredBreakpoints([]) === undefined &&
      computeAuthoredBreakpoints([{}, {}]) === undefined,
    String(computeAuthoredBreakpoints([])),
  );
  const noMedia = computeAuthoredBreakpoints([fixtureNode([{}, {}, {}])]);
  check(
    "…but a viewport that HAS declarations and no @media among them gets zero entries and says so",
    noMedia !== undefined &&
      noMedia.entries.length === 0 &&
      noMedia.declarationsExamined === 3 &&
      noMedia.unconditionalDeclarations === 3 &&
      noMedia.mediaScopedDeclarations === 0,
    JSON.stringify(noMedia),
  );

  console.log("\n§28.6-W2.6 conditions are weighted by how many declarations use them");

  const weighted = computeAuthoredBreakpoints([
    fixtureNode([
      { media: "(max-width: 640px)" },
      { media: "(max-width: 640px)" },
      { media: "(min-width: 900px)" },
    ]),
    fixtureNode([{ media: "(max-width: 640px)" }, {}]),
  ]);
  check(
    "three declarations under (max-width: 640px) weigh 3, one under (min-width: 900px) weighs 1",
    weighted !== undefined &&
      weighted.entries.map((e) => `${e.px}:${e.kind}=${e.count}`).join(",") ===
        "640:max=3,900:min=1",
    weighted?.entries.map((e) => `${e.px}:${e.kind}=${e.count}`).join(","),
  );
  check(
    "…and the accounting adds up: examined = mediaScoped + unconditional here",
    weighted !== undefined &&
      weighted.declarationsExamined === 5 &&
      weighted.mediaScopedDeclarations === 4 &&
      weighted.foldedDeclarations === 4 &&
      weighted.unconditionalDeclarations === 1 &&
      weighted.distinctConditions === 2,
    JSON.stringify(weighted),
  );
  check(
    "the histogram is sorted by px ascending regardless of the order declarations appear in",
    (() => {
      const a = computeAuthoredBreakpoints([
        fixtureNode([
          { media: "(min-width: 1200px)" },
          { media: "(max-width: 480px)" },
          { media: "(min-width: 900px)" },
        ]),
      ]);
      return a?.entries.map((e) => e.px).join(",") === "480,900,1200";
    })(),
    computeAuthoredBreakpoints([
      fixtureNode([
        { media: "(min-width: 1200px)" },
        { media: "(max-width: 480px)" },
        { media: "(min-width: 900px)" },
      ]),
    ])?.entries.map((e) => e.px).join(","),
  );

  console.log("\n§28.6-W2.6 @container is not a viewport, and a gate is not 'always applies'");

  const containerOnly = computeAuthoredBreakpoints([
    fixtureNode([{ container: "(min-width: 400px)" }]),
  ]);
  check(
    "a @container-only declaration is NOT counted unconditional — that was the pre-28.6 lie",
    containerOnly !== undefined &&
      containerOnly.unconditionalDeclarations === 0 &&
      containerOnly.containerScopedDeclarations === 1 &&
      containerOnly.declarationsExamined === 1,
    JSON.stringify(containerOnly),
  );
  check(
    "…and its container query text never becomes a viewport breakpoint, even spelled like one",
    containerOnly !== undefined &&
      containerOnly.entries.length === 0 &&
      containerOnly.mediaScopedDeclarations === 0,
    JSON.stringify(containerOnly?.entries),
  );
  const containerGated = computeAuthoredBreakpoints([
    fixtureNode([
      { media: "(min-width: 900px)", container: "(min-width: 400px)" },
      { media: "(min-width: 900px)" },
    ]),
  ]);
  check(
    "a declaration under BOTH @media and @container is excluded: its width follows a box, not the window",
    containerGated !== undefined &&
      containerGated.entries.map((e) => `${e.px}:${e.kind}=${e.count}`).join(",") ===
        "900:min=1",
    containerGated?.entries.map((e) => `${e.px}:${e.kind}=${e.count}`).join(","),
  );
  check(
    "…and that exclusion is counted in containerGatedSkippedDeclarations, never silent",
    containerGated !== undefined &&
      containerGated.mediaScopedDeclarations === 2 &&
      containerGated.foldedDeclarations === 1 &&
      containerGated.containerGatedSkippedDeclarations === 1,
    JSON.stringify(containerGated),
  );
  const supportsOnly = computeAuthoredBreakpoints([
    fixtureNode([{ supports: "(display: grid)" }]),
  ]);
  check(
    "a @supports-only declaration is NOT unconditional either, and names no breakpoint",
    supportsOnly !== undefined &&
      supportsOnly.unconditionalDeclarations === 0 &&
      supportsOnly.supportsScopedDeclarations === 1 &&
      supportsOnly.entries.length === 0,
    JSON.stringify(supportsOnly),
  );
  const supportsGated = computeAuthoredBreakpoints([
    fixtureNode([{ media: "(min-width: 900px)", supports: "(display: grid)" }]),
  ]);
  check(
    "…but @supports + @media IS folded: a feature gate is not a size gate (documented decision)",
    supportsGated !== undefined &&
      supportsGated.entries.map((e) => `${e.px}:${e.kind}=${e.count}`).join(",") ===
        "900:min=1" &&
      supportsGated.supportsScopedDeclarations === 1,
    JSON.stringify(supportsGated?.entries),
  );
  const layered = computeAuthoredBreakpoints([
    fixtureNode([{ media: "(min-width: 900px)", layer: "base.components" }]),
  ]);
  check(
    "@layer changes cascade order, never applicability — it is counted and does not exclude",
    layered !== undefined &&
      layered.layerScopedDeclarations === 1 &&
      layered.entries.map((e) => `${e.px}:${e.kind}`).join(",") === "900:min" &&
      layered.unconditionalDeclarations === 0,
    JSON.stringify(layered),
  );
  const fetched = computeAuthoredBreakpoints([
    fixtureNode([
      { media: "(min-width: 900px)", origin: "fetched" },
      { media: "(min-width: 900px)", origin: "cssom" },
    ]),
  ]);
  check(
    "provenance is carried: declarations recovered from the network are counted separately",
    fetched !== undefined &&
      fetched.fetchedOriginDeclarations === 1 &&
      fetched.entries[0]!.count === 2,
    JSON.stringify(fetched),
  );
  const blankScopes = computeAuthoredBreakpoints([
    fixtureNode([{ media: "   ", container: "", supports: "  " }]),
  ]);
  check(
    "a whitespace-only scope string is treated as absent, not as an unparseable condition",
    blankScopes !== undefined &&
      blankScopes.unconditionalDeclarations === 1 &&
      blankScopes.unparsedDeclarations === 0 &&
      blankScopes.mediaScopedDeclarations === 0,
    JSON.stringify(blankScopes),
  );

  console.log("\n§28.6-W2.6 every skip reaches a counter a caller can read");

  const skips = computeAuthoredBreakpoints([
    fixtureNode(
      [
        { media: "(max-width: 640px)" },
        { media: "print and (min-width: 900px)" },
        { media: "(min-width: 64px) and (max-width: 32px)" },
        { media: "(())" },
        { media: "not screen" },
        { media: "(min-width: 50vw)" },
        { media: "(max-device-width: 480px)" },
        { media: "screen and (min-width: 700px), (min-width: 1200px)" },
      ],
      true,
    ),
  ]);
  check(
    "the folded histogram contains only the conditions that name a real screen breakpoint",
    skips !== undefined &&
      skips.entries.map((e) => `${e.px}:${e.kind}`).join(",") ===
        "480:max,640:max,700:min,1200:min",
    skips?.entries.map((e) => `${e.px}:${e.kind}`).join(","),
  );
  check(
    "…non-screen, unsatisfiable, unparsed and unsupported each land in their own counter",
    skips !== undefined &&
      skips.nonScreenSkippedDeclarations === 1 &&
      skips.emptyIntervalSkippedDeclarations === 1 &&
      skips.unparsedDeclarations === 1 &&
      skips.unsupportedDeclarations === 2,
    JSON.stringify({
      nonScreen: skips?.nonScreenSkippedDeclarations,
      empty: skips?.emptyIntervalSkippedDeclarations,
      unparsed: skips?.unparsedDeclarations,
      unsupported: skips?.unsupportedDeclarations,
    }),
  );
  check(
    "…and the offending condition STRINGS are named, so a caller can go read the stylesheet",
    skips !== undefined &&
      skips.unparsedConditions.join("|") === "(())" &&
      skips.unsupportedConditions.join("|") === "(min-width: 50vw)|not screen",
    JSON.stringify({
      unparsed: skips?.unparsedConditions,
      unsupported: skips?.unsupportedConditions,
    }),
  );
  check(
    "…the deprecated device-width and the disjunction are flagged rather than hidden",
    skips !== undefined &&
      skips.deviceWidthDeclarations === 1 &&
      skips.disjunctionDeclarations === 1,
    JSON.stringify({
      device: skips?.deviceWidthDeclarations,
      disjunction: skips?.disjunctionDeclarations,
    }),
  );
  check(
    "…a truncated authored-layout list is reported, so an incomplete fold cannot read as complete",
    skips !== undefined && skips.truncatedNodeCount === 1,
    String(skips?.truncatedNodeCount),
  );
  check(
    "the weighted status counters partition the folded declarations exactly",
    skips !== undefined &&
      skips.widthDeclarations +
        skips.widthIrrelevantDeclarations +
        skips.unsupportedDeclarations +
        skips.unparsedDeclarations ===
        skips.foldedDeclarations,
    JSON.stringify({
      width: skips?.widthDeclarations,
      irrelevant: skips?.widthIrrelevantDeclarations,
      unsupported: skips?.unsupportedDeclarations,
      unparsed: skips?.unparsedDeclarations,
      folded: skips?.foldedDeclarations,
    }),
  );
  check(
    "every examined declaration is accounted for by media-scoped + unconditional + gate-only",
    (() => {
      const all = computeAuthoredBreakpoints([
        fixtureNode([
          { media: "(min-width: 900px)" },
          { container: "(min-width: 400px)" },
          { supports: "(display: grid)" },
          { layer: "base" },
          {},
        ]),
      ]);
      if (all === undefined) return false;
      const gateOnly = 2; // the @container-only and the @supports-only declarations
      return (
        all.declarationsExamined === 5 &&
        all.mediaScopedDeclarations + all.unconditionalDeclarations + gateOnly ===
          all.declarationsExamined &&
        all.unconditionalDeclarations === 2 // the bare one, and the @layer-only one
      );
    })(),
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([
          { media: "(min-width: 900px)" },
          { container: "(min-width: 400px)" },
          { supports: "(display: grid)" },
          { layer: "base" },
          {},
        ]),
      ]),
    ),
  );

  console.log("\n§28.6-W2.6 determinism and the assumed root font size");

  /*
   * WHAT THESE CHECKS DO AND DO NOT PIN (Task 28.6 Wave 3, verifier correction).
   *
   * They pin ORDER-INDEPENDENCE of the output. They do NOT pin the `sort` inside
   * `computeAuthoredBreakpoints`, and it would be dishonest to name it here as
   * though they did: measured, deleting that sort leaves this suite green and
   * leaves 200 random permutations of a 10-condition node byte-identical, because
   * the output is order-independent BY CONSTRUCTION — the fold is keyed, the
   * histogram and the boundary view are sorted by pixel, and both diagnostic
   * string arrays are sorted after their flatMap. The sort is documented as
   * defensive at its own site. The property below is the real invariant, and it
   * is the one that would break if a future field made the output depend on the
   * order conditions arrive in.
   */
  check(
    "two computations over the same nodes are byte-identical",
    JSON.stringify(computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])])) ===
      JSON.stringify(computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])])),
  );
  check(
    "node order does not change the histogram (order-independence, not the sort)",
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(min-width: 900px)" }]),
        fixtureNode([{ media: "(max-width: 640px)" }]),
      ]),
    ) ===
      JSON.stringify(
        computeAuthoredBreakpoints([
          fixtureNode([{ media: "(max-width: 640px)" }]),
          fixtureNode([{ media: "(min-width: 900px)" }]),
        ]),
      ),
  );
  check(
    "…and it holds as a PROPERTY: 200 shuffles of a 10-condition node fold identically",
    (() => {
      // Every awkward shape in one node: two spellings of one condition, an
      // unparsed one, an unsupported one, a disjunction, a non-screen type, an
      // unsatisfiable interval, a container gate and a bare declaration.
      const declarations: FixtureDeclaration[] = [
        { media: "(max-width: 640px)" },
        { media: "(MAX-WIDTH: 640px)" },
        { media: "(min-width: 1025px)" },
        { media: "((((" },
        { media: "not screen and (min-width: 700px)" },
        { media: "(min-width: 500px), (max-width: 300px)" },
        { media: "print and (min-width: 900px)" },
        { media: "(min-width: 64px) and (max-width: 32px)" },
        { media: "(min-width: 900px)", container: "(min-width: 400px)" },
        {},
      ];
      const expected = JSON.stringify(computeAuthoredBreakpoints([fixtureNode(declarations)]));
      // Deterministic pseudo-shuffle: no Math.random, so a failure reproduces.
      let seed = 0x2f6e2b1;
      const nextInt = (bound: number): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed % bound;
      };
      for (let round = 0; round < 200; round++) {
        const shuffled = [...declarations];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = nextInt(i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }
        // Split across a random number of nodes too, so DOM order varies as well.
        const cut = nextInt(shuffled.length + 1);
        const actual = JSON.stringify(
          computeAuthoredBreakpoints([
            fixtureNode(shuffled.slice(0, cut)),
            fixtureNode(shuffled.slice(cut)),
          ]),
        );
        if (actual !== expected) return false;
      }
      return true;
    })(),
  );
  check(
    "the assumed root font size is carried in the record, never hidden inside the number",
    (() => {
      const em = computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])]);
      return (
        em?.rootFontSizePx === MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX &&
        em.entries.map((e) => `${e.px}:${e.kind}`).join(",") === "640:min"
      );
    })(),
    JSON.stringify(computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])])),
  );
  check(
    "…and an explicit root font size moves the breakpoint accordingly",
    computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])], {
      rootFontSizePx: 20,
    })?.entries.map((e) => `${e.px}:${e.kind}`).join(",") === "800:min",
    JSON.stringify(
      computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])], {
        rootFontSizePx: 20,
      })?.entries,
    ),
  );
  check(
    "…and the RECORD reports the size it actually used, not the default it did not",
    // The two checks above pin the default and pin that the entries MOVE. Neither
    // pins the reported value: hard-coding `rootFontSizePx: 16` into the returned
    // record left the suite green (measured), so a record computed at 20 could
    // report 16 — in the one field whose entire purpose is to disclose the
    // assumption behind the number beside it.
    computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])], {
      rootFontSizePx: 20,
    })?.rootFontSizePx === 20,
    String(
      computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])], {
        rootFontSizePx: 20,
      })?.rootFontSizePx,
    ),
  );
  check(
    "…and a non-finite or non-positive override falls back to the default and SAYS 16",
    computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])], {
      rootFontSizePx: 0,
    })?.rootFontSizePx === MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX &&
      computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 40em)" }])], {
        rootFontSizePx: Number.NaN,
      })?.rootFontSizePx === MEDIA_CONDITION_DEFAULT_ROOT_FONT_SIZE_PX,
  );

  console.log("\n§28.6-W2.6 schema compatibility — a pre-28.6 SiteSpec is untouched");

  const computed = computeAuthoredBreakpoints([fixtureNode([{ media: "(max-width: 640px)" }])]);
  check(
    "the computed record validates against AuthoredBreakpointsSchema",
    AuthoredBreakpointsSchema.safeParse(computed).success,
    JSON.stringify(AuthoredBreakpointsSchema.safeParse(computed).error?.issues ?? []),
  );
  const legacyViewport = {
    profile: {
      id: "desktop",
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    documentDimensions: {
      viewportWidth: 1440,
      viewportHeight: 900,
      documentWidth: 1440,
      documentHeight: 2000,
      scrollWidth: 1440,
      scrollHeight: 2000,
    },
    contentRecovery: {
      status: "aligned",
      source: "rendered-html",
      sourceElementCount: 1,
      textNodeCount: 0,
      cappedSourceTextCount: 0,
      recoveredLongTextCount: 0,
      longestTextLength: 0,
      supplementalAttributeCount: 0,
      supplementalElementCount: 0,
      supplementalAttributeNames: [],
    },
    rootNodeIds: ["n1"],
    nodes: [],
    sourceElementCount: 1,
    elementNodeCount: 0,
    textNodeCount: 0,
    localVisibleCount: 0,
    effectiveVisibleCount: 0,
    styleTokenCount: 0,
    assetRefs: [],
    frameInventory: [],
    shadowInventory: { openShadowRootCount: 0, hostNodeIds: [], limitations: [] },
    limitations: [],
  };
  const legacyParsed = ViewportPageSpecSchema.safeParse(legacyViewport);
  check(
    "a v2–v4 viewport with NO authoredBreakpoints key still parses — the field is optional",
    legacyParsed.success && legacyParsed.data?.authoredBreakpoints === undefined,
    JSON.stringify(legacyParsed.error?.issues ?? []),
  );
  const withField = ViewportPageSpecSchema.safeParse({
    ...legacyViewport,
    authoredBreakpoints: computed,
  });
  check(
    "…and the same viewport WITH the field parses and round-trips the histogram",
    withField.success &&
      withField.data?.authoredBreakpoints?.entries.map((e) => `${e.px}:${e.kind}`).join(",") ===
        "640:max",
    JSON.stringify(withField.error?.issues ?? []),
  );
  check(
    "the viewport schema strips unknown keys rather than rejecting them (it is not .strict())",
    (() => {
      const parsed = ViewportPageSpecSchema.safeParse({
        ...legacyViewport,
        someFutureFieldFromALaterTask: 1,
      });
      return (
        parsed.success &&
        !Object.prototype.hasOwnProperty.call(parsed.data, "someFutureFieldFromALaterTask")
      );
    })(),
  );
  check(
    "SCHEMA_VERSION bumped to 6 while 2, 3, 4 and 5 stay readable, so nothing on disk is invalidated",
    SCHEMA_VERSION === 6 &&
      READABLE_SCHEMA_VERSIONS.includes(5) &&
      READABLE_SCHEMA_VERSIONS.includes(2) &&
      READABLE_SCHEMA_VERSIONS.includes(3) &&
      READABLE_SCHEMA_VERSIONS.includes(4) &&
      READABLE_SCHEMA_VERSIONS.includes(5),
    `${SCHEMA_VERSION} / [${READABLE_SCHEMA_VERSIONS.join(",")}]`,
  );

  console.log("\n§28.6-W3 one breakpoint spelled three ways is one condition (V3/V4)");

  // Case, inner whitespace and colon spacing are all free variation in CSS. Keying
  // the weight map on the raw text reported three distinct conditions for one real
  // breakpoint — a confidently wrong number in a field a caller reads to decide how
  // much the source said.
  const spellings = computeAuthoredBreakpoints([
    fixtureNode([
      { media: "(max-width: 640px)" },
      { media: "(MAX-WIDTH: 640px)" },
      { media: "(max-width:640px)" },
    ]),
  ]);
  check(
    "three spellings of (max-width: 640px) are ONE condition, not three",
    spellings !== undefined &&
      spellings.distinctConditions === 1 &&
      spellings.entries.map((e) => `${e.px}:${e.kind}=${e.count}`).join(",") === "640:max=3",
    JSON.stringify({
      distinct: spellings?.distinctConditions,
      entries: spellings?.entries,
    }),
  );
  check(
    "…and the collapse is not silent: distinctRawConditions still reports the three spellings",
    spellings !== undefined && spellings.distinctRawConditions === 3,
    String(spellings?.distinctRawConditions),
  );
  // The folded weight must be the SUM of the group's spellings, never the number of
  // spellings and never a default of 1: the old lookup keyed the count by the parse
  // result's own raw text, which only worked while one raw text meant one entry.
  const unevenSpellings = computeAuthoredBreakpoints([
    fixtureNode([
      { media: "(MIN-WIDTH: 900px)" },
      { media: "(MIN-WIDTH: 900px)" },
      { media: "(min-width:900px)" },
      { media: "(min-width: 900px)" },
      { media: "(min-width: 900px)" },
      { media: "(min-width: 900px)" },
    ]),
  ]);
  check(
    "the merged weight is the sum of every spelling's declarations, not the spelling count",
    unevenSpellings !== undefined &&
      unevenSpellings.entries.map((e) => `${e.px}:${e.kind}=${e.count}`).join(",") ===
        "900:min=6" &&
      unevenSpellings.foldedDeclarations === 6 &&
      unevenSpellings.widthDeclarations === 6 &&
      unevenSpellings.distinctConditions === 1 &&
      unevenSpellings.distinctRawConditions === 3,
    JSON.stringify(unevenSpellings),
  );
  const spelledFailures = computeAuthoredBreakpoints([
    fixtureNode([{ media: "NOT SCREEN" }, { media: "not  screen" }, { media: "not screen" }]),
  ]);
  check(
    "a condition that failed is still named by EVERY raw spelling, so the stylesheet is findable",
    spelledFailures !== undefined &&
      spelledFailures.distinctConditions === 1 &&
      spelledFailures.distinctRawConditions === 3 &&
      spelledFailures.unsupportedConditions.join("|") === "NOT SCREEN|not  screen|not screen" &&
      spelledFailures.unsupportedDeclarations === 3,
    JSON.stringify(spelledFailures),
  );
  check(
    "merging spellings does not disturb determinism — the same nodes still fold byte-identically",
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(MAX-WIDTH: 640px)" }, { media: "(max-width:640px)" }]),
      ]),
    ) ===
      JSON.stringify(
        computeAuthoredBreakpoints([
          fixtureNode([{ media: "(max-width:640px)" }, { media: "(MAX-WIDTH: 640px)" }]),
        ]),
      ),
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(MAX-WIDTH: 640px)" }, { media: "(max-width:640px)" }]),
      ]),
    ),
  );

  console.log("\n§28.6-W3 truncated-to-nothing is not the same as authored-nothing (V2)");

  // `undefined` carries the handoff rule "absent means we recovered nothing". A node
  // whose authored-layout list was truncated to empty recovered nothing EITHER, but
  // for a reason a caller must be able to see — the previous early return discarded
  // truncatedNodeCount along with everything else and made the two indistinguishable.
  const truncatedToNothing = computeAuthoredBreakpoints([fixtureNode([], true)]);
  check(
    "a node truncated to zero declarations yields a record, not undefined",
    truncatedToNothing !== undefined &&
      truncatedToNothing.declarationsExamined === 0 &&
      truncatedToNothing.truncatedNodeCount === 1 &&
      truncatedToNothing.entries.length === 0 &&
      truncatedToNothing.distinctConditions === 0 &&
      truncatedToNothing.distinctRawConditions === 0,
    JSON.stringify(truncatedToNothing),
  );
  check(
    "…while nodes that were never truncated and carry nothing still yield undefined",
    computeAuthoredBreakpoints([fixtureNode([])]) === undefined &&
      computeAuthoredBreakpoints([{ authoredLayoutTruncated: false }]) === undefined,
    String(computeAuthoredBreakpoints([fixtureNode([])])),
  );
  check(
    "the truncated-to-nothing record validates against AuthoredBreakpointsSchema",
    AuthoredBreakpointsSchema.safeParse(truncatedToNothing).success,
    JSON.stringify(AuthoredBreakpointsSchema.safeParse(truncatedToNothing).error?.issues ?? []),
  );
  check(
    "distinctRawConditions is optional, so a v5 record written before it existed still parses",
    (() => {
      if (spellings === undefined) return false;
      const { distinctRawConditions: _dropped, ...withoutTheNewField } = spellings;
      const parsed = AuthoredBreakpointsSchema.safeParse(withoutTheNewField);
      return parsed.success && parsed.data?.distinctRawConditions === undefined;
    })(),
    JSON.stringify(
      AuthoredBreakpointsSchema.safeParse({
        ...(spellings ?? {}),
        distinctRawConditions: undefined,
      }).error?.issues ?? [],
    ),
  );

  boundaryAdjacencyChecks();
}

/**
 * §28.6-W3 — THE BOUNDARY ADJACENCY INVARIANT.
 *
 * `entries` is keyed on `(px, kind)`: what the source literally wrote.
 * `boundaries` is keyed on `{below, above}`: where the layout actually changes.
 * The two differ by exactly one pixel per authored change, and a band-edge
 * snapper that reads the wrong one puts a real pixel at a width nothing changes
 * at. These checks pin that `(max-width: N)` and `(min-width: N+1)` are ONE row
 * in `boundaries` and TWO in `entries`, that adjacency holds for every row, and
 * that the fold is not merely "collapse anything within a pixel".
 *
 * The end-to-end half of the same invariant — the same pair arriving from a real
 * observation, through `compileSiteSpec`, onto disk and back — is asserted in
 * `main()` against the compiled fixture. This half is the algebra.
 */
function boundaryAdjacencyChecks(): void {
  console.log("\n§28.6-W3 boundary adjacency — one authored change is ONE breakpoint");

  const maxOnly = computeAuthoredBreakpoints([fixtureNode([{ media: "(max-width: 1024px)" }])]);
  const minOnly = computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 1025px)" }])]);
  check(
    "(max-width: 1024px) names the boundary {1024, 1025} from below",
    JSON.stringify(maxOnly?.boundaries) ===
      JSON.stringify([{ below: 1024, above: 1025, count: 1, minCount: 0, maxCount: 1 }]) &&
      JSON.stringify(maxOnly?.entries) ===
        JSON.stringify([{ px: 1024, kind: "max", count: 1 }]),
    JSON.stringify(maxOnly?.boundaries),
  );
  check(
    "(min-width: 1025px) names the SAME boundary from above",
    JSON.stringify(minOnly?.boundaries) ===
      JSON.stringify([{ below: 1024, above: 1025, count: 1, minCount: 1, maxCount: 0 }]) &&
      JSON.stringify(minOnly?.entries) ===
        JSON.stringify([{ px: 1025, kind: "min", count: 1 }]),
    JSON.stringify(minOnly?.boundaries),
  );

  const both = computeAuthoredBreakpoints([
    fixtureNode([{ media: "(max-width: 1024px)" }, { media: "(min-width: 1025px)" }]),
  ]);
  check(
    "together they are ONE breakpoint in `boundaries`…",
    both?.boundaries?.length === 1 &&
      JSON.stringify(both.boundaries) ===
        JSON.stringify([{ below: 1024, above: 1025, count: 2, minCount: 1, maxCount: 1 }]),
    JSON.stringify(both?.boundaries),
  );
  check(
    "…and TWO rows in `entries`, one pixel apart, because that is what the source says",
    JSON.stringify(both?.entries) ===
      JSON.stringify([
        { px: 1024, kind: "max", count: 1 },
        { px: 1025, kind: "min", count: 1 },
      ]),
    JSON.stringify(both?.entries),
  );
  check(
    "…so a snapper reading `entries` would see 2 breakpoints where the author wrote 1",
    (both?.entries.length ?? 0) === 2 && (both?.boundaries?.length ?? 0) === 1,
  );

  // The pair the corpus on disk actually spells both ways: (max-width: 899px)
  // x3,382 beside (min-width: 900px) x46,250, measured over every observation
  // under data/. Same invariant, observed weights.
  const observedPair = computeAuthoredBreakpoints([
    fixtureNode([
      ...Array.from({ length: 3 }, () => ({ media: "(max-width: 899px)" })),
      ...Array.from({ length: 7 }, () => ({ media: "(min-width: 900px)" })),
    ]),
  ]);
  check(
    "the pair the observations really carry — (max-width: 899px) / (min-width: 900px) — folds to one",
    JSON.stringify(observedPair?.boundaries) ===
      JSON.stringify([{ below: 899, above: 900, count: 10, minCount: 7, maxCount: 3 }]),
    JSON.stringify(observedPair?.boundaries),
  );

  const notAdjacent = computeAuthoredBreakpoints([
    fixtureNode([{ media: "(max-width: 1024px)" }, { media: "(min-width: 1026px)" }]),
  ]);
  check(
    "a NON-adjacent pair stays two boundaries — the fold is exact, not a 1px tolerance",
    JSON.stringify(notAdjacent?.boundaries) ===
      JSON.stringify([
        { below: 1024, above: 1025, count: 1, minCount: 0, maxCount: 1 },
        { below: 1025, above: 1026, count: 1, minCount: 1, maxCount: 0 },
      ]),
    JSON.stringify(notAdjacent?.boundaries),
  );
  check(
    "…and (max-width: 900px) is a DIFFERENT change from (min-width: 900px), one pixel over",
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(max-width: 900px)" }, { media: "(min-width: 900px)" }]),
      ])?.boundaries,
    ) ===
      JSON.stringify([
        { below: 899, above: 900, count: 1, minCount: 1, maxCount: 0 },
        { below: 900, above: 901, count: 1, minCount: 0, maxCount: 1 },
      ]),
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(max-width: 900px)" }, { media: "(min-width: 900px)" }]),
      ])?.boundaries,
    ),
  );

  // Whole-corpus properties. Every distinct `media` string observed under data/,
  // folded at once; these must hold for all of them, not just the pairs above.
  const corpus = computeAuthoredBreakpoints([
    fixtureNode(OBSERVED_MEDIA_CORPUS.map((media) => ({ media }))),
  ]);
  check(
    "every boundary over the observed corpus is adjacent: above === below + 1",
    (corpus?.boundaries?.length ?? 0) > 0 &&
      (corpus?.boundaries ?? []).every((b) => b.above === b.below + 1),
    JSON.stringify(corpus?.boundaries),
  );
  check(
    "…each row's min/max split accounts for its whole weight",
    (corpus?.boundaries ?? []).every((b) => b.minCount + b.maxCount === b.count),
    JSON.stringify(corpus?.boundaries),
  );
  check(
    "…the boundary view never loses a declaration the entry view kept",
    (corpus?.boundaries ?? []).reduce((n, b) => n + b.count, 0) ===
      (corpus?.entries ?? []).reduce((n, e) => n + e.count, 0),
    `${(corpus?.boundaries ?? []).reduce((n, b) => n + b.count, 0)} vs ${(corpus?.entries ?? []).reduce((n, e) => n + e.count, 0)}`,
  );
  check(
    "…and it collapses the corpus's four adjacent pairs, so it is strictly smaller",
    (corpus?.boundaries?.length ?? 0) < (corpus?.entries.length ?? 0),
    `${corpus?.boundaries?.length} boundaries vs ${corpus?.entries.length} entries`,
  );
  check(
    "…every boundary is sorted ascending by `below`, like every other array here",
    (corpus?.boundaries ?? []).every(
      (b, i, all) => i === 0 || all[i - 1]!.below < b.below,
    ),
    JSON.stringify((corpus?.boundaries ?? []).map((b) => b.below)),
  );

  check(
    "a 0px bound keeps adjacency rather than clamping: below === -1, above === 0",
    JSON.stringify(
      computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 0px)" }])])?.boundaries,
    ) === JSON.stringify([{ below: -1, above: 0, count: 1, minCount: 1, maxCount: 0 }]),
    JSON.stringify(
      computeAuthoredBreakpoints([fixtureNode([{ media: "(min-width: 0px)" }])])?.boundaries,
    ),
  );
  check(
    "a condition naming one boundary twice weighs it ONCE, like the entry view",
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(min-width: 900px) and (width >= 900px)" }]),
      ])?.boundaries,
    ) === JSON.stringify([{ below: 899, above: 900, count: 1, minCount: 1, maxCount: 0 }]),
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(min-width: 900px) and (width >= 900px)" }]),
      ])?.boundaries,
    ),
  );
  check(
    "a condition spanning two boundaries contributes to BOTH",
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(min-width: 600px) and (max-width: 899px)" }]),
      ])?.boundaries,
    ) ===
      JSON.stringify([
        { below: 599, above: 600, count: 1, minCount: 1, maxCount: 0 },
        { below: 899, above: 900, count: 1, minCount: 0, maxCount: 1 },
      ]),
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(min-width: 600px) and (max-width: 899px)" }]),
      ])?.boundaries,
    ),
  );
  check(
    "…and a skipped condition reaches NEITHER view: an unsatisfiable interval folds to nothing",
    (() => {
      const empty = computeAuthoredBreakpoints([
        fixtureNode([{ media: "(min-width: 64px) and (max-width: 32px)" }]),
      ]);
      return (
        empty !== undefined &&
        empty.entries.length === 0 &&
        (empty.boundaries ?? []).length === 0 &&
        empty.emptyIntervalSkippedDeclarations === 1
      );
    })(),
    JSON.stringify(
      computeAuthoredBreakpoints([
        fixtureNode([{ media: "(min-width: 64px) and (max-width: 32px)" }]),
      ]),
    ),
  );
  check(
    "the boundary view validates against the persisted schema",
    AuthoredBreakpointsSchema.safeParse(both).success,
    JSON.stringify(AuthoredBreakpointsSchema.safeParse(both).error?.issues ?? []),
  );
  check(
    "…and it is optional, so a v5 record written before the view existed still parses",
    (() => {
      if (both === undefined) return false;
      const { boundaries: _dropped, ...withoutTheNewView } = both;
      const parsed = AuthoredBreakpointsSchema.safeParse(withoutTheNewView);
      return parsed.success && parsed.data?.boundaries === undefined;
    })(),
  );
}

// ---------------------------------------------------------------------------
// Responsive Core P0 §C1.4 / §C1.7 — inline-style provenance + carry-through
// (appended section; nothing above was renumbered). Imports are hoisted.
// ---------------------------------------------------------------------------

import {
  compareStyleValues,
  computeInlineStyleProvenance,
  normalizeStyleValue,
  parseStyleText,
  stylePropertiesRelated,
  type ProvenanceElementInput,
} from "../src/observer/inline-provenance.js";
import { compilePage } from "../src/sitespec/compile-page.js";
import { AssetCatalogBuilder } from "../src/sitespec/asset-catalog.js";
import { StyleCatalogBuilder } from "../src/sitespec/style-catalog.js";
import {
  LayoutProbeSchema,
  PageObservationSchema,
  type InlineStyle,
  type LayoutProbe,
} from "../src/observer/types.js";
import { PageSpecSchema } from "../src/sitespec/types.js";

const P0_INITIAL_HTML =
  `<!doctype html><html><head><title>p0</title><script>var x = 1;</script></head><body>` +
  `<header id="top" style="width: 40%; margin: 0 auto">Top</header>` +
  `<main class="shell wide">` +
  `<div class="card" style="width: 100px">Card</div>` +
  `<div style="height: 10px"></div>` +
  `<section id="dup"></section><section id="dup"></section>` +
  `<p class="alpha" style="color: red">Para</p>` +
  `<div id="csr-root"></div>` +
  `</main>` +
  `<noscript><div>ignored</div></noscript>` +
  `<footer class="foot" style="width: 10px">Foot</footer>` +
  `</body></html>`;

/** Review follow-up — a stylesheet coverage record with every gap counter non-trivial. */
const P0_STYLESHEET_COVERAGE = StylesheetCoverageSchemaForCheck.parse({
  stylesheetsTotal: 4,
  cssomReadable: 2,
  cssomBlocked: 2,
  fallbackRecovered: 1,
  fallbackMissed: 1,
  importsExpanded: 0,
  importsUnresolved: 1,
  bytesCaptured: 2048,
  rulesIndexed: 40,
  nestedRulesVisited: 0,
  importRulesVisited: 1,
  importRulesUnresolved: 1,
  ruleIndexCapHit: true,
  groupingRulesSkipped: 3,
  sheetsSkippedBySizeCap: 1,
  sheetsBodyUnavailable: 1,
  layoutRulesMatched: 12,
  layoutRulesKept: 8,
  layoutRulesTruncated: 4,
  layoutRulesTruncatedElements: 1,
});

function p0Inline(raw: string, decls: [string, string][]): InlineStyle {
  return { decls: decls.map(([property, value]) => ({ property, value })), raw };
}

/** Runtime dom.json the fixture page "rendered" (ids e000001…, document order). */
const P0_RUNTIME: ProvenanceElementInput[] = [
  { id: "e000001", tagName: "html", attributes: {} },
  { id: "e000002", parentId: "e000001", tagName: "body", attributes: {} },
  {
    id: "e000003",
    parentId: "e000002",
    tagName: "header",
    attributes: { id: "top" },
    text: "Top",
    inlineStyle: p0Inline("width: 40%; margin: 0px auto;", [
      ["width", "40%"],
      ["margin-top", "0px"],
      ["margin-right", "auto"],
      ["margin-bottom", "0px"],
      ["margin-left", "auto"],
    ]),
  },
  {
    id: "e000004",
    parentId: "e000002",
    tagName: "main",
    attributes: { class: "shell wide" },
    inlineStyle: p0Inline("max-width: 1200px;", [["max-width", "1200px"]]),
  },
  {
    id: "e000005",
    parentId: "e000004",
    tagName: "div",
    attributes: { class: "card" },
    text: "Card",
    inlineStyle: p0Inline("width: 250px;", [["width", "250px"]]),
  },
  {
    id: "e000006",
    parentId: "e000004",
    tagName: "div",
    attributes: {},
    inlineStyle: p0Inline("height: 20px;", [["height", "20px"]]),
  },
  {
    id: "e000007",
    parentId: "e000004",
    tagName: "section",
    attributes: { id: "dup" },
    inlineStyle: p0Inline("padding-left: 1px;", [["padding-left", "1px"]]),
  },
  { id: "e000008", parentId: "e000004", tagName: "section", attributes: { id: "dup" } },
  {
    id: "e000009",
    parentId: "e000004",
    tagName: "p",
    attributes: { class: "beta gamma" },
    inlineStyle: p0Inline("color: blue;", [["color", "rgb(0, 0, 255)"]]),
  },
  { id: "e000010", parentId: "e000004", tagName: "div", attributes: { id: "csr-root" } },
  {
    id: "e000011",
    parentId: "e000010",
    tagName: "section",
    attributes: { id: "csr-child" },
    inlineStyle: p0Inline("padding-left: 12px;", [["padding-left", "12px"]]),
  },
  {
    id: "e000012",
    parentId: "e000002",
    tagName: "footer",
    attributes: { class: "foot" },
    text: "Foot",
    inlineStyle: p0Inline("width: 10px;", [["width", "10px"]]),
  },
];

/** Per-width `style` texts (3 probe widths); the footer deliberately has none. */
function p0WidthStyles(): Map<string, (string | null)[]> {
  const same = (text: string): (string | null)[] => [text, text, text];
  return new Map<string, (string | null)[]>([
    ["e000001", [null, null, null]],
    ["e000002", [null, null, null]],
    [
      "e000003",
      ["width: 90%; margin: 0px auto;", "width: 40%; margin: 0px auto;", "width: 40%; margin: 0px auto;"],
    ],
    ["e000004", same("max-width: 1200px;")],
    ["e000005", same("width: 250px;")],
    ["e000006", same("height: 20px;")],
    ["e000007", same("padding-left: 1px;")],
    ["e000008", [null, null, null]],
    ["e000009", same("color: blue;")],
    ["e000010", [null, null, null]],
    ["e000011", same("padding-left: 12px;")],
  ]);
}

async function inlineProvenanceChecks(): Promise<void> {
  console.log("\n§P0-C1.4 inline-style provenance (pure module)");

  check(
    "parseStyleText splits declarations outside parens/quotes and reads !important",
    (() => {
      const map = parseStyleText(
        `background: url("a;b.png"); width: calc(100% - (2px)) !important; --Brand: X`,
      );
      return (
        map.get("background")?.value === `url("a;b.png")` &&
        map.get("width")?.value === "calc(100% - (2px))" &&
        map.get("width")?.important === true &&
        map.get("--Brand")?.value === "X"
      );
    })(),
  );
  check(
    "normalizeStyleValue equates a bare 0 with 0px and ignores whitespace/case",
    normalizeStyleValue("0") === normalizeStyleValue("0px") &&
      normalizeStyleValue("Calc( 1px ,2px )") === normalizeStyleValue("calc(1px, 2px)") &&
      normalizeStyleValue("10px") !== normalizeStyleValue("100px"),
  );
  check(
    "stylePropertiesRelated: shorthand↔longhand and prefix families relate; unrelated do not",
    stylePropertiesRelated("margin", "margin-left") &&
      stylePropertiesRelated("flex", "flex-basis") &&
      stylePropertiesRelated("inset", "top") &&
      !stylePropertiesRelated("width", "max-width") &&
      !stylePropertiesRelated("color", "width"),
  );

  const result = computeInlineStyleProvenance({
    elements: P0_RUNTIME,
    initialHtml: P0_INITIAL_HTML,
    widthStyles: p0WidthStyles(),
  });
  const of = (id: string) => result.byElementId.get(id);
  const header = of("e000003");
  check(
    "SSR style attribute with a unique id → matched",
    header?.correspondence === "matched" && header.widthEvidence === "probe",
    JSON.stringify(header),
  );
  check(
    "…a property whose style text changes across probe widths is runtime-responsive (wins over initial-static)",
    header?.byProperty.width?.class === "runtime-responsive" &&
      header.byProperty.width.variesAcrossWidths === true &&
      header.byProperty.width.initialValue === "40%",
    JSON.stringify(header?.byProperty.width),
  );
  check(
    "…while the non-varying margins, declared via the `margin: 0 auto` shorthand, are initial-static",
    header?.byProperty["margin-top"]?.class === "initial-static" &&
      header.byProperty["margin-top"].initialValue === "0" &&
      header.byProperty["margin-left"]?.class === "initial-static" &&
      header.byProperty["margin-left"].variesAcrossWidths === false,
    JSON.stringify(header?.byProperty),
  );
  check(
    "a property the initial style attribute lacks on a matched node is runtime-added",
    of("e000004")?.correspondence === "matched" &&
      of("e000004")?.byProperty["max-width"]?.class === "runtime-added" &&
      of("e000004")?.byProperty["max-width"]?.initialValue === undefined,
    JSON.stringify(of("e000004")),
  );
  check(
    "a JS-changed value on a class-corroborated node is initial-mutated with the initial value kept",
    of("e000005")?.correspondence === "matched" &&
      of("e000005")?.byProperty.width?.class === "initial-mutated" &&
      of("e000005")?.byProperty.width?.initialValue === "100px" &&
      of("e000005")?.byProperty.width?.runtimeValue === "250px",
    JSON.stringify(of("e000005")),
  );
  check(
    "AMBIGUOUS REFUSAL: a same-tag node with no id/class/src/href and a rewritten style is NOT matched",
    of("e000006")?.correspondence === "ambiguous" &&
      of("e000006")?.byProperty.height?.class === "unknown" &&
      of("e000006")?.byProperty.height?.initialValue === undefined,
    JSON.stringify(of("e000006")),
  );
  check(
    "AMBIGUOUS REFUSAL: a duplicated id is not a corroborating signal (two candidates tie)",
    of("e000007")?.correspondence === "ambiguous" &&
      of("e000007")?.byProperty["padding-left"]?.class === "unknown",
    JSON.stringify(of("e000007")),
  );
  check(
    "a resolved path whose class evidence DISAGREES is no-initial-node (corroboration-failed) → unknown",
    of("e000009")?.correspondence === "no-initial-node" &&
      of("e000009")?.reason === "corroboration-failed" &&
      of("e000009")?.byProperty.color?.class === "unknown",
    JSON.stringify(of("e000009")),
  );
  check(
    "a CSR-only node (no initial node on the path) is no-initial-node (path-unresolved) → unknown",
    of("e000011")?.correspondence === "no-initial-node" &&
      of("e000011")?.reason === "path-unresolved" &&
      of("e000011")?.byProperty["padding-left"]?.class === "unknown",
    JSON.stringify(of("e000011")),
  );
  check(
    "a matched node WITHOUT per-width evidence is unknown (not varying is unproven), widthEvidence absent",
    of("e000012")?.correspondence === "matched" &&
      of("e000012")?.widthEvidence === "absent" &&
      of("e000012")?.byProperty.width?.class === "unknown",
    JSON.stringify(of("e000012")),
  );
  check(
    "the structural path skips SKIP_TAGS (<noscript>) exactly like the observer walk",
    of("e000012")?.correspondence === "matched",
  );
  check(
    "elements without inline style get no provenance record",
    of("e000001") === undefined && of("e000008") === undefined && of("e000010") === undefined,
  );
  check(
    "counts tally elements, declarations, correspondence and classes consistently",
    result.counts.elements === 8 &&
      result.counts.declarations === 12 &&
      result.counts.correspondence.matched === 4 &&
      result.counts.correspondence.ambiguous === 2 &&
      result.counts.correspondence["no-initial-node"] === 2 &&
      result.counts.byClass["runtime-responsive"] === 1 &&
      result.counts.byClass["initial-static"] === 4 &&
      result.counts.byClass["initial-mutated"] === 1 &&
      result.counts.byClass["runtime-added"] === 1 &&
      result.counts.byClass.unknown === 5,
    JSON.stringify(result.counts),
  );

  const noDoc = computeInlineStyleProvenance({
    elements: P0_RUNTIME,
    initialHtml: undefined,
    widthStyles: p0WidthStyles(),
  });
  check(
    "no initial document → every element no-initial-document; only proven variation escapes unknown",
    [...noDoc.byElementId.values()].every((p) => p.correspondence === "no-initial-document") &&
      noDoc.byElementId.get("e000003")?.byProperty.width?.class === "runtime-responsive" &&
      noDoc.byElementId.get("e000003")?.byProperty["margin-top"]?.class === "unknown" &&
      noDoc.counts.byClass.unknown === 11,
    JSON.stringify(noDoc.counts),
  );

  // --- carry-through through the REAL compilePage ---------------------------
  console.log("\n§P0-C1.7 SiteSpec carry-through (compilePage on a P0-shaped observation)");
  let tmp: string | undefined;
  try {
    tmp = await mkdtemp(path.join(tmpdir(), "web-recon-sitespec-p0-"));
    const pageDir = path.join(tmp, "pages", "p000001");
    const page: FixturePage = {
      pageId: "p000001",
      url: URL_HOME,
      role: "representative",
      familyId: "f000001",
      familyType: "singleton",
      familyMemberCount: 1,
      title: "p0",
      html: P0_INITIAL_HTML,
      elements: [],
      assets: [],
    };
    const cascadeRule: MatchedLayoutRule = {
      property: "width",
      value: "50%",
      media: "(min-width: 800px)",
      selector: ".card",
      sheetIndex: 2,
      ruleOrder: 41,
      specificity: [0, 1, 0],
      layerOrder: 1,
      layer: "base",
      supports: "(display: grid)",
      supportsMatches: true,
    };
    const dom: ElementObservation[] = P0_RUNTIME.map((el, index) => ({
      id: el.id,
      ...(el.parentId ? { parentId: el.parentId } : {}),
      tagName: el.tagName,
      ...(el.text ? { text: el.text } : {}),
      // The observer never puts `style` in the bag; a hand-edited one must still be dropped.
      attributes: { ...el.attributes, ...(el.inlineStyle ? { style: el.inlineStyle.raw! } : {}) },
      localVisible: true,
      effectiveVisible: true,
      boundingBox: {
        x: 0, y: index * 10, width: 100, height: 10,
        top: index * 10, right: 100, bottom: index * 10 + 10, left: 0,
      },
      styleId: "s000001",
      ...(el.inlineStyle ? { inlineStyle: el.inlineStyle } : {}),
      ...(el.id === "e000005"
        ? { layoutRules: [cascadeRule], layoutRulesMatched: 12, layoutRulesKept: 8, layoutRulesTruncated: true }
        : {}),
    }));
    const widthStyles = p0WidthStyles();
    const widths = [390, 1024, 1440];
    // Probe-level table with an UNUSED entry, so compaction is observable.
    const table = ["unused: 1px;"];
    const indexOf = (text: string | null): number => {
      if (text === null) return -1;
      let at = table.indexOf(text);
      if (at < 0) {
        at = table.length;
        table.push(text);
      }
      return at;
    };
    // The footer has no per-width evidence in the PURE checks; the probe on disk
    // covers every element, so here it carries its (constant) style text.
    const probeStyles = P0_RUNTIME.map(
      (el) =>
        widthStyles.get(el.id) ??
        (el.inlineStyle ? [el.inlineStyle.raw!, el.inlineStyle.raw!, el.inlineStyle.raw!] : [null, null, null]),
    );
    const sByWidth = widths.map((_, w) => probeStyles.map((texts) => indexOf(texts[w] ?? null)));
    const fingerprint = { elements: 12, rendered: 12, structure: "abc", truncated: false };
    const probe: LayoutProbe = {
      schemaVersion: OBSERVER_SCHEMA_VERSION,
      url: URL_HOME,
      finalUrl: URL_HOME,
      capturedAt: OBSERVED_AT,
      initialWidth: 1440,
      tags: dom.map((el) => el.tagName),
      parents: dom.map((el) => (el.parentId ? dom.findIndex((p) => p.id === el.parentId) : -1)),
      widths: widths.map((width, w) => ({
        width,
        x: dom.map(() => 0),
        w: dom.map(() => width),
        v: dom.map(() => 1 as const),
        disconnected: 0,
        documentWidth: width,
        fingerprint,
        s: sByWidth[w]!,
      })),
      truncated: false,
      inlineStyleTable: table,
      familySwitchBisections: [
        {
          pairLo: 1024,
          pairHi: 1440,
          lo: 1199,
          hi: 1200,
          loFingerprint: fingerprint,
          hiFingerprint: { ...fingerprint, rendered: 40 },
          steps: 8,
          converged: true,
        },
      ],
    };
    for (const viewportId of ["desktop", "mobile"] as ViewportId[]) {
      const dir = path.join(pageDir, "viewports", viewportId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "rendered.html"), P0_INITIAL_HTML, "utf8");
      await writeFile(path.join(dir, "document-response.html"), P0_INITIAL_HTML, "utf8");
      await writeJson(path.join(dir, "dom.json"), dom);
      await writeJson(path.join(dir, "styles.json"), SHARED_STYLE_TABLE);
      await writeJson(path.join(dir, "assets.json"), []);
      await writeJson(path.join(dir, "links.json"), []);
      await writeJson(path.join(dir, "frames.json"), []);
    }
    await writeJson(path.join(pageDir, "layout-probe.json"), LayoutProbeSchema.parse(probe));
    const vp = (viewportId: ViewportId): ViewportObservation => ({
      ...viewportObservation(viewportId, page, dom.length),
      stylesheetCoverage: P0_STYLESHEET_COVERAGE,
      initialDocument: {
        status: "captured",
        url: URL_HOME,
        httpStatus: 200,
        contentType: "text/html; charset=utf-8",
        bytes: Buffer.byteLength(P0_INITIAL_HTML, "utf8"),
        sha256: "f".repeat(64),
        file: "document-response.html",
      },
    });
    const observation = PageObservationSchema.parse({
      schemaVersion: OBSERVER_SCHEMA_VERSION,
      engine: "playwright-chromium",
      target: { requestedUrl: URL_HOME, finalUrl: URL_HOME, title: "p0", timestamp: OBSERVED_AT },
      observationProfile: {
        locale: "ko-KR",
        timezone: "Asia/Seoul",
        colorScheme: "light",
        reducedMotion: "no-preference",
      },
      viewports: { desktop: vp("desktop"), mobile: vp("mobile") },
      responsiveSummary: {
        desktop: { elementCount: dom.length, effectiveVisibleCount: dom.length, documentWidth: 1440, documentHeight: 120, uniqueStyleCount: 3, assetCount: 0, linkCount: 0 },
        mobile: { elementCount: dom.length, effectiveVisibleCount: dom.length, documentWidth: 390, documentHeight: 120, uniqueStyleCount: 3, assetCount: 0, linkCount: 0 },
      },
      sizes: { observationJsonBytes: 1, runTotalBytes: 2 },
      layoutProbe: { file: "layout-probe.json", widths, elementCount: dom.length, truncated: false },
    });
    await writeJson(path.join(pageDir, "observation.json"), observation);

    const sitePage: ObservedSitePage = {
      pageId: "p000001",
      url: URL_HOME,
      role: "representative",
      familyId: "f000001",
      familyType: "singleton",
      familyMemberCount: 1,
      status: "success",
      startedAt: OBSERVED_AT,
      completedAt: OBSERVED_AT,
      elapsedMs: 1,
      pageObservationFile: "pages/p000001/observation.json",
    } as ObservedSitePage;
    const compiledPage = await compilePage({
      siteObservationDir: tmp,
      page: sitePage,
      familyType: "singleton",
      sourceObservationRef: "fixture/pages/p000001/observation.json",
      styleBuilder: new StyleCatalogBuilder(),
      assetBuilder: new AssetCatalogBuilder(URL_HOME),
    });
    const spec = PageSpecSchema.parse(JSON.parse(JSON.stringify(compiledPage.spec)));
    const nodeFor = (viewportId: ViewportId, elementId: string): ElementSpecNode | undefined =>
      spec.viewports[viewportId].nodes.find(
        (n): n is ElementSpecNode => n.type === "element" && n.sourceElementId === elementId,
      );

    const card = nodeFor("desktop", "e000005");
    check(
      "the compiled PageSpec round-trips through PageSpecSchema with every P0 field intact",
      card?.inlineStyle !== undefined && card.inlineStyleProvenance !== undefined,
      JSON.stringify(card),
    );
    check(
      "node.inlineStyle is carried verbatim, and the `style` ATTRIBUTE is still dropped",
      JSON.stringify(card?.inlineStyle) === JSON.stringify(P0_RUNTIME[4]!.inlineStyle) &&
        card?.attributes.style === undefined &&
        spec.viewports.desktop.nodes.every(
          (n) => n.type !== "element" || n.attributes.style === undefined,
        ),
      JSON.stringify(card?.attributes),
    );
    check(
      "authoredLayout keeps the cascade fields VERBATIM (sheetIndex/ruleOrder/specificity/layerOrder/supportsMatches)",
      (() => {
        // Key order is the schema's, not the fixture's; compare canonically.
        const canonical = (value: unknown): string =>
          JSON.stringify(value, (_k, v: unknown) =>
            v && typeof v === "object" && !Array.isArray(v)
              ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort())
              : v,
          );
        return canonical(card?.authoredLayout?.[0]) === canonical(cascadeRule);
      })() &&
        card?.authoredLayoutMatched === 12 &&
        card?.authoredLayoutKept === 8 &&
        card?.authoredLayoutTruncated === true,
      JSON.stringify(card?.authoredLayout),
    );
    check(
      "provenance is computed from the persisted document-response.html + probe s arrays (initial-mutated)",
      card?.inlineStyleProvenance?.correspondence === "matched" &&
        card.inlineStyleProvenance.byProperty.width?.class === "initial-mutated" &&
        nodeFor("desktop", "e000003")?.inlineStyleProvenance?.byProperty.width?.class ===
          "runtime-responsive" &&
        nodeFor("desktop", "e000006")?.inlineStyleProvenance?.correspondence === "ambiguous",
      JSON.stringify(card?.inlineStyleProvenance),
    );
    check(
      "viewport.stylesheetCoverage is the observation's record carried VERBATIM (fallbackMissed / imports / caps / skipped rules)",
      (["desktop", "mobile"] as ViewportId[]).every((viewportId) => {
        const carried = spec.viewports[viewportId].stylesheetCoverage;
        return (
          carried !== undefined &&
          JSON.stringify(Object.entries(carried).sort()) ===
            JSON.stringify(Object.entries(P0_STYLESHEET_COVERAGE).sort())
        );
      }),
      JSON.stringify(spec.viewports.desktop.stylesheetCoverage),
    );
    const headerNode = nodeFor("desktop", "e000003");
    check(
      "node.probe.s indexes the COMPACTED layoutProbe.inlineStyleTable (unused entries dropped)",
      spec.layoutProbe?.inlineStyleTable !== undefined &&
        !spec.layoutProbe.inlineStyleTable.includes("unused: 1px;") &&
        headerNode?.probe?.s !== undefined &&
        headerNode.probe.s.map((i) => spec.layoutProbe!.inlineStyleTable![i]).join("|") ===
          widthStyles.get("e000003")!.join("|") &&
        nodeFor("desktop", "e000001")?.probe?.s?.join(",") === "-1,-1,-1",
      JSON.stringify({ table: spec.layoutProbe?.inlineStyleTable, s: headerNode?.probe?.s }),
    );
    check(
      "PageSpec.layoutProbe carries familySwitchBisections verbatim",
      JSON.stringify(spec.layoutProbe?.familySwitchBisections) ===
        JSON.stringify(probe.familySwitchBisections),
    );
    check(
      "viewport initialDocument summary (status, bytes, sha256) + provenance counts are present",
      spec.viewports.desktop.initialDocument?.status === "captured" &&
        spec.viewports.desktop.initialDocument.bytes === Buffer.byteLength(P0_INITIAL_HTML, "utf8") &&
        spec.viewports.desktop.initialDocument.sha256 === "f".repeat(64) &&
        spec.viewports.desktop.inlineStyleProvenanceCounts?.elements === 8 &&
        spec.viewports.desktop.inlineStyleProvenanceCounts.byClass["runtime-responsive"] === 1 &&
        spec.viewports.desktop.inlineStyleProvenanceCounts.byClass["initial-static"] === 5 &&
        spec.viewports.desktop.inlineStyleProvenanceCounts.byClass.unknown === 4,
      JSON.stringify({
        doc: spec.viewports.desktop.initialDocument,
        counts: spec.viewports.desktop.inlineStyleProvenanceCounts,
      }),
    );
    check(
      "the MOBILE tree (no mobile probe) gets provenance with widthEvidence absent → never a guessed class",
      spec.viewports.mobile.inlineStyleProvenanceCounts !== undefined &&
        [...spec.viewports.mobile.nodes].every(
          (n) =>
            n.type !== "element" ||
            n.inlineStyleProvenance === undefined ||
            (n.inlineStyleProvenance.widthEvidence === "absent" &&
              Object.values(n.inlineStyleProvenance.byProperty).every((p) => p.class === "unknown")),
        ),
      JSON.stringify(spec.viewports.mobile.inlineStyleProvenanceCounts),
    );
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Independent review fixes — B2 conservative classification, M4 look-alike
// siblings, M5 time-varying inline values (pure module). Appended section.
// ---------------------------------------------------------------------------

function reviewEl(
  id: string,
  parentId: string | undefined,
  tagName: string,
  attributes: Record<string, string>,
  raw: string | undefined,
  decls: [string, string, true?][] = [],
  text?: string,
): ProvenanceElementInput {
  return {
    id,
    ...(parentId !== undefined ? { parentId } : {}),
    tagName,
    attributes,
    ...(text !== undefined ? { text } : {}),
    ...(raw !== undefined
      ? {
          inlineStyle: {
            decls: decls.map(([property, value, important]) => ({
              property,
              value,
              ...(important ? { important } : {}),
            })),
            raw,
          },
        }
      : {}),
  };
}

function inlineProvenanceReviewFixChecks(): void {
  console.log("\n§Review B2/M4/M5 inline-style provenance never guesses (pure module)");

  check(
    "compareStyleValues: exact normalization proves equal (0≡0px, keyword case, identical number+unit)",
    compareStyleValues("0", "0px").result === "equal" &&
      compareStyleValues("AUTO", "auto").result === "equal" &&
      compareStyleValues("10.0px", "10px").result === "equal" &&
      compareStyleValues("0 auto", "0px auto").result === "equal",
  );
  check(
    "compareStyleValues: provable differences (px lengths, plain keywords) are different",
    compareStyleValues("100px", "250px").result === "different" &&
      compareStyleValues("block", "none").result === "different",
  );
  const unknownOf = (a: string, b: string): string | undefined => {
    const verdict = compareStyleValues(a, b);
    return verdict.result === "unknown" ? verdict.reason : undefined;
  };
  check(
    "compareStyleValues: serialization-only differences are unknown (colors, calc, url quoting, units, var)",
    unknownOf("#fff", "rgb(255, 255, 255)") !== undefined &&
      unknownOf("red", "rgb(255, 0, 0)") !== undefined &&
      unknownOf("calc(100% - 2px)", "calc(-2px + 100%)") !== undefined &&
      unknownOf('url(a.png)', 'url("a.png")') !== undefined &&
      unknownOf("1in", "96px") !== undefined &&
      unknownOf("0%", "0px") !== undefined &&
      unknownOf("var(--a)", "10px") !== undefined &&
      unknownOf("grey", "gray") !== undefined &&
      unknownOf("bold", "700") !== undefined,
  );

  const initialHtml =
    `<!doctype html><html><head></head><body>` +
    `<div id="colors" style="color: #fff; flex: 1; background: red">c</div>` +
    `<div id="unknown-sh" style="font: 12px serif; inset-inline: 0; -foo-bar: 1">u</div>` +
    `<div id="alias" style="-webkit-transform: none; word-wrap: break-word">a</div>` +
    `<div id="imp" style="width: 10px !important">i</div>` +
    `<ul id="row"><li class="card">Same</li><li class="card">Same</li><li class="card">Same</li></ul>` +
    `<section id="orig" class="panel">p</section>` +
    `<div id="carousel" class="track" style="transform: translateX(0px)">t</div>` +
    `</body></html>`;
  const elements: ProvenanceElementInput[] = [
    reviewEl("e1", undefined, "html", {}, undefined),
    reviewEl("e2", "e1", "body", {}, undefined),
    reviewEl("e3", "e2", "div", { id: "colors" }, "color: #fff; flex: 1; background: red", [
      ["color", "rgb(255, 255, 255)"],
      ["flex-grow", "1"],
      ["flex-shrink", "1"],
      ["flex-basis", "0%"],
      ["background-color", "red"],
      ["background-image", "initial"],
    ]),
    reviewEl("e4", "e2", "div", { id: "unknown-sh" }, "font: 12px serif; inset-inline: 0; -foo-bar: 1", [
      ["line-height", "normal"],
      ["left", "0px"],
      ["width", "5px"],
    ]),
    reviewEl("e5", "e2", "div", { id: "alias" }, "transform: none; overflow-wrap: anywhere", [
      ["transform", "none"],
      ["overflow-wrap", "anywhere"],
    ]),
    reviewEl("e6", "e2", "div", { id: "imp" }, "width: 10px", [["width", "10px"]]),
    // A node was INSERTED before the row at runtime: runtime li #2 sits at
    // initial position 2, which is a look-alike card.
    reviewEl("e7", "e2", "ul", { id: "row" }, undefined),
    reviewEl("e8", "e7", "li", { class: "card" }, "width: 1px", [["width", "1px"]], "Same"),
    reviewEl("e9", "e7", "li", { class: "card" }, "width: 2px", [["width", "2px"]], "Same"),
    // Unique initial id disagrees; the class still matches.
    reviewEl("e10", "e2", "section", { id: "replaced", class: "panel" }, "width: 3px", [["width", "3px"]]),
    reviewEl("e11", "e2", "div", { id: "carousel", class: "track" }, "transform: translateX(-300px)", [
      ["transform", "translateX(-300px)"],
    ]),
  ];
  const same = (text: string): (string | null)[] => [text, text, text];
  const result = computeInlineStyleProvenance({
    elements,
    initialHtml,
    widthStyles: new Map<string, (string | null)[]>([
      ["e3", same("color: #fff; flex: 1; background: red")],
      ["e4", same("font: 12px serif; inset-inline: 0; -foo-bar: 1")],
      ["e5", same("transform: none; overflow-wrap: anywhere")],
      ["e6", same("width: 10px")],
      ["e8", same("width: 1px")],
      ["e9", same("width: 2px")],
      ["e10", same("width: 3px")],
      // The carousel's text differs across the widths only because time passed.
      ["e11", ["transform: translateX(0px);", "transform: translateX(-100px);", "transform: translateX(-200px);"]],
    ]),
    recheckStyles: new Map<string, string | null>([
      ["e3", "color: #fff; flex: 1; background: red"],
      ["e11", "transform: translateX(-300px);"],
    ]),
  });
  const of = (id: string) => result.byElementId.get(id);
  const prop = (id: string, property: string) => of(id)?.byProperty[property];

  check(
    "B2: an UNMUTATED `color: #fff` read back as rgb() is unknown, never initial-mutated",
    of("e3")?.correspondence === "matched" &&
      prop("e3", "color")?.class === "unknown" &&
      prop("e3", "color")?.unknownReason === "color-serialization",
    JSON.stringify(prop("e3", "color")),
  );
  check(
    "B2: `flex: 1` longhands (flex-grow/shrink/basis) are unknown (shorthand not expanded), never initial-mutated",
    ["flex-grow", "flex-shrink", "flex-basis"].every(
      (p) =>
        prop("e3", p)?.class === "unknown" &&
        prop("e3", p)?.unknownReason === "initial-shorthand-not-expanded" &&
        prop("e3", p)?.initialValue === "flex: 1",
    ),
    JSON.stringify(of("e3")?.byProperty),
  );
  check(
    "B2: `background: red` → background-color AND background-image are unknown, never runtime-added",
    prop("e3", "background-color")?.class === "unknown" &&
      prop("e3", "background-image")?.class === "unknown",
    JSON.stringify([prop("e3", "background-color"), prop("e3", "background-image")]),
  );
  check(
    "B2: an unexpandable `font` shorthand covers line-height → unknown, not runtime-added",
    prop("e4", "line-height")?.class === "unknown" &&
      prop("e4", "line-height")?.unknownReason === "initial-shorthand-not-expanded",
    JSON.stringify(prop("e4", "line-height")),
  );
  check(
    "B2: a logical counterpart (`inset-inline` vs runtime `left`) → unknown, not runtime-added",
    prop("e4", "left")?.class === "unknown" &&
      prop("e4", "left")?.unknownReason === "logical-physical-counterpart",
    JSON.stringify(prop("e4", "left")),
  );
  check(
    "B2: an unrecognized initial property (`-foo-bar`) could cover anything → width unknown, not runtime-added",
    prop("e4", "width")?.class === "unknown" &&
      prop("e4", "width")?.unknownReason === "initial-property-unrecognized",
    JSON.stringify(prop("e4", "width")),
  );
  check(
    "B2: aliases resolve exactly (`-webkit-transform: none` ≡ transform none → static; `word-wrap` vs overflow-wrap keywords → mutated)",
    prop("e5", "transform")?.class === "initial-static" &&
      prop("e5", "overflow-wrap")?.class === "initial-mutated",
    JSON.stringify(of("e5")?.byProperty),
  );
  check(
    "B2: a provably changed !important priority (same value) is initial-mutated",
    prop("e6", "width")?.class === "initial-mutated" && prop("e6", "width")?.initialValue === "10px",
    JSON.stringify(prop("e6", "width")),
  );
  check(
    "M4: a class/text match shared by a same-tag sibling (identical cards) is ambiguous (sibling-lookalike)",
    of("e8")?.correspondence === "ambiguous" &&
      of("e8")?.reason === "sibling-lookalike" &&
      of("e9")?.correspondence === "ambiguous" &&
      prop("e9", "width")?.class === "unknown",
    JSON.stringify([of("e8"), of("e9")]),
  );
  check(
    "M4: a conflicting document-unique id overrides a class match (no-initial-node, id-conflict)",
    of("e10")?.correspondence === "no-initial-node" &&
      of("e10")?.reason === "id-conflict" &&
      prop("e10", "width")?.class === "unknown",
    JSON.stringify(of("e10")),
  );
  check(
    "M5: a carousel-like value that changed at the SAME width (re-measure) is unknown time-varying, not runtime-responsive",
    prop("e11", "transform")?.class === "unknown" &&
      prop("e11", "transform")?.unknownReason === "time-varying" &&
      prop("e11", "transform")?.timeVarying === true &&
      prop("e11", "transform")?.variesAcrossWidths === true,
    JSON.stringify(prop("e11", "transform")),
  );
  check(
    "M5: an element whose re-measured text is unchanged is not time-varying",
    prop("e3", "color")?.timeVarying === undefined,
  );
  check(
    "counts carry the unknown-reason and correspondence-reason histograms",
    (result.counts.unknownReasons?.["time-varying"] ?? 0) === 1 &&
      (result.counts.unknownReasons?.["color-serialization"] ?? 0) === 1 &&
      (result.counts.correspondenceReasons?.["sibling-lookalike"] ?? 0) === 2 &&
      (result.counts.correspondenceReasons?.["id-conflict"] ?? 0) === 1 &&
      result.counts.correspondence.ambiguous === 2 &&
      Object.values(result.counts.unknownReasons ?? {}).reduce((a, b) => a + b, 0) ===
        (result.counts.byClass.unknown ?? 0),
    JSON.stringify(result.counts),
  );
  check(
    "the new provenance fields survive the zod schema (unknownReason / timeVarying / histograms)",
    (() => {
      const parsedProp = InlineStylePropertyProvenanceSchemaForCheck.parse(
        JSON.parse(JSON.stringify(prop("e11", "transform"))),
      );
      const parsedCounts = InlineStyleProvenanceCountsSchemaForCheck.parse(
        JSON.parse(JSON.stringify(result.counts)),
      );
      return (
        parsedProp.unknownReason === "time-varying" &&
        parsedProp.timeVarying === true &&
        parsedCounts.unknownReasons !== undefined &&
        parsedCounts.correspondenceReasons !== undefined
      );
    })(),
  );
}

import {
  StylesheetCoverageSchema as StylesheetCoverageSchemaForCheck,
  InlineStyleProvenanceCountsSchema as InlineStyleProvenanceCountsSchemaForCheck,
  InlineStylePropertyProvenanceSchema as InlineStylePropertyProvenanceSchemaForCheck,
} from "../src/observer/types.js";
