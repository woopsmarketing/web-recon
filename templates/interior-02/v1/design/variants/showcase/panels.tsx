import Link from "../../../components/ui/Link";
import type { ShowcaseData, ShowcaseItem } from "./model";
import { Arrow, Cover } from "./parts";

/**
 * showcase.panels (PS-B) — one project per wide panel: the photograph (4:3 on a phone, 16:9 on a
 * tablet, 2.35:1 on a desktop) with a small placard that names it (name · 지역 · 면적); the whole
 * panel is one link. Up to four projects are all panels; a longer selection opens with three
 * panels and sets the rest as a quiet contact sheet under them, so the section stays a section.
 * Reads only its data (showcase/items.data.ts).
 */
const LEAD = 3;

function Meta({ item, labels, className }: { item: ShowcaseItem; labels: ShowcaseData["labels"]; className: string }) {
  if (!item.location && !item.area) return null;
  return (
    <span className={className}>
      {item.location ? (
        <span data-field="location">
          <span className="ds-showcase-panels__sr">{labels.location} </span>
          {item.location}
        </span>
      ) : null}
      {item.area ? (
        <span data-field="area">
          <span className="ds-showcase-panels__sr">{labels.area} </span>
          {item.area}
        </span>
      ) : null}
    </span>
  );
}

export function Section({ data }: { data: ShowcaseData }) {
  const lead = data.items.length > LEAD + 1 ? data.items.slice(0, LEAD) : data.items;
  const rest = data.items.slice(lead.length);
  const titled = data.title !== "";
  return (
    <section className="ds-showcase-panels" data-section="home.projects" aria-labelledby={titled ? "ds-showcase-panels-title" : undefined}>
      <div className="ds-showcase-panels__inner">
        {titled ? (
          <h2 className="ds-showcase-panels__title" id="ds-showcase-panels-title">
            {data.title}
          </h2>
        ) : null}
        <ul className="ds-showcase-panels__list">
          {lead.map((item) => (
            <li key={item.id} className="ds-showcase-panels__panel" data-project-card={item.id}>
              <Link href={item.href} className="ds-showcase-panels__link">
                <div className="ds-showcase-panels__media">
                  <Cover image={item.cover} className="ds-showcase-panels__image" />
                </div>
                <div className="ds-showcase-panels__info">
                  <h3 className="ds-showcase-panels__name">{item.title}</h3>
                  <Meta item={item} labels={data.labels} className="ds-showcase-panels__meta" />
                  <Arrow className="ds-showcase-panels__arrow" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
        {rest.length > 0 ? (
          <ul className={rest.length === 2 || rest.length === 4 ? "ds-showcase-panels__sheet ds-showcase-panels__sheet--even" : "ds-showcase-panels__sheet"}>
            {rest.map((item) => (
              <li key={item.id} className="ds-showcase-panels__tile" data-project-card={item.id}>
                <Link href={item.href} className="ds-showcase-panels__link">
                  <div className="ds-showcase-panels__media ds-showcase-panels__media--tile">
                    <Cover image={item.cover} className="ds-showcase-panels__image" />
                  </div>
                  <div className="ds-showcase-panels__caption">
                    <h3 className="ds-showcase-panels__name ds-showcase-panels__name--tile">{item.title}</h3>
                    <Meta item={item} labels={data.labels} className="ds-showcase-panels__meta" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {data.more ? (
          <p className="ds-showcase-panels__foot">
            <Link href={data.more.href} className="ds-showcase-panels__more">
              <span>{data.more.label}</span>
              <Arrow className="ds-showcase-panels__more-arrow" />
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
