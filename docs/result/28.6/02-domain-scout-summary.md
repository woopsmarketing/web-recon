# Task 28.6 — Domain Scout Ranking & Pilot Selection

**Generated:** 2026-09-02T07:20:41Z (UTC, `date -u`)
**Inputs:** 12 per-candidate scout reports in `docs/result/28.6/scout/*.md`, plus `tmp/wr286/scout/summary.json` and the 12 per-host `tmp/wr286/scout/<host>.json` records.
**Handoff JSON:** `docs/result/handoffs/28.6-domain-scout.json`
**Scope:** read-only ranking and selection. No site was re-fetched; every number below is quoted from the recorded scout run.

---

## 1. Headline

| | |
|---|---|
| Candidates scouted | 12 (4 medical, 2 interior, 6 directory) |
| Reachable, 200, no challenge, no auth wall | **12 / 12** |
| Recommended pilots | **6** — 2 medical, 2 interior, 2 directory (preferred distribution met) |
| Difficulty profile of the six | 1 x d2, 4 x d3, 1 x d4 |
| Difficulty-3 cap (`at most 2`) | **Escape clause invoked** — see §5.3. The cap and the category distribution are jointly unsatisfiable on this pool. |
| Decisive non-technical discriminator | `robots.txt` `Disallow: /` naming **ClaudeBot** on 4 of 6 directory candidates |
| Program minimum | Target 6 met; desired minimum 4 and strong minimum 3 both cleared with margin |

---

## 2. Candidate table

All 12 returned HTTP 200 at both viewports with `challenge: none`, zero anti-bot signals, no WAF interstitial and no auth wall on the homepage.

| # | Host | Category | Reach | Challenge | Framework / builder | DOM | Sheets | Scripts | Media rules | video/canvas/shadow/iframe | Diff | PV | **Score** | Rec |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | seoultone.kr | medical | 200 | none | jquery, gnuboard g5, swiper | 592 | 13 | 33 | 13 | 0 / 0 / 0 / 0 | 3 | 5 | **14.0** | **SELECT** |
| 2 | gs.severance.healthcare | medical | 200 | none | jquery, slick, gtm/ga (enterprise Java CMS) | 1,731 | 5 | 22 | 1 | 0 / 0 / 0 / 1 | 3 | 5 | **13.0** | **SELECT** |
| 3 | interiorbay.co.kr | interior | 200 | none | jquery 1.8.3, swiper, slick (Sitecook builder) | 2,672 | 17 | 15 | 12 | 0 / 0 / 0 / 0 | 3 | 5 | **13.0** | **SELECT** |
| 4 | 9skin1.co.kr | medical | 200 | none | jquery 2.1.4, swiper (bespoke PHP CMS) | 621 | 19 | 34 | 40 | **1** / 0 / 0 / 0 | 3 | 4 | **12.0** | BACKUP |
| 5 | xn--ok0b408a79cba430b.net | directory | 200 | none | react, **wix Thunderbolt**, bootstrap | 716 | 29 | 83 | 88 | 0 / 0 / 0 / 0 | 3 | 4 | **12.0** | **SELECT** |
| 6 | yugiyu4.com | directory | 200 | none | jquery, gnuboard | 1,649 | 33 | 20 | 7 | 0 / 0 / 0 / 2 | 2 | 4 | **12.0** | BACKUP |
| 7 | xn--9l4b19k46k.com | directory | 200 | none | none-detected (hand-written static) | 382 | 2 | 2 | 5 | 0 / 0 / 0 / 0 | 1 | 3 | **11.5** | BACKUP |
| 8 | interiorteacher.com | interior | 200 | none | next.js, react, gtm/ga, kakao-sdk | 1,107 | 6 | 58 | 93 | 0 / 0 / 0 / **3** | 4 | 4 | **11.0** | **SELECT** |
| 9 | hobbang01.com | directory | 200 | none | none-detected (hand-rolled) | 2,459 | 1 | 3 | 4 | 0 / 0 / 0 / 0 | 2 | 4 | **11.0** | BACKUP |
| 10 | hobbang.net | directory | 200 | none | astro static, gtm/ga | 884 | 4 | 4 | 9 | 0 / 0 / 0 / 0 | 2 | 4 | **10.5** | **SELECT** |
| 11 | mystarskin.co.kr | medical | 200 | none | react, jquery 1.10, swiper, slick, aos, channel.io | 1,060 | 7 | 49 | 1 | 0 / 0 / **1** / 1 | 4 | 3 | **10.0** | BACKUP |
| 12 | jusohot4.com | directory | 200 | none | react | 1,106 | 7 | 5 | 31 | 0 / 0 / 0 / 0 | 2 | 3 | **10.0** | BACKUP |

`Rec` is **this ranking agent's** recommendation after applying the program's category quotas. Where it differs from the per-site scout's own verdict, §7 says why. Difference summary: `9skin1.co.kr` (scout SELECT -> BACKUP, medical is capped at 2 and it ranks 3rd of 4); all other verdicts agree with the scout.

---

## 3. Scoring formula

```
score = simplicity + categoryDiversityBonus + pilotValue + technicalGeneralizationValue

simplicity                     = 6 - difficulty                      range 1..5
categoryDiversityBonus         = f(slots / candidates in category)   range 0..2
pilotValue                     = scout's recorded pilotValue         range 1..5
technicalGeneralizationValue   = TG1 + TG2 + TG3 + TG4 + TG5         range 0..5

max = 5 + 2 + 5 + 5 = 17
```

### 3.1 categoryDiversityBonus

Encodes the program's own quota arithmetic: a category with few candidates per slot has scarce supply, so each of its candidates is worth more to the program.

| Category | Candidates | Slots | Candidates per slot | Bonus | Program rule it encodes |
|---|---|---|---|---|---|
| interior | 2 | 2 | 1.0 | **+2** | "Only two interior candidates exist: select BOTH if technically suitable" |
| medical | 4 | 2 | 2.0 | **+1** | "Medical: best 2 of 4" |
| directory | 6 | 2 | 3.0 | **+0** | "Directory: best 2 of 6" |

### 3.2 technicalGeneralizationValue — five 0/0.5/1 components tied to 28.6's actual work packages

| Component | Awards 1 when | Maps to |
|---|---|---|
| **TG1** observer-truth exercise | The recorded CSS is provably not the whole truth: CORS-blocked sheets carrying real style rules, `@import`-hidden sheets, `@container`/`@supports`/`@layer` grouping rules, or JS-computed layout not derivable from static rules | **W1** (CORS response capture, `constructor.name` grouping fix, `@import` recursion) |
| **TG2** breakpoint corpus | `cssDetail.breakpoints` length >= 4 | **W2 / W4** (media-condition tokenizer, `authoredBreakpoints`) |
| **TG3** responsive divergence | 1 = a NEW responsive class (UA-branched dual template, `width=320` fixed mobile) **or** structural per-viewport divergence / hidden-collapsed ranges. 0.5 = real media-query reflow with an identical DOM at both viewports (clean control, no `hiddenRanges` stress). 0 = no media-query responsive behaviour | **W5 / W6 / W8** (band snapping, active-range verification, mobile-subtree inference) |
| **TG4** novel markup dialect | Framework/builder disjoint from the linear.app + stripe.com pilots (gnuboard, Wix, Astro, enterprise Java CMS, bespoke PHP CMS, Korean site-builder, framework-free). Next.js/React scores 0 — linear.app already covered that family | Layout-inference bias (Task 26 needed 16 Stripe-bias fixes) |
| **TG5** multi-route release surface | `sameHostUniqueUrls` >= 10, so `src/release/graph.ts`, plan/resolve and a real secondary route are exercisable | Release orchestrator (Task 25/26) |

