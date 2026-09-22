import { createServer, type Server } from "node:http";
import { chromium, type Browser, type Page } from "playwright";
import {
  PSEUDO_STYLE_WHITELIST,
  STYLE_WHITELIST,
  type ElementObservation,
  type ObservedViewport,
} from "../src/observer/types.js";
import { observePage } from "../src/observer/index.js";
import {
  AssetCatalogBuilder,
  StyleCatalogBuilder,
  compileViewport,
  type ElementSpecNode,
  type SpecNode,
  type StyleCatalog,
  type ViewportPageSpec,
} from "../src/sitespec/index.js";
import {
  documentRootClassName,
  generateStylesheet,
  styleClassName,
} from "../src/reconstruction/style-generator.js";
import { generatePseudoStyles, pseudoSelector } from "../src/reconstruction/pseudo-generator.js";
import type { PseudoRuleInput } from "../src/reconstruction/pseudo-generator.js";
import { WR_PREFIX } from "../src/reconstruction/types.js";

/**
 * Task 28.5B — OBSERVER VISUAL VOCABULARY proof (Changes 1 and 2).
 *
 * Task 28.5A proved that the Observer's closed style allowlists silently drop
 * paint-critical properties: whatever is not named there is simply not observed,
 * so the reconstruction re-renders the element at the CSS INITIAL value and the
 * clone paints something the source never showed. Two families were measured:
 *
 *   pseudo suppression   a `::before` whose `content` is renderable but which is
 *                        deliberately hidden by `opacity: 0` / `visibility:
 *                        hidden`. Both were outside PSEUDO_STYLE_WHITELIST, so
 *                        the clone painted it at `opacity: 1` / `visible`.
 *   typography           `text-wrap: balance` computes to the longhands
 *                        `text-wrap-mode` / `text-wrap-style`, and
 *                        `-webkit-font-smoothing` changes glyph rasterization.
 *                        None were in STYLE_WHITELIST, so a balanced headline
 *                        re-broke its lines in the clone.
 *
 * This suite proves the fix END TO END with no hand-written artifact anywhere:
 *
 *   local fixture server
 *     → REAL observePage() in real Chromium        (observation)
 *     → REAL compileViewport() + REAL catalogs     (SiteSpec)
 *     → REAL generateStylesheet() / generatePseudoStyles()   (generated CSS)
 *     → that CSS + the compiled node tree loaded in real Chromium  (browser)
 *
 * The only thing this file writes itself is the fixture and a mechanical
 * serialization of the COMPILED node tree into HTML (class names come from the
 * real `styleClassName()` / `documentRootClassName()`, and the pseudo selectors
 * are asserted against the real `pseudoSelector()`), so a mismatch between what
 * the generator emits and what the DOM offers it is a failure, not a fixup.
 *
 * Fonts are explicitly out of scope (licensing deferred): the fixture uses the
 * generic `monospace` family on both sides so glyph metrics are identical, and
 * the smoothing assertions are computed-value assertions plus a Darwin-only
 * measurement note — no cross-platform rendering claim is made.
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
// The fixture — generic shapes only, no site-specific selector or value
// ---------------------------------------------------------------------------

/**
 * Four pseudo cases + two headlines + one smoothed block.
 *
 * `monospace` everywhere so the source and the clone measure the same glyphs.
 * The headline width/size/line-height are chosen so the greedy break and the
 * balanced break genuinely differ (verified by the source-side assertions
 * below, which fail loudly if the browser stops balancing).
 */
