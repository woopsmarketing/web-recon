/**
 * ENABLEMENT SAFETY + PLANNING (Task 28 Phases 5 and 6).
 *
 * The operator says "이 섹션 필요 없으니까 삭제" (delete this section) or turns a
 * page off. Internally BOTH are DISABLE, recorded in `authored.disabledRegions`
 * / `authored.disabledRoutes`; the Recon Template is never mutated. This module
 * is the half that decides whether a disable is SAFE and, when it is, what it
 * actually costs.
 *
 * THE FOUR RULES, and the measurement each one exists for:
 *
 *  1. BLAST RADIUS. Routes -> pageSourceId is MANY-TO-ONE and a region id is
 *     namespaced by pageSourceId (`skeleton.ts` regionIdOf), so there is no id
 *     at which "disable this section on ONE route only" can even be expressed
 *     when the page is shared. Measured on the stripe template that carries two
 *     such groups: `/resources/more/arr-loans-explained` and
 *     `/resources/more/virtual-credit-cards-for-businesses-explained` load the
 *     SAME `pages/p000012.json`. A request naming one of them is REFUSED with
 *     `shared-page-blast-radius` and the full route list; the same request
 *     naming both is allowed.
 *
 *  2. GLOBAL SCOPE. `region.scope === "global"` under-reports (see
 *     `regionEnablementScope`), so enablement takes the widest of three
 *     signals. A region that is global for enablement purposes may only be
 *     disabled with `scope: "global"` — never "for one route", which the
 *     engine cannot do and must not pretend to.
 *
 *  3. INTERACTION CUT. An ENABLED trigger whose target — or whose mount host —
 *     is inside the disabled subtree is a broken interaction, and content that
 *     starts hidden and loses every trigger that could reveal it is content
 *     that ships and can never be seen. Both are REFUSED, with the cascade that
 *     would make the request safe when one exists and an explicit
 *     `cascadeAvailable: false` when it does not.
 *
 *  4. NAVIGATION. A link to a disabled route is removed only when the removal
 *     is DETERMINISTIC (the anchor hosting the url slot contains no slot
 *     outside that slot's own group). Everything else becomes an ACTIONABLE
 *     requirement naming the route, the linking page and the slot. Nothing is
 *     ever silently redirected to the homepage.
 *
 * A REQUIREMENT NEVER CLEARS BECAUSE A DISABLE WAS REQUESTED. This module
 * produces requirements and a plan; the clearing evidence stays where it
 * always was — the produced artifacts (route table, SEO plan, sitemap,
 * exported HTML, link QA).
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import type { RuntimeElementNode, RuntimeNode, RuntimePage } from "../reconstruction/types.js";
import {
  buildRegionMembership,
  buildSignaturePageCounts,
  regionEnablementScope,
  regionPageSourceIds,
  regionRouteBlastRadius,
  scanInteractionEdges,
  subtreeNodeIds,
  findNodeById,
  type InteractionEdge,
  type RegionEnablementScope,
  type RegionMembership,
} from "../regions/enablement.js";
import { PAGE_REGIONS_FILE, type PageRegion, type PageRegionsArtifact } from "../regions/types.js";
import {
  emptyEnablementPlan,
  type DisabledRegionNode,
  type EnablementPlan,
  type RemovedNavNode,
} from "../production/enablement.js";
import type { AuthoredState, DisabledRegion } from "./types.js";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

interface TemplateSlot {
  id: string;
  key: string;
  role?: string;
  type: "text" | "url" | "image";
  scope: "global" | "page";
  groupId?: string;
  editability: "editable" | "review";
  urlKind?: "internal" | "external" | "hash";
  defaultValue?: unknown;
  route?: string;
}

interface TemplateBinding {
  bindingId: string;
  slotId: string;
  pageId: string;
  viewport: "desktop" | "mobile";
  nodeId: string;
  surface: string;
  target: string;
  attributeName?: string;
}

interface TemplateRoute {
  key: string;
  path: string;
  pageFile: string;
  pageSourceId: string;
}

export interface EnablementInputs {
  templateRunDir: string;
  routes: TemplateRoute[];
  routeKeys: Set<string>;
  /** pageSourceId -> every route serving it. MANY-TO-ONE, never collapsed. */
  routesByPage: Map<string, string[]>;
  slots: TemplateSlot[];
  slotById: Map<string, TemplateSlot>;
  slotByKey: Map<string, TemplateSlot>;
  bindings: TemplateBinding[];
  bindingsBySlotId: Map<string, TemplateBinding[]>;
  /** `${pageId}|${viewport}|${nodeId}` -> slot keys bound there. */
  slotKeysByNode: Map<string, string[]>;
  pages: Map<string, RuntimePage>;
  regions: PageRegionsArtifact | null;
  regionById: Map<string, PageRegion>;
  membership: RegionMembership | null;
  interactionEdges: InteractionEdge[];
  interactionTriggers: number;
  globalSlotKeys: Set<string>;
  signaturePageCounts: Map<string, number>;
  /** page-regions.json the analysis ran against, or null. */
  pageRegionsFile: string | null;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

/** Resolve `--regions` style references: a run dir, or the file itself. */
export function resolvePageRegionsFile(reference: string): string {
  return reference.endsWith(".json") ? reference : path.join(reference, PAGE_REGIONS_FILE);
}

