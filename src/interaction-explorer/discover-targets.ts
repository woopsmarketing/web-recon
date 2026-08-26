import type { ElementHandle, Page } from "playwright";
import {
  MAX_DISCOVERED_TARGETS,
  MAX_TARGET_BASELINE_ELEMENTS,
  MIN_DISCOVERED_TARGET_AREA,
  TARGET_TEXT_SAMPLE_LEN,
  type DiscoveredTarget,
  type TargetDiscoverySummary,
} from "./types.js";
import { captureDynamicTargetSubtree } from "./capture-state.js";
import { SKIP_TAGS } from "../observer/types.js";

/**
 * Generic user-visible interaction target discovery (Task 17 §4).
 *
 * Task 11's snapshots answer "did the state the trigger DECLARES change?".
 * They cannot answer "what did the user actually see appear?" — stripe.com's
 * mega-menu declares no `aria-controls`, so its opening was recorded only as
 * four anonymous `container-added` rows, and the clone opened nothing.
 *
 * This module closes that gap with two in-page passes:
 *
 *   BEFORE the click   a bounded baseline walk records existence + visibility
 *                      for every element the Observer would keep, holding real
 *                      element references in the page (the context is disposed
 *                      after the action, so nothing leaks).
 *
 *   AFTER the click    the same walk again, diffed against the baseline:
 *                      hidden→visible roots, newly-mounted subtree roots,
 *                      in-place content replacement hosts, visible→hidden
 *                      roots. Candidates are ranked deterministically
 *                      (declared relation first, then visible area, then
 *                      document order) and capped at
 *                      {@link MAX_DISCOVERED_TARGETS}.
 *
 * The walk policy — skip {@link SKIP_TAGS} subtrees, treat `<svg>` as opaque —
 * is the OBSERVER'S policy, deliberately, so a discovered target's
 * `structuralPath` (element-child index chain) is computed over the same tree
 * shape a SiteSpec page carries and can be matched back to a static node by
 * exact comparison. There is no similarity score and no site-specific selector
 * anywhere in this file.
 */

/** Window key parking the baseline between the two evaluate calls. */
const BASELINE_STATE_KEY = "__webReconTargetBaseline";

interface DiscoveryConfig {
  key: string;
  skipTags: string[];
  maxBaselineElements: number;
  maxTargets: number;
  minTargetArea: number;
  textSampleLen: number;
}

const DISCOVERY_CONFIG: DiscoveryConfig = {
  key: BASELINE_STATE_KEY,
  skipTags: [...SKIP_TAGS],
  maxBaselineElements: MAX_TARGET_BASELINE_ELEMENTS,
  maxTargets: MAX_DISCOVERED_TARGETS,
  minTargetArea: MIN_DISCOVERED_TARGET_AREA,
  textSampleLen: TARGET_TEXT_SAMPLE_LEN,
};

interface BaselineState {
  elements: Element[];
  index: Map<Element, number>;
  /** Baseline element index of each element's parent (-1 for the root). */
  parents: number[];
  /**
   * Task 17.1: each element's index among its parent's KEPT children, at
   * baseline time. Lets a mount host's structural path be computed in the
   * PRE-CLICK tree — the coordinates the static SiteSpec tree shares — even
   * after mounted siblings have shifted the live DOM's indices.
   */
  childIndex: number[];
  visible: boolean[];
  rects: { x: number; y: number; width: number; height: number }[];
  display: string[];
  truncated: boolean;
}

/** The serializable half of the discovery result (subtrees are captured later). */
export interface InBrowserDiscovery {
  summary: TargetDiscoverySummary;
  targets: Omit<DiscoveredTarget, "capturedSubtree">[];
}

/**
 * Record the pre-click baseline. Self-contained — serialized into the page.
 */
