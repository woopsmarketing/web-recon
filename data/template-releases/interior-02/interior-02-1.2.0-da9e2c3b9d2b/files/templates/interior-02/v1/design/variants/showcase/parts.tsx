import type { ShowcaseImage } from "./model";

/**
 * Small pieces the three showcase variants share (browser side: no site context, no data module).
 * Every class name is passed in by the variant, so each sheet styles only its own namespace.
 */

/** A thin arrow, drawn here (a variant has no asset of its own); decorative — the link carries the name. */
export function Arrow({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A cover photograph below the fold: real size attributes (no layout shift), lazy, alt from data. */
export function Cover({ image, className }: { image: ShowcaseImage; className: string }) {
  return <img className={className} src={image.src} width={image.width} height={image.height} alt={image.alt} loading="lazy" decoding="async" />;
}

/** "01", "02", … — the position in the list, as the editorial index prints it. */
export function ordinal(index: number): string {
  return String(index + 1).padStart(2, "0");
}
