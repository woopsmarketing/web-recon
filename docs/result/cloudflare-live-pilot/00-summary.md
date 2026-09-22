# 00 — Cloudflare live pilot 종합 (2026-09-22)

boost-interior-demo 1.5.2 를 `https://interior-demo.boostweb.co.kr` 에 실제로 배포했다. 새로 만든 것은 private R2 bucket 1개, Worker 1개, exact route 1개와 그 bucket 안의 object 들이다. 기존 route, Worker, custom domain, DNS, zone 설정은 하나도 바꾸지 않았다. 1.5.2 → 1.5.1 rollback drill 은 **owner 결정으로 하지 않았다** ([08](08-rollback.md)).

| 문서 | 내용 |
|---|---|
| [01-cloudflare-auth](01-cloudflare-auth.md) | git 상태, wrangler 실행 방식, OAuth 인증, scope, 권한이 없던 read |
| [02-live-routes-before](02-live-routes-before.md) | 변경 전 routes, scripts, custom domains, R2, DNS (DoH), HTTP baseline |
| [03-r2-worker](03-r2-worker.md) | local artifact 재검증, local gate, private bucket, pilot Worker deploy |
| [04-exact-route](04-exact-route.md) | exact route 생성과 전후 diff |
| [05-remote-publish](05-remote-publish.md) | 기존 publisher: upload → verify → seal → reverify → pointer last |
| [06-live-http](06-live-http.md) | 경로별 HTTP, SEO, edge 의 HTML 변경 |
| [07-live-browser](07-live-browser.md) | Playwright 1440/390, interaction, live 전용 검사 |
| [08-rollback](08-rollback.md) | rollback drill 을 못 한 이유와 owner 결정 |
| [09-existing-service-regression](09-existing-service-regression.md) | boostweb, 고객 subdomain, 적용 범위 증명 |
| [10-independent-review](10-independent-review.md) | fresh-context review (blocker 0, MAJOR 1 = owner 조치) |
| [`proof/`](proof/) | Cloudflare 상태 JSON, publish 로그, live HTTP/SEO/browser/e2e 결과, pointer, 스크린샷 (png 는 gitignore) |

## 실행 순서 (UTC)

| 시각 | 단계 |
|---|---|
| 06:27 | `pnpm exec wrangler whoami` → OAuth OK. HEAD `a2500f9`, tree clean |
| 06:28 | read-only 로 routes / scripts / custom domains / R2 / DoH / HTTP baseline 조회. owner 캡처와 일치 |
| 06:3x | typecheck (runtime, platform) PASS. `publish.test` 59/0. offline remote dry-run (packageHash, origin 일치) |
| 06:32:31 | `r2 bucket create boost-sites-artifacts --location apac` → r2.dev disabled, domain 0 |
| 06:33:14 | `deploy --env pilot` (route 없음) → version 8d9df0ca, workers.dev off |
| 06:33:48 | `env.pilot.routes` 활성화 후 deploy → version 5d9afa05, route `interior-demo.boostweb.co.kr/*`. host 는 `404 unknown host` |
| 06:35–06:37 | `--check-store` → `--no-activate` (156 upload, 156 verify, seal) → `--reverify` (156) |
| 06:37:56 | `--expect-live none` → pointer 기록 (마지막 단계) |
| 06:38–06:50 | live HTTP / SEO / e2e live mode / 보조 브라우저 / regression |
| 이후 | rollback: owner 결정으로 생략. 최종 상태 확인, 독립 review |

## 이번 작업에서 바꾼 파일 (uncommitted)

- `workers/recon-runtime/wrangler.jsonc`: `env.pilot.routes` 에 exact route 1개와 주석. live route 를 기록한 source 는 이 파일이다 → **commit 을 권고한다**.
- `AUTHORITATIVE_WORKTREE.md`: "배포된 것이 없다" 는 줄을 live pilot 사실로 바꿨다.
- `docs/result/cloudflare-live-pilot/**` (이 보고서).
- `docs/result/static-deployment-foundation/proof/live-e2e.json`: e2e live mode 가 정해진 위치에 쓴 결과다. 사본이 `proof/live-e2e-152.json` 에 있다.

## 최종 출력