export async function loadEnablementInputs(options: {
  templateRunDir: string;
  pageRegionsRef?: string | null;
}): Promise<EnablementInputs> {
  const templateRunDir = options.templateRunDir;
  const appDataDir = path.join(templateRunDir, "app", "reconstruction-data");
  const routeMap = await readJson<{ routes: TemplateRoute[] }>(
    path.join(appDataDir, "route-map.json"),
  );
  const slotsFile = await readJson<{ slots: TemplateSlot[] }>(path.join(templateRunDir, "slots.json"));
  const bindingsFile = await readJson<{ bindings: TemplateBinding[] }>(
    path.join(templateRunDir, "slot-bindings.json"),
  );

  const routesByPage = new Map<string, string[]>();
  for (const route of routeMap.routes) {
    const list = routesByPage.get(route.pageSourceId) ?? [];
    list.push(route.key);
    routesByPage.set(route.pageSourceId, list);
  }
  const pages = new Map<string, RuntimePage>();
  for (const route of routeMap.routes) {
    if (pages.has(route.pageSourceId)) continue;
    const file = path.join(appDataDir, route.pageFile);
    if (!existsSync(file)) continue;
    pages.set(route.pageSourceId, await readJson<RuntimePage>(file));
  }

  const slotById = new Map(slotsFile.slots.map((slot) => [slot.id, slot]));
  const slotByKey = new Map(slotsFile.slots.map((slot) => [slot.key, slot]));
  const bindingsBySlotId = new Map<string, TemplateBinding[]>();
  const slotKeysByNode = new Map<string, string[]>();
  for (const binding of bindingsFile.bindings) {
    const list = bindingsBySlotId.get(binding.slotId) ?? [];
    list.push(binding);
    bindingsBySlotId.set(binding.slotId, list);
    const slot = slotById.get(binding.slotId);
    if (slot === undefined) continue;
    const key = `${binding.pageId}|${binding.viewport}|${binding.nodeId}`;
    const keys = slotKeysByNode.get(key) ?? [];
    if (!keys.includes(slot.key)) keys.push(slot.key);
    slotKeysByNode.set(key, keys);
  }

  let regions: PageRegionsArtifact | null = null;
  let pageRegionsFile: string | null = null;
  if (options.pageRegionsRef !== undefined && options.pageRegionsRef !== null) {
    const candidate = resolvePageRegionsFile(options.pageRegionsRef);
    // A RECORDED but MISSING artifact behaves exactly like no artifact: every
    // region edit is refused with `regions-not-compiled`. Throwing here would
    // brick `release:prepare` / `release:plan` for a project whose region run
    // directory was moved, with no operator action available at that point.
    if (existsSync(candidate)) {
      pageRegionsFile = candidate;
      regions = await readJson<PageRegionsArtifact>(pageRegionsFile);
    }
  }
  const membership = regions === null ? null : buildRegionMembership(pages, regions);
  const scan =
    membership === null
      ? { edges: [] as InteractionEdge[], triggers: 0, unparsedObs: 0 }
      : scanInteractionEdges(pages, membership);

  return {
    templateRunDir,
    routes: routeMap.routes,
    routeKeys: new Set(routeMap.routes.map((route) => route.key)),
    routesByPage,
    slots: slotsFile.slots,
    slotById,
    slotByKey,
    bindings: bindingsFile.bindings,
    bindingsBySlotId,
    slotKeysByNode,
    pages,
    regions,
    regionById: new Map((regions?.regions ?? []).map((region) => [region.regionId, region])),
    membership,
    interactionEdges: scan.edges,
    interactionTriggers: scan.triggers,
    globalSlotKeys: new Set(
      slotsFile.slots.filter((slot) => slot.scope === "global").map((slot) => slot.key),
    ),
    signaturePageCounts:
      regions === null ? new Map<string, number>() : buildSignaturePageCounts(regions),
    pageRegionsFile,
  };
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export const ENABLEMENT_REFUSAL_CODES = [
  "regions-not-compiled",
  "unknown-region",
  "unknown-route",
  "shared-page-blast-radius",
  "global-region-requires-explicit-global",
  "route-not-in-region-radius",
  "interaction-cut-target-disabled",
  "interaction-cut-mount-host-disabled",
  "interaction-cut-target-unreachable",
  "last-route",
] as const;
export type EnablementRefusalCode = (typeof ENABLEMENT_REFUSAL_CODES)[number];

export interface EnablementRefusal {
  code: EnablementRefusalCode;
  /** The region id or route key the refusal is about. */
  subject: string;
  message: string;
  /** Routes the operator asked for. */
  requestedRoutes: string[];
  /** Routes the edit would actually affect. */
  affectedRoutes: string[];
  /** Regions that would have to be disabled together for this to be safe. */
  cascadeRegionIds: string[];
  /** false when no cascade can make it safe (e.g. a region-less target). */
  cascadeAvailable: boolean;
  detail: Record<string, unknown>;
}

export interface RegionDisableEffect {
  regionId: string;
  scope: RegionEnablementScope;
  /** Every route the region renders on (`region.pages[].routes`). */
  blastRadius: string[];
  pageSourceIds: string[];
  slotKeys: string[];
  /**
   * OTHER region ids that carry the SAME content — same (landmark, childPath)
   * signature, or an overlapping global-scope slot key.
   *
   * The honest answer to "disable the footer globally". A region id is
   * namespaced by pageSourceId (`skeleton.ts` regionIdOf), so on a site whose
   * footer did not pass the compiler's strict global lift there are N footer
   * ids, one per page — disabling one of them removes the footer from ONE
   * page. This names the other N-1 so an operator surface can offer the whole
   * set instead of silently disabling a fraction and calling it global.
   */
  siblingRegionIds: string[];
  /** The region-root occurrences the bake would remove. */
  nodes: DisabledRegionNode[];
  /** Node ids inside the disabled subtrees, per (page, viewport). */
  disabledNodeCount: number;
  /** Disabled triggers whose target survives — reported, never silently OK. */
  orphanedTargets: Array<{ pageSourceId: string; viewport: string; triggerNodeId: string; targetNodeId: string }>;
}

export interface RegionDisableDecision {
  allowed: boolean;
  refusals: EnablementRefusal[];
  effect: RegionDisableEffect | null;
}

function refusal(partial: Omit<EnablementRefusal, "cascadeRegionIds" | "cascadeAvailable"> & {
  cascadeRegionIds?: string[];
  cascadeAvailable?: boolean;
}): EnablementRefusal {
  return {
    cascadeRegionIds: partial.cascadeRegionIds ?? [],
    cascadeAvailable: partial.cascadeAvailable ?? (partial.cascadeRegionIds ?? []).length > 0,
    ...partial,
  };
}

function isElement(node: RuntimeNode): node is RuntimeElementNode {
  return node.k === "e";
}

/** The (page, viewport) -> disabled node ids a set of region ids removes. */
function disabledNodeSets(
  regionIds: readonly string[],
  inputs: EnablementInputs,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const regionId of regionIds) {
    const region = inputs.regionById.get(regionId);
    if (region === undefined) continue;
    for (const page of region.pages) {
      const tree = inputs.pages.get(page.pageSourceId);
      if (tree === undefined) continue;
      for (const occurrence of page.occurrences) {
        const viewportTree = tree[occurrence.viewport];
        if (viewportTree === undefined) continue;
        const root = findNodeById(viewportTree.doc, occurrence.nodeId);
        if (root === null) continue;
        const key = `${page.pageSourceId}|${occurrence.viewport}`;
        const set = out.get(key) ?? new Set<string>();
        for (const nodeId of subtreeNodeIds(root)) set.add(nodeId);
        out.set(key, set);
      }
    }
  }
  return out;
}

/** True when the node's props carry `data-wr-hidden` (starts invisible). */
function nodeStartsHidden(
  inputs: EnablementInputs,
  pageSourceId: string,
  viewport: "desktop" | "mobile",
  nodeId: string,
): boolean {
  const tree = inputs.pages.get(pageSourceId)?.[viewport];
  if (tree === undefined) return false;
  const node = findNodeById(tree.doc, nodeId);
  if (node === null) return false;
  const props = node.p ?? {};
  return props["data-wr-hidden"] !== undefined || props["data-wr-reveal"] !== undefined;
}

