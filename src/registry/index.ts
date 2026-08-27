/**
 * Template / Site registry (Task 27, Stretch Goal B).
 *
 * A filesystem index over artifacts that already exist: no database, no UI, no
 * service layer. The artifact is always the source of truth — see store.ts.
 */
export * from "./types.js";
export * from "./scan.js";
export * from "./store.js";
