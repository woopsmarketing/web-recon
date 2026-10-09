import Link from "../components/ui/Link";
import { Carousel, type CarouselLabels } from "../components/ui/Carousel";
import { Icon } from "../components/ui/Icon";
import { ProjectCard } from "../components/ui/ProjectCard";
import { ProjectGallery, type GalleryGroupData, type GalleryImage, type GalleryLabels } from "../components/portfolio/ProjectGallery";
import { TotalBlock } from "../components/portfolio/TotalBlock";
import { pageHref } from "../components/portfolio/Pager";
import { projectTypeText, propertyTypeText } from "../components/portfolio/vocabulary";
import { pricePerAreaFigure } from "../components/portfolio/price";
import { fill, formatArea, formatCount, formatPeriod } from "../lib/format";
import { contactHref } from "../lib/links";
import { badgeTone, projectCardModel, projectCardModels, type BadgeTone, type ProjectCardModel } from "../lib/projects";
import type { Ctx, ProjectItem } from "./types";

/**
 * portfolio.detail — one project (/portfolio/[slug]).
 *   portfolioDetail(ctx, project)    build-time data (only facts the record authors; nothing derived)
 *   <PortfolioDetail data={…} />     the section
 * Head (title + area figure, the summary, facts table, consult / review buttons), the total block
 * (pinned aside above 1280, collapsible row in the head below; the same full-digit figure + unit
 * as the project card), photo-group chips + view switch + square grid + viewer
 * (components/portfolio/ProjectGallery), the body paragraphs as their own titled block, before /
 * after pairs, the customer review, related projects (same category first, then latest; grid,
 * slider ≤ 640), back to list.
 */
export interface PortfolioDetailData {
  title: string;
  area?: { figure: string; unit: string };
  /** the project summary (one paragraph); empty when the record has none */
  description: string[];
  cover: GalleryImage;
  facts: { key: string; label: string; value: string; tone?: BadgeTone }[];
  consult?: { href: string; label: string };
  reviewJump?: string;
  total?: { figure: string; unit: string; range: boolean };
  totalLabels: { total: string; details: string; withheld: string };
  rows: { label: string; value: string }[];
  scope?: { label: string; items: string[] };
  notes: string[];
  gallery?: { groups: GalleryGroupData[]; labels: GalleryLabels };
  story?: { title: string; paragraphs: string[] };
  beforeAfter?: { title: string; before: string; after: string; pairs: { group: string; before: GalleryImage; after: GalleryImage }[] };
  quote?: { title: string; text: string; attribution?: string };
  related?: { title: string; cards: ProjectCardModel[]; withheld?: string; built?: string; autoplay: boolean; labels: CarouselLabels };
  back: { href: string; label: string };
}

const REVIEW_ID = "review";

