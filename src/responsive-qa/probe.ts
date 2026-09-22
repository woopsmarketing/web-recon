import {
  MAX_REGIONS,
  REGION_BOX_DEDUPE_PX,
  REGION_MIN_HEIGHT_PX,
  REGION_MIN_VIEWPORT_AREA_RATIO,
  REGION_MIN_WIDTH_RATIO,
  type ColumnContainer,
  type LeafBox,
  type LogoRowGroup,
  type LandmarkMeasure,
  type RegionAccounting,
  type RegionBox,
  type SideMeasurement,
  type VisibleTextEntry,
} from "./types.js";

/**
 * The in-page probe (Task 28.6, lane W3).
 *
 * ONE function, serialized into the page by `page.evaluate`, run identically on
 * the SOURCE and on the CLONE. That symmetry is the whole point: a harness that
 * measured the two sides with different code would manufacture differences and
 * then attribute them.
 *
 * Everything it needs is passed in as `options` so the thresholds and caps stay
 * in `types.ts` and never drift between the two sides. It has no closures, no
 * imports at run time and never writes to the page — it reads the DOM and the
 * CSSOM exactly the way the Observer's own collector does.
 *
 * SITE-AGNOSTIC BY CONSTRUCTION. There is not one selector here that names a
 * site's markup. Task 28.5C's throwaway probe queried `[data-plan]` and
 * `[class*="_row"]`, which return NOTHING on a clone — the reconstruction
 * strips source class and `data-*` identity — so its layout channel was
 * measuring the source only and silently reporting zero for the clone. Column
 * count here is derived STRUCTURALLY (cluster a flex/grid container's visible
 * children by shared top coordinate) and logo rows are found STRUCTURALLY (a
 * horizontal run of sibling image-ish boxes), so both sides answer the same
 * question with the same code.
 */

export interface ProbeOptions {
  textKeyMaxChars: number;
  maxLeafBoxes: number;
  maxColumnContainers: number;
  rowClusterTolerancePx: number;
  minColumnContainerChildren: number;
  minLogoRowItems: number;
  emptyBandRowPx: number;
  logoRowPileExtentRatio: number;
  /**
   * A box wider than this many viewports is treated as a full-bleed wrapper and
   * left out of the `contentMaxRight` / landmark `maxRight` STATISTICS. It is
   * counted every time it is left out (item C3.3) and it is never left out of a
   * clipping or overflow test.
   */
  wideElementViewportFactor: number;
  /**
   * Region-census knobs (Task 28.75). OPTIONAL, and the probe falls back to
   * {@link REGION_CENSUS_DEFAULTS}'s values written out as a literal below.
   *
   * WHY THE DUPLICATION IS DELIBERATE. `probeInBrowser` is serialized with
   * `Function.prototype.toString` and executed in the page: nothing in this
   * module's scope crosses over, so the fallback CANNOT reference the exported
   * constant. The only two alternatives were to make these fields required —
   * which would edit `capture.ts`'s `PROBE_OPTIONS`, owned by another lane —
   * or to leave the numbers undocumented. The literal is instead pinned to the
   * exported record by a check in `scripts/smoke-responsive-qa.ts` that reads
   * the probe's own source text, so a drift between the two is a red test
   * rather than a silent difference between what is documented and what runs.
   */
  regionCensus?: RegionCensusConfig;
}

/** The four selection thresholds and the cap, as the probe reads them. */
export interface RegionCensusConfig {
  minWidthRatio: number;
  minHeightPx: number;
  minViewportAreaRatio: number;
  dedupeTolerancePx: number;
  maxRegions: number;
}

/**
 * What the census uses when the caller passes no `regionCensus`, sourced from
 * the documented constants in `types.ts`.
 *
 * The literal inside `probeInBrowser` must carry these same five numbers; the
 * suite asserts it by reading `probeInBrowser.toString()`.
 */
export const REGION_CENSUS_DEFAULTS: RegionCensusConfig = {
  minWidthRatio: REGION_MIN_WIDTH_RATIO,
  minHeightPx: REGION_MIN_HEIGHT_PX,
  minViewportAreaRatio: REGION_MIN_VIEWPORT_AREA_RATIO,
  dedupeTolerancePx: REGION_BOX_DEDUPE_PX,
  maxRegions: MAX_REGIONS,
};

/**
 * Every reason the region census can refuse a candidate, in the order it tests
 * them. Exactly one applies to each refused element, which is what makes
 * `selected + rejected === examined` hold.
 */
export const REGION_REJECTION_REASONS = [
  "inside-svg",
  "not-visible",
  "media-element",
  "no-element-children",
  "offscreen",
  "too-narrow",
  "too-short",
  "too-small",
  "duplicate-of-selected-ancestor",
  "cap-reached",
] as const;

export type RegionRejectionReason = (typeof REGION_REJECTION_REASONS)[number];

/**
 * The probe returns a {@link SideMeasurement} MINUS the overlap accounting. No
 * clock value and no random value crosses back: every field is a function of
 * the rendered DOM.
 *
 * WP-C guard 3 moved the overlap sweep to `overlap.ts`, which runs in the
 * harness on the `leaves` array below; `captureSide` merges the two halves back
 * into one `SideMeasurement`, so nothing downstream sees the seam.
 */
