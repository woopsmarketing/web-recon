Task: 23
Title: ProductionSpec & Independent Production Build
Previous: 22-asset-font-independence-2026-08-19.md
Status: Complete

# Task 23 — ProductionSpec & Independent Production Build

Task 20~22가 전부 serve-boundary 프록시(콘텐츠 env, 테마 CSS append, SEO
head splice, asset rewrite)로 전달하던 것을 **하나의 재현 가능한
ProductionSpec + 완전 독립 실행 production 후보**로 구웠다(bake). 결과물은
Next 서버도, run 디렉터리도, 환경변수도, 프록시도 필요 없는 **정적 파일
디렉터리 + 의존성 0의 서버 스크립트**다. Git add/commit/push 0. 과거 run
artifact 수정 0 (frozen template/content/theme/SEO/asset run 전부 작업 시작
이후 mtime 파일 0임을 find로 확인). AI 호출 0. Stripe 전용 하드코딩 0 —
잔존 소스 호스트 목록조차 Task 22 network-qa.json 증거에서 유도된다.

```
Accepted lineage (불변): recon-template 10-45-40-007Z · content-run 10-46-26-129Z
· theme-run 12-07-34-566Z (cool-neutral) · seo-plan 19-26-12-572Z (PREVIEW)
· asset-materialization 05-54-47/54-55Z
  ↓ pnpm production:compile   ① 5개 계층 dir-sha256-v1 해시 → production-spec-v1
  |                           ② template app 복사 + 4계층 BAKE + 정적 export 변환
  |                           ③ next build (output:"export") → out/
  |                           ④ head splice + rewrite-map 적용 + robots + media 복사
  |                           ⑤ 배포 패키지 조립 (site/ + server.mjs + RUN.md)
  ↓ pnpm production:qa        repo 밖 격리 디렉터리로 복사 → env {PATH}만으로
                              server.mjs 기동 → HTTP + real-Chromium QA 159 checks
```

**신규:** `src/production/` (10 files) + 2 CLI (`production:compile` /
`production:qa`) + `pnpm smoke:production` (71 checks) + stripe artifact:
`production-specs/2026-08-19T06-36-35-798Z` ·
`production-builds/2026-08-19T06-36-35-798Z` (package/ 150 MB, report/
bake-report.json + qa.json 포함).

## Executive Summary

> accepted 5계층을 **production-spec-v1**로 고정(계층별 id + 실제 artifact
> 파일 전체에 대한 dir-sha256-v1 해시)하고, template app 사본에 콘텐츠
> (361 slot 값, env 심 제거) · 테마(cool-neutral overlay 742 KB, head
> `<link>`) · SEO(20 route 제목 route-map bake + head 블록 20/20 splice +
> robots.txt) · asset(media 230파일 57.5 MB + rewrite 10,523회)을 전부 구운
> 뒤 **Next static export**(20 route 전부 path-only이므로 가능; build
> 3.7초)로 뽑았다. 배포 패키지를 **repo 밖으로 복사해 env=PATH만으로**
> 자체 server.mjs로 띄우고 실측: 20 route 전부 HTTP 200, 브라우저 title
> 20/20, 주입 한국어 콘텐츠 5/5 노출, 테마 computed-paint 5/5 일치,
> hydration/JS 에러 0, 외부 요청은 replacement-required 표면의
> images.stripeassets.com **4건뿐**(그 외 외부 호스트 0). 도메인·사실·
> 라이선스 blocker 7건이 그대로이므로 정직한 결론은 **PREVIEW 빌드**
> (noindex/nofollow + Disallow all + sitemap 404)다. QA 159/159, smoke 71,
> 전체 회귀 16 suites 1,656 checks PASS.

## ProductionSpec (production-spec-v1)

`data/stripe.com/production-specs/2026-08-19T06-36-35-798Z/production-spec.json`

