import {
  ASPECT_RATIO_TOLERANCE,
  CENTERED_CLONE_RATIO,
  CENTERED_PX,
  EDGE_PX,
  FULL_BLEED_PX,
  H2_EXCESS_PX,
  H4_MIN_INTERSECTION_PX2,
  H5_EXCESS_PX,
  VARIANT_VOTE_MARGIN,
  VARIANT_VOTE_MIN_SHARE,
  relationTolerance,
  type CheckId,
  type NodeReading,
  type PageReading,
  type TrackedNode,
  type VariantId,
  type Violation,
} from "./types.js";

/**
 * Per-sample HARD checks (clone; exempt when the source shows the same
 * condition) and RELATION checks (source vs clone) — brief steps 6–7. Pure.
 */

export interface SampleInput {
  width: number;
  source: PageReading;
  clone: PageReading;
  tracked: ReadonlyMap<string, TrackedNode>;
  /** Keys excluded from x-based relations (motion-unstable on either side). */
  motionUnstable: ReadonlySet<string>;
  /** Keys whose clone text was probed in the source page (aligned with source.found). */
  findTextKeys: readonly string[];
}

export interface SampleAnalysis {
  width: number;
  served: VariantId[];
  sourceVariant: VariantId | "indistinct";
  shares: Record<VariantId, number>;
  treeMismatch: boolean;
  violations: Violation[];
  exemptions: Partial<Record<CheckId, number>>;
  unverifiable: Partial<Record<CheckId, number>>;
  scrollHeightRatio: number | null;
  nodeStatus: { compared: number; matched: number; unmatched: number; ambiguous: number; treeMismatch: number };
  /** Keys compared at this width (served, matched, both sides readable). */
  comparedKeys: string[];
  /**
   * Coverage inputs (review B1): `tracked` = tracked nodes of the served
   * variant(s) (0 on a tree-mismatch sample, which FAILs on its own);
   * `compared` = those whose source AND clone correspondence was established
   * (visible on both, hidden on both, or a visibility disagreement that was
   * judged). `visibleCompared` = nodeStatus.compared.
   */
  coverage: { tracked: number; compared: number; visibleCompared: number };
}

function inc(map: Partial<Record<CheckId, number>>, check: CheckId): void {
  map[check] = (map[check] ?? 0) + 1;
}

export function isFullBleed(node: NodeReading, vw: number): boolean {
  return node.w >= vw - FULL_BLEED_PX && Math.abs(node.x) <= 1;
}

