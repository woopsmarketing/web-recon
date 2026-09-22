#!/usr/bin/env node
/**
 * `npx tsx scripts/smoke-production-canary.ts` — Task 28 Phase 11.
 *
 * THE FULL LOCAL PRODUCTION CANARY, re-checked from the artifacts it produced.
 *
 * A fictional, independent customer (Switchyard — B2B AI workflow automation
 * for freight brokerages and regional carriers) was created from ONE brief on
 * an existing accepted Recon Template (linear.app, 8 routes / 3,079 slots),
 * taken through the whole operator journey in the Visual Editor, and built
 * into an independent, indexable production package.
 *
 * THIS SUITE RE-DERIVES EVERY CANARY GATE FROM THE ARTIFACTS ON DISK. It runs
 * no browser and starts no server: every browser-derived number it reads
 * (js errors, hydration errors, the post-hydration brand census) is a
 * MEASUREMENT the production build's own QA already took and wrote to
 * report/qa.json, and the suite re-derives the totals from that file's raw
 * rows rather than trusting its summary.
 *
 *   §1  the customer, the template lineage and the journey's authored state
 *   §2  the thirteen canary gates, each measured, each asserted === 0
 *   §3  the honest non-zeros this canary found and did NOT paper over
 *   §4  the per-key review opt-in this phase added to the content stage
 *
 * WRITES NOTHING. Every path it reads is named below and is produced by
 * tmp/wr28/p11/*.mts (the journey driver) + `release:build`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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

const HOST = "linear.app";
const PROJECT_DIR = path.join("data", HOST, "release-projects", "wr28-switchyard");
const TEMPLATE_DIR = path.join("data", HOST, "recon-templates", "2026-08-25T21-53-26-980Z");
const REGIONS_FILE = path.join("data", HOST, "page-regions", "2026-08-26T16-14-07-901Z", "page-regions.json");
const DISABLED_ROUTE = "/customers/automattic";
const DISABLED_REGION = "p000001:rgn:main1:div:2>section:4";
/**
 * The source brand WORD, scanned with NO word-boundary requirement.
 *
 * CORRECTION (verifier finding V1, 2026-08-28). The first version of this
 * suite scanned with /(^|[^a-z0-9])linear([^a-z0-9]|$)/i. That boundary is
 * blind to every occurrence whose neighbouring character is alphanumeric, and
 * the shipped package contains TWELVE of them:
 *   - 10x `…Business%20Associate%20Agreement%20(BAA)%20with%20Linear.` inside
 *     the href of the "Email against" anchor on /security — the `0` of `%20`
 *     is alphanumeric, so the boundary form never saw it;
 *   - 2x `/Volumes/LinearBoom1/LinearBoom/01_PROJECTS/…` in the XMP metadata
 *     of a shipped .mp4.
 * Measured on this package: the boundary form counts 697 occurrences, this
 * one counts 1,809. 28.P11.20 claims every remaining occurrence is
 * classified; it can only mean that if the scan is the wide one.
 */
const BRAND_WORD_SOURCE = "linear";
const brandWordMatches = (text: string): RegExpMatchArray[] =>
  [...text.matchAll(new RegExp(BRAND_WORD_SOURCE, "gi"))];
const brandWordCount = (text: string): number => brandWordMatches(text).length;
/** The boundary form is KEPT only to report the gap it used to hide. */
const BRAND_TOKEN_NARROW = /(^|[^a-z0-9])linear([^a-z0-9]|$)/gi;

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
/** Strip inline SVG, <script> and tags — the same reduction the production
 *  brand census applies before it reads visible text. */
function visibleText(html: string): string {
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ");
}
function countAll(haystack: string, needle: RegExp): number {
  return (haystack.match(needle) ?? []).length;
}

