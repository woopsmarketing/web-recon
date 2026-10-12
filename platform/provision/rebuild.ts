import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { buildSite, type SiteBuildOptions, type SiteBuildResult } from "../build/site-build";
import { publicAssetPath } from "../assets/assets";
import { applyPreset } from "../design/apply";
import { DesignError } from "../design/errors";
import { loadPreset, type SitePreset } from "../design/preset";
import { SHELL_FILE, ShellDocSchema } from "../portfolio-runtime/contract";
import { declareManagedPortfolio } from "../portfolio-sync/declare";
import type { ReleaseRecord } from "../release/release";
import { THEME_TOKENS, tokenVar } from "../theme/theme";
import { applyBrand, carriesDesignSystem, resolveAppearance, siteAssetOf, type BrandAsset } from "./brand";
import { verifyBuiltPackage, escapeHtmlText, type PackageFacts } from "./package-check";
import { RebuildError, validateRebuildSpec, type AssetRef, type BrandAssetMediaType, type RebuildErrorCode, type RebuildSpec, type ValidatedRebuildSpec } from "./rebuild-spec";
import { planScaffold, scaffoldSite } from "./scaffold";
import { starterDir } from "./starter";
import { ProvisionError } from "./spec";

/**
 * Rebuilding the shell package of an existing provisioned site from a `site-rebuild-spec@1`
 * (CONTRACTS §9.4, the local part: validate → scaffold → assets → build → package check). No claim, no
 * event, no store, no route, no environment variable, no network: the bytes of the brand images are handed in.
 *
 *   planRebuildBase       validate, the design seam (the preset `design` names, resolved and held to the target release), then
 *                         the starter rendered with the spec's RESOLVED brand name / phone / e-mail (so a spec without a brand
 *                         block and without a preset is byte-identical to a provisioning) — and the design JUDGED: the colours
 *                         that end up together, the font set, the composed document. All before any image is fetched
 *   applyRebuildBrand     the brand block and the indexing value applied to those files (brand.ts), then the preset
 *                         (platform/design/apply.ts) — in that order, for the reason given at the seam
 *   planRebuildScaffold   both, with the images verified in between
 *   buildRebuiltSite      plan → data/sites/<siteId>/ → managed marker → buildSite({mode:"public"}) → package check
 *
 * The package check is verifyBuiltPackage (the provisioning checks, run against the effective values) plus what
 * only a rebuild can promise: the indexing meta of the spec on every shell page (404 exempt), the brand's
 * texts, the logo and the hero image present in the package, the planned colours in the site theme, and — for a site
 * with a design document — the design it was planned with on every page, its font set and the licence text beside it.
 */

// -------------------------------------------------------------------- images --

export interface ImageFacts {
  mediaType: BrandAssetMediaType;
  width: number;
  height: number;
}

/** Media type and pixel size from the bytes themselves (PNG, JPEG, WebP); undefined = not one of the three or a truncated header. */
export function detectImage(bytes: Buffer): ImageFacts | undefined {
  // PNG: signature, then the IHDR chunk
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && bytes.subarray(12, 16).toString("latin1") === "IHDR") {
    return { mediaType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  // JPEG: SOI, then segments up to a start-of-frame marker
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let pos = 2;
    while (pos + 4 <= bytes.length) {
      if (bytes[pos] !== 0xff) return undefined;
      const marker = bytes[pos + 1]!;
      if (marker === 0xff) {
        pos += 1;
        continue;
      }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return pos + 9 <= bytes.length ? { mediaType: "image/jpeg", width: bytes.readUInt16BE(pos + 7), height: bytes.readUInt16BE(pos + 5) } : undefined;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        pos += 2;
        continue;
      }
      pos += 2 + bytes.readUInt16BE(pos + 2);
    }
    return undefined;
  }
  // WebP: RIFF container, then VP8 (lossy), VP8L (lossless) or VP8X (extended)
  if (bytes.length >= 30 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    const kind = bytes.subarray(12, 16).toString("latin1");
    if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { mediaType: "image/webp", width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L" && bytes[20] === 0x2f) {
      const [b1, b2, b3, b4] = [bytes[21]!, bytes[22]!, bytes[23]!, bytes[24]!];
      return { mediaType: "image/webp", width: 1 + (b1 | ((b2 & 0x3f) << 8)), height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)) };
    }
    if (kind === "VP8X") return { mediaType: "image/webp", width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  return undefined;
}

