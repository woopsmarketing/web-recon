import { z } from "zod";
import { HASH_RE } from "../../workers/recon-runtime/src/contract";
import { BoostChatError, createPublisherTransport } from "../portfolio-sync/client";
import { FAILED_MESSAGE_MAX, RunnerClaimResponseSchema, isUuid } from "./spec";

/**
 * The rebuild runner's two calls to BoostChat (boost-chat docs/work/site-design-platform/CONTRACTS.md §9.2):
 *
 *   POST {base}/api/publisher/site-rebuilds/<rebuildId>/claim     { runId, runAttempt }
 *        → { ok, job: { id, attempt }, eventToken, spec }
 *   POST {base}/api/publisher/site-rebuilds/<rebuildId>/events    { attempt, eventToken, type, data }
 *        → 200 { ok } | 200 { ok, duplicate: true } (the exact repeat of the last accepted event) | 409 (stale attempt, wrong token, out of order)
 *
 * Same credential and the same base-URL rule as the provisioning client (createPublisherTransport: https, or http for a
 * loopback host only; an origin, nothing else; redirects refused; the bearer token goes to that origin only), and the same
 * rule for the EVENT TOKEN: it lives in this closure and nowhere else. There is NO other route in this file — the rebuild
 * runner cannot call the shell-package announce endpoint through it.
 */

export const rebuildClaimPath = (rebuildId: string) => `/api/publisher/site-rebuilds/${rebuildId}/claim`;
export const rebuildEventsPath = (rebuildId: string) => `/api/publisher/site-rebuilds/${rebuildId}/events`;
/** the contract's bound for both request bodies */
export const REBUILD_BODY_MAX_BYTES = 4 * 1024;
/** a rebuild spec carries a brand block and the image references: larger than a provisioning spec */
const CLAIM_RESPONSE_MAX_BYTES = 256 * 1024;
const EVENT_ATTEMPTS = 3;
const EVENT_RETRY_MS = 2000;

const Hash = z.string().regex(HASH_RE);
export const FAILED_STEPS = ["scaffold", "assets", "build", "check", "upload", "unknown"] as const;
export type RebuildFailedStepName = (typeof FAILED_STEPS)[number];

/** `data` of every rebuild event, by type — exactly the fields of the contract (§9.2). */
export const RebuildEventDataSchemas = {
  built: z.object({ packageHash: Hash, buildInputId: Hash, fileCount: z.number().int().positive(), releaseId: z.string().min(1).max(160), releaseHash: Hash, siteSnapshotHash: Hash, starterHash: Hash }).strict(),
  sealed: z.object({ packageHash: Hash, fileCount: z.number().int().positive(), bytes: z.number().int().min(0) }).strict(),
  failed: z.object({ step: z.enum(FAILED_STEPS), code: z.string().regex(/^[a-z0-9_]{1,60}$/), message: z.string().max(FAILED_MESSAGE_MAX) }).strict(),
} as const;
export type RebuildEventType = keyof typeof RebuildEventDataSchemas;
export type RebuildEventData<T extends RebuildEventType> = z.infer<(typeof RebuildEventDataSchemas)[T]>;

export type RebuildApiErrorCode =
  /** base URL / token / rebuild id not usable — nothing was sent */
  | "config"
  /** 401 / 403 */
  | "unauthorized"
  /** 404 */
  | "job_not_found"
  /** 409 on a claim: the job is not waiting for a runner */
  | "job_not_claimable"
  /** 409 on an event: wrong attempt, wrong token, or out of order — this run is stale and must stop at once */
  | "event_refused"
  | "http"
  | "network"
  | "protocol";

export class RebuildApiError extends Error {
  constructor(
    public readonly code: RebuildApiErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "RebuildApiError";
  }
}

export interface RebuildClaim {
  job: { id: string; attempt: number };
  /** not validated here: validateRebuildSpec judges it, so a bad spec is reported as one */
  spec: unknown;
}

export interface RebuildClient {
  /** who is called, safe to print: "BoostChat https://boostchat.example" */
  readonly description: string;
  claim(run: { runId: string; runAttempt: number }): Promise<RebuildClaim>;
  /** Report one step. Resolves `{ duplicate }` on 200; rejects with RebuildApiError, `event_refused` meaning this run must stop. */
  event<T extends RebuildEventType>(type: T, data: RebuildEventData<T>): Promise<{ duplicate: boolean }>;
  /** the secret values this client holds, for the scrubber only */
  secrets(): string[];
}

