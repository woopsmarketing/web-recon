import Link from "../components/ui/Link";
import { SectionHeading } from "../components/ui/SectionHeading";
import type { ProjectCardModel } from "../lib/projects";

export interface HomeRecentData {
  title: string;
  cards: ProjectCardModel[];
  more?: { href: string; label: string };
}

/** home.recent — the data function is sections/homeRecentData.ts (kept out of this file: the component is part of a runtime slot, i.e. browser code). */

/** Heading with arrow; 3-column grid (1 column ≤ 920) of image · title · one meta row; outlined button. */
export function HomeRecent({ data }: { data: HomeRecentData }) {
  return (
    <section className="i2-sec i2-recent" data-section="home.recent" aria-labelledby="i2-recent-title">
      <div className="i2-wrap">
        <SectionHeading title={data.title} id="i2-recent-title" more={data.more} />
        <ul className="i2-recent__grid">
          {data.cards.map((m) => {
            const meta = [m.category, m.location].filter((v): v is string => Boolean(v));
            return (
              <li key={m.id} className="i2-rcard" data-project-card={m.id}>
                <Link href={m.href} className="i2-rcard__link">
                  <span className="i2-rcard__media">
                    <img src={m.cover.src} width={m.cover.width} height={m.cover.height} alt={m.cover.alt} loading="lazy" decoding="async" />
                  </span>
                  <h3 className="i2-rcard__title">{m.title}</h3>
                  {meta.length > 0 ? (
                    <p className="i2-rcard__meta">
                      {meta.map((bit, i) => (
                        <span key={i}>{bit}</span>
                      ))}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        {data.more ? (
          <p className="i2-btn-row">
            <Link href={data.more.href} className="i2-btn i2-btn--outline">
              {data.more.label}
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
