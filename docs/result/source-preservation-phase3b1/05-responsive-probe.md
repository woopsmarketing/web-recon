# 05 — Responsive probe (one resize)

**The running program responds to viewport state.** B9 passes automatically, and the
adjudicated reading agrees.

Resize: 1440×900 → 390×844, one `setViewportSize`, observed for 3 s with a
MutationObserver on `documentElement`. 390 is an arbitrary narrow probe, not a claimed
breakpoint.

| measure | value |
|---|---|
| mutation records | 89 (all inside `#__next`) |
| nodes added / removed | 9 / 5 (mutation-level) |
| attribute mutations | 75 |
| identity vs settled state: removed / inserted in root | 40 / 19 |
| class changes on retained nodes | 60 |
| `#__next` elements | 213 → 192 |
| textContent | 522 → 497 |
| document height | 4,533 → 3,049 px |
| fatal-shaped errors during resize | 0 |
| still mounted (root elements, React container, Next router) | yes / yes / yes |

## What changed structurally

| removed subtree roots (at 390) | inserted subtree roots (at 390) |
|---|---|
| desktop header navigation (25 nodes: 포트폴리오 · 서비스 소개 · 읽을거리 · 상담 신청) | two "more" buttons re-created under a new parent |
| two "more" buttons (re-parented) | two small icon buttons (component not identified) |
| two spacer boxes | one box |

At 390, `after-resize.png` shows:
- the header is reduced to logo and hamburger;
- section headings wrap onto two lines;
- the "more" buttons move under the headings;
- the footer reflows into a single column.

The runtime also requested the mobile variant of the bottom image
(`/_next/static/media/main-bottom-mobile.ba94f0cd.jpg`), which the evidence path map served
from the evidence set.

**Reading:** this is a component-tree change driven by the viewport (media-query state), not
only a CSS reflow: nodes were removed and inserted by React. It is the inverse of the
desktop switch observed between the commit point and the first microtask (`04`).

Not judged here: whether the mobile rendering matches the source site's mobile page. No
breakpoint is asserted and no fidelity judgement is made.
