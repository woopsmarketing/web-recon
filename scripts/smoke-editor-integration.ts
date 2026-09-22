/**
 * smoke:editor-integration — Task 28, the ENABLEMENT SEAM closed end to end.
 *
 * Two builders worked behind a file boundary: one shipped the region/route
 * enablement ENGINE, the other shipped the Visual Editor and left the toggle
 * unwired. This suite tests the JOIN, and only the join: everything it asserts
 * is a property of the operator journey, not of either half in isolation.
 *
 *   §1  the engine is authoritative — which artifact is evaluated, and what a
 *       refusal turns into for the UI (no browser)
 *   §2  the operator journey, driven end to end in a REAL Chromium against the
 *       REAL editor UI and a REAL authoring preview of the real linear.app
 *       template: open → select site → select route → click an element → edit
 *       text → toggle a Region off → see it vanish → toggle a Route off → see
 *       it leave the navigation → attempt REFUSED operations → read the reason
 *       → Undo → see the restore
 *   §3  the preview sync's own properties: idempotent by plan signature, and a
 *       workspace left dirty by a killed session self-heals
 *
 * WHAT IS NOT MOCKED: the release project, the Recon Template (3,079 slots /
 * 9,929 bindings), the page-regions compile, the enablement engine, the
 * authoring preview (`next start` behind the real proxy), the editor server,
 * the bridge, and the browser. Region ids are DISCOVERED by asking the engine
 * which regions it allows and which it refuses, so the suite cannot drift into
 * asserting a hard-coded id that stopped meaning what it meant.
 *
 * WRITES: one release project (data/linear.app/release-projects/
 * wr28-editor-integration, recreated per run) and one authoring preview
 * (…/authoring-previews/wr28-editor-integration, kept warm between runs).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Frame, type Page } from "playwright";

import {
  clearEnablementInputsCache,
  enablementInputsFor,
  pageRegionsBinding,
  refusalView,
  resolveSiteEnablement,
  syncPreviewEnablement,
  toggleRegion,
  type RefusalView,
} from "../src/editor/enablement.js";
import { commitEdits, undoLastRevision, EDITOR_REDO_POLICY } from "../src/editor/commit.js";
import { RELEASE_REGION_ENABLEMENT } from "../src/editor/region-enablement.js";
import { loadEditorSite, startVisualEditor, type EditorSite, type VisualEditorSession } from "../src/editor/index.js";
import { evaluateRegionDisable, evaluateRouteDisable } from "../src/release/enablement.js";
import { hashAuthoredState, loadRevisionChain, type AuthoredRevision } from "../src/release/revisions.js";
import { loadReleaseProject } from "../src/release/store.js";

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log(`\n== ${title}`);
}

const SOURCE_PROJECT = path.join("data", "linear.app", "release-projects", "wr28-brand-assets");
const PROJECT = path.join("data", "linear.app", "release-projects", "wr28-editor-integration");
const PREVIEW_DIR = path.join("data", "linear.app", "authoring-previews", "wr28-editor-integration");
/**
 * STRIPE — the ONLY lineage on disk whose route table is many-to-one.
 *
 * F3, named in the Task 28 contract: on linear.app no page is served by two
 * routes, so the `shared-page-blast-radius` refusal the linear journey shows
 * actually comes from a multi-page GLOBAL region — a DIFFERENT rule that
 * happens to produce the same code. stripe.com carries two genuine
 * route -> pageSourceId groups (p000012 and p000013), and this is the template
 * a page-regions compile exists for, so the many-to-one refusal can be driven
 * through the real UI here and nowhere else.
 */
const STRIPE_SOURCE_PROJECT = path.join(
  "data",
  "stripe.com",
  "release-projects",
  "stripe.com-2026-08-19T06-36-35-798Z",
);
const STRIPE_PROJECT = path.join("data", "stripe.com", "release-projects", "wr28-int-stripe");
const STRIPE_PREVIEW_DIR = path.join("data", "stripe.com", "authoring-previews", "wr28-int-stripe");

const HOME_PAGE = "p000001";
const ROUTE_OFF = "/pricing";
/** A 2-slot anchor on the home page: navigation.href + navigation.label. */
const NAV_NODE = "n000027";
const TEXT_KEY = "global.header.nav.customers.label";

async function makeScratchProject(
  source = SOURCE_PROJECT,
  target = PROJECT,
  id = "wr28-editor-integration",
  displayName = "WR28 Editor Integration",
): Promise<void> {
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  const projectFile = path.join(target, "release-project.json");
  const project = JSON.parse(await readFile(projectFile, "utf8")) as Record<string, unknown>;
  project.siteId = id;
  project.projectId = id;
  project.displayName = displayName;
  await writeFile(projectFile, JSON.stringify(project, null, 2));
  const requirementsFile = path.join(target, "requirements.json");
  if (existsSync(requirementsFile)) {
    const requirements = JSON.parse(await readFile(requirementsFile, "utf8")) as Record<string, unknown>;
    requirements.projectId = id;
    await writeFile(requirementsFile, JSON.stringify(requirements, null, 2));
  }
  // A project written before the revision chain shipped has no `revisions/`
  // directory at all (the stripe pilot project is one) — an absent chain is
  // the legacy state, not an error, so it is skipped rather than created.
  const revisions = path.join(target, "revisions");
  if (!existsSync(revisions)) return;
  for (const entry of await readdir(revisions)) {
    const file = path.join(revisions, entry, "revision.json");
    if (!existsSync(file)) continue;
    const revision = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    revision.siteId = id;
    await writeFile(file, JSON.stringify(revision, null, 2));
  }
}

async function revisionCount(projectDir = PROJECT): Promise<number> {
  return (await loadRevisionChain(projectDir)).length;
}
async function authoredNow(projectDir = PROJECT): Promise<{
  disabledRegions: Record<string, unknown>;
  disabledRoutes: Record<string, unknown>;
  pageRegionsDir: string | undefined;
}> {
  const { project } = await loadReleaseProject(projectDir);
  return {
    disabledRegions: project.authored.disabledRegions ?? {},
    disabledRoutes: project.authored.disabledRoutes ?? {},
    pageRegionsDir: project.auxiliary.pageRegionsDir,
  };
}

