import type { MetadataRoute } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";

export const dynamic = "force-static";

/** Preview builds: disallow everything (pages also carry noindex). Public: allow + sitemap on the real origin only. */
export default function robots(): MetadataRoute.Robots {
  const ctx = getSiteContext(template);
  if (ctx.mode === "preview") return { rules: { userAgent: "*", disallow: "/" } };
  const origin = ctx.identity.publicOrigin;
  return { rules: { userAgent: "*", allow: "/" }, ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}
