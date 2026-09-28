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
  MEDIA_ALT_MAX,
  MEDIA_GALLERY_MAX,
  MEDIA_SRC_RE,
  PER_AREA_SOURCES,
  PORTFOLIO_KIND,
  PORTFOLIO_SCHEMA_VERSION,
  PRICE_AMOUNT_MAX,
  PROJECT_TYPES,
  PROPERTY_TYPES,
  TITLE_MAX,
  VERSION_RE,
  WORK_SCOPE_IDS,
  WORK_SCOPE_SPACE_IDS,
} from "./contract";
import { compareCodePoints, derivePerArea, IntegrationError, portfolioVersion, type IntegrationEmission, type PortfolioDocument } from "./emit";

/**
 * Producer-side, fail-closed validation of an emission against Contract V0 (02) as extended by
 * V0.2 (07) and the portfolio media 1.1 addendum (08):
 *   manifest schema (§5, §7.1) · resource schema (§6, 07 §10) · schemaVersion (§14 SV1, 07 §3, 08 —
 *   manifest "0.1", document "1.1", INV-27) · record `media` (08 §2: same-origin path src, both-or-
 *   neither width/height, authored alt ≤ 160, gallery 1..12 = min(totalCount, 12), totalCount iff
 *   gallery, never `{}`, no hasMore) · resource version + echo + file-name pointer (§15,
 *   INV-3) · site identity (§13) · publicOrigin https (§5) · record id uniqueness (ID3) · required
 *   fields · root-relative URLs (UR2) and their pages in the route plan (INV-5) · facet closure
 *   both ways (VO1, INV-8) · work-scope vocabulary and closure both ways (WS1/WS2, INV-17) ·
 *   projectType / property / pricing shape (07 §5, §6, §9; INV-23) · the D-1 derivation rules
 *   (INV-19, INV-20 both ways, RD1) · style/tag disjointness (ST4, INV-24) · partial_remodel ⇒
 *   work scopes (INV-28) · full_remodel ⇒ at least one SPACE scope (INV-29) · partial_remodel ⇒ at
 *   least one SPACE scope (INV-30) · no null / placeholder / empty value (MD1–MD3, WS5, INV-9,
 *   INV-18) · forbidden characters (HT7, INV-12) · compact UTF-8 serialisation that round-trips ·
 *   consumer-declared limits (VO6 → warnings only, never truncation).
 * Any error fails the build (assertIntegration throws with every error listed). The ONE
 * warn-and-omit case is an RD1 guard failure: the EMITTER raises the warning and it is merged in
 * here (07 §9.3); validating a document on its own, a guard-failing record without a perArea is
 * simply legal and carries no warning.
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
/** 07 §6 — `area` moved here unchanged; MD4: omitted entirely when both sub-fields are absent. */
const PropertySchema = z
  .object({ type: z.enum(PROPERTY_TYPES).optional(), area: AreaSchema.optional() })
  .strict()
  .refine((p) => p.type !== undefined || p.area !== undefined, { message: "property is omitted when both type and area are absent (MD4)" });
/** 07 §9 — positive, ≤ 2 fraction digits, ≤ 1e9, in the currency's major unit. */
const AmountSchema = z.number().positive().max(PRICE_AMOUNT_MAX).refine(twoDecimals, { message: "at most 2 fraction digits" });
/** 07 §9.1 — exactly one `kind`; TP1: a range needs minAmount < maxAmount (INV-23). */
const TotalPriceSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("exact"), amount: AmountSchema, currency: z.string().regex(CURRENCY_RE) }).strict(),
    z.object({ kind: z.literal("range"), minAmount: AmountSchema, maxAmount: AmountSchema, currency: z.string().regex(CURRENCY_RE) }).strict(),
  ])
  .refine((t) => t.kind !== "range" || t.minAmount < t.maxAmount, { message: "total: a range requires minAmount < maxAmount (TP1, INV-23)" });
/** 07 §9.2 — V0's price shape plus its REQUIRED provenance (PA1/PA2). */
const PerAreaSchema = z
  .object({
    amount: AmountSchema,
    currency: z.string().regex(CURRENCY_RE),
    perUnit: z.enum(AREA_UNITS),
    source: z.enum(PER_AREA_SOURCES),
  })
  .strict();
