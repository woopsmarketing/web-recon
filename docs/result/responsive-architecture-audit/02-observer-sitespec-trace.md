# 02 — Responsive data flow, first half: Public source → Observer → SiteSpec

Scope: READ-ONLY code trace. PUBLIC SOURCE (stylesheet `<link>`, `<style>`, CSS-in-JS runtime rules, inline `style`, JS-computed style) → OBSERVER (`src/observer/*`, `src/multi-observer/*`) → AUTHORED / COMPUTED STYLE CAPTURE → SITE SPEC (`src/sitespec/*`). Stops at the SiteSpec boundary; the fields reconstruction reads are listed in §5.

Method: `grep -a -n` everywhere (NUL-byte files), direct reads of the files named below, and two read-only helper scripts run against a real apartmentary.com run:
- `tmp/wr-resp-audit/code-trace/obs-counts.mjs` → `tmp/wr-resp-audit/code-trace/apartmentary-counts.json`
- `tmp/wr-resp-audit/code-trace/html-media.mjs`

No file in `src/`, `data/` or git state was modified.

---

## 1. Stage-by-stage flow

### Stage 0 — Public source (what the browser has)

| Source channel | Reaches the CSSOM? | Reaches `page.content()` (rendered.html)? |
|---|---|---|
| `<link rel=stylesheet>` same-origin / CORS-enabled | yes, `cssRules` readable | `<link href>` tag only, no CSS text |
| `<link rel=stylesheet>` cross-origin without CORS | `cssRules` throws SecurityError | `<link href>` tag only |
| `<style>` with text | yes | yes (full text) |
| CSS-in-JS "speedy" (`insertRule`: Emotion prod, styled-components prod) | yes (rules present in `document.styleSheets`) | **tag present, textContent EMPTY** |
| `document.adoptedStyleSheets` (constructable sheets) | not in `document.styleSheets` | no |
| Inline `style=""` attribute | no (not a sheet) | yes (as attribute) |
| JS-set `el.style.*` | no | yes (serialized into `style` attribute) |
| Resolved result of everything | `getComputedStyle` | — |

### Stage 1 — Observer page load and stylesheet body capture (Node side)

WHAT EXISTS
- `captureStylesheetBodies(page)` — `src/observer/observe-page.ts:434-516`. A `page.on("response")` listener that keeps the body of every `resourceType === "stylesheet"` response (`:452`), skips 3xx (`:461-464`), keys the body by response URL, request URL and every pre-redirect URL (`:475-505`, `redirectChainUrls` `:399-432`). Caps: `MAX_STYLESHEET_BYTES` 2 MB per sheet, `MAX_STYLESHEET_CAPTURE_BYTES` 8 MB total (`src/observer/types.ts:833-835`); refused bodies counted (`:489-496`).
- Installed before navigation: `observe-page.ts:1276`.
- `listBlockedSheetHrefsInBrowser()` — `observe-page.ts:518-535`: asks the page which `document.styleSheets[i].cssRules` throw.
- `buildExtraSheets()` — `observe-page.ts:682-709`: only for blocked hrefs, takes the captured body and textually inlines `@import`s (`expandStylesheetImports` `:619-675`), wrapping conditions back as `@media` / `@supports` / `@layer` (`:657-671`).
- Handed to the collector as `extraSheets` — `observe-page.ts:1346-1359`.

PRESERVED: blocked-sheet text, in memory only, for the duration of one collect call.
TRANSFORMED: `@import` inlined into conditional wrappers.
DISCARDED: **stylesheet bodies are never written to disk** (store.ts writes only `rendered.html, dom.json, styles.json, assets.json, links.json, frames.json, screenshot.png` — `src/observer/store.ts:184-190`). No **direct HTTP fetch** exists: if Chromium did not hand over a body (cache hit with no body, service worker, `no-store`, aborted), there is no second request — the sheet is `fallbackMissed`. `bytesBridged` / coverage counts are persisted, text is not.

### Stage 2 — In-page collection (`collectPageInBrowser`, `src/observer/collect-dom.ts:589`)

Config wired at `observe-page.ts:170-201` (`COLLECT_CONFIG`).

**2a. Sheet resolution** — `collect-dom.ts:841-895`
- Iterates `document.styleSheets` only (`:843`). Reads `sheet.media` (CORS-independent) via `readSheetMedia` (`:796-823`), classifying `all`/`screen` as trivial (`:762-778`).
- `sheet.cssRules` in try/catch (`:864-868`) — this IS the SecurityError handling. On throw: `extraSheetCss[href]` → `parseRecovered()` = `new CSSStyleSheet().replaceSync(text)` never adopted (`:722-730`, `:874-893`). Recovered rules carry `origin:"fetched"`.
- `document.adoptedStyleSheets` is **not** walked here (only in the custom-property harvest, `:2185-2200`). Shadow-root sheets are not walked.

