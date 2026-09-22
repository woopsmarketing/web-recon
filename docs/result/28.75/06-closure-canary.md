# Task 28.75 — 06 Closure canary (measurement 1, pre-correction)

**Rubric version 6.** Fresh self-check floors measured in the same runs — mandatory, because
`RUBRIC_VERSION` moved 4 → 5 (blank-region channel) → 6 (L1 reorder + B7 normalization). No floor
or verdict from 28.7 is numerically comparable to anything here.

**Coverage conserved on all three sites** — every pair accounted for, `conserved: true`, 0
clone-route-missing, 0 source-capture-unstable, 0 measurement-failed, 0 demotions of any kind.
None of the improvement below comes from having stopped measuring.

## Provenance

| host | observation | site-spec | reconstruction | responsive-qa |
| --- | --- | --- | --- | --- |
| linear.app | `2026-09-04T22-34-32-296Z` | `2026-09-04T23-34-15-786Z` | `2026-09-05T10-13-17-947Z` | `2026-09-05T10-13-47-506Z` |
| hobbang.net | `2026-09-04T22-39-01-787Z` | `2026-09-04T23-34-52-203Z` | `2026-09-05T10-19-45-357Z` | `2026-09-05T10-20-57-685Z` |
| gs.severance.healthcare | `2026-09-04T22-33-34-567Z` | `2026-09-04T23-32-44-789Z` | `2026-09-05T10-23-08-511Z` | `2026-09-05T10-23-24-422Z` |
| seoultone.kr | — | — | — | **SOURCE_UNAVAILABLE** |

**16 of the 18 planned pairs.** seoultone.kr has served a 406-byte Cafe24 over-traffic stub since
~2026-09-05 00:00 UTC (HTTPS fails at the TLS handshake). Recorded as `SOURCE_UNAVAILABLE`, never
as a reconstruction failure.

Honest disclosure about the tree this was measured on: `scripts/smoke-layout-safety.ts` stood at
**445/451** when this canary ran. The 6 red checks are a cut-off lane's pre-written tests for a
band-aware grid mechanism that was never implemented, so the *behaviour* measured here is the
width lane's verified state. See `00-orchestration-log.md`.

## Verdict matrix

| host | route | w | verdict | floor | leading findings |
| --- | --- | ---: | --- | --- | --- |
| gs.severance | `/gs/index.do` | 390 | MAJOR | MAJOR | `position-delta-p90-px` 357 · `overlap-excess-ratio` 0.0156 |
| gs.severance | `/gs/index.do` | 1100 | MAJOR | MINOR | `pixel-uncompared-band-ink-ratio` 0.1142 · `position-delta-p90-px` 430 |
| gs.severance | `/gs/index.do` | 1440 | MAJOR | MINOR | `position-delta-p90-px` 510 · `overlap-excess-ratio` 0.0012 |
| hobbang.net | `/` | 390 | MINOR | MINOR | `overlap-excess-ratio` 0.0181 |
| hobbang.net | `/` | 1100 | MAJOR | MINOR | `overlap-excess-ratio` 0.0556 · `column-container-mode-delta` |
| hobbang.net | `/` | 1440 | MINOR | PASS | `overlap-excess-ratio` 0.0119 |
| linear.app | `/` | 390 | **BLOCKER** | PASS | `offscreen-text-excess-chars` 200 (source 427) |
| linear.app | `/` | 700 | **BLOCKER** | BLOCKER | `blank-region-ratio` 1.64 · `footer-clipped` 1 · `overlap-excess-ratio` 0.4446 |
| linear.app | `/` | 1024 | **BLOCKER** | PASS | `blank-region-ratio` 0.41 · `footer-clipped` 1 · `offscreen-text` 1466 |
| linear.app | `/` | 1100 | **BLOCKER** | PASS | `footer-clipped` 1 · `offscreen-text` 716 |
| linear.app | `/` | 1440 | MINOR | PASS | `missing-text-ratio` 0.0023 |
| linear.app | `/pricing` | 390 | MINOR | PASS | `missing-text-ratio` 0.0041 |
| linear.app | `/pricing` | 700 | MAJOR | PASS | `column-container-mode-delta` 2 · `position-delta-p90-px` 320 |
| linear.app | `/pricing` | 1024 | **BLOCKER** | PASS | `blank-region-ratio` 0.30 · `nav-link-ratio` 0.5 |
| linear.app | `/pricing` | 1100 | **BLOCKER** | PASS | `footer-clipped` 1 · `offscreen-text` 175 |
| linear.app | `/pricing` | 1440 | MINOR | PASS | `missing-text-ratio` 0.0029 |

