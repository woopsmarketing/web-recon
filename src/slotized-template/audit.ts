import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ROUTE_MAP_FILE,
  RUNTIME_DATA_DIR,
  type RuntimeElementNode,
  type RuntimeNode,
  type RuntimePage,
  type RuntimeRouteMap,
} from "../reconstruction/index.js";
import {
  brandTokensFrom,
  containsBrandToken,
  declaredBrandNamesFromTitles,
  firstBrandTokenInIdentifier,
} from "../content-injection/brand-surfaces.js";
import { buildCoverage } from "./coverage.js";
import { scanBackgroundImageRules } from "./css.js";
import { loadTemplate, renderTemplate } from "./render.js";
import { stableStringify } from "./packs.js";
import { INTERNAL_PROVENANCE_FILES, IDENTITY_SURFACE_FILES } from "./site-identity.js";
import { indexPages } from "./tree.js";
import {
  AUTHORING_FILE,
  BindingSchema,
  COVERAGE_FILE,
  CONTENT_PACKS_DIR,
  ContentPackSchema,
  CoverageFileSchema,
  GroupDefinitionSchema,
  MANIFEST_FILE,
  OVERRIDE_HEADER,
  RENDER_REPORT_FILE,
  RepeaterDefinitionSchema,
  SLOTIZED_TEMPLATE_SCHEMA_VERSION,
  SlotDefinitionSchema,
  SlotizedManifestSchema,
  THEME_FILE,
  THEME_PACKS_DIR,
  ThemePackSchema,
  ThemeTokenDefinitionSchema,
  type Binding,
  type CoverageFile,
  type RenderReport,
  type SlotDefinition,
  type UnslottedReason,
  type Variant,
} from "./types.js";

/**
 * Task 29 Phase E1 — AUDITS.
 *
 * Every audit here is ARTIFACT-BASED: it reads the definition files, the
 * template DOM, a content pack and (optionally) a rendered app. No browser, no
 * network, no screenshots — so the verdicts are reproducible and cheap enough
 * to run on every pack.
 *
 * The gates are deliberately narrow and falsifiable:
 *   slotCompleteness      every unslotted eligible surface carries a REASON
 *   hardcodedContent      the same, recomputed independently of coverage.json
 *   sourceLeakage*        the source's identity does not survive a swap
 *   duplicateIds          repeater cloning introduced no duplicate DOM id
 *   contentPackValidation packs apply, and an INVALID pack is refused
 *   artifactCompleteness  every promised file exists and validates
 */

export const AUDIT_DIR = "audits";
export const AUDIT_SCHEMA_VERSION = SLOTIZED_TEMPLATE_SCHEMA_VERSION;

/**
 * `not-represented` is the ONLY reason that does not explain anything: it means
 * "we saw an editable surface and chose not to model it". Every other code
 * names an observed property of the surface itself.
 */
const EXPLAINED_REASONS: ReadonlySet<UnslottedReason> = new Set<UnslottedReason>([
  "aria-hidden",
  "svg-internal",
  "decorative",
  "script-style",
  "whitespace",
  "unresolved",
  "framework-attr",
  "infrastructure",
  "duplicate-occurrence",
]);

export type Verdict = "PASS" | "FAIL" | "REPORT_ONLY";

export interface AuditFile {
  schemaVersion: number;
  schemaName: string;
  templateId: string;
  createdAt: string;
  verdict: Verdict;
  [key: string]: unknown;
}

export type AuditContext = Awaited<ReturnType<typeof loadAuditContext>>;

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

export async function loadAuditContext(manifestFile: string): Promise<{
  runDir: string;
  template: Awaited<ReturnType<typeof loadTemplate>>;
  coverage: CoverageFile;
  createdAt: string;
}> {
  const template = await loadTemplate(manifestFile);
  return {
    runDir: template.dir,
    template,
    coverage: await readJson<CoverageFile>(path.join(template.dir, COVERAGE_FILE)),
    createdAt: new Date().toISOString(),
  };
}

function base(ctx: AuditContext, schemaName: string, verdict: Verdict): AuditFile {
  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    schemaName,
    templateId: ctx.template.manifest.templateId,
    createdAt: ctx.createdAt,
    verdict,
  };
}

// ---------------------------------------------------------------------------
// (a) slot completeness
// ---------------------------------------------------------------------------

export function auditSlotCompleteness(ctx: AuditContext): AuditFile {
  const byReason: Record<string, number> = {};
  const unexplained: Array<{ class: string; pageId: string; detail?: string }> = [];
  for (const row of ctx.coverage.unslotted) {
    byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
    if (!EXPLAINED_REASONS.has(row.reason)) {
      unexplained.push({ class: row.class, pageId: row.pageId, ...(row.detail === undefined ? {} : { detail: row.detail }) });
    }
  }

  // Referential integrity: a slot with no binding is not editable, and a
  // binding with no slot writes nothing.
  const slotIds = new Set(ctx.template.slots.map((s) => s.id));
  const referenced = new Set<string>();
  const orphanBindings: string[] = [];
  for (const binding of ctx.template.bindings) {
    if (!slotIds.has(binding.slotId)) orphanBindings.push(binding.id);
    referenced.add(binding.slotId);
  }
  const slotsWithoutBinding = ctx.template.slots.filter((s) => !referenced.has(s.id)).map((s) => s.key);

  const totals = ctx.coverage.classes.reduce(
    (acc, row) => ({
      eligible: acc.eligible + row.eligible,
      slotted: acc.slotted + row.slotted,
      unslotted: acc.unslotted + row.unslotted,
    }),
    { eligible: 0, slotted: 0, unslotted: 0 },
  );

  const pass = unexplained.length === 0 && orphanBindings.length === 0 && slotsWithoutBinding.length === 0;
  return {
    ...base(ctx, "slotized-audit-slot-completeness-v1", pass ? "PASS" : "FAIL"),
    totals,
    classes: ctx.coverage.classes,
    unslottedByReason: byReason,
    unexplained: unexplained.slice(0, 50),
    unexplainedCount: unexplained.length,
    orphanBindings: orphanBindings.slice(0, 20),
    slotsWithoutBinding: slotsWithoutBinding.slice(0, 20),
    slots: ctx.template.slots.length,
    bindings: ctx.template.bindings.length,
    likelyGlobal: ctx.coverage.likelyGlobal.length,
  };
}

