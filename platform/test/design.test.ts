/**
 * The DESIGN SYSTEM foundation of interior-02 — `pnpm test:design`.
 *
 *   [contract]   DesignConfig@1: the classic document and every preset draft are valid; a table of
 *                broken documents, each refused as `design_invalid` at the exact path; the same
 *                refusal through the site settings schema (`site.design`)
 *   [tokens]     the tier-2 compiler: every --ds-* name, deterministic, fluid clamp() steps with
 *                their floors, contrast of every computed pair, the static sheet = the compiler
 *   [preset]     site-preset@1: the three drafts load; a table of broken presets
 *   [apply]      applyPreset on a really planned site (starter → brand block → preset): the E4
 *                precedence, field by field, and the contrast refusal
 *   [registry]   the allowlist is the first-milestone table; component maps, data maps and the
 *                stylesheet list are held to it; the static check; the CSS lint
 *   [gate]       per variant, the status file, the @ds-placeholder mark and the stylesheet agree; a
 *                placeholder named by a preset fails the release gate, and only that. RELEASE MODE
 *                (`pnpm test:design --release`, or DESIGN_RELEASE=1): every variant a preset names
 *                is `ready` and the gate passes — what must hold when a release is cut
 *   [classic]    no design document = the classic site: same recipe, same slots, same slot data,
 *                nothing of the design system in the files
 *   [carrier]    a preset's variants travel in the slot data (`dsVariant`), page by page
 *   [fonts]      the pins are reproducible from the installed OFL packages; the placement step; the
 *                licence texts travel in the set and are the ONLY files package QA does not URL-scan
 *   [catalog]    presets.json (site-design-presets@1): shape, determinism, the CLI
 *
 *   [main]       <main id="main"> exists only on a site WITH a design document (the skip-link target)
 *
 * Reads the repository; writes only under the OS temp directory. No network, no site build, no browser.
 */
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FONT_LICENCE_FILE_RE, qaStaticPackage } from "../build/qa";
import { contrastRuleFor, renderedDesignPairs } from "../design/apply";
import { THUMBNAILS_DIR, THUMBNAIL_NAME_RE, thumbnailFileName } from "../design/catalog";
import { applyBrand, judgeAppearance, MIN_ACCENT_CONTRAST, MIN_PRIMARY_CONTRAST, SURFACE_PRESETS } from "../provision/brand";
import { RebuildError } from "../provision/rebuild-spec";
import { planScaffold } from "../provision/scaffold";
import { resolveEffectiveSettings } from "../settings/settings";
import { createSiteContext } from "../site/context";
import { buildSiteSnapshot } from "../site/load";
import {
  ACCENT_MIN_CONTRAST,
  DESIGN_PRESETS_SCHEMA,
  DS_TOKEN_NAMES,
  DesignError,
  FONT_HASH_LENGTH,
  PLACEHOLDER_MARK,
  PRIMARY_MIN_CONTRAST,
  SLOT_VARIANT_KEY,
  SURFACE_TOKENS,
  TEXT_MIN_CONTRAST,
  applyPreset,
  buildDesignCatalog,
  buildFontSet,
  checkRegistry,
  compileDesignTokens,
  contrastRatio,
  defaultTokensCss,
  inkOn,
  lintVariantCss,
  listPresets,
  loadPreset,
  measuredPin,
  parseColor,
  pinOf,
  placeDesignFonts,
  presetPlaceholders,
  registeredVariants,
  releaseGate,
  serializeDesignCatalog,
  templateDesign,
  validateDesignConfig,
  validatePreset,
  type BrandAppearance,
  type DesignConfig,
  type DesignRegistry,
  type Rgb,
  type SitePreset,
} from "../design";
import { FIXTURE_BRAND, FIXTURE_NAME, makeFixture } from "../design/dev/make-fixture";
import type { ReleasePin } from "../design/dev/fixture-root";
import template from "../../templates/interior-02/v1/template";
import { FOOTERS, HEADERS, MOBILE_BARS } from "../../templates/interior-02/v1/design/chrome";
import { CLASSIC_DESIGN, CLASSIC_THEME, authoredVariants, registry } from "../../templates/interior-02/v1/design/registry";
import { MAIN_ID, designId, designOf, isClassicSite, mainId } from "../../templates/interior-02/v1/design/resolve";
import { HOME_SECTIONS } from "../../templates/interior-02/v1/design/sections";
import { SLOT_VARIANT_COMPONENTS, slotVariant } from "../../templates/interior-02/v1/design/slot-components";
import { zoomSeats } from "../../templates/interior-02/v1/design/variants/detail/zoom";
import { DETAIL_SLOT_DATA, HOME_SLOT_DATA, LISTING_SLOT_DATA, homeSlots } from "../../templates/interior-02/v1/design/slots";
import { fontStylesheetHref } from "../../templates/interior-02/v1/design/fonts";
import { portfolioRuntime } from "../../templates/interior-02/v1/runtime/portfolio";
import { homeHero } from "../../templates/interior-02/v1/sections/HomeHero";
import { homeKeywords } from "../../templates/interior-02/v1/sections/HomeKeywords";
import { homeProjects } from "../../templates/interior-02/v1/sections/homeProjectsData";
import { homeRecent } from "../../templates/interior-02/v1/sections/homeRecentData";
import { SiteFooter } from "../../templates/interior-02/v1/sections/SiteFooter";
import { SiteHeader } from "../../templates/interior-02/v1/sections/SiteHeader";