export function installTargetBaselineInBrowser(config: DiscoveryConfig): void {
  const store = window as unknown as Record<string, unknown>;
  const skip = new Set(config.skipTags);

  const state = {
    elements: [] as Element[],
    index: new Map<Element, number>(),
    parents: [] as number[],
    childIndex: [] as number[],
    visible: [] as boolean[],
    rects: [] as { x: number; y: number; width: number; height: number }[],
    display: [] as string[],
    truncated: false,
  };
  /** Kept-children counter per baseline element (for `childIndex`). */
  const keptChildren: number[] = [];

  const walk = (el: Element, parentIndex: number): void => {
    if (skip.has(el.tagName)) return;
    if (state.elements.length >= config.maxBaselineElements) {
      state.truncated = true;
      return;
    }
    const i = state.elements.length;
    state.elements.push(el);
    state.index.set(el, i);
    state.parents.push(parentIndex);
    state.childIndex.push(parentIndex >= 0 ? keptChildren[parentIndex]!++ : 0);
    keptChildren.push(0);
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    state.visible.push(
      style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse" &&
        rect.width > 0 &&
        rect.height > 0,
    );
    state.rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    state.display.push(style.display);
    // The Observer's rule: an inline <svg> is one opaque node.
    if (el.tagName.toLowerCase() === "svg") return;
    for (const child of Array.from(el.children)) walk(child, i);
  };

  walk(document.documentElement, -1);
  store[config.key] = state;
}

/**
 * Diff the live document against the baseline and emit ranked target
 * candidates. Self-contained — serialized into the page. Parks the selected
 * elements at `state.selected` so the Node side can obtain handles for the
 * bounded subtree capture.
 */
