import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Deterministic **coarse** structural profile (Task 08).
 *
 * Task 06 already fingerprints a page exactly (`textHash` / `structureHash`).
 * Those answer *identity*: "are these two URLs the same page?" — and they answer
 * it well. They cannot answer *template*: "are these two pages built from the
 * same layout?", because they are byte-exact over the whole DOM tag/depth
 * sequence. Task 07 measured the consequence: three MDN reference pages from one
 * template (930 / 932 / 935 elements) produced three different `structureHash`
 * values, so 110 of 112 verified URLs stayed singletons.
 *
 * This module adds a SEPARATE, coarser signal next to the exact one — it never
 * replaces it:
 *
 *   Exact  structureHash        → duplicate / identity      (Task 06, unchanged)
 *   Coarse StructuralProfile    → template / page family    (this module)
 *
 * Everything here is deterministic string/DOM work. No AI, no embedding, no
 * similarity score, no per-site rule: the same HTML always yields the same
 * profile, and one global policy applies to every site.
 *
 * Split of work (mirrors {@link ./fingerprint.ts}):
 *  - {@link collectStructuralRawInBrowser} runs INSIDE the page and returns only
 *    *raw, policy-free* material (a depth-tagged token stream, a landmark token
 *    stream, per-tag counts). It must stay self-contained — no imports, no
 *    closures — so all tuning arrives through its `config` argument.
 *  - {@link buildStructuralProfile} applies the global {@link SKELETON_POLICY}
 *    in Node and hashes the results. Keeping normalization on the Node side is
 *    what makes the policy auditable (and what let the constants below be chosen
 *    by measurement rather than taste — see the Task 08 report).
 *
 * The raw skeleton text is NEVER persisted; only its hash and a handful of
 * compact counts reach `verification.json`.
 */

// ---------------------------------------------------------------- collection policy

/**
 * Tags dropped from the coarse profile **together with their subtree**.
 *
 * These carry no layout structure and are exactly the things that differ between
 * two renderings of one template (an extra preload `<link>`, one more analytics
 * `<script>`). `<head>` is dropped wholesale for the same reason — everything in
 * it is metadata.
 *
 * Note the deliberate difference from Task 06: the exact `structureHash` keeps
 * all of these. That is correct for an identity hash (a page IS its markup) and
 * wrong for a template signal, so the two policies differ on purpose rather than
 * by accident.
 */
export const PROFILE_IGNORED_TAGS: readonly string[] = [
  "head",
  "script",
  "style",
  "noscript",
  "template",
  "meta",
  "link",
  "base",
  "title",
];

/**
 * Tags counted as one node whose subtree is NOT walked. An inline icon `<svg>`
 * can contribute a hundred `<path>` elements that say nothing about the page
 * layout and vary per icon; the Observer already treats inline SVG as an opaque
 * blob (Task 04), so the same boundary is used here.
 */
export const PROFILE_OPAQUE_TAGS: readonly string[] = [
  "svg",
  "math",
  "canvas",
  "video",
  "audio",
  "iframe",
  "object",
];

/**
 * Tags that form the landmark signature (§ landmark signature). Structural
 * skeleton tags only — never a count of the prose inside them.
 */
export const LANDMARK_TAGS: readonly string[] = [
  "header",
  "nav",
  "main",
  "aside",
  "article",
  "section",
  "footer",
  "form",
  "table",
  "dialog",
];

/**
 * Safety cap on elements walked, matching Task 06's structure walk so both
 * signals degrade at the same page size.
 */
export const PROFILE_MAX_ELEMENTS = 8_000;

/**
 * How deep the browser-side token stream goes. Higher than any depth cap the
 * policy may use, so the depth cap stays a Node-side decision that can be
 * re-measured without re-crawling.
 */
export const RAW_SKELETON_DEPTH_LIMIT = 12;

/** Tuning handed to the in-page collector (it can close over nothing). */
export interface StructuralRawConfig {
  ignoredTags: readonly string[];
  opaqueTags: readonly string[];
  landmarkTags: readonly string[];
  maxElements: number;
  rawDepthLimit: number;
}

export const STRUCTURAL_RAW_CONFIG: StructuralRawConfig = {
  ignoredTags: PROFILE_IGNORED_TAGS,
  opaqueTags: PROFILE_OPAQUE_TAGS,
  landmarkTags: LANDMARK_TAGS,
  maxElements: PROFILE_MAX_ELEMENTS,
  rawDepthLimit: RAW_SKELETON_DEPTH_LIMIT,
};

