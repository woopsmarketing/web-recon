import type { ViewportId } from "../observer/types.js";
import {
  PATTERN_MECHANISM_ORDER,
  PATTERN_TYPE_ORDER,
  UNKNOWN_REASON_ORDER,
  type InteractionPatternsArtifact,
  type UnknownInteractionsArtifact,
} from "../interaction-patterns/types.js";
import type { AiAnalysisArtifact } from "../interaction-patterns/ai/types.js";
import {
  InteractionSpecSchema,
  SCHEMA_VERSION,
  sortLimitations,
  type CompiledInference,
  type CompiledObservedTarget,
  type CompiledPattern,
  type CompiledRule,
  type CompiledTarget,
  type CompiledUnknownInteraction,
  type DynamicTemplate,
  type ElementSpecNode,
  type InteractionSpec,
  type InteractionSummary,
  type LimitationCode,
  type PageSpec,
  type RouteSpec,
  type TargetTransition,
} from "./types.js";

/**
 * Join Task 12's verified behaviors onto the compiled static tree (items 57–67).
 *
 * The whole value of this step is one field: `triggerNodeId`. Task 12 knows that
 * `e000809` on `p000003/desktop` is a native-details disclosure; Task 14 has no
 * `e000809`, it has a SiteSpec tree. Without the join, the behavior model and
 * the structure model are two files that cannot be used together.
 *
 * So an unresolvable trigger FAILS THE COMPILE (item 59, 90). A pattern stored
 * without a node to attach it to is worse than no pattern: a generator would
 * either drop it silently or attach it to something plausible, and both make the
 * SiteSpec's interaction counts a lie.
 *
 * A missing TARGET is the opposite — normal and expected (items 59, 60). Nine of
 * nextjs.org's confirmed menus mount their region on first click, so the region
 * genuinely did not exist in the observed static DOM. Those are recorded as
 * `staticNodeResolved: false, dynamic: true`, and no subtree is invented for
 * them. A generator learns "you must create a region here, and nothing observed
 * tells you what is inside it", which is exactly the truth.
 *
 * Nothing is upgraded on the way through (item 62). An `unmatched-transition`
 * stays unknown even when its trigger has an inviting `aria-label`; re-reading
 * that label and calling it a menu would replace Task 12's honest gap with this
 * Task's guess.
 */

interface ViewportIndex {
  nodeIdByElementId: Map<string, string>;
  nodeIdBySourceHtmlId: Map<string, string>;
  ambiguousHtmlIds: Set<string>;
  nodeById: Map<string, ElementSpecNode>;
  /** Task 17.1 — text node id → its non-empty trimmed value. */
  textValueByNodeId: Map<string, string>;
  /** The document root element node (no parent), when the tree has one. */
  rootNodeId?: string;
}

function indexViewport(nodes: PageSpec["viewports"]["desktop"]["nodes"]): ViewportIndex {
  const nodeIdByElementId = new Map<string, string>();
  const nodeIdBySourceHtmlId = new Map<string, string>();
  const ambiguousHtmlIds = new Set<string>();
  const nodeById = new Map<string, ElementSpecNode>();
  const textValueByNodeId = new Map<string, string>();
  let rootNodeId: string | undefined;
  for (const node of nodes) {
    if (node.type === "text") {
      const value = node.value.trim();
      if (value !== "") textValueByNodeId.set(node.nodeId, value);
      continue;
    }
    if (node.type !== "element") continue;
    nodeIdByElementId.set(node.sourceElementId, node.nodeId);
    nodeById.set(node.nodeId, node);
    if (rootNodeId === undefined && node.parentNodeId === undefined) {
      rootNodeId = node.nodeId;
    }
    if (node.sourceHtmlId !== undefined) {
      if (nodeIdBySourceHtmlId.has(node.sourceHtmlId)) {
        ambiguousHtmlIds.add(node.sourceHtmlId);
      } else {
        nodeIdBySourceHtmlId.set(node.sourceHtmlId, node.nodeId);
      }
    }
  }
  return {
    nodeIdByElementId,
    nodeIdBySourceHtmlId,
    ambiguousHtmlIds,
    nodeById,
    textValueByNodeId,
    ...(rootNodeId !== undefined ? { rootNodeId } : {}),
  };
}

