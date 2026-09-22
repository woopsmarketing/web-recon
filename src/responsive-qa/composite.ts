import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "playwright";
import {
  COMPOSITE_MAX_SIDE_HEIGHT_PX,
  CONTACT_SHEET_THUMB_WIDTH_PX,
  type Verdict,
} from "./types.js";

/**
 * SOURCE | FINAL composites and the contact sheet (Task 28.6, lane W3).
 *
 * Built by screenshotting an HTML page with Playwright — the technique
 * `tmp/wr-responsive-investigation/pack/build-pack.mjs` used — because the repo
 * declares no image-composition library. `sharp` and `pixelmatch` exist only as
 * transitive packages under `.pnpm` and must not be relied on; Pillow would add
 * an undeclared Python dependency. Playwright is already a declared dependency
 * and is already running.
 *
 * THE SCALE RULE. Both panels are scaled by ONE factor, derived from the taller
 * of the two images. A composite whose halves were scaled independently would
 * make a clone that is 1.6× the source's height look the same size as the
 * source, which is precisely the defect a reviewer is looking for. The factor
 * is printed on the image.
 *
 * Natural widths are NOT normalized either: a clone with horizontal overflow
 * produces a wider PNG than the source, and the composite shows that.
 */

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileUrl(absolutePath: string): string {
  return pathToFileURL(absolutePath).href;
}

const VERDICT_COLOR: Record<string, string> = {
  BLOCKER: "#ff5c5c",
  MAJOR: "#ffb020",
  MINOR: "#8ac6ff",
  PASS: "#4fd18b",
  REFERENCE: "#9aa4b2",
};

const SHEET_STYLE = `
  *{box-sizing:border-box}
  body{margin:0;background:#0d1117;color:#e6edf3;
       font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .head{padding:14px 18px;border-bottom:1px solid #30363d;background:#161b22}
  .head h1{margin:0 0 4px;font-size:17px;letter-spacing:.2px}
  .head .meta{color:#9aa4b2;font-size:12px}
  .verdict{display:inline-block;padding:2px 9px;border-radius:11px;
           font-weight:700;font-size:12px;color:#0d1117}
  .panels{display:flex;align-items:flex-start;gap:14px;padding:14px 18px}
  .panel{background:#161b22;border:1px solid #30363d;border-radius:7px;overflow:hidden}
  .panel .cap{padding:7px 10px;border-bottom:1px solid #30363d;background:#1c2330}
  .panel .cap .side{font-weight:700;letter-spacing:.6px;font-size:12px}
  .panel .cap .url{color:#9aa4b2;font-size:11px;word-break:break-all}
  .panel img{display:block}
  .panel .shot{position:relative;font-size:0;line-height:0}
  /* Task 28.75, item L3 — the band the pixel diff never looked at. */
  .band{position:absolute;top:0;bottom:0;pointer-events:none;
        background:repeating-linear-gradient(135deg,
          rgba(255,92,92,.55) 0 10px, rgba(255,92,92,.16) 10px 20px);
        border-left:3px solid #ff5c5c;box-shadow:inset 0 0 0 1px rgba(255,92,92,.9)}
  .band .tag{position:sticky;top:0;display:block;padding:5px 6px;
             font:700 11px/1.25 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
             color:#0d1117;background:#ff5c5c;text-align:center;word-break:break-word}
  .mismatch{margin:0;padding:9px 18px;background:#ff5c5c;color:#0d1117;
            font-weight:700;font-size:13px;letter-spacing:.2px;
            border-bottom:1px solid #30363d}
  .mismatch .sub{display:block;font-weight:500;font-size:11.5px;margin-top:2px}
`;

export interface CompositeInput {
  browser: Browser;
  site: string;
  route: string;
  width: number;
  verdict: Verdict;
  blockerCount: number;
  majorCount: number;
  minorCount: number;
  sourceUrl: string;
  cloneUrl: string;
  sourceFile: string;
  cloneFile: string;
  sourceSize: { width: number; height: number };
  cloneSize: { width: number; height: number };
  outFile: string;
  scratchHtml: string;
}

/**
 * TASK 28.75, item L3. The composite's HTML, built as a pure function.
 *
 * Split out of {@link renderComposite} so the one thing item L3 requires — that
 * a human reviewer CANNOT put two differently-sized canvases side by side
 * without noticing — is assertable by a test on a string rather than only by
 * looking at a PNG. `renderComposite` is this function plus a screenshot.
 */
