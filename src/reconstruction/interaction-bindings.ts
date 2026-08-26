import type {
  CompiledPattern,
  CompiledUnknownInteraction,
  DynamicTemplate,
  DynamicTemplateNode,
  ElementSpecNode,
  InteractionSpec,
} from "../sitespec/index.js";
import { dynamicTargetDomId, generatedDomId } from "./relations.js";
import { SKIPPED_TAGS, VOID_ELEMENTS } from "./react-attributes.js";
import { styleClassName } from "./style-generator.js";
import {
  ReconstructionError,
  type ReconstructionLimitationCode,
  type RuntimeElementNode,
  type RuntimeNode,
  type RuntimePropValue,
} from "./types.js";

/**
 * Verified behavior → runtime bindings (items 84–108).
 *
 * The philosophy is Task 12's, unchanged: **rules first**. A behavior exists in
 * the clone when a confirmed pattern says it was observed, and it does not exist
 * otherwise. Nothing here reads a label, a class name or a tag and decides what
 * an element "probably" does — which is why seoworld's 16 unmatched
 * `메뉴 열기` triggers stay inert (item 163) and nextjs's 9 dynamic menus mount an
 * EMPTY region rather than a menu somebody imagined (item 94).
 *
 * The output is intentionally not code. Each binding compiles to a handful of
 * `data-wr-*` attributes on its trigger, and ONE generic client runtime
 * interprets them (items 87, 105). That keeps the client bundle a fixed small
 * size no matter how large the site is, and keeps the page tree a pure Server
 * Component — the two properties item 8 exists to protect.
 */

/**
 * The closed vocabulary of things the generated runtime can do.
 *
 * Seven operations, each one derivable from Task 12 evidence. There is no
 * `carousel`, no `accordion-with-animation`, no `sticky-header` — a runtime
 * operation nothing can produce evidence for is a claim, not an implementation.
 */
export type InteractionOp =
  /** The browser already does it. No listener is attached (items 90, 92). */
  | "native"
  /** Flip one ARIA field on the trigger between the two observed values. */
  | "state-toggle"
  /** State toggle plus a declared region's visibility. */
  | "disclosure"
  /** `aria-selected` within one tablist, plus panel visibility when knowable. */
  | "tabs"
  /** State toggle plus mount/unmount of an observed-but-never-inspected region. */
  | "menu"
  /** Same as `menu`, kept separate so the manifest can count them apart. */
  | "dialog"
  /** Remove the trigger, which is what `candidate-removed` observed. */
  | "dismiss";

export type TargetOp = "visibility" | "attribute" | "mount" | "none";

export interface InteractionBinding {
  patternId: string;
  pageId: string;
  viewportId: "desktop" | "mobile";
  triggerNodeId: string;
  patternType: string;
  mechanism: string;
  op: InteractionOp;
  /** The transition field, e.g. `aria-expanded`. Absent for `dismiss`. */
  field?: string;
  from?: string;
  to?: string;
  /** A static target DISTINCT from the trigger. */
  targetNodeId?: string;
  targetOp: TargetOp;
  /**
   * The target's observed at-rest style already hides it with CSS rather than
   * with the `hidden` attribute, so flipping `hidden` alone would change nothing
   * visible. The clone marks the node and reveals it with a neutral override —
   * see `interaction-open-state-style-not-observed`.
   */
  targetNeedsRevealOverride?: boolean;
  /** Generated id of a region this interaction mounts (item 96). */
  dynamicTargetId?: string;
  dynamicTag?: string;
  dynamicRole?: string;
  /**
   * The observed contents of that region, compiled to runtime nodes (Task 16).
   *
   * Present only when the SiteSpec carries a `dynamicTemplate`. Absent keeps the
   * Task 14 behavior exactly: mount the observed tag and role and nothing else
   * (item 76), because nothing was observed to put inside.
   */
  dynamicTemplate?: RuntimeElementNode[];
  /**
   * Task 17 §5 — the regions the user actually SAW change, and what the clone
   * runtime must do to each so the after-state is user-visible rather than a
   * bare attribute flip.
   */
  observedTargets?: ObservedTargetBinding[];
  limitations: ReconstructionLimitationCode[];
}

/**
 * One user-visible target region bound to a trigger (Task 17 §5).
 *
 * The three shapes, each closed over what was observed:
 *  - resolved + `existing-visibility`            → reveal/hide the SAME region
 *  - resolved + mounted/replaced content         → reveal + mount the observed
 *                                                  after-state subtree into it
 *  - unresolved + `newly-mounted`                → mount a fresh region after
 *                                                  the trigger
 */
