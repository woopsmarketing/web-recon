import Link from "../../../components/ui/Link";
import type { DetailData } from "./model";
import { Arrow, Photo, REVIEW_ID, photoGroups } from "./parts";
import { ZoomPhoto, ZoomScope } from "./zoom";

/**
 * detail.gallery (PD-A) — an image-led project page: the cover as a cinematic opening image, a
 * centred title block (지역 · the page's one <h1> · the summary · consult / review links), the facts
 * as one quiet band, then the photographs in a calm rhythm — a single photograph, an offset pair, a
 * wide frame — group by group under the group's name. After them: the story, the before / after
 * pairs, the customer review, the price block, related projects, and the way back beside the
 * consult link. Everything the classic detail page shows is here; a block without data is absent.
 * Reads only its data (detail/build.data.ts). Every photograph of the project opens in the classic
 * photo viewer (zoom.tsx); nothing slides.
 */
export function Section({ data }: { data: DetailData }) {
  const { price } = data;
  const groups = data.photos ? photoGroups(data.photos.groups) : [];
  const priced = Boolean(price.total || price.withheld || price.rows.length > 0 || price.notes.length > 0 || data.scope);
  let singles = 0;
  return (
    <ZoomScope data={data}>
      <article className="ds-detail-gallery" data-section="portfolio.detail">
        <div className="ds-detail-gallery__inner">
          <p className="ds-detail-gallery__crumb">
            <Link href={data.back.href} className="ds-detail-gallery__back">
              <Arrow className="ds-detail-gallery__back-arrow" back />
              <span>{data.back.label}</span>
            </Link>
          </p>

          <div className="ds-detail-gallery__opening">
            <ZoomPhoto image={data.cover} className="ds-detail-gallery__opening-image" zoomClass="ds-detail-gallery__zoom" eager />
          </div>

          <header className="ds-detail-gallery__head">
            {data.location ? <p className="ds-detail-gallery__kicker">{data.location}</p> : null}
            <h1 className="ds-detail-gallery__title">{data.title}</h1>
            {data.summary ? <p className="ds-detail-gallery__lede">{data.summary}</p> : null}
            {data.consult || data.reviewJump ? (
              <p className="ds-detail-gallery__actions">
                {data.consult ? (
                  <Link href={data.consult.href} className="ds-detail-gallery__consult" data-detail-consult="">
                    <span>{data.consult.label}</span>
                    <Arrow className="ds-detail-gallery__link-arrow" />
                  </Link>
                ) : null}
                {data.reviewJump ? (
                  <a href={`#${REVIEW_ID}`} className="ds-detail-gallery__jump" data-detail-review-jump="">
                    {data.reviewJump}
                  </a>
                ) : null}
              </p>
            ) : null}
          </header>

          {data.facts.length > 0 ? (
            <dl className="ds-detail-gallery__facts" data-facts="">
              {data.facts.map((fact) => (
                <div key={fact.key} className="ds-detail-gallery__fact" data-fact={fact.key}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {data.photos ? (
            <section className="ds-detail-gallery__photos" data-gallery="">
              {data.photos.title ? <h2 className="ds-detail-gallery__sr">{data.photos.title}</h2> : null}
              {groups.map((group, g) => (
                <div key={g} className="ds-detail-gallery__group">
                  {group.name ? <h3 className="ds-detail-gallery__group-name">{group.name}</h3> : null}
                  {group.modules.map((module) => {
                    if (module.kind === "pair") {
                      return (
                        <div key={module.turn} className={module.turn % 2 === 1 ? "ds-detail-gallery__pair ds-detail-gallery__pair--flip" : "ds-detail-gallery__pair"}>
                          {module.photos.map((photo, i) => (
                            <ZoomPhoto key={i} image={photo} className="ds-detail-gallery__photo" zoomClass="ds-detail-gallery__zoom" />
                          ))}
                        </div>
                      );
                    }
                    // an upright photograph keeps its frame; every second level one is set wide
                    const wide = !module.portrait && singles++ % 2 === 1;
                    const kind = module.portrait ? "ds-detail-gallery__single--upright" : wide ? "ds-detail-gallery__single--wide" : "";
                    return (
                      <div key={module.turn} className={kind ? `ds-detail-gallery__single ${kind}` : "ds-detail-gallery__single"}>
                        <ZoomPhoto image={module.photos[0]!} className="ds-detail-gallery__photo" zoomClass="ds-detail-gallery__zoom" />
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>
          ) : null}

          {data.story ? (
            <section className="ds-detail-gallery__block ds-detail-gallery__story" data-story="">
              {data.story.title ? <h2 className="ds-detail-gallery__heading">{data.story.title}</h2> : null}
              <div className="ds-detail-gallery__prose">
                {data.story.paragraphs.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </section>
          ) : null}

          {data.beforeAfter ? (
            <section className="ds-detail-gallery__block" data-before-after="">
              {data.beforeAfter.title ? <h2 className="ds-detail-gallery__heading">{data.beforeAfter.title}</h2> : null}
              <ul className="ds-detail-gallery__compare">
                {data.beforeAfter.pairs.map((pair, i) => (
                  <li key={i} className="ds-detail-gallery__compare-pair">
                    <figure className="ds-detail-gallery__shot">
                      <ZoomPhoto image={pair.before} className="ds-detail-gallery__photo" zoomClass="ds-detail-gallery__zoom" />
                      <figcaption>
                        {data.beforeAfter!.before}
                        <span className="ds-detail-gallery__sr"> — {pair.group}</span>
                      </figcaption>
                    </figure>
                    <figure className="ds-detail-gallery__shot">
                      <ZoomPhoto image={pair.after} className="ds-detail-gallery__photo" zoomClass="ds-detail-gallery__zoom" />
                      <figcaption>
                        {data.beforeAfter!.after}
                        <span className="ds-detail-gallery__sr"> — {pair.group}</span>
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.quote ? (
            <section className="ds-detail-gallery__block ds-detail-gallery__review" id={REVIEW_ID} data-review="">
              {data.quote.title ? <h2 className="ds-detail-gallery__heading">{data.quote.title}</h2> : null}
              <blockquote className="ds-detail-gallery__quote">
                <p>{data.quote.text}</p>
                {data.quote.attribution ? <footer className="ds-detail-gallery__by">{data.quote.attribution}</footer> : null}
              </blockquote>
            </section>
          ) : null}

          {priced ? (
            <section className="ds-detail-gallery__block ds-detail-gallery__price" data-total-block="">
              {price.title ? <h2 className="ds-detail-gallery__heading">{price.title}</h2> : null}
              {price.total || price.withheld ? (
                <p className="ds-detail-gallery__total">
                  {price.label ? <span className="ds-detail-gallery__total-label">{price.label}</span> : null}
                  {price.total ? (
                    <span className="ds-detail-gallery__total-figure" data-total-amount="">
                      <strong>{price.total.figure}</strong>
                      <small>{price.total.unit}</small>
                    </span>
                  ) : (
                    <span className="ds-detail-gallery__withheld" data-total-withheld="">
                      {price.withheld}
                    </span>
                  )}
                </p>
              ) : null}
              {price.rows.length > 0 || data.scope ? (
                <dl className="ds-detail-gallery__rows">
                  {price.rows.map((row) => (
                    <div key={row.label} className="ds-detail-gallery__row">
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                  {data.scope ? (
                    <div className="ds-detail-gallery__row" data-scope="">
                      <dt>{data.scope.label}</dt>
                      <dd>
                        <ul className="ds-detail-gallery__scope">
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
                <ul className="ds-detail-gallery__notes">
                  {price.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          {data.related ? (
            <section className="ds-detail-gallery__block ds-detail-gallery__related" data-related="">
              {data.related.title ? <h2 className="ds-detail-gallery__heading">{data.related.title}</h2> : null}
              <ul className="ds-detail-gallery__others">
                {data.related.items.map((item) => (
                  <li key={item.id} className="ds-detail-gallery__other" data-project-card={item.id}>
                    <Link href={item.href} className="ds-detail-gallery__other-link">
                      <div className="ds-detail-gallery__other-media">
                        <Photo image={item.cover} className="ds-detail-gallery__other-image" />
                      </div>
                      <h3 className="ds-detail-gallery__other-name">{item.title}</h3>
                      {item.location || item.area ? (
                        <p className="ds-detail-gallery__other-meta">
                          {item.location ? <span>{item.location}</span> : null}
                          {item.area ? <span>{item.area}</span> : null}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="ds-detail-gallery__end">
            <Link href={data.back.href} className="ds-detail-gallery__back" data-detail-back="">
              <Arrow className="ds-detail-gallery__back-arrow" back />
              <span>{data.back.label}</span>
            </Link>
            {data.consult ? (
              <Link href={data.consult.href} className="ds-detail-gallery__consult">
                <span>{data.consult.label}</span>
                <Arrow className="ds-detail-gallery__link-arrow" />
              </Link>
            ) : null}
          </div>
        </div>
      </article>
    </ZoomScope>
  );
}
