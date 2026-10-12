import { z } from "zod";
import { FORBIDDEN_CHAR_RE } from "../site/head-scripts";
import { HASH_RE } from "../../workers/recon-runtime/src/contract";
import { BRAND_LIMITS, brandFieldsSet, brandLimits, brandSupport, judgeAppearance } from "./brand";
import { PROVISION_SPEC_SCHEMA, ProvisionError, isUuid, validateProvisionSpec, type ProvisionSpec } from "./spec";
import type { Starter } from "./starter";
import type { ReleaseRecord } from "../release/release";

/**
 * The rebuild spec — what BoostChat hands the runner to build a NEW shell package for an EXISTING
 * provisioned site (boost-chat docs/work/site-design-platform/CONTRACTS.md §4, §7, §8, §9.3).
 * Like the provisioning spec it is DATA and strict: a key the contract does not name is refused,
 * never ignored; nothing in it is HTML, CSS, a path or a command. Brand text is plain text, colours
 * are `#RRGGBB`, images are references (AssetRef) to bytes the runner fetches and verifies itself.
 *
 * The brand name, phone number and e-mail address are RESOLVED by BoostChat and arrive at the top level
 * (`identity.brandName`, `contact.phone`, `contact.email`); the BrandBlock does not repeat them, so this
 * module never merges two sources.
 *
 *   parseRebuildSpec(raw)                      shape only (zod, strict)
 *   validateRebuildSpec({ repoRoot, raw })     every file-free rule + the provisioning checks the base
 *                                              fields already have (host suffix, starter lists the
 *                                              release, release verifies, hash equal, runtime capable)
 *                                              + asset keys + brand rules + per-release support (brand.ts)
 *
 * Nothing is silently dropped: a BrandBlock field the pinned release cannot express is refused with
 * `brand_field_unsupported` naming the fields. `indexing` is obeyed as given: whether a site may be
 * indexed is decided by BoostChat (`indexing_allowed`), not here.
 *
 * `design` ({presetId, presetVersion} | null) is only SHAPE here: the preset is resolved, held to the
 * target release and judged together with the brand colours by the plan (rebuild.ts, the design seam).
 * So the brand colours are judged against the starter's palette here ONLY when `design` is null — with a
 * preset, the colours that end up together are the preset's and the brand's, and the plan judges those.
 */

export const REBUILD_SPEC_SCHEMA = "site-rebuild-spec@1";

/** Closed set of the codes this module (and rebuild.ts / brand.ts / rebuild-runner.ts) raises; the provisioning codes of spec.ts are raised as they are. */
export const REBUILD_ERROR_CODES = [
  "rebuild_spec_invalid",
  "rebuild_id_invalid",
  "source_ref_invalid",
  "source_ref_mismatch",
  "snapshot_hash_invalid",
  // the design seam (rebuild.ts): the preset named by `design`, and what the design step can express
  "design_unavailable", // the template has no design system, or no preset of that id
  "design_version_mismatch", // the preset exists, at another version than the spec names
  "design_release_too_old", // the target release cannot read a design document: its template version is below the preset's minRelease, or it does not carry the design system
  "design_invalid", // the preset file, or the design document composed from it, breaks the contract
  "design_unsupported", // a valid request the design step cannot express
  "brand_invalid",
  "brand_field_unsupported",
  "brand_value_exceeds_slot",
  "brand_support_unknown_template",
  "contrast_too_low",
  "asset_ref_invalid",
  "asset_key_refused",
  "asset_fetch_failed",
  "asset_missing",
  "asset_size_mismatch",
  "asset_hash_mismatch",
  "asset_media_type_mismatch",
  "asset_dimension_mismatch",
  "brand_apply_failed",
  "package_check_failed",
] as const;
export type RebuildErrorCode = (typeof REBUILD_ERROR_CODES)[number];

/** A ProvisionError whose code is one of REBUILD_ERROR_CODES (so everything that handles ProvisionError handles it). */
export class RebuildError extends ProvisionError {
  declare readonly code: RebuildErrorCode;
  constructor(code: RebuildErrorCode, message: string) {
    super(code, message);
    this.name = "RebuildError";
  }
}
function refuse(code: RebuildErrorCode, message: string): never {
  throw new RebuildError(code, message);
}