function disabledSlugOf(route: string): string {
  return route.replace(/^\//, "").split("/").pop() as string;
}

interface Requirement {
  requirementId: string;
  kind: string;
  severity: string;
  status: string;
  count?: number;
  statusNote?: string;
}

const missing = [PROJECT_DIR, TEMPLATE_DIR, REGIONS_FILE].filter((p) => !existsSync(p));
if (missing.length > 0) {
  console.error(`smoke:production-canary needs artifacts that are not on disk: ${missing.join(", ")}`);
  process.exit(1);
}

const project = readJson<any>(path.join(PROJECT_DIR, "release-project.json"));
const requirements = readJson<{ requirements: Requirement[] }>(
  path.join(PROJECT_DIR, "requirements.json"),
).requirements;
const contentRunDir = project.stageStatus.content.artifact.path as string;
const buildDir = project.stageStatus.production.artifact.path.replace("production-specs", "production-builds");
const specFile = path.join(project.stageStatus.production.artifact.path, "production-spec.json");
const qaFile = path.join(buildDir, "report", "qa.json");
const packageDir = path.join(buildDir, "package");
const siteDir = path.join(packageDir, "site");

for (const required of [contentRunDir, specFile, qaFile, siteDir]) {
  if (!existsSync(required)) {
    console.error(`smoke:production-canary: the project points at ${required}, which is not on disk`);
    process.exit(1);
  }
}

const accounting = readJson<any>(path.join(contentRunDir, "slot-accounting.json"));
const generation = readJson<any>(path.join(contentRunDir, "generation-result.json"));
const contentManifest = readJson<any>(path.join(contentRunDir, "manifest.json"));
const spec = readJson<any>(specFile);
const qa = readJson<any>(qaFile);
const regions = readJson<any>(REGIONS_FILE);
const slots = readJson<any>(path.join(TEMPLATE_DIR, "slots.json")).slots as Array<Record<string, any>>;
const templateManifestCounts = readJson<any>(path.join(TEMPLATE_DIR, "manifest.json")).counts as Record<string, number>;
const slotByKey = new Map(slots.map((s) => [s.key as string, s]));

const htmlFiles = walk(siteDir).filter((f) => f.endsWith(".html"));
const servedHtml = new Map(htmlFiles.map((f) => [path.relative(siteDir, f), readFileSync(f, "utf8")]));
const allHtml = [...servedHtml.values()].join("\n");

// ---------------------------------------------------------------------------
section("1. the customer, the lineage, and what the journey authored");
// ---------------------------------------------------------------------------
check(
  "28.P11.1 the canary site is a NEW, independent customer (not the source host slug)",
  project.siteId === "wr28-switchyard" &&
    project.displayName === "Switchyard" &&
    project.source.host === HOST,
  `${project.siteId} / ${project.displayName} / ${project.source.host}`,
);
check(
  "28.P11.2 the brief that created it names the customer and never names the source site",
  typeof project.intent.rawIntent === "string" &&
    project.intent.rawIntent.includes("Switchyard") &&
    brandWordCount(project.intent.rawIntent) === 0,
  `${project.intent.rawIntent.slice(0, 70)}… — brand-word occurrences in the brief's intent ` +
    `(WIDE scan, no word boundary): ${brandWordCount(project.intent.rawIntent)}`,
);
check(
  "28.P11.3 it was built on an EXISTING accepted template — 8 routes, 3,079 slots, unmutated",
  project.acceptedLineage.template.id === "linear.app-2026-08-25T21-53-26-980Z" &&
    templateManifestCounts.slots === 3079,
  project.acceptedLineage.template.id,
);
const authored = project.authored;
check(
  "28.P11.4 the journey's own edits are all recorded in authored state",
  authored.slotValues["home.main.hero.headline"] === "One live lane plan for every load you move" &&
    authored.slotValues["home.main.cta.new-loops.label.02"] === "Book a dispatch review →" &&
    authored.slotValues["home.main.cta.new-loops.href"] === "/book-a-dispatch-review" &&
    Object.keys(authored.assets).length > 0 &&
    Object.keys(authored.brand).length === 80 &&
    authored.theme.tokens["color.canvas"] === "rgb(10, 16, 26)" &&
    authored.disabledRoutes[DISABLED_ROUTE] !== undefined &&
    authored.disabledRegions[DISABLED_REGION] !== undefined,
  `slots=${Object.keys(authored.slotValues).length} assets=${Object.keys(authored.assets).length} ` +
    `brand=${Object.keys(authored.brand).length} routes=${Object.keys(authored.disabledRoutes).length} ` +
    `regions=${Object.keys(authored.disabledRegions).length}`,
);
check(
  "28.P11.5 EVERY brand-carrying template host carries an operator decision, and none is PRESERVE",
  Object.keys(authored.brand).length === 80 &&
    Object.values(authored.brand).every((d: any) => d.decision === "REPLACE"),
  `${Object.keys(authored.brand).length} decisions, kinds=${[
    ...new Set(Object.values(authored.brand).map((d: any) => d.decision)),
  ].join(",")}`,
);
check(
  "28.P11.6 the release reached PRODUCTION_READY with an indexable spec and zero spec blockers",
  project.releaseState === "PRODUCTION_READY" &&
    spec.indexabilityGate.decision === "indexable" &&
    spec.indexabilityGate.blockers.length === 0 &&
    spec.baseUrl.value === "switchyard-canary.example",
  `${project.releaseState} / ${spec.indexabilityGate.decision} / ${spec.indexabilityGate.blockers.length} blockers`,
);

// ---------------------------------------------------------------------------
section("2. the canary gates — every one measured, every one must be 0");
// ---------------------------------------------------------------------------
const gates: Array<{ id: string; label: string; value: number; detail: string }> = [];
const gate = (id: string, label: string, value: number, detail: string): void => {
  gates.push({ id, label, value, detail });
  check(`${id} ${label} = 0`, value === 0, `measured ${value} — ${detail}`);
};

// G1 — unresolved customer-facing slots on ENABLED surfaces.
const unresolvedDisposition = accounting.totals.byDisposition.unresolved ?? 0;
gate(
  "28.P11.G1",
  "enabled customer-facing Slot unresolved count",
  unresolvedDisposition + (generation.unresolved ?? []).length,
  `slot-accounting byDisposition.unresolved=${unresolvedDisposition}, generation-result unresolved=${(generation.unresolved ?? []).length} ` +
    `(disabled surfaces are accounted separately: disabled-route=${accounting.totals.byDisposition["disabled-route"] ?? 0}, ` +
    `disabled-region=${accounting.totals.byDisposition["disabled-region"] ?? 0})`,
);

const unresolvedOfKind = (kind: string): Requirement[] =>
  requirements.filter(
    (r) =>
      r.kind === kind &&
      r.severity === "release-blocking" &&
      r.status !== "resolved" &&
      r.status !== "not-applicable",
  );

// G2 — source-brand release blockers.
const brandLeakBlockers = unresolvedOfKind("brand-leak");
gate(
  "28.P11.G2",
  "source-brand release blockers",
  brandLeakBlockers.length,
  `release-blocking unresolved brand-leak requirements: ${brandLeakBlockers.map((r) => r.requirementId).join(", ") || "none"}`,
);

// G3 — source-brand-ASSET blockers (the inline-SVG requirement).
const brandAssetBlockers = unresolvedOfKind("source-brand-asset");
const brandAssetRequirement = requirements.find((r) => r.requirementId === "source-brand-inline-svg");
gate(
  "28.P11.G3",
  "source-brand-asset blockers",
  brandAssetBlockers.length,
  `source-brand-inline-svg status=${brandAssetRequirement?.status} — ${(brandAssetRequirement?.statusNote ?? "").slice(0, 140)}`,
);
check(
  "28.P11.7 source-brand-inline-svg cleared by MEASURED OUTPUT, not by an accepted PRESERVE",
  brandAssetRequirement?.status === "resolved" &&
    (brandAssetRequirement.statusNote ?? "").startsWith("cleared by MEASURED OUTPUT"),
  `${brandAssetRequirement?.status}: ${(brandAssetRequirement?.statusNote ?? "").slice(0, 100)}`,
);

// G4 — dead internal links.
//
// "Dead internal-link blockers" is the `dead-internal-link` REQUIREMENT: an
// enabled page linking to a route the operator disabled, which clears only on
// the served package's own link audit. That is the gate. The package's
// SITE-WIDE broken-link total is a different, larger number and is reported
// as its own honest non-zero in §3 rather than folded in here — folding it in
// would say "the disable left a dead link" when it did not, and dropping it
// would hide 1,038 anchors that 404.
const deadLinkBlockers = unresolvedOfKind("dead-internal-link");
const linksToDisabledRoute = qa.siteLinks.brokenInternalTargets.filter((t: string) =>
  t.includes(disabledSlugOf(DISABLED_ROUTE)),
);
gate(
  "28.P11.G4",
  "dead internal-link blockers",
  deadLinkBlockers.length + linksToDisabledRoute.length,
  `release-blocking dead-internal-link requirements=${deadLinkBlockers.length}; served-package anchors pointing at the ` +
    `DISABLED route=${linksToDisabledRoute.length} (site-wide audit: ${qa.siteLinks.anchors} anchors over ` +
    `${qa.siteLinks.routesAudited} routes, ${qa.siteLinks.brokenInternal.length} broken to ${qa.siteLinks.brokenInternalTargets.length} distinct targets — see §3)`,
);

// G5 — the disabled route must not be in the export at all.
const disabledSlug = disabledSlugOf(DISABLED_ROUTE);
// CORRECTION (verifier finding V7): both probes were case-SENSITIVE on the
// lowercase slug. A page containing "How Automattic migrated" fired the
// filename probe and read 0 on the content probe. Both are lowercase-folded
// now; re-measured on this package, both still read 0.
const exportedFilesNamingIt = walk(packageDir).filter((f) =>
  path.relative(packageDir, f).toLowerCase().includes(disabledSlug.toLowerCase()),
);
const packageMentionsIt = walk(packageDir).filter((f) =>
  readFileSync(f).toString("utf8").toLowerCase().includes(disabledSlug.toLowerCase()),
);
gate(
  "28.P11.G5",
  "disabled route exported",
  exportedFilesNamingIt.length + packageMentionsIt.length,
  `files named for ${DISABLED_ROUTE}: ${exportedFilesNamingIt.length}; package files mentioning "automattic": ${packageMentionsIt.length}`,
);

// G6 — and not in the sitemap.
const sitemap = readFileSync(path.join(siteDir, "sitemap.xml"), "utf8");
gate(
  "28.P11.G6",
  "disabled route in sitemap",
  countAll(sitemap, /automattic/gi),
  `sitemap.xml carries ${countAll(sitemap, /<url>/g)} <url> entries and 0 for the disabled route`,
);

// G7 — the disabled REGION must not render.
//
// TWO SOUND PROBES, both narrowed on purpose after the first draft of this
// suite measured 32 with two UNSOUND ones:
//   (a) `data-wr-node` ids are per PAGE and are REUSED between the desktop and
//       mobile trees of that page, so the region's root id must be looked for
//       inside its OWN viewport subtree of its OWN page — searching the whole
//       package finds unrelated elements on other routes (measured: 30 such
//       false hits).
//   (b) the brief writer legitimately writes the SAME sentence for several
//       slots, so "this region's text still appears" is only evidence when the
//       value is unique across the page's whole effective value set (measured:
//       2 false hits from duplicated sentences).
const region = (regions.regions as Array<any>).find((r) => r.regionId === DISABLED_REGION);
const homeHtml = servedHtml.get("index.html") ?? "";
const desktopAt = homeHtml.indexOf('data-wr-viewport="desktop"');
const mobileAt = homeHtml.indexOf('data-wr-viewport="mobile"');
const viewportSubtree: Record<string, string> = {
  desktop: desktopAt >= 0 ? homeHtml.slice(desktopAt, mobileAt >= 0 ? mobileAt : undefined) : "",
  mobile: mobileAt >= 0 ? homeHtml.slice(mobileAt) : "",
};
let regionRootHits = 0;
const regionRootDetail: string[] = [];
for (const page of region?.pages ?? []) {
  for (const occurrence of page.occurrences ?? []) {
    const subtree = viewportSubtree[occurrence.viewport] ?? "";
    const hits = countAll(subtree, new RegExp(`data-wr-node="${occurrence.nodeId}"`, "g"));
    regionRootHits += hits;
    regionRootDetail.push(`${occurrence.viewport}:${occurrence.nodeId}=${hits}`);
  }
}
const regionSlotKeys: string[] = region?.slotKeys ?? [];
const draftValues = readJson<Record<string, unknown>>(path.join(contentRunDir, "slot-values.json"));
const effectiveValue = (key: string): unknown =>
  authored.slotValues[key] ?? draftValues[key] ?? slotByKey.get(key)?.defaultValue;
const valueFrequency = new Map<string, number>();
for (const slot of slots) {
  const value = effectiveValue(slot.key);
  if (typeof value === "string") valueFrequency.set(value, (valueFrequency.get(value) ?? 0) + 1);
}
const regionOwnUniqueCopy = regionSlotKeys
  .map((key) => ({ key, value: effectiveValue(key) }))
  .filter((row): row is { key: string; value: string } =>
    typeof row.value === "string" &&
    row.value.trim().length >= 12 &&
    slotByKey.get(row.key)?.type === "text" &&
    valueFrequency.get(row.value) === 1,
  );
const regionCopyStillServed = regionOwnUniqueCopy.filter((row) => homeHtml.includes(row.value));
gate(
  "28.P11.G7",
  "disabled Region visible",
  regionRootHits + regionCopyStillServed.length,
  `region ${DISABLED_REGION} (${region?.elementCount} elements / ${regionSlotKeys.length} slots): ` +
    `root ids inside their own viewport subtree of the served home page: ${regionRootDetail.join(", ")}; ` +
    `${regionCopyStillServed.length} of ${regionOwnUniqueCopy.length} of its uniquely-owned text values still served` +
    (regionCopyStillServed.length > 0 ? ` (${regionCopyStillServed.slice(0, 3).map((r) => r.key).join(", ")})` : ""),
);

// G8 — no canonical / og:url may name the SOURCE host.
let sourceCanonical = 0;
const headUrlAttrs = /<(?:link[^>]*rel="canonical"[^>]*href|meta[^>]*property="og:url"[^>]*content)="([^"]*)"/gi;
for (const html of servedHtml.values()) {
  for (const match of html.matchAll(headUrlAttrs)) {
    if (brandWordCount(match[1]) > 0) sourceCanonical += 1;
  }
}
const canonicalCount = countAll(allHtml, /rel="canonical"/g);
gate(
  "28.P11.G8",
  "source production canonical occurrences",
  sourceCanonical + countAll(sitemap, /linear\.app/g),
  `${canonicalCount} canonical tag(s) across ${servedHtml.size} served page(s), all on switchyard-canary.example; ` +
    `sitemap.xml source-host occurrences=${countAll(sitemap, /linear\.app/g)}`,
);

