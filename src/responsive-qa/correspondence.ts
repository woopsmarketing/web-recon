import {
  MIN_TRUSTWORTHY_MATCH_FRACTION,
  MAX_MISSING_TEXT_SAMPLES,
  MAX_STRUCTURAL_PAIR_COMPARISONS,
  MIN_LEAF_SUFFIX_SEGMENTS,
  type CorrespondenceResult,
  type DeltaDistribution,
  type LeafBox,
  type MissingTextResult,
  type SideMeasurement,
} from "./types.js";

/**
 * Cross-side correspondence and the DISTRIBUTION channel (Task 28.6, lane W3).
 *
 * THE PROBLEM. To say "this box is 280 px to the left of where it should be"
 * you must first say WHICH box. Node ids cannot do it: the reconstruction
 * strips the source's `class` and `data-*` identity, so there is no shared
 * handle between the two DOMs. Task 28.5C's probe assumed there was (it queried
 * `[data-plan]`), which is why its layout numbers were source-only.
 *
 * THE KEY, stated plainly so a reviewer can attack it:
 *
 *   pass 1  `t:<normalized visible text>`  — text-bearing leaves. Text is
 *           CONTENT, and content is exactly what a reconstruction preserves,
 *           so this is the strongest available handle.
 *   pass 2  `i:<tag>|<alt/aria-label/title>` — labelled image leaves. Same
 *           argument: the label is content.
 *   pass 3  `p:` leaves — everything left over, mostly unlabelled icons,
 *           matched on the SUFFIX of the tag path.
 *
 * PASS 3 WAS DEAD CODE AND IS NOT ANY MORE (Task 28.6, item C3.4). It used to
 * require the whole tag path to be equal, and it matched exactly ZERO nodes on
 * all ten pairs of this harness's own evidence run — because the generator
 * wraps the source subtree in its own shell, so every clone path carries a
 * prefix the source path does not. Worse, the leaves it failed to cover stayed
 * in `matchedFraction`'s denominator, which made that number a function of how
 * many unlabelled icons a page happens to draw. On linear.app/pricing @1440,
 * 316 of the source's 520 leaves are unlabelled images, and the reported 39.2 %
 * match was hiding the fact that 202 of 202 text leaves had matched.
 *
 * The fix is the key `compareColumns` already uses successfully one level up:
 * the longest common path SUFFIX, which is exactly the part of the path the
 * wrapper cannot touch. It is still the weakest of the three keys and it is
 * still reported separately.
 *
 * A key that occurs more than once on a side is matched in DOCUMENT ORDER, up
 * to `min(count_source, count_clone)`, and every such pair is counted in
 * `ambiguousPairs`. That is the honest way to handle repeated labels ("Learn
 * more") without either discarding them or pretending they are unique. Every
 * pass-3 pair is ambiguous by construction, because a shared path suffix is a
 * shape, not an identity.
 *
 * `matchedFraction` travels with every distribution number, and so does
 * `matchedFractionOfContentKeyed` — the same count over only the leaves that
 * carry a content key. THAT is the one `trustworthy` reads: below
 * `MIN_TRUSTWORTHY_MATCH_FRACTION` the distribution is still RECORDED but the
 * rubric refuses to raise severity from it, because a number computed over a
 * minority of the page's content is not a measurement of the page.
 */

function namespaceOf(key: string): string {
  const colon = key.indexOf(":");
  return colon === -1 ? "?" : key.slice(0, colon);
}

/** Sorted-ascending percentile by nearest rank. `values` is mutated-safe. */
function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(
    values.length - 1,
    Math.max(0, Math.ceil(fraction * values.length) - 1),
  );
  return values[index]!;
}

function distributionOf(deltas: number[]): DeltaDistribution {
  const sorted = deltas.slice().sort((a, b) => a - b);
  return {
    samples: sorted.length,
    median: sorted.length === 0 ? 0 : percentile(sorted, 0.5),
    p90: sorted.length === 0 ? 0 : percentile(sorted, 0.9),
    max: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
  };
}

