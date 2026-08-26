import type { ActionFacts } from "./facts.js";
import {
  STATEFUL_ARIA_ATTRIBUTES,
  type MutationCategory,
  type PatternMechanism,
  type PatternType,
  type TransitionDirection,
  type UnknownReason,
} from "./types.js";
import type { ActionStatus, DiffCategory } from "../interaction-explorer/types.js";
import type { ViewportId } from "../observer/types.js";

/**
 * Compact behavior fingerprints (Task 12, items 40, 46).
 *
 * Two different jobs, one shared principle: a signature answers "is this the
 * SAME behavior as that one?", so anything unique to an occurrence has to stay
 * out of it. Excluded from both, always:
 *
 *   element ids · HTML ids · generated ids · URLs · page ids · visible text ·
 *   aria-label values · geometry · timing
 *
 * Radix ids (`radix-_R_2miubaaivb_`) are the reason this is a rule rather than a
 * preference: keying on them would turn twenty identical dropdown triggers into
 * twenty unique behaviors and, for the unknown side, into twenty AI calls.
 *
 * Viewport IS part of the pattern signature. Desktop and mobile are independent
 * explorations of independent renders (Task 11 item 102), and merging them here
 * would quietly assert the cross-viewport control matching this pipeline has
 * deliberately never implemented.
 */

const FIELD_SEPARATOR = "|";

function slot(value: string | undefined): string {
  return value ?? "";
}

export interface PatternSignatureInput {
  patternType: PatternType;
  subtype?: string;
  mechanism: PatternMechanism;
  direction?: TransitionDirection;
  triggerTag: string;
  triggerRole?: string;
  targetTag?: string;
  targetRole?: string;
  viewport: ViewportId;
}

/**
 * `disclosure|details|native-details|closed-to-open|summary||details||desktop`
 *
 * Reads as: what behavior, expressed how, in which direction, by what kind of
 * control, on what kind of region, at which viewport.
 */
export function patternSignature(input: PatternSignatureInput): string {
  return [
    input.patternType,
    slot(input.subtype),
    input.mechanism,
    slot(input.direction),
    input.triggerTag,
    slot(input.triggerRole),
    slot(input.targetTag),
    slot(input.targetRole),
    input.viewport,
  ].join(FIELD_SEPARATOR);
}

/**
 * The stateful shape of the control BEFORE the action — values included.
 *
 * Values matter here in a way they do not elsewhere: `aria-checked=true` and
 * `aria-checked=false` are the difference between "already in the target state"
 * and a live transition, so collapsing them would merge the two most important
 * unknown groups in the corpus. Only {@link STATEFUL_ARIA_ATTRIBUTES} and native
 * booleans are read — never `aria-label`, whose value is human text.
 */
export function beforeStateFamily(facts: ActionFacts): string {
  const parts: string[] = [];
  for (const attribute of STATEFUL_ARIA_ATTRIBUTES) {
    const value = facts.beforeAttributes[attribute];
    if (value !== undefined) parts.push(`${attribute}=${value}`);
  }
  for (const [field, value] of Object.entries(facts.beforeState).sort()) {
    if (value === true) parts.push(`${field}=true`);
  }
  return parts.join(",");
}

export interface UnknownSignatureInput {
  reason: UnknownReason;
  status: ActionStatus;
  triggerTag: string;
  triggerRole?: string;
  inputType?: string;
  capabilities: readonly string[];
  beforeStateFamily: string;
  diffCategories: readonly DiffCategory[];
  mutationCategories: readonly MutationCategory[];
  safetyEvents: readonly string[];
}

/**
 * `already-in-target-state|no-change|button|radio||click,state-toggle,toggle|aria-checked=true||class|`
 *
 * `status` is in the key so two genuinely different failures never merge: an
 * `ambiguous` locator and an `actionability-error` are both `execution-error`,
 * and sending one AI case for both would be describing two problems with one
 * answer.
 */
export function unknownSignature(input: UnknownSignatureInput): string {
  return [
    input.reason,
    input.status,
    input.triggerTag,
    slot(input.triggerRole),
    slot(input.inputType),
    [...input.capabilities].join(","),
    input.beforeStateFamily,
    [...input.diffCategories].join(","),
    [...input.mutationCategories].join(","),
    [...input.safetyEvents].join(","),
  ].join(FIELD_SEPARATOR);
}
