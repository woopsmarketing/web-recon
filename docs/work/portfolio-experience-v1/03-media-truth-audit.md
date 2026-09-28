# Portfolio Experience V1 — media truth audit of boost-interior-demo (Track B, 2026-09-29)

Owner rule: a Portfolio record may carry an image in its exported `media` **only when the image is
supported as belonging to that specific record**. No image (the consumer falls back to a text card)
is better than a wrong image. Images are never generated or approximated to fill a gap.

This audit checks the 1.1 document emitted by producer 3
(`portfolio.d95b5cb5f8f05e50e624eb44d39393f5.json`, inventoried in `01-media-inventory.md`) against
that rule, and records the producer fix (producer 4, golden `portfolio.856361f52e3f1b5022cce13a31afc171.json`).

Context: every image of this demo is an AI-generated demo asset (fal.ai FLUX.2 klein, generated per
shot for bi-01 … bi-08, `docs/result/recon-template-platform-step6-demo/09-ai-images-complete.md`);
"belongs to a record" here means "was generated for and authored in that record's own shot list".

## The rule the producer now applies (`platform/integration/emit.ts`, MEDIA OWNERSHIP)

An asset is **attributable** to record R iff

- (a) it is in R's own `galleryGroups` (an after or a before image), or
- (b) R is the only record in the snapshot that references it at all (cover, after or before),
  and no non-project content (banner image, logo, slot image) uses it.

A cover that is not attributable is not exported. The gallery is R's own after images, as before,
now one entry per asset (first occurrence, authored order); `totalCount` counts distinct after
images. A record left with nothing omits `media` (never `{}`). Schema, `schemaVersion "1.1"` and
the validator are unchanged. `PRODUCER_VERSION` 3 → 4 (the projection changed; `contract.ts`
convention). The rule is generic: no record or asset id is named in the producer.

## Evidence

1. `data/sites/boost-interior-demo/assets/registry.json` has 52 assets: `bi01-*` … `bi08-*` (44)
   and 8 site/logo assets. **No `bi09-*` … `bi19-*` asset exists.**
2. `git log --all -S "bi09-"` … `-S "bi19-"`: no commit ever added such an asset id.
3. `references/boost-interior/generated-approved/` and `generated-candidates/` hold only `bi01` …
   `bi08` and `site` shots (0 files match `bi09` … `bi19`). No generation run ever targeted them.
4. `docs/result/interior-portfolio-v0.2/04-demo-data-spec.md` §5, which authored bi-09 … bi-19:
   > "every new cover below is a **shared photo**: the same jpg already appears in another record's
   > gallery. Nobody should read a new record's cover as a photograph of a distinct job."
5. `templates/interior-01/v1/sections/PortfolioDetail.tsx:66-75`: when `galleryGroups` is absent the
   detail page renders the cover as the only photo — so on the site, bi-09 … bi-19 show another
   job's photo as their own.

## bi-09 … bi-19 (FOREIGN covers)

"gallery before / after" = exported gallery images in producer 3 / producer 4.

| recordId | current cover source (asset id → publicPath) | current cover actually belongs to record? | correct cover source | gallery before | gallery after | source evidence | reused foreign image removed? | notes |
|---|---|---|---|---|---|---|---|---|
| bi-09 | `bi01-living-02` → `/assets/f7772497b1c65dd37094.jpg` | NO | none exists | 0 | 0 | bi-01 gallery 거실 #2; spec §5 | YES (`media` absent) | text card |
| bi-10 | `bi08-dining-01` → `/assets/f0e9c3eb5d869b3fc459.jpg` | NO | none exists | 0 | 0 | bi-08 gallery 다이닝; spec §5 | YES | text card |
| bi-11 | `bi07-kitchen-01` → `/assets/48935a1375b5da6944fe.jpg` | NO | none exists | 0 | 0 | bi-07 gallery 주방; spec §5 | YES | text card |
| bi-12 | `bi05-dining-01` → `/assets/8653c74f8aa70a30f10a.jpg` | NO | none exists | 0 | 0 | bi-05 gallery 주방·다이닝; spec §5 | YES | text card |
| bi-13 | `bi03-kitchen-01` → `/assets/8f3c4902540b7804ba70.jpg` | NO | none exists | 0 | 0 | bi-03 gallery 주방·팬트리; spec §5 | YES | text card |
| bi-14 | `bi01-kitchen-01` → `/assets/8b1f5ef894985ebb1ef9.jpg` | NO | none exists | 0 | 0 | bi-01 gallery 주방 #1; spec §5 | YES | text card |
| bi-15 | `bi07-bathroom-01` → `/assets/c4b8793c0ec308e9cf15.jpg` | NO | none exists | 0 | 0 | bi-07 gallery 욕실; spec §5 | YES | text card |
| bi-16 | `bi01-kitchen-02` → `/assets/07ec6b76f44294d581b4.jpg` | NO | none exists | 0 | 0 | bi-01 gallery 주방 #2; spec §5 | YES | text card |
| bi-17 | `bi06-living-01` → `/assets/0600f0ac3c687ecd0dd0.jpg` | NO | none exists | 0 | 0 | bi-06 gallery 거실 #1; spec §5 | YES | text card |
| bi-18 | `bi03-entrance-01` → `/assets/6cfd586c71fbe0ba477f.jpg` | NO | none exists | 0 | 0 | bi-03 gallery 현관; spec §5 | YES | text card |
| bi-19 | `bi01-hallway-01` → `/assets/b5a1855e08067d3f99a6.jpg` | NO | none exists | 0 | 0 | bi-01 gallery 복도·수납; spec §5 | YES | text card |

