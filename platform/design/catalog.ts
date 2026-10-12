import { listPresets } from "./preset";
import { templateDesign } from "./templates";

/**
 * The preset catalog BoostChat vendors — `presets.json`, schema site-design-presets@1 (CONTRACTS E7).
 * Generated from data/site-presets/<templateId>/ and the Template's font pins; never edited by hand.
 *
 *   sections     the preset's composition, in reading order: header · the home recipe · the two
 *                portfolio pages · footer · mobile bar — as { section, variant }
 *   fonts        the families of the preset's font set with their licence (none for `system`)
 *   thumbnails   null until the sample-content screenshots exist; with `thumbnails: true` the
 *                conventional file names of E7: `<presetId>-<version>-{desktop,mobile}.jpg` — a
 *                PLAIN FILE NAME, never a path. The files live in the catalog's `thumbs/`
 *                directory and `catalog.sha256` pins them as `thumbs/<name>`; the reader joins
 *                the directory itself and refuses a name that carries one (a name from a data
 *                file must not be able to choose a directory).
 *
 * Deterministic: presets in id order, keys in a fixed order, no timestamp.
 */
export const DESIGN_PRESETS_SCHEMA = "site-design-presets@1";

export interface DesignCatalogPreset {
  id: string;
  version: number;
  name: string;
  summary: string;
  bestFor: string[];
  minRelease: string;
  fontSet: string;
  fonts: { family: string; licence: string }[];
  sections: { section: string; variant: string }[];
  thumbnails: { desktop: string | null; mobile: string | null };
}

export interface DesignCatalog {
  schema: typeof DESIGN_PRESETS_SCHEMA;
  templateId: string;
  presets: DesignCatalogPreset[];
}

/** The directory of the vendored catalog that holds the thumbnail files (and the prefix of their lines in `catalog.sha256`). */
export const THUMBNAILS_DIR = "thumbs";
/** What a thumbnail name in the catalog must match — the consumer's own rule (BoostChat src/lib/site-design/presets.ts THUMB_NAME_RE). */
export const THUMBNAIL_NAME_RE = /^[a-z0-9][a-z0-9-]*-\d+-(desktop|mobile)\.jpg$/;
/** The file name of a preset's sample screenshot: no directory part. */
export function thumbnailFileName(presetId: string, version: number, shot: "desktop" | "mobile"): string {
  return `${presetId}-${version}-${shot}.jpg`;
}

export async function buildDesignCatalog(opts: { repoRoot: string; templateId: string; thumbnails?: boolean }): Promise<DesignCatalog> {
  const design = templateDesign(opts.templateId);
  const presets = (await listPresets(opts)).map((preset): DesignCatalogPreset => {
    const { chrome, home, pages, fontSet } = preset.design;
    const families = Object.hasOwn(design.fontPins.sets, fontSet) ? design.fontPins.sets[fontSet]!.families : [];
    const thumb = (shot: "desktop" | "mobile") => (opts.thumbnails ? thumbnailFileName(preset.id, preset.version, shot) : null);
    return {
      id: preset.id,
      version: preset.version,
      name: preset.name,
      summary: preset.summary,
      bestFor: [...preset.bestFor],
      minRelease: preset.minRelease,
      fontSet,
      fonts: families.map((f) => ({ family: f.family, licence: f.licence })),
      sections: [
        { section: "header", variant: chrome.header },
        ...home.map((entry) => ({ section: entry.section, variant: entry.variant })),
        { section: "listing", variant: pages.listing },
        { section: "detail", variant: pages.detail },
        { section: "footer", variant: chrome.footer },
        { section: "mobileBar", variant: chrome.mobileBar },
      ],
      thumbnails: { desktop: thumb("desktop"), mobile: thumb("mobile") },
    };
  });
  return { schema: DESIGN_PRESETS_SCHEMA, templateId: opts.templateId, presets };
}

export function serializeDesignCatalog(catalog: DesignCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
