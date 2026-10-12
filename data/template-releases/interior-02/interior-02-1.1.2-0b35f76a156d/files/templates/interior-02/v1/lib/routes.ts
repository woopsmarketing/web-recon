import type { Ctx } from "../sections/types";
import { SHELL_LISTED_PATHS, SHELL_ROUTES } from "../runtime/shell";

/**
 * Route availability (SHELL shared block) — the one place template code asks "does this route
 * generate a page?" and "which pages does this site list?".
 *   isShell(ctx)        this render is the SHELL build of an incrementally published site: the
 *                       portfolio is not in the build (the builder sets site.portfolio.shell)
 *   hasRoute(ctx, key)  ctx.routes.has(key); in a shell build the portfolio routes always exist
 *                       (their pages are composed at publish time)
 *   routePaths(ctx)     every listed page path; in a shell build the composed pages the shell
 *                       stands for ("/portfolio") are listed, the reserved detail shell never is
 */
export function isShell(ctx: Ctx): boolean {
  return ctx.settings["site.portfolio"].shell;
}

export function hasRoute(ctx: Ctx, key: string): boolean {
  return (isShell(ctx) && SHELL_ROUTES.has(key)) || ctx.routes.has(key);
}

export function routePaths(ctx: Ctx): string[] {
  const paths = ctx.routes.paths();
  if (!isShell(ctx)) return paths;
  let at = 0;
  for (const p of SHELL_LISTED_PATHS) {
    const i = paths.indexOf(p);
    if (i >= 0) at = i + 1;
    else paths.splice(at++, 0, p);
  }
  return paths;
}
