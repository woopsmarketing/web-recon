# Task 28.6 — Pilot Selection Decision (orchestrator)

The scout ranked all twelve candidates (`docs/result/28.6/02-domain-scout-summary.md`, per-candidate reports under `docs/result/28.6/scout/`). All twelve were reachable, unchallenged and unwalled. Selection was therefore decided by category quota, by the site operators' stated posture, and by score.

## Access posture is the decisive constraint

Four of the six directory candidates publish a robots.txt that names **ClaudeBot specifically under `Disallow: /`**, alongside GPTBot, CCBot, Bytespider, Amazonbot, Applebot-Extended, Google-Extended, meta-externalagent and CloudflareBrowserRenderingCrawler, with `Content-Signal: ai-train=no`:

| Host | Posture |
|---|---|
| yugiyu4.com | ClaudeBot `Disallow: /` |
| xn--9l4b19k46k.com | ClaudeBot `Disallow: /` |
| hobbang01.com | ClaudeBot `Disallow: /` |
| jusohot4.com | ClaudeBot `Disallow: /` |

These are excluded. The program's own rule is explicit: do not force an inaccessible or hostile site merely to reach six. Exactly two directory candidates carry no such refusal, and both fill the directory slots on their own merits. Promoting any of the four would need a deliberate operator decision that overrides a site's published refusal; the orchestrator will not make that call unilaterally.

## The six selected pilots, in run order

| # | Host | Category | Difficulty | Secondary route | What it proves that Linear and Stripe did not |
|---|---|---|---|---|---|
| 1 | hobbang.net | directory | 2 | `/링크모음/검색/` | Astro static, zero first-party JS, DOM byte-identical at 390 and 1440. Any parity blocker here is unambiguously an engine defect, which is why it runs first. Adds real `<table>` elements, hangul metrics through a unicode-range dynamic-subset variable font, percent-encoded hangul routes, and a CORS-blocked sheet that provably holds no media rules (a negative control for W1). |
| 2 | seoultone.kr | medical | 3 | `/page/intro04.php` | The only http-only origin in the pool, so the scheme cannot be silently upgraded. gnuboard g5 markup. The cleanest positive control for the W1 CORS recovery: five blocked sheets that all re-fetch 200, so recovery can be checked against a known-good answer. |
| 3 | gs.severance.healthcare | medical | 3 | `/gs/news/news/notice.do` | Enterprise Java CMS, server-rendered, none of the hard primitives (no canvas, WebGL, shadow DOM, video, grid or tables) over 134 flex containers. The cleanest instance of the W1 `@import` gap in non-CORS form. |
| 4 | xn--ok0b408a79cba430b.net | directory | 3 | `/link` | Wix Thunderbolt, React-hydrated, 29 inline `<style>` tags and zero `<link>` sheets. Carries 15 `@container` rules, which is the direct validation target for the W1 grouping-rule bug. Also an IDN punycode host with percent-encoded hangul routes, a `width=320` fixed-width mobile mode as a third responsive class, and 3,993 hangul characters with no Korean webfont at all. |
| 5 | interiorbay.co.kr | interior | 3 | `/kwa-38941-515` | 155 `<table>` elements against zero grid containers and one flex container, where both prior pilots were entirely flex and grid. The sharpest available probe for residual Stripe and Linear layout bias. Adds a server-side UA-branched mobile template that the one-document-N-viewports model cannot represent. |
| 6 | interiorteacher.com | interior | 4 | `/furniture/list` | **GATED.** Selected under the "select both interior candidates if technically suitable" rule. Its difficulty is capture-time, not architectural. Richest unobstructed responsive corpus in the pool: 93 CORS-readable media rules across 12 breakpoints, four of them above the current probe ceiling, and a desktop rail showing 5 clipped items where 390 shows a complete 20-item grid. |

**Gate on pilot 6.** Before its full run, a standalone capture check must show a scroll-and-settle pass loading at least 95% of the 102 lazy images, with a deterministic wait replacing `networkidle` (which is unreachable there in 20 s). If the gate fails, the program runs five pilots, which is still above the desired minimum of four. Interior has no third candidate, so no substitution is made.

## Backups

9skin1.co.kr is the primary medical backup and the highest-ranked non-selected candidate, held out only by the "best 2 of 4" medical quota. It is promoted immediately if either medical slot fails pre-flight. mystarskin.co.kr is second-line. Interior has no backup by construction.

## Two policy conflicts recorded, not buried

**Asset tree versus robots on gs.severance.healthcare.** Its robots.txt disallows `/_res/` and `/_share/`, which is the entire CSS, JS, font and image tree, while allowing the pages themselves. Decision: the pilot observes the two named pages in a browser, which loads their subresources the way any browser visiting those pages does. It runs no asset inventory crawl, no `assets:materialize`, and does not follow the site's 123-URL route graph. Bulk asset re-fetching is crawler-like behaviour and is also out of scope for Phase 1, so the conflict does not have to be resolved to complete this task. It is flagged here because it will have to be resolved before any production or release phase touches a site with this posture.

**Regulated and sensitive content on the medical pilots.** Korean medical advertising is a regulated category. These sites publish named physicians, business registration numbers, procedure prices, accreditation marks, and in one case patient before-and-after photography. The reconstructions are local fidelity tests that are never deployed, and the review packs are local screenshots of pages that are already public. They should not be redistributed, and every identity surface would have to be replaced before any derivative were published. `gs.severance.healthcare`'s accreditation marks in particular cannot legally transfer to a derivative.

## Scout findings that are engine defects, not site properties

Three findings from the scout are generic and belong to the engine, independent of whether their sites are ever reconstructed. They are logged for the correction lane:

1. **Scroll-reveal blanking.** `src/observer/layout-probe.ts` ends its scroll preparation by returning to the top of the page. On a site using AOS in re-hide mode, that leaves the majority of the page observed at `opacity: 0`. The reconstruction would then ship blank, and screenshot-diff QA would pass it blank-against-blank. Measured on mystarskin.co.kr: roughly 4,000 of 6,157 desktop pixels.
2. **Modal overlays baked as permanent.** An entry popup open at capture time is reconstructed as a permanent overlay covering the hero. Seen on two of the twelve.
3. **Full-page screenshot cap blindness.** A 12,000px screenshot cap over an 18,981px page makes visual QA structurally blind below the cap rather than reporting that it stopped looking.