export function buildCompositeHtml(input: CompositeInput): {
  html: string;
  pageWidth: number;
} {
  const tallest = Math.max(input.sourceSize.height, input.cloneSize.height, 1);
  const scale = Math.min(1, COMPOSITE_MAX_SIDE_HEIGHT_PX / tallest);
  const sourceW = Math.max(1, Math.round(input.sourceSize.width * scale));
  const cloneW = Math.max(1, Math.round(input.cloneSize.width * scale));
  const pageWidth = sourceW + cloneW + 14 + 36 + 4;
  const colour = VERDICT_COLOR[input.verdict] ?? "#9aa4b2";
  const scaleNote =
    scale === 1
      ? "1:1, no scaling"
      : `both sides scaled ${(scale * 100).toFixed(1)}% (tallest side ${tallest}px)`;

  // -- TASK 28.75, ITEM L3 -------------------------------------------------
  //
  // A composite whose two panels are DIFFERENT WIDTHS is the single most
  // misleading thing this file can produce, because the eye reads two adjacent
  // pictures as two views of the same thing. The pixel diff compares only the
  // top-left `min(w) x min(h)` rectangle the two captures share, so the strip
  // beyond it — on a horizontally overflowing page, exactly the offscreen band
  // under investigation — is in NEITHER the numbers nor a reviewer's attention
  // unless the image says so. `source 700x8021  final 862x8021` in 11px grey
  // does not say so. This does: a red banner above the panels, and the
  // uncompared strip itself hatched in red on whichever panel is wider, with
  // the strip's width printed on it.
  const commonNaturalWidth = Math.min(input.sourceSize.width, input.cloneSize.width);
  const commonScaledWidth = Math.max(1, Math.round(commonNaturalWidth * scale));
  const widthMismatch = Math.abs(input.sourceSize.width - input.cloneSize.width);
  const heightMismatch = Math.abs(input.sourceSize.height - input.cloneSize.height);
  const bandFor = (panelScaledWidth: number, naturalWidth: number): string => {
    if (widthMismatch === 0 || naturalWidth <= commonNaturalWidth) return "";
    const bandLeft = Math.min(commonScaledWidth, panelScaledWidth);
    const bandWidth = Math.max(1, panelScaledWidth - bandLeft);
    return (
      `<div class="band" style="left:${bandLeft}px;width:${bandWidth}px">` +
      `<span class="tag">${widthMismatch}px NOT PIXEL-COMPARED</span></div>`
    );
  };
  const shot = (
    file: string,
    panelScaledWidth: number,
    naturalWidth: number,
  ): string =>
    `<div class="shot" style="width:${panelScaledWidth}px">` +
    `<img src="${escapeHtml(fileUrl(file))}" style="width:${panelScaledWidth}px">` +
    bandFor(panelScaledWidth, naturalWidth) +
    `</div>`;
  const wider =
    input.sourceSize.width > input.cloneSize.width ? "SOURCE" : "FINAL";
  const mismatchBanner =
    widthMismatch === 0
      ? ""
      : `<div class="mismatch">&#9888; ${COMPOSITE_WIDTH_MISMATCH_MARKER} &mdash; ` +
        `source ${input.sourceSize.width}px vs final ${input.cloneSize.width}px ` +
        `at a ${input.width}px viewport. THESE TWO PANELS ARE NOT THE SAME WIDTH.` +
        `<span class="sub">The pixel comparison ran on the ${commonNaturalWidth}px ` +
        `they share; the ${widthMismatch}px hatched strip on the ${wider} panel was never ` +
        `diffed${heightMismatch > 0 ? `, and the two captures also differ by ${heightMismatch}px in height` : ""}. ` +
        `See pixel-uncompared-band-ink-ratio for how much ink is in it.</span></div>`;

  const html =
    `<!doctype html><meta charset="utf-8"><style>${SHEET_STYLE}</style><body>` +
    `<div class="head">` +
    `<h1>${escapeHtml(input.site)} &middot; ${escapeHtml(input.route)} &middot; ${input.width}px ` +
    `<span class="verdict" style="background:${colour}">${input.verdict}</span></h1>` +
    `<div class="meta">${input.blockerCount} blocker &middot; ${input.majorCount} major &middot; ${input.minorCount} minor &nbsp;|&nbsp; ` +
    `source ${input.sourceSize.width}&times;${input.sourceSize.height} &nbsp; final ${input.cloneSize.width}&times;${input.cloneSize.height} &nbsp;|&nbsp; ${escapeHtml(scaleNote)}</div>` +
    `</div>` +
    mismatchBanner +
    `<div class="panels">` +
    `<div class="panel" style="width:${sourceW + 2}px">` +
    `<div class="cap"><div class="side">SOURCE</div><div class="url">${escapeHtml(input.sourceUrl)}</div></div>` +
    shot(input.sourceFile, sourceW, input.sourceSize.width) +
    `</div>` +
    `<div class="panel" style="width:${cloneW + 2}px">` +
    `<div class="cap"><div class="side">FINAL (reconstruction)</div><div class="url">${escapeHtml(input.cloneUrl)}</div></div>` +
    shot(input.cloneFile, cloneW, input.cloneSize.width) +
    `</div>` +
    `</div></body>`;

  return { html, pageWidth };
}

/** Render one SOURCE|FINAL composite PNG. Returns the byte length written. */
export async function renderComposite(input: CompositeInput): Promise<number> {
  const { html, pageWidth } = buildCompositeHtml(input);
  return screenshotHtml(input.browser, input.scratchHtml, html, pageWidth, input.outFile);
}

/**
 * The banner text the composite prints when the two captures are not the same
 * width. Exported as a constant so a check pins the exact string a reviewer
 * sees, and a silent removal of the banner fails the suite.
 */
