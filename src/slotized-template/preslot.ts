import type { RawBinding } from "./surfaces.js";
import type {
  FitHints,
  SlotBehavior,
  SlotConstraints,
  SlotEditor,
  SlotScope,
  SlotType,
  SlotValue,
} from "./types.js";

/**
 * The compiler's working representation: everything a slot needs EXCEPT its
 * id. Ids are hashes of the final binding set, so they can only be assigned
 * after merging (global promotion) has finished — computing them earlier would
 * produce ids that change meaning when a merge is added or removed.
 */
export interface PreSlot {
  key: string;
  type: SlotType;
  role?: string;
  label?: string;
  scope: SlotScope;
  pageId?: string;
  route?: string;
  defaultValue: SlotValue;
  fitHints?: FitHints;
  constraints?: SlotConstraints;
  behavior?: SlotBehavior;
  editor?: SlotEditor;
  evidence: string[];
  notes: string[];
  source: "slot-v2" | "surface-scan";
  slotV2Id?: string;
  /** Slot V2 `groupId` (label+href pairs) — becomes an `action` group. */
  v2GroupId?: string;
  /** Landmark this slot lives in (header/footer/nav/main/body/meta). */
  section: string;
  coverageClass: string;
  bindings: RawBinding[];
}
