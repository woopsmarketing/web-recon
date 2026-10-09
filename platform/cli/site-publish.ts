/**
 * pnpm site:publish --site <siteId> --host <hostname> [--bucket boost-sites-artifacts]
 *                   [--dry-run [--check-store]] [--local | --remote] [--persist-to <dir>]
 *                   [--concurrency N] [--allow-site-change] [--expect-package <packageHash>]
 *                   [--expect-live <packageHash|none>] [--no-activate] [--reverify]
 * pnpm site:publish --site <siteId> --host <hostname> --rollback [--expect-live <packageHash>]
 *                   [--local | --remote] [--persist-to <dir>]
 *
 * Publishes the site's CURRENT Site Build Package (data/site-builds/<siteId>/current.json) to R2
 * and points routing/<hostname>.json at it (platform/publish/publish.ts).
 *  --local (default)  wrangler local (miniflare) state in --persist-to (default tmp/recon-runtime-state,
 *                     the same dir `pnpm runtime:dev` serves)
 *  --remote           the real bucket; refused unless RECON_PUBLISH_ALLOW_REMOTE=1 is set. Only
 *                     `--remote --dry-run` without --check-store runs without it (it is fully offline).
 *  --dry-run          no store access at all: prints every planned key, content-type, cache-control,
 *                     size, and the pointer that would be written. Output has no clock value or
 *                     machine path in it: same package → same bytes.
 *  --check-store      (with --dry-run) additionally READ the store — never write — to report whether
 *                     the package is already sealed (all files skipped) or not (all files uploaded),
 *                     which package the hostname serves now, and every refusal the real run would raise
 *  --expect-package   refuse unless the current package is exactly this packageHash (e.g. the one
 *                     reviewed in a dry run; guards against a concurrent site:build)
 *  --expect-live      refuse unless routing/<hostname>.json currently names exactly this packageHash
 *                     ("none" = no pointer yet); guards against overwriting a publication newer than
 *                     the one that was reviewed. Single operator is still assumed (not atomic).
 *  --no-activate      upload + verify + seal only; the routing pointer is not read or written. A later
 *                     run without it finds the seal, uploads nothing and only switches the pointer.
 *  SHELL PACKAGE      (an incrementally published site, portfolio.source.json portfolio-source@2): its
 *                     portfolio pages are empty until BoostChat publishes them, so the pointer write —
 *                     publish or --rollback — is refused unless the same store holds
 *                     portfolio-public/<siteId>/current/<packageHash>.json and a manifest recon-runtime
 *                     would use (the Worker's own checks). Order: --no-activate → publish the portfolio
 *                     from BoostChat → run again without --no-activate. --dry-run reports the guard
 *                     (with --check-store: absent / refused / live) and is never failed by it.
 *  --reverify         when the package is already sealed, read every object back and compare
 *                     sha256/size instead of trusting the seal (read-only; mismatches are reported)
 *  --allow-origin-mismatch  a --remote publish is refused when the origin baked into the package
 *                     (canonical / sitemap / robots URLs) is not https://<hostname>; this overrides it
 *  --rollback         re-point the hostname at its pointer's `previous` (already sealed) package; no upload
 *                     refused (no override) when that package serves portfolio records that are no longer in
 *                     data/sites/<siteId>/content/projects.json (served set) — docs/result/sales-demo-final-closeout-v1/rollback-truth-runbook.md
 *                     For an incrementally published site that file is not the truth (BoostChat is): the
 *                     served set is read from the live portfolio overlay of the package the hostname
 *                     serves now; without a usable overlay there is nothing to check against → refused.
 */
import { publishedPortfolioTruth, publishSite, rollbackHost, sealBytes, type PortfolioTruthLoader, type PublishResult } from "../publish/publish";
import { WranglerStore } from "../publish/wrangler-store";
import { readPortfolioSource, SOURCE_MARKER_FILE } from "../portfolio-sync/managed";
import { buildSiteSnapshot, siteDir } from "../site/load";

const args = process.argv.slice(2);
const VALUE_FLAGS = ["--site", "--host", "--bucket", "--persist-to", "--concurrency", "--expect-package", "--expect-live"];
const BOOL_FLAGS = ["--dry-run", "--check-store", "--local", "--remote", "--allow-site-change", "--allow-origin-mismatch", "--rollback", "--no-activate", "--reverify"];
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const has = (name: string) => args.includes(name);
const usage =
  "usage: pnpm site:publish --site <siteId> --host <hostname> [--bucket boost-sites-artifacts] [--dry-run [--check-store] | --rollback] [--local|--remote] [--persist-to <dir>] [--concurrency N] [--allow-site-change] [--expect-package <packageHash>] [--expect-live <packageHash|none>] [--no-activate] [--reverify] [--allow-origin-mismatch]";
function usageError(message?: string): never {
  console.error(message ? `site:publish: ${message}\n${usage}` : usage);
  process.exit(2);
}

