import Link from "../components/ui/Link";
import { ProjectCard } from "../components/ui/ProjectCard";
import { SectionHeading } from "../components/ui/SectionHeading";
import type { ProjectCardModel } from "../lib/projects";

export interface HomeProjectsData {
  title: string;
  cards: ProjectCardModel[];
  /** the heading arrow and the button — only when the portfolio list exists in this build */
  more?: { href: string; label: string };
  withheld: string;
  builtLabel?: string;
}

/** home.projects — the data function is sections/homeProjectsData.ts (kept out of this file: the component is part of a runtime slot, i.e. browser code). */

/**
 * 3 / 2 / 1-column grid (≤ 640 shows the first six cards), centred outlined button.
 * The cards sit under the hero, so none loads eagerly: an eager image here is preloaded by every page that prefetches "/".
 */
export function HomeProjects({ data }: { data: HomeProjectsData }) {
  return (
    <section className="i2-sec i2-projects" data-section="home.projects" aria-labelledby="i2-projects-title">
      <div className="i2-wrap">
        <SectionHeading title={data.title} id="i2-projects-title" more={data.more} />
        <ul className="i2-projects__grid">
          {data.cards.map((m) => (
            <ProjectCard key={m.id} model={m} withheld={data.withheld} builtLabel={data.builtLabel} level={3} />
          ))}
        </ul>
        {data.more ? (
          <p className="i2-btn-row">
            <Link href={data.more.href} className="i2-btn i2-btn--outline">
              {data.more.label}
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
