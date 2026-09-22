# 이 폴더가 web-recon 의 공식 최신 작업본이다

```
AUTHORITATIVE_WORKTREE = /Users/woops/projects/web-recon-track-b
branch                 = track-b/static-deployment-foundation
base commit            = 6c2e723  (그 위의 작업은 아직 uncommitted)
consolidated           = 2026-09-22
```

2026-09-22 에 두 갈래 작업을 이 폴더 하나로 합쳤다.

- **Track B 최종 코드** (interior-01 1.5.1, `site:publish`, `workers/recon-runtime`, publish tests) — 원래 이 폴더에 있었다.
- **Track A 최종 계약 문서** (`docs/reports/integration/00–06`) — `/Users/woops/projects/web-recon` 에서 가져왔다. 내용은 바꾸지 않았다.

근거와 검증 결과: [`docs/result/foundation-consolidation/00-summary.md`](docs/result/foundation-consolidation/00-summary.md)

## 다른 폴더는 무엇인가

`/Users/woops/projects/web-recon` 은 더 이상 최신이 아니다. 거기에는 raw crawl 데이터(`data/<도메인>/`), 5.5 GB 의 `tmp/`, `.env`, 그리고 **Track B 1차 초안**(`platform/publish/**`, `workers/recon-runtime/**` 의 옛 버전)이 남아 있다. 그 초안을 이 폴더로 복사하면 최종 코드가 덮어써진다. 하지 말 것.

## 이 폴더에서 작업할 때

- `pnpm` 을 직접 돌리지 말고 `./node_modules/.bin/{tsc,tsx,wrangler}` 를 부른다 (`node_modules` 가 복사본이다).
- crawl / fal 기능에는 `.env` 가 필요하다. 이 폴더에는 없다: `cp ../web-recon/.env .`
- 2026-09-22 에 live pilot 이 배포되었다: `https://interior-demo.boostweb.co.kr` → Worker `recon-runtime-pilot`, R2 `boost-sites-artifacts`, zone route `interior-demo.boostweb.co.kr/*`. 이 리소스는 이미 있으므로 다시 만들지 않는다. 근거: [`docs/result/cloudflare-live-pilot/00-summary.md`](docs/result/cloudflare-live-pilot/00-summary.md)
- Claude 프로젝트 메모리(과거 Task 기록, 함정 목록)는 `/Users/woops/projects/web-recon` 경로에 묶여 있다. 이 폴더에서 직접 연 세션에는 자동으로 실리지 않는다: `~/.claude/projects/-Users-woops-projects-web-recon/memory/MEMORY.md`
- raw crawl, `data/.registry`, `data/page-state-evidence`, `tmp/aco` 는 다른 폴더에만 있다. crawl / observer 를 돌릴 때는 그쪽 데이터가 필요하다.

이 파일은 폴더 이름이 바뀌거나(`web-recon` 으로 되돌리는 경우 등) 체크포인트 commit 이 끝나면 고치거나 지운다.