/** Policy-free material returned from inside the page. */
export interface RawStructuralSignals {
  /** `depth:tag` preorder tokens, depth ≤ `rawDepthLimit`, noise removed. */
  skeletonTokens: string;
  /** `depth:tag` preorder tokens over the landmark-only tree (no depth limit). */
  landmarkTokens: string;
  /** Occurrences per lower-cased tag name across the whole profile walk. */
  tagCounts: Record<string, number>;
  /** Elements visited by the profile walk (excludes ignored / opaque subtrees). */
  elementCount: number;
  /** Deepest element depth reached by the profile walk (`html` = 0). */
  maxDepth: number;
  /** True if the walk hit `maxElements` (profile is partial). */
  truncated: boolean;
}

/**
 * Runs in the browser. Keep dependency-free and self-contained.
 *
 * One traversal produces everything: the depth-capped skeleton token stream, the
 * landmark token stream, per-tag counts, element count and max depth. Text
 * nodes, attribute values and computed styles are never read — only tag names
 * and nesting, so page content cannot leak into a structural signature.
 */
export function collectStructuralRawInBrowser(
  config: StructuralRawConfig,
): RawStructuralSignals {
  const { ignoredTags, opaqueTags, landmarkTags, maxElements, rawDepthLimit } =
    config;
  const ignored = new Set(ignoredTags);
  const opaque = new Set(opaqueTags);
  const landmarks = new Set(landmarkTags);

  const skeleton: string[] = [];
  const landmarkStream: string[] = [];
  const tagCounts: Record<string, number> = {};
  let elementCount = 0;
  let maxDepth = 0;
  let truncated = false;

  const walk = (el: Element, depth: number, landmarkDepth: number): void => {
    if (elementCount >= maxElements) {
      truncated = true;
      return;
    }
    const tag = el.tagName.toLowerCase();
    if (ignored.has(tag)) return;

    elementCount++;
    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    if (depth > maxDepth) maxDepth = depth;
    if (depth <= rawDepthLimit) skeleton.push(depth + ":" + tag);

    let nextLandmarkDepth = landmarkDepth;
    if (landmarks.has(tag)) {
      landmarkStream.push(landmarkDepth + ":" + tag);
      nextLandmarkDepth = landmarkDepth + 1;
    }

    if (opaque.has(tag)) return;

    const children = el.children;
    for (let i = 0; i < children.length; i++) {
      if (elementCount >= maxElements) {
        truncated = true;
        break;
      }
      walk(children[i], depth + 1, nextLandmarkDepth);
    }
  };
  walk(document.documentElement, 0, 0);

  return {
    skeletonTokens: skeleton.join(","),
    landmarkTokens: landmarkStream.join(","),
    tagCounts,
    elementCount,
    maxDepth,
    truncated,
  };
}

// ---------------------------------------------------------------- semantic categories

/**
 * Deterministic tag → category map. Used for the tag histogram (and available as
 * an alternative skeleton label mode). Anything unmapped becomes `other`, so a
 * custom element never silently joins an existing category.
 */
export const TAG_CATEGORY: Readonly<Record<string, string>> = {
  header: "landmark",
  nav: "landmark",
  main: "landmark",
  aside: "landmark",
  footer: "landmark",

  article: "content",
  section: "content",

  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",

  p: "text",
  blockquote: "text",
  pre: "text",

  a: "link",
  button: "action",

  form: "form",
  input: "field",
  select: "field",
  textarea: "field",
  label: "field",

  ul: "list",
  ol: "list",
  dl: "list",
  li: "listitem",
  dt: "listitem",
  dd: "listitem",

  table: "table",
  thead: "table",
  tbody: "table",
  tfoot: "table",
  tr: "row",
  td: "cell",
  th: "cell",

  img: "media",
  picture: "media",
  video: "media",
  audio: "media",
  svg: "media",
  canvas: "media",
  iframe: "media",

  dialog: "dialog",

  div: "container",
  span: "container",
};

/** Fixed category order — the histogram always serializes all of them. */
export const HISTOGRAM_CATEGORIES: readonly string[] = [
  "landmark",
  "content",
  "heading",
  "text",
  "link",
  "action",
  "form",
  "field",
  "list",
  "listitem",
  "table",
  "row",
  "cell",
  "media",
  "dialog",
  "container",
  "other",
];

/** Map one lower-cased tag to its category (`other` when unmapped). */
export function categoryOf(tag: string): string {
  return TAG_CATEGORY[tag] ?? "other";
}

