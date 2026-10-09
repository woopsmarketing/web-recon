import { projectsQuery } from "@platform/settings/settings";
import { projectCardModels } from "../lib/projects";
import { hasRoute } from "../lib/routes";
import type { HomePortfolioData } from "./HomePortfolio";
import type { Ctx } from "./types";

/** home.portfolio — settings → closed query over `projects` → card models. Disabled or empty → nothing. */
export function homePortfolio(ctx: Ctx): HomePortfolioData | undefined {
  const settings = ctx.settings["home.portfolio"];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list(projectsQuery(settings));
  if (items.length === 0) return undefined;
  const moreLabel = ctx.slots.text("home.portfolio", "moreLabel");
  return {
    title: ctx.slots.text("home.portfolio", "title") ?? "",
    lead: ctx.slots.text("home.portfolio", "lead"),
    cards: projectCardModels(ctx, items),
    more: hasRoute(ctx, "portfolio.index") && moreLabel ? { href: "/portfolio", label: moreLabel } : undefined,
  };
}
