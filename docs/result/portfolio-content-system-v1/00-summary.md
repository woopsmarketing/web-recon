# Portfolio Content System V1 — WP-T1 (Track B consumer / publisher) 요약

작성: 2026-10-06 · 브랜치 `track-b/static-deployment-foundation` · commit/push 없음 · 운영 접촉 없음

## 1. 무엇을 만들었나

BoostChat 이 포트폴리오 원본을 소유하고, 이 저장소는 export 를 받아 사이트 파일을 **결정적으로 재생성 → 기존 build → 기존 publish → 공개 URL 검증 → 결과 보고** 한다.
플랫폼 공용 기능이며 `boost-interior-demo` 전용 분기는 없다. 템플릿(`templates/interior-01`) 변경 없음, 새 npm 의존성 없음, 새 배포 경로 없음.

| 항목 | 파일 | 내용 |
| --- | --- | --- |
| A. 생성기 | `platform/portfolio-sync/generate.ts`, `managed.ts`, `contract.ts` | 순수 함수 `planManagedPortfolio` (export + asset bytes + 사이트 상태 → 파일 계획), `validatePlanStaged` (임시 복사본에서 실제 로더로 검증), `applyFilePlan` / `restoreAppliedPlan` |
| B. 로더 guard | `platform/site/load.ts` (+3줄), `managed.ts` | sidecar 가 있는 사이트는 생성 파일 sha256 이 일치해야 로드됨. sidecar 없는 사이트는 동작/해시 변화 없음 |
| C. Publisher CLI | `platform/cli/site-portfolio-sync.ts`, `platform/portfolio-sync/{client,verify,sync}.ts` | `pnpm site:portfolio-sync` (`--once`/`--watch`/`--dry-run`/`--from-file`/`--local`/`--remote`) |
| D. 테스트 | `platform/test/portfolio-sync.test.ts` | `pnpm test:portfolio-sync` (37 checks, 네트워크/Cloudflare 없음) + opt-in `--e2e` 3 checks (실제 build + MemoryStore + runtime handler) |
| E. data-truth pin | `platform/test/demo-frozen-dataset.ts`, `platform/test/fixtures/boost-interior-demo-frozen/`, `platform/test/portfolio-sync-surface.ts` | 3개 테스트의 리터럴 pin 을 frozen dataset 으로 옮기고 live 디렉터리용 일반 검사 추가 |
| F. 문서 | `01-publisher-runbook.md`, 이 문서 | |

`package.json`: `site:portfolio-sync`, `test:portfolio-sync` 추가.

## 2. 소유권 모델

- **Sidecar**: `data/sites/<siteId>/portfolio.managed.json` (`managed-portfolio@1`)
  `{ schema, notice, source{schema, siteId, revision}, content[{path, sha256, size}], assets[{id, file, mediaType, width, height, sha256, size}], retired[{id, slug}] }`
- **이미지 위치**: 기존 그대로 `assets/<export 의 file 이름>` + 공유 `assets/registry.json`. 생성 항목이 id 순으로 앞, site-level 항목은 저장된 순서/내용 그대로 뒤.
- **이유**: sidecar 는 site snapshot 에 들어가지 않으므로 해시가 변하지 않는다(무손실 전환). 디렉터리/registry 를 나누지 않아 템플릿·로더·빌드 경로가 그대로다.
  생성기는 **sidecar 에 적힌 파일만** 지우거나 덮어쓴다. site-level id/파일과의 충돌, sidecar 가 모르는 디스크 파일, `registry.json` 예약명은 모두 fail-closed.
- **첫 전환**: export 가 이름을 댄 id 중 기존 `projects.json` 만 참조하던 항목만 인수(adopt). 배너/슬롯/로고가 같이 쓰는 id 는 충돌로 거부. export 에 없는 기존 포트폴리오 이미지는 지우지 않고 site-level 로 남긴다.
- **결정성**: 타임스탬프 없음, 프로젝트 id 정렬, `JSON.stringify(doc, null, 2) + "\n"`. 같은 export → 바이트 동일 → 같은 `siteSnapshotHash` / `buildInputId`.
- `retired[{id, slug}]` (follow-up 에서 변경): 레코드가 export 에서 **빠지는 순간** 기록된다 — 이전 `projects.json` 에 있던 id(첫 managed 실행에서는 손으로 만든 파일), 이전 `retired`, export 의 `changes.removing` 중 현재 export 에 없는 것 전부. slug 는 export 값 우선, 없으면 이전 레코드의 slug.
  **같은 id 가 다시 게시될 때만** 빠진다(그 전까지 유지). 로더는 이 목록을 "알려졌지만 서빙되지 않는 id" 로 취급한다(4절). snapshot 에는 들어가지 않는다.