/**
 * Task 17.1 — does the compiled static subtree under `rootId` contain ANY
 * non-whitespace text? Bounded DFS. Used to detect a reveal region whose
 * observed OPEN state has text the static (closed) tree simply does not hold —
 * stripe's footer book title mounts its text nodes on open, which element-level
 * mount counting cannot see.
 */
function subtreeHasText(index: ViewportIndex, rootId: string): boolean {
  const stack = [rootId];
  let budget = 500;
  while (stack.length > 0 && budget-- > 0) {
    const id = stack.pop()!;
    if (index.textValueByNodeId.has(id)) return true;
    const node = index.nodeById.get(id);
    if (!node) continue;
    for (const childId of node.childNodeIds) stack.push(childId);
  }
  return false;
}

/**
 * Resolve an explorer structural path (`0/1/3/0` — element-child indices over
 * the Observer's tree shape) against the compiled tree. Exact match only: a
 * missing index, a text node in the way, or a tag mismatch at the end resolves
 * to nothing rather than to "something plausible" (item 40's rule applied to
 * targets). The Observer and the compiled tree share the same skip policy, so
 * element-child order is comparable; the two page LOADS may still differ, which
 * is exactly why the terminal tag must agree.
 */
function resolveStructuralPath(
  index: ViewportIndex,
  path: string,
  expectedTag: string,
): string | undefined {
  if (index.rootNodeId === undefined) return undefined;
  let current = index.nodeById.get(index.rootNodeId);
  if (!current) return undefined;
  if (path !== "") {
    for (const segment of path.split("/")) {
      const want = Number(segment);
      if (!Number.isInteger(want) || want < 0) return undefined;
      let found: ElementSpecNode | undefined;
      let position = 0;
      for (const childId of current.childNodeIds) {
        const child = index.nodeById.get(childId);
        if (!child) continue; // text nodes have no element-child position
        if (position === want) {
          found = child;
          break;
        }
        position++;
      }
      if (!found) return undefined;
      current = found;
    }
  }
  return current.tagName === expectedTag ? current.nodeId : undefined;
}

/** Nearest ancestor with the given tag — the native `<summary>` → `<details>` edge. */
function nearestAncestorTag(
  index: ViewportIndex,
  startNodeId: string,
  tagName: string,
): string | undefined {
  let current = index.nodeById.get(startNodeId);
  let guard = 0;
  while (current?.parentNodeId !== undefined && guard++ < 512) {
    const parent = index.nodeById.get(current.parentNodeId);
    if (parent === undefined) return undefined;
    if (parent.tagName === tagName) return parent.nodeId;
    current = parent;
  }
  return undefined;
}

/**
 * Recursive open-state ↔ static alignment for an `existing-visibility` region
 * (Task 17 §5). The capture walked the SAME region in its open state, so at
 * every level its element children appear in the static node's element-child
 * order; a tag mismatch stops that branch (exact or nothing), and a depth/
 * element-capped capture simply aligns its prefix. Only pairs whose style
 * token DIFFERS are returned — an identical token needs no graft.
 */
