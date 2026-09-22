# Task 28.8 — Final adjudication

**Adjudicator:** fresh context, no implementation involvement in any 28.7 / 28.75 / 28.8 lane, no
preferred outcome supplied. Every load-bearing claim below was re-derived from a run artifact, a
source file or an image. Reports were used to locate claims, never as evidence for them.

---

## 1. Verdict

> ## NOT READY - GENERIC PRODUCT BLOCKERS REMAIN

This is a judgement about the reconstruction's readiness for a human acceptance review, and nothing
more. It is not, and must not be read as, a rejection of the wave's engineering, whose honesty I
found to be materially better than its results.

---

## 2. Reasoning

**What decided it.** The dominant defect class is generic, it is unrepaired after both permitted
correction cycles, and it produces precisely the failures the acceptance brief names as *not
acceptable*. I confirmed it with my own eyes on two unrelated sites rather than on one awkward page.

At 1024, linear `/`'s clone lays its content out to `contentMaxRight` **1838** inside a 1024px
viewport whose `scrollWidth` is **1024** — so the excess is clipped, not scrollable. On screen the
header nav truncates mid-word after "Customers / Pri…", and the footer's fourth column is sliced at
the right edge with **Connect and Legal entirely offscreen and unreachable**. On `/pricing` @1024 the
primary nav is simply absent — "Log in / Sign up" and no hamburger, against a source carrying five
links. On `gs.severance.healthcare` @1100 — a legacy Korean hospital site sharing no framework,
no era and no idiom with linear.app — the same class recurs: 건강정보, the search control and the
hamburger fall past the right edge with `clone scrollWidth = 1100` and no horizontal scroll, while
the *source* at that width has 180px of overflow a real user can scroll to. The clone is therefore
less reachable than the original. Two independent sites, one mechanism.

That mechanism is architectural and named, not incidental: only two DOM trees are ever observed
(390 and 1440), so a third layout served at 700 does not exist anywhere in the system; and the
containing-block guards refuse to release the frozen desktop width at 1024/1100 because those widths
were never *starved* of measurement — the desktop probe was already at 2291/2306 before cycle 2's
fix, so restoring the mobile probe moved 700 (1838 → 1575 against a source 1627) and could not move
1024 or 1100. The architecture auditor's negative sweep — 403 `.ts` files, zero hostname/selector
branching, only `127.0.0.1`, `localhost` and `x.invalid` as literals — is the strongest evidence in
the whole corpus, and it cuts *against* readiness here: because nothing is site-fitted, a defect that
reproduces on two sites is a property of the engine, and the next site inherits it.

The second class is equally visible. On `hobbang.net` `/` @390 I cropped the footer at 1.8× and found
the inline link block rendered as three superimposed rows of colliding Korean glyphs — 주소모음/교육,
링크모음/AI도구, 검색/스포츠중계, 커뮤니티/코인 stacked on top of one another and partly illegible.
"Obvious overlapping footer rows" is on the brief's not-acceptable list verbatim. It survived the
grid-track/width recovery pass **byte-identically** at 390 and 1440, which means the lever has not
been found; an unidentified root cause cannot be bounded to one source.

