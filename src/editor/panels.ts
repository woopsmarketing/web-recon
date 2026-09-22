/**
 * The three right-hand panels that are not the Slot inspector — Region, Theme
 * and Logo (brand) — plus the read-only QA view.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { brandSurfaceId } from "../release/authored.js";
import { scanBrandSurfaces, type BrandFinding, type BrandSurfaceReport } from "../release/brand-scan.js";
import { RESOLVABLE_BRAND_SURFACES, SURFACES_NOT_RESOLVED } from "../production/brand-bake.js";
import { listThemeLibrary, loadThemeRun } from "../theme/run.js";
import {
  THEME_TOKENS,
  isSafeThemeValue,
  isThemeToken,
  tokenKind,
  tokenLevel,
  type SiteThemeAdapter,
  type ThemeFile,
} from "../theme/types.js";
import type { PageRegion } from "../regions/types.js";
import type { RefusalView } from "./enablement.js";
import type { EditorSite } from "./catalog.js";

// ---------------------------------------------------------------------------
// Region panel — and the enablement SEAM
// ---------------------------------------------------------------------------

/**
 * REGION/ROUTE ENABLEMENT IS NOT OWNED BY THIS MODULE.
 *
 * Task 28 Phase 4 ships the Region panel and every fact it needs
 * (`page-regions.json` — regionId, landmark, route ownership, shared-page
 * ownership, slot count). The ENABLEMENT toggle is another builder's API,
 * landing in `src/release` / `src/regions` in parallel with this work, so the
 * editor defines the port it will call and refuses to fake the state in the
 * meantime: `enabled: null` means UNKNOWN, never "on".
 *
 * WIRING IT IS ONE SUBSTITUTION. Implement this interface over the new API and
 * pass it as `regionEnablement` to `startVisualEditor`. Nothing else changes:
 * the panel already renders `enabled` / `editable` / `source`, and
 * `POST /api/region-enablement` already routes to `write()`.
 */
export interface RegionEnablementState {
  regionId: string;
  /** null = the editor does not know; NEVER defaulted to true. */
  enabled: boolean | null;
  /** Where the value came from, verbatim, for the panel to print. */
  source: string;
  /** Can the toggle write? False until the port is wired. */
  editable: boolean;
  /**
   * Every engine refusal that bears on this region, carried WHOLE.
   *
   * Task 28 integration: a refusal is a first-class part of the state, not a
   * transient toast. A region with a recorded disable the resolver refuses
   * reports `enabled: null` AND the refusals that explain it, so the panel can
   * name the route, the region and the dependency instead of saying "failed".
   */
  refusals: RefusalView[];
}

export interface RegionEnablementWriteRequest {
  regionId: string;
  enabled: boolean;
  /**
   * The route the operator is LOOKING AT when they click the toggle.
   *
   * The engine's `RegionToggleRequest` has always declared this field; the
   * adapter did not, so `server.ts` had nothing to forward and every HTTP
   * write arrived with `route: undefined`. Nothing was visibly broken — the
   * client also sends `routes: [route]`, which is what rule 1 actually reads —
   * but the engine's `widenedToBlastRadius` guard, whose whole purpose is that
   * "a silent widening is exactly the failure", could never become true on the
   * UI path and was therefore inert. Both are carried now: `routes` is the
   * explicit single-element list the engine adjudicates, `route` is the intent
   * it was derived from, and a caller that sends only `route` gets the same
   * answer as one that sends only `routes: [route]`.
   */
  route?: string | null;
  /** "global" is the honest default; "routes" is the operator's explicit ask. */
  scope?: "global" | "routes";
  routes?: string[];
  /** Region ids the operator accepted to resolve an interaction cut. */
  cascadeRegionIds?: string[];
  reason?: string;
}

