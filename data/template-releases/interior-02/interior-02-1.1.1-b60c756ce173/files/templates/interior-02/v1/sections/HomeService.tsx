import Link from "../components/ui/Link";
import { Icon } from "../components/ui/Icon";
import { SectionHeading } from "../components/ui/SectionHeading";
import { Reveal } from "../components/home/Reveal";
import { mediaOf, serviceHref } from "../components/home/shared";
import type { Ctx } from "./types";

type Media = { src: string; width: number; height: number; alt: string };

export interface ServiceTier {
  key: string;
  tone: "yellow" | "mint" | "navy";
  title: string;
  sub?: string;
  note?: string;
  prefix?: string;
  figure?: string;
  unit?: string;
  tag?: string;
}

export interface HomeServiceData {
  principles?: { title: string; quote?: string; body?: string[]; media1?: Media; media2?: Media };
  lineup?: { title?: string; more?: { href: string; label: string }; href?: string; tiers: ServiceTier[] };
}

const TONES: readonly ServiceTier["tone"][] = ["yellow", "mint", "navy"];

/**
 * home.service — (1) principles: title, a quoted line, a paragraph, two device images that slide
 * into place once; (2) the lineup: heading with arrow to the service route, three flush coloured
 * tiles (yellow / mint / navy), each a link to the service route. A tile exists when it has a
 * title; the section exists when either block does.
 */
export function homeService(ctx: Ctx): HomeServiceData | undefined {
  const t = (key: string) => ctx.slots.text("home.service", key);
  const title = t("title");
  const principles = title
    ? { title, quote: t("quote"), body: ctx.slots.richText("home.service", "body")?.paragraphs, media1: mediaOf(ctx, "home.service", "media1"), media2: mediaOf(ctx, "home.service", "media2") }
    : undefined;

  const service = serviceHref(ctx);
  const tiers: ServiceTier[] = [];
  for (const n of [1, 2, 3] as const) {
    const tierTitle = t(`tier${n}Title`);
    if (!tierTitle) continue;
    tiers.push({
      key: `tier${n}`,
      tone: TONES[n - 1]!,
      title: tierTitle,
      sub: t(`tier${n}Sub`),
      note: t(`tier${n}Note`),
      prefix: t(`tier${n}Prefix`),
      figure: t(`tier${n}Figure`),
      unit: t(`tier${n}Unit`),
      tag: t(`tier${n}Tag`),
    });
  }
  const lineupTitle = t("lineupTitle");
  const moreLabel = t("moreLabel");
  const lineup = lineupTitle || tiers.length > 0 ? { title: lineupTitle, more: service && moreLabel ? { href: service, label: moreLabel } : undefined, href: service, tiers } : undefined;

  return principles || lineup ? { principles, lineup } : undefined;
}

export function HomeService({ data }: { data: HomeServiceData }) {
  const { principles: p, lineup } = data;
  return (
    <section className="i2-sec i2-service" data-section="home.service">
      <div className="i2-wrap">
        {p ? (
          <Reveal className="i2-service__top">
            <div className="i2-service__text">
              {/* the arrow of this heading shows only ≤ 860 (home.css), as the source does */}
              <SectionHeading title={p.title} id="i2-service-title" more={lineup?.more} className="i2-service__head" />
              {p.quote ? <p className="i2-service__quote">{p.quote}</p> : null}
              {p.body ? (
                <div className="i2-service__body">
                  {p.body.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              ) : null}
            </div>
            {p.media1 || p.media2 ? (
              <div className="i2-service__shots">
                {p.media1 ? (
                  <figure className="i2-service__shot i2-service__shot--1">
                    <img src={p.media1.src} width={p.media1.width} height={p.media1.height} alt={p.media1.alt} loading="lazy" decoding="async" />
                  </figure>
                ) : null}
                {p.media2 ? (
                  <figure className="i2-service__shot i2-service__shot--2">
                    <img src={p.media2.src} width={p.media2.width} height={p.media2.height} alt={p.media2.alt} loading="lazy" decoding="async" />
                  </figure>
                ) : null}
              </div>
            ) : null}
          </Reveal>
        ) : null}
        {lineup ? (
          <div className="i2-service__lineup">
            {lineup.title ? <SectionHeading title={lineup.title} id="i2-lineup-title" more={lineup.more} /> : null}
            {lineup.tiers.length > 0 ? (
              <ul className="i2-tiers">
                {lineup.tiers.map((tier) => {
                  const body = (
                    <>
                      <span className="i2-tier__head">
                        <span className="i2-tier__title">
                          {tier.title}
                          {tier.sub ? <small>{tier.sub}</small> : null}
                        </span>
                        {tier.note ? <span className="i2-tier__note">{tier.note}</span> : null}
                      </span>
                      <span className="i2-tier__foot">
                        {tier.figure ? (
                          <span className="i2-tier__figure">
                            {tier.prefix ? <small>{tier.prefix}</small> : null}
                            <strong>{tier.figure}</strong>
                            {tier.unit ? <small>{tier.unit}</small> : null}
                            {tier.tag ? <span className="i2-tier__tag">{tier.tag}</span> : null}
                          </span>
                        ) : null}
                        <Icon name="arrow-right" size={28} className="i2-tier__arrow" />
                      </span>
                    </>
                  );
                  return (
                    <li key={tier.key} className={`i2-tier i2-tier--${tier.tone}`} data-tier={tier.key}>
                      {lineup.href ? (
                        <Link href={lineup.href} className="i2-tier__link">
                          {body}
                        </Link>
                      ) : (
                        <div className="i2-tier__link">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
