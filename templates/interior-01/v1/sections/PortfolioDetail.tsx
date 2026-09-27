import Link from "next/link";
import { ProjectGallery, type GalleryGroupProps, type GalleryImage } from "../components/ProjectGallery";
import { contactHref } from "./links";
import { formatArea, formatCount, formatPeriod, formatPricePerArea, formatTotalPrice } from "../lib/format";
import { projectTypeText, workScopeText } from "../lib/vocabulary";
import type { Ctx, ProjectItem } from "./types";

type FactKey =
  | "location"
  | "area"
  | "projectType"
  | "category"
  | "builtYear"
  | "scope"
  | "workScopes"
  | "period"
  | "duration"
  | "keywords"
  | "totalPrice"
  | "price";

export interface PortfolioDetailData {
  id: string;
  title: string;
  summary?: string;
  body?: string[];
  gallery: GalleryGroupProps[];
  hasBeforeAfter: boolean;
  facts: { key: FactKey; label: string; value: string }[];
  quote?: { text: string; attribution?: string };
  cta?: { prompt?: string; label: string; href: string };
  labels: {
    back: string;
    rooms: string;
    allRooms: string;
    before: string;
    after: string;
    showMore: string;
    showLess: string;
    previousPhoto: string;
    nextPhoto: string;
    openPhoto: string;
    closeViewer: string;
    bodyTitle: string;
    quoteTitle: string;
  };
}

/**
 * portfolio.detail — ONE detail layout for every project. Optional regions render
 * only from data that exists: no before/after control without a before photo, no
 * quote wrapper without a quote, no fact row without a value.
 *
 * 1.6.1: the area row's label names the basis the record states — supply → areaSupplyLabel,
 * exclusive → areaExclusiveLabel, unstated / "unknown" → areaLabel — and the figure stays as
 * authored (no unit or basis conversion). The V0.2 structured facts get a row each when the
 * record authors them: projectType, workScopeIds ("main" work: the set is never claimed to be
 * exhaustive) and totalPrice (the whole case's total, never a per-room price or a quote).
 */
export function portfolioDetail(ctx: Ctx, p: ProjectItem): PortfolioDetailData {
  const t = (key: Parameters<Ctx["slots"]["text"]>[1]) => ctx.slots.text("portfolio.detail", key) ?? "";
  const img = (m: { asset: string; alt?: string }, fallbackAlt: string): GalleryImage => ({
    ...ctx.assets.resolve(m.asset),
    alt: m.alt ?? fallbackAlt,
  });
  const gallery: GalleryGroupProps[] = p.galleryGroups
    ? p.galleryGroups.map((g) => ({
        name: g.name,
        items: g.items.map((it, i) => ({
          image: img(it.image, `${p.title} — ${g.name} ${i + 1}`),
          before: it.before ? img(it.before, `${p.title} — ${g.name} ${i + 1} (${t("beforeLabel")})`) : undefined,
        })),
      }))
    : // No gallery data: the cover is the only photo (never an empty gallery).
      [{ name: p.title, items: [{ image: img(p.cover, p.title) }] }];

  const category = ctx.content.list({ type: "categories" }).items.find((c) => c.id === p.category)?.name;
  const locale = ctx.identity.locale;
  const candidates: [FactKey, string | undefined][] = [
    ["location", p.location],
    ["area", p.area ? formatArea(p.area) : undefined],
    ["projectType", p.projectType ? projectTypeText(p.projectType, locale) : undefined],
    ["category", category],
    ["builtYear", p.builtYear !== undefined ? String(p.builtYear) : undefined],
    ["scope", p.scope?.join(", ")],
    ["workScopes", p.workScopeIds && p.workScopeIds.length > 0 ? workScopeText(p.workScopeIds, locale) : undefined],
    ["period", p.period ? formatPeriod(p.period) : undefined],
    ["duration", p.durationWeeks !== undefined ? formatCount({ one: t("durationFormatOne"), other: t("durationFormat") }, p.durationWeeks) : undefined],
    ["keywords", p.keywords && p.keywords.length > 0 ? p.keywords.join(", ") : undefined],
    ["totalPrice", p.totalPrice ? formatTotalPrice(p.totalPrice, locale) : undefined],
    ["price", p.pricePerArea ? formatPricePerArea(p.pricePerArea, locale) : undefined],
  ];
  // The basis the record states, never another one (and never guessed from the unit or the value).
  const basis = p.area?.basis;
  const labelKey: Record<FactKey, Parameters<Ctx["slots"]["text"]>[1]> = {
    location: "locationLabel",
    area: basis === "supply" ? "areaSupplyLabel" : basis === "exclusive" ? "areaExclusiveLabel" : "areaLabel",
    projectType: "projectTypeLabel",
    category: "categoryLabel",
    builtYear: "builtYearLabel",
    scope: "scopeLabel",
    workScopes: "workScopesLabel",
    period: "periodLabel",
    duration: "durationLabel",
    keywords: "keywordsLabel",
    totalPrice: "totalPriceLabel",
    price: "priceLabel",
  };
  const facts = candidates
    .filter((c): c is [FactKey, string] => typeof c[1] === "string" && c[1].trim() !== "")
    .map(([key, value]) => ({ key, label: t(labelKey[key]), value }));

  const contact = contactHref(ctx);
  const ctaLabel = ctx.slots.text("portfolio.detail", "ctaLabel");
  return {
    id: p.id,
    title: p.title,
    summary: p.summary,
    body: p.body,
    gallery,
    hasBeforeAfter: gallery.some((g) => g.items.some((it) => it.before !== undefined)),
    facts,
    quote: p.customerQuote ? { text: p.customerQuote.text, attribution: p.customerQuote.attribution } : undefined,
    // Contact destination = the site's contact page (same rule as the header); none → no CTA.
    cta: contact && ctaLabel ? { prompt: ctx.slots.text("portfolio.detail", "ctaPrompt"), label: ctaLabel, href: contact } : undefined,
    labels: {
      back: t("backLabel"),
      rooms: t("roomsLabel"),
      allRooms: t("allRoomsLabel"),
      before: t("beforeLabel"),
      after: t("afterLabel"),
      showMore: t("showMoreLabel"),
      showLess: t("showLessLabel"),
      previousPhoto: t("previousPhotoLabel"),
      nextPhoto: t("nextPhotoLabel"),
      openPhoto: t("openPhotoLabel"),
      closeViewer: t("closeViewerLabel"),
      bodyTitle: t("bodyTitle"),
      quoteTitle: t("quoteTitle"),
    },
  };
}

