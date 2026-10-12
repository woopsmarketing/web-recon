import { ALLOWED_MEDIA_TYPES, AssetRegistryDocSchema } from "../assets/assets";
import { BannersDocSchema } from "../content/schema";
import { loadRelease } from "../release/release";
import { SiteInstanceSchema } from "../site/instance";
import { RebuildError, type AssetRef, type BrandBlock, type Indexing } from "./rebuild-spec";
import { loadStarter } from "./starter";

/**
 * Applying a brand block and an indexing value to the planned site files of a provisioned site
 * (CONTRACTS §7, §8). PURE: a Map<site-relative path, bytes> in, a new Map out. The input is the
 * output of planScaffold (the starter rendered with the spec), so a rebuild begins from exactly the
 * files a provisioning would write; this module changes only the files named below and leaves every
 * other entry the SAME Buffer.
 *
 * What the spec can say never becomes markup: text goes into slot / banner strings of the site's own
 * JSON documents (plain text, already validated), colours become theme token values (`rgb(r, g, b)`
 * built from numbers), images become registry entries of files whose bytes the caller verified.
 *
 * Field → file mapping (interior-02, releases 1.1.0 and 1.1.2 — the data model is identical). The brand name,
 * the phone number and the e-mail address are NOT brand fields: the spec carries their RESOLVED values at the top
 * level (identity.brandName, contact.phone, contact.email) and the starter render writes them, exactly like a provisioning.
 *
 *   identity.tagline        slots.json  site.menu.slogan
 *   identity.introduction   slots.json  about.page.introTitle / introBody; the image: about.page.photoMedia (+ registry + file)
 *   identity.logo           site.json identity.logo + assets/registry.json + assets/<file>   (header logo; footer keeps the wordmark)
 *   hero.heading/cta        content/banners.json: slide 0 only — `headline` (heading) and `cta` (label; target = the contact page);
 *                           every other field of slide 0 (id, status, image, text) and every other slide stay as the starter had them
 *   hero.image (+ heading/cta)  content/banners.json: the starter's hero slides are replaced by ONE slide carrying the customer's image
 *                           (headline = the heading, else the starter's first headline; cta as above; the starter's banner `text` is dropped)
 *                           (+ registry + file for the image)
 *   contact.address         slots.json  site.footer.location1Name / location1Address (+ locationsLabel)
 *   contact.hours           slots.json  site.footer.hours1Label / hours1Value (+ locationsLabel)
 *   contact.serviceArea     slots.json  site.footer.locationsNote (+ locationsLabel)
 *   appearance.*            theme.json  tokens (surface preset, primary → action / strong border + derived on-colours, accent)
 *   appearance.typography   nothing here: it is a font set, written by the design step that follows (platform/design/apply.ts) — only
 *                           on a release that carries the design system (brandSupport)
 *   indexing                settings.json  overrides["site.seo"].indexing
 *
 * A `null` image (logo, hero.image, identity.introduction.image) means "the starter's own": the same as the key being absent.
 */

/**
 * The closed list of BrandBlock field paths — dotted leaves, the SAME vocabulary as boost-chat `src/lib/site-design/brand-fields.ts`
 * (CONTRACTS E7). `identity.introduction.*` and `hero.cta` are leaves on purpose: a release that renders a call to action renders
 * both its label and its target; an enum VALUE a release cannot express is listed as `path:value` (e.g. `hero.cta.target:portfolio`).
 */
export const BRAND_FIELD_PATHS = [
  "identity.tagline",
  "identity.introduction.title",
  "identity.introduction.body",
  "identity.introduction.image",
  "identity.specialties",
  "identity.logo",
  "hero.heading",
  "hero.supportingText",
  "hero.image",
  "hero.focal",
  "hero.cta",
  "hero.overlay",
  "contact.consultationUrl",
  "contact.serviceArea",
  "contact.address",
  "contact.hours",
  "appearance.primaryColor",
  "appearance.accentColor",
  "appearance.surface",
  "appearance.typography",
] as const;
export type BrandFieldPath = (typeof BRAND_FIELD_PATHS)[number];

