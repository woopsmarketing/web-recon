import { projectsQuery } from "@platform/settings/settings";
import { portfolioHref } from "../components/home/shared";
import { projectCardModels } from "../lib/projects";
import type { HomeProjectsData } from "./HomeProjects";
import type { Ctx } from "./types";

/** home.projects — settings → closed query over `projects` → card models. Disabled or empty → nothing. */
export function homeProjects(ctx: Ctx): HomeProjectsData | undefined {
  const settings = ctx.settings["home.projects"];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list(projectsQuery(settings));
  if (items.length === 0) return undefined;
  const portfolio = portfolioHref(ctx);
  const moreLabel = ctx.slots.text("home.projects", "moreLabel");
  return {
    title: ctx.slots.text("home.projects", "title") ?? "",
    cards: projectCardModels(ctx, items),
    more: portfolio && moreLabel ? { href: portfolio, label: moreLabel } : undefined,
    withheld: ctx.slots.text("home.projects", "withheldText") ?? "",
    builtLabel: ctx.slots.text("home.projects", "builtLabel"),
  };
}
