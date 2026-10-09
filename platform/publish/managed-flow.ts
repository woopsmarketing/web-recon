/**
 * The managed publish flow of site:publish — ONE command ships a shell package (Portfolio Publishing V2).
 *
 * A site marked portfolio-source@2 is built as a SHELL package: no portfolio inside. BoostChat
 * publishes the portfolio as an overlay of that exact package, and a hostname may point at the package
 * only once the store holds an overlay recon-runtime would use (publish.ts, shell-package guard). So
 * the order is fixed, and this module is that order:
 *
 *   1. upload     publishSite(activate: false) — upload, verify, seal. No routing key is read or written.
 *   2. announce   tell BoostChat the package exists (announce.ts). Its answer only steers the flow:
 *                   queued             → 3
 *                   already_published  → 4 (no wait)
 *                   mode_v1            → STOP: BoostChat will not publish an overlay for this site
 *                   an error           → STOP with the reason (404 site_not_found, 409 package_not_v2,
 *                                        401 / 403, 5xx, no answer, an answer outside the contract)
 *   3. wait       poll the store until the package is READY, every pollIntervalMs, at most waitSeconds.
 *                 READY = the store holds an overlay recon-runtime would use for the package
 *                 (portfolioOverlayState — the function the guard itself uses) AND its revision is
 *                 >= the revision BoostChat named: `desiredRevision` for queued, `liveRevision` for
 *                 already_published. The revision is what makes "ready" mean "BoostChat has published
 *                 for this package NOW": a package that was live earlier still has the overlay it had
 *                 when the hostname moved away, and that one verifies too. An answer without that
 *                 revision cannot be decided → STOP (announce_failed).
 *                 queued: not ready in time → STOP (timeout); running again resumes the wait.
 *                 already_published: there is nothing to wait for — one look; not ready → STOP
 *                 (store_behind: BoostChat's record and the store disagree).
 *   4. activate   publishSite(activate: true): the package is sealed, so nothing is uploaded; it runs
 *                 every pointer guard it always ran and writes routing/<hostname>.json.
 *
 * THE INVARIANT has one owner and this module is not it: a routing pointer is written to a shell
 * package only by publishSite / rollbackHost, and only after assertPortfolioLive has judged the store
 * at that moment. Nothing here writes a routing key, passes a bypass or trusts BoostChat's answer for
 * it — the wait of step 3 is a readiness probe, and step 4 judges again (a usable overlay, not older
 * than the one being served). If the overlay disappears between the two, step 4 refuses.
 *
 * ROLLBACK to a shell package is the same flow (rollbackManaged): the target is the pointer's
 * `previous` package — already sealed, so step 1 is "read what the rollback would do" (planRollback)
 * — then announce, wait until READY, and rollbackHost writes. Its overlay is by definition the one
 * the package had when it stopped being live, so without BoostChat republishing for it the guard
 * refuses it as older than what is served. A rollback to an ORDINARY package is one rollbackHost call.
 *
 * Idempotent: every stop leaves a sealed package and an untouched pointer; the same command run again
 * skips the upload (seal present), repeats the announce (idempotent on the BoostChat side) and goes on.
 *
 * Without an announcer (BOOSTCHAT_BASE_URL / BOOSTCHAT_PUBLISHER_TOKEN not set, --no-announce, or a
 * --local publish next to a non-loopback BoostChat) the run is exactly the single publishSite call it
 * always was — upload, and switch only if the guard already passes — plus one line that says why
 * nothing was announced. An ORDINARY package never reaches any of this: it is one publishSite call
 * and the announcer is not even constructed.
 *
 * activate: false → steps 1 and 2 only; the result carries BoostChat's answer and what the store
 * holds for the package at that moment.
 */
import { AnnounceError, type ShellAnnouncement, type ShellPackageAnnouncer } from "./announce";
import { assertLivePackageIs, planPublish, planRollback, portfolioOverlayState, publishSite, rollbackHost, type PortfolioOverlayState, type PortfolioTruthLoader, type PublishOptions, type PublishResult } from "./publish";
import type { ObjectStore } from "./store";
import { portfolioCurrentKey, type PackageRef, type RoutingPointer } from "../../workers/recon-runtime/src/contract";

export const DEFAULT_WAIT_SECONDS = 180;
export const DEFAULT_POLL_INTERVAL_MS = 3000;

