# 00 — interior-01 1.5.2 outreach demo: 종합 (2026-09-22)

foundation checkpoint (`14c49a6`) 위에서, 이전 세션의 uncommitted 1.5.2 작업을 이어받아 완성했다. 처음부터 다시 쓰지 않았다. push / 원격 배포 없음.

| 문서 | 내용 |
|---|---|
| [`01-foundation-checkpoint.md`](01-foundation-checkpoint.md) | 첫 commit `14c49a6` (이전 세션) |
| [`02-implementation-review.md`](02-implementation-review.md) | 이어받은 코드 검토: SEO / canonical / OG / og:image raster guard / bundle / 이메일·한국어 / site data |
| [`03-release-pinning.md`](03-release-pinning.md) | "4개 site 모두 1.5.2" 는 test 가정이었다 → 테스트를 pin-aware 로; demo 만 re-pin; rotation |
| [`04-test-hermeticity.md`](04-test-hermeticity.md) | fresh clone 실패 3종 (references/, mtime, read-only mode) 과 해법 |
| [`05-release-and-build.md`](05-release-and-build.md) | release / build 식별자, 빌드된 head |
| [`06-verification.md`](06-verification.md) | 전체 검증, fresh-clone 검증, independent review 와 처리 |
| [`07-cloudflare-predeploy.md`](07-cloudflare-predeploy.md) | live deploy 전 확인 목록, BoostWeb reserved name 권고 |

## 핵심

1. **SEO 1.5.2** — 홈 canonical, OG title/description/url (canonical 과 같은 값), og:image 는 기존 site raster 자산만 (SVG 면 생략). 새 generic setting `site.seo.indexing` (default `index`), demo 만 `noindex` (site data).
2. **bundle** — `lib/seo.ts` 는 `homeHeroData.ts` (data) 만 import. 1.5.1 대비 모든 페이지 JS chunk bytes 동일.
3. **이메일 / 한국어** — 이메일 source 는 `business.json` 한 곳 (`vnfm0580@gmail.com`). 문구 `{email} 주소로 보내 주세요` — 조사를 이메일에 붙여 저장하지 않음.
4. **release pinning** — platform 은 원래 site 별 exact pin (build 는 pin 된 release 의 frozen files 로). "모두 latest" 는 테스트 8곳 + step6/ia152 의 가정이었다. 테스트를 고쳤고, **demo 만 1.5.2, fixture 3개는 1.5.1 pin·package 그대로**. 1.5.2 기본 동작은 throwaway-root 사본으로 증명 (ia152 F2).
5. **hermeticity** — fresh clone 에서 실패하던 것은 K2/K3 (references/) 뿐이 아니었다: D2 (mtime), release read-only mode 검사 4곳도 실패했다. 전부 고쳤고, 실제 `git clone` 트리 (references/ 없음) 에서 전체 통과.
6. **independent review** — BLOCKER 0, MAJOR 2 (둘 다 처리: `.gitignore` 에 `/references/`, 파일 집합 같이 commit), MINOR 7 (처리/수용 기록).

## 최종 출력

```
HEAD_BEFORE = 14c49a6a95e3909350347d8789f985add621d29f
SECOND_COMMIT = (commit 뒤 채움 — 아래 §commit)

INTERIOR_152_READY = YES
RELEASE_ID = interior-01-1.5.2-d87807590d64
RELEASE_HASH = d87807590d64ea7901b226d43526795793805527647313ee4af22f8511577a08
DEMO_BUILD_INPUT_ID = 18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f
DEMO_PACKAGE_HASH = cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202
  siteSnapshotHash = df04f8775a2d28c08ecff1544a28f0c268e0897517ed99501a7f4d6918264e54
  files / bytes = 156 / 7,390,478

EMAIL = vnfm0580@gmail.com
PUBLIC_ORIGIN = https://interior-demo.boostweb.co.kr
NOINDEX_PASS = YES
CANONICAL_PASS = YES
OG_PASS = YES
OG_IMAGE = https://interior-demo.boostweb.co.kr/assets/ae004e4b853e6c005daa.jpg (site-hero-01, JPEG 2400×1350)

BUNDLE_REGRESSION_FIXED = YES
KOREAN_COPY_FIXED = YES
FRESH_CLONE_TESTS_HERMETIC = YES

MIXED_TEMPLATE_RELEASE_PINS_SUPPORTED = YES
OTHER_SITES_REPINNED = NO
WHY = platform 은 site 별 exact pin 을 원래 지원한다 (build 는 pin 된 release 의 frozen files 로 하고, site 사이 pin 을 비교하는 코드가 없다). "모두 1.5.2" 는 테스트가 fixture pin == working-tree Template version / == demo pin 을 가정했기 때문이었다. 테스트를 pin-aware 로 고쳤고, fixture 3개는 1.5.1 pin 과 1.5.1 package 를 유지한다.

TYPECHECK = PASS (root / platform / runtime)
TEST_PLATFORM = PASS (12 suites, FAIL 0)
BROWSER_SMOKE = PASS (52/52)
TEST_PUBLISH = PASS (59/0)
TEST_PUBLISH_E2E = PASS (45/0, 1 live-only skip)

OLD_RELEASES_BYTE_IDENTICAL = YES

COMMIT_PERFORMED = YES
PUSH_PERFORMED = NO
REMOTE_DEPLOYMENT_PERFORMED = NO

BLOCKERS_FOR_LIVE_DEPLOY =
  1. interior-demo.boostweb.co.kr 의 DNS 레코드 / Worker route / custom domain 충돌 확인 (live 미확인)
  2. live zone 의 *.boostweb.co.kr/* · */* route 와의 우선순위 확인
  3. BoostWeb RESERVED_SUBDOMAINS 에 interior-demo 추가 여부 결정 (현재 없음 — 가게 subdomain 과 충돌 가능)
  4. recon-runtime wrangler route 설정 + 실제 publish 는 사람 승인 뒤
```
