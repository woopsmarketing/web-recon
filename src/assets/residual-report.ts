/**
 * Cross-route residual source-asset report (Task 27 GED-G).
 *
 * The runtime census (report/network-qa.json) already captures per-route
 * `sourceUrls`; what never existed was (a) a census whose route scope covered
 * the site rather than "/" alone, and (b) a per-FILE join of that measurement
 * with the asset inventory and the replacement manifest. Both are here:
 *
 *   resolveCensusRoutes      route scope from the template run's site-map.json
 *                            (the routes the lineage already established), with
 *                            an explicit --routes override and an honest
 *                            single-route fallback when the map is unreadable.
 *                            An override that parses to zero routes is recorded
 *                            as `discardedExplicitRoutes`, never dropped.
 *   buildResidualAssetReport per-file report: normalized URL, host, the rendered
 *                            routes it was requested on with occurrence counts,
 *                            the inventory id when it joins EXACTLY (null, never
 *                            a guess, when it does not), the replacement status
 *                            READ from replacement-manifest.json, and evidence
 *                            refs into the artifacts each field came from.
 *
 * Authority: replacement-manifest.json decides WHETHER an asset must be
 * replaced. This report only says WHERE the residual file still renders and
 * HOW OFTEN — render prioritization, not a competing verdict.
 *
 * Nothing here fetches: it joins on-disk evidence only.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { NetworkQaReport } from "./network-qa.js";
import {
  ASSET_RESIDUAL_REPORT_SCHEMA_NAME,
  ASSET_SCHEMA_VERSION,
  ResidualAssetReportSchema,
  type AssetInventory,
  type CensusRouteScope,
  type ReplacementManifest,
  type ResidualAssetFile,
  type ResidualAssetReport,
} from "./types.js";

/**
 * Fragment-strip only. The query string is KEPT: CDN transform params
 * (?w=608&fm=webp&q=90) identify a distinct delivered file, and collapsing
 * them would merge assets the inventory keeps apart.
 */
export function normalizeResidualUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString();
  } catch {
    return raw;
  }
}

export interface CensusRouteScopeOptions {
  /** Template run directory — its site-map.json is the route source of truth. */
  templateRunDir: string;
  /** Raw --routes value ("/a,/b"), when the operator overrode the scope. */
  explicitRoutes?: string | null;
  /** Optional wall-clock bound; null/undefined measures every route. */
  maxRoutes?: number | null;
}

function parseRouteList(raw: string): string[] {
  return raw
    .split(",")
    .map((route) => route.trim())
    .filter((route) => route.length > 0);
}

/** Order routes for a census: "/" first (it anchors every other artifact), lineage order after. */
function orderRoutes(routes: string[]): string[] {
  const unique = [...new Set(routes)];
  return [
    ...unique.filter((route) => route === "/"),
    ...unique.filter((route) => route !== "/"),
  ];
}

/**
 * Resolve which routes a census must cover. Default is the whole site map —
 * before Task 27 this defaulted to ["/"], which hid every residual asset that
 * only renders on another route (src/cli-assets-qa.ts, Task 22 I).
 */
