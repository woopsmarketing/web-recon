import { buildSite, type SiteBuildOptions, type SiteBuildResult } from "../build/site-build";
import { publishSite } from "../publish/publish";
import type { ObjectStore } from "../publish/store";
import { portfolioAssetKey } from "../../workers/recon-runtime/src/contract";
import { RebuildApiError, type RebuildClient, type RebuildEventData, type RebuildEventType } from "./rebuild-client";
import { RebuildStepFailure, buildRebuiltSite, rebuildStep, type RebuildFailedStep } from "./rebuild";
import { RebuildError, type ValidatedRebuildSpec } from "./rebuild-spec";
import { createScrubber, type Scrubber } from "./scrub";
import { FAILED_MESSAGE_MAX, ProvisionError } from "./spec";

/**
 * rebuildSite — one rebuild job, from a rebuild id to a SEALED, NOT-PUBLIC package in the bucket
 * (boost-chat docs/work/site-design-platform/CONTRACTS.md §9.4). Typed functions only: nothing here builds a
 * command line, and nothing the spec says is ever executed.
 *
 *   claim       BoostChat hands over the spec (and an event token this module never sees)
 *   validate    schema · the starter lists the release · the release verifies · brand fields supported · asset keys
 *   scaffold    starter → preset → brand → indexing (precedence; rebuild.ts says how it is executed), into data/sites/<siteId>/
 *   assets      each brand image from `portfolio-assets/<key>`: size, sha256, media type, pixel size
 *   build       the shell package (mode public), checked on its own files             → `built`
 *   upload      upload, read back, seal with publishSite({ activate: false })          → `sealed`
 *
 * WHAT THIS RUNNER DOES NOT DO — structurally, not by promise:
 *   - It never reads or writes `routing/`: the only store it ever holds is a GuardedStore that throws on any key outside
 *     `portfolio-assets/<assetKeyPrefix>` (read) and `sites/<siteId>/packages/` (read, write). `routing/` is outside both.
 *   - It never calls the shell-package announce endpoint: nothing from publish/announce or publish/managed-flow is imported here,
 *     and the BoostChat client (rebuild-client.ts) has exactly two routes, claim and events.
 *   - It never touches a Worker route or DNS: routes.ts / deploy-routes.ts are not imported, and no Cloudflare client is created.
 *   The package it seals is public only after BoostChat's activation step (a later work package) moves the pointer.
 *
 * Any failure after the claim → ONE `failed` event { step, code, message } (message scrubbed, at most 300 characters) and a
 * result that is not ok. An event that BoostChat refuses (409: another attempt owns the job) stops the run where it is — with
 * no further write of any kind, not even a `failed` event. A claim that fails sends nothing.
 *
 * Every step is an "ensure": the same job run again scaffolds nothing new, builds the same package (same build input),
 * finds it sealed and uploads nothing twice.
 */

// -------------------------------------------------------------- guarded store --

/** A store call outside what a rebuild may touch. */
export class StoreKeyForbidden extends ProvisionError {
  constructor(operation: "get" | "put", key: string) {
    super("store_key_forbidden", `a rebuild may not ${operation} ${key.startsWith("routing/") ? "a routing key" : "that key"} (${key.slice(0, 60)})`);
    this.name = "StoreKeyForbidden";
  }
}

export interface GuardedStore extends ObjectStore {
  /** every key a call was refused for, in order */
  readonly refused: string[];
}

/**
 * The only door to the bucket. Reads: the spec's brand images and this site's packages. Writes: this site's packages (the
 * seal included). Anything else — `routing/`, another site, the portfolio overlay, a key with a dot segment — throws.
 */
export function guardStore(inner: ObjectStore, scope: { siteId: string; assetKeyPrefix: string }): GuardedStore {
  const packages = `sites/${scope.siteId}/packages/`;
  const assets = portfolioAssetKey(scope.assetKeyPrefix);
  const refused: string[] = [];
  const clean = (key: string) => !key.split("/").some((seg) => seg === "" || seg === "." || seg === "..") && !/[\\\0]/.test(key);
  const check = (op: "get" | "put", key: string) => {
    const inPackages = key.startsWith(packages) && clean(key);
    const inAssets = key.startsWith(assets) && clean(key);
    if (!(op === "put" ? inPackages : inPackages || inAssets)) {
      refused.push(`${op} ${key}`);
      throw new StoreKeyForbidden(op, key);
    }
  };
  return {
    description: inner.description,
    maxConcurrency: inner.maxConcurrency,
    refused,
    async put(key, body, meta) {
      check("put", key);
      return inner.put(key, body, meta);
    },
    async get(key) {
      check("get", key);
      return inner.get(key);
    },
  };
}

