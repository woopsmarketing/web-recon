import path from "node:path";
import { buildSite, type SiteBuildOptions, type SiteBuildResult } from "../build/site-build";
import { declareManagedPortfolio } from "../portfolio-sync/declare";
import { AnnounceError } from "../publish/announce";
import { publishManaged, type AnnounceSetup, type ManagedPublishResult, type ManagedStop } from "../publish/managed-flow";
import { RoutingPointerSchema } from "../publish/publish";
import type { ObjectStore } from "../publish/store";
import { routingKey } from "../../workers/recon-runtime/src/contract";
import { ProvisioningApiError, type ProvisioningClient } from "./boostchat";
import { verifyBuiltPackage, type PackageFacts } from "./package-check";
import { RouteError, ensureHostRoute, type WorkerRouteClient } from "./routes";
import { scaffoldSite } from "./scaffold";
import { createScrubber, type Scrubber } from "./scrub";
import { FAILED_MESSAGE_MAX, ProvisionError, validateProvisionSpec, type FailedStep, type ProvisionSpec, type RunnerEventData, type RunnerEventType } from "./spec";

/**
 * provisionSite — one provisioning job, from a job id to a public hostname, with no human step
 * (boost-chat docs/reports/auto-onboarding-v1.md §3.2). Typed functions only: nothing here builds a
 * command line, and nothing the spec says is ever executed.
 *
 *   claim        BoostChat hands over the spec (and an event token this module never sees)
 *   scaffold     runner resources · validate the spec · data/sites/<siteId>/ from the starter ·
 *                declare the site BoostChat-managed (portfolio-source@2)
 *   build        the shell package · checked on its own files (package-check.ts)       → built
 *   upload       upload, read back, seal — no routing key is read or written
 *   announce     BoostChat is told the package exists                                   → announced
 *   route        the hostname has no routing pointer to another site · the exact Worker
 *                route <hostname>/* exists for recon-runtime                              → route_ready
 *   activate     wait until BoostChat has published the (empty) portfolio for this
 *                package, then the guarded routing pointer write                         → activated
 *
 * The hostname becomes public in the LAST step only, and only through publishSite's own guard
 * (managed-flow.ts): the package is sealed and the store holds the overlay recon-runtime would use.
 * This module writes no routing key and passes no bypass.
 *
 * Any failure after the claim → ONE `failed` event { step, code, message } (message scrubbed, at
 * most 300 characters) and a result that is not ok. A failed claim sends nothing. An event that
 * BoostChat refuses (409: another attempt owns the job) stops the run where it is: a stale run never
 * goes on to switch a hostname.
 *
 * Nothing is deleted on failure, and every step is an "ensure": the same job run again scaffolds
 * nothing new, builds nothing new (same build input), uploads nothing twice (sealed), finds its
 * route and writes the same pointer.
 */

/** how long the last step waits for BoostChat's first revision (the job itself is given 25 minutes) */
export const ACTIVATE_WAIT_SECONDS = 300;

/** What needs the runner's own configuration. Asked for AFTER the claim, so a missing variable is reported to the job instead of timing it out. */
export interface ProvisionResources {
  store: ObjectStore;
  /** must be { mode: "on" }: a provisioned site is always announced */
  announce: AnnounceSetup;
  routes: WorkerRouteClient;
  /** the Worker script a route is created for — the runner's constant, never the spec's */
  script: string;
}

export interface ProvisionDeps {
  repoRoot: string;
  boostchat: ProvisioningClient;
  run: { runId: string; runAttempt: number };
  /** throws ProvisionError("runner_config", …) naming the variables — never their values */
  resources: () => ProvisionResources | Promise<ProvisionResources>;
  log: (line: string) => void;
  /** extra secret values to keep out of every line and message (the BoostChat client's are added by itself) */
  secrets?: readonly string[];
  waitSeconds?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  now?: () => Date;
  /** test seam: the builder */
  buildSite?: (opts: SiteBuildOptions) => Promise<SiteBuildResult>;
}

export type ProvisionResult =
  | { ok: true; jobId: string; attempt: number; siteId: string; hostname: string; packageHash: string; buildInputId: string; fileCount: number; route: { pattern: string; created: boolean }; pointerWrite: "written" | "unchanged" }
  /** stage "claim": nothing was claimed and no event was sent */
  | { ok: false; stage: "claim"; code: string; message: string }
  | { ok: false; stage: FailedStep; code: string; message: string; failedEventSent: boolean };

/** A failure of one step, as the `failed` event reports it. */
export class StepFailure extends Error {
  constructor(
    public readonly step: FailedStep,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StepFailure";
  }
}

const ANNOUNCE_STOPS: readonly ManagedStop[] = ["mode_v1", "site_not_found", "package_not_v2", "announce_failed"];