해시 방법 `dir-sha256-v1`: 계층 run 디렉터리의 **실제 파일 전부**를 각각
sha256 → `<relpath>\t<sha256>` 줄을 경로 정렬로 이어붙인 manifest 텍스트의
sha256이 디렉터리 해시. mtime/순서 무관, 바이트와 경로만 반영. 빌드
부산물(node_modules/.next/out)은 제외로 기록.

| 계층 | id | hash (앞 16) | 파일 | 바이트 |
|---|---|---|---|---|
| template | stripe.com-2026-08-18T10-45-40-007Z (slot v2) | 662b81559987919e | 51 | 70,090,456 |
| contentRun | 2026-08-18T10-46-26-129Z (361 values) | 29ec2f5e7f0fee8d | 29 | 14,515,354 |
| theme | 2026-08-18T12-07-34-566Z · **cool-neutral** · adapter v1 | 08809e202471da11 | 14 | 15,138,806 |
| seoPlan | 2026-08-18T19-26-12-572Z · PREVIEW · needs-input 182 | 93db4c312e9bd50e | 8 | 1,996,368 |
| assets | 2026-08-19T05-54-55-204Z · media 230 · rewrite 278 · seam 340 | 28d3801416138200 | 235 | 60,826,619 |

- `baseUrl`: `{ value: null, status: "needs-input", mode: "preview" }` —
  도메인은 발명하지 않는다.
- `compiler`: web-recon-production-compiler v1.
- **테마 선택 근거**: 3개 accepted theme-run 중 **cool-neutral
  (2026-08-18T12-07-34-566Z)**. 이 run만 manifest에 accepted content run
  (10-46-26-129Z)을 lineage로 기록한 채(주입 한국어 콘텐츠 위에서) QA
  PASS했고, original run은 no-op이라 "테마가 실제로 구워졌다"를 브라우저에서
  증명할 수 없다. original/warm-editorial로 컴파일하려면 `--theme-run`만
  바꾸면 된다(컴파일러는 테마 무관).

## Bake — 프록시 4계층을 artifact 안으로 (A~D)

컴파일러는 template app을 복사한 뒤 **anchor-guard 패치**(생성된 원문과
정확히 일치해야 적용; 불일치·중복·재적용은 즉시 실패)로 4계층을 굽는다.
`report/bake-report.json` 실측:

- **A 콘텐츠**: content run의 `slot-values.json` 361키(unknown 0)를
  `template-data/slot-values.baked.json`으로 복사, `slot-content.ts`에서
  `WR_SLOT_VALUES_FILE` env 심을 제거하고 baked 파일 무조건 읽기로 패치.
  guard/`projectValue`(srcset 제거 규칙 포함) 의미는 그대로 — 기본값과
  값(value) 구분이 보존되므로 Task 18의 lossless 계약 유지.
- **B 테마**: `theme-overlay.css`(742,332 bytes)를
  `public/wr/theme-overlay.css`로 emit, `layout.tsx`에 generated 시트와
  **같은 precedence로 그 뒤에** `<link>` 추가 — React float는 그룹 내 삽입
  순서를 보존하므로 cascade가 프록시의 "시트 뒤에 append"와 동일.
- **C SEO**: rendered-head.json 20 route의 title을 **route-map.json에
  bake**(head `<title>`과 RSC flight 둘 다 route 테이블에서 나오므로 Task
  21 프록시의 flight 문자열 치환이 필요 없어짐; upstreamTitle guard 불일치
  0) → export된 각 HTML의 `</head>` 직전에 head 블록 20/20 splice(제목
  검증 20/20, 실패 0, 이중 splice 거부) → plan의 robots.txt(233 bytes)
  emit. PREVIEW 정책: 모든 route `noindex,nofollow`, `Disallow: /`,
  Sitemap 줄 없음, `/sitemap.xml`은 정적 호스트에서 404 —
  `sitemap.preview.xml`은 패키지 루트의 계획 artifact로만 동봉(서빙 안 됨).
