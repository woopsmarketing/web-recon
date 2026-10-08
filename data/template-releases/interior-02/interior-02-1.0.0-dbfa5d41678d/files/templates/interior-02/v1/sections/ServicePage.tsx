import Link from "next/link";
import { Icon } from "../components/ui/Icon";
import { TeamIcon } from "../components/pages/PageIcons";
import { mediaOf, paragraphsOf, type Media } from "../components/pages/shared";
import { contactHref, liveLink, type LiveLink } from "../lib/links";
import { CARD_NUMBERS, TEAM_NUMBERS, TIER_NUMBERS, TIER_ROW_NUMBERS, type TeamIcon as TeamIconName } from "../manifest/pages";
import type { Ctx } from "./types";

const SECTION = "service.page";
const TONES = ["yellow", "mint", "navy"] as const;

export interface ServiceTier {
  key: string;
  tone: (typeof TONES)[number];
  title: string;
  sub?: string;
  prefix?: string;
  figure?: string;
  unit?: string;
  tag?: string;
  link?: LiveLink;
  specTitle?: string;
  specText?: string;
  rows: { label: string; value?: string }[];
}

export interface ServicePageData {
  title: string;
  intro?: string[];
  tiers: ServiceTier[];
  glance?: { title?: string; rows: { name: string; sub?: string; title: string; text?: string }[]; media?: Media };
  band?: { media: Media; lines?: string[] };
  cards?: { title?: string; items: { key: string; media?: Media; title: string; text?: string }[] };
  team?: { title?: string; text?: string[]; members: { key: string; icon: TeamIconName; title: string; text?: string }[]; button?: { href: string; label: string } };
}

/**
 * service.page — (1) the title band with the three tier tiles (yellow / mint / navy in slot
 * order); (2) "at a glance" rows + diagram; (3) the wide photo band; (4) three cards; (5) the
 * team row with the contact button. A tile / row / card / member exists when its title is set;
 * a block with no item is not rendered; the page always has its title.
 */
export function servicePage(ctx: Ctx): ServicePageData {
  const t = (key: string) => ctx.slots.text(SECTION, key);
  const title = t("title") ?? "";
  const intro = paragraphsOf(ctx, SECTION, "intro");

  const tiers: ServiceTier[] = [];
  const glanceRows: NonNullable<ServicePageData["glance"]>["rows"] = [];
  for (const n of TIER_NUMBERS) {
    const tierTitle = t(`tier${n}Title`);
    if (!tierTitle) continue;
    const rows: ServiceTier["rows"] = [];
    for (const r of TIER_ROW_NUMBERS) {
      const label = t(`tier${n}Row${r}Label`);
      if (label) rows.push({ label, value: t(`tier${n}Row${r}Value`) });
    }
    tiers.push({
      key: `tier${n}`,
      tone: TONES[n - 1]!,
      title: tierTitle,
      sub: t(`tier${n}Sub`),
      prefix: t(`tier${n}Prefix`),
      figure: t(`tier${n}Figure`),
      unit: t(`tier${n}Unit`),
      tag: t(`tier${n}Tag`),
      link: liveLink(ctx, ctx.slots.link(SECTION, `tier${n}Link`)),
      specTitle: t(`tier${n}SpecTitle`),
      specText: t(`tier${n}SpecText`),
      rows,
    });
    const glanceTitle = t(`glance${n}Title`);
    if (glanceTitle) glanceRows.push({ name: tierTitle, sub: t(`tier${n}Sub`), title: glanceTitle, text: t(`glance${n}Text`) });
  }
  const glanceMedia = mediaOf(ctx, SECTION, "glanceMedia");
  const glance = glanceRows.length > 0 || glanceMedia ? { title: t("glanceTitle"), rows: glanceRows, media: glanceMedia } : undefined;

  const bandMedia = mediaOf(ctx, SECTION, "bandMedia");
  const band = bandMedia ? { media: bandMedia, lines: paragraphsOf(ctx, SECTION, "bandTitle") } : undefined;

  const cardItems: NonNullable<ServicePageData["cards"]>["items"] = [];
  for (const n of CARD_NUMBERS) {
    const cardTitle = t(`card${n}Title`);
    if (cardTitle) cardItems.push({ key: `card${n}`, media: mediaOf(ctx, SECTION, `card${n}Media`), title: cardTitle, text: t(`card${n}Text`) });
  }
  const cards = cardItems.length > 0 ? { title: t("cardsTitle"), items: cardItems } : undefined;

  const settings = ctx.settings[SECTION];
  const members: NonNullable<ServicePageData["team"]>["members"] = [];
  for (const n of TEAM_NUMBERS) {
    const memberTitle = t(`team${n}Title`);
    if (memberTitle) members.push({ key: `team${n}`, icon: settings[`team${n}Icon`], title: memberTitle, text: t(`team${n}Text`) });
  }
  const contact = contactHref(ctx);
  const buttonLabel = t("teamButtonLabel");
  const teamTitle = t("teamTitle");
  const team = members.length > 0 || teamTitle ? { title: teamTitle, text: paragraphsOf(ctx, SECTION, "teamText"), members, button: contact && buttonLabel ? { href: contact, label: buttonLabel } : undefined } : undefined;

  return { title, intro, tiers, glance, band, cards, team };
}

