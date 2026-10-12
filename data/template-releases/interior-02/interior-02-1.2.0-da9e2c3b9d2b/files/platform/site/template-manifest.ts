import type { SectionDeclarations } from "../settings/settings";
import type { ThemeTokenId } from "../theme/theme";

/**
 * Template manifest: only fields with a named consumer.
 *   id/version   → release snapshot, site pin, build record
 *   sections     → settings validation (Effective Settings)
 *   theme        → theme validation (consumed tokens) + default theme
 *   routes       → route plan (platform/site/routes): which concrete pages exist for
 *                  THIS site's content → generateStaticParams, nav availability,
 *                  sitemap, build-time pruning and package QA
 *
 * Next.js App Router stays the router: `path` is the app/ directory pattern the
 * Template already implements; the manifest only says what content generates it.
 */
export type TemplateRoute =
  /** Always generated (e.g. "/"). */
  | { key: string; path: string }
  /**
   * An OFFSET-paginated list over a collection's default order.
   * `page: "first"` = the static route for page 1 (exists when the collection has ≥ 1 item);
   * `page: "rest"`  = the dynamic route for pages 2…N (its only param is the page number).
   */
  | { key: string; path: string; list: { collection: "projects"; pageSize: number; page: "first" | "rest" } }
  /** One page per served collection item; the route's only param is the item slug. */
  | { key: string; path: string; item: { collection: "projects" } };

export interface TemplateManifest<D extends SectionDeclarations = SectionDeclarations> {
  id: string;
  version: string;
  vertical: "interior";
  sections: D;
  theme: { consumes: readonly ThemeTokenId[]; defaults: unknown };
  routes: readonly TemplateRoute[];
}

export function defineTemplate<D extends SectionDeclarations>(manifest: TemplateManifest<D>): TemplateManifest<D> {
  return manifest;
}
