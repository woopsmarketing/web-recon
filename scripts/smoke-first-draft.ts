/**
 * pnpm smoke:first-draft — Task 28 Phase 10 (INTEGRATION).
 *
 * ONE JOURNEY, END TO END, THROUGH THE REAL OPERATOR APP:
 *
 *   Template Library -> Create Site -> ONE natural-language Brief
 *     -> COMPLETE FIRST DRAFT -> Edit Site
 *
 * Everything here runs against the REAL thing: the real Visual Editor server,
 * the real HTTP endpoints its own browser client calls, a real Chromium
 * driving the real UI, the real linear.app Recon Template (3,079 slots) and a
 * real production compile. There is no mock library, no stubbed create call and
 * no synthetic template.
 *
 * The customer is FICTIONAL AND INDEPENDENT: Millwright, a B2B AI workflow
 * company for discrete manufacturing. It is not the source site reworded — the
 * brief is at docs/result/handoffs/28-intel/phase10-brief.json and every value
 * the draft writes is composed from it.
 *
 *   §1  route scope: structure-only routes are NOT given generated content
 *       (measured on the real route-policy template, which really has 10)
 *   §2  the journey, in a browser: Library -> Create -> First Draft -> Edit
 *   §3  the per-route accounting table, re-derived from the run's own rows
 *   §4  the Site Library row, and Edit Site opening the new site
 *
 * WRITES: one release project (data/linear.app/release-projects/
 * wr28-first-draft, recreated per run), its content run / production spec /
 * production build, one structure-only content run under stripe.com, and one
 * seed project the editor is opened on. Nothing else under data/ is touched;
 * the two templates involved are proven byte-identical before and after.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Frame, type Page } from "playwright";

import {
  BriefContentGenerator,
  valueShapeIsFactBearing,
  valueShapeOf,
  executeGenerationBatches,
  ingestGenerationResult,
  loadContentRun,
  loadReconTemplate,
  prepareContentRun,
  type ContentBrief,
} from "../src/content-injection/index.js";
import { hashDirectory } from "../src/production/hash.js";
import { selectRouteScope, summarizeFirstDraft, type FirstDraftSummary } from "../src/release/index.js";
import { loadEditorSite, startVisualEditor, type VisualEditorSession } from "../src/editor/index.js";
import { scanSites } from "../src/registry/scan.js";

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HOST = "linear.app";
const TEMPLATE_DIR = path.join("data", HOST, "recon-templates", "2026-08-25T21-53-26-980Z");
const TEMPLATE_MANIFEST = path.join(TEMPLATE_DIR, "manifest.json");
/** The one real template on disk that carries a route policy with structure-only routes. */
const POLICY_TEMPLATE_DIR = path.join("data", "stripe.com", "recon-templates", "2026-08-26T22-38-06-075Z");
/** The route the Phase 8 build proved a binding-count heuristic gets WRONG. */
const SHARED_PAGE_STRUCTURE_ONLY = "/resources/more/virtual-credit-cards-for-businesses-explained";

/**
 * The editor is opened on an EXISTING project, read-only, and this suite does
 * NOT copy one to make a seed. A straight `cp` of a release project carries its
 * recorded `projectId` with it, so the copy and the original report the SAME
 * `siteKey` — which `SiteEntrySchema` documents as the one key guaranteed
 * unique. (Measured during this build: `wr28-verifier-authored` already
 * collides with `wr28-assets-stage` on disk for exactly that reason. Reported,
 * not fixed here.)
 */
const SEED_PROJECT = path.join("data", HOST, "release-projects", "wr28-brand-assets");
/** Derived by createSite from the brief's working name — see siteIdFromWorkingName. */
const NEW_SITE_ID = "millwright";
const NEW_PROJECT = path.join("data", HOST, "release-projects", NEW_SITE_ID);
/** Written into NEW_PROJECT after this suite creates it. Its ABSENCE means the
 *  project on disk belongs to somebody else and must not be deleted. */
const FIXTURE_MARKER = ".wr28-first-draft-fixture";
const PREVIEW_DIR = path.join("data", HOST, "authoring-previews", "wr28-first-draft-preview");
const BRIEF_FILE = path.join("docs", "result", "handoffs", "28-intel", "phase10-brief.json");
const STRUCTURE_ONLY_RUN = path.join("data", "stripe.com", "content-runs", "wr28-p10-structure-only");

