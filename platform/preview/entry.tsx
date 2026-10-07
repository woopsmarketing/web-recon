import type { ReactElement } from "react";
import type { SnapshotAsset } from "../assets/assets";
import { CategoriesDocSchema, ProjectSchema, ProjectsDocSchema, projectAssetRefs, type Project } from "../content/schema";
import { EXPORT_SCHEMA, PortfolioExportSchema, type ExportAsset } from "../portfolio-sync/contract";
import type { CreateSiteContextInput, SiteContext } from "../site/context";
import type { SiteInstance, SiteSnapshot } from "../site/instance";

/**
 * Project preview renderer — the code inside a PREVIEW RENDERER KIT (platform/preview/kit.ts bundles
 * it, with one site's shell and that site's pinned Template Release, into one import-free file).
 *
 * BoostChat's admin shows an unpublished 시공사례 "as the homepage will show it". The page is the
 * output of `next build` over the pinned release and cannot be produced at BoostChat's runtime; the
 * SECTION render path can, because it is pure: a site snapshot → createSiteContext → the release's
 * own data function → the release's own component. This module is that path for ONE project:
 *
 *   one export record  →  the same content model the publisher applies  →  a one-project site
 *   snapshot (preview mode)  →  the release's createSiteContext  →  portfolioDetail / <PortfolioDetail>
 *   and projectCards / <ProjectCard>, inside the release's own header and footer.
 *
 * What is checked, and with what. The publisher's generator (portfolio-sync/generate.ts) exposes its
 * transform only as planManagedPortfolio, which needs the whole export, every image's bytes (size,
 * sha256 and magic number are verified) and the state of a site directory, and hashes with
 * node:crypto — none of which exists where a preview runs. So this module calls the schemas that
 * function calls, in the order it calls them, and never restates a field rule:
 *   - PortfolioExportSchema (portfolio-sync/contract.ts) over a ONE-record export document made from
 *     the input: the wire shape of `categories` and `assets` is the contract's;
 *   - ProjectSchema, then ProjectsDocSchema / CategoriesDocSchema (content/schema.ts) — contract P1:
 *     the platform's content model is the definition of a record;
 *   - contract P2 (the record's category is one the export defines) and P3 (every image the record
 *     references is in `assets`), with projectAssetRefs.
 * A record is NOT mapped: the export record IS the site record (the generator writes the parsed
 * record into projects.json unchanged, and an export asset into the registry minus sha256/size/href).
 * platform/test/preview-parity.test.ts holds this module to that: it runs the real generator and a
 * real build over an export and compares their pages with this module's output for the same records.
 * Not checked here, because they are facts about a whole export or about bytes: `status` (a preview
 * shows a record that is not published yet), "no extra asset", file-name collisions, image bytes.
 *
 * Only asset MATERIALISATION differs from a build: a build copies each image to
 * /assets/<sha256[0:20]>.<ext>; a preview shows the URL the caller gives for that asset id.
 *
 * PURE: no filesystem, no network, no clock, no randomness, no environment. Never throws for bad
 * input — a refused record is `{ ok: false, problems }`.
 */

export interface PreviewProblem {
  /** where in the input, dot-joined: "project.title", "assets.2.width", "assetUrls.bi01-living-01", "(render)" */
  path: string;
  message: string;
}

export type ProjectPreviewResult =
  | {
      ok: true;
      /** the project's detail page (header · <main> · footer): one self-contained HTML document */
      detailHtml: string;
      /** the project's card as the portfolio list shows it: one self-contained HTML document */
      cardHtml: string;
    }
  | { ok: false; problems: PreviewProblem[] };

export interface ProjectPreviewInput {
  /** ONE item of the export's `projects[]` (BoostChat `TrackBProject`); validated with ProjectSchema */
  project: unknown;
  /** the export's `categories[]` */
  categories: unknown;
  /** the export's `assets[]` entries for the images this project references (extra entries are ignored) */
  assets: unknown;
  /** asset id → the URL the preview shows for it: http(s)://…, a root-relative /path, data:image/…, or blob:… */
  assetUrls: unknown;
}

/** A site-level asset the chrome renders (the header logo), embedded so the document needs no request for it. */
export interface PreviewShellAsset extends SnapshotAsset {
  dataUri: string;
}

/**
 * Everything of ONE site a preview needs that is not portfolio data — read once, by the kit builder,
 * from data/sites/<siteId>/ (platform/preview/kit.ts) and embedded in the kit.
 */