// ------------------------------------------------------------------ schema --

export const ASSET_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type BrandAssetMediaType = (typeof ASSET_MEDIA_TYPES)[number];
export const INDEXING_VALUES = ["noindex", "index"] as const;
export type Indexing = (typeof INDEXING_VALUES)[number];
export const SURFACES = ["warm", "neutral", "cool", "dark"] as const;
export const TYPOGRAPHIES = ["modern-sans", "editorial-serif", "soft-rounded"] as const;

const ASSET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** `assetKeyPrefix` of the snapshot (CONTRACTS §4): `<tenantId>/brand/`. */
export const ASSET_KEY_PREFIX_RE = new RegExp(`^${UUID}/brand/$`);
/** …and the rest of every key: `<uuid>.<jpg|png|webp>`. Matched against the part after the prefix, so the whole key is `^<assetKeyPrefix><uuid>\.(jpg|png|webp)$`. */
const ASSET_KEY_NAME_RE = new RegExp(`^${UUID}\\.(?:jpg|png|webp)$`);
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_LOGO_BYTES = 1024 * 1024;
export const MAX_ASSET_SIDE = 8000;

/** `AssetRef` of CONTRACTS §4. */
export const AssetRefSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    sha256: z.string(),
    mediaType: z.enum(ASSET_MEDIA_TYPES),
    width: z.number().int(),
    height: z.number().int(),
    bytes: z.number().int(),
  })
  .strict();
export type AssetRef = z.infer<typeof AssetRefSchema>;

/**
 * `BrandBlock@1` of CONTRACTS §7. Shape only here; the value rules (lengths, plain text, colours, URLs)
 * are checked by validateBrand so that each refusal names its field.
 */
export const BrandBlockSchema = z
  .object({
    identity: z
      .object({
        tagline: z.string(),
        introduction: z.object({ title: z.string(), body: z.array(z.string()), image: z.string().nullable() }).strict().partial(),
        specialties: z.array(z.string()),
        logo: z.string().nullable(),
      })
      .strict()
      .partial(),
    hero: z
      .object({
        heading: z.string(),
        supportingText: z.string(),
        image: z.string().nullable(),
        focal: z.object({ x: z.number(), y: z.number() }).strict(),
        cta: z.object({ label: z.string(), target: z.enum(["contact", "portfolio"]) }).strict(),
        overlay: z.enum(["none", "soft", "strong"]),
      })
      .strict()
      .partial(),
    contact: z
      .object({
        consultationUrl: z.string().nullable(),
        serviceArea: z.string(),
        address: z.string(),
        hours: z.string(),
      })
      .strict()
      .partial(),
    appearance: z
      .object({
        primaryColor: z.string(),
        accentColor: z.string(),
        surface: z.enum(SURFACES),
        typography: z.enum(TYPOGRAPHIES),
      })
      .strict()
      .partial(),
  })
  .strict()
  .partial();
export type BrandBlock = z.infer<typeof BrandBlockSchema>;

/** `site-rebuild-spec@1` = the snapshot minus tenantId / base / capturedAt, plus rebuildId and snapshotSha256 (CONTRACTS §9.3). */
export const RebuildSpecSchema = z
  .object({
    schema: z.literal(REBUILD_SPEC_SCHEMA),
    rebuildId: z.string(),
    siteId: z.string(),
    hostname: z.string(),
    publicOrigin: z.string(),
    template: z.object({ templateId: z.string(), releaseId: z.string(), releaseHash: z.string() }).strict(),
    sourceRef: z.string(),
    identity: z.object({ brandName: z.string(), locale: z.literal("ko-KR") }).strict(),
    contact: z.object({ phone: z.string().nullable(), email: z.string().nullable() }).strict(),
    boostchat: z.object({ baseUrl: z.string(), widgetScriptUrl: z.string(), widgetKey: z.string(), leadEndpoint: z.string() }).strict(),
    designRevision: z.number().int().nullable(),
    brand: BrandBlockSchema.nullable(),
    design: z.object({ presetId: z.string(), presetVersion: z.number().int() }).strict().nullable(),
    indexing: z.enum(INDEXING_VALUES),
    assetKeyPrefix: z.string(),
    assets: z.array(AssetRefSchema),
    snapshotSha256: z.string(),
  })
  .strict();