**2b. Layout-rule index** — `collect-dom.ts:897-1277`
- Active only when `layoutRuleProperties` is non-empty (`:897-902`) = `LAYOUT_RULE_PROPERTIES` (`src/observer/types.ts:703-766`, 63 properties: width/min/max, height/min/max, margin(+longhands, inline), padding(+longhands, `padding-inline`), display, position, top/right/bottom/left/inset, flex family, grid-template-*/auto-*/column/row/area, gap family, justify/align/place-*, overflow*, transform, translate, aspect-ratio, box-sizing).
- **NOT in the whitelist**: `font-size`, `line-height`, `letter-spacing`, `text-align`, `border*`, `border-radius`, `background*`, `color`, `opacity`, `visibility`, `float`, `clear`, `order`, `z-index`, `object-fit`, `object-position`, `columns`, `container-type`/`container-name`, `padding-inline-start/end`, `margin-block*`, `inset-inline*`, `scale`, `rotate`, `white-space`, custom properties (`--*`). Any authored responsive value on these is never read from a sheet.
- `record()` (`:1042-1072`): for each whitelisted property `style.getPropertyValue(property)` — i.e. the **CSSOM-serialized specified value**, not raw source text (e.g. `margin: 0 auto` is stored as `"0px auto"` — confirmed on apartmentary, `.swiper-container`). Values > 200 chars dropped (`LAYOUT_RULE_VALUE_MAX_LEN`, `types.ts:816`); selectors truncated at 200 (`:1060-1064`). Rules with zero whitelisted declarations are not indexed at all.
- Shorthand + longhand both read: `margin` AND `margin-top/right/bottom/left` each become a declaration (CSSOM expands). Consequence: a shorthand using `var()` returns the `var()` string for the shorthand and `""` for its longhands (pending-substitution), so only the shorthand row survives.
- `visit()` (`:1074-1244`) discriminates by `constructor.name` (`:1096`):
  - `CSSImportRule` (`:1101-1151`) follows `rule.styleSheet.cssRules`, falls back to `extraSheetCss[absolute]`, unresolved counted (`:1148`).
  - Style rule + CSS nesting (`:1154-1166`, `nestSelector` `:1014-1029`); `CSSNestedDeclarations` (`:1170-1179`).
  - `CSSMediaRule` (`:1185-1201`): `conditionText` → `joinMedia` (comma-distributive, `:984-1005`) → ctx.media; **tallied** in `authoredMediaTally` (`:1197`, `tallyAuthoredMedia` `:689-704`, cap 300 `types.ts:812`).
  - `CSSSupportsRule` (`:1202-1209`) → ctx.supports (`joinAnd`).
  - `CSSContainerRule` (`:1210-1222`) → ctx.container = `containerName + " " + containerQuery`.
  - `CSSLayerBlockRule` (`:1223-1228`) → ctx.layer.
  - keyframes / font-feature / palette / counter-style skipped as non-matching (`:1229-1236`); anything else (`@scope`, `@starting-style`) skipped and counted `groupingRulesSkipped` (`:1237-1242`).
  - Sheet-level media seeds root ctx and is tallied (`:1246-1258`).
- Index cap `MAX_LAYOUT_RULES` 6000 (`types.ts:781`), `ruleIndexCapHit`.
- Tally emitted sorted into `coverage.authoredMediaConditions` (`:1263-1276`).

**2c. Per-element matching** — `collectMatchedLayoutRules` `collect-dom.ts:1280-1317`, attached in the walk at `:1795-1802`.
- `el.matches(entry.matchSelector)` — selector matching only; the `@media`/`@supports`/`@container` condition is **not** evaluated, so declarations for OTHER widths are recorded too (this is what makes the channel responsive evidence).
- Per-element cap `MAX_MATCHED_RULES_PER_ELEMENT` = 32 (`types.ts:800`), iterated in SHEET ORDER with `break` (`:1287-1301`): when it bites it drops the LATEST sheets = cascade winners (for CSS-in-JS apps the inserted component rules come after the globals).
- Recorded per declaration: `property, value, media?, supports?, container?, layer?, origin?, selector, important?` (`RawElement.matchedLayoutRules` `:169-181`). **No specificity, no sheet index, no source order index, no sheet href** — cascade must be re-derived from array order.

**2d. Computed style** — `collect-dom.ts:1711-1733`
- `getComputedStyle(el)` per element, `collectStyles(cs, STYLE_WHITELIST)` (`:1347-1357`), whitelist `types.ts:516-687` (~120 properties). Pseudo-elements with `PSEUDO_STYLE_WHITELIST` (`:1855`, `:1863`).
- `getBoundingClientRect` → `boundingBox` (`:1722-1731`).
- Per `types.ts:505-515`: "We store the browser's *final computed* value, not the source stylesheet."
- This is the px-flattening point: `getComputedStyle` returns **resolved values** — `width`/`height`/`top`/`left`/`margin-*`/`padding-*` are px for rendered boxes; `max-width`/`min-width`/`flex-basis`/`grid-template-columns` keep their computed form (`%` stays `%`, `repeat()` is expanded to px track lists for grid containers). Apartmentary `p000005/e000074`: authored `max-width:50%; flex-basis:50%` @ `(min-width:1200px)` → computed `width:95.5px, max-width:50%, flex-basis:50%`.

**2e. Attributes** — `collectAttributes` `collect-dom.ts:1322-1345`
- Keeps `ATTR_WHITELIST` (`types.ts:477-503`, includes **`class`** at `:479`, does **not** include `style`) plus **every `aria-*` and every `data-*`** (`:1327-1330`). Values truncated at `ATTR_MAX_LEN` 500 (`types.ts:297`). Password/hidden `value` skipped.
- Inline `style` attribute is therefore NOT in `dom.json`; it only survives inside `rendered.html`.

