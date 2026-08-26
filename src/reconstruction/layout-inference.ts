import type { ElementSpecNode, PageSpec } from "../sitespec/index.js";

/**
 * Deterministic layout-rule inference (Task 17 §9) and its generated CSS tier
 * (§10).
 *
 * The exact-computed CSS is correct at the observed viewport and silently
 * wrong at every other one: a centered container arrives as
 * `width: 1080px; margin-left: 180px`, so at 1920px the clone is left-biased
 * where the original stays centered. This module re-derives the RESPONSIVE
 * meaning of a box from two observed evidence channels:
 *
 *   - the multi-width layout probe (§8): the same element's x/width at
 *     390/768/1024/1440/1920, with DOM-identity across widths;
 *   - the authored layout declarations (§7), used as supporting evidence.
 *
 * Rules are conjunctions of exact measurements with fixed pixel tolerances —
 * there is no similarity score and no AI anywhere. A node that satisfies no
 * rule keeps its exact computed style untouched (§10: recovery failing must
 * never fail the page), and every emitted rule must REPRODUCE the observed
 * truth-viewport geometry, so the 1440px rendering cannot regress by
 * construction.
 *
 * Priority is encoded in specificity, not order:
 *   1. recovered rule      `[data-wr-page][data-wr-viewport] [data-wr-node]`
 *                          (0,3,0) — beats the exact class
 *   2. observed responsive `@media`-wrapped rules at the same specificity
 *   3. exact computed      `.wr-stXXXXXX` (0,1,0) — the unchanged fallback
 */

/** Tolerances and gates. Global constants, never per-site tuning. */
export const CENTER_GAP_TOLERANCE_PX = 2;
export const WIDTH_CONSTANT_TOLERANCE_PX = 1;
export const FULL_WIDTH_TOLERANCE_PX = 2;
export const TRUTH_SANITY_TOLERANCE_PX = 4;
export const PARENT_GROWTH_MIN_PX = 40;
export const PERCENTAGE_RATIO_TOLERANCE = 0.01;
export const TRUTH_WIDTH = 1440;

export type RecoveredRuleKind =
  | "centered-max-width"
  | "full-width"
  | "percentage-width"
  | "responsive-hidden";

export interface RecoveredLayoutRule {
  pageId: string;
  nodeId: string;
  kind: RecoveredRuleKind;
  declarations: Record<string, string>;
  /** Present for responsive-hidden rules (the @media condition). */
  media?: string;
  /** Named measurements the rule stood on. */
  evidence: string[];
}

export interface LayoutInferenceCounters {
  pagesWithAlignedProbe: number;
  nodesWithProbe: number;
  centered: number;
  fullWidth: number;
  percentage: number;
  responsiveHidden: number;
}

export interface LayoutInferenceResult {
  rules: RecoveredLayoutRule[];
  css: string;
  counters: LayoutInferenceCounters;
}

export interface InferLayoutInput {
  pages: readonly PageSpec[];
  /** styleTokenId → computed properties (for the display gate). */
  styleLookup: (styleTokenId: string) => Readonly<Record<string, string>> | undefined;
  /** The generated breakpoint — only widths at/above it drive desktop rules. */
  breakpoint: number;
}

const BLOCKISH_DISPLAY = new Set(["block", "flex", "grid", "flow-root", "table"]);

