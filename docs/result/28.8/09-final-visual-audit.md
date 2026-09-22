# Task 28.8 — Final Visual Audit (fresh auditor, eyes-on)

**Auditor:** fresh reviewer, no implementation involvement, no prior stake.
**Material:** `docs/result/28.75/human-review/` — 18 pairs (site × route × width), SOURCE vs FINAL/clone full-page PNGs.
**Revisions:**
- hobbang.net's three pairs were re-graded against the rebuilt pack (run `2026-09-05T11-13-31-951Z`) after the first pass was found to have run against a stale build. See §6 — it changed no grades, and the reason it changed no grades is itself a finding.
- seoultone.kr's two pairs (run `2026-09-05T18-17-56-681Z`) were graded last, because the origin was down for most of this wave and the site could not be reconstructed until it came back. See §7 — **the SOURCE capture on this site is compromised** and the pair must be judged on the clone standalone.
**Method:** every pair was cropped into bands (top / upper-mid / lower-mid / bottom, plus native-resolution zooms on nav bars, footers and tables) and viewed as images. Automated verdicts in `manifest.md` were read only for orientation; **every grade below comes from the picture, not the number.**

Question being answered: *would a human accept this as a faithful, professional-looking rendering of the original at that viewport width?*

---

## 1. Pair-by-pair grades

