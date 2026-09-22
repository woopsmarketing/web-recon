# 04 — Verification

- 날짜: 2026-09-22
- 실행 방식: 전부 `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json …` / `./node_modules/.bin/tsc …` (이 worktree 에서는 `pnpm` 직접 실행 금지). Cloudflare/R2/원격 wrangler 는 어떤 명령도 쓰지 않았다.

## 1. 새 suite — `platform/test/integration.test.ts` (`test:integration`, `test:platform` 체인 끝에 추가)

최종 **50 passed, 0 failed** (리뷰 반영 후, 재빌드한 golden 기준; T1–T7 은 실제 `site:build` 를 throwaway root 에서 수행). 리뷰 반영 전 첫 실행은 47/47 이었고, 리뷰로 추가된 check 는 V1b·E9(재정의)·E10·V13 과 B2/G1/R2 의 확장이다.

| 절 | check | prompt §12 요구 항목 |
|---|---|---|
| [contract] | C1 경로·schemaVersion·producer version·CH-R10 한도 상수 · C2 HT7 금지 문자 집합 · C3 code point 순서 ≠ UTF-16 | — |
| [emitter] | E1 데모 = §21.1 golden (version `6346c472…`, 5,292 B, manifest 274 B, 8 records, facets 4/20/8, listingUrl) · E2 두 번 emit byte 동일 + §21.2·§21.3 재현 · E3 순서 · E4 missing → key 생략, null/""/{}/[] 없음 · E5 area 변환 없음, basis supply 그대로, unknown/없음 → 생략, exclusive 유지, totalCost 없음 · E6 allowlist + 제외 문자열 부재 · E7 projection 변경 13종 → version 변경, projection 밖 변경 14종 → 불변 · E8 facet dedupe · E9 item route 0개 → resource 미제공(manifest 만, `resources: {}`, byte 고정, validates) + 관용 route schema · E10 fail-closed(origin 없음/http/item route 2개 = 모호/미계획 detailUrl) | same input → byte identical · content change → version change · unrelated change → unchanged · missing → omitted · confirmed none → [] · no null · area basis supply · manifest/resource version match |
| [validator] | V1 데모+fixture 3종 통과(0 error) · V1b **INV-4 by name**: fixture-large 원본에서 published ∧ publishedAt ≤ at 인 id 집합 == document, draft·예약 부재 · V2 중복 id / 순서 · V3 절대·protocol-relative·query·fragment·backslash·비-root·미계획 URL 거부 · V4 HT7 · V5 null/""/{}/[]/basis unknown/amount 0 · V6 site.id/origin/http/path/locale · V7 echo/pointer/파일명/RV1 · V8 facet 폐쇄성·순서·중복 · V9 소수·음수·단위·통화·totalCost·extra key·facet key·title 길이·schemaVersion · V10 record 0 + listingUrl/facets · V11 한도 초과 = 경고만(잘라 내지 않음) · V12 assert 가 모든 오류 나열, 순수성 · V13 freeze 검토 규칙: `resources: {}` + document / pointer 없는 document 거부, 명시적 port 거부, 비-ASCII·잘못된 percent path 거부(RFC 3986 pchar 허용), category ≠ 1 거부 | invalid URL reject · duplicate record reject · manifest pointer exact |
| [builder] | B1 fixture 3종 OFF: config 없음, integrationInputHash 없음, buildInputId 불변, 패키지에 `_integration/` 없음 · B2 데모 ON: hash 식(`producer, producerSourceHash, contract, config`), 소스 파일 6개 목록·hash 재계산 일치, 소스 변경 → identity 변경, buildInputId = golden ≠ live · B3 preview 는 절대 emit 안 함 · B4 데모에서 `integration.json` 제거/`enabled:false` → **live 패키지의 buildInputId `18c0a5ef…` 그대로** · B5 잘못된 config 4종 fail-closed · B6 producer version·무관 설정 변경 → buildInputId 변경, resourceVersion 불변 · B7 producer/빌더/publish seam(9 파일)에 사이트 이름 문자열 없음 | default OFF · demo ON · fixtures OFF · build identity |
| [golden] | G1 패키지의 두 파일 = 순수 emit byte, build record 요약 일치(producerSourceHash 포함), QA 158, `packageIntact` · G2 pointer = 파일명 = version, origin = site.json, runtime `resolvePath` · G3 모든 detailUrl/listingUrl 에 HTML(INV-5), 절대 URL 없음 · G4 **live 패키지 `18c0a5ef…` intact, packageHash `cd048406…`, previous 포인터, `_integration/` 없음** · G5 golden = live + 정확히 2 파일(build id 정규화 후 changed 0) | live package untouched · 새 빌드 = 기존 출력 + 통합 파일만 |
| [builds] | T1 데모 재빌드 → 같은 buildInputId/packageHash/파일 sha · T2 fixture-small opt-in → 자기 origin·record 로 emit(generic) · T3 fixture-empty opt-in → §21.3 byte · T4 http/origin 없음 → **빌드 실패**(패키지 안 씀) · T5 title 안 U+2028 → 빌드 실패, 같은 사이트 OFF 면 빌드됨 · T6 preview → `_integration/` 없음 · T7 fixture OFF 재빌드 = canonical 패키지 packageHash, export guard | same input → byte identical · fixtures OFF byte-neutral |
| [serving] | R1 fake R2: OFF 패키지의 manifest 경로 → **404 + 패키지 404.html (403 아님, CH-R11b)**, ON → 200 `application/json` revalidate byte 동일, trailing slash 404 · R2 `planPublish` 가 두 파일을 `application/json` 으로, manifest revalidate, bakedOrigin = manifestOrigin = manifest origin; 다른 hostname + `requireOriginMatch` → 거부, localhost → 경고 | HT1–HT3, CH-R11b |
| [release] | I1 stored release 12개 전부 verify, 데모 pin 1.5.2 hash · I2 **working tree release hash == pinned 1.5.2 `d87807590d64…`**, `platform/integration`·`platform/build` 는 release source 아님, golden 의 template record | old 1.5.2 release byte-identical |

