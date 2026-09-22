# 28.75 · 03f — `smoke:visual-editor` Playwright TimeoutError

**Suite:** `scripts/smoke-visual-editor.ts` · baseline 50 checks / 0 failures
**Regression symptom:** 37 checks passed, then `TimeoutError` at
`scripts/smoke-visual-editor.ts:953` (pre-fix line numbering) waiting for
`locator('#wr-panel .row').filter({ hasText: 'global.header.nav.customers.label' }).first()`;
exit 1, 13 checks never ran. Log: `tmp/wr2875/regression/visual-editor.log`.

## Classification

**(b) — a synchronisation defect in the suite itself.** Not a product regression,
and not an unexplained flake: the nondeterminism has a single named mechanical
cause that the suite's own `gotoRoute` helper failed to wait for.

## Root cause

`src/editor/client.ts:428` — the editor's `navigate()` **always** re-assigns the
preview iframe's `src`:

```js
$("wr-frame").src = S.previewBase + route.path;
```

and, in the same function, wipes the inspector panel:

```js
S.selection = null; S.hover = null; S.inspector = null;
…
else $("wr-panel").innerHTML = "…Hover the preview to see what is editable; click to open a Slot.";
```

So selecting a route in `#wr-route` **reloads the preview document even when it is
the route already on screen**, and that reload commits roughly half a second after
the assignment.

The suite's helper (`scripts/smoke-visual-editor.ts:233-240`, pre-fix) waited only
for:

```ts
await page.selectOption("#wr-route", routePath);
await page.waitForFunction((expected) => iframe.src === expected, previewBase + routePath);
return previewFrame(page, previewBase);       // only waits for [data-wr-viewport]
```

Both waits are satisfied *before the reload starts*:

* `iframe.src === expected` is **already true** for a same-route selection — the
  condition holds before `selectOption` is even called, so the wait is vacuous;
* `[data-wr-viewport]` is in the markup of the outgoing document as much as the
  incoming one, and is parsed long before the injected editor bridge attaches its
  capture-phase `click` listener (`src/authoring-preview/bridge.ts:238`).

`gotoRoute` therefore returned while the preview document was being torn down.
The click that follows straddles the document swap: the `mousedown` and the
`mouseup` land on two different documents, **no `click` event is produced at
all**, the bridge posts nothing to the editor, and `#wr-panel` keeps the note
`navigate()` had just written. `waitForPanel(…"This element renders 2 slots")`
then burned its 15 s (its boolean was discarded), and the `.row` click burned
another 30 s — the 45 s that made the 63 s regression run.

**The failing call site is the only same-route `gotoRoute` in the file.** At
pre-fix line 768 §5 navigates to `/`; at pre-fix line 946 §6 navigates to `/`
again. That is why this one call, and only this one, had a *fully* vacuous wait.

### Evidence

A throwaway reproduction harness (kept under `tmp/`, removed afterwards) replays exactly the §6
seam — logo tab → slot tab → `gotoRoute("/")` on the route already shown → click
`n000027` → wait for the candidate rows — against the real editor, real preview
and real bridge.

| Build | Conditions | Result |
|---|---|---|
| suite helper as-shipped | idle machine, 20 rounds | **1 failure** |
| suite helper as-shipped | 6 CPU burners, 80 rounds | **2 failures** |
| fixed helper (as landed) | 6 CPU burners, 80 rounds | **0 failures** |

Instrumenting the editor window's `message` listener and the preview document's
capture-phase `click` listener gave the mechanism directly. Both failures carry
the identical signature — a fresh document, then a hover, then nothing:

```
{"ms":52191,"t":"ready"}        <- the reload the route selection caused, commits here
{"ms":52209,"t":"select-mode"}  <- the editor re-arms select mode on the new document
{"ms":52209,"t":"highlighted"}
{"ms":52330,"t":"hover"}        <- Playwright's mouse move, on the NEW document
{"ms":52332,"t":"highlighted"}
{"ms":52332,"t":"geometry"}
                                 <- 8 s of silence: NO "click" is ever posted
status="preview ready /"
panel="Hover the preview to see what is editable; click to open a Slot."   <- navigate()'s own note
```