| # | Site | Route | Width | Auto verdict | **My grade** | What I actually saw |
|---|------|-------|-------|--------------|--------------|---------------------|
| 1 | linear.app | `/` | 390 | BLOCKER | **MINOR** | Hero, every section, logo marquee and the complete 6-column footer all reproduce faithfully; the only defect is missing spaces at heading line joins — "Intakeand integrations", "AI andautomations", "Build, review,and ship". |
| 2 | linear.app | `/` | 700 | BLOCKER | **BLOCKER** | Clone laid out 862px wide inside a 700px viewport: hero headline sliced mid-word ("The product developme…"), header nav (Log in / Sign up / hamburger) entirely absent, testimonial carousel and Features sub-lists gone, three half-page blank bands, footer pushed to the very bottom. |
| 3 | linear.app | `/` | 1024 | BLOCKER | **BLOCKER** | Nav runs off the right edge — "Pricing / Contact / Log in / Sign up" unreachable; right-hand body copy cut mid-sentence in three sections; ~1,100px blank where the testimonial cards belong; footer's Connect and Legal columns offscreen. |
| 4 | linear.app | `/` | 1100 | BLOCKER | **BLOCKER** | Same overflow class: nav loses "Contact / Log in / Sign up" past the right edge, section content clipped at the right, footer "Connect" column unreachable. Body sections themselves are otherwise faithful. |
| 5 | linear.app | `/` | 1440 | MAJOR | **MINOR** | Near-identical to source — nav, hero, all sections, testimonials, full footer correct. Defects: the heading word-joins again, plus "Linear powers over **40,000** product teams…" rendered as "…enterprises.40,000". |
| 6 | linear.app | `/pricing` | 390 | MINOR | **PASS** | I could not find a difference beyond "US$10" → "$10" and a hairline button-label weight change. Plan cards, the full feature-comparison table and the footer are indistinguishable. |
| 7 | linear.app | `/pricing` | 700 | MAJOR | **MINOR** | Everything present and readable; footer regrouped from 3 columns × 2 rows to 2 × 3, Enterprise "Get started" is right-aligned instead of full-width, and the logo strip crowds the "Customer stories" link. Nothing lost. |
| 8 | linear.app | `/pricing` | 1024 | BLOCKER | **BLOCKER** | Primary nav is simply *gone* — only "Log in / Sign up", no links and no hamburger. A ~550px fully blank band sits where the 7 customer logos should be (logos absent entirely). Footer collapsed to 2 columns. |
| 9 | linear.app | `/pricing` | 1100 | BLOCKER | **BLOCKER** | Nav's "Contact / Log in / Sign up" offscreen right; logo strip clipped mid-logo; footer's "Connect" column offscreen; Business plan's two CTAs overlap; Enterprise bullet lines collide ("Migration & onboarding support" / "Priority support"). |
| 10 | linear.app | `/pricing` | 1440 | MINOR | **PASS** | Essentially pixel-identical top to bottom, including the long comparison table and the 5-column footer. Only "US$10" → "$10". |
| 11 | hobbang.net | `/` | 390 | MINOR | **BLOCKER** | *(re-graded on rebuilt pack)* Body is an excellent reproduction and the verification table is complete at this width, but the footer link block collapses into three vertically-overlapping rows of colliding Korean glyphs — "금융 / 교육 / AI도구 / 스포츠중계 / 최신주소 / FAQ" pile on top of each other and are partly illegible. |
| 12 | hobbang.net | `/` | 1100 | MAJOR | **MAJOR** | *(re-graded on rebuilt pack)* Footer link row still overlaps (words readable but colliding); the 11-row address-verification table loses its last row (코인 / 업비트 / upbit.com); FAQ accordion "+" markers sit detached outside the right edge of their boxes; card titles and CTA labels wrap one syllable early ("링크모음 보 / 기"). Everything else matches closely. |
| 13 | hobbang.net | `/` | 1440 | MINOR | **MAJOR** | *(re-graded on rebuilt pack)* Overlapping footer link row again; the verification table loses the same last row (코인 / 업비트 / upbit.com); "경로 이 / 동" status chips wrap; category-card titles wrap with glyph collision. |
| 14 | gs.severance.healthcare | `/gs/index.do` | 390 | MAJOR | **MINOR** | Layout, hero, cards, NEWS band, promo carousel and footer all match. Six quick-menu icons render as broken stroke fragments instead of stethoscope/printer/globe etc., and their labels wrap one syllable early. |
| 15 | gs.severance.healthcare | `/gs/index.do` | 1100 | MAJOR | **MAJOR** | Clone lays out wider than its 1100 viewport: last nav item (건강정보) plus search and hamburger offscreen, 5th quick-icon and the 후원하기 card clipped, footer's "연세의료원 네트워크" button unreachable. |
| 16 | gs.severance.healthcare | `/gs/index.do` | 1440 | MAJOR | **MINOR** | Top bar, nav, hero, quick menu, promo cards, NEWS, oval carousel and the full footer all reproduce faithfully. Only the 5 small quick-menu icons are corrupted and the carousels sit one frame apart. |
| 17 | seoultone.kr | `/` | 390 | BLOCKER | **MAJOR** | *(source compromised — clone judged standalone)* Complete and professional: header, hero, wordmark, certificate strip, full doctor biography, social block, all five 약속 bullets, map, contact column, CTA and footer. Defeated by one block — every closing time in 진료시간 overprints the row beneath ("8:00" onto 토요일, "4:00" onto 점심시간), leaving the clinic's opening hours effectively unreadable; a second carousel slide's text also ghosts faintly behind the hero headline. |
| 18 | seoultone.kr | `/` | 1440 | BLOCKER | **MAJOR** | *(source compromised — clone judged standalone)* Nothing missing: full nav, hero, doctor biography (more complete than the source), promise bullets, clinic-info column and footer all present. Four separate text collisions, though — the tagline "의료진의 차이가 결과의 차이!" overprints the "DERMATOLOGY" wordmark under the hero, "대표원장" collides with the first credential line, the 진료시간 hours overprint as at 390, and the three CTA button labels wrap and overflow their buttons. |

---

## 2. Tally

| Grade | Count | Pairs |
|-------|-------|-------|
| **PASS** | 2 | 6, 10 |
| **MINOR** | 5 | 1, 5, 7, 14, 16 |
| **MAJOR** | 5 | 12, 13, 15, 17, 18 |
| **BLOCKER** | 6 | 2, 3, 4, 8, 9, 11 |

Acceptable as-is (PASS + MINOR): **7 / 18 = 39%**.
By width: 1440 is **4/6 PASS-or-MINOR**; 390 is 3/5 PASS-or-MINOR; 700/1024/1100 are **0/7**.
Adding seoultone did not change the shape of the result — it added two MAJORs and no blockers, and it added no new instance of the dominant D1 failure.

