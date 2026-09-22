/**
 * Requirement NORMALIZATION (spec §8) — collect the needs-input / warning /
 * blocker signals the existing subsystem artifacts ALREADY carry:
 *
 *   seo    production-seo-plan.json (domainState, businessFacts, jsonLd
 *          omissions) + report/needs-input.json
 *   content manifest scopedRoutes + generation-result.json unresolved[] +
 *          report/brand-leak.json
 *   assets replacement-manifest.json + classification + report/network-qa.json
 *   fonts  font-inventory.json license[] (+ release-layer font-decisions.json)
 *   brand  content report/brand-leak.json + template runtime IR surfaces
 *          (GED-F detector — see brand-scan.ts; DETECTION ONLY, no rewrite)
 *   inline svg  asset inventory manifest counts.inlineSvgEntries
 *   production  production-spec.json indexabilityGate + build report/qa.json
 *
 * ZERO re-detection: every requirement cites the artifact file + pointer it
 * was read from, and every number is read at runtime (spec §23 — nothing
 * site-specific is hardcoded).
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { scanAppBrandHosts } from "../production/index.js";
import {
  brandSurfaceRequirements,
  evaluateBrandOutputProof,
  scanBrandSurfaces,
  sourceBrandAssetRequirement,
  type BrandOutputProof,
  type BrandBakeSection,
  type HydratedBrandCensus,
  type BrandSurfaceReport,
} from "./brand-scan.js";
import {
  SEVERITY_POLICY,
  type Requirement,
  type RequirementKind,
} from "./types.js";

export interface LineagePaths {
  host: string;
  templateRunDir: string;
  contentRunDir: string;
  themeRunDir: string;
  seoPlanRunDir: string;
  materializationRunDir: string;
  /** Derived from the materialization manifest when omitted. */
  inventoryRunDir?: string;
  productionSpecFile?: string | null;
  productionBuildDir?: string | null;
  /**
   * The project's resolved ENABLEMENT (Task 28 Phases 5 + 6).
   *
   * Two effects, both deliberately narrow:
   *   - `disabledRoutes` filters the ROUTE POPULATION every per-route number is
   *     counted over. It does NOT filter any requirement list: the per-route
   *     SEO requirements are derived from the SEO PLAN's own
   *     `report/needs-input.json`, so a disabled route stops producing them
   *     because the plan no longer names it — the artifact is the evidence, not
   *     this flag. Filtering the collector instead would be exactly the defect
   *     a verifier already caught once in this program.
   *   - `deadLinks` ADDS `dead-internal-link` requirements. They clear only on
   *     the served build's own link audit (`report/qa.json` siteLinks).
   */
  enablement?: {
    disabledRoutes: string[];
    deadLinks: Array<{
      targetRoute: string;
      linkingRoute: string;
      pageSourceId: string;
      viewport: string;
      nodeId: string;
      href: string;
      slotKey: string | null;
      groupId: string | null;
      reason: string;
    }>;
  };
}

export interface RouteReadiness {
  route: string;
  content: "injected" | "not-injected";
  seoNeedsInput: number;
  /** Residual source-host request count on the route (null = not measured). */
  assetsResidual: number | null;
  state: "READY" | "CONTENT_READY" | "NEEDS_INPUT";
}

export interface ArtifactFacts {
  routeCount: number;
  injectedRoutes: string[];
  seoNeedsInputTotal: number;
  domainStatus: string;
  domainValue: string | null;
  seoMode: "preview" | "production";
  replacementRequiredAwaiting: number;
  replacementAwaitingTotal: number;
  residualRenderedUrlCount: number;
  fontFamiliesUndecided: string[];
  inlineSvgEntryCount: number;
  /** Template hosts that actually CARRY the brand (Task 28 Phase 2) — the
   *  number the source-brand blocker is counted from. */
  brandCarryingHostCount: number;
  brandLeakWarnings: number;
  /** GED-F surface census (artifact-derived, never hardcoded). */
  brandSurfaceCounts: Record<string, number>;
  unresolvedSlotCount: number;
  themeCompatibility: string | null;
  specDecision: "preview" | "indexable" | null;
  specBlockerIds: string[];
  productionQaPass: boolean | null;
}