/**
 * Deterministic count buckets — upper bound of each bucket, last bucket open.
 *
 *   0 → 0 | 1 → 1 | 2 → 2 | 3-4 → 3 | 5-8 → 4 | 9-16 → 5 | 17-32 → 6 | 33+ → 7
 *
 * Exact tag counts track content length far too closely (an article with 12
 * paragraphs and one with 14 are the same template). Doubling buckets keep small
 * counts — where a difference really is structural, e.g. 1 `<main>` vs 2 — sharp,
 * and go progressively blunter as counts grow. ONE global policy; no per-site
 * threshold anywhere.
 */
export const HISTOGRAM_BUCKET_BOUNDS: readonly number[] = [0, 1, 2, 4, 8, 16, 32];

/** Bucket index for a count (see {@link HISTOGRAM_BUCKET_BOUNDS}). */
export function bucketOf(count: number): number {
  for (let i = 0; i < HISTOGRAM_BUCKET_BOUNDS.length; i++) {
    if (count <= HISTOGRAM_BUCKET_BOUNDS[i]) return i;
  }
  return HISTOGRAM_BUCKET_BOUNDS.length;
}

// ---------------------------------------------------------------- skeleton policy

/**
 * How the raw token stream becomes a skeleton signature.
 *
 *  - `depthCap`  : deepest level kept, counted from `<html>` (0). `<body>` is 1,
 *                  so a cap of N leaves N-1 levels of page structure.
 *  - `labelMode` : `tag` keeps the real tag name (headings collapse to `h`);
 *                  `category` replaces it with {@link TAG_CATEGORY}.
 *  - `repeat`    : how repeated sibling shapes collapse — `dedupe` keeps one of
 *                  each distinct shape, `marker` also records "there were ≥2"
 *                  with a `*` suffix.
 *
 * There is exactly ONE production policy ({@link SKELETON_POLICY}). The type is
 * parameterized only so the alternatives could be measured against real sites
 * before choosing; nothing branches per site at runtime.
 */
export interface SkeletonPolicy {
  depthCap: number;
  labelMode: "tag" | "category";
  repeat: "dedupe" | "marker";
}

/**
 * The global skeleton policy. Every combination of `depthCap` 4–8 × `labelMode`
 * × `repeat` was measured against all 112 verified URLs of the four Task 07
 * sites before these values were fixed (full table in the Task 08 report):
 *
 *  - `depthCap: 6` — `<html>`→`<body>`→page wrapper→landmark→block→child. Every
 *    neighbour is measurably worse. Shallower stops seeing the page: at cap 4 a
 *    single key covered 15 seoworld pages spanning four route scopes (`/blog`
 *    654 elements together with `/domains/*` at 71 — a 9.2× spread), and at cap
 *    5 `/services/*` (97) still collided with `/tools/*` (141–388) and `/blog`
 *    (654) with `/services` (84). Deeper stops seeing the template: at cap 7 the
 *    known-repeated MDN reference groups stopped collapsing at all (`Errors/*`
 *    3 pages → 3 keys) because per-page content structure begins there, and at
 *    cap 8 only 77 of 112 URLs shared a key with anything.
 *  - `labelMode: "tag"` — categories were never better and were sometimes
 *    coarser (cap 5: 15 distinct keys vs 17, with more cross-scope collisions).
 *    Real tag names are also simpler to read when debugging a family.
 *  - `repeat: "dedupe"` — a template with 3 cards and one with 8 cards is the
 *    same template. The `marker` variant scored no safer on any site and lost
 *    recall (seoworld `/tools/*`: 7 keys vs 6), because a `*` suffix re-adds the
 *    1-vs-many count sensitivity this signal exists to remove.
 */
export const SKELETON_POLICY: SkeletonPolicy = {
  depthCap: 6,
  labelMode: "tag",
  repeat: "dedupe",
};

/** A node of the reconstructed skeleton tree. */
interface SkeletonNode {
  tag: string;
  children: SkeletonNode[];
}

/**
 * Rebuild the tree from a `depth:tag` preorder stream. A preorder walk plus each
 * node's depth determines the tree uniquely, so this is lossless for everything
 * the stream kept.
 */
