import type { Ctx } from "../../../sections/types";
import type { HeroSplitData } from "./model";
import { heroSource } from "./source";

/**
 * hero.split (HE-D) — data. Text and actions beside one photograph (the first banner's image).
 *   heading   the banner's headline; without one the slogan; without one the company name
 *   line      the banner's supporting sentence; else the slogan when it is not already the heading
 *   consult   the primary action: the banner's call to action when it aims at the contact page
 *             (its own label), else the contact destination under the footer band's button label
 *   phone     only for a site with a phone number
 *   more      a text link: the project the banner points at; with no other action, the project list
 * There is no reassurance list: the site data holds none.
 */
export function data(ctx: Ctx): HeroSplitData | undefined {
  const s = heroSource(ctx);
  if (!s) return undefined;
  const heading = s.heading ?? s.slogan ?? s.brand;
  const line = s.text ?? (s.heading ? s.slogan : undefined);
  const consult = s.action?.kind === "contact" ? { label: s.action.label, href: s.action.href } : s.consult;
  const project = s.action?.kind === "project" ? { label: s.action.label, href: s.action.href } : undefined;
  return {
    label: heading === s.brand ? undefined : s.brand,
    heading,
    line,
    image: s.image,
    consult,
    phone: s.phone,
    more: project ?? (consult || s.phone ? undefined : s.portfolio),
  };
}
