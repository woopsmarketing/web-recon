import Link from "../components/ui/Link";
import { Fragment } from "react";
import { BandIcon } from "../components/home/BandIcons";
import { liveLink, type LiveLink } from "../lib/links";
import { slotMedia, type Media } from "../lib/media";
import type { BandIconName } from "../manifest/home";
import type { Ctx } from "./types";

/** Up to four link slots (link1 … link4). */
const BAND_MAX_LINKS = 4;

export interface BandLink extends LiveLink {
  icon?: BandIconName;
}

/** A piece of the title: plain, or one of the parts drawn bold. */
export interface TitleSegment {
  text: string;
  strong: boolean;
}

export interface HomeBandData {
  eyebrow?: string;
  title?: TitleSegment[];
  media?: Media;
  links: BandLink[];
}

/**
 * The title split around its bold parts: every mark that occurs in the title is drawn bold at
 * its first occurrence (left to right); a mark that is absent or overlaps an earlier one is ignored.
 */
export function markTitle(title: string, marks: readonly (string | undefined)[]): TitleSegment[] {
  const found = marks
    .filter((m): m is string => Boolean(m))
    .map((m) => ({ m, at: title.indexOf(m) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at);
  const out: TitleSegment[] = [];
  let pos = 0;
  for (const { m, at } of found) {
    if (at < pos) continue;
    if (at > pos) out.push({ text: title.slice(pos, at), strong: false });
    out.push({ text: m, strong: true });
    pos = at + m.length;
  }
  if (pos < title.length) out.push({ text: title.slice(pos), strong: false });
  return out;
}

/**
 * home.band — eyebrow, title (with its bold parts), photo and the live links: link n is kept only
 * when its destination exists in this build (liveLink) and carries `icons[n-1]` of the settings
 * when there is one. Disabled, or no title and no live link → nothing.
 */
export function homeBand(ctx: Ctx): HomeBandData | undefined {
  const settings = ctx.settings["home.band"];
  if (!settings.enabled) return undefined;
  const t = (key: string) => ctx.slots.text("home.band", key);
  const title = t("title");
  const links: BandLink[] = [];
  for (let n = 1; n <= BAND_MAX_LINKS; n++) {
    const live = liveLink(ctx, ctx.slots.link("home.band", `link${n}`));
    if (live) links.push({ ...live, icon: settings.icons[n - 1] });
  }
  if (!title && links.length === 0) return undefined;
  return {
    eyebrow: t("eyebrow"),
    title: title ? markTitle(title, [t("titleMarkA"), t("titleMarkB")]) : undefined,
    media: slotMedia(ctx, "home.band", "media"),
    links,
  };
}

/**
 * The quiet band (80px padding; 50px ≤ 768; 40 / 20 ≤ 480): the photo covers it from behind
 * (veiled on the text side on wide screens, lightly all over on narrow ones), the text is left-
 * aligned (centred ≤ 480) and the buttons are 130px circles (100px ≤ 768; 120px in a 2 × 2 block
 * ≤ 480) with a line glyph over the label. The band is below the hero: the photo loads lazily.
 */
export function HomeBand({ data }: { data: HomeBandData }) {
  const { media, links } = data;
  return (
    <section className="i3-band" data-section="home.band" aria-labelledby={data.title ? "i3-band-title" : undefined}>
      {media ? <img className="i3-band__bg" src={media.src} width={media.width} height={media.height} alt={media.alt} loading="lazy" decoding="async" /> : null}
      <div className="i3-wrap i3-band__in">
        {data.eyebrow ? <p className="i3-band__eyebrow">{data.eyebrow}</p> : null}
        {data.title ? (
          <h2 className="i3-band__title" id="i3-band-title">
            {data.title.map((s, i) => (s.strong ? <strong key={i}>{s.text}</strong> : <Fragment key={i}>{s.text}</Fragment>))}
          </h2>
        ) : null}
        {links.length > 0 ? (
          <ul className="i3-band__links">
            {links.map((l, i) => {
              const inner = (
                <>
                  {l.icon ? <BandIcon name={l.icon} /> : null}
                  <span className="i3-band__label">{l.label}</span>
                </>
              );
              return (
                <li key={i} className="i3-band__item">
                  {l.internal ? (
                    <Link href={l.href} className="i3-band__btn" data-band-link={i + 1}>
                      {inner}
                    </Link>
                  ) : (
                    <a href={l.href} className="i3-band__btn" data-band-link={i + 1}>
                      {inner}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
