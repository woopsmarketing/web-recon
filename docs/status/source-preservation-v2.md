# Source Preservation V2 — status

Last updated: 2026-09-18. Architecture: [`../architecture/runtime-preservation.md`](../architecture/runtime-preservation.md),
[`../architecture/recon-template-platform.md`](../architecture/recon-template-platform.md).
Subject site so far: Apartmentary `/` (Next.js 12.3.4 / React 17).

## Phases

| Phase | Name | Status | Evidence (`docs/result/…`) |
|---|---|---|---|
| 1 | SOURCE PACKAGE CAPTURE | **PASS / FROZEN** | `source-preservation-phase1/` |
| 2 | STATIC PRESERVATION CLONE | **HUMAN PASS / FROZEN** | `source-preservation-phase2/` |
| 3A | RUNTIME FORENSIC | **PASS** | `source-preservation-phase3a/` |
| 3B | STRATEGY A INITIAL (boot over Phase 2 DOM) | **SUPERSEDED** as accepted hydration architecture | `source-preservation-phase3b/` |
| 3B.1 | SOURCE RUNTIME BOOT (inert tracker stand-in) | **PASS** | `source-preservation-phase3b1/` |
| 3C | SYNTHETIC DATA REPLAY | **PASS** | `source-preservation-phase3c/` |
| 3C.1 | STRATEGY B / COMPATIBLE HYDRATION BASE | **PASS / HUMAN QA PASS / FROZEN** | `source-preservation-phase3c1-strategy-b/` (accepted), `source-preservation-phase3c1-live-qa/`, `source-preservation-phase3c1-visual-qa/` |

Notes:
- Report verdict strings (e.g. 3B "BOOT FAILED", 3C.1 "HYDRATION_BASE_MISMATCH_CONFIRMED") are the
  original experiment verdicts. The statuses above are the milestone adjudication; the reports are not rewritten.
- 3C.1 human QA confirmed major desktop/mobile responsive behaviour, source Swiper/data sections, and
  footer fidelity. The automated run itself was one run per arm with synthetic data (limits in its `00-summary.md`).

## Known debt

| Item | Status | Evidence |
|---|---|---|
| Intro video body (~98 MB) not captured; remote S3 dependency | **KNOWN NON-BLOCKING DEBT / DEFERRED** | `source-preservation-intro-media-forensic/` |

## Source Package: JSON response body capture

JSON RESPONSE BODY CAPTURE — DEFAULT = ON, EXPLICIT OPT-OUT = SUPPORTED (2026-09-18).
`src/source-package/` captures eligible JSON response bodies by default (`bodyPolicy.json = true`),
under dedicated `maxJsonBodyBytes` (2 MB) / `maxTotalJsonBytes` (16 MB) caps, separate from the
generic "other" body budget. Opt-out: `--no-source-package-json` on `pnpm observe`/`pnpm observe:site`
(only meaningful with `--source-package`), or `bodyPolicy: { json: false }` programmatically. Captured
JSON bodies use the same content-addressed blob storage as everything else (own SHA-256 in
`network/manifest.json`); the package-level `contentHash` stays scoped to document + style + script
bytes only (the rehydratable "source" set) — network/JSON bodies are evidence, not rehydrated source,
so they are intentionally excluded from it (documented on the `contentHash` field). No replay/mock/
schema-inference logic was added; request headers/cookies/bodies remain uncaptured.

## Recon Template Platform architecture

