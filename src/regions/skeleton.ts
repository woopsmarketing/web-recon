import { createHash } from "node:crypto";
import type { RuntimeElementNode, RuntimeNode } from "../reconstruction/types.js";
import {
  BODY_SCOPED_LANDMARK_TAGS,
  LANDMARK_ROLES,
  LANDMARK_TAGS,
  SECTIONING_CONTENT_TAGS,
  MEDIA_TAGS,
  SECTIONING_ROLES,
  SECTIONING_TAGS,
  type RegionLandmark,
  type RegionPolicy,
} from "./types.js";

/**
 * The structural primitives PageRegion ids are built from.
 *
 * Three things in this repo already solve "address a node structurally" at page
 * scope and this file deliberately reuses their shape rather than inventing a
 * fourth vocabulary:
 *
 *   src/interaction-explorer/discover-targets.ts  child-index path (`0/2/1`)
 *   src/interaction-explorer/build-locator.ts     tag:nth path (`div:2>header:1`)
 *   src/verifier/structural-profile.ts            domain-separated sha256 skeleton
 *
 * The tag:nth form is the one taken, and the choice is the whole point of the
 * artifact. A dense child index renumbers when ANY sibling is inserted; a
 * tag-scoped ordinal only renumbers when a sibling OF THE SAME TAG is inserted
 * before it, so a wrapper `<div>` dropped in ahead of `<section>` leaves
 * `section:3` alone. Neither of the two identities the reconstruction already
 * persists could be used here: the global `nNNNNNN` ordinals renumber on any
 * inserted node (src/interaction-explorer/types.ts), and persisted
 * `ancestorIds` are truncated to 12 entries by the recon-template extractor,
 * which drops exactly the TOP ancestors a region root lives among.
 */

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

export function isElement(node: RuntimeNode): node is RuntimeElementNode {
  return node.k === "e";
}

export function elementChildren(node: RuntimeElementNode): RuntimeElementNode[] {
  return (node.c ?? []).filter(isElement);
}

function propString(node: RuntimeElementNode, name: string): string | undefined {
  const value = node.p?.[name];
  return typeof value === "string" ? value : undefined;
}

/** First token of `role`, lowercased — the same normalization discover-targets uses. */
export function roleOf(node: RuntimeElementNode): string | undefined {
  const raw = propString(node, "role");
  if (!raw) return undefined;
  const first = raw.trim().split(/\s+/)[0];
  return first ? first.toLowerCase() : undefined;
}

export function tagOf(node: RuntimeElementNode): string {
  return node.t.toLowerCase();
}

/**
 * The landmark this element opens, if any.
 *
 * `insideSectioning` is the HTML/ARIA scoping rule, not a heuristic: `<header>`,
 * `<footer>` and `<aside>` only map to the banner / contentinfo / complementary
 * landmarks when they are scoped to the body — nested inside `article`, `aside`,
 * `main`, `nav` or `section` they are a CARD header, and HTML-AAM maps them to
 * generic. Ignoring the rule is expensive here: the linear.app homepage carries
 * nine `<header>` elements, eight of them inside cards, and treating each as a
 * landmark shatters one card list into one region per card.
 *
 * An EXPLICIT `role=` always counts. It is author intent, not inference.
 */
export function landmarkKindOf(
  node: RuntimeElementNode,
  insideSectioning: boolean,
): { kind: string; source: "tag" | "role" } | undefined {
  const role = roleOf(node);
  if (role && role in LANDMARK_ROLES) return { kind: LANDMARK_ROLES[role]!, source: "role" };
  const tag = tagOf(node);
  if (!LANDMARK_TAGS.includes(tag)) return undefined;
  if (insideSectioning && BODY_SCOPED_LANDMARK_TAGS.includes(tag)) return undefined;
  return { kind: tag, source: "tag" };
}

/** Landmark OR sectioning element — the two things that mark a seam. */
export function isAnchor(node: RuntimeElementNode, insideSectioning: boolean): boolean {
  if (landmarkKindOf(node, insideSectioning)) return true;
  if (SECTIONING_TAGS.includes(tagOf(node))) return true;
  const role = roleOf(node);
  return role !== undefined && SECTIONING_ROLES.includes(role);
}

/**
 * `div:2` — the node's 1-based position among its SAME-TAG element siblings.
 * `parent` is passed rather than looked up because the runtime IR has no parent
 * pointers (it is a pure tree, item 7).
 */
