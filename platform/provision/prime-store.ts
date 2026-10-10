/**
 * tsx --tsconfig platform/tsconfig.json platform/provision/prime-store.ts
 *
 * Fills the pnpm store with what `site:build` installs OFFLINE — for a machine that has never built
 * a site (a CI runner). Takes no argument and reads no variable of its own.
 *
 * Why it is needed: site:build installs each release workspace with
 *     pnpm install --offline --frozen-lockfile --ignore-scripts
 * from the release's OWN scoped lockfile (data/template-releases/<template>/<release>/files/
 * pnpm-lock.yaml), with an allowlisted environment (PATH = node's directory + the system's, HOME).
 * The repository's root `pnpm install` fills the store from the ROOT lockfile, and the two are not
 * the same set: the scoped lockfile of interior-02-1.1.0 pins baseline-browser-mapping@2.11.21 and
 * caniuse-lite@1.0.30001810, which the root lockfile does not hold. On a developer machine the store
 * already has them from earlier installs; on a fresh runner the offline install fails.
 *
 * What it does, for every release a site starter lists (the only releases a site can be provisioned
 * with): copy the release's package.json + pnpm-lock.yaml into a scratch directory, `pnpm fetch`
 * (lockfile → store, online), then run the builder's exact offline install there. Both commands run
 * with the builder's environment, so they prove the two things the build depends on: `pnpm` is
 * found on that PATH, and it resolves the same store. A failure here is a failure before any job is
 * claimed, with the reason.
 *
 * Exit: 0 primed and proven · 1 a fetch or the offline proof failed · 2 no starter / no release.
 */
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadRelease, releaseDir } from "../release/release";
import { listStarters } from "./starter";

/** The builder's environment (platform/build/site-build.ts buildEnv) — kept identical on purpose. */
function builderEnv(): NodeJS.ProcessEnv {
  const nodeBin = path.dirname(process.execPath);
  return { PATH: [nodeBin, "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"), HOME: os.homedir(), TMPDIR: os.tmpdir(), LANG: "C.UTF-8", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", CI: "1" };
}

function run(args: string[], cwd: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd, env: builderEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const cap = (d: Buffer) => (output = (output + d.toString()).slice(-8000));
    child.stdout.on("data", cap);
    child.stderr.on("data", cap);
    const timer = setTimeout(() => child.kill("SIGKILL"), 600_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`pnpm could not be started with the builder's PATH (${builderEnv().PATH}): ${error.message} — install pnpm next to node`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

const repoRoot = process.cwd();
const starters = await listStarters(repoRoot);
const releases = starters.flatMap((s) => s.releaseIds.map((releaseId) => ({ templateId: s.templateId, releaseId })));
if (releases.length === 0) {
  console.error("prime-store: no site starter in data/site-starters — nothing can be provisioned from this checkout");
  process.exit(2);
}

try {
  const version = await run(["--version"], repoRoot);
  const store = await run(["store", "path"], repoRoot);
  if (version.code !== 0 || store.code !== 0) throw new Error(`pnpm does not run with the builder's environment: ${(version.output + store.output).trim().slice(-500)}`);
  console.log(`prime-store: pnpm ${version.output.trim()} · store ${store.output.trim()} (as the site builder sees them)`);

  for (const { templateId, releaseId } of releases) {
    const release = await loadRelease(repoRoot, templateId, releaseId).catch(() => undefined);
    if (!release) {
      console.error(`prime-store: starter ${templateId} lists ${releaseId}, which is not in data/template-releases`);
      process.exit(2);
    }
    const files = path.join(releaseDir(repoRoot, templateId, releaseId), "files");
    const scratch = await mkdtemp(path.join(os.tmpdir(), "recon-prime-store-"));
    try {
      for (const name of ["package.json", "pnpm-lock.yaml"]) await copyFile(path.join(files, name), path.join(scratch, name));
      const started = Date.now();
      const fetched = await run(["fetch", "--reporter=silent"], scratch);
      if (fetched.code !== 0) throw new Error(`pnpm fetch for ${releaseId} exited ${fetched.code}: ${fetched.output.trim().slice(-1500)}`);
      await rm(path.join(scratch, "node_modules"), { recursive: true, force: true });
      // the builder's own command: if this passes here, it passes in the build workspace
      const proof = await run(["install", "--offline", "--frozen-lockfile", "--ignore-scripts", "--reporter=silent"], scratch);
      if (proof.code !== 0) throw new Error(`the offline install of ${releaseId} still fails after the fetch (exit ${proof.code}): ${proof.output.trim().slice(-1500)}`);
      console.log(`prime-store: ${releaseId} fetched and installed offline (${Math.round((Date.now() - started) / 1000)} s)`);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
} catch (error) {
  console.error(`prime-store FAILED: ${(error as Error).message}`);
  process.exit(1);
}
