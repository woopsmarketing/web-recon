# 02 — 기존 1.5.2 작업 검토와 이어서 한 구현 (2026-09-22)

이전 세션이 남긴 uncommitted 1.5.2 작업을 먼저 읽고, 방향이 맞는 부분은 그대로 두었다. 처음부터 다시 쓰지 않았다.

## 1. 이어받을 때 상태

| 항목 | 상태 |
|---|---|
| Template 코드 (`layout.tsx`, `page.tsx`, `lib/seo.ts`, `HomeHero.tsx`, `homeHeroData.ts`, `template.ts` 1.5.2) | 구현돼 있음 → **유지** |
| 테스트 / smoke (`ia152.test.ts`, `canonical-152.ts`, ia150/151/step4/5/6/publish-e2e, smoke 3개, `package.json`) | 구현돼 있음 → 대부분 유지, release-pin 가정만 수정 (`03`) |
| `proof/before.json` (1.5.2 작업 전 캡처) | 있음 → 유지 (ia152 의 비교 기준) |
| 1.5.2 release | **아직 안 만듦** |
| demo site data (origin / email / noindex / 문구) | **아직 안 바꿈** (1.5.1 pin, `hello@boost-interior-demo.example`) |
| demo 1.5.2 build | **없음** |
| `step6` K2/K3 가 `references/` 를 읽음 | 미해결 (`04`) |
| "4개 site 모두 1.5.2 로 re-pin" 가정 (`ia152` R3/D2/F1, `step6` B/E/V, `slice1`, `step4/41/5`) | 미해결 (`03`) |

## 2. SEO — 검토 결과 (코드는 그대로)

- **`site.seo.indexing`** (`template.ts`): 새 settings section, `"index" | "noindex"`, **default `"index"`**, slot 없음, `.strict()`. 1.5.1 site 문서는 이 section 이 없어도 그대로 valid (ia152 S1 이 fixtures 와 capture 시점 demo settings 로 확인).
- **robots** (`app/layout.tsx`): preview → `noindex,nofollow` (기존), 그 외 `noindex` 설정 → `<meta name="robots" content="noindex">`, 기본 → 태그 없음 (1.5.1 과 같은 출력). robots.txt / sitemap 은 그대로 두어 crawler 가 noindex 를 읽을 수 있다.
- **noindex 는 site data 에만 있다**: `data/sites/boost-interior-demo/settings.json` 의 `"site.seo": { "indexing": "noindex" }`. Template 에 siteId / origin / 이메일 literal 없음 (ia152 J1 이 Template 전체 파일을 검사).
- **canonical** (`lib/seo.ts` + `app/page.tsx`): public origin 이 있을 때만. 홈은 `path: "/"` → Next 가 `https://interior-demo.boostweb.co.kr` (slash 없음) 로 쓴다. 과제 결정대로 정상으로 인정했고, slash 를 붙이기 위한 새 장치는 만들지 않았다. (ia152 P1 은 `new URL(...)` 로 정규화해 같은 URL 인지 본다.)
- **OpenGraph**: canonical 과 같은 조건, 같은 값 — `og:title` = `<title>`, `og:description` = 페이지의 실제 meta description (없으면 business summary), `og:url` = canonical, `og:type=website`. Next 가 여기서 `twitter:*` 를 파생한다.
- **404**: canonical / OG 없음, noindex (framework 기본).

## 3. og:image — raster guard

`lib/seo.ts`: 홈 hero 의 첫 slide 이미지를 쓰되 `/\.(jpe?g|png|webp|gif)$/` 일 때만. SVG 면 `og:image` 를 **생략**한다. 없는 이미지를 만들지 않고, 외부 URL 을 받지 않는다 (hero 이미지는 `ctx.assets.resolve` 가 site 자산 registry 에서만 푼다).

| site | hero 첫 slide | og:image |
|---|---|---|
| boost-interior-demo | `site-hero-01` (기존 site 자산, JPEG 2400×1350) | `https://interior-demo.boostweb.co.kr/assets/ae004e4b853e6c005daa.jpg` |
| fixtures (1.5.2 로 빌드한 throwaway 사본, ia152 F2) | SVG | 없음 |

새 이미지 생성 / 새 asset pipeline 없음.

## 4. HomeHero / SEO bundle 문제 — 해결 확인

`lib/seo.ts` 는 `../sections/homeHeroData` (순수 data 함수) 만 import 한다. `homeHeroData.ts` 는 `../components/HeroCarousel` 에서 **type 만** import 하고, 값 import 는 `links.ts` / `projectCards.ts` (둘 다 component 값 import 없음) 뿐이다. `HomeHero.tsx` 는 `homeHero` 를 re-export 하고 carousel 만 렌더한다. 같은 함수 하나가 홈 화면과 og:image 의 source of truth.

실제 빌드 결과로 확인 (각 페이지 HTML 이 로드하는 `/_next/static/chunks/*` 합계):

| page | 1.5.1 package `aa71b829…` | 1.5.2 package `18c0a5ef…` |
|---|---|---|
| `/portfolio` | 8 scripts, 587,028 B | 8 scripts, 587,028 B |
| `/about` | 8 scripts, 576,300 B | 8 scripts, 576,300 B |
| `/` | 8 scripts, 581,522 B | 8 scripts, 581,522 B |

→ non-home 페이지에 carousel JS 가 더해지지 않는다. **BUNDLE_REGRESSION_FIXED = YES**.

## 5. 이메일 / 한국어 문구

- 이메일 source 는 하나: `data/sites/boost-interior-demo/content/business.json` `data.contact.email = "vnfm0580@gmail.com"`. demo site data 전체에서 이메일 주소가 나오는 곳은 이 한 줄뿐 (grep 확인). footer mailto, `/contact` 직접 주소, mailto 수신자, fallback 문구는 모두 이 값을 쓴다.
- 문구 (`slots.json` `contact.page`): 
  - `afterSubmit`: `… 메일 앱이 열리지 않으면 {email}로 보내 주세요.` → `… {email} 주소로 보내 주세요.`
  - `tooLong`: `… 아래 내용을 복사해 {email}로 보내 주세요.` → `… {email} 주소로 보내 주세요.`
  
  `{email}` 은 Template 이 치환하는 placeholder 다. site data 에는 이메일에 붙은 조사가 저장되지 않는다 (`{email} 주소로` 는 어떤 주소에도 맞는 문장). 빌드 결과: `vnfm0580@gmail.com 주소로 보내 주세요.` — `…com로` 같은 어색한 문장 없음.
- Template 의 neutral default (영문) 는 바꾸지 않았다 (`{email}` 뒤에 조사가 없는 영어 문장).

## 6. site data (최종)

| 파일 | 변경 |
|---|---|
| `site.json` | `identity.publicOrigin` → `https://interior-demo.boostweb.co.kr`; `template` → 1.5.2 exact pin |
| `settings.json` | `"site.seo": { "indexing": "noindex" }` 추가 |
| `content/business.json` | `contact.email` → `vnfm0580@gmail.com` |
| `slots.json` | 위 문장 두 개만 |

그 밖의 demo 파일은 capture 와 byte-identical (ia152 D1). customer 전용 Template 코드 없음.
