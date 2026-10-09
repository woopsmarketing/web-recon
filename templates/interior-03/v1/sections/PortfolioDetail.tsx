import Link from "next/link";
import { FactsTable, type FactRow } from "../components/portfolio/FactsTable";
import { PhotoStack, type PhotoGroup } from "../components/portfolio/PhotoStack";
import { propertyTypeText } from "../components/portfolio/vocabulary";
import { PageTitle } from "../components/ui/PageTitle";
import { SubVisual } from "../components/ui/SubVisual";
import { formatArea, formatCount, formatPeriod, formatTotalPrice } from "../lib/format";
import { assetMedia, type Media } from "../lib/media";
import { categoryNames } from "../lib/projects";
import { portfolioIndexLead, portfolioVisual } from "./PortfolioIndex";
import type { Ctx, ProjectItem } from "./types";

/**
 * portfolio.detail — one project (/portfolio/[slug]).
 *   portfolioDetail(ctx, project)    build-time data (only facts the record authors; nothing derived)
 *   <PortfolioDetail data={…} />     the section
 * Banner (title = the project's category) · page title block with the category name as a <p> ·
 * the subject box (the page's <h1> = project title) · the centred text block (summary, then every
 * body paragraph) · with `facts`: the facts table · the photo stack (cover first, then every
 * gallery image in group order, an asset shown once; `before` photos are not shown) · the dark
 * list button over a top rule → the list filtered to this category (only when the list exists).
 */
export interface PortfolioDetailData {
  categoryName: string;
  visual: { media?: Media; text?: string };
  lead?: string;
  title: string;
  paragraphs: string[];
  /** undefined = the facts table is off, or no fact is authored */
  facts?: FactRow[];
  photos: { label: string; groups: PhotoGroup[]; groupLabels: boolean };
  back?: { href: string; label: string };
}

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
    back: listLabel && ctx.routes.has("portfolio.index") ? { href: `/portfolio?category=${encodeURIComponent(p.category)}`, label: listLabel } : undefined,
  };
}

export function PortfolioDetail({ data }: { data: PortfolioDetailData }) {
  return (
    <div className="i3-pdetail" data-section="portfolio.detail">
      <SubVisual title={data.categoryName} text={data.visual.text} media={data.visual.media} />
      <div className="i3-content">
        <div className="i3-wrap">
          <PageTitle as="p" title={data.categoryName} lead={data.lead} />
          <article className="i3-page i3-pview" data-project={data.title}>
            <h1 className="i3-pview__subject">{data.title}</h1>
            {data.paragraphs.length > 0 ? (
              <div className="i3-pview__text" data-detail-text="">
                {data.paragraphs.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : null}
            {data.facts ? (
              <div className="i3-pview__facts">
                <FactsTable rows={data.facts} />
              </div>
            ) : null}
            <PhotoStack label={data.photos.label} groups={data.photos.groups} groupLabels={data.photos.groupLabels} />
            {data.back ? (
              <div className="i3-pview__actions">
                <Link href={data.back.href} className="i3-btn" data-detail-back="">
                  {data.back.label}
                </Link>
              </div>
            ) : null}
          </article>
        </div>
      </div>
    </div>
  );
}
