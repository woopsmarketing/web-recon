# 28.75 / 07 — Probe coverage: the 2,283 → 3 collapse and the 86.5% alignment gap

**Lane:** `src/observer/**`, `src/sitespec/**`, `scripts/smoke-multi-observer.ts`,
`scripts/smoke-sitespec.ts`.
**Two defects root-caused, both PRE-EXISTING; two generic fixes; coverage and
alignment made asserted quantities with a floor.**

> **Headline correction.** The brief's leading hypothesis — that the probe's
> parked element list went stale when the page re-rendered — is **disproven by
> the artifact itself**, and the wave's three observer changes are **exonerated
> by its own pre-lane run**. Neither defect was introduced by 28.75. Both are
> older, and one of them was diagnosed in 28.7 and then fixed on only half the
> code paths it applies to.

---

## 1. The reproduction, and what the artifact actually says

### 1.1 It is not a stale parked list

`data/linear.app/site-observations/2026-09-04T22-34-32-296Z/pages/p000001/layout-probe-mobile.json`:

```
tags             ["html", "body", "pre"]      ← 3 elements, and that is the WALK
parents          [-1, 0, 1]
truncated        false
prepareScrollStatus  "prepare-scroll-complete"
finalUrl         "https://linear.app/"
per width (all 16):  disconnected 0     documentWidth 980
```

Three facts kill the teardown hypothesis outright:

* **`disconnected: 0`, at every one of the 16 widths.** A stale parked list is
  precisely a list whose entries report `isConnected === false`. Every entry
  reported connected. Nothing was torn down.
* **`tags.length === 3`.** The collapse is in the **walk**, not the measure. The
  walk runs once, immediately after `settle()`, before any `setViewportSize`.
  There was never a 2,283-element list to lose.
* **`documentWidth: 980` on a 390px mobile viewport.** 980 is Chrome's default
  layout-viewport width for a document with **no `<meta name="viewport">`** — a
  signature of a document the site did not author.

`html/body/pre` with no viewport meta is what Chrome renders when it is handed a
**non-HTML response body**. The probe walked an error page.

### 1.2 The same failure, in a PRE-LANE run, with the body preserved

The identical 3-element shape occurs in
`data/linear.app/site-observations/2026-09-04T15-30-50-831Z` — the **pre-lane**
run, before any 28.75 observer change — where it hit the **desktop deep
observation** of *two* pages. That path stores `rendered.html`, so the body
survived:

`…/2026-09-04T15-30-50-831Z/pages/p000001/viewports/desktop/rendered.html`:

```html
<html><head><meta name="color-scheme" content="light dark"></head><body>
<pre style="word-wrap: break-word; white-space: pre-wrap;">upstream connect error
or disconnect/reset before headers. retried and the latest reset reason: remote
connection failure</pre></body></html>
```

An Envoy/upstream gateway error, served as `text/plain`, wrapped by Chrome in
`<pre>`. Three walkable elements (`SKIP_TAGS` removes `head`/`meta`). **That is
the mechanism, and it is confirmed, not inferred.**

### 1.3 Live reproduction: transient, not deterministic

Eight fresh loads of `https://linear.app/` through the exact probe context
(six bare loads across the desktop and mobile profiles with
`OBSERVATION_LOCALE`/`TIMEZONE`; two more with the full `autoScrollPrepare`
preparation) all returned **HTTP 200, `text/html`**, 4,861–5,363 elements, ~690
subresource requests per load, and **0 non-2xx subresource responses**. **The failure is
a transient upstream/edge error and cannot be summoned on demand.** That is why
the fix is a gate and a bounded retry rather than a repair of some deterministic
bug.

### 1.4 Frequency across the corpus

Every `observation.json` on disk, all four canary hosts:

| occurrence | run | wave | what collapsed |
|---|---|---|---|
| 1 | `2026-09-04T15-30-50-831Z` | **28.7 pre-lane** | `p000001` **desktop deep walk** → 3 |
| 2 | `2026-09-04T15-30-50-831Z` | **28.7 pre-lane** | `p000002` **desktop deep walk** → 3 |
| 3 | `2026-09-04T22-34-32-296Z` | 28.75 post-lane | `p000001` **mobile probe walk** → 3 |
| 4 | `2026-09-03T11-40-19-337Z` | 28.6 | **seoultone.kr, every page** → 67 (the Cafe24 over-traffic stub) |

**Provenance: PRE-EXISTING and site-side-triggered.** It struck the pre-lane run
twice before a single 28.75 observer line existed. The wave's three changes
(`runScrollPass` rewrite, the additive `PANEL_SHAPE` tier, three
`STYLE_WHITELIST` properties) are not implicated by any of this evidence, and
`PANEL_SHAPE` in particular cannot be: it runs in
`normalize-page-state.ts`, which the probe never calls.

### 1.5 Why linear `/` and not the hospital or blog homepage

The coordinator's asymmetry test, answered directly. The distinguishing property
is **not** SPA weight tearing down a parked list — nothing was torn down. It is
**exposure to a flaky edge**:

