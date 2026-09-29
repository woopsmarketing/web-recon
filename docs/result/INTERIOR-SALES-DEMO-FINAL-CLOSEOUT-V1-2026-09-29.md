# Interior Sales Demo Final Closeout V1 — 2026-09-29 (Track B)

Three customer-facing fixes, then a development freeze. Track B covers the footer disclosure and the
rollback guard. BoostChat covers the card labels; its report is
`boost-chat/docs/result/BOOSTCHAT-SALES-DEMO-FINAL-CLOSEOUT-V1-2026-09-29.md`.

```
FOOTER_DEMO_DISCLOSURE          = PASS
FOOTER_SCOPE                    = boost-interior-demo only
ROLLBACK_GUARD                  = PASS
KNOWN_19_RECORD_ROLLBACK_BLOCKED = YES (sabotage test with the real 19-record bytes; and the live pointer no longer names it)
LIVE_POINTER_WRITTEN_DURING_SABOTAGE = NO (put-spy: 0 writes of any kind)
FORWARD_REBUILD_RUNBOOK         = YES (sales-demo-final-closeout-v1/rollback-truth-runbook.md)
PRODUCTION_RECORD_COUNT         = 8 (bi-01 … bi-08, document 968afbcc…, unchanged bytes)
SYNTHETIC_CUSTOMER_FACING_RECORDS = 0 (11/11 synthetic slugs 404 live; old 19-record document 404)
WRONG_RECORD_MEDIA              = 0 (same document bytes as the data-truth release; production-truth 10/0)
NON_DEMO_SITE_CHANGED           = NO
TRACK_B_LIVE_PACKAGE            = b10d430b2da3d954e5d2b59f8baec8933583c2eb94f7a713e0a7670cb8699535 (build ddbc72ad…)
ROLLBACK TARGET (previous)      = 9d4036baeaa81ad4ec5c05eac230846a61267a2eb1a0c44b87b9a6e510f22819 (8 records)
```

## 1. Footer demo disclosure

`data/sites/boost-interior-demo/slots.json` → `site.footer.notice` (the interior-01 slot; no other site sets it):

| | text |
|---|---|
| before | 본 사이트는 서비스 시연을 위한 데모이며, 프로젝트 이미지·후기 등 일부 콘텐츠는 AI로 생성된 예시입니다. |
| after | 부스트 인테리어는 BoostChat 기능 시연을 위한 가상 인테리어 브랜드입니다. 포트폴리오·후기는 데모용 예시이고, 사진은 AI로 생성한 예시 이미지입니다. |

- The new notice states that the brand is fictional, that the cases and reviews are demo examples, and that the photos are AI-generated. "일부" is gone.
- The first draft said "포트폴리오·후기·이미지는 모두 데모용 예시 콘텐츠" and dropped the AI statement. The review flagged that as MAJOR, and it was fixed before publish. Every record photo is an AI demo asset (data-truth report §1).
- No template release was needed, because the slot has existed since 1.4.2. The site stays pinned to `interior-01@1.6.1`.
- Other copy is unchanged by owner decision. This includes the listing intro "부스트 인테리어가 계획하고 시공한 아파트 사례입니다".
- Tests: `predemo2` N1 checks every built page (9/0), and the smoke script constant was updated. The live check at 1440 px and 390 px found no overflow: `scrollWidth` 390 = `innerWidth`.

## 2. Rollback guard — production truth

`site:publish --rollback` → `rollbackHost` (`platform/publish/publish.ts`) now runs `assertRollbackPortfolioTruth`
between the seal check and the pointer write:

1. It looks for `_integration/manifest.json` in the seal. If there is none, the target is not portfolio-backed and nothing is checked; the loader is not called.
2. It reads the manifest and then the portfolio document it names. Each is size- and sha256-checked against the seal and parsed. Anything unreadable or mismatched is refused (fail closed).
3. It compares the target ids with the authoritative set. The CLI supplies that set lazily through `buildSiteSnapshot(mode public, at now)` → `snapshot.content.projects` ids. That is the same served set a fresh build emits.
4. Any extra id is refused with: `Rollback target would reintroduce portfolio records no longer present in current authoritative site data: 11 record id(s) served by target package 77cc7f9f47adda09… are not in data/sites/boost-interior-demo/content/projects.json (served at …): bi-09, …, bi-19 — routing pointer NOT written. …runbook…`
5. A missing loader or a loader error is also a refusal.
6. There is no bypass flag. Legitimate restores go source → new build → forward publish (runbook).

Tests are `platform/test/publish.test.ts` RT0–RT6, 66/0 in total:
- RT0: the served set is exactly bi-01…08.
- RT1 (sabotage): live = the real 8-record package, previous = the 19-record package sealed from the QA golden. The golden was checked byte-identical to build 71f7e5f3's `_integration/`. The rollback is refused, the pointer bytes are unchanged, and the put-spy counts 0 writes.
- RT2: the normal rollback between the two real 8-record builds, forward and back, still works.
- RT3: a proper subset passes.
- RT4: a missing or throwing loader is refused.
- RT5: a package without a manifest or without a portfolio resource passes, and the loader is not called.
- RT6: a corrupt or overwritten document, a missing manifest object, or non-string ids are refused.

