import Link from "../../../components/ui/Link";
import type { DetailData } from "./model";
import { Arrow, Photo, REVIEW_ID, photoGroups } from "./parts";
import { ZoomPhoto, ZoomScope } from "./zoom";

/**
 * detail.typographic (PD-B) — a title-led project page: the name as the page's one <h1>, set
 * large, with 지역 · 면적 as its muted second line; the cover across the column; then everything on
 * one axis — a narrow margin column for the labels and a text column that starts a third of the
 * way in: the summary set as an intro, the facts as a grid, the photographs group by group under
 * a numbered group label, the story, the before / after pairs, the price block and the related
 * projects as index rows. The customer review is the page's one brand block. Everything the
 * classic detail page shows is here; a block without data is absent. Reads only its data
 * (detail/build.data.ts). Every photograph of the project opens in the classic photo viewer (zoom.tsx).
 */
const ordinal = (index: number): string => String(index + 1).padStart(2, "0");

export function Section({ data }: { data: DetailData }) {
  const { price } = data;
  const groups = data.photos ? photoGroups(data.photos.groups) : [];
  const priced = Boolean(price.total || price.withheld || price.rows.length > 0 || price.notes.length > 0 || data.scope);
  return (
    <ZoomScope data={data}>
      <article className="ds-detail-typographic" data-section="portfolio.detail">
        <div className="ds-detail-typographic__inner">
          <p className="ds-detail-typographic__crumb">
            <Link href={data.back.href} className="ds-detail-typographic__back">
              <Arrow className="ds-detail-typographic__back-arrow" back />
              <span>{data.back.label}</span>
            </Link>
          </p>

          <header className="ds-detail-typographic__head">
            <h1 className="ds-detail-typographic__title">
              <span className="ds-detail-typographic__name">{data.title}</span>
              {data.location || data.area ? (
                <span className="ds-detail-typographic__sub">
                  {data.location ? <span>{data.location}</span> : null}
                  {data.area ? <span>{data.area}</span> : null}
                </span>
              ) : null}
            </h1>
          </header>

          <div className="ds-detail-typographic__cover">
            <ZoomPhoto image={data.cover} className="ds-detail-typographic__cover-image" zoomClass="ds-detail-typographic__zoom" eager />
          </div>

          {data.summary || data.facts.length > 0 || data.consult || data.reviewJump ? (
            <div className="ds-detail-typographic__intro">
              {data.summary ? <p className="ds-detail-typographic__lede">{data.summary}</p> : null}
              {data.facts.length > 0 ? (
                <dl className="ds-detail-typographic__facts" data-facts="">
                  {data.facts.map((fact) => (
                    <div key={fact.key} className="ds-detail-typographic__fact" data-fact={fact.key}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {data.consult || data.reviewJump ? (
                <p className="ds-detail-typographic__actions">
                  {data.consult ? (
                    <Link href={data.consult.href} className="ds-detail-typographic__consult" data-detail-consult="">
                      <span>{data.consult.label}</span>
                      <Arrow className="ds-detail-typographic__link-arrow" />
                    </Link>
                  ) : null}
                  {data.reviewJump ? (
                    <a href={`#${REVIEW_ID}`} className="ds-detail-typographic__jump" data-detail-review-jump="">
                      {data.reviewJump}
                    </a>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}

          {data.photos ? (
            <section className="ds-detail-typographic__photos" data-gallery="">
              {data.photos.title ? <h2 className="ds-detail-typographic__sr">{data.photos.title}</h2> : null}
              {groups.map((group, g) => (
                <div key={g} className="ds-detail-typographic__group">
                  <h3 className="ds-detail-typographic__label">
                    <span className="ds-detail-typographic__num" aria-hidden="true">
                      {ordinal(g)}
                    </span>
                    {group.name ? <span>{group.name}</span> : null}
                  </h3>
                  <div className="ds-detail-typographic__frames">
                    {group.modules.map((module) => (
                      <div key={module.turn} className={module.kind === "pair" ? "ds-detail-typographic__pair" : module.portrait ? "ds-detail-typographic__frame ds-detail-typographic__frame--upright" : "ds-detail-typographic__frame"}>
                        {module.photos.map((photo, i) => (
                          <ZoomPhoto key={i} image={photo} className="ds-detail-typographic__photo" zoomClass="ds-detail-typographic__zoom" />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {data.story ? (
            <section className="ds-detail-typographic__section" data-story="">
              <h2 className="ds-detail-typographic__heading">{data.story.title}</h2>
              <div className="ds-detail-typographic__prose">
                {data.story.paragraphs.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </section>
          ) : null}

          {data.beforeAfter ? (
            <section className="ds-detail-typographic__section" data-before-after="">
              <h2 className="ds-detail-typographic__heading">{data.beforeAfter.title}</h2>
              <ul className="ds-detail-typographic__compare">
                {data.beforeAfter.pairs.map((pair, i) => (
                  <li key={i} className="ds-detail-typographic__compare-pair">
                    <figure className="ds-detail-typographic__shot">
                      <ZoomPhoto image={pair.before} className="ds-detail-typographic__photo" zoomClass="ds-detail-typographic__zoom" />
                      <figcaption>
                        {data.beforeAfter!.before}
                        <span className="ds-detail-typographic__sr"> — {pair.group}</span>
                      </figcaption>
                    </figure>
                    <figure className="ds-detail-typographic__shot">
                      <ZoomPhoto image={pair.after} className="ds-detail-typographic__photo" zoomClass="ds-detail-typographic__zoom" />
                      <figcaption>
                        {data.beforeAfter!.after}
                        <span className="ds-detail-typographic__sr"> — {pair.group}</span>
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {data.quote ? (
          <section className="ds-detail-typographic__review" id={REVIEW_ID} data-review="">
            <div className="ds-detail-typographic__inner ds-detail-typographic__review-inner">
              <h2 className="ds-detail-typographic__heading ds-detail-typographic__heading--block">{data.quote.title}</h2>
              <blockquote className="ds-detail-typographic__quote">
                <p>{data.quote.text}</p>
                {data.quote.attribution ? <footer className="ds-detail-typographic__by">{data.quote.attribution}</footer> : null}
              </blockquote>
            </div>
          </section>
        ) : null}

        <div className="ds-detail-typographic__inner">
          {priced ? (
            <section className="ds-detail-typographic__section" data-total-block="">
              <h2 className="ds-detail-typographic__heading">{price.title}</h2>
              <div className="ds-detail-typographic__price">
                {price.total || price.withheld ? (
                  <p className="ds-detail-typographic__total">
                    {price.label ? <span className="ds-detail-typographic__total-label">{price.label}</span> : null}
                    {price.total ? (
                      <span className="ds-detail-typographic__total-figure" data-total-amount="">
                        <strong>{price.total.figure}</strong>
                        <small>{price.total.unit}</small>
                      </span>
                    ) : (
                      <span className="ds-detail-typographic__withheld" data-total-withheld="">
                        {price.withheld}
                      </span>
                    )}
                  </p>
                ) : null}
                {price.rows.length > 0 || data.scope ? (
                  <dl className="ds-detail-typographic__rows">
                    {price.rows.map((row) => (
                      <div key={row.label} className="ds-detail-typographic__row">
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                    {data.scope ? (
                      <div className="ds-detail-typographic__row" data-scope="">
                        <dt>{data.scope.label}</dt>
                        <dd>
                          <ul className="ds-detail-typographic__scope">
                            {data.scope.items.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                {price.notes.length > 0 ? (
                  <ul className="ds-detail-typographic__notes">
                    {price.notes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ) : null}

          {data.related ? (
            <section className="ds-detail-typographic__section" data-related="">
              <h2 className="ds-detail-typographic__heading">{data.related.title}</h2>
              <ol className="ds-detail-typographic__others">
                {data.related.items.map((item) => (
                  <li key={item.id} className="ds-detail-typographic__other" data-project-card={item.id}>
                    <Link href={item.href} className="ds-detail-typographic__other-link">
                      <h3 className="ds-detail-typographic__other-name">{item.title}</h3>
                      {item.location || item.area ? (
                        <span className="ds-detail-typographic__other-meta">
                          {item.location ? <span>{item.location}</span> : null}
                          {item.area ? <span>{item.area}</span> : null}
                        </span>
                      ) : null}
                      <span className="ds-detail-typographic__other-thumb">
                        <Photo image={item.cover} className="ds-detail-typographic__other-image" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <div className="ds-detail-typographic__end">
            <Link href={data.back.href} className="ds-detail-typographic__back" data-detail-back="">
              <Arrow className="ds-detail-typographic__back-arrow" back />
              <span>{data.back.label}</span>
            </Link>
            {data.consult ? (
              <Link href={data.consult.href} className="ds-detail-typographic__consult ds-detail-typographic__consult--end">
                <span>{data.consult.label}</span>
                <Arrow className="ds-detail-typographic__link-arrow" />
              </Link>
            ) : null}
          </div>
        </div>
      </article>
    </ZoomScope>
  );
}