function codeOf(error: unknown, fallback: string): string {
  if (error instanceof ProvisionError || error instanceof RouteError) return error.code;
  if (error instanceof ProvisioningApiError) return error.code === "event_refused" ? "event_refused" : "event_undelivered";
  return fallback;
}

/** Run one step; whatever it throws becomes a StepFailure of that step (an AnnounceError is the announce's, wherever it surfaced). */
async function step<T>(name: FailedStep, fallbackCode: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof StepFailure) throw error;
    if (error instanceof AnnounceError) throw new StepFailure("announce", error.code === "config" ? "announce_config" : "announce_failed", error.message);
    throw new StepFailure(name, codeOf(error, fallbackCode), (error as Error)?.message ?? String(error));
  }
}

/** scaffold → managed marker → build → package check. No claim, no event, no store, no route. */
export async function buildProvisionedSite(opts: { repoRoot: string; spec: unknown; log: (line: string) => void; buildSite?: ProvisionDeps["buildSite"] }): Promise<{ spec: ProvisionSpec; facts: PackageFacts; packageDir: string; scaffold: "written" | "unchanged"; durationMs?: number }> {
  const { repoRoot, log } = opts;
  const { spec } = await step("scaffold", "spec_invalid", () => validateProvisionSpec({ repoRoot, raw: opts.spec }));
  const tag = `[${spec.siteId}]`;
  log(`${tag} spec ok · host ${spec.hostname} · release ${spec.template.releaseId}`);

  const scaffold = await step("scaffold", "scaffold_failed", async () => {
    const written = await scaffoldSite({ repoRoot, spec });
    const declared = await declareManagedPortfolio({ repoRoot, siteId: spec.siteId });
    log(`${tag} scaffold ${written.status} (${written.files.length} files) · managed marker ${declared.status} (${declared.schema})`);
    return written.status;
  });

  return step("build", "build_failed", async () => {
    const built = await (opts.buildSite ?? buildSite)({ repoRoot, siteId: spec.siteId, mode: "public", releaseId: spec.template.releaseId, log });
    const packageDir = path.resolve(repoRoot, built.packageDir);
    const facts = await verifyBuiltPackage({ repoRoot, packageDir, spec });
    log(`${tag} package ${facts.packageHash.slice(0, 16)}… ${built.status} · ${facts.fileCount} files · ${facts.bytes} B · ${facts.htmlPages.length} pages · package check ok`);
    return { spec, facts, packageDir, scaffold, durationMs: built.status === "built" ? built.record.durationMs.total : undefined };
  });
}