const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>visual vocabulary fixture</title>
<style>
  body { margin: 0; font-family: monospace; color: rgb(17,17,17); background-color: rgb(255,255,255); }
  .card { position: relative; display: block; padding: 24px; }
  /* (a) suppressed by opacity only */
  .pseudo-opacity::before {
    content: "AA"; display: block; width: 40px; height: 20px;
    background-color: rgb(200,0,0); opacity: 0;
  }
  /* (b) suppressed by visibility only */
  .pseudo-visibility::before {
    content: "BB"; display: block; width: 40px; height: 20px;
    background-color: rgb(0,160,0); visibility: hidden;
  }
  /* (c) suppressed by both */
  .pseudo-both::before {
    content: "CC"; display: block; width: 40px; height: 20px;
    background-color: rgb(0,0,200); opacity: 0; visibility: hidden;
  }
  /* (d) fully visible control — must still paint in the clone */
  .pseudo-visible::before {
    content: "DD"; display: block; width: 40px; height: 20px;
    background-color: rgb(0,0,0);
  }
  /* an ::after control, to prove the second pseudo channel too */
  .pseudo-after::after {
    content: "EE"; display: block; width: 40px; height: 20px;
    background-color: rgb(120,120,120); opacity: 0;
  }
  .headline { width: 320px; font-size: 20px; line-height: 26px; font-family: monospace; }
  .headline-balanced { text-wrap: balance; }
  .headline-plain { text-wrap: wrap; }
  .smoothed { -webkit-font-smoothing: antialiased; font-size: 16px; }
</style>
</head>
<body>
  <div class="headline headline-balanced" id="headline-balanced">Reconstruction fidelity depends on observing every paint critical property today</div>
  <div class="headline headline-plain" id="headline-plain">Reconstruction fidelity depends on observing every paint critical property today</div>
  <p class="smoothed" id="smoothed">Smoothed sample paragraph.</p>
  <div class="card pseudo-opacity" id="pseudo-opacity">one</div>
  <div class="card pseudo-visibility" id="pseudo-visibility">two</div>
  <div class="card pseudo-both" id="pseudo-both">three</div>
  <div class="card pseudo-visible" id="pseudo-visible">four</div>
  <div class="card pseudo-after" id="pseudo-after">five</div>
</body>
</html>
`;

interface FixtureServer {
  origin: string;
  setRecon(html: string): void;
  close(): Promise<void>;
}

async function startFixtureServer(): Promise<FixtureServer> {
  let reconHtml = "<!doctype html><html><body></body></html>";
  const server: Server = createServer((req, res) => {
    const url = req.url ?? "/";
    const body = url.startsWith("/recon") ? reconHtml : FIXTURE_HTML;
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fixture server did not bind a port");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    setRecon(html: string) {
      reconHtml = html;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

// ---------------------------------------------------------------------------
// Browser-side measurement (identical code runs against source AND clone)
// ---------------------------------------------------------------------------

interface PseudoReading {
  content: string;
  opacity: string;
  visibility: string;
}

interface Measurement {
  pseudos: Record<string, PseudoReading>;
  textWrap: Record<string, { mode: string; style: string }>;
  smoothing: string;
  lineWidths: Record<string, number[]>;
}

/**
 * `selectors` maps a logical fixture key to the CSS selector that addresses the
 * same element in whichever document is being measured — the fixture's own
 * `#id` in the source, the generator's `[data-wr-node="…"]` in the clone.
 */
async function measure(
  page: Page,
  selectors: Record<string, string>,
): Promise<Measurement> {
  // tsx/esbuild's __name helper is not defined in the browser (see observe-page).
  await page.evaluate(
    "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
  );
  return page.evaluate((sel: Record<string, string>) => {
    const one = (key: string): Element => {
      const el = document.querySelector(sel[key]!);
      if (!el) throw new Error(`measurement selector missed: ${key} (${sel[key]})`);
      return el;
    };
    const pseudo = (key: string, which: string): PseudoReading => {
      const cs = getComputedStyle(one(key), which);
      return {
        content: cs.getPropertyValue("content"),
        opacity: cs.getPropertyValue("opacity"),
        visibility: cs.getPropertyValue("visibility"),
      };
    };
    const lineWidths = (key: string): number[] => {
      const range = document.createRange();
      range.selectNodeContents(one(key));
      return Array.from(range.getClientRects()).map((r) => Math.round(r.width));
    };
    const wrap = (key: string) => {
      const cs = getComputedStyle(one(key));
      return {
        mode: cs.getPropertyValue("text-wrap-mode"),
        style: cs.getPropertyValue("text-wrap-style"),
      };
    };
    return {
      pseudos: {
        "pseudo-opacity": pseudo("pseudo-opacity", "::before"),
        "pseudo-visibility": pseudo("pseudo-visibility", "::before"),
        "pseudo-both": pseudo("pseudo-both", "::before"),
        "pseudo-visible": pseudo("pseudo-visible", "::before"),
        "pseudo-after": pseudo("pseudo-after", "::after"),
      },
      textWrap: {
        "headline-balanced": wrap("headline-balanced"),
        "headline-plain": wrap("headline-plain"),
      },
      smoothing: getComputedStyle(one("smoothed")).getPropertyValue(
        "-webkit-font-smoothing",
      ),
      lineWidths: {
        "headline-balanced": lineWidths("headline-balanced"),
        "headline-plain": lineWidths("headline-plain"),
      },
    } as Measurement;
  }, selectors);
}

