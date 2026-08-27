import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  CONTENT_SCHEMA_VERSION,
  ContentInputError,
  RegionPlanFileSchema,
  type ContentUnitsFile,
  type ContentUnitKind,
  type RegionContract,
  type RegionPlan,
  type RegionPlanFile,
} from "./types.js";

/**
 * RegionPlan (Task 27) — the one genuinely missing layer of the hierarchy.
 *
 *   Brief → SiteContentPlan → PageContentPlan → RegionPlan → ContentUnit → SlotValues
 *
 * A PageContentPlan says what a PAGE is for; a ContentUnit is a bounded writing
 * job. Nothing in between said "these units belong to the same visual section",
 * which is exactly the grain an operator points at and an AI rewrite targets.
 *
 * DEPENDENCY DISCIPLINE. The Wave-1 PageRegion compiler (`src/regions/`,
 * `docs/result/handoffs/27-page-region.json`) is a read-only versioned sibling
 * artifact with no consumer. This module is its FIRST consumer and deliberately
 * depends on a SMALL STABLE CONTRACT of it — `regionId`, the `slotKeys` a
 * region owns, and its route / pageSourceId ownership — read through the local
 * loose schema below. `src/regions/` is never imported, so the compiler's
 * internals (landmark scoping, unwrap rules, the structural hash, the global
 * lift) can change without touching Content V2. Two consequences the handoff
 * records honestly: region GRANULARITY follows the markup and is NOT uniform,
 * and a region id does NOT survive an upstream markup insert.
 */

/**
 * Local, minimal, NON-strict view of `page-regions.json`. Unknown keys are
 * ignored by design — this is the contract surface, not a copy of the schema.
 */
const RegionRecordContractSchema = z.object({
  regionId: z.string(),
  scope: z.enum(["global", "page"]),
  slotKeys: z.array(z.string()),
  pages: z.array(
    z.object({
      pageSourceId: z.string(),
      routes: z.array(z.string()),
    }),
  ),
});

const PageRegionsContractSchema = z.object({
  schemaName: z.string(),
  regions: z.array(RegionRecordContractSchema),
});

/** Read the PageRegion artifact down to the contract this layer depends on. */
export async function loadRegionContracts(file: string): Promise<RegionContract[]> {
  const resolved = path.resolve(file);
  let raw: string;
  try {
    raw = await readFile(resolved, "utf8");
  } catch {
    throw new ContentInputError(`cannot read page-regions artifact ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ContentInputError(`${file} is not valid JSON`);
  }
  const artifact = PageRegionsContractSchema.safeParse(parsed);
  if (!artifact.success) {
    throw new ContentInputError(
      `${file} does not satisfy the PageRegion consumer contract (regionId / scope / slotKeys / pages)`,
    );
  }
  return artifact.data.regions.map((region) => ({
    regionId: region.regionId,
    scope: region.scope,
    slotKeys: region.slotKeys,
    routes: [...new Set(region.pages.flatMap((page) => page.routes))].sort(),
    pageSourceIds: region.pages.map((page) => page.pageSourceId),
  }));
}

/** Purpose is DERIVED from the unit kinds present. No AI, no similarity score. */
function purposeOf(kinds: readonly ContentUnitKind[]): string {
  if (kinds.includes("hero")) return "primary-message-region";
  if (kinds.includes("navigation")) return "navigation-region";
  if (kinds.includes("footer")) return "footer-region";
  if (kinds.includes("cta")) return "conversion-region";
  if (kinds.length === 1 && kinds[0] === "image") return "image-region";
  return "supporting-content-region";
}

export interface BuildRegionPlansResult {
  plans: RegionPlan[];
  unassignedUnitIds: string[];
}

/**
 * Group the run's content units by the region that owns their slots. A unit
 * joins the region that owns its FIRST slot key, so a unit is never split
 * across two regions and the assignment is a total function of the packet.
 */
export function buildRegionPlans(
  contracts: readonly RegionContract[],
  unitsFile: ContentUnitsFile,
  scopedRoutes: readonly string[],
): BuildRegionPlansResult {
  const regionBySlotKey = new Map<string, RegionContract>();
  for (const region of contracts) {
    for (const key of region.slotKeys) {
      if (!regionBySlotKey.has(key)) regionBySlotKey.set(key, region);
    }
  }
  const routeSet = new Set(scopedRoutes);

  const order: string[] = [];
  const byRegion = new Map<string, { region: RegionContract; unitIds: string[]; slotKeys: string[]; kinds: ContentUnitKind[] }>();
  const unassignedUnitIds: string[] = [];

  for (const unit of unitsFile.units) {
    const region = regionBySlotKey.get(unit.slots[0].key);
    if (region === undefined) {
      unassignedUnitIds.push(unit.unitId);
      continue;
    }
    let bucket = byRegion.get(region.regionId);
    if (bucket === undefined) {
      bucket = { region, unitIds: [], slotKeys: [], kinds: [] };
      byRegion.set(region.regionId, bucket);
      order.push(region.regionId);
    }
    bucket.unitIds.push(unit.unitId);
    for (const slot of unit.slots) bucket.slotKeys.push(slot.key);
    if (!bucket.kinds.includes(unit.kind)) bucket.kinds.push(unit.kind);
  }

  const plans = order.map((regionId) => {
    const bucket = byRegion.get(regionId)!;
    const routes = bucket.region.routes.filter((route) => routeSet.has(route));
    return {
      regionId,
      scope: bucket.region.scope,
      routes,
      unitIds: bucket.unitIds,
      slotKeys: bucket.slotKeys,
      unitKinds: bucket.kinds,
      purpose: purposeOf(bucket.kinds),
    };
  });
  return { plans, unassignedUnitIds };
}

export interface RegionPlanFileInput {
  runId: string;
  templateId: string;
  scopedRoutes: readonly string[];
  unitsFile: ContentUnitsFile;
  contracts?: readonly RegionContract[];
  contractFile?: string;
}

export function buildRegionPlanFile(input: RegionPlanFileInput): RegionPlanFile {
  const contracts = input.contracts ?? [];
  const { plans, unassignedUnitIds } =
    contracts.length > 0
      ? buildRegionPlans(contracts, input.unitsFile, input.scopedRoutes)
      : { plans: [], unassignedUnitIds: input.unitsFile.units.map((unit) => unit.unitId) };
  return RegionPlanFileSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    schemaName: "content-region-plan-v1",
    runId: input.runId,
    templateId: input.templateId,
    contractSource: {
      kind: contracts.length > 0 ? "page-regions-artifact" : "absent",
      ...(input.contractFile !== undefined ? { file: input.contractFile } : {}),
      regionsRead: contracts.length,
    },
    plans,
    unassignedUnitIds,
    provenance: "derived",
  });
}
