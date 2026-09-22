import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { decodeCapturedBody } from "../observer/document-charset.js";
import { installBrowserNameShim } from "../observer/initial-paint-census.js";
import { safeFetchAsset } from "../assets/safe-fetch.js";
import {
  classifyEmbedUrl,
  classifyPreservability,
  classifyRequest,
  detectFrameworks,
  matchProvider,
  redactAttributeRecord,
  redactCssUrls,
  redactUrl,
  redactUrlText,
  safeUrl,
} from "./classify.js";

/** Review B1: initiator URLs (document / script) are persisted only after redaction. */
function redactInitiator<T extends { url?: string; stackTopUrl?: string }>(init: T): T {
  return {
    ...init,
    ...(init.url ? { url: redactUrl(init.url).url } : {}),
    ...(init.stackTopUrl ? { stackTopUrl: redactUrl(init.stackTopUrl).url } : {}),
  };
}
import { inventoryInitialDocument, type InitialDocumentInventory } from "./initial-document.js";
import {
  collectSourceInventoryInBrowser,
  serializeSheetsInBrowser,
  type RawSourceInventory,
} from "./inventory-in-browser.js";
import { attachSourceRecorder, type RecordedNetwork, type RecordedRequest } from "./recorder.js";
import {
  RUNTIME_CONFIG_WINDOW_GLOBALS,
  SENSITIVE_CONFIG_KEY_PATTERN,
  SOURCE_BODY_POLICY_DEFAULT,
  SOURCE_CAPTURE_LIMITS_DEFAULT,
  SOURCE_PACKAGE_KIND,
  SOURCE_PACKAGE_SCHEMA_VERSION,
  type Accounting,
  type AssetEntry,
  type AssetKind,
  type BlobRef,
  type ConfigEntry,
  type DeclaredIn,
  type DependencyClass,
  type NetworkEntry,
  type Preservability,
  type ScriptEntry,
  type SourceBlob,
  type SourceBodyPolicy,
  type SourceCaptureLimits,
  type SourcePackageCapture,
  type SourcePackageManifest,
  type StyleEntry,
} from "./types.js";

/**
 * Source Package CAPTURE — the two-call contract, mirroring the observer's own
 * stylesheet bridge:
 *
 *   const capture = await attachSourceCapture(page, options);  // BEFORE goto
 *   …navigate, settle, collect…
 *   const pkg = await capture.finish({ … });                    // page still open
 *
 * `finish` runs the in-page inventory, stops the recorder, parses the initial
 * document witness, joins the three by URL/hash, classifies conservatively,
 * and returns the in-memory package (manifests + blobs) for the store.
 */

export interface SourceCaptureOptions {
  limits?: Partial<SourceCaptureLimits>;
  bodyPolicy?: Partial<SourceBodyPolicy>;
  /** CDP initiator side-channel (default true). */
  initiatorEvidence?: boolean;
  /** Direct-HTTP fallback for stylesheets neither CSSOM nor the network yielded (default true; SSRF-hardened). */
  directFetchFallback?: boolean;
  /** TEST-ONLY passthrough to the safe fetcher (local fixture hosts). */
  allowPrivateHostPorts?: Set<string>;
  log?: (message: string) => void;
}

export interface SourceCaptureFinishInput {
  requestedUrl: string;
  viewport: { id: string; width: number; height: number; isMobile: boolean; deviceScaleFactor: number };
  engine: string;
  pageId?: string;
  initialDocument: {
    status: string;
    reason?: string;
    url?: string;
    httpStatus?: number;
    contentType?: string;
    bytes?: number;
    sha256?: string;
    charset?: string;
    declaredCharset?: string;
  };
  /** Raw main-document bytes, present exactly when `initialDocument.status === "captured"`. */
  documentResponseBody?: Buffer;
  /** `page.content()` after load/settle. */
  runtimeHtml: string;
}

export interface AttachedSourceCapture {
  finish(input: SourceCaptureFinishInput): Promise<SourcePackageCapture>;
}

export function resolveSourceCaptureOptions(options: SourceCaptureOptions = {}): {
  limits: SourceCaptureLimits;
  bodyPolicy: SourceBodyPolicy;
} {
  return {
    limits: { ...SOURCE_CAPTURE_LIMITS_DEFAULT, ...(options.limits ?? {}) },
    bodyPolicy: { ...SOURCE_BODY_POLICY_DEFAULT, ...(options.bodyPolicy ?? {}) },
  };
}

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");
const short = (hash: string): string => hash.slice(0, 12);
const pad = (prefix: string, n: number): string => `${prefix}${String(n).padStart(4, "0")}`;

function extFor(contentType: string | undefined, url: string | undefined, fallback: string): string {
  const ct = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  if (ct === "text/css") return "css";
  if (/javascript|ecmascript/.test(ct)) return "js";
  if (/json/.test(ct)) return "json";
  if (ct === "font/woff2") return "woff2";
  if (ct === "font/woff") return "woff";
  if (ct === "font/ttf") return "ttf";
  if (ct === "font/otf") return "otf";
  if (ct === "image/svg+xml") return "svg";
  if (ct === "image/png") return "png";
  if (ct === "image/jpeg") return "jpg";
  if (ct === "image/webp") return "webp";
  if (ct === "image/gif") return "gif";
  if (ct === "video/mp4") return "mp4";
  if (ct === "video/webm") return "webm";
  if (ct === "text/plain") return "txt";
  if (ct === "text/html") return "html";
  const m = /\.([a-z0-9]{1,5})(?:\?|#|$)/i.exec(url ?? "");
  if (m) return m[1]!.toLowerCase();
  return fallback;
}

function schemeOf(url: string | undefined): AssetEntry["scheme"] {
  if (!url) return "none";
  const t = url.trim().toLowerCase();
  if (t.startsWith("https:")) return "https";
  if (t.startsWith("http:")) return "http";
  if (t.startsWith("data:")) return "data";
  if (t.startsWith("blob:")) return "blob";
  if (/^[a-z][a-z0-9+.-]*:/.test(t)) return "other";
  return "relative-unresolved";
}

function dataUrlInfo(url: string): { mediaType: string; bytes: number } {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(url);
  if (!m) return { mediaType: "", bytes: url.length };
  const payload = m[3] ?? "";
  const bytes = m[2] ? Math.floor((payload.length * 3) / 4) : payload.length;
  return { mediaType: (m[1] ?? "").toLowerCase(), bytes };
}

/** `srcset` → absolute candidate URLs with descriptors (order kept). */
function parseSrcset(srcset: string, base: string): { url: string; descriptor?: string }[] {
  const out: { url: string; descriptor?: string }[] = [];
  for (const part of srcset.split(/,(?=\s*\S)/)) {
    const t = part.trim();
    if (t === "") continue;
    const m = /^(\S+)(?:\s+(\S+))?$/.exec(t);
    if (!m) continue;
    const abs = safeUrl(m[1]!, base)?.href ?? m[1]!;
    out.push({ url: abs, ...(m[2] ? { descriptor: m[2] } : {}) });
  }
  return out;
}

/** `src:` descriptor of an @font-face → url() tokens (format() ignored, local() counted). */
function parseFontSrc(src: string, base: string): { urls: string[]; local: number } {
  const urls: string[] = [];
  let local = 0;
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"']*))\s*\)|local\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[0] === "local(") {
      local++;
      continue;
    }
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (raw === "") continue;
    const abs = safeUrl(raw, base)?.href ?? raw;
    if (!urls.includes(abs)) urls.push(abs);
  }
  return { urls, local };
}

/**
 * Redact secret-shaped keys inside a page-delivered JSON blob COPY (the raw
 * document keeps its exact bytes). Returns the original text when it is not
 * JSON or nothing was redacted.
 */
function redactJsonText(text: string): { text: string; redactedKeys: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { text, redactedKeys: [] };
  }
  const redacted = new Set<string>();
  const walk = (value: unknown, depth: number): unknown => {
    if (depth > 32) return value;
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
    if (value !== null && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (SENSITIVE_CONFIG_KEY_PATTERN.test(k) && (typeof v === "string" || typeof v === "number")) {
          out[k] = "[redacted]";
          redacted.add(k);
          continue;
        }
        out[k] = walk(v, depth + 1);
      }
      return out;
    }
    return value;
  };
  const cleaned = walk(parsed, 0);
  if (redacted.size === 0) return { text, redactedKeys: [] };
  return { text: JSON.stringify(cleaned), redactedKeys: Array.from(redacted).sort() };
}

function stripHash(url: string): string {
  const i = url.indexOf("#");
  return i >= 0 ? url.slice(0, i) : url;
}

/* ---------------------------------------------------------------------------
 * Network index
 * ------------------------------------------------------------------------- */

