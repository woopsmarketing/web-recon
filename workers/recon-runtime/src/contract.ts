/**
 * Static deployment contract shared by the publisher (platform/publish) and the
 * recon-runtime Worker. Dependency-free on purpose: the Worker bundles it as-is.
 *
 * R2 layout (one bucket):
 *   sites/<siteId>/packages/<packageHash>/<path under site/>   package files (immutable)
 *   sites/<siteId>/packages/<packageHash>/_package.json        SEAL, written last by the publisher
 *                                                               after every file is uploaded and verified.
 *                                                               The PUBLISHER enforces "no pointer without a
 *                                                               verified seal"; the runtime does not re-check
 *                                                               the seal per request (it never serves it either)
 *   routing/<hostname>.json                                     hostname → package pointer
 *
 * packageHash is the Site Build Package's own identity (build-record.json#packageHash,
 * computed by platform/build/site-build.ts), so bytes under one prefix never change and a new
 * publish never alters an old one.
 */

export const SCHEMA_VERSION = 1 as const;

/** Reserved package-relative key of the seal; a package file may never use it. */
export const SEAL_NAME = "_package.json";

export const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
export const CACHE_REVALIDATE = "public, max-age=0, must-revalidate";

export const SITE_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const HASH_RE = /^[0-9a-f]{64}$/;
/** Lowercase DNS hostname, no port, no trailing dot (also accepts "localhost"). */
export const HOSTNAME_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function packagePrefix(siteId: string, packageHash: string): string {
  return `sites/${siteId}/packages/${packageHash}/`;
}
export function packageKey(siteId: string, packageHash: string, relPath: string): string {
  return `${packagePrefix(siteId, packageHash)}${relPath}`;
}
export function sealKey(siteId: string, packageHash: string): string {
  return packageKey(siteId, packageHash, SEAL_NAME);
}
export function routingKey(hostname: string): string {
  return `routing/${hostname}.json`;
}

export interface PackageRef {
  siteId: string;
  packageHash: string;
  buildInputId: string;
  releaseId: string;
  publishedAt: string;
}

/** routing/<hostname>.json */
export interface RoutingPointer extends PackageRef {
  schemaVersion: typeof SCHEMA_VERSION;
  hostname: string;
  /** the package this hostname served before this publish (rollback target) */
  previous?: PackageRef;
}

export interface SealFile {
  path: string;
  size: number;
  sha256: string;
  contentType: string;
  cacheControl: string;
}

/** sites/<siteId>/packages/<packageHash>/_package.json */
export interface PackageSeal {
  schemaVersion: typeof SCHEMA_VERSION;
  siteId: string;
  packageHash: string;
  buildInputId: string;
  releaseId: string;
  fileCount: number;
  bytes: number;
  files: SealFile[];
}
