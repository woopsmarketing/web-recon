# Intro Media Visibility — Forensic Summary (2026-09-17)

Scope: "기대와 설렘이 가득한 리모델링 경험" left visual, apartmentary.com `/`. Forensic only — no fix.

| Question | Answer |
|---|---|
| INTRO MEDIA TYPE | `<video muted loop autoplay playsInline>` + one `<source type=video/mp4>`, no poster (webpack module 1251, `video:!0` from homepage) |
| SOURCE URL | `https://apartmentary-static.s3.ap-northeast-2.amazonaws.com/main-introduce.mp4` |
| MAIN-INTRODUCE.MP4 SAME MEDIA | **YES** — source literal + DOM + parser initiator + asset↔request join + 1020×1400 decode matching 510×700 box |
| PHASE 1 BODY CAPTURED | **NO** — metadata only (`skipped-by-policy`, `bodyPolicy.media=false`); no local file |
| PHASE 2 CURRENT VISIBILITY | Artifact unchanged; visible when opened with network (repro arm A), blank under fail-closed/CSP (repro arm B, Strategy A "baseline") |
| PAST PHASE 2 VISIBILITY | **PROVEN** — `docs/result/source-preservation-phase2/screenshots/desktop-full.png`, `mobile-full.png` |
| WHY VISIBLE BEFORE | `preserve:sanity` / `preserve:preview` have no route guard or CSP → S3 206 → frames decoded |
| WHY MISSING NOW | the "Phase 2 Baseline" shown now is Strategy A's fail-closed screenshot; A/B/QA-viewer block S3 → readyState 0, no poster → empty 510×322 box |
| RESPONSIVE INTENT | video at all widths; ≥900 (md) row with video left; <900 column with video above text |
| PRIMARY VERDICT | `INTRO_MEDIA_REMOTE_DEPENDENCY_WORKED_ONLY_WHEN_NETWORK_AVAILABLE` |
| FIX NEEDED LATER | YES |
| BASELINES MODIFIED | NO |
| GIT COMMIT/PUSH | NO |

Reports: 01 source component · 02 Phase 1 capture · 03 Phase 2 history + repro · 04 Strategy B · 05 root cause.
New files only: this directory (incl. `repro/`) and `tmp/source-preservation-intro-media-forensic/repro.mts`.
Network contact: only the single S3 MP4 (repro arms A); no APIs, no trackers.