export interface RegionEnablementWriteResult {
  changed: boolean;
  reason: string;
  state: RegionEnablementState | null;
  /** Non-empty exactly when the engine REFUSED. Nothing was written. */
  refusals: RefusalView[];
  revisionId: string | null;
  /** Region ids disabled ALONGSIDE the subject, when a cascade was accepted. */
  cascadeApplied: string[];
  /** Non-blocking facts the operator must still be told (orphans, siblings). */
  warnings: string[];
  /** What the accepted disable actually costs, from the engine's own effect. */
  effect: {
    blastRadius: string[];
    slotKeys: number;
    nodes: number;
    disabledNodeCount: number;
    siblingRegionIds: string[];
    orphanedTargets: number;
  } | null;
  /** Set when this edit recorded auxiliary.pageRegionsDir on the project. */
  adoption: string | null;
  /**
   * True when the request named NO route and no route list, so the engine
   * recorded the disable over the region's WHOLE blast radius.
   *
   * Carried across the adapter boundary deliberately: the engine computes it
   * so the widening can never be silent, and a flag no consumer can read is a
   * silent widening with extra steps.
   */
  widenedToBlastRadius: boolean;
}

export interface RegionEnablementPort {
  readonly name: string;
  readonly wired: boolean;
  read(site: EditorSite, regionIds: string[]): Promise<Map<string, RegionEnablementState>>;
  write(site: EditorSite, request: RegionEnablementWriteRequest): Promise<RegionEnablementWriteResult>;
}

export const REGION_ENABLEMENT_SEAM =
  "src/editor/panels.ts RegionEnablementPort — read(site, regionIds) / write(site, regionId, enabled). " +
  "Pass an implementation as startVisualEditor({ regionEnablement }). Until then every region reports " +
  "enabled: null (unknown) and editable: false, and POST /api/region-enablement answers 501 with this note.";

export const UNWIRED_REGION_ENABLEMENT: RegionEnablementPort = {
  name: "unwired",
  wired: false,
  async read(_site, regionIds) {
    const out = new Map<string, RegionEnablementState>();
    for (const regionId of regionIds) {
      out.set(regionId, {
        regionId,
        enabled: null,
        source: "no enablement artifact is readable from this editor build",
        editable: false,
        refusals: [],
      });
    }
    return out;
  },
  async write(_site, request) {
    return {
      changed: false,
      reason: `region enablement is not wired: ${REGION_ENABLEMENT_SEAM}`,
      refusals: [],
      revisionId: null,
      cascadeApplied: [],
      warnings: [],
      effect: null,
      adoption: null,
      widenedToBlastRadius: false,
      state: {
        regionId: request.regionId,
        enabled: null,
        source: "not wired",
        editable: false,
        refusals: [],
      },
    };
  },
};

export interface RegionOccurrenceRow {
  viewport: string;
  nodeId: string;
  elementCount: number;
  bindingCount: number;
  docOrder: number;
}

export interface RegionRow {
  regionId: string;
  scope: string;
  scopeKey: string;
  landmarkKind: string;
  landmarkKey: string;
  landmarkSource: string;
  rootTag: string;
  childPath: string;
  elementCount: number;
  bindingCount: number;
  dynamicTemplateBindingCount: number;
  slotCount: number;
  /** Every route that reaches this region ON THIS PAGE. */
  routesOnThisPage: string[];
  /** Every pageSourceId the region appears on — shared-page ownership. */
  pages: string[];
  sharedAcrossPages: boolean;
  /**
   * EVERY route the region renders on, across every page it appears on.
   *
   * This is the number that decides whether "turn this off for this route
   * only" is even expressible: when it is > 1 the region id is shared, and the
   * engine will refuse a route-scoped disable that names a subset.
   */
  blastRadius: string[];
  occurrences: RegionOccurrenceRow[];
  enablement: RegionEnablementState;
}

export interface RegionPanel {
  available: boolean;
  regionsFile: string | null;
  pageId: string | null;
  viewport: string | null;
  totalRegions: number;
  rows: RegionRow[];
  enablementWired: boolean;
  enablementSeam: string;
  note: string;
}

