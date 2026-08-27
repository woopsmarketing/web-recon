import type { RuntimePage } from "../reconstruction/types.js";
import { collectNodeIds, countElements, regionIdOf, routeHasLocalePrefix, structuralHashOf } from "./skeleton.js";
import { selectRegionRoots } from "./select-roots.js";
import {
  PAGE_REGIONS_SCHEMA_VERSION,
  PAGE_REGION_SCHEMA_NAME,
  REGION_COMPILER_VERSION,
  REGION_POLICY,
  REGION_SCHEMA_VERSION,
  RegionCompileError,
  type PageRegion,
  type PageRegionsArtifact,
  type RegionCounts,
  type RegionOccurrence,
  type RegionPolicy,
  type RegionViewport,
} from "./types.js";

/**
 * The PageRegion compile.
 *
 *   runtime pages (document evidence)
 *   + slot-bindings.json  ── joined on (pageId, viewport, nodeId) ──┐
 *   + slots.json          ── slotId → slot key ────────────────────┤
 *   + site-map.json       ── route → pageSourceId, MANY-TO-ONE ────┘
 *     → page-regions.json
 *
 * Completely offline and completely additive: nothing it reads is written, no
 * DOM attribute is added, no Slot V2 field moves. `(pageId, viewport, nodeId)`
 * is the entire contract with the template — which is precisely why this
 * compiler never needs `src/recon-template/types.ts`.
 */

export interface RegionBinding {
  bindingId: string;
  slotId: string;
  pageId: string;
  viewport: RegionViewport;
  /** `static` | `dynamic-template` | `paint-twin`. Carried, never filtered. */
  surface: string;
  /**
   * For a `dynamic-template` binding this is the HOST node in the static tree,
   * not a node inside the captured template — so a dropdown's bindings join to
   * the region that owns its trigger, which is the answer an editor wants.
   */
  nodeId: string;
}

export interface RegionCompileInput {
  templateId: string;
  host: string;
  rootUrl: string;
  /** Repo-relative, so the artifact is byte-stable across working copies. */
  runDir: string;
  slotSchemaVersion?: number;
  hashes: { slots: string; slotBindings: string; siteMap: string; routeMap: string };
  routes: readonly { route: string; pageSourceId: string; renderCoverage?: string }[];
  pages: ReadonlyMap<string, RuntimePage>;
  /** slotId → slot key. Keys are persisted, ids are not stable across compiles. */
  slotKeyById: ReadonlyMap<string, string>;
  bindings: readonly RegionBinding[];
  policy?: RegionPolicy;
}

const VIEWPORTS: readonly RegionViewport[] = ["desktop", "mobile"];

