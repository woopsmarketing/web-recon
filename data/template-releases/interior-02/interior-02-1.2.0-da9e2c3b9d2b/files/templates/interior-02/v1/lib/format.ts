/**
 * Number / area / price formatting (SHELL shared block). Template code: no Intl, no Date.
 *   groupDigits(value, decimals)          1234567.891 → "1,234,567.89"
 *   areaFigure(area)                      the figure alone ("34.5"); areaUnit(unit) → " m²" | " sq ft" | "평"
 *   formatArea(area)                      figure + unit ("34.5평")
 *   formatPricePerArea(price, locale)     "평당 290만 원" (ko + KRW + pyeong) or "KRW 2,900,000 / 평"
 *   formatTotalPrice(total, locale)       "1억 2,500만 원", "5,000만 원 ~ 7,000만 원" or "KRW 125,000,000"
 *   splitTotalPrice(total, locale)        { figure, unit } for a big-figure + small-unit layout
 *   formatPeriod(period)                  "2024.03 – 2024.05"
 *   formatCount({ one, other }, n)        "{n}" slot formats with a singular form
 */

export type AreaUnit = "m2" | "sqft" | "pyeong";
export type TotalPrice = { kind: "exact"; amount: number; currency: string } | { kind: "range"; minAmount: number; maxAmount: number; currency: string };

const AREA_SYMBOL: Record<AreaUnit, string> = { m2: " m²", sqft: " sq ft", pyeong: "평" };

export function groupDigits(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "";
  const factor = 10 ** decimals;
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  const [int = "0", frac] = rounded.toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = frac ? frac.replace(/0+$/, "") : "";
  return `${value < 0 ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

export function areaUnit(unit: AreaUnit): string {
  return AREA_SYMBOL[unit];
}

/** Content stores ≤ 2 fraction digits, so 2 here renders the stored value exactly. */
export function areaFigure(area: { value: number }): string {
  return groupDigits(area.value, 2);
}

export function formatArea(area: { value: number; unit: AreaUnit }): string {
  return `${areaFigure(area)}${AREA_SYMBOL[area.unit]}`;
}

const isKorean = (locale: string | undefined) => locale !== undefined && /^ko(-|$)/i.test(locale);

/**
 * Rendered verbatim (no bucketing, no rounding). Korean locale + KRW + pyeong reads the way the
 * trade quotes it ("평당 290만 원"); an amount 만 cannot show exactly stays in won.
 */
export function formatPricePerArea(price: { amount: number; currency: string; unit: AreaUnit }, locale?: string): string {
  if (isKorean(locale) && price.currency === "KRW" && price.unit === "pyeong" && price.amount > 0) {
    const exactInMan = Number.isInteger(price.amount) && price.amount % 100 === 0 && price.amount >= 10_000 && price.amount < 100_000_000;
    return exactInMan ? `평당 ${groupDigits(price.amount / 10_000, 2)}만 원` : `평당 ${groupDigits(price.amount, 2)}원`;
  }
  return `${price.currency} ${groupDigits(price.amount, 2)} / ${AREA_SYMBOL[price.unit].trim()}`;
}

/** A KRW amount the way the trade writes one: 만 = 10,000, 억 = 100,000,000 (figure only, no unit). */
function koreanWonFigure(amount: number): string | undefined {
  if (!(Number.isInteger(amount) && amount > 0 && amount % 10_000 === 0)) return undefined;
  const man = amount / 10_000;
  const eok = Math.floor(man / 10_000);
  const rest = man % 10_000;
  return [eok > 0 ? `${groupDigits(eok, 0)}억` : "", rest > 0 ? `${groupDigits(rest, 0)}만` : ""].filter(Boolean).join(" ");
}

/**
 * The total price of a whole case split into a figure and its unit, for the big-figure +
 * small-unit presentation: ko + KRW → { "1억 2,500만", "원" } (not exact in 만 → { "12,345,678", "원" });
 * other currencies → { "125,000,000", "KRW" }. A range names both ends in the figure.
 */
export function splitTotalPrice(total: TotalPrice, locale?: string): { figure: string; unit: string } {
  if (isKorean(locale) && total.currency === "KRW") {
    const fig = (n: number) => koreanWonFigure(n) ?? groupDigits(n, 2);
    return { figure: total.kind === "exact" ? fig(total.amount) : `${fig(total.minAmount)} ~ ${fig(total.maxAmount)}`, unit: "원" };
  }
  return {
    figure: total.kind === "exact" ? groupDigits(total.amount, 2) : `${groupDigits(total.minAmount, 2)} – ${groupDigits(total.maxAmount, 2)}`,
    unit: total.currency,
  };
}

export function formatTotalPrice(total: TotalPrice, locale?: string): string {
  const { figure, unit } = splitTotalPrice(total, locale);
  return isKorean(locale) && total.currency === "KRW" ? `${figure} ${unit}` : `${unit} ${figure}`;
}

/** "2024-03" → "2024.03"; no end or end = start renders one month. */
export function formatPeriod(period: { start: string; end?: string }): string {
  const ym = (v: string) => v.replace("-", ".");
  return period.end && period.end !== period.start ? `${ym(period.start)} – ${ym(period.end)}` : ym(period.start);
}

/** Slot format with "{n}"; `one` is the n = 1 form. A format without "{n}" gets the number prepended. */
export function formatCount(format: { one: string; other: string }, n: number): string {
  const f = n === 1 ? format.one : format.other;
  return f.includes("{n}") ? f.replace("{n}", String(n)) : `${n} ${f}`;
}

/** "{key}" placeholders in a slot format, e.g. fill("Slide {n} of {total}", { n: 2, total: 5 }). */
export function fill(format: string, values: Record<string, string | number>): string {
  return format.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}
