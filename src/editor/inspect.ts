/**
 * The Inspector payload — ONLY the fields that actually exist.
 *
 * FIELDS THIS EDITOR DELIBERATELY DOES NOT SHIP, because no artifact records
 * them and inventing one would be a lie the operator would act on:
 *
 *   maxCharacters / length limit   `src/recon-template/types.ts` refuses to
 *                                  derive one ("No `maxCharacters` is invented
 *                                  here"). Constraints carry the ORIGINAL's
 *                                  character/word count and its rendered
 *                                  width/height/lineCount per viewport. That
 *                                  is a REFERENCE, not a limit.
 *   x / y position                 exists only as the live rect the bridge
 *                                  reports; never a slot field.
 *   human approval / sign-off      `editability: "review"` is the COMPILER's
 *                                  confidence and `disposition:"human-required"`
 *                                  is the engine's, not a review queue.
 *                                  Opening or editing a slot clears NOTHING.
 *   assetId on an image slot       composed at read time from the asset
 *                                  materialization (see assets.ts), reported
 *                                  as UNJOINED when it cannot be composed.
 *   per-binding "visible now"      would have to be measured in the DOM.
 *
 * They are listed in `fieldsNotAvailable` so the UI can say so out loud.
 */
import type { SlotBinding, SlotDefinition, SlotValue } from "../recon-template/types.js";
import type { AuthoredState } from "../release/types.js";
import type { EditorAssetLineage, MaterializedAsset } from "./assets.js";
import type { SlotAccountingEntry } from "./catalog.js";
import type { SlotInversionIndex } from "./inversion.js";

export const FIELDS_NOT_AVAILABLE = [
  "maxCharacters — the template compiler refuses to invent a safe maximum; constraints are the ORIGINAL's measurements",
  "x/y position — a slot has no coordinates; only the live rect the preview reports",
  "human approval state — nothing in the artifacts records that a person approved a slot",
  "assetId on the slot itself — composed from the asset materialization, and reported as unjoined when it cannot be",
  "per-binding visibility — whether a bound element is on screen right now is not recorded anywhere",
] as const;

export interface BindingRow {
  bindingId: string;
  pageId: string;
  viewport: string;
  surface: string;
  nodeId: string;
  target: string;
  attributeName?: string;
  childIndex?: number;
  templateNodeId?: string;
  discoveryId?: string;
  field?: string;
  expectedValue: string;
  inCurrentView: boolean;
}

export interface GroupMember {
  slotKey: string;
  role: string;
  type: string;
  label: string;
  currentValue: SlotValue;
  editability: string;
  urlKind?: string;
}

export interface GroupInspector {
  groupId: string;
  memberCount: number;
  /** At most one href member; a group can legitimately have none. */
  href: GroupMember | null;
  /** N label members — `home.main.cta.new-loops` really has two. */
  labels: GroupMember[];
  others: GroupMember[];
  /** true when the group has ONE member: groupId present, but groups nothing. */
  degraded: boolean;
}

export interface ImageInspector {
  src: string;
  alt: string | null;
  srcset: string | null;
  /** /media file names the preview actually serves this image at. */
  mediaNames: string[];
  asset: MaterializedAsset | null;
  authoredAsset: { file: string; alt?: string; note?: string; updatedAt: string } | null;
  joined: boolean;
  note: string;
}

export interface SlotInspector {
  slotId: string;
  key: string;
  label: string;
  role: string;
  type: string;
  scope: string;
  pageId: string | null;
  route: string | null;
  groupId: string | null;
  editability: string;
  urlKind: string | null;
  defaultValue: SlotValue;
  currentValue: SlotValue;
  /** The generated first draft's value for this slot, or null when it has none. */
  draftValue: SlotValue | null;
  /** Which layer `currentValue` came from. */
  valueLayer: SlotValueLayer;
  authored: boolean;
  constraints: unknown;
  evidence: string[];
  appliedOverrides: string[];
  bindingTotal: number;
  bindingsInView: number;
  bindingsByViewport: Record<string, number>;
  bindingsBySurface: Record<string, number>;
  bindingsByPage: Record<string, number>;
  bindings: BindingRow[];
  accountingAvailable: boolean;
  accounting: SlotAccountingEntry | null;
  group: GroupInspector | null;
  image: ImageInspector | null;
  fieldsNotAvailable: string[];
}