export interface CollectResult {
  requirements: Requirement[];
  routeReadiness: RouteReadiness[];
  warnings: string[];
  facts: ArtifactFacts;
  /** The full GED-F scan behind the `brand-leak` requirements. */
  brandSurfaces: BrandSurfaceReport;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

function req(partial: {
  requirementId: string;
  kind: RequirementKind;
  sourceStage: Requirement["sourceStage"];
  message: string;
  resolutionOptions: string[];
  evidence: Requirement["evidence"];
  severity?: Requirement["severity"];
  route?: string;
  slotKey?: string;
  assetId?: string;
  fontId?: string;
  factKey?: string;
  count?: number;
}): Requirement {
  return {
    status: "unresolved",
    severity: partial.severity ?? SEVERITY_POLICY[partial.kind].severity,
    ...partial,
  };
}

function slugify(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/-]+/g, "-");
}

/**
 * Read a build's own reports and evaluate the clearing rule over them.
 *
 * TWO artifacts of the SAME build: `report/bake-report.json` carries what the
 * resolver did and what the exported bytes census, and `report/qa.json`
 * carries the POST-HYDRATION census taken over the served package in a real
 * browser. Both are this build's own measurements — nothing is inherited from
 * another run, and a build with no qa.json reports the hydrated axis as
 * unmeasured instead of assuming it clean.
 *
 * The RULE itself lives in brand-scan.ts so a canary can evaluate the
 * identical function over a report it just produced in memory.
 */
async function readBrandOutputProof(productionBuildDir: string | null): Promise<BrandOutputProof | null> {
  if (productionBuildDir === null) return null;
  const file = path.join(productionBuildDir, "report", "bake-report.json");
  if (!existsSync(file)) return null;
  const report = await readJson<{ brand?: BrandBakeSection }>(file);
  const qaFile = path.join(productionBuildDir, "report", "qa.json");
  let hydrated: HydratedBrandCensus | null = null;
  if (existsSync(qaFile)) {
    const qa = await readJson<{
      brandSurfaceCensusHydrated?: { routesMeasured?: number } & Record<string, unknown>;
    }>(qaFile);
    const census = qa.brandSurfaceCensusHydrated;
    if (census !== undefined && typeof census.routesMeasured === "number") {
      hydrated = { counts: census as Record<string, number>, routesMeasured: census.routesMeasured };
    }
  }
  return evaluateBrandOutputProof(file, report.brand, hydrated);
}

