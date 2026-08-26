import { parse, type DefaultTreeAdapterTypes } from "parse5";

/**
 * Internal Link QA over the production candidate (Task 21 H).
 *
 * Fetches every planned route from the SERVED production candidate and
 * classifies each anchor href deterministically:
 *
 *   route-resolves        internal path present in the route table
 *   broken-internal       internal path the app can only answer 404
 *   source-host-absolute  absolute URL still pointing at the SOURCE host
 *                         (an inherited body-content leak — reported, and
 *                         owned by asset/content independence, not invented
 *                         away here)
 *   external              absolute URL to any other host
 *   non-navigational      mailto: / tel: / javascript: / #fragment / empty
 */

type P5Node = DefaultTreeAdapterTypes.Node;

export interface RouteLinkAudit {
  route: string;
  fetched: boolean;
  httpStatus: number | null;
  anchors: number;
  routeResolves: number;
  brokenInternal: { href: string }[];
  sourceHostAbsolute: number;
  external: number;
  nonNavigational: number;
}

export function auditAnchors(
  html: string,
  routeKeys: Set<string>,
  sourceHost: string,
): Omit<RouteLinkAudit, "route" | "fetched" | "httpStatus"> {
  const hrefs: string[] = [];
  const walk = (node: P5Node): void => {
    if ("tagName" in node && node.tagName.toLowerCase() === "a") {
      const href = node.attrs.find((a) => a.name.toLowerCase() === "href")?.value;
      if (href !== undefined) hrefs.push(href);
    }
    if ("childNodes" in node) for (const child of node.childNodes) walk(child);
  };
  walk(parse(html));

  const result = {
    anchors: hrefs.length,
    routeResolves: 0,
    brokenInternal: [] as { href: string }[],
    sourceHostAbsolute: 0,
    external: 0,
    nonNavigational: 0,
  };
  for (const href of hrefs) {
    const trimmed = href.trim();
    if (
      trimmed === "" ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("mailto:") ||
      trimmed.startsWith("tel:") ||
      trimmed.startsWith("javascript:")
    ) {
      result.nonNavigational += 1;
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
      try {
        const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
        if (url.host === sourceHost || url.host === `www.${sourceHost}`) result.sourceHostAbsolute += 1;
        else result.external += 1;
      } catch {
        result.external += 1;
      }
      continue;
    }
    const pathOnly = trimmed.split("?")[0].split("#")[0];
    const normalized = pathOnly.replace(/\/+$/, "") === "" ? "/" : pathOnly.replace(/\/+$/, "");
    if (routeKeys.has(normalized)) result.routeResolves += 1;
    else result.brokenInternal.push({ href: trimmed });
  }
  return result;
}

export async function runInternalLinkQa(options: {
  baseUrl: string;
  routes: string[];
  sourceHost: string;
  log?: (line: string) => void;
}): Promise<{ routes: RouteLinkAudit[]; totals: Omit<RouteLinkAudit, "route" | "fetched" | "httpStatus"> & { fetchedRoutes: number } }> {
  const log = options.log ?? (() => {});
  const routeKeys = new Set(options.routes.map((r) => (r.replace(/\/+$/, "") === "" ? "/" : r.replace(/\/+$/, ""))));
  const audits: RouteLinkAudit[] = [];
  for (const route of options.routes) {
    const response = await fetch(options.baseUrl + route, { redirect: "manual" });
    if (!response.ok) {
      audits.push({
        route,
        fetched: false,
        httpStatus: response.status,
        anchors: 0,
        routeResolves: 0,
        brokenInternal: [],
        sourceHostAbsolute: 0,
        external: 0,
        nonNavigational: 0,
      });
      continue;
    }
    const audit = auditAnchors(await response.text(), routeKeys, options.sourceHost);
    audits.push({ route, fetched: true, httpStatus: response.status, ...audit });
    log(`[seo:qa] links ${route} — anchors ${audit.anchors}, resolve ${audit.routeResolves}, broken ${audit.brokenInternal.length}, source-host ${audit.sourceHostAbsolute}`);
  }
  const totals = audits.reduce(
    (acc, audit) => ({
      fetchedRoutes: acc.fetchedRoutes + (audit.fetched ? 1 : 0),
      anchors: acc.anchors + audit.anchors,
      routeResolves: acc.routeResolves + audit.routeResolves,
      brokenInternal: [...acc.brokenInternal, ...audit.brokenInternal.map((b) => ({ href: `${audit.route} → ${b.href}` }))],
      sourceHostAbsolute: acc.sourceHostAbsolute + audit.sourceHostAbsolute,
      external: acc.external + audit.external,
      nonNavigational: acc.nonNavigational + audit.nonNavigational,
    }),
    { fetchedRoutes: 0, anchors: 0, routeResolves: 0, brokenInternal: [] as { href: string }[], sourceHostAbsolute: 0, external: 0, nonNavigational: 0 },
  );
  return { routes: audits, totals };
}
