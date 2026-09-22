import { createServer, type Server } from "node:http";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  MAX_ROOT_CUSTOM_PROPERTIES,
  PageObservationSchema,
  ROOT_CUSTOM_PROPERTY_VALUE_MAX_LEN,
  RootCustomPropertiesSchema,
  type ObservedPage,
  type ObservedViewport,
  type RootCustomProperty,
} from "../src/observer/types.js";
import { observePage } from "../src/observer/observe-page.js";
import { saveObservationIntoDir } from "../src/observer/store.js";
import {
  AssetCatalogBuilder,
  StyleCatalogBuilder,
  compileViewport,
} from "../src/sitespec/index.js";
import { PageSpecSchema, ViewportPageSpecSchema } from "../src/sitespec/types.js";
import {
  generateCustomPropertyCss,
  isSafeCustomPropertyName,
  type CustomPropertyScope,
  type GeneratedCustomProperties,
} from "../src/reconstruction/style-generator.js";
import { statsFrom } from "../src/reconstruction/generate-app.js";
import { ManifestStatsSchema } from "../src/reconstruction/types.js";
import type { ReconstructionPlan } from "../src/reconstruction/plan-reconstruction.js";

/**
 * Task 28.5B Change 5 — SOURCE `:root` CUSTOM PROPERTIES, PER VIEWPORT.
 *
 * 28.5A established the gap: the pipeline discarded every source custom
 * property even though surviving values still referenced them. The consumer
 * that actually needs them is INLINE SVG — `collect-dom.ts` captures an `<svg>`
 * root as literal `outerHTML`, so `fill="var(--brand)"` reached the clone
 * verbatim with nothing to resolve against and painted black.
 *
 * The fixture below is built so the answer cannot be faked by a universal map:
 * `--brand` is `#112233` at 1440 and `#445566` at 390, because a media query
 * says so. The suite runs the REAL observer in real Chromium, the REAL viewport
 * compiler, the REAL emitter, and then renders the emitted CSS around the REAL
 * captured SVG markup in Chromium to read `getComputedStyle().fill` back out of
 * each viewport's subtree.
 *
 * Nothing here is site-specific and nothing is hand-injected: every artifact
 * under test is produced by the pipeline's own code paths during the run.
 */

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log("");
  console.log(title);
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/*
 * `--brand`      : the mandated test — the SAME name, a DIFFERENT value at 390.
 * `--gap`        : identical at both viewports, and consumed by a normal
 *                  property, so the record is not only about SVG.
 * `--unused-tone`: declared on `:root` and referenced by nobody. Captured on
 *                  purpose: this build captures ALL root custom properties
 *                  rather than trying to guess which `var()` references survive
 *                  compilation, because "referenced" is not decidable at
 *                  capture time (a reference can live inside opaque SVG markup,
 *                  a pseudo-element, or a rule that only matches after a click).
 * `--local-only` : declared on `.badge`, NOT on the root. It must NOT appear —
 *                  it does not resolve on the document element, so emitting it
 *                  on the variant wrapper would invent an inherited value the
 *                  source page never gave that subtree.
 */
const FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Custom property fixture</title>
<style>
  :root {
    --brand: #112233;
    --gap: 24px;
    --unused-tone: #90a4ae;
  }
  @media (max-width: 500px) {
    :root { --brand: #445566; }
  }
  html { background: #ffffff; }
  body { margin: 0; padding: var(--gap); font-family: system-ui, sans-serif; }
  .badge { --local-only: 3px; display: block; }
</style>
</head>
<body>
  <h1>Custom property fixture</h1>
  <p>The mark below paints with <code>var(--brand)</code>.</p>
  <svg class="badge" width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="40" height="40" fill="var(--brand)"></rect></svg>
</body>
</html>
`;

/*
 * SECOND fixture — the reach cases the first one cannot express.
 *
 * The first fixture's names all live in an ordinary `<style>` element, which is
 * exactly the one channel `document.styleSheets` already exposed. This page adds
 * the four shapes the corrected discovery had to grow to reach:
 *
 *   ADOPTED SHEET   a `new CSSStyleSheet()` put on `document.adoptedStyleSheets`.
 *                   `document.styleSheets` does NOT list it, so before the
 *                   correction every name below contributed exactly nothing —
 *                   which is the whole reason linear.app measured 0 names while
 *                   its one adopted sheet held 135. `--ad-brand` differs per
 *                   viewport through an `@media` INSIDE the adopted sheet, so
 *                   the per-viewport guarantee is proved on this channel too.
 *   NESTING         `:root { … & { … } }` and `:root { … @media { … } }`, in the
 *                   adopted sheet AND in a plain `<style>`. Chromium gives every
 *                   CSSStyleRule a (usually empty) `cssRules`, so the old
 *                   `else if (rule.cssRules)` never reached a nested block.
 *   UPPERCASE       `HTML` and `:ROOT`. Chromium NORMALIZES both in
 *                   `selectorText`, so this asserts the end-to-end requirement
 *                   rather than the matcher; the matcher's case-insensitivity is
 *                   defensive, for a serialization that does not normalise.
 *   UNRESOLVING     declared under `:root` inside `@media (min-width: 9999px)`:
 *                   genuinely discovered, and genuinely absent from the cascade
 *                   at BOTH observed viewports. It must be DROPPED and COUNTED.
 */
const ADOPTED_FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Adopted stylesheet fixture</title>
<style>
  html { background: #ffffff; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  :root { --doc-nest-parent: 1px; & { --doc-nest-amp: 2px; } }
  :root {
    --doc-never-parent: 1px;
    @media (min-width: 9999px) { --doc-never-nested: 3px; }
  }
</style>
<script>
  var wrSheet = new CSSStyleSheet();
  wrSheet.replaceSync([
    ":root { --ad-brand: #a10000; --ad-gap: 12px; }",
    "@media (max-width: 500px) { :root { --ad-brand: #00a100; } }",
    "@media (min-width: 9999px) { :root { --ad-never: #123456; } }",
    "HTML { --ad-upper-html: 2px; }",
    ":ROOT { --ad-upper-root: 3px; }",
    ":root { --ad-nest-parent: 6px; & { --ad-nest-amp: 7px; } }",
    ":root { --ad-nest-parent2: 8px; @media (min-width: 10px) { --ad-nest-media: 9px; } }",
  ].join(" "));
  document.adoptedStyleSheets = [wrSheet];
</script>
</head>
<body>
  <h1>Adopted stylesheet fixture</h1>
  <svg class="ad-badge" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="24" height="24" fill="var(--ad-brand)"></rect></svg>
</body>
</html>
`;

/*
 * THIRD fixture — the channel NO sheet walk can reach.
 *
 * On linear.app the tokens the page paints with are served from a cross-origin
 * host: `sheet.cssRules` THROWS, so the 16 names its 239 inline SVGs reference
 * are unknowable from the CSSOM, while `getComputedStyle` resolves 11 of them
 * without complaint. The VALUES are reachable; only the NAMES are missing.
 *
 * A cross-origin sheet cannot be served from this in-process fixture server
 * without a second origin, so the same OBSERVABLE shape is built instead: every
 * name below is declared on a NON-ROOT selector, which name discovery (root
 * selector parts only) is documented never to look at, and which does not
 * resolve on the document element either. Discovery therefore finds exactly
 * NOTHING here — `discoveredCount` is asserted to be 0 — and anything captured
 * can only have come from reference-driven discovery.
 *
 *   --hidden-brand   declared on `.wrap`, referenced by an SVG inside `.wrap`,
 *                    and given a DIFFERENT value at 390 by an @media on that
 *                    same non-root rule. Proves the resolution is per viewport
 *                    AND performed at the consuming element.
 *   --clash-tone     declared twice, on `.zone-a` and `.zone-b`, with an SVG in
 *                    each. Two consuming elements, two different values, one
 *                    wrapper-level slot: the first element in DOCUMENT ORDER
 *                    must win and the disagreement must be counted.
 *   --never-anywhere referenced by an SVG and declared by nobody. Must be
 *                    counted unresolved, never invented.
 */
const HIDDEN_FIXTURE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reference-driven discovery fixture</title>
<style>
  html { background: #ffffff; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  .wrap { --hidden-brand: #b00020; }
  @media (max-width: 500px) { .wrap { --hidden-brand: #0020b0; } }
  .zone-a { --clash-tone: #010203; }
  .zone-b { --clash-tone: #040506; }
</style>
</head>
<body>
  <h1>Reference-driven discovery fixture</h1>
  <div class="wrap"><svg class="hidden-badge" width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="30" height="30" fill="var(--hidden-brand)"></rect></svg></div>
  <div class="zone-a"><svg class="clash-a" width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10" fill="var(--clash-tone)"></rect></svg></div>
  <div class="zone-b"><svg class="clash-b" width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10" fill="var(--clash-tone)"></rect></svg></div>
  <svg class="orphan" width="10" height="10" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10" fill="var(--never-anywhere)"></rect></svg>
</body>
</html>
`;

/** Every name the corrected discovery must find on `/adopted`, and its fate. */
const ADOPTED_EXPECTED_RESOLVED: Record<string, string> = {
  "--ad-gap": "12px",
  "--ad-nest-amp": "7px",
  "--ad-nest-media": "9px",
  "--ad-nest-parent": "6px",
  "--ad-nest-parent2": "8px",
  "--ad-upper-html": "2px",
  "--ad-upper-root": "3px",
  "--doc-nest-amp": "2px",
  "--doc-nest-parent": "1px",
  "--doc-never-parent": "1px",
};
/** Discovered in a sheet, absent from the cascade at both viewports. */
const ADOPTED_EXPECTED_UNRESOLVED = ["--ad-never", "--doc-never-nested"];

interface Fixture {
  server: Server;
  baseUrl: string;
  stop: () => Promise<void>;
}

async function startFixtureServer(): Promise<Fixture> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(FIXTURE_HTML);
      return;
    }
    if (url.pathname === "/adopted") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(ADOPTED_FIXTURE_HTML);
      return;
    }
    if (url.pathname === "/hidden") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(HIDDEN_FIXTURE_HTML);
      return;
    }
    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body>not found</body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function valueOf(
  properties: readonly RootCustomProperty[],
  name: string,
): string | undefined {
  return properties.find((entry) => entry.name === name)?.value;
}

function isSortedByName(properties: readonly RootCustomProperty[]): boolean {
  for (let i = 1; i < properties.length; i++) {
    if (!(properties[i - 1]!.name < properties[i]!.name)) return false;
  }
  return true;
}

function viewportOf(observed: ObservedPage, id: string): ObservedViewport {
  const found = observed.viewports.find((v) => v.profile.id === id);
  if (!found) throw new Error(`observation has no ${id} viewport`);
  return found;
}

/*
 * The smallest object `statsFrom` reads. Everything except `customProperties`
 * is a zero: this asserts the WIRING — that the emitter's counters reach the
 * manifest `stats` block — not the unrelated counters, which the reconstruction
 * suite already covers end to end.
 */
function planWith(customProperties: GeneratedCustomProperties): ReconstructionPlan {
  const zeroCounters = {
    elementNodes: 0,
    textNodes: 0,
    styledNodes: 0,
    generatedDomIds: 0,
    rewrittenIdrefTokens: 0,
    unresolvedIdrefTokens: 0,
    scrollStateNodes: 0,
    scrollRestoreNodes: 0,
    nestingAdaptations: 0,
    elementAssetsRequested: 0,
    resolvedImageSrc: 0,
    resolvedSrcset: 0,
    inlineSvgRendered: 0,
    unresolvedElementAssets: 0,
    droppedSrcsetCandidates: 0,
    remoteAssetUrls: 0,
    internalLinksRewritten: 0,
    unresolvedInternalLinks: 0,
    externalLinks: 0,
    skippedSourceNodes: 0,
  };
  return {
    counters: zeroCounters,
    routes: { routes: [] },
    pages: [],
    styles: { missingTokens: [], ruleCount: 0 },
    pseudoStyles: { ruleCount: 0 },
    interactions: {
      bindings: new Map(),
      unknowns: new Map(),
      nativeBindings: 0,
      scriptedBindings: 0,
      dynamicTargets: 0,
      dynamicTargetsWithContent: 0,
      dynamicTemplateNodes: 0,
      interactionStateConflicts: 0,
    },
    customProperties,
  } as unknown as ReconstructionPlan;
}

const TMP_ROOT = path.join("tmp", "wr285b", "customprops");

async function main(): Promise<void> {
  console.log("[smoke:custom-properties] Task 28.5B §5 — per-viewport :root custom properties");

  const fixture = await startFixtureServer();
  let observed: ObservedPage;
  let observedAdopted: ObservedPage;
  let observedHidden: ObservedPage;
  try {
    section("§1 capture — the real observer, real Chromium, both viewports");
    observed = await observePage(`${fixture.baseUrl}/`, {
      onLog: (message) => console.log(`        ${message}`),
    });
    // Same observer, same run, second fixture — the adopted-sheet / nesting /
    // uppercase / unresolving cases (§6). Observed here so the fixture server
    // is still up; asserted further down where the rest of capture is asserted.
    observedAdopted = await observePage(`${fixture.baseUrl}/adopted`, {
      onLog: (message) => console.log(`        ${message}`),
    });
    // Third fixture — reference-driven discovery (§8). Same observer, same run.
    observedHidden = await observePage(`${fixture.baseUrl}/hidden`, {
      onLog: (message) => console.log(`        ${message}`),
    });
  } finally {
    await fixture.stop();
  }

  const desktopV = viewportOf(observed, "desktop");
  const mobileV = viewportOf(observed, "mobile");
  const desktopRecord = desktopV.customProperties;
  const mobileRecord = mobileV.customProperties;

  check("desktop viewport carries a custom-property record", desktopRecord !== undefined);
  check("mobile viewport carries a custom-property record", mobileRecord !== undefined);
  if (!desktopRecord || !mobileRecord) {
    console.log("");
    console.log("[smoke:custom-properties] FAILED — no record captured; nothing further to test");
    process.exitCode = 1;
    return;
  }

  const desktopProps = desktopRecord.properties;
  const mobileProps = mobileRecord.properties;

  check(
    "desktop --brand is the wide-viewport value (#112233)",
    valueOf(desktopProps, "--brand") === "#112233",
    `got ${String(valueOf(desktopProps, "--brand"))}`,
  );
  check(
    "mobile --brand is the MEDIA-QUERY value (#445566) — not the desktop one",
    valueOf(mobileProps, "--brand") === "#445566",
    `got ${String(valueOf(mobileProps, "--brand"))}`,
  );
  check(
    "the same property genuinely DIFFERS between the two viewports",
    valueOf(desktopProps, "--brand") !== valueOf(mobileProps, "--brand"),
  );
  check(
    "--gap is identical at both viewports (24px)",
    valueOf(desktopProps, "--gap") === "24px" && valueOf(mobileProps, "--gap") === "24px",
  );
  check(
    "an unreferenced root custom property is captured too (--unused-tone)",
    valueOf(desktopProps, "--unused-tone") === "#90a4ae",
    `got ${String(valueOf(desktopProps, "--unused-tone"))}`,
  );
  check(
    "a NON-root custom property is NOT captured (--local-only)",
    valueOf(desktopProps, "--local-only") === undefined &&
      valueOf(mobileProps, "--local-only") === undefined,
  );
  check(
    "no property name lost its case or its `--` prefix",
    desktopProps.every((entry) => entry.name.startsWith("--")),
  );
  check(
    "desktop record is sorted by name, ascending, no duplicates",
    isSortedByName(desktopProps),
    desktopProps.map((e) => e.name).join(","),
  );
  check("mobile record is sorted by name, ascending, no duplicates", isSortedByName(mobileProps));
  check(
    "discoveredCount matches what was kept when no cap fired",
    desktopRecord.discoveredCount === 3 &&
      !desktopRecord.countCapped &&
      desktopRecord.valueCappedCount === 0,
    JSON.stringify({
      discoveredCount: desktopRecord.discoveredCount,
      countCapped: desktopRecord.countCapped,
      valueCappedCount: desktopRecord.valueCappedCount,
    }),
  );
  check(
    "caps are exported, positive, integral and sane",
    Number.isInteger(MAX_ROOT_CUSTOM_PROPERTIES) &&
      MAX_ROOT_CUSTOM_PROPERTIES > 0 &&
      MAX_ROOT_CUSTOM_PROPERTIES <= 10_000 &&
      Number.isInteger(ROOT_CUSTOM_PROPERTY_VALUE_MAX_LEN) &&
      ROOT_CUSTOM_PROPERTY_VALUE_MAX_LEN > 0 &&
      ROOT_CUSTOM_PROPERTY_VALUE_MAX_LEN <= 10_000,
    `${MAX_ROOT_CUSTOM_PROPERTIES} / ${ROOT_CUSTOM_PROPERTY_VALUE_MAX_LEN}`,
  );
  check(
    "the record round-trips through its own schema",
    RootCustomPropertiesSchema.safeParse(desktopRecord).success &&
      RootCustomPropertiesSchema.safeParse(mobileRecord).success,
  );
  check(
    "unresolvedCount is 0 here — every discovered name resolved (no false loss)",
    desktopRecord.unresolvedCount === 0 && mobileRecord.unresolvedCount === 0,
    JSON.stringify({
      desktop: desktopRecord.unresolvedCount,
      mobile: mobileRecord.unresolvedCount,
    }),
  );
  check(
    "the schema still accepts a record WITHOUT unresolvedCount (additive)",
    RootCustomPropertiesSchema.safeParse({
      properties: [],
      discoveredCount: 0,
      countCapped: false,
      valueCappedCount: 0,
    }).success,
  );

  // -------------------------------------------------------------------------
  section("§2 storage — embedded per viewport in observation.json");
  // -------------------------------------------------------------------------
  await rm(TMP_ROOT, { recursive: true, force: true });
  await mkdir(TMP_ROOT, { recursive: true });
  const runDir = path.join(TMP_ROOT, "observation");
  try {
    await saveObservationIntoDir(runDir, observed);
    const reloaded = PageObservationSchema.parse(
      JSON.parse(await readFile(path.join(runDir, "observation.json"), "utf8")),
    );
    const savedDesktop = reloaded.viewports.desktop.customProperties;
    const savedMobile = reloaded.viewports.mobile.customProperties;
    check(
      "observation.json keeps the desktop record verbatim",
      JSON.stringify(savedDesktop) === JSON.stringify(desktopRecord),
    );
    check(
      "observation.json keeps the mobile record verbatim",
      JSON.stringify(savedMobile) === JSON.stringify(mobileRecord),
    );
    check(
      "the two persisted records are NOT flattened into one map",
      savedDesktop !== undefined &&
        savedMobile !== undefined &&
        valueOf(savedDesktop.properties, "--brand") !==
          valueOf(savedMobile.properties, "--brand"),
    );

    // -----------------------------------------------------------------------
    section("§3 SiteSpec — per-viewport threading, and historical parse");
    // -----------------------------------------------------------------------
    const styleBuilder = new StyleCatalogBuilder();
    const assetBuilder = new AssetCatalogBuilder(`${fixture.baseUrl}/`);
    const compiledByViewport = new Map<string, ReturnType<typeof compileViewport>>();
    for (const viewport of [desktopV, mobileV]) {
      compiledByViewport.set(
        viewport.profile.id,
        compileViewport({
          pageId: "p000001",
          profile: viewport.profile,
          metadata: viewport.metadata,
          elements: viewport.elements,
          styleTable: viewport.styleTable,
          assets: viewport.assets,
          frames: viewport.frames,
          shadow: viewport.shadow,
          renderedHtml: viewport.renderedHtml,
          styleBuilder,
          assetBuilder,
          ...(viewport.customProperties !== undefined
            ? { customProperties: viewport.customProperties }
            : {}),
        }),
      );
    }
    const desktopSpec = ViewportPageSpecSchema.parse(
      compiledByViewport.get("desktop")!.spec,
    );
    const mobileSpec = ViewportPageSpecSchema.parse(compiledByViewport.get("mobile")!.spec);

    check(
      "compiled desktop ViewportPageSpec carries the record",
      desktopSpec.customProperties !== undefined &&
        valueOf(desktopSpec.customProperties.properties, "--brand") === "#112233",
    );
    check(
      "compiled mobile ViewportPageSpec carries ITS OWN record",
      mobileSpec.customProperties !== undefined &&
        valueOf(mobileSpec.customProperties.properties, "--brand") === "#445566",
    );
    check(
      "the SiteSpec schema accepts a viewport spec WITHOUT the field (additive)",
      ViewportPageSpecSchema.safeParse({
        ...desktopSpec,
        customProperties: undefined,
      }).success,
    );

    // Historical artifacts, read-only, through the CURRENT schemas.
    const oldObservation = path.join(
      "data",
      "linear.app",
      "site-observations",
      "2026-08-25T19-23-01-716Z",
      "pages",
      "p000002",
      "observation.json",
    );
    const oldPageSpec = path.join(
      "data",
      "linear.app",
      "site-specs",
      "2026-08-25T20-30-27-653Z",
      "pages",
      "p000001.json",
    );
    const historicalObservation = PageObservationSchema.safeParse(
      JSON.parse(await readFile(oldObservation, "utf8")),
    );
    check(
      "a PRE-28.5B observation.json still parses against the current schema",
      historicalObservation.success,
      historicalObservation.success ? "" : historicalObservation.error.message.slice(0, 200),
    );
    check(
      "…and reports no custom properties rather than an invented empty map",
      historicalObservation.success &&
        historicalObservation.data.viewports.desktop.customProperties === undefined &&
        historicalObservation.data.viewports.mobile.customProperties === undefined,
    );
    const historicalSpec = PageSpecSchema.safeParse(
      JSON.parse(await readFile(oldPageSpec, "utf8")),
    );
    check(
      "a PRE-28.5B PageSpec still parses against the current schema",
      historicalSpec.success,
      historicalSpec.success ? "" : historicalSpec.error.message.slice(0, 200),
    );
    check(
      "…and its viewports carry no custom-property record",
      historicalSpec.success &&
        historicalSpec.data.viewports.desktop.customProperties === undefined &&
        historicalSpec.data.viewports.mobile.customProperties === undefined,
    );

    // -----------------------------------------------------------------------
    section("§4 emission — scoped per page × viewport, never :root");
    // -----------------------------------------------------------------------
    const scopes: CustomPropertyScope[] = [
      // Deliberately out of order: the emitter must sort, not echo.
      {
        pageId: "p000001",
        viewportId: "mobile",
        properties: mobileSpec.customProperties!.properties,
      },
      {
        pageId: "p000001",
        viewportId: "desktop",
        properties: desktopSpec.customProperties!.properties,
      },
    ];
    const emitted = generateCustomPropertyCss(scopes);

    check("two scoped blocks emitted", emitted.blockCount === 2, String(emitted.blockCount));
    check(
      "six declarations emitted (3 per viewport)",
      emitted.declarationCount === 6,
      String(emitted.declarationCount),
    );
    check("nothing rejected on honest input", emitted.rejectedNames === 0 && emitted.rejectedValues === 0 && emitted.rejectedScopes === 0);
    check(
      "NO plain :root is emitted (both subtrees share one document root)",
      !emitted.css.includes(":root"),
    );
    check(
      "desktop block uses the variant-wrapper selector",
      emitted.css.includes('[data-wr-page="p000001"][data-wr-viewport="desktop"] {'),
    );
    check(
      "mobile block uses the variant-wrapper selector",
      emitted.css.includes('[data-wr-page="p000001"][data-wr-viewport="mobile"] {'),
    );
    const desktopBlockAt = emitted.css.indexOf('[data-wr-viewport="desktop"]');
    const mobileBlockAt = emitted.css.indexOf('[data-wr-viewport="mobile"]');
    check(
      "blocks are sorted by pageId then viewportId (desktop before mobile)",
      desktopBlockAt >= 0 && mobileBlockAt > desktopBlockAt,
    );
    check(
      "declarations are sorted by property name inside a block",
      emitted.css.indexOf("--brand") < emitted.css.indexOf("--gap") &&
        emitted.css.indexOf("--gap") < emitted.css.indexOf("--unused-tone"),
    );
    check(
      "the desktop value survives intact",
      emitted.css.includes("--brand: #112233;"),
    );
    check("the mobile value survives intact", emitted.css.includes("--brand: #445566;"));
    check(
      "emission is deterministic — the same scopes twice are byte-identical",
      generateCustomPropertyCss(scopes).css === emitted.css &&
        Buffer.byteLength(emitted.css, "utf8") ===
          Buffer.byteLength(generateCustomPropertyCss(scopes).css, "utf8"),
    );

    // Safety: values are untrusted public page content.
    const hostile = generateCustomPropertyCss([
      {
        pageId: "p000001",
        viewportId: "desktop",
        properties: [
          { name: "--ok", value: "#010203" },
          { name: "--escape", value: "red}body{display:none" },
          { name: "--terminator", value: "red;color:blue" },
          { name: "--style-tag", value: "</style" },
          { name: "--bad name", value: "#000000" },
          { name: "--inject{x}", value: "#000000" },
        ],
      },
      { pageId: 'p"]', viewportId: "desktop", properties: [{ name: "--x", value: "1px" }] },
    ]);
    check(
      "a value that could close a declaration or a rule is rejected",
      hostile.rejectedValues === 3,
      String(hostile.rejectedValues),
    );
    check(
      "a malformed custom-property NAME is rejected",
      hostile.rejectedNames === 2,
      String(hostile.rejectedNames),
    );
    check("a malformed page id rejects the whole scope", hostile.rejectedScopes === 1);
    check(
      "the survivor still emits, so rejection is surgical",
      hostile.css.includes("--ok: #010203;") &&
        !hostile.css.includes("display:none") &&
        !hostile.css.includes("</style"),
    );
    check(
      "custom property names stay CASE-SENSITIVE",
      isSafeCustomPropertyName("--Brand") &&
        isSafeCustomPropertyName("--_private") &&
        !isSafeCustomPropertyName("-brand") &&
        !isSafeCustomPropertyName("--bad name"),
    );

    // -----------------------------------------------------------------------
    section("§5 browser — var() inside captured inline SVG resolves per viewport");
    // -----------------------------------------------------------------------
    const desktopSvg = desktopV.assets.find((a) => a.type === "inline-svg")?.markup;
    const mobileSvg = mobileV.assets.find((a) => a.type === "inline-svg")?.markup;
    check(
      "the observer captured the inline SVG as literal outerHTML",
      desktopSvg !== undefined && mobileSvg !== undefined,
    );
    check(
      "…and the captured markup still contains the UNRESOLVED var(--brand)",
      (desktopSvg ?? "").includes("var(--brand)") && (mobileSvg ?? "").includes("var(--brand)"),
      (desktopSvg ?? "").slice(0, 120),
    );

    const page = (pageId: string, css: string): string =>
      `<!doctype html><html><head><meta charset="utf-8"><style>\n${css}\n</style></head><body>` +
      `<div class="wr-variant" data-wr-viewport="desktop" data-wr-page="${pageId}">${desktopSvg ?? ""}</div>` +
      `<div class="wr-variant" data-wr-viewport="mobile" data-wr-page="${pageId}">${mobileSvg ?? ""}</div>` +
      `</body></html>`;

    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const browserPage = await context.newPage();

      /*
       * `setContent` gives a fresh execution context, and tsx/esbuild wraps the
       * serialized evaluate callback with a module-local `__name` helper that
       * does not exist in the browser (same gotcha `installNameShim` solves in
       * the observer). Re-install the no-op shim after every navigation.
       */
      const render = async (html: string): Promise<void> => {
        await browserPage.setContent(html);
        await browserPage.evaluate(
          "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
        );
      };

      const readFills = async (): Promise<{ desktop: string; mobile: string }> =>
        browserPage.evaluate(() => {
          const fillAt = (viewport: string): string => {
            const rect = document.querySelector(
              `[data-wr-viewport="${viewport}"] rect`,
            );
            return rect ? getComputedStyle(rect).fill : "MISSING";
          };
          return { desktop: fillAt("desktop"), mobile: fillAt("mobile") };
        });

      // Control: WITHOUT the emitted block, `var(--brand)` has nothing to
      // resolve against — this is exactly the 28.5A defect, reproduced.
      await render(page("p000001", "/* no custom properties */"));
      const before = await readFills();
      check(
        "control — without the emitted block both subtrees paint the var() fallback",
        before.desktop === before.mobile && before.desktop !== "rgb(17, 34, 51)",
        JSON.stringify(before),
      );

      await render(page("p000001", emitted.css));
      const after = await readFills();
      check(
        "desktop subtree resolves fill to rgb(17, 34, 51)",
        after.desktop === "rgb(17, 34, 51)",
        after.desktop,
      );
      check(
        "mobile subtree resolves fill to rgb(68, 85, 102)",
        after.mobile === "rgb(68, 85, 102)",
        after.mobile,
      );
      check(
        "the two coexisting subtrees resolve the SAME name to DIFFERENT values",
        after.desktop !== after.mobile,
      );

      // The scope is a real scope: a block for another page must not leak in.
      await render(page("p000002", emitted.css));
      const other = await readFills();
      check(
        "a block scoped to another pageId does not reach this page's subtrees",
        other.desktop === before.desktop && other.mobile === before.mobile,
        JSON.stringify(other),
      );
      await context.close();
    } finally {
      await browser.close();
    }

    // -----------------------------------------------------------------------
    section("§6 reach — adopted sheets, CSS nesting, uppercase roots, drops");
    // -----------------------------------------------------------------------
    const adDesktop = viewportOf(observedAdopted, "desktop").customProperties;
    const adMobile = viewportOf(observedAdopted, "mobile").customProperties;
    check(
      "the adopted-sheet fixture produced a record at both viewports",
      adDesktop !== undefined && adMobile !== undefined,
    );
    if (adDesktop && adMobile) {
      const adNames = adDesktop.properties.map((e) => e.name);
      const fromAdoptedSheet = adNames.filter((n) => n.startsWith("--ad-"));
      check(
        "names declared ONLY in document.adoptedStyleSheets are captured " +
          "(document.styleSheets does not list that sheet at all)",
        fromAdoptedSheet.length === 8,
        `${fromAdoptedSheet.length}: ${fromAdoptedSheet.join(",")}`,
      );
      check(
        "adopted-sheet --ad-brand is the wide value (#a10000)",
        valueOf(adDesktop.properties, "--ad-brand") === "#a10000",
        String(valueOf(adDesktop.properties, "--ad-brand")),
      );
      check(
        "an @media INSIDE the adopted sheet still gives mobile its own value",
        valueOf(adMobile.properties, "--ad-brand") === "#00a100",
        String(valueOf(adMobile.properties, "--ad-brand")),
      );
      check(
        "…so the adopted channel is per-viewport too, not a shared map",
        valueOf(adDesktop.properties, "--ad-brand") !==
          valueOf(adMobile.properties, "--ad-brand"),
      );
      check(
        "a CSS-nested `&` block inside :root is reached (adopted sheet)",
        valueOf(adDesktop.properties, "--ad-nest-amp") === "7px",
      );
      check(
        "bare declarations in a nested @media inside :root are reached",
        valueOf(adDesktop.properties, "--ad-nest-media") === "9px",
      );
      check(
        "the same nesting fix works on a PLAIN <style> sheet (--doc-nest-amp)",
        valueOf(adDesktop.properties, "--doc-nest-amp") === "2px",
      );
      check(
        "an UPPERCASE `HTML` selector is treated as a root selector",
        valueOf(adDesktop.properties, "--ad-upper-html") === "2px",
      );
      check(
        "an UPPERCASE `:ROOT` selector is treated as a root selector",
        valueOf(adDesktop.properties, "--ad-upper-root") === "3px",
      );
      const missing = Object.entries(ADOPTED_EXPECTED_RESOLVED).filter(
        ([name, value]) => valueOf(adDesktop.properties, name) !== value,
      );
      check(
        "every expected name resolved to its exact declared value at desktop",
        missing.length === 0,
        missing.map(([n]) => n).join(","),
      );
      check(
        "…and at mobile (only --ad-brand is allowed to differ)",
        Object.entries(ADOPTED_EXPECTED_RESOLVED).every(
          ([name, value]) => valueOf(adMobile.properties, name) === value,
        ),
      );
      check(
        "a name the cascade does not resolve is DROPPED, never invented",
        ADOPTED_EXPECTED_UNRESOLVED.every(
          (name) =>
            valueOf(adDesktop.properties, name) === undefined &&
            valueOf(adMobile.properties, name) === undefined,
        ),
      );
      check(
        "…and is COUNTED in unresolvedCount, at both viewports",
        adDesktop.unresolvedCount === ADOPTED_EXPECTED_UNRESOLVED.length &&
          adMobile.unresolvedCount === ADOPTED_EXPECTED_UNRESOLVED.length,
        JSON.stringify({
          desktop: adDesktop.unresolvedCount,
          mobile: adMobile.unresolvedCount,
        }),
      );
      check(
        "the accounting closes: discovered = kept + unresolved + valueCapped",
        adDesktop.discoveredCount ===
          adDesktop.properties.length +
            (adDesktop.unresolvedCount ?? 0) +
            adDesktop.valueCappedCount &&
          adMobile.discoveredCount ===
            adMobile.properties.length +
              (adMobile.unresolvedCount ?? 0) +
              adMobile.valueCappedCount,
        JSON.stringify({
          discovered: adDesktop.discoveredCount,
          kept: adDesktop.properties.length,
          unresolved: adDesktop.unresolvedCount,
          valueCapped: adDesktop.valueCappedCount,
        }),
      );
      check(
        "no cap fired on the reach fixture",
        !adDesktop.countCapped && adDesktop.valueCappedCount === 0,
      );
      check(
        "the reach record is still sorted, deduped and schema-valid",
        isSortedByName(adDesktop.properties) &&
          isSortedByName(adMobile.properties) &&
          RootCustomPropertiesSchema.safeParse(adDesktop).success &&
          RootCustomPropertiesSchema.safeParse(adMobile).success,
      );
      const adEmitted = generateCustomPropertyCss([
        { pageId: "p000001", viewportId: "desktop", properties: adDesktop.properties },
        { pageId: "p000001", viewportId: "mobile", properties: adMobile.properties },
      ]);
      check(
        "the reach names survive emission intact and stay per-viewport",
        adEmitted.css.includes("--ad-brand: #a10000;") &&
          adEmitted.css.includes("--ad-brand: #00a100;") &&
          adEmitted.rejectedNames === 0 &&
          adEmitted.rejectedValues === 0 &&
          !adEmitted.css.includes("--ad-never"),
      );
    }

    // -----------------------------------------------------------------------
    section("§7 manifest — an empty custom-property section is diagnosable");
    // -----------------------------------------------------------------------
    const statsWith = statsFrom(planWith(emitted));
    check(
      "manifest stats carry the emitted block count",
      statsWith.customPropertyBlocks === emitted.blockCount &&
        statsWith.customPropertyBlocks === 2,
      String(statsWith.customPropertyBlocks),
    );
    check(
      "manifest stats carry the emitted declaration count",
      statsWith.customPropertyDeclarations === emitted.declarationCount &&
        statsWith.customPropertyDeclarations === 6,
      String(statsWith.customPropertyDeclarations),
    );
    check(
      "nothing rejected shows as 0, not as absent",
      statsWith.customPropertyRejected === 0,
      String(statsWith.customPropertyRejected),
    );
    check(
      "the stats object still satisfies the manifest schema",
      ManifestStatsSchema.safeParse(statsWith).success,
    );
    const statsEmpty = statsFrom(planWith(generateCustomPropertyCss([])));
    check(
      "an EMPTY section reports 0/0 in the manifest — the zero-reach case is " +
        "visible instead of silent",
      statsEmpty.customPropertyBlocks === 0 &&
        statsEmpty.customPropertyDeclarations === 0,
      JSON.stringify({
        blocks: statsEmpty.customPropertyBlocks,
        declarations: statsEmpty.customPropertyDeclarations,
      }),
    );
    check(
      "emitter refusals are summed into the manifest, never hidden",
      statsFrom(planWith(hostile)).customPropertyRejected ===
        hostile.rejectedNames + hostile.rejectedValues + hostile.rejectedScopes,
    );
    check(
      "a manifest stats block WITHOUT the three fields still parses (additive)",
      ManifestStatsSchema.safeParse({
        ...statsWith,
        customPropertyBlocks: undefined,
        customPropertyDeclarations: undefined,
        customPropertyRejected: undefined,
      }).success,
    );
    // -----------------------------------------------------------------------
    section("§8 reference-driven discovery — names no sheet walk can ever see");
    // -----------------------------------------------------------------------
    /*
     * The 28.5A consumer, measured: linear.app's inline SVGs reference 16
     * distinct names through 183 `var()` calls, and every one of them is
     * declared in a cross-origin sheet whose `cssRules` throws. Sheet walking
     * — however wide its selector filter — reaches NONE of them. Reading the
     * names out of the captured SVG markup and resolving each at the element
     * that consumes it is the only channel that does.
     */
    const hidDesktopV = viewportOf(observedHidden, "desktop");
    const hidMobileV = viewportOf(observedHidden, "mobile");
    const hidDesktop = hidDesktopV.customProperties;
    const hidMobile = hidMobileV.customProperties;
    check(
      "the reference fixture produced a record at both viewports",
      hidDesktop !== undefined && hidMobile !== undefined,
    );
    if (hidDesktop && hidMobile) {
      check(
        "SHEET discovery finds nothing at all here (discoveredCount 0) — so " +
          "anything captured below came from the reference channel alone",
        hidDesktop.discoveredCount === 0 &&
          hidMobile.discoveredCount === 0 &&
          (hidDesktop.unresolvedCount ?? 0) === 0,
        JSON.stringify({
          desktop: hidDesktop.discoveredCount,
          mobile: hidMobile.discoveredCount,
        }),
      );
      check(
        "a name declared where discovery cannot see it is CAPTURED, resolved " +
          "at the consuming element (--hidden-brand, desktop #b00020)",
        valueOf(hidDesktop.properties, "--hidden-brand") === "#b00020",
        String(valueOf(hidDesktop.properties, "--hidden-brand")),
      );
      check(
        "…and the @media on that same non-root rule gives mobile its OWN value",
        valueOf(hidMobile.properties, "--hidden-brand") === "#0020b0",
        String(valueOf(hidMobile.properties, "--hidden-brand")),
      );
      check(
        "…so element resolution is genuinely per viewport, not one shared map",
        valueOf(hidDesktop.properties, "--hidden-brand") !==
          valueOf(hidMobile.properties, "--hidden-brand"),
      );
      check(
        "a name referenced but declared NOWHERE is dropped, never invented",
        valueOf(hidDesktop.properties, "--never-anywhere") === undefined &&
          valueOf(hidMobile.properties, "--never-anywhere") === undefined,
      );
      check(
        "…and is counted in referenceUnresolvedCount at both viewports",
        hidDesktop.referenceUnresolvedCount === 1 &&
          hidMobile.referenceUnresolvedCount === 1,
        JSON.stringify({
          desktop: hidDesktop.referenceUnresolvedCount,
          mobile: hidMobile.referenceUnresolvedCount,
        }),
      );
      check(
        "CONFLICT — two consuming elements, two values, the FIRST in document " +
          "order wins (--clash-tone = #010203, from .zone-a)",
        valueOf(hidDesktop.properties, "--clash-tone") === "#010203" &&
          valueOf(hidMobile.properties, "--clash-tone") === "#010203",
        String(valueOf(hidDesktop.properties, "--clash-tone")),
      );
      check(
        "…and the value that could NOT be carried is counted, not hidden " +
          "(referenceResolutionConflicts = 1)",
        hidDesktop.referenceResolutionConflicts === 1 &&
          hidMobile.referenceResolutionConflicts === 1,
        JSON.stringify({
          desktop: hidDesktop.referenceResolutionConflicts,
          mobile: hidMobile.referenceResolutionConflicts,
        }),
      );
      check(
        "the reference accounting closes: discovered = sheetKnown + resolved " +
          "+ unresolved",
        hidDesktop.referenceDiscoveredCount === 3 &&
          hidDesktop.referenceSheetKnownCount === 0 &&
          hidDesktop.referenceResolvedCount === 2 &&
          hidDesktop.referenceDiscoveredCount ===
            (hidDesktop.referenceSheetKnownCount ?? 0) +
              (hidDesktop.referenceResolvedCount ?? 0) +
              (hidDesktop.referenceUnresolvedCount ?? 0),
        JSON.stringify(hidDesktop),
      );
      check(
        "the merged record is STILL sorted, deduped and schema-valid",
        isSortedByName(hidDesktop.properties) &&
          isSortedByName(hidMobile.properties) &&
          hidDesktop.properties.length === 2 &&
          RootCustomPropertiesSchema.safeParse(hidDesktop).success &&
          RootCustomPropertiesSchema.safeParse(hidMobile).success,
        hidDesktop.properties.map((e) => e.name).join(","),
      );
      check(
        "PRECEDENCE — on the first fixture --brand is referenced by an SVG but " +
          "was already sheet-discovered, so it is counted, NOT re-resolved and " +
          "NOT duplicated",
        desktopRecord.referenceDiscoveredCount === 1 &&
          desktopRecord.referenceSheetKnownCount === 1 &&
          desktopRecord.referenceResolvedCount === 0 &&
          desktopRecord.referenceResolutionConflicts === 0 &&
          desktopRecord.properties.length === 3 &&
          valueOf(desktopRecord.properties, "--brand") === "#112233",
        JSON.stringify({
          discovered: desktopRecord.referenceDiscoveredCount,
          sheetKnown: desktopRecord.referenceSheetKnownCount,
          resolved: desktopRecord.referenceResolvedCount,
        }),
      );
      check(
        "the schema still accepts a record without ANY reference counter " +
          "(every new field is additive)",
        RootCustomPropertiesSchema.safeParse({
          properties: [],
          discoveredCount: 0,
          countCapped: false,
          valueCappedCount: 0,
          unresolvedCount: 0,
        }).success,
      );

      // The whole point: this has to PAINT.
      const hidDesktopSvg = hidDesktopV.assets.find(
        (a) => a.type === "inline-svg" && (a.markup ?? "").includes("var(--hidden-brand)"),
      )?.markup;
      const hidMobileSvg = hidMobileV.assets.find(
        (a) => a.type === "inline-svg" && (a.markup ?? "").includes("var(--hidden-brand)"),
      )?.markup;
      check(
        "the captured SVG still carries the UNRESOLVED var(--hidden-brand)",
        hidDesktopSvg !== undefined && hidMobileSvg !== undefined,
      );
      const hidEmitted = generateCustomPropertyCss([
        {
          pageId: "p000003",
          viewportId: "desktop",
          properties: hidDesktop.properties,
        },
        {
          pageId: "p000003",
          viewportId: "mobile",
          properties: hidMobile.properties,
        },
      ]);
      const hidPage = (css: string): string =>
        `<!doctype html><html><head><meta charset="utf-8"><style>\n${css}\n</style></head><body>` +
        `<div class="wr-variant" data-wr-viewport="desktop" data-wr-page="p000003">${hidDesktopSvg ?? ""}</div>` +
        `<div class="wr-variant" data-wr-viewport="mobile" data-wr-page="p000003">${hidMobileSvg ?? ""}</div>` +
        `</body></html>`;
      const hidBrowser = await chromium.launch();
      try {
        const hidContext = await hidBrowser.newContext({
          viewport: { width: 1440, height: 900 },
        });
        const hidBrowserPage = await hidContext.newPage();
        const hidRender = async (html: string): Promise<void> => {
          await hidBrowserPage.setContent(html);
          await hidBrowserPage.evaluate(
            "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
          );
        };
        const hidFills = async (): Promise<{ desktop: string; mobile: string }> =>
          hidBrowserPage.evaluate(() => {
            const fillAt = (viewport: string): string => {
              const rect = document.querySelector(
                `[data-wr-viewport="${viewport}"] rect`,
              );
              return rect ? getComputedStyle(rect).fill : "MISSING";
            };
            return { desktop: fillAt("desktop"), mobile: fillAt("mobile") };
          });
        await hidRender(hidPage("/* nothing emitted */"));
        const hidBefore = await hidFills();
        check(
          "control — with no block, the cross-origin-shaped reference paints " +
            "the fallback in BOTH subtrees (the 28.5A defect)",
          hidBefore.desktop === hidBefore.mobile &&
            hidBefore.desktop !== "rgb(176, 0, 32)",
          JSON.stringify(hidBefore),
        );
        await hidRender(hidPage(hidEmitted.css));
        const hidAfter = await hidFills();
        check(
          "desktop subtree paints the element-resolved value rgb(176, 0, 32)",
          hidAfter.desktop === "rgb(176, 0, 32)",
          hidAfter.desktop,
        );
        check(
          "mobile subtree paints ITS OWN element-resolved value rgb(0, 32, 176)",
          hidAfter.mobile === "rgb(0, 32, 176)",
          hidAfter.mobile,
        );
        check(
          "…both subtrees, one document, the same name, different values",
          hidAfter.desktop !== hidAfter.mobile,
        );
        await hidContext.close();
      } finally {
        await hidBrowser.close();
      }
    }

  } finally {
    await rm(TMP_ROOT, { recursive: true, force: true });
  }

  console.log("");
  console.log(`${passed}/${passed + failed} checks passed`);
  if (failed > 0) {
    console.log(`[smoke:custom-properties] FAILED — ${failed} check(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log("[smoke:custom-properties] OK");
}

main().catch((err) => {
  console.error(
    "[smoke:custom-properties] ERROR —",
    err instanceof Error ? err.stack : err,
  );
  process.exitCode = 1;
});
