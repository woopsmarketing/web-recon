import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ResponsiveQaInputError } from "./types.js";

/**
 * Where the routes and the source URLs come from (Task 28.6, lane W3).
 *
 * The harness must be able to answer "what is the SOURCE of this clone page"
 * without the operator retyping it, and it must work on an app directory alone,
 * because that is what a build hands you. Three sources, in this order:
 *
 *   1. `--routes /,/pricing`      explicit; the operator is always right.
 *   2. `--site-spec <file>`       the SiteSpec's own `routes[]`.
 *   3. `app/reconstruction-data/route-map.json`   the generated app's own route
 *      table, which carries BOTH the clone path and the source URL it was built
 *      from. This is the default and needs nothing but the app directory.
 *
 * `--source-origin` overrides the origin in every resolved source URL, so a
 * clone can be compared against a staging copy of its source.
 */

export interface ResolvedRoute {
  /** Path on the clone, always starting with `/`. */
  path: string;
  /** Absolute URL of the source page this route was reconstructed from. */
  sourceUrl: string;
}

export interface RouteResolution {
  appDir: string;
  manifestFile: string | null;
  rootUrl: string;
  routeSource: "explicit" | "site-spec" | "route-map";
  routes: ResolvedRoute[];
}

export interface ResolveRoutesOptions {
  /** A reconstruction manifest file, or a directory (app dir or its parent). */
  target: string;
  siteSpecFile?: string;
  explicitRoutes?: string[];
  sourceOrigin?: string;
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
}

async function readJson(file: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    throw new ResponsiveQaInputError(
      `cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ResponsiveQaInputError(
      `${file} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function normalizePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function joinOrigin(origin: string, routePath: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}${routePath === "/" ? "/" : routePath}`;
}

/** Locate the app directory and the manifest, from whatever the operator gave. */
async function locateApp(
  target: string,
): Promise<{ appDir: string; manifestFile: string | null }> {
  const resolved = path.resolve(target);
  if (await isFile(resolved)) {
    const appDir = path.join(path.dirname(resolved), "app");
    if (!(await isDirectory(appDir))) {
      throw new ResponsiveQaInputError(
        `${resolved} looks like a reconstruction manifest but there is no sibling app/ directory at ${appDir}`,
      );
    }
    return { appDir, manifestFile: resolved };
  }
  if (!(await isDirectory(resolved))) {
    throw new ResponsiveQaInputError(`no such file or directory: ${resolved}`);
  }
  // A reconstruction run directory: <run>/reconstruction-manifest.json + <run>/app
  const siblingManifest = path.join(resolved, "reconstruction-manifest.json");
  if (await isFile(siblingManifest)) {
    const appDir = path.join(resolved, "app");
    if (!(await isDirectory(appDir))) {
      throw new ResponsiveQaInputError(
        `${resolved} holds a reconstruction manifest but no app/ directory`,
      );
    }
    return { appDir, manifestFile: siblingManifest };
  }
  // An app directory itself.
  if (await isFile(path.join(resolved, "package.json"))) {
    const parentManifest = path.join(
      path.dirname(resolved),
      "reconstruction-manifest.json",
    );
    return {
      appDir: resolved,
      manifestFile: (await isFile(parentManifest)) ? parentManifest : null,
    };
  }
  throw new ResponsiveQaInputError(
    `${resolved} is neither a reconstruction manifest, a reconstruction run directory, nor a generated app directory`,
  );
}

export async function resolveRoutes(
  options: ResolveRoutesOptions,
): Promise<RouteResolution> {
  const { appDir, manifestFile } = await locateApp(options.target);

  const routeMapFile = path.join(appDir, "reconstruction-data", "route-map.json");
  let rootUrl = "";
  let routeMapRoutes: ResolvedRoute[] = [];
  if (await isFile(routeMapFile)) {
    const parsed = (await readJson(routeMapFile)) as {
      rootUrl?: unknown;
      routes?: unknown;
    };
    if (typeof parsed.rootUrl === "string") rootUrl = parsed.rootUrl;
    if (Array.isArray(parsed.routes)) {
      routeMapRoutes = parsed.routes
        .map((entry) => entry as { path?: unknown; key?: unknown; url?: unknown })
        .filter(
          (entry) =>
            typeof entry.url === "string" &&
            (typeof entry.path === "string" || typeof entry.key === "string"),
        )
        .map((entry) => ({
          path: normalizePath(String(entry.path ?? entry.key)),
          sourceUrl: String(entry.url),
        }));
    }
  }

  let siteSpecRoutes: ResolvedRoute[] = [];
  if (options.siteSpecFile) {
    const parsed = (await readJson(path.resolve(options.siteSpecFile))) as {
      rootUrl?: unknown;
      routes?: unknown;
    };
    if (rootUrl === "" && typeof parsed.rootUrl === "string") rootUrl = parsed.rootUrl;
    if (!Array.isArray(parsed.routes)) {
      throw new ResponsiveQaInputError(
        `${options.siteSpecFile} has no routes[] array; it does not look like a SiteSpec`,
      );
    }
    siteSpecRoutes = parsed.routes
      .map((entry) => entry as { pathname?: unknown; url?: unknown })
      .filter((entry) => typeof entry.url === "string")
      .map((entry) => ({
        path: normalizePath(
          typeof entry.pathname === "string"
            ? entry.pathname
            : new URL(String(entry.url)).pathname,
        ),
        sourceUrl: String(entry.url),
      }));
  }

  if (rootUrl === "" && manifestFile !== null) {
    const parsed = (await readJson(manifestFile)) as { rootUrl?: unknown };
    if (typeof parsed.rootUrl === "string") rootUrl = parsed.rootUrl;
  }
  if (rootUrl === "") {
    throw new ResponsiveQaInputError(
      `could not determine the source root URL: no route-map.json, no --site-spec and no manifest rootUrl under ${appDir}`,
    );
  }

  const origin = options.sourceOrigin
    ? options.sourceOrigin
    : new URL(rootUrl).origin;

  let routes: ResolvedRoute[];
  let routeSource: RouteResolution["routeSource"];
  if (options.explicitRoutes && options.explicitRoutes.length > 0) {
    routeSource = "explicit";
    const byPath = new Map<string, ResolvedRoute>();
    for (const known of [...routeMapRoutes, ...siteSpecRoutes]) {
      if (!byPath.has(known.path)) byPath.set(known.path, known);
    }
    routes = options.explicitRoutes.map((raw) => {
      const routePath = normalizePath(raw);
      const known = byPath.get(routePath);
      return {
        path: routePath,
        sourceUrl: options.sourceOrigin
          ? joinOrigin(origin, routePath)
          : (known?.sourceUrl ?? joinOrigin(origin, routePath)),
      };
    });
  } else if (siteSpecRoutes.length > 0) {
    routeSource = "site-spec";
    routes = siteSpecRoutes;
  } else if (routeMapRoutes.length > 0) {
    routeSource = "route-map";
    routes = routeMapRoutes;
  } else {
    throw new ResponsiveQaInputError(
      `no routes to measure: ${routeMapFile} is missing or empty and no --routes / --site-spec was given`,
    );
  }

  if (options.sourceOrigin && routeSource !== "explicit") {
    routes = routes.map((route) => ({
      path: route.path,
      sourceUrl: joinOrigin(origin, route.path),
    }));
  }

  if (routes.length === 0) {
    throw new ResponsiveQaInputError("route resolution produced an empty list");
  }

  return { appDir, manifestFile, rootUrl, routeSource, routes };
}
