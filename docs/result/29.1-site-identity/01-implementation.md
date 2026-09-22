# Task 29.1 FAST — Site Identity 구현 상세 (2026-09-13)

## 1. 정찰 결과 (구현 전)

| 확인 대상 | 결과 |
|---|---|
| `src/slotized-template/render.ts` | 앱 셸을 복사한 뒤 pages/route-map/CSS만 다시 씀. identity 입력 없음 |
| 템플릿 manifest `source` | `host`, `rootUrl`로 provenance 기록 (`TemplateSourceSchema`) |
| 렌더 결과에서 source host가 남는 곳 | `reconstruction-data/route-map.json`의 `rootUrl`/`routes[].url`, `package.json`의 `name`(`wr-clone-<host>`), `src/generated/generated-config.ts`의 `SOURCE_ROOT_URL` (Task 29 audit가 이미 "provenance surfaces"로 짚었음) |
| 앱 셸 `app/layout.tsx` | `<html>`에 `lang` 없음, canonical/OG 없음. `generateMetadata`는 route title만 사용 |
| 관찰된 `<html>` 노드 | 페이지 트리 루트 wrapper(`data-wr-doc-tag="html"`)가 `lang` 속성을 가짐 |
| 기존 identity 개념 | `src/release`의 `productionBaseUrl`, `slugifySiteId`(보정만 하고 검증하지 않음), `content-injection`의 `siteIdentity{workingName,…}`(의미가 다른 plan 필드). 모두 release/SaaS 파이프라인에 묶여 있어 **import하지 않음**. 용어만 맞춤 (`publicOrigin` ≈ `productionBaseUrl`) |

## 2. SiteIdentity 계약

`src/slotized-template/site-identity.ts` — `SiteIdentitySchema` (zod, strict)

```ts
SiteIdentity {
  schemaVersion: "1"
  brandName: string        // trim 후 비어 있으면 안 됨
  legalName?: string       // 주면 비어 있으면 안 됨
  publicOrigin?: string    // http/https origin만 허용. path·query·hash·계정정보 불가. 끝의 "/"는 origin으로 정규화
  slug: string             // ^[a-z0-9]+(?:-[a-z0-9]+)*$, 최대 64자 (npm 패키지·경로에 안전)
  locale: string           // 비어 있으면 안 됨 + Intl.getCanonicalLocales로 BCP 47 형식 검사
}
```

- 알 수 없는 필드는 거부 (strict). 고객 값을 자동으로 만들지 않음.
- 예시 파일: `fixtures/task29.1/site-identity.example.json`
- 잘못된 identity는 앱 복사 **전에** `SlotizedRenderError`로 거부.

## 3. CLI

```
pnpm render:template \
  --template <slotized manifest.json> \
  --content <content-pack.json> \
  [--theme <theme-pack.json>] \
  [--identity <site-identity.json>] \
  [--out <dir>] [--assert-neutral]
```

renderer는 새로 만들지 않고 기존 `renderTemplate()`에 `siteIdentityFile` 옵션만 추가. `--identity`를 빼면 Task 29 동작과 바이트 단위로 같음.

## 4. identity로 다시 쓰는 surface (`--identity`가 있을 때만)

| Surface | 파일 | 내용 |
|---|---|---|
| route-map-urls | `reconstruction-data/route-map.json` | `rootUrl`과 모든 `routes[].url`을 `publicOrigin`으로 옮김 (path+query 유지). `publicOrigin`이 없으면 **root-relative**로 바꾸고 `SITE_IDENTITY_ORIGIN_MISSING` 경고 (origin을 지어내지 않음). **title은 건드리지 않음** (Content Pack slot) |
| document-locale | `reconstruction-data/pages/*.json` | 관찰된 `<html>` wrapper 노드(`data-wr-doc-tag="html"`)의 `lang`만 변경 (variant당 노드 1개, 원래 `lang`이 있을 때만) |
| package-name | `package.json` | `name` ← `slug` |
| generated-config | `src/generated/generated-config.ts` | `SITE_BRAND_NAME`, `SITE_LEGAL_NAME`, `SITE_PUBLIC_ORIGIN`, `SITE_SLUG`, `SITE_LOCALE`을 씀. 앱 코드가 `SOURCE_ROOT_URL`을 쓰지 않으면 배포되는 config에서 **제거**하고, 쓰면 남기고 경고. 나머지 상수는 유지 |
| layout | `app/layout.tsx` | `<html lang={SITE_LOCALE}>`, `export const metadata`(title/applicationName fallback = brandName, publicOrigin이 있으면 `metadataBase`). route 자체 title(slot)이 우선함 |

- 모든 patch는 생성기(`src/reconstruction/app-template.ts`)가 내보내는 정확한 텍스트를 기준점으로 삼음. 기준점이 정확히 1번 나오지 않으면 `SITE_IDENTITY_SURFACE_UNPATCHED` 경고를 내고 `unpatched`로 보고함 (추측하지 않음).
- identity 적용은 neutrality 비교 **다음에** 실행되므로 `--assert-neutral` 판정에 섞이지 않음.
- 임의 문자열 치환 없음. slot이 가진 보이는 문구(hero/footer 회사명 등)는 절대 바꾸지 않음.