function TierHead({ tier }: { tier: ServiceTier }) {
  const body = (
    <>
      <span className="i2-sv-tier__name">
        <h3>{tier.title}</h3>
        {tier.sub ? <small>{tier.sub}</small> : null}
      </span>
      <span className="i2-sv-tier__foot">
        {tier.figure ? (
          <span className="i2-sv-tier__price">
            {tier.prefix ? <span className="i2-sv-tier__prefix">{tier.prefix}</span> : null}
            <strong>{tier.figure}</strong>
            {tier.unit ? <span className="i2-sv-tier__unit">{tier.unit}</span> : null}
            {tier.tag ? <span className="i2-sv-tier__tag">{tier.tag}</span> : null}
          </span>
        ) : (
          <span />
        )}
        {tier.link ? <Icon name="arrow-right" size={21} className="i2-sv-tier__arrow" /> : null}
      </span>
    </>
  );
  if (!tier.link) return <div className="i2-sv-tier__head">{body}</div>;
  return tier.link.internal ? (
    <Link href={tier.link.href} className="i2-sv-tier__head" data-tier-head="">
      {body}
    </Link>
  ) : (
    <a href={tier.link.href} className="i2-sv-tier__head" data-tier-head="">
      {body}
    </a>
  );
}

function TierButton({ link }: { link: LiveLink }) {
  const inner = (
    <>
      <span>{link.label}</span>
      <Icon name="chevron-right" size={16} />
    </>
  );
  return link.internal ? (
    <Link href={link.href} className="i2-sv-tier__btn" data-tier-btn="">
      {inner}
    </Link>
  ) : (
    <a href={link.href} className="i2-sv-tier__btn" data-tier-btn="">
      {inner}
    </a>
  );
}