// G9 — the source logo (and every other measured brand surface) must be gone,
// in the served bytes AND in the post-hydration DOM.
const censusTotal = (c: any): number =>
  c.sourceUrl + c.bodyAnchorIdentity + c.visibleText + c.imageAlt + c.ariaLabel + c.svgAriaLabel + c.svgSymbolId + c.svgText;
const served = censusTotal(qa.brandSurfaceCensus);
const hydrated = censusTotal(qa.brandSurfaceCensusHydrated);
gate(
  "28.P11.G9",
  "source logo visible",
  served + hydrated + qa.brandCensusHydrationDivergence.length,
  `served census total=${served} (svg-aria-label=${qa.brandSurfaceCensus.svgAriaLabel}, svg-symbol-id=${qa.brandSurfaceCensus.svgSymbolId}, ` +
    `image-alt=${qa.brandSurfaceCensus.imageAlt}, visible-text=${qa.brandSurfaceCensus.visibleText}, source-url=${qa.brandSurfaceCensus.sourceUrl}); ` +
    `post-hydration total=${hydrated} over ${qa.brandSurfaceCensusHydrated.routesMeasured} route(s); divergent routes=${qa.brandCensusHydrationDivergence.length}`,
);
// Independent of the QA report: re-derive the visible-text axis here.
// CORRECTION (verifier finding V1): re-derived with the WIDE scan (no word
// boundary) as well, so a brand word wedged between alphanumerics cannot hide
// from this check the way it hid from the classifier below. Both forms
// measure 0 on this package.
const reDerivedVisibleTextNarrow = [...servedHtml.values()].reduce(
  (sum, html) => sum + countAll(visibleText(html), BRAND_TOKEN_NARROW),
  0,
);
const reDerivedVisibleText = [...servedHtml.values()].reduce(
  (sum, html) => sum + brandWordCount(visibleText(html)),
  0,
);
check(
  "28.P11.8 the visible-text brand axis re-derived from the served files agrees with the QA report",
  reDerivedVisibleText === qa.brandSurfaceCensus.visibleText && reDerivedVisibleText === 0,
  `re-derived WIDE (no word boundary)=${reDerivedVisibleText}, re-derived narrow=${reDerivedVisibleTextNarrow}, ` +
    `qa=${qa.brandSurfaceCensus.visibleText}`,
);

