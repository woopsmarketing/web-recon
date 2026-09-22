# CONTINUATION TASK
# WEB-RECON INTERIOR-01 1.5.2 OUTREACH DEMO
# CONTINUE FROM EXISTING UNCOMMITTED WORK
#
# 공식 작업본:
# /Users/woops/projects/web-recon-track-b
#
# 현재 HEAD:
# 14c49a6
# checkpoint: consolidate web-recon foundation
#
# 중요:
# 이전 작업을 처음부터 다시 하지 않는다.
# 현재 uncommitted 1.5.2 작업을 조사한 뒤
# 가능한 것은 보존하고 이어서 완성한다.
#
# 임의 git reset / checkout / restore 금지.
# 기존 uncommitted 작업 삭제 금지.

==================================================
0. 현재 상태
==================================================

foundation checkpoint는 이미 완료됐다.

commit:
14c49a6
checkpoint: consolidate web-recon foundation

push는 안 됐다.

현재 working tree에는
1.5.2 작업이 일부 구현된 상태다.

먼저:

pwd
git status
git diff --stat
git diff

를 확인한다.

공식 worktree가 아니면 중단.

==================================================
1. 기존 1.5.2 작업 보존
==================================================

현재 변경 중 알려진 파일:

templates/interior-01/v1/
- app/layout.tsx
- app/page.tsx
- lib/seo.ts
- sections/HomeHero.tsx
- sections/homeHeroData.ts
- template.ts

tests/scripts:
- ia152 관련
- canonical-152
- browser smoke
- publish-e2e
- package.json

reports:
docs/result/outreach-demo-151-to-152/

이 변경을 먼저 검토한다.

방향이 맞으면 유지.

틀린 부분만 최소 수정.

처음부터 재작성하지 않는다.

==================================================
2. 확정된 제품 결정
==================================================

demo email:

vnfm0580@gmail.com

demo public origin:

https://interior-demo.boostweb.co.kr

demo SEO:

noindex

1.5.2에서 구현:

- homepage canonical
- OpenGraph title
- OpenGraph description
- OpenGraph url
- 가능하면 기존 raster site asset을 og:image로 사용

이번에 하지 않음:

- JSON-LD
- inquiry backend
- BoostChat widget
- integration manifest
- portfolio index
- generic no-contact /contact route redesign

==================================================
3. SEO 구현 검토
==================================================

현재 구현된 site.seo 설정을 검토한다.

요구:

- generic site-level setting
- default index
- demo만 noindex
- customer/siteId hardcode 금지

기존 release가 이 additive setting 때문에
불필요하게 깨지지 않는지 확인한다.

homepage canonical:

https://interior-demo.boostweb.co.kr

형태를 정상으로 인정한다.

trailing slash를 강제로 추가하기 위해
새 SEO mechanism을 만들지 않는다.

==================================================
4. HomeHero/SEO bundle 문제 수정
==================================================

현재 lib/seo.ts가 HomeHero.tsx를 import하여
non-home page에도 carousel JS 약 3.5KB를 추가하는 문제가 있었다.

이를 반드시 제거한다.

homeHeroData.ts 같은
framework-independent/static data module을 사용한다.

원칙:

home page component
→ hero data import

SEO
→ same hero data import

SEO가 React component를 import하지 않는다.

동일 source of truth 유지.

==================================================
5. og:image
==================================================

OpenGraph image는 optional.

generic rule:

- raster image이면 사용 가능
- SVG이면 og:image 생략
- 없는 이미지를 생성하지 않음
- external arbitrary image 금지

boost-interior-demo에서는
기존 site assets 중 적절한 raster hero/cover가 있으면 사용한다.

새 AI 이미지 생성 금지.

새 asset pipeline 금지.

fixture의 SVG 때문에
전체 테스트가 실패하지 않도록
raster-only guard를 둔다.

==================================================
6. 이메일 문구
==================================================

fallback에서:

gmail.com로

같은 어색한 한국어가 나오지 않게 한다.

generic UI copy를:

"{email} 주소로 ..."

형태로 만든다.

site data 안에 한국어 조사까지 저장하지 않는다.

모든 이메일 source는 site data의
vnfm0580@gmail.com 하나를 사용한다.

==================================================
7. FRESH CLONE TEST HERMETICITY — 필수
==================================================

현재 step6 K2/K3가
Git에 포함하지 않는:

references/

파일을 읽는 문제가 발견됐다.

이 상태로는 fresh clone에서 테스트가 실패한다.

반드시 해결한다.

원칙:

자동 테스트는
Git checkout만으로 실행 가능해야 한다.

references/boost-interior/generated-approved
references/boost-interior/project-01-white-34p

를 Git에 넣는 것으로 해결하지 않는다.

가능한 해법을 조사해서
가장 작은 것을 적용한다.

예:

- 필요한 최소 expectation을 test fixture로 옮김
- canonical tracked data에서 검증
- 더 이상 의미 없는 reference-specific assertion 제거/대체

테스트 품질을 조용히 낮추지 않는다.

왜 바꿨는지 보고서에 기록.

==================================================
8. TEMPLATE RELEASE PINNING — 매우 중요
==================================================

현재 조사에서:

"1.5.2 테스트를 위해 모든 4개 site를
1.5.2로 repin/rebuild해야 한다"

는 현상이 발견됐다.

이것이 실제 architecture requirement인지
test assumption인지 반드시 조사한다.

