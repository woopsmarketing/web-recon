/**
 * pnpm site:portfolio-sync --site <siteId> --host <hostname>
 *        [--once | --watch [--interval <seconds>]] [--dry-run] [--force] [--generate-only]
 *        [--from-file <export.json> --assets-dir <dir>]
 *        [--local | --remote] [--persist-to <dir>] [--bucket boost-sites-artifacts] [--allow-origin-mismatch]
 *        [--verify-base <origin>] [--adopt]
 *
 * The portfolio publisher (platform/portfolio-sync): pulls the canonical portfolio of ONE site from
 * BoostChat, regenerates the site's portfolio files, runs the EXISTING site build and the EXISTING
 * publish, checks the public URLs and reports what it observed (Portfolio Publisher Contract V1).
 *
 *  env BOOSTCHAT_BASE_URL          e.g. https://boostchat.co.kr (http only for a loopback host)
 *      BOOSTCHAT_PUBLISHER_TOKEN   bearer token; never printed
 *  --once (default)   one run: process the waiting revision (and any newer one that appears), then exit
 *  --watch            poll every --interval seconds (default 60); cycles never overlap; Ctrl-C stops
 *                     after the cycle in progress
 *  --dry-run          fetch + plan + validate on a staged copy and print the plan; the site directory,
 *                     the build output, the store and BoostChat's state are not touched
 *  --force            process the export even when revision == liveRevision (repair / re-verify)
 *  --from-file        offline input instead of BoostChat (nothing is reported): an export document and,
 *    --assets-dir     a directory holding each asset under its `file` name
 *  --generate-only    stop after writing the generated files (no build / publish / verify / report)
 *  --local (default)  publish into wrangler local state in --persist-to (default tmp/recon-runtime-state,
 *                     the directory `pnpm runtime:dev` serves). A local publish is verified on, and
 *                     reported to, loopback addresses only: --verify-base must be given and be a
 *                     loopback origin (http://localhost:8787), and BOOSTCHAT_BASE_URL must be loopback
 *  --remote           the real bucket; refused unless RECON_PUBLISH_ALLOW_REMOTE=1, exactly as site:publish;
 *                     refused with a loopback --verify-base, and with --from-file (it would publish
 *                     without a report) unless --generate-only / --dry-run
 *  --allow-origin-mismatch   as site:publish: a --remote publish of a package baked for another origin
 *  --verify-base      origin the published site is checked on (default https://<hostname> with --remote)
 *  --adopt            once the site directory is generated, write the TRACKED marker portfolio.source.json
 *                     (commit it: from then on every checkout refuses to build / publish this site
 *                     without a generated portfolio)
 *
 * Exit codes: 0 done / nothing to do · 1 a stage failed (reported as failed) · 2 usage, an inconsistent
 * combination, or remote not allowed · 3 BoostChat could not be asked (network, 401, 429, 5xx, 503, 404)
 * — nothing was changed · 4 published (or possibly published) but not confirmed on the public URL: some
 * records missing from the report, or nothing reported at all — run again · 5 the result could not be
 * delivered / the export kept moving — run again · 6 another sync of this site is running.
 * --watch exits with the code of the last cycle that did not end 0.
 */
import dns from "node:dns";
import path from "node:path";
import { normalizeHostname } from "../publish/publish";
import { WranglerStore } from "../publish/wrangler-store";
import { BoostChatError, createPublisherClient } from "../portfolio-sync/client";
import { LockHeldError, acquireSyncLock, type SyncLock } from "../portfolio-sync/lock";
import { BACKOFF_CAP_MS, buildForSync, clientSource, fileSource, liveIsFor, nextFailureMemory, publishForSync, runSync, type CycleResult, type FailureMemory, type SyncOptions } from "../portfolio-sync/sync";
import { isLoopbackOrigin, verifyBaseOrigin, verifyPublic } from "../portfolio-sync/verify";
import { SOURCE_MARKER_FILE, readPortfolioSource } from "../portfolio-sync/managed";

const args = process.argv.slice(2);
const VALUE_FLAGS = ["--site", "--host", "--interval", "--from-file", "--assets-dir", "--persist-to", "--bucket", "--verify-base"];
const BOOL_FLAGS = ["--once", "--watch", "--dry-run", "--force", "--generate-only", "--local", "--remote", "--allow-origin-mismatch", "--adopt"];
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string) => args.includes(name);
const usage =
  "usage: pnpm site:portfolio-sync --site <siteId> --host <hostname> [--once | --watch [--interval <seconds>]] [--dry-run] [--force] [--generate-only] [--from-file <export.json> --assets-dir <dir>] [--local | --remote] [--persist-to <dir>] [--bucket <name>] [--adopt] [--allow-origin-mismatch] [--verify-base <origin>]";
