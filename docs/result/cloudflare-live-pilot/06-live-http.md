# 06 — Live HTTP + SEO (2026-09-22, 1.5.2 live)

실제 인터넷에서 `https://interior-demo.boostweb.co.kr` 를 확인했다. 원본: [`proof/live-http-152.json`](proof/live-http-152.json), [`proof/live-seo-152.json`](proof/live-seo-152.json), 기존 e2e 의 live mode: [`proof/live-e2e-152.json`](proof/live-e2e-152.json) / [`.log`](proof/live-e2e-152.log).

## 경로별

| path | status | content-type | cache-control | ETag | nosniff | redirect | package 와 바이트 동일* |
|---|---|---|---|---|---|---|---|
| `/` | 200 | text/html; charset=utf-8 | public, max-age=0, must-revalidate | **없음** (edge) | nosniff | 없음 | edge 변경 (아래) |
| `/portfolio` | 200 | text/html | 〃 | 없음 | nosniff | 없음 | 〃 |
| `/portfolio/buk-32py-kitchen-bathroom-renewal` | 200 | text/html | 〃 | 없음 | nosniff | 없음 | 〃 |
| `/portfolio/dalseo-24py-white-natural-newlywed-home` | 200 | text/html | 〃 | 없음 | nosniff | 없음 | 〃 |
| `/3d-portfolio` (portfolio3d) | 200 | text/html | 〃 | 없음 | nosniff | 없음 | 〃 |
| `/about` | 200 | text/html | 〃 | 없음 | nosniff | 없음 | 〃 |
| `/contact` | 200 | text/html | 〃 | 없음 | nosniff | 없음 | 〃 |
| `/robots.txt` | 200 | text/plain; charset=utf-8 | public, max-age=0, must-revalidate | W/"…" | nosniff | 없음 | **동일** |
| `/sitemap.xml` | 200 | application/xml | public, max-age=0, must-revalidate | W/"…" | nosniff | 없음 | **동일** |
| `/not-real` | **404** | text/html (package 404.html) | no-store | 없음 | nosniff | 없음 | — |
| `/assets/ae004e4b853e6c005daa.jpg` (대표 이미지 = og:image) | 200 | image/jpeg | public, max-age=31536000, immutable | "4330c6cf…" (strong) | nosniff | 없음 | **동일** |

\* 압축 없이 받은 본문과 local package 파일의 sha256 을 비교했다.

기타:

| 검사 | 결과 |
|---|---|
| HEAD `/` | 200, 본문 0 B |
| 조건부 GET, 이미지 (strong ETag) | 304 |
| 조건부 GET, robots.txt (weak ETag) | 304 |
| 조건부 GET, HTML | 불가. edge 가 HTML ETag 를 지운다 |
| POST `/` | 405 |
| `/..%2f..%2fx` | 400 |
| `/about/` (trailing slash), `/index.html` | 404, redirect 없음 (설계대로 redirect 를 하지 않는다) |
| `/_package.json` (seal) | 404 (URL 로 접근 불가) |
| 7개 HTML 페이지가 참조하는 same-origin URL 49개 | 모두 200, **broken asset 0** |
| sitemap `<loc>` 13개 | 모두 200 (e2e) |
| 기존 e2e: package 파일 154개 중 addressable 파일 바이트 동일 | **141/154**. 다른 13개는 모두 HTML 이다 (아래) |

## Edge 에서 HTML 이 바뀐다 (관찰, web-recon 코드 결함 아님)

`boostweb.co.kr` zone 에는 **Cloudflare Web Analytics (RUM) 자동 삽입**이 켜져 있다. 압축 없이 HTML 을 받는 요청에는 `</body>` 앞에 다음 스크립트가 들어간다.

```html
<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/…" … data-cf-beacon='{"version":"2024.11.0","token":"6a512d24…",…}' crossorigin="anonymous"></script>
```

- 같은 삽입이 `boostweb.co.kr` 와 site-factory-next 고객 사이트 (`gangnal-pibugwa-byeongwon`, `hangyeol-semu`) 에도 들어간다 → zone 전체에 원래 있던 설정이다. 이번 pilot 이 만든 것이 아니다.
- HTML 을 바꾸는 edge 기능이 있으므로 Cloudflare 가 **HTML 의 `ETag` 와 `Content-Length` 를 지운다**. 비 HTML 은 영향이 없다 (edge Brotli 로 weak ETag, 이미지는 strong ETag 가 그대로 남는다).
- `curl` 기본 (압축 없음, beacon 없음) 으로 받은 `/` 는 package `index.html` 과 57,793 B 로 **바이트까지 같다**. R2 에 있는 package 자체는 readback 156/156 과 reverify 156/156 으로 확인했다.
- zone 설정 조회 권한이 없고 ([01](01-cloudflare-auth.md)), zone 은 BoostWeb 과 같이 쓰므로 **설정은 바꾸지 않았다**.

이 때문에 기존 e2e 의 live mode 에서 16건이 FAIL 했다 (HTTP 2건 + 브라우저 14건). 16건 모두 이 한 가지 원인이다. assertion 은 약하게 고치지 않았다. 처리 방법은 [00-summary](00-summary.md) OBSERVATIONS 에 적었다.

## SEO (실제 homepage)

| 항목 | 기대 | 실제 |
|---|---|---|
| robots | noindex | `<meta name="robots" content="noindex">`. 7개 페이지 모두 noindex |
| canonical | `https://interior-demo.boostweb.co.kr` | `https://interior-demo.boostweb.co.kr` |
| og:title | 있음 | `부스트 인테리어` |
| og:description | 있음 | `생활에 맞춘 설계로 더 편안하고 정돈된 집을 만듭니다. 화이트톤 아파트 리모델링과 실거주 중심의 수납과 동선 설계를 합니다.` |
| og:url | `https://interior-demo.boostweb.co.kr` | 일치 |
| og:image | `https://interior-demo.boostweb.co.kr/assets/ae004e4b853e6c005daa.jpg` | 일치 → **200 image/jpeg 108,473 B**, immutable |
| robots.txt Sitemap | origin == BASE | `Sitemap: https://interior-demo.boostweb.co.kr/sitemap.xml` |
| sitemap loc origin | 전부 BASE | 13개, origin 밖 주소 0 |
| live 전용 검사 (local 에서 skip 됐던 것): canonical origin == BASE, sitemap origin == BASE | 실행 | e2e `live mode: every canonical URL and every sitemap <loc> share BASE's origin` **ok** (canonical 13, loc 13, 위반 0) |
| e2e SEO: `/`, `/portfolio`, detail, `/about` 의 title / description / canonical / ld+json 이 package 와 일치 | — | ok ×4 |

robots.txt 는 `Allow: /` 다. 페이지의 noindex 를 crawler 가 읽을 수 있어야 하므로 의도된 값이다 (1.5.2 설계).

```
LIVE_HOME      = PASS (200, noindex, canonical/OG 정확)
LIVE_PORTFOLIO = PASS (/portfolio, detail 2, /3d-portfolio 200)
LIVE_CONTACT   = PASS (200, mailto vnfm0580@gmail.com)
LIVE_ASSET     = PASS (og:image 200 image/jpeg, immutable, strong ETag, 304)
LIVE_404       = PASS (/not-real 404, package 404.html, no-store)
LIVE_NOINDEX   = PASS
LIVE_CANONICAL = PASS
LIVE_OG        = PASS
LIVE_SITEMAP   = PASS
HTML ETag      = 없음 (zone Web Analytics 삽입 때문에 edge 가 지운다. 관찰 사항)
```
