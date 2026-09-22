import Link from "next/link";
import { ProjectGallery, type GalleryGroupProps, type GalleryImage } from "../components/ProjectGallery";
import { formatArea, formatCount, formatPeriod, formatPricePerArea } from "../lib/format";
import type { Ctx, ProjectItem } from "./types";

type FactKey = "location" | "area" | "category" | "builtYear" | "scope" | "period" | "duration" | "keywords" | "price";

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
    before: string;
    after: string;
    showMore: string;
    showLess: string;
    bodyTitle: string;
    quoteTitle: string;
  };
}

/**
 * portfolio.detail — ONE detail layout for every project. Optional regions render
 * only from data that exists: no before/after control without a before photo, no
 * quote wrapper without a quote, no fact row without a value.
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
  const candidates: [FactKey, string | undefined][] = [
    ["location", p.location],
    ["area", p.area ? formatArea(p.area) : undefined],
    ["category", category],
    ["builtYear", p.builtYear !== undefined ? String(p.builtYear) : undefined],
    ["scope", p.scope?.join(", ")],
    ["period", p.period ? formatPeriod(p.period) : undefined],
    ["duration", p.durationWeeks !== undefined ? formatCount({ one: t("durationFormatOne"), other: t("durationFormat") }, p.durationWeeks) : undefined],
    ["keywords", p.keywords && p.keywords.length > 0 ? p.keywords.join(", ") : undefined],
    ["price", p.pricePerArea ? formatPricePerArea(p.pricePerArea) : undefined],
  ];
  const labelKey: Record<FactKey, Parameters<Ctx["slots"]["text"]>[1]> = {
    location: "locationLabel",
    area: "areaLabel",
    category: "categoryLabel",
    builtYear: "builtYearLabel",
    scope: "scopeLabel",
    period: "periodLabel",
    duration: "durationLabel",
    keywords: "keywordsLabel",
    price: "priceLabel",
  };
  const facts = candidates
    .filter((c): c is [FactKey, string] => typeof c[1] === "string" && c[1].trim() !== "")
    .map(([key, value]) => ({ key, label: t(labelKey[key]), value }));

  const email = ctx.content.getSingleton("business").contact?.email;
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
    // Contact destination = the business's own contact (same rule as the header); none → no CTA.
    cta: email && ctaLabel ? { prompt: ctx.slots.text("portfolio.detail", "ctaPrompt"), label: ctaLabel, href: `mailto:${email}` } : undefined,
    labels: {
      back: t("backLabel"),
      rooms: t("roomsLabel"),
      before: t("beforeLabel"),
      after: t("afterLabel"),
      showMore: t("showMoreLabel"),
      showLess: t("showLessLabel"),
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
            labels={{ rooms: labels.rooms, before: labels.before, after: labels.after, showMore: labels.showMore, showLess: labels.showLess }}
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
              <a href={data.cta.href} className="i1-button">
                {data.cta.label}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
