# Task 29 FAST — Implementation Summary

Slotized Recon Template V1: Accepted Reconstruction → Slot V2 → **new** slotized layer (`src/slotized-template/`) that
adds Bindings/Groups/Repeaters/Theme on top, so `TEMPLATE + CONTENT PACK (+ THEME PACK) = RENDERED SITE`. Reconstruction
V1 stayed closed — nothing under `src/reconstruction*`, `src/observer*`, `src/sitespec*` was edited by Task 29 (see
`02-final.md` "Reconstruction V1 remained closed" for the git-status caveat).

## Reused legacy code

| From | What was reused |
| --- | --- |
| `src/recon-template/` (Task 18/19.1, "Slot V2") | Surface discovery input — every Task 29 slotize run loads a Slot V2 manifest (`slots.json`/`slot-bindings.json`/`default-content.json`) as its starting slot/binding set and extends it with new surfaces (background-image, video, title/aria-label/placeholder, route-map page title). |
| `src/recon-template/parity-qa.ts` | `buildApp`/`startApp` reused as-is by `template:preview` and by `scripts/task29-e2e.ts` to build+serve rendered app copies — no new server was written. |
| `src/theme/` (Task 20) | Overlay mechanism (CSS custom properties/direct rules appended AFTER the copied `generated-styles.css`, cascade wins, no `!important`) reused as the model for `theme-css.ts`'s direct-rule compiler; `isSafeThemeValue`, `parseColor`, `parseBorderShorthand`, `colorChroma` imported directly (module itself untouched). |
| `src/content-injection/` (Task 19) | `brand-leak.ts`/`brand-surfaces.ts` patterns reused/extended for the Task 29 source-leakage audit; `accounting.ts`'s "sibling artifact, never folded in" pattern reused for `coverage.json`/`audits/*.json`. |
| CSS parser | New `src/slotized-template/css.ts` (`forEachRule`, `declarationValue`, `firstUrl`, `replaceFirstUrl`) written fresh for this task but follows the same flat-brace-regex parsing style already used to handle the ~8MB `generated-styles.css` files. |

## New architecture — module map

`src/slotized-template/` (schemaName `slotized-template-v1`), one line per file:

| File | Responsibility |
| --- | --- |
| `types.ts` | Zod `.strict()` schemas: SlotType/SlotScope/SlotDefinition/Binding/GroupDefinition/RepeaterDefinition/ContentPack/warning-code unions. |
| `ids.ts` | Deterministic hash ids: `slotIdOf`/`bindingIdOf`/`groupIdOf`/`repeaterIdOf`/`itemIdOf`/`tokenIdOf` (prefix + 12-hex). |
| `store.ts` | Run-dir layout/paths under `data/<host>/slotized-templates/<run-id>/`. |
| `load-input.ts` | Loads a Slot V2 manifest + follows `manifest.source` to the REC app dir and SPEC dir. |
| `tree.ts` | RuntimePage/RuntimeElementNode tree walking, node indexing, in-place mutation helpers. |
| `css.ts` | Flat-brace CSS rule parser/writer for `generated-styles.css`. |
| `surfaces.ts` | New-surface discovery beyond Slot V2 (background-image, video/audio/source/picture, title/aria-label/placeholder, route-map title). |
| `preslot.ts` | Pre-slot candidate assembly (Slot V2 slots + new surfaces) before merge/group passes. |
| `globals.ts` | CERTAIN global merge (header/footer landmark + identical value/shape, ≥2 pages); LIKELY stays local → `likelyGlobal`. |
| `groups.ts` | Group derivation: page → section(landmark) → cluster(2–12 slots, ≥2 types) → action (V2 `groupId`). |
| `coverage.ts` | Eligible-vs-slotted accounting per surface class + explicit unslotted classification. |
| `authoring.ts` | Nested pages→groups→slots projection (`authoring.json`, not source of truth). |
| `repeaters.ts` | Repeater detection: fingerprinting, prototype selection, desktop/mobile pairing, growth-policy inference from CSS. |
| `repeaters-apply.ts` | Repeater render engine: clone/inject prototype, id namespacing, duplicate-id census. |
| `theme-types.ts` | `ThemeTokenDefinition` schema (kind/value/risk/targets). |
| `theme-extract.ts` | Token extraction from `.wr-stNNNNNN`/`.wr-doc-stNNNNNN` rules (exact-value clustering, thresholds/caps, risk classification). |
| `theme-css.ts` | Theme pack → direct CSS rule overrides (no custom properties, no `!important`). |
| `theme-pack.ts` | `extractAndWriteTheme`, default/mutated ThemePack I/O, `themePackToExtraCss`. |
| `packs.ts` | Mechanical/realistic ContentPack generators + expectations file. |
| `audit.ts` | Slot-completeness, hardcoded-content, source-leakage, duplicate-id, content-pack-validation, artifact-completeness audits. |
| `slotize.ts` | Orchestrates preslot→globals→groups→coverage→repeaters→theme→pack write into a run dir. |
| `apply.ts` | expectedValue-guarded tree mutation (binding application). |
| `render.ts` | `renderTemplate()`: app copy + rewritten pages + repeater hook + theme CSS append + `render-report.json`. |
| `index.ts` | Barrel export for all of the above. |
| `src/cli-slotize.ts` | `pnpm slotize` |
| `src/cli-render-template.ts` | `pnpm render:template` |
| `src/cli-template-theme.ts` | `pnpm template:theme` |
| `src/cli-template-preview.ts` | `pnpm template:preview` |
| `src/cli-template-packs.ts` | `pnpm template:packs` |
| `src/cli-template-audit.ts` | `pnpm template:audit` |
| `scripts/task29-e2e.ts` | `pnpm task29:e2e` — the one final-validation invocation |