/** `12px` → 12; anything else → undefined. */
function parsePx(value: string | undefined): number | undefined {
  if (value === undefined) return 0; // computed padding absent means 0
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

/** The node's horizontal padding from its exact computed style, in px. */
function horizontalPadding(
  node: ElementSpecNode | undefined,
  styleLookup: InferLayoutInput["styleLookup"],
): number | undefined {
  if (!node?.styleTokenId) return 0;
  const props = styleLookup(node.styleTokenId);
  if (!props) return 0;
  const left = parsePx(props["padding-left"]);
  const right = parsePx(props["padding-right"]);
  if (left === undefined || right === undefined) return undefined;
  return left + right;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function inferLayoutRules(input: InferLayoutInput): LayoutInferenceResult {
  const rules: RecoveredLayoutRule[] = [];
  const counters: LayoutInferenceCounters = {
    pagesWithAlignedProbe: 0,
    nodesWithProbe: 0,
    centered: 0,
    fullWidth: 0,
    percentage: 0,
    responsiveHidden: 0,
  };

  for (const page of input.pages) {
    const probeInfo = page.layoutProbe;
    // Full alignment or a usable prefix (≥90% of both walks) both qualify:
    // nodes outside the attached range simply carry no probe arrays.
    const attached =
      probeInfo !== undefined &&
      (probeInfo.aligned || (probeInfo.alignedElementCount ?? 0) > 0);
    if (!probeInfo || !attached) continue;
    counters.pagesWithAlignedProbe++;

    const widths = probeInfo.widths;
    const desktopIdx = widths
      .map((width, i) => ({ width, i }))
      .filter((entry) => entry.width >= input.breakpoint);
    if (desktopIdx.length < 2) continue;
    const truthEntry = desktopIdx.find((entry) => entry.width === TRUTH_WIDTH);
    if (!truthEntry) continue;

    const viewport = page.viewports.desktop;
    const nodeById = new Map<string, ElementSpecNode>();
    for (const node of viewport.nodes) {
      if (node.type === "element") nodeById.set(node.nodeId, node);
    }

    for (const node of viewport.nodes) {
      if (node.type !== "element" || !node.probe) continue;
      if (node.tagName === "html" || node.tagName === "body") continue;
      counters.nodesWithProbe++;

      const probe = node.probe;
      const wAt = (i: number): number => probe.w[i] ?? 0;
      const xAt = (i: number): number => probe.x[i] ?? 0;
      const vAt = (i: number): 0 | 1 => probe.v[i] ?? 0;

      // Sanity gate: the probe's truth-width box must agree with the deep
      // observation, or the two loads rendered different pages for this node.
      const truthWidth = wAt(truthEntry.i);
      const observedWidth = node.boundingBox?.width;
      if (
        observedWidth === undefined ||
        Math.abs(truthWidth - observedWidth) > TRUTH_SANITY_TOLERANCE_PX
      ) {
        continue;
      }

      // --- responsive hide (visible at truth, hidden at some other width) ---
      if (vAt(truthEntry.i) === 1) {
        const hiddenEntries = desktopIdx.filter((entry) => vAt(entry.i) === 0);
        if (hiddenEntries.length > 0 && hiddenEntries.length < desktopIdx.length) {
          for (const media of hiddenRanges(desktopIdx, hiddenEntries)) {
            rules.push({
              pageId: page.pageId,
              nodeId: node.nodeId,
              kind: "responsive-hidden",
              declarations: { display: "none" },
              media,
              evidence: [
                `visible at ${TRUTH_WIDTH}px, hidden at ` +
                  hiddenEntries.map((entry) => `${entry.width}px`).join("/"),
              ],
            });
            counters.responsiveHidden++;
          }
        }
      } else {
        // Hidden at the truth width: the exact computed style already hides
        // it, and revealing it at other widths cannot be verified against the
        // deep observation, so nothing is emitted.
        continue;
      }

      const displayValue = node.styleTokenId
        ? input.styleLookup(node.styleTokenId)?.["display"]
        : undefined;
      if (displayValue === undefined || !BLOCKISH_DISPLAY.has(displayValue)) continue;

      const parent =
        node.parentNodeId !== undefined ? nodeById.get(node.parentNodeId) : undefined;
      const parentProbe = parent?.probe;
      if (!parentProbe) continue;
      const pwAt = (i: number): number => parentProbe.w[i] ?? 0;
      const pxAt = (i: number): number => parentProbe.x[i] ?? 0;
      /*
       * Box-model correction: probe widths are border-box rects, but a CSS
       * percentage (and an auto block width) resolves against the parent's
       * CONTENT box. Without subtracting the parent's padding, a child that
       * simply fills its padded parent measures a constant ~0.97 ratio and
       * would be emitted as `width: 97%` — which then double-counts the
       * padding at render time. Padding is read from the parent's exact
       * computed style (px at the truth viewport, assumed constant-px).
       */
      const parentPadding = horizontalPadding(parent, input.styleLookup) ?? 0;
      const contentAt = (i: number): number => pwAt(i) - parentPadding;

      const parentGrowth =
        Math.max(...desktopIdx.map((entry) => pwAt(entry.i))) -
        Math.min(...desktopIdx.map((entry) => pwAt(entry.i)));

      // --- centered max-width ------------------------------------------------
      const constrained = desktopIdx.filter(
        (entry) => contentAt(entry.i) - wAt(entry.i) >= PARENT_GROWTH_MIN_PX,
      );
      const widthValues = constrained.map((entry) => wAt(entry.i));
      const widthConstant =
        widthValues.length >= 2 &&
        Math.max(...widthValues) - Math.min(...widthValues) <= WIDTH_CONSTANT_TOLERANCE_PX;
      const centeredEverywhere =
        constrained.length >= 2 &&
        constrained.every((entry) => {
          const leftGap = xAt(entry.i) - pxAt(entry.i);
          const rightGap =
            pxAt(entry.i) + pwAt(entry.i) - (xAt(entry.i) + wAt(entry.i));
          return Math.abs(leftGap - rightGap) <= CENTER_GAP_TOLERANCE_PX;
        });
      if (widthConstant && centeredEverywhere && parentGrowth >= PARENT_GROWTH_MIN_PX) {
        // `max-width` resolves on the CONTENT box unless the node itself is
        // border-box; the probe width is always border-box.
        const ownPadding = horizontalPadding(node, input.styleLookup) ?? 0;
        const borderBox =
          node.styleTokenId !== undefined &&
          input.styleLookup(node.styleTokenId)?.["box-sizing"] === "border-box";
        const maxWidth = Math.round(
          Math.max(...widthValues) - (borderBox ? 0 : ownPadding),
        );
        const evidence = constrained.map(
          (entry) =>
            `${entry.width}px: left ${round2(xAt(entry.i) - pxAt(entry.i))} / ` +
            `width ${round2(wAt(entry.i))} / right ${round2(
              pxAt(entry.i) + pwAt(entry.i) - xAt(entry.i) - wAt(entry.i),
            )}`,
        );
        const authored = (node.authoredLayout ?? []).filter(
          (rule) =>
            (rule.property === "max-width" && rule.media === undefined) ||
            ((rule.property === "margin" ||
              rule.property === "margin-left" ||
              rule.property === "margin-right" ||
              rule.property === "margin-inline") &&
              rule.value.includes("auto")),
        );
        for (const rule of authored) {
          evidence.push(`authored ${rule.property}: ${rule.value} (${rule.selector})`);
        }
        rules.push({
          pageId: page.pageId,
          nodeId: node.nodeId,
          kind: "centered-max-width",
          declarations: {
            "max-width": `${maxWidth}px`,
            "margin-left": "auto",
            "margin-right": "auto",
            width: "auto",
          },
          evidence,
        });
        counters.centered++;
        continue;
      }

      /*
       * --- centered max-width whose cap engages only ABOVE the truth width ---
       *
       * The check above needs the cap visibly engaged at TWO probe widths. A
       * marketing shell of the form `max-width: C; margin-inline: auto` whose C
       * sits at (or just under) the truth viewport shows a different probe
       * signature: at every width below C the node simply FILLS its parent's
       * content box, and only at the widest probe width does it stop growing
       * and center. `w == min(parentContent, cap)` at EVERY desktop width is
       * exactly the arithmetic of `width:auto + max-width + margin auto`, so it
       * is checked in full — one width off the curve rejects the rule — plus
       * equal gaps wherever the cap is engaged, at least one width where it
       * demonstrably is, and the same truth-sanity gate as every other rule.
       * (Task 26 generic correction; first measured on a fresh non-Stripe
       * source, where every route's outer shell had this shape and the wide
       * viewports drifted 480px left on the exact fallback.)
       */
      const cap = Math.max(...desktopIdx.map((entry) => wAt(entry.i)));
      const capEngaged = desktopIdx.filter(
        (entry) => contentAt(entry.i) - cap >= PARENT_GROWTH_MIN_PX,
      );
      const followsCappedFill = desktopIdx.every((entry) => {
        const expected = Math.min(contentAt(entry.i), cap);
        return Math.abs(wAt(entry.i) - expected) <= FULL_WIDTH_TOLERANCE_PX;
      });
      const engagedCentered = capEngaged.every((entry) => {
        const leftGap = xAt(entry.i) - pxAt(entry.i);
        const rightGap =
          pxAt(entry.i) + pwAt(entry.i) - (xAt(entry.i) + wAt(entry.i));
        return Math.abs(leftGap - rightGap) <= CENTER_GAP_TOLERANCE_PX;
      });
      if (
        capEngaged.length >= 1 &&
        followsCappedFill &&
        engagedCentered &&
        parentGrowth >= PARENT_GROWTH_MIN_PX
      ) {
        const ownPadding = horizontalPadding(node, input.styleLookup) ?? 0;
        const borderBox =
          node.styleTokenId !== undefined &&
          input.styleLookup(node.styleTokenId)?.["box-sizing"] === "border-box";
        const maxWidth = Math.round(cap - (borderBox ? 0 : ownPadding));
        const evidence = desktopIdx.map(
          (entry) =>
            `${entry.width}px: width ${round2(wAt(entry.i))} vs parent content ` +
            `${round2(contentAt(entry.i))} (${
              capEngaged.includes(entry) ? "cap engaged, centered" : "fills content"
            })`,
        );
        const authored = (node.authoredLayout ?? []).filter(
          (rule) =>
            (rule.property === "max-width" && rule.media === undefined) ||
            ((rule.property === "margin" ||
              rule.property === "margin-left" ||
              rule.property === "margin-right" ||
              rule.property === "margin-inline") &&
              rule.value.includes("auto")),
        );
        for (const rule of authored) {
          evidence.push(`authored ${rule.property}: ${rule.value} (${rule.selector})`);
        }
        rules.push({
          pageId: page.pageId,
          nodeId: node.nodeId,
          kind: "centered-max-width",
          declarations: {
            "max-width": `${maxWidth}px`,
            "margin-left": "auto",
            "margin-right": "auto",
            width: "auto",
          },
          evidence,
        });
        counters.centered++;
        continue;
      }

      // --- full width --------------------------------------------------------
      const fullWidthEverywhere = desktopIdx.every(
        (entry) => Math.abs(wAt(entry.i) - contentAt(entry.i)) <= FULL_WIDTH_TOLERANCE_PX,
      );
      if (fullWidthEverywhere && parentGrowth >= PARENT_GROWTH_MIN_PX) {
        rules.push({
          pageId: page.pageId,
          nodeId: node.nodeId,
          kind: "full-width",
          declarations: { width: "auto" },
          evidence: desktopIdx.map(
            (entry) =>
              `${entry.width}px: width ${round2(wAt(entry.i))} vs parent content ` +
              `${round2(contentAt(entry.i))} (padding ${parentPadding})`,
          ),
        });
        counters.fullWidth++;
        continue;
      }

      // --- constant percentage width -----------------------------------------
      const ratios = desktopIdx.map((entry) =>
        contentAt(entry.i) > 0 ? wAt(entry.i) / contentAt(entry.i) : 0,
      );
      const ratioSpread = Math.max(...ratios) - Math.min(...ratios);
      const meanRatio = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
      const nodeGrowth =
        Math.max(...desktopIdx.map((entry) => wAt(entry.i))) -
        Math.min(...desktopIdx.map((entry) => wAt(entry.i)));
      if (
        ratioSpread <= PERCENTAGE_RATIO_TOLERANCE &&
        meanRatio >= 0.05 &&
        meanRatio <= 0.98 &&
        parentGrowth >= PARENT_GROWTH_MIN_PX &&
        nodeGrowth >= 20
      ) {
        const ownPadding = horizontalPadding(node, input.styleLookup) ?? 0;
        const borderBox =
          node.styleTokenId !== undefined &&
          input.styleLookup(node.styleTokenId)?.["box-sizing"] === "border-box";
        const effectiveRatio = borderBox
          ? meanRatio
          : desktopIdx
              .map((entry) =>
                contentAt(entry.i) > 0
                  ? (wAt(entry.i) - ownPadding) / contentAt(entry.i)
                  : 0,
              )
              .reduce((sum, ratio) => sum + ratio, 0) / desktopIdx.length;
        const pct = Math.round(effectiveRatio * 10_000) / 100;
        rules.push({
          pageId: page.pageId,
          nodeId: node.nodeId,
          kind: "percentage-width",
          declarations: { width: `${pct}%` },
          evidence: desktopIdx.map(
            (entry) =>
              `${entry.width}px: ratio ${round2(
                contentAt(entry.i) > 0 ? wAt(entry.i) / contentAt(entry.i) : 0,
              )} of parent content (padding ${parentPadding})`,
          ),
        });
        counters.percentage++;
      }
    }
  }

  return { rules, css: generateLayoutCss(rules), counters };
}

/**
 * Turn hidden probe widths into @media conditions using the same midpoint
 * convention as the generated breakpoint: the boundary between a visible and a
 * hidden probe width is their midpoint, floored. Contiguous hidden widths
 * merge into one range.
 */
function hiddenRanges(
  desktopIdx: readonly { width: number; i: number }[],
  hiddenEntries: readonly { width: number; i: number }[],
): string[] {
  const hidden = new Set(hiddenEntries.map((entry) => entry.width));
  const sorted = [...desktopIdx].sort((a, b) => a.width - b.width);
  const ranges: string[] = [];
  let start: number | undefined;
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]!;
    const isHidden = hidden.has(entry.width);
    if (isHidden && start === undefined) {
      const previous = sorted[i - 1];
      start = previous ? Math.floor((previous.width + entry.width) / 2) : entry.width;
    }
    if (!isHidden && start !== undefined) {
      const boundary = Math.floor((sorted[i - 1]!.width + entry.width) / 2);
      ranges.push(`(min-width: ${start}px) and (max-width: ${boundary - 0.02}px)`);
      start = undefined;
    }
  }
  if (start !== undefined) ranges.push(`(min-width: ${start}px)`);
  return ranges;
}

/** One rule per recovered node, at (0,3,0) so it outranks the exact class. */
export function generateLayoutCss(rules: readonly RecoveredLayoutRule[]): string {
  if (rules.length === 0) return "";
  const lines: string[] = [
    "/* Recovered layout rules (Task 17 §9/§10). Do not edit. */",
  ];
  const sorted = [...rules].sort((a, b) =>
    a.pageId !== b.pageId
      ? a.pageId.localeCompare(b.pageId)
      : a.nodeId !== b.nodeId
        ? a.nodeId.localeCompare(b.nodeId)
        : a.kind.localeCompare(b.kind),
  );
  for (const rule of sorted) {
    const selector =
      `[data-wr-page="${rule.pageId}"][data-wr-viewport="desktop"] ` +
      `[data-wr-node="${rule.nodeId}"]`;
    const declarations = Object.entries(rule.declarations)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([property, value]) => `  ${property}: ${value};`)
      .join("\n");
    const body = `${selector} {\n${declarations}\n}`;
    lines.push(rule.media !== undefined ? `@media ${rule.media} {\n${body}\n}` : body);
  }
  return lines.join("\n");
}