### 3.3 TG arithmetic

| Host | TG1 | evidence | TG2 | bp | TG3 | evidence | TG4 | TG5 | urls | **TG** |
|---|---|---|---|---|---|---|---|---|---|---|
| seoultone.kr | 1 | 5 CORS-blocked sheets (Swiper x2, Kakao roughmap, GFonts x2) carrying real rules; all re-fetched | 1 | 7 | 1 | server-side UA branch (65,352 vs 62,237 HTML bytes) + AOS-hidden bands | 1 | 1 | 40 | **5.0** |
| xn--ok0b408a79cba430b.net | 1 | 15 `@container` rules + Wix Thunderbolt JS-computed geometry | 1 | 11 | 1 | Wix component swap (615 vs 716) + `width=320` fixed mobile mode | 1 | 1 | 11 | **5.0** |
| 9skin1.co.kr | 0 | 19/19 readable, 4,872 rules, 0 blocked | 1 | 10 | 1 | mobile gets SHORTER (18,981 -> 9,373px), nav dropped, quick-bar re-pinned | 1 | 1 | 35 | **4.0** |
| gs.severance.healthcare | 1 | `@import`-hidden sheets; `fontFace: 0` disproved by 4 loaded font files | 0 | 1 | 1 | 편의 시설 tile exists at 390 only (1,731 vs 1,715 elements) | 1 | 1 | 123 | **4.0** |
| yugiyu4.com | 0 | 33/33 readable, 0 blocked | 1 | 5 | 1 | same-URL UA branch (1,746 vs 1,649 elements) | 1 | 1 | 24 | **4.0** |
| mystarskin.co.kr | 1 | 2 CORS-blocked vendor Swiper sheets (fetched cleanly) | 0 | 0 | 1 | mobile is a different document at `/index.php/menu_gb/MB0` (585 vs 1,060) | 1 | 1 | 51 | **4.0** |
| xn--9l4b19k46k.com | 0 | blocked sheet proven fonts-only, 0 media rules | 1 | 4 | 0.5 | real reflow but DOM identical (382 both viewports) — clean control | 1 | 1 | 16 | **3.5** |
| interiorteacher.com | 0 | 6/6 readable, 93 media rules, 0 blocked | 1 | 12 | 1 | desktop Swiper rail (5 clipped) vs mobile 20-item 2-col grid — different item counts | 0 | 1 | 10 | **3.0** |
| interiorbay.co.kr | 0 | 17/17 readable, 2,924 rules, 0 blocked | 0 | 0 | 1 | server-side UA-branched dual template with ZERO breakpoints — new class | 1 | 1 | 132 | **3.0** |
| jusohot4.com | 1 | 4 `@container` rules (hits the `CSSRule.type === 4` bug at `collect-dom.ts:376`) | 1 | 11 | 1 | mixed rem/px breakpoint idioms + `@container`; React portal hamburger | 0 | 0 | 0 | **3.0** |
| hobbang01.com | 0 | 1 sheet, readable, 0 blocked | 1 | 4 | 1 | ~366 anchors behind `+N개 더보기` collapse — the `hiddenRanges` surface | 1 | 0 | 1 | **3.0** |
| hobbang.net | 0 | blocked sheet fetched, proven 0 media rules — negative control | 0 | 3 | 0.5 | 884-element DOM identical at both viewports; one table -> h-scroll container | 1 | 1 | 13 | **2.5** |

### 3.4 Full score arithmetic

| Rank | Host | Category | simplicity (6-d) | + catBonus | + pilotValue | + TG | = **score** |
|---|---|---|---|---|---|---|---|
| 1 | seoultone.kr | medical | 6-3 = 3 | +1 | +5 | +5.0 | **14.0** |
| 2 | gs.severance.healthcare | medical | 6-3 = 3 | +1 | +5 | +4.0 | **13.0** |
| 3 | interiorbay.co.kr | interior | 6-3 = 3 | +2 | +5 | +3.0 | **13.0** |
| 4 | 9skin1.co.kr | medical | 6-3 = 3 | +1 | +4 | +4.0 | **12.0** |
| 5 | xn--ok0b408a79cba430b.net | directory | 6-3 = 3 | +0 | +4 | +5.0 | **12.0** |
| 6 | yugiyu4.com | directory | 6-2 = 4 | +0 | +4 | +4.0 | **12.0** |
| 7 | xn--9l4b19k46k.com | directory | 6-1 = 5 | +0 | +3 | +3.5 | **11.5** |
| 8 | interiorteacher.com | interior | 6-4 = 2 | +2 | +4 | +3.0 | **11.0** |
| 9 | hobbang01.com | directory | 6-2 = 4 | +0 | +4 | +3.0 | **11.0** |
| 10 | hobbang.net | directory | 6-2 = 4 | +0 | +4 | +2.5 | **10.5** |
| 11 | mystarskin.co.kr | medical | 6-4 = 2 | +1 | +3 | +4.0 | **10.0** |
| 12 | jusohot4.com | directory | 6-2 = 4 | +0 | +3 | +3.0 | **10.0** |

### 3.5 Tie-break rule (applied in order)

1. Fewer scout content flags.
2. No `Disallow: /` naming ClaudeBot in `robots.txt`.
3. Lower difficulty.
4. Higher pilotValue.

Applied at 13.0 (gs.severance 0 flags beats interiorbay 1 flag), at 12.0 (9skin1 0 flags > xn--ok0b 4 flags > yugiyu4 5 flags + ClaudeBot disallow) and at 11.0 (interiorteacher 3 flags, no ClaudeBot disallow, beats hobbang01 5 flags + ClaudeBot disallow).

---

## 4. Full ranking

1. **seoultone.kr** — 14.0 — medical — d3 / pv5 — SELECT
2. **gs.severance.healthcare** — 13.0 — medical — d3 / pv5 — SELECT
3. **interiorbay.co.kr** — 13.0 — interior — d3 / pv5 — SELECT
4. **9skin1.co.kr** — 12.0 — medical — d3 / pv4 — BACKUP (medical quota)
5. **xn--ok0b408a79cba430b.net** — 12.0 — directory — d3 / pv4 — SELECT
6. **yugiyu4.com** — 12.0 — directory — d2 / pv4 — BACKUP (ClaudeBot `Disallow: /`, all 5 flags)
7. **xn--9l4b19k46k.com** — 11.5 — directory — d1 / pv3 — BACKUP (ClaudeBot `Disallow: /`)
8. **interiorteacher.com** — 11.0 — interior — d4 / pv4 — SELECT (interior "select both" rule)
9. **hobbang01.com** — 11.0 — directory — d2 / pv4 — BACKUP (ClaudeBot `Disallow: /`, all 5 flags)
10. **hobbang.net** — 10.5 — directory — d2 / pv4 — SELECT
11. **mystarskin.co.kr** — 10.0 — medical — d4 / pv3 — BACKUP
12. **jusohot4.com** — 10.0 — directory — d2 / pv3 — BACKUP (ClaudeBot `Disallow: /`, all 5 flags, 0 internal routes)

