import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { RuntimePage } from "../reconstruction/index.js";
import { compileThemeCss } from "./theme-css.js";
import { extractThemeTokens, type ThemeExtractResult } from "./theme-extract.js";
import {
  THEME_REPORT_FILE,
  ThemeExtractionReportSchema,
  ThemeTokenFileSchema,
  type CompiledThemeCss,
} from "./theme-types.js";
import {
  DEFAULT_PACK_FILE,
  SLOTIZED_TEMPLATE_SCHEMA_VERSION,
  SlotizedInputError,
  TEMPLATE_DIR,
  TEMPLATE_SOURCE_FILE,
  THEME_FILE,
  THEME_PACKS_DIR,
  THEME_PACK_SCHEMA,
  ThemePackSchema,
  type SlotizedManifest,
  type ThemePack,
  type ThemeTokenDefinition,
} from "./types.js";

/**
 * Theme extraction/compilation bound to a slotized run directory (Phase D).
 *
 * Reads ONLY `manifest.json`, `template/source.json` and the copied page
 * trees, and writes ONLY `theme.json`, `theme-packs/default.json` and
 * `theme-report.json` — everything else in the run directory belongs to the
 * compiler and stays untouched, so this can be re-run over an existing run or
 * called inline from `slotize` with the same result.
 */

interface TemplateSource {
  reconstructionAppDir: string;
  generatedStylesRelPath: string;
  siteSpecDir: string;
  reconTemplateDir: string;
  pageFiles: Record<string, string>;
}

async function readJson<T>(file: string, label: string): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    throw new SlotizedInputError(`${label} could not be read: ${file} (${(error as Error).message})`);
  }
}

/** Accepts either the run directory or its `manifest.json`. */
export function resolveRunDir(runDirOrManifest: string): string {
  const resolved = path.resolve(runDirOrManifest);
  return resolved.endsWith(".json") ? path.dirname(resolved) : resolved;
}

export interface LoadedThemeInput {
  runDir: string;
  manifest: SlotizedManifest;
  source: TemplateSource;
  generatedCssFile: string;
  generatedCss: string;
  pages: RuntimePage[];
}

export async function loadThemeInput(runDirOrManifest: string): Promise<LoadedThemeInput> {
  const runDir = resolveRunDir(runDirOrManifest);
  const manifest = await readJson<SlotizedManifest>(path.join(runDir, "manifest.json"), "slotized manifest");
  if (manifest.schemaName !== "slotized-template-v1") {
    throw new SlotizedInputError(`not a slotized template run: ${runDir}`);
  }
  const source = await readJson<TemplateSource>(
    path.join(runDir, TEMPLATE_DIR, TEMPLATE_SOURCE_FILE),
    "template source",
  );
  const generatedCssFile = path.resolve(source.reconstructionAppDir, source.generatedStylesRelPath);
  const generatedCss = await readFile(generatedCssFile, "utf8");
  const pages: RuntimePage[] = [];
  // Page order is fixed by pageId so the census cannot depend on fs order.
  for (const pageId of Object.keys(source.pageFiles).sort()) {
    pages.push(
      await readJson<RuntimePage>(
        path.join(runDir, TEMPLATE_DIR, source.pageFiles[pageId]!),
        `template page ${pageId}`,
      ),
    );
  }
  return { runDir, manifest, source, generatedCssFile, generatedCss, pages };
}

export async function extractThemeForRun(runDirOrManifest: string): Promise<ThemeExtractResult & { input: LoadedThemeInput }> {
  const input = await loadThemeInput(runDirOrManifest);
  const result = extractThemeTokens({
    generatedCss: input.generatedCss,
    // Relative so the report is machine-independent and byte-stable.
    generatedCssFile: path.relative(process.cwd(), input.generatedCssFile),
    pages: input.pages,
    templateId: input.manifest.templateId,
    templateVersion: input.manifest.templateVersion,
  });
  return { ...result, input };
}