function intersectionArea(a: NodeReading, b: NodeReading): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function isPrefix(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (!a || !b || a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Page-level variant vote: which observed tree does the SOURCE render at W? */
export function sourceVariantVote(
  source: PageReading,
  tracked: ReadonlyMap<string, TrackedNode>,
): { variant: VariantId | "indistinct"; shares: Record<VariantId, number> } {
  const totals: Record<VariantId, number> = { desktop: 0, mobile: 0 };
  const visible: Record<VariantId, number> = { desktop: 0, mobile: 0 };
  for (const node of source.nodes) {
    const t = tracked.get(node.k);
    if (!t) continue;
    totals[t.variant]++;
    if (node.st === "matched" && node.v === 1) visible[t.variant]++;
  }
  const shares: Record<VariantId, number> = {
    desktop: totals.desktop > 0 ? round2(visible.desktop / totals.desktop) : 0,
    mobile: totals.mobile > 0 ? round2(visible.mobile / totals.mobile) : 0,
  };
  let variant: VariantId | "indistinct" = "indistinct";
  if (totals.desktop > 0 && totals.mobile > 0) {
    if (shares.desktop >= VARIANT_VOTE_MIN_SHARE && shares.desktop >= shares.mobile + VARIANT_VOTE_MARGIN) {
      variant = "desktop";
    } else if (shares.mobile >= VARIANT_VOTE_MIN_SHARE && shares.mobile >= shares.desktop + VARIANT_VOTE_MARGIN) {
      variant = "mobile";
    }
  }
  return { variant, shares };
}

const CONTAINER_CATEGORIES = new Set(["a", "b", "d", "e"]);

export function analyzeSample(input: SampleInput): SampleAnalysis {
  const { width, source, clone, tracked, motionUnstable } = input;
  const violations: Violation[] = [];
  const exemptions: Partial<Record<CheckId, number>> = {};
  const unverifiable: Partial<Record<CheckId, number>> = {};
  const T = relationTolerance(width);
  const served = [...clone.served].sort() as VariantId[];
  const vote = sourceVariantVote(source, tracked);
  const treeMismatch =
    vote.variant !== "indistinct" && served.length > 0 && !served.includes(vote.variant);
  const status = { compared: 0, matched: 0, unmatched: 0, ambiguous: 0, treeMismatch: 0 };
  let trackedServed = 0;
  const comparedKeys: string[] = [];
  const add = (v: Violation): void => {
    violations.push(v);
  };

  // H1 — page-level horizontal overflow.
  if (clone.sw > clone.vw + 1) {
    if (source.sw > source.vw + 1) inc(exemptions, "H1");
    else add({ width, check: "H1", key: null, source: source.sw - source.vw, clone: clone.sw - clone.vw });
  }

  if (served.length === 0) {
    add({ width, check: "H7", key: null, source: "rendered", clone: "no-variant-served" });
  }

  if (treeMismatch) {
    add({
      width,
      check: "tree-mismatch",
      key: null,
      source: vote.variant,
      clone: served.join(","),
      detail: `source tree shares desktop=${vote.shares.desktop} mobile=${vote.shares.mobile}`,
    });
  }

  const sourceByKey = new Map(source.nodes.map((node) => [node.k, node]));
  const cloneByKey = new Map(clone.nodes.map((node) => [node.k, node]));
  const foundByKey = new Map<string, boolean>();
  input.findTextKeys.forEach((key, index) => foundByKey.set(key, source.found?.[index] === true));

  interface Pair {
    key: string;
    t: TrackedNode;
    s: NodeReading;
    c: NodeReading;
  }
  const leaves: Pair[] = [];

  if (!treeMismatch) {
    for (const [key, t] of [...tracked.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (!served.includes(t.variant)) continue;
      trackedServed++;
      const c = cloneByKey.get(key);
      const s = sourceByKey.get(key);
      if (!s) continue;
      // H7m — the matched, visible source node has no rendered clone counterpart
      // in the served variant (absent, or present but not rendered). Containers
      // without text are included (plain H7 only covers text/media).
      const cloneMissing = !c || c.st !== "matched";
      if (s.st === "matched" && s.v === 1 && s.w * s.h > 0 && (cloneMissing || c.v === 0)) {
        add({
          width,
          check: "H7m",
          key,
          source: "visible",
          clone: cloneMissing ? (c?.why ?? "clone-node-absent") : "not-rendered",
        });
      }
      if (!c) {
        status.unmatched++;
        continue;
      }
      if (s.st === "tree-mismatch") {
        status.treeMismatch++;
        if (c.v === 1) {
          add({ width, check: "tree-mismatch", key, source: "other-variant-element", clone: t.variant });
        }
        continue;
      }
      if (s.st === "ambiguous") {
        status.ambiguous++;
        continue;
      }
      if (s.st === "unmatched" || c.st !== "matched") {
        status.unmatched++;
        // H8 (unmatched branch): visible clone text that the source page does not show.
        if (c.st === "matched" && c.v === 1 && foundByKey.has(key) && (c.txt ?? "").length > 0) {
          if (!foundByKey.get(key)) {
            add({ width, check: "H8", key, source: "text-absent", clone: (c.txt ?? "").slice(0, 40) });
          }
        }
        continue;
      }
      status.matched++;
      const cats = new Set(t.categories);
      const isContainer = t.categories.some((cat) => CONTAINER_CATEGORIES.has(cat));
      const moving = motionUnstable.has(key);

      // H7 / H8 — visibility disagreement.
      if (s.v === 1 && c.v === 0) {
        if (s.tx === 1 || s.md === 1) add({ width, check: "H7", key, source: 1, clone: 0 });
        continue;
      }
      if (c.v === 1 && s.v === 0) {
        add({ width, check: "H8", key, source: 0, clone: 1 });
        continue;
      }
      if (c.v === 0 && s.v === 0) continue;
      status.compared++;
      comparedKeys.push(key);

      // H2 — text outside its clipping region / the viewport.
      if (!moving && c.h2 !== undefined && c.h2 > H2_EXCESS_PX) {
        if (s.h2 !== undefined && s.h2 > H2_EXCESS_PX) inc(exemptions, "H2");
        else add({ width, check: "H2", key, source: s.h2 ?? null, clone: c.h2 });
      }
      // H3 — clipped text.
      if (c.clip === 1) {
        if (s.clip === 1) inc(exemptions, "H3");
        else add({ width, check: "H3", key, source: s.clip ?? null, clone: 1 });
      }
      // H5 — in-flow element outside its parent's padding box (x axis).
      if (!moving && c.h5 !== undefined && c.h5 !== null && c.h5 > H5_EXCESS_PX) {
        if (s.h5 !== undefined && s.h5 !== null && s.h5 > H5_EXCESS_PX) inc(exemptions, "H5");
        else add({ width, check: "H5", key, source: s.h5 ?? null, clone: c.h5 });
      }

      // R9 — line count of headings / CTA.
      if (cats.has("c") && s.lines !== undefined && c.lines !== undefined && s.lines !== c.lines) {
        const v: Violation = { width, check: "R9", key, source: s.lines, clone: c.lines };
        if (Math.abs(s.lines - c.lines) === 1) v.minor = true;
        add(v);
      }
      // R10 — visible column count.
      if (cats.has("b") && s.cols !== undefined && c.cols !== undefined && s.cols !== c.cols) {
        add({ width, check: "R10", key, source: s.cols, clone: c.cols });
      }
      if (isContainer) {
        // R11 — x/W and w/W.
        if (Math.abs(s.w - c.w) > T) {
          add({ width, check: "R11", key, source: s.w, clone: c.w, detail: "w" });
        }
        if (!moving && Math.abs(s.x - c.x) > T) {
          add({ width, check: "R11", key, source: s.x, clone: c.x, detail: "x" });
        }
        // R12 — full-bleed relation.
        const sFull = isFullBleed(s, source.vw);
        const cFull = isFullBleed(c, clone.vw);
        if (sFull !== cFull) {
          add({ width, check: "R12", key, source: sFull ? 1 : 0, clone: cFull ? 1 : 0 });
        }
        // R13 — centered symmetry.
        if (!moving && !sFull) {
          const sL = s.x;
          const sR = source.vw - s.x - s.w;
          if (Math.abs(sL - sR) <= CENTERED_PX) {
            const cL = c.x;
            const cR = clone.vw - c.x - c.w;
            if (Math.abs(cL - cR) > Math.max(CENTERED_PX, CENTERED_CLONE_RATIO * width)) {
              add({ width, check: "R13", key, source: round2(sL - sR), clone: round2(cL - cR) });
            }
          }
        }
        // R14 — edge anchoring.
        if (!moving) {
          const sFixed = s.pos === "fixed" || s.pos === "sticky" || cats.has("e");
          const flags = (n: NodeReading, vw: number, vh: number): Record<"L" | "R" | "T" | "B", boolean> => ({
            L: Math.abs(n.x) <= EDGE_PX,
            R: Math.abs(vw - (n.x + n.w)) <= EDGE_PX,
            T: Math.abs(n.y) <= EDGE_PX,
            B: Math.abs(vh - (n.y + n.h)) <= EDGE_PX,
          });
          const sf = flags(s, source.vw, source.vh);
          const cf = flags(c, clone.vw, clone.vh);
          const sides: Array<"L" | "R" | "T" | "B"> = [];
          if (sFixed) sides.push("L", "R", "T", "B");
          else if (sf.L !== sf.R) sides.push(sf.L ? "L" : "R");
          const differing = sides.filter((side) => sf[side] !== cf[side]);
          if (differing.length > 0) {
            add({
              width,
              check: "R14",
              key,
              source: sides.filter((side) => sf[side]).join("") || "-",
              clone: sides.filter((side) => cf[side]).join("") || "-",
            });
          }
        }
      }
      // R15 — image aspect / object-fit.
      if (cats.has("d") && s.ar !== undefined && c.ar !== undefined && s.ar > 0) {
        const off = Math.abs(c.ar - s.ar) / s.ar > ASPECT_RATIO_TOLERANCE;
        const fitOff = (s.fit ?? "") !== (c.fit ?? "");
        if (off || fitOff) {
          add({
            width,
            check: "R15",
            key,
            source: `${s.ar}/${s.fit ?? ""}`,
            clone: `${c.ar}/${c.fit ?? ""}`,
          });
        }
      }
      if ((cats.has("c") || cats.has("d") || cats.has("f")) && c.flow === 1 && !moving) {
        leaves.push({ key, t, s, c });
      }
    }

    // H4 — impossible overlap between tracked text/media items.
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i]!;
        const b = leaves[j]!;
        if (isPrefix(a.c.dp, b.c.dp) || isPrefix(b.c.dp, a.c.dp)) continue;
        const cloneArea = intersectionArea(a.c, b.c);
        if (cloneArea <= H4_MIN_INTERSECTION_PX2) continue;
        if (isPrefix(a.s.dp, b.s.dp) || isPrefix(b.s.dp, a.s.dp)) {
          inc(unverifiable, "H4");
          continue;
        }
        const sourceArea = intersectionArea(a.s, b.s);
        if (sourceArea > H4_MIN_INTERSECTION_PX2) inc(exemptions, "H4");
        else {
          add({
            width,
            check: "H4",
            key: `${a.key}|${b.key}`,
            source: round2(sourceArea),
            clone: round2(cloneArea),
          });
        }
      }
    }
  }

  return {
    width,
    served,
    sourceVariant: vote.variant,
    shares: vote.shares,
    treeMismatch,
    violations,
    exemptions,
    unverifiable,
    scrollHeightRatio: source.sh > 0 ? Math.round((clone.sh / source.sh) * 10000) / 10000 : null,
    nodeStatus: status,
    comparedKeys,
    coverage: { tracked: trackedServed, compared: status.matched, visibleCompared: status.compared },
  };
}
