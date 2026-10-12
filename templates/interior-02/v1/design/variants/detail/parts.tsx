import type { DetailImage } from "./model";

/**
 * Pieces the two detail variants share (browser side: no site context, no data module). Class
 * names are passed in by the variant, so each sheet styles only its own namespace.
 */

/** id of the customer review block — the target of the "review" link in the title block */
export const REVIEW_ID = "review";

/** A thin arrow, drawn here; decorative — the link carries the name. `back` points left. */
export function Arrow({ className, back = false }: { className: string; back?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d={back ? "M20 12H5M10.5 6.5 5 12l5.5 5.5" : "M4 12h15M13.5 6.5 19 12l-5.5 5.5"} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A photograph: real size attributes (no layout shift), alt from data; only the opening image loads eagerly. */
export function Photo({ image, className, eager = false }: { image: DetailImage; className: string; eager?: boolean }) {
  return (
    <img className={className} src={image.src} width={image.width} height={image.height} alt={image.alt} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : undefined} />
  );
}

/**
 * The rhythm of a group of photographs: a single photograph, then a pair, then a single again —
 *   1 → single            2 → pair            3 → single · pair
 *   4 → single · pair · single                5 → single · pair · pair
 * so a group never ends on half a pair. `turn` counts the modules of the whole page (a variant
 * alternates sides and widths with it); `portrait` is true for a single upright photograph, which
 * a variant never crops to a wide frame. Pure: the same photographs give the same modules.
 */
export interface PhotoModule {
  kind: "single" | "pair";
  photos: DetailImage[];
  turn: number;
  portrait: boolean;
}

export function photoGroups(groups: { name: string; items: DetailImage[] }[]): { name: string; modules: PhotoModule[] }[] {
  let turn = 0;
  return groups.map((group) => {
    const modules: PhotoModule[] = [];
    let i = 0;
    let single = true;
    while (i < group.items.length) {
      const left = group.items.length - i;
      if (left >= 2 && (!single || left === 2)) {
        modules.push({ kind: "pair", photos: group.items.slice(i, i + 2), turn, portrait: false });
        i += 2;
      } else {
        const photo = group.items[i]!;
        modules.push({ kind: "single", photos: [photo], turn, portrait: photo.height > photo.width });
        i += 1;
      }
      turn += 1;
      single = !single;
    }
    return { name: group.name, modules };
  });
}
