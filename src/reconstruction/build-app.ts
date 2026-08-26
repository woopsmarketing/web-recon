import { spawn } from "node:child_process";

/**
 * Run `next build` on a generated app.
 *
 * Extracted from the CLI in Task 16 so the standalone `pnpm reconstruct` and the
 * E2E orchestrator run the SAME build, with the same working directory, the same
 * telemetry setting and the same "an exit code is a result, not an exception"
 * contract. Two copies of this would eventually disagree about one flag, and the
 * disagreement would show up as a build that passes in one path and fails in the
 * other.
 *
 * `--no-install` is deliberate: the generated app is built against the repo's
 * own `next` binary, so a build must never reach the network to fetch one.
 */
export interface NextBuildResult {
  exitCode: number;
  elapsedMs: number;
  /** Captured only when `captureOutput` is set; otherwise inherited to stdio. */
  output?: string;
}

export interface RunNextBuildOptions {
  /** Collect stdout/stderr instead of streaming it (the E2E runner wants this). */
  captureOutput?: boolean;
  /** Trailing characters of captured output kept for an error message. */
  maxOutputChars?: number;
}

const DEFAULT_MAX_OUTPUT_CHARS = 4000;

export function runNextBuild(
  appDir: string,
  options: RunNextBuildOptions = {},
): Promise<NextBuildResult> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--no-install", "next", "build"], {
      cwd: appDir,
      stdio: options.captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    });
    let output = "";
    const max = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    const append = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      // Keep the TAIL: a Next.js failure prints its reason last, and an
      // unbounded buffer on a build that loops would be its own problem.
      if (output.length > max) output = output.slice(output.length - max);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        elapsedMs: Date.now() - startedAt,
        ...(options.captureOutput ? { output } : {}),
      });
    });
  });
}