* `linear.app` sits behind Cloudflare in front of an upstream that demonstrably
  emitted `upstream connect error …` twice on 2026-09-04. `gs.severance.healthcare`
  and `hobbang.net` are small, directly-served sites.
* linear `/` is the heaviest page in the corpus: **~690 subresource requests per
  load**, and the pipeline makes **four loads per page** (desktop deep, mobile
  deep, desktop probe, mobile probe) — ~2,760 requests for that one URL per run,
  against ~200–400 for a hobbang page. It has by far the most chances to catch a
  transient edge failure, and the mobile probe is the **last** of the four.
* Consistent with this, the failure is **not probe-specific and not
  p000001-specific**: it hit `p000002`'s desktop *deep* walk in the pre-lane run.
  It is `linear.app`-specific, which is a statement about that origin's
  reliability, not about page weight.

---

## 2. Defect A — the collapse. Root cause at file:line

### 2.1 The gate existed. It was applied to half the loads.

Task 28.7 B1 diagnosed exactly this, on exactly this run. The comment is still in
the tree, `src/observer/observe-page.ts:817-826` (pre-fix numbering):

> *Measured on a real canary (2026-09-04, run `2026-09-04T15-30-50-831Z`): a
> transient upstream outage made `linear.app` answer the DESKTOP load of two
> routes with a proxy error body, and the observation recorded it as a normal
> success … The observer never recorded the document's status.*

B1 built the cure — read `page.goto`'s main-frame response, retry once on
non-2xx, MARK the capture — and shipped it **private to `observe-page.ts`**, on
the deep observation's page load only.

**The pipeline makes four loads of every URL, not two.** The probe makes its own,
in its own browser context, in `layout-probe.ts`:

```ts
// src/observer/layout-probe.ts:989 (pre-fix)
await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
```

**The return value is discarded.** No status is read, no retry is made, no mark
is possible. `page.goto` does not throw on 4xx/5xx, so an error body is walked
and recorded as an ordinary probe.

> **Root cause A (one line):** the layout probe's own page load never read its
> HTTP response, so a transient upstream error body was walked and recorded as a
> 3-element layout probe — the Task 28.7 B1 document gate was written for the
> deep observation's load and never applied to the probe's.
> **Provenance: pre-existing (28.7 shipped the gate on one of two load paths);
> trigger is site-side and transient.**

### 2.2 Nothing downstream could see it either

`elementCount` was recorded and truthful — 3 *is* what the probe walked — and
useless, because **it had no denominator anywhere in the artifact**. The existing
corroborating signal, `applyCrossViewportIntegrity`, compares the two **deep**
walks against each other; both were healthy (2,306 / 2,291). It never looks at a
probe, and it ran *before* the probes did. So a 2,283 → 3 collapse passed a lane,
a spec compile, a reconstruction and a QA run with every number green.

---

## 3. Defect B — the alignment gap. Root cause at file:line

### 3.1 Locating the brief's numbers

`compileProbeAttachment`'s verdict, read out of the compiled specs:

| sitespec | page | desktop | mobile |
|---|---|---|---|
| `2026-09-04T17-24-30-977Z` (pre-lane) | p000001 | `aligned=true` **2306/2306** | `aligned=false` **311/2306 (13.5%)** |
| `2026-09-04T23-34-15-786Z` (post-lane) | p000001 | `aligned=false` **1379/2306** → the brief's *927 unprobed / 40.2%* | `aligned=false` **0/2291**, `refusedReason: tag-walk-mismatch` |

So the brief's "927 desktop nodes (40.2%)" is the **post-lane desktop** figure,
and its "100% of its mobile tree" is **downstream of Defect A**. The **steady
state**, present in every healthy run since 2026-09-03, is the third number:
**linear `/` mobile has attached only 311 of 2,306 nodes — 13.5% — for three
waves.** `src/reconstruction/tree-switch.ts:701-709` already records this
verbatim ("*the mobile probe attaches nothing (`aligned: false`, 311 of 2,306
elements)*"), so it was known and never treated as a defect.

### 3.2 The mechanism

`src/sitespec/compile-page.ts`, `computeProbeAttachment` (pre-fix):

```ts
const comparable = Math.min(probe.tags.length, elementTags.length);
let prefix = 0;
while (
  prefix < comparable &&
  probe.tags[prefix] === elementTags[prefix] &&
  (probe.parents[prefix] ?? -2) === (elementParentIndexes[prefix] ?? -3)
) prefix++;
```

Attachment is the **leading prefix, by index, from 0**. Everything after the
first mismatch attaches nothing.

The probe is a **separate page load** of the same URL (`observe-page.ts` runs
both deep viewports first, then two probe loads). Two loads of a page with an
animated hero do not produce byte-identical trees. Measured on the healthy
pre-lane run, `p000001` mobile:

