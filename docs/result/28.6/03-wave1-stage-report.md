# Task 28.6 — Wave 1 Stage Report (Foundation Lanes W1/W2/W3)

- Stage: PROGRAM A remediation foundation, Wave 1 of the 28.6 build
- Date: 2026-09-02
- Orchestrator verdict for the stage: **ACCEPTED WITH MANDATORY CORRECTIONS** (all three corrections folded into Wave 2)
- Baseline commit: `6c2e723601a0d76431c96a48bbdb4726c02063e7`, branch `main`, no git mutation performed

## 0. What Wave 1 was for

Program A proved four distinct engine defects by measurement. Fixing them required three
capabilities the engine did not have: it could not *read* the CSS that authored the responsive
behaviour (cross-origin stylesheets were silently skipped), it could not *interpret* a media
condition into a comparable pixel breakpoint, and it could not *measure* whether a
reconstruction was right at any width other than 1440. Wave 1 built those three. It deliberately
did not fix any reconstruction defect: that is Wave 2.

Three single-writer lanes ran in parallel on disjoint file sets, each followed by a fresh
adversarial verifier that did not write the code it audited.

| Lane | Scope | Builder status | Independent verdict |
|---|---|---|---|
| W1 | Observer CSS truth recovery | COMPLETE | PASS_WITH_CORRECTIONS |
| W2 | Media-condition tokenizer | COMPLETE | PASS_WITH_CORRECTIONS |
| W3 | Five-width responsive QA harness | COMPLETE | PASS_WITH_CORRECTIONS |

No lane FAILED. No lane was allowed to self-certify.

## 1. W1 — Observer CSS truth recovery

### Result

The single most consequential number in Wave 1:

| Site / page | Sheets | CSSOM-blocked | Recovered | Missed | Nodes with authored CSS |
|---|---|---|---|---|---|
| linear.app/pricing | 81 | 30 | 30 | 0 | 1,363 of 1,363 |
| stripe.com/ | 6 | 6 | 6 | 0 | 1,755 of 1,755 |

Before this lane, a cross-origin stylesheet threw `SecurityError` on `.cssRules` and was skipped
without a counter. Stripe's entire stylesheet set is cross-origin, so the engine had been
reconstructing Stripe with **zero** authored CSS and no signal that anything was missing.

The acceptance target was the specific Linear rule that Program A identified as the root of the
1100px pricing defect. It is now recovered:

```
.PDOlRq_row { grid-template-columns: 2fr repeat(4, 1fr) }   [origin=fetched]
  (max-width: 1024px)   present, 707 declarations
  (min-width: 1025px)   present, 2 declarations
```

Recovery uses `page.on('response')` to capture bodies the browser already fetched, then reparses
them with a constructed `CSSStyleSheet` that is **never adopted**. No extra network request is
issued and the page's own rendering is untouched.

### Also landed

- `@supports`, `@container`, `@layer` now recorded in their own fields. On Stripe alone, 69
  declarations sat under `@supports` and 36 under `@container`; both classes had previously been
  recorded as *unconditional*, which is a wrong value, not a missing one. 22,642 more sat under `@layer`.
- Desktop probe widths widened to 390/700/768/1024/1100/1440/1920; a new mobile probe artifact
  (`layout-probe-mobile.json`) at 390/480/700/768/914 walks the mobile DOM with its own element identity.
- `MAX_LAYOUT_RULES` 2,000 to 6,000. The old cap was being hit on Linear (2,087 rules needed) and
  the index fills in sheet order, so a cap that bites drops the *last-loaded, cascade-winning* sheets.
- `StylesheetCoverage` counter block so every skip is now counted rather than silent.
- `SCHEMA_VERSION` deliberately not bumped: every addition is optional and every pre-28.6 artifact
  still validates.

### Cost

| Measure | Delta per page |
|---|---|
| Desktop probe, 5 to 7 widths | +3.0 s, +99 KB |
| Mobile probe pass | +5.9 s, +271 KB |
| `dom.json` authored declarations | +5.06 MB per viewport |
| Whole observation, linear /pricing | 28.7 s |

The storage figure is the verifier's corrected measurement, not the builder's. It decides whether
a de-duplicated authored-rule table is optional; at roughly 81 MB per eight-page two-viewport
site, with six pilots to come, Wave 2 must give a measured recommendation.

