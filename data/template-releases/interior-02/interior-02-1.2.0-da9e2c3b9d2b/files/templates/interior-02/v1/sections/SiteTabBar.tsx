import { TabBar, type TabItem } from "../components/shell/TabBar";
import { navItems } from "../lib/links";
import type { IconName } from "../components/ui/Icon";
import type { Ctx, NavKey } from "./types";

const TAB_ICON: Record<NavKey, IconName> = { home: "home", portfolio: "image", service: "cube", about: "grid", faq: "list", contact: "chat" };
/** Tab order (contact last, as the reference); the first five that exist for the site are shown. */
const TAB_KEYS: readonly NavKey[] = ["home", "portfolio", "service", "faq", "contact", "about"];

/**
 * site.tabbar (SHELL) — the ≤ 640 bottom tab bar: up to five route-driven links (icon + label).
 * Rendered by SiteHeader (it needs the current page). The client part (components/shell/TabBar)
 * hides it while scrolling up past 300px and shows it again on a downward scroll.
 */
export function SiteTabBar({ ctx, current }: { ctx: Ctx; current?: NavKey }) {
  const t = (key: string) => ctx.slots.text("site.tabbar", key);
  const items = navItems(
    ctx,
    { home: t("homeLabel"), portfolio: t("portfolioLabel"), service: t("serviceLabel"), about: t("aboutLabel"), faq: t("faqLabel"), contact: t("contactLabel") },
    TAB_KEYS,
  ).slice(0, 5);
  if (items.length < 2) return null;
  const tabs: TabItem[] = items.map((i) => ({ key: i.key, href: i.href, label: i.label, icon: TAB_ICON[i.key], current: current === i.key }));
  return <TabBar tabs={tabs} label={t("navLabel") ?? ""} />;
}
