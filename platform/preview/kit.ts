import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import type { z } from "zod";
import { AssetRegistryDocSchema, publicAssetPath, svgProblems } from "../assets/assets";
import { BusinessDocSchema, SITE_ALLOWED_ORIGINS } from "../content/schema";
import { loadRelease, releaseDir, verifyRelease, type ReleaseRecord } from "../release/release";
import { SiteSettingsDocSchema } from "../settings/settings";
import { INQUIRY_FILE, SiteInquiryDocSchema } from "../site/inquiry";
import { loadSiteInstance, siteDir } from "../site/load";
import { SiteSlotsDocSchema } from "../slots/slots";
import { SiteThemeDocSchema } from "../theme/theme";
import { hashJson, sha256 } from "../util/hash";
import type { PreviewKitInfo, PreviewShell } from "./entry";

/**
 * Preview renderer kit builder (`pnpm site:preview-kit --site <siteId> --out <dir>`).
 *
 * A kit is two generated files that another application (BoostChat's admin) vendors as committed
 * files and calls on its own server — nothing crosses at runtime, nothing is published:
 *
 *   renderer.mjs   ONE ESM file with no import at all: platform/preview/entry.tsx bundled with
 *                  the site's PINNED Template Release (its sections, components and its own copy of
 *                  the platform runtime), the release-pinned react / react-dom / zod, the site's
 *                  shell and the release's stylesheet. Exports `renderProjectPreview` and `kit`.
 *   kit.json       what it was generated from, and the sha256 of renderer.mjs.
 *
 * Inputs, all read here and nowhere else:
 *   - the site SHELL: site.json (identity, pin), settings.json, theme.json, slots.json, inquiry.json,
 *     content/business.json and the logo — everything a detail page renders that is not portfolio
 *     data. Read directly, with the same schemas the site loader uses, and NOT through
 *     buildSiteSnapshot: that loads the portfolio, and a managed site without a generated portfolio
 *     (the demo, in a development checkout) refuses to load by design. A kit needs no portfolio.
 *     scripts.json is deliberately not read: a preview carries no third-party script.
 *   - the pinned release, loaded and re-hashed with the release store's own functions.
 *
 * Reproducible: the same shell, release and platform sources give byte-identical files. Nothing
 * written here carries a clock value; `sourceCommit` (kit.json only) is the caller's.
 */

export const KIT_FORMAT = 1;
export const RENDERER_FILE = "renderer.mjs";
export const KIT_FILE = "kit.json";

export class PreviewKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewKitError";
  }
}

/** the checkout this module lives in: its platform/preview sources and its node_modules are what gets bundled */
const CODE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** What a release must contain to be previewed, relative to its template directory / to the release root. */
const TEMPLATE_SURFACE = ["template.ts", "sections/PortfolioDetail.tsx", "sections/projectCards.ts", "components/ProjectCard.tsx", "sections/SiteHeader.tsx", "sections/SiteFooter.tsx"] as const;
const PLATFORM_SURFACE = ["platform/site/context.ts", "platform/assets/assets.ts"] as const;
const TEMPLATE_CSS = "styles/template.css";
/** the packages a kit bundles, at exactly the version the release's own manifest pins */
const PINNED_PACKAGES = ["react", "react-dom", "zod"] as const;
/** the generated entry of the bundle (never a file on disk) */
const GLUE_FILE = "preview-kit-entry.ts";
/** the module react-dom/server.browser takes renderToString from: the synchronous renderer — no stream, no scheduler, no MessageChannel */
const SYNC_RENDER_MODULE = "cjs/react-dom-server-legacy.browser.production.js";

