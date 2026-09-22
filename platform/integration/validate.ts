import { z } from "zod";
import { stableStringify } from "../util/hash";
import {
  AREA_BASES,
  AREA_UNITS,
  CONSUMER_DECLARED_LIMITS,
  CONTRACT_ID_MAX,
  CONTRACT_ID_RE,
  CORE_SCHEMA_VERSION,
  CURRENCY_RE,
  FACET_ID_MAX,
  FACET_KEY_RE,
  FACET_LABEL_MAX,
  FORBIDDEN_CHAR_RE,
  INTEGRATION_DIR,
  LOCATION_MAX,
  MANIFEST_FILE,
  PORTFOLIO_KIND,
  PORTFOLIO_SCHEMA_VERSION,
  TITLE_MAX,
  VERSION_RE,
} from "./contract";
import { compareCodePoints, IntegrationError, portfolioVersion, type IntegrationEmission, type PortfolioDocument } from "./emit";

/**
 * Producer-side, fail-closed validation of an emission against Contract V0 (02):
 *   manifest schema (§5, §7.1) · resource schema (§6, §7.2, §7.3) · schemaVersion (§14) ·
 *   resource version + echo + file-name pointer (§15, INV-3) · site identity (§13) ·
 *   publicOrigin https (§5) · record id uniqueness (ID3) · required fields · root-relative URLs
 *   (UR2) and their pages in the route plan (INV-5) · facet closure both ways (VO1, INV-8) ·
 *   area / price shape (§9, §10) · no null / placeholder / empty value (MD1–MD3, INV-9) ·
 *   forbidden characters (HT7, INV-12) · compact UTF-8 serialisation that round-trips ·
 *   consumer-declared limits (VO6 → warnings only, never truncation).
 * Any error fails the build (assertIntegration throws with every error listed).
 */

