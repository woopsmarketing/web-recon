import Link from "next/link";
import { MenuDrawer } from "../components/shell/MenuDrawer";
import { liveLink, navItems, type LiveLink, type NavItem } from "../lib/links";
import type { Ctx, NavKey } from "./types";

/**
 * site.header (SHELL). Every page renders it first:
 *   <SiteHeader ctx={ctx} />                       the homepage
 *   <SiteHeader ctx={ctx} current="portfolio" />   every other page (the nav item it belongs to;
 *                                                  "portfolio" covers the list, its pages and details)
 * Wide (> 768): top bar (tagline block + up to two links; omitted when the site sets neither) over
 * the main bar (logo left, page links right). Narrow: one 65px bar with the logo and the menu
 * button (MenuDrawer). The header is in the page flow and scrolls away with the page.
 */
export function SiteHeader({ ctx, current }: { ctx: Ctx; current?: NavKey }) {
  const t = (key: string) => ctx.slots.text("site.header", key);
  const labels: Record<NavKey, string | undefined> = {
    home: t("homeLabel"),
    about: t("aboutLabel"),
    portfolio: t("portfolioLabel"),
    service: t("serviceLabel"),
    contact: t("contactLabel"),
    faq: t("faqLabel"),
  };
  const items = navItems(ctx, labels);
  const tagline = t("tagline");
  const topLinks = [liveLink(ctx, ctx.slots.link("site.header", "topLinkA")), liveLink(ctx, ctx.slots.link("site.header", "topLinkB"))].filter((l): l is LiveLink => !!l);
  const { brandName, logo } = ctx.identity;
  const logoAsset = logo ? ctx.assets.resolve(logo) : undefined;
  const homeLabel = labels.home;
  // A link to the section already shown is a plain anchor (a full load): the page's client view —
  // the portfolio list's category / search state — then never outlives the address it belongs to.
  const currentHref = items.find((l) => l.key === current)?.href;
  const navLink = (l: NavItem) => (
    <li key={l.key}>
      {current === l.key ? (
        <a href={l.href} className="i3-nav__link" data-nav={l.key} aria-current="page">
          {l.label}
        </a>
      ) : (
        <Link href={l.href} className="i3-nav__link" data-nav={l.key}>
          {l.label}
        </Link>
      )}
    </li>
  );
  return (
    <header className="i3-header" data-section="site.header">
      {tagline || topLinks.length > 0 ? (
        <div className="i3-topbar">
          <div className="i3-wrap i3-topbar__in">
            {tagline ? <p className="i3-topbar__tag">{tagline}</p> : null}
            {topLinks.length > 0 ? (
              <ul className="i3-topbar__links">
                {topLinks.map((l, i) => (
                  <li key={i}>
                    {l.internal && l.href !== currentHref ? (
                      <Link href={l.href} className="i3-topbar__link">
                        {l.label}
                      </Link>
                    ) : (
                      <a href={l.href} className="i3-topbar__link">
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="i3-wrap i3-header__bar">
        <Link href="/" className="i3-header__brand" aria-label={homeLabel ? `${brandName} — ${homeLabel}` : brandName}>
          {logoAsset ? <img src={logoAsset.src} width={logoAsset.width} height={logoAsset.height} alt={brandName} className="i3-header__logo" /> : <span className="i3-header__wordmark">{brandName}</span>}
        </Link>
        {items.length > 0 ? (
          <nav className="i3-nav" aria-label={t("navLabel")}>
            <ul className="i3-nav__list">{items.map(navLink)}</ul>
          </nav>
        ) : null}
        {items.length > 0 ? (
          <MenuDrawer
            links={items.map((l) => ({ key: l.key, href: l.href, label: l.label, current: current === l.key }))}
            home={homeLabel ? { href: "/", label: homeLabel } : undefined}
            labels={{ menu: t("menuLabel") ?? "", open: t("menuOpenLabel") ?? "", close: t("menuCloseLabel") ?? "" }}
          />
        ) : null}
      </div>
    </header>
  );
}
