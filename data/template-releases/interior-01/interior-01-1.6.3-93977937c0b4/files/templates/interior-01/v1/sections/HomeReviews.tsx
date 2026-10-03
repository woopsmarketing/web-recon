import { SnapTrack } from "../components/SnapTrack";
import type { Ctx } from "./types";

export interface HomeReviewsData {
  title: string;
  media?: { src: string; width: number; height: number; alt: string };
  reviews: { id: string; text: string; attribution?: string }[];
  labels: { previous: string; next: string };
}

/**
 * home.reviews — the site's published reviews (content, stored order, bounded by the
 * `limit` setting). None → undefined: no heading-only shell, no empty track, no invented
 * quote. The section copy/media are slots; the review items are never slots.
 */
export function homeReviews(ctx: Ctx): HomeReviewsData | undefined {
  const settings = ctx.settings["home.reviews"];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list({ type: "reviews", limit: settings.limit });
  if (items.length === 0) return undefined;
  const media = ctx.slots.media("home.reviews", "media");
  return {
    title: ctx.slots.text("home.reviews", "title") ?? "",
    media: media ? { ...ctx.assets.resolve(media.asset), alt: media.alt } : undefined,
    reviews: items.map((r) => ({ id: r.id, text: r.text, attribution: r.attribution })),
    labels: { previous: ctx.slots.text("home.reviews", "previousLabel") ?? "", next: ctx.slots.text("home.reviews", "nextLabel") ?? "" },
  };
}

export function HomeReviews({ data }: { data: HomeReviewsData }) {
  return (
    <section id="reviews" className="i1-reviews" data-section="home.reviews" aria-labelledby="i1-reviews-title">
      <div className="i1-container">
        <div className={data.media ? "i1-reviews__inner i1-reviews__inner--media" : "i1-reviews__inner"}>
          {data.media ? (
            <div className="i1-reviews__media">
              <img src={data.media.src} width={data.media.width} height={data.media.height} alt={data.media.alt} loading="lazy" decoding="async" />
            </div>
          ) : null}
          <h2 id="i1-reviews-title" className="i1-reviews__title">
            {data.title}
          </h2>
          <SnapTrack id="i1-reviews-list" label={data.title} previousLabel={data.labels.previous} nextLabel={data.labels.next} layout="reviews" focusableList>
            {data.reviews.map((r, i) => (
              <li key={r.id} className="i1-review" data-review={r.id}>
                <figure className="i1-review__figure">
                  <p className="i1-review__index" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <blockquote className="i1-review__quote">
                    <p>{r.text}</p>
                  </blockquote>
                  {r.attribution ? <figcaption className="i1-review__by">{r.attribution}</figcaption> : null}
                </figure>
              </li>
            ))}
          </SnapTrack>
        </div>
      </div>
    </section>
  );
}