**Direction of travel, as measured.** It is genuinely positive and I want it on the record.
Human-acceptable output went **4/20 (20%) in 28.7 → 7/16 (44%) in 28.75**; human BLOCKERs 9 → 6.
Severance's two 28.7 overlap BLOCKERs are closed on the artifact (`overlap-excess-ratio` 0.0016 @1100,
0.0012 @1440), linear `/` @700's overlap is 0.0045, hobbang's self-check floor is PASS/PASS/PASS, and
two defect classes that had **no QA channel at all** in 28.7 now have one. Two production defects the
regression caught — the probe 100-element floor discarding valid evidence on any aligned page under
100 nodes, and `compatibility.ts` silently downgrading near-white-on-white from `incompatible` to
`compatible-with-warnings` — were real safety bugs found and fixed, not test noise. But the corpus
shrank (seoultone's origin went down mid-wave, costing 2 of 18 pairs) and `RUBRIC_VERSION` moved
4 → 6, so the two tallies are not strictly comparable. And the width defect is *better instrumented,
not closed*: `missing-text-ratio` at 700 rose 0.068 → **0.157** precisely because the freeze that was
hiding it partially released. Honest measurement moved; the page did not.

**What nearly changed my mind — twice.**

First, **concentration**. This is not diffuse unreliability, and that distinction matters as much as
the brief says it does. Two named classes account for 6 of 6 human BLOCKERs and 3 of 3 MAJORs.
Everything else in the corpus — heading word-joins, six corrupted SVG icons, one dropped table row, a
missing "US$" prefix, tight CJK wrapping — is polish. At the two widths the engine actually observes,
the output is good: linear `/pricing` @390 and @1440 are graded PASS by an independent human who
could find nothing beyond "US$10" → "$10", and I confirmed linear `/` @390 reproduces hero, nav,
sign-up, hamburger and body faithfully. A system with two understood, localised defects is a far
better position than a 44% pass rate suggests, and if the product's scope were "reconstruct at the
observed widths" I would have gone the other way. It is not: "responsive" is in the stated goal, and
at 700 / 1024 / 1100 the score is **0 of 7**.

Second, the **framing** — whether it is worth a human's time to look. The review pack is well built,
the failures are legible in it, and a human would learn a great deal in twenty minutes. But the
verdict pair I am given turns on whether generic product blockers remain, and they demonstrably do.
A human asked to *accept* this would be asked to accept navigation offscreen and footer columns
unreachable on two of three sites — the exact items the brief pre-declares unacceptable. Sending that
to acceptance would spend the human's authority on a question the artifacts have already answered.

Two further facts sealed it rather than swayed it. The wave's own pre-registered bar failed: 28.7's
written acceptance test for its successor was *"`footer-clipped` at 0 on linear.app `/` at 700, 1024
and 1100"*; the final run reads **1 at all three**. And the instrument cannot yet certify anything —
`pixel-residual-difference-ratio` fires MINOR on **16 of 16** pairs, its best value anywhere is
**0.015184** against its own 0.01 threshold, on `/pricing` @1440, the pair two independent observers
call PASS. Machine PASS is unreachable by construction. The wave was right to refuse to lower the
threshold to manufacture one; the consequence is that a human is required for every pair.

---

## 3. Generic blockers remaining

Each is justified as generic by a mechanism that does not reference the source, not by its count.

### G1 — Frozen desktop canvas clipped, not scrolled, at intermediate widths
*5 of 6 human BLOCKERs, plus 1 MAJOR.* linear `/` @700/@1024/@1100, linear `/pricing` @1024/@1100,
severance @1100.
**Why generic:** reproduces on two sites with nothing in common (React SPA / legacy Korean hospital
CMS); root cause is the two-DOM-tree observation limit plus containing-block guards that refuse
release where probe measurement already exists; zero site-specific code in 403 swept files.
**Verified:** clone `contentMaxRight` 1838 vs source 1527 (@1024) and 1509 (@1100) with
`scrollWidth == innerWidth`; `footer-clipped = 1` (source 0) on four pairs; images read by eye.
**Consequence:** navigation offscreen, footer columns unreachable, body copy cut mid-sentence,
unfittable flex children collapsing into half-page voids — four separate entries on the
not-acceptable list.

### G2 — Overlapping inline link rows on CJK text
*1 human BLOCKER, 2 MAJORs.* hobbang `/` @390/@1100/@1440.
**Why generic:** not a grid defect and not a site hack — a line-box/text-metric fidelity gap in which
labels wrap where the source did not and the wrapped tails overflow their row. It is byte-identically
unchanged across two engine builds, so **the responsible mechanism has not been located**; a defect
with no identified root cause cannot be scoped to one source. Confidence is lower than G1 (one site,
mechanism unknown), but the honest classification of an unlocated cause is "generic".
**Verified:** own crop of hobbang @390 footer at 1.8× — glyphs superimposed, partly illegible.

### G3 — The rubric cannot certify, and is miscalibrated in both directions
**Why generic:** it is the instrument, so it damages every future judgement made with it.
*Too strict:* 0/16 machine PASS; `pixel-residual-difference-ratio` fires 16/16, best 0.015184 vs a
0.01 threshold, on a human PASS. *Too lenient:* hobbang @390 is machine MINOR and human BLOCKER —
an ~80px collision averaged over a 17,167px page is invisible to a whole-page pixel ratio.
**Consequence:** the machine verdict distribution must not be read as a product score, and no site
can be released without a human grading every pair.

### G4 — The blank-region ink leg is disabled by page length
**Why generic:** the trigger is `REGION_INK_DOM_COVERAGE_MIN = 0.8` measured against page height
(`src/responsive-qa/blank-region.ts:721`), which is a property of long pages, not of hobbang.
**Verified on the corrected run** (`2026-09-05T11-13-31-951Z`): withheld on **3 of 3** hobbang pairs
(DOM census reaches 50% / 51% / 51%), 0 of 10 linear pairs. The wave's flagship new channel — the one
built to catch the severance blank hero — is off on every long content page, and in that
configuration the rubric grades a white-on-white hero healthy. Disclosed exemplarily in the artifact;
still architecturally open.

### G5 — Content-node loss and asset corruption
linear `/pricing` @1024 drops all seven customer logos leaving a blank band; hobbang drops one of
eleven verification-table rows at 1100 and 1440 (present at 390); severance renders six quick-menu
icons as disconnected arcs. Lower blast radius, mechanism not site-keyed, plainly visible.

### G6 — The old QA path still crops silently
`src/reconstruction-qa/screenshot-diff.ts:208-210` still reduces to `min(width) × min(height)` with
no band accounting — the exact defect L3 closed in `responsive-qa`. Verified in source. Disclosed,
tripwire-guarded, deliberately left under a spent budget; anyone reading `reconstruction-qa` output
is reading a silently cropped comparison.

---

## 4. Source-specific limitations remaining

These are real and should **not** be weighed against the work.

- **seoultone.kr was never validated this wave.** Its origin has served a 406-byte Cafe24
  over-traffic stub since mid-wave. Correctly recorded as `SOURCE_UNAVAILABLE`, never as a
  reconstruction failure. It costs 2 of 18 canary pairs and the seoultone legs of gate clauses A
  and D. This is an availability accident, not a defect.
- **linear `/` @1440 animation-frame divergence.** The agent-demo panel is captured at a different
  clock (7:18 pm vs 8:51 pm). Explicitly acceptable per the brief. See §5.3 for the one caveat.
- **Heading word-join and inline-run relocation on linear** ("Intakeand integrations",
  "…major enterprises.40,000"). A typographic bug on one site's heading markup; nothing is lost.
  Caps linear's best pairs at MINOR and blocks nothing.
- **Six corrupted quick-menu SVG icons on severance.** A stroke-reconstruction failure on one site's
  icon set. Conspicuous, cosmetic; the page still reads as the hospital's homepage.
- **`US$10` → `$10` on linear `/pricing`.** Systematic within one site, purely cosmetic.
- **hobbang's 17,167px page height** is what trips G4 in this corpus — but the *threshold* is
  generic, so the limitation is listed above as G4 and only its instance is source-specific.

---

## 5. Claims I checked and found wrong or overstated

I found four. Two are stale rather than false, and both stale ones point **toward** the work.

### 5.1 `10-final-architecture-audit.md` F1 is now resolved, and a reader taking it at face value would be misled
F1 — the audit's own "most serious" finding — states that the human review pack grades hobbang on a
stale engine (`gridAreaFill: 0`, run `…10-20-57-685Z`). **This is no longer true.** The audit is
stamped ~22:00–22:06 KST; `human-review/manifest.json` carries `generatedAt`
`2026-09-05T13:08:32Z` = 22:08 KST. The rebuilt manifest pins hobbang to
**`2026-09-05T11-13-31-951Z`** (`gridAreaFill: 328`), `index.html` references only that run
(10 refs, zero to the stale run), and the visual auditor re-cropped and re-graded all three hobbang
pairs on it (§6 provenance note). The pack no longer mixes engine versions. *Residual, minor:* the
stale `…10-20-57-685Z` PNGs are still physically present in `hobbang/shots/` (12 files), unreferenced
— the same housekeeping carry-forward 28.7 recorded. Worth noting that the re-grade **changed no
grade**, which strengthens rather than weakens G2.

### 5.2 `10-final-architecture-audit.md` F2 is now resolved — the regression totals do exist and reproduce exactly
F2 states the wave's regression is "7 of 36 suites" and any "N suites / M checks" claim is
unverified. The run completed at 03:04–03:05 on 2026-09-06. I re-derived the total independently
from `tmp/wr2875/regression/index.tsv` without reading `07-regression.md`'s figure: 34 suites parse
numerically to **4,575**, plus `smoke-visual-vocab`'s **88** (recorded `UNPARSED` in the tsv, real in
its log) = **4,663** across **35** assertion suites, with `smoke-playwright` as the 36th
(no assertions). Every suite `exitCode 0`; `typecheck exit=0`. That is exactly the claim in
`07-regression.md`, digit for digit, and it clears the 28.7 floor of 4,326 with no negative
per-suite delta. F2(b) is also settled: `layout-safety` now reads **455/455** on disk, matching the
orchestration log against which the audit could only find 451.