export interface ObservedTargetBinding {
  discoveryId: string;
  kind:
    | "existing-visibility"
    | "existing-with-mounted-content"
    | "content-replaced"
    | "newly-mounted";
  direction: "appeared" | "disappeared" | "content-changed";
  /** Static node id + its generated DOM id, when the region resolved. */
  nodeId?: string;
  domId?: string;
  /** Observed open-state paint, for the per-target reveal CSS rule. */
  openDisplay?: string;
  openVisibility?: string;
  openOpacity?: string;
  /** Observed open-state `aria-hidden` value the runtime applies on open. */
  ariaHiddenOpen?: string;
  /** The open state cleared the `hidden` attribute. */
  clearHidden?: boolean;
  /** Tag/role for an UNRESOLVED newly-mounted region. */
  mountTag?: string;
  mountRole?: string;
  /**
   * Task 17.1 — generated DOM id of the STATIC host the mounted copy attaches
   * under (the explorer's baseline-resolved portal/mount host), plus the
   * observed element-child position inside it. Without these the runtime falls
   * back to mounting next to the trigger.
   */
  mountHostDomId?: string;
  /** Raw host node id — runtime fallback lookup scoped to the trigger's variant. */
  mountHostNodeId?: string;
  mountChildIndex?: number;
  /** Observed after-state contents, compiled to runtime nodes. */
  template?: RuntimeElementNode[];
  /**
   * Task 17 §5 — aligned descendants whose OPEN-state style token differs from
   * their closed-state one. The generator emits the differing declarations at
   * reveal specificity; the runtime only flips `data-wr-revealed`.
   */
  styleOverrides?: {
    nodeId: string;
    closedStyleTokenId?: string;
    openStyleTokenId: string;
  }[];
}

export interface UnknownAnnotation {
  unknownId: string;
  pageId: string;
  viewportId: "desktop" | "mobile";
  triggerNodeId: string;
  reason: string;
}

export interface InteractionPlan {
  /** `pageId|viewport|nodeId` → binding. */
  bindings: Map<string, InteractionBinding>;
  /** `pageId|viewport|nodeId` → unknown annotation. */
  unknowns: Map<string, UnknownAnnotation>;
  /** `pageId|viewport|nodeId` of regions that need the reveal override. */
  revealTargets: Set<string>;
  /** Patterns whose (type, mechanism) this generator cannot implement. */
  unsupported: CompiledPattern[];
  sourcePatternInstances: number;
  unknownSourceInstances: number;
  nativeBindings: number;
  scriptedBindings: number;
  dynamicTargets: number;
  byPatternType: Record<string, number>;
  byMechanism: Record<string, number>;
  interactionStateConflicts: number;
  /** Dynamic targets that mount OBSERVED contents rather than an empty region. */
  dynamicTargetsWithContent: number;
  /** Runtime nodes across every dynamic template (Task 16). */
  dynamicTemplateNodes: number;
  /** Task 17 §5 — user-visible target bindings, by outcome. */
  observedTargetBindings: number;
  observedTargetsRevealed: number;
  observedTargetsWithContent: number;
  observedTargetsUnresolved: number;
  /** Task 17.1 — mounted copies attached under their RESOLVED observed host. */
  observedTargetsHostMounted: number;
  /** Task 17.1 — targets whose capture used the expanded caps. */
  observedTargetsCaptureExpanded: number;
  /**
   * Task 17.1 — style tokens referenced by mounted templates (declared dynamic
   * and observed-target). Static page nodes populate `usedStyleTokens`; a
   * template's nodes exist only after a click, so without this set their
   * `.wr-stXXXXXX` classes had no emitted rule and every mounted region
   * rendered unstyled.
   */
  templateStyleTokens: Set<string>;
  /**
   * `pageId|viewport|nodeId` → observed open-state paint, for the per-target
   * reveal CSS rules (Task 17 §5).
   */
  observedOpenStates: Map<
    string,
    { display?: string; visibility?: string; opacity?: string }
  >;
  limitations: Set<ReconstructionLimitationCode>;
}

export function bindingKey(
  pageId: string,
  viewportId: string,
  nodeId: string,
): string {
  return `${pageId}|${viewportId}|${nodeId}`;
}

/**
 * Decide the runtime operation for one pattern.
 *
 * A total function over Task 12's taxonomy: every `patternType` × `mechanism`
 * pair the registry can produce maps to an op, so "unsupported" means the
 * registry grew a member this generator has not been taught, not that a common
 * case fell through.
 */
function opFor(
  pattern: CompiledPattern,
  hasDynamicTarget: boolean,
): InteractionOp | undefined {
  const { patternType, mechanism } = pattern;

  // Native mechanisms are native regardless of the pattern they belong to: a
  // <details> toggles itself and a checkbox checks itself, and adding a JS
  // toggle on top would fire twice (item 92).
  if (mechanism === "native-details" || mechanism === "native-checked") return "native";

  switch (patternType) {
    case "disclosure":
      return "disclosure";
    case "tabs":
      return "tabs";
    case "menu":
      return hasDynamicTarget ? "menu" : "disclosure";
    case "dialog":
      return hasDynamicTarget ? "dialog" : "dialog";
    case "toggle":
    case "selection":
    case "generic-state-toggle":
      return "state-toggle";
    case "dismiss":
      return "dismiss";
    default:
      return undefined;
  }
}

/** What the runtime does to a declared static region, from what was observed. */
function targetOpFor(pattern: CompiledPattern): TargetOp {
  const target = pattern.target;
  if (!target) return "none";
  if (target.dynamic) return "mount";
  switch (target.transition) {
    case "visibility-changed":
      return "visibility";
    case "attribute-changed":
      // The `details` relation's attribute IS `open`, and the browser flips it.
      return pattern.mechanism === "native-details" ? "attribute" : "visibility";
    case "mounted":
      return "mount";
    case "unmounted":
    case "none":
      return "none";
    default:
      return "none";
  }
}

