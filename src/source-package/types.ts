import { z } from "zod";

/**
 * Source Preservation V2 — Phase 1: SOURCE PACKAGE (schema + limits).
 *
 * A Source Package is the structured record of what ONE browser load of ONE
 * public page actually received and executed-against: the initial network
 * document (bytes as served), the runtime DOM snapshot, every stylesheet and
 * style source AS SOURCE MATERIAL (authored text, never computed pixels), the
 * scripts the page declared and the chunks it loaded, an asset inventory, and
 * a bounded network dependency map with conservative classification.
 *
 * It is CAPTURE EVIDENCE, not a promise: a resource classified LOCALIZABLE was
 * downloadable and looks like it can be re-hosted after URL rewriting; nothing
 * here claims it is independently executable. Phase 2 (Preservation Clone) and
 * Phase 3 (Runtime Preservation) consume this and decide.
 *
 * Location: `viewports/<id>/source-package/` inside a normal observation run
 * (`data/<host>/<run-id>/` or a site run's `pages/<page-id>/`). One package per
 * LOAD, because "what this load received" is the honest unit — the two
 * viewport contexts are different loads (different UA, possibly different
 * chunks). Cross-viewport merging is a later, derived view.
 *
 * Every field is additive to the observation schema (the pointer on the
 * viewport is optional); an observation without a Source Package loads exactly
 * as before.
 */

export const SOURCE_PACKAGE_SCHEMA_VERSION = 1 as const;
export const SOURCE_PACKAGE_KIND = "web-recon-source-package" as const;
export const SOURCE_PACKAGE_DIR = "source-package" as const;

/* ---------------------------------------------------------------------------
 * Limits — every cap is REPORTED in the manifest; nothing is truncated silently.
 * ------------------------------------------------------------------------- */

export interface SourceCaptureLimits {
  /** Largest single script response body kept (bytes). */
  maxScriptBodyBytes: number;
  /** Largest single stylesheet response body kept (bytes). */
  maxStylesheetBodyBytes: number;
  /** Largest single body of any OTHER captured kind (fonts etc. when policy allows). */
  maxOtherBodyBytes: number;
  /** Largest single JSON response body kept (bytes). */
  maxJsonBodyBytes: number;
  /** Total script bytes kept across the package. */
  maxTotalScriptBytes: number;
  /** Total stylesheet bytes kept (network bodies + direct fetches). */
  maxTotalStylesheetBytes: number;
  /** Total JSON response-body bytes kept across the package. */
  maxTotalJsonBytes: number;
  /** Largest single inline text kept (inline script / style text / CSSOM serialization / config blob). */
  maxInlineTextBytes: number;
  /** Total inline text bytes kept. */
  maxTotalInlineTextBytes: number;
  /** Network entries recorded; beyond this, requests are COUNTED as overflow only. */
  maxNetworkEntries: number;
  /** Inventory entries per category (styles, scripts, assets, config). */
  maxInventoryEntries: number;
  /** Elements walked for background-image / mask-image discovery. */
  maxElementsWalked: number;
  /** CSSOM rules walked per stylesheet (nested rules included). */
  maxRulesPerSheet: number;
  /** Stylesheets the direct-HTTP fallback may fetch (only when both CSSOM and network failed). */
  maxDirectFetchSheets: number;
  /** Per-fetch deadline for the direct-HTTP fallback. */
  directFetchTimeoutMs: number;
}

export const SOURCE_CAPTURE_LIMITS_DEFAULT: Readonly<SourceCaptureLimits> = {
  maxScriptBodyBytes: 4 * 1024 * 1024,
  maxStylesheetBodyBytes: 2 * 1024 * 1024,
  maxOtherBodyBytes: 2 * 1024 * 1024,
  maxJsonBodyBytes: 2 * 1024 * 1024,
  maxTotalScriptBytes: 32 * 1024 * 1024,
  maxTotalStylesheetBytes: 8 * 1024 * 1024,
  maxTotalJsonBytes: 16 * 1024 * 1024,
  maxInlineTextBytes: 1 * 1024 * 1024,
  maxTotalInlineTextBytes: 8 * 1024 * 1024,
  maxNetworkEntries: 2_000,
  maxInventoryEntries: 2_000,
  maxElementsWalked: 20_000,
  maxRulesPerSheet: 20_000,
  maxDirectFetchSheets: 16,
  directFetchTimeoutMs: 10_000,
};

