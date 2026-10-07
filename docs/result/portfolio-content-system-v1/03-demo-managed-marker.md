# Portfolio Content System V1 — demo 도입 마커 확정 (`portfolio.source.json`)

작성: 2026-10-07 · 브랜치 `track-b/static-deployment-foundation` · commit `4cd3c50`(마커 + test) · 운영 접촉 없음(publish · deploy · R2 · routing pointer · BoostChat DB · LaunchAgent 모두 건드리지 않음) · push 없음

```
MANAGED_MARKER               = PASS
STALE_MANUAL_BUILD_BLOCKED   = PASS
STALE_MANUAL_PUBLISH_BLOCKED = PASS
PUBLISHER_FLOW_UNAFFECTED    = PASS
NON_MANAGED_SITES_UNAFFECTED = PASS
TRACK_B_TYPECHECK            = PASS
TRACK_B_TESTS                = PASS
PRODUCTION_CHANGED           = NO
LAUNCH_AGENT_TOUCHED         = NO
OLD_WEB_RECON_USED           = NO
PUSHED                       = NO
```

## 1. 무엇을 했나

`data/sites/boost-interior-demo/portfolio.source.json` 을 commit 했다. 내용은 기존 계약 그대로다(`platform/portfolio-sync/managed.ts` 의 `SOURCE_MARKER_TEXT` 로 생성 — `site:portfolio-sync --adopt` 가 쓰는 것과 같은 바이트).

```json
{
  "schema": "portfolio-source@1",
  "managedBy": "boostchat"
}
```

- 새 마커 형식 없음. production 코드(`platform/` 의 test 밖) 변경 없음. demo 전용 분기 없음.
- `content/projects.json` · `content/categories.json` · 이미지 · `data/site-builds/` 변경 없음. 운영 managed 데이터를 git 에 복사하지 않았다.
- `portfolio.managed.json` 을 만들지 않았다. 이 checkout 에는 마커만 있다.

## 2. 마커의 의미와 막는 사고

마커 = "이 사이트의 포트폴리오는 BoostChat 이 소유한다. commit 된 `projects.json` 은 원본이 아니다."

운영 사이트(`interior-demo.boostweb.co.kr`)는 2026-10-06 부터 BoostChat DB 에서 생성된다. 고객이 Admin 에서 사례를 추가 · 수정 · 내리면 publisher 전용 checkout 만 갱신되고, 이 개발 checkout 의 `projects.json` 은 2026-10-06 시점 그대로 남는다. 마커가 없으면 누군가 여기서 `site:build` → `site:publish --remote` 를 실행해 **옛 8건으로 운영 사이트를 덮어쓸 수 있었다**(새 사례가 사라지고 내린 사례가 다시 공개된다). 이제는:

| 경로 (개발 checkout: 마커 있음 · sidecar 없음) | 결과 | 막는 곳 |
| --- | --- | --- |
| `pnpm site:build boost-interior-demo` (`--force` 포함) | exit 1, package 미생성 | `platform/site/load.ts` → `managedPortfolioProblems` |
| `pnpm site:publish --site boost-interior-demo …` (`--local`/`--remote`, `--no-activate`, `--allow-site-change`, `--expect-package` 무관) | exit 2, store 접근 전 | `platform/cli/site-publish.ts` — 마커만 보고 거부(손으로 만든 sidecar 로도 열리지 않음) |
| `site:publish --rollback` | 로더가 거부 → rollback 실패(fail closed) | portfolio-truth guard (`publish.ts`) |
| `site:publish --dry-run` | 허용(오프라인, 쓰기 불가) | 설계 |
| `site:portfolio-sync` | BoostChat export 로만 생성 · 배포 | 정상 경로 |

실제 실행 기록: `proof/demo-managed-marker/dev-checkout-guard.txt` (build 2회 exit 1, publish 2회 exit 2, 전후 `git status` · `data/site-builds` 파일 수 · `current.json` 동일, `tmp/recon-runtime-state` 생성 안 됨, 마커 없는 `fixture-small` 은 `up-to-date`).
`--remote` 는 지시대로 실행하지 않았다. 마커 검사는 `--local`/`--remote` 분기보다 앞에 있고 store 를 만들기 전에 끝난다(`site-publish.ts:92–104` → store 생성 `:107`).

## 3. 테스트 정리

마커를 넣자 예측대로 10개 파일이 깨졌다(사전 정적 분석 = 사전 실행 결과 일치). guard 는 건드리지 않고 test 만 고쳤다.