// ---------------------------------------------------------------------------
// (b) hardcoded content — coverage recomputed from the TEMPLATE itself
// ---------------------------------------------------------------------------

const PHONE_RE = /\b0\d{1,2}[- ]\d{3,4}[- ]\d{4}\b/g;
const BUSINESS_NUMBER_RE = /\b\d{3}-\d{2}-\d{5}\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
/**
 * Generic contact shapes the leading-zero PHONE_RE misses: international
 * `+82…` numbers and 4-4 service numbers (`1644-4052`). They are registered as
 * needles ONLY when the source default pack actually contains them, so a year
 * range never becomes a "phone leak".
 */
const PHONE_SHAPE_RES: readonly RegExp[] = [
  /\+?82[-\s.]?\(?\d{1,3}\)?[-\s.]?\d{3,4}[-\s.]?\d{4}/g,
  /\b\d{2,4}-\d{3,4}-\d{4}\b/g,
  /\b\d{4}-\d{4}\b/g,
];
const CONTACT_SHAPE_RES: readonly RegExp[] = [PHONE_RE, BUSINESS_NUMBER_RE, EMAIL_RE, ...PHONE_SHAPE_RES];
/** Minimum digits before a digit sequence can identify a phone number. */
const MIN_CONTACT_DIGITS = 7;

function digitsOf(value: string): string {
  return value.replace(/\D+/g, "");
}

async function loadTemplatePages(ctx: AuditContext): Promise<Map<string, RuntimePage>> {
  const pages = new Map<string, RuntimePage>();
  const dir = path.join(ctx.runDir, "template", "pages");
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith(".json")) continue;
    pages.set(file.replace(/\.json$/, ""), await readJson<RuntimePage>(path.join(dir, file)));
  }
  return pages;
}

export async function auditHardcodedContent(ctx: AuditContext): Promise<AuditFile> {
  const pages = await loadTemplatePages(ctx);
  const cssFile = path.join(ctx.template.source.reconstructionAppDir, ctx.template.source.generatedStylesRelPath);
  const css = await readFile(cssFile, "utf8");
  const backgroundRules = scanBackgroundImageRules(css);
  const recomputed = buildCoverage({
    templateId: ctx.template.manifest.templateId,
    pages: indexPages(pages),
    routeMap: ctx.template.routeMap,
    bindings: ctx.template.bindings,
    backgroundRules,
    backgroundOccurrences: ctx.template.bindings.filter((b) => b.address.surface === "css-rule").length,
    likelyGlobal: [],
  });

  const entries: Array<{ class: string; reason: string; pageId: string; variant?: string; nodeId?: string; detail?: string }> = [];
  const byReason: Record<string, number> = {};
  for (const row of recomputed.unslotted) {
    byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
    if (!EXPLAINED_REASONS.has(row.reason)) {
      entries.push({
        class: row.class,
        reason: row.reason,
        pageId: row.pageId,
        ...(row.variant === undefined ? {} : { variant: row.variant }),
        ...(row.nodeId === undefined ? {} : { nodeId: row.nodeId }),
        ...(row.detail === undefined ? {} : { detail: row.detail }),
      });
    }
  }

  // Drift against the run's own coverage.json: the compiler and this audit must
  // agree, or one of them is describing a template that does not exist.
  const drift: string[] = [];
  const stored = new Map(ctx.coverage.classes.map((c) => [c.class, c] as const));
  for (const row of recomputed.classes) {
    const other = stored.get(row.class);
    if (other === undefined) {
      drift.push(`${row.class}: absent from coverage.json`);
      continue;
    }
    if (other.eligible !== row.eligible || other.slotted !== row.slotted) {
      drift.push(`${row.class}: coverage.json ${other.slotted}/${other.eligible} vs recomputed ${row.slotted}/${row.eligible}`);
    }
  }

  // Company identity still sitting on UNSLOTTED surfaces of the template.
  const identityRows: Array<{ pageId: string; nodeId?: string; detail?: string; match: string }> = [];
  const identityPatterns: Array<[string, RegExp]> = [
    ["phone", PHONE_RE],
    ["business-number", BUSINESS_NUMBER_RE],
    ["email", EMAIL_RE],
    ...PHONE_SHAPE_RES.map((re) => ["phone", re] as [string, RegExp]),
  ];
  for (const row of recomputed.unslotted) {
    const text = row.detail ?? "";
    for (const [kind, re] of identityPatterns) {
      re.lastIndex = 0;
      const found = re.exec(text);
      if (found) {
        identityRows.push({
          pageId: row.pageId,
          ...(row.nodeId === undefined ? {} : { nodeId: row.nodeId }),
          detail: text.slice(0, 80),
          match: `${kind}:${found[0]}`,
        });
      }
    }
  }

  const pass = entries.length === 0 && drift.length === 0;
  return {
    ...base(ctx, "slotized-audit-hardcoded-content-v1", pass ? "PASS" : "FAIL"),
    classes: recomputed.classes,
    unslottedByReason: byReason,
    unslottedContent: entries.slice(0, 100),
    unslottedContentCount: entries.length,
    coverageDrift: drift,
    identityOnUnslottedSurfaces: identityRows.slice(0, 30),
    identityOnUnslottedSurfacesCount: identityRows.length,
    cssBackgroundRulesScanned: backgroundRules.length,
  };
}

// ---------------------------------------------------------------------------
// (c) source leakage of a RENDERED output
// ---------------------------------------------------------------------------

/** Props that carry CONTENT. `class`/`id`/`data-*`/aria-state are infrastructure. */
const CONTENT_PROPS = new Set([
  "href",
  "src",
  "srcSet",
  "poster",
  "action",
  "alt",
  "title",
  "aria-label",
  "placeholder",
  "content",
  "value",
  "cite",
  "download",
  "data-src",
  "data-srcset",
]);