- 부재 검증은 `retired` 가 아니라 export 의 `changes.removing[{id, slug}]` 를 그대로 쓴다(워킹트리 이력에 의존하지 않음).

## 3. 거부(fail closed) 목록 — 모두 테스트 G6/G6b/G7/G8

unknown `schema` · `site.siteId` ≠ 대상 · `site.publicOrigin` ≠ site.json (P5) · asset sha256/size 불일치 · magic byte 가 mediaType 과 다름 ·
`ProjectSchema` 위반 · `status` ≠ published (P1) · 정의되지 않은 category (P2) · 참조 asset 누락 / 잉여 asset (P3) · id·slug·asset id·file 중복 ·
`changes.removing ∩ projects` · `changes.removing` 항목 형식 오류(bare id, slug 누락/형식 위반, 추가 key)·id 중복 · site-level id/파일 충돌 · 재생성된 사이트가 실제 로더로 로드되지 않음 · 아직 서빙되지 않을(미래 publishedAt) 레코드.

## 4. 삭제된 프로젝트를 사이트 설정이 가리킬 때 (테스트 L4, L5, T1, G8, e2e E3)

- **배너 CTA → retired id (managed 사이트)**: 로드 성공, CTA 만 숨김. `platform/site/load.ts:174-184` 가 `storedProjectIds` 와 sidecar `retired[]` 둘 다에 없는 id 만 오타로 실패시킨다.
  렌더 경로는 템플릿 변경 없이 draft 와 같은 분기를 탄다: `templates/interior-01/v1/sections/homeHeroData.ts:34-36` (manual 선택 1건 조회 → `hit[0]` 없음 → `cta` 미설정),
  조회는 `platform/content/reader.ts:120-130` (없는 id → `manual-id-missing`, 건너뜀). L4 는 실제 템플릿 `homeHero()` 로, E3 는 실제 빌드된 home HTML 로 확인.
- **배너 CTA → 저장된 적도 retired 된 적도 없는 id**: 여전히 로드 실패(`CTA targets unknown project`) → sync 는 `failed`/`generate`, 아무것도 쓰지 않음.
- **unmanaged 사이트**: sidecar 가 없으므로 기존과 동일(L5). retired 유무는 snapshot hash 에 영향 없음(L5, M1, L3).
- **settings.json manual 선택 id** → 경고 `manual-id-missing` 후 건너뜀: `platform/content/reader.ts:120-130`.

## 5. 무손실 전환 증명 (테스트 M1)

현재 `data/sites/boost-interior-demo` 데이터셋으로 export 를 만들어 임시 복사본에 생성:
`projects.json` 바이트 동일, `categories.json` deep-equal(포맷만 정규화), 달라진 파일은 `content/categories.json` + 새 `portfolio.managed.json` 뿐,
site-level asset·registry.json·그 밖의 모든 파일 불변, 44개 이미지 제자리 인수, `siteSnapshotHash`·`buildInputId`·manifest/문서 바이트 동일,
Portfolio Document version **`968afbccb944940d8d3c099dd54df5be`** (운영 pin) 유지. 두 번째 실행은 계획 0.

## 6. E — 리터럴 pin 처리

