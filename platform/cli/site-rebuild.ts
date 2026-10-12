/**
 * Rebuild the shell package of an existing provisioned site from a `site-rebuild-spec@1`.
 *
 *   tsx --tsconfig platform/tsconfig.json platform/cli/site-rebuild.ts --run --rebuild-id <uuid>
 *   tsx --tsconfig platform/tsconfig.json platform/cli/site-rebuild.ts --build-only --spec-file <spec.json> [--assets-dir <dir>]
 *   tsx --tsconfig platform/tsconfig.json platform/cli/site-rebuild.ts --brand-support [--template <templateId>]
 *
 * --run --rebuild-id <uuid>   THE HOSTED RUN (started by .github/workflows/rebuild-site.yml). Claims the rebuild job of
 *                             BoostChat, builds the package from the spec BoostChat returns, uploads, reads back and SEALS it
 *                             (publishSite activate:false), reporting `built` and `sealed` events. It makes NOTHING public: it
 *                             never reads or writes `routing/`, never announces, never touches a Worker route or DNS
 *                             (CONTRACTS §9.4; platform/provision/rebuild-runner.ts). The only argument is the job id (checked
 *                             as a UUID); what is built is decided by the spec alone. Environment:
 *
 *   BOOSTCHAT_BASE_URL          e.g. https://boostchat.co.kr (http only for a loopback host)        } the names
 *   BOOSTCHAT_PUBLISHER_TOKEN   bearer token of the publisher API; never printed                    } site-provision uses
 *   GITHUB_RUN_ID / GITHUB_RUN_ATTEMPT   the run that claims the job (set by GitHub Actions)
 *   CLOUDFLARE_API_TOKEN        R2 object reads and writes (through wrangler); never printed. There is no zone id: no route is made
 *   CLOUDFLARE_ACCOUNT_ID       the account of the bucket (read by wrangler)
 *   RECON_PUBLISH_ALLOW_REMOTE  must be exactly 1 — the same switch site:publish --remote requires
 *   RECON_SITES_BUCKET          optional, default boost-sites-artifacts
 *   REBUILD_SOURCE_REF          optional: the commit the workflow was dispatched with; when set, the spec's sourceRef must equal it
 *
 *   The first five are needed to CLAIM the job (a problem ends the run before anything is sent, exit 2); the others are judged
 *   AFTER the claim, so a missing one is reported to the job as a `failed` event (step "unknown", code "runner_config").
 *
 * --build-only                The local build, offline: the brand images are the files of --assets-dir named
 *                             `<assetId>.<ext>` (png, jpg, jpeg, webp); each is checked against its reference (size, sha256,
 *                             media type and pixel size from the bytes). No claim, no event, no store, no route, no secret, no
 *                             environment variable, no network. It leaves data/sites/<siteId>/ and data/site-builds/<siteId>/
 *                             in the checkout (remove both after a local run). A site id that already exists in the checkout
 *                             with other files (a hand-made demo, say) is refused, never rewritten.
 *
 * --brand-support             Prints `site-brand-support@1` (CONTRACTS E7) for a template (default interior-02) to stdout:
 *                             generated from platform/provision/brand.ts, the same tables the build enforces — one entry per
 *                             release the template's starter lists, each derived from that release's record (a release that
 *                             carries the design system supports `appearance.typography`). Reads the starter and the release
 *                             store of this checkout; writes nothing.
 *
 * Exit codes
 *   0  --run: the package is sealed and BoostChat accepted `sealed` · --build-only: built and checked · --brand-support: printed
 *   1  --run: the job failed after the claim (a `failed` event was sent, or could not be delivered — the line says which), or
 *      BoostChat refused an event (this run is stale; nothing more was written)
 *   2  usage, or the variables needed for the claim are missing / unusable; nothing was sent
 *   3  --run: the claim was not accepted (job not found, not claimable, unauthorized, no answer); no event was sent
 *   4  --build-only: the rebuild failed (spec refused, asset refused, scaffold, build or package check)
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { WranglerStore } from "../publish/wrangler-store";
import { brandSupportDocument } from "../provision/brand";
import { RebuildApiError, createRebuildClient } from "../provision/rebuild-client";
import { rebuildSite, type RebuildResources } from "../provision/rebuild-runner";
import { RebuildStepFailure, buildRebuiltSite } from "../provision/rebuild";
import { createScrubber } from "../provision/scrub";
import { ProvisionError, isUuid } from "../provision/spec";

const repoRoot = process.cwd();
const env = process.env;
const args = process.argv.slice(2);
const USAGE =
  "usage: site-rebuild --run --rebuild-id <uuid>  |  site-rebuild --build-only --spec-file <spec.json> [--assets-dir <dir>]  |  site-rebuild --brand-support [--template <templateId>]";
const ASSET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

function usage(message: string): never {
  console.error(`site-rebuild: ${message}\n${USAGE}`);
  process.exit(2);
}

function flagValue(name: string): string | undefined {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (!value || value.startsWith("--")) usage(`${name} needs a value`);
  return value;
}

const MODES = ["--run", "--build-only", "--brand-support"] as const;
const mode = MODES.filter((m) => args.includes(m));
if (mode.length !== 1) usage("choose exactly one of --run, --build-only, --brand-support");
const VALUE_FLAGS: Record<(typeof MODES)[number], string[]> = { "--run": ["--rebuild-id"], "--build-only": ["--spec-file", "--assets-dir"], "--brand-support": ["--template"] };
const allowed = new Set<string>([mode[0]!, ...VALUE_FLAGS[mode[0]!]]);
const values = new Set(VALUE_FLAGS[mode[0]!].map(flagValue).filter((v): v is string => v !== undefined));
const stray = args.filter((a) => !allowed.has(a) && !values.has(a));
if (stray.length > 0) usage(`${mode[0]} takes only ${[...allowed].join(", ")}`);

// ----------------------------------------------------------- --brand-support --
if (mode[0] === "--brand-support") {
  const template = flagValue("--template") ?? "interior-02";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(template)) usage("--template is not a template id");
  try {
    console.log(JSON.stringify(await brandSupportDocument({ repoRoot, templateId: template }), null, 2));
    process.exit(0);
  } catch (error) {
    usage(`${(error as Error).message}`);
  }
}

// ----------------------------------------------------------------- build-only --
if (mode[0] === "--build-only") {
  const specFile = flagValue("--spec-file");
  const assetsDir = flagValue("--assets-dir");
  if (!specFile) usage("--build-only needs --spec-file <path>");
  const scrub = createScrubber([], [[repoRoot, "."]]);
  const log = (line: string) => console.log(scrub.line(line));

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.resolve(repoRoot, specFile), "utf8"));
  } catch (error) {
    usage(`cannot read the spec file: ${scrub.message(error, 200)}`);
  }

  // the files for the asset ids the spec names (an id is matched against a closed pattern before it becomes part of a file name)
  const assetBytes = new Map<string, Buffer>();
  if (assetsDir) {
    let present: string[];
    try {
      present = await readdir(path.resolve(repoRoot, assetsDir));
    } catch (error) {
      usage(`cannot read the assets directory: ${scrub.message(error, 200)}`);
    }
    const listed = (raw as { assets?: unknown } | null)?.assets;
    for (const entry of Array.isArray(listed) ? listed : []) {
      const id = (entry as { id?: unknown } | null)?.id;
      if (typeof id !== "string" || !ASSET_ID_RE.test(id)) continue;
      const file = EXTENSIONS.map((ext) => `${id}.${ext}`).find((name) => present.includes(name));
      if (file) assetBytes.set(id, await readFile(path.join(path.resolve(repoRoot, assetsDir), file)));
    }
  }

  try {
    log("build-only: no claim, no event, no store, no route");
    const started = Date.now();
    const { validated, facts, scaffold, durationMs, siteSnapshotHash, starterHash, design } = await buildRebuiltSite({ repoRoot, spec: raw, assetBytes, log });
    console.log(
      JSON.stringify(
        {
          status: "built",
          mode: "build-only",
          rebuildId: validated.spec.rebuildId,
          siteId: validated.effective.siteId,
          hostname: validated.effective.hostname,
          releaseId: validated.effective.template.releaseId,
          indexing: validated.spec.indexing,
          design,
          brandFields: validated.spec.brand ? Object.keys(validated.spec.brand) : [],
          scaffold,
          packageHash: facts.packageHash,
          buildInputId: facts.buildInputId,
          siteSnapshotHash,
          starterHash,
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
    const where = error instanceof RebuildStepFailure ? `${error.step} (${error.code})` : "unexpected";
    console.error(`site-rebuild build-only FAILED at ${where}: ${scrub.message(error, 2000)}`);
    process.exit(4);
  }
}

// ------------------------------------------------------------------- hosted run --
const rebuildId = flagValue("--rebuild-id") ?? "";
const baseUrl = env.BOOSTCHAT_BASE_URL ?? "";
const publisherToken = env.BOOSTCHAT_PUBLISHER_TOKEN ?? "";
const runId = env.GITHUB_RUN_ID ?? "";
const runAttempt = Number(env.GITHUB_RUN_ATTEMPT ?? "");
const cloudflareToken = env.CLOUDFLARE_API_TOKEN ?? "";
const sourceRef = env.REBUILD_SOURCE_REF || undefined;
const scrub = createScrubber([publisherToken, cloudflareToken], [[repoRoot, "."]]);
const log = (line: string) => console.log(scrub.line(line));

const missing = [
  ...(isUuid(rebuildId) ? [] : ["--rebuild-id (a lowercase UUID)"]),
  ...(baseUrl ? [] : ["BOOSTCHAT_BASE_URL"]),
  ...(publisherToken ? [] : ["BOOSTCHAT_PUBLISHER_TOKEN"]),
  ...(/^[0-9]{1,20}$/.test(runId) ? [] : ["GITHUB_RUN_ID"]),
  ...(Number.isInteger(runAttempt) && runAttempt >= 1 ? [] : ["GITHUB_RUN_ATTEMPT"]),
  ...(sourceRef === undefined || /^[0-9a-f]{40}$/.test(sourceRef) ? [] : ["REBUILD_SOURCE_REF (a 40-character commit id)"]),
];
if (missing.length > 0) usage(`${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} not set or not usable; nothing was claimed`);

let boostchat: ReturnType<typeof createRebuildClient>;
try {
  boostchat = createRebuildClient({ baseUrl, token: publisherToken, rebuildId });
} catch (error) {
  if (error instanceof RebuildApiError) usage(`${scrub.message(error, 300)}; nothing was claimed`);
  throw error;
}

/** Everything that touches the bucket. Called after the claim (rebuild-runner.ts): what is wrong is named by variable, never by value. */
function resources(): RebuildResources {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const bucket = env.RECON_SITES_BUCKET || "boost-sites-artifacts";
  const problems = [
    ...(env.RECON_PUBLISH_ALLOW_REMOTE === "1" ? [] : ["RECON_PUBLISH_ALLOW_REMOTE is not 1 (this run writes to the live bucket and is refused without it)"]),
    ...(cloudflareToken && !/\s/.test(cloudflareToken) ? [] : ["CLOUDFLARE_API_TOKEN is not set"]),
    ...(/^[0-9a-f]{32}$/.test(accountId) ? [] : ["CLOUDFLARE_ACCOUNT_ID is not an account id"]),
    ...(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ? [] : ["RECON_SITES_BUCKET is not a bucket name"]),
  ];
  if (problems.length > 0) throw new ProvisionError("runner_config", `the runner is not configured: ${problems.join("; ")}`);
  return { store: new WranglerStore({ repoRoot, bucket, mode: "remote", allowRemote: true }) };
}

log(`site-rebuild: rebuild ${rebuildId} · run ${runId} attempt ${runAttempt} · ${boostchat.description}`);
const started = Date.now();
const result = await rebuildSite({ repoRoot, boostchat, run: { runId, runAttempt }, resources, log, secrets: [publisherToken, cloudflareToken], expectedSourceRef: sourceRef });
if (result.ok) {
  console.log(JSON.stringify({ status: "sealed", ...result, ok: undefined, seconds: Math.round((Date.now() - started) / 1000) }, null, 2));
  process.exit(0);
}
if (result.stage === "claim") {
  console.error(`site-rebuild: the claim was not accepted (${result.code}); no event was sent`);
  process.exit(3);
}
if (result.stage === "event") {
  console.error(`site-rebuild STOPPED: BoostChat refused an event (${result.code}); this run is stale and wrote nothing more`);
  process.exit(1);
}
console.error(`site-rebuild FAILED at ${result.stage} (${result.code}); failed event ${result.failedEventSent ? "accepted" : "NOT accepted"} by BoostChat`);
process.exit(1);