For every row: no asset of this record exists (evidence 1–3), the cover is another record's gallery
photo (evidence 4), and the rule's (a) and (b) both fail (no own gallery; the asset is also referenced
by its original record). Producer 3 exported `media = { cover }`; producer 4 exports no `media`.

## bi-01 … bi-08 (unchanged)

| recordId | cover | cover belongs to record? | gallery before | gallery after | totalCount | notes |
|---|---|---|---|---|---|---|
| bi-01 | `bi01-living-01` | YES (in own gallery) | 12 | 12 | 13 | 13th after image counted, not exported |
| bi-02 | `bi02-living-01` | YES | 4 | 4 | 4 | — |
| bi-03 | `bi03-living-01` | YES | 5 | 5 | 5 | — |
| bi-04 | `bi04-kitchen-01` | YES | 4 | 4 | 4 | 2 before images kept out (policy below) |
| bi-05 | `bi05-living-01` | YES | 4 | 4 | 4 | — |
| bi-06 | `bi06-entrance-01` | YES | 4 | 4 | 4 | — |
| bi-07 | `bi07-living-01` | YES | 4 | 4 | 4 | — |
| bi-08 | `bi08-living-01` | YES | 4 | 4 | 4 | — |

Their media is byte-identical between producer 3 and producer 4 (`integration.test.ts` E14). No
bi-01 … bi-08 gallery repeats an asset, so dedupe changes nothing on this corpus.

**bi-04 before images** (`bi04-kitchen-01-before`, `bi04-bathroom-01-before`) are attributable to
bi-04 (rule (a)), but stay unexported and uncounted: that is the D1 / 08 policy (they are the hidden
half of a before/after toggle, not the primary gallery), not an ownership question.

## Summary

```
FOREIGN_COVER_FOUND_COUNT        = 11   (bi-09 … bi-19)
FOREIGN_COVER_REMOVED_COUNT      = 11
RECORDS_ENRICHED                 = 0    (searched: the only records with gallery 0/1 are bi-09 … bi-19,
                                         and no attributable asset of theirs exists anywhere)
RECORDS_STILL_COVER_ONLY         = 0
RECORDS_WITH_NO_PROVABLE_MEDIA   = 11   (bi-09 … bi-19: `media` absent)
GALLERY_IMAGES_BEFORE / AFTER    = 41 / 41   (totalCount sum 42 / 42)
COVERS_BEFORE / AFTER            = 19 / 8
```

Document: resourceVersion `d95b5cb5…` → `856361f5…`, 20 158 B → 18 520 B. Every non-media byte is
unchanged (E14 compares against producer 3's golden read from git `df68b10`).

## Known limitation (out of scope)

Only the **Portfolio Document** (what BoostChat shows) is corrected. The demo website itself still
renders the shared photo on bi-09 … bi-19's listing cards and detail pages: template interior-01
requires a `cover` on every project, and the detail page falls back to it. Fixing the site needs a
template cut (optional cover / text card), which this task does not make.

**Site-side fix — scoped plan, OWNER DECISION, not done** (interior-01 **1.6.2** cut):

1. `platform/content/schema.ts:247` — `cover` optional. This file is a platform runtime source and a
   producer source (`PRODUCER_SOURCE_FILES`), so the build identity moves; the emitter already
   treats `cover` as optional.
2. `components/ProjectCard.tsx` — a text-only card branch (no `<img>`, no empty frame).
3. `sections/projectCards.ts:23` and `sections/portfolioFilter.ts:20,61` — guard `p.cover` (the
   card/filter entry's `cover` becomes optional), `components/PortfolioBrowser.tsx:263` — the type.
4. `sections/PortfolioDetail.tsx:66-75` — no galleryGroups and no cover → a no-photo detail (no
   gallery section), instead of the cover fallback.
5. `styles/template.css` — the text-card / no-photo styles.
6. `template.ts` — version 1.6.2 + changelog; `template:release interior-01@1` release cut;
   `data/sites/boost-interior-demo/site.json` re-pin.
7. `content/projects.json` — drop `cover` from bi-09 … bi-19.
8. Re-pin the tests that name the pin / page bytes (I2b and the 1.6.1 precedent's suites), rebuild,
   fresh review, publish.

**Package state (2026-09-29, PUBLISHED).** The canonical demo package was rebuilt with
producer 4 (`docs/result/portfolio-media-polish-v1/proof/10-site-build.log`) and published
(`proof/30…33-publish-*.log`): live = buildInputId `71f7e5f3d1a1f6e7773153a1ec091e66b5cfd7d47687af16e94a5ef3c2379407`,
packageHash `77cc7f9f47adda09d119c6ec5a02626624b4e068b546e15185d39c1658bdbda0`; rollback = the previous
live package `3a897d2e…` / `480e5e65b0611ab280de8ae0c242e050a5a9711bbeb7f0e90c46c9f5c107298c` (producer 3,
still carries the 11 shared covers); keep-2 retired the widget build `32303241…` locally (in git at `aa2d94b`,
sealed in R2 — old package bytes untouched). Against the old live package exactly the `_integration/`
manifest + document differ (`proof/11-package-diff-vs-live.json`). The live manifest serves
`portfolio.856361f52e3f1b5022cce13a31afc171.json`; BoostChat's boost-interior-demo snapshot was refreshed
through the audited ops CLI to the same resourceVersion (19 records, schema 1.1, media records 19 → 8).
Report: `docs/result/INTERIOR-PORTFOLIO-MEDIA-POLISH-V1-2026-09-29.md`.
