# boost-interior-synthetic — TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING

**This directory is a test fixture. Nothing in it is a customer case, and nothing in it may reach a
customer-facing site, package, Portfolio Document or chat snapshot.**

| | |
|---|---|
| status | `TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING` (also the `status` field of `projects.synthetic.json`) |
| records | `bi-09` … `bi-19` (11), classified **VERIFIED_SYNTHETIC** |
| removed from production | 2026-09-29 (from `data/sites/boost-interior-demo/content/projects.json`, which now holds `bi-01` … `bi-08` only) |
| provenance | authored from scratch as V0.2 contract / matcher test fixtures: `docs/result/interior-portfolio-v0.2/04-demo-data-spec.md` §2 ("internal demo fixture", one "WHAT THIS RECORD TESTS" block per record) and §5 (every cover is a shared photo of another record) |
| audit | `docs/work/portfolio-experience-v1/04-record-truth-audit.md` — no source case, no own asset, no real source for any fact |
| read by | `platform/test/portfolio-qa-corpus.ts` only, and through it by tests only |

## What is here

- `projects.synthetic.json` — the 11 records **verbatim**: every field exactly as it stood in the
  production file, including each record's borrowed `cover` (an after image of one of `bi-01` …
  `bi-08`). The borrowed cover is kept on purpose: it is what keeps the media-ownership rule
  ("a cover that is another record's gallery photo is never exported") exercised on real-shaped data.
  The top-level keys other than `items` are fixture labels. They are not a content schema: the
  platform's `projects@1` document is strict, so the site loader would refuse this file outright.
- `qa-golden/portfolio.856361f52e3f1b5022cce13a31afc171.json` + `qa-golden/manifest.json` — the
  **pre-split 19-record Portfolio Document** (document `"1.1"`, producer 4) and its manifest. They
  were the production golden until 2026-09-29 (`platform/test/golden/portfolio-v1.1-media/`). They are
  now a **QA artifact, not production**: the QA composition below must re-emit them byte for byte.
  boost-chat keeps a byte-identical copy of this document as its matcher QA fixture, so the bytes
  must never change.

## How tests use it

`platform/test/portfolio-qa-corpus.ts` composes the **QA corpus** = the production items + these 11
items in the original order. It is the pre-split corpus exactly: the composed `projects.json` has
the pre-split sha256, the composed snapshot has the pre-split `siteSnapshotHash`, and its emission
is `qa-golden/` byte for byte (`platform/test/portfolio-production-truth.test.ts`). The edge-case
checks that used to run on the 19-record production data run on the QA corpus with unchanged
literal expectations:

- `platform/test/integration.test.ts`: exact / range totals, D-1 derivation and rounding, m²
  exclusive, area / projectType / style absent, partial scopes, media ownership (foreign cover),
  the validator's known-bad mutations.
- `platform/test/detail-facts.test.ts`: detail-page fact rendering (AREA-UI, F, B8), including a
  real build of the QA corpus in a throwaway root.
- `platform/test/step6.test.ts`: filter / sort edge cases (N), area witnesses (H), cover-only
  fallback (L), also on a throwaway QA build.

## Rules

- No runtime or production path may load this directory: no build, publish, producer, template,
  worker or script. `portfolio-production-truth.test.ts` fails if a file outside `platform/test/`
  names it.
- It must never be placed under `data/sites/`. A QA build writes the composed `projects.json` into
  its own throwaway root only (`writeQaProjects` refuses the repository's `data/sites`).
- Do not "fix" a record here toward realism. A fixture has no source to correct toward. The values
  are there to exercise a contract rule.
- No new wire-schema field is involved: the Portfolio Document schema is unchanged.
