import Link from "../components/ui/Link";
import { Carousel } from "../components/ui/Carousel";
import { SectionHeading } from "../components/ui/SectionHeading";
import { contactHref, mediaOf } from "../components/home/shared";
import { liveLink, type LiveLink } from "../lib/links";
import type { Ctx } from "./types";

export interface ShowroomCard {
  key: string;
  name: string;
  media?: { src: string; width: number; height: number; alt: string };
  link?: LiveLink;
  rows: { label: string; value: string }[];
}

export interface HomeShowroomsData {
  title: string;
  more?: { href: string; label: string };
  contact?: { href: string; label: string };
  rooms: ShowroomCard[];
  button?: LiveLink;
  slideLabelFormat: string;
}

/** home.showrooms — up to four cards from numbered slots; a card exists when it has a name. None → nothing. */
export function homeShowrooms(ctx: Ctx): HomeShowroomsData | undefined {
  const t = (key: string) => ctx.slots.text("home.showrooms", key);
  const rooms: ShowroomCard[] = [];
  for (const n of [1, 2, 3, 4] as const) {
    const name = t(`room${n}Name`);
    if (!name) continue;
    const rows: ShowroomCard["rows"] = [];
    for (const r of [1, 2] as const) {
      const label = t(`room${n}Label${r}`);
      const value = t(`room${n}Value${r}`);
      if (label && value) rows.push({ label, value });
    }
    rooms.push({ key: `room${n}`, name, media: mediaOf(ctx, "home.showrooms", `room${n}Media`), link: liveLink(ctx, ctx.slots.link("home.showrooms", `room${n}Link`)), rows });
  }
  if (rooms.length === 0) return undefined;
  const contact = contactHref(ctx);
  const contactLabel = t("contactLabel");
  const more = liveLink(ctx, ctx.slots.link("home.showrooms", "moreLink"));
  return {
    title: t("title") ?? "",
    more: more?.internal ? { href: more.href, label: more.label } : undefined,
    contact: contact && contactLabel ? { href: contact, label: contactLabel } : undefined,
    rooms,
    button: liveLink(ctx, ctx.slots.link("home.showrooms", "buttonLink")),
    slideLabelFormat: t("slideLabelFormat") ?? "",
  };
}

/**
 * Heading with arrow; four cards as a grid above 860 and as an autoplay slider (3 s, no controls)
 * at or below it — both are in the HTML, CSS shows one; an outlined button.
 */
export function HomeShowrooms({ data }: { data: HomeShowroomsData }) {
  const cards = data.rooms.map((room) => <ShowroomCardView key={room.key} room={room} contact={data.contact} />);
  return (
    <section className="i2-sec i2-rooms" data-section="home.showrooms" aria-labelledby={data.title ? "i2-rooms-title" : undefined}>
      <div className="i2-wrap">
        {data.title ? <SectionHeading title={data.title} id="i2-rooms-title" more={data.more} /> : null}
        <div className="i2-rooms__grid">{cards}</div>
        <Carousel label={data.title} className="i2-rooms__slider" autoplay dwell={3000} duration={500} progress="none" controls={false} slideLabelFormat={data.slideLabelFormat}>
          {cards}
        </Carousel>
        {data.button ? (
          <p className="i2-btn-row">
            {data.button.internal ? (
              <Link href={data.button.href} className="i2-btn i2-btn--outline">
                {data.button.label}
              </Link>
            ) : (
              <a href={data.button.href} className="i2-btn i2-btn--outline">
                {data.button.label}
              </a>
            )}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ShowroomCardView({ room, contact }: { room: ShowroomCard; contact?: { href: string; label: string } }) {
  return (
    <article className="i2-room" data-room={room.key}>
      {room.media ? (
        <div className="i2-room__media">
          <img src={room.media.src} width={room.media.width} height={room.media.height} alt={room.media.alt} loading="lazy" decoding="async" />
        </div>
      ) : null}
      <div className="i2-room__head">
        <h3 className="i2-room__name">{room.name}</h3>
        {contact || room.link ? (
          <span className="i2-room__btns">
            {contact ? (
              <Link href={contact.href} className="i2-room__btn i2-room__btn--black">
                {contact.label}
              </Link>
            ) : null}
            {room.link?.internal ? (
              <Link href={room.link.href} className="i2-room__btn i2-room__btn--outline">
                {room.link.label}
              </Link>
            ) : room.link ? (
              <a href={room.link.href} className="i2-room__btn i2-room__btn--outline">
                {room.link.label}
              </a>
            ) : null}
          </span>
        ) : null}
      </div>
      {room.rows.length > 0 ? (
        <dl className="i2-room__rows">
          {room.rows.map((r, i) => (
            <div key={i} className="i2-room__row">
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