/** Text limits of BrandBlock@1 (CONTRACTS §7) — the ONE table: validateBrand reads it and brand-support.json prints it. */
export const BRAND_LIMITS = {
  taglineMax: 60,
  introductionTitleMax: 60,
  introductionParagraphMax: 300,
  introductionParagraphsMax: 4,
  specialtiesMax: 6,
  specialtyMax: 24,
  heroHeadingMax: 40,
  heroSupportingTextMax: 120,
  ctaLabelMax: 16,
  serviceAreaMax: 60,
  addressMax: 120,
  hoursMax: 60,
  consultationUrlMax: 300,
} as const;

/**
 * Per template release: why a field is NOT supported (reviewed against the stored release, not against the working tree).
 *   hero.supportingText      banner `text` is not rendered by HomeHero (only headline, project facts and the CTA are)
 *   hero.focal / hero.overlay  the hero image is `object-fit: cover` centred and the scrim is CSS of the release
 *   hero.cta.target:portfolio  a banner CTA can name a project or the contact destination, never the project list
 *   contact.consultationUrl  link slots accept /path, #anchor, mailto: and tel: only; package QA refuses off-origin links
 *   identity.specialties     no slot lists services; the lineup / tier slots are coupled to the service page copy
 *   appearance.typography    the release loads no font file (@font-face / next/font): a profile would name fonts the visitor may not have
 * identity.introduction.image IS supported: the about page's `photoMedia` slot shows it.
 */
const INTERIOR_02_UNSUPPORTED: readonly string[] = [
  "identity.specialties",
  "hero.supportingText",
  "hero.focal",
  "hero.overlay",
  "hero.cta.target:portfolio",
  "contact.consultationUrl",
  "appearance.typography",
];
/**
 * A release of interior-02 that CARRIES THE DESIGN SYSTEM (CONTRACTS Part E): it places the font files of a font set in the
 * package, so `appearance.typography` is supported — `modern-sans` and `editorial-serif`. `soft-rounded` is not: the font sets
 * hold no rounded family (CONTRACTS E5), so that one VALUE is listed, in the `path:value` form of `hero.cta.target:portfolio`.
 */
export const TYPOGRAPHY_UNSUPPORTED_VALUE = "appearance.typography:soft-rounded";
const INTERIOR_02_DESIGN_UNSUPPORTED: readonly string[] = [...INTERIOR_02_UNSUPPORTED.filter((f) => f !== "appearance.typography"), TYPOGRAPHY_UNSUPPORTED_VALUE];

interface ReviewedSupport {
  templateId: string;
  unsupported: readonly string[];
  introductionParagraphMax: number;
}
/** The releases whose site-data model was reviewed, by id. Any other (template, release) supports NOTHING — unless its CONTENTS say what it is (below). */
const REVIEWED_RELEASES: Readonly<Record<string, ReviewedSupport>> = {
  "interior-02-1.1.0-be2c1e2d3850": { templateId: "interior-02", unsupported: INTERIOR_02_UNSUPPORTED, introductionParagraphMax: 300 },
  "interior-02-1.1.2-0b35f76a156d": { templateId: "interior-02", unsupported: INTERIOR_02_UNSUPPORTED, introductionParagraphMax: 300 },
};

/** What brand support reads of a release: its identity and the path + sha256 of every file it holds (a ReleaseRecord is one). */
export interface ReleaseContents {
  templateId: string;
  releaseId: string;
  files: readonly { path: string; sha256: string }[];
}

/**
 * A DESIGN RELEASE is recognised by what it holds, never by its id (the id of a release is a hash of its bytes: it does not exist
 * before the release is cut). Template "interior-02", and BOTH of:
 *
 *   it carries the design system   the files without which a site's design document cannot be read or its fonts placed
 *                                  (DESIGN_SYSTEM_FILES: the `site.design` setting, the validator, the registry, the token
 *                                  compiler, the font pins)
 *   its brand data model is the    the manifest fragments that declare everything the brand step writes into — `site.seo`,
 *   reviewed one                   `site.menu`, `site.footer` (manifest/shell.ts) and `about.page` (manifest/pages.ts) — are
 *                                  BYTE-IDENTICAL to those of the reviewed releases 1.1.0 / 1.1.2 (REVIEWED_DATA_MODEL)
 *
 * A release that carries the design system but changed one of those fragments supports NOTHING until it is reviewed and its
 * hashes are added here: fail closed, exactly like a release id nobody reviewed.
 */