---

## 3. Defect classes, ranked by product harm

### D1 — Frozen desktop layout overflows sub-1440 viewports *(dominant; causes 5 of 6 blockers)*
**Pairs:** 2, 3, 4, 8, 9, 15.
On screen: the page is laid out at a width larger than the viewport it is rendered into, so everything past the right edge is simply gone with no horizontal-scroll affordance. Header nav links disappear one by one as the width drops (at 1100 you lose "Contact / Log in / Sign up"; at 1024 you lose those plus "Pricing"; at 700 the header has no controls at all). Footer columns fall off the right (Connect, Legal). Right-hand body copy is cut mid-sentence. Flex children that cannot fit collapse to zero height, leaving half-page black voids where testimonial carousels and logo strips belong. This one class is the entire product blocker.

### D2 — CJK line-box collision: text overprinting the row beneath *(1 blocker, 4 majors — the most widespread class in the corpus)*
**Pairs:** 11, 12, 13 (link rows) and 17, 18 (information blocks). **Confirmed to survive the rebuilt hobbang build; independently reproduced on seoultone.**
On screen, one phenomenon in two surfaces:

- *Link rows (hobbang 11, 12, 13).* The footer's compact inline link list wraps each label mid-word, and the wrapped tails collide with the row beneath, so glyphs sit on top of glyphs. At 1440 and 1100 the words are still individually readable; at 390 it is a partly illegible pile. This is exactly the "obvious overlapping footer rows" failure mode.
- *Information blocks (seoultone 17, 18).* The same collision inside a definition-list-shaped block. In 진료시간 every closing time is displaced down and left onto the following row's label — "8:00" lands on 토요일, "4:00" on 점심시간, "2:00" on the closing note — so a reader cannot tell what time the clinic shuts. At 1440 it additionally hits the brand block (the tagline "의료진의 차이가 결과의 차이!" overprints "D E R M A T O L O G Y") and the doctor's credential list ("대표원장" overprints "전 강남 미파문피부과 원장").

This class was specifically re-checked at native resolution on the corrected hobbang build (`gridAreaFill: 328`), because the grid-track/width recovery pass that was off in the stale build is the mechanism most likely to move it. **It did not move it.** At 1440 and 390 the footer pixels are byte-identical to the stale build; at 1100 the collision is still present and no less severe. The grid-track pass is therefore not the lever on this defect — and seoultone, a site the pass ran on normally throughout, shows the same collision, which supports that reading.

This class was specifically re-checked at native resolution on the corrected build (`gridAreaFill: 328`), because the grid-track/width recovery pass that was off in the stale build is the mechanism most likely to move it. **It did not move it.** At 1440 and 390 the footer pixels are byte-identical to the stale build; at 1100 the collision is still present and no less severe (e.g. "정부·공공" over "주소모음", "최신주소" over "링크모음", "FAQ" over "금융"). The grid-track pass is therefore not the lever on this defect.

### D3 — Text-node joining and reordering in headings and rich paragraphs *(caps linear at MINOR)*
**Pairs:** 1, 5 (and visible inside 2, 3, 4).
On screen: two-line section headings lose their break *and* the separating space — "Intake / and integrations" becomes "Intakeand integrations"; "Build, review, / and ship" becomes "Build, review,and ship". Separately, an inline emphasis run is moved to the end of its paragraph ("…building products.**A new species of product tool.**" instead of leading) and an inline number relocates ("…major enterprises.**40,000**"). Nothing is lost — it reads as a typographic bug, not missing content.

### D4 — Icon SVG corruption *(cosmetic but conspicuous)*
**Pairs:** 14, 15, 16.
On screen: the hospital's six quick-menu icons render as disconnected arcs and dots — recognisable as a failed stroke reconstruction of the original stethoscope/printer/globe/document glyphs. Also visible on the footer's ⌃/↗ affordances.

