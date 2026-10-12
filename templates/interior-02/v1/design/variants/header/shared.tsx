import type { ReactElement } from "react";
import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import { liveLink, navItems, type NavItem } from "../../../lib/links";
import type { SiteHeaderProps } from "../../../sections/SiteHeader";
import type { Ctx, NavKey } from "../../../sections/types";
import { MAIN_ID } from "../../resolve";
import { channelsOf, type Channel } from "../action-bar/channels";

/**
 * What both header variants need, read once from the site context (the same slots the classic
 * header reads) and the one menu panel they share. The panel is a native popover
 * (`popover` + `popovertarget`): no script, Escape and a press outside close it, the
 * browser returns focus to the button. Its links are plain anchors on purpose — a page change
 * is then a document load, so the panel can never stay open over the next page.
 */
export const MENU_ID = "ds-menu";

/**
 * The skip link's words. The Template declares no slot for them (`site.header` has none), so they are
 * presentation words by site locale, as components/portfolio/vocabulary.ts words its closed lists:
 * a Korean site reads Korean, every other locale the neutral English form.
 */
const SKIP_LABEL = { ko: "본문으로 건너뛰기", en: "Skip to content" } as const;
const korean = (locale?: string) => locale !== undefined && /^ko(-|$)/i.test(locale);

export interface HeaderModel {
  ctx: Ctx;
  variant: "home" | "sub";
  isCurrent: NavKey | undefined;
  items: NavItem[];
  /** the pages without the contact item (the consult control carries that one) */
  links: NavItem[];
  consult?: Channel;
  phone?: Channel;
  brandName: string;
  homeLabel?: string;
  logo?: { src: string; width: number; height: number };
  navLabel?: string;
  labels: { menu: string; open: string; close: string; back?: string; skip: string };
  title?: string;
  backHref: string;
  groups: PanelGroup[];
  slogan: string[];
}
export interface PanelLink {
  key: string;
  href: string;
  label: string;
  current: boolean;
}
export interface PanelGroup {
  label: string;
  links: PanelLink[];
}

export function headerModel({ ctx, variant = "sub", current, title, backHref = "/" }: SiteHeaderProps): HeaderModel {
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
  const isCurrent = current ?? (variant === "home" ? "home" : undefined);
  const { brandName, logo } = ctx.identity;
  const logoAsset = logo ? ctx.assets.resolve(logo) : undefined;
  const { phone, consult } = channelsOf(ctx);

  const pick = (keys: NavKey[]): PanelLink[] => items.filter((i) => keys.includes(i.key)).map((i) => ({ key: i.key, href: i.href, label: i.label, current: isCurrent === i.key }));
  const footerLinks = (["group2Link1", "group2Link2", "group2Link3", "group2Link4"] as const)
    .map((k) => liveLink(ctx, ctx.slots.link("site.footer", k)))
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map((l, i): PanelLink => ({ key: `more-${i}`, href: l.href, label: l.label, current: false }));
  const groups: PanelGroup[] = [
    { label: ctx.slots.text("site.menu", "group1Label") ?? "", links: pick(["home", "portfolio", "service", "about"]) },
    { label: ctx.slots.text("site.menu", "group2Label") ?? "", links: pick(["faq", "contact"]) },
    { label: ctx.slots.text("site.menu", "group3Label") ?? "", links: footerLinks },
  ].filter((g) => g.links.length > 0);

  return {
    ctx,
    variant,
    isCurrent,
    items,
    links: items.filter((i) => i.key !== "contact"),
    consult,
    phone,
    brandName,
    homeLabel: labels.home,
    logo: logoAsset ? { src: logoAsset.src, width: logoAsset.width, height: logoAsset.height } : undefined,
    navLabel: t("navLabel"),
    labels: { menu: t("menuLabel") ?? "", open: t("menuOpenLabel") ?? "", close: t("menuCloseLabel") ?? "", back: t("backLabel"), skip: korean(ctx.identity.locale) ? SKIP_LABEL.ko : SKIP_LABEL.en },
    title: variant === "sub" ? title : undefined,
    backHref,
    groups,
    slogan: ctx.slots.richText("site.menu", "slogan")?.paragraphs.filter((p) => p.trim() !== "") ?? [],
  };
}

