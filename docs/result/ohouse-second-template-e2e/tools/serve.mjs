// Local preview helper kept with this report (not platform code). Serves the CURRENT Site Build Package of one site on
// 127.0.0.1 with the same URL rules as the runtime Worker (workers/recon-runtime/src/paths.ts):
//   /  -> index.html ; extensionless /a/b -> a/b.html ; files with an extension as-is ;
//   spelled-out *.html, trailing slash, /404, /_not-found, /_package.json -> 404.html (status 404).
// current.json is re-read on every request, so a new site:build is picked up without a restart.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const [, , repoRoot, siteId, portArg] = process.argv;
const port = Number(portArg ?? 4321);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2" };

function siteRoot() {
  const current = JSON.parse(readFileSync(path.join(repoRoot, "data/site-builds", siteId, "current.json"), "utf8"));
  return path.join(repoRoot, current.packageDir, "site");
}
function resolveKey(pathname) {
  let p;
  try {
    p = pathname.split("/").map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return null;
  }
  if (p === "/") return "index.html";
  if (p.endsWith("/") || p.includes("..") || p.includes("\\")) return null;
  const rel = p.slice(1);
  const ext = path.posix.extname(rel);
  if (ext === ".html" || rel === "_package.json") return null;
  if (!ext) return /(^|\/)(404|_not-found|index)$/.test(rel) ? null : `${rel}.html`;
  return rel;
}
createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let root;
  try {
    root = siteRoot();
  } catch (e) {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    res.end(`no current package for ${siteId}: ${e.message}`);
    return;
  }
  const key = resolveKey(url.pathname);
  const file = key ? path.join(root, key) : null;
  const ok = file && file.startsWith(root) && existsSync(file) && statSync(file).isFile();
  const target = ok ? file : path.join(root, "404.html");
  const status = ok ? 200 : 404;
  try {
    const body = readFileSync(target);
    res.writeHead(status, { "content-type": TYPES[path.extname(target)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${siteId} current package on http://127.0.0.1:${port}/`));
