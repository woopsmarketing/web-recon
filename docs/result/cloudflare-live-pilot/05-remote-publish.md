# 05 — Remote publish (2026-09-22)

임의의 upload script 는 만들지 않았다. 기존 publisher `platform/cli/site-publish.ts` 만 썼다 (`tsx --tsconfig platform/tsconfig.json …`, `pnpm site:publish` 와 같은 명령).

## source 에서 확인한 remote 요구사항

| 요구 | 근거 | 이번 실행 |
|---|---|---|
| `--remote` 가 store 에 닿으면 (read 포함) `RECON_PUBLISH_ALLOW_REMOTE=1` 필요 | `site-publish.ts:74-82` | 명령마다 env 로만 줌 (파일에 기록 안 함) |
| `--remote` publish 는 package 의 baked origin == `https://<host>` 이어야 함 | `site-publish.ts:117` `requireOriginMatch` | 1.5.2 는 일치 → override 안 씀 |
| transport | `wrangler-store.ts`: `wrangler r2 object put/get --remote`, argv 배열 (shell 안 거침) | wrangler OAuth |
| 순서 | `publish.ts` `publishSite`: validate → upload → readback verify → seal → seal readback → pointer last | 아래 순서 그대로 |
| 동시성 guard | `--expect-package`, `--expect-live` | 모든 write 에 씀 |

## 실행 순서

| # | 명령 (공통: `--site boost-interior-demo --host interior-demo.boostweb.co.kr --remote`) | 결과 |
|---|---|---|
| 1 | `--dry-run --expect-package cd048406…` (offline) | 156 files, 158 objects planned, bakedOrigin 일치 |
| 2 | `--dry-run --check-store --expect-package cd048406…` (read-only) | `seal absent → would upload 156; host serves nothing → pointer write` |
| 3 | `--no-activate --expect-package cd048406…` | **uploaded 156/156 → verified 156/156 (sha256 + size) → sealed `_package.json` → pointer not read, not written** (2분 17초, concurrency 4) |
| 4 | `--no-activate --reverify --expect-package cd048406…` | `seal present and identical → 0 uploads`, **reverified 156/156 sealed objects** |
| — | `curl https://interior-demo.boostweb.co.kr/` | 여전히 `404 unknown host` (pointer 가 없으므로) |
| 5 | `--expect-package cd048406… --expect-live none` | `skipped-sealed`, uploaded 0, **pointerWrite "written"**, previous null |
| 6 | `--dry-run --check-store` (작업 끝, read-only) | `seal identical → would skip 156; host serves cd048406… → pointer unchanged` |

로그: [`proof/publish-152-upload.log`](proof/publish-152-upload.log), [`proof/publish-152-reverify.log`](proof/publish-152-reverify.log), [`proof/publish-152-activate.log`](proof/publish-152-activate.log), [`proof/checkstore-1.log`](proof/checkstore-1.log), [`proof/checkstore-final.log`](proof/checkstore-final.log). 파일별 key 줄은 로그에서 뺐다.

## R2 layout

```
sites/boost-interior-demo/packages/cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202/<156 files>
sites/boost-interior-demo/packages/cd048406…/_package.json         (seal, 마지막에 씀)
routing/interior-demo.boostweb.co.kr.json                         (pointer, seal 검증 뒤에 씀)
```

## 최종 routing pointer (`wrangler r2 object get … --remote --pipe`)

```json
{
  "schemaVersion": 1,
  "hostname": "interior-demo.boostweb.co.kr",
  "siteId": "boost-interior-demo",
  "packageHash": "cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202",
  "buildInputId": "18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f",
  "releaseId": "interior-01-1.5.2-d87807590d64",
  "publishedAt": "2026-09-22T06:37:56.958Z"
}
```

`previous` 필드가 없다. rollback drill 을 하지 않았으므로 ([08](08-rollback.md)) 이 host 에는 아직 rollback 대상이 없다.

```
REMOTE_PUBLISH = PASS (uploaded 156, verified 156, reverified 156, sealed, pointer written last)
```
