/**
 * Portfolio shell declaration (INCREMENTAL portfolio publishing) — constants only, no import.
 *
 * A site whose portfolio is published incrementally is built ONCE, without portfolio data: the
 * pages below are emitted as SHELLS (real header / footer / styles / scripts, an empty placeholder
 * where each portfolio-dependent section goes) and the final pages are composed at publish time by
 * this release's runtime kit (runtime/portfolio.ts → platform/portfolio-runtime).
 *
 * The builder reads `portfolioShell` from this file inside the build workspace, so it must stay
 * free of imports. `api` is the shape version of this object and of runtime/portfolio.ts.
 *
 *   slug    the reserved detail slug: not a valid project slug (leading underscore), so the detail
 *           shell can never collide with a record
 *   pages   route key → the path of the shell page the build emits for it
 *   owned   the URL space the composed pages answer (everything else is the site package's)
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
    { route: "portfolio.detail", path: `/portfolio/${PORTFOLIO_SHELL_SLUG}` },
  ],
  owned: { exact: ["/", "/sitemap.xml"], prefixes: ["/portfolio"] },
  data: PORTFOLIO_SLOT_DATA_ID,
} as const;

/** route keys that always generate a page in a shell build, whatever the (absent) portfolio holds */
export const SHELL_ROUTES: ReadonlySet<string> = new Set(portfolioShell.pages.map((p) => p.route));
/** shell pages that are real public URLs once composed ("/", "/portfolio") — not the reserved detail shell */
export const SHELL_LISTED_PATHS: readonly string[] = portfolioShell.pages.map((p) => p.path).filter((p) => !p.endsWith(`/${PORTFOLIO_SHELL_SLUG}`));

/**
 * Shell pages only: every same-origin link to ANOTHER page is a full page load. A page reached by
 * client navigation would be rendered from the shell's flight payload, which carries no slot data.
 * Capture phase on the window, so it runs before any framework handler; modified clicks, new-tab
 * targets, downloads and same-page (#hash) links are left alone.
 */
export const SHELL_NAVIGATION_SCRIPT =
  '(function(){addEventListener("click",function(e){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;' +
  'var t=e.target,a=t&&t.closest?t.closest("a[href]"):null;if(!a||a.hasAttribute("download"))return;var g=a.getAttribute("target");if(g&&g!=="_self")return;' +
  'var u;try{u=new URL(a.href,location.href)}catch(x){return}if(u.origin!==location.origin)return;' +
  "if(u.pathname===location.pathname&&u.search===location.search)return;e.stopImmediatePropagation()},true)})();";
