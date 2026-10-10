/**
 * The ONLY way to deploy the runtime Worker (workers/recon-runtime, environment `pilot`).
 *
 *   tsx --tsconfig platform/tsconfig.json platform/cli/runtime-deploy.ts --dry-run
 *   tsx --tsconfig platform/tsconfig.json platform/cli/runtime-deploy.ts
 *
 * Why not `wrangler deploy --env pilot`: wrangler REPLACES the Worker's whole route list with the
 * one in the config file. Since the provisioning runner (platform/provision/) creates one exact
 * route per new hostname through the Cloudflare API, wrangler.jsonc no longer names every live
 * hostname, and a plain deploy would take every provisioned site off the air without an error.
 *
 * What this command does:
 *   1. reads workers/recon-runtime/wrangler.jsonc (env.pilot: the script name and its routes);
 *   2. lists the zone's live Worker routes through the Cloudflare API and keeps the ones that point
 *      at this script — if the API cannot be read, it REFUSES (no list = no deploy);
 *   3. merges both lists (platform/provision/deploy-routes.ts) and prints the result;
 *   4. --dry-run stops here. Otherwise it writes the merged config to a temporary file next to
 *      wrangler.jsonc, lists the routes ONCE MORE (a route created meanwhile is merged in), runs
 *        wrangler deploy -c <temporary file> --env pilot
 *      and removes the file whatever happens;
 *   5. lists the routes again and fails loudly when a merged route is no longer live.
 *
 * Do not run it while a provisioning run is in progress: a route created between the last list and
 * wrangler's own write is dropped. Step 5 cannot see that case (the route was never in the merged
 * list) — the provisioning run itself then times out at "activate" and is safe to re-run.
 *
 * Environment (no value is ever printed):
 *   CLOUDFLARE_API_TOKEN   Workers Scripts: Edit + Workers Routes: Edit on the zone (wrangler also reads it)
 *   CLOUDFLARE_ACCOUNT_ID  read by wrangler
 *   CLOUDFLARE_ZONE_ID     the zone whose routes are listed
 *
 * Exit: 0 deployed (or dry-run printed) · 1 refused / deploy failed / a route is missing afterwards · 2 usage or configuration.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { DeployRoutesError, configRoutes, mergeDeployRoutes, type MergedRoutes } from "../provision/deploy-routes";
import { RouteError, createCloudflareRouteClient } from "../provision/routes";
import { createScrubber } from "../provision/scrub";

const repoRoot = process.cwd();
const WORKER_DIR = "workers/recon-runtime";
const CONFIG_FILE = path.join(WORKER_DIR, "wrangler.jsonc");
const ENVIRONMENT = "pilot";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
const scrub = createScrubber([token], [[repoRoot, "."]]);

function stop(code: 1 | 2, message: string): never {
  console.error(`runtime-deploy: ${scrub.message(message, 1000)}`);
  process.exit(code);
}

if (args.some((a) => a !== "--dry-run")) stop(2, "usage: runtime-deploy [--dry-run]   (no other argument: the environment, the script and the routes are not chosen on the command line)");

// 1. the config file
const parsed = ts.parseConfigFileTextToJson(CONFIG_FILE, await readFile(path.join(repoRoot, CONFIG_FILE), "utf8").catch(() => stop(2, `cannot read ${CONFIG_FILE}`)));
if (parsed.error || !parsed.config || typeof parsed.config !== "object") stop(2, `${CONFIG_FILE} is not readable JSONC`);
const config = parsed.config as { env?: Record<string, { name?: unknown; routes?: unknown } | undefined> };
const pilot = config.env?.[ENVIRONMENT];
const script = pilot?.name;
if (!pilot || typeof script !== "string" || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(script)) stop(2, `${CONFIG_FILE} has no env.${ENVIRONMENT}.name`);

// 2 + 3. live routes, merged
let client: ReturnType<typeof createCloudflareRouteClient>;
try {
  client = createCloudflareRouteClient({ apiToken: token, zoneId: process.env.CLOUDFLARE_ZONE_ID ?? "" });
} catch (error) {
  stop(2, `${(error as Error).message} — without the live route list nothing is deployed`);
}

async function merged(): Promise<MergedRoutes> {
  try {
    return mergeDeployRoutes({ config: configRoutes(pilot!.routes), live: await client.list(), script: script as string });
  } catch (error) {
    if (error instanceof RouteError) stop(1, `REFUSED — the live routes could not be read, and a deploy without them would drop every provisioned hostname: ${error.message}`);
    if (error instanceof DeployRoutesError) stop(1, `REFUSED — ${error.message}`);
    throw error;
  }
}

function print(m: MergedRoutes): void {
  console.log(`runtime-deploy: ${script} · ${m.routes.length} route(s) after the merge (${m.liveOnly.length} live only, ${m.configOnly.length} config only)`);
  for (const r of m.routes) console.log(`  ${r.pattern}${m.liveOnly.includes(r.pattern) ? "   [live only — kept]" : m.configOnly.includes(r.pattern) ? "   [config only — will be created]" : ""}`);
}

let plan = await merged();
print(plan);
if (dryRun) {
  console.log("runtime-deploy: dry run — nothing was written, nothing was deployed");
  process.exit(0);
}

// 4. the deploy, from a temporary config next to the real one (so `main` and the schema path resolve the same)
const tempFile = path.join(repoRoot, WORKER_DIR, `wrangler.deploy-${randomBytes(6).toString("hex")}.json`);
let exitCode: number | null = null;
try {
  const again = await merged();
  if (again.routes.map((r) => r.pattern).join("\n") !== plan.routes.map((r) => r.pattern).join("\n")) {
    console.log("runtime-deploy: the live routes changed while preparing; using the newer list");
    print(again);
    plan = again;
  }
  const deployConfig = { ...config, env: { ...config.env, [ENVIRONMENT]: { ...pilot, routes: plan.routes } } };
  await writeFile(tempFile, JSON.stringify(deployConfig, null, 2) + "\n", { flag: "wx" });
  exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(path.join(repoRoot, "node_modules/.bin/wrangler"), ["deploy", "-c", tempFile, "--env", ENVIRONMENT], {
      cwd: repoRoot,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const relay = (d: Buffer) => process.stdout.write(scrub.line(d.toString()) + "\n");
    child.stdout.on("data", relay);
    child.stderr.on("data", relay);
    child.on("error", reject);
    child.on("close", resolve);
  });
} catch (error) {
  await rm(tempFile, { force: true });
  stop(1, `the deploy did not run: ${(error as Error).message}`);
} finally {
  await rm(tempFile, { force: true });
}
if (exitCode !== 0) stop(1, `wrangler deploy exited ${exitCode} — list the routes (--dry-run) before anything else`);

// 5. every merged route must still be live
const after = await client.list().catch((error) => stop(1, `deployed, but the routes could not be read back: ${(error as Error).message} — run --dry-run and compare with the list above`));
const live = new Set(after.filter((r) => r.script === script).map((r) => r.pattern));
const lost = plan.routes.filter((r) => !live.has(r.pattern)).map((r) => r.pattern);
if (lost.length > 0) stop(1, `DEPLOYED BUT ${lost.length} ROUTE(S) ARE NOT LIVE: ${lost.join(", ")} — those hostnames are off the air; re-create each route (pattern → ${script}) now`);
console.log(`runtime-deploy: deployed ${script}; all ${plan.routes.length} route(s) are live`);
