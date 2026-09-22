# Task 28.7 — Final Visual Audit (independent, eyes-only)

**Auditor:** fresh reviewer, no involvement in the implementation, no code read.
**Evidence:** `docs/result/28.7/human-review/` — `manifest.json`, `manifest.md`, and the 20 SOURCE/FINAL PNG pairs under `<site>/shots/`.
**Method:** every pair was opened as full-page source-vs-final, then re-cropped into aligned horizontal bands at ~2× the composite's resolution so that body text, footers and card content were legible. No metric was consulted before grading; the automated and floor verdicts were read from the manifest and compared afterwards.
**Grading rule applied:** ~95% *human* visual equivalence. 1–2px offsets, font-weight/anti-aliasing differences, small colour shifts, shadow/border differences, and carousel/marquee animation phase were explicitly **not** counted against a pair.

---

## 1. Verdict table (all 20 pairs)

| # | Site | Route | W | **My grade** | Auto | Floor | What I actually saw |
|---|------|-------|---|--------------|------|-------|---------------------|
| 01 | linear.app | `/` | 390 | **MINOR** | BLOCKER | PASS | Structure, hero, every section, all 6 footer columns match. Only flaw: section headings fuse across the lost line break — "Intakeand integrations", "Planningand monitoring", "AI andautomations", "Build, review,and ship" — plus the lead sentence moved to the paragraph's end. Nothing is cut off. |
| 02 | linear.app | `/` | 700 | **BLOCKER** | BLOCKER | PASS | Desktop layout crammed into 700px. Hero reads "The product developme… and ag" — chopped mid-word. Nav's Log in / Sign up / menu gone off the right. Logo strip absent. Whole testimonial row + "Built for the future" CTA missing at their place. Footer shows only Product/Features; Company, Resources, Connect, Legal are past the right edge. Big white/black dead bands. |
| 03 | linear.app | `/` | 1024 | **BLOCKER** | BLOCKER | PASS | Same failure mode. Lead paragraph cut mid-word ("planning and…"), product mock sliced, nav items Pricing/Contact/Log in/Sign up off-screen, logo strip truncated after CURSOR. The three colour testimonial cards and the CTA block are absent entirely; footer's right columns run off the edge. |
| 04 | linear.app | `/` | 1100 | **BLOCKER** | BLOCKER | MINOR | Page laid out ~1390px wide inside 1100. Every section's body paragraph is cut mid-word at the right edge. Footer's whole "Connect" column (Contact us / Community / X / GitHub / YouTube) is unreachable. "Linear powers over 40,000 product teams… Customer stories" row missing. |
| 05 | linear.app | `/` | 1440 | **MINOR** | MAJOR | PASS | Excellent. All sections, all mocks, both testimonial cards, CTA, and the complete 6-column footer in place and aligned. Defects are textual only: the fused headings again, "A new species of product tool." relocated to the end of the lead paragraph, and "40,000" moved to the end of its sentence. |
| 06 | linear.app | `/pricing` | 390 | **PASS** | MINOR | PASS | Indistinguishable. All four plan cards, the ~60-row feature table with every tick/cross in the right row, CTA and footer. Only difference I could find: "US$10" rendered as "$10". |
| 07 | linear.app | `/pricing` | 700 | **MAJOR** | MAJOR | PASS | Content sits in a ~half-width column at the left, leaving a large permanently empty right band down the whole page; "Trusted by more than 40,000 companies" floats off to the right. Footer switches to 2 columns per row where the source uses 3. Everything is present, but the width is used wrongly. |
| 08 | linear.app | `/pricing` | 1024 | **BLOCKER** | BLOCKER | PASS | Source shows a 2×2 plan grid using the full width; the clone stacks all four plans in one narrow left column and leaves roughly two-thirds of the page black. The header nav links (Product, Resources, Customers, Pricing, Contact) are gone — only logo, Log in, Sign up remain. "Pricing" and "Free" collide vertically. |
| 09 | linear.app | `/pricing` | 1100 | **BLOCKER** | BLOCKER | PASS | Content laid out wider than the viewport: the comparison table's entire **Enterprise** column is off the right edge, the Enterprise plan card is half-cut, the logo strip is truncated, and the footer's "Connect" column is missing. |
| 10 | linear.app | `/pricing` | 1440 | **PASS** | MINOR | PASS | Near-perfect: nav complete, 4 cards, logo strip, full comparison table, CTA, full footer. Only "US$10"→"$10". |
| 11 | hobbang.net | `/` | 390 | **MAJOR** | MINOR | PASS | Body is excellent (hero card, banner images, tables, numbered guidance cards, FAQ). But the dark footer's link row is destroyed: "주소모/음 · 링크모/음 · 검/색 · 뉴/스 …" broken into stacked syllables that overlap each other and "스포츠중계"/"정부·공공" print on top of one another. A white sticky header also appears at the very top where the source shows none. |
| 12 | hobbang.net | `/` | 1100 | **MAJOR** | MAJOR | PASS | Body reproduces very well — long tables, the two red banner images, the 4-card how-to grid, the comparison tables. Same footer link-row collapse/overlap as @390. Table column widths differ slightly. |
| 13 | hobbang.net | `/링크모음/검색/` | 1100 | **MAJOR** | MAJOR | PASS | Site table, domain-check cards, FAQ accordion and the 2×7 category grid are all faithful. Defects: the same footer link-row collapse (the blue "검색" pill becomes a tall box with syllables stacked over it), and a small header/breadcrumb overlap at the top. The 28px horizontal overflow the channel cites is invisible. |
| 14 | gs.severance.healthcare | `/gs/index.do` | 390 | **MAJOR** | MAJOR | PASS | Header, hero photo, hospital tabs, both reservation buttons and the icon grid are right. But the 건강정보 card is **blank** (source has "질환/신체부위별 찾기 / 말단비대증 [Acromegaly]" plus pager) with only broken overlapping "Pre Nex" fragments, and the bottom promotional carousel has **no cards at all** — just the blurred background and the dot pager. Icon labels wrap ("온라인 발급 서비 스"). |
| 15 | gs.severance.healthcare | `/gs/index.do` | 1100 | **BLOCKER** | BLOCKER | PASS | The **hero is missing**: where the source has the big building photo with "어려운 병 잘 치료하는 / 이웃병원", the clone has a blank white band. The NEWS row has **zero** of its three cards — only two overlapping circles labelled "Previous"/"Next" with the text spilling out. Promo carousel cards missing. Footer site-links overlap each other. (Note: the "source" PNG here is 1280px wide against an 1100px clone — see §6.) |
| 16 | gs.severance.healthcare | `/gs/index.do` | 1440 | **BLOCKER** | BLOCKER | PASS | Identical failures at full width, and now unambiguous since both images are 1440: hero photo + headline replaced by white space, all four NEWS cards absent, promo carousel cards absent, footer link row overlapping and the address line dropped. The 4-panel card row and icon row are, by contrast, very good. |
| 17 | gs.severance.healthcare | `/gs/news/news/notice.do` | 1100 | **MAJOR** | MAJOR | PASS | All twelve notice cards with titles and dates are reproduced correctly. But the blue breadcrumb bar ("홈 / 뉴스 / 공지·소식 / 공지사항" dropdowns) has been replaced by a copy of the main nav, and the footer's hospital-links row overlaps into itself. |
| 18 | gs.severance.healthcare | `/gs/news/news/notice.do` | 1440 | **MAJOR** | MAJOR | PASS | Same as #17: the card grid and search box are excellent; the breadcrumb strip carries the main nav instead of the breadcrumbs, and the footer link row overlaps with the address line missing. |
| 19 | seoultone.kr | `/` | 390 | **BLOCKER** | BLOCKER | PASS | The doctor section — the single most important block on a clinic page — is **empty**: source has "피부과전문의 / 김진용 대표원장" plus two columns of ~20 credentials; the clone shows the photo and then a tall blank white area. "처음으로 만나보는 / 깨끗한 피부과학" and "서울톤피부과에서 / 최고의 당신을 찾으세요!" headings are also gone. Footer tab row is cut at the right. (Separately: the source capture has a full-screen event popup the clone does not show — see §3.) |
| 20 | seoultone.kr | `/` | 1440 | **BLOCKER** | BLOCKER | MINOR | Popup, certificate carousel, map, SNS grid and footer are reproduced well. But the same text blocks vanish: the entire 김진용 대표원장 credential block (photo alone, large white void beside it), "처음으로 만나보는 깨끗한 피부과학", "서울톤피부과의 약속", "고객센터", and the closing headline. Wordmark overlaps the tagline; the three CTA buttons wrap and collide. |

