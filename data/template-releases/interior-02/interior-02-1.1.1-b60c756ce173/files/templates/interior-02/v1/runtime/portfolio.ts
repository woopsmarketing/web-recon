import { createElement, type ReactElement } from "react";
import type { Metadata } from "next";
import { SlotElement, SlotPlaceholder, SLOT_NAMES } from "../components/runtime/RuntimeSlot";
import { homeHero } from "../sections/HomeHero";
import { homeProjects } from "../sections/homeProjectsData";
import { homeKeywords } from "../sections/HomeKeywords";
import { homeRecent } from "../sections/homeRecentData";
import { portfolioIndex, portfolioIndexTitle } from "../sections/portfolioIndexData";
import { portfolioDetail } from "../sections/PortfolioDetail";
import { pageHref } from "../components/portfolio/Pager";
import { listedPaths } from "../lib/links";
import { projectHref } from "../lib/projects";
import { inheritedMetadata, pageMetadata, titleWithBrand } from "../lib/seo";
import type { Ctx, ProjectItem } from "../sections/types";
import { portfolioShell } from "./shell";

/**
 * Portfolio runtime (the template's side of INCREMENTAL portfolio publishing).
 *
 * ONE description of every portfolio-dependent page — its public path, the shell page it is composed
 * from, its metadata and the data of each of its runtime slots — used by
 *   - the app/ pages of an ordinary build (they render the slots from `slots`, export `metadata`), and
 *   - the release's runtime kit (platform/portfolio-runtime), which calls `portfolioRuntime` with a
 *     site context built from the published portfolio and composes the final pages from the shells.
 * So which slots a page has, what data feeds them and what its head says is written once, here.
 *
 * A slot value of `undefined` = the section is omitted on that page (no data / disabled).
 * Pure: everything comes from the site context.
 */
export interface RuntimePage {
  /** canonical public path ("/", "/portfolio", "/portfolio/page/2", "/portfolio/<slug>") */
  path: string;
  /** path of the shell page this page is composed from (runtime/shell.ts `pages`) */
  shell: string;
  /** exactly what the page's generateMetadata returns in an ordinary build */
  metadata: Metadata;
  /** slot name → section data, for every slot of the page */
  slots: Record<string, unknown>;
  /** detail pages: the record the page shows */
  project?: { id: string; slug: string };
}

const SHELL_PATH = Object.fromEntries(portfolioShell.pages.map((p) => [p.route, p.path])) as Record<(typeof portfolioShell.pages)[number]["route"], string>;

export function homePage(ctx: Ctx): RuntimePage {
  return {
    path: "/",
    shell: SHELL_PATH.home,
    metadata: pageMetadata(ctx, { title: ctx.identity.brandName, description: ctx.content.getSingleton("business").summary, path: "/" }),
    slots: {
      "home.hero": homeHero(ctx),
      "home.projects": homeProjects(ctx),
      "home.keywords": homeKeywords(ctx),
      "home.recent": homeRecent(ctx),
    },
  };
}

/**
 * Page `n` of the project list (1 = /portfolio); undefined when the list has no such page.
 * `emptyFirstPage`: see portfolioIndex — the runtime asks for it, an ordinary build does not.
 */
export function portfolioListPage(ctx: Ctx, n: number, options: { emptyFirstPage?: boolean } = {}): RuntimePage | undefined {
  const data = portfolioIndex(ctx, n, options);
  if (!data) return undefined;
  const path = pageHref(n);
  return {
    path,
    shell: SHELL_PATH["portfolio.index"],
    metadata: pageMetadata(ctx, { title: titleWithBrand(ctx, portfolioIndexTitle(ctx)), path }),
    slots: { "portfolio.index": data },
  };
}

export function portfolioDetailPage(ctx: Ctx, project: ProjectItem): RuntimePage {
  const path = projectHref(project);
  return {
    path,
    shell: SHELL_PATH["portfolio.detail"],
    // The content model has no per-item SEO fields: item title + brand, item summary.
    metadata: pageMetadata(ctx, { title: `${project.title} | ${ctx.identity.brandName}`, description: project.summary, path }),
    slots: { "portfolio.detail": portfolioDetail(ctx, project) },
    project: { id: project.id, slug: project.slug },
  };
}

/** What a SHELL page exports as metadata: nothing per page (explicit nulls, so nothing inherited is emitted either). */
export const SHELL_METADATA: Metadata = { title: null, description: null, alternates: null, openGraph: null, twitter: null };

export const portfolioRuntime = {
  api: 1,
  shell: portfolioShell,
  slots: SLOT_NAMES,
  /** what the layout gives every page as metadataBase (relative canonical / og URLs resolve against it) */
  metadataBase(ctx: Ctx): string | undefined {
    return ctx.identity.publicOrigin;
  },
  /**
   * Every portfolio-dependent page of the site, for a context that holds the published portfolio.
   * `metadata` here is what ends up in the head: the page's own over what the layout gives every
   * page (the merge Next.js does in a build). /portfolio exists even with nothing published.
   */
  pages(ctx: Ctx): RuntimePage[] {
    const pages: RuntimePage[] = [homePage(ctx)];
    for (let n = 1; ; n++) {
      const page = portfolioListPage(ctx, n, { emptyFirstPage: true });
      if (!page) break;
      pages.push(page);
    }
    for (const { slug } of ctx.routes.params("portfolio.detail")) {
      const project = ctx.content.getBySlug("projects", slug!);
      if (project) pages.push(portfolioDetailPage(ctx, project));
    }
    const inherited = inheritedMetadata(ctx);
    return pages.map((page) => ({ ...page, metadata: { ...inherited, ...page.metadata } }));
  },
  /** The sitemap entries — the rule of app/sitemap.ts. */
  sitemap(ctx: Ctx): { url: string }[] {
    const origin = ctx.identity.publicOrigin;
    if (!origin || ctx.mode === "preview") return [];
    return listedPaths(ctx).map((p) => ({ url: p === "/" ? `${origin}/` : `${origin}${p}` }));
  },
  /** What a composed page shows for a slot (the element the browser hydrates). */
  element(slot: string, data: unknown): ReactElement {
    return createElement(SlotElement, { slot, data });
  },
  /** What the shell build emitted where that slot goes. */
  placeholder(slot: string): ReactElement {
    return createElement(SlotPlaceholder, { slot });
  },
};