export function buildDefaultThemePack(
  manifest: Pick<SlotizedManifest, "templateId" | "templateVersion">,
  tokens: readonly ThemeTokenDefinition[],
): ThemePack {
  const values: Record<string, string> = {};
  for (const token of tokens) values[token.id] = token.value;
  return {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: THEME_PACK_SCHEMA,
    templateId: manifest.templateId,
    templateVersion: manifest.templateVersion,
    label: "default (original reconstruction theme)",
    tokens: values,
  };
}

export interface WrittenTheme {
  runDir: string;
  tokens: ThemeTokenDefinition[];
  defaultPack: ThemePack;
  report: ReturnType<typeof extractThemeTokens>["report"];
  files: string[];
  /** Proof of neutrality: compiling the default pack must yield zero bytes. */
  defaultCssBytes: number;
}

/** Extract + write `theme.json`, `theme-packs/default.json`, `theme-report.json`. */
export async function extractAndWriteTheme(runDirOrManifest: string): Promise<WrittenTheme> {
  const { tokens, report, input } = await extractThemeForRun(runDirOrManifest);
  ThemeTokenFileSchema.parse(tokens);
  ThemeExtractionReportSchema.parse(report);
  const defaultPack = ThemePackSchema.parse(buildDefaultThemePack(input.manifest, tokens));

  const themeFile = path.join(input.runDir, THEME_FILE);
  const packFile = path.join(input.runDir, THEME_PACKS_DIR, DEFAULT_PACK_FILE);
  const reportFile = path.join(input.runDir, THEME_REPORT_FILE);
  await mkdir(path.dirname(packFile), { recursive: true });
  await writeFile(themeFile, `${JSON.stringify(tokens, null, 2)}\n`, "utf8");
  await writeFile(packFile, `${JSON.stringify(defaultPack, null, 2)}\n`, "utf8");
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const neutral = compileThemeCss(tokens, defaultPack);
  return {
    runDir: input.runDir,
    tokens,
    defaultPack,
    report,
    files: [themeFile, packFile, reportFile],
    defaultCssBytes: Buffer.byteLength(neutral.css, "utf8"),
  };
}

export async function loadThemeTokens(runDirOrManifest: string): Promise<ThemeTokenDefinition[]> {
  const runDir = resolveRunDir(runDirOrManifest);
  const raw = await readJson<unknown>(path.join(runDir, THEME_FILE), "theme tokens");
  return ThemeTokenFileSchema.parse(raw);
}

export async function loadThemePack(packFile: string): Promise<ThemePack> {
  const raw = await readJson<unknown>(packFile, "theme pack");
  const parsed = ThemePackSchema.safeParse(raw);
  if (!parsed.success) throw new SlotizedInputError(`theme pack failed validation: ${packFile}\n${parsed.error.message}`);
  return parsed.data;
}

/** The render integration point: pack file → overlay CSS for this template. */
export async function themePackToExtraCss(
  runDirOrManifest: string,
  packFile: string,
): Promise<CompiledThemeCss & { pack: ThemePack }> {
  const tokens = await loadThemeTokens(runDirOrManifest);
  const pack = await loadThemePack(packFile);
  return { ...compileThemeCss(tokens, pack), pack };
}

/**
 * Writes the SAME pack with `extraCss` filled in, so today's renderer
 * (`render:template --theme <compiled>`) applies a theme without knowing
 * anything about tokens.
 */
export async function compileThemePackFile(
  runDirOrManifest: string,
  packFile: string,
  outFile: string,
): Promise<CompiledThemeCss & { outFile: string }> {
  const compiled = await themePackToExtraCss(runDirOrManifest, packFile);
  if (compiled.errors.length > 0) {
    throw new SlotizedInputError(`theme pack is not applicable:\n  ${compiled.errors.join("\n  ")}`);
  }
  // A stale `extraCss` from a previously compiled pack must never survive.
  const { extraCss: _dropped, ...base } = compiled.pack;
  const out: ThemePack = ThemePackSchema.parse({
    ...base,
    ...(compiled.css === "" ? {} : { extraCss: compiled.css }),
  });
  await mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
  await writeFile(path.resolve(outFile), `${JSON.stringify(out, null, 2)}\n`, "utf8");
  return { ...compiled, outFile: path.resolve(outFile) };
}