테스트 작성 중 잡은 실제 결함 1건(리뷰 이전): 빌더가 `declared-routes.ts` helper 를 `repoRoot` 기준으로 찾았다 → throwaway root 에서 ENOENT. `import.meta.url` 기준으로 고쳤다(`site-build.ts` `DECLARED_ROUTES_HELPER`). 나머지 실패는 테스트 자체의 오류(regex, 허용 목록 walk)였고 producer 코드 변경 없이 고쳤다.

## 2. 회귀 — `test:platform` 체인 (13 suites) + publish + typecheck

최종 실행(리뷰 반영·golden 재빌드·milestone suite 정리 **이후**, 커밋 직전 working tree). 첫 실행(리뷰 반영 전)의 milestone suite 실패는 §3.

| suite | 최종 결과 | 첫 실행(리뷰 전) | 비고 |
|---|---|---|---|
| slice1 | 72 passed, 0 failed | 같음 | build identity·release 검증 포함 |
| step4 · step41 · step5 · polish · step52 | 47 / 35 / 32 / 4 / 12 passed, 0 failed | 같음 | |
| step6 | **30 passed, 0 failed** | 28 passed, 2 failed | 1.4.0 cut proof: platform tree 지문 (§3) |
| predemo · predemo2 | 10 / 9 passed, 0 failed | 같음 | |
| ia150 | **15 passed, 0 failed** | 14 passed, 1 failed | 1.5.0 cut proof: platform 지문 (§3) |
| ia151 | **10 passed, 0 failed** | 9 passed, 1 failed | 1.5.1 cut proof: platform 지문 (§3) |
| ia152 | **14 passed, 0 failed** | 9 passed, 5 failed | 1.5.2 cut proof: platform 지문 + 데모 포인터/파일/pre-cut 패키지 (§3) |
| integration | **50 passed, 0 failed** | 47 passed, 0 failed | 리뷰로 3 check 추가 |
| test:publish | 59 passed, 0 failed | 같음 | fake R2 |
| test:publish:e2e (local wrangler dev) | 45 passed, 0 failed, 1 skipped(live-mode only) | 같음(첫 golden 기준) | 재빌드한 golden(`0f80b239…`) 으로 재실행(2026-09-22T08:33Z): 158 파일 upload/verify, **addressable 156 파일 전부 200 + 저장된 content-type/cache-control + byte 동일 — `_integration/` 두 파일 포함** (비-addressable 2 = 404.html, _not-found.html). proof `docs/result/static-deployment-foundation/proof/local-e2e.json` 갱신(package = `0f80b239…`) |
| typecheck:platform · typecheck:runtime · root `tsc --noEmit` | 전부 clean (출력 0줄) | 같음 | |

합계: platform 체인 13 suites **340 passed, 0 failed**; publish 59; e2e 45 (+1 skipped). 회귀 실행 후 데모의 canonical 패키지·포인터(current `0f80b239…`, previous `18c0a5ef…`)는 그대로다(테스트는 throwaway root 만 쓴다).

## 3. Milestone cut-proof suites 의 실패와 처리

step6 D/D2, ia150 R3, ia151 R2, ia152 R2 는 "그 cut 은 Template-only 였다: platform/ 구현 파일이 capture 와 byte 동일" 을 증명하는 검사다. 이번 작업은 **의도된 platform 변경**(`build/build-input.ts`, `build/site-build.ts`, `site/load.ts` 수정 + `platform/integration/**`, `build/declared-routes.ts` 추가)이므로 정확히 그 파일들만 걸렸다. ia152 R3/D1/P3/P4 는 데모 golden 빌드의 결과(rollback 포인터가 live 패키지로 회전, keep-2 로 pre-cut 1.5.1 패키지 정리, `integration.json` 추가)에 걸렸다.