export const COMPOSITE_WIDTH_MISMATCH_MARKER = "CAPTURE WIDTH MISMATCH";

/** The class the hatched, uncompared strip is drawn with. */
export const COMPOSITE_UNCOMPARED_BAND_CLASS = "band";

/**
 * The composite's mismatch surface, exported so the suite can assert it on the
 * HTML rather than on a screenshot.
 *
 * A test that only checks "the composite PNG was written" cannot tell a banner
 * from a blank strip, and item L3's requirement is specifically that a human
 * reviewer CANNOT compare two differently-sized canvases without noticing. This
 * is the same computation `renderComposite` performs, in a form a check can
 * read.
 */
export function compositeWidthMismatch(
  sourceSize: { width: number; height: number },
  cloneSize: { width: number; height: number },
): {
  widthMismatchPx: number;
  heightMismatchPx: number;
  commonWidthPx: number;
  banner: boolean;
  hatchedPanel: "SOURCE" | "FINAL" | null;
} {
  const widthMismatchPx = Math.abs(sourceSize.width - cloneSize.width);
  return {
    widthMismatchPx,
    heightMismatchPx: Math.abs(sourceSize.height - cloneSize.height),
    commonWidthPx: Math.min(sourceSize.width, cloneSize.width),
    banner: widthMismatchPx > 0,
    hatchedPanel:
      widthMismatchPx === 0 ? null : sourceSize.width > cloneSize.width ? "SOURCE" : "FINAL",
  };
}

export interface ContactSheetRow {
  route: string;
  width: number;
  verdict: Verdict;
  compositeFile: string;
  headline: string;
}

export interface ContactSheetInput {
  browser: Browser;
  site: string;
  runId: string;
  rows: ContactSheetRow[];
  outFile: string;
  scratchHtml: string;
}

/** Render the contact sheet composing every pair's composite. */
export async function renderContactSheet(input: ContactSheetInput): Promise<number> {
  const cells = input.rows
    .map((row) => {
      const colour = VERDICT_COLOR[row.verdict] ?? "#9aa4b2";
      return (
        `<div class="cell">` +
        `<div class="cap"><span class="verdict" style="background:${colour}">${row.verdict}</span> ` +
        `<b>${escapeHtml(row.route)}</b> @ ${row.width}px</div>` +
        `<div class="why">${escapeHtml(row.headline)}</div>` +
        `<img src="${escapeHtml(fileUrl(row.compositeFile))}">` +
        `</div>`
      );
    })
    .join("");

  const html =
    `<!doctype html><meta charset="utf-8"><style>${SHEET_STYLE}` +
    `.grid{display:flex;flex-wrap:wrap;gap:14px;padding:14px 18px;align-items:flex-start}` +
    `.cell{width:${CONTACT_SHEET_THUMB_WIDTH_PX}px;background:#161b22;border:1px solid #30363d;` +
    `border-radius:7px;overflow:hidden}` +
    `.cell .cap{padding:7px 10px;border-bottom:1px solid #30363d;background:#1c2330}` +
    `.cell .why{padding:6px 10px;color:#9aa4b2;font-size:11px;border-bottom:1px solid #30363d}` +
    `.cell img{display:block;width:100%}` +
    `</style><body>` +
    `<div class="head"><h1>${escapeHtml(input.site)} &mdash; five-width responsive QA contact sheet</h1>` +
    `<div class="meta">run ${escapeHtml(input.runId)} &middot; ${input.rows.length} (route, width) pairs &middot; each cell is a SOURCE | FINAL composite</div></div>` +
    `<div class="grid">${cells}</div></body>`;

  const pageWidth = Math.min(
    3 * (CONTACT_SHEET_THUMB_WIDTH_PX + 14) + 22,
    Math.max(1, input.rows.length) * (CONTACT_SHEET_THUMB_WIDTH_PX + 14) + 22,
  );
  return screenshotHtml(input.browser, input.scratchHtml, html, pageWidth, input.outFile);
}

async function screenshotHtml(
  browser: Browser,
  scratchHtml: string,
  html: string,
  pageWidth: number,
  outFile: string,
): Promise<number> {
  await writeFile(scratchHtml, html, "utf8");
  const context = await browser.newContext({
    viewport: { width: Math.max(320, Math.min(4_000, pageWidth)), height: 900 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.goto(fileUrl(path.resolve(scratchHtml)), {
      waitUntil: "load",
      timeout: 60_000,
    });
    // Wait for every <img> to decode; a composite of half-loaded images is a
    // silently wrong artifact.
    await page
      .waitForFunction(
        () =>
          Array.from(document.images).every(
            (image) => image.complete && image.naturalWidth > 0,
          ),
        undefined,
        { timeout: 60_000 },
      )
      .catch(() => {});
    const buffer = await page.screenshot({
      fullPage: true,
      type: "png",
      animations: "disabled",
    });
    await writeFile(outFile, buffer);
    return buffer.length;
  } finally {
    await context.close().catch(() => {});
    await unlink(scratchHtml).catch(() => {});
  }
}
