import { projectsQuery } from "@platform/settings/settings";
import { projectCardModels } from "../../../lib/projects";
import { hasRoute } from "../../../lib/routes";
import type { Ctx } from "../../../sections/types";
import type { HeroStatementData } from "./model";
import { heroSource } from "./source";

/** The strip shows at most five covers (three from 700, two below — the sheet decides). */
const STRIP_MAX = 5;
/** A heading longer than this is set one type step smaller, so that it stays a statement and not a paragraph. */
const LONG_HEADING = 24;

/**
 * hero.statement (HE-C) — data. The type is the image: the hero heading (the first banner's
 * headline; without one the slogan; without one the company name) as the display line, a
 * supporting sentence in the second tone (the banner's text, else the slogan when it is not
 * already the heading), one link, and a strip of project covers — the projects `home.projects`
 * selects, newest first — only when the site has projects. The banner's photograph is not shown.
 */
export function data(ctx: Ctx): HeroStatementData | undefined {
  const s = heroSource(ctx);
  if (!s) return undefined;
  const heading = s.heading ?? s.slogan ?? s.brand;
  const line = s.text ?? (s.heading ? s.slogan : undefined);
  const detail = hasRoute(ctx, "portfolio.detail");
  const { items } = ctx.content.list(projectsQuery({ selection: ctx.settings["home.projects"].selection, limit: STRIP_MAX }));
  return {
    label: heading === s.brand ? undefined : s.brand,
    heading,
    long: Array.from(heading).length > LONG_HEADING,
    line,
    link: (s.action ? { label: s.action.label, href: s.action.href } : undefined) ?? s.portfolio ?? s.consult,
    strip: projectCardModels(ctx, items).map((m) => ({ id: m.id, title: m.title, place: m.location, href: detail ? m.href : undefined, image: m.cover })),
  };
}
