import Link from "next/link";
import type { Ctx } from "./types";

/**
 * site.header — logo/brand links home with a real <a href>. Nav shows only
 * destinations that exist in this build: the on-page projects anchor when that
 * section rendered, and a mailto contact when the business has an email.
 */
export function SiteHeader({ ctx, projectsAnchor }: { ctx: Ctx; projectsAnchor?: string }) {
  const projectsLabel = ctx.slots.text("site.header", "projectsNavLabel");
  const contactLabel = ctx.slots.text("site.header", "contactLabel");
  const { brandName, logo } = ctx.identity;
  const email = ctx.content.getSingleton("business").contact?.email;
  const logoAsset = logo ? ctx.assets.resolve(logo) : undefined;
  return (
    <header className="i1-header" data-section="site.header">
      <div className="i1-container i1-header__inner">
        <Link href="/" className="i1-header__brand" aria-label={`${brandName} home`}>
          {logoAsset ? (
            <img src={logoAsset.src} width={logoAsset.width} height={logoAsset.height} alt={brandName} className="i1-header__logo" />
          ) : (
            <span className="i1-header__wordmark">{brandName}</span>
          )}
        </Link>
        <nav className="i1-header__nav" aria-label="Primary">
          {projectsAnchor && projectsLabel ? (
            <a href={`#${projectsAnchor}`} className="i1-header__link">
              {projectsLabel}
            </a>
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