export async function resolveCensusRoutes(
  options: CensusRouteScopeOptions,
): Promise<CensusRouteScope> {
  const maxRoutes =
    typeof options.maxRoutes === "number" && options.maxRoutes > 0 ? options.maxRoutes : null;
  const truncate = (routes: string[]): { routes: string[]; truncatedTo: number | null } =>
    maxRoutes !== null && routes.length > maxRoutes
      ? { routes: routes.slice(0, maxRoutes), truncatedTo: maxRoutes }
      : { routes, truncatedTo: null };

  // An override that parses to zero routes (--routes " , ") cannot BE the
  // scope, but it must not vanish either: the site map then supplies the
  // routes while `discardedExplicitRoutes` keeps the operator's discarded
  // input on the record. src/cli-assets-qa.ts refuses to run on it.
  let discardedExplicitRoutes: string | null = null;
  if (options.explicitRoutes !== undefined && options.explicitRoutes !== null) {
    const explicit = orderRoutes(parseRouteList(options.explicitRoutes));
    if (explicit.length > 0) {
      const { routes, truncatedTo } = truncate(explicit);
      return {
        source: "explicit-routes",
        routes,
        siteMapFile: null,
        siteMapRouteCount: null,
        truncatedTo,
        discardedExplicitRoutes: null,
        note: "operator passed --routes; the site map was not consulted",
      };
    }
    discardedExplicitRoutes = options.explicitRoutes;
  }
  const discardedSuffix =
    discardedExplicitRoutes === null
      ? ""
      : ` (--routes ${JSON.stringify(discardedExplicitRoutes)} declared no route and was DISCARDED)`;

  const siteMapFile = path.join(path.resolve(options.templateRunDir), "site-map.json");
  try {
    const siteMap = JSON.parse(await readFile(siteMapFile, "utf8")) as {
      routes?: Array<{ route?: unknown }>;
    };
    const declared = (siteMap.routes ?? [])
      .map((entry) => entry.route)
      .filter((route): route is string => typeof route === "string" && route.startsWith("/"));
    if (declared.length === 0) {
      return {
        source: "fallback-root",
        routes: ["/"],
        siteMapFile,
        siteMapRouteCount: 0,
        truncatedTo: null,
        discardedExplicitRoutes,
        note: `${siteMapFile} declares no routes — census falls back to "/" alone${discardedSuffix}`,
      };
    }
    const { routes, truncatedTo } = truncate(orderRoutes(declared));
    return {
      source: "template-site-map",
      routes,
      siteMapFile,
      siteMapRouteCount: declared.length,
      truncatedTo,
      discardedExplicitRoutes,
      note:
        (truncatedTo === null
          ? `every route declared by ${siteMapFile}`
          : `first ${truncatedTo} of ${declared.length} routes declared by ${siteMapFile} (--max-routes)`) +
        discardedSuffix,
    };
  } catch (error) {
    return {
      source: "fallback-root",
      routes: ["/"],
      siteMapFile,
      siteMapRouteCount: null,
      truncatedTo: null,
      discardedExplicitRoutes,
      note: `site map unreadable (${error instanceof Error ? error.message : String(error)}) — census falls back to "/" alone${discardedSuffix}`,
    };
  }
}

export interface ResidualReportOptions {
  networkReport: NetworkQaReport;
  /** Identity source: which inventory entry (if any) this URL is. */
  inventory: AssetInventory;
  /** AUTHORITATIVE on replacement — read, never re-derived. */
  replacementManifest: ReplacementManifest;
  routeScope: CensusRouteScope;
  /** Artifact paths recorded as evidence refs. */
  files: {
    networkQa: string;
    inventory: string;
    replacementManifest: string;
  };
  createdAt?: string;
}

/**
 * Join the independent (asset-layer-active) census with the inventory and the
 * replacement manifest, per residual file, across every measured route.
 */
