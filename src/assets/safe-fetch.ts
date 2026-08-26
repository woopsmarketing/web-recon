/**
 * SSRF-hardened asset fetcher (Task 22 B).
 *
 * Design rules, all enforced structurally:
 *  - http/https only; URLs with embedded credentials are rejected.
 *  - Ports outside the policy's allowlist (default 80/443) are rejected.
 *  - The hostname is DNS-resolved BEFORE any connection, and EVERY resolved
 *    address must be public: loopback, RFC1918 (10/8, 172.16/12, 192.168/16),
 *    link-local 169.254/16 (cloud metadata endpoints live here), CGNAT
 *    100.64/10, multicast/reserved ranges, IPv6 loopback/link-local/ULA and
 *    IPv4-mapped IPv6 are all rejected. The connection then uses the SAME
 *    resolution result (custom `lookup` passed to the socket), so a
 *    validate-then-reresolve TOCTOU swap cannot slip through.
 *  - Redirects are followed MANUALLY and every hop re-runs the FULL
 *    validation (scheme, credentials, port, host allowlist policy, DNS).
 *  - Response bytes are counted as they stream; one byte over maxBytes
 *    destroys the socket (no post-hoc truncation).
 *  - Content-Type is validated against the expected asset kind.
 *  - An overall deadline covers ALL hops of one logical fetch.
 *
 * Tests inject `lookup` to simulate hostnames resolving into private ranges
 * without any network, and use `allowPrivateHostPorts` to permit ONLY their
 * explicit 127.0.0.1 fixture — production callers never set these.
 */
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";

import type { SafeFetchResult, SafeFetchStatus } from "./types.js";

export interface SafeFetchPolicy {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  /** Hosts the INITIAL request may target. Redirect hops must stay inside it too. */
  allowedHosts: Set<string>;
  /** Expected MIME class of the final response. */
  expectedKind: "image" | "font" | "video" | "audio" | "css" | "any";
  allowedPorts?: number[]; // default [80, 443]
  /** TEST-ONLY: explicit "host:port" values allowed to be private (local fixtures). */
  allowPrivateHostPorts?: Set<string>;
  /** TEST-ONLY: injectable resolver. Defaults to dns.promises.lookup. */
  lookup?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  userAgent?: string;
}

export const DEFAULT_FETCH_POLICY = {
  timeoutMs: 20_000,
  maxBytes: 30 * 1024 * 1024,
  maxRedirects: 5,
  allowedPorts: [80, 443],
} as const;

/* ------------------------------------------------------------------ *
 * Address validation
 * ------------------------------------------------------------------ */

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  return (
    ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
  );
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return ((ipv4ToInt(ip) & mask) >>> 0) === ((ipv4ToInt(base) & mask) >>> 0);
}

const PRIVATE_V4_RANGES: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local incl. 169.254.169.254 metadata
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

/** True when the LITERAL IP address must not be connected to. Exported for tests. */
export function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    return PRIVATE_V4_RANGES.some(([base, bits]) => inCidr4(address, base, bits));
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped / IPv4-translated (::ffff:a.b.c.d, 64:ff9b::/96) — validate the embedded IPv4.
    const v4 = lower.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4 && (lower.startsWith("::ffff:") || lower.startsWith("64:ff9b:"))) {
      return isPrivateAddress(v4[1]);
    }
    if (lower === "::" || lower === "::1") return true; // unspecified / loopback
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
      return true; // link-local fe80::/10
    }
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
    if (lower.startsWith("ff")) return true; // multicast
    return false;
  }
  // Not an IP literal at all — treat as unresolvable, reject.
  return true;
}

async function defaultLookup(
  hostname: string,
): Promise<{ address: string; family: number }[]> {
  return dns.promises.lookup(hostname, { all: true, verbatim: true });
}

/* ------------------------------------------------------------------ *
 * MIME validation
 * ------------------------------------------------------------------ */

const MIME_ALLOW: Record<string, (mime: string) => boolean> = {
  image: (m) => m.startsWith("image/") || m === "binary/octet-stream",
  font: (m) =>
    m.startsWith("font/") ||
    m.startsWith("application/font") ||
    m === "application/x-font-ttf" ||
    m === "application/vnd.ms-fontobject",
  video: (m) => m.startsWith("video/"),
  audio: (m) => m.startsWith("audio/"),
  css: (m) => m.startsWith("text/css"),
  any: () => true,
};

export function mimeAllowed(
  expectedKind: SafeFetchPolicy["expectedKind"],
  mime: string,
): boolean {
  return MIME_ALLOW[expectedKind](mime);
}

export function extensionForMime(mime: string, url: string): string {
  const table: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    "font/woff2": "woff2",
    "font/woff": "woff",
    "font/ttf": "ttf",
    "font/otf": "otf",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "text/css": "css",
  };
  const mapped = table[mime.split(";")[0].trim().toLowerCase()];
  if (mapped) return mapped;
  const pathExt = new URL(url).pathname.match(/\.([a-z0-9]{1,5})$/i);
  return pathExt ? pathExt[1].toLowerCase() : "bin";
}

/* ------------------------------------------------------------------ *
 * Fetch
 * ------------------------------------------------------------------ */

interface HopValidation {
  ok: boolean;
  status?: SafeFetchStatus;
  detail?: string;
  addresses?: { address: string; family: number }[];
}

