import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CATCH_ALL_PAGE_TSX,
  LAYOUT_TSX,
  NEXT_CONFIG_MJS,
  NOT_FOUND_TSX,
  TSCONFIG_JSON,
  generatedConfigTs,
  globalsCss,
  packageJson,
} from "./app-template.js";
import {
  FORM_SAFETY_RUNTIME_TSX,
  INTERACTION_RUNTIME_TSX,
  LOAD_PAGE_TS,
  LOAD_ROUTE_TS,
  NODE_RENDERER_TSX,
  PAGE_RENDERER_TSX,
  ROUTE_KEY_TS,
  RUNTIME_TYPES_TS,
} from "./runtime-template.js";
import type { ReconstructionPlan } from "./plan-reconstruction.js";
import { siteSlug } from "./store.js";
import {
  APP_DIR,
  GENERATED_STYLES_FILE,
  GENERATOR_ENGINE,
  GENERATOR_VERSION,
  MANIFEST_FILE,
  RECONSTRUCTION_LIMITATION_MESSAGES,
  RECONSTRUCTION_SCHEMA_VERSION,
  ROUTE_MAP_FILE,
  RUNTIME_DATA_DIR,
  ReconstructionManifestSchema,
  type GeneratedFile,
  type ManifestStats,
  type ReconstructionManifest,
  type RuntimeRouteMap,
} from "./types.js";

/**
 * Writing the app (items 5, 6, 7, 10, 11, 12).
 *
 * A mechanical dump of the plan. Nothing is decided here, which is what makes
 * determinism checkable: two runs produce two directories whose files differ in
 * zero bytes, and the only thing carrying a clock is the run directory's name.
 *
 * The size discipline of item 7 is the reason the runtime data is written with
 * `JSON.stringify(value)` and no indentation while Task 13 chose two-space
 * indent: a SiteSpec is meant to be read by a person reviewing an IR, and a
 * runtime page file is meant to be parsed by a server on a cold start. Different
 * artifacts, different goal.
 */

export interface GenerateAppOptions {
  /** Reconstruction run directory. Created if missing. */
  outputDir: string;
  /** Overwrite an existing output directory instead of refusing (item 5). */
  keepExisting?: boolean;
  /** Absolute directory holding Task 15 correction assets, when any exist. */
  correctionAssetDir?: string;
  sourceSchemaVersion: number;
  sourceSiteSpecVersion: number;
  sourceCompilerVersion: number;
  versions: Parameters<typeof packageJson>[0]["versions"];
}

export interface GeneratedApp {
  outputDir: string;
  appDir: string;
  manifest: ReconstructionManifest;
  files: GeneratedFile[];
  bytes: {
    total: number;
    runtimeData: number;
    css: number;
    source: number;
  };
}

class FileWriter {
  readonly files: GeneratedFile[] = [];
  private readonly dirsMade = new Set<string>();

  constructor(private readonly root: string) {}

  async write(relative: string, contents: string): Promise<number> {
    const file = path.join(this.root, relative);
    const dir = path.dirname(file);
    if (!this.dirsMade.has(dir)) {
      await mkdir(dir, { recursive: true });
      this.dirsMade.add(dir);
    }
    await writeFile(file, contents, "utf8");
    const bytes = Buffer.byteLength(contents, "utf8");
    this.files.push({ path: relative.split(path.sep).join("/"), bytes });
    return bytes;
  }
}

function statsFrom(plan: ReconstructionPlan): ManifestStats {
  const c = plan.counters;
  return {
    routes: plan.routes.routes.length,
    pageSources: plan.pages.length,
    runtimeElementNodes: c.elementNodes,
    runtimeTextNodes: c.textNodes,
    styledNodes: c.styledNodes,
    missingStyleRefs: plan.styles.missingTokens.length,
    styleRules: plan.styles.ruleCount,
    pseudoRules: plan.pseudoStyles.ruleCount,
    generatedDomIds: c.generatedDomIds,
    rewrittenIdrefTokens: c.rewrittenIdrefTokens,
    unresolvedIdrefTokens: c.unresolvedIdrefTokens,
    patternBindings: plan.interactions.bindings.size,
    nativeBindings: plan.interactions.nativeBindings,
    scriptedBindings: plan.interactions.scriptedBindings,
    unknownBindings: plan.interactions.unknowns.size,
    dynamicTargets: plan.interactions.dynamicTargets,
    dynamicTargetsWithContent: plan.interactions.dynamicTargetsWithContent,
    dynamicTemplateNodes: plan.interactions.dynamicTemplateNodes,
    scrollStateNodes: c.scrollStateNodes,
    scrollRestoreNodes: c.scrollRestoreNodes,
    nestingAdaptations: c.nestingAdaptations,
    elementAssetsRequested: c.elementAssetsRequested,
    resolvedImageSrc: c.resolvedImageSrc,
    resolvedSrcset: c.resolvedSrcset,
    inlineSvgRendered: c.inlineSvgRendered,
    unresolvedElementAssets: c.unresolvedElementAssets,
    droppedSrcsetCandidates: c.droppedSrcsetCandidates,
    remoteAssetUrls: c.remoteAssetUrls,
    assetDownloads: 0,
    internalLinksRewritten: c.internalLinksRewritten,
    unresolvedInternalLinks: c.unresolvedInternalLinks,
    externalLinks: c.externalLinks,
    skippedSourceNodes: c.skippedSourceNodes,
    interactionStateConflicts: plan.interactions.interactionStateConflicts,
  };
}