/**
 * Every AssetRef of the spec against its bytes: present, exactly `bytes` long, sha256 equal, media type and
 * pixel size from the bytes themselves equal to what the reference claims. Extra entries in `assetBytes` are ignored.
 */
export function verifyRebuildAssets(validated: ValidatedRebuildSpec, assetBytes: ReadonlyMap<string, Buffer>): Map<string, BrandAsset> {
  const out = new Map<string, BrandAsset>();
  for (const ref of validated.assets.values()) {
    const bytes = assetBytes.get(ref.id);
    if (!bytes) throw new RebuildError("asset_missing", `asset "${ref.id}" is referenced by the spec but its bytes were not provided`);
    if (bytes.length !== ref.bytes) throw new RebuildError("asset_size_mismatch", `asset "${ref.id}" is ${bytes.length} bytes, the reference says ${ref.bytes}`);
    if (createHash("sha256").update(bytes).digest("hex") !== ref.sha256) throw new RebuildError("asset_hash_mismatch", `asset "${ref.id}" does not match its sha256`);
    const facts = detectImage(bytes);
    if (!facts || facts.mediaType !== ref.mediaType) throw new RebuildError("asset_media_type_mismatch", `asset "${ref.id}" is ${facts?.mediaType ?? "not a PNG, JPEG or WebP image"}, the reference says ${ref.mediaType}`);
    if (facts.width !== ref.width || facts.height !== ref.height) throw new RebuildError("asset_dimension_mismatch", `asset "${ref.id}" is ${facts.width}×${facts.height}, the reference says ${ref.width}×${ref.height}`);
    out.set(ref.id, { ref, bytes });
  }
  return out;
}

// ---------------------------------------------------------------------- plan --

export interface RebuildPlan {
  validated: ValidatedRebuildSpec;
  /** site-relative path → bytes: what data/sites/<siteId>/ holds before the managed marker */
  files: Map<string, Buffer>;
  assets: Map<string, BrandAsset>;
  /** the preset the spec's `design` names, as applied; null = the spec names none */
  preset: SitePreset | null;
}

/** "1.2.0" against "1.10.0", by number. */
function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((v) => v.split(".").map((n) => Number.parseInt(n, 10)));
  for (let i = 0; i < 3; i++) if ((x![i] ?? 0) !== (y![i] ?? 0)) return (x![i] ?? 0) - (y![i] ?? 0);
  return 0;
}

/** A refusal of the design module under the rebuild's own closed code list (rebuild-spec.ts REBUILD_ERROR_CODES); anything else is returned as it is. */
function asRebuildError(error: unknown): unknown {
  if (!(error instanceof DesignError)) return error;
  const code: RebuildErrorCode = error.code === "design_unavailable" || error.code === "design_unsupported" || error.code === "contrast_too_low" ? error.code : "design_invalid";
  return new RebuildError(code, error.message);
}

/**
 * THE DESIGN SEAM. Scaffold order is starter → preset → brand → indexing (CONTRACTS §9.4, E4) as PRECEDENCE: a brand colour
 * always wins over the preset's, a brand surface and typography when set. As EXECUTION the preset is applied AFTER the brand step
 * (applyRebuildBrand), because the brand step writes the whole palette — its own defaults for every field the block leaves
 * unset — and only the step that is told the block as it was entered can tell a default from a choice (platform/design/apply.ts).
 * So the seam only RESOLVES: `design: null` → null (the plan is then the provisioning scaffold, CONTRACTS §7), else the preset,
 * or a refusal with a stable code — nothing is built for a design the target release cannot read:
 *
 *   design_unavailable        the template has no design system, or it has no preset of that id
 *   design_invalid            the id is not a preset id, or the preset file breaks site-preset@1
 *   design_version_mismatch   the preset exists at another version than the spec names (the catalog BoostChat chose from is not this checkout's)
 *   design_release_too_old    the target release's template version is below the preset's `minRelease`, or the release does not
 *                             carry the design system (it could not read the design document the preset would write)
 */
