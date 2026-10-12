import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DesignError } from "./errors";
import { buildFontSet } from "./fonts";
import type { FontPins } from "./templates";

/**
 * The font placement step of the SITE BUILDER (platform/build/site-build.ts calls it once, after
 * the route plan and before `next build`).
 *
 * Why the builder and not the Template or the site: a Template directory holds no binary file
 * (release rule), a site's assets are images, and the build workspace installs only the release's
 * own scoped manifest. So the font files come from the pinned OFL packages of the repository
 * checkout and are placed in the workspace's public/ — like the integration documents and the
 * runtime documents — where `next build` copies them into the package untouched.
 *
 *   release has no design/fonts.json            → nothing (every other Template, older releases)
 *   site has no design document / set `system`  → nothing (no file, no request)
 *   else                                        → public/<dir>/<set>/<hash>.css + <hash>.woff2 … + <hash>.txt
 *
 * The release pins the sha256 of the stylesheet, which names every font file by its hash, and the
 * sha256 of every licence text (decision D-36: the OFL text travels with the fonts): if this
 * checkout would produce anything else, the build is refused (`design_fonts_invalid`). So the
 * package's fonts are a function of the release (already part of the build's identity) and of the
 * site's settings (part of the site snapshot) — the build input id covers them.
 */
export interface PlacedFonts {
  fontSet: string;
  /** package-relative directory of the set */
  dir: string;
  stylesheet: string;
  /** package-relative path and pinned sha256 of every licence text placed (what the package QA gate exempts from its URL scan — and nothing else) */
  licences: { path: string; sha256: string }[];
  files: number;
  bytes: number;
}

export async function placeDesignFonts(opts: { repoRoot: string; projectDir: string; settings: unknown }): Promise<PlacedFonts | undefined> {
  const raw = await readFile(path.join(opts.projectDir, "design", "fonts.json"), "utf8").catch(() => undefined);
  if (raw === undefined) return undefined;
  const settings = opts.settings as Record<string, { config?: { fontSet?: unknown } | null } | undefined> | undefined;
  const fontSet = settings?.["site.design"]?.config?.fontSet;
  if (typeof fontSet !== "string" || fontSet === "system") return undefined;

  const pins = JSON.parse(raw) as FontPins;
  if (pins.schema !== "design-fonts@1" || !/^_[a-z]+$/.test(pins.dir)) throw new DesignError("design_fonts_invalid", "the release's design/fonts.json has an unexpected shape");
  const pin = Object.hasOwn(pins.sets, fontSet) ? pins.sets[fontSet]! : undefined;
  if (!pin) throw new DesignError("design_fonts_invalid", `the release declares no font set "${fontSet}"`);

  const built = await buildFontSet(opts.repoRoot, fontSet, pin);
  if (built.stylesheet.sha256 !== pin.css.sha256 || built.stylesheet.file !== pin.css.file) {
    throw new DesignError(
      "design_fonts_invalid",
      `font set "${fontSet}": this checkout produces stylesheet ${built.stylesheet.sha256.slice(0, 16)}… but the release pins ${pin.css.sha256.slice(0, 16) || "(nothing)"}… — the installed font packages are not the pinned ones`,
    );
  }

  // the licence texts travel with the fonts (D-36): a release that pins none for a set is refused, and so is any text but the pinned one
  const pinnedLicences = (pin as Partial<typeof pin>).licences;
  if (!Array.isArray(pinnedLicences) || pinnedLicences.length === 0) {
    throw new DesignError("design_fonts_invalid", `font set "${fontSet}": the release pins no licence text for it (design/fonts.json \`licences\`) — a font set is never placed without its licence`);
  }
  if (JSON.stringify(built.licences) !== JSON.stringify(pinnedLicences)) {
    throw new DesignError("design_fonts_invalid", `font set "${fontSet}": the licence texts of the installed font packages are not the ones the release pins`);
  }

  const root = path.join(opts.projectDir, "public", pins.dir);
  if (await stat(root).then(() => true, () => false)) throw new DesignError("design_fonts_invalid", `the release's public/ already contains ${pins.dir}/ — refusing to overwrite`);
  const target = path.join(root, fontSet);
  await mkdir(target, { recursive: true });
  for (const [name, bytes] of built.files) await writeFile(path.join(target, name), bytes);
  const dir = `${pins.dir}/${fontSet}`;
  const licences = pinnedLicences.map((l) => ({ path: `${dir}/${l.file}`, sha256: l.sha256 }));
  return { fontSet, dir, stylesheet: `${dir}/${built.stylesheet.file}`, licences, files: built.fontFiles, bytes: built.bytes };
}