const PricingSchema = z
  .object({ total: TotalPriceSchema.optional(), perArea: PerAreaSchema.optional() })
  .strict()
  .refine((p) => p.total !== undefined || p.perArea !== undefined, { message: "pricing is omitted when both total and perArea are absent (MD4)" });
const WorkScopeIdSchema = z.enum(WORK_SCOPE_IDS);
/**
 * 08 §2 (D1) — one image. `src` is a same-origin absolute path (never a URL, never `//host`, no
 * `..` segment); `alt` is authored text only; `width`/`height` are positive integers, both or
 * neither. Strict: an unknown key (a `url`, a `hasMore`, …) is refused.
 *
 * 08 MD-1a (producer hardening, stricter than D1's regex, never looser): a WHATWG URL parser treats
 * `%2e` / `%2E` as a dot, so `/assets/%2e%2e/x` IS a `..` segment once resolved. `src` must
 * therefore also be a UR2 path (isRootRelativePath: no empty, `.` or `..` segment, well-formed
 * percent escapes) and carry no encoded dot, slash, backslash or NUL. This producer only emits
 * content-addressed `/assets/<hex>.<ext>` paths, so none of this ever fires on real output.
 */
const ENCODED_PATH_META_RE = /%(2e|2f|5c|00)/i;
export const MediaImageSchema = z
  .object({
    src: z
      .string()
      .regex(MEDIA_SRC_RE, { message: "media src must be a same-origin absolute path (08 §2)" })
      .refine((src) => !src.split("/").includes(".."), { message: "media src must not contain a `..` segment (08 §2)" })
      .refine((src) => isRootRelativePath(src) && !ENCODED_PATH_META_RE.test(src), {
        message: "media src must be a UR2 path with no empty / dot segment and no percent-encoded dot, slash, backslash or NUL (08 MD-1a)",
      }),
    // MD-4: authored text — never blank (the content model trims, so this never fires on real data)
    alt: z.string().min(1).max(MEDIA_ALT_MAX).regex(/\S/, { message: "media alt must not be blank (08 MD-4)" }).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict()
  .refine((m) => (m.width === undefined) === (m.height === undefined), { message: "media width and height are both present or both absent (08 §2)" });
/**
 * 08 §2 — `{ cover?, gallery?, totalCount? }`, never empty. `totalCount` is present exactly when
 * `gallery` is, is ≥ gallery.length, and `gallery.length === min(totalCount, 12)` (the producer
 * exports the first 12 in authored order). There is no `hasMore`: consumers derive it as
 * `totalCount > gallery.length` — booleans are not part of the schema.
 */
export const PortfolioMediaSchema = z
  .object({
    cover: MediaImageSchema.optional(),
    gallery: z.array(MediaImageSchema).min(1).max(MEDIA_GALLERY_MAX).optional(),
    totalCount: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((m) => m.cover !== undefined || m.gallery !== undefined, { message: "media is omitted when it has neither cover nor gallery — never {} (08 §2)" })
  .refine((m) => (m.gallery === undefined) === (m.totalCount === undefined), { message: "media totalCount is present exactly when gallery is (08 §2)" })
  .refine((m) => m.gallery === undefined || m.totalCount === undefined || m.totalCount >= m.gallery.length, { message: "media totalCount must be ≥ gallery.length (08 §2)" })
  .refine((m) => m.gallery === undefined || m.totalCount === undefined || m.gallery.length === Math.min(m.totalCount, MEDIA_GALLERY_MAX), {
    message: `media gallery.length must equal min(totalCount, ${MEDIA_GALLERY_MAX}) (08 §2)`,
  });
export const PortfolioRecordSchema = z
  .object({
    id: z.string().regex(CONTRACT_ID_RE).max(CONTRACT_ID_MAX),
    title: z.string().min(1).max(TITLE_MAX),
    detailUrl: UrlRef,
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    location: z.string().min(1).max(LOCATION_MAX).optional(),
    projectType: z.enum(PROJECT_TYPES).optional(),
    property: PropertySchema.optional(),
    // WS5 / INV-18: non-empty when present — `[]` is never emitted, the key is omitted instead.
    workScopeIds: z.array(WorkScopeIdSchema).min(1).max(WORK_SCOPE_IDS.length).optional(),
    pricing: PricingSchema.optional(),
    facets: z.record(KindOrFacetKey, z.array(z.string().min(1).max(FACET_ID_MAX)).min(1)).optional(),
    // 08 — optional: a record without `media` is exactly a 1.0 record, and stays valid.
    media: PortfolioMediaSchema.optional(),
  })
  .strict();
export const PortfolioDocumentSchema = z
  .object({
    schemaVersion: z.literal(PORTFOLIO_SCHEMA_VERSION),
    resource: z.literal(PORTFOLIO_KIND),
    version: z.string().regex(VERSION_RE),
    listingUrl: UrlRef.optional(),
    workScopes: z.array(WorkScopeIdSchema).min(1).optional(),
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
  // 07 §9.3 — the emitter's warn-and-omit case (an RD1 guard failure) travels to the build here,
  // through the same channel as a VO6 over-limit warning. It is never an error.
  warnings.push(...e.portfolio.warnings);
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
  const usedWorkScopes = new Set<string>();
  const declaredWorkScopes = doc.workScopes ?? [];
  doc.records.forEach((r, i) => {
    const at = `portfolio.records[${i}] (${r.id})`;
    if (ids.has(r.id)) errors.push(`${at}: duplicate record id (ID3)`);
    ids.add(r.id);
    if (i > 0 && compareCodePoints(doc.records[i - 1]!.id, r.id) >= 0) errors.push(`${at}: records are not in id code point order (§6.1)`);
    if (!ctx.pagePaths.has(r.detailUrl)) errors.push(`${at}: detailUrl ${r.detailUrl} has no page in this build (INV-5)`);
    if (!r.facets?.category || r.facets.category.length !== 1) errors.push(`${at}: facets.category must have exactly one value (§11.3, INV-16)`);

    // ---- built-space annex (07 §5–§9, INV-17 … INV-28) ----
    // WS1/WS2/WS3 (INV-17): vocabulary, uniqueness, and forward closure against the document's own
    // declaration. An unknown id is a producer bug, not a consumer-side unknown value.
    for (const id of r.workScopeIds ?? []) {
      if (!(WORK_SCOPE_IDS as readonly string[]).includes(id)) errors.push(`${at}: workScopeIds value "${id}" is not in the contract vocabulary (WS1, 07 §7.3)`);
      else if (!declaredWorkScopes.includes(id)) errors.push(`${at}: workScopeIds value "${id}" is not declared in document.workScopes (WS2, INV-17)`);
      usedWorkScopes.add(id);
    }
    if (r.workScopeIds && new Set(r.workScopeIds).size !== r.workScopeIds.length) errors.push(`${at}: workScopeIds repeats a value (WS3: it is a set)`);
    // INV-28 — WS7a's closed set is `workScopeIds ∩ Spaces` (the spaces that were remodelled), not
    // `workScopeIds` as a whole; the works in it stay open even for a partial (WS7b). A non-empty
    // `workScopeIds` is what INV-28 requires, and the interpretability of `pricing.total` depends on it.
    if (r.projectType === "partial_remodel" && (r.workScopeIds ?? []).length === 0) {
      errors.push(`${at}: projectType "partial_remodel" requires a non-empty workScopeIds (WS7a, INV-28)`);
    }
    // INV-29 — a `full_remodel` remodelled the dwelling's SPACES. A record whose scopes are trades
    // only (바닥·도배·조명) is 07 PT4(c): every space touched, but not a remodel's total — and it
    // must never reach D-1, which is exactly the number this rule keeps out of the document.
    if (r.projectType === "full_remodel" && !(r.workScopeIds ?? []).some((id) => (WORK_SCOPE_SPACE_IDS as readonly string[]).includes(id))) {
      errors.push(`${at}: projectType "full_remodel" requires at least one SPACE work scope (07 §7.3 spaces table); trades alone are PT4(c) (INV-29)`);
    }
    // INV-30 — the mirror of INV-29. INV-28 only requires non-emptiness, so a trades-only
    // `partial_remodel` passed it while leaving `workScopeIds ∩ Spaces` empty: no bounded set of
    // spaces, hence nothing for `pricing.total` to cover and nothing for WS7a to close over. PT5
    // sends such a job to breadth-absent instead.
    if (r.projectType === "partial_remodel" && !(r.workScopeIds ?? []).some((id) => (WORK_SCOPE_SPACE_IDS as readonly string[]).includes(id))) {
      errors.push(`${at}: projectType "partial_remodel" requires at least one SPACE work scope (07 §7.3 spaces table); a trades-only job is breadth-absent, not a partial (PT5, INV-30)`);
    }
    // ST4 / INV-24 — one fact, one carrier: no value in both `style` and `tag`.
    const style = r.facets?.style ?? [];
    const tag = r.facets?.tag ?? [];
    const both = style.filter((v) => tag.includes(v));
    if (both.length > 0) errors.push(`${at}: ${both.map((v) => `"${v}"`).join(", ")} appear in both facets.style and facets.tag (ST4, INV-24)`);
    // D-1 (07 §9.3): a DERIVED per-area price is admissible only under the five conditions, and its
    // value must be exactly RD1's integer result for this record's own total and area.
    // INV-21 (an authored perArea is never replaced) is enforced at the emitter — the derivation is
    // not even attempted when `pricePerArea` is authored — and is covered by a crafted-snapshot
    // test; the document alone cannot distinguish a correct authored value from a replaced one.
    const perArea = r.pricing?.perArea;
    if (perArea && perArea.source === "derived") {
      if (r.projectType !== "full_remodel") errors.push(`${at}: pricing.perArea is derived but projectType is ${r.projectType === undefined ? "absent" : `"${r.projectType}"`} (D-1a, INV-19)`);
      else {
        const guardFailures: string[] = [];
        const expected = derivePerArea({ projectType: r.projectType, total: r.pricing?.total, area: r.property?.area }, (why) => guardFailures.push(why));
        if (!expected) errors.push(`${at}: pricing.perArea is derived but D-1's conditions do not hold${guardFailures.length ? ` (${guardFailures.join("; ")})` : ""} (07 §9.3)`);
        else if (expected.amount !== perArea.amount || expected.currency !== perArea.currency || expected.perUnit !== perArea.perUnit) {
          errors.push(`${at}: derived pricing.perArea ${JSON.stringify(perArea)} ≠ RD1's result ${JSON.stringify(expected)} (INV-20, RD1)`);
        }
      }
    }
    // INV-20, the other direction: where D-1's conditions hold and RD1's guards pass, the derived
    // perArea MUST be there. A guard failure makes derivePerArea return nothing, so the warn-and-omit
    // case of 07 §9.3 stays legal; any perArea at all (an authored one wins, PA1) satisfies this.
    if (!perArea && r.projectType === "full_remodel") {
      const due = derivePerArea({ projectType: r.projectType, total: r.pricing?.total, area: r.property?.area }, () => {});
      if (due) errors.push(`${at}: D-1's conditions hold but no derived pricing.perArea was emitted (expected ${JSON.stringify(due)}) (INV-20)`);
    }

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
  // WS2 reverse closure + ordering (07 §7.2, §11): declared ⊆ used, sorted, unique, and the block
  // is absent exactly when no record has a work scope.
  for (let i = 1; i < declaredWorkScopes.length; i++) {
    if (compareCodePoints(declaredWorkScopes[i - 1]!, declaredWorkScopes[i]!) >= 0) errors.push(`portfolio.workScopes: ids are not in code point order (07 §11)`);
  }
  if (new Set(declaredWorkScopes).size !== declaredWorkScopes.length) errors.push("portfolio.workScopes: duplicate id");
  for (const id of declaredWorkScopes) if (!usedWorkScopes.has(id)) errors.push(`portfolio.workScopes: "${id}" is declared but no record uses it (WS2, INV-17)`);
  if (doc.workScopes === undefined && usedWorkScopes.size > 0) errors.push("portfolio.workScopes is absent although records carry work scopes (WS2, INV-17)");
  if (doc.workScopes !== undefined && usedWorkScopes.size === 0) errors.push("portfolio.workScopes is present although no record carries a work scope (WS2)");

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
