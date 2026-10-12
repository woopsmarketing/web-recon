import type { Ctx } from "../../../sections/types";
import type { HeroPhotoData } from "./model";
import { heroSource } from "./source";

/**
 * hero.photo (HE-A) — data. One photograph carries the first screen: the first banner's image, its
 * headline as one short line, and one quiet link (the banner's own call to action, else the project
 * list). A banner that points at a project names it above the line.
 *
 * No banner (no hero photograph): the same block set as type on the page surface — the slogan (or,
 * without one, the company name) as the line, the company name above it.
 */
export function data(ctx: Ctx): HeroPhotoData | undefined {
  const s = heroSource(ctx);
  if (!s) return undefined;
  if (s.image) {
    return {
      image: s.image,
      caption: s.project ? [s.project.name, s.project.area].filter(Boolean).join(" · ") : undefined,
      heading: s.heading,
      link: s.action ? { label: s.action.label, href: s.action.href } : s.portfolio,
    };
  }
  const heading = s.slogan ?? s.brand;
  return { caption: heading === s.brand ? undefined : s.brand, heading, link: s.portfolio ?? s.consult };
}