### What the verifier caught

The lane introduced one **new wrong-value path**, narrow but real. The sheet-level `media`
attribute is never read: the collector iterates `document.styleSheets` and touches only
`sheet.cssRules`. A cross-origin `<link media="print">` was invisible before Wave 1 and is now
recovered as a *fabricated unconditional declaration*. That is exactly the class of error the
lane existed to eliminate, moved up one level. The verifier's fixture proves both halves and also
exposes a pre-existing same-origin instance of the same bug.

The lane also added **zero permanent regression checks** while rewriting ~870 lines and adding a
whole CORS subsystem. The mobile-probe element-identity invariant, which would silently corrupt
every future mobile layout rule, is asserted by nothing in the repo. The verifier left 44 runnable
assertions at `tmp/wr286/W1-verify/` as a specification for landing them.

Two reported numbers were wrong and are retracted here: the 28.5C baseline for linear.app/pricing
is **17 of 1,363**, not "34 of 3,254"; and `bytesCaptured` reports all stylesheet responses held
in memory (446,461 bytes), not the blocked-sheet payload that actually crossed (151,157 bytes).

One side effect went unannounced: `:root` custom-property counts roughly doubled, 170 to 358 on
linear.app/pricing desktop. That moves theme extraction output and the theme lane was never told.

## 2. W2 — Media-condition tokenizer

A new dependency-free 995-line module, `src/sitespec/media-condition.ts`, turning an authored media
condition into comparable pixel breakpoints. 106 new checks, suite 257 to 363, zero pre-existing
checks altered.

The design decision that matters downstream: every bound carries `boundary: {below, above}` with
`above === below + 1`. So `(max-width: 1024px)` and `(min-width: 1025px)` resolve to the same
boundary `{1024, 1025}`, and a generated band edge lands exactly where the source authored its
layout change regardless of which form the author used.

Refusals are deliberate and uniform. Any `not` returns `unsupported` rather than risking a wrong
inversion, because a wrong inversion hides content at a width where the source shows it.
`calc()`, `var()` and viewport-relative units are refused for the same reason. Four statuses
partition the fold so a caller can distinguish "this source authored no breakpoints" from "we
could not read them".

Measured against the real corpus: 20 of 20 observed media strings parse cleanly, 0 unparsed.
13 malformed inputs plus 6 non-string types plus a 200-deep balanced nest all return clean
`unparsed` without throwing.

### What the verifier caught

Two defects that would have propagated straight into reconstruction band edges:

1. **Balanced garbage parses clean.** The nested-group branch returns `width-irrelevant` by
   default, so `(())` reports a successful parse. That silently defeats the module's own
   `unparsedCount` gate, which is the exact signal downstream code was going to trust.
2. **Unsatisfiable conditions inject phantom snap targets.** `(min-width: 64px) and (max-width: 32px)`
   is correctly flagged `empty: true` at parse time, but the fold never consults that flag and
   still contributes two histogram entries. The reconstruction lane snaps band edges to that
   histogram.

Also: `print and (min-width: 900px)` returns `widthRelevant: true` with populated top-level
bounds. The fold guards it correctly, but the handoff advertises those top-level fields as the
primary read, so a caller following the handoff walks into it.

The module is dead code until Wave 2 wires it in, so its correctness today rests entirely on
those 106 checks.

## 3. W3 — Five-width responsive QA harness

A new subsystem, `src/responsive-qa/`, run as `pnpm qa:responsive`, capturing source and clone at
390/700/1024/1100/1440 and classifying each pair PASS/MINOR/MAJOR/BLOCKER across 28 channel
readings recorded whether or not they fire. This is the instrument the whole task will be graded by.

Its central design problem was correspondence. Reconstruction strips source class and `data-*`
identity, which is why 28.5C's `[data-plan]` probe silently measured only the source side. The
harness keys on normalized visible text for text leaves and `alt`/`aria-label` for labelled
images, and it refuses to let position distributions raise severity below a 35% matched fraction.

### Baseline verdicts on the accepted 28.5B Linear clone

