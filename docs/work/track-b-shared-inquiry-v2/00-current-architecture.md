# Shared Inquiry Form V2 — Phase 0: 현재 아키텍처 (READ-ONLY 정찰)

```
CANONICAL_SHARED_SOURCE = platform/site/inquiry-client.ts   (브라우저 측 "문의 door": 요청 형태·정규화·전화 규칙. 모든 사이트·모든 Template 공통)
                          platform/site/inquiry.ts          (사이트가 선언하는 endpoint 문서의 schema/검증)
SHARED_FORM_COMPONENT   = templates/interior-01/v1/components/InquiryForm.tsx  (OnlineInquiryForm)
                          templates/interior-01/v1/sections/ContactPage.tsx    (사이트 데이터 → 폼 props)
                          templates/interior-01/v1/template.ts                 (contact.page slot 선언 + neutral default)
CUSTOMER_CONFIG_LAYER   = data/sites/<siteId>/inquiry.json   (lead endpoint = widget/public key 포함 URL 한 줄)
                          data/sites/<siteId>/slots.json     (contact.page: 업체별 문구·개인정보 안내·공사 유형 옵션)
                          data/sites/<siteId>/content/business.json (업체 연락처: 현재 email)
                          data/sites/<siteId>/site.json      (brand, publicOrigin, Template Release pin)
                          data/sites/<siteId>/scripts.json   (위젯 스크립트 + widget key — 문의폼과 별개)
GENERATOR               = platform/cli/template-release.ts → platform/release/release.ts   (Template Release 동결)
                          platform/cli/site-build.ts       → platform/build/site-build.ts  (사이트 패키지 생성 + package QA)
GENERATED_OUTPUT        = data/template-releases/interior-01/<releaseId>/{release.json,files/**}   (git 추적, read-only)
                          data/site-builds/<siteId>/packages/<buildInputId>/{site/**,build-record.json} + current.json/previous.json/history.jsonl (git 추적)
INTERIOR_DEMO_INSTANCE  = data/sites/boost-interior-demo/**  (config/data)  →  data/site-builds/boost-interior-demo/**  (생성물)
                          →  R2 boost-sites-artifacts + routing/interior-demo.boostweb.co.kr.json  →  Worker recon-runtime-pilot
CURRENT_SUBMIT_FLOW     = submit → 필드 정규화 → 브라우저 validation → consent 확인 → submitInquiry(endpoint, {consent,name,phone,message,hp})
                          → POST JSON (cors, credentials omit, redirect error, 15s abort) → 200 {"received":true} 만 "ok", 나머지 전부 "failed"
                          (submission_id 없음 · 오류 구분 없음 · Retry-After 미사용)
```

기준 commit: `1cc6022` (= `origin/main`, ahead/behind 0/0). 조사 시각 2026-10-04.

## 1. 한 장 요약

문의폼은 이미 3계층으로 나뉘어 있다. **interior-demo 전용 코드는 없다.**

```
platform/site/inquiry-client.ts      ← 네트워크에 닿는 유일한 모듈 (플랫폼 소유, vendor/host/key 이름 없음)
        ↑ import (release gate 가 허용하는 유일한 네트워크 door)
templates/interior-01/v1/components/InquiryForm.tsx   ← 폼 UI (Template 소유, fetch/timer/window/crypto 금지)
        ↑ props
templates/interior-01/v1/sections/ContactPage.tsx     ← ctx.inquiry.endpoint + contact.page slot → props
        ↑ SiteContext
data/sites/<siteId>/{inquiry.json, slots.json, content/business.json}   ← 고객별 값
```

고객별로 달라지는 것은 전부 `data/sites/<siteId>/` 의 JSON 이다. 폼 동작은 platform + Template 코드이고,
같은 Template Release 를 pin 한 모든 사이트가 같은 코드를 받는다.

## 2. 흐름별 추적

### 2.1 Canonical source / component / runtime