// G10 — every value the operator typed in the Visual Editor must be in the output.
const enabledRoutes: string[] = (qa.routeCensus as Array<any>).map((r) => r.route);
const routeToFile = (route: string): string => (route === "/" ? "index.html" : `${route.replace(/^\//, "")}.html`);
const disabledRegionKeys = new Set(regionSlotKeys);
const authoredMisses: string[] = [];
let authoredChecked = 0;
for (const [key, value] of Object.entries(authored.slotValues as Record<string, unknown>)) {
  if (typeof value !== "string" || value.trim() === "") continue;
  const slot = slotByKey.get(key);
  if (slot === undefined) continue;
  if (slot.route !== undefined && !enabledRoutes.includes(slot.route)) continue; // disabled route
  if (disabledRegionKeys.has(key)) continue; // inside the disabled region
  // A page slot must be in ITS OWN route's served HTML. A global slot must be
  // in at least one served page. There is deliberately NO "anywhere in the
  // package" fallback: a proof injection that deleted the authored CTA label
  // from index.html still PASSED with one, because the same string survived in
  // another route's bytes.
  authoredChecked += 1;
  const needle = slot.type === "url" ? `"${value}"` : value;
  const present =
    slot.scope === "global"
      ? [...servedHtml.values()].some((html) => html.includes(needle))
      : (servedHtml.get(routeToFile(slot.route)) ?? "").includes(needle);
  if (!present) authoredMisses.push(key);
}
gate(
  "28.P11.G10",
  "authored visual-editor values missing from output",
  authoredMisses.length,
  `${authoredChecked} authored value(s) on enabled surfaces checked against the served package; missing: ${authoredMisses.slice(0, 6).join(", ") || "none"}`,
);

// G11 / G12 — runtime and hydration errors, from the build's own browser QA.
const jsErrors = (qa.routeCensus as Array<any>).reduce((n, r) => n + r.jsErrors, 0);
const hydrationErrors = (qa.routeCensus as Array<any>).reduce((n, r) => n + r.hydrationErrors, 0);
gate("28.P11.G11", "runtime errors", jsErrors, `summed over ${qa.routeCensus.length} route(s) in report/qa.json routeCensus[].jsErrors`);
gate("28.P11.G12", "hydration errors", hydrationErrors, `summed over ${qa.routeCensus.length} route(s) in report/qa.json routeCensus[].hydrationErrors`);

// G13 — the package must not depend on any research run under data/<host>/.
const packageFiles = walk(packageDir);
const dataPathHits: string[] = [];
for (const file of packageFiles) {
  const text = readFileSync(file).toString("utf8");
  if (text.includes(`data/${HOST}/`) || text.includes(process.cwd())) dataPathHits.push(path.relative(packageDir, file));
}
gate(
  "28.P11.G13",
  "production package runtime dependency on data/<host>/ research runs",
  dataPathHits.length,
  `${packageFiles.length} package file(s) scanned for "data/${HOST}/" and for this repo's absolute path; hits: ${dataPathHits.slice(0, 5).join(", ") || "none"}`,
);
check(
  "28.P11.9 the package is also free of every external network host at runtime",
  Object.keys(qa.externalRequestsByHost).length === 0 && qa.externalRequestTotal === 0,
  `externalRequestsByHost=${JSON.stringify(qa.externalRequestsByHost)} total=${qa.externalRequestTotal}`,
);
check(
  "28.P11.10 the package carries no Visual Editor bytes",
  countAll(allHtml, /wr-authoring-bridge|__wrPreview|wr-editor/g) === 0,
  `${countAll(allHtml, /wr-authoring-bridge|__wrPreview|wr-editor/g)} occurrence(s)`,
);

console.log(`\n  gate table (${gates.length} gates):`);
for (const g of gates) console.log(`    ${g.value === 0 ? "  0" : String(g.value).padStart(3)}  ${g.id}  ${g.label}`);

// ---------------------------------------------------------------------------
section("3. the honest non-zeros this canary found and did NOT paper over");
// ---------------------------------------------------------------------------
/**
 * Everything here is a MEASURED, NON-ZERO defect that the thirteen gates do
 * not cover. Each is asserted with its real number so it cannot quietly
 * disappear: if one of these checks starts failing because the count reached
 * 0, the underlying gap was FIXED and the check — not the finding — is what
 * should be updated.
 */
const normalize = (text: string): string => text.replace(/\s+/g, " ").trim();
const homeVisible = normalize(visibleText(homeHtml));

// N1 — the painted hero headline is not slot-bound on this template.
const HERO_SOURCE_SENTENCE = "The product development system for teams and agents";
const heroSourcePainted = countAll(homeVisible, new RegExp(HERO_SOURCE_SENTENCE, "g"));
const heroAuthoredServed = countAll(
  homeVisible,
  new RegExp(authored.slotValues["home.main.hero.headline"] as string, "g"),
);
check(
  "28.P11.11 NON-ZERO, asserted: the PAINTED hero headline is unbound, so the SOURCE sentence still ships",
  heroSourcePainted === 4 && heroAuthoredServed === 2,
  `source hero sentence in the served home page's visible text=${heroSourcePainted} (2 layers x 2 viewports); ` +
    `the authored value=${heroAuthoredServed} (the 1x1 accessible copy, 1 per viewport). The slot binds ONE node ` +
    "(n000089, 1x1); the two spans a visitor reads carry no binding at all.",
);
check(
  "28.P11.12 the paint-twin binding count that explains it is READ from the template, not asserted",
  templateManifestCounts.paintTwinBindings === 4,
  `paintTwinBindings=${templateManifestCounts.paintTwinBindings} of ${templateManifestCounts.bindings} bindings`,
);