// ---------------------------------------------------------------------------
// A mechanical static rendering of the COMPILED node tree
// ---------------------------------------------------------------------------

const DOC_ROOT_TAGS = new Set(["html", "body"]);
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface RenderResult {
  html: string;
  usedTokenIds: string[];
  documentRootTokenIds: string[];
  pseudoRules: PseudoRuleInput[];
}

/**
 * Serialize the compiled viewport into HTML.
 *
 * Only the two handles the generated CSS actually addresses are emitted — the
 * style class (from the REAL `styleClassName` / `documentRootClassName`) and
 * `data-wr-node`. `<html>` / `<body>` become `<div>` carrying the document-root
 * class, exactly as the real generator's document-root wrapper does, because a
 * clone renders the observed document INSIDE a host document.
 */
function renderCompiledTree(
  viewport: ViewportPageSpec,
  pageId: string,
): RenderResult {
  const byId = new Map<string, SpecNode>();
  for (const node of viewport.nodes) byId.set(node.nodeId, node);

  const usedTokenIds = new Set<string>();
  const documentRootTokenIds = new Set<string>();
  const pseudoRules: PseudoRuleInput[] = [];

  const renderNode = (nodeId: string): string => {
    const node = byId.get(nodeId);
    if (!node) return "";
    if (node.type === "text") return escapeHtml(node.value);
    const element = node as ElementSpecNode;
    const tag = element.tagName.toLowerCase();
    const isDocRoot = DOC_ROOT_TAGS.has(tag);
    const outTag = isDocRoot ? "div" : tag;

    const classes: string[] = [];
    if (element.styleTokenId !== undefined) {
      if (isDocRoot) {
        documentRootTokenIds.add(element.styleTokenId);
        classes.push(documentRootClassName(element.styleTokenId));
      } else {
        usedTokenIds.add(element.styleTokenId);
        classes.push(styleClassName(element.styleTokenId));
      }
    }
    if (element.pseudo?.before) {
      pseudoRules.push({
        pageId,
        viewportId: viewport.profile.id,
        nodeId: element.nodeId,
        which: "before",
        styleTokenId: element.pseudo.before.styleTokenId,
        ...(element.pseudo.before.content !== undefined
          ? { content: element.pseudo.before.content }
          : {}),
      });
    }
    if (element.pseudo?.after) {
      pseudoRules.push({
        pageId,
        viewportId: viewport.profile.id,
        nodeId: element.nodeId,
        which: "after",
        styleTokenId: element.pseudo.after.styleTokenId,
        ...(element.pseudo.after.content !== undefined
          ? { content: element.pseudo.after.content }
          : {}),
      });
    }

    const attrs =
      ` data-${WR_PREFIX}-node="${escapeHtml(element.nodeId)}"` +
      (classes.length > 0 ? ` class="${escapeHtml(classes.join(" "))}"` : "");

    if (VOID_TAGS.has(outTag)) return `<${outTag}${attrs}>`;
    const children = element.childNodeIds.map(renderNode).join("");
    return `<${outTag}${attrs}>${children}</${outTag}>`;
  };

  const body = viewport.rootNodeIds.map(renderNode).join("");
  return {
    html: body,
    usedTokenIds: [...usedTokenIds].sort(),
    documentRootTokenIds: [...documentRootTokenIds].sort(),
    pseudoRules,
  };
}

// ---------------------------------------------------------------------------
// SiteSpec compilation of one real observation, using the real compiler
// ---------------------------------------------------------------------------

interface CompiledFixture {
  viewport: ViewportPageSpec;
  styleCatalog: StyleCatalog;
  nodeIdByElementId: Map<string, string>;
}