function groupByKey(leaves: readonly LeafBox[]): Map<string, LeafBox[]> {
  const groups = new Map<string, LeafBox[]>();
  for (const leaf of leaves) {
    const bucket = groups.get(leaf.key);
    if (bucket) bucket.push(leaf);
    else groups.set(leaf.key, [leaf]);
  }
  return groups;
}

/**
 * Match the two leaf sets and summarise the horizontal deltas.
 *
 * Deltas are ABSOLUTE (|clone − source|): the question is "how far out of
 * place", not "which way". Both the left edge and the right edge are reported,
 * because a box can be correctly positioned and the wrong width, or the right
 * width in the wrong place, and the two failures need different fixes.
 */
/** `p:<tag>|<a/b/c>` → `["a","b","c"]`; anything else → `[]`. */
function pathSegmentsOf(key: string): string[] {
  const bar = key.indexOf("|");
  if (bar === -1) return [];
  return key.slice(bar + 1).split("/");
}

/** `p:<tag>|…` → `<tag>`. */
function tagOf(key: string): string {
  const colon = key.indexOf(":");
  const bar = key.indexOf("|");
  if (colon === -1 || bar === -1 || bar < colon) return "";
  return key.slice(colon + 1, bar);
}

function sharedSuffix(a: readonly string[], b: readonly string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) {
    n++;
  }
  return n;
}

/**
 * ITEM G3. The horizontal-position channel had TWO populations in it.
 *
 * MEASURED on gs.severance.healthcare: on the carousel-bearing homepage
 * `position-delta-p90-px` read 4,623-5,232 px at the five widths, 3-13x the
 * viewport — because the SOURCE's four `slick` tracks park their non-active
 * slides out at x = 6,100-6,888 while the clone's stop at 540-1,680. On the
 * carousel-free route the same channel read 0-943 px with a median of 0 px at
 * three of the five widths. A channel that reports thousands of pixels because
 * the source parks off-screen carousel slides is measuring the SOURCE's
 * carousel, not the clone's fidelity, and the number it prints — "9 in 10
 * matched boxes land within 5,232 px of their source edge" — is not true of
 * anything a reader can see.
 *
 * THE SPLIT. A pair whose SOURCE box begins at or past the viewport's right
 * edge is parked off-viewport BY THE SOURCE: where exactly the source's own
 * off-screen track puts it is not a fidelity requirement. Those pairs are
 * measured, reported as their own distribution, counted — and kept OUT of the
 * channel that fires. Everything else stays in, including the case that matters
 * most: a box the source paints ON screen that the clone throws off it, which
 * is why the test reads the SOURCE side and never the clone's.
 *
 * The threshold is the probe's own off-screen test (`rect.left >= innerWidth −
 * 1`), so the two agree by construction. Nothing is skipped silently: the
 * excluded population has a pair count, a distribution and a channel of its own.
 */
function isParkedOffViewport(box: LeafBox, innerWidth: number): boolean {
  return innerWidth > 0 && box.left >= innerWidth - 1;
}