/**
 * The skip link: the first focusable element of the page, off screen until it has the focus. Its target is the
 * page's <main id="main"> (design/resolve MAIN_ID) — every page of a designed site has it. A plain anchor: the
 * browser moves to the fragment and continues the tab order from there.
 */
export function SkipLink({ m, ns }: { m: HeaderModel; ns: string }) {
  return (
    <a href={`#${MAIN_ID}`} className={`${ns}__skip`} data-skip="">
      {m.labels.skip}
    </a>
  );
}

/** Wordmark or logo, linked home. `ns` is the variant's namespace class. */
export function Brand({ m, ns }: { m: HeaderModel; ns: string }) {
  return (
    <Link href="/" className={`${ns}__brand`} aria-label={m.homeLabel ? `${m.brandName} — ${m.homeLabel}` : m.brandName}>
      {m.logo ? <img src={m.logo.src} width={m.logo.width} height={m.logo.height} alt={m.brandName} className={`${ns}__logo`} /> : <span className={`${ns}__wordmark`}>{m.brandName}</span>}
    </Link>
  );
}

/** Sub-page with a title: the "← title" link shown instead of the brand at phone width (the classic back bar). */
export function BackLink({ m, ns }: { m: HeaderModel; ns: string }): ReactElement | null {
  if (!m.title) return null;
  return (
    <Link href={m.backHref} className={`${ns}__back`} data-back="">
      <Icon name="arrow-left" size={22} />
      {m.labels.back ? <span className={`${ns}__sr`}>{m.labels.back}: </span> : null}
      <span className={`${ns}__back-title`}>{m.title}</span>
    </Link>
  );
}

/** The button that opens the panel. `labelClass` shows the visible word where the variant has room for it. */
export function MenuButton({ m, ns }: { m: HeaderModel; ns: string }) {
  return (
    <button type="button" className={`${ns}__menu`} popoverTarget={MENU_ID} popoverTargetAction="toggle" aria-label={m.labels.open || m.labels.menu || undefined} aria-controls={MENU_ID} data-menu-button="">
      <Icon name="menu" size={24} />
      {m.labels.menu ? <span className={`${ns}__menu-label`} aria-hidden="true">{m.labels.menu}</span> : null}
    </button>
  );
}

/**
 * The full-screen menu: slogan, the site's pages in up to three groups, the phone. Rendered as the LAST child of
 * the header, after the bar: a browser without the Popover API cannot open it, and the sheet then lays the same
 * links out as one in-flow row under the bar (`@supports not selector(:popover-open)`).
 */
export function MenuPanel({ m, ns }: { m: HeaderModel; ns: string }) {
  return (
    <div id={MENU_ID} popover="auto" className={`${ns}__panel`} aria-label={m.labels.menu || undefined}>
      <div className={`${ns}__panel-bar`}>
        <span className={`${ns}__panel-brand`}>{m.brandName}</span>
        <button type="button" className={`${ns}__panel-close`} popoverTarget={MENU_ID} popoverTargetAction="hide" aria-label={m.labels.close || m.labels.menu || undefined}>
          <Icon name="close" size={24} />
        </button>
      </div>
      <div className={`${ns}__panel-body`}>
        {m.slogan.length > 0 ? (
          <div className={`${ns}__slogan`}>
            {m.slogan.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ) : null}
        <nav className={`${ns}__groups`} aria-label={m.labels.menu || undefined}>
          {m.groups.map((g, gi) => (
            <div key={gi} className={`${ns}__group`}>
              {g.label ? <p className={`${ns}__group-label`}>{g.label}</p> : null}
              <ul className={`${ns}__list`}>
                {g.links.map((l) => (
                  <li key={l.key}>
                    <a href={l.href} className={`${ns}__link`} aria-current={l.current ? "page" : undefined}>
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {m.phone ? (
          <a href={m.phone.href} className={`${ns}__panel-phone`}>
            <Icon name="phone" size={20} />
            <span>{m.phone.label}</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
