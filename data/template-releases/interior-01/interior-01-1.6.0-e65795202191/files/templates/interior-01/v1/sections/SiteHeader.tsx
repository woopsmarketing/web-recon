import Link from "next/link";
import { MobileMenu, type MenuLink } from "../components/MobileMenu";
import { contactHref } from "./links";
import type { Ctx } from "./types";

/** "portfolio" = the list's first page itself; "portfolio-section" = a page inside it (later list pages, details). */
export type HeaderCurrent = "portfolio" | "portfolio-section" | "portfolio3d" | "about" | "contact";

/**
 * site.header — logo/brand links home with a real <a href>. Nav (1.5.0), only destinations that
 * exist in this build: portfolio (when the route plan generates the list) · 3D portfolio · about,
 * then the contact pill → /contact (when the site has a contact channel). The pill IS the
 * contact menu item: there is no second contact link.
 * ≥ 900 px the nav is inline; below, the header is logo + a menu button that opens the same
 * items in a modal menu (components/MobileMenu).
 */
export function SiteHeader({ ctx, current }: { ctx: Ctx; current?: HeaderCurrent }) {
  const label = (key: "projectsNavLabel" | "portfolio3dNavLabel" | "aboutNavLabel" | "contactLabel") => ctx.slots.text("site.header", key);
  const homeLabel = ctx.slots.text("site.header", "homeLinkLabel");
  const { brandName, logo } = ctx.identity;
  const logoAsset = logo ? ctx.assets.resolve(logo) : undefined;
  const ariaCurrent = (key: MenuLink["key"]): MenuLink["current"] =>
    current === key ? "page" : key === "portfolio" && current === "portfolio-section" ? "true" : undefined;

  const candidates: Array<[MenuLink["key"], string, string | undefined, boolean]> = [
    ["portfolio", "/portfolio", label("projectsNavLabel"), ctx.routes.has("portfolio.index")],
    ["portfolio3d", "/3d-portfolio", label("portfolio3dNavLabel"), ctx.routes.has("portfolio3d")],
    ["about", "/about", label("aboutNavLabel"), ctx.routes.has("about")],
  ];
  const links: MenuLink[] = candidates
    .filter((c): c is [MenuLink["key"], string, string, boolean] => c[3] && !!c[2])
    .map(([key, href, text]) => ({ key, href, label: text, current: ariaCurrent(key) }));
  const contact = contactHref(ctx);
  const contactLabel = label("contactLabel");
  const cta: MenuLink | undefined = contact && contactLabel ? { key: "contact", href: contact, label: contactLabel, current: ariaCurrent("contact") } : undefined;

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
        {/* no destinations → no (empty) navigation landmark and no menu button */}
        {links.length > 0 || cta ? (
          <>
            <nav className="i1-header__nav" aria-label="Primary">
              {links.map((l) => (
                <Link key={l.key} href={l.href} className="i1-header__link" data-nav={l.key} aria-current={l.current}>
                  {l.label}
                </Link>
              ))}
              {cta ? (
                <Link href={cta.href} className="i1-header__cta" data-nav="contact" aria-current={cta.current}>
                  {cta.label}
                </Link>
              ) : null}
            </nav>
            <MobileMenu
              links={links}
              cta={cta}
              brandName={brandName}
              labels={{
                menu: ctx.slots.text("site.header", "menuLabel") ?? "",
                open: ctx.slots.text("site.header", "menuOpenLabel") ?? "",
                close: ctx.slots.text("site.header", "menuCloseLabel") ?? "",
              }}
            />
          </>
        ) : null}
      </div>
    </header>
  );
}
