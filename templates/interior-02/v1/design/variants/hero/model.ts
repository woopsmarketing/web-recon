/**
 * Hero variants — the DATA SHAPES (types only, no import). Shared by the build / kit side
 * (`<variant>.data.ts`, source.ts) and the browser side (`<variant>.tsx`, parts.tsx), so that a
 * component never has to import a data module. Everything here is plain JSON.
 */

/** A resolved photograph: served URL, intrinsic size, the site's alt text ("" = decorative). */
export interface HeroImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

/** A link whose destination exists in this build. `href` is a page of this site. */
export interface HeroLink {
  label: string;
  href: string;
}

/** The site's phone line: the number as the site shows it, its `tel:` address, an optional prefix. */
export interface HeroPhone {
  label?: string;
  number: string;
  href: string;
}

/** hero.photo — one full-bleed photograph, or (no photograph) a statement on the page surface. */
export interface HeroPhotoData {
  image?: HeroImage;
  /** small line above the heading: the project a photograph shows, or the company name */
  caption?: string;
  heading?: string;
  link?: HeroLink;
}

/** One photograph of the statement hero's strip: a project cover. */
export interface HeroStripItem {
  id: string;
  title: string;
  /** where the project is, when the record says so */
  place?: string;
  /** the project's page, when this build serves it */
  href?: string;
  image: HeroImage;
}

/** hero.statement — the heading as the image, an optional strip of project covers. */
export interface HeroStatementData {
  /** the company name, unless it is the heading itself */
  label?: string;
  heading: string;
  /** a heading too long for the display step is set one step smaller */
  long: boolean;
  /** the second tone: a supporting sentence */
  line?: string;
  link?: HeroLink;
  strip: HeroStripItem[];
}

/** hero.split — text and actions beside one photograph. */
export interface HeroSplitData {
  label?: string;
  heading: string;
  line?: string;
  image?: HeroImage;
  /** primary action: the consultation destination */
  consult?: HeroLink;
  phone?: HeroPhone;
  /** a quiet text link: the project the hero's banner points at, or the project list */
  more?: HeroLink;
}
