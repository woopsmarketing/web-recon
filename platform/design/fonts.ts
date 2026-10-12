import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DesignError } from "./errors";
import type { FontFamilyPin, FontSetPin } from "./templates";

/**
 * Font sets — from the pinned OFL npm packages of this checkout to the files a site package holds.
 *
 *   buildFontSet(repoRoot, id, pin) → { stylesheet, files }
 *
 * For every family of the set: the package's installed version must be the pinned one; its own
 * @font-face stylesheet is read; every face (one unicode-range slice of one variable font file) is
 * kept unless its file name matches an `exclude` entry. Each font file is named by the first 20 hex
 * characters of the sha256 of its bytes; the generated stylesheet holds one @font-face per slice —
 * family, style, weight range and unicode-range as the package declares them, `font-display: swap`,
 * a relative `url()` to the hashed file, no absolute URL — and is itself named by its hash. So: a
 * path never changes content, the publisher serves all of it as immutable
 * (platform/publish/media.ts: a hex stem that is a prefix of the file's own sha256), and the sha256
 * of the stylesheet pins the whole set (it contains the hash of every file).
 *
 * LICENCE (decision D-36). For every family the licence text the package ships (`licenceFile` of
 * the pin) is read, must be the text of the licence the pin records, and is PART OF THE SET: the
 * bytes as shipped, named `<first 20 hex of their sha256>.txt` like every other file (two families
 * under the same text share one file). The release pins each of them (`licences`: file, sha256,
 * bytes), so the text in a site package is exactly the reviewed one. The stylesheet opens with one
 * comment line per family: family — licence — package@version. The licence text names two
 * addresses (the OFL's own and the font's project); the package QA gate (platform/build/qa.ts)
 * skips its absolute-URL scan for exactly these pinned files and for nothing else.
 *
 * Deterministic: the same packages give the same bytes. Nothing is downloaded; a package that is
 * not installed, or installed in another version, is an error.
 */
export const FONT_HASH_LENGTH = 20;

export interface BuiltFontSet {
  id: string;
  /** file name → bytes: the stylesheet, every font file and every licence text, all in ONE directory */
  files: Map<string, Buffer>;
  /** the licence texts of the set's families, in family order, each once */
  licences: { file: string; sha256: string; bytes: number }[];
  stylesheet: { file: string; sha256: string; bytes: number };
  /** number of font files (the stylesheet and the licence texts not counted) */
  fontFiles: number;
  /** bytes of every file of the set: font files + licence texts + the stylesheet */
  bytes: number;
  /** `licenceFile` / `licenceSha256`: the licence text the package ships, as it is named in the set */
  families: { family: string; package: string; version: string; licence: string; licenceFile: string; licenceSha256: string; faces: number; bytes: number }[];
}

const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

interface Face {
  family: string;
  style: string;
  weight: string;
  url: string;
  format: string;
  unicodeRange: string;
}