function usageError(message?: string): never {
  console.error(message ? `site:portfolio-sync: ${message}\n${usage}` : usage);
  process.exit(2);
}

const unknown = args.filter((a, i) => (a.startsWith("--") ? !VALUE_FLAGS.includes(a) && !BOOL_FLAGS.includes(a) : !VALUE_FLAGS.includes(args[i - 1] ?? "")));
if (unknown.length > 0) usageError(`unknown arguments: ${unknown.join(" ")}`);
for (const f of VALUE_FLAGS) if (has(f) && (flag(f) === undefined || flag(f)!.startsWith("--"))) usageError(`${f} needs a value`);
const siteId = flag("--site");
const hostInput = flag("--host");
if (!siteId || !hostInput) usageError();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteId) || siteId.length > 64) usageError(`invalid --site "${siteId}"`);
// Portfolio Publishing V2: an incrementally published site never has its portfolio generated into a
// checkout — BoostChat composes its pages at publish time. Nothing here applies to it.
if ((await readPortfolioSource(path.join(process.cwd(), "data/sites", siteId)).catch(() => "authored")) === "incremental") {
  console.error(`site:portfolio-sync: the portfolio of "${siteId}" is published incrementally (${SOURCE_MARKER_FILE}, portfolio-source@2); it is never generated into a checkout. Ship its shell package with: pnpm site:build ${siteId} && pnpm site:publish --site ${siteId} --host ${hostInput}`);
  process.exit(2);
}
if (has("--once") && has("--watch")) usageError("--once and --watch are exclusive");
if (has("--local") && has("--remote")) usageError("--local and --remote are exclusive");
const watch = has("--watch");
const dryRun = has("--dry-run");
const generateOnly = has("--generate-only");
const remote = has("--remote");
if (watch && (dryRun || generateOnly)) usageError("--watch does not combine with --dry-run / --generate-only");
if (dryRun && generateOnly) usageError("--dry-run and --generate-only are exclusive");
const fromFile = flag("--from-file");
const assetsDir = flag("--assets-dir");
if ((fromFile === undefined) !== (assetsDir === undefined)) usageError("--from-file and --assets-dir go together");
if (fromFile && watch) usageError("--watch polls BoostChat; it does not combine with --from-file");
const intervalRaw = flag("--interval");
if (intervalRaw !== undefined && (!watch || !/^[1-9]\d*$/.test(intervalRaw))) usageError("--interval is a positive number of seconds and needs --watch");
const intervalMs = Number(intervalRaw ?? 60) * 1000;
const bucket = flag("--bucket") ?? "boost-sites-artifacts";
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) usageError(`--bucket "${bucket}" is not a valid R2 bucket name`);
const persistTo = flag("--persist-to") ?? "tmp/recon-runtime-state";
const adopt = has("--adopt");
if (adopt && dryRun) usageError("--adopt writes the adoption marker; it does not combine with --dry-run");

let hostname: string;
let verifyBase: string;
try {
  hostname = normalizeHostname(hostInput);
  verifyBase = verifyBaseOrigin(flag("--verify-base") ?? `https://${hostname}`);
} catch (error) {
  usageError((error as Error).message);
}

const touchesStore = !dryRun && !generateOnly;
// A publish nobody is told about: an offline export pushed to the real bucket.
if (fromFile && remote && touchesStore) usageError("--from-file with --remote would publish to the live bucket without reporting to BoostChat; refused (use --generate-only or --dry-run with it, or publish --local)");
// Every contact with the live account is gated, exactly as site:publish gates it.
if (remote && touchesStore && process.env.RECON_PUBLISH_ALLOW_REMOTE !== "1") {
  console.error("site:portfolio-sync: --remote reaches the live bucket; refused unless RECON_PUBLISH_ALLOW_REMOTE=1 (see docs/result/static-deployment-foundation/07-live-deploy-plan.md)");
  process.exit(2);
}

// wrangler dev listens on 127.0.0.1; Node would otherwise try ::1 first for "localhost"
dns.setDefaultResultOrder("ipv4first");
const repoRoot = process.cwd();
const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

