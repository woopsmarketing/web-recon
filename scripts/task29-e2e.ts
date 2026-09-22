import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { buildApp, startApp } from "../src/recon-template/parity-qa.js";
import { renderTemplate } from "../src/slotized-template/index.js";

/**
 * Task 29 FAST — Slotized Template end-to-end / QA harness (Phase E2).
 *
 * ONE invocation renders, builds, serves and measures the slotized template in
 * a real browser, on real routes, at both widths, in two variants:
 *
 *   DEFAULT = default content pack + default theme pack   (must reproduce the
 *             accepted reconstruction — the neutrality/S2 gate)
 *   NEW     = a different content pack + a mutated theme pack (must produce a
 *             coherent DIFFERENT site with no source identity left — S5)
 *
 * MEASUREMENT PHILOSOPHY (important, and a deliberate deviation from a naive
 * reading of the brief): this harness grades TASK 29, not Reconstruction V1.
 * Defects the accepted reconstruction already has at a given route/width
 * (horizontal overflow at 390, overlapping text, console noise from remote
 * assets that cannot load offline) are measured on the DEFAULT render and used
 * as the BASELINE. A gate fails when the slotized/injected render is WORSE
 * than that baseline, not when the baseline itself is imperfect. Absolute
 * failures (no body, no rendered nodes, HTTP error, duplicate ids introduced,
 * source identity leak) fail on their own in either variant.
 * `--strict-overflow` restores the absolute reading for overflow.
 *
 * Usage:
 *   npx tsx scripts/task29-e2e.ts [--sites rosee,channel] [--only default|new]
 *        [--skip-build] [--strict-overflow] [--out <dir>]
 *        [--rosee-run <dir>] [--channel-run <dir>] [--work <dir>]
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

interface SiteConfig {
  site: "rosee" | "channel";
  host: string;
  defaultRun: string;
  routes: string[];
  /** Brand / identity strings that must NOT survive into the NEW render. */
  brandNeedles: string[];
  /** Phase D's plain-token mutated theme draft, used when the run has none. */
  fallbackThemePack: string;
}

const SITES: SiteConfig[] = [
  {
    site: "rosee",
    host: "beomeo.roseeskin.com",
    defaultRun: "data/beomeo.roseeskin.com/slotized-templates/2026-09-12T21-31-21-048Z",
    routes: ["/17", "/34"],
    brandNeedles: ["roseeskin", "로제스킨", "로제피부과", "범어로제"],
    fallbackThemePack: "tmp/wr29/theme-packs/rosee-mutated.json",
  },
  {
    site: "channel",
    host: "channel.io",
    defaultRun: "data/channel.io/slotized-templates/2026-09-12T21-31-22-344Z",
    routes: ["/kr/pricing"],
    brandNeedles: ["channel.io", "채널톡", "channeltalk", "채널웍스"],
    fallbackThemePack: "tmp/wr29/theme-packs/channel-mutated.json",
  },
];

const WIDTHS = [390, 1440] as const;
const VIEWPORT_HEIGHT: Record<number, number> = { 390: 844, 1440: 900 };
const SETTLE_MS = 1_200;
const GOTO_TIMEOUT_MS = 60_000;
/** Full-page screenshots are capped: some of these pages are 30k px tall. */
const SCREENSHOT_MAX_HEIGHT = 18_000;

// Console/network noise that says nothing about the template layer. These
// pages reference remote CDN assets that cannot load in an offline run.
const IGNORED_CONSOLE = [
  /favicon/i,
  /net::ERR_/i,
  /failed to load resource/i,
  /err_name_not_resolved/i,
  /err_internet_disconnected/i,
  /err_connection/i,
  /downloadable font/i,
  /preload/i,
  /content security policy/i,
];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

type Verdict = "PASS" | "WARN" | "FAIL" | "not-run";

interface Finding {
  code: string;
  severity: "FAIL" | "WARN";
  where: string;
  detail: string;
}

