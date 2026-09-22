# Task 29 FAST — Slotized Recon Template V1 — Final Report

## Executive Summary

Task 29 built a new **Slotized Template** layer (`src/slotized-template/`) on top of the existing, frozen Slot V2
recon-template system. It adds the four missing primitives — Bindings (already close in V2), Groups, Repeaters, and
Theme tokens — so that an accepted Reconstruction becomes `TEMPLATE + CONTENT PACK (+ THEME PACK) = RENDERED SITE`.
Both pilot sites (beomeo.roseeskin.com, channel.io) were run end-to-end: slotize → repeater/theme extraction →
mechanical + realistic content packs → mutated theme pack → render → automated e2e gates. One correction cycle was
needed (a fixture/audit gap, not an engine bug — see below); the final e2e run is 0 FAIL / 2 WARN (a baseline-offline-
image condition). Typecheck is clean repo-wide. Verdict: **READY FOR SLOTIZED TEMPLATE HUMAN ACCEPTANCE**.

## Reconstruction V1 remained closed

No file under `src/reconstruction*`, `src/observer*`, `src/sitespec*`, `src/recon-template/`, `src/theme/`, or
`src/content-injection/` was modified by Task 29 agents — every phase handoff (A/B/C/D/E1/E2/E1-fix) explicitly avoided
those directories per the frozen contract. `git status --short` on those paths currently shows 40 modified files, but
those modifications **predate Task 29** (they are part of the repo's pre-existing 264-file dirty tree noted in
`tmp/wr29/state.md`'s HEAD line, from earlier work sessions before this task began). Git diff timestamps cannot prove a
file was untouched during a specific window, so this claim rests on the handoffs' explicit statements (no B/C/D/E1/E2
agent reports editing any file in those directories) rather than on the git status alone — flagged here for the
human reviewer.

## Shared Schema / Isolated Templates

One shared TypeScript+zod schema and one engine (`src/slotized-template/`) serves both sites; every site's ids,
bindings, CSS overrides, and values are template-local (`data/<host>/slotized-templates/<run-id>/`). No shared
Hero/Card/FAQ components and no industry-specific schema exist — pattern hints (`patternHint` on groups) are optional
labels only, never load-bearing for rendering.

## Slot/Binding implementation

Slots extend Slot V2's `SlotDefinition`/`SlotBinding` model (same deterministic-hash-id philosophy, upgraded from V2's
sequential `sl000001`/`b000001` scheme to content-hashed `slot_<12hex>`/`bind_<12hex>` ids). New surfaces beyond V2:
CSS `background-image`, `<video>/<audio>/<source>/<picture>`, `title`/`aria-label`/`placeholder`, and route-map page
title. Values are written directly into the existing reconstructed node (text child, attribute, svg run, css rule) —
no wrapper DOM is ever inserted. `number` exists as a SlotType but is never inferred (no provable round-trip
neutrality for numeric formatting).

## Groups/Globals

Groups form a strict hierarchy — page → section (landmark) → cluster (2–12 slots, ≥2 types) → action (V2's flat
`groupId` promoted to a real group) — and every slot belongs to exactly one group. Global merge is CERTAIN-only: same
header/footer landmark + identical target shape + identical value/href/asset + present on ≥2 pooled pages. Anything
merely LIKELY (same value elsewhere) is reported (`likelyGlobal`: rosee 234, channel 115) rather than merged — a wrong
merge was judged worse than two separate local slots.

## Repeaters

Detected structurally (≥3 element children, tag+class+attribute-name+shape fingerprint, `.wr-stNNNNNN` computed-style
classes excluded from the fingerprint on purpose — including them collapsed real repeaters down to a handful).
Prototype = the dominant-fingerprint item with the most bindings. Desktop/mobile pairing requires identical item count
and identical ordered per-item value sequence; otherwise two honest repeaters are kept. **Node identity**: clones keep
the prototype's `n`/`data-wr-node` (evidence: generated stylesheet addresses 10,282 attribute occurrences via
`[data-wr-node="…"]::before/::after`; rewriting `n` would silently drop pseudo-element paint on every clone) — runtime
item identity instead lives on `data-wr-item`/`data-wr-repeater`, added only when a repeater is actually driven.
Growth policy (`fixed|bounded|flow|stack`) is inferred conservatively from CSS (grid/flex rules); `verifiedCapacity`
is only ever set when a capacity limit was actually exercised. Counts: rosee 198 repeaters / 1,421 items / 400 field
slots; channel 150 repeaters / 623 items / 318 field slots. Nested repeaters are both kept as definitions, but only one
level of a nested pair can be driven per render (`REPEATER_NESTED_SKIPPED`).

