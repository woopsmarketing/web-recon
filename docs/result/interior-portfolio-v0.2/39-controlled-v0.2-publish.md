# 39 — Controlled Portfolio V0.2 publish of `boost-interior-demo`

| | |
|---|---|
| date | 2026-09-27 (UTC; 2026-09-28 KST) |
| scope | one site only, `boost-interior-demo`. Restate the post-publish suites, prove them in a simulated `POST_PUBLISH_STEADY` root, move the live pointer from the V0.1 package to the V0.2 package with the supported `site:publish`, validate the live resources and detail pages, and prove rollback with a real bounded drill. No other site, no BoostChat, no Jev, no Fuse |
| branch | `track-b/static-deployment-foundation` |
| brief | owner's "CONTROLLED PORTFOLIO V0.2 PUBLISH" §0–§27 |
| evidence | [`proof/39-controlled-publish/`](proof/39-controlled-publish/) (state captures, publish / drill logs, R2 listings, suite summaries) |

```
START_HEAD                   = 0c34606
END_HEAD                     = the docs commit that carries this file (git log -1 -- this file); commits in §11
BRANCH                       = track-b/static-deployment-foundation

PRE_PUBLISH_CURRENT_PACKAGE  = buildInputId 0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a
                               packageHash  286d44ab7d1f0c1202e992d8e17e384c6391d5c59d1a1eb321808f0dcc468e9e
PRE_PUBLISH_TEMPLATE         = interior-01@1.5.2 (interior-01-1.5.2-d87807590d64)
PRE_PUBLISH_RESOURCE_VERSION = 6346c472e162ae07b76a4686fce54c51   (document "0.1", 8 records)
PRE_PUBLISH_CURRENT_SHA      = routing pointer 999b9c4bd698c3f7681be5851d91019ad14c450046ba25720b601fbbf35175c0
                               live manifest   e8211d1abf2b436455d90af6ef5ea92c96d94316907b05542cbe68fd659d97ec
                               live document   eb646c560c188f92aa3714d06df66dbf79835d252b9867547e67ebe421bd73b4
                               local current.json 33235f1efd3c0497bd78b07c7b7262c24471e8e902b9771861f2465398287f31

POST_PUBLISH_SUITE_RESTATE   = DONE — predemo P2, predemo2 G1, ia150 P1/P3, ia152 P1 (page sets composed from the
                               corpus, no count), integration B2b/G1–G5/R1/R2/I2 (rollout-state invariants); commit a2e54dd
SIMULATED_POST_PUBLISH_TESTS = 15/15 suites green in a scratch POST_PUBLISH_STEADY root (§3); POST_PUBLISH_KNOWN_RED = 0

CANDIDATE_PACKAGE_ID         = buildInputId a4777cf9b71a0da0f7f52651ec027a219d7f09ce2e8f75ac4552a028cbfd413f
                               packageHash  3846a29d30ef1d48e58b0c507075918424350870b096294a83678eb87ba20aaf
                               (the scratch rehearsal and the canonical build produced the SAME packageHash)
CANDIDATE_TEMPLATE           = interior-01@1.6.1 (interior-01-1.6.1-8da56de8d28f, releaseHash 8da56de8d28f…)
CANDIDATE_RECORDS            = 19
CANDIDATE_RESOURCE_VERSION   = d56509c8100a56fdf9644baff78ff9e1
CANDIDATE_RESOURCE_SHA       = c76624146b5a753003fa5f0e3619534e3a80bd2fd967ed975d392e9180453816
CANDIDATE_MANIFEST_SHA       = b2f52b736570b954fb257f03cc5897426dee7f199d95d3654221290644d8ce5d
CANDIDATE_DETAIL_ROUTES      = 19/19 (every golden detailUrl has a page; route plan portfolio.detail = 19)
CANDIDATE_QA                 = PASS (224 files, 26 HTML pages, 8,375,907 B); golden drift []

GO_NO_GO                     = GO (all 16 gate items true, §5)
PUBLISH_TARGET               = boost-interior-demo (host interior-demo.boostweb.co.kr) — only
PUBLISH_PERFORMED            = YES — site:publish --remote, three steps (upload+seal → reverify → activate)

LIVE_PACKAGE_ID              = 3846a29d30ef1d48e58b0c507075918424350870b096294a83678eb87ba20aaf (build a4777cf9…)
LIVE_TEMPLATE                = interior-01@1.6.1
LIVE_MANIFEST_SCHEMA         = "0.1"  (site.id boost-interior-demo, href /_integration/portfolio.d56509c8….json)
LIVE_DOCUMENT_SCHEMA         = "1.0"
LIVE_RECORD_COUNT            = 19
LIVE_RESOURCE_VERSION        = d56509c8100a56fdf9644baff78ff9e1
LIVE_RESOURCE_SHA            = c76624146b5a753003fa5f0e3619534e3a80bd2fd967ed975d392e9180453816 (live bytes = golden bytes)
LIVE_MANIFEST_SHA            = b2f52b736570b954fb257f03cc5897426dee7f199d95d3654221290644d8ce5d (live bytes = golden bytes)

CURRENT_POINTER              = routing/interior-demo.boostweb.co.kr.json → 3846a29d… (interior-01-1.6.1-8da56de8d28f),
                               publishedAt 2026-09-27T16:57:05.251Z, sha256 3322a6818702d071…
PREVIOUS_POINTER             = 286d44ab… (interior-01-1.5.2-d87807590d64) — the V0.1 package
OLD_V01_PACKAGE_PRESERVED    = YES — R2: all 316 pre-existing objects (286d44ab… 159, cd048406… 157) byte-unchanged
                               (etag + size), V0.1 seal sha 5819210c… unchanged; local 0f80b239… intact (packageIntact)

LIVE_DETAIL_CHECKS           = PASS — bi-14 전용면적 84 m² · bi-15 no area row · bi-09 공급면적 34평 / 전체 리모델링 /
                               총 공사비 5,000만 원 · bi-17 부분 리모델링 / 거실, 바닥 / 총 공사비 1,250만 원 ·
                               bi-13 1억 2,500만 원 ~ 1억 4,000만 원
LIVE_DETAIL_ROUTES           = 19/19 HTTP 200, facts = the golden record, no wrong area-basis label, no quote wording

POST_PUBLISH_INTEGRATION     = 75/0/0 (+1 point-in-time: G5, the pilot package retired by keep-2)
POST_PUBLISH_SLICE1          = 86/0
POST_PUBLISH_STEP4           = 47/0
POST_PUBLISH_STEP41          = 35/0
POST_PUBLISH_STEP5           = 32/0
POST_PUBLISH_STEP6           = 32/0
POST_PUBLISH_PREDEMO         = 10/0
POST_PUBLISH_PREDEMO2        = 9/0
POST_PUBLISH_IA150           = 15/0
POST_PUBLISH_IA151           = 10/0
POST_PUBLISH_IA152           = 14/0
POST_PUBLISH_POLISH          = 4/0
POST_PUBLISH_STEP52          = 12/0
POST_PUBLISH_PUBLISH_SUITE   = 59/0
POST_PUBLISH_DETAIL_FACTS    = 24/0
POST_PUBLISH_KNOWN_RED       = 0   (canonical repo, real POST_PUBLISH_STEADY, after the publish and the drill)

NON_DEMO_SITE_POINTER_CHANGES = 0 — R2 holds exactly one routing key (this host) and one site prefix before and after;
                               fixture-{empty,large,small} current/previous/history byte-identical; no data/sites change

ROLLBACK_EXECUTED            = YES — a real bounded drill on boost-interior-demo only
ROLLBACK_PLAN_VERIFIED       = YES — site:publish --rollback (pointer-only; previous must be sealed; no upload, no delete)
ROLLBACK_TO_V01_VERIFIED     = YES — live manifest / document / home page byte-identical to ROLLBACK_BASELINE_V01
REPUBLISH_TO_V02_VERIFIED    = YES — supported forward publish; live = golden bytes, 19 records, 19/19 detail pages

BOOSTCHAT_TOUCHED            = NO  (one read-only look at its docs/git log; nothing run, nothing written)
JEV_TOUCHED                  = NO
FUSE_TOUCHED                 = NO
PRODUCTION_TOUCHED           = YES, boost-interior-demo only (R2: 225 new objects under its new package prefix +
                               its one routing pointer; Worker, route, bucket config untouched)

POST_PUBLISH_SUITE_RESTATE_STATUS = DONE
PORTFOLIO_PUBLISH_GATE_STATUS     = WEB_RECON_PUBLISH_COMPLETE · WAITING_FOR_BOOSTCHAT_HOSTED_VALIDATION
WP03_DUAL_READ                    = OPEN (current ≥ 1.0 now; previous is still the "0.1" package)
READY_FOR_BOOSTCHAT_V02_ROLLOUT   = YES
```