export function correspond(
  source: Pick<SideMeasurement, "leaves" | "innerWidth">,
  clone: Pick<SideMeasurement, "leaves">,
): CorrespondenceResult {
  const leftDeltas: number[] = [];
  const rightDeltas: number[] = [];
  const onViewportLeftDeltas: number[] = [];
  const onViewportRightDeltas: number[] = [];
  const offViewportLeftDeltas: number[] = [];
  const offViewportRightDeltas: number[] = [];
  let matchedPairs = 0;
  let contentKeyedMatchedPairs = 0;
  let ambiguousPairs = 0;
  const record = (
    a: LeafBox,
    b: LeafBox,
    ambiguous: boolean,
    contentKeyed: boolean,
  ): void => {
    const left = Math.abs(b.left - a.left);
    const right = Math.abs(b.right - a.right);
    leftDeltas.push(left);
    rightDeltas.push(right);
    if (isParkedOffViewport(a, source.innerWidth)) {
      offViewportLeftDeltas.push(left);
      offViewportRightDeltas.push(right);
    } else {
      onViewportLeftDeltas.push(left);
      onViewportRightDeltas.push(right);
    }
    matchedPairs++;
    if (contentKeyed) contentKeyedMatchedPairs++;
    if (ambiguous) ambiguousPairs++;
  };

  // -- passes 1 and 2: exact CONTENT keys (`t:` text, `i:` labelled image) ---
  const contentSource = source.leaves.filter((leaf) => leaf.key.charAt(0) !== "p");
  const contentClone = clone.leaves.filter((leaf) => leaf.key.charAt(0) !== "p");
  const sourceGroups = groupByKey(contentSource);
  const cloneGroups = groupByKey(contentClone);
  const perNamespace = new Map<string, number>();

  // Deterministic: iterate the source's keys in sorted order.
  for (const key of Array.from(sourceGroups.keys()).sort()) {
    const sourceBoxes = sourceGroups.get(key)!;
    const cloneBoxes = cloneGroups.get(key);
    if (!cloneBoxes) continue;
    const pairs = Math.min(sourceBoxes.length, cloneBoxes.length);
    const ambiguous = sourceBoxes.length > 1 || cloneBoxes.length > 1;
    for (let i = 0; i < pairs; i++) {
      record(sourceBoxes[i]!, cloneBoxes[i]!, ambiguous, true);
    }
    const namespace = namespaceOf(key);
    perNamespace.set(namespace, (perNamespace.get(namespace) ?? 0) + pairs);
  }

  // -- pass 3: STRUCTURAL, for leaves that carry no content key --------------
  //
  // Item C3.4. The first cut keyed these on the FULL tag path, which matched
  // exactly 0 nodes on all ten pairs of the harness's own evidence run, because
  // the generator wraps the source subtree in its own shell and every clone
  // path therefore carries a prefix the source path does not. The pass was dead
  // code, and the unmatchable leaves it was supposed to cover were still in
  // `matchedFraction`'s denominator — so a page's unlabelled-icon count, and
  // nothing else, decided how trustworthy its position channels looked.
  //
  // The suffix is the part of the path the wrapper cannot touch, so it is the
  // key. Pairing is greedy longest-suffix-first within a tag group and
  // one-to-one, which is deterministic and refuses to invent a second use of a
  // leaf it has already spent.
  const unlabelledSource = source.leaves.filter((leaf) => leaf.key.charAt(0) === "p");
  const unlabelledClone = clone.leaves.filter((leaf) => leaf.key.charAt(0) === "p");
  let unlabelledMatchedPairs = 0;
  let structuralPassTruncated = false;
  {
    const byTag = new Map<string, { source: number[]; clone: number[] }>();
    for (let i = 0; i < unlabelledSource.length; i++) {
      const tag = tagOf(unlabelledSource[i]!.key);
      const bucket = byTag.get(tag) ?? { source: [], clone: [] };
      bucket.source.push(i);
      byTag.set(tag, bucket);
    }
    for (let j = 0; j < unlabelledClone.length; j++) {
      const tag = tagOf(unlabelledClone[j]!.key);
      const bucket = byTag.get(tag);
      if (bucket) bucket.clone.push(j);
    }
    const sourcePaths = unlabelledSource.map((leaf) => pathSegmentsOf(leaf.key));
    const clonePaths = unlabelledClone.map((leaf) => pathSegmentsOf(leaf.key));
    const usedSource = new Set<number>();
    const usedClone = new Set<number>();
    let budget = MAX_STRUCTURAL_PAIR_COMPARISONS;
    for (const tag of Array.from(byTag.keys()).sort()) {
      const bucket = byTag.get(tag)!;
      if (bucket.clone.length === 0) continue;
      const candidates: { suffix: number; source: number; clone: number }[] = [];
      for (const i of bucket.source) {
        for (const j of bucket.clone) {
          if (budget <= 0) {
            structuralPassTruncated = true;
            break;
          }
          budget--;
          const suffix = sharedSuffix(sourcePaths[i]!, clonePaths[j]!);
          if (suffix >= MIN_LEAF_SUFFIX_SEGMENTS) {
            candidates.push({ suffix, source: i, clone: j });
          }
        }
        if (structuralPassTruncated) break;
      }
      candidates.sort(
        (a, b) => b.suffix - a.suffix || a.source - b.source || a.clone - b.clone,
      );
      for (const candidate of candidates) {
        if (usedSource.has(candidate.source) || usedClone.has(candidate.clone)) continue;
        usedSource.add(candidate.source);
        usedClone.add(candidate.clone);
        // Structural pairs are ambiguous by construction: the key is a shared
        // path suffix, not a unique identity.
        record(
          unlabelledSource[candidate.source]!,
          unlabelledClone[candidate.clone]!,
          true,
          false,
        );
        unlabelledMatchedPairs++;
      }
      if (structuralPassTruncated) break;
    }
  }
  if (unlabelledMatchedPairs > 0) {
    perNamespace.set("p", unlabelledMatchedPairs);
  }

  const sourceLeaves = source.leaves.length;
  const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
  const matchedFraction = sourceLeaves === 0 ? 0 : round4(matchedPairs / sourceLeaves);
  const contentKeyedSourceLeaves = contentSource.length;
  // ITEM C3.11. Both sides of this ratio are now the CONTENT-KEYED population.
  // It used to read `min(1, matchedPairs / contentKeyedSourceLeaves)`, whose
  // numerator included every pass-3 STRUCTURAL pair — a leaf that carries no
  // content key and is therefore not in the denominator at all. The trust gate
  // could then be pushed over its threshold by unlabelled-icon pairings (166 of
  // 492 content leaves reported as 0.3841 against a 0.35 gate on this harness's
  // own evidence run), and the `min(1, …)` cap fired silently on 4 of 10 pairs,
  // reporting 1.00 where the measured values were 0.9344 / 0.9451 / 0.9488 /
  // 0.9645. Content pairs are one-to-one within the content-keyed leaves, so
  // the ratio cannot exceed 1 and there is nothing left to cap.
  const matchedFractionOfContentKeyed =
    contentKeyedSourceLeaves === 0
      ? 0
      : round4(contentKeyedMatchedPairs / contentKeyedSourceLeaves);

  const PASS_LABEL: Record<string, string> = {
    t: "1 exact visible-text key",
    i: "2 exact labelled-image key",
    p: "3 structural tag-path suffix",
  };
  const leftDelta = distributionOf(leftDeltas);
  const rightDelta = distributionOf(rightDeltas);
  const onViewportLeftDelta = distributionOf(onViewportLeftDeltas);
  const onViewportRightDelta = distributionOf(onViewportRightDeltas);
  const offViewportLeftDelta = distributionOf(offViewportLeftDeltas);
  const offViewportRightDelta = distributionOf(offViewportRightDeltas);

  return {
    sourceLeaves,
    cloneLeaves: clone.leaves.length,
    matchedPairs,
    matchedFraction,
    contentKeyedSourceLeaves,
    unlabelledSourceLeaves: unlabelledSource.length,
    contentKeyedMatchedPairs,
    matchedFractionOfContentKeyed,
    unlabelledMatchedPairs,
    ambiguousPairs,
    // Item C3.4: the trust gate reads the CONTENT-keyed fraction. How much of a
    // page's content the distribution covers is a statement about the
    // reconstruction; how many unlabelled icons the page draws is not.
    trustworthy: matchedFractionOfContentKeyed >= MIN_TRUSTWORTHY_MATCH_FRACTION,
    leftDelta,
    rightDelta,
    onViewportLeftDelta,
    onViewportRightDelta,
    offViewportLeftDelta,
    offViewportRightDelta,
    sourceInnerWidth: source.innerWidth,
    onViewportMatchedPairs: onViewportLeftDeltas.length,
    offViewportMatchedPairs: offViewportLeftDeltas.length,
    // ITEM G3: the channel that FIRES reads the on-viewport population only.
    positionDeltaP90: Math.max(onViewportLeftDelta.p90, onViewportRightDelta.p90),
    // The pre-G3 number, kept so a v2 artifact and a v3 artifact of the same
    // pair can still be compared on this channel.
    positionDeltaP90AllPairs: Math.max(leftDelta.p90, rightDelta.p90),
    offViewportPositionDeltaP90: Math.max(
      offViewportLeftDelta.p90,
      offViewportRightDelta.p90,
    ),
    passes: Array.from(perNamespace.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([namespace, matched]) => ({
        namespace,
        pass: PASS_LABEL[namespace] ?? namespace,
        matched,
      })),
    structuralPassTruncated,
  };
}