| 분류 | 파일 | 처리 |
| --- | --- | --- |
| A. guard 자체 | `portfolio-sync.test.ts` L3 · M1, `publish.test.ts` P14 | L3: 도입 사이트는 "unmanaged" 목록에서 빼고, sidecar 없으면 guard 가 정확히 그 문제를 보고하는지 + demo 가 도입돼 있는지 검증. M1: 바이트 비교에서 마커 한 파일만 제외. P14: usage error 7건에 각자의 오류 메시지를 요구(마커 거부에 가려지지 않게) + **실제 demo 의 수동 publish 거부** 검사 추가 |
| B. frozen production truth | `portfolio-production-truth.test.ts`, `integration.test.ts` V1, `detail-facts.test.ts` LIVE | 리터럴 pin 은 원래대로 frozen fixture. `[live]` 검사는 live 디렉터리가 dataset 인 checkout 에서는 그대로, 마커만 있는 checkout 에서는 **거부를 검증**(production-truth LVA: 로더 + 실제 build 거부 + package 미생성). LV1 에 commit 된 마커의 바이트 pin 추가 |
| C. demo 를 "build 되는 사이트" 로 쓰는 일반 test | `step6`, `inquiry162`, `inquiry163`, `inquiry163-browser`, `publish`(served set), `publish-e2e` | live 디렉터리 대신 frozen composition(`frozenDemoRoot` / 새 helper `testSiteRoot`)으로 읽음. assertion 변경 없음 |
| 공용 helper | `demo-frozen-dataset.ts` | `live.adopted` · `live.dataset`, `NOT_GENERATED`, `testSiteRoot` 추가 |

삭제 · skip 한 assertion 없음. production-truth 는 13 → 12 로 보인다: 이 checkout 에서는 LV2 · LV3(live 디렉터리를 load 해야 하는 2건)이 실행될 수 없고 대신 LVA 1건이 거부를 검증한다. sidecar 가 있는 checkout 에서는 LV2 · LV3/LB 가 그대로 실행된다.

## 4. 검증 결과 (마커 commit 상태, 2026-10-07)

| 항목 | 결과 | 마커 전 baseline |
| --- | --- | --- |
| typecheck (`tsc --noEmit`) · `typecheck:platform` · `typecheck:runtime` | exit 0 · 0 · 0 | — |
| `test:portfolio-sync` | 40 passed / `--e2e` 43 passed | 40 |
| `test:integration` | 85 passed (+1 point-in-time) | 85 |
| `test:publish` | 67 passed (+1 = 도입 demo 거부 검사) | 66 |
| `portfolio-production-truth` | 12 passed (위 설명) | 13 |
| `detail-facts` | 26 passed | 26 |
| 추가 영향 suite: `step6` 34 · `inquiry162` 28 · `inquiry163` 29 · `inquiry163-browser` 62 · `publish-e2e` 47 (+1 skip: 기존 live-mode 항목) | 0 failed | — |
| `test:platform` 체인의 나머지(마커 파일이 scan 에 걸리지 않는지): `slice1` 86 · `step4` 47 · `step41` 35 · `step5` 32 · `polish` 4 · `step52` 12 · `predemo` 10 · `predemo2` 9 · `ia150` 15 · `ia151` 10 · `ia152` 14 · `inquiry163-reuse` 8 | 0 failed | — |

시나리오 대응: 1(stale build 차단) = §2 실행 기록 + production-truth LVA · 2(수동 publish 차단) = §2 실행 기록 + publish P14 + portfolio-sync F2 · 3(publisher flow) = portfolio-sync 40/43(F2 도입 흐름, M1 demo 무손실 재생성, e2e 실제 build + 로컬 publish) + 운영 publisher 무변경(같은 pid, `nothing-to-do` 계속) · 4(마커 없는 사이트) = portfolio-sync L3(fixture 4개의 buildInputId = current package) + `site:build fixture-small` up-to-date + fixture suite 전부.

## 5. 독립 리뷰 (fresh context, 결론 미제시)

| severity | 내용 | 조치 |
| --- | --- | --- |
| MAJOR | `publish.test.ts` P14 usage error 3건(`--check-store` 단독, `--remote` env gate, `--no-activate --expect-live`)이 마커 거부(exit 2)에 가려져 더는 실패할 수 없음 | **수정**: 케이스별 stderr 메시지 요구 + 도입 demo 거부 검사 추가 |
| MINOR | production-truth LV1 에 넣은 검사가 동어반복 | **수정**(내가 넣은 줄): commit 된 마커의 바이트 pin 으로 교체 |
| MINOR/NOTE 나머지 | 아래 KNOWN_ISSUES | 기록 |