export function pathSegment(parent: RuntimeElementNode, child: RuntimeElementNode): string {
  const tag = tagOf(child);
  let nth = 0;
  for (const sibling of elementChildren(parent)) {
    if (tagOf(sibling) === tag) nth++;
    if (sibling === child) break;
  }
  return `${tag}:${nth}`;
}

/** `div:1>section:3`, or `self` for a region rooted at its landmark. */
export function joinPath(segments: readonly string[]): string {
  return segments.length === 0 ? "self" : segments.join(">");
}

/**
 * `<scopeKey>:rgn:<landmarkKey>:<childPath>`.
 *
 * `scopeKey` is `global` or the owning pageSourceId — without it two different
 * pages' third `<section>` under `main` would collide on one id. The
 * pageSourceId (not a route key) is the page-scope namespace because routes →
 * pageSourceId is MANY-TO-ONE: keying on a route would mint N identical regions
 * for one shared page and force an arbitrary choice of "the" route.
 */
export function regionIdOf(scopeKey: string, landmarkKey: string, childPath: string): string {
  return `${scopeKey}:rgn:${landmarkKey}:${childPath}`;
}

// ---------------------------------------------------------------------------
// Landmark scopes
// ---------------------------------------------------------------------------

export interface TreeAnalysis {
  /** Landmark scope openers, in document order, keyed by node. */
  landmarks: Map<RuntimeElementNode, RegionLandmark>;
  /** Every seam-marking element: landmarks plus sectioning elements. */
  anchors: Set<RuntimeElementNode>;
}

/**
 * ONE pre-pass over a viewport tree, producing landmark scopes and the anchor
 * set the shell test consults.
 *
 * It is a pre-pass rather than a lazy test for two reasons: the landmark keys
 * (`header1`, `nav1`, `nav2`, `main1`, …) must be numbered in document order
 * independently of how the candidate walk happens to descend, and both answers
 * depend on ancestor context (`insideSectioning`) that a per-node predicate
 * cannot see in a tree with no parent pointers.
 */
export function analyzeTree(root: RuntimeElementNode): TreeAnalysis {
  const landmarks = new Map<RuntimeElementNode, RegionLandmark>();
  const anchors = new Set<RuntimeElementNode>();
  const counters = new Map<string, number>();
  const visit = (node: RuntimeElementNode, insideSectioning: boolean): void => {
    const landmark = landmarkKindOf(node, insideSectioning);
    if (landmark) {
      const next = (counters.get(landmark.kind) ?? 0) + 1;
      counters.set(landmark.kind, next);
      landmarks.set(node, { kind: landmark.kind, key: `${landmark.kind}${next}`, source: landmark.source });
    }
    if (isAnchor(node, insideSectioning)) anchors.add(node);
    const nested = insideSectioning || SECTIONING_CONTENT_TAGS.includes(tagOf(node));
    for (const child of elementChildren(node)) visit(child, nested);
  };
  visit(root, false);
  return { landmarks, anchors };
}

/** The implicit outermost scope, so content outside every landmark still lands. */
export const DOCUMENT_LANDMARK: RegionLandmark = { kind: "document", key: "doc", source: "document" };

// ---------------------------------------------------------------------------
// Unwrap + shell test
// ---------------------------------------------------------------------------

/**
 * A generic wrapper worth collapsing: a `div`/`span` that says nothing (no
 * role, no aria-label, no inline SVG), holds exactly one element child, and
 * holds no text of its own. `div > div > <section>` must produce ONE region,
 * not three nested ones.
 */
function isTransparentWrapper(node: RuntimeElementNode): boolean {
  const tag = tagOf(node);
  if (tag !== "div" && tag !== "span") return false;
  if (node.v !== undefined) return false;
  if (roleOf(node) !== undefined) return false;
  if (propString(node, "aria-label") !== undefined) return false;
  const children = node.c ?? [];
  let elements = 0;
  for (const child of children) {
    if (isElement(child)) elements++;
    else if (child.v.trim().length > 0) return false; // real text of its own
  }
  return elements === 1;
}

export interface Unwrapped {
  node: RuntimeElementNode;
  /** Path segments crossed while unwrapping — kept, so ids stay unambiguous. */
  segments: string[];
}

export function unwrap(node: RuntimeElementNode, policy: RegionPolicy): Unwrapped {
  const segments: string[] = [];
  let current = node;
  for (let hop = 0; hop < policy.unwrapMaxHops; hop++) {
    if (!isTransparentWrapper(current)) break;
    const child = elementChildren(current)[0];
    if (!child) break;
    segments.push(pathSegment(current, child));
    current = child;
  }
  return { node: current, segments };
}

