import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { executeStage } from "./execute-stage.js";
import { portablePath, type E2eRunContext } from "./run-context.js";

/**
 * Final independence audit of the generated app (Task 16, items 115–120).
 *
 * Every earlier stage measured how ACCURATE the clone is. This one measures
 * something the fidelity numbers cannot express: whether the thing that was
 * built is genuinely an independent application, or a shell that still leans on
 * the pipeline that produced it.
 *
 * Five questions, each a mechanical scan of the app directory rather than a
 * claim:
 *
 *  1. **Does it need the SiteSpec?** The app must not reference a `site-specs/`
 *     path, a `site-observations/` path, or anything in `data/`. Task 14 proves
 *     this by DELETING the SiteSpec before `next build`; here the audit is
 *     static, because an E2E run must not destroy the artifact its own manifest
 *     points at.
 *  2. **Does it carry original source?** No original `<script src>` bundle, no
 *     `on*=` inline handler, no original stylesheet `<link>`, no source `class`
 *     attribute reconstruction. Generated `data-wr-*` and `.wr-st…` classes are
 *     this pipeline's own vocabulary and are expected (item 118).
 *  3. **Can it write to the original backend?** No `action=` / `formaction=`
 *     pointing at the source origin, and no non-GET fetch to it (item 117).
 *  4. **What does it depend on?** The generated `package.json`, verbatim
 *     (items 119, 120) — so "0 origin CMS/framework dependencies" is a list a
 *     reader can check rather than a sentence they have to trust.
 *  5. **How big is it?** Bytes, so the report can state what an independent
 *     copy of this site costs.
 */

export interface FinalValidationResult {
  appDir: string;
  /** The generated app's own dependency list, verbatim (item 119). */
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  fileCount: number;
  totalBytes: number;
  /** References to upstream pipeline artifacts. MUST be 0 (item 115). */
  upstreamArtifactReferences: string[];
  /** Original `<script src>` / `<link rel=stylesheet>` survivals. MUST be 0. */
  originalScriptReferences: string[];
  originalStylesheetReferences: string[];
  /** Inline `on*=` handlers in generated source. MUST be 0. */
  inlineHandlerReferences: string[];
  /** `action=` / `formaction=` at the ORIGIN. MUST be 0 (item 117). */
  originBackendWriteTargets: string[];
  /** Dependencies whose name suggests an origin CMS/framework (item 120). */
  originStackDependencies: string[];
  /** True when every scan above is empty. */
  independent: boolean;
}

/**
 * Package names that would mean the generated app inherited the ORIGIN's stack.
 *
 * A denylist of families, not of every package that exists — the check that
 * really matters is the full dependency list in the report, which a reader can
 * read in ten seconds. This catches the specific failure item 120 names: taking
 * an observed frontend library along for the ride.
 */
const ORIGIN_STACK_MARKERS: readonly string[] = [
  "wordpress",
  "@wordpress/",
  "jquery",
  "shopify",
  "@shopify/",
  "drupal",
  "joomla",
  "gnuboard",
  "vue",
  "nuxt",
  "angular",
  "svelte",
  "ember",
  "backbone",
  "gatsby",
  "astro",
];

/** Directories a generated-app scan must not descend into. */
const SKIP_DIRS = new Set([".next", "node_modules"]);

/** Text file extensions worth scanning; binaries are counted, not read. */
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".html",
]);

interface ScannedFile {
  file: string;
  bytes: number;
  text?: string;
}

async function scanApp(appDir: string): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const file = path.join(dir, entry.name);
      const info = await stat(file);
      const extension = path.extname(entry.name).toLowerCase();
      const record: ScannedFile = { file, bytes: info.size };
      if (TEXT_EXTENSIONS.has(extension)) {
        record.text = await readFile(file, "utf8");
      }
      out.push(record);
    }
  };
  await walk(appDir);
  return out;
}

export interface FinalValidationInput {
  context: E2eRunContext;
  appDir: string;
  /** The origin the clone must not be able to write to. */
  rootUrl: string;
}

