import Link from "next/link";
import { projectsQuery } from "@platform/settings/settings";
import { ChevronIcon } from "../components/Icon";
import { ProjectCard, type ProjectCardProps } from "../components/ProjectCard";
import { SnapTrack } from "../components/SnapTrack";
import { projectCards } from "./projectCards";
import type { Ctx } from "./types";

/** The two homepage showcases: SAME projects collection, each with its own declared selection. */
export type ShowcaseSection = "home.projects-a" | "home.projects-b";
const ANCHOR: Record<ShowcaseSection, string> = { "home.projects-a": "projects", "home.projects-b": "projects-more" };

export interface HomeProjectsData {
  section: ShowcaseSection;
  anchor: string;
  title: string;
  description?: string[];
  cards: ProjectCardProps[];
  /** "view all" link — only when the portfolio list route exists in this build */
  more?: { href: string; label: string };
  labels: { previous: string; next: string };
}

/**
 * home.projects-a / home.projects-b — settings → closed query over `projects` → card
 * props. Returns undefined when disabled or when the selection is empty, so the page
 * renders NO wrapper at all (no empty section, no fake card).
 */
export function homeProjects(ctx: Ctx, section: ShowcaseSection): HomeProjectsData | undefined {
  const settings = ctx.settings[section];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list(projectsQuery(settings));
  if (items.length === 0) return undefined;
  const moreLabel = ctx.slots.text(section, "moreLabel");
  return {
    section,
    anchor: ANCHOR[section],
    title: ctx.slots.text(section, "title") ?? "",
    description: ctx.slots.richText(section, "description")?.paragraphs,
    cards: projectCards(ctx, items, { level: 3, eagerCount: 0, withSummary: true }),
    more: ctx.routes.has("portfolio.index") && moreLabel ? { href: "/portfolio", label: moreLabel } : undefined,
    labels: { previous: ctx.slots.text(section, "previousLabel") ?? "", next: ctx.slots.text(section, "nextLabel") ?? "" },
  };
}

/** One showcase presentation for both sections (desktop 3 per view, mobile 1 + peek). */
export function HomeProjects({ data }: { data: HomeProjectsData }) {
  const titleId = `i1-${data.anchor}-title`;
  return (
    <section id={data.anchor} className="i1-projects" data-section={data.section} aria-labelledby={titleId}>
      <div className="i1-container i1-projects__inner">
        <div className="i1-projects__head">
          <h2 id={titleId} className="i1-projects__title">
            {data.title}
          </h2>
          {data.description ? (
            <div className="i1-projects__intro">
              {data.description.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}
        </div>
        <SnapTrack id={`i1-${data.anchor}-list`} label={data.title} previousLabel={data.labels.previous} nextLabel={data.labels.next}>
          {data.cards.map((card) => (
            <ProjectCard key={card.id} {...card} />
          ))}
        </SnapTrack>
        {/* after the track in the DOM (= reading/tab order on mobile); grid areas lift it into the head row on desktop */}
        {data.more ? (
          <Link href={data.more.href} className="i1-pill i1-projects__more" data-more-link="">
            {data.more.label}
            <ChevronIcon dir="right" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
