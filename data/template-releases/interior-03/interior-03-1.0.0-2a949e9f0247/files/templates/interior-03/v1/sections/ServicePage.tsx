import Link from "next/link";
import { PageTitle } from "../components/ui/PageTitle";
import { SubVisual } from "../components/ui/SubVisual";
import { liveLink, type LiveLink } from "../lib/links";
import { slotMedia, type Media } from "../lib/media";
import { CARD_NUMBERS, SPACE_NUMBERS } from "../manifest/pages";
import type { Ctx } from "./types";

const SECTION = "service.page";

export interface ServicePageData {
  title: string;
  lead?: string;
  visual?: { media?: Media; text?: string };
  /** Block A: three picture cards (a card exists when it has a title). */
  spaces?: { title?: string; items: { key: string; media?: Media; title: string; text?: string }[] };
  /** Block B: picture left, headline + copy right. */
  split?: { title?: string; media?: Media; headline?: string; body?: string[] };
  /** Block C: bordered cards with an accent button (a card exists when it has a title; no live link = no button). */
  cards?: { title?: string; items: { key: string; media?: Media; title: string; text?: string; link?: LiveLink }[] };
}

/**
 * service.page — the business blocks in the shared sub-page frame: (1) banner + page title;
 * (2) block A: a heading and up to three picture cards (31% wide, 3.5% apart, justified copy);
 * (3) block B: a heading, the picture in the left half and the headline + copy in the right 45%;
 * (4) block C: an optional heading and up to three bordered cards (32% wide, 2% apart, centred),
 * each with a picture, a title, a paragraph and the full-width accent button of its link slot.
 * ≤ 768 every row stacks full width (30px between cards); the split block stacks picture over
 * text. Blocks after the first are 100px apart (60 ≤ 768, 30 ≤ 480). A block with nothing to show
 * is not rendered; a page with nothing set still shows the banner and its title.
 */
export function servicePage(ctx: Ctx): ServicePageData {
  const t = (key: string) => ctx.slots.text(SECTION, key);
  const rich = (key: string) => ctx.slots.richText(SECTION, key)?.paragraphs;
  const title = t("title") ?? "";
  const lead = t("lead");

  const visualMedia = slotMedia(ctx, SECTION, "visualMedia");
  const visualText = t("visualText");
  const visual = visualMedia || visualText ? { media: visualMedia, text: visualText } : undefined;

  const spaceItems: NonNullable<ServicePageData["spaces"]>["items"] = [];
  for (const n of SPACE_NUMBERS) {
    const spaceTitle = t(`space${n}Title`);
    if (spaceTitle) spaceItems.push({ key: `space${n}`, media: slotMedia(ctx, SECTION, `space${n}Media`), title: spaceTitle, text: t(`space${n}Text`) });
  }
  const spacesTitle = t("spacesTitle");
  const spaces = spaceItems.length > 0 ? { title: spacesTitle, items: spaceItems } : undefined;

  const splitTitle = t("splitTitle");
  const splitMedia = slotMedia(ctx, SECTION, "splitMedia");
  const splitHeadline = t("splitHeadline");
  const splitBody = rich("splitBody");
  const split = splitMedia || splitHeadline || splitBody ? { title: splitTitle, media: splitMedia, headline: splitHeadline, body: splitBody } : undefined;

  const cardItems: NonNullable<ServicePageData["cards"]>["items"] = [];
  for (const n of CARD_NUMBERS) {
    const cardTitle = t(`card${n}Title`);
    if (cardTitle) {
      cardItems.push({ key: `card${n}`, media: slotMedia(ctx, SECTION, `card${n}Media`), title: cardTitle, text: t(`card${n}Text`), link: liveLink(ctx, ctx.slots.link(SECTION, `card${n}Link`)) });
    }
  }
  const cards = cardItems.length > 0 ? { title: t("cardsTitle"), items: cardItems } : undefined;

  return { title, lead, visual, spaces, split, cards };
}

function Picture({ media, className }: { media: Media; className: string }) {
  return (
    <div className={className}>
      <img src={media.src} width={media.width} height={media.height} alt={media.alt} decoding="async" loading="lazy" />
    </div>
  );
}

function CardButton({ link }: { link: LiveLink }) {
  return link.internal ? (
    <Link href={link.href} className="i3-btn i3-btn--gold i3-svc-card__btn">
      {link.label}
    </Link>
  ) : (
    <a href={link.href} className="i3-btn i3-btn--gold i3-svc-card__btn">
      {link.label}
    </a>
  );
}

export function ServicePage({ data }: { data: ServicePageData }) {
  const { title, lead, visual, spaces, split, cards } = data;
  return (
    <div className="i3-svc" data-section="service.page">
      <SubVisual title={title} text={visual?.text} media={visual?.media} />
      <div className="i3-content">
        <div className="i3-wrap">
          <PageTitle title={title} lead={lead} />
          {spaces || split || cards ? (
            <div className="i3-page i3-prose i3-svc__page">
              {spaces ? (
                <section className="i3-svc__block" aria-labelledby={spaces.title ? "i3-svc-spaces" : undefined} data-block="spaces">
                  {spaces.title ? (
                    <h2 id="i3-svc-spaces" className="i3-svc__title">
                      {spaces.title}
                    </h2>
                  ) : null}
                  <ul className="i3-svc-spaces">
                    {spaces.items.map((item) => (
                      <li key={item.key} className="i3-svc-space">
                        {item.media ? <Picture media={item.media} className="i3-svc-space__pic" /> : null}
                        <h3 className="i3-svc-space__title">{item.title}</h3>
                        {item.text ? <p className="i3-svc-space__text">{item.text}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {split ? (
                <section className="i3-svc__block" aria-labelledby={split.title ? "i3-svc-split" : undefined} data-block="split">
                  {split.title ? (
                    <h2 id="i3-svc-split" className="i3-svc__title">
                      {split.title}
                    </h2>
                  ) : null}
                  <div className="i3-svc-split">
                    {split.media ? <Picture media={split.media} className="i3-svc-split__pic" /> : null}
                    {split.headline || split.body ? (
                      <div className="i3-svc-split__text">
                        {split.headline ? <h3 className="i3-svc-split__headline">{split.headline}</h3> : null}
                        {split.body ? (
                          <div className="i3-svc-split__body">
                            {split.body.map((p, i) => (
                              <p key={i}>{p}</p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {cards ? (
                <section className="i3-svc__block" aria-labelledby={cards.title ? "i3-svc-cards" : undefined} data-block="cards">
                  {cards.title ? (
                    <h2 id="i3-svc-cards" className="i3-svc__title">
                      {cards.title}
                    </h2>
                  ) : null}
                  <ul className="i3-svc-cards">
                    {cards.items.map((item) => (
                      <li key={item.key} className="i3-svc-card">
                        {item.media ? <Picture media={item.media} className="i3-svc-card__pic" /> : null}
                        <div className="i3-svc-card__box">
                          <h3 className="i3-svc-card__title">{item.title}</h3>
                          {item.text ? <p className="i3-svc-card__text">{item.text}</p> : null}
                          {item.link ? <CardButton link={item.link} /> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