### D5 — Content-node loss
**Pairs:** 12 and 13 (last of 11 verification-table rows dropped), 8 (all 7 customer logos absent, leaving a blank band).
On screen: a table simply ends one row early; a logo strip is replaced by empty background while its caption text survives.
The hobbang table-row loss is **width-dependent**: at 390, where the table scrolls horizontally, all 11 rows including 코인 / 업비트 are present; at 1100 and 1440 the row is gone. The re-grade on the corrected build added pair 12 to this class — the stale-build pass had only recorded it at 1440.

### D6 — CJK line-wrap tightening
**Pairs:** 11, 12, 13, 14, 18.
On screen: buttons, chips and card titles wrap one syllable earlier than the source ("카테고리별 링크모음 보 / 기", "경로 이 / 동"), making buttons two lines tall where the original is one. On seoultone @1440 it pushes the three bottom CTA labels out of their buttons ("대표번호 02-576- / 5502", and 네이버예약 / 카카오채널 dropping below their icons). Ugly, never blocking — the controls stay identifiable and clickable.

### D7 — Currency prefix dropped
**Pairs:** 6, 7, 8, 9, 10. "US$10 per user/month" → "$10 per user/month". Purely cosmetic; noted only because it is systematic.

---

## 4. Where my eye disagrees with the automated verdict

Eight of sixteen disagree, and — importantly — **in both directions**. The instrument is over-weighting per-pixel text-join/wrap noise and under-weighting geometric collision.

| Pair | Auto | Mine | Why |
|------|------|------|-----|
| linear `/` @390 | BLOCKER | **MINOR** | Nothing on the blocker list is present. Nav, hero, all eight body sections, the marquee and the complete footer are correct and correctly positioned. The sole defect is a missing space at heading line joins. Calling this a blocker is a two-grade overcall. |
| linear `/` @1440 | MAJOR | **MINOR** | Full-page comparison shows a faithful reproduction including the testimonial cards and the 5-column footer. The word-join plus one displaced number is not something a human "complains about" — it is a typo-class bug. |
| linear `/pricing` @390 | MINOR | **PASS** | I looked at all four bands at native scale and could not find a difference other than "US$10"→"$10". This is an accept. |
| linear `/pricing` @1440 | MINOR | **PASS** | Same — the plan grid, the ~90-row comparison table and the footer are visually identical. Accept. |
| linear `/pricing` @700 | MAJOR | **MINOR** | The footer regroups 3→2 columns and one CTA is misaligned, but every link, plan, feature row and CTA is present and reachable. "Complete and usable" is the MINOR definition. |
| **hobbang `/` @390** | **MINOR** | **BLOCKER** | **Automated grade is far too lenient, and it stayed too lenient on the rebuilt pack.** The footer link block is three overlapping rows of colliding, partly illegible Korean glyphs. "Obvious overlapping footer rows" is on the blocker list, and this is the clearest instance in the corpus. A pixel metric spread over a 17,167px-tall page cannot see an 80px collision. |
| hobbang `/` @1100 | MAJOR | **MAJOR** | Agree on grade, disagree on emphasis: the rebuilt manifest raised this pair's floor to PASS and dropped its WIDTH MISMATCH flag, which reads as improvement, but the two things a human would actually complain about — the colliding footer row and the dropped table row — are both still on screen. |
| hobbang `/` @1440 | MINOR | **MAJOR** | Same footer overlap (milder), plus one of eleven data rows silently dropped from the verification table. Content loss plus visible collision is more than "minor". Unchanged on the rebuilt pack — these two images are byte-identical to the stale build. |
| severance @390 and @1440 | MAJOR | **MINOR** each | Layout, imagery, text, carousels and footers all match. What remains is six small corrupted icons. That is a real defect but it does not make the page "one a human would complain about" at the MAJOR bar — the page reads as the hospital's homepage. |
| **seoultone `/` @390** | **BLOCKER** | **MAJOR** | Nothing on the blocker list is present in the clone: nav, hero, wordmark, certificates, the full doctor biography, all five promise bullets, map, contact column, CTA and footer are all there and correctly laid out. One block — 진료시간 — is corrupted by overprinting. Serious, but it is one block on an otherwise complete page. |
| **seoultone `/` @1440** | **BLOCKER** | **MAJOR** | Same: nothing missing, nav and footer intact. Four collision sites rather than one, which is why it does not drop to MINOR, but none of them is navigation or footer and no section is blank. |
| **seoultone `/` @1440 — "blank region"** | blank region reported | **no such blank in the clone** | Answered in full in §7. Briefly: the doctor biography is present *and more complete than the source*. The clone's largest blank band is 183px of ordinary section padding between the certificate strip and the doctor block (source's equivalent: 95px). The genuinely blank regions in this pair belong to the **source**. |