/**
 * Source visible text the clone does not paint (item C3.10).
 *
 * THREE WRONG-VALUE PATHS WERE REPAIRED HERE, and all three under-reported.
 * For a gate whose primary BLOCKER signal this is, under-reporting is the
 * FALSE-PASS direction — the earlier docstring called it "the conservative
 * direction", which had it exactly backwards.
 *
 *   (i)   NUMERATOR AND DENOMINATOR WERE DIFFERENT POPULATIONS. The numerator
 *         summed DISTINCT truncated keys; `sourceVisibleChars` counted every
 *         OCCURRENCE at full length. A 20-character string painted 40 times and
 *         dropped entirely reported a ratio of 0.02 when 80 % of the painted
 *         characters were gone — 40x understated, and a 0.1 BLOCKER band that
 *         could never be reached. Both sides now come out of the same census:
 *         `sum(entry.chars) === visibleTextChars` by construction.
 *
 *   (ii)  LENGTHS WERE TRUNCATED. `missingChars += candidate.length` used the
 *         120-character KEY, so a dropped 1,000-character paragraph contributed
 *         120 — 8.3x understated. The census now carries the untruncated total
 *         beside the key, and `truncatedSourceKeys` counts the keys whose
 *         containment test still runs on a prefix.
 *
 *   (iii) CONTAINMENT COLLIDED INSIDE WORDS. `haystack.indexOf("us")` succeeds
 *         on "customers", so the source's "US" currency prefix read PRESENT on
 *         a pair where the clone demonstrably drops it. The test now requires a
 *         TOKEN BOUNDARY on any edge of the candidate that is alphanumeric.
 *
 * CONTAINMENT, NOT SET DIFFERENCE, is still the test: a reconstruction
 * routinely renders `Start building today` where the source painted
 * `Start building`, and set difference would call that missing. What changed is
 * that containment must now land on a boundary, and that the clone's strings
 * are joined by a separator no key can contain — a match may not straddle two
 * clone strings, because their adjacency in this haystack is an artefact of the
 * census's sort order and not a fact about the page.
 *
 * BOTH READINGS ARE REPORTED. `absentChars` is the loose reading (the key is
 * not in the clone even as a raw substring); `missingChars` is the strict one
 * (not there at a boundary); `boundaryOnlyChars` is the difference. The rubric
 * fires on the strict number, and a reader who wants the loose one can have it
 * without re-running anything.
 */