/** The @font-face rules of a package stylesheet (comments dropped). A rule this parser cannot read fully is an error, never skipped. */
export function parseFontFaces(css: string, where: string): Face[] {
  const faces: Face[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of text.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1]!;
    const decl = (name: string): string | undefined => new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(body)?.[1]?.trim().replace(/\s+/g, " ");
    const family = decl("font-family")?.replace(/^['"]|['"]$/g, "");
    const src = /url\(\s*['"]?([^'")]+)['"]?\s*\)\s*format\(\s*['"]([^'"]+)['"]\s*\)/i.exec(decl("src") ?? "");
    const unicodeRange = decl("unicode-range")?.replace(/\s*,\s*/g, ",");
    const weight = decl("font-weight");
    if (!family || !src || !unicodeRange || !weight) throw new DesignError("design_fonts_invalid", `${where}: an @font-face rule lacks family, weight, src or unicode-range`);
    if (!/^[A-Za-z0-9 ]+$/.test(family) || !/^[\d ]+$/.test(weight) || !/^(U\+[0-9a-f?]+(-[0-9a-f]+)?)(,U\+[0-9a-f?]+(-[0-9a-f]+)?)*$/i.test(unicodeRange) || !/^[a-z0-9-]+$/i.test(src[2]!)) {
      throw new DesignError("design_fonts_invalid", `${where}: an @font-face rule of "${family}" has a value outside the expected grammar`);
    }
    faces.push({ family, style: decl("font-style") ?? "normal", weight, url: src[1]!, format: src[2]!, unicodeRange });
  }
  if (faces.length === 0) throw new DesignError("design_fonts_invalid", `${where}: no @font-face rule found`);
  return faces;
}

async function familyFaces(repoRoot: string, pin: FontFamilyPin): Promise<{ face: Face; bytes: Buffer }[]> {
  const pkgDir = path.join(repoRoot, "node_modules", pin.package);
  const manifest = await readFile(path.join(pkgDir, "package.json"), "utf8").catch(() => undefined);
  if (manifest === undefined) throw new DesignError("design_fonts_invalid", `font package ${pin.package} is not installed in this checkout (pnpm install)`);
  const { version } = JSON.parse(manifest) as { version: string };
  if (version !== pin.version) throw new DesignError("design_fonts_invalid", `font package ${pin.package} is installed at ${version}; the release pins ${pin.version}`);
  const sheet = path.join(pkgDir, pin.stylesheet);
  const faces = parseFontFaces(await readFile(sheet, "utf8"), `${pin.package}/${pin.stylesheet}`);
  const out: { face: Face; bytes: Buffer }[] = [];
  for (const face of faces) {
    if (face.family !== pin.family) throw new DesignError("design_fonts_invalid", `${pin.package}/${pin.stylesheet} declares family "${face.family}"; the release pins "${pin.family}"`);
    if (pin.exclude.some((part) => path.posix.basename(face.url).includes(part))) continue;
    const file = path.resolve(path.dirname(sheet), face.url);
    if (!file.startsWith(`${pkgDir}${path.sep}`) || !file.endsWith(".woff2")) throw new DesignError("design_fonts_invalid", `${pin.package}: font file ${face.url} is outside the package or not a .woff2`);
    out.push({ face, bytes: await readFile(file) });
  }
  return out;
}

export async function buildFontSet(repoRoot: string, id: string, pin: Pick<FontSetPin, "families">): Promise<BuiltFontSet> {
  const files = new Map<string, Buffer>();
  const notices: string[] = [];
  const rules: string[] = [];
  const families: BuiltFontSet["families"] = [];
  const licences: BuiltFontSet["licences"] = [];
  let fontFiles = 0;
  for (const family of pin.families) {
    const faces = await familyFaces(repoRoot, family);
    let bytes = 0;
    for (const { face, bytes: data } of faces) {
      const name = `${sha256(data).slice(0, FONT_HASH_LENGTH)}.woff2`;
      if (!files.has(name)) {
        bytes += data.length;
        fontFiles++;
      }
      files.set(name, data);
      rules.push(`@font-face{font-family:"${face.family}";font-style:${face.style};font-weight:${face.weight};font-display:swap;src:url(./${name}) format("${face.format}");unicode-range:${face.unicodeRange}}`);
    }
    const licenceText = await licenceOf(repoRoot, family);
    const licenceSha256 = sha256(licenceText);
    const licenceFile = `${licenceSha256.slice(0, FONT_HASH_LENGTH)}.txt`;
    if (!files.has(licenceFile)) licences.push({ file: licenceFile, sha256: licenceSha256, bytes: licenceText.length });
    files.set(licenceFile, licenceText);
    if (!/^[A-Za-z0-9 ]+$/.test(family.family) || !/^[A-Za-z0-9.-]+$/.test(family.licence) || !/^[@a-z0-9/._-]+$/.test(family.package) || !/^[0-9.]+$/.test(family.version)) {
      throw new DesignError("design_fonts_invalid", `font family pin "${family.family}" has a value outside the expected grammar`);
    }
    notices.push(`/* ${family.family} — ${family.licence} — ${family.package}@${family.version} */`);
    families.push({ family: family.family, package: family.package, version: family.version, licence: family.licence, licenceFile, licenceSha256, faces: faces.length, bytes });
  }
  const css = Buffer.from(`${[...notices, ...rules].join("\n")}\n`);
  const hash = sha256(css);
  const file = `${hash.slice(0, FONT_HASH_LENGTH)}.css`;
  files.set(file, css);
  const bytes = [...files.values()].reduce((sum, b) => sum + b.length, 0);
  return { id, files, licences, stylesheet: { file, sha256: hash, bytes: css.length }, fontFiles, bytes, families };
}

/** The licence text a font package ships (`licenceFile` of the pin): it must name the licence the pin records. */
async function licenceOf(repoRoot: string, pin: FontFamilyPin): Promise<Buffer> {
  const pkgDir = path.join(repoRoot, "node_modules", pin.package);
  const file = path.resolve(pkgDir, pin.licenceFile);
  if (!file.startsWith(`${pkgDir}${path.sep}`)) throw new DesignError("design_fonts_invalid", `${pin.package}: licence file ${pin.licenceFile} is outside the package`);
  const text = await readFile(file).catch(() => undefined);
  if (text === undefined) throw new DesignError("design_fonts_invalid", `${pin.package}: licence file ${pin.licenceFile} does not exist`);
  if (pin.licence === "OFL-1.1" && !/SIL OPEN FONT LICENSE Version 1\.1/i.test(text.toString("utf8"))) {
    throw new DesignError("design_fonts_invalid", `${pin.package}/${pin.licenceFile} is not the text of the SIL Open Font License 1.1 the release records`);
  }
  return text;
}

/** The pin a built set must match (what design/fonts.json records per set, beside the families). */
export function pinOf(built: BuiltFontSet): Pick<FontSetPin, "css" | "licences" | "files" | "bytes"> {
  return { css: built.stylesheet, licences: built.licences, files: built.fontFiles, bytes: built.bytes };
}

/** The measurable part of a stored pin, in pinOf's shape and key order (what `built` is compared with). */
export function measuredPin(pin: FontSetPin): ReturnType<typeof pinOf> {
  return { css: pin.css, licences: pin.licences, files: pin.files, bytes: pin.bytes };
}
