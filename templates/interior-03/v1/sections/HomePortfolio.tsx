import Link from "next/link";
import { projectsQuery } from "@platform/settings/settings";
import { SectionTitle } from "../components/home/SectionTitle";
import { ProjectCard } from "../components/ui/ProjectCard";
import { projectCardModels, type ProjectCardModel } from "../lib/projects";
import type { Ctx } from "./types";

export interface HomePortfolioData {
  title: string;
  lead?: string;
  cards: ProjectCardModel[];
  /** the pill button under the grid — only when the portfolio list exists in this build */
  more?: { href: string; label: string };
}

/** home.portfolio — settings → closed query over `projects` → card models. Disabled or empty → nothing. */
export function homePortfolio(ctx: Ctx): HomePortfolioData | undefined {
  const settings = ctx.settings["home.portfolio"];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list(projectsQuery(settings));
  if (items.length === 0) return undefined;
  const moreLabel = ctx.slots.text("home.portfolio", "moreLabel");
  return {
    title: ctx.slots.text("home.portfolio", "title") ?? "",
    lead: ctx.slots.text("home.portfolio", "lead"),
    cards: projectCardModels(ctx, items),
    more: ctx.routes.has("portfolio.index") && moreLabel ? { href: "/portfolio", label: moreLabel } : undefined,
  };
}

/**
 * Title block (+ the small lead), the card grid — 3 columns (32% + 2% gap), 2 ≤ 768 (49%) — and
 * the pill button centred under it. The cards sit well below the hero, so none loads eagerly.
 */
export function HomePortfolio({ data }: { data: HomePortfolioData }) {
  return (
    <section className="i3-sec i3-pf" data-section="home.portfolio" aria-labelledby="i3-pf-title">
      <div className="i3-wrap">
        <SectionTitle title={data.title} id="i3-pf-title" />
        {data.lead ? <p className="i3-pf__lead">{data.lead}</p> : null}
        <ul className="i3-cards i3-cards--home">
          {data.cards.map((m) => (
            <ProjectCard key={m.id} model={m} level={3} />
          ))}
        </ul>
        {data.more ? (
          <p className="i3-pf__more">
            <Link href={data.more.href} className="i3-btn i3-btn--pill" data-portfolio-more="">
              {data.more.label}
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