export function buildResidualAssetReport(options: ResidualReportOptions): ResidualAssetReport {
  const { networkReport, inventory, replacementManifest, files } = options;

  // Exact-URL join tables. A URL that is not a key here reports null — we do
  // not fall back to a path/basename match, which would be a guess.
  const inventoryByUrl = new Map<string, AssetInventory["entries"][number]>();
  for (const entry of inventory.entries) {
    if (entry.url === null) continue;
    const key = normalizeResidualUrl(entry.url);
    if (!inventoryByUrl.has(key)) inventoryByUrl.set(key, entry);
  }
  const replacementById = new Map(
    replacementManifest.entries.map((entry) => [entry.inventoryId, entry]),
  );

  interface Accumulator {
    url: string;
    host: string;
    routes: Map<string, number>;
  }
  const accumulators = new Map<string, Accumulator>();
  let routesWithResidual = 0;
  for (const route of networkReport.independent) {
    if (route.sourceUrls.length > 0) routesWithResidual++;
    for (const raw of route.sourceUrls) {
      const url = normalizeResidualUrl(raw);
      let accumulator = accumulators.get(url);
      if (accumulator === undefined) {
        let host = "";
        try {
          host = new URL(url).hostname;
        } catch {
          host = "";
        }
        accumulator = { url, host, routes: new Map() };
        accumulators.set(url, accumulator);
      }
      accumulator.routes.set(route.route, (accumulator.routes.get(route.route) ?? 0) + 1);
    }
  }

  const residualFiles: ResidualAssetFile[] = [];
  for (const accumulator of accumulators.values()) {
    const routes = [...accumulator.routes.entries()]
      .map(([route, occurrences]) => ({ route, occurrences }))
      .sort((a, b) => a.route.localeCompare(b.route));
    const occurrences = routes.reduce((sum, hit) => sum + hit.occurrences, 0);
    const inventoryEntry = inventoryByUrl.get(accumulator.url) ?? null;
    const replacementEntry =
      inventoryEntry === null ? undefined : replacementById.get(inventoryEntry.inventoryId);
    const evidence = [
      ...routes.map(
        (hit) => `${files.networkQa}#independent[route=${hit.route}].sourceUrls`,
      ),
      inventoryEntry === null
        ? `${files.inventory}#entries — no entry carries this exact URL`
        : `${files.inventory}#entries[${inventoryEntry.inventoryId}]`,
      replacementEntry === undefined
        ? `${files.replacementManifest}#entries — no entry for this asset`
        : `${files.replacementManifest}#entries[${replacementEntry.inventoryId}]`,
    ];
    residualFiles.push({
      url: accumulator.url,
      host: accumulator.host,
      routes,
      routeCount: routes.length,
      occurrences,
      inventoryId: inventoryEntry?.inventoryId ?? null,
      assetId: inventoryEntry?.assetId ?? null,
      slotKeys: inventoryEntry?.slotKeys ?? [],
      replacement: {
        inManifest: replacementEntry !== undefined,
        classification: replacementEntry?.classification ?? null,
        status: replacementEntry?.replacement.status ?? null,
        providedFile: replacementEntry?.replacement.providedFile ?? null,
        note: replacementEntry?.note ?? null,
        manifestFile: files.replacementManifest,
      },
      evidence,
    });
  }
  // Prioritization: what renders most, on most routes, first.
  residualFiles.sort(
    (a, b) =>
      b.occurrences - a.occurrences ||
      b.routeCount - a.routeCount ||
      a.url.localeCompare(b.url),
  );

  const byHost: Record<string, number> = {};
  for (const file of residualFiles) {
    byHost[file.host] = (byHost[file.host] ?? 0) + file.occurrences;
  }

  return ResidualAssetReportSchema.parse({
    schemaVersion: ASSET_SCHEMA_VERSION,
    schemaName: ASSET_RESIDUAL_REPORT_SCHEMA_NAME,
    createdAt: options.createdAt ?? new Date().toISOString(),
    sourceHost: inventory.sourceHost,
    routeScope: options.routeScope,
    inputs: {
      networkQaFile: files.networkQa,
      inventoryFile: files.inventory,
      replacementManifestFile: files.replacementManifest,
    },
    counts: {
      routesMeasured: networkReport.independent.length,
      routesWithResidual,
      residualFiles: residualFiles.length,
      residualOccurrences: residualFiles.reduce((sum, file) => sum + file.occurrences, 0),
      joinedToInventory: residualFiles.filter((file) => file.inventoryId !== null).length,
      unjoinedToInventory: residualFiles.filter((file) => file.inventoryId === null).length,
      inReplacementManifest: residualFiles.filter((file) => file.replacement.inManifest).length,
      notInReplacementManifest: residualFiles.filter((file) => !file.replacement.inManifest)
        .length,
      // Only meaningful when "/" was in the census: with no root measurement
      // "no hit on /" would be unobserved, not observed-absent.
      invisibleAtRootOnly: networkReport.independent.some((route) => route.route === "/")
        ? residualFiles.filter((file) => !file.routes.some((hit) => hit.route === "/")).length
        : null,
    },
    byHost,
    files: residualFiles,
  } satisfies ResidualAssetReport);
}
