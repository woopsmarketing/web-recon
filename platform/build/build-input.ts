import { execFileSync } from "node:child_process";
import { hashJson } from "../util/hash";
import type { BuildMode } from "../site/instance";

/**
 * buildInputId = sha256(releaseHash, siteSnapshotHash, mode, toolchainHash[, integrationInputHash]).
 * Same inputs → same id → no rebuild. A git SHA is deliberately not an input.
 *
 * integrationInputHash is present ONLY for a build that emits integration documents (public mode,
 * site opted in — platform/integration/config): it hashes the site's integration document and the
 * producer/contract versions. A build that emits nothing has exactly the identity it had before
 * the integration existed (its package is byte-identical), and an ON package can never share an
 * identity with an OFF package or with a package of an older emitter (06 A5).
 */
export interface BuildInputParts {
  releaseHash: string;
  siteSnapshotHash: string;
  mode: BuildMode;
  toolchainHash: string;
  integrationInputHash?: string;
}

export function computeBuildInputId(parts: BuildInputParts): string {
  return hashJson({
    releaseHash: parts.releaseHash,
    siteSnapshotHash: parts.siteSnapshotHash,
    mode: parts.mode,
    toolchainHash: parts.toolchainHash,
    // undefined is dropped by the canonical serialiser: no key, no change for non-emitting builds
    integrationInputHash: parts.integrationInputHash,
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
