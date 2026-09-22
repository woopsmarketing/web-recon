# 08 — Live rollback (NOT RUN, owner 결정, 2026-09-22)

## 요청

1.5.2 → 1.5.1 로 rollback 해서 `/`, portfolio, asset 을 확인하고, 1.5.1 → 1.5.2 로 되돌린다.

## 막힌 이유 (publisher source 와 실제 bucket 기준)

1. **remote bucket 에 1.5.1 이 없다.** `rollbackHost` (`platform/publish/publish.ts:552-576`) 는 remote pointer 의 `previous` 로 되돌아가고, 그 package 의 seal 이 bucket 에 있어야 한다. local `data/site-builds/…/previous.json` 은 보지 않는다. bucket 은 이번에 새로 만들었으므로 1.5.2 를 처음 publish 한 뒤 pointer 의 `previous` 는 null 이다.
2. **1.5.1 을 먼저 올리려고 해도 local 1.5.1 package 는 다른 origin 으로 빌드되어 있다.** `previous.json` → `aa71b829…` (packageHash `613cd9e0…`, release `interior-01-1.5.1-6bbdd07eb9bf`) 의 내용:
   - robots / sitemap: `https://boost-interior-demo.example`
   - `<meta name="robots">` 없음 (indexable), canonical 과 OG 없음
   - 연락처: `hello@boost-interior-demo.example` (mailto 포함)

   그래서 `--remote` publish 의 origin guard (`requireOriginMatch`, `publish.ts:266-273`) 가 거부한다. 게다가 publisher 는 `current.json` 의 package 만 publish 한다.
3. **origin 이 맞는 1.5.1 을 새로 빌드할 수도 없다.** `site:build --release <1.5.1>` 은 site pin (1.5.2) 과 다르므로 `prepareSiteInput` 이 거부한다 (`platform/build/site-build.ts:146-150`). 다시 빌드하려면 site data 의 pin 을 바꿔야 한다. 또 rebuild 하면 build 가 package 를 정리하면서 git 에 추적되는 1.5.1 package 디렉터리가 지워진다 (`site-build.ts:404-408`).

## 제시한 선택지와 owner 결정

| 선택지 | 내용 |
|---|---|
| 기존 1.5.1 + `--allow-origin-mismatch` | 일회용 cwd 에서 기존 publisher 로 올린다. 몇 분 동안 noindex 가 없고 가짜 연락처가 공개된다. 이후 pointer `previous` 에 `.example` origin 1.5.1 이 남는다 |
| **Rollback drill 생략** ← **owner 선택** | 1.5.2 만 live, previous = null |
| origin 이 맞는 1.5.1 을 새로 빌드 | 일회용 사본에서 pin 만 바꾼다. 새 packageHash 가 생기고 실패할 가능성이 있다. noindex 는 여전히 없다 |

## 현재 상태

- `routing/interior-demo.boostweb.co.kr.json` → 1.5.2 `cd048406…`, `previous` 없음 ([05](05-remote-publish.md))
- 이 host 에 대해 `site:publish --rollback` 을 실행하면 `previous` 가 없어서 거부된다. pointer 는 바뀌지 않는다.
- Worker version 의 rollback (`wrangler rollback --env pilot`) 과 pilot 을 내리는 방법은 runbook `static-deployment-foundation/07-live-deploy-plan.md` §5 에 있다. 이번에 실행하지 않았다.

## 나중에 rollback drill 을 하려면

runbook §3-11 대로 **origin 이 맞는 두 번째 package** 가 필요하다. 예: 다음 site data 변경으로 1.5.2 를 다시 빌드한 package `<B>`.

```sh
RECON_PUBLISH_ALLOW_REMOTE=1 site:publish --site boost-interior-demo --host interior-demo.boostweb.co.kr --remote --expect-package <B> --expect-live cd048406…   # A → B, previous = A
RECON_PUBLISH_ALLOW_REMOTE=1 site:publish … --remote --rollback --expect-live <B>                                                                          # B → A
RECON_PUBLISH_ALLOW_REMOTE=1 site:publish … --remote --rollback --expect-live cd048406…                                                                    # A → B
```

```
ROLLBACK_152_TO_151  = NOT RUN (owner 결정: drill 생략. origin 이 맞는 1.5.1 package 없음)
REPUBLISH_151_TO_152 = NOT RUN (위와 같음. 1.5.2 는 처음부터 계속 live)
```