Note that raw score and selection deliberately diverge: `yugiyu4.com` and `xn--9l4b19k46k.com` outrank two selected sites but are not selected, because the program rules (category quotas, "do not force a hostile site") are applied **after** ranking, not folded into the score.

---

## 5. Applying the program rules

### 5.1 Category quotas

| Rule | Application |
|---|---|
| Target six pilots, preferred 2/2/2 | Met exactly. |
| "Only two interior candidates exist: select BOTH if technically suitable" | Both selected. `interiorbay.co.kr` and `interiorteacher.com` are both 200, `challenge: none`, no WAF, no auth wall, robots-permitted, and both received a SELECT from their own scout. Technically suitable -> both in. |
| "Medical: best 2 of 4" | `seoultone.kr` (14.0) and `gs.severance.healthcare` (13.0). `9skin1.co.kr` (12.0) is the primary medical backup; `mystarskin.co.kr` (10.0) the secondary. |
| "Directory: best 2 of 6" | `xn--ok0b408a79cba430b.net` (12.0) and `hobbang.net` (10.5) — see §5.2, this is a robots-posture decision, not a pure score decision. |

### 5.2 Directory selection is decided by robots posture, not by score

Four of the six directory candidates carry an explicit `robots.txt` group naming **ClaudeBot** under `Disallow: /`, alongside `Content-Signal: ai-train=no`:

| Host | Score | Difficulty | ClaudeBot `Disallow: /` | Flags |
|---|---|---|---|---|
| yugiyu4.com | 12.0 | 2 | **YES** (with GPTBot, CCBot, Google-Extended, Applebot-Extended, Bytespider, Amazonbot, meta-externalagent, CloudflareBrowserRenderingCrawler) | all 5 |
| xn--9l4b19k46k.com | 11.5 | 1 | **YES** (same 9-agent group) | 3 |
| hobbang01.com | 11.0 | 2 | **YES** (same 9-agent group) | all 5 |
| jusohot4.com | 10.0 | 2 | **YES** (same 9-agent group) | all 5 |
| **xn--ok0b408a79cba430b.net** | 12.0 | 3 | no — only `PetalBot` is root-disallowed; `*` is `Allow: /` with `Disallow: *?lightbox=` | 4 |
| **hobbang.net** | 10.5 | 2 | no — `robots.txt` is 65 bytes: `User-agent: *` / `Allow: /` / one Sitemap line | 2 |

The `*` group allows the homepage on all six and the scout was never blocked anywhere, so this is not an accessibility failure. But a `robots.txt` that names ClaudeBot specifically under `Disallow: /` is the operator's stated refusal toward this exact agent, and it is the strongest hostility signal available short of a challenge. The program rule is explicit: **do not force a hostile site merely to reach six.** Exactly two directory candidates carry no such refusal, and both received a SELECT from their own scout — so the directory slots fill themselves.

Consequence to record honestly: this pushes the directory picks up the difficulty ladder (d3 + d2 instead of the available d1 + d2), which is the direct cause of the cap overrun in §5.3.

### 5.3 The difficulty-3 cap — escape clause invoked, with evidence

The rule: *"Prefer difficulty 1-3. At most 2 sites at difficulty 3 unless the whole pool is unexpectedly complex."*

The recommended six contain **four** difficulty-3 sites and **one** difficulty-4 site. The escape clause is invoked. The evidence that the pool is unexpectedly complex:

**Pool difficulty distribution:** d1 x 1, d2 x 4, d3 x 5, d4 x 2. Only 5 of 12 candidates sit at or below d2.

**All five of those low-difficulty candidates are directory sites.** Zero medical candidates and zero interior candidates are below difficulty 3:

| Category | difficulties available |
|---|---|
| medical | 3, 3, 3, 4 |
| interior | 3, 4 |
| directory | 1, 2, 2, 2, 2, 3 |

Therefore the constraint set *{2 medical} + {2 interior} + {at most 2 sites at d3}* is **arithmetically unsatisfiable**: the medical and interior slots alone consume a minimum of four d3-or-worse sites. Either the category distribution or the difficulty cap has to yield, and the category rules in this task are stated as hard ("select BOTH if technically suitable", "best 2 of 4", "best 2 of 6") while the difficulty cap is stated with an explicit escape clause. So the cap yields.

**Compounding it:** four of the five low-difficulty candidates are additionally excluded by the ClaudeBot refusal in §5.2, leaving `hobbang.net` (d2) as the only sub-d3 site available to the whole program.

**Mitigation actually taken:**
- The single d2 candidate available is placed **first** in run order as the pipeline smoke.
- The four d3 sites are ordered by ascending execution cost (§8), so the cheapest d3 runs before the most expensive.
- The one d4 site is placed **last** and is made **conditional on a named pre-flight gate** (§6.4). If the gate fails, the program runs 5 pilots — still above the desired minimum of 4.

None of these six are difficulty 4-5 for architectural reasons: there is no canvas, no WebGL, no client-side router and no SPA shell in any selected site. Every d3/d4 assignment traces to capture-state hazards (frozen carousels, AOS scroll-reveal, lazy images, popup modals) or to volume (asset bytes, page height), all of which are diagnosable and bounded.

---

## 6. Recommended six — per-slot rationale

### 6.1 Medical slot 1 — `seoultone.kr` (score 14.0, d3, pv5)

**URL:** `http://www.seoultone.kr/` · **Secondary route:** `http://www.seoultone.kr/page/intro04.php` (진료시간 / 오시는길)

Top of the ranking on every axis at once: the joint-highest pilotValue (5), the joint-highest technical-generalization score (5.0), and the second-smallest DOM of all 12 (592 elements) so a full pilot is cheap relative to what it proves. Zero content flags. Fully permissive `robots.txt` (22 bytes, `User-agent: * / Allow: /`). Structurally it is the shape web-recon handles well — server-rendered gnuboard g5 PHP, flex-only layout with 0 grid and 0 tables, zero iframes/canvases/shadow roots/video/SPA routing, 1,610 CSS rules, 7 breakpoints, a genuinely reflowed 390 layout that gets *taller* (4,892 -> 5,632px).

