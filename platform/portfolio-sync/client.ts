import { createHash } from "node:crypto";
import { EXPORT_MAX_DOCUMENT_BYTES, PortfolioResultSchema, ResultAckSchema, assetPathPrefix, exportPath, resultPath, type ExportAsset, type PortfolioResult, type ResultAck } from "./contract";

/**
 * HTTP client for BoostChat's publisher API (contract §1–§4). The publisher always asks first.
 *
 *  - the bearer token is sent only to the configured base origin: redirects are refused, an asset
 *    href must stay under /api/publisher/sites/<siteId>/assets/ on that origin, and a plain-http base
 *    is accepted for a loopback host only. The token never appears in an error or a log line.
 *  - reads are not retried here (the next cycle reads again); the result POST is retried on a
 *    network error or a 5xx, because the same report sent twice is harmless (contract R4).
 */

export type BoostChatErrorKind = "config" | "auth" | "not-configured" | "site-not-found" | "http" | "network" | "protocol";

export class BoostChatError extends Error {
  constructor(
    message: string,
    public readonly kind: BoostChatErrorKind,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "BoostChatError";
  }
}

export type ReportOutcome = { status: "accepted"; ack: ResultAck } | { status: "stale"; revision?: number; liveRevision?: number };

export interface PublisherClient {
  /** the raw export document (validated by the generator) */
  getExport(): Promise<unknown>;
  /** the asset's bytes, already checked against the export's sha256 / size */
  getAsset(asset: ExportAsset): Promise<Uint8Array>;
  postResult(result: PortfolioResult): Promise<ReportOutcome>;
}

