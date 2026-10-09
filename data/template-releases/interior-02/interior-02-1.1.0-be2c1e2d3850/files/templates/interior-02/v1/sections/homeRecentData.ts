import { projectsQuery } from "@platform/settings/settings";
import { portfolioHref } from "../components/home/shared";
import { projectCardModels } from "../lib/projects";
import type { HomeRecentData } from "./HomeRecent";
import type { Ctx } from "./types";

/** home.recent — a second declared selection over the same projects, as simpler cards. Disabled or empty → nothing. */
export function homeRecent(ctx: Ctx): HomeRecentData | undefined {
  const settings = ctx.settings["home.recent"];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list(projectsQuery(settings));
  if (items.length === 0) return undefined;
  const portfolio = portfolioHref(ctx);
  const moreLabel = ctx.slots.text("home.recent", "moreLabel");
  return {
    title: ctx.slots.text("home.recent", "title") ?? "",
    cards: projectCardModels(ctx, items),
    more: portfolio && moreLabel ? { href: portfolio, label: moreLabel } : undefined,
  };
}
