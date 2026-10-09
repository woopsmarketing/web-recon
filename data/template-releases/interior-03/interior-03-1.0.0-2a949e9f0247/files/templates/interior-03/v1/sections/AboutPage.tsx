import { PageTitle } from "../components/ui/PageTitle";
import { SubVisual } from "../components/ui/SubVisual";
import { slotMedia, type Media } from "../lib/media";
import type { Ctx } from "./types";

const SECTION = "about.page";

export interface AboutPageData {
  title: string;
  lead?: string;
  visual?: { media?: Media; text?: string };
  /** The greeting block: headline, intro paragraphs and the quote beside them. */
  greeting?: { headline?: string; intro?: string[]; quote?: string };
  /** The wide picture; `narrow` (optional) replaces it ≤ 480. */
  picture?: { wide: Media; narrow?: Media };
  /** The body copy (indented from the left on wide screens) and the signature under it. */
  body?: { paragraphs?: string[]; signRole?: string; signName?: string };
}

/**
 * about.page — the company greeting in the shared sub-page frame: (1) banner + page title;
 * (2) the greeting block: the 21px headline and the short intro in the left 35%, the ornamental
 * quote (heading font, wide letter-spacing, italic) centred in the right 65%; (3) the wide
 * picture (a narrow variant takes over ≤ 480 when the site sets one); (4) the body copy, indented
 * 35% from the left on wide screens, justified, with the right-aligned signature under it.
 * ≤ 768 everything stacks full width and the quote is hidden. A block whose slots are all unset
 * is not rendered; a page with nothing set still shows the banner and its title.
 */
export function aboutPage(ctx: Ctx): AboutPageData {
  const t = (key: string) => ctx.slots.text(SECTION, key);
  const rich = (key: string) => ctx.slots.richText(SECTION, key)?.paragraphs;
  const title = t("title") ?? "";
  const lead = t("lead");

  const visualMedia = slotMedia(ctx, SECTION, "visualMedia");
  const visualText = t("visualText");
  const visual = visualMedia || visualText ? { media: visualMedia, text: visualText } : undefined;

  const headline = t("headline");
  const intro = rich("intro");
  const quote = t("quote");
  const greeting = headline || intro || quote ? { headline, intro, quote } : undefined;

  const wide = slotMedia(ctx, SECTION, "wideMedia");
  const narrow = slotMedia(ctx, SECTION, "wideMediaNarrow");
  // the narrow variant alone is shown at every width (it is the only picture there is)
  const picture = wide ? { wide, narrow } : narrow ? { wide: narrow } : undefined;

  const paragraphs = rich("body");
  const signRole = t("signRole");
  const signName = t("signName");
  const body = paragraphs || signRole || signName ? { paragraphs, signRole, signName } : undefined;

  return { title, lead, visual, greeting, picture, body };
}

export function AboutPage({ data }: { data: AboutPageData }) {
  const { title, lead, visual, greeting, picture, body } = data;
  // with a narrow variant both pictures are in the page and CSS shows one; lazy loading keeps the
  // hidden one from being downloaded. A lone wide picture loads eagerly (it is near the top).
  const lazy = picture?.narrow ? ("lazy" as const) : undefined;
  return (
    <div className="i3-about" data-section="about.page">
      <SubVisual title={title} text={visual?.text} media={visual?.media} />
      <div className="i3-content">
        <div className="i3-wrap">
          <PageTitle title={title} lead={lead} />
          {greeting || picture || body ? (
            <div className="i3-page i3-prose i3-about__page">
              {greeting ? (
                <div className="i3-about__greet">
                  <div className="i3-about__greet-in">
                    {greeting.headline ? <p className="i3-about__headline">{greeting.headline}</p> : null}
                    {greeting.intro ? (
                      <div className="i3-about__intro">
                        {greeting.intro.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {greeting.quote ? (
                    <p className="i3-about__quote">
                      {greeting.quote}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {picture ? (
                <figure className="i3-about__pic" data-narrow={picture.narrow ? "" : undefined}>
                  <img className="i3-about__pic-wide" src={picture.wide.src} width={picture.wide.width} height={picture.wide.height} alt={picture.wide.alt} decoding="async" loading={lazy} />
                  {picture.narrow ? (
                    <img className="i3-about__pic-narrow" src={picture.narrow.src} width={picture.narrow.width} height={picture.narrow.height} alt={picture.narrow.alt} decoding="async" loading="lazy" />
                  ) : null}
                </figure>
              ) : null}

              {body ? (
                <div className="i3-about__body">
                  {body.paragraphs ? (
                    <div className="i3-about__copy">
                      {body.paragraphs.map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                  ) : null}
                  {body.signRole || body.signName ? (
                    <p className="i3-about__sign">
                      {body.signRole ? <span className="i3-about__sign-role">{body.signRole}</span> : null}
                      {body.signName ? <span className="i3-about__sign-name">{body.signName}</span> : null}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
