import Link from "../components/Link";
import { ChevronIcon } from "../components/Icon";
import { hasRoute } from "../lib/routes";
import { contactHref } from "./links";
import type { Ctx } from "./types";

export interface AboutPageData {
  title: string;
  lead?: string[];
  body?: string[];
  media?: { src: string; width: number; height: number; alt: string };
  pointsTitle?: string;
  points: { title: string; body?: string }[];
  cta?: { prompt?: string; label: string; href: string };
  portfolio?: { label: string; href: string };
}

const POINTS = [1, 2, 3, 4, 5, 6] as const;

/**
 * about.page (1.5.0) — the studio's point of view: title, lead (falls back to the business
 * summary), body, one photo, up to six principles, then contact / portfolio. Every part is
 * omitted when it has no value; a principle needs its title.
 */
export function aboutPage(ctx: Ctx): AboutPageData {
  const t = ctx.slots.text.bind(ctx.slots);
  const media = ctx.slots.media("about.page", "media");
  const points = POINTS.flatMap((n) => {
    const title = t("about.page", `point${n}Title`);
    return title ? [{ title, body: t("about.page", `point${n}Body`) }] : [];
  });
  const contact = contactHref(ctx);
  const ctaLabel = t("about.page", "ctaLabel");
  const portfolioLabel = t("about.page", "portfolioLabel");
  return {
    title: t("about.page", "title") ?? "",
    lead: ctx.slots.richText("about.page", "lead")?.paragraphs,
    body: ctx.slots.richText("about.page", "body")?.paragraphs,
    media: media ? { ...ctx.assets.resolve(media.asset), alt: media.alt } : undefined,
    pointsTitle: points.length > 0 ? t("about.page", "pointsTitle") : undefined,
    points,
    cta: contact && ctaLabel ? { prompt: t("about.page", "ctaPrompt"), label: ctaLabel, href: contact } : undefined,
    portfolio: hasRoute(ctx, "portfolio.index") && portfolioLabel ? { label: portfolioLabel, href: "/portfolio" } : undefined,
  };
}

export function AboutPage({ data }: { data: AboutPageData }) {
  const PointHeading = data.pointsTitle ? "h3" : "h2";
  return (
    <div className="i1-page i1-about" data-section="about.page">
      <div className="i1-container">
        <header className="i1-page__head">
          <h1 className="i1-page__title">{data.title}</h1>
          {data.lead ? (
            <div className="i1-page__lead">
              {data.lead.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}
        </header>
        {data.media ? (
          <div className="i1-about__media">
            <img src={data.media.src} width={data.media.width} height={data.media.height} alt={data.media.alt} decoding="async" />
          </div>
        ) : null}
        {data.body ? (
          <div className="i1-about__body">
            {data.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : null}
        {data.points.length > 0 ? (
          <section className="i1-about__principles" aria-labelledby={data.pointsTitle ? "i1-about-points" : undefined}>
            {data.pointsTitle ? (
              <h2 id="i1-about-points" className="i1-about__points-title">
                {data.pointsTitle}
              </h2>
            ) : null}
            <ol className="i1-about__points">
              {data.points.map((p, i) => (
                <li key={i} className="i1-about__point">
                  <span className="i1-about__num" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <PointHeading className="i1-about__point-title">{p.title}</PointHeading>
                  {p.body ? <p>{p.body}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {data.cta || data.portfolio ? (
          <div className="i1-page__cta" data-cta="">
            {data.cta?.prompt ? <p>{data.cta.prompt}</p> : null}
            <div className="i1-page__actions">
              {data.cta ? (
                <Link href={data.cta.href} className="i1-pill">
                  {data.cta.label}
                  <ChevronIcon dir="right" />
                </Link>
              ) : null}
              {data.portfolio ? (
                <Link href={data.portfolio.href} className="i1-page__more">
                  {data.portfolio.label}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
