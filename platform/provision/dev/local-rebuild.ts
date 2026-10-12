/**
 * DEV ONLY — the REAL rebuild runner against a BoostChat on THIS machine.
 *
 *   tsx --tsconfig platform/tsconfig.json platform/provision/dev/local-rebuild.ts
 *
 * It calls the same `rebuildSite` (platform/provision/rebuild-runner.ts) as the hosted entry
 * (platform/cli/site-rebuild.ts --run) with the same client for BoostChat — claim and events go over real HTTP.
 * What differs is ONLY what would touch Cloudflare: the bucket is a directory (DirectoryStore — the layout
 * `pnpm runtime:local` serves and a local BoostChat with PORTFOLIO_ASSET_STORE=fs writes its overlay and its
 * `portfolio-assets/` into). A rebuild has no Worker route and no announce, so there is nothing else to stand in for.
 *
 * Nothing of the runner is changed or skipped: validate, scaffold, brand images read from `portfolio-assets/<key>`,
 * build, package check, upload + read back + seal, events. The sealed package is NOT public: no `routing/` key is read
 * or written (the run ends with the package under sites/<siteId>/packages/<hash>/ and nothing else new in the bucket).
 *
 * It REFUSES to start unless BOOSTCHAT_BASE_URL is an http loopback origin — this entry can never claim a job of a
 * deployed BoostChat, and it holds no Cloudflare credential at all.
 *
 * Like a CI runner, every run works in a throwaway repository root (this checkout's releases, starters, design
 * presets and node_modules linked in — LINKED_FROM_CHECKOUT below — plus what identifies the existing sites), so the
 * checkout's data/sites/ and data/site-builds/ are never written. The root is removed when the run ends.
 *
 * The root preparation is exported (prepareLocalRoot, linkCheckoutInto) so platform/test/rebuild-runner.test.ts can
 * prove what a build finds in it; importing this file runs nothing — the entry runs only when it IS the script.
 *
 *   REBUILD_ID                  the BoostChat rebuild job (a lowercase UUID)
 *   BOOSTCHAT_BASE_URL          http://127.0.0.1:<port> | http://localhost:<port> | http://[::1]:<port>
 *   BOOSTCHAT_PUBLISHER_TOKEN   bearer token of the local publisher API; never printed
 *   GITHUB_RUN_ID               digits; the caller's stand-in for the workflow run id
 *   GITHUB_RUN_ATTEMPT          >= 1
 *   LOCAL_BUCKET_DIR            an existing directory: the stand-in bucket
 *   REBUILD_SOURCE_REF          optional: a 40-character commit id the spec's sourceRef must equal (unset = not checked)
 *
 * Output and exit codes are those of platform/cli/site-rebuild.ts --run (0 sealed · 1 failed after the claim, or a refused
 * event · 2 usage/environment · 3 claim refused).
 */
import { realpathSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readlink, realpath, rm, stat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DirectoryStore } from "../../publish/store";
import { RebuildApiError, createRebuildClient } from "../rebuild-client";
import { rebuildSite } from "../rebuild-runner";
import { createScrubber } from "../scrub";
import { isUuid } from "../spec";

/**
 * Everything a build reads from the repository root that a fresh CI checkout holds and this entry links instead of copying:
 *   data/template-releases   the release the site is built from (its files, its design/fonts.json pins)
 *   data/site-starters       which releases a template offers
 *   data/site-presets        the design presets a rebuild spec may name (platform/design/preset.ts presetFile)
 *   node_modules             the platform's packages — the font files and their licence texts among them (platform/design/fonts.ts)
 * A directory a build reads from the root and this list does not name is a build that works in CI and fails here.
 */
export const LINKED_FROM_CHECKOUT = ["data/template-releases", "data/site-starters", "data/site-presets", "node_modules"] as const;

/**
 * Links LINKED_FROM_CHECKOUT of `checkout` into `root`. A path that is already there is left alone when it IS the
 * checkout's (the same link made twice, or made first by a harness completing the root from outside); anything else
 * at that path is refused — the root would not be this checkout.
 */
export async function linkCheckoutInto(checkout: string, root: string): Promise<void> {
  for (const linked of LINKED_FROM_CHECKOUT) {
    const from = path.join(checkout, linked);
    const to = path.join(root, linked);
    await mkdir(path.dirname(to), { recursive: true });
    try {
      await symlink(from, to);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // the same link (compared as written, so a checkout without that directory is no special case), or the same place
      const written = await readlink(to).then((t) => path.resolve(path.dirname(to), t), () => undefined);
      const [have, want] = await Promise.all([realpath(to).catch(() => undefined), realpath(from).catch(() => undefined)]);
      const same = written === from || (have !== undefined && have === want);
      if (!same) throw new Error(`${linked} already exists in the run's root and is not this checkout's`);
    }
  }
}