/** A letter or a digit in any script. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

function isWordChar(ch: string): boolean {
  return ch.length > 0 && WORD_CHAR.test(ch);
}

/**
 * Scripts written WITHOUT an orthographic word separator (item G2).
 *
 * The boundary rule below exists to stop `us` matching inside `customers`. That
 * rule is a statement about scripts that put a space at a word edge, and it is
 * FALSE for the scripts named here: Korean attaches particles (조사) and
 * compounds with no space, Chinese and Japanese never space words at all, and
 * Thai, Lao, Khmer and Burmese space phrases rather than words. Requiring a
 * boundary at such an edge turns "the clone rendered a longer string containing
 * the source's" — the case the rule was written to FORGIVE — into a total
 * deletion.
 *
 * MEASURED against the shipped `missingText()` on Korean text taken from a real
 * pilot corpus (seoultone.kr, 73.3 % hangul): English `start building` inside a
 * clone's `start building today` scored 0.00 % strict, while the identical
 * shape in Korean scored 100.00 % strict — `진료시간` inside `진료시간안내`, the
 * particle case `서울톤`/`서울톤은`, the compound-head case `피부과`/`서울톤피부과`
 * and the verbaliser case `예약`/`예약하기` all read as complete deletions of the
 * source string. The strict number is what raises a BLOCKER, so on a CJK source
 * a reconstruction that restructures a subtree and re-segments its text nodes
 * would be graded for a defect it does not have.
 *
 * This names SCRIPTS, never a site, a host or a language setting: the same code
 * runs on every source and asks only what the characters are.
 */