export interface BuildInteractionPlanInput {
  interactionSpec: InteractionSpec;
  /** `pageId|viewport|nodeId` → the compiled node, for existence + state checks. */
  nodeLookup: (pageId: string, viewportId: string, nodeId: string) => ElementSpecNode | undefined;
  /** `styleTokenId` → observed computed properties, for the reveal decision. */
  styleLookup: (styleTokenId: string) => Readonly<Record<string, string>> | undefined;
}

/**
 * Is this region hidden by CSS rather than by the `hidden` attribute?
 *
 * It matters because the two need different mechanisms. An attribute-hidden
 * region is revealed by removing the attribute; a CSS-hidden one keeps its
 * `display: none` from the observed style class no matter what the attribute
 * says, so the clone would toggle `aria-expanded` and nothing would appear.
 */
function isStyleHidden(
  node: ElementSpecNode | undefined,
  styleLookup: BuildInteractionPlanInput["styleLookup"],
): boolean {
  if (!node?.styleTokenId) return false;
  const properties = styleLookup(node.styleTokenId);
  if (!properties) return false;
  return properties["display"] === "none" || properties["visibility"] === "hidden";
}

/**
 * Detect a disagreement between a node's rendered initial state and the
 * `before` value of a transition observed on it (item 104).
 *
 * Neither side wins silently. The clone renders the SiteSpec's declarative
 * attributes — that is what the page's HTML actually said — and the
 * disagreement is counted and surfaced as a limitation, so a Task 15 diff on
 * that element has a recorded reason waiting for it rather than a mystery.
 */
function hasInitialStateConflict(
  pattern: CompiledPattern,
  node: ElementSpecNode | undefined,
  targetNode: ElementSpecNode | undefined,
): boolean {
  const field = pattern.transition.field;
  if (field === "exists") return false;
  const host = field === "open" || field === "checked" ? targetNode ?? node : node;
  if (!host) return false;
  const current = host.attributes[field];
  if (field === "open" || field === "checked") {
    return (current !== undefined ? "true" : "false") !== pattern.transition.before;
  }
  if (current === undefined) return false;
  return current !== pattern.transition.before;
}