const DESIGN_TEMPLATE_DIR: Readonly<Record<string, string>> = { "interior-02": "templates/interior-02/v1" };
export const DESIGN_SYSTEM_FILES: readonly string[] = ["manifest/design.ts", "design/contract.ts", "design/registry.ts", "design/tokens.ts", "design/fonts.json"];
const REVIEWED_DATA_MODEL: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  "interior-02": {
    "manifest/shell.ts": ["495cd81a50babf06b4dcc2a2e35c71b4ea8645ce7ca2e696b66df86b07e4aa13"],
    "manifest/pages.ts": ["b50ece93c914d62abeea6bc3e0387b281ba781dfae5638590ce7f78433442575"],
  },
};

/** true = the release holds every file of the design system: a site built on it can carry a design document and a font set. */
export function carriesDesignSystem(release: ReleaseContents): boolean {
  const dir = Object.hasOwn(DESIGN_TEMPLATE_DIR, release.templateId) ? DESIGN_TEMPLATE_DIR[release.templateId]! : undefined;
  if (dir === undefined) return false;
  const paths = new Set(release.files.map((f) => f.path));
  return DESIGN_SYSTEM_FILES.every((rel) => paths.has(`${dir}/${rel}`));
}

function reviewedDataModel(release: ReleaseContents): boolean {
  const dir = DESIGN_TEMPLATE_DIR[release.templateId]!;
  const model = Object.hasOwn(REVIEWED_DATA_MODEL, release.templateId) ? REVIEWED_DATA_MODEL[release.templateId]! : undefined;
  if (!model) return false;
  const hashes = new Map(release.files.map((f) => [f.path, f.sha256]));
  return Object.entries(model).every(([rel, reviewed]) => reviewed.includes(hashes.get(`${dir}/${rel}`) ?? ""));
}

function reviewedOf(templateId: string, releaseId: string, release?: ReleaseContents): ReviewedSupport | undefined {
  const byId = Object.hasOwn(REVIEWED_RELEASES, releaseId) ? REVIEWED_RELEASES[releaseId] : undefined;
  if (byId) return byId.templateId === templateId ? byId : undefined;
  if (!release || release.templateId !== templateId || release.releaseId !== releaseId) return undefined;
  if (templateId === "interior-02" && carriesDesignSystem(release) && reviewedDataModel(release)) {
    return { templateId, unsupported: INTERIOR_02_DESIGN_UNSUPPORTED, introductionParagraphMax: 300 };
  }
  return undefined;
}

export interface BrandSupport {
  supported: string[];
  unsupported: string[];
}

/**
 * Which BrandBlock field paths this template release can express in site data, and which not. Fails closed for a release
 * that was not reviewed. `release` (its record: the list of its files) is what a design release is recognised by; without it
 * only the releases reviewed by id are known.
 */
export function brandSupport(templateId: string, releaseId: string, release?: ReleaseContents): BrandSupport {
  const reviewed = reviewedOf(templateId, releaseId, release);
  if (!reviewed) return { supported: [], unsupported: [...BRAND_FIELD_PATHS] };
  const unsupported = reviewed.unsupported.slice();
  // a value-qualified entry ("hero.cta.target:portfolio") restricts a supported field; the plain path stays supported
  const blocked = new Set(unsupported);
  return { supported: BRAND_FIELD_PATHS.filter((p) => !blocked.has(p)), unsupported };
}