export function parseTokenTree(tokens: string): SkeletonNode[] {
  if (tokens.length === 0) return [];
  const roots: SkeletonNode[] = [];
  const stack: SkeletonNode[] = [];
  for (const token of tokens.split(",")) {
    const sep = token.indexOf(":");
    if (sep < 0) continue;
    const depth = Number(token.slice(0, sep));
    const tag = token.slice(sep + 1);
    if (!Number.isInteger(depth) || depth < 0) continue;
    const node: SkeletonNode = { tag, children: [] };
    stack.length = Math.min(stack.length, depth);
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return roots;
}

/** Skeleton label for a tag under the given policy. */
function labelOf(tag: string, policy: SkeletonPolicy): string {
  if (policy.labelMode === "category") return categoryOf(tag);
  // Heading level is a content decision (h2 vs h3 for the same section), not a
  // layout one, so all headings share one label in `tag` mode too.
  return /^h[1-6]$/.test(tag) ? "h" : tag;
}

/**
 * Collapse repeated sibling shapes.
 *
 * Deduplicating by the child's ALREADY-SERIALIZED form (not by tag) means
 * `li(a)` and `li(a,span)` stay distinct while five identical `li(a)` collapse
 * to one. First-appearance order is preserved, so `p,ul,p` does not become
 * `p,ul` — only genuine repetition disappears. The result is idempotent and
 * independent of how many times a shape occurred, which is the whole point:
 * three related cards and eight related cards are one template.
 */
function collapseRepeats(
  serialized: readonly string[],
  policy: SkeletonPolicy,
): string[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const s of serialized) {
    const seen = counts.get(s);
    if (seen === undefined) {
      counts.set(s, 1);
      order.push(s);
    } else {
      counts.set(s, seen + 1);
    }
  }
  if (policy.repeat === "dedupe") return order;
  return order.map((s) => ((counts.get(s) as number) > 1 ? `${s}*` : s));
}

/** Serialize one node (and its kept descendants) under the policy. */
function serializeNode(
  node: SkeletonNode,
  depth: number,
  policy: SkeletonPolicy,
): string {
  const label = labelOf(node.tag, policy);
  if (depth >= policy.depthCap || node.children.length === 0) return label;
  const children = collapseRepeats(
    node.children.map((c) => serializeNode(c, depth + 1, policy)),
    policy,
  );
  return children.length === 0 ? label : `${label}(${children.join(",")})`;
}

/** Serialize a token stream into a normalized skeleton string. */
export function serializeSkeleton(
  tokens: string,
  policy: SkeletonPolicy,
): string {
  const roots = parseTokenTree(tokens);
  return collapseRepeats(
    roots.map((r) => serializeNode(r, 0, policy)),
    policy,
  ).join(",");
}

/**
 * Serialize the landmark tree. Same repeat collapsing (a list page with twelve
 * `<article>` children must look like the template it is), but no depth cap and
 * no label mapping — the landmark tag set is already small and fixed.
 */
export function serializeLandmarks(tokens: string): string {
  const policy: SkeletonPolicy = {
    depthCap: Number.MAX_SAFE_INTEGER,
    labelMode: "tag",
    repeat: "dedupe",
  };
  const roots = parseTokenTree(tokens);
  return collapseRepeats(
    roots.map((r) => serializeNode(r, 0, policy)),
    policy,
  ).join(",");
}

/** Category → bucket map, in the fixed {@link HISTOGRAM_CATEGORIES} order. */
export function buildHistogramBuckets(
  tagCounts: Readonly<Record<string, number>>,
): Record<string, number> {
  const perCategory = new Map<string, number>();
  for (const category of HISTOGRAM_CATEGORIES) perCategory.set(category, 0);
  for (const [tag, count] of Object.entries(tagCounts)) {
    const category = categoryOf(tag);
    perCategory.set(category, (perCategory.get(category) ?? 0) + count);
  }
  const buckets: Record<string, number> = {};
  for (const category of HISTOGRAM_CATEGORIES) {
    buckets[category] = bucketOf(perCategory.get(category) ?? 0);
  }
  return buckets;
}

/**
 * The coarsest possible reading of the histogram: which element *kinds* the page
 * contains at all, ignoring how many. Because `bucketOf(0) === 0` and every
 * non-zero count buckets above 0, this is read straight off the stored
 * `histogramBuckets` — there is no second bucketing policy to keep in sync.
 *
 * Used as a family guard. The full `tagHistogramHash` was measured as a merge
 * condition and rejected: it collapses domainchecker's 17 blog posts from 2
 * structural groups into 13 (a single category crossing one bucket boundary
 * breaks the match) while catching nothing the other guards missed. Presence
 * carries the part that is actually about page kind — "this one has a form and
 * that one does not" — and is stable against content volume.
 */
export function histogramPresenceKey(profile: {
  histogramBuckets: Readonly<Record<string, number>>;
}): string {
  return HISTOGRAM_CATEGORIES.map((c) =>
    (profile.histogramBuckets[c] ?? 0) > 0 ? "1" : "0",
  ).join("");
}

// ---------------------------------------------------------------- profile assembly

const count = z.number().int().nonnegative();

/** Landmark-element counts (raw, un-bucketed — for review and debugging). */
export const LandmarkCountsSchema = z.object({
  header: count,
  nav: count,
  main: count,
  article: count,
  section: count,
  aside: count,
  footer: count,
  form: count,
  table: count,
  dialog: count,
});
export type LandmarkCounts = z.infer<typeof LandmarkCountsSchema>;

