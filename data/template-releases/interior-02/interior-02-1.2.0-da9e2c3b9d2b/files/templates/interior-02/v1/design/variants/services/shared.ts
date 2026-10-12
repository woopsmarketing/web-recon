import { homeService } from "../../../sections/HomeService";
import type { Ctx } from "../../../sections/types";

export interface ServiceItem {
  title: string;
  /** the one-line descriptor, when the site wrote one */
  descriptor?: string;
}

/** What both services variants read: the lineup of `home.service` (tier titles / sub lines) and the route they lead to. */
export interface ServicesData {
  title: string;
  items: ServiceItem[];
  /** where an item leads (the service page), when this build has it */
  href?: string;
  more?: { href: string; label: string };
}

const MAX_ITEMS = 8;

export function servicesData(ctx: Ctx): ServicesData | undefined {
  const d = homeService(ctx);
  const lineup = d?.lineup;
  if (!lineup || lineup.tiers.length === 0) return undefined;
  const title = lineup.title ?? d?.principles?.title ?? ctx.slots.text("site.header", "serviceLabel");
  if (!title) return undefined;
  return {
    title,
    items: lineup.tiers.slice(0, MAX_ITEMS).map((tier) => ({ title: tier.title, descriptor: tier.sub ?? tier.note })),
    href: lineup.href,
    more: lineup.more,
  };
}