const ALLOWED_HOST_SUFFIXES = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "ajax.googleapis.com",
  "www.w3.org",
  "schema.org",
];

const ANALYTICS_PATTERNS: Array<[string, RegExp]> = [
  ["ga4", /\bG-[A-Z0-9]{8,}\b/],
  ["ua", /\bUA-\d{4,}-\d+\b/],
  ["gtm", /\bGTM-[A-Z0-9]{4,}\b/],
  ["meta-pixel", /\bfbq\(|connect\.facebook\.net/],
  ["naver", /wcs_do|wcslog\.js|nvAcc/],
  ["channel-plugin", /ChannelIO\(|channelPluginSettings/],
];

export type LeakKind =
  | "source-host"
  | "source-asset-host"
  | "source-outbound-host"
  | "source-identity-value"
  | "source-brand-token"
  | "source-page-title"
  | "analytics-id";

interface Needles {
  hosts: Array<{ host: string; kind: LeakKind }>;
  values: Array<{ value: string; kind: LeakKind }>;
  /** Digit sequences of the source phone/tel values — hyphen/space agnostic. */
  digitValues: Array<{ digits: string; source: string }>;
  tokens: string[];
  allowedHosts: string[];
}

function hostOf(value: string): string | undefined {
  const match = /^(?:https?:)?\/\/([^/?#\s"')]+)/i.exec(value);
  return match?.[1]?.toLowerCase();
}

function registrable(host: string): string {
  const labels = host.split(".");
  return labels.slice(-2).join(".");
}

function hostLabels(host: string): string[] {
  // RFC 2606 reserved names ("example", "test", …) never identify a brand.
  const generic = new Set(["com", "net", "org", "io", "co", "kr", "jp", "me", "app", "dev", "www", "example", "test", "invalid", "localhost"]);
  return host
    .split(".")
    .filter((label) => !generic.has(label) && label.length >= 4)
    .map((label) => label.toLowerCase());
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectStrings(item, out);
}

export async function buildNeedles(ctx: AuditContext): Promise<Needles> {
  const sourceHost = (() => {
    try {
      return new URL(ctx.template.manifest.source.rootUrl).host.toLowerCase();
    } catch {
      return ctx.template.manifest.source.host.toLowerCase();
    }
  })();
  const defaults: string[] = [];
  for (const slot of ctx.template.slots) collectStrings(slot.defaultValue, defaults);
  for (const repeater of ctx.template.repeaters) {
    for (const item of repeater.defaultItems) collectStrings(item.values, defaults);
  }

  const mediaRoles = new Set(["image.content", "background.image", "brand.logo", "repeater.media", "media.video"]);
  const assetHosts = new Set<string>();
  for (const slot of ctx.template.slots) {
    if (!mediaRoles.has(slot.role ?? "")) continue;
    const values: string[] = [];
    collectStrings(slot.defaultValue, values);
    for (const value of values) {
      const host = hostOf(value);
      if (host !== undefined) assetHosts.add(host);
    }
  }

  const hosts = new Map<string, LeakKind>();
  for (const value of defaults) {
    const host = hostOf(value);
    if (host === undefined) continue;
    if (ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) continue;
    const isSource = host === sourceHost || host.endsWith(`.${registrable(sourceHost)}`);
    hosts.set(host, isSource ? "source-host" : assetHosts.has(host) ? "source-asset-host" : "source-outbound-host");
  }
  hosts.set(sourceHost, "source-host");

  const values = new Map<string, LeakKind>();
  const digitValues = new Map<string, string>();
  const addPhoneDigits = (raw: string): void => {
    const digits = digitsOf(raw);
    if (digits.length >= MIN_CONTACT_DIGITS) digitValues.set(digits, raw);
  };
  for (const value of defaults) {
    for (const re of CONTACT_SHAPE_RES) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(value)) !== null) {
        values.set(match[0], "source-identity-value");
        if (re !== EMAIL_RE) addPhoneDigits(match[0]);
      }
    }
  }
  // Every declared phone/tel value, whatever its shape: "1644-4052",
  // "tel:1644-4052" and "1644 4052" are one and the same leak.
  for (const slot of ctx.template.slots) {
    const raw = typeof slot.defaultValue === "string" ? slot.defaultValue : "";
    if (raw === "") continue;
    if (slot.type === "phone" || raw.startsWith("tel:")) addPhoneDigits(raw.replace(/^tel:/, ""));
  }
  for (const repeater of ctx.template.repeaters) {
    for (const item of repeater.defaultItems) {
      for (const [slotId, value] of Object.entries(item.values)) {
        if (typeof value !== "string" || value === "") continue;
        const slot = ctx.template.slots.find((s) => s.id === slotId);
        if (slot?.type === "phone" || value.startsWith("tel:")) addPhoneDigits(value.replace(/^tel:/, ""));
      }
    }
  }
  const titles = ctx.template.routeMap.routes
    .map((route) => (route.title ?? "").trim())
    .filter((title) => title.length >= 3);
  for (const title of new Set(titles)) values.set(title, "source-page-title");

  return {
    hosts: [...hosts.entries()].map(([host, kind]) => ({ host, kind })).sort((a, b) => a.host.localeCompare(b.host)),
    values: [...values.entries()].map(([value, kind]) => ({ value, kind })).sort((a, b) => a.value.localeCompare(b.value)),
    digitValues: [...digitValues.entries()]
      .map(([digits, source]) => ({ digits, source }))
      .sort((a, b) => a.digits.localeCompare(b.digits)),
    tokens: [...new Set([...brandTokensFrom(sourceHost, declaredBrandNamesFromTitles(titles)), ...hostLabels(sourceHost)])].sort(),
    allowedHosts: ALLOWED_HOST_SUFFIXES,
  };
}

interface LeakHit {
  pageId: string;
  variant?: Variant;
  nodeId?: string;
  surface: string;
  kind: LeakKind;
  needle: string;
  value: string;
  bound: boolean;
}

function matchNeedles(value: string, needles: Needles, identifierMode: boolean): Array<{ kind: LeakKind; needle: string }> {
  const hits: Array<{ kind: LeakKind; needle: string }> = [];
  if (value.startsWith("data:")) return hits;
  const lower = value.toLowerCase();
  for (const host of needles.hosts) {
    if (lower.includes(host.host)) hits.push({ kind: host.kind, needle: host.host });
  }
  for (const entry of needles.values) {
    if (value.includes(entry.value)) hits.push({ kind: entry.kind, needle: entry.value });
  }
  if (needles.digitValues.length > 0) {
    const digits = digitsOf(value);
    if (digits.length >= MIN_CONTACT_DIGITS) {
      for (const entry of needles.digitValues) {
        if (digits.includes(entry.digits)) hits.push({ kind: "source-identity-value", needle: entry.source });
      }
    }
  }
  for (const token of needles.tokens) {
    const hit = identifierMode ? firstBrandTokenInIdentifier(value, [token]) : undefined;
    if (hit !== undefined || containsBrandToken(value, token)) hits.push({ kind: "source-brand-token", needle: token });
  }
  for (const [kind, re] of ANALYTICS_PATTERNS) {
    if (re.test(value)) hits.push({ kind: "analytics-id", needle: kind });
  }
  // One hit per (kind, needle) per value.
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.kind}|${hit.needle}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function bindingIndex(bindings: readonly Binding[]): {
  text: Set<string>;
  attr: Set<string>;
  svg: Set<string>;
} {
  const text = new Set<string>();
  const attr = new Set<string>();
  const svg = new Set<string>();
  for (const binding of bindings) {
    if (binding.nodeId === undefined || binding.variant === undefined) continue;
    const key = `${binding.pageId}|${binding.variant}|${binding.nodeId}`;
    if (binding.address.svgTextIndex !== undefined) svg.add(key);
    else if (binding.target === "textContent") text.add(`${key}|${binding.address.childIndex ?? ""}`);
    if (binding.target === "attribute" && binding.property !== undefined) attr.add(`${key}|${binding.property}`);
  }
  return { text, attr, svg };
}

export async function auditSourceLeakage(
  ctx: AuditContext,
  renderDir: string,
  label: string,
  gate: boolean,
): Promise<AuditFile> {
  const needles = await buildNeedles(ctx);
  const index = bindingIndex(ctx.template.bindings);
  const dataDir = path.join(renderDir, RUNTIME_DATA_DIR);
  const pageFiles = (await readdir(path.join(dataDir, "pages"))).filter((f) => f.endsWith(".json")).sort();
  const hits: LeakHit[] = [];
  let scannedStrings = 0;
  let dataUriSkipped = 0;

  for (const file of pageFiles) {
    const pageId = file.replace(/\.json$/, "");
    const page = await readJson<RuntimePage>(path.join(dataDir, "pages", file));
    for (const variant of ["desktop", "mobile"] as Variant[]) {
      const root = (variant === "desktop" ? page.desktop : page.mobile).doc;
      const walk = (node: RuntimeNode, insideItem: boolean): void => {
        if (node.k === "t") return;
        const element = node as RuntimeElementNode;
        const props = (element.p ?? {}) as Record<string, unknown>;
        const owned = insideItem || typeof props["data-wr-item"] === "string";
        const key = `${pageId}|${variant}|${element.n}`;
        const children = element.c ?? [];
        for (let i = 0; i < children.length; i++) {
          const child = children[i]!;
          if (child.k !== "t") continue;
          const value = child.v;
          if (value.trim() === "") continue;
          scannedStrings++;
          for (const hit of matchNeedles(value, needles, false)) {
            hits.push({
              pageId,
              variant,
              nodeId: element.n,
              surface: `text[${i}]`,
              ...hit,
              value: value.slice(0, 120),
              bound: owned || index.text.has(`${key}|${i}`),
            });
          }
        }
        for (const [prop, raw] of Object.entries(props)) {
          if (typeof raw !== "string" || raw === "") continue;
          if (!CONTENT_PROPS.has(prop)) continue;
          if (raw.startsWith("data:")) {
            dataUriSkipped++;
            continue;
          }
          scannedStrings++;
          for (const hit of matchNeedles(raw, needles, true)) {
            hits.push({
              pageId,
              variant,
              nodeId: element.n,
              surface: `@${prop}`,
              ...hit,
              value: raw.slice(0, 120),
              bound: owned || index.attr.has(`${key}|${prop}`),
            });
          }
        }
        if (typeof element.v === "string" && element.v !== "") {
          scannedStrings++;
          for (const hit of matchNeedles(element.v, needles, true)) {
            hits.push({
              pageId,
              variant,
              nodeId: element.n,
              surface: "svg",
              ...hit,
              value: element.v.slice(0, 120),
              bound: owned || index.svg.has(key),
            });
          }
        }
        for (const child of children) walk(child, owned);
      };
      walk(root, false);
    }
  }

  // Route map metadata is always slot-bound (route-map bindings exist for every
  // titled route), so a hit there is an authoring failure, never a blind spot.
  const routeMap = await readJson<RuntimeRouteMap>(path.join(dataDir, ROUTE_MAP_FILE));
  for (const route of routeMap.routes) {
    const title = route.title ?? "";
    if (title.trim() === "") continue;
    scannedStrings++;
    for (const hit of matchNeedles(title, needles, false)) {
      hits.push({
        pageId: route.pageSourceId,
        surface: `route-map:${route.path}`,
        ...hit,
        value: title.slice(0, 120),
        bound: true,
      });
    }
  }

  /**
   * SITE IDENTITY SURFACES vs INTERNAL PROVENANCE (Task 29.1).
   *
   * Task 29 found these by grepping a PASSING realistic render: nothing paints
   * them, but they ship inside the app and named the source — the route map's
   * `rootUrl`/per-route `url`, the package name, `generated-config.ts`'s
   * SOURCE_ROOT_URL — plus the document shell. They are SITE-level, owned by a
   * SiteIdentity input rather than a slot, so they are reported in their own
   * bucket: a hit is PUBLIC identity leakage. It gates only when the render
   * declared a SiteIdentity (without one there is no new identity to apply).
   *
   * The render's own records (`manifest.json`, `render-report.json`) keep
   * `provenance.sourceOrigin` on purpose. Those hits are ALLOWED internal
   * provenance: reported, never counted as a customer-site failure.
   */
  const renderManifest = (await exists(path.join(renderDir, MANIFEST_FILE)))
    ? await readJson<{ siteIdentity?: { slug?: string; publicOrigin?: string } }>(path.join(renderDir, MANIFEST_FILE))
    : {};
  const identityApplied = renderManifest.siteIdentity !== undefined;
  const identityHits: LeakHit[] = [];
  // Shell CODE is scanned by its string literals only: identifiers and comments
  // ("PAGE_SOURCE_COUNT", "two source nodes") are not identity surfaces.
  const stringLiterals = (code: string): string[] =>
    [...code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`]*)`/g)].map(
      (m) => m[1] ?? m[2] ?? m[3] ?? "",
    );
  const identityTargets: Array<{ file: string; surface: string }> = [
    { file: path.join(dataDir, ROUTE_MAP_FILE), surface: "route-map:urls" },
    { file: path.join(renderDir, IDENTITY_SURFACE_FILES.packageJson), surface: "app-shell:package.json" },
    { file: path.join(renderDir, IDENTITY_SURFACE_FILES.generatedConfig), surface: "app-shell:generated-config" },
    { file: path.join(renderDir, IDENTITY_SURFACE_FILES.layout), surface: "app-shell:layout" },
  ];
  for (const target of identityTargets) {
    if (!(await exists(target.file))) continue;
    const raw = await readFile(target.file, "utf8");
    const scannable =
      target.surface === "route-map:urls"
        ? [
            (JSON.parse(raw) as { rootUrl?: string }).rootUrl ?? "",
            ...(JSON.parse(raw) as { routes: Array<{ url?: string }> }).routes.map((r) => r.url ?? ""),
          ]
        : /\.tsx?$/.test(target.file)
          ? stringLiterals(raw)
          : (() => {
              const values: string[] = [];
              collectStrings(JSON.parse(raw), values);
              return values;
            })();
    const seen = new Set<string>();
    for (const value of scannable) {
      if (value.trim() === "") continue;
      for (const hit of matchNeedles(value, needles, true)) {
        const key = `${hit.kind}|${hit.needle}`;
        if (seen.has(key)) continue;
        seen.add(key);
        identityHits.push({
          pageId: "*",
          surface: target.surface,
          ...hit,
          value: value.trim().slice(0, 120),
          bound: false,
        });
      }
    }
  }
  const internalProvenance: Array<{ file: string; needle: string; occurrences: number }> = [];
  for (const file of INTERNAL_PROVENANCE_FILES) {
    const full = path.join(renderDir, file);
    if (!(await exists(full))) continue;
    const lower = (await readFile(full, "utf8")).toLowerCase();
    for (const host of needles.hosts.filter((h) => h.kind === "source-host")) {
      const occurrences = lower.split(host.host).length - 1;
      if (occurrences > 0) internalProvenance.push({ file, needle: host.host, occurrences });
    }
  }

  // Stylesheet: the ORIGINAL is copied verbatim, so its urls are expected; the
  // OVERLAY is what this render authored and is the part that must be clean.
  const cssFile = path.join(renderDir, ctx.template.source.generatedStylesRelPath);
  const css = await readFile(cssFile, "utf8");
  const overlayAt = css.lastIndexOf(OVERRIDE_HEADER);
  const overlay = overlayAt === -1 ? "" : css.slice(overlayAt);
  const originalCss = overlayAt === -1 ? css : css.slice(0, overlayAt);
  const cssHostCensus: Record<string, number> = {};
  for (const match of originalCss.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const host = hostOf(match[1]!) ?? (match[1]!.startsWith("data:") ? "<data-uri>" : "<relative>");
    cssHostCensus[host] = (cssHostCensus[host] ?? 0) + 1;
  }
  const overlayLeaks: Array<{ kind: LeakKind; needle: string; sample: string }> = [];
  for (const match of overlay.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    for (const hit of matchNeedles(match[1]!, needles, false)) {
      overlayLeaks.push({ ...hit, sample: match[1]!.slice(0, 80) });
    }
  }
  // Every single-class background rule of the ORIGINAL must be overridden by the
  // overlay, or the rendered site still paints a source asset.
  const originalBackgroundRules = scanBackgroundImageRules(originalCss).filter((rule) =>
    /^\.[A-Za-z0-9_-]+$/.test(rule.selector.trim()),
  );
  const overriddenSelectors = new Set<string>();
  for (const match of overlay.matchAll(/(\.[A-Za-z0-9_-]+)\{background-image:/g)) overriddenSelectors.add(match[1]!);
  const sourceAssetHosts = new Set(needles.hosts.map((h) => h.host));
  const unoverriddenSourceBackgrounds = originalBackgroundRules.filter((rule) => {
    const host = hostOf(rule.url);
    return host !== undefined && sourceAssetHosts.has(host) && !overriddenSelectors.has(rule.selector.trim());
  });

  const leaks = hits.filter((hit) => hit.bound);
  const unslottable = hits.filter((hit) => !hit.bound);
  const countBy = (rows: LeakHit[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const row of rows) out[`${row.kind}:${row.surface.startsWith("@") ? row.surface : row.surface.split("[")[0]}`] =
      (out[`${row.kind}:${row.surface.startsWith("@") ? row.surface : row.surface.split("[")[0]}`] ?? 0) + 1;
    return out;
  };

  const identityGated = gate && identityApplied;
  const totalLeaks =
    leaks.length +
    overlayLeaks.length +
    (gate ? unoverriddenSourceBackgrounds.length : 0) +
    (identityGated ? identityHits.length : 0);
  const verdict: Verdict = gate ? (totalLeaks === 0 ? "PASS" : "FAIL") : "REPORT_ONLY";
  return {
    ...base(ctx, "slotized-audit-source-leakage-v1", verdict),
    label,
    renderDir: path.resolve(renderDir),
    gated: gate,
    needles: {
      hosts: needles.hosts,
      tokens: needles.tokens,
      identityValues: needles.values.length,
      sampleIdentityValues: needles.values.slice(0, 8).map((v) => `${v.kind}:${v.value.slice(0, 40)}`),
    },
    counts: {
      scannedStrings,
      dataUriSkipped,
      leaks: leaks.length,
      unslottableLeaks: unslottable.length,
      overlayLeaks: overlayLeaks.length,
      unoverriddenSourceBackgrounds: unoverriddenSourceBackgrounds.length,
      publicIdentityLeaks: identityHits.length,
      internalProvenanceRefs: internalProvenance.reduce((sum, row) => sum + row.occurrences, 0),
      leaksByKind: countBy(leaks),
      unslottableByKind: countBy(unslottable),
      publicIdentityLeaksByKind: countBy(identityHits),
    },
    leaks: leaks.slice(0, 60),
    unslottableLeaks: unslottable.slice(0, 60),
    /** B. Source identity on SITE-level public surfaces (SiteIdentity's job). */
    publicIdentity: {
      siteIdentityApplied: identityApplied,
      gated: identityGated,
      ...(identityApplied ? { siteIdentity: renderManifest.siteIdentity } : { note: "no SiteIdentity supplied — report only" }),
      leaks: identityHits.slice(0, 60),
    },
    /** A. The render's own provenance records naming the source — ALLOWED. */
    internalProvenance: { allowed: true, refs: internalProvenance },
    overlayLeaks: overlayLeaks.slice(0, 20),
    unoverriddenSourceBackgrounds: unoverriddenSourceBackgrounds.slice(0, 10).map((r) => ({ selector: r.selector, url: r.url })),
    originalStylesheetUrlHosts: cssHostCensus,
    residualUnslottedSurfaces: Object.fromEntries(
      ctx.coverage.classes.filter((c) => c.unslotted > 0).map((c) => [c.class, c.unslotted]),
    ),
  };
}

// ---------------------------------------------------------------------------
// (d) duplicate DOM ids
// ---------------------------------------------------------------------------

function collectIdsPerVariant(page: RuntimePage, variant: Variant): Map<string, number> {
  const counts = new Map<string, number>();
  const walk = (node: RuntimeNode): void => {
    if (node.k === "t") return;
    const element = node as RuntimeElementNode;
    const id = (element.p ?? {})["id"];
    if (typeof id === "string" && id !== "") counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const child of element.c ?? []) walk(child);
  };
  walk((variant === "desktop" ? page.desktop : page.mobile).doc);
  return counts;
}