/** Compile the interaction spec into per-node runtime bindings. */
export function buildInteractionPlan(
  input: BuildInteractionPlanInput,
): InteractionPlan {
  const plan: InteractionPlan = {
    bindings: new Map(),
    unknowns: new Map(),
    revealTargets: new Set(),
    unsupported: [],
    sourcePatternInstances: input.interactionSpec.patterns.length,
    unknownSourceInstances: input.interactionSpec.unknownInteractions.length,
    nativeBindings: 0,
    scriptedBindings: 0,
    dynamicTargets: 0,
    byPatternType: {},
    byMechanism: {},
    interactionStateConflicts: 0,
    dynamicTargetsWithContent: 0,
    dynamicTemplateNodes: 0,
    observedTargetBindings: 0,
    observedTargetsRevealed: 0,
    observedTargetsWithContent: 0,
    observedTargetsUnresolved: 0,
    observedTargetsHostMounted: 0,
    observedTargetsCaptureExpanded: 0,
    templateStyleTokens: new Set(),
    observedOpenStates: new Map(),
    limitations: new Set(),
  };

  for (const pattern of input.interactionSpec.patterns) {
    const key = bindingKey(pattern.pageId, pattern.viewport, pattern.triggerNodeId);
    const trigger = input.nodeLookup(
      pattern.pageId,
      pattern.viewport,
      pattern.triggerNodeId,
    );
    if (!trigger) {
      throw new ReconstructionError(
        `pattern ${pattern.patternId} names trigger node ${pattern.triggerNodeId} on ` +
          `${pattern.pageId}/${pattern.viewport}, which is not in the compiled tree. ` +
          `Task 13 requires every pattern trigger to resolve, so this SiteSpec is inconsistent.`,
      );
    }

    const target = pattern.target;
    const hasDynamicTarget = target?.dynamic === true;
    const op = opFor(pattern, hasDynamicTarget);
    if (op === undefined) {
      plan.unsupported.push(pattern);
      continue;
    }

    const limitations = new Set<ReconstructionLimitationCode>();
    let targetNodeId: string | undefined;
    let targetOp = targetOpFor(pattern);

    if (target && !target.dynamic && target.staticNodeResolved && target.targetNodeId) {
      if (target.targetNodeId === pattern.triggerNodeId) {
        /*
         * nextjs's six verified tabs all declare an `aria-controls` that resolved
         * back to the tab itself: the site regenerates that id per render, so
         * what Task 11 recorded is id churn, not a panel edge — Task 12 preserved
         * exactly that caveat in `sourceLimitations`. A self-referential target
         * cannot drive a panel, so the clone performs the `aria-selected`
         * transition and no show/hide, and says why (item 98).
         */
        targetOp = "none";
        limitations.add("tabs-panel-target-not-distinguishable");
      } else {
        targetNodeId = target.targetNodeId;
      }
    }

    let dynamicTargetId: string | undefined;
    let dynamicTemplate: RuntimeElementNode[] | undefined;
    if (hasDynamicTarget) {
      dynamicTargetId = dynamicTargetDomId(
        pattern.pageId,
        pattern.viewport,
        pattern.patternId,
      );
      targetOp = "mount";
      plan.dynamicTargets++;
      limitations.add("dynamic-target-placement-not-observed");
      if (target?.dynamicTemplate) {
        // Task 16: the region's contents WERE observed, once, under caps. The
        // clone mounts what was seen instead of an empty shell.
        dynamicTemplate = compileDynamicTemplateNodes(target.dynamicTemplate);
        for (const node of target.dynamicTemplate.nodes) {
          if (node.styleTokenId) plan.templateStyleTokens.add(node.styleTokenId);
        }
        plan.dynamicTargetsWithContent++;
        plan.dynamicTemplateNodes += target.dynamicTemplate.nodes.length;
        limitations.add("dynamic-target-content-observed-once");
        if (target.dynamicTemplate.truncations.length > 0) {
          limitations.add("dynamic-target-content-truncated");
        }
      } else {
        limitations.add("dynamic-target-content-not-observed");
      }
    }

    if (targetOp !== "none" && targetOp !== "mount" && targetNodeId === undefined) {
      targetOp = "none";
    }

    const targetNode =
      targetNodeId !== undefined
        ? input.nodeLookup(pattern.pageId, pattern.viewport, targetNodeId)
        : target?.targetNodeId !== undefined
          ? input.nodeLookup(pattern.pageId, pattern.viewport, target.targetNodeId)
          : undefined;
    if (hasInitialStateConflict(pattern, trigger, targetNode)) {
      plan.interactionStateConflicts++;
      limitations.add("interaction-initial-state-conflict");
    }

    const revealTarget =
      targetOp === "visibility" &&
      targetNodeId !== undefined &&
      isStyleHidden(targetNode, input.styleLookup);
    if (revealTarget) limitations.add("interaction-open-state-style-not-observed");

    // --- Task 17 §5: user-visible observed targets --------------------------
    const observedTargets: ObservedTargetBinding[] = [];
    if (op !== "native") {
      const singleToken = (value?: string): string | undefined =>
        value !== undefined && value !== "" && !/[\s]/.test(value) ? value : undefined;
      for (const record of pattern.observedTargets ?? []) {
        // A declared dynamic mount already creates its region; discovering the
        // SAME mount generically must not create a second one. Task 17.1
        // narrows the match to identity (the declared target's own html id) —
        // a pattern may mount its declared region AND a separate portal
        // overlay, and suppressing every newly-mounted discovery erased the
        // overlay along with the duplicate.
        if (
          hasDynamicTarget &&
          record.kind === "newly-mounted" &&
          (record.targetSourceHtmlId === undefined ||
            record.targetSourceHtmlId === pattern.target?.targetSourceHtmlId)
        ) {
          continue;
        }
        if (record.targetNodeId === pattern.triggerNodeId) continue;

        const entry: ObservedTargetBinding = {
          discoveryId: record.discoveryId,
          kind: record.kind,
          direction: record.direction,
        };

        // Task 17.1 — a region that CONTAINS its own trigger must never have
        // its children replaced (that destroys the live trigger mid-click and
        // with it the pattern's observed state transition). The compiled
        // record already names this as `observed-target-contains-trigger`.
        const template =
          record.dynamicTemplate && record.containsTrigger !== true
            ? compileDynamicTemplateNodes(
                record.dynamicTemplate,
                hasDynamicTarget ? pattern.target?.targetSourceHtmlId : undefined,
              )
            : undefined;
        if (template && record.dynamicTemplate) {
          for (const node of record.dynamicTemplate.nodes) {
            if (node.styleTokenId) plan.templateStyleTokens.add(node.styleTokenId);
          }
        }
        if (record.containsTrigger === true) {
          limitations.add("observed-target-contains-trigger");
        }

        if (record.staticNodeResolved && record.targetNodeId !== undefined) {
          entry.nodeId = record.targetNodeId;
          entry.domId = generatedDomId(
            pattern.pageId,
            pattern.viewport,
            record.targetNodeId,
          );
          if (record.direction !== "disappeared") {
            const display = singleToken(record.openState.display);
            const visibility = singleToken(record.openState.visibility);
            const opacity = singleToken(record.openState.opacity);
            if (display !== undefined) entry.openDisplay = display;
            if (visibility !== undefined) entry.openVisibility = visibility;
            if (opacity !== undefined) entry.openOpacity = opacity;
            if (record.openState.ariaHidden !== undefined) {
              entry.ariaHiddenOpen = record.openState.ariaHidden;
            }
            if (record.openState.hidden === false) entry.clearHidden = true;
          }
          if (
            record.direction === "appeared" &&
            record.closedState.visible === false
          ) {
            // The region is CSS-hidden at rest: mark it for the reveal
            // override and record its OBSERVED open-state paint so the reveal
            // shows the layout the user actually saw, not a neutral revert.
            const revealKey = bindingKey(
              pattern.pageId,
              pattern.viewport,
              record.targetNodeId,
            );
            plan.revealTargets.add(revealKey);
            plan.observedOpenStates.set(revealKey, {
              ...(entry.openDisplay !== undefined
                ? { display: entry.openDisplay }
                : {}),
              ...(entry.openVisibility !== undefined
                ? { visibility: entry.openVisibility }
                : {}),
              ...(entry.openOpacity !== undefined
                ? { opacity: entry.openOpacity }
                : {}),
            });
            plan.observedTargetsRevealed++;
          }
          if (template) {
            entry.template = template;
            plan.observedTargetsWithContent++;
            plan.dynamicTemplateNodes += record.dynamicTemplate?.nodes.length ?? 0;
            limitations.add("observed-target-content-observed-once");
            if ((record.dynamicTemplate?.truncations.length ?? 0) > 0) {
              limitations.add("dynamic-target-content-truncated");
            }
          } else if (
            record.kind !== "existing-visibility" &&
            record.direction !== "disappeared"
          ) {
            limitations.add("observed-target-content-not-observed");
          }
          if (record.openStyleOverrides && record.openStyleOverrides.length > 0) {
            entry.styleOverrides = record.openStyleOverrides.map((override) => ({
              ...override,
            }));
            limitations.add("observed-target-content-observed-once");
          }
        } else if (record.kind === "newly-mounted" || template) {
          // A region with no static node: the clone mounts the observed copy
          // into its RESOLVED host when the explorer recorded one (Task 17.1),
          // or next to the trigger as the Task 17 fallback.
          entry.mountTag = record.observedTag;
          if (record.observedRole !== undefined) entry.mountRole = record.observedRole;
          if (record.mountHostNodeId !== undefined) {
            entry.mountHostDomId = generatedDomId(
              pattern.pageId,
              pattern.viewport,
              record.mountHostNodeId,
            );
            entry.mountHostNodeId = record.mountHostNodeId;
            if (record.mountChildIndex !== undefined) {
              entry.mountChildIndex = record.mountChildIndex;
            }
            plan.observedTargetsHostMounted++;
          }
          if (template) {
            entry.template = template;
            plan.observedTargetsWithContent++;
            plan.dynamicTemplateNodes += record.dynamicTemplate?.nodes.length ?? 0;
            limitations.add("observed-target-content-observed-once");
          } else {
            limitations.add("observed-target-content-not-observed");
          }
          if (record.mountHostNodeId === undefined) {
            limitations.add("dynamic-target-placement-not-observed");
          }
        } else {
          plan.observedTargetsUnresolved++;
          limitations.add("observed-target-not-resolved");
          continue;
        }

        observedTargets.push(entry);
        plan.observedTargetBindings++;
        if (record.captureExpanded === true) plan.observedTargetsCaptureExpanded++;
      }
    }

    const binding: InteractionBinding = {
      patternId: pattern.patternId,
      pageId: pattern.pageId,
      viewportId: pattern.viewport,
      triggerNodeId: pattern.triggerNodeId,
      patternType: pattern.patternType,
      mechanism: pattern.mechanism,
      op,
      ...(pattern.transition.field !== "exists"
        ? {
            field: pattern.transition.field,
            from: pattern.transition.before,
            to: pattern.transition.after,
          }
        : {}),
      ...(targetNodeId !== undefined ? { targetNodeId } : {}),
      targetOp,
      ...(revealTarget ? { targetNeedsRevealOverride: true } : {}),
      ...(dynamicTargetId !== undefined ? { dynamicTargetId } : {}),
      ...(target?.observedTag ? { dynamicTag: target.observedTag } : {}),
      ...(target?.observedRole ? { dynamicRole: target.observedRole } : {}),
      ...(dynamicTemplate ? { dynamicTemplate } : {}),
      ...(observedTargets.length > 0 ? { observedTargets } : {}),
      limitations: [...limitations],
    };

    const existing = plan.bindings.get(key);
    if (existing) {
      /*
       * Two observations of the same trigger are the same behavior only when
       * they agree on WHAT the behavior is. An open and a close of one
       * disclosure merge into one reversible binding; two different pattern
       * types on one trigger are a genuine conflict, and picking one quietly
       * would publish a behavior nobody verified (item 86).
       */
      if (
        existing.patternType !== binding.patternType ||
        existing.mechanism !== binding.mechanism ||
        existing.op !== binding.op
      ) {
        throw new ReconstructionError(
          `trigger ${pattern.triggerNodeId} on ${pattern.pageId}/${pattern.viewport} carries ` +
            `two incompatible verified patterns: ${existing.patternType}/${existing.mechanism} ` +
            `(${existing.patternId}) and ${binding.patternType}/${binding.mechanism} ` +
            `(${binding.patternId}). This generator does not choose one.`,
        );
      }
      // Same behavior observed twice (typically open + close): keep the first,
      // which is the lexically-first patternId, so the choice is deterministic.
      continue;
    }

    plan.bindings.set(key, binding);
    if (revealTarget && targetNodeId !== undefined) {
      plan.revealTargets.add(bindingKey(pattern.pageId, pattern.viewport, targetNodeId));
    }
    plan.byPatternType[binding.patternType] =
      (plan.byPatternType[binding.patternType] ?? 0) + 1;
    plan.byMechanism[binding.mechanism] = (plan.byMechanism[binding.mechanism] ?? 0) + 1;
    if (op === "native") plan.nativeBindings++;
    else plan.scriptedBindings++;
    for (const code of binding.limitations) plan.limitations.add(code);
  }

  for (const unknown of input.interactionSpec.unknownInteractions) {
    annotateUnknown(plan, unknown, input.nodeLookup);
  }
  if (plan.unknowns.size > 0) {
    plan.limitations.add("unknown-interaction-not-implemented");
  }

  return plan;
}