export interface RegionDisableRequest {
  regionId: string;
  scope: "global" | "routes";
  routes?: string[];
}

/**
 * Evaluate ONE region disable against every safety rule.
 *
 * `alsoDisabledRegionIds` is the rest of the same transaction: an interaction
 * whose two ends are both being disabled is not a cut, and that is what makes
 * a cascade (rule 3) actually resolvable instead of a permanent refusal.
 */
export function evaluateRegionDisable(
  request: RegionDisableRequest,
  inputs: EnablementInputs,
  alsoDisabledRegionIds: readonly string[] = [],
): RegionDisableDecision {
  const refusals: EnablementRefusal[] = [];
  const requestedRoutes = request.scope === "global" ? [] : [...(request.routes ?? [])].sort();

  if (inputs.regions === null || inputs.membership === null) {
    return {
      allowed: false,
      effect: null,
      refusals: [
        refusal({
          code: "regions-not-compiled",
          subject: request.regionId,
          message:
            "no page-regions artifact is wired to this project — a region cannot be addressed, " +
            "let alone disabled, until `pnpm regions:compile` has run for this template and the " +
            "release project records it as auxiliary.pageRegionsDir",
          requestedRoutes,
          affectedRoutes: [],
          cascadeAvailable: false,
          detail: { templateRunDir: inputs.templateRunDir },
        }),
      ],
    };
  }

  const region = inputs.regionById.get(request.regionId);
  if (region === undefined) {
    return {
      allowed: false,
      effect: null,
      refusals: [
        refusal({
          code: "unknown-region",
          subject: request.regionId,
          message: `region ${request.regionId} is not in this template's page-regions artifact`,
          requestedRoutes,
          affectedRoutes: [],
          cascadeAvailable: false,
          detail: { pageRegionsFile: inputs.pageRegionsFile, knownRegions: inputs.regionById.size },
        }),
      ],
    };
  }

  const blastRadius = regionRouteBlastRadius(region);
  const scope = regionEnablementScope(region, {
    globalSlotKeys: inputs.globalSlotKeys,
    signaturePageCounts: inputs.signaturePageCounts,
  });

  // ---- rule 2: a global region may only be disabled globally --------------
  //
  // `scope: "routes"` READS as "for these routes and not the others". On a
  // region that is global for enablement purposes that sentence cannot be
  // true, whatever route list accompanies it — including one that happens to
  // cover the whole blast radius — because the same content also renders under
  // the SIBLING region ids this disable does not touch. The honest form is
  // `scope: "global"`, which reports those siblings instead of hiding them.
  if (scope.global && request.scope !== "global") {
    refusals.push(
      refusal({
        code: "global-region-requires-explicit-global",
        subject: region.regionId,
        message:
          `region ${region.regionId} is GLOBAL for enablement purposes (${scope.signals.join(", ")}) — ` +
          `it renders on ${blastRadius.length} route(s) and there is no id at which it can be disabled ` +
          "for one of them. Re-issue the edit with scope \"global\" or cancel.",
        requestedRoutes,
        affectedRoutes: blastRadius,
        cascadeAvailable: false,
        detail: {
          signals: scope.signals,
          globalSlotKeys: scope.globalSlotKeys.slice(0, 20),
          globalSlotKeyCount: scope.globalSlotKeys.length,
          signaturePages: scope.signaturePages,
          compilerScope: region.scope,
        },
      }),
    );
  }

  // ---- rule 1: shared-page blast radius -----------------------------------
  if (request.scope === "routes") {
    const unknownRoutes = requestedRoutes.filter((route) => !inputs.routeKeys.has(route));
    if (unknownRoutes.length > 0) {
      refusals.push(
        refusal({
          code: "unknown-route",
          subject: region.regionId,
          message: `route(s) ${unknownRoutes.join(", ")} are not in this template's route table`,
          requestedRoutes,
          affectedRoutes: blastRadius,
          cascadeAvailable: false,
          detail: { unknownRoutes },
        }),
      );
    }
    const outsideRadius = requestedRoutes.filter((route) => !blastRadius.includes(route));
    if (outsideRadius.length > 0) {
      refusals.push(
        refusal({
          code: "route-not-in-region-radius",
          subject: region.regionId,
          message:
            `region ${region.regionId} does not render on ${outsideRadius.join(", ")} — ` +
            "disabling it there would be a no-op recorded as a decision",
          requestedRoutes,
          affectedRoutes: blastRadius,
          cascadeAvailable: false,
          detail: { outsideRadius, blastRadius },
        }),
      );
    }
    const missing = blastRadius.filter((route) => !requestedRoutes.includes(route));
    if (missing.length > 0 && unknownRoutes.length === 0) {
      refusals.push(
        refusal({
          code: "shared-page-blast-radius",
          subject: region.regionId,
          message:
            `region ${region.regionId} lives on page(s) ${regionPageSourceIds(region).join(", ")}, which ` +
            `${blastRadius.length} route(s) load — ${missing.join(", ")} would be physically changed too. ` +
            "The region id is namespaced by pageSourceId, so there is no id at which this can be done for " +
            `${requestedRoutes.join(", ")} alone. Disable it on all ${blastRadius.length} route(s) or cancel.`,
          requestedRoutes,
          affectedRoutes: blastRadius,
          cascadeAvailable: false,
          detail: {
            pageSourceIds: regionPageSourceIds(region),
            wouldAlsoAffect: missing,
            blastRadius,
          },
        }),
      );
    }
  }

  // ---- rule 3: interaction cut -------------------------------------------
  const allDisabled = [...new Set([region.regionId, ...alsoDisabledRegionIds])];
  const nodeSets = disabledNodeSets(allDisabled, inputs);
  const inside = (pageSourceId: string, viewport: string, nodeId: string | null): boolean =>
    nodeId !== null && (nodeSets.get(`${pageSourceId}|${viewport}`)?.has(nodeId) ?? false);

  const orphanedTargets: RegionDisableEffect["orphanedTargets"] = [];
  const targetsLosingTriggers = new Map<string, { edge: InteractionEdge; total: number; lost: number }>();
  for (const edge of inputs.interactionEdges) {
    const triggerInside = inside(edge.pageSourceId, edge.viewport, edge.triggerNodeId);
    const targetInside = inside(edge.pageSourceId, edge.viewport, edge.targetNodeId);
    if (edge.targetNodeId === null) continue; // a dyn-mount travels with its trigger
    if (!triggerInside && targetInside) {
      const code: EnablementRefusalCode =
        edge.channel === "obs-mount-host"
          ? "interaction-cut-mount-host-disabled"
          : "interaction-cut-target-disabled";
      refusals.push(
        refusal({
          code,
          subject: region.regionId,
          message:
            `an ENABLED interaction trigger (${edge.pageSourceId}/${edge.viewport} ${edge.triggerNodeId}` +
            `${edge.triggerRegionIds.length > 0 ? ` in ${edge.triggerRegionIds.join(", ")}` : " outside every region"}) ` +
            `drives ${edge.targetNodeId}, which this disable removes (channel ${edge.channel}). ` +
            (edge.triggerRegionIds.length > 0
              ? `Disable ${edge.triggerRegionIds.join(", ")} in the same edit, or cancel.`
              : "The trigger belongs to no region, so no cascade can make this safe — cancel."),
          requestedRoutes,
          affectedRoutes: blastRadius,
          cascadeRegionIds: edge.triggerRegionIds,
          cascadeAvailable: edge.triggerRegionIds.length > 0,
          detail: {
            channel: edge.channel,
            triggerNodeId: edge.triggerNodeId,
            triggerRegionIds: edge.triggerRegionIds,
            targetNodeId: edge.targetNodeId,
            targetRegionIds: edge.targetRegionIds,
            patternId: edge.patternId,
            op: edge.op,
          },
        }),
      );
      continue;
    }
    if (triggerInside && !targetInside) {
      orphanedTargets.push({
        pageSourceId: edge.pageSourceId,
        viewport: edge.viewport,
        triggerNodeId: edge.triggerNodeId,
        targetNodeId: edge.targetNodeId,
      });
    }
  }

  // Rule 3b: content that starts HIDDEN and loses every trigger that could
  // reveal it would ship and never be visible. That is not an orphan, it is
  // dead weight the operator cannot see — refuse it.
  for (const edge of inputs.interactionEdges) {
    if (edge.targetNodeId === null) continue;
    if (edge.channel === "obs-mount-host") continue;
    const key = `${edge.pageSourceId}|${edge.viewport}|${edge.targetNodeId}`;
    const entry = targetsLosingTriggers.get(key) ?? { edge, total: 0, lost: 0 };
    entry.total += 1;
    if (inside(edge.pageSourceId, edge.viewport, edge.triggerNodeId)) entry.lost += 1;
    targetsLosingTriggers.set(key, entry);
  }
  for (const [key, entry] of targetsLosingTriggers) {
    if (entry.lost === 0 || entry.lost !== entry.total) continue;
    const [pageSourceId, viewport, targetNodeId] = key.split("|");
    if (inside(pageSourceId, viewport, targetNodeId)) continue; // it goes too — fine
    if (!nodeStartsHidden(inputs, pageSourceId, viewport as "desktop" | "mobile", targetNodeId)) continue;
    const targetRegionIds = inputs.membership.regionsOf(pageSourceId, viewport, targetNodeId);
    refusals.push(
      refusal({
        code: "interaction-cut-target-unreachable",
        subject: region.regionId,
        message:
          `${pageSourceId}/${viewport} ${targetNodeId} starts hidden and every trigger that could reveal it ` +
          `(${entry.total}) is inside this disable — it would ship and never be visible. ` +
          (targetRegionIds.length > 0
            ? `Disable ${targetRegionIds.join(", ")} in the same edit, or cancel.`
            : "It belongs to no region, so no cascade can make this safe — cancel."),
        requestedRoutes,
        affectedRoutes: blastRadius,
        cascadeRegionIds: targetRegionIds,
        cascadeAvailable: targetRegionIds.length > 0,
        detail: { pageSourceId, viewport, targetNodeId, triggersLost: entry.lost },
      }),
    );
  }

  if (refusals.length > 0) return { allowed: false, refusals, effect: null };

  const nodes: DisabledRegionNode[] = [];
  for (const page of region.pages) {
    for (const occurrence of page.occurrences) {
      nodes.push({
        regionId: region.regionId,
        pageSourceId: page.pageSourceId,
        viewport: occurrence.viewport,
        nodeId: occurrence.nodeId,
      });
    }
  }
  const ownSets = disabledNodeSets([region.regionId], inputs);
  let disabledNodeCount = 0;
  for (const set of ownSets.values()) disabledNodeCount += set.size;
  const ownSignature = `${region.landmark.key}|${region.childPath}`;
  const ownGlobalSlots = new Set(scope.globalSlotKeys);
  const siblingRegionIds = (inputs.regions?.regions ?? [])
    .filter((candidate) => {
      if (candidate.regionId === region.regionId) return false;
      if (`${candidate.landmark.key}|${candidate.childPath}` === ownSignature) return true;
      return candidate.slotKeys.some((key) => ownGlobalSlots.has(key));
    })
    .map((candidate) => candidate.regionId)
    .sort();

  return {
    allowed: true,
    refusals: [],
    effect: {
      regionId: region.regionId,
      scope,
      blastRadius,
      pageSourceIds: regionPageSourceIds(region),
      siblingRegionIds,
      slotKeys: [...region.slotKeys].sort(),
      nodes,
      disabledNodeCount,
      orphanedTargets,
    },
  };
}