```
probe walk   2,283 elements
deep walk    2,306 elements        difference: 23 elements  (1.0%)
first mismatch at walk index 311:
    probe   tag=div  parent=292
    deep    tag=div  parent=303
    context  e000311 <p class="q1lnWq_responseText">, e000313 <div class="uPPvIq_cardWrap">
attached      311            discarded  1,995  (86.5%)
```

Both sides are a `div`. **Only the parent index differs** — by 11, because 11
elements of Linear's progressively-mounting hero card region exist in one load
and not the other. A parent index is a **position**, and a position shifts when
anything before it does. One inserted subtree therefore invalidated every index
after it, and 1% disagreement destroyed 86.5% of the width evidence.

> **Root cause B (one line):** probe→tree attachment was a leading index prefix,
> so a single element-count difference between the probe's page load and the deep
> observation's page load discarded every element after it — 1,995 of 2,306 nodes
> (86.5%) on linear `/` mobile.
> **Provenance: pre-existing by construction** — the Task 17 design, narrowed by
> the Task 26 revision; present and identical in every run back to
> `2026-09-03T11-40-19-339Z`, including all four pre-lane runs.

### 3.3 Alignment is nondeterministic run to run, and always was

Recomputed from the artifacts (linear `p000001`, exact prefix ÷ deep walk):

| run | wave | desktop | mobile |
|---|---|--:|--:|
| `2026-09-02T20-18-05-741Z` | 28.6 | 12.2% | 12.2% |
| `2026-09-03T00-17-50-549Z` | 28.6 | 56.4% | 57.0% |
| `2026-09-03T11-40-19-339Z` | 28.6 | 100% | 13.5% |
| `2026-09-04T15-48-30-262Z` | 28.7 pre-lane | 100% | 13.5% |
| `2026-09-04T17-21-07-726Z` | 28.7 pre-lane | 100% | 13.5% |
| `2026-09-04T22-20-02-199Z` | 28.75 | 100% | 13.5% |
| `2026-09-04T22-34-32-296Z` | 28.75 | 59.8% | 0% |

The desktop column flips between 100% and ~12–60% across waves with no code
change between several of those runs. This is load-to-load nondeterminism in
linear's hero, not a regression.

---

## 4. The fixes

### 4.1 Fix A — the probe load obeys the document gate (generic)

**`src/observer/navigate-document.ts` (new).** `isOkStatus`,
`navigateMainDocument` and `pause` **moved out of** `observe-page.ts` — not
reimplemented — into a module both callers can depend on.
`layout-probe.ts` cannot import `observe-page.ts` (the dependency already runs
the other way, for `autoScrollPrepare`), so a shared module is what makes one
policy reachable from both loads instead of one load having a copy of none.

**`src/observer/layout-probe.ts` — `probeLayout`.** Two gates, because two
different failures produce the same useless walk:

1. **`navigateMainDocument`** replaces the bare `page.goto`. A non-2xx document
   is retried once (`MAX_DOCUMENT_NAV_ATTEMPTS`) and the full `documentResponse`
   — every attempt, with statuses — is written into the probe artifact.
2. **A starvation gate**, because *a soft error page answers 200* and no status
   check can ever catch it. The probe compares its walk against the **deep walk
   of the same viewport in the same run**, and on starvation retries the **whole
   probe from a clean browser context** (`MAX_PROBE_ATTEMPTS = 2`), keeping the
   better of the two passes.

**Why it is generic:** no host, path or page is named anywhere. The denominator
is the run's own control — the same principle
`CROSS_VIEWPORT_STARVATION_RATIO` already established for the deep walks — and
`PROBE_DOCUMENT_STARVATION_RATIO` is **defined as that same constant** rather
than a second, separately-tuned number. A page that is legitimately tiny is tiny
in both walks, so its ratio is ~1 and it is never marked; the negative control
for exactly this is asserted in the suite. With no denominator supplied the probe
reports **no ratio** rather than inventing one.

**Marking, never dropping.** `applyProbeIntegrity` adds a new
`probe-starved` reason to the viewport, and the page-level roll-up now runs
**after** the probes (it ran before them, which is why a starved probe could not
have marked anything even if it had noticed). The deep observation is untouched
and stays usable — it is the *width evidence* that is missing, and the limitation
string says exactly that.

### 4.2 Fix B — identity stops being a position (generic)

`computeProbeAttachment` now matches on **structural path**: each element's chain
of `tag[nth-of-that-tag-among-its-parent's-children]` from the root, interned
across both walks so comparison is an integer compare. Two elements correspond
when their paths are equal.

This is the identity a CSS selector uses. It is independent of everything outside
the element's own ancestry, so an inserted hero card renames only **its own later
siblings** and the rest of the document keeps its identity.

**What it still refuses — and this is the point.** An element whose path differs
attaches **nothing**: every later sibling of an inserted node, and every
descendant of a changed ancestor (their paths are built *through* it). A node
either carries its own measurement or none, and can never carry someone else's.

