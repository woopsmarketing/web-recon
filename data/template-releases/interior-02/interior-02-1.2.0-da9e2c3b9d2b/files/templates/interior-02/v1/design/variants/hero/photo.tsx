import type { HeroPhotoData } from "./model";
import { ArrowLink, HeroPicture } from "./parts";

/**
 * hero.photo (HE-A) — one full-bleed photograph. The text sits at the foot of the picture on a veil
 * that exists only where there is text: the project the picture shows (when the banner names one),
 * one short line, one quiet link. A photograph without any text is just the photograph.
 *
 * Without a photograph (`--plain`) the same three lines are set as type on the page surface.
 * The page's <h1> is the home page's; the line is an <h2>.
 */
export function Section({ data }: { data: HeroPhotoData }) {
  const { image, caption, heading, link } = data;
  return (
    <section className={image ? "ds-hero-photo" : "ds-hero-photo ds-hero-photo--plain"} data-section="home.hero">
      {image ? <HeroPicture image={image} className="ds-hero-photo__img" /> : null}
      {caption || heading || link ? (
        <div className="ds-hero-photo__bar">
          <div className="ds-hero-photo__inner">
            {caption ? <p className="ds-hero-photo__caption">{caption}</p> : null}
            {heading ? <h2 className="ds-hero-photo__heading">{heading}</h2> : null}
            {link ? <ArrowLink link={link} className="ds-hero-photo__link" /> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