| 역할 | 파일 | 비고 |
|---|---|---|
| endpoint 문서 schema | `platform/site/inquiry.ts` | `{schemaVersion:1, endpoint}` strict. https·named host·query/fragment/credential 없음. 위반 시 build 실패 (fail-closed) |
| 브라우저 door | `platform/site/inquiry-client.ts` | `submitInquiry()` / `normalizeInquiryText()` / `isInquiryPhone()` / `INQUIRY_PHONE_PATTERN` |
| 폼 component | `templates/interior-01/v1/components/InquiryForm.tsx` | `MailInquiryForm` (endpoint 없는 사이트, mailto hand-off) / `OnlineInquiryForm` (endpoint 있는 사이트) |
| props 조립 | `templates/interior-01/v1/sections/ContactPage.tsx` | `inquiryEndpoint(ctx)` 있으면 online props |
| slot 선언 | `templates/interior-01/v1/template.ts` `contact.page` | 온라인 전용 slot 9개 (1.6.2), 전부 neutral default 보유 |
| 스타일 | `templates/interior-01/v1/styles/template.css` (`.i1-form*`) | |

Template 코드는 release gate (`platform/release/release.ts` `BANNED_IDENTIFIERS`) 때문에
`fetch` / `setTimeout` / `Date` / `window` / `crypto` 를 참조할 수 없다.
→ **submission_id 생성, lifecycle, Retry-After 대기(timer)는 구조상 `platform/site/inquiry-client.ts` 에만 둘 수 있다.**
이는 "공통 코드에 구현" 요구와 정확히 일치하는 위치다.

### 2.2 Customer / site config

- `load.ts` 가 `data/sites/<siteId>/` 를 읽어 SiteSnapshot 을 만든다. `inquiry.json` 은 optional — 없으면 snapshot 에 key 자체가 없고 폼은 mailto hand-off (1.5.x 와 byte-identical). 있는데 잘못되면 build 실패.
- interior-demo 의 값: `inquiry.json` endpoint = `https://boostchat.co.kr/api/widget/<demo widget key>/lead`. widget key 는 **이 JSON 한 곳**에만 있다 (Template/platform 코드에 없음 — `inquiry162.test.ts` G2 가 강제).
- 업체 연락 채널: `BusinessSchema.contact` 는 현재 `email` 만 가진다 (`platform/content/schema.ts`). 전화/Kakao/Naver/Instagram 필드는 content model 에 아직 없다.

### 2.3 Generator → generated artifact

```
templates/interior-01/v1/** + platform/{content,settings,theme,assets,slots,site}/**
   │  template-release.ts  (AST gate → 내용 주소화 → 동결)
   ▼
data/template-releases/interior-01/interior-01-<version>-<hash12>/   (0444, git 추적)
   │  site.json 의 template.{templateVersion,releaseId,releaseHash} 로 pin
   ▼
site-build.ts <siteId> --mode public
   │  repo 밖 임시 workspace 에 release 를 풀고 → snapshot 주입 → pnpm install --offline → next build (static export) → package QA
   ▼
data/site-builds/<siteId>/packages/<buildInputId>/site/**   (git 추적) + current.json
```

- build 는 **live repo 소스가 아니라 pin 된 release snapshot** 으로만 돈다. 따라서 소스를 고친 뒤 release 를 새로 끊고 pin 을 바꾸지 않으면 생성물은 바뀌지 않는다.
- `integration.test.ts` I2b: working tree 의 Template/platform 소스 == pin 된 release (byte 단위). 소스만 고치고 release 를 안 끊으면 여기서 실패한다.
- package QA (`platform/build/qa.ts`): 선언된 endpoint URL 은 `.txt` flight 파일과 `.html` 의 `<script>` body 안에서만 허용 (attribute·JS·CSS 금지).

### 2.4 Publish / release

```
site-publish.ts --site <siteId> --host <hostname> --remote
   plan → upload+verify → seal → (마지막) routing/<hostname>.json pointer 교체
```

- 원격 쓰기는 `RECON_PUBLISH_ALLOW_REMOTE=1` + wrangler OAuth 필요. `--expect-live` / `--expect-package` 로 CAS.
- "현재 live package" 는 repo 가 아니라 R2 의 routing pointer 가 진실이다. repo 의 `current.json` 은 "마지막 로컬 build".
- rollback = pointer 를 직전 package 로 되돌림 (portfolio truth guard 있음).

### 2.5 interior-demo 가 생성되는 경로

`data/sites/boost-interior-demo/**` (config) → 위 2.3 의 build → `data/site-builds/boost-interior-demo/packages/384008316a39…/site/**`
→ publish → `https://interior-demo.boostweb.co.kr`.

**`data/site-builds/boost-interior-demo/**` 는 generated artifact 이다. canonical source 가 아니다.**
직접 고치면 (a) `buildInputId`·package hash 와 내용이 어긋나고 (b) 다음 build 에서 사라지며 (c) 다른 고객 사이트에는 반영되지 않는다.

