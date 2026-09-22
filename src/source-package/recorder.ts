import { createHash } from "node:crypto";
import type { CDPSession, Page, Request, Response } from "playwright";
import {
  SAFE_RESPONSE_HEADERS,
  type BodyStatus,
  type SourceBodyPolicy,
  type SourceCaptureLimits,
} from "./types.js";
import { matchProvider, safeUrl } from "./classify.js";

/**
 * The NETWORK RECORDER of the Source Package. Attached to a Playwright `Page`
 * BEFORE navigation (a response that arrives before the listener exists cannot
 * be recovered afterwards — the same lesson as the observer's stylesheet
 * bridge), it records every request the page makes during the load window and
 * keeps the BODIES the policy allows, within the byte caps.
 *
 * Privacy contract, enforced structurally:
 *   - Request headers are never read.
 *   - Response headers are read ONE BY ONE from the allowlist
 *     (`SAFE_RESPONSE_HEADERS`) via `headerValue(name)`; `allHeaders()` is never
 *     called, so `set-cookie` and friends never enter process memory here.
 *   - POST bodies are never read; only `postDataBuffer().byteLength` is kept.
 *   - Cookies, storage and the browser context are untouched.
 *
 * Initiator evidence comes from a CDP `Network.requestWillBeSent` listener
 * (Chromium only — which is what this project runs). It is BEST-EFFORT: when
 * the session cannot be opened the package says `cdp-unavailable` and every
 * entry simply has no `initiator`.
 */

export interface RecordedBody {
  status: BodyStatus;
  data?: Buffer;
  bytes?: number;
  sha256?: string;
  reason?: string;
}

export interface RecordedRequest {
  seq: number;
  url: string;
  method: string;
  resourceType: string;
  frame: "main" | "child" | "service-worker" | "unknown";
  frameUrl?: string;
  navigation: boolean;
  redirectedFrom?: string;
  hasPostData: boolean;
  postDataBytes?: number;
  startedAtMs: number;
  responseEndMs?: number;
  status: number | null;
  statusText?: string;
  /** Playwright `requestfailed` error text, for a request that never got a response. */
  failed?: string;
  /**
   * The request DID receive a 2xx response and was then aborted while its body
   * streamed (`net::ERR_ABORTED` on a media range request the element stopped
   * reading, a beacon the page navigated away from). Measured on a real page:
   * Playwright reports these through `requestfailed` too, but the resource
   * was served — it is not a failure of the source.
   */
  streamAborted?: string;
  fromServiceWorker: boolean;
  headers: Record<string, string>;
  initiator?: { type: string; url?: string; lineNumber?: number; stackTopUrl?: string };
  body: RecordedBody;
}

export interface RecorderStats {
  seen: number;
  recorded: number;
  overflowNotRecorded: number;
  bodiesCaptured: number;
  bytesCaptured: number;
  bytesByClass: Record<string, number>;
  skippedBySize: number;
  skippedBySizeBytes: number;
  skippedByPolicy: number;
  bodyUnavailable: number;
  failed: number;
}

export interface RecordedNetwork {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  entries: RecordedRequest[];
  stats: RecorderStats;
  initiatorEvidence: "cdp-available" | "cdp-unavailable";
  initiatorReason?: string;
}

export interface SourceRecorder {
  /** Stop listening, wait for pending body reads, detach CDP. Idempotent. */
  finish(): Promise<RecordedNetwork>;
}

export interface SourceRecorderOptions {
  limits: SourceCaptureLimits;
  bodyPolicy: SourceBodyPolicy;
  /** Attach the CDP initiator listener (default true). */
  initiatorEvidence?: boolean;
  log?: (message: string) => void;
}

interface CdpInitiatorRecord {
  type: string;
  url?: string;
  lineNumber?: number;
  stackTopUrl?: string;
}

type BodyKind = keyof SourceBodyPolicy;

