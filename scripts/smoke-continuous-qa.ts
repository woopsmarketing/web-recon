import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import {
  COARSE_STEP_PX,
  MAX_ANCESTOR_CLASS_TOKENS,
  MAX_SIBLING_DRIFT_STEPS,
  MIN_COMPARED_RATIO,
  NAME_SHIM,
  SIGNATURE_CLASS_JACCARD,
  SIGNATURE_TEXT_CHARS,
  SKIP_TAGS,
  analyzeSample,
  authoredBoundariesFromConditions,
  bisectGap,
  buildIntervalResults,
  buildSampleSet,
  buildTrackedVariants,
  compareFits,
  detectDiscontinuities,
  fitBehavior,
  fnv1a32,
  measureInPage,
  partitionIntervals,
  readObservationDom,
  readSiteSpecLite,
  reproduceBracket,
  resolveServedSwitch,
  runContinuousRoute,
  seededWidths,
  siteSpecAuthoredBoundaries,
  stableStringify,
  type BehaviorFit,
  type BoundaryKind,
  type DomRecord,
  type FitSample,
  type InPageTarget,
  type Interval,
  type MeasureArgs,
  type NodeReading,
  type PageReading,
  type RouteResult,
  type SweepSample,
  type TrackedNode,
  type VariantId,
} from "../src/responsive-qa/continuous/index.js";

/**
 * Offline smoke for Continuous Responsive QA (Responsive Core P0, stream QA).
 * Local node:http fixtures only — no network, no `next build`. Clone fixtures
 * are plain HTML using the generator's markup conventions
 * (`.wr-variant[data-wr-viewport][data-wr-page]`, `[data-wr-node]`), and the
 * SiteSpec / observer dom.json inputs are synthesized from the fixture source
 * pages at their truth widths into a temp directory.
 */

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLONE_SWITCH_CSS =
  '.wr-variant{display:contents}' +
  '@media (max-width:599.98px){[data-wr-viewport="desktop"]{display:none}}' +
  '@media (min-width:600px){[data-wr-viewport="mobile"]{display:none}}';