- `platform/test/fixtures/boost-interior-demo-frozen/` = 2026-10-06 포트폴리오(projects/categories, 44 이미지, 해당 registry 항목; 4.7 MB). sha256 을 `demo-frozen-dataset.ts` 가 리터럴로 고정.
- `frozenDemoRoot()` = **live 사이트 디렉터리 복사본 + frozen 포트폴리오**. site.json/settings/slots/배너/site-level asset 은 live 그대로라 re-pin·카피 변경은 예전처럼 리터럴을 움직인다.
- `portfolio-production-truth.test.ts`, `integration.test.ts`, `detail-facts.test.ts`: demo 입력과 throwaway root 의 원본을 frozen 구성으로 교체. **기존 assertion 은 하나도 삭제/약화하지 않았다** (식/리터럴 동일, 읽는 원본만 변경).
- 추가된 live 검사: production-truth `LV1`(live = frozen 바이트 동일 **또는** sidecar 일관성 있는 managed; 합성 fixture id/slug/title 누출 없음; 서빙 레코드 = 파일 레코드; 동일할 때 siteSnapshotHash·buildInputId 일치), `LV2`(emission 검증, 누출 없음, media 소유권), `LV3`(live ≠ frozen 이면 live 의 실제 빌드에 B0–B2 와 같은 링크/sitemap/누출 검사 실행), integration `V1`(live emission 검증), detail-facts `LIVE`(레코드별 fact row ⇔ authored).
- **보존하지 못한 assertion: 없음.** 단, 범위 밖으로 남긴 것은 7절 참고.

## 7. 남은 위험 / BoostChat 쪽이 알아야 할 것

1. **demo rollout pin**: `integration.test.ts`(B2/R2/G*), `publish.test.ts`(RT0 등), `step6`/`ia15x`/`predemo*`/`inquiry16*` 는 tracked `data/site-builds/boost-interior-demo` 의 current/previous package 와 live 디렉터리를 여전히 직접 읽는다.
   무손실 전환은 buildInputId 를 유지하므로 지금은 영향이 없지만, **내용이 바뀌는 첫 managed publish 이후** 이 suite 들은 rollout 상태 갱신(또는 frozen 구성으로의 추가 전환)이 필요하다. 지정된 3개 테스트만 이번 범위에서 옮겼다.
2. 검증 URL 은 계약대로 `/portfolio/<slug>` 고정. 템플릿이 다른 detail route 를 쓰는 사이트는 지원하지 않는다.
3. (해소) `changes.removing` 은 `{id, slug}` 객체 배열이다. 부재 검증은 export 가 준 slug 로 하며 워킹트리 이력이 필요 없다. 단, 제거된 레코드의 slug 를 같은 export 의 다른 레코드가 다시 쓰는 경우 그 URL 은 404 가 될 수 없으므로, 그 레코드의 페이지(200)가 확인되면 absent 로 보고한다(S2b).
4. 일부만 확인되면 `succeeded` 로 확인된 id 만 보고(exit 4). 목록 페이지/manifest 가 방금 빌드한 package 의 것이 아니거나 0건 확인이면 `failed`/`verify`. 공개 URL 무응답은 `unverified`(exit 4, 보고 없음) — 11 절.
5. 실패 cycle 은 스스로 반복하지 않는다(BoostChat 이 올린 revision 은 다음 실행에서 처리).
6. `BOOSTCHAT_BASE_URL` 은 https 만 (loopback http 예외). asset `href` 는 `/api/publisher/sites/<siteId>/assets/` 아래여야 하고 redirect 는 따르지 않는다.
7. 계약에 없는 추가 플래그: `--force`, `--generate-only`.
8. 실제 `data/sites/boost-interior-demo` 는 이번 WP 에서 managed 로 전환하지 않았다.

## 8. 검증 결과

| 명령 | 결과 |
| --- | --- |
| `pnpm test:portfolio-sync` | 40 passed, 0 failed (리뷰 반영 후: 기존 37 + F2/F3/F4) |
| `… portfolio-sync.test.ts --e2e` | 43 passed, 0 failed (E1–E3 실제 build+publish+HTTP — 실제 package 바이트로 검증) |
| `portfolio-production-truth.test.ts` | 13 passed, 0 failed (기존 10 + live 3) |
| `detail-facts.test.ts` | 26 passed, 0 failed (기존 25 + live 1) |
| `pnpm test:integration` | 85 passed, 0 failed, 1 point-in-time (baseline 과 동일) |
| `pnpm test:publish` | 66 passed, 0 failed |
| `typecheck` / `typecheck:platform` / `typecheck:runtime` | 모두 exit 0 |
| `test:platform` 나머지 체인 | 아래 9절 |
| `test:publish:e2e` | 실행하지 않음 (지시) |