/** The measured facts this suite hands the handoff document. */
interface Measured {
  createSiteMs?: number;
  editorStartupMs?: number;
  previewStartMs?: number;
  openNewSiteMs?: number;
  firstDraft?: FirstDraftSummary;
  briefGaps?: { field: string; consequence: string }[];
  contentProvider?: string;
  consistency?: { pass: boolean; errors: number; warnings: number };
  routeScope?: Record<string, number>;
  structureOnly?: { total: number; included: number; excluded: number; generatedSlotsOnExcluded: number };
  sourceBrandResidual?: {
    /** Field names say WHICH population they count — the verifier found the
     *  old `writtenValuesCarryingSourceBrand: 0` was a TEXT-only figure while
     *  8 written url values did carry the token. */
    writtenTextValuesCarryingSourceBrand: number;
    writtenUrlValuesCarryingSourceBrand: number;
    writtenUrlValuesFlaggedInBrandLeakReport: number;
    textSlotsStillCarryingSourceBrand: number;
    allOfThemReviewFlagged: boolean;
  };
  valueShapedSlots?: {
    shapedTextSlots: number;
    overwrittenWithCopy: number;
    factBearingNamedNeedsInput: number;
  };
  renderedRoutes?: {
    route: string;
    chars: number;
    routeSpecificValuesChecked: number;
    routeSpecificValuesRendered: number;
    example: string;
  }[];
  /** true when this run had to materialize a preview workspace (cold start). */
  previewMaterialized?: boolean;
}
const measured: Measured = {};

async function loadBrief(): Promise<ContentBrief> {
  const raw = JSON.parse(await readFile(BRIEF_FILE, "utf8")) as Record<string, unknown>;
  delete raw["_note"];
  return raw as ContentBrief;
}

/**
 * The preview frame showing EXACTLY `url`.
 *
 * Matching on a prefix is not enough and this is not a hypothetical: the first
 * run of this suite matched `startsWith(origin)`, got the previous route's
 * frame back three times, and reported three "different" pages with byte-
 * identical text (8,147 characters each). A per-route check that silently
 * measures one page is worse than no check, so the URL is compared exactly.
 */
