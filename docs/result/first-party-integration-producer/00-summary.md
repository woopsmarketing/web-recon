# 00 — WEB-RECON × BOOSTCHAT: Contract V0 freeze + first-party producer — 종합 보고

- 날짜: 2026-09-22 · worktree `/Users/woops/projects/web-recon-track-b` · branch `track-b/static-deployment-foundation` (시작 HEAD `be6b10a`)
- live 사이트 `https://interior-demo.boostweb.co.kr` — **이번 작업에서 Cloudflare/R2/Worker 에 어떤 쓰기도 하지 않았다.** live 패키지(`18c0a5ef…`, 1.5.2)는 byte 그대로다.
- 보고서: `01-contract-freeze.md` (02/03 freeze) · `02-producer-design.md` (설계·코드) · `03-golden-build.md` (golden 패키지) · `04-verification.md` (테스트·회귀·fresh clone) · `05-review-contract.md` · `06-review-implementation.md` (독립 리뷰 원문) · `07-review-fixes.md` (반영 내역) · `proof/`

## BoostChat 인계 마커

```
CONTRACT_V0_FROZEN = YES
GOLDEN_RESOURCE_READY = YES
MANIFEST_PATH = data/site-builds/boost-interior-demo/packages/0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a/site/_integration/manifest.json
PORTFOLIO_RESOURCE_PATH = data/site-builds/boost-interior-demo/packages/0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a/site/_integration/portfolio.6346c472e162ae07b76a4686fce54c51.json
RESOURCE_VERSION = 6346c472e162ae07b76a4686fce54c51
PACKAGE_HASH = 286d44ab7d1f0c1202e992d8e17e384c6391d5c59d1a1eb321808f0dcc468e9e
```

서빙 시 URL: `https://interior-demo.boostweb.co.kr/_integration/manifest.json` → `/_integration/portfolio.6346c472e162ae07b76a4686fce54c51.json` (**아직 publish 하지 않았다** — live 에는 `_integration/` 이 없고 404 다. BoostChat 은 위 로컬 파일을 golden fixture 로 쓴다.)

## 무엇을 했나

1. **Contract V0 freeze** — consumer 확인(R-1…R-9, R-12 ACCEPT · R-10, R-11 ACCEPT_WITH_CHANGE · REJECT 0 · DEFER 0)의 4건(CH-R10, CH-R11a/b/c)을 `02` 에 원문 그대로 반영, CANDIDATE → FROZEN(`schemaVersion "0.1"` 불변). `03` JSON 을 `02` 에서 재파생하고 parity 검증. 독립 계약 리뷰의 BLOCKER 1·MAJOR 8 을 명확화 문구로 반영(`07`).
2. **Static producer** — `platform/integration/**`(순수 emitter + fail-closed validator + 계약 상수 + 소스 hash) 와 `platform/build/site-build.ts` 의 seam. opt-in 한 사이트의 public 빌드가 `/_integration/manifest.json` 과 `/_integration/portfolio.<version>.json` 을 같은 immutable 패키지에 정적으로 넣는다. runtime Worker·API·DB 변경 없음.
3. **Generic opt-in** — `data/sites/<site>/integration.json` (`{"schemaVersion":1,"firstPartyData":{"enabled":true}}`), 기본 OFF, 데모만 ON, fixture OFF, 사이트 이름 하드코드 없음(테스트 B7, T2).
4. **Golden** — 데모의 실제 portfolio 8건에서 생성. 계약 §21.1 예시값(version `6346c472…`, 5,292 B, manifest 274 B, facets 4/20/8, 전부 supply 기준 평)과 byte 일치.
5. **Build identity** — OFF 빌드는 통합 이전과 같은 `buildInputId`(데모를 OFF 로 준비하면 live 의 `18c0a5ef…` 그대로); ON 빌드는 `integrationInputHash`(producer 버전 + **producer 소스 hash** + 계약 버전 + config)로 다른 identity. Template 1.5.2 release 불변(working tree release hash == pin, 테스트 I2).
6. **검증** — 새 suite 50 check + 기존 platform/publish/e2e 회귀 + typecheck + fresh clone. 독립 리뷰 2건(계약·구현) 반영.

