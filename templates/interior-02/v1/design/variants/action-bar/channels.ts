import { contactHref, liveLink } from "../../../lib/links";
import type { Ctx } from "../../../sections/types";

/**
 * The real ways to reach the business that this site holds — shared by the action bar and the
 * header variants (design/variants/header). Nothing is invented: a channel the site does not have
 * is left out.
 *
 *   phone    a `tel:` link of the site: the contact page's call link, else a `tel:` link in the
 *            header / footer link slots. label = the number as the site prints it.
 *   consult  the contact page, only when the site has a contact channel (lib/links `contactHref`);
 *            label = the header's contact label.
 *
 * (A chat-channel link such as KakaoTalk cannot exist yet: a link slot accepts /path, #anchor,
 * mailto: and tel: only — see the report of E-TB-C.)
 */
export interface Channel {
  href: string;
  label: string;
}
export interface Channels {
  phone?: Channel;
  consult?: Channel;
}

const PHONE_SLOTS: ReadonlyArray<readonly [string, string]> = [
  ["contact.page", "callLink"],
  ["site.header", "linkA"],
  ["site.header", "linkB"],
  ["site.footer", "group2Link1"],
  ["site.footer", "group2Link2"],
  ["site.footer", "group2Link3"],
  ["site.footer", "group2Link4"],
];

export function channelsOf(ctx: Ctx): Channels {
  let phone: Channel | undefined;
  for (const [section, key] of PHONE_SLOTS) {
    const link = liveLink(ctx, ctx.slots.link(section, key));
    if (link && link.href.toLowerCase().startsWith("tel:")) {
      phone = { href: link.href, label: link.label };
      break;
    }
  }
  const href = contactHref(ctx);
  const label = ctx.slots.text("site.header", "contactLabel");
  return { phone, consult: href && label ? { href, label } : undefined };
}
