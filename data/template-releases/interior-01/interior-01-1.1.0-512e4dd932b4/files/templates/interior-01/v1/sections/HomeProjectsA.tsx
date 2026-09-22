import Link from "next/link";
import { projectsQuery } from "@platform/settings/settings";
import { ProjectCard, type ProjectCardProps } from "../components/ProjectCard";
import { projectCards } from "./projectCards";
import type { Ctx } from "./types";

export interface HomeProjectsAData {
  anchor: string;
  title: string;
  description?: string[];
  cards: ProjectCardProps[];
  /** "view all" link — only when the portfolio list route exists in this build */
  more?: { href: string; label: string };
}

/**
 * home.projects-a — settings → closed query → item → card props.
 * Returns undefined when disabled or when the selection is empty, so the page
 * renders NO wrapper at all (no empty section, no fake card).
 */
export function homeProjectsA(ctx: Ctx): HomeProjectsAData | undefined {
  const settings = ctx.settings["home.projects-a"];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list(projectsQuery(settings));
  if (items.length === 0) return undefined;
  const moreLabel = ctx.slots.text("home.projects-a", "moreLabel");
  return {
    anchor: "projects",
    title: ctx.slots.text("home.projects-a", "title") ?? "",
    description: ctx.slots.richText("home.projects-a", "description")?.paragraphs,
    cards: projectCards(ctx, items, { level: 3, eagerCount: 4, withSummary: false }),
    more: ctx.routes.has("portfolio.index") && moreLabel ? { href: "/portfolio", label: moreLabel } : undefined,
  };
}

export function HomeProjectsA({ data }: { data: HomeProjectsAData }) {
  return (
    <section id={data.anchor} className="i1-projects" data-section="home.projects-a" aria-labelledby="i1-projects-title">
      <div className="i1-container">
        <div className="i1-projects__head">
          <h2 id="i1-projects-title" className="i1-projects__title">
            {data.title}
          </h2>
          {data.more ? (
            <Link href={data.more.href} className="i1-projects__more" data-more-link="">
              {data.more.label}
            </Link>
          ) : null}
        </div>
        {data.description ? (
          <div className="i1-projects__intro">
            {data.description.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : null}
        <ul className="i1-projects__grid">
          {data.cards.map((card) => (
            <ProjectCard key={card.id} {...card} />
          ))}
        </ul>
      </div>
    </section>
  );
}
