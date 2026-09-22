import { MessageIcon } from "../components/Icon";
import { contactHref } from "./links";
import type { Ctx } from "./types";

export interface FloatingCtaData {
  label: string;
  href: string;
}

/**
 * site.floating-cta — a viewport-fixed contact button, outside the section flow; rendered
 * as the footer's last child so it belongs to the contentinfo landmark.
 * Destination = the site's contact destination (business email today); none → no button.
 * Future seam (not implemented): a chat launcher replaces the href with an action.
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
