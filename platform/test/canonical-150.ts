/**
 * 1.5.0 (information architecture) changed a built package in exactly these declared ways. The
 * "same as the previous package" regressions (step4 G/H + T, step41 A / V / W, step5 AD / AE,
 * step6 X) stay exact by setting aside exactly these, on whichever side has them, and nothing else:
 *   - three new static pages: /3d-portfolio, /about, /contact (route keys portfolio3d, about,
 *     contact; always generated, one page each) — their HTML files, sitemap entries and route-plan
 *     counts;
 *   - the project detail CTA points at /contact (a next/link: class before href) instead of the
 *     business mailto (a plain <a>: href before class).
 * ia150.test.ts asserts the exact shape of what is set aside here (the pages, their sitemap
 * entries, the route plan, the CTA href), so the new output is asserted, not ignored. A no-op
 * on two packages of the same side of 1.5.0.
 */
export const IA_ROUTES = [
  { key: "portfolio3d", path: "/3d-portfolio" },
  { key: "about", path: "/about" },
  { key: "contact", path: "/contact" },
] as const;
export const IA_PATHS: readonly string[] = IA_ROUTES.map((r) => r.path);
export const IA_HTML: readonly string[] = IA_ROUTES.map((r) => `${r.path.slice(1)}.html`);
const IA_KEYS: readonly string[] = IA_ROUTES.map((r) => r.key);

/** a package's HTML file list without the 1.5.0 pages */
export const withoutIaPages = (files: readonly string[]) => files.filter((f) => !IA_HTML.includes(f));

/** sitemap.xml without the 1.5.0 pages' <url> entries (as the Next sitemap route writes them) */
export function canonical150Sitemap(xml: string): string {
  return xml.replace(/<url>\n<loc>[^<]*<\/loc>\n<\/url>\n/g, (entry) => (IA_PATHS.some((p) => entry.includes(`${p}</loc>`)) ? "" : entry));
}

/** a build record's preflight route counts without the 1.5.0 route keys */
export function canonical150Routes(routes: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(routes).filter(([k]) => !IA_KEYS.includes(k)));
}

/** a detail <main>: the /contact CTA back to the business mailto it replaced (no email = no CTA on either side) */
export function canonical150Main(mainHtml: string, email: string | undefined): string {
  if (!email) return mainHtml;
  return mainHtml.replaceAll('<a class="i1-button" href="/contact">', `<a href="mailto:${email}" class="i1-button">`);
}