// -------------------------------------------------------------------- runner --

/** What needs the runner's own configuration. Asked for AFTER the claim, so a missing variable is reported to the job instead of timing it out. */
export interface RebuildResources {
  store: ObjectStore;
}

export interface RebuildDeps {
  repoRoot: string;
  boostchat: RebuildClient;
  run: { runId: string; runAttempt: number };
  /** throws ProvisionError("runner_config", …) naming the variables — never their values */
  resources: () => RebuildResources | Promise<RebuildResources>;
  log: (line: string) => void;
  /** extra secret values to keep out of every line and message (the BoostChat client's are added by itself) */
  secrets?: readonly string[];
  /** the commit the workflow was dispatched with; when given, the spec's sourceRef must be the same */
  expectedSourceRef?: string;
  /** test seam: the builder */
  buildSite?: (opts: SiteBuildOptions) => Promise<SiteBuildResult>;
  now?: () => Date;
}

export type RebuildResult =
  | {
      ok: true;
      rebuildId: string;
      attempt: number;
      siteId: string;
      hostname: string;
      packageHash: string;
      buildInputId: string;
      fileCount: number;
      bytes: number;
      upload: "uploaded" | "skipped-sealed";
      duplicateAcks: number;
      /** the design preset the package was built with; null = none. In the run's own report and log only: the `built` event's data is the contract's (CONTRACTS §9.2) and has no member for it */
      design: { presetId: string; presetVersion: number } | null;
    }
  /** stage "claim": nothing was claimed and no event was sent */
  | { ok: false; stage: "claim"; code: string; message: string }
  /** stage "event": BoostChat refused an event (stale run); the run stopped and wrote nothing more */
  | { ok: false; stage: "event"; code: "event_refused"; message: string; failedEventSent: false }
  | { ok: false; stage: RebuildFailedStep; code: string; message: string; failedEventSent: boolean };

/** An event BoostChat refused with 409: this run is stale. */
class StaleRun extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaleRun";
  }
}

