import { BoostChatError, createPublisherTransport } from "../portfolio-sync/client";
import { FAILED_MESSAGE_MAX, RunnerClaimResponseSchema, RunnerEventDataSchemas, isUuid, type RunnerEventData, type RunnerEventType } from "./spec";

/**
 * The runner's two calls to BoostChat (boost-chat docs/reports/auto-onboarding-v1.md §3.2):
 *
 *   POST {base}/api/publisher/provisioning/<jobId>/claim     { runId, runAttempt }
 *        → { ok, job: { id, attempt }, eventToken, spec }
 *   POST {base}/api/publisher/provisioning/<jobId>/events    { attempt, eventToken, type, data }
 *
 * Same credential and the same base-URL rule as the shell-package announce (createPublisherTransport:
 * https, or http for a loopback host only; an origin, nothing else; redirects refused; the bearer
 * token is sent to that origin only).
 *
 * The EVENT TOKEN of a claim lives in this closure and nowhere else: `claim()` returns the job and
 * the spec without it, `event()` adds it to the body itself. No caller can print it because no
 * caller ever holds it; `secrets()` hands the values to the scrubber (scrub.ts) — and to nothing else.
 */

export const claimPath = (jobId: string) => `/api/publisher/provisioning/${jobId}/claim`;
export const eventsPath = (jobId: string) => `/api/publisher/provisioning/${jobId}/events`;
/** the contract's bound for both request bodies */
export const BODY_MAX_BYTES = 4 * 1024;
const CLAIM_RESPONSE_MAX_BYTES = 64 * 1024;
const EVENT_ATTEMPTS = 3;
const EVENT_RETRY_MS = 2000;

export type ProvisioningApiErrorCode =
  /** base URL / token / job id not usable — nothing was sent */
  | "config"
  /** 401 / 403 */
  | "unauthorized"
  /** 404 job_not_found */
  | "job_not_found"
  /** 409 on a claim: the job is not waiting for a runner */
  | "job_not_claimable"
  /** 409 on an event: wrong attempt, wrong token, or a type that does not follow the job's step — this run is stale */
  | "event_refused"
  | "http"
  | "network"
  | "protocol";

export class ProvisioningApiError extends Error {
  constructor(
    public readonly code: ProvisioningApiErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProvisioningApiError";
  }
}

export interface ProvisioningClaim {
  job: { id: string; attempt: number };
  /** not validated here: parseProvisionSpec judges it, so a bad spec is reported as one */
  spec: unknown;
}

export interface ProvisioningClient {
  /** who is called, safe to print: "BoostChat https://boostchat.example" */
  readonly description: string;
  claim(run: { runId: string; runAttempt: number }): Promise<ProvisioningClaim>;
  /** Report one step. Rejects with ProvisioningApiError; `event_refused` means this run must stop. */
  event<T extends RunnerEventType>(type: T, data: RunnerEventData<T>): Promise<void>;
  /** the secret values this client holds, for the scrubber only */
  secrets(): string[];
}