export function discoverTargetsInBrowser(arg: {
  trigger: Element | null;
  config: DiscoveryConfig;
}): InBrowserDiscovery {
  const { trigger, config } = arg;
  const store = window as unknown as Record<string, unknown>;
  const state = store[config.key] as (BaselineState & { selected?: Element[] }) | undefined;
  if (!state) {
    return {
      summary: {
        baselineElementCount: 0,
        baselineTruncated: false,
        candidateCount: 0,
        truncated: false,
        skippedReason: "baseline-missing",
      },
      targets: [],
    };
  }

  const skip = new Set(config.skipTags);

  const isVisible = (el: Element): boolean => {
    if (!el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden" || style.visibility === "collapse") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // --- current walk, same policy as the baseline ---------------------------
  const current: Element[] = [];
  let currentTruncated = false;
  const walk = (el: Element): void => {
    if (skip.has(el.tagName)) return;
    if (current.length >= config.maxBaselineElements) {
      currentTruncated = true;
      return;
    }
    current.push(el);
    if (el.tagName.toLowerCase() === "svg") return;
    for (const child of Array.from(el.children)) walk(child);
  };
  walk(document.documentElement);

  // --- classification ------------------------------------------------------
  const mountedSet = new Set<Element>();
  for (const el of current) if (!state.index.has(el)) mountedSet.add(el);
  const mountedRoots: Element[] = [];
  for (const el of mountedSet) {
    const parent = el.parentElement;
    if (!parent || !mountedSet.has(parent)) mountedRoots.push(el);
  }

  const appearedSet = new Set<Element>();
  const disappearedSet = new Set<Element>();
  // Baseline elements REMOVED by the action, counted against their still-
  // connected baseline parent — the signature of in-place content replacement.
  const removedByHost = new Map<Element, number>();
  for (let i = 0; i < state.elements.length; i++) {
    const el = state.elements[i]!;
    if (!el.isConnected) {
      const parentIndex = state.parents[i] ?? -1;
      const parent = parentIndex >= 0 ? state.elements[parentIndex] : undefined;
      if (parent && parent.isConnected) {
        removedByHost.set(parent, (removedByHost.get(parent) ?? 0) + 1);
      }
      continue;
    }
    const was = state.visible[i]!;
    const now = isVisible(el);
    if (!was && now) appearedSet.add(el);
    else if (was && !now) disappearedSet.add(el);
  }
  const topmostOf = (set: Set<Element>): Element[] => {
    const roots: Element[] = [];
    for (const el of set) {
      let ancestor = el.parentElement;
      let covered = false;
      while (ancestor) {
        if (set.has(ancestor)) {
          covered = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (!covered) roots.push(el);
    }
    return roots;
  };
  const appearedRoots = topmostOf(appearedSet);
  const disappearedRoots = topmostOf(disappearedSet);

  const insideAppeared = (el: Element): boolean =>
    appearedRoots.some((root) => root === el || root.contains(el));

  const mountedDescendantsOf = (root: Element): number => {
    let n = 0;
    for (const el of mountedSet) if (root === el || root.contains(el)) n++;
    return n;
  };

  // --- candidate construction ----------------------------------------------
  interface Candidate {
    el: Element;
    kind: DiscoveredTarget["kind"];
    direction: DiscoveredTarget["direction"];
    evidence: DiscoveredTarget["relationEvidence"];
    declared: boolean;
  }
  const candidates: Candidate[] = [];
  const byElement = new Map<Element, Candidate>();
  const add = (candidate: Candidate): void => {
    const existing = byElement.get(candidate.el);
    if (existing) {
      for (const evidence of candidate.evidence) {
        if (!existing.evidence.some((entry) => entry.kind === evidence.kind)) {
          existing.evidence.push(evidence);
        }
      }
      existing.declared = existing.declared || candidate.declared;
      return;
    }
    byElement.set(candidate.el, candidate);
    candidates.push(candidate);
  };

  for (const root of appearedRoots) {
    const mounted = mountedDescendantsOf(root);
    add({
      el: root,
      kind: mounted > 0 ? "existing-with-mounted-content" : "existing-visibility",
      direction: "appeared",
      evidence: [
        { kind: "visibility-change", detail: "hidden→visible" },
        ...(mounted > 0
          ? [{ kind: "newly-mounted-subtree" as const, detail: `${mounted} element(s)` }]
          : []),
      ],
      declared: false,
    });
  }
  for (const root of disappearedRoots) {
    add({
      el: root,
      kind: "existing-visibility",
      direction: "disappeared",
      evidence: [{ kind: "visibility-change", detail: "visible→hidden" }],
      declared: false,
    });
  }
  for (const root of mountedRoots) {
    if (insideAppeared(root)) continue; // already carried by its appeared host
    const host = root.parentElement;
    const hostTag = host ? host.tagName.toLowerCase() : "";
    if (
      host &&
      state.index.has(host) &&
      hostTag !== "body" &&
      hostTag !== "html" &&
      isVisible(host) &&
      (removedByHost.get(host) ?? 0) > 0
    ) {
      // The host both LOST baseline children and GAINED mounted ones while
      // staying visible — in-place content replacement (a tab panel). A pure
      // append (a menu mounted into a content container) is NOT this: the
      // mounted region itself is the target.
      add({
        el: host,
        kind: "content-replaced",
        direction: "content-changed",
        evidence: [
          {
            kind: "subtree-mutation",
            detail: `${removedByHost.get(host)} removed, children mounted in place`,
          },
        ],
        declared: false,
      });
      continue;
    }
    if (isVisible(root)) {
      add({
        el: root,
        kind: "newly-mounted",
        direction: "appeared",
        evidence: [
          { kind: "newly-mounted-subtree" },
          { kind: "bounding-box-appearance" },
        ],
        declared: false,
      });
      continue;
    }
    /*
     * Task 17.1 — the portal-wrapper gap. Framework portals (React floating-ui
     * and friends) mount `<div>` containers at body level whose own rect is
     * 0×0 because every child is `position: fixed/absolute`; the wrapper fails
     * the visibility gate while the overlay the USER sees — stripe's locale
     * listbox, mobile menu and bento dialog, all measured live — sits inside
     * it. Descend a bounded number of levels and surface each TOPMOST visible
     * mounted descendant as its own candidate.
     */
    const visibleDescendants: Element[] = [];
    const dig = (el: Element, depth: number): void => {
      if (depth > 10 || visibleDescendants.length >= config.maxTargets) return;
      for (const child of Array.from(el.children)) {
        if (skip.has(child.tagName)) continue;
        if (isVisible(child)) visibleDescendants.push(child);
        else dig(child, depth + 1);
      }
    };
    dig(root, 0);
    for (const descendant of visibleDescendants) {
      add({
        el: descendant,
        kind: "newly-mounted",
        direction: "appeared",
        evidence: [
          { kind: "newly-mounted-subtree", detail: "portal-descent" },
          { kind: "bounding-box-appearance" },
        ],
        declared: false,
      });
    }
  }

  // --- declared relations from the trigger ---------------------------------
  if (trigger && trigger.isConnected) {
    const declare = (
      el: Element | null,
      kind: DiscoveredTarget["relationEvidence"][number]["kind"],
      detail?: string,
    ): void => {
      if (!el) return;
      const existing = byElement.get(el);
      if (existing) {
        if (!existing.evidence.some((entry) => entry.kind === kind)) {
          existing.evidence.push({ kind, ...(detail !== undefined ? { detail } : {}) });
        }
        existing.declared = true;
        return;
      }
      /*
       * Task 17.1 — a DECLARED region that demonstrably CHANGED but was not
       * classified above. The stripe portals read the relation only after the
       * click (`aria-controls` is set on open), and the panel itself hides
       * under a 0×0 portal wrapper (see the mounted-roots descent) — the
       * author literally names the element the user saw. Admit it as a
       * candidate when — and only when — the change evidence is observable:
       * newly mounted, or hidden→visible against the baseline.
       */
      if (skip.has(el.tagName)) return;
      if (mountedSet.has(el)) {
        add({
          el,
          kind: "newly-mounted",
          direction: "appeared",
          evidence: [
            { kind, ...(detail !== undefined ? { detail } : {}) },
            { kind: "newly-mounted-subtree" },
          ],
          declared: true,
        });
        return;
      }
      const baselineIndex = state.index.get(el);
      if (
        baselineIndex !== undefined &&
        state.visible[baselineIndex] === false &&
        isVisible(el)
      ) {
        const mounted = mountedDescendantsOf(el);
        add({
          el,
          kind: mounted > 0 ? "existing-with-mounted-content" : "existing-visibility",
          direction: "appeared",
          evidence: [
            { kind, ...(detail !== undefined ? { detail } : {}) },
            { kind: "visibility-change", detail: "hidden→visible" },
          ],
          declared: true,
        });
      }
      // A declared region with NO observable change stays covered by the
      // snapshot `targets[]` channel; discovery records changes only.
    };
    const controls = trigger.getAttribute("aria-controls");
    if (controls) {
      for (const id of controls.trim().split(/\s+/)) {
        declare(document.getElementById(id), "aria-controls", id);
      }
    }
    const popoverTarget = trigger.getAttribute("popovertarget");
    if (popoverTarget) {
      declare(document.getElementById(popoverTarget), "popovertarget", popoverTarget);
    }
    if (trigger.tagName.toLowerCase() === "summary") {
      declare(trigger.closest("details"), "details-summary");
    }
    const href = trigger.getAttribute("href");
    if (href && href.startsWith("#") && href.length > 1) {
      declare(document.getElementById(href.slice(1)), "href-fragment", href.slice(1));
    }
  }

  /*
   * Task 17.1 — containment dedupe. A framework portal often yields NESTED
   * candidates: the fixed full-screen overlay, the positioner inside it, and
   * the declared panel inside that. Mounting an inner element standalone
   * strips the positioning context its captured `position: static/relative`
   * depends on, and mounting several copies duplicates content. The OUTERMOST
   * candidate carries the full observed context, so it wins; the inner
   * candidates' evidence (the declared relation above all) merges into it.
   */
  const outermost = candidates.filter(
    (candidate) =>
      !candidates.some(
        (other) =>
          other.el !== candidate.el && other.el.contains(candidate.el),
      ),
  );
  if (outermost.length < candidates.length) {
    for (const candidate of candidates) {
      if (outermost.includes(candidate)) continue;
      const outer = outermost.find(
        (other) => other.el !== candidate.el && other.el.contains(candidate.el),
      );
      if (!outer) continue;
      for (const evidence of candidate.evidence) {
        if (!outer.evidence.some((entry) => entry.kind === evidence.kind)) {
          outer.evidence.push(evidence);
        }
      }
      outer.declared = outer.declared || candidate.declared;
    }
    candidates.length = 0;
    candidates.push(...outermost);
  }

  // --- deterministic ranking ------------------------------------------------
  const areaOf = (el: Element): number => {
    if (!el.isConnected) {
      return 0;
    }
    const rect = el.getBoundingClientRect();
    return rect.width * rect.height;
  };
  const baselineArea = (el: Element): number => {
    const i = state.index.get(el);
    if (i === undefined) return 0;
    const rect = state.rects[i]!;
    return rect.width * rect.height;
  };
  const rankArea = (candidate: Candidate): number =>
    candidate.direction === "disappeared" ? baselineArea(candidate.el) : areaOf(candidate.el);

  const pathOf = (el: Element): string => {
    const indices: number[] = [];
    let cursor: Element | null = el;
    while (cursor && cursor !== document.documentElement) {
      const parent: Element | null = cursor.parentElement;
      if (!parent) break;
      let index = 0;
      for (const child of Array.from(parent.children)) {
        if (child === cursor) break;
        if (!skip.has(child.tagName)) index++;
      }
      indices.unshift(index);
      cursor = parent;
    }
    return indices.join("/");
  };

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      area: rankArea(candidate),
      path: pathOf(candidate.el),
    }))
    // A region below the minimum area is not user-visible in any meaningful
    // sense; without this, 1×1 portal anchors consume the budget ahead of the
    // real menu. Declared relations are exempt.
    .filter((entry) => entry.candidate.declared || entry.area >= config.minTargetArea)
    .sort((a, b) => {
      if (a.candidate.declared !== b.candidate.declared) {
        return a.candidate.declared ? -1 : 1;
      }
      if (a.area !== b.area) return b.area - a.area;
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });

  const selected = ranked.slice(0, config.maxTargets);
  state.selected = selected.map((entry) => entry.candidate.el);

  const normText = (value: string): string => value.replace(/\s+/g, " ").trim();
  const describeState = (
    el: Element,
    side: "before" | "after",
  ): DiscoveredTarget["before"] => {
    if (side === "before") {
      const i = state.index.get(el);
      if (i === undefined) return { exists: false };
      const rect = state.rects[i]!;
      return {
        exists: true,
        visible: state.visible[i]!,
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.y,
          right: rect.x + rect.width,
          bottom: rect.y + rect.height,
          left: rect.x,
        },
        display: state.display[i]!,
      };
    }
    if (!el.isConnected) return { exists: false };
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const ariaHidden = el.getAttribute("aria-hidden");
    const anyEl = el as unknown as Record<string, unknown>;
    return {
      exists: true,
      visible: isVisible(el),
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      hidden: anyEl.hidden === true || el.hasAttribute("hidden"),
      ...(ariaHidden !== null ? { ariaHidden } : {}),
    };
  };

  /**
   * Task 17.1 — where should a mounted copy attach? For an element that did
   * not exist before the click, find the nearest ancestor that DID (usually
   * `<body>` for a portal, a grid cell for an in-place mount), express that
   * host's path in BASELINE coordinates (resolvable against the static tree),
   * and record the mounted branch's child position under it.
   */
  const mountHostOf = (
    el: Element,
  ): { path: string; tag: string; childIndex: number } | undefined => {
    if (state.index.has(el)) return undefined; // pre-existing regions resolve directly
    let branch: Element = el;
    let host: Element | null = el.parentElement;
    while (host && !state.index.has(host)) {
      branch = host;
      host = host.parentElement;
    }
    if (!host) return undefined;
    const hostIndex = state.index.get(host)!;
    // Baseline-coordinate path of the host (skip-tag policy is the walk's own).
    const segments: number[] = [];
    let cursor = hostIndex;
    while (state.parents[cursor] !== undefined && state.parents[cursor]! >= 0) {
      segments.unshift(state.childIndex[cursor]!);
      cursor = state.parents[cursor]!;
    }
    // The branch's position among the host's kept element children, after.
    let childIndex = 0;
    for (const sibling of Array.from(host.children)) {
      if (sibling === branch) break;
      if (!skip.has(sibling.tagName)) childIndex++;
    }
    return { path: segments.join("/"), tag: host.tagName.toLowerCase(), childIndex };
  };

  const targets: InBrowserDiscovery["targets"] = selected.map((entry, rank) => {
    const el = entry.candidate.el;
    const roleRaw = el.getAttribute("role");
    const role = roleRaw ? roleRaw.trim().split(/\s+/)[0]!.toLowerCase() : undefined;
    const htmlId = el.getAttribute("id");
    const mountHost = entry.candidate.kind === "newly-mounted" ? mountHostOf(el) : undefined;
    const text = normText(el.textContent ?? "");
    // The fingerprint LENGTH ignores whitespace entirely: inter-element
    // whitespace text nodes are a serialization artifact, not content.
    const compactTextLength = text.replace(/ /g, "").length;
    const sortedEvidence = [...entry.candidate.evidence].sort((a, b) =>
      a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0,
    );
    return {
      discoveryId: "dt" + String(rank + 1).padStart(6, "0"),
      kind: entry.candidate.kind,
      direction: entry.candidate.direction,
      descriptor: {
        tagName: el.tagName.toLowerCase(),
        ...(htmlId ? { htmlId } : {}),
        ...(role !== undefined ? { role } : {}),
        structuralPath: entry.path,
        ...(mountHost !== undefined
          ? {
              mountHostPath: mountHost.path,
              mountHostTag: mountHost.tag,
              mountChildIndex: mountHost.childIndex,
            }
          : {}),
      },
      relationEvidence: sortedEvidence,
      before: describeState(el, "before"),
      after: describeState(el, "after"),
      mountedDescendantCount: mountedDescendantsOf(el),
      ...(text.length > 0 ? { textSample: text.slice(0, config.textSampleLen) } : {}),
      textLength: compactTextLength,
      provenance: "observed" as const,
    };
  });

  return {
    summary: {
      baselineElementCount: state.elements.length,
      baselineTruncated: state.truncated || currentTruncated,
      candidateCount: candidates.length,
      truncated: candidates.length > config.maxTargets,
    },
    targets,
  };
}

