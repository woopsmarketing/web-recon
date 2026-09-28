// Read-only R2 listing of boost-sites-artifacts via the Cloudflare API, using wrangler's OAuth token
// from its config file. The token is never printed or written. Output: { key: {etag,size} } JSON.
//   tsx r2-list.mts <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";

const ACCOUNT = "61b550e89f7c0046f0d076b8d2fb7c53";
const BUCKET = "boost-sites-artifacts";
const toml = readFileSync(`${os.homedir()}/Library/Preferences/.wrangler/config/default.toml`, "utf8");
const token = /oauth_token\s*=\s*"([^"]+)"/.exec(toml)?.[1];
if (!token) throw new Error("no oauth_token in wrangler config (run any wrangler command to refresh)");
const out: Record<string, { etag: string; size: number }> = {};
let cursor: string | undefined;
do {
  const u = new URL(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects`);
  u.searchParams.set("per_page", "1000");
  if (cursor) u.searchParams.set("cursor", cursor);
  const r = await fetch(u, { headers: { authorization: `Bearer ${token}` } });
  const j = (await r.json()) as any;
  if (!j.success) throw new Error(`list failed: ${r.status} ${JSON.stringify(j.errors)}`);
  for (const o of j.result) out[o.key] = { etag: o.etag, size: o.size };
  cursor = j.result_info?.is_truncated ? j.result_info.cursor : undefined;
} while (cursor);
writeFileSync(process.argv[2]!, JSON.stringify(out, null, 1));
const keys = Object.keys(out);
const prefixes = [...new Set(keys.map((k) => k.split("/").slice(0, k.startsWith("sites/") ? 4 : 1).join("/")))].sort();
console.log(JSON.stringify({ objects: keys.length, routing: keys.filter((k) => k.startsWith("routing/")), prefixes: prefixes.map((p) => `${p} ${keys.filter((k) => k.startsWith(p + "/") || k === p).length}`) }, null, 1));