**Tally: BLOCKER 6 · MAJOR 5 · MINOR 5 · PASS 0** (16 pairs). Every BLOCKER is on linear.app.

## The clearest result of the wave — gs.severance.healthcare

The two 28.7 BLOCKERs on this site are **closed**, on the same raw channel values, which are
comparable across rubric versions even though the verdicts are not:

| pair | channel | 28.7 | 28.75 | factor |
| --- | --- | ---: | ---: | ---: |
| `/gs/index.do` @1100 | `overlap-excess-ratio` | **0.4484** | **0.0016** | **280×** |
| `/gs/index.do` @1440 | `overlap-excess-ratio` | **0.3425** | **0.0012** | **285×** |
| `/gs/index.do` @1440 | `pixel-residual-difference-ratio` | 0.3345 | 0.1081 | 3.1× |
| `/gs/index.do` @390 | `position-delta-p90-px` | 550 | 357 | 1.5× |
| `/gs/index.do` @390 | `pixel-residual-difference-ratio` | 0.1133 | 0.0612 | 1.9× |

Verdicts: BLOCKER / BLOCKER / MAJOR → **MAJOR / MAJOR / MAJOR. Zero BLOCKERs.**
`blank-region-ratio` — the channel built this wave specifically to catch this site's defect, and
which fired **BLOCKER at 1.4533** on the pre-fix build naming the hero, the NEWS band and the
carousel — is now **silent on all three pairs**.

**Confirmed by eye at 1440, not merely by channel silence** (`tmp/wr2875/closure/sev-1440-*-top.png`):

- The **NEWS row carries all its cards** — 메디컬 리포트 / 보도 자료 / 언론 보도 with their titles
  and 2026-09-04 dates. In 28.7 it had **zero of four**, with two overlapping circles labelled
  "Previous"/"Next" and text spilling out. The circles are now clean, correctly-sized controls.
- The **four-panel card row** (Webzine · 건강정보 · 진료 시간표 · 후원하기) is complete with all
  images and overlaid text.
- The **건강정보 card is populated** — "질환/신체부위별 찾기", a condition name and its pager.
  In 28.7 it was an empty white box with broken "Pre Nex" fragments.
- The **hero is not a white band** (proved separately by the reconstruction lane's paint sampling:
  flat `255,255,255` at all seven sample points before, real content after).

The one visible difference in this band is the condition name — source 부정교합 [Malocclusion]
vs clone 요로결석 [Urinary calculus]. That is **live rotating content, not a defect**.

**New observation for the visual audit:** the top icon row (진료과 찾기, 온라인 발급 서비스, …)
renders its glyphs degraded in the clone — recognisable but clipped/simplified against the
source's clean line icons. Small, local, and new to this pack. Recorded, not yet root-caused.

## What is still open, and it is one site

All six BLOCKERs are on linear.app, and they split into three mechanisms:

**1. Frozen desktop width at 1024 / 1100 — the gate clause B failure.** The signature is
unmistakable:

| route | w | source contentMaxRight | **clone contentMaxRight** | source scrollH | clone scrollH |
| --- | ---: | ---: | ---: | ---: | ---: |
| `/` | 700 | 1627 | **1838** | 9587 | 9960 |
| `/` | 1024 | 1527 | **1838** | 10131 | 9960 |
| `/` | 1100 | 1509 | **1838** | 9710 | 9960 |
| `/pricing` | 1100 | 1090 | **1361** | 6323 | 6360 |
| `/pricing` | 1440 | 1392 | **1392** | 6360 | 6360 |

The clone's content extent is **constant at 1838** across 700/1024/1100 while the source's varies,
and at the 1440 truth width the clone is **exact** (1392 = 1392, right gutter 48 = 48). `scrollWidth`
equals the viewport at 1024 and 1100, so the excess is *clipped rather than scrolled* — which is
exactly why whole footer columns become unreachable and `footer-clipped` reads 1 against a source 0.

**2. `/` @700 — a variant-tree limitation, not a width one.** Established from probe data: 700 was
never probed (nearest samples 641 and 769), the source's own desktop DOM overflows at every
observed width, and all 8 remaining outermost overflow roots are refused for stated reasons —
four because *the source's own box overflows its parent*. Only two DOM trees are ever observed and
`/` needs three (family changes at 641 **and** 929). Carried per §6.