`git status`: `data/sites/boost-interior-demo/`, `data/site-builds/` 변경 없음.

## 9. test:platform 체인 (integration / detail-facts 제외분)

| suite | 결과 |
| --- | --- |
| slice1 / step4 / step41 / step5 / polish / step52 | 86 / 47 / 35 / 32 / 4 / 12 passed, 0 failed |
| step6 | 34 passed, 0 failed (첫 실행: D, D2 FAIL → 수정 후 PASS) |
| predemo / predemo2 | 10 / 9 passed, 0 failed |
| ia150 | 15 passed, 0 failed (첫 실행: R3 FAIL → 수정 후 PASS) |
| ia151 | 10 passed, 0 failed |
| ia152 | 14 passed, 0 failed (첫 실행: R2 FAIL → 수정 후 PASS) |

**실패 기록과 원인**: step6 D/D2, ia150 R3, ia152 R2 는 "release cut 이후 platform/ (test/ 제외) 에 파일이 추가/변경되지 않았다" 를 지문으로 고정한다.
새 `platform/portfolio-sync/**`, `platform/cli/site-portfolio-sync.ts` 가 추가 파일로 잡혔다 (`site/load.ts` 수정은 이미 integration surface 가 pre-integration 해시로 판정).
이 저장소의 기존 관례(publish-surface / integration-surface / release-16x-surface)대로 `platform/test/portfolio-sync-surface.ts` 를 만들어 추가 파일을 제외했다.
assertion 을 삭제하거나 약화하지 않았고, cut proof 가 지키려는 성질(sidecar 없는 사이트는 같은 buildInputId 로 빌드)은 `portfolio-sync.test.ts` L3 가 직접 증명한다.

## 10. Work Time Report (추정치)

| 항목 | 시간 |
| --- | --- |
| 정찰/읽기 | ~35분 |
| 구현 (A–C) | ~70분 |
| 테스트 작성 (D) | ~35분 |
| 디버깅 | ~10분 |
| 테스트/검증 실행 | ~15분 |
| 빌드/E2E | ~5분 |
| 문서/보고 | ~15분 |
| 재작업/중복 | ~10분 (context 압축 후 상태 복구) |

- 가장 오래 걸린 작업: (1) 생성기 소유권/첫 전환 규칙 설계, (2) `portfolio-sync.test.ts` 작성, (3) `integration.test.ts`(2,690줄) 의 demo 입력 지점 파악.
- 불필요하게 오래 걸린 것: context 압축으로 인한 파일 재확인.
- 다음에 줄일 수 있는 것: integration / chain 전체 재실행은 로더·corpus helper 를 건드렸을 때만.
- 개선 제안: (a) demo 를 테스트 fixture 와 고객 편집 사이트로 분리(7-1 해소), (b) data-truth suite 들이 공용 `frozenDemoRoot` 를 쓰도록 통일, (c) `test:portfolio-sync` 를 `test:platform` 체인에 포함할지 결정.

## 11. 독립 리뷰 반영 (2026-10-06, scope cut: F1–F4 만)

| finding | 상태 | 파일 | 회귀 테스트 |
| --- | --- | --- | --- |
| F1 BLOCKER — 검증이 방금 배포한 package 에 묶이지 않음 | 수정 | `portfolio-sync/verify.ts`, `sync.ts`(`BuildOutcome.files`, `buildForSync`), `cli/site-portfolio-sync.ts` | S5 (바이트 불일치/목록/manifest/integration off), X1 (거부 조합 5건), e2e E1–E3 |
| F2 MAJOR — managed 여부가 한 checkout 의 sidecar 에만 존재 | 수정 | `portfolio-sync/managed.ts`(마커 + guard), `cli/site-publish.ts`(수동 publish 거부), `sync.ts`(nothing-to-do 시 재생성, `adopt`) | F2, S1 |
| F3 MAJOR — asset 5xx/429/404 가 `failed`/generate 로 보고됨 | 수정 | `sync.ts`(`isTransport`, 404 → export 재확인 → `retry`) | F3 |
| F4 MAJOR — watch 무한 반복 | 수정 | `sync.ts`(`nextFailureMemory`, `backoff` → `backing-off`), `cli/site-portfolio-sync.ts` | F4 |

