import type { PlannedValue, ProductionRouteSeo, ProductionSeoPlan, RenderedHead } from "./types.js";
import { RenderedHeadSchema } from "./types.js";

/**
 * Metadata rendering (Task 21 E) — turn the Production SEO Plan into the
 * exact strings the serve boundary injects into the browser head.
 *
 * Values with status `needs-input` and no preview fallback are NOT rendered —
 * a missing tag is honest, an invented one is not. The preview fallback (the
 * brand name) exists so the source title never reaches the browser.
 */

export const SEO_HEAD_START = "<!-- wr-seo-head-start -->";
export const SEO_HEAD_END = "<!-- wr-seo-head-end -->";

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function effective(planned: PlannedValue): string | null {
  return planned.value ?? planned.previewFallback ?? null;
}

function meta(name: "name" | "property", key: string, planned: PlannedValue | string | null): string | null {
  const value = typeof planned === "string" || planned === null ? planned : effective(planned);
  if (value === null || value === "") return null;
  return `<meta ${name}="${escapeAttribute(key)}" content="${escapeAttribute(value)}"/>`;
}

export function renderRouteHead(route: ProductionRouteSeo): { title: string; headHtml: string } {
  const title = effective(route.title);
  if (title === null) {
    throw new Error(`route ${route.route} has no renderable title (not even a preview fallback)`);
  }
  const parts: (string | null)[] = [
    SEO_HEAD_START,
    meta("name", "robots", route.robotsMeta.value),
    meta("name", "description", route.description),
    route.canonical.finalized && route.canonical.value !== null
      ? `<link rel="canonical" href="${escapeAttribute(route.canonical.value)}"/>`
      : null,
    meta("property", "og:title", route.openGraph.title),
    meta("property", "og:description", route.openGraph.description),
    meta("property", "og:type", route.openGraph.type),
    meta("property", "og:locale", route.openGraph.locale),
    meta("property", "og:site_name", route.openGraph.siteName),
    route.openGraph.url.status === "known" ? meta("property", "og:url", route.openGraph.url) : null,
    route.openGraph.image.status === "known" ? meta("property", "og:image", route.openGraph.image) : null,
    meta("name", "twitter:card", route.twitter.card),
    meta("name", "twitter:title", route.twitter.title),
    meta("name", "twitter:description", route.twitter.description),
    route.twitter.site.status === "known" ? meta("name", "twitter:site", route.twitter.site) : null,
    route.jsonLd.emitted
      ? `<script type="application/ld+json">${JSON.stringify(route.jsonLd.json).replace(/</g, "\\u003c")}</script>`
      : null,
    SEO_HEAD_END,
  ];
  return { title, headHtml: parts.filter((p): p is string => p !== null).join("") };
}

/** Render every route of a plan against the app's upstream titles. */
export function renderPlanHead(
  plan: ProductionSeoPlan,
  upstreamTitles: Map<string, string | null>,
): RenderedHead {
  return RenderedHeadSchema.parse({
    schemaVersion: 1,
    routes: plan.routes.map((route) => {
      const rendered = renderRouteHead(route);
      return {
        route: route.route,
        upstreamTitle: upstreamTitles.get(route.route) ?? null,
        title: rendered.title,
        headHtml: rendered.headHtml,
      };
    }),
  } satisfies RenderedHead);
}