**3. `/` @390 — the known false alarm, deliberately not tuned away.** `offscreen-text-excess-chars`
200 against a source value of 427 on a product mock the source itself bleeds past the right edge;
the independent auditor graded this pair MINOR in 28.7 and the floor says PASS. The QA lane
examined it and left it alone on evidence rather than retuning a threshold to buy a nicer tally.

## Calibration finding — the machine's top band is unreachable

**0 of 16 pairs reach PASS, and one channel explains it.** `pixel-residual-difference-ratio` fires
MINOR on **16 of 16 pairs**, threshold 0.01. Its best value anywhere is **0.0152** — on
`/pricing` @1440, the pair an independent human auditor graded PASS and could fault only for
`US$10` → `$10`. The self-check floor reaches PASS, so source-vs-source residual is genuinely
below 1%; a real clone simply does not get under it.

So the top of the scale is unreachable for any real reconstruction by construction. This is stated
for the adjudicator under gate clause F rather than fixed, because lowering a threshold to
manufacture a PASS is exactly the move the QA lane correctly refused for M6.

## Gate status at measurement 1

| clause | status |
| --- | --- |
| A — blank content | **MET on severance** (hero/NEWS/carousel restored, channel silent). seoultone unverifiable — source down. |
| B — width | **NOT MET.** `footer-clipped` = 1 on `/` @700/@1024/@1100 and `/pricing` @1100. |
| C — regression | **HELD.** `/pricing` @390 and @1440 both MINOR; hobbang 0 BLOCKERs. |
| D — popup | **MET** (observer lane, live-site evidence). |
| E — QA honesty | **MET** (L1/L3/B7 closed; L3 fired on real corpus). |
| F — calibration | **NOT MET** — 0 machine PASS; cause identified above. |
| G — visual | pending the human review pack. |

Clause B drives correction cycle 1, scoped to 1024/1100 where the desktop tree is the correct tree.

## Appendix — the clause B defect confirmed by eye, linear `/` @1100

Crops of the same band, both 1100px wide (`tmp/wr2875/closure/lin-1100-{source,final}-top.png`).

**Source.** The lead paragraph is fully present and wrapped to fit the viewport:
"Build and deploy AI agents that work / alongside you as teammates. Work on / complex tasks
together or delegate entire / issues end-to-end.", with "Learn more →" beneath it. The product-UI
card row bleeds decoratively past both edges — this is the source's own overflow to
`contentMaxRight` 1509 — but no *text* is lost.

**Clone.** The same paragraph reads
"Build and deploy AI agents that wor… / teammates. Work on complex tasks… / entire issues
end-to-end." — **chopped mid-word at the right edge, with whole wrapped lines missing**, and
"Learn more →" partly cut.

The decisive detail the numbers alone do not show: the frozen layout is **centred** on its
1838px canvas inside an 1100px viewport, so the clone is clipped on **both** sides — the left
card enters mid-sentence at "…ree most important customer requests" and the right card is cut
off. This is a bilateral clip, not a right-edge overflow, which is consistent with
`scrollWidth` equalling the viewport (nothing scrolls; it is all clipped) and with
`contentMaxRight` sitting at a constant 1838 regardless of viewport.

A normal person would call this page broken on sight. The machine's BLOCKER is correct here and
the human grade will agree — this is not one of the pack's false alarms.

---

## Cycle-2 rerun — linear.app only

After Phase A correction cycle 2 (probe coverage + attachment, `03c`), linear.app was re-run alone:

| stage | run id |
| --- | --- |
| observation | `2026-09-05T11-51-47-573Z` |
| site-spec | `2026-09-05T12-07-20-025Z` |
| reconstruction | `2026-09-05T12-45-39-605Z` |
| responsive QA | `2026-09-05T12-46-21-873Z` |

`gs.severance.healthcare` (`…10-23-24-422Z`) and `hobbang.net` (`…10-20-57-685Z`) were **not** re-run.
Their `layoutProbe`/`layoutProbeMobile` elementCounts are byte-identical between the 28.7 and 28.75
observations, so the probe defect provably never touched them; re-running would have added capture
noise to artifacts that are already the evidence. All three runs are RUBRIC_VERSION 6, so the set is
internally comparable.

### Verdict matrix (16 pairs, rubric 6)

