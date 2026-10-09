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
 *   3. wait       poll the store until it shows an overlay the guard accepts (portfolioOverlayState —
 *                 the function the guard itself uses), every pollIntervalMs, at most waitSeconds.
 *                 Not there in time → STOP: nothing is switched, and running again resumes the wait.
 *   4. activate   publishSite(activate: true): the package is sealed, so nothing is uploaded; it runs
 *                 every pointer guard it always ran and writes routing/<hostname>.json.
 *
 * THE INVARIANT has one owner and this module is not it: a routing pointer is written to a shell
 * package only by publishSite / rollbackHost, and only after assertPortfolioLive has judged the store
 * at that moment. Nothing here writes a routing key, passes a bypass or trusts BoostChat's answer for
 * it — the wait of step 3 is a readiness probe, and step 4 judges again. If the overlay disappears
 * between the two, step 4 refuses.
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
import { assertLivePackageIs, planPublish, portfolioOverlayState, publishSite, type PortfolioOverlayState, type PublishOptions, type PublishResult } from "./publish";
import type { ObjectStore } from "./store";

export const DEFAULT_WAIT_SECONDS = 180;
export const DEFAULT_POLL_INTERVAL_MS = 3000;

/** Who is told about a shell package — or why nobody is. `create` runs only for a shell package and may throw AnnounceError("config"). */
export type AnnounceSetup = { mode: "on"; create: () => ShellPackageAnnouncer } | { mode: "off"; why: string };

export interface ManagedPublishOptions extends Omit<PublishOptions, "dryRun" | "checkStore" | "store"> {
  store: ObjectStore;
  announce: AnnounceSetup;
  /** how long to wait for BoostChat's overlay after a `queued` answer (default 180; 0 = look once) */
  waitSeconds?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** monotonic milliseconds (default Date.now) */
  clock?: () => number;
}

export type ManagedStop =
  /** BoostChat has the site in V1 mode */
  | "mode_v1"
  /** 404 site_not_found — the site is not linked to a BoostChat tenant */
  | "site_not_found"
  /** 409 package_not_v2 */
  | "package_not_v2"
  /** the announce was refused or got no usable answer (401 / 403, 400, 5xx, network, protocol) */
  | "announce_failed"
  /** BoostChat accepted the announce and the overlay did not appear in time */
  | "timeout";

/** What the managed steps observed (present only when a shell package was announced). */
export interface ManagedInfo {
  announcedTo: string;
  announcement?: ShellAnnouncement;
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

/** Exit codes of `site:publish` for a run that did not throw. 1 = a refusal / failure (thrown), 2 = usage. */
export const MANAGED_EXIT = { ok: 0, announce: 3, modeV1: 4, timeout: 5 } as const;

export function managedExitCode(r: ManagedPublishResult): number {
  if (r.status !== "stopped") return MANAGED_EXIT.ok;
  if (r.stop === "mode_v1") return MANAGED_EXIT.modeV1;
  if (r.stop === "timeout") return MANAGED_EXIT.timeout;
  return MANAGED_EXIT.announce;
}

const short = (h: string) => `${h.slice(0, 16)}…`;
const NOT_WRITTEN = "The package is uploaded and sealed; the routing pointer was NOT written — the hostname serves what it served before.";

function describeOverlay(o: PortfolioOverlayState | undefined): string {
  if (!o) return "not looked at";
  if (o.state === "live") return `live (revision ${o.revision})`;
  return o.state === "absent" ? "absent" : `refused by recon-runtime (${o.reason})`;
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
    log(`${tag} NOT ANNOUNCED to BoostChat — ${announce.why}. This run only uploads the shell package${activate ? " and switches the hostname if BoostChat has already published the portfolio for it" : ""}.`);
    return ordinary(await publishSite(publish));
  }

  const waitSeconds = opts.waitSeconds ?? DEFAULT_WAIT_SECONDS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  if (!(Number.isInteger(waitSeconds) && waitSeconds >= 0)) throw new RangeError(`waitSeconds must be a non-negative integer, got ${String(waitSeconds)}`);
  if (!(Number.isFinite(pollIntervalMs) && pollIntervalMs > 0)) throw new RangeError(`pollIntervalMs must be positive, got ${String(pollIntervalMs)}`);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const clock = opts.clock ?? Date.now;
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