What it uniquely buys: it is the **only http-only origin** in the batch (the https probe fails at the TLS layer with handshake alert 80, so it cannot be silently upgraded) — a scheme edge case that exercises the asset resolver's absolute-`http://` handling and, critically, the https **rebake** direction where today's clean `mixedContent: 0` becomes blocked subresources. It is also the batch's cleanest **W1 CORS-recovery** exercise: 5 blocked sheets, all of which re-fetched 200, so the recovery path can be validated against a known-good answer. Add gnuboard CMS markup with `?ver=NN` cache-busting and the 팝업레이어 modal pattern, 946 `@font-face` rules with Pretendard Variable on 523 of 592 elements, and a third-party Kakao tiled map rendered without an iframe.

**Secondary route:** `intro04.php` adds a sub-page template (shared header/footer plus inner-page chrome the homepage never exposes), and on gnuboard clinic themes the hours block is typically the site's only `<table>` — the homepage has `tables: 0`. Fallback: `/page/signature01.php`.

**Mandatory pre-steps:** (1) dismiss or model the gnuboard 팝업레이어 modal, which covers the hero in both captures behind a 24-hour cookie; (2) handle AOS scroll-reveal — both captures show multi-hundred-pixel blank bands where real content did not paint, and a blank-vs-blank screenshot diff scores green.

### 6.2 Medical slot 2 — `gs.severance.healthcare` (score 13.0, d3, pv5)

**URL:** `https://gs.severance.healthcare/gs/index.do` · **Secondary route:** `https://gs.severance.healthcare/gs/news/news/notice.do` (공지사항)

Zero content flags, no challenge, no WAF, `networkIdle` reached at both viewports, and a construct profile with none of web-recon's hard primitives: 0 canvas, 0 WebGL, 0 shadow roots, 0 custom elements, 0 video, 0 CSS grid, 0 tables, 0 `@keyframes`. Layout is 134 flex containers over server-rendered HTML.

Two things make it uniquely valuable to **this** task rather than to pilots in general. First, it is the batch's cleanest instance of the **W1 `@import` gap**: `rulesReadable: 316 / mediaRules: 1 / fontFace: 0` is provably an undercount — four font files loaded and `document.fonts` reports NanumSquare + NanumGothic — because the scout's walker never recurses `CSSImportRule` (`.styleSheet`, not `.cssRules`). `blocked: 0`, so this is **not** a CORS artifact; it is exactly the "capture cannot see the rules it needs" failure that 28.5C left open, in a non-CORS form. Second, it has by far the largest navigation graph in the pool: 475 anchors, **123 unique same-host URLs across 98 paths**, plus five sibling language sites — the first real workout for `src/release/graph.ts` and multi-route plan/resolve beyond a marketing site's dozen routes.

It also forces an open policy question into the light: `robots.txt` `Disallow: /_res/` and `/_share/` cover the **entire** CSS/JS/font/image tree, so a robots-respecting fetcher cannot reach asset independence without an explicit operator decision. No prior pilot had to reconcile robots compliance with Task 22.

**Secondary route:** the 공지사항 notice board is robots-allowed (the `*` disallow list blocks `/search/`, `/member/`, `/myseverance/`, `/online/`, `/checkup/`, `/mypage/`, `/api/` but not `/gs/news/`), is carousel-free (isolating CMS markup and Korean typography from the frozen-slider variable), and is structurally disjoint from a homepage with 0 tables, 0 forms and 0 grid containers. Avoid `/gs/doctor/doctor.do` — doctor directories on this platform typically depend on `/search/` and `/api/`, both robots-disallowed.

