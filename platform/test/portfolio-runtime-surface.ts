/**
 * The portfolio-runtime surface of platform/ (incremental portfolio publishing, 2026-10-10;
 * BoostChat docs/reports/portfolio-publishing-v2.md §2.2 / §2.3): the documents a SHELL package
 * carries for the publisher, and the builder of a Template Release's runtime kit with the code
 * that goes into one.
 *
 *  - ADDED only: platform/portfolio-runtime/** and cli/site-portfolio-runtime-kit.ts. They sit
 *    outside the release's runtime dirs; no build of an ordinary site reads them (the builder
 *    reaches contract.ts / shell-plan.ts only for a site whose portfolio.source.json says
 *    `publishing: "incremental"`), and the kit builder writes nothing but the two kit files the
 *    operator names — so the "platform implementation unchanged" fingerprints of the template-cut
 *    proofs (step6 D / D2, ia150 R3, ia152 R2) exclude them exactly as they exclude the publish
 *    surface (publish-surface.ts), the portfolio-sync surface (portfolio-sync-surface.ts), the
 *    preview surface (preview-surface.ts) and test/: there is nothing to hold them byte-identical to.
 *  - MODIFIED, each already outside those fingerprints or judged there at an earlier content:
 *    portfolio-sync/managed.ts + cli/site-portfolio-sync.ts (portfolio-sync surface),
 *    cli/site-publish.ts (publish surface), site/load.ts + build/site-build.ts (integration
 *    surface), build/qa.ts (1.6.0 surface). No file of a release's runtime dirs changed.
 *
 *  - The explicit capability + release gate (portfolio-runtime/capability.ts, gate.ts; 2026-10-10)
 *    ADDED files inside this surface only. It MODIFIED release/release.ts (the record's optional
 *    `portfolioRuntime` member, the "portfolio-runtime-kit" gate in createRelease) — a file the cut
 *    proofs already judge at its pre-1.6.2 hash (release-162-surface.ts) — plus build/site-build.ts
 *    and publish/publish.ts (integration surface, as above). Again no file of a release's runtime
 *    dirs changed: the capability's type is NOT in site/template-manifest.ts for exactly that
 *    reason. Held by portfolio-capability.test.ts (a Template without the capability cuts the very
 *    release it always did — G2 — and every stored release still verifies — C5).
 *
 * What the cut proofs care about — every ordinary site still builds byte-identically — is held for
 * this surface by the builds themselves (an ordinary site takes no new branch); what the surface
 * promises is asserted by portfolio-runtime.test.ts.
 */
export function isPortfolioRuntimeSurface(rel: string): boolean {
  return rel === "portfolio-runtime" || rel.startsWith("portfolio-runtime/") || rel === "cli/site-portfolio-runtime-kit.ts";
}