// N2 — text slots still serving the SOURCE default, verbatim, in the package.
const dispositionByKey = new Map<string, string>(
  (accounting.entries as Array<any>).map((e) => [e.slotKey as string, e.disposition as string]),
);
const routeVisible = new Map<string, string>();
for (const route of enabledRoutes) {
  routeVisible.set(route, normalize(visibleText(servedHtml.get(routeToFile(route)) ?? "")));
}
const allVisible = [...routeVisible.values()].join(" ");
//
// CORRECTION (verifier finding V2 — NO SILENT CAPS). The first version of
// this check reported ONE number, 661, under the sentence "enabled text slots
// still serving the SOURCE default verbatim" — while silently applying two
// filters: values shorter than 8 characters were skipped, and a value had to
// be findable in that route's own VISIBLE text. Both filters are real and
// defensible (short strings collide with everything; a value nobody can see
// is not "served" in the customer-visible sense), but neither was stated, and
// the short-string filter drops exactly the most damaging visible cases — the
// source product-UI mock that dominates the home page below the hero
// ("Inbox", "My issues", "Reviews", "Pulse", "Initiatives", "Projects",
// "Favorites", "Agent tasks", "UI Refresh"). BOTH numbers are measured and
// BOTH are asserted now: the unfiltered population and the filtered subset.
let sourceDefaultsUnfiltered = 0;
const unfilteredByEditability: Record<string, number> = {};
let sourceDefaultsStillServed = 0;
const sourceDefaultsByEditability: Record<string, number> = {};
let droppedShort = 0;
let droppedNotVisible = 0;
const droppedShortSamples: string[] = [];
for (const slot of slots) {
  if (slot.type !== "text") continue;
  const disposition = dispositionByKey.get(slot.key);
  if (disposition === "disabled-route" || disposition === "disabled-region") continue;
  const effective = authored.slotValues[slot.key] ?? draftValues[slot.key] ?? slot.defaultValue;
  if (typeof effective !== "string" || typeof slot.defaultValue !== "string") continue;
  if (effective.trim() !== slot.defaultValue.trim()) continue;
  // The UNFILTERED population: an enabled text slot whose effective value is,
  // character for character, the source's own default.
  sourceDefaultsUnfiltered += 1;
  unfilteredByEditability[slot.editability] = (unfilteredByEditability[slot.editability] ?? 0) + 1;
  if (effective.trim().length < 8) {
    droppedShort += 1;
    if (droppedShortSamples.length < 12 && !droppedShortSamples.includes(effective.trim())) {
      droppedShortSamples.push(effective.trim());
    }
    continue;
  }
  const target = slot.scope === "global" ? allVisible : (routeVisible.get(slot.route) ?? allVisible);
  if (!target.includes(normalize(effective))) {
    droppedNotVisible += 1;
    continue;
  }
  sourceDefaultsStillServed += 1;
  sourceDefaultsByEditability[slot.editability] = (sourceDefaultsByEditability[slot.editability] ?? 0) + 1;
}
check(
  "28.P11.13 NON-ZERO, asserted: enabled text slots still serving the SOURCE default verbatim (LONG + visible subset)",
  sourceDefaultsStillServed === 661,
  `${sourceDefaultsStillServed} of ${slots.filter((s) => s.type === "text").length} template text slots ` +
    `(${JSON.stringify(sourceDefaultsByEditability)}). THIS NUMBER IS FILTERED, and the filters are: value length >= 8 ` +
    `characters (dropped ${droppedShort}) AND the value must appear in that route's own visible text (dropped ` +
    `${droppedNotVisible}). "Unresolved = 0" means nothing is UNANSWERED; it does NOT mean nothing is the source's. ` +
    `The accounting names them: preserved=${accounting.totals.byDisposition.preserved}, ` +
    `human-required=${accounting.totals.byDisposition["human-required"]}.`,
);
check(
  "28.P11.25 NON-ZERO, asserted: the SAME population with NO filters at all — the honest headline number",
  sourceDefaultsUnfiltered === 1287 &&
    unfilteredByEditability.review === 1024 &&
    unfilteredByEditability.editable === 263,
  `${sourceDefaultsUnfiltered} enabled text slots serve their source default verbatim ` +
    `(${JSON.stringify(unfilteredByEditability)}) — ${sourceDefaultsStillServed} of them survive the two filters ` +
    `28.P11.13 applies. The ${droppedShort} short values are NOT noise: they are the source product-UI mock, e.g. ` +
    `${droppedShortSamples.slice(0, 9).map((v) => JSON.stringify(v)).join(", ")}. Both numbers are stated in the handoff.`,
);

// N3 — internal links that 404 in the shipped package.
check(
  "28.P11.14 NON-ZERO, asserted: internal anchors in the shipped package that resolve to no route",
  qa.siteLinks.brokenInternal.length === 1038 && qa.siteLinks.brokenInternalTargets.length === 178,
  `${qa.siteLinks.brokenInternal.length} anchors over ${qa.siteLinks.routesAudited} routes point at ` +
    `${qa.siteLinks.brokenInternalTargets.length} distinct destinations with no page. NONE of them is the ` +
    "disabled route (G4). They are the template's own 8-route slice of a much larger source site — plus one this " +
    "journey introduced itself, below.",
);
check(
  "28.P11.15 NON-ZERO, asserted: the journey's OWN CTA href is one of those dead destinations",
  qa.siteLinks.brokenInternalTargets.includes(authored.slotValues["home.main.cta.new-loops.href"] as string),
  `the operator typed ${String(authored.slotValues["home.main.cta.new-loops.href"])} into the Visual Editor's URL ` +
    "field; the editor accepted it, the content validator raised `broken-internal-route` as a WARNING, no requirement " +
    "was collected and nothing blocked the build. An internal href with no route is shipped as a 404.",
);

// N4 — PRODUCTION_READY is not "no work left".
const highValueUnresolved = requirements.filter(
  (r) => r.severity === "high-value" && r.status !== "resolved" && r.status !== "not-applicable",
);
check(
  "28.P11.16 NON-ZERO, asserted: PRODUCTION_READY still carries a high-value backlog, and says so",
  highValueUnresolved.length > 0 && project.releaseState === "PRODUCTION_READY",
  `${highValueUnresolved.length} high-value requirement(s) unresolved (e.g. ${highValueUnresolved
    .slice(0, 3)
    .map((r) => r.requirementId)
    .join(", ")})`,
);

// N5 — a FULL classification of every occurrence of the source brand WORD in
// the whole package. The gates above measure the surfaces the census owns;
// this measures the whole byte-space and names what is left, so "0 on the
// census axes" can never be read as "the word is gone".
//
// CORRECTION (verifier finding V1). The first version scanned with the
// word-boundary regex and reported `unclassified: 0` over 697 occurrences —
// a claim of completeness made by a scanner that could not see 12 of the
// occurrences it claimed to have classified. The scan is WIDE now (1,809
// occurrences, no boundary), every class below is measured, and the two
// surfaces the boundary hid are asserted on their own as 28.P11.26 and
// 28.P11.27. Rules are evaluated in the order written and each looks at a
// TIGHT window around the match, so a gradient elsewhere in the file cannot
// absorb a real leak.
const packageFileList = walk(packageDir);
const CLASS_HOST = "source host in provenance metadata (RUN.md, deploy-manifest.json, theme-overlay.css)";
const CLASS_GRADIENT = "svg/css gradient + animation-timing vocabulary";
const CLASS_CSSVAR = "CSS custom-property NAME (--color-linear-security)";
const CLASS_HREF_QUERY = "source brand inside an EDITABLE url slot's query string (/security BAA link)";
const CLASS_VIDEO_META = "source video-project path in a shipped .mp4's XMP metadata";
const CLASS_PLACEHOLDER = "placeholder attribute value — the surface Phase 2 DECLARED not owned";
const CLASS_SERIALIZED_ALT = "image alt inside a SERIALIZED props string — no detector reaches it";
const occurrenceClasses: Record<string, number> = {
  [CLASS_GRADIENT]: 0,
  [CLASS_HOST]: 0,
  [CLASS_CSSVAR]: 0,
  [CLASS_HREF_QUERY]: 0,
  [CLASS_VIDEO_META]: 0,
  [CLASS_PLACEHOLDER]: 0,
  [CLASS_SERIALIZED_ALT]: 0,
  unclassified: 0,
};
const unclassifiedSamples: string[] = [];
const filesByClass: Record<string, Set<string>> = {};
for (const file of packageFileList) {
  const text = readFileSync(file).toString("utf8");
  for (const match of brandWordMatches(text)) {
    const at = match.index as number;
    const near = text.slice(Math.max(0, at - 24), at + 24);
    const tight = text.slice(Math.max(0, at - 12), at + 12);
    let cls: string;
    if (/^linear\.app/i.test(text.slice(at, at + 10))) cls = CLASS_HOST;
    else if (/linear-gradient|linearGradient|_linear_|paint\d+_linear|timing-function:\s*linear/i.test(near))
      cls = CLASS_GRADIENT;
    else if (/--color-linear-/i.test(near)) cls = CLASS_CSSVAR;
    else if (/%20Linear\./i.test(tight)) cls = CLASS_HREF_QUERY;
    else if (/LinearBoom/i.test(tight)) cls = CLASS_VIDEO_META;
    else if (/Tell\s*Linear/i.test(near) || /placeholder/i.test(text.slice(Math.max(0, at - 60), at)))
      cls = CLASS_PLACEHOLDER;
    else if (/blueprint image/i.test(text.slice(Math.max(0, at - 80), at))) cls = CLASS_SERIALIZED_ALT;
    else {
      cls = "unclassified";
      if (unclassifiedSamples.length < 5) {
        unclassifiedSamples.push(`${path.relative(packageDir, file)}: …${near.replace(/\s+/g, " ")}…`);
      }
    }
    occurrenceClasses[cls] += 1;
    (filesByClass[cls] ??= new Set()).add(path.relative(packageDir, file));
  }
}
const narrowTotal = packageFileList.reduce(
  (sum, f) => sum + countAll(readFileSync(f).toString("utf8"), BRAND_TOKEN_NARROW),
  0,
);
const wideTotal = Object.values(occurrenceClasses).reduce((a, b) => a + b, 0);
const hostFiles = packageFileList
  .filter((f) => readFileSync(f).toString("utf8").includes("linear.app"))
  .map((f) => path.relative(packageDir, f))
  .sort();
