import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import {
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
  compileSiteSpec,
  loadInputs,
  saveSiteSpec,
} from "../src/sitespec/index.js";
import {
  adaptAttribute,
  generateApp,
  inferBreakpoint,
  inferLayoutRules,
  isSafeCssValue,
  loadReconstructionInput,
  planReconstruction,
  resolveDependencyVersions,
  routeKeyFromParts,
  detectNestingRepair,
  validateGeneratedApp,
  type RuntimeElementNode,
  type RuntimeNode,
  type RuntimePage,
  type RuntimeRouteMap,
} from "../src/reconstruction/index.js";

/**
 * Fixture test for the Next.js Reconstruction Engine (Task 14, items 121–150).
 *
 * Unlike every earlier smoke test in this repo, this one is NOT offline. It
 * cannot be: item 150 says a generated file snapshot does not prove a
 * reconstruction, and it is right. A tree of `.tsx` that never compiled, or an
 * app that boots and then throws a hydration error on every page, would pass any
 * amount of static checking and still be worthless to Task 15.
 *
 * So the fixture goes all the way through:
 *
 *   Task 06–12 fixture on disk
 *     → compileSiteSpec()            (the real Task 13 compiler)
 *     → DELETE the Task 06–12 tree   (item 122 — self-contained input)
 *     → pnpm reconstruct             (generate twice, diff for determinism)
 *     → DELETE the SiteSpec          (item 203 — runtime independence)
 *     → next build
 *     → next start
 *     → Chromium, both viewports
 *
 * It still visits NO original website and makes no network request of its own:
 * the only HTTP is `localhost` against the app this test just built, and the
 * only browser is driving that app.
 *
 * The fixture site is written to be hostile in the specific ways a reconstruction
 * fails quietly: mixed inline content whose order no artifact records, text past
 * the Observer's 200-character cap, `<pre>` where whitespace is the design, a
 * `<select>` whose selection React will fight over, an inline SVG carrying a
 * `<script>`, a form pointed at a real-looking endpoint, and a trigger labelled
 * `메뉴 열기` that any label-reading heuristic would happily turn into a menu.
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
const URL_ABOUT = `${ROOT_URL}/about`;
const URL_ABOUT_2 = `${ROOT_URL}/about-2`;
const URL_SEARCH_A = `${ROOT_URL}/search?q=a`;
const URL_SEARCH_B = `${ROOT_URL}/search?q=b`;
const URL_QUIET = `${ROOT_URL}/quiet`;

const OBSERVED_AT = "2026-08-14T10:00:00.000Z";

/** Must survive into the browser's HTML and must NOT reach a client chunk. */
const SENTINEL = "SERVER_ONLY_SENTINEL_123456";

/** 250 characters — comfortably past the Observer's 200-character cap. */
const LONG_TEXT =
  "The quick brown fox jumps over the lazy dog while the observer records only the first two hundred characters of this paragraph, which is exactly the failure the SiteSpec compiler exists to repair by re-reading the rendered document. Extra tail text.";

const PRE_TEXT = "line 1\n    line 2\n\tline 3\n";

const SVG_MARKUP =
  '<svg id="logo" viewBox="0 0 10 10" class="source-svg-class" style="color:red"' +
  ' data-source="SVG-DATA-PAYLOAD" onload="boom()">' +
  '<g><circle cx="5" cy="5" r="4"></circle></g>' +
  '<script>fetch("https://evil.test")</script>' +
  '<a href="javascript:alert(1)"><rect width="2" height="2"></rect></a>' +
  "</svg>";

/**
 * The home page's rendered HTML.
 *
 * Every `class`, `style`, `data-*`, `onclick`, `action` and `formaction` below
 * appears ONLY here and never in the hand-written `dom.json`, so if any of them
 * reaches the generated app the only possible source is a channel that should
 * not exist.
 */
const HOME_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  "<title>Fixture Home</title><style>.x{color:red}</style>" +
  '<script>var a=1;</script><link rel="stylesheet" href="/s.css"></head>' +
  '<body class="theme-dark" data-secret="TOP-SECRET">\n' +
  "<main>\n" +
  '<p id="mixed">Hello <strong>world</strong> !</p>\n' +
  `<p id="long">${LONG_TEXT}</p>\n` +
  `<pre id="pre">${PRE_TEXT}</pre>\n` +
  `<p id="sentinel">${SENTINEL}</p>\n` +
  SVG_MARKUP +
  "\n" +
  '<img id="pic" src="/img/a.png" srcset="/img/a@2x.png 2x, /img/a.png 1x" alt="A picture" width="100" height="50">\n' +
  '<a id="jump" href="#panel">Jump</a>\n' +
  '<a id="internal" href="https://fixture.test/about">About</a>\n' +
  '<a id="external" href="https://example.org/x">External</a>\n' +
  '<a id="mail" href="mailto:a@b.c">Mail</a>\n' +
  '<a id="ghost" href="https://fixture.test/never-verified">Ghost</a>\n' +
  '<form id="signup" action="https://original.example/save" method="post">\n' +
  '<label id="lbl" for="email">Email</label>\n' +
  '<input id="email" name="email" type="email" value="a@b.c" placeholder="you@example.com" maxlength="40" minlength="3" spellcheck="false" autocomplete="off">\n' +
  '<input id="pw" name="password" type="password" value="hunter2">\n' +
  '<textarea id="ta" rows="3">initial textarea</textarea>\n' +
  '<select id="sel"><option id="o1" value="A">A</option><option id="o2" selected>B</option></select>\n' +
  '<select id="multi" multiple><option id="m1" value="X" selected>X</option><option id="m2" value="Y">Y</option><option id="m3" value="Z" selected>Z</option></select>\n' +
  '<input id="chk" type="checkbox" checked>\n' +
  '<input id="ro" type="text" value="fixed" readonly>\n' +
  '<input id="num" type="number" min="1" max="10" step="0.5" required autofocus>\n' +
  '<button id="submit" type="submit" formaction="https://original.example/delete" class="danger" style="color:red" data-x="ATTACK-PAYLOAD" onclick="steal()">Sign up</button>\n' +
  "</form>\n" +
  '<table id="grid"><thead><tr><th id="h1" scope="col" colspan="2">Header</th></tr></thead>' +
  '<tbody><tr><td id="c1" rowspan="2">A</td><td id="c2">B</td></tr></tbody></table>\n' +
  '<div id="editor" contenteditable="plaintext-only" spellcheck="false">Type here</div>\n' +
  '<div id="untilfound" hidden="until-found">Findable</div>\n' +
  '<div id="plainhidden" hidden>Hidden</div>\n' +
  '<ol id="ol" start="3" reversed><li id="li1">one</li></ol>\n' +
  '<time id="when" datetime="2026-08-14T09:00">Aug 14</time>\n' +
  '<button id="dis" disabled>출시 예정</button>\n' +
  '<details id="acc" open><summary id="acc-sum">Open me</summary><p id="acc-body">Body</p></details>\n' +
  '<details id="acc2"><summary id="acc2-sum">Closed</summary><p id="acc2-body">Body 2</p></details>\n' +
  '<button id="trigger" aria-expanded="false" aria-controls="panel">Toggle</button>\n' +
  '<div id="panel" role="region" aria-labelledby="trigger lbl" hidden>Panel body</div>\n' +
  '<button id="menu-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="dynamic-menu">Menu</button>\n' +
  '<div id="tabs" role="tablist">' +
  '<button id="tab1" role="tab" aria-selected="true" aria-controls="tp1">One</button>' +
  '<button id="tab2" role="tab" aria-selected="false" aria-controls="tp2">Two</button>' +
  "</div>\n" +
  '<div id="tp1" role="tabpanel">Panel one</div>\n' +
  '<div id="tp2" role="tabpanel" hidden>Panel two</div>\n' +
  '<button id="press" aria-pressed="false">Press me</button>\n' +
  '<div id="opt" role="checkbox" aria-checked="false" tabindex="0">Custom option</div>\n' +
  '<button id="banner-close" aria-label="Close">×</button>\n' +
  '<button id="dlg-trigger" aria-expanded="false" aria-controls="dlg">Open dialog</button>\n' +
  '<div id="dlg" role="dialog">Dialog body</div>\n' +
  '<button id="gen" aria-current="false">Generic</button>\n' +
  '<button id="unknown-hamburger" aria-label="메뉴 열기">메뉴 열기</button>\n' +
  '<p id="pseudo">Pseudo owner</p>\n' +
  '<div id="overlaid"><button id="under-pseudo">Click me</button></div>\n' +
  '<button id="nav-disclosure" aria-expanded="false" aria-controls="dyn-panel">Product</button>\n' +
  '<div id="dyn-host"></div>\n' +
  "<noscript><p>no js</p></noscript>\n" +
  '<template id="tpl"><p>tpl</p></template>\n' +
  "</main>\n</body></html>";

/** Two shared style maps, reused across pages AND viewports. */
const STYLE_BLOCK: Record<string, string> = {
  display: "block",
  color: "rgb(17, 17, 17)",
  "font-family": "Inter, sans-serif",
  "font-size": "16px",
  "margin-top": "7px",
  position: "static",
};
const STYLE_INLINE: Record<string, string> = {
  display: "inline",
  color: "rgb(0, 0, 238)",
  "font-family": "Inter, sans-serif",
  "font-size": "13px",
  position: "relative",
};
const STYLE_PSEUDO: Record<string, string> = {
  content: '"→ hi"',
  display: "inline",
  color: "rgb(9, 9, 9)",
};
/**
 * A region hidden by CSS rather than by the `hidden` attribute.
 *
 * This is how most real disclosure targets are hidden — the original site swaps
 * a class — and it is the case where flipping an attribute alone changes
 * nothing, so the reveal override has to carry it (item 93).
 */
const STYLE_CSS_HIDDEN: Record<string, string> = {
  display: "none",
  color: "rgb(17, 17, 17)",
  "font-size": "16px",
};

/** `white-space: pre` is what makes the `<pre>` fixture meaningful. */
const STYLE_PRE: Record<string, string> = {
  display: "block",
  "white-space": "pre",
  "font-family": "monospace",
  "font-size": "12px",
};

/**
 * A container with a decorative full-bleed `::after` behind its content.
 *
 * This is the shape that made 15 of stripe.com's verified interactions
 * unreplayable: every property needed to PAINT the box was observed, and the one
 * that puts it behind the content was not, so the clone painted it in front and
 * the button underneath stopped being clickable.
 */
const STYLE_OVERLAY_HOST: Record<string, string> = {
  display: "block",
  position: "relative",
  width: "200px",
  height: "40px",
  color: "rgb(17, 17, 17)",
  "font-size": "16px",
};
const STYLE_OVERLAY_PSEUDO: Record<string, string> = {
  content: '""',
  display: "block",
  position: "absolute",
  top: "0px",
  right: "0px",
  bottom: "0px",
  left: "0px",
  "background-color": "rgb(255, 255, 255)",
  "z-index": "-1",
};

const SHARED_STYLE_TABLE: StyleTable = {
  s000001: STYLE_BLOCK,
  s000002: STYLE_INLINE,
  s000003: STYLE_PSEUDO,
  s000004: STYLE_PRE,
  s000005: STYLE_CSS_HIDDEN,
  s000006: STYLE_OVERLAY_HOST,
  s000007: STYLE_OVERLAY_PSEUDO,
};

interface ElementSpec {
  tag: string;
  parent?: string;
  attrs?: Record<string, string>;
  text?: string;
  styleId?: string;
  pseudo?: boolean;
  /** Attach an observed `::after` carrying this style token. */
  pseudoAfter?: string;
  hidden?: boolean;
}

