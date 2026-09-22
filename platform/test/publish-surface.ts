/**
 * The post-build publish surface of platform/ (site:publish → R2). It only reads finished Site Build
 * Packages and never feeds a build, a render or a release, so the "platform implementation unchanged"
 * fingerprints of the template-cut tests exclude it the same way they exclude platform/test/.
 */
export function isPublishSurface(rel: string): boolean {
  return rel.startsWith("publish/") || rel === "cli/site-publish.ts";
}
