import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LoadedReconTemplate } from "../content-injection/load-template.js";
import { checkThemeCompatibility } from "./compatibility.js";
import { extractSiteTheme, type ThemeExtraction } from "./extract.js";
import { generateThemeOverlay, type ThemeOverlay } from "./overlay.js";
import { createdAtFromRunId } from "./store.js";
import { buildExtractionReview } from "./report.js";
import {
  COMPATIBILITY_FILE,
  EXTRACTION_MANIFEST_FILE,
  EXTRACTION_REPORT_DIR,
  EXTRACTION_REVIEW_FILE,
  ExtractionManifestSchema,
  ORIGINAL_THEME_FILE,
  PAINT_GROUPS_FILE,
  RUN_ADAPTER_FILE,
  RUN_MANIFEST_FILE,
  SELECTED_THEME_FILE,
  SiteThemeAdapterSchema,
  THEME_ADAPTER_FILE,
  THEME_CONTRACT_ID,
  THEME_ENGINE,
  THEME_OVERLAY_FILE,
  THEME_SCHEMA_VERSION,
  ThemeAdapterOverridesSchema,
  ThemeFileSchema,
  ThemeInputError,
  ThemeRunManifestSchema,
  type CompatibilityReport,
  type SiteThemeAdapter,
  type ThemeAdapterOverrides,
  type ThemeFile,
  type ThemeRunManifest,
} from "./types.js";

