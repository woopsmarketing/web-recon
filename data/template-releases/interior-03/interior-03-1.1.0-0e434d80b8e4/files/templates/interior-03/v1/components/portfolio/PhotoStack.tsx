import type { Media } from "../../lib/media";

/**
 * The photo stack of a project detail: every image centred at its natural size (up to the
 * container width), 15px apart, in group order. The first image of the stack loads eagerly, the
 * rest lazily. With `groupLabels` a small heading opens each named group.
 *   <PhotoStack label groups={[{ name?, images }]} groupLabels />
 */
export interface PhotoGroup {
  /** the group's name; the cover group has none */
  name?: string;
  images: Media[];
}

export function PhotoStack({ label, groups, groupLabels }: { label: string; groups: PhotoGroup[]; groupLabels: boolean }) {
  let index = 0;
  return (
    <section className="i3-pview__photos" aria-label={label} data-photos="">
      {groups.map((g, gi) => (
        <div key={gi} className="i3-pview__group" {...(g.name ? { "data-photo-group": g.name } : {})}>
          {groupLabels && g.name ? <h2 className="i3-pview__group-title">{g.name}</h2> : null}
          {g.images.map((im, i) => {
            const eager = index++ === 0;
            return (
              <figure key={i} className="i3-pview__photo">
                <img src={im.src} width={im.width} height={im.height} alt={im.alt} loading={eager ? "eager" : "lazy"} decoding="async" {...(eager ? { fetchPriority: "high" as const } : {})} />
              </figure>
            );
          })}
        </div>
      ))}
    </section>
  );
}