/**
 * Which response BODIES are kept. Phase 1 keeps executable/style source
 * (scripts, stylesheets) and, as of the JSON response-body capture change,
 * eligible JSON response bodies too — captured as EVIDENCE (URL, bytes,
 * SHA-256, content-addressed blob), not as a replay/mock source; nothing
 * downstream fulfills requests from these bytes. Fonts, images and media stay
 * INVENTORY ONLY — recorded with URL/status/content-type/bytes and never
 * downloaded here (the existing asset materializer does that later, bounded
 * and SSRF-hardened). Request bodies/headers/cookies are never captured
 * regardless of this policy (§7/§12).
 */
export interface SourceBodyPolicy {
  script: boolean;
  /**
   * Bodies of scripts served by a recognised analytics / tag-manager / ads
   * provider (`matchProvider`). Off by default: they are EXTERNAL_EMBED
   * regardless, and measured at ~2.7 MB per viewport on a typical marketing
   * site. Their inventory, metadata and classification are always kept.
   */
  analyticsScript: boolean;
  stylesheet: boolean;
  font: boolean;
  image: boolean;
  media: boolean;
  json: boolean;
  other: boolean;
}

export const SOURCE_BODY_POLICY_DEFAULT: Readonly<SourceBodyPolicy> = {
  script: true,
  analyticsScript: false,
  stylesheet: true,
  font: false,
  image: false,
  media: false,
  json: true,
  other: false,
};

/**
 * Response headers that are COPIED into the manifest. An allowlist, not a
 * denylist: anything not named here (cookies, authorization, custom auth
 * headers, server fingerprints) is never read. Request headers are never
 * stored at all.
 */
export const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-encoding",
  "cache-control",
  "last-modified",
  "etag",
  "vary",
  "access-control-allow-origin",
  "cross-origin-resource-policy",
  "content-security-policy",
  "x-content-type-options",
  "timing-allow-origin",
  "location",
] as const;
export type SafeResponseHeader = (typeof SAFE_RESPONSE_HEADERS)[number];

/**
 * Query-string KEYS whose values are redacted in every recorded URL. Public
 * pages do put API keys and signed tokens in resource URLs (maps SDKs, signed
 * CDN URLs); the package must not persist them.
 */
export const SENSITIVE_QUERY_KEY_PATTERN =
  /(^|[_-])(token|auth|authorization|session|sessionid|sid|key|apikey|api_key|access_key|secret|signature|sig|password|passwd|pwd|credential|bearer|jwt|csrf|xsrf|nonce)($|[_-])/i;

/**
 * Object keys whose values are redacted inside captured window-global config
 * (allowlisted hydration state, §13). Evidence of the key's presence is kept.
 */
export const SENSITIVE_CONFIG_KEY_PATTERN =
  /(secret|token|password|passwd|private[_-]?key|api[_-]?key|apikey|authorization|credential|bearer|jwt)/i;

/**
 * Window globals that well-known frameworks use to hand PUBLIC page-delivered
 * state to the client. A bounded allowlist (§13): nothing else on `window` is
 * read.
 */
export const RUNTIME_CONFIG_WINDOW_GLOBALS = [
  "__NEXT_DATA__",
  "__NUXT__",
  "__INITIAL_STATE__",
  "__PRELOADED_STATE__",
  "__APOLLO_STATE__",
  "__remixContext",
  "__REDUX_STATE__",
  "__APP_CONFIG__",
  "__RUNTIME_CONFIG__",
  "__ENV__",
] as const;

