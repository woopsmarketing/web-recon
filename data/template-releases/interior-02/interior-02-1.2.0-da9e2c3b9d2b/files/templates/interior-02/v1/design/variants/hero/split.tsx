import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { HeroSplitData } from "./model";
import { ArrowLink, HeroPicture } from "./parts";

/**
 * hero.split (HE-D) — text and actions beside one photograph: two columns from 1024 (text left,
 * photograph right), the photograph first below that. The company name as a label, the heading, the
 * supporting sentence when the site has one, the consultation button, and the phone number as a
 * tel: link — only for a site that has one. Without a photograph (`--solo`) the text stands alone
 * in one centred column.
 */
export function Section({ data }: { data: HeroSplitData }) {
  const { label, heading, line, image, consult, phone, more } = data;
  return (
    <section className={image ? "ds-hero-split" : "ds-hero-split ds-hero-split--solo"} data-section="home.hero">
      <div className="ds-hero-split__inner">
        {image ? (
          <div className="ds-hero-split__media">
            <HeroPicture image={image} className="ds-hero-split__img" />
          </div>
        ) : null}
        <div className="ds-hero-split__copy">
          {label ? <p className="ds-hero-split__label">{label}</p> : null}
          <h2 className="ds-hero-split__heading">{heading}</h2>
          {line ? <p className="ds-hero-split__line">{line}</p> : null}
          {consult || phone ? (
            <div className="ds-hero-split__actions">
              {consult ? (
                <Link href={consult.href} className="ds-hero-split__cta">
                  <span>{consult.label}</span>
                  <Icon name="arrow-right" size={18} />
                </Link>
              ) : null}
              {phone ? (
                <a href={phone.href} className="ds-hero-split__tel">
                  <Icon name="phone" size={18} />
                  {phone.label ? <span className="ds-hero-split__tel-label">{phone.label}</span> : null}
                  <span className="ds-hero-split__tel-number">{phone.number}</span>
                </a>
              ) : null}
            </div>
          ) : null}
          {more ? <ArrowLink link={more} className="ds-hero-split__more" /> : null}
        </div>
      </div>
    </section>
  );
}
