import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AssetObservationSchema,
  DOCUMENT_RESPONSE_FILE,
  ElementObservationSchema,
  InitialDocumentSchema,
  FrameObservationSchema,
  LayoutProbeSchema,
  LinkObservationSchema,
  PageObservationSchema,
  SCHEMA_VERSION,
  StyleTableSchema,
  type ObservedPage,
  type ObservedViewport,
  type PageObservation,
  type ResponsiveSummary,
  type StyleTable,
  type ViewportObservation,
  type ViewportResponsiveSummary,
  type ViewportSizeReport,
} from "./types.js";
import { assertStyleReferencesResolve } from "./dedupe-styles.js";
import {
  SOURCE_PACKAGE_DIR,
  makeSourcePackagePointer,
  writeSourcePackage,
  type SourcePackagePointer,
} from "../source-package/index.js";

/**
 * Persist a single-page RESPONSIVE observation (Phase 3; responsive in Task 05).
 *
 * One run now holds a full deep observation PER viewport, so bulk data is split
 * by viewport under `viewports/<id>/`:
 *
 *   data/<host>/<run-id>/
 *     observation.json          — run summary: target, observationProfile,
 *                                  viewports.{desktop,mobile}, responsiveSummary
 *     viewports/<id>/
 *       rendered.html           — final rendered DOM (post-JS), re-analyzable
 *       dom.json                — per-element observation with `styleId` refs
 *       styles.json             — per-viewport shared computed-style table
 *       assets.json             — referenced assets (incl. inline-SVG markup)
 *       links.json              — anchors with resolved URLs
 *       frames.json             — iframe inventory
 *       screenshot.png          — full-page screenshot
 *
 * Each viewport keeps its OWN style table and the no-dangling-`styleId`
 * invariant; the two tables are never shared (Task 05, item 11).
 *
 * Task 09 split WHERE a page is written from HOW it is written:
 *
 *   saveObservationIntoDir(dir, observed) — writes one page into any directory
 *   saveObservation(observed[, runId])    — single-page run: picks
 *                                            `data/<host>/<run-id>/`, delegates
 *
 * A multi-page site run reuses `saveObservationIntoDir` per page under
 * `pages/<page-id>/`, so the on-disk page layout is byte-for-byte the same one
 * Task 05 defined — multi-page never gets its own artifact shape.
 */

const DATA_DIR = "data";
const ENGINE = "playwright-chromium";

/**
 * Filesystem-safe, timestamp-based run id (e.g. `2026-08-13T06-19-25-364Z`).
 * This is a run-tracking / uniqueness identifier — NOT a deterministic id:
 * observing the same URL twice yields different run ids (different timestamps).
 */
export function makeRunId(at: Date = new Date()): string {
  return at.toISOString().replace(/[:.]/g, "-");
}

function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

export interface SavedObservation {
  runId: string;
  dir: string;
  observationPath: string;
  /** The validated, persisted observation summary (for the CLI to print). */
  observation: PageObservation;
}

/**
 * Rebuild the Task-03-style inline-styles dom.json from the deduplicated data,
 * purely to measure the exact before/after size on the SAME observation. Not
 * persisted — used only for the size report.
 */
function measureInlineStylesDomBytes(
  elements: ObservedViewport["elements"],
  styleTable: StyleTable,
): number {
  const inline = elements.map((e) => {
    const styles = styleTable[e.styleId] ?? {};
    const out: Record<string, unknown> = {
      id: e.id,
      ...(e.parentId ? { parentId: e.parentId } : {}),
      tagName: e.tagName,
      ...(e.text ? { text: e.text } : {}),
      attributes: e.attributes,
      localVisible: e.localVisible,
      effectiveVisible: e.effectiveVisible,
      boundingBox: e.boundingBox,
      styles,
    };
    if (e.pseudo) {
      const pseudo: Record<string, unknown> = {};
      if (e.pseudo.before) {
        pseudo.before = {
          ...(e.pseudo.before.content !== undefined
            ? { content: e.pseudo.before.content }
            : {}),
          styles: styleTable[e.pseudo.before.styleId] ?? {},
        };
      }
      if (e.pseudo.after) {
        pseudo.after = {
          ...(e.pseudo.after.content !== undefined
            ? { content: e.pseudo.after.content }
            : {}),
          styles: styleTable[e.pseudo.after.styleId] ?? {},
        };
      }
      out.pseudo = pseudo;
    }
    return out;
  });
  return Buffer.byteLength(JSON.stringify(inline, null, 2) + "\n", "utf8");
}