**ACCEPTED WITH MODIFICATIONS (2026-09-18)** → [`../architecture/recon-template-platform.md`](../architecture/recon-template-platform.md).
Study `recon-template-platform-architecture-study/` = historical design evidence; acceptance record
`recon-template-platform-architecture-acceptance/`. Slice 1 implemented (`platform/`, `templates/interior-01/v1/`) →
[`../result/recon-template-platform-slice1/00-summary.md`](../result/recon-template-platform-slice1/00-summary.md).
Step 4 (portfolio list/detail/pagination, release `interior-01-1.1.0-512e4dd932b4`, 3 sites re-pinned) →
[`../result/recon-template-platform-step4/00-summary.md`](../result/recon-template-platform-step4/00-summary.md).
Step 4.1 (portfolio filters/search/sort: pure `ProjectFilter` contract + client-side evaluation over a compact build-time index,
release `interior-01-1.2.0-93fb66acda7d`, 3 sites re-pinned) →
[`../result/recon-template-platform-step4-1-filters/00-summary.md`](../result/recon-template-platform-step4-1-filters/00-summary.md).
Step 5 Full Homepage DONE (hero carousel · intro · projects A/B · reviews · image band · floating CTA; `reviews@1` +
PROVISIONAL `banners@1`; release `interior-01-1.3.0-74a70c276f35`, 3 sites re-pinned, 1.2.0 = rollback) →
[`../result/recon-template-platform-step5-homepage/00-summary.md`](../result/recon-template-platform-step5-homepage/00-summary.md).
Whole-site Visual / UX Polish DONE (presentation-only patch: mobile footer stack, viewport-fixed floating seat, reviews bar only
when a track scrolls, portfolio title on its banner, shared rhythm; release `interior-01-1.3.1-bd4ae8fb1769`, 3 sites re-pinned,
1.3.0 = rollback) → [`../result/recon-template-platform-whole-site-polish/00-summary.md`](../result/recon-template-platform-whole-site-polish/00-summary.md).
Step 5.2 Tiny Template Finalization DONE (floating CTA site-wide via the root layout → SiteFooter → FloatingCta seat;
`area.basis` supply | exclusive | unknown, bare Korean residential "34평" = supply, no 34평→84㎡ equivalence; release
`interior-01-1.4.0-9e1ea20da947`, 3 sites re-pinned, 1.3.1 = rollback; Template contract frozen for Step 6) →
[`../result/recon-template-platform-step5-2-template-finalization/00-summary.md`](../result/recon-template-platform-step5-2-template-finalization/00-summary.md).
Step 6 Demo Customer Content Proof **PARTIAL** (2026-09-19): new Site Instance `boost-interior-demo` (부스트 인테리어, ko-KR, 8 projects) built on the
**unchanged** `interior-01-1.4.0-9e1ea20da947` by site data / settings / slots / theme / assets / identity only — Template source hash identical
before and after, no new release, fixtures byte-identical, data-only swap PASS. NOT PASS because no AI portfolio image exists yet (no image-generation
capability in the agent environment): all 51 seats hold illustrated stand-ins; prompt pack + ingestion path are ready. Recorded Template limitations
(not fixed): price format `KRW … / 평` is Template-owned, `area.basis` is not rendered, banner CTA cannot target the portfolio index →
[`../result/recon-template-platform-step6-demo/00-summary.md`](../result/recon-template-platform-step6-demo/00-summary.md).

## Next

Accepted sequence (supersedes the earlier 3D→3G plan as the current next step):

```
0  Architecture acceptance                                                   DONE (2026-09-18)
1  Source JSON response body capture DEFAULT ON, explicit opt-out           DONE (2026-09-18)
2  Apartmentary bounded observation for home / portfolio list / portfolio detail only  DONE (2026-09-18)
3  Slice 1: minimum platform + one small Apartmentary section + one Template + several fictional Site Instances  DONE (2026-09-18)
4  Portfolio list + detail + pagination (on the SAME Template)                DONE (2026-09-18)
4.1 Portfolio filters (search / type / size / style / price / sort)          DONE (2026-09-18)
5  Complete Apartmentary v1 homepage Template (Full Homepage)                DONE (2026-09-19)
5.1 Whole-site Visual / UX Polish                                             DONE (2026-09-19)
5.2 Tiny Template Finalization (site-wide CTA, area basis contract)           DONE (2026-09-19)
6  Demo Customer Content Proof (customer-content replacement proof)          PARTIAL (2026-09-19) — data-only swap PASS; AI portfolio images WAITING (operator generation + approval)
6.1 Pre-Demo Gate (builder pinning/hardening, rollback runbook, full SEO QA)  ← NEXT (also: Step 6 images, price-format decision)
7  Second Template (first real measurement of repeatable authoring cost; widen abstractions only on evidence)
```

Step 2 scope (bounded gap filling, not a whole-site re-research; never claim the whole site is reproduced):
`/portfolio?page=0` and `?page=1` desktop + mobile Source Package / preservation evidence; ≥2 detail pages
per currently evidenced structural family; Faithful Clone/reference for those list/detail pages; navigation
destination mapping; header/footer logo rendering mechanism; relevant public JSON response structures once
Step 1 lands.

Step 2 result: `docs/result/apartmentary-comprehensive-observation/` (widened to a comprehensive page-family pass;
COMPLETE with named non-blocking exceptions; no implementation blocker; process note: the standard observer does not
block source view-count POSTs, see its `12` G15).

Earlier 3D→3G items: real public API capture is covered for evidence purposes by Steps 1–2. Real-data
runtime replay QA (3F) and preservation-adapter consolidation (3G) are **not scheduled** in the accepted
sequence; revisit only if the preservation layer itself needs them.

## Deferred

- **Second technology-stack proof: DEFERRED.** Test it when a later real source site requires another
  bootstrap model. Until then, no universal framework support is claimed; only `SSR_HYDRATION` on the
  Apartmentary build is proven.
- Generic production SSR adapter: not yet productized (candidate for 3G consolidation).
