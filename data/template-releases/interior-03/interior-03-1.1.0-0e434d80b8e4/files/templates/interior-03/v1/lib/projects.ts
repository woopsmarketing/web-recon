import type { Ctx, ProjectItem } from "../sections/types";

/**
 * Project card model (SHELL shared block) — what a thumbnail card needs, from one served project.
 *   projectHref(project)               "/portfolio/<slug>" (the one place that builds it)
 *   projectCardModels(ctx, projects)   → ProjectCardModel[] (one category lookup)
 *   categoryNames(ctx)                 category id → name
 */
export interface ProjectCardModel {
  id: string;
  slug: string;
  href: string;
  title: string;
  /** category id and its name (the id when the site has no such category record) */
  category: string;
  categoryName: string;
  cover: { src: string; width: number; height: number; alt: string };
}

export function projectHref(p: { slug: string }): string {
  return `/portfolio/${p.slug}`;
}

export function categoryNames(ctx: Ctx): Map<string, string> {
  return new Map(ctx.content.list({ type: "categories" }).items.map((c) => [c.id, c.name]));
}

export function projectCardModels(ctx: Ctx, projects: readonly ProjectItem[]): ProjectCardModel[] {
  const names = categoryNames(ctx);
  return projects.map((p) => ({
    id: p.id,
    slug: p.slug,
    href: projectHref(p),
    title: p.title,
    category: p.category,
    categoryName: names.get(p.category) ?? p.category,
    // the title already names the card link; no alt → decorative image, not a repeated title
    cover: { ...ctx.assets.resolve(p.cover.asset), alt: p.cover.alt ?? "" },
  }));
}
