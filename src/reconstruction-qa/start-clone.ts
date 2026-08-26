import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { stat } from "node:fs/promises";
import path from "node:path";
import { QaInfrastructureError } from "./types.js";

/**
 * Serving the clone (items 7, 152).
 *
 * The clone is a real Next.js app, so QA measures it the way anybody else would:
 * `next build` (once, if it has not been built) then `next start` on an
 * ephemeral port, and every capture is an ordinary HTTP request to localhost.
 * Nothing renders the runtime tree in-process — a hand-rolled renderer would be
 * a second implementation of the thing under test.
 *
 * The port is chosen by binding port 0 and reading back what the OS assigned, so
 * two QA runs (or a QA run and a smoke test) never collide on a fixed number.
 */

const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 250;
const BUILD_TIMEOUT_MS = 600_000;
const STOP_GRACE_MS = 5_000;

/** Ask the OS for a free TCP port. */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("could not determine a free port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function hasNextBuild(appDir: string): Promise<boolean> {
  try {
    const info = await stat(path.join(appDir, ".next", "BUILD_ID"));
    return info.isFile();
  } catch {
    return false;
  }
}

function runToCompletion(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  onLog?: (line: string) => void,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      output += text;
      if (output.length > 200_000) output = output.slice(-200_000);
      if (onLog) for (const line of text.split("\n")) if (line.trim()) onLog(line.trimEnd());
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new QaInfrastructureError(`${command} ${args.join(" ")} timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output });
    });
  });
}

/** Run `next build` in a generated app. Throws with the tail of the output. */
export async function buildClone(
  appDir: string,
  onLog?: (line: string) => void,
): Promise<number> {
  const startedAt = Date.now();
  const { code, output } = await runToCompletion(
    "npx",
    ["--no-install", "next", "build"],
    appDir,
    BUILD_TIMEOUT_MS,
    onLog,
  );
  if (code !== 0) {
    throw new QaInfrastructureError(
      `next build failed in ${appDir} (exit ${code}):\n${output.slice(-2000)}`,
    );
  }
  return Date.now() - startedAt;
}

export interface RunningClone {
  baseUrl: string;
  port: number;
  appDir: string;
  /** Milliseconds spent in `next build`, 0 when the app was already built. */
  buildMs: number;
  stop: () => Promise<void>;
}

export interface StartCloneOptions {
  appDir: string;
  /** Build even when a `.next/BUILD_ID` already exists. */
  forceBuild?: boolean;
  onLog?: (line: string) => void;
}

/** Build (if needed) and start the clone; resolve once it answers HTTP. */
export async function startClone(
  options: StartCloneOptions,
): Promise<RunningClone> {
  const { appDir } = options;
  const log = options.onLog ?? (() => {});

  let buildMs = 0;
  if (options.forceBuild || !(await hasNextBuild(appDir))) {
    log(`[qa] next build (${appDir})`);
    buildMs = await buildClone(appDir, (line) => log(`  next build | ${line}`));
  }

  const port = await findFreePort();
  const child: ChildProcess = spawn(
    "npx",
    ["--no-install", "next", "start", "-p", String(port)],
    {
      cwd: appDir,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  const capture = (chunk: Buffer): void => {
    serverOutput += chunk.toString("utf8");
    if (serverOutput.length > 100_000) serverOutput = serverOutput.slice(-100_000);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    if (exited) break;
    try {
      // A 404 is a perfectly good readiness signal: the server answered.
      const response = await fetch(`${baseUrl}/__wr_qa_probe__`, {
        method: "GET",
        signal: AbortSignal.timeout(4_000),
      });
      await response.arrayBuffer();
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
  }
  if (!ready) {
    child.kill("SIGKILL");
    throw new QaInfrastructureError(
      `the clone at ${appDir} did not answer on ${baseUrl} within ${READY_TIMEOUT_MS} ms` +
        (serverOutput ? `:\n${serverOutput.slice(-2000)}` : ""),
    );
  }
  log(`[qa] clone serving on ${baseUrl}`);

  const stop = async (): Promise<void> => {
    if (exited) return;
    child.kill("SIGTERM");
    const graceDeadline = Date.now() + STOP_GRACE_MS;
    while (!exited && Date.now() < graceDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!exited) child.kill("SIGKILL");
  };

  return { baseUrl, port, appDir, buildMs, stop };
}
