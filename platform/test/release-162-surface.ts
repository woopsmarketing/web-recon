/**
 * interior-01 1.6.2 (online inquiry) changed platform files again, so the 1.5.x cut proofs (ia150 R3,
 * ia151 R2, ia152 R2, step6 D) — which fingerprint platform/ against captures taken before those
 * cuts — give its surface the treatment release-160-surface.ts gives 1.6.0's:
 *  - ADDED (site/inquiry.ts — the inquiry.json schema; site/inquiry-client.ts — the browser door)
 *    — excluded: there is nothing to hold them to;
 *  - MODIFIED — judged at their pre-1.6.2 sha256:
 *      release/release.ts   the Template import allowlist gained the door (one entry). Judged at its
 *                           bytes at d325ac0, the last commit before the change (release162SurfaceBefore);
 *                           that hash equals every 1.5.x capture, so each cut proof keeps holding for
 *                           the tree as it stood before 1.6.2.
 *      site/context.ts, site/instance.ts, build/qa.ts
 *                           already judged at their pre-1.6.0 hash (release-160-surface.ts).
 *      site/load.ts, build/site-build.ts
 *                           already judged at their pre-integration hash (integration-surface.ts).
 * Their CURRENT content is held elsewhere: the release sources by integration.test.ts I2b (working
 * tree = the release the demo pins, byte for byte — 1.6.2 when this surface was written);
 * release/release.ts's allowlist by inquiry162.test.ts G1 / G2 and slice1's Template-gate checks;
 * build/qa.ts's declared-endpoint allowance by inquiry162.test.ts Q1; the loader and the snapshot by
 * inquiry162.test.ts L1 – L3.
 *
 * interior-01 1.6.3 (inquiry delivery) changed platform/ once more, in exactly ONE file:
 * site/inquiry-client.ts — the door now hands the form a sender (one submission_id per logical
 * inquiry, joined presses, the closed failure vocabulary, the Retry-After pause). That is a file
 * 1.6.2 ADDED, so it is already excluded above and every 1.5.x cut proof holds as written: there is
 * NO release-163-surface.ts, because it would have nothing to say (no other platform file moved,
 * none was added). The file's 1.6.3 content is held by integration.test.ts I2b (working tree = the
 * pinned 1.6.3 release, byte for byte) and its behaviour by inquiry163.test.ts (the sender
 * lifecycle), on top of inquiry162.test.ts D1 – D6 (the fixed-shape POST, the normaliser, the phone
 * rule). A later cut that touches any OTHER platform file is not covered here: the cut proofs fail
 * until it is given a surface of its own.
 */
const ADDED = new Set(["site/inquiry.ts", "site/inquiry-client.ts"]);
/** sha256 of platform/release/release.ts at d325ac0, the last commit before the inquiry door joined the allowlist */
const RELEASE_TS_BEFORE_DOOR = "875c88501e308cab8c9ef2cbec80c7ab218c3487823fa75f470d32c95ccd6ff8";

/** A platform/-relative file 1.6.2 ADDED (callers exclude it from a pre-1.6.2 fingerprint). */
export function isRelease162Added(rel: string): boolean {
  return ADDED.has(rel);
}

/** platform/-relative path → its sha256 before 1.6.2, for each file 1.6.2 MODIFIED and no earlier surface already covers. */
export function release162SurfaceBefore(): Record<string, string> {
  return { "release/release.ts": RELEASE_TS_BEFORE_DOOR };
}