/** Deterministic per-viewport figures for the top-level responsive summary. */
function buildResponsiveSummary(
  v: ObservedViewport,
): ViewportResponsiveSummary {
  return {
    elementCount: v.stats.domElementCount,
    effectiveVisibleCount: v.stats.effectiveVisibleCount,
    documentWidth: v.metadata.documentWidth,
    documentHeight: v.metadata.documentHeight,
    uniqueStyleCount: v.stats.uniqueStyleCount,
    assetCount: v.stats.assetCount,
    // Task 16: lifted into the responsive summary so a site-level run can
    // account for asset occurrences and scroll containers from the manifest,
    // without re-opening 104 dom.json files to count them.
    ...(v.stats.uniqueAssetCount !== undefined
      ? { uniqueAssetCount: v.stats.uniqueAssetCount }
      : {}),
    ...(v.stats.scrollContainerCount !== undefined
      ? { scrollContainerCount: v.stats.scrollContainerCount }
      : {}),
    linkCount: v.stats.linkCount,
  };
}

/**
 * Write one viewport's files under `viewports/<id>/` and return its summary
 * (including measured byte sizes) for embedding in observation.json.
 */
async function saveViewport(
  runDir: string,
  observed: ObservedViewport,
): Promise<ViewportObservation> {
  const id = observed.profile.id;
  const vpDir = path.join(runDir, "viewports", id);
  await mkdir(vpDir, { recursive: true });

  // Validate observed data against the Zod schemas before writing anything.
  const elements = z.array(ElementObservationSchema).parse(observed.elements);
  const styleTable = StyleTableSchema.parse(observed.styleTable);
  const assets = z.array(AssetObservationSchema).parse(observed.assets);
  const links = z.array(LinkObservationSchema).parse(observed.links);
  const frames = z.array(FrameObservationSchema).parse(observed.frames);

  // Invariant: no dangling styleId references between dom.json and styles.json.
  assertStyleReferencesResolve(elements, styleTable);

  const domJson = JSON.stringify(elements, null, 2) + "\n";
  const stylesJson = JSON.stringify(styleTable, null, 2) + "\n";
  const assetsJson = JSON.stringify(assets, null, 2) + "\n";
  const linksJson = JSON.stringify(links, null, 2) + "\n";
  const framesJson = JSON.stringify(frames, null, 2) + "\n";

  await writeFile(path.join(vpDir, "rendered.html"), observed.renderedHtml, "utf8");
  await writeFile(path.join(vpDir, "dom.json"), domJson, "utf8");
  await writeFile(path.join(vpDir, "styles.json"), stylesJson, "utf8");
  await writeFile(path.join(vpDir, "assets.json"), assetsJson, "utf8");
  await writeFile(path.join(vpDir, "links.json"), linksJson, "utf8");
  await writeFile(path.join(vpDir, "frames.json"), framesJson, "utf8");
  await writeFile(path.join(vpDir, "screenshot.png"), observed.screenshot);
  // Responsive Core P0 §C1.1 — the main-document response as served. Written
  // only when it was captured; the record says why when it was not.
  const initialDocument =
    observed.initialDocument !== undefined
      ? InitialDocumentSchema.parse(observed.initialDocument)
      : undefined;
  let documentResponseBytes: number | undefined;
  let textFallbackWritten = false;
  if (initialDocument?.status === "captured" && observed.documentResponseBody !== undefined) {
    // Review fix m1 — the RAW bytes as served, so `bytes` / `sha256` describe
    // the file exactly (a non-UTF-8 page is not re-encoded, a BOM is kept).
    await writeFile(path.join(vpDir, DOCUMENT_RESPONSE_FILE), observed.documentResponseBody);
    documentResponseBytes = observed.documentResponseBody.byteLength;
  } else if (
    initialDocument?.status === "captured" &&
    observed.documentResponseHtml !== undefined
  ) {
    // An in-memory observation built without the bytes (pre-fix callers):
    // decoded text is all there is.
    await writeFile(
      path.join(vpDir, DOCUMENT_RESPONSE_FILE),
      observed.documentResponseHtml,
      "utf8",
    );
    documentResponseBytes = Buffer.byteLength(observed.documentResponseHtml, "utf8");
    textFallbackWritten = true;
  }

  // Source Preservation V2 Phase 1 — the Source Package for THIS load, written
  // as a self-contained directory beside the viewport's files. Absent (and no
  // directory is created) unless the observation captured one.
  let sourcePackagePointer: SourcePackagePointer | undefined;
  let sourcePackageBytes: number | undefined;
  if (observed.sourcePackage !== undefined) {
    const written = await writeSourcePackage(
      path.join(vpDir, SOURCE_PACKAGE_DIR),
      observed.sourcePackage,
    );
    sourcePackagePointer = makeSourcePackagePointer(written, `viewports/${id}/${SOURCE_PACKAGE_DIR}`);
    sourcePackageBytes = written.bytes;
  }

  const renderedHtmlBytes = Buffer.byteLength(observed.renderedHtml, "utf8");
  const domJsonBytes = Buffer.byteLength(domJson, "utf8");
  const stylesJsonBytes = Buffer.byteLength(stylesJson, "utf8");
  const assetsJsonBytes = Buffer.byteLength(assetsJson, "utf8");
  const linksJsonBytes = Buffer.byteLength(linksJson, "utf8");
  const framesJsonBytes = Buffer.byteLength(framesJson, "utf8");
  const screenshotBytes = observed.screenshot.byteLength;

  const sizes: ViewportSizeReport = {
    renderedHtmlBytes,
    domJsonBytes,
    stylesJsonBytes,
    assetsJsonBytes,
    linksJsonBytes,
    framesJsonBytes,
    screenshotBytes,
    domPlusStylesBytes: domJsonBytes + stylesJsonBytes,
    inlineStylesDomBytes: measureInlineStylesDomBytes(elements, styleTable),
    ...(documentResponseBytes !== undefined ? { documentResponseBytes } : {}),
    ...(sourcePackageBytes !== undefined ? { sourcePackageBytes } : {}),
    viewportTotalBytes:
      (documentResponseBytes ?? 0) +
      (sourcePackageBytes ?? 0) +
      renderedHtmlBytes +
      domJsonBytes +
      stylesJsonBytes +
      assetsJsonBytes +
      linksJsonBytes +
      framesJsonBytes +
      screenshotBytes,
  };

  const rel = (name: string): string => `viewports/${id}/${name}`;
  return {
    profile: observed.profile,
    environment: observed.environment,
    metadata: observed.metadata,
    loadStrategy: observed.loadStrategy,
    stats: observed.stats,
    styleDedup: observed.styleDedup,
    shadow: observed.shadow,
    sizes,
    files: {
      rendered: rel("rendered.html"),
      dom: rel("dom.json"),
      styles: rel("styles.json"),
      assets: rel("assets.json"),
      links: rel("links.json"),
      frames: rel("frames.json"),
      screenshot: rel("screenshot.png"),
    },
    // Task 28.5B §5 — embedded (not a sibling file): the record is small and a
    // new required key in `files` would break every historical observation.
    // Absent on a pre-28.5B in-memory observation, and absent from the JSON.
    ...(observed.customProperties !== undefined
      ? { customProperties: observed.customProperties }
      : {}),
    // Task 28.6 W1 — the authored-CSS reachability record for this viewport.
    // Embedded for the same reason (fixed size; a new `files` key would break
    // every historical observation) and absent when the collector produced none.
    ...(observed.stylesheetCoverage !== undefined
      ? { stylesheetCoverage: observed.stylesheetCoverage }
      : {}),
    // Source Preservation V2 Phase 1 — the pointer, only when a package exists.
    ...(sourcePackagePointer !== undefined ? { sourcePackage: sourcePackagePointer } : {}),
    // Task 28.6 C2 B4/B5 — embedded for the same reason: fixed-size records, and
    // a new `files` key would break every historical observation. Absent when
    // the collector produced none (pre-C2 in-memory observation) and, for
    // `scrollReveal`, when no preparation scroll ran on this load.
    ...(observed.paintSuppression !== undefined
      ? { paintSuppression: observed.paintSuppression }
      : {}),
    ...(observed.scrollReveal !== undefined
      ? { scrollReveal: observed.scrollReveal }
      : {}),
    ...(observed.overlayCensus !== undefined
      ? { overlayCensus: observed.overlayCensus }
      : {}),
    // Task 28.7 A4 — the counted reveal-regression correction. Absent when the
    // load carried no marks, so a site that animates once is byte-identical to
    // the way it was before 28.7.
    ...(observed.screenshotDegraded !== undefined
      ? { screenshotDegraded: observed.screenshotDegraded }
      : {}),
    ...(observed.revealRegressionPolicy !== undefined
      ? { revealRegressionPolicy: observed.revealRegressionPolicy }
      : {}),
    // Task 28.7 B1 — the mark on a capture that is not the source page. Absent
    // on every healthy viewport, so a clean observation is byte-identical to
    // the way it was before B1.
    ...(observed.sourceIntegrity !== undefined
      ? { sourceIntegrity: observed.sourceIntegrity }
      : {}),
    // Responsive Core P0 §C1.1 — `file` is kept only when the file was written
    // (a captured record whose text is missing in memory is downgraded).
    ...(initialDocument !== undefined
      ? {
          initialDocument:
            initialDocument.status === "captured" && documentResponseBytes === undefined
              ? {
                  ...initialDocument,
                  status: "error" as const,
                  reason: "captured-text-missing",
                  file: undefined,
                }
              : textFallbackWritten
                ? { ...initialDocument, charset: "utf-8" }
                : initialDocument,
        }
      : {}),
  };
}