/**
 * True when a landmark or sectioning element sits STRICTLY below `node` within
 * `shellLookaheadDepth` element levels — i.e. `node` is a container OF sections
 * rather than a section. Bounded on purpose: an unbounded test lets one
 * `<section>` buried deep inside a card shatter the card list into one region
 * per card, which is the opposite of a visual-section grouping.
 */
export function hasAnchorWithin(
  node: RuntimeElementNode,
  anchors: ReadonlySet<RuntimeElementNode>,
  policy: RegionPolicy,
  memo: Map<RuntimeElementNode, boolean>,
): boolean {
  const cached = memo.get(node);
  if (cached !== undefined) return cached;
  const search = (current: RuntimeElementNode, depth: number): boolean => {
    if (depth > policy.shellLookaheadDepth) return false;
    for (const child of elementChildren(current)) {
      if (anchors.has(child)) return true;
      if (search(child, depth + 1)) return true;
    }
    return false;
  };
  const result = search(node, 1);
  memo.set(node, result);
  return result;
}

// ---------------------------------------------------------------------------
// Emptiness
// ---------------------------------------------------------------------------

/**
 * A candidate holding no text, no media and (checked by the caller) no binding
 * is a spacer or a paint-only divider. Dropping it cannot lose a slot — the
 * binding half of the test is what guarantees that — and keeping it would bury
 * the real sections in decoration.
 */
export function hasContent(node: RuntimeElementNode): boolean {
  if (node.v !== undefined) return true;
  if (MEDIA_TAGS.includes(tagOf(node))) return true;
  for (const child of node.c ?? []) {
    if (isElement(child)) {
      if (hasContent(child)) return true;
    } else if (child.v.trim().length > 0) return true;
  }
  return false;
}

export function countElements(node: RuntimeElementNode): number {
  let total = 1;
  for (const child of elementChildren(node)) total += countElements(child);
  return total;
}

export function collectNodeIds(node: RuntimeElementNode, into: Set<string>): void {
  into.add(node.n);
  for (const child of elementChildren(node)) collectNodeIds(child, into);
}

// ---------------------------------------------------------------------------
// Structural hash
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Folded into every hash so a policy change can never compare equal by accident. */
function policyTag(policy: RegionPolicy): string {
  return `u${policy.unwrapMaxHops}/l${policy.shellLookaheadDepth}/d${policy.descentDepthCap}` +
    `/s${policy.skeletonDepthCap}/b${policy.skeletonBreadthCap}`;
}

function serializeSkeleton(node: RuntimeElementNode, policy: RegionPolicy, depth: number): string {
  const tag = tagOf(node);
  if (depth >= policy.skeletonDepthCap) return tag;
  const children = elementChildren(node);
  if (children.length === 0) return tag;
  const kept = children.slice(0, policy.skeletonBreadthCap);
  const overflow = children.length - kept.length;
  const inner = kept.map((child) => serializeSkeleton(child, policy, depth + 1)).join(",");
  return `${tag}(${inner}${overflow > 0 ? `+${overflow}` : ""})`;
}

/**
 * The drift detector, persisted BESIDE the region id and never as it. Tags and
 * shape only: no text, no class, no node id — so it survives a content edit and
 * moves the moment the MARKUP of the region changes. It is also the fingerprint
 * a global lift compares across pages.
 */
export function structuralHashOf(node: RuntimeElementNode, policy: RegionPolicy): string {
  const skeleton = serializeSkeleton(node, policy, 0);
  return sha256(`page-region-skeleton|v1/${policyTag(policy)}\n${skeleton}`);
}

/** sha256 of an input file's bytes, for the template pin in the artifact header. */
export function hashBytes(raw: string): string {
  return `sha256:${sha256(raw)}`;
}

/**
 * Locale-prefixed routes are excluded from automatic global promotion, the rule
 * Task 18 already applies to slot grouping (`pathHasLocalePrefix` in
 * src/recon-template/grouping.ts). Restated here rather than imported: the
 * three lines are not worth a module edge into the most contended file cluster
 * in the repo, and PageRegion must stay importable without recon-template.
 */
const LOCALE_PREFIX = /^[a-z]{2}(-[a-z]{2})?$/i;

export function routeHasLocalePrefix(routePath: string): boolean {
  const first = routePath.split("/").filter(Boolean)[0];
  return first !== undefined && LOCALE_PREFIX.test(first);
}
