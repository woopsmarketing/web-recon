# 03 — Local artifact, R2 bucket, pilot Worker (2026-09-22)

## 1. Local artifact 재검증

| 항목 | 기대 | 실제 |
|---|---|---|
| SITE | boost-interior-demo | `current.json` → `packages/18c0a5ef…` |
| RELEASE | interior-01-1.5.2-d87807590d64 | build-record `template.releaseId` 일치 |
| RELEASE_HASH | d87807590d64ea79…8f22f8511577a08 | build-record `parts.releaseHash` 일치 |
| BUILD_INPUT_ID | 18c0a5eff5abce3f…a3a49dbd03350245eb84e56b46dc60911f | 일치 |
| PACKAGE_HASH | cd048406311f22b6…f863f8035202 | build-record `packageHash` 일치. `--expect-package` 통과 |
| QA | pass | `qa.pass = true`, 156 files, 7,390,478 B, 15 HTML |
| packageIntact | — | `planPublish` 가 `site/**` 를 다시 hash (읽기 전과 후 두 번) → 일치 |
| baked origin | `https://interior-demo.boostweb.co.kr` | `bakedOrigin` 일치 → remote origin guard 통과 |

명령 (offline, store 접근 없음): `site-publish.ts --site boost-interior-demo --host interior-demo.boostweb.co.kr --remote --dry-run --expect-package cd048406…` → EXIT 0. 로그: [`proof/dryrun-remote-offline.log`](proof/dryrun-remote-offline.log)

Local gate:

| gate | 결과 |
|---|---|
| `tsc -p workers/recon-runtime/tsconfig.json` | PASS |
| `tsc -p platform/tsconfig.json` | PASS |
| `publish.test.ts` (배포 전 / `wrangler.jsonc` 수정 후) | 59 passed, 0 failed / 59 passed, 0 failed |

## 2. R2

source of truth: `workers/recon-runtime/wrangler.jsonc` `env.pilot.r2_buckets` → binding `SITES`, bucket **`boost-sites-artifacts`**. publisher 의 `--bucket` 기본값도 같다.

| 단계 | 결과 |
|---|---|
| 사전 list | 없음 (`site-factory-images`, `site-factory-isr-cache` 만 있음) |
| `wrangler r2 bucket create boost-sites-artifacts --location apac` | 2026-09-22T06:32:31Z 생성. location APAC, Standard |
| `r2 bucket dev-url get` | `Public access via the r2.dev URL is disabled.` |
| `r2 bucket domain list` | `There are no custom domains connected to this bucket.` |

wrangler 가 "binding 을 config 에 추가하라" 는 snippet 을 출력했지만 파일은 바뀌지 않았다 (`git status` 로 확인).

```
R2_BUCKET          = boost-sites-artifacts
R2_EXISTED_BEFORE  = NO (새로 생성)
R2_PRIVATE         = YES (r2.dev disabled, custom domain 0, Worker binding 으로만 접근)
```

참고: `r2 bucket info` 의 `object_count` 는 publish 뒤에도 0 으로 나왔다. R2 metrics 가 늦게 갱신되기 때문이다. 실제 object 는 publisher 의 readback (156/156) 과 `--check-store` (`seal identical, 156 skip`) 로 확인했다.

## 3. Pilot Worker

설정은 이미 있던 `env.pilot` 블록을 그대로 썼다: `name = recon-runtime-pilot`, `workers_dev = false`, `preview_urls = false`, `SITES → boost-sites-artifacts`. CLI `--name` override 는 쓰지 않았다.

| 단계 | 명령 | 결과 |
|---|---|---|
| bundle / dry-run | `wrangler deploy -c workers/recon-runtime/wrangler.jsonc --env pilot --dry-run --outdir <scratch>` | 7.49 KiB / gzip 2.74 KiB, binding `env.SITES (boost-sites-artifacts)` |
| deploy (route 없음) | `wrangler deploy -c … --env pilot` | `Uploaded recon-runtime-pilot`, `No targets deployed`, version `8d9df0ca-ff7f-42e7-9b1a-4e7b41b1512c` (06:33:14Z) |
| 확인 | `GET …/scripts/recon-runtime-pilot/subdomain` | `{enabled: false, previews_enabled: false}` |
| 확인 | `GET …/scripts/recon-runtime-pilot/routes` | `[]` |
| 확인 | zone routes | 여전히 3개, 변화 없음 |
| 확인 | boostweb / site-factory-next `modified_on` | 변화 없음 |

route 를 붙인 두 번째 deploy 는 [04](04-exact-route.md) 에 있다. 최종 Worker version 은 `5d9afa05-60d3-49f3-8d1e-b74ba620be57` 이다.

```
WORKER          = recon-runtime-pilot
WORKER_DEPLOYED = YES (workers_dev=false, preview_urls=false)
```