/* ---------------------------------------------------------------------------
 * Vocabularies
 * ------------------------------------------------------------------------- */

/** Functional dependency class of a network request (§12). */
export const DependencyClassSchema = z.enum([
  "DOCUMENT",
  "STATIC_ASSET",
  "JS_CHUNK",
  "CSS",
  "FONT",
  "IMAGE",
  "MEDIA",
  "API_DATA",
  "EMBED",
  "ANALYTICS",
  "UNKNOWN",
]);
export type DependencyClass = z.infer<typeof DependencyClassSchema>;

/** Conservative preservability classification (§7). Evidence, not a promise. */
export const PreservabilitySchema = z.enum([
  "PRESERVABLE",
  "LOCALIZABLE",
  "EXTERNAL_EMBED",
  "ORIGIN_BOUND",
  "STATEFUL_RUNTIME",
  "UNAVAILABLE",
  "UNKNOWN",
]);
export type Preservability = z.infer<typeof PreservabilitySchema>;

/** Where a body ended up. */
export const BodyStatusSchema = z.enum([
  "captured",
  "skipped-by-policy",
  "skipped-by-size",
  "unavailable",
  "failed",
  "not-applicable",
]);
export type BodyStatus = z.infer<typeof BodyStatusSchema>;

export const DeclaredInSchema = z.enum([
  "initial-document",
  "runtime-injected",
  "runtime-loaded",
  "unknown",
]);
export type DeclaredIn = z.infer<typeof DeclaredInSchema>;

/* ---------------------------------------------------------------------------
 * Shared record shapes
 * ------------------------------------------------------------------------- */

/** A captured blob on disk (relative to the package root, POSIX separators). */
export const BlobRefSchema = z.object({
  status: BodyStatusSchema,
  /** Relative path inside the package; present only when `status === "captured"`. */
  file: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),
  sha256: z.string().optional(),
  /** Content-type essence (`text/css`, `application/javascript`) when known. */
  contentType: z.string().optional(),
  reason: z.string().optional(),
});
export type BlobRef = z.infer<typeof BlobRefSchema>;

export const SafeHeadersSchema = z.record(z.string(), z.string());

/** CDP `Network.requestWillBeSent.initiator`, when the CDP session was available. */
export const InitiatorSchema = z.object({
  type: z.string(),
  url: z.string().optional(),
  lineNumber: z.number().int().nonnegative().optional(),
  /** The top stack frame's URL for `type === "script"`, when the stack was present. */
  stackTopUrl: z.string().optional(),
});
export type Initiator = z.infer<typeof InitiatorSchema>;

export const UrlRedactionSchema = z.object({
  /** Query keys whose values were replaced with `[redacted]`. */
  redactedQueryKeys: z.array(z.string()).optional(),
  /** The entire query string was dropped (analytics/beacon class, or site-external API). */
  queryDropped: z.boolean().optional(),
  /** `user:pass@` was removed from the URL. */
  credentialsStripped: z.boolean().optional(),
});

/* ---------------------------------------------------------------------------
 * NETWORK
 * ------------------------------------------------------------------------- */

