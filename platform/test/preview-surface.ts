/**
 * The preview-kit surface of platform/ (Portfolio CMS V1.1, 2026-10-07; docs/result/portfolio-cms-v1.1/):
 * the builder of a site's preview renderer kit and the code that goes into one.
 *
 *  - ADDED only: platform/preview/** and cli/preview-kit.ts. They sit outside the release's runtime
 *    dirs, never feed a build, a render of a site package, a release or a publish, and write nothing
 *    but the two kit files the operator names — so the "platform implementation unchanged"
 *    fingerprints of the template-cut proofs (step6 D / D2, ia150 R3, ia152 R2) can exclude them
 *    exactly as they exclude the publish surface (publish-surface.ts), the portfolio-sync surface
 *    (portfolio-sync-surface.ts) and test/: there is nothing to hold them byte-identical to.
 *  - MODIFIED: nothing. No existing platform file changed for it.
 *
 * What the cut proofs care about — every site still builds byte-identically — cannot be affected by
 * files no build reads; what the kit itself promises is asserted by preview-parity.test.ts.
 */
export function isPreviewSurface(rel: string): boolean {
  return rel === "preview" || rel.startsWith("preview/") || rel === "cli/preview-kit.ts";
}
