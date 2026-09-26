import { loadRelease, verifyRelease } from "../release/release";

/**
 * interior-01 1.6.0 (docs/result/interior-portfolio-v0.2/23, 37) is the first release since the
 * 1.5.x Template-only cuts to change platform files: the V0.2 authored fields in content/schema.ts,
 * and the head-scripts widget seam (site/{context,instance}.ts changed, site/head-scripts.ts added,
 * plus build/qa.ts — the builder's declared-script allowance, not a release source). The 1.5.x cut
 * proofs (ia150 R3, ia151 R2, ia152 R2, step6 D) fingerprint platform/ against captures taken
 * before those cuts, so these files get the treatment integration-surface.ts gives the
 * integration producer's:
 *  - ADDED (site/head-scripts.ts) — excluded: there is nothing to hold them to;
 *  - MODIFIED — judged at their pre-1.6.0 sha256 (release160SurfaceBefore): the release sources at
 *    the bytes the stored 1.5.2 release froze (re-verified on every call), build/qa.ts at its last
 *    pre-seam commit (00ed120). All four equal every 1.5.x capture, so each cut proof keeps holding
 *    for the tree as it stood before 1.6.0.
 * Their CURRENT content is held elsewhere: the release sources by integration.test.ts I2b (working
 * tree = the pinned 1.6.0 release, byte for byte), build/qa.ts by slice1's declared-script
 * package-QA checks.
 */
const RELEASE_152 = "interior-01-1.5.2-d87807590d64";
const ADDED = new Set(["site/head-scripts.ts"]);
const MODIFIED_RELEASE_SOURCES = ["content/schema.ts", "site/context.ts", "site/instance.ts"] as const;
/** sha256 of platform/build/qa.ts at 00ed120, the last commit before the widget seam landed */
const QA_BEFORE_SEAM = "2ee7245df9c1ad293ba3cf04c48194afeca05210eb24d9da291aadfa9859579c";

/** A platform/-relative file 1.6.0 ADDED (callers exclude it from a pre-1.6.0 fingerprint). */
export function isRelease160Added(rel: string): boolean {
  return ADDED.has(rel);
}

/** platform/-relative path → its sha256 before 1.6.0, for each file 1.6.0 MODIFIED. */
export async function release160SurfaceBefore(repoRoot: string): Promise<Record<string, string>> {
  const rel = await loadRelease(repoRoot, "interior-01", RELEASE_152);
  await verifyRelease(repoRoot, rel);
  const frozen = new Map(rel.files.map((f) => [f.path, f.sha256]));
  const out: Record<string, string> = { "build/qa.ts": QA_BEFORE_SEAM };
  for (const f of MODIFIED_RELEASE_SOURCES) {
    const h = frozen.get(`platform/${f}`);
    if (!h) throw new Error(`${RELEASE_152} has no platform/${f}`);
    out[f] = h;
  }
  return out;
}
