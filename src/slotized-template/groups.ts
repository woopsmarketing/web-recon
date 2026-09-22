import { groupIdOf } from "./ids.js";
import { ancestorChain, nearestCommonAncestor, type PageIndex } from "./tree.js";
import type { Binding, GroupDefinition, GroupKind, SlotDefinition } from "./types.js";

/**
 * Edit clusters.
 *
 * Groups exist so an operator edits "the pricing card", not slot #1417. They
 * are DERIVED FROM STRUCTURE, never from a pattern library:
 *
 *   page     one per page — the guaranteed home of every slot
 *   section  a landmark/section container (header/nav/main/footer/…)
 *   cluster  the nearest common ancestor of a small mixed-kind slot set
 *            (image + text, text + link) — cards, media-text blocks, CTAs
 *   action   a Slot V2 groupId, i.e. a link's label and href
 *   global   the shell regions shared by every page
 *
 * `patternHint` is a LABEL. Nothing in rendering reads it, so a wrong hint
 * costs nothing but a mildly odd heading in an editor.
 *
 * Groups are logical and span both variants: containment is computed on the
 * desktop tree (the richer one), and a slot with no desktop occurrence falls
 * back to its landmark section, then to the page group. Every slot is in
 * exactly one group, so no slot can be invisible to an editor.
 */

const CLUSTER_MAX_SLOTS = 12;
const CLUSTER_MIN_SLOTS = 2;

interface WorkingGroup {
  id: string;
  key: string;
  label?: string;
  kind: GroupKind;
  pageId?: string;
  rootNodeId?: string;
  depth: number;
  slotIds: string[];
  childGroupIds: string[];
  patternHint?: string;
}

export interface GroupBuildInput {
  slots: readonly SlotDefinition[];
  bindingsBySlot: Map<string, Binding[]>;
  pages: Map<string, PageIndex>;
  keyPrefixByPage: Map<string, string>;
  sectionBySlot: Map<string, string>;
  v2GroupBySlot: Map<string, string>;
}

function labelFromKey(key: string): string {
  return key
    .split(".")
    .map((part) => part.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()))
    .join(" · ");
}

function hintForSection(section: string): string | undefined {
  if (section === "header" || section === "footer" || section === "nav") return section;
  if (section === "main") return "content";
  return undefined;
}

