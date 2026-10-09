import { execFileSync } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { loadRelease, releaseDir, verifyRelease } from "../release/release";
import { sha256 } from "../util/hash";
import { KIT_FORMAT, KIT_KIND, TEMPLATE_RUNTIME_MODULE, TEMPLATE_SHELL_MODULE } from "./contract";
import type { RuntimeKitInfo } from "./entry";

/**
 * Portfolio runtime kit builder (`pnpm site:portfolio-runtime-kit --template <id> --release <id> --out <dir>`).
 *
 * A kit is two generated files that another application (BoostChat's publisher) vendors as committed
 * files and calls on its own server at publish time — nothing crosses at runtime:
 *
 *   renderer.mjs   ONE ESM file with no import at all: platform/portfolio-runtime/entry.tsx bundled
 *                  with ONE Template Release (its sections, components, runtime/portfolio.ts and its
 *                  own copy of the platform runtime) and the release-pinned react / react-dom / zod.
 *                  Exports `renderPortfolioSite` and `kit`.
 *   kit.json       what it was generated from, and the sha256 of renderer.mjs.
 *
 * A kit belongs to a RELEASE, not to a site: every site built as a shell with that release is
 * composed by the same kit (the site arrives as data — the two documents and the shell pages of its
 * package). The only input is the release store; no site directory is read.
 *
 * Reproducible: the same release and platform sources give byte-identical files. Nothing written
 * here carries a clock value; `sourceCommit` (kit.json only) is the caller's.
 */

export const RENDERER_FILE = "renderer.mjs";
export const KIT_FILE = "kit.json";

export class RuntimeKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeKitError";
  }
}

/** the checkout this module lives in: its platform/portfolio-runtime sources and its node_modules are what gets bundled */
const CODE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** What a release must contain to be composed at publish time, relative to its template directory / to the release root. */
const TEMPLATE_SURFACE = ["template.ts", TEMPLATE_SHELL_MODULE, TEMPLATE_RUNTIME_MODULE] as const;
const PLATFORM_SURFACE = ["platform/site/context.ts", "platform/assets/assets.ts", "platform/content/schema.ts"] as const;
/** the packages a kit bundles, at exactly the version the release's own manifest pins */
const PINNED_PACKAGES = ["react", "react-dom", "zod"] as const;
/** the generated entry of the bundle (never a file on disk) */
const GLUE_FILE = "portfolio-runtime-kit-entry.ts";
/** the module react-dom/server.browser takes renderToString from: the synchronous renderer — no stream, no scheduler, no MessageChannel */
const SYNC_RENDER_MODULE = "cjs/react-dom-server-legacy.browser.production.js";
const EXPORTS = ["kit", "renderPortfolioSite"];

/** react / react-dom / zod exactly as the release's own manifest pins them, from this checkout's node_modules. */
async function pinnedPackages(filesDir: string): Promise<{ dirs: Record<string, string>; versions: Record<string, string> }> {
  const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  const manifest = (await readJson(path.join(filesDir, "package.json"))) as { dependencies?: Record<string, string> };
  const dirs: Record<string, string> = {};
  const versions: Record<string, string> = {};
  for (const name of PINNED_PACKAGES) {
    const want = manifest.dependencies?.[name];
    if (!want || !/^\d+\.\d+\.\d+$/.test(want)) throw new RuntimeKitError(`the release's package.json does not pin ${name} to an exact version (${want ?? "absent"})`);
    const dir = await realpath(path.join(CODE_ROOT, "node_modules", name)).catch(() => undefined);
    if (!dir) throw new RuntimeKitError(`${name} is not installed in ${CODE_ROOT}`);
    const have = (await readJson(path.join(dir, "package.json"))).version;
    if (have !== want) throw new RuntimeKitError(`${name}: the release pins ${want} but this checkout has ${String(have)} installed; a kit must bundle the pinned version`);
    dirs[name] = dir;
    versions[name] = want;
  }
  // renderToString must still be the legacy browser build's (the module bundled below)
  const serverEntry = await readFile(path.join(dirs["react-dom"]!, "server.browser.js"), "utf8");
  if (!serverEntry.includes(`l = require('./${SYNC_RENDER_MODULE}')`) || !serverEntry.includes("exports.renderToString = l.renderToString")) {
    throw new RuntimeKitError(`react-dom ${versions["react-dom"]}: server.browser.js no longer takes renderToString from ${SYNC_RENDER_MODULE}`);
  }
  return { dirs, versions };
}