export interface PublisherClientOptions {
  baseUrl: string;
  token: string;
  siteId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** result POST: total attempts and the pause before attempt n+1 (default 5 attempts, 1s · 2ⁿ capped at 30s) */
  postAttempts?: number;
  postDelayMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** contract §4: the result body is at most 16 KiB */
export const RESULT_BODY_MAX = 16 * 1024;

export function createPublisherClient(opts: PublisherClientOptions): PublisherClient {
  let base: URL;
  try {
    base = new URL(opts.baseUrl);
  } catch {
    throw new BoostChatError("BOOSTCHAT_BASE_URL is not a URL", "config");
  }
  if (base.protocol !== "https:" && !(base.protocol === "http:" && LOOPBACK.has(base.hostname))) {
    throw new BoostChatError(`BOOSTCHAT_BASE_URL must be https (plain http is accepted for a loopback host only), got ${base.protocol}//${base.host}`, "config");
  }
  if (base.username || base.password || base.search || base.hash || base.pathname.replace(/\/+$/, "") !== "") {
    throw new BoostChatError("BOOSTCHAT_BASE_URL must be an origin (no path, query, hash or credentials)", "config");
  }
  if (!opts.token || opts.token.trim() !== opts.token) throw new BoostChatError("BOOSTCHAT_PUBLISHER_TOKEN is missing or has surrounding whitespace", "config");
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = opts.log ?? (() => {});

  async function request(pathname: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(pathname, base);
    if (url.origin !== base.origin) throw new BoostChatError(`refusing to send the publisher token to ${url.origin}`, "protocol");
    try {
      return await doFetch(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${opts.token}`, accept: "application/json" },
      });
    } catch (error) {
      throw new BoostChatError(`${init.method ?? "GET"} ${url.pathname}: ${(error as Error).message}`, "network");
    }
  }

  async function errorOf(res: Response, what: string): Promise<BoostChatError> {
    const body = (await res.json().catch(() => undefined)) as { error?: unknown } | undefined;
    const code = typeof body?.error === "string" ? body.error.slice(0, 80) : undefined;
    if (res.status === 401) return new BoostChatError(`${what}: 401 unauthorized — check BOOSTCHAT_PUBLISHER_TOKEN`, "auth", 401);
    if (res.status === 503 && code === "publisher_not_configured") return new BoostChatError(`${what}: BoostChat has no publisher token configured (503 publisher_not_configured)`, "not-configured", 503);
    if (res.status === 404 && code === "site_not_found") return new BoostChatError(`${what}: BoostChat does not know site "${opts.siteId}" (404 site_not_found)`, "site-not-found", 404);
    return new BoostChatError(`${what}: HTTP ${res.status}${code ? ` ${code}` : ""}`, "http", res.status);
  }

  /** The body, read chunk by chunk with a running sha256; reading stops (and the connection is dropped) as soon as it exceeds `limit`. */
  async function readBounded(res: Response, limit: number, what: string): Promise<{ bytes: Uint8Array; sha256: string }> {
    const hash = createHash("sha256");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    try {
      for (;;) {
        const chunk = reader ? await reader.read() : { done: true as const, value: undefined };
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > limit) {
          await reader!.cancel().catch(() => {});
          throw new BoostChatError(`${what}: the response is larger than ${limit} B`, "protocol", res.status);
        }
        hash.update(chunk.value);
        chunks.push(chunk.value);
      }
    } catch (error) {
      if (error instanceof BoostChatError) throw error;
      throw new BoostChatError(`${what}: ${(error as Error).message}`, "network");
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    return { bytes, sha256: hash.digest("hex") };
  }

  return {
    async getExport() {
      const res = await request(exportPath(opts.siteId));
      if (res.status !== 200) throw await errorOf(res, "export");
      const { bytes } = await readBounded(res, EXPORT_MAX_DOCUMENT_BYTES, "export");
      try {
        return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
      } catch {
        throw new BoostChatError("export: the response is not JSON", "protocol", 200);
      }
    },

    async getAsset(asset) {
      const prefix = assetPathPrefix(opts.siteId);
      if (!asset.href.startsWith(prefix) || asset.href.includes("..") || /[?#\\]/.test(asset.href)) {
        throw new BoostChatError(`asset "${asset.id}": href is not under ${prefix}`, "protocol");
      }
      const res = await request(asset.href, { headers: { accept: "*/*" } });
      if (res.status !== 200) throw await errorOf(res, `asset "${asset.id}"`);
      // never more than the export declared (itself capped by the contract schema)
      const { bytes, sha256: hash } = await readBounded(res, asset.size, `asset "${asset.id}"`);
      const header = res.headers.get("x-asset-sha256");
      if (header && header.toLowerCase() !== hash) throw new BoostChatError(`asset "${asset.id}": body sha256 ≠ its X-Asset-Sha256 header (damaged in transit)`, "protocol");
      if (bytes.length !== asset.size || hash !== asset.sha256) {
        throw new BoostChatError(`asset "${asset.id}": downloaded ${bytes.length} B sha256 ${hash.slice(0, 12)}… ≠ export ${asset.size} B ${asset.sha256.slice(0, 12)}…`, "protocol");
      }
      return bytes;
    },

    async postResult(result) {
      const body = JSON.stringify(PortfolioResultSchema.parse(result));
      if (Buffer.byteLength(body) > RESULT_BODY_MAX) throw new BoostChatError(`result body is ${Buffer.byteLength(body)} B, over the contract's ${RESULT_BODY_MAX} B`, "protocol");
      const attempts = Math.max(1, opts.postAttempts ?? 5);
      const delay = opts.postDelayMs ?? ((n: number) => Math.min(30_000, 1000 * 2 ** (n - 1)));
      let last: BoostChatError | undefined;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (attempt > 1) {
          log(`result POST attempt ${attempt}/${attempts} (previous: ${last?.message})`);
          await sleep(delay(attempt - 1));
        }
        let res: Response;
        try {
          res = await request(resultPath(opts.siteId), { method: "POST", body, headers: { "content-type": "application/json" } });
        } catch (error) {
          last = error as BoostChatError;
          continue; // network error → the same report again (contract R4)
        }
        if (res.status === 200) {
          const ack = ResultAckSchema.safeParse(await res.json().catch(() => undefined));
          if (!ack.success) throw new BoostChatError("result: BoostChat answered 200 with an unexpected body", "protocol", 200);
          return { status: "accepted", ack: ack.data };
        }
        if (res.status === 409) {
          const stale = (await res.json().catch(() => undefined)) as { error?: unknown; revision?: unknown; liveRevision?: unknown } | undefined;
          if (stale?.error === "stale_revision") {
            return { status: "stale", ...(typeof stale.revision === "number" ? { revision: stale.revision } : {}), ...(typeof stale.liveRevision === "number" ? { liveRevision: stale.liveRevision } : {}) };
          }
          throw new BoostChatError("result: HTTP 409", "http", 409);
        }
        last = await errorOf(res, "result");
        if (res.status < 500 || last.kind === "not-configured") throw last;
      }
      throw new BoostChatError(`result could not be delivered after ${attempts} attempt(s): ${last?.message ?? "unknown error"}`, last?.kind ?? "network", last?.status);
    },
  };
}