| host | route | w | verdict | self-check floor |
| --- | --- | ---: | --- | --- |
| gs.severance.healthcare | /gs/index.do | 390 | MAJOR | MAJOR |
| gs.severance.healthcare | /gs/index.do | 1100 | MAJOR | MINOR |
| gs.severance.healthcare | /gs/index.do | 1440 | MAJOR | MINOR |
| hobbang.net | / | 390 | MINOR | MINOR |
| hobbang.net | / | 1100 | MAJOR | MINOR |
| hobbang.net | / | 1440 | MINOR | PASS |
| linear.app | / | 390 | BLOCKER | PASS |
| linear.app | / | 700 | BLOCKER | MINOR |
| linear.app | / | 1024 | BLOCKER | PASS |
| linear.app | / | 1100 | BLOCKER | PASS |
| linear.app | / | 1440 | **MAJOR** (was MINOR) | PASS |
| linear.app | /pricing | 390 | MINOR | PASS |
| linear.app | /pricing | 700 | MAJOR | PASS |
| linear.app | /pricing | 1024 | BLOCKER | PASS |
| linear.app | /pricing | 1100 | BLOCKER | PASS |
| linear.app | /pricing | 1440 | MINOR | PASS |

**TALLY: BLOCKER 6 · MAJOR 6 · MINOR 4 · PASS 0.** Coverage conserved on all three runs
(`conserved: true`, 16/16 graded, 0 demotions).

### What cycle 2 actually bought, and what it cost

The source side is **byte-identical** across the two linear runs — `visibleTextChars` and `totalNodes`
match exactly at all ten pairs — so every difference below is in the clone. This is a real measurement
of the fix, not source drift.

| linear `/` | overlap-excess-ratio | offscreen-text chars | clone contentMaxRight | missing-text-ratio |
| --- | --- | --- | --- | --- |
| @700 | **0.4446 → 0.0045** | 2862 → 1010 | **1838 → 1575** (src 1627) | 0.0682 → **0.1574** |
| @1024 | **0.1986 → silent** | 1466 → 916 | 1838 → 1838 | 0.0482 → **0.1211** |
| @1100 | silent | 716 → 689 | 1838 → 1838 | 0.0098 → 0.0556 |
| @1440 | silent | — | 1840 = 1840 | 0.0023 → **0.0469** |

The layout win is large and real: the @700 overlap collapse is 99×, and @700 is the one width where the
clone's canvas finally moved off the frozen 1838 and landed within 52px of the source's own 1627.

The cost is text. The pre-fix clone was *over*-rendering — 8,835 visible chars against a source's 7,450
at 700px, because a frozen desktop canvas was painting desktop content into a 700px viewport. With the
mobile probe restored the page genuinely reflows, and what surfaces underneath is the **two-DOM-tree
limit** (carried item B3): the mobile tree holds ~3.5k chars, the desktop tree ~9.2k, and at 700 the
source serves something in between that neither tree contains. So `missing-text-ratio` rises at every
width from 700 up, and `/` @1440 crosses MINOR → MAJOR.

That is a genuine mechanism trade, and it is worth naming honestly: **cycle 2 traded a false-passing
over-render for an honest under-render.** The clone is now measuring the defect that was always there.

### The clause-B defect is unchanged

`footer-clipped = 1` on linear `/` at **700, 1024 and 1100** (source 0 at all three), and on `/pricing`
@1100. At 1024 and 1100 the clone's `contentMaxRight` is still pinned at **1838** while the source
reflows 1527 / 1509; `scrollWidth` equals the viewport, so the excess is *clipped, not scrolled*, and
because the frozen layout is centred the clipping is **bilateral**. Restoring probe coverage did not
release those two widths: the desktop probe was already at 2291/2306 before the fix, so 1024 and 1100
were never starved of measurement — they are refused by the containing-block guards, as `03-` §WIDTH-9
recorded. The probe fix was necessary and it was not sufficient.

### Two corrections to this report, from the independent architecture audit

**Correction 1 — hobbang was graded on the wrong engine.** The run pinned above
(`10-20-57-685Z` on reconstruction `10-19-45-357Z`) was built with correction cycle 1's grid-track
mechanism **OFF**: `gridAreaFill: 0`, `residualFrozenOmitted: 1945`. The correct final build is
`11-06-40-264Z` (`gridAreaFill: 328`, `residualFrozenOmitted: 814`), graded by QA `11-13-31-951Z`.
My justification for not re-running hobbang — that its probe counts are byte-identical across waves —
was true but covered only the *probe* defect; it did not cover the *grid* adoption that landed after
that build. That is a straightforward error in assembling the canary and it was caught by the audit,
not by me.