export function PortfolioDetail({ data }: { data: PortfolioDetailData }) {
  const { labels } = data;
  return (
    <article
      className="i1-detail"
      data-section="portfolio.detail"
      data-project={data.id}
      data-before-after={data.hasBeforeAfter ? "true" : "false"}
      aria-labelledby="i1-detail-title"
    >
      <div className="i1-container i1-detail__layout">
        <nav className="i1-detail__bar" aria-label={labels.back}>
          <Link href="/portfolio" className="i1-detail__back" data-back-link="">
            <span aria-hidden="true">‹ </span>
            {labels.back}
          </Link>
        </nav>
        <header className="i1-detail__head">
          <h1 id="i1-detail-title" className="i1-detail__title">
            {data.title}
          </h1>
          {data.summary ? <p className="i1-detail__summary">{data.summary}</p> : null}
        </header>
        <div className="i1-detail__gallery">
          <ProjectGallery
            groups={data.gallery}
            labels={{
              rooms: labels.rooms,
              all: labels.allRooms,
              before: labels.before,
              after: labels.after,
              showMore: labels.showMore,
              showLess: labels.showLess,
              previousPhoto: labels.previousPhoto,
              nextPhoto: labels.nextPhoto,
              openPhoto: labels.openPhoto,
              close: labels.closeViewer,
            }}
          />
        </div>
        <div className={`i1-detail__info${data.body || data.quote ? "" : " i1-detail__info--no-story"}`}>
          {data.facts.length > 0 ? (
            <dl className="i1-facts" data-facts="">
              {data.facts.map((f) => (
                <div key={f.key} className="i1-facts__row" data-fact={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {data.body || data.quote ? (
            <div className="i1-detail__story">
              {data.body ? (
                <section className="i1-detail__body" data-body="">
                  <h2 className="i1-detail__label">{labels.bodyTitle}</h2>
                  {data.body.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </section>
              ) : null}
              {data.quote ? (
                <figure className="i1-detail__quote" data-quote="">
                  <figcaption className="i1-detail__label">{labels.quoteTitle}</figcaption>
                  <blockquote>
                    <p>{data.quote.text}</p>
                  </blockquote>
                  {data.quote.attribution ? <p className="i1-detail__attribution">— {data.quote.attribution}</p> : null}
                </figure>
              ) : null}
            </div>
          ) : null}
          {data.cta ? (
            <div className="i1-detail__cta" data-cta="">
              {data.cta.prompt ? <p>{data.cta.prompt}</p> : null}
              <Link href={data.cta.href} className="i1-button">
                {data.cta.label}
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
