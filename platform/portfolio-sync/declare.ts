import { writeFile } from "node:fs/promises";
import path from "node:path";
import { resolvePortfolioRuntime } from "../portfolio-runtime/capability";
import { loadRelease } from "../release/release";
import { SITES_DIR, loadSiteInstance, siteDir } from "../site/load";
import { ManagedPortfolioError, SOURCE_MARKER_FILE, SOURCE_MARKER_SCHEMA, SOURCE_MARKER_SCHEMA_V2, SOURCE_MARKER_V2_TEXT, readPortfolioSource, type PortfolioSourceKind } from "./managed";

/**
 * Declaring a site as BoostChat-managed — the ONE supported way (`pnpm site:portfolio-managed`).
 *
 * A managed site is a site whose tracked marker data/sites/<siteId>/portfolio.source.json says so
 * (managed.ts). A NEW managed site is Portfolio Publishing V2: the marker is `portfolio-source@2`,
 * the site is built once as a shell package and BoostChat publishes its portfolio incrementally.
 * This function writes exactly that marker, and only when the site can actually be published that
 * way:
 *
 *   - the site's pinned release must support the portfolio runtime (resolvePortfolioRuntime — the
 *     question the builder and the publisher ask); a release that does not is REFUSED here, with what
 *     to do, instead of at the next build;
 *   - site.json must carry identity.publicOrigin (an incremental site's pages are composed for it —
 *     the loader refuses the site without one).
 *
 * Idempotent: a site that already carries the `@2` marker is left byte for byte as it is (and is
 * still checked, so a re-pin to an unsupporting release is reported).
 *
 * V1 (`portfolio-source@1`, the portfolio generated into a checkout by site:portfolio-sync) is not
 * written by anything here. It stays readable and working as the compatibility path; a NEW `@1`
 * marker comes only from `site:portfolio-sync --adopt --legacy-v1`. Converting an existing `@1` site
 * is a migration with a BoostChat side to it (the site's row must be switched to V2 as well), so it is
 * done only when asked for by name (upgradeV1).
 */

export interface DeclareManagedOptions {
  repoRoot: string;
  siteId: string;
  /** check everything and report what would be written; the site directory is not touched */
  dryRun?: boolean;
  /** convert a `portfolio-source@1` (V1, generated) site to `@2` */
  upgradeV1?: boolean;
}

export interface DeclareManagedResult {
  /** written = the marker file was created / replaced; unchanged = it already said `@2`; would-write = dry run */
  status: "written" | "unchanged" | "would-write";
  /** what the site was before this call */
  from: PortfolioSourceKind;
  /** repository-relative path of the marker */
  marker: string;
  schema: typeof SOURCE_MARKER_SCHEMA_V2;
  releaseId: string;
  /** how the pinned release states the capability (capability.ts) */
  runtime: { contract: string; declared: "release" | "legacy" };
  publicOrigin: string;
}

export async function declareManagedPortfolio(opts: DeclareManagedOptions): Promise<DeclareManagedResult> {
  const { repoRoot, siteId } = opts;
  const dir = siteDir(repoRoot, siteId);
  const marker = `${SITES_DIR}/${siteId}/${SOURCE_MARKER_FILE}`;
  let site: Awaited<ReturnType<typeof loadSiteInstance>>;
  try {
    site = await loadSiteInstance(repoRoot, siteId);
  } catch (error) {
    throw new ManagedPortfolioError(`site "${siteId}" cannot be read (${(error as Error).message}) — ${SITES_DIR}/${siteId}/site.json must exist and be valid first; nothing was written`);
  }
  const pin = site.template;
  let from: PortfolioSourceKind;
  try {
    from = await readPortfolioSource(dir);
  } catch (error) {
    throw new ManagedPortfolioError(`${siteId}/${(error as Error).message} — fix or remove ${marker} and run this again; nothing was written`);
  }
  /** what the site is, and stays, while it cannot be declared */
  const meanwhile =
    from === "incremental"
      ? `The site already carries the ${SOURCE_MARKER_SCHEMA_V2} marker, so until this is fixed site:build refuses it.`
      : from === "generated"
        ? `Until then the site stays a V1 managed site (${SOURCE_MARKER_SCHEMA}) and keeps working with site:portfolio-sync.`
        : `Until then the site stays hand-authored (no marker). The V1 generated flow exists only as a compatibility path and is asked for by name: pnpm site:portfolio-sync --site ${siteId} --host <hostname> --adopt --legacy-v1.`;
  const refuse = (why: string, todo: string) =>
    new ManagedPortfolioError(`site "${siteId}" cannot be declared BoostChat-managed (${SOURCE_MARKER_SCHEMA_V2}, incremental publishing): ${why}. ${todo} Nothing was written.`);

  // the release: the record only — the capability is a property of the record, never probed from files
  let release: Awaited<ReturnType<typeof loadRelease>>;
  try {
    release = await loadRelease(repoRoot, pin.templateId, pin.releaseId);
  } catch (error) {
    throw refuse(`its pinned release ${pin.releaseId} is not in this checkout's release store (${(error as Error).message})`, `Pin a release that exists under data/template-releases/${pin.templateId}/ and run this again.`);
  }
  if (release.releaseHash !== pin.releaseHash) {
    throw refuse(`site.json pins ${pin.releaseId} with hash ${pin.releaseHash.slice(0, 12)}…, and the stored release has ${release.releaseHash.slice(0, 12)}…`, "Fix the pin (template.releaseId / template.releaseHash in site.json) and run this again.");
  }
  const support = resolvePortfolioRuntime(release);
  if (!support.supported) {
    throw refuse(
      `its pinned release ${release.releaseId} does not support the portfolio runtime — ${support.reason}`,
      `Re-pin site.json (template.templateVersion / releaseId / releaseHash) to a release of ${pin.templateId} that declares the portfolio runtime, or cut one (the Template declares portfolioRuntime and the release gate "portfolio-runtime-kit" proves it), then run this again. ` +
        meanwhile,
    );
  }
  if (!site.identity.publicOrigin) {
    throw refuse("site.json has no identity.publicOrigin, and an incrementally published site's pages are composed for that origin", `Set identity.publicOrigin (https://<the site's hostname>) and run this again.`);
  }

  const result = (status: DeclareManagedResult["status"]): DeclareManagedResult => ({
    status,
    from,
    marker,
    schema: SOURCE_MARKER_SCHEMA_V2,
    releaseId: release.releaseId,
    runtime: { contract: support.contract, declared: support.declared },
    publicOrigin: site.identity.publicOrigin!,
  });
  if (from === "incremental") return result("unchanged");
  if (from === "generated" && !opts.upgradeV1) {
    throw new ManagedPortfolioError(
      `site "${siteId}" is already BoostChat-managed in V1 mode (${marker} is ${SOURCE_MARKER_SCHEMA}: its portfolio is generated into a checkout by site:portfolio-sync) and keeps working that way. ` +
        `Converting it to ${SOURCE_MARKER_SCHEMA_V2} changes how it is built and published — the next build is a shell package without a portfolio, and BoostChat must be switched to V2 for this site too — so it is done only on request: run this again with --upgrade-v1. Nothing was written.`,
    );
  }
  if (opts.dryRun) return result("would-write");
  await writeFile(path.join(dir, SOURCE_MARKER_FILE), SOURCE_MARKER_V2_TEXT);
  return result("written");
}
