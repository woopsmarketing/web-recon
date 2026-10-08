import Link from "next/link";
import { projectsQuery } from "@platform/settings/settings";
import { SectionHeading } from "../components/ui/SectionHeading";
import { portfolioHref } from "../components/home/shared";
import { projectCardModels, type ProjectCardModel } from "../lib/projects";
import type { Ctx } from "./types";

export interface HomeRecentData {
  title: string;
  cards: ProjectCardModel[];
  more?: { href: string; label: string };
}

/** home.recent — a second declared selection over the same projects, as simpler cards. Disabled or empty → nothing. */
export function homeRecent(ctx: Ctx): HomeRecentData | undefined {
  const settings = ctx.settings["home.recent"];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list(projectsQuery(settings));
  if (items.length === 0) return undefined;
  const portfolio = portfolioHref(ctx);
  const moreLabel = ctx.slots.text("home.recent", "moreLabel");
  return {
    title: ctx.slots.text("home.recent", "title") ?? "",
    cards: projectCardModels(ctx, items),
    more: portfolio && moreLabel ? { href: portfolio, label: moreLabel } : undefined,
  };
}

/** Heading with arrow; 3-column grid (1 column ≤ 920) of image · title · one meta row; outlined button. */
export function HomeRecent({ data }: { data: HomeRecentData }) {
  return (
    <section className="i2-sec i2-recent" data-section="home.recent" aria-labelledby="i2-recent-title">
      <div className="i2-wrap">
        <SectionHeading title={data.title} id="i2-recent-title" more={data.more} />
        <ul className="i2-recent__grid">
          {data.cards.map((m) => {
            const meta = [m.category, m.location].filter((v): v is string => Boolean(v));
            return (
              <li key={m.id} className="i2-rcard" data-project-card={m.id}>
                <Link href={m.href} className="i2-rcard__link">
                  <span className="i2-rcard__media">
                    <img src={m.cover.src} width={m.cover.width} height={m.cover.height} alt={m.cover.alt} loading="lazy" decoding="async" />
                  </span>
                  <h3 className="i2-rcard__title">{m.title}</h3>
                  {meta.length > 0 ? (
                    <p className="i2-rcard__meta">
                      {meta.map((bit, i) => (
                        <span key={i}>{bit}</span>
                      ))}
                    </p>
                  ) : null}
                </Link>
              </li>
            );
          })}
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
