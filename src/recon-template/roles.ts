import type { SlotRole } from "./types.js";
import type { Section } from "./extract.js";

/**
 * Deterministic role assignment — Slot V2's canonical-role axis.
 *
 * The rule set is small and every rule reads structural evidence that is
 * certain (landmark ancestry, tag names, anchor containment). Anything the
 * rules cannot claim gets a GENERIC role (`content.text`, `link.label`,
 * `link.href`, `image.content`) — an unknown role is allowed, a guessed one is
 * not. No AI, no text matching, no class names.
 */

export interface TextRoleEvidence {
  section: Section;
  ownerTag: string;
  headingLevel?: number;
  /** True when this unit is the page's first `<h1>` text inside `main`. */
  isHeroHeadline: boolean;
  /** True when a static occurrence sits inside the hero container. */
  inHeroContainer: boolean;
  /** True when this is the first hero-container paragraph text of the page. */
  isHeroDescription: boolean;
}

export function textRole(e: TextRoleEvidence): SlotRole {
  if (e.isHeroHeadline) return "hero.headline";
  if (e.isHeroDescription) return "hero.description";
  if (e.headingLevel === 1) return "heading.primary";
  if (e.headingLevel === 2) return "heading.secondary";
  if ((e.section === "header" || e.section === "nav") && (e.ownerTag === "button" || e.ownerTag === "summary")) {
    // A header/nav trigger label (mega-menu button, mobile menu button).
    return "navigation.label";
  }
  if (e.section === "footer") return "footer.text";
  return "content.text";
}

export interface LinkRoleEvidence {
  section: Section;
  inNav: boolean;
  inHeroContainer: boolean;
}

export function linkRoles(e: LinkRoleEvidence): { label: SlotRole; href: SlotRole } {
  if (e.section === "header" || e.section === "nav" || (e.section === "footer" && e.inNav)) {
    return { label: "navigation.label", href: "navigation.href" };
  }
  if (e.inHeroContainer) return { label: "cta.label", href: "cta.href" };
  return { label: "link.label", href: "link.href" };
}

export interface ImageRoleEvidence {
  section: Section;
  /** The image links to the site root — the classic header brand mark. */
  anchorHrefIsRoot: boolean;
}

export function imageRole(e: ImageRoleEvidence): SlotRole {
  if (e.section === "header" && e.anchorHrefIsRoot) return "brand.logo";
  return "image.content";
}