| Route | 390 | 700 | 1024 | 1100 | 1440 |
|---|---|---|---|---|---|
| `/` | MINOR | BLOCKER | BLOCKER | BLOCKER | MAJOR |
| `/pricing` | MINOR | MAJOR | BLOCKER | BLOCKER | MINOR |

Two findings are new, i.e. not visible to any 28.5C instrument:

- **`/` at 1440 is not clean.** Nine in ten matched boxes land within 55px of their source left
  edge, worst case 405px, against a 48px threshold. The older clip-based channel calls the clone
  *better* here (28 offscreen chars against the source's 99). This is precisely the blind spot the
  28.5C audit named, now measured.
- **`/` at 700 renders 84 of the source's 234 visible images**, 36%, against a 50% threshold.

Verdicts reproduced 10 of 10 across two independent live runs.

### What the verifier caught

**PASS is not reachable.** The pixel-JND channel fires at or above 1% on every real
reconstruction, observed floor 1.72% on a pair the verifier judged structurally identical. The
clean end of the scale therefore carries no information, and any operator gate written as
"require PASS" would never fire. Gates must read `summary.blockerPairs` and `majorPairs`.

Consequently the builder's headline claim is corrected: 28.5C's accepted `/pricing` baseline was
PASS/MAJOR/BLOCKER/BLOCKER/PASS, not MINOR/MAJOR/BLOCKER/BLOCKER/MINOR. The honest statement is
that the **severity class matched at 5 of 5 widths**, with the two PASS widths reading MINOR
because of the pixel-JND floor. The "5/5 exact" claim is retracted.

Three more instrument defects, in descending order of how much they will distort the six pilots:

- The probe does **not** scroll while the full-page screenshot **does**, so lazy-revealed content
  is outside every numeric channel on both sides while still appearing in the images a human
  reviews. One pilot candidate has 101 of 102 images lazy-loaded.
- `measureLandmark` silently excludes any element wider than 1.5x the viewport. The failure points
  the wrong way: the worse the horizontal overflow, the likelier the offending element is dropped.
- The `p:` tag-path correspondence pass matched **zero** nodes on every pair, so `matchedFraction`
  is depressed in proportion to a page's unlabelled-icon count and is not a quality signal.

The trust-guard claim is also downgraded: it suppressed one MAJOR finding on each of two pairs and
changed no verdict.

## 4. Regression posture at end of Wave 1

| Suite | Checks | Failures | Baseline | Delta |
|---|---|---|---|---|
| sitespec | 363 | 0 | 257 | +106 |
| multi-observer | 62 | 0 | 62 | 0 |
| custom-properties | 92 | 0 | 92 | 0 |
| visual-vocab | 88 | 0 | 88 | 0 |
| reconstruction-qa | 134 | 0 | 134 | 0 |

`pnpm typecheck` read exit 2 at one point in the wave, from `src/responsive-qa/probe.ts` while a
concurrent lane still had it mid-edit. It reads exit 0 with that directory excluded and no error
referenced any other lane's files.

**The honest gap:** 106 of the 106 new checks belong to one lane. W1 rewrote the observer and
added none; W3 built a whole new subsystem and added none, because `scripts/` was outside its
ownership. Two of Wave 1's three deliverables have no CI coverage at all.

## 5. What Wave 2 carries

Every required correction above is assigned. Corrections are not optional and are not deferred:
the reconstruction lane building on top of this foundation would otherwise snap band edges to
phantom breakpoints, trust an `unparsedCount` gate that cannot fail, and be graded by an
instrument that cannot report a clean result.

Highest-priority items, in order:

1. Read the sheet-level `media` attribute, or refuse and count such sheets (W1 wrong-value path).
2. Land the mobile-probe identity, cascade-position and non-adoption invariants as permanent checks.
3. Skip unsatisfiable intervals in the breakpoint fold, and return `unparsed` for balanced garbage.
4. Make PASS reachable, or make the harness state in machine-readable form that it is not.
5. Scroll to settle lazy content symmetrically on both sides before probing.

Carried, unassigned, and deliberately not started: a de-duplicated authored-rule table; a
specificity resolver for the per-element 32-declaration cap, which currently keeps the first 32 in
sheet order and can drop the winner (54 elements on Linear, 4 on Stripe); barrel re-export of the
probe helpers from `src/observer/index.ts`.