Total new/changed TS across the module + CLIs + e2e script: **11,757 lines** (`wc -l` over `src/slotized-template/*.ts src/cli-slotize.ts src/cli-render-template.ts src/cli-template-*.ts scripts/task29-e2e.ts`).

## Schema

- **SlotType**: `text|rich-text|number|boolean|url|email|phone|image|video|icon|structured`. `number` exists in the
  schema but is **never inferred** by slotize (a numeric round-trip like `80.2`→`"80.20"` cannot be proven neutral).
- **Binding**: `{ id, slotId, pageId, nodeId?, variant?: mobile|desktop, target: textContent|innerHTML|attribute|style|metadata, property?, field?, address:{surface: static|dynamic-template|paint-twin|svg-text|css-rule|route-map, discoveryId?, templateNodeId?, childIndex?, svgTextIndex?, cssSelector?, metadataKey?}, expectedValue?, transform?, condition? }`.
  Deviation from the frozen contract sketch: `nodeId`/`variant` are **optional** — route-map metadata bindings (page
  title) address no DOM node, so making one up would be dishonest.
- **GroupDefinition**: `{ id, key, label?, pageId?, rootNodeId?, slotIds, childGroupIds, repeaterIds?, patternHint? }` —
  hierarchy page → section → cluster → action; every slot belongs to exactly one group (page group is the fallback).