export async function buildRegionPanel(
  site: EditorSite,
  pageId: string | null,
  viewport: string | null,
  port: RegionEnablementPort,
): Promise<RegionPanel> {
  if (site.regionsFile === null) {
    return {
      available: false,
      regionsFile: null,
      pageId,
      viewport,
      totalRegions: 0,
      rows: [],
      enablementWired: port.wired,
      enablementSeam: REGION_ENABLEMENT_SEAM,
      note: `no page-regions compile on disk whose templateId is ${site.templateId} — run the region compiler for this template`,
    };
  }
  const matching: PageRegion[] = site.regions.filter(
    (region) => pageId === null || region.pages.some((page) => page.pageSourceId === pageId),
  );
  const states = await port.read(
    site,
    matching.map((region) => region.regionId),
  );
  const rows: RegionRow[] = matching.map((region) => {
    const onPage = region.pages.find((page) => page.pageSourceId === pageId) ?? region.pages[0];
    const occurrences = (onPage?.occurrences ?? [])
      .filter((occurrence) => viewport === null || occurrence.viewport === viewport)
      .map((occurrence) => ({
        viewport: occurrence.viewport,
        nodeId: occurrence.nodeId,
        elementCount: occurrence.elementCount,
        bindingCount: occurrence.bindingCount,
        docOrder: occurrence.docOrder,
      }));
    return {
      regionId: region.regionId,
      scope: region.scope,
      scopeKey: region.scopeKey,
      landmarkKind: region.landmark.kind,
      landmarkKey: region.landmark.key,
      landmarkSource: region.landmark.source,
      rootTag: region.rootTag,
      childPath: region.childPath,
      elementCount: region.elementCount,
      bindingCount: region.bindingCount,
      dynamicTemplateBindingCount: region.dynamicTemplateBindingCount,
      slotCount: region.slotKeys.length,
      routesOnThisPage: onPage?.routes ?? [],
      pages: region.pages.map((page) => page.pageSourceId),
      sharedAcrossPages: region.pages.length > 1,
      blastRadius: [...new Set(region.pages.flatMap((page) => page.routes))].sort(),
      occurrences,
      enablement:
        states.get(region.regionId) ??
        { regionId: region.regionId, enabled: null, source: "not reported", editable: false, refusals: [] },
    };
  });
  rows.sort((a, b) => (a.occurrences[0]?.docOrder ?? 0) - (b.occurrences[0]?.docOrder ?? 0));
  return {
    available: true,
    regionsFile: site.regionsFile,
    pageId,
    viewport,
    totalRegions: site.regions.length,
    rows,
    enablementWired: port.wired,
    enablementSeam: REGION_ENABLEMENT_SEAM,
    note:
      "region roots join back into the DOM on the occurrence's nodeId (data-wr-node) — the same identity the slot inversion uses",
  };
}

/** Slot keys owned by one region — the AI-rewrite scope for "this section". */
export function regionSlotKeys(site: EditorSite, regionId: string): string[] {
  return site.regions.find((region) => region.regionId === regionId)?.slotKeys ?? [];
}

// ---------------------------------------------------------------------------
// Theme panel
// ---------------------------------------------------------------------------

export interface ThemeTokenRow {
  id: string;
  kind: string;
  level: number;
  /** The base theme's value for this token, when it assigns one. */
  baseValue: string | null;
  /** The operator's override in authored.theme.tokens. */
  authoredValue: string | null;
  /** What the SITE originally painted, from the theme adapter. */
  originalValue: string | null;
  /** How many paint groups this token drives — 0 means editing it shows nothing. */
  boundGroupCount: number;
  provenance: string | null;
}

export interface ThemePanel {
  available: boolean;
  themeRunDir: string | null;
  baseThemeId: string | null;
  baseThemeName: string | null;
  mode: string | null;
  tokens: ThemeTokenRow[];
  authoredTokens: Record<string, string>;
  library: Array<{ file: string; themeId: string; name: string; mode: string }>;
  coverage: SiteThemeAdapter["coverage"] | null;
  limitations: string[];
  allowedProperties: string[];
  note: string;
}

export interface LoadedThemeBase {
  adapter: SiteThemeAdapter;
  theme: ThemeFile;
}

export async function loadThemeBase(site: EditorSite): Promise<LoadedThemeBase | null> {
  if (site.themeRunDir === null || !existsSync(site.themeRunDir)) return null;
  try {
    const run = await loadThemeRun(site.themeRunDir);
    return { adapter: run.adapter, theme: run.theme };
  } catch {
    return null;
  }
}

