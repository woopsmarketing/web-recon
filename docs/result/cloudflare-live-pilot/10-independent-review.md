# 10 — Independent review (fresh context, 2026-09-22)

reviewer 에게 준 지시는 "보안 문제, blast radius, release blocker 를 독립적으로 검토하라" 뿐이고, 원하는 결론은 알려 주지 않았다. reviewer 는 read-only 로 작업했다: Cloudflare API GET, `wrangler r2 … get/info`, 공개 HTTP. repo 와 Cloudflare 는 바꾸지 않았다.

## reviewer 가 직접 확인한 것

- routes: 4개. 기존 3개는 id / pattern / script 가 같고, 새로 생긴 것은 `interior-demo.boostweb.co.kr/*` → recon-runtime-pilot 하나다.
- boostweb / site-factory-next `modified_on` 은 변하지 않았다. default-env `recon-runtime` script 는 없다.
- Custom Domains: 145 → 145. id / hostname / service / zone 으로 비교해 같은 집합이다.
- pilot workers.dev 는 disabled 이고 `…workers.dev` 로 접근하면 404 다. binding 은 `SITES` 하나다.
- R2 `boost-sites-artifacts`: r2.dev disabled, custom domain 없음, CORS 없음. object 158개 = package 156 + seal 1 + pointer 1.
- 배포된 bundle 은 dry-run bundle 과 바이트가 같다 (7,667 B).
- 다른 host (apex, www, 고객 subdomain) 는 pilot 전 snapshot 과 바이트가 같다. `interior-demo` 하나만 pilot 이 받는다.
- Host / SNI 조작, X-Forwarded-Host, 대문자 host, trailing dot, 비표준 port 로도 다른 site 의 pointer 나 임의의 bucket key 에 닿지 않는다.
- 조작한 요청: POST/PUT/OPTIONS/DELETE → 405. `/_package.json`, `/%5Fpackage.json`, `/routing/…json`, 3,000 자와 20,000 자 경로 → package 404 페이지 (500 없음). traversal 과 인코딩한 구분자 → 400.
- HTML 7개와 404 페이지 모두 noindex 다.

## Findings와 처리

| # | 심각도 | 내용 | 처리 |
|---|---|---|---|
| 1 | **MAJOR** | site-factory-next 가 `interior-demo` 가게 slug 를 reserve 하지 않는다. 누가 그 slug 로 가게를 만들면 exact route 가 이기므로 그 가게 대신 demo 가 보인다 | **owner 조치 필요.** site-factory-next 와 BoostWeb 은 이번 작업에서 수정 금지다. `outreach-demo-151-to-152/07` 의 권고와 같다 |
| 2 | MINOR | 요청마다 R2 를 최대 3번 읽는다. cache 와 rate limit 이 없다. Workers plan 은 확인하지 못했다 | 기록. runbook §6 에 이미 적힌 위험이다 |
| 3 | MINOR | zone 의 Web Analytics 가 브라우저 HTML 에 beacon 을 넣는다. 그래서 HTML 에는 ETag, Content-Length, 304 가 없다 | 06 / 07 에 기록. zone 설정이므로 바꾸지 않았다 |
| 4 | MINOR | http 로 접근해도 200 이다 (HTTPS redirect 와 HSTS 없음). TLS 1.0 을 받는다. zone 전체에 원래 있던 상태다 | 기록. zone 에서 결정할 일이다 |
| 5 | MINOR | 보안 header 는 nosniff 하나뿐이다 (frame-ancestors, Referrer-Policy, HSTS 없음) | 기록. runbook §6 에 이미 알려진 항목이다 |
| 6 | MINOR | robots.txt 가 `Allow: /` 와 Sitemap 을 준다. 비 HTML 파일에는 `X-Robots-Tag` 가 없다 | 기록. 1.5.2 Template 설계다 (noindex 를 읽게 하려는 의도). Template 수정은 금지 |
| 7 | MINOR | `src/index.ts` 주석은 로그에 "no query strings" 라고 하지만, `observability.enabled` 때문에 Cloudflare invocation log 에는 URL 과 query 가 남는다 | 기록. 원래 있던 config 이고 이번에 바꾸지 않았다 |
| 8 | INFO | `vnfm0580@gmail.com` 이 공개되어 있고 Email Obfuscation 은 꺼져 있다 | 1.5.2 설계대로다 |
| 9 | INFO | `wrangler.jsonc` diff 는 맞다. uncommitted 상태이고, live route 를 기록한 source 는 이 diff 뿐이다. 머리 주석이 현재 상태와 달랐다 | **머리 주석을 고쳤다.** commit 을 권고한다 (이번 요청에 commit 은 없었다) |
| 10 | INFO | `previous` 가 null 이라 rollback 할 수 없다 | 08 에 기록 (owner 결정) |
| 11 | INFO | DNS 는 API 로 직접 확인하지 못했다 (token 에 DNS read/write 가 없다. 그래서 record 를 만들 수도 없었다) | owner 가 dashboard 에서 `interior-demo` 에 명시 record 가 없는지 확인 |

긴급하게 내리는 방법 (reviewer 확인): route `79fc4145…` 를 지우거나, `env.pilot.routes` 를 다시 주석 처리하고 deploy 한다. 그러면 host 는 wildcard 로 돌아가 site-factory-next 의 404 를 받는다.

## Verdict (reviewer)

> **No release blocker.** 영향 범위는 `interior-demo.boostweb.co.kr` 하나다. 기존 리소스는 모두 그대로이고, bucket 은 private 이며, 배포된 코드는 source 와 같다. 다른 host 의 pointer, seal, 임의의 key 를 제공하게 만들 수 없었다. 단서 세 가지: edge 가 HTML 을 바꾼다, HTTPS 를 강제하지 않는다, `interior-demo` slug 를 reserve 해야 한다 (MAJOR, owner 조치).