/** Clean up the parked baseline (also releases the element references). */
function releaseBaselineInBrowser(key: string): void {
  const store = window as unknown as Record<string, unknown>;
  delete store[key];
}

// ---------------------------------------------------------------------------
// Node-side orchestration
// ---------------------------------------------------------------------------

export async function installTargetBaseline(page: Page): Promise<void> {
  await page.evaluate(installTargetBaselineInBrowser, DISCOVERY_CONFIG);
}

export interface TargetDiscoveryResult {
  summary: TargetDiscoverySummary;
  targets: DiscoveredTarget[];
}

/**
 * Run the after-click discovery pass, then capture each selected region's
 * bounded after-state subtree with the Observer's own walk (the same
 * `captureDynamicTargetSubtree` Task 16 built for declared dynamic targets).
 */
export async function discoverUserVisibleTargets(
  page: Page,
  trigger: ElementHandle<Element> | null,
  options: { urlChanged: boolean },
): Promise<TargetDiscoveryResult> {
  if (options.urlChanged) {
    // The document was replaced; before/after describe two different pages, so
    // no visibility diff on it may become target evidence (Task 11's rule).
    await page.evaluate(releaseBaselineInBrowser, BASELINE_STATE_KEY).catch(() => {});
    return {
      summary: {
        baselineElementCount: 0,
        baselineTruncated: false,
        candidateCount: 0,
        truncated: false,
        skippedReason: "url-changed",
      },
      targets: [],
    };
  }

  const discovery = await page.evaluate(discoverTargetsInBrowser, {
    trigger,
    config: DISCOVERY_CONFIG,
  });

  const targets: DiscoveredTarget[] = [];
  for (let i = 0; i < discovery.targets.length; i++) {
    const entry = discovery.targets[i]!;
    let subtree;
    if (entry.after.exists) {
      const handle = await page.evaluateHandle(
        (arg: { key: string; index: number }) => {
          const store = window as unknown as Record<string, unknown>;
          const parked = store[arg.key] as { selected?: Element[] } | undefined;
          return parked?.selected?.[arg.index] ?? null;
        },
        { key: BASELINE_STATE_KEY, index: i },
      );
      const element = handle.asElement() as ElementHandle<Element> | null;
      if (element) {
        subtree = await captureDynamicTargetSubtree(page, element);
      }
      await handle.dispose().catch(() => {});
    }
    targets.push({ ...entry, ...(subtree ? { capturedSubtree: subtree } : {}) });
  }

  await page.evaluate(releaseBaselineInBrowser, BASELINE_STATE_KEY).catch(() => {});
  return { summary: discovery.summary, targets };
}