/**
 * Unknown cases become a diagnostic annotation and nothing else (items 89, 106).
 *
 * No click handler is generated, and the annotation is invisible: a `data-wr-*`
 * attribute changes neither text nor style. Task 15 is supposed to FIND these
 * gaps by comparing the clone against the original; a generator that quietly
 * filled them in would be hiding the very thing the next Task exists to measure.
 */
function annotateUnknown(
  plan: InteractionPlan,
  unknown: CompiledUnknownInteraction,
  nodeLookup: BuildInteractionPlanInput["nodeLookup"],
): void {
  if (!unknown.triggerNodeId) return;
  const node = nodeLookup(unknown.pageId, unknown.viewport, unknown.triggerNodeId);
  if (!node) return;
  const key = bindingKey(unknown.pageId, unknown.viewport, unknown.triggerNodeId);
  if (plan.unknowns.has(key)) return;
  plan.unknowns.set(key, {
    unknownId: unknown.unknownId,
    pageId: unknown.pageId,
    viewportId: unknown.viewport,
    triggerNodeId: unknown.triggerNodeId,
    reason: unknown.reason,
  });
}

/**
 * The `data-wr-*` props one binding contributes to its trigger element.
 *
 * These are the clone runtime's OWN metadata, not a restoration of the source
 * page's `data-*` attributes (item 105) — the SiteSpec has never carried a
 * source `data-*` and this generator has no way to produce one.
 */