export interface ValidationContext {
  siteId: string;
  publicOrigin: string | undefined;
  /** every concrete page path of the route plan (a URL in a document must be one of them) */
  pagePaths: ReadonlySet<string>;
}
export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** 02 §12 UR2 — path-only root-relative reference. */
/** UR2 (freeze review C-07): the path is already percent-encoded ASCII — RFC 3986 `pchar` and "/" only. */
const PATH_CHARS_RE = /^[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/;
export function isRootRelativePath(u: string): boolean {
  if (!u.startsWith("/") || u.startsWith("//")) return false;
  if (/[?#\\\s]/.test(u) || FORBIDDEN_CHAR_RE.test(u)) return false;
  if (!PATH_CHARS_RE.test(u) || /%(?![0-9A-Fa-f]{2})/.test(u)) return false;
  const segs = u.slice(1).split("/");
  if (u !== "/" && segs.some((s) => s === "" || s === "." || s === "..")) return false;
  return true;
}

const twoDecimals = (v: number) => Number.isFinite(v) && Math.round(v * 100) / 100 === v;
const UrlRef = z.string().refine(isRootRelativePath, { message: "must be a path-only root-relative reference (UR2)" });
const KindOrFacetKey = z.string().regex(FACET_KEY_RE);

export const ManifestSchema = z
  .object({
    schemaVersion: z.literal(CORE_SCHEMA_VERSION),
    site: z
      .object({
        id: z.string().regex(CONTRACT_ID_RE).max(CONTRACT_ID_MAX),
        publicOrigin: z.string().min(1),
        locale: z.string().min(1),
      })
      .strict(),
    resources: z.record(KindOrFacetKey, z.object({ href: UrlRef, version: z.string().regex(VERSION_RE) }).strict()),
  })
  .strict();

const AreaSchema = z
  .object({
    value: z.number().positive().refine(twoDecimals, { message: "at most 2 fraction digits" }),
    unit: z.enum(AREA_UNITS),
    basis: z.enum(AREA_BASES).optional(),
  })
  .strict();
const PriceSchema = z
  .object({
    amount: z.number().positive().refine(twoDecimals, { message: "at most 2 fraction digits" }),
    currency: z.string().regex(CURRENCY_RE),
    perUnit: z.enum(AREA_UNITS),
  })
  .strict();
export const PortfolioRecordSchema = z
  .object({
    id: z.string().regex(CONTRACT_ID_RE).max(CONTRACT_ID_MAX),
    title: z.string().min(1).max(TITLE_MAX),
    detailUrl: UrlRef,
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    location: z.string().min(1).max(LOCATION_MAX).optional(),
    area: AreaSchema.optional(),
    pricePerArea: PriceSchema.optional(),
    facets: z.record(KindOrFacetKey, z.array(z.string().min(1).max(FACET_ID_MAX)).min(1)).optional(),
  })
  .strict();
export const PortfolioDocumentSchema = z
  .object({
    schemaVersion: z.literal(PORTFOLIO_SCHEMA_VERSION),
    resource: z.literal(PORTFOLIO_KIND),
    version: z.string().regex(VERSION_RE),
    listingUrl: UrlRef.optional(),
    facets: z
      .record(
        KindOrFacetKey,
        z.object({ values: z.array(z.object({ id: z.string().min(1).max(FACET_ID_MAX), label: z.string().min(1).max(FACET_LABEL_MAX) }).strict()).min(1) }).strict(),
      )
      .optional(),
    records: z.array(PortfolioRecordSchema),
  })
  .strict();

function issues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

/** MD1–MD3, MD6, HT7: no null, no "", no empty object, no empty array (except `records`), no forbidden character, finite numbers. */
function scanValues(value: unknown, at: string, errors: string[], allowEmptyArrayAt: string) {
  if (value === null || value === undefined) return void errors.push(`${at}: null is never emitted (MD1)`);
  if (typeof value === "string") {
    if (value === "") errors.push(`${at}: empty string is a placeholder (MD2)`);
    if (FORBIDDEN_CHAR_RE.test(value)) errors.push(`${at}: contains a forbidden character (HT7)`);
    return;
  }
  if (typeof value === "number") return void (Number.isFinite(value) || errors.push(`${at}: not a finite number`));
  if (typeof value === "boolean") return void errors.push(`${at}: booleans are not part of the V0 schema`);
  if (Array.isArray(value)) {
    if (value.length === 0 && at !== allowEmptyArrayAt) errors.push(`${at}: empty array (only \`records\` may be empty, MD3)`);
    value.forEach((v, i) => scanValues(v, `${at}[${i}]`, errors, allowEmptyArrayAt));
    return;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length === 0) errors.push(`${at}: empty object`);
    for (const k of keys) {
      if (FORBIDDEN_CHAR_RE.test(k)) errors.push(`${at}.${k}: key contains a forbidden character (HT7)`);
      scanValues((value as Record<string, unknown>)[k], `${at}.${k}`, errors, allowEmptyArrayAt);
    }
    return;
  }
  errors.push(`${at}: unsupported value type ${typeof value}`);
}

function checkSerialisation(file: { path: string; text: string; bytes: Uint8Array; sha256: string }, object: unknown, errors: string[]) {
  const at = file.path;
  if (file.bytes.length >= 3 && file.bytes[0] === 0xef && file.bytes[1] === 0xbb && file.bytes[2] === 0xbf) errors.push(`${at}: UTF-8 BOM`);
  if (new TextDecoder("utf-8", { fatal: true }).decode(file.bytes) !== file.text) errors.push(`${at}: bytes are not the UTF-8 encoding of the text`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch {
    errors.push(`${at}: not valid JSON`);
    return;
  }
  if (file.text !== JSON.stringify(parsed)) errors.push(`${at}: not compact JSON`);
  if (stableStringify(parsed) !== stableStringify(object)) errors.push(`${at}: serialised bytes do not round-trip to the emitted object`);
}

function checkOrigin(origin: string, expected: string | undefined, errors: string[]) {
  let url: URL | undefined;
  try {
    url = new URL(origin);
  } catch {
    /* handled below */
  }
  if (!url || url.protocol !== "https:") return void errors.push(`manifest.site.publicOrigin ${origin}: must be an https origin (§5)`);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.origin !== origin) {
    errors.push(`manifest.site.publicOrigin ${origin}: origin only (no path, query, fragment, credentials; canonical serialisation)`);
  }
  if (url.port !== "") errors.push(`manifest.site.publicOrigin ${origin}: an explicit port is outside V0 (§7.1, consumer R12-1)`);
  if (expected !== undefined && origin !== expected) errors.push(`manifest.site.publicOrigin ${origin} ≠ the site's publicOrigin ${expected}`);
}

export function validateIntegration(e: IntegrationEmission, ctx: ValidationContext): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ---- manifest (§5, §7.1, §13, §14) ----
  const m = ManifestSchema.safeParse(e.manifest);
  if (!m.success) errors.push(`manifest schema: ${issues(m.error)}`);
  if (e.manifest.site.id !== ctx.siteId) errors.push(`manifest.site.id "${e.manifest.site.id}" ≠ siteId "${ctx.siteId}" (ID4)`);
  checkOrigin(e.manifest.site.publicOrigin, ctx.publicOrigin, errors);
  try {
    if (Intl.getCanonicalLocales(e.manifest.site.locale).length !== 1) throw new Error();
  } catch {
    errors.push(`manifest.site.locale "${e.manifest.site.locale}" is not BCP 47`);
  }
  if (e.manifestFile.path !== `${INTEGRATION_DIR}/${MANIFEST_FILE}`) errors.push(`manifest file path ${e.manifestFile.path} ≠ ${INTEGRATION_DIR}/${MANIFEST_FILE}`);
  const { resources, ...manifestRest } = e.manifest;
  scanValues(manifestRest, "manifest", errors, "");
  // `resources: {}` is the one empty object the contract allows (§5: no resource offered → CONFIRMED OFF (resource))
  if (Object.keys(resources).length > 0) scanValues(resources, "manifest.resources", errors, "");
  checkSerialisation(e.manifestFile, e.manifest, errors);
  const files = e.files.map((f) => f.path).sort();
  for (const f of e.files) {
    if (!f.path.startsWith(`${INTEGRATION_DIR}/`) || !/^[A-Za-z0-9._-]+$/.test(f.path.slice(INTEGRATION_DIR.length + 1))) errors.push(`file path ${f.path} is not a flat ${INTEGRATION_DIR}/ file`);
  }

  // ---- resource pointer + version echo (§15 RV1/RV3/RV5, INV-3) ----
  const entry = resources[PORTFOLIO_KIND];
  if (!e.portfolio) {
    // the resource is not offered (02 §4): manifest only, and the manifest must not point at a document
    if (entry) errors.push(`manifest.resources has a "${PORTFOLIO_KIND}" entry but no portfolio document was emitted`);
    if (JSON.stringify(files) !== JSON.stringify([e.manifestFile.path])) errors.push(`emitted files ${files.join(", ")} ≠ ${e.manifestFile.path} (no resource offered)`);
    checkLimits(e, undefined, warnings);
    return { errors, warnings };
  }
  const doc = e.portfolio.document;
  if (!entry) errors.push(`manifest.resources has no "${PORTFOLIO_KIND}" entry`);
  else {
    const expectedHref = `/${INTEGRATION_DIR}/${PORTFOLIO_KIND}.${doc.version}.json`;
    if (entry.href !== expectedHref) errors.push(`manifest.resources.portfolio.href ${entry.href} ≠ ${expectedHref} (RV5)`);
    if (entry.version !== doc.version) errors.push(`manifest version ${entry.version} ≠ document version ${doc.version} (RV3)`);
    if (`/${e.portfolio.file.path}` !== entry.href) errors.push(`document file ${e.portfolio.file.path} is not the manifest pointer ${entry.href}`);
  }
  if (e.portfolio.version !== doc.version) errors.push(`emission.version ${e.portfolio.version} ≠ document.version ${doc.version}`);
  if (portfolioVersion(doc) !== doc.version) errors.push(`document.version ${doc.version} is not the hash of its content (RV1)`);
  const expectedFiles = [e.manifestFile.path, e.portfolio.file.path].sort();
  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) errors.push(`emitted files ${files.join(", ")} ≠ ${expectedFiles.join(", ")}`);

  // ---- portfolio document (§6, §7.2, §7.3, §9, §10, §11) ----
  const d = PortfolioDocumentSchema.safeParse(doc);
  if (!d.success) errors.push(`portfolio document schema: ${issues(d.error)}`);
  scanValues(doc, "portfolio", errors, "portfolio.records");
  checkSerialisation(e.portfolio.file, doc, errors);
  if (doc.records.length === 0) {
    if (doc.listingUrl !== undefined) errors.push("portfolio.listingUrl present with zero records (§7.2)");
    if (doc.facets !== undefined) errors.push("portfolio.facets present with zero records (VO1)");
  }
  if (doc.listingUrl !== undefined && !ctx.pagePaths.has(doc.listingUrl)) errors.push(`portfolio.listingUrl ${doc.listingUrl} has no page in this build (INV-5)`);

  const ids = new Set<string>();
  const usedFacetIds = new Map<string, Set<string>>();
  doc.records.forEach((r, i) => {
    const at = `portfolio.records[${i}] (${r.id})`;
    if (ids.has(r.id)) errors.push(`${at}: duplicate record id (ID3)`);
    ids.add(r.id);
    if (i > 0 && compareCodePoints(doc.records[i - 1]!.id, r.id) >= 0) errors.push(`${at}: records are not in id code point order (§6.1)`);
    if (!ctx.pagePaths.has(r.detailUrl)) errors.push(`${at}: detailUrl ${r.detailUrl} has no page in this build (INV-5)`);
    if (!r.facets?.category || r.facets.category.length !== 1) errors.push(`${at}: facets.category must have exactly one value (§11.3, INV-16)`);
    for (const [key, values] of Object.entries(r.facets ?? {})) {
      if (new Set(values).size !== values.length) errors.push(`${at}: facets.${key} repeats a value (INV-14)`);
      let set = usedFacetIds.get(key);
      if (!set) usedFacetIds.set(key, (set = new Set()));
      for (const v of values) {
        set.add(v);
        if (!doc.facets?.[key]?.values.some((x) => x.id === v)) errors.push(`${at}: facets.${key} value "${v}" is not declared (VO1)`);
      }
    }
  });
  for (const [key, facet] of Object.entries(doc.facets ?? {})) {
    const declared = facet.values.map((v) => v.id);
    if (new Set(declared).size !== declared.length) errors.push(`portfolio.facets.${key}: duplicate value id`);
    for (let i = 1; i < declared.length; i++) if (compareCodePoints(declared[i - 1]!, declared[i]!) >= 0) errors.push(`portfolio.facets.${key}: values are not in id code point order (§6.1)`);
    const used = usedFacetIds.get(key) ?? new Set<string>();
    for (const id of declared) if (!used.has(id)) errors.push(`portfolio.facets.${key}: value "${id}" is declared but no record uses it (VO1)`);
    const limit = CONSUMER_DECLARED_LIMITS.valuesPerFacet[key];
    if (limit !== undefined && declared.length > limit) warnings.push(`facet "${key}" has ${declared.length} values, above the consumer-declared limit ${limit} (VO6): the consumer will ignore this facet as a whole`);
  }

  checkLimits(e, doc, warnings);
  return { errors, warnings };
}

