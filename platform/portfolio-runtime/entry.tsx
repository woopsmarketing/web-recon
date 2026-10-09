import type { ReactElement } from "react";
import { z } from "zod";
import type { SnapshotAsset } from "../assets/assets";
import type { CreateSiteContextInput, SiteContext } from "../site/context";
import { ComposeError, composePage, headTags, sitemapXml, splitPreloads } from "./compose";
import { KIT_FORMAT, KIT_KIND, RuntimeDocSchema, SHELL_SETTING, ShellDocSchema, TEMPLATE_RUNTIME_API, pageFile, type PortfolioShellDecl } from "./contract";

/**
 * Portfolio site renderer — the code inside a PORTFOLIO RUNTIME KIT (kit.ts bundles it with ONE
 * Template Release — its sections, components, runtime/portfolio.ts and its own copy of the platform
 * runtime — into one import-free file). Site-independent: the site arrives as data.
 *
 *   renderPortfolioSite({ runtime, shell, shellPages, portfolio, at })
 *     runtime, shell   the two documents of a shell package (_runtime/portfolio/*.json)
 *     shellPages       the shell pages of that package (file → HTML)
 *     portfolio        the published portfolio: categories, projects, assets (export@1 shapes)
 *     at               the instant of this publish (which records are visible)
 *   → every page of the site that depends on the portfolio, as final HTML, plus /sitemap.xml.
 *
 * How a page is made: shell snapshot + the visible records → a full site snapshot → the RELEASE's
 * createSiteContext → the release's runtime/portfolio.ts says which pages exist, what each one's
 * metadata is and what data each of its slots gets → each slot is rendered by the release's own
 * component (the element the browser hydrates) → the shell page's placeholders are replaced, the head
 * tags and the slot data are added (compose.ts).
 *
 * What is checked, and with what: the two documents with this module's schemas; every record,
 * category and asset with the RELEASE's own schemas (its content model is the definition of a
 * record), in the order the site loader applies them — visibility (published, not after `at`), the
 * record's category exists, every image it references is described. The composed snapshot is then
 * validated once more by the release's createSiteContext (reserved slugs, URL collisions, settings).
 *
 * PURE and synchronous: no filesystem, no network, no clock (only `at`), no randomness, no
 * environment. Never throws — a refused input is `{ ok: false, problems }`. Deterministic: the same
 * input gives the same bytes.
 */

export interface RuntimeProblem {
  /** where in the input, dot-joined: "portfolio.projects.3.title", "shellPages.portfolio.html", "(render)" */
  path: string;
  message: string;
}

export interface RenderedFile {
  /** canonical public URL path: "/", "/portfolio", "/portfolio/page/2", "/portfolio/<slug>", "/sitemap.xml" */
  path: string;
  contentType: string;
  body: string;
}

export type PortfolioSiteResult =
  | {
      ok: true;
      files: RenderedFile[];
      owned: { exact: string[]; prefixes: string[] };
      projects: { id: string; slug: string; path: string }[];
      assets: { id: string; publicPath: string }[];
    }
  | { ok: false; problems: RuntimeProblem[] };

export interface PortfolioSiteInput {
  runtime: unknown;
  shell: unknown;
  shellPages: Record<string, string>;
  portfolio: { categories: unknown; projects: unknown; assets: unknown };
  at: string;
}

/** What the kit says about itself (also exported by the kit as `kit`). No clock value, no commit. */
export interface RuntimeKitInfo {
  kitFormat: typeof KIT_FORMAT;
  kind: typeof KIT_KIND;
  templateId: string;
  templateVersion: string;
  releaseId: string;
  releaseHash: string;
}

/** One page, as the Template's runtime/portfolio.ts describes it. */
export interface TemplateRuntimePage {
  path: string;
  shell: string;
  metadata: unknown;
  slots: Record<string, unknown>;
  project?: { id: string; slug: string };
}

/** `portfolioRuntime` of a Template's runtime/portfolio.ts (api 1). */
export interface TemplatePortfolioRuntime {
  api: number;
  shell: PortfolioShellDecl;
  slots: readonly string[];
  metadataBase(ctx: any): string | undefined;
  pages(ctx: any): TemplateRuntimePage[];
  sitemap(ctx: any): { url: string }[];
  element(slot: string, data: unknown): ReactElement;
  placeholder(slot: string): ReactElement;
}

/** The release's modules, as the kit builder binds them. Loosely typed on purpose: a release is frozen source. */
export interface RuntimeRelease {
  template: CreateSiteContextInput<any>["template"];
  createSiteContext(input: CreateSiteContextInput<any>): SiteContext<any>;
  publicAssetPath(sha256: string, mediaType: SnapshotAsset["mediaType"]): string;
  ProjectSchema: z.ZodType<any>;
  CategorySchema: z.ZodType<any>;
  AssetEntrySchema: z.ZodObject<any>;
  projectAssetRefs(project: any): string[];
  portfolioRuntime: TemplatePortfolioRuntime;
}