const repoRoot = process.cwd();
const TEMPLATE_ID = "interior-02";
const TEMPLATE_DIR = "templates/interior-02/v1";
const AT = "2026-10-12T00:00:00.000Z";
const PRESET_IDS = ["editorial-studio", "luxury-gallery", "remodeling-conversion"];
/** `pnpm test:design --release` / DESIGN_RELEASE=1: also hold the tree to what a release cut needs (no preset names a placeholder). */
const RELEASE_MODE = process.argv.includes("--release") || process.env.DESIGN_RELEASE === "1";

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
async function refusal(run: () => unknown | Promise<unknown>, code: string, label: string): Promise<DesignError> {
  try {
    await run();
  } catch (error) {
    assert(error instanceof DesignError, `${label}: expected DesignError, got ${(error as Error).name}: ${(error as Error).message}`);
    assert(error.code === code, `${label}: expected ${code}, got ${error.code}: ${error.message}`);
    return error;
  }
  throw new Error(`${label}: expected a refusal (${code})`);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;
const clone = <T>(value: T): T => structuredClone(value);
const rgb = (value: string | undefined): Rgb => {
  const c = parseColor(value);
  assert(c, `"${value}" is not a colour`);
  return c;
};
const docOf = (files: ReadonlyMap<string, Buffer>, rel: string): Doc => JSON.parse(files.get(rel)!.toString("utf8")) as Doc;

const design = templateDesign(TEMPLATE_ID);
const presets = await listPresets({ repoRoot, templateId: TEMPLATE_ID });
const presetOf = (id: string): SitePreset => presets.find((p) => p.id === id)!;
const tmp = await mkdtemp(path.join(os.tmpdir(), "design-test-"));

try {
  // ══ contract ══════════════════════════════════════════════════════════════════════════════════
  console.log("\n[contract] DesignConfig@1");
  await check("V1 the classic document and the design of every preset draft are valid", () => {
    eq(validateDesignConfig(CLASSIC_DESIGN, registry), [], "classic");
    for (const preset of presets) eq(validateDesignConfig(preset.design, registry, { preset: false }), [], preset.id);
    eq(presets.map((p) => p.id), PRESET_IDS, "the preset drafts");
  });

  const base = (): Doc => ({
    preset: { id: "luxury-gallery", version: 1 },
    chrome: { header: "classic", footer: "classic", mobileBar: "none" },
    home: [
      { section: "hero", variant: "classic" },
      { section: "showcase", variant: "classic" },
      { section: "about", variant: "classic" },
      { section: "services", variant: "classic" },
    ],
    pages: { listing: "classic", detail: "classic" },
    theme: { ...CLASSIC_THEME },
    fontSet: "system",
  });
  const TEN = ["hero", "showcase", "promos", "keywords", "about", "services", "recent", "brands", "showrooms", "cta"];
  const BROKEN: [name: string, mutate: (d: Doc) => unknown, path: string, message: RegExp][] = [
    ["an unknown variant id", (d) => void (d.home[2].variant = "carousel"), "home.2.variant", /unknown variant of section "about" "carousel" \(allowed: "classic", "split-panel", "manifesto", "statement-photo"\)/],
    ["an unknown section id", (d) => void (d.home[1].section = "testimonials"), "home.1.section", /unknown home section "testimonials"/],
    ["a variant of ANOTHER section", (d) => void (d.home[1].variant = "split"), "home.1.variant", /unknown variant of section "showcase" "split"/],
    ["a section twice", (d) => void d.home.push({ section: "about", variant: "manifesto" }), "home.4.section", /section "about" is named twice \(first at home\.2\)/],
    ["hero not first", (d) => void d.home.reverse(), "home.3.section", /"hero" must be the first home section \(it is at position 4\)/],
    ["no hero at all", (d) => void d.home.shift(), "home.0.section", /the first home section must be "hero" \(it is "showcase"\)/],
    ["more than nine home sections", (d) => void (d.home = TEN.map((section) => ({ section, variant: "classic" }))), "home", /names 10 sections \(at most 9\)/],
    ["an empty home", (d) => void (d.home = []), "home", /at least one section/],
    ["home that is not a list", (d) => void (d.home = { hero: "classic" }), "home", /must be an array/],
    ["a home entry that is not an object", (d) => void (d.home[1] = "showcase"), "home.1", /must be \{ section, variant \}/],
    ["an unknown field in a home entry", (d) => void (d.home[0].options = { autoplay: true }), "home.0.options", /unknown field/],
    ["a home entry without a variant", (d) => void delete d.home[1].variant, "home.1.variant", /is required/],
    ["an inherited name as a section id", (d) => void (d.home[1].section = "constructor"), "home.1.section", /unknown home section "constructor"/],
    ["an inherited name as a variant id", (d) => void (d.home[0].variant = "toString"), "home.0.variant", /unknown variant of section "hero" "toString"/],
    ["a chrome section in the home recipe", (d) => void (d.home[1].section = "header"), "home.1.section", /unknown home section "header"/],
    ["an unknown header", (d) => void (d.chrome.header = "mega"), "chrome.header", /unknown header variant "mega" \(allowed: "classic", "centered", "conversion"\)/],
    ["an unknown mobile bar", (d) => void (d.chrome.mobileBar = "classic"), "chrome.mobileBar", /unknown mobileBar variant "classic" \(allowed: "none", "action-bar"\)/],
    ["a missing chrome member", (d) => void delete d.chrome.footer, "chrome.footer", /is required/],
    ["an unknown detail page", (d) => void (d.pages.detail = "split"), "pages.detail", /unknown detail page variant "split"/],
    ["a listing variant that is a detail variant", (d) => void (d.pages.listing = "gallery"), "pages.listing", /unknown listing page variant "gallery" \(allowed: "classic"\)/],
    ["an unknown theme value", (d) => void (d.theme.corner = "pill"), "theme.corner", /unknown corner "pill" \(allowed: "square", "soft", "round"\)/],
    ["a missing theme field", (d) => void delete d.theme.density, "theme.density", /is required/],
    ["an unknown theme field", (d) => void (d.theme.shadow = "deep"), "theme.shadow", /unknown field/],
    ["a free-form colour in the theme", (d) => void (d.theme.accent = "#ff0000"), "theme.accent", /unknown field/],
    ["an unknown font set", (d) => void (d.fontSet = "serif-garamond"), "fontSet", /unknown font set "serif-garamond" \(allowed: "system", "sans-pretendard", "serif-noto"\)/],
    ["a font set that is not a string", (d) => void (d.fontSet = 3), "fontSet", /unknown font set \(number\)/],
    ["an unknown top-level field", (d) => void (d.css = ".hero{}"), "css", /unknown field/],
    ["a missing top-level member", (d) => void delete d.pages, "pages", /is required/],
    ["a preset reference with a bad id", (d) => void (d.preset.id = "Luxury Gallery"), "preset.id", /lower-case kebab id/],
    ["a preset reference with version 0", (d) => void (d.preset.version = 0), "preset.version", /integer ≥ 1/],
    ["a preset reference with an extra field", (d) => void (d.preset.name = "x"), "preset.name", /unknown field/],
  ];
  await check(`V2 ${BROKEN.length} broken documents are refused as design_invalid, each at its exact path`, () => {
    eq(validateDesignConfig(base(), registry), [], "the base document of the table");
    for (const [name, mutate, at, message] of BROKEN) {
      const doc = base();
      mutate(doc);
      const problems = validateDesignConfig(doc, registry);
      const hit = problems.find((p) => p.path === at);
      assert(hit, `${name}: no problem at "${at}" — got ${JSON.stringify(problems)}`);
      assert(hit.code === "design_invalid" && message.test(hit.message), `${name}: "${hit.message}" does not match ${message}`);
    }
  });
  await check("V3 one fault = one problem (nothing cascades), the document itself is refused at the root, `at` prefixes every path, `preset: null` is a document without a preset", () => {
    for (const [name, mutate] of BROKEN.slice(0, 9)) {
      const doc = base();
      mutate(doc);
      eq(validateDesignConfig(doc, registry).length, 1, name);
    }
    eq(validateDesignConfig("classic", registry), [{ code: "design_invalid", path: "", message: "must be an object" }], "a string");
    eq(validateDesignConfig([], registry)[0]?.path, "", "an array");
    const doc = base();
    doc.home[2].variant = "carousel";
    eq(validateDesignConfig(doc, registry, { at: "design" }).map((p) => p.path), ["design.home.2.variant"], "prefixed");
    eq(validateDesignConfig({ ...base(), preset: null }, registry), [], "preset: null");
    const { preset: _preset, ...presetDesign } = base();
    eq(validateDesignConfig(presetDesign, registry, { preset: false }), [], "a preset's design");
    eq(validateDesignConfig(base(), registry, { preset: false }).map((p) => p.path), ["preset"], "a preset's design may not carry `preset`");
  });
  await check('V4 the site settings carry it: `site.design` defaults to { config: null }; a broken document fails the settings with "config.home.2.variant: design_invalid: …"', () => {
    const doc = (config: unknown) => ({ schemaVersion: 1, templateId: TEMPLATE_ID, overrides: { "site.design": { config } } });
    eq(resolveEffectiveSettings(template, { schemaVersion: 1, templateId: TEMPLATE_ID, overrides: {} })["site.design"], { config: null }, "default");
    eq(resolveEffectiveSettings(template, doc(base()))["site.design"].config, base(), "a valid document");
    const bad = base();
    bad.home[2].variant = "carousel";
    let message = "";
    try {
      resolveEffectiveSettings(template, doc(bad));
    } catch (error) {
      message = (error as Error).message;
    }
    assert(message.startsWith('settings "site.design" invalid: config.home.2.variant: design_invalid: unknown variant of section "about" "carousel"'), `message: ${message}`);
    let extra = "";
    try {
      resolveEffectiveSettings(template, { schemaVersion: 1, templateId: TEMPLATE_ID, overrides: { "site.design": { config: null, css: "x" } } });
    } catch (error) {
      extra = (error as Error).message;
    }
    assert(/settings "site\.design" invalid/.test(extra), `an unknown key beside config: ${extra || "accepted"}`);
  });

  // ══ tokens ════════════════════════════════════════════════════════════════════════════════════
  console.log("\n[tokens] the tier-2 compiler");
  const tier1Of = (preset: SitePreset) => ({ ...preset.tier1 });
  const valueOf = (tokens: ReturnType<typeof compileDesignTokens>, name: string) => tokens.vars.find(([n]) => n === name)![1];
  await check(`T1 every one of the ${DS_TOKEN_NAMES.length} --ds-* names is emitted, once, in the declared order, as one :root rule — for the classic theme and for every preset`, () => {
    const inputs = [{ theme: CLASSIC_THEME, fontSet: "system" as const }, ...presets.map((p) => ({ theme: p.design.theme, tier1: tier1Of(p), fontSet: p.design.fontSet }))];
    for (const input of inputs) {
      const out = compileDesignTokens(input);
      eq(out.vars.map(([name]) => name), DS_TOKEN_NAMES, "names");
      assert(out.vars.every(([, value]) => typeof value === "string" && value !== "" && !/[;{}<>]/.test(value)), "a value is empty or holds a delimiter");
      eq(out.css, `:root{${out.vars.map(([n, v]) => `${n}:${v}`).join(";")}}`, "css");
    }
    assert(new Set(DS_TOKEN_NAMES).size === DS_TOKEN_NAMES.length && DS_TOKEN_NAMES.every((n) => /^--ds-[a-z0-9-]+$/.test(n)), "token names");
    const E4 = ["--ds-font-display", "--ds-font-body", "--ds-font-label", "--ds-text-xs", "--ds-text-display", "--ds-space-1", "--ds-space-8", "--ds-section-gap", "--ds-container-max", "--ds-radius-media", "--ds-radius-control", "--ds-hairline", "--ds-bg", "--ds-surface", "--ds-ink", "--ds-muted", "--ds-line", "--ds-accent", "--ds-accent-ink"];
    for (const name of E4) assert((DS_TOKEN_NAMES as readonly string[]).includes(name), `${name} is missing`);
  });
  await check("T2 deterministic: the same input gives the same bytes; the key order of the tier-1 colours does not matter; a different theme gives different bytes", () => {
    for (const preset of presets) {
      const input = { theme: preset.design.theme, tier1: tier1Of(preset), fontSet: preset.design.fontSet };
      const reversed = Object.fromEntries(Object.entries(input.tier1).reverse());
      eq(compileDesignTokens(input).css, compileDesignTokens(clone(input)).css, `${preset.id} twice`);
      eq(compileDesignTokens({ ...input, tier1: reversed }).css, compileDesignTokens(input).css, `${preset.id} reordered`);
    }
    const css = new Set(presets.map((p) => compileDesignTokens({ theme: p.design.theme, tier1: tier1Of(p), fontSet: p.design.fontSet }).css));
    eq(css.size, presets.length, "distinct presets, distinct tokens");
  });
  await check("T3 type steps: fluid clamp() between 360 and 1440 for every step that grows, never below 13px (xs) / 16px (base), monotonic from xs to display, in every type scale", () => {
    const px = (value: string, end: "min" | "max") => {
      const m = /^clamp\(([\d.]+)rem, [^,]+, ([\d.]+)rem\)$/.exec(value) ?? /^(([\d.]+))rem$/.exec(value);
      assert(m, `"${value}" is neither clamp(rem, …, rem) nor rem`);
      return Number(end === "min" ? m[1] : m[2]) * 16;
    };
    for (const typeScale of ["compact", "regular", "display"] as const) {
      const out = compileDesignTokens({ theme: { ...CLASSIC_THEME, typeScale }, fontSet: "system" });
      const steps = ["xs", "sm", "base", "md", "lg", "xl", "2xl", "3xl", "display"].map((s) => valueOf(out, `--ds-text-${s}`));
      assert(px(steps[0]!, "min") >= 13, `${typeScale}: xs below 13px`);
      assert(px(steps[2]!, "min") >= 16, `${typeScale}: base below 16px`);
      for (let i = 1; i < steps.length; i++) assert(px(steps[i]!, "min") >= px(steps[i - 1]!, "min") && px(steps[i]!, "max") >= px(steps[i - 1]!, "max"), `${typeScale}: step ${i} is smaller than step ${i - 1}`);
      for (const s of steps.slice(4)) assert(/^clamp\([\d.]+rem, [\d.]+vw [+-] [\d.]+rem, [\d.]+rem\)$/.test(s), `${typeScale}: "${s}" is not a fluid clamp()`);
      assert(/^clamp\(/.test(valueOf(out, "--ds-section-gap")) && /^clamp\(/.test(valueOf(out, "--ds-gutter")), `${typeScale}: section gap / gutter are not fluid`);
    }
  });
  await check("T4 contrast: the ink on ANY accent reads (≥ 4.5:1 over a 4,096-colour grid); muted text, accent text and block text read on the surfaces they sit on, for every preset and every accentUse", () => {
    let worst = 21;
    for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) worst = Math.min(worst, contrastRatio(inkOn([r, g, b]), [r, g, b]));
    for (let v = 0; v < 256; v++) worst = Math.min(worst, contrastRatio(inkOn([v, v, v]), [v, v, v]));
    assert(worst >= TEXT_MIN_CONTRAST, `the worst ink-on-fill pair measures ${worst.toFixed(2)}:1`);
    for (const preset of presets) {
      for (const accentUse of ["minimal", "blocks", "fills"] as const) {
        const out = compileDesignTokens({ theme: { ...preset.design.theme, accentUse }, tier1: tier1Of(preset), fontSet: preset.design.fontSet });
        const c = (name: string) => rgb(valueOf(out, name));
        const pairs: [string, string, number][] = [
          ["--ds-accent-ink", "--ds-accent", 4.5],
          ["--ds-ink", "--ds-bg", 4.5],
          ["--ds-muted", "--ds-bg", 4.5],
          ["--ds-muted", "--ds-surface", 4.5],
          ["--ds-accent-text", "--ds-bg", 4.5],
          ["--ds-accent-text", "--ds-surface", 4.5],
          ["--ds-block-ink", "--ds-block-bg", 4.5],
          ["--ds-inverse-ink", "--ds-inverse-bg", 4.5],
        ];
        for (const [fg, bg, min] of pairs) assert(contrastRatio(c(fg), c(bg)) >= min, `${preset.id} / ${accentUse}: ${fg} on ${bg} measures ${contrastRatio(c(fg), c(bg)).toFixed(2)}:1`);
        eq(valueOf(out, "--ds-accent"), `rgb(${rgb(preset.tier1["color.accent.primary"]).join(", ")})`, `${preset.id}: --ds-accent is the tier-1 accent`);
      }
    }
  });
  await check("T5 without measurable tier-1 colours nothing is computed: the colour roles are var(--color-…) references (the classic defaults); the font roles follow the font set", () => {
    for (const tier1 of [undefined, {}, { "color.canvas": "#fff", "color.text.primary": "#111", "color.accent.primary": "color-mix(in srgb, red, blue)" }]) {
      const out = compileDesignTokens({ theme: CLASSIC_THEME, tier1, fontSet: "system" });
      for (const name of ["--ds-bg", "--ds-surface", "--ds-ink", "--ds-muted", "--ds-line", "--ds-accent", "--ds-accent-ink", "--ds-block-bg", "--ds-block-ink"]) assert(/^var\(--color-[a-z-]+\)$/.test(valueOf(out, name)), `${name}: ${valueOf(out, name)}`);
      eq([valueOf(out, "--ds-font-display"), valueOf(out, "--ds-font-body")], ["var(--typography-heading)", "var(--typography-body)"], "system fonts");
    }
    const serif = compileDesignTokens({ theme: CLASSIC_THEME, fontSet: "serif-noto" });
    eq([valueOf(serif, "--ds-font-display"), valueOf(serif, "--ds-font-body")], [design.fontStacks["serif-noto"]!.display, design.fontStacks["serif-noto"]!.body], "serif-noto");
    assert(valueOf(serif, "--ds-font-display").startsWith('"Noto Serif KR Variable"') && valueOf(serif, "--ds-font-body").startsWith('"Pretendard Variable"'), "the serif set pairs a serif display face with the sans body face");
  });
  await check("T6 styles/design/tokens.css is exactly what the compiler writes for the classic theme, under :where(:root) (specificity 0: the site's inline :root wins)", async () => {
    const sheet = await readFile(path.join(repoRoot, TEMPLATE_DIR, "styles/design/tokens.css"), "utf8");
    const body = sheet.replace(/^\/\*[\s\S]*?\*\/\n/, "");
    eq(body, defaultTokensCss(CLASSIC_THEME), "tokens.css");
    assert(body.startsWith(":where(:root) {\n") && !/(^|\n):root/.test(body), "the selector is not :where(:root)");
    eq([...body.matchAll(/^ {2}(--ds-[a-z0-9-]+): /gm)].map((m) => m[1]), DS_TOKEN_NAMES, "declared names");
  });

  // ══ preset ════════════════════════════════════════════════════════════════════════════════════
  console.log("\n[preset] site-preset@1");
  await check("P1 the three drafts load by id, version 1, minRelease 1.2.0; their name, summary, bestFor and copy hold no figure; the file's id is its directory", async () => {
    for (const id of PRESET_IDS) {
      const preset = await loadPreset({ repoRoot, templateId: TEMPLATE_ID, presetId: id, version: 1 });
      eq([preset.id, preset.version, preset.minRelease, preset.schema], [id, 1, "1.2.0", "site-preset@1"], id);
      const words = [preset.name, preset.summary, ...preset.bestFor, ...Object.values(preset.copy).flatMap((v) => Object.values(v))].join(" ");
      assert(!/\d/.test(words), `${id}: a text of the preset holds a digit`);
    }
    await refusal(() => loadPreset({ repoRoot, templateId: TEMPLATE_ID, presetId: "luxury-gallery", version: 2 }), "design_unavailable", "another version");
    await refusal(() => loadPreset({ repoRoot, templateId: TEMPLATE_ID, presetId: "no-such-preset" }), "design_unavailable", "an unknown preset");
    await refusal(() => loadPreset({ repoRoot, templateId: TEMPLATE_ID, presetId: "../luxury-gallery" }), "design_invalid", "a path as an id");
    await refusal(() => loadPreset({ repoRoot, templateId: "interior-01", presetId: "luxury-gallery" }), "design_unavailable", "a template without a design system");
    const root = path.join(tmp, "moved");
    await mkdir(path.join(root, "data/site-presets", TEMPLATE_ID, "renamed"), { recursive: true });
    await writeFile(path.join(root, "data/site-presets", TEMPLATE_ID, "renamed", "preset.json"), JSON.stringify(presetOf("luxury-gallery")));
    await refusal(() => loadPreset({ repoRoot: root, templateId: TEMPLATE_ID, presetId: "renamed" }), "design_invalid", "id ≠ directory");
  });
  const BROKEN_PRESETS: [name: string, mutate: (p: Doc) => unknown, path: string, message: RegExp][] = [
    ["an unknown field", (p) => void (p.css = "x"), "css", /unknown field/],
    ["a missing field", (p) => void delete p.minRelease, "minRelease", /is required/],
    ["another schema", (p) => void (p.schema = "site-preset@2"), "schema", /must be "site-preset@1"/],
    ["a release id as minRelease", (p) => void (p.minRelease = "interior-02-1.2.0-abcdef012345"), "minRelease", /template version/],
    ["five bestFor phrases", (p) => void (p.bestFor = ["a", "b", "c", "d", "e"]), "bestFor", /one to four/],
    ["an unknown variant in the design", (p) => void (p.design.home[1].variant = "carousel"), "design.home.1.variant", /unknown variant/],
    ["a preset reference inside the design", (p) => void (p.design.preset = null), "design.preset", /unknown field/],
    ["a typography token in tier1", (p) => void (p.tier1["typography.heading"] = "Georgia, serif"), "tier1.typography.heading", /not a tier-1 colour token/],
    ["an unknown token in tier1", (p) => void (p.tier1["color.brand.secondary"] = "#123456"), "tier1.color.brand.secondary", /not a tier-1 colour token/],
    ["a colour that cannot be measured", (p) => void (p.tier1["color.accent.primary"] = "var(--x)"), "tier1.color.accent.primary", /not a valid colour value|cannot measure/],
    ["a surface token left out", (p) => void delete p.tier1["color.border.default"], "tier1.color.border.default", /is required \(a preset defines its whole surface\)/],
    ["text that does not read on the page", (p) => void (p.tier1["color.text.primary"] = "#b9b2a6"), "tier1.color.text.primary", /measures \d\.\d\d:1 against color\.canvas; it needs at least 4\.5:1/],
    ["an accent that does not read on the page", (p) => void (p.tier1["color.accent.primary"] = "#e9dcc4"), "tier1.color.accent.primary", /against color\.canvas; it needs at least 3:1/],
    ["a dark palette under a light surface name", (p) => void Object.assign(p.tier1, { "color.canvas": "#141416", "color.surface.primary": "#141416", "color.text.primary": "#f5f3ee", "color.text.secondary": "#c8c4bc" }), "design.theme.surface", /but the palette is dark/],
    ["copy for a section the template does not have", (p) => void (p.copy = { "home.testimonials": { title: "Reviews" } }), "copy.home.testimonials", /is not a section/],
    ["copy for a slot the section does not have", (p) => void (p.copy = { "home.projects": { headline: "Projects" } }), "copy.home.projects.headline", /is not a slot/],
    ["copy for a slot the brand block owns", (p) => void (p.copy = { "about.page": { introTitle: "About" } }), "copy.about.page.introTitle", /written by the brand block/],
    ["copy that holds a figure", (p) => void (p.copy = { "home.projects": { title: "Projects 2026" } }), "copy.home.projects.title", /contains a digit/],
    ["copy that holds an address", (p) => void (p.copy = { "home.projects": { title: "www.example.com" } }), "copy.home.projects.title", /markup, an address or a URL/],
    ["copy longer than the slot", (p) => void (p.copy = { "home.projects": { title: "가".repeat(400) } }), "copy.home.projects.title", /characters long/],
  ];
  await check(`P2 ${BROKEN_PRESETS.length} broken presets are refused, each at its exact path — a preset holds no free-form styling, no figure and nothing the brand block owns`, () => {
    eq(validatePreset(clone(presetOf("luxury-gallery")), design), [], "the base preset of the table");
    for (const [name, mutate, at, message] of BROKEN_PRESETS) {
      const doc = clone(presetOf("luxury-gallery")) as unknown as Doc;
      mutate(doc);
      const issues = validatePreset(doc, design);
      const hit = issues.find((i) => i.path === at);
      assert(hit, `${name}: no issue at "${at}" — got ${JSON.stringify(issues)}`);
      assert(hit.code === "design_invalid" && message.test(hit.message), `${name}: "${hit.message}" does not match ${message}`);
    }
  });
  await check("P3 the thresholds are the brand block's own (accent 3:1, primary 3:1); text is held to 4.5:1", () => {
    eq([ACCENT_MIN_CONTRAST, PRIMARY_MIN_CONTRAST, TEXT_MIN_CONTRAST], [MIN_ACCENT_CONTRAST, MIN_PRIMARY_CONTRAST, 4.5], "thresholds");
  });

  // ══ a planned site ════════════════════════════════════════════════════════════════════════════
  // The starter rendered by the provisioning scaffold for the release the starter lists, in a root
  // outside the checkout; then the brand block. This is the input applyPreset is specified for.
  const root = path.join(tmp, "root");
  await mkdir(path.join(root, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(root, "data/template-releases"));
  await symlink(path.join(repoRoot, "data/site-starters"), path.join(root, "data/site-starters"));
  const starter = JSON.parse(await readFile(path.join(repoRoot, "data/site-starters", TEMPLATE_ID, "starter.json"), "utf8")) as { releaseIds: string[] };
  // The files are planned on the newest release the starter lists (whatever its version: this suite
  // does not depend on the working tree being released); the contexts below are created with the
  // working tree's manifest.
  const releaseId = starter.releaseIds.at(-1);
  assert(releaseId, "the starter lists no release");
  const record = JSON.parse(await readFile(path.join(repoRoot, "data/template-releases", TEMPLATE_ID, releaseId, "release.json"), "utf8")) as ReleasePin;
  const release: ReleasePin = { templateId: TEMPLATE_ID, templateVersion: record.templateVersion, releaseId: record.releaseId, releaseHash: record.releaseHash };
  /** the last release of the classic line — what "the classic site" is measured against (CONTRACTS E1) */
  const CLASSIC_BASELINE = "interior-02-1.1.2-0b35f76a156d";
  const smoke = JSON.parse(await readFile(path.join(repoRoot, "platform/provision/fixtures/smoke-spec.json"), "utf8")) as Doc;
  /** the starter with the fixture brand; `deferContrast` = as the rebuild path plans a PRESET site (the brand step writes, applyPreset judges) */
  async function planned(appearance?: BrandAppearance, deferContrast = false): Promise<Map<string, Buffer>> {
    const spec = { ...smoke, siteId: "design-test", hostname: "design-test.boostweb.co.kr", publicOrigin: "https://design-test.boostweb.co.kr", template: { templateId: TEMPLATE_ID, releaseId: release.releaseId, releaseHash: release.releaseHash }, identity: { ...smoke.identity, brandName: FIXTURE_NAME } };
    const { files } = await planScaffold({ repoRoot: root, spec });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return applyBrand({ files, brand: { ...FIXTURE_BRAND, ...(appearance ? { appearance } : {}) } as any, indexing: "noindex", brandName: FIXTURE_NAME, assets: new Map(), deferContrast });
  }
  const sameFiles = (a: ReadonlyMap<string, Buffer>, b: ReadonlyMap<string, Buffer>, label: string) => {
    eq([...a.keys()].sort(), [...b.keys()].sort(), `${label}: file list`);
    for (const [rel, bytes] of a) assert(bytes.equals(b.get(rel)!), `${label}: ${rel} changed`);
  };
  const tokensOf = (files: ReadonlyMap<string, Buffer>): Record<string, string> => docOf(files, "theme.json").tokens as Record<string, string>;
  const configOf = (files: ReadonlyMap<string, Buffer>): DesignConfig => docOf(files, "settings.json").overrides["site.design"].config as DesignConfig;

  console.log("\n[apply] applyPreset — precedence starter → preset → brand block");
  const luxury = presetOf("luxury-gallery");
  await check("A1 no preset: the planned files come back byte for byte — with no brand appearance, and with brand colours and a surface but no typography; the input map is never mutated", async () => {
    for (const appearance of [undefined, { accentColor: "#1f6feb" }, { surface: "cool", primaryColor: "#18304a", accentColor: "#1f6feb" }] as (BrandAppearance | undefined)[]) {
      const files = await planned(appearance);
      const before = new Map(files);
      const out = applyPreset(files, null, appearance ?? null);
      sameFiles(out, before, `appearance ${JSON.stringify(appearance ?? null)}`);
      sameFiles(files, before, "the input");
      assert(out !== files, "the input map itself was returned");
      assert(docOf(out, "settings.json").overrides["site.design"] === undefined, "a design document was written");
    }
  });
  await check("A2 a preset, no brand appearance: the design document is the preset's with its reference; every tier-1 colour of the preset lands; the action text is derived and reads; the font set's families become the tier-1 typography; the preset's labels land in slots.json; nothing else changes", async () => {
    const files = await planned();
    const out = applyPreset(files, luxury, null);
    eq(configOf(out), { preset: { id: "luxury-gallery", version: 1 }, ...luxury.design }, "site.design.config");
    eq(validateDesignConfig(configOf(out), registry), [], "the written document is valid");
    const tokens = tokensOf(out);
    for (const [token, value] of Object.entries(luxury.tier1)) eq(tokens[token], value, token);
    assert(contrastRatio(rgb(tokens["color.action.primaryText"]), rgb(tokens["color.action.primary"])) >= 4.5, "the derived action text does not read on the preset's primary");
    eq(tokens["color.text.inverse"], tokens["color.action.primaryText"], "inverse text");
    eq(tokens["color.border.strong"], luxury.tier1["color.action.primary"], "strong border");
    eq([tokens["typography.heading"], tokens["typography.body"]], [design.fontStacks["serif-noto"]!.display, design.fontStacks["serif-noto"]!.body], "typography tokens");
    const before = docOf(files, "slots.json").values as Doc;
    const after = docOf(out, "slots.json").values as Doc;
    eq(after["home.projects"], { ...before["home.projects"], ...luxury.copy["home.projects"] }, "home.projects labels");
    for (const section of Object.keys(before)) if (section !== "home.projects") eq(after[section], before[section], `slots of ${section}`);
    const changed = [...out.keys()].filter((rel) => !files.has(rel) || !out.get(rel)!.equals(files.get(rel)!)).sort();
    eq(changed, ["settings.json", "slots.json", "theme.json"], "files changed");
    const settingsBefore = docOf(files, "settings.json");
    const settingsAfter = docOf(out, "settings.json");
    eq({ ...settingsAfter, overrides: { ...settingsAfter.overrides, "site.design": undefined } }, { ...settingsBefore, overrides: { ...settingsBefore.overrides, "site.design": undefined } }, "the other settings");
    eq(applyPreset(files, luxury, null).get("theme.json")!.toString(), out.get("theme.json")!.toString(), "deterministic");
  });
  await check("A3 brand accentColor and primaryColor ALWAYS win: the brand step's values stay, the preset's surface still lands", async () => {
    const appearance: BrandAppearance = { accentColor: "#1f6feb", primaryColor: "#18304a" };
    const files = await planned(appearance);
    const branded = tokensOf(files);
    const tokens = tokensOf(applyPreset(files, luxury, appearance));
    for (const token of ["color.accent.primary", "color.action.primary", "color.action.primaryText", "color.text.inverse", "color.border.strong"]) eq(tokens[token], branded[token], token);
    eq(rgb(tokens["color.accent.primary"]), [31, 111, 235], "the accent is the brand's");
    for (const token of SURFACE_TOKENS) eq(tokens[token], luxury.tier1[token], token);
    eq(configOf(applyPreset(files, luxury, appearance)).theme.surface, luxury.design.theme.surface, "theme.surface stays the preset's");
    // one at a time
    const onlyAccent = tokensOf(applyPreset(await planned({ accentColor: "#1f6feb" }), luxury, { accentColor: "#1f6feb" }));
    eq([rgb(onlyAccent["color.accent.primary"]), onlyAccent["color.action.primary"]], [[31, 111, 235], luxury.tier1["color.action.primary"]], "only the accent set: the primary is the preset's");
    const onlyPrimary = tokensOf(applyPreset(await planned({ primaryColor: "#18304a" }), luxury, { primaryColor: "#18304a" }));
    eq([onlyPrimary["color.accent.primary"], rgb(onlyPrimary["color.action.primary"])], [luxury.tier1["color.accent.primary"], [24, 48, 74]], "only the primary set: the accent is the preset's");
  });
  await check("A4 brand surface wins ONLY when set: set → the brand step's surface tokens stay and theme.surface follows; unset → the preset's surface (the brand step's warm default is not a choice)", async () => {
    const set: BrandAppearance = { surface: "cool" };
    const files = await planned(set);
    const branded = tokensOf(files);
    const out = applyPreset(files, luxury, set);
    for (const token of SURFACE_TOKENS) eq(tokensOf(out)[token], branded[token], token);
    eq(configOf(out).theme.surface, "cool", "theme.surface");
    eq(tokensOf(out)["color.accent.primary"], luxury.tier1["color.accent.primary"], "the accent is still the preset's");
    const unset: BrandAppearance = { accentColor: "#1f6feb" };
    const outUnset = applyPreset(await planned(unset), luxury, unset);
    eq(tokensOf(outUnset)["color.canvas"], luxury.tier1["color.canvas"], "canvas with no brand surface");
    eq(configOf(outUnset).theme.surface, "warm", "theme.surface with no brand surface");
  });
  await check("A5 brand typography wins ONLY when set: modern-sans → sans-pretendard, editorial-serif → serif-noto, over the preset's font set; with NO preset it becomes the classic document with that font set; soft-rounded is refused (design_unsupported)", async () => {
    const sans: BrandAppearance = { typography: "modern-sans" };
    const files = await planned(sans);
    const out = applyPreset(files, luxury, sans);
    eq(configOf(out).fontSet, "sans-pretendard", "preset serif, brand sans");
    eq(tokensOf(out)["typography.heading"], design.fontStacks["sans-pretendard"]!.display, "typography.heading");
    eq(configOf(applyPreset(files, presetOf("remodeling-conversion"), { typography: "editorial-serif" })).fontSet, "serif-noto", "preset sans, brand serif");
    eq(configOf(applyPreset(files, luxury, {})).fontSet, "serif-noto", "no brand typography");
    const classic = applyPreset(files, null, sans);
    eq(configOf(classic), { ...CLASSIC_DESIGN, fontSet: "sans-pretendard" }, "no preset + a typography");
    eq(configOf(classic).preset, null, "it names no preset");
    await refusal(() => applyPreset(files, luxury, { typography: "soft-rounded" }), "design_unsupported", "soft-rounded with a preset");
    await refusal(() => applyPreset(files, null, { typography: "soft-rounded" }), "design_unsupported", "soft-rounded without a preset");
  });
  await check("A6 the colours that END UP together must read: a brand primary that passed on the starter's surface is refused on a dark preset (contrast_too_low, the measured ratio, the source named); the same preset with a readable primary is applied", async () => {
    const dark = clone(luxury);
    Object.assign(dark, { id: "night-test" });
    dark.design.theme.surface = "dark";
    Object.assign(dark.tier1, {
      "color.canvas": "#141416",
      "color.surface.primary": "#141416",
      "color.surface.secondary": "#202024",
      "color.surface.elevated": "#2c2c32",
      "color.text.primary": "#f5f3ee",
      "color.text.secondary": "#c8c4bc",
      "color.text.muted": "#a09c94",
      "color.link": "#f5f3ee",
      "color.border.default": "#404046",
      "color.action.primary": "#f5f3ee",
      "color.accent.primary": "#b0733a",
    });
    eq(validatePreset(dark, design), [], "the dark test preset is valid");
    const appearance: BrandAppearance = { primaryColor: "#18304a" };
    const files = await planned(appearance);
    const error = await refusal(() => applyPreset(files, dark, appearance), "contrast_too_low", "a dark primary on a dark preset");
    eq(error.message, `appearance.primaryColor #18304a measures ${contrastRatio(rgb("#18304a"), rgb("#141416")).toFixed(2)}:1 as color.action.primary rgb(24, 48, 74) against color.canvas #141416 (the surface of preset "night-test"); it needs at least 3:1`, "the refusal names the pair and both colours");
    const ok = applyPreset(await planned(), dark, null);
    eq(tokensOf(ok)["color.canvas"], "#141416", "the dark preset alone");
    assert(contrastRatio(rgb(tokensOf(ok)["color.action.primaryText"]), rgb("#f5f3ee")) >= 4.5, "the text derived for the light primary");
  });
  // ── D-43: which contrast rule judges a site, and what the rule of a designed site measures ──
  const NAVY = "#1f2a44";
  const NEAR_BLACK = "#111111";
  const FOREST = "#1f4d3a";
  const PALE_YELLOW = "#f5e9a8";
  await check("A8 contrastRuleFor — the ONE place that decides which contrast rule applies to a design document: a document that names a preset → rendered-design; no document (the classic site) and a document without a preset (custom: a brand typography on the classic recipe) → classic-surface; applyPreset writes exactly the document the rule is asked about", async () => {
    eq(contrastRuleFor(null), "classic-surface", "no design document");
    eq(contrastRuleFor(undefined), "classic-surface", "undefined");
    eq(contrastRuleFor(CLASSIC_DESIGN), "classic-surface", "the classic document");
    const customDocument: DesignConfig = { ...CLASSIC_DESIGN, fontSet: "serif-noto" };
    eq(contrastRuleFor(customDocument), "classic-surface", "custom: the classic recipe with another font set");
    eq(contrastRuleFor({ preset: null }), "classic-surface", "preset: null");
    eq(contrastRuleFor({}), "classic-surface", "no preset member");
    for (const preset of presets) {
      eq(contrastRuleFor({ preset: { id: preset.id, version: preset.version }, ...preset.design }), "rendered-design", preset.id);
      eq(contrastRuleFor(configOf(applyPreset(await planned(), preset, null))), "rendered-design", `${preset.id}: the document applyPreset writes`);
    }
    const custom = configOf(applyPreset(await planned({ typography: "modern-sans" }), null, { typography: "modern-sans" }));
    eq([custom.preset, contrastRuleFor(custom)], [null, "classic-surface"], "the document of a typography-only site");
  });
  await check("A9 the rendered-design rule measures what a designed site draws, on the values the build emits: renderedDesignPairs compiles the --ds-* roles with the template's own compiler from the final tier-1 tokens — text on the page 4.5, the accent against the page 3, the computed accent ink on the accent 4.5 (asserted, not assumed), the accent as text on page and surface 4.5, the emphasised block 4.5, the primary against the canvas 3 and its derived texts 4.5 — and every pair holds for each preset as shipped", async () => {
    for (const preset of presets) {
      const out = applyPreset(await planned(), preset, null);
      const config = configOf(out);
      const pairs = renderedDesignPairs({ theme: config.theme, tier1: tokensOf(out), fontSet: config.fontSet });
      eq(pairs.map((p) => `${p.subject} ${p.relation} ${p.against} ${p.min}`), [
        "--ds-ink on --ds-bg 4.5",
        "--ds-accent against --ds-bg 3",
        "--ds-accent-ink on --ds-accent 4.5",
        "--ds-accent-text on --ds-bg 4.5",
        "--ds-accent-text on --ds-surface 4.5",
        "--ds-block-ink on --ds-block-bg 4.5",
        "color.action.primary against color.canvas 3",
        "color.action.primaryText on color.action.primary 4.5",
        "color.text.inverse on color.action.primary 4.5",
      ], `${preset.id}: the pairs`);
      // the values are the emitted ones: the compiled block of the page, and the tier-1 tokens of theme.json
      const emitted = new Map<string, string>(compileDesignTokens({ theme: config.theme, tier1: tokensOf(out), fontSet: config.fontSet }).vars);
      for (const p of pairs) {
        eq([p.subjectValue, p.againstValue], [p.subject, p.against].map((name) => (name.startsWith("--") ? emitted.get(name) : tokensOf(out)[name])), `${preset.id}: ${p.subject} / ${p.against} values`);
        eq(p.ratio, contrastRatio(rgb(p.subjectValue), rgb(p.againstValue)), `${preset.id}: ${p.subject} ratio`);
        assert(p.ratio >= p.min, `${preset.id}: ${p.subject} ${p.relation} ${p.against} measures ${p.ratio.toFixed(2)}:1`);
      }
      eq([...new Set(pairs.map((p) => p.decidedBy))], ["surface", "accentColor", "primaryColor"], `${preset.id}: who decides`);
    }
    // a colour the compiler cannot read is written as a reference and is not measured
    eq(renderedDesignPairs({ theme: CLASSIC_THEME, tier1: {}, fontSet: "system" }), [], "reference form");
  });
  await check("A10 on a designed site a DARK brand accent is an ordinary accent: navy #1f2a44, near-black #111111 and forest #1f4d3a are accepted on each of the three presets — theme.json carries the colour, the compiled --ds-accent is that colour and --ds-accent-ink reads on it (4.5:1) — although the classic rule refuses each of them on the starter's surface; a pale yellow #f5e9a8 is refused on each (contrast_too_low) naming the pair and both colours; a dark accent on a dark preset is refused the same way", async () => {
    for (const preset of presets) {
      for (const accent of [NAVY, NEAR_BLACK, FOREST]) {
        const appearance: BrandAppearance = { accentColor: accent };
        const classicRule = await (async () => {
          try {
            judgeAppearance(appearance);
            return "(accepted)";
          } catch (error) {
            return error instanceof RebuildError ? error.code : String(error);
          }
        })();
        eq(classicRule, "contrast_too_low", `${accent}: the classic rule on the starter's surface`);
        const out = applyPreset(await planned(appearance, true), preset, appearance);
        const config = configOf(out);
        const css = `rgb(${rgb(accent).join(", ")})`;
        eq(tokensOf(out)["color.accent.primary"], css, `${preset.id} + ${accent}: theme.json`);
        const ds = new Map<string, string>(compileDesignTokens({ theme: config.theme, tier1: tokensOf(out), fontSet: config.fontSet }).vars);
        eq(ds.get("--ds-accent"), css, `${preset.id} + ${accent}: --ds-accent`);
        assert(contrastRatio(rgb(ds.get("--ds-accent-ink")), rgb(accent)) >= TEXT_MIN_CONTRAST, `${preset.id} + ${accent}: --ds-accent-ink`);
        assert(contrastRatio(rgb(ds.get("--ds-accent-text")), rgb(ds.get("--ds-bg"))) >= TEXT_MIN_CONTRAST, `${preset.id} + ${accent}: --ds-accent-text`);
        eq(tokensOf(out)["color.canvas"], preset.tier1["color.canvas"], `${preset.id} + ${accent}: the canvas is the preset's`);
        eq(tokensOf(out)["color.action.primary"], preset.tier1["color.action.primary"], `${preset.id} + ${accent}: the primary is the preset's`);
      }
      const pale: BrandAppearance = { accentColor: PALE_YELLOW };
      const refused = await refusal(async () => applyPreset(await planned(pale, true), preset, pale), "contrast_too_low", `${preset.id} + pale yellow`);
      const canvas = preset.tier1["color.canvas"]!;
      eq(refused.message, `appearance.accentColor ${PALE_YELLOW} measures ${contrastRatio(rgb(PALE_YELLOW), rgb(canvas)).toFixed(2)}:1 as --ds-accent rgb(245, 233, 168) against --ds-bg rgb(${rgb(canvas).join(", ")}) (the surface of preset "${preset.id}"); it needs at least ${ACCENT_MIN_CONTRAST}:1`, `${preset.id}: the refusal names the pair and both colours`);
    }
    const darkSurface: BrandAppearance = { surface: "dark", accentColor: NAVY };
    const onDark = await refusal(async () => applyPreset(await planned(darkSurface, true), luxury, darkSurface), "contrast_too_low", "navy on the dark surface");
    assert(onDark.message.startsWith(`appearance.accentColor ${NAVY} measures `) && onDark.message.includes("as --ds-accent rgb(31, 42, 68) against --ds-bg rgb(20, 20, 22) (the dark surface)"), onDark.message);
    // and the pale yellow that a light preset refuses is an ordinary accent on the dark surface
    const paleOnDark: BrandAppearance = { surface: "dark", accentColor: PALE_YELLOW };
    eq(tokensOf(applyPreset(await planned(paleOnDark, true), luxury, paleOnDark))["color.accent.primary"], "rgb(245, 233, 168)", "pale yellow on the dark surface");
  });
  await check("A11 a brand surface WITHOUT a primary resolves on every preset: `{surface: \"dark\"}` alone — the preset's primary (its palette's text colour) follows the text colour of the dark surface, its texts are derived for it (4.5:1), the preset's accent stays when it reads there; the same for warm / neutral / cool, where the preset's own primary reads and is kept; every rendered pair holds", async () => {
    for (const preset of presets) {
      for (const surface of ["warm", "neutral", "cool", "dark"] as const) {
        const appearance: BrandAppearance = { surface };
        const out = applyPreset(await planned(appearance, true), preset, appearance);
        const tokens = tokensOf(out);
        const s = SURFACE_PRESETS[surface];
        eq([tokens["color.canvas"], tokens["color.text.primary"], configOf(out).theme.surface], [`rgb(${s.canvas.join(", ")})`, `rgb(${s.text.join(", ")})`, surface], `${preset.id} on ${surface}: the surface`);
        if (surface === "dark") {
          eq([tokens["color.action.primary"], tokens["color.border.strong"]], [`rgb(${s.text.join(", ")})`, `rgb(${s.text.join(", ")})`], `${preset.id} on dark: the primary is the surface's text colour`);
          eq([tokens["color.action.primaryText"], tokens["color.text.inverse"]], ["rgb(17, 17, 17)", "rgb(17, 17, 17)"], `${preset.id} on dark: the texts derived for it`);
        } else {
          eq(tokens["color.action.primary"], preset.tier1["color.action.primary"], `${preset.id} on ${surface}: the preset's primary reads and stays`);
        }
        eq(tokens["color.accent.primary"], preset.tier1["color.accent.primary"], `${preset.id} on ${surface}: the preset's accent reads and stays`);
        const config = configOf(out);
        for (const p of renderedDesignPairs({ theme: config.theme, tier1: tokens, fontSet: config.fontSet })) assert(p.ratio >= p.min, `${preset.id} on ${surface}: ${p.subject} ${p.relation} ${p.against} ${p.ratio.toFixed(2)}:1`);
      }
    }
    // a preset colour that is NOT its palette's text colour and does not read on the chosen surface is moved toward that surface's text colour until it does
    const tinted = clone(luxury);
    Object.assign(tinted, { id: "tinted-test" });
    Object.assign(tinted.tier1, { "color.action.primary": "#1f2a44", "color.accent.primary": "#3a2a1c" });
    const dark: BrandAppearance = { surface: "dark" };
    const moved = tokensOf(applyPreset(await planned(dark, true), tinted, dark));
    const canvas = rgb(`rgb(${SURFACE_PRESETS.dark.canvas.join(", ")})`);
    for (const [token, from] of [["color.action.primary", "#1f2a44"], ["color.accent.primary", "#3a2a1c"]] as const) {
      assert(moved[token] !== from && contrastRatio(rgb(moved[token]), canvas) >= 3 && contrastRatio(rgb(moved[token]), canvas) < TEXT_MIN_CONTRAST, `${token}: ${moved[token]}`);
    }
    assert(contrastRatio(rgb(moved["color.action.primaryText"]), rgb(moved["color.action.primary"])) >= TEXT_MIN_CONTRAST, "the text derived for the moved primary");
  });
  await check("A12 a preset that cannot be drawn on the surface the brand chose is design_unsupported with the pair in the detail — not contrast_too_low (no colour the brand entered is at fault) and not a crash", async () => {
    // a surface no brand table holds: a panel colour the page's own text cannot be read on
    const appearance: BrandAppearance = { surface: "neutral" };
    const files = await planned(appearance, true);
    const theme = docOf(files, "theme.json");
    files.set("theme.json", Buffer.from(JSON.stringify({ ...theme, tokens: { ...theme.tokens, "color.surface.secondary": "rgb(40, 40, 40)" } })));
    const error = await refusal(() => applyPreset(files, luxury, appearance), "design_unsupported", "an unreadable panel colour");
    assert(error.message.startsWith(`preset "luxury-gallery" cannot be drawn on the neutral surface: preset "luxury-gallery" color.accent.primary ${luxury.tier1["color.accent.primary"]} measures `) && error.message.includes(" as --ds-accent-text ") && error.message.includes(" on --ds-surface rgb(40, 40, 40) ") && error.message.endsWith("it needs at least 4.5:1"), error.message);
  });
  await check("A13 the classic-surface rule is UNCHANGED where no preset is named: on a typography-only (custom) site the surface's text colour must still read on the accent — navy is refused there with the classic wording; a colour that passes the classic rule is applied; and the brand step's own judgement (judgeAppearance) words navy on the classic site exactly as before", async () => {
    const custom: BrandAppearance = { typography: "modern-sans", accentColor: NAVY };
    const refused = await refusal(async () => applyPreset(await planned(custom, true), null, custom), "contrast_too_low", "navy on a custom site");
    const warm = SURFACE_PRESETS.warm;
    const ratio = contrastRatio(rgb(NAVY), warm.text as unknown as Rgb).toFixed(2);
    eq(refused.message, `appearance.accentColor ${NAVY} measures ${ratio}:1 with the text colour of the starter's surface on it; it needs at least ${ACCENT_MIN_CONTRAST}:1`, "the classic wording in the design step");
    let classic = "";
    try {
      judgeAppearance({ accentColor: NAVY });
    } catch (error) {
      classic = `${(error as RebuildError).code}: ${(error as Error).message}`;
    }
    eq(classic, `contrast_too_low: appearance.accentColor ${NAVY} measures ${ratio}:1 with the warm surface's text colour on it; it needs at least ${MIN_ACCENT_CONTRAST}:1`, "the classic wording in the brand step");
    const fine: BrandAppearance = { typography: "editorial-serif", accentColor: "#c2410c" };
    const out = applyPreset(await planned(fine), null, fine);
    eq([configOf(out).preset, configOf(out).fontSet, tokensOf(out)["color.accent.primary"]], [null, "serif-noto", "rgb(194, 65, 12)"], "a custom site with a colour the classic rule accepts");
    // the pale yellow a designed site refuses is refused on a custom site too — by the classic rule's first pair, in its wording
    const pale: BrandAppearance = { typography: "modern-sans", accentColor: PALE_YELLOW };
    const paleRefused = await refusal(async () => applyPreset(await planned(pale, true), null, pale), "contrast_too_low", "pale yellow on a custom site");
    assert(/^appearance\.accentColor #f5e9a8 measures 1\.\d\d:1 against the starter's surface; it needs at least 3:1$/.test(paleRefused.message), paleRefused.message);
  });
  await check("A7 a site of a template without a design system is refused (design_unavailable); a preset is never applied to files that have no settings.json", async () => {
    const files = await planned();
    const other = new Map(files);
    other.set("settings.json", Buffer.from(JSON.stringify({ ...docOf(files, "settings.json"), templateId: "interior-01" })));
    await refusal(() => applyPreset(other, luxury, null), "design_unavailable", "another template");
    const none = new Map(files);
    none.delete("settings.json");
    await refusal(() => applyPreset(none, luxury, null), "design_invalid", "no settings.json");
  });

  // ══ registry ══════════════════════════════════════════════════════════════════════════════════
  console.log("\n[registry] the allowlist");
  const TABLE: Record<string, { place: string; slot: string | null; variants: string[] }> = {
    header: { place: "chrome", slot: null, variants: ["classic", "centered", "conversion"] },
    footer: { place: "chrome", slot: null, variants: ["classic", "minimal"] },
    mobileBar: { place: "chrome", slot: null, variants: ["none", "action-bar"] },
    hero: { place: "home", slot: "home.hero", variants: ["classic", "photo", "statement", "split"] },
    showcase: { place: "home", slot: "home.projects", variants: ["classic", "panels", "index", "cards"] },
    promos: { place: "home", slot: null, variants: ["classic"] },
    keywords: { place: "home", slot: "home.keywords", variants: ["classic"] },
    about: { place: "home", slot: null, variants: ["classic", "split-panel", "manifesto", "statement-photo"] },
    services: { place: "home", slot: null, variants: ["classic", "rows", "numbered"] },
    recent: { place: "home", slot: "home.recent", variants: ["classic"] },
    brands: { place: "home", slot: null, variants: ["classic"] },
    showrooms: { place: "home", slot: null, variants: ["classic"] },
    cta: { place: "home", slot: null, variants: ["classic", "quiet", "band"] },
    listing: { place: "page", slot: "portfolio.index", variants: ["classic"] },
    detail: { place: "page", slot: "portfolio.detail", variants: ["classic", "typographic", "gallery"] },
  };
  const variants = registeredVariants(registry);
  await check("R1 the registry is the first-milestone table: every section, its place, its runtime slot and its variants in order; the first variant of each is the classic one; no runtime slot the template does not declare", () => {
    eq(registry.templateId, TEMPLATE_ID, "templateId");
    eq(Object.fromEntries(Object.entries(registry.sections).map(([id, s]) => [id, { place: s.place, slot: s.slot, variants: Object.keys(s.variants) }])), TABLE, "registry");
    for (const [id, section] of Object.entries(registry.sections)) {
      const [first, ...rest] = Object.values(section.variants);
      eq([first!.status, first!.module, first!.data, first!.css], ["classic", null, null, null], `${id}: the first variant`);
      assert(rest.every((v) => v.status === "placeholder" || v.status === "ready"), `${id}: a second classic variant`);
      assert(Object.values(section.variants).every((v) => v.summary.trim() !== ""), `${id}: a variant has no summary`);
    }
    const slots = [...new Set(Object.values(registry.sections).map((s) => s.slot).filter((s): s is string => s !== null))];
    eq(slots.sort(), ["home.hero", "home.keywords", "home.projects", "home.recent", "portfolio.detail", "portfolio.index"], "the slots are the six existing ones");
  });
  await check("R2 every authored variant has its files where the guide says: design/variants/<family>/<variant>.tsx, a .data.ts only for a slot section, styles/design/<family>-<variant>.css — and the files exist", async () => {
    const authored = variants.filter((v) => v.status !== "classic");
    eq(authored.length, authoredVariants().length, "authoredVariants()");
    eq(authored.length, 19, "authored variants");
    for (const v of authored) {
      const family = v.section === "mobileBar" ? "action-bar" : v.section;
      const sheet = v.section === "mobileBar" ? "styles/design/action-bar.css" : `styles/design/${family}-${v.variant}.css`;
      eq([v.module, v.css], [`design/variants/${family}/${v.variant}.tsx`, sheet], `${v.section}.${v.variant}`);
      eq(v.data, registry.sections[v.section]!.slot !== null ? `design/variants/${family}/${v.variant}.data.ts` : null, `${v.section}.${v.variant} data module`);
      for (const rel of [v.module, v.data, v.css]) if (rel) await readFile(path.join(repoRoot, TEMPLATE_DIR, rel));
    }
  });
  await check("R3 the component maps, the slot-data maps and the stylesheet list are the registry's — no variant is registered without an implementation entry, none is implemented without being registered", async () => {
    const keys = (o: object) => Object.keys(o);
    const home = Object.entries(registry.sections).filter(([, s]) => s.place === "home");
    eq(Object.fromEntries(Object.entries(HOME_SECTIONS).map(([s, m]) => [s, keys(m)])), Object.fromEntries(home.filter(([, s]) => s.slot === null).map(([id, s]) => [id, keys(s.variants)])), "HOME_SECTIONS");
    eq(Object.fromEntries(Object.entries(HOME_SLOT_DATA).map(([s, m]) => [s, keys(m)])), Object.fromEntries(home.filter(([, s]) => s.slot !== null).map(([id, s]) => [id, keys(s.variants)])), "HOME_SLOT_DATA");
    eq(keys(DETAIL_SLOT_DATA), keys(registry.sections.detail!.variants), "DETAIL_SLOT_DATA");
    eq(keys(LISTING_SLOT_DATA), keys(registry.sections.listing!.variants), "LISTING_SLOT_DATA");
    const bySlot: Record<string, string[]> = {};
    for (const s of Object.values(registry.sections)) if (s.slot !== null && keys(s.variants).length > 1) bySlot[s.slot] = keys(s.variants).slice(1);
    eq(Object.fromEntries(Object.entries(SLOT_VARIANT_COMPONENTS).map(([s, m]) => [s, keys(m)])), bySlot, "SLOT_VARIANT_COMPONENTS");
    eq([keys(HEADERS), keys(FOOTERS), keys(MOBILE_BARS)], [keys(registry.sections.header!.variants), keys(registry.sections.footer!.variants), keys(registry.sections.mobileBar!.variants)], "chrome maps");
    for (const map of [...Object.values(HOME_SECTIONS), ...Object.values(SLOT_VARIANT_COMPONENTS), HEADERS, FOOTERS]) for (const [id, entry] of Object.entries(map)) assert(typeof entry === "function" || (typeof entry.data === "function" && typeof entry.Section === "function"), `${id}: not a component / not { data, Section }`);
    const styles = await readFile(path.join(repoRoot, TEMPLATE_DIR, "design/styles.ts"), "utf8");
    const imported = [...styles.matchAll(/^import "\.\.\/(styles\/design\/[a-z-]+\.css)";$/gm)].map((m) => m[1]!);
    eq(imported.slice(0, 2), ["styles/design/tokens.css", "styles/design/inner.css"], "tokens first, then the inner pages");
    eq(imported.slice(2).sort(), variants.filter((v) => v.css).map((v) => v.css!).sort(), "variant sheets imported");
    eq((await readdir(path.join(repoRoot, TEMPLATE_DIR, "styles/design"))).map((name) => `styles/design/${name}`).sort(), [...imported].sort(), "files of styles/design");
  });
  await check("R4 the static check passes on the working tree; in a copy it reports a missing module, a status that disagrees with the mark (a placeholder whose mark was removed · a ready variant that still carries it), a ready variant whose sheet has no rule, a stylesheet that is not imported and a tokens.css edited by hand", async () => {
    eq(await checkRegistry({ repoRoot, templateId: TEMPLATE_ID }), [], "the working tree");
    const copy = path.join(tmp, "broken");
    await cp(path.join(repoRoot, TEMPLATE_DIR), path.join(copy, TEMPLATE_DIR), { recursive: true, filter: (src) => !/(^|\/)(node_modules|\.next|out)(\/|$)/.test(src.slice(repoRoot.length)) });
    const at = (rel: string) => path.join(copy, TEMPLATE_DIR, rel);
    await rm(at("design/variants/cta/band.tsx"));
    await writeFile(at("design/styles.ts"), (await readFile(at("design/styles.ts"), "utf8")).replace('import "../styles/design/services-rows.css";\n', ""));
    await writeFile(at("styles/design/tokens.css"), (await readFile(at("styles/design/tokens.css"), "utf8")).replace("--ds-hairline: 1px", "--ds-hairline: 2px"));
    await writeFile(at("styles/design/showcase-cards.css"), ".ds-showcase-cards { color: #ff0000 }\n.i2-hero { display: none }\n");
    // the status ↔ mark ↔ sheet rule, on whatever the tree holds today: one placeholder (if any) loses its mark, one ready variant (if any) gets it back and loses its rules
    const untouched = (v: (typeof variants)[number]) => v.module !== null && !["cta.band", "services.rows", "showcase.cards"].includes(`${v.section}.${v.variant}`);
    const placeholder = variants.find((v) => v.status === "placeholder" && untouched(v));
    const ready = variants.find((v) => v.status === "ready" && untouched(v));
    assert(placeholder || ready, "the registry holds neither a placeholder nor a ready variant");
    if (placeholder) await writeFile(at(placeholder.module!), (await readFile(at(placeholder.module!), "utf8")).replaceAll(PLACEHOLDER_MARK, "implemented"));
    if (ready) {
      await writeFile(at(ready.module!), `/* ${PLACEHOLDER_MARK} */\n${await readFile(at(ready.module!), "utf8")}`);
      await writeFile(at(ready.css!), "/* no rule */\n");
    }
    const issues = await checkRegistry({ repoRoot: copy, templateId: TEMPLATE_ID });
    const has = (where: string, message: RegExp) => assert(issues.some((i) => i.path === where && message.test(i.message)), `no finding at ${where} matching ${message} — got ${JSON.stringify(issues)}`);
    has("cta.band", /module design\/variants\/cta\/band\.tsx does not exist/);
    has("services.rows", /is not imported by design\/styles\.ts/);
    has("tokens", /is not what the compiler writes/);
    has("showcase.cards", /colour literal "#ff0000"/);
    has("showcase.cards", /selector "\.i2-hero" is outside \.ds-showcase-cards/);
    if (placeholder) has(`${placeholder.section}.${placeholder.variant}`, /is implemented \(no @ds-placeholder mark\) but its status is still "placeholder"/);
    if (ready) {
      has(`${ready.section}.${ready.variant}`, /is "ready" but .* still carries the @ds-placeholder mark/);
      has(`${ready.section}.${ready.variant}`, /is "ready" but .* has no rule/);
    }
    eq(issues.length, 5 + (placeholder ? 1 : 0) + (ready ? 2 : 0), "exactly these findings");
  });
  await check("R5 the CSS rules of a variant sheet: its own namespace, no colour literal, type only through --ds-*, no url() and no @import; the inner-pages sheet is scoped to a site WITH a design document", () => {
    const ok = `.ds-hero-photo { display: grid; gap: var(--ds-space-4); color: var(--ds-ink); font-size: var(--ds-text-lg); font-family: var(--ds-font-display); }
@media (min-width: 700px) { .ds-hero-photo__media, .ds-hero-photo > h2 { border-radius: var(--ds-radius-media); } }
@keyframes ds-hero-photo-in { from { opacity: 0 } 50% { opacity: 0.5 } to { opacity: 1 } }
html[data-design] .ds-hero-photo:hover { background: var(--ds-surface); }`;
    eq(lintVariantCss("styles/design/hero-photo.css", ok), [], "a sheet that keeps the rules");
    eq(lintVariantCss("styles/design/hero-photo.css", "/* only a comment: #fff url(x) */\n"), [], "an empty sheet");
    const bad: [string, RegExp][] = [
      [".ds-hero-photography { margin: 0 }", /outside \.ds-hero-photo/],
      [".ds-hero-photo, .i2-hero { margin: 0 }", /selector "\.i2-hero" is outside/],
      ["h2 { margin: 0 }", /selector "h2" is outside/],
      [".ds-hero-photo { color: #1c1b18 }", /colour literal "#1c1b18"/],
      [".ds-hero-photo { background: rgba(0, 0, 0, 0.4) }", /colour literal "rgba\("/],
      [".ds-hero-photo { color: hsl(20 10% 10%) }", /colour literal "hsl\("/],
      [".ds-hero-photo { font-size: 18px }", /font-size: 18px/],
      [".ds-hero-photo { font-size: clamp(1rem, 2vw, 2rem) }", /font-size: clamp/],
      [".ds-hero-photo { font-family: Georgia, serif }", /font-family: Georgia, serif/],
      [".ds-hero-photo { background: url(/x.png) }", /url\(\)/],
      ['@import "x.css"; .ds-hero-photo { margin: 0 }', /@import/],
    ];
    for (const [css, message] of bad) assert(lintVariantCss("styles/design/hero-photo.css", css).some((p) => message.test(p)), `${css} → ${JSON.stringify(lintVariantCss("styles/design/hero-photo.css", css))}`);
    const scope = 'html[data-design]:not([data-design="classic"])';
    eq(lintVariantCss("styles/design/inner.css", `${scope} .i2-pg { color: var(--ds-ink) }`, scope), [], "inner sheet, scoped");
    assert(lintVariantCss("styles/design/inner.css", ".i2-pg { color: var(--ds-ink) }", scope).length === 1, "inner sheet, unscoped rule accepted");
  });

  await check("R6 the service page on a preset site (inner.css): every rule that fixes the dead glance column / team grid is out of reach of a classic and a custom site, the tile / icon colour rule is luxury-gallery's alone, and luxury's panels keep text ≥ 4.5:1", async () => {
    const inner = await readFile(path.join(repoRoot, TEMPLATE_DIR, "styles/design/inner.css"), "utf8");
    const text = inner.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1]!.split(",").map((x) => x.trim()).filter((x) => x !== "" && !x.startsWith("@")), body: m[2]! }));
    const CUSTOM_OUT = ':not([data-design="custom"])';
    const LUXURY = '[data-design="luxury-gallery"]';
    const sv = (x: string) => /\.i2-sv-/.test(x);
    const qualified = rules.filter((r) => r.selectors.some(sv) && r.selectors.every((x) => x.includes(CUSTOM_OUT) || x.includes(LUXURY)));
    assert(qualified.length === 13, `the service rules of this round: expected 13, found ${qualified.length}`);
    for (const r of qualified) for (const x of r.selectors) assert(x.startsWith('html[data-design]:not([data-design="classic"])'), `${x}: not scoped to a designed site`);
    // layout / colour handles of the three blocks are only ever set under a qualifier: nothing reaches a custom site by another rule
    for (const r of rules) {
      if (qualified.includes(r) || !r.selectors.some((x) => /\.i2-sv-(glance__(cols|rows|row|body)|team__(list|item|icon|head)|tier)$/.test(x) || /\.i2-sv-tier$/.test(x.split(" ").pop()!))) continue;
      assert(!/(grid-template-columns|display|--i2-tile|background|border)\s*:/.test(r.body), `${r.selectors.join(", ")}: sets layout or colour of the service blocks without a preset qualifier`);
    }
    const glance = qualified.filter((r) => r.selectors.some((x) => /\.i2-sv-glance__(cols|rows|row|body)\b/.test(x)));
    assert(glance.length === 4 && glance.every((r) => r.selectors.every((x) => x.includes(".i2-sv-glance__cols:not(:has(.i2-sv-glance__figure))"))), "the glance rules need the \"no figure\" condition on every selector: the figure case is the classic grid");
    const luxuryRules = qualified.filter((r) => r.selectors.every((x) => x.includes(LUXURY)));
    assert(luxuryRules.length === 5 && luxuryRules.every((r) => r.selectors.every((x) => x.startsWith(`html[data-design]:not([data-design="classic"])${LUXURY}`))), "luxury-gallery's tile / icon rules");
    assert(qualified.filter((r) => !luxuryRules.includes(r)).every((r) => r.selectors.every((x) => x.includes(CUSTOM_OUT))), "the layout rules exclude a custom site");
    // the rules hold only tokens: no colour literal, no raw font-size, no url(): the same gate the registry runs on the whole sheet
    eq(lintVariantCss("styles/design/inner.css", inner, 'html[data-design]:not([data-design="classic"])'), [], "inner.css lint");
    // luxury's quiet panels: text on --ds-surface and on --ds-bg
    const luxury = presets.find((pr) => pr.id === "luxury-gallery")!;
    const tokens = compileDesignTokens({ theme: luxury.design.theme, tier1: tier1Of(luxury), fontSet: luxury.design.fontSet });
    const rgb = (name: string) => parseColor(valueOf(tokens, name))!;
    for (const [fg, bg] of [["--ds-ink", "--ds-surface"], ["--ds-muted", "--ds-surface"], ["--ds-ink", "--ds-bg"], ["--ds-muted", "--ds-bg"]] as const) {
      assert(contrastRatio(rgb(fg), rgb(bg)) >= 4.5, `${fg} on ${bg}: ${contrastRatio(rgb(fg), rgb(bg)).toFixed(2)}`);
    }
  });

  // ══ gate ══════════════════════════════════════════════════════════════════════════════════════
  console.log("\n[gate] placeholders and the release gate");
  /** every variant a preset names, as the gate walks it */
  const namedBy = (preset: SitePreset): { path: string; section: string; variant: string }[] => [
    { path: "design.chrome.header", section: "header", variant: preset.design.chrome.header },
    { path: "design.chrome.footer", section: "footer", variant: preset.design.chrome.footer },
    { path: "design.chrome.mobileBar", section: "mobileBar", variant: preset.design.chrome.mobileBar },
    ...preset.design.home.map((entry, i) => ({ path: `design.home.${i}.variant`, section: entry.section, variant: entry.variant })),
    { path: "design.pages.listing", section: "listing", variant: preset.design.pages.listing },
    { path: "design.pages.detail", section: "detail", variant: preset.design.pages.detail },
  ];
  const statusOf = (section: string, variant: string) => registry.sections[section]!.variants[variant]!.status;
  /** the status a family's own status.ts file holds for a variant (read as text: the file the family's owner edits) */
  const statusFileOf = async (v: (typeof variants)[number]): Promise<string | undefined> => {
    const text = await readFile(path.join(repoRoot, TEMPLATE_DIR, path.posix.dirname(v.module!), "status.ts"), "utf8");
    return new RegExp(`"${v.variant}":\\s*"(placeholder|ready)"`).exec(text)?.[1];
  };
  const rulesOf = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "").split("{").length - 1;
  await check("G1 per authored variant the three agree: its family's status.ts (what the registry reads) ↔ the @ds-placeholder mark in its module and data module ↔ its stylesheet — `placeholder` = every file carries the mark; `ready` = no file carries it and the sheet has at least one rule; in RELEASE MODE every variant a preset names is `ready`", async () => {
    for (const v of variants.filter((x) => x.status !== "classic")) {
      const where = `${v.section}.${v.variant}`;
      assert(v.status === "placeholder" || v.status === "ready", `${where}: status ${v.status}`);
      eq(await statusFileOf(v), v.status, `${where}: status.ts ↔ the registry`);
      for (const rel of [v.module, v.data]) {
        if (!rel) continue;
        const marked = (await readFile(path.join(repoRoot, TEMPLATE_DIR, rel), "utf8")).includes(PLACEHOLDER_MARK);
        eq(marked, v.status === "placeholder", `${where}: ${rel} ${marked ? "carries" : "has no"} ${PLACEHOLDER_MARK} mark but the status is "${v.status}"`);
      }
      if (v.status === "ready") assert(rulesOf(await readFile(path.join(repoRoot, TEMPLATE_DIR, v.css!), "utf8")) > 0, `${where} is "ready" but ${v.css} has no rule`);
    }
    // what a preset names that is still a placeholder = what the gate reports, reference by reference
    for (const preset of presets) {
      const expected = namedBy(preset).filter((n) => statusOf(n.section, n.variant) === "placeholder");
      eq(presetPlaceholders(preset, registry), expected, `${preset.id}: placeholder references`);
      if (RELEASE_MODE) eq(expected.map((n) => `${n.path}=${n.section}.${n.variant}`), [], `${preset.id} names a placeholder (release mode)`);
    }
    // every registered non-classic variant is named by at least one preset (CONTRACTS E9a): none is finished without being shown
    const named = new Set(presets.flatMap((p) => namedBy(p).map((n) => `${n.section}.${n.variant}`)));
    eq(variants.filter((v) => v.status !== "classic" && !named.has(`${v.section}.${v.variant}`)).map((v) => `${v.section}.${v.variant}`), [], "variants no preset names");
  });
  await check("G2 the release gate FAILS exactly while a preset names a placeholder — one design_placeholder finding per reference, and nothing else is wrong; a variant forced back to `placeholder` is one finding per preset that names it; with every variant ready the presets name none; in RELEASE MODE the gate passes", async () => {
    const gate = await releaseGate({ repoRoot, templateId: TEMPLATE_ID });
    const references = presets.reduce((n, p) => n + presetPlaceholders(p, registry).length, 0);
    eq([...new Set(gate.issues.map((i) => i.code))], references > 0 ? ["design_placeholder"] : [], "the only kind of finding");
    eq(gate.issues.length, references, "one finding per placeholder reference");
    eq(gate.pass, references === 0, "the gate passes exactly when no preset names a placeholder");
    eq(gate.presets.map((p) => p.id), PRESET_IDS, "presets looked at");
    eq(gate.presets.map((p) => p.placeholders.length), presets.map((p) => presetPlaceholders(p, registry).length), "placeholders per preset");
    if (RELEASE_MODE) eq([gate.pass, gate.issues], [true, []], "release mode: the gate");
    const ready = clone(registry) as DesignRegistry;
    for (const section of Object.values(ready.sections)) for (const v of Object.values(section.variants)) if (v.status === "placeholder") v.status = "ready";
    for (const preset of presets) eq(presetPlaceholders(preset, ready), [], `${preset.id} once its variants are ready`);
    // from that all-ready registry: one variant back to placeholder = exactly its references, at their paths
    const partly = clone(ready) as DesignRegistry;
    partly.sections.hero!.variants.photo!.status = "placeholder";
    eq(presetPlaceholders(luxury, partly), [{ path: "design.home.0.variant", section: "hero", variant: "photo" }], "luxury-gallery names hero.photo");
    for (const preset of presets) eq(presetPlaceholders(preset, partly).length, namedBy(preset).filter((n) => n.section === "hero" && n.variant === "photo").length, `${preset.id}: only the references to hero.photo`);
    const none = clone(ready) as DesignRegistry;
    for (const section of Object.values(none.sections)) for (const v of Object.values(section.variants)) if (v.status === "ready") v.status = "placeholder";
    for (const preset of presets) eq(presetPlaceholders(preset, none), namedBy(preset).filter((n) => none.sections[n.section]!.variants[n.variant]!.status === "placeholder"), `${preset.id} with every authored variant a placeholder`);
    assert(presets.every((p) => presetPlaceholders(p, none).length > 0), "a preset names no authored variant at all");
  });
  const cli = (script: string, ...args: string[]) => spawnSync(path.join(repoRoot, "node_modules/.bin/tsx"), ["--tsconfig", "platform/tsconfig.json", `platform/cli/${script}.ts`, ...args], { cwd: repoRoot, encoding: "utf8" });
  await check("G3 CLI: `design:check interior-02` exits 0; `--release` exits 1 exactly while a preset names a placeholder and lists those references (0 and none otherwise; always 0 in RELEASE MODE); an unknown template exits 1 (design_unavailable)", () => {
    const plain = cli("design-check", TEMPLATE_ID);
    assert(plain.status === 0, `design-check exit ${plain.status}: ${plain.stderr}`);
    eq(JSON.parse(plain.stdout).pass, true, "registry mode");
    const references = presets.reduce((n, p) => n + presetPlaceholders(p, registry).length, 0);
    const gate = cli("design-check", TEMPLATE_ID, "--release");
    const out = JSON.parse(gate.stdout) as { mode: string; pass: boolean; issues: { code: string }[] };
    eq([gate.status, out.mode, out.pass, out.issues.every((i) => i.code === "design_placeholder"), out.issues.length], [references > 0 ? 1 : 0, "release-gate", references === 0, true, references], "release gate output");
    if (RELEASE_MODE) eq(gate.status, 0, "release mode: the release gate exit code");
    const unknown = cli("design-check", "interior-01");
    assert(unknown.status === 1 && /design_unavailable/.test(unknown.stderr), `interior-01: exit ${unknown.status} ${unknown.stderr}`);
  });

  // ══ classic + carrier ═════════════════════════════════════════════════════════════════════════
  // Real site contexts: a fixture site (starter → brand block → optional preset → eight projects)
  // read back through the site loader, with the working tree's manifest.
  async function contextOf(siteId: string, presetId: string | null) {
    await makeFixture({ repoRoot, root, siteId, release, profile: "regular8", presetId });
    const { snapshot } = await buildSiteSnapshot({ repoRoot: root, siteId, mode: "public", at: AT });
    // the site data of the fixture, rendered by the WORKING TREE's manifest (the pin is only a self-consistency check here)
    const pin = { ...release, templateVersion: template.version };
    const snap = clone(snapshot) as typeof snapshot & { site: { template: ReleasePin } };
    snap.site.template = pin;
    return createSiteContext({ siteId, template, templateRelease: pin, mode: "public", at: AT, snapshot: snap });
  }
  const hasKey = (value: unknown, key: string): boolean => JSON.stringify(value, (k, v: unknown) => (k === key ? "\u0000FOUND" : v))?.includes("\u0000FOUND") ?? false;

  console.log("\n[classic] no design document = the classic site");
  const classicCtx = await contextOf("design-classic", null);
  await check("C1 a site with no design document: settings `site.design.config` is null, it is the classic site (data-design=\"classic\"), no font stylesheet, and its files hold nothing of the design system", async () => {
    eq(classicCtx.settings["site.design"], { config: null }, "site.design");
    eq([isClassicSite(classicCtx), designId(classicCtx), designOf(classicCtx) === CLASSIC_DESIGN], [true, "classic", true], "resolve");
    eq(fontStylesheetHref(designOf(classicCtx).fontSet), undefined, "font stylesheet");
    const dir = path.join(root, "data/sites/design-classic");
    for (const rel of ["settings.json", "theme.json", "slots.json"]) assert(!/site\.design|dsVariant|Pretendard Variable|Noto Serif/.test(await readFile(path.join(dir, rel), "utf8")), `${rel} mentions the design system`);
  });
  await check("C2 the classic recipe is the home page of release 1.1.x: hero, showcase, promos, keywords, services, recent, brands, showrooms — the sections of the released page, in its order, each in its classic variant; classic chrome and pages", async () => {
    eq(CLASSIC_DESIGN.home.map((e) => `${e.section}:${e.variant}`), ["hero", "showcase", "promos", "keywords", "services", "recent", "brands", "showrooms"].map((s) => `${s}:classic`), "the classic recipe");
    eq([CLASSIC_DESIGN.preset, CLASSIC_DESIGN.chrome, CLASSIC_DESIGN.pages, CLASSIC_DESIGN.fontSet, CLASSIC_DESIGN.theme], [null, { header: "classic", footer: "classic", mobileBar: "none" }, { listing: "classic", detail: "classic" }, "system", CLASSIC_THEME], "classic chrome, pages, font set, theme");
    // the released page, read from the release store: the order of what it renders
    const released = await readFile(path.join(repoRoot, "data/template-releases", TEMPLATE_ID, CLASSIC_BASELINE, "files", TEMPLATE_DIR, "app/page.tsx"), "utf8");
    const body = released.slice(released.indexOf("return ("));
    const order = [...body.matchAll(/<Slot name="(home\.[a-z]+)"|<(Home[A-Za-z]+)\b/g)].map((m) => m[1] ?? m[2]);
    const name = (section: string) => registry.sections[section]!.slot ?? { promos: "HomePromos", services: "HomeService", brands: "HomeBrands", showrooms: "HomeShowrooms" }[section];
    eq(CLASSIC_DESIGN.home.map((e) => name(e.section)), order, `the released app/page.tsx of ${CLASSIC_BASELINE} renders`);
  });
  await check("C3 classic dispatch is the classic code itself: the classic entries ARE the existing functions and components (identity); the home page's slots are the four of the released page with exactly the data the classic functions return — no variant key anywhere in any page's slot data", () => {
    assert(HOME_SLOT_DATA.hero!.classic === homeHero && HOME_SLOT_DATA.showcase!.classic === homeProjects && HOME_SLOT_DATA.keywords!.classic === homeKeywords && HOME_SLOT_DATA.recent!.classic === homeRecent, "a classic slot-data entry is not the existing function");
    assert(HEADERS.classic === SiteHeader && FOOTERS.classic === SiteFooter && MOBILE_BARS.none === null, "a classic chrome entry is not the existing component");
    const slots = homeSlots(classicCtx);
    eq(Object.keys(slots), ["home.hero", "home.projects", "home.keywords", "home.recent"], "slot keys, in order");
    eq(slots, { "home.hero": homeHero(classicCtx), "home.projects": homeProjects(classicCtx), "home.keywords": homeKeywords(classicCtx), "home.recent": homeRecent(classicCtx) }, "slot data");
    const pages = portfolioRuntime.pages(classicCtx);
    eq(pages.map((p) => p.path).slice(0, 2), ["/", "/portfolio"], "pages");
    eq(pages.length, 10, "home + list + eight projects");
    for (const page of pages) assert(!hasKey(page.slots, SLOT_VARIANT_KEY), `${page.path}: slot data carries ${SLOT_VARIANT_KEY}`);
    eq([slotVariant(slots["home.hero"]), slotVariant(undefined), slotVariant("photo"), slotVariant({ [SLOT_VARIANT_KEY]: 3 })], [undefined, undefined, undefined, undefined], "slotVariant of classic data");
  });

  console.log("\n[carrier] a preset's variants reach the pages through the slot data");
  await check("K1 for each preset: data-design is the preset id; the home page has exactly the slots of the recipe's slot sections; each slot's data is the variant's own data plus `dsVariant`; the detail pages carry the detail variant; classic entries carry none", async () => {
    for (const preset of presets) {
      const ctx = await contextOf(`design-${preset.id}`, preset.id);
      eq([isClassicSite(ctx), designId(ctx)], [false, preset.id], `${preset.id}: resolve`);
      eq(ctx.settings["site.design"].config, { preset: { id: preset.id, version: preset.version }, ...preset.design }, `${preset.id}: the settings`);
      const pages = portfolioRuntime.pages(ctx);
      const home = pages.find((p) => p.path === "/")!;
      const expected = preset.design.home.filter((e) => registry.sections[e.section]!.slot !== null);
      eq(Object.keys(home.slots), expected.map((e) => registry.sections[e.section]!.slot), `${preset.id}: home slots`);
      for (const entry of expected) {
        const data = home.slots[registry.sections[entry.section]!.slot!];
        eq(slotVariant(data), entry.variant === "classic" ? undefined : entry.variant, `${preset.id}: ${entry.section}`);
        const own = HOME_SLOT_DATA[entry.section]![entry.variant]!(ctx);
        eq(data, entry.variant === "classic" ? own : { ...own, [SLOT_VARIANT_KEY]: entry.variant }, `${preset.id}: ${entry.section} data`);
        if (entry.variant !== "classic") assert(typeof SLOT_VARIANT_COMPONENTS[registry.sections[entry.section]!.slot!]![entry.variant] === "function", `${preset.id}: no component for ${entry.section}.${entry.variant}`);
      }
      const details = pages.filter((p) => /^\/portfolio\/[^/]+$/.test(p.path) && !/^\/portfolio\/page\//.test(p.path));
      eq(details.length, 8, `${preset.id}: detail pages`);
      for (const page of details) eq(slotVariant(page.slots["portfolio.detail"]), preset.design.pages.detail === "classic" ? undefined : preset.design.pages.detail, `${preset.id}: ${page.path}`);
      eq(slotVariant(pages.find((p) => p.path === "/portfolio")!.slots["portfolio.index"]), undefined, `${preset.id}: the list is classic`);
      assert(fontStylesheetHref(designOf(ctx).fontSet) === `/${design.fontPins.dir}/${preset.design.fontSet}/${design.fontPins.sets[preset.design.fontSet]!.css.file}`, `${preset.id}: font stylesheet href`);
    }
  });

  await check("K2 every photograph of a detail variant opens in the CLASSIC photo viewer: the data carries the classic viewer words; each project photo (opening image, gallery photos, before / after) is a zoom button around its <img alt>; the viewer is shared (PhotoViewer of the classic gallery, no dialog or script of the variants' own) and is absent from the server markup; a record without a gallery has no zoom", async () => {
    const zoomSource = await readFile(path.join(repoRoot, TEMPLATE_DIR, "design/variants/detail/zoom.tsx"), "utf8");
    assert(/import \{[^}]*\bPhotoViewer\b[^}]*\} from "\.\.\/\.\.\/\.\.\/components\/portfolio\/ProjectGallery"/.test(zoomSource), "zoom.tsx imports the classic PhotoViewer");
    assert(!/showModal|<dialog|addEventListener|querySelector/.test(zoomSource.replace(/\/\*[\s\S]*?\*\//g, "")), "zoom.tsx writes no viewer of its own");
    for (const sheet of ["detail-gallery.css", "detail-typographic.css"]) assert(!/i2-pviewer/.test(await readFile(path.join(repoRoot, TEMPLATE_DIR, "styles/design", sheet), "utf8")), `${sheet} restyles the classic viewer`);
    const cases = [["gallery", "luxury-gallery"], ["typographic", "editorial-studio"]] as const;
    for (const [variant, presetId] of cases) {
      const ctx = await contextOf(`design-zoom-${variant}`, presetId);
      eq(designOf(ctx).pages.detail, variant, `${presetId} names the ${variant} detail page`);
      const projects = ctx.content.list({ type: "projects", selection: { mode: "latest" }, limit: 100 }).items;
      assert(projects.length === 8, `${variant}: projects`);
      const Section = SLOT_VARIANT_COMPONENTS["portfolio.detail"]![variant]!;
      for (const project of projects) {
        const classic = DETAIL_SLOT_DATA.classic!(ctx, project) as { gallery?: { labels: unknown; groups: { items: unknown[] }[] }; beforeAfter?: { pairs: unknown[] } };
        const data = DETAIL_SLOT_DATA[variant]!(ctx, project) as Parameters<typeof zoomSeats>[0];
        assert(classic.gallery !== undefined, `${variant} ${project.id}: a gallery to enlarge`);
        eq(data.viewer, classic.gallery.labels, `${variant} ${project.id}: the viewer words are the classic gallery's`);
        const photos = (data.photos?.groups ?? []).reduce((n, g) => n + g.items.length, 0);
        const pairs = data.beforeAfter?.pairs.length ?? 0;
        const markup = renderToStaticMarkup(createElement(Section, { data }));
        const buttons = markup.match(/<button[^>]*data-gallery-zoom=""[^>]*>[\s\S]*?<\/button>/g) ?? [];
        eq(buttons.length, 1 + photos + 2 * pairs, `${variant} ${project.id}: a zoom button for the opening image, every gallery photo and both photos of every pair`);
        for (const button of buttons) {
          assert(button.includes('aria-haspopup="dialog"') && /aria-label="[^"]+"/.test(button) && /<img [^>]*\balt="[^"]*"/.test(button), `${variant} ${project.id}: ${button.slice(0, 160)}`);
        }
        assert(!markup.includes("<dialog"), `${variant} ${project.id}: the viewer is on demand, not in the server markup`);
        const seats = zoomSeats(data);
        eq(new Set(seats.map((seat) => seat.image.src)).size, seats.length, `${variant} ${project.id}: each source once`);
        assert(seats[0]!.image.src === data.cover.src && seats.length >= 1 + photos, `${variant} ${project.id}: the opening image first, then the groups`);
        for (const pair of data.beforeAfter?.pairs ?? []) assert(seats.some((seat) => seat.image.src === pair.before.src), `${variant} ${project.id}: a "before" photograph is in the viewer`);
      }
      // a page without the viewer words (a record with no gallery) enlarges nothing and still shows every photograph
      const data = DETAIL_SLOT_DATA[variant]!(ctx, projects[0]!) as Parameters<typeof zoomSeats>[0];
      const plain = renderToStaticMarkup(createElement(Section, { data: { ...data, viewer: undefined } }));
      assert(!plain.includes("data-gallery-zoom") && !plain.includes("<button"), `${variant}: no viewer words, no zoom button`);
      eq(plain.match(/<img /g)?.length, renderToStaticMarkup(createElement(Section, { data })).match(/<img /g)?.length, `${variant}: the same photographs either way`);
    }
  });

  // ══ main ══════════════════════════════════════════════════════════════════════════════════════
  console.log("\n[main] the skip-link target");
  await check('M1 <main> gets id="main" only on a site WITH a design document (the classic site\'s markup is untouched: no id attribute at all); every page of the Template renders its <main> through that one rule, the id last so the classic attributes keep their order', async () => {
    eq([MAIN_ID, mainId(classicCtx)], ["main", undefined], "the classic site");
    const designed = await contextOf("design-main", "luxury-gallery");
    eq(mainId(designed), "main", "a site with a design document");
    const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])))).flat();
    const pages = (await walk(path.join(repoRoot, TEMPLATE_DIR, "app"))).filter((f) => f.endsWith(".tsx"));
    let mains = 0;
    for (const file of pages) {
      for (const tag of (await readFile(file, "utf8")).match(/<main\s[^>]*>/g) ?? []) {
        mains++;
        assert(/^<main className="[^"]+"(?: data-page="[^"]+")? id=\{mainId\(ctx\)\}>$/.test(tag), `${path.relative(repoRoot, file)}: ${tag}`);
      }
    }
    eq(mains, 9, "the <main> elements of app/** (home, not-found, contact, faq, about, service, the list and its pages, the detail)");
  });

  // ══ fonts ═════════════════════════════════════════════════════════════════════════════════════
  console.log("\n[fonts] font sets");
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
  await check("F1 the pins: two sets beside `system`, every family from an exactly pinned package under OFL-1.1 — the version the repository's package.json holds, the version installed, and a licence file in the package", async () => {
    eq([design.fontPins.schema, design.fontPins.dir, Object.keys(design.fontPins.sets)], ["design-fonts@1", "_fonts", ["sans-pretendard", "serif-noto"]], "pins");
    eq(design.fontStacks.system, null, "system has no family of its own");
    for (const [id, pin] of Object.entries(design.fontPins.sets)) {
      for (const family of pin.families) {
        eq(family.licence, "OFL-1.1", `${id}: ${family.family}`);
        eq(manifest.devDependencies[family.package], family.version, `${family.package} in package.json (exact)`);
        const dir = path.join(repoRoot, "node_modules", family.package);
        const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as { version: string; license?: string };
        eq([pkg.version, pkg.license], [family.version, "OFL-1.1"], `${family.package} installed`);
        const shipped = [...(await readdir(dir)), ...(await readdir(path.join(dir, "dist")).catch(() => [] as string[]))];
        assert(shipped.some((name) => /^(LICENSE|LICENCE|OFL)/i.test(name)), `${family.package} ships no licence file`);
      }
    }
    eq(design.fontPins.sets["sans-pretendard"]!.families.map((f) => `${f.package}@${f.version}`), ["pretendard@1.3.9"], "sans-pretendard");
    eq(design.fontPins.sets["serif-noto"]!.families.map((f) => `${f.package}@${f.version}`), ["@fontsource-variable/noto-serif-kr@5.3.0", "pretendard@1.3.9"], "serif-noto");
  });
  const built = new Map<string, Awaited<ReturnType<typeof buildFontSet>>>();
  await check("F2 reproducible: each set built from the installed packages is the pinned one (stylesheet sha256, licence texts, file count, bytes); every file is named by its own hash; the stylesheet is one notice line per family and @font-face rules only — font-display: swap, a unicode-range slice and a relative url() each, no remote address; every family's OFL text is IN the set, byte for byte as its package ships it, hash-named and pinned (D-36)", async () => {
    const { createHash } = await import("node:crypto");
    for (const [id, pin] of Object.entries(design.fontPins.sets)) {
      const set = await buildFontSet(repoRoot, id, pin);
      built.set(id, set);
      eq(pinOf(set), measuredPin(pin), id);
      eq(Object.keys(pin).slice(0, 4), ["css", "licences", "files", "bytes"], `${id}: the measured members of the pin`);
      for (const [name, bytes] of set.files) assert(name.startsWith(createHash("sha256").update(bytes).digest("hex").slice(0, FONT_HASH_LENGTH)) && /^[0-9a-f]{20}\.(woff2|css|txt)$/.test(name), `${id}: ${name} is not named by its hash`);
      const css = set.files.get(set.stylesheet.file)!.toString("utf8");
      const lines = css.trim().split("\n");
      const notices = lines.slice(0, set.families.length);
      const rules = lines.slice(set.families.length);
      eq(rules.length, [...set.families].reduce((n, f) => n + f.faces, 0), `${id}: one rule per face`);
      for (const rule of rules) assert(/^@font-face\{font-family:"[A-Za-z ]+";font-style:normal;font-weight:\d+ \d+;font-display:swap;src:url\(\.\/[0-9a-f]{20}\.woff2\) format\("woff2(-variations)?"\);unicode-range:U\+[0-9A-Fa-f?,U+-]+\}$/.test(rule), `${id}: unexpected rule ${rule.slice(0, 160)}`);
      assert(!/https?:|\/\//.test(css), `${id}: the stylesheet holds a remote address`);
      for (const m of css.matchAll(/url\(\.\/([0-9a-f]{20}\.woff2)\)/g)) assert(set.files.has(m[1]!), `${id}: ${m[1]} is referenced but not in the set`);
      // one notice line per family; the licence text the package ships was read and is the OFL (its hash is reported)
      for (const [i, family] of set.families.entries()) {
        eq(notices[i], `/* ${family.family} — OFL-1.1 — ${family.package}@${family.version} */`, `${id}: notice of ${family.family}`);
        const pinned = pin.families[i]!;
        const text = await readFile(path.join(repoRoot, "node_modules", pinned.package, pinned.licenceFile));
        eq(family.licenceSha256, createHash("sha256").update(text).digest("hex"), `${id}: licence text of ${family.family}`);
        assert(/SIL OPEN FONT LICENSE Version 1\.1/.test(text.toString("utf8")) && /Permission is hereby granted/.test(text.toString("utf8")), `${id}: ${pinned.licenceFile} is not the licence text`);
        // …and it is a file of the set: the package's bytes, named by their hash, pinned by the release
        eq(family.licenceFile, `${family.licenceSha256.slice(0, FONT_HASH_LENGTH)}.txt`, `${id}: licence file name of ${family.family}`);
        assert(set.files.get(family.licenceFile)?.equals(text), `${id}: ${family.licenceFile} is not the text ${pinned.package} ships`);
        assert(pin.licences.some((l) => l.file === family.licenceFile && l.sha256 === family.licenceSha256 && l.bytes === text.length), `${id}: the release does not pin the licence text of ${family.family}`);
        assert(FONT_LICENCE_FILE_RE.test(`${design.fontPins.dir}/${id}/${family.licenceFile}`), `${id}: ${family.licenceFile} is not where package QA expects a licence text`);
      }
      eq(set.licences, pin.licences, `${id}: licence texts`);
      eq(set.licences.length, new Set(set.families.map((f) => f.licenceSha256)).size, `${id}: one file per distinct licence text`);
      eq(set.files.size, pin.files + pin.licences.length + 1, `${id}: the font files, the licence texts and the stylesheet`);
      eq(set.bytes, [...set.files.values()].reduce((n, b) => n + b.length, 0), `${id}: bytes`);
    }
    const broken = clone(design.fontPins.sets["sans-pretendard"]!);
    broken.families[0]!.licenceFile = "README.md";
    await refusal(() => buildFontSet(repoRoot, "sans-pretendard", broken), "design_fonts_invalid", "a licence file that is not the licence");
    broken.families[0]!.licenceFile = "../../package.json";
    await refusal(() => buildFontSet(repoRoot, "sans-pretendard", broken), "design_fonts_invalid", "a licence file outside the package");
    assert(design.fontPins.sets["sans-pretendard"]!.bytes < design.fontPins.sets["serif-noto"]!.bytes, "the serif set (two families) is the larger one");
    eq([design.fontPins.sets["sans-pretendard"]!.licences.length, design.fontPins.sets["serif-noto"]!.licences.length], [1, 2], "licence texts per set (the serif set has two families under two copyright lines)");
  });
  await check("F3 the placement step of the site builder: nothing for a release without font pins, for a site without a design document and for `system`; the set's files — the licence texts among them — under public/_fonts/<set>/ for a site that names one, and the licence paths it reports for package QA; a release whose pin this checkout cannot reproduce, that pins no licence text or another licence text is refused (design_fonts_invalid)", async () => {
    const project = async (name: string, pins: unknown) => {
      const dir = path.join(tmp, name);
      await mkdir(path.join(dir, "design"), { recursive: true });
      if (pins !== undefined) await writeFile(path.join(dir, "design/fonts.json"), JSON.stringify(pins));
      return dir;
    };
    const settings = (fontSet: string) => ({ "site.design": { config: { fontSet } } });
    eq(await placeDesignFonts({ repoRoot, projectDir: await project("p-none", undefined), settings: settings("serif-noto") }), undefined, "no design/fonts.json");
    eq(await placeDesignFonts({ repoRoot, projectDir: await project("p-classic", design.fontPins), settings: { "site.design": { config: null } } }), undefined, "no design document");
    eq(await placeDesignFonts({ repoRoot, projectDir: await project("p-system", design.fontPins), settings: settings("system") }), undefined, "system");
    const dir = await project("p-sans", design.fontPins);
    const placed = await placeDesignFonts({ repoRoot, projectDir: dir, settings: settings("sans-pretendard") });
    const pin = design.fontPins.sets["sans-pretendard"]!;
    eq(placed, { fontSet: "sans-pretendard", dir: "_fonts/sans-pretendard", stylesheet: `_fonts/sans-pretendard/${pin.css.file}`, licences: pin.licences.map((l) => ({ path: `_fonts/sans-pretendard/${l.file}`, sha256: l.sha256 })), files: pin.files, bytes: pin.bytes }, "placed");
    for (const l of pin.licences) assert(/SIL OPEN FONT LICENSE Version 1\.1/.test(await readFile(path.join(dir, "public/_fonts/sans-pretendard", l.file), "utf8")), `${l.file} in public/ is not the licence text`);
    const names = await readdir(path.join(dir, "public/_fonts/sans-pretendard"));
    eq(names.sort(), [...built.get("sans-pretendard")!.files.keys()].sort(), "the files in public/");
    eq(await readdir(path.join(dir, "public/_fonts")), ["sans-pretendard"], "only the site's own set");
    const tampered = clone(design.fontPins);
    tampered.sets["sans-pretendard"]!.css.sha256 = "0".repeat(64);
    await refusal(async () => placeDesignFonts({ repoRoot, projectDir: await project("p-tampered", tampered), settings: settings("sans-pretendard") }), "design_fonts_invalid", "a pin this checkout does not reproduce");
    const bumped = clone(design.fontPins);
    bumped.sets["sans-pretendard"]!.families[0]!.version = "9.9.9";
    await refusal(async () => placeDesignFonts({ repoRoot, projectDir: await project("p-bumped", bumped), settings: settings("sans-pretendard") }), "design_fonts_invalid", "another package version");
    await refusal(async () => placeDesignFonts({ repoRoot, projectDir: await project("p-unknown", design.fontPins), settings: settings("serif-garamond") }), "design_fonts_invalid", "a set the release does not declare");
    const unlicensed = clone(design.fontPins) as unknown as { sets: Record<string, Record<string, unknown>> };
    delete unlicensed.sets["sans-pretendard"]!.licences;
    const noLicence = await project("p-unlicensed", unlicensed);
    assert(/pins no licence text/.test((await refusal(() => placeDesignFonts({ repoRoot, projectDir: noLicence, settings: settings("sans-pretendard") }), "design_fonts_invalid", "a pin without licence texts")).message), "the refusal does not say why");
    assert(!(await readdir(path.join(noLicence, "public")).catch(() => [] as string[])).includes("_fonts"), "a refused set was placed");
    const otherLicence = clone(design.fontPins);
    otherLicence.sets["sans-pretendard"]!.licences[0]!.sha256 = "0".repeat(64);
    await refusal(async () => placeDesignFonts({ repoRoot, projectDir: await project("p-other-licence", otherLicence), settings: settings("sans-pretendard") }), "design_fonts_invalid", "a pinned licence text this checkout does not ship");
    await refusal(async () => placeDesignFonts({ repoRoot, projectDir: dir, settings: settings("sans-pretendard") }), "design_fonts_invalid", "public/_fonts already there");
  });
  await check("F4 no binary file in the Template directory: no font file under templates/interior-02 — the Template holds the pins (design/fonts.json) and the family lists only", async () => {
    const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).filter((e) => !["node_modules", ".next", "out"].includes(e.name)).map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])))).flat();
    const files = await walk(path.join(repoRoot, "templates", TEMPLATE_ID));
    eq(files.filter((f) => /\.(woff2?|ttf|otf|eot)$/i.test(f)), [], "font files in the template");
    assert(files.some((f) => f.endsWith("design/fonts.json")), "design/fonts.json is missing");
  });

  await check("F5 package QA: the pinned licence texts are the ONLY files its absolute-URL scan does not read — unlisted, the same file fails on the addresses the OFL names; listed with other bytes, at another path or missing, it fails; any other .txt beside it is scanned as before; the forbidden-terms scan still reads a licence text", async () => {
    const { createHash } = await import("node:crypto");
    const set = built.get("serif-noto")!;
    const origin = "https://qa-fixture.boostweb.co.kr";
    const make = async (name: string, extra: Record<string, string | Buffer> = {}, drop: string[] = []) => {
      const out = path.join(tmp, name);
      const files: Record<string, string | Buffer> = { "index.html": "<!DOCTYPE html><html lang=\"ko\"><head><title>t</title></head><body><main></main></body></html>", ...extra };
      for (const l of set.licences) if (!drop.includes(l.file)) files[`_fonts/serif-noto/${l.file}`] ??= set.files.get(l.file)!;
      for (const [rel, body] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(out, rel)), { recursive: true });
        await writeFile(path.join(out, rel), body);
      }
      return out;
    };
    const listed = set.licences.map((l) => ({ path: `_fonts/serif-noto/${l.file}`, sha256: l.sha256 }));
    const qa = (outDir: string, licenceFiles: { path: string; sha256: string }[] | undefined, forbiddenTerms: string[] = []) => qaStaticPackage({ outDir, routes: [{ path: "/" }], exclusiveRoutes: true, forbiddenTerms, publicOrigin: origin, licenceFiles });
    const whys = (r: Awaited<ReturnType<typeof qa>>) => r.failures.map((f) => `${f.file}: ${f.why}`);

    const ok = await qa(await make("qa-ok"), listed);
    eq([ok.pass, whys(ok)], [true, []], "the pinned licence texts, listed");
    const unlisted = await qa(await make("qa-unlisted"), undefined);
    eq(unlisted.pass, false, "not listed: scanned like any text file");
    eq(unlisted.failures.map((f) => f.file).filter((f, i, a) => a.indexOf(f) === i).sort(), listed.map((l) => l.path).sort(), "the files that fail");
    assert(unlisted.failures.every((f) => /^absolute URL https?:\/\/(scripts\.sil\.org\/OFL|github\.com\/orioncactus\/pretendard)/.test(f.why)), `unexpected findings: ${whys(unlisted).join(" | ")}`);
    const onlyOne = await qa(await make("qa-one"), listed.slice(0, 1));
    eq([...new Set(onlyOne.failures.map((f) => f.file))], [listed[1]!.path], "listing one text exempts that one only");

    const tamperedText = Buffer.concat([set.files.get(set.licences[0]!.file)!, Buffer.from("\nSee https://tracker.example/pixel for details.\n")]);
    const tampered = await qa(await make("qa-tampered", { [listed[0]!.path]: tamperedText }), listed);
    assert(tampered.failures.some((f) => f.file === listed[0]!.path && /does not hold the pinned bytes/.test(f.why)) && tampered.failures.some((f) => f.file === listed[0]!.path && /absolute URL https:\/\/tracker\.example\/pixel/.test(f.why)), `other bytes under a pinned name: ${whys(tampered).join(" | ")}`);

    const stray = "notes.txt";
    const elsewhere = await qa(await make("qa-elsewhere", { [`_fonts/serif-noto/${stray}`]: set.files.get(set.licences[0]!.file)!, "licence.txt": set.files.get(set.licences[0]!.file)! }), [...listed, { path: `_fonts/serif-noto/${stray}`, sha256: set.licences[0]!.sha256 }, { path: "licence.txt", sha256: set.licences[0]!.sha256 }]);
    for (const file of [`_fonts/serif-noto/${stray}`, "licence.txt"]) {
      assert(elsewhere.failures.some((f) => f.file === file && /must be _fonts\/<set>\/<first 20 hex/.test(f.why)) && elsewhere.failures.some((f) => f.file === file && /^absolute URL/.test(f.why)), `${file}: a licence text under another name was exempted — ${whys(elsewhere).join(" | ")}`);
    }
    eq(elsewhere.failures.filter((f) => listed.some((l) => l.path === f.file)), [], "the correctly named ones still pass");

    const wrongName = `_fonts/serif-noto/${"0".repeat(20)}.txt`;
    const misnamed = await qa(await make("qa-misnamed", { [wrongName]: set.files.get(set.licences[0]!.file)! }), [...listed, { path: wrongName, sha256: set.licences[0]!.sha256 }]);
    assert(misnamed.failures.some((f) => f.file === wrongName && /must be _fonts/.test(f.why)) && misnamed.failures.some((f) => f.file === wrongName && /^absolute URL/.test(f.why)), `a hex name that is not the head of the pinned hash: ${whys(misnamed).join(" | ")}`);

    const missing = await qa(await make("qa-missing", {}, [set.licences[1]!.file]), listed);
    eq(whys(missing), [`${listed[1]!.path}: pinned font licence text is not in the package`], "a listed text that is not in the package");

    const neighbour = await qa(await make("qa-neighbour", { "_fonts/serif-noto/readme.txt": "fonts from https://fonts.example/kit" }), listed);
    eq(whys(neighbour), ["_fonts/serif-noto/readme.txt: absolute URL https://fonts.example/kit (not own origin / framework-internal)"], "another .txt in the font directory");

    const term = await qa(await make("qa-term"), listed, ["SIL OPEN FONT"]);
    assert(term.failures.length > 0 && term.failures.every((f) => listed.some((l) => l.path === f.file) && /forbidden/i.test(f.why)), `the forbidden-terms scan on a licence text: ${whys(term).join(" | ")}`);
    eq(createHash("sha256").update(set.files.get(set.licences[0]!.file)!).digest("hex"), set.licences[0]!.sha256, "the fixture is the pinned text");
  });
  await check("F6 publishing: a licence text has a content type (text/plain — never refused as an unknown extension) and, being named by its own hash, the immutable cache policy of every other font file", async () => {
    const { contentTypeFor, cachePolicyFor } = await import("../publish/media");
    for (const [setId, set] of built) {
      for (const l of set.licences) {
        const rel = `_fonts/${setId}/${l.file}`;
        eq(contentTypeFor(rel), "text/plain; charset=utf-8", `${rel}: content type`);
        eq(cachePolicyFor(rel, l.sha256).reason, "content-addressed", `${rel}: cache policy`);
        eq(cachePolicyFor(rel, "0".repeat(64)).reason, "revalidate", `${rel}: not immutable when the bytes are not the name's`);
      }
    }
  });

  // ══ catalog ═══════════════════════════════════════════════════════════════════════════════════
  console.log("\n[catalog] presets.json for BoostChat");
  await check("X1 site-design-presets@1: exactly the contract's keys; presets in id order; each preset's sections are its composition in reading order (header · home recipe · listing · detail · footer · mobile bar); fonts are the families of its font set with their licence; thumbnails null until they exist", async () => {
    const catalog = await buildDesignCatalog({ repoRoot, templateId: TEMPLATE_ID });
    eq([Object.keys(catalog), catalog.schema, catalog.templateId], [["schema", "templateId", "presets"], DESIGN_PRESETS_SCHEMA, TEMPLATE_ID], "document");
    eq(DESIGN_PRESETS_SCHEMA, "site-design-presets@1", "schema id");
    eq(catalog.presets.map((p) => p.id), PRESET_IDS, "presets");
    for (const entry of catalog.presets) {
      const preset = presetOf(entry.id);
      eq(Object.keys(entry), ["id", "version", "name", "summary", "bestFor", "minRelease", "fontSet", "fonts", "sections", "thumbnails"], `${entry.id}: keys`);
      eq([entry.version, entry.name, entry.summary, entry.bestFor, entry.minRelease, entry.fontSet], [preset.version, preset.name, preset.summary, preset.bestFor, preset.minRelease, preset.design.fontSet], `${entry.id}: fields`);
      eq(entry.sections, [{ section: "header", variant: preset.design.chrome.header }, ...preset.design.home, { section: "listing", variant: preset.design.pages.listing }, { section: "detail", variant: preset.design.pages.detail }, { section: "footer", variant: preset.design.chrome.footer }, { section: "mobileBar", variant: preset.design.chrome.mobileBar }], `${entry.id}: sections`);
      for (const s of entry.sections) assert(Object.hasOwn(registry.sections[s.section]!.variants, s.variant), `${entry.id}: ${s.section}.${s.variant} is not registered`);
      eq(entry.fonts, design.fontPins.sets[entry.fontSet]!.families.map((f) => ({ family: f.family, licence: f.licence })), `${entry.id}: fonts`);
      eq(entry.thumbnails, { desktop: null, mobile: null }, `${entry.id}: thumbnails`);
    }
    const withThumbs = await buildDesignCatalog({ repoRoot, templateId: TEMPLATE_ID, thumbnails: true });
    // PLAIN FILE NAMES — the consumer's contract: BoostChat refuses the whole catalog if one name carries a directory
    eq(withThumbs.presets[1]!.thumbnails, { desktop: "luxury-gallery-1-desktop.jpg", mobile: "luxury-gallery-1-mobile.jpg" }, "thumbnail names");
    for (const entry of withThumbs.presets) {
      const preset = presetOf(entry.id);
      eq(entry.thumbnails, { desktop: `${preset.id}-${preset.version}-desktop.jpg`, mobile: `${preset.id}-${preset.version}-mobile.jpg` }, `${entry.id}: thumbnail names`);
      for (const shot of ["desktop", "mobile"] as const) {
        const name = entry.thumbnails[shot]!;
        eq(name, thumbnailFileName(preset.id, preset.version, shot), `${entry.id} ${shot}: thumbnailFileName`);
        assert(THUMBNAIL_NAME_RE.test(name) && name.endsWith(`-${shot}.jpg`) && name.length <= 128, `${entry.id} ${shot}: "${name}" is not a name the reader accepts`);
        assert(!/[\/\\]/.test(name) && !name.includes(".."), `${entry.id} ${shot}: "${name}" carries a path`);
      }
    }
    eq(THUMBNAILS_DIR, "thumbs", "the directory the files are vendored in (and pinned under)");
    assert(!serializeDesignCatalog(withThumbs).includes("thumbs/"), "the serialized catalog names a directory");
  });
  await check("X2 deterministic, no timestamp, no absolute path; the CLI prints exactly the serialized catalog; a template without a design system is refused", async () => {
    const a = serializeDesignCatalog(await buildDesignCatalog({ repoRoot, templateId: TEMPLATE_ID }));
    const b = serializeDesignCatalog(await buildDesignCatalog({ repoRoot, templateId: TEMPLATE_ID }));
    eq(a, b, "two runs");
    assert(!a.includes(repoRoot) && !/20\d\d-\d\d-\d\dT/.test(a) && a.endsWith("}\n"), "the document holds a path or a timestamp");
    const r = cli("design-catalog", TEMPLATE_ID);
    assert(r.status === 0, `design-catalog exit ${r.status}: ${r.stderr}`);
    eq(r.stdout, a, "CLI stdout");
    // the form that is vendored: `--thumbnails` — exactly the serialized catalog with the names, and no directory in any of them
    const vendored = cli("design-catalog", TEMPLATE_ID, "--thumbnails");
    assert(vendored.status === 0, `design-catalog --thumbnails exit ${vendored.status}: ${vendored.stderr}`);
    eq(vendored.stdout, serializeDesignCatalog(await buildDesignCatalog({ repoRoot, templateId: TEMPLATE_ID, thumbnails: true })), "CLI stdout with --thumbnails");
    assert(!vendored.stdout.includes("thumbs/") && /"desktop": "[a-z0-9-]+-\d+-desktop\.jpg"/.test(vendored.stdout), "the vendored catalog names a directory, or no thumbnail");
    await refusal(() => buildDesignCatalog({ repoRoot, templateId: "interior-03" }), "design_unavailable", "interior-03");
  });
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  console.log(failed.map((name) => `  - ${name}`).join("\n"));
  process.exit(1);
}
