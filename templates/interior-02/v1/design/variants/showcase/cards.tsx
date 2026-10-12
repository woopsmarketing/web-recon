import Link from "../../../components/ui/Link";
import type { ShowcaseData, ShowcaseItem } from "./model";
import { Arrow, Cover } from "./parts";

/**
 * showcase.cards (PS-D + fact chips) — a uniform card grid (3 / 2 / 1 columns): a 4:3 photograph,
 * the category as a small line above the name, and a row of fact chips. A chip exists only for a
 * field the project record holds — 지역 · 면적 · 공사 기간 · 리모델링 구분 — and a record without the
 * field has no chip. `category` (the line above the name) and `projectType` (a chip) are two
 * fields and are shown as two. The whole card is one link; the button under the grid leads to the
 * list. Like the classic grid, a phone shows the first six cards when the list can be reached. A
 * selection of one is a single wide card (photograph beside its text, with the project summary), of
 * two a pair.
 * Reads only its data (showcase/items.data.ts).
 */
type ChipKey = "location" | "area" | "duration" | "projectType";
const CHIPS: readonly ChipKey[] = ["location", "area", "duration", "projectType"];

function chips(item: ShowcaseItem): { key: ChipKey; value: string }[] {
  return CHIPS.flatMap((key) => {
    const value = item[key]?.trim();
    return value ? [{ key, value }] : [];
  });
}

export function Section({ data }: { data: ShowcaseData }) {
  const titled = data.title !== "";
  const { labels } = data;
  // one project is set as a single wide card and two share the row, so a short selection still fills the section
  const solo = data.items.length === 1;
  const grid = ["ds-showcase-cards__grid"];
  if (data.more) grid.push("ds-showcase-cards__grid--capped");
  if (solo) grid.push("ds-showcase-cards__grid--one");
  if (data.items.length === 2) grid.push("ds-showcase-cards__grid--two");
  return (
    <section className="ds-showcase-cards" data-section="home.projects" aria-labelledby={titled ? "ds-showcase-cards-title" : undefined}>
      <div className="ds-showcase-cards__inner">
        {titled ? (
          <h2 className="ds-showcase-cards__title" id="ds-showcase-cards-title">
            {data.title}
          </h2>
        ) : null}
        <ul className={grid.join(" ")}>
          {data.items.map((item) => {
            const facts = chips(item);
            return (
              <li key={item.id} className="ds-showcase-cards__card" data-project-card={item.id}>
                <Link href={item.href} className="ds-showcase-cards__link">
                  <div className="ds-showcase-cards__media">
                    <Cover image={item.cover} className="ds-showcase-cards__image" />
                  </div>
                  <div className="ds-showcase-cards__body">
                    {item.category ? (
                      <span className="ds-showcase-cards__category" data-field="category">
                        <span className="ds-showcase-cards__sr">{labels.category} </span>
                        {item.category}
                      </span>
                    ) : null}
                    <h3 className="ds-showcase-cards__name">{item.title}</h3>
                    {solo && item.summary ? <p className="ds-showcase-cards__summary">{item.summary}</p> : null}
                    {facts.length > 0 ? (
                      <ul className="ds-showcase-cards__chips">
                        {facts.map((fact) => (
                          <li key={fact.key} className="ds-showcase-cards__chip" data-chip={fact.key}>
                            <span className="ds-showcase-cards__sr">{labels[fact.key]} </span>
                            {fact.value}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {data.more ? (
          <p className="ds-showcase-cards__foot">
            <Link href={data.more.href} className="ds-showcase-cards__more">
              <span>{data.more.label}</span>
              <Arrow className="ds-showcase-cards__more-arrow" />
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
