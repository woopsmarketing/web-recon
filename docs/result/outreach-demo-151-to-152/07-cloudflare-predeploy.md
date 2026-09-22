# 07 — Cloudflare pre-deploy note (2026-09-22)

**이번 작업에서 live resource 는 하나도 만들지 않았다.** DNS / Worker route / custom domain / R2 업로드 / 배포 없음. BoostWeb 코드는 수정하지 않았다 (read-only 로 읽기만).

## candidate host

```
interior-demo.boostweb.co.kr
```

demo package 는 이 origin 으로 구워져 있다 (canonical, og:url, og:image, sitemap `<loc>`, robots.txt `Sitemap:`). 다른 hostname 으로 올리면 이 값들이 전부 틀린다 → 다른 host 가 필요하면 `site.json` `publicOrigin` 을 바꾸고 다시 빌드해야 한다.

## 실제 deploy 전에 확인할 것

| # | 확인 | 이번에 본 것 | 남은 것 |
|---|---|---|---|
| 1 | exact hostname DNS collision (`interior-demo.boostweb.co.kr` 레코드가 이미 있는가) | 확인 안 함 (live 접근 없음) | Cloudflare DNS 에서 정확한 이름 조회 |
| 2 | exact Worker route / custom domain collision | 확인 안 함 | account 의 Workers routes + custom domains 에서 같은 hostname |
| 3 | 기존 `*.boostweb.co.kr/*` wildcard 와의 관계 | 로컬 BoostWeb `wrangler.toml` 에는 wildcard route 없음 (route 는 `boostweb.co.kr`, `www.boostweb.co.kr` custom_domain 두 개, 둘 다 **주석 상태**) | live zone 의 실제 route 는 로컬 파일과 다를 수 있음 → 대시보드/API 로 확인. wildcard 가 있으면 더 구체적인 route 가 이기는지, BoostWeb 쪽 subdomain 라우팅(가게 subdomain)이 `interior-demo` 를 가게로 해석하지 않는지 |
| 4 | 기존 `*/*` route 와의 관계 | 로컬 설정에는 없음 | live 에 있으면 우선순위 확인 |
| 5 | BoostWeb reserved subdomain 목록 | `boostweb/config/subdomain.ts` `RESERVED_SUBDOMAINS` = `RESERVED_INFRA_LABELS` + `RESERVED_BRAND_LABELS` — **`interior-demo` 없음** (tracked 파일 전체에서 `interior-demo` 0건) | 아래 권고 |

## 권고

BoostWeb 는 `*.boostweb.co.kr` 의 label 을 가게 subdomain 으로 쓰는 구조다. `interior-demo` 가 reserved 가 아니면, 누군가 그 이름으로 가게를 만들 수 있고 web-recon demo 와 충돌한다. **실제 deploy 전에** BoostWeb 의 reserved names 에 `interior-demo` 를 추가할지 BoostWeb 쪽에서 판단해야 한다. 추가한다면 web-recon 이 앞으로 쓸 demo label 전체를 한 번에 정하는 편이 낫다.

이번 작업에서는 BoostWeb 코드를 수정하지 않았다.

## deploy 전 web-recon 쪽 상태

- package: `data/site-builds/boost-interior-demo/packages/18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f` (QA pass)
- `workers/recon-runtime/wrangler.jsonc`: `workers_dev: false`, route 주석 상태 (foundation checkpoint 와 같음).
- 모든 페이지 `noindex` (demo). robots.txt 는 crawl 허용 (noindex 를 읽을 수 있어야 하므로).
