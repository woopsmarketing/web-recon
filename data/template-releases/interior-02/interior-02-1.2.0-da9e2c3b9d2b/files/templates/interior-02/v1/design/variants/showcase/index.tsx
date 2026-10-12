import Link from "../../../components/ui/Link";
import type { ShowcaseData } from "./model";
import { Arrow, Cover, ordinal } from "./parts";

/**
 * showcase.index (PS-C) — a typographic index: one row per project between hairlines — its number,
 * the name set large, a muted descriptor (지역 · 면적 · 주거 형태) and a small photograph that is
 * always there (nothing appears on hover only). The whole row is one link; long names wrap. The
 * row is complete without its photograph. Reads only its data (showcase/items.data.ts).
 */
export function Section({ data }: { data: ShowcaseData }) {
  const titled = data.title !== "";
  const { labels } = data;
  return (
    <section className="ds-showcase-index" data-section="home.projects" aria-labelledby={titled ? "ds-showcase-index-title" : undefined}>
      <div className="ds-showcase-index__inner">
        {titled ? (
          <h2 className="ds-showcase-index__title" id="ds-showcase-index-title">
            {data.title}
          </h2>
        ) : null}
        <ol className="ds-showcase-index__list">
          {data.items.map((item, i) => {
            const described = Boolean(item.location || item.area || item.propertyType);
            return (
              <li key={item.id} className="ds-showcase-index__row" data-project-card={item.id}>
                <Link href={item.href} className="ds-showcase-index__link">
                  <span className="ds-showcase-index__num" aria-hidden="true">
                    {ordinal(i)}
                  </span>
                  <h3 className="ds-showcase-index__name">{item.title}</h3>
                  {described ? (
                    <span className="ds-showcase-index__desc">
                      {item.location ? (
                        <span data-field="location">
                          <span className="ds-showcase-index__sr">{labels.location} </span>
                          {item.location}
                        </span>
                      ) : null}
                      {item.area ? (
                        <span data-field="area">
                          <span className="ds-showcase-index__sr">{labels.area} </span>
                          {item.area}
                        </span>
                      ) : null}
                      {item.propertyType ? (
                        <span data-field="propertyType">
                          <span className="ds-showcase-index__sr">{labels.propertyType} </span>
                          {item.propertyType}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {item.cover.src ? (
                    <span className="ds-showcase-index__thumb">
                      <Cover image={item.cover} className="ds-showcase-index__image" />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ol>
        {data.more ? (
          <p className="ds-showcase-index__foot">
            <Link href={data.more.href} className="ds-showcase-index__more">
              <span>{data.more.label}</span>
              <Arrow className="ds-showcase-index__more-arrow" />
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