class NetworkIndex {
  private readonly byUrl = new Map<string, RecordedRequest[]>();
  private readonly byRedirectedFrom = new Map<string, RecordedRequest[]>();
  constructor(readonly entries: readonly RecordedRequest[]) {
    for (const e of entries) {
      const list = this.byUrl.get(e.url);
      if (list) list.push(e);
      else this.byUrl.set(e.url, [e]);
      if (e.redirectedFrom) {
        const r = this.byRedirectedFrom.get(e.redirectedFrom);
        if (r) r.push(e);
        else this.byRedirectedFrom.set(e.redirectedFrom, [e]);
      }
    }
  }
  /** The FINAL response for a declared URL (redirects followed), main frame preferred. */
  resolve(url: string, preferType?: string): RecordedRequest | undefined {
    const candidates = this.byUrl.get(url) ?? this.byUrl.get(stripHash(url));
    if (!candidates || candidates.length === 0) return undefined;
    let e =
      candidates.find((c) => c.frame === "main" && (!preferType || c.resourceType === preferType)) ??
      candidates.find((c) => !preferType || c.resourceType === preferType) ??
      candidates[0]!;
    let hops = 0;
    while (e.status !== null && e.status >= 300 && e.status < 400 && hops < 8) {
      const next = (this.byRedirectedFrom.get(e.url) ?? []).find((n) => n.seq > e.seq);
      if (!next) break;
      e = next;
      hops++;
    }
    return e;
  }
}

/* ---------------------------------------------------------------------------
 * attach / finish
 * ------------------------------------------------------------------------- */

export async function attachSourceCapture(
  page: Page,
  options: SourceCaptureOptions = {},
): Promise<AttachedSourceCapture> {
  const { limits, bodyPolicy } = resolveSourceCaptureOptions(options);
  const log = options.log ?? (() => {});
  const recorder = await attachSourceRecorder(page, {
    limits,
    bodyPolicy,
    ...(options.initiatorEvidence !== undefined ? { initiatorEvidence: options.initiatorEvidence } : {}),
    log,
  });

  return {
    async finish(input: SourceCaptureFinishInput): Promise<SourcePackageCapture> {
      const limitations: string[] = [];
      // 1. In-page inventory FIRST (the page must still be open), then stop the
      //    recorder so late responses are still gathered.
      let inventory: RawSourceInventory | null = null;
      try {
        // tsx/esbuild `__name` helper — the observer's shim, installed here too
        // so a standalone caller (tests, QA) never loses the pass to it.
        await installBrowserNameShim(page);
        inventory = await page.evaluate(collectSourceInventoryInBrowser, {
          maxInventoryEntries: limits.maxInventoryEntries,
          maxElementsWalked: limits.maxElementsWalked,
          maxRulesPerSheet: limits.maxRulesPerSheet,
          maxInlineTextBytes: limits.maxInlineTextBytes,
          maxMediaConditions: 300,
          windowGlobals: [...RUNTIME_CONFIG_WINDOW_GLOBALS],
          sensitiveConfigKeyPattern: SENSITIVE_CONFIG_KEY_PATTERN.source,
        });
      } catch (err) {
        const reason = (err instanceof Error ? err.message : String(err)).split("\n", 1)[0]!.slice(0, 200);
        limitations.push(`in-page inventory failed: ${reason}`);
        log(`source-package: in-page inventory failed (${reason})`);
      }
      const network = await recorder.finish();
      return assembleSourcePackage({
        input,
        inventory,
        network,
        limits,
        bodyPolicy,
        limitations,
        directFetch: options.directFetchFallback !== false,
        allowPrivateHostPorts: options.allowPrivateHostPorts,
        page,
        log,
      });
    },
  };
}

interface AssembleArgs {
  input: SourceCaptureFinishInput;
  inventory: RawSourceInventory | null;
  network: RecordedNetwork;
  limits: SourceCaptureLimits;
  bodyPolicy: SourceBodyPolicy;
  limitations: string[];
  directFetch: boolean;
  allowPrivateHostPorts?: Set<string>;
  /** Present when the page is still open (second CSSOM pass); null in offline tests. */
  page: Page | null;
  log: (message: string) => void;
}

interface BlobSink {
  blobs: SourceBlob[];
  files: Set<string>;
  add(file: string, data: Buffer): void;
}

function makeSink(): BlobSink {
  const blobs: SourceBlob[] = [];
  const files = new Set<string>();
  return {
    blobs,
    files,
    add(file, data) {
      if (files.has(file)) return;
      files.add(file);
      blobs.push({ file, data });
    },
  };
}

