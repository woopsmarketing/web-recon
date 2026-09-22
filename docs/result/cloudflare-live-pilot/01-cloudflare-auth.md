# 01 — Cloudflare 인증 (2026-09-22)

## Git 상태 (작업 시작 시)

```
pwd    = /Users/woops/projects/web-recon-track-b
HEAD   = a2500f96f2e57bda2c96c6fc368415ba744d8e6f   (기대값과 일치)
branch = track-b/static-deployment-foundation        (기대값과 일치)
status = clean
```

## Wrangler 실행

| 시도 | 결과 |
|---|---|
| `pnpm exec wrangler whoami` | 동작. wrangler 4.135.0 (repo `node_modules`) |
| `npx wrangler whoami` | 필요 없음 |

이후 명령은 `AUTHORITATIVE_WORKTREE.md` 규칙대로 `./node_modules/.bin/wrangler` 를 직접 불렀다.

## 인증

- 방식: **wrangler OAuth login** (`~/Library/Preferences/.wrangler/config/default.toml`). `CLOUDFLARE_API_TOKEN` 은 쓰지 않았다.
- 계정: `Qkrrmaehd8390@gmail.com's Account` (zone `boostweb.co.kr` 의 소유 계정과 같음)
- token 값은 출력하지 않았다. 직접 API 조회에는 scratchpad helper 를 썼다: 설정 파일에서 token 을 읽어 `Authorization` header 로만 넘기고, token 은 출력하지 않는다.

주요 scope (whoami):

| scope | 이번 작업에서 |
|---|---|
| `workers_routes (write)` | exact route 생성 |
| `workers_scripts (write)` / `workers (write)` | `recon-runtime-pilot` deploy |
| `account (read)` | R2 bucket list/create 는 이 OAuth token 으로 동작했다 (scope 목록에 `r2` 는 따로 없다) |
| `zone (read)` | zone 조회, route 조회 |

권한이 없어 실패한 read:

| 호출 | 결과 | 영향 |
|---|---|---|
| `GET /zones/:id/dns_records` | `10000 Authentication error` | DNS 는 공개 DoH 로 확인 (02) |
| `GET /zones/:id/settings` | `9109 Unauthorized` | zone 의 HTML 변경 기능 설정은 직접 못 봄 (06 관찰) |

## 판정

`CLOUDFLARE_AUTH = OK (wrangler OAuth, account = boostweb.co.kr owner)`