let source: SyncOptions["source"];
try {
  if (fromFile) source = fileSource(path.resolve(fromFile), path.resolve(assetsDir!));
  else {
    const baseUrl = process.env.BOOSTCHAT_BASE_URL;
    const token = process.env.BOOSTCHAT_PUBLISHER_TOKEN;
    if (!baseUrl || !token) {
      console.error("site:portfolio-sync: BOOSTCHAT_BASE_URL and BOOSTCHAT_PUBLISHER_TOKEN must be set (or use --from-file <export.json> --assets-dir <dir>)");
      process.exit(2);
    }
    source = clientSource(createPublisherClient({ baseUrl, token, siteId, log }), `BoostChat ${new URL(baseUrl).origin}`);
  }
} catch (error) {
  console.error(`site:portfolio-sync: ${(error as Error).message}`);
  process.exit(2);
}

// What is published, where it is checked and who is told must be ONE environment: a local publish that
// is verified on the public hostname, or reported to a real BoostChat, would report as live a package
// the public site does not serve.
if (touchesStore) {
  const explicitBase = flag("--verify-base") !== undefined;
  if (!remote) {
    if (!explicitBase) usageError("a --local publish goes into the local runtime state, not to https://" + hostname + ": pass --verify-base with the local runtime's origin (pnpm runtime:dev → --verify-base http://localhost:8787 with --host localhost), or use --remote");
    if (!isLoopbackOrigin(verifyBase)) usageError(`--local publishes into the local runtime state; it cannot be verified on ${verifyBase} (a loopback --verify-base only)`);
    const boostchat = fromFile ? undefined : new URL(process.env.BOOSTCHAT_BASE_URL!).origin;
    if (boostchat && !isLoopbackOrigin(boostchat)) usageError(`a --local publish must not be reported to ${boostchat} as live: use a loopback BOOSTCHAT_BASE_URL, --from-file, --dry-run or --generate-only (or --remote for the real publish)`);
  } else if (isLoopbackOrigin(verifyBase)) usageError(`--remote publishes to the live bucket; it cannot be verified on the loopback origin ${verifyBase}`);
}

// One sync per site at a time, across processes (platform/portfolio-sync/lock.ts). Nothing steals a live lock.
const lockFile = path.join(repoRoot, "tmp/portfolio-sync", `${siteId}.lock`);
let lock: SyncLock | undefined;
async function acquireLock(): Promise<void> {
  try {
    lock = await acquireSyncLock(lockFile);
  } catch (error) {
    if (!(error instanceof LockHeldError)) throw error;
    console.error(`site:portfolio-sync: site "${siteId}" is ${error.message.split(repoRoot).join(".")}`);
    process.exit(6);
  }
}

const store = touchesStore ? new WranglerStore({ repoRoot, bucket, mode: remote ? "remote" : "local", persistTo: remote ? undefined : persistTo, allowRemote: remote }) : undefined;
const options: SyncOptions = {
  repoRoot,
  siteId,
  verifyBase,
  source,
  dryRun,
  generateOnly,
  force: has("--force"),
  adopt,
  log,
  build: () => buildForSync({ repoRoot, siteId, log }),
  publish: store ? publishForSync({ repoRoot, siteId, hostname, store, requireOriginMatch: remote && !has("--allow-origin-mismatch"), log }) : async () => void 0,
  liveIs: store ? liveIsFor(store, hostname) : undefined,
  verify: (input) => verifyPublic({ ...input, log }),
};

function exitCodeOf(r: CycleResult): number {
  if (r.status === "nothing-to-do" || r.status === "dry-run" || r.status === "generated" || r.status === "backing-off") return 0;
  if (r.status === "unverified") return 4;
  if (r.status === "retry") return 5;
  if (r.status === "failed") return r.report === "undelivered" || r.report === "stale" ? 5 : 1;
  if (r.report === "undelivered" || r.report === "stale") return 5;
  return r.complete ? 0 : 4;
}