export function portfolioDetail(ctx: Ctx, p: ProjectItem): PortfolioDetailData {
  const t = (key: string) => ctx.slots.text("portfolio.detail", key);
  const s = (key: string) => t(key) ?? "";
  const locale = ctx.identity.locale;
  const card = projectCardModel(ctx, p);
  const categories = ctx.content.list({ type: "categories" }).items;
  const catIndex = categories.findIndex((c) => c.id === p.category);
  const image = (m: { asset: string; alt?: string }): GalleryImage => ({ ...ctx.assets.resolve(m.asset), alt: m.alt ?? "" });

  const facts: PortfolioDetailData["facts"] = [];
  if (p.propertyType) facts.push({ key: "propertyType", label: s("propertyTypeLabel"), value: propertyTypeText(p.propertyType, locale) });
  if (card.category) facts.push({ key: "category", label: s("categoryLabel"), value: card.category, tone: badgeTone(catIndex < 0 ? 0 : catIndex) });
  if (p.area) facts.push({ key: "area", label: s("areaLabel"), value: formatArea(p.area) });
  if (p.builtYear !== undefined) facts.push({ key: "builtYear", label: s("builtYearLabel"), value: fill(s("builtYearFormat") || "{n}", { n: p.builtYear }) });
  if (p.period) facts.push({ key: "period", label: s("periodLabel"), value: formatPeriod(p.period) });
  if (p.durationWeeks !== undefined) facts.push({ key: "duration", label: s("durationLabel"), value: formatCount({ one: s("durationFormatOne"), other: s("durationFormat") }, p.durationWeeks) });
  if (p.projectType) facts.push({ key: "projectType", label: s("projectTypeLabel"), value: projectTypeText(p.projectType, locale) });
  if (p.location) facts.push({ key: "location", label: s("locationLabel"), value: p.location });

  const rows: PortfolioDetailData["rows"] = [];
  if (p.pricePerArea) rows.push({ label: s("pricePerAreaLabel"), value: pricePerAreaFigure(p.pricePerArea, locale) });
  if (p.area) rows.push({ label: s("areaLabel"), value: formatArea(p.area) });
  if (p.durationWeeks !== undefined) rows.push({ label: s("durationLabel"), value: formatCount({ one: s("durationFormatOne"), other: s("durationFormat") }, p.durationWeeks) });
  if (p.period) rows.push({ label: s("periodLabel"), value: formatPeriod(p.period) });

  const groups: GalleryGroupData[] = (p.galleryGroups ?? []).map((g) => ({
    name: g.name,
    items: g.items.map((it) => ({ image: image(it.image), ...(it.before ? { before: image(it.before) } : {}) })),
  }));
  const pairs = (p.galleryGroups ?? []).flatMap((g) => g.items.filter((it) => it.before).map((it) => ({ group: g.name, before: image(it.before!), after: image(it.image) })));

  const consult = contactHref(ctx);
  const settings = ctx.settings["portfolio.detail"];
  let related: PortfolioDetailData["related"];
  if (settings.relatedCount > 0) {
    const same = ctx.content.list({ type: "projects", selection: { mode: "category", category: p.category }, limit: Number.MAX_SAFE_INTEGER }).items.filter((o) => o.id !== p.id);
    const picked = same.slice(0, settings.relatedCount);
    if (picked.length < settings.relatedCount) {
      const taken = new Set([p.id, ...picked.map((o) => o.id)]);
      const latest = ctx.content.list({ type: "projects", selection: { mode: "latest" }, limit: Number.MAX_SAFE_INTEGER }).items.filter((o) => !taken.has(o.id));
      picked.push(...latest.slice(0, settings.relatedCount - picked.length));
    }
    if (picked.length > 0) {
      related = {
        title: s("relatedTitle"),
        cards: projectCardModels(ctx, picked),
        withheld: t("relatedWithheldLabel"),
        built: t("builtLabel"),
        autoplay: settings.relatedAutoplay,
        labels: { previous: s("previousLabel"), next: s("nextLabel"), pause: s("pauseLabel"), play: s("playLabel") },
      };
    }
  }

  return {
    title: p.title,
    area: card.area,
    description: p.summary ? [p.summary] : [],
    cover: image(p.cover),
    facts,
    consult: consult ? { href: consult, label: s("consultLabel") } : undefined,
    reviewJump: p.customerQuote ? s("reviewJumpLabel") : undefined,
    // the card model's figure: every digit + the unit, a range as "min ~ max"
    total: card.totalPrice && p.totalPrice ? { ...card.totalPrice, range: p.totalPrice.kind === "range" } : undefined,
    totalLabels: { total: s("totalLabel"), details: s("detailsLabel"), withheld: s("withheldLabel") },
    rows,
    scope: p.scope && p.scope.length > 0 ? { label: s("scopeLabel"), items: [...p.scope] } : undefined,
    notes: [t("priceNote1"), t("priceNote2"), t("priceNote3")].filter((n): n is string => Boolean(n)),
    gallery:
      groups.length > 0
        ? {
            groups,
            labels: {
              photos: s("photosLabel"),
              all: s("allPhotosLabel"),
              gridView: s("gridViewLabel"),
              singleView: s("singleViewLabel"),
              openPhoto: s("openPhotoLabel"),
              viewer: s("viewerLabel"),
              close: s("closeViewerLabel"),
              previous: s("previousPhotoLabel"),
              next: s("nextPhotoLabel"),
              thumbnails: s("thumbnailsLabel"),
            },
          }
        : undefined,
    story: p.body && p.body.length > 0 ? { title: s("storyTitle"), paragraphs: [...p.body] } : undefined,
    beforeAfter: pairs.length > 0 ? { title: s("beforeAfterTitle"), before: s("beforeLabel"), after: s("afterLabel"), pairs } : undefined,
    quote: p.customerQuote ? { title: s("reviewTitle"), text: p.customerQuote.text, attribution: p.customerQuote.attribution } : undefined,
    related,
    back: { href: pageHref(1), label: s("backLabel") },
  };
}

