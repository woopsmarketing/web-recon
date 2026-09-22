# MASTER TASK
# WEB-RECON OUTREACH DEMO CHECKPOINT + INTERIOR-01 1.5.2
#
# 목적:
# 내일부터 인테리어 업체에 실제 URL을 이메일로 발송하기 위한
# BoostChat 연동 전 최종 web-recon 기반을 준비한다.
#
# 공식 최신 작업본:
# /Users/woops/projects/web-recon-track-b
#
# 중요:
# 이 폴더가 현재 AUTHORITATIVE_WORKTREE다.
#
# 이번 작업에서는 Git commit을 실제로 수행한다.
# push와 Cloudflare 실제 배포는 아직 하지 않는다.
#
# BoostChat integration 구현은 별도 Track에서 진행 중이므로
# integration contract, manifest, portfolio index는 이번 작업에서 만들지 않는다.

==================================================
0. 현재 결정사항
==================================================

사람 결정은 다음과 같이 확정한다.

A.
공식 작업본:
 /Users/woops/projects/web-recon-track-b

B.
references/boost-interior/generated-approved/
→ 보관은 하지만 이번 Git checkpoint에서 제외

C.
references/boost-interior/project-01-white-34p/
→ 보관은 하지만 이번 Git checkpoint에서 제외

D.
data/site-builds/
→ 이번 checkpoint에서는 현재 canonical 상태를 그대로 포함한다.
이번 작업에서 삭제/prune 하지 않는다.
향후 build history 보존정책은 별도 결정한다.

E.
공개 데모 이메일:
vnfm0580@gmail.com

F.
공개 데모 hostname:
https://interior-demo.boostweb.co.kr

단 실제 Cloudflare route/DNS 존재 여부는
live deploy 직전에 확인하며,
충돌이 있으면 임의로 다른 hostname을 선택하지 말고 보고한다.

G.
boost-interior-demo는 가상/서비스 시연 사이트다.
검색엔진에 색인하지 않는다.

H.
이번 1.5.2에서 처리:
- homepage canonical
- demo email
- demo noindex
- OpenGraph title/description/url
- 가능하면 기존 이미지 하나를 og:image로 재사용

I.
이번 1.5.2에서 처리하지 않음:
- no-contact site의 /contact route/noindex generic 문제
- JSON-LD
- inquiry backend
- BoostChat widget
- integration manifest
- portfolio index
- Supabase
- BoostWeb
- Site Platform

==================================================
1. 작업 전 확인
==================================================

반드시:

pwd
git status
git rev-parse HEAD
git branch --show-current
AUTHORITATIVE_WORKTREE.md

를 확인한다.

공식 작업본이 아니면 중단한다.

기대:

/Users/woops/projects/web-recon-track-b

==================================================
2. FOUNDATION CHECKPOINT COMMIT
==================================================

현재 통합 완료 상태를 먼저 Git checkpoint로 만든다.

중요:

git add .
사용 금지.

명시적인 경로를 stage한다.

포함:

- src/
- scripts/
- platform/
- workers/
- templates/
- themes/
- fixtures/
- package.json
- lock/workspace/tsconfig 등 필요한 root source
- docs/architecture/
- docs/status/
- docs/info/
- docs/reports/integration/
- docs/result 중 Git 대상으로 정한 문서/log
- data/sites/
- data/site-builds/
- data/template-releases/
- .gitignore
- CLAUDE.md
- AUTHORITATIVE_WORKTREE.md
- 기타 현재 canonical source

제외:

references/boost-interior/generated-approved/
references/boost-interior/project-01-white-34p/
references/**/generated-candidates/
raw crawl
tmp/
node_modules/
.env
.claude/
대용량 proof screenshot/video
wrangler local state

stage 후 반드시:

git diff --cached --stat
git diff --cached --name-only
secret scan

을 다시 확인한다.

비밀값이나 예상 밖 대용량 원본이 보이면 commit하지 말고 중단한다.

검증 통과 시 checkpoint commit 수행.

추천 commit:

checkpoint: consolidate web-recon foundation

commit hash를 기록한다.

push는 하지 않는다.

==================================================
3. INTERIOR-01 1.5.2 — 최소 공개 데모 패치
==================================================

기존 1.5.1 immutable release는 절대 수정하지 않는다.

새 release 1.5.2를 만든다.

3-1. Homepage canonical

현재 homepage에 canonical이 없는 known gap을 해결한다.

다른 페이지가 사용하는 기존 SEO helper/pageMetadata 패턴을
그대로 재사용한다.

customer-specific hardcode 금지.

3-2. OpenGraph

기존 SEO helper를 가장 작은 범위에서 확장한다.

최소:

og:title
og:description
og:url

실제 page title/description/canonical과 같은 source에서 파생한다.

중복 SEO source of truth를 만들지 않는다.

og:image는:

기존 site asset 중 대표성이 높고
바로 재사용 가능한 이미지가 있으면 사용한다.

새 AI 이미지 생성,
새 이미지 편집 pipeline,
새 asset workflow가 필요하다면
이번에는 넣지 않고 DEFER한다.

3-3. Demo noindex

boost-interior-demo는 가상의 시연 사이트이므로
검색엔진 색인을 막는다.

중요:

Template에
if siteId === "boost-interior-demo"
같은 customer-specific 코드를 넣지 않는다.

먼저 현재 site/settings/SEO contract에
site-level indexing 설정이 이미 있는지 조사한다.