function alignOpenStyles(
  index: ViewportIndex,
  rootNodeId: string,
  template: DynamicTemplate,
): { nodeId: string; closedStyleTokenId?: string; openStyleTokenId: string }[] {
  const templateById = new Map(template.nodes.map((node) => [node.templateNodeId, node]));
  const rootTemplateId = template.rootTemplateNodeIds[0];
  if (rootTemplateId === undefined) return [];
  const out: { nodeId: string; closedStyleTokenId?: string; openStyleTokenId: string }[] =
    [];

  const pair = (nodeId: string, templateNodeId: string): void => {
    const node = index.nodeById.get(nodeId);
    const templateNode = templateById.get(templateNodeId);
    if (!node || !templateNode) return;
    if (node.tagName !== templateNode.tagName) return;
    if (
      templateNode.styleTokenId !== undefined &&
      templateNode.styleTokenId !== node.styleTokenId
    ) {
      out.push({
        nodeId,
        ...(node.styleTokenId !== undefined
          ? { closedStyleTokenId: node.styleTokenId }
          : {}),
        openStyleTokenId: templateNode.styleTokenId,
      });
    }
    const staticChildren = node.childNodeIds
      .map((childId) => index.nodeById.get(childId))
      .filter((child): child is ElementSpecNode => child !== undefined);
    const templateChildren = templateNode.childTemplateNodeIds
      .map((childId) => templateById.get(childId))
      .filter(
        (child): child is NonNullable<typeof child> =>
          child !== undefined && child.tagName !== "#text",
      );
    const count = Math.min(staticChildren.length, templateChildren.length);
    for (let i = 0; i < count; i++) {
      pair(staticChildren[i]!.nodeId, templateChildren[i]!.templateNodeId);
    }
  };

  pair(rootNodeId, rootTemplateId);
  return out;
}

/** Compiled pattern/unknown/inference ids, grouped for the PageSpec index. */
export interface InteractionsByPage {
  patternIds: Map<string, string[]>;
  unknownIds: Map<string, string[]>;
  inferenceIds: Map<string, string[]>;
}

export interface CompileInteractionsInput {
  patterns: InteractionPatternsArtifact;
  unknowns: UnknownInteractionsArtifact;
  aiAnalysis?: AiAnalysisArtifact;
  /** Compiled pages, keyed by pageId. */
  pages: ReadonlyMap<string, PageSpec>;
  routes: readonly RouteSpec[];
  exploredPageIds: ReadonlySet<string>;
  /** `patternId` → the compiled after-state contents of its mounted region. */
  dynamicTemplates?: ReadonlyMap<string, DynamicTemplate>;
  /**
   * `patternId|discoveryId` → the compiled after-state contents of a
   * DISCOVERED user-visible target region (Task 17 §4).
   */
  observedTargetTemplates?: ReadonlyMap<string, DynamicTemplate>;
}

export interface CompiledInteractions {
  spec: InteractionSpec;
  byPage: InteractionsByPage;
}

function orderedCounts(
  order: readonly string[],
  counts: Map<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of order) {
    const value = counts.get(key);
    if (value !== undefined && value > 0) out[key] = value;
  }
  return out;
}

function tally<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

function push(map: Map<string, string[]>, pageId: string, id: string): void {
  const bucket = map.get(pageId);
  if (bucket) bucket.push(id);
  else map.set(pageId, [id]);
}