const findings: Finding[] = [];
/** Findings are one-liners: samples carry newlines that would break the table. */
function oneLine(detail: string): string {
  return detail.replace(/\s+/gu, " ").trim();
}
function fail(code: string, where: string, detail: string): void {
  const line = oneLine(detail);
  findings.push({ code, severity: "FAIL", where, detail: line });
  console.log(`  FAIL  ${code} [${where}] ${line}`);
}
function warn(code: string, where: string, detail: string): void {
  const line = oneLine(detail);
  findings.push({ code, severity: "WARN", where, detail: line });
  console.log(`  warn  ${code} [${where}] ${line}`);
}
function ok(label: string, detail = ""): void {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function norm(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function slug(text: string): string {
  return text.replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || "root";
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

function pct(a: number, b: number): string {
  if (b === 0) return a === 0 ? "100%" : "inf";
  return `${((a / b) * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface Args {
  sites: string[];
  only: "default" | "new" | "both";
  skipBuild: boolean;
  strictOverflow: boolean;
  out: string;
  work: string;
  runOverrides: Record<string, string>;
  reviewOut: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    sites: SITES.map((s) => s.site),
    only: "both",
    skipBuild: false,
    strictOverflow: false,
    out: "docs/result/29-slotized-template/e2e",
    work: "tmp/wr29/e2e",
    runOverrides: {},
    reviewOut: "docs/result/29-slotized-template/human-review",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);
    const nextValue = (): string => {
      const value = inlineValue ?? argv[++i];
      if (!value) throw new Error(`${name} requires a value`);
      return value;
    };
    switch (name) {
      case "--sites":
        args.sites = nextValue()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "--only": {
        const value = nextValue();
        if (value !== "default" && value !== "new" && value !== "both") {
          throw new Error("--only accepts default | new | both");
        }
        args.only = value;
        break;
      }
      case "--skip-build":
        args.skipBuild = true;
        break;
      case "--strict-overflow":
        args.strictOverflow = true;
        break;
      case "--out":
        args.out = nextValue();
        break;
      case "--work":
        args.work = nextValue();
        break;
      case "--review-out":
        args.reviewOut = nextValue();
        break;
      case "--rosee-run":
        args.runOverrides["rosee"] = nextValue();
        break;
      case "--channel-run":
        args.runOverrides["channel"] = nextValue();
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  for (const site of args.sites) {
    if (!SITES.some((s) => s.site === site)) throw new Error(`Unknown site: ${site}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Template / pack resolution
// ---------------------------------------------------------------------------

interface RouteTarget {
  route: string;
  pageId: string;
  pageFile: string;
}

interface LoadedSite {
  config: SiteConfig;
  runDir: string;
  manifestFile: string;
  rootUrl: string;
  hostNeedles: string[];
  contactNeedles: string[];
  routes: RouteTarget[];
  /** slotId → pageId ("global" slots have none) */
  slotPage: Map<string, string | null>;
  slotType: Map<string, string>;
  defaultValues: Record<string, unknown>;
  reconstructionAppDir: string;
  generatedStylesRelPath: string;
}

interface PackChoice {
  contentPack: string;
  themePack: string;
  contentSource: string;
  themeSource: string;
}

async function loadSite(config: SiteConfig, runOverride: string | undefined): Promise<LoadedSite> {
  const runDir = path.resolve(REPO, runOverride ?? config.defaultRun);
  const manifestFile = path.join(runDir, "manifest.json");
  if (!(await exists(manifestFile))) throw new Error(`slotized run not found: ${manifestFile}`);
  const manifest = await readJson<{
    source: { rootUrl: string; host: string; reconstructionAppDir: string; generatedStylesRelPath: string };
  }>(manifestFile);
  const routeMap = await readJson<{
    routes: Array<{ path: string; pageFile: string; pageSourceId: string }>;
  }>(path.join(runDir, "template", "route-map.json"));

  const routes: RouteTarget[] = [];
  for (const route of config.routes) {
    const entry = routeMap.routes.find((r) => r.path === route);
    if (!entry) throw new Error(`route ${route} is not in ${config.host}'s route map`);
    routes.push({ route, pageId: entry.pageSourceId, pageFile: entry.pageFile });
  }

  const slots = await readJson<
    Array<{ id: string; type: string; pageId?: string | null; defaultValue: unknown }>
  >(path.join(runDir, "slots.json"));
  const slotPage = new Map<string, string | null>();
  const slotType = new Map<string, string>();
  for (const slot of slots) {
    slotPage.set(slot.id, slot.pageId ?? null);
    slotType.set(slot.id, slot.type);
  }
  const defaultPack = await readJson<{ slots: Record<string, unknown> }>(
    path.join(runDir, "content-packs", "default.json"),
  );

  // Source identity needles: the source host (and its bare label), every brand
  // word, and the DEFAULT pack's phone/email values.
  const host = manifest.source.host;
  const hostNeedles = new Set<string>([host]);
  const bare = host.replace(/^www\./u, "").split(".")[0];
  if (bare && bare.length >= 5) hostNeedles.add(bare);
  const contactNeedles = new Set<string>();
  for (const [slotId, value] of Object.entries(defaultPack.slots)) {
    const type = slotType.get(slotId);
    if ((type === "phone" || type === "email") && typeof value === "string") {
      const cleaned = value.replace(/^(tel:|mailto:)/u, "").trim();
      if (cleaned.length >= 5) contactNeedles.add(cleaned);
    }
  }

  return {
    config,
    runDir,
    manifestFile,
    rootUrl: manifest.source.rootUrl,
    hostNeedles: [...hostNeedles],
    contactNeedles: [...contactNeedles],
    routes,
    slotPage,
    slotType,
    defaultValues: defaultPack.slots,
    reconstructionAppDir: manifest.source.reconstructionAppDir,
    generatedStylesRelPath: manifest.source.generatedStylesRelPath,
  };
}

async function choosePacks(site: LoadedSite, variant: "default" | "new"): Promise<PackChoice> {
  const runDir = site.runDir;
  if (variant === "default") {
    return {
      contentPack: path.join(runDir, "content-packs", "default.json"),
      themePack: path.join(runDir, "theme-packs", "default.json"),
      contentSource: "content-packs/default.json",
      themeSource: "theme-packs/default.json",
    };
  }
  const realistic = path.join(runDir, "content-packs", "realistic.json");
  const mechanical = path.join(runDir, "content-packs", "mechanical.json");
  let contentPack = path.join(runDir, "content-packs", "default.json");
  let contentSource = "content-packs/default.json (FALLBACK: no realistic/mechanical pack)";
  if (await exists(realistic)) {
    contentPack = realistic;
    contentSource = "content-packs/realistic.json";
  } else if (await exists(mechanical)) {
    contentPack = mechanical;
    contentSource = "content-packs/mechanical.json (FALLBACK: no realistic pack)";
  }
  const mutated = path.join(runDir, "theme-packs", "mutated.json");
  let themePack = path.resolve(REPO, site.config.fallbackThemePack);
  let themeSource = `${site.config.fallbackThemePack} (FALLBACK: run has no theme-packs/mutated.json)`;
  if (await exists(mutated)) {
    themePack = mutated;
    themeSource = "theme-packs/mutated.json";
  } else if (!(await exists(themePack))) {
    themePack = path.join(runDir, "theme-packs", "default.json");
    themeSource = "theme-packs/default.json (FALLBACK: no mutated theme available)";
  }
  return { contentPack, themePack, contentSource, themeSource };
}

// ---------------------------------------------------------------------------
// Template text (for the S2 neutrality comparison)
// ---------------------------------------------------------------------------

interface RuntimeNode {
  k: "e" | "t";
  v?: string;
  c?: RuntimeNode[];
}

function collectTemplateText(node: RuntimeNode, out: string[]): void {
  if (node.k === "t") {
    const value = norm(node.v ?? "");
    if (value !== "") out.push(value);
    return;
  }
  for (const child of node.c ?? []) collectTemplateText(child, out);
}

async function templateTextsFor(
  site: LoadedSite,
  target: RouteTarget,
  viewport: "desktop" | "mobile",
): Promise<string[]> {
  const page = await readJson<Record<string, { doc: RuntimeNode }>>(
    path.join(site.runDir, "template", target.pageFile),
  );
  const tree = page[viewport];
  if (!tree) return [];
  const out: string[] = [];
  collectTemplateText(tree.doc, out);
  return out;
}

// ---------------------------------------------------------------------------
// In-browser measurement
// ---------------------------------------------------------------------------

interface PageMetrics {
  activeViewport: string | null;
  variantCount: number;
  hasBody: boolean;
  nodeCount: number;
  scrollWidth: number;
  innerWidth: number;
  overflowPx: number;
  docHeight: number;
  duplicateIds: number;
  duplicateIdSamples: string[];
  visibleTextLength: number;
  visibleElements: number;
  visibleText: string;
  imgCount: number;
  backgroundImageCount: number;
  brokenImgCount: number;
  overlapPairs: number;
  overlapSamples: string[];
  clippedElements: number;
  bodyColor: string;
  bodyFontFamily: string;
  headingColor: string;
  /** Per-node paint census, keyed by data-wr-node: the theme evidence. */
  paint: Array<{ id: string; c: string; b: string; f: string }>;
  sampledTextElements: number;
  neutrality: { matchedChars: number; totalChars: number; unmatchedSamples: string[] };
  leaks: {
    text: Array<{ needle: string; sample: string }>;
    externalUrl: Array<{ needle: string; sample: string }>;
    localUrl: Array<{ needle: string; sample: string }>;
  };
}

async function measure(
  page: Page,
  templateTexts: readonly string[],
  needles: readonly string[],
): Promise<PageMetrics> {
  return page.evaluate(
    (args: { templateTexts: string[]; needles: string[] }) => {
      const normalize = (text: string): string => text.replace(/\s+/gu, " ").trim();
      const variants = Array.from(document.querySelectorAll<HTMLElement>(".wr-variant"));
      const active =
        variants.find((el) => getComputedStyle(el).display !== "none") ?? variants[0] ?? null;

      const empty: PageMetricsLocal = {
        activeViewport: null,
        variantCount: variants.length,
        hasBody: document.body !== null,
        nodeCount: 0,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        overflowPx: 0,
        docHeight: document.documentElement.scrollHeight,
        duplicateIds: 0,
        duplicateIdSamples: [],
        visibleTextLength: 0,
        visibleElements: 0,
        visibleText: "",
        imgCount: 0,
        backgroundImageCount: 0,
        brokenImgCount: 0,
        overlapPairs: 0,
        overlapSamples: [],
        clippedElements: 0,
        bodyColor: "",
        bodyFontFamily: "",
        headingColor: "",
        paint: [],
        sampledTextElements: 0,
        neutrality: { matchedChars: 0, totalChars: 0, unmatchedSamples: [] },
        leaks: { text: [], externalUrl: [], localUrl: [] },
      };
      interface PageMetricsLocal {
        activeViewport: string | null;
        variantCount: number;
        hasBody: boolean;
        nodeCount: number;
        scrollWidth: number;
        innerWidth: number;
        overflowPx: number;
        docHeight: number;
        duplicateIds: number;
        duplicateIdSamples: string[];
        visibleTextLength: number;
        visibleElements: number;
        visibleText: string;
        imgCount: number;
        backgroundImageCount: number;
        brokenImgCount: number;
        overlapPairs: number;
        overlapSamples: string[];
        clippedElements: number;
        bodyColor: string;
        bodyFontFamily: string;
        headingColor: string;
        paint: Array<{ id: string; c: string; b: string; f: string }>;
        sampledTextElements: number;
        neutrality: { matchedChars: number; totalChars: number; unmatchedSamples: string[] };
        leaks: {
          text: Array<{ needle: string; sample: string }>;
          externalUrl: Array<{ needle: string; sample: string }>;
          localUrl: Array<{ needle: string; sample: string }>;
        };
      }

      // Duplicate DOM ids across the WHOLE document (both variants live in it).
      const idCounts = new Map<string, number>();
      for (const el of document.querySelectorAll("[id]")) {
        const id = el.getAttribute("id") ?? "";
        if (id === "") continue;
        idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      }
      let duplicateIds = 0;
      const duplicateIdSamples: string[] = [];
      for (const [id, count] of idCounts) {
        if (count > 1) {
          duplicateIds += count - 1;
          if (duplicateIdSamples.length < 8) duplicateIdSamples.push(`${id}×${count}`);
        }
      }

      if (active === null) {
        return { ...empty, duplicateIds, duplicateIdSamples };
      }

      const scrollWidth = document.documentElement.scrollWidth;
      const innerWidth = window.innerWidth;

      // Visible elements + text sampling in one walk.
      const elements = Array.from(active.querySelectorAll<HTMLElement>("*"));
      let visibleElements = 0;
      const textBoxes: Array<{ el: HTMLElement; x: number; y: number; w: number; h: number; t: string }> = [];
      let clippedElements = 0;
      let backgroundImageCount = 0;
      for (const el of elements) {
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        visibleElements++;
        if (style.backgroundImage !== "none" && style.backgroundImage !== "") backgroundImageCount++;
        if (
          (style.overflowX === "hidden" || style.overflow === "hidden") &&
          el.scrollWidth > el.clientWidth + 4 &&
          el.clientWidth > 0
        ) {
          clippedElements++;
        }
        if (textBoxes.length < 300) {
          let own = "";
          for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === 3) own += child.nodeValue ?? "";
          }
          const text = normalize(own);
          if (text.length >= 2) {
            textBoxes.push({
              el,
              x: rect.x + window.scrollX,
              y: rect.y + window.scrollY,
              w: rect.width,
              h: rect.height,
              t: text,
            });
          }
        }
      }

      // Severe overlap: two text boxes intersecting by > 60% of the smaller box
      // while neither contains the other.
      let overlapPairs = 0;
      const overlapSamples: string[] = [];
      for (let i = 0; i < textBoxes.length; i++) {
        const a = textBoxes[i]!;
        for (let j = i + 1; j < textBoxes.length; j++) {
          const b = textBoxes[j]!;
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ix <= 0 || iy <= 0) continue;
          const inter = ix * iy;
          const smaller = Math.min(a.w * a.h, b.w * b.h);
          if (smaller <= 0) continue;
          if (inter / smaller > 0.6) {
            overlapPairs++;
            if (overlapSamples.length < 5) {
              overlapSamples.push(`${a.t.slice(0, 28)} ⟂ ${b.t.slice(0, 28)}`);
            }
          }
        }
      }

      // Media
      const imgs = Array.from(active.querySelectorAll("img"));
      let brokenImgCount = 0;
      for (const img of imgs) if (img.naturalWidth === 0) brokenImgCount++;

      // Neutrality: every visible text run must come from the template tree.
      const templateSet = new Set(args.templateTexts);
      let matchedChars = 0;
      let totalChars = 0;
      const unmatchedSamples: string[] = [];
      if (args.templateTexts.length > 0) {
        const walker = document.createTreeWalker(active, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node !== null) {
          const parent = node.parentElement;
          const value = normalize(node.nodeValue ?? "");
          if (value !== "" && parent !== null) {
            const style = getComputedStyle(parent);
            if (style.display !== "none" && style.visibility !== "hidden") {
              totalChars += value.length;
              if (templateSet.has(value)) matchedChars += value.length;
              else if (unmatchedSamples.length < 8) unmatchedSamples.push(value.slice(0, 60));
            }
          }
          node = walker.nextNode();
        }
      }

      // Source identity leakage.
      const visibleText = (active as HTMLElement).innerText ?? "";
      const lowerText = visibleText.toLowerCase();
      const leaks: PageMetricsLocal["leaks"] = { text: [], externalUrl: [], localUrl: [] };
      const urls: string[] = [];
      for (const el of active.querySelectorAll("[href],[src],[srcset],[poster]")) {
        for (const attribute of ["href", "src", "srcset", "poster"]) {
          const value = el.getAttribute(attribute);
          if (value !== null && value !== "") urls.push(value);
        }
      }
      for (const needle of args.needles) {
        const lowerNeedle = needle.toLowerCase();
        const at = lowerText.indexOf(lowerNeedle);
        if (at !== -1) {
          leaks.text.push({ needle, sample: visibleText.slice(Math.max(0, at - 20), at + 50) });
        }
        for (const url of urls) {
          if (!url.toLowerCase().includes(lowerNeedle)) continue;
          const external = /^(https?:)?\/\//iu.test(url) || /^(mailto|tel):/iu.test(url);
          const bucket = external ? leaks.externalUrl : leaks.localUrl;
          if (bucket.length < 12 && !bucket.some((e) => e.sample === url.slice(0, 120))) {
            bucket.push({ needle, sample: url.slice(0, 120) });
          }
        }
      }

      // Theme probes. `document.body` is not a reconstructed node, and only a
      // few tokens are usually mutated, so the real evidence is a per-node
      // paint census keyed by data-wr-node — comparable across two renders of
      // the same template even when repeaters changed the item count.
      const paint: Array<{ id: string; c: string; b: string; f: string }> = [];
      for (const el of active.querySelectorAll<HTMLElement>("[data-wr-node]")) {
        if (paint.length >= 800) break;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        paint.push({
          id: el.getAttribute("data-wr-node") ?? "",
          c: style.color,
          b: style.backgroundColor,
          f: style.fontFamily,
        });
      }
      const bodyStyle = getComputedStyle(document.body);
      const headingColors = new Map<string, number>();
      for (const heading of active.querySelectorAll("h1,h2,h3,h4")) {
        const color = getComputedStyle(heading).color;
        headingColors.set(color, (headingColors.get(color) ?? 0) + 1);
      }
      let headingColor = "";
      let best = 0;
      for (const [color, count] of headingColors) {
        if (count > best) {
          best = count;
          headingColor = color;
        }
      }

      return {
        activeViewport: active.getAttribute("data-wr-viewport"),
        variantCount: variants.length,
        hasBody: document.body !== null,
        nodeCount: active.querySelectorAll("[data-wr-node]").length,
        scrollWidth,
        innerWidth,
        overflowPx: Math.max(0, scrollWidth - innerWidth),
        docHeight: document.documentElement.scrollHeight,
        duplicateIds,
        duplicateIdSamples,
        visibleTextLength: normalize(visibleText).length,
        visibleElements,
        visibleText: visibleText.slice(0, 400_000),
        imgCount: imgs.length,
        backgroundImageCount,
        brokenImgCount,
        overlapPairs,
        overlapSamples,
        clippedElements,
        bodyColor: bodyStyle.color,
        bodyFontFamily: bodyStyle.fontFamily,
        headingColor,
        paint,
        sampledTextElements: textBoxes.length,
        neutrality: { matchedChars, totalChars, unmatchedSamples },
        leaks,
      };
    },
    { templateTexts: [...new Set(templateTexts)], needles: [...needles] },
  );
}

// ---------------------------------------------------------------------------
// Per-variant run (render → build → serve → measure)
// ---------------------------------------------------------------------------

interface Observation {
  site: string;
  route: string;
  width: number;
  variant: "default" | "new";
  status: number | null;
  consoleErrors: number;
  consoleErrorSamples: string[];
  pageErrors: number;
  pageErrorSamples: string[];
  screenshot: string;
  viewportShot?: string;
  metrics: PageMetrics;
}

interface VariantResult {
  variant: "default" | "new";
  outDir: string;
  packs: PackChoice;
  render: {
    applied: number;
    skipped: number;
    failed: number;
    overrides: number;
    warnings: number;
    repeatersDriven: number;
    repeaterAdded: number;
    repeaterRemoved: number;
    repeaterReordered: number;
    duplicateIdsBaseline: number;
    duplicateIdsIntroduced: number;
    durationMs: number;
  };
  buildMs: number;
  observations: Observation[];
  stylesheetBytes: number;
  candidateStrings: Record<string, string[]>;
}

async function renderVariant(
  site: LoadedSite,
  variant: "default" | "new",
  outDir: string,
  skipRender: boolean,
): Promise<{ packs: PackChoice; render: VariantResult["render"] }> {
  const packs = await choosePacks(site, variant);
  const reportFile = path.join(outDir, "render-report.json");
  const startedAt = Date.now();
  if (skipRender && (await exists(reportFile))) {
    const report = await readJson<RenderReportLike>(reportFile);
    console.log(`[e2e] ${site.config.site}/${variant}: reusing existing render at ${outDir}`);
    return { packs, render: summarizeRender(report, 0) };
  }
  console.log(
    `[e2e] ${site.config.site}/${variant}: render content=${packs.contentSource} theme=${packs.themeSource}`,
  );
  const report = (await renderTemplate({
    templateManifestFile: site.manifestFile,
    contentPackFile: packs.contentPack,
    themePackFile: packs.themePack,
    outDir,
    log: () => {},
  })) as unknown as RenderReportLike;
  return { packs, render: summarizeRender(report, Date.now() - startedAt) };
}

interface RenderReportLike {
  applied: number;
  skipped: number;
  failed: Array<{ bindingId: string; reason: string }>;
  overrides: number;
  warnings: unknown[];
  repeaters: Array<{ id: string; key: string; added: number; removed: number; reordered: boolean }>;
  duplicateIds: { baseline: number; introduced: number };
}

function summarizeRender(report: RenderReportLike, durationMs: number): VariantResult["render"] {
  return {
    durationMs,
    applied: report.applied,
    skipped: report.skipped,
    failed: report.failed.length,
    overrides: report.overrides,
    warnings: report.warnings.length,
    repeatersDriven: report.repeaters.length,
    repeaterAdded: report.repeaters.reduce((n, r) => n + r.added, 0),
    repeaterRemoved: report.repeaters.reduce((n, r) => n + r.removed, 0),
    repeaterReordered: report.repeaters.filter((r) => r.reordered).length,
    duplicateIdsBaseline: report.duplicateIds.baseline,
    duplicateIdsIntroduced: report.duplicateIds.introduced,
  };
}

/** Distinct strings the NEW pack introduced for a page, longest first. */
function candidateStringsFor(
  site: LoadedSite,
  pack: { slots: Record<string, unknown>; repeaters?: Record<string, { items: Array<{ values: Record<string, unknown> }> }> },
  pageId: string,
): string[] {
  const out: string[] = [];
  for (const [slotId, value] of Object.entries(pack.slots)) {
    if (typeof value !== "string") continue;
    const page = site.slotPage.get(slotId);
    if (page !== null && page !== undefined && page !== pageId) continue;
    if (site.slotType.get(slotId) !== "text") continue;
    const before = site.defaultValues[slotId];
    const text = norm(value);
    if (text.length < 4 || text.length > 120) continue;
    if (typeof before === "string" && norm(before) === text) continue;
    out.push(text);
  }
  const unique = [...new Set(out)];
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 40);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(REPO, args.out);
  const shotDir = path.join(outDir, "screenshots");
  await mkdir(shotDir, { recursive: true });
  const startedAt = Date.now();
  const variants: Array<"default" | "new"> =
    args.only === "both" ? ["default", "new"] : [args.only];

  console.log(
    `[e2e] Task 29 slotized template E2E — sites ${args.sites.join(",")} · variants ${variants.join(",")}`,
  );

  let browser: Browser | null = null;
  const siteResults: Array<{ site: LoadedSite; variants: VariantResult[] }> = [];
  try {
    browser = await chromium.launch();
    for (const siteName of args.sites) {
      const config = SITES.find((s) => s.site === siteName)!;
      const site = await loadSite(config, args.runOverrides[siteName]);
      console.log(`\n== ${site.config.site} (${site.config.host}) — ${site.runDir}`);
      const results: VariantResult[] = [];
      for (const variant of variants) {
        const appDir = path.resolve(REPO, args.work, `${site.config.site}-${variant}`);
        const { packs, render } = await renderVariant(site, variant, appDir, args.skipBuild);
        console.log(
          `[e2e] ${site.config.site}/${variant}: applied ${render.applied} · failed ${render.failed} · overrides ${render.overrides} · repeaters ${render.repeatersDriven} (+${render.repeaterAdded}/-${render.repeaterRemoved}) · dup ids +${render.duplicateIdsIntroduced}`,
        );

        // Render gates
        const where = `${site.config.site}/${variant}`;
        if (variant === "default") {
          if (render.failed > 0) fail("RENDER_FAILED_BINDINGS", where, `${render.failed} failed bindings`);
          else ok(`${where} render: 0 failed bindings`, `${render.applied} applied`);
        } else {
          const ratio = render.applied > 0 ? render.failed / render.applied : 0;
          if (ratio > 0.005) {
            fail("RENDER_FAILED_BINDINGS", where, `${render.failed}/${render.applied} = ${pct(render.failed, render.applied)} > 0.5%`);
          } else ok(`${where} render: ${render.failed} failed of ${render.applied} applied (≤0.5%)`);
        }
        if (render.duplicateIdsIntroduced > 0) {
          fail("DUPLICATE_IDS_INTRODUCED", where, `${render.duplicateIdsIntroduced} introduced in render-report`);
        }

        // Build (sequential, one app at a time). The rendered app is a COPY of
        // the reconstruction app, which already carries a warm `.next` — a
        // build on top of it is incremental and could in principle re-serve a
        // cached route. Unless --skip-build was asked for, the copied build
        // output is removed so the served HTML can only come from the JSON this
        // render just wrote.
        if (!args.skipBuild) await rm(path.join(appDir, ".next"), { recursive: true, force: true });
        const buildStartedAt = Date.now();
        const buildLog: string[] = [];
        try {
          await buildApp(appDir, !args.skipBuild, (line) => {
            buildLog.push(line);
            console.log(`[e2e] ${line}`);
          });
        } catch (error) {
          const message = (error as Error).message;
          const tail = message.split("\n").slice(-40).join("\n");
          throw new Error(`next build failed for ${where} (${appDir}):\n${tail}`);
        }
        const buildMs = Date.now() - buildStartedAt;
        console.log(`[e2e] ${where}: build ${(buildMs / 1000).toFixed(1)}s`);

        const stylesheetFile = path.join(appDir, "public", "wr", "generated-styles.css");
        const stylesheetBytes = (await exists(stylesheetFile)) ? (await stat(stylesheetFile)).size : 0;

        // NEW pack candidate strings per page.
        const candidateStrings: Record<string, string[]> = {};
        if (variant === "new") {
          const pack = await readJson<{ slots: Record<string, unknown> }>(packs.contentPack);
          for (const target of site.routes) {
            candidateStrings[target.route] = candidateStringsFor(site, pack, target.pageId);
          }
        }

        const observations: Observation[] = [];
        const app = await startApp(appDir);
        try {
          console.log(`[e2e] ${where}: serving ${app.baseUrl}`);
          for (const width of WIDTHS) {
            const context = await browser.newContext({
              viewport: { width, height: VIEWPORT_HEIGHT[width] ?? 900 },
              deviceScaleFactor: 1,
            });
            // tsx/esbuild compiles this file with keepNames, which rewrites the
            // helper arrows inside page.evaluate() into `__name(fn, "fn")`.
            // That helper does not exist in the page, so define a no-op one as
            // a RAW STRING (never compiled) before anything else runs.
            await context.addInitScript({
              content: "globalThis.__name = globalThis.__name || function (f) { return f; };",
            });
            try {
              for (const target of site.routes) {
                observations.push(
                  await observeRoute(context, app.baseUrl, site, target, width, variant, shotDir),
                );
              }
            } finally {
              await context.close();
            }
          }
        } finally {
          await app.stop();
        }

        results.push({
          variant,
          outDir: appDir,
          packs,
          render,
          buildMs,
          observations,
          stylesheetBytes,
          candidateStrings,
        });
      }
      siteResults.push({ site, variants: results });
    }
  } finally {
    if (browser !== null) await browser.close();
  }

  // -------------------------------------------------------------------------
  // Gates
  // -------------------------------------------------------------------------
  const gates = await evaluateGates(siteResults, args);
  const durationMs = Date.now() - startedAt;

  const report = {
    schemaVersion: 1,
    schemaName: "task29-e2e-report-v1",
    createdAt: new Date().toISOString(),
    durationMs,
    args: {
      sites: args.sites,
      only: args.only,
      skipBuild: args.skipBuild,
      strictOverflow: args.strictOverflow,
    },
    gates,
    sites: siteResults.map(({ site, variants: results }) => ({
      site: site.config.site,
      host: site.config.host,
      runDir: path.relative(REPO, site.runDir),
      rootUrl: site.rootUrl,
      routes: site.routes.map((r) => r.route),
      variants: results.map((result) => ({
        variant: result.variant,
        outDir: path.relative(REPO, result.outDir),
        newPackSource: result.variant === "new" ? result.packs.contentSource : result.packs.contentSource,
        themePackSource: result.packs.themeSource,
        render: result.render,
        buildMs: result.buildMs,
        stylesheetBytes: result.stylesheetBytes,
        observations: result.observations.map((o) => ({
          route: o.route,
          width: o.width,
          status: o.status,
          consoleErrors: o.consoleErrors,
          consoleErrorSamples: o.consoleErrorSamples,
          pageErrors: o.pageErrors,
          pageErrorSamples: o.pageErrorSamples,
          screenshot: path.relative(outDir, o.screenshot),
          viewportShot: o.viewportShot === undefined ? undefined : path.relative(outDir, o.viewportShot),
          metrics: {
            ...o.metrics,
            // Bulk evidence stays out of the report; only its size is kept.
            visibleText: undefined,
            paint: undefined,
            paintSampledNodes: o.metrics.paint.length,
          },
        })),
      })),
    })),
    findings,
  };

  await writeFile(
    path.join(outDir, "task29-e2e-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(outDir, "task29-e2e-summary.md"), summaryMarkdown(report, siteResults), "utf8");
  await buildReviewPack(path.resolve(REPO, args.reviewOut), outDir, siteResults, gates, report);

  // -------------------------------------------------------------------------
  // Console summary (≤40 lines)
  // -------------------------------------------------------------------------
  const failures = findings.filter((f) => f.severity === "FAIL");
  const warnings = findings.filter((f) => f.severity === "WARN");
  console.log("\n================ TASK 29 E2E SUMMARY ================");
  for (const { site, variants: results } of siteResults) {
    for (const result of results) {
      const line = result.observations
        .map(
          (o) =>
            `${o.route}@${o.width}: nodes ${o.metrics.nodeCount} text ${o.metrics.visibleTextLength} ovf ${o.metrics.overflowPx}px ovl ${o.metrics.overlapPairs} img ${o.metrics.imgCount}/${o.metrics.backgroundImageCount}`,
        )
        .join(" | ");
      console.log(
        `${site.config.site}/${result.variant} build ${(result.buildMs / 1000).toFixed(0)}s · applied ${result.render.applied}/failed ${result.render.failed} · ${line}`,
      );
    }
  }
  for (const [id, gate] of Object.entries(gates)) {
    console.log(`GATE ${id}: ${gate.verdict} — ${gate.detail}`);
  }
  console.log(`findings: ${failures.length} FAIL · ${warnings.length} warn`);
  for (const failure of failures.slice(0, 10)) {
    console.log(`  FAIL ${failure.code} [${failure.where}] ${failure.detail}`);
  }
  console.log(`report: ${path.relative(REPO, path.join(outDir, "task29-e2e-report.json"))}`);
  console.log(`review: ${path.relative(REPO, path.join(path.resolve(REPO, args.reviewOut), "index.html"))}`);
  console.log(`runtime: ${(durationMs / 1000 / 60).toFixed(1)} min`);
  console.log("=====================================================");
  process.exitCode = failures.length === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Route observation
// ---------------------------------------------------------------------------

async function observeRoute(
  context: BrowserContext,
  baseUrl: string,
  site: LoadedSite,
  target: RouteTarget,
  width: number,
  variant: "default" | "new",
  shotDir: string,
): Promise<Observation> {
  const page = await context.newPage();
  const consoleErrorSamples: string[] = [];
  const pageErrorSamples: string[] = [];
  let consoleErrors = 0;
  let pageErrors = 0;
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
    consoleErrors++;
    if (consoleErrorSamples.length < 5) consoleErrorSamples.push(text.slice(0, 200));
  });
  page.on("pageerror", (error) => {
    pageErrors++;
    if (pageErrorSamples.length < 5) pageErrorSamples.push(error.message.slice(0, 200));
  });

  let status: number | null = null;
  try {
    const response = await page.goto(`${baseUrl}${target.route}`, {
      waitUntil: "load",
      timeout: GOTO_TIMEOUT_MS,
    });
    status = response?.status() ?? null;
  } catch (error) {
    warn("GOTO_TIMEOUT", `${site.config.site}/${variant} ${target.route}@${width}`, (error as Error).message.slice(0, 120));
  }
  await page.waitForTimeout(SETTLE_MS);

  const viewport = width >= 801 ? "desktop" : "mobile";
  const templateTexts =
    variant === "default" ? await templateTextsFor(site, target, viewport) : [];
  const needles =
    variant === "new"
      ? [...site.hostNeedles, ...site.config.brandNeedles, ...site.contactNeedles]
      : [];
  const metrics = await measure(page, templateTexts, needles);

  const base = `${site.config.site}-${slug(target.route)}-${width}-${variant}`;
  const screenshot = path.join(shotDir, `${base}.png`);
  const height = Math.min(metrics.docHeight || VIEWPORT_HEIGHT[width] || 900, SCREENSHOT_MAX_HEIGHT);
  try {
    await page.screenshot({
      path: screenshot,
      fullPage: true,
      // `fullPage` alone would render 30k-px-tall pages; the clip caps it
      // without falling back to a viewport-only shot.
      clip: { x: 0, y: 0, width: Math.max(width, metrics.scrollWidth), height: Math.max(height, 200) },
      animations: "disabled",
    });
  } catch (error) {
    warn("SCREENSHOT_FAILED", base, (error as Error).message.slice(0, 120));
  }
  let viewportShot: string | undefined;
  if (width === 1440) {
    viewportShot = path.join(shotDir, `${base}-viewport.png`);
    try {
      await page.screenshot({ path: viewportShot, animations: "disabled" });
    } catch {
      viewportShot = undefined;
    }
  }
  await page.close();

  return {
    site: site.config.site,
    route: target.route,
    width,
    variant,
    status,
    consoleErrors,
    consoleErrorSamples,
    pageErrors,
    pageErrorSamples,
    screenshot,
    ...(viewportShot === undefined ? {} : { viewportShot }),
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

interface Gate {
  verdict: Verdict;
  detail: string;
}

async function evaluateGates(
  siteResults: Array<{ site: LoadedSite; variants: VariantResult[] }>,
  args: Args,
): Promise<Record<string, Gate>> {
  const gates: Record<string, Gate> = {};

  // ---- S1: E1's audits -----------------------------------------------------
  const auditLines: string[] = [];
  let auditVerdict: Verdict = "not-run";
  for (const { site } of siteResults) {
    const summaryFile = path.join(site.runDir, "audits", "summary.json");
    if (!(await exists(summaryFile))) {
      auditLines.push(`${site.config.site}: audits/summary.json absent`);
      continue;
    }
    const summary = await readJson<Record<string, unknown>>(summaryFile);
    const verdict =
      (summary["verdict"] as string | undefined) ??
      (summary["status"] as string | undefined) ??
      (summary["result"] as string | undefined) ??
      "present";
    auditLines.push(`${site.config.site}: ${verdict}`);
    auditVerdict =
      /fail|blocker/iu.test(String(verdict)) ? "FAIL" : auditVerdict === "FAIL" ? "FAIL" : "PASS";
  }
  gates["S1"] =
    auditVerdict === "not-run"
      ? { verdict: "not-run", detail: `slot/coverage audit not run here (${auditLines.join("; ")})` }
      : { verdict: auditVerdict, detail: auditLines.join("; ") };

  // ---- Per-site checks -----------------------------------------------------
  const neutralityRatios: number[] = [];
  let neutralityWorst = 1;
  let themeChanged = 0;
  let themeTotal = 0;
  let defaultThemeNeutral = true;
  const themeNotes: string[] = [];
  let repeaterOk = true;
  const repeaterNotes: string[] = [];
  let newChecksRun = false;

  for (const { site, variants: results } of siteResults) {
    const byVariant = new Map(results.map((r) => [r.variant, r]));
    const def = byVariant.get("default");
    const neu = byVariant.get("new");

    // DEFAULT theme neutrality (S4 half 1): the default theme pack must add
    // nothing to the stylesheet — compare bytes against the reconstruction's.
    if (def !== undefined) {
      const sourceCss = path.join(site.reconstructionAppDir, site.generatedStylesRelPath);
      if (await exists(sourceCss)) {
        const sourceBytes = (await stat(sourceCss)).size;
        if (sourceBytes !== def.stylesheetBytes) {
          defaultThemeNeutral = false;
          fail(
            "THEME_DEFAULT_NOT_NEUTRAL",
            `${site.config.site}/default`,
            `generated-styles.css ${def.stylesheetBytes} bytes vs reconstruction ${sourceBytes}`,
          );
        } else {
          themeNotes.push(`${site.config.site}: default css ${sourceBytes} B identical`);
          ok(`${site.config.site}/default theme neutrality`, `${sourceBytes} bytes identical`);
        }
      } else {
        themeNotes.push(`${site.config.site}: reconstruction stylesheet not found, byte check skipped`);
      }
    }

    // S3: repeater safety (from the NEW render report + live dup ids).
    if (neu !== undefined) {
      newChecksRun = true;
      const r = neu.render;
      if (r.repeatersDriven === 0) {
        repeaterOk = false;
        fail(
          "REPEATER_NOT_EXERCISED",
          `${site.config.site}/new`,
          "NEW pack drove 0 repeaters — -1/+1/reorder coverage missing",
        );
      } else if (r.repeaterAdded < 1 || r.repeaterRemoved < 1 || r.repeaterReordered < 1) {
        repeaterOk = false;
        fail(
          "REPEATER_COVERAGE_INCOMPLETE",
          `${site.config.site}/new`,
          `driven ${r.repeatersDriven} but added ${r.repeaterAdded} / removed ${r.repeaterRemoved} / reordered ${r.repeaterReordered} (need ≥1 each)`,
        );
      } else {
        repeaterNotes.push(
          `${site.config.site}: ${r.repeatersDriven} driven, +${r.repeaterAdded}/-${r.repeaterRemoved}, ${r.repeaterReordered} reordered`,
        );
        ok(`${site.config.site}/new repeaters`, repeaterNotes[repeaterNotes.length - 1]!);
      }
      if (r.duplicateIdsIntroduced !== 0) repeaterOk = false;
      if (def !== undefined) {
        themeNotes.push(
          `${site.config.site}: overlay css ${neu.stylesheetBytes - def.stylesheetBytes >= 0 ? "+" : ""}${neu.stylesheetBytes - def.stylesheetBytes} B`,
        );
      }
    }

    // Per-observation checks.
    for (const result of results) {
      for (const o of result.observations) {
        const where = `${site.config.site}/${result.variant} ${o.route}@${o.width}`;
        const m = o.metrics;

        // -- render failure (absolute) --
        if (o.status !== null && o.status >= 400) fail("HTTP_STATUS", where, `status ${o.status}`);
        if (!m.hasBody) fail("NO_BODY", where, "document.body missing");
        if (m.nodeCount === 0) fail("NO_NODES", where, "active variant has 0 [data-wr-node] elements");
        const expected = o.width >= 801 ? "desktop" : "mobile";
        if (m.activeViewport !== expected) {
          warn("VARIANT_MISMATCH", where, `active variant ${m.activeViewport} at width ${o.width}`);
        }
        if (m.visibleTextLength === 0) fail("NO_TEXT", where, "active variant renders no text");
        if (o.pageErrors > 0) {
          warn("PAGE_ERROR", where, `${o.pageErrors}: ${o.pageErrorSamples.join(" | ").slice(0, 160)}`);
        }
        if (o.consoleErrors > 0) {
          warn("CONSOLE_ERROR", where, `${o.consoleErrors}: ${o.consoleErrorSamples.join(" | ").slice(0, 160)}`);
        }
      }
    }

    // Comparative checks (NEW vs DEFAULT baseline).
    if (def !== undefined) {
      for (const baseline of def.observations) {
        const where = `${site.config.site} ${baseline.route}@${baseline.width}`;
        const m = baseline.metrics;

        // S2 neutrality (DEFAULT only).
        const total = m.neutrality.totalChars;
        const ratio = total === 0 ? 0 : m.neutrality.matchedChars / total;
        neutralityRatios.push(ratio);
        neutralityWorst = Math.min(neutralityWorst, ratio);
        if (total === 0) {
          fail("NEUTRALITY_NO_TEXT", where, "no visible text nodes to compare");
        } else if (ratio < 0.95) {
          fail(
            "NEUTRALITY",
            where,
            `${(ratio * 100).toFixed(2)}% of visible text comes from the template (need ≥95%); unmatched e.g. ${m.neutrality.unmatchedSamples.slice(0, 2).join(" / ")}`,
          );
        } else if (ratio < 0.99) {
          warn("NEUTRALITY", where, `${(ratio * 100).toFixed(2)}% (target ≥99%)`);
        } else {
          ok(`${where} neutrality`, `${(ratio * 100).toFixed(2)}%`);
        }

        // Baseline overflow is a reconstruction limitation, not a T29 failure.
        if (m.overflowPx > 2) {
          if (args.strictOverflow) fail("H_OVERFLOW", `${where}/default`, `${m.overflowPx}px`);
          else warn("H_OVERFLOW_BASELINE", `${where}/default`, `${m.overflowPx}px (inherited from reconstruction)`);
        }

        if (neu === undefined) continue;
        const candidate = neu.observations.find(
          (o) => o.route === baseline.route && o.width === baseline.width,
        );
        if (candidate === undefined) continue;
        const n = candidate.metrics;
        const nWhere = `${site.config.site}/new ${baseline.route}@${baseline.width}`;

        // Overflow: worse than the baseline is the failure.
        if (n.overflowPx > m.overflowPx + 2) {
          fail("H_OVERFLOW_REGRESSION", nWhere, `${n.overflowPx}px vs baseline ${m.overflowPx}px`);
        } else if (n.overflowPx > 2) {
          warn("H_OVERFLOW_BASELINE", nWhere, `${n.overflowPx}px (baseline ${m.overflowPx}px)`);
        }

        // Duplicate ids in the live document.
        if (n.duplicateIds > m.duplicateIds) {
          fail(
            "DUPLICATE_IDS_LIVE",
            nWhere,
            `${n.duplicateIds} vs baseline ${m.duplicateIds} (${n.duplicateIdSamples.slice(0, 3).join(", ")})`,
          );
        }

        // Major content: catastrophic loss / explosion.
        const textRatio = m.visibleTextLength === 0 ? 0 : n.visibleTextLength / m.visibleTextLength;
        const elementRatio = m.visibleElements === 0 ? 0 : n.visibleElements / m.visibleElements;
        if (textRatio < 0.4 || textRatio > 2.5) {
          fail("CONTENT_VOLUME", nWhere, `visible text ${n.visibleTextLength} vs ${m.visibleTextLength} (${pct(n.visibleTextLength, m.visibleTextLength)})`);
        } else if (elementRatio < 0.4 || elementRatio > 2.5) {
          fail("ELEMENT_VOLUME", nWhere, `visible elements ${n.visibleElements} vs ${m.visibleElements} (${pct(n.visibleElements, m.visibleElements)})`);
        } else {
          ok(`${nWhere} content volume`, `text ${pct(n.visibleTextLength, m.visibleTextLength)} · elements ${pct(n.visibleElements, m.visibleElements)}`);
        }

        // NEW pack strings must actually be on screen.
        const candidates = neu.candidateStrings[baseline.route] ?? [];
        const lowerText = n.visibleText.toLowerCase();
        const present = candidates.filter((s) => lowerText.includes(s.toLowerCase()));
        if (candidates.length === 0) {
          warn("PACK_STRINGS_UNKNOWN", nWhere, "NEW pack introduced no distinct text values for this page");
        } else if (present.length < 3) {
          fail(
            "PACK_STRINGS_MISSING",
            nWhere,
            `${present.length}/${Math.min(candidates.length, 40)} NEW pack strings visible (need ≥3)`,
          );
        } else {
          ok(`${nWhere} injected strings`, `${present.length} visible, e.g. "${present[0]!.slice(0, 40)}"`);
        }

        // Source identity leakage.
        const leakText = n.leaks.text.length;
        const leakUrl = n.leaks.externalUrl.length;
        if (leakText > 0 || leakUrl > 0) {
          const samples = [...n.leaks.text, ...n.leaks.externalUrl]
            .slice(0, 3)
            .map((l) => `${l.needle}→${l.sample.slice(0, 40)}`)
            .join(" | ");
          fail("SOURCE_IDENTITY_LEAK", nWhere, `${leakText} in text, ${leakUrl} in external urls: ${samples}`);
        } else {
          ok(`${nWhere} identity`, "no source brand/host/contact strings in text or external urls");
        }
        if (n.leaks.localUrl.length > 0) {
          warn("SOURCE_IDENTITY_LOCAL_PATH", nWhere, `${n.leaks.localUrl.length} local asset paths carry a source string`);
        }

        // Media areas.
        const baseMedia = m.imgCount + m.backgroundImageCount;
        const newMedia = n.imgCount + n.backgroundImageCount;
        if (baseMedia > 0 && newMedia < baseMedia * 0.8) {
          fail("MEDIA_LOSS", nWhere, `${newMedia} media areas vs ${baseMedia} (${pct(newMedia, baseMedia)} < 80%)`);
        } else {
          ok(`${nWhere} media areas`, `${newMedia} vs ${baseMedia} (${pct(newMedia, baseMedia)})`);
        }
        if (n.brokenImgCount > 0 || m.brokenImgCount > 0) {
          warn("BROKEN_IMAGES", nWhere, `new ${n.brokenImgCount} / baseline ${m.brokenImgCount} img with naturalWidth 0`);
        }

        // Overlap / clipping.
        if (n.overlapPairs > m.overlapPairs + 3) {
          fail(
            "OVERLAP_REGRESSION",
            nWhere,
            `${n.overlapPairs} severe overlaps vs baseline ${m.overlapPairs} (+${n.overlapPairs - m.overlapPairs}); e.g. ${n.overlapSamples.slice(0, 2).join(" ; ")}`,
          );
        } else {
          ok(`${nWhere} overlap`, `${n.overlapPairs} vs baseline ${m.overlapPairs}`);
        }
        if (n.clippedElements > m.clippedElements + 5) {
          warn("CLIPPING", nWhere, `${n.clippedElements} clipped vs baseline ${m.clippedElements}`);
        }

        // Theme applied: compare the per-node paint census of the two renders
        // on the nodes they share (data-wr-node is stable across renders).
        themeTotal++;
        const basePaint = new Map(m.paint.map((p) => [p.id, p]));
        let compared = 0;
        let repainted = 0;
        let colorChanged = false;
        let fontChanged = false;
        for (const entry of n.paint) {
          const before = basePaint.get(entry.id);
          if (before === undefined) continue;
          compared++;
          if (entry.c !== before.c || entry.b !== before.b) {
            repainted++;
            colorChanged = true;
          } else if (entry.f !== before.f) {
            repainted++;
          }
          if (entry.f !== before.f) fontChanged = true;
        }
        if (repainted > 0) {
          themeChanged++;
          themeNotes.push(
            `${site.config.site} ${baseline.route}@${baseline.width}: ${repainted}/${compared} nodes repainted (color ${colorChanged}, font ${fontChanged})`,
          );
        } else {
          themeNotes.push(
            `${site.config.site} ${baseline.route}@${baseline.width}: NOTHING changed over ${compared} shared nodes`,
          );
        }
      }
    }
  }

  // ---- Gate roll-up --------------------------------------------------------
  gates["S2"] =
    neutralityRatios.length === 0
      ? { verdict: "not-run", detail: "DEFAULT variant not rendered" }
      : {
          verdict: neutralityWorst >= 0.95 ? (neutralityWorst >= 0.99 ? "PASS" : "WARN") : "FAIL",
          detail: `default render text provenance worst ${(neutralityWorst * 100).toFixed(2)}% over ${neutralityRatios.length} measurements (FAIL <95%, target ≥99%)`,
        };

  const dupIntroduced = siteResults.some(({ variants: v }) =>
    v.some((r) => r.render.duplicateIdsIntroduced > 0),
  );
  gates["S3"] = !newChecksRun
    ? { verdict: "not-run", detail: "NEW variant not rendered" }
    : {
        verdict: repeaterOk && !dupIntroduced ? "PASS" : "FAIL",
        detail: `${repeaterNotes.join("; ") || "no repeater coverage"} · duplicate ids introduced ${dupIntroduced ? ">0" : "0"}`,
      };

  if (!newChecksRun) {
    gates["S4"] = {
      verdict: defaultThemeNeutral ? "WARN" : "FAIL",
      detail: `default theme neutrality ${defaultThemeNeutral ? "PASS" : "FAIL"}; mutated theme not rendered (${themeNotes.slice(0, 2).join("; ")})`,
    };
  } else {
    const applied = themeTotal > 0 && themeChanged === themeTotal;
    if (themeTotal > 0 && themeChanged === 0) {
      fail("THEME_NOT_APPLIED", "new", "no measured color or font-family changed under the mutated theme pack");
    } else if (themeTotal > 0 && themeChanged < themeTotal) {
      warn("THEME_PARTIAL", "new", `${themeChanged}/${themeTotal} measurements show a paint change`);
    }
    gates["S4"] = {
      verdict: defaultThemeNeutral && themeChanged > 0 ? (applied ? "PASS" : "WARN") : "FAIL",
      detail: `default theme adds 0 bytes: ${defaultThemeNeutral}; mutated theme visible on ${themeChanged}/${themeTotal} measurements — ${themeNotes.join("; ")}`,
    };
  }

  const newFailCodes = new Set([
    "HTTP_STATUS",
    "NO_BODY",
    "NO_NODES",
    "NO_TEXT",
    "H_OVERFLOW_REGRESSION",
    "DUPLICATE_IDS_LIVE",
    "CONTENT_VOLUME",
    "ELEMENT_VOLUME",
    "PACK_STRINGS_MISSING",
    "SOURCE_IDENTITY_LEAK",
    "MEDIA_LOSS",
    "OVERLAP_REGRESSION",
    "RENDER_FAILED_BINDINGS",
  ]);
  const newFailures = findings.filter(
    (f) => f.severity === "FAIL" && newFailCodes.has(f.code) && f.where.includes("new"),
  );
  gates["S5"] = !newChecksRun
    ? { verdict: "not-run", detail: "NEW variant not rendered" }
    : {
        verdict: newFailures.length === 0 ? "PASS" : "FAIL",
        detail:
          newFailures.length === 0
            ? "every NEW-render check passed (render, overflow, ids, content volume, injected strings, identity, media, overlap)"
            : newFailures.map((f) => `${f.code}@${f.where}`).join("; "),
      };

  return gates;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

function summaryMarkdown(
  report: { gates: Record<string, Gate>; durationMs: number; createdAt: string },
  siteResults: Array<{ site: LoadedSite; variants: VariantResult[] }>,
): string {
  const lines: string[] = [];
  lines.push("# Task 29 — Slotized Template E2E");
  lines.push("");
  lines.push(`Generated ${report.createdAt} · runtime ${(report.durationMs / 1000 / 60).toFixed(1)} min`);
  lines.push("");
  lines.push("## Gates");
  lines.push("");
  lines.push("| gate | verdict | detail |");
  lines.push("| --- | --- | --- |");
  for (const [id, gate] of Object.entries(report.gates)) {
    lines.push(`| ${id} | **${gate.verdict}** | ${gate.detail.replace(/\|/gu, "\\|")} |`);
  }
  lines.push("");
  lines.push("## Measurements");
  lines.push("");
  lines.push(
    "| site | variant | route | width | nodes | visible text | elements | overflow px | overlap | img/bg | broken img | dup ids | text from template |",
  );
  lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const { site, variants: results } of siteResults) {
    for (const result of results) {
      for (const o of result.observations) {
        const m = o.metrics;
        const neutrality =
          m.neutrality.totalChars === 0
            ? "—"
            : `${((m.neutrality.matchedChars / m.neutrality.totalChars) * 100).toFixed(2)}%`;
        lines.push(
          `| ${site.config.site} | ${result.variant} | ${o.route} | ${o.width} | ${m.nodeCount} | ${m.visibleTextLength} | ${m.visibleElements} | ${m.overflowPx} | ${m.overlapPairs} | ${m.imgCount}/${m.backgroundImageCount} | ${m.brokenImgCount} | ${m.duplicateIds} | ${neutrality} |`,
        );
      }
    }
  }
  lines.push("");
  lines.push("## Renders");
  lines.push("");
  lines.push("| site | variant | content pack | theme pack | applied | failed | overrides | repeaters | +items | -items | reordered | dup ids introduced | build s |");
  lines.push("| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const { site, variants: results } of siteResults) {
    for (const r of results) {
      lines.push(
        `| ${site.config.site} | ${r.variant} | ${r.packs.contentSource} | ${r.packs.themeSource} | ${r.render.applied} | ${r.render.failed} | ${r.render.overrides} | ${r.render.repeatersDriven} | ${r.render.repeaterAdded} | ${r.render.repeaterRemoved} | ${r.render.repeaterReordered} | ${r.render.duplicateIdsIntroduced} | ${(r.buildMs / 1000).toFixed(0)} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  if (findings.length === 0) lines.push("None.");
  for (const finding of findings) {
    lines.push(`- **${finding.severity}** \`${finding.code}\` [${finding.where}] ${finding.detail}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

/** Self-contained human review pack: DEFAULT vs NEW, per route × width. */
async function buildReviewPack(
  reviewDir: string,
  e2eDir: string,
  siteResults: Array<{ site: LoadedSite; variants: VariantResult[] }>,
  gates: Record<string, Gate>,
  report: { createdAt: string },
): Promise<void> {
  const imageDir = path.join(reviewDir, "images");
  // Reset: a pack must never show a screenshot from an earlier, partial run.
  await rm(imageDir, { recursive: true, force: true });
  await mkdir(imageDir, { recursive: true });

  const escape = (text: string): string =>
    text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");

  interface Row {
    site: string;
    route: string;
    width: number;
    def?: Observation;
    neu?: Observation;
  }
  const rows: Row[] = [];
  for (const { site, variants: results } of siteResults) {
    const def = results.find((r) => r.variant === "default");
    const neu = results.find((r) => r.variant === "new");
    for (const target of site.routes) {
      for (const width of WIDTHS) {
        rows.push({
          site: site.config.site,
          route: target.route,
          width,
          ...(def === undefined
            ? {}
            : { def: def.observations.find((o) => o.route === target.route && o.width === width) }),
          ...(neu === undefined
            ? {}
            : { neu: neu.observations.find((o) => o.route === target.route && o.width === width) }),
        });
      }
    }
  }

  const copyShot = async (observation: Observation | undefined): Promise<string | null> => {
    if (observation === undefined) return null;
    if (!(await exists(observation.screenshot))) return null;
    const name = path.basename(observation.screenshot);
    await cp(observation.screenshot, path.join(imageDir, name));
    return `images/${name}`;
  };

  const sections: string[] = [];
  for (const row of rows) {
    const defShot = await copyShot(row.def);
    const neuShot = await copyShot(row.neu);
    const stat = (observation: Observation | undefined): string => {
      if (observation === undefined) return '<p class="meta">not rendered</p>';
      const m = observation.metrics;
      return `<p class="meta">nodes ${m.nodeCount} · visible text ${m.visibleTextLength} chars · elements ${m.visibleElements} · media ${m.imgCount}img/${m.backgroundImageCount}bg · overflow ${m.overflowPx}px · overlaps ${m.overlapPairs} · dup ids ${m.duplicateIds}</p>`;
    };
    const pane = (src: string | null, label: string, observation: Observation | undefined): string =>
      `<figure><figcaption>${label}</figcaption>${stat(observation)}${
        src === null ? '<p class="meta">no screenshot</p>' : `<div class="pane"><img src="${src}" alt="${label}" loading="lazy"></div>`
      }</figure>`;
    sections.push(
      `<article class="pair"><header><h3>${escape(row.site)} <code>${escape(row.route)}</code></h3><span class="w">${row.width}px</span></header>
<div class="cmp">${pane(defShot, "DEFAULT (default content + default theme)", row.def)}${pane(neuShot, "NEW (new content + mutated theme)", row.neu)}</div></article>`,
    );
  }

  const gateRows = Object.entries(gates)
    .map(([id, gate]) => `<tr><td>${id}</td><td class="v v-${gate.verdict.toLowerCase().replace(/[^a-z]/gu, "")}">${gate.verdict}</td><td>${escape(gate.detail)}</td></tr>`)
    .join("");
  const failCount = findings.filter((f) => f.severity === "FAIL").length;
  const warnCount = findings.filter((f) => f.severity === "WARN").length;
  const findingList = findings
    .slice(0, 60)
    .map((f) => `<li><b class="s-${f.severity.toLowerCase()}">${f.severity}</b> <code>${escape(f.code)}</code> [${escape(f.where)}] ${escape(f.detail)}</li>`)
    .join("");

  const doc = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Task 29 — Slotized Template human review</title>
<style>
:root { --bg:#fff; --fg:#16181d; --mut:#6b7280; --line:#e4e6eb; --b:#b91c1c; --m:#b45309; --p:#047857; }
* { box-sizing:border-box }
body { margin:0; font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--fg); background:var(--bg) }
.wrap { max-width:1500px; margin:0 auto; padding:24px }
h1 { font-size:22px; margin:0 0 4px }
h2 { font-size:19px; margin:34px 0 6px; padding-top:12px; border-top:2px solid var(--line) }
h3 { font-size:15px; margin:0; font-weight:600 }
.sub { color:var(--mut); margin:0 0 18px }
.instr { background:#f7f8fa; border:1px solid var(--line); border-radius:8px; padding:14px 18px; margin:16px 0 }
.meta { margin:2px 0 8px; color:var(--mut); font-size:12.5px }
article.pair { border:1px solid var(--line); border-radius:8px; padding:12px; margin:14px 0 }
article.pair > header { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:6px }
.w { color:var(--mut); font-weight:500 }
code { font:12px ui-monospace,SFMono-Regular,Menlo,monospace; background:#f3f4f6; padding:1px 4px; border-radius:3px }
.cmp { display:grid; grid-template-columns:1fr 1fr; gap:10px }
.cmp figure { margin:0; min-width:0 }
figcaption { font-size:11.5px; font-weight:700; letter-spacing:.03em; color:var(--mut); margin-bottom:4px }
.pane { height:72vh; overflow:auto; border:1px solid var(--line); border-radius:5px; background:#fafafa }
.pane img { display:block; width:100%; height:auto }
@media (max-width:900px) { .cmp { grid-template-columns:1fr } .pane { height:50vh } }
table.sum { border-collapse:collapse; width:100%; margin:14px 0 8px; font-size:13px }
table.sum th, table.sum td { border:1px solid var(--line); padding:6px 9px; text-align:left; vertical-align:top }
table.sum th { background:#f7f8fa; font-weight:600 }
.v { font-weight:700 } .v-pass { color:var(--p) } .v-fail { color:var(--b) } .v-warn { color:var(--m) } .v-notrun { color:var(--mut) }
ul.findings { font-size:13px } b.s-fail { color:var(--b) } b.s-warn { color:var(--m) }
</style></head><body><div class="wrap">
<h1>Task 29 — Slotized Template: DEFAULT vs NEW</h1>
<p class="sub">Generated ${escape(report.createdAt)} · ${rows.length} route×width pairs · ${failCount} FAIL · ${warnCount} warn · every number below is measured in a real Chromium against a real <code>next start</code> of the rendered app.</p>
<div class="instr">
<p><b>Left = DEFAULT.</b> The default content pack + default theme pack. It must be indistinguishable from the accepted reconstruction: this is the template proving it can reproduce what it came from.</p>
<p><b>Right = NEW.</b> A different content pack + a mutated theme pack, with repeater items added, removed and reordered. Ask: does this read as a coherent, professionally designed site — not the source site, and not a broken one? Is anything major missing or overlapping? Is any source brand, phone number or hostname still visible?</p>
<p><b>Do not grade:</b> remote images that could not load offline (they render as empty boxes in BOTH columns), 1–2px differences, font anti-aliasing.</p>
</div>
<h2 style="border:0">Gates</h2>
<table class="sum"><thead><tr><th>gate</th><th>verdict</th><th>detail</th></tr></thead><tbody>${gateRows}</tbody></table>
<h2>Findings</h2>
<ul class="findings">${findingList || "<li>None.</li>"}</ul>
<h2>Pairs</h2>
${sections.join("\n")}
</div></body></html>
`;
  await writeFile(path.join(reviewDir, "index.html"), doc, "utf8");
  const imageCount = (await readdir(imageDir)).length;
  console.log(`[e2e] review pack: ${path.relative(REPO, reviewDir)}/index.html (${imageCount} images)`);
  void e2eDir;
}

main().catch((error: unknown) => {
  console.error(`[e2e] ${(error as Error).message ?? error}`);
  process.exitCode = 1;
});