export const NetworkEntrySchema = z.object({
  id: z.string(),
  /** Arrival order in this load (0-based). Deterministic within a run only. */
  seq: z.number().int().nonnegative(),
  url: z.string(),
  redaction: UrlRedactionSchema.optional(),
  method: z.string(),
  /** Playwright resource type (`document`, `script`, `stylesheet`, `xhr`, `fetch`, `font`, `image`, `media`, `ping`, …). */
  resourceType: z.string(),
  frame: z.enum(["main", "child", "service-worker", "unknown"]),
  /** Origin of the child frame's document, for `frame === "child"`. */
  frameOrigin: z.string().optional(),
  navigation: z.boolean(),
  sameOrigin: z.boolean(),
  host: z.string(),
  redirectedFrom: z.string().optional(),
  status: z.number().int().nullable(),
  statusText: z.string().optional(),
  ok: z.boolean(),
  /** `requestfailed` error text for a request that never received a response. */
  failed: z.string().optional(),
  /** A 2xx response arrived and the body stream was then aborted (media range reads, beacons); `ok` stays true. */
  streamAborted: z.string().optional(),
  fromServiceWorker: z.boolean(),
  headers: SafeHeadersSchema,
  hasPostData: z.boolean(),
  postDataBytes: z.number().int().nonnegative().optional(),
  initiator: InitiatorSchema.optional(),
  timing: z.object({
    startedAtMs: z.number().nonnegative(),
    responseEndMs: z.number().nonnegative().optional(),
  }),
  dependencyClass: DependencyClassSchema,
  thirdParty: z.boolean(),
  providerHint: z.string().optional(),
  /** Looks like an API/data request (fetch/xhr with JSON-ish content or API-shaped path) rather than a static asset. */
  apiLike: z.boolean(),
  preservability: PreservabilitySchema,
  reasons: z.array(z.string()),
  body: BlobRefSchema,
});
export type NetworkEntry = z.infer<typeof NetworkEntrySchema>;

/* ---------------------------------------------------------------------------
 * STYLES
 * ------------------------------------------------------------------------- */

export const CssomSummarySchema = z.object({
  readable: z.boolean(),
  error: z.string().optional(),
  ruleCount: z.number().int().nonnegative().optional(),
  styleRules: z.number().int().nonnegative().optional(),
  mediaRules: z.number().int().nonnegative().optional(),
  containerRules: z.number().int().nonnegative().optional(),
  supportsRules: z.number().int().nonnegative().optional(),
  layerRules: z.number().int().nonnegative().optional(),
  importRules: z.number().int().nonnegative().optional(),
  fontFaceRules: z.number().int().nonnegative().optional(),
  keyframesRules: z.number().int().nonnegative().optional(),
  customPropertyDeclarations: z.number().int().nonnegative().optional(),
  /** Distinct `@media` condition texts (bounded). */
  mediaConditions: z.array(z.string()).optional(),
  /** Distinct `@layer` names seen (statement or block), in first-seen order. */
  layerNames: z.array(z.string()).optional(),
  walkCapHit: z.boolean().optional(),
});
export type CssomSummary = z.infer<typeof CssomSummarySchema>;

export const StyleEntrySchema = z.object({
  id: z.string(),
  /** Index in `document.styleSheets` (cascade order among sheets). */
  order: z.number().int().nonnegative(),
  sourceType: z.enum(["linked", "style-tag", "cssom-runtime", "adopted", "import"]),
  url: z.string().optional(),
  redaction: UrlRedactionSchema.optional(),
  sameOrigin: z.boolean().optional(),
  ownerTag: z.string().optional(),
  /** `media` attribute / `MediaList.mediaText`, when non-trivial. */
  media: z.string().optional(),
  title: z.string().optional(),
  disabled: z.boolean(),
  declaredIn: DeclaredInSchema,
  /** How `declaredIn` was decided for a `<style>` (text hash / attribute signature / exhaustion / no witness). */
  declaredInEvidence: z.string().optional(),
  /** Attribute names (and CSS-in-JS marker values) on the owner node, e.g. `data-emotion=css`. */
  ownerAttributes: z.record(z.string(), z.string()).optional(),
  runtimeStyleMarkers: z.array(z.string()).optional(),
  cssom: CssomSummarySchema,
  network: z
    .object({
      requestId: z.string().optional(),
      status: z.number().int().nullable().optional(),
      contentType: z.string().optional(),
    })
    .optional(),
  /** Which capture methods were tried and what each produced (§9 order). */
  methods: z.object({
    cssom: z.enum(["readable", "blocked", "empty", "not-applicable"]),
    networkBody: BodyStatusSchema,
    directFetch: z.enum(["fetched", "not-attempted", "failed", "skipped-by-size", "skipped-by-policy"]),
    styleTagText: z.enum(["captured", "empty", "skipped-by-size", "not-applicable"]),
  }),
  /** Raw authored bytes (network body, direct fetch, or the `<style>` text node). */
  authored: BlobRefSchema,
  /** CSSOM-serialized rule text — normalized by the parser, NOT resolved to px. */
  cssomSerialized: BlobRefSchema.optional(),
  rawBytesAvailable: z.boolean(),
  preservability: PreservabilitySchema,
  reasons: z.array(z.string()),
});
export type StyleEntry = z.infer<typeof StyleEntrySchema>;

