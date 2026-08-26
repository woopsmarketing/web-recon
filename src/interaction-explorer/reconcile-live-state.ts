import type { InteractionActionPlan, LiveSignals } from "./types.js";

/**
 * Live safety + operability reconciliation (Task 11, items 15, 28, 36–38).
 *
 * The plan was built from data Task 09 saved days ago. Between then and now the
 * page may have shipped a new build, a control may have become disabled, and —
 * the case that matters most — a button may have gained submit semantics the
 * stored markup never showed. Task 10's `ATTR_WHITELIST` never stored
 * `disabled`, `readonly`, `open`, `hidden`, `inert`, `checked` or `popover*` at
 * all, so its guard table read zero for several of them. Those signals are read
 * live here, and this module is the last gate before a real click.
 *
 * Two questions, in this order, because safety outranks measurement:
 *
 *   1. Is it still SAFE?      → `blocked-by-policy` (never clicked)
 *   2. Is it still OPERABLE?  → `live-inoperable`   (never clicked)
 *
 * Both refusals are results, not errors. `live-inoperable` on a control that
 * Task 10 recorded as `initiallyOperable: true` is precisely the drift this
 * stage exists to measure, and hiding it behind a retry would destroy the
 * finding (item 111: there is no retry engine in Task 11).
 */

export type ReconcileVerdict =
  | { proceed: true }
  | {
      proceed: false;
      status: "blocked-by-policy" | "live-inoperable";
      reason: string;
    };

/**
 * The live re-check of the mutation guards.
 *
 * Task 10 derived `form-submit` from stored markup and HTML default semantics,
 * and that already keeps submit buttons out of the plan. This repeats the check
 * against the DOM's own resolution of `type` and `form` — which is the real
 * answer, includes `form="other-id"` associations that stored ancestry can not
 * see, and does not depend on the planner having been right.
 */
function policyBlocker(signals: LiveSignals, plan: InteractionActionPlan): string | undefined {
  const tag = plan.locatorDescriptor.tagName;
  const liveType = (signals.buttonType ?? signals.attributes["type"] ?? "").toLowerCase();

  if (tag === "input" && liveType === "file") {
    return "live input[type=file] — a file dialog is never driven automatically";
  }
  if (tag === "input" && (liveType === "submit" || liveType === "image")) {
    return `live input[type=${liveType}] submits its form`;
  }
  if (tag === "button" && liveType === "submit" && signals.hasForm) {
    return "live button[type=submit] inside a form";
  }
  // A typeless <button> inside a form submits by HTML default. The DOM resolves
  // `button.type` to "submit" in that case, so the branch above covers it; this
  // is the belt-and-braces reading for engines that report an empty type.
  if (tag === "button" && liveType === "" && signals.hasForm) {
    return "live typeless <button> inside a form submits by HTML default";
  }
  return undefined;
}

export function reconcileLiveState(
  signals: LiveSignals,
  plan: InteractionActionPlan,
): ReconcileVerdict {
  const blocked = policyBlocker(signals, plan);
  if (blocked) {
    return { proceed: false, status: "blocked-by-policy", reason: blocked };
  }

  if (!signals.operability.clickOperable) {
    const blockers = signals.operability.blockers.join(", ") || "not clickable";
    return {
      proceed: false,
      status: "live-inoperable",
      reason: `live state blocks a click: ${blockers}`,
    };
  }

  return { proceed: true };
}