const BOUNDARYLESS_SCRIPT =
  /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

function isBoundarylessScript(ch: string): boolean {
  return ch.length > 0 && BOUNDARYLESS_SCRIPT.test(ch);
}

/**
 * Whether an edge of the needle demands a token boundary in the haystack.
 *
 * `edge` is the needle's own outermost character, `neighbour` the haystack
 * character just outside the match.
 *
 *   - a non-alphanumeric edge demands nothing: `$10` may be found inside
 *     `US$10`, exactly as before;
 *   - an edge in a boundaryless script demands nothing, because that script has
 *     no orthographic boundary to demand;
 *   - otherwise a boundary is demanded, and it is satisfied by a
 *     non-alphanumeric neighbour OR by a neighbour in a boundaryless script,
 *     since a change of script IS a token boundary (`us` next to `고객` is two
 *     tokens; `us` next to `tomers` is one).
 */
function edgeSatisfied(edge: string, neighbour: string): boolean {
  if (!isWordChar(edge)) return true;
  if (isBoundarylessScript(edge)) return true;
  if (!isWordChar(neighbour)) return true;
  return isBoundarylessScript(neighbour);
}

/** The pre-G2, English-only reading of the same edge test. Kept so the run can
 *  COUNT what the script-aware rule changed instead of shifting the number
 *  silently; see `scriptRelaxedChars`. */
function edgeSatisfiedSpacedOnly(edge: string, neighbour: string): boolean {
  if (!isWordChar(edge)) return true;
  return !isWordChar(neighbour);
}

/**
 * `needle` occurs in `haystack` at a token boundary.
 *
 * Every occurrence is tried, not just the first. `edgeTest` is the per-edge
 * rule: {@link edgeSatisfied} is the shipped, script-aware one, and
 * {@link edgeSatisfiedSpacedOnly} is the English-only one the caller runs
 * alongside it purely to count the difference.
 */
function containsAtBoundary(
  haystack: string,
  needle: string,
  edgeTest: (edge: string, neighbour: string) => boolean = edgeSatisfied,
): boolean {
  if (needle.length === 0) return true;
  const leftEdge = needle.charAt(0);
  const rightEdge = needle.charAt(needle.length - 1);
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : haystack.charAt(at - 1);
    const after = haystack.charAt(at + needle.length);
    if (edgeTest(leftEdge, before) && edgeTest(rightEdge, after)) return true;
    from = at + 1;
  }
}

/** The separator between two clone strings in the haystack. Normalized keys
 *  collapse every whitespace run to a single space, so a newline can never
 *  occur inside one and a match can never straddle two of them. */
const HAYSTACK_SEPARATOR = "\n";

