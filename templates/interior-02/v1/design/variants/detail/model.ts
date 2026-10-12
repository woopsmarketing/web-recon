/**
 * Slot data of the detail variants (gallery · typographic) — types only, shared by the data side
 * (`*.data.ts`) and the browser side (`*.tsx`). Plain JSON.
 *
 * Everything here is what the classic detail page shows (sections/PortfolioDetail.tsx), with the
 * same words and the same figures; a block the record has nothing for is absent.
 */
import type { GalleryLabels } from "../../../components/portfolio/ProjectGallery";

export interface DetailImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

/** `key` names the record field: propertyType · category · area · builtYear · period · duration · projectType · location */
export interface DetailFact {
  key: string;
  label: string;
  value: string;
}

export interface DetailRelated {
  id: string;
  href: string;
  title: string;
  location?: string;
  /** figure + unit ("34평") */
  area?: string;
  cover: DetailImage;
}

export interface DetailData {
  title: string;
  location?: string;
  /** figure + unit ("34평") */
  area?: string;
  /** the project summary, one paragraph */
  summary?: string;
  /** the photograph that opens the page (the record's cover) */
  cover: DetailImage;
  facts: DetailFact[];
  /** the consultation entry point — only when the site has a contact channel and a contact page */
  consult?: { href: string; label: string };
  /** label of the in-page link to the customer review; present only with `quote` */
  reviewJump?: string;
  price: {
    title: string;
    label: string;
    /** every digit + the unit; a range is "min ~ max" */
    total?: { figure: string; unit: string };
    /** shown in place of a total the record does not state */
    withheld: string;
    /** price facts that are not already in `facts` (price per area) */
    rows: { label: string; value: string }[];
    notes: string[];
  };
  scope?: { label: string; items: string[] };
  /**
   * The words of the classic photo viewer (open · viewer · close · previous · next · thumbnails),
   * exactly as the classic detail page carries them. Present when the record has a photo gallery —
   * and only then is a photograph of the page enlargeable (zoom.tsx).
   */
  viewer?: GalleryLabels;
  /** every gallery photograph in group order, except the one that already opens the page */
  photos?: { title: string; groups: { name: string; items: DetailImage[] }[] };
  story?: { title: string; paragraphs: string[] };
  beforeAfter?: { title: string; before: string; after: string; pairs: { group: string; before: DetailImage; after: DetailImage }[] };
  quote?: { title: string; text: string; attribution?: string };
  related?: { title: string; items: DetailRelated[] };
  back: { href: string; label: string };
}
