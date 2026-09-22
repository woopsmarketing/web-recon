import { execFileSync } from "node:child_process";
import { hashJson } from "../util/hash";
import type { BuildMode } from "../site/instance";

/**
 * buildInputId = sha256(releaseHash, siteSnapshotHash, mode, toolchainHash).
 * Same inputs → same id → no rebuild. A git SHA is deliberately not an input.
 */
export interface BuildInputParts {
  releaseHash: string;
  siteSnapshotHash: string;
  mode: BuildMode;
  toolchainHash: string;
}

export function computeBuildInputId(parts: BuildInputParts): string {
  return hashJson({
    releaseHash: parts.releaseHash,
    siteSnapshotHash: parts.siteSnapshotHash,
    mode: parts.mode,
    toolchainHash: parts.toolchainHash,
  });
}

export interface Toolchain {
  node: string;
  pnpm: string;
  platform: string;
  arch: string;
}

let cachedToolchain: Toolchain | undefined;
export function currentToolchain(): Toolchain {
  if (!cachedToolchain) {
    const pnpm = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
    cachedToolchain = { node: process.version, pnpm, platform: process.platform, arch: process.arch };
  }
  return cachedToolchain;
}

export function toolchainHash(tc: Toolchain): string {
  return hashJson(tc);
}
