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
  type LayoutProbe,
  type PageObservation,
  type ViewportId,
} from "../observer/types.js";
import type { ObservedSitePage } from "../multi-observer/types.js";
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
  /** How many leading walk indexes carry probe data (0 = nothing attaches). */
  attachCount: number;
  /** Length of the exact structural (tag + parent) prefix. */
  structuralPrefix: number;
}

/** A prefix shorter than this attaches nothing — too little page to trust. */
export const PROBE_PREFIX_MIN_ELEMENTS = 100;

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
  const comparable = Math.min(probe.tags.length, elementTags.length);
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
    probe.tags.length === elementTags.length &&
    prefix === elementTags.length;
  const prefixUsable = !probe.truncated && prefix >= PROBE_PREFIX_MIN_ELEMENTS;
  return {
    aligned,
    attachCount: aligned ? elementTags.length : prefixUsable ? prefix : 0,
    structuralPrefix: prefix,
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

  const viewportIds: ViewportId[] = ["desktop", "mobile"];
  const compiled: Partial<Record<ViewportId, CompiledViewport>> = {};
  let desktopElements: ElementObservation[] | undefined;

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
    if (viewportId === "desktop") desktopElements = elements;

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
  if (probe && desktopElements) {
    const nodeById = new Map(
      desktop.spec.nodes
        .filter((node) => node.type === "element")
        .map((node) => [node.nodeId, node]),
    );
    /*
     * Structural inputs for the attachment decision: tag walk order plus each
     * element's parent WALK INDEX (-1 for the root, -2 when unmappable), so the
     * probe's own `parents` array can be compared against the compiled tree.
     */
    const elementIndexById = new Map<string, number>();
    desktopElements.forEach((el, i) => elementIndexById.set(el.id, i));
    const elementTags: string[] = [];
    const elementParentIndexes: number[] = [];
    for (const el of desktopElements) {
      elementTags.push(el.tagName);
      const nodeId = desktop.nodeIdByElementId.get(el.id);
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
    layoutProbeSummary = {
      widths: probe.widths.map((entry) => entry.width),
      aligned: attachment.aligned,
      alignedElementCount: attachment.attachCount,
      elementCount: probe.tags.length,
      truncated: probe.truncated,
    };
    if (attachment.attachCount > 0) {
      for (let i = 0; i < attachment.attachCount; i++) {
        const nodeId = desktop.nodeIdByElementId.get(desktopElements[i]!.id);
        if (nodeId === undefined) continue;
        const node = nodeById.get(nodeId);
        if (!node || node.type !== "element") continue;
        node.probe = {
          x: probe.widths.map((entry) => entry.x[i] ?? 0),
          w: probe.widths.map((entry) => entry.w[i] ?? 0),
          v: probe.widths.map((entry) => entry.v[i] ?? 0),
        };
      }
    }
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
