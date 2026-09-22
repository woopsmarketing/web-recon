/**
 * The authoring preview WORKSPACE — the small mutable layer that sits in
 * front of an immutable Recon Template (Task 28 Phase 3).
 *
 *   preview = immutable Recon Template
 *           + customer authored Site state (slot values)
 *           + lightweight theme / asset overlays
 *
 * Layout (data/<host>/authoring-previews/<previewId>/):
 *   app/                     patched COPY of the template app (built once)
 *   preview-manifest.json    what it was made from, and with which patch
 *   overlay/slot-values.json the authored slot values the server reads
 *   overlay/authoring-epoch  monotonic token; its CONTENT is the epoch
 *   overlay/theme-overlay.css the theme overlay appended to the stylesheet
 *   overlay/media/<name>     per-file image overrides, served hot
 *
 * NOTHING here copies the materialization's media set: the proxy falls back
 * to the frozen materialization directory for every file the operator has not
 * replaced, so an image edit costs one file write, not a 210 MB copy.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const PREVIEW_MANIFEST_FILE = "preview-manifest.json";
export const OVERLAY_DIR = "overlay";
export const SLOT_VALUES_FILE = "slot-values.json";
export const EPOCH_FILE = "authoring-epoch";
export const THEME_OVERLAY_FILE = "theme-overlay.css";
export const MEDIA_OVERRIDE_DIR = "media";
export const PREVIEW_APP_DIR = "app";

export interface PreviewPaths {
  previewDir: string;
  appDir: string;
  manifestFile: string;
  overlayDir: string;
  slotValuesFile: string;
  epochFile: string;
  themeOverlayFile: string;
  mediaOverrideDir: string;
}

export function previewPaths(previewDir: string): PreviewPaths {
  const overlayDir = path.join(previewDir, OVERLAY_DIR);
  return {
    previewDir,
    appDir: path.join(previewDir, PREVIEW_APP_DIR),
    manifestFile: path.join(previewDir, PREVIEW_MANIFEST_FILE),
    overlayDir,
    slotValuesFile: path.join(overlayDir, SLOT_VALUES_FILE),
    epochFile: path.join(overlayDir, EPOCH_FILE),
    themeOverlayFile: path.join(overlayDir, THEME_OVERLAY_FILE),
    mediaOverrideDir: path.join(overlayDir, MEDIA_OVERRIDE_DIR),
  };
}

/** data/<host>/authoring-previews/<previewId> */
export function authoringPreviewDir(host: string, previewId: string, dataRoot = "data"): string {
  return path.join(dataRoot, host, "authoring-previews", previewId);
}

async function writeAtomic(file: string, body: string | Buffer): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}-${Date.now().toString(36)}`;
  await writeFile(temporary, body);
  await rename(temporary, file);
}

/**
 * The authoring overlay writer.
 *
 * ORDER IS THE CONTRACT: the overlay file is written and renamed into place
 * FIRST, the epoch token SECOND. A server that observes a new epoch is
 * therefore guaranteed to read the new overlay — there is no window in which
 * a fresh epoch points at stale bytes.
 */
export class AuthoringOverlay {
  readonly paths: PreviewPaths;
  private serial: number;
  private values: Record<string, unknown>;
  private themeCss: string;

  private constructor(paths: PreviewPaths, serial: number, values: Record<string, unknown>, themeCss: string) {
    this.paths = paths;
    this.serial = serial;
    this.values = values;
    this.themeCss = themeCss;
  }

  static async open(previewDir: string): Promise<AuthoringOverlay> {
    const paths = previewPaths(previewDir);
    await mkdir(paths.mediaOverrideDir, { recursive: true });
    let serial = 0;
    try {
      const raw = (await readFile(paths.epochFile, "utf8")).trim();
      const parsed = Number.parseInt(raw.split("-")[0] ?? "", 10);
      if (Number.isFinite(parsed)) serial = parsed;
    } catch {
      serial = 0;
    }
    let values: Record<string, unknown> = {};
    try {
      values = JSON.parse(await readFile(paths.slotValuesFile, "utf8")) as Record<string, unknown>;
    } catch {
      values = {};
    }
    let themeCss = "";
    try {
      themeCss = await readFile(paths.themeOverlayFile, "utf8");
    } catch {
      themeCss = "";
    }
    return new AuthoringOverlay(paths, serial, values, themeCss);
  }

  get epoch(): string {
    return String(this.serial);
  }

  get slotValues(): Record<string, unknown> {
    return { ...this.values };
  }

  get themeOverlayCss(): string {
    return this.themeCss;
  }

  /** Replace the whole authored slot-value set. Returns the new epoch. */
  async writeSlotValues(values: Record<string, unknown>): Promise<string> {
    this.values = { ...values };
    await writeAtomic(this.paths.slotValuesFile, JSON.stringify(this.values, null, 2));
    return this.bumpEpoch();
  }

  /** Set/clear a single authored slot value. Returns the new epoch. */
  async setSlotValue(key: string, value: unknown): Promise<string> {
    const next = { ...this.values };
    if (value === undefined) delete next[key];
    else next[key] = value;
    return this.writeSlotValues(next);
  }

  /** Write the theme overlay CSS. No epoch bump: the HTML does not change. */
  async writeThemeOverlayCss(css: string): Promise<void> {
    this.themeCss = css;
    await writeAtomic(this.paths.themeOverlayFile, css);
  }

  /** Override the bytes served at /media/<name>. No epoch bump. */
  async writeMediaOverride(mediaName: string, bytes: Buffer): Promise<string> {
    if (!/^[A-Za-z0-9._-]+$/.test(mediaName) || mediaName.includes("..")) {
      throw new Error(`unsafe media override name: ${mediaName}`);
    }
    const file = path.join(this.paths.mediaOverrideDir, mediaName);
    await writeAtomic(file, bytes);
    return file;
  }

  /** Drop every operator image override — back to the frozen materialization. */
  async clearMediaOverrides(): Promise<void> {
    await rm(this.paths.mediaOverrideDir, { recursive: true, force: true });
    await mkdir(this.paths.mediaOverrideDir, { recursive: true });
  }

  private async bumpEpoch(): Promise<string> {
    this.serial += 1;
    await writeAtomic(this.paths.epochFile, this.epoch);
    return this.epoch;
  }
}