**A diff-with-resynchronization was built and measured first, and rejected.** It
recovers the same coverage (2,283) but has a failure mode path identity does not:
at a divergence it must *guess* whether to skip the probe side, the element side,
or both, and among a run of identical siblings every choice satisfies
tag-and-parent equally. Guessing wrong shifts the whole tail by one sibling and
attaches each node its neighbour's box — silently, because the result still looks
aligned. Two candidate orderings were implemented and measured; each was correct
on one synthetic fixture and produced a silent one-sibling shift on the other.
**A path is not a guess**, and it measured equal-or-better on all 172 real
page/viewport probes (98.9% vs 98.4% on the post-lane desktop case).

`aligned` is **unchanged** and still means full, gap-free agreement, so no
consumer that gates on it sees new behaviour. `structuralPrefix` preserves the
old exact prefix for continuity.

---

## 5. Is there a trade between the scroll fix and the probe? No.

**There is no conflict, and nothing was traded.** The scroll improvement is not
implicated in either defect:

* Defect A is a missing HTTP-response gate, proven by an error body captured in a
  **pre-lane** run on a **deep observation** that the probe's scroll never
  touched.
* Defect B is index-based attachment, present identically in every run back to
  2026-09-03.

`runScrollPass` and `autoScrollPrepare` are **byte-for-byte unmodified by this
lane** (verified by `shasum` against the pre-change file, §8.3). The seoultone
benefit is therefore preserved by construction rather than by re-measurement — no
line that produces it was touched. Its live site remains **SOURCE_UNAVAILABLE**
(406-byte Cafe24 over-traffic stub, TLS handshake failure); it was **not**
attempted, and no acceptance is claimed for it. The scroll policy's own
regression coverage (`testScrollPassTraversal`, `testScrollRevealAndOverlayCensus`,
`testPrepareScrollProbeParity`, `testPrepareScrollNavigationSafety`) is green in
the post-fix suite run, which is the assertion that the behaviour still holds.

---

## 6. Before / after coverage and alignment

Recomputed over **every** page/viewport probe on disk for the three reachable
hosts. "Coverage" = probe walk ÷ deep walk. "Alignment" = nodes carrying probe
data ÷ viewport element nodes.

### 6.1 The pages that moved

| host | run | page | vp | deep | probe | coverage | align BEFORE | align AFTER |
|---|---|---|---|--:|--:|--:|--:|--:|
| linear.app | `2026-09-04T17-21-07` (pre-lane) | p000001 | mobile | 2306 | 2283 | 99.0% | **311 (13.5%)** | **2283 (99.0%)** |
| linear.app | `2026-09-04T22-20-02` | p000001 | mobile | 2306 | 2283 | 99.0% | **311 (13.5%)** | **2283 (99.0%)** |
| linear.app | `2026-09-04T22-34-32` | p000001 | desktop | 2306 | 2291 | 99.3% | **1379 (59.8%)** | **2280 (98.9%)** |
| linear.app | `2026-09-04T22-34-32` | p000001 | mobile | 2291 | **3** | **0.1%** | 0 (0.0%) | 0 (0.0%) — *correctly refused* |

<details>
<summary>Full per-row table (all 92 rows, three hosts, 28.7 pre-lane → 28.75)</summary>

