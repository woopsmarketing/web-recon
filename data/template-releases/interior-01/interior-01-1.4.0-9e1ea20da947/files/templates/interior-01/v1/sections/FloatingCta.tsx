import { MessageIcon } from "../components/Icon";
import { contactHref } from "./links";
import type { Ctx } from "./types";

export interface FloatingCtaData {
  label: string;
  href: string;
}

/**
 * site.floating-cta — THE site-wide viewport-fixed contact seat (1.4.0; homepage-only in
 * 1.3.x). SiteFooter renders it as the footer's last child (contentinfo landmark, outside
 * every page's section flow), and the root layout renders SiteFooter once for every page —
 * so the seat is one instance that survives client-side navigation.
 * Shown when `site.floating-cta.enabled` AND the site has a contact destination (business
 * email today); otherwise absent on every page.
 * Position = the site's one bottom-right floating seat (template.css `--i1-float-*`), fixed to
 * the viewport at every width and scroll position.
 * Replacement seam (not implemented): this module is the ONLY place that decides what sits in
 * the seat. A chat launcher replaces `FloatingCta` (same `.i1-fcta` wrapper/seat, an action
 * instead of the href); `floatingCta()` stays the one on/off + destination rule.
 */
export function floatingCta(ctx: Ctx): FloatingCtaData | undefined {
  if (!ctx.settings["site.floating-cta"].enabled) return undefined;
  const href = contactHref(ctx);
  const label = ctx.slots.text("site.floating-cta", "label");
  return href && label ? { label, href } : undefined;
}

export function FloatingCta({ data }: { data: FloatingCtaData }) {
  return (
    // a plain wrapper (inside <footer>), not a landmark of its own: the link carries the name
    <div className="i1-fcta" data-section="site.floating-cta">
      <a className="i1-fcta__link" href={data.href} data-floating-cta="">
        <MessageIcon />
        <span>{data.label}</span>
      </a>
    </div>
  );
}