**2f. Custom properties** — `collect-dom.ts:2062-2240`
- Names discovered only from **root-level** (`:root`/`html`) rules in `document.styleSheets` + `adoptedStyleSheets` (`:2185-2200`) + `var(--x)` references in inline SVG markup. Values read from `getComputedStyle(documentElement)` — i.e. RESOLVED for this viewport, the `@media` alternative that did not apply is lost. Element-scoped custom properties (`.card{--gap:…}`) are not harvested.

**2g. Things skipped by the walk**: `SKIP_TAGS` = SCRIPT, STYLE, NOSCRIPT, TEMPLATE, HEAD, META, LINK, TITLE, BASE (`types.ts:460-470`) — so no `<link>`/`<style>` element is ever an element record; stylesheet URLs are not assets either (`collect-assets.ts` asset types: image, image-srcset, picture-source, source, video, video-poster, audio, background-image, mask-image, inline-svg, icon, font — `:134-246`). The only persisted sheet href is `fontUrls[].sheetHref` for `@font-face`.

**2h. Node-side dedupe** — `src/observer/dedupe-styles.ts:123-226`
- Computed style maps interned into `styles.json` (`:129-139`); `raw.matchedLayoutRules` → `ElementObservation.layoutRules` verbatim (`:206-207`); `class`/`data-*` attributes carried verbatim (`:194`).
- Schema: `ElementObservation.layoutRules` `types.ts:1422-1423`; `MatchedLayoutRuleSchema` `types.ts:1024-1098`; `StylesheetCoverageSchema` `types.ts:1113+` (with `authoredMediaConditions` `:1352`); viewport `customProperties` `:2649`, `stylesheetCoverage` `:2657`.
- Persisted: `observation.json` (viewport block incl. `stylesheetCoverage`, `customProperties` — `store.ts:242-249`), `dom.json`, `styles.json`, `rendered.html` (`page.content()` at `observe-page.ts:1421`).

### Stage 3 — Probe-width derivation and multi-width layout probe

**Floors**: `LAYOUT_PROBE_WIDTHS = [390,700,768,1024,1100,1440,1920]` (`types.ts:2749-2751`); `MOBILE_LAYOUT_PROBE_WIDTHS = [390,480,700,768,914]` (`types.ts:2779-2781`). Cap `MAX_PROBE_WIDTHS_TOTAL = 16` (`:2825`), `MIN_GUARANTEED_FLOOR_WIDTHS = 3` (`:2852`), `MAX_ENVELOPE_EXTENSION_BRACKETS = 2` (`:2881`), `MAX_EXTRA_PROBE_WIDTHS = 8`, range 200..4096 (`:2888-2891`).

