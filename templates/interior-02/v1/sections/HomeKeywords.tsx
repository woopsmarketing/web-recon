import type { ReactNode } from "react";
import {
  PROJECT_FILTER_GROUPS,
  buildProjectFilterVocabulary,
  evaluateProjectFilter,
  isDefaultProjectFilter,
  normalizeProjectFilter,
  type ProjectFilter,
} from "@platform/content/project-filter";
import { ProjectCard } from "../components/ui/ProjectCard";
import { KeywordSlider, type KeywordChip } from "../components/home/KeywordSlider";
import { portfolioHref, sliderLabels } from "../components/home/shared";
import { projectCardModels } from "../lib/projects";
import type { Ctx } from "./types";

/** Every served project (the reader caps a query by `limit` only). */
const ALL_PROJECTS = 500;
const CHIP_SLOTS = [1, 2, 3, 4, 5, 6] as const;

export interface HomeKeywordsData {
  title: string;
  chipsLabel: string;
  chips: KeywordChip[];
  panels: Record<string, ReactNode[]>;
  moreLabel: string;
  labels: ReturnType<typeof sliderLabels>;
}

/**
 * The portfolio list's query for a filter, in this template's parameter names (keyword · type ·
 * area · style · price, multi-values repeat the key). The default (empty) filter is the plain route.
 */
export function filterQuery(filter: ProjectFilter): string {
  if (isDefaultProjectFilter(filter)) return "";
  const q = new URLSearchParams();
  if (filter.keyword) q.append("keyword", filter.keyword);
  for (const v of filter.type) q.append("type", v);
  for (const v of filter.area) q.append("area", v);
  for (const v of filter.style) q.append("style", v);
  for (const v of filter.price) q.append("price", v);
  return q.toString();
}

/**
 * home.keywords — each chip = a label slot + a ProjectFilter setting, evaluated here with the
 * platform's own filter semantics over the site's vocabulary (same scales as the portfolio list).
 * A chip without a label or without a match is left out; no chip → nothing.
 */
export function homeKeywords(ctx: Ctx): HomeKeywordsData | undefined {
  const settings = ctx.settings["home.keywords"];
  if (!settings.enabled) return undefined;
  const all = ctx.content.list({ type: "projects", selection: { mode: "latest" }, limit: ALL_PROJECTS }).items;
  if (all.length === 0) return undefined;
  const categories = ctx.content.list({ type: "categories" }).items;
  const vocab = buildProjectFilterVocabulary(all, { groups: [...PROJECT_FILTER_GROUPS], categories, areaScale: settings.areaScale, priceScale: settings.priceScale });
  const portfolio = portfolioHref(ctx);
  const withheld = ctx.slots.text("home.keywords", "withheldText") ?? "";
  const builtLabel = ctx.slots.text("home.keywords", "builtLabel");

  const chips: KeywordChip[] = [];
  const panels: Record<string, ReactNode[]> = {};
  for (const n of CHIP_SLOTS) {
    const label = ctx.slots.text("home.keywords", `chip${n}Label`);
    if (!label) continue;
    const filter = normalizeProjectFilter(settings[`chip${n}`], vocab);
    const projects = evaluateProjectFilter(all, filter, vocab).slice(0, settings.limit);
    if (projects.length === 0) continue;
    const id = `chip${n}`;
    const query = filterQuery(filter);
    chips.push({ id, label, href: portfolio ? (query ? `${portfolio}?${query}` : portfolio) : undefined });
    panels[id] = projectCardModels(ctx, projects).map((m) => <ProjectCard key={m.id} model={m} withheld={withheld} builtLabel={builtLabel} level={3} as="div" />);
  }
  if (chips.length === 0) return undefined;

  return {
    title: ctx.slots.text("home.keywords", "title") ?? "",
    chipsLabel: ctx.slots.text("home.keywords", "chipsLabel") ?? "",
    chips,
    panels,
    moreLabel: ctx.slots.text("home.keywords", "moreLabel") ?? "",
    labels: sliderLabels(ctx, "home.keywords"),
  };
}

export function HomeKeywords({ data }: { data: HomeKeywordsData }) {
  const { slideLabelFormat, ...labels } = data.labels;
  return (
    <section className="i2-sec i2-kw" data-section="home.keywords" aria-labelledby="i2-kw-title">
      <KeywordSlider title={data.title} chipsLabel={data.chipsLabel} chips={data.chips} panels={data.panels} moreLabel={data.moreLabel} labels={labels} slideLabelFormat={slideLabelFormat} />
    </section>
  );
}
