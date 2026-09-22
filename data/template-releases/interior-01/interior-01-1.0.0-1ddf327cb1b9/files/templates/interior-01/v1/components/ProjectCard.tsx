export interface ProjectCardProps {
  id: string;
  title: string;
  category?: string;
  cover: { src: string; width: number; height: number; alt: string };
  eager: boolean;
}

/** Project card. Not a link yet: the detail route does not exist in this Release. */
export function ProjectCard({ id, title, category, cover, eager }: ProjectCardProps) {
  return (
    <li className="i1-card" data-project-card={id}>
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
      <h3 className="i1-card__title">{title}</h3>
      {category ? <p className="i1-card__meta">{category}</p> : null}
    </li>
  );
}