/* ---------------------------------------------------------------------------
 * SCRIPTS
 * ------------------------------------------------------------------------- */

export const ScriptEntrySchema = z.object({
  id: z.string(),
  /** DOM order among `document.scripts` for DOM-declared scripts; absent for runtime-loaded chunks. */
  order: z.number().int().nonnegative().optional(),
  inline: z.boolean(),
  src: z.string().optional(),
  redaction: UrlRedactionSchema.optional(),
  sameOrigin: z.boolean().optional(),
  kind: z.enum(["classic", "module", "nomodule", "other"]),
  typeAttr: z.string().optional(),
  async: z.boolean(),
  defer: z.boolean(),
  crossorigin: z.string().optional(),
  integrity: z.string().optional(),
  referrerpolicy: z.string().optional(),
  /** A `nonce` attribute was present (its VALUE is never stored). */
  nonceUsed: z.boolean(),
  declaredIn: DeclaredInSchema,
  network: z
    .object({
      requestId: z.string().optional(),
      status: z.number().int().nullable().optional(),
      contentType: z.string().optional(),
      initiatorType: z.string().optional(),
      initiatorUrl: z.string().optional(),
      loaded: z.boolean(),
    })
    .optional(),
  body: BlobRefSchema,
  /** The bytes were obtained. Says nothing about whether they run elsewhere. */
  downloadable: z.boolean(),
  /** Phase 1 never proves execution independence. Always `"unknown"` here. */
  executionIndependence: z.literal("unknown"),
  dependencyClass: DependencyClassSchema,
  thirdParty: z.boolean(),
  providerHint: z.string().optional(),
  preservability: PreservabilitySchema,
  reasons: z.array(z.string()),
});
export type ScriptEntry = z.infer<typeof ScriptEntrySchema>;

/* ---------------------------------------------------------------------------
 * ASSETS
 * ------------------------------------------------------------------------- */