export async function resolveDesignSeam(opts: { repoRoot: string; design: RebuildSpec["design"]; templateId: string; release: Pick<ReleaseRecord, "templateId" | "releaseId" | "templateVersion" | "files"> }): Promise<SitePreset | null> {
  const { design, release } = opts;
  if (design === null) return null;
  const preset = await loadPreset({ repoRoot: opts.repoRoot, templateId: opts.templateId, presetId: design.presetId }).catch((error: unknown) => {
    throw asRebuildError(error);
  });
  if (preset.version !== design.presetVersion) {
    throw new RebuildError("design_version_mismatch", `preset "${preset.id}" is at version ${preset.version} in this checkout; the spec names version ${design.presetVersion}`);
  }
  if (compareVersions(release.templateVersion, preset.minRelease) < 0) {
    throw new RebuildError("design_release_too_old", `release ${release.releaseId} is template version ${release.templateVersion}; preset "${preset.id}" needs ${preset.minRelease} or later`);
  }
  if (!carriesDesignSystem(release)) {
    throw new RebuildError("design_release_too_old", `release ${release.releaseId} does not carry the design system: a site built on it could not read the design document of preset "${preset.id}"`);
  }
  return preset;
}

/**
 * The brand block and the indexing value, then the design step, onto planned files. With a preset the brand step writes its
 * palette WITHOUT judging it against the starter's colours (`deferContrast`): what ends up together is the preset's surface
 * with the brand's colours, and applyPreset judges exactly those pairs, once — `contrast_too_low` names the colour, where it
 * comes from (the brand block, the preset or the starter), the surface it lands on and the measured ratio. With no preset and
 * no typography the design step returns the files untouched.
 */
function brandThenDesign(opts: { validated: ValidatedRebuildSpec; files: ReadonlyMap<string, Buffer>; assets: ReadonlyMap<string, BrandAsset>; preset: SitePreset | null; brand: RebuildSpec["brand"] }): Map<string, Buffer> {
  const { validated, preset } = opts;
  const branded = applyBrand({ files: opts.files, brand: opts.brand, indexing: validated.spec.indexing, brandName: validated.effective.identity.brandName, assets: opts.assets, deferContrast: preset !== null });
  try {
    return applyPreset(branded, preset, validated.spec.brand?.appearance ?? null);
  } catch (error) {
    throw asRebuildError(error);
  }
}

/**
 * validate → the design seam → the starter rendered with the effective values → the design judged. No image bytes needed: a
 * spec that cannot be built is refused here, before anything is fetched. The judgement is the scaffold step's own code run on
 * the brand block's `appearance` alone (the only part of the block the design step reads; it needs no image): an unreadable
 * colour pair, an unsupported typography or an invalid composed document is the same refusal here as it would be there.
 */
export async function planRebuildBase(opts: { repoRoot: string; spec: unknown; /** already validated from this very `spec` */ validated?: ValidatedRebuildSpec }): Promise<{ validated: ValidatedRebuildSpec; files: Map<string, Buffer>; preset: SitePreset | null }> {
  const validated = opts.validated ?? (await validateRebuildSpec({ repoRoot: opts.repoRoot, raw: opts.spec }));
  const preset = await resolveDesignSeam({ repoRoot: opts.repoRoot, design: validated.spec.design, templateId: validated.effective.template.templateId, release: validated.release });
  const planned = await planScaffold({ repoRoot: opts.repoRoot, spec: validated.effective });
  const appearance = validated.spec.brand?.appearance;
  if (preset !== null || appearance?.typography !== undefined) brandThenDesign({ validated, files: planned.files, assets: new Map(), preset, brand: appearance ? { appearance } : null });
  return { validated, files: planned.files, preset };
}

/** The brand block and the indexing value onto the planned files, then the preset. `assets` = the verified bytes (verifyRebuildAssets); `preset` = planRebuildBase's. */
export function applyRebuildBrand(opts: { validated: ValidatedRebuildSpec; files: ReadonlyMap<string, Buffer>; assets: ReadonlyMap<string, BrandAsset>; preset: SitePreset | null }): Map<string, Buffer> {
  return brandThenDesign({ ...opts, brand: opts.validated.spec.brand });
}

/** Everything a rebuild writes for this spec: site-relative path → bytes. Pure apart from reading the starter, the preset and the release store. */
export async function planRebuildScaffold(opts: { repoRoot: string; spec: unknown; assetBytes: ReadonlyMap<string, Buffer> }): Promise<RebuildPlan> {
  const base = await planRebuildBase(opts);
  const assets = verifyRebuildAssets(base.validated, opts.assetBytes);
  return { validated: base.validated, files: applyRebuildBrand({ validated: base.validated, files: base.files, assets, preset: base.preset }), assets, preset: base.preset };
}