async function previewFrame(page: Page, previewBase: string): Promise<Frame> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const frame = page.frames().find((candidate) => candidate.url().startsWith(previewBase));
    if (frame !== undefined) {
      try {
        await frame.waitForSelector("[data-wr-viewport]", { timeout: 1_000 });
        return frame;
      } catch {
        /* still loading */
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error("preview frame never became ready");
}

async function gotoRoute(page: Page, previewBase: string, routePath: string): Promise<Frame> {
  await page.selectOption("#wr-route", routePath);
  await page.waitForFunction(
    (expected) => (document.getElementById("wr-frame") as HTMLIFrameElement).src === expected,
    previewBase + routePath,
  );
  return previewFrame(page, previewBase);
}

async function panelText(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById("wr-panel")?.textContent ?? "");
}
/** The refusal container — deliberately NOT #wr-panel, which re-renders. */
async function refusalText(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById("wr-refusals")?.textContent ?? "");
}
async function refusalCodes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("#wr-refusals [data-wr-refusal-code]")).map(
      (node) => node.getAttribute("data-wr-refusal-code") ?? "",
    ),
  );
}
async function waitForRefusal(page: Page, code: string, timeout = 30_000): Promise<boolean> {
  try {
    await page.waitForSelector(`#wr-refusals [data-wr-refusal-code="${code}"]`, { timeout });
    return true;
  } catch {
    return false;
  }
}
async function leftRailText(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById("wr-left")?.textContent ?? "");
}
async function waitForPanel(page: Page, needle: string, timeout = 20_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (text) => (document.getElementById("wr-panel")?.textContent ?? "").includes(text),
      needle,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the Region tab and click the toggle of exactly ONE region.
 *
 * Keyed on the toggle's own `data-wr-region-toggle`, never on row text: region
 * ids nest (`…>a:1` is a prefix of `…>a:1>span:2`), and a text filter silently
 * clicks the wrong section — which is how the first run of this suite reported
 * a missing refusal that the engine had in fact produced for another region.
 */
async function clickRegionToggle(page: Page, regionId: string): Promise<void> {
  await page.click("#wr-tab-region");
  const toggle = page.locator(`#wr-panel [data-wr-region-toggle="${regionId}"]`).first();
  await toggle.waitFor({ state: "visible", timeout: 30_000 });
  await toggle.click();
}

/**
 * Toggle a route from the Pages rail and wait for the PROJECT ON DISK to move.
 *
 * The rail is re-rendered from scratch on every refresh and each toggle button
 * closes over the enabled-ness it was rendered with, so a click dispatched
 * during a re-render can carry the previous intent. Waiting on the rail's own
 * attribute therefore proves only what the rail last painted. The authored
 * state is the authority, so the wait is on that; a click that did not take
 * times out here and FAILS the check that follows instead of passing on a
 * stale read.
 */
async function toggleRouteFromRail(page: Page, routePath: string, enable: boolean): Promise<boolean> {
  await page
    .locator(`#wr-pages [data-wr-route="${routePath}"][data-wr-route-enabled="${enable ? "no" : "yes"}"]`)
    .first()
    .waitFor({ state: "visible", timeout: 120_000 });
  await page.click(`#wr-pages [data-wr-route="${routePath}"] [data-wr-route-toggle="${routePath}"]`);
  for (let attempt = 0; attempt < 600; attempt++) {
    const recorded = (await authoredNow()).disabledRoutes[routePath] !== undefined;
    if (recorded !== enable) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/** Wait for the status line to report a COMPLETED enablement write. */
async function waitForStatus(page: Page, pattern: RegExp, timeout = 120_000): Promise<string> {
  await page.waitForFunction(
    (source) => new RegExp(source).test(document.getElementById("wr-status")?.textContent ?? ""),
    pattern.source,
    { timeout },
  );
  return page.evaluate(() => document.getElementById("wr-status")?.textContent ?? "");
}

/** Click a remedy button by the LABEL this integration's refusalView emits. */
async function clickRemedy(page: Page, labelFragment: string): Promise<boolean> {
  const button = page.locator("#wr-refusals button", { hasText: labelFragment }).first();
  try {
    await button.waitFor({ state: "visible", timeout: 5_000 });
    await button.click();
    return true;
  } catch {
    return false;
  }
}

async function get(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  return { status: response.status, body: await response.text() };
}

async function main(): Promise<void> {
  if (!existsSync(SOURCE_PROJECT)) throw new Error(`fixture missing: ${SOURCE_PROJECT}`);
  await makeScratchProject();
  clearEnablementInputsCache();

  // -------------------------------------------------------------------------
  section("1. the engine is authoritative — artifact binding and refusal shape");
  // -------------------------------------------------------------------------
  const site: EditorSite = await loadEditorSite(PROJECT);
  const binding = pageRegionsBinding(site);
  check(
    "28.P8.1 a project with no auxiliary.pageRegionsDir is not silently evaluated against the newest compile on disk — the editor says it will ADOPT one",
    binding.projectRef === null &&
      binding.discoveredFile !== null &&
      binding.note.includes("adopt") &&
      binding.note.includes("BUILD"),
    `projectRef=${String(binding.projectRef)} discovered=${String(binding.discoveredFile)}`,
  );

  const inputs = await enablementInputsFor(site);
  const onHome = [...inputs.regionById.values()].filter((region) =>
    region.pages.some((page) => page.pageSourceId === HOME_PAGE),
  );
  const allowedRegions: Array<{ id: string; elements: number; nodes: Map<string, string> }> = [];
  const refusedBy = new Map<string, RefusalView[]>();
  for (const region of onHome) {
    const decision = evaluateRegionDisable(
      { regionId: region.regionId, scope: "routes", routes: ["/"] },
      inputs,
    );
    if (decision.allowed) {
      const occurrences = region.pages.find((page) => page.pageSourceId === HOME_PAGE)?.occurrences ?? [];
      allowedRegions.push({
        id: region.regionId,
        elements: region.elementCount,
        nodes: new Map(occurrences.map((o) => [o.viewport, o.nodeId])),
      });
      continue;
    }
    refusedBy.set(region.regionId, decision.refusals.map(refusalView));
  }
  allowedRegions.sort((a, b) => (b.elements - a.elements) || (a.id < b.id ? -1 : 1));

  const withCode = (code: string): Array<[string, RefusalView[]]> =>
    [...refusedBy].filter(([, views]) => views.some((view) => view.code === code)).sort(([a], [b]) => (a < b ? -1 : 1));
  const globalRefused = withCode("global-region-requires-explicit-global");
  const sharedRefused = withCode("shared-page-blast-radius");
  const cutRefused = withCode("interaction-cut-target-disabled");
  const unreachableRefused = withCode("interaction-cut-target-unreachable");

  check(
    "28.P8.2 every refusal path this suite drives is REAL on these artifacts — allowed and refused regions, by code, from the engine itself",
    allowedRegions.length > 0 &&
      globalRefused.length > 0 &&
      sharedRefused.length > 0 &&
      cutRefused.length > 0 &&
      unreachableRefused.length > 0,
    `${onHome.length} regions on ${HOME_PAGE}: ${allowedRegions.length} allowed; refused — global ${globalRefused.length}, ` +
      `shared-page ${sharedRefused.length}, interaction-cut ${cutRefused.length}, unreachable ${unreachableRefused.length}`,
  );

  const remedyKind = (code: string, views: RefusalView[]): string =>
    views.find((view) => view.code === code)?.remedy.kind ?? "(absent)";
  check(
    "28.P8.3 a refusal becomes exactly ONE offer, derived from the engine's own cascade — and `none` when no re-issue can be safe",
    remedyKind("global-region-requires-explicit-global", globalRefused[0][1]) === "retry-global" &&
      remedyKind("shared-page-blast-radius", sharedRefused[0][1]) === "retry-all-routes" &&
      remedyKind("interaction-cut-target-disabled", cutRefused[0][1]) === "retry-with-cascade" &&
      remedyKind("interaction-cut-target-unreachable", unreachableRefused[0][1]) === "none",
    `${remedyKind("global-region-requires-explicit-global", globalRefused[0][1])} / ` +
      `${remedyKind("shared-page-blast-radius", sharedRefused[0][1])} / ` +
      `${remedyKind("interaction-cut-target-disabled", cutRefused[0][1])} / ` +
      `${remedyKind("interaction-cut-target-unreachable", unreachableRefused[0][1])}`,
  );

  const TARGET_REGION = allowedRegions[0];
  const GLOBAL_REGION = globalRefused[0][0];
  const CUT_REGION = cutRefused[0][0];
  const CUT_CASCADE = cutRefused[0][1].find((view) => view.code === "interaction-cut-target-disabled")!;
  console.log(`  target region  ${TARGET_REGION.id} (${TARGET_REGION.elements} elements, ${[...TARGET_REGION.nodes].map(([v, n]) => `${v}:${n}`).join(" ")})`);
  console.log(`  global region  ${GLOBAL_REGION}`);
  console.log(`  cut region     ${CUT_REGION} → cascade ${CUT_CASCADE.remedy.cascadeRegionIds?.join(", ") ?? ""}`);

  const routeDecision = evaluateRouteDisable([ROUTE_OFF], inputs, site.project.authored.slotValues);
  console.log(
    `  route ${ROUTE_OFF}: allowed=${routeDecision.allowed} navCascade groups=${routeDecision.navCascade.length} ` +
      `anchors=${routeDecision.navCascade.reduce((total, item) => total + item.nodes.length, 0)} deadLinks=${routeDecision.deadLinks.length}`,
  );

  const globalEngineRefusals = evaluateRegionDisable(
    { regionId: GLOBAL_REGION, scope: "routes", routes: ["/"] },
    inputs,
  ).refusals;
  const globalEngineCodes = globalEngineRefusals.map((refusal) => refusal.code).sort();
  console.log(`  engine refusals for ${GLOBAL_REGION} scoped to "/": ${globalEngineCodes.join(", ")}`);

  // ---------------------------------------------------------------------------
  section("1b. F1 — Undo walks BACK one authored state per press (no browser)");
  // ---------------------------------------------------------------------------
  //
  // The measured defect this replaces: `undoLastRevision` restored
  // `chain[length - 2]` unconditionally, so the SECOND press restored the state
  // the FIRST press had undone and the operator ping-ponged between two states
  // forever. The fix resolves the operator's position THROUGH the restore
  // records already on the chain, so the target of press N is the record
  // immediately before the state press N-1 landed on.
  //
  // This runs at module level, on the same scratch project the browser journey
  // then uses, and it is written so the project is left EXACTLY as it was found:
  // three edits, three undos, and the authored hash back to its starting value.
  const undoStart = await loadRevisionChain(PROJECT);
  const undoStartHash = hashAuthoredState((await loadReleaseProject(PROJECT)).project.authored);
  const walkValues = ["WR28 되돌리기 A", "WR28 되돌리기 B", "WR28 되돌리기 C"];
  const walkStates: Array<{ revisionId: string; hash: string }> = [];
  for (const value of walkValues) {
    const commit = await commitEdits(
      PROJECT,
      [{ op: "set-slot-value", slotKey: TEXT_KEY, value }],
      `undo-walk fixture: ${value}`,
    );
    walkStates.push({
      revisionId: commit.revision?.revisionId ?? "(none)",
      hash: hashAuthoredState(commit.authored),
    });
  }
  check(
    "28.P8.26 the walk fixture is REAL: three distinct authored states, three appended revisions, three distinct hashes",
    walkStates.length === 3 &&
      (await revisionCount()) === undoStart.length + 3 &&
      new Set(walkStates.map((state) => state.hash)).size === 3 &&
      !walkStates.some((state) => state.hash === undoStartHash),
    `${undoStart.length} → ${await revisionCount()} revisions; ${walkStates.map((state) => state.revisionId).join(", ")}`,
  );

  // Expected authored state after press 1, 2, 3: the state BEFORE each edit —
  // C→B, B→A, A→the state the project started in.
  const expectedAfterUndo = [walkStates[1].hash, walkStates[0].hash, undoStartHash];
  const undoSteps: Array<{
    ok: boolean;
    detail: string;
    grewByOne: boolean;
    prefixIntact: boolean;
    originRestore: boolean;
  }> = [];
  for (let press = 0; press < 3; press++) {
    const before = await loadRevisionChain(PROJECT);
    const result = await undoLastRevision(PROJECT);
    const after = await loadRevisionChain(PROJECT);
    const authoredHash = hashAuthoredState((await loadReleaseProject(PROJECT)).project.authored);
    const head = after[after.length - 1];
    undoSteps.push({
      ok: result.undone && authoredHash === expectedAfterUndo[press],
      grewByOne: after.length === before.length + 1,
      prefixIntact: JSON.stringify(after.slice(0, before.length)) === JSON.stringify(before),
      originRestore: head.origin === "restore" && head.restoredFrom !== null,
      detail:
        `press ${press + 1}: undone=${result.undone} restoredFrom=${String(result.restoredFrom)} ` +
        `cursor=${String(result.cursorRevisionId)} remaining=${result.remainingUndos} ` +
        `chain ${before.length}→${after.length} hash ${authoredHash.slice(0, 12)} ` +
        `expected ${expectedAfterUndo[press].slice(0, 12)}`,
    });
  }
  check(
    "28.P8.27 F1 FIXED: three Undos step back three authored states — after press N the authored state is the one that existed N edits ago, never a toggle between two",
    undoSteps.every((step) => step.ok),
    undoSteps.map((step) => step.detail).join(" | "),
  );
  check(
    "28.P8.28 …and every press is APPEND-ONLY: the chain grew by exactly one, every earlier record is byte-identical, and each new head is an origin=restore record",
    undoSteps.every((step) => step.grewByOne && step.prefixIntact && step.originRestore) &&
      (await revisionCount()) === undoStart.length + 6,
    `${undoStart.length} → ${await revisionCount()} (3 edits + 3 restores, nothing removed)`,
  );
  const walkEndHash = hashAuthoredState((await loadReleaseProject(PROJECT)).project.authored);
  const exhausted = await undoLastRevision(path.join(PROJECT, "does-not-exist"));
  check(
    "28.P8.29 the walk is closed and the Redo decision is DOCUMENTED, not silently absent: there is no Redo, and a project with no chain says so instead of throwing",
    walkEndHash === undoStartHash &&
      EDITOR_REDO_POLICY.includes("There is no Redo") &&
      exhausted.undone === false &&
      exhausted.remainingUndos === 0 &&
      exhausted.reason.includes("no authored revisions"),
    `end hash ${walkEndHash.slice(0, 12)} vs start ${undoStartHash.slice(0, 12)}; empty-chain reason "${exhausted.reason}"`,
  );

  // ---------------------------------------------------------------------------
  section("1c. the seam — `route` reaches the engine, and the widening guard is readable");
  // ---------------------------------------------------------------------------
  //
  // MEASURED DEFECT: `RegionEnablementWriteRequest` had no `route` field, so
  // `server.ts` forwarded none and every HTTP write reached the engine with
  // `route: undefined`. The engine's `widenedToBlastRadius` — whose own comment
  // says it exists because "a silent widening is exactly the failure" — could
  // therefore never be true on the UI path, and was dropped at the adapter
  // anyway. All three requests below are REFUSED (the subject is a global
  // region), so nothing is written by any of them.
  const seamRegion = GLOBAL_REGION;
  const seamRadius = [
    ...new Set((inputs.regionById.get(seamRegion)?.pages ?? []).flatMap((page) => page.routes)),
  ].sort();
  const seamNoRoute = await RELEASE_REGION_ENABLEMENT.write(site, {
    regionId: seamRegion,
    enabled: false,
  });
  const seamRouteOnly = await RELEASE_REGION_ENABLEMENT.write(site, {
    regionId: seamRegion,
    enabled: false,
    route: "/",
  });
  const seamRoutesOnly = await RELEASE_REGION_ENABLEMENT.write(site, {
    regionId: seamRegion,
    enabled: false,
    routes: ["/"],
  });
  const requested = (result: { refusals: RefusalView[] }): string =>
    JSON.stringify([...new Set(result.refusals.flatMap((refusal) => refusal.requestedRoutes))].sort());
  check(
    "28.P8.30 a write that names NO route is adjudicated over the region's WHOLE blast radius, and the widening is REPORTED through the adapter rather than computed and dropped",
    seamRadius.length > 1 &&
      seamNoRoute.widenedToBlastRadius === true &&
      requested(seamNoRoute) === JSON.stringify(seamRadius) &&
      seamNoRoute.refusals.length > 0 &&
      seamNoRoute.changed === false,
    `radius ${seamRadius.length} route(s), widened=${seamNoRoute.widenedToBlastRadius}, requested=${requested(seamNoRoute)}`,
  );
  check(
    "28.P8.31 `route` REACHES THE ENGINE: naming only the route the operator is looking at scopes the adjudication to that one route and clears the widening flag",
    seamRouteOnly.widenedToBlastRadius === false &&
      requested(seamRouteOnly) === JSON.stringify(["/"]) &&
      seamRouteOnly.changed === false,
    `widened=${seamRouteOnly.widenedToBlastRadius} requested=${requested(seamRouteOnly)}`,
  );
  check(
    "28.P8.32 …and the explicit one-element `routes` list the client also sends is adjudicated identically — two spellings of one intent, neither of them silent",
    requested(seamRoutesOnly) === requested(seamRouteOnly) &&
      JSON.stringify(seamRoutesOnly.refusals.map((refusal) => refusal.code).sort()) ===
        JSON.stringify(seamRouteOnly.refusals.map((refusal) => refusal.code).sort()) &&
      seamRoutesOnly.changed === false,
    `route-only ${requested(seamRouteOnly)} vs routes-only ${requested(seamRoutesOnly)}`,
  );
  check(
    "28.P8.33 none of the three seam probes wrote anything: no revision, no authored decision",
    (await revisionCount()) === undoStart.length + 6 &&
      Object.keys((await authoredNow()).disabledRegions).length === 0,
    `revisions ${await revisionCount()} (expected ${undoStart.length + 6})`,
  );

  // -------------------------------------------------------------------------
  section("2. the operator journey, in a real browser");
  // -------------------------------------------------------------------------
  let editor: VisualEditorSession | null = null;
  const browser = await chromium.launch();
  try {
    editor = await startVisualEditor({ projectDir: PROJECT, previewDir: PREVIEW_DIR });
    const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    await page.goto(editor.baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __wrEditor?: unknown }).__wrEditor !== undefined);
    await previewFrame(page, editor.previewBaseUrl);

    check(
      "28.P8.4 open editor → select site: the operator's project is the open Site, on an origin the preview is not served from",
      new URL(editor.baseUrl).port !== new URL(editor.previewBaseUrl).port &&
        (await page.inputValue("#wr-site")).includes("wr28-editor-integration"),
      `${editor.baseUrl} / ${editor.previewBaseUrl} / ${await page.inputValue("#wr-site")}`,
    );

    let frame = await gotoRoute(page, editor.previewBaseUrl, "/");
    check(
      "28.P8.5 select route: the preview shows the chosen route and the Regions rail lists the regions compiled for its page",
      frame.url() === `${editor.previewBaseUrl}/` && (await leftRailText(page)).includes("Regions"),
      frame.url(),
    );

    // ---- click an element → edit text → save -------------------------------
    await page.click("#wr-select-mode");
    const anchor = page
      .frameLocator("#wr-frame")
      .locator(`[data-wr-viewport='desktop'] [data-wr-node='${NAV_NODE}']`)
      .first();
    await anchor.waitFor({ state: "attached", timeout: 20_000 });
    await anchor.dispatchEvent("click");
    await waitForPanel(page, "slots");
    if ((await panelText(page)).includes("This element renders")) {
      await page.locator("#wr-panel .row", { hasText: TEXT_KEY }).first().click();
    }
    const inspectorOpen = await waitForPanel(page, "rendered bindings");
    check(
      "28.P8.6 click an element: the Slot inspector opens on the slot that element renders",
      inspectorOpen && (await panelText(page)).includes(TEXT_KEY),
      (await panelText(page)).slice(0, 160),
    );

    const revisionsBeforeText = await revisionCount();
    const textValue = `WR28 통합 ${Date.now()}`;
    await page.locator("#wr-panel textarea").first().fill(textValue);
    await page.click("#wr-panel button.on");
    await page.waitForFunction(
      () => (document.getElementById("wr-status")?.textContent ?? "").startsWith("saved"),
      undefined,
      { timeout: 20_000 },
    );
    const homeAfterText = await get(`${editor.previewBaseUrl}/`);
    check(
      "28.P8.7 edit text → Save: the value is served by the preview and the save appended exactly ONE revision",
      homeAfterText.body.includes(textValue) && (await revisionCount()) === revisionsBeforeText + 1,
      `served=${homeAfterText.body.includes(textValue)} revisions ${revisionsBeforeText} → ${await revisionCount()}`,
    );

    // ---- REFUSAL: a global region, scoped to one route ----------------------
    const revisionsBeforeRefusals = await revisionCount();
    await clickRegionToggle(page, GLOBAL_REGION);
    const sawGlobal = await waitForRefusal(page, "global-region-requires-explicit-global");
    const globalPanel = await refusalText(page);
    const globalView = globalRefused[0][1].find(
      (view) => view.code === "global-region-requires-explicit-global",
    )!;
    check(
      "28.P8.8 REFUSED (global region): the operator reads the engine's own sentence — the code, why it is global, and the offer to re-issue at the wider scope",
      sawGlobal &&
        globalPanel.includes("is GLOBAL for enablement purposes") &&
        globalPanel.includes('Re-issue the edit with scope "global"') &&
        globalPanel.includes(globalView.remedy.label),
      globalPanel.slice(0, 260),
    );
    const sharedView = (refusedBy.get(GLOBAL_REGION) ?? []).find(
      (view) => view.code === "shared-page-blast-radius",
    );
    check(
      "28.P8.9 REFUSED (shared page): the SAME click also names every other route that would be physically changed, and offers the whole radius",
      sharedView !== undefined &&
        globalPanel.includes("shared-page-blast-radius") &&
        globalPanel.includes("would be physically changed too") &&
        sharedView.affectedRoutes.every((route) => globalPanel.includes(route)) &&
        globalPanel.includes(sharedView.remedy.label),
      `codes rendered: ${(await refusalCodes(page)).join(", ")} · ` +
        `${sharedView === undefined ? "no shared-page refusal" : sharedView.affectedRoutes.join(", ")}`,
    );
    // THE SYMPTOM THIS GUARDS AGAINST, VERBATIM: the UI once rendered ONE
    // refusal where the engine produced TWO, because the adapter dropped the
    // route the operator was looking at — and the operator was silently handed
    // an 8-route edit. The assertion is not "at least one refusal appeared":
    // it is that the rendered set EQUALS the set the engine produces for the
    // very same request, so a refusal that stops travelling fails here.
    const renderedGlobalCodes = (await refusalCodes(page)).sort();
    check(
      "28.P8.34 BOTH refusals travel: the codes rendered for the click are exactly the codes the engine produces for that request — not a subset, and never one where the engine said two",
      globalEngineCodes.length >= 2 &&
        JSON.stringify(renderedGlobalCodes) === JSON.stringify(globalEngineCodes),
      `rendered [${renderedGlobalCodes.join(", ")}] vs engine [${globalEngineCodes.join(", ")}]`,
    );

    // ---- REFUSAL: an interaction cut, and its cascade -----------------------
    await clickRegionToggle(page, CUT_REGION);
    const sawCut = await waitForRefusal(page, "interaction-cut-target-disabled");
    const cutPanel = await refusalText(page);
    check(
      "28.P8.10 REFUSED (interaction cut): the operator is told which ENABLED trigger drives the content this disable removes, and which region would have to go with it",
      sawCut &&
        cutPanel.includes("ENABLED interaction trigger") &&
        cutPanel.includes(String(CUT_CASCADE.detail.targetNodeId)) &&
        cutPanel.includes(CUT_CASCADE.remedy.label),
      cutPanel.slice(0, 260),
    );

    const tookCascade = await clickRemedy(page, "Disable it together with");
    const sawUnreachable = await waitForRefusal(page, "interaction-cut-target-unreachable");
    const cascadePanel = await refusalText(page);
    // The offered cascade does NOT end the adjudication: disabling the trigger
    // region is itself an edit, and the engine re-runs every rule over the
    // WHOLE transaction. What must hold is that the operator is not waved
    // through — the second answer is another refusal, and the hazard that no
    // cascade can fix offers no retry of its own.
    const unreachableRemedies = await page
      .locator('#wr-refusals [data-wr-refusal-code="interaction-cut-target-unreachable"] button[data-wr-remedy]')
      .count();
    const cascadeCodes = await refusalCodes(page);
    check(
      "28.P8.11 the cascade is NOT a rubber stamp: taking it re-adjudicates the whole transaction, and the hazard no cascade can fix is offered no retry",
      tookCascade &&
        sawUnreachable &&
        cascadePanel.includes("starts hidden and every trigger that could reveal it") &&
        cascadePanel.includes("No re-issue can make this safe") &&
        unreachableRemedies === 0,
      `${cascadeCodes.length} refusals after the cascade (${[...new Set(cascadeCodes)].join(", ")}), ` +
        `${unreachableRemedies} retry buttons on the unreachable ones`,
    );
    // F2, CARRIED FORWARD BY NAME AND NOT "FIXED". Accepting the offered
    // cascade re-adjudicates the WHOLE transaction, so the honest answer is a
    // fresh non-empty refusal set — not the comfortable zero a rubber stamp
    // would produce. The number is printed rather than hard-coded: what must
    // hold is that it is NOT zero, and that the operator was not waved through.
    check(
      "28.P8.35 F2 stands as measured: taking the cascade returns a NON-EMPTY refusal set — the transaction is re-adjudicated, not rubber-stamped — and this check must never be softened into `the cascade clears everything`",
      cascadeCodes.length > 0 && tookCascade,
      `${cascadeCodes.length} refusals after accepting the cascade: ${[...new Set(cascadeCodes)].join(", ")}`,
    );
    const afterRefusals = await authoredNow();
    check(
      "28.P8.12 three refusals wrote NOTHING: no authored decision, no revision, and the region still renders in the preview",
      (await revisionCount()) === revisionsBeforeRefusals &&
        Object.keys(afterRefusals.disabledRegions).length === 0 &&
        (await get(`${editor.previewBaseUrl}/`)).body.includes(`data-wr-node="${TARGET_REGION.nodes.get("desktop")}"`),
      `revisions ${revisionsBeforeRefusals} → ${await revisionCount()}, disabledRegions ${JSON.stringify(afterRefusals.disabledRegions)}`,
    );

    // ---- REGION TOGGLE: off, and gone from the preview ----------------------
    const homeBeforeRegion = await get(`${editor.previewBaseUrl}/`);
    const revisionsBeforeRegion = await revisionCount();
    await clickRegionToggle(page, TARGET_REGION.id);
    // "disabled" appears in the panel's own prose ("authored.disabledRegions
    // has no entry"), so the wait is keyed on the WRITE's own status sentence.
    const regionStatus = await waitForStatus(page, /^disabled \d+ region\(s\)/);
    const afterRegion = await authoredNow();
    check(
      "28.P8.13 toggle a Region off: exactly ONE revision, recorded through the same authored-state path a text edit uses",
      (await revisionCount()) === revisionsBeforeRegion + 1 &&
        afterRegion.disabledRegions[TARGET_REGION.id] !== undefined,
      `status "${regionStatus}" · revisions ${revisionsBeforeRegion} → ${await revisionCount()}, authored ${JSON.stringify(afterRegion.disabledRegions)}`,
    );
    check(
      "28.P8.14 …and the editor recorded the page-regions artifact on the PROJECT, so release:build resolves the disable against the same compile the editor evaluated",
      afterRegion.pageRegionsDir !== undefined &&
        path.resolve(path.join(afterRegion.pageRegionsDir, "page-regions.json")) ===
          path.resolve(binding.discoveredFile as string),
      `${String(afterRegion.pageRegionsDir)} vs ${String(binding.discoveredFile)}`,
    );
    const homeAfterRegion = await get(`${editor.previewBaseUrl}/`);
    const desktopRoot = TARGET_REGION.nodes.get("desktop") as string;
    check(
      "28.P8.15 SEE IT VANISH: the region root is gone from the served preview document, the rest of the page still renders",
      homeBeforeRegion.body.includes(`data-wr-node="${desktopRoot}"`) &&
        !homeAfterRegion.body.includes(`data-wr-node="${desktopRoot}"`) &&
        homeAfterRegion.body.length > 10_000 &&
        homeAfterRegion.body.includes("data-wr-node="),
      `${homeBeforeRegion.body.length} → ${homeAfterRegion.body.length} bytes, root ${desktopRoot}`,
    );

    // ---- ROUTE TOGGLE: off, gone from the navigation ------------------------
    const revisionsBeforeRoute = await revisionCount();
    const pricingBefore = await get(`${editor.previewBaseUrl}${ROUTE_OFF}`);
    const homeBeforeRoute = await get(`${editor.previewBaseUrl}/`);
    // THROUGH THE UI: the Pages rail's own toggle, not an API call.
    await page.click(`#wr-pages [data-wr-route-toggle="${ROUTE_OFF}"]`);
    await page.waitForFunction(
      (route) =>
        document.querySelector(`#wr-pages [data-wr-route="${route}"]`)?.getAttribute("data-wr-route-enabled") === "no",
      ROUTE_OFF,
      { timeout: 90_000 },
    );
    const routeStatus = await page.evaluate(() => document.getElementById("wr-status")?.textContent ?? "");
    const afterRoute = await authoredNow();
    check(
      "28.P8.16 toggle a Route off from the Pages rail: one revision, and the operator is told what the navigation cascade did rather than being shown a silent success",
      (await revisionCount()) === revisionsBeforeRoute + 1 &&
        afterRoute.disabledRoutes[ROUTE_OFF] !== undefined &&
        routeStatus.includes("navigation anchor"),
      `revisions ${revisionsBeforeRoute} → ${await revisionCount()} · status "${routeStatus}"`,
    );
    const pricingAfter = await get(`${editor.previewBaseUrl}${ROUTE_OFF}`);
    const homeAfterRoute = await get(`${editor.previewBaseUrl}/`);
    check(
      "28.P8.17 SEE IT LEAVE THE NAV: the route 404s in the preview — never redirected home — and no anchor to it survives on the pages that stay",
      pricingBefore.status === 200 &&
        pricingAfter.status === 404 &&
        homeBeforeRoute.body.includes(`href="${ROUTE_OFF}"`) &&
        !homeAfterRoute.body.includes(`href="${ROUTE_OFF}"`),
      `${pricingBefore.status} → ${pricingAfter.status}; home anchors ${homeBeforeRoute.body.includes(`href="${ROUTE_OFF}"`)} → ${homeAfterRoute.body.includes(`href="${ROUTE_OFF}"`)}`,
    );

    // ---- UNDO: three presses, three authored states back ---------------------
    //
    // The journey above stacked exactly three distinct authored states on the
    // chain — a text edit, a region disable, a route disable — so the three
    // presses below are a real operator walk, not a constructed fixture:
    //   press 1 -> the route decision is gone   (region still off, text edited)
    //   press 2 -> the region decision is gone  (text still edited)
    //   press 3 -> the text edit is gone
    const textStateHash = walkEndHash;
    const chainBeforeUndo = await revisionCount();
    const chainBeforeUndoRecords = await loadRevisionChain(PROJECT);
    await page.click("#wr-undo");
    await page.waitForFunction(
      () => (document.getElementById("wr-status")?.textContent ?? "").includes("restored"),
      undefined,
      { timeout: 60_000 },
    );
    await page.waitForTimeout(500);
    const chain = await loadRevisionChain(PROJECT);
    const undoneRoute = await authoredNow();
    const pricingRestored = await get(`${editor.previewBaseUrl}${ROUTE_OFF}`);
    const homeRestored = await get(`${editor.previewBaseUrl}/`);
    check(
      "28.P8.18 UNDO: the chain GREW by one restore record, the route decision is gone from the authored state, and the preview followed it back",
      chain.length === chainBeforeUndo + 1 &&
        chain[chain.length - 1].origin === "restore" &&
        undoneRoute.disabledRoutes[ROUTE_OFF] === undefined &&
        pricingRestored.status === 200 &&
        homeRestored.body.includes(`href="${ROUTE_OFF}"`),
      `chain ${chainBeforeUndo} → ${chain.length} (${chain[chain.length - 1].origin}), ${ROUTE_OFF} ${pricingRestored.status}`,
    );
    // MEASURED DEFECT, FIXED: Undo reloaded only the iframe, so the Pages rail
    // kept the reading the toggle had left in it and went on displaying OFF for
    // a route the undo had just restored — the preview told the truth and the
    // rail beside it did not. An operator reads the rail.
    const railAfterUndo = await page
      .locator(`#wr-pages [data-wr-route="${ROUTE_OFF}"]`)
      .first()
      .getAttribute("data-wr-route-enabled");
    check(
      "28.P8.45 the Undo is visible WHERE THE OPERATOR LOOKS: the Pages rail is re-read from the server after an Undo, so it shows the restored route as ON instead of keeping the state the toggle left in it",
      railAfterUndo === "yes",
      `rail says data-wr-route-enabled="${String(railAfterUndo)}" for ${ROUTE_OFF}`,
    );

    // F1 FIXED, THROUGH THE UI. The old implementation restored
    // `chain[length - 2]` on every press, so this second press put the route
    // decision straight back and the operator ping-ponged. It now steps back
    // one FURTHER authored state: the REGION decision goes, and the route the
    // first press restored stays restored.
    await page.click("#wr-undo");
    await page.waitForFunction(
      () => (document.getElementById("wr-status")?.textContent ?? "").includes("restored"),
      undefined,
      { timeout: 120_000 },
    );
    await page.waitForTimeout(800);
    const afterSecondUndo = await authoredNow();
    const pricingSecond = await get(`${editor.previewBaseUrl}${ROUTE_OFF}`);
    const homeSecond = await get(`${editor.previewBaseUrl}/`);
    check(
      "28.P8.19 Undo is an UNDO STACK, not a one-step toggle: the second press steps back one FURTHER authored state — the region decision goes, and the route the first press restored stays restored",
      afterSecondUndo.disabledRegions[TARGET_REGION.id] === undefined &&
        afterSecondUndo.disabledRoutes[ROUTE_OFF] === undefined &&
        pricingSecond.status === 200 &&
        homeSecond.body.includes(`data-wr-node="${desktopRoot}"`) &&
        (await loadRevisionChain(PROJECT)).length === chainBeforeUndo + 2,
      `routes ${JSON.stringify(Object.keys(afterSecondUndo.disabledRoutes))} regions ${JSON.stringify(Object.keys(afterSecondUndo.disabledRegions))} ${ROUTE_OFF} ${pricingSecond.status}`,
    );

    await page.click("#wr-undo");
    await page.waitForFunction(
      () => (document.getElementById("wr-status")?.textContent ?? "").includes("restored"),
      undefined,
      { timeout: 120_000 },
    );
    await page.waitForTimeout(800);
    const afterThirdUndo = await authoredNow();
    const homeThird = await get(`${editor.previewBaseUrl}/`);
    const projectAfterThird = (await loadReleaseProject(PROJECT)).project;
    check(
      "28.P8.36 the third press reaches the state BEFORE the text edit: the saved value is gone from the authored state and from the served preview, and the authored state hashes to the one the journey started from",
      projectAfterThird.authored.slotValues[TEXT_KEY] !== textValue &&
        !homeThird.body.includes(textValue) &&
        hashAuthoredState(projectAfterThird.authored) === textStateHash,
      `slot=${String(projectAfterThird.authored.slotValues[TEXT_KEY])} served=${homeThird.body.includes(textValue)} ` +
        `hash ${hashAuthoredState(projectAfterThird.authored).slice(0, 12)} vs ${textStateHash.slice(0, 12)}`,
    );

    const chainAfterThreeUndos = await loadRevisionChain(PROJECT);
    check(
      "28.P8.37 the three presses only ever GREW the chain: +3 records, every one of them origin=restore, and every record that existed before them is byte-identical afterwards",
      chainAfterThreeUndos.length === chainBeforeUndo + 3 &&
        chainAfterThreeUndos
          .slice(chainBeforeUndo)
          .every((revision: AuthoredRevision) => revision.origin === "restore" && revision.restoredFrom !== null) &&
        JSON.stringify(chainAfterThreeUndos.slice(0, chainBeforeUndo)) ===
          JSON.stringify(chainBeforeUndoRecords),
      `${chainBeforeUndo} → ${chainAfterThreeUndos.length}; new heads ` +
        chainAfterThreeUndos
          .slice(chainBeforeUndo)
          .map((revision: AuthoredRevision) => `${revision.revisionId}←${String(revision.restoredFrom)}`)
          .join(", "),
    );

    // The operator's own way back, through the same controls. The walk has
    // already re-enabled both, so the round trip is driven from the top: OFF
    // through the UI, then ON through the UI, for the route and the region.
    const routeOffAgain = await toggleRouteFromRail(page, ROUTE_OFF, false);
    const routeOnAgain = await toggleRouteFromRail(page, ROUTE_OFF, true);
    await clickRegionToggle(page, TARGET_REGION.id);
    await waitForStatus(page, /^disabled \d+ region\(s\)/);
    const revisionsBeforeReenable = await revisionCount();
    await clickRegionToggle(page, TARGET_REGION.id);
    await waitForStatus(page, /enabled again/);
    const homeRegionRestored = await get(`${editor.previewBaseUrl}/`);
    const pricingReenabled = await get(`${editor.previewBaseUrl}${ROUTE_OFF}`);
    const reEnabled = await authoredNow();
    check(
      "28.P8.20 TOGGLE BACK ON: re-enabling the region and the route through the same controls restores both in the preview, one revision each",
      routeOffAgain &&
        routeOnAgain &&
        reEnabled.disabledRegions[TARGET_REGION.id] === undefined &&
        reEnabled.disabledRoutes[ROUTE_OFF] === undefined &&
        homeRegionRestored.body.includes(`data-wr-node="${desktopRoot}"`) &&
        pricingReenabled.status === 200 &&
        (await revisionCount()) === revisionsBeforeReenable + 1,
      `route off→on ${routeOffAgain}/${routeOnAgain} · root served ${homeRegionRestored.body.includes(`data-wr-node="${desktopRoot}"`)} · ${ROUTE_OFF} ${pricingReenabled.status} · ` +
        `revisions ${revisionsBeforeReenable} → ${await revisionCount()}`,
    );

    check(
      "28.P8.25 the whole journey produced no uncaught runtime error in the editor document",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(" | "),
    );

    // -----------------------------------------------------------------------
    section("3. preview sync: idempotent, and self-healing");
    // -----------------------------------------------------------------------
    const runtime = editor.runtime();
    await runtime.refreshProject();
    const firstSync = await syncPreviewEnablement(runtime.site, runtime.session);
    const secondSync = await syncPreviewEnablement(runtime.site, runtime.session);
    check(
      "28.P8.21 the preview sync is idempotent by plan signature: with the authored state unchanged it copies nothing, applies nothing and does not restart the worker",
      secondSync.changed === false && secondSync.workerRestarted === false,
      `first changed=${firstSync.changed} second changed=${secondSync.changed}`,
    );

    const markerFile = path.join(PREVIEW_DIR, "overlay", "enablement-applied.json");
    const marker = JSON.parse(await readFile(markerFile, "utf8")) as Record<string, unknown>;
    await writeFile(markerFile, JSON.stringify({ ...marker, complete: false }, null, 2));
    const healing = await syncPreviewEnablement(runtime.site, runtime.session);
    check(
      "28.P8.22 a workspace left DIRTY by a killed session is repaired on the next sync rather than trusted",
      healing.changed === true && healing.restoredPristine === true,
      `changed=${healing.changed} restoredPristine=${healing.restoredPristine} ms=${healing.ms}`,
    );

    const resolvedNow = await resolveSiteEnablement(runtime.site);
    check(
      "28.P8.23 after the undos the project carries no enablement at all, and the resolver agrees",
      resolvedNow.plan.disabledRoutes.length === 0 &&
        resolvedNow.plan.disabledRegionIds.length === 0 &&
        resolvedNow.refusals.length === 0,
      JSON.stringify({
        routes: resolvedNow.plan.disabledRoutes,
        regions: resolvedNow.plan.disabledRegionIds,
        refusals: resolvedNow.refusals.length,
      }),
    );

    // A re-affirmed toggle is a NO-OP, exactly like a re-affirmed text value.
    const beforeNoop = await revisionCount();
    const noop = await toggleRegion(runtime.site, { regionId: TARGET_REGION.id, enabled: true });
    check(
      "28.P8.24 re-enabling an already-enabled region writes nothing and appends no revision — the same `changed` contract a text edit has",
      noop.changed === false && (await revisionCount()) === beforeNoop,
      `changed=${noop.changed} revisions ${beforeNoop} → ${await revisionCount()}`,
    );
  } finally {
    if (editor !== null) await editor.stop();
    await browser.close();
  }

  // The linear shape, measured, so §4 can CONTRAST it rather than assert the
  // contrast from memory: linear's `shared-page-blast-radius` refusal names
  // several pageSourceIds, because its blast radius comes from a region that
  // spans PAGES. stripe's names exactly one — the many-to-one case.
  const linearSharedPages = (() => {
    const view = (refusedBy.get(GLOBAL_REGION) ?? []).find(
      (candidate) => candidate.code === "shared-page-blast-radius",
    );
    return (view?.detail.pageSourceIds as string[] | undefined) ?? [];
  })();
  await stripeSharedPageJourney(linearSharedPages);

  console.log(`\n${checks} checks, ${failures} failures`);
  reapDescendants();
  process.exit(failures > 0 ? 1 : 0);
}

/**
 * REAP WHAT THIS SUITE SPAWNED — the whole tree, deepest first.
 *
 * MEASURED, ON THIS SUITE: `startApp` spawns `npx next start`, which spawns
 * `npm exec`, which spawns `next-server`. A SIGTERM aimed at the top of that
 * chain does not always reach the bottom, and a surviving worker holds this
 * process's event loop open — the run then sits on the Task-28 suite mutex
 * with every check already printed, and the worker it left behind ends up
 * PPID 1 listening on a port for the rest of the day. Both failure modes were
 * observed on this machine tonight.
 *
 * So the exit is explicit AND the tree is walked first: killing only this
 * process would convert a live child into exactly the orphan the contract
 * forbids. Nothing here can influence a result — it runs after the last check
 * and after the count is printed.
 */
function reapDescendants(): void {
  const collect = (pid: number, into: number[]): void => {
    let children: number[] = [];
    try {
      children = execFileSync("pgrep", ["-P", String(pid)], { encoding: "utf8" })
        .split("\n")
        .map((line) => Number(line.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
    } catch {
      return; // pgrep exits 1 when there are no children
    }
    for (const child of children) {
      collect(child, into);
      into.push(child);
    }
  };
  const descendants: number[] = [];
  collect(process.pid, descendants);
  if (descendants.length === 0) return;
  for (const pid of descendants) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  console.log(`  reaped ${descendants.length} surviving child process(es): ${descendants.join(", ")}`);
}


/**
 * §4 — F3: the route -> pageSourceId MANY-TO-ONE refusal, THROUGH THE UI.
 *
 * WHY THIS SECTION EXISTS AT ALL. §2 shows a `shared-page-blast-radius`
 * refusal on linear.app — but linear's route table is one-to-one (8 routes, 8
 * distinct pageSourceIds), so the refusal there is produced by a region that
 * spans several PAGES. That is rule 1 firing for a different reason, and it
 * left the actual many-to-one hazard — two routes physically loading the SAME
 * `pages/pNNNNNN.json`, so a disable aimed at one of them silently damages the
 * other — proven at ENGINE level only (smoke:enablement 28.P5.56-58) and never
 * in front of an operator.
 *
 * stripe.com is the one lineage on disk with that shape AND a page-regions
 * compile, so the journey runs there: pick a region that lives on exactly ONE
 * page which TWO enabled routes load, click its toggle while looking at one of
 * them, and read what the operator is actually shown.
 *
 * Nothing is hard-coded: the shared page, the region and both routes are
 * discovered from the route table and the engine, exactly as §1 does.
 */
async function stripeSharedPageJourney(linearSharedPages: string[]): Promise<void> {
  section("4. stripe: the route→page MANY-TO-ONE refusal, in front of the operator (F3)");
  if (!existsSync(STRIPE_SOURCE_PROJECT)) {
    console.log(
      `  SKIPPED — ${STRIPE_SOURCE_PROJECT} is not on this machine, so the only many-to-one lineage ` +
        "cannot be driven. F3 stays open and MUST be reported as open, not as passed.",
    );
    return;
  }
  await makeScratchProject(STRIPE_SOURCE_PROJECT, STRIPE_PROJECT, "wr28-int-stripe", "WR28 Stripe Shared Page");
  clearEnablementInputsCache();

  const stripe: EditorSite = await loadEditorSite(STRIPE_PROJECT);
  const routesByPage = new Map<string, string[]>();
  for (const route of stripe.routes) {
    routesByPage.set(route.pageId, [...(routesByPage.get(route.pageId) ?? []), route.path]);
  }
  const sharedPages = [...routesByPage].filter(([, routes]) => routes.length > 1);
  check(
    "28.P8.38 stripe's route table really is MANY-TO-ONE — the shape linear.app does not have, and the reason this section exists",
    sharedPages.length > 0 && sharedPages.every(([, routes]) => routes.length >= 2),
    `${stripe.routes.length} routes over ${routesByPage.size} pages; shared: ` +
      sharedPages.map(([pageId, routes]) => `${pageId}←${routes.length}`).join(", "),
  );

  const stripeInputs = await enablementInputsFor(stripe);
  if (stripeInputs.regions === null) {
    check(
      "28.P8.39 a page-regions compile matching this stripe template is on disk",
      false,
      `no compile matched templateId ${stripe.templateId}`,
    );
    return;
  }
  /**
   * WHAT MAKES A CANDIDATE PROVE THE MANY-TO-ONE CASE — and what does not.
   *
   * MEASURED, AND IT CHANGED THE TEST: there is NO region on this compile whose
   * only refusal is `shared-page-blast-radius`. All 128 single-page regions
   * that two routes load are ALSO global for enablement purposes — every one of
   * them by `signature-on-multiple-pages`, because stripe's 18 pages are cut
   * from the same layout family. So "the refusal arrives alone" is not
   * available on any lineage on disk and asserting it would be asserting a
   * fiction.
   *
   * The discriminator that IS available, and is exact: the shared-page
   * refusal's own `detail.pageSourceIds`. On linear that list has MANY entries
   * — the blast radius comes from a region spanning several PAGES. Here it has
   * exactly ONE, and the radius is still two routes: two routes loading one
   * page file. That is the many-to-one hazard and nothing else can produce it.
   *
   *   - exactly ONE pageSourceId, loaded by TWO OR MORE routes
   *   - naming one route is refused with `shared-page-blast-radius`
   *   - no interaction-cut refusal, so the remedy path stays about rule 1
   *   - `scope: "global"` is ALLOWED, so an offered remedy actually exists and
   *     the physical damage can be shown rather than argued
   */
  const candidates: Array<{
    regionId: string;
    pageSourceId: string;
    routes: string[];
    elementCount: number;
    slotCount: number;
    nodeIds: Map<string, string>;
  }> = [];
  for (const region of stripeInputs.regionById.values()) {
    const pageIds = [...new Set(region.pages.map((page) => page.pageSourceId))];
    if (pageIds.length !== 1) continue;
    const onPage = region.pages[0];
    const routes = [...new Set(onPage.routes)].sort();
    if (routes.length < 2) continue;
    const refusals = evaluateRegionDisable(
      { regionId: region.regionId, scope: "routes", routes: [routes[0]] },
      stripeInputs,
    ).refusals;
    const codes = refusals.map((refusal) => refusal.code);
    if (!codes.includes("shared-page-blast-radius")) continue;
    if (codes.some((code) => code.startsWith("interaction-cut"))) continue;
    if (!evaluateRegionDisable({ regionId: region.regionId, scope: "global" }, stripeInputs).allowed) continue;
    const shared = refusals.find((refusal) => refusal.code === "shared-page-blast-radius");
    if (shared === undefined) continue;
    if ((shared.detail.pageSourceIds as string[]).length !== 1) continue;
    candidates.push({
      regionId: region.regionId,
      pageSourceId: pageIds[0],
      routes,
      elementCount: region.elementCount,
      slotCount: region.slotKeys.length,
      nodeIds: new Map(onPage.occurrences.map((occurrence) => [occurrence.viewport, occurrence.nodeId])),
    });
  }
  candidates.sort(
    (a, b) => b.slotCount - a.slotCount || b.elementCount - a.elementCount || (a.regionId < b.regionId ? -1 : 1),
  );
  const subject = candidates[0];
  check(
    "28.P8.39 the many-to-one case is DISTINGUISHABLE from the multi-page one on the artifacts themselves: this refusal names ONE pageSourceId and TWO routes, where linear's names several pageSourceIds — same code, different hazard",
    subject !== undefined &&
      subject.routes.length >= 2 &&
      subject.nodeIds.get("desktop") !== undefined &&
      linearSharedPages.length > 1,
    subject === undefined
      ? `${candidates.length} candidates among ${stripeInputs.regionById.size} regions`
      : `stripe ${subject.regionId} — 1 page (${subject.pageSourceId}) × ${subject.routes.length} routes, ` +
        `${subject.elementCount} elements / ${subject.slotCount} slots; linear's same-code refusal spans ` +
        `${linearSharedPages.length} pageSourceIds`,
  );
  if (subject === undefined) return;

  const viewed = subject.routes[0];
  const others = subject.routes.slice(1);
  const desktopNode = subject.nodeIds.get("desktop") as string;
  const engineRefusal = evaluateRegionDisable(
    { regionId: subject.regionId, scope: "routes", routes: [viewed] },
    stripeInputs,
  ).refusals.map(refusalView);

  let stripeEditor: VisualEditorSession | null = null;
  const stripeBrowser = await chromium.launch();
  try {
    stripeEditor = await startVisualEditor({ projectDir: STRIPE_PROJECT, previewDir: STRIPE_PREVIEW_DIR });
    const page = await stripeBrowser.newPage({ viewport: { width: 1680, height: 1000 } });
    await page.goto(stripeEditor.baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __wrEditor?: unknown }).__wrEditor !== undefined);
    await previewFrame(page, stripeEditor.previewBaseUrl);
    const frame = await gotoRoute(page, stripeEditor.previewBaseUrl, viewed);

    const otherRouteEnabled = await page.evaluate(
      (routes) =>
        routes.every(
          (route) =>
            document.querySelector(`#wr-pages [data-wr-route="${route}"]`)?.getAttribute("data-wr-route-enabled") ===
            "yes",
        ),
      others,
    );
    const beforeViewed = await get(`${stripeEditor.previewBaseUrl}${viewed}`);
    const beforeOther = await get(`${stripeEditor.previewBaseUrl}${others[0]}`);
    check(
      "28.P8.40 the hazard is REAL before the click: the other route sharing this pageSourceId is ENABLED, and both routes serve the very same region root node",
      otherRouteEnabled &&
        beforeViewed.status === 200 &&
        beforeOther.status === 200 &&
        beforeViewed.body.includes(`data-wr-node="${desktopNode}"`) &&
        beforeOther.body.includes(`data-wr-node="${desktopNode}"`),
      `${viewed} ${beforeViewed.status}/${beforeViewed.body.includes(`data-wr-node="${desktopNode}"`)} · ` +
        `${others[0]} ${beforeOther.status}/${beforeOther.body.includes(`data-wr-node="${desktopNode}"`)} · ` +
        `frame ${frame.url()}`,
    );

    const revisionsBefore = await revisionCount(STRIPE_PROJECT);
    await clickRegionToggle(page, subject.regionId);
    const sawShared = await waitForRefusal(page, "shared-page-blast-radius", 60_000);
    const panel = await refusalText(page);
    const renderedCodes = (await refusalCodes(page)).sort();
    const sharedRefusalView = engineRefusal.find((view) => view.code === "shared-page-blast-radius");
    check(
      "28.P8.41 F3 CLOSED: the operator clicking a region on a page that TWO routes load is shown the shared-page refusal, and it NAMES the other route that would be physically changed",
      sawShared &&
        others.every((route) => panel.includes(route)) &&
        panel.includes(subject.pageSourceId) &&
        panel.includes("would be physically changed too"),
      `codes [${renderedCodes.join(", ")}] · panel ${panel.slice(0, 240)}`,
    );
    check(
      "28.P8.42 …and what the operator reads is the whole engine answer: the rendered set equals the engine's set exactly, the shared-page refusal names ONE pageSourceId (the many-to-one hazard, not a multi-page region), and its own remedy is offered",
      JSON.stringify(renderedCodes) === JSON.stringify(engineRefusal.map((view) => view.code).sort()) &&
        sharedRefusalView !== undefined &&
        (sharedRefusalView.detail.pageSourceIds as string[]).length === 1 &&
        sharedRefusalView.affectedRoutes.length === subject.routes.length &&
        panel.includes(sharedRefusalView.remedy.label),
      `rendered [${renderedCodes.join(", ")}] vs engine [${engineRefusal.map((view) => view.code).sort().join(", ")}]; ` +
        `pageSourceIds ${JSON.stringify(sharedRefusalView?.detail.pageSourceIds)} affected ${JSON.stringify(sharedRefusalView?.affectedRoutes)}`,
    );
    const refusedState = await authoredNow(STRIPE_PROJECT);
    check(
      "28.P8.43 the refusal wrote NOTHING: no revision, no authored decision, and both routes still serve the region",
      (await revisionCount(STRIPE_PROJECT)) === revisionsBefore &&
        Object.keys(refusedState.disabledRegions).length === 0 &&
        (await get(`${stripeEditor.previewBaseUrl}${others[0]}`)).body.includes(`data-wr-node="${desktopNode}"`),
      `revisions ${revisionsBefore} → ${await revisionCount(STRIPE_PROJECT)}, ` +
        `disabledRegions ${JSON.stringify(Object.keys(refusedState.disabledRegions))}`,
    );

    // Taking an offered remedy is what makes the refusal HONEST rather than
    // merely loud: the operator accepts, and the other route physically
    // changes — exactly what they were warned about.
    //
    // WHICH offer, and why not the rule-1 one: this region is ALSO global for
    // enablement purposes (signature-on-multiple-pages — see the candidate
    // note above), so re-issuing at "all routes in the radius" is still
    // refused by rule 2. The offer that can succeed is the global one, and it
    // removes exactly the same nodes: the region id is namespaced by
    // pageSourceId, so `scope: "global"` on `p0000NN:rgn:…` still touches only
    // that one page — which is precisely the page BOTH routes load.
    const took = await clickRemedy(page, "Disable it everywhere");
    await waitForStatus(page, /^disabled \d+ region\(s\)/, 180_000);
    const afterViewed = await get(`${stripeEditor.previewBaseUrl}${viewed}`);
    const afterOther = await get(`${stripeEditor.previewBaseUrl}${others[0]}`);
    const acceptedState = await authoredNow(STRIPE_PROJECT);
    check(
      "28.P8.44 accepting the offered radius does what the warning said: ONE revision, the decision recorded over both routes, and the region gone from BOTH — the many-to-one damage the refusal existed to disclose",
      took &&
        (await revisionCount(STRIPE_PROJECT)) === revisionsBefore + 1 &&
        acceptedState.disabledRegions[subject.regionId] !== undefined &&
        !afterViewed.body.includes(`data-wr-node="${desktopNode}"`) &&
        !afterOther.body.includes(`data-wr-node="${desktopNode}"`) &&
        afterOther.status === 200 &&
        afterOther.body.length > 10_000,
      `took=${took} revisions ${revisionsBefore} → ${await revisionCount(STRIPE_PROJECT)} · ` +
        `${viewed} ${afterViewed.body.length}b node=${afterViewed.body.includes(`data-wr-node="${desktopNode}"`)} · ` +
        `${others[0]} ${afterOther.status} ${afterOther.body.length}b node=${afterOther.body.includes(`data-wr-node="${desktopNode}"`)}`,
    );
  } finally {
    if (stripeEditor !== null) await stripeEditor.stop();
    await stripeBrowser.close();
  }
}

main().catch((error) => {
  console.error("smoke:editor-integration failed —", error);
  process.exit(1);
});
