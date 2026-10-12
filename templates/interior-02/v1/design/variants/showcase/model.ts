/**
 * Slot data of the showcase variants (panels · index · cards) — types only, shared by the data
 * side (`*.data.ts`) and the browser side (`*.tsx`). Plain JSON: every value is a string, a number
 * or a list of those.
 *
 * One project = one item. `category` (the site's own tier names) and `projectType` (the platform's
 * closed vocabulary, as a display word) are TWO fields: a variant may show either or both, never
 * one under the other's name.
 */
export interface ShowcaseImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface ShowcaseItem {
  id: string;
  href: string;
  title: string;
  /** the project summary, one paragraph */
  summary?: string;
  /** the name of the project's category, when the category exists */
  category?: string;
  /** display word of the record's `projectType` ("전체 리모델링") */
  projectType?: string;
  /** display word of the record's `propertyType` ("아파트") */
  propertyType?: string;
  location?: string;
  /** figure + unit, as the detail page writes it ("34평") */
  area?: string;
  /** the record's `durationWeeks` in the detail page's format ("6주") */
  duration?: string;
  cover: ShowcaseImage;
}

/** Names of the facts, for a reader that cannot see where a value sits (the detail page's labels). */
export interface ShowcaseLabels {
  category: string;
  projectType: string;
  propertyType: string;
  location: string;
  area: string;
  duration: string;
}

export interface ShowcaseData {
  /** the section heading; empty = no heading */
  title: string;
  /** the projects of the home selection, in its order */
  items: ShowcaseItem[];
  /** the link to the whole list — only when the portfolio list exists in this build */
  more?: { href: string; label: string };
  labels: ShowcaseLabels;
}