function printPlan(r: Extract<CycleResult, { status: "dry-run" | "generated" }>): void {
  const { plan } = r;
  console.log(`\n${r.status === "dry-run" ? "DRY RUN — nothing written" : "GENERATED — site directory written; nothing built, published or reported"}: site ${plan.siteId}, revision ${plan.revision}`);
  console.log("action\tpath\tsize\tsha256");
  for (const f of plan.files) console.log(`${f.action}\t${f.path}\t${f.size}\t${f.sha256.slice(0, 16)}…`);
  for (const p of plan.removes) console.log(`remove\t${p}`);
  console.log(
    JSON.stringify(
      {
        status: r.status,
        siteId: plan.siteId,
        revision: plan.revision,
        changed: plan.changed,
        siteSnapshotHash: r.siteSnapshotHash,
        write: plan.files.filter((f) => f.action !== "unchanged").length,
        unchanged: plan.files.filter((f) => f.action === "unchanged").length,
        remove: plan.removes.length,
        serves: plan.projects,
        removing: plan.removing,
        retired: plan.retired,
        adoptedOnFirstConversion: plan.adopted,
      },
      null,
      2,
    ),
  );
}

function printResult(r: CycleResult): void {
  if (r.status === "dry-run" || r.status === "generated") return printPlan(r);
  if (r.status === "nothing-to-do") return console.log(JSON.stringify({ status: r.status, siteId, revision: r.revision, regeneratedThisCheckout: r.regenerated }, null, 2));
  if (r.status === "backing-off") return console.log(JSON.stringify({ status: r.status, siteId, revision: r.revision, notBefore: new Date(r.until).toISOString() }, null, 2));
  if (r.status === "retry") return console.log(JSON.stringify({ status: r.status, siteId, revision: r.revision, reason: r.reason }, null, 2));
  if (r.status === "unverified") return console.log(JSON.stringify({ status: r.status, siteId, hostname, verifyBase, revision: r.revision, message: r.message, reported: false }, null, 2));
  if (r.status === "failed") return console.log(JSON.stringify({ status: r.status, siteId, revision: r.revision ?? null, stage: r.stage, message: r.message, restoredPreviousFiles: r.restored, report: r.report }, null, 2));
  console.log(JSON.stringify({ status: r.status, siteId, hostname, verifyBase, revision: r.revision, packageHash: r.result.packageHash, portfolioVersion: r.result.portfolioVersion ?? null, verified: r.result.verified, unconfirmed: r.unconfirmed, report: r.report }, null, 2));
}

/** watch mode: the last failure, by the export's content (sync.ts nextFailureMemory) */
let memory: FailureMemory | undefined;
async function once(): Promise<number> {
  try {
    const results = await runSync({ ...options, ...(watch && memory ? { backoff: { contentHash: memory.contentHash, until: memory.until } } : {}) });
    for (const r of results) printResult(r);
    const last = results[results.length - 1]!;
    if (watch) memory = nextFailureMemory(memory, last, Date.now(), intervalMs);
    return exitCodeOf(last);
  } catch (error) {
    if (error instanceof BoostChatError) {
      console.error(`site:portfolio-sync: BoostChat could not be asked — nothing was changed: ${error.message}`);
      return 3;
    }
    console.error(`site:portfolio-sync FAILED: ${(error as Error).message}`);
    return 1;
  }
}

await acquireLock();
let code = 0;
try {
  if (!watch) code = await once();
  else {
    let stop = false;
    let wake: (() => void) | undefined;
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        log(`[${siteId}] ${signal} → stopping after the cycle in progress`);
        stop = true;
        wake?.();
      });
    }
    log(`[${siteId}] watching ${source.description} every ${intervalMs / 1000}s → ${remote ? "REMOTE" : `local (${persistTo})`} bucket ${bucket}, host ${hostname}, verify ${verifyBase}`);
    let unreachable = 0;
    while (!stop) {
      const c = await once(); // strictly one after another: the next poll starts only when this one is over
      if (c !== 0) code = c; // the exit code of a watch = the last cycle that did not end well
      // BoostChat unreachable (or the run itself broke): poll less and less often, up to every 10 minutes
      unreachable = c === 3 || (c === 1 && !memory) ? unreachable + 1 : 0;
      const pause = Math.min(BACKOFF_CAP_MS, intervalMs * 2 ** Math.min(unreachable, 10));
      if (c !== 0) log(`[${siteId}] cycle ended with code ${c}; next poll in ${pause / 1000}s${memory ? `; the failed content is retried from ${new Date(memory.until).toISOString()} (failure ${memory.failures})` : ""}`);
      if (stop) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pause);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  }
} finally {
  await store?.close();
  await lock?.release();
}
process.exit(code);
