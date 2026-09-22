import type { DependencyClass, Preservability } from "./types.js";
import { SENSITIVE_QUERY_KEY_PATTERN } from "./types.js";

/**
 * Pure, deterministic classification for the Source Package. No I/O.
 *
 * Every rule here is GENERIC: it keys on resource type, origin relation, URL
 * shape and well-known third-party infrastructure hosts. No source site is
 * named anywhere in this module (§2), and classification never upgrades a
 * downloaded script to "reusable" — that distinction is Phase 3's (§7).
 */

/* ---------------------------------------------------------------------------
 * URL helpers
 * ------------------------------------------------------------------------- */

export function safeUrl(raw: string, base?: string): URL | null {
  try {
    return base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
}

export function originOf(url: string): string | null {
  const u = safeUrl(url);
  if (!u) return null;
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return u.origin;
}

export function isSameOrigin(url: string, pageOrigin: string): boolean | undefined {
  const o = originOf(url);
  if (o === null) return undefined;
  return o === pageOrigin;
}

export interface RedactedUrl {
  url: string;
  redaction?: { redactedQueryKeys?: string[]; queryDropped?: boolean; credentialsStripped?: boolean };
}

/**
 * Redact secret-shaped query values; drop the whole query for analytics
 * beacons (their query IS the client/session payload). Non-http URLs are
 * returned unchanged (a `data:` URL carries no query semantics).
 */
export function redactUrl(raw: string, dropQuery = false): RedactedUrl {
  const u = safeUrl(raw);
  if (!u || (u.protocol !== "http:" && u.protocol !== "https:")) return { url: raw };
  // Review M1: credentials are stripped whether or not a query key matches —
  // the rebuilt href must be returned in that case, never the original string.
  let credentialsStripped = false;
  if (u.username || u.password) {
    u.username = "";
    u.password = "";
    credentialsStripped = true;
  }
  const cred = credentialsStripped ? { credentialsStripped: true as const } : {};
  if (dropQuery) {
    if (u.search === "") return credentialsStripped ? { url: u.href, redaction: { ...cred } } : { url: raw };
    u.search = "";
    return { url: u.href, redaction: { queryDropped: true, ...cred } };
  }
  const redactedKeys: string[] = [];
  const params = u.searchParams;
  const keys = Array.from(new Set(Array.from(params.keys())));
  for (const key of keys) {
    if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
      params.set(key, "[redacted]");
      redactedKeys.push(key);
    }
  }
  if (redactedKeys.length === 0) return credentialsStripped ? { url: u.href, redaction: { ...cred } } : { url: raw };
  redactedKeys.sort();
  return { url: u.href, redaction: { redactedQueryKeys: redactedKeys, ...cred } };
}

/**
 * Review B1 — every persisted URL goes through redaction, not only the
 * dedicated `url`/`src` fields. These helpers cover the other surfaces:
 * attribute records (`srcset`, `currentSrc`, `data-href`, …), CSS `url()`
 * text (`@font-face src`), and free text. They keep the ORIGINAL spelling
 * (relative or absolute) whenever nothing had to be redacted, so a clean
 * value is byte-identical to what the page carried.
 */
export function redactUrlText(raw: string, base?: string, dropQuery = false): string {
  const abs = safeUrl(raw, base);
  if (!abs) return raw;
  const r = redactUrl(abs.href, dropQuery);
  return r.redaction ? r.url : raw;
}

/** Redact each candidate URL of a `srcset` / `imagesrcset` value. */
export function redactSrcsetText(srcset: string, base?: string): string {
  return srcset
    .split(",")
    .map((part) => {
      const m = /^(\s*)(\S+)(.*)$/.exec(part);
      if (!m) return part;
      const red = redactUrlText(m[2]!, base);
      return red === m[2] ? part : `${m[1]}${red}${m[3]}`;
    })
    .join(",");
}

