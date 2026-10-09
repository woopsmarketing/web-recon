/**
 * The post-build publish surface of platform/ (site:publish → R2). It only reads finished Site Build
 * Packages and never feeds a build, a render or a release, so the "platform implementation unchanged"
 * fingerprints of the template-cut tests exclude it the same way they exclude platform/test/.
 *
 *  - publish/**            the publisher, its stores, and (Portfolio Publishing V2) the managed publish
 *                          flow of a shell package: announce to BoostChat, wait, guarded switch
 *  - cli/site-publish.ts   its CLI
 *  - cli/runtime-local.ts  the REAL recon-runtime handler over a directory that stands in for the bucket
 *                          (read-only: get / head). It serves what a publish wrote and is read by no
 *                          build, render or release — the same side of the line as the publisher.
 */
export function isPublishSurface(rel: string): boolean {
  return rel.startsWith("publish/") || rel === "cli/site-publish.ts" || rel === "cli/runtime-local.ts";
}
