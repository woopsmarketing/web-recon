/**
 * The rebuild runner — `tsx --tsconfig platform/tsconfig.json platform/test/rebuild-runner.test.ts`
 *
 * Offline: no network target, no wrangler, no Cloudflare, no real BoostChat. BoostChat is a fake `fetch` (and, once, a real
 * HTTP server on 127.0.0.1 for the local entry); the bucket is a directory in the OS temp dir. The site builds are REAL
 * (platform/build/site-build.ts over the stored interior-02 release), in a throwaway repository root that links this
 * checkout's release store, starters and node_modules — nothing is written into data/sites or data/site-builds here.
 *
 *   A  structure   what the runner cannot do, by construction: its imports, the guarded store, the workflow file
 *   B  client      the two routes of CONTRACTS §9.2: claim / events, the answers, 409 and the duplicate acknowledgement
 *   C  happy path  claim → built → sealed; the package sealed in the bucket; nothing under routing/; only claim/events requests
 *   D  refusals    every failure sends ONE `failed` event with the right step and writes nothing it must not (nothing uploaded
 *                  for spec / asset / build failures; no seal for an upload failure)
 *   E  stale run   409 stops the run at once, with no further write
 *   F  idempotence the same job again → the same package, nothing uploaded twice; the brand-null rebuild IS the provisioning package
 *   G  local entry platform/provision/dev/local-rebuild.ts against a local HTTP BoostChat
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { buildSite } from "../build/site-build";
import { listPresets, loadPreset } from "../design/preset";
import { DirectoryStore, type ObjectMeta, type ObjectStore } from "../publish/store";
import { LINKED_FROM_CHECKOUT, linkCheckoutInto, prepareLocalRoot } from "../provision/dev/local-rebuild";
import { buildProvisionedSite } from "../provision/provision";
import { RebuildApiError, RebuildEventDataSchemas, createRebuildClient, rebuildClaimPath, rebuildEventsPath, type RebuildEventType } from "../provision/rebuild-client";
import { StoreKeyForbidden, guardStore, rebuildSite, type RebuildDeps, type RebuildResult } from "../provision/rebuild-runner";
import { type RebuildSpec } from "../provision/rebuild-spec";
import { createScrubber } from "../provision/scrub";
import { ProvisionError } from "../provision/spec";
import { STARTERS_DIR } from "../provision/starter";
import { packageKey, portfolioAssetKey, sealKey } from "../../workers/recon-runtime/src/contract";

const repoRoot = process.cwd();
const FIXTURE_DIR = "platform/provision/fixtures/rebuild";
const PUBLISHER_TOKEN = "pub-tok-SECRET-4f7a1c0e9b2d48aa";
const EVENT_TOKEN = "evt-tok-SECRET-Zx81kQp0aLm3Vt9YbC2dE5fG7hJ4nR6s";
const SECRETS = [PUBLISHER_TOKEN, EVENT_TOKEN];
const RUN = { runId: "1234567890", runAttempt: 1 };
const ATTEMPT = 2;

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${String((error as Error)?.stack ?? error).split("\n").slice(0, 6).join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${msg}: ${x} ≠ ${y}`);
}
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const JSON_META: ObjectMeta = { contentType: "application/json", cacheControl: "no-store" };

// -------------------------------------------------------------------- fixtures --
const fixture = (await readJson(path.join(repoRoot, FIXTURE_DIR, "rebuild-spec.json"))) as RebuildSpec;
const REBUILD = fixture.rebuildId;
const SITE = fixture.siteId;
const fixtureBytes = new Map<string, Buffer>();
for (const ref of fixture.assets) fixtureBytes.set(ref.id, await readFile(path.join(repoRoot, FIXTURE_DIR, "assets", `${ref.id}.png`)));

const tmpDirs: string[] = [];
async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** A throwaway repository root: this checkout's releases, starters and node_modules (linked), and what identifies every existing site. */
async function makeRoot(): Promise<string> {
  const root = await tmp("rebuild-runner-root-");
  await mkdir(path.join(root, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(root, "data/template-releases"));
  await symlink(path.join(repoRoot, STARTERS_DIR), path.join(root, STARTERS_DIR));
  await symlink(path.join(repoRoot, "data/site-presets"), path.join(root, "data/site-presets"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  for (const e of await readdir(path.join(repoRoot, "data/sites"), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    for (const rel of ["site.json", "content/business.json"]) {
      const from = path.join(repoRoot, "data/sites", e.name, rel);
      if (!(await stat(from).catch(() => undefined))) continue;
      await mkdir(path.dirname(path.join(root, "data/sites", e.name, rel)), { recursive: true });
      await cp(from, path.join(root, "data/sites", e.name, rel));
    }
  }
  return root;
}

/** every file under a directory, relative, sorted */
async function walk(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(dir, r)));
    else out.push(r);
  }
  return out.sort();
}
/** the bucket's content as one hash (paths + bytes) */
async function treeHash(dir: string): Promise<string> {
  const h = createHash("sha256");
  for (const f of await walk(dir)) h.update(`${f}\0${sha256(await readFile(path.join(dir, f)))}\n`);
  return h.digest("hex");
}

// ------------------------------------------------------------------- the bucket --
interface Faults {
  failPut?: (key: string) => boolean;
  corruptPut?: (key: string) => boolean;
  failGet?: (key: string) => boolean;
}
/** A directory bucket that records every call that reaches it (so: every call the runner's guard let through). */
class RecordingStore implements ObjectStore {
  readonly description: string;
  readonly ops: { op: "get" | "put"; key: string }[] = [];
  private readonly inner: DirectoryStore;
  constructor(
    readonly dir: string,
    public faults: Faults = {},
  ) {
    this.inner = new DirectoryStore(dir);
    this.description = `recording ${dir}`;
  }
  get puts() {
    return this.ops.filter((o) => o.op === "put").map((o) => o.key);
  }
  get gets() {
    return this.ops.filter((o) => o.op === "get").map((o) => o.key);
  }
  async put(key: string, body: Uint8Array, meta: ObjectMeta) {
    this.ops.push({ op: "put", key });
    if (this.faults.failPut?.(key)) throw new Error(`injected put failure: ${key}`);
    const stored = new Uint8Array(body);
    if (this.faults.corruptPut?.(key) && stored.length > 0) stored[0] = stored[0]! ^ 0xff;
    return this.inner.put(key, stored, meta);
  }
  async get(key: string) {
    this.ops.push({ op: "get", key });
    if (this.faults.failGet?.(key)) throw new Error(`injected get failure: ${key}`);
    return this.inner.get(key);
  }
}

/** a bucket holding the spec's brand images under portfolio-assets/<key> (as BoostChat's asset store leaves them) */
async function makeBucket(spec: RebuildSpec = fixture, bytes: ReadonlyMap<string, Buffer> = fixtureBytes): Promise<RecordingStore> {
  const dir = await tmp("rebuild-runner-bucket-");
  const direct = new DirectoryStore(dir);
  for (const ref of spec.assets) if (bytes.has(ref.id)) await direct.put(portfolioAssetKey(ref.key), bytes.get(ref.id)!, JSON_META);
  return new RecordingStore(dir);
}

// ----------------------------------------------------------------- fake BoostChat --
interface FakeOptions {
  spec?: unknown;
  /** override one answer: (pathname, body, n-th request) → Response */
  answer?: (pathname: string, body: any, n: number) => Response | undefined;
  /** override the answer to one event type: (type, n-th event request of that type) → Response */
  onEvent?: (type: string, n: number) => Response | undefined;
  /** the job id of the route the client was built for (default REBUILD) */
  jobId?: string;
}
/** A BoostChat that speaks CONTRACTS §9.2, including its order rule (built → sealed), its 409s and the duplicate acknowledgement. */
function fakeBoostChat(opts: FakeOptions = {}) {
  const requests: { pathname: string; method: string; authorization: string; body: any }[] = [];
  const events: { type: RebuildEventType; data: any }[] = [];
  const seen: Record<string, number> = {};
  let last: string | undefined;
  const doFetch = (async (url: unknown, init?: RequestInit) => {
    const u = new URL(String(url));
    const body = JSON.parse(String(init?.body ?? "null"));
    requests.push({ pathname: u.pathname, method: String(init?.method), authorization: (init?.headers as Record<string, string>).authorization ?? "", body });
    const override = opts.answer?.(u.pathname, body, requests.length);
    if (override) return override;
    if (u.origin !== "https://boostchat.test.example" || init?.method !== "POST") return json(404, { error: "not_found" });
    if (requests.at(-1)!.authorization !== `Bearer ${PUBLISHER_TOKEN}`) return json(401, { error: "unauthorized" });
    if (u.pathname === rebuildClaimPath(REBUILD)) return json(200, { ok: true, job: { id: REBUILD, attempt: ATTEMPT }, eventToken: EVENT_TOKEN, spec: opts.spec ?? fixture });
    if (u.pathname === rebuildEventsPath(REBUILD)) {
      if (body.attempt !== ATTEMPT || body.eventToken !== EVENT_TOKEN) return json(409, { error: "stale_attempt" });
      seen[body.type] = (seen[body.type] ?? 0) + 1;
      const forced = opts.onEvent?.(body.type, seen[body.type]!);
      if (forced) return forced;
      const fingerprint = JSON.stringify([body.type, body.data]);
      if (fingerprint === last) return json(200, { ok: true, duplicate: true });
      const lastType = events.at(-1)?.type;
      const inOrder = body.type === "built" ? lastType === undefined : body.type === "sealed" ? lastType === "built" : lastType !== "sealed";
      if (!inOrder) return json(409, { error: "out_of_order" });
      events.push({ type: body.type, data: body.data });
      last = fingerprint;
      return json(200, { ok: true });
    }
    return json(404, { error: "job_not_found" });
  }) as typeof fetch;
  const client = createRebuildClient({ baseUrl: "https://boostchat.test.example", token: PUBLISHER_TOKEN, rebuildId: opts.jobId ?? REBUILD, fetch: doFetch, sleep: async () => {} });
  return { client, requests, events };
}
type Fake = ReturnType<typeof fakeBoostChat>;

/** one run of rebuildSite over a fake BoostChat and a recording bucket */
async function runJob(o: { root: string; bucket: RecordingStore; boost?: Fake; deps?: Partial<RebuildDeps>; fake?: FakeOptions }) {
  const boost = o.boost ?? fakeBoostChat(o.fake);
  const logs: string[] = [];
  const result = await rebuildSite({ repoRoot: o.root, boostchat: boost.client, run: RUN, resources: () => ({ store: o.bucket }), log: (l) => logs.push(l), secrets: [PUBLISHER_TOKEN], ...o.deps });
  return { result, boost, logs, bucket: o.bucket };
}

/** The two things that must hold after EVERY scenario: nothing under routing/, and no request but claim / events. */
async function assertInvariants(label: string, r: { boost: Fake; logs: string[]; result: RebuildResult; bucket: RecordingStore }) {
  const keys = (await walk(r.bucket.dir)).filter((k) => !/\.put-\d+-\d+$/.test(k));
  assert(!keys.some((k) => k.startsWith("routing/") || k.includes("/routing/")), `${label}: the bucket holds a routing key: ${keys.filter((k) => k.includes("routing/")).join(", ")}`);
  assert(![...r.bucket.gets, ...r.bucket.puts].some((k) => k.startsWith("routing/")), `${label}: the bucket was asked for a routing key`);
  assert(keys.every((k) => k.startsWith("portfolio-assets/") || k.startsWith(`sites/${SITE}/packages/`)), `${label}: a key outside portfolio-assets/ and sites/${SITE}/packages/: ${keys.find((k) => !k.startsWith("portfolio-assets/") && !k.startsWith(`sites/${SITE}/packages/`))}`);
  for (const q of r.boost.requests) {
    assert(q.method === "POST" && (q.pathname === rebuildClaimPath(REBUILD) || q.pathname === rebuildEventsPath(REBUILD)), `${label}: a request other than claim / events: ${q.method} ${q.pathname}`);
  }
  const everything = JSON.stringify([r.logs, r.boost.events, r.result]);
  for (const secret of SECRETS) assert(!everything.includes(secret), `${label}: a secret reached a log line, an event or the result`);
  assert(!r.logs.some((l) => /announce|route_ready|Worker route/i.test(l)), `${label}: a log line speaks of announcing or routes`);
}

const eventTypes = (r: { boost: Fake }) => r.boost.events.map((e) => e.type);
const stages = (r: { result: RebuildResult }) => (r.result.ok ? "ok" : `${r.result.stage}/${r.result.code}`);
const neverBuild = async () => {
  throw new Error("the builder must not be reached");
};

const results: Record<string, unknown> = {};
try {
  // ══ A. structure ═══════════════════════════════════════════════════════════════════════════
  console.log("A. structure — what the runner cannot do");
  /** the import specifiers and imported names of a source file */
  const importsOf = async (file: string) => {
    const src = await readFile(path.join(repoRoot, file), "utf8");
    return [...src.matchAll(/^import\s+(?:type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(\{[^}]*\}))?\s*(?:from\s+)?["']([^"']+)["']/gm)].map((m) => ({ names: `${m[1] ?? ""} ${m[2] ?? ""}`, from: m[3]! }));
  };
  await check("A1 imports: the files of the rebuild path import nothing of the announcer, the managed publish flow, the Worker route / deploy code or the wrangler store; the runner takes ONE function from publish.ts (publishSite, with activate:false)", async () => {
    const files = ["platform/provision/rebuild-runner.ts", "platform/provision/rebuild.ts", "platform/provision/rebuild-client.ts", "platform/provision/rebuild-spec.ts", "platform/provision/brand.ts"];
    for (const file of files) {
      for (const imp of await importsOf(file)) {
        assert(!/announce|managed-flow|\/routes|deploy-routes|wrangler|cloudflare/i.test(imp.from), `${file} imports ${imp.from}`);
        assert(!/\b(routingKey|AnnounceError|createBoostChatAnnouncer|ShellPackageAnnouncer|ensureHostRoute|createCloudflareRouteClient|publishManaged|rollbackManaged|rollbackHost|writeRoutingPointer)\b/.test(imp.names), `${file} imports ${imp.names.trim()} from ${imp.from}`);
      }
    }
    const fromPublish = (await importsOf("platform/provision/rebuild-runner.ts")).filter((i) => i.from === "../publish/publish");
    eq(fromPublish.map((i) => i.names.trim()), ["{ publishSite }"], "what the runner takes from publish.ts");
    const src = await readFile(path.join(repoRoot, "platform/provision/rebuild-runner.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert((code.match(/\bpublishSite\(/g) ?? []).length === 1 && /activate: false/.test(code) && !/activate: true|activate:true/.test(code), "publishSite is called once, with activate: false");
    eq((code.match(/routing\//g) ?? []).length, 1, "routing/ appears once in the runner's code…");
    assert(code.includes('key.startsWith("routing/")'), "…in the guard's refusal message");
    // the client has exactly two routes
    const client = (await readFile(path.join(repoRoot, "platform/provision/rebuild-client.ts"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    eq([...client.matchAll(/\/api\/publisher\/[a-z-]+\/\$\{[a-zA-Z.]+\}\/(\w+)/g)].map((m) => m[1]), ["claim", "events"], "routes in rebuild-client.ts");
    assert(!/shell-packages|announce/i.test(client), "the client knows no announce route");
  });
  await check("A2 guardStore: reads only portfolio-assets/<assetKeyPrefix>… and sites/<siteId>/packages/…; writes only sites/<siteId>/packages/…; routing/, another site, the overlay, the asset area for a write, dot segments and an empty segment are refused — and never reach the bucket", async () => {
    const dir = await tmp("rebuild-guard-");
    const rec = new RecordingStore(dir);
    const prefix = fixture.assetKeyPrefix;
    const guard = guardStore(rec, { siteId: SITE, assetKeyPrefix: prefix });
    const pkg = packageKey(SITE, "a".repeat(64), "index.html");
    await guard.put(pkg, new Uint8Array([1, 2, 3]), JSON_META);
    eq([...(await guard.get(pkg))!], [1, 2, 3], "read back an own package key");
    eq(await guard.get(portfolioAssetKey(`${prefix}1f0c8a64-6d2b-4b8e-9a31-0c5e7d2f4a10.png`)), null, "an asset key under the prefix may be read");
    const before = rec.ops.length;
    const refusedReads = ["routing/rebuild-fixture.boostweb.co.kr.json", "routing/", `sites/other-site/packages/${"a".repeat(64)}/index.html`, `portfolio-public/${SITE}/current/${"a".repeat(64)}.json`, `portfolio-assets/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d/brand/x.png`, `sites/${SITE}/packages/../../routing/x.json`, `sites/${SITE}/packages//x`, `portfolio-assets/${prefix}../x`, `sites/${SITE}/other/x`, "_package.json"];
    for (const key of refusedReads) {
      let error: unknown;
      try {
        await guard.get(key);
      } catch (e) {
        error = e;
      }
      assert(error instanceof StoreKeyForbidden && error instanceof ProvisionError && (error as ProvisionError).code === "store_key_forbidden", `get ${key} was not refused`);
    }
    const refusedWrites = [...refusedReads, portfolioAssetKey(`${prefix}1f0c8a64-6d2b-4b8e-9a31-0c5e7d2f4a10.png`), "routing/x.json"];
    for (const key of refusedWrites) {
      let error: unknown;
      try {
        await guard.put(key, new Uint8Array([9]), JSON_META);
      } catch (e) {
        error = e;
      }
      assert(error instanceof StoreKeyForbidden, `put ${key} was not refused`);
    }
    eq(rec.ops.length, before, "no refused call reached the bucket");
    eq((guard.refused.length), refusedReads.length + refusedWrites.length, "every refusal is recorded");
    assert((await walk(dir)).every((k) => k === pkg), "only the package key was written");
  });
  await check("A3 the workflow: workflow_dispatch(rebuild_id, source_ref — both required), the commit proven to be on the trusted branch before anything of it runs, contents: read, one job, no ${{ }} in a run script, actions pinned, secrets on the one real step — and NO publish / activate / route / announce / wrangler / zone step", async () => {
    const yml = await readFile(path.join(repoRoot, ".github/workflows/rebuild-site.yml"), "utf8");
    const code = yml.replace(/^\s*#.*$/gm, "");
    const lines = code.split("\n");
    assert(/^on:\n  workflow_dispatch:\n    inputs:\n      rebuild_id:\n(?:        .*\n)*?        type: string\n        required: true\n      source_ref:\n(?:        .*\n)*?        type: string\n        required: true\n/m.test(code), "inputs");
    assert(!/^\s{6}[a-z_]+:\n(?:\s{8}.*\n)*?\s{8}type: boolean/m.test(code), "no boolean input (no smoke mode)");
    assert(/^permissions:\n  contents: read\n/m.test(code) && !/:\s*write\b/.test(code) && (code.match(/^\s*permissions:/gm) ?? []).length === 1, "permissions");
    assert(code.includes("concurrency:\n  group: rebuild-${{ inputs.rebuild_id }}\n  cancel-in-progress: false\n"), "concurrency");
    assert(/runs-on: ubuntu-latest\n    timeout-minutes: 25\n/.test(code) && (code.match(/^  [a-z-]+:\n    runs-on:/gm) ?? []).length === 1, "one job");
    eq(code.match(/^    environment: .+$/gm) ?? [], ["    environment: site-rebuild"], "the job's environment (the secrets live there, default branch only)");
    const stepNames = [...code.matchAll(/^      - name: (.+)$/gm)].map((m) => m[1]!);
    eq(stepNames.slice(0, 2), ["Check out the runner", "Refuse a commit that is not on the trusted branch"], "the first two steps");
    const guard = code.slice(code.indexOf("      - name: Refuse a commit that is not on the trusted branch"), code.indexOf("      - name: Set up Node 22"));
    assert(!/^\s*if:/m.test(guard) && guard.includes("compare/$TRUSTED_BRANCH...$head") && /identical\|behind\) echo/.test(guard), "the guard");
    const scripts: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)run:\s*(.*)$/.exec(lines[i]!);
      if (!m) continue;
      if (m[2] !== "|" && m[2] !== ">") {
        scripts.push(m[2]!);
        continue;
      }
      const block: string[] = [];
      for (let j = i + 1; j < lines.length && (lines[j]!.trim() === "" || lines[j]!.startsWith(`${m[1]}  `)); j++) block.push(lines[j]!);
      scripts.push(block.join("\n"));
    }
    assert(scripts.length >= 5, `run scripts: ${scripts.length}`);
    for (const s of scripts) assert(!s.includes("${{"), `an expression inside a run script: ${s}`);
    const uses = lines.filter((l) => /^\s*uses:/.test(l));
    assert(uses.length >= 3 && uses.every((l) => /^\s*uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(l)), `actions not pinned: ${uses.join(" | ")}`);
    const steps = code.slice(code.indexOf("    steps:\n")).split(/\n(?=      - name: )/).slice(1);
    const withSecrets = steps.filter((s) => s.includes("secrets."));
    eq(withSecrets.length, 1, "steps that map a secret");
    const real = withSecrets[0]!;
    assert(real.includes("REBUILD_ID: ${{ inputs.rebuild_id }}") && real.includes("REBUILD_SOURCE_REF: ${{ inputs.source_ref }}") && real.trimEnd().endsWith('platform/cli/site-rebuild.ts --run --rebuild-id "$REBUILD_ID"'), "the real step");
    for (const name of ["BOOSTCHAT_PUBLISHER_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) assert(real.includes(`${name}: \${{ secrets.${name} }}`), `${name} is not mapped from a secret`);
    assert(real.includes('RECON_PUBLISH_ALLOW_REMOTE: "1"') && real.includes("BOOSTCHAT_BASE_URL: ${{ vars.BOOSTCHAT_BASE_URL }}"), "the constants of the real step");
    // what this workflow must NOT contain (comments stripped): nothing that publishes, activates, routes, announces or holds a zone
    for (const [what, re] of [["site-publish", /site-publish|site:publish/], ["activate", /activate/i], ["a route", /\broutes?\b|routing/i], ["announce", /announce/i], ["wrangler", /wrangler/i], ["a zone", /ZONE/], ["a deploy", /deploy/i], ["--leave-incremental / rollback", /rollback|leave-incremental/i], ["the provisioning CLI", /site-provision\.ts/]] as const) {
      assert(!re.test(code), `the workflow contains ${what}`);
    }
    eq((code.match(/inputs\.rebuild_id/g) ?? []).length, 2, "inputs.rebuild_id: the concurrency group and one env mapping");
    eq((code.match(/inputs\.source_ref/g) ?? []).length, 3, "inputs.source_ref: the checkout and two env mappings (the guard, the runner)");
  });

  // ══ B. client ═══════════════════════════════════════════════════════════════════════════════
  console.log("B. the two routes of CONTRACTS §9.2");
  await check("B1 claim: POST …/site-rebuilds/<id>/claim with the Bearer header and { runId, runAttempt }; the caller gets the job and the spec — never the event token", async () => {
    const b = fakeBoostChat();
    const claim = await b.client.claim(RUN);
    eq(b.requests, [{ pathname: `/api/publisher/site-rebuilds/${REBUILD}/claim`, method: "POST", authorization: `Bearer ${PUBLISHER_TOKEN}`, body: { runId: "1234567890", runAttempt: 1 } }], "request");
    eq([claim.job, Object.keys(claim).sort()], [{ id: REBUILD, attempt: ATTEMPT }, ["job", "spec"]], "claim");
    assert(!JSON.stringify(claim).includes(EVENT_TOKEN) && !b.client.description.includes(PUBLISHER_TOKEN), "the event token left the client");
    eq(b.client.secrets().sort(), [EVENT_TOKEN, PUBLISHER_TOKEN].sort(), "secrets() — for the scrubber");
  });
  await check("B2 events: { attempt, eventToken, type, data } of the claim; data is exactly the contract's fields — built / sealed / failed with step ∈ scaffold|assets|build|check|upload|unknown; anything else is refused before it is sent; a message is cut to 300", async () => {
    const b = fakeBoostChat();
    const built = { packageHash: "a".repeat(64), buildInputId: "b".repeat(64), fileCount: 3, releaseId: fixture.template.releaseId, releaseHash: fixture.template.releaseHash, siteSnapshotHash: "c".repeat(64), starterHash: "d".repeat(64) };
    eq(await b.client.event("built", built).catch((e: RebuildApiError) => e.code), "config", "an event before a claim");
    await b.client.claim(RUN);
    const n0 = b.requests.length;
    const bad = async (p: Promise<unknown>) => ((await p.then(() => "(sent)", (e: RebuildApiError) => e.code)) as string);
    eq(await bad(b.client.event("built", { ...built, extra: 1 } as never)), "protocol", "an extra field");
    eq(await bad(b.client.event("built", { ...built, starterHash: undefined } as never)), "protocol", "a missing field");
    eq(await bad(b.client.event("built", { ...built, siteSnapshotHash: "xyz" })), "protocol", "a hash that is not one");
    eq(await bad(b.client.event("failed", { step: "announce" as never, code: "x", message: "m" })), "protocol", "a step outside the enum (announce is not a rebuild step)");
    eq(await bad(b.client.event("failed", { step: "route" as never, code: "x", message: "m" })), "protocol", "route is not a rebuild step either");
    eq(await bad(b.client.event("announced" as never, {} as never)), "protocol", "an event type the contract does not name (announced is a provisioning event)");
    eq(b.requests.length, n0, "nothing was sent for a refused event");
    await b.client.event("built", built);
    await b.client.event("sealed", { packageHash: "a".repeat(64), fileCount: 3, bytes: 100 });
    eq(b.events.map((e) => e.type), ["built", "sealed"], "accepted events");
    eq(b.requests.at(-1)!.body, { attempt: ATTEMPT, eventToken: EVENT_TOKEN, type: "sealed", data: { packageHash: "a".repeat(64), fileCount: 3, bytes: 100 } }, "event body");
    for (const step of ["scaffold", "assets", "build", "check", "upload", "unknown"] as const) assert(RebuildEventDataSchemas.failed.safeParse({ step, code: "x_y", message: "m" }).success, `step ${step}`);
    const f = fakeBoostChat();
    await f.client.claim(RUN);
    await f.client.event("failed", { step: "assets", code: "asset_missing", message: "x".repeat(900) });
    eq([f.events.at(-1)!.data.message.length, Object.keys(f.events.at(-1)!.data).sort()], [300, ["code", "message", "step"]], "failed event");
    eq(Object.keys(RebuildEventDataSchemas).sort(), ["built", "failed", "sealed"], "the event types of the contract");
  });
  await check("B3 answers: 401/403 → unauthorized, 404 → job_not_found, 409 on a claim → job_not_claimable, 409 on an event → event_refused (final, not retried), 5xx / no answer on an event → retried, 200 duplicate:true → success {duplicate:true}; an answer outside the contract or for another job → protocol; https only; no token in any message", async () => {
    const messages: string[] = [];
    const claimCode = async (answer: (p: string, b: any, n: number) => Response | undefined) => {
      try {
        await fakeBoostChat({ answer }).client.claim(RUN);
      } catch (e) {
        messages.push((e as Error).message);
        return (e as RebuildApiError).code;
      }
      return "(accepted)";
    };
    eq(await claimCode(() => json(401, { error: "unauthorized" })), "unauthorized", "401");
    eq(await claimCode(() => json(403, { error: "forbidden" })), "unauthorized", "403");
    eq(await claimCode(() => json(404, { error: "job_not_found" })), "job_not_found", "404");
    eq(await claimCode(() => json(409, { error: "job_not_claimable" })), "job_not_claimable", "409");
    eq(await claimCode(() => json(503, { error: `rebuild_not_configured token=${PUBLISHER_TOKEN}` })), "http", "503");
    eq(await claimCode(() => new Response("<html>", { status: 200 })), "protocol", "not JSON");
    eq(await claimCode(() => json(200, { ok: true, job: { id: REBUILD, attempt: 1 }, spec: fixture })), "protocol", "no event token");
    eq(await claimCode(() => json(200, { ok: true, job: { id: REBUILD, attempt: 1 }, eventToken: EVENT_TOKEN, spec: fixture, debug: true })), "protocol", "an extra field");
    eq(await claimCode(() => json(200, { ok: true, job: { id: "11111111-2222-3333-4444-555555555555", attempt: 1 }, eventToken: EVENT_TOKEN, spec: fixture })), "protocol", "another job");
    eq(await claimCode(() => { throw new Error(`socket hang up (authorization: Bearer ${PUBLISHER_TOKEN})`); }), "network", "no answer");

    const stale = fakeBoostChat({ answer: (p) => (p.endsWith("/events") ? json(409, { error: "stale_attempt" }) : undefined) });
    await stale.client.claim(RUN);
    eq(await stale.client.event("sealed", { packageHash: "a".repeat(64), fileCount: 1, bytes: 1 }).catch((e: RebuildApiError) => e.code), "event_refused", "409 on an event");
    eq(stale.requests.filter((r) => r.pathname.endsWith("/events")).length, 1, "a 409 is not retried");
    const flaky = fakeBoostChat({ answer: (p, _b, n) => (p.endsWith("/events") && n <= 3 ? (n === 2 ? json(502, { error: "bad_gateway" }) : (() => { throw new Error("ECONNRESET"); })()) : undefined) });
    await flaky.client.claim(RUN);
    await flaky.client.event("sealed", { packageHash: "a".repeat(64), fileCount: 1, bytes: 1 }).catch(() => {});
    eq(flaky.requests.filter((r) => r.pathname.endsWith("/events")).length, 3, "5xx and no answer are retried (this fake needs a built first, so the third is a 409 — but it was TRIED three times)");
    const down = fakeBoostChat({ answer: (p) => (p.endsWith("/events") ? json(500, { error: "internal" }) : undefined) });
    await down.client.claim(RUN);
    eq(await down.client.event("sealed", { packageHash: "a".repeat(64), fileCount: 1, bytes: 1 }).catch((e: RebuildApiError) => e.code), "http", "5xx three times");
    eq(down.requests.filter((r) => r.pathname.endsWith("/events")).length, 3, "three tries");
    const dup = fakeBoostChat();
    await dup.client.claim(RUN);
    const built = { packageHash: "a".repeat(64), buildInputId: "b".repeat(64), fileCount: 3, releaseId: fixture.template.releaseId, releaseHash: fixture.template.releaseHash, siteSnapshotHash: "c".repeat(64), starterHash: "d".repeat(64) };
    eq(await dup.client.event("built", built), { duplicate: false }, "first acknowledgement");
    eq(await dup.client.event("built", built), { duplicate: true }, "the exact repeat is a duplicate acknowledgement — success");

    const scrub = createScrubber(SECRETS);
    assert(!messages.some((m) => scrub.line(m).includes(PUBLISHER_TOKEN) || m.includes(EVENT_TOKEN)), `a message holds a token: ${messages.join(" | ")}`);
    for (const bad of [{ baseUrl: "http://boostchat.example", rebuildId: REBUILD }, { baseUrl: "https://boostchat.example/api", rebuildId: REBUILD }, { baseUrl: "https://boostchat.example", rebuildId: "not-a-uuid" }, { baseUrl: "https://boostchat.example", rebuildId: REBUILD.toUpperCase() }]) {
      let code = "(accepted)";
      try {
        createRebuildClient({ ...bad, token: PUBLISHER_TOKEN });
      } catch (e) {
        code = (e as RebuildApiError).code;
      }
      eq(code, "config", `config ${JSON.stringify(bad)}`);
    }
    eq(await fakeBoostChat().client.claim({ runId: "1; rm -rf /", runAttempt: 1 }).catch((e: RebuildApiError) => e.code), "config", "a run id that is not one");
  });

  // ══ C. happy path — ONE real build ════════════════════════════════════════════════════════
  console.log("C. happy path (a real build, a directory bucket, a fake BoostChat)");
  const root = await makeRoot();
  const happyBucket = await makeBucket();
  let happy: Awaited<ReturnType<typeof runJob>>;
  const t0 = Date.now();
  happy = await runJob({ root, bucket: happyBucket });
  results.happyMs = Date.now() - t0;
  await check("C1 events in order — built then sealed — and the run is ok; `built` carries packageHash, buildInputId, fileCount, releaseId, releaseHash, siteSnapshotHash, starterHash; `sealed` carries packageHash, fileCount, bytes", async () => {
    assert(happy.result.ok, `not ok: ${JSON.stringify(happy.result)}\n${happy.logs.slice(-8).join("\n")}`);
    eq(eventTypes(happy), ["built", "sealed"], "event order");
    const [built, sealed] = happy.boost.events.map((e) => e.data);
    eq(Object.keys(built).sort(), ["buildInputId", "fileCount", "packageHash", "releaseHash", "releaseId", "siteSnapshotHash", "starterHash"], "built keys");
    eq(Object.keys(sealed).sort(), ["bytes", "fileCount", "packageHash"], "sealed keys");
    // which preset was applied is in the runner's RESULT (its log / its step summary); the event shapes above are a contract and do not carry it
    eq(happy.result.design, null, "the result names the design applied: none");
    eq([built.releaseId, built.releaseHash], [fixture.template.releaseId, fixture.template.releaseHash], "the release the spec pinned");
    for (const k of ["packageHash", "buildInputId", "siteSnapshotHash", "starterHash"]) assert(/^[0-9a-f]{64}$/.test(built[k]), `${k} is a sha256`);
    eq(sealed.packageHash, built.packageHash, "the sealed package is the built package");
    results.happy = { fileCount: sealed.fileCount, bytes: sealed.bytes };
    // the build record says what the event says
    const record = await readJson(path.join(root, "data/site-builds", SITE, "packages", built.buildInputId, "build-record.json"));
    eq([record.packageHash, record.parts.siteSnapshotHash, record.buildInputId], [built.packageHash, built.siteSnapshotHash, built.buildInputId], "build-record.json");
    eq(happy.boost.requests.map((r) => r.pathname.split("/").pop()), ["claim", "events", "events"], "requests: claim, built, sealed");
  });
  await check("C2 the package is SEALED in the bucket and readable: the seal is the last object, every file of it reads back with its sha256 and size, index.html / 404.html present, the brand images are in it", async () => {
    const packageHash = (happy.result as Extract<RebuildResult, { ok: true }>).packageHash;
    const seal = await readJson(path.join(happyBucket.dir, sealKey(SITE, packageHash)));
    eq([seal.siteId, seal.packageHash], [SITE, packageHash], "seal identity");
    assert(seal.files.length > 50 && seal.files.some((f: any) => f.path === "index.html") && seal.files.some((f: any) => f.path === "404.html"), "seal lists the package");
    for (const f of seal.files) {
      const bytes = await readFile(path.join(happyBucket.dir, packageKey(SITE, packageHash, f.path)));
      assert(bytes.length === f.size && sha256(bytes) === f.sha256, `${f.path} does not read back as sealed`);
    }
    const lastPut = happyBucket.puts.at(-1);
    eq(lastPut, sealKey(SITE, packageHash), "the seal is written last");
    for (const id of ["fixture-logo", "fixture-hero", "fixture-about"]) assert(seal.files.some((f: any) => f.sha256 === sha256(fixtureBytes.get(id)!)), `the package holds the bytes of ${id}`);
    const home = await readFile(path.join(happyBucket.dir, packageKey(SITE, packageHash, "index.html")), "utf8");
    assert(home.includes("모아 인테리어") && !/name="robots"/.test(home), "the sealed home page is the rebuilt one (brand name, indexing index)");
    eq(happy.result.ok && happy.result.upload, "uploaded", "first upload");
  });
  await check("C3 the bucket after the run: portfolio-assets/<the three brand keys> and sites/<site>/packages/<hash>/** — NOTHING under routing/; the runner READ only the three asset keys (plus the seal check), WROTE only package keys; the fake BoostChat saw only claim + events", async () => {
    const keys = await walk(happyBucket.dir);
    eq(keys.filter((k) => !k.startsWith(`sites/${SITE}/packages/`)), fixture.assets.map((a) => portfolioAssetKey(a.key)).sort(), "everything that is not a package is an input image");
    eq(happyBucket.gets.filter((k) => k.startsWith("portfolio-assets/")).sort(), fixture.assets.map((a) => portfolioAssetKey(a.key)).sort(), "assets read");
    assert(happyBucket.puts.every((k) => k.startsWith(`sites/${SITE}/packages/`)), "writes");
    await assertInvariants("happy", happy);
  });

  // ══ D. refusals ═══════════════════════════════════════════════════════════════════════════
  console.log("D. every failure sends one `failed` event and writes only what it may");
  await check("D1 claim refused (401 / 404 / 409 / no answer): no event, no bucket call, no build, exit-code stage `claim`", async () => {
    for (const [label, answer] of [["401", () => json(401, { error: "unauthorized" })], ["404", () => json(404, { error: "job_not_found" })], ["409", () => json(409, { error: "job_not_claimable" })], ["no answer", () => { throw new Error("ECONNREFUSED"); }]] as const) {
      const bucket = await makeBucket();
      const r = await runJob({ root, bucket, fake: { answer: (p) => (p.endsWith("/claim") ? (answer as () => Response)() : undefined) }, deps: { buildSite: neverBuild } });
      assert(!r.result.ok && r.result.stage === "claim" && /^claim_/.test(r.result.code), `${label}: ${stages(r)}`);
      eq([r.boost.requests.length, bucket.ops.length], [1, 0], `${label}: one request (the claim), no bucket call`);
      await assertInvariants(`claim ${label}`, r);
    }
  });
  await check("D2 an unsupported brand field (hero.overlay, hero.cta → portfolio, typography …) → failed at `scaffold` (brand_field_unsupported), naming the fields; the bucket was not touched (not even an asset read); nothing built", async () => {
    const spec = clone(fixture) as any;
    spec.brand.hero.overlay = "soft";
    spec.brand.appearance.typography = "editorial-serif";
    const bucket = await makeBucket();
    const r = await runJob({ root, bucket, fake: { spec }, deps: { buildSite: neverBuild } });
    assert(!r.result.ok && r.result.stage === "scaffold" && r.result.code === "brand_field_unsupported" && r.result.message.includes("hero.overlay") && r.result.message.includes("appearance.typography"), stages(r));
    eq(eventTypes(r), ["failed"], "one event");
    eq(r.boost.events[0]!.data.step, "scaffold", "step");
    eq(bucket.ops.length, 0, "no bucket call at all");
    await assertInvariants("unsupported", r);
    // the design seam: a preset that cannot be applied is refused the same way (scaffold), before the images are read —
    // one this checkout does not hold, another version of one it holds, and a real one on a release that cannot read it
    for (const [design, code] of [
      [{ presetId: "calm", presetVersion: 1 }, "design_unavailable"],
      [{ presetId: "luxury-gallery", presetVersion: 2 }, "design_version_mismatch"],
      [{ presetId: "luxury-gallery", presetVersion: 1 }, "design_release_too_old"],
    ] as const) {
      const withDesign = clone(fixture) as any;
      withDesign.design = design;
      const b2 = await makeBucket();
      const r2 = await runJob({ root, bucket: b2, fake: { spec: withDesign }, deps: { buildSite: neverBuild } });
      assert(!r2.result.ok && r2.result.stage === "scaffold" && r2.result.code === code, `${code}: ${stages(r2)}`);
      eq(eventTypes(r2), ["failed"], `${code}: one event`);
      eq(b2.ops.length, 0, `${code}: a refused design reads nothing from the bucket`);
      await assertInvariants(`design ${code}`, r2);
    }
  });
  await check("D3 the job and the spec must agree: a spec for another rebuild id, a sourceRef that is not the dispatched commit, a runner without its bucket configuration → failed (scaffold / scaffold / unknown), nothing uploaded", async () => {
    const other = clone(fixture) as any;
    other.rebuildId = "11111111-2222-4333-8444-555555555555";
    const a = await runJob({ root, bucket: await makeBucket(), fake: { spec: other }, deps: { buildSite: neverBuild } });
    assert(!a.result.ok && a.result.stage === "scaffold" && a.result.code === "rebuild_id_invalid", stages(a));
    const b = await runJob({ root, bucket: await makeBucket(), deps: { buildSite: neverBuild, expectedSourceRef: "b".repeat(40) } });
    assert(!b.result.ok && b.result.stage === "scaffold" && b.result.code === "source_ref_mismatch", stages(b));
    const c = await runJob({ root, bucket: await makeBucket(), deps: { buildSite: neverBuild, resources: () => { throw new ProvisionError("runner_config", "the runner is not configured: CLOUDFLARE_API_TOKEN is not set"); } } });
    assert(!c.result.ok && c.result.stage === "unknown" && c.result.code === "runner_config", stages(c));
    eq(c.boost.events[0]!.data.step, "unknown", "runner_config is reported as step unknown");
    for (const [label, r] of [["rebuild id", a], ["source ref", b], ["config", c]] as const) {
      eq(eventTypes(r), ["failed"], `${label}: one event`);
      eq(r.bucket.puts, [], `${label}: nothing written`);
      await assertInvariants(label, r);
    }
    const ok = await runJob({ root, bucket: await makeBucket(), deps: { buildSite: neverBuild, expectedSourceRef: fixture.sourceRef } });
    assert(!ok.result.ok && ok.result.stage === "build", `a matching sourceRef passes the check and reaches the builder: ${stages(ok)}`);
  });
  await check("D4 asset problems → failed at `assets`, nothing uploaded and no build: bytes that do not match their sha256 (asset_hash_mismatch), a truncated object (asset_size_mismatch), an object that is not in the bucket (asset_missing), a bucket read that errors (asset_fetch_failed)", async () => {
    const tampered = new Map(fixtureBytes);
    const hero = Buffer.from(fixtureBytes.get("fixture-hero")!);
    hero[100] = hero[100]! ^ 0xff;
    tampered.set("fixture-hero", hero);
    const truncated = new Map(fixtureBytes);
    truncated.set("fixture-logo", fixtureBytes.get("fixture-logo")!.subarray(0, 200));
    const missing = new Map(fixtureBytes);
    missing.delete("fixture-about");
    const cases: [string, RecordingStore, string][] = [
      ["sha256", await makeBucket(fixture, tampered), "asset_hash_mismatch"],
      ["size", await makeBucket(fixture, truncated), "asset_size_mismatch"],
      ["missing", await makeBucket(fixture, missing), "asset_missing"],
    ];
    const erroring = await makeBucket();
    erroring.faults.failGet = (k) => k.startsWith("portfolio-assets/");
    cases.push(["read error", erroring, "asset_fetch_failed"]);
    for (const [label, bucket, code] of cases) {
      const r = await runJob({ root, bucket, deps: { buildSite: neverBuild } });
      assert(!r.result.ok && r.result.stage === "assets" && r.result.code === code, `${label}: ${stages(r)}`);
      eq(eventTypes(r), ["failed"], `${label}: one event`);
      eq(r.boost.events[0]!.data.step, "assets", `${label}: step`);
      eq(bucket.puts, [], `${label}: NOTHING uploaded`);
      await assertInvariants(`assets ${label}`, r);
    }
  });
  await check("D5 an asset key outside the assetKeyPrefix (another tenant's, routing/, a traversal, a wrong extension, a bad prefix) → failed at `assets` (asset_key_refused) BEFORE any bucket read: the bucket saw no call at all", async () => {
    const edits: [string, (s: any) => void][] = [
      ["another tenant", (s) => (s.assets[0].key = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d/brand/1f0c8a64-6d2b-4b8e-9a31-0c5e7d2f4a10.png")],
      ["routing/", (s) => (s.assets[0].key = "routing/rebuild-fixture.boostweb.co.kr.json")],
      ["traversal", (s) => (s.assets[1].key = `${s.assetKeyPrefix}../../routing/x.png`)],
      ["extension", (s) => (s.assets[2].key = `${s.assetKeyPrefix}3b8e0c24-7d5f-4a71-9c83-2e4f7b9d0c32.svg`)],
      ["prefix", (s) => (s.assetKeyPrefix = "routing/")],
    ];
    for (const [label, edit] of edits) {
      const spec = clone(fixture) as any;
      edit(spec);
      const bucket = await makeBucket(fixture);
      const r = await runJob({ root, bucket, fake: { spec }, deps: { buildSite: neverBuild } });
      assert(!r.result.ok && r.result.stage === "assets" && r.result.code === "asset_key_refused", `${label}: ${stages(r)}`);
      eq(r.boost.events.map((e) => [e.type, e.data.step, e.data.code]), [["failed", "assets", "asset_key_refused"]], `${label}: the event`);
      eq(bucket.ops.length, 0, `${label}: the bucket saw NO call (not even a read)`);
      await assertInvariants(`key ${label}`, r);
    }
  });
  await check("D6 the build fails → failed at `build` (build_failed); `built` was not sent, nothing uploaded, no seal", async () => {
    const bucket = await makeBucket();
    const r = await runJob({ root, bucket, deps: { buildSite: async () => { throw new Error("next build exploded (token=" + PUBLISHER_TOKEN + ")"); } } });
    assert(!r.result.ok && r.result.stage === "build" && r.result.code === "build_failed", stages(r));
    eq(r.boost.events.map((e) => [e.type, e.data.step, e.data.code]), [["failed", "build", "build_failed"]], "the event");
    eq(bucket.puts, [], "nothing uploaded");
    assert(!(await walk(bucket.dir)).some((k) => k.startsWith("sites/")), "no package, no seal");
    await assertInvariants("build failure", r);
  });
  await check("D7 the package check fails (the built package does not carry the brand name) → failed at `check` (package_check_failed): `built` is not sent, nothing is uploaded", async () => {
    const bucket = await makeBucket();
    const corrupting = async (o: Parameters<typeof buildSite>[0]) => {
      const built = await buildSite(o); // the happy run's package: up-to-date
      const copy = await tmp("rebuild-check-package-");
      await cp(path.resolve(root, built.packageDir), copy, { recursive: true });
      const home = path.join(copy, "site/index.html");
      await writeFile(home, (await readFile(home, "utf8")).replaceAll("모아 인테리어", "다른 이름"));
      return { ...built, packageDir: copy };
    };
    const r = await runJob({ root, bucket, deps: { buildSite: corrupting } });
    assert(!r.result.ok && r.result.stage === "check" && r.result.code === "package_check_failed", stages(r));
    eq(r.boost.events.map((e) => [e.type, e.data.step]), [["failed", "check"]], "events");
    eq(bucket.puts, [], "nothing uploaded");
    await assertInvariants("check", r);
  });
  await check("D8 upload fails (a put throws / a put stores other bytes) → `built` sent, then failed at `upload`; NO seal in the bucket, NO `sealed` event; the failure message holds no secret", async () => {
    for (const [label, faults] of [["put throws", { failPut: (k: string) => k.endsWith("/index.html") }], ["corrupt put", { corruptPut: (k: string) => k.endsWith("/404.html") }]] as const) {
      const bucket = await makeBucket();
      bucket.faults = faults;
      const r = await runJob({ root, bucket });
      assert(!r.result.ok && r.result.stage === "upload" && r.result.code === "upload_failed", `${label}: ${stages(r)}`);
      eq(r.boost.events.map((e) => e.type), ["built", "failed"], `${label}: events`);
      eq(r.boost.events[1]!.data.step, "upload", `${label}: step`);
      const packageHash = r.boost.events[0]!.data.packageHash as string;
      assert(!(await stat(path.join(bucket.dir, sealKey(SITE, packageHash))).catch(() => undefined)), `${label}: a seal exists although the upload failed`);
      assert(!bucket.puts.includes(sealKey(SITE, packageHash)), `${label}: the seal was even attempted`);
      await assertInvariants(`upload ${label}`, r);
    }
  });

  // ══ E. stale run ══════════════════════════════════════════════════════════════════════════
  console.log("E. a 409 stops the run at once");
  await check("E1 409 on `built` → stop: no upload at all, no `failed` event, result stage `event`", async () => {
    const bucket = await makeBucket();
    const r = await runJob({ root, bucket, fake: { onEvent: (type) => (type === "built" ? json(409, { error: "stale_attempt" }) : undefined) } });
    assert(!r.result.ok && r.result.stage === "event" && r.result.code === "event_refused" && r.result.failedEventSent === false, stages(r));
    eq(r.boost.requests.map((q) => q.body?.type ?? "claim"), ["claim", "built"], "requests: the claim and the refused `built` — nothing after it, not even `failed`");
    eq(bucket.puts, [], "NO upload");
    eq(r.boost.events, [], "nothing accepted");
    await assertInvariants("409 built", r);
  });
  await check("E2 409 on `sealed` → stop: no `failed` event after it (the sealed package stays in the bucket, not public); 409 on the `failed` event of a refused spec → stop, nothing more", async () => {
    const bucket = await makeBucket();
    const r = await runJob({ root, bucket, fake: { onEvent: (type) => (type === "sealed" ? json(409, { error: "stale_attempt" }) : undefined) } });
    assert(!r.result.ok && r.result.stage === "event" && r.result.failedEventSent === false, stages(r));
    eq(r.boost.requests.map((q) => q.body?.type ?? "claim"), ["claim", "built", "sealed"], "requests");
    await assertInvariants("409 sealed", r);
    const spec = clone(fixture) as any;
    spec.brand.hero.overlay = "soft";
    const b2 = await makeBucket();
    const r2 = await runJob({ root, bucket: b2, fake: { spec, onEvent: (type) => (type === "failed" ? json(409, { error: "stale_attempt" }) : undefined) }, deps: { buildSite: neverBuild } });
    assert(!r2.result.ok && r2.result.stage === "scaffold" && r2.result.failedEventSent === false, stages(r2));
    eq(r2.boost.requests.map((q) => q.body?.type ?? "claim"), ["claim", "failed"], "requests");
    await assertInvariants("409 failed", r2);
  });
  await check("E3 the exact duplicate acknowledgement (200 duplicate:true) is SUCCESS, not an error", async () => {
    const bucket = await makeBucket();
    const r = await runJob({ root, bucket, fake: { onEvent: (type, n) => (type === "sealed" && n === 1 ? json(200, { ok: true, duplicate: true }) : undefined) } });
    assert(r.result.ok, stages(r));
    eq((r.result as Extract<RebuildResult, { ok: true }>).duplicateAcks, 1, "one duplicate acknowledgement counted");
    eq(r.boost.events.map((e) => e.type), ["built"], "the fake never recorded `sealed` (it answered duplicate) — the runner still treats it as accepted");
    assert(r.logs.some((l) => l.includes("duplicate acknowledgement")), "logged");
    await assertInvariants("duplicate", r);
  });

  // ══ F. idempotence and equivalence ═══════════════════════════════════════════════════════
  console.log("F. the same job again, and the brand-null rebuild against the provisioning build");
  await check("F1 the same job run again over the same bucket (a re-dispatch): the SAME package, `skipped-sealed`, no object written, the bucket byte-identical, events built + sealed again", async () => {
    const before = await treeHash(happyBucket.dir);
    const first = happy.result as Extract<RebuildResult, { ok: true }>;
    const putsBefore = happyBucket.puts.length;
    const again = await runJob({ root, bucket: happyBucket });
    assert(again.result.ok, stages(again));
    eq([again.result.packageHash, again.result.buildInputId, again.result.upload], [first.packageHash, first.buildInputId, "skipped-sealed"], "same package, nothing uploaded");
    eq(happyBucket.puts.length, putsBefore, "no put");
    eq(await treeHash(happyBucket.dir), before, "the bucket is byte-identical");
    eq(eventTypes(again), ["built", "sealed"], "events");
    eq(again.boost.events[0]!.data, happy.boost.events[0]!.data, "the same `built` data (reproducible build input)");
    assert(again.logs.some((l) => l.includes("up-to-date") || l.includes("unchanged") || l.includes("sealed")), "logged");
    await assertInvariants("rerun", again);
  });
  await check("F2 the invariant at artifact level (CONTRACTS §7): brand null / design null / noindex / the original name and phone rebuild to the SAME build input and site snapshot as the provisioning of that spec — and to the same package", async () => {
    const specA = clone(fixture) as any;
    specA.brand = null;
    specA.design = null;
    specA.indexing = "noindex";
    specA.assets = [];
    const provisionSpec = {
      schema: "site-provision-spec@1",
      siteId: specA.siteId,
      hostname: specA.hostname,
      publicOrigin: specA.publicOrigin,
      template: specA.template,
      identity: specA.identity,
      contact: specA.contact,
      boostchat: specA.boostchat,
    };
    const provRoot = await makeRoot();
    const prov = await buildProvisionedSite({ repoRoot: provRoot, spec: provisionSpec, log: () => {} });
    const provRecord = await readJson(path.join(prov.packageDir, "build-record.json"));
    const rebRoot = await makeRoot();
    const bucket = await makeBucket(specA);
    const r = await runJob({ root: rebRoot, bucket, fake: { spec: specA } });
    assert(r.result.ok, `${stages(r)}\n${r.logs.slice(-6).join("\n")}`);
    const built = r.boost.events[0]!.data;
    eq(built.siteSnapshotHash, provRecord.parts.siteSnapshotHash, "site snapshot hash");
    eq(built.buildInputId, prov.facts.buildInputId, "build input id");
    eq(built.packageHash, prov.facts.packageHash, "package hash");
    await assertInvariants("invariant", r);
  });

  // ══ G. the local entry ════════════════════════════════════════════════════════════════════
  console.log("G. platform/provision/dev/local-rebuild.ts against a local HTTP BoostChat");
  const tsx = path.join(repoRoot, "node_modules/.bin/tsx");
  const localEntry = path.join(repoRoot, "platform/provision/dev/local-rebuild.ts");
  const run = (file: string, args: string[], env: Record<string, string>) => {
    const r = spawnSync(tsx, ["--tsconfig", path.join(repoRoot, "platform/tsconfig.json"), file, ...args], { cwd: repoRoot, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: os.homedir(), ...env } as unknown as NodeJS.ProcessEnv, timeout: 60_000 });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  await check("G1 usage: no variables → exit 2 naming them; a non-loopback BoostChat → exit 2 and nothing claimed; an argument → exit 2; the site CLI `--run` without its variables → exit 2 naming them", async () => {
    const none = run(localEntry, [], {});
    assert(none.status === 2 && ["REBUILD_ID", "BOOSTCHAT_BASE_URL", "BOOSTCHAT_PUBLISHER_TOKEN", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "LOCAL_BUCKET_DIR"].every((n) => none.out.includes(n)), `${none.status} ${none.out}`);
    const dir = await tmp("rebuild-local-bucket-");
    const base = { REBUILD_ID: REBUILD, BOOSTCHAT_PUBLISHER_TOKEN: PUBLISHER_TOKEN, GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1", LOCAL_BUCKET_DIR: dir };
    const remote = run(localEntry, [], { ...base, BOOSTCHAT_BASE_URL: "https://boostchat.co.kr" });
    assert(remote.status === 2 && remote.out.includes("loopback") && !remote.out.includes(PUBLISHER_TOKEN), `${remote.status} ${remote.out}`);
    const lookalike = run(localEntry, [], { ...base, BOOSTCHAT_BASE_URL: "http://127.0.0.1.evil.example:3000" });
    assert(lookalike.status === 2 && lookalike.out.includes("loopback"), `${lookalike.status} ${lookalike.out}`);
    const arg = run(localEntry, ["--x"], base);
    assert(arg.status === 2, `${arg.status} ${arg.out}`);
    const cli = run(path.join(repoRoot, "platform/cli/site-rebuild.ts"), ["--run", "--rebuild-id", REBUILD], {});
    assert(cli.status === 2 && ["BOOSTCHAT_BASE_URL", "BOOSTCHAT_PUBLISHER_TOKEN", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"].every((n) => cli.out.includes(n)) && !cli.out.includes("CLOUDFLARE_ZONE_ID"), `${cli.status} ${cli.out}`);
  });
  await check("G2 one rebuild job end to end through the local entry: a real HTTP server on 127.0.0.1 speaks claim / events, the bucket is a directory holding the brand images; exit 0, the package is sealed in the bucket, nothing under routing/, the server saw only claim + built + sealed", async () => {
    const dir = await tmp("rebuild-local-e2e-bucket-");
    const direct = new DirectoryStore(dir);
    for (const ref of fixture.assets) await direct.put(portfolioAssetKey(ref.key), fixtureBytes.get(ref.id)!, JSON_META);
    const seen: { path: string; type?: string }[] = [];
    const accepted: string[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const parsed = body ? JSON.parse(body) : {};
        seen.push({ path: req.url ?? "", type: parsed.type });
        const send = (status: number, value: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(value));
        };
        if (req.headers.authorization !== `Bearer ${PUBLISHER_TOKEN}`) return send(401, { error: "unauthorized" });
        if (req.url === rebuildClaimPath(REBUILD)) return send(200, { ok: true, job: { id: REBUILD, attempt: ATTEMPT }, eventToken: EVENT_TOKEN, spec: fixture });
        if (req.url === rebuildEventsPath(REBUILD)) {
          if (parsed.attempt !== ATTEMPT || parsed.eventToken !== EVENT_TOKEN) return send(409, { error: "stale_attempt" });
          accepted.push(parsed.type);
          return send(200, { ok: true });
        }
        return send(404, { error: "not_found" });
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const t = Date.now();
      const child = spawn(tsx, ["--tsconfig", path.join(repoRoot, "platform/tsconfig.json"), localEntry], {
        cwd: repoRoot,
        env: { PATH: process.env.PATH ?? "", HOME: os.homedir(), REBUILD_ID: REBUILD, BOOSTCHAT_BASE_URL: `http://127.0.0.1:${port}`, BOOSTCHAT_PUBLISHER_TOKEN: PUBLISHER_TOKEN, GITHUB_RUN_ID: "42", GITHUB_RUN_ATTEMPT: "1", LOCAL_BUCKET_DIR: dir, REBUILD_SOURCE_REF: fixture.sourceRef } as unknown as NodeJS.ProcessEnv,
      });
      let out = "";
      child.stdout.on("data", (c) => (out += c));
      child.stderr.on("data", (c) => (out += c));
      const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
      results.localEntryMs = Date.now() - t;
      assert(code === 0, `exit ${code}\n${out.split("\n").slice(-15).join("\n")}`);
      eq(accepted, ["built", "sealed"], "events the server accepted");
      eq(seen.map((s) => s.path.split("/").pop()), ["claim", "events", "events"], "requests the server saw");
      const summary = JSON.parse(out.slice(out.indexOf("\n{\n") + 1));
      eq([summary.status, summary.siteId, summary.upload], ["sealed", SITE, "uploaded"], "summary");
      const keys = await walk(dir);
      assert(!keys.some((k) => k.startsWith("routing/")), "routing/ in the bucket");
      assert(keys.some((k) => k === sealKey(SITE, summary.packageHash)), "the seal is in the bucket");
      assert(!out.includes(PUBLISHER_TOKEN) && !out.includes(EVENT_TOKEN), "a token in the output");
      assert(!(await stat(path.join(repoRoot, "data/sites", SITE)).catch(() => undefined)), "the local entry wrote into the checkout");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  await check("G3 the root the local entry builds in holds what a designed build reads from the repository root: every preset of the checkout resolves from it, the font packages and licence texts a release pins are there, each link is the checkout's; a link that is already there (a harness adding data/site-presets from outside) is left alone, a foreign one is refused", async () => {
    const root = await prepareLocalRoot(repoRoot);
    tmpDirs.push(root);
    assert(path.basename(root).startsWith("rebuild-local-"), `root name ${path.basename(root)}`);
    assert((LINKED_FROM_CHECKOUT as readonly string[]).includes("data/site-presets"), "data/site-presets is not in the list the entry links");
    for (const linked of LINKED_FROM_CHECKOUT) eq(await realpath(path.join(root, linked)), await realpath(path.join(repoRoot, linked)), `${linked} in the root`);

    // presets: read from <root>/data/site-presets exactly as the rebuild seam reads them (platform/design/preset.ts)
    const TEMPLATE = "interior-02";
    const fromCheckout = await listPresets({ repoRoot, templateId: TEMPLATE });
    assert(fromCheckout.length > 0, "this checkout has no preset to resolve");
    for (const preset of fromCheckout) eq(await loadPreset({ repoRoot: root, templateId: TEMPLATE, presetId: preset.id, version: preset.version }), preset, `preset ${preset.id} from the root`);

    // fonts: every package a release pins, with its stylesheet and its licence text, under <root>/node_modules (platform/design/fonts.ts)
    let pinned = 0;
    for (const release of await readdir(path.join(root, "data/template-releases", TEMPLATE))) {
      const raw = await readFile(path.join(root, "data/template-releases", TEMPLATE, release, "files/templates", TEMPLATE, "v1/design/fonts.json"), "utf8").catch(() => undefined);
      if (raw === undefined) continue;
      const pins = JSON.parse(raw) as { sets: Record<string, { families: { package: string; stylesheet: string; licenceFile: string }[] }> };
      for (const set of Object.values(pins.sets)) {
        for (const family of set.families) {
          for (const rel of [family.stylesheet, family.licenceFile]) assert((await stat(path.join(root, "node_modules", family.package, rel)).catch(() => undefined))?.isFile(), `${release}: ${family.package}/${rel} is not in the root`);
          pinned += 1;
        }
      }
    }
    assert(pinned > 0, "no release of this checkout pins a font family");

    // the E2E harness adds <root>/data/site-presets itself the moment the root appears — before or after the entry does
    const early = await tmp("rebuild-local-early-");
    await mkdir(path.join(early, "data"), { recursive: true });
    await symlink(path.join(repoRoot, "data/site-presets"), path.join(early, "data/site-presets"));
    await linkCheckoutInto(repoRoot, early);
    await linkCheckoutInto(repoRoot, early);
    eq((await loadPreset({ repoRoot: early, templateId: TEMPLATE, presetId: fromCheckout[0]!.id })).id, fromCheckout[0]!.id, "preset from a root whose link was there first");
    eq((await readdir(path.join(early, "data"))).sort(), ["site-presets", "site-starters", "template-releases"], "data/ of that root");

    const foreign = await tmp("rebuild-local-foreign-");
    await mkdir(path.join(foreign, "data/site-presets"), { recursive: true });
    const refused = await linkCheckoutInto(repoRoot, foreign).then(() => "linked", (error: unknown) => (error as Error).message);
    assert(refused.includes("data/site-presets") && refused.includes("not this checkout"), `a foreign data/site-presets: ${refused}`);
  });
  console.log(`\nresults ${JSON.stringify(results)}`);
} finally {
  for (const dir of tmpDirs) await rm(dir, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed.length} checks passed`);
if (failed.length > 0) {
  console.log(`FAILED:\n  ${failed.join("\n  ")}`);
  process.exit(1);
}