function bodyKindOf(resourceType: string, contentType: string | undefined): BodyKind {
  const ct = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (resourceType === "script" || /javascript|ecmascript/.test(ct)) return "script";
  if (resourceType === "stylesheet" || ct === "text/css") return "stylesheet";
  if (resourceType === "font" || ct.startsWith("font/")) return "font";
  if (resourceType === "image" || ct.startsWith("image/")) return "image";
  if (resourceType === "media" || ct.startsWith("video/") || ct.startsWith("audio/")) return "media";
  if (/json/.test(ct)) return "json";
  return "other";
}

function perBodyCap(kind: BodyKind, limits: SourceCaptureLimits): number {
  if (kind === "script") return limits.maxScriptBodyBytes;
  if (kind === "stylesheet") return limits.maxStylesheetBodyBytes;
  if (kind === "json") return limits.maxJsonBodyBytes;
  return limits.maxOtherBodyBytes;
}

function totalCap(kind: BodyKind, limits: SourceCaptureLimits): number {
  if (kind === "script") return limits.maxTotalScriptBytes;
  if (kind === "stylesheet") return limits.maxTotalStylesheetBytes;
  if (kind === "json") return limits.maxTotalJsonBytes;
  // Other kinds share the "other" total = the larger of the two, a conservative ceiling.
  return Math.max(limits.maxTotalScriptBytes, limits.maxTotalStylesheetBytes);
}

