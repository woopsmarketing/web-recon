import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import {
  MAX_PAGE_STATE_CANDIDATES,
  MAX_PAGE_STATE_DISMISSALS,
  OVERLAY_SHAPE,
  PANEL_SHAPE,
  PAGE_STATE_ACTION_SETTLE_MS,
  PAGE_STATE_ACTION_TIMEOUT_MS,
  PAGE_STATE_CLOSE_PHRASES,
  PAGE_STATE_CLOSE_SYMBOLS,
  PAGE_STATE_EVIDENCE_ROOT_DEFAULT,
  PAGE_STATE_SCAN_INTERVAL_MS,
  PAGE_STATE_SCAN_MAX_MS,
  INITIAL_PAINT_STATE_KEY,
  NAV_TIMEOUT_MS,
  SCROLL_REVEAL_OPACITY_THRESHOLD,
  type PageStateNormalization,
  type PageStateNormalizationAttempt,
} from "./types.js";
import { isNavigationDestroyedContextError } from "./navigation-errors.js";
import { installBrowserNameShim } from "./initial-paint-census.js";

/**
 * Task 28.7 A2 — BOUNDED, EVIDENCE-GATED PAGE-STATE NORMALIZATION.
 *
 * ---------------------------------------------------------------------------
 * THE CONTRACT CHANGE (deliberate, not a slip)
 * ---------------------------------------------------------------------------
 * Until Task 28.7 the observer's contract said it "never clicks". Obtaining the
 * NORMAL page state — the page a human sees, not the page behind an entry popup
 * — is now a product requirement: an entry popup open at capture time is
 * reconstructed as a permanent overlay covering the hero, which was measured on
 * 2 of 12 scouted pilot candidates in Task 28.6.
 *
 * So the observer gains ONE new phase, and only this phase may act:
 *
 *   goto → initial-paint census → settle → **NORMALIZE (may click)** →
 *   preparation scroll → collection (STRICTLY READ-ONLY, unchanged)
 *
 * Every action this phase takes is recorded on the observation artifact AND
 * written to an evidence directory with a before/after screenshot. Silent
 * manipulation is forbidden: an attempt that produced nothing is recorded just
 * as loudly as one that worked.
 *
 * ---------------------------------------------------------------------------
 * THE BAR (the documented predicate)
 * ---------------------------------------------------------------------------
 * A false positive here DELETES A REAL HEADER, a chat widget, or a legitimate
 * full-viewport hero — which is worse than the defect. So classification
 * demands STRONG evidence, written down as one predicate:
 *
 *   an overlay QUALIFIES  ⇔  it is modal-SHAPED
 *                            AND it has ≥ 2 corroborating signals
 *                            AND ≥ 1 of them is STRONG
 *
 * modal-SHAPED has TWO tiers since Task 28.75, both requiring the element to be
 * painting, `position: fixed|absolute` and intersecting the viewport:
 *
 *   COVER ({@link OVERLAY_SHAPE}, unchanged, shared with the collector census)
 *     ≥ half the viewport width AND ≥ half its height AND ≥ half its area.
 *     Wide-but-short is refused as a class (`headerLikeRefused`) — that is the
 *     fixed header / banner / toolbar.
 *
 *   PANEL ({@link PANEL_SHAPE}, ADDITIVE, Task 28.75)
 *     The centered desktop modal. The cover gate is a COVER gate, and a centered
 *     desktop modal is narrow relative to a wide viewport: seoultone.kr's entry
 *     popup covers 0.347 of the width at 1440 and 0.900 at 390, so the gate
 *     refused it BY CONSTRUCTION at exactly the width reconstruction is graded
 *     at — never on evidence, never even counted. The panel tier admits a box
 *     that is substantial (≥ 0.20 width, ≥ 0.25 height, ≥ 0.08 area), INSET from
 *     the viewport at both ends of at least one axis (it floats rather than
 *     being welded to the page frame), LIFTED (`position: fixed` or an explicit
 *     positive `z-index` — `z-index: auto` is decoration, not an overlay), and
 *     NOT full-bleed-and-short (the header / cookie-bar class, refused outright).
 *
 * The tier is an ADMISSION path only. The evidence bar below is unchanged, so
 * shape now CORROBORATES a strongly-evidenced modal instead of vetoing one.
 *
 *   STRONG signals (at least one required, none sufficient alone)
 *     `declared-dialog`                 native `<dialog open>`, `role="dialog"`,
 *                                       `role="alertdialog"`, or
 *                                       `aria-modal="true"`.
 *     `appeared-after-initial-paint`    not painting in the initial-paint census
 *                                       taken right after `load`.
 *     `close-control-inside`            a visible, enabled control inside the
 *                                       overlay whose accessible label matches
 *                                       the generic multilingual dismissal
 *                                       vocabulary.
 *
 *   WEAK signals (may only ever be the SECOND signal)
 *     `page-scroll-locked`              the document is longer than the viewport
 *                                       and the page scroller is locked.
 *     `stacked-above-page`              a positive z-index above every element
 *                                       painting at the initial paint, together
 *                                       with a backdrop-like own background.
 *     `backdrop-behind`                 (28.75) a full-viewport PAINTED scrim the
 *                                       overlay sits inside of or beside — the
 *                                       structural pairing a centered panel has
 *                                       instead of covering the viewport itself.
 *                                       WEAK because a dark full-bleed hero
 *                                       wrapping a lazily-rendered card looks
 *                                       identical from here.
 *
 * EXPLICITLY INSUFFICIENT ON THEIR OWN, and this is the whole point:
 * `position: fixed` (a fixed header), a high z-index (a chat widget, a floating
 * CTA, an accessibility control), and page scroll being locked (an open nav
 * drawer, a scroll-jacking library, an intro animation) each describe something
 * legitimate. None of them is a strong signal, and none of them can qualify an
 * overlay by itself. 28.75 widened WHICH SHAPES are looked at; it did not widen
 * what counts as evidence, and it added no new STRONG signal.
 *
 * ---------------------------------------------------------------------------
 * ACTION POLICY
 * ---------------------------------------------------------------------------
 *  • Prefer clicking the actual close control found INSIDE the overlay.
 *  • `Escape` only as a fallback, and ONLY with `declared-dialog` evidence.
 *  • The element is NEVER removed or hidden. There is no last-resort DOM
 *    removal in this module at all — not even an off-by-default one — because
 *    the honest fallback for "we could not dismiss it" is to record that and
 *    let the census downstream describe the overlay.
 *  • At most {@link MAX_PAGE_STATE_DISMISSALS} attempts per page-load, each with
 *    a short timeout, never `force: true`.
 *  • A click that NAVIGATES stops the phase immediately; the page is restored
 *    with one bounded `goto` back to the URL under observation.
 *  • After each dismissal the result is VERIFIED against the page: the overlay
 *    must be gone or no longer covering. If the underlying page geometry did not
 *    change meaningfully, that is recorded distinctly (`no-geometry-change`).
 *
 * Nothing here is keyed on a hostname, URL, class name, site-specific selector
 * or pixel value.
 */