## 최종 상태

```
CONTRACT_V0_FROZEN = YES
GOLDEN_RESOURCE_READY = YES
MANIFEST_PATH = data/site-builds/boost-interior-demo/packages/0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a/site/_integration/manifest.json
PORTFOLIO_RESOURCE_PATH = data/site-builds/boost-interior-demo/packages/0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a/site/_integration/portfolio.6346c472e162ae07b76a4686fce54c51.json
RESOURCE_VERSION = 6346c472e162ae07b76a4686fce54c51
PORTFOLIO_RECORD_COUNT = 8
FACET_COUNTS = category 4 · scope 20 · tag 8
AREA_BASIS = supply
BUILD_INPUT_ID = 0f80b2395724a721024bd43bcfdac383ba5328e820f2210eebe595002727127a
PACKAGE_HASH = 286d44ab7d1f0c1202e992d8e17e384c6391d5c59d1a1eb321808f0dcc468e9e
BUILD_IDENTITY_SAFE = YES
OLD_RELEASE_UNCHANGED = YES (interior-01-1.5.2-d87807590d64, releaseHash d87807590d64ea…, working tree == pin)
LIVE_PACKAGE_UNCHANGED = YES (18c0a5ef…, packageHash cd048406…, 156 files sha256 동일, previous.json = rollback)
TYPECHECK = PASS (platform · runtime · root `tsc --noEmit`, 출력 0줄)
TESTS = PASS (test:platform 13 suites 340/0 — integration 50/0, milestone step6·ia150·ia151·ia152 전부 통과 · test:publish 59/0 · local e2e 45/0 +1 skipped)
FRESH_CLONE = PASS (references/ 없는 clone: typecheck clean · slice1/step6/ia152/integration/publish 225/0 · 데모 빌드 no-force = up-to-date `0f80b239…` · --force 재빌드 = 같은 packageHash `286d44ab…`; `04` §4)
INDEPENDENT_REVIEW = DONE (계약 `05`: BLOCKER 1·MAJOR 8·MINOR 12 → 전부 반영 · 구현 `06`: BLOCKER 0·MAJOR 2·MINOR 7 → 전부 반영; `07`)
COMMIT = YES (branch `track-b/static-deployment-foundation`, `feat: emit first-party integration resources`, 명시적 staging — `git add .` 미사용; `docs/result/static-deployment-foundation/proof/live-e2e.json` 은 이 작업 이전의 untracked 파일이라 제외)
PUSH = YES (origin/track-b/static-deployment-foundation; main merge 없음)
REMOTE_PUBLISH = NO
BLOCKERS_FOR_BOOSTCHAT_PHASE2 = NONE for local/golden work. 두 가지 전제: (1) `02` 의 freeze 검토 명확화(`07` §B, 문구만·schema 불변)를 consumer 가 확인해야 한다 (2) live origin 의 `_integration/` 은 이 패키지를 실제로 publish 하기 전까지 404 다 — live E2E(Phase D)는 별도 publish 결정 이후
```

## BoostChat Phase B 를 위한 메모

- golden 파일 두 개는 위 경로(로컬 파일, git 에 커밋됨). 계약 §21 의 예시값과 같다.
- `02` 는 freeze 리뷰 명확화(`07` §B)를 담고 있다 — 특히 문서 유효성 2단계(문서 수준 = TRANSIENT, record 수준 = 그 record 만), 한도 초과 = 문서 거부, origin 비교 = WHATWG origin, 명시적 port 없음, UR2 path = percent-encoded ASCII, category 정확히 1개(INV-16), HT9(OFF 패키지 manifest = 404). 전부 consumer 가 이미 선언·구현한 동작을 계약 문장으로 옮긴 것이며 schema 변경은 없다. consumer 통보 필요.
- live origin 에서의 E2E(Phase D)는 이 패키지를 실제로 publish 한 뒤에만 가능하다(이번 작업 범위 밖, 원격 publish 금지).
