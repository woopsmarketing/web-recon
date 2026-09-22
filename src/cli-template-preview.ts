import path from "node:path";
import { readFile, stat } from "node:fs/promises";

import { buildApp, startApp } from "./recon-template/parity-qa.js";

/**
 * web-recon Slotized Template — preview CLI (Task 29 Phase D).
 *
 *   pnpm template:preview <rendered run manifest.json | rendered app dir>
 *                         [--port N] [--no-build] [--force-build]
 *
 * A rendered run directory IS the Next app (`render:template` copies the whole
 * reconstruction app and rewrites `reconstruction-data/` in place), so the
 * preview is just `next build` + `next start` on it via the parity-QA helpers
 * that every other serving path in this repo already uses. It prints the route
 * list from `reconstruction-data/route-map.json` and stays up until Ctrl-C.
 *
 * `--no-build` assumes a `.next` is already there; without `--force-build` an
 * existing build is reused.
 */

interface RouteMapEntry {
  route: string;
  pageFile?: string;
  title?: string;
  breakpoint?: number;
}

interface ParsedArgs {
  target?: string;
  port?: string;
  noBuild?: boolean;
  forceBuild?: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--no-build") {
      args.noBuild = true;
      continue;
    }
    if (arg === "--force-build") {
      args.forceBuild = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      if (args.target !== undefined) throw new Error(`Unexpected argument: ${arg}`);
      args.target = arg;
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    if (name !== "--port") throw new Error(`Unknown option: ${arg}`);
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (!value) throw new Error("--port requires a value");
    args.port = value;
  }
  return args;
}

async function resolveAppDir(target: string): Promise<string> {
  const resolved = path.resolve(target);
  const info = await stat(resolved).catch(() => undefined);
  if (!info) throw new Error(`no such path: ${resolved}`);
  const dir = info.isDirectory() ? resolved : path.dirname(resolved);
  const pkg = await stat(path.join(dir, "package.json")).catch(() => undefined);
  if (!pkg) throw new Error(`${dir} does not look like a rendered app (no package.json)`);
  return dir;
}

async function readRoutes(appDir: string): Promise<RouteMapEntry[]> {
  try {
    const raw = await readFile(path.join(appDir, "reconstruction-data", "route-map.json"), "utf8");
    const parsed = JSON.parse(raw) as { routes?: RouteMapEntry[] };
    return parsed.routes ?? [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.log("Usage: pnpm template:preview <rendered manifest.json | app dir> [--port N] [--no-build] [--force-build]");
    process.exitCode = 1;
    return;
  }
  const appDir = await resolveAppDir(args.target);
  console.log(`[preview] app ${appDir}`);

  if (!args.noBuild) {
    const ms = await buildApp(appDir, args.forceBuild === true, (line) => console.log(line));
    console.log(ms === 0 ? "[preview] reused existing .next build" : `[preview] next build ${(ms / 1000).toFixed(1)}s`);
  }

  // parity-qa's `startApp` picks a free port itself (it probes the app before
  // returning), so `--port` is a preference the helper may override — the URL
  // printed below is always the real one.
  const app = await startApp(appDir, args.port === undefined ? {} : { PORT: args.port });
  if (args.port !== undefined && !app.baseUrl.endsWith(`:${args.port}`)) {
    console.log(`[preview] note: port ${args.port} was not free / not honored by the runner`);
  }
  const routes = await readRoutes(appDir);
  console.log(`[preview] serving ${app.baseUrl} (${routes.length} route(s))`);
  for (const route of routes) {
    console.log(`[preview]   ${app.baseUrl}${route.route}${route.title ? `  — ${route.title}` : ""}`);
  }
  console.log("[preview] Ctrl-C to stop");

  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    console.log("\n[preview] stopping…");
    void app.stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Hold the process open; `startApp`'s child does not keep the loop alive.
  await new Promise<void>(() => {});
}

main().catch((error: unknown) => {
  console.error(`[preview] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