- **D asset**: media 230파일(60,331,730 bytes)을 `site/media/`로 복사,
  rewrite-map 278 entries를 **빌드 산출물에 직접 적용**(Task 22
  `applyRewrite` 재사용, raw/`&amp;`/`&` 3변형·긴 URL 우선): HTML 18개
  파일 4,207회 + RSC flight .txt 54개 파일 6,312회 + generated CSS 1개
  파일 4회 = **10,523회 치환**. 치환 후 사이트 전체에 남은 소스 호스트 URL
  문자열 430회(본문 앵커 + replacement-required 자산 — 아래 Known
  Limitations).

## Build Mode Audit (F) — static export를 선택한 이유

**선택: `output: "export"` (완전 정적).** 근거(정직하게):

1. 검증된 route 테이블 20개가 **전부 path-only**(query-variant 키 0 —
   컴파일러가 확인 후 진행, query 키 존재 시 명시적 실패).
2. 모든 페이지가 빌드 시점에 이미 가진 데이터(route-map + page JSON)로
   렌더되고, route handler / middleware / cookies / headers 사용 0.
3. 콘텐츠가 bake되므로 per-request 렌더의 이유(Task 14의 force-dynamic
   근거)가 소멸 — 응답이 어차피 바이트 동일.
4. 정적 파일이 **런타임 독립의 최강형**: Next 서버·node_modules 자체가
   배포물에서 사라진다.

`next build` 3,670 ms, 22 HTML(20 route + 404 + _not-found) + flight .txt
54개, site 350 files / 146,762,358 bytes.

**행동 delta(스펙에 기록):** ① query string이 붙은 URL이 더 이상 404가
아니다(정적 호스트는 query를 무시; 동적 template app은 route-key 불일치로
404였다). ② per-request 렌더 → 빌드 시 1회 prerender.

## Runtime Independence (E) — 구조적 증명

`pnpm production:qa`가 매 실행마다:

1. `package/`를 **repo 밖** `mkdtemp`(`/var/folders/.../wr-production-qa-*`)로 복사
2. `node server.mjs --port 0`을 **env = { PATH } 단 하나**로 spawn
   (WR_* 없음, cwd는 격리 디렉터리, repo/run 디렉터리 도달 불가)
3. ready 라인 파싱 후 모든 검사를 실 HTTP/실 Chromium으로 수행

`server.mjs`는 컴파일러가 생성하는 **의존성 0**(node:http/fs만) 정적
서버로, smoke에서 fixture site 상대로 18개 HTTP 행동(HTML 매핑, 308
trailing-slash, 404.html, immutable 캐시, traversal 거부, 405, HEAD)을
실검증한다. 정적 host(nginx/S3 등)로 대체 가능한 규칙만 사용.

## QA (H) — 격리 패키지 상대 159 checks / 0 fail

