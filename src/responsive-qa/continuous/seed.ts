/**
 * Seeded, run-independent randomness. The seed is a function of the route and
 * the interval bounds ONLY — never a run id or a clock — so two runs against
 * the same evidence sample the same widths and their results can be diffed.
 */

/** 32-bit FNV-1a over the UTF-16 code units of `input`. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 PRNG → floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed string contract: `route-path|min|max` (max exclusive). */
export function intervalSeed(routePath: string, min: number, max: number): number {
  return fnv1a32(`${routePath}|${min}|${max}`);
}

/**
 * `count` distinct integer widths in [min, maxInclusive], seeded. Fewer when
 * the range holds fewer integers. Sorted ascending.
 */
export function seededWidths(
  routePath: string,
  min: number,
  maxExclusive: number,
  count: number,
): number[] {
  const maxInclusive = maxExclusive - 1;
  const span = maxInclusive - min + 1;
  if (span <= 0 || count <= 0) return [];
  if (span <= count) {
    return Array.from({ length: span }, (_, i) => min + i);
  }
  const rand = mulberry32(intervalSeed(routePath, min, maxExclusive));
  const picked = new Set<number>();
  let draws = 0;
  while (picked.size < count && draws < count * 50) {
    picked.add(min + Math.floor(rand() * span));
    draws++;
  }
  return [...picked].sort((a, b) => a - b);
}
