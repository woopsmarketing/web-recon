import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AssetObservationSchema,
  ElementObservationSchema,
  FrameObservationSchema,
  LayoutProbeSchema,
  PageObservationSchema,
  StyleTableSchema,
  type ElementObservation,
  type FamilySwitchBisection,
  type LayoutProbe,
  type LayoutProbeFingerprint,
  type PageObservation,
  type ViewportId,
} from "../observer/types.js";
import type { ObservedSitePage } from "../multi-observer/types.js";
import { computeInlineStyleProvenance } from "../observer/inline-provenance.js";
import { decodeDocumentBytes } from "../observer/document-charset.js";
import { compileViewport, type CompiledViewport } from "./compile-viewport.js";
import type { AssetCatalogBuilder } from "./asset-catalog.js";
import type { StyleCatalogBuilder } from "./style-catalog.js";
import {
  SCHEMA_VERSION,
  sortLimitations,
  type LimitationCode,
  type PageSpec,
} from "./types.js";
import type { PageFamilyType } from "../selector/types.js";

/**
 * Compile ONE deep-observed page into a PageSpec (Task 13, items 20, 21).
 *
 * Every page Task 09 observed SUCCESSFULLY becomes a PageSpec — representatives
 * and validation samples alike (item 20). A validation sample is not a lesser
 * observation: it is a full desktop+mobile deep observation of a real URL, and
 * dropping it would throw away the only direct evidence some routes have
 * (item 16).
 *
 * The page's own artifacts are read through the Observer's OWN zod schemas, so a
 * half-written or hand-edited run fails here rather than producing a plausible
 * SiteSpec built on nonsense.
 */

const ElementArraySchema = z.array(ElementObservationSchema);
const AssetArraySchema = z.array(AssetObservationSchema);
const FrameArraySchema = z.array(FrameObservationSchema);

export interface CompilePageInput {
  /** Resolved directory of the Task 09 site run (absolute or cwd-relative). */
  siteObservationDir: string;
  page: ObservedSitePage;
  familyType: PageFamilyType;
  /** Audit-only provenance string, already relative and separator-normalized. */
  sourceObservationRef: string;
  styleBuilder: StyleCatalogBuilder;
  assetBuilder: AssetCatalogBuilder;
}

export interface CompiledPage {
  /** `patternIds` / `unknownInteractionIds` are filled in by the interaction pass. */
  spec: PageSpec;
  /** viewport → (Observer element id → SiteSpec node id). */
  nodeIdMaps: Record<ViewportId, Map<string, string>>;
}