Corrected hobbang leg:

| route | w | verdict | self-check floor | change |
| --- | ---: | --- | --- | --- |
| / | 390 | MINOR | **PASS** (was MINOR) | overlap-excess-ratio 0.0181 (unchanged) |
| / | 1100 | MAJOR | **PASS** (was MINOR) | overlap-excess-ratio **0.0556 → 0.0242** |
| / | 1440 | MINOR | PASS | overlap-excess-ratio 0.0119 → 0.0189 |

Verdicts are unchanged, so the 16-pair tally stands, but the floors are now PASS at all three widths
instead of MINOR/MINOR/PASS — a **stricter** comparison, under which the same verdicts mean more. The
human review pack has been rebuilt against `11-13-31-951Z` and the three hobbang pairs re-graded.

linear (`gridAreaFill: 385`) and severance were already on the final engine; severance is
engine-invariant (`gridAreaFill: 0`, `residualFrozenOmitted: 170` in all four of its builds, because it
has no recoverable grid tracks), so its run needed no change.

**Correction 2 — the `/` @1440 explanation above is wrong.** I attributed the MINOR → MAJOR move at
1440 to the two-DOM-tree limit. That cannot be the cause: 1440 *is* the desktop truth width and is
served by the observed desktop tree, so no tree substitution occurs there. The audit called this out and
the artifact gives the real answer — the loss is **symmetric**:

| direction | chars | strings | sample |
| --- | ---: | ---: | --- |
| in source, absent from clone | 432 | 17 | "reviewed eight issues: two are ready for backlog…", "worked for 12 sec", "7:18 pm" |
| in clone, absent from source | 432 | 14 | "started working on and launched a cloud agent.", "8:51 pm" |

Both sides are the same animated agent-demo panel caught at a **different frame** — the give-away is the
clock, 7:18 pm against 8:51 pm. It is not content loss in either direction, and §1 lists animation phase
as explicitly acceptable. The independent visual auditor, working only from the images and knowing none
of this, graded that pair MINOR rather than the machine's MAJOR. `missing-text-ratio` has no notion of
animation phase and counts a re-frame as absence; that is a **rubric calibration defect**, and it is
recorded as such rather than repaired, because the correction budget is spent.

### Correction — the @1440 animation-phase explanation was cleaner than the data

The final adjudicator checked the claim above that linear `/` @1440's 432 missing / 432 extra chars are
"both sides the same animated agent-demo panel caught at a different frame". The **character counts are
right**, and the clock (7:18 pm vs 8:51 pm) genuinely is animation phase. But the two sets are not the
same strings — 17 missing versus 14 extra — and the clone-only set contains at least two entries that
are **real defects, not phase**: `"intakeand integrations"` (a text-node join defect, the visual audit's
class 3) and the relocated `"40,000"`.

So the honest statement is narrower than the one I made: animation phase accounts for **much** of that
pair's `missing-text-ratio`, not all of it, and the pair also carries genuine text-join defects that
would be there at any animation frame. The conclusion still holds — it is not the content loss the
machine's MAJOR implies, and the independent visual auditor graded it MINOR from the images alone —
but the rubric-calibration point should not be used to excuse the whole delta.

## The seoultone.kr leg — run late, after the origin came back

seoultone.kr was unreachable for most of this wave (Cafe24 over-traffic stub: HTTP 200, 406 bytes, and
a TLS handshake failure on HTTPS). It returned near the end of the program, so the leg was run rather
than left unmeasured. It **cannot** change the gate — clauses B, C and G fail on linear and hobbang
evidence seoultone does not touch — but §14 makes the blank-region fixture on seoultone @390/@1440
mandatory, and clauses A and D each had a seoultone leg recorded as unverifiable.

| stage | run id |
| --- | --- |
| observation | `2026-09-05T18-09-50-983Z` (13 pages, 6.5 min) |
| site-spec | `2026-09-05T18-16-32-275Z` |
| reconstruction | `2026-09-05T18-16-34-577Z` |
| responsive QA | `2026-09-05T18-17-56-681Z` (rubric 6, `--with-self-check`) |

| route | w | verdict | fired |
| --- | ---: | --- | --- |
| / | 390 | **BLOCKER** | `overlap-excess-ratio` 0.3173 · column-container-mode-delta 2 · position-delta-p90 13 |
| / | 1440 | **BLOCKER** | `blank-region-ratio` **0.5767** · `overlap-excess-ratio` 0.1827 · column-container-mode-delta 2 |