/** Other structural counts (raw, un-bucketed). */
export const StructuralCountsSchema = z.object({
  heading: count,
  paragraph: count,
  list: count,
  listItem: count,
  link: count,
  button: count,
  input: count,
  image: count,
  media: count,
});
export type StructuralCounts = z.infer<typeof StructuralCountsSchema>;

/**
 * The coarse structural profile of one page — every field DERIVED from tag
 * names and nesting only, with no AI and no page text.
 *
 * Three independent hashes rather than one "magic" coarse hash, so a family can
 * always be explained after the fact (§ explainability): if two pages are
 * grouped it is visible *which* signals agreed, and if a false merge is found
 * later the offending signal can be identified instead of guessed at.
 *  - `shallowSkeletonHash` : depth-capped, repeat-collapsed tag skeleton.
 *  - `landmarkHash`        : landmark-only nesting signature.
 *  - `tagHistogramHash`    : bucketed per-category tag counts.
 * The raw counts are kept next to the hashes for the same reason.
 */
export const StructuralProfileSchema = z.object({
  shallowSkeletonHash: z.string(),
  landmarkHash: z.string(),
  tagHistogramHash: z.string(),
  /** Elements the profile walk visited (ignored + opaque subtrees excluded). */
  elementCount: count,
  /** Deepest element depth reached by the profile walk (`html` = 0). */
  maxDepth: count,
  landmarkCounts: LandmarkCountsSchema,
  structuralCounts: StructuralCountsSchema,
  /** Category → bucket index; the un-hashed form of `tagHistogramHash`. */
  histogramBuckets: z.record(z.string(), count),
  /** True if the profile walk hit the element cap (profile is partial). */
  truncated: z.boolean().optional(),
});
export type StructuralProfile = z.infer<typeof StructuralProfileSchema>;

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Every hash is domain-separated and carries the policy that produced it, so two
 * profiles computed under different constants can never compare equal by
 * accident — changing a constant necessarily changes the hash rather than
 * silently changing what a match means.
 */
function policyTag(policy: SkeletonPolicy): string {
  return `d${policy.depthCap}/${policy.labelMode}/${policy.repeat}`;
}

const sum = (
  counts: Readonly<Record<string, number>>,
  tags: readonly string[],
): number => tags.reduce((total, tag) => total + (counts[tag] ?? 0), 0);

/**
 * Apply the global policy to raw in-page material and produce the persisted
 * profile. Pure function: same raw signals ⇒ byte-identical profile.
 */
export function buildStructuralProfile(
  raw: RawStructuralSignals,
  policy: SkeletonPolicy = SKELETON_POLICY,
): StructuralProfile {
  const skeleton = serializeSkeleton(raw.skeletonTokens, policy);
  const landmarks = serializeLandmarks(raw.landmarkTokens);
  const histogramBuckets = buildHistogramBuckets(raw.tagCounts);
  const histogramSignature = HISTOGRAM_CATEGORIES.map(
    (c) => `${c}:${histogramBuckets[c]}`,
  ).join(",");

  const c = raw.tagCounts;
  return {
    shallowSkeletonHash: sha256(`skeleton|${policyTag(policy)}\n${skeleton}`),
    landmarkHash: sha256(`landmark|v1\n${landmarks}`),
    tagHistogramHash: sha256(`histogram|v1\n${histogramSignature}`),
    elementCount: raw.elementCount,
    maxDepth: raw.maxDepth,
    landmarkCounts: {
      header: c.header ?? 0,
      nav: c.nav ?? 0,
      main: c.main ?? 0,
      article: c.article ?? 0,
      section: c.section ?? 0,
      aside: c.aside ?? 0,
      footer: c.footer ?? 0,
      form: c.form ?? 0,
      table: c.table ?? 0,
      dialog: c.dialog ?? 0,
    },
    structuralCounts: {
      heading: sum(c, ["h1", "h2", "h3", "h4", "h5", "h6"]),
      paragraph: c.p ?? 0,
      list: sum(c, ["ul", "ol", "dl"]),
      listItem: sum(c, ["li", "dt", "dd"]),
      link: c.a ?? 0,
      button: c.button ?? 0,
      input: sum(c, ["input", "select", "textarea"]),
      image: sum(c, ["img", "picture"]),
      media: sum(c, ["video", "audio", "svg", "canvas", "iframe"]),
    },
    histogramBuckets,
    ...(raw.truncated ? { truncated: true } : {}),
  };
}