export async function provisionSite(deps: ProvisionDeps): Promise<ProvisionResult> {
  const { repoRoot, boostchat } = deps;
  const scrub: Scrubber = createScrubber([...(deps.secrets ?? []), ...boostchat.secrets()], [[repoRoot, "."]]);
  const log = (line: string) => deps.log(scrub.line(line));

  // ---- claim: a failure here sends nothing — there is no attempt to report against
  let claim: Awaited<ReturnType<ProvisioningClient["claim"]>>;
  try {
    claim = await boostchat.claim(deps.run);
  } catch (error) {
    const code = error instanceof ProvisioningApiError ? `claim_${error.code}` : "claim_failed";
    const message = scrub.message(error, FAILED_MESSAGE_MAX);
    log(`claim FAILED (${code}): ${message}`);
    return { ok: false, stage: "claim", code, message };
  }
  // the event token exists from here on
  for (const secret of boostchat.secrets()) scrub.add(secret);
  log(`claimed job ${claim.job.id} attempt ${claim.job.attempt} from ${boostchat.description}`);

  const send = <T extends RunnerEventType>(at: FailedStep, type: T, data: RunnerEventData<T>) =>
    step(at, "event_undelivered", async () => {
      await boostchat.event(type, data);
      log(`event ${type} accepted`);
    });

  try {
    const resources = await step("unknown", "runner_config", async () => deps.resources());
    if (resources.announce.mode !== "on") throw new StepFailure("unknown", "runner_config", "the runner has no announcer: a provisioned site is always announced to BoostChat");

    // ---- scaffold + build
    const { spec, facts } = await buildProvisionedSite({ repoRoot, spec: claim.spec, log, buildSite: deps.buildSite });
    const tag = `[${spec.siteId}]`;
    await send("build", "built", { packageHash: facts.packageHash, buildInputId: facts.buildInputId, fileCount: facts.fileCount, releaseId: spec.template.releaseId, releaseHash: spec.template.releaseHash });

    // every publish call is pinned to the package that was checked, and requires the baked origin to be the hostname's
    const publish = {
      repoRoot,
      siteId: spec.siteId,
      hostname: spec.hostname,
      store: resources.store,
      announce: resources.announce,
      expectPackageHash: facts.packageHash,
      requireOriginMatch: true,
      pollIntervalMs: deps.pollIntervalMs,
      sleep: deps.sleep,
      clock: deps.clock,
      now: deps.now,
      log,
    };
    const stopped = (result: Extract<ManagedPublishResult, { status: "stopped" }>, during: FailedStep): StepFailure =>
      new StepFailure(ANNOUNCE_STOPS.includes(result.stop) ? "announce" : during, result.stop === "timeout" ? "overlay_timeout" : result.stop, result.message);

    // ---- upload + announce (activate: false — no routing key is read or written)
    const uploaded = await step("upload", "upload_failed", () => publishManaged({ ...publish, activate: false }));
    if (uploaded.status === "stopped") throw stopped(uploaded, "announce");
    const announcement = uploaded.managed?.announcement;
    const revision = uploaded.managed?.requiredRevision;
    if (uploaded.status !== "uploaded" || !announcement || revision === undefined) throw new StepFailure("announce", "not_announced", "the package was uploaded but BoostChat was not told about it (not a shell package, or no announcer)");
    await send("announce", "announced", { packageHash: facts.packageHash, state: announcement.state, desiredRevision: revision });

    // ---- route. A route makes recon-runtime answer for the hostname at once, with whatever the
    // bucket's routing key says: a key left behind for ANOTHER site would go public the moment the
    // route exists. So the key is looked at first (read only) — absent, or already this site's.
    const route = await step("route", "route_failed", async () => {
      const live = await resources.store.get(routingKey(spec.hostname));
      if (live) {
        let pointer: ReturnType<typeof RoutingPointerSchema.safeParse>;
        try {
          pointer = RoutingPointerSchema.safeParse(JSON.parse(Buffer.from(live).toString("utf8")));
        } catch {
          throw new ProvisionError("host_pointer_unreadable", `${routingKey(spec.hostname)} exists in the store and is not a routing pointer; no route is created for a hostname whose pointer cannot be read`);
        }
        if (!pointer.success) throw new ProvisionError("host_pointer_unreadable", `${routingKey(spec.hostname)} exists in the store and is not a routing pointer; no route is created for a hostname whose pointer cannot be read`);
        if (pointer.data.siteId !== spec.siteId) throw new ProvisionError("host_serves_other_site", `${spec.hostname} already has a routing pointer to site "${pointer.data.siteId}"; a route would make that site public on this hostname`);
      }
      return ensureHostRoute({ client: resources.routes, hostname: spec.hostname, script: resources.script });
    });
    log(`${tag} route ${route.pattern} → ${resources.script} ${route.created ? "created" : "already there"}`);
    await send("route", "route_ready", { pattern: route.pattern, created: route.created });

    // ---- activate: wait for BoostChat's revision, then the guarded pointer write
    const activated = await step("activate", "activate_failed", () => publishManaged({ ...publish, activate: true, waitSeconds: deps.waitSeconds ?? ACTIVATE_WAIT_SECONDS }));
    if (activated.status === "stopped") throw stopped(activated, "activate");
    if (activated.status !== "published") throw new StepFailure("activate", "activate_failed", `the hostname was not switched (${activated.status})`);
    log(`${tag} routing pointer ${activated.result.pointerWrite} · ${spec.hostname} → ${facts.packageHash.slice(0, 16)}…`);
    try {
      await send("activate", "activated", { hostname: spec.hostname, packageHash: facts.packageHash });
    } catch (error) {
      // the truth BoostChat must not lose: the switch DID happen
      const failure = error as StepFailure;
      throw new StepFailure("activate", failure.code, `the routing pointer was written and ${spec.hostname} is public, but the "activated" event was not accepted: ${failure.message}`);
    }
    return { ok: true, jobId: claim.job.id, attempt: claim.job.attempt, siteId: spec.siteId, hostname: spec.hostname, packageHash: facts.packageHash, buildInputId: facts.buildInputId, fileCount: facts.fileCount, route: { pattern: route.pattern, created: route.created }, pointerWrite: activated.result.pointerWrite };
  } catch (error) {
    const failure = error instanceof StepFailure ? error : new StepFailure("unknown", "unexpected", (error as Error)?.message ?? String(error));
    const message = scrub.message(failure.message, FAILED_MESSAGE_MAX);
    log(`FAILED at ${failure.step} (${failure.code}): ${message}`);
    let failedEventSent = false;
    try {
      await boostchat.event("failed", { step: failure.step, code: failure.code, message });
      failedEventSent = true;
      log("event failed accepted");
    } catch (eventError) {
      log(`event failed NOT accepted: ${scrub.message(eventError, FAILED_MESSAGE_MAX)}`);
    }
    return { ok: false, stage: failure.step, code: failure.code, message, failedEventSent };
  }
}