`report/qa.json` (base http://127.0.0.1:50721, isolated dir env=[PATH]):

| 검사 | 결과 |
|---|---|
| 20 route HTTP 200 + text/html | 20/20 |
| served `<title>` = plan title (HTTP 바이트) | 20/20 |
| head 블록 marker + preview `noindex,nofollow` meta | 20/20 + 20/20 |
| 브라우저 title (hydration 후) | 20/20 |
| meta 일관성(desc는 bake된 경우만—uninjected 19 route는 needs-input이라 desc 없음이 정답) + og + twitter + JSON-LD parse | 20/20 |
| hydration/JS 에러 (데스크톱 20 route + 모바일 /) | **0 / 0** |
| 주입 콘텐츠 proof (기본값과 다른 static 한국어 5개, / HTML 포함) | 5/5 |
| 테마: overlay 200 + `<link>` + computed color = 토큰값 | 5/5 클래스 일치 (wr-st006967 등) |
| 인터랙션 샘플: 데스크톱 트리거 클릭 2 → 동적 region 6 가시화; 모바일(390px) 트리거 1 → region 2 (portal 경로) | PASS |
| overflow (scrollWidth ≤ viewport, 데스크톱+모바일 /) | PASS |
| 내부 링크: route-table 내 3개 전부 200, broken 0 | PASS |
| robots.txt Disallow-all·Sitemap 줄 없음 / sitemap.xml 404 / 미지 경로 404 | PASS |
| **외부 요청 census (20 route 전체, 스크롤 없는 full load)** | **총 4건, 전부 images.stripeassets.com** (/: 2, /newsroom/news/tour-berlin-2025: 2), 그 외 외부 호스트 **0**, 예상 외 호스트 0 |

정직한 주석 2개: ① Task 22는 스크롤 유발 lazy-load 포함 3 route에서 4건을
측정했고, 본 QA는 스크롤 없이 20 route 전체를 훑는다 — 측정 방법이 다르며
둘 다 "replacement-required 표면만 남았다"는 같은 사실을 가리킨다. ② 서빙
HTML 안 `stripe.com` 문자열 4,424회(20 route 합) — 대부분 route-table 밖
소스 경로로 가는 본문 앵커(Task 21이 10,420개로 정량화한 그 한계)로,
콘텐츠 계층 소관이며 head/메타에서는 격리 완료.

## Deployment Package (I)

`production-builds/2026-08-19T06-36-35-798Z/package/` (150 MB, 자격증명·
클라우드 불필요):

```
site/                  구운 정적 사이트 전체 (350 files; robots.txt, /media 포함)
server.mjs             의존성 0 정적 서버 (node >= 18)
deploy-manifest.json   spec 참조 + route/제목 표 + 콘텐츠 proof + blocker 목록
sitemap.preview.xml    path-only 계획 artifact (서빙되지 않음)
RUN.md                 실행/배포 규칙 (정적 호스트 매핑 규칙 포함)
```

## Indexability Gate (G) — PREVIEW 판정

blocker 7건이 스펙에 기계 판독 형태로 기록됨(각각 evidence 경로 포함):
`production-domain-needs-input` · `seo-needs-input-values`(182) ·
`replacement-required-assets`(51, 잔존 렌더 표면 4) ·
`fonts-license-needs-review` · `business-facts-needs-input` ·
`uninjected-route-content`(19 route) · `source-brand-inline-svg`(374).
어느 하나도 발명으로 해소하지 않았고, 따라서 **indexable production을
강행하지 않는다**.

## Smoke Tests

`pnpm smoke:production` — **71 checks, 0 failures** (fixture-only: 네트워크·
Chromium·lineage run 불필요): dir-sha256-v1 결정성/제외 규칙, 4개
anchor-guard 패치의 적용·재적용 거부·anchor 부재 실패, route-title bake
(guard 불일치·누락 route 기록), content-proof 선정 규칙(기본값 동일/HTML
escape 값/dynamic surface 제외), export 후처리(head splice·3변형 rewrite·
robots·잔존 카운트·이중 splice 거부), 생성된 server.mjs의 실 HTTP 행동 18종
+ 격리 실행(repo 밖 + env PATH만), 테마 probe 파서, production-spec-v1
스키마 수용/거부.

### 전체 회귀 (16 suites)

| suite | checks |
|---|---|
| smoke:verifier | 81 |
| smoke:selector | 81 |
| smoke:multi-observer | 58 |
| smoke:interaction-detector | 92 |
| smoke:interaction-explorer | 108 |
| smoke:interaction-patterns | 88 |
| smoke:sitespec | 252 |
| smoke:reconstruction | 205 |
| smoke:reconstruction-qa | 134 |
| smoke:e2e | 130 |
| smoke:recon-template | 58 |
| smoke:content-injection | 68 |
| smoke:theme | 47 |
| smoke:seo | 72 |
| smoke:assets | 111 |
| **smoke:production (신규)** | **71** |
| **합계** | **1,656** |

81+81+58+92+108+88+252+205+134+130+58+68+47+72+111 = 1,585 (기존 15 suites,
Task 22 baseline과 동일 — delta 0) + 71 = **1,656 all PASS**.
`smoke:playwright`(환경 sanity)는 종전과 같이 카운트 제외.

## Historical Integrity

- frozen lineage 8개 네임스페이스(template/content/theme-runs 3종/seo-plan/
  asset-inventory/materialization/site-spec/reconstruction)에서 작업 시작
  이후 mtime 변경 파일 **0** (find -newermt 확인).
- 신규 출력은 전부 새 네임스페이스: `production-specs/` · `production-builds/`.
- 중간 실험 사본(static export 타당성 검증)은 삭제 — 최종 run은
  2026-08-19T06-36-35-798Z 하나.

## Known Limitations

1. **PREVIEW다.** blocker 7건(위) 해소 전까지 index 가능한 production은
   존재하지 않는다. canonical/og:url/절대 sitemap 미생성.
2. **잔존 외부 요청 4건**은 설계상 남음(replacement-required 표면 —
   운영자 교체 이미지 대기). 사이트 파일 내 소스 URL 문자열 430회(대부분
   교체 대기 자산과 본문 앵커), 서빙 HTML 내 `stripe.com` 문자열 4,424회
   (본문 앵커 — 콘텐츠 계층의 기존 named limitation).
3. **query-string 행동 delta**: 정적 호스트는 query를 무시한다(스펙에 기록).
4. **route-table 밖 내부 링크는 여전히 404-by-design** — /의 앵커 중
   306개가 테이블 밖(clone에는 없는 소스 경로).
5. QA의 인터랙션은 **샘플**(데스크톱 트리거 3 시도 중 2 클릭 성공·모바일
   2 시도 중 1)이지 Task 17의 27/27 등가성 re-run이 아니다. 등가성은 frozen
   Exact 계층의 검증이고, 여기서는 "구운 정적 산출물에서도 인터랙션
   런타임이 살아 있다"를 확인한다.
6. 폰트는 여전히 fallback 스택(라이선스 미검증 — Task 22 measured cost
   그대로 적용).
7. 배포 패키지는 로컬 디렉터리다 — 실제 배포/CDN/도메인 연결은 비목표.
8. deploy-manifest의 `knownResidualSourceHosts`는 Task 22 network-qa 증거
   기반이므로, 운영자 교체 후 재컴파일 전까지는 갱신되지 않는다.

## Input Requirements (운영자 입력 대기)

Task 21/22에서 이월 + 신규 없음: production 도메인(그때 `seo:plan
--domain` 재생성 → 재컴파일 한 번으로 indexable 경로), business facts,
교체 이미지 51종(우선 렌더 표면 4), 폰트 라이선스 결정, og:image/로고,
19 route 콘텐츠 주입, twitter 핸들.

## Next Phase Readiness

- Task 24 최종 인수는 `production-builds/2026-08-19T06-36-35-798Z/package`
  를 그대로 대상 삼으면 된다(격리 실행 절차는 production:qa가 재현).
- 운영자 입력 도착 시 경로: 새 seo:plan(--domain/--facts) 또는 교체
  materialize → `production:compile`에 새 run 디렉터리 지정 → 새 spec/build
  네임스페이스 생성(과거 run 불변).
- Task 20 이월 테마 다중-route paint 검증 부채는 ROADMAP의 Task 24 항목
  그대로 유효 — 본 QA의 테마 검사는 / 5개 클래스 샘플이다.

## Final Verdict

**PRODUCTION PREVIEW READY** — ProductionSpec(5계층 해시 고정) + 완전 독립
정적 production 후보 + 배포 패키지 + 159/159 QA + 16 suites 1,656 checks.
Indexable 여부는 기술이 아니라 입력(도메인·사실·라이선스·브랜드 자산)의
문제로 남는다.