export async function auditDuplicateIds(ctx: AuditContext, renderDir: string, label: string): Promise<AuditFile> {
  const report = await readJson<RenderReport>(path.join(renderDir, RENDER_REPORT_FILE));
  const templatePages = await loadTemplatePages(ctx);
  const dataDir = path.join(renderDir, RUNTIME_DATA_DIR);
  const rows: Array<{ pageId: string; variant: Variant; id: string; count: number; baseline: number }> = [];
  let baselineTotal = 0;
  let introducedTotal = 0;

  for (const [pageId, templatePage] of [...templatePages.entries()].sort()) {
    const rendered = await readJson<RuntimePage>(path.join(dataDir, "pages", `${pageId}.json`));
    for (const variant of ["desktop", "mobile"] as Variant[]) {
      const before = collectIdsPerVariant(templatePage, variant);
      const after = collectIdsPerVariant(rendered, variant);
      for (const [, count] of before) if (count > 1) baselineTotal++;
      for (const [id, count] of after) {
        if (count <= 1) continue;
        const baseline = before.get(id) ?? 0;
        if (baseline > 1) continue;
        introducedTotal++;
        if (rows.length < 20) rows.push({ pageId, variant, id, count, baseline });
      }
    }
  }

  const pass = report.duplicateIds.introduced === 0 && introducedTotal === 0;
  return {
    ...base(ctx, "slotized-audit-duplicate-ids-v1", pass ? "PASS" : "FAIL"),
    label,
    renderDir: path.resolve(renderDir),
    renderReport: report.duplicateIds,
    perVariantScan: { baseline: baselineTotal, introduced: introducedTotal, samples: rows },
    namespacedIds: report.repeaters.reduce((sum, entry) => sum + entry.namespacedIds, 0),
    clonedNodes: report.repeaters.reduce((sum, entry) => sum + entry.clonedNodes, 0),
  };
}