**Derivation** — `deriveFor` `observe-page.ts:1724-1786` → `deriveProbeWidths` `src/observer/probe-widths.ts:270-610`:
- Input = `stylesheetCoverage.authoredMediaConditions` of this viewport (+ desktop's for the mobile pass, `crossContextConditions`, `:295-298`) — i.e. the page's FULL `@media` tally, not just matched declarations.
- Parsed with the SiteSpec parser `parseMediaCondition` + `foldMediaBreakpoints` (imported from `src/sitespec/media-condition.ts`, `probe-widths.ts:94-99`, used `:300-312`) → whole-pixel `min`/`max` breakpoints → brackets `below/above` (`:317-338`).
- `requiredWidths` (the viewport's own truth width) join the guaranteed core (`:276-278`, `:424`, `:441-443`); desktop caller passes `[desktop.profile.width]` (`observe-page.ts:1824-1826`), mobile `[mobileProfile.width]` (`:1876`).
- Envelope extension for mobile only (`probe-widths.ts:363-413`, caller `observe-page.ts:1880-1884`).
- Adoption loop with eviction of non-guaranteed floor widths (`probe-widths.ts:469-524`); refused brackets itemised (`:453-467`); degraded reasons (`:554-582`).
- Operator extras: `probeExtraWidths` / `mobileProbeExtraWidths` (`observe-page.ts:244-252`, `:1835`, `:1899`; multi-observer passthrough `src/multi-observer/observe-selected-pages.ts:98-102`, `:353-357`; manifest records floor+extras only `:554-561`).

**Probe capture** — `probeLayout` `src/observer/layout-probe.ts:977+`, `measureInBrowser` `:752-804`:
- One load, park elements, `setViewportSize` per width, measure `x`, `w` (width), `v` (visible 0/1), `disconnected`, `documentWidth`, DOM-family fingerprint (`LayoutProbeWidthSchema` `types.ts:2973-2992`).
- **No height, no y, no computed style, no authored rules per width.** `widthProvenance` persisted (`types.ts:3316`).
- The MutationObserver with `attributeFilter:["class","style"]` at `layout-probe.ts:135-145` is the scroll-reveal candidate census, not a style capture.

### Stage 4 — SiteSpec compile

**Inputs** — `compilePage` `src/sitespec/compile-page.ts:476-736`: reads `observation.json`, `dom.json`, `styles.json`, `assets.json`, `frames.json`, `rendered.html` (`:542-563`), `layout-probe.json` / `layout-probe-mobile.json` (`:493-531`), per-viewport `customProperties` (`:581-583`). **`stylesheetCoverage` (incl. the page-wide `authoredMediaConditions` tally) is NOT read** — `grep -a -n "stylesheetCoverage\|authoredMediaConditions" src/sitespec/*.ts` → 0 hits; apartmentary SiteSpec viewports have no such key.

**Per-element node** — `compileViewport` `src/sitespec/compile-viewport.ts:191-338`:
- Attributes via `compileAttributes` (`src/sitespec/safe-attributes.ts:114-232`):
  - `id` → `sourceHtmlId` (`:131`, `:214-226`)
  - **every `data-*` dropped** (`:132`)
  - **`class` and `style` dropped** (`:134`) — rationale `:22-26`
  - `src/srcset/sizes/poster` → asset refs (`:135-137`)
  - kept: `aria-*`, `SAFE_ATTRIBUTES` (`src/sitespec/types.ts:377-397`: role, alt, title, href, target, rel, name, type, placeholder, value, for, lang, dir, tabindex, width, height, loading, controls, draggable) and `SUPPLEMENTAL_ATTRIBUTES` from aligned `rendered.html` (denylist incl. `class`, `style`, `data-` — `types.ts:~511-545`).
- Computed style → `styleTokenId` via `StyleCatalogBuilder.intern` (`compile-viewport.ts:211-218`; `src/sitespec/style-catalog.ts:55-81`) — exact equality dedupe, values untouched.
- **`authoredLayout: source.layoutRules` VERBATIM** + `authoredLayoutTruncated` (`compile-viewport.ts:302-304`; schema `src/sitespec/types.ts:731-732`). This is the ONLY place authored text crosses into SiteSpec. Note that the `selector` field keeps source class tokens (`.css-rsjln6`, `.swiper-container`): class names are dropped as attributes but survive as selector provenance.
- `boundingBox`, `scrollState` verbatim (`:298-301`).
- Probe arrays attached as `node.probe = {x,w,v}` per aligned pair (`compile-page.ts:423-435`), desktop and mobile trees separately (`:597-694`).

**Viewport** — `compile-viewport.ts:473-519`:
- `authoredBreakpoints = computeAuthoredBreakpoints(elementNodes)` (`:473-475`, `src/sitespec/authored-breakpoints.ts:118-270`).
- `customProperties` carried verbatim (`:515`).

**Site** — `src/sitespec/compile-site.ts:428-438`: `responsiveModel = { mode:"observed-endpoints", inferredBreakpoints: [], limitations:["breakpoints-not-inferred", …] }` — hardcoded; no site-level breakpoint.

---

## 2. Keyword index (file:line)

| Keyword | Occurrences / meaning |
|---|---|
| `authoredLayout` | SiteSpec node field: `src/sitespec/compile-viewport.ts:303-304` (write), `src/sitespec/types.ts:731-732` (schema), `src/sitespec/authored-breakpoints.ts:76-77,143-144` (read); comments `src/observer/observe-page.ts:314`, `src/observer/types.ts:823`. Observer-side name is `layoutRules` (`types.ts:1422`, `dedupe-styles.ts:206`). Consumer: `src/reconstruction/layout-inference.ts`. |
| `authoredInlineSize` | NOT in observer/sitespec. Only reconstruction: `src/reconstruction/layout-inference.ts:223,877,4945,6681`, `generate-app.ts:574`, `types.ts:1205,1213`. |
| CSSOM / `cssRules` / `styleSheets` | `collect-dom.ts:843-868` (sheet loop), `:726` (recovered), `:1083-1225` (visitor), `:2141-2197` (custom props), `observe-page.ts:518-535` (blocked list). |
| SecurityError handling | `collect-dom.ts:864-868` (catch → blocked), `:1111-1115` (@import sheet), `:2194-2199` (adopted); `observe-page.ts:524-529`. Never names `SecurityError`; generic `catch`. |
| Stylesheet harvesting | Response-body capture `observe-page.ts:434-516`; in-page parse `collect-dom.ts:722-730`; import expansion `observe-page.ts:619-675`. |
| Direct stylesheet fetch | **None.** Only passive `page.on("response")` + `response.text()` (`observe-page.ts:445,483`). No `fetch(`/`request.get` of an href in scope. |
| `@media` / `CSSMediaRule` | `collect-dom.ts:1185-1201` (ctx+tally), `:762-823` (sheet media), `:984-1005` (joinMedia); `observe-page.ts:657-658` (import wrap); schema `types.ts:1079`; parse `src/sitespec/media-condition.ts:926` (`parseMediaCondition`), `:1097` (`foldMediaBreakpoints`). |
| `@container` / `CSSContainerRule` | `collect-dom.ts:1210-1222`; schema `types.ts:1083`; excluded from breakpoints `authored-breakpoints.ts:163-167`. |
| `@supports` / `CSSSupportsRule` | `collect-dom.ts:1202-1209`; `observe-page.ts:660-665`; schema `types.ts:1081`; counted `authored-breakpoints.ts:153`. |
| `hiddenRanges` | **0 hits in `src/`** (grep -a -rn). Historical name in docs (`docs/result/28.5C-…:16,35,52,141` → `layout-inference.ts:661-684` at that time). Reconstruction-side, out of scope. |
| `fluid` | Observer only in comments `types.ts:2737-2741,2766`; code in `src/reconstruction/tree-switch.ts` (out of scope). |
| `unfreeze` | **0 hits in `src/`**. |
| Probe widths | `LAYOUT_PROBE_WIDTHS` `types.ts:2749`; `MOBILE_LAYOUT_PROBE_WIDTHS` `types.ts:2779`, used `observe-page.ts:1875`, `multi-observer/observe-selected-pages.ts:557`; `requiredWidths` `probe-widths.ts:144,276,424,441,605`, callers `observe-page.ts:1732,1765,1824-1826,1876`; `probeExtraWidths` `observe-page.ts:244,1835`, `multi-observer/observe-selected-pages.ts:98-102,353-354,554`; derive `probe-widths.ts:270`; eviction `probe-widths.ts:415-524` (`floorWidthsEvicted`, `breakpointsAdoptedByEviction`), `pickGuaranteedFloor` `:236-250`; `resolveProbeWidths` `layout-probe.ts:876,984`. |
| breakpoint | Observer: `probe-widths.ts` throughout, `ProbeWidthProvenanceSchema` `types.ts:3041-3226`. SiteSpec: `authored-breakpoints.ts`, `AuthoredBreakpointsSchema` `sitespec/types.ts:952+`, viewport field `sitespec/types.ts:1112`, `responsiveModel.inferredBreakpoints: []` `compile-site.ts:433`. |
| `V1_RESPONSIVE_POLICY` / product-policy | NOT in scope stages. `src/reconstruction/responsive-plan.ts:85,224,234-243`, `reconstruction/types.ts:388-412`. |
| class attribute | Observed `types.ts:479` + `collect-dom.ts:1326-1342`; dropped `safe-attributes.ts:134`; denylisted `sitespec/types.ts:511`; survives only inside `authoredLayout[].selector`. Also read (not stored) for overlay fingerprint `normalize-page-state.ts:304`. |
| data-* | Observed all `collect-dom.ts:1330`; dropped all `safe-attributes.ts:132`; supplemental denied prefix `sitespec/types.ts` (`SUPPLEMENTAL_DENIED_PREFIXES`). |
| var() / custom properties | Root harvest `collect-dom.ts:2062-2240`, schema `types.ts:2589-2600`, caps `types.ts:866-868`; SiteSpec verbatim `compile-viewport.ts:515`, `compile-page.ts:581-583`. `var()` inside a layout declaration value survives verbatim when the property is whitelisted and not a longhand of a `var()` shorthand. |

---

## 3. YES / PARTIAL / NO matrix

Legend: Obs = observer artifact; Spec = SiteSpec.

| # | Question | Obs | Spec | Evidence |
|---|---|---|---|---|
| 1 | Source stylesheet URL stored? | PARTIAL | NO | Only as `<link href>` inside `rendered.html` (`observe-page.ts:1421`, store `store.ts:184`) and `fontUrls[].sheetHref` (`collect-dom.ts:258`). Not an asset type (`collect-assets.ts:134-246`), not in `stylesheetCoverage`. SiteSpec does not carry `rendered.html` head or coverage. |
| 2 | Source stylesheet text/bytes stored? | NO (in-memory only) | NO | Bodies kept in `Map` `observe-page.ts:435`, never written (`store.ts:184-190`). `<style>` text only incidentally in `rendered.html`; CSS-in-JS speedy tags are empty there. |
| 3 | CSSOM rules read? | YES | n/a | `collect-dom.ts:843-868`, visitor `:1074-1244`. Not `adoptedStyleSheets`/shadow roots for layout rules. |
| 4 | CORS SecurityError → direct HTTP fetch fallback? | PARTIAL | n/a | Fallback exists but it is **re-use of the already-downloaded response body**, not a fetch (`observe-page.ts:316-318,434-516`; `collect-dom.ts:874-893`). No body → `fallbackMissed`, no retry fetch. |
| 5 | `@media` condition stored? | YES | PARTIAL | Obs: per declaration `media` (`collect-dom.ts:1306`) + page tally `authoredMediaConditions` (`:1263-1276`, `types.ts:1352`). Spec: per-declaration `authoredLayout[].media` verbatim (`compile-viewport.ts:303`) and folded px histogram `authoredBreakpoints` (`authored-breakpoints.ts:229-269`); the page-wide tally is dropped (not read by `compile-page.ts`). |
| 6 | Declarations inside `@media` stored? | PARTIAL | PARTIAL | Only `LAYOUT_RULE_PROPERTIES` (`types.ts:703-766`), only for elements present in this viewport's DOM that match the selector (`collect-dom.ts:1293`), ≤32/element (`types.ts:800`), value ≤200 chars. Spec copies verbatim. |
| 7 | `@container` condition+declarations as conditional structure? | PARTIAL | PARTIAL | Stored as flat string `container` on each declaration (`collect-dom.ts:1210-1222,1308`), not as a tree; container name folded into the string; no container-type/name of the container element captured (not in either whitelist). Spec verbatim; breakpoints skip it (`authored-breakpoints.ts:163-167`). |
| 8 | `@supports` as conditional structure? | PARTIAL | PARTIAL | Flat `supports` string (`collect-dom.ts:1202-1209,1307`); same carriage into Spec. |
| 9 | `width:85%` | YES (a,b) if selector-matched | YES | `authoredLayout[].value` (`width` in whitelist `types.ts:704`). Apartmentary: 3,101 `%` values. Computed `width` in `styles.json` is px. |
| 10 | `grid-template-columns: repeat(3,1fr)` | YES* | YES* | Whitelisted `types.ts:738`; value is CSSOM serialization (`repeat(3, 1fr)`), not raw text. Computed value expands to px tracks. Apartmentary: 0 occurrences (MUI flex grid). |
| 11 | `clamp()` | YES* | YES* | Whitelisted properties only; `clamp()` on `font-size`/`gap`-less typography is lost (font-size not whitelisted). Apartmentary: 0. |
| 12 | `calc()` | YES* | YES* | CSSOM may normalize (`calc(100% - 20px)` kept; simplifiable calcs may be simplified). Apartmentary: 24. |
| 13 | `vw`/`vh` | YES* | YES* | Apartmentary: 109 (e.g. `html{width:100vw}`). |
| 14 | `min()`/`max()` | YES* | YES* | Apartmentary: 29. |
| 15 | `max-width` | YES | YES | Whitelisted `types.ts:706`; also computed keeps `%` for max-width. Apartmentary: 1,116 declarations. |
| 16 | `margin:auto` | YES (normalized) | YES | Both `margin` and each longhand recorded; serialized (`0 auto` → `"0px auto"`, observed `.swiper-container`). Computed `margin-left/right` are px. |
| 17 | flex/grid authored values | YES (whitelisted subset) | YES | flex, flex-*, grid-template-*, grid-auto-*, grid-column/row/area, gap family, justify/align/place (`types.ts:731-758`). NOT `order`, `float`, `columns`. |
| 9-17 whitelist | — | — | — | `LAYOUT_RULE_PROPERTIES` `src/observer/types.ts:703-766` is the single restricting list; applied `collect-dom.ts:1048`. No SiteSpec-level filter beyond it. |
| 9-17 CSS-in-JS | Emotion/MUI/styled-components `insertRule` | YES | YES | Rules are in `document.styleSheets` (textContent empty doesn't matter to CSSOM). Apartmentary: 3 empty `data-emotion` tags + empty `data-styled` tag per page, yet 670/670 elements carry authored rules and MUI `(min-width:600/900/1200/1536px)` declarations are recorded. But `rendered.html` lacks those rule texts. |
| — | Inline `style=""` / JS-set `el.style` | NO | NO | Not a sheet; `style` not in `ATTR_WHITELIST` (`types.ts:477-503`); dropped in Spec (`safe-attributes.ts:134`). Only computed px survives. |
| 18 | Where is computed px captured; flattening? | `collect-dom.ts:1711-1733` (`getComputedStyle`+`getBoundingClientRect`), `layout-probe.ts:785-797` (x/w/v per width) | styles → `style-catalog.ts:75-81` (untouched) | Flattening is by the browser at capture, stored in `styles.json`/style catalog as the "truth" channel. Nothing in these stages rewrites `authoredLayout` into px; the two channels stay separate (`sitespec/types.ts:726-730` "never merged into the exact-computed style catalog"). Custom properties are resolved per viewport (`collect-dom.ts:2207+`), losing `@media` alternates. |
| 19 | Source `class` attribute in observation? | YES | — | `types.ts:479`, `collect-dom.ts:1327`. Apartmentary p000001 desktop 618/670 elements. |
| 20 | In SiteSpec? | — | NO (attribute) / PARTIAL (selector text) | Dropped `safe-attributes.ts:134`; apartmentary SiteSpec 0 nodes with `class`; but 3,978 `.css-*` selector strings inside `authoredLayout[].selector` on p000001. |
| 22 | `data-*` survival | YES all (value ≤500) | NO (none) | Observed `collect-dom.ts:1330`; dropped `safe-attributes.ts:132`; supplemental denies `data-` prefix. Apartmentary obs names: `data-aos`, `data-aos-easing`, `data-aos-duration`, `data-aos-delay`, `data-reactroot` (5-6 per page); SiteSpec 0. |
| 24 | Breakpoint evidence at SiteSpec | — | PARTIAL | `ViewportPageSpec.authoredBreakpoints` (`sitespec/types.ts:1112`): derived **only from authored `@media` strings on MATCHED, WHITELISTED declarations** (`authored-breakpoints.ts:142-171`), parsed by `media-condition.ts:926`, folded `:1097` into `entries` (px/kind/count) and `boundaries` (below/above). Screen-only via `alternatives[].screenApplicable`. NOT from probe differences (probe arrays attach separately as `node.probe` and `layoutProbe.widths`), and NOT from the observer's page-wide `authoredMediaConditions` tally (which only drives probe widths and is dropped). Site-level `responsiveModel.inferredBreakpoints` is hardcoded `[]` (`compile-site.ts:433`). |
| 25 | Scope of breakpoint data | — | per page × per viewport tree | Computed per `compileViewport` call (`compile-viewport.ts:473`), stored on `pages/<id>.json → viewports.{desktop,mobile}.authoredBreakpoints`. Per-declaration conditions are per-node (subtree evidence is derivable but not aggregated). No route/family/site aggregation; `familyId` exists on the page but no family-level breakpoint record. Probe widths are per page per probe pass (`layout-probe*.json widthProvenance`). |

`*` = survives as CSSOM-serialized specified value, only when on a whitelisted property, on a selector that matched an element present in that viewport's walk, within the 32/element and 200-char caps.

---

## 4. Exact places authored semantics are lost or narrowed before SiteSpec

1. **Property whitelist** — `src/observer/types.ts:703-766` applied at `collect-dom.ts:1048`. Authored responsive typography, borders, backgrounds, `order`, `float`, `columns`, container-type, logical `*-block`/`*-inline-start/end` are never read from sheets. Rules with no whitelisted property are not indexed (`collect-dom.ts:1058`).
2. **CSSOM serialization instead of source text** — `collect-dom.ts:1049` `style.getPropertyValue`. `0 auto` → `0px auto`; shorthand-with-`var()` longhands → `""`; values >200 chars dropped (`:1050`).
3. **Element-presence gate** — `collect-dom.ts:1293` `el.matches`. A rule for an element that does not exist in that viewport's DOM at capture (JS-mounted drawers, width-conditional React branches, below-fold virtualized lists) contributes nothing, including its `@media` evidence to `authoredBreakpoints`.
4. **Per-element truncation in sheet order** — `collect-dom.ts:1287-1301`, cap 32 (`types.ts:800`): late (cascade-winning) sheets lose first. Also no specificity / order index recorded (`MatchedLayoutRuleSchema` `types.ts:1024-1098`).
5. **Sheet scope** — only `document.styleSheets` (`collect-dom.ts:843`); `adoptedStyleSheets` and shadow sheets excluded from the layout index; `@scope`/`@starting-style` skipped (`:1237-1242`).
6. **CORS without a captured body** — `collect-dom.ts:885-892` (`fallbackMissed`), no direct fetch (`observe-page.ts:434-516`).
7. **Conditional structure flattened to strings** — `@media` joined (`:984-1005`), `@supports`/`@container` `" and "`-joined (`:915-916`), container name concatenated (`:1215-1218`), `not` alternatives unrepresentable (counted `mediaConditionsNegated`).
8. **Inline/JS style** — `style` attribute not observed (`types.ts:477-503`), only computed px.
9. **Computed channel is px-resolved** — `collect-dom.ts:1711-1733`; this is the "truth" channel the style catalog carries (`style-catalog.ts:26-30`).
10. **Stylesheet URLs/text never persisted** — `store.ts:184-190`.
11. **SiteSpec drops** `class` + `style` (`safe-attributes.ts:134`), all `data-*` (`:132`), the page-wide `authoredMediaConditions` tally and all `stylesheetCoverage` (not read in `compile-page.ts:538-585`); site `responsiveModel.inferredBreakpoints` hardcoded `[]` (`compile-site.ts:433`).

---

## 5. SiteSpec fields the reconstruction consumes (boundary note)

`grep -a -rl` in `src/reconstruction`:
- `authoredLayout` → `layout-inference.ts`
- `authoredBreakpoints` → `tree-switch.ts`, `layout-inference.ts`
- node `.probe` / `layoutProbe` → `tree-switch.ts`, `layout-inference.ts`; `layoutProbeMobile` → `layout-inference.ts`
- `customProperties` → `generate-app.ts`, `plan-reconstruction.ts`, `layout-inference.ts`
- `styleTokenId` → `style-generator.ts`, `compile-node.ts`, `plan-reconstruction.ts`, `pseudo-generator.ts`, `interaction-bindings.ts`, `compile-runtime-page.ts`, `layout-inference.ts`
- `stylesheetCoverage`, `authoredMediaConditions` → 0 hits (not available to reconstruction via SiteSpec).

---

## 6. Real artifact verification — apartmentary.com

Observation `data/apartmentary.com/site-observations/2026-09-14T04-22-26-242Z` (7 pages, 2 viewports each); SiteSpec `data/apartmentary.com/site-specs/2026-09-14T04-58-45-517Z`. Site stack visible in artifact: Next.js + MUI/Emotion + styled-components + Swiper + AOS.

### 6.1 Observation

| page | vp | elements | with `layoutRules` | declarations | truncated | with `class` | with `data-*` | sheets total / CSSOM readable / blocked | rules indexed | distinct `@media` tally |
|---|---|---|---|---|---|---|---|---|---|---|
| p000001 `/` | desktop | 670 | 670 | 3,152 | 0 | 618 | 27 | 9/9/0 | 227 | 8 |
| p000001 | mobile | 611 | 611 | 2,730 | 0 | 566 | 27 | 9/9/0 | 179 | 8 |
| p000002 `/faq` | d / m | 360 / 342 | 360 / 342 | 2,113 / 2,010 | 0 | 336 / 317 | 8 | 9/9/0 | 235 / 184 | 8 / 8 |
| p000003 portfolio item | d / m | 365 / 358 | all | 2,472 / 2,356 | 0 | 343 / 330 | 9-10 | 9/9/0 | 255 / 192 | 8 / 7 |
| p000004 portfolio item | d / m | 354 / 349 | all | 2,358 / 2,281 | 0 | 332 / 321 | 9-10 | 9/9/0 | 236 / 167 | 8 / 7 |
| p000005 `/portfolio?page=0` | d / m | 892 / 689 | all | 5,754 / 3,581 | 0 | 842 / 638 | 5 | 10/10/0 | 264 / 174 | 8 / 8 |
| p000006 `/service` | d / m | 398 / 351 | all | 1,961 / 1,868 | 0 | 348 / 310 | 15 | 9/9/0 | 241 / 171 | 8 / 8 |
| p000007 portfolio item | d / m | 368 / 367 | all | 2,512 / 2,356 | 0 | 346 / 336 | 9-10 | 9/9/0 | 257 / 192 | 8 / 7 |

- `authoredLayout` (observer `layoutRules`) present on **100%** of elements on every page/viewport (the universal `box-sizing` rule alone matches everything: 7,220 `box-sizing` rows site-wide). Total declarations across 14 viewport walks: **37,504**. `fallbackRecovered` 0, `cssomBlocked` 0, `bytesBridged` 0, `groupingRulesSkipped` 0, `ruleIndexCapHit` false.
- Page-wide `@media` tally (p000001 desktop): `(hover: none)`×18, `print`×13, `screen and (min-width: 900px)`×3, `(min-width: 1200px)`×2, `(min-width: 1536px)`×2, `(min-width: 600px)`×2, `(min-width: 900px)`×2, `screen`×1.
- `@media` strings on matched declarations (site-wide): `(min-width: 900px)` 648, `(min-width: 1200px)` 648, `(min-width: 1536px)` 648, `(min-width: 600px)` 636, `screen` 218, `print` 14 → 6 distinct. `container` 0, `supports` 0, `origin:"fetched"` 0.
- Authored value kinds site-wide: `%` 3,101; `auto` 375; `vw/vh` 109; `min()/max()` 29; `calc()` 24; `clamp()` 0; `repeat()` 0; `fr` 0; `var()` 0.
- Example (p000005 desktop `e000074`, class `MuiGrid-root MuiGrid-item MuiGrid-grid-md-12 …`): `max-width:100%`, `flex-basis:100%` @ `(min-width: 900px)`; `max-width:50%`, `flex-basis:50%` @ `(min-width: 1200px)` and `(min-width: 1536px)`, selector `.css-rsjln6`. Computed: `width:95.5px, max-width:50%, flex-basis:50%`.
- Stylesheet URLs/text: not stored as data. `rendered.html` has 2 `<link rel=stylesheet>` (`/_next/static/css/80139ea3111436a9.css`, `/_next/static/css/d7c08271dabb56dd.css`) and 7-8 `<style>` tags per page of which **3-4 are EMPTY** (`data-emotion="css-global"`, `data-emotion="css"`, `data-emotion="css-global 0"`, `data-styled="active"`): CSS-in-JS speedy rules invisible to `rendered.html` but read via CSSOM. One non-empty emotion tag (29,419 bytes, 24 `@media`) on p000005.
- `data-*` names observed: `data-aos`, `data-aos-easing`, `data-aos-duration`, `data-aos-delay`, `data-reactroot` (+1 on some pages).
- Root custom properties: 1 per viewport.
- Probe widths (all 7 pages identical):
  - desktop: `390, 599, 600, 700, 768, 899, 900, 1024, 1100, 1199, 1200, 1440, 1535, 1536, 1920` (15; 4 folded / 4 adopted / 0 dropped by cap / 0 evicted)
  - mobile: `390, 480, 599, 600, 700, 768, 899, 900, 914, 1199, 1200` (11; 4 folded / 3 adopted / `1536/min` out-of-range)

### 6.2 SiteSpec

- Every element node on every page/viewport carries `authoredLayout` (e.g. p000001 desktop 670/670, 3,152 decls — identical to the observation, verbatim carry).
- `class` attribute on **0** SiteSpec nodes; `data-*` on **0** nodes. Attribute names kept on p000001: `aria-hidden, aria-live, lang, role, tabindex, title, type`. But `authoredLayout[].selector` still carries **3,978** `.css-*` selector strings on p000001.
- `authoredBreakpoints` per viewport (all pages): entries `600/min, 900/min, 1200/min, 1536/min`; boundaries `599|600, 899|900, 1199|1200, 1535|1536`; `distinctConditions` 6; `container`/`supports` 0; unsupported/unparsed 0; truncatedNodeCount 0. Weights vary per page (p000001 desktop ×9 each, mediaScoped 69 / unconditional 3,083; p000005 desktop 195-207, mediaScoped 823).
- `stylesheetCoverage` key absent on all SiteSpec viewports (the `(hover: none)` / `print` page tally is gone).
- `layoutProbe` desktop and `layoutProbeMobile` aligned on all 7 pages, `alignmentRatio` 1; every element node has `probe` arrays.
- `site-spec.json → responsiveModel`: `mode:"observed-endpoints"`, `inferredBreakpoints: []`, limitation `breakpoints-not-inferred`.
- Style catalog tokens: computed values only (e.g. `st000001.properties["align-items"]="center"`), no authored text.

---

## 7. Remaining risks / notes for the next stage

- On apartmentary the authored channel is complete (0 blocked sheets, 0 truncation), so apartmentary failures downstream are NOT caused by missing authored `@media` evidence for whitelisted layout properties; they would be caused by non-whitelisted properties, computed-px use, or reconstruction choices.
- On sites with CORS-blocked sheets without captured bodies, `@import`-heavy CSS, adopted sheets, or >32 matched declarations per element, both `authoredLayout` and `authoredBreakpoints` are silently narrower than the source (counted in `stylesheetCoverage`, which SiteSpec does not carry).
- The observer's page-wide `authoredMediaConditions` and the SiteSpec's `authoredBreakpoints` are two different derivations of "breakpoints" (whole sheet vs matched declarations); they can disagree and only the latter reaches reconstruction.