export function buildGroups(input: GroupBuildInput): GroupDefinition[] {
  const groups: WorkingGroup[] = [];
  const globalSlotsBySection = new Map<string, string[]>();

  /** desktop node id → owning group id, deepest writer wins. */
  const nodeToGroup = new Map<string, Map<string, string>>();
  const register = (pageId: string, nodeId: string | undefined, groupId: string): void => {
    if (nodeId === undefined) return;
    let map = nodeToGroup.get(pageId);
    if (!map) nodeToGroup.set(pageId, (map = new Map()));
    map.set(nodeId, groupId);
  };

  const slotsByPage = new Map<string, SlotDefinition[]>();
  for (const slot of input.slots) {
    if (slot.scope === "global" || slot.pageId === undefined) {
      const section = input.sectionBySlot.get(slot.id) ?? "body";
      const list = globalSlotsBySection.get(section) ?? [];
      list.push(slot.id);
      globalSlotsBySection.set(section, list);
      continue;
    }
    const list = slotsByPage.get(slot.pageId) ?? [];
    list.push(slot);
    slotsByPage.set(slot.pageId, list);
  }

  // --- global shell groups ---------------------------------------------------
  if (globalSlotsBySection.size > 0) {
    const rootId = groupIdOf(undefined, "global", "global");
    const root: WorkingGroup = {
      id: rootId,
      key: "global",
      label: "Global",
      kind: "global",
      depth: -1,
      slotIds: [],
      childGroupIds: [],
    };
    groups.push(root);
    for (const [section, slotIds] of [...globalSlotsBySection.entries()].sort()) {
      const id = groupIdOf(undefined, `global.${section}`, "section");
      groups.push({
        id,
        key: `global.${section}`,
        label: labelFromKey(`global.${section}`),
        kind: "section",
        depth: 0,
        slotIds: slotIds.sort(),
        childGroupIds: [],
        patternHint: hintForSection(section),
      });
      root.childGroupIds.push(id);
    }
  }

  // --- per page --------------------------------------------------------------
  for (const [pageId, page] of input.pages) {
    const pageSlots = slotsByPage.get(pageId) ?? [];
    if (pageSlots.length === 0) continue;
    const desktop = page.desktop;
    const prefix = input.keyPrefixByPage.get(pageId) ?? pageId;

    const pageGroup: WorkingGroup = {
      id: groupIdOf(pageId, desktop.root.n, "page"),
      key: prefix,
      label: labelFromKey(prefix),
      kind: "page",
      pageId,
      rootNodeId: desktop.root.n,
      depth: 0,
      slotIds: [],
      childGroupIds: [],
    };
    groups.push(pageGroup);
    register(pageId, desktop.root.n, pageGroup.id);

    // Desktop node ids each slot touches (containment is computed here).
    const slotNodes = new Map<string, string[]>();
    for (const slot of pageSlots) {
      const nodes = (input.bindingsBySlot.get(slot.id) ?? [])
        .filter((b) => b.variant === "desktop" && b.nodeId !== undefined && desktop.byId.has(b.nodeId))
        .map((b) => b.nodeId!);
      slotNodes.set(slot.id, [...new Set(nodes)].sort());
    }

    // --- section groups ---
    const sections = new Map<string, string[]>();
    for (const slot of pageSlots) {
      const section = input.sectionBySlot.get(slot.id) ?? "body";
      const list = sections.get(section) ?? [];
      list.push(slot.id);
      sections.set(section, list);
    }
    for (const [section] of [...sections.entries()].sort()) {
      // Anchor: the shallowest desktop node whose own landmark is this section.
      let anchor: string | undefined;
      let anchorDepth = Number.POSITIVE_INFINITY;
      if (section !== "meta") {
        for (const nodeId of desktop.order) {
          const info = desktop.byId.get(nodeId)!;
          if (info.landmark !== section) continue;
          if (info.depth < anchorDepth) {
            anchor = nodeId;
            anchorDepth = info.depth;
          }
        }
      }
      const id = groupIdOf(pageId, anchor ?? `${prefix}.${section}`, "section");
      groups.push({
        id,
        key: `${prefix}.${section}`,
        label: labelFromKey(`${prefix}.${section}`),
        kind: "section",
        pageId,
        rootNodeId: anchor,
        depth: anchor === undefined ? 0 : anchorDepth,
        slotIds: [],
        childGroupIds: [],
        patternHint: hintForSection(section),
      });
      if (anchor !== undefined && anchor !== desktop.root.n) register(pageId, anchor, id);
    }

    // --- cluster groups: minimal mixed-kind subtrees ---
    const subtreeSlots = new Map<string, Set<string>>();
    const typeById = new Map(pageSlots.map((s) => [s.id, s.type] as const));
    for (const [slotId, nodes] of slotNodes) {
      for (const nodeId of nodes) {
        for (const ancestor of ancestorChain(desktop, nodeId)) {
          let set = subtreeSlots.get(ancestor);
          if (!set) subtreeSlots.set(ancestor, (set = new Set()));
          set.add(slotId);
        }
      }
    }
    const qualifying: string[] = [];
    for (const [nodeId, set] of subtreeSlots) {
      if (set.size < CLUSTER_MIN_SLOTS || set.size > CLUSTER_MAX_SLOTS) continue;
      const kinds = new Set([...set].map((id) => typeById.get(id)));
      if (kinds.size < 2) continue;
      qualifying.push(nodeId);
    }
    const hasQualifyingDescendant = new Set<string>();
    for (const nodeId of qualifying) {
      for (const ancestor of ancestorChain(desktop, nodeId)) {
        if (ancestor !== nodeId) hasQualifyingDescendant.add(ancestor);
      }
    }
    for (const nodeId of qualifying.sort()) {
      if (hasQualifyingDescendant.has(nodeId)) continue;
      const info = desktop.byId.get(nodeId)!;
      const kinds = new Set([...(subtreeSlots.get(nodeId) ?? [])].map((id) => typeById.get(id)));
      const id = groupIdOf(pageId, nodeId, "cluster");
      groups.push({
        id,
        key: `${prefix}.${info.landmark}.cluster.${nodeId}`,
        label: `${labelFromKey(prefix)} · Cluster ${nodeId}`,
        kind: "cluster",
        pageId,
        rootNodeId: nodeId,
        depth: info.depth,
        slotIds: [],
        childGroupIds: [],
        patternHint: kinds.has("image") || kinds.has("video") ? "media-text" : "card",
      });
      register(pageId, nodeId, id);
    }

    // --- action groups: Slot V2 label+href pairs ---
    const actions = new Map<string, string[]>();
    for (const slot of pageSlots) {
      const v2Group = input.v2GroupBySlot.get(slot.id);
      if (v2Group === undefined) continue;
      const list = actions.get(v2Group) ?? [];
      list.push(slot.id);
      actions.set(v2Group, list);
    }
    // Action members are assigned DIRECTLY (a label and its href belong
    // together by evidence, not by containment). The anchor is never
    // registered as a containment owner: a CTA's nearest common ancestor is
    // often a whole section, and letting it own that subtree would swallow
    // every unrelated slot inside it.
    const claimedByAction = new Set<string>();
    for (const [v2Group, slotIds] of [...actions.entries()].sort()) {
      if (slotIds.length < 2) continue;
      const nodes = slotIds.flatMap((id) => slotNodes.get(id) ?? []);
      const anchor = nearestCommonAncestor(desktop, nodes);
      const id = groupIdOf(pageId, anchor ?? v2Group, "action");
      groups.push({
        id,
        key: `${v2Group}`,
        label: labelFromKey(v2Group),
        kind: "action",
        pageId,
        rootNodeId: anchor,
        depth: anchor === undefined ? 0 : (desktop.byId.get(anchor)?.depth ?? 0),
        slotIds: [...slotIds].sort(),
        childGroupIds: [],
        patternHint: "action",
      });
      for (const slotId of slotIds) claimedByAction.add(slotId);
    }

    // --- assign every slot to the DEEPEST group that contains it ---
    const byId = new Map(groups.map((g) => [g.id, g] as const));
    const nodeMap = nodeToGroup.get(pageId) ?? new Map<string, string>();
    const sectionGroupKey = new Map<string, WorkingGroup>();
    for (const group of groups) {
      if (group.pageId === pageId && group.kind === "section") sectionGroupKey.set(group.key, group);
    }
    for (const slot of pageSlots) {
      if (claimedByAction.has(slot.id)) continue;
      const nodes = slotNodes.get(slot.id) ?? [];
      let target: WorkingGroup | undefined;
      if (nodes.length > 0) {
        const nca = nearestCommonAncestor(desktop, nodes);
        if (nca !== undefined) {
          const chain = ancestorChain(desktop, nca);
          for (let i = chain.length - 1; i >= 0; i--) {
            const groupId = nodeMap.get(chain[i]!);
            if (groupId !== undefined) {
              target = byId.get(groupId);
              break;
            }
          }
        }
      }
      if (target === undefined) {
        const section = input.sectionBySlot.get(slot.id) ?? "body";
        target = sectionGroupKey.get(`${prefix}.${section}`) ?? pageGroup;
      }
      target.slotIds.push(slot.id);
    }
  }

  // --- containment hierarchy --------------------------------------------------
  const byId = new Map(groups.map((g) => [g.id, g] as const));
  const pageRoots = new Map<string, WorkingGroup>();
  for (const group of groups) {
    if (group.kind === "page" && group.pageId !== undefined) pageRoots.set(group.pageId, group);
  }
  for (const group of groups) {
    if (group.kind === "page" || group.kind === "global") continue;
    if (group.pageId === undefined) continue; // global sections are linked already
    const page = pageRoots.get(group.pageId);
    const index = [...(nodeToGroup.get(group.pageId) ?? new Map<string, string>())];
    let parent: WorkingGroup | undefined;
    if (group.rootNodeId !== undefined) {
      const desktop = input.pages.get(group.pageId)!.desktop;
      const chain = ancestorChain(desktop, group.rootNodeId);
      for (let i = chain.length - 2; i >= 0; i--) {
        const found = index.find(([nodeId]) => nodeId === chain[i]);
        if (found) {
          const candidate = byId.get(found[1]);
          if (candidate && candidate.id !== group.id) {
            parent = candidate;
            break;
          }
        }
      }
    }
    (parent ?? page)?.childGroupIds.push(group.id);
  }

  // Prune empty groups (no slots anywhere beneath them) so an editor never
  // shows a section that cannot be edited.
  const keep = new Set<string>();
  const hasSlots = (group: WorkingGroup, seen = new Set<string>()): boolean => {
    if (seen.has(group.id)) return false;
    seen.add(group.id);
    if (group.slotIds.length > 0) return true;
    return group.childGroupIds.some((id) => {
      const child = byId.get(id);
      return child ? hasSlots(child, seen) : false;
    });
  };
  for (const group of groups) if (hasSlots(group)) keep.add(group.id);

  return groups
    .filter((g) => keep.has(g.id))
    .map((g) => ({
      id: g.id,
      key: g.key,
      ...(g.label === undefined ? {} : { label: g.label }),
      kind: g.kind,
      ...(g.pageId === undefined ? {} : { pageId: g.pageId }),
      ...(g.rootNodeId === undefined ? {} : { rootNodeId: g.rootNodeId }),
      slotIds: [...new Set(g.slotIds)].sort(),
      childGroupIds: [...new Set(g.childGroupIds)].filter((id) => keep.has(id)).sort(),
      ...(g.patternHint === undefined ? {} : { patternHint: g.patternHint }),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