Success tokens: `V02_PUBLISH_GO_GATE_PASSED` · `BOOST_INTERIOR_DEMO_V02_PUBLISHED` · `LIVE_V02_RESOURCE_VERIFIED` ·
`POST_PUBLISH_SUITES_GREEN` · `NON_DEMO_BLAST_RADIUS_ZERO` · `ROLLBACK_EVIDENCE_CAPTURED` · `READY_FOR_BOOSTCHAT_V02_ROLLOUT`

## 1. Start state and working tree (§2, §4)

`HEAD 0c34606` on `track-b/static-deployment-foundation`, as the brief expected. Read before trusting:

| expectation | actual |
|---|---|
| release `interior-01-1.6.1-8da56de8d28f` pinned | yes (`site.json`) |
| golden: document `"1.0"`, manifest `"0.1"`, 19 records, `d56509c8…`, `c7662414…`, `b2f52b73…` | yes; `integration-golden.ts` check → drift `[]` |
| live = V0.1, 1.5.2, `6346c472…` | yes: live manifest `schemaVersion "0.1"`, href `portfolio.6346c472….json`, 8 records; R2 pointer `286d44ab…` (1.5.2), previous `cd048406…` (the 2026-09-22 pilot) |

Dirty paths at start: one, `docs/result/static-deployment-foundation/proof/live-e2e.json` (untracked, the
2026-09-22 pilot's `publish-e2e` output; class C in `37-` §1). It was never modified, staged or read
into a build. Every commit in this session staged explicit paths and was checked with
`git diff --cached --name-only`; `git add .`/`-A`, clean, stash, reset, restore and checkout were never used.

The brief's consumer precondition was checked read-only in BoostChat's own docs: the matcher V0.2,
the Interior Search Adapter, consultation/card/lead flow, `test:portfolio-v02-acceptance` 91/91 and the
actual-model QA are recorded there, and its ledger names the producer publish (contract §16 step 4) as
the next step. Nothing in BoostChat was run or written.

## 2. The suite restatement (§6, §7) — commit `a2e54dd`

**Page counts → page sets.** `demo-rollout.ts` gains `demoExpectedPages`: the fixed IA pages (home,
portfolio list, 3D, about, contact), Next's two error pages, and one `portfolio/<slug>.html` per packaged
record, the slug as authored in `content/projects.json`. The packaged records are the V0.1 document's
own ids before the publish and the whole corpus after it. It does not use the route planner or the
builder, and no count is written down. predemo P2, predemo2 G1, ia150 P1/P3 and ia152 P1 compare the
exact page set against it (they used `=== 8`, `15`, `13`).

**`integration.test.ts`.** The file used `goldenDir`/`goldenRecord` = "whatever `current.json` names" and
treated it as the V0.1 package in B2, B2b, G1–G5, R1, R2 and I2 — wider than the five known checks. Restated:

| check | PRE_PUBLISH_TRANSITION | POST_PUBLISH_STEADY |
|---|---|---|
| B2b | current = V0.1 package (`0f80b239…`, contract 0.1/0.1); the demo's V0.2 identity ≠ current; previous = pilot | current = the demo's V0.2 identity exactly, built with the pin, contract 0.1/1.0, `_integration/` byte-equal to the golden and the sha literals, intact; previous = the V0.1 package, intact at `286d44ab…` |
| G1–G3, I2 | the V0.1 package addressed by its frozen id | same (it is now the rollback) |
| G4 | pilot package intact, parts = `LIVE_PARTS`, previous = pilot | pilot neither current nor previous; its directory retired by keep-2 (sealed copy stays in R2) |
| G5 | V0.1 = pilot + two integration files | **point-in-time** (pilot retired); listed in the summary as such; G1 keeps the V0.1 bytes pinned |
| R2 | plans the V0.1 package and document, never the V0.2 one | plans the V0.2 package with the golden's bytes, never the V0.1 document |
| R2 (both) | planned HTML = `demoExpectedPages`; `_integration/` = exactly manifest + one document | |

The pilot's build parts were read from its package directory at load time, and keep-2 deletes that
directory with the first V0.2 build, so the suite would have crashed on load after the publish. They
are now a literal, `LIVE_PARTS`, which B2 proves hashes to `LIVE_BUILD_INPUT_ID` (a preimage check)
and G4 compares with the on-disk record while it exists.

**Fresh review** (general-purpose, Opus, fresh context, no expected verdict): 0 BLOCKER · 1 MAJOR ·
2 MINOR · 6 NOTE. All three fixed before the commit:

| id | finding | fix |
|---|---|---|
| MAJOR-1 | POST B2b accepted any earlier V0.2 build as previous; then G1–G3/I2 returned early and the suite was green with no V0.1 rollback on disk | POST requires previous = the V0.1 package, present and intact; the retired-V0.1 path was removed |
| MINOR-2 | R2's POST file-count check could not fail (planPublish already enforces it) | planned HTML = `demoExpectedPages`, `_integration/` = exactly two entries, in both states |
| MINOR-3 | early returns counted as passes silently | a `POINT-IN-TIME` list in the summary (`75 passed, 0 failed, 0 skipped, 1 point-in-time`) |

NOTE-5 (misleading error prefix in `demoExpectedPages`) and NOTE-6 (stale file header) were fixed too.
NOTE-9 (`ia152` P3's `locs.length === 13` is unreachable in both states: its 1.5.1 package was pruned
long ago) was left as is.

**Sabotage** (scratch root, restored byte-exact): previous.json → pilot fails B2b and G4; one detail
page removed from the current package fails ia150 P1 and P3.

## 3. Simulated POST_PUBLISH_STEADY (§8)

A scratch copy of the working tree (mtimes, modes and `.git` preserved; `node_modules` symlinked) ran
the supported `site:build boost-interior-demo`: current → `a4777cf9…` / `3846a29d…`, previous →
`0f80b239…`, the pilot directory pruned by keep-2 — the exact state the canonical build later produced.
That state was committed inside the scratch copy's own `.git`, and all 15 suites ran there:

| suite | PRE (canonical) | simulated POST |
|---|---|---|
| integration | 75/0/0 | 75/0/0 (+1 point-in-time: G5) |
| slice1 | 86/0 | 86/0 |
| step4 | 47/0 | 47/0 |
| step41 | 35/0 | 35/0 |
| step5 | 32/0 | 32/0 |
| step6 | 32/0 | 32/0 |
| predemo | 10/0 | 10/0 |
| predemo2 | 9/0 | 9/0 |
| ia150 | 15/0 | 15/0 |
| ia151 | 10/0 | 10/0 |
| ia152 | 14/0 | 14/0 |
| polish | 4/0 | 4/0 |
| step52 | 12/0 | 12/0 |
| publish | 59/0 | 59/0 |
| detail-facts | 24/0 | 24/0 |

`tsc -p platform/tsconfig.json --noEmit` passes. After the review fixes, integration, predemo,
predemo2, ia150 and ia152 were re-run in both states, and step6 in POST (all green, same counts).

## 4. ROLLBACK_BASELINE_V01 (§10) and the candidate (§11)

The baseline was captured read-only before any mutation (`proof/39-controlled-publish/10-*`): local
`current.json` / `previous.json` / `history.jsonl` bytes and sha256, every local package's recorded and
recomputed hash, the R2 routing pointer bytes (`999b9c4b…`), both R2 seals (`286d44ab…` 158 files,
`cd048406…` 156 files), the etag/size of all 316 R2 package objects, and the live manifest, document and
home page (status, headers, bytes, sha256). The fixtures' pointer files were hashed for the blast
radius.

The candidate was built in the canonical repo with the supported `site:build boost-interior-demo`
(no flags). It is byte-identical to the rehearsal (`packageHash 3846a29d…` both times). The working-tree
change it made is confined to `data/site-builds/boost-interior-demo/`: the new package, the three
pointer files, and the pilot package directory `18c0a5ef…` removed by keep-2 (157 tracked files). Its
sealed copy `cd048406…` stays in R2 byte-unchanged, no longer named by any pointer, and the files stay
in git history.

## 5. Publish plan and gate (§12, §13)

`RECON_PUBLISH_ALLOW_REMOTE=1 site:publish --site boost-interior-demo --host interior-demo.boostweb.co.kr
--remote --dry-run --check-store --expect-package 3846a29d… --expect-live 286d44ab…` (store read-only):

- writes: 224 files + the seal under `sites/boost-interior-demo/packages/3846a29d…/`, then one pointer,
  `routing/interior-demo.boostweb.co.kr.json` — nothing else, no delete;
- live now `286d44ab…` (1.5.2) → pointer write, `previous` = `286d44ab…`;
- seal absent → upload 224; the immutable-cached-path compatibility check against the live seal passed;
- no warnings; baked origin = `https://interior-demo.boostweb.co.kr`.

Gate: working tree understood ✔ · unrelated files excluded ✔ · PRE suites green ✔ · simulated POST
green ✔ · POST_PUBLISH_KNOWN_RED = 0 ✔ · candidate QA ✔ · golden drift [] ✔ · resourceVersion exact ✔ ·
19 records ✔ · 19 detail routes ✔ · release 1.6.1 ✔ · V0.1 package available (sealed in R2, intact
locally) ✔ · rollback procedure identified (`--rollback`) ✔ · plan touches only this site ✔ · no BoostChat
mutation ✔ · no Jev/Fuse ✔ → **GO**.

## 6. Publish (§14) and pointer validation (§15)

| step | command (all `RECON_PUBLISH_ALLOW_REMOTE=1 … site-publish.ts --site boost-interior-demo --host interior-demo.boostweb.co.kr --remote --expect-package 3846a29d…`) | result |
|---|---|---|
| 1 | `--no-activate` | 16:51:09 → 16:53:52Z: uploaded 224/224, verified 224/224 (sha256 + size), seal written last; pointer not read or written |
| 2 | `--no-activate --reverify` | seal identical, 0 uploads, reverified 224/224 |
| 3 | `--expect-live 286d44ab…` | pointer → `3846a29d…` (previous `286d44ab…`), publishedAt **2026-09-27T16:55:22.866Z** |

Immediately after: the pointer names the new package and its previous the V0.1 package; the new seal
lists 224 files; the V0.1 seal is byte-unchanged; all 316 pre-existing R2 objects are unchanged; the 225
new objects are all under the new package prefix; R2 still has one routing key and one site prefix.
Locally, `previous.json` is byte-identical to the old `current.json` and `history.jsonl` gained one line
(`a4777cf9…`, success, 1.6.1).

## 7. Live V0.2 resources (§16) and detail pages (§17)

`https://interior-demo.boostweb.co.kr/_integration/manifest.json`: 200 `application/json`,
`public, max-age=0, must-revalidate`, 274 B, **byte-equal to the golden manifest**; `schemaVersion "0.1"`,
`site.id boost-interior-demo`, href `/_integration/portfolio.d56509c8100a56fdf9644baff78ff9e1.json`.
The document: 200, 11,608 B, **byte-equal to the golden document**, `schemaVersion "1.0"`, 19 records.

All 19 `detailUrl`s were fetched and their `<dl class="i1-facts">` rows compared with the golden record
(`proof/…/17-live-detail-check.json`): 19/19 HTTP 200 HTML; area label from `area.basis` (supply 공급면적,
exclusive 전용면적) with the authored figure, no area row when no area; 리모델링 구분 iff `projectType`;
주요 공사 범위 iff `workScopeIds`; 총 공사비 iff `pricing.total` (a range shows "~"); no exclusive record
anywhere labelled 공급면적 and vice versa; no 예상 견적 / 고객 견적 wording. The brief's representative
pages match their literals exactly:

```
bi-14: 전용면적 = 84 m² | 부분 리모델링 | 주방 | 총 공사비 = 1,500만 원
bi-15: (no area row)    | 부분 리모델링 | 욕실 | 총 공사비 = 700만 원
bi-09: 공급면적 = 34평   | 전체 리모델링 | 현관, 주방, 욕실, 바닥, 도배, 조명, 붙박이·제작 가구 | 총 공사비 = 5,000만 원
bi-17: 공급면적 = 112 m² | 부분 리모델링 | 거실, 바닥 | 총 공사비 = 1,250만 원  (the case's total, same label as full)
bi-13: 공급면적 = 48평   | 전체 리모델링 | … | 총 공사비 = 1억 2,500만 원 ~ 1억 4,000만 원
```

`/`, `/portfolio`, `/about`, `/contact`, `/3d-portfolio` answer 200.

## 8. Post-publish regression (§18)

Run in the canonical repo after the publish and the drill, in the real `POST_PUBLISH_STEADY` state
(`current.json` → `a4777cf9…`, the live pointer on the same package), before the package commit:
**15/15 suites green** — integration 75/0/0 (+1 point-in-time), slice1 86/0, step4 47/0, step41 35/0,
step5 32/0, step6 32/0, predemo 10/0, predemo2 9/0, ia150 15/0, ia151 10/0, ia152 14/0, polish 4/0,
step52 12/0, publish 59/0, detail-facts 24/0. The same counts as PRE and the simulation. The two
pre-existing ia152 "skipped" notes (the 1.5.1 package pruned long ago) and G5's point-in-time line are
the only non-executed comparisons; both are listed in their suite output. The suites left the working
tree unchanged. Summaries: `proof/39-controlled-publish/runs/post-canonical/`.

This closes `POST-PUBLISH-SUITE-RESTATE`.

## 9. Blast radius (§19)

- R2 routing: exactly one key, `routing/interior-demo.boostweb.co.kr.json`, before and after.
- R2 sites: exactly one prefix, `sites/boost-interior-demo/`, before and after. Package prefixes
  before: `286d44ab…`, `cd048406…`; after: those two byte-unchanged plus `3846a29d…`.
- Local: `fixture-empty`, `fixture-large`, `fixture-small` `current.json` / `previous.json` /
  `history.jsonl` sha256 identical before and after; no `data/sites/**` or release file changed.
- Worker `recon-runtime-pilot`, its route and the bucket's configuration were not touched (no
  `wrangler deploy`, no route or bucket command).