export function PortfolioDetail({ data }: { data: PortfolioDetailData }) {
  const { cover } = data;
  return (
    <article className="i2-wrap i2-pdetail" data-section="portfolio.detail">
      <div className="i2-pdetail__cover" aria-hidden="true">
        <img src={cover.src} width={cover.width} height={cover.height} alt="" loading="eager" decoding="async" fetchPriority="high" />
      </div>
      <header className="i2-pdetail__head">
        <div className="i2-pdetail__intro">
          <h1 className="i2-pdetail__title">
            <span className="i2-pdetail__name">{data.title}</span>
            {data.area ? (
              <span className="i2-pdetail__area">
                {data.area.figure}
                <small>{data.area.unit}</small>
              </span>
            ) : null}
          </h1>
          {data.description.length > 0 ? (
            <div className="i2-pdetail__desc">
              {data.description.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          ) : null}
        </div>
        {data.facts.length > 0 ? (
          <dl className="i2-pdetail__facts" data-facts="">
            {data.facts.map((f) => (
              <div key={f.key} className="i2-pdetail__fact" data-fact={f.key}>
                <dt>{f.label}</dt>
                <dd>
                  {f.tone ? <span className={`i2-pdetail__dot i2-pdetail__dot--${f.tone}`} aria-hidden="true" /> : null}
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {data.consult || data.reviewJump ? (
          <div className="i2-pdetail__buttons">
            {data.consult ? (
              <Link href={data.consult.href} className="i2-pdetail__btn i2-pdetail__btn--mint" data-detail-consult="">
                <span>{data.consult.label}</span>
                <Icon name="chevron-right" size={14} />
              </Link>
            ) : null}
            {data.reviewJump ? (
              <a href={`#${REVIEW_ID}`} className="i2-pdetail__btn i2-pdetail__btn--outline" data-detail-review-jump="">
                <span>{data.reviewJump}</span>
                <Icon name="chevron-right" size={14} />
              </a>
            ) : null}
          </div>
        ) : null}
      </header>
      <div className="i2-pdetail__main">
        {data.gallery ? <ProjectGallery groups={data.gallery.groups} labels={data.gallery.labels} /> : null}
        {data.story ? (
          <section className="i2-pblock i2-pstory" data-story="">
            <div className="i2-pblock__head">
              <h2 className="i2-pblock__title">{data.story.title}</h2>
            </div>
            <div className="i2-pstory__body">
              {data.story.paragraphs.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>
        ) : null}
        {data.beforeAfter ? (
          <section className="i2-pblock i2-pba" data-before-after="">
            <div className="i2-pblock__head">
              <h2 className="i2-pblock__title">{data.beforeAfter.title}</h2>
            </div>
            <ul className="i2-pba__list">
              {data.beforeAfter.pairs.map((pair, i) => (
                <li key={i} className="i2-pba__pair">
                  <figure className="i2-pba__shot">
                    <img src={pair.before.src} width={pair.before.width} height={pair.before.height} alt={pair.before.alt} loading="lazy" decoding="async" />
                    <figcaption>
                      {data.beforeAfter!.before}
                      <span className="i2-sr"> — {pair.group}</span>
                    </figcaption>
                  </figure>
                  <figure className="i2-pba__shot i2-pba__shot--after">
                    <img src={pair.after.src} width={pair.after.width} height={pair.after.height} alt={pair.after.alt} loading="lazy" decoding="async" />
                    <figcaption>
                      {data.beforeAfter!.after}
                      <span className="i2-sr"> — {pair.group}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {data.quote ? (
          <section className="i2-pblock i2-preview" id={REVIEW_ID} data-review="">
            <div className="i2-pblock__head">
              <h2 className="i2-pblock__title">{data.quote.title}</h2>
            </div>
            <blockquote className="i2-preview__quote">
              <p>{data.quote.text}</p>
              {data.quote.attribution ? <footer className="i2-preview__by">{data.quote.attribution}</footer> : null}
            </blockquote>
          </section>
        ) : null}
        {data.related ? (
          <section className="i2-pblock i2-prelated" data-related="">
            <div className="i2-pblock__head">
              <h2 className="i2-pblock__title">{data.related.title}</h2>
            </div>
            <ul className="i2-cards i2-prelated__grid">
              {data.related.cards.map((m) => (
                <ProjectCard key={m.id} model={m} withheld={data.related!.withheld} builtLabel={data.related!.built} level={3} />
              ))}
            </ul>
            <Carousel label={data.related.title} className="i2-prelated__slider" autoplay={data.related.autoplay} dwell={4000} duration={500} progress="fill" controls labels={data.related.labels}>
              {data.related.cards.map((m) => (
                <ProjectCard key={m.id} model={m} withheld={data.related!.withheld} builtLabel={data.related!.built} level={3} as="div" />
              ))}
            </Carousel>
          </section>
        ) : null}
        <div className="i2-pdetail__back">
          <Link href={data.back.href} className="i2-btn i2-btn--outline i2-pback" data-detail-back="">
            {data.back.label}
          </Link>
        </div>
      </div>
      <aside className="i2-pdetail__aside" aria-label={data.totalLabels.total}>
        <TotalBlock total={data.total} withheld={data.totalLabels.withheld} labels={{ total: data.totalLabels.total, details: data.totalLabels.details }} rows={data.rows} scope={data.scope} notes={data.notes} />
      </aside>
    </article>
  );
}
