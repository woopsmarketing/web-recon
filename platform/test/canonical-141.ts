/**
 * 1.4.1 (Pre-Demo tiny polish) changed a project detail's <main> in exactly two declared ways.
 * The "byte-identical to the previous package" regressions (step41 A, step5 AD) stay byte-exact
 * by reversing / predicting exactly those two and nothing else:
 *   - photo strip: `id="i1-gallery-strip-N"` on the list + the two arrow buttons (removed from
 *     whichever side has them; predemo.test.ts P2 asserts their exact shape);
 *   - Korean per-pyeong price: the OLD side's "KRW n / 평" is rewritten to what 1.4.1 must render
 *     for that site locale (the Template's own formatter), so the new text is asserted, not ignored.
 * A no-op on two packages of the same side of 1.4.1.
 */
import { formatPricePerArea } from "../../templates/interior-01/v1/lib/format";

const ARROW = /<button type="button" class="i1-gallery__arrow i1-gallery__arrow--(?:prev|next)" aria-controls="i1-gallery-strip-\d+" aria-label="[^"<>]*" aria-disabled="(?:true|false)" data-gallery-arrow="(?:prev|next)"><svg\b[^>]*><path\b[^>]*><\/path><\/svg><\/button>/g;

export function canonical141(mainHtml: string, locale: string): string {
  return mainHtml
    .replace(ARROW, "")
    .replace(/<ul id="i1-gallery-strip-\d+" class="i1-gallery__grid">/g, '<ul class="i1-gallery__grid">')
    .replace(/<dd>KRW ([\d,]+(?:\.\d+)?) \/ 평<\/dd>/g, (_, n: string) => `<dd>${formatPricePerArea({ amount: Number(n.replaceAll(",", "")), currency: "KRW", unit: "pyeong" }, locale)}</dd>`);
}