export async function generateApp(
  plan: ReconstructionPlan,
  options: GenerateAppOptions,
): Promise<GeneratedApp> {
  const { outputDir } = options;
  if (!options.keepExisting) {
    // A stale file from a previous generation would make the determinism claim
    // and the manifest's file list both untrue.
    await rm(path.join(outputDir, APP_DIR), { recursive: true, force: true });
    await rm(path.join(outputDir, MANIFEST_FILE), { force: true });
  }
  await mkdir(outputDir, { recursive: true });

  const writer = new FileWriter(outputDir);
  const appRoot = APP_DIR;
  const p = (...parts: string[]): string => [appRoot, ...parts].join("/");

  // --- app shell ------------------------------------------------------------
  const slug = siteSlug(plan.rootUrl);
  let sourceBytes = 0;
  sourceBytes += await writer.write(
    p("package.json"),
    packageJson({ siteSlug: slug, breakpoint: plan.breakpoint, versions: options.versions }),
  );
  sourceBytes += await writer.write(p("next.config.mjs"), NEXT_CONFIG_MJS);
  sourceBytes += await writer.write(p("tsconfig.json"), TSCONFIG_JSON);

  sourceBytes += await writer.write(p("app", "layout.tsx"), LAYOUT_TSX);
  sourceBytes += await writer.write(p("app", "[[...slug]]", "page.tsx"), CATCH_ALL_PAGE_TSX);
  sourceBytes += await writer.write(p("app", "not-found.tsx"), NOT_FOUND_TSX);
  const cssBytes = await writer.write(
    p("app", "globals.css"),
    globalsCss(plan.breakpoint, plan.corrections?.css),
  );

  sourceBytes += await writer.write(p("src", "runtime", "types.ts"), RUNTIME_TYPES_TS);
  sourceBytes += await writer.write(p("src", "runtime", "route-key.ts"), ROUTE_KEY_TS);
  sourceBytes += await writer.write(p("src", "runtime", "load-route.ts"), LOAD_ROUTE_TS);
  sourceBytes += await writer.write(p("src", "runtime", "load-page.ts"), LOAD_PAGE_TS);
  sourceBytes += await writer.write(p("src", "runtime", "NodeRenderer.tsx"), NODE_RENDERER_TSX);
  sourceBytes += await writer.write(p("src", "runtime", "PageRenderer.tsx"), PAGE_RENDERER_TSX);
  sourceBytes += await writer.write(
    p("src", "runtime", "InteractionRuntime.tsx"),
    INTERACTION_RUNTIME_TSX,
  );
  sourceBytes += await writer.write(
    p("src", "runtime", "FormSafetyRuntime.tsx"),
    FORM_SAFETY_RUNTIME_TSX,
  );
  sourceBytes += await writer.write(
    p("src", "generated", "generated-config.ts"),
    generatedConfigTs({
      rootUrl: plan.rootUrl,
      breakpoint: plan.breakpoint,
      routeCount: plan.routes.routes.length,
      pageCount: plan.pages.length,
    }),
  );

  // --- generated stylesheet -------------------------------------------------
  const observedTargetCss = plan.observedTargetCss;
  const stylesheet =
    `/* Generated by web-recon from the SiteSpec global style catalog. */\n` +
    `${plan.styles.css}\n` +
    (plan.pseudoStyles.css === "" ? "" : `${plan.pseudoStyles.css}\n`) +
    (observedTargetCss === "" ? "" : `${observedTargetCss}\n`) +
    // Task 17 §10 — the recovered-rule tier. Higher specificity than the exact
    // classes, so priority is structural: recovered rule → observed responsive
    // rule → exact computed fallback.
    (plan.layout.css === "" ? "" : `${plan.layout.css}\n`);
  const styleBytes = await writer.write(p("public", ...GENERATED_STYLES_FILE.split("/")), stylesheet);

  // --- QA correction assets (Task 15, item 105) -----------------------------
  // Content-addressed binaries copied into the corrected app's public tree. A
  // baseline reconstruction has no corrections and writes nothing here.
  if (plan.corrections && options.correctionAssetDir) {
    for (const assetFile of [...plan.corrections.assets.keys()].sort()) {
      const source = path.join(options.correctionAssetDir, assetFile);
      const info = await stat(source);
      const relative = p("public", "wr", "qa-assets", assetFile);
      await mkdir(path.dirname(path.join(outputDir, relative)), { recursive: true });
      await copyFile(source, path.join(outputDir, relative));
      writer.files.push({ path: relative.split(path.sep).join("/"), bytes: info.size });
    }
  }

  // --- runtime data ---------------------------------------------------------
  const routeMap: RuntimeRouteMap = {
    schemaVersion: RECONSTRUCTION_SCHEMA_VERSION,
    rootUrl: plan.rootUrl,
    breakpoint: plan.breakpoint.value,
    routes: plan.routes.routes,
  };
  let runtimeBytes = 0;
  runtimeBytes += await writer.write(
    p(RUNTIME_DATA_DIR, ROUTE_MAP_FILE),
    JSON.stringify(routeMap) + "\n",
  );
  for (const page of plan.pages) {
    const file = plan.pageFiles.get(page.pageId);
    if (!file) continue;
    runtimeBytes += await writer.write(
      p(RUNTIME_DATA_DIR, ...file.split("/")),
      JSON.stringify(page) + "\n",
    );
  }

  // --- manifest -------------------------------------------------------------
  const limitationGlossary: Record<string, string> = {};
  for (const code of plan.limitations) {
    limitationGlossary[code] = RECONSTRUCTION_LIMITATION_MESSAGES[code];
  }
  for (const [code, message] of Object.entries(plan.sourceLimitationGlossary)) {
    if (!(code in limitationGlossary)) limitationGlossary[code] = message;
  }

  const manifest: ReconstructionManifest = ReconstructionManifestSchema.parse({
    schemaVersion: RECONSTRUCTION_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    engine: GENERATOR_ENGINE,
    sourceSiteSpecVersion: options.sourceSiteSpecVersion,
    sourceSchemaVersion: options.sourceSchemaVersion,
    sourceCompilerVersion: options.sourceCompilerVersion,
    rootUrl: plan.rootUrl,
    config: {
      inferredBreakpoint: plan.breakpoint,
      routeMode: "catch-all",
      assetMode: "reference",
      nextVersion: options.versions.next,
      reactVersion: options.versions.react,
    },
    stats: statsFrom(plan),
    coverage: plan.coverage,
    behavior: plan.behavior,
    layout: {
      pagesWithAlignedProbe: plan.layout.counters.pagesWithAlignedProbe,
      nodesWithProbe: plan.layout.counters.nodesWithProbe,
      recoveredRules: plan.layout.rules.length,
      centered: plan.layout.counters.centered,
      fullWidth: plan.layout.counters.fullWidth,
      percentage: plan.layout.counters.percentage,
      responsiveHidden: plan.layout.counters.responsiveHidden,
    },
    // Sorted so the manifest body is a function of the plan, not of write order.
    generatedFiles: [...writer.files].sort((a, b) => (a.path < b.path ? -1 : 1)),
    ...(plan.correctionProvenance
      ? {
          sourceQaRun: plan.correctionProvenance.sourceQaRun,
          correctionSet: plan.correctionProvenance.correctionSet,
          correctionCount: plan.correctionProvenance.correctionCount,
          ...(plan.correctionProvenance.sourceSiteSpec !== undefined
            ? { sourceSiteSpec: plan.correctionProvenance.sourceSiteSpec }
            : {}),
          correctionsByType: {
            "document-canvas-background": plan.corrections?.counts.canvasBackground ?? 0,
            "interaction-target-state-style":
              plan.corrections?.counts.interactionTargetStateStyle ?? 0,
            "safe-data-image-recovery": plan.corrections?.counts.safeDataImageRecovery ?? 0,
          },
        }
      : {}),
    limitations: plan.limitations,
    sourceLimitations: plan.sourceLimitations,
    limitationGlossary: Object.fromEntries(
      Object.keys(limitationGlossary)
        .sort()
        .map((key) => [key, limitationGlossary[key]!]),
    ),
  });

  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(path.join(outputDir, MANIFEST_FILE), manifestJson, "utf8");

  const total =
    writer.files.reduce((sum, file) => sum + file.bytes, 0) +
    Buffer.byteLength(manifestJson, "utf8");

  return {
    outputDir,
    appDir: path.join(outputDir, APP_DIR),
    manifest,
    files: writer.files,
    bytes: {
      total,
      runtimeData: runtimeBytes,
      css: styleBytes + cssBytes,
      source: sourceBytes,
    },
  };
}

/**
 * Read the exact resolved versions of the packages the generated app declares.
 *
 * Reading them rather than hardcoding is what keeps `"latest"` out of the
 * generated `package.json` (item 206) while still describing a build somebody
 * can reproduce: the version in the file is the version this machine actually
 * resolved, not one a human typed and hoped was current.
 */
export async function resolveDependencyVersions(
  repoRoot: string,
): Promise<GenerateAppOptions["versions"]> {
  const read = async (name: string): Promise<string> => {
    const file = path.join(repoRoot, "node_modules", ...name.split("/"), "package.json");
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    if (!parsed.version) throw new Error(`${name} has no version in its package.json`);
    return parsed.version;
  };
  const [next, react, reactDom, typescript, typesNode, typesReact, typesReactDom, serverOnly] =
    await Promise.all([
      read("next"),
      read("react"),
      read("react-dom"),
      read("typescript"),
      read("@types/node"),
      read("@types/react"),
      read("@types/react-dom"),
      read("server-only"),
    ]);
  return {
    next,
    react,
    reactDom,
    typescript,
    typesNode,
    typesReact,
    typesReactDom,
    serverOnly,
  };
}
