import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_FETCH_POLICY,
  extensionForMime,
  mapWithConcurrency,
  safeFetchAsset,
  type SafeFetchPolicy,
} from "../assets/safe-fetch.js";
import type { ResourceOrigin, ResourceRecord } from "./types.js";

/**
 * Resource materialization for the Preservation Clone.
 *
 * This does NOT introduce a second downloader: every byte still comes through
 * `safeFetchAsset`, the repository's SSRF-hardened fetcher (DNS pre-validation
 * against private ranges, pinned-lookup sockets, manual redirect re-validation,
 * streamed byte cap). What is new here is only the POLICY around it, because
 * the Task 22 materialization run is built for brand-independent production
 * output — it refuses to self-host fonts pending licence review and rewrites
 * assets it classifies as replacement-required. A Preservation Clone wants the
 * opposite: a faithful local copy of what the source actually served, fonts
 * very much included, since fonts change line breaking and therefore layout.
 *
 * Storage is content-addressed (`assets/<sha256>.<ext>`), so identical bytes
 * reached through different URLs or different viewports are stored once, and
 * the same URL returning different bytes yields two files rather than one
 * silently overwriting the other.
 */

export interface ResourcePolicy {
  allowedHosts: Set<string>;
  maxAssetBytes: number;
  maxMediaBytes: number;
  timeoutMs: number;
  concurrency: number;
  spacingMs: number;
  /** TEST-ONLY passthroughs, mirroring SafeFetchPolicy. */
  allowPrivateHostPorts?: Set<string>;
  lookup?: SafeFetchPolicy["lookup"];
  allowedPorts?: number[];
  userAgent?: string;
}

export const DEFAULT_RESOURCE_POLICY = {
  maxAssetBytes: 30 * 1024 * 1024,
  /**
   * Media gets its own, much smaller cap. The Apartmentary homepage alone
   * carries a ~98 MB hero MP4; letting one file dominate the artifact serves
   * nobody, and leaving it as a recorded residual still lets a human see the
   * real video during visual review.
   */
  maxMediaBytes: 8 * 1024 * 1024,
  timeoutMs: 20_000,
  concurrency: 6,
  spacingMs: 0,
} as const;

export interface ResourceCandidate {
  url: string;
  origin: ResourceOrigin;
  kinds: Set<string>;
  dependencyClass: string;
  usedBy: Set<string>;
  /**
   * Content-Length observed during capture, when Phase 1 recorded one. Used to
   * skip an over-budget resource without spending a request on it.
   *
   * There is no "reuse captured bytes" path here on purpose: Phase 1 inventories
   * assets but never downloads them, so every asset byte in a clone is fetched
   * by this module. Script bytes ARE captured by Phase 1, and the builder copies
   * those directly rather than routing them through the fetcher.
   */
  knownBytes: number | null;
}

const MEDIA_KINDS = new Set([
  "video",
  "video-source",
  "audio",
  "audio-source",
]);

const IMAGE_KINDS = new Set([
  "image",
  "srcset-candidate",
  "picture-source",
  "background-image",
  "mask-image",
  "svg-external",
  "svg-use",
  "video-poster",
]);

const FONT_KINDS = new Set(["font-face", "font-loaded"]);

function expectedKindFor(kinds: Set<string>): SafeFetchPolicy["expectedKind"] {
  for (const kind of kinds) {
    if (MEDIA_KINDS.has(kind)) return kind.startsWith("audio") ? "audio" : "video";
  }
  for (const kind of kinds) if (FONT_KINDS.has(kind)) return "font";
  for (const kind of kinds) if (IMAGE_KINDS.has(kind)) return "image";
  return "any";
}