/** A throwaway repository root, as a CI runner's fresh checkout is one (the same recipe as local-run.ts, plus the design presets). */
export async function prepareLocalRoot(checkout: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "rebuild-local-"));
  await mkdir(path.join(root, "data/sites"), { recursive: true });
  await linkCheckoutInto(checkout, root);
  // the other sites of the checkout, as far as the package check reads them (site.json + business.json)
  for (const e of await readdir(path.join(checkout, "data/sites"), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    for (const rel of ["site.json", "content/business.json"]) {
      const from = path.join(checkout, "data/sites", e.name, rel);
      if (!(await stat(from).catch(() => undefined))) continue;
      await mkdir(path.dirname(path.join(root, "data/sites", e.name, rel)), { recursive: true });
      await cp(from, path.join(root, "data/sites", e.name, rel));
    }
  }
  return root;
}

async function main(): Promise<never> {
  const checkout = process.cwd();
  const env = process.env;
  const USAGE = "usage: local-rebuild (no arguments; reads the environment — see the header of platform/provision/dev/local-rebuild.ts)";

  function usage(message: string): never {
    console.error(`local-rebuild: ${message}\n${USAGE}`);
    process.exit(2);
  }

  if (process.argv.length > 2) usage("this entry takes no argument");

  const rebuildId = env.REBUILD_ID ?? "";
  const baseUrl = env.BOOSTCHAT_BASE_URL ?? "";
  const publisherToken = env.BOOSTCHAT_PUBLISHER_TOKEN ?? "";
  const runId = env.GITHUB_RUN_ID ?? "";
  const runAttempt = Number(env.GITHUB_RUN_ATTEMPT ?? "");
  const bucketDir = env.LOCAL_BUCKET_DIR ?? "";
  const sourceRef = env.REBUILD_SOURCE_REF || undefined;

  const missing = [
    ...(isUuid(rebuildId) ? [] : ["REBUILD_ID (a lowercase UUID)"]),
    ...(baseUrl ? [] : ["BOOSTCHAT_BASE_URL"]),
    ...(publisherToken ? [] : ["BOOSTCHAT_PUBLISHER_TOKEN"]),
    ...(/^[0-9]{1,20}$/.test(runId) ? [] : ["GITHUB_RUN_ID"]),
    ...(Number.isInteger(runAttempt) && runAttempt >= 1 ? [] : ["GITHUB_RUN_ATTEMPT"]),
    ...(path.isAbsolute(bucketDir) ? [] : ["LOCAL_BUCKET_DIR (an absolute path)"]),
    ...(sourceRef === undefined || /^[0-9a-f]{40}$/.test(sourceRef) ? [] : ["REBUILD_SOURCE_REF (a 40-character commit id)"]),
  ];
  if (missing.length > 0) usage(`${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not set or not usable; nothing was claimed`);

  // the one rule that makes this entry dev-only: BoostChat is on this machine
  const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    usage("BOOSTCHAT_BASE_URL is not a URL; nothing was claimed");
  }
  if (base.protocol !== "http:" || !LOOPBACK.has(base.hostname)) usage("BOOSTCHAT_BASE_URL must be an http loopback origin (this entry never talks to a deployed BoostChat); nothing was claimed");
  if (!(await stat(bucketDir).catch(() => undefined))?.isDirectory()) usage("LOCAL_BUCKET_DIR is not a directory; nothing was claimed");

  const repoRoot = await prepareLocalRoot(checkout);
  const scrub = createScrubber([publisherToken], [[repoRoot, "."], [checkout, "."]]);
  const log = (line: string) => console.log(scrub.line(line));

  let exitCode = 1;
  try {
    let boostchat: ReturnType<typeof createRebuildClient>;
    try {
      boostchat = createRebuildClient({ baseUrl, token: publisherToken, rebuildId });
    } catch (error) {
      if (!(error instanceof RebuildApiError)) throw error;
      exitCode = 2;
      throw new Error(`${scrub.message(error, 300)}; nothing was claimed`);
    }

    log(`local-rebuild: rebuild ${rebuildId} · run ${runId} attempt ${runAttempt} · ${boostchat.description} · bucket = a directory`);
    const started = Date.now();
    const result = await rebuildSite({ repoRoot, boostchat, run: { runId, runAttempt }, resources: () => ({ store: new DirectoryStore(bucketDir) }), log, secrets: [publisherToken], expectedSourceRef: sourceRef });
    if (result.ok) {
      console.log(JSON.stringify({ status: "sealed", ...result, ok: undefined, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
      exitCode = 0;
    } else if (result.stage === "claim") {
      console.error(`local-rebuild: the claim was not accepted (${result.code}); no event was sent`);
      exitCode = 3;
    } else if (result.stage === "event") {
      console.error(`local-rebuild STOPPED: BoostChat refused an event (${result.code}); this run is stale and wrote nothing more`);
      exitCode = 1;
    } else {
      console.error(`local-rebuild FAILED at ${result.stage} (${result.code}); failed event ${result.failedEventSent ? "accepted" : "NOT accepted"} by BoostChat`);
      exitCode = 1;
    }
  } catch (error) {
    console.error(`local-rebuild: ${exitCode === 2 ? "" : "unexpected: "}${scrub.message(error, 600)}`);
  } finally {
    await rm(repoRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  process.exit(exitCode);
}

// The entry runs only as the script itself; an import (the test of the root preparation) runs nothing.
// Both sides are compared as real paths: a checkout reached through a symlink still runs.
const real = (file: string) => {
  try {
    return realpathSync(file);
  } catch {
    return path.resolve(file);
  }
};
if (process.argv[1] !== undefined && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) await main();