// ---------------------------------------------------------------------------
// (e) fit warnings
// ---------------------------------------------------------------------------

export async function auditFitWarnings(ctx: AuditContext, renderDir: string, label: string): Promise<AuditFile> {
  const report = await readJson<RenderReport>(path.join(renderDir, RENDER_REPORT_FILE));
  const slotById = new Map(ctx.template.slots.map((s) => [s.id, s] as const));
  const fit = report.warnings.filter((w) => w.code === "CONTENT_FIT_WARNING");
  const byType: Record<string, number> = {};
  for (const warning of fit) {
    const slot = warning.slotId === undefined ? undefined : slotById.get(warning.slotId);
    const type = slot?.type ?? "unknown";
    byType[type] = (byType[type] ?? 0) + 1;
  }
  const byCode: Record<string, number> = {};
  for (const warning of report.warnings) byCode[warning.code] = (byCode[warning.code] ?? 0) + 1;
  return {
    ...base(ctx, "slotized-audit-fit-warnings-v1", "REPORT_ONLY"),
    label,
    renderDir: path.resolve(renderDir),
    total: fit.length,
    bySlotType: byType,
    allWarningsByCode: byCode,
    top: fit.slice(0, 10).map((w) => ({ slotId: w.slotId, message: w.message })),
    applied: report.applied,
    skipped: report.skipped,
    failed: report.failed.length,
  };
}

