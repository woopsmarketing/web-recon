# Task 28.7 — Route Archetype Capability (Program F)

**Question asked:** does the existing pipeline already support a RouteArchetypePlan, or is a new
layer needed?

## PREVIOUS FACT — what already existed

A page-family + representative-selection system has existed since Tasks 07/08 and is not a
homepage-only reconstructor:

| capability | where | status |
|---|---|---|
| all discovered internal routes | `DiscoveryResult.links[]`, `src/discovery/types.ts:88-118` | present (flat URL list; no pattern normalization, no fingerprint — discovery never opens a browser) |
| family grouping | `src/selector/build-families.ts:1-77`, rule cascade `content-duplicate` → `sibling-pattern` (≥3, `types.ts:54`) → `scope-structure` (≥2, `types.ts:61`) → `singleton` | present |
| normalized route pattern | `PageFamily.inferredRoutePattern`, `src/selector/types.ts:284`, from `inferredSiblingPattern()` `route-features.ts:115` | present for sibling-pattern families |
| DOM structure fingerprint | `shallowSkeletonHash`, `src/verifier/structural-profile.ts:203` | present |
| main landmark structure | `landmarkHash` / `landmarkTokens`, `structural-profile.ts:83-97` | present |
| representative selection + reason | `select-representatives.ts`, `SelectionReason` `types.ts:340-345` | present |
| **deep-reconstruct scope control** | `src/multi-observer/plan-pages.ts:111-184`; one representative per family + at most `MAX_VALIDATION_SAMPLES_PER_SITE`=3 samples | **already correct — the pipeline never deep-reconstructs every route** |
| shared header/footer shell isolation | — | **MISSING** (no code diffs two pages to isolate a shell subtree) |
| explicit list↔detail relationship | — | **MISSING** (siblings form one family; the list index page is a separate family with no declared link) |

So §29's instruction applied: existing functionality was sufficient in substance and was NOT
redesigned.

## IMPLEMENTED CHANGE — a projection, not a pipeline stage

New pure module `src/selector/route-archetype-plan.ts` (191 lines), persisted as
`route-archetypes.json` next to the existing two selector artifacts (`src/selector/store.ts`
`saveRouteArchetypePlan`, mirroring `saveSelection`), wired into `src/cli-select.ts` so a normal run
emits it. The existing two artifacts are unchanged in shape and content.

```ts
export interface RouteArchetype {
  archetypeId: string;          // PageFamily.id
  label?: string;               // route SHAPE only, never guessed semantics
  routePattern?: string;        // inferredRoutePattern ?? routeScope
  memberCount: number;          // signals.memberCount
  representativeRoutes: string[];
  layoutFingerprint?: string;   // shallowSkeletonHash ?? landmarkHash
  reasonSelected: string;
  deepReconstruct: true;
}
export interface RouteArchetypePlan {
  schemaVersion: 1; rootUrl: string; builtAt: string;
  summary: {
    totalDiscoveredRoutes: number;
    totalArchetypes: number;
    totalMembersRepresented: number;
    representedWithoutDeepReconstructionCount: number;
  };
  archetypes: RouteArchetype[];
}
```

Field provenance, stated honestly:

- **Verbatim from existing data:** `archetypeId`, `memberCount`, `layoutFingerprint`.
- **Derived:** `label`, `routePattern`, `reasonSelected`, `representativeRoutes`, `deepReconstruct`.
  `deepReconstruct` makes an existing guarantee explicit — it is not a new decision, because
  `selected-pages.json` already gives every family exactly one representative and every
  representative is deep-observed.
- **Omitted as not derivable:** `sharedShell`. No DOM-diff shell extractor exists and one was NOT
  built here — that would be a new subsystem, out of scope for Phase 1 closure.

## NEW EXPERIMENT — the case no real artifact covers

The `/notice/1 … /notice/500` shape is the whole point of §30, and **no artifact on disk exercises
it**: seoultone.kr's numbered pages are `.php` files and hobbang.net has no numeric board;
gs.severance.healthcare had discovery skipped entirely (2 curated URLs), so its real notice board was
never crawled. A synthetic fixture was therefore added to `scripts/smoke-selector.ts`: root +
`/about` + `/notice` (list) + `/notice/1..40` (details), run through the REAL
`buildPageFamilies`/`buildPageSelection`.

Asserted: the 40 detail routes collapse into exactly ONE archetype with `memberCount` 40 and 1–2
representative routes; the list page lands in a DIFFERENT archetype; the site root is its own
archetype and is never dropped; `representedWithoutDeepReconstructionCount` is 39; the projection is
byte-identical when rebuilt from the round-tripped artifacts.

## REAL-DATA RESULT (read-only; `data/` untouched, outputs in `tmp/wr287/wpd/`)

| site | discovered routes | archetypes | members represented | represented WITHOUT deep reconstruction |
|---|---|---|---|---|
| seoultone.kr (`2026-09-02T23-12-19-842Z`) | 19 | 11 | 19 | 8 |
| hobbang.net (`2026-09-02T23-12-46-745Z`) | 19 | 7 | 19 | 12 |

These match the family counts already on disk, which is the intended result: the projection reports
what the pipeline was already doing, rather than changing it.

## VERIFICATION

`pnpm typecheck` exit 0. `npx tsx scripts/smoke-selector.ts` → **93/93** (was 84).

## REJECTED IDEAS

- Redesigning discovery or family selection — refused under §29: the existing data was sufficient.
- Building a `sharedShell` DOM-diff extractor — refused as a new subsystem outside Phase 1 closure.
- Semantic labels ("blog-detail", "homepage") — refused; the codebase's standing policy
  (`src/selector/types.ts:18-19`) is to not guess semantics, and a guessed label would be a
  confident wrong answer in exactly the place a human would trust it.

## REMAINING LIMITATIONS

1. The numbered-board collapse is proven only by a synthetic fixture. No production artifact
   demonstrates it, because none of the four canary sites has that URL shape. Task 28.8's sites
   (which include board-shaped Korean sites) will be the first real exercise.
2. `representativeRoutes`' second URL is illustrative context, not the multi-observer validation
   sample — that data is not persisted at the selector layer.
3. `sharedShell` is absent. A consumer needing an isolated header/footer subtree still has nothing.
4. `label` / `routePattern` reflect route shape only. Two structurally identical but differently
   scoped families can get similar-looking labels. This is deliberate.