async function frameAt(page: Page, url: string): Promise<Frame> {
  const wanted = [url, `${url}/`];
  for (let attempt = 0; attempt < 600; attempt++) {
    const frame = page.frames().find((candidate) => wanted.includes(candidate.url()));
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
  throw new Error(`preview frame for ${url} never became ready`);
}

async function frameText(frame: Frame): Promise<string> {
  return frame.evaluate(() => document.body.innerText);
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const brief = await loadBrief();
  const workingName = brief.workingName ?? "";

  // =========================================================================
  section("1. route scope — a structure-only route never becomes a generated page");
  // =========================================================================
  {
    const policyTemplate = await loadReconTemplate(path.join(POLICY_TEMPLATE_DIR, "manifest.json"));
    const scope = selectRouteScope(policyTemplate);
    measured.structureOnly = {
      total: scope.counts.total,
      included: scope.counts.included,
      excluded: scope.counts.excludedStructureOnly,
      generatedSlotsOnExcluded: -1,
    };
    check(
      "int.structureOnlyRespected — the real route-policy template splits 20 routes into 10 generated / 10 structure-only",
      scope.counts.total === 20 && scope.counts.included === 10 && scope.counts.excludedStructureOnly === 10,
      JSON.stringify(scope.counts),
    );
    check(
      "int.structureOnlyRespected — the SHARED-PAGE structure-only route is excluded (the case a slot-count heuristic gets wrong)",
      scope.excludedStructureOnlyRoutes.includes(SHARED_PAGE_STRUCTURE_ONLY) &&
        !scope.includedRoutes.includes(SHARED_PAGE_STRUCTURE_ONLY),
    );

    // Now the part that was never measured before: run the REAL content stage
    // over that scope and prove the excluded routes get NOTHING — no units, no
    // page plan, no slot value, no accounting row.
    const policyHashBefore = (await hashDirectory(POLICY_TEMPLATE_DIR)).hash;
    await rm(STRUCTURE_ONLY_RUN, { recursive: true, force: true });
    const prepared = await prepareContentRun({
      templateManifestFile: path.join(POLICY_TEMPLATE_DIR, "manifest.json"),
      rawIntent: brief.goal ?? "",
      routes: scope.includedRoutes,
      brief,
      outputDir: STRUCTURE_ONLY_RUN,
    });
    const run = await loadContentRun(prepared.runDir);
    const execution = await executeGenerationBatches({
      runId: run.manifest.runId,
      intent: run.intent,
      policy: run.policy,
      unitsFile: run.unitsFile,
      request: run.request,
      generator: new BriefContentGenerator(),
    });
    const outcome = await ingestGenerationResult(run, execution.result);
    const excluded = new Set(scope.excludedStructureOnlyRoutes);
    const unitsOnExcluded = run.unitsFile.units.filter((u) => u.route !== undefined && excluded.has(u.route));
    const accountingOnExcluded = outcome.accounting.entries.filter(
      (entry) => entry.route !== undefined && excluded.has(entry.route),
    );
    const plansOnExcluded = (execution.result.sitePlan.pagePlans ?? []).filter((p) => excluded.has(p.route));
    measured.structureOnly.generatedSlotsOnExcluded = accountingOnExcluded.length;
    check(
      "int.structureOnlyRespected — content generation produced ZERO units, ZERO slot rows and ZERO page plans for the 10 structure-only routes",
      unitsOnExcluded.length === 0 && accountingOnExcluded.length === 0 && plansOnExcluded.length === 0,
      JSON.stringify({
        units: unitsOnExcluded.length,
        rows: accountingOnExcluded.length,
        plans: plansOnExcluded.length,
      }),
    );
    const draft = summarizeFirstDraft({
      accounting: outcome.accounting,
      overlay: outcome.overlay,
      changed: outcome.changed,
      structureOnlyRoutes: scope.excludedStructureOnlyRoutes,
    });
    check(
      "int.structureOnlyRespected — the First Draft summary LISTS every structure-only route instead of hiding it, and gives it no row",
      draft.structureOnlyRoutes.length === 10 &&
        draft.rows.every((row) => !excluded.has(row.route)) &&
        draft.rows.some((row) => row.route === "/"),
      JSON.stringify({ listed: draft.structureOnlyRoutes.length, rows: draft.rows.length }),
    );
    // …and they are still REAL ROUTES of the reconstructed app: excluded from
    // generation is not excluded from the site.
    const routeMap = JSON.parse(
      await readFile(path.join(POLICY_TEMPLATE_DIR, "app", "reconstruction-data", "route-map.json"), "utf8"),
    ) as { routes: { path: string }[] };
    const served = new Set(routeMap.routes.map((r) => r.path));
    check(
      "int.structureOnlyRespected — every structure-only route is still SERVED by the reconstructed app (excluded from generation, not from the site)",
      scope.excludedStructureOnlyRoutes.every((route) => served.has(route)),
    );
    check(
      "int.structureOnlyRespected — the route-policy template is byte-identical after the content stage read it",
      (await hashDirectory(POLICY_TEMPLATE_DIR)).hash === policyHashBefore,
    );
  }

  // =========================================================================
  section("2. the journey: Library -> Create Site -> First Draft -> Edit Site");
  // =========================================================================
  const templateHashBefore = (await hashDirectory(TEMPLATE_DIR)).hash;
  // Re-runnable: the site this journey creates is removed first, so a rerun
  // proves creation rather than re-preparation.
  //
  // HAZARD FIX (Task 28 Phase 11 correction, verifier finding V6). NEW_SITE_ID
  // is derived by createSite from the brief's working name, so this suite
  // owns a FIXED path under release-projects/ — exactly the fixed-fixture
  // shape that makes two concurrent smoke-release runs destroy each other.
  // A blind `rm` here already destroyed a shipped evidence project once: a
  // regression run of this suite overwrote Phase 9/10's `millwright` project
  // (its revision chain came back as r000 only). The suite still starts from
  // a clean slate — it just refuses to DELETE a project it did not create.
  // Anything without this suite's own marker is MOVED aside, outside
  // release-projects/ so the registry never sees the copy.
  if (existsSync(NEW_PROJECT) && !existsSync(path.join(NEW_PROJECT, FIXTURE_MARKER))) {
    const preserved = path.join(
      "data",
      HOST,
      "suite-fixture-backups",
      `${NEW_SITE_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
    await mkdir(path.dirname(preserved), { recursive: true });
    await rename(NEW_PROJECT, preserved);
    console.log(
      `  NOTE  ${NEW_PROJECT} was NOT created by this suite (no ${FIXTURE_MARKER}); preserved at ${preserved} instead of deleted`,
    );
  } else {
    await rm(NEW_PROJECT, { recursive: true, force: true });
  }

  const editorStart = Date.now();
  const editor: VisualEditorSession = await startVisualEditor({
    projectDir: SEED_PROJECT,
    previewDir: PREVIEW_DIR,
    title: "WR28 first-draft journey",
  });
  measured.editorStartupMs = Date.now() - editorStart;
  measured.previewStartMs = editor.previewStartMs;
  // Whether this run paid for a preview build at all. A warm number reported as
  // if it were a cold one would be a fabricated startup time.
  measured.previewMaterialized = editor.materialized;

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const jsErrors: string[] = [];
  try {
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
    context.on("console", (message) => {
      if (message.type() === "error") jsErrors.push(message.text().slice(0, 300));
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => jsErrors.push(error.message.slice(0, 300)));

    // The Create Site response is the operator's own receipt. Captured from the
    // wire, so the numbers checked below are the ones the UI was handed.
    let createResponse: Record<string, unknown> | undefined;
    page.on("response", (response) => {
      if (response.url().endsWith("/api/create-site") && response.status() === 200) {
        void response
          .json()
          .then((body: Record<string, unknown>) => {
            createResponse = body;
          })
          .catch(() => undefined);
      }
    });

    await page.goto(`${editor.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.getElementById("wr-route") as HTMLSelectElement)?.options.length > 0);

    // ---- open the Template Library ----------------------------------------
    await page.click("#wr-library-open");
    await page.waitForFunction(() => document.querySelectorAll("#wr-lib-templates tbody tr").length > 0);
    const templateRows = await page.$$eval("#wr-lib-templates tbody tr", (rows) =>
      rows.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? "")),
    );
    const templateRow = templateRows.findIndex((cells) => cells[0].includes("linear.app-2026-08-25T21-53-26-980Z"));
    check(
      "int.libraryToCreate — the Template Library lists the real template with its own route counts, and Create Site starts from that row",
      templateRow >= 0 && templateRows[templateRow][1] === HOST && templateRows[templateRow][2] === "8",
      JSON.stringify(templateRows[templateRow] ?? templateRows.slice(0, 2)),
    );

    const row = page.locator("#wr-lib-templates tbody tr").nth(templateRow);
    await row.locator("button", { hasText: "Create Site" }).click();
    await row.locator(".wr-create-form.on").waitFor({ timeout: 5_000 });
    check(
      "int.libraryToCreate — the Create Site form asks for ONE brief: a goal, and optional fields it says are optional",
      (await row.locator(".wr-create-goal").count()) === 1 &&
        (await row.locator(".wr-create-optional").innerText()).includes("optional"),
    );

    // ---- ONE BRIEF ---------------------------------------------------------
    await row.locator(".wr-create-goal").fill(brief.goal ?? "");
    await row.locator(".wr-create-name").fill(workingName);
    await row.locator(".wr-create-category").fill(brief.category ?? "");
    await row.locator(".wr-create-audience").fill(brief.audience ?? "");
    await row.locator(".wr-create-positioning").fill(brief.positioning ?? "");
    await row.locator(".wr-create-conversion").fill(brief.primaryConversion ?? "");
    await row.locator(".wr-create-tone").fill((brief.tone ?? []).join(", "));
    await row
      .locator(".wr-create-facts")
      .fill((brief.facts ?? []).map((fact) => `${fact.kind} | ${fact.value}`).join("\n"));

    const createStart = Date.now();
    await row.locator("button", { hasText: "Create" }).last().click();
    await page.waitForFunction(
      () => (document.querySelector(".wr-create-form.on .wr-create-result")?.textContent ?? "").startsWith("created "),
      undefined,
      { timeout: 900_000 },
    );
    measured.createSiteMs = Date.now() - createStart;
    // Claim the fixture: the next run of this suite may delete THIS project,
    // because this run is what put it there. Without the marker the next run
    // preserves whatever it finds instead (see the HAZARD FIX above).
    if (existsSync(NEW_PROJECT)) {
      await writeFile(
        path.join(NEW_PROJECT, FIXTURE_MARKER),
        `created by scripts/smoke-first-draft.ts at ${new Date().toISOString()}\n`,
        "utf8",
      );
    }
    // Two independent reads of the SAME receipt: the response body off the
    // wire, and the object the client kept. The wire read is asynchronous and
    // lost the race on a cold run, so the client's own copy is authoritative
    // and the two are then compared.
    const clientCopy = (await page.evaluate(
      () => (window as unknown as { __wrEditor?: { lastCreate?: Record<string, unknown> } }).__wrEditor?.lastCreate,
    )) as Record<string, unknown> | undefined;
    check(
      "int.briefToDraft — Create Site ran the real pipeline from ONE brief and returned a created site",
      clientCopy !== undefined && typeof clientCopy["siteKey"] === "string",
      JSON.stringify(Object.keys(clientCopy ?? {})),
    );
    check(
      "int.briefToDraft — the receipt the browser client kept is the same one that came back over the wire",
      createResponse === undefined ||
        JSON.stringify(createResponse["firstDraft"]) === JSON.stringify(clientCopy?.["firstDraft"]),
      createResponse === undefined ? "wire copy not captured in time; client copy used" : "identical",
    );
    const created = clientCopy as unknown as {
      siteKey: string;
      projectDir: string;
      releaseState: string;
      contentProvider: string;
      firstDraft: FirstDraftSummary;
      consistency: { pass: boolean; errors: number; warnings: number };
      briefGaps: { field: string; consequence: string }[];
      templateUnmutated: boolean;
      routeScope: Record<string, number>;
      reprepared: boolean;
      elapsedMs: number;
    };
    measured.firstDraft = created.firstDraft;
    measured.consistency = created.consistency;
    measured.briefGaps = created.briefGaps;
    measured.contentProvider = created.contentProvider;
    measured.routeScope = created.routeScope;

    check(
      "int.briefToDraft — the draft was written by the BRIEF-DRIVEN writer, not the filler provider",
      created.contentProvider === "brief-writer",
      created.contentProvider,
    );
    check(
      "int.libraryToCreate — the site id came from the BRIEF's working name, and a genuinely NEW project was created (not an existing one re-prepared)",
      created.siteKey === `${HOST}/${NEW_SITE_ID}` && created.reprepared === false,
      JSON.stringify({ siteKey: created.siteKey, reprepared: created.reprepared }),
    );
    check(
      "int.briefToDraft — the brief supplied every optional field, so the engine reported ZERO gaps and asked ZERO questions",
      created.briefGaps.length === 0,
      JSON.stringify(created.briefGaps.map((g) => g.field)),
    );
    check(
      "int.briefToDraft — the Template is byte-identical after Create Site (dir-sha256, no exclusions)",
      created.templateUnmutated && (await hashDirectory(TEMPLATE_DIR)).hash === templateHashBefore,
    );
    check(
      "int.briefToDraft — the cross-page review passes on the draft: the 8 pages belong to one site",
      created.consistency.pass && created.consistency.errors === 0,
      JSON.stringify(created.consistency),
    );

    // ---- the draft is RENDERED, not just written --------------------------
    await page.waitForSelector(".wr-create-form.on .wr-create-open", { timeout: 10_000 });
    const openStart = Date.now();
    await page.click(".wr-create-form.on .wr-create-open");
    await page.waitForFunction(
      (expected) => (document.getElementById("wr-status")?.textContent ?? "").includes(expected),
      `site ${HOST}/${NEW_SITE_ID}`,
      { timeout: 600_000 },
    );
    await page.waitForFunction(() => (document.getElementById("wr-route") as HTMLSelectElement)?.options.length > 0);
    measured.openNewSiteMs = Date.now() - openStart;

    const origin = await page.evaluate(
      () => new URL((document.getElementById("wr-frame") as HTMLIFrameElement).src).origin,
    );
    const homeFrame = await frameAt(page, `${origin}/`);
    const homeText = await frameText(homeFrame);
    check(
      "int.editSiteOpens — Edit Site opened the NEW site and its preview renders the GENERATED copy in a real browser",
      homeText.includes(workingName),
      `"${workingName}" in ${homeText.length} chars of rendered homepage text`,
    );

    // THE RESIDUAL IS NAMED, NOT HIDDEN. The source brand does still appear in
    // the rendered pages, and pretending otherwise would be the dishonest
    // version of this check. Every remaining occurrence must be a REVIEW-flagged
    // slot — the population the engine declares it never auto-writes — and NO
    // value the writer actually wrote may carry the source brand.
    const newSite = await loadEditorSite(NEW_PROJECT);
    const brandToken = "linear";
    const textSlots = [...newSite.index.slotByKey.values()].filter((slot) => slot.type === "text");
    const writtenWithBrand = textSlots.filter((slot) => {
      const written = newSite.contentSlotValues[slot.key];
      return typeof written === "string" && written.toLowerCase().includes(brandToken);
    });
    // THE URL HALF, which the first version of this check did not count. Seven
    // internal changelog/docs paths and one percent-encoded query really do
    // carry the token; reporting "0 written values carry the source brand"
    // while filtering to text overstated the scope. They are counted here and
    // every one of them must be FLAGGED by the run's own brand-leak scan —
    // which is what makes them disclosed rather than concealed. (The encoded
    // one was invisible to that scan until this pass taught it to decode.)
    const writtenUrlsWithBrand = [...newSite.index.slotByKey.values()].filter((slot) => {
      if (slot.type !== "url") return false;
      const written = newSite.contentSlotValues[slot.key];
      if (typeof written !== "string") return false;
      let decoded = written;
      try {
        decoded = decodeURIComponent(written);
      } catch {
        decoded = written;
      }
      return written.toLowerCase().includes(brandToken) || decoded.toLowerCase().includes(brandToken);
    });
    const brandLeakReport = JSON.parse(
      await readFile(path.join(newSite.contentRunDir ?? "", "report", "brand-leak.json"), "utf8"),
    ) as { warnings: { slotKey: string | null }[] };
    const brandLeakKeys = new Set(brandLeakReport.warnings.map((warning) => warning.slotKey ?? ""));
    const residual = textSlots.filter((slot) => {
      const effective = newSite.contentSlotValues[slot.key] ?? slot.defaultValue;
      return typeof effective === "string" && effective.toLowerCase().includes(brandToken);
    });
    measured.sourceBrandResidual = {
      writtenTextValuesCarryingSourceBrand: writtenWithBrand.length,
      writtenUrlValuesCarryingSourceBrand: writtenUrlsWithBrand.length,
      writtenUrlValuesFlaggedInBrandLeakReport: writtenUrlsWithBrand.filter((slot) => brandLeakKeys.has(slot.key)).length,
      textSlotsStillCarryingSourceBrand: residual.length,
      allOfThemReviewFlagged: residual.every((slot) => slot.editability === "review"),
    };
    check(
      "int.briefToDraft — NO text value the brief-driven writer wrote carries the source brand, and every text slot that still does is a review-flagged slot the engine declares human-required",
      writtenWithBrand.length === 0 && residual.length > 0 && residual.every((slot) => slot.editability === "review"),
      JSON.stringify(measured.sourceBrandResidual),
    );
    check(
      "int.briefToDraft — the URL half is counted too, and EVERY written url still carrying the source brand is flagged by the run's own brand-leak scan (the percent-encoded one included)",
      writtenUrlsWithBrand.length > 0 &&
        writtenUrlsWithBrand.every((slot) => brandLeakKeys.has(slot.key)),
      JSON.stringify({
        urls: writtenUrlsWithBrand.length,
        flagged: writtenUrlsWithBrand.filter((slot) => brandLeakKeys.has(slot.key)).length,
        unflagged: writtenUrlsWithBrand.filter((slot) => !brandLeakKeys.has(slot.key)).map((slot) => slot.key),
      }),
    );

    // The draft is not just the homepage: three more routes, each checked for
    // a value written FOR THAT ROUTE. A page-agnostic needle (the company name
    // is in the global header) would pass on any page, including the wrong one.
    const routeSamples: {
      route: string;
      chars: number;
      routeSpecificValuesChecked: number;
      routeSpecificValuesRendered: number;
      example: string;
    }[] = [];
    for (const route of ["/pricing", "/security", "/plan"]) {
      await page.selectOption("#wr-route", route);
      await page.waitForFunction(
        (expected) => (document.getElementById("wr-frame") as HTMLIFrameElement).src === expected,
        origin + route,
        { timeout: 60_000 },
      );
      const frame = await frameAt(page, origin + route);
      const text = await frameText(frame);
      const candidates = [...newSite.index.slotByKey.values()]
        .filter((slot) => {
          if (slot.route !== route || slot.type !== "text") return false;
          const written = newSite.contentSlotValues[slot.key];
          return typeof written === "string" && written.length >= 25 && written !== slot.defaultValue;
        })
        .slice(0, 40);
      const rendered = candidates.filter((slot) => text.includes(newSite.contentSlotValues[slot.key] as string));
      routeSamples.push({
        route,
        chars: text.length,
        routeSpecificValuesChecked: candidates.length,
        routeSpecificValuesRendered: rendered.length,
        example: rendered.length > 0 ? String(newSite.contentSlotValues[rendered[0]!.key]).slice(0, 60) : "",
      });
    }
    check(
      "int.multiRouteDraft — /pricing, /security and /plan each render copy written FOR THAT ROUTE (checked against that route's own slot keys, not a site-wide needle)",
      routeSamples.every((sample) => sample.routeSpecificValuesChecked > 0 && sample.routeSpecificValuesRendered > 0),
      JSON.stringify(routeSamples),
    );
    check(
      "int.multiRouteDraft — the three pages are genuinely three different documents (the prefix-matching bug this suite hit once)",
      new Set(routeSamples.map((sample) => sample.chars)).size === routeSamples.length,
      JSON.stringify(routeSamples.map((sample) => [sample.route, sample.chars])),
    );

    measured.renderedRoutes = routeSamples;

    // =======================================================================
    section("3. the per-route accounting table");
    // =======================================================================
    const draft = created.firstDraft;
    check(
      "int.accountingTable — the accounting read below is the one on the NEW project's own accepted lineage",
      newSite.contentRunDir !== null && path.basename(newSite.contentRunDir) === draft.runId,
      `${newSite.contentRunDir} vs runId ${draft.runId}`,
    );
    const accounting = JSON.parse(
      await readFile(path.join(newSite.contentRunDir ?? "", "slot-accounting.json"), "utf8"),
    ) as {
      entries: { slotKey: string; route?: string; type: string; disposition: string; detail: string }[];
      totals: { inScopeSlots: number };
      reconciliation: {
        reconciled: boolean;
        templateCoverage: {
          templateSlots: number;
          scopedTemplateSlots: number;
          unaccountedSlotKeys: string[];
          complete: boolean;
        };
      };
    };
    check(
      "int.accountingTable — the table's rows sum to the accounting artifact's OWN in-scope population",
      draft.reconciliation.reconciled &&
        draft.reconciliation.rowSum === accounting.totals.inScopeSlots &&
        draft.totals.inScopeSlots === accounting.totals.inScopeSlots,
      JSON.stringify(draft.reconciliation),
    );
    check(
      "int.accountingTable — every route the brief covered has its own row with in-scope / filled / changed / needs-input",
      draft.rows.length === 9 &&
        draft.rows.filter((r) => r.scope === "page").length === 8 &&
        draft.rows.every((r) => r.inScopeSlots > 0),
      JSON.stringify(draft.rows.map((r) => [r.route, r.inScopeSlots, r.filledSlots, r.changedSlots, r.unresolvedSlots])),
    );
    check(
      "int.multiRouteDraft — EVERY enabled core route received written AND changed values; not one is homepage-only",
      draft.rows.every((r) => r.filledSlots > 0 && r.changedSlots > 0),
      JSON.stringify(draft.rows.map((r) => `${r.route}:${r.filledSlots}/${r.inScopeSlots}(${r.changedSlots} changed)`)),
    );
    const unresolvedRows = accounting.entries.filter((e) => e.disposition === "unresolved").length;
    check(
      "int.accountingTable — UNRESOLVED is re-derived from the artifact's own rows and agrees with the table",
      draft.totals.unresolvedSlots === unresolvedRows,
      `${draft.totals.unresolvedSlots} vs ${unresolvedRows}`,
    );
    check(
      "int.accountingTable — the browser was shown the same per-route table, not a summary line",
      (await page.evaluate(() => document.querySelectorAll(".wr-draft-table tbody tr").length)) >= 9,
    );
    // THE DENOMINATOR IS THE TEMPLATE'S, re-derived here from the template the
    // site was created from — not from the artifact's own header. A draft that
    // closed by shrinking its in-scope predicate would fail here even though
    // every number inside it agreed with itself.
    const draftTemplate = await loadReconTemplate(TEMPLATE_MANIFEST);
    const draftAccountedKeys = new Set(accounting.entries.map((entry) => entry.slotKey));
    check(
      "int.accountingTable — the in-scope denominator IS the template's whole slot population, re-derived from the template, both directions",
      accounting.totals.inScopeSlots === draftTemplate.manifest.counts.slots &&
        draftTemplate.slotsFile.slots.every((slot) => draftAccountedKeys.has(slot.key)) &&
        [...draftAccountedKeys].every((key) => draftTemplate.slotByKey.has(key)) &&
        accounting.reconciliation.templateCoverage.complete &&
        accounting.reconciliation.templateCoverage.unaccountedSlotKeys.length === 0,
      `${accounting.totals.inScopeSlots} vs template ${draftTemplate.manifest.counts.slots}; ` +
        JSON.stringify(accounting.reconciliation.templateCoverage),
    );

    // A PRICE IS NOT A PLACE FOR A HEADLINE. The first version of the writer
    // filled the pricing table with adjectives ("$10 per user/month" ->
    // "Shorter changeovers"), rewrote the changelog's date column and replaced
    // the compliance labels; the one statistic it did leave alone it left as
    // the SOURCE company's own "50%". Both halves are checked here on the real
    // draft: nothing value-shaped is overwritten, and every fact-bearing one
    // the brief did not state is a NAMED needs-input row.
    const unresolvedKeys = new Set(
      accounting.entries.filter((entry) => entry.disposition === "unresolved").map((entry) => entry.slotKey),
    );
    const shapedSlots = [...newSite.index.slotByKey.values()].filter(
      (slot) => slot.type === "text" && typeof slot.defaultValue === "string" && valueShapeOf(slot.defaultValue) !== undefined,
    );
    const overwrittenShaped = shapedSlots.filter((slot) => {
      const written = newSite.contentSlotValues[slot.key];
      return typeof written === "string" && written !== slot.defaultValue;
    });
    const shapedFactsNeedingInput = shapedSlots.filter(
      (slot) =>
        valueShapeIsFactBearing(valueShapeOf(slot.defaultValue as string)!) &&
        slot.editability === "editable" &&
        unresolvedKeys.has(slot.key),
    );
    check(
      "int.briefToDraft — NOT ONE value-shaped slot is overwritten with composed copy: no price, plan limit, statistic, certification, date, time, version or byline",
      overwrittenShaped.length === 0 && shapedSlots.length > 0,
      `${overwrittenShaped.length} of ${shapedSlots.length} shaped slot(s) overwritten: ` +
        overwrittenShaped
          .slice(0, 8)
          .map((slot) => `${slot.key} "${String(slot.defaultValue).slice(0, 24)}" -> "${String(newSite.contentSlotValues[slot.key]).slice(0, 24)}"`)
          .join("; "),
    );
    // The verifier's own examples, by name, so the class cannot regress quietly.
    const namedShapeCases: { key: string; expect: "needs-input" | "kept" }[] = [
      { key: "pricing.main.text.16-per-user-month", expect: "needs-input" },
      { key: "pricing.main.text.250-issues", expect: "needs-input" },
      { key: "security.main.text.iso-27001-certified", expect: "needs-input" },
      { key: "customers.main.text.50", expect: "needs-input" },
      { key: "changelog.main.text.august-20-2026", expect: "kept" },
      { key: "changelog.main.text.00-17", expect: "kept" },
    ];
    const namedShapeResults = namedShapeCases.map((testCase) => {
      const slot = newSite.index.slotByKey.get(testCase.key);
      const written = newSite.contentSlotValues[testCase.key];
      const ok =
        testCase.expect === "needs-input"
          ? written === undefined && unresolvedKeys.has(testCase.key)
          : written === slot?.defaultValue;
      return { ...testCase, ok, written: written === undefined ? null : String(written).slice(0, 32) };
    });
    check(
      "int.briefToDraft — the exact slots the verifier read: the prices, the plan limit, the ISO claim and the SOURCE's 50% are named needs-input; the changelog date and time columns are kept verbatim",
      namedShapeResults.every((entry) => entry.ok),
      JSON.stringify(namedShapeResults.filter((entry) => !entry.ok)),
    );
    check(
      "int.briefToDraft — each withheld fact-bearing value is NAMED with the source figure it refuses to carry, not silently dropped",
      shapedFactsNeedingInput.length > 0 &&
        shapedFactsNeedingInput.every((slot) => {
          const row = accounting.entries.find((entry) => entry.slotKey === slot.key);
          return row !== undefined && row.detail.includes("needs factual input");
        }),
      `${shapedFactsNeedingInput.length} withheld: ${shapedFactsNeedingInput.slice(0, 6).map((slot) => slot.key).join(", ")}`,
    );
    measured.valueShapedSlots = {
      shapedTextSlots: shapedSlots.length,
      overwrittenWithCopy: overwrittenShaped.length,
      factBearingNamedNeedsInput: shapedFactsNeedingInput.length,
    };

    // =======================================================================
    section("4. the Site Library row");
    // =======================================================================
    await page.click("#wr-library-open");
    await page.waitForFunction(() => document.querySelectorAll("#wr-lib-sites tbody tr").length > 0);
    const siteRows = await page.$$eval("#wr-lib-sites tbody tr", (rows) =>
      rows.map((r) => [...r.querySelectorAll("td")].map((cell) => cell.textContent ?? "")),
    );
    const siteRow = siteRows.find((cells) => cells[1] === NEW_SITE_ID);
    const scan = await scanSites({ dataRoot: "data" });
    const entry = scan.entries.find((e) => e.siteKey === `${HOST}/${NEW_SITE_ID}`);
    check(
      "int.siteLibraryRow — the new site is in the Site Library with a real status, updatedAt and revision, all traced to the registry scan",
      siteRow !== undefined &&
        entry !== undefined &&
        siteRow[3] === entry.releaseState &&
        siteRow[4].startsWith(entry.updatedAt.slice(0, 10)) &&
        siteRow[5].includes(`doc r${entry.projectRevision}`) &&
        siteRow[2] === entry.templateLineage.templateId,
      JSON.stringify({ row: siteRow, entry: entry === undefined ? null : [entry.releaseState, entry.updatedAt, entry.projectRevision] }),
    );
    check(
      "int.siteLibraryRow — the row separates the project DOCUMENT revision from the authored revision CHAIN, and both match the registry's own values",
      siteRow !== undefined &&
        entry !== undefined &&
        siteRow[5] ===
          `doc r${entry.projectRevision}` +
            (entry.revision === null
              ? " · chain none"
              : ` · chain r${entry.revision.revisionCount} (${entry.revision.origin})`),
      JSON.stringify({ row: siteRow?.[5], projectRevision: entry?.projectRevision, revision: entry?.revision }),
    );
    check(
      "int.siteLibraryRow — the site is independent: its own project dir, its own content run, and the seed project is untouched",
      entry !== undefined &&
        entry.projectDir.endsWith(NEW_SITE_ID) &&
        existsSync(NEW_PROJECT) &&
        (await loadEditorSite(SEED_PROJECT)).contentRunDir !== newSite.contentRunDir,
    );

    // The library renders /api/sites in order, so the row index is that list's
    // index — the projectDir is not a column, and matching on siteId would be
    // ambiguous (two projects on disk legitimately report the same siteId).
    const apiSites = (await (await fetch(`${editor.baseUrl}/api/sites`)).json()) as {
      sites: { projectDir: string }[];
    };
    const seedRowIndex = apiSites.sites.findIndex(
      (site) => site.projectDir.split(path.sep).join("/") === SEED_PROJECT.split(path.sep).join("/"),
    );
    if (seedRowIndex >= 0) {
      await page
        .locator("#wr-lib-sites tbody tr")
        .nth(seedRowIndex)
        .locator("button", { hasText: "Edit" })
        .click();
      await page.waitForFunction(
        (expected) => (document.getElementById("wr-status")?.textContent ?? "").includes(expected),
        "site linear.app/wr28-brand-assets",
        { timeout: 600_000 },
      );
    }
    check(
      "int.editSiteOpens — Edit on a Site Library row opens THAT site in the editor (site switching works from the library)",
      seedRowIndex >= 0 &&
        (await (await fetch(`${editor.baseUrl}/api/bootstrap`)).json().then((b: { site: { projectDir: string } }) =>
          b.site.projectDir.split(path.sep).join("/"),
        )) === SEED_PROJECT.split(path.sep).join("/"),
    );
  } finally {
    if (browser !== undefined) await browser.close();
    await editor.stop();
  }

  console.log(`\nmeasured: ${JSON.stringify(measured, null, 2)}`);
  console.log(`\nsmoke:first-draft — ${checks} checks, ${failures} failures`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("\nsmoke:first-draft CRASHED —", error);
  process.exit(1);
});