export function compileInteractions(
  input: CompileInteractionsInput,
): CompiledInteractions {
  const { patterns, unknowns, aiAnalysis, pages, routes, exploredPageIds } = input;
  const dynamicTemplates = input.dynamicTemplates ?? new Map<string, DynamicTemplate>();
  const observedTargetTemplates =
    input.observedTargetTemplates ?? new Map<string, DynamicTemplate>();

  // One index per page+viewport, built from the COMPILED tree rather than from
  // dom.json — so the join is verified against what the artifact actually holds.
  const indexes = new Map<string, ViewportIndex>();
  const indexFor = (pageId: string, viewport: ViewportId): ViewportIndex => {
    const key = `${pageId}|${viewport}`;
    let index = indexes.get(key);
    if (!index) {
      const page = pages.get(pageId);
      if (!page) {
        throw new Error(
          `interaction references page ${pageId}, which has no PageSpec in this SiteSpec`,
        );
      }
      index = indexViewport(page.viewports[viewport].nodes);
      indexes.set(key, index);
    }
    return index;
  };

  const byPage: InteractionsByPage = {
    patternIds: new Map(),
    unknownIds: new Map(),
    inferenceIds: new Map(),
  };

  // --- confirmed patterns (items 58, 59) --------------------------------------
  const compiledPatterns: CompiledPattern[] = [];
  for (const pattern of [...patterns.patterns].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    const { source } = pattern;
    const index = indexFor(source.pageId, source.viewport);
    const triggerNodeId = index.nodeIdByElementId.get(source.sourceElementId);
    if (triggerNodeId === undefined) {
      throw new Error(
        `pattern ${pattern.id} (${pattern.patternType}) has trigger element ` +
          `${source.sourceElementId} on ${source.pageId}/${source.viewport}, which is not ` +
          `in the compiled tree. A behavior with no node to attach to cannot be compiled.`,
      );
    }

    const limitations = new Set<LimitationCode>();
    let target: CompiledTarget | undefined;

    if (!pattern.target) {
      limitations.add("interaction-target-not-declared");
    } else {
      const source_ = pattern.target;
      let targetNodeId: string | undefined;
      let dynamic = false;

      if (source_.relation === "details") {
        // The DOM tree carries this relation, so it needs no id: the region is
        // the trigger's own <details> ancestor.
        targetNodeId = nearestAncestorTag(index, triggerNodeId, "details");
      } else if (source_.targetDomId !== undefined) {
        if (!index.ambiguousHtmlIds.has(source_.targetDomId)) {
          targetNodeId = index.nodeIdBySourceHtmlId.get(source_.targetDomId);
        }
      }

      if (targetNodeId === undefined) {
        if (source_.mounted && !source_.existedBefore) {
          dynamic = true;
          limitations.add("dynamic-target-not-in-static-dom");
        } else {
          limitations.add("declared-target-not-in-static-dom");
        }
      }

      // Task 16: the region's OBSERVED contents, when Task 11 captured them.
      // Absent is a normal outcome, and it is stated rather than left silent —
      // "no template" and "an empty region" must not read the same in the IR.
      const dynamicTemplate = dynamic ? dynamicTemplates.get(pattern.id) : undefined;
      if (dynamic) {
        if (dynamicTemplate) {
          limitations.add("dynamic-target-content-bounded-capture");
        } else {
          limitations.add("dynamic-target-content-not-captured");
        }
      }

      let transition: TargetTransition;
      if (source_.mounted) transition = "mounted";
      else if (source_.unmounted) transition = "unmounted";
      else if (source_.visibilityChanged) transition = "visibility-changed";
      else if (pattern.mechanism === "native-details") transition = "attribute-changed";
      else transition = "none";

      target = {
        relation: source_.relation,
        ...(source_.targetDomId !== undefined
          ? { targetSourceHtmlId: source_.targetDomId }
          : {}),
        staticNodeResolved: targetNodeId !== undefined,
        ...(targetNodeId !== undefined ? { targetNodeId } : {}),
        dynamic,
        ...(source_.tagName !== undefined ? { observedTag: source_.tagName } : {}),
        ...(source_.role !== undefined ? { observedRole: source_.role } : {}),
        transition,
        existedBefore: source_.existedBefore,
        existsAfter: source_.existsAfter,
        ...(source_.interactiveDescendantsAfter !== undefined
          ? {
              descendantsSummary: {
                interactiveDescendantsAfter: source_.interactiveDescendantsAfter,
              },
            }
          : {}),
        ...(dynamicTemplate ? { dynamicTemplate } : {}),
      };
    }

    // --- Task 17 §4/§5: user-visible targets the explorer DISCOVERED --------
    const observedTargets: CompiledObservedTarget[] = [];
    for (const record of pattern.observedTargets ?? []) {
      const targetLimitations = new Set<LimitationCode>();
      let targetNodeId: string | undefined;
      let resolutionMethod: "html-id" | "structural-path" | undefined;

      if (
        record.descriptor.htmlId !== undefined &&
        !index.ambiguousHtmlIds.has(record.descriptor.htmlId)
      ) {
        targetNodeId = index.nodeIdBySourceHtmlId.get(record.descriptor.htmlId);
        if (targetNodeId !== undefined) resolutionMethod = "html-id";
      }
      if (targetNodeId === undefined && record.before.exists) {
        targetNodeId = resolveStructuralPath(
          index,
          record.descriptor.structuralPath,
          record.descriptor.tagName,
        );
        if (targetNodeId !== undefined) resolutionMethod = "structural-path";
      }
      // A region that did not exist before the click is EXPECTED to be
      // unresolvable — only a pre-existing region that fails both joins is a
      // limitation worth naming.
      if (targetNodeId === undefined && record.before.exists) {
        targetLimitations.add("observed-target-not-in-static-dom");
      }

      /*
       * Task 17.1 — resolve the mount HOST of a newly-mounted region. The
       * explorer recorded the nearest pre-click ancestor in BASELINE
       * coordinates, which are the static tree's coordinates, so the same
       * exact-path join applies (tag must agree; no similarity).
       */
      let mountHostNodeId: string | undefined;
      if (
        targetNodeId === undefined &&
        record.descriptor.mountHostPath !== undefined &&
        record.descriptor.mountHostTag !== undefined
      ) {
        mountHostNodeId = resolveStructuralPath(
          index,
          record.descriptor.mountHostPath,
          record.descriptor.mountHostTag,
        );
      }

      /*
       * Task 17.1 — a resolved region that is an ANCESTOR of its own trigger
       * (stripe's mobile nav host swaps its children, hamburger included).
       * Mounting observed content into it would tear the live trigger out of
       * the DOM mid-interaction, so the renderer suppresses the content swap
       * and this fact is named on the target.
       */
      let containsTrigger = false;
      if (targetNodeId !== undefined && triggerNodeId !== undefined) {
        let cursor = index.nodeById.get(triggerNodeId);
        let guard = 0;
        while (cursor?.parentNodeId !== undefined && guard++ < 512) {
          if (cursor.parentNodeId === targetNodeId) {
            containsTrigger = true;
            break;
          }
          cursor = index.nodeById.get(cursor.parentNodeId);
        }
        if (containsTrigger) {
          targetLimitations.add("observed-target-contains-trigger");
        }
      }

      // The static tree already holds the full contents of a region whose only
      // change was visibility; carrying its capture again would duplicate page
      // content into the interaction spec. Every other kind NEEDS the observed
      // after-state contents to show the user anything real.
      // Task 17.1: an `existing-visibility` region normally keeps its static
      // contents — but when the OBSERVED open state has text and the static
      // subtree holds none (the text nodes themselves were mounted on open),
      // the capture is the only source of the content the user saw.
      const needsContent =
        record.kind !== "existing-visibility" ||
        (record.textLength > 0 &&
          targetNodeId !== undefined &&
          !subtreeHasText(index, targetNodeId));
      const capturedTemplate = observedTargetTemplates.get(
        `${pattern.id}|${record.discoveryId}`,
      );
      const template = needsContent ? capturedTemplate : undefined;
      if (needsContent && !template) {
        targetLimitations.add("observed-target-content-not-captured");
      }

      /*
       * Task 17 §5 — open-state style graft. An `existing-visibility` region's
       * capture is the same DOM in its OPEN state, so its elements align to
       * the static subtree by recursive tag/order pairing (exact; a mismatch
       * stops that branch). Each aligned descendant records its open-state
       * style token beside its closed one — the renderer emits only the
       * declarations that DIFFER, gated on the reveal marker.
       */
      let openStyleOverrides: {
        nodeId: string;
        closedStyleTokenId?: string;
        openStyleTokenId: string;
      }[] = [];
      if (targetNodeId !== undefined && capturedTemplate !== undefined) {
        if (record.kind === "existing-visibility") {
          openStyleOverrides = alignOpenStyles(index, targetNodeId, capturedTemplate);
        } else {
          /*
           * Task 17.1 §5 — mount-kind regions need the ROOT's own open-state
           * paint too. The static token froze the CLOSED computed style
           * (stripe's locale region pins `height: 0px`), so mounted children
           * can never give the region area; the capture's root token IS the
           * observed open style. Descendants are excluded on purpose: the
           * static children are replaced by the template's own styled nodes.
           */
          const rootTemplateId = capturedTemplate.rootTemplateNodeIds[0];
          const rootTemplate = capturedTemplate.nodes.find(
            (node) => node.templateNodeId === rootTemplateId,
          );
          const staticNode = index.nodeById.get(targetNodeId);
          if (
            rootTemplate !== undefined &&
            staticNode !== undefined &&
            rootTemplate.tagName === staticNode.tagName &&
            rootTemplate.styleTokenId !== undefined &&
            rootTemplate.styleTokenId !== staticNode.styleTokenId
          ) {
            openStyleOverrides = [
              {
                nodeId: targetNodeId,
                ...(staticNode.styleTokenId !== undefined
                  ? { closedStyleTokenId: staticNode.styleTokenId }
                  : {}),
                openStyleTokenId: rootTemplate.styleTokenId,
              },
            ];
          }
        }
      }

      observedTargets.push({
        discoveryId: record.discoveryId,
        kind: record.kind,
        direction: record.direction,
        observedTag: record.descriptor.tagName,
        ...(record.descriptor.role !== undefined
          ? { observedRole: record.descriptor.role }
          : {}),
        ...(record.descriptor.htmlId !== undefined
          ? { targetSourceHtmlId: record.descriptor.htmlId }
          : {}),
        structuralPath: record.descriptor.structuralPath,
        relationEvidence: record.relationEvidence.map((entry) => ({
          kind: entry.kind,
          ...(entry.detail !== undefined ? { detail: entry.detail } : {}),
        })),
        staticNodeResolved: targetNodeId !== undefined,
        ...(targetNodeId !== undefined ? { targetNodeId } : {}),
        ...(resolutionMethod !== undefined ? { resolutionMethod } : {}),
        ...(mountHostNodeId !== undefined ? { mountHostNodeId } : {}),
        ...(mountHostNodeId !== undefined &&
        record.descriptor.mountChildIndex !== undefined
          ? { mountChildIndex: record.descriptor.mountChildIndex }
          : {}),
        ...(containsTrigger ? { containsTrigger: true } : {}),
        ...(record.captureExpanded ? { captureExpanded: true } : {}),
        closedState: {
          exists: record.before.exists,
          ...(record.before.visible !== undefined
            ? { visible: record.before.visible }
            : {}),
          ...(record.before.display !== undefined
            ? { display: record.before.display }
            : {}),
        },
        openState: {
          exists: record.after.exists,
          ...(record.after.visible !== undefined ? { visible: record.after.visible } : {}),
          ...(record.after.display !== undefined ? { display: record.after.display } : {}),
          ...(record.after.visibility !== undefined
            ? { visibility: record.after.visibility }
            : {}),
          ...(record.after.opacity !== undefined ? { opacity: record.after.opacity } : {}),
          ...(record.after.hidden !== undefined ? { hidden: record.after.hidden } : {}),
          ...(record.after.ariaHidden !== undefined
            ? { ariaHidden: record.after.ariaHidden }
            : {}),
          ...(record.after.boundingBox !== undefined
            ? { boundingBox: record.after.boundingBox }
            : {}),
        },
        mountedDescendantCount: record.mountedDescendantCount,
        ...(record.textSample !== undefined ? { textSample: record.textSample } : {}),
        textLength: record.textLength,
        ...(template ? { dynamicTemplate: template } : {}),
        ...(openStyleOverrides.length > 0 ? { openStyleOverrides } : {}),
        limitations: sortLimitations(targetLimitations),
        provenance: "observed",
      });
    }

    compiledPatterns.push({
      patternId: pattern.id,
      patternType: pattern.patternType,
      ...(pattern.subtype !== undefined ? { subtype: pattern.subtype } : {}),
      mechanism: pattern.mechanism,
      pageId: source.pageId,
      viewport: source.viewport,
      triggerNodeId,
      triggerSourceElementId: source.sourceElementId,
      trigger: {
        tagName: pattern.trigger.tagName,
        ...(pattern.trigger.role !== undefined ? { role: pattern.trigger.role } : {}),
        ...(pattern.trigger.inputType !== undefined
          ? { inputType: pattern.trigger.inputType }
          : {}),
        ...(pattern.trigger.text !== undefined ? { text: pattern.trigger.text } : {}),
      },
      transition: {
        ...(pattern.transition.direction !== undefined
          ? { direction: pattern.transition.direction }
          : {}),
        field: pattern.transition.field,
        before: pattern.transition.before,
        after: pattern.transition.after,
      },
      ...(target ? { target } : {}),
      ...(observedTargets.length > 0 ? { observedTargets } : {}),
      sourceLimitations: pattern.limitations,
      limitations: sortLimitations(limitations),
      provenance: {
        level: "derived",
        ruleId: pattern.ruleId,
        ruleVersion: pattern.ruleVersion,
        registryVersion: pattern.registryVersion,
        actionId: source.actionId,
        explorationRun: source.explorationRun,
        observationFile: source.observationFile,
      },
    });
    push(byPage.patternIds, source.pageId, pattern.id);
  }

  // --- unknown cases (items 61, 62) -------------------------------------------
  const compiledUnknowns: CompiledUnknownInteraction[] = [];
  for (const unknown of [...unknowns.cases].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    const { source } = unknown;
    const index = indexFor(source.pageId, source.viewport);
    const triggerNodeId = index.nodeIdByElementId.get(source.elementId);
    const limitations = new Set<LimitationCode>();
    if (triggerNodeId === undefined) limitations.add("trigger-node-unresolved");

    compiledUnknowns.push({
      unknownId: unknown.id,
      reason: unknown.reason,
      status: unknown.status,
      pageId: source.pageId,
      viewport: source.viewport,
      ...(triggerNodeId !== undefined ? { triggerNodeId } : {}),
      triggerSourceElementId: source.elementId,
      trigger: {
        tagName: unknown.candidateSummary.tagName,
        ...(unknown.candidateSummary.role !== undefined
          ? { role: unknown.candidateSummary.role }
          : {}),
        ...(unknown.candidateSummary.inputType !== undefined
          ? { inputType: unknown.candidateSummary.inputType }
          : {}),
        ...(unknown.candidateSummary.label !== undefined
          ? { label: unknown.candidateSummary.label }
          : {}),
      },
      diffCategories: unknown.diffCategories,
      mutationCategories: unknown.mutationSummary.categories,
      partialPatternHints: unknown.partialPatternHints,
      aiEligibility: unknown.aiEligibility,
      aiEligibilityReason: unknown.aiEligibilityReason,
      ...(unknown.preferredProbeState !== undefined
        ? { preferredProbeState: unknown.preferredProbeState }
        : {}),
      ...(unknown.navigation ? { navigation: unknown.navigation } : {}),
      limitations: sortLimitations(limitations),
      provenance: {
        level: "derived",
        actionId: source.actionId,
        explorationRun: source.explorationRun,
        observationFile: source.observationFile,
      },
    });
    push(byPage.unknownIds, source.pageId, unknown.id);
  }

  // --- AI inference (items 63, 64) --------------------------------------------
  // Reached ONLY when `--ai-analysis` named a file. It lands in its own array,
  // is never merged into `patterns[]`, and carries `provenance.level: inferred`.
  const compiledInferences: CompiledInference[] = [];
  if (aiAnalysis) {
    const unknownById = new Map(unknowns.cases.map((c) => [c.id, c]));
    const analyses = [...aiAnalysis.analyses].sort((a, b) =>
      a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0,
    );
    analyses.forEach((analysis, i) => {
      const unknown = unknownById.get(analysis.caseId);
      const inferenceId = `ai${String(i + 1).padStart(6, "0")}`;
      compiledInferences.push({
        inferenceId,
        unknownId: analysis.caseId,
        provider: aiAnalysis.provider,
        status: analysis.status,
        ...(unknown ? { pageId: unknown.source.pageId } : {}),
        ...(unknown ? { viewport: unknown.source.viewport } : {}),
        ...(analysis.proposedPattern
          ? { proposedPatternType: analysis.proposedPattern.type }
          : {}),
        ...(analysis.proposedPattern?.subtype !== undefined
          ? { proposedSubtype: analysis.proposedPattern.subtype }
          : {}),
        ...(analysis.proposedPattern
          ? { confidence: analysis.proposedPattern.confidence }
          : {}),
        ...(analysis.rationale !== undefined ? { rationale: analysis.rationale } : {}),
        uncertainty: analysis.uncertainty,
        ...(analysis.suggestedNextProbe
          ? { suggestedNextProbe: analysis.suggestedNextProbe.actionType }
          : {}),
        provenance: { level: "inferred" },
      });
      if (unknown) push(byPage.inferenceIds, unknown.source.pageId, inferenceId);
    });
  }

  // --- rule provenance (item 58) ----------------------------------------------
  const ruleUsage = tally(compiledPatterns, (p) => p.provenance.ruleId ?? "");
  const rules: CompiledRule[] = patterns.rules
    .filter((rule) => (ruleUsage.get(rule.id) ?? 0) > 0)
    .map((rule) => ({
      ruleId: rule.id,
      patternType: rule.patternType,
      version: rule.version,
      description: rule.description,
      requiredEvidence: rule.requiredEvidence,
      compiledPatternCount: ruleUsage.get(rule.id) ?? 0,
    }))
    .sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));

  // --- summary (item 67) -------------------------------------------------------
  const summary: InteractionSummary = {
    verifiedPatternCount: compiledPatterns.length,
    unknownInteractionCount: compiledUnknowns.length,
    inferredInteractionCount: compiledInferences.length,
    patternTypeCounts: orderedCounts(
      PATTERN_TYPE_ORDER,
      tally(compiledPatterns, (p) => p.patternType),
    ),
    mechanismCounts: orderedCounts(
      PATTERN_MECHANISM_ORDER,
      tally(compiledPatterns, (p) => p.mechanism),
    ),
    unknownReasonCounts: orderedCounts(
      UNKNOWN_REASON_ORDER,
      tally(compiledUnknowns, (u) => u.reason),
    ),
    patternsWithStaticTrigger: compiledPatterns.length,
    patternsWithStaticTarget: compiledPatterns.filter(
      (p) => p.target?.staticNodeResolved === true,
    ).length,
    patternsWithDynamicTarget: compiledPatterns.filter((p) => p.target?.dynamic === true)
      .length,
    // Task 16. Reported next to the total so "9 dynamic targets, 9 with observed
    // contents" and "9 dynamic targets, 0 with observed contents" are different
    // sentences in the artifact rather than the same one.
    patternsWithDynamicTargetContent: compiledPatterns.filter(
      (p) => p.target?.dynamicTemplate !== undefined,
    ).length,
    dynamicTemplateNodeCount: compiledPatterns.reduce(
      (total, p) => total + (p.target?.dynamicTemplate?.nodes.length ?? 0),
      0,
    ),
    patternsWithoutTarget: compiledPatterns.filter((p) => p.target === undefined).length,
    // Task 17 §4/§5 accounting.
    patternsWithObservedTargets: compiledPatterns.filter(
      (p) => (p.observedTargets?.length ?? 0) > 0,
    ).length,
    observedTargetCount: compiledPatterns.reduce(
      (total, p) => total + (p.observedTargets?.length ?? 0),
      0,
    ),
    observedTargetsResolved: compiledPatterns.reduce(
      (total, p) =>
        total +
        (p.observedTargets?.filter((t) => t.staticNodeResolved).length ?? 0),
      0,
    ),
    observedTargetsWithTemplate: compiledPatterns.reduce(
      (total, p) =>
        total +
        (p.observedTargets?.filter((t) => t.dynamicTemplate !== undefined).length ?? 0),
      0,
    ),
    pagesExplored: exploredPageIds.size,
    pagesNotExplored: [...pages.keys()].filter((id) => !exploredPageIds.has(id)).length,
    routesWithExactBehaviorEvidence: routes.filter(
      (r) => r.behaviorCoverage === "exact-verified",
    ).length,
    routesWithRepresentedBehavior: routes.filter(
      (r) => r.behaviorCoverage === "family-represented-unverified",
    ).length,
    routesWithoutBehaviorEvidence: routes.filter(
      (r) => r.behaviorCoverage === "none" || r.behaviorCoverage === "exact-not-explored",
    ).length,
  };

  const spec = InteractionSpecSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    registryVersion: patterns.registryVersion,
    summary,
    patterns: compiledPatterns,
    unknownInteractions: compiledUnknowns,
    inferredInteractions: compiledInferences,
    rules,
  } satisfies InteractionSpec);

  return { spec, byPage };
}