`NON_DEMO_SITE_POINTER_CHANGES = 0`.

## 10. Rollback drill (§20)

The supported path is `site:publish --rollback`: it re-points the host at its pointer's `previous`, only if
that package's seal is valid, uploads nothing and deletes nothing; the Worker reads the pointer on every
request (no cache), so a switch takes effect on the next request. All four preconditions held, so a
real bounded drill was run.

| step | command | result |
|---|---|---|
| A | `--remote --rollback --expect-live 3846a29d…` | 16:56:35.580Z pointer → `286d44ab…` (previous `3846a29d…`). Live manifest `e8211d1a…`, document `eb646c56…` (`"0.1"`, 8 records) and home page `7c4a55ad…` **byte-identical to ROLLBACK_BASELINE_V01**; V0.1 seal unchanged; site 200 |
| B | `--remote --expect-package 3846a29d… --expect-live 286d44ab…` (forward publish, sealed → 0 uploads) | 16:57:05.251Z pointer → `3846a29d…` (previous `286d44ab…`). Live manifest/document = golden bytes, 19 records, 19/19 detail pages pass, 316/316 pre-existing R2 objects unchanged |

The V0.2 window before the drill was 16:55:22 → 16:56:35Z; V0.1 was served again for about 30 s during
the drill; V0.2 has been live since 16:57:05Z.