| host | run | page | viewport | deep walk | probe walk | coverage | align BEFORE | align AFTER |
|---|---|---|---|--:|--:|--:|--:|--:|
| linear.app | 2026-09-04T17-21-07 | p000001 | desktop | 2306 | 2306 | 100.0% | 2306 (100.0%) | 2306 (100.0%) |
| linear.app | 2026-09-04T17-21-07 | p000001 | mobile | 2306 | 2283 | 99.0% | 311 (13.5%) | 2283 (99.0%) |
| linear.app | 2026-09-04T17-21-07 | p000002 | desktop | 2230 | 2230 | 100.0% | 2230 (100.0%) | 2230 (100.0%) |
| linear.app | 2026-09-04T17-21-07 | p000002 | mobile | 2230 | 2230 | 100.0% | 2230 (100.0%) | 2230 (100.0%) |
| linear.app | 2026-09-04T17-21-07 | p000003 | desktop | 1363 | 1363 | 100.0% | 1363 (100.0%) | 1363 (100.0%) |
| linear.app | 2026-09-04T17-21-07 | p000003 | mobile | 1363 | 1363 | 100.0% | 1363 (100.0%) | 1363 (100.0%) |
| linear.app | 2026-09-04T17-21-07 | p000004 | desktop | 364 | 364 | 100.0% | 364 (100.0%) | 364 (100.0%) |
| linear.app | 2026-09-04T17-21-07 | p000004 | mobile | 364 | 364 | 100.0% | 364 (100.0%) | 364 (100.0%) |
| linear.app | 2026-09-04T22-20-02 | p000001 | desktop | 2306 | 2306 | 100.0% | 2306 (100.0%) | 2306 (100.0%) |
| linear.app | 2026-09-04T22-20-02 | p000001 | mobile | 2306 | 2283 | 99.0% | 311 (13.5%) | 2283 (99.0%) |
| linear.app | 2026-09-04T22-20-02 | p000002 | desktop | 2230 | 2230 | 100.0% | 2230 (100.0%) | 2230 (100.0%) |
| linear.app | 2026-09-04T22-20-02 | p000002 | mobile | 2230 | 2230 | 100.0% | 2230 (100.0%) | 2230 (100.0%) |
| linear.app | 2026-09-04T22-20-02 | p000003 | desktop | 1363 | 1363 | 100.0% | 1363 (100.0%) | 1363 (100.0%) |
| linear.app | 2026-09-04T22-20-02 | p000003 | mobile | 1363 | 1363 | 100.0% | 1363 (100.0%) | 1363 (100.0%) |
| linear.app | 2026-09-04T22-20-02 | p000004 | desktop | 364 | 364 | 100.0% | 364 (100.0%) | 364 (100.0%) |
| linear.app | 2026-09-04T22-20-02 | p000004 | mobile | 364 | 364 | 100.0% | 364 (100.0%) | 364 (100.0%) |
| linear.app | 2026-09-04T22-34-32 | p000001 | desktop | 2306 | 2291 | 99.3% | 1379 (59.8%) | 2280 (98.9%) |
| linear.app | 2026-09-04T22-34-32 | p000001 | mobile | 2291 | 3 | 0.1% | 0 (0.0%) | 0 (0.0%) |
| linear.app | 2026-09-04T22-34-32 | p000002 | desktop | 2230 | 2230 | 100.0% | 2230 (100.0%) | 2230 (100.0%) |
| linear.app | 2026-09-04T22-34-32 | p000002 | mobile | 2230 | 2230 | 100.0% | 2230 (100.0%) | 2230 (100.0%) |
| linear.app | 2026-09-04T22-34-32 | p000003 | desktop | 1363 | 1363 | 100.0% | 1363 (100.0%) | 1363 (100.0%) |
| linear.app | 2026-09-04T22-34-32 | p000003 | mobile | 1363 | 1363 | 100.0% | 1363 (100.0%) | 1363 (100.0%) |
| linear.app | 2026-09-04T22-34-32 | p000004 | desktop | 364 | 364 | 100.0% | 364 (100.0%) | 364 (100.0%) |
| linear.app | 2026-09-04T22-34-32 | p000004 | mobile | 364 | 364 | 100.0% | 364 (100.0%) | 364 (100.0%) |
| gs.severance.healthcare | 2026-09-04T18-13-50 | p000001 | desktop | 1674 | 1674 | 100.0% | 1674 (100.0%) | 1674 (100.0%) |
| gs.severance.healthcare | 2026-09-04T18-13-50 | p000001 | mobile | 1658 | 1658 | 100.0% | 1658 (100.0%) | 1658 (100.0%) |
| gs.severance.healthcare | 2026-09-04T18-13-50 | p000002 | desktop | 1335 | 1335 | 100.0% | 1335 (100.0%) | 1335 (100.0%) |
| gs.severance.healthcare | 2026-09-04T18-13-50 | p000002 | mobile | 1335 | 1335 | 100.0% | 1335 (100.0%) | 1335 (100.0%) |
| gs.severance.healthcare | 2026-09-04T22-33-34 | p000001 | desktop | 1674 | 1674 | 100.0% | 1674 (100.0%) | 1674 (100.0%) |
| gs.severance.healthcare | 2026-09-04T22-33-34 | p000001 | mobile | 1658 | 1658 | 100.0% | 1658 (100.0%) | 1658 (100.0%) |
| gs.severance.healthcare | 2026-09-04T22-33-34 | p000002 | desktop | 1335 | 1335 | 100.0% | 1335 (100.0%) | 1335 (100.0%) |
| gs.severance.healthcare | 2026-09-04T22-33-34 | p000002 | mobile | 1335 | 1335 | 100.0% | 1335 (100.0%) | 1335 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000001 | desktop | 852 | 852 | 100.0% | 852 (100.0%) | 852 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000001 | mobile | 852 | 852 | 100.0% | 852 (100.0%) | 852 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000002 | desktop | 313 | 313 | 100.0% | 313 (100.0%) | 313 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000002 | mobile | 313 | 313 | 100.0% | 313 (100.0%) | 313 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000003 | desktop | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000003 | mobile | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000004 | desktop | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000004 | mobile | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000005 | desktop | 335 | 335 | 100.0% | 335 (100.0%) | 335 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000005 | mobile | 335 | 335 | 100.0% | 335 (100.0%) | 335 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000006 | desktop | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000006 | mobile | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000007 | desktop | 304 | 304 | 100.0% | 304 (100.0%) | 304 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000007 | mobile | 304 | 304 | 100.0% | 304 (100.0%) | 304 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000008 | desktop | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000008 | mobile | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000009 | desktop | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000009 | mobile | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000010 | desktop | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T18-13-50 | p000010 | mobile | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000001 | desktop | 852 | 852 | 100.0% | 852 (100.0%) | 852 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000001 | mobile | 852 | 852 | 100.0% | 852 (100.0%) | 852 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000002 | desktop | 313 | 313 | 100.0% | 313 (100.0%) | 313 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000002 | mobile | 313 | 313 | 100.0% | 313 (100.0%) | 313 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000003 | desktop | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000003 | mobile | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000004 | desktop | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000004 | mobile | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000005 | desktop | 335 | 335 | 100.0% | 335 (100.0%) | 335 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000005 | mobile | 335 | 335 | 100.0% | 335 (100.0%) | 335 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000006 | desktop | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000006 | mobile | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000007 | desktop | 304 | 304 | 100.0% | 304 (100.0%) | 304 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000007 | mobile | 304 | 304 | 100.0% | 304 (100.0%) | 304 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000008 | desktop | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000008 | mobile | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000009 | desktop | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000009 | mobile | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000010 | desktop | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T22-22-16 | p000010 | mobile | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000001 | desktop | 852 | 852 | 100.0% | 852 (100.0%) | 852 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000001 | mobile | 852 | 852 | 100.0% | 852 (100.0%) | 852 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000002 | desktop | 313 | 313 | 100.0% | 313 (100.0%) | 313 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000002 | mobile | 313 | 313 | 100.0% | 313 (100.0%) | 313 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000003 | desktop | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000003 | mobile | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000004 | desktop | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000004 | mobile | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000005 | desktop | 335 | 335 | 100.0% | 335 (100.0%) | 335 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000005 | mobile | 335 | 335 | 100.0% | 335 (100.0%) | 335 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000006 | desktop | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000006 | mobile | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000007 | desktop | 304 | 304 | 100.0% | 304 (100.0%) | 304 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000007 | mobile | 304 | 304 | 100.0% | 304 (100.0%) | 304 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000008 | desktop | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000008 | mobile | 288 | 288 | 100.0% | 288 (100.0%) | 288 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000009 | desktop | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000009 | mobile | 318 | 318 | 100.0% | 318 (100.0%) | 318 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000010 | desktop | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |
| hobbang.net | 2026-09-04T22-39-01 | p000010 | mobile | 241 | 241 | 100.0% | 241 (100.0%) | 241 (100.0%) |