/** A stored override is only usable if it is a string or an image object. */
function usableValue(value: unknown): SlotValue | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "src" in (value as Record<string, unknown>)) {
    return value as SlotValue;
  }
  return undefined;
}

/**
 * WHAT RENDERS, in the same order the preview and the production bake stack
 * it: the operator's authored edit wins; under it the generated FIRST DRAFT;
 * under that the template's source default.
 *
 * `draft` is optional so every caller written before Task 28 Phase 10 keeps
 * its exact previous behaviour (authored-or-default) rather than silently
 * changing meaning.
 */
export function currentSlotValue(
  slot: SlotDefinition,
  authored: AuthoredState,
  draft?: Record<string, SlotValue>,
): SlotValue {
  const authoredValue = usableValue(authored.slotValues[slot.key]);
  if (authoredValue !== undefined) return authoredValue;
  const draftValue = draft === undefined ? undefined : usableValue(draft[slot.key]);
  if (draftValue !== undefined) return draftValue;
  return slot.defaultValue;
}

/** Which layer the value the operator is looking at actually came from. */
export type SlotValueLayer = "authored" | "generated-draft" | "source-default";

export function slotValueLayer(
  slot: SlotDefinition,
  authored: AuthoredState,
  draft?: Record<string, SlotValue>,
): SlotValueLayer {
  if (usableValue(authored.slotValues[slot.key]) !== undefined) return "authored";
  if (draft !== undefined && usableValue(draft[slot.key]) !== undefined) return "generated-draft";
  return "source-default";
}

function member(slot: SlotDefinition, authored: AuthoredState, draft?: Record<string, SlotValue>): GroupMember {
  return {
    slotKey: slot.key,
    role: slot.role,
    type: slot.type,
    label: slot.label,
    currentValue: currentSlotValue(slot, authored, draft),
    editability: slot.editability,
    ...(slot.urlKind !== undefined ? { urlKind: slot.urlKind } : {}),
  };
}

/**
 * The grouped CTA / link inspector.
 *
 * `groupId` REALLY EXISTS on this data (1,553 of linear.app's 3,079 slots, in
 * 635 groups) — but two facts break a naive label/href pair and are handled
 * here instead of being papered over: 194 groups hold exactly ONE slot (190 of
 * them `image.content`), and a CTA can carry N label segments
 * (`home.main.cta.new-loops` → `.label.01` "New" + `.label.02` "Loops →").
 */
export function buildGroupInspector(
  index: SlotInversionIndex,
  slot: SlotDefinition,
  authored: AuthoredState,
  draft?: Record<string, SlotValue>,
): GroupInspector | null {
  if (slot.groupId === undefined) return null;
  const members = index.slotsByGroupId.get(slot.groupId) ?? [];
  if (members.length === 0) return null;
  let href: GroupMember | null = null;
  const labels: GroupMember[] = [];
  const others: GroupMember[] = [];
  for (const candidate of members) {
    const row = member(candidate, authored, draft);
    if (candidate.type === "url" && href === null) href = row;
    else if (candidate.role.endsWith(".label")) labels.push(row);
    else others.push(row);
  }
  return {
    groupId: slot.groupId,
    memberCount: members.length,
    href,
    labels,
    others,
    degraded: members.length === 1,
  };
}

function buildImageInspector(
  slot: SlotDefinition,
  value: SlotValue,
  authored: AuthoredState,
  lineage: EditorAssetLineage | null,
): ImageInspector | null {
  if (slot.type !== "image") return null;
  const image = typeof value === "string" ? { src: value } : value;
  const src = image.src;
  const asset = lineage?.bySourceUrl.get(src) ?? null;
  const mediaNames: string[] = [];
  if (lineage !== null) {
    const direct = lineage.mediaNameBySourceUrl.get(src);
    if (direct !== undefined) mediaNames.push(direct);
    const srcset = typeof value === "string" ? undefined : value.srcset;
    for (const candidate of (srcset ?? "").split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url === "") continue;
      const name = lineage.mediaNameBySourceUrl.get(url);
      if (name !== undefined && !mediaNames.includes(name)) mediaNames.push(name);
    }
    if (asset?.mediaName != null && !mediaNames.includes(asset.mediaName)) {
      mediaNames.push(asset.mediaName);
    }
  }
  const authoredAsset = asset === null ? null : (authored.assets?.[asset.assetId] ?? null);
  return {
    src,
    alt: typeof value === "string" ? null : (value.alt ?? null),
    srcset: typeof value === "string" ? null : (value.srcset ?? null),
    mediaNames,
    asset,
    authoredAsset,
    joined: asset !== null,
    note:
      lineage === null
        ? "no asset materialization on this project's accepted lineage — an image replacement can be authored but cannot be previewed"
        : asset === null
          ? "this image's source URL is not in the materialization manifest, so it has no assetId to author against"
          : "assetId composed from the materialization manifest; the preview serves the bytes at the /media names listed",
  };
}