/** Who is told about a shell package — or why nobody is. `create` runs only for a shell package and may throw AnnounceError("config"). */
export type AnnounceSetup = { mode: "on"; create: () => ShellPackageAnnouncer } | { mode: "off"; why: string };

/** The knobs of the wait, shared by a publish and a rollback. */
export interface ManagedWaitOptions {
  announce: AnnounceSetup;
  /** how long to wait for BoostChat's overlay after a `queued` answer (default 180; 0 = look once) */
  waitSeconds?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** monotonic milliseconds (default Date.now) */
  clock?: () => number;
}

export interface ManagedPublishOptions extends Omit<PublishOptions, "dryRun" | "checkStore" | "store">, ManagedWaitOptions {
  store: ObjectStore;
}

export interface ManagedRollbackOptions extends ManagedWaitOptions {
  store: ObjectStore;
  siteId: string;
  hostname: string;
  expectLivePackageHash?: string;
  portfolioTruth?: PortfolioTruthLoader;
  now?: () => Date;
  log?: (line: string) => void;
}

export type ManagedStop =
  /** BoostChat has the site in V1 mode */
  | "mode_v1"
  /** 404 site_not_found — the site is not linked to a BoostChat tenant */
  | "site_not_found"
  /** 409 package_not_v2 */
  | "package_not_v2"
  /** the announce was refused, got no usable answer (401 / 403, 400, 5xx, network, protocol), or named no revision to wait for */
  | "announce_failed"
  /** queued: the announced revision did not appear in the store in time */
  | "timeout"
  /** already_published: the store does not show the revision BoostChat reports as published */
  | "store_behind";

/** What the managed steps observed (present only when a shell package was announced). */
export interface ManagedInfo {
  announcedTo: string;
  announcement?: ShellAnnouncement;
  /** the revision the package's overlay must have reached: desiredRevision (queued) / liveRevision (already_published) */
  requiredRevision?: number;
  /** the overlay of this package as the store held it when the flow last looked */
  overlay?: PortfolioOverlayState;
  waitedMs: number;
  polls: number;
}

type Uploaded = Extract<PublishResult, { status: "uploaded" }>;
type Published = Extract<PublishResult, { status: "published" }>;

export type ManagedPublishResult =
  | { status: "published"; result: Published; managed?: ManagedInfo }
  /** activate: false */
  | { status: "uploaded"; result: Uploaded; managed?: ManagedInfo }
  /** the package is uploaded and sealed; the routing pointer was not read or written by this run */
  | { status: "stopped"; stop: ManagedStop; message: string; result: Uploaded; managed: ManagedInfo };

export type ManagedRollbackResult =
  | { status: "rolled-back"; pointer: RoutingPointer; from: PackageRef; managed?: ManagedInfo }
  /** the routing pointer was not written by this run */
  | { status: "stopped"; stop: ManagedStop; message: string; managed: ManagedInfo };

/** Exit codes of `site:publish` for a run that did not throw. 1 = a refusal / failure (thrown), 2 = usage. */
export const MANAGED_EXIT = { ok: 0, announce: 3, modeV1: 4, timeout: 5 } as const;

export function managedExitCode(r: { status: string; stop?: ManagedStop }): number {
  if (r.status !== "stopped") return MANAGED_EXIT.ok;
  if (r.stop === "mode_v1") return MANAGED_EXIT.modeV1;
  if (r.stop === "timeout" || r.stop === "store_behind") return MANAGED_EXIT.timeout;
  return MANAGED_EXIT.announce;
}

const short = (h: string) => `${h.slice(0, 16)}…`;

function describeOverlay(o: PortfolioOverlayState | undefined): string {
  if (!o) return "not looked at";
  if (o.state === "live") return `live (revision ${o.revision})`;
  return o.state === "absent" ? "absent" : `refused by recon-runtime (${o.reason})`;
}

function waitKnobs(opts: ManagedWaitOptions) {
  const waitSeconds = opts.waitSeconds ?? DEFAULT_WAIT_SECONDS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  if (!(Number.isInteger(waitSeconds) && waitSeconds >= 0)) throw new RangeError(`waitSeconds must be a non-negative integer, got ${String(waitSeconds)}`);
  if (!(Number.isFinite(pollIntervalMs) && pollIntervalMs > 0)) throw new RangeError(`pollIntervalMs must be positive, got ${String(pollIntervalMs)}`);
  return { waitSeconds, pollIntervalMs, sleep: opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))), clock: opts.clock ?? Date.now };
}