### 5.3 `08-closure-adjudication.md` overstates the linear `/` @1440 exculpation
Blocker 4 says the pair "shows 432 chars 'missing' and 432 chars 'extra', **the same agent-demo panel
caught at a different frame**". The counts are exactly right — I read `missingChars 432` forward and
`432` reverse from the artifact — but **the two sets are not the same**: 17 strings forward against
14 reverse, and the reverse set contains genuine defects, not frame noise:
`"intakeand integrations"`, `"build, review,and ship"`, `"ai andautomations"`,
`"planningand monitoring"` (the word-join bug) and
`"linear powers over product teams. from ambitious startups to major enterprises."` (the relocated
"40,000"). So part of that channel reading is real content damage that the brief does **not** excuse.
The conclusion drawn from it — that `missing-text-ratio` uses the wrong unit and over-called this
pair — still stands, and the auditor's MINOR grade is still right. The specific exculpation is
cleaner than the data.

### 5.4 A presentational trap worth flagging, not an error
Clause B cites the clone canvas "pinned 1838", while the `footer-clipped` finding text on the same
pairs reads "clone max right **1390**". Both are true — 1838 is `contentMaxRight` for the document,
1390 is the footer subtree's own extent — but they appear side by side describing the same failure
and invite a reader to think one contradicts the other. I verified both against the artifact.