export type RebuildSpec = z.infer<typeof RebuildSpecSchema>;

export function parseRebuildSpec(raw: unknown): RebuildSpec {
  const parsed = RebuildSpecSchema.safeParse(raw);
  if (!parsed.success) {
    // paths and zod's own words only — never a value of the document
    const where = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`).join("; ");
    refuse("rebuild_spec_invalid", `the spec is not a ${REBUILD_SPEC_SCHEMA} document (${where})`);
  }
  return parsed.data;
}

// ------------------------------------------------------------------ values --

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Plain text of one line: trimmed, 1..max characters, no `<` `>`, no control / bidi characters. Returns the trimmed text or a problem. */
function plain(value: string, max: number): { ok: true; value: string } | { ok: false; problem: string } {
  const v = value.trim();
  const length = Array.from(v).length;
  if (length < 1 || length > max) return { ok: false, problem: `must be 1..${max} characters` };
  if (FORBIDDEN_CHAR_RE.test(v) || /[<>]/.test(v)) return { ok: false, problem: "must be plain text (no < >, no control or bidi characters, one line)" };
  return { ok: true, value: v };
}

function httpsUrl(value: string, max: number): string | undefined {
  if (value.length > max || FORBIDDEN_CHAR_RE.test(value) || /[\s<>"]/.test(value)) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hostname === "") return undefined;
  return value;
}

/**
 * The value rules of BrandBlock@1. Returns the block with every text trimmed (what is validated is what is
 * rendered). Throws `brand_invalid` naming every field that broke a rule. Limits: brand.ts BRAND_LIMITS.
 */
export function validateBrand(brand: BrandBlock): BrandBlock {
  const L = BRAND_LIMITS;
  const problems: string[] = [];
  const out: BrandBlock = JSON.parse(JSON.stringify(brand)) as BrandBlock;
  const text = (path: string, value: string | undefined, max: number, set: (v: string) => void) => {
    if (value === undefined) return;
    const r = plain(value, max);
    if (r.ok) set(r.value);
    else problems.push(`${path} ${r.problem}`);
  };
  const assetId = (path: string, id: string | null | undefined) => {
    if (typeof id === "string" && !ASSET_ID_RE.test(id)) problems.push(`${path} is not an asset id`);
  };
  const i = out.identity;
  if (i) {
    text("identity.tagline", i.tagline, L.taglineMax, (v) => (i.tagline = v));
    if (i.introduction) {
      const intro = i.introduction;
      text("identity.introduction.title", intro.title, L.introductionTitleMax, (v) => (intro.title = v));
      if (intro.body !== undefined) {
        const body = intro.body;
        if (body.length < 1 || body.length > L.introductionParagraphsMax) problems.push(`identity.introduction.body must hold 1..${L.introductionParagraphsMax} paragraphs`);
        body.forEach((p, n) => text(`identity.introduction.body[${n}]`, p, L.introductionParagraphMax, (v) => (body[n] = v)));
      }
      assetId("identity.introduction.image", intro.image);
    }
    if (i.specialties) {
      if (i.specialties.length < 1 || i.specialties.length > L.specialtiesMax) problems.push(`identity.specialties must hold 1..${L.specialtiesMax} entries`);
      const list = i.specialties;
      list.forEach((s, n) => text(`identity.specialties[${n}]`, s, L.specialtyMax, (v) => (list[n] = v)));
    }
    assetId("identity.logo", i.logo);
  }
  const h = out.hero;
  if (h) {
    text("hero.heading", h.heading, L.heroHeadingMax, (v) => (h.heading = v));
    text("hero.supportingText", h.supportingText, L.heroSupportingTextMax, (v) => (h.supportingText = v));
    assetId("hero.image", h.image);
    if (h.focal && !(h.focal.x >= 0 && h.focal.x <= 100 && h.focal.y >= 0 && h.focal.y <= 100)) problems.push("hero.focal x and y must be 0..100");
    if (h.cta) {
      const cta = h.cta;
      text("hero.cta.label", cta.label, L.ctaLabelMax, (v) => (cta.label = v));
    }
  }
  const c = out.contact;
  if (c) {
    if (typeof c.consultationUrl === "string" && httpsUrl(c.consultationUrl, L.consultationUrlMax) === undefined) problems.push(`contact.consultationUrl must be an https URL of at most ${L.consultationUrlMax} characters or null`);
    text("contact.serviceArea", c.serviceArea, L.serviceAreaMax, (v) => (c.serviceArea = v));
    text("contact.address", c.address, L.addressMax, (v) => (c.address = v));
    text("contact.hours", c.hours, L.hoursMax, (v) => (c.hours = v));
  }
  const a = out.appearance;
  if (a) {
    for (const key of ["primaryColor", "accentColor"] as const) {
      const v = a[key];
      if (v === undefined) continue;
      if (!HEX_COLOR_RE.test(v)) problems.push(`appearance.${key} must be #RRGGBB`);
      else a[key] = v.toLowerCase();
    }
  }
  if (problems.length > 0) refuse("brand_invalid", `the brand block breaks its rules: ${problems.slice(0, 8).join("; ")}${problems.length > 8 ? "; …" : ""}`);
  return out;
}

