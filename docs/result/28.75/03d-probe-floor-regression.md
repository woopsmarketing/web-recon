# 28.75 / 03d — The probe element floor swallowed aligned pages

**Lane:** `src/sitespec/compile-page.ts` (one line).
**One regression, introduced by the 28.75 §07 correction cycle 2 rewrite, found
by `scripts/smoke-e2e.ts`, fixed by restoring an exemption the rewrite dropped.**

---

## 1. The defect

`computeProbeAttachment` in `src/sitespec/compile-page.ts` decided usability as:

```ts
const usable = pairs.length >= PROBE_PREFIX_MIN_ELEMENTS;   // 100
```

`PROBE_PREFIX_MIN_ELEMENTS` is `100` (`compile-page.ts:123`). So a page whose
deep walk contains fewer than 100 elements had **every** probe pair discarded —
`attachCount: 0`, `pairs: []` — even when the probe and the tree matched
perfectly, element for element, root to leaf.

The failure is silent in the worst way: the returned `aligned` flag is computed
independently and stays `true`. A consumer reading `aligned` sees a healthy
page; a consumer reading `attachCount` sees nothing attached. The artifact says
both "this probe matched the page exactly" and "this probe measured no element
of it."

## 2. Why the exemption existed, and what the floor is actually for

Read the two quantities apart:

* `aligned` — `!probe.truncated && probeLength === elementLength && prefix ===
  elementLength`. A **total** structural match: same length, and the exact
  tag-and-parent prefix runs the whole way. Not a prefix claim, a whole-tree
  claim.
* `PROBE_PREFIX_MIN_ELEMENTS` — its own docstring, before and after the rewrite,
  is about a **partial** attachment: *"A prefix shorter than this attaches
  nothing — too little page to trust."* A handful of corresponding nodes on two
  loads that otherwise disagree is weak evidence, and weak evidence about which
  box belongs to which node is worse than none.

The floor was therefore only ever a guard on the *partial-prefix* case. The
committed baseline (`git show HEAD:src/sitespec/compile-page.ts`, ~line 156)
encodes exactly that, and the `aligned` branch never consults the floor at all:

```ts
const prefixUsable = !probe.truncated && prefix >= PROBE_PREFIX_MIN_ELEMENTS;
return {
  aligned,
  attachCount: aligned ? elementTags.length : prefixUsable ? prefix : 0,
  structuralPrefix: prefix,
};
```

Task 28.75 §07 correction cycle 2 replaced index-prefix attachment with
structural **path** identity. That change is sound on its own terms, but in
collapsing the three-way `attachCount` expression into one `usable` boolean it
folded the aligned branch and the partial branch together, and the aligned
exemption disappeared with them. A total match started being judged by a floor
written for partial evidence.

## 3. The fix

One line, `src/sitespec/compile-page.ts:336`:

```ts
const usable = aligned || pairs.length >= PROBE_PREFIX_MIN_ELEMENTS;
```

`PROBE_PREFIX_MIN_ELEMENTS` keeps its value. Nothing else in the function
changed; a comment above the line records why the exemption exists so the next
rewrite does not drop it again.

The floor still binds every non-aligned page, which is where it belongs. The
suite fixtures that pin that behaviour are unaffected and were re-verified:
a 60-element probe against a 400-element tree is not aligned (the lengths
differ), so it still attaches nothing, as does the 3-element error-page probe of
the `linear.app` collapse canary.

## 4. Verification — four steps, in order

| # | Step | Result |
|---|---|---|
| 1 | `pnpm typecheck` | **exit 0** |
| 2 | `pnpm tsx scripts/smoke-sitespec.ts` | **474/474** checks passed (was 474/474 — no drop) |
| 3 | `pnpm tsx scripts/smoke-e2e.ts` | **130/130** checks passed, `[smoke:e2e] OK` (was 129/130) |
| 4 | Fix reverted in place, `smoke-e2e` re-run | **129/130**, exactly one failure: `FAIL the centered .centered band recovered a layout rule from the probe — rules=0 aligned=10` |

Step 4 then restored the fixed file and confirmed byte-identity:

```
shasum -a 256 src/sitespec/compile-page.ts
0261692b33412042b8f1b5f36c2e7725fc11604e0d93d5df1429358d6a57f605
```

— the same digest as the fixed file before the revert. The one line is what
moved the check; nothing else in the run differed.

`scripts/smoke-e2e.ts` was **not modified**. Its assertion at lines 892–898 is
legitimate and stands exactly as written; it is the only thing in the corpus of
suites that exercises a page small enough to trip the floor.

### 4.1 The attach count for a sub-100-element aligned page, measured

`computeProbeAttachment` called directly on a 52-element aligned walk — the size
`smoke-e2e`'s synthetic fixture walks — with identical probe and element sides
(`html > body > main > 49 div`):

```
before the fix:  {"elements":52,"aligned":true,"attachCount":0, "pairs":0, "structuralPrefix":52}
after the fix:   {"elements":52,"aligned":true,"attachCount":52,"pairs":52,"structuralPrefix":52}
```

Observed, not inferred: an aligned page under 100 elements now attaches **52 of
52**. Note `structuralPrefix: 52` in *both* rows — the evidence was fully
present and fully computed before the fix, and then thrown away at the last
step.

## 5. The consequence beyond the test, for the record

No corpus site exhibits this, and that is the only reason it survived. Every
canary host — `stripe.com`, `linear.app`, `nextjs.org` and the rest — walks
thousands of elements per page, comfortably over the floor, so the corpus masks
it completely.

What it hits is **thin real pages**: a short legal or privacy page, a 404, a
redirect stub, a bare confirmation or unsubscribe page, a minimal error route.
Any such page under 100 walked elements lost **100% of its layout evidence**
while still reporting `aligned: true` — the whole width-inference channel gone,
with no red anywhere to say so, and the honest-looking `aligned` flag actively
arguing that the page was fine. These are exactly the pages a site has most of
by count and looks at least, which is how a defect like this reaches production
in a real pilot rather than a fixture.

The fixture caught it only because it is small. That property is worth keeping.