async function readJsonFile(file: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    throw new Error(
      `cannot read ${label}: ${file} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${label} is not valid JSON: ${file} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

/** Read rendered.html, but never fail the page over it (item 29). */
async function readRenderedHtml(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

export interface ProbeAttachmentInput {
  probe: {
    tags: readonly string[];
    parents: readonly number[];
    truncated: boolean;
  };
  /** Desktop dom.json walk order: tag names. */
  elementTags: readonly string[];
  /** Each element's parent WALK INDEX: -1 for the root, -2 when unmappable. */
  elementParentIndexes: readonly number[];
}

export interface ProbeAttachment {
  aligned: boolean;
  /** How many walk indexes carry probe data (0 = nothing attaches). */
  attachCount: number;
  /** Length of the exact structural (tag + parent) prefix. */
  structuralPrefix: number;
  /**
   * Task 28.75 §07 — the matched pairs, `[probeIndex, elementIndex]`, ascending.
   *
   * Before 28.75 this was implicitly `[0,0] … [attachCount-1, attachCount-1]`,
   * because attachment could only ever be a leading prefix. It is now an
   * explicit correspondence, because the probe and the deep walk are two loads
   * of the same URL and a divergence in the middle no longer discards
   * everything after it.
   */
  pairs: ReadonlyArray<readonly [number, number]>;
}

/** An attachment smaller than this attaches nothing — too little page to trust. */
export const PROBE_PREFIX_MIN_ELEMENTS = 100;

/**
 * Task 28.75 §07 — the ALIGNMENT floor a healthy page is expected to clear.
 *
 * NOT a rule the compiler enforces — attachment is decided per element, and a
 * page that genuinely changed between the two loads must still compile. This is
 * the number the SUITES assert against a real observation, so that a collapse
 * like `linear.app /`'s (311 of 2,306 = 0.135, and later 0 of 2,291) fails
 * loudly instead of travelling through a lane, a spec compile, a reconstruction
 * and a QA run with nothing going red.
 *
 * SIZED FROM MEASUREMENT, over all 172 page/viewport probes on disk across the
 * four canary hosts (2026-09-03 → 2026-09-04), recomputed under this module's
 * path identity:
 *
 *   161 of 172 at 1.0000 (exactly aligned)
 *     8 of 172 between 0.9800 and 0.9910 (linear.app `/`, whose animated hero
 *       genuinely differs between two loads)
 *     3 of 172 at 0.0000 — every one a PROVEN capture failure: two desktop deep
 *       walks that recorded a proxy error body, and the mobile probe collapse
 *
 * The gap between 0.98 and 0.00 is the whole distribution; there is nothing in
 * between. 0.5 sits in the middle of that gap with an order of magnitude of
 * margin on both sides, which is what makes it a floor rather than a tuned
 * threshold.
 */
export const PROBE_ALIGNMENT_MIN_RATIO = 0.5;



/**
 * Task 17 §8 probe ↔ desktop-tree alignment, Task 26 revision.
 *
 * The probe walked a SEPARATE load of the same URL with the Observer's own
 * skip policy, so its element order is comparable with dom.json's — but the
 * two loads may still differ (dynamic content). The structural prefix is
 * exact tag-for-tag AND parent-for-parent equality: a paired index is the same
 * element by position in the SAME ancestry, not merely an element with the
 * same tag at the same walk offset.
 *
 * Prefix attachment: content that renders differently between the two loads —
 * a trailing third-party widget (cookie banner, chat), or an animated
 * product-UI region whose subtree mounts/unmounts over time — would otherwise
 * reject the whole page. The prefix BEFORE the first mismatch is still an
 * exact structural match on a load of the SAME URL, and every attached node
 * must additionally pass the per-node truth-sanity gate in layout inference
 * (probe truth-width box vs deep observation, ±4px), which is the real
 * arbiter of whether the probe measured the observed element. Task 17 shipped
 * this with a ≥90% coverage floor sized on a trailing-widget case; Task 26
 * measured a fresh source whose EARLY-DOM animated hero capped coverage at
 * 13% while the exact prefix fully contained the page shell the inference
 * needed, so the floor is replaced by the stronger structural prefix (parents
 * included) + the per-node gate. Everything past the first mismatch still
 * attaches nothing.
 */
export function computeProbeAttachment(
  input: ProbeAttachmentInput,
): ProbeAttachment {
  const { probe, elementTags, elementParentIndexes } = input;

  /*
   * Task 28.75 §07 — WHY THIS IS NO LONGER A PREFIX SCAN.
   *
   * MEASURED, `linear.app /`, observation `2026-09-04T17-21-07-726Z` — a
   * HEALTHY pre-lane run, so this is not the collapse, it is the steady state:
   *
   *   mobile probe walk   2,283 elements
   *   mobile deep walk    2,306 elements      difference: 23 elements, ~1%
   *   exact prefix          311 elements      ATTACHED
   *   discarded           1,995 elements      86.5% of the page
   *
   * A 1% disagreement threw away 86.5% of the width evidence, because the scan
   * stopped dead at the first mismatch — walk index 311, where the probe's
   * parent index is 292 and the deep walk's is 303. The two loads agree about
   * essentially the whole page. They disagree about the element count of ONE
   * animated hero subtree, and every element after it paid for that, because
   * an INDEX is a position and a position shifts when anything before it does.
   *
   * SO IDENTITY STOPS BEING A POSITION. Each element gets a STRUCTURAL PATH —
   * its chain of `tag[nth-of-that-tag-among-its-parent's-children]` from the
   * root — and two elements correspond when their paths are equal. That is the
   * same identity a CSS selector uses, it is independent of everything outside
   * the element's own ancestry, and it is exactly what an index was failing to
   * be: an inserted hero card renames only ITS OWN later siblings, and the rest
   * of the document keeps its identity.
   *
   * WHY NOT A DIFF WITH RESYNCHRONIZATION. That was built and measured first.
   * It recovers the same coverage (2,283) but has a failure mode this does not:
   * at a divergence it must GUESS whether to skip the probe side, the element
   * side, or both, and among a run of identical siblings every choice satisfies
   * tag-and-parent equally. Guessing wrong shifts the whole tail by one sibling
   * and attaches each node its neighbour's box — silently, since the result
   * still looks perfectly aligned. A path is not a guess.
   *
   * WHAT IT REFUSES, AND THIS IS THE POINT: an element whose path differs on
   * the two loads attaches NOTHING. That includes every later sibling of an
   * inserted node and every descendant of a changed ancestor. Conservative by
   * construction — a node either has its own measurement or it has none, and
   * it can never have someone else's.
   *
   * `aligned` is unchanged and still means full, gap-free agreement, so no
   * consumer that gates on it sees new behaviour. The old exact prefix is kept
   * as `structuralPrefix` for continuity and for the record.
   */
  const probeLength = probe.tags.length;
  const elementLength = elementTags.length;

  // The historical exact prefix, kept verbatim: it is what `aligned` means.
  const comparable = Math.min(probeLength, elementLength);
  let prefix = 0;
  while (
    prefix < comparable &&
    probe.tags[prefix] === elementTags[prefix] &&
    (probe.parents[prefix] ?? -2) === (elementParentIndexes[prefix] ?? -3)
  ) {
    prefix++;
  }
  const aligned =
    !probe.truncated &&
    probeLength === elementLength &&
    prefix === elementLength;

  /*
   * A truncated probe attaches nothing, unchanged: its walk stopped at
   * MAX_LAYOUT_PROBE_ELEMENTS, so a path built from it may be missing children
   * that exist, and an identity the artifact cannot support is worse than none.
   */
  if (probe.truncated) {
    return { aligned: false, attachCount: 0, structuralPrefix: prefix, pairs: [] };
  }

  /*
   * Path ids, interned across BOTH walks so equality is a number comparison.
   *
   * The id of an element is the id of `<parent path>/<tag>[<ordinal>]`, where
   * the ordinal counts preceding siblings of the SAME tag under the SAME
   * parent. Because a pre-order walk always emits a parent before its children,
   * the parent's id is always already known — one pass, no recursion, and the
   * interned strings stay short (a parent id is a number, not a path).
   */
  const interned = new Map<string, number>();
  const intern = (key: string): number => {
    const existing = interned.get(key);
    if (existing !== undefined) return existing;
    const id = interned.size;
    interned.set(key, id);
    return id;
  };

  const pathIds = (
    tags: readonly string[],
    parents: readonly number[],
  ): Int32Array => {
    const ids = new Int32Array(tags.length).fill(-1);
    const ordinals = new Map<string, number>();
    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i] ?? "";
      const parent = parents[i] ?? -2;
      if (parent === -1) {
        ids[i] = intern(`/${tag}`);
        continue;
      }
      // An unmappable parent, or one that is not already resolved, makes this
      // element's path unknowable — and its whole subtree's with it.
      if (parent < 0 || parent >= i) continue;
      const parentId = ids[parent]!;
      if (parentId < 0) continue;
      const bucket = `${String(parentId)}\u0000${tag}`;
      const ordinal = ordinals.get(bucket) ?? 0;
      ordinals.set(bucket, ordinal + 1);
      ids[i] = intern(`${String(parentId)}/${tag}[${String(ordinal)}]`);
    }
    return ids;
  };

  const probePaths = pathIds(probe.tags, probe.parents);
  const elementPaths = pathIds(elementTags, elementParentIndexes);

  /*
   * A path id is unique within a walk by construction (the ordinal makes it
   * so), but the map is built defensively: if a walk ever did present the same
   * path twice, the correspondence would be ambiguous, and an ambiguous
   * identity is refused rather than resolved arbitrarily.
   */
  const elementByPath = new Map<number, number>();
  const ambiguous = new Set<number>();
  for (let j = 0; j < elementLength; j++) {
    const id = elementPaths[j]!;
    if (id < 0) continue;
    if (elementByPath.has(id)) ambiguous.add(id);
    else elementByPath.set(id, j);
  }

  const pairs: Array<readonly [number, number]> = [];
  for (let i = 0; i < probeLength; i++) {
    const id = probePaths[i]!;
    if (id < 0 || ambiguous.has(id)) continue;
    const j = elementByPath.get(id);
    if (j === undefined) continue;
    pairs.push([i, j] as const);
  }

  /*
   * The element floor guards WEAK PARTIAL evidence: a handful of corresponding
   * nodes on two loads that otherwise disagree is not enough page to trust. An
   * `aligned` page is not that case — it is a total, gap-free structural match
   * of the whole tree — so it is exempt, exactly as it was before 28.75 §07
   * rewrote this function (`attachCount: aligned ? elementTags.length : ...`).
   * Without the exemption any real page under 100 walked elements — a thin
   * legal page, a 404, a redirect stub — silently loses 100% of its layout
   * evidence while still reporting `aligned: true`.
   */
  const usable = aligned || pairs.length >= PROBE_PREFIX_MIN_ELEMENTS;
  return {
    aligned,
    attachCount: usable ? pairs.length : 0,
    structuralPrefix: prefix,
    pairs: usable ? pairs : [],
  };
}