/** Read + schema-validate a theme file (curated library file or extracted original). */
export async function loadThemeFile(file: string): Promise<ThemeFile> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new ThemeInputError(`cannot read theme file ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ThemeInputError(`${file} is not valid JSON`);
  }
  return ThemeFileSchema.parse(parsed);
}

export async function loadAdapterFile(file: string): Promise<SiteThemeAdapter> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new ThemeInputError(`cannot read adapter file ${file}`);
  }
  return SiteThemeAdapterSchema.parse(JSON.parse(raw));
}

export async function loadAdapterOverrides(file: string): Promise<ThemeAdapterOverrides> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new ThemeInputError(`cannot read adapter overrides ${file}`);
  }
  return ThemeAdapterOverridesSchema.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// Extraction run (theme:extract)
// ---------------------------------------------------------------------------

export interface WrittenExtraction {
  extraction: ThemeExtraction;
  outputDir: string;
  manifestFile: string;
}

export async function runThemeExtraction(options: {
  template: LoadedReconTemplate;
  templateManifestFile: string;
  runId: string;
  outputDir: string;
  overrides?: ThemeAdapterOverrides;
}): Promise<WrittenExtraction> {
  const extraction = await extractSiteTheme(options.template, {
    ...(options.overrides !== undefined ? { overrides: options.overrides } : {}),
  });
  const { adapter, originalTheme } = extraction;
  const manifest = ExtractionManifestSchema.parse({
    schemaVersion: THEME_SCHEMA_VERSION,
    kind: "theme-extraction",
    extractionId: options.runId,
    createdAt: createdAtFromRunId(options.runId),
    engine: THEME_ENGINE,
    contract: THEME_CONTRACT_ID,
    source: {
      templateManifestFile: options.templateManifestFile,
      templateId: options.template.manifest.templateId,
      host: options.template.manifest.source.host,
      rootUrl: options.template.manifest.source.rootUrl,
      templateSchemaVersion: options.template.manifest.schemaVersion,
    },
    counts: {
      stylesheetRules: extraction.stylesheet.ruleCount,
      paintGroups: adapter.paintGroups.length,
      themeable: adapter.coverage.themeableGroups,
      preserved: adapter.coverage.preservedGroups,
      review: adapter.coverage.reviewGroups,
      assignedTokens: Object.keys(adapter.tokens).length,
      unassignedTokens: 0,
    },
    libraryPromotion: "export-candidate",
    limitations: adapter.limitations,
    provenance: "derived",
  });

  await mkdir(path.join(options.outputDir, EXTRACTION_REPORT_DIR), { recursive: true });
  const write = (name: string, value: unknown): Promise<void> =>
    writeFile(path.join(options.outputDir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  await write(EXTRACTION_MANIFEST_FILE, manifest);
  await write(ORIGINAL_THEME_FILE, originalTheme);
  await write(THEME_ADAPTER_FILE, adapter);
  await write(PAINT_GROUPS_FILE, {
    schemaVersion: THEME_SCHEMA_VERSION,
    templateId: adapter.templateId,
    paintGroups: adapter.paintGroups,
  });
  await write(
    path.join(EXTRACTION_REPORT_DIR, EXTRACTION_REVIEW_FILE),
    buildExtractionReview(extraction),
  );
  return {
    extraction,
    outputDir: options.outputDir,
    manifestFile: path.join(options.outputDir, EXTRACTION_MANIFEST_FILE),
  };
}

// ---------------------------------------------------------------------------
// Theme run (theme:preview / theme:qa substrate)
// ---------------------------------------------------------------------------

export interface CreatedThemeRun {
  runDir: string;
  manifest: ThemeRunManifest;
  compatibility: CompatibilityReport;
  overlay: ThemeOverlay;
  theme: ThemeFile;
  adapter: SiteThemeAdapter;
}

export async function createThemeRun(options: {
  template: LoadedReconTemplate;
  templateManifestFile: string;
  adapter: SiteThemeAdapter;
  adapterSourceFile: string;
  theme: ThemeFile;
  themeSourceFile: string;
  runId: string;
  runDir: string;
  contentRunDir?: string;
}): Promise<CreatedThemeRun> {
  if (options.adapter.templateId !== options.template.manifest.templateId) {
    throw new ThemeInputError(
      `adapter belongs to template ${options.adapter.templateId}, not ${options.template.manifest.templateId}`,
    );
  }
  const compatibility = checkThemeCompatibility(options.adapter, options.theme);
  const overlay = generateThemeOverlay(options.adapter, options.theme);

  await mkdir(path.join(options.runDir, "report"), { recursive: true });
  const write = (name: string, value: unknown): Promise<void> =>
    writeFile(path.join(options.runDir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  await write(SELECTED_THEME_FILE, options.theme);
  await write(RUN_ADAPTER_FILE, options.adapter);
  await write(COMPATIBILITY_FILE, compatibility);
  await writeFile(path.join(options.runDir, THEME_OVERLAY_FILE), overlay.css, "utf8");

  const manifest = ThemeRunManifestSchema.parse({
    schemaVersion: THEME_SCHEMA_VERSION,
    kind: "theme-run",
    runId: options.runId,
    createdAt: createdAtFromRunId(options.runId),
    templateId: options.template.manifest.templateId,
    templateManifestFile: options.templateManifestFile,
    ...(options.contentRunDir !== undefined ? { contentRunDir: options.contentRunDir } : {}),
    themeId: options.theme.themeId,
    themeName: options.theme.name,
    themeMode: options.theme.metadata.mode,
    themeSourceFile: options.themeSourceFile,
    adapterVersion: options.adapter.adapterVersion,
    adapterSourceFile: options.adapterSourceFile,
    compatibility: compatibility.result,
    overlay: {
      file: THEME_OVERLAY_FILE,
      customProperties: overlay.customProperties,
      ruleCount: overlay.ruleCount,
      declarationCount: overlay.declarationCount,
      themedGroupCount: overlay.themedGroupCount,
      themedElementWeight: overlay.themedElementWeight,
      perToken: overlay.perToken,
    },
    provenance: "derived",
  });
  await write(RUN_MANIFEST_FILE, manifest);
  return {
    runDir: options.runDir,
    manifest,
    compatibility,
    overlay,
    theme: options.theme,
    adapter: options.adapter,
  };
}

export interface LoadedThemeRun {
  runDir: string;
  manifest: ThemeRunManifest;
  theme: ThemeFile;
  adapter: SiteThemeAdapter;
  overlayCss: string;
  compatibility: CompatibilityReport;
}

export async function loadThemeRun(runRef: string): Promise<LoadedThemeRun> {
  const runDir = path.resolve(runRef);
  const read = async (name: string): Promise<string> => {
    try {
      return await readFile(path.join(runDir, name), "utf8");
    } catch {
      throw new ThemeInputError(`theme run at ${runDir} is missing ${name}`);
    }
  };
  const manifest = ThemeRunManifestSchema.parse(JSON.parse(await read(RUN_MANIFEST_FILE)));
  const theme = ThemeFileSchema.parse(JSON.parse(await read(SELECTED_THEME_FILE)));
  const adapter = SiteThemeAdapterSchema.parse(JSON.parse(await read(RUN_ADAPTER_FILE)));
  const overlayCss = await read(THEME_OVERLAY_FILE);
  const compatibility = JSON.parse(await read(COMPATIBILITY_FILE)) as CompatibilityReport;
  return { runDir, manifest, theme, adapter, overlayCss, compatibility };
}

// ---------------------------------------------------------------------------
// Theme library (§17/§18)
// ---------------------------------------------------------------------------

export const THEME_LIBRARY_DIR = path.join("themes", "library");

export interface LibraryEntry {
  file: string;
  theme: ThemeFile;
}

/** Reads every `*.theme.json` under the library dir — no ranking, name order. */
export async function listThemeLibrary(dir = THEME_LIBRARY_DIR): Promise<LibraryEntry[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".theme.json")).sort();
  } catch {
    return [];
  }
  const entries: LibraryEntry[] = [];
  for (const file of files) {
    const full = path.join(dir, file);
    entries.push({ file: full, theme: await loadThemeFile(full) });
  }
  return entries;
}
