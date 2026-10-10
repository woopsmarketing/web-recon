import { HOSTNAME_RE } from "../../workers/recon-runtime/src/contract";

/**
 * Worker routes of the zone, through the Cloudflare API — the one thing a new hostname needs that
 * is not in the bucket (boost-chat docs/reports/auto-onboarding-v1.md §7).
 *
 * The zone's wildcard route belongs to another Worker; a provisioned site gets ONE exact route
 * `<hostname>/*` → recon-runtime. An exact route wins over the wildcard, and DNS / TLS are already
 * covered by the zone's wildcard record and certificate, so this is the whole "domain" step.
 *
 *   ensureHostRoute  the pattern exists for our script → nothing to do
 *                    a route on that hostname belongs to ANOTHER script → route_conflict, nothing is changed
 *                    otherwise → created
 *
 * Never: an update or a delete of an existing route, a wildcard, a pattern built from anything but
 * the validated hostname. The script name is a constant (RECON_RUNTIME_SCRIPT may override it in the
 * runner's environment); it is never taken from a provisioning spec.
 *
 * `wrangler deploy` replaces a Worker's whole route list with the list in its config, so routes
 * created here are kept only by the merging deploy command (platform/cli/runtime-deploy.ts).
 */

export const DEFAULT_RUNTIME_SCRIPT = "recon-runtime-pilot";
export const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
export const ROUTE_API_TIMEOUT_MS = 15_000;
const SCRIPT_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const ZONE_ID_RE = /^[0-9a-f]{32}$/;

export type RouteErrorCode = "route_conflict" | "route_api" | "route_config" | "route_invalid";