export interface RuntimeKitDeps {
  kit: RuntimeKitInfo;
  release: RuntimeRelease;
  /** react-dom/server's renderToString of the release-pinned react-dom (a hydratable render, synchronous) */
  renderToString(element: ReactElement): string;
}

/** contract: the media types a published portfolio image may have (no SVG — those are site-level assets) */
const PORTFOLIO_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PROJECTS = 2000;
const MAX_ASSETS = 20_000;
const HTML = "text/html; charset=utf-8";
const XML = "application/xml";
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

type Issues = { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
function pushIssues(problems: RuntimeProblem[], error: Issues, prefix: string[]) {
  for (const issue of error.issues) problems.push({ path: [...prefix, ...issue.path.map(String)].join(".") || "(input)", message: issue.message });
}

class Refused extends Error {
  constructor(readonly problems: RuntimeProblem[]) {
    super("refused");
  }
}

function render(deps: RuntimeKitDeps, input: unknown): PortfolioSiteResult {
  const { release: R, kit } = deps;
  const P = R.portfolioRuntime;
  const problems: RuntimeProblem[] = [];
  const refuse = (path: string, message: string): never => {
    throw new Refused([{ path, message }]);
  };

  if (P.api !== TEMPLATE_RUNTIME_API) refuse("(kit)", `the release's portfolio runtime speaks api ${String(P.api)}, this kit ${TEMPLATE_RUNTIME_API}`);
  if (!isRecord(input)) return refuse("(input)", "expected an object { runtime, shell, shellPages, portfolio, at }");
  for (const key of Object.keys(input)) if (!["runtime", "shell", "shellPages", "portfolio", "at"].includes(key)) problems.push({ path: key, message: "unknown input key" });

  // ---- the two package documents
  const runtimeDoc = RuntimeDocSchema.safeParse(input.runtime);
  if (!runtimeDoc.success) pushIssues(problems, runtimeDoc.error, ["runtime"]);
  const shellDoc = ShellDocSchema.safeParse(input.shell);
  if (!shellDoc.success) pushIssues(problems, shellDoc.error, ["shell"]);
  if (typeof input.at !== "string" || !ISO_INSTANT.test(input.at) || Number.isNaN(Date.parse(input.at))) problems.push({ path: "at", message: "expected an ISO-8601 instant" });
  if (!isRecord(input.shellPages) || Object.values(input.shellPages).some((v) => typeof v !== "string")) problems.push({ path: "shellPages", message: "expected an object: shell page file → HTML text" });
  if (!isRecord(input.portfolio)) problems.push({ path: "portfolio", message: "expected an object { categories, projects, assets }" });
  if (problems.length > 0 || !runtimeDoc.success || !shellDoc.success) throw new Refused(problems);
  const runtime = runtimeDoc.data;
  const shellPages = input.shellPages as Record<string, string>;
  const portfolio = input.portfolio as Record<string, unknown>;
  const at = input.at as string;
  const atMs = Date.parse(at);

  // ---- a kit renders its own release only
  const t = runtime.template;
  if (t.releaseHash !== kit.releaseHash || t.releaseId !== kit.releaseId || t.templateId !== kit.templateId || t.templateVersion !== kit.templateVersion) {
    refuse("runtime.template", `the package was built with release ${t.releaseId} (${t.releaseHash.slice(0, 12)}), this kit renders ${kit.releaseId} (${kit.releaseHash.slice(0, 12)})`);
  }

  // ---- the shell snapshot: this site, this release, and really without a portfolio
  const snap = shellDoc.data.snapshot;
  const site = isRecord(snap.site) ? snap.site : {};
  const identity = isRecord(site.identity) ? site.identity : {};
  const pin = isRecord(site.template) ? site.template : {};
  const content = isRecord(snap.content) ? snap.content : {};
  const settings = isRecord(snap.settings) ? snap.settings : {};
  if (snap.siteId !== runtime.siteId) problems.push({ path: "shell.snapshot.siteId", message: `the shell is of site "${String(snap.siteId)}", the runtime document of "${runtime.siteId}"` });
  if (identity.publicOrigin !== runtime.publicOrigin) problems.push({ path: "shell.snapshot.site.identity.publicOrigin", message: "differs from runtime.publicOrigin" });
  if (pin.releaseHash !== kit.releaseHash) problems.push({ path: "shell.snapshot.site.template", message: "the shell pins another release than the runtime document names" });
  if (snap.mode !== "public") problems.push({ path: "shell.snapshot.mode", message: "a shell is a public build" });
  if (!Array.isArray(content.projects) || content.projects.length > 0 || !Array.isArray(content.categories) || content.categories.length > 0) {
    problems.push({ path: "shell.snapshot.content", message: "a shell holds no projects and no categories" });
  }
  if (isRecord(settings.overrides) && settings.overrides[SHELL_SETTING.section] !== undefined) problems.push({ path: `shell.snapshot.settings.overrides.${SHELL_SETTING.section}`, message: "the shell document must not carry the builder's shell switch" });
  if (!Array.isArray(snap.assets)) problems.push({ path: "shell.snapshot.assets", message: "expected an array" });

  // ---- the shell pages the Template composes from
  const shellFiles = P.shell.pages.map((p) => pageFile(p.path));
  for (const file of shellFiles) {
    if (!runtime.shellPages.includes(file)) problems.push({ path: "runtime.shellPages", message: `the package does not list the shell page ${file} this release composes from` });
    if (typeof shellPages[file] !== "string") problems.push({ path: `shellPages.${file}`, message: "the shell page was not supplied" });
  }
  if (problems.length > 0) throw new Refused(problems);

  // ---- the portfolio, through the release's own content model
  const categoriesParsed = z.array(R.CategorySchema).safeParse(portfolio.categories);
  if (!categoriesParsed.success) pushIssues(problems, categoriesParsed.error, ["portfolio", "categories"]);
  const AssetSchema = R.AssetEntrySchema.extend({
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().positive(),
    href: z.string().min(1).max(512).optional(),
  }).strict();
  const assetsParsed = z.array(AssetSchema).max(MAX_ASSETS).safeParse(portfolio.assets);
  if (!assetsParsed.success) pushIssues(problems, assetsParsed.error, ["portfolio", "assets"]);
  const rawProjects = portfolio.projects;
  if (!Array.isArray(rawProjects) || rawProjects.length > MAX_PROJECTS) problems.push({ path: "portfolio.projects", message: `expected an array of at most ${MAX_PROJECTS} records` });
  const projects: any[] = [];
  if (Array.isArray(rawProjects)) {
    rawProjects.forEach((raw, i) => {
      const parsed = R.ProjectSchema.safeParse(raw);
      if (parsed.success) projects.push(parsed.data);
      else pushIssues(problems, parsed.error, ["portfolio", "projects", String(i)]);
    });
  }
  if (problems.length > 0 || !categoriesParsed.success || !assetsParsed.success) throw new Refused(problems);
  const categories = categoriesParsed.data as { id: string; name: string }[];
  const assets = assetsParsed.data as { id: string; file: string; mediaType: SnapshotAsset["mediaType"]; width: number; height: number; sha256: string }[];

  const unique = (items: readonly string[], path: string, what: string) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item)) problems.push({ path, message: `${what} "${item}" is listed twice` });
      seen.add(item);
    }
  };
  unique(categories.map((c) => c.id), "portfolio.categories", "category id");
  unique(projects.map((p) => p.id), "portfolio.projects", "record id");
  unique(projects.map((p) => p.slug), "portfolio.projects", "slug");
  unique(assets.map((a) => a.id), "portfolio.assets", "asset id");
  assets.forEach((a, i) => {
    if (!PORTFOLIO_MEDIA_TYPES.includes(a.mediaType)) problems.push({ path: `portfolio.assets.${i}.mediaType`, message: `a portfolio image is one of ${PORTFOLIO_MEDIA_TYPES.join(", ")}` });
  });

  // the loader's visibility rule and order: published, not scheduled after `at`, by id
  const visible = projects.filter((p) => p.status === "published" && Date.parse(p.publishedAt) <= atMs).sort((a, b) => compare(a.id, b.id));
  const categoryIds = new Set(categories.map((c) => c.id));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const referenced = new Set<string>();
  for (const p of visible) {
    if (!categoryIds.has(p.category)) problems.push({ path: "portfolio.projects", message: `project "${p.id}" references unknown category "${p.category}"` });
    for (const ref of R.projectAssetRefs(p)) {
      if (!assetById.has(ref)) problems.push({ path: "portfolio.assets", message: `asset "${ref}" is referenced by project "${p.id}" but missing from assets` });
      referenced.add(ref);
    }
  }

  // site-level assets + the images the visible records reference, at the build's own public path
  const shellAssets = snap.assets as { id: string; sha256: string }[];
  const shellAssetById = new Map(shellAssets.map((a) => [a.id, a]));
  const portfolioAssets = [...referenced].sort(compare).flatMap((ref) => {
    const a = assetById.get(ref);
    if (!a) return [];
    const owned = shellAssetById.get(ref);
    if (owned && owned.sha256 !== a.sha256) problems.push({ path: "portfolio.assets", message: `asset id "${ref}" is also a site-level asset of this site, with other bytes` });
    return [{ id: a.id, file: a.file, mediaType: a.mediaType, width: a.width, height: a.height, sha256: a.sha256, publicPath: R.publicAssetPath(a.sha256, a.mediaType) }];
  });
  if (problems.length > 0) throw new Refused(problems);

  const snapshot = {
    ...snap,
    content: { ...content, projects: visible, categories: [...categories].sort((a, b) => compare(a.id, b.id)) },
    assets: [...shellAssets, ...portfolioAssets.filter((a) => !shellAssetById.has(a.id))].sort((a, b) => compare(a.id, b.id)),
  };
  const ctx = R.createSiteContext({ siteId: runtime.siteId, template: R.template, templateRelease: runtime.template, mode: "public", at, snapshot });

  // ---- the pages
  const base = P.metadataBase(ctx);
  const placeholderOf = new Map(P.slots.map((slot) => [slot, deps.renderToString(P.placeholder(slot))]));
  const owned = { exact: [...P.shell.owned.exact], prefixes: [...P.shell.owned.prefixes] };
  const isOwned = (path: string) => owned.exact.includes(path) || owned.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  const files: RenderedFile[] = [];
  const projectPages: { id: string; slug: string; path: string }[] = [];
  const seenPaths = new Set<string>();
  for (const page of P.pages(ctx)) {
    const where = `(page ${page.path})`;
    if (!/^\/(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)?$/.test(page.path) || !isOwned(page.path)) refuse(where, "the Template's runtime produced a page outside the URL space it owns");
    if (seenPaths.has(page.path)) refuse(where, "the Template's runtime produced this path twice");
    seenPaths.add(page.path);
    const shellFile = pageFile(page.shell);
    if (!shellFiles.includes(shellFile)) refuse(where, `composed from ${page.shell}, which is not a shell page of this release`);
    const slots: { placeholder: string; markup: string }[] = [];
    const data: Record<string, unknown> = {};
    const preloads: string[] = [];
    for (const slot of Object.keys(page.slots).sort(compare)) {
      const placeholder = placeholderOf.get(slot);
      if (placeholder === undefined) return refuse(where, `slot "${slot}" is not a runtime slot of this release`);
      const value = page.slots[slot];
      if (value === undefined) {
        slots.push({ placeholder, markup: "" });
        continue;
      }
      // exactly what the browser will parse back: the page is rendered from the data it carries
      const wire: unknown = JSON.parse(JSON.stringify(value));
      data[slot] = wire;
      const rendered = splitPreloads(deps.renderToString(P.element(slot, wire)));
      preloads.push(...rendered.preloads);
      slots.push({ placeholder, markup: rendered.markup });
    }
    try {
      const body = composePage(shellPages[shellFile]!, {
        slots,
        foreignPlaceholders: P.slots.filter((slot) => !Object.hasOwn(page.slots, slot)).map((slot) => placeholderOf.get(slot)!),
        head: headTags(page.metadata, base),
        preloads,
        data: { id: P.shell.data, json: JSON.stringify(data) },
      });
      files.push({ path: page.path, contentType: HTML, body });
    } catch (error) {
      if (error instanceof ComposeError) refuse(where, error.message);
      throw error;
    }
    if (page.project) projectPages.push({ id: page.project.id, slug: page.project.slug, path: page.path });
  }
  // one detail page per visible record, and nothing else
  const missing = visible.filter((p) => !projectPages.some((x) => x.id === p.id));
  if (missing.length > 0 || projectPages.length !== visible.length) refuse("(render)", `the Template's runtime did not produce exactly one detail page per record (${projectPages.length} pages, ${visible.length} records)`);

  files.push({ path: "/sitemap.xml", contentType: XML, body: sitemapXml(P.sitemap(ctx)) });
  if (!isOwned("/sitemap.xml")) refuse("(kit)", "the release does not own /sitemap.xml");

  return {
    ok: true,
    files: files.sort((a, b) => compare(a.path, b.path)),
    owned,
    projects: projectPages.sort((a, b) => compare(a.id, b.id)),
    assets: portfolioAssets.map((a) => ({ id: a.id, publicPath: a.publicPath })),
  };
}

export function createPortfolioSiteRenderer(deps: RuntimeKitDeps): (input: PortfolioSiteInput) => PortfolioSiteResult {
  return function renderPortfolioSite(input) {
    try {
      return render(deps, input);
    } catch (error) {
      if (error instanceof Refused) return { ok: false, problems: error.problems };
      // the release's own refusals (a reserved slug, a setting naming an unknown category, …) and anything unforeseen
      return { ok: false, problems: [{ path: "(render)", message: error instanceof Error ? error.message : String(error) }] };
    }
  };
}