function buildDom(specs: readonly ElementSpec[]): ElementObservation[] {
  return specs.map((spec, index) => {
    const id = `e${String(index + 1).padStart(6, "0")}`;
    return {
      id,
      ...(spec.parent ? { parentId: spec.parent } : {}),
      tagName: spec.tag,
      ...(spec.text !== undefined
        ? {
            text:
              spec.text.length > TEXT_MAX_LEN ? spec.text.slice(0, TEXT_MAX_LEN) : spec.text,
          }
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
      ...(spec.pseudo
        ? { pseudo: { before: { content: '"→ hi"', styleId: "s000003" } } }
        : {}),
      ...(spec.pseudoAfter
        ? { pseudo: { after: { content: '""', styleId: spec.pseudoAfter } } }
        : {}),
    } satisfies ElementObservation;
  });
}

/**
 * The home page's elements in the Observer's own walk order.
 *
 * `<head>` and its children, `<noscript>`, `<template>` and the `<svg>` subtree
 * are absent, because the Observer never records them — alignment only succeeds
 * if this list reproduces that traversal exactly.
 */
const HOME_ELEMENTS: ElementSpec[] = [
  { tag: "html", attrs: { lang: "en" } }, // e000001
  { tag: "body", parent: "e000001", attrs: { class: "theme-dark", "data-secret": "TOP-SECRET" } }, // e000002
  { tag: "main", parent: "e000002" }, // e000003
  { tag: "p", parent: "e000003", attrs: { id: "mixed" }, text: "Hello world !" }, // e000004
  { tag: "strong", parent: "e000004", text: "world", styleId: "s000002" }, // e000005
  { tag: "p", parent: "e000003", attrs: { id: "long" }, text: LONG_TEXT }, // e000006
  { tag: "pre", parent: "e000003", attrs: { id: "pre" }, text: PRE_TEXT, styleId: "s000004" }, // e000007
  { tag: "p", parent: "e000003", attrs: { id: "sentinel" }, text: SENTINEL }, // e000008
  { tag: "svg", parent: "e000003", attrs: { id: "logo" }, styleId: "s000002" }, // e000009
  {
    tag: "img",
    parent: "e000003",
    attrs: { id: "pic", alt: "A picture", width: "100", height: "50" },
  }, // e000010
  { tag: "a", parent: "e000003", attrs: { id: "jump", href: "#panel" }, text: "Jump", styleId: "s000002" }, // e000011
  {
    tag: "a",
    parent: "e000003",
    attrs: { id: "internal", href: "https://fixture.test/about" },
    text: "About",
    styleId: "s000002",
  }, // e000012
  {
    tag: "a",
    parent: "e000003",
    attrs: { id: "external", href: "https://example.org/x" },
    text: "External",
    styleId: "s000002",
  }, // e000013
  { tag: "a", parent: "e000003", attrs: { id: "mail", href: "mailto:a@b.c" }, text: "Mail", styleId: "s000002" }, // e000014
  {
    tag: "a",
    parent: "e000003",
    attrs: { id: "ghost", href: "https://fixture.test/never-verified" },
    text: "Ghost",
    styleId: "s000002",
  }, // e000015
  { tag: "form", parent: "e000003", attrs: { id: "signup" } }, // e000016
  { tag: "label", parent: "e000016", attrs: { id: "lbl", for: "email" }, text: "Email" }, // e000017
  {
    tag: "input",
    parent: "e000016",
    attrs: {
      id: "email",
      name: "email",
      type: "email",
      value: "a@b.c",
      placeholder: "you@example.com",
    },
  }, // e000018
  { tag: "input", parent: "e000016", attrs: { id: "pw", name: "password", type: "password", value: "hunter2" } }, // e000019
  { tag: "textarea", parent: "e000016", attrs: { id: "ta" } }, // e000020
  { tag: "select", parent: "e000016", attrs: { id: "sel" } }, // e000021
  { tag: "option", parent: "e000021", attrs: { id: "o1", value: "A" }, text: "A" }, // e000022
  { tag: "option", parent: "e000021", attrs: { id: "o2" }, text: "B" }, // e000023
  { tag: "select", parent: "e000016", attrs: { id: "multi" } }, // e000024
  { tag: "option", parent: "e000024", attrs: { id: "m1", value: "X" }, text: "X" }, // e000025
  { tag: "option", parent: "e000024", attrs: { id: "m2", value: "Y" }, text: "Y" }, // e000026
  { tag: "option", parent: "e000024", attrs: { id: "m3", value: "Z" }, text: "Z" }, // e000027
  { tag: "input", parent: "e000016", attrs: { id: "chk", type: "checkbox" } }, // e000028
  { tag: "input", parent: "e000016", attrs: { id: "ro", type: "text", value: "fixed" } }, // e000029
  { tag: "input", parent: "e000016", attrs: { id: "num", type: "number" } }, // e000030
  { tag: "button", parent: "e000016", attrs: { id: "submit", type: "submit" }, text: "Sign up" }, // e000031
  { tag: "table", parent: "e000003", attrs: { id: "grid" } }, // e000032
  { tag: "thead", parent: "e000032" }, // e000033
  { tag: "tr", parent: "e000033" }, // e000034
  { tag: "th", parent: "e000034", attrs: { id: "h1" }, text: "Header" }, // e000035
  { tag: "tbody", parent: "e000032" }, // e000036
  { tag: "tr", parent: "e000036" }, // e000037
  { tag: "td", parent: "e000037", attrs: { id: "c1" }, text: "A" }, // e000038
  { tag: "td", parent: "e000037", attrs: { id: "c2" }, text: "B" }, // e000039
  { tag: "div", parent: "e000003", attrs: { id: "editor" }, text: "Type here" }, // e000040
  { tag: "div", parent: "e000003", attrs: { id: "untilfound" }, text: "Findable", hidden: true }, // e000041
  { tag: "div", parent: "e000003", attrs: { id: "plainhidden" }, text: "Hidden", hidden: true }, // e000042
  { tag: "ol", parent: "e000003", attrs: { id: "ol" } }, // e000043
  { tag: "li", parent: "e000043", attrs: { id: "li1" }, text: "one" }, // e000044
  { tag: "time", parent: "e000003", attrs: { id: "when" }, text: "Aug 14" }, // e000045
  { tag: "button", parent: "e000003", attrs: { id: "dis" }, text: "출시 예정" }, // e000046
  { tag: "details", parent: "e000003", attrs: { id: "acc" } }, // e000047
  { tag: "summary", parent: "e000047", attrs: { id: "acc-sum" }, text: "Open me" }, // e000048
  { tag: "p", parent: "e000047", attrs: { id: "acc-body" }, text: "Body" }, // e000049
  { tag: "details", parent: "e000003", attrs: { id: "acc2" } }, // e000050
  { tag: "summary", parent: "e000050", attrs: { id: "acc2-sum" }, text: "Closed" }, // e000051
  { tag: "p", parent: "e000050", attrs: { id: "acc2-body" }, text: "Body 2" }, // e000052
  {
    tag: "button",
    parent: "e000003",
    attrs: { id: "trigger", "aria-expanded": "false", "aria-controls": "panel" },
    text: "Toggle",
  }, // e000053
  {
    tag: "div",
    parent: "e000003",
    attrs: { id: "panel", role: "region", "aria-labelledby": "trigger lbl" },
    text: "Panel body",
    hidden: true,
  }, // e000054
  {
    tag: "button",
    parent: "e000003",
    attrs: {
      id: "menu-trigger",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-controls": "dynamic-menu",
    },
    text: "Menu",
  }, // e000055
  { tag: "div", parent: "e000003", attrs: { id: "tabs", role: "tablist" } }, // e000056
  {
    tag: "button",
    parent: "e000056",
    attrs: { id: "tab1", role: "tab", "aria-selected": "true", "aria-controls": "tp1" },
    text: "One",
  }, // e000057
  {
    tag: "button",
    parent: "e000056",
    attrs: { id: "tab2", role: "tab", "aria-selected": "false", "aria-controls": "tp2" },
    text: "Two",
  }, // e000058
  { tag: "div", parent: "e000003", attrs: { id: "tp1", role: "tabpanel" }, text: "Panel one" }, // e000059
  {
    tag: "div",
    parent: "e000003",
    attrs: { id: "tp2", role: "tabpanel" },
    text: "Panel two",
    hidden: true,
  }, // e000060
  { tag: "button", parent: "e000003", attrs: { id: "press", "aria-pressed": "false" }, text: "Press me" }, // e000061
  {
    tag: "div",
    parent: "e000003",
    attrs: { id: "opt", role: "checkbox", "aria-checked": "false", tabindex: "0" },
    text: "Custom option",
  }, // e000062
  {
    tag: "button",
    parent: "e000003",
    attrs: { id: "banner-close", "aria-label": "Close" },
    text: "×",
  }, // e000063
  {
    tag: "button",
    parent: "e000003",
    attrs: { id: "dlg-trigger", "aria-expanded": "false", "aria-controls": "dlg" },
    text: "Open dialog",
  }, // e000064
  {
    tag: "div",
    parent: "e000003",
    attrs: { id: "dlg", role: "dialog" },
    text: "Dialog body",
    hidden: true,
    styleId: "s000005",
  }, // e000065
  { tag: "button", parent: "e000003", attrs: { id: "gen", "aria-current": "false" }, text: "Generic" }, // e000066
  {
    tag: "button",
    parent: "e000003",
    attrs: { id: "unknown-hamburger", "aria-label": "메뉴 열기" },
    text: "메뉴 열기",
  }, // e000067
  { tag: "p", parent: "e000003", attrs: { id: "pseudo" }, text: "Pseudo owner", pseudo: true }, // e000068
  {
    tag: "div",
    parent: "e000003",
    attrs: { id: "overlaid" },
    styleId: "s000006",
    pseudoAfter: "s000007",
  }, // e000069
  {
    tag: "button",
    parent: "e000069",
    attrs: { id: "under-pseudo" },
    text: "Click me",
  }, // e000070
  /*
   * A DISCLOSURE whose declared target exists only after the click (Task 26
   * generic correction): a framework-portal nav disclosure flips aria-expanded
   * and MOUNTS its panel — no menu role, no aria-haspopup, so Task 12 rightly
   * models it as `disclosure` — and the clone runtime must mount the region for
   * it exactly as it does for a menu. Note `dyn-panel` is deliberately NOT in
   * the static DOM.
   */
  {
    tag: "button",
    parent: "e000003",
    attrs: { id: "nav-disclosure", "aria-expanded": "false", "aria-controls": "dyn-panel" },
    text: "Product",
  }, // e000071
  /*
   * The STATIC host wrapper the panel mounts into (Radix-style): present and
   * empty in the observed closed state. The explorer's discovery resolves it
   * as `existing-with-mounted-content` and the mounted panel must appear
   * INSIDE it exactly once — never as a second unpositioned copy next to the
   * trigger.
   */
  { tag: "div", parent: "e000003", attrs: { id: "dyn-host" } }, // e000072
];

/**
 * Parser-stable nesting (Task 16 final correction) — the minimal reproducer and
 * its negative control.
 *
 * `<li>` inside `<li>` is a legal DOM and an impossible HTML document:
 * `appendChild` accepts it, so a site whose menu is built by script really can
 * have it in the live DOM, and the Observer records what it sees. The parser
 * refuses — the inner start tag closes the outer `<li>` — so naive markup gives
 * React a tree with the two as SIBLINGS and hydration fails with error #418.
 *
 * This lives on the quiet page rather than the home page for a reason that is
 * itself part of the finding: `rendered.html` is a SERIALIZATION of the observed
 * DOM, and this edge cannot survive being parsed back, so Task 13's content
 * alignment necessarily falls back to dom.json for any viewport containing one.
 * The home page's alignment is what proves Task 13.1 attribute recovery works
 * (its `<input checked>` is recovered from the HTML and from nowhere else), and
 * putting an unserializable edge there would quietly disable that test.
 *
 * Four nodes for the defect, four for the control.
 */
const NESTED_LIST_ELEMENTS: ElementSpec[] = [
  // Reproducer: the edge the parser rewrites.
  { tag: "ul", parent: "e000003", attrs: { id: "navlist" } }, // e000006
  { tag: "li", parent: "e000006", attrs: { id: "nav-outer" } }, // e000007
  { tag: "li", parent: "e000007", attrs: { id: "nav-inner" } }, // e000008
  {
    tag: "a",
    parent: "e000008",
    attrs: { id: "nav-signin", href: "https://fixture.test/about" },
    text: "Sign in",
  }, // e000009

  // Negative control (item 15): the SAME relationship, written the way HTML
  // already allows. The adaptation must leave every node of it alone.
  { tag: "ul", parent: "e000003", attrs: { id: "goodlist" } }, // e000010
  { tag: "li", parent: "e000010", attrs: { id: "good-outer" } }, // e000011
  { tag: "ul", parent: "e000011", attrs: { id: "good-sub" } }, // e000012
  { tag: "li", parent: "e000012", attrs: { id: "good-inner" }, text: "Nested item" }, // e000013
];

/** The same two shapes as markup, for the page's saved snapshot. */
const NESTED_LIST_HTML =
  '<ul id="navlist"><li id="nav-outer"><li id="nav-inner">' +
  '<a id="nav-signin" href="https://fixture.test/about">Sign in</a></li></li></ul>' +
  '<ul id="goodlist"><li id="good-outer"><ul id="good-sub">' +
  '<li id="good-inner">Nested item</li></ul></li></ul>';

const HOME_ASSETS: AssetObservation[] = [
  {
    url: "https://fixture.test/img/a.png",
    type: "image",
    elementId: "e000010",
    alt: "A picture",
    width: 100,
    height: 50,
    naturalWidth: 200,
    naturalHeight: 100,
  },
  {
    url: "https://fixture.test/img/a@2x.png",
    type: "image-srcset",
    elementId: "e000010",
    descriptor: "2x",
    alt: "A picture",
  },
  {
    url: "https://fixture.test/img/a.png",
    type: "image-srcset",
    elementId: "e000010",
    descriptor: "1x",
    alt: "A picture",
  },
  { type: "inline-svg", elementId: "e000009", markup: SVG_MARKUP, width: 10, height: 10 },
  { url: "https://cdn.fixture.test/font.woff2", type: "font" },
];

const SIMPLE_HTML = (title: string, body: string, extra = ""): string =>
  '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body>' +
  `<main><h1 id="h">${title}</h1><p id="p">${body}</p>${extra}</main>` +
  "</body></html>";

const simpleElements = (title: string, body: string): ElementSpec[] => [
  { tag: "html", attrs: { lang: "en" } },
  { tag: "body", parent: "e000001" },
  { tag: "main", parent: "e000002" },
  { tag: "h1", parent: "e000003", attrs: { id: "h" }, text: title },
  { tag: "p", parent: "e000003", attrs: { id: "p" }, text: body, styleId: "s000002" },
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
    url: URL_ABOUT,
    role: "representative",
    familyId: "f000002",
    familyType: "sibling-pattern",
    familyMemberCount: 2,
    title: "About",
    html: SIMPLE_HTML("About page", "About body"),
    elements: simpleElements("About page", "About body"),
    assets: [],
  },
  {
    pageId: "p000003",
    url: URL_SEARCH_A,
    role: "representative",
    familyId: "f000003",
    familyType: "singleton",
    familyMemberCount: 1,
    title: "Search A",
    html: SIMPLE_HTML("Search A", "Results for a"),
    elements: simpleElements("Search A", "Results for a"),
    assets: [],
  },
  {
    pageId: "p000004",
    url: URL_SEARCH_B,
    role: "representative",
    familyId: "f000004",
    familyType: "singleton",
    familyMemberCount: 1,
    title: "Search B",
    html: SIMPLE_HTML("Search B", "Results for b"),
    elements: simpleElements("Search B", "Results for b"),
    assets: [],
  },
  {
    pageId: "p000005",
    url: URL_QUIET,
    role: "representative",
    familyId: "f000005",
    familyType: "singleton",
    familyMemberCount: 1,
    title: "Quiet",
    html: SIMPLE_HTML("Quiet page", "Never explored", NESTED_LIST_HTML),
    elements: [
      ...simpleElements("Quiet page", "Never explored"),
      ...NESTED_LIST_ELEMENTS,
    ],
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

async function writePageArtifacts(runDir: string, page: FixturePage): Promise<void> {
  const pageDir = path.join(runDir, "pages", page.pageId);
  const dom = buildDom(page.elements);

  for (const viewportId of ["desktop", "mobile"] as ViewportId[]) {
    const dir = path.join(pageDir, "viewports", viewportId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "rendered.html"), page.html, "utf8");
    await writeJson(path.join(dir, "dom.json"), dom);
    await writeJson(path.join(dir, "styles.json"), SHARED_STYLE_TABLE);
    await writeJson(path.join(dir, "assets.json"), page.assets);
    await writeJson(path.join(dir, "links.json"), []);
    await writeJson(path.join(dir, "frames.json"), []);
  }

  const observation: PageObservation = {
    schemaVersion: OBSERVER_SCHEMA_VERSION,
    engine: "playwright-chromium",
    target: { requestedUrl: page.url, finalUrl: page.url, title: page.title, timestamp: OBSERVED_AT },
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
        uniqueStyleCount: 5,
        assetCount: page.assets.length,
        linkCount: 0,
      },
      mobile: {
        elementCount: dom.length,
        effectiveVisibleCount: dom.length,
        documentWidth: 390,
        documentHeight: 3200,
        uniqueStyleCount: 5,
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
}

/** Write the whole Task 06 → 12 chain into `root`. */
async function writeFixture(root: string): Promise<FixturePaths> {
  const selectionDir = path.join(root, "selection");
  const observationDir = path.join(root, "site-observation");
  const explorationDir = path.join(root, "exploration");
  const modelDir = path.join(root, "model");
  const rel = (p: string): string => path.relative(process.cwd(), p).split(path.sep).join("/");

  // --- Task 06 ---------------------------------------------------------------
  const verifiedOrder = [URL_HOME, URL_ABOUT, URL_ABOUT_2, URL_SEARCH_A, URL_SEARCH_B, URL_QUIET];
  const verified: VerifiedUrlSet = {
    schemaVersion: VERIFIER_SCHEMA_VERSION,
    rootUrl: ROOT_URL,
    sourceDiscoveryFile: rel(path.join(selectionDir, "discovery.json")),
    verifiedAt: OBSERVED_AT,
    count: verifiedOrder.length,
    urls: verifiedOrder.map((url) => ({
      url,
      sourceCandidateUrls: [url],
      httpStatus: 200,
      title: `title ${url}`,
    })),
  };
  await writeJson(path.join(selectionDir, "verified-urls.json"), verified);
  await writeJson(path.join(selectionDir, "verification.json"), { note: "provenance only" });

  // --- Task 07 / 08 ----------------------------------------------------------
  const member = (url: string, isRepresentative: boolean) => {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    return {
      url,
      canonicalTarget: "self" as const,
      sourceCandidateUrls: [url],
      route: {
        url,
        pathname: parsed.pathname,
        pathSegments: segments,
        pathDepth: segments.length,
        parentPath: "/",
        queryKeys: [...parsed.searchParams.keys()],
        queryKeySignature: [...parsed.searchParams.keys()].join(","),
        terminalSegment: segments.at(-1) ?? "",
        terminalKind: "text" as const,
      },
      isRepresentative,
    };
  };

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
      inferredRoutePattern: "/about<*>",
      structuralMatchReason: "shallowSkeleton+landmark; elements 5–5 (ratio 1.000)",
      members: [member(URL_ABOUT, true), member(URL_ABOUT_2, false)],
      representativeUrl: URL_ABOUT,
      signals: { memberCount: 2, sharedStructure: true, sharedText: false },
    },
    {
      id: "f000003",
      type: "singleton",
      members: [member(URL_SEARCH_A, true)],
      representativeUrl: URL_SEARCH_A,
      signals: { memberCount: 1, sharedStructure: false, sharedText: false },
    },
    {
      id: "f000004",
      type: "singleton",
      members: [member(URL_SEARCH_B, true)],
      representativeUrl: URL_SEARCH_B,
      signals: { memberCount: 1, sharedStructure: false, sharedText: false },
    },
    {
      id: "f000005",
      type: "singleton",
      members: [member(URL_QUIET, true)],
      representativeUrl: URL_QUIET,
      signals: { memberCount: 1, sharedStructure: false, sharedText: false },
    },
  ];
  const familyTypeCounts = {
    "content-duplicate": 0,
    "sibling-pattern": 1,
    "scope-structure": 0,
    singleton: 4,
  };
  const familySet: PageFamilySet = {
    schemaVersion: SELECTOR_SCHEMA_VERSION,
    rootUrl: ROOT_URL,
    sourceVerifiedUrlsFile: rel(path.join(selectionDir, "verified-urls.json")),
    sourceVerificationFile: rel(path.join(selectionDir, "verification.json")),
    builtAt: OBSERVED_AT,
    verifiedUrlCount: verifiedOrder.length,
    familyCount: families.length,
    familyTypeCounts,
    largestFamilySize: 2,
    families,
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
    selectedCount: 5,
    reductionCount: 1,
    reductionRate: 0.1667,
    familyTypeCounts,
    largestFamilySize: 2,
    pages: families.map((family) => ({
      url: family.representativeUrl,
      familyId: family.id,
      familyType: family.type,
      memberCount: family.members.length,
      reason: family.members.length === 1 ? ("sole-member" as const) : ("representative-rule" as const),
      reasonDetail: family.members.length === 1 ? "only member" : "shortest path",
    })),
    unselected: [
      {
        url: URL_ABOUT_2,
        familyId: "f000002",
        representativeUrl: URL_ABOUT,
        reason: "represented-by-family" as const,
      },
    ],
  };
  await writeJson(path.join(selectionDir, "selected-pages.json"), selection);

  // --- Task 09 ---------------------------------------------------------------
  for (const page of FIXTURE_PAGES) await writePageArtifacts(observationDir, page);

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
      selectedCount: 5,
      largestFamilySize: 2,
      selectedAt: OBSERVED_AT,
    },
    coverage: {
      familyCount: families.length,
      observedRepresentativeCount: 5,
      representedVerifiedUrlCount: 6,
      validationSampleCount: 0,
      totalObservedPageCount: 5,
      fullObservationPageCount: 6,
      observationReductionCount: 1,
      observationReductionRate: 0.1667,
    },
    stats: {
      requestedPages: 5,
      completedPages: 5,
      failedPages: 0,
      desktopObservations: 5,
      mobileObservations: 5,
      desktopBytes: 1,
      mobileBytes: 1,
      screenshotBytes: 0,
      jsonHtmlBytes: 2,
      pageBytes: 2,
      siteObservationJsonBytes: 1,
      totalBytes: 3,
      averageBytesPerObservedPage: 1,
      totalElapsedMs: 5,
    },
    pages: observedPages,
    validationSamples: [],
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
      plannedActions: 12,
      executedActions: 12,
      changedActions: 12,
      noChangeActions: 0,
      desktopPlanned: 12,
      mobilePlanned: 0,
      desktopExecuted: 12,
      mobileExecuted: 0,
      desktopChanged: 12,
      mobileChanged: 0,
      locatorResolutionRate: 1,
      changeRate: 1,
      totalLoadMs: 4,
      totalActionMs: 4,
      averageActionMs: 1,
      totalElapsedMs: 8,
    },
    pages: [
      {
        pageId: "p000001",
        url: URL_HOME,
        role: "representative",
        familyId: "f000001",
        desktopPlanned: 12,
        mobilePlanned: 0,
        desktopExecuted: 12,
        mobileExecuted: 0,
        desktopChanged: 12,
        mobileChanged: 0,
      },
    ],
    actions: [],
    actionStatusSummary: { changed: 12 },
    locatorStatusSummary: { resolved: 12 },
    locatorStrategySummary: { "id-exact": 12 },
    diffSummary: { "candidate-attribute-change": 9, "target-mounted": 2 },
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
      plannedUnresolvedTriggers: 2,
      executedUnresolvedTriggers: 2,
      resolvedAfterAction: 2,
      stillUnresolved: 0,
      failedBeforeAction: 0,
      newInteractiveDescendants: 5,
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

  /*
   * Task 26 — the ia000011 action artifact: the ONE action file the SiteSpec
   * compiler opens for ip000011's observed-target capture. The capture walked
   * from the host region's OWN root, so elements[0] IS the host — the clone
   * runtime must mount its children and never nest a host copy inside the
   * host, and the declared dynamic-region id must land on the mounted panel.
   */
  const navCapture = buildDom([
    { tag: "div", attrs: { id: "dyn-host" } }, // e000001 — the region root itself
    // e000002 — the panel: its SOURCE id equals the pattern's declared
    // targetDomId, so the compiler marks it as the declared region and the
    // runtime moves the declared id onto it after the host-mount (Task 26).
    { tag: "div", parent: "e000001", attrs: { id: "dyn-panel", role: "region" } },
    { tag: "p", parent: "e000002", text: "Nav alpha" }, // e000003
    { tag: "p", parent: "e000002", text: "Nav beta" }, // e000004
  ]);
  const navActionDir = path.join(explorationDir, "pages", "p000001", "desktop");
  await mkdir(navActionDir, { recursive: true });
  await writeJson(path.join(navActionDir, "ia000011.json"), {
    schemaVersion: EXPLORER_SCHEMA_VERSION,
    engine: "playwright-chromium",
    actionId: "ia000011",
    pageId: "p000001",
    url: URL_HOME,
    viewportId: "desktop",
    viewportProfile: DESKTOP_PROFILE,
    sourceCandidateId: "ic000011",
    sourceElementId: "e000071",
    sourcePageId: "p000001",
    sourceViewport: "desktop",
    sourceInteractionCandidatesFile: "pages/p000001/interaction-candidates.json",
    priority: "P1",
    capabilities: ["click", "disclosure-trigger"],
    planReason: "fixture",
    shapeKey: "button|nav-disclosure|desktop",
    locatorResolution: {
      status: "resolved",
      strategy: "id-exact",
      matchCount: 1,
      attempts: [{ strategy: "id-exact", matchCount: 1, verified: true }],
      locatorDescriptor: {
        tagName: "button",
        domId: "nav-disclosure",
        text: "Product",
        ariaState: { "aria-expanded": "false" },
        ancestors: [],
        siblingIndex: 0,
        siblingCount: 1,
        structuralPath:
          "html:nth-of-type(1)/body:nth-of-type(1)/main:nth-of-type(1)/button:nth-of-type(12)",
        hasStrongSemantics: true,
      },
    },
    action: { type: "click", attempted: true },
    discoveredTargets: [
      {
        discoveryId: "dt000001",
        kind: "existing-with-mounted-content",
        direction: "appeared",
        descriptor: { tagName: "div", htmlId: "dyn-host", structuralPath: "0/1/0/57" },
        relationEvidence: [{ kind: "subtree-mutation" }],
        before: {
          exists: true,
          visible: false,
          boundingBox: { x: 0, y: 700, width: 100, height: 0, top: 700, right: 100, bottom: 700, left: 0 },
        },
        after: {
          exists: true,
          visible: true,
          boundingBox: { x: 0, y: 700, width: 100, height: 40, top: 700, right: 100, bottom: 740, left: 0 },
        },
        mountedDescendantCount: 3,
        textSample: "Nav alpha Nav beta",
        textLength: 17,
        capturedSubtree: {
          provenance: "observed",
          state: "after-action",
          rootElementId: "e000001",
          elements: navCapture,
          styleTable: { s000001: STYLE_BLOCK },
          assets: [],
          elementCount: 4,
          truncations: [],
        },
        provenance: "observed",
      },
    ],
    targetDiscovery: {
      baselineElementCount: 72,
      baselineTruncated: false,
      candidateCount: 1,
      truncated: false,
    },
    safetyEvents: [],
    status: "changed",
    startedAt: OBSERVED_AT,
    completedAt: OBSERVED_AT,
    elapsedMs: 1,
    loadMs: 1,
  });

  // --- Task 12 ---------------------------------------------------------------
  const explorationRunRef = rel(explorationDir);
  let actionSeq = 0;
  const source = (elementId: string) => {
    actionSeq++;
    const actionId = `ia${String(actionSeq).padStart(6, "0")}`;
    return {
      explorationRun: explorationRunRef,
      actionId,
      pageId: "p000001",
      url: URL_HOME,
      viewport: "desktop" as const,
      sourceCandidateId: `ic${String(actionSeq).padStart(6, "0")}`,
      sourceElementId: elementId,
      observationFile: `pages/p000001/desktop/${actionId}.json`,
    };
  };

  /**
   * One instance per pattern TYPE in Task 12's taxonomy (item 91).
   *
   * Several of these match nothing on the four real sites — `dialog`, `toggle`,
   * `generic-state-toggle` — and that is exactly why they are here: a runtime
   * operation with no fixture is an implementation nobody has run.
   */
  const patternInstances: InteractionPatternInstance[] = [
    {
      id: "ip000001",
      patternType: "disclosure",
      ruleId: "disclosure-aria-expanded-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000053"),
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
      ruleId: "menu-target-role-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000055"),
      trigger: { tagName: "button", text: "Menu", priority: "P1", capabilities: ["click", "menu-trigger"] },
      mechanism: "target-mounted",
      transition: { direction: "closed-to-open", field: "aria-expanded", before: "false", after: "true" },
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
      source: source("e000051"),
      trigger: { tagName: "summary", text: "Closed", priority: "P1", capabilities: ["click", "disclosure-trigger"] },
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
    {
      id: "ip000004",
      patternType: "tabs",
      ruleId: "tabs-aria-selected-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000058"),
      trigger: { tagName: "button", role: "tab", text: "Two", priority: "P1", capabilities: ["click"] },
      mechanism: "aria-selected",
      transition: { direction: "unselected-to-selected", field: "aria-selected", before: "false", after: "true" },
      target: {
        relation: "aria-controls",
        targetDomId: "tp2",
        tagName: "div",
        role: "tabpanel",
        existedBefore: true,
        existsAfter: true,
        mounted: false,
        unmounted: false,
        visibilityChanged: true,
        interactiveDescendantsAfter: 0,
      },
      evidence: [{ signal: "aria-selected", source: "diff.changes", before: "false", after: "true", level: "observed" }],
      supportingEvidence: [],
      limitations: [],
      signature: "tabs||aria-selected|unselected-to-selected|button|tab|div|tabpanel|desktop",
    },
    {
      id: "ip000005",
      patternType: "toggle",
      ruleId: "toggle-aria-pressed-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000061"),
      trigger: { tagName: "button", text: "Press me", priority: "P1", capabilities: ["click"] },
      mechanism: "aria-pressed",
      transition: { direction: "off-to-on", field: "aria-pressed", before: "false", after: "true" },
      evidence: [{ signal: "aria-pressed", source: "diff.changes", before: "false", after: "true", level: "observed" }],
      supportingEvidence: [],
      limitations: [],
      signature: "toggle||aria-pressed|off-to-on|button|||||desktop",
    },
    {
      id: "ip000006",
      patternType: "selection",
      ruleId: "selection-aria-checked-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000062"),
      trigger: { tagName: "div", role: "checkbox", text: "Custom option", priority: "P1", capabilities: ["click"] },
      mechanism: "aria-checked",
      transition: { direction: "unselected-to-selected", field: "aria-checked", before: "false", after: "true" },
      evidence: [{ signal: "aria-checked", source: "diff.changes", before: "false", after: "true", level: "observed" }],
      supportingEvidence: [],
      limitations: [],
      signature: "selection||aria-checked|unselected-to-selected|div|checkbox||||desktop",
    },
    {
      id: "ip000007",
      patternType: "selection",
      ruleId: "selection-native-checked-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000028"),
      trigger: { tagName: "input", inputType: "checkbox", priority: "P1", capabilities: ["click"] },
      mechanism: "native-checked",
      transition: { direction: "selected-to-unselected", field: "checked", before: "true", after: "false" },
      evidence: [{ signal: "checked", source: "diff.changes", before: "true", after: "false", level: "observed" }],
      supportingEvidence: [],
      limitations: [],
      signature: "selection||native-checked|selected-to-unselected|input|||||desktop",
    },
    {
      id: "ip000008",
      patternType: "dismiss",
      ruleId: "dismiss-candidate-removed-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000063"),
      trigger: { tagName: "button", text: "×", priority: "P1", capabilities: ["click"] },
      mechanism: "candidate-removed",
      transition: { direction: "present-to-removed", field: "exists", before: "true", after: "false" },
      evidence: [{ signal: "candidate-removed", source: "diff.changes", level: "observed" }],
      supportingEvidence: [],
      limitations: ["Only the candidate itself was observed to disappear."],
      signature: "dismiss||candidate-removed|present-to-removed|button|||||desktop",
    },
    {
      id: "ip000009",
      patternType: "dialog",
      ruleId: "dialog-target-visible-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000064"),
      trigger: { tagName: "button", text: "Open dialog", priority: "P1", capabilities: ["click"] },
      mechanism: "target-visible",
      transition: { direction: "closed-to-open", field: "aria-expanded", before: "false", after: "true" },
      target: {
        relation: "aria-controls",
        targetDomId: "dlg",
        tagName: "div",
        role: "dialog",
        existedBefore: true,
        existsAfter: true,
        mounted: false,
        unmounted: false,
        visibilityChanged: true,
        interactiveDescendantsAfter: 0,
      },
      evidence: [{ signal: "target-visible", source: "diff.changes", level: "observed" }],
      supportingEvidence: [],
      limitations: ["ESC handling and focus behavior were never observed."],
      signature: "dialog||target-visible|closed-to-open|button||div|dialog|desktop",
    },
    {
      id: "ip000010",
      patternType: "generic-state-toggle",
      subtype: "aria-current",
      ruleId: "generic-state-toggle-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000066"),
      trigger: { tagName: "button", text: "Generic", priority: "P2", capabilities: ["click"] },
      mechanism: "aria-checked",
      transition: { direction: "off-to-on", field: "aria-current", before: "false", after: "true" },
      evidence: [{ signal: "aria-current", source: "diff.changes", before: "false", after: "true", level: "observed" }],
      supportingEvidence: [],
      limitations: ["No more specific rule matched; this is the fallback."],
      signature: "generic-state-toggle|aria-current|aria-checked|off-to-on|button|||||desktop",
    },
    /*
     * Task 26 generic correction — a DISCLOSURE whose declared target MOUNTS.
     * A framework-portal nav disclosure flips aria-expanded and mounts its
     * panel only on open; there is no menu role and no aria-haspopup anywhere,
     * so Task 12 correctly models it as `disclosure`, and the runtime must
     * mount the observed dynamic region for it exactly as for a menu. Before
     * the correction the trigger state flipped and no region ever appeared.
     */
    {
      id: "ip000011",
      patternType: "disclosure",
      ruleId: "disclosure-aria-expanded-v1",
      ruleVersion: 1,
      registryVersion: REGISTRY_VERSION,
      provenance: "derived",
      source: source("e000071"),
      trigger: { tagName: "button", text: "Product", priority: "P1", capabilities: ["click", "disclosure-trigger"] },
      mechanism: "aria-expanded",
      transition: { direction: "closed-to-open", field: "aria-expanded", before: "false", after: "true" },
      target: {
        relation: "aria-controls",
        targetDomId: "dyn-panel",
        tagName: "div",
        role: "region",
        existedBefore: false,
        existsAfter: true,
        mounted: true,
        unmounted: false,
        visibilityChanged: false,
        interactiveDescendantsAfter: 2,
      },
      evidence: [
        { signal: "aria-expanded", source: "diff.changes", before: "false", after: "true", level: "observed" },
        { signal: "target-mounted", source: "diff.changes", level: "observed" },
      ],
      supportingEvidence: [],
      limitations: ["The mounted region's internal structure was never observed."],
      signature: "disclosure||aria-expanded|closed-to-open|button||div|region|mounted|desktop",
      /*
       * Task 26 — the discovery ALSO saw the panel arrive inside the static
       * host wrapper (`existing-with-mounted-content`, captured subtree in
       * the ia000011 action artifact). Declared channel and observed channel
       * therefore name the same user-visible content: the clone must mount it
       * ONCE, inside the host, with the declared region id on the panel.
       */
      observedTargets: [
        {
          discoveryId: "dt000001",
          kind: "existing-with-mounted-content",
          direction: "appeared",
          descriptor: { tagName: "div", htmlId: "dyn-host", structuralPath: "0/1/0/57" },
          relationEvidence: [{ kind: "subtree-mutation" }],
          before: {
            exists: true,
            visible: false,
            boundingBox: { x: 0, y: 700, width: 100, height: 0, top: 700, right: 100, bottom: 700, left: 0 },
          },
          after: {
            exists: true,
            visible: true,
            boundingBox: { x: 0, y: 700, width: 100, height: 40, top: 700, right: 100, bottom: 740, left: 0 },
          },
          mountedDescendantCount: 3,
          textSample: "Nav alpha Nav beta",
          textLength: 17,
          hasCapturedSubtree: true,
          provenance: "observed",
        },
      ],
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
      { id: "disclosure-aria-expanded-v1", patternType: "disclosure", version: 1, specificity: 20, description: "aria-expanded flipped on the trigger", requiredEvidence: ["aria-expanded"], optionalEvidence: [], rejectionConditions: [], matchCount: 2 },
      { id: "disclosure-native-details-v1", patternType: "disclosure", version: 1, specificity: 40, description: "a native <details open> flipped", requiredEvidence: ["open"], optionalEvidence: [], rejectionConditions: [], matchCount: 1 },
      { id: "menu-target-role-v1", patternType: "menu", version: 1, specificity: 30, description: "a menu-role region mounted after the click", requiredEvidence: ["target-mounted"], optionalEvidence: [], rejectionConditions: [], matchCount: 1 },
      { id: "tabs-aria-selected-v1", patternType: "tabs", version: 1, specificity: 35, description: "aria-selected moved inside a tablist", requiredEvidence: ["aria-selected"], optionalEvidence: [], rejectionConditions: [], matchCount: 1 },
      { id: "toggle-aria-pressed-v1", patternType: "toggle", version: 1, specificity: 25, description: "aria-pressed flipped", requiredEvidence: ["aria-pressed"], optionalEvidence: [], rejectionConditions: [], matchCount: 1 },
      { id: "selection-aria-checked-v1", patternType: "selection", version: 1, specificity: 25, description: "aria-checked flipped", requiredEvidence: ["aria-checked"], optionalEvidence: [], rejectionConditions: [], matchCount: 1 },
      { id: "selection-native-checked-v1", patternType: "selection", version: 1, specificity: 40, description: "a native checkbox flipped", requiredEvidence: ["checked"], optionalEvidence: [], rejectionConditions: [], matchCount: 1 },
      { id: "dismiss-candidate-removed-v1", patternType: "dismiss", version: 1, specificity: 30, description: "the candidate itself was removed", requiredEvidence: ["candidate-removed"], optionalEvidence: [], rejectionConditions: [], matchCount: 1 },
      { id: "dialog-target-visible-v1", patternType: "dialog", version: 1, specificity: 35, description: "a dialog-role region became visible", requiredEvidence: ["target-visible"], optionalEvidence: [], rejectionConditions: [], matchCount: 1 },
      { id: "generic-state-toggle-v1", patternType: "generic-state-toggle", version: 1, specificity: 10, description: "a stateful ARIA attribute flipped", requiredEvidence: [], optionalEvidence: [], rejectionConditions: [], matchCount: 1 },
    ],
    coverage: {
      totalActions: 11,
      executedActions: 12,
      changedActions: 12,
      confirmedPatternInstances: patternInstances.length,
      unknownCases: 1,
      navigationTainted: 0,
      executionErrors: 0,
      unmatchedTransitions: 1,
      patternCoverageOfChanged: 0.9167,
      patternCoverageOfExecuted: 0.9167,
    },
    patternTypeSummary: {
      disclosure: 3,
      tabs: 1,
      menu: 1,
      dialog: 1,
      toggle: 1,
      selection: 2,
      dismiss: 1,
      "generic-state-toggle": 1,
    },
    mechanismSummary: {
      "native-details": 1,
      "aria-expanded": 2,
      "aria-selected": 1,
      "aria-checked": 2,
      "aria-pressed": 1,
      "native-checked": 1,
      "target-mounted": 1,
      "target-visible": 1,
      "candidate-removed": 1,
    },
    viewportSummary: [
      {
        viewport: "desktop",
        actions: 12,
        patterns: patternInstances.length,
        unknowns: 1,
        patternTypeCounts: {
          disclosure: 3,
          tabs: 1,
          menu: 1,
          dialog: 1,
          toggle: 1,
          selection: 2,
          dismiss: 1,
          "generic-state-toggle": 1,
        },
      },
    ],
    pages: [
      {
        pageId: "p000001",
        url: URL_HOME,
        desktopPatternIds: patternInstances.map((p) => p.id),
        mobilePatternIds: [],
        patternTypes: [
          "disclosure",
          "tabs",
          "menu",
          "dialog",
          "toggle",
          "selection",
          "dismiss",
          "generic-state-toggle",
        ],
        unknownCount: 1,
      },
    ],
    patterns: patternInstances,
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
        actionId: "ia000012",
        pageId: "p000001",
        url: URL_HOME,
        viewport: "desktop",
        candidateId: "ic000012",
        elementId: "e000067",
        observationFile: "pages/p000001/desktop/ia000012.json",
      },
      status: "changed",
      candidateSummary: {
        tagName: "button",
        priority: "P1",
        capabilities: ["click"],
        // A label that INVITES a wrong promotion. It must stay unknown.
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
          ruleId: "menu-target-role-v1",
          patternType: "menu",
          matchedEvidence: ["container-visibility-change"],
          missingEvidence: ["role=menu"],
        },
      ],
      aiEligibility: "eligible",
      aiEligibilityReason: "a real transition no rule explains",
      preferredProbeState: "closed",
      signature: "unmatched-transition|changed|button||container-visibility-change",
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
        signature: "unmatched-transition|changed|button||container-visibility-change",
        reason: "unmatched-transition",
        status: "changed",
        triggerTag: "button",
        caseCount: 1,
        pageIds: ["p000001"],
        caseIds: ["iu000001"],
        representativeCaseId: "iu000001",
        aiEligibility: "eligible",
      },
    ],
    cases: unknownCases,
  };
  await writeJson(path.join(modelDir, "unknown-interactions.json"), unknowns);

  return {
    root,
    selectionDir,
    observationDir,
    explorationDir,
    modelDir,
    patternsFile: path.join(modelDir, "interaction-patterns.json"),
  };
}

