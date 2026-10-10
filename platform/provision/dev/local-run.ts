/**
 * DEV ONLY — the REAL provisioning runner against a BoostChat on THIS machine.
 *
 *   tsx --tsconfig platform/tsconfig.json platform/provision/dev/local-run.ts
 *
 * It calls the same `provisionSite` (platform/provision/provision.ts) as the hosted entry
 * (platform/cli/site-provision.ts) with the same clients for BoostChat — claim, events and the
 * shell-package announce go over real HTTP. What differs is ONLY what would touch Cloudflare:
 *
 *   the bucket        a directory (DirectoryStore — the layout `pnpm runtime:local` serves and a
 *                     local BoostChat with PORTFOLIO_ASSET_STORE=fs writes its overlay into)
 *   the Worker route  a JSON file standing in for the zone's route list (an array of
 *                     {id, pattern, script}); `list` reads it, `create` appends to it
 *
 * Nothing of the runner is changed or skipped: scaffold, managed marker, build, package check,
 * upload + read back + seal, announce, route, wait for the overlay, guarded pointer write, events.
 *
 * It REFUSES to start unless BOOSTCHAT_BASE_URL is an http loopback origin — this entry can never
 * claim a job of a deployed BoostChat, and it holds no Cloudflare credential at all.
 *
 * Like a CI runner, every run works in a throwaway repository root (this checkout's releases,
 * starters and node_modules linked in, plus what identifies the existing sites), so the checkout's
 * data/sites/ and data/site-builds/ are never written. The root is removed when the run ends.
 *
 *   PROVISION_JOB_ID            the BoostChat provisioning job (a lowercase UUID)
 *   BOOSTCHAT_BASE_URL          http://127.0.0.1:<port> | http://localhost:<port> | http://[::1]:<port>
 *   BOOSTCHAT_PUBLISHER_TOKEN   bearer token of the local publisher API; never printed
 *   GITHUB_RUN_ID               digits; the caller's stand-in for the workflow run id
 *   GITHUB_RUN_ATTEMPT          >= 1
 *   LOCAL_BUCKET_DIR            an existing directory: the stand-in bucket
 *   LOCAL_ROUTES_FILE           the stand-in route list (created as [] when absent)
 *   RECON_RUNTIME_SCRIPT        optional, default recon-runtime-pilot
 *
 * Output and exit codes are those of platform/cli/site-provision.ts (0 provisioned · 1 failed after
 * the claim · 2 usage/environment · 3 claim refused).
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createBoostChatAnnouncer } from "../../publish/announce";
import { DirectoryStore } from "../../publish/store";
import { ProvisioningApiError, createProvisioningClient } from "../boostchat";
import { provisionSite, type ProvisionResources } from "../provision";
import { runtimeScriptName, type WorkerRoute, type WorkerRouteClient } from "../routes";
import { createScrubber } from "../scrub";
import { ProvisionError } from "../spec";

const checkout = process.cwd();
const env = process.env;
const USAGE = "usage: local-run (no arguments; reads the environment — see the header of platform/provision/dev/local-run.ts)";

function usage(message: string): never {
  console.error(`local-run: ${message}\n${USAGE}`);
  process.exit(2);
}

if (process.argv.length > 2) usage("this entry takes no argument");

const jobId = env.PROVISION_JOB_ID ?? "";
const baseUrl = env.BOOSTCHAT_BASE_URL ?? "";
const publisherToken = env.BOOSTCHAT_PUBLISHER_TOKEN ?? "";
const runId = env.GITHUB_RUN_ID ?? "";
const runAttempt = Number(env.GITHUB_RUN_ATTEMPT ?? "");
const bucketDir = env.LOCAL_BUCKET_DIR ?? "";
const routesFile = env.LOCAL_ROUTES_FILE ?? "";

const missing = [
  ...(jobId ? [] : ["PROVISION_JOB_ID"]),
  ...(baseUrl ? [] : ["BOOSTCHAT_BASE_URL"]),
  ...(publisherToken ? [] : ["BOOSTCHAT_PUBLISHER_TOKEN"]),
  ...(/^[0-9]{1,20}$/.test(runId) ? [] : ["GITHUB_RUN_ID"]),
  ...(Number.isInteger(runAttempt) && runAttempt >= 1 ? [] : ["GITHUB_RUN_ATTEMPT"]),
  ...(path.isAbsolute(bucketDir) ? [] : ["LOCAL_BUCKET_DIR"]),
  ...(path.isAbsolute(routesFile) ? [] : ["LOCAL_ROUTES_FILE"]),
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

/** The stand-in for the zone's Worker routes: the file IS the route list. */
function fileRouteClient(file: string): WorkerRouteClient {
  const read = async (): Promise<WorkerRoute[]> => {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("the routes file is not a JSON array");
    return parsed.map((r) => {
      const { id, pattern, script } = (r ?? {}) as Record<string, unknown>;
      if (typeof id !== "string" || typeof pattern !== "string" || (script !== null && typeof script !== "string")) throw new Error("the routes file holds something that is not a route");
      return { id, pattern, script };
    });
  };
  return {
    list: read,
    async create(pattern, script) {
      const routes = await read();
      const route: WorkerRoute = { id: `local-route-${routes.length + 1}-${Date.now().toString(36)}`, pattern, script };
      const tmp = `${file}.tmp-${process.pid}`;
      await writeFile(tmp, `${JSON.stringify([...routes, route], null, 2)}\n`);
      await rename(tmp, file);
      return route;
    },
  };
}