---

## 2. Tallies

| Grade | **Mine** | Automated | Floor |
|-------|---------|-----------|-------|
| PASS | 2 | 0 | 18 |
| MINOR | 2 | 3 | 2 |
| MAJOR | 7 | 7 | 0 |
| BLOCKER | 9 | 10 | 0 |

Exact agreement with the automated verdict: **15 / 20 (75%)**. Every one of the 20 pairs was gradeable; no image was missing or unreadable.

The floor verdict is not a useful signal in this pack: it says PASS or MINOR on all 20, including pairs where the hero is a white rectangle (#15, #16) and pairs where the biggest text block on the page is absent (#19, #20). Whatever the floor is measuring, it is not "does this look like the same page".

---

## 3. Agreement analysis — where my eyes disagree with the machine

### Automated is stricter than the images justify (4 pairs)

- **#01 linear `/` @390 — auto BLOCKER, I see MINOR.** The BLOCKER comes from `offscreen-text-excess-chars` ("200 more characters begin past the right edge"). At 390 the product-UI mock is *designed* to bleed past the right edge, and it does so in both images; the clone bleeds a bit more. Nothing about that is visible — the page is clipped at the same place in both. This is the clearest case in the pack of a channel firing at BLOCKER on something a human cannot see. The floor's PASS was nearer the truth than the verdict.
- **#05 linear `/` @1440 — auto MAJOR, I see MINOR.** Driven by `position-delta-p90-px` at 63px against a 48px threshold. Side by side at full size I cannot locate that shift; the footer, CTA, testimonial cards and section rows all land on the same lines. 15px over a threshold should not be a MAJOR on a page this faithful.
- **#06 and #10 linear `/pricing` @390 / @1440 — auto MINOR, I see PASS.** 0.3–0.4% missing text and a pixel residual that the channel itself reports as 87–92% edge-located. The only difference a person can find is `US$10` → `$10`. These are the two best reconstructions in the pack and should read as clean.

### Automated is too lenient (1 pair, and one "right answer, wrong reason" cluster)

- **#11 hobbang `/` @390 — auto MINOR, I see MAJOR.** The footer's link row is not subtle: words are chopped into single syllables that print on top of one another, and the row is unreadable. The overlap channel scored it 1.29% of the viewport and therefore MINOR. A small-area but total collapse of a navigation row is being under-weighted because the metric is area-based.
- **#14 severance index @390 — grade agrees (MAJOR), reasoning does not.** The automated finding is `position-delta-p90-px`. What is actually wrong is that a content card is blank and an entire promo carousel has no cards. No channel in the pack fired on "this region should contain content and contains nothing".
- **#13 hobbang search @1100 — grade agrees (MAJOR), reasoning does not.** Cited defect is a 28px horizontal overflow, which is invisible. The real defect is the same footer collapse.
- **#19 seoultone `/` @390 — grade agrees (BLOCKER), but read the number carefully.** `missing-text-ratio 30.54%` is real (the doctor bio block genuinely is gone), but part of that budget comes from the **source capture containing a full-screen event popup that the clone does not show**. The clone actually shows the real hero underneath. Anyone tuning on this number should split the two causes before acting.

### Pattern across the disagreements

The channels are good at *finding* trouble and poor at *pricing* it. The two loudest channels — offscreen-text and position-delta — produced the two false alarms; the two defects that scared me most (an empty hero, an empty biography block) were caught only indirectly or not at all. Nothing in this pack detects "a region that should have content is blank".

---

## 4. Defect classes observed, ranked by how much they hurt

**1. The desktop layout is used at a viewport too narrow for it, and the right of the page is sliced off.**
Sentences stop mid-word at the right edge, nav actions disappear, whole footer columns and — on `/pricing` @1100 — an entire pricing column become unreachable. Worst case is linear `/` @700, where the hero headline itself reads "The product developme… and ag".
*Where:* linear.app `/` @700, @1024, @1100; linear.app `/pricing` @1100. Not present at 390 or 1440.

**2. A region that should hold content is blank.**
Not "slightly wrong" — empty. The severance hero is a white band at 1100 and 1440; its NEWS row has no cards; its promo carousel has a background and dots but nothing on them; its 건강정보 card is an empty white box. On seoultone the doctor's name, title and two columns of credentials are simply not there, at both widths, leaving a tall white void beside his photo, and four more section headings vanish. On linear @700/@1024 the testimonial row and the closing CTA are absent from where they belong.
*Where:* severance index @390, @1100, @1440; seoultone `/` @390, @1440; linear `/` @700, @1024.

**3. Link rows collapse and overlap into an unreadable jumble.**
Footer navigation words are broken into stacked syllables that print over one another. It is confined to one row, but that row stops being usable.
*Where:* hobbang.net footer at 390, 1100, and on the `/링크모음/검색/` route; severance footer site-links at 1100 and 1440 on both routes; seoultone's closing CTA buttons at 1440.

**4. Wrong responsive mode, producing large dead areas.**
`/pricing` @1024 stacks a 2×2 card grid into one narrow column and leaves two-thirds of the page black, and drops the entire header nav; `/pricing` @700 puts everything in a half-width column with a permanent empty right band and flips the footer from 3-up to 2-up.
*Where:* linear.app `/pricing` @700 and @1024.

**5. Text is joined or re-ordered.**
Headings lose the space at a former line break — "Intakeand integrations", "Planningand monitoring", "AI andautomations", "Build, review,and ship". A lead sentence is relocated to the end of its paragraph: "…standard for planning and building products.**A new species of product tool.**" Same with a bold number: "Linear powers over product teams. From ambitious startups to major enterprises.**40,000**". Small in area, but it reads as a typo on the largest type on the page, and it is present at *every* linear width including the two otherwise-clean ones.
*Where:* linear.app `/` at all five widths.

**6. Cosmetic-only (I did not grade on these).**
Logo-marquee and carousel phase differences; `US$10`→`$10`; chip and label wrapping on hobbang; slight table column-width differences; a sticky header stamped mid-page in some *source* captures.

---

## 5. What is genuinely good

This is not a uniformly weak engine — it is a bimodal one, and the good half is very good.

- **linear.app `/pricing` at 390 and 1440 are the strongest artefacts in the pack.** The four plan cards, the toggle switches, the ~60-row feature comparison matrix with every tick and cross landing in the correct cell, the customer logo strip, the CTA and the complete six-column footer all reproduce. I looked for a difference and found a dropped "US$" prefix.
- **linear.app `/` at 1440 and 390** carries all eight sections in the right order with every product-UI mock screenshot present and pixel-close, the correct testimonial card colours (lavender/lime/blue), the correct author lines, and a complete footer. Apart from the text-join defect this is at or near the 95% target.
- **hobbang.net's body is excellent at every width** — the hero card and its CTA, both red banner images, multi-column data tables with per-row link buttons, the numbered guidance cards, the FAQ accordion, and the 2×7 category grid on the search route. If the footer link row were fixed, two of these three pairs would be MINOR at worst.
- **The severance notice route** reproduces all twelve notice cards with their titles and dates, the search field, and the "더보기" control, at both widths. The page is usable and recognisable.
- **severance index at 390** gets the header, the hero photograph with its overlaid headline, the hospital tab strip, both reservation buttons and the four-panel card row right — the failures there are isolated to two dynamic regions, not to the page as a whole.
- **seoultone at 1440** reproduces the event modal itself, the scrolling certificate gallery, the embedded map, the SNS icon grid and the entire footer including the business registration line.
- Colour, type, spacing rhythm, iconography, image fidelity and dark-theme handling are consistently right across all four sites. I did not find a single case of a wrong colour, a missing image asset, or a broken font.

---

## 6. One paragraph: is this engine at ~95% human visual equivalence?

**No — and the average is misleading, because the distribution is bimodal.** Two pairs (10%) are genuinely at or above 95%, two more are just below it, and nine of twenty (45%) are pages a normal person would call broken on sight — a white rectangle where the hero photograph should be, a hero headline chopped mid-word, a doctor's entire biography missing, a pricing table with its Enterprise column past the edge of the screen. Weighting what I saw, the engine is at roughly **95%+ on static content rendered at a width the source itself was designed for, and roughly 55–70% everywhere else**, which averages to something like **75% overall**. Two things stand between it and the target, and they are independent. The first is responsive behaviour: at 700, 1024 and 1100 the clone renders a fixed ~1390px desktop layout instead of the source's responsive layout, so content is sliced off the right or crammed into a fraction of the width — fix this one and four BLOCKERs and one MAJOR (#02, #03, #04, #09, #07) become tractable, and #08 with them. The second is content that only exists after the page's own JavaScript has run: hero sliders, news feeds, promo carousels and scroll-revealed text blocks are captured as empty containers, which accounts for #15, #16, #19, #20 and half of #14. Nothing else in this pack is load-bearing — the fused headings, the relocated sentences and the collapsing footer link rows are real bugs but they are small, local, and would move maybe four pairs up one grade. Finally, a process warning: for the severance @1100 pairs the "source" PNG is 1280px wide while the clone's is 1100px, and for linear `/` @700 the clone's is 862px against a 700px source, so any pixel- or position-based metric on those rows is comparing two different layouts and should not be trusted as a number even where the human verdict happens to agree.