check(
  "28.P11.17 the source host string appears ONLY in provenance metadata, never in page content",
  hostFiles.length === 3 &&
    hostFiles.join("|") === "RUN.md|deploy-manifest.json|site/wr/theme-overlay.css",
  `${hostFiles.length} file(s): ${hostFiles.join(", ")}. deploy-manifest.json ALSO still lists two residual source ` +
    "hosts although this build's measured network census is hosts={} — an inherited-census staleness the assets " +
    "layer warns about and this phase did not fix.",
);
check(
  "28.P11.18 NON-ZERO, asserted: a source-brand PLACEHOLDER attribute value still ships",
  occurrenceClasses[CLASS_PLACEHOLDER] === 10,
  `placeholder="Tell Linear what to do next…" — ${occurrenceClasses[CLASS_PLACEHOLDER]} occurrences package-wide, ` +
    "2 of them in served HTML (index.html, one per viewport). `attribute-value-text` is DECLARED not owned by the " +
    "brand resolver (SURFACES_NOT_RESOLVED) and no census axis counts it; it is also bound to no slot, so there is " +
    "no operator write path for it at all.",
);
check(
  "28.P11.19 NON-ZERO, asserted: a source-brand image ALT inside a serialized props string still ships",
  occurrenceClasses[CLASS_SERIALIZED_ALT] === 5,
  `"A blueprint image of the overview page of a project in Linear" on /plan — ${occurrenceClasses[CLASS_SERIALIZED_ALT]} ` +
    "occurrences package-wide. It is not an element `alt` prop (so scanAppBrandHosts' image-alt surface never sees " +
    "it), not slot-bound (so no editor write reaches it), and the served-HTML census's IMG_ALT regex does not match " +
    "it because it is escaped inside another attribute.",
);
check(
  "28.P11.20 every remaining occurrence of the brand word is classified — nothing is left unexplained",
  occurrenceClasses.unclassified === 0 && wideTotal === narrowTotal + 1112,
  `WIDE scan (no word boundary) ${wideTotal} occurrences vs ${narrowTotal} the boundary form could see ` +
    `(+${wideTotal - narrowTotal} it was blind to); classes=${JSON.stringify(occurrenceClasses)}` +
    (unclassifiedSamples.length > 0 ? `; samples: ${unclassifiedSamples.join(" | ")}` : ""),
);
check(
  "28.P11.26 NON-ZERO, asserted: source brand inside an EDITABLE url slot's query string, on a customer-reachable link",
  occurrenceClasses[CLASS_HREF_QUERY] === 10 &&
    (servedHtml.get("security.html") ?? "").includes("%20with%20Linear.") &&
    slotByKey.get("security.main.link.request-baa.href")?.editability === "editable",
  `${occurrenceClasses[CLASS_HREF_QUERY]} occurrences over ${[...(filesByClass[CLASS_HREF_QUERY] ?? [])].length} ` +
    `package files (${[...(filesByClass[CLASS_HREF_QUERY] ?? [])].sort().join(", ")}). The /security "Email against" ` +
    "anchor ships href=\"/contact/sales?message=…Business%20Associate%20Agreement%20(BAA)%20with%20Linear.\". " +
    "CORRECTING THE VERIFIER'S FRAMING WITH THE ARTIFACT: this is NOT an unowned surface — it is slot " +
    "`security.main.link.request-baa.href`, type=url, editability=editable, so an operator write path exists. What " +
    "is missing is DETECTION: no brand detector reads url-slot query strings, the brand census's axes are host- and " +
    "text-shaped, and the operator's 127-value brand pass scanned text slots only. It is ALSO a dead internal link: " +
    "its target /contact/sales is one of the 178 broken destinations in 28.P11.14.",
);
check(
  "28.P11.27 NON-ZERO, asserted: the source's own video-project path ships inside an .mp4",
  occurrenceClasses[CLASS_VIDEO_META] === 2,
  `${occurrenceClasses[CLASS_VIDEO_META]} occurrences of "/Volumes/LinearBoom1/LinearBoom/01_PROJECTS/…prproj" in ` +
    `${[...(filesByClass[CLASS_VIDEO_META] ?? [])].join(", ")}. It is XMP metadata inside a source-owned video that ` +
    "was never replaced (28.P11.31) and that nothing in the package even references (28.P11.32); no detector, " +
    "census or QA axis reads binary media metadata.",
);
check(
  "28.P11.28 the CSS custom-property NAME carrying the brand word is counted, not waved away",
  occurrenceClasses[CLASS_CSSVAR] === 30 && occurrenceClasses[CLASS_HOST] === 7,
  `--color-linear-security appears ${occurrenceClasses[CLASS_CSSVAR]}x (a token NAME in the template's frozen ` +
    `stylesheet, invisible to a reader but present in the bytes); the source HOST string appears ` +
    `${occurrenceClasses[CLASS_HOST]}x, all in provenance metadata (28.P11.17).`,
);