export const AssetKindSchema = z.enum([
  "image",
  "srcset-candidate",
  "picture-source",
  "background-image",
  "mask-image",
  "font-face",
  "font-loaded",
  "video",
  "video-source",
  "video-poster",
  "audio",
  "audio-source",
  "svg-external",
  "svg-use",
  "object-embed",
  "iframe",
  "link",
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetEntrySchema = z.object({
  id: z.string(),
  kind: AssetKindSchema,
  url: z.string().optional(),
  redaction: UrlRedactionSchema.optional(),
  scheme: z.enum(["http", "https", "data", "blob", "relative-unresolved", "none", "other"]),
  sameOrigin: z.boolean().optional(),
  host: z.string().optional(),
  /** Structural path of the element (tag>tag:nth), never a source node id. */
  elementPath: z.string().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  /** For `data:` URLs — media type and decoded byte length; the payload is not duplicated here. */
  dataUrl: z.object({ mediaType: z.string(), bytes: z.number().int().nonnegative() }).optional(),
  /** Stylesheet a `@font-face`/`url()` was authored in, for relative resolution. */
  sheetHref: z.string().optional(),
  network: z
    .object({
      requestId: z.string(),
      status: z.number().int().nullable(),
      contentType: z.string().optional(),
      bytes: z.number().int().nonnegative().optional(),
    })
    .optional(),
  providerHint: z.string().optional(),
  dependencyClass: DependencyClassSchema,
  thirdParty: z.boolean(),
  preservability: PreservabilitySchema,
  reasons: z.array(z.string()),
});
export type AssetEntry = z.infer<typeof AssetEntrySchema>;

/* ---------------------------------------------------------------------------
 * RUNTIME CONFIG
 * ------------------------------------------------------------------------- */

export const ConfigEntrySchema = z.object({
  id: z.string(),
  kind: z.enum([
    "next-data",
    "json-script",
    "ld-json",
    "importmap",
    "speculationrules",
    "data-script",
    "window-global",
    "root-data-attributes",
    "meta-generator",
    "base-href",
    "preload-link",
    "modulepreload-link",
    "manifest-link",
  ]),
  /** Script `id`, global name, link href, … — whichever identifies the evidence. */
  name: z.string().optional(),
  typeAttr: z.string().optional(),
  url: z.string().optional(),
  redaction: UrlRedactionSchema.optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  declaredIn: DeclaredInSchema,
  parseable: z.boolean().optional(),
  /** Keys whose values were redacted inside a captured JSON blob. */
  redactedKeys: z.array(z.string()).optional(),
  body: BlobRefSchema.optional(),
  preservability: PreservabilitySchema,
  reasons: z.array(z.string()),
});
export type ConfigEntry = z.infer<typeof ConfigEntrySchema>;

export const FrameworkEvidenceSchema = z.object({
  framework: z.string(),
  evidence: z.string(),
  count: z.number().int().nonnegative().optional(),
});
export type FrameworkEvidence = z.infer<typeof FrameworkEvidenceSchema>;

/* ---------------------------------------------------------------------------
 * MANIFESTS
 * ------------------------------------------------------------------------- */

export const AccountingBucketSchema = z.object({
  count: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});

export const AccountingSchema = z.object({
  captured: AccountingBucketSchema,
  skippedBySize: AccountingBucketSchema,
  skippedByPolicy: AccountingBucketSchema,
  failed: AccountingBucketSchema,
  unavailable: AccountingBucketSchema,
});
export type Accounting = z.infer<typeof AccountingSchema>;

export const SourceDocumentRecordSchema = z.object({
  initial: z.object({
    status: z.string(),
    reason: z.string().optional(),
    url: z.string().optional(),
    httpStatus: z.number().int().optional(),
    contentType: z.string().optional(),
    bytes: z.number().int().nonnegative().optional(),
    sha256: z.string().optional(),
    charset: z.string().optional(),
    declaredCharset: z.string().optional(),
    /** `document/response.html` — the RAW bytes as served, when captured. */
    file: z.string().optional(),
  }),
  runtimeDom: z.object({
    status: z.enum(["captured", "unavailable"]),
    /** `document/runtime.html` — serialized DOM after load/settle. A snapshot only. */
    file: z.string().optional(),
    bytes: z.number().int().nonnegative().optional(),
    sha256: z.string().optional(),
    note: z.string(),
    /** Open shadow roots found on host elements during the bounded walk; their trees are NOT in the snapshot. */
    shadowRoots: z.number().int().nonnegative().optional(),
  }),
  /** Document-declared resource counts from a parse5 pass over the INITIAL bytes. */
  initialInventory: z
    .object({
      scripts: z.number().int().nonnegative(),
      inlineScripts: z.number().int().nonnegative(),
      stylesheetLinks: z.number().int().nonnegative(),
      styleTags: z.number().int().nonnegative(),
      preloadLinks: z.number().int().nonnegative(),
      modulepreloadLinks: z.number().int().nonnegative(),
    })
    .optional(),
});

export const CountsSchema = z.object({
  styles: z.object({
    total: z.number().int().nonnegative(),
    linked: z.number().int().nonnegative(),
    styleTags: z.number().int().nonnegative(),
    cssomRuntime: z.number().int().nonnegative(),
    adopted: z.number().int().nonnegative(),
    rawBytesCaptured: z.number().int().nonnegative(),
    cssomSerializedCaptured: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
    crossOrigin: z.number().int().nonnegative(),
    cssomBlocked: z.number().int().nonnegative(),
    directFetched: z.number().int().nonnegative(),
    mediaRules: z.number().int().nonnegative(),
    containerRules: z.number().int().nonnegative(),
    supportsRules: z.number().int().nonnegative(),
    customPropertyDeclarations: z.number().int().nonnegative(),
  }),
  scripts: z.object({
    total: z.number().int().nonnegative(),
    documentDeclared: z.number().int().nonnegative(),
    runtimeInjected: z.number().int().nonnegative(),
    runtimeLoadedChunks: z.number().int().nonnegative(),
    inline: z.number().int().nonnegative(),
    external: z.number().int().nonnegative(),
    module: z.number().int().nonnegative(),
    classic: z.number().int().nonnegative(),
    responsesCaptured: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
    skippedBySize: z.number().int().nonnegative(),
  }),
  assets: z.record(z.string(), z.number().int().nonnegative()),
  network: z.object({
    total: z.number().int().nonnegative(),
    overflowNotRecorded: z.number().int().nonnegative(),
    byClass: z.record(z.string(), z.number().int().nonnegative()),
    sameOrigin: z.number().int().nonnegative(),
    thirdParty: z.number().int().nonnegative(),
    apiLike: z.number().int().nonnegative(),
    bodiesCaptured: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    childFrame: z.number().int().nonnegative(),
  }),
  config: z.record(z.string(), z.number().int().nonnegative()),
  byPreservability: z.record(z.string(), z.number().int().nonnegative()),
});
export type SourcePackageCounts = z.infer<typeof CountsSchema>;

export const SourcePackageManifestSchema = z.object({
  schemaVersion: z.literal(SOURCE_PACKAGE_SCHEMA_VERSION),
  packageKind: z.literal(SOURCE_PACKAGE_KIND),
  source: z.object({
    requestedUrl: z.string(),
    finalUrl: z.string(),
    origin: z.string(),
    capturedAt: z.string(),
    route: z.object({ host: z.string(), pathname: z.string(), search: z.string() }),
    pageId: z.string().optional(),
    viewportId: z.string(),
    viewport: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      isMobile: z.boolean(),
      deviceScaleFactor: z.number().positive(),
    }),
    engine: z.string(),
  }),
  observationWindow: z.object({
    startedAt: z.string(),
    endedAt: z.string(),
    durationMs: z.number().int().nonnegative(),
    description: z.string(),
  }),
  document: SourceDocumentRecordSchema,
  limits: z.object({
    maxScriptBodyBytes: z.number().int(),
    maxStylesheetBodyBytes: z.number().int(),
    maxOtherBodyBytes: z.number().int(),
    maxJsonBodyBytes: z.number().int(),
    maxTotalScriptBytes: z.number().int(),
    maxTotalStylesheetBytes: z.number().int(),
    maxTotalJsonBytes: z.number().int(),
    maxInlineTextBytes: z.number().int(),
    maxTotalInlineTextBytes: z.number().int(),
    maxNetworkEntries: z.number().int(),
    maxInventoryEntries: z.number().int(),
    maxElementsWalked: z.number().int(),
    maxRulesPerSheet: z.number().int(),
    maxDirectFetchSheets: z.number().int(),
    directFetchTimeoutMs: z.number().int(),
  }),
  bodyPolicy: z.object({
    script: z.boolean(),
    /** Optional: packages written before this knob existed do not carry it. */
    analyticsScript: z.boolean().optional(),
    stylesheet: z.boolean(),
    font: z.boolean(),
    image: z.boolean(),
    media: z.boolean(),
    json: z.boolean(),
    other: z.boolean(),
  }),
  evidence: z.object({
    initiator: z.enum(["cdp-available", "cdp-unavailable"]),
    initiatorReason: z.string().optional(),
    initialDocumentWitness: z.enum(["parsed", "unavailable"]),
    directFetchFallback: z.enum(["enabled", "disabled"]),
  }),
  counts: CountsSchema,
  accounting: AccountingSchema,
  frameworkEvidence: z.array(FrameworkEvidenceSchema),
  files: z.object({
    styles: z.string(),
    scripts: z.string(),
    assets: z.string(),
    network: z.string(),
    config: z.string(),
  }),
  /**
   * sha256 over the sorted `<url or id>\t<sha256>` lines of the captured
   * document + style + script bytes (the rehydratable "source" set Phase
   * 2/3 consume) — NOT every captured blob. Two captures of an unchanged
   * source agree on it even though their `capturedAt`/timings differ.
   * Network/config bodies (including captured JSON) are evidence, not
   * rehydrated source: they are intentionally excluded here, but each still
   * carries its own SHA-256 in its own manifest entry (`BlobRef.sha256`).
   */
  contentHash: z.string(),
  limitations: z.array(z.string()),
});
export type SourcePackageManifest = z.infer<typeof SourcePackageManifestSchema>;