// ---------------------------------------------------------------------------
// In-page passes. Serialized by `page.evaluate`, so they may reference only
// their own argument and browser globals — no imports, no closures.
// ---------------------------------------------------------------------------

interface ScanConfig {
  initialPaintStateKey: string;
  /** COVER tier ({@link OVERLAY_SHAPE}) — unchanged, and shared with the census. */
  minWidthCoverage: number;
  minHeightCoverage: number;
  minAreaCoverage: number;
  /** PANEL tier ({@link PANEL_SHAPE}) — Task 28.75, additive. */
  panelMinWidthCoverage: number;
  panelMinHeightCoverage: number;
  panelMinAreaCoverage: number;
  panelMinAxisInset: number;
  panelMaxFullBleedWidth: number;
  opacityThreshold: number;
  maxCandidates: number;
  closeSymbols: string[];
  closePhrases: string[];
}

type ShapeClass = "cover" | "panel";

interface ScanCandidate {
  domPath: string;
  fingerprint: string;
  tagName: string;
  /** Which tier admitted it (Task 28.75). */
  shapeClass: ShapeClass;
  coverage: number;
  widthCoverage: number;
  heightCoverage: number;
  position: string;
  zIndex: number | null;
  signals: string[];
  strongSignals: string[];
  qualified: boolean;
  refusedReason?: string;
  closeControlPath?: string;
  closeControlLabel?: string;
  closeControlLabelSource?: string;
}

type CensusStatus = "available" | "absent" | "partial" | "unreadable";

interface ScanResult {
  structuralMatches: number;
  headerLikeRefused: number;
  /** Task 28.75 — panel-tier admissions that the COVER gate did not admit. */
  panelMatches: number;
  qualified: number;
  candidates: ScanCandidate[];
  capHit: boolean;
  initialPaintCensusAvailable: boolean;
  initialPaintCensusStatus: CensusStatus;
  pageScrollLocked: boolean;
  documentHeight: number;
}

/**
 * ONE scan of the current page state. Read-only: it computes styles and reads
 * geometry, it writes nothing to the document.
 */
