/**
 * Guarded source patches over the COPIED template app (Task 23).
 *
 * The historical template run is immutable; the production compiler copies
 * its app and rewrites four generated files. Every patch is anchored on the
 * exact generated text and FAILS LOUDLY when the anchor is missing, ambiguous
 * or already patched — a template compiled by a future generator version must
 * break the build here, never silently produce a half-baked artifact.
 */

function requireOnce(source: string, anchor: string, file: string): void {
  const first = source.indexOf(anchor);
  if (first === -1) {
    throw new Error(`production patch anchor not found in ${file}: ${JSON.stringify(anchor.slice(0, 80))}`);
  }
  if (source.indexOf(anchor, first + 1) !== -1) {
    throw new Error(`production patch anchor ambiguous in ${file}: ${JSON.stringify(anchor.slice(0, 80))}`);
  }
}

function requireAbsent(source: string, marker: string, file: string): void {
  if (source.includes(marker)) {
    throw new Error(`production patch already applied in ${file} (found ${JSON.stringify(marker)})`);
  }
}

/** next.config.mjs — switch the app to `output: "export"`. */
export function patchNextConfig(source: string): string {
  const anchor = "const nextConfig = {";
  requireOnce(source, anchor, "next.config.mjs");
  requireAbsent(source, "output:", "next.config.mjs");
  return source.replace(
    anchor,
    anchor + '\n  // Task 23 production bake: fully static export — no Next server at runtime.\n  output: "export",',
  );
}

/** app/[[...slug]]/page.tsx — static params for the exact route table.
 *
 * The template served every route per-request (`force-dynamic`) and resolved
 * query-variant route keys from `searchParams`. This route table has 20
 * path-only keys (verified by the compiler before patching), so the
 * production build prerenders exactly those paths and drops query
 * resolution — a static host ignores query strings, which is the documented
 * behavior delta of the static-export mode.
 */
export const PRODUCTION_PAGE_TSX = `import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findRoute, loadRouteMap } from "../../src/runtime/load-route";
import { loadPage } from "../../src/runtime/load-page";
import { PageRenderer } from "../../src/runtime/PageRenderer";

/**
 * Task 23 production bake: every route in the verified route table is
 * prerendered at build time (static export). Paths outside the table are a
 * 404 (dynamicParams=false), exactly as in the dynamic template app.
 */

export const dynamic = "error";
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export async function generateStaticParams(): Promise<Array<{ slug: string[] }>> {
  const map = await loadRouteMap();
  return map.routes.map((route) => ({
    slug: route.key === "/" ? [] : route.key.slice(1).split("/"),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const route = await findRoute(slug, {});
  return route?.title ? { title: route.title } : {};
}

export default async function CatchAllPage({ params }: PageProps) {
  const { slug } = await params;
  const route = await findRoute(slug, {});
  if (!route) notFound();
  const page = await loadPage(route.pageFile);
  return <PageRenderer page={page} route={route} />;
}
`;

export function patchPageTsx(source: string): string {
  // Anchors prove we are replacing the exact generated page, not something new.
  requireOnce(source, 'export const dynamic = "force-dynamic";', "app/[[...slug]]/page.tsx");
  requireOnce(source, "const page = await loadPage(route.pageFile);", "app/[[...slug]]/page.tsx");
  requireAbsent(source, "generateStaticParams", "app/[[...slug]]/page.tsx");
  return PRODUCTION_PAGE_TSX;
}

/** src/runtime/slot-content.ts — bake the content overlay, drop the env seam. */
export function patchSlotContent(source: string): string {
  const anchor =
    "  const overlayFile = process.env.WR_SLOT_VALUES_FILE;\n" +
    "  if (overlayFile) {\n" +
    '    const raw = await readFile(path.resolve(process.cwd(), overlayFile), "utf8");';
  requireOnce(source, anchor, "src/runtime/slot-content.ts");
  requireAbsent(source, "slot-values.baked.json", "src/runtime/slot-content.ts");
  const replacement =
    "  // Task 23 production bake: the accepted content run's overlay is baked\n" +
    "  // into the artifact (template-data/slot-values.baked.json). No environment\n" +
    "  // variable is consulted — the runtime has no external run-directory\n" +
    "  // dependency.\n" +
    "  {\n" +
    '    const raw = await readFile(path.join(TEMPLATE_DATA_DIR, "slot-values.baked.json"), "utf8");';
  return source.replace(anchor, replacement);
}

/** app/layout.tsx — link the baked theme overlay after the generated sheet.
 *
 * Same `precedence` group, rendered after: React preserves in-group order, so
 * the overlay cascades after the exact stylesheet — byte-for-byte the same
 * ordering the Task 20/21/22 proxies produced by appending to the sheet.
 */
export const THEME_OVERLAY_HREF = "/wr/theme-overlay.css";

export function patchLayout(source: string): string {
  const anchor =
    '<link rel="stylesheet" href={GENERATED_STYLES_HREF} precedence="wr-generated" />';
  requireOnce(source, anchor, "app/layout.tsx");
  requireAbsent(source, THEME_OVERLAY_HREF, "app/layout.tsx");
  return source.replace(
    anchor,
    anchor +
      "\n        {/* Task 23 production bake: theme overlay as a static asset. */}" +
      `\n        <link rel="stylesheet" href="${THEME_OVERLAY_HREF}" precedence="wr-generated" />`,
  );
}

/** Bake the SEO plan titles into route-map.json (head <title> AND the RSC
 *  flight payload both derive from the route table — no string splicing).
 *  Returns the mismatches where the route map's current title is not the
 *  plan's recorded upstream title (recorded honestly, still baked). */
export interface RouteTitleBakeResult {
  baked: number;
  mismatches: Array<{ route: string; routeMapTitle: string; planUpstreamTitle: string | null }>;
  missingRoutes: string[];
}

export function bakeRouteTitles(
  routeMap: { routes: Array<{ key: string; title?: string }> },
  planRoutes: Array<{ route: string; upstreamTitle: string | null; title: string }>,
): RouteTitleBakeResult {
  const byKey = new Map(routeMap.routes.map((r) => [r.key, r]));
  const result: RouteTitleBakeResult = { baked: 0, mismatches: [], missingRoutes: [] };
  for (const planRoute of planRoutes) {
    const route = byKey.get(planRoute.route);
    if (!route) {
      result.missingRoutes.push(planRoute.route);
      continue;
    }
    const current = route.title ?? "";
    if (planRoute.upstreamTitle !== null && current !== planRoute.upstreamTitle) {
      result.mismatches.push({
        route: planRoute.route,
        routeMapTitle: current,
        planUpstreamTitle: planRoute.upstreamTitle,
      });
    }
    route.title = planRoute.title;
    result.baked++;
  }
  return result;
}
