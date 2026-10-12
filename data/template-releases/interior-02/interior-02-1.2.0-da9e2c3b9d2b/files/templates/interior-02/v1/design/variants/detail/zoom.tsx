import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { PhotoViewer, type Seat } from "../../../components/portfolio/ProjectGallery";
import type { DetailData, DetailImage } from "./model";
import { Photo } from "./parts";

/**
 * Photo enlargement for the two detail variants — the CLASSIC viewer, not a second one.
 *
 * `PhotoViewer` (components/portfolio/ProjectGallery) is the classic detail page's own full-screen
 * viewer: a native modal <dialog class="i2-pviewer" data-gallery-viewer> (Esc, focus trap and the
 * return of focus to the opener are the browser's), a visible close button, a press on the
 * backdrop closes, ← / → and thumbnails step through the photographs. Its sheet is the classic
 * portfolio.css, which every page of a design site loads, and inner.css themes it with the site's
 * roles; this file adds no viewer rule and no script of its own.
 *
 *   <ZoomScope data>            wraps a variant's <article>: one shared viewer per page, opened at
 *                               the photograph that was pressed
 *   <ZoomPhoto image …/>        a photograph as a <button data-gallery-zoom aria-haspopup="dialog">
 *                               around the usual <Photo>; a plain <Photo> when the page has no viewer
 *
 * The viewer steps through every photograph of the page once, in reading order: the opening image,
 * the gallery groups, then the "before" photographs of the before / after pairs (an "after" photograph
 * is a gallery photograph already, so it opens the viewer at that one). Like the classic page, the
 * viewer exists in the DOM only while it is open, so the server markup carries none of it.
 */
interface Zoom {
  seats: Seat[];
  labels: NonNullable<DetailData["viewer"]>;
  open: (index: number) => void;
  indexOf: (src: string) => number;
}

const ZoomContext = createContext<Zoom | null>(null);

/** The photographs of a detail page that the viewer shows, in reading order, each source once. */
export function zoomSeats(data: DetailData): Seat[] {
  const seats: Seat[] = [];
  const seen = new Set<string>();
  const add = (image: DetailImage, group: string, n: number) => {
    if (seen.has(image.src)) return;
    seen.add(image.src);
    seats.push({ key: String(seats.length), group, n, image });
  };
  add(data.cover, data.title, 1);
  (data.photos?.groups ?? []).forEach((group) => group.items.forEach((image, i) => add(image, group.name, i + 1)));
  (data.beforeAfter?.pairs ?? []).forEach((pair, i) => add(pair.before, `${data.beforeAfter!.before} — ${pair.group}`, i + 1));
  return seats;
}

export function ZoomScope({ data, children }: { data: DetailData; children: ReactNode }) {
  const labels = data.viewer;
  const seats = useMemo(() => (labels ? zoomSeats(data) : []), [data, labels]);
  const [opened, setOpened] = useState<number | undefined>(undefined);
  const zoom = useMemo<Zoom | null>(() => {
    if (!labels || seats.length === 0) return null;
    const index = new Map(seats.map((seat, i) => [seat.image.src, i]));
    return { seats, labels, open: setOpened, indexOf: (src) => index.get(src) ?? -1 };
  }, [labels, seats]);
  return (
    <ZoomContext.Provider value={zoom}>
      {children}
      {zoom && opened !== undefined ? <PhotoViewer seats={zoom.seats} start={opened} labels={zoom.labels} onClose={() => setOpened(undefined)} /> : null}
    </ZoomContext.Provider>
  );
}

/** A photograph of the page: enlargeable when the page has a viewer. `zoomClass` styles the opener (the variant's namespace). */
export function ZoomPhoto({ image, className, zoomClass, eager = false }: { image: DetailImage; className: string; zoomClass: string; eager?: boolean }) {
  const zoom = useContext(ZoomContext);
  const index = zoom ? zoom.indexOf(image.src) : -1;
  if (!zoom || index < 0) return <Photo image={image} className={className} eager={eager} />;
  return (
    <button
      type="button"
      className={zoomClass}
      aria-haspopup="dialog"
      aria-label={`${zoom.labels.openPhoto} ${index + 1} / ${zoom.seats.length}${image.alt ? `: ${image.alt}` : ""}`}
      data-gallery-zoom=""
      onClick={() => zoom.open(index)}
    >
      <Photo image={image} className={className} eager={eager} />
    </button>
  );
}
