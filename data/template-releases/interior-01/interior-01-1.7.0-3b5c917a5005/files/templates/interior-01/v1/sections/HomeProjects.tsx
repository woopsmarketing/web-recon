import Link from "../components/Link";
import { ChevronIcon } from "../components/Icon";
import { ProjectCard } from "../components/ProjectCard";
import { SnapTrack } from "../components/SnapTrack";
import type { HomeProjectsData } from "./homeProjectsData";

// 1.7.0: markup only — the data function moved to homeProjectsData.ts (no output change).

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