리뷰가 확인한 것: 마커 = `SOURCE_MARKER_TEXT` 와 동일 바이트 · production 코드에 사이트 전용 분기 없음 · 가짜 sidecar 없음 · 삭제/skip 된 assertion 없음 · guard 계약(F2)은 실제 로더 · build · CLI 로 계속 검증됨.

## 6. KNOWN_ISSUES (이번 작업분, 고치지 않음)

1. guard 는 **실수**를 막는다. 마커 commit 이 없는 옛 branch/checkout, 마커를 지운 checkout, `wrangler r2 object put` 직접 실행, 가짜 BoostChat(`BOOSTCHAT_BASE_URL`)을 향한 `site:portfolio-sync --remote` 같은 의도적 우회는 막지 못한다. `publishSite` 라이브러리 함수 자체에는 마커 검사가 없다(sync 가 쓰는 경로).
2. `.gitignore` 가 `data/sites/**` 를 전부 포함하므로 개발 checkout 에서 `--generate-only` 뒤 `git add -A` 를 하면 sidecar · 생성 파일이 commit 될 수 있다(런북 §8.1 에 주의 문구 추가). ignore 규칙은 넣지 않았다 — publisher checkout 정책(§9)과 함께 Phase 2 에서 정리.
3. 오류 메시지의 안내(`site:portfolio-sync … --force [--remote]`)는 publisher checkout 기준이다. 개발 checkout 에서는 `--generate-only` 가 맞다(런북 §8.1 에 명시, 코드 문구는 그대로).
4. `site:publish --rollback` 은 마커로 막지 않는다. 생성물이 없는 checkout 에서는 로더가 거부해 실패하지만, 예전에 생성해 둔 checkout 은 그 시점 목록을 진실로 본다 → rollback 은 publisher checkout 에서 방금 sync 된 상태로만(런북 §8.1).
5. `platform/cli/integration-golden.ts`(npm script 없음)는 live demo 를 로더로 읽는다 → 개발 checkout 에서는 이제 거부된다. golden 을 다시 만들 일이 생기면 입력을 frozen dataset 으로 정해야 한다.
6. 도입 이후 도달할 수 없게 된 분기: `if (live && identical)` 형태의 "live = frozen composition" 비교 3곳(production-truth LV1, integration V1, detail-facts LIVE). 지우지 않았다(assertion 삭제 금지). 바이트 동일성은 `identical || managed` 검사가 계속 지킨다.
7. `step6` 의 QA corpus 합성(`composeQaProjectsText(repoRoot)`)은 commit 된 live `projects.json` 을 plain read 한다(지금은 frozen 과 같은 바이트). 개발 checkout 에서 `--generate-only` 를 한 상태로 step6 을 돌리면 어긋난다.
8. `platform/test/demo-rollout.ts` 는 `PRE_PUBLISH_TRANSITION` 분기에서만 live demo 를 로더로 읽는다(지금은 steady 라 도달하지 않음). 다음 template re-pin 때 tracked demo package 를 어떻게 갱신할지(개발 checkout 에서 demo build 불가)는 정해지지 않았다 — Phase 2 "managed 데이터와 build 산출물을 git tree 밖으로".
9. publisher 전용 checkout(detached `8e1b06f`)은 이 commit 을 받지 않았다(변경 금지 지시). 받지 않아도 동작에는 영향이 없다. 받으면 그 checkout 에서도 수동 `site:publish` 가 거부된다.

## 7. 변경 파일

- 추가: `data/sites/boost-interior-demo/portfolio.source.json`
- test: `platform/test/demo-frozen-dataset.ts`, `portfolio-production-truth.test.ts`, `integration.test.ts`, `detail-facts.test.ts`, `portfolio-sync.test.ts`, `publish.test.ts`, `publish-e2e.test.ts`, `step6.test.ts`, `inquiry162.test.ts`, `inquiry163.test.ts`, `inquiry163-browser.test.ts`
- 문서: 이 문서, `01-publisher-runbook.md`(§8.1 · §9), `00-summary.md`(F2 한 줄), `02-production-first-run.md`(항목 3 닫힘), `proof/demo-managed-marker/dev-checkout-guard.txt`

작업 시간 내역은 BoostChat 쪽 `docs/reports/portfolio-cms/11-demo-managed-marker.md` 에 있다.
