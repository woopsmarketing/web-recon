/**
 * Site rebuild (brand · indexing · image references · brand-support export) — `tsx --tsconfig platform/tsconfig.json platform/test/rebuild.test.ts`
 *
 * Offline: no network, no wrangler, no Cloudflare, no BoostChat. TWO real site builds (through the CLI, each in a throwaway
 * repository root that links this checkout's release store, starters and node_modules: the classic fixture on a stored release,
 * a preset site on the dev release); every other check plans files
 * (pure) or refuses before anything is written. Brand images are tiny PNGs generated here — no customer or stock photo.
 *
 *   A  spec        accepted · strict · every value rule has its code · unsupported fields named · assets verified · inherited provisioning checks
 *   B  equivalence a rebuild spec with brand null / design null / noindex plans EXACTLY the files of the provisioning scaffold (both releases)
 *   C  mapping     each supported brand field changes exactly the expected files (and slots), and the release's own schemas accept the result
 *   D  contrast    derived on-colours, refusals with the measured ratio, the warm surface is the starter's own palette
 *   E  build       ONE real build of a fully branded spec with indexing "index"; the package, the composed home page
 *   F  CLI         usage and refusals leave nothing behind
 *   G  support     site-brand-support@1 is generated from brand.ts: lists, surfaces, thresholds, limits — and a configuration it lets through is never refused
 *   H  design      presets in the rebuild path, on a DEV RELEASE cut from the working tree as 1.2.0 into a temporary root (never into
 *                  data/template-releases): the null-design invariant, preset only / + brand colours / + surface / + typography, the
 *                  contrast of what ends up together judged before any image is read, unknown preset, version mismatch, minRelease,
 *                  brand support derived from the release's contents — and ONE real build of a preset site (the package check, the
 *                  licence text of the font set, <main id>)
 *
 * The spec is the contract's (CONTRACTS §9.3): the RESOLVED brand name / phone / e-mail are top-level, the BrandBlock does not repeat them.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { RENDERER_FILE, buildRuntimeKit } from "../portfolio-runtime/kit";
import { RUNTIME_FILE, SHELL_FILE } from "../portfolio-runtime/contract";
import type { PortfolioSiteInput, PortfolioSiteResult } from "../portfolio-runtime/entry";
import { makeDesignRoot, type DesignRoot } from "../design/dev/fixture-root";
import { contrastRuleFor } from "../design/apply";
import { loadPreset, type SitePreset } from "../design/preset";
import { templateDesign } from "../design/templates";
import { BRAND_FIELD_PATHS, BRAND_LIMITS, DEFAULT_ACCENT, DEFAULT_PRIMARY, DESIGN_SYSTEM_FILES, SURFACE_PRESETS, TYPOGRAPHY_UNSUPPORTED_VALUE, applyBrand, appearanceTokens, brandFieldsSet, brandSupport, brandSupportDocument, carriesDesignSystem, contrastRatio, hexToRgb, judgeAppearance, onColour, resolveAppearance, siteAssetOf } from "../provision/brand";
import { NOT_FOUND_PAGES, detectImage, planRebuildBase, planRebuildScaffold, resolveDesignSeam, verifyRebuiltPackage } from "../provision/rebuild";
import { REBUILD_ERROR_CODES, validateRebuildSpec, type AssetRef, type RebuildSpec } from "../provision/rebuild-spec";
import { planScaffold } from "../provision/scaffold";
import { ProvisionError } from "../provision/spec";
import { loadRelease } from "../release/release";
import { resolveEffectiveSettings } from "../settings/settings";
import { resolveSlots } from "../slots/slots";
import { resolveEffectiveTheme } from "../theme/theme";
import { publicAssetPath } from "../assets/assets";
import { STARTERS_DIR } from "../provision/starter";
import template from "../../templates/interior-02/v1/template";

const repoRoot = process.cwd();
const FIXTURE_DIR = "platform/provision/fixtures/rebuild";
const R110 = "interior-02-1.1.0-be2c1e2d3850";
const R112 = "interior-02-1.1.2-0b35f76a156d";
/** the first release that carries the design system (the three the starter lists: R110, R112, R120) */
const R120 = "interior-02-1.2.0-da9e2c3b9d2b";

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${String((error as Error)?.stack ?? error).split("\n").slice(0, 6).join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${msg}: ${x} ≠ ${y}`);
}
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));

/** the code a promise is refused with */
async function codeOf(p: Promise<unknown> | (() => unknown)): Promise<{ code: string; message: string }> {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    if (e instanceof ProvisionError) return { code: e.code, message: e.message };
    throw new Error(`not a typed refusal: ${(e as Error).name}: ${(e as Error).message}`);
  }
  return { code: "(accepted)", message: "" };
}

// ---------------------------------------------------------------- generated images --
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const pngChunk = (type: string, data: Buffer) => {
  const t = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
/** a solid-colour RGB PNG: the smallest honest image there is */
function png(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set([r, g, b], 1 + x * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), pngChunk("IEND", Buffer.alloc(0))]);
}

// --------------------------------------------------------------------- fixtures --
const fixture = (await readJson(path.join(repoRoot, FIXTURE_DIR, "rebuild-spec.json"))) as RebuildSpec;
const fixtureBytes = new Map<string, Buffer>();
for (const ref of fixture.assets) fixtureBytes.set(ref.id, await readFile(path.join(repoRoot, FIXTURE_DIR, "assets", `${ref.id}.png`)));
const LOGO = fixture.assets.find((a) => a.id === "fixture-logo")!;
const HERO = fixture.assets.find((a) => a.id === "fixture-hero")!;
const ABOUT = fixture.assets.find((a) => a.id === "fixture-about")!;

/** the fixture, edited; `assets` follows the brand block unless the edit says otherwise */
const mk = (edit: (s: any) => void = () => {}): any => {
  const s = clone(fixture) as any;
  edit(s);
  return s;
};
/** a rebuild spec that changes NOTHING: no brand, noindex, the provisioning phone, an e-mail */
const plain = (edit: (s: any) => void = () => {}) =>
  mk((s) => {
    s.brand = null;
    s.assets = [];
    s.indexing = "noindex";
    s.contact = { phone: "02-000-0000", email: "base@customer.example" };
    edit(s);
  });
/** plain + a brand block (+ the fixture assets it names) */
const branded = (brand: any, edit: (s: any) => void = () => {}) =>
  plain((s) => {
    s.brand = brand;
    const used = [brand?.identity?.logo, brand?.hero?.image, brand?.identity?.introduction?.image].filter(Boolean);
    s.assets = fixture.assets.filter((a) => used.includes(a.id));
    edit(s);
  });
const plan = (spec: unknown, bytes: ReadonlyMap<string, Buffer> = fixtureBytes, root = repoRoot) => planRebuildScaffold({ repoRoot: root, spec, assetBytes: bytes });
const filesOf = async (spec: unknown) => (await plan(spec)).files;

/** site-relative paths whose bytes differ (or exist on one side only) */
function diff(a: Map<string, Buffer>, b: Map<string, Buffer>): string[] {
  const out: string[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) if (!a.get(k)?.equals(b.get(k) ?? Buffer.alloc(0)) || a.has(k) !== b.has(k)) out.push(k);
  return out.sort();
}
const doc = (files: Map<string, Buffer>, rel: string) => JSON.parse(files.get(rel)!.toString("utf8"));
/** "section.key" of every slot whose value differs */
function slotDiff(a: Map<string, Buffer>, b: Map<string, Buffer>): string[] {
  const [x, y] = [doc(a, "slots.json").values, doc(b, "slots.json").values];
  const out: string[] = [];
  for (const s of new Set([...Object.keys(x), ...Object.keys(y)])) for (const k of new Set([...Object.keys(x[s] ?? {}), ...Object.keys(y[s] ?? {})])) if (JSON.stringify(x[s]?.[k]) !== JSON.stringify(y[s]?.[k])) out.push(`${s}.${k}`);
  return out.sort();
}

/** the release's own schemas (its manifest, imported from the stored release) accept the planned documents: slot lengths, theme tokens, settings */
const templates = new Map<string, any>();
async function acceptedByRelease(files: Map<string, Buffer>, releaseId: string, root = repoRoot) {
  if (!templates.has(releaseId)) templates.set(releaseId, (await import(pathToFileURL(path.join(root, `data/template-releases/interior-02/${releaseId}/files/templates/interior-02/v1/template.ts`)).href)).default);
  const tpl = templates.get(releaseId);
  const business = doc(files, "content/business.json").data;
  resolveSlots(tpl, doc(files, "slots.json"), { "business.summary": business.summary });
  resolveEffectiveTheme(tpl.theme.consumes, tpl.theme.defaults, files.has("theme.json") ? doc(files, "theme.json") : undefined);
  resolveEffectiveSettings(tpl, doc(files, "settings.json"));
}

const tmpRoots: string[] = [];
async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "rebuild-test-"));
  tmpRoots.push(root);
  await mkdir(path.join(root, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(root, "data/template-releases"));
  await symlink(path.join(repoRoot, STARTERS_DIR), path.join(root, STARTERS_DIR));
  await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  await copyOtherSites(root);
  return root;
}
/** the other sites of a real checkout, as far as the package check reads them (site.json + business.json) */
async function copyOtherSites(root: string) {
  for (const e of await readdir(path.join(repoRoot, "data/sites"), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    for (const rel of ["site.json", "content/business.json"]) {
      const from = path.join(repoRoot, "data/sites", e.name, rel);
      if (!(await stat(from).catch(() => undefined))) continue;
      await mkdir(path.dirname(path.join(root, "data/sites", e.name, rel)), { recursive: true });
      await cp(from, path.join(root, "data/sites", e.name, rel));
    }
  }
}

/** The version of the working tree's Template manifest. */
const TREE_VERSION: string = template.version;
const versionAtLeast = (version: string, min: string): boolean => {
  const [a, b] = [version, min].map((v) => v.split(".").map(Number)) as [number[], number[]];
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return true;
};
/**
 * The version the H group cuts the working tree as: the tree's own — so that the cut is comparable, id for id, with the
 * release the checkout holds for that version (H0) — and never below the one the design presets ask for (`minRelease` 1.2.0).
 */
const DESIGN_VERSION = versionAtLeast(TREE_VERSION, "1.2.0") ? TREE_VERSION : "1.2.0";
const CHECKOUT_STORE = path.join(repoRoot, "data/template-releases/interior-02");
/** Every directory and file under the checkout's interior-02 release store: path, size, mtime and content hash — to prove a test wrote nothing there. */
async function checkoutStoreSnapshot(): Promise<{ entries: string[]; digest: string }> {
  const entries: string[] = [];
  const walk = async (dir: string) => {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(CHECKOUT_STORE, abs);
      const info = await lstat(abs);
      if (e.isDirectory()) {
        entries.push(`d ${rel} ${info.mtimeMs}`);
        await walk(abs);
      } else entries.push(`f ${rel} ${info.size} ${info.mtimeMs} ${e.isFile() ? sha256(await readFile(abs)) : "(not a file)"}`);
    }
  };
  await walk(CHECKOUT_STORE);
  return { entries, digest: sha256(entries.join("\n")) };
}
/** The releases the checkout's store holds, by directory name, with the version each record states. */
async function checkoutReleases(): Promise<{ releaseId: string; releaseHash: string; templateVersion: string }[]> {
  const out: { releaseId: string; releaseHash: string; templateVersion: string }[] = [];
  for (const e of (await readdir(CHECKOUT_STORE, { withFileTypes: true })).filter((d) => d.isDirectory()).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const record = await readJson(path.join(CHECKOUT_STORE, e.name, "release.json"));
    out.push({ releaseId: record.releaseId, releaseHash: record.releaseHash, templateVersion: record.templateVersion });
  }
  return out;
}
const DARK_PRESET = "night-test";
const FUTURE_PRESET = "future-test";
/**
 * A throwaway repository root whose release store holds, beside the stored releases (links), a DEV RELEASE cut from the working
 * tree AS 1.2.0 (platform/design/dev/fixture-root.ts — every release gate runs; the checkout's data/template-releases is not
 * written), whose starter lists it, and whose data/site-presets is a COPY of the checkout's plus two test presets:
 *   night-test    luxury-gallery with a dark palette (a surface the brand block did not choose)
 *   future-test   luxury-gallery asking for a template version nobody has cut (minRelease 9.0.0)
 */
async function makeDesignReleaseRoot(): Promise<DesignRoot & { presets: Record<string, SitePreset> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "rebuild-design-"));
  tmpRoots.push(root);
  const designRoot = await makeDesignRoot({ repoRoot, root, templateId: "interior-02", templateVersion: DESIGN_VERSION });
  await cp(path.join(repoRoot, "data/site-presets"), path.join(root, "data/site-presets"), { recursive: true });
  await copyOtherSites(root);
  const luxury = await loadPreset({ repoRoot, templateId: "interior-02", presetId: "luxury-gallery" });
  const dark = clone(luxury);
  dark.id = DARK_PRESET;
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
  const future = clone(luxury);
  future.id = FUTURE_PRESET;
  future.minRelease = "9.0.0";
  for (const preset of [dark, future]) {
    await mkdir(path.join(root, "data/site-presets/interior-02", preset.id), { recursive: true });
    await writeFile(path.join(root, "data/site-presets/interior-02", preset.id, "preset.json"), `${JSON.stringify(preset, null, 2)}\n`);
  }
  return { ...designRoot, presets: { luxury, dark, future } };
}

const results: Record<string, unknown> = {};
try {
  // ══ A. spec ═══════════════════════════════════════════════════════════════════════════════════
  console.log("A. spec");
  await check("A1 the committed fixture (a full brand block, indexing index, three generated PNGs) is accepted; the brand name / phone / e-mail the site renders with are the spec's top-level RESOLVED values, the BrandBlock carries none of them", async () => {
    const v = await validateRebuildSpec({ repoRoot, raw: fixture });
    eq([v.effective.identity.brandName, v.effective.contact.phone, v.effective.contact.email], ["모아 인테리어", "031-123-4567", "hello@moa-interior.example"], "effective values");
    eq(v.support.unsupported.filter((f) => brandFieldsSet(fixture.brand!).includes(f)), [], "the fixture sets no unsupported field");
    eq(Object.keys(fixture).sort(), ["assetKeyPrefix", "assets", "boostchat", "brand", "contact", "design", "designRevision", "hostname", "identity", "indexing", "publicOrigin", "rebuildId", "schema", "siteId", "snapshotSha256", "sourceRef", "template"], "the spec's keys are exactly CONTRACTS §9.3");
    await plan(fixture);
  });
  await check("A2 strict: an unknown key anywhere (document, brand, nested brand, asset, boostchat) is refused, never ignored; so is a missing key and a wrong literal", async () => {
    const edits: [string, (s: any) => void][] = [
      ["root", (s) => (s.extra = 1)],
      ["brand", (s) => (s.brand.extra = 1)],
      ["brand.identity", (s) => (s.brand.identity.slogan = "x")],
      ["brand.identity.brandName (the resolved name is top-level)", (s) => (s.brand.identity.brandName = "x")],
      ["brand.contact.phone (the resolved phone is top-level)", (s) => (s.brand.contact.phone = "031-000-0000")],
      ["brand.contact.email (the resolved e-mail is top-level)", (s) => (s.brand.contact.email = "a@b.example")],
      ["brand.identity.introduction", (s) => (s.brand.identity.introduction.subtitle = "x")],
      ["missing assetKeyPrefix", (s) => delete s.assetKeyPrefix],
      ["missing top-level contact", (s) => delete s.contact],
      ["brand.hero.cta", (s) => (s.brand.hero.cta.url = "/x")],
      ["brand.appearance", (s) => (s.brand.appearance.css = "x")],
      ["asset", (s) => (s.assets[0].alt = "x")],
      ["boostchat", (s) => (s.boostchat.extra = "x")],
      ["missing indexing", (s) => delete s.indexing],
      ["indexing value", (s) => (s.indexing = "maybe")],
      ["schema literal", (s) => (s.schema = "site-rebuild-spec@2")],
      ["tenantId (the snapshot's, not the spec's)", (s) => (s.tenantId = "00000000-0000-4000-8000-000000000000")],
      ["capturedAt", (s) => (s.capturedAt = "2026-10-12T00:00:00.000Z")],
      ["base", (s) => (s.base = { packageHash: "a".repeat(64) })],
    ];
    for (const [label, edit] of edits) eq((await codeOf(validateRebuildSpec({ repoRoot, raw: mk(edit) }))).code, "rebuild_spec_invalid", label);
  });
  await check("A3 identifiers: rebuildId, sourceRef, snapshotSha256 have their own codes; `design` is only a shape here ({presetId, presetVersion} | null); designRevision is null or a non-negative integer", async () => {
    const cases: [(s: any) => void, string][] = [
      [(s) => (s.rebuildId = "not-a-uuid"), "rebuild_id_invalid"],
      [(s) => (s.sourceRef = "main"), "source_ref_invalid"],
      [(s) => (s.sourceRef = "A".repeat(40)), "source_ref_invalid"],
      [(s) => (s.snapshotSha256 = "abc"), "snapshot_hash_invalid"],
      [(s) => (s.designRevision = -1), "rebuild_spec_invalid"],
    ];
    for (const [edit, code] of cases) eq((await codeOf(validateRebuildSpec({ repoRoot, raw: mk(edit) }))).code, code, code);
    eq((await codeOf(validateRebuildSpec({ repoRoot, raw: mk((s) => (s.designRevision = null)) }))).code, "(accepted)", "designRevision null");
    eq((await codeOf(validateRebuildSpec({ repoRoot, raw: mk((s) => (s.design = { presetId: "calm", presetVersion: 1 })) }))).code, "(accepted)", "the spec SHAPE accepts a design; the seam (A3b) is what resolves or refuses it");
    for (const design of [{ presetId: "calm" }, { presetId: "calm", presetVersion: 1.5 }, { presetId: "calm", presetVersion: "1" }, { presetId: "calm", presetVersion: 1, css: "x" }, "calm"]) {
      eq((await codeOf(validateRebuildSpec({ repoRoot, raw: mk((s) => (s.design = design)) }))).code, "rebuild_spec_invalid", `design ${JSON.stringify(design)}`);
    }
  });
  await check("A3b the design seam only RESOLVES: null → null (and the plan carries `preset: null`); a preset on a release that cannot read a design document is refused by the PLAN with design_release_too_old — before any image is read and before anything is written; an unknown preset, another version and an id that is not an id have their own stable codes; rebuild-spec.ts refuses none of it itself", async () => {
    const r112 = await loadRelease(repoRoot, "interior-02", R112);
    eq(await resolveDesignSeam({ repoRoot, design: null, templateId: "interior-02", release: r112 }), null, "design null");
    const base = await planRebuildBase({ repoRoot, spec: plain() });
    eq(base.preset, null, "planRebuildBase: no preset");
    eq((await plan(plain())).preset, null, "planRebuildScaffold: no preset");
    for (const releaseId of [R110, R112]) {
      const release = await loadRelease(repoRoot, "interior-02", releaseId);
      const withDesign = mk((s) => ((s.design = { presetId: "luxury-gallery", presetVersion: 1 }), (s.template = { templateId: "interior-02", releaseId, releaseHash: release.releaseHash })));
      const r = await codeOf(planRebuildBase({ repoRoot, spec: withDesign }));
      assert(r.code === "design_release_too_old" && r.message.includes(releaseId) && r.message.includes(release.templateVersion) && r.message.includes("1.2.0"), `${releaseId}: ${r.code} ${r.message}`);
      // the fixture names three images: no bytes are given, and the refusal is still the design's (it comes first)
      eq((await codeOf(plan(withDesign, new Map()))).code, "design_release_too_old", `${releaseId}: planRebuildScaffold without image bytes`);
    }
    const seam = (design: { presetId: string; presetVersion: number }) => codeOf(resolveDesignSeam({ repoRoot, design, templateId: "interior-02", release: r112 }));
    eq((await seam({ presetId: "calm", presetVersion: 1 })).code, "design_unavailable", "a preset this checkout does not hold");
    const other = await seam({ presetId: "luxury-gallery", presetVersion: 2 });
    assert(other.code === "design_version_mismatch" && other.message.includes("version 1") && other.message.includes("version 2"), `${other.code} ${other.message}`);
    eq((await seam({ presetId: "luxury-gallery", presetVersion: 0 })).code, "design_version_mismatch", "version 0");
    eq((await seam({ presetId: "../luxury-gallery", presetVersion: 1 })).code, "design_invalid", "a path as a preset id");
    eq((await codeOf(resolveDesignSeam({ repoRoot, design: { presetId: "luxury-gallery", presetVersion: 1 }, templateId: "interior-01", release: r112 }))).code, "design_unavailable", "a template without a design system");
    // version high enough, but the release holds no design system: still refused, and it says why
    const noDesign = await codeOf(resolveDesignSeam({ repoRoot, design: { presetId: "luxury-gallery", presetVersion: 1 }, templateId: "interior-02", release: { ...r112, templateVersion: "1.2.0" } }));
    assert(noDesign.code === "design_release_too_old" && noDesign.message.includes("does not carry the design system"), `${noDesign.code} ${noDesign.message}`);
    for (const code of ["design_unavailable", "design_version_mismatch", "design_release_too_old", "design_invalid", "design_unsupported", "contrast_too_low"]) assert((REBUILD_ERROR_CODES as readonly string[]).includes(code), `${code} is not in the closed code list`);
    assert(!/refuse\("design_/.test(await readFile(path.join(repoRoot, "platform/provision/rebuild-spec.ts"), "utf8")), "rebuild-spec.ts refuses a design itself");
    assert(!(await stat(path.join(repoRoot, "data/sites/rebuild-fixture")).catch(() => undefined)), "a refused design wrote a site");
  });
  await check("A4 value rules: a bad colour, a bad URL, `<` / `>`, control and bidi characters, an empty or too long text, bad e-mail / phone / focal, too many paragraphs — each brand_invalid, naming the field", async () => {
    const cases: [string, (b: any) => void][] = [
      ["appearance.primaryColor", (b) => (b.appearance.primaryColor = "red")],
      ["appearance.primaryColor", (b) => (b.appearance.primaryColor = "#12345")],
      ["appearance.accentColor", (b) => (b.appearance.accentColor = "#GGGGGG")],
      ["appearance.accentColor", (b) => (b.appearance.accentColor = "rgb(1,2,3)")],
      ["contact.consultationUrl", (b) => (b.contact.consultationUrl = "http://moa.example/consult")],
      ["contact.consultationUrl", (b) => (b.contact.consultationUrl = "javascript:alert(1)")],
      ["contact.consultationUrl", (b) => (b.contact.consultationUrl = "https://user:pw@moa.example/")],
      ["contact.consultationUrl", (b) => (b.contact.consultationUrl = `https://moa.example/${"a".repeat(300)}`)],
      ["identity.tagline", (b) => (b.identity.tagline = "<b>편한 집</b>")],
      ["hero.heading", (b) => (b.hero.heading = "한 줄\n두 줄")],
      ["contact.address", (b) => (b.contact.address = "경기도‮수원")],
      ["identity.introduction.body[1]", (b) => (b.identity.introduction.body[1] = "<script>x</script>")],
      ["identity.introduction.body[0]", (b) => (b.identity.introduction.body[0] = "가".repeat(301))],
      ["identity.introduction.title", (b) => (b.identity.introduction.title = "가".repeat(61))],
      ["identity.introduction.image", (b) => (b.identity.introduction.image = "../etc/passwd")],
      ["identity.tagline", (b) => (b.identity.tagline = "가".repeat(61))],
      ["hero.heading", (b) => (b.hero.heading = "   ")],
      ["hero.cta.label", (b) => (b.hero.cta.label = "가".repeat(17))],
      ["identity.introduction.body", (b) => (b.identity.introduction.body = ["a", "b", "c", "d", "e"])],
      ["identity.introduction.body", (b) => (b.identity.introduction.body = [])],
      ["hero.focal", (b) => (b.hero.focal = { x: 120, y: 5 })],
      ["identity.logo", (b) => (b.identity.logo = "../etc/passwd")],
    ];
    for (const [field, edit] of cases) {
      const r = await codeOf(validateRebuildSpec({ repoRoot, raw: mk((s) => edit(s.brand)) }));
      assert(r.code === "brand_invalid" && r.message.includes(field), `${field}: ${r.code} ${r.message}`);
    }
  });
  await check("A5 unsupported fields are refused with the field paths — never dropped: specialties, supportingText, focal, overlay, typography, consultationUrl, and a CTA to the portfolio; all of them are named at once; `null` is not a setting", async () => {
    const single: [string, (b: any) => void][] = [
      ["identity.specialties", (b) => (b.identity.specialties = ["전체 리모델링"])],
      ["hero.supportingText", (b) => (b.hero.supportingText = "믿고 맡기세요")],
      ["hero.focal", (b) => (b.hero.focal = { x: 40, y: 60 })],
      ["hero.overlay", (b) => (b.hero.overlay = "soft")],
      ["appearance.typography", (b) => (b.appearance.typography = "editorial-serif")],
      ["contact.consultationUrl", (b) => (b.contact.consultationUrl = "https://moa.example/consult")],
      ["hero.cta.target:portfolio", (b) => (b.hero.cta.target = "portfolio")],
    ];
    for (const [field, edit] of single) {
      const r = await codeOf(validateRebuildSpec({ repoRoot, raw: mk((s) => edit(s.brand)) }));
      assert(r.code === "brand_field_unsupported" && r.message.includes(field), `${field}: ${r.code} ${r.message}`);
    }
    // the supported half of a qualified field stays supported: a CTA to the contact form is fine (the fixture has one)
    eq((await codeOf(validateRebuildSpec({ repoRoot, raw: fixture }))).code, "(accepted)", "hero.cta → contact");
    const all = await codeOf(validateRebuildSpec({ repoRoot, raw: mk((s) => single.forEach(([, edit]) => edit(s.brand))) }));
    assert(all.code === "brand_field_unsupported" && single.every(([f]) => all.message.includes(f)), `all at once: ${all.message}`);
    // on a release without the design system the whole field is unsupported, whatever its value
    const rounded = await codeOf(validateRebuildSpec({ repoRoot, raw: mk((s) => (s.brand.appearance.typography = "soft-rounded")) }));
    assert(rounded.code === "brand_field_unsupported" && /cannot express: appearance\.typography$/.test(rounded.message), `soft-rounded on 1.1.0: ${rounded.message}`);
    const nulls = await codeOf(validateRebuildSpec({ repoRoot, raw: mk((s) => ((s.brand.contact.consultationUrl = null), (s.brand.hero.image = null), (s.brand.identity.logo = null), (s.brand.identity.introduction.image = null), (s.assets = []))) }));
    eq(nulls.code, "(accepted)", "null values of unsupported or optional fields");
  });
  await check("A6 assets, checked against their bytes: sha256, size, media type (by magic bytes), pixel size, missing bytes; and against the brand block: dangling reference, unused entry, duplicate id / key, oversized logo — and the KEYS: only <assetKeyPrefix><uuid>.(jpg|png|webp), refused as asset_key_refused before any bucket read", async () => {
    const base = fixtureBytes;
    const withBytes = (id: string, bytes: Buffer | undefined) => {
      const m = new Map(base);
      if (bytes) m.set(id, bytes);
      else m.delete(id);
      return m;
    };
    const flipped = Buffer.from(base.get("fixture-logo")!);
    flipped[flipped.length - 20] = flipped[flipped.length - 20]! ^ 0xff;
    eq((await codeOf(plan(fixture, withBytes("fixture-logo", flipped)))).code, "asset_hash_mismatch", "flipped byte");
    eq((await codeOf(plan(fixture, withBytes("fixture-logo", base.get("fixture-logo")!.subarray(0, 200))))).code, "asset_size_mismatch", "truncated");
    eq((await codeOf(plan(fixture, withBytes("fixture-hero", undefined)))).code, "asset_missing", "missing bytes");
    eq((await codeOf(plan(mk((s) => (s.assets[0].mediaType = "image/jpeg"))))).code, "asset_media_type_mismatch", "PNG declared as JPEG");
    const text = Buffer.from("not an image at all, only text that happens to match its own hash".padEnd(301, "."));
    const textSpec = mk((s) => {
      s.assets[0] = { ...s.assets[0], sha256: sha256(text), bytes: text.length };
    });
    eq((await codeOf(plan(textSpec, withBytes("fixture-logo", text)))).code, "asset_media_type_mismatch", "text declared as PNG");
    eq((await codeOf(plan(mk((s) => (s.assets[0].width = 241))))).code, "asset_dimension_mismatch", "pixel size");
    const cases: [string, (s: any) => void, string][] = [
      ["dangling logo", (s) => (s.brand.identity.logo = "nope"), "asset_ref_invalid"],
      ["unused entry", (s) => (s.brand.hero.image = null), "asset_ref_invalid"],
      ["duplicate id", (s) => s.assets.push(clone(s.assets[0])), "asset_ref_invalid"],
      ["duplicate key", (s) => (s.assets[1].key = s.assets[0].key), "asset_ref_invalid"],
      ["key outside the prefix", (s) => (s.assets[0].key = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d/brand/1f0c8a64-6d2b-4b8e-9a31-0c5e7d2f4a10.png"), "asset_key_refused"],
      ["traversal in the key", (s) => (s.assets[0].key = `${s.assetKeyPrefix}../1f0c8a64-6d2b-4b8e-9a31-0c5e7d2f4a10.png`), "asset_key_refused"],
      ["a file name that is not a uuid", (s) => (s.assets[0].key = `${s.assetKeyPrefix}logo.png`), "asset_key_refused"],
      ["a gif", (s) => (s.assets[0].key = `${s.assetKeyPrefix}1f0c8a64-6d2b-4b8e-9a31-0c5e7d2f4a10.gif`), "asset_key_refused"],
      ["a nested directory", (s) => (s.assets[0].key = `${s.assetKeyPrefix}x/1f0c8a64-6d2b-4b8e-9a31-0c5e7d2f4a10.png`), "asset_key_refused"],
      ["an upper-case uuid", (s) => (s.assets[0].key = `${s.assetKeyPrefix}1F0C8A64-6D2B-4B8E-9A31-0C5E7D2F4A10.png`), "asset_key_refused"],
      ["a key with a suffix after the extension", (s) => (s.assets[0].key = `${s.assetKeyPrefix}1f0c8a64-6d2b-4b8e-9a31-0c5e7d2f4a10.png.bak`), "asset_key_refused"],
      ["absolute key", (s) => (s.assets[0].key = "/etc/passwd"), "asset_key_refused"],
      ["the routing area", (s) => (s.assets[0].key = "routing/rebuild-fixture.boostweb.co.kr.json"), "asset_key_refused"],
      ["a prefix that is not <uuid>/brand/", (s) => (s.assetKeyPrefix = "tenant-fixture/brand/"), "asset_key_refused"],
      ["a prefix that is the bucket root", (s) => ((s.assetKeyPrefix = ""), (s.assets[0].key = "x.png")), "asset_key_refused"],
      ["a prefix with another folder", (s) => ((s.assetKeyPrefix = "7c1e4a52-3b9d-4e60-8f27-5a0d9c3b1e44/other/"), s.assets.forEach((a: any, n: number) => (a.key = `7c1e4a52-3b9d-4e60-8f27-5a0d9c3b1e44/other/1f0c8a64-6d2b-4b8e-9a31-0c5e7d2f4a1${n}.png`))), "asset_key_refused"],
      ["bad sha", (s) => (s.assets[0].sha256 = "XYZ"), "asset_ref_invalid"],
      ["size ceiling", (s) => (s.assets[1].bytes = 9 * 1024 * 1024), "asset_ref_invalid"],
      ["side ceiling", (s) => (s.assets[1].width = 8001), "asset_ref_invalid"],
      ["logo larger than 1 MiB", (s) => (s.assets[0].bytes = 1024 * 1024 + 1), "asset_ref_invalid"],
      ["unknown media type", (s) => (s.assets[0].mediaType = "image/svg+xml"), "rebuild_spec_invalid"],
    ];
    for (const [label, edit, code] of cases) eq((await codeOf(validateRebuildSpec({ repoRoot, raw: mk(edit) }))).code, code, label);
    // an extra, unreferenced file among the provided bytes is ignored (the CLI reads only the ids the spec names)
    eq((await codeOf(plan(fixture, new Map([...base, ["stray", Buffer.from("x")]])))).code, "(accepted)", "extra bytes ignored");
  });
  await check("A7 the checks a provisioning spec has are the rebuild spec's too: host suffix, an origin that is not https://<host>, a template without a starter, a release the starter does not list, a wrong release hash, a bad widget key", async () => {
    const cases: [(s: any) => void, string][] = [
      [(s) => ((s.hostname = "rebuild-fixture.example.com"), (s.publicOrigin = "https://rebuild-fixture.example.com")), "host_invalid"],
      [(s) => (s.publicOrigin = "https://other.boostweb.co.kr"), "origin_mismatch"],
      [(s) => ((s.template.templateId = "interior-01"), (s.template.releaseId = "interior-01-1.7.0-3b5c917a5005"), (s.template.releaseHash = `3b5c917a5005${"0".repeat(52)}`)), "template_not_allowed"],
      [(s) => ((s.template.releaseId = "interior-02-1.1.1-b60c756ce173"), (s.template.releaseHash = `b60c756ce173${"0".repeat(52)}`)), "release_not_allowed"],
      [(s) => (s.template.releaseHash = `${s.template.releaseHash.slice(0, 12)}${"0".repeat(52)}`), "release_hash_mismatch"],
      [(s) => (s.boostchat.widgetKey = "wgt_short"), "widget_key_invalid"],
      [(s) => (s.siteId = "Bad_Site"), "site_id_invalid"],
      [(s) => (s.contact.phone = "02-ABC"), "phone_invalid"],
      [(s) => (s.identity.brandName = "x<y"), "brand_name_invalid"],
    ];
    for (const [edit, code] of cases) eq((await codeOf(validateRebuildSpec({ repoRoot, raw: mk(edit) }))).code, code, code);
  });
  await check("A8 indexing is obeyed as the spec says: the hostname rule of the old draft (interior-demo* never \"index\") is gone — the gate lives in BoostChat", async () => {
    for (const label of ["interior-demo", "interior-demo-2", "interior-demo-17", "interior-demos"]) {
      for (const indexing of ["index", "noindex"]) {
        const edit = (s: any) => ((s.hostname = `${label}.boostweb.co.kr`), (s.publicOrigin = `https://${label}.boostweb.co.kr`), (s.indexing = indexing));
        eq((await codeOf(validateRebuildSpec({ repoRoot, raw: mk(edit) }))).code, "(accepted)", `${label} ${indexing}`);
      }
    }
    const files = await filesOf(plain((s) => ((s.hostname = "interior-demo.boostweb.co.kr"), (s.publicOrigin = "https://interior-demo.boostweb.co.kr"), (s.indexing = "index"))));
    eq(doc(files, "settings.json").overrides["site.seo"], { indexing: "index" }, "a demo hostname with index plans index");
    assert(!(await readFile(path.join(repoRoot, "platform/provision/rebuild-spec.ts"), "utf8")).includes("interior-demo"), "no hostname pattern left in rebuild-spec.ts");
  });
  await check("A9 a paragraph longer than 300 characters (BrandBlock@1 = the release's slot) is refused; 300 is accepted and its slots are accepted by the release", async () => {
    const para = (n: number) => "가".repeat(n);
    const r = await codeOf(validateRebuildSpec({ repoRoot, raw: branded({ identity: { introduction: { title: "소개", body: [para(301)] } } }) }));
    assert(r.code === "brand_invalid" && r.message.includes("identity.introduction.body[0]"), `${r.code} ${r.message}`);
    eq(BRAND_LIMITS.introductionParagraphMax, 300, "the contract's limit");
    const files = await filesOf(branded({ identity: { introduction: { title: "소".repeat(60), body: [para(300), para(300), para(300), para(300)] } } }));
    await acceptedByRelease(files, R110);
  });
  await check("A10b brandSupport from a release's CONTENTS (no release id is written anywhere): a release of interior-02 that holds the design-system files AND whose brand data model (manifest/shell.ts, manifest/pages.ts) is byte-identical to the reviewed one supports appearance.typography, with the one value soft-rounded listed as path:value; one changed fragment, one missing design file, another template or a record that is not the named release supports NOTHING; the releases reviewed by id are not moved by their contents", async () => {
    const r112 = await loadRelease(repoRoot, "interior-02", R112);
    const dir = "templates/interior-02/v1";
    const id = "interior-02-1.2.0-0123456789ab";
    const designFiles = DESIGN_SYSTEM_FILES.map((rel) => ({ path: `${dir}/${rel}`, sha256: "d".repeat(64), size: 1 }));
    const designed = { templateId: "interior-02", releaseId: id, files: [...r112.files, ...designFiles] };
    eq([carriesDesignSystem(r112), carriesDesignSystem(designed)], [false, true], "carriesDesignSystem");
    const support = brandSupport("interior-02", id, designed);
    const classic = brandSupport("interior-02", R112);
    eq(support.supported, [...classic.supported, "appearance.typography"], "supported: the classic list + appearance.typography");
    eq(support.unsupported, [...classic.unsupported.filter((f) => f !== "appearance.typography"), "appearance.typography:soft-rounded"], "unsupported: the classic list without it + the one value");
    eq(TYPOGRAPHY_UNSUPPORTED_VALUE, "appearance.typography:soft-rounded", "the path:value form");
    eq([...support.supported, ...support.unsupported.filter((f) => !f.includes(":"))].sort(), [...BRAND_FIELD_PATHS].sort(), "partition");
    const nothing = (label: string, release: Parameters<typeof brandSupport>[2], templateId = "interior-02", releaseId = id) => eq(brandSupport(templateId, releaseId, release), { supported: [], unsupported: [...BRAND_FIELD_PATHS] }, label);
    nothing("no record at all (an id nobody reviewed)", undefined);
    for (const rel of ["manifest/shell.ts", "manifest/pages.ts"]) nothing(`${rel} changed`, { ...designed, files: designed.files.map((f) => (f.path === `${dir}/${rel}` ? { ...f, sha256: "0".repeat(64) } : f)) });
    for (const rel of DESIGN_SYSTEM_FILES) nothing(`${rel} missing`, { ...designed, files: designed.files.filter((f) => f.path !== `${dir}/${rel}`) });
    nothing("the classic files alone under an unreviewed id", { ...designed, files: r112.files });
    nothing("a record of another release", { ...designed, releaseId: "interior-02-1.2.0-ffffffffffff" });
    nothing("another template", { ...designed, templateId: "interior-01" }, "interior-01");
    // a fragment that is NOT part of the brand data model may change (manifest/home.ts declares nothing the brand step writes)
    eq(brandSupport("interior-02", id, { ...designed, files: designed.files.map((f) => (f.path === `${dir}/manifest/home.ts` ? { ...f, sha256: "0".repeat(64) } : f)) }), support, "manifest/home.ts changed");
    eq(brandSupport("interior-02", R112, { templateId: "interior-02", releaseId: R112, files: designed.files }), classic, "a release reviewed by id keeps its reviewed list");
    // the reviewed fragments ARE those of the stored releases
    for (const releaseId of [R110, R112]) {
      const record = await loadRelease(repoRoot, "interior-02", releaseId);
      eq(brandSupport("interior-02", id, { templateId: "interior-02", releaseId: id, files: [...record.files, ...designFiles] }), support, `the data model of ${releaseId}`);
    }
  });
  await check("A10 brandSupport: the two reviewed releases agree; supported ∪ unsupported covers every field exactly once; a release nobody reviewed supports nothing; image bytes are recognised by their header", () => {
    const a = brandSupport("interior-02", R110);
    eq(a, brandSupport("interior-02", R112), "1.1.0 = 1.1.2");
    eq(BRAND_FIELD_PATHS.length, 20, "the 20 leaves of boost-chat brand-fields.ts");
    eq([...a.supported, ...a.unsupported.filter((f) => !f.includes(":"))].sort(), [...BRAND_FIELD_PATHS].sort(), "partition");
    eq(a.unsupported, ["identity.specialties", "hero.supportingText", "hero.focal", "hero.overlay", "hero.cta.target:portfolio", "contact.consultationUrl", "appearance.typography"], "unsupported list");
    eq(a.supported, ["identity.tagline", "identity.introduction.title", "identity.introduction.body", "identity.introduction.image", "identity.logo", "hero.heading", "hero.image", "hero.cta", "contact.serviceArea", "contact.address", "contact.hours", "appearance.primaryColor", "appearance.accentColor", "appearance.surface"], "supported list");
    eq(brandSupport("interior-02", "interior-02-1.1.1-b60c756ce173").supported, [], "unreviewed release");
    eq(brandSupport("interior-01", "interior-02-1.1.0-be2c1e2d3850").supported, [], "template / release mismatch");
    eq(brandFieldsSet({ appearance: { typography: "soft-rounded" } }), ["appearance.typography", TYPOGRAPHY_UNSUPPORTED_VALUE], "a typography value a release may not have is named beside its field");
    eq(brandFieldsSet({ appearance: { typography: "modern-sans" } }), ["appearance.typography"], "a supported typography value");
    eq(detectImage(png(7, 5, [1, 2, 3])), { mediaType: "image/png", width: 7, height: 5 }, "png");
    // a JPEG start-of-frame header and a WebP VP8X header are enough for the media type and the pixel size
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x32, 0x00, 0x64, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);
    eq(detectImage(jpeg), { mediaType: "image/jpeg", width: 100, height: 50 }, "jpeg");
    const webp = Buffer.alloc(30);
    webp.write("RIFF", 0, "latin1");
    webp.write("WEBP", 8, "latin1");
    webp.write("VP8X", 12, "latin1");
    webp.writeUIntLE(319, 24, 3);
    webp.writeUIntLE(199, 27, 3);
    eq(detectImage(webp), { mediaType: "image/webp", width: 320, height: 200 }, "webp");
    eq(detectImage(Buffer.from("GIF89a....................")), undefined, "gif is not accepted");
  });

  // ══ B. equivalence with the provisioning scaffold ═══════════════════════════════════════════
  console.log("B. equivalence with the provisioning scaffold");
  for (const releaseId of [R110, R112]) {
    for (const [label, contact] of [["phone, no e-mail", { phone: "02-000-0000", email: null }], ["no phone, e-mail", { phone: null, email: "owner@customer.example" }], ["both", { phone: "031-123-4567", email: "x@customer.example" }]] as const) {
      await check(`B ${releaseId} · ${label}: brand null / design null / noindex / the original name and phone plan byte-identical site files`, async () => {
        const release = await loadRelease(repoRoot, "interior-02", releaseId);
        const provision = {
          schema: "site-provision-spec@1",
          siteId: fixture.siteId,
          hostname: fixture.hostname,
          publicOrigin: fixture.publicOrigin,
          template: { templateId: "interior-02", releaseId, releaseHash: release.releaseHash },
          identity: fixture.identity,
          contact,
          boostchat: fixture.boostchat,
        };
        const expected = (await planScaffold({ repoRoot, spec: provision })).files;
        const rebuilt = (await plan({ ...clone(fixture), template: provision.template, contact: clone(contact), brand: null, design: null, indexing: "noindex", assets: [] })).files;
        eq([...rebuilt.keys()].sort(), [...expected.keys()].sort(), "file set");
        eq(diff(expected, rebuilt), [], "files that differ");
        for (const [k, v] of expected) assert(rebuilt.get(k)!.equals(v), `${k} differs`);
        eq(doc(rebuilt, "settings.json").overrides["site.seo"], { indexing: "noindex" }, "noindex stays");
      });
    }
  }
  await check("B-extra an EMPTY brand block (and empty sections) is the same as no brand; the release's own schemas accept the plain plan", async () => {
    const expected = await filesOf(plain());
    eq(diff(expected, await filesOf(branded({}))), [], "{}");
    eq(diff(expected, await filesOf(branded({ identity: {}, hero: {}, contact: {}, appearance: {} }))), [], "empty sections");
    eq(diff(expected, await filesOf(branded({ appearance: { surface: "warm" } }))), [], "warm surface = the starter palette");
    // design null: the plan is the brand step's output and nothing else — the design step returns those very bytes
    const whole = await plan(branded(fixture.brand));
    const brandOnly = applyBrand({ files: (await planRebuildBase({ repoRoot, spec: branded(fixture.brand) })).files, brand: whole.validated.spec.brand, indexing: "noindex", brandName: whole.validated.effective.identity.brandName, assets: whole.assets });
    eq(diff(brandOnly, whole.files), [], "design null + the whole fixture brand: exactly the brand step's files");
    assert(!("site.design" in doc(whole.files, "settings.json").overrides), "a spec without a design wrote a design document");
    await acceptedByRelease(expected, R110);
    await acceptedByRelease(expected, R112);
  });

  // ══ C. mapping: each field changes exactly the expected files ══════════════════════════════
  console.log("C. field → file mapping");
  const baseFiles = await filesOf(plain());
  const logoAsset = siteAssetOf(LOGO).file;
  const heroAsset = siteAssetOf(HERO).file;
  const aboutAsset = siteAssetOf(ABOUT).file;
  const mapping: { field: string; brand: any; files: string[]; slots?: string[]; release?: string }[] = [
    { field: "identity.tagline", brand: { identity: { tagline: "살면서 편한 집" } }, files: ["slots.json"], slots: ["site.menu.slogan"] },
    { field: "identity.introduction", brand: { identity: { introduction: { title: "소개합니다", body: ["첫 문단", "둘째 문단"] } } }, files: ["slots.json"], slots: ["about.page.introBody", "about.page.introTitle"] },
    { field: "identity.introduction.title only", brand: { identity: { introduction: { title: "소개합니다" } } }, files: ["slots.json"], slots: ["about.page.introTitle"] },
    { field: "identity.introduction.body only", brand: { identity: { introduction: { body: ["첫 문단"] } } }, files: ["slots.json"], slots: ["about.page.introBody"] },
    { field: "identity.introduction.image", brand: { identity: { introduction: { image: "fixture-about" } } }, files: [`assets/${aboutAsset}`, "assets/registry.json", "slots.json"], slots: ["about.page.photoMedia"] },
    { field: "identity.logo", brand: { identity: { logo: "fixture-logo" } }, files: [`assets/${logoAsset}`, "assets/registry.json", "site.json"] },
    { field: "hero.heading", brand: { hero: { heading: "새로워지는 집" } }, files: ["content/banners.json"] },
    { field: "hero.cta", brand: { hero: { cta: { label: "상담 문의", target: "contact" } } }, files: ["content/banners.json"] },
    { field: "hero.image", brand: { hero: { image: "fixture-hero" } }, files: [`assets/${heroAsset}`, "assets/registry.json", "content/banners.json"] },
    { field: "contact.address", brand: { contact: { address: "경기도 수원시 예시로 1" } }, files: ["slots.json"], slots: ["site.footer.location1Address", "site.footer.location1Name", "site.footer.locationsLabel"] },
    { field: "contact.hours", brand: { contact: { hours: "평일 09:00-18:00" } }, files: ["slots.json"], slots: ["site.footer.hours1Label", "site.footer.hours1Value", "site.footer.locationsLabel"] },
    { field: "contact.serviceArea", brand: { contact: { serviceArea: "수원·화성" } }, files: ["slots.json"], slots: ["site.footer.locationsLabel", "site.footer.locationsNote"] },
    { field: "appearance.primaryColor", brand: { appearance: { primaryColor: "#1f3a5f" } }, files: ["theme.json"] },
    { field: "appearance.accentColor", brand: { appearance: { accentColor: "#c2410c" } }, files: ["theme.json"] },
    { field: "appearance.surface", brand: { appearance: { surface: "cool" } }, files: ["theme.json"] },
  ];
  for (const m of mapping) {
    await check(`C ${m.field} → ${m.files.join(", ")}${m.slots ? `  [slots: ${m.slots.join(", ")}]` : ""}`, async () => {
      const files = await filesOf(branded(m.brand));
      eq(diff(baseFiles, files), [...m.files].sort(), "changed files");
      if (m.slots) eq(slotDiff(baseFiles, files), [...m.slots].sort(), "changed slots");
      else if (m.files.includes("slots.json")) throw new Error("slots listed without a slot expectation");
      await acceptedByRelease(files, R110);
      await acceptedByRelease(files, R112);
    });
  }
  // ── hero without an image keeps every slide (D-52); a hero WITH an image replaces them by one ──
  const heroBase = doc(baseFiles, "content/banners.json");
  const heroCta = (label: string) => ({ label, target: { kind: "contact" } });
  const bannersOf = async (hero: any) => doc(await filesOf(branded({ hero })), "content/banners.json");
  await check("C hero (a) heading only → 3 slides; slide 0 headline changed, its text/id/status/image kept; slides 1-2 and the document fields identical to the starter", async () => {
    const b = await bannersOf({ heading: "새로워지는 집" });
    eq(b.items.length, 3, "slide count");
    eq(b.items[0], { ...heroBase.items[0], headline: "새로워지는 집" }, "slide 0");
    assert(b.items[0].text === heroBase.items[0].text && typeof b.items[0].text === "string", "slide 0 text kept");
    eq(b.items.slice(1), heroBase.items.slice(1), "slides 1-2");
    eq([b.schema, b.origin], [heroBase.schema, heroBase.origin], "document fields");
    eq(Object.keys(b.items[0]), Object.keys(heroBase.items[0]), "canonical key order of slide 0");
    eq(diff(baseFiles, await filesOf(branded({ hero: { heading: "새로워지는 집" } }))), ["content/banners.json"], "changed files");
  });
  await check("C hero (b) CTA only → 3 slides; slide 0 gets the cta (contact target) and keeps its headline and text; slides 1-2 identical", async () => {
    const b = await bannersOf({ cta: { label: "무료 상담", target: "contact" } });
    eq(b.items.length, 3, "slide count");
    eq(b.items[0], { ...heroBase.items[0], cta: heroCta("무료 상담") }, "slide 0");
    eq(Object.keys(b.items[0]), ["id", "status", "image", "headline", "text", "cta"], "canonical key order of slide 0");
    eq(b.items.slice(1), heroBase.items.slice(1), "slides 1-2 (slide 2 keeps its own starter CTA)");
  });
  await check("C hero (c) heading + CTA → 3 slides; slide 0 headline and cta changed, text kept; slides 1-2 identical", async () => {
    const b = await bannersOf({ heading: "새로워지는 집", cta: { label: "무료 상담", target: "contact" } });
    eq(b.items.length, 3, "slide count");
    eq(b.items[0], { ...heroBase.items[0], headline: "새로워지는 집", cta: heroCta("무료 상담") }, "slide 0");
    eq(b.items.slice(1), heroBase.items.slice(1), "slides 1-2");
  });
  await check("C hero (d) heading + image → ONE slide carrying the customer's image (the documented replacement); heading + CTA + image keeps the heading and the cta; the starter's text is dropped", async () => {
    const b = await bannersOf({ heading: "새로워지는 집", image: "fixture-hero" });
    eq(b.items, [{ id: heroBase.items[0].id, status: "published", image: { asset: siteAssetOf(HERO).id, alt: "새로워지는 집" }, headline: "새로워지는 집" }], "heading + image");
    const c = await bannersOf({ heading: "새로워지는 집", image: "fixture-hero", cta: { label: "무료 상담", target: "contact" } });
    eq(c.items, [{ id: heroBase.items[0].id, status: "published", image: { asset: siteAssetOf(HERO).id, alt: "새로워지는 집" }, headline: "새로워지는 집", cta: heroCta("무료 상담") }], "heading + CTA + image");
    const only = await bannersOf({ image: "fixture-hero" });
    eq(only.items.length, 1, "image only → one slide");
    eq(only.items[0].headline, heroBase.items[0].headline, "image only keeps the starter's first headline");
  });
  await check("C hero (e) idempotence: the same block planned twice, and applied again to its own output, gives the same bytes; a block without hero leaves banners.json the starter's bytes", async () => {
    for (const hero of [{ heading: "새로워지는 집" }, { cta: { label: "무료 상담", target: "contact" } }, { heading: "새로워지는 집", cta: { label: "무료 상담", target: "contact" } }, { heading: "새로워지는 집", image: "fixture-hero" }]) {
      const spec = branded({ hero });
      const [x, y] = [await plan(spec), await plan(spec)];
      eq(diff(x.files, y.files), [], "planned twice");
      const again = applyBrand({ files: x.files, brand: x.validated.spec.brand, indexing: "noindex", brandName: x.validated.effective.identity.brandName, assets: x.assets });
      assert(again.get("content/banners.json")!.equals(x.files.get("content/banners.json")!), `${JSON.stringify(hero)}: applying the block to its own output changed banners.json`);
    }
    for (const brand of [{ identity: { tagline: "살면서 편한 집" } }, { hero: {} }, { contact: { hours: "평일 09:00-18:00" } }]) assert((await filesOf(branded(brand))).get("content/banners.json")!.equals(baseFiles.get("content/banners.json")!), "a block without a hero edit touched banners.json");
  });
  await check("C indexing \"index\" → settings.json only, and only site.seo.indexing", async () => {
    const files = await filesOf(plain((s) => (s.indexing = "index")));
    eq(diff(baseFiles, files), ["settings.json"], "changed files");
    const [a, b] = [doc(baseFiles, "settings.json"), doc(files, "settings.json")];
    eq(Object.keys(b.overrides), Object.keys(a.overrides), "the same sections");
    eq(b.overrides["site.seo"], { indexing: "index" }, "site.seo");
    delete a.overrides["site.seo"];
    delete b.overrides["site.seo"];
    eq(a, b, "everything else in settings.json");
    await acceptedByRelease(files, R110);
  });
  await check("C content: the logo is the header logo in site.json and a registry entry of its own (content-addressed id, file named by the id); the hero replaces the starter's slides by ONE slide; the theme tokens are the documented ones", async () => {
    const files = await filesOf(branded(fixture.brand));
    const site = doc(files, "site.json");
    eq(site.identity.logo, siteAssetOf(LOGO).id, "identity.logo");
    const registry = doc(files, "assets/registry.json").items;
    eq(registry.filter((e: any) => e.id.startsWith("brand-")), [
      { id: siteAssetOf(LOGO).id, file: siteAssetOf(LOGO).file, mediaType: "image/png", width: 240, height: 80 },
      { id: siteAssetOf(HERO).id, file: siteAssetOf(HERO).file, mediaType: "image/png", width: 1600, height: 900 },
      { id: siteAssetOf(ABOUT).id, file: siteAssetOf(ABOUT).file, mediaType: "image/png", width: 800, height: 600 },
    ], "registry entries");
    assert(files.get(`assets/${logoAsset}`)!.equals(fixtureBytes.get("fixture-logo")!) && files.get(`assets/${heroAsset}`)!.equals(fixtureBytes.get("fixture-hero")!), "image bytes are the verified bytes");
    const banners = doc(files, "content/banners.json");
    eq(banners.items, [{ id: "hero-living", status: "published", image: { asset: siteAssetOf(HERO).id, alt: "우리 집이 새로워집니다" }, headline: "우리 집이 새로워집니다", cta: { label: "상담 문의", target: { kind: "contact" } } }], "hero slide");
    eq(doc(files, "settings.json").overrides["site.seo"], { indexing: "noindex" }, "this plan is noindex: the fixture's \"index\" is the spec's, applied in the build test");
    const theme = doc(files, "theme.json").tokens;
    const cool = SURFACE_PRESETS.cool;
    eq([theme["color.action.primary"], theme["color.border.strong"], theme["color.accent.primary"], theme["color.canvas"]], ["rgb(31, 58, 95)", "rgb(31, 58, 95)", "rgb(194, 65, 12)", `rgb(${cool.canvas.join(", ")})`], "brand colours");
    eq([theme["color.action.primaryText"], theme["color.text.inverse"]], ["rgb(255, 255, 255)", "rgb(255, 255, 255)"], "derived on-colour for a dark primary");
    eq(Object.keys(theme).length, Object.keys(doc(baseFiles, "theme.json").tokens).length, "no token is added or removed");
    // a hero with no image of its own keeps EVERY starter slide (D-52): slide 0 gets the new headline, the rest is the starter's
    const starterItems = doc(baseFiles, "content/banners.json").items;
    const textOnly = doc(await filesOf(branded({ hero: { heading: "새로워지는 집" } })), "content/banners.json").items;
    eq([textOnly.length, textOnly[0].image, textOnly[0].headline], [3, starterItems[0].image, "새로워지는 집"], "heading only");
    // the whole fixture block, together
    eq(diff(baseFiles, files), ["assets/registry.json", `assets/${logoAsset}`, `assets/${heroAsset}`, `assets/${aboutAsset}`, "content/banners.json", "site.json", "slots.json", "theme.json"].sort(), "files changed by the whole fixture block");
    const photo = doc(files, "slots.json").values["about.page"].photoMedia;
    eq(photo, { asset: siteAssetOf(ABOUT).id, alt: "모아 인테리어를 소개합니다" }, "about photo slot");
    assert(files.get(`assets/${aboutAsset}`)!.equals(fixtureBytes.get("fixture-about")!), "about image bytes are the verified bytes");
    await acceptedByRelease(files, R110);
    await acceptedByRelease(files, R112);
  });
  await check("C phone / e-mail are the spec's RESOLVED top-level values, rendered by the starter: a spec phone adds the phone rows; an e-mail null removes the e-mail; the brand block is not involved", async () => {
    const noPhone = await filesOf(plain((s) => (s.contact = { phone: null, email: null })));
    const withPhone = await filesOf(plain((s) => (s.contact = { phone: "031-123-4567", email: null })));
    eq(diff(noPhone, withPhone), ["slots.json"], "changed files");
    assert(slotDiff(noPhone, withPhone).includes("site.footer.company2Value") && slotDiff(noPhone, withPhone).includes("contact.page.callLink"), "phone rows added");
    const withMail = await filesOf(plain((s) => (s.contact = { phone: null, email: "hello@moa-interior.example" })));
    eq(diff(noPhone, withMail), ["content/business.json"], "an e-mail changes only business.json");
    eq(doc(noPhone, "content/business.json").data.contact, undefined, "no e-mail: none in the data");
  });

  // ══ D. contrast ═══════════════════════════════════════════════════════════════════════════════
  console.log("D. contrast");
  await check("D1 the warm surface with the default primary / accent is exactly the starter's palette (so appearance {} changes nothing)", async () => {
    const starter = await readJson(path.join(repoRoot, STARTERS_DIR, "interior-02/theme.json"));
    const tokens = resolveAppearance({});
    for (const [k, v] of Object.entries(tokens)) eq(v, starter.tokens[k], k);
    eq([DEFAULT_PRIMARY, DEFAULT_ACCENT], ["#232220", "#d9691f"], "defaults");
    // resolveAppearance = the judgement, then the tokens; the tokens alone never refuse (the design step judges them when a preset follows)
    const workable = { surface: "cool", primaryColor: "#1f3a5f", accentColor: "#c2410c" } as const;
    eq(appearanceTokens(workable), resolveAppearance(workable), "tokens with and without the judgement");
    eq((await codeOf(() => judgeAppearance({ surface: "dark" }))).code, "contrast_too_low", "judgeAppearance");
    eq(appearanceTokens({ surface: "dark" })["color.canvas"], `rgb(${SURFACE_PRESETS.dark.canvas.join(", ")})`, "appearanceTokens does not judge");
  });
  await check("D2 derived on-colours: white on a dark primary, near-black on a light one (on a dark surface), at least 4.5:1 always — over a sweep of 400 colours", () => {
    eq(onColour([31, 58, 95]), [255, 255, 255], "navy");
    eq(onColour([255, 213, 74]), [17, 17, 17], "yellow");
    eq(resolveAppearance({ surface: "warm", primaryColor: "#1f3a5f" })["color.action.primaryText"], "rgb(255, 255, 255)", "token, dark primary");
    const dark = resolveAppearance({ surface: "dark", primaryColor: "#ffd54a", accentColor: "#c2410c" });
    eq([dark["color.action.primaryText"], dark["color.text.inverse"]], ["rgb(17, 17, 17)", "rgb(17, 17, 17)"], "token, light primary on the dark surface");
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256;
    for (let i = 0; i < 400; i++) {
      const c: [number, number, number] = [rnd(), rnd(), rnd()];
      assert(contrastRatio(onColour(c), c) >= 4.5, `on-colour of ${c}`);
    }
  });
  await check("D3 every surface preset keeps its text readable: primary / secondary / muted text at least 4.5:1 on the canvas and on the secondary surface — except ONE pair that is a fact of the starter, asserted at its measured value", () => {
    // The warm preset IS the starter's own palette (D1), and the starter's muted text on its secondary surface measures
    // 4.23:1 (rgb(118,112,105) on rgb(242,238,231)): below AA for normal text. That is the starter's existing design, not
    // something this module chose, and changing it would change every provisioned site. It is NOT hidden: the test pins the
    // measured value (so a change of either colour fails here and gets a decision) and holds every other pair to 4.5:1.
    const STARTER_MUTED_ON_SECONDARY = 4.23;
    for (const [name, s] of Object.entries(SURFACE_PRESETS)) {
      for (const text of [s.text, s.textSecondary, s.textMuted]) {
        for (const bg of [s.canvas, s.secondary]) {
          const ratio = contrastRatio(text, bg);
          if (name === "warm" && text === s.textMuted && bg === s.secondary) {
            eq(Number(ratio.toFixed(2)), STARTER_MUTED_ON_SECONDARY, "the starter's own muted-on-secondary contrast");
            assert(ratio < 4.5, "this pair is the known sub-4.5 starter fact; if it now passes, remove the exception");
          } else assert(ratio >= 4.5, `${name}: ${text} on ${bg} = ${ratio.toFixed(2)}`);
        }
      }
    }
  });
  await check("D4 an accent below 3:1 against the surface is refused with the measured ratio, in the document's own words — at spec validation, not at build", async () => {
    const pale = "#f5e6a8";
    const ratio = contrastRatio([245, 230, 168], SURFACE_PRESETS.warm.canvas);
    assert(ratio < 3, "fixture colour is really low");
    const r = await codeOf(validateRebuildSpec({ repoRoot, raw: branded({ appearance: { accentColor: pale } }) }));
    assert(r.code === "contrast_too_low" && r.message.includes(`${ratio.toFixed(2)}:1`) && r.message.includes("appearance.accentColor") && r.message.includes("3:1"), `${r.code}: ${r.message}`);
  });
  await check("D5 also refused (contrast_too_low): the surface's text colour unreadable on the accent; a primary too faint against the surface; the starter's default colours on the dark surface — each names its measure", async () => {
    const a = await codeOf(validateRebuildSpec({ repoRoot, raw: branded({ appearance: { accentColor: "#5a4a8f" } }) }));
    assert(a.code === "contrast_too_low" && a.message.includes("text colour") && a.message.includes("3:1") && /\d+\.\d\d:1/.test(a.message), `${a.code}: ${a.message}`);
    const p = await codeOf(validateRebuildSpec({ repoRoot, raw: branded({ appearance: { primaryColor: "#f0f0f0" } }) }));
    assert(p.code === "contrast_too_low" && p.message.includes("appearance.primaryColor"), `${p.code}: ${p.message}`);
    const d = await codeOf(validateRebuildSpec({ repoRoot, raw: branded({ appearance: { surface: "dark" } }) }));
    assert(d.code === "contrast_too_low" && /the starter's default (accent|primary)Color/.test(d.message), `${d.code}: ${d.message}`);
    eq((await codeOf(validateRebuildSpec({ repoRoot, raw: branded({ appearance: { surface: "dark", primaryColor: "#ffd54a", accentColor: "#c2410c" } }) }))).code, "(accepted)", "a workable dark palette");
  });

  // ══ E. ONE real build ════════════════════════════════════════════════════════════════════════
  console.log("E. one real build (fully branded, indexing \"index\") through the CLI");
  const root = await makeRoot();
  const tsx = path.join(repoRoot, "node_modules/.bin/tsx");
  const cli = (args: string[], cwd = repoRoot, timeout = 60_000) => {
    const r = spawnSync(tsx, ["--tsconfig", path.join(repoRoot, "platform/tsconfig.json"), path.join(repoRoot, "platform/cli/site-rebuild.ts"), ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: os.homedir() } as unknown as NodeJS.ProcessEnv, timeout });
    return { status: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout, stderr: r.stderr };
  };
  let summary: any;
  let siteRoot = "";
  await check("E1 the CLI builds the fixture spec (scaffold → managed marker → build public → package check) and exits 0", () => {
    const t0 = Date.now();
    const r = cli(["--build-only", "--spec-file", path.join(repoRoot, FIXTURE_DIR, "rebuild-spec.json"), "--assets-dir", path.join(repoRoot, FIXTURE_DIR, "assets")], root, 600_000);
    assert(r.status === 0, `exit ${r.status}\n${r.out.split("\n").slice(-25).join("\n")}`);
    summary = JSON.parse(r.stdout.slice(r.stdout.indexOf("\n{\n") + 1));
    results.build = { files: summary.fileCount, bytes: summary.bytes, htmlPages: summary.htmlPages.length, buildMs: summary.buildMs, wallMs: Date.now() - t0 };
    eq([summary.status, summary.siteId, summary.indexing, summary.releaseId], ["built", "rebuild-fixture", "index", R110], "summary");
    siteRoot = path.join(root, "data/site-builds/rebuild-fixture/packages", summary.buildInputId, "site");
  });
  const pages = async (): Promise<Record<string, string>> => Object.fromEntries(await Promise.all((summary.htmlPages as string[]).map(async (p): Promise<[string, string]> => [p, await readFile(path.join(siteRoot, p), "utf8")])));
  await check("E2 indexing \"index\": no robots meta on any shell page (404 exempt), robots.txt allows and names the sitemap", async () => {
    const all = await pages();
    for (const [page, html] of Object.entries(all)) {
      if (NOT_FOUND_PAGES.has(page)) assert(/name="robots"[^>]*content="noindex|content="noindex[^>]*name="robots"/.test(html), `${page} (a not-found page) must say noindex`);
      else assert(!/name="robots"/.test(html), `${page} carries a robots meta`);
    }
    const robots = await readFile(path.join(siteRoot, "robots.txt"), "utf8");
    assert(/^Allow: \//m.test(robots) && /^Sitemap: https:\/\/rebuild-fixture\.boostweb\.co\.kr\/sitemap\.xml$/m.test(robots), robots);
  });
  await check("E3 the site theme carries the brand colours (primary, accent, derived on-colour, the cool surface) and none of the starter's accent", async () => {
    const home = (await pages())["index.html"]!;
    const style = /<style id="site-theme">([^<]*)<\/style>/.exec(home)?.[1] ?? "";
    for (const decl of ["--color-action-primary:rgb(31, 58, 95)", "--color-accent-primary:rgb(194, 65, 12)", "--color-action-primary-text:rgb(255, 255, 255)", "--color-canvas:rgb(246, 248, 251)"]) assert(style.includes(decl), `site-theme lacks ${decl}`);
    assert(!style.includes("rgb(217, 105, 31)"), "the starter accent is still there");
  });
  await check("E4 the header shows the logo image (content-addressed path, the file is in the package, alt = the brand name); the spec's brand name is on every page", async () => {
    const all = await pages();
    const src = publicAssetPath(LOGO.sha256, "image/png");
    const tag = [...all["index.html"]!.matchAll(/<img\s[^>]*>/g)].map((m) => m[0]).find((t) => t.includes("i2-header__logo"));
    assert(tag && tag.includes(`src="${src}"`) && tag.includes('alt="모아 인테리어"') && tag.includes('width="240"') && tag.includes('height="80"'), `logo tag: ${tag}`);
    assert((await readFile(path.join(siteRoot, src.slice(1)))).equals(fixtureBytes.get("fixture-logo")!), "the logo file in the package is the verified file");
    for (const [page, html] of Object.entries(all)) if (!NOT_FOUND_PAGES.has(page)) assert(html.includes("모아 인테리어"), `${page} lacks the brand name`);
    assert(all["index.html"]!.includes("© 모아 인테리어"), "copyright");
  });
  await check("E5 text: introduction on /about, tagline in the drawer, footer contact values (address, hours, service area), the spec's phone and e-mail, and the introduction image on /about", async () => {
    const all = await pages();
    const about = all["about.html"]!;
    for (const t of ["모아 인테리어를 소개합니다", "아파트 리모델링을 전문으로 합니다.", "상담부터 시공까지 한 팀이 책임집니다."]) assert(about.includes(t), `/about lacks "${t}"`);
    const home = all["index.html"]!;
    for (const t of ["살면서 편한 집을 짓습니다", "경기도 수원시 팔달구 예시로 1", "평일 09:00-18:00", "활동 지역: 수원·화성·용인", "위치·영업시간", "031-123-4567", "hello@moa-interior.example"]) assert(home.includes(t), `index.html lacks "${t}"`);
    const tels = new Set<string>();
    for (const html of Object.values(all)) for (const m of html.matchAll(/href="(tel:[^"]*)"/g)) tels.add(m[1]!);
    eq([...tels], ["tel:031-123-4567"], "tel links");
    const aboutSrc = publicAssetPath(ABOUT.sha256, "image/png");
    assert(about.includes(`src="${aboutSrc}"`), "/about does not show the introduction image");
    assert((await readFile(path.join(siteRoot, aboutSrc.slice(1)))).equals(fixtureBytes.get("fixture-about")!), "the introduction image in the package is the verified file");
  });
  await check("E6 hero: the shell snapshot holds ONE slide with the brand image and heading (image file in the package); composed with the release's own runtime kit the home page shows them, the CTA, the brand title, and no robots meta", async () => {
    const shell = await readJson(path.join(siteRoot, SHELL_FILE));
    const banners = shell.snapshot.content.banners;
    eq([banners.length, banners[0].headline, banners[0].image.asset, banners[0].cta], [1, "우리 집이 새로워집니다", siteAssetOf(HERO).id, { label: "상담 문의", target: { kind: "contact" } }], "banners in the shell snapshot");
    const heroPath = publicAssetPath(HERO.sha256, "image/png");
    assert((await readFile(path.join(siteRoot, heroPath.slice(1)))).equals(fixtureBytes.get("fixture-hero")!), "hero file in the package");
    const kit = await buildRuntimeKit({ repoRoot, templateId: "interior-02", releaseId: R110, sourceCommit: "test" });
    const kitDir = path.join(root, "kit");
    await mkdir(kitDir);
    await writeFile(path.join(kitDir, RENDERER_FILE), kit.files[RENDERER_FILE]);
    const mod = (await import(pathToFileURL(path.join(kitDir, RENDERER_FILE)).href)) as { renderPortfolioSite: (i: PortfolioSiteInput) => PortfolioSiteResult };
    const runtime = await readJson(path.join(siteRoot, RUNTIME_FILE));
    const shellPages: Record<string, string> = {};
    for (const file of runtime.shellPages as string[]) shellPages[file] = await readFile(path.join(siteRoot, file), "utf8");
    const r = mod.renderPortfolioSite({ runtime, shell, shellPages, portfolio: { categories: [], projects: [], assets: [] }, at: "2026-10-12T00:00:00.000Z" });
    if (!r.ok) throw new Error(`the kit refused the rebuilt site: ${JSON.stringify(r.problems)}`);
    const home = r.files.find((f) => f.path === "/")!.body;
    assert(home.includes(`src="${heroPath}"`) && home.includes("우리 집이 새로워집니다") && home.includes("상담 문의"), "composed home lacks the hero image / heading / CTA");
    assert((/<title>([^<]*)<\/title>/.exec(home)?.[1] ?? "").includes("모아 인테리어"), "title with the brand");
    for (const f of r.files) assert(!/name="robots"/.test(f.body), `composed ${f.path} carries a robots meta although the spec asks for indexing`);
    const starterSlides = (await readJson(path.join(repoRoot, STARTERS_DIR, "interior-02/content/banners.json"))).items.slice(1).map((b: any) => b.headline as string);
    for (const h of starterSlides) assert(!home.includes(h), `composed home still shows the starter slide "${h}"`);
  });

  await check("E7 (D-52) a heading-only hero is BUILT with all starter slides and the package check passes: the shell snapshot holds the starter's 3 banners (slide 0 = the new headline, its text kept), composed with the release's own runtime kit the home page shows the new headline and BOTH other starter slides", async () => {
    const root7 = await makeRoot();
    const specFile = path.join(root7, "heading-only-spec.json");
    await writeFile(specFile, JSON.stringify(branded({ hero: { heading: "새로워지는 집" } })));
    const r7 = cli(["--build-only", "--spec-file", specFile], root7, 600_000);
    assert(r7.status === 0, `exit ${r7.status}\n${r7.out.split("\n").slice(-25).join("\n")}`);
    const sum7 = JSON.parse(r7.stdout.slice(r7.stdout.indexOf("\n{\n") + 1));
    const site7 = path.join(root7, "data/site-builds/rebuild-fixture/packages", sum7.buildInputId, "site");
    const starter = (await readJson(path.join(repoRoot, STARTERS_DIR, "interior-02/content/banners.json"))).items as any[];
    const shell7 = await readJson(path.join(site7, SHELL_FILE));
    const b7 = shell7.snapshot.content.banners as any[];
    eq(b7.length, starter.length, "banners in the shell snapshot = the starter's");
    eq(b7.length, 3, "three");
    eq([b7[0].headline, b7[0].text, b7[0].image], ["새로워지는 집", starter[0].text, starter[0].image], "slide 0");
    eq(b7.slice(1).map((b) => [b.id, b.headline, b.image, b.text, b.cta]), starter.slice(1).map((b) => [b.id, b.headline, b.image, b.text, b.cta]), "slides 1-2 = the starter's");
    const kit = await buildRuntimeKit({ repoRoot, templateId: "interior-02", releaseId: R110, sourceCommit: "test" });
    const kitDir = path.join(root7, "kit");
    await mkdir(kitDir);
    await writeFile(path.join(kitDir, RENDERER_FILE), kit.files[RENDERER_FILE]);
    const mod = (await import(pathToFileURL(path.join(kitDir, RENDERER_FILE)).href)) as { renderPortfolioSite: (i: PortfolioSiteInput) => PortfolioSiteResult };
    const runtime7 = await readJson(path.join(site7, RUNTIME_FILE));
    const shellPages: Record<string, string> = {};
    for (const file of runtime7.shellPages as string[]) shellPages[file] = await readFile(path.join(site7, file), "utf8");
    const out = mod.renderPortfolioSite({ runtime: runtime7, shell: shell7, shellPages, portfolio: { categories: [], projects: [], assets: [] }, at: "2026-10-12T00:00:00.000Z" });
    if (!out.ok) throw new Error(`the kit refused the rebuilt site: ${JSON.stringify(out.problems)}`);
    const home = out.files.find((f) => f.path === "/")!.body;
    assert(home.includes("새로워지는 집"), "composed home lacks the new headline");
    assert(!home.includes(starter[0].headline), "composed home still shows the replaced slide-0 headline");
    for (const slide of starter.slice(1)) assert(home.includes(slide.headline), `composed home lost the starter slide "${slide.headline}"`);

    // the package check is exact in both rules: a package whose hero slide count is wrong for the rule is refused, the real one passes
    const refusal = async (pkgDir: string, p: Awaited<ReturnType<typeof plan>>) => verifyRebuiltPackage({ repoRoot, packageDir: pkgDir, validated: p.validated, assets: p.assets }).then(() => "(accepted)", (e: Error) => `${(e as { code?: string }).code ?? e.name}: ${e.message}`);
    const tamper = async (pkgDir: string, edit: (banners: any[]) => any[]) => {
      const copy = await mkdtemp(path.join(os.tmpdir(), "rebuild-pkg-"));
      tmpRoots.push(copy);
      await cp(pkgDir, copy, { recursive: true });
      const file = path.join(copy, "site", SHELL_FILE);
      const sh = await readJson(file);
      sh.snapshot.content.banners = edit(sh.snapshot.content.banners);
      await writeFile(file, JSON.stringify(sh));
      return copy;
    };
    const pkg7 = path.dirname(site7);
    const plan7 = await plan(branded({ hero: { heading: "새로워지는 집" } }));
    eq(await refusal(pkg7, plan7), "(accepted)", "the real heading-only package passes");
    for (const [name, edit] of [["one slide", (b: any[]) => b.slice(0, 1)], ["two slides", (b: any[]) => b.slice(0, 2)], ["four slides", (b: any[]) => [...b, { ...b[2], id: "extra" }]]] as [string, (b: any[]) => any[]][]) {
      const r = await refusal(await tamper(pkg7, edit), plan7);
      assert(r.startsWith("package_check_failed:") && r.includes('hero rule "no image"') && r.includes(`keeps all ${starter.length} of the starter's`), `no image, ${name}: ${r}`);
    }
    const wrongHeading = await refusal(await tamper(pkg7, (b) => [{ ...b[0], headline: "다른 제목" }, ...b.slice(1)]), plan7);
    assert(wrongHeading.startsWith("package_check_failed:") && wrongHeading.includes("does not carry the brand heading"), wrongHeading);
    // the image rule: the fixture's own package (heading + image) holds exactly one slide; a second slide is refused
    const pkgImage = path.dirname(siteRoot);
    const planImage = await plan(fixture);
    eq(await refusal(pkgImage, planImage), "(accepted)", "the real image package passes");
    const two = await refusal(await tamper(pkgImage, (b) => [...b, { ...b[0], id: "extra" }]), planImage);
    assert(two.startsWith("package_check_failed:") && two.includes('hero rule "image"') && two.includes("exactly one"), `image, two slides: ${two}`);
  });

  // ══ F. CLI ═════════════════════════════════════════════════════════════════════════════════════
  console.log("F. CLI");
  await check("F1 usage errors exit 2 and write nothing: no flags, a missing value, an unknown flag, a missing / unreadable spec file or assets directory", async () => {
    const spec = path.join(repoRoot, FIXTURE_DIR, "rebuild-spec.json");
    for (const args of [[], ["--build-only"], ["--spec-file", spec], ["--build-only", "--spec-file"], ["--build-only", "--spec-file", spec, "--remote"], ["--build-only", "--spec-file", "does/not/exist.json"], ["--build-only", "--spec-file", spec, "--assets-dir", "does/not/exist"], ["--run"], ["--run", "--rebuild-id", "not-a-uuid"], ["--run", "--rebuild-id", "5d0c1b7e-8a42-4f6b-9d31-2c7e4a9f0b15"], ["--run", "--rebuild-id", "5d0c1b7e-8a42-4f6b-9d31-2c7e4a9f0b15", "--spec-file", spec], ["--build-only", "--run"], ["--brand-support", "--template", "Bad_Id"], ["--brand-support", "--template", "interior-99"], ["--brand-support", "--spec-file", spec]]) {
      const r = cli(args);
      assert(r.status === 2 && /usage|cannot read/.test(r.out), `${args.join(" ")}: ${r.status} ${r.out}`);
    }
    assert(!(await stat(path.join(repoRoot, "data/sites/rebuild-fixture")).catch(() => undefined)), "a usage error wrote a site");
  });
  await check("F2 a refused spec exits 4 naming the step and the code, before anything is written: no assets → assets/asset_missing; a tampered image → assets/asset_hash_mismatch; an unsupported field → scaffold/brand_field_unsupported", async () => {
    const spec = path.join(repoRoot, FIXTURE_DIR, "rebuild-spec.json");
    const missing = cli(["--build-only", "--spec-file", spec]);
    assert(missing.status === 4 && missing.stderr.includes("assets (asset_missing)"), `${missing.status} ${missing.out}`);
    const dir = await mkdtemp(path.join(os.tmpdir(), "rebuild-assets-"));
    tmpRoots.push(dir);
    for (const [id, bytes] of fixtureBytes) await writeFile(path.join(dir, `${id}.png`), bytes);
    const tampered = Buffer.from(fixtureBytes.get("fixture-hero")!);
    tampered[100] = tampered[100]! ^ 0xff;
    await writeFile(path.join(dir, "fixture-hero.png"), tampered);
    const bad = cli(["--build-only", "--spec-file", spec, "--assets-dir", dir]);
    assert(bad.status === 4 && bad.stderr.includes("assets (asset_hash_mismatch)"), `${bad.status} ${bad.out}`);
    const unsupportedSpec = path.join(dir, "unsupported.json");
    await writeFile(unsupportedSpec, JSON.stringify(mk((s) => (s.brand.hero.overlay = "soft"))));
    const unsupported = cli(["--build-only", "--spec-file", unsupportedSpec, "--assets-dir", path.join(repoRoot, FIXTURE_DIR, "assets")]);
    assert(unsupported.status === 4 && unsupported.stderr.includes("scaffold (brand_field_unsupported)") && unsupported.stderr.includes("hero.overlay"), `${unsupported.status} ${unsupported.out}`);
    assert(!(await stat(path.join(repoRoot, "data/sites/rebuild-fixture")).catch(() => undefined)) && !(await stat(path.join(repoRoot, "data/site-builds/rebuild-fixture")).catch(() => undefined)), "a refused spec left a site or a build behind");
  });

  // ══ G. brand-support.json ════════════════════════════════════════════════════════════════════
  console.log("G. site-brand-support@1");
  const supportCli = cli(["--brand-support"]);
  await check("G1 `--brand-support` prints site-brand-support@1 (CONTRACTS E7) generated from brand.ts: per-release lists, the four surfaces, the thresholds, the limits — exactly brandSupportDocument(), nothing hand-written", async () => {
    assert(supportCli.status === 0, `exit ${supportCli.status}: ${supportCli.out}`);
    const doc = JSON.parse(supportCli.stdout);
    eq(doc, JSON.parse(JSON.stringify(await brandSupportDocument({ repoRoot, templateId: "interior-02" }))), "CLI output = the generator");
    eq(Object.keys(doc.releases), [...(await readJson(path.join(repoRoot, STARTERS_DIR, "interior-02/starter.json"))).releaseIds].sort(), "one entry per release the starter lists");
    eq(Object.keys(doc), ["schema", "templateId", "releases", "surfaces", "contrast", "limits"], "keys");
    eq([doc.schema, doc.templateId], ["site-brand-support@1", "interior-02"], "header");
    eq(Object.keys(doc.releases), [R110, R112, R120], "releases");
    // what each entry says, pinned: the two classic releases are unchanged; 1.2.0 = the same fourteen fields + appearance.typography, and
    // the same six fields it cannot express + the ONE typography value (hero.overlay, focal, specialties … are NOT gained by the design system)
    const CLASSIC_SUPPORTED = ["identity.tagline", "identity.introduction.title", "identity.introduction.body", "identity.introduction.image", "identity.logo", "hero.heading", "hero.image", "hero.cta", "contact.serviceArea", "contact.address", "contact.hours", "appearance.primaryColor", "appearance.accentColor", "appearance.surface"];
    const NEVER = ["identity.specialties", "hero.supportingText", "hero.focal", "hero.overlay", "hero.cta.target:portfolio", "contact.consultationUrl"];
    for (const id of [R110, R112]) eq(doc.releases[id], { supported: CLASSIC_SUPPORTED, unsupported: [...NEVER, "appearance.typography"] }, `${id}: the classic entry, unchanged`);
    eq(doc.releases[R120], { supported: [...CLASSIC_SUPPORTED, "appearance.typography"], unsupported: [...NEVER, "appearance.typography:soft-rounded"] }, `${R120}: the entry of the design release`);
    eq([doc.releases[R120].supported.length, doc.releases[R120].unsupported.length], [15, 7], `${R120}: counts`);
    // 1.2.0 is recognised by its CONTENTS, not by a reviewed id: without its record the id supports nothing
    eq(brandSupport("interior-02", R120), { supported: [], unsupported: [...BRAND_FIELD_PATHS] }, `${R120} without its record`);
    eq((await loadRelease(repoRoot, "interior-02", R120)).templateVersion, "1.2.0", `${R120}: template version`);
    for (const id of Object.keys(doc.releases)) {
      const record = await loadRelease(repoRoot, "interior-02", id);
      eq(doc.releases[id], brandSupport("interior-02", id, record), `${id} lists`);
      // a typography value is listed by exactly the releases that carry the design system (none of the classic ones; 1.2.0 once it is cut)
      eq(doc.releases[id].unsupported.includes(TYPOGRAPHY_UNSUPPORTED_VALUE), carriesDesignSystem(record), `${id}: the typography value`);
      eq(doc.releases[id].supported.includes("appearance.typography"), carriesDesignSystem(record), `${id}: appearance.typography`);
    }
    for (const id of [R110, R112]) eq(doc.releases[id], brandSupport("interior-02", id), `${id}: reviewed by id`);
    eq(Object.keys(doc.surfaces), ["warm", "neutral", "cool", "dark"], "surfaces");
    for (const [name, v] of Object.entries(doc.surfaces) as [keyof typeof SURFACE_PRESETS, { background: string; text: string }][]) {
      eq(v, { background: `#${SURFACE_PRESETS[name].canvas.map((c) => c.toString(16).padStart(2, "0")).join("")}`, text: `#${SURFACE_PRESETS[name].text.map((c) => c.toString(16).padStart(2, "0")).join("")}` }, `${name} pair`);
    }
    eq(doc.surfaces.warm.background, "#faf8f4", "the warm surface IS the starter's canvas (boost-chat's stand-in table has #f7f3ec)");
    eq([doc.contrast.accentMin, doc.contrast.primaryMin, doc.contrast.accentAgainst, doc.contrast.primaryAgainst], [3, 3, ["background", "text"], ["background"]], "thresholds");
    eq(doc.limits, { ...BRAND_LIMITS }, "limits");
    eq(doc.limits.introductionParagraphMax, 300, "introductionParagraphMax");
    assert(doc.releases[R110].unsupported.includes("hero.cta.target:portfolio") && !doc.releases[R110].supported.includes("hero.cta.target:portfolio"), "an unsupported enum value is path:value");
  });
  await check("G2 a configuration the document lets through is never refused by the build: over 4 surfaces × 14 accents × 8 primaries, the colour rule computed ONLY from the document's own numbers agrees with resolveAppearance (pass ⇒ no contrast_too_low; fail ⇒ contrast_too_low)", () => {
    const doc = JSON.parse(supportCli.stdout);
    const accents = ["#d9691f", "#c2410c", "#b45309", "#0f766e", "#1d4ed8", "#7c3aed", "#be123c", "#f5e6a8", "#ffd54a", "#5a4a8f", "#ffffff", "#000000", "#6b7280", "#22c55e"];
    const primaries = ["#232220", "#1f3a5f", "#7f1d1d", "#f0f0f0", "#ffd54a", "#111111", "#6b7280", "#ffffff"];
    let passes = 0;
    let fails = 0;
    for (const surface of Object.keys(doc.surfaces)) {
      const bg = hexToRgb(doc.surfaces[surface].background);
      const text = hexToRgb(doc.surfaces[surface].text);
      for (const accentColor of accents) {
        for (const primaryColor of primaries) {
          const a = hexToRgb(accentColor);
          const p = hexToRgb(primaryColor);
          const documentSaysOk = contrastRatio(a, bg) >= doc.contrast.accentMin && contrastRatio(a, text) >= doc.contrast.accentMin && contrastRatio(p, bg) >= doc.contrast.primaryMin;
          let refused: string | undefined;
          try {
            resolveAppearance({ surface: surface as "warm", accentColor, primaryColor });
          } catch (e) {
            refused = (e as { code?: string }).code;
          }
          if (documentSaysOk) {
            assert(refused === undefined, `${surface} ${accentColor}/${primaryColor}: the document passes it, the build refuses it (${refused})`);
            passes++;
          } else {
            eq(refused, "contrast_too_low", `${surface} ${accentColor}/${primaryColor}: the document refuses it`);
            fails++;
          }
        }
      }
    }
    assert(passes > 20 && fails > 20, `the sweep is not degenerate: ${passes} pass / ${fails} fail`);
  });
  await check("G3 the limits printed are the limits enforced: each text limit accepted at its maximum and refused one character over (brand_invalid naming the field); paragraphs 4 accepted, 5 refused", async () => {
    const L = JSON.parse(supportCli.stdout).limits as Record<string, number>;
    const at = (n: number) => "가".repeat(n);
    const fields: [string, string, (b: any, v: string) => void][] = [
      ["taglineMax", "identity.tagline", (b, v) => (b.identity = { tagline: v })],
      ["introductionTitleMax", "identity.introduction.title", (b, v) => (b.identity = { introduction: { title: v } })],
      ["introductionParagraphMax", "identity.introduction.body[0]", (b, v) => (b.identity = { introduction: { body: [v] } })],
      ["heroHeadingMax", "hero.heading", (b, v) => (b.hero = { heading: v })],
      ["ctaLabelMax", "hero.cta.label", (b, v) => (b.hero = { cta: { label: v, target: "contact" } })],
      ["serviceAreaMax", "contact.serviceArea", (b, v) => (b.contact = { serviceArea: v })],
      ["addressMax", "contact.address", (b, v) => (b.contact = { address: v })],
      ["hoursMax", "contact.hours", (b, v) => (b.contact = { hours: v })],
    ];
    for (const [key, field, set] of fields) {
      const ok = branded({});
      set(ok.brand, at(L[key]!));
      eq((await codeOf(validateRebuildSpec({ repoRoot, raw: ok }))).code, "(accepted)", `${key} at the limit`);
      const over = branded({});
      set(over.brand, at(L[key]! + 1));
      const r = await codeOf(validateRebuildSpec({ repoRoot, raw: over }));
      assert(r.code === "brand_invalid" && r.message.includes(field), `${key} over the limit: ${r.code} ${r.message}`);
    }
    const paragraphs = (n: number) => branded({ identity: { introduction: { body: Array.from({ length: n }, () => "문단") } } });
    eq((await codeOf(validateRebuildSpec({ repoRoot, raw: paragraphs(L.introductionParagraphsMax!) }))).code, "(accepted)", "paragraphs at the limit");
    eq((await codeOf(validateRebuildSpec({ repoRoot, raw: paragraphs(L.introductionParagraphsMax! + 1) }))).code, "brand_invalid", "paragraphs over");
  });
  // ══ H. design presets in the rebuild path ═══════════════════════════════════════════════════
  console.log(`H. design presets — on a dev release cut from the working tree as ${DESIGN_VERSION}, in a temporary root`);
  let D!: Awaited<ReturnType<typeof makeDesignReleaseRoot>>;
  const design = templateDesign("interior-02");
  // the state of the checkout BEFORE the H group touches anything: which of the two branches of H0 applies, and what must not move
  const storeBefore = await checkoutStoreSnapshot();
  const starterBefore = sha256(await readFile(path.join(repoRoot, STARTERS_DIR, "interior-02/starter.json")));
  const releasedForTree = DESIGN_VERSION === TREE_VERSION ? (await checkoutReleases()).filter((r) => r.templateVersion === TREE_VERSION) : [];
  const H0_BRANCH =
    releasedForTree.length > 0
      ? `RELEASED STATE — the checkout holds ${releasedForTree.map((r) => r.releaseId).join(", ")} for the working tree's version ${TREE_VERSION}: the temporary cut must BE that release (same id, same hash — the committed release is the working tree, no unreleased drift) and reach it through a link, and the checkout's store must be byte for byte and mtime for mtime what it was`
      : `BETWEEN RELEASES — the checkout holds no release of version ${DESIGN_VERSION}: the temporary cut must leave no trace in the checkout's store or starter`;
  const checkoutUntouched = async (when: string) => {
    const now = await checkoutStoreSnapshot();
    if (now.digest !== storeBefore.digest) {
      const before = new Set(storeBefore.entries);
      const after = new Set(now.entries);
      throw new Error(`${when}: the checkout's release store changed — ${[...now.entries.filter((e) => !before.has(e)).map((e) => `+ ${e}`), ...storeBefore.entries.filter((e) => !after.has(e)).map((e) => `- ${e}`)].slice(0, 6).join(" | ")}`);
    }
    eq(sha256(await readFile(path.join(repoRoot, STARTERS_DIR, "interior-02/starter.json"))), starterBefore, `${when}: the checkout's starter`);
  };
  await check(`H0 the design root: the working tree cut as ${DESIGN_VERSION} into a temporary release store (every release gate ran); the release carries the design system and the root's starter lists it; the tests never write into the checkout — ${H0_BRANCH}`, async () => {
    const t0 = Date.now();
    D = await makeDesignReleaseRoot();
    results.designRoot = { releaseId: D.dev.releaseId, cutMs: Date.now() - t0, branch: releasedForTree.length > 0 ? "released" : "between-releases" };
    eq([D.dev.templateVersion, D.dev.releaseId.startsWith(`interior-02-${DESIGN_VERSION}-`)], [DESIGN_VERSION, true], "the dev release");
    assert(!D.root.startsWith(repoRoot), "the design root is inside the checkout");
    assert(carriesDesignSystem(await loadRelease(D.root, "interior-02", D.dev.releaseId)), "the dev release does not carry the design system");
    assert((await readJson(path.join(D.root, STARTERS_DIR, "interior-02/starter.json"))).releaseIds.includes(D.dev.releaseId), "the root's starter does not list the release");
    const inCheckout = await stat(path.join(CHECKOUT_STORE, D.dev.releaseId)).catch(() => undefined);
    const inRoot = await lstat(path.join(D.root, "data/template-releases/interior-02", D.dev.releaseId));
    if (releasedForTree.length > 0) {
      // the cut ran every gate on the working tree, computed the release id from its bytes — and found the committed release under it
      eq(releasedForTree.map((r) => r.releaseId), [D.dev.releaseId], "the working tree is not the release the checkout holds for its version (unreleased drift: bump the version and cut, or revert)");
      eq(D.dev.releaseHash, releasedForTree[0]!.releaseHash, "release hash");
      assert(inCheckout?.isDirectory(), "the checkout's release directory");
      assert(inRoot.isSymbolicLink(), "the temporary store holds a COPY of the release where a link to the checkout's was expected (the cut re-wrote it)");
      eq((await readJson(path.join(repoRoot, STARTERS_DIR, "interior-02/starter.json"))).releaseIds.includes(D.dev.releaseId), true, "the checkout's starter lists the committed release");
    } else {
      assert(!inCheckout, "the dev release was written into the checkout's release store");
      assert(inRoot.isDirectory() && !inRoot.isSymbolicLink(), "the dev release is not a directory of the temporary store");
      eq((await readJson(path.join(repoRoot, STARTERS_DIR, "interior-02/starter.json"))).releaseIds.includes(D.dev.releaseId), false, "the checkout's starter lists the dev release");
    }
    await checkoutUntouched("after the cut");
  });
  /** a spec on the dev release: plain (no brand, noindex) unless edited */
  const dplain = (edit: (s: any) => void = () => {}) => plain((s) => ((s.template = { templateId: "interior-02", releaseId: D.dev.releaseId, releaseHash: D.dev.releaseHash }), edit(s)));
  const dbranded = (brand: any, presetId: string | null, edit: (s: any) => void = () => {}) =>
    branded(brand, (s) => ((s.template = { templateId: "interior-02", releaseId: D.dev.releaseId, releaseHash: D.dev.releaseHash }), (s.design = presetId === null ? null : { presetId, presetVersion: 1 }), edit(s)));
  const dplan = (spec: unknown, bytes: ReadonlyMap<string, Buffer> = fixtureBytes) => plan(spec, bytes, D.root);
  const tokensOf = (files: Map<string, Buffer>): Record<string, string> => doc(files, "theme.json").tokens;
  const configOf = (files: Map<string, Buffer>) => doc(files, "settings.json").overrides["site.design"]?.config;
  const SURFACE_TOKENS = ["color.canvas", "color.surface.primary", "color.surface.secondary", "color.surface.elevated", "color.text.primary", "color.text.secondary", "color.text.muted", "color.link", "color.border.default"];
  const css = (hex: string) => `rgb(${hexToRgb(hex).join(", ")})`;

  await check("H1 the null-design invariant holds on a release that HAS the design system: brand null / design null / noindex plans byte-identical provisioning files; with the whole fixture brand the plan is the brand step's output; no design document, no font family, nothing of the design system in any file", async () => {
    const release = { templateId: "interior-02", releaseId: D.dev.releaseId, releaseHash: D.dev.releaseHash };
    for (const contact of [{ phone: "02-000-0000", email: null }, { phone: null, email: "owner@customer.example" }]) {
      const provision = { schema: "site-provision-spec@1", siteId: fixture.siteId, hostname: fixture.hostname, publicOrigin: fixture.publicOrigin, template: release, identity: fixture.identity, contact, boostchat: fixture.boostchat };
      const expected = (await planScaffold({ repoRoot: D.root, spec: provision })).files;
      const rebuilt = await dplan({ ...clone(fixture), template: release, contact: clone(contact), brand: null, design: null, indexing: "noindex", assets: [] });
      eq(rebuilt.preset, null, "no preset");
      eq([...rebuilt.files.keys()].sort(), [...expected.keys()].sort(), "file set");
      for (const [k, v] of expected) assert(rebuilt.files.get(k)!.equals(v), `${k} differs`);
    }
    const whole = await dplan(dbranded(fixture.brand, null));
    const base = await planRebuildBase({ repoRoot: D.root, spec: dbranded(fixture.brand, null) });
    const brandOnly = applyBrand({ files: base.files, brand: whole.validated.spec.brand, indexing: "noindex", brandName: whole.validated.effective.identity.brandName, assets: whole.assets });
    eq(diff(brandOnly, whole.files), [], "design null + the whole fixture brand");
    for (const [rel, bytes] of whole.files) if (rel.endsWith(".json")) assert(!/site\.design|Pretendard Variable|Noto Serif/.test(bytes.toString("utf8")), `${rel} mentions the design system`);
    await acceptedByRelease(whole.files, D.dev.releaseId, D.root);
  });
  await check("H2 a preset only: resolved by the seam (id + version), applied after the brand step — the design document is the preset's with its reference, the palette is the preset's, the font set's families become the tier-1 typography, the preset's labels land in slots.json; exactly settings.json / slots.json / theme.json differ from the plain plan, and the release's own schemas accept the result — for all three presets", async () => {
    const base = (await dplan(dplain())).files;
    for (const presetId of ["editorial-studio", "luxury-gallery", "remodeling-conversion"]) {
      const preset = await loadPreset({ repoRoot: D.root, templateId: "interior-02", presetId });
      const p = await dplan(dplain((s) => (s.design = { presetId, presetVersion: preset.version })));
      eq([p.preset?.id, p.preset?.version], [presetId, preset.version], `${presetId}: the plan's preset`);
      eq(configOf(p.files), { preset: { id: presetId, version: preset.version }, ...preset.design }, `${presetId}: site.design.config`);
      const tokens = tokensOf(p.files);
      for (const [token, value] of Object.entries(preset.tier1)) eq(tokens[token], value, `${presetId}: ${token}`);
      eq([tokens["typography.heading"], tokens["typography.body"]], [design.fontStacks[preset.design.fontSet]!.display, design.fontStacks[preset.design.fontSet]!.body], `${presetId}: typography tokens`);
      eq(diff(base, p.files), Object.keys(preset.copy).length > 0 ? ["settings.json", "slots.json", "theme.json"] : ["settings.json", "theme.json"], `${presetId}: files changed`);
      eq(doc(p.files, "settings.json").overrides["site.seo"], { indexing: "noindex" }, `${presetId}: indexing stays`);
      await acceptedByRelease(p.files, D.dev.releaseId, D.root);
    }
  });
  await check("H3 a preset + brand colours: primaryColor and accentColor ALWAYS win (and the text derived for the primary); the surface stays the preset's; a brand colour that the starter's palette would have refused but that reads on the preset's surface is ACCEPTED — the early starter-palette judgement is not applied to a preset site", async () => {
    const luxury = D.presets.luxury!;
    const p = await dplan(dbranded({ appearance: { primaryColor: "#1f3a5f", accentColor: "#c2410c" } }, "luxury-gallery"));
    const tokens = tokensOf(p.files);
    eq([tokens["color.action.primary"], tokens["color.border.strong"], tokens["color.accent.primary"], tokens["color.action.primaryText"], tokens["color.text.inverse"]], [css("#1f3a5f"), css("#1f3a5f"), css("#c2410c"), "rgb(255, 255, 255)", "rgb(255, 255, 255)"], "brand colours");
    for (const token of SURFACE_TOKENS) eq(tokens[token], luxury.tier1[token], token);
    eq(configOf(p.files).theme.surface, luxury.design.theme.surface, "theme.surface is the preset's");
    const onlyAccent = tokensOf((await dplan(dbranded({ appearance: { accentColor: "#c2410c" } }, "luxury-gallery"))).files);
    eq([onlyAccent["color.accent.primary"], onlyAccent["color.action.primary"]], [css("#c2410c"), luxury.tier1["color.action.primary"]], "only the accent set: the primary is the preset's, not the starter's");
    // #f0f0f0 as a primary and #8050b8 as an accent are refused on the starter's warm surface (D5) — and read on the dark preset
    for (const appearance of [{ primaryColor: "#f0f0f0" }, { accentColor: "#8050b8" }]) {
      eq((await codeOf(validateRebuildSpec({ repoRoot: D.root, raw: dbranded({ appearance }, null) }))).code, "contrast_too_low", `${JSON.stringify(appearance)} without a preset`);
      const dark = await dplan(dbranded({ appearance }, DARK_PRESET));
      eq(tokensOf(dark.files)["color.canvas"], "#141416", `${JSON.stringify(appearance)}: the dark preset's canvas`);
      if ("primaryColor" in appearance) eq([tokensOf(dark.files)["color.action.primary"], tokensOf(dark.files)["color.action.primaryText"]], [css("#f0f0f0"), "rgb(17, 17, 17)"], "the brand primary and its derived text on the dark preset");
      else eq(tokensOf(dark.files)["color.accent.primary"], css("#8050b8"), "the brand accent on the dark preset");
    }
  });
  await check("H4 a preset + a brand surface: set → the brand step's surface tokens stay and theme.surface follows, the preset's colours land on it; `{surface: \"dark\"}` ALONE resolves on a light-palette preset (its primary — the palette's text colour — follows the dark surface's text colour; the starter's default primary plays no part), and with brand colours of its own it keeps them; unset → the preset's surface", async () => {
    const luxury = D.presets.luxury!;
    const cool = await dplan(dbranded({ appearance: { surface: "cool" } }, "luxury-gallery"));
    const s = SURFACE_PRESETS.cool;
    eq([tokensOf(cool.files)["color.canvas"], tokensOf(cool.files)["color.text.primary"], tokensOf(cool.files)["color.border.default"]], [`rgb(${s.canvas.join(", ")})`, `rgb(${s.text.join(", ")})`, `rgb(${s.border.join(", ")})`], "the cool surface");
    eq(configOf(cool.files).theme.surface, "cool", "theme.surface");
    eq([tokensOf(cool.files)["color.accent.primary"], tokensOf(cool.files)["color.action.primary"]], [luxury.tier1["color.accent.primary"], luxury.tier1["color.action.primary"]], "the preset's accent and primary, not the starter's");
    const darkAlone = await dplan(dbranded({ appearance: { surface: "dark" } }, "luxury-gallery"));
    const darkInk = `rgb(${SURFACE_PRESETS.dark.text.join(", ")})`;
    eq([tokensOf(darkAlone.files)["color.canvas"], configOf(darkAlone.files).theme.surface], [`rgb(${SURFACE_PRESETS.dark.canvas.join(", ")})`, "dark"], "{surface: dark} alone: the dark surface");
    eq([tokensOf(darkAlone.files)["color.action.primary"], tokensOf(darkAlone.files)["color.border.strong"], tokensOf(darkAlone.files)["color.action.primaryText"], tokensOf(darkAlone.files)["color.text.inverse"]], [darkInk, darkInk, "rgb(17, 17, 17)", "rgb(17, 17, 17)"], "{surface: dark} alone: the default primary is derived for the dark surface");
    eq(tokensOf(darkAlone.files)["color.accent.primary"], luxury.tier1["color.accent.primary"], "{surface: dark} alone: the preset's accent reads there and stays");
    await acceptedByRelease(darkAlone.files, D.dev.releaseId, D.root);
    const dark = await dplan(dbranded({ appearance: { surface: "dark", primaryColor: "#ffd54a", accentColor: "#c2410c" } }, "luxury-gallery"));
    eq([tokensOf(dark.files)["color.canvas"], configOf(dark.files).theme.surface, tokensOf(dark.files)["color.action.primaryText"]], [`rgb(${SURFACE_PRESETS.dark.canvas.join(", ")})`, "dark", "rgb(17, 17, 17)"], "a workable dark palette on a preset");
    // {surface: "dark"} alone on the DARK preset: its own light primary reads — accepted, and it would not have been by the starter-palette judgement
    eq((await codeOf(validateRebuildSpec({ repoRoot: D.root, raw: dbranded({ appearance: { surface: "dark" } }, null) }))).code, "contrast_too_low", "{surface: dark} without a preset");
    const nightDark = await dplan(dbranded({ appearance: { surface: "dark" } }, DARK_PRESET));
    eq([tokensOf(nightDark.files)["color.canvas"], tokensOf(nightDark.files)["color.action.primary"]], [`rgb(${SURFACE_PRESETS.dark.canvas.join(", ")})`, "#f5f3ee"], "{surface: dark} + the dark preset");
    const unset = await dplan(dbranded({ appearance: { accentColor: "#c2410c" } }, "luxury-gallery"));
    eq([tokensOf(unset.files)["color.canvas"], configOf(unset.files).theme.surface], [luxury.tier1["color.canvas"], luxury.design.theme.surface], "no brand surface: the preset's (the brand step's warm default is not a choice)");
  });
  await check("H5 a preset + brand typography: supported on a release that carries the design system — modern-sans → sans-pretendard, editorial-serif → serif-noto, over the preset's own font set; with NO preset it becomes the classic document with that font set (and nothing else of a preset); soft-rounded is refused at validation, named as the one unsupported VALUE", async () => {
    const v = await validateRebuildSpec({ repoRoot: D.root, raw: dbranded({ appearance: { typography: "modern-sans" } }, "luxury-gallery") });
    assert(v.support.supported.includes("appearance.typography") && v.support.unsupported.includes(TYPOGRAPHY_UNSUPPORTED_VALUE) && !v.support.unsupported.includes("appearance.typography"), `support on the dev release: ${JSON.stringify(v.support)}`);
    const sans = await dplan(dbranded({ appearance: { typography: "modern-sans" } }, "luxury-gallery"));
    eq([configOf(sans.files).fontSet, tokensOf(sans.files)["typography.heading"]], ["sans-pretendard", design.fontStacks["sans-pretendard"]!.display], "preset serif, brand sans");
    const serif = await dplan(dbranded({ appearance: { typography: "editorial-serif" } }, "remodeling-conversion"));
    eq([configOf(serif.files).fontSet, tokensOf(serif.files)["typography.heading"]], ["serif-noto", design.fontStacks["serif-noto"]!.display], "preset sans, brand serif");
    eq(configOf((await dplan(dbranded({ appearance: { accentColor: "#c2410c" } }, "luxury-gallery"))).files).fontSet, D.presets.luxury!.design.fontSet, "no brand typography: the preset's font set");
    const alone = await dplan(dbranded({ appearance: { typography: "editorial-serif" } }, null));
    eq([alone.preset, configOf(alone.files).preset, configOf(alone.files).fontSet, configOf(alone.files).chrome], [null, null, "serif-noto", { header: "classic", footer: "classic", mobileBar: "none" }], "no preset + a typography: the classic document with that font set");
    eq(diff((await dplan(dplain())).files, alone.files), ["settings.json", "theme.json"], "files a typography alone changes");
    await acceptedByRelease(alone.files, D.dev.releaseId, D.root);
    for (const presetId of ["luxury-gallery", null]) {
      const r = await codeOf(validateRebuildSpec({ repoRoot: D.root, raw: dbranded({ appearance: { typography: "soft-rounded" } }, presetId) }));
      assert(r.code === "brand_field_unsupported" && r.message.endsWith(`cannot express: ${TYPOGRAPHY_UNSUPPORTED_VALUE}`), `soft-rounded (${presetId}): ${r.code} ${r.message}`);
    }
  });
  await check("H6 contrast is judged on the colours that END UP together, once, before the build and before any image is read: a brand primary that passes on the starter's surface is refused on the dark preset (contrast_too_low — the colour, the preset's surface, the measured ratio, the threshold brand support publishes) by planRebuildBase, with NO image bytes at hand; the same preset with a readable primary plans; nothing is written", async () => {
    const appearance = { primaryColor: "#18304a" };
    eq((await codeOf(validateRebuildSpec({ repoRoot: D.root, raw: dbranded({ appearance }, null) }))).code, "(accepted)", "the colour alone is fine on the starter's surface");
    // the whole fixture brand (three images) with that primary: validation passes — the judgement is the plan's
    const spec = dbranded({ ...fixture.brand, appearance }, DARK_PRESET);
    eq((await codeOf(validateRebuildSpec({ repoRoot: D.root, raw: spec }))).code, "(accepted)", "validation does not judge a preset site against the starter palette");
    const support = JSON.parse(JSON.stringify(await brandSupportDocument({ repoRoot: D.root, templateId: "interior-02" })));
    const ratio = contrastRatio(hexToRgb("#18304a"), hexToRgb("#141416"));
    for (const refused of [await codeOf(planRebuildBase({ repoRoot: D.root, spec })), await codeOf(dplan(spec, new Map()))]) {
      eq(refused.code, "contrast_too_low", "the plan refuses it");
      eq(refused.message, `appearance.primaryColor #18304a measures ${ratio.toFixed(2)}:1 as color.action.primary rgb(24, 48, 74) against color.canvas #141416 (the surface of preset "${DARK_PRESET}"); it needs at least ${support.contrast.primaryMin}:1`, "the refusal names the pair and both colours");
    }
    assert(ratio < support.contrast.primaryMin, "the fixture colour is really unreadable there");
    const ok = await dplan(dbranded({ ...fixture.brand, appearance: { primaryColor: "#ffd54a" } }, DARK_PRESET));
    eq(tokensOf(ok.files)["color.action.primary"], css("#ffd54a"), "a readable primary on the dark preset");
    // an accent that cannot be told from the dark preset's page; a pale one — which the surface's light text could not sit on — is fine there:
    // a designed site computes the text of an accent fill itself
    const accent = await codeOf(planRebuildBase({ repoRoot: D.root, spec: dbranded({ appearance: { accentColor: "#1f2a44" } }, DARK_PRESET) }));
    assert(accent.code === "contrast_too_low" && accent.message.startsWith("appearance.accentColor #1f2a44 measures ") && accent.message.includes(`as --ds-accent rgb(31, 42, 68) against --ds-bg rgb(20, 20, 22) (the surface of preset "${DARK_PRESET}")`), `${accent.code}: ${accent.message}`);
    eq(tokensOf((await dplan(dbranded({ appearance: { accentColor: "#f5e6a8" } }, DARK_PRESET))).files)["color.accent.primary"], css("#f5e6a8"), "a pale accent on the dark preset");
    assert(!(await stat(path.join(D.root, "data/sites/rebuild-fixture")).catch(() => undefined)), "a refused plan wrote a site");
  });
  await check("H7 on the design release: an unknown preset → design_unavailable; another version → design_version_mismatch; an id that is not an id → design_invalid; a broken preset file → design_invalid — each by the plan, before images", async () => {
    const withDesign = (presetId: string, presetVersion = 1) => dbranded(fixture.brand, null, (s) => (s.design = { presetId, presetVersion }));
    const refusedBy = async (spec: unknown) => (await codeOf(dplan(spec, new Map()))).code;
    eq(await refusedBy(withDesign("calm")), "design_unavailable", "unknown preset");
    eq(await refusedBy(withDesign("luxury-gallery", 2)), "design_version_mismatch", "another version");
    eq(await refusedBy(withDesign("Luxury Gallery")), "design_invalid", "not an id");
    const broken = path.join(D.root, "data/site-presets/interior-02/broken-test");
    await mkdir(broken, { recursive: true });
    await writeFile(path.join(broken, "preset.json"), JSON.stringify({ ...D.presets.luxury, id: "broken-test", css: ".hero{}" }));
    const r = await codeOf(dplan(withDesign("broken-test"), new Map()));
    assert(r.code === "design_invalid" && r.message.includes("css: unknown field"), `${r.code}: ${r.message}`);
    eq(await refusedBy(withDesign("luxury-gallery")), "asset_missing", "the valid preset: the plan goes on to the images");
  });
  await check("H8 minRelease: a preset is refused (design_release_too_old) on a target release whose template version is lower — the stored 1.1.2, and the 1.2.0 dev release for a preset that asks for 9.0.0 — naming the release, its version and the version needed; nothing is planned for it", async () => {
    const r112 = await loadRelease(D.root, "interior-02", R112);
    const old = await codeOf(dplan(plain((s) => ((s.template = { templateId: "interior-02", releaseId: R112, releaseHash: r112.releaseHash }), (s.design = { presetId: "luxury-gallery", presetVersion: 1 })))));
    eq(old, { code: "design_release_too_old", message: `release ${R112} is template version 1.1.2; preset "luxury-gallery" needs 1.2.0 or later` }, "the stored classic release");
    const future = await codeOf(dplan(dplain((s) => (s.design = { presetId: FUTURE_PRESET, presetVersion: 1 }))));
    eq(future, { code: "design_release_too_old", message: `release ${D.dev.releaseId} is template version ${DESIGN_VERSION}; preset "${FUTURE_PRESET}" needs 9.0.0 or later` }, "a preset ahead of the release");
    eq((await codeOf(dplan(dplain((s) => (s.design = { presetId: "luxury-gallery", presetVersion: 1 }))))).code, "(accepted)", "minRelease = the release's version");
  });
  await check("H9 brand support is derived from the release's contents: the generator lists the dev release beside the two stored ones — appearance.typography supported, appearance.typography:soft-rounded unsupported (path:value) — with no release id of it anywhere in brand.ts; the stored releases' entries are byte for byte what they were", async () => {
    const support = JSON.parse(JSON.stringify(await brandSupportDocument({ repoRoot: D.root, templateId: "interior-02" })));
    const stored: string[] = (await readJson(path.join(repoRoot, STARTERS_DIR, "interior-02/starter.json"))).releaseIds;
    eq(Object.keys(support.releases), [...new Set([...stored, D.dev.releaseId])].sort(), "releases: the ones the root's starter lists");
    const here = JSON.parse(JSON.stringify(await brandSupportDocument({ repoRoot, templateId: "interior-02" })));
    for (const id of [R110, R112]) eq(support.releases[id], here.releases[id], `${id}: unchanged`);
    eq({ ...support, releases: undefined }, { ...here, releases: undefined }, "surfaces, thresholds and limits do not move");
    const dev = support.releases[D.dev.releaseId];
    eq(dev.supported, [...here.releases[R112].supported, "appearance.typography"], "supported");
    eq(dev.unsupported, ["identity.specialties", "hero.supportingText", "hero.focal", "hero.overlay", "hero.cta.target:portfolio", "contact.consultationUrl", "appearance.typography:soft-rounded"], "unsupported");
    const src = await readFile(path.join(repoRoot, "platform/provision/brand.ts"), "utf8");
    assert(!src.includes(D.dev.releaseId) && !/interior-02-1\.2\./.test(src), "brand.ts names a 1.2 release id");
    const cliOut = cli(["--brand-support"], D.root);
    assert(cliOut.status === 0, `exit ${cliOut.status}: ${cliOut.out}`);
    eq(JSON.parse(cliOut.stdout), support, "CLI output in the design root");
  });

  await check("H13 (D-43) a brand colour on a PRESET site is judged by what the designed site renders, not by the classic rule: navy #1f2a44, near-black #111111 and forest #1f4d3a as accent plan on each of the three presets and theme.json carries them, although each is refused on a classic site; a pale yellow #f5e9a8 is refused on each preset (contrast_too_low naming the pair and both colours) by the plan, before any image is read; `{surface: dark}` without a primary plans on each preset and the release's schemas accept it", async () => {
    eq([contrastRuleFor(null), contrastRuleFor({ preset: null }), contrastRuleFor({ preset: { id: "luxury-gallery", version: 1 } })], ["classic-surface", "classic-surface", "rendered-design"], "which rule applies");
    for (const presetId of ["editorial-studio", "luxury-gallery", "remodeling-conversion"]) {
      const preset = await loadPreset({ repoRoot: D.root, templateId: "interior-02", presetId });
      for (const accentColor of ["#1f2a44", "#111111", "#1f4d3a"]) {
        // the whole fixture brand (three images) with that accent
        const p = await dplan(dbranded({ ...fixture.brand, appearance: { accentColor } }, presetId));
        eq([tokensOf(p.files)["color.accent.primary"], tokensOf(p.files)["color.canvas"], configOf(p.files).preset], [css(accentColor), preset.tier1["color.canvas"], { id: presetId, version: preset.version }], `${presetId} + ${accentColor}`);
      }
      const pale = dbranded({ ...fixture.brand, appearance: { accentColor: "#f5e9a8" } }, presetId);
      eq((await codeOf(validateRebuildSpec({ repoRoot: D.root, raw: pale }))).code, "(accepted)", `${presetId}: validation does not judge a preset site`);
      const canvas = preset.tier1["color.canvas"]!;
      const expected = { code: "contrast_too_low", message: `appearance.accentColor #f5e9a8 measures ${contrastRatio(hexToRgb("#f5e9a8"), hexToRgb(canvas)).toFixed(2)}:1 as --ds-accent rgb(245, 233, 168) against --ds-bg ${css(canvas)} (the surface of preset "${presetId}"); it needs at least 3:1` };
      eq(await codeOf(planRebuildBase({ repoRoot: D.root, spec: pale })), expected, `${presetId}: pale yellow, by planRebuildBase`);
      eq(await codeOf(dplan(pale, new Map())), expected, `${presetId}: pale yellow, with no image bytes at hand`);
      const dark = await dplan(dbranded({ ...fixture.brand, appearance: { surface: "dark" } }, presetId));
      const ink = `rgb(${SURFACE_PRESETS.dark.text.join(", ")})`;
      eq([tokensOf(dark.files)["color.canvas"], tokensOf(dark.files)["color.action.primary"], tokensOf(dark.files)["color.action.primaryText"], configOf(dark.files).theme.surface], [`rgb(${SURFACE_PRESETS.dark.canvas.join(", ")})`, ink, "rgb(17, 17, 17)", "dark"], `${presetId}: {surface: dark} without a primary`);
      await acceptedByRelease(dark.files, D.dev.releaseId, D.root);
    }
  });
  await check("H14 (D-43) the classic rule is UNCHANGED where no preset is named: the same navy accent on a classic site (design null) is refused at validation with the wording it always had — on the stored releases and on the dev release — and so is a typography-only (custom) site; `{surface: dark}` alone is still refused there; the brand-support document still describes that classic rule", async () => {
    const ratio = contrastRatio(hexToRgb("#1f2a44"), SURFACE_PRESETS.warm.text).toFixed(2);
    const classicNavy = { code: "contrast_too_low", message: `appearance.accentColor #1f2a44 measures ${ratio}:1 with the warm surface's text colour on it; it needs at least 3:1` };
    eq(await codeOf(validateRebuildSpec({ repoRoot, raw: branded({ appearance: { accentColor: "#1f2a44" } }) })), classicNavy, "navy on a classic site (the stored release of the fixture)");
    eq(await codeOf(validateRebuildSpec({ repoRoot: D.root, raw: dbranded({ appearance: { accentColor: "#1f2a44" } }, null) })), classicNavy, "navy on a classic site (the dev release)");
    eq(await codeOf(planRebuildBase({ repoRoot: D.root, spec: dbranded({ appearance: { accentColor: "#1f2a44", typography: "modern-sans" } }, null) })), classicNavy, "navy on a custom (typography-only) site");
    for (const accentColor of ["#111111", "#1f4d3a"]) eq((await codeOf(validateRebuildSpec({ repoRoot: D.root, raw: dbranded({ appearance: { accentColor, typography: "editorial-serif" } }, null) }))).code, "contrast_too_low", `${accentColor} on a custom site`);
    const darkAlone = await codeOf(validateRebuildSpec({ repoRoot: D.root, raw: dbranded({ appearance: { surface: "dark", typography: "modern-sans" } }, null) }));
    assert(darkAlone.code === "contrast_too_low" && darkAlone.message.startsWith("the starter's default primaryColor #232220 measures ") && darkAlone.message.endsWith("against the dark surface; it needs at least 3:1"), `{surface: dark} alone on a custom site: ${darkAlone.code} ${darkAlone.message}`);
    // a custom site with colours the classic rule accepts still plans, exactly as before
    const custom = await dplan(dbranded({ appearance: { accentColor: "#c2410c", typography: "modern-sans" } }, null));
    eq([custom.preset, configOf(custom.files).preset, tokensOf(custom.files)["color.accent.primary"]], [null, null, css("#c2410c")], "a custom site the classic rule accepts");
    eq(contrastRuleFor(configOf(custom.files)), "classic-surface", "its document is judged by the classic rule");
    // brand support still publishes the classic rule's two accent pairs and its thresholds — the document describes the classic judgement only
    const support = JSON.parse(JSON.stringify(await brandSupportDocument({ repoRoot: D.root, templateId: "interior-02" })));
    eq(support.contrast, { accentMin: 3, primaryMin: 3, accentAgainst: ["background", "text"], primaryAgainst: ["background"] }, "site-brand-support@1 contrast");
  });

  let dsummary: any;
  let dsite = "";
  const dspecFile = () => path.join(D.root, "preset-spec.json");
  await check("H10 ONE real build of a preset site through the CLI: the fixture spec (the whole brand block: logo, hero, introduction image, texts, brand colours on the cool surface, indexing index) + luxury-gallery on the dev release → scaffold → build → THE PACKAGE CHECK PASSES; the summary names the preset", async () => {
    await writeFile(dspecFile(), JSON.stringify(mk((s) => ((s.template = { templateId: "interior-02", releaseId: D.dev.releaseId, releaseHash: D.dev.releaseHash }), (s.design = { presetId: "luxury-gallery", presetVersion: 1 })))));
    const t0 = Date.now();
    const r = cli(["--build-only", "--spec-file", dspecFile(), "--assets-dir", path.join(repoRoot, FIXTURE_DIR, "assets")], D.root, 900_000);
    assert(r.status === 0, `exit ${r.status}\n${r.out.split("\n").slice(-25).join("\n")}`);
    dsummary = JSON.parse(r.stdout.slice(r.stdout.indexOf("\n{\n") + 1));
    results.presetBuild = { files: dsummary.fileCount, bytes: dsummary.bytes, htmlPages: dsummary.htmlPages.length, buildMs: dsummary.buildMs, wallMs: Date.now() - t0 };
    eq([dsummary.status, dsummary.releaseId, dsummary.indexing, dsummary.design], ["built", D.dev.releaseId, "index", { presetId: "luxury-gallery", presetVersion: 1 }], "summary");
    assert(/design luxury-gallery@1/.test(r.stdout) && /preset luxury-gallery@1 applied/.test(r.stdout), "the log does not name the preset");
    dsite = path.join(D.root, "data/site-builds/rebuild-fixture/packages", dsummary.buildInputId, "site");
  });
  await check("H11 the built preset site: every page is rendered from the preset (<html data-design>), <main> carries id=\"main\", the site theme holds the brand's colours on the brand's cool surface, the design tokens are compiled in, the header shows the brand logo, and the shell snapshot carries the design document with its preset reference", async () => {
    const theme = doc((await dplan(JSON.parse(await readFile(dspecFile(), "utf8")))).files, "theme.json").tokens as Record<string, string>;
    for (const page of dsummary.htmlPages as string[]) {
      const html = await readFile(path.join(dsite, page), "utf8");
      assert(/<html\s[^>]* data-design="luxury-gallery"/.test(html), `${page}: data-design`);
      assert(/<main\s[^>]*\bid="main"/.test(html), `${page}: <main> has no id="main"`);
      eq((html.match(/<main[\s>]/g) ?? []).length, 1, `${page}: one <main>`);
    }
    const home = await readFile(path.join(dsite, "index.html"), "utf8");
    const style = /<style id="site-theme">([^<]*)<\/style>/.exec(home)?.[1] ?? "";
    for (const decl of [`--color-action-primary:${css("#1f3a5f")}`, `--color-accent-primary:${css("#c2410c")}`, `--color-canvas:rgb(${SURFACE_PRESETS.cool.canvas.join(", ")})`]) assert(style.includes(decl), `site-theme lacks ${decl}`);
    eq(theme["color.canvas"], `rgb(${SURFACE_PRESETS.cool.canvas.join(", ")})`, "the planned canvas is the brand's");
    assert(/<style id="site-design">:root\{--ds-/.test(home), "no compiled design tokens");
    const logo = publicAssetPath(LOGO.sha256, "image/png");
    assert([...home.matchAll(/<img\s[^>]*>/g)].some((m) => m[0].includes("ds-header-centered__logo") && m[0].includes(`src="${logo}"`)), "the centered header does not show the brand logo");
    const shell = await readJson(path.join(dsite, SHELL_FILE));
    eq(shell.snapshot.settings.overrides["site.design"].config.preset, { id: "luxury-gallery", version: 1 }, "the shell snapshot's design document");
    eq(shell.snapshot.settings.overrides["site.design"].config.theme.surface, "cool", "the brand surface in the design document");
  });
  await check("H12 the font set travels with its licence: /_fonts/serif-noto/ holds the pinned stylesheet (linked from the page), the font files and BOTH licence texts — the OFL text of each family, byte for byte the pinned one, hash-named; no other .txt beside them; the classic build (E) holds no _fonts at all", async () => {
    const pin = design.fontPins.sets["serif-noto"]!;
    const home = await readFile(path.join(dsite, "index.html"), "utf8");
    assert(home.includes(`<link rel="stylesheet" href="/_fonts/serif-noto/${pin.css.file}"`), "the font stylesheet is not linked");
    const names = await readdir(path.join(dsite, "_fonts/serif-noto"));
    eq(names.filter((n) => n.endsWith(".txt")).sort(), pin.licences.map((l) => l.file).sort(), "licence texts in the package");
    eq([names.filter((n) => n.endsWith(".woff2")).length, names.filter((n) => n.endsWith(".css"))], [pin.files, [pin.css.file]], "font files and stylesheet");
    for (const l of pin.licences) {
      const bytes = await readFile(path.join(dsite, "_fonts/serif-noto", l.file));
      eq([sha256(bytes), bytes.length], [l.sha256, l.bytes], `${l.file}: the pinned bytes`);
      assert(/SIL OPEN FONT LICENSE Version 1\.1/.test(bytes.toString("utf8")), `${l.file} is not the OFL text`);
    }
    eq(await readdir(path.join(dsite, "_fonts")), ["serif-noto"], "only the site's own font set");
    assert(!(await stat(path.join(siteRoot, "_fonts")).catch(() => undefined)), "the classic package of E holds font files");
    const classicHome = await readFile(path.join(siteRoot, "index.html"), "utf8");
    assert(/<main[\s>]/.test(classicHome) && !/<main\s[^>]*\bid=/.test(classicHome), "the classic package of E carries a <main> id");
  });
  await check("H15 after every plan and the real preset build of this group, the checkout is what it was before H0: every directory and file of data/template-releases/interior-02 (path, size, mtime, content hash) and the starter", async () => {
    assert(storeBefore.entries.filter((e) => e.startsWith("f ") && e.includes("/release.json ")).length === (await checkoutReleases()).length, "the snapshot does not cover every release of the store");
    await checkoutUntouched("after the H group");
  });
  tmpRoots.push(root);
  console.log(`\nresults ${JSON.stringify(results)}`);
} finally {
  for (const dir of tmpRoots) await rm(dir, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed.length} checks passed`);
if (failed.length > 0) {
  console.log(`FAILED:\n  ${failed.join("\n  ")}`);
  process.exit(1);
}