export interface RebuildClientOptions {
  baseUrl: string;
  token: string;
  rebuildId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function createRebuildClient(opts: RebuildClientOptions): RebuildClient {
  if (!isUuid(opts.rebuildId)) throw new RebuildApiError("config", "the rebuild id is not a rebuild id (a lowercase UUID)");
  let transport: ReturnType<typeof createPublisherTransport>;
  try {
    transport = createPublisherTransport({ baseUrl: opts.baseUrl, token: opts.token, fetch: opts.fetch, timeoutMs: opts.timeoutMs });
  } catch (error) {
    throw new RebuildApiError("config", (error as Error).message);
  }
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const description = `BoostChat ${transport.origin}`;
  let claimed: { attempt: number; eventToken: string } | undefined;

  async function post(pathname: string, body: unknown, what: string): Promise<Response> {
    const text = JSON.stringify(body);
    if (Buffer.byteLength(text) > REBUILD_BODY_MAX_BYTES) throw new RebuildApiError("protocol", `${what}: the request body is larger than ${REBUILD_BODY_MAX_BYTES} B`);
    try {
      return await transport.request(pathname, { method: "POST", body: text, headers: { "content-type": "application/json" } });
    } catch (error) {
      const kind = error instanceof BoostChatError ? error.kind : "network";
      throw new RebuildApiError(kind === "protocol" ? "protocol" : "network", `${what} got no answer: ${(error as Error).message}`);
    }
  }
  /** the `error` code of a JSON error body, made safe to print */
  async function errorCode(res: Response): Promise<string> {
    const body = (await res.json().catch(() => undefined)) as { error?: unknown } | undefined;
    return typeof body?.error === "string" ? ` ${body.error.slice(0, 60).replace(/[^\w.-]/g, "?")}` : "";
  }

  return {
    description,
    secrets: () => [opts.token, ...(claimed ? [claimed.eventToken] : [])],

    async claim(run) {
      const what = `claim (POST ${rebuildClaimPath(opts.rebuildId)})`;
      if (!/^[0-9A-Za-z_-]{1,64}$/.test(run.runId) || !(Number.isInteger(run.runAttempt) && run.runAttempt >= 1)) throw new RebuildApiError("config", "the run id / run attempt of this run are not usable");
      const res = await post(rebuildClaimPath(opts.rebuildId), { runId: run.runId, runAttempt: run.runAttempt }, what);
      if (res.status !== 200) {
        const answered = `${what} answered HTTP ${res.status}${await errorCode(res)}`;
        if (res.status === 401 || res.status === 403) throw new RebuildApiError("unauthorized", `${answered} — check BOOSTCHAT_PUBLISHER_TOKEN`, res.status);
        if (res.status === 404) throw new RebuildApiError("job_not_found", answered, 404);
        if (res.status === 409) throw new RebuildApiError("job_not_claimable", answered, 409);
        throw new RebuildApiError("http", answered, res.status);
      }
      const raw = await res.text().catch(() => "");
      if (Buffer.byteLength(raw) > CLAIM_RESPONSE_MAX_BYTES) throw new RebuildApiError("protocol", `${what} answered with more than ${CLAIM_RESPONSE_MAX_BYTES} B`, 200);
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new RebuildApiError("protocol", `${what} answered 200 with a body that is not JSON`, 200);
      }
      const parsed = RunnerClaimResponseSchema.safeParse(json);
      // field names only: the body holds the event token
      if (!parsed.success) throw new RebuildApiError("protocol", `${what} answered 200 with a body that is not the contract's (${parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")})`, 200);
      if (parsed.data.job.id !== opts.rebuildId) throw new RebuildApiError("protocol", `${what} answered for another job`, 200);
      claimed = { attempt: parsed.data.job.attempt, eventToken: parsed.data.eventToken };
      return { job: parsed.data.job, spec: parsed.data.spec };
    },

    async event(type, data) {
      if (!claimed) throw new RebuildApiError("config", `event "${type}" before a claim`);
      const what = `event "${type}" (POST ${rebuildEventsPath(opts.rebuildId)})`;
      const schema = RebuildEventDataSchemas[type] as z.ZodType | undefined;
      if (!schema) throw new RebuildApiError("protocol", `${what}: not an event type of the contract`);
      const checked = schema.safeParse(type === "failed" ? { ...(data as RebuildEventData<"failed">), message: (data as RebuildEventData<"failed">).message.slice(0, FAILED_MESSAGE_MAX) } : data);
      if (!checked.success) throw new RebuildApiError("protocol", `${what}: the event data is not the contract's (${checked.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")})`);
      const body = { attempt: claimed.attempt, eventToken: claimed.eventToken, type, data: checked.data };
      // an event is idempotent on the BoostChat side (the exact repeat of the last accepted one is answered 200 duplicate:true),
      // so "no answer" and 5xx are tried again; a 4xx is an answer and is final
      let last: RebuildApiError | undefined;
      for (let attempt = 1; attempt <= EVENT_ATTEMPTS; attempt++) {
        if (attempt > 1) await sleep(EVENT_RETRY_MS * (attempt - 1));
        let res: Response;
        try {
          res = await post(rebuildEventsPath(opts.rebuildId), body, what);
        } catch (error) {
          if (!(error instanceof RebuildApiError) || error.code !== "network") throw error;
          last = error;
          continue;
        }
        if (res.status === 200) {
          const answer = (await res.json().catch(() => undefined)) as { duplicate?: unknown } | undefined;
          return { duplicate: answer?.duplicate === true };
        }
        const answered = `${what} answered HTTP ${res.status}${await errorCode(res)}`;
        if (res.status === 409) throw new RebuildApiError("event_refused", `${answered} — BoostChat does not accept this event from this run (another attempt owns the job, or the job is not at this step)`, 409);
        if (res.status === 401 || res.status === 403) throw new RebuildApiError("unauthorized", `${answered} — check BOOSTCHAT_PUBLISHER_TOKEN`, res.status);
        if (res.status < 500) throw new RebuildApiError("http", answered, res.status);
        last = new RebuildApiError("http", answered, res.status);
      }
      throw last ?? new RebuildApiError("network", `${what} got no answer`);
    },
  };
}