export async function buildThemePanel(
  site: EditorSite,
  base: LoadedThemeBase | null,
): Promise<ThemePanel> {
  const authoredTokens = site.project.authored.theme.tokens ?? {};
  const library = (await listThemeLibrary()).map((entry) => ({
    file: entry.file,
    themeId: entry.theme.themeId,
    name: entry.theme.name,
    mode: entry.theme.metadata.mode,
  }));
  if (base === null) {
    return {
      available: false,
      themeRunDir: site.themeRunDir,
      baseThemeId: null,
      baseThemeName: null,
      mode: null,
      tokens: [],
      authoredTokens,
      library,
      coverage: null,
      limitations: [],
      allowedProperties: [],
      note: "no theme run on the accepted lineage — token overrides cannot be previewed for this project",
    };
  }
  const tokens: ThemeTokenRow[] = THEME_TOKENS.map((id) => {
    const adapterEntry = base.adapter.tokens[id];
    return {
      id,
      kind: tokenKind(id),
      level: tokenLevel(id),
      baseValue: base.theme.tokens[id] ?? null,
      authoredValue: authoredTokens[id] ?? null,
      originalValue: adapterEntry?.originalValue ?? null,
      boundGroupCount: adapterEntry?.boundGroupIds.length ?? 0,
      provenance: adapterEntry?.provenance ?? null,
    };
  });
  return {
    available: true,
    themeRunDir: site.themeRunDir,
    baseThemeId: base.theme.themeId,
    baseThemeName: base.theme.name,
    mode: base.theme.metadata.mode,
    tokens,
    authoredTokens,
    library,
    coverage: base.adapter.coverage,
    limitations: base.adapter.limitations,
    allowedProperties: [
      "color",
      "background-color",
      "border-top",
      "border-right",
      "border-bottom",
      "border-left",
      "border-radius",
      "box-shadow",
    ],
    note:
      "theme-contract-v1 only: a closed token vocabulary and a closed paint-property allowlist. " +
      "There is no raw CSS field, and margin / padding / width / grid / flex are not representable here at all. " +
      "Typography tokens are contract-only in this pipeline and apply nothing.",
  };
}

export interface ThemeTokenRejection {
  token: string;
  reason: string;
}

/** Refuse anything the Theme Contract does not represent. No raw CSS, ever. */
export function validateThemeTokens(tokens: Record<string, string>): {
  accepted: Record<string, string>;
  rejected: ThemeTokenRejection[];
} {
  const accepted: Record<string, string> = {};
  const rejected: ThemeTokenRejection[] = [];
  for (const [id, value] of Object.entries(tokens)) {
    if (!isThemeToken(id)) {
      rejected.push({ token: id, reason: `not a theme-contract-v1 token` });
      continue;
    }
    if (typeof value !== "string" || !isSafeThemeValue(value)) {
      rejected.push({ token: id, reason: "not a safe paint value (no url(), selectors, or escapes)" });
      continue;
    }
    accepted[id] = value;
  }
  return { accepted, rejected };
}

// ---------------------------------------------------------------------------
// Logo / brand panel — whole brand HOST replacement only
// ---------------------------------------------------------------------------

export interface BrandSurfaceRow {
  surfaceId: string;
  surface: string;
  origin: string;
  route: string;
  nodeId: string | null;
  slotKey: string | null;
  value: string;
  matched: string;
  sourceUrl: string | null;
  evidencePointer: string;
  suggestedResolution: string;
  resolvable: boolean;
  decision: { decision: string; replacement?: unknown; reason?: string; note?: string; updatedAt: string } | null;
}

export interface BrandPanel {
  available: boolean;
  host: string;
  brandTokens: string[];
  counts: Record<string, number>;
  rows: BrandSurfaceRow[];
  truncated: number;
  resolvableSurfaces: string[];
  surfacesNotResolved: Record<string, string>;
  decisionsRecorded: number;
  note: string;
}

export async function scanBrandForSite(site: EditorSite): Promise<BrandSurfaceReport | null> {
  if (site.contentRunDir === null) return null;
  try {
    return await scanBrandSurfaces({
      host: site.host,
      templateRunDir: site.templateRunDir,
      contentRunDir: site.contentRunDir,
    });
  } catch {
    return null;
  }
}

