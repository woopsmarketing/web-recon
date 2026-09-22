/**
 * 1.5.2 (public demo SEO) changed a built package in exactly these declared ways, all in <head>:
 *   - the homepage has its own canonical (the public origin), like every other page;
 *   - every page with a canonical also carries OpenGraph (og:type / title / description / url, and
 *     og:image when the first home hero slide is a raster) — and the twitter:* tags Next.js derives
 *     from it — from the same values as its <title>, description and canonical;
 *   - a site whose `site.seo.indexing` is "noindex" says <meta name="robots" content="noindex"> on
 *     every page (default "index": no such tag, the 1.5.1 output).
 * The <body> (header, <main>, footer), robots.txt and the sitemap did not move. ia152.test.ts asserts
 * the exact shape of the above, so the new output is asserted, not ignored.
 */
const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};

/** Does a package of this Template version give its homepage a canonical (when the site has a public origin)? */
export const homeHasCanonical = (templateVersion: string) => versionAtLeast(templateVersion, "1.5.2");

/** Does a package of this Template version carry OpenGraph on its canonical pages? */
export const hasOpenGraph = (templateVersion: string) => versionAtLeast(templateVersion, "1.5.2");
