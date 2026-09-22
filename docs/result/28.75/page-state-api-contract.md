# Page-state normalization — public API contract (Task 28.75)

**Status:** stable, implemented, covered by `scripts/smoke-multi-observer.ts`.
**Owner lane:** `src/observer/**`. Callers do not need to read the implementation.

The observer dismisses entry popups before it collects. Anything else that
renders the same page for comparison (a QA source capture, a probe, a scout)
must be able to reach the *same* page state, or the clone gets charged for
content the engine deliberately removed. This is that entry point: **one shared
implementation, two calls.**

---

## The two calls

```ts
import {
  markInitialPaintCensus,
  normalizePageState,
} from "../observer/index.js"; // src/observer/index.js

await page.goto(url, { waitUntil: "load" });

// CALL 1 — IMMEDIATELY after the navigation resolves, before ANY settling.
await markInitialPaintCensus(page);

// …your own settle: networkidle, fonts.ready, a fixed wait — whatever you use…

// CALL 2 — before you capture anything.
const record = await normalizePageState(page, {
  observationUrl: url,
  viewportId: "desktop",
  pageId: "p000001",
  evidenceRoot: "docs/result/28.75/evidence/page-state", // optional
  onLog: (m) => console.log(m),                          // optional
});
```

Both calls install the `__name` shim they need for their own serialized
functions, so a caller does not have to. Neither call throws.

### Why the order matters

`markInitialPaintCensus` parks two `WeakSet`s on the page recording what was
*painting at the first paint*. That is the only time-based discriminator the
normalizer has, and it powers the STRONG signal
`appeared-after-initial-paint` — the one that separates an entry popup that
opened 350 ms after load from a legitimate full-viewport hero section that was
there all along.

Call it **before** anything that gives the page time to open a popup. After a
networkidle wait, the popup is already painted and the census would record it as
original page furniture.

---

## Signatures

```ts
function markInitialPaintCensus(
  page: Page,
  options?: { maxElements?: number },   // default MAX_INITIAL_PAINT_ELEMENTS = 20_000
): Promise<InitialPaintCensusResult>;

interface InitialPaintCensusResult {
  usable: boolean;   // installed AND complete
  elements: number;  // elements the census reached
  capHit: boolean;   // stopped at maxElements → the census is PARTIAL
  error?: string;    // first line, when it could not be installed at all
}
```

```ts
function normalizePageState(
  page: Page,
  options: NormalizePageStateOptions,
): Promise<PageStateNormalization>;

interface NormalizePageStateOptions {
  observationUrl: string;  // what a navigation-restore goes back to; also the evidence host folder
  viewportId: string;      // e.g. "desktop" | "mobile" — names the evidence dir
  pageId: string;          // e.g. "p000001" — names the evidence dir
  evidenceRoot?: string;   // default PAGE_STATE_EVIDENCE_ROOT_DEFAULT ("data/page-state-evidence")
  onLog?: (message: string) => void;
}
```

## Return shape (`PageStateNormalization`)

| field | meaning |
|---|---|
| `ran` | the phase executed (`false` only when a caller opted out) |
| `scans` | scans performed while waiting for a late-appearing overlay |
| `structuralMatches` | elements admitted by the COVER tier (`OVERLAY_SHAPE`) |
| `headerLikeRefused` | wide-but-short elements the COVER tier refused as a class |
| `panelMatches` | **28.75** — elements admitted by the PANEL tier (`PANEL_SHAPE`) that COVER did not |
| `qualified` | shape matches (either tier) that cleared the evidence bar |
| `dismissed` | overlays actually dismissed (outcome `dismissed`) |
| `attempts[]` | every attempt, successful or not — see below |
| `attemptCapHit` | the 2-dismissal cap stopped further work while something still qualified |
| `initialPaintCensusAvailable` | a complete census was readable |
| `initialPaintCensusStatus` | **28.75** — `available` \| `absent` \| `partial` \| `unreadable` |
| `limitations[]` | plain-language reasons, including the one below |

Each `attempts[i]` carries `fingerprint`, `domPath`, `signals[]`,
`shapeClass` (`cover` \| `panel`), `widthCoverage`, `heightCoverage`, `method`
(`close-control` \| `escape`), `closeControlLabel` / `…LabelSource` / `…Path`,
`outcome` (`dismissed` \| `not-dismissed` \| `no-geometry-change` \|
`click-error` \| `navigated`), before/after document height, before/after overlay
coverage, before/after scroll-lock, and `evidenceDir`.

## Side effects

* **May click**, at most twice per page-load, only a close control found *inside*
  a qualified overlay, never `force: true`; `Escape` only as a fallback and only
  with `declared-dialog` evidence.
* **Never removes, hides or restyles a node.** There is no DOM-deletion path in
  the module at all — the smoke suite asserts this on the source text.
* Writes `before.png`, `after.png` and `record.json` per attempt under
  `<evidenceRoot>/<host>/<pageId>-<viewportId>-<n>/`.
* If a click navigates, the phase stops and performs **one** bounded `goto` back
  to `observationUrl`. Your page may therefore have been reloaded — re-apply
  anything you had installed on it.

## What happens if you skip call 1

Nothing throws and nothing is silently lost. The returned record says so:

```jsonc
{
  "initialPaintCensusAvailable": false,
  "initialPaintCensusStatus": "absent",
  "limitations": [
    "no initial-paint census was installed on this page-load (`markInitialPaintCensus` was not called after `load` — see docs/result/28.75/page-state-api-contract.md), so `appeared-after-initial-paint` could not contribute evidence on this page-load"
  ]
}
```

The consequence is concrete: `appeared-after-initial-paint` can never fire, so a
popup whose only strong evidence was "it was not there at first paint" will
**not** be dismissed. A popup that also exposes a labelled close control or
declares `role="dialog"` still is. The status values:

| status | cause | effect |
|---|---|---|
| `available` | call 1 ran and completed | full evidence |
| `absent` | call 1 was never made | `appeared-after-initial-paint` cannot fire |
| `partial` | call 1 hit `maxElements` | refused on purpose — an element the census never reached is indistinguishable from one that did not exist yet |
| `unreadable` | the page key held something unexpected | treated as absent |

Recommendation for a QA source capture: **run call 1.** It costs one `evaluate`
immediately after `load` and is the difference between matching the observer's
page state and diverging from it.

## Evidence root

`PAGE_STATE_EVIDENCE_ROOT_DEFAULT = "data/page-state-evidence"` — deliberately
outside `docs/result/`. Before 28.75 the default was
`docs/result/28.7/evidence/page-state`, i.e. permanently-enabled production code
wrote into a frozen wave's artifact directory. Pass `evidenceRoot` (or
`--page-state-evidence-root=DIR` on `pnpm observe` / `pnpm observe:site`) to file
a wave's evidence with that wave's report.