/** One (landmark, path) region as it exists on ONE pageSourceId. */
interface PageRegionDraft {
  key: string;
  landmarkKey: string;
  landmarkKind: string;
  landmarkSource: "tag" | "role" | "document";
  childPath: string;
  rootTag: string;
  pageSourceId: string;
  occurrences: RegionOccurrence[];
  slotKeys: Set<string>;
  bindingCount: number;
  dynamicTemplateBindingCount: number;
  elementCount: number;
  structuralHash: string;
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function compilePageRegions(input: RegionCompileInput): PageRegionsArtifact {
  const policy = input.policy ?? REGION_POLICY;

  // --- routes → pages (many-to-one, preserved) -----------------------------
  const routesByPage = new Map<string, string[]>();
  for (const route of input.routes) {
    const list = routesByPage.get(route.pageSourceId);
    if (list) list.push(route.route);
    else routesByPage.set(route.pageSourceId, [route.route]);
  }
  for (const list of routesByPage.values()) list.sort(byString);
  const pageIds = [...input.pages.keys()].sort(byString);
  for (const pageId of pageIds) {
    if (!routesByPage.has(pageId)) {
      throw new RegionCompileError(`runtime page ${pageId} is not reachable from any route`);
    }
  }
  /**
   * A page is "locale-only" when EVERY route that reaches it carries a locale
   * prefix. Those pages are excluded from the global-promotion denominator —
   * a `/fr/…` header legitimately differs from the root header (the rule Task
   * 18 already applies to slot grouping).
   */
  const localeOnlyPages = new Set(
    pageIds.filter((pageId) => routesByPage.get(pageId)!.every(routeHasLocalePrefix)),
  );
  const nonLocalePages = pageIds.filter((pageId) => !localeOnlyPages.has(pageId));

  // --- bindings indexed by the join key ------------------------------------
  const bindingsByNode = new Map<string, RegionBinding[]>();
  const bindingsByTree = new Map<string, RegionBinding[]>();
  for (const binding of input.bindings) {
    const nodeKey = `${binding.pageId}|${binding.viewport}|${binding.nodeId}`;
    const nodeList = bindingsByNode.get(nodeKey);
    if (nodeList) nodeList.push(binding);
    else bindingsByNode.set(nodeKey, [binding]);
    const treeKey = `${binding.pageId}|${binding.viewport}`;
    const treeList = bindingsByTree.get(treeKey);
    if (treeList) treeList.push(binding);
    else bindingsByTree.set(treeKey, [binding]);
  }

  // --- per page-viewport selection + join ----------------------------------
  const draftsByPage = new Map<string, Map<string, PageRegionDraft>>();
  const landmarkKeysByPage = new Map<string, Set<string>>();
  const pageCoverage = new Map<
    string,
    { viewports: RegionViewport[]; bindings: number; resolved: number; joined: number }
  >();
  const joinedBindingIds = new Set<string>();
  const resolvedBindingIds = new Set<string>();
  const counts = {
    emptyCandidatesDropped: 0,
    depthCapHits: 0,
    unwrapHops: 0,
    viewportMerges: 0,
    viewportRootMismatches: 0,
  };

  for (const pageId of pageIds) {
    const page = input.pages.get(pageId)!;
    const drafts = new Map<string, PageRegionDraft>();
    draftsByPage.set(pageId, drafts);
    const coverage = { viewports: [] as RegionViewport[], bindings: 0, resolved: 0, joined: 0 };
    pageCoverage.set(pageId, coverage);

    for (const viewport of VIEWPORTS) {
      const tree = page[viewport];
      if (!tree) continue;
      coverage.viewports.push(viewport);

      const selection = selectRegionRoots(tree.doc, {
        policy,
        bindingsAt: (nodeId) => bindingsByNode.get(`${pageId}|${viewport}|${nodeId}`)?.length ?? 0,
      });
      counts.emptyCandidatesDropped += selection.stats.emptyCandidatesDropped;
      counts.depthCapHits += selection.stats.depthCapHits;
      counts.unwrapHops += selection.stats.unwrapHops;
      if (viewport === "desktop") landmarkKeysByPage.set(pageId, selection.landmarkKeys);

      // Every node id in the tree, so a binding pointing OUTSIDE every region
      // (a shell ancestor) is reported as an orphan and one pointing at nothing
      // at all is reported as unresolved. The two are different failures.
      const treeNodeIds = new Set<string>();
      collectNodeIds(tree.doc, treeNodeIds);

      // A (landmark, path) pair is unique inside one tree by construction; a
      // collision would mean two roots silently sharing one record, so it fails
      // the compile rather than quietly double-counting.
      const seenInViewport = new Set<string>();

      for (const root of selection.roots) {
        // A landmark region and a page-scoped region can share a (landmark,
        // path) pair only if they are the same seam; a desktop/mobile pair that
        // disagrees on the ROOT TAG is not, so it is kept apart rather than
        // silently merged.
        const baseKey = `${root.landmark.key}|${root.childPath}`;
        const existing = drafts.get(baseKey);
        let key = baseKey;
        if (existing && existing.rootTag !== root.rootTag) {
          counts.viewportRootMismatches++;
          key = `${baseKey}@${viewport}`;
        }
        if (seenInViewport.has(key)) {
          throw new RegionCompileError(
            `two ${viewport} region roots on ${pageId} resolved to the same address ${key}`,
          );
        }
        seenInViewport.add(key);
        let draft = drafts.get(key);
        if (!draft) {
          draft = {
            key,
            landmarkKey: root.landmark.key,
            landmarkKind: root.landmark.kind,
            landmarkSource: root.landmark.source,
            childPath: root.childPath,
            rootTag: root.rootTag,
            pageSourceId: pageId,
            occurrences: [],
            slotKeys: new Set<string>(),
            bindingCount: 0,
            dynamicTemplateBindingCount: 0,
            elementCount: 0,
            structuralHash: "",
          };
          drafts.set(key, draft);
        } else if (draft.occurrences.length > 0) {
          counts.viewportMerges++;
        }

        const hash = structuralHashOf(root.node, policy);
        const elementCount = countElements(root.node);
        // The DESKTOP occurrence is the representative: it is the tree the
        // global lift compares and the one an editor renders first.
        if (draft.structuralHash === "" || viewport === "desktop") {
          draft.structuralHash = hash;
          draft.elementCount = elementCount;
        }

        let occurrenceBindings = 0;
        const ids = new Set<string>();
        collectNodeIds(root.node, ids);
        for (const nodeId of ids) {
          const bindings = bindingsByNode.get(`${pageId}|${viewport}|${nodeId}`);
          if (!bindings) continue;
          for (const binding of bindings) {
            occurrenceBindings++;
            joinedBindingIds.add(binding.bindingId);
            draft.bindingCount++;
            if (binding.surface === "dynamic-template") draft.dynamicTemplateBindingCount++;
            const slotKey = input.slotKeyById.get(binding.slotId);
            if (slotKey === undefined) {
              throw new RegionCompileError(
                `binding ${binding.bindingId} references unknown slot ${binding.slotId}`,
              );
            }
            draft.slotKeys.add(slotKey);
          }
        }
        coverage.joined += occurrenceBindings;
        draft.occurrences.push({
          viewport,
          nodeId: root.node.n,
          elementCount,
          structuralHash: hash,
          bindingCount: occurrenceBindings,
          docOrder: root.docOrder,
        });
      }

      for (const binding of bindingsByTree.get(`${pageId}|${viewport}`) ?? []) {
        coverage.bindings++;
        if (treeNodeIds.has(binding.nodeId)) {
          coverage.resolved++;
          resolvedBindingIds.add(binding.bindingId);
        }
      }
    }
  }

  // --- global lift ---------------------------------------------------------
  /**
   * A region is GLOBAL when the same landmark scope, the same child path, the
   * same root tag and the same subtree fingerprint occur on EVERY non-locale
   * page, with at least `globalMinPages` such pages. Identity of the path is
   * required as well as of the hash: a global region has to have ONE id, and a
   * footer sitting at a different path on one page has no single id to take.
   */
  const groups = new Map<string, PageRegionDraft[]>();
  for (const pageId of pageIds) {
    for (const draft of draftsByPage.get(pageId)!.values()) {
      const key = `${draft.landmarkKey}|${draft.childPath}|${draft.rootTag}|${draft.structuralHash}`;
      const list = groups.get(key);
      if (list) list.push(draft);
      else groups.set(key, [draft]);
    }
  }

  const globalGroups = new Set<string>();
  let landmarkQualifiedOnly = 0;
  let nearGlobalGroups = 0;
  let nearGlobalMaxPages = 0;
  for (const [key, members] of groups) {
    const memberPages = new Set(members.map((m) => m.pageSourceId));
    const covered = nonLocalePages.filter((pageId) => memberPages.has(pageId));
    if (nonLocalePages.length >= policy.globalMinPages && covered.length === nonLocalePages.length) {
      globalGroups.add(key);
      continue;
    }
    // The Task 18 variant — "every such page THAT HAS THAT LANDMARK" — is
    // MEASURED here and deliberately not applied. It is the rule the
    // pre-overnight audit predicts would repair a shared shell whose landmark
    // is absent from some pages; adopting it is a decision with a consumer,
    // and this Task has no consumer.
    const landmarkKey = members[0]!.landmarkKey;
    const eligible = nonLocalePages.filter((pageId) => landmarkKeysByPage.get(pageId)?.has(landmarkKey));
    if (eligible.length >= policy.globalMinPages && covered.length === eligible.length) {
      landmarkQualifiedOnly++;
    }
    if (covered.length >= policy.globalMinPages) {
      nearGlobalGroups++;
      nearGlobalMaxPages = Math.max(nearGlobalMaxPages, covered.length);
    }
  }

  // --- global id assignment ------------------------------------------------
  /**
   * A region id is minted from (scope, landmarkKey, childPath) only, while the
   * GROUP key also carries the root tag. In page scope the two are reconciled
   * where the drafts are built: a mobile root whose TAG disagrees with the
   * desktop root at the same address is kept apart under a `@mobile` key and
   * takes a `@mobile` id. Global scope has to reconcile them here instead —
   * when a landmark renders as one tag at desktop and another at mobile on
   * EVERY non-locale page, both tag variants lift to global and both would
   * otherwise mint the one unsuffixed id.
   *
   * A base id can hold at most TWO global groups: two drafts of one page share
   * a (landmarkKey, childPath) address only when their root tags DIFFER, so a
   * page contributes at most one draft per root tag — and a group missing a
   * page is not global. Assignment is still written as a rank so a third
   * variant would be named rather than silently collide.
   */
  const mobileVariantMembers = (members: readonly PageRegionDraft[]): number =>
    members.filter((member) => member.key.endsWith("@mobile")).length;

  const globalGroupsByBaseId = new Map<string, string[]>();
  for (const key of globalGroups) {
    const head = groups.get(key)![0]!;
    const baseId = regionIdOf("global", head.landmarkKey, head.childPath);
    const list = globalGroupsByBaseId.get(baseId);
    if (list) list.push(key);
    else globalGroupsByBaseId.set(baseId, [key]);
  }
  const globalIdByGroup = new Map<string, string>();
  for (const [baseId, keys] of globalGroupsByBaseId) {
    // The overwhelmingly common case, and the one every existing artifact was
    // compiled under: one variant, one unsuffixed id, byte-for-byte as before.
    if (keys.length === 1) {
      globalIdByGroup.set(keys[0]!, baseId);
      continue;
    }
    // The variant built from the FEWEST `@mobile` drafts is the desktop one and
    // keeps the unsuffixed id, mirroring page scope. A tie — a site that swaps
    // the two tags round between pages — falls back to the root tag so the
    // assignment stays deterministic rather than iteration-order dependent.
    const ranked = [...keys].sort((a, b) => {
      const left = groups.get(a)!;
      const right = groups.get(b)!;
      const byMobile = mobileVariantMembers(left) - mobileVariantMembers(right);
      return byMobile !== 0 ? byMobile : byString(left[0]!.rootTag, right[0]!.rootTag);
    });
    ranked.forEach((key, index) => {
      const suffix = index === 0 ? "" : index === 1 ? "@mobile" : `@mobile${index}`;
      globalIdByGroup.set(key, `${baseId}${suffix}`);
    });
  }

  // --- emit ----------------------------------------------------------------
  const regions: PageRegion[] = [];
  const emitted = new Set<string>();
  for (const [key, members] of groups) {
    const isGlobal = globalGroups.has(key);
    if (isGlobal) {
      const head = members[0]!;
      const regionId = globalIdByGroup.get(key)!;
      if (emitted.has(regionId)) {
        throw new RegionCompileError(`duplicate global region id ${regionId}`);
      }
      emitted.add(regionId);
      const slotKeys = new Set<string>();
      let bindingCount = 0;
      let dynamicCount = 0;
      for (const member of members) {
        for (const slotKey of member.slotKeys) slotKeys.add(slotKey);
        bindingCount += member.bindingCount;
        dynamicCount += member.dynamicTemplateBindingCount;
      }
      regions.push({
        regionId,
        scope: "global",
        scopeKey: "global",
        landmark: { kind: head.landmarkKind, key: head.landmarkKey, source: head.landmarkSource },
        childPath: head.childPath,
        rootTag: head.rootTag,
        structuralHash: head.structuralHash,
        elementCount: head.elementCount,
        bindingCount,
        dynamicTemplateBindingCount: dynamicCount,
        slotKeys: [...slotKeys].sort(byString),
        pages: [...members]
          .sort((a, b) => byString(a.pageSourceId, b.pageSourceId))
          .map((member) => ({
            pageSourceId: member.pageSourceId,
            routes: routesByPage.get(member.pageSourceId)!,
            occurrences: member.occurrences,
          })),
      });
      continue;
    }
    for (const member of members) {
      const regionId = regionIdOf(member.pageSourceId, member.landmarkKey, member.childPath);
      const suffixed = member.key.endsWith("@mobile") ? `${regionId}@mobile` : regionId;
      if (emitted.has(suffixed)) {
        throw new RegionCompileError(`duplicate region id ${suffixed}`);
      }
      emitted.add(suffixed);
      regions.push({
        regionId: suffixed,
        scope: "page",
        scopeKey: member.pageSourceId,
        landmark: { kind: member.landmarkKind, key: member.landmarkKey, source: member.landmarkSource },
        childPath: member.childPath,
        rootTag: member.rootTag,
        structuralHash: member.structuralHash,
        elementCount: member.elementCount,
        bindingCount: member.bindingCount,
        dynamicTemplateBindingCount: member.dynamicTemplateBindingCount,
        slotKeys: [...member.slotKeys].sort(byString),
        pages: [
          {
            pageSourceId: member.pageSourceId,
            routes: routesByPage.get(member.pageSourceId)!,
            occurrences: member.occurrences,
          },
        ],
      });
    }
  }
  regions.sort((a, b) => byString(a.regionId, b.regionId));

  // --- accounting ----------------------------------------------------------
  const joinedBindings = joinedBindingIds.size;
  const unresolvedBindings = input.bindings.length - resolvedBindingIds.size;
  const orphanBindings = input.bindings.length - joinedBindings - unresolvedBindings;
  if (orphanBindings < 0) {
    throw new RegionCompileError("binding accounting is inconsistent: joined exceeds resolved");
  }
  const joinedSlots = new Set<string>();
  for (const binding of input.bindings) {
    if (joinedBindingIds.has(binding.bindingId)) joinedSlots.add(binding.slotId);
  }

  const regionCounts: RegionCounts = {
    pages: pageIds.length,
    routes: input.routes.length,
    regions: regions.length,
    globalRegions: regions.filter((region) => region.scope === "global").length,
    pageRegions: regions.filter((region) => region.scope === "page").length,
    slots: input.slotKeyById.size,
    slotsJoined: joinedSlots.size,
    orphanSlots: input.slotKeyById.size - joinedSlots.size,
    bindings: input.bindings.length,
    joinedBindings,
    orphanBindings,
    unresolvedBindings,
    emptyCandidatesDropped: counts.emptyCandidatesDropped,
    depthCapHits: counts.depthCapHits,
    unwrapHops: counts.unwrapHops,
    viewportMerges: counts.viewportMerges,
    viewportRootMismatches: counts.viewportRootMismatches,
    globalCandidatesLandmarkQualifiedOnly: landmarkQualifiedOnly,
    nearGlobalGroups,
    nearGlobalMaxPages,
  };

  const limitations = [
    "region-semantic-meaning-not-inferred",
    "region-roots-limited-to-landmark-and-sectioning-evidence",
    "global-promotion-requires-identical-landmark-path-and-subtree-hash",
    "locale-prefixed-pages-excluded-from-automatic-global-promotion",
    "shell-descent-bounded-by-lookahead-and-depth-cap",
    "empty-candidates-dropped-when-they-hold-no-binding-text-or-media",
  ];
  if (regionCounts.viewportRootMismatches > 0) {
    limitations.push("desktop-and-mobile-region-roots-disagree-on-some-paths");
  }
  if (regionCounts.orphanBindings > 0) {
    limitations.push("some-bindings-address-shell-ancestors-outside-every-region");
  }
  if (regionCounts.unresolvedBindings > 0) {
    limitations.push("some-bindings-address-node-ids-absent-from-the-loaded-trees");
  }
  if (regionCounts.nearGlobalGroups > 0) {
    limitations.push("shared-shell-regions-present-on-most-but-not-all-pages-stay-page-scoped");
  }

  return {
    schemaVersion: PAGE_REGIONS_SCHEMA_VERSION,
    schemaName: PAGE_REGION_SCHEMA_NAME,
    regionSchemaVersion: REGION_SCHEMA_VERSION,
    compilerVersion: REGION_COMPILER_VERSION,
    engine: "deterministic-runtime-tree-to-page-regions",
    templateId: input.templateId,
    template: {
      templateId: input.templateId,
      runDir: input.runDir,
      host: input.host,
      rootUrl: input.rootUrl,
      ...(input.slotSchemaVersion === undefined ? {} : { slotSchemaVersion: input.slotSchemaVersion }),
      slotsHash: input.hashes.slots,
      slotBindingsHash: input.hashes.slotBindings,
      siteMapHash: input.hashes.siteMap,
      routeMapHash: input.hashes.routeMap,
    },
    policy: {
      unwrapMaxHops: policy.unwrapMaxHops,
      shellLookaheadDepth: policy.shellLookaheadDepth,
      descentDepthCap: policy.descentDepthCap,
      skeletonDepthCap: policy.skeletonDepthCap,
      skeletonBreadthCap: policy.skeletonBreadthCap,
      globalMinPages: policy.globalMinPages,
    },
    routes: [...input.routes]
      .sort((a, b) => byString(a.route, b.route))
      .map((route) => ({
        route: route.route,
        pageSourceId: route.pageSourceId,
        localePrefixed: routeHasLocalePrefix(route.route),
        ...(route.renderCoverage === undefined ? {} : { renderCoverage: route.renderCoverage }),
      })),
    pages: pageIds.map((pageId) => {
      const coverage = pageCoverage.get(pageId)!;
      const pageRegions = regions.filter((region) =>
        region.pages.some((page) => page.pageSourceId === pageId),
      ).length;
      return {
        pageSourceId: pageId,
        routes: routesByPage.get(pageId)!,
        viewports: coverage.viewports,
        regions: pageRegions,
        bindings: coverage.bindings,
        joinedBindings: coverage.joined,
        orphanBindings: coverage.resolved - coverage.joined,
        unresolvedBindings: coverage.bindings - coverage.resolved,
      };
    }),
    counts: regionCounts,
    regions,
    limitations,
    provenance: "derived",
  };
}
