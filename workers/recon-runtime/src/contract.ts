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

/**
 * Portfolio overlay — written by the BoostChat publisher, read by the Worker, same bucket:
 *   portfolio-public/<siteId>/current/<packageHash>.json   the only mutable object: names the live manifest
 *   portfolio-public/<siteId>/<manifestKey>                 manifest (immutable)
 *   portfolio-public/<siteId>/<route.key>                   rendered page / file (immutable)
 *   portfolio-assets/<asset.key>                            canonical image; public only at a URL path the
 *                                                           verified live manifest lists
 */
export const PORTFOLIO_CURRENT_SCHEMA = "portfolio-current@1" as const;
export const PORTFOLIO_MANIFEST_SCHEMA = "portfolio-manifest@1" as const;

/** A key relative to an overlay prefix, as a pointer or manifest may name it. */
export const PORTFOLIO_KEY_RE = /^[A-Za-z0-9._-]{1,128}(\/[A-Za-z0-9._-]{1,128})*$/;
export function isPortfolioKey(key: unknown): key is string {
  return typeof key === "string" && PORTFOLIO_KEY_RE.test(key) && !key.split("/").some((seg) => seg === "." || seg === "..");
}

export function portfolioPublicKey(siteId: string, relKey: string): string {
  return `portfolio-public/${siteId}/${relKey}`;
}
export function portfolioCurrentKey(siteId: string, packageHash: string): string {
  return portfolioPublicKey(siteId, `current/${packageHash}.json`);
}
export function portfolioAssetKey(storageKey: string): string {
  return `portfolio-assets/${storageKey}`;
}

/** portfolio-public/<siteId>/current/<packageHash>.json */
export interface PortfolioCurrentPointer {
  schema: typeof PORTFOLIO_CURRENT_SCHEMA;
  siteId: string;
  shellPackageHash: string;
  revision: number;
  /** relative to portfolio-public/<siteId>/ */
  manifestKey: string;
  manifestSha256: string;
  publishedAt: string;
  previous?: { revision: number; manifestKey: string; manifestSha256: string };
}

export interface PortfolioManifestEntry {
  /** routes: relative to portfolio-public/<siteId>/ · assets: relative to portfolio-assets/ */
  key: string;
  sha256: string;
  size: number;
  contentType: string;
}

/** portfolio-public/<siteId>/revisions/<revision>/<manifestSha256[0:16]>.json */
export interface PortfolioManifest {
  schema: typeof PORTFOLIO_MANIFEST_SCHEMA;
  siteId: string;
  revision: number;
  shell: { packageHash: string; releaseId: string };
  /** URL space the overlay answers alone: a path here that is not in `routes` is a 404, never a package file */
  owned: { exact: string[]; prefixes: string[] };
  /** exact URL pathname → rendered object */
  routes: Record<string, PortfolioManifestEntry>;
  /** exact URL pathname → canonical image */
  assets: Record<string, PortfolioManifestEntry>;
  projects: Record<string, { slug: string; key: string; sha256: string }>;
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