// ---------------------------------------------------------------------------
// (f) theme coverage
// ---------------------------------------------------------------------------

export async function auditThemeCoverage(ctx: AuditContext): Promise<AuditFile> {
  const tokens = await readJson<Array<{ kind: string; risk: string; targets: unknown[]; usageCount?: number }>>(
    path.join(ctx.runDir, THEME_FILE),
  );
  const reportFile = path.join(ctx.runDir, "theme-report.json");
  const themeReport = (await exists(reportFile))
    ? await readJson<Record<string, unknown>>(reportFile)
    : undefined;
  const byKind: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  let targets = 0;
  for (const token of tokens) {
    byKind[token.kind] = (byKind[token.kind] ?? 0) + 1;
    byRisk[token.risk] = (byRisk[token.risk] ?? 0) + 1;
    targets += token.targets.length;
  }
  return {
    ...base(ctx, "slotized-audit-theme-coverage-v1", "REPORT_ONLY"),
    tokens: tokens.length,
    byKind,
    byRisk,
    targets,
    unTokenized: (themeReport?.["unTokenized"] as unknown) ?? null,
    scanned: (themeReport?.["scanned"] as unknown) ?? null,
  };
}

// ---------------------------------------------------------------------------
// (g) content pack validation (+ the renderer REFUSES an invalid pack)
// ---------------------------------------------------------------------------