export interface ProvisioningClientOptions {
  baseUrl: string;
  token: string;
  jobId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function createProvisioningClient(opts: ProvisioningClientOptions): ProvisioningClient {
  if (!isUuid(opts.jobId)) throw new ProvisioningApiError("config", "PROVISION_JOB_ID is not a job id (a lowercase UUID)");
  let transport: ReturnType<typeof createPublisherTransport>;
  try {
    transport = createPublisherTransport({ baseUrl: opts.baseUrl, token: opts.token, fetch: opts.fetch, timeoutMs: opts.timeoutMs });
  } catch (error) {
    throw new ProvisioningApiError("config", (error as Error).message);
  }
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const description = `BoostChat ${transport.origin}`;
  let claimed: { attempt: number; eventToken: string } | undefined;

  async function post(pathname: string, body: unknown, what: string): Promise<Response> {
    const text = JSON.stringify(body);
    if (Buffer.byteLength(text) > BODY_MAX_BYTES) throw new ProvisioningApiError("protocol", `${what}: the request body is larger than ${BODY_MAX_BYTES} B`);
    try {
      return await transport.request(pathname, { method: "POST", body: text, headers: { "content-type": "application/json" } });
    } catch (error) {
      const kind = error instanceof BoostChatError ? error.kind : "network";
      throw new ProvisioningApiError(kind === "protocol" ? "protocol" : "network", `${what} got no answer: ${(error as Error).message}`);
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
      const what = `claim (POST ${claimPath(opts.jobId)})`;
      if (!/^[0-9A-Za-z_-]{1,64}$/.test(run.runId) || !(Number.isInteger(run.runAttempt) && run.runAttempt >= 1)) throw new ProvisioningApiError("config", "the run id / run attempt of this run are not usable");
      const res = await post(claimPath(opts.jobId), { runId: run.runId, runAttempt: run.runAttempt }, what);
      if (res.status !== 200) {
        const answered = `${what} answered HTTP ${res.status}${await errorCode(res)}`;
        if (res.status === 401 || res.status === 403) throw new ProvisioningApiError("unauthorized", `${answered} — check BOOSTCHAT_PUBLISHER_TOKEN`, res.status);
        if (res.status === 404) throw new ProvisioningApiError("job_not_found", answered, 404);
        if (res.status === 409) throw new ProvisioningApiError("job_not_claimable", answered, 409);
        throw new ProvisioningApiError("http", answered, res.status);
      }
      const raw = await res.text().catch(() => "");
      if (Buffer.byteLength(raw) > CLAIM_RESPONSE_MAX_BYTES) throw new ProvisioningApiError("protocol", `${what} answered with more than ${CLAIM_RESPONSE_MAX_BYTES} B`, 200);
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new ProvisioningApiError("protocol", `${what} answered 200 with a body that is not JSON`, 200);
      }
      const parsed = RunnerClaimResponseSchema.safeParse(json);
      // field names only: the body holds the event token
      if (!parsed.success) throw new ProvisioningApiError("protocol", `${what} answered 200 with a body that is not the contract's (${parsed.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")})`, 200);
      if (parsed.data.job.id !== opts.jobId) throw new ProvisioningApiError("protocol", `${what} answered for another job`, 200);
      claimed = { attempt: parsed.data.job.attempt, eventToken: parsed.data.eventToken };
      return { job: parsed.data.job, spec: parsed.data.spec };
    },

    async event(type, data) {
      if (!claimed) throw new ProvisioningApiError("config", `event "${type}" before a claim`);
      const what = `event "${type}" (POST ${eventsPath(opts.jobId)})`;
      const checked = RunnerEventDataSchemas[type].safeParse(type === "failed" ? { ...(data as RunnerEventData<"failed">), message: (data as RunnerEventData<"failed">).message.slice(0, FAILED_MESSAGE_MAX) } : data);
      if (!checked.success) throw new ProvisioningApiError("protocol", `${what}: the event data is not the contract's (${checked.error.issues.map((i) => i.path.join(".") || "(root)").join(", ")})`);
      const body = { attempt: claimed.attempt, eventToken: claimed.eventToken, type, data: checked.data };
      // an event is idempotent on the BoostChat side (repeating the last accepted one is answered 200),
      // so "no answer" and 5xx are tried again; a 4xx is an answer and is final
      let last: ProvisioningApiError | undefined;
      for (let attempt = 1; attempt <= EVENT_ATTEMPTS; attempt++) {
        if (attempt > 1) await sleep(EVENT_RETRY_MS * (attempt - 1));
        let res: Response;
        try {
          res = await post(eventsPath(opts.jobId), body, what);
        } catch (error) {
          if (!(error instanceof ProvisioningApiError) || error.code !== "network") throw error;
          last = error;
          continue;
        }
        if (res.status === 200) return;
        const answered = `${what} answered HTTP ${res.status}${await errorCode(res)}`;
        if (res.status === 409) throw new ProvisioningApiError("event_refused", `${answered} — BoostChat does not accept this event from this run (another attempt owns the job, or the job is not at this step)`, 409);
        if (res.status === 401 || res.status === 403) throw new ProvisioningApiError("unauthorized", `${answered} — check BOOSTCHAT_PUBLISHER_TOKEN`, res.status);
        if (res.status < 500) throw new ProvisioningApiError("http", answered, res.status);
        last = new ProvisioningApiError("http", answered, res.status);
      }
      throw last ?? new ProvisioningApiError("network", `${what} got no answer`);
    },
  };
}
