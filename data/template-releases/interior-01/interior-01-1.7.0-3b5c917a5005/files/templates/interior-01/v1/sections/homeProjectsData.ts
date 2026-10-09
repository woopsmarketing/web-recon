import { projectsQuery } from "@platform/settings/settings";
import type { ProjectCardProps } from "../components/ProjectCard";
import { hasRoute } from "../lib/routes";
import { projectCards } from "./projectCards";
import type { Ctx } from "./types";

// 1.7.0: the showcase's DATA lives here, apart from its markup (HomeProjects.tsx), so that the
// section can be rendered in the browser from publish-time data (components/runtime/RuntimeSlot)
// without the settings schema reaching the page's scripts. The rule itself is unchanged.

/** The two homepage showcases: SAME projects collection, each with its own declared selection. */
export type ShowcaseSection = "home.projects-a" | "home.projects-b";
const ANCHOR: Record<ShowcaseSection, string> = { "home.projects-a": "projects", "home.projects-b": "projects-more" };

export interface HomeProjectsData {
  section: ShowcaseSection;
  anchor: string;
  title: string;
  description?: string[];
  cards: ProjectCardProps[];
  /** "view all" link — only when the portfolio list route exists in this build */
  more?: { href: string; label: string };
  labels: { previous: string; next: string };
}

/**
 * home.projects-a / home.projects-b — settings → closed query over `projects` → card
 * props. Returns undefined when disabled or when the selection is empty, so the page
 * renders NO wrapper at all (no empty section, no fake card).
 */
export function homeProjects(ctx: Ctx, section: ShowcaseSection): HomeProjectsData | undefined {
  const settings = ctx.settings[section];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list(projectsQuery(settings));
  if (items.length === 0) return undefined;
  const moreLabel = ctx.slots.text(section, "moreLabel");
  return {
    section,
    anchor: ANCHOR[section],
    title: ctx.slots.text(section, "title") ?? "",
    description: ctx.slots.richText(section, "description")?.paragraphs,
    cards: projectCards(ctx, items, { level: 3, eagerCount: 0, withSummary: true }),
    more: hasRoute(ctx, "portfolio.index") && moreLabel ? { href: "/portfolio", label: moreLabel } : undefined,
    labels: { previous: ctx.slots.text(section, "previousLabel") ?? "", next: ctx.slots.text(section, "nextLabel") ?? "" },
  };
}