**Known hazard:** four slick carousels captured frozen and **demonstrably desynced across viewports** (건강정보 shows 부정교합 at 1440 but 말단비대증 at 390; the bottom carousel's active dot is 3rd vs 2nd). Parity QA must be told this is legitimate content divergence, not a mismatch.

### 6.3 Interior slot 1 — `interiorbay.co.kr` (score 13.0, d3, pv5)

**URL:** `https://www.interiorbay.co.kr/` · **Secondary route:** `https://www.interiorbay.co.kr/kwa-38941-515`

Selected under the "both interior candidates" rule and independently the third-highest score in the pool. The transport and CSS surface is the cleanest of the twelve — **all 17 stylesheets CORS-readable, 0 blocked, 0 fetched**, 2,924 rules — and none of the documented hard cases are present (0 iframes, 0 canvas, 0 WebGL, 0 shadow roots, 0 video, 0 inline SVG, 0 animated elements).

Its value is that it is the sharpest available probe for **residual Stripe/Linear bias in layout inference**: 155 `<table>` elements against **0 grid containers and 1 flex container**. Task 26 already had to land 16 generic Stripe-bias fixes; both prior pilots are 100% flex/grid. Alongside that it contributes a **new class of responsive behaviour** — a server-side UA-branched mobile template with `mediaMinMax: 0` and `breakpoints: []` (135,177 vs 115,944 HTML bytes, 2,672 vs 2,265 elements, `/slick/pc/` vs `/slick/mobile/`, a 7-column vs 3-column contract table). The current one-document-N-viewports model cannot represent this and should be forced to confront it; the pilot must be scoped as **two independent per-viewport reconstructions**, not a merged responsive template.

Also: 2,602 of 2,672 elements on a self-hosted Korean webfont (first real CJK metrics/fallback test at scale), ~57 MB across 137 resources with 0 lazy-loading (an order of magnitude beyond the validated 278-asset run), jQuery 1.8.3, and live per-request tables that will need masking before screenshot-diff QA.

**Secondary route:** `/kwa-38941-515` is the dominant repeatable sub-template in the recorded `samplePaths` (16 of 40 sampled paths share the `/kwa-38941-` prefix) and exercises `/works/css/interior_sub_koramz.css`, a sheet the homepage loads but never uses. Outside every robots disallow prefix. Second choice: `/kwa-38940`.

**Mandatory pre-step:** strip slick clone nodes before templating. The clones triplicate the five estimate rows verbatim into the captured text — a visible content defect, not merely a missing interaction. Also enter on `https://www.interiorbay.co.kr/` explicitly: the plain-HTTP apex probe redirects to `https://interiorbay.co.kr:54306/kwa-home`, a non-standard port on a different path.

### 6.4 Interior slot 2 — `interiorteacher.com` (score 11.0, **d4**, pv4) — CONDITIONAL

**URL:** `https://interiorteacher.com/` · **Secondary route:** `https://interiorteacher.com/furniture/list` (fallbacks `/content/list`, then `/service-info`)

The second interior candidate, selected under the explicit "select BOTH if technically suitable" rule. It is technically suitable — 200 at both viewports, one-hop redirect, no challenge, no WAF, no auth, robots allowing the homepage and every route we would want next, 262 KB of real server-rendered Next.js HTML (no SPA-shell trap), 0 canvas / 0 WebGL / 0 shadow roots / 0 tables, and `horizontalOverflow: false` at both widths.

Its difficulty-4 is concentrated entirely in **capture-time behaviour, not architecture**: a 20,563px page with 101 of 102 images `loading="lazy"`, `networkIdle` never reached within 20s at either viewport (session-replay and ad beacons keep the pool hot), three cross-origin YouTube iframes (one `autoplay=1&mute=1&loop=1` background embed) that bake as black bands, and a before/after drag-comparison slider frozen mid-state.

What earns the slot despite that: **93 CORS-readable media rules across 12 breakpoints with 0 blocked** — the richest unobstructed responsive corpus in the pool, and four of those breakpoints (min:1440, 1470, 1680, 1760) sit *above* the current probe ceiling. It is also the sharpest test of the hiddenRanges / midpoint-band work, because the two viewports do not merely restyle the same boxes: the desktop Swiper rail shows 5 clipped items while the 390 view presents a complete 20-item 2-column grid. Different item counts, not different styling.

**This slot is conditional on a pre-flight gate, and this is the one deviation from the "prefer difficulty 1-3" rule:**

> Before the full pipeline runs, a standalone capture check must demonstrate (a) a scroll-and-settle pass that loads >= 95% of the 102 images, and (b) a deterministic fixed capture budget or wait-for-selector replacing the unreachable `networkidle`. If the gate fails, drop this slot and run **5 pilots** — still above the desired minimum of 4. Do not substitute another category for it; the interior category has no third candidate.

**Secondary route:** `/furniture/list` is backed by `sitemap-product.xml` and adds repeating-node slot binding, filter/sort chrome and pagination, none of which the form-less, table-less homepage exercises. Risk: on Next.js a `/list` route is the likeliest place for client-side fetching or infinite scroll — if a smoke check shows the rows are absent from server HTML, fall back to `/content/list`.

### 6.5 Directory slot 1 — `xn--ok0b408a79cba430b.net` (score 12.0, d3, pv4)

**URL:** `https://www.xn--ok0b408a79cba430b.net/` · **Secondary route:** `https://www.xn--ok0b408a79cba430b.net/link`

The joint-highest technical-generalization score in the pool (5.0) and the most architecturally distinct target available: the only **site-builder platform** (Wix Thunderbolt, React-hydrated, 29 inline `<style>` tags and 0 `<link>` sheets). It clears the robots gate — the `*` group is `Allow: /` with only `Disallow: *?lightbox=`, and the only root-disallowed agent is PetalBot; ClaudeBot is not named.

It stacks four genuinely new fidelity hazards on a small, tractable 716-element DOM with no carousel, slider, video, canvas, WebGL, shadow DOM, iframe, table or client-side router — so single-observation capture loses nothing (the only animation is a one-shot `motion-fadeIn`):

1. **3,993 hangul characters with NO Korean webfont** — all 38 `@font-face` rules are Latin-only, so text metrics fall entirely to OS fallback. The sharpest possible exercise of Task 22's measured-fallback-cost machinery, because there is no font to embed.
2. **`width=320` fixed-width mobile mode** (`viewport meta width=320`, not `device-width`) — a third responsive category alongside fluid `device-width` (linear, stripe) and the frozen-px pathology from 28.5C. If the meta is dropped, mobile output renders ~18% too small at every dimension.
3. **15 `@container` rules** — invisible to viewport-based breakpoint sampling, and a direct hit on the `CSSRule.type === 0` grouping-rule bug W1 fixes.
4. **IDN punycode host + percent-encoded hangul routes** through safeHost naming, canonical/OG emission, asset rewriting and static-export directory naming.

And it is a **CORS-clean control for the responsive lane**: `blocked: 0, fetched: 0, readable: 29/29`, all 88 media rules directly available, so any residual is attributable to the algorithm rather than to missing CSS.

**Secondary route:** the homepage is structurally a prose brochure (20 anchors, 22 images, 0 tables) and does not exercise the link-grid its "directory" label implies. `/link` is the site's own dedicated directory page — third item in the primary nav, recorded in `samplePaths` — where the categorised listing actually lives. Second choice: `/%EC%A0%95%EB%B3%B4` (`/정보`), which additionally stresses non-ASCII route normalisation.

**Mandatory pre-step:** the recorded desktop capture is **known-incomplete** — the client-fetched Wix Blog widget rendered 2 of 5+ cards and left a visible ~400px hole, because Wix telemetry (`frog.wix.com`, `panorama.wixapps.net`) means `networkidle` is never reachable. The settle strategy must become wait-for-selector or a fixed budget before the pilot runs, or parity QA will report a false 1440-vs-390 divergence.

### 6.6 Directory slot 2 — `hobbang.net` (score 10.5, **d2**, pv4)

**URL:** `https://hobbang.net/` · **Secondary route:** `https://hobbang.net/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/` (`/링크모음/검색/`)

The **only sub-difficulty-3 site available to the entire program** after the robots filter, which makes it structurally load-bearing: it is the pipeline smoke test that runs first. `robots.txt` is 65 bytes of `User-agent: * / Allow: /` plus a sitemap line — no other agent groups at all. It also carries the fewest content flags of any directory candidate (link-aggregator, plus piracy on a single `다시보기` token in 8,047 characters).

Its runtime is the inverse of every failure mode in web-recon's history: **0 iframes, 0 canvas/WebGL, 0 shadow roots, 0 custom elements, 0 video, 0 carousels (no swiper/slick/aos anywhere), 0 keyframes, 0 forms, 0 CSS background images, 0 first-party JS bytes** (Astro static, `/_astro/<hash>.css`). The DOM is byte-identically **884 elements at both 390 and 1440**, so all responsive behaviour lives in 9 readable media rules against a 3-breakpoint Tailwind scale. That is precisely why it belongs first: any parity blocker found here is unambiguously an engine defect, with nothing to blame it on.

What it still buys beyond being easy: **5 real `<table>` elements** (neither prior pilot had one), including one that switches to a horizontal-overflow container at 390 — a distinct CSS box-model path; **hangul metrics through a `unicode-range` dynamic-subset variable font** (368 `@font-face`, Pretendard Variable from cdn.jsdelivr.net plus Hahmlet from Google Fonts); **percent-encoded hangul routes** (12 of 13 same-host paths); and a **CORS-blocked-stylesheet negative control** — the blocked sheet was fetched and proven to contain 0 media rules and 276 `@font-face`, which is exactly the counterpart evidence the 28.5C CORS work needs alongside a site where the blocked sheet *does* hide rules (`seoultone.kr`).

**Secondary route:** `/링크모음/검색/` is the site's actual repeated listing template rather than the homepage's explainer shape, adds a two-segment percent-encoded hangul route, and all 11 category pages share it so one proves the rest. Runner-up for prose contrast: `/이용가이드/`. Re-scout whichever is chosen before pilot use.

**Known gap:** the scout's own 390 capture was truncated (`screenshotCapped: true`, 24,000 of 34,460 device px) — the bottom ~30% including the entire footer has no scout evidence and must be re-captured.

---

## 7. Backups per category

| Category | Backup | Rank / score | Why it is the backup, and the condition for promotion |
|---|---|---|---|
| **medical** | `9skin1.co.kr` | #4 / 12.0, d3, pv4 | Highest-ranked non-selected candidate in the pool and its own scout's SELECT. Held out purely by the "best 2 of 4" quota. Zero content flags, 0 CORS-blocked sheets, 4,872 readable rules, 40 media rules and a 760/767/768 + 1200/1350/1400 breakpoint tangle that lands squarely on 28.5C's open midpoint-band question. Also the only `<video>` element in the batch (and it aborted in both captures — good adversarial input for asset independence). **Promote immediately if either medical slot fails pre-flight.** |
| **medical** | `mystarskin.co.kr` | #11 / 10.0, d4, pv3 | Second-line hard-case probe only. Contributes **nothing** to 28.6's A-lane (`breakpoints: []`, `mediaMinMax: 0`) and its 390 view is a UA-sniffed separate document at `/index.php/menu_gb/MB0`, so the responsive merge has no node correspondence. Its value is a single finding worth logging now, independent of any reconstruction: **AOS in re-hide mode leaves ~4,000 of 6,157 desktop pixels observed at `opacity: 0`, and `src/observer/layout-probe.ts:61` ends `autoScrollPrepare` with the same `scrollTo(0,0)` the scout used** — so a pilot would ship a blank reconstruction that screenshot-diff QA passes blank-vs-blank. Route that to the ideas lane regardless. |
| **interior** | **none available** | — | Only two interior candidates exist in the pool and both are selected. If `interiorteacher.com` fails its pre-flight gate (§6.4), the correct response is to **run 5 pilots**, not to substitute a directory or medical site into the interior slot. |
| **directory** | `yugiyu4.com` | #6 / 12.0, d2, pv4 | Strongest technical directory backup: gnuboard board-CMS markup, 33/33 stylesheets readable with 0 blocked, self-hosted Noto Sans KR on 1,581 elements (sidesteps the CDN-font licence problem), a 295-image grid where images are the content, and a documented anti-automation trap (devtools-blocker self-blanking above a 160px outer/inner height delta) that would be worth proving the pipeline survives. **Blocked by:** ClaudeBot `Disallow: /` and all five content flags. Promotion requires an explicit operator decision on both. |
| **directory** | `hobbang01.com` | #9 / 11.0, d2, pv4 | The cleanest responsive **control** in the pool — 1 same-origin readable stylesheet of 142 rules, 4 desktop-first breakpoints, 392 grid / 510 flex containers, and no hard construct anywhere — so any `hiddenRanges` error found on it cannot be blamed on unreadable CSS. Also the batch's best `hiddenRanges` stress case: ~366 anchors sit behind `+N개 더보기` collapse (442 DOM anchors vs ~76 visible rows). **Blocked by:** ClaudeBot `Disallow: /`, all five content flags, and `sameHostUniqueUrls: 1` (no secondary route exists). |
| **directory** | `xn--9l4b19k46k.com` | #7 / 11.5, d1, pv3 | The cheap conformance/control run: the simplest candidate on DOM (382), sheets (2), scripts (2), images (4) and media rules (5) simultaneously, with 0 keyframes and no framework. Would validate hangul metrics, a subsetted 496-rule Noto Sans KR face, IDN punycode and percent-encoded routes in isolation, with nothing else able to confound the result. **Blocked by:** ClaudeBot `Disallow: /`; also its primary CTA opens `jusohot4.com`, a five-flag host in this same batch — keep it as an outbound link, never follow it into scope. |

---

## 8. Run order — easiest first

Rationale: a generic engine defect should surface on hour one against a site with nothing to blame it on, not on hour six against a 20,563px lazy-loading Next.js page where the defect and the capture hazard are indistinguishable.

| Order | Host | Diff | DOM | Assets / page height | Why here |
|---|---|---|---|---|---|
| **1** | `hobbang.net` | **2** | 884 (identical at both viewports) | 6 images, 1.3 MB | The only sub-d3 site in the program. Zero first-party JS, zero carousels/iframes/canvas/shadow/keyframes, 9 readable media rules, DOM byte-identical across viewports. Any blocker here is unambiguously an engine defect. Full 8-pillar smoke against hangul at minimum confound. |
| **2** | `seoultone.kr` | 3 | 592 (smallest of the six) | 66 images, ~18 MB, 4,892px | Cheapest d3 by DOM. First real W1 CORS-recovery exercise with a known-good answer (5 blocked sheets, all re-fetched 200). Adds the http-only scheme case and gnuboard markup early, while iteration is still cheap. |
| **3** | `gs.severance.healthcare` | 3 | 1,731 | 37 images, 602 KB script, 2,700px | Architecturally the most *conventional* of the remaining sites (server-rendered flexbox, no builder JS layout), so a defect found here is most likely generic rather than platform-specific. Introduces the `@import` truth gap and the 123-URL route graph. |
| **4** | `xn--ok0b408a79cba430b.net` | 3 | 716 | 22 images, 3 hosts, 6,380px | Small and cheap in bytes, but the layout is JS-computed by Wix Thunderbolt and the responsive model is a component swap plus `width=320`. Runs after three conventional sites so the builder-specific findings can be told apart from generic ones. |
| **5** | `interiorbay.co.kr` | 3 | **2,672** (largest in pool) | 153 images, **~57 MB**, 155 tables | Heaviest d3 by an order of magnitude. Table-layout inference and the dual UA-branched template are both expensive to diagnose; run them once the engine is known-good on four simpler sites. |
| **6** | `interiorteacher.com` | **4** | 1,107 | 102 images (101 lazy), **20,563px**, 3 YouTube iframes | Hardest and last, and gated on the §6.4 pre-flight. `networkIdle` is unreachable, so capture timing is nondeterministic — precisely the condition under which a late-surfacing engine defect would be misattributed to capture flakiness. |

Run order: `hobbang.net` -> `seoultone.kr` -> `gs.severance.healthcare` -> `xn--ok0b408a79cba430b.net` -> `interiorbay.co.kr` -> `interiorteacher.com`.

---

## 9. Rejected (not selected) candidates

No candidate is rejected on accessibility grounds: all 12 returned HTTP 200 at both viewports with `challenge: none`, zero anti-bot signals, no WAF interstitial and no auth wall on the homepage. "Rejected" below means "not selected for a pilot slot".

| Host | Score | Reason not selected |
|---|---|---|
| `9skin1.co.kr` | 12.0 | Medical quota only. Ranks 3rd of 4 medical candidates behind two pv5 sites; the rule caps medical at 2. No technical or content objection — zero flags, permissive robots, 0 blocked stylesheets. Designated **primary medical backup**, promote on any medical slot failure. |
| `yugiyu4.com` | 12.0 | `robots.txt` names **ClaudeBot** (with GPTBot, CCBot, Google-Extended, Applebot-Extended, Bytespider, Amazonbot, meta-externalagent, CloudflareBrowserRenderingCrawler) under `Disallow: /` with `Content-Signal: ai-train=no`. All five content flags fire, and the outbound graph is 252 hosts of gambling and streaming-mirror destinations. Two directory candidates carry no such refusal, so this one is not forced. Excellent technical backup. |
| `xn--9l4b19k46k.com` | 11.5 | Same 9-agent `Disallow: /` group naming ClaudeBot. Also the lowest structural yield of the pool at pv3 — at difficulty 1 with 382 elements and no framework it proves little beyond what the Linear run already proved structurally. Kept as the cheap hangul/IDN/percent-encoded-route conformance control. |
| `hobbang01.com` | 11.0 | Same ClaudeBot `Disallow: /` group; all five content flags (the maximum in the set); and `sameHostUniqueUrls: 1` with `samplePaths: ["/"]`, so no secondary route exists in the record and the release plan/resolve flow would run as a degenerate single-route instance. Best-behaved responsive control in the pool if the operator ever clears the two blockers. |
| `jusohot4.com` | 10.0 | Same ClaudeBot `Disallow: /` group; all five content flags including four gambling-operator banner creatives that would propagate into every review and QA image pack; `sameHostUniqueUrls: 0` (129 anchors, 4 hash-only, the rest across 113 external hosts) so there is no route graph at all; off-host canonical and sitemap both pointing at `jusohot1.com`; and a numbered mirror-host family that makes this exact host unstable for re-capture. |
| `mystarskin.co.kr` | 10.0 | Lowest score in the pool and the wrong shape for 28.6's headline lane: `breakpoints: []` and `mediaMinMax: 0` means it cannot exercise the `hiddenRanges` / probe-gap machinery the task exists to close, and its 390 view is a UA-sniffed separate document (585 vs 1,060 elements) with no node correspondence to merge. Two of its most interesting properties (AOS re-hide blanking ~4,000px; a hero-occluding modal carousel) are also hazards that would mask the signal being measured. Retained as the second-line medical backup and as the source of one finding worth logging now (see §7). |

---

## 10. Content-risk notes

### 10.1 Robots posture toward this agent specifically

Four hosts carry a `robots.txt` group naming **ClaudeBot** under `Disallow: /`, alongside GPTBot, CCBot, Bytespider, Amazonbot, Applebot-Extended, Google-Extended, meta-externalagent and CloudflareBrowserRenderingCrawler, plus `Content-Signal: ai-train=no`: **`jusohot4.com`, `xn--9l4b19k46k.com`, `hobbang01.com`, `yugiyu4.com`**. The `*` group allows the homepage on all four and the scout was never blocked, but this is the operator's stated position toward this agent class and it was treated as a hard exclusion from selection. One host allows ClaudeBot explicitly: `mystarskin.co.kr` (`ClaudeBot: Allow: /`, `Crawl-delay: 10`). None of the six selected sites carries a ClaudeBot disallow.

One selected site has a partial robots conflict worth an explicit operator decision before the run: **`gs.severance.healthcare`** disallows `/_res/` and `/_share/` for `*`, which is the entire CSS/JS/font/image asset tree. Asset independence and robots compliance are in direct conflict there for the first time in the program.

### 10.2 Two content flags are demonstrable tokenizer artifacts — fix the matcher before trusting the flag elsewhere

- **`interiorbay.co.kr` — `adult`, sourced solely from `오피` x14.** `오피` is a substring of the office category label `사무/오피스`, which the page renders throughout the nav, the 9 filter chips and the office card meta lines. Both screenshots show a B2B interior-contracting marketplace with a full corporate footer.
- **`interiorteacher.com` — `adult` (`오피` x1, from `오피스` in "700평 오피스 공간"), `gambling` (`바카라` x2 / `baccarat` x1 — Baccarat the crystal maison is client case 01), `webtoon` (`웹툰` x1, from `웹툰 작가` in the influencer list).** All body-text hits, no title/meta hits.

**Recommended fix:** add word-boundary handling and an `오피스` exclusion to the scout's Korean token matcher, and re-evaluate the flag on every other Korean candidate before those flags are used as evidence anywhere downstream. Two of the six selected sites are currently mis-flagged.

### 10.3 Real content flags on selected sites

| Selected host | Flags | Detail |
|---|---|---|
| `hobbang.net` | link-aggregator, piracy | `링크모음` x42, `주소모음` x22 in body and in title/meta; piracy on exactly one `다시보기` token in 8,047 characters. Its single outbound external link points at `hobbang01.com` (five flags) — **do not follow that into pilot scope**; category subpages must be re-scouted rather than inheriting the homepage's flag profile. |
| `xn--ok0b408a79cba430b.net` | link-aggregator, gambling, piracy, webtoon | `주소모음` x11, `최신 주소` x18, `카지노` x5, `먹튀검증` x1, `다시보기` x3, `티비착` x9, `애니` x4. The **adult flag was NOT raised** and there is no age gate (`ageOrAdultGateElements: 0`, auth classification `none`). Links outward to `www.yugiyu4.com`, itself a five-flag candidate in this pool — same rule, do not follow. |
| `seoultone.kr`, `gs.severance.healthcare`, `interiorbay.co.kr`\*, `interiorteacher.com`\* | none / artifact only | \*see §10.2. |

A faithful reconstruction reproduces flagged text verbatim. Both flagged selections are engine test beds, not showcase artifacts: any published output from them should be internal-only or content-replaced, and that is a distribution decision for the orchestrator, not a technical blocker.

### 10.4 Medical category is regulated, and every identity surface must be replaced

All four medical candidates recorded **zero content flags** — and all four are nonetheless the highest-obligation sites in the pool, because their content is real, identifiable and legally constrained. Korean medical-advertising rules apply. For a fresh-site pilot, every one of the following must be replaced or routed to the operator-input path:

- **`seoultone.kr`** — named physician (김진용), photographed diplomas and certificates bearing that name, staff photos, business registration number, two phone numbers, street address, e-mail. These are the *majority* of the page's visual content.
- **`gs.severance.healthcare`** — hospital name and logo, live call-centre numbers (1599-6114, 1899-7588, +82-2-2019-4900), postal address, press links (KBS / 한국일보 / 경향신문), and third-party accreditation marks (보건복지부 인증, 기관생명윤리위원회 / IRB, KOIHA, ISMS, `emrcert.mohw.go.kr`). **Certification marks and press logos legally cannot transfer to another entity** — they must route through the operator-input path, not the content-injection path. This is the Task 26 "content-review kind" carry-forward hitting a real case.
- **`9skin1.co.kr`** (backup) — before/after photographs of identifiable patients (some unpixelated), advertised prices for medical procedures, a body-hair-removal promo creative, and statutory identifiers (사업자번호 565-10-01602).
- **`mystarskin.co.kr`** (backup) — a named 대표자, address, phone, 사업자등록번호 151-10-01951, and two named individual physicians.

Nothing published from any of these may read as a look-alike of the real clinic or hospital.

### 10.5 Other content-adjacent risks on selected sites

- **`seoultone.kr` is http-only.** The https probe fails at the TLS layer (handshake alert 80), so it cannot be silently upgraded. Absolute `http://` asset URLs, including a plain-http Kakao `roughmapLander.css`, become mixed content the moment a rebake is served over https.
- **Content drift** makes cross-run comparison unsafe on several selections: `interiorbay.co.kr` regenerates its 실시간견적리스트 / 견적대기리스트 / 공사계약현황 tables per request with `last-modified` equal to request time; `hobbang.net` carries dated verification tables and a stated re-check cadence; `xn--ok0b408a79cba430b.net` composes HTML per request with differing weak ETags. Freeze the observation, and mask live regions before screenshot-diff QA.
- **`auth: login-ui-present`** on `gs.severance.healthcare` and `interiorbay.co.kr` — no homepage gate and `redirectedToLogin: false` in both cases, but a reconstruction surfaces non-functional membership entry points. Crawl expansion must avoid `/member/` (robots-disallowed on both).

---

## 11. Secondary route suggestions — all 12 candidates

| Host | Cat | Secondary route | What it adds over the homepage | Robots | Fallback |
|---|---|---|---|---|---|
| **seoultone.kr** | med | `http://www.seoultone.kr/page/intro04.php` | sub-page template + inner-page chrome; the hours block is typically the only `<table>` (homepage `tables: 0`); a second larger Kakao map | `Allow: /`, no disallows | `/page/signature01.php` |
| **gs.severance.healthcare** | med | `https://gs.severance.healthcare/gs/news/news/notice.do` | CMS board list/table markup, pagination, a real search form (homepage has 0 tables, 0 forms, 0 grid); carousel-free, isolating markup from the frozen-slider variable | allowed (`*` blocks `/search/`, `/member/`, `/myseverance/`, `/online/`, `/checkup/`, `/mypage/`, `/api/`, not `/gs/news/`) | `/gs/department/department-center-clinic-all.do`. **Avoid** `/gs/doctor/doctor.do` — depends on robots-disallowed `/search/` and `/api/` |
| **interiorbay.co.kr** | int | `https://www.interiorbay.co.kr/kwa-38941-515` | dominant repeatable sub-template (16 of 40 sampled paths share the prefix); exercises `interior_sub_koramz.css`, loaded but unused on the homepage; detail/record layout with breadcrumb and long-form body | outside all 7 disallow prefixes | `/kwa-38940`. **Avoid** `/board/`, `/cooker/`, `/member/`, `/tools/`, `/user_dir/`, `/visit_log/` |
| **interiorteacher.com** | int | `https://interiorteacher.com/furniture/list` | catalogue grid (backed by `sitemap-product.xml`): repeating-node slot binding, filter/sort chrome, pagination — none present on a form-less, table-less homepage | allowed | `/content/list` (more likely SSR), then `/service-info`. Risk: `/list` on Next.js is the likeliest place for client-side fetch or infinite scroll — smoke-check the server HTML first |
| **xn--ok0b408a79cba430b.net** | dir | `https://www.xn--ok0b408a79cba430b.net/link` | the site's actual directory listing; the homepage is a prose brochure (20 anchors, 0 tables) that does not exercise the link grid its category implies | `*` `Allow: /`, only `Disallow: *?lightbox=` | `/%EC%A0%95%EB%B3%B4` (`/정보`) — adds non-ASCII route normalisation |
| **hobbang.net** | dir | `https://hobbang.net/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/` | the real repeated listing template (homepage is an explainer); two-segment percent-encoded hangul route; dense repeated link rows; all 11 category pages share it | `Allow: /`, no disallows | `/%EC%9D%B4%EC%9A%A9%EA%B0%80%EC%9D%B4%EB%93%9C/` (`/이용가이드/`). Re-scout before use |
| 9skin1.co.kr | med | `https://www.9skin1.co.kr/web/review` | the page `board.css` exists for: server-rendered record list with real selectable hangul, per-item metadata, thumbnails, pagination — the slot-binding surface the image stack starves | inside `Allow: /`, no login | `/web/product` |
| mystarskin.co.kr | med | `https://www.mystarskin.co.kr/index.php/board/list/equipment/14` | CMS board list: repeating rows, pagination, a real search/filter form, actual selectable text; list->view proven populated at `/board/view/equipment/14/451611/cpage/1` | matches none of the 4 disallows | `/index.php/html/17` (only html route with a recorded child, `/17/140`) |
| yugiyu4.com | dir | `https://www.yugiyu4.com/notice` | gnuboard `bbs/board.php` list view: paginated post list with title/author/date columns and pagination controls (homepage has `tables: 0`, `forms: 1`); the category routes are structural repeats | `*` allows | `/webtoon` |
| hobbang01.com | dir | **none available** | `sameHostUniqueUrls: 1`, `samplePaths: ["/"]`; all 442 anchors are hash-only (12) or across 412 external hosts | — | unverified follow-up: read `https://hobbang01.com/sitemap.xml` to learn whether any subpage exists |
| jusohot4.com | dir | **none available** | `sameHostUniqueUrls: 0`, `sameHostUniquePaths: 0`, empty `samplePaths`; 4 of 129 anchors hash-only, rest across 113 external hosts; canonical and sitemap both point off-host at `jusohot1.com` | — | pilot as a single-route instance, or run a fresh crawl — do not pick from the recorded links |
| xn--9l4b19k46k.com | dir | `https://xn--9l4b19k46k.com/링크모음/검색/` (`/%EB%A7%81%ED%81%AC%EB%AA%A8%EC%9D%8C/%EA%B2%80%EC%83%89/`) | two-segment non-ASCII path; category detail page with the dense link list the homepage only teases as chips; a second template | `*` `Allow: /` (but ClaudeBot `Disallow: /`) | `/faq/` (ASCII path, safer first run) |

---

## 12. Rationale in one paragraph

All twelve candidates are reachable, unchallenged and unwalled, so selection was decided by three things in order: the program's category quotas, the operators' stated posture toward this agent, and score. Both interior candidates are selected because the rule says to and both are technically suitable; the two highest-scoring medical candidates take the medical slots; and the directory slots are decided not by score but by `robots.txt`, because four of six directory candidates name **ClaudeBot** under `Disallow: /` and the program explicitly forbids forcing a hostile site to reach six. That last constraint is also what breaks the difficulty budget: every candidate at difficulty 1-2 in this pool is a directory site, four of those five are ClaudeBot-disallowed, and not a single medical or interior candidate sits below difficulty 3 — so *{2 medical} + {2 interior} + {at most 2 at difficulty 3}* is arithmetically unsatisfiable and the escape clause applies. The resulting six are honest about what they cost: one difficulty-2 smoke test that runs first with nothing to blame a defect on, four difficulty-3 sites ordered by ascending execution cost, and one difficulty-4 site placed last behind a named capture pre-flight gate that, if it fails, simply reduces the program to five pilots — still above the desired minimum of four. Between them the six cover every markup dialect the two prior pilots missed (gnuboard, enterprise Java CMS, Korean site-builder with 155 tables, Wix Thunderbolt, Astro static, Next.js), three distinct responsive classes (media-query reflow, UA-branched dual template, `width=320` fixed mobile), both halves of the CORS-capture question (a site whose blocked sheets hide real rules and a site where they provably do not), the `@import` and `@container` truth gaps that W1 exists to close, and four separate Korean webfont regimes — self-hosted multi-weight, variable dynamic-subset, licence-unknown institutional, and no Korean webfont at all.

---

*Ranking agent, Task 28.6. Read-only: no site was re-fetched, no git state was modified.*