- **RepeaterDefinition**: `{ id, itemPrototype:{protoNodeId, variantPrototypes}, itemSlots, defaultItems, operations, growthPolicy: fixed|bounded|flow|stack, minItems/maxItems, verifiedCapacity, layoutPolicy, variants, paired }`.
  **Node-identity decision (deviates from the contract's `repId:itemId:protoNodeId` sketch)**: cloned items **keep the
  prototype's `n`/`data-wr-node`**, evidence: `generated-styles.css` addresses nodes via
  `[data-wr-node="nNNNNNN"]::before/::after` (10,282 attribute occurrences measured on rosee) and `InteractionRuntime`
  resolves hosts by that same attribute — rewriting `n` on clones would silently drop every pseudo-element/interaction a
  cloned card paints. React keys are child indexes so duplicate `n` is DOM-safe. Runtime item identity instead lives on
  the item root as `data-wr-item` + `data-wr-repeater`, added only when a repeater is actually driven (keeps the default
  render neutral). A post-render duplicate-DOM-`id` census (baseline vs introduced) is the real safety net; introduced
  duplicates were 0/0 on every render measured.
- **Theme**: `ThemeTokenDefinition{ id: tok_*, key, kind: color|font|radius|shadow|spacing, value, risk: safe|guarded|locked, targets:[{cssSelector, property, mediaCondition?}] }`.
  Extraction = exact-normalized-value clustering over `.wr-stNNNNNN`/`.wr-doc-stNNNNNN` rules only; properties limited to
  color/background/border-*-color/outline-color/text-decoration-color, font-family, border-radius, box-shadow, and
  spacing (padding/margin/gap, guarded, ≥10 declarations) — **never** display/grid/position/width/height/transform/
  z-index/font-size/line-height. Risk: `guarded` = spacing, composite radius, border-color-only, or any color painting
  ≥40% of all colored declarations (blast radius); everything else `safe`; `locked` is never assigned in V1 (compiler
  refuses a locked token if one ever appears). Compile = direct CSS rule overrides appended after the copied stylesheet
  (no custom properties, no `!important`); a pack equal to defaults compiles to 0 bytes (proven on both sites).
- **Content Pack**: `ContentPack{ schemaVersion, templateId, templateVersion, slots: Record<slotId,SlotValue>, repeaters: Record<repId,{items:[{id, values:Record<fieldSlotId,SlotValue>}]}> }`. Three packs shipped per site:
  `default.json` (= source values, neutral), `mechanical.json` (mechanical markers, 100% surface coverage proof +
  `mechanical.expectations.json`), `realistic.json` (authored fixture corpus, zero source leakage).
- **Theme Pack**: `ThemePack{ schemaVersion, templateId, templateVersion, tokens: Record<tokenId,value> }`, compiled via
  `theme-css.ts`/`template:theme --compile` into an `extraCss` string consumed by `render:template --theme`.

## CLI table

| Command | Args | Output |
| --- | --- | --- |
| `pnpm slotize` | `<recon-template manifest.json> [--run-id id]` | `data/<host>/slotized-templates/<run-id>/{manifest,slots,bindings,groups,repeaters,theme,coverage,authoring}.json` + `content-packs/default.json` + `theme-packs/default.json` + `template/` |
| `pnpm render:template` | `--template <manifest.json> --content <pack.json> [--theme <theme pack>] [--out dir] [--assert-neutral]` | Full app copy (app/src/public/next.config.mjs/package.json/tsconfig.json, no `.next`) with rewritten `reconstruction-data/pages/*.json` + `route-map.json` + appended overlay CSS + `render-report.json` |
| `pnpm template:theme` | `<manifest.json> [--compile <theme-pack.json> --out <compiled.json>]` | `theme.json` + `theme-packs/default.json` + `theme-report.json`, or a compiled `{css,applied,declarations,rules,errors,warnings}` file |
| `pnpm template:preview` | `<out dir or its manifest.json> [--force-build] [--no-build]` | `next build` + `next start` on a free port via `parity-qa`, prints URL + routes |
| `pnpm template:packs` | `<manifest.json> [--verify-expectations <render dir>]` | `content-packs/{mechanical,mechanical.expectations,realistic}.json`, `theme-packs/mutated.json`, or a verification report |
| `pnpm template:audit` | `<manifest.json> [--render <dir> --skip-static]` | `audits/{slot-completeness,hardcoded-content,theme-coverage,content-pack-validation,artifact-completeness,summary}.json` + `{source-leakage,duplicate-ids,fit-warnings}.<label>.json` |
| `pnpm task29:e2e` | `[--sites rosee,channel] [--only default\|new] [--skip-build] [--strict-overflow] [--rosee-run/--channel-run] [--out] [--review-out] [--work]` | `docs/result/29-slotized-template/e2e/{task29-e2e-report.json,task29-e2e-summary.md,screenshots/}` + `docs/result/29-slotized-template/human-review/{index.html,images/}` |

## Known limitations

From both sites' `manifest.json` `limitations[]` plus handoff RISKS:

- `number` SlotType exists in the schema but is never inferred (unprovable round-trip neutrality).
- No rich-text/`innerHTML` slots in V1 — every text occurrence is a leaf text-run binding.
- Page metadata coverage is title-only — the reconstruction app renders no `description`/`og:*` tags, so those slots would bind to nothing.
- `srcset` stripping (`stripStaleSrcsets` in `render.ts`) is a render-time band-aid for 32 (page,variant,node) `<img>` on channel.io whose `src` is bound but `srcset` is not; the root fix (emit srcset bindings in slotize) was not done — inputs were frozen.
- `<iframe title>` is classified infrastructure/embed and is not slotted (10 occurrences on channel, e.g. "Channel chat" — will still read as source text in a NEW render).
- Three provenance surfaces per site carry the source host and are not slotted: `reconstruction-data/route-map.json` (`rootUrl` + per-route `url`), `package.json` `name: wr-clone-<host>`, `src/generated/generated-config.ts` `SOURCE_ROOT_URL` — needs a future "site identity" input applied at render/bake.
- Repeaters are page-scoped; the same nav/footer list on N pages is N separate repeaters (no global repeater merge in V1) — rosee 198 / channel 150 repeaters reflect this.
- Nested repeaters are both kept as definitions, but at render only one of a nested pair can be driven per render (the inner is skipped with `REPEATER_NESTED_SKIPPED`); rosee has 1 nested pair (p000006, both variants), channel has 3 pages affected (p000001 ×3, p000003 ×11, p000005 ×3, both variants each).
- `likelyGlobal` backlog of same-value-outside-header/footer slots not auto-merged: rosee 234, channel 115 — reported, not merged (wrong merge judged worse than two slots).
- The realistic content corpus intentionally keeps pure-quantitative text (prices/ranges/units, no identity) unchanged — new sites reuse the source's numbers, not its identity; a corpus-rule change, not an engine change.
- Slot/binding/group/repeater/token ids are 12-hex (~48 bits); collisions are detected and reported (0 measured on both sites) but a later duplicate is dropped, not a hard failure.

Relevant files: `src/slotized-template/` (module), `src/cli-slotize.ts`, `src/cli-render-template.ts`,
`src/cli-template-theme.ts`, `src/cli-template-preview.ts`, `src/cli-template-packs.ts`, `src/cli-template-audit.ts`,
`scripts/task29-e2e.ts`, `package.json` (scripts `slotize`, `render:template`, `template:theme`, `template:preview`,
`template:packs`, `template:audit`, `task29:e2e`).
