import { projectsQuery } from "@platform/settings/settings";
import { projectTypeText, propertyTypeText } from "../../../components/portfolio/vocabulary";
import { formatArea, formatCount } from "../../../lib/format";
import { homeProjects } from "../../../sections/homeProjectsData";
import type { Ctx } from "../../../sections/types";
import type { ShowcaseData, ShowcaseItem } from "./model";

/**
 * The data of every showcase variant — build / kit side, pure, plain JSON.
 *
 * Which projects, how many and in which order is the classic section's decision and stays so:
 * `homeProjects(ctx)` (settings `home.projects` → the closed query → card models) is asked first,
 * and when it shows nothing (section disabled, or no project) the variant shows nothing either —
 * no heading, no empty frame. The same query is then read once more for the record fields a card
 * model does not carry (project type, property type, duration); figures are written with the
 * detail page's formatters and named with the detail page's labels.
 */
export function showcaseData(ctx: Ctx): ShowcaseData | undefined {
  const classic = homeProjects(ctx);
  if (classic === undefined) return undefined;
  const records = new Map(ctx.content.list(projectsQuery(ctx.settings["home.projects"])).items.map((p) => [p.id, p]));
  const label = (key: string) => ctx.slots.text("portfolio.detail", key) ?? "";
  const locale = ctx.identity.locale;

  const items: ShowcaseItem[] = classic.cards.map((card) => {
    const p = records.get(card.id);
    return {
      id: card.id,
      href: card.href,
      title: card.title,
      summary: card.summary,
      category: card.category,
      projectType: p?.projectType ? projectTypeText(p.projectType, locale) : undefined,
      propertyType: p?.propertyType ? propertyTypeText(p.propertyType, locale) : undefined,
      location: card.location,
      area: p?.area ? formatArea(p.area) : undefined,
      duration: p?.durationWeeks !== undefined ? formatCount({ one: label("durationFormatOne"), other: label("durationFormat") }, p.durationWeeks) : undefined,
      cover: card.cover,
    };
  });

  return {
    title: classic.title,
    items,
    more: classic.more,
    labels: {
      category: label("categoryLabel"),
      projectType: label("projectTypeLabel"),
      propertyType: label("propertyTypeLabel"),
      location: label("locationLabel"),
      area: label("areaLabel"),
      duration: label("durationLabel"),
    },
  };
}