// ---------------------------------------------------------------------------
// Route disable
// ---------------------------------------------------------------------------

export interface NavCascadeItem {
  slotKey: string;
  groupId: string | null;
  targetRoute: string;
  /** Every slot key removed with the anchor (the group's label rides along). */
  removedSlotKeys: string[];
  nodes: RemovedNavNode[];
}

export interface DeadLinkFinding {
  targetRoute: string;
  linkingRoute: string;
  pageSourceId: string;
  viewport: "desktop" | "mobile";
  nodeId: string;
  href: string;
  slotKey: string | null;
  groupId: string | null;
  reason:
    | "slot-host-carries-unrelated-slots"
    | "anchor-has-no-slot"
    | "dynamic-template-host"
    | "paint-twin-host"
    /**
     * The link is not an anchor in the static tree at all: it is text inside a
     * SERIALIZED MARKUP prop (a captured `data-wr-dyn-template`, an inline-SVG
     * `v` string). MEASURED on the real linear template: disabling `/pricing`
     * leaves one `"href":"/pricing"` inside the mobile nav dialog's captured
     * template on each of the 7 enabled pages, and neither the slot pass nor
     * the anchor pass can see it — the first because that copy carries no
     * binding at all, the second because it walks elements and this is a
     * string. A real Chromium click on the shipped package mounts a visible
     * `a[href="/pricing"]` that answers 404.
     */
    | "serialized-markup-host";
}

