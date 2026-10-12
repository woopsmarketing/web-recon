import Link from "./Link";
import type { ProjectCardModel } from "../../lib/projects";

/**
 * ProjectCard (SHELL shared block) — server component; the whole card is one link to the detail.
 *   <ProjectCard model={projectCardModel(ctx, p)} withheld="…" level={3} eager />
 * Props:
 *   model      from lib/projects (cover 464:286 object-fit cover, badge, title + area suffix, meta row, price)
 *   withheld   the section's "price withheld" slot text, shown when the project has no total price
 *   builtLabel suffix after the built year (e.g. "준공"); omitted when absent
 *   level      heading level of the title (2 | 3, default 3) · eager: eager image loading (above the fold)
 *   as         "li" (default, inside a <ul>) or "div" (inside a slider) · className: extra classes on the root
 * Hover (base.css): the image scales to 1.05, the badge expands from its one-letter form to the full name.
 */
/** A meta bit ("2010 준공", "평당 200만 원"): its digit runs are wrapped so CSS can draw them a step heavier. */
function MetaBit({ text }: { text: string }) {
  const parts = text.split(/([0-9][0-9,.]*)/);
  return <span>{parts.map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : part))}</span>;
}

export function ProjectCard({
  model,
  withheld,
  builtLabel,
  level = 3,
  eager = false,
  as = "li",
  className,
}: {
  model: ProjectCardModel;
  withheld?: string;
  builtLabel?: string;
  level?: 2 | 3;
  eager?: boolean;
  as?: "li" | "div";
  className?: string;
}) {
  const Root = as;
  const Heading = level === 2 ? "h2" : "h3";
  const { cover, badge, area, builtYear, pricePerArea, totalPrice } = model;
  const metaBits: string[] = [];
  if (builtYear !== undefined) metaBits.push(builtLabel ? `${builtYear} ${builtLabel}` : String(builtYear));
  if (pricePerArea) metaBits.push(pricePerArea);
  return (
    <Root className={className ? `i2-card ${className}` : "i2-card"} data-project-card={model.id}>
      <Link href={model.href} className="i2-card__link">
        <div className="i2-card__media">
          <img src={cover.src} width={cover.width} height={cover.height} alt={cover.alt} loading={eager ? "eager" : "lazy"} decoding="async" />
          <span className={`i2-badge i2-badge--${badge.tone}`} aria-label={badge.full}>
            <span className="i2-badge__short" aria-hidden="true">
              {badge.short}
            </span>
            <span className="i2-badge__full" aria-hidden="true">
              {badge.full}
            </span>
          </span>
        </div>
        <div className="i2-card__body">
          <Heading className="i2-card__title">
            <span className="i2-card__name">{model.title}</span>
            {area ? (
              <span className="i2-card__area">
                {area.figure}
                <small>{area.unit}</small>
              </span>
            ) : null}
          </Heading>
          {metaBits.length > 0 ? (
            <p className="i2-card__meta">
              {metaBits.map((bit, i) => (
                <MetaBit key={i} text={bit} />
              ))}
            </p>
          ) : null}
          {totalPrice ? (
            <p className="i2-card__price">
              <strong>{totalPrice.figure}</strong>
              <small>{totalPrice.unit}</small>
            </p>
          ) : withheld ? (
            <p className="i2-card__withheld">{withheld}</p>
          ) : null}
        </div>
      </Link>
    </Root>
  );
}
