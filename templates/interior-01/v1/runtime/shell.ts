/**
 * Portfolio shell declaration (INCREMENTAL portfolio publishing, 1.7.0) — constants only, no import.
 *
 * A site whose portfolio is published incrementally is built ONCE, without portfolio data: the
 * pages below are emitted as SHELLS (the real header / footer / styles / scripts and every section
 * that does not read the portfolio, with an empty placeholder where each portfolio-dependent
 * section goes) and the final pages are composed at publish time by this release's runtime kit
 * (runtime/portfolio.ts → platform/portfolio-runtime).
 *
 * The builder reads `portfolioShell` from this file inside the build workspace, so it must stay
 * free of imports. `api` is the shape version of this object and of runtime/portfolio.ts.
 *
 *   slug    the reserved segment of a shell page that stands for many pages: not a valid project
 *           slug and not a page number (leading underscore), so it can never collide with one
 *   pages   route key → the path of the shell page the build emits for it. The list has TWO shells:
 *           /portfolio (page 1: the header marks the list link as the current page) and one for
 *           pages 2…N (the header marks it as the current section) — the header is shell markup,
 *           so the difference cannot come from slot data
 *   owned   the URL space the composed pages answer (everything else is the site package's;
 *           /3d-portfolio is NOT under the /portfolio prefix)
 *   data    id of the inline <script type="application/json"> that carries a composed page's slot data
 */
export const PORTFOLIO_SHELL_SLUG = "_shell";
export const PORTFOLIO_SLOT_DATA_ID = "recon-portfolio-slots";
export const PORTFOLIO_SLOT_ATTRIBUTE = "data-portfolio-slot";

export const portfolioShell = {
  api: 1,
  slug: PORTFOLIO_SHELL_SLUG,
  pages: [
    { route: "home", path: "/" },
    { route: "portfolio.index", path: "/portfolio" },
    { route: "portfolio.page", path: `/portfolio/page/${PORTFOLIO_SHELL_SLUG}` },
    { route: "portfolio.detail", path: `/portfolio/${PORTFOLIO_SHELL_SLUG}` },
  ],
  owned: { exact: ["/", "/sitemap.xml"], prefixes: ["/portfolio"] },
  data: PORTFOLIO_SLOT_DATA_ID,
} as const;

/** route keys that always generate a page in a shell build, whatever the (absent) portfolio holds */
export const SHELL_ROUTES: ReadonlySet<string> = new Set(portfolioShell.pages.map((p) => p.route));
/** shell pages that are real public URLs once composed ("/", "/portfolio") — not the two reserved shells */
export const SHELL_LISTED_PATHS: readonly string[] = portfolioShell.pages.map((p) => p.path).filter((p) => !p.endsWith(`/${PORTFOLIO_SHELL_SLUG}`));

/**
 * Shell pages only: every same-origin link to ANOTHER page is a full page load. A page reached by
 * client navigation would be rendered from the shell's flight payload, which carries no slot data.
 * Capture phase on the window, so it runs before any framework handler; modified clicks, new-tab
 * targets, downloads and links that stay on this page (a #hash, or the list's own ?filter query —
 * the filter island handles those in place) are left alone.
 */
export const SHELL_NAVIGATION_SCRIPT =
  '(function(){addEventListener("click",function(e){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;' +
  'var t=e.target,a=t&&t.closest?t.closest("a[href]"):null;if(!a||a.hasAttribute("download"))return;var g=a.getAttribute("target");if(g&&g!=="_self")return;' +
  'var u;try{u=new URL(a.href,location.href)}catch(x){return}if(u.origin!==location.origin)return;' +
  "if(u.pathname===location.pathname)return;e.stopImmediatePropagation()},true)})();";