export async function attachSourceRecorder(
  page: Page,
  options: SourceRecorderOptions,
): Promise<SourceRecorder> {
  const { limits, bodyPolicy } = options;
  const log = options.log ?? (() => {});
  const t0 = Date.now();
  const startedAt = new Date(t0).toISOString();
  const entries: RecordedRequest[] = [];
  const byRequest = new Map<Request, RecordedRequest>();
  const pending: Promise<void>[] = [];
  const stats: RecorderStats = {
    seen: 0,
    recorded: 0,
    overflowNotRecorded: 0,
    bodiesCaptured: 0,
    bytesCaptured: 0,
    bytesByClass: {},
    skippedBySize: 0,
    skippedBySizeBytes: 0,
    skippedByPolicy: 0,
    bodyUnavailable: 0,
    failed: 0,
  };
  let finished = false;

  /* ---- CDP initiator side-channel --------------------------------------- */
  const cdpByUrl = new Map<string, CdpInitiatorRecord[]>();
  let cdp: CDPSession | null = null;
  let initiatorEvidence: RecordedNetwork["initiatorEvidence"] = "cdp-unavailable";
  let initiatorReason: string | undefined;
  if (options.initiatorEvidence !== false) {
    try {
      cdp = await page.context().newCDPSession(page);
      cdp.on("Network.requestWillBeSent", (event: {
        request: { url: string };
        initiator?: { type: string; url?: string; lineNumber?: number; stack?: { callFrames?: { url?: string }[] } };
      }) => {
        const url = event.request?.url;
        if (!url) return;
        const init = event.initiator;
        const record: CdpInitiatorRecord = { type: init?.type ?? "other" };
        if (init?.url) record.url = init.url;
        if (typeof init?.lineNumber === "number") record.lineNumber = init.lineNumber;
        const top = init?.stack?.callFrames?.[0]?.url;
        if (top) record.stackTopUrl = top;
        const list = cdpByUrl.get(url);
        if (list) list.push(record);
        else cdpByUrl.set(url, [record]);
      });
      await cdp.send("Network.enable");
      initiatorEvidence = "cdp-available";
    } catch (err) {
      cdp = null;
      initiatorReason = (err instanceof Error ? err.message : String(err)).split("\n", 1)[0]!.slice(0, 200);
      log(`source-package: CDP initiator evidence unavailable (${initiatorReason})`);
    }
  } else {
    initiatorReason = "disabled by options";
  }

  const takeInitiator = (url: string): CdpInitiatorRecord | undefined => {
    const list = cdpByUrl.get(url);
    if (!list || list.length === 0) return undefined;
    return list.shift();
  };

  /* ---- listeners ---------------------------------------------------------- */
  const onRequest = (request: Request): void => {
    if (finished) return;
    stats.seen++;
    if (entries.length >= limits.maxNetworkEntries) {
      stats.overflowNotRecorded++;
      return;
    }
    let url = "";
    let method = "GET";
    let resourceType = "other";
    try {
      url = request.url();
      method = request.method();
      resourceType = request.resourceType();
    } catch {
      return;
    }
    let frame: RecordedRequest["frame"] = "unknown";
    let frameUrl: string | undefined;
    try {
      if (request.serviceWorker()) {
        frame = "service-worker";
      } else {
        const f = request.frame();
        frame = f === page.mainFrame() ? "main" : "child";
        if (frame === "child") frameUrl = f.url();
      }
    } catch {
      frame = "unknown";
    }
    let navigation = false;
    try {
      navigation = request.isNavigationRequest();
    } catch {
      navigation = false;
    }
    let redirectedFrom: string | undefined;
    try {
      const prev = request.redirectedFrom();
      if (prev) redirectedFrom = prev.url();
    } catch {
      redirectedFrom = undefined;
    }
    let hasPostData = false;
    let postDataBytes: number | undefined;
    try {
      const buf = request.postDataBuffer();
      if (buf) {
        hasPostData = true;
        postDataBytes = buf.byteLength;
      }
    } catch {
      hasPostData = false;
    }
    const entry: RecordedRequest = {
      seq: entries.length,
      url,
      method,
      resourceType,
      frame,
      ...(frameUrl ? { frameUrl } : {}),
      navigation,
      ...(redirectedFrom ? { redirectedFrom } : {}),
      hasPostData,
      ...(postDataBytes !== undefined ? { postDataBytes } : {}),
      startedAtMs: Date.now() - t0,
      status: null,
      fromServiceWorker: false,
      headers: {},
      body: { status: "not-applicable" },
    };
    // Initiator is joined at finish(): the CDP event for a request can arrive
    // AFTER Playwright's own `request` event, so joining here would race.
    entries.push(entry);
    stats.recorded++;
    byRequest.set(request, entry);
  };

  const readSafeHeaders = async (response: Response): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    for (const name of SAFE_RESPONSE_HEADERS) {
      try {
        const value = await response.headerValue(name);
        if (value !== null && value !== undefined) out[name] = value.slice(0, 500);
      } catch {
        /* header unreadable — leave absent */
      }
    }
    return out;
  };

  const onResponse = (response: Response): void => {
    if (finished) return;
    const request = response.request();
    const entry = byRequest.get(request);
    if (!entry) return;
    pending.push(
      (async () => {
        try {
          entry.status = response.status();
          const st = response.statusText();
          if (st) entry.statusText = st;
        } catch {
          entry.status = null;
        }
        try {
          entry.fromServiceWorker = response.fromServiceWorker();
        } catch {
          entry.fromServiceWorker = false;
        }
        entry.headers = await readSafeHeaders(response);
        const status = entry.status ?? 0;
        if (status >= 300 && status < 400) {
          entry.body = { status: "not-applicable", reason: "redirect" };
          return;
        }
        if (entry.frame === "child" || entry.frame === "service-worker") {
          entry.body = { status: "skipped-by-policy", reason: `${entry.frame} frame` };
          stats.skippedByPolicy++;
          return;
        }
        if (entry.navigation && entry.frame === "main") {
          // The main document is captured by navigate-document.ts (bytes as served).
          entry.body = { status: "not-applicable", reason: "main document captured separately" };
          return;
        }
        const kind = bodyKindOf(entry.resourceType, entry.headers["content-type"]);
        if (kind === "script" && !bodyPolicy.analyticsScript) {
          // Tag-manager / analytics / ads scripts are EXTERNAL_EMBED whatever
          // their bytes say; keeping them costs megabytes per viewport for
          // code a clone would never ship. Inventory + metadata are still kept.
          const u = safeUrl(entry.url);
          const provider = u ? matchProvider(u.hostname, u.pathname) : undefined;
          if (provider && (provider.kind === "analytics" || provider.kind === "tag-manager" || provider.kind === "ads")) {
            entry.body = { status: "skipped-by-policy", reason: `bodyPolicy.analyticsScript=false (${provider.hint})` };
            stats.skippedByPolicy++;
            return;
          }
        }
        if (!bodyPolicy[kind]) {
          entry.body = { status: "skipped-by-policy", reason: `bodyPolicy.${kind}=false` };
          stats.skippedByPolicy++;
          return;
        }
        const declared = Number.parseInt(entry.headers["content-length"] ?? "", 10);
        const cap = perBodyCap(kind, limits);
        if (Number.isFinite(declared) && declared > cap) {
          entry.body = { status: "skipped-by-size", bytes: declared, reason: `content-length ${declared} > cap ${cap}` };
          stats.skippedBySize++;
          stats.skippedBySizeBytes += declared;
          return;
        }
        let data: Buffer;
        try {
          data = await response.body();
        } catch (err) {
          const reason = (err instanceof Error ? err.message : String(err)).split("\n", 1)[0]!.slice(0, 200);
          entry.body = { status: "unavailable", reason };
          stats.bodyUnavailable++;
          return;
        }
        const bytes = data.byteLength;
        if (bytes > cap) {
          entry.body = { status: "skipped-by-size", bytes, reason: `${bytes} > cap ${cap}` };
          stats.skippedBySize++;
          stats.skippedBySizeBytes += bytes;
          return;
        }
        // Read the running total ONLY after the `await` above, and commit it in
        // the same synchronous stretch as this comparison (no further `await`
        // before the write below). JS's single-threaded event loop makes that
        // stretch atomic across concurrently in-flight responses of the same
        // kind; reading it earlier (before the await) let concurrent same-kind
        // bodies each see a stale total and all pass a budget none of them
        // should have — proven by three concurrent JSON responses each landing
        // under a total cap none of them individually exceeded.
        const classTotal = stats.bytesByClass[kind] ?? 0;
        if (classTotal + bytes > totalCap(kind, limits)) {
          entry.body = { status: "skipped-by-size", bytes, reason: `total ${kind} cap ${totalCap(kind, limits)} would be exceeded` };
          stats.skippedBySize++;
          stats.skippedBySizeBytes += bytes;
          return;
        }
        stats.bytesByClass[kind] = classTotal + bytes;
        stats.bytesCaptured += bytes;
        stats.bodiesCaptured++;
        entry.body = {
          status: "captured",
          data,
          bytes,
          sha256: createHash("sha256").update(data).digest("hex"),
        };
      })().catch(() => {
        /* never let a body read reject the load */
      }),
    );
  };

  const onRequestFailed = (request: Request): void => {
    const entry = byRequest.get(request);
    if (!entry) return;
    let text = "failed";
    try {
      text = request.failure()?.errorText ?? "failed";
    } catch {
      /* keep default */
    }
    entry.responseEndMs = Date.now() - t0;
    if (entry.status !== null && entry.status >= 200 && entry.status < 300) {
      // A response was already received: the body stream was aborted, the
      // request itself did not fail. Whatever the body handler decided stands.
      entry.streamAborted = text.slice(0, 200);
      return;
    }
    entry.failed = text.slice(0, 200);
    if (entry.body.status === "not-applicable") entry.body = { status: "failed", reason: entry.failed };
    stats.failed++;
  };

  const onRequestFinished = (request: Request): void => {
    const entry = byRequest.get(request);
    if (!entry) return;
    entry.responseEndMs = Date.now() - t0;
  };

  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  page.on("requestfinished", onRequestFinished);

  let result: RecordedNetwork | null = null;
  return {
    async finish(): Promise<RecordedNetwork> {
      if (result) return result;
      finished = true;
      page.off("request", onRequest);
      page.off("response", onResponse);
      page.off("requestfailed", onRequestFailed);
      page.off("requestfinished", onRequestFinished);
      await Promise.allSettled(pending);
      // Join CDP initiator records in arrival order (FIFO per URL).
      for (const entry of entries) {
        const init = takeInitiator(entry.url);
        if (init) entry.initiator = init;
      }
      if (cdp) {
        try {
          await cdp.detach();
        } catch {
          /* already gone */
        }
      }
      const t1 = Date.now();
      result = {
        startedAt,
        endedAt: new Date(t1).toISOString(),
        durationMs: t1 - t0,
        entries,
        stats,
        initiatorEvidence,
        ...(initiatorReason ? { initiatorReason } : {}),
      };
      return result;
    },
  };
}
