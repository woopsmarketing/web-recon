import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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
const HOME_ELEMENTS: ElementSpec[] = [
  { tag: "html", attrs: { lang: "en" } }, // e000001
  { tag: "body", parent: "e000001", attrs: { class: "theme-dark", "data-secret": "TOP-SECRET" } }, // e000002
  { tag: "header", parent: "e000002", attrs: { id: "site-header" } }, // e000003
  { tag: "h1", parent: "e000003", text: "Fixture" }, // e000004
  { tag: "em", parent: "e000004", text: "Home", styleId: "s000002" }, // e000005
  { tag: "main", parent: "e000002" }, // e000006
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
 * Task 26 — probe ↔ desktop-tree attachment decision (pure, offline).
 *
 * The ≥90% coverage floor was replaced by a structural (tag + parent) prefix:
 * an early-DOM animated region that caps coverage far below 90% must no longer
 * discard the exactly-matching page shell in front of it, while a structural
 * disagreement inside the prefix — same tags, different ancestry — must.
 */
function probeAttachmentChecks(): void {
  console.log("§probe — attachment decision (Task 26 revision)");
  const n = 400;
  // A synthetic flat-ish walk: html(0) > body(1) > main(2) > 397 children.
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

  // Early divergence at index 150 (37.5% coverage — far below the old floor):
  // the observation mounted an extra subtree the probe load never rendered.
  const divergedTags = [...tags.slice(0, 150), "section", ...tags.slice(150)];
  const divergedParents = [
    ...parents.slice(0, 150),
    2,
    ...parents.slice(150).map((p) => (p >= 150 ? p + 1 : p)),
  ];
  const prefix = computeProbeAttachment({
    probe: { tags, parents, truncated: false },
    elementTags: divergedTags,
    elementParentIndexes: divergedParents,
  });
  check(
    "an early-diverging walk attaches its exact structural prefix (no coverage floor)",
    !prefix.aligned && prefix.attachCount === 150,
    `${prefix.attachCount}`,
  );

  // Same tags at the same offsets but a DIFFERENT parent inside the prefix:
  // the structural check must stop the prefix there.
  const reparented = [...parents];
  reparented[120] = 1; // claims body, the dom says main
  const parentMismatch = computeProbeAttachment({
    probe: { tags, parents: reparented, truncated: false },
    elementTags: tags,
    elementParentIndexes: parents,
  });
  check(
    "a parent disagreement inside the prefix truncates it (tags alone are not identity)",
    !parentMismatch.aligned && parentMismatch.attachCount === 120,
    `${parentMismatch.attachCount}`,
  );

  const short = computeProbeAttachment({
    probe: { tags: tags.slice(0, 60), parents: parents.slice(0, 60), truncated: false },
    elementTags: tags,
    elementParentIndexes: parents,
  });
  check(
    `a prefix under ${PROBE_PREFIX_MIN_ELEMENTS} elements attaches nothing`,
    short.attachCount === 0,
    `${short.attachCount}`,
  );

  const truncated = computeProbeAttachment({
    probe: { tags, parents, truncated: true },
    elementTags: tags,
    elementParentIndexes: parents,
  });
  check("a truncated probe attaches nothing", truncated.attachCount === 0 && !truncated.aligned);
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

    console.log("§79 static tree fidelity — mixed content ordering");
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
      for (const match of src.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
        walkImports(path.resolve(path.dirname(abs), match[1]!.replace(/\.js$/, ".ts")));
      }
      for (const match of src.matchAll(/\bfrom\s+["']([^."'][^"']*)["']/g)) {
        externals.add(match[1]!);
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
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }

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
