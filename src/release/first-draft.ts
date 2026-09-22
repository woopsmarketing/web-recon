/**
 * THE FIRST DRAFT SUMMARY (Task 28 Phase 10).
 *
 * `slot-accounting.json` already answers "what happened to every in-scope
 * slot?" for the WHOLE run. The question an operator asks after Create Site is
 * narrower and per page: *did this actually write my pricing page, or only the
 * homepage?* Nothing answered that — the accounting artifact carries a `route`
 * on each row but no per-route totals, and the consistency review's
 * `routeCoverage` counts page slots only and says nothing about origin,
 * disposition or needs-input.
 *
 * So this module folds the accounting rows by route and reports, per route:
 * slots in scope, slots filled, slots changed, UNRESOLVED, and the full
 * origin/disposition breakdown. It DERIVES everything from artifacts the run
 * already wrote — it measures nothing itself and invents no number.
 *
 * TWO HONESTY RULES BUILT IN:
 *   1. The denominator is the accounting artifact's own in-scope population.
 *      `totals` is re-derived by summing the rows, and `reconciled` says
 *      whether the sum equals the artifact's own `inScopeSlots`. A route table
 *      that does not add up says so instead of looking tidy.
 *   2. Routes the template marked `structure-only` are listed SEPARATELY, with
 *      zero generated slots, because they are reconstructed pages that were
 *      deliberately never given customer content. Hiding them would make the
 *      draft look more complete than it is; mixing them into the table would
 *      make it look less complete than it is.
 */
import type { SlotValue } from "../recon-template/types.js";
import type { SlotAccountingFile } from "../content-injection/types.js";

/** The bucket global-scope slots (header, footer, nav) are reported under. */
export const GLOBAL_ROUTE_BUCKET = "(global)";

export interface FirstDraftRouteRow {
  route: string;
  scope: "global" | "page";
  /** Every in-scope slot the accounting artifact attributes to this route. */
  inScopeSlots: number;
  /** In-scope slots the run produced a value for (present in the overlay). */
  filledSlots: number;
  /** Filled slots whose value differs from the template's source default. */
  changedSlots: number;
  /** Slots the engine refused to state — the operator's named asks. */
  unresolvedSlots: number;
  byDisposition: Record<string, number>;
  byOrigin: Record<string, number>;
}

export interface FirstDraftSummary {
  schemaVersion: 1;
  schemaName: "first-draft-summary-v1";
  runId: string;
  templateId: string;
  /** Routes content generation ran for. */
  generatedRoutes: string[];
  /**
   * Routes the TEMPLATE's own route policy marked `structure-only`. They are
   * reconstructed and served; they were never given generated content, and
   * carry no row in the table above.
   */
  structureOnlyRoutes: string[];
  rows: FirstDraftRouteRow[];
  totals: {
    inScopeSlots: number;
    filledSlots: number;
    changedSlots: number;
    unresolvedSlots: number;
    byDisposition: Record<string, number>;
    byOrigin: Record<string, number>;
  };
  reconciliation: {
    /** The accounting artifact's own in-scope count. */
    accountingInScopeSlots: number;
    /** The sum of every row's `inScopeSlots`. */
    rowSum: number;
    reconciled: boolean;
  };
  provenance: "derived";
}

function bump(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

export interface SummarizeFirstDraftInput {
  accounting: SlotAccountingFile;
  /** The overlay actually written (bare slotKey -> value). */
  overlay: Record<string, SlotValue>;
  /** Keys whose written value differs from the source default. */
  changed: ReadonlySet<string>;
  /** Structure-only routes from the template's route policy (may be empty). */
  structureOnlyRoutes?: readonly string[];
}

export function summarizeFirstDraft(input: SummarizeFirstDraftInput): FirstDraftSummary {
  const rows = new Map<string, FirstDraftRouteRow>();
  const rowFor = (route: string, scope: "global" | "page"): FirstDraftRouteRow => {
    const existing = rows.get(route);
    if (existing !== undefined) return existing;
    const created: FirstDraftRouteRow = {
      route,
      scope,
      inScopeSlots: 0,
      filledSlots: 0,
      changedSlots: 0,
      unresolvedSlots: 0,
      byDisposition: {},
      byOrigin: {},
    };
    rows.set(route, created);
    return created;
  };

  for (const entry of input.accounting.entries) {
    const isGlobal = entry.scope === "global" || entry.route === undefined;
    const row = rowFor(isGlobal ? GLOBAL_ROUTE_BUCKET : entry.route!, isGlobal ? "global" : "page");
    row.inScopeSlots++;
    bump(row.byDisposition, entry.disposition);
    bump(row.byOrigin, entry.origin);
    if (entry.disposition === "unresolved") row.unresolvedSlots++;
    if (input.overlay[entry.slotKey] !== undefined) {
      row.filledSlots++;
      if (input.changed.has(entry.slotKey)) row.changedSlots++;
    }
  }

  const ordered = [...rows.values()].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "global" ? -1 : 1;
    return a.route < b.route ? -1 : 1;
  });

  const totals = {
    inScopeSlots: 0,
    filledSlots: 0,
    changedSlots: 0,
    unresolvedSlots: 0,
    byDisposition: {} as Record<string, number>,
    byOrigin: {} as Record<string, number>,
  };
  for (const row of ordered) {
    totals.inScopeSlots += row.inScopeSlots;
    totals.filledSlots += row.filledSlots;
    totals.changedSlots += row.changedSlots;
    totals.unresolvedSlots += row.unresolvedSlots;
    for (const [key, count] of Object.entries(row.byDisposition)) {
      totals.byDisposition[key] = (totals.byDisposition[key] ?? 0) + count;
    }
    for (const [key, count] of Object.entries(row.byOrigin)) {
      totals.byOrigin[key] = (totals.byOrigin[key] ?? 0) + count;
    }
  }

  return {
    schemaVersion: 1,
    schemaName: "first-draft-summary-v1",
    runId: input.accounting.runId,
    templateId: input.accounting.templateId,
    generatedRoutes: [...input.accounting.scopedRoutes],
    structureOnlyRoutes: [...(input.structureOnlyRoutes ?? [])],
    rows: ordered,
    totals,
    reconciliation: {
      accountingInScopeSlots: input.accounting.totals.inScopeSlots,
      rowSum: totals.inScopeSlots,
      reconciled: totals.inScopeSlots === input.accounting.totals.inScopeSlots,
    },
    provenance: "derived",
  };
}
