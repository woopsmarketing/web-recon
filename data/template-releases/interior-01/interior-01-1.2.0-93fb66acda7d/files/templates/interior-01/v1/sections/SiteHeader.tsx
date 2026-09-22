import Link from "next/link";
import type { Ctx } from "./types";

/**
 * site.header — logo/brand links home with a real <a href>. Nav shows only
 * destinations that exist in this build: the portfolio list when the route plan
 * generates it, and a mailto contact when the business has an email.
 */
/** "portfolio" = the list's first page itself; "portfolio-section" = a page inside it (later list pages, details). */
export function SiteHeader({ ctx, current }: { ctx: Ctx; current?: "portfolio" | "portfolio-section" }) {
  const projectsLabel = ctx.slots.text("site.header", "projectsNavLabel");
  const contactLabel = ctx.slots.text("site.header", "contactLabel");
  const homeLabel = ctx.slots.text("site.header", "homeLinkLabel");
  const { brandName, logo } = ctx.identity;
  const email = ctx.content.getSingleton("business").contact?.email;
  const logoAsset = logo ? ctx.assets.resolve(logo) : undefined;
  const portfolio = ctx.routes.has("portfolio.index");
  return (
    <header className="i1-header" data-section="site.header">
      <div className="i1-container i1-header__inner">
        <Link href="/" className="i1-header__brand" aria-label={homeLabel ? `${brandName} — ${homeLabel}` : brandName}>
          {logoAsset ? (
            <img src={logoAsset.src} width={logoAsset.width} height={logoAsset.height} alt={brandName} className="i1-header__logo" />
          ) : (
            <span className="i1-header__wordmark">{brandName}</span>
          )}
        </Link>
        <nav className="i1-header__nav" aria-label="Primary">
          {portfolio && projectsLabel ? (
            <Link
              href="/portfolio"
              className="i1-header__link"
              data-nav="portfolio"
              aria-current={current === "portfolio" ? "page" : current === "portfolio-section" ? "true" : undefined}
            >
              {projectsLabel}
            </Link>
          ) : null}
          {email && contactLabel ? (
            <a href={`mailto:${email}`} className="i1-header__cta">
              {contactLabel}
            </a>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
