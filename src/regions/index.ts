/**
 * PageRegion — Task 27. Deterministic visual-section grouping of a recon
 * template, compiled from the runtime trees and joined to Slot V2 through
 * `(pageId, viewport, nodeId)`.
 *
 * Task 27 shipped the COMPILER AND ARTIFACT ONLY. Task 28 Phase 5 adds the
 * first consumer — `enablement.ts` — which READS the artifact (membership,
 * blast radius, global signals, the interaction graph) and never changes the
 * compiler, its policy or its ids.
 */
export * from "./types.js";
export * from "./skeleton.js";
export * from "./select-roots.js";
export * from "./compile.js";
export * from "./enablement.js";
export * from "./load-input.js";
export * from "./store.js";