export function missingText(
  source: Pick<SideMeasurement, "visibleTextEntries" | "visibleTextChars">,
  clone: Pick<SideMeasurement, "visibleTextEntries">,
): MissingTextResult {
  const haystack =
    HAYSTACK_SEPARATOR +
    clone.visibleTextEntries.map((entry) => entry.key).join(HAYSTACK_SEPARATOR) +
    HAYSTACK_SEPARATOR;
  const missing: string[] = [];
  let missingChars = 0;
  let missingOccurrences = 0;
  let absentChars = 0;
  let absentOccurrences = 0;
  let absentStringCount = 0;
  let boundaryOnlyChars = 0;
  let boundaryOnlyStringCount = 0;
  let scriptRelaxedChars = 0;
  let scriptRelaxedStringCount = 0;
  let sourceOccurrences = 0;
  let truncatedSourceKeys = 0;

  for (const entry of source.visibleTextEntries) {
    sourceOccurrences += entry.occurrences;
    if (entry.truncated) truncatedSourceKeys++;
    if (entry.key.length === 0) continue;
    const rawPresent = haystack.indexOf(entry.key) !== -1;
    if (rawPresent && containsAtBoundary(haystack, entry.key)) {
      // ITEM G2. Counted, not silent: this key is PRESENT under the shipped
      // script-aware rule and would have been reported MISSING under the
      // English-only one. On a CJK corpus this is the whole difference between
      // the two readings, and a reader must be able to see its size.
      if (!containsAtBoundary(haystack, entry.key, edgeSatisfiedSpacedOnly)) {
        scriptRelaxedChars += entry.chars;
        scriptRelaxedStringCount++;
      }
      continue;
    }
    missing.push(entry.key);
    missingChars += entry.chars;
    missingOccurrences += entry.occurrences;
    if (rawPresent) {
      boundaryOnlyChars += entry.chars;
      boundaryOnlyStringCount++;
    } else {
      absentChars += entry.chars;
      absentOccurrences += entry.occurrences;
      absentStringCount++;
    }
  }

  const ratioOf = (part: number): number =>
    source.visibleTextChars === 0
      ? 0
      : Math.round((part / source.visibleTextChars) * 10_000) / 10_000;
  const samples = missing
    .slice()
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, MAX_MISSING_TEXT_SAMPLES);

  return {
    sourceVisibleChars: source.visibleTextChars,
    sourceOccurrences,
    sourceStringCount: source.visibleTextEntries.length,
    missingChars,
    missingRatio: ratioOf(missingChars),
    missingOccurrences,
    missingStringCount: missing.length,
    absentChars,
    absentRatio: ratioOf(absentChars),
    absentOccurrences,
    absentStringCount,
    boundaryOnlyChars,
    boundaryOnlyStringCount,
    scriptRelaxedChars,
    scriptRelaxedRatio: ratioOf(scriptRelaxedChars),
    scriptRelaxedStringCount,
    truncatedSourceKeys,
    samples,
  };
}

/**
 * Per-container layout-mode comparison.
 *
 * `maxColumns` alone is too blunt: at linear.app/pricing @1024 both sides
 * report 7, because a seven-logo strip dominates both — while the FOOTER grid
 * wraps to 2 rows of 4 on the source and stays 1 row of 6 on the clone, which
 * is exactly the mode mismatch a reviewer cares about. So containers are
 * matched individually.
 *
 * THE KEY IS THE PATH SUFFIX. The generator wraps the source subtree in its own
 * layout shell, so a clone path is the source path with a fixed prefix bolted
 * on: `div/div/footer/div/div` becomes `div[1]/div/div/div/div/footer/div/div`.
 * Matching on the longest common SUFFIX (minimum two segments) is therefore a
 * structural key that survives the wrapping, and it names no site's markup.
 *
 * It is a heuristic and it is reported as one: `matchedContainers` says how
 * many of the containers under consideration actually paired up, and an
 * unmatched container contributes nothing rather than a fabricated delta.
 */