const unknown = args.filter((a, i) => (a.startsWith("--") ? !VALUE_FLAGS.includes(a) && !BOOL_FLAGS.includes(a) : !VALUE_FLAGS.includes(args[i - 1] ?? "")));
if (unknown.length > 0) usageError(`unknown arguments: ${unknown.join(" ")}`);
const siteId = flag("--site");
const host = flag("--host");
if (!siteId || !host) usageError();
if (has("--local") && has("--remote")) usageError("--local and --remote are exclusive");
if (has("--rollback") && (has("--dry-run") || has("--no-activate") || has("--reverify") || has("--expect-package"))) usageError("--rollback only combines with --expect-live and the store flags");
if (has("--check-store") && !has("--dry-run")) usageError("--check-store is a --dry-run option");
if (has("--no-activate") && has("--expect-live")) usageError("--expect-live guards the pointer write; it cannot be combined with --no-activate");

const HASH = /^[0-9a-f]{64}$/;
const expectPackage = flag("--expect-package");
if (expectPackage !== undefined && !HASH.test(expectPackage)) usageError(`--expect-package must be a 64-hex packageHash, got "${expectPackage}"`);
const expectLive = flag("--expect-live");
if (expectLive !== undefined && expectLive !== "none" && !HASH.test(expectLive)) usageError(`--expect-live must be "none" or a 64-hex packageHash, got "${expectLive}"`);
/** R2 bucket naming rule: 3–63 chars, lowercase letters, digits and hyphens, no leading/trailing hyphen. */
const bucket = flag("--bucket") ?? "boost-sites-artifacts";
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) usageError(`--bucket "${bucket}" is not a valid R2 bucket name`);
/** --concurrency must be a positive integer; anything else is a usage error before any store access. */
const concurrencyRaw = flag("--concurrency");
if (concurrencyRaw !== undefined && !/^[1-9]\d*$/.test(concurrencyRaw)) usageError(`--concurrency must be a positive integer, got "${concurrencyRaw}"`);

const remote = has("--remote");
const dryRun = has("--dry-run");
const checkStore = has("--check-store");
const persistTo = flag("--persist-to") ?? "tmp/recon-runtime-state";
// Every contact with the live account is gated, reads included; only the offline dry run is not.
if (remote && (!dryRun || checkStore) && process.env.RECON_PUBLISH_ALLOW_REMOTE !== "1") {
  console.error("site:publish: --remote reaches the live bucket; refused unless RECON_PUBLISH_ALLOW_REMOTE=1 (see docs/result/static-deployment-foundation/07-live-deploy-plan.md)");
  process.exit(2);
}

// A site whose portfolio BoostChat owns (the tracked marker) is published by site:portfolio-sync only:
// it regenerates the site from what is live, publishes exactly the package it built, checks the public
// URLs and reports. A manual publish from a checkout could put an older portfolio back. (--rollback
// stays available: it is the emergency path and keeps its own portfolio-truth guard.)
// A site published INCREMENTALLY (portfolio-source@2) is the opposite case: its package is a shell
// that carries no portfolio at all, so a manual publish cannot put an older one back — and it is the
// intended way to ship that package (with --no-activate to upload it ahead of the switch).
if (!dryRun && !has("--rollback")) {
  let adopted = false;
  try {
    adopted = (await readPortfolioSource(siteDir(process.cwd(), siteId))) === "generated";
  } catch (error) {
    console.error(`site:publish: ${siteId}/${(error as Error).message}`);
    process.exit(2);
  }
  if (adopted) {
    console.error(`site:publish: the portfolio of "${siteId}" is owned by BoostChat (${SOURCE_MARKER_FILE}); a manual publish is refused. Run: pnpm site:portfolio-sync --site ${siteId} --host ${host} --force${remote ? " --remote" : ""}`);
    process.exit(2);
  }
}

// A dry run gets a store only for --check-store, and then one that cannot write.
const store =
  dryRun && !checkStore
    ? undefined
    : new WranglerStore({ repoRoot: process.cwd(), bucket, mode: remote ? "remote" : "local", persistTo: remote ? undefined : persistTo, allowRemote: remote, readOnly: dryRun });

if (has("--rollback")) {
  // The served set a fresh public build would emit into the portfolio document (integration/emit.ts).
  const portfolioTruth: PortfolioTruthLoader = async () => {
    const at = new Date().toISOString();
    const { snapshot, portfolio } = await buildSiteSnapshot({ repoRoot: process.cwd(), siteId, mode: "public", at });
    // An incrementally published site has no portfolio in this checkout (the snapshot holds none by design):
    // its served set is what BoostChat has published for the package the hostname serves now.
    if (portfolio === "incremental") return publishedPortfolioTruth(store!, siteId, host);
    return { authoritativeIds: snapshot.content.projects.map((p) => p.id), source: `data/sites/${siteId}/content/projects.json (served at ${at})` };
  };
  try {
    const r = await rollbackHost({ store: store!, siteId, hostname: host, expectLivePackageHash: expectLive, portfolioTruth, log: (l) => console.log(l) });
    console.log(JSON.stringify({ status: "rolled-back", pointer: r.pointer }, null, 2));
  } catch (error) {
    console.error(`site:publish --rollback FAILED (routing pointer untouched unless the message says it was written): ${(error as Error).message}`);
    process.exitCode = 1;
  } finally {
    await store!.close();
  }
  process.exit();
}

