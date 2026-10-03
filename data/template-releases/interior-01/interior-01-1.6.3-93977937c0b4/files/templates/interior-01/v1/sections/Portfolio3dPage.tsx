import Link from "next/link";
import { ChevronIcon } from "../components/Icon";
import type { Ctx } from "./types";

export interface Portfolio3dPageData {
  title: string;
  body?: string;
  portfolio?: { label: string; href: string };
}

/** portfolio3d.page (1.5.0) — a placeholder for a feature in preparation: title, one line, a way to the portfolio. */
export function portfolio3dPage(ctx: Ctx): Portfolio3dPageData {
  const portfolioLabel = ctx.slots.text("portfolio3d.page", "portfolioLabel");
  return {
    title: ctx.slots.text("portfolio3d.page", "title") ?? "",
    body: ctx.slots.text("portfolio3d.page", "body"),
    portfolio: ctx.routes.has("portfolio.index") && portfolioLabel ? { label: portfolioLabel, href: "/portfolio" } : undefined,
  };
}

export function Portfolio3dPage({ data }: { data: Portfolio3dPageData }) {
  return (
    <div className="i1-page i1-soon" data-section="portfolio3d.page">
      <div className="i1-container">
        <div className="i1-soon__panel">
          <h1 className="i1-page__title">{data.title}</h1>
          {data.body ? <p className="i1-soon__body">{data.body}</p> : null}
          {data.portfolio ? (
            <Link href={data.portfolio.href} className="i1-pill">
              {data.portfolio.label}
              <ChevronIcon dir="right" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
