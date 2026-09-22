# 09 — 기존 서비스 regression (2026-09-22)

모두 read-only (공개 HTTP GET 과 Cloudflare API GET) 로 확인했다. 응답 주체는 header 로 구분했다: `x-opennext: 1` 이면 site-factory-next / boostweb (둘 다 OpenNext), `x-opennext` 없이 `x-content-type-options: nosniff` 이면 recon-runtime. 원본: [`proof/regression-final.txt`](proof/regression-final.txt), [`proof/cloudflare-state.json`](proof/cloudflare-state.json)

## HTTP (exact route 생성 후, 작업 마지막에 한 번 더)

| URL | 전 | 후 (최종) | 응답 주체 |
|---|---|---|---|
| `https://boostweb.co.kr/` | 200 `부스트웹 — 고객이 문의하기 쉬운 웹사이트 초안 제작` | 200, 제목 같음 | OpenNext (boostweb) |
| `https://boostweb.co.kr/portfolio` | — | 200 `만든 사이트와 디자인 · 부스트웹` | OpenNext |
| `https://www.boostweb.co.kr/` | — | 301 → `https://boostweb.co.kr/` | — |
| `https://gangnal-pibugwa-byeongwon.boostweb.co.kr/` (실제 고객 subdomain) | 200 `강남 피부과 병원 — 피부과 병원` | 200, 제목 같음 | OpenNext (site-factory-next) |
| `https://hangyeol-semu.boostweb.co.kr/` (실제 고객 subdomain) | 200 `한결 세무회계사무소 — 세무회계사무소` | 200, 제목 같음 | OpenNext (site-factory-next) |
| `https://haru-pilates.boostweb.co.kr/` | 200 | 200 `하루필라테스 — 필라테스 스튜디오` | OpenNext (site-factory-next) |
| `https://interior-demo.boostweb.co.kr/` | 404 (site-factory-next) | **200 `부스트 인테리어`** | **recon-runtime** |
| `https://interior-demo2.boostweb.co.kr/` | — | 404 | OpenNext (site-factory-next) |
| `https://demo-interior.boostweb.co.kr/` | — | 404 | OpenNext (site-factory-next) |
| 임의 subdomain (`zz-random-*`) | 404 | 404 | OpenNext (site-factory-next) |
| `https://www.interior-demo.boostweb.co.kr/` | — | TLS handshake 실패 | 원래 있던 동작: Universal SSL 은 2단계 subdomain 을 덮지 않는다. `*.boostweb.co.kr/*` 가 이 이름을 site-factory-next 로 보내지만 인증서가 없다 |

## Cloudflare 객체

| 항목 | 전 | 최종 |
|---|---|---|
| routes | 3 | 4 = 기존 3개 (id / pattern / script 동일) + `interior-demo.boostweb.co.kr/*` |
| boostweb `modified_on` | 2026-09-14T04:06:18.828337Z | 같음 → **수정 안 함** |
| site-factory-next `modified_on` | 2026-08-28T15:11:05.253337Z | 같음 → **수정 안 함** |
| Custom Domains | 145, boostweb.co.kr 계열 = `boostweb.co.kr → boostweb` | 같음 |
| R2 | site-factory-images, site-factory-isr-cache | + boost-sites-artifacts (private). 기존 bucket 에는 손대지 않음 |

## 새 route 가 hostname 하나에만 적용된다는 증명

1. route pattern 이 `interior-demo.boostweb.co.kr/*` 하나다. wildcard 가 없다.
2. 비슷한 이름 (`interior-demo2`, `demo-interior`, 임의 label) 과 apex 는 모두 그대로 OpenNext 가 응답한다.
3. 응답 주체가 recon-runtime 으로 바뀐 것은 `interior-demo.boostweb.co.kr` 하나뿐이다.

## 하지 않은 것

BoostChat, Supabase, BoostWeb 코드와 설정, site-factory-next, `boostweb` Worker, zone 설정, DNS 는 건드리지 않았다. Template 1.5.2 를 수정하지 않았고 1.5.3 도 만들지 않았다.

```
BOOSTWEB_ROOT_REGRESSION      = PASS
EXISTING_SUBDOMAIN_REGRESSION = PASS (gangnal-pibugwa-byeongwon, hangyeol-semu, haru-pilates)
```