- F1: runtime 은 서빙 중인 package hash 를 노출하지 않으므로 detail 페이지·cover 이미지·목록 페이지의 **응답 바이트 sha256** 을 방금 빌드한 package 파일과 비교한다.
- F2: `boost-interior-demo` 에는 마커를 만들지 않았다(도입은 rollout 단계, 런북 8.1). `site:publish --dry-run` / `--rollback` 은 도입된 사이트에서도 허용된다.
- scope cut 이전에 이미 들어가 있던 것(전용 회귀 테스트 유무 표시):
  F5 무응답은 `unverified`(S5 로 검증), F6 publish 실패 시 포인터 재확인(S3), F12 단계별 고정 실패 문장(S3/S4/S5),
  F13 주석/테스트 이름만, F14 중 `--from-file --remote` 거부(X1)와 watch 종료 코드(테스트 없음),
  F7 intent sidecar(삭제 경로는 G4/G9/S2 가 통과하지만 **crash/INTERRUPTED 분기는 전용 테스트 없음**),
  F8 상한 + bounded read(H 테스트가 read 경로 통과, **상한 초과 분기 테스트 없음**, asset 은 여전히 메모리에 올림),
  F9 예약 suffix 거부(**테스트 없음**), F10 `portfolio-sync/lock.ts`(X2 가 획득/해제 통과, **stale 규칙 테스트 없음**),
  F11 동시성 4 + 120초 deadline(검증 경로 전체가 통과, **deadline 분기 테스트 없음**).
- scope cut 으로 되돌린 것: U2 clock-skew 대기(`sync.ts` 에서 직접 삭제). 미착수: `test:portfolio-sync` 의 `test:platform` 체인 편입.
- U2 답: 그렇다 — `platform/site/load.ts` 의 public 필터가 `publishedAt` > 빌드 시각인 레코드를 숨긴다. 현재 sync 는 skew 를 흡수하지 않고 `generate` 에서 fail closed 한다("would not be served yet", 테스트 G8).
- 재실행한 검증: typecheck 3종 exit 0 · portfolio-sync 40 / `--e2e` 43 · integration 85 (+1 point-in-time) · publish 66 · production-truth 13 · detail-facts 26 · fingerprint suite step6 34 / ia150 15 / ia152 14 — 모두 0 failed. `git status --short -- data/` 비어 있음. 전체 `test:platform` 체인은 다시 돌리지 않았다.
- 남은 위험: (1) 운영 zone 이 HTML/이미지를 변형(minify, email obfuscation, Polish 등)하면 바이트 비교가 실패한다 — 네트워크 없이 확인 불가, 첫 `--remote` 실행에서 확인 필요.
  (2) 설정된(nothing-to-do) 상태에서도 sidecar 가 없거나 revision 이 다르면 sync 가 사이트 디렉터리를 다시 쓴다 → 개발용 checkout 에서 돌리면 `data/sites/<id>` 가 변경된다.
  (3) schema 를 읽을 수 없는 export 는 content hash 가 없어 backoff 기억 대상이 아니다(폴링 간격 증가만 적용).

### Work Time Report — 리뷰 반영분 (추정치)

| 항목 | 시간 |
| --- | --- |
| 구현 | ~60분 (F1–F4 + cut 이전 MINOR) |
| 디버깅 | ~5분 |
| 테스트/검증 | ~25분 |
| 빌드/E2E | ~5분 |
| 문서/보고 | ~15분 |
| 재작업/중복 | ~20분 (context 압축 복구, U2 삭제, cut 된 테스트 계획 폐기) |

- 가장 오래 걸린 작업: (1) `sync.ts`/`verify.ts` 재작성, (2) rig 를 바이트 단위 fake package 로 전환, (3) 런북 개정.
- 불필요하게 오래 걸린 것: scope cut 전에 MINOR 14건을 한 번에 구현한 것.
- 다음에 줄일 것: BLOCKER/MAJOR 를 먼저 닫고 검증한 뒤 MINOR 를 별도 단위로.