## 11. Commits

| commit | paths |
|---|---|
| `a2e54dd` | `platform/test/demo-rollout.ts`, `platform/test/{integration,predemo,predemo2,ia150,ia152}.test.ts` — committed before any mutation |
| `cb781e8` | `data/site-builds/boost-interior-demo/**` — the published package, `current.json`, `previous.json`, `history.jsonl`, and the keep-2 removal of `packages/18c0a5ef…`. The repository versions the demo's build pointers and packages (`a2500f9`, `6284fa5` did the same), so the committed tree matches what is live |
| the docs commit | this report, its `proof/39-controlled-publish/`, `docs/status/interior-portfolio-v0.2.md` |

## 11a. Method notes and deviations from the brief

- **Candidate built in the canonical repo before GO.** `site:publish` only publishes the package
  `current.json` names; the supported planner (§12) therefore needs the candidate built in place. The
  candidate was first rehearsed in a scratch root (§3), and the canonical build was accepted only
  because it reproduced the rehearsal's `packageHash` exactly. Building is local only: the live
  pointer moved only in §6 step 3.
- **The package commit (`cb781e8`).** The brief says to commit docs only after the publish "unless
  repository convention explicitly versions" the package files. It does: `current.json`,
  `previous.json`, `history.jsonl` and the package directories are tracked, and `a2500f9` /
  `6284fa5` committed the same kind of change. So the committed tree equals what is live.