interface PackProblem {
  pack: string;
  problem: string;
}

function validatePackAgainstTemplate(
  packName: string,
  raw: unknown,
  slots: Map<string, SlotDefinition>,
  repeaters: Map<string, { itemSlots: Set<string> }>,
  templateId: string,
  templateVersion: string,
): PackProblem[] {
  const problems: PackProblem[] = [];
  const parsed = ContentPackSchema.safeParse(raw);
  if (!parsed.success) {
    problems.push({ pack: packName, problem: `schema: ${parsed.error.issues[0]?.message ?? "invalid"}` });
    return problems;
  }
  const pack = parsed.data;
  if (pack.templateId !== templateId) problems.push({ pack: packName, problem: `templateId ${pack.templateId}` });
  if (pack.templateVersion !== templateVersion) {
    problems.push({ pack: packName, problem: `templateVersion ${pack.templateVersion.slice(0, 12)}…` });
  }
  for (const [slotId, value] of Object.entries(pack.slots)) {
    const slot = slots.get(slotId);
    if (slot === undefined) {
      problems.push({ pack: packName, problem: `unknown slot ${slotId}` });
      continue;
    }
    if (slot.scope === "repeater-item") {
      problems.push({ pack: packName, problem: `field slot in pack.slots: ${slot.key}` });
    }
    const composite = slot.type === "image" || slot.type === "video";
    const isObject = typeof value === "object" && value !== null;
    if (composite !== isObject) problems.push({ pack: packName, problem: `type mismatch on ${slot.key} (${slot.type})` });
  }
  for (const [repeaterId, entry] of Object.entries(pack.repeaters)) {
    const repeater = repeaters.get(repeaterId);
    if (repeater === undefined) {
      problems.push({ pack: packName, problem: `unknown repeater ${repeaterId}` });
      continue;
    }
    const seen = new Set<string>();
    for (const item of entry.items) {
      if (seen.has(item.id)) problems.push({ pack: packName, problem: `duplicate item id ${item.id} in ${repeaterId}` });
      seen.add(item.id);
      for (const fieldId of Object.keys(item.values)) {
        if (!repeater.itemSlots.has(fieldId)) {
          problems.push({ pack: packName, problem: `unknown field ${fieldId} in ${repeaterId}` });
        }
      }
    }
  }
  return problems;
}

export async function auditContentPackValidation(ctx: AuditContext): Promise<AuditFile> {
  const slots = new Map(ctx.template.slots.map((s) => [s.id, s] as const));
  const repeaters = new Map(
    ctx.template.repeaters.map((r) => [r.id, { itemSlots: new Set(r.itemSlots) }] as const),
  );
  const dir = path.join(ctx.runDir, CONTENT_PACKS_DIR);
  const problems: PackProblem[] = [];
  const checked: string[] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
    if (file.endsWith(".expectations.json")) continue;
    checked.push(file);
    problems.push(
      ...validatePackAgainstTemplate(
        file,
        await readJson<unknown>(path.join(dir, file)),
        slots,
        repeaters,
        ctx.template.manifest.templateId,
        ctx.template.manifest.templateVersion,
      ),
    );
  }

  // Negative control: an INVALID pack must be REFUSED, not silently ignored.
  const scratch = await mkdtemp(path.join(tmpdir(), "wr29-audit-"));
  const negative: Array<{ case: string; rejected: boolean; error?: string }> = [];
  const baseline = await readJson<Record<string, unknown>>(path.join(dir, "default.json"));
  const cases: Array<{ name: string; pack: Record<string, unknown> }> = [
    {
      name: "unknown-slot-id",
      pack: { ...baseline, slots: { ...(baseline["slots"] as object), slot_ffffffffffff: "nope" } },
    },
    {
      name: "type-mismatch",
      pack: {
        ...baseline,
        slots: Object.fromEntries(
          Object.entries(baseline["slots"] as Record<string, unknown>).map(([id, value], i) =>
            i === 0 ? [id, typeof value === "object" ? "string-for-image" : { src: "object-for-text" }] : [id, value],
          ),
        ),
      },
    },
    { name: "bad-schema-name", pack: { ...baseline, schemaName: "not-a-content-pack" } },
    { name: "wrong-template-id", pack: { ...baseline, templateId: "someone-elses-template" } },
  ];
  for (const testCase of cases) {
    const file = path.join(scratch, `${testCase.name}.json`);
    await writeFile(file, JSON.stringify(testCase.pack), "utf8");
    try {
      await renderTemplate({
        templateManifestFile: path.join(ctx.runDir, MANIFEST_FILE),
        contentPackFile: file,
        outDir: path.join(scratch, `${testCase.name}-out`),
      });
      negative.push({ case: testCase.name, rejected: false });
    } catch (error) {
      negative.push({ case: testCase.name, rejected: true, error: (error as Error).message.slice(0, 120) });
    }
  }

  const pass = problems.length === 0 && negative.every((n) => n.rejected);
  return {
    ...base(ctx, "slotized-audit-content-pack-validation-v1", pass ? "PASS" : "FAIL"),
    packsChecked: checked,
    problems: problems.slice(0, 40),
    problemCount: problems.length,
    invalidPackRejection: negative,
  };
}