function scanOverlaysInBrowser(cfg: ScanConfig): ScanResult {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const result: ScanResult = {
    structuralMatches: 0,
    headerLikeRefused: 0,
    panelMatches: 0,
    qualified: 0,
    candidates: [],
    capHit: false,
    initialPaintCensusAvailable: false,
    initialPaintCensusStatus: "absent",
    pageScrollLocked: false,
    documentHeight: document.documentElement.scrollHeight,
  };
  if (viewportW <= 0 || viewportH <= 0) return result;

  // --- the initial-paint census parked by the load -------------------------
  // Task 28.75 — the reason is now RECORDED rather than collapsed to a boolean:
  // a caller that skipped call 1 of the two-call contract silently loses a
  // STRONG signal, and "silently" is exactly the failure mode to remove.
  let initialVisible: { has: (el: Element) => boolean } | null = null;
  let censusStatus: CensusStatus = "absent";
  try {
    const census = (window as unknown as Record<string, unknown>)[
      cfg.initialPaintStateKey
    ] as
      | {
          visible?: { has: (el: Element) => boolean };
          capHit?: boolean;
        }
      | undefined;
    if (census === undefined || census === null) {
      censusStatus = "absent";
    } else if (census.capHit === true) {
      // A PARTIAL census is worse than none: an element it never reached looks
      // exactly like one that did not exist yet, and that is the direction that
      // invents a modal out of a legitimate fixed element.
      censusStatus = "partial";
    } else if (
      census.visible &&
      typeof (census.visible as { has?: unknown }).has === "function"
    ) {
      initialVisible = census.visible;
      censusStatus = "available";
    } else {
      censusStatus = "unreadable";
    }
  } catch {
    initialVisible = null;
    censusStatus = "unreadable";
  }
  result.initialPaintCensusAvailable = initialVisible !== null;
  result.initialPaintCensusStatus = censusStatus;

  // --- page scroll locked (weak signal, read once) -------------------------
  let pageScrollLocked = false;
  try {
    const de = document.documentElement;
    const bodyEl = document.body as HTMLElement | null;
    const scrollable = de.scrollHeight > viewportH + 2;
    const locks = (value: string): boolean => value === "hidden" || value === "clip";
    const htmlOverflow = getComputedStyle(de).overflowY;
    const bodyOverflow = bodyEl ? getComputedStyle(bodyEl).overflowY : "";
    pageScrollLocked = scrollable && (locks(htmlOverflow) || locks(bodyOverflow));
  } catch {
    pageScrollLocked = false;
  }
  result.pageScrollLocked = pageScrollLocked;

  const isPainting = (el: Element, cs: CSSStyleDeclaration): boolean => {
    if (cs.display === "none") return false;
    if (cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    const raw = parseFloat(cs.opacity || "1");
    if (!(raw >= cfg.opacityThreshold)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /** `html > body:nth-child(2) > div:nth-child(3)` — read-only node identity. */
  const domPathOf = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    let guard = 0;
    while (node && node.nodeType === 1 && guard++ < 64) {
      const parent: Element | null = node.parentElement;
      if (!parent) {
        parts.unshift(node.tagName.toLowerCase());
        break;
      }
      let index = 1;
      let sib = node.previousElementSibling;
      while (sib) {
        index++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${String(index)})`);
      node = parent;
    }
    return parts.join(" > ");
  };

  const fingerprintOf = (el: Element): string => {
    const id = el.getAttribute("id");
    const cls = (el.getAttribute("class") || "")
      .split(/\s+/)
      .filter((c) => c !== "")
      .slice(0, 4)
      .map((c) => `.${c}`)
      .join("");
    return `${el.tagName.toLowerCase()}${id ? `#${id}` : ""}${cls}`;
  };

  const normalizeLabel = (value: string): string =>
    value.replace(/\s+/g, " ").trim().toLowerCase();

  /** The dismissal vocabulary match. Symbols must be the WHOLE label. */
  const matchesCloseVocabulary = (label: string): boolean => {
    const n = normalizeLabel(label);
    if (n === "") return false;
    for (let i = 0; i < cfg.closeSymbols.length; i++) {
      if (n === cfg.closeSymbols[i]) return true;
    }
    for (let i = 0; i < cfg.closePhrases.length; i++) {
      const phrase = cfg.closePhrases[i]!;
      if (n.indexOf(phrase) !== -1) return true;
    }
    return false;
  };

  /** A visible, enabled control inside `root` whose label says "dismiss". */
  const findCloseControl = (
    root: Element,
  ): { path: string; label: string; source: string } | null => {
    let controls: Element[];
    try {
      controls = Array.prototype.slice.call(
        root.querySelectorAll(
          'button, [role="button"], a[href], a[onclick], input[type="button"], ' +
            'input[type="submit"], [role="link"], [tabindex]',
        ),
      ) as Element[];
    } catch {
      return null;
    }
    for (let i = 0; i < controls.length && i < 400; i++) {
      const c = controls[i]!;
      let cs: CSSStyleDeclaration;
      try {
        cs = getComputedStyle(c);
      } catch {
        continue;
      }
      if (!isPainting(c, cs)) continue;
      if ((c as HTMLButtonElement).disabled === true) continue;
      const sources: { source: string; value: string }[] = [
        { source: "aria-label", value: c.getAttribute("aria-label") || "" },
        { source: "title", value: c.getAttribute("title") || "" },
        { source: "alt", value: c.getAttribute("alt") || "" },
        { source: "value", value: c.getAttribute("value") || "" },
        { source: "text", value: c.textContent || "" },
      ];
      // An icon button often labels only its inner <img>/<svg>.
      try {
        const inner = c.querySelector("img[alt], [aria-label], title");
        if (inner) {
          sources.push({
            source: "descendant-label",
            value:
              inner.getAttribute("alt") ||
              inner.getAttribute("aria-label") ||
              inner.textContent ||
              "",
          });
        }
      } catch {
        /* nothing further to read */
      }
      for (let s = 0; s < sources.length; s++) {
        const entry = sources[s]!;
        if (entry.value === "") continue;
        // A very long body of text is prose, not a control label.
        if (entry.value.length > 80) continue;
        if (!matchesCloseVocabulary(entry.value)) continue;
        return {
          path: domPathOf(c),
          label: normalizeLabel(entry.value),
          source: entry.source,
        };
      }
    }
    return null;
  };

  /** An actually painted background layer (a scrim), not a transparent wrapper. */
  const hasPaintedBackground = (cs: CSSStyleDeclaration): boolean => {
    try {
      const bg = cs.backgroundColor || "";
      const transparent =
        bg === "" || bg === "transparent" || /rgba\([^)]*,\s*0\s*\)$/.test(bg);
      return !transparent || (cs.backgroundImage || "none") !== "none";
    } catch {
      return false;
    }
  };

  /**
   * Task 28.75 — the BACKDROP RELATIONSHIP: a full-viewport painted scrim that
   * an overlay sits inside of, or immediately beside. That pairing (small
   * centered panel + big painted sheet behind it) is the structural shape of a
   * modal, and it is what a centered desktop panel has instead of covering the
   * viewport itself.
   *
   * It is a WEAK signal on purpose. A dark full-bleed hero section wrapping a
   * lazily-rendered card looks the same from here, so this may only ever be the
   * SECOND signal — it can never qualify anything by itself.
   *
   * Bounded: at most 8 ancestors, and at most 4 siblings at each level.
   */
  const hasBackdropBehind = (el: Element): boolean => {
    const covers = (t: Element): boolean => {
      if (t === el) return false;
      let tcs: CSSStyleDeclaration;
      let r: DOMRect;
      try {
        tcs = getComputedStyle(t);
        r = t.getBoundingClientRect();
      } catch {
        return false;
      }
      if (!isPainting(t, tcs)) return false;
      if (tcs.position !== "fixed" && tcs.position !== "absolute") return false;
      if (!hasPaintedBackground(tcs)) return false;
      const bx = Math.max(0, Math.min(r.right, viewportW) - Math.max(r.left, 0));
      const by = Math.max(0, Math.min(r.bottom, viewportH) - Math.max(r.top, 0));
      return (
        bx / viewportW >= cfg.minWidthCoverage &&
        by / viewportH >= cfg.minHeightCoverage &&
        (bx * by) / (viewportW * viewportH) >= cfg.minAreaCoverage
      );
    };
    let node: Element | null = el;
    for (let depth = 0; node && depth < 8; depth++) {
      if (depth > 0 && covers(node)) return true;
      let sib = node.previousElementSibling;
      for (let i = 0; sib && i < 4; i++) {
        if (covers(sib)) return true;
        sib = sib.previousElementSibling;
      }
      sib = node.nextElementSibling;
      for (let i = 0; sib && i < 4; i++) {
        if (covers(sib)) return true;
        sib = sib.nextElementSibling;
      }
      node = node.parentElement;
    }
    return false;
  };

  /**
   * The highest z-index among elements that WERE painting at the initial paint.
   * An overlay stacked above all of them is stacked above the page — a WEAK
   * signal, never a verdict, because a chat widget does exactly this too.
   */
  let baselineZ = 0;
  const all = document.getElementsByTagName("*");
  const limit = Math.min(all.length, 20000);
  for (let i = 0; i < limit; i++) {
    const el = all[i]!;
    if (initialVisible !== null && !initialVisible.has(el)) continue;
    let z: number;
    try {
      z = parseInt(getComputedStyle(el).zIndex, 10);
    } catch {
      continue;
    }
    if (Number.isFinite(z) && z > baselineZ) baselineZ = z;
  }

  for (let i = 0; i < limit; i++) {
    const el = all[i]!;
    let cs: CSSStyleDeclaration;
    let rect: DOMRect;
    try {
      cs = getComputedStyle(el);
      rect = el.getBoundingClientRect();
    } catch {
      continue;
    }
    if (!isPainting(el, cs)) continue;
    const position = cs.position;
    if (position !== "fixed" && position !== "absolute") continue;

    // --- TIER 1: THE SHARED COVER GATE (same thresholds as the census) -----
    // Untouched by Task 28.75. `structuralMatches` and `headerLikeRefused` keep
    // their exact pre-28.75 arithmetic so the collector's read-only overlay
    // census and this pass stay pinned element-for-element.
    const ix = Math.max(0, Math.min(rect.right, viewportW) - Math.max(rect.left, 0));
    const iy = Math.max(0, Math.min(rect.bottom, viewportH) - Math.max(rect.top, 0));
    if (iy <= 0) continue;
    const widthCoverage = ix / viewportW;
    const heightCoverage = iy / viewportH;
    const area = (ix * iy) / (viewportW * viewportH);
    const coverShaped =
      widthCoverage >= cfg.minWidthCoverage &&
      heightCoverage >= cfg.minHeightCoverage &&
      area >= cfg.minAreaCoverage;
    if (
      widthCoverage >= cfg.minWidthCoverage &&
      (heightCoverage < cfg.minHeightCoverage || area < cfg.minAreaCoverage)
    ) {
      // Wide, positioned, painting — and SHORT. A header/banner/toolbar.
      result.headerLikeRefused++;
    }

    // --- TIER 2: THE CENTERED PANEL (Task 28.75) ---------------------------
    /*
     * A centered desktop modal is NARROW relative to a wide viewport — the
     * measured seoultone popup covers 0.347 of the width at 1440 — so the cover
     * gate refused it by construction at exactly the width reconstruction is
     * graded at. This tier admits such a box as a CANDIDATE. It does not lower
     * the evidence bar: the qualification predicate below is unchanged, so
     * shape now corroborates a strongly-evidenced modal instead of vetoing one.
     *
     * Everything a page legitimately owns is refused here, and each clause names
     * what it refuses:
     */
    let shapeClass: ShapeClass = "cover";
    if (!coverShaped) {
      // (1) The header / banner / toolbar / cookie-bar CLASS, refused outright:
      //     full-viewport width and shorter than the COVER height threshold.
      const fullBleedShort =
        widthCoverage >= cfg.panelMaxFullBleedWidth &&
        heightCoverage < cfg.minHeightCoverage;
      if (fullBleedShort) continue;
      // (2) A modal panel is a SUBSTANTIAL rectangle — not a chat bubble, a
      //     floating CTA, an accessibility rail or a cookie strip.
      if (widthCoverage < cfg.panelMinWidthCoverage) continue;
      if (heightCoverage < cfg.panelMinHeightCoverage) continue;
      if (area < cfg.panelMinAreaCoverage) continue;
      // (3) A modal FLOATS: it is inset from the viewport at BOTH ends of at
      //     least one axis. A header is welded to the top and both sides; a
      //     cookie bar to the bottom and both sides; a drawer to one side.
      const insetLeft = Math.max(0, rect.left) / viewportW;
      const insetRight = Math.max(0, viewportW - rect.right) / viewportW;
      const insetTop = Math.max(0, rect.top) / viewportH;
      const insetBottom = Math.max(0, viewportH - rect.bottom) / viewportH;
      const insetOnAnAxis =
        Math.min(insetLeft, insetRight) >= cfg.panelMinAxisInset ||
        Math.min(insetTop, insetBottom) >= cfg.panelMinAxisInset;
      if (!insetOnAnAxis) continue;
      // (4) A modal is LIFTED above the page. `z-index: auto` on an absolutely
      //     positioned box means it paints in the page's own order — that is
      //     decoration (a hero frame, a glow, a grain layer), not an overlay.
      const zForLift = parseInt(cs.zIndex, 10);
      const lifted =
        position === "fixed" || (Number.isFinite(zForLift) && zForLift > 0);
      if (!lifted) continue;
      shapeClass = "panel";
      result.panelMatches++;
    } else {
      result.structuralMatches++;
    }

    if (result.candidates.length >= cfg.maxCandidates) {
      result.capHit = true;
      continue;
    }

    // --- signals -----------------------------------------------------------
    const role = (el.getAttribute("role") || "").toLowerCase();
    const tagName = el.tagName.toLowerCase();
    const declaredDialog =
      (tagName === "dialog" && (el as HTMLDialogElement).open === true) ||
      role === "dialog" ||
      role === "alertdialog" ||
      (el.getAttribute("aria-modal") || "") === "true";
    const appearedAfterInitialPaint =
      initialVisible !== null ? !initialVisible.has(el) : false;
    const close = findCloseControl(el);

    const zRaw = parseInt(cs.zIndex, 10);
    const zIndex = Number.isFinite(zRaw) ? zRaw : null;
    // A "backdrop-like" own background: an actually painted background layer,
    // which is what separates a modal scrim from a transparent wrapper.
    const hasBackdrop = hasPaintedBackground(cs);
    const stackedAbovePage =
      zIndex !== null && zIndex > 0 && zIndex >= baselineZ && hasBackdrop;
    const backdropBehind = hasBackdropBehind(el);

    const strong: string[] = [];
    if (declaredDialog) strong.push("declared-dialog");
    if (appearedAfterInitialPaint) strong.push("appeared-after-initial-paint");
    if (close) strong.push("close-control-inside");
    const weak: string[] = [];
    if (pageScrollLocked) weak.push("page-scroll-locked");
    if (stackedAbovePage) weak.push("stacked-above-page");
    if (backdropBehind) weak.push("backdrop-behind");

    const signals = strong.concat(weak);
    // THE BAR, UNCHANGED BY 28.75: ≥2 signals, ≥1 of them strong.
    const qualified = strong.length >= 1 && signals.length >= 2;
    if (qualified) result.qualified++;

    result.candidates.push({
      domPath: domPathOf(el),
      fingerprint: fingerprintOf(el),
      tagName,
      shapeClass,
      coverage: Math.round(area * 1000) / 1000,
      widthCoverage: Math.round(widthCoverage * 1000) / 1000,
      heightCoverage: Math.round(heightCoverage * 1000) / 1000,
      position,
      zIndex,
      signals,
      strongSignals: strong,
      qualified,
      ...(qualified
        ? {}
        : {
            refusedReason:
              strong.length === 0
                ? "no-strong-signal"
                : "only-one-signal",
          }),
      ...(close
        ? {
            closeControlPath: close.path,
            closeControlLabel: close.label,
            closeControlLabelSource: close.source,
          }
        : {}),
    });
  }
  return result;
}

interface ProbeResult {
  documentHeight: number;
  pageScrollLocked: boolean;
  /** Viewport-area coverage of the node at `domPath`; 0 when gone/not painting. */
  coverage: number;
  present: boolean;
}

/** Re-measure ONE overlay and the page around it. Read-only. */
function probeOverlayInBrowser(arg: {
  domPath: string;
  opacityThreshold: number;
}): ProbeResult {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const out: ProbeResult = {
    documentHeight: document.documentElement.scrollHeight,
    pageScrollLocked: false,
    coverage: 0,
    present: false,
  };
  try {
    const de = document.documentElement;
    const bodyEl = document.body as HTMLElement | null;
    const scrollable = de.scrollHeight > viewportH + 2;
    const locks = (value: string): boolean => value === "hidden" || value === "clip";
    out.pageScrollLocked =
      scrollable &&
      (locks(getComputedStyle(de).overflowY) ||
        locks(bodyEl ? getComputedStyle(bodyEl).overflowY : ""));
  } catch {
    out.pageScrollLocked = false;
  }
  let el: Element | null = null;
  try {
    el = document.querySelector(arg.domPath);
  } catch {
    el = null;
  }
  if (!el) return out;
  out.present = true;
  try {
    const cs = getComputedStyle(el);
    if (cs.display === "none") return out;
    if (cs.visibility === "hidden" || cs.visibility === "collapse") return out;
    if (!(parseFloat(cs.opacity || "1") >= arg.opacityThreshold)) return out;
    const rect = el.getBoundingClientRect();
    if (viewportW <= 0 || viewportH <= 0) return out;
    const ix = Math.max(0, Math.min(rect.right, viewportW) - Math.max(rect.left, 0));
    const iy = Math.max(0, Math.min(rect.bottom, viewportH) - Math.max(rect.top, 0));
    out.coverage = Math.round(((ix * iy) / (viewportW * viewportH)) * 1000) / 1000;
  } catch {
    out.coverage = 0;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Node side
// ---------------------------------------------------------------------------

export interface NormalizePageStateOptions {
  /** The URL under observation — what a navigation restore goes back to. */
  observationUrl: string;
  /** Viewport profile id, for the evidence path. */
  viewportId: string;
  /** Page id used in the evidence path (a site run passes its `p00000N`). */
  pageId: string;
  /**
   * Evidence root. Defaults to {@link PAGE_STATE_EVIDENCE_ROOT_DEFAULT}, which
   * Task 28.75 moved OUT of `docs/result/28.7/**` (a frozen wave's artifact
   * directory that permanently-enabled production code was writing into). The
   * smoke suite
   * points it at a temp directory so the evidence CONTRACT itself is tested
   * rather than only asserted about.
   */
  evidenceRoot?: string;
  onLog?: (message: string) => void;
}

const SCAN_CONFIG: Omit<ScanConfig, "initialPaintStateKey"> = {
  minWidthCoverage: OVERLAY_SHAPE.minWidthCoverage,
  minHeightCoverage: OVERLAY_SHAPE.minHeightCoverage,
  minAreaCoverage: OVERLAY_SHAPE.minAreaCoverage,
  panelMinWidthCoverage: PANEL_SHAPE.minWidthCoverage,
  panelMinHeightCoverage: PANEL_SHAPE.minHeightCoverage,
  panelMinAreaCoverage: PANEL_SHAPE.minAreaCoverage,
  panelMinAxisInset: PANEL_SHAPE.minAxisInset,
  panelMaxFullBleedWidth: PANEL_SHAPE.maxFullBleedWidth,
  opacityThreshold: SCROLL_REVEAL_OPACITY_THRESHOLD,
  maxCandidates: MAX_PAGE_STATE_CANDIDATES,
  closeSymbols: [...PAGE_STATE_CLOSE_SYMBOLS],
  closePhrases: [...PAGE_STATE_CLOSE_PHRASES],
};

function shortMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = raw.split("\n", 1)[0]!.trim();
  return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}

/** `example.com` from a URL; `unknown-host` when it will not parse. */
function hostFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

async function scan(page: Page): Promise<ScanResult | undefined> {
  try {
    return await page.evaluate(scanOverlaysInBrowser, {
      ...SCAN_CONFIG,
      initialPaintStateKey: INITIAL_PAINT_STATE_KEY,
    });
  } catch {
    return undefined;
  }
}

async function probe(page: Page, domPath: string): Promise<ProbeResult | undefined> {
  try {
    return await page.evaluate(probeOverlayInBrowser, {
      domPath,
      opacityThreshold: SCROLL_REVEAL_OPACITY_THRESHOLD,
    });
  } catch {
    return undefined;
  }
}

/**
 * A wait that cannot reject. `page.waitForTimeout` throws once the page,
 * context or browser has gone away, and this module's whole contract is that a
 * normalization failure degrades to "we changed nothing and here is why" rather
 * than costing the observation.
 */
async function pause(page: Page, ms: number): Promise<void> {
  try {
    await page.waitForTimeout(ms);
  } catch {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}

async function screenshot(page: Page): Promise<Buffer | undefined> {
  try {
    return await page.screenshot({ type: "png" });
  } catch {
    return undefined;
  }
}

/**
 * Run the normalization phase. NEVER throws: a failure here degrades to "we
 * changed nothing and here is why", because losing an observation is strictly
 * worse than shipping one with a popup in it.
 */
export async function normalizePageState(
  page: Page,
  options: NormalizePageStateOptions,
): Promise<PageStateNormalization> {
  try {
    // Task 28.75 — CALL 2 of the two-call contract is self-sufficient: it
    // installs the `__name` shim its own serialized passes need, so a caller
    // outside the observer cannot lose the phase to a missing shim.
    await installBrowserNameShim(page);
    return await runNormalizePageState(page, options);
  } catch (err) {
    // The contract is absolute: this phase may never cost an observation. An
    // escape here is a defect in THIS module, so it is recorded as loudly as
    // possible and the observation continues.
    return {
      ...pageStateNormalizationSkipped(),
      ran: true,
      limitations: [
        "page-state normalization aborted unexpectedly and changed nothing: " +
          shortMessage(err),
      ],
    };
  }
}

async function runNormalizePageState(
  page: Page,
  options: NormalizePageStateOptions,
): Promise<PageStateNormalization> {
  const log = options.onLog ?? ((): void => {});
  const evidenceRoot = options.evidenceRoot ?? PAGE_STATE_EVIDENCE_ROOT_DEFAULT;
  const attempts: PageStateNormalizationAttempt[] = [];
  const limitations: string[] = [];
  let scans = 0;
  let dismissed = 0;
  let attemptCapHit = false;
  let structuralMatches = 0;
  let headerLikeRefused = 0;
  let panelMatches = 0;
  let qualifiedSeen = 0;
  let initialPaintCensusAvailable = false;
  let initialPaintCensusStatus: PageStateNormalization["initialPaintCensusStatus"] =
    "absent";

  const finish = (): PageStateNormalization => ({
    ran: true,
    scans,
    structuralMatches,
    headerLikeRefused,
    panelMatches,
    qualified: qualifiedSeen,
    dismissed,
    attempts,
    attemptCapHit,
    initialPaintCensusAvailable,
    initialPaintCensusStatus,
    limitations,
  });

  const scanStart = Date.now();
  const handled = new Set<string>();

  while (attempts.length < MAX_PAGE_STATE_DISMISSALS) {
    const result = await scan(page);
    scans++;
    if (!result) {
      limitations.push(
        "the page-state scan could not run (the execution context went away); " +
          "nothing was dismissed",
      );
      return finish();
    }
    structuralMatches = Math.max(structuralMatches, result.structuralMatches);
    headerLikeRefused = Math.max(headerLikeRefused, result.headerLikeRefused);
    panelMatches = Math.max(panelMatches, result.panelMatches);
    initialPaintCensusAvailable = result.initialPaintCensusAvailable;
    initialPaintCensusStatus = result.initialPaintCensusStatus;
    if (!result.initialPaintCensusAvailable) {
      // Task 28.75 — the DEGRADATION IS RECORDED, and it names both the reason
      // and the missing call, because a caller outside the observer that skips
      // `markInitialPaintCensus` otherwise loses a STRONG signal in silence.
      const reason =
        result.initialPaintCensusStatus === "absent"
          ? "no initial-paint census was installed on this page-load " +
            "(`markInitialPaintCensus` was not called after `load` — see " +
            "docs/result/28.75/page-state-api-contract.md)"
          : result.initialPaintCensusStatus === "partial"
            ? "the initial-paint census hit its element cap and is PARTIAL, " +
              "which is refused on purpose (an element it never reached looks " +
              "exactly like one that did not exist yet)"
            : "the initial-paint census could not be read";
      const limitation =
        `${reason}, so \`appeared-after-initial-paint\` could not contribute ` +
        "evidence on this page-load";
      if (!limitations.includes(limitation)) limitations.push(limitation);
    }
    const candidate = result.candidates.find(
      (c) => c.qualified && !handled.has(c.domPath),
    );
    if (!candidate) {
      // Nothing qualifies YET. Entry popups are commonly delayed, so rescan
      // until the bounded scan window closes.
      if (Date.now() - scanStart >= PAGE_STATE_SCAN_MAX_MS) break;
      await pause(page, PAGE_STATE_SCAN_INTERVAL_MS);
      continue;
    }
    qualifiedSeen = Math.max(qualifiedSeen, result.qualified);
    handled.add(candidate.domPath);

    const index = attempts.length + 1;
    const evidenceDir = path.join(
      evidenceRoot,
      hostFolder(options.observationUrl),
      `${options.pageId}-${options.viewportId}-${String(index)}`,
    );
    const before = await probe(page, candidate.domPath);
    const beforePng = await screenshot(page);

    const method: "close-control" | "escape" = candidate.closeControlPath
      ? "close-control"
      : "escape";
    // Escape is a FALLBACK and only with declared-dialog evidence: pressing it
    // on a page that merely has a big positioned element can close a native
    // <details>, a custom menu, or nothing at all.
    if (
      method === "escape" &&
      !candidate.strongSignals.includes("declared-dialog")
    ) {
      limitations.push(
        `overlay ${candidate.fingerprint} qualified but exposed no close ` +
          "control and carries no declared-dialog evidence, so nothing was " +
          "attempted (Escape is not a blind fallback)",
      );
      continue;
    }

    const urlBefore = page.url();
    let outcome: PageStateNormalizationAttempt["outcome"] = "not-dismissed";
    let actionError: string | undefined;
    try {
      if (method === "close-control" && candidate.closeControlPath) {
        // NEVER `force: true` — an actionability failure is a RESULT to record.
        await page
          .locator(candidate.closeControlPath)
          .first()
          .click({ timeout: PAGE_STATE_ACTION_TIMEOUT_MS });
      } else {
        await page.keyboard.press("Escape");
      }
    } catch (err) {
      outcome = "click-error";
      actionError = shortMessage(err);
      if (isNavigationDestroyedContextError(err)) outcome = "navigated";
    }

    if (outcome !== "click-error") {
      await pause(page, PAGE_STATE_ACTION_SETTLE_MS);
    }

    // --- did the action navigate? -----------------------------------------
    let urlAfter = urlBefore;
    try {
      urlAfter = page.url();
    } catch {
      urlAfter = urlBefore;
    }
    const navigated = outcome === "navigated" || urlAfter !== urlBefore;

    const afterPng = await screenshot(page);
    const after = await probe(page, candidate.domPath);

    if (navigated) {
      outcome = "navigated";
      limitations.push(
        `dismissing ${candidate.fingerprint} navigated the page to ${urlAfter}; ` +
          "the normalization phase stopped and the observation URL was restored",
      );
      try {
        await page.goto(options.observationUrl, {
          waitUntil: "load",
          timeout: NAV_TIMEOUT_MS,
        });
      } catch (err) {
        limitations.push(
          `restoring ${options.observationUrl} after that navigation failed: ` +
            shortMessage(err),
        );
      }
    } else if (outcome !== "click-error") {
      const coverageBefore = before?.coverage ?? candidate.coverage;
      const coverageAfter = after?.coverage ?? 0;
      const gone = !after?.present || coverageAfter < OVERLAY_SHAPE.minAreaCoverage;
      const heightMoved =
        before !== undefined &&
        after !== undefined &&
        Math.abs(after.documentHeight - before.documentHeight) > 1;
      const lockReleased =
        before?.pageScrollLocked === true && after?.pageScrollLocked === false;
      if (!gone) {
        outcome = "not-dismissed";
      } else if (!heightMoved && !lockReleased && coverageAfter >= coverageBefore) {
        // The overlay reports gone but nothing about the page moved. Recorded
        // distinctly rather than counted as a win.
        outcome = "no-geometry-change";
      } else {
        outcome = "dismissed";
        dismissed++;
      }
    }

    const attempt: PageStateNormalizationAttempt = {
      index,
      fingerprint: candidate.fingerprint,
      domPath: candidate.domPath,
      signals: candidate.signals,
      shapeClass: candidate.shapeClass,
      widthCoverage: candidate.widthCoverage,
      heightCoverage: candidate.heightCoverage,
      method,
      ...(candidate.closeControlLabel
        ? { closeControlLabel: candidate.closeControlLabel }
        : {}),
      ...(candidate.closeControlLabelSource
        ? { closeControlLabelSource: candidate.closeControlLabelSource }
        : {}),
      ...(candidate.closeControlPath
        ? { closeControlPath: candidate.closeControlPath }
        : {}),
      outcome,
      documentHeightBefore: before?.documentHeight ?? 0,
      documentHeightAfter: after?.documentHeight ?? 0,
      overlayCoverageBefore: before?.coverage ?? candidate.coverage,
      overlayCoverageAfter: after?.coverage ?? 0,
      pageScrollLockedBefore: before?.pageScrollLocked ?? false,
      pageScrollLockedAfter: after?.pageScrollLocked ?? false,
      evidenceDir,
      ...(actionError ? { error: actionError } : {}),
    };
    attempts.push(attempt);

    // --- EVIDENCE, for every attempt, successful or not --------------------
    try {
      await mkdir(evidenceDir, { recursive: true });
      if (beforePng) await writeFile(path.join(evidenceDir, "before.png"), beforePng);
      if (afterPng) await writeFile(path.join(evidenceDir, "after.png"), afterPng);
      await writeFile(
        path.join(evidenceDir, "record.json"),
        JSON.stringify(
          {
            url: options.observationUrl,
            urlAtAction: urlBefore,
            urlAfterAction: urlAfter,
            viewport: options.viewportId,
            pageId: options.pageId,
            overlay: {
              tagName: candidate.tagName,
              fingerprint: candidate.fingerprint,
              domPath: candidate.domPath,
              position: candidate.position,
              zIndex: candidate.zIndex,
              viewportCoverageBefore: attempt.overlayCoverageBefore,
              viewportCoverageAfter: attempt.overlayCoverageAfter,
              widthCoverage: candidate.widthCoverage,
              heightCoverage: candidate.heightCoverage,
              // Task 28.75 — WHICH tier admitted it, and the exact arithmetic
              // the COVER gate would have used, so the verdict is auditable
              // from the evidence alone.
              shapeClass: candidate.shapeClass,
              coverGate: {
                minWidthCoverage: OVERLAY_SHAPE.minWidthCoverage,
                minHeightCoverage: OVERLAY_SHAPE.minHeightCoverage,
                minAreaCoverage: OVERLAY_SHAPE.minAreaCoverage,
                wouldAdmit: candidate.shapeClass === "cover",
              },
            },
            signals: candidate.signals,
            strongSignals: candidate.strongSignals,
            closeControl:
              method === "close-control"
                ? {
                    foundBy: "label-vocabulary-match-inside-overlay",
                    path: candidate.closeControlPath,
                    label: candidate.closeControlLabel,
                    labelSource: candidate.closeControlLabelSource,
                  }
                : null,
            method,
            outcome,
            geometry: {
              documentHeightBefore: attempt.documentHeightBefore,
              documentHeightAfter: attempt.documentHeightAfter,
              pageScrollLockedBefore: attempt.pageScrollLockedBefore,
              pageScrollLockedAfter: attempt.pageScrollLockedAfter,
              changed:
                attempt.documentHeightBefore !== attempt.documentHeightAfter ||
                attempt.pageScrollLockedBefore !== attempt.pageScrollLockedAfter ||
                attempt.overlayCoverageBefore !== attempt.overlayCoverageAfter,
            },
            error: actionError ?? null,
            beforeScreenshot: beforePng ? "before.png" : null,
            afterScreenshot: afterPng ? "after.png" : null,
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
    } catch (err) {
      limitations.push(
        `page-state evidence could not be written to ${evidenceDir}: ` +
          shortMessage(err),
      );
    }

    log(
      `[normalize] ${outcome} — ${candidate.fingerprint} (${candidate.shapeClass}` +
        ` w=${String(candidate.widthCoverage)} h=${String(candidate.heightCoverage)})` +
        ` via ${method}` +
        (candidate.closeControlLabel ? ` ("${candidate.closeControlLabel}")` : "") +
        ` [${candidate.signals.join("+")}] → ${evidenceDir}`,
    );

    if (navigated) break;
    if (attempts.length >= MAX_PAGE_STATE_DISMISSALS) {
      // Only a CAP if something still qualifies; re-scan cheaply to find out.
      const after2 = await scan(page);
      scans++;
      if (after2 && after2.candidates.some((c) => c.qualified)) {
        attemptCapHit = true;
        limitations.push(
          `the ${String(MAX_PAGE_STATE_DISMISSALS)}-dismissal cap was reached ` +
            "and an overlay still qualifies; the observation continues with it " +
            "in place",
        );
      }
      break;
    }
  }

  return finish();
}

/** The record written when the phase was opted out of. */
export function pageStateNormalizationSkipped(): PageStateNormalization {
  return {
    ran: false,
    scans: 0,
    structuralMatches: 0,
    headerLikeRefused: 0,
    panelMatches: 0,
    qualified: 0,
    dismissed: 0,
    attempts: [],
    attemptCapHit: false,
    initialPaintCensusAvailable: false,
    initialPaintCensusStatus: "absent",
    limitations: [
      "page-state normalization was disabled (--no-normalize-page-state), so an " +
        "entry popup open at capture time is observed as part of the page",
    ],
  };
}