```
CLOUDFLARE_AUTH = OK — wrangler OAuth (pnpm exec wrangler whoami), account "Qkrrmaehd8390@gmail.com's Account" (owner of zone boostweb.co.kr); token never printed

WILDCARD_DNS_CONFIRMED = YES (owner capture + public DoH: interior-demo and random labels resolve to Cloudflare proxy IPs; API DNS read not permitted for this token)

ROUTES_BEFORE =
*.boostweb.co.kr/* -> site-factory-next
*/* -> site-factory-next
boostweb.co.kr/* -> boostweb

EXACT_ROUTE_BEFORE = ABSENT

R2_BUCKET = boost-sites-artifacts
R2_EXISTED_BEFORE = NO (created 2026-09-22T06:32:31Z, location APAC)
R2_PRIVATE = YES (r2.dev disabled, no custom domain, no CORS, Worker binding SITES only)

WORKER = recon-runtime-pilot (env.pilot of workers/recon-runtime/wrangler.jsonc, version 5d9afa05-60d3-49f3-8d1e-b74ba620be57)
WORKER_DEPLOYED = YES (workers_dev=false, preview_urls=false)

EXACT_ROUTE_CREATED =
interior-demo.boostweb.co.kr/* -> recon-runtime-pilot

EXISTING_ROUTE_MODIFIED = NO
EXISTING_ROUTE_DELETED = NO

REMOTE_PUBLISH = PASS — existing publisher only; uploaded 156, readback-verified 156, sealed, reverified 156, pointer written last (--expect-live none)

LIVE_HOME = PASS (200 text/html, max-age=0 must-revalidate, nosniff)
LIVE_PORTFOLIO = PASS (/portfolio, 2+ details, /3d-portfolio all 200)
LIVE_CONTACT = PASS (200, mailto vnfm0580@gmail.com, long Korean inquiry -> copy fallback)
LIVE_ASSET = PASS (og:image 200 image/jpeg, immutable, strong ETag, 304; 49 referenced URLs 0 broken)
LIVE_404 = PASS (/not-real 404 with package 404.html, no-store)

LIVE_NOINDEX = PASS (all pages noindex)
LIVE_CANONICAL = PASS (https://interior-demo.boostweb.co.kr; live-only canonical origin == BASE: 13/13)
LIVE_OG = PASS (og:title, og:description, og:url, og:image = …/assets/ae004e4b853e6c005daa.jpg -> 200)
LIVE_SITEMAP = PASS (robots Sitemap origin == BASE; 13 <loc> all BASE, all 200)

LIVE_DESKTOP = PASS (1440: overflow 0, nav, gallery, contact ok)
LIVE_MOBILE = PASS (390: overflow 0, mobile menu, gallery, contact ok)
LIVE_CONSOLE_ERRORS = 0
LIVE_BROKEN_IMAGES = 0

BOOSTWEB_ROOT_REGRESSION = PASS (boostweb.co.kr 200, same title; boostweb Worker modified_on unchanged)
EXISTING_SUBDOMAIN_REGRESSION = PASS (gangnal-pibugwa-byeongwon, hangyeol-semu, haru-pilates 200 via site-factory-next; lookalike/random labels still site-factory-next; only interior-demo changed)

ROLLBACK_152_TO_151 = NOT RUN — owner decision: no origin-correct 1.5.1 package (local 1.5.1 is baked for boost-interior-demo.example, indexable, fake contact; site pin blocks a 1.5.1 rebuild)
REPUBLISH_151_TO_152 = NOT RUN — same reason; 1.5.2 has been live continuously since 06:37:56Z

FINAL_RELEASE = interior-01-1.5.2-d87807590d64
FINAL_PACKAGE_HASH = cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202

BLOCKERS =
  (live 1.5.2 release) none — independent review: no release blocker
  (rollback drill) needs a second origin-correct sealed package (runbook §3-11); owner chose to skip

OBSERVATIONS =
  1. MAJOR / owner action: reserve "interior-demo" (and a demo-host naming rule) in site-factory-next store-slug validation — otherwise a future store with that slug would be shadowed by the exact route.
  2. Zone-level Cloudflare Web Analytics auto-injects static.cloudflareinsights.com beacon into browser HTML on every boostweb.co.kr host (pre-existing, also on boostweb.co.kr and stores). Effects: 1 external request per page, HTML ETag + Content-Length stripped (no HTML 304). Existing e2e live mode = 25 pass / 16 fail / 5 skip; all 16 fails are this one cause; assertions not weakened. Fix is an owner/zone decision (exclude host from Web Analytics, or a runtime no-transform decision).
  3. HTTP is not redirected to HTTPS, no HSTS, TLS 1.0 accepted — zone-wide, pre-existing.
  4. Runtime sends only nosniff (no frame-ancestors / Referrer-Policy / HSTS) — known in runbook §6.
  5. robots.txt Allow: / + Sitemap and no X-Robots-Tag on non-HTML — 1.5.2 Template design (noindex must be crawlable).
  6. observability.enabled logs full request URLs incl. query in Cloudflare invocation logs; src/index.ts comment says otherwise (pre-existing).
  7. R2 bucket info object_count lags (showed 0); actual objects confirmed by readback / check-store / reviewer (158).
  8. Token cannot read DNS or zone settings; confirm in dashboard that no explicit interior-demo DNS record exists.
  9. wrangler.jsonc route diff is uncommitted and is the only source record of the live route — commit recommended.
 10. Takedown: delete route 79fc4145… (or re-comment env.pilot.routes and deploy) → host falls back to site-factory-next 404; bucket/packages remain.
```

마지막:

```
WEB_RECON_CLOUDFLARE_LIVE_PILOT_COMPLETE
INTERIOR_DEMO_PUBLIC
ROLLBACK_VERIFIED = NO (not run — owner decision)
FINAL_STATE_152
```