/** Redact every `url(...)` inside a CSS value (e.g. an `@font-face` `src`). */
export function redactCssUrls(text: string, base?: string): string {
  return text.replace(/url\(\s*(["']?)([^"')]*)\1\s*\)/g, (whole, q: string, u: string) => {
    const red = redactUrlText(u.trim(), base);
    return red === u.trim() ? whole : `url(${q}${red}${q})`;
  });
}

const URLISH_ATTR = /(^|[-:])(src|href|srcset|imagesrcset|poster|action|formaction|url|data|ping|cite|manifest|background|content)$/i;

/** Redact URL-bearing values of an attribute record (owner nodes, assets, root data-*). */
export function redactAttributeRecord(attrs: Record<string, string>, base?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (/srcset$/i.test(k)) out[k] = redactSrcsetText(v, base);
    else if (URLISH_ATTR.test(k) || /^(https?:)?\/\//i.test(v)) out[k] = redactUrlText(v, base);
    else out[k] = v;
  }
  return out;
}

/**
 * Registrable-domain approximation (no public-suffix list): last two labels,
 * or three when the second-level label is a conventional short SLD under a
 * two-letter TLD (`co.kr`, `com.br`, `ac.uk`). IP literals compare whole.
 */
export function registrableDomain(host: string): string {
  const h = host.toLowerCase();
  if (h === "" || /^[\d.]+$/.test(h) || h.includes(":")) return h;
  const labels = h.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1]!;
  const sld = labels[labels.length - 2]!;
  const twoLevel = tld.length === 2 && /^(co|com|net|org|ac|go|gov|ne|or|edu|re|pe|mil|nom|gob|ltd|plc|me|sch)$/.test(sld);
  return labels.slice(twoLevel ? -3 : -2).join(".");
}

/** Same site = same registrable domain (`dev-api.example.com` vs `example.com`). */
export function isSameSite(hostA: string, hostB: string): boolean {
  const a = registrableDomain(hostA);
  return a !== "" && a === registrableDomain(hostB);
}

/* ---------------------------------------------------------------------------
 * Third-party provider hints (generic infrastructure vocabulary)
 * ------------------------------------------------------------------------- */

interface ProviderRule {
  hint: string;
  kind: "analytics" | "embed" | "cdn" | "fonts" | "maps" | "chat" | "tag-manager" | "ads" | "monitoring";
  hosts: RegExp;
}

const PROVIDER_RULES: readonly ProviderRule[] = [
  { hint: "google-tag-manager", kind: "tag-manager", hosts: /(^|\.)googletagmanager\.com$/i },
  { hint: "google-analytics", kind: "analytics", hosts: /(^|\.)(google-analytics\.com|analytics\.google\.com)$/i },
  { hint: "google-ads", kind: "ads", hosts: /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\.com)$/i },
  { hint: "google-optimize", kind: "analytics", hosts: /(^|\.)googleoptimize\.com$/i },
  { hint: "facebook-pixel", kind: "analytics", hosts: /(^|\.)(connect\.facebook\.net|facebook\.com)$/i },
  { hint: "hotjar", kind: "analytics", hosts: /(^|\.)hotjar\.(com|io)$/i },
  { hint: "microsoft-clarity", kind: "analytics", hosts: /(^|\.)clarity\.ms$/i },
  { hint: "segment", kind: "analytics", hosts: /(^|\.)segment\.(com|io)$/i },
  { hint: "mixpanel", kind: "analytics", hosts: /(^|\.)mixpanel\.com$/i },
  { hint: "amplitude", kind: "analytics", hosts: /(^|\.)amplitude\.com$/i },
  { hint: "naver-analytics", kind: "analytics", hosts: /(^|\.)(wcs\.naver\.net|wcs\.naver\.com|ssl\.pstatic\.net)$/i },
  { hint: "kakao-pixel", kind: "analytics", hosts: /(^|\.)(t1\.daumcdn\.net)$/i },
  { hint: "sentry", kind: "monitoring", hosts: /(^|\.)(sentry\.io|ingest\.sentry\.io|sentry-cdn\.com)$/i },
  { hint: "datadog", kind: "monitoring", hosts: /(^|\.)datadoghq\.(com|eu)$/i },
  { hint: "new-relic", kind: "monitoring", hosts: /(^|\.)(newrelic\.com|nr-data\.net)$/i },
  { hint: "channel-talk", kind: "chat", hosts: /(^|\.)channel\.io$/i },
  { hint: "intercom", kind: "chat", hosts: /(^|\.)(intercom\.io|intercomcdn\.com)$/i },
  { hint: "crisp", kind: "chat", hosts: /(^|\.)crisp\.chat$/i },
  { hint: "zendesk", kind: "chat", hosts: /(^|\.)(zdassets\.com|zendesk\.com)$/i },
  { hint: "youtube", kind: "embed", hosts: /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|ytimg\.com|googlevideo\.com)$/i },
  { hint: "vimeo", kind: "embed", hosts: /(^|\.)(vimeo\.com|vimeocdn\.com)$/i },
  { hint: "instagram", kind: "embed", hosts: /(^|\.)(instagram\.com|cdninstagram\.com)$/i },
  { hint: "twitter", kind: "embed", hosts: /(^|\.)(twitter\.com|x\.com|twimg\.com|platform\.twitter\.com)$/i },
  { hint: "tiktok", kind: "embed", hosts: /(^|\.)tiktok\.com$/i },
  { hint: "google-maps", kind: "maps", hosts: /(^|\.)(maps\.googleapis\.com|maps\.google\.com|maps\.gstatic\.com)$/i },
  { hint: "google-maps-embed", kind: "maps", hosts: /^www\.google\.com$/i },
  { hint: "naver-maps", kind: "maps", hosts: /(^|\.)(openapi\.map\.naver\.com|oapi\.map\.naver\.com|map\.naver\.com)$/i },
  { hint: "kakao-maps", kind: "maps", hosts: /(^|\.)(dapi\.kakao\.com|map\.kakao\.com)$/i },
  { hint: "google-fonts", kind: "fonts", hosts: /^fonts\.(googleapis|gstatic)\.com$/i },
  { hint: "cdn-jsdelivr", kind: "cdn", hosts: /(^|\.)jsdelivr\.net$/i },
  { hint: "cdn-unpkg", kind: "cdn", hosts: /^unpkg\.com$/i },
  { hint: "cdn-cdnjs", kind: "cdn", hosts: /^cdnjs\.cloudflare\.com$/i },
  { hint: "cdn-google-ajax", kind: "cdn", hosts: /^ajax\.googleapis\.com$/i },
  { hint: "google-recaptcha", kind: "embed", hosts: /^(www\.google\.com|www\.gstatic\.com|recaptcha\.net)$/i },
];

