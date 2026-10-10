/**
 * Hosted site provisioning runner — creates ONE brand-new site from a BoostChat provisioning job.
 *
 *   tsx --tsconfig platform/tsconfig.json platform/cli/site-provision.ts
 *   tsx --tsconfig platform/tsconfig.json platform/cli/site-provision.ts --build-only --spec-file <path>
 *
 * It replaces the hand-made sequence (write data/sites/<siteId>/, site:portfolio-managed, site:build,
 * site:publish --remote, add a route to wrangler.jsonc, deploy the Worker) with typed function calls
 * in one process: platform/provision/provision.ts. It is meant to be started by the GitHub Actions
 * workflow .github/workflows/provision-site.yml with nothing but a job id.
 *
 * THE REAL RUN takes NO argument. Everything comes from the environment, and the only thing that
 * decides WHAT is built is the spec BoostChat returns for the job id — never a flag, never a string
 * of this command line:
 *
 *   PROVISION_JOB_ID            the BoostChat provisioning job (a lowercase UUID)
 *   BOOSTCHAT_BASE_URL          e.g. https://boostchat.co.kr (http only for a loopback host)
 *   BOOSTCHAT_PUBLISHER_TOKEN   bearer token of the publisher API; never printed
 *   GITHUB_RUN_ID               the run that claims the job (set by GitHub Actions)
 *   GITHUB_RUN_ATTEMPT          its attempt number (set by GitHub Actions)
 *   CLOUDFLARE_API_TOKEN        R2 object writes (through wrangler) + Worker routes of the zone; never printed
 *   CLOUDFLARE_ACCOUNT_ID       the account of the bucket (read by wrangler)
 *   CLOUDFLARE_ZONE_ID          the zone the route is created in
 *   RECON_PUBLISH_ALLOW_REMOTE  must be exactly 1 — the same switch site:publish --remote requires
 *   RECON_SITES_BUCKET          optional, default boost-sites-artifacts
 *   RECON_RUNTIME_SCRIPT        optional, default recon-runtime-pilot (the Worker the route points at)
 *
 * The first five are needed to CLAIM the job; a problem with one of them ends the run before
 * anything is sent (exit 2). The others are judged AFTER the claim, so a missing one is reported to
 * the job as a `failed` event (step "unknown", code "runner_config") instead of leaving it to time out.
 *
 * --build-only --spec-file <path>   the smoke run: scaffold + managed marker + build + package check
 *                                   for the spec in that file. No claim, no event, no store, no
 *                                   route, no environment variable, no network. It leaves
 *                                   data/sites/<siteId>/ and data/site-builds/<siteId>/ in the
 *                                   checkout (on a CI runner that is thrown away; after a local run,
 *                                   remove the two directories).
 *
 * Output: one line per step with non-secret facts only (site id, hostname, release, package hash,
 * counts), then a JSON summary. Every line passes the scrubber (platform/provision/scrub.ts).
 *
 * Exit codes
 *   0  provisioned: the hostname is public and BoostChat accepted `activated` — or the smoke run passed
 *   1  the job failed after the claim; a `failed` event was sent (or could not be delivered — the line says which)
 *   2  usage, or the variables needed for the claim are missing / unusable; nothing was sent
 *   3  the claim was not accepted (job not found, not claimable, unauthorized, no answer); no event was sent
 *   4  the smoke run failed (scaffold / build / package check)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createBoostChatAnnouncer } from "../publish/announce";
import { WranglerStore } from "../publish/wrangler-store";
import { ProvisioningApiError, createProvisioningClient } from "../provision/boostchat";
import { StepFailure, buildProvisionedSite, provisionSite, type ProvisionResources } from "../provision/provision";
import { RouteError, createCloudflareRouteClient, runtimeScriptName } from "../provision/routes";
import { createScrubber } from "../provision/scrub";
import { ProvisionError } from "../provision/spec";

const repoRoot = process.cwd();
const env = process.env;
const args = process.argv.slice(2);
const USAGE = "usage: site-provision (no arguments; reads the environment)  |  site-provision --build-only --spec-file <path>";

function usage(message: string): never {
  console.error(`site-provision: ${message}\n${USAGE}`);
  process.exit(2);
}

// ---------------------------------------------------------------- smoke run --
if (args.length > 0) {
  const specAt = args.indexOf("--spec-file");
  const specFile = specAt >= 0 ? args[specAt + 1] : undefined;
  const rest = args.filter((a, i) => a !== "--build-only" && i !== specAt && i !== specAt + 1);
  if (!args.includes("--build-only") || !specFile || specFile.startsWith("--") || rest.length > 0) usage("the only flags are --build-only together with --spec-file <path>");
  const scrub = createScrubber([], [[repoRoot, "."]]);
  const log = (line: string) => console.log(scrub.line(line));
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.resolve(repoRoot, specFile), "utf8"));
  } catch (error) {
    usage(`cannot read the spec file: ${scrub.message(error, 200)}`);
  }
  try {
    log("build-only: no claim, no event, no store, no route");
    const started = Date.now();
    const { spec, facts, scaffold, durationMs } = await buildProvisionedSite({ repoRoot, spec: raw, log });
    console.log(
      JSON.stringify(
        {
          status: "built",
          mode: "build-only",
          siteId: spec.siteId,
          hostname: spec.hostname,
          releaseId: spec.template.releaseId,
          scaffold,
          packageHash: facts.packageHash,
          buildInputId: facts.buildInputId,
          fileCount: facts.fileCount,
          bytes: facts.bytes,
          htmlPages: facts.htmlPages,
          buildMs: durationMs ?? null,
          totalMs: Date.now() - started,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (error) {
    const where = error instanceof StepFailure ? `${error.step} (${error.code})` : "unexpected";
    console.error(`site-provision build-only FAILED at ${where}: ${scrub.message(error, 2000)}`);
    process.exit(4);
  }
}

// ----------------------------------------------------------------- real run --
const jobId = env.PROVISION_JOB_ID ?? "";
const baseUrl = env.BOOSTCHAT_BASE_URL ?? "";
const publisherToken = env.BOOSTCHAT_PUBLISHER_TOKEN ?? "";
const runId = env.GITHUB_RUN_ID ?? "";
const runAttempt = Number(env.GITHUB_RUN_ATTEMPT ?? "");
const cloudflareToken = env.CLOUDFLARE_API_TOKEN ?? "";
const scrub = createScrubber([publisherToken, cloudflareToken], [[repoRoot, "."]]);
const log = (line: string) => console.log(scrub.line(line));

const missing = [
  ...(jobId ? [] : ["PROVISION_JOB_ID"]),
  ...(baseUrl ? [] : ["BOOSTCHAT_BASE_URL"]),
  ...(publisherToken ? [] : ["BOOSTCHAT_PUBLISHER_TOKEN"]),
  ...(/^[0-9]{1,20}$/.test(runId) ? [] : ["GITHUB_RUN_ID"]),
  ...(Number.isInteger(runAttempt) && runAttempt >= 1 ? [] : ["GITHUB_RUN_ATTEMPT"]),
];
if (missing.length > 0) usage(`${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not set or not usable; nothing was claimed`);

let boostchat: ReturnType<typeof createProvisioningClient>;
try {
  boostchat = createProvisioningClient({ baseUrl, token: publisherToken, jobId });
} catch (error) {
  if (error instanceof ProvisioningApiError) usage(`${scrub.message(error, 300)}; nothing was claimed`);
  throw error;
}

/** Everything that touches Cloudflare. Called after the claim (provision.ts): what is wrong is named by variable, never by value. */
function resources(): ProvisionResources {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const zoneId = env.CLOUDFLARE_ZONE_ID ?? "";
  const bucket = env.RECON_SITES_BUCKET || "boost-sites-artifacts";
  const problems = [
    ...(env.RECON_PUBLISH_ALLOW_REMOTE === "1" ? [] : ["RECON_PUBLISH_ALLOW_REMOTE is not 1 (this run writes to the live bucket and is refused without it)"]),
    ...(cloudflareToken && !/\s/.test(cloudflareToken) ? [] : ["CLOUDFLARE_API_TOKEN is not set"]),
    ...(/^[0-9a-f]{32}$/.test(accountId) ? [] : ["CLOUDFLARE_ACCOUNT_ID is not an account id"]),
    ...(/^[0-9a-f]{32}$/.test(zoneId) ? [] : ["CLOUDFLARE_ZONE_ID is not a zone id"]),
    ...(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ? [] : ["RECON_SITES_BUCKET is not a bucket name"]),
  ];
  if (problems.length > 0) throw new ProvisionError("runner_config", `the runner is not configured: ${problems.join("; ")}`);
  try {
    return {
      store: new WranglerStore({ repoRoot, bucket, mode: "remote", allowRemote: true }),
      announce: { mode: "on", create: () => createBoostChatAnnouncer({ baseUrl, token: publisherToken }) },
      routes: createCloudflareRouteClient({ apiToken: cloudflareToken, zoneId }),
      script: runtimeScriptName(env),
    };
  } catch (error) {
    if (error instanceof RouteError) throw new ProvisionError("runner_config", `the runner is not configured: ${error.message}`);
    throw error;
  }
}

log(`site-provision: job ${jobId} · run ${runId} attempt ${runAttempt} · ${boostchat.description}`);
const started = Date.now();
const result = await provisionSite({ repoRoot, boostchat, run: { runId, runAttempt }, resources, log, secrets: [publisherToken, cloudflareToken] });
if (result.ok) {
  console.log(JSON.stringify({ status: "provisioned", ...result, ok: undefined, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
  process.exit(0);
}
if (result.stage === "claim") {
  console.error(`site-provision: the claim was not accepted (${result.code}); no event was sent`);
  process.exit(3);
}
console.error(`site-provision FAILED at ${result.stage} (${result.code}); failed event ${result.failedEventSent ? "accepted" : "NOT accepted"} by BoostChat`);
process.exit(1);
