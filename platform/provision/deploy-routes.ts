import type { WorkerRoute } from "./routes";

/**
 * The route list a deploy of the runtime Worker must carry.
 *
 * `wrangler deploy` REPLACES the Worker's whole route list with the one in its config file. Since
 * the provisioning runner (provision.ts) creates a route per new hostname through the Cloudflare
 * API, the config file no longer names every live hostname — a deploy from it alone would silently
 * take every provisioned site off the air. So a deploy is always made from the UNION:
 *
 *   config routes (workers/recon-runtime/wrangler.jsonc, env.pilot.routes)
 *   + every route of the zone that points at this Worker script right now.
 *
 * Pure: no network, no file. platform/cli/runtime-deploy.ts feeds it and runs the deploy.
 */

export interface ConfigRoute {
  pattern: string;
  zone_name: string;
}

export interface MergedRoutes {
  /** what goes into the deploy config, sorted by pattern */
  routes: ConfigRoute[];
  /** live routes of this script the config file does not name — the provisioned sites */
  liveOnly: string[];
  /** config routes that are not live — the deploy will create them */
  configOnly: string[];
}

export class DeployRoutesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployRoutesError";
  }
}

/** The env.pilot.routes of a parsed wrangler config, as exact `{ pattern, zone_name }` entries — anything else is refused. */
export function configRoutes(raw: unknown): ConfigRoute[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new DeployRoutesError("the config has no routes for this environment");
  return raw.map((r, i) => {
    const pattern = (r as { pattern?: unknown } | null)?.pattern;
    const zone = (r as { zone_name?: unknown } | null)?.zone_name;
    const keys = r && typeof r === "object" ? Object.keys(r) : [];
    if (typeof pattern !== "string" || typeof zone !== "string" || keys.length !== 2) throw new DeployRoutesError(`config route ${i + 1} is not { pattern, zone_name }`);
    return { pattern, zone_name: zone };
  });
}

export function mergeDeployRoutes(opts: { config: ConfigRoute[]; live: WorkerRoute[]; script: string }): MergedRoutes {
  const zones = [...new Set(opts.config.map((r) => r.zone_name))];
  if (zones.length !== 1) throw new DeployRoutesError(`the config routes name ${zones.length} zones; this command merges the routes of exactly one`);
  const zone = zones[0]!;
  const inZone = (pattern: string) => {
    const host = pattern.split("/")[0]!.toLowerCase();
    return host === zone || host.endsWith(`.${zone}`);
  };
  const byPattern = new Map<string, ConfigRoute>();
  for (const r of opts.config) {
    if (byPattern.has(r.pattern)) throw new DeployRoutesError(`the config names the route ${r.pattern} twice`);
    if (!inZone(r.pattern)) throw new DeployRoutesError(`config route ${r.pattern} is not in zone ${zone}`);
    byPattern.set(r.pattern, r);
  }
  const livePatterns = new Map(opts.live.map((r) => [r.pattern, r] as const));
  // a config route that is live under ANOTHER script: the deploy would take it over (or fail half-way)
  for (const r of opts.config) {
    const live = livePatterns.get(r.pattern);
    if (live && live.script !== opts.script) throw new DeployRoutesError(`config route ${r.pattern} is live under ${live.script ?? "no script"}, not ${opts.script}`);
  }
  const liveOnly: string[] = [];
  for (const r of opts.live) {
    if (r.script !== opts.script || byPattern.has(r.pattern)) continue;
    if (!inZone(r.pattern)) throw new DeployRoutesError(`live route ${r.pattern} of ${opts.script} is not in zone ${zone}`);
    byPattern.set(r.pattern, { pattern: r.pattern, zone_name: zone });
    liveOnly.push(r.pattern);
  }
  const configOnly = opts.config.filter((r) => !livePatterns.has(r.pattern)).map((r) => r.pattern);
  const routes = [...byPattern.values()].sort((a, b) => (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0));
  return { routes, liveOnly: liveOnly.sort(), configOnly: configOnly.sort() };
}
