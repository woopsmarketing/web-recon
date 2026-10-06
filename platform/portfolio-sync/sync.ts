import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSite, type BuildRecord } from "../build/site-build";
import { normalizeHostname, publishSite } from "../publish/publish";
import type { ObjectStore } from "../publish/store";
import { buildSiteSnapshot, siteDir as siteDirOf } from "../site/load";
import { hashJson, sha256 } from "../util/hash";
import { routingKey } from "../../workers/recon-runtime/src/contract";
import { BoostChatError, type PublisherClient, type ReportOutcome } from "./client";
import { RESULT_SCHEMA, STAGE_FAILURE_MESSAGE, resultMessage, type ExportAsset, type PortfolioExport, type PortfolioResult, type ResultStage } from "./contract";
import { applyFilePlan, parseExport, planManagedPortfolio, PortfolioGenerateError, readSiteDirState, restoreAppliedPlan, validatePlanStaged, type AppliedPlan, type PortfolioFilePlan } from "./generate";
import { SOURCE_MARKER_FILE, SOURCE_MARKER_TEXT, hasSourceMarker } from "./managed";
import { LIST_PATH, detailPath, type ExpectedFile, type VerifyInput, type VerifyOutcome } from "./verify";

/**
 * One publisher cycle for one site (contract §5):
 *
 *   read export ─ revision == liveRevision → nothing to do (but a checkout whose generated files are
 *               not that revision is regenerated from the export first: no build, publish or report)
 *   generate    validate, download + check assets, plan, prove the plan on a staged copy, write it
 *   build       the EXISTING site build (buildSite)
 *   publish     the EXISTING publish (publishSite) of exactly the package just built
 *   verify      the public URLs serve THAT package's bytes (detail pages, covers, the listing page)
 *   report      POST the result — `verified` holds only what the URL checks observed
 *
 * The site directory describes what is live: when build fails, or publish fails and the routing
 * pointer is READ BACK as not naming the new package, the previous generated files are put back.
 * When the pointer cannot be read, or the public URLs cannot be reached, nothing is undone and nothing
 * is reported: the cycle ends "unverified" and the next run decides.
 *
 * What BoostChat is told on a failure is one fixed sentence per stage; the detail stays in the log.
 *
 * Nothing here starts a second cycle on its own; runSync loops them one after another.
 */

export interface ExportSource {
  description: string;
  readExport(): Promise<unknown>;
  readAsset(asset: ExportAsset): Promise<Uint8Array>;
  /** absent = an offline source (a file): nothing is reported anywhere */
  report?(result: PortfolioResult): Promise<ReportOutcome>;
}

export function clientSource(client: PublisherClient, description: string): ExportSource {
  return { description, readExport: () => client.getExport(), readAsset: (a) => client.getAsset(a), report: (r) => client.postResult(r) };
}

/** Offline input: an export document on disk and a directory holding each asset under its `file` name. */
export function fileSource(exportFile: string, assetsDir: string): ExportSource {
  return {
    description: `file ${exportFile} (assets ${assetsDir})`,
    async readExport() {
      return JSON.parse(await readFile(exportFile, "utf8")) as unknown;
    },
    async readAsset(asset) {
      try {
        return await readFile(path.join(assetsDir, asset.file));
      } catch {
        throw new PortfolioGenerateError(`asset "${asset.id}": ${asset.file} is not in ${assetsDir}`);
      }
    },
  };
}

export interface BuildOutcome {
  status: "built" | "up-to-date";
  packageHash: string;
  /** version of the integration portfolio document the package carries; undefined = none emitted */
  portfolioVersion?: string;
  /** the built package's own bytes (sha256) for the URLs the verification fetches */
  files: { list?: ExpectedFile; records: Record<string, ExpectedFile[]> };
}