export const StylesManifestSchema = z.object({
  schemaVersion: z.literal(SOURCE_PACKAGE_SCHEMA_VERSION),
  viewportId: z.string(),
  entries: z.array(StyleEntrySchema),
});
export const ScriptsManifestSchema = z.object({
  schemaVersion: z.literal(SOURCE_PACKAGE_SCHEMA_VERSION),
  viewportId: z.string(),
  entries: z.array(ScriptEntrySchema),
});
export const AssetsManifestSchema = z.object({
  schemaVersion: z.literal(SOURCE_PACKAGE_SCHEMA_VERSION),
  viewportId: z.string(),
  inlineSvg: z.object({ count: z.number().int().nonnegative(), bytes: z.number().int().nonnegative() }),
  fontsLoaded: z.array(
    z.object({ family: z.string(), status: z.string(), weight: z.string(), style: z.string() }),
  ),
  entries: z.array(AssetEntrySchema),
});
export const NetworkManifestSchema = z.object({
  schemaVersion: z.literal(SOURCE_PACKAGE_SCHEMA_VERSION),
  viewportId: z.string(),
  /** Ordering: by `url`, then `method`, then `seq` — a function of the page, not of arrival. */
  ordering: z.literal("url,method,seq"),
  entries: z.array(NetworkEntrySchema),
});
export const ConfigManifestSchema = z.object({
  schemaVersion: z.literal(SOURCE_PACKAGE_SCHEMA_VERSION),
  viewportId: z.string(),
  entries: z.array(ConfigEntrySchema),
});