### Clause D's seoultone leg is now MET, on the live site

The desktop popup gate is the thing 28.7 carried as **B6** — the normalizer was blind at wide viewports
because its shape test was absolute rather than viewport-relative. The final run records, on the real
origin:

    390:  pageState source qualified=1 dismissed=1  |  clone qualified=0 dismissed=0
    1440: pageState source qualified=1 dismissed=1  |  clone qualified=0 dismissed=0

It qualifies and dismisses the popup at **1440**, the width where it used to see nothing, and it does so
at 390 too — one viewport-independent rule, not two tuned ones. The clone correctly qualifies nothing,
because the clone has no popup to dismiss. B6 is closed on live evidence rather than on a fixture.

### Clause A's seoultone leg is NOT MET

`blank-region-ratio` fires **BLOCKER 0.5767 at 1440**. The detector requirement of §14 is satisfied —
the channel demonstrably fires on this site at this width, which is exactly what it was built to do and
what nothing in 28.7 could do at all. But the *product* requirement in clause A is that the doctor
biography region is **not blank** in the final clone at 1440, and a blank region of that size says it is.
The channel works; the page does not.

### An instrument caveat that must be stated with these two numbers

The comparison on this site is partly compromised, and in the direction that flatters the clone:

| | 390 | 1440 |
| --- | --- | --- |
| source visible chars | 1,305 | 1,282 |
| clone visible chars | **1,785** | **1,776** |
| source text hidden behind opacity | 480 | 494 |
| source largest empty band | 1,560 px (0.275) | 520 px (0.106) |
| clone largest empty band | 208 px (0.037) | 168 px (0.034) |

The clone shows **more** text than the source capture, and the source's own largest empty band is far
bigger than the clone's. That is the source being under-revealed at capture time — scroll-reveal content
that had not fired — not the reconstruction outperforming the original. It is the same page-state
asymmetry family as B7, and it means these two verdicts should be read as "the clone has a real blank
region and real overlap" and **not** as any statement about how faithfully it matches the source.

### The blank-region channel's first false positive, found by eye

The independent visual auditor graded the two seoultone pairs **MAJOR / MAJOR** against the machine's
**BLOCKER / BLOCKER**, and its disagreement on the 1440 pair is the most consequential single finding of
the closure:

`blank-region-ratio` fired BLOCKER 0.5767 at 1440. Looking at the image, the doctor biography is **fully
present** in the clone — portrait, 김진용 대표원장 plate, education column, appointment column — and
**more complete than the source**, which hides two appointment lines and drops the entire
병원위치/주차안내/진료시간 column plus all five 약속 bullets. What the channel actually flagged is a
183px grey strip below the certificate carousel: intentional section padding about 88px taller than the
source's equivalent 95px gap.

§9 of the program spec required that this channel **never classify intentional whitespace as a defect**.
It satisfied that requirement across its whole fixture set and both must-not-fire controls, and then
broke it on the first page it met outside them. That is exactly the failure mode the requirement was
written to prevent, and it is worth more than the pair's verdict: it says the acceptance evidence for
this channel was drawn from too narrow a population.

Recorded as a false positive, clause A returned to PARTIAL — its **product** requirement is met (the
region is not blank) while its **detector** requirement is not. The gate outcome is unchanged; it rests
on B, C and G.

The auditor's other seoultone finding strengthens a blocker rather than weakening one: in 진료시간
**every closing time overprints the next row's label, so the opening hours cannot be read.** That is the
same CJK line-box collision as hobbang's footer, now confirmed on a second, unrelated Korean site, which
promotes it from "hobbang's footer problem" to the most widespread defect class in the corpus. The
`overlap-excess-ratio` numbers (0.3173 / 0.1827) understate it — unreadable opening hours on a clinic
site is a worse product outcome than the ratio suggests.

Final tallies, which differ and should both be quoted:

| | BLOCKER | MAJOR | MINOR | PASS | acceptable |
| --- | ---: | ---: | ---: | ---: | --- |
| machine (rubric 6) | 8 | 6 | 4 | 0 | 0 of 18 |
| independent human eye | 6 | 5 | 5 | 2 | **7 of 18 (39%)** |

They disagree on **10 of 18 pairs, in both directions**. That disagreement is itself the evidence for
Generic Blocker 4, and it is why no verdict in this program was allowed to rest on the machine alone.