async function validateHop(
  url: URL,
  policy: SafeFetchPolicy,
  isRedirectHop: boolean,
): Promise<HopValidation> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, status: "rejected-scheme", detail: url.protocol };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, status: "rejected-credentials", detail: "credentials in URL" };
  }
  if (!policy.allowedHosts.has(url.hostname)) {
    return {
      ok: false,
      status: isRedirectHop ? "rejected-redirect" : "rejected-host-not-allowed",
      detail: `host not in allowlist: ${url.hostname}`,
    };
  }
  const port = url.port
    ? Number.parseInt(url.port, 10)
    : url.protocol === "https:"
      ? 443
      : 80;
  const hostPort = `${url.hostname}:${port}`;
  const privateOverride = policy.allowPrivateHostPorts?.has(hostPort) === true;
  const allowedPorts = policy.allowedPorts ?? [...DEFAULT_FETCH_POLICY.allowedPorts];
  if (!allowedPorts.includes(port) && !privateOverride) {
    return { ok: false, status: "rejected-port", detail: String(port) };
  }
  const lookup = policy.lookup ?? defaultLookup;
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(url.hostname);
  } catch (err) {
    return {
      ok: false,
      status: "network-error",
      detail: `dns: ${(err as Error).message}`,
    };
  }
  if (addresses.length === 0) {
    return { ok: false, status: "network-error", detail: "dns: no addresses" };
  }
  if (!privateOverride) {
    for (const entry of addresses) {
      if (isPrivateAddress(entry.address)) {
        return {
          ok: false,
          status: isRedirectHop ? "rejected-redirect" : "rejected-private-address",
          detail: `${url.hostname} resolves to ${entry.address}`,
        };
      }
    }
  }
  return { ok: true, addresses };
}

interface HopResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer | null;
  tooLarge: boolean;
}

function requestOnce(
  url: URL,
  addresses: { address: string; family: number }[],
  policy: SafeFetchPolicy,
  deadline: number,
  wantBody: boolean,
): Promise<HopResponse> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new Error("deadline"));
      return;
    }
    const mod = url.protocol === "https:" ? https : http;
    // Pin the connection to the ALREADY-VALIDATED resolution result.
    const pinnedLookup = (
      _hostname: string,
      options: dns.LookupOptions,
      callback: (
        err: NodeJS.ErrnoException | null,
        address: string | dns.LookupAddress[],
        family?: number,
      ) => void,
    ): void => {
      if (options.all) {
        callback(null, addresses.map((a) => ({ address: a.address, family: a.family })));
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    };
    const request = mod.request(
      url,
      {
        method: "GET",
        lookup: pinnedLookup as never,
        headers: {
          "user-agent":
            policy.userAgent ?? "web-recon-asset-fetcher/1.0 (authorized source-site recon)",
          accept: "*/*",
        },
        timeout: remaining,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const isRedirect = status >= 300 && status < 400;
        if (!wantBody || isRedirect) {
          response.resume();
          resolve({
            statusCode: status,
            headers: response.headers,
            body: null,
            tooLarge: false,
          });
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        let settled = false;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > policy.maxBytes) {
            settled = true;
            response.destroy();
            resolve({
              statusCode: status,
              headers: response.headers,
              body: null,
              tooLarge: true,
            });
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            statusCode: status,
            headers: response.headers,
            body: Buffer.concat(chunks),
            tooLarge: false,
          });
        });
        response.on("error", (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        });
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error("timeout"));
    });
    request.on("error", (err) => reject(err));
    request.end();
  });
}

/** Fetch one asset URL under the full SSRF policy. Never throws. */
export async function safeFetchAsset(
  rawUrl: string,
  policy: SafeFetchPolicy,
): Promise<SafeFetchResult> {
  const redirectChain: string[] = [];
  const deadline = Date.now() + policy.timeoutMs;
  const fail = (
    status: SafeFetchStatus,
    detail: string | null,
    httpStatus: number | null = null,
  ): SafeFetchResult => ({
    status,
    url: rawUrl,
    httpStatus,
    mime: null,
    bytes: null,
    body: null,
    redirectChain,
    detail,
  });

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return fail("rejected-scheme", "unparseable URL");
  }

  for (let hop = 0; ; hop++) {
    const isRedirectHop = hop > 0;
    const validation = await validateHop(current, policy, isRedirectHop);
    if (!validation.ok) {
      return fail(validation.status ?? "network-error", validation.detail ?? null);
    }
    let response: HopResponse;
    try {
      response = await requestOnce(
        current,
        validation.addresses ?? [],
        policy,
        deadline,
        true,
      );
    } catch (err) {
      const message = (err as Error).message;
      return fail(
        message === "timeout" || message === "deadline" ? "timeout" : "network-error",
        message,
      );
    }
    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = response.headers.location;
      if (!location) {
        return fail("http-error", "redirect without location", response.statusCode);
      }
      if (hop + 1 > policy.maxRedirects) {
        return fail("too-many-redirects", `more than ${policy.maxRedirects} redirects`);
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return fail("rejected-redirect", `unparseable redirect target: ${location}`);
      }
      redirectChain.push(next.toString());
      current = next;
      continue;
    }
    if (response.tooLarge) {
      return fail("too-large", `over ${policy.maxBytes} bytes`, response.statusCode);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return fail("http-error", `http ${response.statusCode}`, response.statusCode);
    }
    const mime = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (mime === "" || !mimeAllowed(policy.expectedKind, mime)) {
      return fail(
        "mime-rejected",
        `content-type ${mime || "(missing)"} not allowed for kind ${policy.expectedKind}`,
        response.statusCode,
      );
    }
    return {
      status: "fetched",
      url: rawUrl,
      httpStatus: response.statusCode,
      mime,
      bytes: response.body?.length ?? 0,
      body: response.body,
      redirectChain,
      detail: null,
    };
  }
}

/** Small bounded concurrency helper (polite: low parallelism + spacing). */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  spacingMs: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
      if (spacingMs > 0 && index + 1 < items.length) {
        await new Promise((resolve) => setTimeout(resolve, spacingMs));
      }
    }
  }
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