export async function rebuildSite(deps: RebuildDeps): Promise<RebuildResult> {
  const { repoRoot, boostchat } = deps;
  const scrub: Scrubber = createScrubber([...(deps.secrets ?? []), ...boostchat.secrets()], [[repoRoot, "."]]);
  const log = (line: string) => deps.log(scrub.line(line));

  // ---- claim: a failure here sends nothing — there is no attempt to report against
  let claim: Awaited<ReturnType<RebuildClient["claim"]>>;
  try {
    claim = await boostchat.claim(deps.run);
  } catch (error) {
    const code = error instanceof RebuildApiError ? `claim_${error.code}` : "claim_failed";
    const message = scrub.message(error, FAILED_MESSAGE_MAX);
    log(`claim FAILED (${code}): ${message}`);
    return { ok: false, stage: "claim", code, message };
  }
  // the event token exists from here on
  for (const secret of boostchat.secrets()) scrub.add(secret);
  log(`claimed rebuild ${claim.job.id} attempt ${claim.job.attempt} from ${boostchat.description}`);

  let duplicateAcks = 0;
  /** Report one step. 200 (also the duplicate acknowledgement) is success; 409 ends the run. */
  const send = async <T extends RebuildEventType>(at: RebuildFailedStep, type: T, data: RebuildEventData<T>): Promise<void> => {
    try {
      const ack = await boostchat.event(type, data);
      if (ack.duplicate) duplicateAcks++;
      log(`event ${type} accepted${ack.duplicate ? " (duplicate acknowledgement)" : ""}`);
    } catch (error) {
      if (error instanceof RebuildApiError && error.code === "event_refused") throw new StaleRun(error.message);
      throw new RebuildStepFailure(at, "event_undelivered", (error as Error)?.message ?? String(error));
    }
  };

  try {
    const resources = await rebuildStep("unknown", "runner_config", async () => deps.resources());
    let guarded: GuardedStore | undefined;
    const guard = (v: ValidatedRebuildSpec) => (guarded ??= guardStore(resources.store, { siteId: v.effective.siteId, assetKeyPrefix: v.spec.assetKeyPrefix }));

    // ---- validate (nothing is read from the bucket before this has passed) + scaffold + assets + build + package check
    const built = await buildRebuiltSite({
      repoRoot,
      spec: claim.spec,
      log,
      buildSite: deps.buildSite,
      checkSpec: (v) => {
        if (v.spec.rebuildId !== claim.job.id) throw new RebuildError("rebuild_id_invalid", "the spec's rebuildId is not the id of the job that was claimed");
        if (deps.expectedSourceRef !== undefined && v.spec.sourceRef !== deps.expectedSourceRef) throw new RebuildError("source_ref_mismatch", "the spec's sourceRef is not the commit this run was dispatched with");
      },
      loadAssets: async (v) => {
        const store = guard(v);
        const out = new Map<string, Buffer>();
        for (const ref of v.assets.values()) {
          let body: Uint8Array | null;
          try {
            body = await store.get(portfolioAssetKey(ref.key));
          } catch (error) {
            if (error instanceof ProvisionError) throw error;
            throw new RebuildError("asset_fetch_failed", `asset "${ref.id}" could not be read from the bucket: ${(error as Error).message}`);
          }
          if (!body) throw new RebuildError("asset_missing", `asset "${ref.id}" is not in the bucket at its key`);
          out.set(ref.id, Buffer.from(body));
        }
        return out;
      },
    });
    const { facts } = built;
    const spec = built.validated.effective;
    const tag = `[${spec.siteId}]`;
    await send("build", "built", {
      packageHash: facts.packageHash,
      buildInputId: facts.buildInputId,
      fileCount: facts.fileCount,
      releaseId: spec.template.releaseId,
      releaseHash: spec.template.releaseHash,
      siteSnapshotHash: built.siteSnapshotHash,
      starterHash: built.starterHash,
    });

    // ---- upload + read back + seal. activate: false → the routing pointer is neither read nor written; the guarded store
    // would refuse it anyway.
    const uploaded = await rebuildStep("upload", "upload_failed", () =>
      publishSite({
        repoRoot,
        siteId: spec.siteId,
        hostname: spec.hostname,
        store: guard(built.validated),
        expectPackageHash: facts.packageHash,
        requireOriginMatch: true,
        activate: false,
        now: deps.now,
        log,
      }),
    );
    if (uploaded.status !== "uploaded") throw new RebuildStepFailure("upload", "not_uploaded", `the package was not uploaded and sealed (${uploaded.status})`);
    log(`${tag} package ${facts.packageHash.slice(0, 16)}… sealed · ${uploaded.plan.files.length} files · ${uploaded.plan.bytes} B (${uploaded.upload}) · not public`);
    await send("upload", "sealed", { packageHash: facts.packageHash, fileCount: uploaded.plan.files.length, bytes: uploaded.plan.bytes });
    return {
      ok: true,
      rebuildId: claim.job.id,
      attempt: claim.job.attempt,
      siteId: spec.siteId,
      hostname: spec.hostname,
      packageHash: facts.packageHash,
      buildInputId: facts.buildInputId,
      fileCount: uploaded.plan.files.length,
      bytes: uploaded.plan.bytes,
      upload: uploaded.upload,
      duplicateAcks,
      design: built.design,
    };
  } catch (error) {
    if (error instanceof StaleRun) {
      const message = scrub.message(error, FAILED_MESSAGE_MAX);
      log(`STOPPED: ${message}`);
      return { ok: false, stage: "event", code: "event_refused", message, failedEventSent: false };
    }
    const failure = error instanceof RebuildStepFailure ? error : new RebuildStepFailure("unknown", "unexpected", (error as Error)?.message ?? String(error));
    const message = scrub.message(failure.message, FAILED_MESSAGE_MAX);
    log(`FAILED at ${failure.step} (${failure.code}): ${message}`);
    let failedEventSent = false;
    try {
      await boostchat.event("failed", { step: failure.step, code: failure.code, message });
      failedEventSent = true;
      log("event failed accepted");
    } catch (eventError) {
      if (eventError instanceof RebuildApiError && eventError.code === "event_refused") log("event failed REFUSED by BoostChat: this run is stale, nothing more is sent");
      else log(`event failed NOT accepted: ${scrub.message(eventError, FAILED_MESSAGE_MAX)}`);
    }
    return { ok: false, stage: failure.step, code: failure.code, message, failedEventSent };
  }
}