interface AnnounceRun {
  store: ObjectStore;
  siteId: string;
  packageHash: string;
  /** portfolio-public/<siteId>/current/<packageHash>.json */
  currentKey: string;
  routingKey: string;
  announcer: ShellPackageAnnouncer;
  knobs: ReturnType<typeof waitKnobs>;
  /** false = activate: false: announce, look once, report — never wait, never stop for "not ready" */
  wait: boolean;
  log: (line: string) => void;
  /** how every stop message ends: what this run left behind */
  left: string;
  /** "then run this same command again (…)" */
  rerun: string;
}

type Announced = { ok: true; managed: ManagedInfo } | { ok: false; stop: ManagedStop; message: string; managed: ManagedInfo };

/** Steps 2 and 3: announce the package and wait until it is READY. Never writes; never throws for BoostChat's answer. */
async function announceAndWait(run: AnnounceRun): Promise<Announced> {
  const { announcer, siteId, packageHash, log, rerun } = run;
  const { waitSeconds, pollIntervalMs, sleep, clock } = run.knobs;
  const tag = `[${siteId}]`;
  const managed: ManagedInfo = { announcedTo: announcer.description, waitedMs: 0, polls: 0 };
  const stop = (kind: ManagedStop, message: string): Announced => ({ ok: false, stop: kind, message: `${message} ${run.left}`, managed });

  // 2. announce
  let answer: ShellAnnouncement;
  try {
    answer = await announcer.announce({ siteId, packageHash });
  } catch (error) {
    if (!(error instanceof AnnounceError)) throw error;
    if (error.code === "site_not_found") {
      return stop("site_not_found", `Site "${siteId}" is not linked to a BoostChat tenant yet (${announcer.description}: 404 site_not_found). Link it in BoostChat (portfolio adoption), ${rerun}.`);
    }
    if (error.code === "package_not_v2") {
      return stop("package_not_v2", `${announcer.description} does not accept package ${short(packageHash)} of "${siteId}" as a V2 shell package (409 package_not_v2): it reads the package from its own store binding and found no portfolio runtime under that hash — check that BoostChat and this publish use the same bucket, ${rerun}.`);
    }
    return stop("announce_failed", `BoostChat was not told about package ${short(packageHash)} of "${siteId}": ${error.message}. Fix that, ${rerun}.`);
  }
  managed.announcement = answer;
  log(`${tag} announced shell package ${short(packageHash)} to ${announcer.description} → ${answer.state} (publishMode ${String(answer.publishMode ?? "?")}, searchSource ${String(answer.searchSource ?? "?")}, desiredRevision ${String(answer.desiredRevision ?? "?")}, liveRevision ${String(answer.liveRevision ?? "?")})`);
  if (answer.state === "mode_v1") {
    return stop("mode_v1", `BoostChat still has site "${siteId}" in V1 mode (publishMode ${String(answer.publishMode ?? "?")}): it will not publish a portfolio for shell package ${short(packageHash)}. Switch the site to V2 in BoostChat, ${rerun}.`);
  }
  // The revision that makes the package READY. Without it "an overlay verifies" would be all there is to
  // go by — and the overlay of a package that was live earlier verifies too.
  const queued = answer.state === "queued";
  const field = queued ? "desiredRevision" : "liveRevision";
  const required = queued ? answer.desiredRevision : answer.liveRevision;
  if (!(typeof required === "number" && Number.isInteger(required) && required >= 0)) {
    return stop(
      "announce_failed",
      `${announcer.description} answered ${answer.state} for package ${short(packageHash)} of "${siteId}" without a usable ${field} (${JSON.stringify(required ?? null)}), so it cannot be decided which revision of the portfolio the package must have before the hostname may be switched to it. Nothing is switched on a guess; ${rerun} once BoostChat answers with it.`,
    );
  }
  managed.requiredRevision = required;

  /** one look at the store; the text of what was seen when the package is NOT ready, undefined when it is */
  const look = async (): Promise<string | undefined> => {
    managed.polls++;
    try {
      managed.overlay = await portfolioOverlayState(run.store, siteId, packageHash);
    } catch (error) {
      // a store read that failed is "not seen yet", not a verdict: the deadline decides
      return `unreadable (${(error as Error).message})`;
    }
    const o = managed.overlay;
    if (o.state !== "live") return describeOverlay(o);
    return o.revision >= required ? undefined : `at revision ${o.revision}, older than the revision ${required} BoostChat ${queued ? "is publishing" : "reports as published"}`;
  };

  if (!run.wait) {
    const seen = await look();
    log(`${tag} activate: false → stopping after the announce. BoostChat: ${answer.state}, revision ${required}; portfolio overlay of this package in the store (${run.currentKey}): ${seen ?? describeOverlay(managed.overlay)}. ${run.routingKey} not read, not written.`);
    return { ok: true, managed };
  }

  // 3. wait. already_published has nothing to wait for: one look.
  const started = clock();
  const deadline = started + (queued ? waitSeconds * 1000 : 0);
  let said: string | undefined;
  for (;;) {
    const seen = await look();
    const now = clock();
    managed.waitedMs = now - started;
    if (seen === undefined) break;
    if (now >= deadline) {
      if (!queued) {
        return stop(
          "store_behind",
          `BoostChat reports the portfolio of "${siteId}" for package ${short(packageHash)} as already published at revision ${required}, but the store's ${run.currentKey} is ${seen}. ` +
            `BoostChat's record and the store disagree (another bucket, or a publish that did not complete): republish the portfolio in BoostChat, ${rerun}.`,
        );
      }
      return stop(
        "timeout",
        `BoostChat has not published the portfolio of "${siteId}" for package ${short(packageHash)} yet: after ${Math.round(managed.waitedMs / 1000)} s (${managed.polls} look(s)) the store's ${run.currentKey} is ${seen} (waiting for revision ${required}). ` +
          `It accepted the announce (queued), so this is normally only a matter of time: running this same command again is safe — the announce is idempotent, nothing already done is done twice, and the wait starts over (--wait-seconds N for a longer one).`,
      );
    }
    if (seen !== said) {
      log(`${tag} waiting for BoostChat to publish revision ${required} of the portfolio for package ${short(packageHash)} (up to ${waitSeconds} s, looking every ${pollIntervalMs / 1000} s): ${run.currentKey} is ${seen}`);
      said = seen;
    }
    await sleep(Math.min(pollIntervalMs, deadline - now));
  }
  log(`${tag} the portfolio for package ${short(packageHash)} is published${queued ? ` — BoostChat published it after ${Math.round(managed.waitedMs / 1000)} s (${managed.polls} look(s))` : ""}: ${describeOverlay(managed.overlay)}, required revision ${required}`);
  return { ok: true, managed };
}