let res: PublishResult | undefined;
try {
  res = await publishSite({
    repoRoot: process.cwd(),
    siteId,
    hostname: host,
    store,
    dryRun,
    checkStore,
    allowSiteChange: has("--allow-site-change"),
    expectPackageHash: expectPackage,
    expectLivePackageHash: expectLive,
    activate: !has("--no-activate"),
    reverify: has("--reverify"),
    requireOriginMatch: remote && !has("--allow-origin-mismatch"),
    concurrency: concurrencyRaw === undefined ? undefined : Number(concurrencyRaw),
    log: (l) => console.log(l),
  });
} catch (error) {
  console.error(`site:publish FAILED (routing pointer untouched unless the message says it was written): ${(error as Error).message}`);
} finally {
  await store?.close();
}
if (!res) process.exit(1);

const { plan } = res;
const byCache: Record<string, number> = {};
const byType: Record<string, number> = {};
for (const f of plan.files) {
  byCache[`${f.cacheReason}: ${f.cacheControl}`] = (byCache[`${f.cacheReason}: ${f.cacheControl}`] ?? 0) + 1;
  byType[f.contentType] = (byType[f.contentType] ?? 0) + 1;
}
if (res.status === "dry-run") {
  const sc = res.storeCheck;
  console.log(`\nDRY RUN — nothing written. Target bucket: ${bucket} (${remote ? "remote" : `local, persist ${persistTo}`})`);
  console.log(
    sc
      ? `store consulted READ-ONLY (${sc.store}): seal ${sc.seal} → would upload ${sc.wouldUpload}, would skip ${sc.wouldSkip}; host serves ${sc.live ? `${sc.live.packageHash} (${sc.live.releaseId})` : "nothing"} → pointer ${sc.pointerAction}`
      : `store NOT consulted (add --check-store): if the package is not sealed there yet, all ${plan.files.length} files are uploaded; if it is sealed identically, all are skipped`,
  );
  console.log("key\tcontent-type\tcache-control\tsize");
  for (const f of plan.files) console.log(`${f.key}\t${f.contentType}\t${f.cacheControl}\t${f.size}`);
  console.log(`${plan.sealKey}\tapplication/json\tno-store\t${sealBytes(plan.seal).length}\t(SEAL, written last)`);
  console.log(`${plan.routingKey}\tapplication/json\tno-store\t-\t(POINTER, written after the verified seal${sc ? "" : '; "previous" filled from the existing pointer at publish time'})`);
  if (plan.shell) {
    const o = sc?.portfolioOverlay;
    console.log(
      `SHELL PACKAGE — the pointer write is refused unless the store holds a portfolio overlay recon-runtime would use: ${plan.shell.currentKey} → ` +
        (o ? `${o.state}${o.state === "live" ? ` (revision ${o.revision})` : o.state === "refused" ? ` (${o.reason})` : ""} → activation ${o.activation === "would-pass" ? "WOULD PASS" : "WOULD BE REFUSED (publish the portfolio for this package from BoostChat first)"}` : "not checked (add --check-store)"),
    );
  }
  console.log(JSON.stringify(res.pointer, null, 2));
}
console.log(
  JSON.stringify(
    {
      status: res.status,
      siteId: plan.siteId,
      hostname: plan.hostname,
      bucket,
      packagePrefix: plan.sealKey.slice(0, -"_package.json".length),
      routingKey: plan.routingKey,
      packageHash: plan.packageHash,
      buildInputId: plan.buildInputId,
      releaseId: plan.releaseId,
      bakedOrigin: plan.bakedOrigin ?? null,
      files: plan.files.length,
      bytes: plan.bytes,
      objectsPlanned: plan.files.length + 2,
      byContentType: byType,
      byCachePolicy: byCache,
      warnings: plan.warnings,
      ...(plan.shell ? { portfolioShell: { currentKey: plan.shell.currentKey, activationNeedsLiveOverlay: true } } : {}),
      ...(res.status === "dry-run" ? { storeCheck: res.storeCheck ?? null } : {}),
      ...(res.status === "published" ? { upload: res.upload, uploaded: res.uploaded, verified: res.verified, pointerWrite: res.pointerWrite, previous: res.pointer.previous ?? null } : {}),
      ...(res.status === "uploaded" ? { upload: res.upload, uploaded: res.uploaded, verified: res.verified, pointerWrite: "not-activated" } : {}),
    },
    null,
    2,
  ),
);
