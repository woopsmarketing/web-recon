/**
 * Item → display shaping for project facts (Template code: no Intl, no Date, no clock).
 * Deterministic, locale-neutral numerals; unit symbols are Template-owned.
 */

type AreaUnit = "m2" | "sqft" | "pyeong";

const AREA_SYMBOL: Record<AreaUnit, string> = { m2: " m²", sqft: " sq ft", pyeong: "평" };

/** 1234567.891 → "1,234,567.89" (max `decimals` fraction digits, trailing zeros dropped). */
export function groupDigits(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "";
  const factor = 10 ** decimals;
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  const [int = "0", frac] = rounded.toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = frac ? frac.replace(/0+$/, "") : "";
  return `${value < 0 ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** Content stores ≤ 2 fraction digits (schema), so 2 here renders the stored value exactly. */
export function formatArea(area: { value: number; unit: AreaUnit }): string {
  return `${groupDigits(area.value, 2)}${AREA_SYMBOL[area.unit]}`;
}

/** Rendered verbatim (no bucketing, no rounding, no plausibility judgement): see content schema pricePerArea. */
export function formatPricePerArea(price: { amount: number; currency: string; unit: AreaUnit }): string {
  return `${price.currency} ${groupDigits(price.amount, 2)} / ${AREA_SYMBOL[price.unit].trim()}`;
}

/** "2024-03" → "2024.03"; no end (schema: single-month project) or end = start renders one month. */
export function formatPeriod(period: { start: string; end?: string }): string {
  const ym = (v: string) => v.replace("-", ".");
  return period.end && period.end !== period.start ? `${ym(period.start)} – ${ym(period.end)}` : ym(period.start);
}

/**
 * Slot format with "{n}" (e.g. "{n} weeks", "{n}주"); a format without it gets the number
 * prepended. `one` is the n = 1 form ("{n} week"); languages without plural forms set both alike.
 */
export function formatCount(format: { one: string; other: string }, n: number): string {
  const f = n === 1 ? format.one : format.other;
  return f.includes("{n}") ? f.replace("{n}", String(n)) : `${n} ${f}`;
}