export async function publishManaged(opts: ManagedPublishOptions): Promise<ManagedPublishResult> {
  const { announce, waitSeconds: _w, pollIntervalMs: _p, sleep: _s, clock: _c, ...publish } = opts;
  const log = opts.log ?? (() => {});
  const activate = opts.activate !== false;
  // The log lines of a plan belong to publishSite; this plan only answers "is it a shell package".
  const plan = await planPublish(opts);
  const tag = `[${plan.siteId}]`;

  if (!plan.shell) {
    const result = await publishSite(publish);
    return ordinary(result);
  }
  if (announce.mode === "off") {
    log(`${tag} NOT ANNOUNCED to BoostChat — ${announce.why}. This run only uploads the shell package${activate ? " and switches the hostname if BoostChat has already published the portfolio for it (and not an older one than the hostname serves now)" : ""}.`);
    return ordinary(await publishSite(publish));
  }

  const knobs = waitKnobs(opts);
  // Configuration is judged before anything is uploaded (AnnounceError "config" → the caller's usage error).
  const announcer = announce.create();
  // publishSite runs twice (upload, then switch) and describes the package both times: say each line once.
  const said = new Set<string>();
  const once = (line: string) => void (said.has(line) || (said.add(line), log(line)));
  // The same package for every step: a concurrent site:build must not swap it under the flow.
  const pinned = { ...publish, expectPackageHash: plan.packageHash, log: once };
  // Stale-write guard, early — as publishSite does it: no upload, announce and wait for a switch that would be refused.
  if (activate && opts.expectLivePackageHash !== undefined) await assertLivePackageIs(opts.store, plan.hostname, opts.expectLivePackageHash);

  // 1. upload + verify + seal. No routing key is read or written.
  // (publishSite's own "activate: false" line is dropped: in this flow the switch is still to come.)
  const up = await publishSite({ ...pinned, activate: false, expectLivePackageHash: undefined, log: (line) => void (line.includes("activate: false →") || once(line)) });
  if (up.status !== "uploaded") throw new Error(`publishSite(activate: false) returned ${up.status}`);

  // 2 + 3. announce, wait until READY
  const announced = await announceAndWait({
    store: opts.store,
    siteId: plan.siteId,
    packageHash: plan.packageHash,
    currentKey: plan.shell.currentKey,
    routingKey: plan.routingKey,
    announcer,
    knobs,
    wait: activate,
    log,
    left: "The package is uploaded and sealed; the routing pointer was NOT written — the hostname serves what it served before.",
    rerun: "then run this same command again (nothing is uploaded twice)",
  });
  if (!announced.ok) return { status: "stopped", stop: announced.stop, message: announced.message, result: up, managed: announced.managed };
  if (!activate) return { status: "uploaded", result: up, managed: announced.managed };

  // 4. activate — the guarded pointer write, by its one owner. The package is sealed and was verified by step 1.
  const done = await publishSite({ ...pinned, activate: true, reverify: false });
  if (done.status !== "published") throw new Error(`publishSite(activate: true) returned ${done.status}`);
  return { status: "published", result: { ...done, upload: up.upload, uploaded: up.uploaded, verified: up.verified }, managed: announced.managed };
}

