/**
 * 1.5.1 (IA review fixes) changed a built package in exactly these declared ways:
 *   - a site WITHOUT a contact channel (no business email) no longer lists /contact in its
 *     sitemap.xml — the page itself is still generated (the route plan has no per-site switch
 *     for a static page); a site with one lists it as in 1.5.0;
 *   - the /contact form (contact.html — already set aside, with the other 1.5.0 pages, by
 *     canonical-150.ts) and the client menu: field caps, the mailto length guard + copy fallback,
 *     CRLF message lines, the re-announced status, focus after a width-driven menu close. These
 *     are client behaviour (scripts/template-platform-ia151-smoke.ts) plus the server-rendered
 *     maxlength attributes asserted by ia151.test.ts.
 * Nothing else in the server HTML moved. ia151.test.ts asserts the exact shape of the above.
 */
import { IA_PATHS } from "./canonical-150";

const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};

/**
 * The 1.5.0 static pages a package's sitemap lists: none before 1.5.0; all three from 1.5.0;
 * from 1.5.1 without /contact when the site has no contact channel.
 */
export function sitemapIaPaths(templateVersion: string, hasContactChannel: boolean): readonly string[] {
  if (!versionAtLeast(templateVersion, "1.5.0")) return [];
  if (versionAtLeast(templateVersion, "1.5.1") && !hasContactChannel) return IA_PATHS.filter((p) => p !== "/contact");
  return IA_PATHS;
}