A counter of `ready` messages per round shows **one reload per same-route
selection**, every round — the reload is deterministic, only its timing relative
to the click varies. That is the whole of the nondeterminism.

### Why (a) and (c) are ruled out

* **Not (a), a product regression.** No `src/` change is implicated. The same
  locator succeeds earlier in the same run (pre-fix line 702), the slot, its key
  and its two bindings are unchanged, and check `28.P4.21` (which asserts both
  candidate keys are listed) passes in the failing run. The panel state at
  failure is the string `navigate()` writes — the editor did exactly what it is
  supposed to do on a route selection. `src/editor/` and
  `src/authoring-preview/` are untracked in git (3 commits total in this repo),
  so attribution is by behaviour rather than diff: the reload-on-navigate is the
  editor's designed behaviour, and the missing wait is on the test side.
* **Not (c), a bare flake.** The failure has a deterministic cause with a
  measured signature (one reload per navigation; the click lost across the
  document swap). The fix is a wait on the commit itself, not a longer timeout —
  no timeout in the suite was increased.

## What changed

Only `scripts/smoke-visual-editor.ts`. No `src/` file, and none of
`src/sitespec/compile-page.ts`, `src/theme/`, `scripts/smoke-theme.ts`,
`scripts/smoke-reconstruction-qa.ts`.

1. **`gotoRoute` now waits for the navigation the selection causes.** It stamps
   the outgoing preview document with a unique token, arms Playwright's
   `framenavigated` event *before* the selection so the commit cannot be missed,
   and only then asks for the frame. If nothing commits — nothing in the app
   promises a reload — the stale-document check is dropped rather than hanging,
   so the helper degrades to today's behaviour instead of throwing.
2. **`previewFrame` now requires the bridge, not just the markup.** It waits for
   `window.__wrAuthoringBridge`, which the injected bridge sets as the last thing
   it does before posting `ready` — the only honest proof that a click on this
   document will reach the editor at all. With a `staleToken` it additionally
   refuses the document the caller is trying to leave.
3. **The four setup waits whose result nothing asserts now fail loudly**
   (`requirePanel`), so a broken setup names itself instead of dying 30 s later
   in an opaque locator timeout. No check was touched by this.

**All 50 checks are unchanged.** Nothing was weakened, skipped, or made vacuous;
no assertion was removed; no timeout was raised.

## Run results

Three back-to-back runs of `pnpm tsx scripts/smoke-visual-editor.ts`:

| Run | Trailer | PASS lines counted | Exit | Wall |
|---|---|---|---|---|
| 1 | `smoke:visual-editor — 50 checks, 0 failures` | 50 | 0 | 27.86 s |
| 2 | `smoke:visual-editor — 50 checks, 0 failures` | 50 | 0 | 27.51 s |
| 3 | `smoke:visual-editor — 50 checks, 0 failures` | 50 | 0 | 27.23 s |

All 50 checks execute in every run (counted from the `PASS` lines, not from the
trailer), and every one of them passes. `pnpm typecheck` — exit 0.

## Do other checks carry the same latent dependency?

Yes, in the same class, and all of them are fixed by the one helper:

* **`gotoRoute` call sites** — `scripts/smoke-visual-editor.ts:787` (`/plan`),
  `:841` (`/`) and `:1019` (`/`). All three had the unsynchronised wait; only
  `:1019` had it *fully* vacuous (same route in, same route out), which is why it
  was the one that failed. `:787` and `:841` were racing the same reload with a
  narrower window.
* **`scripts/smoke-visual-editor.ts:824`** — `previewFrame` immediately after a
  Save, whose `send({type:"reload"})` reloads the preview. This is the same
  pattern with no stale-token gate; it is masked by the `waitForTimeout(800)`
  that follows and by `Frame.evaluate` running against whatever document is
  current at evaluate time, so `28.P4.26` is not at risk. Left as-is —
  identified, not changed.
* The `#wr-badge` overlay was considered and **ruled out**: it is
  `pointer-events:none` (`src/editor/client.ts:41`) and cannot swallow a click.