function sourceCommitOf(pathspecs: string[]): string {
  try {
    const git = (args: string[]) => execFileSync("git", ["-C", CODE_ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const head = git(["rev-parse", "HEAD"]);
    return git(["status", "--porcelain", "--", ...pathspecs]) === "" ? head : `${head}-dirty`;
  } catch {
    return "unknown";
  }
}

export interface RuntimeKit {
  info: RuntimeKitInfo;
  /** the two files, exactly as they are (to be) written */
  files: { [RENDERER_FILE]: string; [KIT_FILE]: string };
  /** renderer.mjs size in bytes */
  rendererBytes: number;
  /** every source file bundled into renderer.mjs, relative to this checkout */
  inputs: string[];
}

export async function buildRuntimeKit(opts: {
  /** the repository root that holds data/template-releases */
  repoRoot: string;
  templateId: string;
  releaseId: string;
  /** written to kit.json; default: this checkout's HEAD ("-dirty" when a kit input has uncommitted changes) */
  sourceCommit?: string;
}): Promise<RuntimeKit> {
  const release = await loadRelease(opts.repoRoot, opts.templateId, opts.releaseId);
  if (release.templateId !== opts.templateId || release.releaseId !== opts.releaseId) throw new RuntimeKitError(`the release store returned ${release.templateId}/${release.releaseId} for ${opts.templateId}/${opts.releaseId}`);
  await verifyRelease(opts.repoRoot, release);
  const templateRel = `templates/${release.templateId}/v${release.templateVersion.split(".")[0]}`;
  const have = new Set(release.files.map((f) => f.path));
  const missing = [...TEMPLATE_SURFACE.map((f) => `${templateRel}/${f}`), ...PLATFORM_SURFACE].filter((f) => !have.has(f));
  if (missing.length > 0) throw new RuntimeKitError(`release ${release.releaseId} cannot be composed at publish time: it has no ${missing.join(", ")}`);
  // the store may be reached through a symlink (a test root); the bundler names modules by their real path
  const filesDir = await realpath(path.join(releaseDir(opts.repoRoot, release.templateId, release.releaseId), "files"));
  const { dirs: packageDirs, versions } = await pinnedPackages(filesDir);

  const info: RuntimeKitInfo = {
    kitFormat: KIT_FORMAT,
    kind: KIT_KIND,
    templateId: release.templateId,
    templateVersion: release.templateVersion,
    releaseId: release.releaseId,
    releaseHash: release.releaseHash,
  };

  // The bundle's entry: binds platform/portfolio-runtime/entry.tsx to the RELEASE's modules
  // ("runtime-kit:release/…" is the release's files directory). Generated, never a file.
  const rel = `runtime-kit:release/${templateRel}`;
  const glue = [
    `import { createPortfolioSiteRenderer } from "./platform/portfolio-runtime/entry";`,
    `import { renderToString } from "runtime-kit:react-dom-server";`,
    `import template from "${rel}/template";`,
    `import { portfolioRuntime } from "${rel}/${TEMPLATE_RUNTIME_MODULE.replace(/\.tsx?$/, "")}";`,
    `import { createSiteContext } from "runtime-kit:release/platform/site/context";`,
    `import { AssetEntrySchema, publicAssetPath } from "runtime-kit:release/platform/assets/assets";`,
    `import { CategorySchema, ProjectSchema, projectAssetRefs } from "runtime-kit:release/platform/content/schema";`,
    `export const kit = ${JSON.stringify(info)};`,
    `export const renderPortfolioSite = createPortfolioSiteRenderer({`,
    `  kit,`,
    `  release: { template, createSiteContext, publicAssetPath, ProjectSchema, CategorySchema, AssetEntrySchema, projectAssetRefs, portfolioRuntime },`,
    `  renderToString,`,
    `});`,
    ``,
  ].join("\n");

  const SKIP = "runtime-kit-resolved";
  const plugin: esbuild.Plugin = {
    name: "portfolio-runtime-kit",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData === SKIP || args.kind === "entry-point") return undefined;
        const p = args.path;
        const through = (target: string, resolveDir: string) => build.resolve(target, { resolveDir, kind: args.kind, pluginData: SKIP });
        if (p.startsWith(".") || path.isAbsolute(p)) return undefined;
        // next/link cannot run outside Next: the anchor it renders (platform/preview/next-link-shim.tsx; the proof test holds every <a> to a real build)
        if (p === "next/link") return { path: path.join(CODE_ROOT, "platform/preview/next-link-shim.tsx") };
        if (p === "runtime-kit:react-dom-server") return { path: path.join(packageDirs["react-dom"]!, SYNC_RENDER_MODULE) };
        if (p.startsWith("runtime-kit:release/")) return through(`./${p.slice("runtime-kit:release/".length)}`, filesDir);
        // the release's template code reaches the platform runtime as @platform/* — the RELEASE's copy
        if (p.startsWith("@platform/")) {
          if (!args.importer.startsWith(`${filesDir}${path.sep}`)) return { errors: [{ text: `"${p}" imported from outside the release (${args.importer})` }] };
          return through(`./platform/${p.slice("@platform/".length)}`, filesDir);
        }
        const pkg = PINNED_PACKAGES.find((name) => p === name || p.startsWith(`${name}/`));
        if (pkg) return through(p, CODE_ROOT);
        // anything else (node:*, next/navigation, another package) has no place in an import-free renderer
        return { errors: [{ text: `"${p}" (imported by ${path.relative(CODE_ROOT, args.importer)}) cannot be part of a portfolio runtime kit` }] };
      });
    },
  };

  let result: esbuild.BuildResult<{ write: false; metafile: true }>;
  try {
    result = await esbuild.build({
      stdin: { contents: glue, resolveDir: CODE_ROOT, sourcefile: GLUE_FILE, loader: "ts" },
      absWorkingDir: CODE_ROOT,
      bundle: true,
      write: false,
      metafile: true,
      outfile: RENDERER_FILE,
      format: "esm",
      platform: "neutral",
      mainFields: ["module", "main"],
      target: "es2022",
      jsx: "automatic",
      // never a tsconfig found on disk (the release carries its own; path aliases are the plugin's job)
      tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } },
      define: { "process.env.NODE_ENV": '"production"' },
      minify: true,
      charset: "utf8",
      legalComments: "eof",
      logLevel: "silent",
      plugins: [plugin],
    });
  } catch (error) {
    const errors = (error as esbuild.BuildFailure).errors;
    const detail = errors?.length ? errors.map((e) => `${e.location ? `${e.location.file}:${e.location.line}: ` : ""}${e.text}`).join("\n  ") : (error as Error).message;
    throw new RuntimeKitError(`bundling ${release.releaseId} failed:\n  ${detail}`);
  }
  const output = result.outputFiles[0];
  const meta = Object.values(result.metafile.outputs)[0];
  if (result.outputFiles.length !== 1 || !output || !meta) throw new RuntimeKitError("the bundler did not produce exactly one file");
  if (meta.imports.length > 0) throw new RuntimeKitError(`renderer would import ${meta.imports.map((i) => i.path).join(", ")}: a kit must be import-free`);
  if (JSON.stringify([...meta.exports].sort()) !== JSON.stringify(EXPORTS)) throw new RuntimeKitError(`renderer exports ${meta.exports.join(", ")}`);
  const renderer = output.text;
  if (/\b__require\b|\bprocess\.env\b/.test(renderer)) throw new RuntimeKitError("renderer still refers to require / process.env");

  const inputs = Object.keys(result.metafile.inputs).filter((f) => f !== GLUE_FILE).sort();
  // "-dirty" = a kit input differs from the commit: this platform's sources (its tests are no input) or the release
  const sourceCommit = opts.sourceCommit ?? sourceCommitOf(["platform", ":(exclude)platform/test", "package.json", "pnpm-lock.yaml", `data/template-releases/${release.templateId}/${release.releaseId}`]);
  const kitJson = {
    ...info,
    sourceCommit,
    generatedBy: `web-recon platform/portfolio-runtime/kit.ts (pnpm site:portfolio-runtime-kit) · esbuild ${esbuild.version} · ${PINNED_PACKAGES.map((n) => `${n} ${versions[n]}`).join(" · ")}`,
    files: { [RENDERER_FILE]: sha256(renderer) },
  };
  return {
    info,
    files: { [RENDERER_FILE]: renderer, [KIT_FILE]: `${JSON.stringify(kitJson, null, 2)}\n` },
    rendererBytes: output.contents.length,
    inputs,
  };
}

/** Write a kit's two files into `outDir` (created if needed). Nothing else is touched. */
export async function writeRuntimeKit(kit: RuntimeKit, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, RENDERER_FILE), kit.files[RENDERER_FILE]);
  await writeFile(path.join(outDir, KIT_FILE), kit.files[KIT_FILE]);
}