/** sha256 over the starter's files (relative path + bytes, sorted): which starter this rebuild was made from. Reported in the `built` event. */
export async function hashStarter(dir: string): Promise<string> {
  const files: string[] = [];
  const walk = async (rel: string): Promise<void> => {
    for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else if (e.isFile()) files.push(r);
    }
  };
  await walk("");
  const h = createHash("sha256");
  for (const f of files.sort()) h.update(`${f}\0${createHash("sha256").update(await readFile(path.join(dir, f))).digest("hex")}\n`);
  return h.digest("hex");
}

// ------------------------------------------------------------- package check --

/** The pages Next emits for a miss; they carry `noindex` whatever the spec says (CONTRACTS §8). */
export const NOT_FOUND_PAGES: ReadonlySet<string> = new Set(["404.html", "_not-found.html"]);

/**
 * The provisioning package check against the effective values, then what the spec promised:
 *   indexing   every shell page except 404.html says `noindex` (indexing "noindex") or carries no robots meta at all ("index")
 *   brand      the brand name (index.html — verifyBuiltPackage), tagline / address / hours / service area on the shell pages,
 *              the introduction on /about
 *   logo       index.html shows the logo image by its content-addressed path, and the package holds that file
 *   hero       the shell snapshot's first banner is the brand slide (heading, call to action); with a hero IMAGE the snapshot holds exactly
 *              one slide, carrying that image (in the snapshot and in the package); WITHOUT one it holds as many slides as the starter
 *   theme      the site-theme style carries the brand's primary and accent colours
 *   design     (a site planned WITH a design document: a preset, or a brand typography) every page says which design it is
 *              (`<html data-design>`: the preset id, or "custom"), the site theme carries every token of the PLANNED theme.json
 *              (the preset's palette with the brand's colours on top — not the starter-palette tokens of the brand step alone),
 *              and the document's font set is in the package: its stylesheet linked from the page, its licence text beside it
 *
 * `planned` = the site files the package was built from (the plan); read only for a site with a design document.
 */
