import { groupDigits, type AreaUnit } from "../../lib/format";

/**
 * The per-area price as a figure only, for a row whose label already names the unit area
 * ("price per 평": "340만 원"). Same amount rules as lib/format's formatPricePerArea (verbatim,
 * no rounding; ko + KRW + pyeong reads in 만 when exact, else in won), without its prefix / suffix.
 */
export function pricePerAreaFigure(price: { amount: number; currency: string; unit: AreaUnit }, locale?: string): string {
  const korean = locale !== undefined && /^ko(-|$)/i.test(locale);
  if (korean && price.currency === "KRW" && price.unit === "pyeong" && price.amount > 0) {
    const exactInMan = Number.isInteger(price.amount) && price.amount % 100 === 0 && price.amount >= 10_000 && price.amount < 100_000_000;
    return exactInMan ? `${groupDigits(price.amount / 10_000, 2)}만 원` : `${groupDigits(price.amount, 2)}원`;
  }
  return `${price.currency} ${groupDigits(price.amount, 2)}`;
}
