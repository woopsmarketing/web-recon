/**
 * ObjectStore backed by the wrangler CLI (`wrangler r2 object put|get <bucket>/<key>`).
 *
 *  - local:  `--local --persist-to <dir>` → the same miniflare state `wrangler dev --persist-to <dir>`
 *            serves, so a local publish is exactly what the local runtime reads
 *  - remote: `--remote` → the real bucket. Implemented for the future live run; refused unless the
 *            caller passes allowRemote (the CLI additionally requires RECON_PUBLISH_ALLOW_REMOTE=1)
 *
 * Arguments are passed as an argv array (no shell), so keys containing "$" are safe. Bodies go
 * through a private temp file (put) and stdout (get --pipe). "The specified key does not exist"
 * is the only error mapped to null; every other failure throws.
 * Local mode is serial (see maxConcurrency).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ObjectMeta, ObjectStore } from "./store";

export interface WranglerStoreOptions {
  repoRoot: string;
  bucket: string;
  mode: "local" | "remote";
  /** required for local mode */
  persistTo?: string;
  allowRemote?: boolean;
  /** put() throws before spawning anything (dry-run --check-store) */
  readOnly?: boolean;
  timeoutMs?: number;
}

export class WranglerStore implements ObjectStore {
  readonly description: string;
  /**
   * Local: 1 — each `wrangler r2 object` call boots its own miniflare over the same SQLite
   * state, and parallel instances fail with "put: Unspecified error (0)" (observed).
   */
  readonly maxConcurrency: number | undefined;
  private readonly bin: string;
  private tmpDir?: Promise<string>;
  private seq = 0;

  constructor(private readonly opts: WranglerStoreOptions) {
    if (opts.mode === "remote" && !opts.allowRemote) throw new Error("WranglerStore: remote mode requires allowRemote");
    if (opts.mode === "local" && !opts.persistTo) throw new Error("WranglerStore: local mode requires persistTo");
    this.maxConcurrency = opts.mode === "local" ? 1 : undefined;
    this.bin = path.join(opts.repoRoot, "node_modules/.bin/wrangler");
    this.description = `${opts.mode === "local" ? `wrangler --local ${opts.bucket} (persist ${opts.persistTo})` : `wrangler --remote ${opts.bucket}`}${opts.readOnly ? " [read-only]" : ""}`;
  }

  private target(): string[] {
    return this.opts.mode === "local" ? ["--local", "--persist-to", path.resolve(this.opts.repoRoot, this.opts.persistTo!)] : ["--remote"];
  }

  private run(args: string[]): Promise<{ code: number; stdout: Buffer; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, {
        cwd: this.opts.repoRoot,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1", FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const out: Buffer[] = [];
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => out.push(d));
      child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-20_000)));
      const timer = setTimeout(() => child.kill("SIGKILL"), this.opts.timeoutMs ?? 120_000);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr });
      });
    });
  }

  async put(key: string, body: Uint8Array, meta: ObjectMeta): Promise<void> {
    if (this.opts.readOnly) throw new Error(`WranglerStore is read-only; refused put ${key}`);
    this.tmpDir ??= mkdtemp(path.join(os.tmpdir(), "recon-publish-"));
    const file = path.join(await this.tmpDir, `obj-${this.seq++}`);
    await writeFile(file, body);
    try {
      const r = await this.run([
        "r2", "object", "put", `${this.opts.bucket}/${key}`,
        "--file", file,
        "--content-type", meta.contentType,
        "--cache-control", meta.cacheControl,
        ...this.target(),
      ]);
      if (r.code !== 0) throw new Error(`wrangler put ${key} exited ${r.code}: ${r.stderr.trim().slice(-500)}`);
    } finally {
      await rm(file, { force: true });
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    // A read-only look at local state that does not exist yet must not create it (wrangler would).
    if (this.opts.readOnly && this.opts.mode === "local" && !existsSync(path.resolve(this.opts.repoRoot, this.opts.persistTo!))) return null;
    const r = await this.run(["r2", "object", "get", `${this.opts.bucket}/${key}`, "--pipe", ...this.target()]);
    if (r.code === 0) return new Uint8Array(r.stdout);
    if (/specified key does not exist/i.test(r.stderr)) return null;
    throw new Error(`wrangler get ${key} exited ${r.code}: ${r.stderr.trim().slice(-500)}`);
  }

  async close(): Promise<void> {
    if (this.tmpDir) await rm(await this.tmpDir, { recursive: true, force: true });
  }
}