function page(css: string, body: string, script = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}${
    script ? `<script>${script}</script>` : ""
  }</body></html>`;
}

/** Source markup uses data-n; the clone copy renames it to data-wr-node. */
function asClone(markup: string): string {
  return markup.replace(/data-n=/g, "data-wr-node=");
}

function cloneDoc(css: string, desktop: string, mobile: string, script = ""): string {
  return page(
    CLONE_SWITCH_CSS + css,
    `<div class="wr-variant" data-wr-viewport="desktop" data-wr-page="p1">${asClone(desktop)}</div>` +
      `<div class="wr-variant" data-wr-viewport="mobile" data-wr-page="p1">${asClone(mobile)}</div>`,
    script,
  );
}

// Scenario EQUAL: centered capped container + card row + heading + JS DOM switch at 733.
const EQUAL_CSS =
  "body{margin:0;font:16px/20px Arial,Helvetica,sans-serif}" +
  ".cap{max-width:500px;margin:0 auto;height:60px;background:#ddd}" +
  ".row{display:flex;flex-direction:column}" +
  "@media (min-width:600px){.row{flex-direction:row}}" +
  ".card{flex:1 1 0;height:50px;background:#eee}" +
  ".title{font-size:20px;line-height:24px;margin:0}" +
  ".slot span{display:inline-block;width:10px;height:10px}";
const EQUAL_BODY =
  '<div data-n="n1" class="page">' +
  '<div data-n="n2" class="cap">cap</div>' +
  '<div data-n="n3" class="row"><div data-n="n4" class="card">A</div><div data-n="n5" class="card">B</div><div data-n="n6" class="card">C</div></div>' +
  '<h2 data-n="n7" class="title">A heading that is long enough to wrap on narrow viewports</h2>' +
  '<div data-n="n8" class="slot"></div>' +
  "</div>";
// A JS-driven DOM switch at a width that appears in NO stylesheet.
const EQUAL_SCRIPT =
  "const mq=matchMedia('(min-width: 733px)');" +
  "const render=()=>{for(const s of document.querySelectorAll('.slot')){s.innerHTML=(mq.matches?'<span></span>'.repeat(30):'<span></span>'.repeat(2));}};" +
  "render();mq.addEventListener('change',render);";

// Scenario BROKEN: fluid source vs frozen clone, plus H1/H3/R9/R10/G6 defects.
const BROKEN_SOURCE_CSS =
  "body{margin:0;font:16px/20px Arial,Helvetica,sans-serif}" +
  ".wrap{width:90%;margin:0 auto;height:80px;background:#ccc}" +
  ".row{display:flex;height:50px}" +
  "@media (max-width:599px){.row{flex-direction:column;height:auto}}" +
  ".card{flex:1 1 0;height:50px}" +
  ".title{font-size:20px;line-height:24px;margin:0}" +
  ".clipbox{margin:0}" +
  ".extra{width:300px;height:50px;background:#aaa}";
const BROKEN_CLONE_CSS =
  "body{margin:0;font:16px/20px Arial,Helvetica,sans-serif}" +
  ".wrap{width:720px;margin:0 auto;height:80px;background:#ccc}" +
  ".row{display:flex;height:50px}" +
  ".card{flex:1 1 0;height:50px}" +
  ".title{font-size:20px;line-height:24px;margin:0;white-space:nowrap}" +
  ".clipbox{margin:0;height:10px;overflow:hidden}" +
  ".extra{width:300px;height:50px;background:#aaa}" +
  "@media (min-width:700px){.extra{width:100px}}";
const BROKEN_BODY =
  '<div data-n="n1" class="page">' +
  '<div data-n="n2" class="wrap">wrap</div>' +
  '<div data-n="n3" class="row"><div data-n="n4" class="card">A</div><div data-n="n5" class="card">B</div><div data-n="n6" class="card">C</div></div>' +
  '<h2 data-n="n7" class="title">A heading that is long enough to wrap on narrow viewports</h2>' +
  '<p data-n="n8" class="clipbox">This paragraph has more than forty characters of text so it is tracked.</p>' +
  '<div data-n="n9" class="extra">extra</div>' +
  "</div>";

// Scenario TREE: JS dual-DOM source switching at 700; clone switches at 600.
const TREE_CSS =
  "body{margin:0;font:16px/20px Arial,Helvetica,sans-serif}" +
  ".dh{height:60px;background:#333}.dnav{display:flex;height:60px}" +
  ".dnav a{display:block;width:120px;height:40px}.dhero{height:200px}" +
  ".mbar{height:50px;background:#555}.mbar button{width:80px;height:30px}.mcontent{min-height:300px}";
const TREE_D =
  '<header data-n="d1" class="dh"><nav data-n="d2" class="dnav"><a data-n="d3" href="#">Products link</a><a data-n="d4" href="#">Pricing link</a></nav></header>' +
  '<main data-n="d5" class="dmain"><section data-n="d6" class="dhero"><h1 data-n="d7">Desktop hero title</h1></section></main>';
const TREE_M =
  '<div data-n="m1" class="mbar"><button data-n="m2">Menu</button></div>' +
  '<div data-n="m3" class="mcontent"><h1 data-n="m4">Mobile title text</h1><p data-n="m5">A mobile paragraph with more than forty characters for tracking.</p></div>';
const TREE_SOURCE = page(
  TREE_CSS,
  '<div data-n="app" id="app"></div>',
  `const D=${JSON.stringify(TREE_D)};const M=${JSON.stringify(TREE_M)};` +
    "const app=document.getElementById('app');const mq=matchMedia('(min-width: 700px)');" +
    "const render=()=>{app.innerHTML=mq.matches?D:M};render();mq.addEventListener('change',render);",
);
const TREE_CLONE = cloneDoc(
  TREE_CSS,
  `<div data-n="app">${TREE_D}</div>`,
  `<div data-n="app">${TREE_M}</div>`,
);

// Scenario JITTER: a JS reflow whose width depends on resize HISTORY (not on the
// width) plus one deterministic JS DOM switch at 850. Both sides identical.
const JITTER_CSS =
  "body{margin:0;font:16px/20px Arial,Helvetica,sans-serif}" +
  ".jit{height:60px;background:#bbb}.base{height:60px;background:#eee}" +
  ".slot span{display:inline-block;width:10px;height:10px}";
const JITTER_BODY =
  '<div data-n="n1" class="page"><div data-n="n2" class="base">base</div><div data-n="n3" class="jit"></div><div data-n="n4" class="slot"></div></div>';
const JITTER_SCRIPT =
  "let resizes=0;const offsets=[-40,0,40];" +
  "const jitter=()=>{resizes++;for(const j of document.querySelectorAll('.jit')){j.style.width=(innerWidth*0.5+offsets[resizes%3])+'px';}};" +
  "jitter();addEventListener('resize',jitter);" +
  "const mq=matchMedia('(min-width: 850px)');" +
  "const render=()=>{for(const s of document.querySelectorAll('.slot')){s.innerHTML=(mq.matches?'<span></span>'.repeat(30):'<span></span>'.repeat(2));}};" +
  "render();mq.addEventListener('change',render);";

const CORR_PAGE = page(
  "body{margin:0}",
  '<div class="a">hello world</div><div class="b"><span>x</span></div><div class="c">third</div>',
);

// Correspondence drift: the observation predates an inserted banner (index shift)
// and a wrapper with two identical siblings around the recorded index (tie).
const DRIFT_PAGE = page(
  "body{margin:0}",
  '<div class="wrap"><aside class="banner">new banner</aside><div class="hdr">Header</div><div class="intro">Intro text</div>' +
    '<section class="sec"><p class="t">deep text</p></section></div>' +
    '<div class="wrap2"><div class="card">A</div><span class="x">s</span><div class="card">A</div></div>',
);

// Look-alike siblings (review M4): identical repeated cards with an inserted
// node before them, the same row without insertion, distinct-text cards with an
// insertion, and a descendant of identical repeated cards.
const LOOKALIKE_PAGE = page(
  "body{margin:0}.card{height:20px}",
  '<div class="grid"><div class="ins">inserted</div><div class="card">Same</div><div class="card">Same</div><div class="card">Same</div></div>' +
    '<div class="grid2"><div class="card">Same</div><div class="card">Same</div><div class="card">Same</div></div>' +
    '<div class="grid3"><div class="ins">inserted</div><div class="card">One</div><div class="card">Two</div><div class="card">Three</div></div>' +
    '<div class="grid4"><div class="ins">inserted</div><div class="card"><p class="t">Same title</p></div><div class="card"><p class="t">Same title</p></div><div class="card"><p class="t">Same title</p></div></div>',
);

const ROUTES: Record<string, string> = {
  "/s/equal": page(EQUAL_CSS, EQUAL_BODY, EQUAL_SCRIPT),
  "/c/equal": cloneDoc(EQUAL_CSS, EQUAL_BODY, EQUAL_BODY, EQUAL_SCRIPT),
  "/s/broken": page(BROKEN_SOURCE_CSS, BROKEN_BODY),
  "/c/broken": cloneDoc(BROKEN_CLONE_CSS, BROKEN_BODY, BROKEN_BODY),
  "/s/tree": TREE_SOURCE,
  "/c/tree": TREE_CLONE,
  "/s/jitter": page(JITTER_CSS, JITTER_BODY, JITTER_SCRIPT),
  "/c/jitter": cloneDoc(JITTER_CSS, JITTER_BODY, JITTER_BODY, JITTER_SCRIPT),
  "/s/corr": CORR_PAGE,
  "/s/drift": DRIFT_PAGE,
  "/s/lookalike": LOOKALIKE_PAGE,
};

async function serve(): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const body = ROUTES[(req.url ?? "").split("?")[0]!];
    if (body === undefined) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

// ---------------------------------------------------------------------------
// Synthetic SiteSpec + observer dom.json from a live fixture page
// ---------------------------------------------------------------------------

interface Extracted {
  dom: DomRecord[];
  nodes: unknown[];
  styles: Array<{ styleTokenId: string; properties: Record<string, string> }>;
  rootNodeIds: string[];
  width: number;
}

function extractInPage(args: { skip: string[]; variant: string }): Extracted {
  const skip = new Set(args.skip);
  let eCounter = 0;
  let tCounter = 0;
  const dom: DomRecord[] = [];
  const nodes: Array<Record<string, unknown>> = [];
  const styles: Array<{ styleTokenId: string; properties: Record<string, string> }> = [];
  const walk = (el: Element, parentId?: string, parentNodeId?: string): Record<string, unknown> | null => {
    if (skip.has(el.tagName.toUpperCase())) return null;
    eCounter++;
    const id = "e" + String(eCounter).padStart(6, "0");
    const tag = el.tagName.toLowerCase();
    const nodeId = el.getAttribute("data-n") || "x" + id;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const record: DomRecord = { id, tagName: tag, attributes: {} };
    if (parentId) record.parentId = parentId;
    const cls = el.getAttribute("class");
    if (cls) record.attributes!.class = cls;
    dom.push(record);
    const token = "st-" + args.variant + "-" + nodeId;
    const node: Record<string, unknown> = {
      nodeId,
      type: "element",
      sourceElementId: id,
      tagName: tag,
      effectiveVisible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden",
      boundingBox: { x: r.left, y: r.top + window.scrollY, width: r.width, height: r.height },
      styleTokenId: token,
      childNodeIds: [] as string[],
    };
    if (parentNodeId) node.parentNodeId = parentNodeId;
    nodes.push(node);
    styles.push({ styleTokenId: token, properties: { display: cs.display, position: cs.position } });
    if (tag === "svg") return node;
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        const value = (child.nodeValue || "").trim();
        if (!value) continue;
        tCounter++;
        const tid = "t" + args.variant + tCounter;
        nodes.push({ nodeId: tid, type: "text", parentNodeId: nodeId, value });
        (node.childNodeIds as string[]).push(tid);
      } else if (child.nodeType === 1) {
        const built = walk(child as Element, id, nodeId);
        if (built) (node.childNodeIds as string[]).push(built.nodeId as string);
      }
    }
    return node;
  };
  const root = walk(document.documentElement);
  return {
    dom,
    nodes,
    styles,
    rootNodeIds: root ? [root.nodeId as string] : [],
    width: window.innerWidth,
  };
}

async function synthesizeSpec(
  browser: Browser,
  url: string,
  dir: string,
  truth: Record<VariantId, number>,
): Promise<string> {
  const context = await browser.newContext({ viewport: { width: truth.desktop, height: 1000 } });
  await context.addInitScript(NAME_SHIM);
  const pageHandle = await context.newPage();
  await pageHandle.goto(url, { waitUntil: "load" });
  const extracted: Partial<Record<VariantId, Extracted>> = {};
  for (const variant of ["desktop", "mobile"] as VariantId[]) {
    await pageHandle.setViewportSize({ width: truth[variant], height: 1000 });
    await pageHandle.waitForTimeout(80);
    extracted[variant] = await pageHandle.evaluate(extractInPage, { skip: [...SKIP_TAGS], variant });
  }
  await context.close();
  const obsDir = path.join(dir, "observation");
  for (const variant of ["desktop", "mobile"] as VariantId[]) {
    await mkdir(path.join(obsDir, "viewports", variant), { recursive: true });
    await writeFile(path.join(obsDir, "viewports", variant, "dom.json"), JSON.stringify(extracted[variant]!.dom));
  }
  await writeFile(
    path.join(obsDir, "observation.json"),
    JSON.stringify({
      viewports: {
        desktop: { files: { dom: "viewports/desktop/dom.json" } },
        mobile: { files: { dom: "viewports/mobile/dom.json" } },
      },
    }),
  );
  const specDir = path.join(dir, "site-spec");
  await mkdir(path.join(specDir, "pages"), { recursive: true });
  const viewport = (variant: VariantId): unknown => ({
    profile: { id: variant, width: truth[variant] },
    rootNodeIds: extracted[variant]!.rootNodeIds,
    nodes: extracted[variant]!.nodes,
    authoredBreakpoints: { boundaries: [] },
  });
  await writeFile(
    path.join(specDir, "pages", "p1.json"),
    JSON.stringify({
      pageId: "p1",
      url,
      sourceObservation: path.join(obsDir, "observation.json"),
      viewports: { desktop: viewport("desktop"), mobile: viewport("mobile") },
    }),
  );
  await writeFile(
    path.join(specDir, "style-catalog.json"),
    JSON.stringify({ styles: [...extracted.desktop!.styles, ...extracted.mobile!.styles] }),
  );
  const siteSpecFile = path.join(specDir, "site-spec.json");
  await writeFile(
    siteSpecFile,
    JSON.stringify({
      rootUrl: url,
      routes: [{ url, pathname: new URL(url).pathname, pageId: "p1", renderSourcePageId: "p1" }],
      pages: [{ pageId: "p1", file: "pages/p1.json" }],
      styleCatalogFile: "style-catalog.json",
    }),
  );
  return siteSpecFile;
}

async function runScenario(
  browser: Browser,
  base: string,
  tmp: string,
  name: string,
  opts: { min: number; max: number; extrapolate: number[]; truth: Record<VariantId, number> },
): Promise<RouteResult> {
  const dir = path.join(tmp, name);
  const siteSpecFile = await synthesizeSpec(browser, `${base}/s/${name}`, dir, opts.truth);
  const spec = await readSiteSpecLite(siteSpecFile);
  const pageSpec = await spec.readPage("p1");
  const dom: Partial<Record<VariantId, DomRecord[] | null>> = {};
  for (const variant of ["desktop", "mobile"] as VariantId[]) {
    dom[variant] = (await readObservationDom(pageSpec, variant, [dir]))?.records ?? null;
  }
  const variants = buildTrackedVariants({ pageSpec, styleProps: spec.styleProps, dom });
  const started = Date.now();
  const result = await runContinuousRoute({
    browser,
    routePath: `/${name}`,
    pageId: "p1",
    sourceUrl: `${base}/s/${name}`,
    cloneUrl: `${base}/c/${name}`,
    variants,
    siteSpecBoundaries: siteSpecAuthoredBoundaries(pageSpec),
    cloneHintBoundaries: [],
    // Synthetic route map: the site scalar says 801, this page's own entry says 600
    // (what the fixture clones actually swap at).
    servedSwitch: resolveServedSwitch(
      { config: { inferredBreakpoint: { value: 801 }, routeBreakpoints: [{ pageId: "p1", breakpoint: 900 }] } },
      { breakpoint: 801, pageBreakpoints: { p1: 600, p9: 950 } },
      "p1",
    ),
    min: opts.min,
    max: opts.max,
    extrapolate: opts.extrapolate,
    evidenceRoot: path.join(dir, "evidence"),
    timing: { settleMs: 40, motionWaitMs: 200, scrollStepWaitMs: 30, reproduceExtraSettleMs: 60 },
  });
  await writeFile(path.join(dir, "route.json"), stableStringify(result));
  console.log(
    `  [${name}] ${result.summary.verdict} ${result.summary.intervalsPass}/${result.summary.intervalsTotal} intervals, ` +
      `${result.counters.samples} samples, ${Date.now() - started} ms, checks ${JSON.stringify(result.summary.failingChecks)}`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Pure tests
// ---------------------------------------------------------------------------

function reading(width: number, nodes: Array<Partial<NodeReading> & { k: string }>, extra: Partial<PageReading> = {}): PageReading {
  return {
    vw: width,
    vh: 1000,
    sw: width,
    sh: 2000,
    rendered: 50,
    served: [],
    nodes: nodes.map((n) => ({ st: "matched", v: 1, x: 0, y: 0, w: 0, h: 10, ...n })) as NodeReading[],
    ...extra,
  };
}

async function pureTests(): Promise<void> {
  console.log("pure: seeding / sampling");
  check("fnv1a32('') is the FNV offset basis", fnv1a32("") === 0x811c9dc5);
  check("fnv1a32('a') matches the reference value", fnv1a32("a") === 0xe40c292c);
  const s1 = seededWidths("/route", 600, 900, 3);
  const s2 = seededWidths("/route", 600, 900, 3);
  check("seeded widths: same route+interval → same widths", JSON.stringify(s1) === JSON.stringify(s2), { s1, s2 });
  check("seeded widths: 3 distinct in range", s1.length === 3 && new Set(s1).size === 3 && s1.every((w) => w >= 600 && w < 900), s1);
  check(
    "seeded widths: different route → different widths",
    JSON.stringify(seededWidths("/other", 600, 900, 3)) !== JSON.stringify(s1),
  );
  const intervals = partitionIntervals({
    min: 400,
    max: 900,
    extrapolateMax: 1000,
    boundaries: new Map<number, BoundaryKind[]>([
      [600, ["authored-media"]],
      [733, ["observed"]],
    ]),
  });
  check(
    "partition: source boundaries + extrapolation edge",
    JSON.stringify(intervals.map((i) => [i.min, i.max, i.extrapolated])) ===
      JSON.stringify([[400, 600, false], [600, 733, false], [733, 901, false], [901, 1001, true]]),
    intervals.map((i) => [i.min, i.max]),
  );
  const setA = buildSampleSet({ routePath: "/r", min: 400, max: 900, extrapolate: [1000], sourceBoundaries: [600, 733], cloneBoundaries: [801], intervals });
  const setB = buildSampleSet({ routePath: "/r", min: 400, max: 900, extrapolate: [1000], sourceBoundaries: [600, 733], cloneBoundaries: [801], intervals });
  // A different run with different clone evidence: the seeded widths of the same intervals must not move.
  const setC = buildSampleSet({ routePath: "/r", min: 400, max: 900, extrapolate: [1000], sourceBoundaries: [600, 733], cloneBoundaries: [650], intervals });
  const seeded = (set: typeof setA): number[] => set.widths.filter((w) => set.origins[String(w)]!.includes("seeded"));
  check("sample set deterministic across runs", JSON.stringify(setA) === JSON.stringify(setB));
  check("seeded widths independent of clone evidence (different run → same)", JSON.stringify(seeded(setA)) === JSON.stringify(seeded(setC)), { a: seeded(setA), c: seeded(setC) });
  check(
    "sample set has b−1,b,b+1 for source and clone boundaries, grid, extrapolation",
    [599, 600, 601, 732, 733, 734, 800, 801, 802, 400, 440, 880, 900, 1000].every((w) => setA.widths.includes(w)),
    setA.widths,
  );
  check(
    "3 seeded widths per interval",
    intervals.every((i) => seeded(setA).filter((w) => w >= i.min && w < i.max).length === 3),
  );

  console.log("pure: authored boundaries");
  const authored = authoredBoundariesFromConditions([
    { kind: "media", text: "(max-width: 899.98px)" },
    { kind: "media", text: "screen and (min-width: 600px)" },
    { kind: "media", text: "print and (min-width: 700px)" },
    { kind: "media", text: "(max-width: 1199px)" },
    { kind: "container", text: "card (min-width: 500px)" },
    { kind: "media", text: "not all and (min-width: 300px)" },
  ]);
  check("max-width 899.98 → 900, max-width 1199 → 1200, min-width 600 → 600", JSON.stringify(authored.media) === "[600,900,1200]", authored.media);
  check("print skipped and counted", authored.nonScreenSkipped === 1);
  check("named @container condition parsed separately", JSON.stringify(authored.container) === "[500]", authored.container);
  check("`not` query counted unsupported, never guessed", authored.unsupported === 1);

  console.log("pure: discontinuity detection + bisection");
  const synth = (width: number): PageReading =>
    reading(width, [
      { k: "jump", w: width < 733 ? width : width / 2, x: 0 },
      { k: "fluid", w: width * 0.9, x: width * 0.05 },
      { k: "kink", w: Math.min(width, 600), x: 0 },
    ]);
  const series: SweepSample[] = [];
  for (let w = 400; w <= 900; w += COARSE_STEP_PX) series.push({ width: w, reading: synth(w) });
  const gaps = detectDiscontinuities(series, { xwKeys: new Set(["jump", "fluid", "kink"]), noXKeys: new Set() });
  check("one gap detected (jump), fluid and kink stay continuous", gaps.length === 1 && gaps[0]!.lo === 730 && gaps[0]!.hi === 740 && gaps[0]!.keys.join() === "jump", gaps);
  if (gaps[0]) {
    const bisected = await bisectGap(series, gaps[0], async (w) => synth(w));
    check("bisection converges to a 1px bracket at 733", bisected.width === 733 && bisected.lo === 732 && bisected.converged && bisected.confirmed, bisected);
  }

  console.log("pure: served switch resolution");
  const manifestP0 = {
    config: {
      inferredBreakpoint: { value: 801, servedSwitch: { value: 880 } },
      routeBreakpoints: [
        { pageId: "p1", breakpoint: 900, servedSwitch: { value: 720 } },
        { pageId: "p2", breakpoint: 900 },
      ],
    },
  };
  const routeMapWithPages = { breakpoint: 801, pageBreakpoints: { p1: 600, p9: 950 } };
  const rp1 = resolveServedSwitch(manifestP0, routeMapWithPages, "p1");
  const rp2 = resolveServedSwitch(manifestP0, routeMapWithPages, "p2");
  check("route-map pageBreakpoints wins for its page", rp1?.px === 600 && rp1.source === "route-map.pageBreakpoints", rp1);
  check("page without its own entry inherits the route-map scalar", rp2?.px === 801 && rp2.source === "route-map.breakpoint", rp2);
  const fm1 = resolveServedSwitch(manifestP0, undefined, "p1");
  const fm2 = resolveServedSwitch(manifestP0, undefined, "p2");
  check("no route map → manifest routeBreakpoints[].servedSwitch.value", fm1?.px === 720, fm1);
  check(
    "routeBreakpoints[].breakpoint (inferred) is never read as served → site servedSwitch",
    fm2?.px === 880 && fm2.source === "manifest.config.inferredBreakpoint.servedSwitch",
    fm2,
  );
  const pre = resolveServedSwitch({ config: { inferredBreakpoint: { value: 801 }, routeBreakpoints: [{ pageId: "p1", breakpoint: 900 }] } }, undefined, "p1");
  check("pre-P0 manifest → inferredBreakpoint.value, not the inferred route breakpoint", pre?.px === 801, pre);

  console.log("pure: reproducibility gate");
  let jitterCalls = 0;
  // Width-independent history jitter: every measurement shifts by -40/0/+40.
  const jittery = async (width: number): Promise<PageReading> => {
    jitterCalls++;
    return reading(width, [{ k: "jit", w: width * 0.5 + [-40, 0, 40][jitterCalls % 3]!, x: 0 }]);
  };
  const jitterSeries: SweepSample[] = [];
  for (let w = 800; w <= 900; w += COARSE_STEP_PX) jitterSeries.push({ width: w, reading: await jittery(w) });
  const jitterGaps = detectDiscontinuities(jitterSeries, { xwKeys: new Set(["jit"]), noXKeys: new Set() });
  check("history jitter produces coarse gaps (fixture is not vacuous)", jitterGaps.length > 0, jitterGaps.length);
  let jitterConfirmed = 0;
  for (const gap of jitterGaps) if ((await bisectGap(jitterSeries, gap, jittery)).confirmed) jitterConfirmed++;
  check("no jitter bracket survives lo,hi,lo,hi re-measurement", jitterConfirmed === 0, jitterConfirmed);
  const deterministic = await reproduceBracket(732, 733, gaps[0]?.features ?? [], async (w) => synth(w));
  check("a deterministic jump reproduces", deterministic.reproduced && deterministic.noisyFeatures === 0, deterministic);

  console.log("pure: behaviour classes");
  const samples = (fn: (W: number) => Partial<FitSample>): FitSample[] =>
    [600, 650, 700, 750, 800, 850].map((W) => ({ W, x: 0, w: 0, v: 1 as const, mxw: null, ...fn(W) }));
  check("FLUID + CENTERED", (() => {
    const f = fitBehavior(samples((W) => ({ w: 0.9 * W, x: 0.05 * W })), 600);
    return f.widthClass === "FLUID" && f.anchor === "CENTERED";
  })());
  check("FIXED px", fitBehavior(samples(() => ({ w: 720, x: 0 })), 600).widthClass === "FIXED");
  check("CAPPED via max-width cap", fitBehavior(samples((W) => ({ w: 500, x: (W - 500) / 2, mxw: 500 })), 600).widthClass === "CAPPED");
  check("CAPPED piecewise (fluid then constant)", fitBehavior(
    [400, 450, 500, 550, 600, 650].map((W) => ({ W, x: 0, w: Math.min(W, 520), v: 1 as const })), 400,
  ).widthClass === "CAPPED");
  check("FULL_BLEED", fitBehavior(samples((W) => ({ w: W, x: 0 })), 600).widthClass === "FULL_BLEED");
  check("HIDDEN", fitBehavior(samples(() => ({ v: 0 })), 600).widthClass === "HIDDEN");
  check("STEP on visibility change", fitBehavior(samples((W) => ({ w: 100, v: W < 700 ? 0 : 1 })), 600).widthClass === "STEP");

  console.log("pure: hard-check exemption");
  const tracked = new Map<string, TrackedNode>();
  const exempt = analyzeSample({
    width: 500,
    source: reading(500, [], { sw: 540 }),
    clone: reading(500, [], { sw: 560, served: ["desktop"] }),
    tracked,
    motionUnstable: new Set(),
    findTextKeys: [],
  });
  check("H1 exempt when the source overflows too", exempt.violations.length === 0 && exempt.exemptions.H1 === 1, exempt);
  const notExempt = analyzeSample({
    width: 500,
    source: reading(500, []),
    clone: reading(500, [], { sw: 560, served: ["desktop"] }),
    tracked,
    motionUnstable: new Set(),
    findTextKeys: [],
  });
  check("H1 fails when only the clone overflows", notExempt.violations.some((v) => v.check === "H1"));

  console.log("pure: H7m clone-node-missing + coverage floor (review B1)");
  const mkTracked = (keys: string[]): Map<string, TrackedNode> =>
    new Map(
      keys.map((key, index) => [
        key,
        {
          key,
          variant: "desktop" as VariantId,
          nodeId: key.split(":")[1]!,
          tag: "div",
          category: "a" as const,
          categories: ["a" as const],
          documentOrder: index,
          primary: null,
          alt: null,
          refSource: "none" as const,
          hasText: false,
          isMedia: false,
          truthBox: { x: 50, y: 0, width: 200, height: 50 },
        },
      ]),
    );
  const box = { x: 50, w: 200, h: 50 };
  const interval: Interval = {
    min: 600,
    max: 750,
    extrapolated: false,
    sourceEvidence: { lower: { width: 600, kinds: ["range-edge"] }, upper: { width: 750, kinds: ["range-edge"] } },
  };
  const verdictFor = (
    keys: string[],
    sourceNode: (key: string, i: number) => Partial<NodeReading>,
    cloneNode: (key: string, i: number) => Partial<NodeReading>,
  ) => {
    const trackedMap = mkTracked(keys);
    const measured = [600, 650, 700].map((width) => {
      const source = reading(width, keys.map((k, i) => ({ k, ...box, ...sourceNode(k, i) })));
      const clone = reading(width, keys.map((k, i) => ({ k, ...box, ...cloneNode(k, i) })), { served: ["desktop"] });
      const analysis = analyzeSample({ width, source, clone, tracked: trackedMap, motionUnstable: new Set(), findTextKeys: [] });
      return { width, source, clone, analysis };
    });
    const built = buildIntervalResults({ intervals: [interval], samples: measured, tracked: trackedMap, motionUnstable: new Set(), g6: [] });
    return { measured, interval: built.intervals[0]! };
  };
  const h7m = verdictFor(
    ["desktop:k1", "desktop:k2", "desktop:k3", "desktop:k4", "desktop:k5"],
    (k) => (k === "desktop:k5" ? { v: 0 } : {}),
    (k) =>
      k === "desktop:k3" || k === "desktop:k5"
        ? { st: "unmatched", why: "clone-node-absent", v: 0, x: 0, w: 0, h: 0 }
        : k === "desktop:k2"
          ? { v: 0 }
          : {},
  );
  const h7mKeys = [...new Set(h7m.measured.flatMap((m) => m.analysis.violations.filter((v) => v.check === "H7m").map((v) => v.key)))].sort();
  check(
    "missing clone node (absent) + present-but-not-rendered container → H7m on both, FAIL",
    h7m.interval.verdict === "FAIL" && JSON.stringify(h7mKeys) === JSON.stringify(["desktop:k2", "desktop:k3"]) && h7m.interval.failingChecks.H7m === 6,
    { h7mKeys, verdict: h7m.interval.verdict, checks: h7m.interval.failingChecks },
  );
  check(
    "H7m exempt when the source node is not visible either; plain H7 not raised for a text-less container",
    !h7mKeys.includes("desktop:k5") && (h7m.interval.failingChecks.H7 ?? 0) === 0,
    h7m.interval.failingChecks,
  );
  check(
    "H7m scenario coverage is at/above the floor (fails on H7m, not insufficient-coverage)",
    h7m.interval.coverage.ratio >= MIN_COMPARED_RATIO && h7m.interval.failingChecks["insufficient-coverage"] === undefined,
    { coverage: h7m.interval.coverage, checks: h7m.interval.failingChecks },
  );
  const keys10 = Array.from({ length: 10 }, (_, i) => `desktop:k${i}`);
  const low = verdictFor(keys10, (_k, i) => (i < 4 ? {} : { st: "unmatched", why: "path-unresolved", v: 0 }), () => ({}));
  check(
    "low coverage interval (4/10 compared) → insufficient-coverage FAIL, never PASS",
    low.interval.verdict === "FAIL" &&
      (low.interval.failingChecks["insufficient-coverage"] ?? 0) === 1 &&
      Object.keys(low.interval.failingChecks).join() === "insufficient-coverage" &&
      low.interval.coverage.tracked === 30 &&
      low.interval.coverage.compared === 12 &&
      low.interval.coverage.unmatched === 18 &&
      low.interval.coverage.ratio === 0.4,
    { verdict: low.interval.verdict, checks: low.interval.failingChecks, coverage: low.interval.coverage },
  );
  const enough = verdictFor(keys10, (_k, i) => (i < 7 ? {} : { st: "unmatched", why: "path-unresolved", v: 0 }), () => ({}));
  check("coverage 7/10 ≥ floor, otherwise identical → PASS", enough.interval.verdict === "PASS" && enough.interval.coverage.ratio === 0.7, {
    verdict: enough.interval.verdict,
    checks: enough.interval.failingChecks,
  });
  const none = verdictFor(keys10, () => ({ st: "unmatched", why: "path-unresolved", v: 0 }), () => ({}));
  check(
    "0 compared nodes → insufficient-coverage FAIL",
    none.interval.verdict === "FAIL" && none.interval.coverage.compared === 0 && (none.interval.failingChecks["insufficient-coverage"] ?? 0) === 1,
    none.interval,
  );

  console.log("pure: STEP / MIXED / HIDDEN not passed on class name alone (review m5)");
  const stepSeries = (at: number, before: number, after: number): FitSample[] =>
    [600, 650, 700, 750, 800, 850].map((W) => ({ W, x: 0, w: W < at ? before : after, v: 1 as const, mxw: null }));
  const T700 = 14;
  const srcStep = fitBehavior(stepSeries(700, 300, 600), 600);
  const cloneStepLate = fitBehavior(stepSeries(750, 300, 600), 600);
  const cloneStepSame = fitBehavior(stepSeries(700, 300, 600), 600);
  const cloneStepOtherW = fitBehavior(stepSeries(700, 300, 500), 600);
  check("STEP fixtures classify as STEP on both sides", [srcStep, cloneStepLate, cloneStepSame, cloneStepOtherW].every((f) => f.widthClass === "STEP"), [srcStep, cloneStepLate]);
  const lateCmp = compareFits(srcStep, cloneStepLate, T700);
  check("STEP at different locations → FAIL", !lateCmp.pass && /step at/.test(lateCmp.reason ?? ""), lateCmp);
  check("STEP at the same location with the same widths → PASS", compareFits(srcStep, cloneStepSame, T700).pass, [srcStep.params, cloneStepSame.params]);
  const otherW = compareFits(srcStep, cloneStepOtherW, T700);
  check("STEP at the same location but a different width after the step → FAIL", !otherW.pass && /step w/.test(otherW.reason ?? ""), otherW);
  const mixed: BehaviorFit = { widthClass: "MIXED", anchor: "NONE", samples: 6, params: {} };
  const wave = (W: number): number => 400 + (W % 100 === 0 ? 60 : -60);
  const mixS = [600, 650, 700, 750, 800, 850].map((W) => ({ W, x: 10, w: wave(W), v: 1 as const, mxw: null }));
  const mixBad = mixS.map((p) => (p.W === 750 ? { ...p, w: p.w + 50 } : p));
  const mixBadCmp = compareFits(mixed, mixed, T700, { s: mixS, c: mixBad });
  check("MIXED with a pointwise w mismatch at one sample → FAIL", !mixBadCmp.pass && /mixed: w/.test(mixBadCmp.reason ?? ""), mixBadCmp);
  const mixX = mixS.map((p) => (p.W === 850 ? { ...p, x: p.x + 40 } : p));
  check("MIXED with a pointwise x mismatch → FAIL", !compareFits(mixed, mixed, T700, { s: mixS, c: mixX }).pass);
  check("MIXED pointwise equal → PASS", compareFits(mixed, mixed, T700, { s: mixS, c: mixS.map((p) => ({ ...p })) }).pass);
  check("MIXED without samples cannot be verified → FAIL", !compareFits(mixed, mixed, T700).pass);
  const hidden: BehaviorFit = { widthClass: "HIDDEN", anchor: "NONE", samples: 6, params: {} };
  const hid = mixS.map((p) => ({ ...p, v: 0 as const }));
  check("HIDDEN on both at every sample → PASS", compareFits(hidden, hidden, T700, { s: hid, c: hid }).pass);
  check(
    "HIDDEN class but a visible sample in the pair → FAIL",
    !compareFits(hidden, hidden, T700, { s: hid, c: hid.map((p, i) => (i === 2 ? { ...p, v: 1 as const } : p)) }).pass,
  );
}

// ---------------------------------------------------------------------------
// Browser tests
// ---------------------------------------------------------------------------

async function correspondenceTest(browser: Browser, base: string): Promise<void> {
  console.log("browser: correspondence refusal");
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await context.addInitScript(NAME_SHIM);
  const p = await context.newPage();
  await p.goto(`${base}/s/corr`, { waitUntil: "load" });
  const ref = (pathArr: number[], tag: string, classes: string[], text: string, childTags: string[] | null = null) => ({
    path: pathArr,
    tag,
    classes,
    text,
    childTags,
  });
  const target = (k: string, vp: VariantId, pRef: InPageTarget["p"], aRef: InPageTarget["a"] = null): InPageTarget => ({
    k,
    vp,
    n: k,
    p: pRef,
    a: aRef,
    wl: false,
    wc: false,
    wm: false,
    wt: false,
  });
  const args: MeasureArgs = {
    mode: "source",
    pageId: "p1",
    heavy: true,
    skipTags: [...SKIP_TAGS],
    findTexts: [],
    cfg: {
      textChars: SIGNATURE_TEXT_CHARS,
      jaccard: SIGNATURE_CLASS_JACCARD,
      columnBucket: 4,
      h8Chars: 200,
      maxDrift: MAX_SIBLING_DRIFT_STEPS,
      ancClassCap: MAX_ANCESTOR_CLASS_TOKENS,
    },
    targets: [
      target("ok", "desktop", ref([0], "div", ["a"], "helloworld")),
      target("sig", "desktop", ref([2], "div", ["zzz"], "different")),
      target("dup1", "desktop", ref([1], "div", ["b"], "x")),
      target("dup2", "desktop", ref([1], "div", ["b"], "x")),
      target("othervariant", "mobile", ref([1], "div", ["b"], "x")),
      target("nopath", "desktop", ref([7], "div", ["a"], "")),
      target("tag", "desktop", ref([0], "span", ["a"], "helloworld")),
      target("alt", "desktop", ref([2], "div", ["nope"], "nope"), ref([2], "div", ["c"], "third")),
    ],
  };
  const result = (await p.evaluate(measureInPage, args)) as PageReading;
  await context.close();
  const by = new Map(result.nodes.map((n) => [n.k, n]));
  check("exact path + corroborated signature → matched", by.get("ok")?.st === "matched");
  check("path resolves but signature does not corroborate → refused (unmatched)", by.get("sig")?.st === "unmatched" && by.get("sig")?.why === "signature-mismatch", by.get("sig"));
  check("two same-variant targets on one element → both ambiguous, never guessed", by.get("dup1")?.st === "ambiguous" && by.get("dup2")?.st === "ambiguous");
  check("same element claimed by the other variant stays matched", by.get("othervariant")?.st === "matched");
  check("unresolvable path → unmatched path-unresolved", by.get("nopath")?.st === "unmatched" && by.get("nopath")?.why === "path-unresolved");
  check("tag mismatch → unmatched", by.get("tag")?.st === "unmatched" && by.get("tag")?.why === "tag-mismatch");
  check("other variant's path corroborates → tree-mismatch", by.get("alt")?.st === "tree-mismatch");

  console.log("browser: anchored re-resolution (sibling drift)");
  const driftContext = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await driftContext.addInitScript(NAME_SHIM);
  const dp = await driftContext.newPage();
  await dp.goto(`${base}/s/drift`, { waitUntil: "load" });
  const sig = (tag: string, classes: string[]) => ({ tag, classes });
  const deepRef = {
    ...ref([0, 2, 0], "p", ["t"], "deeptext"),
    anc: [sig("div", ["wrap"]), sig("section", ["sec"]), sig("p", ["t"])],
  };
  const tieRef = {
    ...ref([1, 1], "div", ["card"], "A"),
    anc: [sig("div", ["wrap2"]), sig("div", ["card"])],
  };
  const driftArgs: MeasureArgs = {
    ...args,
    targets: [
      target("drifted", "desktop", deepRef),
      target("legacy", "desktop", ref([0, 2, 0], "p", ["t"], "deeptext")),
      target("tie", "desktop", tieRef),
      target("strictStillWins", "mobile", {
        ...ref([0, 1], "div", ["hdr"], "Header"),
        anc: [sig("div", ["wrap"]), sig("div", ["hdr"])],
      }),
    ],
  };
  const drifted = (await dp.evaluate(measureInPage, driftArgs)) as PageReading;
  await driftContext.close();
  const dby = new Map(drifted.nodes.map((n) => [n.k, n]));
  check(
    "inserted sibling before an ancestor → re-anchored ±1 drift, matched",
    dby.get("drifted")?.st === "matched" && dby.get("drifted")?.why === "anchored-drift",
    dby.get("drifted"),
  );
  check("refs without ancestor signatures keep strict behaviour (unmatched)", dby.get("legacy")?.st === "unmatched", dby.get("legacy"));
  // Expectation changed with review M4: this refusal is now reported as `ambiguous`
  // (why ambiguous-signature) instead of `unmatched`; it is still never matched.
  check(
    "two strongly corroborating ±1 siblings → refused as ambiguous, never guessed",
    dby.get("tie")?.st === "ambiguous" && dby.get("tie")?.why === "ambiguous-signature",
    dby.get("tie"),
  );
  check("strict path match is not marked as drift", dby.get("strictStillWins")?.st === "matched" && dby.get("strictStillWins")?.why === undefined, dby.get("strictStillWins"));

  console.log("browser: look-alike siblings (review M4)");
  const lookContext = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await lookContext.addInitScript(NAME_SHIM);
  const lp = await lookContext.newPage();
  await lp.goto(`${base}/s/lookalike`, { waitUntil: "load" });
  const sigN = (tag: string, classes: string[], n?: number) => (n === undefined ? { tag, classes } : { tag, classes, n });
  const withText = (t: InPageTarget): InPageTarget => ({ ...t, wt: true });
  const lookArgs: MeasureArgs = {
    ...args,
    targets: [
      // Observed row: 3 identical cards; live: a node inserted before them.
      target("lookalike", "desktop", {
        ...ref([0, 1], "div", ["card"], "Same"),
        sib: 3,
        anc: [sigN("div", ["grid"], 4), sigN("div", ["card"], 3)],
      }),
      // Same identical row, nothing inserted, sibling count recorded → exact index trusted.
      target("noInsert", "desktop", {
        ...ref([1, 1], "div", ["card"], "Same"),
        sib: 3,
        anc: [sigN("div", ["grid2"], 4), sigN("div", ["card"], 3)],
      }),
      // Same row without recorded counts → the signature alone cannot decide → ambiguous.
      target("noCount", "mobile", {
        ...ref([1, 1], "div", ["card"], "Same"),
        anc: [sigN("div", ["grid2"]), sigN("div", ["card"])],
      }),
      // Distinct text + insertion: the class matches the neighbour too, text picks the right card.
      withText(
        target("distinct", "desktop", {
          ...ref([2, 1], "div", ["card"], "Two"),
          sib: 3,
          anc: [sigN("div", ["grid3"], 4), sigN("div", ["card"], 3)],
        }),
      ),
      // Descendant of identical repeated cards after an insertion: refused at the card depth.
      target("descendant", "desktop", {
        ...ref([3, 1, 0], "p", ["t"], "Sametitle"),
        sib: 1,
        anc: [sigN("div", ["grid4"], 4), sigN("div", ["card"], 3), sigN("p", ["t"], 1)],
      }),
    ],
  };
  const looked = (await lp.evaluate(measureInPage, lookArgs)) as PageReading;
  await lookContext.close();
  const lby = new Map(looked.nodes.map((n) => [n.k, n]));
  check(
    "identical sibling cards + inserted node → ambiguous refusal, not a silent neighbour match",
    lby.get("lookalike")?.st === "ambiguous" && lby.get("lookalike")?.why === "ambiguous-signature",
    lby.get("lookalike"),
  );
  check(
    "identical sibling cards, unchanged sibling count → exact index matched (count guard)",
    lby.get("noInsert")?.st === "matched" && lby.get("noInsert")?.why === undefined,
    lby.get("noInsert"),
  );
  check("identical sibling cards without recorded counts → ambiguous", lby.get("noCount")?.st === "ambiguous", lby.get("noCount"));
  check(
    "distinct-text cards + inserted node → drifted to the card whose text agrees",
    lby.get("distinct")?.st === "matched" && lby.get("distinct")?.why === "anchored-drift" && lby.get("distinct")?.txt === "Two",
    lby.get("distinct"),
  );
  check(
    "descendant of identical repeated cards + insertion → ambiguous at the ancestor depth",
    lby.get("descendant")?.st === "ambiguous" && lby.get("descendant")?.why === "ambiguous-signature",
    lby.get("descendant"),
  );
}

function classRow(result: RouteResult, key: string, predicate: (i: RouteResult["intervals"][number]) => boolean) {
  for (const interval of result.intervals.filter(predicate)) {
    const row = interval.nodeClasses.find((r) => r.key === key);
    if (row) return { interval, row };
  }
  return undefined;
}

async function browserScenarios(browser: Browser, base: string, tmp: string): Promise<void> {
  console.log("browser: EQUAL (discovery, centered/capped PASS)");
  const equal = await runScenario(browser, base, tmp, "equal", {
    min: 400,
    max: 900,
    extrapolate: [1000],
    truth: { desktop: 800, mobile: 450 },
  });
  check("live stylesheet scan finds authored 600", equal.discovery.source.authored.media.includes(600), equal.discovery.source.authored);
  const b733 = equal.discovery.source.bisected.find((b) => b.width === 733);
  check(
    "JS-driven DOM switch (not in CSS) bisected to a 1px bracket at 733",
    equal.discovery.source.observedBoundaries.includes(733) && b733 !== undefined && b733.lo === 732 && b733.converged && b733.confirmed,
    equal.discovery.source.bisected,
  );
  check("733 is NOT an authored boundary (observed only)", !equal.discovery.source.authored.media.includes(733));
  check(
    "partition uses source boundaries 600 and 733",
    equal.discovery.partitionBoundaries.some((b) => b.width === 600) && equal.discovery.partitionBoundaries.some((b) => b.width === 733 && b.kinds.includes("observed")),
    equal.discovery.partitionBoundaries,
  );
  check("clone served switch at 600 is explained (no G6)", equal.counters.cloneOnlyDiscontinuities === 0, equal.discovery.clone.observedBoundaries);
  const capRow = classRow(equal, "desktop:n2", (i) => i.min === 600);
  check(
    "centered capped container → CAPPED/CENTERED on both sides, PASS",
    capRow !== undefined && capRow.row.source.widthClass === "CAPPED" && capRow.row.source.anchor === "CENTERED" && capRow.row.pass,
    capRow?.row,
  );
  const capMobile = classRow(equal, "mobile:n2", (i) => i.min === 400);
  check("fluid-then-capped interval (400..599) → CAPPED on both sides, PASS", capMobile !== undefined && capMobile.row.source.widthClass === "CAPPED" && capMobile.row.pass, capMobile?.row);
  check("equal pair: every interval PASS", equal.summary.verdict === "PASS" && equal.summary.intervalsPass === equal.summary.intervalsTotal, {
    intervals: equal.intervals.map((i) => [i.min, i.max, i.verdict, i.failingChecks, i.worstNodes.slice(0, 3)]),
  });
  check("equal pair: no tree mismatch", equal.counters.treeMismatchSamples === 0);
  check("equal pair: extrapolated interval sampled", equal.intervals.some((i) => i.extrapolated && i.samples.includes(1000)));
  const seededFromRun = equal.samples.widths.filter((w) => equal.samples.origins[String(w)]!.includes("seeded"));
  const recomputed = equal.intervals.flatMap((i) => seededWidths("/equal", i.min, i.max, 3));
  check("route seeded widths are the FNV-seeded set for its intervals", recomputed.every((w) => seededFromRun.includes(w)), { seededFromRun, recomputed });
  check("tracked nodes matched on source", equal.counters.nodesMatchedEver >= 6, equal.counters);

  console.log("browser: BROKEN (FLUID vs FIXED, H1, H3, R9, R10, G6)");
  const broken = await runScenario(browser, base, tmp, "broken", {
    min: 400,
    max: 900,
    extrapolate: [],
    truth: { desktop: 800, mobile: 450 },
  });
  check("broken pair: route FAIL", broken.summary.verdict === "FAIL");
  const wrap = classRow(broken, "desktop:n2", (i) => i.min >= 600);
  check(
    "frozen px clone vs fluid source → FLUID vs FIXED behaviour-class FAIL",
    wrap !== undefined && wrap.row.source.widthClass === "FLUID" && wrap.row.clone.widthClass === "FIXED" && !wrap.row.pass,
    wrap?.row,
  );
  const checks = broken.summary.failingChecks;
  check("H1 horizontal overflow detected", (checks.H1 ?? 0) > 0, checks);
  check("H3 clipped text detected", (checks.H3 ?? 0) > 0, checks);
  check("R10 column count mismatch detected", (checks.R10 ?? 0) > 0, checks);
  check(
    "R10 only below the source's 600 boundary",
    broken.rawViolations.filter((v) => v.check === "R10").every((v) => v.width < 600),
    broken.rawViolations.filter((v) => v.check === "R10").map((v) => v.width),
  );
  check("R9 line-wrap divergence detected", (checks.R9 ?? 0) > 0, checks);
  const g6 = broken.intervals.flatMap((i) => i.cloneOnlyDiscontinuities);
  check("clone-only discontinuity at 700 → G6 FAIL", g6.some((d) => d.width === 700) && (checks["clone-only-discontinuity"] ?? 0) > 0, g6);
  check("G6 interval carries a failing verdict", broken.intervals.some((i) => i.min <= 700 && i.max > 700 && i.verdict === "FAIL"));
  check("failing interval reports firstFailingWidth and worstNodes", broken.intervals.some((i) => i.verdict === "FAIL" && i.firstFailingWidth !== null && i.worstNodes.length > 0));
  check("broken pair: passWidthSpans/failWidthSpans cover every sample", (() => {
    const covered = [...broken.summary.passWidthSpans, ...broken.summary.failWidthSpans];
    return broken.samples.widths.every((w) => covered.some((s) => w >= s.min && w <= s.max));
  })());

  console.log("browser: TREE (tree-mismatch detection)");
  const tree = await runScenario(browser, base, tmp, "tree", {
    min: 450,
    max: 900,
    extrapolate: [],
    truth: { desktop: 900, mobile: 450 },
  });
  const mismatchWidths = tree.samples.perSample.filter((s) => s.treeMismatch).map((s) => s.width);
  check("tree mismatch detected", mismatchWidths.length > 0, tree.samples.perSample.map((s) => [s.width, s.sourceVariant, s.served]));
  check("tree mismatch only where clone serves desktop and source renders mobile (600..699)", mismatchWidths.every((w) => w >= 600 && w < 700), mismatchWidths);
  check("tree mismatch covers both edges of the span", mismatchWidths.includes(600) && mismatchWidths.includes(699), mismatchWidths);
  check("source JS tree switch observed at 700", tree.discovery.source.observedBoundaries.includes(700), tree.discovery.source.bisected);
  check("clone switch at 600 with no source boundary → G6", tree.intervals.some((i) => i.cloneOnlyDiscontinuities.some((d) => d.width === 600)));
  check("tree-mismatch interval FAIL with tree-mismatch histogram", tree.intervals.some((i) => i.verdict === "FAIL" && (i.failingChecks["tree-mismatch"] ?? 0) > 0 && i.treeMismatchWidths.length > 0));
  check("outside the mismatch span the tree vote agrees with the served variant", tree.samples.perSample.filter((s) => s.width < 600 || s.width >= 700).every((s) => !s.treeMismatch));

  console.log("browser: JITTER (reproducibility gate)");
  const jitter = await runScenario(browser, base, tmp, "jitter", {
    min: 800,
    max: 900,
    extrapolate: [],
    truth: { desktop: 900, mobile: 820 },
  });
  const jitterSource = jitter.discovery.source;
  check("jitter zone produced coarse discontinuities on the source", jitterSource.discontinuities.length > 1, jitterSource.discontinuities);
  check(
    "real JS DOM switch at 850 still bisected and reproduced",
    jitterSource.observedBoundaries.includes(850) && jitterSource.bisected.some((b) => b.width === 850 && b.confirmed),
    jitterSource.bisected,
  );
  check(
    "no history-jitter boundary enters the source partition",
    jitter.discovery.partitionBoundaries.every((b) => b.width === 850 || !b.kinds.includes("observed")),
    jitter.discovery.partitionBoundaries,
  );
  check("unreproducible brackets are reported, not dropped silently", jitterSource.bisected.some((b) => !b.confirmed && b.noisyFeatures > 0), jitterSource.bisected);
  check("clone jitter does not raise G6", jitter.counters.cloneOnlyDiscontinuities === 0, jitter.discovery.clone.bisected);
  check("route JSON carries the route-map served switch", jitter.servedSwitchPx === 600 && jitter.servedSwitchSource === "route-map.pageBreakpoints");
  check("served switch is a clone sampling hint", jitter.discovery.clone.hintBoundaries.includes(600));
}

async function main(): Promise<void> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "wr-continuous-qa-"));
  const { server, base } = await serve();
  const browser = await chromium.launch();
  const started = Date.now();
  try {
    await pureTests();
    await correspondenceTest(browser, base);
    await browserScenarios(browser, base, tmp);
  } catch (err) {
    failed++;
    console.log(`  FAIL unexpected error — ${err instanceof Error ? err.stack : String(err)}`);
  } finally {
    await browser.close().catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (failed === 0) await rm(tmp, { recursive: true, force: true });
    else console.log(`  (artifacts kept in ${tmp})`);
  }
  console.log(`  runtime ${Date.now() - started} ms`);
  console.log(`${passed}/${passed + failed} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