export class RouteError extends Error {
  constructor(
    public readonly code: RouteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

export interface WorkerRoute {
  id: string;
  pattern: string;
  /** null = a route that turns Workers OFF for its pattern */
  script: string | null;
}

export interface WorkerRouteClient {
  list(): Promise<WorkerRoute[]>;
  create(pattern: string, script: string): Promise<WorkerRoute>;
}

/** The Worker a provisioned hostname is routed to: the constant, or RECON_RUNTIME_SCRIPT of the runner's own environment. */
export function runtimeScriptName(env: Record<string, string | undefined> = process.env): string {
  const name = env.RECON_RUNTIME_SCRIPT || DEFAULT_RUNTIME_SCRIPT;
  if (!SCRIPT_NAME_RE.test(name)) throw new RouteError("route_config", "RECON_RUNTIME_SCRIPT is not a Worker script name");
  return name;
}

export interface CloudflareRouteClientOptions {
  /** CLOUDFLARE_API_TOKEN — sent as a bearer token to api.cloudflare.com only; never part of a message */
  apiToken: string;
  /** CLOUDFLARE_ZONE_ID */
  zoneId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface CloudflareEnvelope {
  success?: unknown;
  errors?: unknown;
  result?: unknown;
}

/** code + first words of each Cloudflare error — their text, cut short, never ours to interpolate secrets into */
function cloudflareErrors(body: CloudflareEnvelope | undefined): string {
  const errors = Array.isArray(body?.errors) ? (body!.errors as { code?: unknown; message?: unknown }[]) : [];
  return errors
    .slice(0, 3)
    .map((e) => `${typeof e?.code === "number" ? e.code : "?"} ${typeof e?.message === "string" ? e.message.slice(0, 120) : ""}`.trim())
    .join("; ");
}

function routeOf(value: unknown): WorkerRoute | undefined {
  const r = value as { id?: unknown; pattern?: unknown; script?: unknown } | null;
  if (!r || typeof r.id !== "string" || typeof r.pattern !== "string") return undefined;
  return { id: r.id, pattern: r.pattern, script: typeof r.script === "string" && r.script !== "" ? r.script : null };
}

export function createCloudflareRouteClient(opts: CloudflareRouteClientOptions): WorkerRouteClient {
  if (!opts.apiToken || opts.apiToken.trim() !== opts.apiToken || /\s/.test(opts.apiToken)) throw new RouteError("route_config", "CLOUDFLARE_API_TOKEN is missing or contains whitespace");
  if (!ZONE_ID_RE.test(opts.zoneId)) throw new RouteError("route_config", "CLOUDFLARE_ZONE_ID is not a zone id (32 hex characters)");
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? ROUTE_API_TIMEOUT_MS;
  const url = `${CLOUDFLARE_API}/zones/${opts.zoneId}/workers/routes`;

  async function call(method: "GET" | "POST", body?: unknown): Promise<{ status: number; body: CloudflareEnvelope | undefined }> {
    let res: Response;
    try {
      res = await doFetch(url, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { authorization: `Bearer ${opts.apiToken}`, accept: "application/json", ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      // the cause's name only: a fetch error text can quote the request
      throw new RouteError("route_api", `Cloudflare routes API: ${method} got no answer (${(error as Error).name})`);
    }
    return { status: res.status, body: (await res.json().catch(() => undefined)) as CloudflareEnvelope | undefined };
  }

  return {
    async list() {
      const { status, body } = await call("GET");
      if (status !== 200 || body?.success !== true || !Array.isArray(body.result)) {
        throw new RouteError("route_api", `Cloudflare routes API: list answered HTTP ${status}${cloudflareErrors(body) ? ` (${cloudflareErrors(body)})` : ""}`);
      }
      // the endpoint answers the whole list today; a paged answer would make "no route for this host" a guess
      const pages = (body as { result_info?: { total_pages?: unknown } }).result_info?.total_pages;
      if (typeof pages === "number" && pages > 1) throw new RouteError("route_api", `Cloudflare routes API: list answered page 1 of ${pages}; this client reads one page and refuses to judge a partial list`);
      const routes: WorkerRoute[] = [];
      for (const raw of body.result) {
        const route = routeOf(raw);
        if (!route) throw new RouteError("route_api", "Cloudflare routes API: list answered with an entry that is not a route");
        routes.push(route);
      }
      return routes;
    },
    async create(pattern, script) {
      const { status, body } = await call("POST", { pattern, script });
      const id = (body?.result as { id?: unknown } | undefined)?.id;
      if (status !== 200 || body?.success !== true || typeof id !== "string") {
        throw new RouteError("route_api", `Cloudflare routes API: create answered HTTP ${status}${cloudflareErrors(body) ? ` (${cloudflareErrors(body)})` : ""}`);
      }
      return { id, pattern, script };
    },
  };
}

/** The hostname a route pattern is about ("https://a.example/x*" → "a.example"); wildcards stay as written. */
export function patternHost(pattern: string): string {
  return pattern.replace(/^[a-z*]+:\/\//i, "").split("/")[0]!.toLowerCase();
}

export interface EnsureRouteResult {
  pattern: string;
  created: boolean;
  routeId: string;
}

export async function ensureHostRoute(opts: { client: WorkerRouteClient; hostname: string; script: string }): Promise<EnsureRouteResult> {
  const { client, hostname, script } = opts;
  if (hostname !== hostname.toLowerCase() || !HOSTNAME_RE.test(hostname)) throw new RouteError("route_invalid", "ensureHostRoute: not a hostname");
  if (!SCRIPT_NAME_RE.test(script)) throw new RouteError("route_invalid", "ensureHostRoute: not a Worker script name");
  const pattern = `${hostname}/*`;

  const judge = (routes: readonly WorkerRoute[]): EnsureRouteResult | undefined => {
    // every route written for exactly this hostname (never the zone's wildcards: an exact route wins over them)
    const here = routes.filter((r) => patternHost(r.pattern) === hostname);
    const foreign = here.find((r) => r.script !== script);
    if (foreign) {
      throw new RouteError("route_conflict", `a route for ${hostname} already belongs to ${foreign.script ? `Worker "${foreign.script}"` : "no Worker (a route that disables Workers)"} (pattern ${foreign.pattern}); it is not ours to change`);
    }
    const mine = here.find((r) => r.pattern === pattern);
    return mine ? { pattern, created: false, routeId: mine.id } : undefined;
  };

  const before = judge(await client.list());
  if (before) return before;
  let created: WorkerRoute;
  try {
    created = await client.create(pattern, script);
  } catch (error) {
    // a concurrent run may have created it between the list and the create: look once more, and
    // accept only what the first look would have accepted
    const after = judge(await client.list().catch(() => []));
    if (after) return after;
    throw error;
  }
  return { pattern, created: true, routeId: created.id };
}