/**
 * Task 28.6 C2 — attach ONE probe artifact to ONE compiled viewport tree.
 *
 * This is the Task 17 §8 desktop attachment, extracted verbatim so the MOBILE
 * probe can run the identical decision against the MOBILE tree. Extraction, not
 * generalisation: the structural inputs, the prefix rule and the per-node write
 * are the same code the desktop path has always used.
 *
 * The caller is responsible for proving the probe belongs to this viewport (the
 * mobile path gates on `probe.profile.id === "mobile"` first). This function
 * only asks whether the probe's WALK matches the viewport's walk; it cannot
 * tell which browser context produced either one, so handing it a desktop probe
 * and a mobile tree would attach whatever prefix happened to agree. That is why
 * the context gate lives at the call site and is not optional.
 */
export function attachProbeToViewport(input: {
  probe: LayoutProbe;
  elements: readonly ElementObservation[];
  viewport: CompiledViewport;
}): {
  widths: number[];
  aligned: boolean;
  alignedElementCount: number;
  elementCount: number;
  truncated: boolean;
  /** Task 28.75 §07 — this viewport's element-node count (the denominator). */
  nodeCount: number;
  /** Task 28.75 §07 — `alignedElementCount / nodeCount`, 4 places. */
  alignmentRatio: number;
  /** Task 28.7 §27 — present only when EVERY probed width carried one. */
  fingerprints?: LayoutProbeFingerprint[];
  /**
   * Responsive Core P0 §C1.7 — the compacted style table the attached nodes'
   * `probe.s` arrays index. Present only when EVERY width carried `s`.
   */
  inlineStyleTable?: string[];
  /** Responsive Core P0 §C1.4 — element id → normalized style text per width. */
  widthStylesByElementId?: Map<string, (string | null)[]>;
  /** Review fix M5 — element id → style text at the end-of-run first-width re-measure. */
  recheckStylesByElementId?: Map<string, string | null>;
  /** Responsive Core P0 §C1.6 — carried verbatim from the probe. */
  familySwitchBisections?: FamilySwitchBisection[];
  familySwitchPairsSkipped?: number;
} {
  const { probe, elements, viewport } = input;

  const nodeById = new Map(
    viewport.spec.nodes
      .filter((node) => node.type === "element")
      .map((node) => [node.nodeId, node]),
  );

  /*
   * Structural inputs for the attachment decision: tag walk order plus each
   * element's parent WALK INDEX (-1 for the root, -2 when unmappable), so the
   * probe's own `parents` array can be compared against the compiled tree.
   */
  const elementIndexById = new Map<string, number>();
  elements.forEach((el, i) => elementIndexById.set(el.id, i));
  const elementTags: string[] = [];
  const elementParentIndexes: number[] = [];
  for (const el of elements) {
    elementTags.push(el.tagName);
    const nodeId = viewport.nodeIdByElementId.get(el.id);
    const node = nodeId !== undefined ? nodeById.get(nodeId) : undefined;
    if (!node || node.type !== "element") {
      elementParentIndexes.push(-2);
      continue;
    }
    if (node.parentNodeId === undefined) {
      elementParentIndexes.push(-1);
      continue;
    }
    const parent = nodeById.get(node.parentNodeId);
    const parentIndex =
      parent && parent.type === "element"
        ? elementIndexById.get(parent.sourceElementId)
        : undefined;
    elementParentIndexes.push(parentIndex ?? -2);
  }

  const attachment = computeProbeAttachment({
    probe: { tags: probe.tags, parents: probe.parents, truncated: probe.truncated },
    elementTags,
    elementParentIndexes,
  });

  // Task 28.75 §07 — written per MATCHED PAIR. The probe index and the element
  // index are no longer the same number once a divergence has been skipped, and
  // conflating them is precisely how a box would be attached to the wrong node.
  /*
   * Responsive Core P0 §C1.7 — the per-width `style` index arrays travel with
   * the box arrays, ALL-OR-NOTHING like the fingerprints: a probe written
   * before P0 carries none, and a half-populated array would make `-1` mean
   * two different things. The table is compacted to the entries the attached
   * nodes actually use.
   */
  const sourceTable = probe.inlineStyleTable;
  const everyWidthStyled =
    sourceTable !== undefined &&
    probe.widths.length > 0 &&
    probe.widths.every((entry) => entry.s !== undefined);
  const compactTable: string[] = [];
  const compactIndex = new Map<number, number>();
  const widthStylesByElementId = new Map<string, (string | null)[]>();
  const recheck = probe.inlineStyleRecheck;
  const recheckUsable =
    everyWidthStyled && recheck !== undefined && recheck.s.length === probe.tags.length;
  const recheckStylesByElementId = new Map<string, string | null>();
  for (const [probeIndex, elementIndex] of attachment.pairs) {
    const element = elements[elementIndex];
    if (element === undefined) continue;
    const nodeId = viewport.nodeIdByElementId.get(element.id);
    if (nodeId === undefined) continue;
    const node = nodeById.get(nodeId);
    if (!node || node.type !== "element") continue;
    let styleIndexes: number[] | undefined;
    if (everyWidthStyled) {
      const raw = probe.widths.map((entry) => entry.s![probeIndex] ?? -1);
      styleIndexes = raw.map((i) => {
        const text = i >= 0 ? sourceTable![i] : undefined;
        if (text === undefined) return -1;
        let at = compactIndex.get(i);
        if (at === undefined) {
          at = compactTable.length;
          compactTable.push(text);
          compactIndex.set(i, at);
        }
        return at;
      });
      widthStylesByElementId.set(
        element.id,
        raw.map((i) => (i >= 0 ? (sourceTable![i] ?? null) : null)),
      );
      if (recheckUsable) {
        const at = recheck!.s[probeIndex] ?? -1;
        recheckStylesByElementId.set(element.id, at >= 0 ? (sourceTable![at] ?? null) : null);
      }
    }
    node.probe = {
      x: probe.widths.map((entry) => entry.x[probeIndex] ?? 0),
      w: probe.widths.map((entry) => entry.w[probeIndex] ?? 0),
      v: probe.widths.map((entry) => entry.v[probeIndex] ?? 0),
      ...(styleIndexes !== undefined ? { s: styleIndexes } : {}),
    };
  }

  /*
   * Task 28.7 §27 — the per-width DOM-family fingerprint, carried across index
   * for index with `widths`.
   *
   * ALL-OR-NOTHING on purpose. A half-populated array would make index `i` mean
   * "no family change measured here" on one width and "no measurement here" on
   * the next, which is the exact confusion the field exists to remove; and a
   * probe artifact either predates §27 entirely or carries one per width. The
   * `every` guard is what turns a partial artifact into an honest absence.
   *
   * Deliberately OUTSIDE the `attachment.attachCount > 0` gate above: that gate
   * protects a per-ELEMENT claim (probe index i IS this page's element i) and the
   * fingerprint makes none — it is a census of the live document at a width.
   */
  const fingerprints = probe.widths.map((entry) => entry.fingerprint);
  const everyWidthFingerprinted =
    fingerprints.length > 0 && fingerprints.every((entry) => entry !== undefined);

  // Task 28.75 §07 — the denominator, so `alignedElementCount` stops being a
  // number with no scale. `elements` IS this viewport's element-node list, which
  // is exactly what the attachment could have covered.
  const nodeCount = elements.length;
  return {
    widths: probe.widths.map((entry) => entry.width),
    aligned: attachment.aligned,
    alignedElementCount: attachment.attachCount,
    elementCount: probe.tags.length,
    truncated: probe.truncated,
    nodeCount,
    alignmentRatio:
      nodeCount > 0
        ? Math.round((attachment.attachCount / nodeCount) * 10000) / 10000
        : 0,
    ...(everyWidthFingerprinted
      ? { fingerprints: fingerprints as LayoutProbeFingerprint[] }
      : {}),
    ...(everyWidthStyled
      ? { inlineStyleTable: compactTable, widthStylesByElementId }
      : {}),
    ...(recheckUsable ? { recheckStylesByElementId } : {}),
    ...(probe.familySwitchBisections !== undefined
      ? { familySwitchBisections: probe.familySwitchBisections }
      : {}),
    ...(probe.familySwitchPairsSkipped !== undefined
      ? { familySwitchPairsSkipped: probe.familySwitchPairsSkipped }
      : {}),
  };
}

