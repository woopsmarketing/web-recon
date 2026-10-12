import { MenuDrawer, type DrawerGroup } from "../components/shell/MenuDrawer";
import { liveLink, type NavItem } from "../lib/links";
import type { Ctx, NavKey } from "./types";

/**
 * site.menu (SHELL) — the ≤ 1280 drawer: the menu button (navy square in the header) and the
 * full-screen panel it opens. Server side: resolves the slogan and the link groups; the client
 * component (components/shell/MenuDrawer) owns open/close, scroll lock, Escape and focus.
 *   group 1 = the site's pages (home · projects · service · about), group 2 = support (faq · contact),
 *   group 3 = the footer's support link slots that exist in this build. Empty groups are omitted.
 */
export function SiteMenu({ ctx, items, current, labels }: { ctx: Ctx; items: NavItem[]; current?: NavKey; labels: { menu: string; open: string; close: string } }) {
  const slogan = ctx.slots.richText("site.menu", "slogan")?.paragraphs ?? [];
  const pick = (keys: NavKey[]) => items.filter((i) => keys.includes(i.key)).map((i) => ({ key: i.key, href: i.href, label: i.label, internal: true, current: current === i.key }));
  const footerLinks = (["group2Link1", "group2Link2", "group2Link3", "group2Link4"] as const)
    .map((k) => liveLink(ctx, ctx.slots.link("site.footer", k)))
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map((l, i) => ({ key: `more-${i}`, href: l.href, label: l.label, internal: l.internal, current: false }));
  const groups: DrawerGroup[] = [
    { label: ctx.slots.text("site.menu", "group1Label") ?? "", links: pick(["home", "portfolio", "service", "about"]) },
    { label: ctx.slots.text("site.menu", "group2Label") ?? "", links: pick(["faq", "contact"]) },
    { label: ctx.slots.text("site.menu", "group3Label") ?? "", links: footerLinks },
  ].filter((g) => g.links.length > 0);
  return <MenuDrawer slogan={slogan} groups={groups} labels={labels} />;
}