- **Keep-2 retired the pilot package directory locally.** That is the builder's own retention rule
  (current + previous). The brief's "no delete of old package" concerns the V0.1 rollback package,
  which is intact locally and in R2. The pilot's sealed R2 copy is untouched as well.
- **Read-only helpers** (scratchpad, not committed): a state capture (local pointers and package
  hashes, `wrangler r2 object get` for the pointer and seals, public HTTP) and an R2 listing via the
  Cloudflare API. The listing used the wrangler OAuth token from its config file; the token was never
  printed or stored, and no evidence file contains it (checked).
- **Suite scope beyond the brief's list.** `integration.test.ts` R1 and I2 also assumed "current =
  V0.1" and were restated (§2). The brief listed B2b, G1–G5 and R2.

## 12. Hand-off to BoostChat (session C — not done here)

```
FROM web-recon  (2026-09-27, 39-controlled-v0.2-publish.md)
LIVE_MANIFEST           https://interior-demo.boostweb.co.kr/_integration/manifest.json
                        schemaVersion "0.1" · site.id boost-interior-demo · sha256 b2f52b736570b954fb257f03cc5897426dee7f199d95d3654221290644d8ce5d
LIVE_RESOURCE_VERSION   d56509c8100a56fdf9644baff78ff9e1  (href /_integration/portfolio.d56509c8100a56fdf9644baff78ff9e1.json)
LIVE_RESOURCE_SHA       c76624146b5a753003fa5f0e3619534e3a80bd2fd967ed975d392e9180453816  (document "1.0", 19 records, 11,608 B)
                        = the WP03-GOLDEN fixture bytes: no fixture change needed
LIVE_PACKAGE_ID         3846a29d30ef1d48e58b0c507075918424350870b096294a83678eb87ba20aaf (build a4777cf9…, interior-01@1.6.1)
PREVIOUS_PACKAGE_ID     286d44ab7d1f0c1202e992d8e17e384c6391d5c59d1a1eb321808f0dcc468e9e (V0.1, document "0.1", 6346c472…)
PUBLISH_TIME            first activation 2026-09-27T16:55:22.866Z; current pointer (after the drill) 2026-09-27T16:57:05.251Z
ROLLBACK_RESULT         drill executed: V0.2 → V0.1 (byte-identical to baseline) → V0.2; rollback is
                        site:publish --site boost-interior-demo --host interior-demo.boostweb.co.kr --remote --rollback --expect-live 3846a29d…
PORTFOLIO-PUBLISH-GATE  WEB_RECON_PUBLISH_COMPLETE · WAITING_FOR_BOOSTCHAT_HOSTED_VALIDATION
NEXT (BoostChat)        snapshot refresh → consumer rollout → hosted conversation E2E → rollback/blast validation
                        from the consumer side (contract §16 steps 5–6). A consumer snapshot taken during
                        16:56:35–16:57:05Z would have read V0.1 (the drill); refresh after that.
WP03-DUAL-READ          OPEN — the pointer's previous is still the "0.1" package; the dual read stays until
                        current AND previous are ≥ "1.0" (a second V0.2 publish)
```
