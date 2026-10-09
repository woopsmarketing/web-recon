import { areaFigure, formatPricePerArea, groupDigits, type AreaUnit } from "./format";
import type { Ctx, ProjectItem } from "../sections/types";

/**
 * Project card model (SHELL shared block) — everything a card needs, from one served project.
 *   projectHref(project)                     "/portfolio/<slug>" (the one place that builds it)
 *   projectCardModel(ctx, project)           → ProjectCardModel (see below)
 *   projectCardModels(ctx, projects)         the same for a list (one category lookup)
 *   badgeTone(index)                         category order index → "yellow" | "mint" | "navy"
 * Badge = the project's category: short = first character of the name upper-cased, full = the name
 * upper-cased, tone = the category's order index mod 3. Card area unit suffix: pyeong → "PY",
 * m2 → "m²", sqft → "sq ft". totalPrice = { figure: "120,000,000", unit: "원" } (ko + KRW) or
 * { figure, unit: currency }; absent → undefined (the caller shows its "withheld" slot text).
 */
export type BadgeTone = "yellow" | "mint" | "navy";

export interface ProjectCardModel {
  id: string;
  slug: string;
  href: string;
  title: string;
  summary?: string;
  location?: string;
  category?: string;
  area?: { figure: string; unit: string };
  builtYear?: number;
  pricePerArea?: string;
  totalPrice?: { figure: string; unit: string };
  badge: { short: string; full: string; tone: BadgeTone };
  cover: { src: string; width: number; height: number; alt: string };
}

const CARD_AREA_UNIT: Record<AreaUnit, string> = { pyeong: "PY", m2: "m²", sqft: "sq ft" };
const TONES: readonly BadgeTone[] = ["yellow", "mint", "navy"];

export function projectHref(p: { slug: string }): string {
  return `/portfolio/${p.slug}`;
}

export function badgeTone(index: number): BadgeTone {
  return TONES[((index % 3) + 3) % 3]!;
}

function categoryIndex(ctx: Ctx): Map<string, { name: string; index: number }> {
  return new Map(ctx.content.list({ type: "categories" }).items.map((c, index) => [c.id, { name: c.name, index }]));
}

function model(ctx: Ctx, p: ProjectItem, cats: Map<string, { name: string; index: number }>): ProjectCardModel {
  const cat = cats.get(p.category);
  const name = cat?.name ?? p.category;
  const total = p.totalPrice;
  const isKrw = total?.currency === "KRW" && /^ko(-|$)/i.test(ctx.identity.locale);
  const fig = (n: number) => groupDigits(n, 2);
  return {
    id: p.id,
    slug: p.slug,
    href: projectHref(p),
    title: p.title,
    summary: p.summary,
    location: p.location,
    category: cat?.name,
    area: p.area ? { figure: areaFigure(p.area), unit: CARD_AREA_UNIT[p.area.unit] } : undefined,
    builtYear: p.builtYear,
    pricePerArea: p.pricePerArea ? formatPricePerArea(p.pricePerArea, ctx.identity.locale) : undefined,
    totalPrice: total
      ? {
          figure: total.kind === "exact" ? fig(total.amount) : `${fig(total.minAmount)} ~ ${fig(total.maxAmount)}`,
          unit: isKrw ? "원" : total.currency,
        }
      : undefined,
    badge: { short: name.slice(0, 1).toUpperCase(), full: name.toUpperCase(), tone: badgeTone(cat?.index ?? 0) },
    // the title already names the card link; no alt → decorative image, not a repeated title
    cover: { ...ctx.assets.resolve(p.cover.asset), alt: p.cover.alt ?? "" },
  };
}

export function projectCardModel(ctx: Ctx, project: ProjectItem): ProjectCardModel {
  return model(ctx, project, categoryIndex(ctx));
}

export function projectCardModels(ctx: Ctx, projects: readonly ProjectItem[]): ProjectCardModel[] {
  const cats = categoryIndex(ctx);
  return projects.map((p) => model(ctx, p, cats));
}