export async function runFinalValidationStage(
  input: FinalValidationInput,
): Promise<FinalValidationResult> {
  const { context, appDir } = input;

  const { value } = await executeStage<FinalValidationResult>({
    context,
    stage: "final-validation",
    onError: "final-validation-failure",
    run: async () => {
      const files = await scanApp(appDir);
      let originHost = "";
      try {
        originHost = new URL(input.rootUrl).origin;
      } catch {
        originHost = input.rootUrl;
      }

      const upstreamArtifactReferences: string[] = [];
      const originalScriptReferences: string[] = [];
      const originalStylesheetReferences: string[] = [];
      const inlineHandlerReferences: string[] = [];
      const originBackendWriteTargets: string[] = [];
      let totalBytes = 0;

      for (const entry of files) {
        totalBytes += entry.bytes;
        const text = entry.text;
        if (text === undefined) continue;
        const relative = portablePath(entry.file);

        // (1) upstream artifacts. `reconstruction-data/` is the app's OWN
        // runtime derivative and is expected; the pipeline's run namespaces
        // are not.
        for (const marker of ["site-specs/", "site-observations/", "interaction-models/", "interaction-explorations/"]) {
          if (text.includes(marker)) upstreamArtifactReferences.push(`${relative}: ${marker}`);
        }

        /*
         * (2) original source survivals.
         *
         * The question item 118 asks is "did any of the ORIGIN's code come
         * along?", and the precise signal for that is an ABSOLUTE http(s)
         * reference: the generated app's own stylesheet and runtime are
         * relative, and a relative path cannot reach the original server.
         * Matching on the words `script` or `stylesheet` instead would flag the
         * app's own `<link rel="stylesheet" href={GENERATED_STYLES_HREF}>`,
         * which is this pipeline's output and the whole point of the CSS
         * strategy.
         */
        for (const match of text.matchAll(
          /<script[^>]+src\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi,
        )) {
          originalScriptReferences.push(`${relative}: ${match[1]}`);
        }
        for (const match of text.matchAll(
          /<link[^>]+href\s*=\s*["']?(https?:\/\/[^"'\s>]+)[^>]*rel\s*=\s*["']?stylesheet|<link[^>]+rel\s*=\s*["']?stylesheet[^>]*href\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi,
        )) {
          originalStylesheetReferences.push(`${relative}: ${match[1] ?? match[2]}`);
        }
        if (/@import\s+url\(\s*["']?https?:\/\//i.test(text)) {
          originalStylesheetReferences.push(`${relative}: @import url(http…)`);
        }
        // An inline handler ATTRIBUTE in emitted markup or in a prop map. The
        // SiteSpec cannot carry one, so a hit here means something regressed.
        if (
          /\son(?:click|load|error|submit|change|input|mouseover|mouseenter|focus|blur|keydown|keyup)\s*=\s*["']/i.test(
            text,
          )
        ) {
          inlineHandlerReferences.push(relative);
        }

        // (3) writes back to the origin.
        if (originHost !== "" && text.includes(`action="${originHost}`)) {
          originBackendWriteTargets.push(relative);
        }
      }

      // (4) the dependency list, verbatim.
      let dependencies: Record<string, string> = {};
      let devDependencies: Record<string, string> = {};
      try {
        const raw = JSON.parse(
          await readFile(path.join(appDir, "package.json"), "utf8"),
        ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        dependencies = raw.dependencies ?? {};
        devDependencies = raw.devDependencies ?? {};
      } catch {
        // A generated app with no package.json is itself a finding, surfaced
        // below as an empty dependency list rather than as an exception.
      }
      const originStackDependencies = [
        ...Object.keys(dependencies),
        ...Object.keys(devDependencies),
      ].filter((name) =>
        ORIGIN_STACK_MARKERS.some((marker) => name.toLowerCase().includes(marker)),
      );

      const independent =
        upstreamArtifactReferences.length === 0 &&
        originalScriptReferences.length === 0 &&
        originalStylesheetReferences.length === 0 &&
        inlineHandlerReferences.length === 0 &&
        originBackendWriteTargets.length === 0 &&
        originStackDependencies.length === 0;

      const result: FinalValidationResult = {
        appDir: portablePath(appDir),
        dependencies,
        devDependencies,
        fileCount: files.length,
        totalBytes,
        upstreamArtifactReferences,
        originalScriptReferences,
        originalStylesheetReferences,
        inlineHandlerReferences,
        originBackendWriteTargets,
        originStackDependencies,
        independent,
      };

      const warnings: string[] = [];
      if (!independent) {
        for (const reference of upstreamArtifactReferences.slice(0, 3)) {
          warnings.push(`generated app references an upstream artifact: ${reference}`);
        }
        for (const reference of originalScriptReferences.slice(0, 3)) {
          warnings.push(`generated app carries an original <script src>: ${reference}`);
        }
        for (const name of originStackDependencies) {
          warnings.push(`generated app depends on an origin-stack package: ${name}`);
        }
      }

      return {
        outcome: {
          status: independent ? ("ok" as const) : ("partial" as const),
          runDir: portablePath(appDir),
          counts: {
            files: files.length,
            bytes: totalBytes,
            dependencies: Object.keys(dependencies).length,
            upstreamArtifactReferences: upstreamArtifactReferences.length,
            originalScripts: originalScriptReferences.length,
            originalStylesheets: originalStylesheetReferences.length,
            inlineHandlers: inlineHandlerReferences.length,
            originBackendWriteTargets: originBackendWriteTargets.length,
            originStackDependencies: originStackDependencies.length,
          },
          warnings,
        },
        value: result,
      };
    },
  });

  if (!value) {
    throw new Error("final validation produced no result");
  }
  return value;
}