/**
 * Write ONE page observation into `dir` — `observation.json` plus
 * `viewports/<id>/…` — and return the validated summary. The directory is the
 * caller's choice: a single-page run passes `data/<host>/<run-id>/`, a site run
 * passes `…/pages/<page-id>/`. Every path inside `observation.json` stays
 * relative to `dir`, so no absolute local path ever reaches an artifact
 * (Task 09, item 33).
 */
export async function saveObservationIntoDir(
  dir: string,
  observed: ObservedPage,
): Promise<PageObservation> {
  await mkdir(dir, { recursive: true });

  const byId = new Map(observed.viewports.map((v) => [v.profile.id, v]));
  const desktopV = byId.get("desktop");
  const mobileV = byId.get("mobile");
  if (!desktopV || !mobileV) {
    throw new Error(
      "observation must include both a desktop and a mobile viewport",
    );
  }

  const desktop = await saveViewport(dir, desktopV);
  const mobile = await saveViewport(dir, mobileV);

  // Task 17 §8 — the layout probe, when it ran. A sibling file so the main
  // observation stays the shape v3/v4 readers expect.
  let layoutProbePointer: PageObservation["layoutProbe"];
  if (observed.layoutProbe) {
    const probeJson =
      JSON.stringify(LayoutProbeSchema.parse(observed.layoutProbe), null, 2) + "\n";
    await writeFile(path.join(dir, "layout-probe.json"), probeJson, "utf8");
    layoutProbePointer = {
      file: "layout-probe.json",
      widths: observed.layoutProbe.widths.map((entry) => entry.width),
      elementCount: observed.layoutProbe.tags.length,
      truncated: observed.layoutProbe.truncated,
      // Task 28.75 §07 — coverage travels with the pointer, so the collapse a
      // reader is looking for is visible in observation.json itself.
      ...(observed.layoutProbe.coverage
        ? { coverage: observed.layoutProbe.coverage }
        : {}),
      ...(observed.layoutProbe.documentResponse
        ? { documentStatus: observed.layoutProbe.documentResponse.status }
        : {}),
    };
  }

  // Task 28.6 W1.4 — the MOBILE-context probe, when it ran. A SEPARATE sibling
  // file with its own pointer: its walk parked mobile elements, so mixing its
  // arrays with the desktop probe's would mix two element identities.
  let mobileProbePointer: PageObservation["layoutProbeMobile"];
  if (observed.layoutProbeMobile) {
    const probeJson =
      JSON.stringify(LayoutProbeSchema.parse(observed.layoutProbeMobile), null, 2) +
      "\n";
    await writeFile(path.join(dir, "layout-probe-mobile.json"), probeJson, "utf8");
    mobileProbePointer = {
      file: "layout-probe-mobile.json",
      widths: observed.layoutProbeMobile.widths.map((entry) => entry.width),
      elementCount: observed.layoutProbeMobile.tags.length,
      truncated: observed.layoutProbeMobile.truncated,
      ...(observed.layoutProbeMobile.profile
        ? { profileId: observed.layoutProbeMobile.profile.id }
        : {}),
      ...(observed.layoutProbeMobile.coverage
        ? { coverage: observed.layoutProbeMobile.coverage }
        : {}),
      ...(observed.layoutProbeMobile.documentResponse
        ? { documentStatus: observed.layoutProbeMobile.documentResponse.status }
        : {}),
    };
  }

  const responsiveSummary: ResponsiveSummary = {
    desktop: buildResponsiveSummary(desktopV),
    mobile: buildResponsiveSummary(mobileV),
  };

  // Every persisted byte except observation.json itself (that is folded in via
  // the fixpoint below).
  const viewportFilesBytes =
    desktop.sizes.viewportTotalBytes + mobile.sizes.viewportTotalBytes;

  const observation: PageObservation = {
    schemaVersion: SCHEMA_VERSION,
    engine: ENGINE,
    target: observed.target,
    observationProfile: observed.observationProfile,
    viewports: { desktop, mobile },
    responsiveSummary,
    sizes: { observationJsonBytes: 0, runTotalBytes: 0 },
    ...(layoutProbePointer ? { layoutProbe: layoutProbePointer } : {}),
    ...(mobileProbePointer ? { layoutProbeMobile: mobileProbePointer } : {}),
    // Task 28.7 B1 — the page-level roll-up of the per-viewport marks.
    ...(observed.sourceIntegrity ? { sourceIntegrity: observed.sourceIntegrity } : {}),
  };

  // observation.json records its own byte size AND the run total (which includes
  // it). Both are self-referential, so iterate to a fixpoint where the stored
  // numbers equal the file's actual on-disk size (converges in 1–2 steps).
  let json = "";
  let guess = 0;
  for (let i = 0; i < 8; i++) {
    observation.sizes.observationJsonBytes = guess;
    observation.sizes.runTotalBytes = viewportFilesBytes + guess;
    json =
      JSON.stringify(PageObservationSchema.parse(observation), null, 2) + "\n";
    const actual = Buffer.byteLength(json, "utf8");
    if (actual === guess) break;
    guess = actual;
  }
  await writeFile(path.join(dir, "observation.json"), json, "utf8");

  return PageObservationSchema.parse(observation);
}

/**
 * Persist a single-page observation run under `data/<host>/<run-id>/`
 * (`pnpm observe`). Directory choice only — the writing itself is
 * {@link saveObservationIntoDir}.
 */
export async function saveObservation(
  observed: ObservedPage,
  runId: string = makeRunId(),
): Promise<SavedObservation> {
  const host = siteFolder(
    observed.target.finalUrl || observed.target.requestedUrl,
  );
  const dir = path.join(DATA_DIR, host, runId);
  const observation = await saveObservationIntoDir(dir, observed);

  return {
    runId,
    dir,
    observationPath: path.join(dir, "observation.json"),
    observation,
  };
}
