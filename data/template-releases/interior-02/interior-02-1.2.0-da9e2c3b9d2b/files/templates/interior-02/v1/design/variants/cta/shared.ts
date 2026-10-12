import { footerBand } from "../../../sections/FooterBand";
import { liveLink } from "../../../lib/links";
import type { Ctx } from "../../../sections/types";

/**
 * What both cta variants read: the call-to-action half of the footer band (`site.footer` ctaTitle /
 * ctaText / ctaLabel / ctaButtonLabel, the contact route) and the phone line of the contact page
 * (`contact.page` callLink). A control exists only when its destination does; no control → no section.
 */
export interface CtaData {
  label?: string;
  title: string;
  text?: string;
  /** the consultation button → the contact route */
  button?: { href: string; label: string };
  /** the phone link (tel:) */
  phone?: { href: string; label: string; prefix?: string };
}

const NO_ANCHORS: ReadonlySet<string> = new Set();

export function ctaData(ctx: Ctx): CtaData | undefined {
  const half = footerBand(ctx)?.cta;
  if (!half) return undefined;
  const call = liveLink(ctx, ctx.slots.link("contact.page", "callLink"), NO_ANCHORS);
  const phone = call && call.href.startsWith("tel:") ? { href: call.href, label: call.label, prefix: ctx.slots.text("contact.page", "callLabel") || undefined } : undefined;
  if (!half.button && !phone) return undefined;
  return { label: half.label, title: half.title, text: half.text, button: half.button, phone };
}