export interface PreviewShell {
  site: SiteInstance;
  settings: SiteSnapshot["settings"];
  theme?: SiteSnapshot["theme"];
  slots?: SiteSnapshot["slots"];
  inquiry?: SiteSnapshot["inquiry"];
  business: SiteSnapshot["content"]["business"];
  assets: PreviewShellAsset[];
}

/** What the kit says about itself (also exported by the kit as `kit`). No clock value, no commit. */
export interface PreviewKitInfo {
  kitFormat: 1;
  siteId: string;
  templateId: string;
  templateVersion: string;
  releaseId: string;
  releaseHash: string;
  templateCssSha256: string;
  /** sha256 of the embedded shell (canonical JSON): moves when the site's identity, settings, slots, theme, inquiry, business or logo change */
  shellSha256: string;
  /** site-level assets embedded in the kit, and the path each has on the public site */
  shellAssets: { id: string; publicPath: string }[];
}

/**
 * The pinned release's modules, as the kit builder binds them (the release's files, not the working
 * tree). Loosely typed on purpose: a release is frozen source of some earlier Template version.
 */
export interface PreviewRelease {
  template: CreateSiteContextInput<any>["template"];
  createSiteContext(input: CreateSiteContextInput<any>): SiteContext<any>;
  publicAssetPath(sha256: string, mediaType: SnapshotAsset["mediaType"]): string;
  portfolioDetail(ctx: any, project: any): any;
  PortfolioDetail(props: { data: any }): ReactElement;
  projectCards(ctx: any, items: readonly any[], opts: { level: 2 | 3; eagerCount: number; withSummary: boolean }): any[];
  ProjectCard(props: any): ReactElement;
  SiteHeader(props: { ctx: any; current?: any }): ReactElement;
  SiteFooter(props: { ctx: any }): ReactElement;
}

export interface PreviewKitDeps {
  release: PreviewRelease;
  /**
   * react-dom/server's renderToString, of the release-pinned react-dom. NOT renderToStaticMarkup: the
   * page is a hydratable render, which separates adjacent text nodes with `<!-- -->`; the same text
   * nodes are needed for the same pixels (a browser shapes each text node on its own, so "(" "3" ")"
   * and "(3)" are kerned differently). The comments are inert; no script is ever emitted.
   */
  renderToString(element: ReactElement): string;
  shell: PreviewShell;
  /** the release's styles/template.css, byte for byte */
  templateCss: string;
}

/**
 * The three things below are NOT section code — they are what the release's app/ files write around
 * the sections, restated here because app/ pages only run inside Next (getSiteContext, notFound, a
 * CSS import). The parity test compares all of them with a real build, so a release that changes one
 * fails there:
 *   app/portfolio/[slug]/page.tsx   <SiteHeader current="portfolio-section" /> + <main className="i1-main">
 *   sections/PortfolioIndex.tsx     projectCards(…, { level: 2, eagerCount: 3, withSummary: true }) inside
 *                                   section.i1-plist > div.i1-container > ul.i1-plist__grid
 *   app/layout.tsx                  <html lang> · <style id="site-theme"> · {children} · <SiteFooter />
 */
const DETAIL_HEADER_CURRENT = "portfolio-section";
const MAIN_CLASS = "i1-main";
const LIST_CARD_OPTIONS = { level: 2, eagerCount: 3, withSummary: true } as const;

/** createSiteContext takes the build instant only to record it; nothing in a preview depends on time. */
const PREVIEW_AT = "1970-01-01T00:00:00.000Z";

/**
 * PREVIEW-ONLY, outside <main>, marked `data-preview-only`: links do not navigate (the document is
 * shown in an iframe; a click would load the admin's own /portfolio there). Pointer only — nothing
 * can be done about the keyboard without a script or touching the markup.
 */
const PREVIEW_ONLY_CSS = "a[href]{pointer-events:none!important;cursor:default!important}";

/** what a preview image URL may be: fetched as an image by the browser, never interpreted as markup */
const DISPLAY_URL_RE = /^(?:https?:\/\/[^\s]+|\/(?!\/)[^\s]*|data:image\/(?:jpeg|png|webp|svg\+xml)[;,][^\s]*|blob:[^\s]+)$/;

const INPUT_KEYS = ["project", "categories", "assets", "assetUrls"] as const;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