export interface BuildInspectorOptions {
  index: SlotInversionIndex;
  slot: SlotDefinition;
  authored: AuthoredState;
  pageId: string | null;
  viewport: string | null;
  accounting: Map<string, SlotAccountingEntry>;
  accountingAvailable: boolean;
  assetLineage: EditorAssetLineage | null;
  /** The generated first draft (content run overlay), when the site has one. */
  draft?: Record<string, SlotValue>;
}

export function buildSlotInspector(options: BuildInspectorOptions): SlotInspector {
  const { index, slot, authored } = options;
  const bindings: SlotBinding[] = index.bindingsBySlotId.get(slot.id) ?? [];
  const byViewport: Record<string, number> = {};
  const bySurface: Record<string, number> = {};
  const byPage: Record<string, number> = {};
  const rows: BindingRow[] = [];
  let inView = 0;
  for (const binding of bindings) {
    byViewport[binding.viewport] = (byViewport[binding.viewport] ?? 0) + 1;
    bySurface[binding.surface] = (bySurface[binding.surface] ?? 0) + 1;
    byPage[binding.pageId] = (byPage[binding.pageId] ?? 0) + 1;
    const inCurrentView =
      options.pageId !== null &&
      options.viewport !== null &&
      binding.pageId === options.pageId &&
      binding.viewport === options.viewport;
    if (inCurrentView) inView++;
    rows.push({
      bindingId: binding.bindingId,
      pageId: binding.pageId,
      viewport: binding.viewport,
      surface: binding.surface,
      nodeId: binding.nodeId,
      target: binding.target,
      ...(binding.attributeName !== undefined ? { attributeName: binding.attributeName } : {}),
      ...(binding.childIndex !== undefined ? { childIndex: binding.childIndex } : {}),
      ...(binding.templateNodeId !== undefined ? { templateNodeId: binding.templateNodeId } : {}),
      ...(binding.discoveryId !== undefined ? { discoveryId: binding.discoveryId } : {}),
      ...(binding.field !== undefined ? { field: binding.field } : {}),
      expectedValue: binding.expectedValue,
      inCurrentView,
    });
  }
  const draft = options.draft;
  const value = currentSlotValue(slot, authored, draft);
  const draftValue = draft === undefined ? undefined : usableValue(draft[slot.key]);
  return {
    slotId: slot.id,
    key: slot.key,
    label: slot.label,
    role: slot.role,
    type: slot.type,
    scope: slot.scope,
    pageId: slot.pageId ?? null,
    route: slot.route ?? null,
    groupId: slot.groupId ?? null,
    editability: slot.editability,
    urlKind: slot.urlKind ?? null,
    defaultValue: slot.defaultValue,
    currentValue: value,
    /** The generated draft's value, when the site carries one for this slot. */
    draftValue: draftValue ?? null,
    valueLayer: slotValueLayer(slot, authored, draft),
    authored: slot.key in authored.slotValues,
    constraints: slot.constraints ?? null,
    evidence: slot.evidence,
    appliedOverrides: slot.appliedOverrides ?? [],
    bindingTotal: bindings.length,
    bindingsInView: inView,
    bindingsByViewport: byViewport,
    bindingsBySurface: bySurface,
    bindingsByPage: byPage,
    bindings: rows,
    accountingAvailable: options.accountingAvailable,
    accounting: options.accounting.get(slot.key) ?? null,
    group: buildGroupInspector(index, slot, authored, draft),
    image: buildImageInspector(slot, value, authored, options.assetLineage),
    fieldsNotAvailable: [...FIELDS_NOT_AVAILABLE],
  };
}
