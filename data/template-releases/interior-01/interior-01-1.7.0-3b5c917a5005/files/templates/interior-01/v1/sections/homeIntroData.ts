import { liveLink, type LiveLink } from "./links";
import type { Ctx } from "./types";

// 1.7.0: the intro's DATA lives here, apart from its markup (HomeIntro.tsx) — see homeProjectsData.ts.

export interface HomeIntroData {
  title: string;
  body?: string[];
  media?: { src: string; width: number; height: number; alt: string };
  link?: LiveLink;
}

/**
 * home.intro — the site's own words (slots only). No title → no section: a Template
 * default here would be a claim about the business. Media is optional (image; video is
 * deferred), the link is optional and kept only when its destination exists: a page this build
 * lists, or one of `anchors` — the in-page sections that are actually rendered on the homepage.
 * Both depend on the portfolio (a page under /portfolio, the anchor of a project showcase), which
 * is why the intro is a runtime slot of an incrementally published site (runtime/portfolio.ts).
 */
export function homeIntro(ctx: Ctx, anchors: ReadonlySet<string>): HomeIntroData | undefined {
  if (!ctx.settings["home.intro"].enabled) return undefined;
  const title = ctx.slots.text("home.intro", "title");
  if (!title) return undefined;
  const media = ctx.slots.media("home.intro", "media");
  return {
    title,
    body: ctx.slots.richText("home.intro", "body")?.paragraphs,
    media: media ? { ...ctx.assets.resolve(media.asset), alt: media.alt } : undefined,
    link: liveLink(ctx, ctx.slots.link("home.intro", "link"), anchors),
  };
}