/** Value limits of the slots a field lands in, where a release is tighter than BrandBlock@1. */
export function brandLimits(templateId: string, releaseId: string, release?: ReleaseContents): { introductionParagraphMax?: number } {
  const reviewed = reviewedOf(templateId, releaseId, release);
  return reviewed ? { introductionParagraphMax: reviewed.introductionParagraphMax } : {};
}

/** The field paths a brand block actually sets (a `null` is "not set": there is nothing to drop). */
export function brandFieldsSet(brand: BrandBlock): string[] {
  const set: string[] = [];
  const has = (v: unknown) => v !== undefined && v !== null;
  const i = brand.identity;
  if (has(i?.tagline)) set.push("identity.tagline");
  if (has(i?.introduction?.title)) set.push("identity.introduction.title");
  if (has(i?.introduction?.body)) set.push("identity.introduction.body");
  if (has(i?.introduction?.image)) set.push("identity.introduction.image");
  if (has(i?.specialties)) set.push("identity.specialties");
  if (has(i?.logo)) set.push("identity.logo");
  const h = brand.hero;
  if (has(h?.heading)) set.push("hero.heading");
  if (has(h?.supportingText)) set.push("hero.supportingText");
  if (has(h?.image)) set.push("hero.image");
  if (has(h?.focal)) set.push("hero.focal");
  if (has(h?.cta)) set.push("hero.cta", ...(h?.cta?.target === "portfolio" ? ["hero.cta.target:portfolio"] : []));
  if (has(h?.overlay)) set.push("hero.overlay");
  const c = brand.contact;
  if (has(c?.consultationUrl)) set.push("contact.consultationUrl");
  if (has(c?.serviceArea)) set.push("contact.serviceArea");
  if (has(c?.address)) set.push("contact.address");
  if (has(c?.hours)) set.push("contact.hours");
  const a = brand.appearance;
  if (has(a?.primaryColor)) set.push("appearance.primaryColor");
  if (has(a?.accentColor)) set.push("appearance.accentColor");
  if (has(a?.surface)) set.push("appearance.surface");
  if (has(a?.typography)) set.push("appearance.typography", ...(a?.typography === "soft-rounded" ? [TYPOGRAPHY_UNSUPPORTED_VALUE] : []));
  return set;
}

// ------------------------------------------------------------------ colour --

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
const css = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK: Rgb = [17, 17, 17];
/** The text colour (white or near-black) with the higher contrast on `background`: always at least 4.58:1. */
export function onColour(background: Rgb): Rgb {
  return contrastRatio(WHITE, background) >= contrastRatio(NEAR_BLACK, background) ? WHITE : NEAR_BLACK;
}
export { hexToRgb };

interface SurfacePreset {
  canvas: Rgb;
  secondary: Rgb;
  elevated: Rgb;
  text: Rgb;
  textSecondary: Rgb;
  textMuted: Rgb;
  border: Rgb;
}
/** `warm` is the starter's own palette, so `{surface: "warm"}` changes nothing. */
const SURFACES: Readonly<Record<"warm" | "neutral" | "cool" | "dark", SurfacePreset>> = {
  warm: { canvas: [250, 248, 244], secondary: [242, 238, 231], elevated: [255, 255, 255], text: [35, 34, 32], textSecondary: [87, 83, 78], textMuted: [118, 112, 105], border: [228, 222, 212] },
  neutral: { canvas: [255, 255, 255], secondary: [245, 245, 245], elevated: [255, 255, 255], text: [17, 17, 17], textSecondary: [85, 85, 85], textMuted: [112, 112, 112], border: [221, 221, 221] },
  cool: { canvas: [246, 248, 251], secondary: [236, 240, 246], elevated: [255, 255, 255], text: [24, 30, 40], textSecondary: [71, 80, 94], textMuted: [98, 106, 120], border: [217, 223, 232] },
  dark: { canvas: [20, 20, 22], secondary: [32, 32, 36], elevated: [44, 44, 50], text: [245, 243, 238], textSecondary: [200, 196, 188], textMuted: [160, 156, 148], border: [64, 64, 70] },
};
export const SURFACE_PRESETS = SURFACES;
export const DEFAULT_PRIMARY = "#232220";
export const DEFAULT_ACCENT = "#d9691f";
export const MIN_ACCENT_CONTRAST = 3;
export const MIN_PRIMARY_CONTRAST = 3;
/** What each colour is measured against, per surface (names of the `surfaces` entries of brand-support.json). */
export const ACCENT_AGAINST = ["background", "text"] as const;
export const PRIMARY_AGAINST = ["background"] as const;