export type ProbeResult = Omit<
  SideMeasurement,
  | "overlapArea"
  | "overlapAreaRatio"
  | "overlapPairCount"
  | "worstOverlaps"
  | "overlapComparisonsTruncated"
  | "trueOverlapArea"
  | "trueOverlapAreaRatio"
  | "trueOverlapPairCount"
  | "duplicateImageStackArea"
  | "duplicateImageStackAreaRatio"
  | "duplicateImageStackPairCount"
  | "failedImageLayerOverlapArea"
  | "failedImageLayerOverlapAreaRatio"
  | "failedImageLayerOverlapPairCount"
  | "loadedImageLeafCount"
  | "failedImageLeafCount"
>;

/**
 * Serialized into the page. Keep it self-contained: no references to anything
 * in this module's scope, because only the function's own source crosses over.
 */
export function probeInBrowser(options: ProbeOptions): ProbeResult {
  const doc = document;
  const body = doc.body;
  const innerWidth = window.innerWidth;
  const innerHeight = window.innerHeight;

  const normalize = (raw: string): string =>
    raw.replace(/[\s ]+/g, " ").trim().toLowerCase();

  const truncateKey = (raw: string): string =>
    raw.length > options.textKeyMaxChars ? raw.slice(0, options.textKeyMaxChars) : raw;

  const IMAGE_TAGS = ["img", "svg", "canvas", "video", "picture", "iframe"];

  // -- one flat pass over every element ------------------------------------
  const all: Element[] = [];
  {
    const list = body.querySelectorAll("*");
    for (let i = 0; i < list.length; i++) all.push(list[i] as Element);
  }

  // Elements inside an <svg> are internal drawing instructions, not leaves.
  const insideSvg = new Set<Element>();
  {
    const svgs = body.querySelectorAll("svg");
    for (let i = 0; i < svgs.length; i++) {
      const inner = svgs[i]!.querySelectorAll("*");
      for (let j = 0; j < inner.length; j++) insideSvg.add(inner[j] as Element);
    }
  }

  const styleOf = new Map<Element, CSSStyleDeclaration>();
  const rectOf = new Map<Element, DOMRect>();
  const visibleSet = new Set<Element>();
  let displayNoneNodes = 0;
  let zeroOpacityNodes = 0;

  for (const el of all) {
    const cs = getComputedStyle(el);
    styleOf.set(el, cs);
    if (cs.display === "none") displayNoneNodes++;
    if (Number(cs.opacity) === 0) zeroOpacityNodes++;
    const rect = el.getBoundingClientRect();
    rectOf.set(el, rect);
  }

  // -- ONE definition of "visible", used by BOTH censuses (item G1) ---------
  //
  // THE DEFECT THIS REPAIRS. The BOX census tested `Number(cs.opacity) !== 0`
  // on the element itself; the TEXT census tested only `display` and
  // `visibility`. So on a source that holds scroll-reveal targets at
  // `opacity: 0` — ScrollReveal, AOS, WOW.js, framer-motion's
  // `initial={{opacity: 0}}` — a clone that BAKES that instant permanently
  // painted whole blocks blank to a reader while `missing-text-ratio`, the
  // rubric's primary BLOCKER channel, read 0.0000. Measured on seoultone.kr:
  // 124 of 1,281 baked style blocks carry `opacity: 0` (2,644 declarations),
  // several content blocks are blank in the `/ @1440` composite, and only the
  // pixel residual saw it (0.1876 residual with an edge fraction of 0.1729 —
  // 83 % of the residual on FLAT pixels, the signature of erased blocks).
  // Under-reporting on a gate's primary channel is the FALSE-PASS direction.
  //
  // The box census was ALSO wrong in the other direction: `opacity` is not an
  // inherited property, so a box inside an `opacity: 0` wrapper has a computed
  // opacity of 1 and passed the self-only test. Both censuses now ask the same
  // question of the same ancestor chain, and every node either of them stops
  // counting because of it is COUNTED, never silently dropped.
  const displayedCache = new Map<Element, boolean>();
  const isDisplayed = (el: Element | null): boolean => {
    let cur: Element | null = el;
    const chain: Element[] = [];
    let answer = true;
    while (cur && cur !== doc.documentElement) {
      const cached = displayedCache.get(cur);
      if (cached !== undefined) {
        answer = cached;
        break;
      }
      chain.push(cur);
      // TASK 28.8 FAST (Phase F correction 2, rubric 8) — text under
      // <noscript>/<script>/<style>/<template> is markup, never painted text.
      // A live page keeps the GTM/pixel <noscript> fallbacks as raw text nodes
      // (seen on a real site as 40-60% of the "visible" source text), and the
      // clone never carries them; both sides now skip them identically.
      const tag = cur.tagName;
      if (
        tag === "NOSCRIPT" ||
        tag === "SCRIPT" ||
        tag === "STYLE" ||
        tag === "TEMPLATE"
      ) {
        answer = false;
        break;
      }
      const cs = styleOf.get(cur) ?? getComputedStyle(cur);
      if (cs.display === "none" || cs.visibility === "hidden") {
        answer = false;
        break;
      }
      cur = cur.parentElement;
    }
    for (const node of chain) displayedCache.set(node, answer);
    return answer;
  };

  // `opacity: 0` ANYWHERE up the chain paints nothing, and unlike `visibility`
  // the property does not inherit, so the chain must be walked explicitly.
  const opaqueCache = new Map<Element, boolean>();
  const isOpaqueChain = (el: Element | null): boolean => {
    let cur: Element | null = el;
    const chain: Element[] = [];
    let answer = true;
    while (cur && cur !== doc.documentElement) {
      const cached = opaqueCache.get(cur);
      if (cached !== undefined) {
        answer = cached;
        break;
      }
      chain.push(cur);
      const cs = styleOf.get(cur) ?? getComputedStyle(cur);
      if (Number(cs.opacity) === 0) {
        answer = false;
        break;
      }
      cur = cur.parentElement;
    }
    for (const node of chain) opaqueCache.set(node, answer);
    return answer;
  };

  // A shadow-aware displayed test: inside a shadow tree `parentElement` stops
  // at the tree's top element, so the chain is continued through the HOST.
  const throughHosts = (
    el: Element | null,
    test: (node: Element) => boolean,
  ): boolean => {
    let cur: Element | null = el;
    while (cur) {
      if (!test(cur)) return false;
      const root = cur.getRootNode ? cur.getRootNode() : null;
      const host =
        root && (root as ShadowRoot).host ? ((root as ShadowRoot).host as Element) : null;
      if (!host) break;
      cur = host;
    }
    return true;
  };
  const isDisplayedDeep = (el: Element | null): boolean => throughHosts(el, isDisplayed);
  const isOpaqueChainDeep = (el: Element | null): boolean =>
    throughHosts(el, isOpaqueChain);

  // The box census, now asking the SAME question. The two exclusion populations
  // are counted apart so a reader can see exactly what the unification removed:
  // `opacityHiddenByAncestorNodes` is the population the old BOX rule counted as
  // visible, and `opacityHiddenTextChars` below is what the old TEXT rule did.
  let opacityHiddenNodes = 0;
  let opacityHiddenByAncestorNodes = 0;
  for (const el of all) {
    const cs = styleOf.get(el)!;
    const rect = rectOf.get(el)!;
    // `display: none` anywhere up the chain yields a 0×0 rect, so the rect test
    // covers inherited invisibility without walking ancestors.
    const laidOut =
      cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0;
    if (!laidOut) continue;
    if (isOpaqueChainDeep(el)) {
      visibleSet.add(el);
      continue;
    }
    opacityHiddenNodes++;
    if (Number(cs.opacity) !== 0) opacityHiddenByAncestorNodes++;
  }

  // ITEM C3.10. This census used to be a single `createTreeWalker(body,
  // SHOW_TEXT)`, which never descends into a shadow root — so text painted by a
  // web component was invisible to it on BOTH sides, and the missing-text
  // channel (the primary BLOCKER signal) reported 0.00 % on a pair where the
  // clone demonstrably dropped a currency prefix that lived in exactly such a
  // component. Open shadow roots are now walked too, identically on both sides.
  //
  // It also used to keep a SET of distinct truncated keys while
  // `visibleTextChars` counted every occurrence at full length; the two were
  // then divided by each other. It now keeps occurrence counts and untruncated
  // character totals per key, so `sum(entry.chars) === visibleTextChars` holds
  // by construction and the ratio has one population.
  //
  // ITEM G1. It also tested `display` and `visibility` only, while the BOX
  // census tested opacity — see the visibility block above. Text under an
  // `opacity: 0` ancestor is now excluded here too, and the characters that
  // exclusion removes are counted in `opacityHiddenTextChars` so the change is
  // a measurement a reader can subtract, not a silent shift.
  let visibleTextChars = 0;
  let shadowRootsTraversed = 0;
  let shadowTextNodes = 0;
  let shadowTextChars = 0;
  let opacityHiddenTextNodes = 0;
  let opacityHiddenTextChars = 0;
  const censusMap = new Map<string, VisibleTextEntry>();
  // Task 28.75. The SAME characters, attributed to the element that paints
  // them, so the region census can total a subtree without walking the text a
  // second time under a different visibility rule. One census, two consumers.
  const ownTextChars = new Map<Element, number>();
  const countTextIn = (root: Node, inShadow: boolean): void => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = normalize(node.nodeValue ?? "");
      if (!text) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      if (!isDisplayedDeep(parent)) continue;
      if (!isOpaqueChainDeep(parent)) {
        opacityHiddenTextNodes++;
        opacityHiddenTextChars += text.length;
        continue;
      }
      visibleTextChars += text.length;
      ownTextChars.set(parent, (ownTextChars.get(parent) ?? 0) + text.length);
      if (inShadow) {
        shadowTextNodes++;
        shadowTextChars += text.length;
      }
      const truncated = text.length > options.textKeyMaxChars;
      const key = truncateKey(text);
      const entry = censusMap.get(key);
      if (entry) {
        entry.occurrences++;
        entry.chars += text.length;
        if (truncated) entry.truncated = true;
      } else {
        censusMap.set(key, { key, occurrences: 1, chars: text.length, truncated });
      }
    }
  };
  countTextIn(body, false);
  {
    // Open shadow roots, hosts inside shadow trees included. A CLOSED root
    // exposes no handle to script at all, so it cannot even be counted; the run
    // artifact carries that as a named limitation.
    const pending: ShadowRoot[] = [];
    const seen = new Set<ShadowRoot>();
    const collect = (scope: ParentNode): void => {
      const list = scope.querySelectorAll("*");
      for (let i = 0; i < list.length; i++) {
        const root = (list[i] as Element).shadowRoot;
        if (root && !seen.has(root)) {
          seen.add(root);
          pending.push(root);
        }
      }
    };
    collect(body);
    for (let i = 0; i < pending.length; i++) {
      const root = pending[i]!;
      shadowRootsTraversed++;
      countTextIn(root, true);
      collect(root);
    }
  }
  const visibleTextEntries = Array.from(censusMap.values()).sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );

  // -- geometry ------------------------------------------------------------
  const de = doc.documentElement;
  const scrollWidth = de.scrollWidth;
  const scrollHeight = de.scrollHeight;
  let overflowingNodes = 0;
  let overflowingTextChars = 0;
  let offscreenNodes = 0;
  let offscreenTextChars = 0;
  for (const el of all) {
    if (!visibleSet.has(el)) continue;
    const rect = rectOf.get(el)!;
    const leafChars =
      el.childElementCount === 0 ? (el.textContent ?? "").trim().length : 0;
    if (rect.left >= innerWidth - 1) {
      offscreenNodes++;
      offscreenTextChars += leafChars;
    } else if (rect.right > innerWidth + 1) {
      overflowingNodes++;
      overflowingTextChars += leafChars;
    }
  }

  // -- leaf boxes (the unit of cross-side correspondence) -------------------
  const tagPathOf = (el: Element): string => {
    const segments: string[] = [];
    let cur: Element | null = el;
    let depth = 0;
    while (cur && cur !== body && depth < 24) {
      const tag = cur.tagName.toLowerCase();
      const parent: Element | null = cur.parentElement;
      let index = 0;
      if (parent) {
        for (let i = 0; i < parent.children.length; i++) {
          const sibling = parent.children[i]!;
          if (sibling === cur) break;
          if (sibling.tagName.toLowerCase() === tag) index++;
        }
      }
      segments.push(index === 0 ? tag : `${tag}[${index}]`);
      cur = parent;
      depth++;
    }
    segments.reverse();
    return segments.join("/");
  };

  const leaves: LeafBox[] = [];
  let textLeafCount = 0;
  let imageLeafCount = 0;
  let leavesTruncated = false;

  for (const el of all) {
    if (leaves.length >= options.maxLeafBoxes) {
      leavesTruncated = true;
      break;
    }
    if (insideSvg.has(el)) continue;
    if (!visibleSet.has(el)) continue;
    const tag = el.tagName.toLowerCase();
    const rect = rectOf.get(el)!;
    const isImage = IMAGE_TAGS.indexOf(tag) !== -1;
    if (isImage) {
      const label = normalize(
        el.getAttribute("alt") ??
          el.getAttribute("aria-label") ??
          el.getAttribute("title") ??
          "",
      );
      const key =
        label.length > 0
          ? `i:${tag}|${truncateKey(label)}`
          : `p:${tag}|${tagPathOf(el)}`;
      // WP-C guard 3. Two facts about an image leaf that no channel could see
      // before, both read here because only the DOM has them:
      //
      //   loaded    did the backing asset actually decode and paint. LEFT
      //             UNDEFINED when the question does not apply — an inline
      //             <svg>, a <canvas>, an <iframe> have no load state script
      //             can read — because "unknown" and "broken" are different
      //             facts and conflating them would invent resource failures.
      //   ownerKey  the OUTERMOST image element enclosing this one. A
      //             <picture> and the <img> inside it are two leaves with the
      //             same box, different tags and therefore different keys, and
      //             they are one picture on screen. The owner is what says so.
      let loaded: boolean | undefined;
      let ownerEl: Element = el;
      let ancestor: Element | null = el.parentElement;
      let hops = 0;
      while (ancestor && ancestor !== body && hops < 8) {
        if (IMAGE_TAGS.indexOf(ancestor.tagName.toLowerCase()) !== -1) ownerEl = ancestor;
        ancestor = ancestor.parentElement;
        hops++;
      }
      const rasterEl =
        tag === "img" ? el : tag === "picture" ? el.querySelector("img") : null;
      if (rasterEl) {
        const img = rasterEl as HTMLImageElement;
        loaded = img.complete === true && img.naturalWidth > 0;
      }
      leaves.push({
        key,
        kind: "image",
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        chars: 0,
        ...(loaded === undefined ? {} : { loaded }),
        ownerKey: tagPathOf(ownerEl),
      });
      imageLeafCount++;
      continue;
    }
    if (el.childElementCount !== 0) continue;
    const text = normalize(el.textContent ?? "");
    if (!text) continue;
    leaves.push({
      key: `t:${truncateKey(text)}`,
      kind: "text",
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      chars: text.length,
    });
    textLeafCount++;
  }

  // -- region census (Task 28.75) ------------------------------------------
  //
  // A REGION is a meaningful visual container: a hero, a card row, a sidebar,
  // one half of a two-up section. The blank-region channel asks, of each one,
  // "the source paints this rectangle — does the clone paint the corresponding
  // one?", which is the only question that can see a hole on a page whose
  // totals balance.
  //
  // SELECTION IS CONTENT-FREE, ON PURPOSE. Geometry (wide enough, tall enough,
  // big enough) and structure (not a duplicate of an enclosing region) decide;
  // nothing about what is inside does. If a populated container were the test,
  // the clone side would refuse to select exactly the empty boxes this channel
  // exists to find, and the source region would then pair with nothing — a
  // silent false PASS. The content numbers below are MEASUREMENTS of a selected
  // box, never conditions on selecting it.
  //
  // EVERY REFUSAL IS COUNTED. `examined` is every element in the body;
  // `selected + rejected === examined`; one reason applies per refused element,
  // tested in the order listed in `REGION_REJECTION_REASONS`.
  const regionCensus = options.regionCensus ?? {
    minWidthRatio: 0.2,
    minHeightPx: 60,
    minViewportAreaRatio: 0.02,
    dedupeTolerancePx: 4,
    maxRegions: 400,
  };
  const minRegionWidth = innerWidth * regionCensus.minWidthRatio;
  const minRegionArea =
    Math.max(1, innerWidth * innerHeight) * regionCensus.minViewportAreaRatio;
  const regions: RegionBox[] = [];
  const regionIndexOf = new Map<Element, number>();
  const rejectTally = new Map<string, number>();
  let regionsExamined = 0;
  let regionsRejected = 0;
  let regionsTruncated = false;
  const refuseRegion = (reason: string): void => {
    regionsRejected++;
    rejectTally.set(reason, (rejectTally.get(reason) ?? 0) + 1);
  };

  for (const el of all) {
    regionsExamined++;
    if (insideSvg.has(el)) {
      refuseRegion("inside-svg");
      continue;
    }
    if (!visibleSet.has(el)) {
      refuseRegion("not-visible");
      continue;
    }
    // A picture IS content; it is not a container that could be found empty.
    // Left in, an <img> becomes a region whose only leaf is itself, so its
    // paint occupancy is 1.0 by construction on BOTH sides and the region can
    // never say anything. `image-layer-state` owns a picture that fails.
    if (IMAGE_TAGS.indexOf(el.tagName.toLowerCase()) !== -1) {
      refuseRegion("media-element");
      continue;
    }
    // Same argument structurally: an element with no element children holds
    // text or nothing, and either way it is a leaf, not a place content lives.
    if (el.childElementCount === 0) {
      refuseRegion("no-element-children");
      continue;
    }
    // CLIP TO WHAT A READER CAN SEE. A carousel track is 5,000px wide with
    // four fifths of itself parked outside the viewport, and its unclipped box
    // was 20.8M px² on severance @1440 — 16 viewports of "region" that nobody
    // can look at. Every gate below, the dedupe and the blank arithmetic all
    // run on the clipped box, so the channel's unit stays "screen a reader
    // sees" rather than "layout coordinate space".
    const raw = rectOf.get(el)!;
    const rect = {
      left: Math.max(0, raw.left),
      right: Math.min(innerWidth, raw.right),
      top: Math.max(0, raw.top),
      bottom: Math.min(scrollHeight, raw.bottom),
      width: 0,
      height: 0,
    };
    rect.width = rect.right - rect.left;
    rect.height = rect.bottom - rect.top;
    if (rect.width <= 0 || rect.height <= 0) {
      refuseRegion("offscreen");
      continue;
    }
    if (rect.width < minRegionWidth) {
      refuseRegion("too-narrow");
      continue;
    }
    if (rect.height < regionCensus.minHeightPx) {
      refuseRegion("too-short");
      continue;
    }
    if (rect.width * rect.height < minRegionArea) {
      refuseRegion("too-small");
      continue;
    }
    // Wrapper chains: three nested divs with one visual box are ONE region.
    // Every already-selected ANCESTOR is checked, not just the nearest, so an
    // inset middle layer cannot let the outer box back in through its child.
    let duplicate = false;
    {
      let ancestor: Element | null = el.parentElement;
      while (ancestor && ancestor !== body) {
        const index = regionIndexOf.get(ancestor);
        if (index !== undefined) {
          const box = regions[index]!;
          if (
            Math.abs(box.left - rect.left) <= regionCensus.dedupeTolerancePx &&
            Math.abs(box.right - rect.right) <= regionCensus.dedupeTolerancePx &&
            Math.abs(box.top - rect.top) <= regionCensus.dedupeTolerancePx &&
            Math.abs(box.bottom - rect.bottom) <= regionCensus.dedupeTolerancePx
          ) {
            duplicate = true;
            break;
          }
        }
        ancestor = ancestor.parentElement;
      }
    }
    if (duplicate) {
      refuseRegion("duplicate-of-selected-ancestor");
      continue;
    }
    if (regions.length >= regionCensus.maxRegions) {
      regionsTruncated = true;
      refuseRegion("cap-reached");
      continue;
    }
    let visibleDescendants = 0;
    let subtreeTextChars = ownTextChars.get(el) ?? 0;
    let imageElements = 0;
    {
      const descendants = el.getElementsByTagName("*");
      for (let i = 0; i < descendants.length; i++) {
        const node = descendants[i] as Element;
        subtreeTextChars += ownTextChars.get(node) ?? 0;
        if (!visibleSet.has(node)) continue;
        visibleDescendants++;
        if (insideSvg.has(node)) continue;
        if (IMAGE_TAGS.indexOf(node.tagName.toLowerCase()) !== -1) imageElements++;
      }
    }
    regionIndexOf.set(el, regions.length);
    regions.push({
      path: tagPathOf(el),
      tag: el.tagName.toLowerCase(),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      visibleDescendants,
      textChars: subtreeTextChars,
      imageElements,
    });
  }

  const regionAccounting: RegionAccounting = {
    examined: regionsExamined,
    selected: regions.length,
    rejected: regionsRejected,
    rejectedByReason: Array.from(rejectTally.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([reason, count]) => ({ reason, count })),
    truncated: regionsTruncated,
  };

  // -- overlap of visible leaf boxes ---------------------------------------
  //
  // WP-C guard 3. The sweep used to run HERE, in the page, because all it
  // produced was one total. It now has to attribute every pair it counts —
  // duplicated image layer, failed image asset, or a real collision — and that
  // judgement must be testable without a browser, so it moved to
  // `overlap.ts:computeOverlapAccounting`, which `capture.ts` runs on the
  // `leaves` array this function already returns. Same array, same traversal,
  // same numbers; one fewer thing computed in a place no test can reach.

  // -- whitespace ----------------------------------------------------------
  // A full-bleed wrapper is not "content" for gutter purposes, but dropping it
  // silently pointed the wrong way (item C3.3): the wider the offending box,
  // the more certainly it disappeared from the measurement. Every exclusion is
  // now counted and the unfiltered maximum is reported alongside.
  const wideLeafThreshold = innerWidth * options.wideElementViewportFactor;
  let contentMaxRight = 0;
  let contentMaxRightIncludingWide = 0;
  let contentMinLeft = innerWidth;
  let wideLeavesExcluded = 0;
  let widestExcludedLeafWidth = 0;
  for (const leaf of leaves) {
    if (leaf.right > contentMaxRightIncludingWide) {
      contentMaxRightIncludingWide = leaf.right;
    }
    const leafWidth = leaf.right - leaf.left;
    if (leafWidth > wideLeafThreshold) {
      wideLeavesExcluded++;
      if (leafWidth > widestExcludedLeafWidth) widestExcludedLeafWidth = leafWidth;
      continue;
    }
    if (leaf.right > contentMaxRight) contentMaxRight = leaf.right;
    if (leaf.left < contentMinLeft) contentMinLeft = leaf.left;
  }
  if (leaves.length === 0) contentMinLeft = 0;
  const rightGutter = Math.max(0, innerWidth - contentMaxRight);

  const rowPx = options.emptyBandRowPx;
  const rowCount = Math.max(1, Math.ceil(scrollHeight / rowPx));
  const occupied = new Uint8Array(rowCount);
  for (const leaf of leaves) {
    const from = Math.max(0, Math.floor(leaf.top / rowPx));
    const to = Math.min(rowCount - 1, Math.ceil(leaf.bottom / rowPx));
    for (let r = from; r <= to; r++) occupied[r] = 1;
  }
  let largestEmptyBandRows = 0;
  let largestEmptyBandStartRow = 0;
  let runStart = -1;
  for (let r = 0; r <= rowCount; r++) {
    const empty = r < rowCount && occupied[r] === 0;
    if (empty && runStart === -1) runStart = r;
    if (!empty && runStart !== -1) {
      const length = r - runStart;
      if (length > largestEmptyBandRows) {
        largestEmptyBandRows = length;
        largestEmptyBandStartRow = runStart;
      }
      runStart = -1;
    }
  }

  // -- landmarks -----------------------------------------------------------
  const dedupeNested = (nodes: Element[]): Element[] => {
    const kept: Element[] = [];
    for (const node of nodes) {
      let nested = false;
      for (const other of nodes) {
        if (other !== node && other.contains(node)) {
          nested = true;
          break;
        }
      }
      if (!nested) kept.push(node);
    }
    return kept;
  };

  const measureLandmark = (selector: string): LandmarkMeasure => {
    const found: Element[] = [];
    const list = doc.querySelectorAll(selector);
    for (let i = 0; i < list.length; i++) {
      const el = list[i] as Element;
      if (visibleSet.has(el)) found.push(el);
    }
    const roots = dedupeNested(found);
    let visibleLinkCount = 0;
    let visibleTextCharsIn = 0;
    let maxRight = 0;
    let maxRightIncludingWide = 0;
    let wideElementsExcluded = 0;
    let widestExcludedWidth = 0;
    let fullyInsideViewport = true;
    for (const root of roots) {
      const links = root.querySelectorAll("a[href]");
      for (let i = 0; i < links.length; i++) {
        const link = links[i] as Element;
        if (visibleSet.has(link)) visibleLinkCount++;
      }
      const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = (node.nodeValue ?? "").replace(/[\s ]+/g, " ").trim();
        if (!text) continue;
        if (!isDisplayed(node.parentElement)) continue;
        // ITEM G1: the same visibility question the page-level census asks.
        if (!isOpaqueChain(node.parentElement)) continue;
        visibleTextCharsIn += text.length;
      }
      const inner = root.querySelectorAll("*");
      const consider: Element[] = [root];
      for (let i = 0; i < inner.length; i++) consider.push(inner[i] as Element);
      for (const el of consider) {
        if (!visibleSet.has(el)) continue;
        const rect = rectOf.get(el) ?? el.getBoundingClientRect();
        if (rect.right > maxRightIncludingWide) maxRightIncludingWide = rect.right;
        // The CLIPPING test sees every box. Item C3.3: a box wider than the
        // factor is the strongest evidence a landmark overflows, so it must
        // never be the thing that hides one. Only the `maxRight` STATISTIC
        // excludes it, and every exclusion is counted.
        if (rect.right > innerWidth + 1) fullyInsideViewport = false;
        if (rect.width > innerWidth * options.wideElementViewportFactor) {
          wideElementsExcluded++;
          if (rect.width > widestExcludedWidth) widestExcludedWidth = rect.width;
          continue;
        }
        if (rect.right > maxRight) maxRight = rect.right;
      }
    }
    return {
      elementCount: roots.length,
      visibleLinkCount,
      visibleTextChars: visibleTextCharsIn,
      maxRight: Math.round(maxRight),
      maxRightIncludingWide: Math.round(maxRightIncludingWide),
      fullyInsideViewport: roots.length === 0 ? true : fullyInsideViewport,
      wideElementsExcluded,
      widestExcludedWidth: Math.round(widestExcludedWidth),
    };
  };

  const header = measureLandmark('header, [role="banner"], nav, [role="navigation"]');
  const footer = measureLandmark('footer, [role="contentinfo"]');

  // -- structural column count ---------------------------------------------
  const clusterRows = (children: Element[]): number[] => {
    const tops = children
      .map((child) => Math.round((rectOf.get(child) ?? child.getBoundingClientRect()).top))
      .sort((a, b) => a - b);
    const counts: number[] = [];
    let current = 0;
    let anchor = Number.NaN;
    for (const top of tops) {
      if (Number.isNaN(anchor) || Math.abs(top - anchor) > options.rowClusterTolerancePx) {
        if (current > 0) counts.push(current);
        anchor = top;
        current = 1;
      } else {
        current++;
      }
    }
    if (current > 0) counts.push(current);
    return counts;
  };

  const modeOf = (values: number[]): number => {
    const tally = new Map<number, number>();
    for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
    let best = 0;
    let bestCount = 0;
    for (const [value, count] of Array.from(tally.entries()).sort((a, b) => b[0] - a[0])) {
      if (count > bestCount) {
        best = value;
        bestCount = count;
      }
    }
    return best;
  };

  const columnContainers: ColumnContainer[] = [];
  let maxColumns = 0;
  for (const el of all) {
    if (!visibleSet.has(el)) continue;
    if (insideSvg.has(el)) continue;
    const cs = styleOf.get(el)!;
    const display = cs.display;
    if (
      display !== "grid" &&
      display !== "flex" &&
      display !== "inline-grid" &&
      display !== "inline-flex"
    ) {
      continue;
    }
    const children: Element[] = [];
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i]!;
      if (visibleSet.has(child)) children.push(child);
    }
    if (children.length < options.minColumnContainerChildren) continue;
    const rows = clusterRows(children);
    const modalPerRow = modeOf(rows);
    const rect = rectOf.get(el)!;
    columnContainers.push({
      path: tagPathOf(el),
      display,
      childCount: children.length,
      rowCount: rows.length,
      modalPerRow,
      containerWidth: Math.round(rect.width),
    });
    if (modalPerRow > maxColumns) maxColumns = modalPerRow;
  }
  columnContainers.sort(
    (a, b) =>
      b.childCount - a.childCount ||
      b.modalPerRow - a.modalPerRow ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
  const topColumnContainers = columnContainers.slice(0, options.maxColumnContainers);

  // -- logo rows (generic: a horizontal run of sibling image-ish boxes) -----
  const isImageish = (el: Element): boolean => {
    const tag = el.tagName.toLowerCase();
    if (IMAGE_TAGS.indexOf(tag) !== -1) return true;
    if ((el.textContent ?? "").trim().length > 0) return false;
    return el.querySelector("img, svg, canvas, video, picture") !== null;
  };

  const median = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sortedValues = values.slice().sort((a, b) => a - b);
    const middle = Math.floor(sortedValues.length / 2);
    return sortedValues.length % 2 === 1
      ? sortedValues[middle]!
      : Math.round((sortedValues[middle - 1]! + sortedValues[middle]!) / 2);
  };

  const logoRows: LogoRowGroup[] = [];
  for (const el of all) {
    if (!visibleSet.has(el)) continue;
    if (insideSvg.has(el)) continue;
    if (el.children.length < options.minLogoRowItems) continue;
    const items: Element[] = [];
    let allImageish = true;
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i]!;
      if (!visibleSet.has(child)) continue;
      if (!isImageish(child)) {
        allImageish = false;
        break;
      }
      items.push(child);
    }
    if (!allImageish) continue;
    if (items.length < options.minLogoRowItems) continue;
    const boxes = items
      .map((item) => rectOf.get(item) ?? item.getBoundingClientRect())
      .sort((a, b) => a.left - b.left);
    const firstTop = boxes[0]!.top;
    let sameRow = true;
    for (const box of boxes) {
      if (Math.abs(box.top - firstTop) > options.rowClusterTolerancePx * 2) {
        sameRow = false;
        break;
      }
    }
    if (!sameRow) continue;
    const gaps: number[] = [];
    for (let i = 1; i < boxes.length; i++) {
      gaps.push(Math.round(boxes[i]!.left - boxes[i - 1]!.right));
    }
    const leftMost = boxes[0]!.left;
    let rightMost = boxes[0]!.right;
    for (const box of boxes) if (box.right > rightMost) rightMost = box.right;
    const containerRect = rectOf.get(el)!;
    const containerWidth = Math.max(1, Math.round(containerRect.width));
    const groupExtent = Math.round(rightMost - leftMost);
    const extentRatio = Math.round((groupExtent / containerWidth) * 10_000) / 10_000;
    const groupCentre = (leftMost + rightMost) / 2;
    const containerCentre = containerRect.left + containerRect.width / 2;
    const centred = Math.abs(groupCentre - containerCentre) < containerWidth * 0.1;
    logoRows.push({
      path: tagPathOf(el),
      itemCount: items.length,
      gaps,
      minGap: gaps.length ? Math.min(...gaps) : 0,
      medianGap: median(gaps),
      maxGap: gaps.length ? Math.max(...gaps) : 0,
      anyOverlap: gaps.some((gap) => gap < 0),
      groupExtent,
      containerWidth,
      extentRatio,
      piledTowardCentre: centred && extentRatio < options.logoRowPileExtentRatio,
    });
  }
  logoRows.sort(
    (a, b) =>
      b.itemCount - a.itemCount ||
      a.extentRatio - b.extentRatio ||
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );

  // -- media ---------------------------------------------------------------
  const videos = doc.querySelectorAll("video");
  let videosPinned = 0;
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i] as HTMLVideoElement;
    if (video.paused && video.currentTime === 0) videosPinned++;
  }

  const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

  return {
    totalNodes: all.length,
    visibleNodes: visibleSet.size,
    displayNoneNodes,
    zeroOpacityNodes,
    opacityHiddenNodes,
    opacityHiddenByAncestorNodes,
    visibleTextChars,
    visibleTextEntries,
    shadowRootsTraversed,
    shadowTextNodes,
    shadowTextChars,
    opacityHiddenTextNodes,
    opacityHiddenTextChars,

    scrollWidth,
    innerWidth,
    innerHeight,
    horizontalOverflow: Math.max(0, scrollWidth - innerWidth),
    scrollHeight,
    overflowingNodes,
    overflowingTextChars,
    offscreenNodes,
    offscreenTextChars,

    leaves,
    leavesTruncated,
    textLeafCount,
    imageLeafCount,

    regions,
    regionAccounting,

    contentMaxRight: Math.round(contentMaxRight),
    contentMaxRightIncludingWide: Math.round(contentMaxRightIncludingWide),
    wideLeavesExcluded,
    widestExcludedLeafWidth: Math.round(widestExcludedLeafWidth),
    contentMinLeft: Math.round(contentMinLeft),
    rightGutter: Math.round(rightGutter),
    rightGutterRatio: round4(rightGutter / Math.max(1, innerWidth)),
    largestEmptyBand: largestEmptyBandRows * rowPx,
    largestEmptyBandRatio: round4(
      (largestEmptyBandRows * rowPx) / Math.max(1, scrollHeight),
    ),
    largestEmptyBandTop: largestEmptyBandStartRow * rowPx,

    header,
    footer,

    columnContainers: topColumnContainers,
    maxColumns,

    logoRows: logoRows.slice(0, options.maxColumnContainers),

    videoCount: videos.length,
    videosPinned,
  };
}
