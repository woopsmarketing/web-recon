import {
  DIFF_CATEGORY_ORDER,
  MEANINGFUL_CHANGE_CATEGORIES,
  type DiffCategory,
  type InteractionStateDiff,
  type InteractionStateSnapshot,
  type LiveElementState,
  type StateChange,
} from "./types.js";

/**
 * Deterministic before/after state diff (Task 11, items 58–59).
 *
 * Pure Node-side code over two snapshots: same pair in, same diff out, byte for
 * byte. Nothing here reaches into a browser, so the rule that decides `changed`
 * can be read, argued with and unit-tested without a page.
 *
 * The hard part is not detecting change — a live page mutates constantly — it is
 * refusing to call the wrong thing a change. A page with a carousel, a sticky
 * header and an analytics beacon produces DOM mutations every few hundred
 * milliseconds whether or not anything was clicked. So the categories below are
 * the ONLY evidence admitted, and all of them are anchored to something the
 * candidate actually claims to control:
 *
 *   the candidate's own state       aria-*, checked, open, disabled, visibility
 *   the region it declares it owns  aria-controls / popovertarget / <details>
 *   the page's stateful containers  dialogs, menus, listboxes, tabpanels
 *
 * Mutation records are NOT in that list. They are recorded beside the diff as
 * diagnostics (`mutationSummary`) and can never on their own make an action
 * `changed` — item 59's "a transition tick is not a state change".
 *
 * `url-change` is recorded but is deliberately excluded from `meaningfulChange`
 * too: a click that tried to navigate is reported by the navigation guard as a
 * blocked attempt, and calling it a successful state transition would overstate
 * what was observed.
 */

/** State fields that get their own diff category rather than the generic one. */
const STATE_FIELD_CATEGORY: Readonly<Record<string, DiffCategory>> = {
  checked: "checked-change",
  selected: "selected-change",
  open: "open-change",
};

function stringify(value: string | boolean | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "boolean" ? String(value) : value;
}