function compileObservedViewport(
  observed: ObservedViewport,
  pageId: string,
  rootUrl: string,
): CompiledFixture {
  const styleBuilder = new StyleCatalogBuilder();
  const assetBuilder = new AssetCatalogBuilder(rootUrl);
  const compiled = compileViewport({
    pageId,
    profile: observed.profile,
    metadata: observed.metadata,
    elements: observed.elements,
    styleTable: observed.styleTable,
    assets: observed.assets,
    frames: observed.frames,
    shadow: observed.shadow,
    renderedHtml: observed.renderedHtml,
    styleBuilder,
    assetBuilder,
  });

  const { catalog, idByKey } = styleBuilder.finalize();
  const { idByKey: assetIdByKey } = assetBuilder.finalize();

  // The same key→id swap `compileSiteSpec` performs once the whole site is known.
  const style = (key: string): string => {
    const id = idByKey.get(key);
    if (id === undefined) throw new Error(`unresolved style catalog key: ${key}`);
    return id;
  };
  compiled.spec.assetRefs = compiled.spec.assetRefs.map((key) => {
    const id = assetIdByKey.get(key);
    if (id === undefined) throw new Error(`unresolved asset catalog key: ${key}`);
    return id;
  });
  for (const node of compiled.spec.nodes) {
    if (node.type !== "element") continue;
    const element = node as ElementSpecNode;
    if (element.styleTokenId !== undefined) {
      element.styleTokenId = style(element.styleTokenId);
    }
    if (element.pseudo?.before) {
      element.pseudo.before.styleTokenId = style(element.pseudo.before.styleTokenId);
    }
    if (element.pseudo?.after) {
      element.pseudo.after.styleTokenId = style(element.pseudo.after.styleTokenId);
    }
    element.assetRefs = element.assetRefs.map((key) => {
      const id = assetIdByKey.get(key);
      if (id === undefined) throw new Error(`unresolved asset catalog key: ${key}`);
      return id;
    });
  }

  return {
    viewport: compiled.spec,
    styleCatalog: catalog,
    nodeIdByElementId: compiled.nodeIdByElementId,
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const PSEUDO_KEYS = [
  "pseudo-opacity",
  "pseudo-visibility",
  "pseudo-both",
  "pseudo-visible",
  "pseudo-after",
] as const;
const ALL_KEYS = [
  ...PSEUDO_KEYS,
  "headline-balanced",
  "headline-plain",
  "smoothed",
] as const;

async function main(): Promise<void> {
  console.log("smoke-visual-vocab — Task 28.5B observer visual vocabulary");

  // --- §1 the whitelists themselves ----------------------------------------
  section("§1 the Observer's style vocabulary names the paint-critical properties");
  for (const property of ["opacity", "visibility"]) {
    check(
      `PSEUDO_STYLE_WHITELIST names ${property}`,
      PSEUDO_STYLE_WHITELIST.includes(property),
    );
  }
  for (const property of ["text-wrap-mode", "text-wrap-style", "-webkit-font-smoothing"]) {
    check(`STYLE_WHITELIST names ${property}`, STYLE_WHITELIST.includes(property));
  }
  check(
    "no font binary / @font-face property was added (fonts out of scope)",
    !STYLE_WHITELIST.some((p) => p.startsWith("font-face") || p === "src"),
  );

  const fixture = await startFixtureServer();
  let browser: Browser | undefined;
  try {
    const rootUrl = `${fixture.origin}/`;

    // --- §2 real observation ------------------------------------------------
    section("§2 the real Observer records the new properties");
    const observedPage = await observePage(rootUrl, { layoutProbe: false });
    const desktop = observedPage.viewports.find((v) => v.profile.id === "desktop");
    check("desktop viewport was observed", desktop !== undefined);
    if (!desktop) throw new Error("no desktop viewport observed");

    const elementByFixtureId = new Map<string, ElementObservation>();
    for (const element of desktop.elements) {
      const id = element.attributes["id"];
      if (id !== undefined) elementByFixtureId.set(id, element);
    }
    for (const key of ALL_KEYS) {
      check(`fixture element #${key} was observed`, elementByFixtureId.has(key));
    }

    const styleOf = (key: string): Record<string, string> => {
      const element = elementByFixtureId.get(key)!;
      return desktop.styleTable[element.styleId] ?? {};
    };
    const pseudoStyleOf = (
      key: string,
      which: "before" | "after",
    ): Record<string, string> => {
      const element = elementByFixtureId.get(key)!;
      const ref = element.pseudo?.[which];
      if (!ref) return {};
      return desktop.styleTable[ref.styleId] ?? {};
    };

    const expectedPseudoSuppression: Record<
      string,
      { which: "before" | "after"; opacity: string; visibility: string }
    > = {
      "pseudo-opacity": { which: "before", opacity: "0", visibility: "visible" },
      "pseudo-visibility": { which: "before", opacity: "1", visibility: "hidden" },
      "pseudo-both": { which: "before", opacity: "0", visibility: "hidden" },
      "pseudo-visible": { which: "before", opacity: "1", visibility: "visible" },
      "pseudo-after": { which: "after", opacity: "0", visibility: "visible" },
    };
    for (const [key, expected] of Object.entries(expectedPseudoSuppression)) {
      const styles = pseudoStyleOf(key, expected.which);
      check(
        `observation: #${key} ::${expected.which} carries opacity=${expected.opacity}`,
        styles["opacity"] === expected.opacity,
        `got ${String(styles["opacity"])}`,
      );
      check(
        `observation: #${key} ::${expected.which} carries visibility=${expected.visibility}`,
        styles["visibility"] === expected.visibility,
        `got ${String(styles["visibility"])}`,
      );
    }

    check(
      "observation: #headline-balanced carries text-wrap-style=balance",
      styleOf("headline-balanced")["text-wrap-style"] === "balance",
      `got ${String(styleOf("headline-balanced")["text-wrap-style"])}`,
    );
    check(
      "observation: #headline-balanced carries text-wrap-mode",
      styleOf("headline-balanced")["text-wrap-mode"] === "wrap",
      `got ${String(styleOf("headline-balanced")["text-wrap-mode"])}`,
    );
    check(
      "observation: #headline-plain carries text-wrap-style=auto",
      styleOf("headline-plain")["text-wrap-style"] === "auto",
      `got ${String(styleOf("headline-plain")["text-wrap-style"])}`,
    );
    check(
      "observation: #smoothed carries -webkit-font-smoothing=antialiased [darwin measurement]",
      styleOf("smoothed")["-webkit-font-smoothing"] === "antialiased",
      `got ${String(styleOf("smoothed")["-webkit-font-smoothing"])}`,
    );

    // --- §3 real SiteSpec ---------------------------------------------------
    section("§3 the real SiteSpec compiler carries them into the style catalog");
    const pageId = "p000001";
    const compiled = compileObservedViewport(desktop, pageId, rootUrl);
    check("compiled viewport produced nodes", compiled.viewport.nodes.length > 0);

    const nodeIdFor = (key: string): string => {
      const element = elementByFixtureId.get(key)!;
      const nodeId = compiled.nodeIdByElementId.get(element.id);
      if (nodeId === undefined) throw new Error(`no SiteSpec node for #${key}`);
      return nodeId;
    };
    const specNodeFor = (key: string): ElementSpecNode => {
      const nodeId = nodeIdFor(key);
      const node = compiled.viewport.nodes.find((n) => n.nodeId === nodeId);
      if (!node || node.type !== "element") throw new Error(`#${key} is not an element node`);
      return node as ElementSpecNode;
    };
    const tokenProperties = (tokenId: string): Record<string, string> => {
      const token = compiled.styleCatalog.styles.find((t) => t.styleTokenId === tokenId);
      if (!token) throw new Error(`style token ${tokenId} missing from catalog`);
      return token.properties;
    };

    for (const [key, expected] of Object.entries(expectedPseudoSuppression)) {
      const node = specNodeFor(key);
      const ref = node.pseudo?.[expected.which];
      check(`SiteSpec: #${key} kept its ::${expected.which}`, ref !== undefined);
      if (!ref) continue;
      const props = tokenProperties(ref.styleTokenId);
      check(
        `SiteSpec: #${key} ::${expected.which} token has opacity/visibility`,
        props["opacity"] === expected.opacity && props["visibility"] === expected.visibility,
        `${String(props["opacity"])} / ${String(props["visibility"])}`,
      );
    }
    check(
      "SiteSpec: #headline-balanced token has text-wrap-style=balance",
      tokenProperties(specNodeFor("headline-balanced").styleTokenId!)["text-wrap-style"] ===
        "balance",
    );
    check(
      "SiteSpec: #smoothed token has -webkit-font-smoothing=antialiased [darwin measurement]",
      tokenProperties(specNodeFor("smoothed").styleTokenId!)["-webkit-font-smoothing"] ===
        "antialiased",
    );

    // --- §4 real generated CSS ---------------------------------------------
    section("§4 the real generators emit the new properties as CSS");
    const rendered = renderCompiledTree(compiled.viewport, pageId);
    const styles = generateStylesheet({
      styleCatalog: compiled.styleCatalog,
      usedTokenIds: rendered.usedTokenIds,
      documentRootTokenIds: rendered.documentRootTokenIds,
    });
    const pseudoStyles = generatePseudoStyles(rendered.pseudoRules, compiled.styleCatalog);
    check("stylesheet has no missing tokens", styles.missingTokens.length === 0);
    check("pseudo stylesheet has no missing tokens", pseudoStyles.missingTokens.length === 0);
    check("pseudo rules were emitted for all five fixture pseudos", pseudoStyles.ruleCount >= 5);
    check(
      "generated element CSS contains text-wrap-style:balance",
      styles.css.includes("text-wrap-style:balance"),
    );
    check(
      "generated element CSS contains text-wrap-mode",
      styles.css.includes("text-wrap-mode:"),
    );
    check(
      "generated element CSS contains -webkit-font-smoothing:antialiased [darwin measurement]",
      styles.css.includes("-webkit-font-smoothing:antialiased"),
    );
    check(
      "generated pseudo CSS contains opacity:0",
      pseudoStyles.css.includes("opacity:0"),
    );
    check(
      "generated pseudo CSS contains visibility:hidden",
      pseudoStyles.css.includes("visibility:hidden"),
    );
    for (const key of PSEUDO_KEYS) {
      const which = expectedPseudoSuppression[key]!.which;
      const selector = pseudoSelector(pageId, compiled.viewport.profile.id, nodeIdFor(key), which);
      check(
        `generated pseudo CSS addresses #${key} via the real pseudoSelector()`,
        pseudoStyles.css.includes(selector),
      );
    }

    // --- §5 the browser -----------------------------------------------------
    section("§5 real Chromium: the clone reproduces the source's paint decisions");
    const reconHtml =
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<title>reconstruction</title><style>\n${styles.css}\n${pseudoStyles.css}\n</style>` +
      `</head><body style="margin:0">` +
      `<div data-${WR_PREFIX}-page="${pageId}" data-${WR_PREFIX}-viewport="${compiled.viewport.profile.id}">` +
      `${rendered.html}</div></body></html>`;
    fixture.setRecon(reconHtml);

    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: desktop.profile.width, height: desktop.profile.height },
      deviceScaleFactor: desktop.profile.deviceScaleFactor,
    });

    const sourceSelectors: Record<string, string> = {};
    const cloneSelectors: Record<string, string> = {};
    for (const key of ALL_KEYS) {
      sourceSelectors[key] = `#${key}`;
      cloneSelectors[key] = `[data-${WR_PREFIX}-node="${nodeIdFor(key)}"]`;
    }

    const sourcePage = await context.newPage();
    await sourcePage.goto(rootUrl, { waitUntil: "load" });
    const source = await measure(sourcePage, sourceSelectors);

    const clonePage = await context.newPage();
    await clonePage.goto(`${fixture.origin}/recon`, { waitUntil: "load" });
    const clone = await measure(clonePage, cloneSelectors);

    // suppression survives
    for (const key of PSEUDO_KEYS) {
      const src = source.pseudos[key]!;
      const dst = clone.pseudos[key]!;
      check(
        `clone #${key} pseudo content matches source`,
        dst.content === src.content,
        `${dst.content} vs ${src.content}`,
      );
      check(
        `clone #${key} pseudo opacity matches source (${src.opacity})`,
        dst.opacity === src.opacity,
        `got ${dst.opacity}`,
      );
      check(
        `clone #${key} pseudo visibility matches source (${src.visibility})`,
        dst.visibility === src.visibility,
        `got ${dst.visibility}`,
      );
    }
    // the suppressed ones are genuinely suppressed, in BOTH documents
    for (const key of ["pseudo-opacity", "pseudo-both", "pseudo-after"]) {
      check(
        `source #${key} pseudo paints nothing (opacity 0)`,
        source.pseudos[key]!.opacity === "0",
      );
      check(
        `clone #${key} pseudo paints nothing (opacity 0)`,
        clone.pseudos[key]!.opacity === "0",
      );
    }
    check(
      "source #pseudo-visibility pseudo paints nothing (visibility hidden)",
      source.pseudos["pseudo-visibility"]!.visibility === "hidden",
    );
    check(
      "clone #pseudo-visibility pseudo paints nothing (visibility hidden)",
      clone.pseudos["pseudo-visibility"]!.visibility === "hidden",
    );
    // …and the control is NOT over-suppressed
    check(
      "clone #pseudo-visible control still paints (opacity 1, visible, content kept)",
      clone.pseudos["pseudo-visible"]!.opacity === "1" &&
        clone.pseudos["pseudo-visible"]!.visibility === "visible" &&
        clone.pseudos["pseudo-visible"]!.content !== "none" &&
        clone.pseudos["pseudo-visible"]!.content !== "normal",
      JSON.stringify(clone.pseudos["pseudo-visible"]),
    );

    // text-wrap survives, and still CHANGES the wrapping
    check(
      "clone #headline-balanced computes text-wrap-style: balance",
      clone.textWrap["headline-balanced"]!.style === "balance",
      clone.textWrap["headline-balanced"]!.style,
    );
    check(
      "clone #headline-balanced computes text-wrap-mode: wrap",
      clone.textWrap["headline-balanced"]!.mode === "wrap",
      clone.textWrap["headline-balanced"]!.mode,
    );
    check(
      "clone #headline-plain computes text-wrap-style: auto",
      clone.textWrap["headline-plain"]!.style === "auto",
      clone.textWrap["headline-plain"]!.style,
    );
    const srcBalanced = source.lineWidths["headline-balanced"]!;
    const srcPlain = source.lineWidths["headline-plain"]!;
    const dstBalanced = clone.lineWidths["headline-balanced"]!;
    const dstPlain = clone.lineWidths["headline-plain"]!;
    check(
      "source: balancing actually changes the line boxes (the signal exists)",
      JSON.stringify(srcBalanced) !== JSON.stringify(srcPlain),
      `${JSON.stringify(srcBalanced)} vs ${JSON.stringify(srcPlain)}`,
    );
    check(
      "clone: balancing still changes the line boxes the same way",
      JSON.stringify(dstBalanced) !== JSON.stringify(dstPlain),
      `${JSON.stringify(dstBalanced)} vs ${JSON.stringify(dstPlain)}`,
    );
    check(
      "clone balanced line boxes are IDENTICAL to the source's",
      JSON.stringify(dstBalanced) === JSON.stringify(srcBalanced),
      `${JSON.stringify(dstBalanced)} vs ${JSON.stringify(srcBalanced)}`,
    );
    check(
      "clone unbalanced line boxes are IDENTICAL to the source's",
      JSON.stringify(dstPlain) === JSON.stringify(srcPlain),
      `${JSON.stringify(dstPlain)} vs ${JSON.stringify(srcPlain)}`,
    );

    // smoothing — computed value only; no cross-platform rendering claim.
    check(
      "source #smoothed computes -webkit-font-smoothing: antialiased [darwin measurement]",
      source.smoothing === "antialiased",
      source.smoothing,
    );
    check(
      "clone #smoothed computes -webkit-font-smoothing: antialiased [darwin measurement]",
      clone.smoothing === "antialiased",
      clone.smoothing,
    );

    await context.close();
  } finally {
    if (browser) await browser.close();
    await fixture.close();
  }
}

main()
  .then(() => {
    console.log("");
    console.log(`smoke-visual-vocab: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    console.error("");
    console.error("smoke-visual-vocab CRASHED");
    console.error(error);
    process.exitCode = 1;
  });