// N6 — an authored value that ships BESIDE the source value it replaced.
//
// CORRECTION (verifier finding V3). The verifier found the shipped, indexable
// /pricing page stating two contradictory price sets side by side and rated it
// "an instance of F3". It is not: F3 is "the operator never wrote this slot".
// Here the operator DID write it, through the real API, and the write landed —
// in the 1x1 accessible copy the slot binds, while an UNBOUND twin keeps
// painting the source figure. It is F1's mechanism, on a second page, with a
// worse consequence: a price list that contradicts itself.
const tinyBound = (slot: any): boolean => {
  const box = (v: any): boolean => v !== undefined && v.width <= 1 && v.height <= 1;
  return box(slot.constraints?.desktop) || box(slot.constraints?.mobile);
};
let enabledTextSlots = 0;
let onlyTinyBound = 0;
let operatorWrote = 0;
const authoredBesideSource: Array<{ key: string; source: string; authored: string }> = [];
for (const slot of slots) {
  if (slot.type !== "text") continue;
  const disposition = dispositionByKey.get(slot.key);
  if (disposition === "disabled-route" || disposition === "disabled-region") continue;
  enabledTextSlots += 1;
  if (tinyBound(slot)) onlyTinyBound += 1;
  const written = authored.slotValues[slot.key];
  if (typeof written !== "string" || written.trim() === "") continue;
  if (typeof slot.defaultValue !== "string" || written.trim() === slot.defaultValue.trim()) continue;
  operatorWrote += 1;
  if (slot.defaultValue.trim().length < 3) continue;
  const target = slot.scope === "global" ? allVisible : (routeVisible.get(slot.route) ?? "");
  if (target.includes(slot.defaultValue.trim())) {
    authoredBesideSource.push({ key: slot.key, source: slot.defaultValue.trim(), authored: written.trim() });
  }
}
const pricingVisible = routeVisible.get("/pricing") ?? "";
check(
  "28.P11.29 NON-ZERO, asserted: authored values that ship BESIDE the source value they replaced (F1's mechanism, twice)",
  authoredBesideSource.length === 6 &&
    authoredBesideSource.filter((r) => r.key.startsWith("pricing.")).length === 5 &&
    pricingVisible.includes("$45 per dispatcher/month $10 per user/month") &&
    pricingVisible.includes("$79 per dispatcher/month $16 per user/month"),
  `${authoredBesideSource.length} of the ${operatorWrote} enabled text slots the operator actually wrote still have ` +
    `their SOURCE default in the same route's visible text: ` +
    `${authoredBesideSource.map((r) => `${r.key} [${JSON.stringify(r.source)} -> ${JSON.stringify(r.authored)}]`).join("; ")}. ` +
    `Consequence MEASURED on the shipped, INDEXABLE /pricing page — "$45 per dispatcher/month" immediately followed ` +
    `by "$10 per user/month": ${pricingVisible.includes("$45 per dispatcher/month $10 per user/month")}; ` +
    `"$79 per dispatcher/month" immediately followed by "$16 per user/month": ` +
    `${pricingVisible.includes("$79 per dispatcher/month $16 per user/month")}; each pair served twice (one per ` +
    `viewport), over a feature table that is still the source's ("Sub-teams", "Private teams", "Microsoft Teams ` +
    `integration"). ` +
    `${onlyTinyBound} of ${enabledTextSlots} enabled text slots bind ONLY a 1x1 node, which is the size of this trap.`,
);

