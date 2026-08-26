import type {
  ElementSpecNode,
  SpecNode,
  ViewportPageSpec,
} from "../sitespec/index.js";
import { TEXT_MAX_LEN } from "../observer/types.js";
import type { QaCapturedElement } from "./capture-page.js";
import type { ContentDiffSummary } from "./types.js";

/**
 * Text comparison (items 40, 41).
 *
 * The unit is one element's **direct** text: the concatenation of its immediate
 * text-node children, in document order, RAW. Not trimmed, not
 * whitespace-collapsed, not normalized (item 41) — `<pre>` and the space in
 * `</a> <a>` are both design, and a `trim()` that looks harmless would hide a
 * real reconstruction defect while making the numbers prettier.
 *
 * Two comparisons, computed separately and never merged (item 40):
 *
 *   SiteSpec snapshot text  ↔  clone text          the reconstruction contract
 *   SiteSpec snapshot text  ↔  live original text  source drift
 *
 * The second one cannot use raw equality. A viewport whose `rendered.html` did
 * not align stores the Observer's NORMALIZED, 200-character-capped direct text
 * instead of real text nodes, so a raw comparison against a live page would
 * report drift on every long paragraph in the corpus. Drift therefore compares
 * normalized text, and treats a snapshot value sitting exactly on the cap as a
 * prefix. The clone comparison has no such problem: the clone renders the
 * SiteSpec's own strings, so raw equality is exactly the right test.
 *
 * `<svg>` is excluded from both. Upstream it is an opaque asset (its markup is
 * stored whole and its subtree is never walked), so any text inside it belongs
 * to the asset, not to the content tree.
 */

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The concatenation of a node's direct text children, raw and in order. */
export function directTextOf(
  node: ElementSpecNode,
  byId: ReadonlyMap<string, SpecNode>,
): string {
  let out = "";
  for (const childId of node.childNodeIds) {
    const child = byId.get(childId);
    if (child && child.type === "text") out += child.value;
  }
  return out;
}

export function nodeIndex(viewport: ViewportPageSpec): Map<string, SpecNode> {
  return new Map(viewport.nodes.map((node) => [node.nodeId, node]));
}

export interface ContentMismatch {
  nodeId: string;
  tagName: string;
  kind: "changed" | "missing" | "extra";
  expected: string;
  actual: string;
}

export interface ContentDiffResult {
  summary: ContentDiffSummary;
  /** Sorted by nodeId, capped by the caller when it writes diffs. */
  mismatches: ContentMismatch[];
}

export interface ContentDiffInput {
  viewport: ViewportPageSpec;
  /** SiteSpec element nodes to compare, in document order. */
  nodes: readonly ElementSpecNode[];
  /** nodeId → captured element on the other side. */
  actualByNodeId: ReadonlyMap<string, QaCapturedElement>;
  /** Raw equality (clone) or normalized/prefix equality (live original drift). */
  mode: "raw" | "normalized";
}

/** Compare the SiteSpec's text against a captured side. */
export function diffContent(input: ContentDiffInput): ContentDiffResult {
  const byId = nodeIndex(input.viewport);
  const mismatches: ContentMismatch[] = [];

  let snapshotTextNodes = 0;
  let compared = 0;
  let exactEqual = 0;
  let changed = 0;
  let missing = 0;
  let extra = 0;
  let characterDelta = 0;
  let expectedSequence = "";
  let actualSequence = "";

  for (const node of input.nodes) {
    if (node.tagName === "svg") continue;
    const expected = directTextOf(node, byId);
    const hasExpectedText = expected !== "";
    if (hasExpectedText) snapshotTextNodes++;

    const actualElement = input.actualByNodeId.get(node.nodeId);
    if (!actualElement) {
      if (hasExpectedText) {
        missing++;
        compared++;
        characterDelta += expected.length;
        mismatches.push({
          nodeId: node.nodeId,
          tagName: node.tagName,
          kind: "missing",
          expected,
          actual: "",
        });
      }
      continue;
    }

    const actual = actualElement.rawText;
    const hasActualText = actual !== "";
    if (!hasExpectedText && !hasActualText) continue;

    compared++;
    expectedSequence += expected;
    actualSequence += actual;

    let equal: boolean;
    if (input.mode === "raw") {
      equal = expected === actual;
    } else {
      const expectedNormalized = normalize(expected);
      const actualNormalized = normalize(actual);
      if (expectedNormalized.length >= TEXT_MAX_LEN) {
        // The Observer's cap: the stored value is a prefix of the real text.
        equal = actualNormalized.startsWith(expectedNormalized.slice(0, TEXT_MAX_LEN));
      } else {
        equal = expectedNormalized === actualNormalized;
      }
    }

    if (equal) {
      exactEqual++;
      continue;
    }
    characterDelta += Math.abs(expected.length - actual.length);
    if (!hasExpectedText) {
      extra++;
      mismatches.push({
        nodeId: node.nodeId,
        tagName: node.tagName,
        kind: "extra",
        expected,
        actual,
      });
    } else if (!hasActualText) {
      missing++;
      mismatches.push({
        nodeId: node.nodeId,
        tagName: node.tagName,
        kind: "missing",
        expected,
        actual,
      });
    } else {
      changed++;
      mismatches.push({
        nodeId: node.nodeId,
        tagName: node.tagName,
        kind: "changed",
        expected,
        actual,
      });
    }
  }

  mismatches.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));

  return {
    summary: {
      snapshotTextNodes,
      comparedTextNodes: compared,
      exactEqual,
      changed,
      missing,
      extra,
      characterDelta,
      orderedSequenceEqual:
        input.mode === "raw"
          ? expectedSequence === actualSequence
          : normalize(expectedSequence) === normalize(actualSequence),
      exactRatio: compared === 0 ? 1 : Math.round((exactEqual / compared) * 10_000) / 10_000,
    },
    mismatches,
  };
}
