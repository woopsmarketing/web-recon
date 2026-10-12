/**
 * The routing pointer BoostChat writes — `tsx --tsconfig platform/tsconfig.json platform/test/boostchat-pointer.test.ts`
 *
 * `fixtures/boostchat-written-pointer.json` is a byte copy of boost-chat `scripts/fixtures/site-shell/boostchat-written-pointer.json`,
 * the pointer shape BoostChat's activation writes (CONTRACTS §6.1). Two readers on this side must accept it, or a site
 * BoostChat activates would not be served / could not be published to again:
 *
 *   - the publisher's RoutingPointerSchema (platform/publish/publish.ts, zod): what `site:publish` and the rollback read
 *   - the Worker's own pointer parser (workers/recon-runtime/src/index.ts `parsePointer`, not exported): exercised through
 *     the Worker's `handle()` over a fake bucket — a pointer it accepts answers the package's index.html, one it does not
 *     answers `500 routing misconfigured` (outcome `pointer-invalid`)
 *
 * No network, no filesystem outside the fixture, no wrangler.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { RoutingPointerSchema } from "../publish/publish";
import { handle, newTrace, type Env, type R2BucketLike, type R2ObjectBodyLike } from "../../workers/recon-runtime/src/index";
import { packageKey, routingKey } from "../../workers/recon-runtime/src/contract";

const repoRoot = process.cwd();
const FIXTURE = "platform/test/fixtures/boostchat-written-pointer.json";

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

const raw = await readFile(path.join(repoRoot, FIXTURE), "utf8");
const pointer = JSON.parse(raw) as Record<string, any>;

/** a bucket holding the pointer (as given) and a tiny package for the site it names */
function bucketWith(pointerText: string, host: string, siteId: string, packageHash: string): { env: Env; reads: string[] } {
  const objects = new Map<string, string>([
    [routingKey(host), pointerText],
    [packageKey(siteId, packageHash, "index.html"), "<!doctype html><title>package</title>"],
    [packageKey(siteId, packageHash, "404.html"), "<!doctype html><title>not found</title>"],
  ]);
  const reads: string[] = [];
  const body = (key: string): R2ObjectBodyLike | null => {
    const text = objects.get(key);
    if (text === undefined) return null;
    const bytes = new TextEncoder().encode(text);
    return {
      size: bytes.length,
      httpEtag: `"${key.length}-${bytes.length}"`,
      httpMetadata: { contentType: key.endsWith(".json") ? "application/json" : "text/html; charset=utf-8" },
      body: new Response(bytes).body!,
      text: async () => text,
    };
  };
  const SITES: R2BucketLike = {
    get: async (key) => {
      reads.push(key);
      return body(key);
    },
    head: async (key) => body(key),
  };
  return { env: { SITES }, reads };
}

console.log("BoostChat-written routing pointer");
await check("P1 the fixture is the pointer BoostChat writes: schemaVersion 1, hostname, siteId, packageHash, buildInputId, releaseId, publishedAt and the previous package", () => {
  eq(Object.keys(pointer).sort(), ["buildInputId", "hostname", "packageHash", "previous", "publishedAt", "releaseId", "schemaVersion", "siteId"], "keys");
  eq(Object.keys(pointer.previous).sort(), ["buildInputId", "packageHash", "publishedAt", "releaseId", "siteId"], "previous keys");
});
await check("P2 the publisher's RoutingPointerSchema accepts it, and keeps every field (including `previous`)", () => {
  const parsed = RoutingPointerSchema.safeParse(pointer);
  assert(parsed.success, `refused: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`);
  eq(parsed.data, pointer, "parsed = fixture");
  // the schema is not vacuous: it refuses what the Worker would not serve either
  assert(!RoutingPointerSchema.safeParse({ ...pointer, schemaVersion: 2 }).success, "schemaVersion 2");
  assert(!RoutingPointerSchema.safeParse({ ...pointer, packageHash: "xyz" }).success, "bad hash");
  assert(!RoutingPointerSchema.safeParse({ ...pointer, hostname: "Not A Host" }).success, "bad hostname");
});
await check("P3 the Worker's pointer parser accepts it: GET / on the pointer's hostname is answered with the pointed package's index.html (trace: served, siteId and packageHash of the pointer)", async () => {
  const { env, reads } = bucketWith(raw, pointer.hostname, pointer.siteId, pointer.packageHash);
  const request = new Request(`https://${pointer.hostname}/`, { headers: { host: pointer.hostname } });
  const trace = newTrace(request);
  const response = await handle(request, env, trace);
  eq([response.status, await response.text()], [200, "<!doctype html><title>package</title>"], "response");
  eq([trace.outcome, trace.host, trace.siteId, trace.packageHash], ["served", pointer.hostname, pointer.siteId, pointer.packageHash], "trace");
  assert(reads.includes(packageKey(pointer.siteId, pointer.packageHash, "index.html")), "the package of the pointer was read");
  assert(!reads.some((k) => k.includes(pointer.previous.packageHash)), "the previous package was not read");
});
await check("P4 the Worker's parser is not vacuous either: the same pointer with schemaVersion 2, another hostname or a malformed packageHash is `pointer-invalid` (500), never served", async () => {
  for (const [label, edited] of [["schemaVersion", { ...pointer, schemaVersion: 2 }], ["hostname", { ...pointer, hostname: "other.example.test" }], ["packageHash", { ...pointer, packageHash: "5555" }]] as const) {
    const { env } = bucketWith(JSON.stringify(edited), pointer.hostname, pointer.siteId, pointer.packageHash);
    const request = new Request(`https://${pointer.hostname}/`, { headers: { host: pointer.hostname } });
    const trace = newTrace(request);
    const response = await handle(request, env, trace);
    eq([label, response.status, trace.outcome], [label, 500, "pointer-invalid"], "refused");
  }
});

console.log(`\n${passed}/${passed + failed.length} checks passed`);
if (failed.length > 0) {
  console.log(`FAILED:\n  ${failed.join("\n  ")}`);
  process.exit(1);
}