function ordinary(result: PublishResult): ManagedPublishResult {
  if (result.status === "dry-run") throw new Error("publishManaged is not a dry run");
  return result.status === "published" ? { status: "published", result } : { status: "uploaded", result };
}

/**
 * Rollback of a hostname to its pointer's `previous` package. An ordinary target, or no announcer:
 * exactly rollbackHost. A SHELL target with an announcer: announce it, wait until READY, then
 * rollbackHost — pinned to the pointer and the target that were read before the announce, so a pointer
 * that moved during the wait is refused (stale-write guard) instead of rolled back somewhere else.
 */
export async function rollbackManaged(opts: ManagedRollbackOptions): Promise<ManagedRollbackResult> {
  const { announce, waitSeconds: _w, pollIntervalMs: _p, sleep: _s, clock: _c, ...rollback } = opts;
  const log = opts.log ?? (() => {});
  // Read-only: every refusal a rollback raises before it looks at the portfolio (no pointer, another site, stale --expect-live, no previous, no seal).
  const plan = await planRollback(opts);
  const tag = `[${opts.siteId}]`;
  if (!plan.shell) return { status: "rolled-back", ...(await rollbackHost(rollback)) };
  if (announce.mode === "off") {
    log(`${tag} NOT ANNOUNCED to BoostChat — ${announce.why}. This rollback only switches the hostname if the store already holds a portfolio for the target package ${short(plan.target.packageHash)} that is not older than the one the hostname serves now.`);
    return { status: "rolled-back", ...(await rollbackHost(rollback)) };
  }
  const knobs = waitKnobs(opts);
  const announcer = announce.create();
  log(`${tag} rollback target ${short(plan.target.packageHash)} (${plan.target.releaseId}) is a portfolio shell package: BoostChat publishes the current portfolio for it before the hostname goes back to it`);
  const announced = await announceAndWait({
    store: opts.store,
    siteId: opts.siteId,
    packageHash: plan.target.packageHash,
    currentKey: portfolioCurrentKey(opts.siteId, plan.target.packageHash),
    routingKey: plan.routingKey,
    announcer,
    knobs,
    wait: true,
    log,
    left: "The routing pointer was NOT written — the hostname serves what it served before. (A rollback that must not depend on BoostChat: --no-announce — the store's guard alone decides, and it refuses a portfolio older than the one being served.)",
    rerun: "then run this same rollback again",
  });
  if (!announced.ok) return { status: "stopped", stop: announced.stop, message: announced.message, managed: announced.managed };
  const done = await rollbackHost({ ...rollback, expectLivePackageHash: plan.live.packageHash, expectTargetPackageHash: plan.target.packageHash });
  return { status: "rolled-back", ...done, managed: announced.managed };
}
