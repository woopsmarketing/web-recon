# 08 — Portfolio media 1.1 addendum (web-recon producer ⇄ first-party data consumer)

| | |
|---|---|
| status | **NORMATIVE ADDENDUM**, implemented by the producer (2026-09-29). Decided in `docs/work/portfolio-experience-v1/02-contract-and-architecture-decisions.md` §D1 (orchestrator, 2026-09-29). This file restates D1 in contract form and adds nothing to it. |
| amends | `07-integration-contract-v0.2-candidate.md` (rev 9.2.1). The change is **additive**: every rule of 02 and 07 that is not named here survives unchanged. 00–07 are not edited. |
| document `schemaVersion` | `"1.1"` (was `"1.0"`). This is a **minor** change: SV2 says an added optional field is minor. The manifest stays `"0.1"`. |
| producer | `platform/integration/{contract,emit,validate}.ts`, `PRODUCER_VERSION = 3` |
| golden | `platform/test/golden/portfolio-v1.1-media/`. `platform/test/golden/portfolio-v0.2/` is frozen as the 1.0 compatibility fixture. |
| name note | 07's header names a derived `08-integration-contract-v0.2.json`. No such file exists, and this addendum is unrelated to it. |

## 1. Why

A chat consumer that recommends a portfolio case needs to show that case's photos: a card
thumbnail, and a small gallery when the visitor opens it. It needs these without scraping the page
and without trusting any URL the page or the document could point elsewhere. 07 §23.2 already
named a same-origin `cover` as a future additive minor field. 1.1 adds it, together with the
record's authored gallery.

## 2. Shape (normative)

```ts
record.media?: {
  cover?: MediaImage;        // the record's authored cover (card thumbnail)
  gallery?: MediaImage[];    // 1..12 items, the authored primary gallery in authored order
  totalCount?: number;       // integer ≥ 1; present only together with gallery; ≥ gallery.length
}
MediaImage = {
  src: string;               // same-origin absolute PATH, e.g. "/assets/03c625140dc4df674fb8.jpg"
  alt?: string;              // authored alt only (≤ 160 chars); omitted when not authored
  width?: number;            // positive integers; width and height both present or both absent
  height?: number;
}
```

Key order in the serialised bytes: `media` is the **last** key of a record, after `facets`. Inside
it the order is `cover · gallery · totalCount`, and a `MediaImage` is `src · alt · width · height`.
Every 1.0 key keeps its position.

### 2.1 Rules

| id | rule |
|---|---|
| MD-1 | `src` matches `^/(?!/)[A-Za-z0-9._~%/-]{1,511}$` and has no `..` segment. So it is a path, like `detailUrl`: no scheme, no host, no `//`, no backslash, no query, no fragment, no space, no non-ASCII, and at most 512 characters. An absolute URL is **invalid**. |
| MD-1a | **Hardening (the producer enforces it, consumers SHOULD).** A WHATWG URL parser decodes `%2e`/`%2E` as a dot, so `/assets/%2e%2e/x` is a `..` segment once resolved, even though the MD-1 regex admits it. So `src` must also: have no empty, `.` or `..` segment; have only well-formed `%XX` escapes; and contain no encoded dot, slash, backslash or NUL (`%2e`, `%2f`, `%5c`, `%00`, in any case). This is stricter than MD-1 and never looser, and real content-addressed `/assets/<hex>.<ext>` paths never trip it. |
| MD-2 | Consumers resolve `src` against the document's **bound public origin** (the manifest's `site.publicOrigin` as the consumer bound it), never against anything in the document. |
| MD-3 | `width` / `height` are positive integers, both present or both absent. |
| MD-4 | `alt` is authored text only: 1–160 characters, not blank (whitespace only), and subject to HT7 like every string. The producer **never invents** an alt. When `alt` is missing, the consumer uses a title-based fallback (`<title> 사진 N`). |
| MD-5 | `gallery` has 1 to 12 items. `totalCount` is an integer ≥ 1, present **exactly** when `gallery` is present, and ≥ `gallery.length`. |
| MD-6 | `gallery.length === min(totalCount, 12)`. The producer exports the first 12 images in authored order. |
| MD-7 | There is **no `hasMore` field**, because booleans are not part of the schema (the V0 `scanValues` rule stands). `hasMore` is derived: `totalCount !== undefined && totalCount > gallery.length`. A source "proves more images exist" only through a known `totalCount`. |
| MD-8 | A record with neither a cover nor a gallery **omits** `media`. `{}` is never emitted, and neither is `null`, `""` or `[]` (MD1–MD3 of 02). |
| MD-9 | Media is **presentation only**. No matcher or ranking code reads it, no facet is derived from it, and the model payload (`recordForModel`) does not carry it. |
| MD-10 | Consumer: an invalid `media` on a record makes the consumer drop **the media only**. The record is kept (07 §12 spirit). |
| MD-11 | `media` is optional. A record without it is exactly a 1.0 record and is valid under `"1.1"`. |

### 2.2 Versioning

`media` is part of the projection, so the resource `version` (sha256 of the canonical body, 02 §15)
**changes** when a cover, a gallery image, its order, an alt, `totalCount`, an asset's
`publicPath` or its registered size changes. Before 1.1 those changes were outside the projection
and did not move the version. RV2/INV-2 are unchanged; only the projection grew. What stays
neutral: before-images (§3), assets that no record's media references, and everything already
outside the projection.