export async function verifyRebuiltPackage(opts: { repoRoot: string; packageDir: string; validated: ValidatedRebuildSpec; assets: ReadonlyMap<string, BrandAsset>; preset?: SitePreset | null; planned?: ReadonlyMap<string, Buffer> }): Promise<PackageFacts> {
  const { validated } = opts;
  const { spec, effective } = validated;
  const facts = await verifyBuiltPackage({ repoRoot: opts.repoRoot, packageDir: opts.packageDir, spec: effective });
  const siteRoot = path.join(opts.packageDir, "site");
  const fail = (what: string): never => {
    throw new ProvisionError("package_check_failed", `the rebuilt package is not what was asked for: ${what}`);
  };
  const read = async (rel: string) => (await readFile(path.join(siteRoot, rel), "utf8").catch(() => fail(`it has no ${rel}`))) as string;
  const exists = (rel: string) => readFile(path.join(siteRoot, rel)).then(
    () => true,
    () => false,
  );

  // indexing: on every shell page. Next's two not-found pages (404.html and _not-found.html) always say noindex (CONTRACTS §8).
  for (const page of facts.htmlPages) {
    if (NOT_FOUND_PAGES.has(page)) continue;
    const robots = [...(await read(page)).matchAll(/<meta\s[^>]*name="robots"[^>]*>/g)].map((m) => m[0]);
    if (spec.indexing === "noindex") {
      if (!robots.some((tag) => /content="noindex/.test(tag))) fail(`${page} does not say noindex although the spec asks for noindex`);
    } else if (robots.length > 0) {
      fail(`${page} carries a robots meta (${robots[0]}) although the spec asks for indexing`);
    }
  }

  const brand = spec.brand;
  const home = await read("index.html");
  const shown = (name: string, value: string | undefined, html: string) => {
    if (value !== undefined && !html.includes(escapeHtmlText(value))) fail(`${name} "${value}" is not on the page`);
  };
  shown("tagline", brand?.identity?.tagline, home);
  shown("address", brand?.contact?.address, home);
  shown("hours", brand?.contact?.hours, home);
  shown("service area", brand?.contact?.serviceArea, home);
  const introduction = brand?.identity?.introduction;
  if (introduction && (introduction.title !== undefined || introduction.body !== undefined)) {
    const about = await read("about.html");
    shown("introduction title", introduction.title, about);
    introduction.body?.forEach((p) => shown("introduction paragraph", p, about));
  }

  // a site with a design document: what it was planned with (the design step wrote both documents)
  const designed = (opts.preset ?? null) !== null || brand?.appearance?.typography !== undefined;
  const plannedDoc = (rel: string): Record<string, any> => {
    const bytes = opts.planned?.get(rel);
    if (!bytes) return fail(`the plan of a site with a design document was not handed to the check (${rel})`);
    return JSON.parse(bytes.toString("utf8")) as Record<string, any>;
  };
  const design = designed ? (plannedDoc("settings.json").overrides?.["site.design"]?.config as { preset: { id: string; version: number } | null; chrome: { header: string }; fontSet: string } | undefined) : undefined;
  if (designed && !design) fail("the plan of a site with a design document holds none (settings.json site.design.config)");

  const packagePath = (ref: AssetRef) => publicAssetPath(ref.sha256, ref.mediaType);
  const logo = brand?.identity?.logo ? opts.assets.get(brand.identity.logo) : undefined;
  if (logo) {
    const src = packagePath(logo.ref);
    // the classic header's logo, or the logo of the header variant the design names (design/variants/header/*: `<namespace>__logo`)
    const logoClass = !design || design.chrome.header === "classic" ? "i2-header__logo" : `ds-header-${design.chrome.header}__logo`;
    const logoTags = [...home.matchAll(/<img\s[^>]*>/g)].map((m) => m[0]).filter((tag) => tag.includes(logoClass));
    if (!logoTags.some((tag) => tag.includes(`src="${src}"`))) fail(`index.html does not show the logo image ${src} in the header`);
    if (!(await exists(src.slice(1)))) fail(`the package has no ${src}`);
  }

  const aboutImage = brand?.identity?.introduction?.image ? opts.assets.get(brand.identity.introduction.image) : undefined;
  if (aboutImage) {
    const src = packagePath(aboutImage.ref);
    const about = await read("about.html");
    if (!about.includes(`src="${src}"`)) fail(`about.html does not show the introduction image ${src}`);
    if (!(await exists(src.slice(1)))) fail(`the package has no ${src}`);
  }

  const hero = brand?.hero?.image ? opts.assets.get(brand.hero.image) : undefined;
  if (brand?.hero && (hero || brand.hero.heading !== undefined || brand.hero.cta)) {
    const shell = ShellDocSchema.safeParse(JSON.parse(await read(SHELL_FILE)));
    if (!shell.success) return fail(`${SHELL_FILE} is not a shell document`);
    const snapshot = shell.data.snapshot as { content?: { banners?: { id: string; image: { asset: string }; headline?: string; cta?: { label: string } }[] }; assets?: { id: string; publicPath: string }[] };
    const banners = snapshot.content?.banners ?? [];
    if (hero) {
      // rule 1 — the block brings a hero image: the starter's slides are replaced by ONE slide carrying it
      if (banners.length !== 1) fail(`hero rule "image": the shell snapshot holds ${banners.length} hero slides, a brand block with a hero image asks for exactly one`);
    } else {
      // rule 2 — heading and/or call to action, no image: every starter slide stays (the count is the starter's own), slide 0 carries the request
      const starterBanners = await readFile(path.join(starterDir(opts.repoRoot, spec.template.templateId), "content/banners.json"), "utf8").then(
        (text) => (JSON.parse(text) as { items?: unknown[] }).items,
        () => undefined,
      );
      if (!Array.isArray(starterBanners) || starterBanners.length === 0) fail(`hero rule "no image": the starter of ${spec.template.templateId} has no content/banners.json slides to compare the hero with`);
      if (banners.length !== starterBanners!.length) fail(`hero rule "no image": the shell snapshot holds ${banners.length} hero slides, a brand block without a hero image keeps all ${starterBanners!.length} of the starter's`);
    }
    const slide = banners[0]!;
    if (brand.hero.heading !== undefined && slide.headline !== brand.hero.heading) fail("the hero slide does not carry the brand heading");
    if (brand.hero.cta && slide.cta?.label !== brand.hero.cta.label) fail("the hero slide does not carry the brand call to action");
    if (hero) {
      const wanted = siteAssetOf(hero.ref).id;
      if (slide.image.asset !== wanted) fail(`the hero slide shows asset "${slide.image.asset}", not the brand image`);
      const entry = snapshot.assets?.find((a) => a.id === wanted);
      if (entry?.publicPath !== packagePath(hero.ref)) fail("the shell snapshot has no entry for the hero image at its content-addressed path");
      if (!(await exists(packagePath(hero.ref).slice(1)))) fail(`the package has no ${packagePath(hero.ref)}`);
    }
  }

  if (design) {
    const id = design.preset?.id ?? "custom";
    if (opts.preset && (design.preset?.id !== opts.preset.id || design.preset?.version !== opts.preset.version)) fail(`the planned design document names ${JSON.stringify(design.preset)}, not preset "${opts.preset.id}" version ${opts.preset.version}`);
    for (const page of facts.htmlPages) {
      const html = /<html\s[^>]*>/.exec(await read(page))?.[0] ?? "";
      if (!html.includes(` data-design="${id}"`)) fail(`${page} is not rendered from design "${id}" (${html.slice(0, 120) || "no <html> tag"})`);
    }
    // the theme the site was planned with: the preset's palette and the font set's families, the brand's colours on top
    const tokens = (plannedDoc("theme.json").tokens ?? {}) as Record<string, string>;
    const style = /<style id="site-theme">([^<]*)<\/style>/.exec(home)?.[1];
    if (!style) fail("index.html has no site-theme style");
    for (const token of THEME_TOKENS) {
      if (tokens[token] !== undefined && !style!.includes(`${tokenVar(token)}:${tokens[token]}`)) fail(`the site theme does not carry ${token} = ${tokens[token]}`);
    }
    if (!/<style id="site-design">:root\{--ds-[^<]*<\/style>/.test(home)) fail("index.html has no site-design style (the compiled design tokens)");
    if (design.fontSet !== "system") {
      const href = new RegExp(`<link\\s[^>]*href="(/_fonts/${design.fontSet}/[0-9a-f]{20}\\.css)"`).exec(home)?.[1];
      if (!href) return fail(`index.html does not link the stylesheet of font set "${design.fontSet}"`);
      if (!(await exists(href.slice(1)))) fail(`the package has no ${href}`);
      const beside = await readdir(path.join(siteRoot, "_fonts", design.fontSet)).catch(() => [] as string[]);
      if (!beside.some((name) => /^[0-9a-f]{20}\.txt$/.test(name))) fail(`the package holds font set "${design.fontSet}" without its licence text`);
    }
  } else if (brand?.appearance) {
    const tokens = resolveAppearance(brand.appearance);
    const style = /<style id="site-theme">([^<]*)<\/style>/.exec(home)?.[1];
    if (!style) fail("index.html has no site-theme style");
    for (const token of THEME_TOKENS) {
      if (tokens[token] !== undefined && !style!.includes(`${tokenVar(token)}:${tokens[token]}`)) fail(`the site theme does not carry ${token} = ${tokens[token]}`);
    }
  }
  return facts;
}

// ---------------------------------------------------------------------- build --

export type RebuildFailedStep = "scaffold" | "assets" | "build" | "check" | "upload" | "unknown";

/** A failure of one step of the rebuild, as the `failed` event will report it (CONTRACTS §9.2). */
export class RebuildStepFailure extends Error {
  constructor(
    public readonly step: RebuildFailedStep,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RebuildStepFailure";
  }
}

/** Run one step; whatever it throws becomes a RebuildStepFailure of that step (an asset refusal is the assets step's wherever it was raised). */
export async function rebuildStep<T>(name: RebuildFailedStep, fallbackCode: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof RebuildStepFailure) throw error;
    const code = error instanceof ProvisionError ? error.code : fallbackCode;
    // an asset refusal belongs to the assets step wherever it was raised
    throw new RebuildStepFailure(code.startsWith("asset_") ? "assets" : name, code, (error as Error)?.message ?? String(error));
  }
}

export interface RebuiltSite {
  validated: ValidatedRebuildSpec;
  facts: PackageFacts;
  packageDir: string;
  scaffold: "written" | "unchanged";
  /** the builder's hash of the site data this package was built from (build-record.json parts.siteSnapshotHash) */
  siteSnapshotHash: string;
  starterHash: string;
  /** the design preset the package was built with (id and version, as the spec named and this checkout holds it); null = none */
  design: { presetId: string; presetVersion: number } | null;
  durationMs?: number;
}

/**
 * validate → design seam + starter + the design judged → the brand images (handed in as `assetBytes`, or fetched by `loadAssets`
 * once the spec is known to be buildable) → brand + indexing + preset → data/sites/<siteId>/ → managed marker → build (public) → package check.
 * No claim, no event, no store, no route. A failure is a RebuildStepFailure of the step it happened in.
 */
export async function buildRebuiltSite(opts: {
  repoRoot: string;
  spec: unknown;
  assetBytes?: ReadonlyMap<string, Buffer>;
  /** called right after validation: throws to refuse the spec for a reason only the caller knows (the runner: not the claimed job's id, not the dispatched commit) */
  checkSpec?: (validated: ValidatedRebuildSpec) => void;
  /** called with the validated spec; returns the bytes of its images by asset id (the runner reads them from the bucket here) */
  loadAssets?: (validated: ValidatedRebuildSpec) => Promise<ReadonlyMap<string, Buffer>>;
  log: (line: string) => void;
  buildSite?: (opts: SiteBuildOptions) => Promise<SiteBuildResult>;
}): Promise<RebuiltSite> {
  const { repoRoot, log } = opts;
  const base = await rebuildStep("scaffold", "spec_invalid", async () => {
    const validated = await validateRebuildSpec({ repoRoot, raw: opts.spec });
    opts.checkSpec?.(validated);
    return planRebuildBase({ repoRoot, spec: opts.spec, validated });
  });
  const { validated, preset } = base;
  const { effective } = validated;
  const tag = `[${effective.siteId}]`;
  const design = preset ? { presetId: preset.id, presetVersion: preset.version } : null;
  log(`${tag} rebuild spec ok · host ${effective.hostname} · release ${effective.template.releaseId} · design ${design ? `${design.presetId}@${design.presetVersion}` : "none"} · indexing ${validated.spec.indexing} · ${validated.spec.assets.length} brand image(s)`);

  const bytes = await rebuildStep("assets", "asset_fetch_failed", async () => (opts.loadAssets ? opts.loadAssets(validated) : (opts.assetBytes ?? new Map<string, Buffer>())));
  const assets = await rebuildStep("assets", "asset_invalid", async () => verifyRebuildAssets(validated, bytes));
  if (assets.size > 0) log(`${tag} ${assets.size} brand image(s) verified (size, sha256, media type, pixel size)`);

  const { status: scaffold, files: planned } = await rebuildStep("scaffold", "scaffold_failed", async () => {
    const files = applyRebuildBrand({ validated, files: base.files, assets, preset });
    const written = await scaffoldSite({ repoRoot, spec: effective, plan: { spec: effective, files } });
    const declared = await declareManagedPortfolio({ repoRoot, siteId: effective.siteId });
    log(`${tag} scaffold ${written.status} (${written.files.length} files)${design ? ` · preset ${design.presetId}@${design.presetVersion} applied` : ""} · managed marker ${declared.status} (${declared.schema})`);
    return { status: written.status, files };
  });

  const built = await rebuildStep("build", "build_failed", () => (opts.buildSite ?? buildSite)({ repoRoot, siteId: effective.siteId, mode: "public", releaseId: effective.template.releaseId, log }));
  const packageDir = path.resolve(repoRoot, built.packageDir);
  const facts = await rebuildStep("check", "package_check_failed", () => verifyRebuiltPackage({ repoRoot, packageDir, validated, assets, preset, planned }));
  const siteSnapshotHash = await rebuildStep("check", "package_check_failed", async () => {
    const record = JSON.parse(await readFile(path.join(packageDir, "build-record.json"), "utf8")) as { parts?: { siteSnapshotHash?: unknown } };
    const hash = record.parts?.siteSnapshotHash;
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) throw new ProvisionError("package_check_failed", "the build record has no siteSnapshotHash");
    return hash;
  });
  const starterHash = await rebuildStep("check", "package_check_failed", () => hashStarter(validated.starter.dir));
  log(`${tag} package ${facts.packageHash.slice(0, 16)}… ${built.status} · ${facts.fileCount} files · ${facts.bytes} B · ${facts.htmlPages.length} pages · package check ok`);
  return { validated, facts, packageDir, scaffold, siteSnapshotHash, starterHash, design, durationMs: built.status === "built" ? built.record.durationMs.total : undefined };
}