**Second layer.** The forward publish below moved the pointer's `previous` from 77cc7f9f… (19 records) to 9d4036ba… (8 records). The 19-record package is no longer reachable by `--rollback` at all. No real rollback was run in production.

## 3. Production publish

| step | log (`sales-demo-final-closeout-v1/proof/`) | result |
|---|---|---|
| build | `11-site-build.log` | ddbc72ad… / packageHash b10d430b…; 8 records, document 968afbcc… (unchanged); only page html/txt differ from 9d4036ba… |
| dry-run `--check-store` | `30-publish-dry-run.log` | host serves 9d4036ba…; would upload 144; pointer write |
| upload `--no-activate` | `31-…log` | uploaded 144, verified 144, pointer not read or written |
| `--reverify` | `32-…log` | skipped-sealed, verified 144 |
| activate `--expect-live 9d4036ba… --expect-package b10d430b…` | `33-…log` | published, pointer written, previous = 9d4036ba… |
| live HTTP | `34-live-http-check.log` | all pages 200; footer = new text; manifest → 968afbcc…, 8 ids; 11/11 synthetic slugs 404; old document `856361f5…` 404; 13 sitemap locs; 0 pages with the old notice |

**Superseded package, inert.**
- The first build, f4605daa… (packageHash `ed388341e83905959490247db378a458b0d3c9cc274aa91a9ac7307a7aee7607`), had the draft notice. It was uploaded, sealed and reverified in R2 with `--no-activate`, and never activated.
- After the review changed the wording, I reset my own build output under `data/site-builds/boost-interior-demo` to HEAD and built once more. That kept `previous` = the live build 71a906c1… rather than the unpublished f4605daa….
- As a result, its line is not in `history.jsonl`. Its logs are kept as `*-superseded-*.log`.
- It is an unreferenced immutable object set in `boost-sites-artifacts`. No pointer names it.

## 4. Verification

| suite | result |
|---|---|
| publish | 66/0 |
| portfolio-production-truth | 10/0 |
| integration | 85/0 (1 point-in-time) |
| predemo2 / predemo | 9/0 · 10/0 |
| step6 | 34/0 |
| detail-facts | 25/0 |
| ia150 / ia151 / ia152 | 15/0 · 10/0 · 14/0 |
| slice1 | 86/0 |
| tsc -p platform | exit 0 |

The test maintenance followed the suites' own conventions, with no assertion removed or loosened.
- **Footer as a data delta.** The footer notice is the sixth deliberate data delta, `DEMO_FOOTER_NOTICE` in `portfolio-qa-corpus.ts`. B2 and Q1 revert exactly that field, prove it is the only delta, and land on the unchanged `_PRE_FOOTER` and `PRE_SPLIT_SNAPSHOT_HASH` anchors.
- **Rollout lineage (B2b).** Current = ddbc72ad…, previous = the data-truth build 71a906c1…. The pre-split 71f7e5f3… is retired by keep-2 and read from git `490c7dd`.
- **ia152 R2.** It now excludes the post-build publish surface (`publish-surface.ts`: `publish/**`, `cli/site-publish.ts`), as ia150 and step6 already did. The publish CLI never feeds a build, render or release.

## 5. Independent review (1 round, fresh context)

- BLOCKER 0.
- MAJOR 2, both fixed before publish:
  - the footer dropped the AI-image statement;
  - BoostChat's top label ignored style and unlisted trades (see the BoostChat report).
- MINOR, still open (not blocking by the brief):
  - **M1.** The guard's truth is the operator's working tree (`process.cwd()`). An invalid local site file refuses a legitimate rollback. An uncommitted local re-add of ids lets a bad one pass.
  - **M2.** The guard lives in this CLI only. The old `/Users/woops/projects/web-recon` copy of `site-publish.ts` and direct R2 writes do not have it.
    - That folder is non-authoritative (`AUTHORITATIVE_WORKTREE.md`).
    - The forward publish removes the only known bad target.
  - **M3.** Only integration-document ids are compared. Packages without `_integration`, such as preview builds and pre-integration packages, pass unchecked. A same-id record with older content passes.
- NIT:
  - The pointer is not re-read after the guard, which slightly widens the existing single-operator race window.
  - `--rollback` cannot be dry-run, so there is no way to preview the guard's verdict.

## 6. Commits (web-recon-track-b, not pushed)

- `5bc0517` fix(site): clarify interior demo disclosure
- `9bfbb13` fix(publish): guard portfolio rollback truth
- `dd3a20d` build(site): publish final interior sales demo package
- (this report's commit) docs(site): record sales demo final closeout

Also updated:
- `docs/status/interior-portfolio-v0.2.md`: the live and rollback state changed, and the milestone is closed.
- `docs/work/portfolio-experience-v1/05-sales-demo-safe-path.md`: the badge values are now what the path shows, confirmed on the production snapshot.

Not mine and left alone: `docs/result/static-deployment-foundation/proof/live-e2e.json` (untracked, pre-existing).

## 7. Time

Started 19:42 KST, finished about 20:35 KST (about 55 min).

What took longer than needed:
- **A second build/publish cycle (~8 min).** The review's footer MAJOR landed after the first package was uploaded, so the wording had to be rebuilt and republished.
- **Hash-anchor maintenance (~7 min).** Two passes were needed because B2's head anchor moved twice.
- **ia152.** The missing publish-surface exclusion only surfaced after the guard change.
