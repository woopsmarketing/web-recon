# 03 — Golden build (boost-interior-demo)

- 날짜: 2026-09-22
- 명령: `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/site-build.ts boost-interior-demo --at 2026-09-22T12:00:00Z` (로그 `proof/golden-build.log`)
- 이력: 첫 golden 빌드(`39c69a40…`, 08:54 KST 이전)는 독립 리뷰 MAJOR-1 반영(producer 소스 hash 가 build identity 에 들어감)으로 identity 가 바뀌어 **폐기하고 다시 빌드**했다. 폐기 절차: 데모 포인터 3개(`current.json`, `previous.json`, `history.jsonl`)를 HEAD 상태로 되돌리고 `39c69a40…` 패키지 디렉터리를 지운 뒤 재빌드 — 그래서 keep-2 rotation 이 live 패키지 `18c0a5ef…` 를 rollback 으로 그대로 보존한다. 두 빌드의 `_integration/` 두 파일은 byte 동일(같은 sha256·version).
- Cloudflare/R2/Worker: **쓰지 않았다.** live 사이트는 다시 publish 하지 않았다.

## 산출물

| 항목 | 값 |
|---|---|
| buildInputId | `0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a` |
| packageHash | `286d44ab7d1f0c1202e992d8e17e384c6391d5c59d1a1eb321808f0dcc468e9e` |
| packageDir | `data/site-builds/boost-interior-demo/packages/0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a` |
| release | `interior-01-1.5.2-d87807590d64` (releaseHash `d87807590d64ea…`, templateSourceHash `2f675577…` — live 와 동일) |
| parts | releaseHash / siteSnapshotHash `df04f877…`(live 와 동일) / mode public / toolchainHash `22e72379…` / **integrationInputHash `11a06dfd478509584294265dbb12b700f364b06be8f72d1f21d3ba9425aa3529`** (= hash{producer 1, producerSourceHash `7b65099b06ffaedb229eef2454e46c3af5b45be341bb29825df91c03db6c88bc`, contract 0.1/0.1, config}) |
| QA | pass · 158 files · 7,396,044 bytes |
| manifest | `site/_integration/manifest.json` · 274 B · sha256 `e8211d1abf2b436455d90af6ef5ea92c96d94316907b05542cbe68fd659d97ec` |
| portfolio | `site/_integration/portfolio.6346c472e162ae07b76a4686fce54c51.json` · 5,292 B · sha256 `eb646c560c188f92aa3714d06df66dbf79835d252b9867547e67ebe421bd73b4` |
| resourceVersion | `6346c472e162ae07b76a4686fce54c51` (= 계약 §21.1 예시값) |
| records | 8 (bi-01 … bi-08, 전부 published) |
| facets | category 4 · scope 20 · tag 8 |
| area basis | 8/8 `supply` (source 에 저장된 대로, 단위 `pyeong`, 변환 없음) |
| pricePerArea | 6/8 (bi-04, bi-06 은 source 에 없어 key 생략) |
| listingUrl | `/portfolio` |
| warnings | 없음 (consumer 선언 한도 안) |

manifest 전문:

```json
{"schemaVersion":"0.1","site":{"id":"boost-interior-demo","publicOrigin":"https://interior-demo.boostweb.co.kr","locale":"ko-KR"},"resources":{"portfolio":{"href":"/_integration/portfolio.6346c472e162ae07b76a4686fce54c51.json","version":"6346c472e162ae07b76a4686fce54c51"}}}
```

## live 패키지 보존

| 항목 | 값 |
|---|---|
| live buildInputId | `18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f` (Cloudflare pilot, `docs/result/cloudflare-live-pilot`) |
| live packageHash | `cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202` |
| 빌드 전 per-file sha256 | `proof/before-live-package.json` (156 files, 7,390,478 bytes) |
| 빌드 후 | 156 files 전부 같은 sha256 · `packageIntact()` true · git 상 변경 0 · `previous.json` = live (rollback 포인터) |
| `_integration/` | live 패키지에 없음 (OFF 상태 그대로) |

기존 keep-2 정책으로 그 이전 1.5.1 패키지(`aa71b829…`)는 정리됐다(git 에서 157 파일 삭제로 보임). 이것은 이번 변경이 아니라 `site-build.ts` 의 기존 pruning 이다.

## golden = live + 통합 파일 2개 (proof/package-diff-live-vs-golden.json)

두 패키지의 모든 파일을 비교하되, Next 의 build id(`RECON_BUILD_ID = buildInputId[0:32]`, HTML/RSC 텍스트와 `_next/static/<id>/` 경로에 박힘)만 정규화했다.

| 항목 | 값 |
|---|---|
| live files / golden files | 156 / 158 |
| added | 2 — `_integration/manifest.json`, `_integration/portfolio.6346c472….json` |
| removed | 0 |
| changed (build id 정규화 후) | **0** |
| build id 가 박힌 파일 | 85 (텍스트 안) + `_next/static/<id>/` 경로 3개 (rename) |

즉 HTML/JS/CSS/이미지의 설명되지 않는 변경은 없다. 테스트 G5 가 같은 비교를 TypeScript 로 매 실행 시 반복한다.

## 재현성

- T1: 데모를 throwaway root 로 복사해 같은 `at` 으로 다시 빌드 → 같은 buildInputId, 같은 packageHash, 같은 두 파일 sha256.
- producer 소스가 한 byte 라도 바뀌면 `producerSourceHash` → `integrationInputHash` → `buildInputId` 가 바뀐다(B2). ON 빌드에서 emitter 변경이 "up-to-date" 로 숨거나 같은 identity 아래 다른 byte 가 들어갈 수 없다.
- E2: 순수 emitter 를 두 번 실행 → byte 동일. §21.2 두 record 예시 `6d641b6f…`, §21.3 빈 문서 `31aefd2b…` 재현.
- B6: 통합과 무관한 설정 변경(`settings.json` 의 home.projects-a limit) → buildInputId 는 바뀌지만 resourceVersion 은 `6346c472…` 그대로(RV2).