export function ServicePage({ data }: { data: ServicePageData }) {
  const { title, intro, tiers, glance, band, cards, team } = data;
  return (
    <div className="i2-pg i2-sv" data-section="service.page">
      <section className="i2-sv-top" aria-labelledby="i2-sv-title">
        <div className="i2-wrap i2-sv-top__head">
          <h1 id="i2-sv-title" className="i2-pg-title">
            {title}
          </h1>
          {intro ? (
            <div className="i2-pg-sub">
              {intro.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>
        {tiers.length > 0 ? (
          <div className="i2-wrap">
            <ul className="i2-sv-tiers">
              {tiers.map((tier) => (
                <li key={tier.key} className={`i2-sv-tier i2-sv-tier--${tier.tone}`} data-tier={tier.key}>
                  <TierHead tier={tier} />
                  {tier.specTitle || tier.specText || tier.rows.length > 0 ? (
                    <div className="i2-sv-tier__spec">
                      {tier.specTitle ? <h4>{tier.specTitle}</h4> : null}
                      {tier.specText ? <p>{tier.specText}</p> : null}
                      {tier.rows.length > 0 ? (
                        <dl className="i2-sv-tier__rows">
                          {tier.rows.map((row, i) => (
                            <div key={i} className="i2-sv-tier__row">
                              <dt>{row.label}</dt>
                              <dd>{row.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  ) : null}
                  {tier.link ? <TierButton link={tier.link} /> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {glance ? (
        <section className="i2-sv-glance" aria-labelledby={glance.title ? "i2-sv-glance-title" : undefined}>
          <div className="i2-wrap">
            {glance.title ? (
              <h2 id="i2-sv-glance-title" className="i2-pg-h2 i2-sv-glance__title">
                {glance.title}
              </h2>
            ) : null}
            <div className="i2-sv-glance__cols">
              {glance.rows.length > 0 ? (
                <ul className="i2-sv-glance__rows">
                  {glance.rows.map((row, i) => (
                    <li key={i} className="i2-sv-glance__row">
                      <div className="i2-sv-glance__name">
                        <h3>{row.name}</h3>
                        {row.sub ? <small>{row.sub}</small> : null}
                      </div>
                      <div className="i2-sv-glance__body">
                        <h4>{row.title}</h4>
                        {row.text ? <p>{row.text}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {glance.media ? (
                <figure className="i2-sv-glance__figure">
                  <img src={glance.media.src} width={glance.media.width} height={glance.media.height} alt={glance.media.alt} loading="lazy" decoding="async" />
                </figure>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {band ? (
        <section className="i2-sv-band" aria-labelledby={band.lines ? "i2-sv-band-title" : undefined}>
          <img className="i2-sv-band__img" src={band.media.src} width={band.media.width} height={band.media.height} alt={band.media.alt} loading="lazy" decoding="async" />
          {band.lines ? (
            <div className="i2-wrap">
              <h2 id="i2-sv-band-title" className="i2-sv-band__title">
                {band.lines.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </h2>
            </div>
          ) : null}
        </section>
      ) : null}

      {cards ? (
        <section className="i2-sv-cards" aria-labelledby={cards.title ? "i2-sv-cards-title" : undefined}>
          <div className="i2-wrap">
            {cards.title ? (
              <h2 id="i2-sv-cards-title" className="i2-pg-h2">
                {cards.title}
              </h2>
            ) : null}
            <ul className="i2-sv-cards__grid">
              {cards.items.map((card) => (
                <li key={card.key} className="i2-sv-card">
                  {card.media ? (
                    <figure className="i2-sv-card__media">
                      <img src={card.media.src} width={card.media.width} height={card.media.height} alt={card.media.alt} loading="lazy" decoding="async" />
                    </figure>
                  ) : null}
                  <div className="i2-sv-card__body">
                    <h3>{card.title}</h3>
                    {card.text ? <p>{card.text}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {team ? (
        <section className="i2-sv-team" aria-labelledby={team.title ? "i2-sv-team-title" : undefined}>
          <div className="i2-wrap">
            {team.title ? (
              <h2 id="i2-sv-team-title" className="i2-pg-h2 i2-sv-team__title">
                {team.title}
              </h2>
            ) : null}
            {team.text ? (
              <div className="i2-sv-team__text">
                {team.text.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            ) : null}
            {team.members.length > 0 ? (
              <ul className="i2-sv-team__list">
                {team.members.map((m) => (
                  <li key={m.key} className="i2-sv-team__item" data-team={m.key}>
                    <div className="i2-sv-team__head">
                      <span className="i2-sv-team__icon">
                        <TeamIcon name={m.icon} />
                      </span>
                      <h3>{m.title}</h3>
                    </div>
                    {m.text ? <p>{m.text}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {team.button ? (
              <p className="i2-sv-team__cta">
                <Link href={team.button.href} className="i2-btn i2-btn--mint i2-sv-team__btn" data-team-cta="">
                  <span>{team.button.label}</span>
                  <Icon name="chevron-right" size={14} />
                </Link>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