/**
 * appearance → theme token overrides. The surface preset sets the page and text colours; the primary colour sets
 * the action colour and the strong border, and the text on it (action text and "inverse" text) is DERIVED by contrast;
 * the accent sets the accent colour. Contrast is checked, never an input:
 *   - the accent against the surface canvas: at least 3:1, and the surface's text colour on the accent at least 3:1
 *     (the release draws its buttons and badges, bold UI labels, in the text colour on the accent; 4.5:1 would refuse ordinary brand oranges on a light surface)
 *   - the primary against the canvas: at least 3:1 (it is the strong border / outline colour)
 * Unset fields take the starter's palette (warm surface, #232220, #d9691f), which passes on `warm` and is refused with the
 * measured ratio on a surface it cannot sit on.
 *
 * THAT JUDGEMENT IS FOR A SITE WITHOUT A DESIGN PRESET: there the starter's palette is what an unset field ends up as. With a
 * preset an unset field ends up as the PRESET's colour, so the pairs that end up together are judged once, by the design step
 * (platform/design/apply.ts, same thresholds), and the brand step only writes the tokens — appearanceTokens, `deferContrast`.
 */
export function resolveAppearance(appearance: NonNullable<BrandBlock["appearance"]>): Record<string, string> {
  judgeAppearance(appearance);
  return appearanceTokens(appearance);
}

/** The contrast rule of resolveAppearance alone: throws `contrast_too_low` naming the colour, what it is measured against and the ratio. */
export function judgeAppearance(appearance: NonNullable<BrandBlock["appearance"]>): void {
  const surfaceName = appearance.surface ?? "warm";
  const s = SURFACES[surfaceName];
  const primaryHex = appearance.primaryColor ?? DEFAULT_PRIMARY;
  const accentHex = appearance.accentColor ?? DEFAULT_ACCENT;
  const primary = hexToRgb(primaryHex);
  const accent = hexToRgb(accentHex);
  const which = (field: "primaryColor" | "accentColor", hex: string) => (appearance[field] === undefined ? `the starter's default ${field} ${hex}` : `appearance.${field} ${hex}`);
  const check = (field: "primaryColor" | "accentColor", hex: string, ratio: number, need: number, against: string) => {
    if (ratio < need) throw new RebuildError("contrast_too_low", `${which(field, hex)} measures ${ratio.toFixed(2)}:1 ${against}; it needs at least ${need}:1`);
  };
  check("accentColor", accentHex, contrastRatio(accent, s.canvas), MIN_ACCENT_CONTRAST, `against the ${surfaceName} surface`);
  check("accentColor", accentHex, contrastRatio(accent, s.text), MIN_ACCENT_CONTRAST, `with the ${surfaceName} surface's text colour on it`);
  check("primaryColor", primaryHex, contrastRatio(primary, s.canvas), MIN_PRIMARY_CONTRAST, `against the ${surfaceName} surface`);
}

/** appearance → theme token overrides, with NO judgement (see resolveAppearance). */
export function appearanceTokens(appearance: NonNullable<BrandBlock["appearance"]>): Record<string, string> {
  const s = SURFACES[appearance.surface ?? "warm"];
  const primary = hexToRgb(appearance.primaryColor ?? DEFAULT_PRIMARY);
  const accent = hexToRgb(appearance.accentColor ?? DEFAULT_ACCENT);
  const onPrimary = onColour(primary);
  return {
    "color.canvas": css(s.canvas),
    "color.surface.primary": css(s.canvas),
    "color.surface.secondary": css(s.secondary),
    "color.surface.elevated": css(s.elevated),
    "color.text.primary": css(s.text),
    "color.text.secondary": css(s.textSecondary),
    "color.text.muted": css(s.textMuted),
    "color.text.inverse": css(onPrimary),
    "color.action.primary": css(primary),
    "color.action.primaryText": css(onPrimary),
    "color.link": css(s.text),
    "color.border.default": css(s.border),
    "color.border.strong": css(primary),
    "color.accent.primary": css(accent),
  };
}