/** Union of the keys present in either map, in sorted order. */
function unionKeys(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): string[] {
  const keys = new Set<string>([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].sort();
}

/**
 * Compare one element's attributes / boolean state / visibility.
 *
 * `attributeCategory` differs between the candidate and a controlled target, so
 * the same comparison serves both without a second copy of the logic.
 */
function diffElement(
  before: LiveElementState,
  after: LiveElementState,
  subject: StateChange["subject"],
  subjectKey: string | undefined,
  attributeCategory: DiffCategory,
  visibilityCategory: DiffCategory,
): StateChange[] {
  const changes: StateChange[] = [];
  const key = subjectKey !== undefined ? { subjectKey } : {};

  if (before.visible !== after.visible) {
    changes.push({
      category: visibilityCategory,
      subject,
      ...key,
      field: "visible",
      before: stringify(before.visible),
      after: stringify(after.visible),
    });
  }

  for (const name of unionKeys(before.attributes, after.attributes)) {
    const b = before.attributes?.[name];
    const a = after.attributes?.[name];
    if (b !== a) {
      changes.push({
        category: attributeCategory,
        subject,
        ...key,
        field: name,
        ...(b !== undefined ? { before: b } : {}),
        ...(a !== undefined ? { after: a } : {}),
      });
    }
  }

  const beforeState = before.state as Record<string, boolean> | undefined;
  const afterState = after.state as Record<string, boolean> | undefined;
  for (const name of unionKeys(beforeState, afterState)) {
    const b = beforeState?.[name];
    const a = afterState?.[name];
    if (b !== a) {
      changes.push({
        category: STATE_FIELD_CATEGORY[name] ?? attributeCategory,
        subject,
        ...key,
        field: name,
        ...(b !== undefined ? { before: String(b) } : {}),
        ...(a !== undefined ? { after: String(a) } : {}),
      });
    }
  }

  return changes;
}

export interface DiffOptions {
  /**
   * True when the candidate handle went stale and the locator had to be
   * re-resolved for the after-snapshot (item 55) — a React re-render replacing
   * the node is a different fact from the control disappearing.
   */
  candidateReResolved?: boolean;
}

export function diffSnapshots(
  before: InteractionStateSnapshot,
  after: InteractionStateSnapshot,
  options: DiffOptions = {},
): InteractionStateDiff {
  const changes: StateChange[] = [];

  // --- candidate -----------------------------------------------------------
  if (before.candidate.exists && !after.candidate.exists) {
    changes.push({
      category: "candidate-removed",
      subject: "candidate",
      field: "exists",
      before: "true",
      after: "false",
    });
  } else if (before.candidate.exists && after.candidate.exists) {
    if (options.candidateReResolved) {
      changes.push({
        category: "candidate-replaced",
        subject: "candidate",
        field: "node",
        before: "original",
        after: "re-resolved",
      });
    }
    changes.push(
      ...diffElement(
        before.candidate,
        after.candidate,
        "candidate",
        undefined,
        "candidate-attribute-change",
        "candidate-visibility-change",
      ),
    );
  }

  // --- declared targets ----------------------------------------------------
  // Positional pairing is exact: both snapshots are built from the SAME stored
  // `controls[]` array, in the same order.
  let targetsMounted = 0;
  let targetsUnmounted = 0;
  const targetCount = Math.max(before.targets.length, after.targets.length);
  for (let i = 0; i < targetCount; i++) {
    const b = before.targets[i];
    const a = after.targets[i];
    if (!b || !a) continue;
    const key = a.targetDomId ?? a.relation;

    if (!b.resolved && a.resolved) {
      targetsMounted++;
      changes.push({
        category: "target-mounted",
        subject: "target",
        subjectKey: key,
        field: "exists",
        before: "false",
        after: "true",
      });
      continue;
    }
    if (b.resolved && !a.resolved) {
      targetsUnmounted++;
      changes.push({
        category: "target-unmounted",
        subject: "target",
        subjectKey: key,
        field: "exists",
        before: "true",
        after: "false",
      });
      continue;
    }
    if (b.resolved && a.resolved) {
      changes.push(
        ...diffElement(
          b.element,
          a.element,
          "target",
          key,
          "target-attribute-change",
          "target-visibility-change",
        ),
      );
    }
  }

  // --- stateful containers -------------------------------------------------
  const beforeContainers = new Map(before.containers.containers.map((c) => [c.key, c]));
  const afterContainers = new Map(after.containers.containers.map((c) => [c.key, c]));
  const containerKeys = [
    ...new Set([...beforeContainers.keys(), ...afterContainers.keys()]),
  ].sort();

  for (const key of containerKeys) {
    const b = beforeContainers.get(key);
    const a = afterContainers.get(key);
    if (!b && a) {
      changes.push({
        category: "container-added",
        subject: "container",
        subjectKey: key,
        field: "exists",
        before: "false",
        after: "true",
      });
      continue;
    }
    if (b && !a) {
      changes.push({
        category: "container-removed",
        subject: "container",
        subjectKey: key,
        field: "exists",
        before: "true",
        after: "false",
      });
      continue;
    }
    if (!b || !a) continue;
    if (b.visible !== a.visible) {
      changes.push({
        category: "container-visibility-change",
        subject: "container",
        subjectKey: key,
        field: "visible",
        before: String(b.visible),
        after: String(a.visible),
      });
    }
    if (b.ariaHidden !== a.ariaHidden) {
      changes.push({
        category: "container-visibility-change",
        subject: "container",
        subjectKey: key,
        field: "aria-hidden",
        ...(b.ariaHidden !== undefined ? { before: b.ariaHidden } : {}),
        ...(a.ariaHidden !== undefined ? { after: a.ariaHidden } : {}),
      });
    }
    if (b.open !== a.open) {
      changes.push({
        category: "open-change",
        subject: "container",
        subjectKey: key,
        field: "open",
        ...(b.open !== undefined ? { before: String(b.open) } : {}),
        ...(a.open !== undefined ? { after: String(a.open) } : {}),
      });
    }
  }

  // --- document ------------------------------------------------------------
  const urlChanged = before.url !== after.url;
  if (urlChanged) {
    changes.push({
      category: "url-change",
      subject: "document",
      field: "url",
      before: before.url,
      after: after.url,
    });
  }

  changes.sort((x, y) => {
    const category =
      DIFF_CATEGORY_ORDER.indexOf(x.category) - DIFF_CATEGORY_ORDER.indexOf(y.category);
    if (category !== 0) return category;
    const subject = x.subject.localeCompare(y.subject);
    if (subject !== 0) return subject;
    const key = (x.subjectKey ?? "").localeCompare(y.subjectKey ?? "");
    if (key !== 0) return key;
    return (x.field ?? "").localeCompare(y.field ?? "");
  });

  const categoryCounts: Record<string, number> = {};
  for (const category of DIFF_CATEGORY_ORDER) {
    const n = changes.filter((c) => c.category === category).length;
    if (n > 0) categoryCounts[category] = n;
  }

  return {
    changes,
    categoryCounts,
    // A URL change means the "after" snapshot is a DIFFERENT PAGE. Measured on
    // domainchecker.co.kr, one `<button>` inside an `<a href>` produced 96
    // containers added and 113 removed purely because the client-side router
    // swapped the document — which would have been reported as a spectacular
    // state transition. Item 59 exists to stop exactly that, so a navigated
    // action yields no meaningful change no matter how much of the page moved.
    meaningfulChange:
      !urlChanged &&
      changes.some((c) => MEANINGFUL_CHANGE_CATEGORIES.includes(c.category)),
    urlChanged,
    targetsMounted,
    targetsUnmounted,
  };
}