function isMedia(kinds: Set<string>): boolean {
  for (const kind of kinds) if (MEDIA_KINDS.has(kind)) return true;
  return false;
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export interface MaterializeResult {
  records: ResourceRecord[];
  /** source URL -> clone-root-relative path, for the rewrite stage. */
  localByUrl: Map<string, string>;
  byHash: Record<string, string>;
  dedupedByHash: number;
}

/**
 * Fetch every candidate once and write it under `assetsDir`.
 *
 * Failures are first-class results, never exceptions: a resource that could not
 * be localized simply gets no `localPath`, which downstream becomes a residual
 * dependency the human is told about.
 */
export async function materializeResources(
  candidates: ResourceCandidate[],
  assetsDir: string,
  assetsRelative: string,
  policy: ResourcePolicy,
): Promise<MaterializeResult> {
  await fs.mkdir(assetsDir, { recursive: true });

  const byHash: Record<string, string> = {};
  const localByUrl = new Map<string, string>();
  let dedupedByHash = 0;

  const write = async (
    buffer: Buffer,
    mime: string | null,
    url: string,
  ): Promise<{ hash: string; relative: string }> => {
    const hash = sha256(buffer);
    const ext = extensionForMime(mime ?? "", url);
    const relative = `${assetsRelative}/${hash}.${ext}`;
    if (byHash[hash]) {
      dedupedByHash += 1;
      return { hash, relative: byHash[hash] };
    }
    await fs.writeFile(path.join(assetsDir, `${hash}.${ext}`), buffer);
    byHash[hash] = relative;
    return { hash, relative };
  };

  const results = await mapWithConcurrency(
    candidates,
    policy.concurrency,
    policy.spacingMs,
    async (candidate): Promise<ResourceRecord> => {
      const host = hostOf(candidate.url);
      const base: ResourceRecord = {
        sourceUrl: candidate.url,
        host,
        origin: candidate.origin,
        kinds: [...candidate.kinds].sort(),
        dependencyClass: candidate.dependencyClass,
        status: "skipped-non-http",
        httpStatus: null,
        mime: null,
        bytes: null,
        sha256: null,
        localPath: null,
        redirectChain: [],
        detail: null,
        usedBy: [...candidate.usedBy].sort(),
        shared: candidate.usedBy.size > 1,
      };

      if (!/^https?:$/i.test(schemeOf(candidate.url))) return base;

      if (candidate.dependencyClass === "ANALYTICS") {
        return { ...base, status: "skipped-analytics", detail: "tracker not localized" };
      }
      if (candidate.dependencyClass === "EMBED") {
        return { ...base, status: "skipped-embed", detail: "third-party embed runtime" };
      }

      const media = isMedia(candidate.kinds);
      const maxBytes = media ? policy.maxMediaBytes : policy.maxAssetBytes;
      if (candidate.knownBytes !== null && candidate.knownBytes > maxBytes) {
        return {
          ...base,
          status: "skipped-over-budget",
          bytes: candidate.knownBytes,
          detail: `captured Content-Length ${candidate.knownBytes} > cap ${maxBytes}`,
        };
      }

      const fetchPolicy = (kind: SafeFetchPolicy["expectedKind"]): SafeFetchPolicy => ({
        timeoutMs: policy.timeoutMs,
        maxBytes,
        maxRedirects: DEFAULT_FETCH_POLICY.maxRedirects,
        allowedHosts: policy.allowedHosts,
        expectedKind: kind,
        allowedPorts: policy.allowedPorts ?? [...DEFAULT_FETCH_POLICY.allowedPorts],
        allowPrivateHostPorts: policy.allowPrivateHostPorts,
        lookup: policy.lookup,
        userAgent: policy.userAgent,
      });

      const wanted = expectedKindFor(candidate.kinds);
      let result = await safeFetchAsset(candidate.url, fetchPolicy(wanted));
      let relaxed: string | null = null;
      if (result.status === "mime-rejected" && wanted !== "any") {
        // The source served this resource; refusing it over a Content-Type
        // quibble would lose real bytes. Retry once, and say so in the record.
        relaxed = `mime-relaxed from "${wanted}": ${result.detail ?? "unknown"}`;
        result = await safeFetchAsset(candidate.url, fetchPolicy("any"));
      }

      if (result.status !== "fetched" || !result.body) {
        return {
          ...base,
          status: result.status === "too-large" ? "skipped-over-budget" : result.status,
          httpStatus: result.httpStatus,
          mime: result.mime,
          bytes: result.bytes,
          redirectChain: result.redirectChain,
          detail: [relaxed, result.detail].filter(Boolean).join("; ") || null,
        };
      }

      const { hash, relative } = await write(result.body, result.mime, candidate.url);
      localByUrl.set(candidate.url, relative);
      return {
        ...base,
        status: "fetched",
        httpStatus: result.httpStatus,
        mime: result.mime,
        bytes: result.body.byteLength,
        sha256: hash,
        localPath: relative,
        redirectChain: result.redirectChain,
        detail: relaxed,
      };
    },
  );

  results.sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
  return { records: results, localByUrl, byHash, dedupedByHash };
}

/**
 * Hostname WITHOUT the port.
 *
 * `SafeFetchPolicy.allowedHosts` is checked against `URL.hostname`, so the
 * allowlist this builder derives from capture evidence has to be keyed the same
 * way — a `host` carrying `:8080` would never match and every fetch to a
 * non-default port would be rejected as host-not-allowed.
 */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function schemeOf(url: string): string {
  try {
    return new URL(url).protocol;
  } catch {
    return "";
  }
}
