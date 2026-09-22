# Task 28.8 FAST — 03 Cross-site findings and shared-core corrections

Status: **COMPLETE**.

## 1. Shared-core corrections during fresh validation (Phase F, max two)

### Correction 1 — parser-unstable SPA DOM edges are adapted, not refused (GENERIC)

| item | detail |
|---|---|
| trigger | Channel Talk, first `pnpm reconstruct`: `p000002/desktop (/kr/alf-customer): observed DOM nests <a> (n000598) inside <a> … (nested-anchor) … the generator refuses`. After the anchor fix, the very next stage: `p000004/desktop (/kr/pricing): <div> (n001096) inside <p> (block-closes-p)`. One nested edge killed the WHOLE site build. |
| why generic | React/Next (and any SPA) builds these shapes through DOM APIs; the live DOM is real, only the serialized TAG cannot survive the HTML parser. The old rule interposed a container for `li`/`dd`/`dt` only and threw for every other kind. This is not a channel.io property: any SPA-built site can produce it, and no hostname or site-specific selector is involved. |
| rule | `src/reconstruction/nesting.ts`: (1) `nested-anchor` / `nested-button` / `nested-formatting` / `nested-form` with no legal container → the SAME node (same id, classes, children) is demoted to a layout-neutral tag (`a`,`button`,`nobr` → `span`; `form` → `div`), marked `data-wr-demoted="<tag>"`, any `href` kept as `data-wr-href`; (2) `block-closes-p` → the nearest OPEN `<p>` in scope is re-tagged to `<div>` (marked `data-wr-demoted="p"`), which accepts any flow content; the block child is untouched. The walk now carries ancestor NODES so a re-tagged ancestor is seen at once. Table-model kinds still refuse (unchanged). |
| honesty | new manifest counter `nestingDemotions` (interposed containers stay in `nestingAdaptations`; a demotion adds NO element, so `elementNodes` is not inflated), new limitation kind `parser-invalid-nesting-demoted` with a one-sentence description; `validate-output.ts` asserts every `data-wr-demoted` element is a `span`/`div`, and still re-runs the parser-repair detector on the WRITTEN tree. Every adaptation carries `mode: "interpose" \| "demote"`. |
| what the human will see | the box, classes and text are unchanged; the demoted inner link/button is no longer its own control (the enclosing link still navigates). Frozen classes carry computed color/decoration/display, so a `span` paints the same box. |
| suites | reconstruction **247/247** (10 new assertions: demote nested `<a>` in place with id/classes kept, href → `data-wr-href`; nested `<button>` → span; `<p><div>` re-tags the `<p>`; `li`-in-`li` still interposes `ul.wr-nest` (unchanged); table stray text still refuses); layout-safety **512/512**; `pnpm typecheck` 0 |
| negative control | hobbang.net (pinned 28.75 spec) rebuilt on the anchor stage: `nestingAdaptations` 0 → 0, `nestingDemotions` 0, limitations 11 → 11, build PASS (REC `2026-09-08T16-44-22-290Z`); rerun on the final core recorded below |
| rerun after correction | Channel Talk full build (all 4 deep routes — the correction gates the build itself, so the "affected route" is the site) |

_Final-core negative control (anchor + paragraph stages):_ hobbang.net rebuilt again on the final core — REC `2026-09-08T16-48-42-950Z`, build PASS in 84 s, `nestingAdaptations` 0 → 0, `nestingDemotions` 0, limitations 11 → 11, element/text node counts unchanged. (`authoredInlineSize` 122 → 155 with 34 `var()`-admitted declarations is the A2b effect from the core finish, not this correction.)

### Correction 2 — `<noscript>` / `<script>` / `<style>` / `<template>` markup is never "visible text" (GENERIC, QA lane, rubric 7 → 8)

