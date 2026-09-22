# 02 — 변경 전 live 상태 (read-only, 2026-09-22 06:28Z)

모든 값은 Cloudflare API `GET` 으로 실제 account 에서 다시 읽었다. 원본: [`proof/cloudflare-state.json`](proof/cloudflare-state.json) `before`.

## Zone

`boostweb.co.kr` — active, plan Free Website, account = 인증 계정과 같음.

## Workers Routes (`GET /zones/:id/workers/routes`)

| pattern | script | route id |
|---|---|---|
| `*.boostweb.co.kr/*` | site-factory-next | f1cdedb1… |
| `*/*` | site-factory-next | ffda4b9f… |
| `boostweb.co.kr/*` | boostweb | 072da4d0… |

owner 가 캡처한 3개와 **정확히 일치**. exact route `interior-demo.boostweb.co.kr/*` 는 **없음**.

## Workers scripts (`GET /accounts/:id/workers/scripts`)

| script | modified_on |
|---|---|
| boostweb | 2026-09-14T04:06:18.828337Z |
| site-factory-next | 2026-08-28T15:11:05.253337Z |

`recon-runtime` / `recon-runtime-pilot`: **없음**.

## Workers Custom Domains (`GET /accounts/:id/workers/domains`)

145개. 그중 `boostweb.co.kr` 계열은 `boostweb.co.kr → boostweb` 하나뿐이다. `interior-demo` 로 시작하는 것은 없다.

## R2 buckets

`site-factory-images`, `site-factory-isr-cache` 둘뿐이고 `boost-sites-artifacts` 는 **없음**.

## DNS

API 로는 DNS record 를 읽을 권한이 없다 (01). owner 가 캡처한 `*.boostweb.co.kr AAAA 100:: Proxied` 를 공개 DoH (`cloudflare-dns.com`) 로 간접 확인했다.

| 이름 | A / AAAA |
|---|---|
| `interior-demo.boostweb.co.kr` | 172.67.182.188, 104.21.18.162 / 2606:4700:3035::ac43:b6bc, 2606:4700:3031::6815:12a2 |
| 존재하지 않는 임의 subdomain | 같은 Cloudflare anycast 주소 |
| CNAME | 없음 |

아무 label 이나 Cloudflare proxy 주소로 풀린다. 즉 proxied wildcard 가 있다. `WILDCARD_DNS_CONFIRMED = YES` (owner 캡처 + DoH 로 간접 확인).

## HTTP baseline

| URL | 결과 |
|---|---|
| `https://interior-demo.boostweb.co.kr/` | 404, `x-opennext: 1` → site-factory-next 가 응답. 이 이름으로 된 가게가 없다 |
| `https://boostweb.co.kr/` | 200 `부스트웹 — 고객이 문의하기 쉬운 웹사이트 초안 제작` |
| `https://gangnal-pibugwa-byeongwon.boostweb.co.kr/` | 200 `강남 피부과 병원 — 피부과 병원` (site-factory-next) |
| `https://hangyeol-semu.boostweb.co.kr/` | 200 `한결 세무회계사무소 — 세무회계사무소` (site-factory-next) |

## 판정

owner 캡처와 차이 없음 → write 진행.