type Issues = { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
function pushIssues(problems: PreviewProblem[], error: Issues, rename: (path: string[]) => string[]) {
  for (const issue of error.issues) problems.push({ path: rename(issue.path.map(String)).join(".") || "(input)", message: issue.message });
}

interface CheckedInput {
  project: Project;
  categories: { id: string; name: string }[];
  /** the export assets this project references, by id */
  assets: ExportAsset[];
  /** asset id → display URL: the caller's, plus each embedded site-level asset the caller did not override */
  urls: Map<string, string>;
}

function checkInput(shell: PreviewShell, input: unknown): { ok: true; value: CheckedInput } | { ok: false; problems: PreviewProblem[] } {
  const problems: PreviewProblem[] = [];
  if (!isRecord(input)) return { ok: false, problems: [{ path: "(input)", message: "expected an object { project, categories, assets, assetUrls }" }] };
  for (const key of Object.keys(input)) if (!(INPUT_KEYS as readonly string[]).includes(key)) problems.push({ path: key, message: "unknown input key" });

  // the wire shape of categories[] and assets[]: the publisher contract's own export schema, over a one-record export
  const wire = PortfolioExportSchema.safeParse({
    schema: EXPORT_SCHEMA,
    site: { siteId: shell.site.siteId, publicOrigin: shell.site.identity.publicOrigin, contentOrigin: "customer" },
    revision: 0,
    liveRevision: 0,
    categories: input.categories,
    projects: [input.project],
    assets: input.assets,
    changes: { publishing: [], removing: [] },
  });
  if (!wire.success) pushIssues(problems, wire.error, (p) => p);

  // contract P1: the record through the platform's own content model
  const parsed = ProjectSchema.safeParse(input.project);
  if (!parsed.success) pushIssues(problems, parsed.error, (p) => ["project", ...p]);

  if (!isRecord(input.assetUrls)) problems.push({ path: "assetUrls", message: "expected an object: asset id → URL" });
  if (!wire.success || !parsed.success || !isRecord(input.assetUrls)) return { ok: false, problems };
  const project = parsed.data;
  const { categories, assets } = wire.data;

  const projectsDoc = ProjectsDocSchema.safeParse({ schema: "projects@1", origin: "customer", items: [project] });
  if (!projectsDoc.success) pushIssues(problems, projectsDoc.error, (p) => ["project", ...p.slice(2)]);
  const categoriesDoc = CategoriesDocSchema.safeParse({ schema: "categories@1", origin: "customer", items: categories });
  if (!categoriesDoc.success) pushIssues(problems, categoriesDoc.error, (p) => ["categories", ...p.slice(1)]);
  // contract P2
  if (!categories.some((c) => c.id === project.category)) {
    problems.push({ path: "project.category", message: `category "${project.category}" is not one the export defines (contract P2)` });
  }

  // contract P3: every referenced image is described by exactly one asset entry
  const byId = new Map<string, ExportAsset>();
  assets.forEach((a, i) => {
    if (byId.has(a.id)) problems.push({ path: `assets.${i}.id`, message: `assets lists id "${a.id}" twice` });
    byId.set(a.id, a);
  });
  const shellIds = new Set(shell.assets.map((a) => a.id));
  const referenced = [...new Set(projectAssetRefs(project))].sort(compare);
  const urls = new Map<string, string>();
  for (const a of shell.assets) urls.set(a.id, a.dataUri);
  for (const ref of referenced) {
    if (!byId.has(ref)) problems.push({ path: "assets", message: `asset "${ref}" is referenced by the project but missing from assets (contract P3)` });
    if (shellIds.has(ref)) problems.push({ path: "assets", message: `asset id "${ref}" collides with a site-level asset of the same id` });
    if (!Object.hasOwn(input.assetUrls, ref)) problems.push({ path: `assetUrls.${ref}`, message: `no URL for asset "${ref}"` });
  }
  for (const [id, url] of Object.entries(input.assetUrls)) {
    // a URL for an asset nothing renders is ignored; one that is rendered must be an image URL
    if (!referenced.includes(id) && !shellIds.has(id)) continue;
    if (typeof url !== "string" || !DISPLAY_URL_RE.test(url)) {
      problems.push({ path: `assetUrls.${id}`, message: "expected an http(s) URL, a root-relative /path, a data:image/… URI or a blob: URL" });
      continue;
    }
    urls.set(id, url);
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: { project, categories, assets: referenced.map((ref) => byId.get(ref)!), urls } };
}

/**
 * One complete document, rendered by React as app/layout.tsx renders the site's: <html lang>, a
 * <head> and the body. The <head> holds what the page's own head holds that affects rendering, in
 * the page's cascade order (the template stylesheet, then the site theme) — and no script; `charset`
 * and `viewport` are Next's defaults. React adds its image preloads there, as it does on the page.
 * Everything marked data-preview-only is this module's, not the site's.
 */
function renderDocument(deps: PreviewKitDeps, opts: { lang: string; title: string; themeCss: string; body: ReactElement }): string {
  const html = deps.renderToString(
    <html lang={opts.lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex,nofollow" />
        <title>{opts.title}</title>
        <style id="template-css" dangerouslySetInnerHTML={{ __html: deps.templateCss }} />
        <style id="site-theme" dangerouslySetInnerHTML={{ __html: opts.themeCss }} />
        <style id="preview-only" data-preview-only="" dangerouslySetInnerHTML={{ __html: PREVIEW_ONLY_CSS }} />
      </head>
      <body>{opts.body}</body>
    </html>,
  );
  return `<!DOCTYPE html>${html}`;
}

function render(deps: PreviewKitDeps, input: CheckedInput): ProjectPreviewResult {
  const { release: R, shell } = deps;
  const snapshot = {
    schemaVersion: 1,
    siteId: shell.site.siteId,
    mode: "preview",
    site: shell.site,
    settings: shell.settings,
    ...(shell.theme ? { theme: shell.theme } : {}),
    ...(shell.slots ? { slots: shell.slots } : {}),
    // no headScripts: a preview loads no third-party script
    ...(shell.inquiry ? { inquiry: shell.inquiry } : {}),
    content: {
      business: shell.business,
      projects: [input.project],
      categories: [...input.categories].sort((a, b) => compare(a.id, b.id)),
    },
    assets: [
      ...shell.assets.map(({ dataUri: _d, ...asset }) => asset),
      // exactly what the generator writes to the registry and the loader adds: the build's own public path
      ...input.assets.map((a) => ({ id: a.id, file: a.file, mediaType: a.mediaType, width: a.width, height: a.height, sha256: a.sha256, publicPath: R.publicAssetPath(a.sha256, a.mediaType) })),
    ].sort((a, b) => compare(a.id, b.id)),
  };
  const built = R.createSiteContext({ siteId: shell.site.siteId, template: R.template, templateRelease: shell.site.template, mode: "preview", at: PREVIEW_AT, snapshot });
  // the ONE difference from a build: an asset resolves to the caller's URL instead of its /assets/ path
  const ctx = {
    ...built,
    assets: {
      resolve(ref: string) {
        const resolved = built.assets.resolve(ref);
        const url = input.urls.get(ref);
        return url === undefined ? resolved : { ...resolved, src: url };
      },
    },
  };
  // as the page does: the record as the site context serves it
  const project = ctx.content.getBySlug("projects", input.project.slug);
  if (!project) return { ok: false, problems: [{ path: "project.slug", message: `the site context does not serve "${input.project.slug}"` }] };
  if (/<\/style/i.test(ctx.themeCss)) return { ok: false, problems: [{ path: "(render)", message: "the site theme cannot be inlined" }] };

  const detailBody = (
    <>
      <R.SiteHeader ctx={ctx} current={DETAIL_HEADER_CURRENT} />
      <main className={MAIN_CLASS}>
        <R.PortfolioDetail data={R.portfolioDetail(ctx, project)} />
      </main>
      <R.SiteFooter ctx={ctx} />
    </>
  );
  const [card] = R.projectCards(ctx, [project], LIST_CARD_OPTIONS);
  // The card inside the ancestors that lay it out on the list page — no header, footer, list title
  // or pager. The wrappers are this module's (data-preview-only); the <li> is the Template's.
  const cardBody = (
    <main className={MAIN_CLASS} data-preview-only="">
      <section className="i1-plist" data-preview-only="">
        <div className="i1-container" data-preview-only="">
          <ul className="i1-plist__grid" data-preview-only="">
            <R.ProjectCard {...card} />
          </ul>
        </div>
      </section>
    </main>
  );
  const doc = { lang: ctx.identity.locale, title: `${project.title} | ${ctx.identity.brandName}`, themeCss: ctx.themeCss };
  return { ok: true, detailHtml: renderDocument(deps, { ...doc, body: detailBody }), cardHtml: renderDocument(deps, { ...doc, body: cardBody }) };
}

export function createProjectPreviewRenderer(deps: PreviewKitDeps): (input: ProjectPreviewInput) => ProjectPreviewResult {
  return function renderProjectPreview(input) {
    try {
      const checked = checkInput(deps.shell, input);
      return checked.ok ? render(deps, checked.value) : checked;
    } catch (error) {
      // the release's own refusals (a reserved slug, a setting naming an unknown category, …) and anything unforeseen
      return { ok: false, problems: [{ path: "(render)", message: error instanceof Error ? error.message : String(error) }] };
    }
  };
}