export interface RouteDisableDecision {
  allowed: boolean;
  refusals: EnablementRefusal[];
  disabledRoutes: string[];
  remainingRoutes: string[];
  /** Pages that stop being reachable entirely (not shared with a live route). */
  orphanedPageSourceIds: string[];
  /** Pages a disabled route shares with a route that stays enabled. */
  sharedWithEnabledPageSourceIds: string[];
  navCascade: NavCascadeItem[];
  deadLinks: DeadLinkFinding[];
}

function normalizeHrefToRouteKey(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed === "" || trimmed.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.startsWith("//")) return null;
  if (!trimmed.startsWith("/")) return null;
  const pathOnly = trimmed.split("?")[0].split("#")[0];
  const stripped = pathOnly.replace(/\/+$/, "");
  return stripped === "" ? "/" : stripped;
}

/**
 * Every href-looking value carried INSIDE a serialized markup string.
 *
 * Reconstruction captures a dynamic subtree as a `data-wr-dyn-template` prop
 * whose value is the SERIALIZED runtime IR (`{"k":"e",...,"p":{"href":"/x"}}`),
 * and an inline SVG as an HTML markup string in `v`. Both are strings to every
 * element walk in this file, so a link inside one is invisible to a walk that
 * looks at `node.p.href`. This reads BOTH encodings — JSON (`"href":"/x"`) and
 * HTML (`href="/x"` / `href='/x'`) — because narrowing the scan to the one
 * encoding that happens to be on the fixture is exactly how a safety rule goes
 * quiet on real data.
 */