## 5. 일부러 보존한 provenance

| 위치 | 내용 |
|---|---|
| 템플릿 `manifest.json` `source.host/rootUrl` | 변경 없음 (읽기 전용) |
| 렌더 `manifest.json` | `provenance: {sourceOrigin, sourceRootUrl, sourceHost, templateId, templateVersion, reconstructionRunId}` **항상** 기록 + `siteIdentity`(+파일 경로)는 identity가 있을 때만 |
| 렌더 `render-report.json` | `provenance` 항상 기록, `siteIdentity`/`identitySurfaces`는 identity가 있을 때만 |
| 기본 출력 경로 | `data/<sourceHost>/slotized-renders/<run>` 유지 (내부 저장소 key) |

## 6. Source leakage audit 분리 (`src/slotized-template/audit.ts`)

`source-leakage.json`의 새 구조:

- **A. `internalProvenance`** `{allowed: true, refs[]}` — 렌더 자체 기록(`manifest.json`, `render-report.json`)에 나오는 source host. 허용하며 gate에 넣지 않음.
- **B. `publicIdentity`** `{siteIdentityApplied, gated, leaks[]}` — site 수준 public surface(route-map urls, package.json, generated-config, layout)에 나오는 source host/brand.
  - identity가 적용된 렌더에서만 gate에 들어감 (`gate && identityApplied`).
  - identity가 없으면 "no SiteIdentity supplied — report only"로 보고만 함 (Task 29 gate는 그대로).
- 기존 `leaks`(slot에 묶인 content), `unslottableLeaks`, overlay, background 버킷은 그대로. 예전에 `unslottableLeaks`로 들어가던 app-shell provenance 항목은 B로 옮김.
- counts 추가: `publicIdentityLeaks`, `internalProvenanceRefs`, `publicIdentityLeaksByKind`. CLI 출력 줄에도 추가.
- 오탐 수정 2건 (smoke에서 발견):
  1. 앱 셸 코드(`.ts/.tsx`)는 **문자열 리터럴만** 검사. identifier(`PAGE_SOURCE_COUNT`)와 주석은 identity surface가 아님. JSON은 string value만 검사.
  2. `hostLabels` generic 목록에 RFC 2606 예약어(`example`, `test`, `invalid`, `localhost`) 추가.

## 7. 검증

| 항목 | 결과 |
|---|---|
| `tsc --noEmit` | exit 0 |
| `pnpm smoke:site-identity` (신규, 결정적 fixture, 네트워크 없음) | **PASS 50/50** |
| 실제 템플릿 rosee — default pack, identity 없음, `--assert-neutral` | NEUTRAL + reconstruction app과 `diff -rq` 차이 없음 (manifest/report 제외) |
| rosee — realistic + mutated theme, identity 없음 → `template:audit --label realistic` | PASS · leaks 0 · public-identity **9 (보고만, gate 아님)** · internal-provenance 14 (허용) |
| rosee — realistic + mutated theme + `--identity` → audit | PASS · leaks 0 · public-identity **0 (gate 적용)** · internal-provenance 15 (허용) |
| rosee identity 렌더 `next build` + `next start` | build exit 0 · `<html lang="ko-KR">` · `/`와 `/17`의 `<title>`은 realistic Content Pack 값 · `application-name`=Example New Brand |

Smoke가 확인한 것 (source `https://source.example` → identity `Example New Brand` / `https://customer.example` / `example-new-brand`):
- 스키마 검증: 올바른 입력 2건 통과, 잘못된 입력 8건 거부
- identity 없음: package.json/generated-config/layout이 reconstruction과 바이트 동일, route map은 source URL 유지, default pack NEUTRAL, 앱 트리 전체 바이트 동일
- identity 있음: provenance.sourceOrigin=source.example (manifest+report), siteIdentity.publicOrigin=customer.example, 템플릿 manifest 변경 없음, route-map URL(path+query)이 customer origin으로 이동, title은 Content Pack 값, package name=slug, SITE_* 상수 기록, config에 source.example 없음, layout lang/metadata 적용, 페이지 lang=ko-KR, hero/href는 Content Pack 값, pack에 없는 footer("© Source Co")는 identity가 건드리지 않음, surface 5개 rewritten, unpatched 경고 없음
- audit: identity 렌더는 public identity leak 0 + gate 적용, internal provenance는 허용, 남은 footer 문구는 **content** leak(slot 소속)로 분류. identity 없는 렌더는 identity surface 3곳 이상을 public leak로 보고하되 gate에 넣지 않음
- `publicOrigin` 없음: root-relative URL + `SITE_IDENTITY_ORIGIN_MISSING`. 잘못된 origin: 렌더 전에 거부

실행하지 않음: Task 29 E2E 전체, 과거 regression 전체, smoke:all (FAST 정책).

## 8. 실행 산출물 (scratch, 삭제해도 됨)

`tmp/wr291/` — `identity-rosee.json`, `r-default/`, `r-realistic/`, `r-identity/`(+`.next`), `audit-*/`, `build.log`. `data/` 아래는 아무것도 수정하지 않음 (확인함).
