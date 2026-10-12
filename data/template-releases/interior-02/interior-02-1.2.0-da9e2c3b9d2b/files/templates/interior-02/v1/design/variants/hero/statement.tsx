import Link from "../../../components/ui/Link";
import type { HeroStatementData, HeroStripItem } from "./model";
import { ArrowLink } from "./parts";

/**
 * hero.statement (HE-C) — the type is the image: the company name as a small label, the hero
 * heading as the display line, a supporting sentence in the second tone, one link — and, when the
 * site has projects, a strip of their covers under it (staggered; two below 700, three from 700,
 * five from 1024 — the sheet hides the rest, and a hidden cover is lazy, so it is never fetched).
 * No project: no strip and no room left for one.
 */
export function Section({ data }: { data: HeroStatementData }) {
  const { label, heading, long, line, link, strip } = data;
  return (
    <section className={long ? "ds-hero-statement ds-hero-statement--long" : "ds-hero-statement"} data-section="home.hero">
      <div className="ds-hero-statement__inner">
        {label ? <p className="ds-hero-statement__label">{label}</p> : null}
        <h2 className="ds-hero-statement__heading">{heading}</h2>
        {line ? <p className="ds-hero-statement__line">{line}</p> : null}
        {link ? <ArrowLink link={link} className="ds-hero-statement__link" /> : null}
        {strip.length > 0 ? (
          <ul className={`ds-hero-statement__strip ds-hero-statement__strip--n${strip.length}`}>
            {strip.map((item, i) => (
              <li key={item.id} className="ds-hero-statement__item">
                <Shot item={item} eager={i < 2} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function Shot({ item, eager }: { item: HeroStripItem; eager: boolean }) {
  const { image } = item;
  const inner = (
    <>
      <span className="ds-hero-statement__frame">
        <img className="ds-hero-statement__img" src={image.src} width={image.width} height={image.height} alt={image.alt} loading={eager ? "eager" : "lazy"} decoding="async" />
      </span>
      <span className="ds-hero-statement__name">{item.title}</span>
      {item.place ? <span className="ds-hero-statement__place">{item.place}</span> : null}
    </>
  );
  return item.href ? (
    <Link href={item.href} className="ds-hero-statement__shot">
      {inner}
    </Link>
  ) : (
    <div className="ds-hero-statement__shot">{inner}</div>
  );
}