web-recon의 핵심 원칙:

각 site는 exact immutable Template Release에 pin된다.

즉 정상적으로:

site A → 1.5.1
site B → 1.5.2

가 동시에 가능해야 한다.

새 Template Release 생성이
모든 site의 자동 upgrade를 요구하면 안 된다.

따라서:

- boost-interior-demo만 1.5.2로 upgrade 가능해야 함
- 다른 실제/canonical site는 기존 pinned release 유지 가능해야 함
- fixture는 테스트 목적에 필요한 경우 별도 처리 가능

테스트가 "모두 latest release"를 가정한다면
platform architecture를 바꾸지 말고
test를 release-pin aware하게 고친다.

자동으로 모든 site data를 1.5.2로 변경하지 않는다.

이 항목을 independent review에서 반드시 재확인.

==================================================
9. 기존 build history
==================================================

현재 build rotation 때문에
current/previous 외 package가 working tree에서 빠질 가능성이 있다.

14c49a6 checkpoint에 기존 canonical build가 보존되어 있다.

임의 삭제 금지.

이번 작업에서:

- boost-interior-demo의 새 1.5.2 build 생성
- current/previous semantics 유지

까지만 한다.

전체 build-history retention 정책은
이번 작업에서 설계하지 않는다.

필요한 기존 package가 테스트 때문에 사라지면
그 이유를 조사해서
release pinning 문제와 함께 해결한다.

==================================================
10. site data
==================================================

최종 boost-interior-demo:

email:
vnfm0580@gmail.com

publicOrigin:
https://interior-demo.boostweb.co.kr

SEO:
noindex

Template release:
새 1.5.2 exact release

로 만든다.

customer-specific template code 금지.

==================================================
11. RELEASE
==================================================

기존 1.5.0 / 1.5.1 release 변경 금지.

새 immutable release:

interior-01 1.5.2

생성.

release hash 확인.

boost-interior-demo 새 build 생성.

기록:

releaseId
releaseHash
siteSnapshotHash
buildInputId
packageHash
file count
bytes

==================================================
12. TESTS
==================================================

최종 동일 working tree에서:

root typecheck
platform typecheck
runtime typecheck
test:platform
1.5.2 browser smoke
test:publish
test:publish:e2e
release immutability
package QA

실행.

반드시 fresh-clone-equivalent 검증도 한다.

최소한:

references/가 없는 상태에서도
K2/K3가 통과 가능한 구조인지
기계적으로 검증한다.

==================================================
13. INDEPENDENT REVIEW
==================================================

fresh-context reviewer.

관점:

- 1.5.1 regression
- noindex가 demo-only data setting인지
- canonical correctness
- OG correctness
- og:image raster guard
- bundle regression
- email source consistency
- Korean copy
- release immutability
- mixed-version site pinning
- test hermeticity
- accidental references dependency
- package/build rotation damage

BLOCKER/MAJOR 해결 후 완료.

==================================================
14. SECOND COMMIT
==================================================

전체 테스트 통과 후에만 commit.

명시적인 path staging 사용.

git add . 금지.

secret scan 재실행.

추천:

feat(interior-01): prepare 1.5.2 outreach demo

push 금지.

==================================================
15. CLOUDFLARE PRE-DEPLOY NOTE
==================================================

아직 live resource는 만들지 않는다.

다만 다음 사실을 보고서에 명확히 남긴다.

candidate host:

interior-demo.boostweb.co.kr

확인 필요:

1. exact hostname DNS collision
2. exact Worker route/custom domain collision
3. existing *.boostweb.co.kr/* wildcard relationship
4. existing */* route relationship
5. BoostWeb reserved subdomain list에
   "interior-demo"가 현재 없음

권고:

실제 deploy 전에
BoostWeb의 reserved names에
interior-demo를 추가해야 하는지 판단.

이번 작업에서는 BoostWeb 코드를 수정하지 않는다.

==================================================
16. FINAL OUTPUT
==================================================

기존:

docs/result/outreach-demo-151-to-152/

보고서를 이어서 완성.

최종 출력:

HEAD_BEFORE =
SECOND_COMMIT =

INTERIOR_152_READY =
RELEASE_ID =
RELEASE_HASH =
DEMO_BUILD_INPUT_ID =
DEMO_PACKAGE_HASH =

EMAIL =
PUBLIC_ORIGIN =
NOINDEX_PASS =
CANONICAL_PASS =
OG_PASS =
OG_IMAGE =

BUNDLE_REGRESSION_FIXED =
KOREAN_COPY_FIXED =
FRESH_CLONE_TESTS_HERMETIC =

MIXED_TEMPLATE_RELEASE_PINS_SUPPORTED =
OTHER_SITES_REPINNED = YES/NO
WHY =

TYPECHECK =
TEST_PLATFORM =
BROWSER_SMOKE =
TEST_PUBLISH =
TEST_PUBLISH_E2E =

OLD_RELEASES_BYTE_IDENTICAL =

COMMIT_PERFORMED =
PUSH_PERFORMED = NO
REMOTE_DEPLOYMENT_PERFORMED = NO

BLOCKERS_FOR_LIVE_DEPLOY =

마지막:

WEB_RECON_INTERIOR_152_OUTREACH_DEMO_COMPLETE
READY_FOR_LIVE_DEPLOY_REVIEW
NO_REMOTE_DEPLOYMENT_PERFORMED