/** consumer-declared limits (VO6 / CH-R10): the build WARNS (P: MUST warn), never truncates; above them the consumer rejects the whole document. */
function checkLimits(e: IntegrationEmission, doc: PortfolioDocument | undefined, warnings: string[]) {
  if (e.manifestFile.bytes.length > CONSUMER_DECLARED_LIMITS.manifestBytes) warnings.push(`manifest is ${e.manifestFile.bytes.length} bytes, above the consumer-declared ${CONSUMER_DECLARED_LIMITS.manifestBytes}`);
  if (e.portfolio && e.portfolio.file.bytes.length > CONSUMER_DECLARED_LIMITS.documentBytes) warnings.push(`portfolio document is ${e.portfolio.file.bytes.length} bytes, above the consumer-declared ${CONSUMER_DECLARED_LIMITS.documentBytes}`);
  if (doc && doc.records.length > CONSUMER_DECLARED_LIMITS.records) warnings.push(`portfolio has ${doc.records.length} records, above the consumer-declared ${CONSUMER_DECLARED_LIMITS.records}`);
}

/** Fail closed: throws IntegrationError listing every error; returns the warnings otherwise. */
export function assertIntegration(e: IntegrationEmission, ctx: ValidationContext): string[] {
  const r = validateIntegration(e, ctx);
  if (r.errors.length) throw new IntegrationError(`integration documents invalid:\n${r.errors.map((x) => `  - ${x}`).join("\n")}`);
  return r.warnings;
}
