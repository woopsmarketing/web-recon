import { z } from "zod";

/**
 * Portfolio Publishing V2 — the INCREMENTAL portfolio data plane, Track B side.
 * (BoostChat docs/reports/portfolio-publishing-v2.md §2.2 package runtime inputs, §2.3 runtime kit.)
 *
 * A site whose tracked marker is `portfolio-source@2` (platform/portfolio-sync/managed.ts) is built
 * ONCE, without portfolio content, into a SHELL package:
 *
 *   - every portfolio-dependent page is a shell: the real page (header, footer, styles, scripts) with
 *     an empty placeholder where each portfolio-dependent section goes;
 *   - the package carries `_runtime/portfolio/runtime.json` (which release, which shell pages) and
 *     `_runtime/portfolio/shell.json` (the site snapshot the pages were built from — no projects, no
 *     categories, none of their images);
 *   - the pinned release's RUNTIME KIT (kit.ts → renderer.mjs, vendored by BoostChat) composes the
 *     final pages at publish time from those inputs and the published portfolio (entry.tsx).
 *
 * This module is the vocabulary all three parts share: the builder (build/site-build.ts), the kit
 * builder and the code inside a kit. Pure — zod only.
 *
 * What a Template must provide to be published this way (interior-02 1.1.0 is the first):
 *   1. a settings section `site.portfolio` with a boolean `shell` (default false). The BUILDER sets it
 *      for the shell build; a site may not author it. Template code reads it through the site context.
 *   2. `runtime/shell.ts` — import-free; exports `portfolioShell` (PortfolioShellDeclSchema): the
 *      reserved detail slug, the shell page of each portfolio route, the URL space the composed pages
 *      own. The builder reads it inside the build workspace (shell-plan.ts).
 *   3. `runtime/portfolio.ts` — exports `portfolioRuntime` (TemplatePortfolioRuntime, entry.tsx): the
 *      pages, their metadata and slot data for a site context, and the element of each slot.
 *   4. the DECLARATION, in its manifest (template.ts):
 *        portfolioRuntime: { supported: true, contract: "portfolio-runtime@1" }
 *      A release is recorded with the capability only after the release gate "portfolio-runtime-kit"
 *      (gate.ts) has bundled its kit and rendered with it; whether a release has the capability is
 *      asked of resolvePortfolioRuntime (capability.ts) — never found out by looking for 2 and 3.
 * Nothing here names a Template, a site or a section.
 */

export const RUNTIME_DIR = "_runtime/portfolio";
export const RUNTIME_FILE = `${RUNTIME_DIR}/runtime.json`;
export const SHELL_FILE = `${RUNTIME_DIR}/shell.json`;
export const RUNTIME_SCHEMA = "portfolio-runtime@1";
export const SHELL_SCHEMA = "portfolio-shell@1";
export const KIT_KIND = "portfolio-runtime";
export const KIT_FORMAT = 1;
/** the shape version of a Template's `portfolioShell` / `portfolioRuntime` this platform speaks */
export const TEMPLATE_RUNTIME_API = 1;

/** The settings switch the builder sets for a shell build (requirement 1 above). */
export const SHELL_SETTING = { section: "site.portfolio", key: "shell" } as const;
/** Template-relative modules (requirements 2 and 3). */
export const TEMPLATE_SHELL_MODULE = "runtime/shell.ts";
export const TEMPLATE_RUNTIME_MODULE = "runtime/portfolio.ts";

const PagePath = z.string().regex(/^\/(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)?$/, "a page path: /, or /segment(/segment)*");

/** `portfolioShell` of a Template's runtime/shell.ts. */
export const PortfolioShellDeclSchema = z
  .object({
    api: z.literal(TEMPLATE_RUNTIME_API),
    /** the reserved detail slug — must NOT be a valid record slug, so it can never collide with one */
    slug: z.string().regex(/^_[a-z0-9]+(?:-[a-z0-9]+)*$/, "a reserved slug starts with an underscore"),
    /** declared route key → the shell page the build emits for it */
    pages: z.array(z.object({ route: z.string().min(1), path: PagePath }).strict()).min(1),
    owned: z.object({ exact: z.array(z.string().startsWith("/")), prefixes: z.array(PagePath) }).strict(),
    /** id of the inline JSON <script> that carries a composed page's slot data */
    data: z.string().regex(/^[a-z][a-z0-9-]*$/),
  })
  .strict();
export type PortfolioShellDecl = z.infer<typeof PortfolioShellDeclSchema>;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);

/** `_runtime/portfolio/runtime.json` — contract §2.2, exactly these keys. */
export const RuntimeDocSchema = z
  .object({
    schema: z.literal(RUNTIME_SCHEMA),
    siteId: z.string().min(1),
    publicOrigin: z.string().min(1),
    template: z.object({ templateId: z.string().min(1), templateVersion: z.string().min(1), releaseId: z.string().min(1), releaseHash: Sha256 }).strict(),
    shell: z.literal(SHELL_FILE),
    shellPages: z.array(z.string().regex(/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.html$/)).min(1),
  })
  .strict();
export type RuntimeDoc = z.infer<typeof RuntimeDocSchema>;

/**
 * `_runtime/portfolio/shell.json` — the site snapshot of the shell build WITHOUT the builder's shell
 * switch: everything the release's createSiteContext needs of the site, minus the portfolio. The
 * snapshot itself is validated by the RELEASE's own schema (createSiteContext), not here.
 */
export const ShellDocSchema = z.object({ schema: z.literal(SHELL_SCHEMA), snapshot: z.record(z.string(), z.unknown()) }).strict();
export type ShellDoc = z.infer<typeof ShellDocSchema>;

/** The package file of a page path, as a Next static export names it ("/" → index.html, "/a/b" → a/b.html). */
export function pageFile(pagePath: string): string {
  return pagePath === "/" ? "index.html" : `${pagePath.replace(/^\//, "")}.html`;
}

/** The snapshot of the SHELL BUILD: the clean snapshot + the builder's shell switch. */
export function withShellSetting<S extends { settings: { overrides: Record<string, Record<string, unknown>> } }>(snapshot: S): S {
  return {
    ...snapshot,
    settings: {
      ...snapshot.settings,
      overrides: { ...snapshot.settings.overrides, [SHELL_SETTING.section]: { ...snapshot.settings.overrides[SHELL_SETTING.section], [SHELL_SETTING.key]: true } },
    },
  };
}

export function serializeRuntimeDoc(doc: RuntimeDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
export function serializeShellDoc(doc: ShellDoc): string {
  return `${JSON.stringify(doc)}\n`;
}
