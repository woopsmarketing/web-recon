import { z } from "zod";
import { ViewportProfileSchema } from "../observer/types.js";
import { SCHEMA_VERSION } from "./types.js";

/**
 * The correction vocabulary (items 87–107).
 *
 * A correction is not "this looks wrong, patch it". It is: **the pipeline
 * observed what the right answer is, in a place where the clone has a different
 * one, and the fix is expressible in a closed data shape.** Everything else is
 * detected, classified, and routed to a human or to a later Task.
 *
 * ## Why the type is a closed enum (item 90)
 *
 * A correction artifact that could carry an arbitrary CSS selector, a snippet of
 * JavaScript, or a React fragment would be a code-injection channel wearing a
 * data hat, and it would make "what can a correction do?" unanswerable without
 * reading every artifact ever produced. Three types exist, each with a fixed
 * payload shape and a fixed application site in the generator:
 *
 *   document-canvas-background      site-level; observed document-root background
 *                                   applied to the Next.js canvas
 *   interaction-target-state-style  one pattern's target, open state, a property
 *                                   map captured from the LIVE original's own
 *                                   after-state
 *   safe-data-image-recovery        one element's `src`, materialized from a
 *                                   raster `data:` URI that the aligned Task 09
 *                                   `rendered.html` really contained
 *
 * ## What is deliberately NOT a correction type
 *
 *  - fonts (items 50, 109): no `@font-face` is synthesized from a file name.
 *  - remote assets (item 108): no downloader. Redirects, DNS rebinding, private
 *    IPs, SSRF and auth all need a policy this Task does not have.
 *  - unknown behavior (items 80, 110): never, under any evidence.
 *  - family gaps (item 111): patching a representative's DOM to match one member
 *    is overfitting; the answer is an exact observation.
 *  - source drift (item 112): the answer is to re-observe, not to rewrite a past
 *    SiteSpec into the present.
 *
 * ## Provenance
 *
 * Every correction records where its VALUE came from:
 *   `observed-snapshot`  the SiteSpec / Task 09 artifacts (a past observation)
 *   `observed-live-qa`   a NEW observation this QA run made on the live original
 *                        (the interaction after-state Task 11 never captured)
 */

/** Bumped when the persisted correction shape changes. */
export const CORRECTION_SCHEMA_VERSION = SCHEMA_VERSION;

export const CorrectionTypeSchema = z.enum([
  "document-canvas-background",
  "interaction-target-state-style",
  "safe-data-image-recovery",
]);
export type CorrectionType = z.infer<typeof CorrectionTypeSchema>;

export const CORRECTION_TYPE_ORDER: readonly CorrectionType[] =
  CorrectionTypeSchema.options;

export const CorrectionProvenanceSchema = z.enum([
  "observed-snapshot",
  "observed-live-qa",
]);
export type CorrectionProvenance = z.infer<typeof CorrectionProvenanceSchema>;

/**
 * Correction 1 — the viewport canvas (items 91–93).
 *
 * Site-level, because it IS site-level behavior: the browser propagates the
 * document root's background to the canvas, and the clone renders the observed
 * `<html>`/`<body>` as inner `div`s, so nothing propagates. The value is the
 * SiteSpec's own observed root style, never a colour somebody picked.
 */
export const CanvasBackgroundCorrectionSchema = z.object({
  type: z.literal("document-canvas-background"),
  /** Property → observed computed value, keys sorted. */
  properties: z.record(z.string(), z.string()),
  /** The SiteSpec page + viewport + node the value was read from. */
  sourcePageId: z.string(),
  sourceViewport: ViewportProfileSchema.shape.id,
  sourceNodeId: z.string(),
});
export type CanvasBackgroundCorrection = z.infer<
  typeof CanvasBackgroundCorrectionSchema
>;

/**
 * Correction 2 — a verified interaction target's OPEN-state style (items 94–99).
 *
 * Task 14 reveals a CSS-hidden target with a neutral `display: revert`, and says
 * so (`interaction-open-state-style-not-observed`), because the open state was
 * genuinely never observed. This QA run opens the region on the LIVE original
 * and reads the computed style it actually reaches — that is new observed
 * evidence, and it is the only reason this correction is allowed to exist.
 *
 * Scope is fixed: one pattern, one target node, the `open` state, a property map
 * drawn from the Task 14 CSS allowlist. There is no selector field (item 96).
 */
export const InteractionStateStyleCorrectionSchema = z.object({
  type: z.literal("interaction-target-state-style"),
  patternId: z.string(),
  pageId: z.string(),
  viewport: ViewportProfileSchema.shape.id,
  targetNodeId: z.string(),
  /** Only `open` exists in v1; named so a second state can be added later. */
  state: z.literal("open"),
  /**
   * How the clone SIGNALS that this target is open — the attribute the corrected
   * rule keys on.
   *
   *  - `open`     : the browser owns it. A `native-details` disclosure toggles the
   *                 `<details open>` attribute itself and the generated runtime
   *                 attaches no listener at all, so a rule keyed on the runtime's
   *                 own marker would never match. This is not a detail: 8 of
   *                 domainchecker's 13 verified patterns are `native-details`, and
   *                 keying them on the runtime marker made all five proposed
   *                 corrections apply to nothing and be correctly rejected.
   *  - `revealed` : the generated InteractionRuntime sets `data-wr-revealed` when
   *                 it opens a region it was told to reveal.
   */
  stateHook: z.enum(["open", "revealed"]),
  /** Property → value, only properties that actually differ (item 97). */
  properties: z.record(z.string(), z.string()),
});
export type InteractionStateStyleCorrection = z.infer<
  typeof InteractionStateStyleCorrectionSchema