// -------------------------------------------------------------- validation --

export interface ValidatedRebuildSpec {
  /** the spec with brand texts trimmed */
  spec: RebuildSpec;
  /** the provisioning spec the site renders from: the RESOLVED brand name / phone / e-mail of the spec (what planScaffold and the package check use) */
  effective: ProvisionSpec;
  starter: Starter;
  release: ReleaseRecord;
  /** every AssetRef by id */
  assets: Map<string, AssetRef>;
  /** BrandBlock field paths this release supports / cannot express */
  support: ReturnType<typeof brandSupport>;
}

/**
 * Asset keys (CONTRACTS §4, §9.4): `assetKeyPrefix` is `<uuid>/brand/` and every key is `<assetKeyPrefix><uuid>.<jpg|png|webp>`.
 * Pure string work — it runs before the runner reads anything from the bucket. Throws `asset_key_refused`.
 */
export function checkAssetKeys(prefix: string, refs: readonly { id: string; key: string }[]): void {
  if (!ASSET_KEY_PREFIX_RE.test(prefix)) refuse("asset_key_refused", "assetKeyPrefix must be <tenant uuid>/brand/");
  for (const ref of refs) {
    const name = ref.key.startsWith(prefix) ? ref.key.slice(prefix.length) : undefined;
    if (name === undefined || !ASSET_KEY_NAME_RE.test(name)) refuse("asset_key_refused", `asset "${ref.id}" has a key outside ${prefix}<uuid>.(jpg|png|webp)`);
  }
}

/**
 * parseRebuildSpec + every rule that needs no asset bytes. Order: shape → identifiers → asset keys → the provisioning
 * checks of the base fields → brand values → asset references → per-release support → appearance contrast (no preset).
 * Throws RebuildError / ProvisionError.
 */