/** Responsive Core P0 §C1.7 — the probe fields a summary carries verbatim. */
function probeP0Carry(attached: ReturnType<typeof attachProbeToViewport>): {
  inlineStyleTable?: string[];
  familySwitchBisections?: FamilySwitchBisection[];
  familySwitchPairsSkipped?: number;
} {
  return {
    ...(attached.inlineStyleTable !== undefined
      ? { inlineStyleTable: attached.inlineStyleTable }
      : {}),
    ...(attached.familySwitchBisections !== undefined
      ? { familySwitchBisections: attached.familySwitchBisections }
      : {}),
    ...(attached.familySwitchPairsSkipped !== undefined
      ? { familySwitchPairsSkipped: attached.familySwitchPairsSkipped }
      : {}),
  };
}

export async function compilePage(input: CompilePageInput): Promise<CompiledPage> {
  const { siteObservationDir, page, familyType, sourceObservationRef } = input;

  if (page.status !== "success" || page.pageObservationFile === undefined) {
    throw new Error(
      `page ${page.pageId} is not a successful observation (${page.status}) and must not be compiled`,
    );
  }

  const pageDir = path.join(siteObservationDir, path.dirname(page.pageObservationFile));
  const observationPath = path.join(siteObservationDir, page.pageObservationFile);
  const observation: PageObservation = PageObservationSchema.parse(
    await readJsonFile(observationPath, `${page.pageId} observation.json`),
  );

  // Task 17 §8 — the layout probe, when the Observer ran one. Missing or
  // unreadable is a normal outcome (pre-Task-17 runs), never an error.
  let probe: LayoutProbe | undefined;
  if (observation.layoutProbe !== undefined) {
    try {
      probe = LayoutProbeSchema.parse(
        await readJsonFile(
          path.join(pageDir, observation.layoutProbe.file),
          `${page.pageId} layout-probe.json`,
        ),
      );
    } catch {
      probe = undefined;
    }
  }

  /*
   * Task 28.6 C2 — the MOBILE-context probe, read through the SAME schema and
   * kept in a SEPARATE variable. `layout-probe-mobile.json` has been written on
   * every page since 28.6 W1.4 and read by nothing; this is the read.
   *
   * `mobileProbeUnreadable` separates "the observation named a mobile probe and
   * the file would not parse" from "the observation named none at all". The
   * first is a tooling failure a caller must be able to see; the second is a
   * fact about the run.
   */
  let mobileProbe: LayoutProbe | undefined;
  let mobileProbeUnreadable = false;
  if (observation.layoutProbeMobile !== undefined) {
    try {
      mobileProbe = LayoutProbeSchema.parse(
        await readJsonFile(
          path.join(pageDir, observation.layoutProbeMobile.file),
          `${page.pageId} layout-probe-mobile.json`,
        ),
      );
    } catch {
      mobileProbe = undefined;
      mobileProbeUnreadable = true;
    }
  }

  const viewportIds: ViewportId[] = ["desktop", "mobile"];
  const compiled: Partial<Record<ViewportId, CompiledViewport>> = {};
  // Responsive Core P0 §C1.4 — each viewport's own initial document text.
  const initialHtmlByViewport: Partial<Record<ViewportId, string>> = {};
  let desktopElements: ElementObservation[] | undefined;
  let mobileElements: ElementObservation[] | undefined;

  for (const viewportId of viewportIds) {
    const viewport = observation.viewports[viewportId];
    const files = viewport.files;

    const elements = ElementArraySchema.parse(
      await readJsonFile(path.join(pageDir, files.dom), `${page.pageId}/${viewportId} dom.json`),
    );
    const styleTable = StyleTableSchema.parse(
      await readJsonFile(
        path.join(pageDir, files.styles),
        `${page.pageId}/${viewportId} styles.json`,
      ),
    );
    const assets = AssetArraySchema.parse(
      await readJsonFile(
        path.join(pageDir, files.assets),
        `${page.pageId}/${viewportId} assets.json`,
      ),
    );
    const frames = FrameArraySchema.parse(
      await readJsonFile(
        path.join(pageDir, files.frames),
        `${page.pageId}/${viewportId} frames.json`,
      ),
    );
    const renderedHtml = await readRenderedHtml(path.join(pageDir, files.rendered));
    if (viewport.initialDocument?.status === "captured" && viewport.initialDocument.file) {
      // Review fix m1 — the file holds the RAW response bytes; decode with the
      // charset recorded at capture. A capture written before the fix has no
      // `charset` and a UTF-8 text file.
      const initialBytes = await readFile(
        path.join(pageDir, path.dirname(files.dom), viewport.initialDocument.file),
      ).catch(() => undefined);
      if (initialBytes !== undefined) {
        initialHtmlByViewport[viewportId] = decodeDocumentBytes(
          initialBytes,
          viewport.initialDocument.contentType,
          viewport.initialDocument.charset ?? "utf-8",
        ).html;
      }
    }
    if (viewportId === "desktop") desktopElements = elements;
    else mobileElements = elements;

    compiled[viewportId] = compileViewport({
      pageId: page.pageId,
      profile: viewport.profile,
      metadata: viewport.metadata,
      elements,
      styleTable,
      assets,
      frames,
      shadow: viewport.shadow,
      renderedHtml,
      styleBuilder: input.styleBuilder,
      assetBuilder: input.assetBuilder,
      // Task 28.5B §5 — per-viewport `:root` custom properties, when the
      // observation carries them (absent on pre-28.5B runs).
      ...(viewport.customProperties !== undefined
        ? { customProperties: viewport.customProperties }
        : {}),
    });
  }

  const desktop = compiled.desktop!;
  const mobile = compiled.mobile!;

  /*
   * Task 17 §8 — probe ↔ desktop-tree alignment. The probe walked a SEPARATE
   * page load with the Observer's own skip policy, so its element order is
   * comparable with dom.json's — but the two loads may still differ (dynamic
   * content). Exact tag-sequence equality is the whole test: aligned means
   * probe index i IS desktop element i; anything less attaches nothing.
   */
  let layoutProbeSummary: PageSpec["layoutProbe"];
  const widthStylesByViewport: Partial<Record<ViewportId, Map<string, (string | null)[]>>> =
    {};
  const recheckStylesByViewport: Partial<Record<ViewportId, Map<string, string | null>>> = {};
  if (probe && desktopElements) {
    const attached = attachProbeToViewport({
      probe,
      elements: desktopElements,
      viewport: desktop,
    });
    if (attached.widthStylesByElementId) {
      widthStylesByViewport.desktop = attached.widthStylesByElementId;
    }
    if (attached.recheckStylesByElementId) {
      recheckStylesByViewport.desktop = attached.recheckStylesByElementId;
    }
    layoutProbeSummary = {
      widths: attached.widths,
      aligned: attached.aligned,
      alignedElementCount: attached.alignedElementCount,
      elementCount: attached.elementCount,
      truncated: attached.truncated,
      nodeCount: attached.nodeCount,
      alignmentRatio: attached.alignmentRatio,
      ...(attached.fingerprints ? { fingerprints: attached.fingerprints } : {}),
      ...probeP0Carry(attached),
    };
  }

  /*
   * Task 28.6 C2 — the same attachment, run against the MOBILE tree with the
   * MOBILE probe.
   *
   * The identity assertion this whole field stands on is requirement (a): the
   * mobile probe walked the MOBILE DOM, so its arrays may be attached to the
   * mobile element list AND TO NOTHING ELSE. Two independent gates enforce it:
   *
   *   1. `profile.id === "mobile"` on the probe artifact itself. A probe that
   *      does not say which context it ran in, or says a context that is not
   *      the mobile one, is REFUSED — never attached "probably".
   *   2. `computeProbeAttachment()` against `mobileElements`, the same exact
   *      tag+parent structural prefix the desktop path uses. A probe whose walk
   *      does not match the mobile walk attaches nothing.
   *
   * Every outcome, including every refusal, lands in `layoutProbeMobile` with a
   * reason. Absence of the record means the observation named no mobile probe.
   */
  let layoutProbeMobileSummary: PageSpec["layoutProbeMobile"];
  if (mobileProbeUnreadable) {
    layoutProbeMobileSummary = {
      widths: observation.layoutProbeMobile?.widths ?? [],
      aligned: false,
      alignedElementCount: 0,
      elementCount: observation.layoutProbeMobile?.elementCount ?? 0,
      truncated: observation.layoutProbeMobile?.truncated ?? false,
      refusedReason: "probe-unreadable",
    };
  } else if (mobileProbe && mobileElements) {
    const contextId = mobileProbe.profile?.id;
    if (contextId !== "mobile") {
      /*
       * Task 28.7 §27 — a context refusal withholds the per-ELEMENT arrays and
       * NOT the fingerprint. "This probe walked the wrong tree to attach to the
       * mobile element list" and "this document rendered N elements at width W"
       * are different claims, and only the first is what the refusal is about.
       */
      const refusedFingerprints = mobileProbe.widths.map((entry) => entry.fingerprint);
      layoutProbeMobileSummary = {
        widths: mobileProbe.widths.map((entry) => entry.width),
        aligned: false,
        alignedElementCount: 0,
        elementCount: mobileProbe.tags.length,
        truncated: mobileProbe.truncated,
        nodeCount: mobileElements.length,
        alignmentRatio: 0,
        ...(contextId !== undefined ? { profileId: contextId } : {}),
        refusedReason: "probe-context-not-mobile",
        ...(refusedFingerprints.length > 0 &&
        refusedFingerprints.every((entry) => entry !== undefined)
          ? { fingerprints: refusedFingerprints as LayoutProbeFingerprint[] }
          : {}),
        // Responsive Core P0 §C1.6 — a per-DOCUMENT census like the
        // fingerprints, so it survives the per-element refusal too.
        ...(mobileProbe.familySwitchBisections !== undefined
          ? { familySwitchBisections: mobileProbe.familySwitchBisections }
          : {}),
        ...(mobileProbe.familySwitchPairsSkipped !== undefined
          ? { familySwitchPairsSkipped: mobileProbe.familySwitchPairsSkipped }
          : {}),
      };
    } else {
      const attached = attachProbeToViewport({
        probe: mobileProbe,
        elements: mobileElements,
        viewport: mobile,
      });
      if (attached.widthStylesByElementId) {
        widthStylesByViewport.mobile = attached.widthStylesByElementId;
      }
      if (attached.recheckStylesByElementId) {
        recheckStylesByViewport.mobile = attached.recheckStylesByElementId;
      }
      layoutProbeMobileSummary = {
        widths: attached.widths,
        aligned: attached.aligned,
        alignedElementCount: attached.alignedElementCount,
        elementCount: attached.elementCount,
        truncated: attached.truncated,
        nodeCount: attached.nodeCount,
        alignmentRatio: attached.alignmentRatio,
        profileId: contextId,
        ...(attached.fingerprints ? { fingerprints: attached.fingerprints } : {}),
        ...probeP0Carry(attached),
        ...(attached.alignedElementCount === 0
          ? {
              refusedReason: mobileProbe.truncated
                ? ("probe-truncated" as const)
                : ("tag-walk-mismatch" as const),
            }
          : {}),
      };
    }
  }

  /*
   * Responsive Core P0 §C1.4 — INLINE-STYLE PROVENANCE, per viewport tree.
   *
   * Runs here because this is the one place the initial document, the runtime
   * element records AND the per-width probe `style` evidence (attached above)
   * meet. An observation written before P0 has no `initialDocument` record and
   * no `inlineStyle`, and gets no new field at all.
   */
  for (const viewportId of viewportIds) {
    const viewport = observation.viewports[viewportId];
    // Stylesheet coverage travels verbatim, independent of the P0 capture.
    if (viewport.stylesheetCoverage !== undefined) {
      (viewportId === "desktop" ? desktop : mobile).spec.stylesheetCoverage =
        viewport.stylesheetCoverage;
    }
    if (viewport.initialDocument === undefined) continue;
    const target = viewportId === "desktop" ? desktop : mobile;
    const elements = viewportId === "desktop" ? desktopElements : mobileElements;
    const result = computeInlineStyleProvenance({
      elements: elements ?? [],
      initialHtml: initialHtmlByViewport[viewportId],
      ...(widthStylesByViewport[viewportId]
        ? { widthStyles: widthStylesByViewport[viewportId] }
        : {}),
      ...(recheckStylesByViewport[viewportId]
        ? { recheckStyles: recheckStylesByViewport[viewportId] }
        : {}),
    });
    for (const node of target.spec.nodes) {
      if (node.type !== "element") continue;
      const provenance = result.byElementId.get(node.sourceElementId);
      if (provenance) node.inlineStyleProvenance = provenance;
    }
    target.spec.initialDocument = {
      status: viewport.initialDocument.status,
      ...(viewport.initialDocument.reason !== undefined
        ? { reason: viewport.initialDocument.reason }
        : {}),
      ...(viewport.initialDocument.bytes !== undefined
        ? { bytes: viewport.initialDocument.bytes }
        : {}),
      ...(viewport.initialDocument.sha256 !== undefined
        ? { sha256: viewport.initialDocument.sha256 }
        : {}),
    };
    target.spec.inlineStyleProvenanceCounts = result.counts;
  }

  const limitations = new Set<LimitationCode>([
    ...desktop.spec.limitations,
    ...mobile.spec.limitations,
    "cross-viewport-node-matching-not-performed",
  ]);

  const spec: PageSpec = {
    schemaVersion: SCHEMA_VERSION,
    pageId: page.pageId,
    url: page.url,
    role: page.role,
    familyId: page.familyId,
    familyType,
    observedAt: observation.target.timestamp,
    sourceObservation: sourceObservationRef,
    documentMetadata: {
      requestedUrl: observation.viewports.desktop.metadata.requestedUrl,
      finalUrl: observation.viewports.desktop.metadata.finalUrl,
      title: observation.viewports.desktop.metadata.title,
    },
    viewports: { desktop: desktop.spec, mobile: mobile.spec },
    ...(layoutProbeSummary ? { layoutProbe: layoutProbeSummary } : {}),
    ...(layoutProbeMobileSummary
      ? { layoutProbeMobile: layoutProbeMobileSummary }
      : {}),
    // Filled in by the interaction pass; a page nobody explored keeps
    // `not-explored`, which is a coverage statement, not a claim of stillness.
    interactionCoverage: "not-explored",
    patternIds: [],
    unknownInteractionIds: [],
    limitations: sortLimitations(limitations),
  };

  return {
    spec,
    nodeIdMaps: {
      desktop: desktop.nodeIdByElementId,
      mobile: mobile.nodeIdByElementId,
    },
  };
}