Pairs where I **agree** with the instrument on grade: 2, 3, 4, 8, 9 (all BLOCKER — the overflow is unmistakable), 12 and 15 (MAJOR).

---

## 5. Closing

A human would accept roughly **39% of this corpus as-is** (7 of 18: two indistinguishable, five with visible but non-blocking flaws). That number is not evenly spread — it is largely a function of viewport width. At 1440, where the reconstruction's frozen layout happens to match the render viewport, 4 of 6 pairs are acceptable and 2 are indistinguishable from the original. At 390 the mobile layout also largely survives (3 of 5 acceptable). At 700, 1024 and 1100 the score is **0 of 7**.

The failures are **highly concentrated, not spread out**. Two defect classes explain every blocker and every major: D1 (desktop layout frozen wider than the viewport, so nav and footer columns fall off the right edge and unfittable flex children collapse into blank bands) accounts for five of six blockers and one major; D2 (CJK text overprinting the row beneath) accounts for the remaining blocker and all four other majors. Adding seoultone reinforced rather than changed this: it contributed two MAJORs, both driven by D2, and no new instance of D1. Everything else observed — heading word-joins, corrupted icons, two lost table rows, tight CJK wrapping, a dropped currency prefix — is MINOR-grade polish that would not stop a human from shipping the page.

The practical read: the reconstruction engine already produces human-acceptable output at its capture width. The intermediate-width responsive story is the single thing standing between this corpus and a majority-accept result.

---

## 6. Provenance note — first grading pass ran against a stale hobbang build

**What happened.** The first pass of this audit graded hobbang.net's three pairs from a review pack that pinned hobbang to a reconstruction built with a layout mechanism switched off (`gridAreaFill: 0`, `residualFrozenOmitted: 1945`). This was an error in assembling the pack, not in the reconstruction. The pack was rebuilt to point hobbang at the correct final build (`gridAreaFill: 328`, `residualFrozenOmitted: 814`, run `2026-09-05T11-13-31-951Z`), and all three hobbang pairs were then cropped and re-examined from scratch under the same method and scale.

**What changed in the grades: nothing.** 390 stays BLOCKER, 1100 stays MAJOR, 1440 stays MAJOR. The tally in §2 is unchanged.

**Why it changed nothing — and this is the part worth keeping visible.** Comparing the stale run (`2026-09-05T10-20-57-685Z`) against the corrected run (`2026-09-05T11-13-31-951Z`) file by file:

| Pair | SOURCE | FINAL/clone |
|------|--------|-------------|
| `/` @390 | byte-identical | **byte-identical** |
| `/` @1100 | different | different |
| `/` @1440 | byte-identical | **byte-identical** |

Two of the three "wrong build" images were never actually different. Only the 1100 pair's pixels moved, and a row-wise difference scan localises that change to a 2px canvas correction (clone width 1102 → 1100) plus small repositioning of the full-bleed banner images at y≈543-1086, 4345-4888, 5793-6155, 7604-8147 and 9414-9776. No text block, no footer, no table changed.