## Theme

Extraction clusters exact normalized values over `.wr-stNNNNNN`/`.wr-doc-stNNNNNN` rules into tokens (color,
font-family, radius, shadow, spacing) with a `risk: safe|guarded|locked` field; `locked` is never assigned in V1.
Compilation emits direct CSS rule overrides (no custom properties, no `!important`) appended after the copied
`generated-styles.css`, mirroring the Task 20 overlay pattern. A theme pack equal to the defaults compiles to the empty
string (0 bytes on both sites, byte-identical stylesheets proven). Counts: rosee 90 tokens (66 safe / 24 guarded);
channel 101 tokens (83 safe / 18 guarded).

## Content Packs

Three packs per site, all deterministic (regeneration → byte-identical):
- **default.json** — source values, the neutral baseline.
- **mechanical.json** — every slot rewritten to a mechanical marker (`M<base36>·<chars>` text, local base64 SVG media,
  rewritten tel/mailto/urls) proving 100% surface coverage; paired with `mechanical.expectations.json` for exact
  verification against a render.
- **realistic.json** — an authored fixture corpus (brand identity + role pools + per-route overrides) producing a
  coherent different site with **zero source-identity leakage**.

## Default neutrality

`render:template --assert-neutral` with the default content pack + default theme pack produces **0 tree changes, 0
route-map changes, 0 CSS overrides** on both sites; the rendered `reconstruction-data/` tree is byte-identical to the
source reconstruction app (`diff -rq` clean) and `generated-styles.css` is untouched. Proven repeatedly across every
phase (B, C, D, E1-post-fix, and the final e2e run's default-variant renders).

## New-content viability

The realistic pack drives repeaters (add/remove/reorder on validation-route repeaters after the correction cycle),
mutates the theme (visible repaint on 6/6 measurements), and injects new page titles/text/media with **0 applied-
binding failures** and **0 introduced duplicate DOM ids** on either site. Independent grep + digit-normalized checks
confirm 0 source-brand or source-phone strings survive in the realistic render.

## Coverage

| site | eligible | slotted | classified-unslotted | unexplained |
| --- | ---: | ---: | ---: | ---: |
| rosee | 9,388 | 9,366 | 22 (infrastructure: iframe titles) | 0 |
| channel | 4,644 | 4,519 | 125 (83+20+10 aria-hidden, 12 infrastructure) | 0 |
| **combined** | **14,032** | **13,885** | **147** | **0** |

## Leakage audit

Default pack is REPORT_ONLY (it is the source, by definition: 879/2398 leaks rosee/channel). Mechanical pack is
REPORT_ONLY by design (its markers deliberately retain source path fragments: 29/45 leaks). **Realistic pack: 0 leaks
on both sites — PASS** (`sourceLeakageRealistic` gate). Unslottable leaks (surfaces no slot addresses: iframe title,
route-map/package.json/generated-config provenance) are listed with fixes, not gated: rosee 9, channel 16.

## Final CLI

`pnpm slotize`, `pnpm render:template`, `pnpm template:theme`, `pnpm template:preview`, `pnpm template:packs`,
`pnpm template:audit`, `pnpm task29:e2e` — see `00-implementation-summary.md` for the full args/output table.

## Known limitations

See `00-implementation-summary.md` "Known limitations" for the full list: `number` type unused, no rich-text,
metadata title-only, srcset-stripping band-aid, iframe title unslottable, provenance files carry source host,
page-scoped repeaters not merged globally, nested repeaters driven one-level-only per render, `likelyGlobal` backlog
(234/115), quantitative text intentionally kept in the realistic corpus, and 12-hex ids not hard-failed on collision.

## Human review path

`docs/result/29-slotized-template/human-review/index.html` — 12 images (2 templates × up to 2 routes × 2 widths ×
DEFAULT/NEW: rosee /17 + /34 and channel /kr/pricing, at 390/1440, default vs new render).

## Final verdict

READY FOR SLOTIZED TEMPLATE HUMAN ACCEPTANCE

(`humanAcceptanceRequired: true` — see `docs/result/handoffs/29-slotized-template-final.json`.)

## Model-routing note

Sub-agent model routing was Sonnet for Phases A (recon) and F (this report), Opus for Phases B/C/D/E1/E2/E1-fix (core
engine, repeaters, theme, audits/packs, e2e harness, and the one correction) — the Agent mechanism honoured the
requested model selection throughout.