/* ---------------------------------------------------------------------------
 * In-memory package (before persistence) and the pointer embedded in the
 * observation.
 * ------------------------------------------------------------------------- */

export interface SourceBlob {
  /** Relative path inside the package (POSIX). */
  file: string;
  data: Buffer;
}

export interface SourcePackageCapture {
  manifest: SourcePackageManifest;
  styles: z.infer<typeof StylesManifestSchema>;
  scripts: z.infer<typeof ScriptsManifestSchema>;
  assets: z.infer<typeof AssetsManifestSchema>;
  network: z.infer<typeof NetworkManifestSchema>;
  config: z.infer<typeof ConfigManifestSchema>;
  blobs: SourceBlob[];
}

/** The small record embedded in `observation.json` (`viewports.<id>.sourcePackage`). */
export const SourcePackagePointerSchema = z.object({
  schemaVersion: z.literal(SOURCE_PACKAGE_SCHEMA_VERSION),
  /** `viewports/<id>/source-package` relative to the observation directory. */
  dir: z.string(),
  manifest: z.string(),
  bytes: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  contentHash: z.string(),
  counts: z.object({
    styles: z.number().int().nonnegative(),
    stylesRawCaptured: z.number().int().nonnegative(),
    scripts: z.number().int().nonnegative(),
    scriptResponsesCaptured: z.number().int().nonnegative(),
    assets: z.number().int().nonnegative(),
    network: z.number().int().nonnegative(),
    config: z.number().int().nonnegative(),
  }),
  initialDocument: z.string(),
  runtimeDom: z.string(),
});
export type SourcePackagePointer = z.infer<typeof SourcePackagePointerSchema>;