**Consequences for the findings.**
- **D2 (overlapping CJK footer rows) survives intact at all three widths.** This was the class flagged as most likely to move, since the disabled mechanism was a grid-track/width recovery pass. It did not move — the footer pixels at 390 and 1440 are literally the same bytes, and at 1100 the collision is unchanged in severity. The grid-track pass is not the lever on this defect, and whatever is, it has not been found yet.
- **D5 (content-node loss) gained pair 12.** On the corrected build I confirmed the 코인 / 업비트 verification-table row is dropped at 1100 as well as 1440, and is present at 390. The first pass had recorded it only at 1440; that was an incompleteness in my earlier looking, not a build difference.
- **The other thirteen pairs (linear ×10, severance ×3) were on correct builds throughout and were not re-graded.** Their images are unchanged and their grades in §1 stand as originally recorded.

**Caveat on the rebuilt manifest.** The rebuilt pack's automated verdicts for hobbang moved slightly in the reassuring direction — @1100's floor rose from MINOR to PASS and its WIDTH MISMATCH banner was dropped. Neither of the two defects a human would actually complain about at that width (the colliding footer row, the dropped table row) is gone. That divergence is recorded in §4 rather than smoothed over.

---

## 7. seoultone.kr — graded late, and on a compromised source

**Why it is here late.** seoultone.kr was offline for most of this wave — its origin was serving a 406-byte over-traffic stub — so it could not be reconstructed and was absent from the 16-pair pack. The origin came back, the site was run end to end (run `2026-09-05T18-17-56-681Z`), and the pack was rebuilt to 18 pairs. The earlier `2026-09-03T11-42-06-649Z` seoultone run remains blacklisted in the manifest for an unrelated reason (a swallowed `pnpm reconstruct` failure) and was not used.

**The comparison on this site is compromised, and it is compromised against the clone.** The SOURCE capture hides content behind opacity — a scroll-reveal animation that had not fired when the screenshot was taken. This is measurable in the captures themselves:

| | source largest blank band | clone largest blank band |
|---|---|---|
| `/` @390 | **477px** (y4043-4520) | 178px (y1512-1690) |
| `/` @1440 | 141px (y4408-4549) | 183px (y1580-1763) |

At 390 the source is missing, visibly, the entire 대표전화 / 병원위치 / 주차안내 / 진료시간 contact column and most of the 서울톤피부과의 약속 bullet list. At 1440 the source is missing all five 약속 bullets, the whole clinic-information column, and several lines of the doctor's credential list. **The clone renders all of it.** Any pixel-diff or blank-region metric run on this pair is therefore scoring the source's defect against the clone, and its output should not be trusted for these two pairs. I graded the clone standalone, on whether it reads as a professional, complete page.

**Answer to the blank-region question (asked specifically about @1440): no, my eye does not agree.**
The doctor biography section is fully present in the clone — portrait, name plate 김진용 대표원장, subtitle, the eight-line education column and the right-hand appointment column. It is in fact *more* complete than the source, which hides the last two appointment lines (전 삼송 우아한피부과 원장, 전 광교 갤러리아피부과 원장). The clone's largest blank band at 1440 is 183px at y1580-1763, and cropping it shows what it is: the grey band below the certificate carousel plus ordinary section padding before the doctor block. The source has the same gap at 95px. So it is intentional whitespace running roughly 88px tall, not a missing section. There is no blank region at 1440 where meaningful content belongs.

**Answer to the overlap question: yes, real and a reader would notice — but it is not the nav/footer failure on the not-acceptable list.** The overlaps are inside content blocks, catalogued under D2 above. The one that matters most is 진료시간 at both widths: every closing time is displaced onto the following row's label, so the clinic's opening hours cannot be read reliably. At 1440 three further sites collide — the brand tagline over the "DERMATOLOGY" wordmark directly under the hero, "대표원장" over the first credential line, and the CTA button labels overflowing their buttons. At 390 a second carousel slide's headline ghosts faintly behind the active one in the hero.

**Net.** Both pairs graded **MAJOR** against the automated **BLOCKER**. They are complete, navigable, correctly branded pages with intact heroes and footers, spoiled by a recurring line-box collision — most damagingly in the one block a clinic visitor actually needs to read.
