import type { FactRow } from "../components/portfolio/FactsTable";
import type { PhotoGroup } from "../components/portfolio/PhotoStack";
import { propertyTypeText } from "../components/portfolio/vocabulary";
import { formatArea, formatCount, formatPeriod, formatTotalPrice } from "../lib/format";
import { assetMedia, type Media } from "../lib/media";
import { categoryNames } from "../lib/projects";
import { hasRoute } from "../lib/routes";
import type { PortfolioDetailData } from "./PortfolioDetail";
import { portfolioIndexLead, portfolioVisual } from "./portfolioIndexData";
import type { Ctx, ProjectItem } from "./types";

/** portfolio.detail — the data of one project page (see sections/PortfolioDetail.tsx). */
export function portfolioDetail(ctx: Ctx, p: ProjectItem): PortfolioDetailData {
  const t = (key: string) => ctx.slots.text("portfolio.detail", key);
  const s = (key: string) => t(key) ?? "";
  const locale = ctx.identity.locale;
  const categoryName = categoryNames(ctx).get(p.category) ?? p.category;
  const settings = ctx.settings["portfolio.detail"];

  let facts: FactRow[] | undefined;
  if (settings.facts) {
    const rows: FactRow[] = [];
    const row = (key: string, label: string, value: string | undefined) => {
      if (label && value) rows.push({ key, label, value });
    };
    row("category", s("categoryLabel"), categoryName);
    row("location", s("locationLabel"), p.location);
    row("area", s("areaLabel"), p.area ? formatArea(p.area) : undefined);
    row("propertyType", s("propertyTypeLabel"), p.propertyType ? propertyTypeText(p.propertyType, locale) : undefined);
    row("scope", s("scopeLabel"), p.scope && p.scope.length > 0 ? p.scope.join(", ") : undefined);
    const period = p.period ? formatPeriod(p.period) : undefined;
    const duration = p.durationWeeks !== undefined ? formatCount({ one: s("durationFormatOne"), other: s("durationFormat") }, p.durationWeeks) : undefined;
    row("period", s("periodLabel"), period && duration ? `${period} (${duration})` : (period ?? duration));
    row("builtYear", s("builtYearLabel"), p.builtYear !== undefined ? String(p.builtYear) : undefined);
    row("price", s("priceLabel"), p.totalPrice ? formatTotalPrice(p.totalPrice, locale) : undefined);
    row("styles", s("stylesLabel"), p.styles && p.styles.length > 0 ? p.styles.join(", ") : undefined);
    if (rows.length > 0) facts = rows;
  }

  // the cover opens the stack; a gallery image that repeats an asset already shown is skipped
  const seen = new Set<string>([p.cover.asset]);
  const groups: PhotoGroup[] = [{ images: [assetMedia(ctx, p.cover)] }];
  for (const g of p.galleryGroups ?? []) {
    const images: Media[] = [];
    for (const it of g.items) {
      if (seen.has(it.image.asset)) continue;
      seen.add(it.image.asset);
      images.push(assetMedia(ctx, it.image));
    }
    if (images.length > 0) groups.push({ name: g.name, images });
  }

  const listLabel = t("listLabel");
  return {
    categoryName,
    visual: portfolioVisual(ctx),
    lead: portfolioIndexLead(ctx),
    title: p.title,
    paragraphs: [...(p.summary ? [p.summary] : []), ...(p.body ?? [])],
    facts,
    photos: { label: s("photosLabel"), groups, groupLabels: settings.groupLabels },
    back: listLabel && hasRoute(ctx, "portfolio.index") ? { href: `/portfolio?category=${encodeURIComponent(p.category)}`, label: listLabel } : undefined,
  };
}