export interface ColumnContainerMismatch {
  path: string;
  sourceModalPerRow: number;
  cloneModalPerRow: number;
  sourceRowCount: number;
  cloneRowCount: number;
  sourceChildCount: number;
  cloneChildCount: number;
  sourceContainerWidth: number;
  cloneContainerWidth: number;
  delta: number;
}

export interface ColumnComparison {
  sourceMaxColumns: number;
  cloneMaxColumns: number;
  maxColumnsDelta: number;
  sourceContainers: number;
  cloneContainers: number;
  matchedContainers: number;
  /** Largest |modalPerRow difference| over matched containers. */
  worstModeDelta: number;
  /** Matched containers whose column count differs, worst first. */
  mismatches: ColumnContainerMismatch[];
}

const MIN_SUFFIX_SEGMENTS = 2;

function commonSuffixSegments(a: string, b: string): number {
  const left = a.split("/");
  const right = b.split("/");
  let n = 0;
  while (
    n < left.length &&
    n < right.length &&
    left[left.length - 1 - n] === right[right.length - 1 - n]
  ) {
    n++;
  }
  return n;
}

export function compareColumns(
  source: Pick<SideMeasurement, "columnContainers" | "maxColumns">,
  clone: Pick<SideMeasurement, "columnContainers" | "maxColumns">,
): ColumnComparison {
  type Candidate = { suffix: number; sourceIndex: number; cloneIndex: number };
  const candidates: Candidate[] = [];
  for (let i = 0; i < source.columnContainers.length; i++) {
    for (let j = 0; j < clone.columnContainers.length; j++) {
      const suffix = commonSuffixSegments(
        source.columnContainers[i]!.path,
        clone.columnContainers[j]!.path,
      );
      if (suffix >= MIN_SUFFIX_SEGMENTS) {
        candidates.push({ suffix, sourceIndex: i, cloneIndex: j });
      }
    }
  }
  // Longest suffix first; ties broken deterministically by index.
  candidates.sort(
    (a, b) =>
      b.suffix - a.suffix || a.sourceIndex - b.sourceIndex || a.cloneIndex - b.cloneIndex,
  );
  const usedSource = new Set<number>();
  const usedClone = new Set<number>();
  const mismatches: ColumnContainerMismatch[] = [];
  let matchedContainers = 0;
  let worstModeDelta = 0;
  for (const candidate of candidates) {
    if (usedSource.has(candidate.sourceIndex) || usedClone.has(candidate.cloneIndex)) {
      continue;
    }
    usedSource.add(candidate.sourceIndex);
    usedClone.add(candidate.cloneIndex);
    matchedContainers++;
    const a = source.columnContainers[candidate.sourceIndex]!;
    const b = clone.columnContainers[candidate.cloneIndex]!;
    const delta = Math.abs(a.modalPerRow - b.modalPerRow);
    if (delta > worstModeDelta) worstModeDelta = delta;
    if (delta > 0) {
      mismatches.push({
        path: a.path,
        sourceModalPerRow: a.modalPerRow,
        cloneModalPerRow: b.modalPerRow,
        sourceRowCount: a.rowCount,
        cloneRowCount: b.rowCount,
        sourceChildCount: a.childCount,
        cloneChildCount: b.childCount,
        sourceContainerWidth: a.containerWidth,
        cloneContainerWidth: b.containerWidth,
        delta,
      });
    }
  }
  mismatches.sort(
    (a, b) => b.delta - a.delta || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
  return {
    sourceMaxColumns: source.maxColumns,
    cloneMaxColumns: clone.maxColumns,
    maxColumnsDelta: Math.abs(clone.maxColumns - source.maxColumns),
    sourceContainers: source.columnContainers.length,
    cloneContainers: clone.columnContainers.length,
    matchedContainers,
    worstModeDelta,
    mismatches,
  };
}