**Everything else I checked reproduced.** Machine tally BLOCKER 6 / MAJOR 6 / MINOR 4 / PASS 0;
`footer-clipped = 1` on exactly 4 pairs with source 0; `missing-text-ratio` 0.157 @700 and 0.121
@1024; clone `contentMaxRight` 1838 vs 1527/1509; best `pixel-residual` 0.015184 on `/pricing` @1440;
severance overlap 0.0016 / 0.0012; ink leg withheld 3/3 hobbang, 0/10 linear;
`screenshot-diff.ts:208-210` still cropping. No lane handoff overclaims — `28.75-grid-tracks.json`
and `28.75-width-chain.json` both self-report their gate clause **NOT MET**. I found **no fabricated
number anywhere in this corpus.**

---

## 6. What a human reviewer should look at first

Twenty minutes, in this order. Numbers first, then the four images that decide it.

**1. Two numbers, before any image.**
`docs/result/28.75/human-review/manifest.md` — read the `contentMaxRight` line in
`06-closure-canary.md` §98–100 alongside it: **clone 1838 at 700, 1024 and 1100 while the source
reflows 1627 / 1527 / 1509**. That single constant is the product blocker. Then
`pixel-residual-difference-ratio`'s best value anywhere, **0.015184 against a 0.01 threshold** — that
is why no machine PASS exists and why your eye, not the rubric, is the instrument.

**2. The blocker, on the site the engine understands best.**
`human-review/linear/shots/2026-09-05T12-46-21-873Z-root-1024-03-linear-app-root-1024-{source,final}.png`
— compare the **top 700px** (nav truncates after "Customers / Pri…") and then rows **9300–9960**
(source shows six footer columns in two rows; clone shows three and a half, with **Connect and Legal
gone**). This is the whole argument in two crops.

**3. The same blocker on an unrelated site — this is what makes it generic.**
`human-review/severance/shots/2026-09-05T10-23-24-422Z-gs_index_do-1100-02-…-{source,final}.png`,
**top 340px**. Source: 진료과/의료진 · 예약/결과/발급 · 병원안내 · 건강정보 · search · hamburger.
Clone: the last three are gone, and `clone scrollWidth = 1100` means there is nowhere to scroll to.
If you look at only one thing after image 2, look at this — it is the difference between "one awkward
page" and "the next site will do this too".

**4. The instrument's worst miss.**
`human-review/hobbang/shots/2026-09-05T11-13-31-951Z-root-390-01-hobbang-net-root-390-final.png`,
**bottom ~900px, zoomed**. The footer link block is superimposed Korean glyphs. The machine graded
this pair **MINOR**. Trust your eye over the tally, everywhere in this pack.

**5. Then calibrate on what is actually good, so the verdict is not read as a dismissal.**
`…-pricing-1440-10-linear-app-pricing-1440-{source,final}.png` and the same pair at **390** — two
independent PASS grades, and I could not separate them either. Add
`…-root-390-01-linear-app-root-390` (machine BLOCKER, human MINOR, and the human is right). This is
what the engine does at the widths it observes, and it is the reason the remaining work is a
bounded repair rather than a restart.

**6. If you read one report end-to-end,** read `docs/result/28.8/09-final-visual-audit.md` §3 and §6.
§3 names the defect classes in the order they cost you; §6 documents the auditor discovering their
own pack was mis-assembled, re-grading from scratch, and reporting that nothing changed. That
paragraph is the best evidence in the wave that the numbers you are being shown are real — and note
that the provenance error it describes has since been fixed in the pack you will be looking at
(§5.1 above).

---

## 7. Bottom line

Concentrated, well-understood, honestly reported — and blocked. Two named defect classes explain
every blocker and every major; one of them is confirmed on two unrelated sites and unrepaired after
both permitted correction cycles, and it delivers navigation offscreen and unreachable footer columns
at three of the five tested widths. The instrument that would otherwise gate this cannot reach its
own top band on any real reconstruction. The wave's own hard gate failed three clauses, its
predecessor's pre-registered acceptance test failed, and Phase B correctly never started.

The engine produces human-acceptable pages at the widths it observes. It does not yet produce them
at the widths in between, and that gap is generic. **NOT READY - GENERIC PRODUCT BLOCKERS REMAIN.**