export async function validateRebuildSpec(opts: { repoRoot: string; raw: unknown }): Promise<ValidatedRebuildSpec> {
  const parsed = parseRebuildSpec(opts.raw);

  if (!isUuid(parsed.rebuildId)) refuse("rebuild_id_invalid", "rebuildId must be a lowercase UUID");
  if (!/^[0-9a-f]{40}$/.test(parsed.sourceRef)) refuse("source_ref_invalid", "sourceRef must be a 40-character lowercase hex commit id");
  if (!HASH_RE.test(parsed.snapshotSha256)) refuse("snapshot_hash_invalid", "snapshotSha256 must be a sha256 (64 lowercase hex characters)");
  if (parsed.designRevision !== null && parsed.designRevision < 0) refuse("rebuild_spec_invalid", "designRevision must be null or a non-negative integer");
  checkAssetKeys(parsed.assetKeyPrefix, parsed.assets);

  // the base fields have exactly the checks a provisioning spec has — one set of rules
  const { schema: _s, rebuildId: _r, sourceRef: _src, designRevision: _d, brand: _b, design: _dd, indexing: _i, assetKeyPrefix: _p, assets: _a, snapshotSha256: _h, ...baseFields } = parsed;
  const validated = await validateProvisionSpec({ repoRoot: opts.repoRoot, raw: { schema: PROVISION_SPEC_SCHEMA, ...baseFields } });
  const effective = validated.spec;

  const brand = parsed.brand === null ? null : validateBrand(parsed.brand);
  const spec: RebuildSpec = { ...parsed, identity: { ...parsed.identity, brandName: effective.identity.brandName }, brand };

  // assets: structure, uniqueness, and that the brand block and the list name each other exactly
  const assets = new Map<string, AssetRef>();
  const keys = new Set<string>();
  for (const ref of spec.assets) {
    if (!ASSET_ID_RE.test(ref.id)) refuse("asset_ref_invalid", "an asset id is not a valid id");
    if (assets.has(ref.id)) refuse("asset_ref_invalid", `asset "${ref.id}" is listed twice`);
    if (keys.has(ref.key)) refuse("asset_ref_invalid", `asset "${ref.id}" has the key of another asset`);
    if (!HASH_RE.test(ref.sha256)) refuse("asset_ref_invalid", `asset "${ref.id}" sha256 is not a sha256`);
    if (ref.bytes < 1 || ref.bytes > MAX_ASSET_BYTES) refuse("asset_ref_invalid", `asset "${ref.id}" must be 1..${MAX_ASSET_BYTES} bytes`);
    if (ref.width < 1 || ref.height < 1 || ref.width > MAX_ASSET_SIDE || ref.height > MAX_ASSET_SIDE) refuse("asset_ref_invalid", `asset "${ref.id}" sides must be 1..${MAX_ASSET_SIDE} px`);
    assets.set(ref.id, ref);
    keys.add(ref.key);
  }
  const used = new Map<string, string[]>();
  const use = (id: string | null | undefined, field: string) => {
    if (typeof id === "string") used.set(id, [...(used.get(id) ?? []), field]);
  };
  use(brand?.identity?.logo, "identity.logo");
  use(brand?.hero?.image, "hero.image");
  use(brand?.identity?.introduction?.image, "identity.introduction.image");
  for (const [id, fields] of used) if (!assets.has(id)) refuse("asset_ref_invalid", `${fields.join(", ")} names asset "${id}", which the spec's assets do not list`);
  for (const id of assets.keys()) if (!used.has(id)) refuse("asset_ref_invalid", `asset "${id}" is listed but no brand field uses it`);
  const logo = brand?.identity?.logo ? assets.get(brand.identity.logo) : undefined;
  if (logo && logo.bytes > MAX_LOGO_BYTES) refuse("asset_ref_invalid", `the logo "${logo.id}" is larger than ${MAX_LOGO_BYTES} bytes`);

  // per-release support: nothing is silently dropped
  const support = brandSupport(effective.template.templateId, effective.template.releaseId, validated.release);
  if (brand) {
    const unsupported = brandFieldsSet(brand).filter((f) => support.unsupported.includes(f));
    if (unsupported.length > 0) refuse("brand_field_unsupported", `release ${effective.template.releaseId} cannot express: ${unsupported.join(", ")}`);
    const limits = brandLimits(effective.template.templateId, effective.template.releaseId, validated.release);
    const tooLong = brand.identity?.introduction?.body?.findIndex((p) => limits.introductionParagraphMax !== undefined && Array.from(p).length > limits.introductionParagraphMax);
    if (tooLong !== undefined && tooLong >= 0) refuse("brand_value_exceeds_slot", `identity.introduction.body[${tooLong}] is longer than the ${limits.introductionParagraphMax} characters release ${effective.template.releaseId} can show in one paragraph`);
    // contrast on the starter's palette — the palette of a site WITHOUT a preset. With one, the plan judges the colours that end up together.
    if (brand.appearance && parsed.design === null) judgeAppearance(brand.appearance);
  }

  return { spec, effective, starter: validated.starter, release: validated.release, assets, support };
}
