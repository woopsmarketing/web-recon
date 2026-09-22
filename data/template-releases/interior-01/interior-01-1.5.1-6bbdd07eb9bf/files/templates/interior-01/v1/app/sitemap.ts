import type { MetadataRoute } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { listedPaths } from "../sections/links";

export const dynamic = "force-static";

/**
 * Exactly the pages this build generates (route plan) and lists (1.5.1: not /contact on a site
 * without a contact channel, see listedPaths), as absolute URLs on the site's declared production
 * origin. No origin (or a preview build) → empty sitemap: a domain is never invented.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const ctx = getSiteContext(template);
  const origin = ctx.identity.publicOrigin;
  if (!origin || ctx.mode === "preview") return [];
  return listedPaths(ctx).map((p) => ({ url: p === "/" ? `${origin}/` : `${origin}${p}` }));
}