이 suite 들은 이미 같은 종류의 후속 platform 작업(publish surface)을 **이름 붙인 predicate** `platform/test/publish-surface.ts` 로 지문에서 제외하고, 후속 re-pin 은 `atCut` 조건으로 "theirs to assert" 처리한다. 같은 방식으로 처리했다:

- `platform/test/integration-surface.ts` (신설) `isIntegrationSurface(rel)` — 위 파일 목록. cut proof 가 지키려는 성질(opt-in 하지 않은 사이트는 여전히 byte 동일하게 빌드된다: 같은 buildInputId, 같은 packageHash)은 `integration.test.ts` B1/B4/T7 이 직접 assert 한다.
- step6 D/D2, ia150 R3, ia151 R2, ia152 R2: 지문 제외 predicate 에 `isIntegrationSurface` 추가.
- ia152 R3: 같은 pin 의 후속 빌드가 rollback 을 회전시킨 경우 → pre-cut 패키지가 `history.jsonl` 에 success 로 남아 있고 current/previous 가 모두 pin 의 release 로 빌드됐음을 대신 확인(어느 것이 rollback 인지는 후속 작업 몫: integration G4).
- ia152 D1: 후속 추가 파일 `integration.json` 1개만 허용(내용은 integration B2).
- ia152 P3/P4: pre-cut 1.5.1 패키지가 정리돼 없으면 사유를 출력하고 skip(그 cut 의 증명은 cut commit `a2500f9` 에서 성립).

- 지문에서 **제외**하는 것은 이번 작업이 *추가한* 파일(`platform/integration/**`, `build/declared-routes.ts`)뿐이다. 이번 작업이 *수정한* 기존 4 파일(`build/build-input.ts`, `build/site-build.ts`, `site/load.ts`, `publish/publish.ts`)은 지문에서 빼지 않고, 시작 commit `be6b10a` 의 sha256(`proof/platform-before-integration.json`, `integrationSurfaceBefore()`)으로 **치환**해 비교한다. 그래서 각 cut proof 는 "그 cut 부터 이번 작업 시작 시점까지 platform 이 그대로였다" 를 계속 증명하고, 그 외 platform 파일은 여전히 live 로 비교된다. 이 4 파일의 *현재* 내용은 cut proof 가 아니라 `integration.test.ts` (B1/B4/T7 OFF 빌드 byte 동일, B2 producer 소스 hash 가 build identity) 가 지킨다 — publish surface 선례(완전 제외)보다 강한 처리다.

다른 assertion 은 삭제·약화하지 않았다. 재실행 결과(§2 최종 열): step6 30/0 · ia150 15/0 · ia151 10/0 · ia152 14/0.

## 4. Fresh clone (references/ 없음)

커밋 `44f3596`(`feat: emit first-party integration resources`; 최종 커밋은 이 문서와 `00-summary.md` 만 amend 한 같은 트리)을 scratch 디렉터리에 `git clone --branch track-b/static-deployment-foundation` 으로 받았다. `references/` 는 clone 에 **없다**(git 밖). 의존성은 이 worktree 의 `node_modules` 를 symlink 로 연결했다(오프라인, lockfile 변경 없음).

| 단계 | 결과 |
|---|---|
| `tsc -p platform/tsconfig.json` · `tsc -p workers/recon-runtime/tsconfig.json` | clean |
| slice1 · step6 · ia152 · integration · test:publish | 72 / 30 / 14 / 50 / 59 passed, 0 failed |
| `site:build boost-interior-demo --at 2026-09-22T12:00:00Z` (force 없음) | **up-to-date** — 커밋된 패키지와 같은 `buildInputId 0f80b239…` (release · site snapshot · toolchain · integration input 전부 clone 에서 재현) |
| 같은 명령 `--force` | **built** — `buildInputId 0f80b239…`, **`packageHash 286d44ab…` 동일**(158 파일 byte 동일, `_integration/` 두 파일 포함: manifest 274 B `e8211d1a…`, portfolio 5,292 B `eb646c56…`), `producerSourceHash 7b65099b…` 동일, previous = `18c0a5ef…` 유지. clone 의 git 변경은 `build-record.json`(시각)·`current.json`·`history.jsonl` 뿐 |

즉 커밋만으로(`references/`·로컬 상태 없이) 계약·producer·golden 이 재현된다. canonical worktree 는 이 과정에서 건드리지 않았다(`git status` 변화 없음).

## 5. 독립 리뷰

`05-review-contract.md`, `06-review-implementation.md` (fresh-context, 원하는 결론을 주지 않음) → 처리 내역 `07-review-fixes.md`.