export function hrefsInSerializedMarkup(value: string): string[] {
  const out: string[] = [];
  const push = (raw: string): void => {
    // JSON string bodies arrive escaped (`\/pricing`, `\"`). An href never
    // legitimately contains a backslash, so unescaping is lossless here.
    const unescaped = raw.replace(/\\(.)/g, "$1");
    if (unescaped !== "") out.push(unescaped);
  };
  // A capture can be nested one level deeper (a template inside a template, or
  // the same bytes re-read out of an RSC flight document, where the quotes
  // arrive as `\"`). Scanning the collapsed form as well costs one pass and
  // stops the encoding, rather than the link, from deciding whether a safety
  // rule fires.
  const forms = [value];
  if (value.includes('\\"')) forms.push(value.replace(/\\"/g, '"'));
  for (const form of forms) {
    for (const match of form.matchAll(/"href"\s*:\s*"((?:\\.|[^"\\])*)"/g)) push(match[1]);
    for (const match of form.matchAll(/\bhref\s*=\s*"([^"]*)"/g)) push(match[1]);
    for (const match of form.matchAll(/\bhref\s*=\s*'([^']*)'/g)) push(match[1]);
  }
  return [...new Set(out)];
}

/** Every slot key bound anywhere inside this element's subtree. */
function slotKeysInSubtree(
  inputs: EnablementInputs,
  pageSourceId: string,
  viewport: string,
  root: RuntimeElementNode,
): string[] {
  const out = new Set<string>();
  const visit = (node: RuntimeElementNode): void => {
    for (const key of inputs.slotKeysByNode.get(`${pageSourceId}|${viewport}|${node.n}`) ?? []) {
      out.add(key);
    }
    for (const child of node.c ?? []) if (isElement(child)) visit(child);
  };
  visit(root);
  return [...out].sort();
}

export function evaluateRouteDisable(
  requestedRoutes: readonly string[],
  inputs: EnablementInputs,
  authoredSlotValues: Record<string, unknown> = {},
): RouteDisableDecision {
  const refusals: EnablementRefusal[] = [];
  const disabledRoutes = [...new Set(requestedRoutes)].sort();
  const unknown = disabledRoutes.filter((route) => !inputs.routeKeys.has(route));
  for (const route of unknown) {
    refusals.push(
      refusal({
        code: "unknown-route",
        subject: route,
        message: `route ${route} is not in this template's route table`,
        requestedRoutes: disabledRoutes,
        affectedRoutes: [],
        cascadeAvailable: false,
        detail: { knownRoutes: inputs.routes.length },
      }),
    );
  }
  const remainingRoutes = inputs.routes
    .map((route) => route.key)
    .filter((key) => !disabledRoutes.includes(key));
  if (unknown.length === 0 && disabledRoutes.length > 0 && remainingRoutes.length === 0) {
    refusals.push(
      refusal({
        code: "last-route",
        subject: disabledRoutes.join(", "),
        message: "every route would be disabled — the site would export no page at all",
        requestedRoutes: disabledRoutes,
        affectedRoutes: disabledRoutes,
        cascadeAvailable: false,
        detail: { routeCount: inputs.routes.length },
      }),
    );
  }
  if (refusals.length > 0) {
    return {
      allowed: false,
      refusals,
      disabledRoutes,
      remainingRoutes,
      orphanedPageSourceIds: [],
      sharedWithEnabledPageSourceIds: [],
      navCascade: [],
      deadLinks: [],
    };
  }

  const remaining = new Set(remainingRoutes);
  const orphanedPageSourceIds: string[] = [];
  const sharedWithEnabledPageSourceIds: string[] = [];
  for (const route of inputs.routes) {
    if (!disabledRoutes.includes(route.key)) continue;
    const siblings = inputs.routesByPage.get(route.pageSourceId) ?? [];
    const liveSiblings = siblings.filter((sibling) => remaining.has(sibling));
    if (liveSiblings.length === 0) {
      if (!orphanedPageSourceIds.includes(route.pageSourceId)) {
        orphanedPageSourceIds.push(route.pageSourceId);
      }
    } else if (!sharedWithEnabledPageSourceIds.includes(route.pageSourceId)) {
      sharedWithEnabledPageSourceIds.push(route.pageSourceId);
    }
  }

  // ---- navigation cascade + dead links -----------------------------------
  const enabledPageIds = new Set(
    inputs.routes.filter((route) => remaining.has(route.key)).map((route) => route.pageSourceId),
  );
  const navCascade: NavCascadeItem[] = [];
  const deadLinks: DeadLinkFinding[] = [];
  const handledNodes = new Set<string>();
  // One finding per (page, viewport, node, target). The three passes below
  // overlap by design — a captured template can ALSO carry a url slot whose
  // binding names the same trigger node — and an operator acts on a link site,
  // not on a detector pass.
  const reportedNodes = new Set<string>();
  const report = (finding: DeadLinkFinding): void => {
    const key = `${finding.pageSourceId}|${finding.viewport}|${finding.nodeId}|${finding.targetRoute}`;
    if (reportedNodes.has(key)) return;
    reportedNodes.add(key);
    deadLinks.push(finding);
  };

  const groupKeys = new Map<string, string[]>();
  for (const slot of inputs.slots) {
    if (slot.groupId === undefined) continue;
    const list = groupKeys.get(slot.groupId) ?? [];
    list.push(slot.key);
    groupKeys.set(slot.groupId, list);
  }

  for (const slot of inputs.slots) {
    if (slot.type !== "url") continue;
    const raw = authoredSlotValues[slot.key] ?? slot.defaultValue;
    if (typeof raw !== "string") continue;
    const targetRoute = normalizeHrefToRouteKey(raw);
    if (targetRoute === null || !disabledRoutes.includes(targetRoute)) continue;
    const allowedKeys = new Set(slot.groupId === undefined ? [slot.key] : groupKeys.get(slot.groupId) ?? [slot.key]);
    const nodes: RemovedNavNode[] = [];
    const removedSlotKeys = new Set<string>();
    for (const binding of inputs.bindingsBySlotId.get(slot.id) ?? []) {
      if (!enabledPageIds.has(binding.pageId)) continue; // the whole page is going away
      const tree = inputs.pages.get(binding.pageId)?.[binding.viewport];
      if (tree === undefined) continue;
      const linkingRouteForBinding = (inputs.routesByPage.get(binding.pageId) ?? []).find((route) =>
        remaining.has(route),
      );
      // ONLY a `static` binding addresses the anchor itself. A
      // `dynamic-template` binding's nodeId is the TRIGGER (slot-bindings
      // schema: "Static: the element owning the text/attribute. Dynamic: the
      // trigger."), so removing that node would delete the button that mounts
      // a whole menu — and the link itself lives inside the captured
      // `data-wr-dyn-template` string, which is FROZEN reconstruction output.
      // A `paint-twin` binding addresses a second painted copy of the same
      // content. Neither is deterministically removable, so both become
      // ACTIONABLE requirements instead of a silent rewrite. MEASURED on the
      // release fixture: the header's disclosure button carries a captured
      // menu whose copy of the /pricing anchor survives into the RSC flight,
      // and this is the finding that reports it.
      if (binding.surface !== "static") {
        report({
          targetRoute,
          linkingRoute: linkingRouteForBinding ?? binding.pageId,
          pageSourceId: binding.pageId,
          viewport: binding.viewport,
          nodeId: binding.nodeId,
          href: raw,
          slotKey: slot.key,
          groupId: slot.groupId ?? null,
          reason: binding.surface === "dynamic-template" ? "dynamic-template-host" : "paint-twin-host",
        });
        continue;
      }
      const host = findNodeById(tree.doc, binding.nodeId);
      if (host === null) continue;
      const subtreeKeys = slotKeysInSubtree(inputs, binding.pageId, binding.viewport, host);
      const foreign = subtreeKeys.filter((key) => !allowedKeys.has(key));
      if (foreign.length > 0) {
        report({
          targetRoute,
          linkingRoute: linkingRouteForBinding ?? binding.pageId,
          pageSourceId: binding.pageId,
          viewport: binding.viewport,
          nodeId: binding.nodeId,
          href: raw,
          slotKey: slot.key,
          groupId: slot.groupId ?? null,
          reason: "slot-host-carries-unrelated-slots",
        });
        continue;
      }
      nodes.push({
        pageSourceId: binding.pageId,
        viewport: binding.viewport,
        nodeId: binding.nodeId,
        slotKey: slot.key,
        groupId: slot.groupId ?? null,
        targetRoute,
      });
      handledNodes.add(`${binding.pageId}|${binding.viewport}|${binding.nodeId}`);
      for (const key of subtreeKeys) removedSlotKeys.add(key);
    }
    if (nodes.length > 0) {
      navCascade.push({
        slotKey: slot.key,
        groupId: slot.groupId ?? null,
        targetRoute,
        removedSlotKeys: [...removedSlotKeys].sort(),
        nodes,
      });
    }
  }

  // Anchors that point at a disabled route and carry NO url slot at all. The
  // engine cannot tell an intentional link from a newly-broken one here, so it
  // never guesses — each becomes an actionable requirement.
  for (const [pageSourceId, page] of inputs.pages) {
    if (!enabledPageIds.has(pageSourceId)) continue;
    const linkingRoute = (inputs.routesByPage.get(pageSourceId) ?? []).find((route) =>
      remaining.has(route),
    );
    for (const viewport of ["desktop", "mobile"] as const) {
      const tree = page[viewport];
      if (tree === undefined) continue;
      const visit = (node: RuntimeElementNode): void => {
        const href = node.p?.href;
        if (typeof href === "string") {
          const targetRoute = normalizeHrefToRouteKey(href);
          if (
            targetRoute !== null &&
            disabledRoutes.includes(targetRoute) &&
            !handledNodes.has(`${pageSourceId}|${viewport}|${node.n}`)
          ) {
            const boundKeys = inputs.slotKeysByNode.get(`${pageSourceId}|${viewport}|${node.n}`) ?? [];
            const urlSlotKey = boundKeys.find((key) => inputs.slotByKey.get(key)?.type === "url") ?? null;
            report({
              targetRoute,
              linkingRoute: linkingRoute ?? pageSourceId,
              pageSourceId,
              viewport,
              nodeId: node.n,
              href,
              slotKey: urlSlotKey,
              groupId: urlSlotKey === null ? null : inputs.slotByKey.get(urlSlotKey)?.groupId ?? null,
              reason:
                urlSlotKey === null ? "anchor-has-no-slot" : "slot-host-carries-unrelated-slots",
            });
          }
        }
        for (const child of node.c ?? []) if (isElement(child)) visit(child);
      };
      visit(tree.doc);
    }
  }

  // ---- pass 3: links carried inside SERIALIZED MARKUP --------------------
  //
  // THE CORRECTION THIS PASS EXISTS FOR. Passes 1 and 2 are both ELEMENT walks:
  // one follows url-slot BINDINGS, the other reads `node.p.href`. A link that
  // reconstruction captured as TEXT inside a `data-wr-dyn-template` prop (the
  // serialized IR of a menu the runtime mounts on click) is invisible to both —
  // it carries no binding, and it is a string, not an element. MEASURED on the
  // real linear template: disabling `/pricing` leaves exactly one
  // `"href":"/pricing"` inside the mobile nav dialog's captured template on
  // each of the 7 ENABLED pages (node n000057, ~6.8 KB), and before this pass
  // `evaluateRouteDisable` returned `deadLinks.length === 0` for it while a
  // real click on the shipped package mounted a visible anchor that answered
  // 404. The engine still refuses to rewrite frozen reconstruction output, so
  // this is a REQUIREMENT, never a silent edit — and `collect.ts` will not
  // clear it on the served anchor audit, which is blind to this same channel.
  for (const [pageSourceId, page] of inputs.pages) {
    if (!enabledPageIds.has(pageSourceId)) continue;
    const linkingRoute = (inputs.routesByPage.get(pageSourceId) ?? []).find((route) =>
      remaining.has(route),
    );
    for (const viewport of ["desktop", "mobile"] as const) {
      const tree = page[viewport];
      if (tree === undefined) continue;
      const visit = (node: RuntimeElementNode): void => {
        // A node the nav cascade removes takes its whole subtree with it, so
        // nothing inside it can still link anywhere.
        if (handledNodes.has(`${pageSourceId}|${viewport}|${node.n}`)) return;
        const carriers: Array<{ prop: string; value: string }> = [];
        for (const [prop, value] of Object.entries(node.p ?? {})) {
          // `href` itself is pass 2's job; every OTHER string prop may be a
          // serialized markup carrier, so none of them is excluded by name.
          if (prop === "href" || typeof value !== "string") continue;
          carriers.push({ prop, value });
        }
        if (typeof node.v === "string") carriers.push({ prop: "v", value: node.v });
        for (const carrier of carriers) {
          for (const href of hrefsInSerializedMarkup(carrier.value)) {
            const targetRoute = normalizeHrefToRouteKey(href);
            if (targetRoute === null || !disabledRoutes.includes(targetRoute)) continue;
            report({
              targetRoute,
              linkingRoute: linkingRoute ?? pageSourceId,
              pageSourceId,
              viewport,
              nodeId: node.n,
              href,
              slotKey: null,
              groupId: null,
              reason: carrier.prop.includes("dyn-template")
                ? "dynamic-template-host"
                : "serialized-markup-host",
            });
          }
        }
        for (const child of node.c ?? []) if (isElement(child)) visit(child);
      };
      visit(tree.doc);
    }
  }

  return {
    allowed: true,
    refusals: [],
    disabledRoutes,
    remainingRoutes,
    orphanedPageSourceIds,
    sharedWithEnabledPageSourceIds,
    navCascade,
    deadLinks: deadLinks.sort((a, b) =>
      `${a.pageSourceId}${a.viewport}${a.nodeId}` < `${b.pageSourceId}${b.viewport}${b.nodeId}` ? -1 : 1,
    ),
  };
}

// ---------------------------------------------------------------------------
// The whole authored enablement, resolved
// ---------------------------------------------------------------------------

export interface DisabledSlot {
  slotKey: string;
  disposition: "disabled-region" | "disabled-route";
  detail: string;
}

export interface ResolvedEnablement {
  plan: EnablementPlan;
  /** Refusals for edits recorded in `authored` that are NOT safe to apply. */
  refusals: EnablementRefusal[];
  regionEffects: RegionDisableEffect[];
  route: RouteDisableDecision | null;
  disabledSlots: DisabledSlot[];
  /** Region ids recorded in `authored` that this template does not have. */
  unknownRegionIds: string[];
  warnings: string[];
}

export function emptyResolvedEnablement(): ResolvedEnablement {
  return {
    plan: emptyEnablementPlan(),
    refusals: [],
    regionEffects: [],
    route: null,
    disabledSlots: [],
    unknownRegionIds: [],
    warnings: [],
  };
}

export function authoredEnablementIsEmpty(authored: Pick<AuthoredState, "disabledRoutes" | "disabledRegions">): boolean {
  return (
    Object.keys(authored.disabledRoutes ?? {}).length === 0 &&
    Object.keys(authored.disabledRegions ?? {}).length === 0
  );
}

/**
 * Turn the AUTHORED enablement into a plan the bake can apply.
 *
 * A recorded edit that fails a safety rule is REFUSED HERE TOO, every time the
 * plan is resolved — never trusted because it was once accepted. A template
 * recompile that moved a region id, or a second edit that changed the shared
 * page's route set, must be caught on the next build rather than applied
 * blind.
 */
export function resolveEnablement(
  authored: Pick<AuthoredState, "disabledRoutes" | "disabledRegions" | "slotValues">,
  inputs: EnablementInputs,
): ResolvedEnablement {
  const result = emptyResolvedEnablement();
  const regionEntries = Object.entries(authored.disabledRegions ?? {}).sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  const routeKeys = Object.keys(authored.disabledRoutes ?? {}).sort();

  // ---- routes -------------------------------------------------------------
  if (routeKeys.length > 0) {
    const decision = evaluateRouteDisable(routeKeys, inputs, authored.slotValues ?? {});
    result.route = decision;
    if (!decision.allowed) {
      result.refusals.push(...decision.refusals);
    } else {
      result.plan.disabledRoutes = decision.disabledRoutes;
      for (const item of decision.navCascade) result.plan.removedNavNodes.push(...item.nodes);
    }
  }

  // ---- regions ------------------------------------------------------------
  const requested = regionEntries.map(([regionId, value]) => ({
    regionId,
    scope: (value as DisabledRegion).scope,
    routes: (value as DisabledRegion).routes,
  }));
  const allRegionIds = requested.map((entry) => entry.regionId);
  for (const entry of requested) {
    if (inputs.regions !== null && !inputs.regionById.has(entry.regionId)) {
      result.unknownRegionIds.push(entry.regionId);
    }
    const decision = evaluateRegionDisable(
      entry,
      inputs,
      allRegionIds.filter((id) => id !== entry.regionId),
    );
    if (!decision.allowed) {
      result.refusals.push(...decision.refusals);
      continue;
    }
    const effect = decision.effect as RegionDisableEffect;
    result.regionEffects.push(effect);
    result.plan.disabledRegionIds.push(effect.regionId);
    result.plan.disabledNodes.push(...effect.nodes);
    if (effect.orphanedTargets.length > 0) {
      result.warnings.push(
        `region ${effect.regionId}: ${effect.orphanedTargets.length} interaction target(s) survive the ` +
          "disable with no trigger left to drive them (they stay visible in their default state)",
      );
    }
  }

  // ---- slot accounting ----------------------------------------------------
  const disabledRouteSet = new Set(result.plan.disabledRoutes);
  const seen = new Set<string>();
  if (disabledRouteSet.size > 0) {
    // A slot is `disabled-route` only when EVERY route that renders it is
    // disabled. A slot shared with a live route keeps its normal disposition.
    for (const slot of inputs.slots) {
      const routes = new Set<string>();
      for (const binding of inputs.bindingsBySlotId.get(slot.id) ?? []) {
        for (const route of inputs.routesByPage.get(binding.pageId) ?? []) routes.add(route);
      }
      if (routes.size === 0) continue;
      if ([...routes].every((route) => disabledRouteSet.has(route))) {
        seen.add(slot.key);
        result.disabledSlots.push({
          slotKey: slot.key,
          disposition: "disabled-route",
          detail: `every route rendering this slot is disabled (${[...routes].sort().join(", ")})`,
        });
      }
    }
    for (const node of result.plan.removedNavNodes) {
      if (seen.has(node.slotKey)) continue;
      seen.add(node.slotKey);
      result.disabledSlots.push({
        slotKey: node.slotKey,
        disposition: "disabled-route",
        detail: `navigation item removed because it linked to the disabled route ${node.targetRoute}`,
      });
    }
  }
  // A slot is `disabled-region` only when EVERY BINDING of it is physically
  // removed by this plan — the same standard the route branch above already
  // holds itself to.
  //
  // THE CORRECTION THIS GUARD EXISTS FOR. A region id is namespaced by
  // pageSourceId, but a GLOBAL slot key is not: on the real linear template all
  // 8 `*:rgn:footer1:self` regions carry the IDENTICAL 84 `global.footer.*`
  // keys. Disabling ONE of them (blast radius `/changelog`) used to mark all 84
  // `disabled-region` while all 84 still rendered on the 7 enabled routes. Two
  // measured consequences, both dishonest: 4 of them
  // (`global.footer.link.{status,x-twitter,github,youtube}.href`, each a
  // customer-facing `needs factual input` blocker) stopped being `unresolved`
  // for content that still ships, and `pickContentProof` stopped promising
  // them, so production QA lost two footer content proofs on all 8 routes. A
  // blocker must never go quiet because a decision was RECORDED; only because
  // output proved it.
  const removedNodeIds = new Map<string, Set<string>>();
  const markRemoved = (pageSourceId: string, viewport: string, nodeId: string): void => {
    const key = `${pageSourceId}|${viewport}`;
    const set = removedNodeIds.get(key) ?? new Set<string>();
    set.add(nodeId);
    removedNodeIds.set(key, set);
  };
  const markSubtreeRemoved = (
    pageSourceId: string,
    viewport: "desktop" | "mobile",
    nodeId: string,
  ): void => {
    const tree = inputs.pages.get(pageSourceId)?.[viewport];
    const root = tree === undefined ? null : findNodeById(tree.doc, nodeId);
    if (root === null) {
      markRemoved(pageSourceId, viewport, nodeId);
      return;
    }
    for (const id of subtreeNodeIds(root)) markRemoved(pageSourceId, viewport, id);
  };
  for (const node of result.plan.disabledNodes) {
    markSubtreeRemoved(node.pageSourceId, node.viewport, node.nodeId);
  }
  for (const node of result.plan.removedNavNodes) {
    markSubtreeRemoved(node.pageSourceId, node.viewport, node.nodeId);
  }
  const pageIsGone = (pageSourceId: string): boolean => {
    const routes = inputs.routesByPage.get(pageSourceId) ?? [];
    return routes.length > 0 && routes.every((route) => disabledRouteSet.has(route));
  };
  const bindingSurvives = (binding: TemplateBinding): boolean => {
    if (pageIsGone(binding.pageId)) return false;
    return !(removedNodeIds.get(`${binding.pageId}|${binding.viewport}`)?.has(binding.nodeId) ?? false);
  };
  const stillRenderingRegionSlots: string[] = [];
  for (const effect of result.regionEffects) {
    for (const slotKey of effect.slotKeys) {
      if (seen.has(slotKey)) continue;
      const slot = inputs.slotByKey.get(slotKey);
      const bindings = slot === undefined ? [] : inputs.bindingsBySlotId.get(slot.id) ?? [];
      const survivors = bindings.filter((binding) => bindingSurvives(binding));
      if (survivors.length > 0) {
        // It still renders somewhere this plan keeps. Leave it to the ordinary
        // value-based classification — `unresolved` included.
        if (!stillRenderingRegionSlots.includes(slotKey)) stillRenderingRegionSlots.push(slotKey);
        continue;
      }
      seen.add(slotKey);
      result.disabledSlots.push({
        slotKey,
        disposition: "disabled-region",
        detail: `slot lives in disabled region ${effect.regionId} and is bound nowhere this build still renders`,
      });
    }
  }
  if (stillRenderingRegionSlots.length > 0) {
    stillRenderingRegionSlots.sort();
    result.warnings.push(
      `${stillRenderingRegionSlots.length} slot key(s) inside a disabled region are ALSO bound outside ` +
        "it and still render — they keep their ordinary disposition (a global slot key is not namespaced " +
        `by page, unlike the region id): ${stillRenderingRegionSlots.slice(0, 8).join(", ")}` +
        (stillRenderingRegionSlots.length > 8 ? `, +${stillRenderingRegionSlots.length - 8} more` : ""),
    );
  }
  result.disabledSlots.sort((a, b) => (a.slotKey < b.slotKey ? -1 : 1));
  result.plan.disabledSlotKeys = result.disabledSlots.map((slot) => slot.slotKey);
  return result;
}

/**
 * Resolve a project's enablement against its CURRENT template artifact.
 *
 * The one entry point every operator surface shares (`release:plan`,
 * `release:resolve`, `release:prepare`, `release:build`), so the refusal a plan
 * shows and the refusal a build enforces are produced by the same function
 * over the same artifacts — the drift class `graph.ts` already records having
 * happened once with `routeContent`.
 */
export async function resolveEnablementForProject(
  project: {
    authored: Pick<AuthoredState, "disabledRoutes" | "disabledRegions" | "slotValues">;
    auxiliary: { pageRegionsDir?: string };
  },
  templateRunDir: string,
): Promise<ResolvedEnablement> {
  if (authoredEnablementIsEmpty(project.authored)) return emptyResolvedEnablement();
  const inputs = await loadEnablementInputs({
    templateRunDir,
    pageRegionsRef: project.auxiliary.pageRegionsDir ?? null,
  });
  return resolveEnablement(project.authored, inputs);
}

/**
 * The slice `collectRequirements` consumes, or undefined when nothing is
 * disabled — so a project with no enablement passes byte-identical arguments
 * and every requirement count recorded before this feature still recomputes.
 */
export function enablementCollectInput(
  resolved: ResolvedEnablement,
): { disabledRoutes: string[]; deadLinks: DeadLinkFinding[] } | undefined {
  if (resolved.plan.disabledRoutes.length === 0 && (resolved.route?.deadLinks.length ?? 0) === 0) {
    return undefined;
  }
  return {
    disabledRoutes: [...resolved.plan.disabledRoutes].sort(),
    deadLinks: resolved.route?.deadLinks ?? [],
  };
}

/** The two maps the content stage needs, derived from a resolved enablement. */
export function enablementForContentRun(resolved: ResolvedEnablement): {
  disabledRoutes: string[];
  disabledSlots: DisabledSlot[];
} {
  return {
    disabledRoutes: [...resolved.plan.disabledRoutes].sort(),
    disabledSlots: resolved.disabledSlots,
  };
}