</details>

### 6.2 Everything else — unchanged, and that is the safety result

| host | rows | coverage | alignment BEFORE | alignment AFTER |
|---|--:|---|---|---|
| **gs.severance.healthcare** | 8 | 100% on every row | 100% | 100% (unchanged) |
| **hobbang.net** | 60 | 100% on every row | **100% on every row** | 100% (unchanged) |
| linear.app (p000002–p000004) | 24 | 100% | 100% | 100% (unchanged) |

Over the full 172-row corpus, the new mechanism is **equal or better on every
single row and worse on none**.

### 6.3 hobbang.net — the overlap hypothesis, answered in the negative

The coordinator asked whether the `min-width: 0px` overlap trade at 640/700 might
dissolve if the descendants in question were simply unprobed. **They are not.**
All **60** hobbang page/viewport rows sit at **100% coverage and 100% alignment,
before and after** — every descendant already carries a probe record, on both
mechanisms. There is no measurement gap on hobbang, so its
`overlap-excess-ratio` 0.0333 → 0.1195 trade is a **genuine mechanism trade**,
not a coverage artefact. Dropped, as instructed.

### 6.4 Acceptance item 2

`gs.severance.healthcare` and `hobbang.net` were **not re-observed**, per the
coordinator's instruction, and their closure-canary runs remain valid. Proof they
are unaffected is the artifact comparison above: byte-identical probe element
counts across 28.7 → 28.75 on every page, plus 100%/100% coverage and alignment
on all 68 of their rows.

---

## 7. The durable deliverable — coverage and alignment as asserted quantities

### 7.1 Recorded, per page and per viewport

**In the probe artifact** (`layout-probe*.json`), new `coverage` block:

| field | meaning |
|---|---|
| `walked` | elements the walk parked |
| `measured` | elements still connected at measure time, minimised across widths |
| `documentElements` | **the denominator** — the deep walk of the same viewport |
| `ratio` | `walked / documentElements`, 4 places. **Absent when no denominator** |
| `starved` | below the floor after the bounded retry |
| `attempts` | probe passes made (>1 = a retry happened) |

plus `documentResponse` — the probe load's full HTTP status and every attempt.

**In `observation.json`**, the `layoutProbe` / `layoutProbeMobile` pointers now
carry `coverage` and `documentStatus`, so **a reader sees the collapse without
opening the probe file or instrumenting anything.**

**In the SiteSpec** (`layoutProbe` / `layoutProbeMobile`), new `nodeCount` and
`alignmentRatio`. `alignedElementCount` has never had a denominator in the
artifact, which is why "311" read the same as "2,283" for three waves.

### 7.2 The floors

| floor | value | where |
|---|--:|---|
| `PROBE_DOCUMENT_STARVATION_RATIO` | **0.1** | `src/observer/types.ts` |
| `PROBE_ALIGNMENT_MIN_RATIO` | **0.5** | `src/sitespec/compile-page.ts` |

