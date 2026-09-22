import type { ProjectCardProps } from "../components/ProjectCard";
import type { Ctx, ProjectItem } from "./types";

/** Detail URL of a project — the one place that builds it (route "portfolio.detail"). */
export function projectHref(p: ProjectItem): string {
  return `/portfolio/${p.slug}`;
}

/** item → card props (shared by the home section and the portfolio list). */
export function projectCards(
  ctx: Ctx,
  items: readonly ProjectItem[],
  opts: { level: 2 | 3; eagerCount: number; withSummary: boolean },
): ProjectCardProps[] {
  const categoryName = new Map(ctx.content.list({ type: "categories" }).items.map((c) => [c.id, c.name]));
  return items.map((p, index) => ({
    id: p.id,
    title: p.title,
    href: projectHref(p),
    summary: opts.withSummary ? p.summary : undefined,
    category: categoryName.get(p.category),
    // the title already names the card link; no alt → decorative image, not a repeated title
    cover: { ...ctx.assets.resolve(p.cover.asset), alt: p.cover.alt ?? "" },
    eager: index < opts.eagerCount,
    level: opts.level,
  }));
}