export async function collectRequirements(paths: LineagePaths): Promise<CollectResult> {
  const warnings: string[] = [];
  const requirements: Requirement[] = [];

  // ---- read the artifacts (all read-only) ---------------------------------
  const templateManifest = await readJson<{ routes: string[]; counts?: Record<string, number> }>(
    path.join(paths.templateRunDir, "manifest.json"),
  );
  const contentManifest = await readJson<{
    runId: string;
    scopedRoutes?: string[];
    counts?: { unresolvedSlots?: number };
    brandLeakWarnings?: number;
  }>(path.join(paths.contentRunDir, "manifest.json"));
  const generationResult = await readJson<{
    unresolved?: Array<{ slotKey: string; reason: string }>;
  }>(path.join(paths.contentRunDir, "generation-result.json"));
  const seoPlanFile = path.join(paths.seoPlanRunDir, "production-seo-plan.json");
  const seoPlan = await readJson<{
    runId: string;
    domainState: {
      mode: "preview" | "production";
      productionDomain: { value: string | null; status: string; basis: string };
    };
    site: { businessFacts: Record<string, { status: string; value: unknown }> };
    routes: Array<{
      route: string;
      contentScope: string;
      jsonLd?: { omittedNeedsInput?: string[] };
    }>;
  }>(seoPlanFile);
  const needsInputFile = path.join(paths.seoPlanRunDir, "report", "needs-input.json");
  const needsInput = await readJson<{ total: number; entries: Array<{ location: string; basis: string }> }>(
    needsInputFile,
  );
  const materializationManifest = await readJson<{ runId: string; inventoryRunDir: string }>(
    path.join(paths.materializationRunDir, "manifest.json"),
  );
  const inventoryRunDir = paths.inventoryRunDir ?? materializationManifest.inventoryRunDir;
  const inventoryManifest = await readJson<{ counts: Record<string, number> }>(
    path.join(inventoryRunDir, "manifest.json"),
  );
  const replacementManifestFile = path.join(paths.materializationRunDir, "replacement-manifest.json");
  const replacementManifest = await readJson<{
    entries: Array<{
      inventoryId: string;
      sourceUrl: string;
      classification: string;
      slotKeys: string[];
      imageBrief: { warning?: string | null } | null;
      replacement: { status: string; providedFile: string | null };
      note: string;
    }>;
  }>(replacementManifestFile);
  const networkQaFile = path.join(paths.materializationRunDir, "report", "network-qa.json");
  const networkQa = existsSync(networkQaFile)
    ? await readJson<{
        independent: Array<{ route: string; sourceHost: number; sourceUrls: string[] }>;
        totals: { residualSourceUrls: string[] };
      }>(networkQaFile)
    : null;
  if (networkQa === null) {
    warnings.push(
      `assets: ${networkQaFile} missing — runtime residual census unmeasured (run assets:qa); ` +
        "residual counts treated as unknown, not zero",
    );
  }
  const fontInventoryFile = path.join(inventoryRunDir, "font-inventory.json");
  const fontInventory = await readJson<{
    license: Array<{ family: string; status: string; reason: string }>;
    fallbackPlan: Array<{ family: string; fallbackStack: string }>;
  }>(fontInventoryFile);
  // Release-layer font decisions live IN the (derived) materialization run.
  const fontDecisionsFile = path.join(paths.materializationRunDir, "font-decisions.json");
  const fontDecisions = existsSync(fontDecisionsFile)
    ? await readJson<Record<string, { decision: string; license?: string }>>(fontDecisionsFile)
    : {};
  const brandLeakFile = path.join(paths.contentRunDir, "report", "brand-leak.json");
  const brandLeak = existsSync(brandLeakFile)
    ? await readJson<{ warnings: Array<{ slotKey: string | null }> }>(brandLeakFile)
    : { warnings: [] };
  const themeCompatFile = path.join(paths.themeRunDir, "compatibility.json");
  const themeCompat = existsSync(themeCompatFile)
    ? await readJson<{ result: string }>(themeCompatFile)
    : null;
  const spec =
    paths.productionSpecFile && existsSync(paths.productionSpecFile)
      ? await readJson<{
          indexabilityGate: { decision: "preview" | "indexable"; blockers: Array<{ id: string }> };
          baseUrl: { value: string | null; status: string };
        }>(paths.productionSpecFile)
      : null;
  const qaFile = paths.productionBuildDir
    ? path.join(paths.productionBuildDir, "report", "qa.json")
    : null;
  const qaReport =
    qaFile && existsSync(qaFile)
      ? await readJson<{
          failed: number;
          passed: number;
          siteLinks?: { brokenInternalTargets?: string[]; routesAudited?: number };
        }>(qaFile)
      : null;

  // The ROUTE POPULATION every per-route number below is counted over. A
  // disabled route is not a route of this site any more, so counting it would
  // report a readiness row and a routeCount for a page that is not exported.
  const disabledRoutes = new Set(paths.enablement?.disabledRoutes ?? []);
  const routes = templateManifest.routes.filter((route) => !disabledRoutes.has(route));
  const injectedRoutes = contentManifest.scopedRoutes ?? [];
  const injected = new Set(injectedRoutes);

  // ---- 1. production domain (seo plan domainState) ------------------------
  if (seoPlan.domainState.productionDomain.status === "needs-input") {
    requirements.push(
      req({
        requirementId: "production-domain",
        kind: "production-domain",
        sourceStage: "seo",
        message: seoPlan.domainState.productionDomain.basis,
        resolutionOptions: ["productionBaseUrl"],
        evidence: [
          {
            file: seoPlanFile,
            pointer: "domainState.productionDomain",
            detail: `status=${seoPlan.domainState.productionDomain.status}`,
          },
        ],
      }),
    );
  }

  // ---- 2. business facts (seo plan site.businessFacts) --------------------
  for (const [key, fact] of Object.entries(seoPlan.site.businessFacts)) {
    if (fact.status !== "needs-input") continue;
    requirements.push(
      req({
        requirementId: `business-fact-${key}`,
        kind: "business-fact",
        sourceStage: "seo",
        factKey: key,
        message: `business fact "${key}" is needs-input — JSON-LD omits it rather than inventing a value`,
        resolutionOptions: [`facts.${key}`],
        evidence: [{ file: seoPlanFile, pointer: `site.businessFacts.${key}`, detail: "status=needs-input" }],
      }),
    );
  }

  // ---- 3. per-route SEO needs-input → content-route / og-image / handle ---
  const routeEntries = new Map<string, Array<{ location: string; basis: string; field: string }>>();
  for (const entry of needsInput.entries) {
    const match = entry.location.match(/^routes\[(.+?)\]\.(.+)$/);
    if (!match) continue; // domainState/site.* already covered above
    const route = match[1];
    const list = routeEntries.get(route) ?? [];
    list.push({ ...entry, field: match[2] });
    routeEntries.set(route, list);
  }
  const ogImageRoutes: string[] = [];
  const twitterRoutes: string[] = [];
  for (const [route, entries] of routeEntries) {
    if (!injected.has(route)) {
      // The whole route still serves source body copy — one requirement per
      // route, carrying every SEO gap the plan recorded for it.
      requirements.push(
        req({
          requirementId: `content-route-${slugify(route)}`,
          kind: "content-route",
          sourceStage: "content",
          route,
          count: entries.length,
          message:
            `route ${route} is not in the content-run scope (source copy is forbidden) — ` +
            `${entries.length} SEO value(s) needs-input until content is provided`,
          resolutionOptions: [`routeContent["${route}"]`],
          evidence: [
            {
              file: needsInputFile,
              pointer: `routes[${route}].*`,
              detail: entries[0]?.basis ?? "route not in content-run scope",
            },
            {
              file: path.join(paths.contentRunDir, "manifest.json"),
              pointer: "scopedRoutes",
              detail: `scope: ${injectedRoutes.join(", ") || "(none)"}`,
            },
          ],
        }),
      );
      continue;
    }
    for (const entry of entries) {
      if (entry.field === "openGraph.image") ogImageRoutes.push(route);
      else if (entry.field === "twitter.site") twitterRoutes.push(route);
      else if (entry.field === "openGraph.url") continue; // domain-driven
      else {
        requirements.push(
          req({
            requirementId: `seo-fact-${slugify(route)}-${slugify(entry.field)}`,
            kind: "seo-fact",
            sourceStage: "seo",
            route,
            message: `SEO value ${entry.field} on ${route} is needs-input: ${entry.basis}`,
            resolutionOptions: ["facts / routeContent (field-dependent)"],
            evidence: [{ file: needsInputFile, pointer: entry.location, detail: entry.basis }],
          }),
        );
      }
    }
  }
  if (ogImageRoutes.length > 0) {
    requirements.push(
      req({
        requirementId: "og-image",
        kind: "og-image",
        sourceStage: "seo",
        assetId: "og-image",
        count: ogImageRoutes.length,
        message:
          `no production social image exists — og:image is needs-input on ${ogImageRoutes.length} injected route(s); ` +
          "source images are forbidden",
        resolutionOptions: ['assets["og-image"] (SEO-plan consumption is a named seam — recorded and shipped in media/)'],
        evidence: ogImageRoutes.map((route) => ({
          file: needsInputFile,
          pointer: `routes[${route}].openGraph.image`,
        })),
      }),
    );
  }
  if (twitterRoutes.length > 0) {
    requirements.push(
      req({
        requirementId: "social-handle",
        kind: "social-handle",
        sourceStage: "seo",
        count: twitterRoutes.length,
        message: "no production social account provided — twitter.site is never invented",
        resolutionOptions: ["facts.twitterSite (recorded; SEO-plan consumption is a named seam)"],
        evidence: twitterRoutes.map((route) => ({
          file: needsInputFile,
          pointer: `routes[${route}].twitter.site`,
        })),
      }),
    );
  }

  // ---- 3b. dead internal links to a DISABLED route (Task 28 Phase 6) ------
  //
  // One requirement per (disabled target route, linking route): an operator
  // acts on a page, not on a node id, and the nodes are carried as evidence.
  // CLEARING IS MEASURED, never requested: the status flips to `resolved` only
  // when the SERVED package's own link audit reports no broken internal link
  // whose target is this route. A build with no qa.json leaves it unresolved
  // rather than assuming it clean.
  const servedBrokenTargets = new Set(qaReport?.siteLinks?.brokenInternalTargets ?? []);
  const linkAuditRan = (qaReport?.siteLinks?.routesAudited ?? 0) > 0;
  type CollectedDeadLink = NonNullable<LineagePaths["enablement"]>["deadLinks"][number];
  const deadLinkGroups = new Map<string, CollectedDeadLink[]>();
  for (const finding of paths.enablement?.deadLinks ?? []) {
    const key = `${finding.targetRoute}|${finding.linkingRoute}`;
    const list = deadLinkGroups.get(key) ?? [];
    list.push(finding);
    deadLinkGroups.set(key, list);
  }
  for (const [key, findings] of [...deadLinkGroups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [targetRoute, linkingRoute] = key.split("|");
    const stillServed = servedBrokenTargets.has(targetRoute);
    const requirement = req({
      requirementId: `dead-internal-link-${slugify(linkingRoute)}-to-${slugify(targetRoute)}`,
      kind: "dead-internal-link",
      sourceStage: "content",
      route: linkingRoute,
      count: findings.length,
      ...(findings[0].slotKey !== null ? { slotKey: findings[0].slotKey } : {}),
      message:
        `${linkingRoute} links to ${targetRoute}, which is DISABLED — ${findings.length} link site(s) the ` +
        "engine will not remove on its own " +
        `(${[...new Set(findings.map((finding) => finding.reason))].join(", ")}). ` +
        (findings.some((finding) => finding.reason === "dynamic-template-host")
          ? "At least one of them lives inside a CAPTURED DYNAMIC TEMPLATE (a menu the runtime mounts): " +
            "its markup is frozen reconstruction output, so the engine will not rewrite it and the link " +
            "survives into the RSC flight payload AND into the mounted DOM — MEASURED on a real package, " +
            "clicking the trigger mounts a visible anchor whose GET is 404. "
          : "") +
        (findings.some((finding) => finding.reason === "serialized-markup-host")
          ? "At least one of them lives inside another SERIALIZED MARKUP string (an inline SVG, a captured " +
            "attribute) that no element walk can see. "
          : "") +
        "Change the destination, remove the link, or re-enable the route. It is never silently " +
        "redirected to the homepage.",
      resolutionOptions: [
        findings[0].slotKey !== null
          ? `authored.slotValues["${findings[0].slotKey}"] = a live destination`
          : "edit the linking section (the anchor carries no url slot)",
        `authored.disabledRoutes: re-enable ${targetRoute}`,
      ],
      evidence: findings.slice(0, 10).map((finding) => ({
        file: path.join(paths.templateRunDir, "app", "reconstruction-data", "route-map.json"),
        pointer: `${finding.pageSourceId}/${finding.viewport}/${finding.nodeId}`,
        detail: `href=${finding.href}${finding.slotKey === null ? "" : ` slot=${finding.slotKey}`}`,
      })),
    });
    // CLEARING IS MEASURED, and only on evidence that can actually see the
    // channel the link lives in.
    //
    // `siteLinks` parses ANCHORS out of the served HTML. That is complete
    // evidence for a static anchor and structurally BLIND to a link captured
    // inside a `data-wr-dyn-template` attribute (or a paint twin): the runtime
    // mounts that markup from a serialized string, so no <a> exists in the
    // served bytes to audit and the audit reports zero for a link that will
    // still render. Clearing on it would be exactly the "narrow the detector
    // until the gate passes" failure this program was corrected for once
    // already, so a requirement carrying such a finding stays UNRESOLVED and
    // says why.
    const blindChannels = [
      ...new Set(
        findings
          .filter(
            (finding) =>
              finding.reason === "dynamic-template-host" ||
              finding.reason === "paint-twin-host" ||
              finding.reason === "serialized-markup-host",
          )
          .map((finding) => finding.reason),
      ),
    ].sort();
    if (linkAuditRan && !stillServed && blindChannels.length === 0) {
      requirement.status = "resolved";
      requirement.statusNote =
        `cleared by MEASURED OUTPUT: the served package's link audit (report/qa.json siteLinks, ` +
        `${qaReport?.siteLinks?.routesAudited} route(s) audited) reports no internal link resolving to ` +
        `${targetRoute}`;
    } else if (linkAuditRan && !stillServed) {
      requirement.statusNote =
        `NOT cleared by the served link audit: ${blindChannels.join(", ")} link(s) are carried in a ` +
        "serialized template attribute, which the anchor audit cannot see — a zero there is not " +
        "evidence that this link is gone";
    }
    requirements.push(requirement);
  }

  // ---- 4. organization logo (jsonLd omissions on injected routes) ---------
  const logoOmissions = seoPlan.routes.filter(
    (route) =>
      injected.has(route.route) &&
      (route.jsonLd?.omittedNeedsInput ?? []).some((entry) => entry.startsWith("logo")),
  );
  if (logoOmissions.length > 0) {
    requirements.push(
      req({
        requirementId: "organization-logo",
        kind: "organization-logo",
        sourceStage: "seo",
        assetId: "organization-logo",
        message: "no production organization logo asset exists — JSON-LD omits `logo` honestly",
        resolutionOptions: ['assets["organization-logo"] (recorded and shipped in media/; JSON-LD wiring is a named seam)'],
        evidence: logoOmissions.map((route) => ({
          file: seoPlanFile,
          pointer: `routes[${route.route}].jsonLd.omittedNeedsInput`,
        })),
      }),
    );
  }

  // ---- 5. unresolved content slots → external-url / business-fact ---------
  for (const slot of generationResult.unresolved ?? []) {
    const isHref = slot.slotKey.endsWith(".href");
    requirements.push(
      req({
        requirementId: isHref
          ? `external-url-${slugify(slot.slotKey)}`
          : `business-fact-slot-${slugify(slot.slotKey)}`,
        kind: isHref ? "external-url" : "business-fact",
        sourceStage: "content",
        slotKey: slot.slotKey,
        message: `content slot ${slot.slotKey} is unresolved: ${slot.reason}`,
        resolutionOptions: isHref
          ? [`urls["${slot.slotKey}"]`]
          : [`routeContent["global"].slotValues["${slot.slotKey}"]`, `urls["${slot.slotKey}"]`],
        evidence: [
          {
            file: path.join(paths.contentRunDir, "generation-result.json"),
            pointer: `unresolved[${slot.slotKey}]`,
            detail: slot.reason,
          },
        ],
      }),
    );
  }

  // ---- 6. replacement assets (materialization replacement seam) -----------
  const residualUrls = new Set(networkQa?.totals.residualSourceUrls ?? []);
  for (const entry of replacementManifest.entries) {
    if (entry.replacement.status === "provided") continue; // resolved in-artifact
    const renders = residualUrls.has(entry.sourceUrl);
    const required = entry.classification === "replacement-required";
    requirements.push(
      req({
        requirementId: `replacement-image-${entry.inventoryId}`,
        kind: "replacement-image",
        sourceStage: "assets",
        assetId: entry.inventoryId,
        severity: required || renders ? "release-blocking" : "high-value",
        slotKey: entry.slotKeys[0],
        message:
          `${entry.classification} asset ${entry.inventoryId} awaits a replacement` +
          (renders ? " — and still RENDERS from the source host at runtime" : "") +
          (entry.imageBrief?.warning ? ` (${entry.imageBrief.warning})` : ""),
        resolutionOptions: [`assets["${entry.inventoryId}"]`],
        evidence: [
          {
            file: replacementManifestFile,
            pointer: `entries[${entry.inventoryId}]`,
            detail: entry.note,
          },
          ...(renders && networkQa
            ? [
                {
                  file: networkQaFile,
                  pointer: "totals.residualSourceUrls",
                  detail: entry.sourceUrl,
                },
              ]
            : []),
        ],
      }),
    );
  }
  // Residual render URLs with no manifest entry (defensive — never drop one).
  for (const url of residualUrls) {
    const provided = replacementManifest.entries.find(
      (entry) => entry.sourceUrl === url && entry.replacement.status === "provided",
    );
    if (provided !== undefined) {
      warnings.push(
        `assets: inherited network census still lists ${url} as residual although ` +
          `${provided.inventoryId} was provided — re-run assets:qa to re-measure`,
      );
      continue;
    }
    if (replacementManifest.entries.some((entry) => entry.sourceUrl === url)) continue;
    requirements.push(
      req({
        requirementId: `runtime-source-asset-${slugify(url).slice(-40)}`,
        kind: "replacement-image",
        sourceStage: "assets",
        severity: "release-blocking",
        message: `source-host URL still renders at runtime and has no replacement-manifest entry: ${url}`,
        resolutionOptions: ["re-run assets:inventory + assets:materialize (GED-G territory)"],
        evidence: [{ file: networkQaFile, pointer: "totals.residualSourceUrls", detail: url }],
      }),
    );
  }

  // ---- 7. fonts (inventory license[] + release-layer decisions) -----------
  for (const license of fontInventory.license) {
    if (license.status !== "license-needs-review") continue;
    const decision = fontDecisions[license.family];
    const fallback = fontInventory.fallbackPlan.find((plan) => plan.family === license.family);
    const requirement = req({
      requirementId: `font-license-${slugify(license.family)}`,
      kind: "font-license",
      sourceStage: "assets",
      fontId: license.family,
      message:
        `webfont "${license.family}" license is unverified — not self-hosted; ` +
        `measured fallback stack renders (${fallback?.fallbackStack ?? "system fallback"})`,
      resolutionOptions: [
        `fontDecisions["${license.family}"] = use-fallback-stack (accept the measured fallback)`,
        `fontDecisions["${license.family}"] = self-host-license-verified (operator-verified license; hosting is a named seam)`,
      ],
      evidence: [
        { file: fontInventoryFile, pointer: `license[${license.family}]`, detail: license.reason },
        ...(decision
          ? [
              {
                file: fontDecisionsFile,
                pointer: license.family,
                detail: `decision=${decision.decision}${decision.license ? ` license=${decision.license}` : ""}`,
              },
            ]
          : []),
      ],
    });
    if (decision) {
      requirement.status = "resolved";
      requirement.statusNote = `decision recorded in the materialization run: ${decision.decision}`;
    }
    requirements.push(requirement);
  }

  // ---- 8. brand-leak surfaces (GED-F detector, Task 27) -------------------
  // The content run's brand-leak warnings stop being a log line and become
  // STRUCTURED requirements, joined by the surfaces nothing detected before
  // (inline-SVG aria-label / <symbol id>). Blocking policy lives in
  // brand-scan.ts, not here. Scanned BEFORE section 9 so the existing
  // inline-SVG blocker can cite which surfaces actually carry the mark.
  const brandSurfaces = await scanBrandSurfaces({
    host: paths.host,
    templateRunDir: paths.templateRunDir,
    contentRunDir: paths.contentRunDir,
    productionBuildDir: paths.productionBuildDir ?? null,
  });

  // ---- 9. source-brand ASSETS (Task 28 Phase 2) --------------------------
  //
  // WHAT CHANGED, and why it is not a downgrade.
  //
  //   COUNT. The blocker used to carry `inventory.counts.inlineSvgEntries` —
  //   EVERY inline SVG, icons included (207 on the accepted linear lineage,
  //   against 64 hosts that actually carry the brand). It now carries the
  //   BRAND-CARRYING HOST count, measured on the template's own runtime IR by
  //   the same walker the bake-time resolver uses. Fewer, but each one is real.
  //
  //   CLEARING. It clears ONLY on OUTPUT PROOF: the production build's own
  //   bake report must show that every brand-carrying host left in the built
  //   app's IR is covered by an explicit PRESERVE decision, and — when nothing
  //   is preserved — that the exported HTML *and* the RSC flight both census
  //   zero brand surfaces. A decision alone never clears it; a REPLACE that
  //   the resolver refused, or that the census still sees, leaves it standing.
  //
  //   DETECTION BASIS, and where it is still blind. Tokens are the host LABEL
  //   widened by the name the SOURCE DECLARES in its own route-map titles
  //   (`appBrandTokens`). The widening is what stops the count going silent on
  //   a brand that is not spelled the way its domain is: measured,
  //   domainchecker.co.kr goes 0 -> 38 hosts (its header ships
  //   aria-label="도메인체커 홈"), nextjs.org 160 -> 190, while linear.app
  //   (80) and stripe.com (195) do not move. It is STILL a token detector: a
  //   brand string derivable from neither the host label nor a declared title
  //   name raises nothing, so the zero case is reported as a WARNING below
  //   rather than passing in silence.
  const templateBrandHosts = await scanAppBrandHosts(
    path.join(paths.templateRunDir, "app"),
    paths.host,
  );
  const brandCarryingHostCount = templateBrandHosts.hosts.length;
  const inlineSvgEntryCount = inventoryManifest.counts.inlineSvgEntries ?? 0;
  if (brandCarryingHostCount === 0 && inlineSvgEntryCount > 0) {
    // NOT a blocker: raising one over icon SVGs is the ~3.2x overstatement
    // Task 28 replaced. But a template with inline SVGs and ZERO detected
    // brand hosts is exactly the shape a token detector can be wrong about,
    // and an operator must be told the axis measured nothing rather than
    // reading the absence of a requirement as proof of absence.
    warnings.push(
      `brand: ${inlineSvgEntryCount} inline-SVG entry/entries but ZERO brand-carrying host(s) ` +
        "detected — detection is token-derived (host label + the name the source declares in its " +
        "own titles), so a source brand spelled some other way would raise no requirement here",
    );
  }
  if (brandCarryingHostCount > 0) {
    requirements.push(
      sourceBrandAssetRequirement({
        hosts: templateBrandHosts.hosts,
        routes: templateBrandHosts.routes,
        templateRunDir: paths.templateRunDir,
        inlineSvgEntryCount,
        productionBuildDir: paths.productionBuildDir ?? null,
        proof: await readBrandOutputProof(paths.productionBuildDir ?? null),
      }),
    );
  }

  requirements.push(...brandSurfaceRequirements(brandSurfaces));
  if (brandSurfaces.truncated > 0) {
    warnings.push(
      `content: brand surface scan kept a capped sample — ${brandSurfaces.truncated} finding(s) ` +
        "beyond the per-surface cap are counted but not listed individually",
    );
  }
  for (const gap of brandSurfaces.scanned.unavailable) {
    // "not-yet-measured" is the normal pre-production state, not an operator
    // action — only a genuinely MISSING artifact earns a warning line.
    if (gap.kind !== "missing-artifact") continue;
    warnings.push(`brand: surface ${gap.surface} unmeasured on this lineage — ${gap.reason}`);
  }

  // ---- warnings (never blockers) ------------------------------------------
  if (brandLeak.warnings.length > 0) {
    // Split so the count the operator reads matches what it means: slot-scoped
    // findings have a write target, surface-scoped ones (Task 28 CR8) do not.
    const slotScoped = brandLeak.warnings.filter((warning) => warning.slotKey !== null).length;
    const surfaceScoped = brandLeak.warnings.length - slotScoped;
    warnings.push(
      `content: ${brandLeak.warnings.length} source-brand-leak warning(s) ` +
        `(${slotScoped} slot-scoped on untouched defaults, ${surfaceScoped} markup-surface, ` +
        `detection only) (${brandLeakFile})`,
    );
  }
  if (themeCompat && themeCompat.result !== "compatible") {
    warnings.push(`theme: compatibility is ${themeCompat.result} (${themeCompatFile})`);
  }

  // ---- route readiness (spec §20) -----------------------------------------
  const residualByRoute = new Map<string, number>();
  for (const row of networkQa?.independent ?? []) residualByRoute.set(row.route, row.sourceHost);
  const domainProvided = seoPlan.domainState.productionDomain.status !== "needs-input";
  const routeReadiness: RouteReadiness[] = routes.map((route) => {
    const isInjected = injected.has(route);
    const seoCount = routeEntries.get(route)?.length ?? 0;
    const residual = residualByRoute.get(route) ?? null;
    let state: RouteReadiness["state"];
    if (!isInjected) state = "NEEDS_INPUT";
    else if (!domainProvided || (residual ?? 0) > 0) state = "CONTENT_READY";
    else state = "READY";
    return {
      route,
      content: isInjected ? "injected" : "not-injected",
      seoNeedsInput: seoCount,
      assetsResidual: residual,
      state,
    };
  });

  const facts: ArtifactFacts = {
    routeCount: routes.length,
    injectedRoutes,
    seoNeedsInputTotal: needsInput.total,
    domainStatus: seoPlan.domainState.productionDomain.status,
    domainValue: seoPlan.domainState.productionDomain.value,
    seoMode: seoPlan.domainState.mode,
    replacementRequiredAwaiting: replacementManifest.entries.filter(
      (entry) => entry.classification === "replacement-required" && entry.replacement.status !== "provided",
    ).length,
    replacementAwaitingTotal: replacementManifest.entries.filter(
      (entry) => entry.replacement.status !== "provided",
    ).length,
    residualRenderedUrlCount: networkQa?.totals.residualSourceUrls.length ?? -1,
    fontFamiliesUndecided: fontInventory.license
      .filter((license) => license.status === "license-needs-review" && !fontDecisions[license.family])
      .map((license) => license.family),
    inlineSvgEntryCount,
    brandCarryingHostCount,
    brandLeakWarnings: brandLeak.warnings.length,
    brandSurfaceCounts: brandSurfaces.counts,
    unresolvedSlotCount: (generationResult.unresolved ?? []).length,
    themeCompatibility: themeCompat?.result ?? null,
    specDecision: spec?.indexabilityGate.decision ?? null,
    specBlockerIds: spec?.indexabilityGate.blockers.map((blocker) => blocker.id) ?? [],
    productionQaPass: qaReport === null ? null : qaReport.failed === 0,
  };

  // Deterministic order: severity, then kind, then id.
  const severityOrder = { "release-blocking": 0, "high-value": 1, optional: 2 } as const;
  requirements.sort((a, b) => {
    const bySeverity = severityOrder[a.severity] - severityOrder[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.requirementId < b.requirementId ? -1 : 1;
  });

  return { requirements, routeReadiness, warnings, facts, brandSurfaces };
}