Neither is a tuned guess. The starvation ratio is **defined as**
`CROSS_VIEWPORT_STARVATION_RATIO`, reusing an already-justified constant rather
than introducing a second one. The alignment floor is sized from the measured
distribution over all 172 probes recomputed under path identity:

```
161 / 172   at 1.0000                    exactly aligned
  8 / 172   0.9800 – 0.9910              linear.app `/` (hero differs between loads)
  3 / 172   0.0000                       every one a PROVEN capture failure
```

The whole distribution is `≥ 0.98` or `0.00`. **Nothing lies in between**, and
0.5 sits in the middle of that gap with an order of magnitude of margin either
way — which is what makes it a floor rather than a threshold.

### 7.3 The permanent checks

`scripts/smoke-multi-observer.ts` → **`testProbeCoverage`** (real Chromium, local
fixture server, 16 checks):

* a healthy probe records status 200 on one attempt, reports `walked`/`measured`,
  is not starved;
* **with no denominator it reports no ratio** rather than inventing one;
* **the canary**: a 503 probe load is *read and retried*, produces the exact
  3-element `html/body/pre` shape, is **marked starved**, and the whole probe is
  retried before the verdict;
* **the soft error** (HTTP 200 + error body — the shape no status check can
  catch): the starvation gate catches it and the retry **recovers the real page**;
  a soft error that never recovers stays marked;
* **negative control**: a legitimately tiny page is tiny in *both* walks and is
  never marked — proving the floor is a ratio against the run's own control, not
  an element count;
* **end-to-end**: a starved probe marks its viewport `probe-starved`, rolls up to
  the page, and leaves the deep observation usable;
* **the floor itself**, asserted on a real observation: both viewports' coverage
  ≥ `PROBE_DOCUMENT_STARVATION_RATIO` and alignment ≥ `PROBE_ALIGNMENT_MIN_RATIO`.

`scripts/smoke-sitespec.ts` → **`probeAttachmentChecks`** (pure, offline, 13
checks): identity pairs on an aligned page; an inserted element no longer
discards the page after it; no pair attaches to the inserted node; a reparented
element attaches nothing; **a changed ancestor withholds its entire subtree**;
pairs strictly ascending on both sides; under-100 and truncated attach nothing;
and the canary — a 3-element error-page probe attaches **nothing** to a
400-element tree.

---

## 8. Verification

### 8.1 Re-observation — acceptance item 1

`linear.app` re-observed with the fix. Observation run
**`2026-09-05T11-51-47-573Z`** (4 pages, 238.5 s, status `completed`).

| page | deep desktop | deep mobile | **desktop probe** | **mobile probe** | desktop ratio | mobile ratio | doc status | starved |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| p000001 | 2291 | 2263 | **2291** | **2306** | 1.000 | 1.019 | 200 / 200 | no / no |
| p000002 | 2230 | 2230 | 2230 | 2230 | 1.000 | 1.000 | 200 / 200 | no / no |
| p000003 | 1363 | 1363 | 1363 | 1363 | 1.000 | 1.000 | 200 / 200 | no / no |
| p000004 | 364 | 364 | 364 | 364 | 1.000 | 1.000 | 200 / 200 | no / no |

`p000001` mobile probe **3 → 2,306**; desktop **2,291**, both in the expected
range. No viewport carries a `sourceIntegrity` mark. **Every page now carries its
coverage numbers in `observation.json` itself.**

### 8.2 Re-compile — alignment, acceptance item 1

SiteSpec run **`2026-09-05T12-07-20-025Z`**, compiled from that observation.

| page | viewport | BEFORE (`2026-09-04T23-34-15-786Z`) | AFTER (`2026-09-05T12-07-20-025Z`) |
|---|---|---|---|
| p000001 | desktop | `aligned=false` **1379** (927 unprobed, ratio not recorded) | **`aligned=true` 2291/2291, ratio 1.0000** |
| p000001 | mobile | `aligned=false` **0/2291**, `refusedReason: tag-walk-mismatch` | **2261/2263, ratio 0.9991** |
| p000002 | both | `aligned=true` 2230 | `aligned=true` 2230/2230, ratio 1.0000 |
| p000003 | both | `aligned=true` 1363 | `aligned=true` 1363/1363, ratio 1.0000 |
| p000004 | both | `aligned=true` 364 | `aligned=true` 364/364, ratio 1.0000 |

Every viewport is now at **ratio ≥ 0.9991**, against a floor of 0.5. The 927-node
desktop gap and the 1,995-node mobile gap are both closed, and `alignmentRatio` /
`nodeCount` are now present in the artifact where nothing was before.

`p000001` mobile reports `aligned=false` at ratio 0.9991 — correctly: the probe
walked 2,306 and the deep walk 2,263, so full gap-free equality is genuinely
false. 99.91% of nodes still carry their own measurement. That is exactly the
distinction the two fields exist to draw.

### 8.3 Suites