// ---------------------------------------------------------- support document --

export const BRAND_SUPPORT_SCHEMA = "site-brand-support@1";
const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

export interface BrandSupportDocument {
  schema: typeof BRAND_SUPPORT_SCHEMA;
  templateId: string;
  releases: Record<string, BrandSupport>;
  surfaces: Record<"warm" | "neutral" | "cool" | "dark", { background: string; text: string }>;
  contrast: { accentMin: number; primaryMin: number; accentAgainst: readonly string[]; primaryAgainst: readonly string[] };
  limits: Record<keyof typeof BRAND_LIMITS, number>;
}

/**
 * `site-brand-support@1` (CONTRACTS E7) for one template, generated from the tables of this file — the support lists, the
 * surface palettes, the contrast thresholds and the text limits are the very values the build enforces, so a configuration
 * that the document lets through is never refused by the build. `limits` are the strictest values over the template's reviewed
 * releases (the per-release limit can only lower them).
 *
 * `releases` = every release the template's STARTER lists (the releases a site can be rebuilt on: a spec naming any other is
 * refused), each with the support its record derives — so a release cut tomorrow appears here as soon as the starter lists it,
 * with no id written into this file. A listed release that was not reviewed is printed with an empty `supported` list (it would
 * refuse every brand field): the release step treats that as a stop.
 */
export async function brandSupportDocument(opts: { repoRoot: string; templateId: string }): Promise<BrandSupportDocument> {
  const { repoRoot, templateId } = opts;
  const starter = await loadStarter(repoRoot, templateId);
  const ids = [...(starter?.releaseIds ?? [])].sort();
  const releases: Record<string, BrandSupport> = {};
  const reviewed: ReviewedSupport[] = [];
  for (const id of ids) {
    const record = await loadRelease(repoRoot, templateId, id);
    releases[id] = brandSupport(templateId, id, record);
    const r = reviewedOf(templateId, id, record);
    if (r) reviewed.push(r);
  }
  if (reviewed.length === 0) throw new RebuildError("brand_support_unknown_template", `no release of template "${templateId}" has a reviewed brand support table`);
  const surfaces = Object.fromEntries((Object.keys(SURFACES) as (keyof typeof SURFACES)[]).map((name) => [name, { background: hex(SURFACES[name].canvas), text: hex(SURFACES[name].text) }])) as BrandSupportDocument["surfaces"];
  const limits = { ...BRAND_LIMITS } as Record<keyof typeof BRAND_LIMITS, number>;
  limits.introductionParagraphMax = Math.min(limits.introductionParagraphMax, ...reviewed.map((r) => r.introductionParagraphMax));
  return {
    schema: BRAND_SUPPORT_SCHEMA,
    templateId,
    releases,
    surfaces,
    contrast: { accentMin: MIN_ACCENT_CONTRAST, primaryMin: MIN_PRIMARY_CONTRAST, accentAgainst: ACCENT_AGAINST, primaryAgainst: PRIMARY_AGAINST },
    limits,
  };
}

// ----------------------------------------------------------------- applying --

export interface BrandAsset {
  ref: AssetRef;
  bytes: Buffer;
}

/** The id and file a verified brand image gets inside the site: content-addressed, so the same bytes are one registry entry. */
export function siteAssetOf(ref: AssetRef): { id: string; file: string } {
  const ext = ALLOWED_MEDIA_TYPES[ref.mediaType];
  const stem = `brand-${ref.sha256.slice(0, 12)}`;
  return { id: stem, file: `${stem}.${ext}` };
}

const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
type Doc = Record<string, any>;

