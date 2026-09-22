/**
 * npx tsx scripts/smoke-brand-assets.ts — Task 28 Phase 2: SOURCE BRAND ASSET
 * RESOLUTION.
 *
 * Six sections, cheapest first:
 *
 *   §1 detection      the surface walker over a hand-built runtime IR
 *   §2 marks          the deterministic no-logo fallback
 *   §3 resolver       REPLACE / REMOVE / PRESERVE over that IR, per surface,
 *                     including every refusal the resolver is supposed to make
 *   §4 flight         the RSC flight census, measured on the REAL bytes of an
 *                     accepted production build (read-only)
 *   §5 CANARY         FIVE REAL `next build`s of 1-route copies of accepted
 *                     templates. On linear.app: before decisions, after
 *                     decisions, and one whose REPLACE is requested but does
 *                     not take effect. On nextjs.org (§5e): the image-logo
 *                     surface before and after, on a REAL source logo shipped
 *                     as an <img>. §5f measures the detector's token basis on
 *                     the real templates, including the lineage the host-only
 *                     detector was blind to.
 *                     Blocker counts come from the real release code
 *                     (`sourceBrandAssetRequirement` + `releaseBlockers`), and
 *                     the AFTER build is served and HYDRATED in Chromium so the
 *                     census reads what actually renders, not raw bytes.
 *
 * The canary copies an accepted template run into its own fixture root and
 * never writes into a lineage directory.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

import {
  bakeBrand,
  brandInitials,
  buildStaticExport,
  censusFlightPayload,
  censusServedHtml,
  convertToStaticExport,
  copyTemplateApp,
  countBrandNamedImagePaths,
  decodeFlightPayload,
  emptyMarkFor,
  extractInlineFlightChunks,
  flightBrandSurfaceTotal,
  stripReferencedObservationChunks,
  generatedMarkFor,
  isIconSprite,
  markupBrandSurfaceTotal,
  monogramSvg,
  normalizeBrandName,
  publicBrandAssetCopier,
  renameSymbolIdInMarkup,
  appBrandTokens,
  scanAppBrandHosts,
  stampReplacementMark,
  svgRootAttributes,
  wordmarkSvg,
  type BrandDecisionInput,
  type BrandHost,
} from "../src/production/index.js";
import {
  evaluateBrandOutputProof,
  sourceBrandAssetRequirement,
  type BrandBakeSection,
} from "../src/release/brand-scan.js";
import { releaseBlockers } from "../src/release/requirements.js";
import type { Requirement } from "../src/release/types.js";
import {
  brandSurfaceIdOf,
  brandTokensFrom,
  firstBrandToken,
  firstBrandTokenInIdentifier,
  isSourceHostUrl,
  scanElementProps,
  brandTokensFromHost,
  containsBrandToken,
  declaredBrandNamesFromTitles,
} from "../src/content-injection/brand-surfaces.js";

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

const fixtureRoot = path.resolve("data", `.smoke-brand-assets-${process.pid}`);
const ACCEPTED_TEMPLATE = path.resolve(
  "data/linear.app/recon-templates/2026-08-25T21-53-26-980Z/app",
);
const ACCEPTED_BUILD_SITE = path.resolve(
  "data/linear.app/production-builds/2026-08-27T09-38-59-704Z/package/site",
);

// ---------------------------------------------------------------------------
// A hand-built runtime IR carrying every surface class this phase claims.
// The <img> logo HERE is synthetic because a hand-built fixture is the cheapest
// place to test the resolver's refusals. It is NOT the only place the surface
// runs: an earlier revision of this comment claimed no accepted template in
// this repo ships its own logo as an <img>, and that claim was FALSE —
// nextjs.org ships 160 image-logo hosts over 40 routes, and §5e now builds
// that real lineage twice.
// ---------------------------------------------------------------------------
const FIXTURE_HOST = "acme.com";

function fixtureDoc(): unknown {
  return {
    k: "e",
    n: "n000000",
    t: "div",
    c: [
      // 1. self-contained inline wordmark, announced by an SVG aria-label
      {
        k: "e",
        n: "n000001",
        t: "span",
        p: { class: "wr-svg-host" },
        v:
          '<svg width="120" height="24" viewBox="0 0 400 100" fill="currentColor" ' +
          'aria-label="Acme Logo" data-wr-node="n000001" class="src-cls"><path d="M0 0h10v10H0z"></path></svg>',
      },
      // 2. accessible text attached to a logo (<title> inside the mark)
      {
        k: "e",
        n: "n000002",
        t: "span",
        v:
          '<svg width="60" height="25" viewBox="0 0 60 25" data-wr-node="n000002">' +
          "<title>Acme logo</title><path d=\"M1 1h4v4H1z\"></path></svg>",
      },
      // 3. icon SPRITE: brand-named <symbol> ids among ordinary icons
      {
        k: "e",
        n: "n000003",
        t: "span",
        v:
          '<svg width="0" height="0" data-wr-node="n000003"><defs>' +
          '<symbol id="Accessibility"><path d="M0 0h1v1H0z"></path></symbol>' +
          '<symbol id="AcmeMark"><path d="M0 0h2v2H0z"></path></symbol>' +
          '<symbol id="AcmeAi"><path d="M0 0h3v3H0z"></path></symbol>' +
          "</defs></svg>",
      },
      // 4. a <use> that references the brand-named symbol from ANOTHER node
      {
        k: "e",
        n: "n000004",
        t: "span",
        v: '<svg width="16" height="16" data-wr-node="n000004"><use href="#AcmeMark"></use></svg>',
      },
      // 5. SYNTHETIC <img> source logo (no accepted template has one)
      {
        k: "e",
        n: "n000005",
        t: "img",
        p: {
          src: "https://acme.com/static/AcmeLogo.svg",
          srcset: "https://acme.com/static/AcmeLogo.svg 1x, https://acme.com/static/AcmeLogo@2x.svg 2x",
          alt: "Acme logo",
        },
      },
      // 6. brand metadata on a plain element prop
      {
        k: "e",
        n: "n000006",
        t: "a",
        p: { href: "/", "aria-label": "Acme homepage" },
        c: [{ k: "t", v: "Acme is the system for product development" }],
      },
      // 7. an icon-only sprite host: NOTHING brand-named, must never be touched
      {
        k: "e",
        n: "n000007",
        t: "span",
        v: '<svg width="0" height="0" data-wr-node="n000007"><defs><symbol id="Search"></symbol></defs></svg>',
      },
    ],
  };
}

async function writeFixtureApp(dir: string): Promise<void> {
  const dataDir = path.join(dir, "reconstruction-data");
  await mkdir(path.join(dataDir, "pages"), { recursive: true });
  await writeFile(
    path.join(dataDir, "route-map.json"),
    JSON.stringify({
      schemaVersion: 1,
      routes: [{ routeId: "r000001", key: "/", path: "/", pageFile: "pages/p000001.json", pageSourceId: "p000001" }],
    }),
    "utf8",
  );
  await writeFile(
    path.join(dataDir, "pages", "p000001.json"),
    JSON.stringify({ pageId: "p000001", desktop: { id: "desktop", width: 1440, doc: fixtureDoc() } }),
    "utf8",
  );
}

function hostsById(hosts: readonly BrandHost[]): Map<string, BrandHost> {
  return new Map(hosts.map((host) => [`${host.surface} ${host.nodeId}`, host]));
}

// ---------------------------------------------------------------------------
section("§1 detection — every surface class, over a hand-built runtime IR");
// ---------------------------------------------------------------------------
{
  const dir = path.join(fixtureRoot, "detect", "app");
  await writeFixtureApp(dir);
  const scan = await scanAppBrandHosts(dir, FIXTURE_HOST);
  const bySurface: Record<string, number> = {};
  for (const host of scan.hosts) bySurface[host.surface] = (bySurface[host.surface] ?? 0) + 1;
  check("svg aria-label logo host detected", bySurface["svg-aria-label"] === 1, JSON.stringify(bySurface));
  check("accessible text on a logo (<title>) detected", bySurface["svg-text"] === 1, JSON.stringify(bySurface));
  check("brand-named <symbol> host detected once", bySurface["svg-symbol-id"] === 1, JSON.stringify(bySurface));
  check("<img> source logo detected (SYNTHETIC fixture)", bySurface["image-logo"] === 1, JSON.stringify(bySurface));
  check("image alt brand metadata detected", bySurface["image-alt"] === 1, JSON.stringify(bySurface));
  check("element aria-label brand metadata detected", bySurface["aria-label"] === 1, JSON.stringify(bySurface));
  const index = hostsById(scan.hosts);
  const symbolHost = index.get("svg-symbol-id n000003")!;
  check(
    "one <symbol> host carries BOTH brand ids under one decision id",
    symbolHost.values.length === 2 && symbolHost.values.includes("AcmeMark") && symbolHost.values.includes("AcmeAi"),
    JSON.stringify(symbolHost.values),
  );
  check(
    "an icon-only sprite host produces NO brand host",
    scan.hosts.every((host) => host.nodeId !== "n000007"),
  );
  check(
    "a third-party/no-brand image is not an image-logo",
    scan.hosts.filter((host) => host.surface === "image-logo").every((host) => host.nodeId === "n000005"),
  );
  check(
    "the decision id equals the release-layer derivation for the same address",
    index.get("svg-aria-label n000001")!.id ===
      brandSurfaceIdOf({
        surface: "svg-aria-label",
        route: "/",
        nodeId: "n000001",
        slotKey: null,
        evidencePointer: "desktop.doc[n000001].v",
      }),
  );
  check("sprite hosts are recognised", isIconSprite(fixtureDoc() ? '<svg><symbol id="x"/></svg>' : ""), "");
  check("a plain mark is NOT a sprite", !isIconSprite('<svg aria-label="Acme"><path/></svg>'));
  check("scan is read-only: no page rewritten", (await stat(path.join(dir, "reconstruction-data", "pages", "p000001.json"))).size > 0);
}

// ---------------------------------------------------------------------------
section("§2 no-logo fallback — deterministic generated marks");
// ---------------------------------------------------------------------------
{
  const a = wordmarkSvg("Northwind", { width: null, height: null });
  const b = wordmarkSvg("Northwind", { width: null, height: null });
  check("wordmark is deterministic (same name -> same bytes)", a === b);
  check("wordmark renders the name", a.includes(">Northwind</text>"), a.slice(0, 120));
  check("wordmark inherits paint (currentColor), so the theme still reaches it", a.includes('fill="currentColor"'));
  const m1 = monogramSvg("Northwind Systems");
  const m2 = monogramSvg("Northwind Systems");
  check("monogram is deterministic", m1 === m2);
  check("monogram colour is deterministic and palette-drawn", /fill="#[0-9a-f]{6}"/.test(m1), m1.slice(0, 80));
  check(
    "a different name gives a different monogram",
    monogramSvg("Zephyr Labs") !== m1,
  );
  check("initials from two words", brandInitials("Northwind Systems") === "NS");
  check("initials from a camel-cased single word", brandInitials("FlowPilot") === "FP");
  check(
    "the working-name qualifier is stripped by an EXPLICIT rule",
    normalizeBrandName("FlowPilot (synthetic-pilot-brand)") === "FlowPilot",
    String(normalizeBrandName("FlowPilot (synthetic-pilot-brand)")),
  );
  check("an empty name yields NO mark rather than a drawn 'undefined'", normalizeBrandName("   ") === null);
  const wide = generatedMarkFor("Northwind", { width: 400, height: 100 });
  const square = generatedMarkFor("Northwind", { width: 40, height: 40 });
  check("a wide box gets a wordmark", wide.kind === "wordmark");
  check("a square box gets a monogram", square.kind === "monogram");
}

// ---------------------------------------------------------------------------
section("§3 resolver — REPLACE / REMOVE / PRESERVE over the runtime IR");
// ---------------------------------------------------------------------------
{
  const dir = path.join(fixtureRoot, "resolve", "app");
  await writeFixtureApp(dir);
  const replacementFile = path.join(fixtureRoot, "resolve", "northwind.svg");
  await writeFile(replacementFile, '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', "utf8");
  const before = await scanAppBrandHosts(dir, FIXTURE_HOST);
  const index = hostsById(before.hosts);
  const id = (key: string): string => index.get(key)!.id;

  const decisions: Record<string, BrandDecisionInput> = {
    [id("svg-aria-label n000001")]: { decision: "REPLACE", replacement: { text: "Northwind" }, updatedAt: "t" },
    [id("svg-text n000002")]: { decision: "REMOVE", updatedAt: "t" },
    [id("svg-symbol-id n000003")]: { decision: "REMOVE", updatedAt: "t" },
    [id("image-logo n000005")]: { decision: "REPLACE", replacement: { file: replacementFile }, updatedAt: "t" },
    [id("image-alt n000005")]: { decision: "REPLACE", replacement: { text: "Northwind" }, updatedAt: "t" },
    [id("aria-label n000006")]: { decision: "REMOVE", updatedAt: "t" },
  };
  const report = await bakeBrand({
    appDir: dir,
    sourceHost: FIXTURE_HOST,
    decisions,
    brandName: "Northwind",
    publicAssetUrlFor: await publicBrandAssetCopier(dir),
  });

  check("every fixture host was found before the rewrite", report.hostsBefore === 6, String(report.hostsBefore));
  check("decisions counted", report.decisions.replace === 3 && report.decisions.remove === 3, JSON.stringify(report.decisions));
  check("no decision was refused", report.applied.refused === 0, JSON.stringify(report.refusals));
  check(
    "IR residual is EMPTY after resolving every host",
    report.residual.unexplainedAfter.length === 0 && report.residual.hostsAfter === 0,
    JSON.stringify(report.residual),
  );
  check(
    "the NO-LOGO fallback is recorded on the report, with its kind and the name it drew",
    report.applied.generatedMarks.length === 1 &&
      report.applied.generatedMarks[0].kind === "wordmark" &&
      report.applied.generatedMarks[0].name === "Northwind",
    JSON.stringify(report.applied.generatedMarks),
  );
  check(
    "the report DECLARES the surfaces this resolver does not own (silence is not coverage)",
    ["visible-text", "source-url", "title-meta", "open-graph", "json-ld"].every(
      (surface) => typeof report.surfacesNotResolved[surface] === "string",
    ),
    Object.keys(report.surfacesNotResolved).join(","),
  );
  check(
    "including the attribute-value gap found in this phase's OWN proof build (placeholder=…)",
    (report.surfacesNotResolved["attribute-value-text"] ?? "").includes("placeholder") &&
      (report.surfacesNotResolved["attribute-value-text"] ?? "").includes("not counted by any census axis"),
    report.surfacesNotResolved["attribute-value-text"] ?? "(absent)",
  );

  // ---- the POST-HYDRATION axis of the clearing rule ----------------------
  // `report` above is fully resolved: nothing refused, nothing preserved, no
  // unexplained residual. That is the only shape where the rendered axes are
  // what decides, so it is where the hydrated axis can be isolated.
  {
    const unmeasured = evaluateBrandOutputProof("(in-memory)", { census: {}, flight: {}, bake: report });
    check(
      "with every measured axis clean the requirement clears",
      unmeasured.cleared === true,
      unmeasured.detail,
    );
    check(
      "an UNMEASURED post-hydration axis is named as unmeasured, never scored as a zero",
      unmeasured.hydratedBrandSurfaces === null && unmeasured.detail.includes("not measured"),
      unmeasured.detail,
    );
    const measured = evaluateBrandOutputProof(
      "(in-memory)",
      { census: {}, flight: {}, bake: report },
      { counts: {}, routesMeasured: 1 },
    );
    check(
      "a MEASURED, zero post-hydration census clears it",
      measured.cleared === true && measured.hydratedBrandSurfaces === 0,
      measured.detail,
    );
    const reverted = evaluateBrandOutputProof(
      "(in-memory)",
      { census: {}, flight: {}, bake: report },
      { counts: { svgAriaLabel: 1 }, routesMeasured: 1 },
    );
    check(
      "REVERTS ON HYDRATION: exported bytes clean, LIVE DOM still branded -> does NOT clear",
      reverted.cleared === false && reverted.hydratedBrandSurfaces === 1,
      reverted.detail,
    );
  }

  const page = JSON.parse(
    await readFile(path.join(dir, "reconstruction-data", "pages", "p000001.json"), "utf8"),
  ) as { desktop: { doc: { c: Array<{ n: string; v?: string; p?: Record<string, unknown> }> } } };
  const node = (id2: string): { n: string; v?: string; p?: Record<string, unknown> } =>
    page.desktop.doc.c.find((child) => child.n === id2)!;

  const mark = node("n000001").v!;
  check("inline-SVG logo replaced by the generated wordmark", mark.includes("Northwind"), mark.slice(0, 140));
  check("the source aria-label is GONE from the mark", !/aria-label="Acme/.test(mark), mark.slice(0, 140));
  check("DOM identity survives the replacement (data-wr-node re-stamped)", mark.includes('data-wr-node="n000001"'));
  check("the host BOX is preserved", /width="120"/.test(mark) && /height="24"/.test(mark), mark.slice(0, 200));
  check("the host class is preserved", mark.includes('class="src-cls"'), mark.slice(0, 200));
  check("NO new DOM attribute was introduced", !/data-wr-slot/.test(mark));

  const removed = node("n000002").v!;
  check("REMOVE leaves an inert, brand-free mark", removed.includes("aria-hidden") && !/Acme/i.test(removed), removed);
  check("REMOVE keeps the box so layout does not move", /width="60"/.test(removed) && /height="25"/.test(removed), removed);

  const sprite = node("n000003").v!;
  check("brand-named <symbol> ids renamed", !/id="Acme/.test(sprite), sprite.slice(0, 200));
  check("the ordinary icon symbol is UNTOUCHED", sprite.includes('id="Accessibility"'));
  check("both brand ids on the host were renamed", (sprite.match(/id="wr-sym-/g) ?? []).length === 2, sprite);
  const useNode = node("n000004").v!;
  check(
    "a <use href> in ANOTHER node was renamed with it (no dangling reference)",
    !useNode.includes("#AcmeMark") && /href="#wr-sym-[0-9a-f]{10}"/.test(useNode),
    useNode,
  );
  const symbolId = /id="(wr-sym-[0-9a-f]{10})"/.exec(sprite.slice(sprite.indexOf("AcmeMark") >= 0 ? 0 : 0))?.[1];
  check("the rename is content-addressed, not a counter", symbolId === undefined || /^wr-sym-[0-9a-f]{10}$/.test(symbolId));

  const img = node("n000005").p!;
  check("<img> logo src replaced with a served, self-hosted url", String(img.src).startsWith("/wr/brand/"), String(img.src));
  check("the source srcset is dropped (it would re-introduce the source file)", img.srcset === undefined);
  check("the replacement file was copied into the app's public/", existsSync(path.join(dir, "public", "wr", "brand")));
  check("image alt no longer names the source", img.alt === "Northwind", String(img.alt));
  const anchor = node("n000006").p!;
  check("element aria-label REMOVED outright", anchor["aria-label"] === undefined);
  check("its href is untouched (a url is the asset layer's surface)", anchor.href === "/");
  const icons = node("n000007").v!;
  check("the icon-only sprite host was never touched", icons.includes('id="Search"'));
}

// ---------------------------------------------------------------------------
section("§3b resolver refusals + PRESERVE — the honest half");
// ---------------------------------------------------------------------------
{
  const dir = path.join(fixtureRoot, "refuse", "app");
  await writeFixtureApp(dir);
  const before = await scanAppBrandHosts(dir, FIXTURE_HOST);
  const index = hostsById(before.hosts);
  const id = (key: string): string => index.get(key)!.id;

  const report = await bakeBrand({
    appDir: dir,
    sourceHost: FIXTURE_HOST,
    decisions: {
      // PRESERVE with a recorded reason: deliberately ships the source mark
      [id("svg-aria-label n000001")]: {
        decision: "PRESERVE",
        reason: "co-marketing page: the partner's mark is licensed for this placement",
        updatedAt: "t",
      },
      // REMOVE on an <img> host: refused, because removing the element moves layout
      [id("image-logo n000005")]: { decision: "REMOVE", updatedAt: "t" },
      // REPLACE with an unresolvable payload: refused, not silently ignored
      [id("svg-text n000002")]: { decision: "REPLACE", replacement: { assetId: "no-such-asset" }, updatedAt: "t" },
      // a decision key that addresses nothing on this lineage
      "bs-svg-aria-label-000000000000": { decision: "REMOVE", updatedAt: "t" },
    },
    brandName: null,
    publicAssetUrlFor: await publicBrandAssetCopier(dir),
  });

  check("PRESERVE mutates nothing and is counted", report.applied.preserved === 1 && report.applied.replaced === 0, JSON.stringify(report.applied));
  const page = await readFile(path.join(dir, "reconstruction-data", "pages", "p000001.json"), "utf8");
  check("the PRESERVED source mark is still in the IR, verbatim", page.includes('aria-label=\\"Acme Logo\\"'));
  check(
    "REMOVE on an <img> host is REFUSED with a stated reason",
    report.refusals.some((r) => r.surface === "image-logo" && r.reason.includes("not deterministically safe")),
    JSON.stringify(report.refusals),
  );
  check(
    "a REPLACE whose payload cannot be resolved is REFUSED, never silently skipped",
    report.refusals.some((r) => r.surface === "svg-text" && r.reason.includes("could not be resolved")),
    JSON.stringify(report.refusals),
  );
  check("a decision key that addresses no host is reported", report.decisions.unknownIds.includes("bs-svg-aria-label-000000000000"));
  check(
    "the PRESERVED host is NOT in the unexplained residual",
    !report.residual.unexplainedAfter.includes(id("svg-aria-label n000001")),
    JSON.stringify(report.residual.unexplainedAfter),
  );
  check(
    "every REFUSED host IS in the unexplained residual",
    report.residual.unexplainedAfter.includes(id("svg-text n000002")) &&
      report.residual.unexplainedAfter.includes(id("image-logo n000005")),
    JSON.stringify(report.residual.unexplainedAfter),
  );
  check("preserved count is measured after the rewrite", report.residual.preservedAfter === 1, JSON.stringify(report.residual));

  // The clearing rule over this exact report.
  const proof = evaluateBrandOutputProof("(in-memory)", {
    census: { svgAriaLabel: 1 },
    flight: { svgAriaLabel: 1 },
    bake: report,
  });
  check("a report with refusals does NOT clear the requirement", proof.cleared === false, proof.detail);
  const preserveOnly = await (async (): Promise<BrandBakeSection & { report: Awaited<ReturnType<typeof bakeBrand>> }> => {
    const dir2 = path.join(fixtureRoot, "preserve-only", "app");
    await writeFixtureApp(dir2);
    const replacementFile = path.join(fixtureRoot, "preserve-only", "northwind.svg");
    await writeFile(replacementFile, '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', "utf8");
    const scan = await scanAppBrandHosts(dir2, FIXTURE_HOST);
    const all: Record<string, BrandDecisionInput> = {};
    for (const host of scan.hosts) {
      all[host.id] =
        host.surface === "svg-aria-label"
          ? { decision: "PRESERVE", reason: "licensed placement", updatedAt: "t" }
          : host.surface === "image-logo"
            ? // an image needs an image: a text payload here is refused (asserted below)
              { decision: "REPLACE", replacement: { file: replacementFile }, updatedAt: "t" }
            : { decision: "REMOVE", updatedAt: "t" };
    }
    const r = await bakeBrand({
      appDir: dir2,
      sourceHost: FIXTURE_HOST,
      decisions: all,
      brandName: "Northwind",
      publicAssetUrlFor: await publicBrandAssetCopier(dir2),
    });
    return { census: { svgAriaLabel: 1 }, flight: { svgAriaLabel: 1 }, bake: r, report: r };
  })();
  const preserveProof = evaluateBrandOutputProof("(in-memory)", preserveOnly);
  check(
    "an explicit PRESERVE explains the IR, and the detail says the residual is by decision",
    preserveProof.cleared === true && preserveProof.detail.includes("PRESERVED by explicit decision"),
    preserveProof.detail,
  );
  // Task 28 Phase 2 CORRECTION. A preserve-only build is NOT `resolved`: the
  // measured output still carries the source mark (exported-html 1, flight 1
  // in this very fixture), and this kind's policy basis reads "visible
  // source-brand content must be 0". It lands as `accepted-limitation`, which
  // this repo already treats as STILL BLOCKING.
  check(
    "a PRESERVE-only build is cleared by ACCEPTANCE, not by output proof",
    preserveProof.clearedBy === "preserve-acceptance" && preserveProof.renderedClean === false,
    `clearedBy=${String(preserveProof.clearedBy)} renderedClean=${String(preserveProof.renderedClean)} ` +
      `markup=${preserveProof.markupBrandSurfaces} flight=${preserveProof.flightBrandSurfaces}`,
  );
  {
    const preserveRequirement = sourceBrandAssetRequirement({
      hosts: [],
      routes: 1,
      templateRunDir: "(fixture)",
      inlineSvgEntryCount: 0,
      productionBuildDir: "(in-memory)",
      proof: preserveProof,
    });
    check(
      "a PRESERVE-only build lands as accepted-limitation, never resolved",
      preserveRequirement.status === "accepted-limitation" &&
        (preserveRequirement.statusNote ?? "").startsWith("ACCEPTED LIMITATION"),
      `${preserveRequirement.status} — ${preserveRequirement.statusNote ?? ""}`,
    );
    check(
      "and it STILL BLOCKS the release (PRESERVE is not a route to PRODUCTION_READY)",
      releaseBlockers([preserveRequirement]).length === 1,
      String(releaseBlockers([preserveRequirement]).length),
    );
    const outputProvedProof = evaluateBrandOutputProof("(in-memory)", {
      census: {},
      flight: {},
      bake: preserveOnly.report,
    });
    const outputProved = sourceBrandAssetRequirement({
      hosts: [],
      routes: 1,
      templateRunDir: "(fixture)",
      inlineSvgEntryCount: 0,
      productionBuildDir: "(in-memory)",
      proof: outputProvedProof,
    });
    // TASK 28 CLOSE-OUT. This check previously asserted the OPPOSITE — that the
    // same preserved IR RESOLVES once the measured census happens to read 0.
    // That was the defect: it made the verdict hostage to the census being
    // complete, and the census was NOT complete (no axis measured a
    // brand-named image path), so a PRESERVE-everything image-logo build
    // cleared as `output-proof` with 0 blockers while the source logotype was
    // still in the shipped bytes. `preservedAfter > 0` now ALWAYS outranks a
    // clean census: a preserved mark is an operator's acceptance and can never
    // be proof the mark is gone.
    check(
      "28.X1 a PRESERVED host NEVER resolves, not even when every measured axis reads 0",
      outputProved.status === "accepted-limitation" &&
        releaseBlockers([outputProved]).length === 1 &&
        outputProvedProof.clearedBy === "preserve-acceptance",
      `${outputProved.status} — clearedBy=${String(outputProvedProof.clearedBy)} — ${outputProved.statusNote ?? ""}`,
    );
    check(
      "28.X1b and the statusNote SAYS the zero is not proof, rather than reading like a pass",
      (outputProved.statusNote ?? "").startsWith("ACCEPTED LIMITATION") &&
        (outputProved.statusNote ?? "").includes("not proof of removal"),
      outputProved.statusNote ?? "",
    );
    // NO FALSE POSITIVES. The same fixture, decided REPLACE/REMOVE everywhere
    // so NOTHING is preserved, with the same clean census — still resolves.
    // A fix that blocked every build would not be a fix.
    {
      const dir4 = path.join(fixtureRoot, "replace-only", "app");
      await writeFixtureApp(dir4);
      const replacementFile4 = path.join(fixtureRoot, "replace-only", "northwind.svg");
      await mkdir(path.dirname(replacementFile4), { recursive: true });
      await writeFile(replacementFile4, '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', "utf8");
      const scan4 = await scanAppBrandHosts(dir4, FIXTURE_HOST);
      const all4: Record<string, BrandDecisionInput> = {};
      for (const host of scan4.hosts) {
        all4[host.id] =
          host.surface === "image-logo"
            ? { decision: "REPLACE", replacement: { file: replacementFile4 }, updatedAt: "t" }
            : host.surface === "svg-symbol-id"
              ? { decision: "REMOVE", updatedAt: "t" }
              : { decision: "REPLACE", replacement: { text: "Northwind" }, updatedAt: "t" };
      }
      const r4 = await bakeBrand({
        appDir: dir4,
        sourceHost: FIXTURE_HOST,
        decisions: all4,
        brandName: "Northwind",
        publicAssetUrlFor: await publicBrandAssetCopier(dir4),
      });
      const replaceProof = evaluateBrandOutputProof("(in-memory)", { census: {}, flight: {}, bake: r4 });
      const replaceRequirement = sourceBrandAssetRequirement({
        hosts: [],
        routes: 1,
        templateRunDir: "(fixture)",
        inlineSvgEntryCount: 0,
        productionBuildDir: "(in-memory)",
        proof: replaceProof,
      });
      check(
        "28.X2 NO FALSE POSITIVE: nothing preserved + a clean census STILL clears by output-proof",
        r4.residual.preservedAfter === 0 &&
          r4.applied.refused === 0 &&
          replaceProof.clearedBy === "output-proof" &&
          replaceRequirement.status === "resolved" &&
          releaseBlockers([replaceRequirement]).length === 0,
        `preservedAfter=${r4.residual.preservedAfter} refused=${r4.applied.refused} ` +
          `clearedBy=${String(replaceProof.clearedBy)} status=${replaceRequirement.status}`,
      );
    }
  }
  check(
    "the preserve-only build refuses nothing and leaves ONLY the preserved host",
    preserveOnly.report.applied.refused === 0 &&
      preserveOnly.report.residual.unexplainedAfter.length === 0 &&
      preserveOnly.report.residual.preservedAfter === 1,
    JSON.stringify(preserveOnly.report.residual),
  );
  {
    // An image needs an image: a text-only REPLACE on an <img> host is refused.
    const dir3 = path.join(fixtureRoot, "img-text-payload", "app");
    await writeFixtureApp(dir3);
    const scan3 = await scanAppBrandHosts(dir3, FIXTURE_HOST);
    const imgHost = scan3.hosts.find((host) => host.surface === "image-logo")!;
    const r3 = await bakeBrand({
      appDir: dir3,
      sourceHost: FIXTURE_HOST,
      decisions: { [imgHost.id]: { decision: "REPLACE", replacement: { text: "Northwind" }, updatedAt: "t" } },
      brandName: "Northwind",
    });
    check(
      "an <img> REPLACE carrying only text is refused (an image needs an image)",
      r3.applied.refused === 1 && r3.refusals[0].reason.includes("assetId or replacement.file"),
      JSON.stringify(r3.refusals),
    );
  }
}

// ---------------------------------------------------------------------------
section("§3c helpers — markup surgery is not guesswork");
// ---------------------------------------------------------------------------
{
  const attrs = svgRootAttributes('<svg width="20%" height="13" viewBox="0 0 100 100" fill="#E2E4E6">');
  check("root attributes are read as written, incl. non-numeric widths", attrs.width === "20%" && attrs.height === "13");
  const stamped = stampReplacementMark('<svg viewBox="0 0 5 5" class="new"><path/></svg>', '<svg width="20%" class="old" style="color:red"><path/></svg>', "n000042");
  check("a non-numeric box is carried through", stamped.includes('width="20%"'), stamped);
  check("the replacement's own class is stripped, the host's is kept", stamped.includes('class="old"') && !stamped.includes('class="new"'), stamped);
  check("host style is carried", stamped.includes("color:red"), stamped);
  const empty = emptyMarkFor('<svg width="8" height="8" aria-label="Acme"><path/></svg>', "n1");
  check("the empty mark carries no brand", !/Acme/.test(empty), empty);
  const renamed = renameSymbolIdInMarkup('<symbol id="Acme"></symbol><use xlink:href="#Acme"></use>', "Acme", "wr-sym-1");
  check("xlink:href references are renamed too", renamed.references === 1 && renamed.symbols === 1, JSON.stringify(renamed));
  check("a partial id is NOT renamed", renameSymbolIdInMarkup('<symbol id="AcmeBig"></symbol>', "Acme", "x").symbols === 0);
}

// ---------------------------------------------------------------------------
section("§3d TASK 28 CLOSE-OUT — the clearing instrument's own blind spots");
// ---------------------------------------------------------------------------
//
// THE DEFECT THIS SECTION EXISTS FOR, reproduced here as a fixture.
// `image-logo` is the FIRST entry of `RESOLVABLE_BRAND_SURFACES` and the
// resolver really does rewrite `props.src` for it — but NO census axis measured
// a brand-named image PATH (`sourceUrl` is excluded from
// `markupBrandSurfaceTotal`, and a self-hosted `/static/AcmeLogo.svg` is not a
// source-host URL anyway). MEASURED consequence, before the fix: on an
// image-logo-only lineage a PRESERVE-everything decision produced a census of
// all zeros, `renderedClean === true`, `clearedBy === "output-proof"`,
// `status === "resolved"` and ZERO blockers — while the source's own logotype
// was still in the shipped bytes.
{
  const dir = path.join(fixtureRoot, "image-logo-lineage", "app");
  const dataDir = path.join(dir, "reconstruction-data");
  await mkdir(path.join(dataDir, "pages"), { recursive: true });
  await writeFile(
    path.join(dataDir, "route-map.json"),
    JSON.stringify({
      schemaVersion: 1,
      routes: [{ routeId: "r000001", key: "/", path: "/", pageFile: "pages/p000001.json", pageSourceId: "p000001" }],
    }),
    "utf8",
  );
  // An IMAGE-LOGO LINEAGE: the ONLY brand-carrying host is an <img> whose PATH
  // names the brand. The alt deliberately carries no brand token, so no other
  // axis can accidentally catch it — the src path is the whole surface.
  await writeFile(
    path.join(dataDir, "pages", "p000001.json"),
    JSON.stringify({
      pageId: "p000001",
      desktop: {
        id: "desktop",
        width: 1440,
        doc: {
          k: "e",
          n: "n000000",
          t: "div",
          c: [
            { k: "e", n: "n000005", t: "img", p: { src: "/static/AcmeLogo.svg", alt: "Company logo" } },
            {
              k: "e",
              n: "n000007",
              t: "span",
              v: '<svg width="0" height="0" data-wr-node="n000007"><defs><symbol id="Search"></symbol></defs></svg>',
            },
          ],
        },
      },
    }),
    "utf8",
  );
  const scan = await scanAppBrandHosts(dir, FIXTURE_HOST);
  check(
    "28.X3 the lineage's ONLY host is an image-logo (so no other axis can mask the blind spot)",
    scan.hosts.length === 1 && scan.hosts[0].surface === "image-logo",
    JSON.stringify(scan.hosts.map((host) => host.surface)),
  );
  const decisions: Record<string, BrandDecisionInput> = {};
  for (const host of scan.hosts) {
    decisions[host.id] = { decision: "PRESERVE", reason: "operator accepts this mark", updatedAt: "t" };
  }
  const bake = await bakeBrand({
    appDir: dir,
    sourceHost: FIXTURE_HOST,
    decisions,
    brandName: "Northwind",
    publicAssetUrlFor: await publicBrandAssetCopier(dir),
  });
  // THE SHIPPED BYTES. PRESERVE mutates nothing, so the source logotype path is
  // still in the app's own IR — this is read back off disk, after the bake.
  const shippedIr = await readFile(path.join(dataDir, "pages", "p000001.json"), "utf8");
  check(
    "28.X4 PRESERVE ships the source logotype: the path is still in the built IR, verbatim",
    bake.residual.preservedAfter === 1 && shippedIr.includes("AcmeLogo.svg"),
    `preservedAfter=${bake.residual.preservedAfter} inIr=${String(shippedIr.includes("AcmeLogo.svg"))}`,
  );
  // The rendered form of that same IR.
  const shippedHtml =
    '<html><body><div><img src="/static/AcmeLogo.svg" alt="Company logo"/>' +
    '<svg width="0" height="0"><defs><symbol id="Search"></symbol></defs></svg></div></body></html>';
  const census = censusServedHtml(shippedHtml, FIXTURE_HOST, ["acme"]);

  // (ii) THE AXIS. Without it this census is all zeros.
  check(
    "28.X5 the census now MEASURES the brand-named image path in the rendered output",
    census.imageSrcPath === 1 && markupBrandSurfaceTotal(census) === 1,
    JSON.stringify(census),
  );
  // Stated through `isSourceHostUrl` itself rather than through a zero-equality
  // on the `sourceUrl` count: smoke-production's "no BLANKET source-host
  // assertion" guard rail forbids the latter shape anywhere in src/ or
  // scripts/, and this names the actual reason more directly anyway.
  check(
    "28.X5b and it is NOT the sourceUrl axis: a self-hosted path is not a source-host URL at all",
    isSourceHostUrl("/static/AcmeLogo.svg", FIXTURE_HOST) === false &&
      census.imageSrcPath === 1 &&
      shippedHtml.includes("AcmeLogo.svg"),
    `isSourceHostUrl=${String(isSourceHostUrl("/static/AcmeLogo.svg", FIXTURE_HOST))} ` +
      `imageSrcPath=${census.imageSrcPath}`,
  );
  check(
    "28.X5c the old total (svg + alt + aria only) would still read 0 on this shipped output",
    census.svgAriaLabel + census.svgSymbolId + census.svgText + census.imageAlt + census.ariaLabel === 0,
    JSON.stringify(census),
  );

  // (i)+(iv) THE ORDERING, which must hold even if some FUTURE surface is
  // unmeasured: `census: {}` simulates exactly that — an all-zero census.
  const proofBlindCensus = evaluateBrandOutputProof("(in-memory)", { census: {}, flight: {}, bake });
  check(
    "28.X6 preservedAfter > 0 outranks a clean census: NEVER output-proof, even measuring nothing",
    proofBlindCensus.renderedClean === true &&
      proofBlindCensus.preservedAfter === 1 &&
      proofBlindCensus.clearedBy === "preserve-acceptance",
    `renderedClean=${String(proofBlindCensus.renderedClean)} clearedBy=${String(proofBlindCensus.clearedBy)}`,
  );
  const proofRealCensus = evaluateBrandOutputProof("(in-memory)", { census, flight: {}, bake });
  const requirement = sourceBrandAssetRequirement({
    hosts: scan.hosts,
    routes: 1,
    templateRunDir: "(fixture)",
    inlineSvgEntryCount: 0,
    productionBuildDir: "(in-memory)",
    proof: proofRealCensus,
  });
  check(
    "28.X7 THE DEFECT IS CLOSED: the PRESERVE-everything image-logo build BLOCKS the release",
    proofRealCensus.clearedBy === "preserve-acceptance" &&
      requirement.status === "accepted-limitation" &&
      releaseBlockers([requirement]).length === 1,
    `clearedBy=${String(proofRealCensus.clearedBy)} status=${requirement.status} ` +
      `blockers=${releaseBlockers([requirement]).length}`,
  );

  // (iii) THE MATCHER. The detector reads an <img>'s src PATH with the
  // identifier matcher; the census must read the SAME <img>'s alt with the same
  // one, or the census is blinder than detection. Real value from nextjs.org.
  check(
    "28.X8 the plain word-boundary matcher is BLIND to a camel-cased alt (this is the asymmetry)",
    firstBrandToken("NextjsLogotype", ["nextjs"]) === undefined &&
      firstBrandTokenInIdentifier("NextjsLogotype", ["nextjs"]) === "nextjs",
  );
  check(
    "28.X8b the DETECTOR now raises image-alt on that value",
    scanElementProps({ alt: "NextjsLogotype" }, ["nextjs"], "nextjs.org", "img").some(
      (hit) => hit.surface === "image-alt",
    ),
    JSON.stringify(scanElementProps({ alt: "NextjsLogotype" }, ["nextjs"], "nextjs.org", "img")),
  );
  check(
    "28.X8c and the CENSUS sees it too — the two matchers agree, so neither is blinder",
    censusServedHtml('<img src="/a.png" alt="NextjsLogotype">', "nextjs.org", ["nextjs"]).imageAlt === 1,
    JSON.stringify(censusServedHtml('<img src="/a.png" alt="NextjsLogotype">', "nextjs.org", ["nextjs"])),
  );

  // The axis helper's own edges — it must be EQUAL to detection, not wider.
  check(
    "28.X9 one count per <img>, not per attribute, matching how detection raises one host",
    countBrandNamedImagePaths(
      '<img src="/AcmeLogo.svg" srcset="/AcmeLogo.svg 1x, /AcmeLogo@2x.svg 2x">',
      ["acme"],
    ) === 1,
  );
  check(
    "28.X9b a brand-named path reachable ONLY through srcset is still counted",
    countBrandNamedImagePaths('<img src="/generic.png" srcset="/AcmeLogo.svg 1x">', ["acme"]) === 1,
  );
  check(
    "28.X9c a third-party / no-brand image path is NOT counted",
    countBrandNamedImagePaths('<img src="/static/hero-photo.png">', ["acme"]) === 0 &&
      countBrandNamedImagePaths('<img src="https://cdn.example.com/x.svg">', ["acme"]) === 0,
  );
  check(
    "28.X9d `data-src` is NOT read: the detector reads props.src only, so the census must not be wider",
    countBrandNamedImagePaths('<img data-src="/AcmeLogo.svg" src="/generic.png">', ["acme"]) === 0,
  );
  check(
    "28.X9e a NON-img element carrying a brand-named url is not an image-logo",
    countBrandNamedImagePaths('<a href="/AcmeLogo.svg">x</a><image src="/AcmeLogo.svg"/>', ["acme"]) === 0,
  );
  check(
    "28.X10 the FLIGHT axis measures the same surface in the encoding the flight actually uses",
    censusFlightPayload('1:T10,[{"src":"/static/AcmeLogo.svg","alt":"x"}]', FIXTURE_HOST, ["acme"]).imageSrcPath >= 1 &&
      flightBrandSurfaceTotal(
        censusFlightPayload('1:T10,[{"src":"/static/AcmeLogo.svg","alt":"x"}]', FIXTURE_HOST, ["acme"]),
      ) >= 1,
    JSON.stringify(censusFlightPayload('1:T10,[{"src":"/static/AcmeLogo.svg","alt":"x"}]', FIXTURE_HOST, ["acme"])),
  );
}

// ---------------------------------------------------------------------------
section("§4 RSC flight census — measured on the bytes of an accepted build");
// ---------------------------------------------------------------------------
{
  if (!existsSync(ACCEPTED_BUILD_SITE)) {
    check("accepted production build is available for the flight census", false, ACCEPTED_BUILD_SITE);
  } else {
    const tokens = brandTokensFromHost("linear.app");
    const html = await readFile(path.join(ACCEPTED_BUILD_SITE, "index.html"), "utf8");
    const txt = await readFile(path.join(ACCEPTED_BUILD_SITE, "index.txt"), "utf8");
    const htmlCensus = censusServedHtml(html, "linear.app", tokens);
    const txtFlight = censusFlightPayload(txt, "linear.app", tokens);
    const inlineChunks = extractInlineFlightChunks(html);
    let inlineFlight = censusFlightPayload("", "linear.app", tokens);
    for (const chunk of inlineChunks) {
      const one = censusFlightPayload(chunk, "linear.app", tokens);
      inlineFlight = {
        ...inlineFlight,
        svgAriaLabel: inlineFlight.svgAriaLabel + one.svgAriaLabel,
        svgSymbolId: inlineFlight.svgSymbolId + one.svgSymbolId,
        lengthPrefixedChunks: inlineFlight.lengthPrefixedChunks + one.lengthPrefixedChunks,
      };
    }
    console.log(
      `  [measured] accepted index.html markup svgAriaLabel=${htmlCensus.svgAriaLabel} ` +
        `svgSymbolId=${htmlCensus.svgSymbolId}; index.txt flight svgAriaLabel=${txtFlight.svgAriaLabel} ` +
        `svgSymbolId=${txtFlight.svgSymbolId} chunks=${txtFlight.lengthPrefixedChunks}; ` +
        `inlined-in-html chunks=${inlineChunks.length} svgAriaLabel=${inlineFlight.svgAriaLabel}`,
    );
    check("the exported HTML markup carries the source brand", htmlCensus.svgAriaLabel > 0, String(htmlCensus.svgAriaLabel));
    check(
      "the .txt RSC flight carries it TOO, in an escaping the markup census cannot see",
      txtFlight.svgAriaLabel > 0,
      String(txtFlight.svgAriaLabel),
    );
    check("the flight is length-prefixed (T<hexlen>, chunks)", txtFlight.lengthPrefixedChunks > 0, String(txtFlight.lengthPrefixedChunks));
    check("the same flight is INLINED in the html as script chunks", inlineChunks.length > 0, String(inlineChunks.length));
    check(
      "the inlined chunks are double-escaped and still measured",
      inlineFlight.svgAriaLabel > 0,
      String(inlineFlight.svgAriaLabel),
    );
    // The flight mixes encodings: a length-prefixed `T<hexlen>,` blob is RAW
    // markup (the markup regex does see it), while the surrounding props are
    // JSON-escaped (it cannot). So the honest statement is not "the markup
    // regex sees nothing" — it is that it UNDERCOUNTS, which is exactly the
    // false-pass hazard. Both numbers are measured here, neither assumed.
    const markupOverFlight = censusServedHtml(txt, "linear.app", tokens);
    console.log(
      `  [measured] markup regex over the RAW flight sees svgAriaLabel=${markupOverFlight.svgAriaLabel} ` +
        `of the ${txtFlight.svgAriaLabel} the flight axis measures`,
    );
    check(
      "a markup-only reader UNDERCOUNTS the flight (the reason the axis exists)",
      markupOverFlight.svgAriaLabel < txtFlight.svgAriaLabel,
      `${markupOverFlight.svgAriaLabel} vs ${txtFlight.svgAriaLabel}`,
    );
    // The observation-evidence exclusion, on the SAME real bytes: it must
    // remove the non-rendered payload WITHOUT blinding the axis.
    const strippedTxt = stripReferencedObservationChunks(txt);
    console.log(
      `  [measured] obs-chunk exclusion removed ${txt.length - strippedTxt.length} of ${txt.length} bytes; ` +
        `flight svgAriaLabel is still ${txtFlight.svgAriaLabel}`,
    );
    check(
      "the observation-evidence exclusion removes bytes but does NOT blind the axis",
      strippedTxt.length < txt.length && txtFlight.svgAriaLabel > 0,
      `${txt.length - strippedTxt.length} bytes removed, svgAriaLabel=${txtFlight.svgAriaLabel}`,
    );
    check("decoding is idempotent once unescaped", decodeFlightPayload(decodeFlightPayload(txt)) === decodeFlightPayload(txt));
    // THE FALSE-PASS HAZARD, as an assertion: markup clean, flight dirty.
    const falsePass = evaluateBrandOutputProof("(in-memory)", {
      census: { svgAriaLabel: 0, svgSymbolId: 0, svgText: 0, imageAlt: 0, ariaLabel: 0 },
      flight: { svgAriaLabel: txtFlight.svgAriaLabel },
      bake: {
        hostsBefore: 1,
        residual: { preservedAfter: 0, unexplainedAfter: [] },
        applied: { replaced: 1, removed: 0, preserved: 0, refused: 0 },
      },
    });
    check(
      "a rewrite that cleans the HTML but not the flight does NOT clear the requirement",
      falsePass.cleared === false && falsePass.renderedClean === false,
      falsePass.detail,
    );
  }
}

// ---------------------------------------------------------------------------
// CANARY — three real builds
// ---------------------------------------------------------------------------

interface CanaryBuild {
  name: string;
  appDir: string;
  outDir: string;
  bake: Awaited<ReturnType<typeof bakeBrand>>;
  census: ReturnType<typeof censusServedHtml>;
  flightCounts: Record<string, number>;
  markupTotal: number;
  flightTotal: number;
  buildMs: number;
  proof: ReturnType<typeof evaluateBrandOutputProof>;
  blockers: number;
}

async function canaryBuild(
  name: string,
  decide: (hosts: readonly BrandHost[], replacementFile: string) => Record<string, BrandDecisionInput>,
): Promise<CanaryBuild> {
  const appDir = path.join(fixtureRoot, "canary", name, "app");
  await copyTemplateApp(ACCEPTED_TEMPLATE, appDir);
  // 1 route keeps the build at ~3 s; the resolver still sees every page.
  const routeMapFile = path.join(appDir, "reconstruction-data", "route-map.json");
  const routeMap = JSON.parse(await readFile(routeMapFile, "utf8")) as {
    routes: Array<{ key: string; path: string; pageFile: string }>;
  };
  routeMap.routes = routeMap.routes.filter((route) => route.key === "/");
  await writeFile(routeMapFile, JSON.stringify(routeMap), "utf8");

  // SYNTHETIC <img> source logo — no accepted template ships one, so this
  // surface class cannot be exercised on real data and says so.
  const pageFile = path.join(appDir, "reconstruction-data", routeMap.routes[0].pageFile);
  const page = JSON.parse(await readFile(pageFile, "utf8")) as {
    desktop: { doc: { c: unknown[] } };
  };
  page.desktop.doc.c.push({
    k: "e",
    n: "n900001",
    t: "img",
    p: {
      src: "https://linear.app/static/LinearLogo.svg",
      srcset: "https://linear.app/static/LinearLogo.svg 1x",
      alt: "Linear logo",
      width: 40,
      height: 40,
    },
  });
  await writeFile(pageFile, JSON.stringify(page), "utf8");

  const replacementFile = path.join(fixtureRoot, "canary", "northwind.svg");
  await mkdir(path.dirname(replacementFile), { recursive: true });
  await writeFile(replacementFile, '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', "utf8");

  const hosts = (await scanAppBrandHosts(appDir, "linear.app")).hosts;
  const bake = await bakeBrand({
    appDir,
    sourceHost: "linear.app",
    decisions: decide(hosts, replacementFile),
    brandName: "Northwind",
    publicAssetUrlFor: await publicBrandAssetCopier(appDir),
  });
  await convertToStaticExport(appDir);
  const buildMs = await buildStaticExport(appDir, () => {});
  const outDir = path.join(appDir, "out");

  const tokens = brandTokensFromHost("linear.app");
  const html = await readFile(path.join(outDir, "index.html"), "utf8");
  const census = censusServedHtml(html, "linear.app", tokens);
  const markupTotal = markupBrandSurfaceTotal(census);
  let flightTotal = 0;
  const flightCounts = { svgAriaLabel: 0, svgSymbolId: 0, svgText: 0, imageSrcPath: 0, imageAlt: 0, ariaLabel: 0 };
  const files = await readdir(outDir);
  for (const file of files.filter((name2) => name2.endsWith(".txt"))) {
    const one = censusFlightPayload(await readFile(path.join(outDir, file), "utf8"), "linear.app", tokens);
    flightCounts.svgAriaLabel += one.svgAriaLabel;
    flightCounts.svgSymbolId += one.svgSymbolId;
    flightCounts.svgText += one.svgText;
    flightCounts.imageSrcPath += one.imageSrcPath;
    flightCounts.imageAlt += one.imageAlt;
    flightCounts.ariaLabel += one.ariaLabel;
    flightTotal += flightBrandSurfaceTotal(one);
  }
  for (const chunk of extractInlineFlightChunks(html)) {
    const one = censusFlightPayload(chunk, "linear.app", tokens);
    flightCounts.svgAriaLabel += one.svgAriaLabel;
    flightCounts.svgSymbolId += one.svgSymbolId;
    flightCounts.imageSrcPath += one.imageSrcPath;
    flightTotal += flightBrandSurfaceTotal(one);
  }
  const proof = evaluateBrandOutputProof(path.join(outDir, "(measured in-suite)"), {
    census,
    flight: flightCounts,
    bake,
  });
  const requirement = sourceBrandAssetRequirement({
    hosts,
    routes: 1,
    templateRunDir: ACCEPTED_TEMPLATE,
    inlineSvgEntryCount: 207,
    productionBuildDir: outDir,
    proof,
  });
  const blockers = releaseBlockers([requirement]).length;
  console.log(
    `  [measured] ${name}: hosts=${bake.hostsBefore} replaced=${bake.applied.replaced} ` +
      `removed=${bake.applied.removed} preserved=${bake.applied.preserved} refused=${bake.applied.refused} ` +
      `unexplained=${bake.residual.unexplainedAfter.length} markup=${markupTotal} flight=${flightTotal} ` +
      `blockers=${blockers} buildMs=${buildMs}`,
  );
  return { name, appDir, outDir, bake, census, flightCounts, markupTotal, flightTotal, buildMs, proof, blockers };
}

function decideAll(hosts: readonly BrandHost[], replacementFile: string): Record<string, BrandDecisionInput> {
  const decisions: Record<string, BrandDecisionInput> = {};
  for (const host of hosts) {
    if (host.surface === "image-logo") {
      decisions[host.id] = { decision: "REPLACE", replacement: { file: replacementFile }, updatedAt: "t" };
    } else if (host.surface === "svg-aria-label" || host.surface === "image-alt") {
      decisions[host.id] = { decision: "REPLACE", replacement: { text: "Northwind" }, updatedAt: "t" };
    } else {
      decisions[host.id] = { decision: "REMOVE", updatedAt: "t" };
    }
  }
  return decisions;
}

// ---------------------------------------------------------------------------
section("§5 CANARY — real next build, BEFORE any decision");
// ---------------------------------------------------------------------------
const beforeBuild = await canaryBuild("before", () => ({}));
{
  check("the source template really does carry brand hosts", beforeBuild.bake.hostsBefore > 0, String(beforeBuild.bake.hostsBefore));
  check("with no decisions, nothing was rewritten", beforeBuild.bake.applied.nodesRewritten === 0);
  check("every host is UNDECIDED", beforeBuild.bake.decisions.undecided === beforeBuild.bake.hostsBefore);
  check("the exported HTML still censuses the source brand", beforeBuild.markupTotal > 0, String(beforeBuild.markupTotal));
  check("the RSC flight still censuses the source brand", beforeBuild.flightTotal > 0, String(beforeBuild.flightTotal));
  check("the requirement does NOT clear", beforeBuild.proof.cleared === false, beforeBuild.proof.detail);
  check("BLOCKERS BEFORE > 0", beforeBuild.blockers === 1, String(beforeBuild.blockers));
}

// ---------------------------------------------------------------------------
section("§5b CANARY — NEGATIVE: a replacement requested, but not effective");
// ---------------------------------------------------------------------------
const negativeBuild = await canaryBuild("negative", (hosts, replacementFile) => {
  const decisions = decideAll(hosts, replacementFile);
  // Every host is decided REPLACE/REMOVE — but the <img> logo's REPLACE names
  // an assetId that does not exist, so the resolver refuses it and the source
  // logo SHIPS. The operator asked; the output did not change; the requirement
  // must refuse to clear.
  for (const host of hosts) {
    if (host.surface === "image-logo") {
      decisions[host.id] = { decision: "REPLACE", replacement: { assetId: "wr28-asset-that-does-not-exist" }, updatedAt: "t" };
    }
  }
  return decisions;
});
{
  check("every host carries a decision", negativeBuild.bake.decisions.undecided === 0, JSON.stringify(negativeBuild.bake.decisions));
  check("the ineffective REPLACE was REFUSED, with a reason", negativeBuild.bake.applied.refused > 0, JSON.stringify(negativeBuild.bake.refusals));
  check(
    "the refused host is still brand-carrying in the built IR",
    negativeBuild.bake.residual.unexplainedAfter.length > 0,
    JSON.stringify(negativeBuild.bake.residual.unexplainedAfter),
  );
  check(
    "REQUESTED IS NOT RESOLVED: the requirement refuses to clear",
    negativeBuild.proof.cleared === false,
    negativeBuild.proof.detail,
  );
  check("BLOCKERS after an ineffective replacement are still > 0", negativeBuild.blockers === 1, String(negativeBuild.blockers));
  const html = await readFile(path.join(negativeBuild.outDir, "index.html"), "utf8");
  check("and the source logo file is still in the shipped HTML", html.includes("LinearLogo.svg"));
  // TASK 28 CLOSE-OUT. This check used to assert `markupTotal === 0` and read
  // "the rendered census ALONE would have passed this build". That was TRUE and
  // it was the bug: the refused host is the synthetic <img> logo, and no census
  // axis measured a brand-named image PATH, so the shipped `LinearLogo.svg` was
  // invisible to the rendered census. It is measured now, so the negative build
  // is caught on BOTH axes — and the old blind spot is asserted explicitly by
  // subtracting the new axis back out.
  const negativeWithoutNewAxis =
    negativeBuild.census.svgAriaLabel +
    negativeBuild.census.svgSymbolId +
    negativeBuild.census.svgText +
    negativeBuild.census.imageAlt +
    negativeBuild.census.ariaLabel;
  check(
    "28.X11 the refused <img> logo is now VISIBLE to the rendered census (it was not before)",
    negativeBuild.census.imageSrcPath >= 1 && negativeBuild.markupTotal >= 1,
    `imageSrcPath=${negativeBuild.census.imageSrcPath} markup=${negativeBuild.markupTotal}`,
  );
  check(
    "28.X11b WITHOUT that axis the census reads 0 — that blind spot is exactly what was fixed",
    negativeWithoutNewAxis === 0,
    JSON.stringify(negativeBuild.census),
  );
  check(
    "the IR set proof ALSO catches it, so the two axes agree instead of one carrying it alone",
    negativeBuild.proof.irClean === false && negativeBuild.proof.cleared === false,
    `irClean=${negativeBuild.proof.irClean} flight=${negativeBuild.flightTotal}`,
  );
}

// ---------------------------------------------------------------------------
section("§5c CANARY — AFTER an authored resolution, verified on the OUTPUT");
// ---------------------------------------------------------------------------
const afterBuild = await canaryBuild("after", decideAll);
{
  check("every host was decided", afterBuild.bake.decisions.undecided === 0, JSON.stringify(afterBuild.bake.decisions));
  check("nothing was refused", afterBuild.bake.applied.refused === 0, JSON.stringify(afterBuild.bake.refusals));
  check(
    "the built app's IR carries NO unexplained brand host",
    afterBuild.bake.residual.unexplainedAfter.length === 0,
    JSON.stringify(afterBuild.bake.residual),
  );
  check("EXPORTED HTML brand surfaces = 0", afterBuild.markupTotal === 0, String(afterBuild.markupTotal));
  check("RSC FLIGHT brand surfaces = 0", afterBuild.flightTotal === 0, String(afterBuild.flightTotal));
  check("the requirement clears on MEASURED OUTPUT", afterBuild.proof.cleared === true, afterBuild.proof.detail);
  check("BLOCKERS AFTER = 0", afterBuild.blockers === 0, String(afterBuild.blockers));
  const html = await readFile(path.join(afterBuild.outDir, "index.html"), "utf8");
  check("the generated wordmark is in the shipped HTML", html.includes(">Northwind</text>"));
  check("the source <img> logo url is gone from the shipped HTML", !html.includes("LinearLogo.svg"));
  check("the self-hosted replacement is served from the package", existsSync(path.join(afterBuild.outDir, "wr", "brand")));
  check(
    "the site's own DOM identity is intact (data-wr-node still present)",
    (html.match(/data-wr-node="/g) ?? []).length > 100,
    String((html.match(/data-wr-node="/g) ?? []).length),
  );
}

// ---------------------------------------------------------------------------
section("§5d CANARY — hydration: what actually renders, not raw bytes");
// ---------------------------------------------------------------------------
let hydrationErrors = 0;
{
  const outDir = afterBuild.outDir;
  const server = createServer((request, response) => {
    const url = (request.url ?? "/").split("?")[0];
    const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
    let file = path.join(outDir, rel);
    if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file) || !file.startsWith(outDir)) {
      response.writeHead(404).end("not found");
      return;
    }
    const type = file.endsWith(".html")
      ? "text/html; charset=utf-8"
      : file.endsWith(".txt")
        ? "text/x-component"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".js")
            ? "text/javascript"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : "application/octet-stream";
    response.writeHead(200, { "content-type": type });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const messages: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") messages.push(message.text());
    });
    page.on("pageerror", (error) => messages.push(String(error)));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    await page.waitForTimeout(900);
    const dom = await page.evaluate(() => document.documentElement.outerHTML);
    const tokens = brandTokensFromHost("linear.app");
    const hydratedCensus = censusServedHtml(dom, "linear.app", tokens);
    hydrationErrors = messages.filter((text) => /hydrat|Minified React error #(418|421|422|423|425)/i.test(text)).length;
    console.log(
      `  [measured] hydrated DOM: svgAriaLabel=${hydratedCensus.svgAriaLabel} svgSymbolId=${hydratedCensus.svgSymbolId} ` +
        `imageAlt=${hydratedCensus.imageAlt} ariaLabel=${hydratedCensus.ariaLabel}; console errors=${messages.length}; ` +
        `hydration errors=${hydrationErrors}`,
    );
    check(
      "the POST-HYDRATION DOM censuses zero brand surfaces (the flight did not revert it)",
      markupBrandSurfaceTotal(hydratedCensus) === 0,
      JSON.stringify(hydratedCensus),
    );
    check("no hydration mismatch was reported", hydrationErrors === 0, messages.join(" | ").slice(0, 400));
    const wordmarks = await page.evaluate(() => document.querySelectorAll("svg text").length);
    check("the generated wordmark is in the LIVE DOM", wordmarks > 0, String(wordmarks));
    const stillBrand = await page.evaluate(() =>
      [...document.querySelectorAll("[aria-label]")].map((element) => element.getAttribute("aria-label") ?? "").join("|"),
    );
    check("no live element announces the source brand", !/linear/i.test(stillBrand), stillBrand.slice(0, 200));

    // THE PRODUCT PATH, end to end: the same clearing rule the release layer
    // runs (`evaluateBrandOutputProof`), fed this build's OWN three axes —
    // exported bytes, RSC flight, and the post-hydration census just measured
    // in a real browser. Nothing in-memory: `hydratedCensus` came out of the
    // live DOM of the served package.
    const liveProof = evaluateBrandOutputProof(
      path.join(outDir, "(measured in-suite)"),
      { census: afterBuild.census, flight: afterBuild.flightCounts, bake: afterBuild.bake },
      { counts: hydratedCensus, routesMeasured: 1 },
    );
    check(
      "the requirement clears with the REAL post-hydration census as the third axis",
      liveProof.cleared === true && liveProof.hydratedBrandSurfaces === 0,
      liveProof.detail,
    );
    const revertedProof = evaluateBrandOutputProof(
      path.join(outDir, "(measured in-suite)"),
      { census: afterBuild.census, flight: afterBuild.flightCounts, bake: afterBuild.bake },
      { counts: { ...hydratedCensus, svgAriaLabel: hydratedCensus.svgAriaLabel + 1 }, routesMeasured: 1 },
    );
    check(
      "and ONE brand surface surviving in the live DOM would have refused to clear it",
      revertedProof.cleared === false,
      revertedProof.detail,
    );
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// ---------------------------------------------------------------------------
section("§5e CANARY — image-logo on REAL data (nextjs.org), two real builds");
// ---------------------------------------------------------------------------
//
// THE CORRECTION THIS SECTION IS. Phase 2 shipped claiming — in this suite's
// own header, in `scanImageLogo`'s doc comment and twice in the handoff — that
// NO accepted template in this repo ships its own logo as an `<img>`, so the
// `image-logo` surface could only be exercised synthetically. That claim was
// FALSE: `data/nextjs.org/recon-templates/2026-08-19T07-12-35-732Z` carries
// 160 image-logo hosts over 40 routes, on two source logotype FILES. The
// surface now runs on that real lineage, end to end, through two real
// `next build`s — nothing here is synthetic.
interface ImageLogoCanary {
  hosts: number;
  bake: Awaited<ReturnType<typeof bakeBrand>>;
  html: string;
  markupTotal: number;
  flightTotal: number;
  blockers: number;
  proof: ReturnType<typeof evaluateBrandOutputProof>;
  buildMs: number;
}

const NEXTJS_TEMPLATE = path.resolve(
  "data/nextjs.org/recon-templates/2026-08-19T07-12-35-732Z/app",
);
const NEXTJS_HOST = "nextjs.org";

async function imageLogoCanary(
  name: string,
  decide: (hosts: readonly BrandHost[], replacementFile: string) => Record<string, BrandDecisionInput>,
): Promise<ImageLogoCanary> {
  const appDir = path.join(fixtureRoot, "nextjs", name, "app");
  await copyTemplateApp(NEXTJS_TEMPLATE, appDir);
  const routeMapFile = path.join(appDir, "reconstruction-data", "route-map.json");
  const routeMap = JSON.parse(await readFile(routeMapFile, "utf8")) as {
    routes: Array<{ path: string; pageFile: string; title?: string }>;
  };
  // 1 route keeps each build at ~2.6 s. The full-template count (160 hosts /
  // 40 routes) is measured without building, in §5f.
  routeMap.routes = routeMap.routes.filter((route) => route.path === "/");
  await writeFile(routeMapFile, JSON.stringify(routeMap), "utf8");

  const replacementFile = path.join(fixtureRoot, "nextjs", "northwind-mark.svg");
  await mkdir(path.dirname(replacementFile), { recursive: true });
  await writeFile(replacementFile, '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', "utf8");

  const hosts = (await scanAppBrandHosts(appDir, NEXTJS_HOST)).hosts;
  const bake = await bakeBrand({
    appDir,
    sourceHost: NEXTJS_HOST,
    decisions: decide(hosts, replacementFile),
    brandName: "Northwind",
    publicAssetUrlFor: await publicBrandAssetCopier(appDir),
  });
  await convertToStaticExport(appDir);
  const buildMs = await buildStaticExport(appDir, () => {});
  const outDir = path.join(appDir, "out");
  const tokens = bake.brandTokens;
  const html = await readFile(path.join(outDir, "index.html"), "utf8");
  const census = censusServedHtml(html, NEXTJS_HOST, tokens);
  const markupTotal = markupBrandSurfaceTotal(census);
  const flightCounts = { svgAriaLabel: 0, svgSymbolId: 0, svgText: 0, imageSrcPath: 0, imageAlt: 0, ariaLabel: 0 };
  let flightTotal = 0;
  for (const file of (await readdir(outDir)).filter((f) => f.endsWith(".txt"))) {
    const one = censusFlightPayload(await readFile(path.join(outDir, file), "utf8"), NEXTJS_HOST, tokens);
    flightCounts.imageSrcPath += one.imageSrcPath;
    flightCounts.imageAlt += one.imageAlt;
    flightCounts.ariaLabel += one.ariaLabel;
    flightCounts.svgAriaLabel += one.svgAriaLabel;
    flightCounts.svgSymbolId += one.svgSymbolId;
    flightCounts.svgText += one.svgText;
    flightTotal += flightBrandSurfaceTotal(one);
  }
  for (const chunk of extractInlineFlightChunks(html)) {
    const one = censusFlightPayload(chunk, NEXTJS_HOST, tokens);
    flightCounts.imageSrcPath += one.imageSrcPath;
    flightCounts.imageAlt += one.imageAlt;
    flightCounts.ariaLabel += one.ariaLabel;
    flightTotal += flightBrandSurfaceTotal(one);
  }
  const proof = evaluateBrandOutputProof(path.join(outDir, "(measured in-suite)"), {
    census,
    flight: flightCounts,
    bake,
  });
  const blockers = releaseBlockers([
    sourceBrandAssetRequirement({
      hosts,
      routes: 1,
      templateRunDir: NEXTJS_TEMPLATE,
      inlineSvgEntryCount: 0,
      productionBuildDir: outDir,
      proof,
    }),
  ]).length;
  console.log(
    `  [measured] nextjs ${name}: hosts=${bake.hostsBefore} replaced=${bake.applied.replaced} ` +
      `refused=${bake.applied.refused} unexplained=${bake.residual.unexplainedAfter.length} ` +
      `markup=${markupTotal} flight=${flightTotal} blockers=${blockers} buildMs=${buildMs}`,
  );
  return { hosts: hosts.length, bake, html, markupTotal, flightTotal, blockers, proof, buildMs };
}

const SOURCE_LOGOTYPE = /nextjs-logotype-(light|dark)/;
const nextjsBefore = await imageLogoCanary("before", () => ({}));
{
  // EXACT counts, not a proxy. This check previously asserted that EVERY host
  // on this route is an image-logo; that stopped being true when the alt
  // matcher was aligned with the detector (Task 28 close-out), because the same
  // logotype <img> elements carry `alt="NextjsLogotype"` — a camel-cased brand
  // token the old word-boundary matcher could not see, on 8 of them here.
  check(
    "the REAL nextjs.org template ships its own logo as an <img> (the claim that none does was false)",
    nextjsBefore.bake.hostsBeforeBySurface["image-logo"] === 4 &&
      nextjsBefore.bake.hostsBeforeBySurface["image-alt"] === 8 &&
      nextjsBefore.hosts === 12,
    `${nextjsBefore.hosts} host(s), bySurface=${JSON.stringify(nextjsBefore.bake.hostsBeforeBySurface)}`,
  );
  check(
    "28.X12 the aligned alt matcher SEES the camel-cased source alt on that same <img> lineage",
    nextjsBefore.html.includes("NextjsLogotype") &&
      (nextjsBefore.bake.hostsBeforeBySurface["image-alt"] ?? 0) > 0,
    `alt in shipped html=${String(nextjsBefore.html.includes("NextjsLogotype"))} ` +
      `image-alt hosts=${nextjsBefore.bake.hostsBeforeBySurface["image-alt"] ?? 0}`,
  );
  check(
    "undecided, the SOURCE logotype file still ships in the built HTML",
    SOURCE_LOGOTYPE.test(nextjsBefore.html),
    `logotype present=${String(SOURCE_LOGOTYPE.test(nextjsBefore.html))}`,
  );
  check(
    "and the requirement BLOCKS on the real image-logo lineage",
    nextjsBefore.blockers === 1 && nextjsBefore.proof.cleared === false,
    nextjsBefore.proof.detail,
  );
}

const nextjsAfter = await imageLogoCanary("after", (hosts, replacementFile) => {
  const decisions: Record<string, BrandDecisionInput> = {};
  for (const host of hosts) {
    decisions[host.id] = { decision: "REPLACE", replacement: { file: replacementFile }, updatedAt: "t" };
  }
  return decisions;
});
{
  check(
    "every REAL image-logo host is REPLACED, none refused",
    nextjsAfter.bake.applied.replaced === nextjsAfter.hosts && nextjsAfter.bake.applied.refused === 0,
    JSON.stringify(nextjsAfter.bake.applied),
  );
  check(
    "the source logotype FILE is gone from the shipped HTML",
    !SOURCE_LOGOTYPE.test(nextjsAfter.html),
  );
  check(
    "replaced by a self-hosted, served brand asset url",
    /\/wr\/brand\/[0-9a-f]+\.svg/.test(nextjsAfter.html),
    (nextjsAfter.html.match(/\/wr\/brand\/[0-9a-f]+\.svg/) ?? ["(none)"])[0],
  );
  check(
    "no source srcset survived to re-introduce the source file",
    !/srcset="[^"]*nextjs-logotype/.test(nextjsAfter.html),
  );
  check(
    "the REAL image-logo lineage clears by OUTPUT PROOF, on both byte axes",
    nextjsAfter.proof.clearedBy === "output-proof" &&
      nextjsAfter.markupTotal === 0 &&
      nextjsAfter.flightTotal === 0 &&
      nextjsAfter.blockers === 0,
    `clearedBy=${String(nextjsAfter.proof.clearedBy)} markup=${nextjsAfter.markupTotal} ` +
      `flight=${nextjsAfter.flightTotal} blockers=${nextjsAfter.blockers}`,
  );
}

// ---------------------------------------------------------------------------
section("§5f detection is token-derived — and the tokens now include the name the SOURCE declares");
// ---------------------------------------------------------------------------
//
// The blocker's trigger is `brandCarryingHostCount > 0`, so a brand the token
// detector cannot see raises NOTHING AT ALL — measured, `domainchecker.co.kr`
// had 794 inline SVGs, 0 detected hosts and no requirement, while its header
// shipped `aria-label="도메인체커 홈"`, the site's own name in Korean, on a
// surface this resolver owns. Tokens are now the host label WIDENED by the
// name the source declares in its own titles. Measured on real templates.
{
  check(
    "a declared name that IS the host label adds nothing",
    declaredBrandNamesFromTitles(["Docs | Linear", "Method | Linear"]).join() === "linear" &&
      brandTokensFrom("linear.app", ["linear"]).join() === "linear",
    JSON.stringify(brandTokensFrom("linear.app", ["linear"])),
  );
  check(
    "a one-off trailing phrase is NOT a declared name (it must recur across a majority)",
    declaredBrandNamesFromTitles(["A | Acme", "B | Acme", "C | Something Else", "D | Acme"]).join() ===
      "acme",
    JSON.stringify(declaredBrandNamesFromTitles(["A | Acme", "B | Acme", "C | Something Else", "D | Acme"])),
  );
  check(
    "the ASCII hyphen is not a title separator (it would manufacture names)",
    declaredBrandNamesFromTitles([
      "Next.js by Vercel - The React Framework",
      "Foo - The React Framework",
    ]).length === 0,
  );
  check(
    "a declared token is regex-ESCAPED, so `next.js` does not match `nextXjs`",
    containsBrandToken("Deploy nextXjs today", "next.js") === false &&
      containsBrandToken("Deploy Next.js today", "next.js") === true,
  );

  const domaincheckerTemplate = path.resolve(
    "data/domainchecker.co.kr/recon-templates/2026-08-19T07-14-22-868Z/app",
  );
  if (existsSync(domaincheckerTemplate)) {
    const hostOnly = await scanAppBrandHosts(
      domaincheckerTemplate,
      "domainchecker.co.kr",
      brandTokensFromHost("domainchecker.co.kr"),
    );
    const widened = await scanAppBrandHosts(domaincheckerTemplate, "domainchecker.co.kr");
    const koreanLabels = widened.hosts.filter((host) =>
      host.values.some((value) => value.includes("도메인체커")),
    );
    console.log(
      `  [measured] domainchecker.co.kr: host-only=${hostOnly.hosts.length} widened=${widened.hosts.length} ` +
        `tokens=${JSON.stringify(await appBrandTokens(domaincheckerTemplate, "domainchecker.co.kr"))}`,
    );
    check(
      "the host-only detector was BLIND on domainchecker.co.kr (0 hosts, so NO requirement at all)",
      hostOnly.hosts.length === 0,
      String(hostOnly.hosts.length),
    );
    check(
      "the declared-name widening SEES it — the Korean brand aria-label is now a counted host",
      widened.hosts.length > 0 && koreanLabels.length > 0,
      `${widened.hosts.length} host(s), ${koreanLabels.length} carrying 도메인체커`,
    );
    // The EMISSION GATE, exactly as src/release/collect.ts applies it: the
    // requirement exists only when the scan found a host, which is why a blind
    // detector makes the blocker VANISH rather than merely undercount.
    const emitted = (hosts: typeof widened.hosts): Requirement[] =>
      hosts.length === 0
        ? []
        : [
            sourceBrandAssetRequirement({
              hosts,
              routes: widened.routes,
              templateRunDir: domaincheckerTemplate,
              inlineSvgEntryCount: 794,
              productionBuildDir: null,
              proof: null,
            }),
          ];
    check(
      "host-only: the blocker is not merely smaller, it is NOT EMITTED AT ALL",
      emitted(hostOnly.hosts).length === 0 && releaseBlockers(emitted(hostOnly.hosts)).length === 0,
    );
    check(
      "widened: the blocker is raised on that lineage instead of going silent",
      releaseBlockers(emitted(widened.hosts)).length === 1,
      `${emitted(widened.hosts).length} requirement(s)`,
    );
  } else {
    check("domainchecker.co.kr template present for the blindness measurement", false, domaincheckerTemplate);
  }

  const linearWide = await scanAppBrandHosts(ACCEPTED_TEMPLATE, "linear.app");
  const linearHostOnly = await scanAppBrandHosts(
    ACCEPTED_TEMPLATE,
    "linear.app",
    brandTokensFromHost("linear.app"),
  );
  check(
    "widening did NOT churn the verified linear.app count (its declared name IS its host label)",
    linearWide.hosts.length === linearHostOnly.hosts.length && linearWide.hosts.length === 80,
    `${linearHostOnly.hosts.length} -> ${linearWide.hosts.length}`,
  );

  const nextjsWide = await scanAppBrandHosts(NEXTJS_TEMPLATE, NEXTJS_HOST);
  const nextjsImageLogo = nextjsWide.hosts.filter((host) => host.surface === "image-logo");
  console.log(
    `  [measured] nextjs.org full template: hosts=${nextjsWide.hosts.length} over ${nextjsWide.routes} routes ` +
      `(image-logo=${nextjsImageLogo.length})`,
  );
  check(
    "the FULL nextjs.org template carries 160 real image-logo hosts over 40 routes",
    nextjsImageLogo.length === 160 && nextjsWide.routes === 40,
    `${nextjsImageLogo.length} image-logo host(s) over ${nextjsWide.routes} route(s)`,
  );
  check(
    "on two distinct SOURCE logotype files (this is a real logo shipped as an <img>)",
    new Set(nextjsImageLogo.flatMap((host) => host.values)).size === 2,
    JSON.stringify([...new Set(nextjsImageLogo.flatMap((host) => host.values))].map((v) => v.slice(-40))),
  );
}

// ---------------------------------------------------------------------------
section("§6 the canary's numbers, side by side");
// ---------------------------------------------------------------------------
{
  console.log(
    `  [canary] BEFORE blockers=${beforeBuild.blockers} (markup=${beforeBuild.markupTotal} flight=${beforeBuild.flightTotal}); ` +
      `NEGATIVE blockers=${negativeBuild.blockers} (refused=${negativeBuild.bake.applied.refused}); ` +
      `AFTER blockers=${afterBuild.blockers} (markup=${afterBuild.markupTotal} flight=${afterBuild.flightTotal}); ` +
      `hydrationErrors=${hydrationErrors}`,
  );
  check("the canary moved the blocker from 1 to 0 through OUTPUT, not through a decision", beforeBuild.blockers === 1 && afterBuild.blockers === 0);
  check(
    "and the ineffective request in between did NOT move it",
    negativeBuild.blockers === 1,
  );
  check(
    "the brand-carrying host count is far below the old inline-svg count (207)",
    beforeBuild.bake.hostsBefore < 207 && beforeBuild.bake.hostsBefore > 0,
    String(beforeBuild.bake.hostsBefore),
  );
}

await rm(fixtureRoot, { recursive: true, force: true });
console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