export interface SyncOptions {
  repoRoot: string;
  siteId: string;
  /** origin the published site is checked on */
  verifyBase: string;
  source: ExportSource;
  build: () => Promise<BuildOutcome>;
  publish: (expectPackageHash: string) => Promise<void>;
  /** does the hostname's routing pointer name this package now? undefined = cannot tell */
  liveIs?: (packageHash: string) => Promise<boolean | undefined>;
  verify: (input: Pick<VerifyInput, "base" | "present" | "absent" | "list" | "expectPortfolioVersion">) => Promise<VerifyOutcome>;
  /** fetch + plan + staged validation only; the site directory is not touched, nothing is built, published or reported */
  dryRun?: boolean;
  /** process the export even when revision == liveRevision */
  force?: boolean;
  /** stop after writing the generated files (no build, publish, verify or report) */
  generateOnly?: boolean;
  /** write the tracked adoption marker (portfolio.source.json) once the site directory is generated */
  adopt?: boolean;
  /** watch mode: the identical failure of the previous cycle — the same content is not processed again before `until` */
  backoff?: { contentHash: string; until: number };
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export type ReportState = "accepted" | "stale" | "undelivered" | "not-reported";

export type CycleResult =
  | { status: "nothing-to-do"; revision: number; /** the generated files were not the live revision and were rewritten from the export */ regenerated: boolean }
  | { status: "dry-run"; revision: number; plan: PortfolioFilePlan; siteSnapshotHash: string }
  | { status: "generated"; revision: number; plan: PortfolioFilePlan; siteSnapshotHash: string }
  | {
      status: "succeeded";
      revision: number;
      /** false = some record could not be confirmed on the public URL (it is NOT in `verified`) */
      complete: boolean;
      result: Extract<PortfolioResult, { outcome: "succeeded" }>;
      unconfirmed: string[];
      report: ReportState;
      /** the source already has a newer revision waiting */
      again: boolean;
    }
  /** published, or possibly published, but the public site / the routing pointer could not be asked: nothing undone, nothing reported */
  | { status: "unverified"; revision: number; message: string }
  /** the export moved while it was being read (an asset of it is gone): read it again */
  | { status: "retry"; revision: number; reason: string; again: true }
  /** watch mode: the same content failed the same way a moment ago */
  | { status: "backing-off"; revision: number; until: number }
  | {
      status: "failed";
      revision: number | undefined;
      stage: ResultStage;
      /** local detail (never sent) */
      message: string;
      /** the previous generated files were put back */
      restored: boolean;
      report: ReportState;
      again: boolean;
      /** identity of the export's content (not its revision number) */
      contentHash?: string;
    };

/** Errors that say nothing about the export: the cycle stops without a report and is simply run again later. */
function isTransport(error: unknown): error is BoostChatError {
  if (!(error instanceof BoostChatError)) return false;
  if (["network", "auth", "not-configured", "site-not-found", "config"].includes(error.kind)) return true;
  return error.kind === "http" && error.status !== undefined && (error.status >= 500 || error.status === 429);
}

/** What the export SAYS, without its revision counters and transfer links: two exports with the same hash generate the same site. */
export function exportContentHash(exp: PortfolioExport): string {
  return hashJson({ site: exp.site, categories: exp.categories, projects: exp.projects, assets: exp.assets.map(({ href: _href, ...a }) => a), removing: exp.changes.removing });
}

export async function runCycle(o: SyncOptions): Promise<CycleResult> {
  const log = o.log ?? (() => {});
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const dir = siteDirOf(o.repoRoot, o.siteId);
  const scrub = (text: string) => text.split(o.repoRoot).join(".").split(os.tmpdir()).join("<tmp>").split(os.homedir()).join("~");
  let contentHash: string | undefined;

  async function report(result: PortfolioResult): Promise<{ report: ReportState; again: boolean }> {
    if (!o.source.report) return { report: "not-reported", again: false };
    try {
      const r = await o.source.report(result);
      if (r.status === "stale") {
        log(`[${o.siteId}] BoostChat refused revision ${result.revision} as stale (desired ${r.revision ?? "?"}, live ${r.liveRevision ?? "?"}) → the export is read again`);
        return { report: "stale", again: true };
      }
      log(`[${o.siteId}] reported revision ${result.revision} ${result.outcome} → desired ${r.ack.revision}, live ${r.ack.liveRevision}`);
      // after a failure BoostChat raises the desired revision by itself; that one waits for the next run
      return { report: "accepted", again: result.outcome === "succeeded" && r.ack.revision > r.ack.liveRevision };
    } catch (error) {
      log(`[${o.siteId}] RESULT NOT DELIVERED: ${(error as Error).message}`);
      return { report: "undelivered", again: false };
    }
  }
  /** `tell: false` = a local failure that BoostChat must not hear about (nothing was asked of this checkout) */
  async function fail(revision: number | undefined, stage: ResultStage, error: unknown, restored: boolean, tell = true): Promise<CycleResult> {
    const message = resultMessage(scrub((error as Error)?.message ?? String(error)));
    log(`[${o.siteId}] FAILED at ${stage}: ${message}${restored ? " (previous generated files restored)" : ""}`);
    // BoostChat (and its customer) get the fixed sentence of the stage, never build output, paths or commands
    const sent = revision === undefined || !tell ? { report: "not-reported" as const, again: false } : await report({ schema: RESULT_SCHEMA, revision, outcome: "failed", error: { stage, message: STAGE_FAILURE_MESSAGE[stage] } });
    return { status: "failed", revision, stage, message, restored, ...sent, ...(contentHash ? { contentHash } : {}) };
  }

  const raw = await o.source.readExport();
  const revisionOf = (doc: unknown) => {
    const r = (doc as { revision?: unknown } | null)?.revision;
    return typeof r === "number" && Number.isInteger(r) && r >= 0 ? r : undefined;
  };
  const revisionHint = revisionOf(raw);

  // ---- generate ----
  let plan: PortfolioFilePlan;
  let siteSnapshotHash: string;
  let applied: AppliedPlan | undefined;
  let revision: number;
  let createdMarker = false;
  /** revision == liveRevision: BoostChat waits for nothing; at most this checkout is brought to that revision, silently */
  let settled = false;
  try {
    const exp = parseExport(raw);
    revision = exp.revision;
    contentHash = exportContentHash(exp);
    settled = !!o.source.report && !o.dryRun && !o.force && exp.revision === exp.liveRevision;
    const site = await readSiteDirState(o.repoRoot, o.siteId);
    if (settled && site.managed?.source.revision === exp.liveRevision && site.managed.interrupted === undefined) {
      log(`[${o.siteId}] revision ${exp.revision} is live and this checkout is generated from it → nothing to do`);
      return { status: "nothing-to-do", revision, regenerated: false };
    }
    if (o.backoff && !o.dryRun && !o.force && !settled && o.backoff.contentHash === contentHash && now() < o.backoff.until) {
      log(`[${o.siteId}] revision ${exp.revision} carries the content that just failed → not processed again before ${new Date(o.backoff.until).toISOString()}`);
      return { status: "backing-off", revision, until: o.backoff.until };
    }
    log(
      settled
        ? `[${o.siteId}] revision ${exp.revision} is live but this checkout is ${site.managed ? `generated from revision ${site.managed.source.revision}` : "not generated"} → regenerating the site directory only (no build, publish or report)`
        : `[${o.siteId}] export revision ${exp.revision} (live ${exp.liveRevision}): ${exp.projects.length} project(s), ${exp.assets.length} asset(s), publishing [${exp.changes.publishing.join(", ")}], removing [${exp.changes.removing.map((r) => r.id).join(", ")}]`,
    );
    if (exp.site.siteId !== o.siteId) throw new PortfolioGenerateError(`export is for site "${exp.site.siteId}", not "${o.siteId}"`);
    if (exp.site.publicOrigin !== site.publicOrigin) throw new PortfolioGenerateError(`export publicOrigin ${exp.site.publicOrigin} ≠ site.json publicOrigin ${site.publicOrigin ?? "(none)"} (contract P5)`);

    const assetBytes = new Map<string, Uint8Array>();
    let downloaded = 0;
    for (const a of exp.assets) {
      // an image already on disk with the declared sha256 is not fetched again (the planner re-checks the bytes)
      const local = site.files.get(`assets/${a.file}`) === a.sha256 ? await readFile(path.join(dir, "assets", a.file)).catch(() => undefined) : undefined;
      if (local) {
        assetBytes.set(a.id, local);
        continue;
      }
      downloaded++;
      try {
        assetBytes.set(a.id, await o.source.readAsset(a));
      } catch (error) {
        // 404: the image this export names is gone — usually because a newer publish replaced the export meanwhile
        if (error instanceof BoostChatError && error.kind === "http" && error.status === 404) {
          const fresh = revisionOf(await o.source.readExport());
          if (fresh !== exp.revision) {
            log(`[${o.siteId}] asset "${a.id}" answered 404 and the export moved from revision ${exp.revision} to ${fresh ?? "?"} → reading it again`);
            return { status: "retry", revision, reason: `asset "${a.id}" is gone; the export is now revision ${fresh ?? "?"}`, again: true };
          }
        }
        throw error;
      }
    }
    log(`[${o.siteId}] assets: ${downloaded} fetched, ${exp.assets.length - downloaded} already on disk`);
    plan = planManagedPortfolio({ export: exp, assetBytes, site });
    ({ siteSnapshotHash } = await validatePlanStaged({ repoRoot: o.repoRoot, siteId: o.siteId, plan }));
    if (o.dryRun) return { status: "dry-run", revision, plan, siteSnapshotHash };
    applied = await applyFilePlan(dir, plan);
    if (o.adopt && !(await hasSourceMarker(dir))) {
      await writeFile(path.join(dir, SOURCE_MARKER_FILE), SOURCE_MARKER_TEXT);
      createdMarker = true;
      log(`[${o.siteId}] ADOPTED: wrote ${SOURCE_MARKER_FILE} — commit it (see the runbook); every checkout now refuses to build this site without a generated portfolio`);
    }
    log(`[${o.siteId}] generated: ${plan.files.filter((f) => f.action !== "unchanged").length} file(s) written, ${plan.removes.length} removed, ${plan.files.filter((f) => f.action === "unchanged").length} unchanged · siteSnapshotHash ${siteSnapshotHash.slice(0, 16)}…`);
  } catch (error) {
    if (isTransport(error)) throw error;
    return fail(revisionHint, "generate", error, false, !settled);
  }
  if (settled) return { status: "nothing-to-do", revision, regenerated: true };
  if (o.generateOnly) return { status: "generated", revision, plan, siteSnapshotHash };

  const restore = async (): Promise<boolean> => {
    try {
      await restoreAppliedPlan(dir, applied!);
      if (createdMarker) await rm(path.join(dir, SOURCE_MARKER_FILE), { force: true });
      return true;
    } catch (error) {
      log(`[${o.siteId}] COULD NOT RESTORE the previous generated files: ${(error as Error).message} — run site:portfolio-sync --force once the cause is fixed`);
      return false;
    }
  };

  // ---- build ----
  let built: BuildOutcome;
  try {
    built = await o.build();
  } catch (error) {
    return fail(revision, "build", error, await restore());
  }

  // ---- publish ----
  try {
    await o.publish(built.packageHash);
  } catch (error) {
    // The publish may have died before or after the routing pointer moved (a timed-out PUT says nothing):
    // the pointer itself is read back, and only a pointer that does NOT name the new package undoes anything.
    let live: boolean | undefined;
    for (let attempt = 0; o.liveIs && attempt < 3 && live === undefined; attempt++) {
      if (attempt > 0) await sleep(2000);
      live = await o.liveIs(built.packageHash).catch(() => undefined);
    }
    if (live === false) {
      const restored = await restore();
      // the build pointer must not stay on a package that was never published
      if (restored) await o.build().catch((e) => log(`[${o.siteId}] could not rebuild the restored site: ${(e as Error).message}`));
      return fail(revision, "publish", error, restored);
    }
    if (live === undefined) {
      const message = resultMessage(scrub(`publish failed and the routing pointer could not be read back, so it is unknown whether the hostname serves the new package: ${(error as Error).message}`));
      log(`[${o.siteId}] UNVERIFIED: ${message} — the generated files are kept, nothing is reported; run again`);
      return { status: "unverified", revision, message };
    }
    log(`[${o.siteId}] the publish reported "${resultMessage(scrub((error as Error).message))}" but the routing pointer names the new package → verifying the public site`);
  }

  // ---- verify ----
  // A removed record is verified by the slug the export says it was public under (GET → 404). The one
  // case that URL cannot answer 404: another record of this export now serves the same slug — then the
  // old record is gone exactly when that record's page is confirmed.
  const servedBySlug = new Map(plan.projects.map((p) => [p.slug, p.id] as const));
  const absentTargets = plan.removing.filter((r) => !servedBySlug.has(r.slug));
  const superseded = plan.removing.filter((r) => servedBySlug.has(r.slug));
  let outcome: VerifyOutcome;
  try {
    outcome = await o.verify({
      base: o.verifyBase,
      present: plan.projects.map((p) => ({ ...p, files: built.files.records[p.id] ?? [] })),
      absent: absentTargets,
      ...(built.files.list ? { list: built.files.list } : {}),
      expectPortfolioVersion: built.portfolioVersion,
    });
  } catch (error) {
    return fail(revision, "verify", error, false);
  }
  if (outcome.errors.length > 0) {
    // the package is (probably) live and the public site simply could not be asked: that is not a failure to report
    const message = `${outcome.errors.length} request(s) got no answer from ${o.verifyBase}: ${resultMessage(outcome.errors[0]!)}`;
    log(`[${o.siteId}] UNVERIFIED: ${message} — nothing is reported; run again`);
    return { status: "unverified", revision, message };
  }
  if (outcome.manifest && !outcome.manifest.ok) {
    return fail(revision, "verify", new Error(`${outcome.manifest.url} reports portfolio version ${outcome.manifest.got}, the package just built carries ${outcome.manifest.expected} — the public URL does not serve this package`), false);
  }
  if (outcome.list && !outcome.list.ok) {
    return fail(revision, "verify", new Error(`${outcome.list.url} is not the listing page of the package just built (served ${outcome.list.got.slice(0, 12)}…, built ${outcome.list.expected.slice(0, 12)}…) — the public URL does not serve this package`), false);
  }
  if (plan.projects.length + plan.removing.length > 0 && outcome.present.length + outcome.absent.length === 0) {
    const first = outcome.unconfirmed[0];
    return fail(revision, "verify", new Error(`nothing could be confirmed on ${o.verifyBase}${first ? ` (e.g. ${first.url} answered ${first.got}${first.detail ? `: ${first.detail}` : ""}, expected ${first.expected})` : ""}`), false);
  }
  for (const u of outcome.unconfirmed) log(`[${o.siteId}] NOT CONFIRMED ${u.id}: ${u.url} answered ${u.got}${u.detail ? ` (${u.detail})` : ""}, expected ${u.expected}`);
  const absentIds = new Set([...outcome.absent, ...superseded.filter((r) => outcome.present.includes(servedBySlug.get(r.slug)!)).map((r) => r.id)]);

  const result: Extract<PortfolioResult, { outcome: "succeeded" }> = {
    schema: RESULT_SCHEMA,
    revision,
    outcome: "succeeded",
    packageHash: built.packageHash,
    ...(built.portfolioVersion !== undefined ? { portfolioVersion: built.portfolioVersion } : {}),
    verified: { present: outcome.present, absent: plan.removing.map((r) => r.id).filter((id) => absentIds.has(id)) },
  };
  const unconfirmed = [...outcome.unconfirmed.map((u) => u.id), ...superseded.filter((r) => !absentIds.has(r.id)).map((r) => r.id)];
  return { status: "succeeded", revision, complete: unconfirmed.length === 0, result, unconfirmed, ...(await report(result)) };
}

/** Cycles one after another until the source has nothing newer (bounded; never two at once). */
export async function runSync(o: SyncOptions, maxCycles = 5): Promise<CycleResult[]> {
  const results: CycleResult[] = [];
  for (let i = 0; i < maxCycles; i++) {
    const r = await runCycle(o);
    results.push(r);
    if (!("again" in r) || !r.again) break;
  }
  return results;
}

// ------------------------------------------------------------ watch: backoff ----

export interface FailureMemory {
  contentHash: string;
  /** stage + local message of the failure */
  signature: string;
  failures: number;
  /** the same content is not processed again before this instant */
  until: number;
}
export const BACKOFF_CAP_MS = 10 * 60 * 1000;

/**
 * Watch mode. After a failure BoostChat raises the desired revision, so a naive poll would run the whole
 * cycle (and report the same failure) every interval, forever. The failure is remembered by the export's
 * CONTENT: the same content is retried on an exponential schedule only (base · 2ⁿ, capped at 10 minutes);
 * new content, or a success, clears the memory at once.
 */
export function nextFailureMemory(previous: FailureMemory | undefined, result: CycleResult, nowMs: number, baseMs: number): FailureMemory | undefined {
  if (result.status === "backing-off") return previous;
  if (result.status !== "failed" || !result.contentHash) return undefined;
  const signature = `${result.stage}: ${result.message}`;
  const failures = previous && previous.contentHash === result.contentHash && previous.signature === signature ? previous.failures + 1 : 1;
  return { contentHash: result.contentHash, signature, failures, until: nowMs + Math.min(BACKOFF_CAP_MS, baseMs * 2 ** (failures - 1)) };
}

// ------------------------------------------------- the existing build / publish ----

/** The EXISTING site build; the package identity is read from its build record (also when up to date), the bytes to verify from the package itself. */
export async function buildForSync(o: { repoRoot: string; siteId: string; log?: (line: string) => void }): Promise<BuildOutcome> {
  const res = await buildSite({ repoRoot: o.repoRoot, siteId: o.siteId, log: o.log });
  const packageDir = path.resolve(o.repoRoot, res.packageDir);
  const record = JSON.parse(await readFile(path.join(packageDir, "build-record.json"), "utf8")) as BuildRecord;
  const portfolioVersion = record.integration?.resources.portfolio?.version;

  const site = path.join(packageDir, "site");
  const hashOf = async (rel: string, required: boolean): Promise<string | undefined> => {
    try {
      return sha256(await readFile(path.join(site, rel)));
    } catch {
      if (required) throw new Error(`the built package ${record.packageHash.slice(0, 12)}… has no ${rel}`);
      return undefined;
    }
  };
  const { snapshot } = await buildSiteSnapshot({ repoRoot: o.repoRoot, siteId: o.siteId, mode: "public", at: new Date().toISOString() });
  const publicPathOf = new Map(snapshot.assets.map((a) => [a.id, a.publicPath] as const));
  const records: Record<string, ExpectedFile[]> = {};
  for (const p of snapshot.content.projects) {
    const page = detailPath(p.slug);
    const files: ExpectedFile[] = [{ path: page, sha256: (await hashOf(`${page.slice(1)}.html`, true))! }];
    const cover = publicPathOf.get(p.cover.asset);
    if (cover) files.push({ path: cover, sha256: (await hashOf(cover.replace(/^\/+/, ""), true))! });
    records[p.id] = files;
  }
  const listHash = await hashOf(`${LIST_PATH.slice(1)}.html`, false);
  return { status: res.status, packageHash: record.packageHash, ...(portfolioVersion !== undefined ? { portfolioVersion } : {}), files: { ...(listHash ? { list: { path: LIST_PATH, sha256: listHash } } : {}), records } };
}

/** The EXISTING publish of exactly the package just built, with site:publish's own guards. */
export function publishForSync(o: { repoRoot: string; siteId: string; hostname: string; store: ObjectStore; requireOriginMatch: boolean; log?: (line: string) => void }) {
  return async (expectPackageHash: string): Promise<void> => {
    const r = await publishSite({ repoRoot: o.repoRoot, siteId: o.siteId, hostname: o.hostname, store: o.store, expectPackageHash, requireOriginMatch: o.requireOriginMatch, log: o.log });
    if (r.status !== "published") throw new Error(`publish ended as "${r.status}"`);
  };
}

/** Which package does the hostname's routing pointer name? (read-only) */
export function liveIsFor(store: ObjectStore, hostname: string) {
  return async (packageHash: string): Promise<boolean | undefined> => {
    const raw = await store.get(routingKey(normalizeHostname(hostname)));
    if (!raw) return false;
    try {
      const pointer = JSON.parse(Buffer.from(raw).toString("utf8")) as { packageHash?: unknown };
      return typeof pointer.packageHash === "string" ? pointer.packageHash === packageHash : undefined;
    } catch {
      return undefined;
    }
  };
}