// ---------------------------------------------------------------------------
// Helpers over generated output
// ---------------------------------------------------------------------------

async function readAllFiles(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (current: string, prefix: string): Promise<void> => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const abs = path.join(current, entry.name);
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name === ".next" || entry.name === "node_modules") continue;
        await walk(abs, rel);
      } else if (entry.isFile()) {
        if (entry.name === "next-env.d.ts" || entry.name === "tsconfig.tsbuildinfo") continue;
        out.set(rel, await readFile(abs, "utf8"));
      }
    }
  };
  await walk(dir, "");
  return out;
}

/** Every element node of a runtime page, flat. */
function flattenElements(page: RuntimePage, viewport: "desktop" | "mobile"): RuntimeElementNode[] {
  const out: RuntimeElementNode[] = [];
  const walk = (node: RuntimeNode): void => {
    if (node.k === "t") return;
    out.push(node);
    for (const child of node.c ?? []) walk(child);
  };
  walk(page[viewport].doc);
  return out;
}

function findByNodeId(
  page: RuntimePage,
  viewport: "desktop" | "mobile",
  nodeId: string,
): RuntimeElementNode | undefined {
  return flattenElements(page, viewport).find((node) => node.n === nodeId);
}

function findByProp(
  page: RuntimePage,
  viewport: "desktop" | "mobile",
  name: string,
  value: string,
): RuntimeElementNode | undefined {
  return flattenElements(page, viewport).find((node) => node.p?.[name] === value);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Task 17 §9 — deterministic layout-rule inference over a synthetic probe.
 *
 * Builds the §11 evidence shape directly: a centered max-width container
 * (left 180 / width 1080 / right 180 at 1440 → left 420 / 1080 / 420 at 1920),
 * a full-width section, a percentage sidebar and a responsive-hidden banner —
 * plus the two refusal cases (no probe, truth-sanity mismatch).
 */
function layoutInferenceChecks(): void {
  console.log("\nTask 17 §9 — layout rule inference (offline)");
  const widths = [390, 768, 1024, 1440, 1920];
  type ProbeArrays = { x: number[]; w: number[]; v: (0 | 1)[] };
  const node = (
    nodeId: string,
    tagName: string,
    parentNodeId: string | undefined,
    probe: ProbeArrays | undefined,
    boundingBoxWidth: number,
  ): Record<string, unknown> => ({
    nodeId,
    type: "element",
    sourceElementId: nodeId.replace("n", "e"),
    ...(parentNodeId !== undefined ? { parentNodeId } : {}),
    childNodeIds: [],
    tagName,
    attributes: {},
    localVisible: true,
    effectiveVisible: true,
    boundingBox: {
      x: 0,
      y: 0,
      width: boundingBoxWidth,
      height: 100,
      top: 0,
      right: boundingBoxWidth,
      bottom: 100,
      left: 0,
    },
    ...(probe ? { probe } : {}),
    styleTokenId: "st000001",
    assetRefs: [],
    relations: [],
    limitations: [],
  });
  const viewportW: ProbeArrays = {
    x: widths.map(() => 0),
    w: [...widths],
    v: widths.map(() => 1 as const),
  };
  const centered: ProbeArrays = {
    x: [0, 0, 0, 180, 420],
    w: [390, 768, 1024, 1080, 1080],
    v: [1, 1, 1, 1, 1],
  };
  const quarter: ProbeArrays = {
    x: widths.map(() => 0),
    w: widths.map((w) => Math.round(w * 0.25 * 100) / 100),
    v: widths.map(() => 1 as const),
  };
  const hiddenWide: ProbeArrays = {
    x: [0, 0, 0, 0, 0],
    w: [200, 200, 200, 200, 0],
    v: [1, 1, 1, 1, 0],
  };
  // Task 26 generic correction — a marketing shell whose max-width cap engages
  // only ABOVE the truth width: fills the viewport at 390–1024, sits 2px in at
  // 1440, and centers at a constant 1436 at 1920. w == min(parentContent, cap)
  // at every width.
  const cappedFill: ProbeArrays = {
    x: [0, 0, 0, 2, 242],
    w: [390, 768, 1024, 1436, 1436],
    v: [1, 1, 1, 1, 1],
  };
  // Negative control: same widths, but pinned LEFT at 1920 — not centered.
  const cappedPinned: ProbeArrays = {
    x: [0, 0, 0, 2, 0],
    w: [390, 768, 1024, 1436, 1436],
    v: [1, 1, 1, 1, 1],
  };
  const page = {
    pageId: "p000001",
    layoutProbe: { widths, aligned: true, elementCount: 7, truncated: false },
    viewports: {
      desktop: {
        nodes: [
          node("n000001", "html", undefined, viewportW, 1440),
          node("n000002", "body", "n000001", viewportW, 1440),
          node("n000003", "section", "n000002", viewportW, 1440),
          node("n000004", "div", "n000003", centered, 1080),
          node("n000005", "aside", "n000003", quarter, 360),
          node("n000006", "div", "n000003", hiddenWide, 200),
          // Truth-sanity refusal: the probe saw 900, the observation saw 1080.
          node("n000007", "div", "n000003", { ...centered, w: [390, 768, 1024, 900, 900] }, 1080),
          node("n000008", "div", "n000003", cappedFill, 1436),
          node("n000009", "div", "n000003", cappedPinned, 1436),
        ],
      },
      mobile: { nodes: [] },
    },
  } as unknown as Parameters<typeof inferLayoutRules>[0]["pages"][number];

  const result = inferLayoutRules({
    pages: [page],
    styleLookup: () => ({ display: "block" }),
    breakpoint: 915,
  });
  const byNode = new Map(result.rules.map((rule) => [`${rule.nodeId}|${rule.kind}`, rule]));
  const centeredRule = byNode.get("n000004|centered-max-width");
  check(
    "1440:180/1080/180 + 1920:420/1080/420 → max-width:1080px; margin-inline auto",
    centeredRule !== undefined &&
      centeredRule.declarations["max-width"] === "1080px" &&
      centeredRule.declarations["margin-left"] === "auto" &&
      centeredRule.declarations["margin-right"] === "auto" &&
      centeredRule.declarations["width"] === "auto",
    JSON.stringify(centeredRule?.declarations ?? {}),
  );
  check(
    "a section tracking the viewport at every width recovers width:auto",
    byNode.get("n000003|full-width")?.declarations["width"] === "auto",
  );
  check(
    "a constant-ratio sidebar recovers a percentage width",
    byNode.get("n000005|percentage-width")?.declarations["width"] === "25%",
    byNode.get("n000005|percentage-width")?.declarations["width"] ?? "(none)",
  );
  const hiddenRule = byNode.get("n000006|responsive-hidden");
  check(
    "visible at 1440 but gone at 1920 → @media (min-width: 1680px) display:none",
    hiddenRule !== undefined &&
      hiddenRule.media === "(min-width: 1680px)" &&
      hiddenRule.declarations["display"] === "none",
    hiddenRule?.media ?? "(none)",
  );
  check(
    "a node whose probe disagrees with the deep observation recovers nothing",
    ![...byNode.keys()].some((key) => key.startsWith("n000007|")),
  );
  const cappedFillRule = byNode.get("n000008|centered-max-width");
  check(
    "a cap engaging only above the truth width (fill → 1436 centered @1920) → max-width:1436px",
    cappedFillRule !== undefined &&
      cappedFillRule.declarations["max-width"] === "1436px" &&
      cappedFillRule.declarations["margin-left"] === "auto" &&
      cappedFillRule.declarations["margin-right"] === "auto" &&
      cappedFillRule.declarations["width"] === "auto",
    JSON.stringify(cappedFillRule?.declarations ?? {}),
  );
  check(
    "…with the engaged width named in the evidence",
    (cappedFillRule?.evidence ?? []).some((line) => line.includes("cap engaged, centered")),
  );
  check(
    "the same curve pinned LEFT at 1920 recovers nothing",
    ![...byNode.keys()].some((key) => key.startsWith("n000009|")),
  );
  check(
    "html/body never receive recovered rules",
    ![...byNode.keys()].some(
      (key) => key.startsWith("n000001|") || key.startsWith("n000002|"),
    ),
  );
  const noProbe = inferLayoutRules({
    pages: [
      {
        ...(page as object),
        layoutProbe: undefined,
      } as unknown as typeof page,
    ],
    styleLookup: () => ({ display: "block" }),
    breakpoint: 915,
  });
  check(
    "no aligned probe → zero rules and generation proceeds on the exact fallback",
    noProbe.rules.length === 0 && noProbe.css === "",
  );
  check(
    "the recovered CSS tier uses (0,3,0) attribute selectors, deterministic order",
    result.css.includes(
      '[data-wr-page="p000001"][data-wr-viewport="desktop"] [data-wr-node="n000004"]',
    ) && result.css.indexOf("n000003") < result.css.indexOf("n000004"),
  );
}

async function main(): Promise<void> {
  console.log("[smoke:reconstruction] Task 14 — Next.js Reconstruction Engine");
  layoutInferenceChecks();

  /*
   * The workspace lives under `data/` on purpose. A generated app resolves
   * `next` and `react` by walking UP from its own directory, so the fixture has
   * to build somewhere inside this repository; `data/` is the pipeline's own
   * output namespace and is already git-ignored.
   */
  const dataDir = path.join(process.cwd(), "data");
  await mkdir(dataDir, { recursive: true });
  const tmp = await mkdtemp(path.join(dataDir, ".smoke-reconstruction-"));
  let server: ChildProcess | undefined;
  let browser: Browser | undefined;

  try {
    // -----------------------------------------------------------------------
    console.log("\n§121 fixture SiteSpec through the real Task 13 compiler");
    const fixture = await writeFixture(path.join(tmp, "pipeline"));
    const inputs = await loadInputs({ patternsFile: fixture.patternsFile });
    const compiled = await compileSiteSpec(inputs);
    const siteSpecDir = path.join(tmp, "site-spec");
    const saved = await saveSiteSpec(siteSpecDir, compiled);
    check(
      "the fixture compiles into a schema-valid SiteSpec",
      compiled.siteSpec.routes.length === 6 && compiled.pages.length === 5,
      `${compiled.siteSpec.routes.length} routes, ${compiled.pages.length} pages`,
    );
    check(
      "…carrying every verified pattern and the unknown case",
      compiled.interactionSpec.patterns.length === 11 &&
        compiled.interactionSpec.unknownInteractions.length === 1,
      `${compiled.interactionSpec.patterns.length} patterns`,
    );

    // -----------------------------------------------------------------------
    console.log("\n§122 the Task 06–12 source tree is deleted before generating");
    await rm(fixture.root, { recursive: true, force: true });
    let sourceGone = false;
    try {
      await readdir(fixture.root);
    } catch {
      sourceGone = true;
    }
    check("the whole Task 06–12 run tree is gone", sourceGone);

    const input = await loadReconstructionInput(saved.siteSpecPath);
    check(
      "loadSiteSpec() still returns a complete reconstruction input",
      input.pages.length === 5 && input.styleCatalog.tokenCount > 0,
    );

    // -----------------------------------------------------------------------
    console.log("\n§28/§29 breakpoint inference");
    const breakpoint = inferBreakpoint(input.siteSpec);
    check(
      "the breakpoint is the midpoint of the two observed widths",
      breakpoint.value === 915,
      String(breakpoint.value),
    );
    check(
      "…and is labeled inferred, never observed",
      breakpoint.provenance === "inferred" &&
        breakpoint.method === "observed-endpoint-midpoint" &&
        breakpoint.mobileObservedWidth === 390 &&
        breakpoint.desktopObservedWidth === 1440,
    );
    check(
      "--breakpoint override is recorded as an operator override",
      inferBreakpoint(input.siteSpec, { override: 800 }).provenance === "operator-override",
    );

    // -----------------------------------------------------------------------
    console.log("\n§120 reconstruction plan");
    const plan = planReconstruction(input);
    check("every verified route is planned exactly once", plan.routes.routes.length === 6);
    check(
      "route keys distinguish two query variants of one pathname",
      plan.routes.byKey.has("/search?q=a") && plan.routes.byKey.has("/search?q=b"),
      [...plan.routes.byKey.keys()].join(" "),
    );
    check(
      "the query-route key is order-independent",
      routeKeyFromParts("/search", "?b=2&a=1") === routeKeyFromParts("/search", "?a=1&b=2"),
    );
    check(
      "the family-represented route renders from the representative's page",
      plan.routes.routes.find((r) => r.url === URL_ABOUT_2)?.pageSourceId === "p000002",
    );
    check(
      "…and is NOT promoted to observed (items 23, 25)",
      plan.routes.routes.find((r) => r.url === URL_ABOUT_2)?.renderCoverage ===
        "family-represented" &&
        plan.routes.routes.find((r) => r.url === URL_ABOUT_2)?.observedOnThisExactUrl === false &&
        plan.routes.routes.find((r) => r.url === URL_ABOUT_2)?.verifiedOnThisRoute === false,
    );
    check(
      "the never-explored route keeps exact-not-explored behavior coverage",
      plan.routes.routes.find((r) => r.url === URL_QUIET)?.behaviorCoverage ===
        "exact-not-explored",
    );
    check(
      "all 11 verified patterns became runtime bindings, none unsupported",
      plan.behavior.runtimeBindings === 11 && plan.behavior.unsupportedPatterns === 0,
      `${plan.behavior.runtimeBindings} bindings, ${plan.behavior.unsupportedPatterns} unsupported`,
    );
    check(
      "…split into native and scripted (items 90, 92)",
      plan.behavior.nativeBindings === 2 && plan.behavior.scriptedBindings === 9,
      `${plan.behavior.nativeBindings} native / ${plan.behavior.scriptedBindings} scripted`,
    );
    check(
      "the unknown case is annotated and implemented zero times",
      plan.behavior.unknownAnnotations === 1 && plan.behavior.unknownBehaviorsImplemented === 0,
    );
    check("no dangling style token", plan.styles.missingTokens.length === 0);
    check("pseudo rules were generated", plan.pseudoStyles.ruleCount > 0);
    check(
      "no initial-state conflict in this fixture",
      plan.interactions.interactionStateConflicts === 0,
    );

    // -----------------------------------------------------------------------
    console.log("\n§39–§49 React attribute adapter (unit level)");
    const adapted = (tag: string, name: string, value: string) => adaptAttribute(tag, name, value);
    check("for → htmlFor", adapted("label", "for", "x")?.prop === "htmlFor");
    check("readonly → readOnly (boolean true)", adapted("input", "readonly", "")?.prop === "readOnly" && adapted("input", "readonly", "")?.value === true);
    check("colspan → colSpan (number)", adapted("td", "colspan", "2")?.prop === "colSpan" && adapted("td", "colspan", "2")?.value === 2);
    check("rowspan → rowSpan (number)", adapted("td", "rowspan", "3")?.value === 3);
    check("contenteditable → contentEditable (verbatim)", adapted("div", "contenteditable", "plaintext-only")?.value === "plaintext-only");
    check("autofocus → autoFocus (boolean)", adapted("input", "autofocus", "")?.prop === "autoFocus");
    check("maxlength/minlength → maxLength/minLength", adapted("input", "maxlength", "5")?.prop === "maxLength" && adapted("input", "minlength", "2")?.prop === "minLength");
    check("tabindex → tabIndex (number)", adapted("a", "tabindex", "-1")?.value === -1);
    check("datetime → dateTime", adapted("time", "datetime", "2026-08-14")?.prop === "dateTime");
    check("spellcheck → spellCheck (verbatim)", adapted("div", "spellcheck", "false")?.value === "false");
    check("aria-* passes through lowercase", adapted("div", "aria-expanded", "false")?.prop === "aria-expanded");
    check("hidden='' is boolean true", adapted("div", "hidden", "")?.value === true);
    check(
      "hidden='until-found' is NOT collapsed to a plain boolean",
      adapted("div", "hidden", "until-found")?.value === true,
      "collapsed at prop level; the exact value is carried in data-wr-hidden and restored",
    );
    check("input value is never emitted as a controlled value", adapted("input", "value", "x") === null);
    check("option selected is handled by the parent select", adapted("option", "selected", "") === null);

    console.log("\n§65 CSS value safety");
    check("a value with a declaration terminator is rejected", !isSafeCssValue("red;}body{display:none"));
    check("a value with a newline is rejected", !isSafeCssValue("red\n"));
    check("an ordinary computed value is accepted", isSafeCssValue("rgb(17,17,17)"));

    // -----------------------------------------------------------------------
    console.log("\n§5/§12 generate the app (twice, for determinism)");
    const versions = await resolveDependencyVersions(process.cwd());
    const outA = path.join(tmp, "out-a");
    const outB = path.join(tmp, "out-b");
    const generateOptions = {
      sourceSchemaVersion: input.siteSpec.schemaVersion,
      sourceSiteSpecVersion: input.siteSpec.siteSpecVersion,
      sourceCompilerVersion: input.siteSpec.compilerVersion,
      versions,
    };
    const generatedA = await generateApp(plan, { outputDir: outA, ...generateOptions });
    const generatedB = await generateApp(
      planReconstruction(await loadReconstructionInput(saved.siteSpecPath)),
      { outputDir: outB, ...generateOptions },
    );

    const filesA = await readAllFiles(outA);
    const filesB = await readAllFiles(outB);
    const sameNames =
      [...filesA.keys()].join("\n") === [...filesB.keys()].join("\n");
    let identical = sameNames;
    let firstDiff = "";
    for (const [name, contents] of filesA) {
      if (filesB.get(name) !== contents) {
        identical = false;
        if (firstDiff === "") firstDiff = name;
      }
    }
    check(
      "two generations of the same SiteSpec are byte-identical",
      identical,
      firstDiff || (sameNames ? "" : "file list differs"),
    );
    check(
      "no generated file contains a timestamp or an absolute local path",
      ![...filesA.entries()].some(
        ([name, contents]) =>
          !name.endsWith(".css") &&
          (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(contents) ||
            contents.includes(process.cwd())),
      ),
    );

    // -----------------------------------------------------------------------
    console.log("\n§180 validateGeneratedApp()");
    const validation = await validateGeneratedApp({
      outputDir: outA,
      expectedRouteUrls: input.siteSpec.routes.map((route) => route.url),
      expectedPatternTriggers: [...plan.interactions.bindings.keys()],
    });
    check("all six routes are mapped, none duplicated", validation.routeCount === 6);
    check("every runtime page file exists", validation.pageFileCount === 5);
    check("every pattern trigger is present in a rendered tree", validation.checkedTriggers === 11);

    // -----------------------------------------------------------------------
    console.log("\n§50/§109/§177 nothing forbidden survived into the generated app");
    const allText = [...filesA.entries()]
      .filter(([name]) => !name.endsWith(".css"))
      .map(([, contents]) => contents)
      .join("\n");
    for (const forbidden of [
      "original.example",
      "ATTACK-PAYLOAD",
      "SVG-DATA-PAYLOAD",
      "steal()",
      "javascript:alert",
      "TOP-SECRET",
      "theme-dark",
      "source-svg-class",
      "hunter2",
      "boom()",
      "evil.test",
    ]) {
      check(`generated source contains no "${forbidden}"`, !allText.includes(forbidden));
    }
    check(
      "no source on* handler attribute appears anywhere",
      !/\son(click|load|error|submit|change)\s*=/.test(allText),
    );
    check(
      "the server-only sentinel IS in the runtime page data",
      (filesA.get("app/reconstruction-data/pages/p000001.json") ?? "").includes(SENTINEL),
    );

    // -----------------------------------------------------------------------
    console.log("\n§59/§60/§123–§125 content fidelity in the runtime tree");
    const homeJson = JSON.parse(
      filesA.get("app/reconstruction-data/pages/p000001.json")!,
    ) as RuntimePage;
    const desktopElements = flattenElements(homeJson, "desktop");
    const mixed = desktopElements.find(
      (node) => node.t === "p" && node.c?.[0]?.k === "t" && node.c[0].v.startsWith("Hello "),
    );
    const mixedKinds = (mixed?.c ?? []).map((child) =>
      child.k === "t" ? `t:${child.v}` : `e:${child.t}`,
    );
    check(
      "mixed content keeps text / element / text order",
      mixedKinds.join("|") === "t:Hello |e:strong|t: !",
      mixedKinds.join("|"),
    );
    const longText = desktopElements
      .flatMap((node) => node.c ?? [])
      .find((child) => child.k === "t" && child.v.startsWith("The quick brown fox"));
    check(
      "long text is not re-truncated at 200 characters",
      longText?.k === "t" && longText.v === LONG_TEXT,
      longText?.k === "t" ? `${longText.v.length} chars` : "missing",
    );
    const pre = flattenElements(homeJson, "desktop").find((n) => n.t === "pre");
    const preText = pre?.c?.[0];
    check(
      "pre whitespace is preserved byte-for-byte",
      preText?.k === "t" && preText.v === PRE_TEXT,
      preText?.k === "t" ? JSON.stringify(preText.v) : "missing",
    );

    console.log("\n§32–§38 generated DOM identity and IDREF rewriting");
    const label = flattenElements(homeJson, "desktop").find((n) => n.t === "label");
    const emailInput = flattenElements(homeJson, "desktop").find(
      (n) => n.t === "input" && n.p?.["type"] === "email",
    );
    check(
      "label htmlFor points at the GENERATED id, not the source id",
      typeof label?.p?.["htmlFor"] === "string" &&
        label.p["htmlFor"] === emailInput?.p?.["id"] &&
        String(label.p["htmlFor"]).startsWith("wr-p000001-desktop-"),
      String(label?.p?.["htmlFor"]),
    );
    const panel = flattenElements(homeJson, "desktop").find((n) => n.p?.["role"] === "region");
    check(
      "a multi-token aria-labelledby keeps its order and is rewritten",
      typeof panel?.p?.["aria-labelledby"] === "string" &&
        String(panel.p["aria-labelledby"]).split(" ").length === 2 &&
        String(panel.p["aria-labelledby"]).split(" ").every((t) => t.startsWith("wr-p000001-desktop-")),
      String(panel?.p?.["aria-labelledby"]),
    );
    const jump = flattenElements(homeJson, "desktop").find(
      (n) => n.t === "a" && String(n.p?.["href"] ?? "").startsWith("#"),
    );
    check(
      "a resolved #fragment href points at the generated id",
      String(jump?.p?.["href"]) === `#${String(panel?.p?.["id"])}`,
      String(jump?.p?.["href"]),
    );
    check(
      "no generated DOM id reuses a source HTML id",
      !flattenElements(homeJson, "desktop").some((n) =>
        ["panel", "email", "trigger", "logo"].includes(String(n.p?.["id"] ?? "")),
      ),
    );

    console.log("\n§81–§83 link rewriting");
    const internal = flattenElements(homeJson, "desktop").find(
      (n) => n.t === "a" && n.p?.["href"] === "/about",
    );
    check("a same-origin verified URL becomes a clone-local path", internal !== undefined);
    check(
      "an external link keeps its original href",
      flattenElements(homeJson, "desktop").some((n) => n.p?.["href"] === "https://example.org/x"),
    );
    check(
      "mailto: is preserved",
      flattenElements(homeJson, "desktop").some((n) => n.p?.["href"] === "mailto:a@b.c"),
    );
    check(
      "a same-origin URL outside the route table keeps its local path (clone 404)",
      flattenElements(homeJson, "desktop").some((n) => n.p?.["href"] === "/never-verified"),
    );

    console.log("\n§69–§77 assets");
    const img = flattenElements(homeJson, "desktop").find((n) => n.t === "img");
    check("an <img> gets its observed src", img?.p?.["src"] === "https://fixture.test/img/a.png");
    check(
      "…and a srcSet built from descriptor semantics",
      String(img?.p?.["srcSet"]).includes("2x") && String(img?.p?.["srcSet"]).includes("1x"),
      String(img?.p?.["srcSet"]),
    );
    check("next/image is not used anywhere", !allText.includes("next/image\""));
    const svgHost = flattenElements(homeJson, "desktop").find((n) => n.p?.["className"] === "wr-svg-host");
    check("the inline SVG is rendered as real <svg> markup", (svgHost?.v ?? "").startsWith("<svg"));
    check(
      "…sanitized: no script, no on*, no javascript:",
      !/<script|\son[a-z]+\s*=|javascript:/i.test(svgHost?.v ?? ""),
      (svgHost?.v ?? "").slice(0, 120),
    );
    check(
      "…carrying the clone's own class and node id, not the source class or style",
      (svgHost?.v ?? "").includes(`data-wr-node="${svgHost?.n}"`) &&
        /\sclass="wr-st\d+"/.test(svgHost?.v ?? "") &&
        !(svgHost?.v ?? "").includes("source-svg-class") &&
        !(svgHost?.v ?? "").includes("style="),
      (svgHost?.v ?? "").slice(0, 160),
    );
    check("…and keeping its SVG geometry", (svgHost?.v ?? "").includes('viewBox="0 0 10 10"'));

    console.log("\n§44–§48 declarative form state");
    const select = flattenElements(homeJson, "desktop").find(
      (n) => n.t === "select" && n.p?.["multiple"] === undefined,
    );
    check(
      "a <select> gets defaultValue from its selected option's text",
      select?.p?.["defaultValue"] === "B",
      String(select?.p?.["defaultValue"]),
    );
    check(
      "…and the option itself carries no `selected` prop",
      !flattenElements(homeJson, "desktop").some((n) => n.t === "option" && "selected" in (n.p ?? {})),
    );
    const multi = flattenElements(homeJson, "desktop").find(
      (n) => n.t === "select" && n.p?.["multiple"] === true,
    );
    check(
      "a multiple <select> gets an array defaultValue",
      Array.isArray(multi?.p?.["defaultValue"]) &&
        (multi!.p!["defaultValue"] as string[]).join(",") === "X,Z",
      JSON.stringify(multi?.p?.["defaultValue"]),
    );
    const checkbox = flattenElements(homeJson, "desktop").find(
      (n) => n.t === "input" && n.p?.["type"] === "checkbox",
    );
    check("a checked checkbox becomes defaultChecked", checkbox?.p?.["defaultChecked"] === true);
    check("…and never a controlled `checked`", !("checked" in (checkbox?.p ?? {})));
    const textarea = flattenElements(homeJson, "desktop").find((n) => n.t === "textarea");
    check(
      "a <textarea>'s text becomes defaultValue",
      textarea?.p?.["defaultValue"] === "initial textarea",
      String(textarea?.p?.["defaultValue"]),
    );
    check("…and its children are not also emitted", (textarea?.c ?? []).length === 0);
    check(
      "a password input's value never reaches the clone",
      !allText.includes("hunter2"),
    );

    // -----------------------------------------------------------------------
    console.log("\nTask 16 correction — parser-stable nesting");
    const quietJson = JSON.parse(
      filesA.get("app/reconstruction-data/pages/p000005.json")!,
    ) as RuntimePage;

    // The fixture only proves something if the DEFECT is really in the input.
    const quietSpec = JSON.parse(
      await readFile(
        path.join(siteSpecDir, "pages", "p000005.json"),
        "utf8",
      ),
    ) as { viewports: Record<string, { nodes: { nodeId: string; tagName?: string; childNodeIds?: string[] }[] }> };
    const specNodes = quietSpec.viewports["desktop"]!.nodes;
    const specById = new Map(specNodes.map((n) => [n.nodeId, n]));
    const observedNestedLi = specNodes.some(
      (n) =>
        n.tagName === "li" &&
        (n.childNodeIds ?? []).some((id) => specById.get(id)?.tagName === "li"),
    );
    check(
      "the SiteSpec really observed <li> directly inside <li> (the defect is in the input)",
      observedNestedLi,
    );

    const quietDesktop = flattenElements(quietJson, "desktop");
    const containers = quietDesktop.filter(
      (n) => n.p?.["className"] === "wr-nest",
    );
    check(
      "the generator interposed exactly one container for the one bad edge",
      containers.length === 1 && containers[0]!.t === "ul",
      `${containers.length} container(s)`,
    );
    check(
      "…the interposed container carries no data-wr-node, so QA cannot map onto it",
      containers[0] !== undefined && !("data-wr-node" in (containers[0]!.p ?? {})),
    );
    check(
      "…and both viewports were adapted, and only those two",
      generatedA.manifest.stats.nestingAdaptations === 2,
      String(generatedA.manifest.stats.nestingAdaptations),
    );
    check(
      "the adaptation is recorded as a limitation, not hidden",
      generatedA.manifest.limitations.includes("parser-invalid-nesting-adapted"),
    );

    // Ancestry is the property that must survive: the inner <li> is still INSIDE
    // the outer one, just expressed the way HTML can carry.
    //
    // The SiteSpec drops source `id`s on purpose, so these are anchored on text
    // — the one thing the reconstruction promises to carry verbatim.
    const trailToText = (text: string): RuntimeElementNode[] => {
      let found: RuntimeElementNode[] = [];
      const walk = (node: RuntimeNode, trail: RuntimeElementNode[]): void => {
        if (node.k === "t") {
          if (node.v === text && found.length === 0) found = trail;
          return;
        }
        const next = [...trail, node];
        for (const child of node.c ?? []) walk(child, next);
      };
      walk(quietJson.desktop.doc, []);
      return found;
    };
    const signInTrail = trailToText("Sign in").map((n) => n.t);
    check(
      "the inner <li> is still a descendant of the outer <li>",
      signInTrail.slice(-4).join(">") === "li>ul>li>a",
      signInTrail.slice(-5).join(">"),
    );

    // Negative fixture (item 15): the valid shape comes through untouched — the
    // SAME four tags, with no container added.
    const nestedTrail = trailToText("Nested item").map((n) => n.t);
    check(
      "the already-valid nested list is left exactly as observed",
      nestedTrail.slice(-4).join(">") === "ul>li>ul>li",
      nestedTrail.slice(-5).join(">"),
    );
    check(
      "…with no container interposed anywhere inside it",
      !trailToText("Nested item").some((n) => n.p?.["className"] === "wr-nest"),
    );

    // The invariant, over every page of the app rather than the fixture page.
    let unstableEdges = 0;
    for (const [name, body] of filesA) {
      if (!name.startsWith("app/reconstruction-data/pages/")) continue;
      const page = JSON.parse(body) as RuntimePage;
      for (const viewport of [page.desktop, page.mobile]) {
        const walk = (node: RuntimeNode, ancestors: string[]): void => {
          if (node.k === "t" || node.v !== undefined) return;
          const next = [...ancestors, node.t];
          for (const child of node.c ?? []) {
            if (child.k === "e" && detectNestingRepair(child.t, next) !== null) unstableEdges++;
            walk(child, next);
          }
        };
        walk(viewport.doc, []);
      }
    }
    check(
      "no page in the generated app holds an edge the HTML parser would rewrite",
      unstableEdges === 0,
      `${unstableEdges} edge(s)`,
    );
    check(
      "the container is removed from layout, so the observed geometry is unchanged",
      (filesA.get("app/app/globals.css") ?? "").includes(".wr-nest {\n  display: contents;"),
    );

    console.log("\nTask 16 correction — a decorative pseudo is not an interaction barrier");
    const generatedCss = filesA.get("app/public/wr/generated-styles.css") ?? "";
    const overlayRule = /\[data-wr-node="n\d+"\]::after\{[^}]*background-color:rgb\(255, 255, 255\)[^}]*\}/.exec(
      generatedCss,
    )?.[0];
    check(
      "the observed ::after reached the stylesheet",
      overlayRule !== undefined,
      `::after rules: ${(generatedCss.match(/::after\{/g) ?? []).length}; sample ${
        /[^\n]*::after\{[^}]*\}/.exec(generatedCss)?.[0]?.slice(0, 220) ?? "(none)"
      }`,
    );
    check(
      "…carrying the z-index that puts it BEHIND the content",
      (overlayRule ?? "").includes("z-index:-1"),
      (overlayRule ?? "").slice(0, 120),
    );

    console.log("\n§84–§106 interaction bindings");
    const bindingFor = (op: string) =>
      flattenElements(homeJson, "desktop").find((n) => n.p?.["data-wr-op"] === op);
    check("disclosure binding exists", bindingFor("disclosure") !== undefined);
    check("tabs binding exists", bindingFor("tabs") !== undefined);
    check("menu binding exists", bindingFor("menu") !== undefined);
    check("dialog binding exists", bindingFor("dialog") !== undefined);
    check("dismiss binding exists", bindingFor("dismiss") !== undefined);
    check("state-toggle binding exists", bindingFor("state-toggle") !== undefined);
    check(
      "native details/checkbox are marked native, not scripted",
      flattenElements(homeJson, "desktop").filter((n) => n.p?.["data-wr-op"] === "native").length === 2,
    );
    const menuTrigger = bindingFor("menu");
    check(
      "the dynamic menu trigger's aria-controls names the CLONE's region id",
      String(menuTrigger?.p?.["aria-controls"]) === String(menuTrigger?.p?.["data-wr-dyn-id"]) &&
        String(menuTrigger?.p?.["aria-controls"]).startsWith("wr-dyn-"),
      String(menuTrigger?.p?.["aria-controls"]),
    );
    check(
      "…and records the observed tag and role, with no invented children",
      menuTrigger?.p?.["data-wr-dyn-tag"] === "div" && menuTrigger?.p?.["data-wr-dyn-role"] === "menu",
    );
    // Task 26 generic correction — the mount binding is evidence-driven, not
    // taxonomy-driven: a DISCLOSURE whose declared target was observed to mount
    // carries the same dynamic-region binding a menu does.
    const dynDisclosureBinding = flattenElements(homeJson, "desktop").find(
      (n) => n.p?.["data-wr-op"] === "disclosure" && n.p?.["data-wr-dyn-id"] !== undefined,
    );
    check(
      "a disclosure with an observed MOUNTED target carries the dynamic-region binding",
      dynDisclosureBinding !== undefined,
    );
    check(
      "…whose aria-controls names the CLONE's region id",
      String(dynDisclosureBinding?.p?.["aria-controls"]) ===
        String(dynDisclosureBinding?.p?.["data-wr-dyn-id"]) &&
        String(dynDisclosureBinding?.p?.["aria-controls"]).startsWith("wr-dyn-"),
      String(dynDisclosureBinding?.p?.["aria-controls"]),
    );
    const unknownTrigger = findByProp(homeJson, "desktop", "data-wr-unknown", "1");
    check(
      "the 메뉴 열기 trigger is annotated unknown",
      unknownTrigger?.p?.["data-wr-unknown-reason"] === "unmatched-transition",
    );
    check(
      "…and has NO operation attached (item 89)",
      unknownTrigger !== undefined && !("data-wr-op" in (unknownTrigger.p ?? {})),
    );

    // -----------------------------------------------------------------------
    console.log("\n§203 the SiteSpec is deleted before the app is built");
    await rm(siteSpecDir, { recursive: true, force: true });
    let siteSpecGone = false;
    try {
      await readdir(siteSpecDir);
    } catch {
      siteSpecGone = true;
    }
    check("the SiteSpec directory is gone", siteSpecGone);

    // -----------------------------------------------------------------------
    console.log("\n§150 next build");
    const appDir = path.join(outA, "app");
    const buildStartedAt = Date.now();
    const build = await run("npx", ["--no-install", "next", "build"], appDir);
    check(
      `next build PASS (${Date.now() - buildStartedAt} ms) with the SiteSpec deleted`,
      build.code === 0,
      build.output.slice(-1200),
    );
    if (build.code !== 0) throw new Error("next build failed; later checks cannot run");

    console.log("\n§205 the generated app source is location-independent");
    /*
     * Two separate claims, and only one of them is about this Task's code.
     *
     * SOURCE independence is ours: nothing the generator writes names the
     * repository, the SiteSpec, or any absolute path, and the runtime resolves
     * its data relative to `process.cwd()`. That is checked here, on a copy
     * sitting outside the repository.
     *
     * DEPENDENCY portability is not ours: `package.json` pins exact versions and
     * a real relocation runs an install. Handing the copy a `node_modules`
     * symlink instead does not shortcut that — Turbopack rejects a symlink that
     * leaves the project root ("points out of the filesystem root") — so this
     * check deliberately stops at the claim it can actually make, and the
     * report says so rather than implying a portability nobody verified.
     */
    const relocated = path.join(os.tmpdir(), `wr-relocated-${process.pid}`);
    await rm(relocated, { recursive: true, force: true });
    await cp(appDir, relocated, {
      recursive: true,
      filter: (src) => !src.split(path.sep).includes(".next"),
    });
    const relocatedFiles = await readAllFiles(relocated);
    const originalFiles = await readAllFiles(appDir);
    check(
      "the copied tree is byte-identical to the generated one",
      [...originalFiles.entries()].every(([name, body]) => relocatedFiles.get(name) === body) &&
        originalFiles.size === relocatedFiles.size,
    );
    const pathLeaks = [...relocatedFiles.entries()].filter(
      ([, body]) =>
        body.includes(process.cwd()) ||
        body.includes(tmp) ||
        body.includes("site-spec.json") ||
        /\bdata\/[a-z0-9.-]+\/site-specs\b/.test(body),
    );
    check(
      "no generated file names the repository, the SiteSpec or any absolute path",
      pathLeaks.length === 0,
      pathLeaks.map(([name]) => name).join(", "),
    );
    check(
      "runtime data is resolved from process.cwd(), not from a baked-in path",
      (relocatedFiles.get("src/runtime/load-page.ts") ?? "").includes("process.cwd()") &&
        (relocatedFiles.get("src/runtime/load-route.ts") ?? "").includes("process.cwd()"),
    );
    await rm(relocated, { recursive: true, force: true });

    console.log("\n§77/§179 dangerouslySetInnerHTML is used exactly once, on sanitized SVG");
    const nodeRenderer = filesA.get("app/src/runtime/NodeRenderer.tsx") ?? "";
    check(
      "only NodeRenderer.tsx mentions it",
      [...filesA.entries()].filter(([, contents]) =>
        contents.includes("dangerouslySetInnerHTML"),
      ).length === 1 && nodeRenderer.includes("dangerouslySetInnerHTML"),
    );
    check(
      "…and it is reached only through the inline-SVG field",
      /node\.v !== undefined[\s\S]{0,400}dangerouslySetInnerHTML/.test(nodeRenderer),
    );

    console.log("\n§149 SiteSpec data is not in the client bundle");
    const chunksDir = path.join(appDir, ".next", "static", "chunks");
    let clientJs = "";
    let chunkCount = 0;
    const collectChunks = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) await collectChunks(abs);
        else if (entry.name.endsWith(".js")) {
          chunkCount++;
          clientJs += await readFile(abs, "utf8");
        }
      }
    };
    await collectChunks(chunksDir);
    check(`client chunks were produced (${chunkCount} files, ${(clientJs.length / 1024).toFixed(1)} KB)`, chunkCount > 0);
    check("the server-only sentinel is NOT in any client chunk", !clientJs.includes(SENTINEL));
    for (const leak of ["sourceElementId", "contentRecovery", "sourceObservation", "styleTokenId"]) {
      check(`no SiteSpec-only field "${leak}" in the client bundle`, !clientJs.includes(leak));
    }
    check(
      "no page text leaked into the client bundle",
      !clientJs.includes("Panel body") && !clientJs.includes("출시 예정"),
    );

    // -----------------------------------------------------------------------
    console.log("\n§150/§155 next start + HTTP");
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    server = spawn("npx", ["--no-install", "next", "start", "-p", String(port)], {
      cwd: appDir,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore",
    });
    const up = await waitForServer(`${base}/`, 30000);
    check("next start serves the clone", up);
    if (!up) throw new Error("next start never became ready");

    const routeMap = JSON.parse(
      filesA.get("app/reconstruction-data/route-map.json")!,
    ) as RuntimeRouteMap;
    let allOk = true;
    for (const route of routeMap.routes) {
      const response = await fetch(base + route.path);
      if (response.status !== 200) {
        allOk = false;
        console.log(`        ${route.path} → ${response.status}`);
      }
    }
    check("every SiteSpec route renders over HTTP", allOk);
    check(
      "a path outside the route table is a clone 404, not a fallback page",
      (await fetch(`${base}/not-a-verified-route`)).status === 404,
    );
    const searchA = await (await fetch(`${base}/search?q=a`)).text();
    const searchB = await (await fetch(`${base}/search?q=b`)).text();
    check(
      "§132 the two query variants render their OWN content",
      searchA.includes("Results for a") &&
        !searchA.includes("Results for b") &&
        searchB.includes("Results for b"),
    );
    check(
      "§176 the family-represented route renders the representative's page",
      (await (await fetch(`${base}/about-2`)).text()).includes('data-wr-page="p000002"'),
    );
    check(
      "…and says so in the DOM rather than claiming observation",
      (await (await fetch(`${base}/about-2`)).text()).includes(
        'data-wr-render-coverage="family-represented"',
      ),
    );

    // -----------------------------------------------------------------------
    console.log("\n§126–§148 Chromium");
    browser = await chromium.launch();
    /*
     * Two buckets, deliberately (item 159). `assetMode: "reference"` means the
     * clone points at the ORIGINAL site's asset URLs, and the fixture's host does
     * not exist, so every image is a failed subresource. That is a property of
     * reference mode, not a defect in the generated app — and it must not be
     * allowed to hide a real hydration error in the same count.
     */
    const consoleProblems: string[] = [];
    const assetLoadFailures: string[] = [];
    const openPage = async (viewport: { width: number; height: number }): Promise<Page> => {
      const context = await browser!.newContext({ viewport });
      const page = await context.newPage();
      /*
       * `tsx` compiles this file with esbuild's `keepNames`, which wraps every
       * named function expression in a `__name(...)` helper. Playwright ships the
       * COMPILED source of an `evaluate` callback into the page, so the helper
       * has to exist there. This is a harness detail of running the checks from
       * TypeScript; it adds one no-op global and changes nothing the clone does.
       */
      await page.addInitScript(() => {
        (globalThis as unknown as Record<string, unknown>).__name ??= (fn: unknown) => fn;
      });
      page.on("console", (message) => {
        if (message.type() !== "error" && message.type() !== "warning") return;
        const text = message.text();
        if (/Failed to load resource/i.test(text)) {
          assetLoadFailures.push(text.slice(0, 120));
          return;
        }
        consoleProblems.push(`${message.type()}: ${text.slice(0, 200)}`);
      });
      page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message.slice(0, 200)}`));
      page.on("requestfailed", (request) => assetLoadFailures.push(request.url().slice(0, 120)));
      return page;
    };

    const desktop = await openPage({ width: 1440, height: 900 });
    await desktop.goto(`${base}/`, { waitUntil: "networkidle" });

    console.log("  §138 responsive");
    const variants = await desktop.evaluate(() => ({
      desktop: getComputedStyle(document.querySelector('[data-wr-viewport="desktop"]')!).display,
      mobile: getComputedStyle(document.querySelector('[data-wr-viewport="mobile"]')!).display,
    }));
    check(
      "at 1440px the desktop tree is shown and the mobile tree is hidden",
      variants.desktop === "contents" && variants.mobile === "none",
      JSON.stringify(variants),
    );

    console.log("  §126 React attribute adapter in the real DOM");
    const attrs = await desktop.evaluate(() => {
      const root = document.querySelector('[data-wr-viewport="desktop"]')!;
      const get = (selector: string, name: string): string | null =>
        root.querySelector(selector)?.getAttribute(name) ?? null;
      return {
        htmlFor: get("label", "for"),
        readonly: get('input[type="text"]', "readonly"),
        colspan: get("th", "colspan"),
        rowspan: get("td", "rowspan"),
        scope: get("th", "scope"),
        contenteditable: get("[contenteditable]", "contenteditable"),
        spellcheck: get("[contenteditable]", "spellcheck"),
        autofocus: get('input[type="number"]', "autofocus"),
        maxlength: get('input[type="email"]', "maxlength"),
        minlength: get('input[type="email"]', "minlength"),
        tabindex: get('[role="checkbox"]', "tabindex"),
        datetime: get("time", "datetime"),
        start: get("ol", "start"),
        reversed: get("ol", "reversed"),
        min: get('input[type="number"]', "min"),
        required: get('input[type="number"]', "required"),
        disabledText: root.querySelector("button[disabled]")?.textContent ?? null,
      };
    });
    check("label for=", attrs.htmlFor !== null && attrs.htmlFor.startsWith("wr-"), String(attrs.htmlFor));
    check("input readonly", attrs.readonly === "");
    check("th colspan=2", attrs.colspan === "2", String(attrs.colspan));
    check("td rowspan=2", attrs.rowspan === "2", String(attrs.rowspan));
    check("§168 th scope=col", attrs.scope === "col", String(attrs.scope));
    check("contenteditable=plaintext-only", attrs.contenteditable === "plaintext-only");
    check("spellcheck=false", attrs.spellcheck === "false");
    check("autofocus present", attrs.autofocus === "");
    check("maxlength / minlength", attrs.maxlength === "40" && attrs.minlength === "3");
    check("tabindex=0", attrs.tabindex === "0");
    check("time datetime", attrs.datetime === "2026-08-14T09:00");
    check("ol start=3 + reversed", attrs.start === "3" && attrs.reversed === "");
    check("input min", attrs.min === "1");
    check("input required", attrs.required === "");
    check("§162 the disabled control survives with its label", attrs.disabledText === "출시 예정");

    console.log("  §127 native state");
    const native = await desktop.evaluate(() => {
      const root = document.querySelector('[data-wr-viewport="desktop"]')!;
      const details = Array.from(root.querySelectorAll("details"));
      return {
        openFirst: details[0]?.open ?? null,
        openSecond: details[1]?.open ?? null,
        disabled: (root.querySelector("button[disabled]") as HTMLButtonElement | null)?.disabled ?? null,
        untilFound: root.querySelector("[data-wr-hidden]")?.getAttribute("hidden") ?? null,
        plainHiddenCount: Array.from(root.querySelectorAll("[hidden]")).length,
      };
    });
    check("§167 an initially-open <details> is open in the clone", native.openFirst === true);
    check("…and a closed one stays closed", native.openSecond === false);
    check("a disabled button is really disabled", native.disabled === true);
    check(
      "§43 hidden='until-found' keeps its exact value in the DOM",
      native.untilFound === "until-found",
      String(native.untilFound),
    );

    console.log("  §128–§130 form state in the real DOM");
    const formState = await desktop.evaluate(() => {
      const root = document.querySelector('[data-wr-viewport="desktop"]')!;
      const selects = Array.from(root.querySelectorAll("select"));
      const multi = selects.find((s) => s.multiple)!;
      return {
        selectValue: selects.find((s) => !s.multiple)?.value ?? null,
        multiSelected: Array.from(multi.selectedOptions).map((o) => o.value),
        checkboxChecked: (root.querySelector('input[type="checkbox"]') as HTMLInputElement).checked,
        checkboxAttr: root.querySelector('input[type="checkbox"]')!.hasAttribute("checked"),
        textareaValue: (root.querySelector("textarea") as HTMLTextAreaElement).value,
        emailValue: (root.querySelector('input[type="email"]') as HTMLInputElement).value,
      };
    });
    check("§128 select.value is the selected option", formState.selectValue === "B", String(formState.selectValue));
    check("§46 multiple select keeps both selected values", formState.multiSelected.join(",") === "X,Z", formState.multiSelected.join(","));
    check("§129 checkbox.checked === true", formState.checkboxChecked === true);
    check("…and the DOM attribute is present too", formState.checkboxAttr === true);
    check("§130 textarea keeps its initial value", formState.textareaValue === "initial textarea");
    check("§47 a text input keeps its observed value", formState.emailValue === "a@b.c");

    console.log("  §136/§137 CSS");
    const styles = await desktop.evaluate(() => {
      const root = document.querySelector('[data-wr-viewport="desktop"]')!;
      const pre = root.querySelector("pre")!;
      const strong = root.querySelector("strong")!;
      const owner = Array.from(root.querySelectorAll("p")).find(
        (p) => p.textContent === "Pseudo owner",
      )!;
      return {
        preWhiteSpace: getComputedStyle(pre).whiteSpace,
        preFont: getComputedStyle(pre).fontSize,
        strongColor: getComputedStyle(strong).color,
        strongDisplay: getComputedStyle(strong).display,
        strongPosition: getComputedStyle(strong).position,
        bodyMarginTop: getComputedStyle(root.querySelector("main")!).marginTop,
        pseudoContent: getComputedStyle(owner, "::before").content,
        pseudoColor: getComputedStyle(owner, "::before").color,
      };
    });
    check("white-space: pre survives", styles.preWhiteSpace === "pre", styles.preWhiteSpace);
    check("font-size is the exact computed value", styles.preFont === "12px", styles.preFont);
    check("color / display / position are exact", styles.strongColor === "rgb(0, 0, 238)" && styles.strongDisplay === "inline" && styles.strongPosition === "relative", `${styles.strongColor} ${styles.strongDisplay} ${styles.strongPosition}`);
    check("margin is exact", styles.bodyMarginTop === "7px", styles.bodyMarginTop);
    check("§137 ::before content is reproduced", styles.pseudoContent === '"→ hi"', styles.pseudoContent);
    check("…with its own computed color", styles.pseudoColor === "rgb(9, 9, 9)", styles.pseudoColor);

    console.log("  §139/§140/§142/§143/§144/§145 verified behavior");
    const behavior = await desktop.evaluate(async () => {
      const root = document.querySelector('[data-wr-viewport="desktop"]')!;
      const click = (element: Element): void => (element as HTMLElement).click();
      const byOp = (op: string): HTMLElement =>
        root.querySelector(`[data-wr-op="${op}"]`) as HTMLElement;

      // §139 native details
      const summary = Array.from(root.querySelectorAll("summary")).find(
        (s) => s.getAttribute("data-wr-op") === "native",
      )!;
      const detailsBefore = summary.closest("details")!.open;
      click(summary);
      const detailsAfter = summary.closest("details")!.open;

      // §140 ARIA disclosure
      const disclosure = byOp("disclosure");
      const panel = document.getElementById(disclosure.getAttribute("data-wr-target-id")!)!;
      const beforeExpanded = disclosure.getAttribute("aria-expanded");
      const beforeHidden = panel.hasAttribute("hidden");
      click(disclosure);
      const afterExpanded = disclosure.getAttribute("aria-expanded");
      const afterHidden = panel.hasAttribute("hidden");
      click(disclosure);
      const reExpanded = disclosure.getAttribute("aria-expanded");

      // §142 tabs
      const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
      const tabTwo = tabs.find((t) => t.getAttribute("data-wr-op") === "tabs")!;
      const tabOne = tabs.find((t) => t !== tabTwo)!;
      const panelTwo = document.getElementById(tabTwo.getAttribute("data-wr-target-id")!)!;
      const panelTwoHiddenBefore = panelTwo.hasAttribute("hidden");
      click(tabTwo);
      const tabsAfter = {
        clicked: tabTwo.getAttribute("aria-selected"),
        sibling: tabOne.getAttribute("aria-selected"),
        panelHidden: panelTwo.hasAttribute("hidden"),
      };

      // §141 dynamic menu
      const menu = byOp("menu");
      const dynId = menu.getAttribute("data-wr-dyn-id")!;
      const menuBefore = document.getElementById(dynId) !== null;
      click(menu);
      const mounted = document.getElementById(dynId);
      const menuAfter = {
        exists: mounted !== null,
        tag: mounted?.tagName.toLowerCase() ?? null,
        role: mounted?.getAttribute("role") ?? null,
        childCount: mounted?.childNodes.length ?? -1,
        expanded: menu.getAttribute("aria-expanded"),
      };
      click(menu);
      const menuClosed = document.getElementById(dynId) === null;

      // §141b disclosure with an observed MOUNTED target (Task 26 correction)
      const dynDisc = root.querySelector(
        '[data-wr-op="disclosure"][data-wr-dyn-id]',
      ) as HTMLElement;
      const dynDiscId = dynDisc.getAttribute("data-wr-dyn-id")!;
      // Rendered copies only: <p> elements carrying the panel text. The RSC
      // flight payload in body <script> tags also contains the string, so raw
      // body.textContent would overcount.
      const navCopies = (): number =>
        Array.from(document.querySelectorAll("p")).filter((el) =>
          /Nav alpha/.test(el.textContent || ""),
        ).length;
      const dynDiscBefore = document.getElementById(dynDiscId) !== null;
      const dynDiscTextBefore = navCopies();
      click(dynDisc);
      const dynDiscMounted = document.getElementById(dynDiscId);
      const dynDiscAfter = {
        exists: dynDiscMounted !== null,
        tag: dynDiscMounted?.tagName.toLowerCase() ?? null,
        role: dynDiscMounted?.getAttribute("role") ?? null,
        // The panel must live INSIDE the observed static host (the host carries
        // the once-only mount marker), never next to the trigger.
        insideHost:
          dynDiscMounted?.parentElement?.hasAttribute("data-wr-obs-mounted") === true,
        viaDeclaredMarker:
          dynDiscMounted?.getAttribute("data-wr-declared-region") === "1",
        idCopies: document.querySelectorAll('[id="' + dynDiscId + '"]').length,
        textCopies: navCopies(),
        expanded: dynDisc.getAttribute("aria-expanded"),
      };
      click(dynDisc);
      const dynDiscClosed = document.getElementById(dynDiscId) === null;
      click(dynDisc);
      const dynDiscReopened = {
        exists: document.getElementById(dynDiscId) !== null,
        textCopies: navCopies(),
      };
      click(dynDisc); // back to the observed closed rest state

      // §143 toggle, §144 selection
      const press = root.querySelector('[data-wr-field="aria-pressed"]') as HTMLElement;
      const pressBefore = press.getAttribute("aria-pressed");
      click(press);
      const pressAfter = press.getAttribute("aria-pressed");
      const option = root.querySelector('[data-wr-field="aria-checked"]') as HTMLElement;
      const optionBefore = option.getAttribute("aria-checked");
      click(option);
      const optionAfter = option.getAttribute("aria-checked");

      // dialog — its region is hidden by CSS, not by the hidden attribute
      const dialogTrigger = byOp("dialog");
      const dialog = document.getElementById(dialogTrigger.getAttribute("data-wr-target-id")!)!;
      const dialogHiddenBefore = dialog.hasAttribute("hidden");
      const dialogDisplayBefore = getComputedStyle(dialog).display;
      const dialogMarked = dialog.getAttribute("data-wr-reveal");
      click(dialogTrigger);
      const dialogHiddenAfter = dialog.hasAttribute("hidden");
      const dialogDisplayAfter = getComputedStyle(dialog).display;
      click(dialogTrigger);
      const dialogDisplayClosed = getComputedStyle(dialog).display;

      // generic state toggle
      const generic = root.querySelector('[data-wr-field="aria-current"]') as HTMLElement;
      click(generic);
      const genericAfter = generic.getAttribute("aria-current");

      // §145 dismiss
      const dismiss = byOp("dismiss");
      const dismissParent = dismiss.parentElement!;
      const siblingsBefore = dismissParent.children.length;
      click(dismiss);
      const dismissGone = !dismiss.isConnected;
      const siblingsAfter = dismissParent.children.length;

      // §146 unknown: click does nothing
      const unknown = root.querySelector("[data-wr-unknown]") as HTMLElement;
      const unknownSnapshot = unknown.outerHTML;
      const childrenBefore = root.querySelectorAll("*").length;
      click(unknown);
      const unknownUnchanged = unknown.outerHTML === unknownSnapshot;
      const childrenAfter = root.querySelectorAll("*").length;

      return {
        detailsBefore,
        detailsAfter,
        beforeExpanded,
        beforeHidden,
        afterExpanded,
        afterHidden,
        reExpanded,
        panelTwoHiddenBefore,
        tabsAfter,
        menuBefore,
        menuAfter,
        menuClosed,
        dynDiscBefore,
        dynDiscTextBefore,
        dynDiscAfter,
        dynDiscClosed,
        dynDiscReopened,
        pressBefore,
        pressAfter,
        optionBefore,
        optionAfter,
        dialogHiddenBefore,
        dialogHiddenAfter,
        dialogDisplayBefore,
        dialogDisplayAfter,
        dialogDisplayClosed,
        dialogMarked,
        genericAfter,
        dismissGone,
        siblingsBefore,
        siblingsAfter,
        unknownUnchanged,
        childrenBefore,
        childrenAfter,
      };
    });

    check("§139 summary click toggles <details> natively, once", behavior.detailsBefore === false && behavior.detailsAfter === true);
    check("§140 disclosure: aria-expanded false → true", behavior.beforeExpanded === "false" && behavior.afterExpanded === "true");
    check("…and the declared target becomes visible", behavior.beforeHidden === true && behavior.afterHidden === false);
    check("…and clicking again returns to the observed closed state", behavior.reExpanded === "false");
    check("§142 tabs: the clicked tab becomes selected", behavior.tabsAfter.clicked === "true");
    check("…its sibling in the same tablist is deselected", behavior.tabsAfter.sibling === "false");
    check("…and its panel becomes visible", behavior.panelTwoHiddenBefore === true && behavior.tabsAfter.panelHidden === false);
    check("§141 the dynamic menu region does not exist before the click", behavior.menuBefore === false);
    check("…and mounts with the observed tag and role", behavior.menuAfter.exists && behavior.menuAfter.tag === "div" && behavior.menuAfter.role === "menu", JSON.stringify(behavior.menuAfter));
    check("…with ZERO invented children", behavior.menuAfter.childCount === 0);
    check("…and the trigger's state moved", behavior.menuAfter.expanded === "true");
    check("§95 a second click unmounts it", behavior.menuClosed === true);
    check(
      "§141b a disclosure's observed mounted region does not exist before the click",
      behavior.dynDiscBefore === false && behavior.dynDiscTextBefore === 0,
    );
    check(
      "…and mounts on click with the observed tag and role, op staying disclosure",
      behavior.dynDiscAfter.exists &&
        behavior.dynDiscAfter.tag === "div" &&
        behavior.dynDiscAfter.role === "region",
      JSON.stringify(behavior.dynDiscAfter),
    );
    check(
      "…INSIDE the observed static host, exactly once — no ghost copy next to the trigger",
      behavior.dynDiscAfter.insideHost === true &&
        behavior.dynDiscAfter.idCopies === 1 &&
        behavior.dynDiscAfter.textCopies === 1,
      JSON.stringify(behavior.dynDiscAfter),
    );
    check(
      "…and the declared id landed on the SOURCE-id-matched template node",
      behavior.dynDiscAfter.viaDeclaredMarker === true,
      JSON.stringify(behavior.dynDiscAfter),
    );
    check("…and the disclosure trigger's state moved", behavior.dynDiscAfter.expanded === "true");
    check("…and a second click unmounts the disclosure's region", behavior.dynDiscClosed === true);
    check(
      "…and a third click mounts it again, still exactly once",
      behavior.dynDiscReopened.exists === true && behavior.dynDiscReopened.textCopies === 1,
      JSON.stringify(behavior.dynDiscReopened),
    );
    check("§143 toggle: aria-pressed false → true", behavior.pressBefore === "false" && behavior.pressAfter === "true");
    check("§144 selection: aria-checked false → true", behavior.optionBefore === "false" && behavior.optionAfter === "true");
    check(
      "§93 a CSS-hidden region is marked for the reveal override",
      behavior.dialogMarked === "1" && behavior.dialogHiddenBefore === false,
      `marked=${behavior.dialogMarked} hidden=${behavior.dialogHiddenBefore}`,
    );
    check(
      "§101 dialog: the CSS-hidden region actually becomes visible",
      behavior.dialogDisplayBefore === "none" && behavior.dialogDisplayAfter !== "none",
      `${behavior.dialogDisplayBefore} → ${behavior.dialogDisplayAfter}`,
    );
    check(
      "…and closing returns it to its observed closed style",
      behavior.dialogDisplayClosed === "none",
      String(behavior.dialogDisplayClosed),
    );
    check(
      "…without inventing a `hidden` attribute the source never had",
      behavior.dialogHiddenAfter === false,
    );
    check("§103 generic state toggle flips its ARIA field", behavior.genericAfter === "true");
    check("§145 dismiss removes the trigger itself", behavior.dismissGone === true);
    check("…and removes nothing else", behavior.siblingsAfter === behavior.siblingsBefore - 1, `${behavior.siblingsBefore} → ${behavior.siblingsAfter}`);
    check("§146 clicking the 메뉴 열기 unknown changes nothing", behavior.unknownUnchanged === true);
    check("…and mounts no menu", behavior.childrenAfter === behavior.childrenBefore, `${behavior.childrenBefore} → ${behavior.childrenAfter}`);

    console.log("  §147/§53 form safety");
    let navigations = 0;
    desktop.on("framenavigated", () => navigations++);
    const writeRequests: string[] = [];
    desktop.on("request", (request) => {
      if (request.method() !== "GET" && request.method() !== "HEAD") {
        writeRequests.push(`${request.method()} ${request.url()}`);
      }
    });
    const urlBefore = desktop.url();
    await desktop.evaluate(() => {
      const root = document.querySelector('[data-wr-viewport="desktop"]')!;
      (root.querySelector('button[type="submit"]') as HTMLElement).click();
    });
    await desktop.waitForTimeout(400);
    check("submitting a generated form does not navigate", desktop.url() === urlBefore && navigations === 0);
    check("…and issues no write request", writeRequests.length === 0, writeRequests.join(", "));
    check(
      "no generated form carries an action endpoint",
      (await desktop.evaluate(() =>
        Array.from(document.querySelectorAll("form")).some((f) => f.hasAttribute("action")),
      )) === false,
    );

    console.log("  Task 16 correction — the button under the pseudo is clickable");
    const overlaid = await desktop.evaluate(() => {
      const root = document.querySelector('[data-wr-viewport="desktop"]')!;
      const button = Array.from(root.querySelectorAll("button")).find(
        (b) => b.textContent === "Click me",
      );
      if (!button) return { found: false };
      // The fixture page is taller than the viewport; hit-testing only means
      // anything for a point that is actually in it.
      button.scrollIntoView({ block: "center" });
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const host = button.parentElement!;
      return {
        found: true,
        pseudoZ: getComputedStyle(host, "::after").zIndex,
        hitIsSelfOrDescendant: button.contains(hit),
        hitTag: hit?.tagName.toLowerCase() ?? null,
      };
    });
    check(
      "the pseudo-element is behind the content, as observed",
      overlaid.pseudoZ === "-1",
      String(overlaid.pseudoZ),
    );
    check(
      "…so the hit target at the button's centre is the button itself",
      overlaid.found === true && overlaid.hitIsSelfOrDescendant === true,
      `hit <${overlaid.hitTag}>`,
    );
    let overlaidClickOk = true;
    try {
      await desktop.click('[data-wr-viewport="desktop"] button:has-text("Click me")', {
        timeout: 5000,
      });
    } catch {
      overlaidClickOk = false;
    }
    check("…and Playwright can actually click it", overlaidClickOk);

    console.log("  §131 internal navigation");
    await desktop.click('[data-wr-viewport="desktop"] a[href="/about"]');
    await desktop.waitForURL(`${base}/about`, { timeout: 15000 });
    check("clicking a rewritten internal link lands on the clone route", desktop.url() === `${base}/about`);
    check(
      "…and renders that route's own page",
      (await desktop.content()).includes("About body"),
    );

    console.log("  Task 16 correction — the served page hydrates against itself");
    await desktop.goto(`${base}/quiet`, { waitUntil: "networkidle" });
    /*
     * Both directions, measured by the browser's own parser rather than by a
     * model of it. The naive serialization is what the generator USED to emit;
     * the adapted one is what it emits now. If the first did not break, the
     * fixture would be proving nothing.
     */
    const parserOutcome = await desktop.evaluate(() => {
      const shape = (markup: string): { nested: boolean; parent: string } => {
        const doc = new DOMParser().parseFromString(
          `<!doctype html><html><body>${markup}</body></html>`,
          "text/html",
        );
        const outer = doc.querySelector("#outer")!;
        const inner = doc.querySelector("#inner")!;
        return {
          nested: outer.contains(inner),
          parent: inner.parentElement!.tagName.toLowerCase(),
        };
      };
      return {
        naive: shape('<ul><li id="outer"><li id="inner">x</li></li></ul>'),
        adapted: shape('<ul><li id="outer"><ul><li id="inner">x</li></ul></li></ul>'),
      };
    });
    check(
      "the naive serialization IS rewritten by the parser (the defect reproduces)",
      parserOutcome.naive.nested === false,
      `#outer no longer contains #inner; parent is <${parserOutcome.naive.parent}>`,
    );
    check(
      "…and the adapted serialization keeps the observed ancestry",
      parserOutcome.adapted.nested === true,
      `#outer contains #inner; parent is <${parserOutcome.adapted.parent}>`,
    );

    // And in the real clone, after a real hydration.
    const liveShape = await desktop.evaluate(() => {
      const root = document.querySelector('[data-wr-viewport="desktop"]')!;
      const link = Array.from(root.querySelectorAll("a")).find(
        (a) => a.textContent === "Sign in",
      );
      if (!link) return { found: false };
      const chain: string[] = [];
      for (let el = link as Element | null; el && chain.length < 6; el = el.parentElement) {
        chain.unshift(el.tagName.toLowerCase());
      }
      const wrapper = link.closest(".wr-nest");
      return {
        found: true,
        chain: chain.join(">"),
        wrapperDisplay: wrapper ? getComputedStyle(wrapper).display : null,
        outerContainsInner:
          link.closest("li")?.parentElement?.closest("li") !== null &&
          link.closest("li")?.parentElement?.closest("li") !== undefined,
      };
    });
    check(
      "in the live clone the inner <li> is inside the outer <li>, through the container",
      liveShape.found === true && String(liveShape.chain).endsWith("li>ul>li>a"),
      String(liveShape.chain),
    );
    check(
      "…and the container generates no box, so it cannot move anything",
      liveShape.wrapperDisplay === "contents",
      String(liveShape.wrapperDisplay),
    );
    await desktop.goto(`${base}/`, { waitUntil: "networkidle" });

    console.log("  §138 mobile viewport");
    const mobile = await openPage({ width: 390, height: 844 });
    await mobile.goto(`${base}/`, { waitUntil: "networkidle" });
    const mobileVariants = await mobile.evaluate(() => ({
      desktop: getComputedStyle(document.querySelector('[data-wr-viewport="desktop"]')!).display,
      mobile: getComputedStyle(document.querySelector('[data-wr-viewport="mobile"]')!).display,
    }));
    check(
      "at 390px the mobile tree is shown and the desktop tree is hidden",
      mobileVariants.mobile === "contents" && mobileVariants.desktop === "none",
      JSON.stringify(mobileVariants),
    );
    console.log("  §31 hidden-variant isolation");
    const isolation = await mobile.evaluate(() => {
      const hidden = document.querySelector('[data-wr-viewport="desktop"] [data-wr-op="disclosure"]')!;
      const before = hidden.getAttribute("aria-expanded");
      (hidden as HTMLElement).click();
      return { before, after: hidden.getAttribute("aria-expanded") };
    });
    check(
      "a click routed at the HIDDEN variant's trigger is ignored",
      isolation.before === isolation.after,
      `${isolation.before} → ${isolation.after}`,
    );

    console.log("  §148 browser console");
    check(
      "console.error / warning / pageerror across every page visited: 0",
      consoleProblems.length === 0,
      consoleProblems.slice(0, 6).join(" | "),
    );
    check(
      "…with source asset requests counted separately, not hidden",
      assetLoadFailures.length > 0,
      `${assetLoadFailures.length} reference-mode asset request(s) failed (fixture.test does not exist) — expected`,
    );
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server) {
      server.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!server.killed) server.kill("SIGKILL");
    }
    await rm(tmp, { recursive: true, force: true });
  }

  // -------------------------------------------------------------------------
  console.log("\n§190 generator import graph");
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
    /*
     * `app-template.ts` and `runtime-template.ts` are code GENERATORS: their
     * bodies contain the generated app's `import "next/navigation"` as string
     * data. Those are the clone's dependencies, not this module's, and are
     * asserted separately below — so only their real import statements count.
     */
    const emitsCode = /\/(app|runtime)-template\.ts$/.test(abs);
    const scan = emitsCode ? src.replace(/`[\s\S]*?`/g, "``") : src;
    for (const match of scan.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
      walkImports(path.resolve(path.dirname(abs), match[1]!.replace(/\.js$/, ".ts")));
    }
    for (const match of scan.matchAll(/\bfrom\s+["']([^."'][^"']*)["']/g)) {
      externals.add(match[1]!);
    }
  };
  walkImports("src/reconstruction/index.ts");
  walkImports("src/cli-reconstruct.ts");
  check(
    "the generator reaches no browser / crawler / HTTP / AI-provider module",
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

  console.log("");
  console.log(`${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`[smoke:reconstruction] FAILED — ${failures} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log("[smoke:reconstruction] OK");
  }
}

main().catch((err) => {
  console.error("[smoke:reconstruction] ERROR —", err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