function fail(message: string): never {
  throw new RebuildError("brand_apply_failed", message);
}
function readDoc(files: Map<string, Buffer>, rel: string, required = true): Doc | undefined {
  const bytes = files.get(rel);
  if (!bytes) {
    if (required) fail(`the planned site has no ${rel}`);
    return undefined;
  }
  return JSON.parse(bytes.toString("utf8")) as Doc;
}

/** Labels the footer needs once an address / hours / service area is shown (the release's neutral defaults are English; the site is ko-KR). */
const FOOTER_LOCATIONS_LABEL = "위치·영업시간";
const FOOTER_ADDRESS_LABEL = "주소";
const FOOTER_HOURS_LABEL = "영업시간";
const SERVICE_AREA_PREFIX = "활동 지역: ";
const HERO_FALLBACK_ID = "hero-brand";

/**
 * Brand block + indexing → the planned files. `assets` holds the verified bytes of every AssetRef the block uses.
 * Does not touch brand name / phone / e-mail: those are rendered into the starter documents by planScaffold from the
 * effective values (rebuild-spec.ts), exactly like a provisioning.
 */
export function applyBrand(opts: {
  files: ReadonlyMap<string, Buffer>;
  brand: BrandBlock | null;
  indexing: Indexing;
  brandName: string;
  assets: ReadonlyMap<string, BrandAsset>;
  /** true = a design preset is applied next: the palette is written without the starter-palette judgement, and the design step judges the colours that end up together */
  deferContrast?: boolean;
}): Map<string, Buffer> {
  const files = new Map(opts.files);
  const { brand } = opts;

  // ---- images → registry + files (logo and hero image) ----
  const registered = new Map<string, { id: string; file: string; ref: AssetRef }>();
  const register = (assetId: string | null | undefined) => {
    if (!assetId) return undefined;
    const asset = opts.assets.get(assetId);
    if (!asset) fail(`asset "${assetId}" has no verified bytes`);
    const site = siteAssetOf(asset.ref);
    if (!registered.has(site.id)) {
      registered.set(site.id, { ...site, ref: asset.ref });
      const rel = `assets/${site.file}`;
      const existing = files.get(rel);
      if (existing && !existing.equals(asset.bytes)) fail(`${rel} already exists with other bytes`);
      files.set(rel, asset.bytes);
    }
    return site;
  };
  const logo = register(brand?.identity?.logo);
  const heroImage = register(brand?.hero?.image);
  const aboutImage = register(brand?.identity?.introduction?.image);
  if (registered.size > 0) {
    const registry = AssetRegistryDocSchema.parse(readDoc(files, "assets/registry.json"));
    for (const { id, file, ref } of registered.values()) {
      if (registry.items.some((e) => e.id === id)) continue;
      registry.items.push({ id, file, mediaType: ref.mediaType, width: ref.width, height: ref.height });
    }
    files.set("assets/registry.json", json(registry));
  }
  if (logo) {
    const site = readDoc(files, "site.json")!;
    files.set("site.json", json(SiteInstanceSchema.parse({ ...site, identity: { ...site.identity, logo: logo.id } })));
  }

  // ---- text → slots ----
  const slotEdits: [section: string, key: string, value: unknown][] = [];
  const i = brand?.identity;
  if (i?.tagline !== undefined) slotEdits.push(["site.menu", "slogan", { paragraphs: [i.tagline] }]);
  if (i?.introduction?.title !== undefined) slotEdits.push(["about.page", "introTitle", i.introduction.title]);
  if (i?.introduction?.body !== undefined) slotEdits.push(["about.page", "introBody", { paragraphs: i.introduction.body }]);
  // the about page's own photo slot (alt text: the introduction title, else the brand name)
  if (aboutImage) slotEdits.push(["about.page", "photoMedia", { asset: aboutImage.id, alt: i?.introduction?.title ?? opts.brandName }]);
  const c = brand?.contact;
  if (c?.address !== undefined) slotEdits.push(["site.footer", "location1Name", FOOTER_ADDRESS_LABEL], ["site.footer", "location1Address", c.address]);
  if (c?.hours !== undefined) slotEdits.push(["site.footer", "hours1Label", FOOTER_HOURS_LABEL], ["site.footer", "hours1Value", c.hours]);
  if (c?.serviceArea !== undefined) slotEdits.push(["site.footer", "locationsNote", `${SERVICE_AREA_PREFIX}${c.serviceArea}`]);
  if (c?.address !== undefined || c?.hours !== undefined || c?.serviceArea !== undefined) slotEdits.push(["site.footer", "locationsLabel", FOOTER_LOCATIONS_LABEL]);
  if (slotEdits.length > 0) {
    const slots = readDoc(files, "slots.json", false);
    if (!slots) fail("the starter has no slots.json to put the brand text in");
    for (const [section, key, value] of slotEdits) {
      slots.values[section] = { ...(slots.values[section] ?? {}), [key]: value };
    }
    files.set("slots.json", json(slots));
  }

  // ---- hero → banners ----
  // Two cases (orchestrator decision D-52):
  //   no hero image in the block (heading and/or CTA)  → EVERY starter slide stays; only slide 0 changes, and only the fields
  //                                                       the block names (`headline` for hero.heading, `cta` for hero.cta)
  //   a hero image in the block                        → the starter's slides are replaced by ONE slide carrying that image
  const h = brand?.hero;
  if (h && (h.heading !== undefined || h.image || h.cta)) {
    const doc = readDoc(files, "content/banners.json", false);
    const base = doc?.items?.[0] as Doc | undefined;
    if (!base && !heroImage) fail("the starter has no hero slide to put the brand heading on, and the block brings no hero image");
    let items: Doc[];
    if (heroImage) {
      const slide: Doc = {
        id: base?.id ?? HERO_FALLBACK_ID,
        status: "published",
        image: { asset: heroImage.id, alt: h.heading ?? opts.brandName },
      };
      const headline = h.heading ?? base?.headline;
      if (headline !== undefined) slide.headline = headline;
      // banner `text` is never shown by the release's hero, so it is not carried over (it would be a stale starter sentence)
      if (h.cta) slide.cta = { label: h.cta.label, target: { kind: "contact" } };
      items = [slide];
    } else {
      const first: Doc = { ...base! };
      if (h.heading !== undefined) first.headline = h.heading;
      if (h.cta) first.cta = { label: h.cta.label, target: { kind: "contact" } };
      items = [first, ...(doc!.items as Doc[]).slice(1)];
    }
    const next = BannersDocSchema.parse({ schema: "banners@1", origin: doc?.origin ?? "customer", items });
    files.set("content/banners.json", json({ ...next, items: next.items.map((b) => orderedBanner(b)) }));
  }

  // ---- appearance → theme ----
  if (brand?.appearance) {
    const tokens = opts.deferContrast ? appearanceTokens(brand.appearance) : resolveAppearance(brand.appearance);
    const doc = readDoc(files, "theme.json", false) ?? { schemaVersion: 1, contract: "theme-contract-v1", tokens: {} };
    const merged: Record<string, string> = { ...doc.tokens };
    for (const [token, value] of Object.entries(tokens)) merged[token] = value;
    if (JSON.stringify(merged) !== JSON.stringify(doc.tokens)) files.set("theme.json", json({ ...doc, tokens: merged }));
  }

  // ---- indexing → settings ----
  const settings = readDoc(files, "settings.json")!;
  if (settings.overrides?.["site.seo"]?.indexing !== opts.indexing) {
    files.set("settings.json", json({ ...settings, overrides: { ...(settings.overrides ?? {}), "site.seo": { ...(settings.overrides?.["site.seo"] ?? {}), indexing: opts.indexing } } }));
  }
  return files;
}

/** Banner keys in the order the starter writes them. */
function orderedBanner(b: Doc): Doc {
  const out: Doc = { id: b.id, status: b.status, image: b.image };
  if (b.headline !== undefined) out.headline = b.headline;
  if (b.text !== undefined) out.text = b.text;
  if (b.cta !== undefined) out.cta = b.cta;
  return out;
}