async function readJson(file: string, optional = false): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (optional && (error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new PreviewKitError(`cannot read ${file}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(text, (key, value) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error(`forbidden key "${key}"`);
      return value;
    });
  } catch (error) {
    throw new PreviewKitError(`${file}: ${(error as Error).message}`);
  }
}

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, what: string): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new PreviewKitError(`${what} invalid: ${r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  return r.data;
}

/** The site shell, validated with the loader's own schemas and the loader's own cross-checks. Reads only. */
export async function readPreviewShell(repoRoot: string, siteId: string): Promise<{ shell: PreviewShell; files: string[] }> {
  const dir = siteDir(repoRoot, siteId);
  const site = await loadSiteInstance(repoRoot, siteId);
  if (!site.identity.publicOrigin) throw new PreviewKitError(`site "${siteId}" has no publicOrigin in site.json; a portfolio export cannot name it (contract P5)`);
  const files = ["site.json", "settings.json", "content/business.json"];

  const settings = parse(SiteSettingsDocSchema, await readJson(path.join(dir, "settings.json")), `${siteId}/settings.json`);
  if (settings.templateId !== site.template.templateId) throw new PreviewKitError(`${siteId}/settings.json is for template "${settings.templateId}" but the site is pinned to "${site.template.templateId}"`);
  const optional = async <S extends z.ZodTypeAny>(file: string, schema: S): Promise<z.output<S> | undefined> => {
    const raw = await readJson(path.join(dir, file), true);
    if (raw === undefined) return undefined;
    files.push(file);
    return parse(schema, raw, `${siteId}/${file}`);
  };
  const theme = await optional("theme.json", SiteThemeDocSchema);
  const slots = await optional("slots.json", SiteSlotsDocSchema);
  if (slots && slots.templateId !== site.template.templateId) throw new PreviewKitError(`${siteId}/slots.json is for template "${slots.templateId}" but the site is pinned to "${site.template.templateId}"`);
  const inquiry = await optional(INQUIRY_FILE, SiteInquiryDocSchema);
  const business = parse(BusinessDocSchema, await readJson(path.join(dir, "content/business.json")), `${siteId}/content/business.json`);
  if (!SITE_ALLOWED_ORIGINS.includes(business.origin)) throw new PreviewKitError(`${siteId}/content/business.json: origin "${business.origin}" is not allowed under data/sites/**`);

  // the one site-level asset the chrome of a detail page renders: the header logo
  const assets: PreviewShell["assets"] = [];
  if (site.identity.logo) {
    files.push("assets/registry.json");
    const registry = parse(AssetRegistryDocSchema, await readJson(path.join(dir, "assets/registry.json")), `${siteId}/assets/registry.json`);
    const entry = registry.items.find((a) => a.id === site.identity.logo);
    if (!entry) throw new PreviewKitError(`${siteId}: asset "${site.identity.logo}" (the logo) is not in assets/registry.json`);
    const assetsDir = path.join(dir, "assets");
    const file = path.join(assetsDir, entry.file);
    const st = await lstat(file).catch(() => undefined);
    if (!st?.isFile()) throw new PreviewKitError(`${siteId}: asset file for "${entry.id}" (${entry.file}) is missing or not a regular file`);
    if (!(await realpath(file)).startsWith(`${await realpath(assetsDir)}${path.sep}`)) throw new PreviewKitError(`${siteId}: asset "${entry.id}" escapes assets/`);
    const bytes = await readFile(file);
    if (entry.mediaType === "image/svg+xml") {
      const problems = svgProblems(bytes.toString("utf8"));
      if (problems.length) throw new PreviewKitError(`${siteId}: SVG asset "${entry.id}" is not inert/self-contained: ${problems.join(", ")}`);
    }
    const hash = sha256(bytes);
    files.push(`assets/${entry.file}`);
    assets.push({ ...entry, sha256: hash, publicPath: publicAssetPath(hash, entry.mediaType), dataUri: `data:${entry.mediaType};base64,${bytes.toString("base64")}` });
  }

  return {
    shell: { site, settings, ...(theme ? { theme } : {}), ...(slots ? { slots } : {}), ...(inquiry ? { inquiry } : {}), business: business.data, assets },
    files: files.sort(),
  };
}

async function pinnedRelease(repoRoot: string, shell: PreviewShell): Promise<{ release: ReleaseRecord; filesDir: string; templateRel: string }> {
  const pin = shell.site.template;
  const release = await loadRelease(repoRoot, pin.templateId, pin.releaseId);
  if (release.releaseHash !== pin.releaseHash || release.templateVersion !== pin.templateVersion || release.templateId !== pin.templateId) {
    throw new PreviewKitError(`release mismatch: pin ${pin.releaseId}/${pin.releaseHash.slice(0, 12)} ≠ stored release ${release.releaseId}/${release.releaseHash.slice(0, 12)}`);
  }
  await verifyRelease(repoRoot, release);
  const templateRel = `templates/${release.templateId}/v${release.templateVersion.split(".")[0]}`;
  const have = new Set(release.files.map((f) => f.path));
  const missing = [...TEMPLATE_SURFACE.map((f) => `${templateRel}/${f}`), `${templateRel}/${TEMPLATE_CSS}`, ...PLATFORM_SURFACE].filter((f) => !have.has(f));
  if (missing.length > 0) throw new PreviewKitError(`release ${release.releaseId} cannot be previewed: it has no ${missing.join(", ")}`);
  // one authored stylesheet is what a kit embeds; a release with another one is a layout this builder does not know
  const css = release.files.map((f) => f.path).filter((f) => f.endsWith(".css"));
  if (css.length !== 1) throw new PreviewKitError(`release ${release.releaseId} has ${css.length} stylesheets (${css.join(", ")}); a kit embeds exactly ${templateRel}/${TEMPLATE_CSS}`);
  // the store may be reached through a symlink (a test root); the bundler names modules by their real path
  return { release, filesDir: await realpath(path.join(releaseDir(repoRoot, release.templateId, release.releaseId), "files")), templateRel };
}

/** react / react-dom / zod exactly as the release's own manifest pins them, from this checkout's node_modules. */
async function pinnedPackages(filesDir: string): Promise<{ dirs: Record<string, string>; versions: Record<string, string> }> {
  const manifest = (await readJson(path.join(filesDir, "package.json"))) as { dependencies?: Record<string, string> };
  const dirs: Record<string, string> = {};
  const versions: Record<string, string> = {};
  for (const name of PINNED_PACKAGES) {
    const want = manifest.dependencies?.[name];
    if (!want || !/^\d+\.\d+\.\d+$/.test(want)) throw new PreviewKitError(`the release's package.json does not pin ${name} to an exact version (${want ?? "absent"})`);
    const dir = await realpath(path.join(CODE_ROOT, "node_modules", name)).catch(() => undefined);
    if (!dir) throw new PreviewKitError(`${name} is not installed in ${CODE_ROOT}`);
    const have = ((await readJson(path.join(dir, "package.json"))) as { version?: string }).version;
    if (have !== want) throw new PreviewKitError(`${name}: the release pins ${want} but this checkout has ${have} installed; a kit must bundle the pinned version`);
    dirs[name] = dir;
    versions[name] = want;
  }
  // renderToString must still be the legacy browser build's (the module bundled below)
  const serverEntry = await readFile(path.join(dirs["react-dom"]!, "server.browser.js"), "utf8");
  if (!serverEntry.includes(`l = require('./${SYNC_RENDER_MODULE}')`) || !serverEntry.includes("exports.renderToString = l.renderToString")) {
    throw new PreviewKitError(`react-dom ${versions["react-dom"]}: server.browser.js no longer takes renderToString from ${SYNC_RENDER_MODULE}`);
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

export interface PreviewKit {
  info: PreviewKitInfo;
  /** the two files, exactly as they are (to be) written */
  files: { [RENDERER_FILE]: string; [KIT_FILE]: string };
  /** renderer.mjs size in bytes */
  rendererBytes: number;
  /** every source file bundled into renderer.mjs, relative to this checkout */
  inputs: string[];
}

export async function buildPreviewKit(opts: {
  /** the repository root that holds data/sites/<siteId> and data/template-releases */
  repoRoot: string;
  siteId: string;
  /** written to kit.json; default: this checkout's HEAD ("-dirty" when a kit input has uncommitted changes) */
  sourceCommit?: string;
}): Promise<PreviewKit> {
  const { shell, files: shellFiles } = await readPreviewShell(opts.repoRoot, opts.siteId);
  const { release, filesDir, templateRel } = await pinnedRelease(opts.repoRoot, shell);
  const { dirs: packageDirs, versions } = await pinnedPackages(filesDir);

  const templateCss = await readFile(path.join(filesDir, templateRel, TEMPLATE_CSS), "utf8");
  if (/<\/style/i.test(templateCss)) throw new PreviewKitError(`${templateRel}/${TEMPLATE_CSS} contains "</style": it cannot be inlined`);
  if (/@import\b/i.test(templateCss) || /url\(\s*(?!["']?(?:data:|#))/i.test(templateCss)) {
    throw new PreviewKitError(`${templateRel}/${TEMPLATE_CSS} loads another resource (@import / url()): a kit's documents must be self-contained`);
  }

  const info: PreviewKitInfo = {
    kitFormat: KIT_FORMAT,
    siteId: shell.site.siteId,
    templateId: release.templateId,
    templateVersion: release.templateVersion,
    releaseId: release.releaseId,
    releaseHash: release.releaseHash,
    templateCssSha256: sha256(templateCss),
    shellSha256: hashJson(shell),
    shellAssets: shell.assets.map((a) => ({ id: a.id, publicPath: a.publicPath })),
  };

  // The bundle's entry: binds platform/preview/entry.tsx to the RELEASE's modules ("preview-kit:release/…"
  // is the release's files directory) and to the embedded shell + stylesheet. Generated, never a file.
  const rel = `preview-kit:release/${templateRel}`;
  const glue = [
    `import { createProjectPreviewRenderer } from "./platform/preview/entry";`,
    `import { renderToString } from "preview-kit:react-dom-server";`,
    `import template from "${rel}/template";`,
    `import { PortfolioDetail, portfolioDetail } from "${rel}/sections/PortfolioDetail";`,
    `import { projectCards } from "${rel}/sections/projectCards";`,
    `import { ProjectCard } from "${rel}/components/ProjectCard";`,
    `import { SiteHeader } from "${rel}/sections/SiteHeader";`,
    `import { SiteFooter } from "${rel}/sections/SiteFooter";`,
    `import { createSiteContext } from "preview-kit:release/platform/site/context";`,
    `import { publicAssetPath } from "preview-kit:release/platform/assets/assets";`,
    `export const kit = ${JSON.stringify(info)};`,
    `export const renderProjectPreview = createProjectPreviewRenderer({`,
    `  release: { template, createSiteContext, publicAssetPath, portfolioDetail, PortfolioDetail, projectCards, ProjectCard, SiteHeader, SiteFooter },`,
    `  renderToString,`,
    `  shell: ${JSON.stringify(shell)},`,
    `  templateCss: ${JSON.stringify(templateCss)},`,
    `});`,
    ``,
  ].join("\n");

  const SKIP = "preview-kit-resolved";
  const plugin: esbuild.Plugin = {
    name: "preview-kit",
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData === SKIP || args.kind === "entry-point") return undefined;
        const p = args.path;
        const through = (target: string, resolveDir: string) => build.resolve(target, { resolveDir, kind: args.kind, pluginData: SKIP });
        if (p.startsWith(".") || path.isAbsolute(p)) return undefined;
        // next/link cannot run outside Next: the anchor it renders (the parity test proves the shim)
        if (p === "next/link") return { path: path.join(CODE_ROOT, "platform/preview/next-link-shim.tsx") };
        if (p === "preview-kit:react-dom-server") return { path: path.join(packageDirs["react-dom"]!, SYNC_RENDER_MODULE) };
        if (p.startsWith("preview-kit:release/")) return through(`./${p.slice("preview-kit:release/".length)}`, filesDir);
        // the release's template code reaches the platform runtime as @platform/* — the RELEASE's copy
        if (p.startsWith("@platform/")) {
          if (!args.importer.startsWith(`${filesDir}${path.sep}`)) return { errors: [{ text: `"${p}" imported from outside the release (${args.importer})` }] };
          return through(`./platform/${p.slice("@platform/".length)}`, filesDir);
        }
        const pkg = PINNED_PACKAGES.find((name) => p === name || p.startsWith(`${name}/`));
        if (pkg) return through(p, CODE_ROOT);
        // anything else (node:*, next/navigation, another package) has no place in an import-free renderer
        return { errors: [{ text: `"${p}" (imported by ${path.relative(CODE_ROOT, args.importer)}) cannot be part of a preview kit` }] };
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
    throw new PreviewKitError(`bundling ${release.releaseId} failed:\n  ${detail}`);
  }
  const output = result.outputFiles[0];
  const meta = Object.values(result.metafile.outputs)[0];
  if (result.outputFiles.length !== 1 || !output || !meta) throw new PreviewKitError("the bundler did not produce exactly one file");
  if (meta.imports.length > 0) throw new PreviewKitError(`renderer would import ${meta.imports.map((i) => i.path).join(", ")}: a kit must be import-free`);
  if (JSON.stringify([...meta.exports].sort()) !== JSON.stringify(["kit", "renderProjectPreview"])) throw new PreviewKitError(`renderer exports ${meta.exports.join(", ")}`);
  const renderer = output.text;
  if (/\b__require\b|\bprocess\.env\b/.test(renderer)) throw new PreviewKitError("renderer still refers to require / process.env");

  const inputs = Object.keys(result.metafile.inputs).filter((f) => f !== GLUE_FILE).sort();
  // "-dirty" = a kit input differs from the commit: this platform's sources, the release store, or
  // (when the site is read from this checkout) the shell files the kit embeds
  const ownSite = (await realpath(opts.repoRoot)) === (await realpath(CODE_ROOT));
  const sourceCommit =
    opts.sourceCommit ??
    sourceCommitOf(["platform", "package.json", "pnpm-lock.yaml", "data/template-releases", ...(ownSite ? shellFiles.map((f) => `data/sites/${opts.siteId}/${f}`) : [])]);
  const kitJson = {
    ...info,
    sourceCommit,
    generatedBy: `web-recon platform/preview/kit.ts (pnpm site:preview-kit) · esbuild ${esbuild.version} · ${PINNED_PACKAGES.map((n) => `${n} ${versions[n]}`).join(" · ")}`,
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
export async function writePreviewKit(kit: PreviewKit, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, RENDERER_FILE), kit.files[RENDERER_FILE]);
  await writeFile(path.join(outDir, KIT_FILE), kit.files[KIT_FILE]);
}