  // 2. announce
  const managed: ManagedInfo = { announcedTo: announcer.description, waitedMs: 0, polls: 0 };
  const stop = (kind: ManagedStop, message: string): ManagedPublishResult => ({ status: "stopped", stop: kind, message: `${message} ${NOT_WRITTEN}`, result: up, managed });
  const rerun = "then run this same command again (nothing is uploaded twice)";
  let answer: ShellAnnouncement;
  try {
    answer = await announcer.announce({ siteId: plan.siteId, packageHash: plan.packageHash });
  } catch (error) {
    if (!(error instanceof AnnounceError)) throw error;
    if (error.code === "site_not_found") {
      return stop("site_not_found", `Site "${plan.siteId}" is not linked to a BoostChat tenant yet (${announcer.description}: 404 site_not_found). Link it in BoostChat (portfolio adoption), ${rerun}.`);
    }
    if (error.code === "package_not_v2") {
      return stop("package_not_v2", `${announcer.description} does not accept package ${short(plan.packageHash)} of "${plan.siteId}" as a V2 shell package (409 package_not_v2): it reads the package from its own store binding and found no portfolio runtime under that hash — check that BoostChat and this publish use the same bucket, ${rerun}.`);
    }
    return stop("announce_failed", `BoostChat was not told about package ${short(plan.packageHash)} of "${plan.siteId}": ${error.message}. Fix that, ${rerun}.`);
  }
  managed.announcement = answer;
  log(`${tag} announced shell package ${short(plan.packageHash)} to ${announcer.description} → ${answer.state} (publishMode ${String(answer.publishMode ?? "?")}, searchSource ${String(answer.searchSource ?? "?")}, desiredRevision ${String(answer.desiredRevision ?? "?")}, liveRevision ${String(answer.liveRevision ?? "?")})`);
  if (answer.state === "mode_v1") {
    return stop("mode_v1", `BoostChat still has site "${plan.siteId}" in V1 mode (publishMode ${String(answer.publishMode ?? "?")}): it will not publish a portfolio for shell package ${short(plan.packageHash)}. Switch the site to V2 in BoostChat, ${rerun}.`);
  }

  const look = async (): Promise<string | undefined> => {
    managed.polls++;
    try {
      managed.overlay = await portfolioOverlayState(opts.store, plan.siteId, plan.packageHash);
      return undefined;
    } catch (error) {
      // a store read that failed is "not seen yet", not a verdict: the deadline decides
      return (error as Error).message;
    }
  };

  if (!activate) {
    const readError = await look();
    log(`${tag} activate: false → stopping after the announce. BoostChat: ${answer.state}; portfolio overlay of this package in the store (${plan.shell.currentKey}): ${readError ? `could not be read (${readError})` : describeOverlay(managed.overlay)}. ${plan.routingKey} not read, not written.`);
    return { status: "uploaded", result: up, managed };
  }

  // 3. wait — only for `queued`. `already_published` goes straight to the guard, which decides.
  if (answer.state === "queued") {
    const started = clock();
    const deadline = started + waitSeconds * 1000;
    let said: string | undefined;
    for (;;) {
      const readError = await look();
      const now = clock();
      managed.waitedMs = now - started;
      if (!readError && managed.overlay?.state === "live") break;
      const seen = readError ? `unreadable (${readError})` : describeOverlay(managed.overlay);
      if (now >= deadline) {
        return stop(
          "timeout",
          `BoostChat has not published the portfolio of "${plan.siteId}" for package ${short(plan.packageHash)} yet: after ${Math.round(managed.waitedMs / 1000)} s (${managed.polls} look(s)) the store's ${plan.shell.currentKey} is ${seen}. ` +
            `It accepted the announce (queued), so this is normally only a matter of time: running this same command again is safe — nothing is uploaded twice, the announce is idempotent, and the wait starts over (--wait-seconds N for a longer one).`,
        );
      }
      if (seen !== said) {
        log(`${tag} waiting for BoostChat to publish the portfolio for package ${short(plan.packageHash)} (up to ${waitSeconds} s, looking every ${pollIntervalMs / 1000} s): ${plan.shell.currentKey} is ${seen}`);
        said = seen;
      }
      await sleep(Math.min(pollIntervalMs, deadline - now));
    }
    log(`${tag} BoostChat published the portfolio for package ${short(plan.packageHash)} after ${Math.round(managed.waitedMs / 1000)} s (${managed.polls} look(s)): ${describeOverlay(managed.overlay)}`);
  }

  // 4. activate — the guarded pointer write, by its one owner. The package is sealed and was verified by step 1.
  const done = await publishSite({ ...pinned, activate: true, reverify: false });
  if (done.status !== "published") throw new Error(`publishSite(activate: true) returned ${done.status}`);
  return { status: "published", result: { ...done, upload: up.upload, uploaded: up.uploaded, verified: up.verified }, managed };
}

function ordinary(result: PublishResult): ManagedPublishResult {
  if (result.status === "dry-run") throw new Error("publishManaged is not a dry run");
  return result.status === "published" ? { status: "published", result } : { status: "uploaded", result };
}