export async function assembleSourcePackage(args: AssembleArgs): Promise<SourcePackageCapture> {
  const { input, inventory, network, limits, bodyPolicy, limitations, log } = args;
  const capturedAt = new Date().toISOString();
  const sink = makeSink();
  const finalUrl = inventory?.finalUrl || input.initialDocument.url || input.requestedUrl;
  const pageOrigin = inventory?.origin || safeUrl(finalUrl)?.origin || "";
  const base = inventory?.baseURI || finalUrl;
  const net = new NetworkIndex(network.entries);
  const viewportId = input.viewport.id;

  /* ---- document ---------------------------------------------------------- */
  let initialWitness: InitialDocumentInventory | null = null;
  let initialFile: string | undefined;
  if (input.initialDocument.status === "captured" && input.documentResponseBody) {
    initialFile = "document/response.html";
    sink.add(initialFile, input.documentResponseBody);
    try {
      const decoded = decodeCapturedBody(input.documentResponseBody, input.initialDocument.contentType);
      initialWitness = inventoryInitialDocument(decoded.html, finalUrl);
    } catch (err) {
      limitations.push(`initial document witness failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    limitations.push(`initial document not captured (${input.initialDocument.status}${input.initialDocument.reason ? `: ${input.initialDocument.reason}` : ""}); document-declared vs runtime-injected relies on CDP initiator evidence only`);
  }
  const runtimeBuf = Buffer.from(input.runtimeHtml, "utf8");
  const runtimeFile = "document/runtime.html";
  sink.add(runtimeFile, runtimeBuf);

  const initialSets = {
    scriptSrcs: new Set((initialWitness?.scriptSrcs ?? []).map(stripHash)),
    inlineScriptHashes: new Set(initialWitness?.inlineScriptHashes ?? []),
    stylesheetHrefs: new Set((initialWitness?.stylesheetHrefs ?? []).map(stripHash)),
    styleTextHashes: new Set(initialWitness?.styleTextHashes ?? []),
  };
  const declaredExternal = (url: string | undefined, entry: RecordedRequest | undefined, initialSet: Set<string>): DeclaredIn => {
    if (url && initialWitness && initialSet.has(stripHash(url))) return "initial-document";
    if (entry?.initiator?.type === "parser") return "initial-document";
    if (entry?.initiator?.type === "script" || entry?.initiator?.type === "preload") return "runtime-injected";
    if (initialWitness) return "runtime-injected";
    return "unknown";
  };
  const declaredInline = (text: string | undefined, initialSet: Set<string>): DeclaredIn => {
    if (!initialWitness) return "unknown";
    if (text !== undefined && initialSet.has(sha256(text))) return "initial-document";
    return "runtime-injected";
  };

  /* ---- <style> attribution against the initial-document witness ----------
   * Three passes, each consuming one initial-document <style> per match so a
   * tag is never claimed twice: (1) exact text hash, (2) attribute signature
   * (an EMPTY CSS-in-JS tag, or one whose text a runtime appended to), (3)
   * the rest — "runtime-injected" only once every initial <style> is spoken
   * for, otherwise "unknown". Guessing is what this replaces: an empty tag's
   * text hash trivially matches any other empty tag's.
   * ------------------------------------------------------------------------ */
  const styleSigOf = (attrs: Record<string, string> | undefined): string =>
    attrs ? Object.entries(attrs).map(([k, v]) => `${k}=${v}`).sort().join("\n") : "";
  const styleHashRemaining = new Map<string, number>();
  for (const h of initialWitness?.styleTextHashes ?? []) styleHashRemaining.set(h, (styleHashRemaining.get(h) ?? 0) + 1);
  const styleSigRemaining = new Map<string, number>();
  for (const s of initialWitness?.styleTagSignatures ?? []) styleSigRemaining.set(s, (styleSigRemaining.get(s) ?? 0) + 1);
  const take = (map: Map<string, number>, key: string): boolean => {
    const c = map.get(key) ?? 0;
    if (c <= 0) return false;
    map.set(key, c - 1);
    return true;
  };
  const styleDecl = new Map<number, { declaredIn: DeclaredIn; evidence: string }>();
  const styleSheetsInDom = (inventory?.sheets ?? []).filter((s) => s.ownerTag === "style");
  const initialStyleTotal = initialWitness?.counts.styleTags ?? 0;
  let styleMatched = 0;
  if (initialWitness) {
    for (const s of styleSheetsInDom) {
      const t = s.textContent;
      if (t !== undefined && t.trim() !== "" && take(styleHashRemaining, sha256(t))) {
        styleDecl.set(s.index, { declaredIn: "initial-document", evidence: "style text hash matches an initial-document <style>" });
        take(styleSigRemaining, styleSigOf(s.ownerAttributes));
        styleMatched++;
      }
    }
    for (const s of styleSheetsInDom) {
      if (styleDecl.has(s.index)) continue;
      if (take(styleSigRemaining, styleSigOf(s.ownerAttributes))) {
        styleDecl.set(s.index, { declaredIn: "initial-document", evidence: "owner attribute signature matches an initial-document <style> (text empty or changed at runtime)" });
        styleMatched++;
      }
    }
  }
  const declaredStyle = (index: number): { declaredIn: DeclaredIn; evidence: string } => {
    const hit = styleDecl.get(index);
    if (hit) return hit;
    if (!initialWitness) return { declaredIn: "unknown", evidence: "no initial-document witness" };
    if (styleMatched >= initialStyleTotal) return { declaredIn: "runtime-injected", evidence: "every initial-document <style> is accounted for by another sheet" };
    return { declaredIn: "unknown", evidence: `${initialStyleTotal - styleMatched} initial-document <style> tag(s) unmatched; no text or attribute evidence ties this sheet to one` };
  };

  /* ---- accounting helpers -------------------------------------------------- */
  const accounting: Accounting = {
    captured: { count: 0, bytes: 0 },
    skippedBySize: { count: 0, bytes: 0 },
    skippedByPolicy: { count: 0, bytes: 0 },
    failed: { count: 0, bytes: 0 },
    unavailable: { count: 0, bytes: 0 },
  };
  const account = (ref: BlobRef): void => {
    const b = ref.bytes ?? 0;
    switch (ref.status) {
      case "captured":
        accounting.captured.count++;
        accounting.captured.bytes += b;
        break;
      case "skipped-by-size":
        accounting.skippedBySize.count++;
        accounting.skippedBySize.bytes += b;
        break;
      case "skipped-by-policy":
        accounting.skippedByPolicy.count++;
        accounting.skippedByPolicy.bytes += b;
        break;
      case "failed":
        accounting.failed.count++;
        break;
      case "unavailable":
        accounting.unavailable.count++;
        break;
      default:
        break;
    }
  };

  let inlineTextTotal = 0;
  const inlineBlob = (dir: string, id: string, text: string | undefined, bytes: number | undefined, skipped: boolean | undefined, ext: string, contentType: string): BlobRef => {
    if (skipped) return { status: "skipped-by-size", bytes: bytes ?? 0, reason: `inline text > ${limits.maxInlineTextBytes}` };
    if (text === undefined) return { status: "unavailable", reason: "no text" };
    const buf = Buffer.from(text, "utf8");
    if (inlineTextTotal + buf.byteLength > limits.maxTotalInlineTextBytes) {
      return { status: "skipped-by-size", bytes: buf.byteLength, reason: `total inline text cap ${limits.maxTotalInlineTextBytes}` };
    }
    inlineTextTotal += buf.byteLength;
    const hash = sha256(buf);
    const file = `${dir}/${id}.${short(hash)}.${ext}`;
    sink.add(file, buf);
    return { status: "captured", file, bytes: buf.byteLength, sha256: hash, contentType };
  };
  const networkBlob = (dir: string, id: string, entry: RecordedRequest | undefined, fallbackExt: string): BlobRef => {
    if (!entry) return { status: "unavailable", reason: "no network response observed for this URL" };
    const b = entry.body;
    const ct = entry.headers["content-type"];
    if (b.status === "captured" && b.data) {
      const hash = b.sha256 ?? sha256(b.data);
      const file = `${dir}/${id}.${short(hash)}.${extFor(ct, entry.url, fallbackExt)}`;
      sink.add(file, b.data);
      return { status: "captured", file, bytes: b.bytes ?? b.data.byteLength, sha256: hash, ...(ct ? { contentType: ct.split(";")[0]!.trim() } : {}) };
    }
    return {
      status: b.status,
      ...(b.bytes !== undefined ? { bytes: b.bytes } : {}),
      ...(b.reason ? { reason: b.reason } : {}),
      ...(ct ? { contentType: ct.split(";")[0]!.trim() } : {}),
    };
  };
  const blobFileByNetworkSeq = new Map<number, BlobRef>();

  /* ---- styles ------------------------------------------------------------- */
  const styles: StyleEntry[] = [];
  let styleId = 0;
  let stylesheetBytesTotal = 0;
  let directFetched = 0;
  const linkedNeedingCssom: { entryIndex: number; sheetIndex: number; href: string }[] = [];
  const importQueue: { parentId: string; parentOrder: number; href: string }[] = [];

  for (const sheet of inventory?.sheets ?? []) {
    styleId++;
    const id = pad("st", styleId);
    const hasRuntimeMarker = sheet.runtimeMarkers.length > 0;
    const emptyText = sheet.ownerTag === "style" && !sheet.textSkippedBySize && (sheet.textContent === undefined || sheet.textContent.trim() === "");
    // A <style> WITH text is authored source even when a CSS-in-JS marker sits
    // on it (SSR-extracted emotion/styled-components, Next.js inlined CSS): its
    // text is captured verbatim and, because of the marker, a CSSOM snapshot
    // too. Only an EMPTY <style> is runtime-generated (insertRule-driven).
    const sourceType: StyleEntry["sourceType"] =
      sheet.ownerTag === "link"
        ? "linked"
        : sheet.ownerTag === "style"
          ? emptyText
            ? "cssom-runtime"
            : "style-tag"
          : "adopted";
    const url = sheet.href ?? undefined;
    const red = url ? redactUrl(url) : undefined;
    const sameOrigin = url ? (safeUrl(url)?.origin === pageOrigin) : undefined;
    const netEntry = url ? net.resolve(url, "stylesheet") : undefined;
    const reasons: string[] = [];

    const cssomMethod: StyleEntry["methods"]["cssom"] = sheet.cssom.readable ? ((sheet.cssom.ruleCount ?? 0) > 0 ? "readable" : "empty") : "blocked";
    let authored: BlobRef;
    let styleTagText: StyleEntry["methods"]["styleTagText"] = "not-applicable";
    let networkBody: StyleEntry["methods"]["networkBody"] = "not-applicable";
    let directFetch: StyleEntry["methods"]["directFetch"] = "not-attempted";

    if (sourceType === "linked") {
      const ref = networkBlob("styles", id, netEntry, "css");
      networkBody = ref.status;
      authored = ref;
      if (ref.status === "captured") {
        stylesheetBytesTotal += ref.bytes ?? 0;
        if (netEntry) blobFileByNetworkSeq.set(netEntry.seq, ref);
      } else if (url && args.directFetch && directFetched < limits.maxDirectFetchSheets && (ref.status === "unavailable" || ref.status === "failed")) {
        const host = safeUrl(url)?.hostname ?? "";
        const remaining = limits.maxTotalStylesheetBytes - stylesheetBytesTotal;
        if (remaining <= 0) {
          directFetch = "skipped-by-size";
        } else {
          directFetched++;
          const result = await safeFetchAsset(url, {
            timeoutMs: limits.directFetchTimeoutMs,
            maxBytes: Math.min(limits.maxStylesheetBodyBytes, remaining),
            maxRedirects: 5,
            allowedHosts: new Set([host]),
            expectedKind: "css",
            ...(args.allowPrivateHostPorts ? { allowPrivateHostPorts: args.allowPrivateHostPorts } : {}),
          });
          if (result.status === "fetched" && result.body) {
            directFetch = "fetched";
            const hash = sha256(result.body);
            const file = `styles/${id}.${short(hash)}.css`;
            sink.add(file, result.body);
            authored = { status: "captured", file, bytes: result.body.byteLength, sha256: hash, contentType: result.mime ?? "text/css" };
            stylesheetBytesTotal += result.body.byteLength;
            reasons.push("authored bytes via direct HTTP fetch (network body unavailable)");
          } else {
            directFetch = result.status === "too-large" ? "skipped-by-size" : "failed";
            reasons.push(`direct fetch ${result.status}${result.detail ? `: ${result.detail}` : ""}`);
          }
        }
      } else if (!args.directFetch) {
        directFetch = "skipped-by-policy";
      }
      if (authored.status !== "captured" && sheet.cssom.readable && (sheet.cssom.ruleCount ?? 0) > 0) {
        linkedNeedingCssom.push({ entryIndex: styles.length, sheetIndex: sheet.index, href: url ?? "" });
      }
    } else if (sourceType === "style-tag" || sourceType === "cssom-runtime") {
      if (sheet.textSkippedBySize) {
        styleTagText = "skipped-by-size";
        authored = { status: "skipped-by-size", bytes: sheet.textBytes ?? 0, reason: `style text > ${limits.maxInlineTextBytes}` };
      } else if (emptyText) {
        styleTagText = "empty";
        authored = { status: "unavailable", reason: "style element has no text node (rules inserted via CSSOM)" };
      } else {
        styleTagText = "captured";
        authored = inlineBlob("styles", id, sheet.textContent, sheet.textBytes, false, "css", "text/css");
      }
    } else {
      authored = { status: "unavailable", reason: "adopted/constructed sheet has no authored text" };
    }

    let cssomSerialized: BlobRef | undefined;
    if (sheet.cssomText !== undefined || sheet.cssomTextSkippedBySize) {
      cssomSerialized = inlineBlob("styles", `${id}.cssom`, sheet.cssomText, sheet.cssomTextBytes, sheet.cssomTextSkippedBySize, "css", "text/css");
    }

    for (const href of sheet.importHrefs) importQueue.push({ parentId: id, parentOrder: sheet.index, href });

    const rawBytesAvailable = authored.status === "captured";
    let preservability: Preservability;
    if (sourceType === "linked") {
      const c = classifyPreservability({
        dependencyClass: "CSS",
        sameOrigin,
        scheme: schemeOf(url),
        bodyCaptured: rawBytesAvailable || cssomSerialized?.status === "captured",
        bodyStatus: authored.status,
        ...(netEntry?.failed ? { failed: true } : {}),
      });
      preservability = c.preservability;
      reasons.push(...c.reasons);
      if (!rawBytesAvailable && cssomSerialized?.status === "captured") reasons.push("only a CSSOM-serialized (normalized) copy exists");
    } else if (sourceType === "cssom-runtime") {
      preservability = cssomSerialized?.status === "captured" || rawBytesAvailable ? "PRESERVABLE" : "UNAVAILABLE";
      reasons.push("runtime-generated style (CSS-in-JS marker or CSSOM-only rules); the serialized snapshot is what settled at capture, later state-dependent insertions are not included");
    } else if (sourceType === "style-tag") {
      if (rawBytesAvailable) {
        preservability = (sheet.textContent ?? "").includes("url(") ? "LOCALIZABLE" : "PRESERVABLE";
        reasons.push(preservability === "LOCALIZABLE" ? "authored <style> text captured; url() references need rewriting" : "authored <style> text captured verbatim");
        if (hasRuntimeMarker) reasons.push(`CSS-in-JS/framework marker (${sheet.runtimeMarkers.join(", ")}); a CSSOM snapshot is kept alongside because the runtime may have added rules after the text`);
      } else {
        preservability = "UNAVAILABLE";
        reasons.push("style text not captured");
      }
    } else {
      preservability = cssomSerialized?.status === "captured" ? "STATEFUL_RUNTIME" : "UNAVAILABLE";
      reasons.push("constructed/adopted stylesheet exists only in script memory");
    }
    if (!sheet.cssom.readable) reasons.push(`CSSOM blocked: ${sheet.cssom.error ?? "unknown"}`);

    const entry: StyleEntry = {
      id,
      order: sheet.index,
      sourceType,
      ...(red ? { url: red.url, ...(red.redaction ? { redaction: red.redaction } : {}) } : {}),
      ...(sameOrigin !== undefined ? { sameOrigin } : {}),
      ...(sheet.ownerTag ? { ownerTag: sheet.ownerTag } : {}),
      ...((sheet.mediaAttr ?? "") !== "" ? { media: sheet.mediaAttr! } : sheet.mediaText && sheet.mediaText !== "" ? { media: sheet.mediaText } : {}),
      ...(sheet.title ? { title: sheet.title } : {}),
      disabled: sheet.disabled,
      ...(sourceType === "linked"
        ? { declaredIn: declaredExternal(url, netEntry, initialSets.stylesheetHrefs) }
        : sourceType === "adopted"
          ? { declaredIn: "runtime-injected" as const, declaredInEvidence: "constructed stylesheet; cannot appear in markup" }
          : (() => {
              const d = declaredStyle(sheet.index);
              return { declaredIn: d.declaredIn, declaredInEvidence: d.evidence };
            })()),
      ...(sheet.ownerAttributes ? { ownerAttributes: redactAttributeRecord(sheet.ownerAttributes, base) } : {}),
      ...(sheet.runtimeMarkers.length > 0 ? { runtimeStyleMarkers: sheet.runtimeMarkers } : {}),
      cssom: { ...sheet.cssom },
      ...(netEntry
        ? {
            network: {
              requestId: pad("n", netEntry.seq + 1),
              status: netEntry.status,
              ...(netEntry.headers["content-type"] ? { contentType: netEntry.headers["content-type"].split(";")[0]!.trim() } : {}),
            },
          }
        : {}),
      methods: { cssom: cssomMethod, networkBody, directFetch, styleTagText },
      authored,
      ...(cssomSerialized ? { cssomSerialized } : {}),
      rawBytesAvailable,
      preservability,
      reasons,
    };
    account(authored);
    if (cssomSerialized) account(cssomSerialized);
    styles.push(entry);
  }

  // Second in-page pass: CSSOM-serialize LINKED sheets that yielded no bytes.
  if (linkedNeedingCssom.length > 0 && args.page) {
    try {
      await installBrowserNameShim(args.page);
      const results = await args.page.evaluate(serializeSheetsInBrowser, {
        indices: linkedNeedingCssom.map((x) => x.sheetIndex),
        maxRules: limits.maxRulesPerSheet,
        maxBytes: limits.maxInlineTextBytes,
      });
      const SHEET_LIST_CHANGED = "document.styleSheets changed between the two in-page passes; at least one CSSOM serialization was rejected rather than misattributed";
      for (const r of results) {
        const target = linkedNeedingCssom.find((x) => x.sheetIndex === r.index);
        if (!target) continue;
        const entry = styles[target.entryIndex]!;
        // Review M5: the index was recorded by the FIRST pass; a CSS-in-JS
        // runtime inserting or removing a sheet in between shifts the list.
        // Accept only a sheet whose href is the one this entry names.
        if (!r.error && stripHash(r.href ?? "") !== stripHash(target.href)) {
          const ref: BlobRef = { status: "unavailable", reason: `index ${r.index} now names ${r.href ? "another sheet" : "an owner-less sheet"} (${r.ownerTag ?? "no owner"}); serialization rejected` };
          entry.cssomSerialized = ref;
          account(ref);
          if (!limitations.includes(SHEET_LIST_CHANGED)) limitations.push(SHEET_LIST_CHANGED);
          continue;
        }
        const ref = r.error
          ? ({ status: "unavailable", reason: r.error } as BlobRef)
          : inlineBlob("styles", `${entry.id}.cssom`, r.text, r.bytes, r.skippedBySize, "css", "text/css");
        entry.cssomSerialized = ref;
        account(ref);
        if (ref.status === "captured") {
          entry.reasons.push("only a CSSOM-serialized (normalized) copy exists");
          if (entry.preservability === "UNAVAILABLE") entry.preservability = "LOCALIZABLE";
        }
      }
    } catch (err) {
      limitations.push(`CSSOM serialization pass failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // @import children: not in document.styleSheets; their bodies are on the wire.
  for (const imp of importQueue) {
    styleId++;
    const id = pad("st", styleId);
    const red = redactUrl(imp.href);
    const netEntry = net.resolve(imp.href, "stylesheet");
    const ref = networkBlob("styles", id, netEntry, "css");
    if (ref.status === "captured" && netEntry) {
      stylesheetBytesTotal += ref.bytes ?? 0;
      blobFileByNetworkSeq.set(netEntry.seq, ref);
    }
    account(ref);
    const sameOrigin = safeUrl(imp.href)?.origin === pageOrigin;
    const c = classifyPreservability({ dependencyClass: "CSS", sameOrigin, scheme: schemeOf(imp.href), bodyCaptured: ref.status === "captured", bodyStatus: ref.status });
    styles.push({
      id,
      order: imp.parentOrder,
      sourceType: "import",
      url: red.url,
      ...(red.redaction ? { redaction: red.redaction } : {}),
      sameOrigin,
      disabled: false,
      declaredIn: "initial-document",
      cssom: { readable: false, error: `@import child of ${imp.parentId}; its rules are counted in the parent's CSSOM summary` },
      ...(netEntry ? { network: { requestId: pad("n", netEntry.seq + 1), status: netEntry.status } } : {}),
      methods: { cssom: "not-applicable", networkBody: ref.status, directFetch: "not-attempted", styleTagText: "not-applicable" },
      authored: ref,
      rawBytesAvailable: ref.status === "captured",
      preservability: c.preservability,
      reasons: [`@import from ${imp.parentId}`, ...c.reasons],
    });
  }

  /* ---- scripts ------------------------------------------------------------- */
  const scripts: ScriptEntry[] = [];
  const matchedScriptSeqs = new Set<number>();
  let scriptId = 0;
  for (const s of inventory?.scripts ?? []) {
    scriptId++;
    const id = pad("sc", scriptId);
    const inline = s.src === null;
    const t = (s.typeAttr ?? "").trim().toLowerCase();
    const kind: ScriptEntry["kind"] = t === "module" ? "module" : s.nomodule ? "nomodule" : "classic";
    const red = s.src ? redactUrl(s.src) : undefined;
    const sameOrigin = s.src ? safeUrl(s.src)?.origin === pageOrigin : undefined;
    const netEntry = s.src ? net.resolve(s.src, "script") : undefined;
    if (netEntry) matchedScriptSeqs.add(netEntry.seq);
    const host = s.src ? safeUrl(s.src)?.hostname ?? "" : "";
    const provider = host ? matchProvider(host, safeUrl(s.src!)?.pathname) : undefined;
    let body: BlobRef;
    if (inline) body = inlineBlob("scripts", id, s.text, s.textBytes, s.textSkippedBySize, "js", "text/javascript");
    else {
      body = networkBlob("scripts", id, netEntry, "js");
      if (netEntry && body.status === "captured") blobFileByNetworkSeq.set(netEntry.seq, body);
    }
    account(body);
    const c = classifyPreservability({
      dependencyClass: "JS_CHUNK",
      sameOrigin,
      scheme: inline ? "none" : schemeOf(s.src!),
      bodyCaptured: body.status === "captured",
      bodyStatus: body.status,
      ...(provider ? { providerHint: provider.hint } : {}),
      ...(netEntry?.failed ? { failed: true } : {}),
    });
    scripts.push({
      id,
      order: s.order,
      inline,
      ...(red ? { src: red.url, ...(red.redaction ? { redaction: red.redaction } : {}) } : {}),
      ...(sameOrigin !== undefined ? { sameOrigin } : {}),
      kind,
      ...(s.typeAttr !== null ? { typeAttr: s.typeAttr } : {}),
      async: s.async,
      defer: s.defer,
      ...(s.crossorigin !== null ? { crossorigin: s.crossorigin } : {}),
      ...(s.integrity !== null ? { integrity: s.integrity } : {}),
      ...(s.referrerpolicy !== null ? { referrerpolicy: s.referrerpolicy } : {}),
      nonceUsed: s.nonceUsed,
      declaredIn: inline ? declaredInline(s.text, initialSets.inlineScriptHashes) : declaredExternal(s.src!, netEntry, initialSets.scriptSrcs),
      ...(netEntry
        ? {
            network: {
              requestId: pad("n", netEntry.seq + 1),
              status: netEntry.status,
              ...(netEntry.headers["content-type"] ? { contentType: netEntry.headers["content-type"].split(";")[0]!.trim() } : {}),
              ...(netEntry.initiator ? { initiatorType: netEntry.initiator.type, ...(netEntry.initiator.url ? { initiatorUrl: redactUrl(netEntry.initiator.url).url } : {}) } : {}),
              loaded: netEntry.status !== null && netEntry.status >= 200 && netEntry.status < 300 && !netEntry.failed,
            },
          }
        : {}),
      body,
      downloadable: body.status === "captured",
      executionIndependence: "unknown",
      dependencyClass: "JS_CHUNK",
      thirdParty: sameOrigin === false,
      ...(provider ? { providerHint: provider.hint } : {}),
      preservability: inline && body.status === "captured" ? "UNKNOWN" : c.preservability,
      reasons: inline ? ["inline script text captured; execution independence unknown"] : c.reasons,
    });
  }
  // Runtime-loaded chunks: script responses in the main frame with no DOM element.
  const runtimeChunks = network.entries
    .filter((e) => e.frame === "main" && !e.navigation && !matchedScriptSeqs.has(e.seq) && (e.resourceType === "script" || /javascript|ecmascript/.test(e.headers["content-type"] ?? "")) && !(e.status !== null && e.status >= 300 && e.status < 400))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : a.seq - b.seq));
  for (const e of runtimeChunks) {
    scriptId++;
    const id = pad("sc", scriptId);
    const red = redactUrl(e.url);
    const sameOrigin = safeUrl(e.url)?.origin === pageOrigin;
    const host = safeUrl(e.url)?.hostname ?? "";
    const provider = host ? matchProvider(host, safeUrl(e.url)?.pathname) : undefined;
    const body = networkBlob("scripts", id, e, "js");
    if (body.status === "captured") blobFileByNetworkSeq.set(e.seq, body);
    account(body);
    const c = classifyPreservability({ dependencyClass: "JS_CHUNK", sameOrigin, scheme: schemeOf(e.url), bodyCaptured: body.status === "captured", bodyStatus: body.status, ...(provider ? { providerHint: provider.hint } : {}), ...(e.failed ? { failed: true } : {}) });
    const initiatorNote = e.initiator ? `initiator ${e.initiator.type}${e.initiator.stackTopUrl ? ` (${redactUrl(e.initiator.stackTopUrl).url})` : e.initiator.url ? ` (${redactUrl(e.initiator.url).url})` : ""}` : "initiator unknown";
    scripts.push({
      id,
      inline: false,
      src: red.url,
      ...(red.redaction ? { redaction: red.redaction } : {}),
      sameOrigin,
      kind: "other",
      async: false,
      defer: false,
      nonceUsed: false,
      declaredIn: "runtime-loaded",
      network: {
        requestId: pad("n", e.seq + 1),
        status: e.status,
        ...(e.headers["content-type"] ? { contentType: e.headers["content-type"].split(";")[0]!.trim() } : {}),
        ...(e.initiator ? { initiatorType: e.initiator.type, ...(e.initiator.url ? { initiatorUrl: redactUrl(e.initiator.url).url } : {}) } : {}),
        loaded: e.status !== null && e.status >= 200 && e.status < 300 && !e.failed,
      },
      body,
      downloadable: body.status === "captured",
      executionIndependence: "unknown",
      dependencyClass: "JS_CHUNK",
      thirdParty: !sameOrigin,
      ...(provider ? { providerHint: provider.hint } : {}),
      preservability: c.preservability,
      reasons: [`not in the runtime DOM at capture; loaded by ${initiatorNote} (dynamic import or transient script element)`, ...c.reasons],
    });
  }

  /* ---- config --------------------------------------------------------------- */
  const config: ConfigEntry[] = [];
  let configId = 0;
  const nextId = (): string => pad("cf", ++configId);
  const jsonScriptIds: string[] = [];
  for (const d of inventory?.dataScripts ?? []) {
    const id = nextId();
    const t = d.typeAttr;
    const kind: ConfigEntry["kind"] =
      t === "application/json" && d.id === "__NEXT_DATA__"
        ? "next-data"
        : t === "application/json"
          ? "json-script"
          : t === "application/ld+json"
            ? "ld-json"
            : t === "importmap"
              ? "importmap"
              : t === "speculationrules"
                ? "speculationrules"
                : "data-script";
    if (d.id) jsonScriptIds.push(d.id);
    let parseable: boolean | undefined;
    if (d.text !== undefined && (kind === "next-data" || kind === "json-script" || kind === "ld-json" || kind === "importmap" || kind === "speculationrules")) {
      try {
        JSON.parse(d.text);
        parseable = true;
      } catch {
        parseable = false;
      }
    }
    const isJson = kind !== "data-script";
    const redactedCopy = isJson && d.text !== undefined ? redactJsonText(d.text) : { text: d.text, redactedKeys: [] as string[] };
    const body = inlineBlob("config", id, redactedCopy.text, d.textBytes, d.textSkippedBySize, isJson ? "json" : "txt", isJson ? "application/json" : "text/plain");
    account(body);
    const preservability: Preservability = kind === "ld-json" ? "PRESERVABLE" : kind === "importmap" ? "LOCALIZABLE" : kind === "data-script" ? "UNKNOWN" : "ORIGIN_BOUND";
    config.push({
      id,
      kind,
      ...(d.id ? { name: d.id } : {}),
      typeAttr: t,
      declaredIn: declaredInline(d.text, initialSets.inlineScriptHashes),
      ...(parseable !== undefined ? { parseable } : {}),
      ...(redactedCopy.redactedKeys.length > 0 ? { redactedKeys: redactedCopy.redactedKeys } : {}),
      body,
      preservability,
      reasons: [
        kind === "next-data" ? "Next.js page data: props/build id tied to the source build and origin" : kind === "json-script" ? "page-delivered JSON blob; consumer unknown" : kind === "ld-json" ? "structured data (static)" : kind === "importmap" ? "import map: specifier→URL, rewritable" : kind === "speculationrules" ? "prefetch/prerender rules bound to origin URLs" : `non-JS script type ${t}`,
        redactedCopy.redactedKeys.length > 0
          ? "copy of the served script text with secret-shaped keys redacted (the raw document keeps its exact bytes)"
          : "text stored verbatim: it is part of the served document",
      ],
    });
  }
  for (const g of inventory?.windowGlobals ?? []) {
    const id = nextId();
    const twin = config.find((c) => c.name === g.name && (c.kind === "next-data" || c.kind === "json-script"));
    let body: BlobRef | undefined;
    if (twin) body = { status: "not-applicable", reason: `same evidence as ${twin.id} (script tag)` };
    else if (!g.serializable) body = { status: "unavailable", reason: "value not JSON-serializable" };
    else body = inlineBlob("config", id, g.json, g.bytes, g.skippedBySize, "json", "application/json");
    account(body);
    config.push({
      id,
      kind: "window-global",
      name: g.name,
      declaredIn: twin ? twin.declaredIn : "unknown",
      ...(g.redactedKeys.length > 0 ? { redactedKeys: g.redactedKeys } : {}),
      body,
      preservability: "ORIGIN_BOUND",
      reasons: [`window.${g.name} (${g.valueType}) present at capture; hydration/bootstrap state bound to the source runtime`],
    });
  }
  const rootData = (name: string, attrs: Record<string, string>): void => {
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(attrs)) if (k.startsWith("data-")) data[k] = v;
    if (Object.keys(data).length === 0) return;
    config.push({ id: nextId(), kind: "root-data-attributes", name, attributes: redactAttributeRecord(data, base), declaredIn: "unknown", preservability: "PRESERVABLE", reasons: [`data-* attributes on <${name}> at capture (static markup evidence)`] });
  };
  if (inventory) {
    rootData("html", inventory.htmlAttributes);
    rootData("body", inventory.bodyAttributes);
    if (inventory.metaGenerator) config.push({ id: nextId(), kind: "meta-generator", name: inventory.metaGenerator, declaredIn: "unknown", preservability: "PRESERVABLE", reasons: ["<meta name=generator>"] });
    if (inventory.baseHref) {
      const abs = safeUrl(inventory.baseHref, base)?.href ?? inventory.baseHref;
      const red = redactUrl(abs);
      const so = safeUrl(abs)?.origin === pageOrigin;
      config.push({ id: nextId(), kind: "base-href", url: red.url, ...(red.redaction ? { redaction: red.redaction } : {}), declaredIn: "unknown", preservability: so ? "PRESERVABLE" : "ORIGIN_BOUND", reasons: [so ? "<base href> within the page origin" : "<base href> points at another origin"] });
    }
    for (const l of inventory.links) {
      const rels = l.rel.split(/\s+/);
      const kind: ConfigEntry["kind"] | null = rels.includes("modulepreload") ? "modulepreload-link" : rels.includes("preload") ? "preload-link" : rels.includes("manifest") ? "manifest-link" : null;
      if (!kind || !l.href) continue;
      const red = redactUrl(l.href);
      config.push({
        id: nextId(),
        kind,
        url: red.url,
        ...(red.redaction ? { redaction: red.redaction } : {}),
        attributes: { rel: l.rel, ...(l.as ? { as: l.as } : {}), ...(l.type ? { type: l.type } : {}), ...(l.media ? { media: l.media } : {}), ...(l.crossorigin !== null ? { crossorigin: l.crossorigin } : {}) },
        declaredIn: initialWitness ? ((kind === "modulepreload-link" ? initialWitness.modulepreloadHrefs : initialWitness.preloadHrefs).map(stripHash).includes(stripHash(l.href)) ? "initial-document" : kind === "manifest-link" ? "unknown" : "runtime-injected") : "unknown",
        preservability: "LOCALIZABLE",
        reasons: [`<link rel=${l.rel}>; URL rewritable`],
      });
    }
  }

  /* ---- assets ----------------------------------------------------------------- */
  const assetsRaw: Omit<AssetEntry, "id">[] = [];
  const seenAsset = new Set<string>();
  const pushAsset = (a: Omit<AssetEntry, "id">): void => {
    const key = `${a.kind}|${a.url ?? ""}|${a.elementPath ?? ""}`;
    if (seenAsset.has(key)) return;
    if (assetsRaw.length >= limits.maxInventoryEntries * 4) return;
    seenAsset.add(key);
    assetsRaw.push(a);
  };
  const assetFor = (kind: AssetKind, rawUrl: string | undefined, dependencyClass: DependencyClass, extra: Partial<Omit<AssetEntry, "id" | "kind" | "dependencyClass" | "preservability" | "reasons" | "thirdParty">> & { reasons?: string[] }): void => {
    const abs = rawUrl !== undefined && rawUrl !== "" ? (schemeOf(rawUrl) === "relative-unresolved" ? safeUrl(rawUrl, base)?.href ?? rawUrl : rawUrl) : undefined;
    const scheme = schemeOf(abs);
    const isHttp = scheme === "http" || scheme === "https";
    const red = abs && isHttp ? redactUrl(abs) : undefined;
    const u = abs && isHttp ? safeUrl(abs) : null;
    const sameOrigin = u ? u.origin === pageOrigin : undefined;
    const netEntry = abs && isHttp ? net.resolve(abs) : undefined;
    const provider = u ? matchProvider(u.hostname, u.pathname) : undefined;
    let cls = dependencyClass;
    if (kind === "image" && (u?.pathname.toLowerCase().endsWith(".svg") || (netEntry?.headers["content-type"] ?? "").startsWith("image/svg"))) kind = "svg-external";
    const c = classifyPreservability({
      dependencyClass: cls,
      sameOrigin,
      scheme,
      bodyCaptured: false,
      ...(provider ? { providerHint: provider.hint } : {}),
      ...(netEntry?.failed ? { failed: true } : {}),
      ...(netEntry && netEntry.status !== null ? { httpOk: netEntry.status >= 200 && netEntry.status < 300 } : {}),
    });
    const { reasons: extraReasons, ...rest } = extra;
    // Review B1: attribute records (srcset, currentSrc, poster, data-*) and
    // the owning sheet's href are persisted only after redaction.
    if (rest.attributes) rest.attributes = redactAttributeRecord(rest.attributes, base);
    if (rest.sheetHref) rest.sheetHref = redactUrlText(rest.sheetHref, base);
    pushAsset({
      kind,
      ...(red ? { url: red.url, ...(red.redaction ? { redaction: red.redaction } : {}) } : abs && scheme === "data" ? { url: `data:${dataUrlInfo(abs).mediaType};…` } : abs ? { url: abs.slice(0, 500) } : {}),
      scheme,
      ...(sameOrigin !== undefined ? { sameOrigin } : {}),
      ...(u ? { host: u.hostname } : {}),
      ...(abs && scheme === "data" ? { dataUrl: dataUrlInfo(abs) } : {}),
      ...rest,
      ...(netEntry
        ? {
            network: {
              requestId: pad("n", netEntry.seq + 1),
              status: netEntry.status,
              ...(netEntry.headers["content-type"] ? { contentType: netEntry.headers["content-type"].split(";")[0]!.trim() } : {}),
              ...(Number.isFinite(Number.parseInt(netEntry.headers["content-length"] ?? "", 10)) ? { bytes: Number.parseInt(netEntry.headers["content-length"]!, 10) } : netEntry.body.bytes !== undefined ? { bytes: netEntry.body.bytes } : {}),
            },
          }
        : {}),
      ...(provider ? { providerHint: provider.hint } : {}),
      dependencyClass: cls,
      thirdParty: sameOrigin === false,
      preservability: c.preservability,
      reasons: [...(extraReasons ?? []), ...c.reasons],
    });
  };

  if (inventory) {
    for (const img of inventory.images) {
      const attributes: Record<string, string> = {};
      for (const [k, v] of Object.entries({ srcset: img.srcset, sizes: img.sizes, loading: img.loading, decoding: img.decoding, fetchpriority: img.fetchpriority, width: img.width, height: img.height })) if (v !== null) attributes[k] = v.slice(0, 2000);
      if (img.currentSrc) attributes.currentSrc = img.currentSrc.slice(0, 2000);
      attributes.naturalWidth = String(img.naturalWidth);
      attributes.naturalHeight = String(img.naturalHeight);
      attributes.complete = String(img.complete);
      assetFor("image", img.src ?? img.currentSrc, "IMAGE", { elementPath: img.path, attributes });
      if (img.srcset) for (const c of parseSrcset(img.srcset, base)) assetFor("srcset-candidate", c.url, "IMAGE", { elementPath: img.path, attributes: { ...(c.descriptor ? { descriptor: c.descriptor } : {}), ...(img.sizes ? { sizes: img.sizes } : {}) } });
      for (const s of img.pictureSources) {
        const list = s.srcset ? parseSrcset(s.srcset, base) : s.src ? [{ url: safeUrl(s.src, base)?.href ?? s.src }] : [];
        for (const c of list) assetFor("picture-source", c.url, "IMAGE", { elementPath: img.path, attributes: { ...(c.descriptor ? { descriptor: c.descriptor } : {}), ...(s.type ? { type: s.type } : {}), ...(s.media ? { media: s.media } : {}), ...(s.sizes ? { sizes: s.sizes } : {}) } });
      }
    }
    for (const ci of inventory.cssImages) for (const u of ci.urls) assetFor(ci.property, u, "IMAGE", { elementPath: ci.path });
    for (const sheet of inventory.sheets) {
      for (const face of sheet.fontFaces) {
        const parsed = parseFontSrc(face.src, face.sheetHref ?? base);
        const attributes: Record<string, string> = { family: face.family, srcRaw: redactCssUrls(face.src, face.sheetHref ?? base).slice(0, 2000), localSources: String(parsed.local) };
        if (face.weight) attributes.weight = face.weight;
        if (face.style) attributes.style = face.style;
        if (face.display) attributes.display = face.display;
        if (face.unicodeRange) attributes.unicodeRange = face.unicodeRange;
        for (const u of parsed.urls) assetFor("font-face", u, "FONT", { attributes, ...(face.sheetHref ? { sheetHref: face.sheetHref } : {}) });
      }
    }
    const fontFaceUrls = new Set(assetsRaw.filter((a) => a.kind === "font-face").map((a) => stripHash(a.url ?? "")));
    for (const e of network.entries) {
      if (e.frame !== "main") continue;
      const isFont = e.resourceType === "font" || (e.headers["content-type"] ?? "").startsWith("font/");
      if (!isFont || fontFaceUrls.has(stripHash(e.url))) continue;
      assetFor("font-loaded", e.url, "FONT", { reasons: ["font response observed without a matching readable @font-face (blocked sheet or CSS-in-JS)"] });
    }
    for (const m of inventory.media) {
      const attributes: Record<string, string> = { autoplay: String(m.autoplay), muted: String(m.muted), loop: String(m.loop), playsinline: String(m.playsinline), controls: String(m.controls) };
      if (m.preload !== null) attributes.preload = m.preload;
      if (m.width !== null) attributes.width = m.width;
      if (m.height !== null) attributes.height = m.height;
      if (m.currentSrc) attributes.currentSrc = m.currentSrc.slice(0, 2000);
      assetFor(m.tag, m.src ?? m.currentSrc, "MEDIA", { elementPath: m.path, attributes });
      for (const s of m.sources) assetFor(m.tag === "video" ? "video-source" : "audio-source", s.src ?? undefined, "MEDIA", { elementPath: m.path, attributes: { ...(s.type ? { type: s.type } : {}), ...(s.media ? { media: s.media } : {}) } });
      if (m.tag === "video" && m.poster) assetFor("video-poster", m.poster, "IMAGE", { elementPath: m.path });
    }
    for (const f of inventory.frames) {
      const embed = classifyEmbedUrl(f.src ?? undefined, pageOrigin);
      const attributes: Record<string, string> = {};
      for (const [k, v] of Object.entries({ loading: f.loading, allow: f.allow, sandbox: f.sandbox, referrerpolicy: f.referrerpolicy, width: f.width, height: f.height })) if (v !== null) attributes[k] = v.slice(0, 500);
      if (f.srcdocBytes !== undefined) attributes.srcdocBytes = String(f.srcdocBytes);
      const abs = f.src ?? undefined;
      const scheme = schemeOf(abs);
      const red = abs && (scheme === "http" || scheme === "https") ? redactUrl(abs) : undefined;
      const u = red ? safeUrl(red.url) : null;
      pushAsset({
        kind: "iframe",
        ...(red ? { url: red.url, ...(red.redaction ? { redaction: red.redaction } : {}) } : abs ? { url: abs.slice(0, 500) } : {}),
        scheme,
        ...(u ? { sameOrigin: u.origin === pageOrigin, host: u.hostname } : {}),
        elementPath: f.path,
        attributes,
        ...(embed.providerHint ? { providerHint: embed.providerHint } : {}),
        dependencyClass: embed.dependencyClass,
        thirdParty: u ? u.origin !== pageOrigin : false,
        preservability: embed.preservability,
        reasons: embed.reasons,
      });
    }
    for (const u of inventory.svg.uses) assetFor("svg-use", u.href, "IMAGE", { elementPath: u.path, reasons: ["<use> references an external SVG file"] });
    for (const o of inventory.svg.objects) assetFor("object-embed", o.url, "STATIC_ASSET", { elementPath: o.path, attributes: { tag: o.tag, ...(o.type ? { type: o.type } : {}) } });
    for (const l of inventory.links) {
      const rels = l.rel.split(/\s+/);
      if (!l.href || !rels.some((r) => r.includes("icon"))) continue;
      assetFor("link", l.href, "STATIC_ASSET", { attributes: { rel: l.rel, ...(l.sizes ? { sizes: l.sizes } : {}), ...(l.type ? { type: l.type } : {}) } });
    }
  }
  const KIND_ORDER: AssetKind[] = ["image", "srcset-candidate", "picture-source", "background-image", "mask-image", "svg-external", "svg-use", "object-embed", "font-face", "font-loaded", "video", "video-source", "video-poster", "audio", "audio-source", "iframe", "link"];
  assetsRaw.sort((a, b) => {
    const ka = KIND_ORDER.indexOf(a.kind);
    const kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    const ua = a.url ?? "";
    const ub = b.url ?? "";
    if (ua !== ub) return ua < ub ? -1 : 1;
    const pa = a.elementPath ?? "";
    const pb = b.elementPath ?? "";
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });
  const assets: AssetEntry[] = assetsRaw.map((a, i) => ({ id: pad("as", i + 1), ...a }));

  /* ---- network ---------------------------------------------------------------- */
  const networkEntries: NetworkEntry[] = [];
  for (const e of network.entries) {
    const u = safeUrl(e.url);
    const sameOrigin = u ? u.origin === pageOrigin : false;
    const classified = classifyRequest({ url: e.url, resourceType: e.resourceType, contentType: e.headers["content-type"], sameOrigin, pageHost: safeUrl(finalUrl)?.hostname ?? "", frame: e.frame, navigation: e.navigation, method: e.method });
    const red = redactUrl(e.url, classified.dropQuery);
    const existing = blobFileByNetworkSeq.get(e.seq);
    let body: BlobRef;
    if (existing) body = existing;
    else if (e.body.status === "captured" && e.body.data) {
      body = networkBlob("network", pad("n", e.seq + 1), e, "bin");
      account(body);
    } else {
      body = { status: e.body.status, ...(e.body.bytes !== undefined ? { bytes: e.body.bytes } : {}), ...(e.body.reason ? { reason: e.body.reason } : {}), ...(e.headers["content-type"] ? { contentType: e.headers["content-type"].split(";")[0]!.trim() } : {}) };
      if (e.body.status === "skipped-by-size" || e.body.status === "skipped-by-policy" || e.body.status === "unavailable" || e.body.status === "failed") {
        // Bodies not owned by a style/script entry are accounted here once.
        if (!(e.resourceType === "stylesheet" || e.resourceType === "script")) account(body);
      }
    }
    const c = classifyPreservability({
      dependencyClass: classified.dependencyClass,
      sameOrigin,
      scheme: schemeOf(e.url),
      bodyCaptured: body.status === "captured" || (classified.dependencyClass === "DOCUMENT" && input.initialDocument.status === "captured"),
      bodyStatus: body.status,
      ...(classified.providerHint ? { providerHint: classified.providerHint } : {}),
      frame: e.frame,
      ...(e.failed ? { failed: true } : {}),
      ...(e.status !== null ? { httpOk: e.status >= 200 && e.status < 300 } : {}),
    });
    networkEntries.push({
      id: pad("n", e.seq + 1),
      seq: e.seq,
      url: red.url,
      ...(red.redaction ? { redaction: red.redaction } : {}),
      method: e.method,
      resourceType: e.resourceType,
      frame: e.frame,
      ...(e.frameUrl ? { frameOrigin: safeUrl(e.frameUrl)?.origin ?? "" } : {}),
      navigation: e.navigation,
      sameOrigin,
      host: u?.hostname ?? "",
      ...(e.redirectedFrom ? { redirectedFrom: redactUrl(e.redirectedFrom, classified.dropQuery).url } : {}),
      status: e.status,
      ...(e.statusText ? { statusText: e.statusText } : {}),
      ok: e.status !== null && e.status >= 200 && e.status < 300 && !e.failed,
      ...(e.failed ? { failed: e.failed } : {}),
      ...(e.streamAborted ? { streamAborted: e.streamAborted } : {}),
      fromServiceWorker: e.fromServiceWorker,
      // Review B1: `location` is a URL (redirect target, often a beacon with its full query).
      headers: e.headers.location ? { ...e.headers, location: redactUrl(e.headers.location, classified.dropQuery).url } : e.headers,
      hasPostData: e.hasPostData,
      ...(e.postDataBytes !== undefined ? { postDataBytes: e.postDataBytes } : {}),
      ...(e.initiator ? { initiator: redactInitiator(e.initiator) } : {}),
      timing: { startedAtMs: e.startedAtMs, ...(e.responseEndMs !== undefined ? { responseEndMs: e.responseEndMs } : {}) },
      dependencyClass: classified.dependencyClass,
      thirdParty: classified.thirdParty,
      ...(classified.providerHint ? { providerHint: classified.providerHint } : {}),
      apiLike: classified.apiLike,
      preservability: c.preservability,
      reasons: [...classified.reasons, ...c.reasons],
      body,
    });
  }
  networkEntries.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : a.method < b.method ? -1 : a.method > b.method ? 1 : a.seq - b.seq));

  /* ---- counts ---------------------------------------------------------------- */
  const byPres: Record<string, number> = {};
  const bump = (rec: Record<string, number>, key: string): void => {
    rec[key] = (rec[key] ?? 0) + 1;
  };
  for (const s of styles) bump(byPres, s.preservability);
  for (const s of scripts) bump(byPres, s.preservability);
  for (const a of assets) bump(byPres, a.preservability);
  for (const n of networkEntries) bump(byPres, n.preservability);
  for (const c of config) bump(byPres, c.preservability);
  const assetCounts: Record<string, number> = {};
  for (const a of assets) bump(assetCounts, a.kind);
  const configCounts: Record<string, number> = {};
  for (const c of config) bump(configCounts, c.kind);
  const byClass: Record<string, number> = {};
  for (const n of networkEntries) bump(byClass, n.dependencyClass);
  const sum = (arr: readonly (number | undefined)[]): number => arr.reduce<number>((acc, v) => acc + (v ?? 0), 0);

  const counts: SourcePackageManifest["counts"] = {
    styles: {
      total: styles.length,
      linked: styles.filter((s) => s.sourceType === "linked").length,
      styleTags: styles.filter((s) => s.sourceType === "style-tag").length,
      cssomRuntime: styles.filter((s) => s.sourceType === "cssom-runtime").length,
      adopted: styles.filter((s) => s.sourceType === "adopted").length,
      rawBytesCaptured: styles.filter((s) => s.rawBytesAvailable).length,
      cssomSerializedCaptured: styles.filter((s) => s.cssomSerialized?.status === "captured").length,
      unavailable: styles.filter((s) => s.preservability === "UNAVAILABLE").length,
      crossOrigin: styles.filter((s) => s.sameOrigin === false).length,
      cssomBlocked: styles.filter((s) => s.sourceType !== "import" && !s.cssom.readable).length,
      directFetched: styles.filter((s) => s.methods.directFetch === "fetched").length,
      mediaRules: sum(styles.map((s) => s.cssom.mediaRules)),
      containerRules: sum(styles.map((s) => s.cssom.containerRules)),
      supportsRules: sum(styles.map((s) => s.cssom.supportsRules)),
      customPropertyDeclarations: sum(styles.map((s) => s.cssom.customPropertyDeclarations)),
    },
    scripts: {
      total: scripts.length,
      documentDeclared: scripts.filter((s) => s.declaredIn === "initial-document").length,
      runtimeInjected: scripts.filter((s) => s.declaredIn === "runtime-injected").length,
      runtimeLoadedChunks: scripts.filter((s) => s.declaredIn === "runtime-loaded").length,
      inline: scripts.filter((s) => s.inline).length,
      external: scripts.filter((s) => !s.inline).length,
      module: scripts.filter((s) => s.kind === "module").length,
      classic: scripts.filter((s) => s.kind === "classic").length,
      responsesCaptured: scripts.filter((s) => !s.inline && s.body.status === "captured").length,
      unavailable: scripts.filter((s) => !s.inline && (s.body.status === "unavailable" || s.body.status === "failed")).length,
      skippedBySize: scripts.filter((s) => s.body.status === "skipped-by-size").length,
    },
    assets: assetCounts,
    network: {
      total: networkEntries.length,
      overflowNotRecorded: network.stats.overflowNotRecorded,
      byClass,
      sameOrigin: networkEntries.filter((n) => n.sameOrigin).length,
      thirdParty: networkEntries.filter((n) => n.thirdParty).length,
      apiLike: networkEntries.filter((n) => n.apiLike).length,
      bodiesCaptured: networkEntries.filter((n) => n.body.status === "captured").length,
      failed: networkEntries.filter((n) => n.failed !== undefined).length,
      childFrame: networkEntries.filter((n) => n.frame === "child").length,
    },
    config: configCounts,
    byPreservability: byPres,
  };

  /* ---- limitations & framework evidence ------------------------------------------ */
  if (network.stats.overflowNotRecorded > 0) limitations.push(`network entries capped at ${limits.maxNetworkEntries}; ${network.stats.overflowNotRecorded} request(s) not recorded`);
  if (inventory?.caps.elementWalkCapHit) limitations.push(`background/mask-image walk capped at ${limits.maxElementsWalked} elements`);
  if ((inventory?.caps.shadowRoots ?? 0) > 0) limitations.push(`${inventory!.caps.shadowRoots} open shadow root(s) on host elements: shadow trees are not traversed — their styles, assets and markup are not in the package, and the runtime DOM snapshot (page.content()) does not serialize them; closed shadow roots are not even counted`);
  if ((inventory?.adoptedSheetCount ?? 0) > 0) limitations.push(`${inventory!.adoptedSheetCount} constructed (adopted) stylesheet(s) captured as CSSOM snapshots only; they have no authored source by definition`);
  for (const hit of inventory?.caps.inventoryCapHits ?? []) limitations.push(`inventory cap hit: ${hit} (${limits.maxInventoryEntries})`);
  if (styles.some((s) => s.cssom.walkCapHit)) limitations.push(`CSSOM rule walk capped at ${limits.maxRulesPerSheet} rules on at least one sheet`);
  if (network.initiatorEvidence === "cdp-unavailable") limitations.push(`initiator evidence unavailable${network.initiatorReason ? `: ${network.initiatorReason}` : ""}`);
  limitations.push("runtime DOM snapshot carries no event listeners, JS state or CSSOM mutations after serialization");
  limitations.push("scripts marked downloadable were obtained as bytes only; execution independence is unknown until Phase 3");
  limitations.push("the initial document is stored as served; page-delivered public tokens inside it are not redacted (raw bytes must stay hash-exact)");
  limitations.push(
    bodyPolicy.json
      ? "API/data request BODIES are never captured (only metadata and endpoint classification); eligible JSON RESPONSE bodies are captured as evidence within the JSON caps, but nothing downstream replays or mocks from them"
      : "API/data and JSON response bodies are never captured (bodyPolicy.json=false); only metadata and endpoint classification",
  );
  if (!bodyPolicy.font) limitations.push("font/image/media bodies are inventory-only by policy (no download in Phase 1)");

  const frameworkEvidence = detectFrameworks({
    scriptSrcs: scripts.map((s) => s.src ?? ""),
    styleMarkers: styles.flatMap((s) => s.runtimeStyleMarkers ?? []),
    windowGlobals: (inventory?.windowGlobals ?? []).map((g) => g.name),
    rootAttributeNames: [...Object.keys(inventory?.htmlAttributes ?? {}), ...Object.keys(inventory?.bodyAttributes ?? {})],
    ...(inventory?.metaGenerator ? { metaGenerator: inventory.metaGenerator } : {}),
    jsonScriptIds,
    elementTagNames: inventory?.tagNames ?? [],
  });

  /* ---- content hash ------------------------------------------------------------------ */
  const hashLines: string[] = [];
  if (input.initialDocument.sha256) hashLines.push(`document\t${input.initialDocument.sha256}`);
  for (const s of styles) if (s.authored.sha256) hashLines.push(`${s.url ?? s.id}\t${s.authored.sha256}`);
  for (const s of scripts) if (s.body.sha256) hashLines.push(`${s.src ?? s.id}\t${s.body.sha256}`);
  hashLines.sort();
  const contentHash = sha256(hashLines.join("\n"));

  const route = safeUrl(finalUrl);
  const manifest: SourcePackageManifest = {
    schemaVersion: SOURCE_PACKAGE_SCHEMA_VERSION,
    packageKind: SOURCE_PACKAGE_KIND,
    source: {
      requestedUrl: redactUrl(input.requestedUrl).url,
      finalUrl: redactUrl(finalUrl).url,
      origin: pageOrigin,
      capturedAt,
      route: { host: route?.hostname ?? "", pathname: route?.pathname ?? "", search: safeUrl(redactUrl(finalUrl).url)?.search ?? "" },
      ...(input.pageId ? { pageId: input.pageId } : {}),
      viewportId,
      viewport: { width: input.viewport.width, height: input.viewport.height, isMobile: input.viewport.isMobile, deviceScaleFactor: input.viewport.deviceScaleFactor },
      engine: input.engine,
    },
    observationWindow: {
      startedAt: network.startedAt,
      endedAt: network.endedAt,
      durationMs: network.durationMs,
      description: "navigation → load → network-idle/settle → (prepare-scroll, page-state normalization) → collect; recorder attached before navigation and stopped after the runtime DOM snapshot",
    },
    document: {
      initial: {
        status: input.initialDocument.status,
        ...(input.initialDocument.reason ? { reason: input.initialDocument.reason } : {}),
        ...(input.initialDocument.url ? { url: redactUrl(input.initialDocument.url).url } : {}),
        ...(input.initialDocument.httpStatus !== undefined ? { httpStatus: input.initialDocument.httpStatus } : {}),
        ...(input.initialDocument.contentType ? { contentType: input.initialDocument.contentType } : {}),
        ...(input.initialDocument.bytes !== undefined ? { bytes: input.initialDocument.bytes } : {}),
        ...(input.initialDocument.sha256 ? { sha256: input.initialDocument.sha256 } : {}),
        ...(input.initialDocument.charset ? { charset: input.initialDocument.charset } : {}),
        ...(input.initialDocument.declaredCharset ? { declaredCharset: input.initialDocument.declaredCharset } : {}),
        ...(initialFile ? { file: initialFile } : {}),
      },
      runtimeDom: {
        status: "captured",
        file: runtimeFile,
        bytes: runtimeBuf.byteLength,
        sha256: sha256(runtimeBuf),
        note: "page.content() after load/settle — a DOM snapshot only (no listeners, no JS state)",
        ...(inventory ? { shadowRoots: inventory.caps.shadowRoots } : {}),
      },
      ...(initialWitness ? { initialInventory: initialWitness.counts } : {}),
    },
    limits: { ...limits },
    bodyPolicy: { ...bodyPolicy },
    evidence: {
      initiator: network.initiatorEvidence,
      ...(network.initiatorReason ? { initiatorReason: network.initiatorReason } : {}),
      initialDocumentWitness: initialWitness ? "parsed" : "unavailable",
      directFetchFallback: args.directFetch ? "enabled" : "disabled",
    },
    counts,
    accounting,
    frameworkEvidence,
    files: {
      styles: "styles/manifest.json",
      scripts: "scripts/manifest.json",
      assets: "assets/manifest.json",
      network: "network/manifest.json",
      config: "config/manifest.json",
    },
    contentHash,
    limitations,
  };

  log(
    `source-package[${viewportId}]: styles ${counts.styles.total} (raw ${counts.styles.rawBytesCaptured}, cssom-runtime ${counts.styles.cssomRuntime}), ` +
      `scripts ${counts.scripts.total} (responses ${counts.scripts.responsesCaptured}, chunks ${counts.scripts.runtimeLoadedChunks}), ` +
      `assets ${assets.length}, network ${counts.network.total} (bodies ${counts.network.bodiesCaptured}), config ${config.length}`,
  );

  return {
    manifest,
    styles: { schemaVersion: SOURCE_PACKAGE_SCHEMA_VERSION, viewportId, entries: styles },
    scripts: { schemaVersion: SOURCE_PACKAGE_SCHEMA_VERSION, viewportId, entries: scripts },
    assets: {
      schemaVersion: SOURCE_PACKAGE_SCHEMA_VERSION,
      viewportId,
      inlineSvg: { count: inventory?.svg.inlineCount ?? 0, bytes: inventory?.svg.inlineBytes ?? 0 },
      fontsLoaded: inventory?.fontsLoaded ?? [],
      entries: assets,
    },
    network: { schemaVersion: SOURCE_PACKAGE_SCHEMA_VERSION, viewportId, ordering: "url,method,seq", entries: networkEntries },
    config: { schemaVersion: SOURCE_PACKAGE_SCHEMA_VERSION, viewportId, entries: config },
    blobs: sink.blobs,
  };
}