## 3. Producer sourcing (normative for this producer)

- `cover` comes from the Project's authored `cover`.
- `gallery` comes from `galleryGroups[].items[].image`: **after images only**, in authored order
  (group order, then item order), the first 12. `totalCount` is the number of after images.
- **Media ownership (2026-09-29, producer 4; schema and `schemaVersion "1.1"` unchanged).** A record
  exports an image only when the snapshot shows it belongs to that record. An asset is
  attributable to record R iff it is in R's own `galleryGroups` (after or before image), or R is
  the only record that references it at all and no site banner, logo or slot image uses it. A cover that is another record's gallery photo, or
  that several records share, is **not exported**; the consumer shows a text card. The gallery
  holds one entry per asset (first occurrence wins), and `totalCount` counts distinct after images.
  For boost-interior-demo this removes the covers of bi-09 … bi-19, which were bi-01 … bi-08 gallery
  photos: 8 covers, 8 galleries, 41 images. Evidence and the per-record table are in
  `docs/work/portfolio-experience-v1/03-media-truth-audit.md`.
- Before/after comparison images (`item.before`) are **not exported in V1** and are **not counted**.
  They sit behind a toggle on the canonical page and are not the primary gallery.
- `src` is the asset's content-addressed `publicPath` (`/assets/<sha256[0:20]>.<ext>`) from the
  site snapshot's asset table. `width`/`height` are the registry's values from the same table,
  which is exactly what the Template's AssetResolver resolves. An asset missing from the snapshot
  fails the build (fail closed, 02 §4).
- `alt` is the authored `alt` when it is a non-empty string. Otherwise the key is omitted.
- Nothing else is a media source: no `og:image`, no site hero or band, no logo, no section image.
  For boost-interior-demo the og:image is the site-wide `site-hero-01` on every page, and no page
  has a project-specific og:image or JSON-LD.
- The producer version moves 2 → 3 because both the projection and the validation changed (the
  rule in `contract.ts`). The document `schemaVersion` is also a build input, so a 1.0 package is
  never reported "up-to-date" for the 1.1 producer.

The per-record inventory of boost-interior-demo is in
`docs/work/portfolio-experience-v1/01-media-inventory.md`: 19 covers, 8 galleries, 41 exported
images, `totalCount` 42 in total, and bi-01 at 12 of 13 (so `hasMore` is derived as true).
Since producer 4 (media ownership, above) it is 8 covers; see `03-media-truth-audit.md`.

## 4. Validation (producer, fail closed)

`platform/integration/validate.ts` adds `MediaImageSchema` and `PortfolioMediaSchema` (both
`.strict()`) under `PortfolioRecordSchema.media` (optional), and they enforce MD-1 … MD-8. The
existing `scanValues` pass also covers `media`: null, `""`, `{}`, `[]`, booleans and HT7 characters
are refused. The producer validator accepts `schemaVersion: "1.1"` only, because it validates what
this producer emits. The 1.0 compatibility case is that a 1.0-shaped document relabelled `"1.1"`
validates unchanged (MD-11).

## 5. Consumer obligations (for the record; implemented in BoostChat)

- Accept document majors {0, 1} as before. Parse `media` when present, and treat `"1.0"` and `"1.1"`
  alike apart from it.
- Apply MD-1 … MD-8 independently. Drop an invalid `media` only (MD-10).
- Never follow a `src` to another origin (MD-2). Never widen the CSP because of media.
- Derive `hasMore` (MD-7). Never expect it on the wire.
- The consumer must be live before the producer publishes 1.1 (D9). A refresh re-parses only when
  the manifest version changes. An old consumer that stored the 1.1 document without media would
  then report "unchanged" forever.

## 6. Test invariants (added to 07 §15)

| id | invariant | where |
|---|---|---|
| INV-M1 | demo media = authored cover + authored after gallery (first 12, authored order) + totalCount; before images neither exported nor counted | `integration.test.ts` E11, E12 |
| INV-M2 | alt only when authored; `""` → no key | E12 |
| INV-M3 | a record without media validates; the frozen 1.0 golden relabelled `"1.1"` validates with 0 errors, and as `"1.0"` it is refused only for its schemaVersion | M1, M2 |
| INV-M4 | MD-1 / MD-1a src rules are refused: absolute URL, `//host`, `..` (also percent-encoded), encoded slash / backslash / NUL, empty or `.` segment, malformed escape, `javascript:`, `data:`, query, fragment, backslash, > 512 | M3 |
| INV-M5 | MD-3 … MD-8 shape rules (width without height, 13 items, empty gallery, boolean hasMore, `{}`, totalCount rules) are refused | M4 |
| INV-M6 | media changes move the version; before-images and unreferenced assets do not | E7 |
| INV-M7 | media keys appear only under `records[].media`; no site asset path appears in the document | E6 |
| INV-M8 | every media src is a file of the same package, and is rendered by the record's own detail page | `integration.test.ts` T1, B2b; `detail-facts.test.ts` B8 |
| INV-M9 | the 1.1 golden equals the pure emission byte for byte; the 1.0 golden is frozen | G6, G6b; `integration-golden.ts` check |

## 7. Rollout

This follows D9 in `02-contract-and-architecture-decisions.md`: producer build (no publish) →
consumer deploy → controlled producer publish, with the rollback target preserved → audited
snapshot refresh plus the matcher invariance check → live E2E. The producer's first 1.1 package is
built locally and is not published by this change.
