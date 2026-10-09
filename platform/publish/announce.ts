/**
 * The shell-package ANNOUNCE of site:publish (Portfolio Publishing V2).
 *
 * A shell package carries no portfolio: BoostChat composes and publishes it as an overlay of that
 * exact package (portfolio-public/<siteId>/current/<packageHash>.json). BoostChat cannot know a new
 * package exists until it is told, so after the package is uploaded and sealed the publisher says so:
 *
 *   POST {BOOSTCHAT_BASE_URL}/api/publisher/sites/{siteId}/shell-package
 *   Authorization: Bearer <BOOSTCHAT_PUBLISHER_TOKEN>      (the V1 publisher client's header and rules)
 *   Content-Type: application/json
 *   { "packageHash": "<64 lowercase hex>" }
 *
 *   200 { "ok": true, "siteId", "packageHash", "publishMode", "searchSource",
 *         "desiredRevision": n, "liveRevision": n, "state": "queued" | "already_published" | "mode_v1" }
 *   400 { "error": "invalid_request" }   404 { "error": "site_not_found" }   409 { "error": "package_not_v2" }
 *   503 { "error": "store_unavailable" }   401 / 403 as the other publisher routes
 *
 * The announce is idempotent on the BoostChat side, so it is sent once per run and never retried
 * here: a run that could not announce stops, and running the same command again is the retry.
 *
 * What the answer is NOT: permission to switch a hostname. Whether a hostname may point at a shell
 * package is decided by the store alone (publish.ts, shell-package guard); `state` only tells the
 * flow whether waiting for the overlay makes sense (managed-flow.ts).
 *
 * The token is never part of an error or a log line (the transport guarantees it; nothing here
 * formats it). The client sits behind ShellPackageAnnouncer so the flow is tested with a fake.
 */
import { z } from "zod";
import { BoostChatError, createPublisherTransport, type PublisherTransportOptions } from "../portfolio-sync/client";
import { HASH_RE, SITE_ID_RE } from "../../workers/recon-runtime/src/contract";

export const shellPackagePath = (siteId: string) => `/api/publisher/sites/${siteId}/shell-package`;

export const ANNOUNCE_STATES = ["queued", "already_published", "mode_v1"] as const;
export type AnnounceState = (typeof ANNOUNCE_STATES)[number];

/**
 * The 200 body. `ok`, `siteId`, `packageHash` and `state` are what the flow acts on and are strict;
 * the rest is shown to the operator and is read leniently (a missing or null value is not a reason
 * to stop a publish the store will judge anyway).
 */
export const ShellAnnouncementSchema = z.object({
  ok: z.literal(true),
  siteId: z.string().regex(SITE_ID_RE),
  packageHash: z.string().regex(HASH_RE),
  state: z.enum(ANNOUNCE_STATES),
  publishMode: z.string().nullish(),
  searchSource: z.string().nullish(),
  desiredRevision: z.number().nullish(),
  liveRevision: z.number().nullish(),
});
export type ShellAnnouncement = z.infer<typeof ShellAnnouncementSchema>;

export type AnnounceErrorCode =
  /** BOOSTCHAT_BASE_URL / BOOSTCHAT_PUBLISHER_TOKEN are not usable (nothing was sent) */
  | "config"
  /** 404 site_not_found — the site is not linked to a BoostChat tenant */
  | "site_not_found"
  /** 409 package_not_v2 — BoostChat does not accept this package as a V2 shell package */
  | "package_not_v2"
  /** 400 invalid_request */
  | "invalid_request"
  /** 401 / 403 */
  | "unauthorized"
  /** 503 store_unavailable / publisher_not_configured, any other 5xx */
  | "unavailable"
  /** any other HTTP status */
  | "http"
  /** no HTTP answer (DNS, connection, timeout, a refused redirect) */
  | "network"
  /** an answer that is not the contract's (not JSON, another site / package echoed, unknown state) */
  | "protocol";

export class AnnounceError extends Error {
  constructor(
    message: string,
    public readonly code: AnnounceErrorCode,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AnnounceError";
  }
}

export interface ShellPackageAnnouncer {
  /** who is told, safe to print: "BoostChat https://boostchat.example" */
  readonly description: string;
  /** Tell BoostChat that this shell package of the site is uploaded and sealed. Rejects with AnnounceError only. */
  announce(input: { siteId: string; packageHash: string }): Promise<ShellAnnouncement>;
}

/** The real announcer. Throws AnnounceError("config") when the base URL / token are not usable — before anything is sent. */
export function createBoostChatAnnouncer(opts: PublisherTransportOptions): ShellPackageAnnouncer {
  let transport: ReturnType<typeof createPublisherTransport>;
  try {
    transport = createPublisherTransport(opts);
  } catch (error) {
    throw new AnnounceError((error as Error).message, "config");
  }
  const description = `BoostChat ${transport.origin}`;

  return {
    description,
    async announce({ siteId, packageHash }) {
      if (!SITE_ID_RE.test(siteId) || !HASH_RE.test(packageHash)) throw new AnnounceError(`announce: invalid siteId / packageHash`, "protocol");
      const what = `announce to ${description} (POST ${shellPackagePath(siteId)})`;
      let res: Response;
      try {
        res = await transport.request(shellPackagePath(siteId), { method: "POST", body: JSON.stringify({ packageHash }), headers: { "content-type": "application/json" } });
      } catch (error) {
        const kind = error instanceof BoostChatError ? error.kind : "network";
        throw new AnnounceError(`${what} got no answer: ${(error as Error).message}`, kind === "protocol" ? "protocol" : "network");
      }
      const body = (await res.json().catch(() => undefined)) as unknown;
      if (res.status !== 200) {
        const raw = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
        const code = typeof raw === "string" ? raw.slice(0, 80).replace(/[^\w.-]/g, "?") : undefined;
        const answered = `${what} answered HTTP ${res.status}${code ? ` ${code}` : ""}`;
        if (res.status === 404 && code === "site_not_found") throw new AnnounceError(answered, "site_not_found", 404);
        if (res.status === 409 && code === "package_not_v2") throw new AnnounceError(answered, "package_not_v2", 409);
        if (res.status === 400) throw new AnnounceError(answered, "invalid_request", 400);
        if (res.status === 401 || res.status === 403) throw new AnnounceError(`${answered} — check BOOSTCHAT_PUBLISHER_TOKEN`, "unauthorized", res.status);
        if (res.status >= 500) throw new AnnounceError(answered, "unavailable", res.status);
        throw new AnnounceError(answered, "http", res.status);
      }
      const parsed = ShellAnnouncementSchema.safeParse(body);
      if (!parsed.success) throw new AnnounceError(`${what} answered 200 with a body that is not the contract's (${parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")})`, "protocol", 200);
      if (parsed.data.siteId !== siteId || parsed.data.packageHash !== packageHash) {
        throw new AnnounceError(`${what} answered for another site / package (${parsed.data.siteId}, ${parsed.data.packageHash.slice(0, 16)}…)`, "protocol", 200);
      }
      return parsed.data;
    },
  };
}