export function bindingProps(
  binding: InteractionBinding,
): Record<string, string> {
  const props: Record<string, string> = {
    "data-wr-pattern": binding.patternType,
    "data-wr-pattern-id": binding.patternId,
    "data-wr-mechanism": binding.mechanism,
    "data-wr-op": binding.op,
  };
  if (binding.op === "native") return props;
  if (binding.field !== undefined) {
    props["data-wr-field"] = binding.field;
    props["data-wr-from"] = binding.from ?? "";
    props["data-wr-to"] = binding.to ?? "";
  }
  if (binding.targetOp !== "none") props["data-wr-target-op"] = binding.targetOp;
  if (binding.targetNeedsRevealOverride) props["data-wr-target-css-hidden"] = "1";
  if (binding.targetNodeId !== undefined) {
    props["data-wr-target-node"] = binding.targetNodeId;
  }
  if (binding.dynamicTargetId !== undefined) {
    props["data-wr-dyn-id"] = binding.dynamicTargetId;
    props["data-wr-dyn-tag"] = binding.dynamicTag ?? "div";
    if (binding.dynamicRole) props["data-wr-dyn-role"] = binding.dynamicRole;
    if (binding.dynamicTemplate && binding.dynamicTemplate.length > 0) {
      // An ATTRIBUTE rather than an inline <script> or a client data module, so
      // this rides the channel the runtime already uses and React's own
      // attribute escaping is the whole safety story. Over the ceiling the
      // template is dropped and the region mounts empty, which is the honest
      // Task 14 behavior rather than a half-rendered menu.
      const serialized = JSON.stringify(binding.dynamicTemplate);
      if (Buffer.byteLength(serialized, "utf8") <= MAX_DYNAMIC_TEMPLATE_BYTES) {
        props["data-wr-dyn-template"] = serialized;
      }
    }
  }
  if (binding.observedTargets && binding.observedTargets.length > 0) {
    /*
     * Task 17 §5 — the observed-target instructions, as one JSON attribute the
     * generic runtime interprets. Compact keys keep page weight low; the same
     * 64 KB ceiling as a dynamic template applies, and when it is exceeded the
     * templates are dropped first (reveal still works) before the whole
     * attribute is.
     */
    const entries = binding.observedTargets.map((target) => ({
      k: target.kind,
      d: target.direction,
      di: target.discoveryId,
      ...(target.domId !== undefined ? { i: target.domId } : {}),
      ...(target.openDisplay !== undefined ? { dsp: target.openDisplay } : {}),
      ...(target.ariaHiddenOpen !== undefined ? { ah: target.ariaHiddenOpen } : {}),
      ...(target.clearHidden ? { ch: 1 } : {}),
      ...(target.mountTag !== undefined ? { tag: target.mountTag } : {}),
      ...(target.mountRole !== undefined ? { role: target.mountRole } : {}),
      ...(target.mountHostDomId !== undefined ? { h: target.mountHostDomId } : {}),
      ...(target.mountHostNodeId !== undefined ? { hn: target.mountHostNodeId } : {}),
      ...(target.mountChildIndex !== undefined ? { x: target.mountChildIndex } : {}),
      ...(target.template && target.template.length > 0
        ? { tpl: target.template }
        : {}),
    }));
    /*
     * Task 17.1: the ceiling is per-attribute transport, not a capture bound —
     * captures stay hard-capped upstream. When it is exceeded, drop the
     * LARGEST template first and keep the rest, so one oversized dialog no
     * longer erases every menu template on the same trigger; reveals always
     * survive.
     */
    let serialized = JSON.stringify(entries);
    while (
      Buffer.byteLength(serialized, "utf8") > MAX_OBSERVED_ANNOTATION_BYTES &&
      entries.some((entry) => "tpl" in entry && entry.tpl !== undefined)
    ) {
      let largest = -1;
      let largestBytes = -1;
      for (let i = 0; i < entries.length; i++) {
        const tpl = (entries[i] as { tpl?: unknown }).tpl;
        if (tpl === undefined) continue;
        const bytes = Buffer.byteLength(JSON.stringify(tpl), "utf8");
        if (bytes > largestBytes) {
          largest = i;
          largestBytes = bytes;
        }
      }
      if (largest < 0) break;
      delete (entries[largest] as { tpl?: unknown }).tpl;
      serialized = JSON.stringify(entries);
    }
    if (Buffer.byteLength(serialized, "utf8") <= MAX_OBSERVED_ANNOTATION_BYTES) {
      props["data-wr-obs"] = serialized;
    }
  }
  return props;
}