>;

/**
 * Correction 3 — a safe raster `data:` image (items 101–107).
 *
 * The bytes are NOT stored in the artifact: they are written next to it as a
 * content-addressed file, and the generator copies that file into the corrected
 * app's `public/wr/qa-assets/`. That keeps the JSON reviewable, keeps the
 * decoded payload out of any browser JS, and makes the file name a function of
 * the content rather than of a counter.
 */
export const SafeDataImageCorrectionSchema = z.object({
  type: z.literal("safe-data-image-recovery"),
  pageId: z.string(),
  viewport: ViewportProfileSchema.shape.id,
  nodeId: z.string(),
  /** Declared MIME, already checked against {@link SAFE_DATA_IMAGE_MIMES}. */
  mime: z.string(),
  /** SHA-256 of the decoded bytes, lowercase hex. */
  sha256: z.string(),
  bytes: z.number().int().positive(),
  /** File name inside the correction set's `assets/` directory. */
  assetFile: z.string(),
  /** Public path the corrected app will serve it at. */
  publicPath: z.string(),
  /** Intrinsic size measured in the snapshot, when known. */
  naturalWidth: z.number().optional(),
  naturalHeight: z.number().optional(),
});
export type SafeDataImageCorrection = z.infer<
  typeof SafeDataImageCorrectionSchema
>;

export const CorrectionPayloadSchema = z.discriminatedUnion("type", [
  CanvasBackgroundCorrectionSchema,
  InteractionStateStyleCorrectionSchema,
  SafeDataImageCorrectionSchema,
]);
export type CorrectionPayload = z.infer<typeof CorrectionPayloadSchema>;

/**
 * What has to become true for this correction to be ACCEPTED (item 119).
 *
 * A correction that changes CSS and fixes nothing is a rejected correction, so
 * every proposal carries the exact measurement that will decide it. Recording it
 * up front rather than judging afterwards is what stops the acceptance rule from
 * drifting to fit the result.
 */
export const CorrectionTargetMetricSchema = z.object({
  /** `canvas-background-mismatched-properties`, `target-style-mismatches`, … */
  metric: z.string(),
  /** Value measured in the iteration that proposed the correction. */
  before: z.number(),
  /** The value that counts as fixed (usually 0). */
  requiredAtMost: z.number(),
});
export type CorrectionTargetMetric = z.infer<
  typeof CorrectionTargetMetricSchema
>;

export const QaCorrectionSchema = z.object({
  /** `qc000001…`, assigned after a stable sort. */
  id: z.string(),
  type: CorrectionTypeSchema,
  provenance: CorrectionProvenanceSchema,
  /** The diffs this correction is meant to resolve, sorted. */
  diffIds: z.array(z.string()),
  payload: CorrectionPayloadSchema,
  targetMetric: CorrectionTargetMetricSchema,
  /** Named evidence predicates that were satisfied, sorted (item 83). */
  evidence: z.array(z.string()),
});
export type QaCorrection = z.infer<typeof QaCorrectionSchema>;

/** Why a proposed correction was not applied, or was applied and then rejected. */
export const CorrectionRejectionReasonSchema = z.enum([
  "target-metric-not-improved",
  "regression-routes",
  "regression-runtime-errors",
  "regression-content",
  "regression-behavior",
  "regression-unknown-implemented",
  "regression-form-writes",
  "generator-invariant-failed",
  "generation-failed",
  "unsafe-value",
  "iteration-limit",
]);
export type CorrectionRejectionReason = z.infer<
  typeof CorrectionRejectionReasonSchema
>;

export const RejectedCorrectionSchema = z.object({
  correction: QaCorrectionSchema,
  reason: CorrectionRejectionReasonSchema,
  detail: z.string(),
  /** The metric value measured after applying, when it was measurable. */
  after: z.number().optional(),
});
export type RejectedCorrection = z.infer<typeof RejectedCorrectionSchema>;

/**
 * `corrections/*.json` (item 89).
 *
 * The SiteSpec is never edited (item 88): a corrected clone is
 * `SiteSpec + QaCorrectionSet`, and the corrected manifest records both so the
 * provenance of every generated byte stays answerable (item 164).
 */
export const QaCorrectionSetSchema = z.object({
  schemaVersion: z.literal(CORRECTION_SCHEMA_VERSION),
  /** The QA run directory this came from, working-directory relative. */
  sourceQaRun: z.string(),
  sourceSiteSpec: z.string(),
  sourceReconstruction: z.string(),
  rootUrl: z.string(),
  /** Sorted by `id`. */
  corrections: z.array(QaCorrectionSchema),
});
export type QaCorrectionSet = z.infer<typeof QaCorrectionSetSchema>;

/** Deterministic sort key for a correction, before ids are assigned (item 17). */
export function correctionSortKey(payload: CorrectionPayload): string {
  const typeRank = String(CORRECTION_TYPE_ORDER.indexOf(payload.type)).padStart(2, "0");
  switch (payload.type) {
    case "document-canvas-background":
      return [typeRank, payload.sourcePageId, payload.sourceViewport, payload.sourceNodeId].join("|");
    case "interaction-target-state-style":
      return [typeRank, payload.pageId, payload.viewport, payload.patternId, payload.targetNodeId].join("|");
    case "safe-data-image-recovery":
      return [typeRank, payload.pageId, payload.viewport, payload.nodeId, payload.sha256].join("|");
  }
}