## 3. 현재 submit flow 의 한계 (V2 가 고칠 것)

| 항목 | 현재 (1.6.2) |
|---|---|
| submission_id | 없음. body 는 정확히 5개 key |
| 중복 클릭 | UI 의 `inFlight` ref + disabled 버튼뿐. 서버 idempotency 미사용 |
| timeout/네트워크 실패 후 재전송 | 서버가 이미 저장했다면 **lead 가 2건** 생길 수 있음 |
| 오류 구분 | 없음 — door 가 `"failed"` 하나만 돌려줌. 400/408/409/429/503 모두 같은 문구 |
| Retry-After | 읽지 않음. 429 직후 바로 다시 누를 수 있음 |
| channel_capacity | 일반 오류와 같은 문구, 대체 연락 수단 안내 없음 |

## 4. BoostChat 서버 계약 (로컬 checkout 의 코드를 읽어 확인)

> 정정 (2026-10-04, 독립 리뷰 M1): 아래는 **로컬 checkout `3ff3a23` 의 코드**를 읽은 것이다. production 에 배포된 route 가
> 같은 계약인지는 Phase 0 에서 확인하지 않았다. publish 전 write-free probe
> (`docs/result/shared-inquiry-form-v2/proof/15-prod-contract-probe.txt` — 6-key body 가 allow-list 를 통과해
> `consent_required` 까지 도달) 와 publish 후 실제 제출 1건으로 확인했다.

출처: `/Users/woops/projects/boost-chat` `src/app/api/widget/[publicKey]/lead/route.ts`, `src/lib/lead/site-lead.ts`, migration `0055`.

- body key 는 allow-list (strict): `consent, hp, submission_id, turnstile_token, name, phone, email, message`. **`source` 는 unknown key → 400.**
- `submission_id`: optional, UUID 모양 (8-4-4-4-12 hex), 서버가 소문자로 정규화.
- unique index `(tenant_id, source, submission_id) where submission_id is not null` + `on conflict do nothing` → 동시 요청도 row 1건.
- 같은 id + 같은 fingerprint(name/phone/email/message) → `200 {"received":true}`, 새 row 없음. 다른 fingerprint → `409 idempotency_conflict`.
- 429 는 `rate_limited` / `channel_capacity` 두 종류. 둘 다 `Retry-After: <초>` + `Access-Control-Expose-Headers: Retry-After` (cross-origin JS 가 읽을 수 있음).
- 10분 방문자 budget(5회/600s)은 idempotency 확인 **전에** 소모된다 → 같은 id 재전송도 6번째부터 429. row 수는 여전히 1.
- gate 실패(미등록 Origin·opt-in 안 됨 등)는 CORS header 없는 403 → 브라우저에서는 network error 로 보인다.
- Turnstile: production 에 `TURNSTILE_*` 미설정 = enforcement OFF. 이번 작업에서 건드리지 않는다.

## 5. 테스트 지형

- 단위/계약: `platform/test/inquiry162.test.ts` (door·schema·gate·package QA·Template source shape; 일부는 demo build 선행 필요)
- 브라우저: `platform/test/publish-e2e.test.ts` D (wrangler dev + Playwright, endpoint 는 `context.route` stub)
- release pin 정합성: `platform/test/integration.test.ts` I2b
- platform tree fingerprint: `ia150/ia151/ia152/step6` — `site/inquiry-client.ts`·`site/inquiry.ts` 는 1.6.2 "added" 로 제외되어 있어 재수정해도 영향 없음
- fixture 사이트: `data/sites/fixture-{small,large,empty}` — 셋 다 `inquiry.json` 없음. **online 문의폼을 쓰는 사이트는 지금 demo 하나뿐** → 두 번째 고객 fixture 가 필요한 이유.

## 6. 설계 결론

1. lifecycle·id·Retry-After·중복 요청 합류·오류 분류 → `platform/site/inquiry-client.ts` (공통 door).
2. 상태 표시·문구 선택·버튼 → `InquiryForm.tsx` (공통 Template component), 문구는 slot (neutral default 보유).
3. 고객별 차이 → `data/sites/<siteId>/` JSON 만.
4. Template 1.6.2 → 1.6.3 (additive: optional slot 추가, route/content-model 변경 없음) → 새 Release → demo re-pin → build → publish.
5. 두 번째 고객 fixture (`data/sites/fixture-…`) 를 같은 generator 로 build 해 동일 기능 포함을 증명.
