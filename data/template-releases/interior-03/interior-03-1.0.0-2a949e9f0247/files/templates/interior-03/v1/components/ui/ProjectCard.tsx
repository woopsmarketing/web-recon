import Link from "next/link";
import type { ProjectCardModel } from "../../lib/projects";

/**
 * ProjectCard (SHELL shared block) — a thumbnail over one line of title; the whole card is one
 * link to the detail page. No hooks: usable from server sections and from client lists.
 *   <ProjectCard model={m} />            inside a <ul class="i3-cards i3-cards--home|--list">
 * The thumbnail box is 3:2 (object-fit: cover) with a hairline outline; the title is one line
 * (ellipsis). Grid geometry (columns, gaps) belongs to the list that holds the cards.
 */
export function ProjectCard({ model, level = 3, eager = false }: { model: ProjectCardModel; level?: 2 | 3; eager?: boolean }) {
  const Heading = level === 2 ? "h2" : "h3";
  const { cover } = model;
  return (
    <li className="i3-card" data-project-card={model.id}>
      <Link href={model.href} className="i3-card__link">
        <span className="i3-card__thumb">
          <img src={cover.src} width={cover.width} height={cover.height} alt={cover.alt} loading={eager ? "eager" : "lazy"} decoding="async" />
        </span>
        <Heading className="i3-card__subject">{model.title}</Heading>
      </Link>
    </li>
  );
}