// ---------------------------------------------------------------------------
// (h) artifact completeness
// ---------------------------------------------------------------------------

export async function auditArtifactCompleteness(ctx: AuditContext): Promise<AuditFile> {
  const rows: Array<{ file: string; present: boolean; valid: boolean; detail?: string }> = [];
  const check = async (rel: string, validate?: (value: unknown) => string | undefined): Promise<void> => {
    const file = path.join(ctx.runDir, rel);
    if (!(await exists(file))) {
      rows.push({ file: rel, present: false, valid: false });
      return;
    }
    if (validate === undefined) {
      rows.push({ file: rel, present: true, valid: true });
      return;
    }
    try {
      const problem = validate(await readJson<unknown>(file));
      rows.push({ file: rel, present: true, valid: problem === undefined, ...(problem === undefined ? {} : { detail: problem }) });
    } catch (error) {
      rows.push({ file: rel, present: true, valid: false, detail: (error as Error).message.slice(0, 120) });
    }
  };
  const arrayOf = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: Array<{ message: string }> } } }) =>
    (value: unknown): string | undefined => {
      if (!Array.isArray(value)) return "not an array";
      for (const [i, item] of value.entries()) {
        const parsed = schema.safeParse(item);
        if (!parsed.success) return `item ${i}: ${parsed.error?.issues[0]?.message ?? "invalid"}`;
      }
      return undefined;
    };
  const one = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: Array<{ message: string }> } } }) =>
    (value: unknown): string | undefined => {
      const parsed = schema.safeParse(value);
      return parsed.success ? undefined : (parsed.error?.issues[0]?.message ?? "invalid");
    };

  await check(MANIFEST_FILE, one(SlotizedManifestSchema));
  await check("slots.json", arrayOf(SlotDefinitionSchema));
  await check("bindings.json", arrayOf(BindingSchema));
  await check("groups.json", arrayOf(GroupDefinitionSchema));
  await check("repeaters.json", arrayOf(RepeaterDefinitionSchema));
  await check(THEME_FILE, arrayOf(ThemeTokenDefinitionSchema));
  await check(COVERAGE_FILE, one(CoverageFileSchema));
  await check(AUTHORING_FILE, (value) =>
    typeof value === "object" && value !== null && Array.isArray((value as { pages?: unknown }).pages)
      ? undefined
      : "authoring projection has no pages[]",
  );
  for (const pack of ["default", "mechanical", "realistic"]) {
    await check(`${CONTENT_PACKS_DIR}/${pack}.json`, one(ContentPackSchema));
  }
  await check(`${CONTENT_PACKS_DIR}/mechanical.expectations.json`, (value) =>
    typeof value === "object" && value !== null && Array.isArray((value as { slots?: unknown }).slots)
      ? undefined
      : "expectations have no slots[]",
  );
  for (const pack of ["default", "mutated"]) {
    await check(`${THEME_PACKS_DIR}/${pack}.json`, one(ThemePackSchema));
  }
  await check("template/route-map.json", (value) =>
    typeof value === "object" && value !== null && Array.isArray((value as { routes?: unknown }).routes)
      ? undefined
      : "route map has no routes[]",
  );
  await check("template/source.json");
  for (const pageId of Object.keys(ctx.template.source.pageFiles).sort()) {
    await check(`template/pages/${pageId}.json`, (value) =>
      typeof value === "object" && value !== null && (value as { desktop?: unknown }).desktop !== undefined
        ? undefined
        : "runtime page has no desktop tree",
    );
  }

  const missing = rows.filter((r) => !r.present).map((r) => r.file);
  const invalid = rows.filter((r) => r.present && !r.valid);
  return {
    ...base(ctx, "slotized-audit-artifact-completeness-v1", missing.length === 0 && invalid.length === 0 ? "PASS" : "FAIL"),
    files: rows,
    missing,
    invalid,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface AuditSummary {
  schemaVersion: number;
  schemaName: "slotized-audit-summary-v1";
  templateId: string;
  updatedAt: string;
  gates: Record<string, Verdict | "NOT_RUN">;
  counts: Record<string, unknown>;
}

const GATE_KEYS = [
  "slotCompleteness",
  "hardcodedContent",
  "sourceLeakageDefault",
  "sourceLeakageMechanical",
  "sourceLeakageRealistic",
  "duplicateIds",
  "contentPackValidation",
  "artifactCompleteness",
] as const;

export async function updateSummary(
  runDir: string,
  templateId: string,
  updates: { gates: Record<string, Verdict>; counts: Record<string, unknown> },
): Promise<AuditSummary> {
  const file = path.join(runDir, AUDIT_DIR, "summary.json");
  const previous = (await exists(file)) ? await readJson<AuditSummary>(file) : undefined;
  const gates: Record<string, Verdict | "NOT_RUN"> = {};
  for (const key of GATE_KEYS) gates[key] = previous?.gates?.[key] ?? "NOT_RUN";
  Object.assign(gates, updates.gates);
  const summary: AuditSummary = {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    schemaName: "slotized-audit-summary-v1",
    templateId,
    updatedAt: new Date().toISOString(),
    gates,
    counts: { ...(previous?.counts ?? {}), ...updates.counts },
  };
  await writeFile(file, stableStringify(summary), "utf8");
  return summary;
}
