import Link from "next/link";
import { HeaderFrame } from "../components/shell/HeaderFrame";
import { Icon } from "../components/ui/Icon";
import { navItems, liveLink, type NavItem } from "../lib/links";
import { SiteMenu } from "./SiteMenu";
import { SiteTabBar } from "./SiteTabBar";
import type { Ctx, NavKey } from "./types";

/**
 * site.header (SHELL). Every page renders it first:
 *   <SiteHeader ctx={ctx} variant="home" />                                   the homepage
 *   <SiteHeader ctx={ctx} variant="sub" current="portfolio" title="…" />      every other page
 * Props:
 *   variant   "home" = floating white card over the hero that becomes a fixed full-width bar once the
 *             page is scrolled past it; "sub" (default) = the fixed full-width bar from the start.
 *   current   the nav item this page belongs to ("portfolio" covers the list, its pages and details).
 *   title     sub-pages: the page title of the ≤ 640 "back + title" bar (no title = the logo bar).
 *   backHref  where that bar's title link goes (default "/"; a project detail passes "/portfolio").
 * Also renders the ≤ 640 bottom tab bar (SiteTabBar) after the header, since it needs `current`.
 * Sub-pages put their content in <main className="i2-main i2-main--sub"> (base.css): the content block
 * then starts 80px below the bar (30px ≤ 1280), as measured; the bar itself is sticky and takes its own height.
 */
export interface SiteHeaderProps {
  ctx: Ctx;
  variant?: "home" | "sub";
  current?: NavKey;
  title?: string;
  backHref?: string;
}

export function SiteHeader({ ctx, variant = "sub", current, title, backHref = "/" }: SiteHeaderProps) {
  const t = (key: string) => ctx.slots.text("site.header", key);
  const labels: Record<NavKey, string | undefined> = {
    home: t("homeLabel"),
    portfolio: t("portfolioLabel"),
    service: t("serviceLabel"),
    about: t("aboutLabel"),
    faq: t("faqLabel"),
    contact: t("contactLabel"),
  };
  const items = navItems(ctx, labels);
  const links = items.filter((i) => i.key !== "contact");
  const contact = items.find((i) => i.key === "contact");
  const cells = [liveLink(ctx, ctx.slots.link("site.header", "linkA")), liveLink(ctx, ctx.slots.link("site.header", "linkB"))];
  const isCurrent = current ?? (variant === "home" ? "home" : undefined);
  const { brandName, logo } = ctx.identity;
  const logoAsset = logo ? ctx.assets.resolve(logo) : undefined;
  const homeLabel = labels.home;
  const backLabel = t("backLabel");
  const menuLabels = { menu: t("menuLabel") ?? "", open: t("menuOpenLabel") ?? "", close: t("menuCloseLabel") ?? "" };
  const ariaCurrent = (key: NavKey) => (isCurrent === key ? "page" : undefined);
  const navLink = (l: NavItem) => (
    <Link key={l.key} href={l.href} className="i2-nav__link" data-nav={l.key} aria-current={ariaCurrent(l.key)}>
      {l.label}
    </Link>
  );
  const brand = (
    <Link href="/" className="i2-header__brand" aria-label={homeLabel ? `${brandName} — ${homeLabel}` : brandName}>
      {logoAsset ? (
        <img src={logoAsset.src} width={logoAsset.width} height={logoAsset.height} alt={brandName} className="i2-header__logo" />
      ) : (
        <span className="i2-header__wordmark">{brandName}</span>
      )}
    </Link>
  );
  return (
    <>
      <HeaderFrame variant={variant} className={`i2-header i2-header--${variant}${variant === "sub" && title ? " i2-header--titled" : ""}`}>
        <div className="i2-header__bar">
          <div className="i2-header__inner">
            {variant === "sub" && title ? (
              <Link href={backHref} className="i2-header__page" data-back="">
                <Icon name="arrow-left" size={24} />
                {backLabel ? <span className="i2-sr">{backLabel}: </span> : null}
                <span className="i2-header__title">{title}</span>
              </Link>
            ) : null}
            {brand}
            {links.length > 1 || contact ? (
              <nav className="i2-nav" aria-label={t("navLabel")}>
                {links.map(navLink)}
              </nav>
            ) : null}
            <div className="i2-header__cells">
              {cells.map((c, i) =>
                c ? (
                  c.internal ? (
                    <Link key={i} href={c.href} className={`i2-cell i2-cell--${i === 0 ? "yellow" : "mint"}`}>
                      {c.label}
                    </Link>
                  ) : (
                    <a key={i} href={c.href} className={`i2-cell i2-cell--${i === 0 ? "yellow" : "mint"}`}>
                      {c.label}
                    </a>
                  )
                ) : null,
              )}
              {contact ? (
                <Link href={contact.href} className="i2-cell i2-cell--navy" data-nav="contact" aria-current={ariaCurrent("contact")}>
                  {contact.label}
                </Link>
              ) : null}
            </div>
            <div className="i2-header__squares">
              {contact ? (
                <Link href={contact.href} className="i2-square i2-square--yellow" aria-label={contact.label} data-nav="contact-square">
                  <Icon name="chat" size={30} />
                </Link>
              ) : null}
              <SiteMenu ctx={ctx} items={items} current={isCurrent} labels={menuLabels} />
            </div>
          </div>
        </div>
      </HeaderFrame>
      <SiteTabBar ctx={ctx} current={isCurrent} />
    </>
  );
}