// N7 — every indexable route ships the same <title>.
//
// CORRECTION (verifier finding V4). The handoff read "per-route
// title/description/canonical/og:url", which reads as "distinct per route".
// The titles are not distinct, nothing in the SEO plan or the build checks
// title uniqueness, and two descriptions are degraded fragments.
const titleOf = (html: string): string | null => (html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? null;
const routeTitles = enabledRoutes.map((r) => ({ route: r, title: titleOf(servedHtml.get(routeToFile(r)) ?? "") }));
const distinctTitles = new Set(routeTitles.map((r) => r.title));
const descriptionOf = (html: string): string | null =>
  (html.match(/<meta name="description" content="([^"]*)"/) ?? [])[1] ?? null;
const routeDescriptions = enabledRoutes.map((r) => descriptionOf(servedHtml.get(routeToFile(r)) ?? ""));
const distinctDescriptions = new Set(routeDescriptions);
const manifestTitles = new Set(
  (readJson<any>(path.join(packageDir, "deploy-manifest.json")).routes as Array<any>).map((r) => r.expectedTitle),
);
check(
  "28.P11.30 NON-ZERO, asserted: all 7 indexable routes of this package ship the IDENTICAL <title> — the package predates the Phase-10 uniqueness detectors and has not been rebaked",
  routeTitles.length === 7 && distinctTitles.size === 1 && manifestTitles.size === 1 && distinctDescriptions.size === 7,
  `${routeTitles.length} routes, ${distinctTitles.size} distinct <title>: ${JSON.stringify([...distinctTitles][0])}. ` +
    `deploy-manifest.json repeats the same expectedTitle ${manifestTitles.size === 1 ? routeTitles.length : manifestTitles.size} ` +
    `time(s). Descriptions DO differ (${distinctDescriptions.size} distinct) but two are degraded fragments ` +
    `("One plan for decision next.", "One plan for actual freight."). The production SEO plan reports ` +
    `knownTitles=7 / needsInputTitles=0 and both its checks pass (neither is a uniqueness check). Uniqueness detectors DO now exist — checkTitleUniqueness (src/seo/production-plan.ts:520, wired at src/seo/run.ts:134) and title-uniqueness-measured (src/production/qa.ts:731) — but they landed after this package was baked, so nothing measured uniqueness for it. Rebake to close.`,
);

// N8 — the media the package actually serves.
//
// CORRECTION (verifier finding V5). "15 audio/video entries were deliberately
// NOT resolved" is true but never says what ships INSTEAD: the source's own
// files, and they are the overwhelming majority of the package by bytes.
const assetsDir = project.stageStatus.assets.artifact.path as string;
const replacementEntries = readJson<any>(path.join(assetsDir, "replacement-manifest.json")).entries as Array<any>;
const awaitingInput = replacementEntries.filter((e) => e.replacement.status === "awaiting-input");
const mediaDir = path.join(siteDir, "media");
const mediaFiles = readdirSync(mediaDir);
const bytesOf = (f: string): number => statSync(path.join(mediaDir, f)).size;
const AV = new Set([".mp4", ".webm", ".mp3"]);
const avFiles = mediaFiles.filter((f) => AV.has(path.extname(f).toLowerCase()));
const avBytes = avFiles.reduce((n, f) => n + bytesOf(f), 0);
const mediaBytes = mediaFiles.reduce((n, f) => n + bytesOf(f), 0);
check(
  "28.P11.31 NON-ZERO, asserted: the SOURCE's own audio/video files ship inside the 'independent' package",
  awaitingInput.length === 15 &&
    awaitingInput.every((e) => /\.(mp4|webm|mp3)$/i.test(e.sourceUrl) || e.sourceUrl.includes("webassets.")) &&
    avFiles.length === 15,
  `${awaitingInput.length} replacement-manifest entries are still \`awaiting-input\`, all audio/video, and the ` +
    `package serves exactly ${avFiles.length} such files: ${(avBytes / 1048576).toFixed(1)} MB of the ` +
    `${(mediaBytes / 1048576).toFixed(1)} MB media tree — ${((avBytes / mediaBytes) * 100).toFixed(0)}% of it. They ` +
    "are byte-for-byte the source site's own media, including one whose XMP metadata still names the source's video " +
    "project (28.P11.27). The package is network-independent (externalRequestsByHost={}) — it is not yet " +
    "content-independent. How much of it is even used is measured next.",
);
// Referenced = the file's NAME appears anywhere in a non-media package file.
// Deliberately format-agnostic (bare basename, not a /media/ path regex): a
// first version matched `/media/<name>` and would have reported a smaller,
// flattering number if any reference were escaped or rewritten. Measured both
// ways here; the basename scan is the one asserted.
const nonMediaFiles = packageFileList.filter(
  (f) => !path.relative(packageDir, f).startsWith(path.join("site", "media")),
);
const nonMediaCorpus = nonMediaFiles.map((f) => readFileSync(f).toString("utf8")).join("\n");
const unreferencedMedia = mediaFiles.filter((f) => !nonMediaCorpus.includes(f));
const rewriteEntries = readJson<any>(path.join(assetsDir, "rewrite-map.json")).entries as Array<any>;
const entryBySourceUrl = new Map(replacementEntries.map((e) => [e.sourceUrl, e]));
const manifestEntryOfFile = new Map<string, any>();
for (const entry of rewriteEntries) {
  const found = entryBySourceUrl.get(entry.sourceUrl);
  if (found !== undefined) manifestEntryOfFile.set(path.basename(entry.localPath), found);
}
const unreferencedClass: Record<string, number> = { "operator replacement": 0, "source audio/video awaiting input": 0, "not in the replacement manifest at all": 0 };
const unreferencedBytes: Record<string, number> = { "operator replacement": 0, "source audio/video awaiting input": 0, "not in the replacement manifest at all": 0 };
const unreferencedByExt: Record<string, number> = {};
for (const f of unreferencedMedia) {
  const entry = manifestEntryOfFile.get(f);
  const cls =
    entry === undefined
      ? "not in the replacement manifest at all"
      : entry.replacement.status === "provided"
        ? "operator replacement"
        : "source audio/video awaiting input";
  unreferencedClass[cls] += 1;
  unreferencedBytes[cls] += bytesOf(f);
  unreferencedByExt[path.extname(f).toLowerCase()] = (unreferencedByExt[path.extname(f).toLowerCase()] ?? 0) + 1;
}
const unreferencedTotalBytes = Object.values(unreferencedBytes).reduce((a, b) => a + b, 0);
check(
  "28.P11.32 NON-ZERO, asserted: most of the media the package ships is referenced by nothing in it",
  unreferencedMedia.length === 169 &&
    unreferencedClass["not in the replacement manifest at all"] === 141 &&
    unreferencedClass["source audio/video awaiting input"] === 12 &&
    unreferencedClass["operator replacement"] === 16,
  `${unreferencedMedia.length} of ${mediaFiles.length} served media files are named by no HTML, RSC payload, ` +
    `stylesheet or manifest in the package — ${(unreferencedTotalBytes / 1048576).toFixed(1)} MB of the ` +
    `${(mediaBytes / 1048576).toFixed(1)} MB media tree (${JSON.stringify(unreferencedByExt)}). By class: ` +
    `${Object.entries(unreferencedClass).map(([k, v]) => `${k}=${v} (${(unreferencedBytes[k] / 1048576).toFixed(1)} MB)`).join(", ")}. ` +
    `CORRECTING THE VERIFIER'S NUMBER (V5 said 47, counting only .avif/.jpg): the real figure is ${unreferencedMedia.length}, ` +
    `and the heavy part of it is ${unreferencedClass["source audio/video awaiting input"]} SOURCE-OWNED video/audio ` +
    `files that ship, unused, at ${(unreferencedBytes["source audio/video awaiting input"] / 1048576).toFixed(1)} MB. ` +
    `The asset denominator (${replacementEntries.length} manifest entries) is narrower than the media actually shipped: ` +
    `${unreferencedClass["not in the replacement manifest at all"]} served files were never in it.`,
);

// N9 — acceptedLineage is a prepare-time record, not what shipped.
//
// CORRECTION (verifier finding V8). The verifier called this a defect. The
// artifact says otherwise and the artifact wins: ReleaseProjectSchema
// documents acceptedLineage as "The accepted production candidate — immutable
// record (spec §4)", written once by prepare.ts. What IS true, and what this
// check pins, is that 5 of its 7 refs are older than the artifacts that
// actually shipped, so anything that reads acceptedLineage as "the shipped
// lineage" is wrong.
const lineageStages = ["content", "theme", "seo", "assets"] as const;
const staleLineage = lineageStages.filter(
  (stage) => project.acceptedLineage[stage].id !== project.stageStatus[stage].artifact.id,
);
const staleProduction =
  project.acceptedLineage.production.spec.id !== project.stageStatus.production.artifact.id ? 1 : 0;
check(
  "28.P11.33 NON-ZERO, asserted: acceptedLineage points at the FIRST-DRAFT runs, not at what shipped",
  staleLineage.length === 4 && staleProduction === 1,
  `${staleLineage.length + staleProduction} of 7 lineage refs differ from stageStatus: ` +
    `${[...staleLineage, "production"].map((st) => `${st} lineage=${st === "production" ? project.acceptedLineage.production.spec.id : project.acceptedLineage[st].id} vs stage=${project.stageStatus[st].artifact.id}`).join("; ")}. ` +
    "This is BY DESIGN (the schema calls acceptedLineage an immutable prepare-time record) and no gate depends on " +
    "it — asserted so that nobody reads it as the shipped lineage and so the divergence cannot grow unnoticed.",
);

// ---------------------------------------------------------------------------
section("4. the per-key review opt-in this phase added to the content stage");
// ---------------------------------------------------------------------------
/**
 * Before Phase 11 a release BUILD of a project whose operator had edited a
 * review-flagged slot in the Visual Editor failed the content stage with
 * `review-slot-not-writable` — measured on this canary: 3 errors, one per hero
 * edit. The opt-in is PER KEY and comes only from an operator write.
 */
const optedIn: string[] = contentManifest.operatorReviewSlotKeys ?? [];
check(
  "28.P11.21 the content run records the review slots the OPERATOR opted in, by name",
  optedIn.length > 0 &&
    optedIn.includes("home.main.hero.headline") &&
    optedIn.includes("home.main.cta.new-loops.label.02") &&
    optedIn.includes("home.main.cta.new-loops.href"),
  `operatorReviewSlotKeys=${optedIn.length}`,
);
check(
  "28.P11.22 the blanket review opt-in stays OFF — nothing was widened beyond the named keys",
  contentManifest.includeReview === false,
  `includeReview=${contentManifest.includeReview}`,
);
check(
  "28.P11.23 every opted-in key is one the operator actually wrote",
  optedIn.every((key) => Object.prototype.hasOwnProperty.call(authored.slotValues, key)),
  `${optedIn.filter((k) => !Object.prototype.hasOwnProperty.call(authored.slotValues, k)).length} opted-in key(s) with no authored value`,
);
check(
  "28.P11.24 opting keys in did not change the accounting denominator: it still reconciles over the whole template",
  accounting.reconciliation.reconciled === true &&
    accounting.totals.inScopeSlots === templateManifestCounts.slots &&
    accounting.reconciliation.templateCoverage.complete === true,
  `inScopeSlots=${accounting.totals.inScopeSlots} of ${templateManifestCounts.slots}, reconciled=${accounting.reconciliation.reconciled}`,
);

console.log(`\n${failures === 0 ? "OK" : "FAILURES"} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