export interface ProviderMatch {
  hint: string;
  kind: ProviderRule["kind"];
}

export function matchProvider(host: string, pathname = ""): ProviderMatch | undefined {
  const h = host.toLowerCase();
  for (const rule of PROVIDER_RULES) {
    if (!rule.hosts.test(h)) continue;
    // `www.google.com` is only a maps/recaptcha provider on those paths.
    if (rule.hint === "google-maps-embed" && !/^\/maps\//i.test(pathname)) continue;
    if (rule.hint === "google-recaptcha" && !/recaptcha/i.test(pathname) && h !== "recaptcha.net") continue;
    return { hint: rule.hint, kind: rule.kind };
  }
  return undefined;
}

/** Path shapes that mark analytics/beacon traffic regardless of host. */
const ANALYTICS_PATH = /(\/collect(\?|$)|\/g\/collect|\/ccm\/|\/measurement\/|\/1p-conversion|\/conversion(\?|\/|$)|\/pagead\/|\/tr(\?|$)|\/pixel|\/beacon|\/track(ing)?(\?|$)|\/analytics\b|\/telemetry\b|\/log(ging)?\b\/?$|\/stats\b|\/metrics\b|\/rum\b|\/events?\b\/?$)/i;
const ANALYTICS_HOST_WORDS = /(analytics|metrics|telemetry|tracking|pixel|beacon|logger|stats\.)/i;

/** Path shapes that mark API/data traffic. */
const API_PATH = /(^\/api\/|\/api\/|\/graphql|\/_next\/data\/|\/wp-json\/|\/rest\/|\/rpc\b|\/v[0-9]+\/|\.json(\?|$))/i;

const JS_CHUNK_PATH = /(\/_next\/static\/|\/_nuxt\/|\/static\/js\/|\/assets\/.*\.(m?js)(\?|$)|\.chunk\.js|chunk[-.].*\.js|\/js\/|\.m?js(\?|$))/i;

/* ---------------------------------------------------------------------------
 * Dependency class
 * ------------------------------------------------------------------------- */

export interface ClassifyRequestInput {
  url: string;
  resourceType: string;
  contentType?: string;
  sameOrigin: boolean;
  /** Hostname of the observed page; lets a site-external API keep no query (review M2). */
  pageHost?: string;
  frame: "main" | "child" | "service-worker" | "unknown";
  navigation: boolean;
  method: string;
}

export interface RequestClassification {
  dependencyClass: DependencyClass;
  thirdParty: boolean;
  providerHint?: string;
  apiLike: boolean;
  /** Drop the query entirely when recording the URL. */
  dropQuery: boolean;
  reasons: string[];
}

function essence(contentType: string | undefined): string {
  return (contentType ?? "").split(";")[0]!.trim().toLowerCase();
}

export function classifyRequest(input: ClassifyRequestInput): RequestClassification {
  const u = safeUrl(input.url);
  const host = u?.hostname ?? "";
  const pathname = u?.pathname ?? "";
  const ct = essence(input.contentType);
  const provider = host ? matchProvider(host, pathname) : undefined;
  const reasons: string[] = [];
  const thirdParty = !input.sameOrigin;
  let cls: DependencyClass = "UNKNOWN";
  let apiLike = false;
  let dropQuery = false;

  const rt = input.resourceType;
  if (input.navigation && input.frame === "main") {
    cls = "DOCUMENT";
    reasons.push("main-frame navigation");
  } else if (rt === "document" || (input.frame === "child" && input.navigation)) {
    cls = "EMBED";
    reasons.push("child-frame document");
  } else if (provider && (provider.kind === "analytics" || provider.kind === "tag-manager" || provider.kind === "ads" || provider.kind === "monitoring")) {
    cls = "ANALYTICS";
    dropQuery = true;
    reasons.push(`provider:${provider.hint}`);
  } else if (rt === "ping" || rt === "beacon") {
    cls = "ANALYTICS";
    dropQuery = true;
    reasons.push(`resourceType:${rt}`);
  } else if (rt === "stylesheet" || ct === "text/css") {
    cls = "CSS";
    reasons.push(rt === "stylesheet" ? "resourceType:stylesheet" : "content-type:text/css");
  } else if (rt === "script" || /javascript|ecmascript/.test(ct)) {
    cls = "JS_CHUNK";
    reasons.push(rt === "script" ? "resourceType:script" : `content-type:${ct}`);
  } else if (rt === "font" || /^font\//.test(ct) || /(woff2?|ttf|otf|eot)(\?|$)/i.test(pathname)) {
    cls = "FONT";
    reasons.push("font");
  } else if (rt === "image" || /^image\//.test(ct)) {
    cls = "IMAGE";
    reasons.push("image");
  } else if (rt === "media" || /^(video|audio)\//.test(ct)) {
    cls = "MEDIA";
    reasons.push("media");
  } else if (rt === "xhr" || rt === "fetch" || rt === "eventsource" || rt === "websocket") {
    if (ANALYTICS_PATH.test(pathname) || ANALYTICS_HOST_WORDS.test(host)) {
      cls = "ANALYTICS";
      dropQuery = true;
      reasons.push("analytics-shaped fetch");
    } else if (/json|graphql|xml|text\/plain|octet-stream/.test(ct) || API_PATH.test(pathname) || input.method !== "GET") {
      cls = "API_DATA";
      apiLike = true;
      reasons.push(`fetch:${ct || input.method}`);
    } else if (/javascript/.test(ct)) {
      cls = "JS_CHUNK";
      reasons.push("fetch returned script");
    } else {
      cls = "API_DATA";
      apiLike = true;
      reasons.push("fetch/xhr unknown content");
    }
  } else if (rt === "manifest") {
    cls = "STATIC_ASSET";
    reasons.push("web app manifest");
  } else if (rt === "texttrack" || rt === "other") {
    if (ANALYTICS_PATH.test(pathname) || ANALYTICS_HOST_WORDS.test(host)) {
      cls = "ANALYTICS";
      dropQuery = true;
      reasons.push("analytics-shaped");
    } else if (/json/.test(ct) || API_PATH.test(pathname)) {
      cls = "API_DATA";
      apiLike = true;
      reasons.push("data-shaped other");
    } else if (JS_CHUNK_PATH.test(pathname)) {
      cls = "JS_CHUNK";
      reasons.push("js-shaped path");
    } else {
      cls = "STATIC_ASSET";
      reasons.push(`resourceType:${rt}`);
    }
  } else {
    cls = "UNKNOWN";
    reasons.push(`resourceType:${rt}`);
  }

  if (cls !== "ANALYTICS" && provider && provider.kind === "embed" && input.frame === "child") {
    reasons.push(`inside-embed:${provider.hint}`);
  }
  if (cls === "API_DATA" && !apiLike) apiLike = true;
  // Review M2: a data/API call to a host outside the page's own site carries
  // client ids, fingerprints and consent state in its query as a rule
  // (measured: Google `/measurement/conversion` with `gacid`, `uafvl`, `u_w`).
  // Same-site APIs (`dev-api.<site>`) keep their query: it is the endpoint shape.
  if (cls === "API_DATA" && input.pageHost && host && !isSameSite(host, input.pageHost)) {
    dropQuery = true;
    reasons.push("site-external data endpoint: query dropped");
  }
  return {
    dependencyClass: cls,
    thirdParty,
    ...(provider ? { providerHint: provider.hint } : {}),
    apiLike,
    dropQuery,
    reasons,
  };
}

/* ---------------------------------------------------------------------------
 * Preservability
 * ------------------------------------------------------------------------- */

export interface PreservabilityInput {
  dependencyClass: DependencyClass;
  sameOrigin: boolean | undefined;
  scheme: "http" | "https" | "data" | "blob" | "relative-unresolved" | "none" | "other";
  bodyCaptured: boolean;
  bodyStatus?: string;
  providerHint?: string;
  providerKind?: ProviderMatch["kind"];
  frame?: "main" | "child" | "service-worker" | "unknown";
  failed?: boolean;
  httpOk?: boolean;
}

export function classifyPreservability(input: PreservabilityInput): {
  preservability: Preservability;
  reasons: string[];
} {
  const reasons: string[] = [];
  const provider = input.providerHint ? providerKindOf(input.providerHint) : undefined;
  if (input.scheme === "data") {
    reasons.push("data: URL is self-contained");
    return { preservability: "PRESERVABLE", reasons };
  }
  if (input.scheme === "blob") {
    reasons.push("blob: URL exists only in this page's runtime");
    return { preservability: "STATEFUL_RUNTIME", reasons };
  }
  if (input.frame === "service-worker") {
    reasons.push("served through a service worker");
    return { preservability: "STATEFUL_RUNTIME", reasons };
  }
  if (input.failed) {
    reasons.push("request failed in the browser");
    return { preservability: "UNAVAILABLE", reasons };
  }
  switch (input.dependencyClass) {
    case "ANALYTICS":
      reasons.push("analytics/beacon traffic stays external or is dropped");
      return { preservability: "EXTERNAL_EMBED", reasons };
    case "API_DATA":
      reasons.push("API/data request bound to the source origin and runtime");
      return { preservability: "ORIGIN_BOUND", reasons };
    case "EMBED":
      reasons.push(provider ? `third-party embed: ${input.providerHint}` : "embedded document");
      return { preservability: "EXTERNAL_EMBED", reasons };
    case "DOCUMENT":
      reasons.push("main document bytes captured; URLs inside need rewriting");
      return { preservability: input.bodyCaptured ? "LOCALIZABLE" : "UNAVAILABLE", reasons };
    case "CSS":
      if (input.bodyCaptured) {
        reasons.push("authored CSS bytes captured; url() references need rewriting");
        return { preservability: "LOCALIZABLE", reasons };
      }
      reasons.push(`stylesheet bytes not captured (${input.bodyStatus ?? "unknown"})`);
      return { preservability: input.bodyStatus === "skipped-by-size" || input.bodyStatus === "skipped-by-policy" ? "UNKNOWN" : "UNAVAILABLE", reasons };
    case "JS_CHUNK":
      if (provider === "analytics" || provider === "tag-manager" || provider === "ads" || provider === "monitoring" || provider === "chat" || provider === "embed") {
        reasons.push(`third-party runtime service: ${input.providerHint}`);
        return { preservability: "EXTERNAL_EMBED", reasons };
      }
      if (provider === "maps") {
        reasons.push(`keyed third-party SDK: ${input.providerHint}`);
        return { preservability: "ORIGIN_BOUND", reasons };
      }
      if (input.bodyCaptured) {
        reasons.push("script bytes downloadable; execution independence UNKNOWN (Phase 3 decides)");
        return { preservability: "UNKNOWN", reasons };
      }
      reasons.push(`script bytes not captured (${input.bodyStatus ?? "unknown"})`);
      return { preservability: input.bodyStatus === "skipped-by-size" ? "UNKNOWN" : "UNAVAILABLE", reasons };
    case "FONT":
      reasons.push(provider === "fonts" ? `hosted font service: ${input.providerHint} (license review required)` : "font file re-hostable after URL rewriting (license review required)");
      return { preservability: "LOCALIZABLE", reasons };
    case "IMAGE":
    case "MEDIA":
    case "STATIC_ASSET":
      if (input.httpOk === false) {
        reasons.push("asset answered non-2xx");
        return { preservability: "UNAVAILABLE", reasons };
      }
      reasons.push(input.sameOrigin === false ? "cross-origin static asset re-hostable after URL rewriting" : "static asset re-hostable after URL rewriting");
      return { preservability: "LOCALIZABLE", reasons };
    default:
      reasons.push("insufficient evidence");
      return { preservability: "UNKNOWN", reasons };
  }
}

export function providerKindOf(hint: string): ProviderMatch["kind"] | undefined {
  const rule = PROVIDER_RULES.find((r) => r.hint === hint);
  return rule?.kind;
}

/** Iframe/object embed classification by URL only (no load). */
export function classifyEmbedUrl(url: string | undefined, pageOrigin: string): {
  providerHint?: string;
  preservability: Preservability;
  dependencyClass: DependencyClass;
  reasons: string[];
} {
  if (!url) return { preservability: "UNKNOWN", dependencyClass: "EMBED", reasons: ["iframe without src (srcdoc or script-written)"] };
  const u = safeUrl(url);
  if (!u) return { preservability: "UNKNOWN", dependencyClass: "EMBED", reasons: ["unparseable src"] };
  if (u.protocol === "about:") return { preservability: "STATEFUL_RUNTIME", dependencyClass: "EMBED", reasons: ["about:blank frame — script-populated"] };
  if (u.protocol === "data:" ) return { preservability: "PRESERVABLE", dependencyClass: "EMBED", reasons: ["data: frame"] };
  if (u.protocol === "blob:") return { preservability: "STATEFUL_RUNTIME", dependencyClass: "EMBED", reasons: ["blob: frame"] };
  const provider = matchProvider(u.hostname, u.pathname);
  if (provider) {
    return { providerHint: provider.hint, preservability: "EXTERNAL_EMBED", dependencyClass: "EMBED", reasons: [`known provider: ${provider.hint}`] };
  }
  if (u.origin === pageOrigin) {
    return { preservability: "UNKNOWN", dependencyClass: "EMBED", reasons: ["same-origin frame document — not recursed in Phase 1"] };
  }
  return { preservability: "EXTERNAL_EMBED", dependencyClass: "EMBED", reasons: ["cross-origin frame document"] };
}

/** Framework evidence from generic, public markers. */
export interface FrameworkSignals {
  scriptSrcs: string[];
  styleMarkers: string[];
  windowGlobals: string[];
  rootAttributeNames: string[];
  metaGenerator?: string;
  jsonScriptIds: string[];
  elementTagNames: string[];
}

export function detectFrameworks(s: FrameworkSignals): { framework: string; evidence: string; count?: number }[] {
  const out: { framework: string; evidence: string; count?: number }[] = [];
  const count = (re: RegExp, list: string[]): number => list.filter((x) => re.test(x)).length;
  const next = count(/\/_next\//, s.scriptSrcs);
  if (s.jsonScriptIds.includes("__NEXT_DATA__") || s.windowGlobals.includes("__NEXT_DATA__")) out.push({ framework: "next.js", evidence: "__NEXT_DATA__ present" });
  else if (next > 0) out.push({ framework: "next.js", evidence: "/_next/ script paths", count: next });
  const nuxt = count(/\/_nuxt\//, s.scriptSrcs);
  if (s.windowGlobals.includes("__NUXT__") || s.jsonScriptIds.includes("__NUXT_DATA__")) out.push({ framework: "nuxt", evidence: "__NUXT__ state present" });
  else if (nuxt > 0) out.push({ framework: "nuxt", evidence: "/_nuxt/ script paths", count: nuxt });
  const emotion = count(/^data-emotion/, s.styleMarkers);
  if (emotion > 0) out.push({ framework: "emotion (CSS-in-JS)", evidence: "data-emotion style tags", count: emotion });
  const styled = count(/^data-styled/, s.styleMarkers);
  if (styled > 0) out.push({ framework: "styled-components (CSS-in-JS)", evidence: "data-styled style tags", count: styled });
  const jss = count(/^data-jss/, s.styleMarkers);
  if (jss > 0) out.push({ framework: "JSS (CSS-in-JS)", evidence: "data-jss style tags", count: jss });
  if (s.rootAttributeNames.some((n) => /^ng-version$/.test(n))) out.push({ framework: "angular", evidence: "ng-version attribute" });
  if (s.rootAttributeNames.some((n) => /^data-v-/.test(n))) out.push({ framework: "vue", evidence: "data-v-* scoped attributes" });
  if (s.elementTagNames.includes("astro-island")) out.push({ framework: "astro", evidence: "<astro-island> elements" });
  const wp = count(/\/wp-(content|includes)\//, s.scriptSrcs);
  if (wp > 0 || /wordpress/i.test(s.metaGenerator ?? "")) out.push({ framework: "wordpress", evidence: wp > 0 ? "/wp-content/ script paths" : `meta generator: ${s.metaGenerator}`, ...(wp > 0 ? { count: wp } : {}) });
  if (s.rootAttributeNames.some((n) => /^data-wf-(page|site)$/.test(n))) out.push({ framework: "webflow", evidence: "data-wf-* root attributes" });
  const framer = count(/framerusercontent\.com|framer\.com\//, s.scriptSrcs);
  if (framer > 0) out.push({ framework: "framer", evidence: "framer script hosts", count: framer });
  const shopify = count(/cdn\.shopify\.com/, s.scriptSrcs);
  if (shopify > 0) out.push({ framework: "shopify", evidence: "cdn.shopify.com scripts", count: shopify });
  const gatsby = count(/\/page-data\/|gatsby/i, s.scriptSrcs);
  if (gatsby > 0 || s.windowGlobals.includes("___gatsby")) out.push({ framework: "gatsby", evidence: "gatsby markers", count: gatsby });
  if (s.metaGenerator && !out.some((e) => e.evidence.startsWith("meta generator"))) out.push({ framework: `generator:${s.metaGenerator}`, evidence: "meta generator" });
  return out;
}
