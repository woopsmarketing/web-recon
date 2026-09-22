# 05 — 알려진 다음 항목 (분류만, 수정 없음) (2026-09-22)

이번 작업에서는 아래 어느 것도 고치지 않았다. 코드, release, build 는 그대로다.

분류 기준:

- **NEXT_SMALL_PATCH** — 다음 template release(1.5.2) 하나에 묶을 수 있는 작은 수정. platform / runtime 계약을 바꾸지 않는다.
- **LATER** — 지금 고칠 이유가 없다. 설계상 한계로 문서화돼 있고, 현재 운영 방식에서 문제가 되지 않는다.
- **REAL_CUSTOMER_TRIGGER** — 실제 고객 또는 실제 콘텐츠가 그 조건을 만들 때 시작한다. 그 전에는 만들지 않는다.

| # | 항목 | 분류 | 근거 (보고서 · 코드) | 왜 이 분류인가 |
|---|---|---|---|---|
| 1 | homepage 에 `<link rel="canonical">` 없음 | **NEXT_SMALL_PATCH** | `static-deployment-foundation/00-summary.md:87`, `06-local-validation.md:78` · `templates/interior-01/v1/app/page.tsx` 가 `lib/seo.ts` 의 `pageMetadata()` 를 호출하지 않는다 | 호출 한 곳 추가. 다른 페이지는 이미 같은 helper 를 쓴다. e2e 의 "known-gap 목록"에서 한 줄이 빠지므로 수정 여부가 테스트로 드러난다. 공개 hostname 에 올리기 전에 필요 |
| 2 | 연락 수단이 없는 사이트의 `/contact` 가 색인 가능 (R10) | **NEXT_SMALL_PATCH** | `00-summary.md:86`, `08-independent-review.md:29` · `templates/interior-01/v1/app/contact/page.tsx:9-12` | template 안에서 `noindex` 만 추가하면 된다. demo 는 email 이 있어 영향이 없다. route 자체를 없애는 것은 platform route-gating 이 필요하므로 이 patch 의 범위가 아니다 (그 부분은 LATER) |
| 3 | OpenGraph 태그 없음 | **NEXT_SMALL_PATCH** | `00-summary.md:87` | `pageMetadata()` 확장으로 1, 2 와 같은 release 에 들어간다. 단, `og:image` 에 쓸 이미지 slot 을 정해야 하고, 그 결정은 1.5.2 범위를 정할 때 한다. 이미지 없이 title / description / url 만 먼저 넣는 것도 가능 |
| 4 | JSON-LD 없음 | **REAL_CUSTOMER_TRIGGER** | `00-summary.md:87`, `06-local-validation.md:78` | `LocalBusiness` 구조화 데이터에는 실제 상호, 주소, 전화, 영업 지역이 필요하다. 가상의 demo 에 넣으면 거짓 사업자 정보를 구조화해서 내보내게 된다. 첫 실제 고객의 사업자 정보가 들어올 때 schema 와 함께 만든다. runtime 이 태그를 주입하지 않는다는 원칙은 유지 |
| 5 | `mailto:` → inquiry backend 전환 (R3: 한글 약 165자 한도) | **REAL_CUSTOMER_TRIGGER** | `08-independent-review.md:17`, `01-151-validation.md:97` · `templates/interior-01/v1/components/InquiryForm.tsx:46` | backend 는 수신처, 스팸 방지, 개인정보 처리 방침이 정해져야 하고, 이것은 실제 고객이 문의를 받기 시작할 때 생기는 요구다. 1.5.1 은 한도를 넘으면 복사 fallback 을 정직하게 보여 준다. 1.5.2 에 "남은 글자 수" 안내를 넣는 작은 개선은 NEXT_SMALL_PATCH 에 같이 넣을 수 있다 |
| 6 | runtime 의 video `Range` 미지원 | **REAL_CUSTOMER_TRIGGER** | `00-summary.md:88`, `03-static-delivery-contract.md:139`, `05-recon-runtime-design.md:189-190` · 경고는 `platform/publish/publish.ts:275` | 현재 demo, fixture, template 어디에도 video 파일이 없다 (mp4/webm 0개). publisher 는 package 에 video 가 있으면 publish 시점에 경고한다. video 를 쓰는 첫 사이트가 나올 때 구현한다 |
| 7 | 동시 remote publish 에 compare-and-swap 없음 | **LATER** | `00-summary.md:89`, `03-static-delivery-contract.md:92`, `07-live-deploy-plan.md:159` · `platform/cli/site-publish.ts:60,65-66` | `wrangler r2 object put` 에 조건부 쓰기가 없다. `--expect-live` 가 경쟁 구간을 좁히고, pilot 은 "hostname 당 publisher 한 명"으로 운영한다. publish 를 자동화하거나 여러 주체가 돌리게 되면 R2 `onlyIf` / S3 `If-Match` 로 store 를 바꾼다 |
| 8 | runtime 이 요청마다 seal(`_package.json`)을 다시 읽지 않음 | **LATER** | `03-static-delivery-contract.md:60` · `workers/recon-runtime/src/contract.ts:9-11` | 의도된 설계다. "검증된 seal 없이는 pointer 를 쓰지 않는다"를 publisher 가 보장하고, pointer 는 마지막에 쓴다. 요청마다 R2 read 를 하나 더 하면 비용과 지연이 늘어난다. bucket 에 쓸 수 있는 주체가 publisher 말고 더 생기면 다시 검토한다 |

## 추가로 드러난 작은 항목 (1차 리뷰 추적에서 나옴, `04` §5.2)

| # | 항목 | 분류 | 근거 | 왜 |
|---|---|---|---|---|
| 9 | `publish-surface` fingerprint 가 `platform/publish/` 를 통째로 제외한다 (1차 리뷰 n3) | **LATER** | `platform/test/publish-surface.ts:6-8` | "platform 은 바뀌지 않았다" 검사가 publish 영역의 변경을 보지 못한다. publish 코드가 안정되면 제외 범위를 명시적 파일 목록으로 좁힌다. 테스트 강화이고 배포 동작과는 무관 |
| 10 | `--persist-to` 값이 검증 없이 wrangler 로 넘어간다 (1차 리뷰 n4 의 남은 부분) | **LATER** | `platform/cli/site-publish.ts:77`, `platform/publish/wrangler-store.ts:54` | local 모드 전용 flag 이고 값은 로컬 miniflare 상태 디렉터리 경로다. remote 경로에는 영향이 없다 |

## 요약

```
NEXT_SMALL_PATCH_ITEMS = homepage canonical · no-contact /contact noindex · OG (title/description/url)
                         [선택: mailto 남은 글자 수 안내]
DEFERRED_ITEMS         = LATER: concurrent remote publish CAS · runtime seal 추가 read
                         REAL_CUSTOMER_TRIGGER: JSON-LD · mailto → backend · video Range
```

NEXT_SMALL_PATCH 3건은 모두 template 영역이라 **새 immutable release(1.5.2)** 가 필요하다. 이번 작업에서는 만들지 않았다. 1.5.2 를 만들면 demo 를 다시 build 하게 되고 buildInputId / packageHash 가 바뀐다. 공개 pilot 의 L1(`publicOrigin` 을 실제 hostname 으로 다시 굽기)도 rebuild 가 필요하므로, 두 작업을 한 번의 rebuild 로 묶는 편이 낫다.
