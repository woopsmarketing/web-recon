# 04 — Exact route (2026-09-22 06:33:48Z)

## 방법

runbook (`static-deployment-foundation/07-live-deploy-plan.md` §4 form (b)) 대로 `workers/recon-runtime/wrangler.jsonc` `env.pilot` 에 route 한 줄을 켜고 같은 명령으로 다시 deploy 했다. config 가 계속 source of truth 로 남는다.

```jsonc
,"routes": [ { "pattern": "interior-demo.boostweb.co.kr/*", "zone_name": "boostweb.co.kr" } ]
```

(uncommitted diff: 이 route 와 주석 4줄. 주석 내용: form (b) 를 고른 이유, DNS 는 새로 만들지 않고 기존 proxied wildcard 를 쓴다는 것.)

### deploy 전에 wrangler 소스에서 확인한 route publish 방식

`node_modules/wrangler/wrangler-dist/cli.js` `publishRoutes`: `PUT /accounts/:acct/workers/scripts/recon-runtime-pilot/routes`. 이 호출은 **해당 script 의 route 만 교체**한다. 다른 script 의 route 는 건드리지 않는다. 권한이 없을 때 쓰는 fallback 은 같은 pattern 이 다른 worker 에 있으면 멈추고, 없으면 zone 에 POST 하나를 보낸다.

## 결과

```
Deployed recon-runtime-pilot triggers (1.59 sec)
  interior-demo.boostweb.co.kr/* (zone name: boostweb.co.kr)
Current Version ID: 5d9afa05-60d3-49f3-8d1e-b74ba620be57
```

## 생성 후 실제 route list (`GET /zones/:id/workers/routes`)

| pattern | script | id | 변화 |
|---|---|---|---|
| `*.boostweb.co.kr/*` | site-factory-next | f1cdedb1… | 그대로 (id / pattern / script 동일) |
| `*/*` | site-factory-next | ffda4b9f… | 그대로 |
| `boostweb.co.kr/*` | boostweb | 072da4d0… | 그대로 |
| `interior-demo.boostweb.co.kr/*` | **recon-runtime-pilot** | 79fc4145… | **추가** |

diff (before 대비, 작업 끝에 다시 조회): `unchanged 3, modified 0, deleted 0, added 1`. 원본: [`proof/cloudflare-state.json`](proof/cloudflare-state.json)

## 함께 확인한 것

| 항목 | 결과 |
|---|---|
| Custom Domain | 145개로 전과 같다. `interior-demo` 는 0개 → **Custom Domain 을 만들지 않았다** |
| DNS | 새 record 를 만들지 않았다. 기존 proxied wildcard 를 쓴다 |
| boostweb / site-factory-next `modified_on` | 전과 같다 |
| route 적용 직후 `https://interior-demo.boostweb.co.kr/`, `/portfolio` | `404 text/plain unknown host`, `cache-control: no-store` → recon-runtime 이 응답했다. pointer 가 아직 없으므로 fail-closed |

Cloudflare 는 가장 구체적인 route 를 먼저 적용하므로, `interior-demo.boostweb.co.kr/*` 가 `*.boostweb.co.kr/*` 와 `*/*` 보다 우선한다. 실제 응답 주체가 바뀐 것으로 확인했다 (전: `x-opennext` 404 → 후: recon-runtime).

```
EXACT_ROUTE_BEFORE       = ABSENT
EXACT_ROUTE_CREATED      = interior-demo.boostweb.co.kr/* -> recon-runtime-pilot
EXISTING_ROUTE_MODIFIED  = NO
EXISTING_ROUTE_DELETED   = NO
```