있으면 재사용.

없다면 가장 작은 generic site-level SEO 설정을 추가한다.

개념:

indexing:
  index | noindex

또는 기존 schema convention에 맞는 equivalent.

default는 기존 사이트 동작을 보존하도록 index.

boost-interior-demo만 noindex.

HTML metadata에서 실제 meta robots noindex가 출력되어야 한다.

robots.txt의 Disallow만으로 대신하지 않는다.

3-4. 실제 문의 이메일

boost-interior-demo의 실제 연락 이메일을:

vnfm0580@gmail.com

으로 변경한다.

확인:

- contact page 표시
- footer 표시
- mailto target
- 긴 문의 fallback 안내

모든 곳이 같은 canonical site data를 사용해야 한다.

Template에 이메일 hardcode 금지.

3-5. publicOrigin

boost-interior-demo의 publicOrigin을:

https://interior-demo.boostweb.co.kr

로 설정한다.

canonical
sitemap
robots
absolute URL
OpenGraph URL

이 동일 origin을 사용하는지 검증한다.

아직 실제 Cloudflare 요청은 하지 않는다.

==================================================
4. 1.5.2 RELEASE / BUILD
==================================================

기존 release tooling으로
새 immutable release 1.5.2 생성.

boost-interior-demo를 새 release에 pin.

새 site build 생성.

기록:

releaseId
releaseHash
buildInputId
siteSnapshotHash
packageHash
files
bytes

1.5.0 / 1.5.1 release byte mutation은 0이어야 한다.

==================================================
5. 공개 데모 SEO 검증
==================================================

최종 HTML에서 직접 확인:

Homepage:
- canonical 있음
- canonical =
  https://interior-demo.boostweb.co.kr/
- meta robots = noindex
- og:title
- og:description
- og:url

다른 주요 페이지:
- noindex
- 올바른 canonical
- 올바른 OG URL

sitemap/robots도 실제 publicOrigin 기준인지 확인.

중요:
noindex demo이지만 sitemap이 존재하는 것 자체는 blocker로 보지 않는다.
다만 URL origin은 정확해야 한다.

==================================================
6. 이메일 검증
==================================================

desktop/mobile browser smoke에서:

contact page:
vnfm0580@gmail.com 표시

정상 길이 문의:
mailto target = vnfm0580@gmail.com

긴 한글 문의:
false success 없음
fallback에 vnfm0580@gmail.com 표시
복사용 내용 정상

확인.

==================================================
7. 전체 회귀
==================================================

현재 실제 script 기준으로:

root typecheck
platform typecheck
runtime typecheck
test:platform
1.5.2 browser smoke
test:publish
test:publish:e2e
release immutability
package QA

전부 수행.

local e2e에서 publicOrigin 때문에 기존 live-only 검사가
실행 불가능하면 이유를 명확히 기록한다.

실제 Cloudflare 호출은 하지 않는다.

==================================================
8. SECOND COMMIT
==================================================

1.5.2 변경과
demo site data 변경,
새 release,
새 build,
관련 tests/docs만 명시적으로 stage한다.

다시 secret scan.

추천 commit:

feat(interior-01): prepare 1.5.2 outreach demo

commit 실행.

push 금지.

==================================================
9. Cloudflare 다음 단계 준비
==================================================

현재:

https://interior-demo.boostweb.co.kr

를 실제 pilot hostname 후보로 기록한다.

기존 boostweb.co.kr zone에
wildcard Worker route가 존재했던 사실을 고려한다.

실제 live deploy 전에 반드시 확인해야 할 것:

- 해당 exact hostname DNS 존재 여부
- Worker route/custom domain 존재 여부
- 기존 BoostWeb/Site Factory route 영향 여부

기존 wildcard route를 수정하거나 삭제하지 않는다.

이번 작업에서는 live resource 생성 금지.

==================================================
10. 최종 보고
==================================================

작성:

docs/result/outreach-demo-151-to-152/

00-summary.md
01-foundation-checkpoint.md
02-152-changes.md
03-seo-and-email-validation.md
04-regression.md
05-cloudflare-readiness.md

최종 출력:

FOUNDATION_COMMIT =
AUTHORITATIVE_WORKTREE =

INTERIOR_152_READY =
RELEASE_ID =
RELEASE_HASH =

DEMO_BUILD_INPUT_ID =
DEMO_PACKAGE_HASH =

DEMO_EMAIL = vnfm0580@gmail.com
DEMO_PUBLIC_ORIGIN = https://interior-demo.boostweb.co.kr

HOMEPAGE_CANONICAL_PASS =
DEMO_NOINDEX_PASS =
OPEN_GRAPH_PASS =
OG_IMAGE = PRESENT / DEFERRED
MAILTO_PASS =

TYPECHECK_PASS =
PLATFORM_TEST_PASS =
PUBLISH_TEST_PASS =
LOCAL_E2E_PASS =

SECOND_COMMIT =

PUSH_PERFORMED = NO
REMOTE_DEPLOYMENT_PERFORMED = NO
BOOSTCHAT_INTEGRATION_IMPLEMENTED = NO

BLOCKERS_BEFORE_LIVE_DEPLOY =

마지막:

WEB_RECON_OUTREACH_DEMO_152_READY
GIT_CHECKPOINTS_CREATED
REMOTE_DEPLOYMENT_NOT_PERFORMED
BOOSTCHAT_INTEGRATION_PENDING