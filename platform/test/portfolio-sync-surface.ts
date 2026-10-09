/**
 * The portfolio-sync surface of platform/ (Portfolio Content System V1, 2026-10-06;
 * docs/result/portfolio-content-system-v1/): the publisher that regenerates a site's portfolio files
 * from a BoostChat export and then calls the EXISTING buildSite + publishSite.
 *
 *  - ADDED: platform/portfolio-sync/** and cli/site-portfolio-sync.ts. They sit outside the release's
 *    runtime dirs, never feed a render or a release, and write site DATA (data/sites/<id>), not
 *    platform or Template code — so the "platform implementation unchanged" fingerprints of the
 *    template-cut proofs (step6 D / D2, ia150 R3, ia152 R2) exclude them exactly as they exclude the
 *    publish surface (publish-surface.ts) and test/: there is nothing to hold them byte-identical to.
 *  - MODIFIED: site/load.ts only (the managed-portfolio guard, one call). It is already judged at its
 *    pre-integration hash by integration-surface.ts, so no further override is needed here.
 *
 *  - ADDED with the managed publish flow (2026-10-10): portfolio-sync/declare.ts and
 *    cli/site-portfolio-managed.ts — the one supported way to declare a site BoostChat-managed. It
 *    writes one file of site DATA (data/sites/<id>/portfolio.source.json, outside the site snapshot)
 *    and reads a release RECORD; no build, render or release reads either file.
 *
 * What the cut proofs care about — a site WITHOUT the sidecar still loads and builds byte-identically
 * (same siteSnapshotHash, same buildInputId as its current package) — is asserted by
 * portfolio-sync.test.ts L3; the guard's behaviour by L1 / L2; the lossless conversion by M1.
 */
export function isPortfolioSyncSurface(rel: string): boolean {
  return rel === "portfolio-sync" || rel.startsWith("portfolio-sync/") || rel === "cli/site-portfolio-sync.ts" || rel === "cli/site-portfolio-managed.ts";
}