/** A throwaway repository root, as a CI runner's fresh checkout is one (the same recipe as platform/test/provision.test.ts). */
async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "provision-local-"));
  await mkdir(path.join(root, "data/sites"), { recursive: true });
  for (const linked of ["data/template-releases", "data/site-starters", "node_modules"]) await symlink(path.join(checkout, linked), path.join(root, linked));
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

const repoRoot = await makeRoot();
const scrub = createScrubber([publisherToken], [[repoRoot, "."], [checkout, "."]]);
const log = (line: string) => console.log(scrub.line(line));

let exitCode = 1;
try {
  let boostchat: ReturnType<typeof createProvisioningClient>;
  try {
    boostchat = createProvisioningClient({ baseUrl, token: publisherToken, jobId });
  } catch (error) {
    if (!(error instanceof ProvisioningApiError)) throw error;
    exitCode = 2;
    throw new Error(`${scrub.message(error, 300)}; nothing was claimed`);
  }

  const resources = (): ProvisionResources => {
    try {
      return {
        store: new DirectoryStore(bucketDir),
        announce: { mode: "on", create: () => createBoostChatAnnouncer({ baseUrl, token: publisherToken }) },
        routes: fileRouteClient(routesFile),
        script: runtimeScriptName(env),
      };
    } catch (error) {
      throw new ProvisionError("runner_config", `the runner is not configured: ${scrub.message(error, 200)}`);
    }
  };

  log(`local-run: job ${jobId} · run ${runId} attempt ${runAttempt} · ${boostchat.description} · bucket = a directory · routes = a file`);
  const started = Date.now();
  const result = await provisionSite({ repoRoot, boostchat, run: { runId, runAttempt }, resources, log, secrets: [publisherToken] });
  if (result.ok) {
    console.log(JSON.stringify({ status: "provisioned", ...result, ok: undefined, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
    exitCode = 0;
  } else if (result.stage === "claim") {
    console.error(`local-run: the claim was not accepted (${result.code}); no event was sent`);
    exitCode = 3;
  } else {
    console.error(`local-run FAILED at ${result.stage} (${result.code}); failed event ${result.failedEventSent ? "accepted" : "NOT accepted"} by BoostChat`);
    exitCode = 1;
  }
} catch (error) {
  console.error(`local-run: ${exitCode === 2 ? "" : "unexpected: "}${scrub.message(error, 600)}`);
} finally {
  await rm(repoRoot, { recursive: true, force: true }).catch(() => undefined);
}
process.exit(exitCode);