/**
 * A SiteSpec dynamic template → the runtime node array the client mounts
 * (Task 16, item 76).
 *
 * The node SHAPE is the same `RuntimeNode` the page tree uses, so there is one
 * data format in the app rather than two. The `p` map, however, holds real DOM
 * ATTRIBUTE names (`class`, `for`) rather than React prop names (`className`,
 * `htmlFor`), because this region is mounted by the client runtime with
 * `document.createElement` + `setAttribute` — it lives outside React's tree, as
 * the observed region did outside the server-rendered DOM. Handing DOM-shaped
 * props to a DOM-shaped mount removes a translation layer that could only ever
 * introduce disagreement.
 *
 * What is deliberately NOT applied here: link rewriting and nested interaction
 * bindings. Task 11 is one action deep, so nothing observed says where a link
 * inside a mounted menu goes in this clone, and nothing observed says what its
 * own buttons do. Both stay exactly as observed, inert.
 */
function compileDynamicTemplateNodes(
  template: DynamicTemplate,
  declaredTargetHtmlId?: string,
): RuntimeElementNode[] {
  const byId = new Map(template.nodes.map((node) => [node.templateNodeId, node]));

  const compile = (node: DynamicTemplateNode): RuntimeNode | null => {
    if (node.tagName === "#text") {
      return node.text !== undefined ? { k: "t", v: node.text } : null;
    }
    if (SKIPPED_TAGS.has(node.tagName)) return null;

    const props: Record<string, RuntimePropValue> = {
      "data-wr-dyn-node": node.templateNodeId,
    };
    if (node.styleTokenId) props["class"] = styleClassName(node.styleTokenId);
    for (const [name, value] of Object.entries(node.attributes)) {
      // The SiteSpec's safe-attribute policy already ran: no class, no style,
      // no data-*, no on*, no form action. These are HTML attribute names and
      // go straight to `setAttribute`.
      if (name === "id") continue; // a mounted region must not duplicate a page id
      props[name] = value;
    }
    /*
     * Task 26 — the declared dynamic target can live INSIDE an observed
     * host-mount's subtree (a framework-portal disclosure's panel inside its
     * static wrapper). The captured source id equality is observed evidence of
     * which template node the aria relation names; the runtime moves the
     * declared region id onto the marked element after mounting.
     */
    if (
      declaredTargetHtmlId !== undefined &&
      node.sourceHtmlId === declaredTargetHtmlId
    ) {
      props["data-wr-declared-region"] = "1";
    }

    const runtime: RuntimeElementNode = {
      k: "e",
      n: node.templateNodeId,
      t: node.tagName,
      p: props,
    };
    if (VOID_ELEMENTS.has(node.tagName)) return runtime;

    const children: RuntimeNode[] = [];
    for (const childId of node.childTemplateNodeIds) {
      const child = byId.get(childId);
      if (!child) continue;
      const compiled = compile(child);
      if (compiled !== null) children.push(compiled);
    }
    if (children.length > 0) runtime.c = children;
    return runtime;
  };

  const roots: RuntimeElementNode[] = [];
  for (const rootId of template.rootTemplateNodeIds) {
    const node = byId.get(rootId);
    if (!node) continue;
    const compiled = compile(node);
    if (compiled !== null && compiled.k === "e") roots.push(compiled);
  }
  return roots;
}