| item | detail |
|---|---|
| trigger | RoseeSkin first QA: 9 of 10 pairs BLOCKER, every one carrying `missing-text-ratio` 40–60 % and `visible-text-ratio` < 60 %, while the 1440 pixel residual on the same pairs was 0.15–1.1 % (visually identical). The missing "text" samples were literally `<iframe src="https://www.googletagmanager.com/ns.html?…"` and `<img height="1" width="1" style="display:none" …>` — the GTM / Logger / pixel `<noscript>` fallbacks that sit directly under `<body>` in the source (`site-observations/2026-09-08T16-44-02-947Z/pages/p000001/viewports/mobile/rendered.html`). A live page with scripting on keeps them as raw text nodes; the clone never carries them; on a page whose real text is ~900 chars they were 376 chars = 40–60 % of the census. |
| why generic | GTM + Facebook/Naver pixel `<noscript>` fallbacks are on most commercial sites (every Korean builder site has them); the rule is site-independent and applied identically to both sides. Channel Talk's control pairs are numerically unchanged (its missing text is a live counter, see below). |
| rule | `src/responsive-qa/probe.ts` `isDisplayed` (shared by the text census, the region census and the box census): an ancestor `<noscript>/<script>/<style>/<template>` makes the text not displayed; `src/responsive-qa/capture.ts` dwell census: same walk. `RUBRIC_VERSION` 7 → 8. |
| suites | responsive-qa **381/381** (new fixture `/noscript`: GTM iframe + pixel img in `<noscript>`, a `<template>` and a `<script type=text/plain>` beside `<p>hello world</p>` → `visibleTextChars === 11`); `pnpm typecheck` 0 |
| negative control | Channel Talk `/kr` @390 + @1440 rerun on rubric 8 (QA `2026-09-08T18-54-21-769Z`): MINOR m4 / m3, missing-text 1.35 % / 0.97 %, pixel residual 3.71 % / 5.65 %, offscreen 61 / 747 chars — identical to the rubric-7 run; its missing text is the live customer counter (`전 세계 247,473 개 기업…` vs `247,465` on the clone), source-inherent. |
| rerun after correction | RoseeSkin all 5 deep routes × 390/1440 (rubric change affects every pair) — recorded in 02-roseeskin.md §5 |

No third correction was allowed or needed (limit: two).

## 2. Tooling-only changes during fresh validation (not core)

| change | why |
|---|---|
| `tmp/wr288f/orch/scope-inputs.mjs` — compile inputs scoped to the deep budget (verbatim records only) | the observer, compiler and reconstructor hold three different consistency invariants for a trimmed selection (details in 01-channel.md §4) |
| `src/cli-observe-site.ts --max-validation-samples N` (CLI plumbing for an EXISTING `maxValidationSamples` option) | the RoseeSkin observation died twice at page 7 of 7 together with the orchestrating process; the second sample page was dropped for the third attempt (1 sample kept) and long jobs are now launched in their own session (`setsid`) with a memory monitor |

## 3. Cross-site comparison

| dimension | Channel Talk (Next.js / styled-components, animation-heavy) | RoseeSkin (imweb builder, asset-heavy) |
|---|---|---|
| discovery → SiteSpec | 59 verified / 31 families → 4 deep + 1 sample; 15 scoped routes | 40 verified / 22 families → 5 deep + 1 sample; 17 scoped routes |
| capture | 348 s, first attempt | 542 s, third attempt (two lost with the orchestrating process) |
| reconstruction | 62 s after correction 1 (two refusals: nested `<a>`, `<div>` in `<p>`) | 272 s first time (44 MB home page), 0 parser adaptations |
| served switch | 801 product policy (authored evidence 992) | 801 product policy (authored evidence 992) |
| truth-width QA | 0 B / 2 M / 6 m on 8 pairs | 1 B / 1 M / 7 m / 1 PASS on 10 pairs (after correction 2; 9 B before it) |
| what the MAJOR/BLOCKER are | images not painted on one product page (+5 / +10 assets) | desktop home: footer band + hero photo not painted; mobile home: DOM-only blank-region grade on an identical block |
| safety widths | 700 / 800 SAFE; 1024 / 1100 usable with 340–416 px horizontal scroll (frozen 1,440 canvas, A9 residual) | all four SAFE, no horizontal scroll, 100–176 px decorative right bleed |
| CJK | clean at every width | clean at every width (incl. the 진료시간 table and the popup card) |
| popups | announcement bar only, kept on both sides | entry popup card kept on both sides in the same state |
| dynamic sections | scroll-reveal sections blank in BOTH captures (8.7 k px of the home page) — ADVANCED SOURCE LIMITATION | decorative studio / wood background sections empty in BOTH captures; 5 unknown widgets |
| verdict | READY FOR HUMAN REVIEW | READY FOR HUMAN REVIEW |

**What generalised (both sites):** the 801 product switch served the right tree at every width without a per-site override;
authored `width:100%` / `max-width` relations shipped on both (259 / 311 rules) and the imweb desktop tree stayed fluid at 1024 / 1100;
Korean text needed no site-specific work; both captures kept their popups/bars identically on both sides.

**What did not generalise / what is generic-but-open:** (1) the frozen desktop canvas at intermediate widths is a property of
sites whose ancestor chain carries authored pixel widths (Linear, Channel Talk) — the A9 residual stays a named limitation;
(2) images that fail to paint in the clone (srcset / lazy descriptors) — seen on Channel Talk, not on RoseeSkin; (3) desktop-only
assets (hero background photo) and a footer widget not carried on RoseeSkin's home; (4) both real sites needed the deep-budget
input scoping and the two corrections, which are generic product fixes, not site hacks. No hostname-specific logic exists anywhere
in `src/`.