export function buildBrandPanel(site: EditorSite, report: BrandSurfaceReport | null): BrandPanel {
  const authoredBrand = site.project.authored.brand ?? {};
  if (report === null) {
    return {
      available: false,
      host: site.host,
      brandTokens: [],
      counts: {},
      rows: [],
      truncated: 0,
      resolvableSurfaces: [...RESOLVABLE_BRAND_SURFACES],
      surfacesNotResolved: SURFACES_NOT_RESOLVED,
      decisionsRecorded: Object.keys(authoredBrand).length,
      note: "brand surfaces could not be scanned for this project (no readable content run on the accepted lineage)",
    };
  }
  const resolvable = new Set<string>(RESOLVABLE_BRAND_SURFACES);
  const seen = new Set<string>();
  const rows: BrandSurfaceRow[] = [];
  for (const finding of report.findings as BrandFinding[]) {
    const surfaceId = brandSurfaceId(finding);
    if (seen.has(surfaceId)) continue;
    seen.add(surfaceId);
    rows.push({
      surfaceId,
      surface: finding.surface,
      origin: finding.origin,
      route: finding.route,
      nodeId: finding.nodeId,
      slotKey: finding.slotKey,
      value: finding.value.slice(0, 300),
      matched: finding.matched,
      sourceUrl: finding.sourceUrl,
      evidencePointer: finding.evidencePointer,
      suggestedResolution: finding.suggestedResolution,
      resolvable: resolvable.has(finding.surface),
      decision: authoredBrand[surfaceId] ?? null,
    });
  }
  return {
    available: true,
    host: report.host,
    brandTokens: report.brandTokens,
    counts: report.counts,
    rows,
    truncated: report.truncated,
    resolvableSurfaces: [...RESOLVABLE_BRAND_SURFACES],
    surfacesNotResolved: SURFACES_NOT_RESOLVED,
    decisionsRecorded: Object.keys(authoredBrand).length,
    note:
      "WHOLE brand HOST replacement only — there is no SVG path editor. A decision recorded here is applied by the " +
      "production bake (src/production/brand-bake.ts), NOT by the authoring preview, so it will not change the iframe. " +
      "A REPLACE needs a payload and a PRESERVE needs a reason; the authored-state schema enforces both.",
  };
}

// ---------------------------------------------------------------------------
// QA view (read-only)
// ---------------------------------------------------------------------------

export interface QaPanel {
  releaseState: string;
  requirements: { total: number; unresolved: number; blocking: number; bySeverity: Record<string, number> } | null;
  accounting: { entries: number; byOrigin: Record<string, number>; byDisposition: Record<string, number> } | null;
  limitations: string[];
  warnings: string[];
  technicalDebt: Array<{ id: string; description: string }>;
  lineage: Record<string, string>;
}

export async function buildQaPanel(site: EditorSite): Promise<QaPanel> {
  let requirements: QaPanel["requirements"] = null;
  const requirementsFile = path.join(site.projectDir, site.project.requirementsFile);
  if (existsSync(requirementsFile)) {
    try {
      const parsed = JSON.parse(await readFile(requirementsFile, "utf8")) as {
        requirements: Array<{ status: string; severity: string }>;
      };
      const bySeverity: Record<string, number> = {};
      let unresolved = 0;
      let blocking = 0;
      for (const requirement of parsed.requirements) {
        bySeverity[requirement.severity] = (bySeverity[requirement.severity] ?? 0) + 1;
        if (requirement.status !== "resolved") unresolved++;
        if (requirement.status !== "resolved" && requirement.severity === "release-blocking") blocking++;
      }
      requirements = { total: parsed.requirements.length, unresolved, blocking, bySeverity };
    } catch {
      requirements = null;
    }
  }

  let accounting: QaPanel["accounting"] = null;
  if (site.accounting.size > 0) {
    const byOrigin: Record<string, number> = {};
    const byDisposition: Record<string, number> = {};
    for (const entry of site.accounting.values()) {
      byOrigin[entry.origin] = (byOrigin[entry.origin] ?? 0) + 1;
      byDisposition[entry.disposition] = (byDisposition[entry.disposition] ?? 0) + 1;
    }
    accounting = { entries: site.accounting.size, byOrigin, byDisposition };
  }

  return {
    releaseState: site.releaseState,
    requirements,
    accounting,
    limitations: site.project.limitations,
    warnings: site.project.warnings,
    technicalDebt: site.project.technicalDebt.map((debt) => ({ id: debt.id, description: debt.description })),
    lineage: {
      template: site.project.acceptedLineage.template.path,
      content: site.project.acceptedLineage.content.path,
      theme: site.project.acceptedLineage.theme.path,
      assets: site.project.acceptedLineage.assets.path,
      seo: site.project.acceptedLineage.seo.path,
    },
  };
}