/**
 * Serialized size ceiling for ONE mounted region's template (Task 16).
 *
 * The template travels as a `data-wr-dyn-template` attribute on its trigger, so
 * it is page weight. The explorer's element/depth/text caps already bound what
 * can be captured; this is the second, byte-level bound that keeps a pathological
 * region (deeply nested wrappers, hundreds of inline attributes) from making a
 * page heavy. A template over the ceiling is DROPPED, not truncated — half a
 * menu is not a smaller menu, it is a wrong one.
 */
export const MAX_DYNAMIC_TEMPLATE_BYTES = 64 * 1024;

/**
 * Task 17.1 — transport ceiling for one trigger's `data-wr-obs` annotation.
 *
 * The Task 17 value shared {@link MAX_DYNAMIC_TEMPLATE_BYTES}; a real portal
 * dialog captured whole (stripe's bento dialog inventories ~770 elements)
 * serializes past 64 KB, and dropping it re-opens the very gap §4 closed. The
 * capture itself remains hard-capped upstream (expanded caps included), so this
 * is page weight, not observation scope. Over the ceiling, largest template
 * drops first; reveals always survive.
 */
export const MAX_OBSERVED_ANNOTATION_BYTES = 256 * 1024;

/**
 * Per-target observed open-state CSS (Task 17 §5, priority tier of §10).
 *
 * The generic reveal rule shows a revealed region with `display: revert` —
 * honest when nothing more was observed. Where the explorer DID observe the
 * open-state paint of a region, that observation wins: one rule per revealed
 * target, at higher specificity than both the generic reveal and the exact
 * computed class, carrying the region's observed `display` / `visibility` /
 * `opacity`. Values are single tokens by construction (multi-token observed
 * values were dropped at binding build).
 */
export function generateObservedTargetCss(
  plan: InteractionPlan,
  /** `styleTokenId` → computed properties, for the open/closed diff. */
  styleLookup: (styleTokenId: string) => Readonly<Record<string, string>> | undefined,
  /** The exact-tier safety predicates, reused so the two tiers cannot drift. */
  safe: {
    property: (name: string) => boolean;
    value: (value: string) => boolean;
  },
): string {
  const rules: string[] = [];

  // --- root-level reveal paint --------------------------------------------
  const keys = [...plan.observedOpenStates.keys()].sort();
  for (const key of keys) {
    const [pageId, viewportId, nodeId] = key.split("|");
    if (!pageId || !viewportId || !nodeId) continue;
    const state = plan.observedOpenStates.get(key)!;
    const declarations: string[] = [];
    if (state.display !== undefined && state.display !== "none") {
      declarations.push(`  display: ${state.display};`);
    }
    declarations.push(`  visibility: ${state.visibility ?? "visible"};`);
    if (state.opacity !== undefined) declarations.push(`  opacity: ${state.opacity};`);
    rules.push(
      `[data-wr-page="${pageId}"][data-wr-viewport="${viewportId}"] ` +
        `[data-wr-node="${nodeId}"][data-wr-revealed="1"] {\n` +
        declarations.join("\n") +
        `\n}`,
    );
  }

  // --- descendant open-state graft (Task 17 §5) ----------------------------
  // Only the declarations that DIFFER between the closed and open tokens are
  // emitted, under the revealed root, so the closed-state rendering is
  // untouched and the open state is the one the explorer actually observed.
  const bindings = [...plan.bindings.values()].sort((a, b) =>
    a.patternId.localeCompare(b.patternId),
  );
  for (const binding of bindings) {
    for (const target of binding.observedTargets ?? []) {
      if (!target.styleOverrides || target.nodeId === undefined) continue;
      for (const override of target.styleOverrides) {
        const open = styleLookup(override.openStyleTokenId) ?? {};
        const closed =
          override.closedStyleTokenId !== undefined
            ? styleLookup(override.closedStyleTokenId) ?? {}
            : {};
        const declarations: string[] = [];
        for (const property of Object.keys(open).sort()) {
          const value = open[property]!;
          if (closed[property] === value) continue;
          if (!safe.property(property) || !safe.value(value)) continue;
          declarations.push(`  ${property}: ${value};`);
        }
        if (declarations.length === 0) continue;
        // The region ROOT's own open-state diff applies to the revealed node
        // itself — a descendant combinator would never match it.
        const subject =
          override.nodeId === target.nodeId
            ? `[data-wr-node="${target.nodeId}"][data-wr-revealed="1"]`
            : `[data-wr-node="${target.nodeId}"][data-wr-revealed="1"] ` +
              `[data-wr-node="${override.nodeId}"]`;
        rules.push(
          `[data-wr-page="${binding.pageId}"][data-wr-viewport="${binding.viewportId}"] ` +
            `${subject} {\n` +
            declarations.join("\n") +
            `\n}`,
        );
      }
    }
  }

  if (rules.length === 0) return "";
  return [
    "/* Observed interaction open-state paint (Task 17). Do not edit. */",
    ...rules,
  ].join("\n");
}

/** The `data-wr-*` props one unknown case contributes. Diagnostics only. */
export function unknownProps(
  annotation: UnknownAnnotation,
): Record<string, string> {
  return {
    "data-wr-unknown": "1",
    "data-wr-unknown-id": annotation.unknownId,
    "data-wr-unknown-reason": annotation.reason,
  };
}
