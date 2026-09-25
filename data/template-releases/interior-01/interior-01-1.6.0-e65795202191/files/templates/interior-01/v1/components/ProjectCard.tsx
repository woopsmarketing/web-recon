import Link from "next/link";

export interface ProjectCardProps {
  id: string;
  title: string;
  href: string;
  summary?: string;
  category?: string;
  cover: { src: string; width: number; height: number; alt: string };
  eager: boolean;
  /** heading level inside the page outline (home section = 3, portfolio list = 2) */
  level: 2 | 3;
}

/** Project card: the whole card is one crawlable link to the project detail page. */
export function ProjectCard({ id, title, href, summary, category, cover, eager, level }: ProjectCardProps) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <li className="i1-card" data-project-card={id}>
      <Link href={href} className="i1-card__link">
        <div className="i1-card__media">
          <img
            src={cover.src}
            width={cover.width}
            height={cover.height}
            alt={cover.alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
          />
        </div>
        <Heading className="i1-card__title">{title}</Heading>
        {summary ? <p className="i1-card__summary">{summary}</p> : null}
        {category ? <p className="i1-card__meta">{category}</p> : null}
      </Link>
    </li>
  );
}
