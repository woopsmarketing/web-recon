import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * SectionHeading (SHELL shared block) — the section title row: an h2/h3 and, optionally, a
 * trailing arrow link (the "more" link; its arrow shifts right on hover, see base.css).
 *   <SectionHeading title="…" level={2} />
 *   <SectionHeading title="…" more={{ href: "/portfolio", label: "…" }} id="projects" />
 *   <SectionHeading title="…">{chips}</SectionHeading>      children sit between the title and the link
 * Props: title · level (2 | 3, default 2) · more { href, label } · id (anchor on the heading) · className · children
 */
export function SectionHeading({
  title,
  level = 2,
  more,
  id,
  className,
  children,
}: {
  title: string;
  level?: 2 | 3;
  more?: { href: string; label: string };
  id?: string;
  className?: string;
  children?: ReactNode;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div className={className ? `i2-head ${className}` : "i2-head"}>
      <Heading className="i2-head__title" id={id}>
        {title}
      </Heading>
      {children}
      {more ? (
        <Link href={more.href} className="i2-head__more">
          <span>{more.label}</span>
          <Icon name="arrow-right" size={28} />
        </Link>
      ) : null}
    </div>
  );
}