| suite | before | after | floor | result |
|---|--:|--:|--:|---|
| `scripts/smoke-multi-observer.ts` | 293 | **318** | ≥ 298 | PASS |
| `scripts/smoke-sitespec.ts` | 466 | **474** | ≥ 466 | PASS |
| `pnpm typecheck` | 0 | **0** | 0 | PASS |

### 8.4 Pre-fix failure count (revert-in-place)

Each fix was reverted **in place**, its suite run, and the file restored from a
byte-copy verified with `shasum -a 256 -c`.

| reverted | suite | result | the check that caught it |
|---|---|---|---|
| `src/sitespec/compile-page.ts` → pre-28.75 index prefix | smoke-sitespec | **473/474, 1 failure** | *"an INSERTED element no longer discards the page after it (the 28.75 defect)"* — `attached 150 of 400, prefix 150` |
| `src/observer/layout-probe.ts` → bare `page.goto`, no starvation gate | smoke-multi-observer | **304/318, 14 failures** | see §8.5 |

**Restore integrity — `shasum -a 256 -c`:**

```
src/observer/layout-probe.ts:      OK
src/observer/navigate-document.ts: OK
src/sitespec/compile-page.ts:      OK
src/observer/observe-page.ts:      OK
```

### 8.5 Un-fix failure detail (observer)

`probeLayout` reverted in place to the pre-28.75 shape — a bare `page.goto`
whose response is discarded, and the starvation gate returning `false`
unconditionally. **304/318, 14 failures**, every one of them a 28.75 check:

```
FAIL  a healthy probe records its document status 200 on ONE attempt
FAIL  …and reports coverage with walked/measured, on one probe attempt
FAIL  given the deep walk's count, a healthy probe reports ratio ~1 and is NOT starved
FAIL  CANARY: the probe's OWN document status is read — a 503 is recorded, not walked blindly
FAIL  CANARY: …the probe is MARKED starved against the deep walk's count, never silent
FAIL  CANARY: …and the whole probe was retried before the verdict was taken
FAIL  a SOFT error (200 + error body) answers 200 — so no status check could ever catch it
FAIL  …the starvation gate catches it anyway and the RETRY recovers the real page
          — walked 3 of 128 — undefined              ← THE DEFECT, REPRODUCED
FAIL  a soft error that NEVER recovers stays marked starved after the bounded retry
FAIL  NEGATIVE CONTROL: a legitimately tiny page is tiny in BOTH walks — 3 element(s)
FAIL  END-TO-END: a starved probe MARKS its viewport with `probe-starved` — [null,null]
FAIL  END-TO-END: …and it rolls up to the page
FAIL  FLOOR: the desktop probe's COVERAGE is at or above the starvation floor
FAIL  FLOOR: the mobile probe's COVERAGE is at or above the starvation floor
```

The line that matters is **`walked 3 of 128`**: the reverted probe reproduces the
exact `linear.app` failure inside the suite — a 3-element walk of a 128-element
page, recorded with no complaint. The two **ALIGNMENT** floor checks PASS under
this revert, correctly: they measure the sitespec fix, which was not reverted.

### 8.6 The scroll fix is untouched

The lane's edits to `layout-probe.ts` are confined to the import block,
`ProbeLayoutOptions`, and the body of `probeLayout`. `runScrollPass` and
`autoScrollPrepare` were not edited, and every value the 28.75 observer lane set
is still in place and asserted by the suite:

```
SCROLL_STEP_FRACTION          0.5
SCROLL_MAX_STEPS               70
SCROLL_STEP_SETTLE_MS         700
SCROLL_MAX_TOTAL_MS        60_000
SCROLL_NO_PROGRESS_TOLERANCE    3
window.scrollTo({ …, behavior: "instant" })
```

`seoultone.kr` remains **SOURCE_UNAVAILABLE** and was **not attempted**; no
acceptance is claimed for it.

---

## 9. Remaining risk

1. **The trigger is still out there.** The fix converts a transient upstream
   error into a retry and, failing that, into a loud mark. It does not make
   `linear.app`'s edge reliable. A run in which *both* probe attempts fail will
   now produce a marked, refused probe — honest, but still no width evidence for
   that viewport.
2. **`MAX_PROBE_ATTEMPTS = 2` costs a second full probe pass** on a starved page.
   On linear `/` that is ~90 s. Bounded to one extra pass for that reason.
3. **Path identity is stricter than a prefix in one direction.** An element whose
   ancestry legitimately differs between the two loads now attaches nothing where
   a prefix might, by luck, have covered it. Measured cost across 172 real
   probes: none — every row was equal or better.
4. **The alignment floor (0.5) is asserted in the suite, not enforced by the
   compiler.** A page that genuinely changes between loads must still compile.
   The floor's job is to make a collapse fail loudly in a lane, which is where
   the last one got through.
5. **`p000001` desktop deep walk moved 2306 → 2291** between the pre-lane and
   these runs. That is linear's own hero nondeterminism, visible in the run
   history since 2026-09-02, and is not affected by anything in this lane.
