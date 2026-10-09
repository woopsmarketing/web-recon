# Portfolio Content System V1 — Publisher 운영 런북 (`site:portfolio-sync`)

작성: 2026-10-06 (독립 리뷰 F1–F4 반영 개정) · 2026-10-07 개정(demo 도입 마커 commit — §8.1, §9, `03-demo-managed-marker.md`) · 2026-10-10 개정(§0 — 이 런북은 V1 호환 경로, `--adopt` 는 `--legacy-v1` 필요) · 대상: Track B 운영자

BoostChat 이 포트폴리오의 원본(canonical)이다. 이 저장소는 BoostChat 의 export 를 받아
사이트의 포트폴리오 파일을 **결정적으로 재생성**하고, 기존 `buildSite` + `publishSite` 로 배포한 뒤
공개 URL 을 확인해 결과를 BoostChat 에 보고한다. 별도 플랫폼/배포 경로는 없다.

## 0. 먼저 읽을 것 — 이 런북은 V1(호환·비상) 경로다 (2026-10-10)

**새로 BoostChat 관리(managed)로 만드는 사이트는 V2(Portfolio Publishing V2, 증분 발행)가 기본이다.**
이 런북의 `site:portfolio-sync` 는 이미 `portfolio-source@1` 마커를 가진 사이트를 위한 호환·비상 경로로만 남는다
(기존 `@1` 사이트의 동작은 그대로다).

V2 사이트의 절차 (이 런북의 2–9 절은 V2 사이트에 적용되지 않는다):

```bash
# 1) managed 선언 — tracked 마커 portfolio.source.json 을 portfolio-source@2 로 쓴다 (commit 할 것).
#    pin 된 release 가 portfolio runtime 을 지원하지 않으면 거부하고 할 일을 알려 준다. --dry-run 가능, 멱등.
pnpm site:portfolio-managed --site <siteId>

# 2) shell package 빌드
pnpm site:build <siteId>

# 3) 배포 — 명령 하나: 업로드 → BoostChat 에 알림(announce) → BoostChat 의 포트폴리오 발행 대기 → 호스트 전환
RECON_PUBLISH_ALLOW_REMOTE=1 BOOSTCHAT_BASE_URL=… BOOSTCHAT_PUBLISHER_TOKEN=… \
  pnpm site:publish --site <siteId> --host <hostname> --remote
```

- 중간에 멈춰도(exit 3 = BoostChat 에 알리지 못함/거부, 4 = BoostChat 이 아직 V1 모드, 5 = 제한 시간 안에 발행되지 않음)
  package 는 봉인된 채 남고 routing pointer 는 바뀌지 않는다. 원인을 고친 뒤 **같은 명령을 다시 실행**하면 된다.
- 이전 package 로 되돌리기: 같은 명령에 `--rollback`. 되돌아갈 package 가 shell package 면 같은 흐름
  (announce → 대기 → 전환)을 탄다.
- 플래그·exit code 전체는 `platform/cli/site-publish.ts`, `platform/cli/site-portfolio-managed.ts` 머리 주석 참조.

**`--adopt` 는 이제 `--legacy-v1` 과 함께만 동작한다.** `--adopt` 단독은 exit 2 로 거부되고 위 V2 명령을 안내한다.
V1 마커(`portfolio-source@1`)를 의도적으로 새로 쓰려는 경우에만 `--adopt --legacy-v1` 을 쓴다 (3 절, 8.1 절).

## 1. 절대 규칙

- **생성 파일은 손으로 고치지 않는다.** 관리(managed) 사이트에서 아래 파일은 BoostChat 에서 생성된다.
  - `data/sites/<siteId>/content/projects.json`
  - `data/sites/<siteId>/content/categories.json`
  - `data/sites/<siteId>/assets/<포트폴리오 이미지>` 와 `assets/registry.json` 안의 해당 항목
  - `data/sites/<siteId>/portfolio.managed.json` (소유권 sidecar, sha256 목록)
- 손으로 고치면 사이트 로더가 빌드를 **실패**시킨다 (`managed portfolio check failed … GENERATED from BoostChat`).
  수정은 BoostChat 관리자에서 하고 게시한 뒤 `site:portfolio-sync` 를 돌린다. 실수로 고쳤다면 `site:portfolio-sync … --force` 로 live 내용에서 다시 생성한다
  (`git checkout` 으로 되돌리지 않는다 — commit 된 포트폴리오는 더 이상 원본이 아니다).
- 사이트 소유 파일(`site.json`, `settings.json`, `slots.json`, `theme.json`, `content/banners.json`, 로고/히어로 등 site-level asset,
  `registry.json` 의 site-level 항목)은 지금처럼 손으로 편집한다. 생성기는 이 파일을 지우거나 덮어쓰지 않는다.
- **도입(adopt)된 사이트**(tracked 마커 `data/sites/<siteId>/portfolio.source.json` 이 있는 사이트)는 `site:portfolio-sync` 로만 배포한다.
  생성된 포트폴리오(sidecar)가 없는 checkout 에서는 로더/`site:build` 가 실패하고, 수동 `pnpm site:publish` 는 exit 2 로 거부된다
  (`--dry-run`, `--rollback` 은 그대로 허용 — rollback 은 비상 경로이며 자체 portfolio-truth guard 를 유지한다).
- `--remote` 는 `site:publish` 와 똑같이 `RECON_PUBLISH_ALLOW_REMOTE=1` 이 있어야만 동작한다.
- 토큰(`BOOSTCHAT_PUBLISHER_TOKEN`)은 어떤 로그에도 출력되지 않는다. 셸 히스토리/CI 로그에 남기지 말 것.

## 2. 환경 변수

| 변수 | 의미 |
| --- | --- |
| `BOOSTCHAT_BASE_URL` | BoostChat origin (경로 없이). `https://…` 필수, `http://` 는 loopback(127.0.0.1/localhost)만 허용 |
| `BOOSTCHAT_PUBLISHER_TOKEN` | publisher bearer token |
| `RECON_PUBLISH_ALLOW_REMOTE=1` | `--remote` (실제 Cloudflare R2) 허용. 없으면 exit 2 |

## 3. 사용법

```bash
# 한 번 실행 (기본값 --once, 기본 store 는 --local → 로컬 publish 는 loopback --verify-base 가 필수, 3.1 절)
pnpm site:portfolio-sync --site <siteId> --host localhost --verify-base http://localhost:8787

# 폴링 (한 번에 한 cycle 만; SIGINT/SIGTERM 은 진행 중 cycle 을 끝내고 종료) — 운영은 --remote
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:portfolio-sync --site <siteId> --host <hostname> --remote --watch --interval 60

# 계획만 보기: export 수신 + 임시 디렉터리에 생성 + 검증. 사이트 디렉터리/빌드/배포/보고 없음
pnpm site:portfolio-sync --site <siteId> --host <hostname> --dry-run

# 오프라인 입력 (BoostChat 없이): 보고는 하지 않는다. 로컬 publish 전용 (--remote 와는 --generate-only / --dry-run 일 때만)
pnpm site:portfolio-sync --site <siteId> --host localhost --verify-base http://localhost:8787 --from-file export.json --assets-dir ./assets
#   + --generate-only  : 사이트 디렉터리만 재생성 (빌드/배포/검증 없음)

# 운영 배포 (remote R2)
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:portfolio-sync --site <siteId> --host <hostname> --remote
```

기타 옵션: `--verify-base <origin>` (`--remote` 일 때 기본 `https://<hostname>`; `--local` 은 명시 필수), `--persist-to <dir>` (기본 `tmp/recon-runtime-state`),
`--bucket <name>`, `--allow-origin-mismatch` (site:publish 와 동일 의미), `--force` (revision == liveRevision 이어도 실행),
`--adopt --legacy-v1` (생성 후 tracked 마커 `portfolio.source.json` 을 `portfolio-source@1` 로 쓴다 — 8 절. `--adopt` 단독은 거부된다: 0 절).

### 3.1 거부되는 조합 (exit 2, 아무것도 하기 전에)

배포한 곳·검증하는 곳·보고하는 곳은 **같은 환경**이어야 한다. 그렇지 않으면 공개 사이트가 예전 package 를 서빙하는데도 "성공"이 보고될 수 있다.

| 조합 | 이유 |
| --- | --- |
| `--local` (기본) + `--verify-base` 없음 | 로컬 publish 는 `https://<hostname>` 에 반영되지 않는다 |
| `--local` + loopback 이 아닌 `--verify-base` | 로컬 상태를 공개 호스트에서 검증할 수 없다 |
| `--local` + loopback 이 아닌 `BOOSTCHAT_BASE_URL` (보고가 나가는 실행) | 로컬 publish 를 운영 BoostChat 에 live 로 보고하면 안 된다 |
| `--remote` + loopback `--verify-base` | 운영 publish 를 로컬에서 검증할 수 없다 |
| `--from-file` + `--remote` (`--generate-only`/`--dry-run` 없이) | 보고 없이 운영 bucket 에 배포된다 |

`--dry-run` 과 `--generate-only` 는 store 를 건드리지 않으므로 위 제한을 받지 않는다. loopback = `localhost`, `*.localhost`, `127.0.0.0/8`, `::1`.

같은 사이트에 두 프로세스가 동시에 돌지 않도록 `tmp/portfolio-sync/<siteId>.lock` 을 잡는다 (exit 6).

## 4. 한 cycle 이 하는 일

1. `GET /api/publisher/sites/<siteId>/portfolio` — `revision == liveRevision` 이면 "nothing to do", exit 0.
   단, 이 checkout 의 sidecar 가 없거나 `source.revision ≠ liveRevision` 이면 **사이트 디렉터리만** export 에서 다시 생성한다
   (빌드·배포·보고 없음, 출력 `regeneratedThisCheckout: true`). checkout 이 항상 live 내용을 기술하게 하기 위함이다.
2. asset 다운로드 + sha256/size 검증 (이미 디스크에 같은 sha256 이 있으면 다시 받지 않음).
   asset 요청의 5xx/429/네트워크 오류는 export 의 잘못이 아니다 → 보고 없이 exit 3 (다음 실행에서 재시도).
   asset 404 는 export 를 한 번 다시 읽는다: revision 이 바뀌었으면 새 revision 으로 cycle 을 다시 시작하고, 그대로면 `failed`/`generate`.
3. **generate**: 파일 계획 계산 → 임시 복사본에서 실제 로더로 검증 → 사이트 디렉터리에 적용 (sidecar 먼저, 삭제는 마지막).
4. **build**: 기존 `buildSite`. 내용이 같으면 `up-to-date`.
5. **publish**: 기존 `publishSite`, 방금 빌드한 package hash 만 허용.
6. **verify** (`--verify-base`) — **방금 빌드한 package 에 묶인 검증**이다 (integration 이 꺼진 사이트도 동일):
   - 게시 레코드: `GET /portfolio/<slug>` 와 그 cover 이미지가 200 이고 응답 바이트의 sha256 이 방금 빌드한 package 의 해당 파일과 같아야 `verified.present`.
     200 이어도 바이트가 다르면(= 예전 package) 확인되지 않은 것으로 본다.
   - `changes.removing` 의 각 `{id, slug}`: `GET /portfolio/<slug>` = 404 (slug 는 export 가 준 값; 이 checkout 이 생성한 적 없는 레코드도 동일).
   - 목록 페이지 `GET /portfolio` 가 방금 빌드한 package 의 바이트와 같아야 한다. 다르면 `failed`/`verify`.
   - integration 이 켜져 있으면 `/_integration/manifest.json` 의 portfolio version = 방금 빌드한 version.
   - 검사는 재시도되며(포인터 전파), 동시에 4개까지, 전체 120초 deadline.
7. `POST …/portfolio/result` — **실제로 확인한 것만** 보고. 네트워크 오류/5xx 는 재시도, `409 stale_revision` 이면 export 를 다시 읽는다.

## 5. Exit code

| code | 의미 | 조치 |
| --- | --- | --- |
| 0 | 완료 / 할 일 없음 / dry-run / generate-only | — |
| 1 | 단계 실패 (BoostChat 에 `failed` 보고됨) | 아래 6 절 |
| 2 | 사용법 오류, env 누락, `--remote` 미허용, 3.1 절의 거부 조합 | 인자/환경 확인 |
| 3 | BoostChat 에 물어볼 수 없음 (401, 429, 5xx, 503, 404, 네트워크 — export 또는 asset). 아무것도 바뀌지 않음, 보고 없음 | 토큰/URL/사이트 등록 확인, 재실행 |
| 4 | 배포는 됐지만(또는 됐을 수 있지만) 공개 URL 에서 확인하지 못함: 일부 레코드 미확인(확인된 것만 보고), 또는 공개 사이트/라우팅 포인터에 물어볼 수 없어 **아무것도 보고하지 않음**(`unverified`) | 잠시 후 재실행 |
| 5 | 결과 보고가 전달되지 않음 / 계속 stale / export 가 읽는 중 계속 바뀜 | 재실행 (같은 revision 재보고는 멱등) |
| 6 | 같은 사이트의 다른 sync 가 실행 중 (`--force` 도 살아 있는 lock 을 빼앗지 않는다) | 기다린다 |

`--watch` 는 0 이 아니었던 마지막 cycle 의 code 로 종료한다.

## 6. 실패 단계와 복구

| stage | 원인 예 | 사이트 디렉터리 | 조치 |
| --- | --- | --- | --- |
| `generate` | schema 불일치, `siteId`/`publicOrigin` 불일치(P5), asset sha256/size 불일치, 레코드가 content schema 위반, asset 누락/잉여(P3), id/파일 충돌, `changes.removing` 항목 형식 오류, 배너 CTA 가 **존재한 적 없는** 프로젝트 id 를 가리킴(오타) | 변경 없음 | 메시지대로 BoostChat 데이터 또는 사이트 설정 수정 후 재게시 |
| `build` | 빌드 실패 | **이전 생성 파일로 자동 복원** | 원인 수정 후 재실행 |
| `publish` | store 오류, guard 거부 | 포인터가 새 package 를 가리키지 않으면 자동 복원 | 재실행. 필요 시 `pnpm site:publish --rollback` |
| `verify` | 목록 페이지/manifest 가 방금 빌드한 package 의 것이 아님, 아무것도 확인 안 됨 | 유지 (이미 live 일 수 있음) | `--verify-base`·라우팅 확인 후 재실행 |

- 공개 URL 이 아예 응답하지 않거나(네트워크, timeout) publish 실패 후 라우팅 포인터를 읽을 수 없으면 `failed` 가 아니라 `unverified`(exit 4)다:
  아무것도 되돌리지 않고 아무것도 보고하지 않는다. 다시 실행하면 같은 revision 을 검증·보고한다.
- BoostChat 에 보고되는 `failed` 의 `error.message` 는 단계별 **고정 한국어 문장**이다. 빌드/wrangler 출력, 경로, 명령은 로컬 로그에만 남는다.
- **watch backoff**: 실패한 export 와 **내용이 같은** export(revision 번호만 오른 것)는 같은 실패가 반복되는 동안 매 폴링마다 처리·보고하지 않는다.
  재시도 간격은 `--interval` × 2ⁿ (최대 10분)이며 그 사이의 폴링은 `backing-off`(exit 0)로 끝난다. 내용이 바뀌거나 성공하면 즉시 처리한다.
  BoostChat 에 접근할 수 없을 때(exit 3)도 폴링 간격이 최대 10분까지 늘어난다.

- 실패 보고 후 BoostChat 은 desired revision 을 올린다(R3). 실패한 cycle 은 스스로 반복하지 않는다 → 다음 `--once` / 다음 폴링에서 처리.
- 배너 CTA 가 가리키는 프로젝트를 고객이 내리면(unpublish) 배포는 **실패하지 않는다**. 그 id 는 sidecar 의 `retired[]` 에 기록되고,
  해당 슬라이드의 CTA 버튼만 렌더링되지 않는다(draft 와 동일). 같은 id 가 다시 게시되면 `retired[]` 에서 빠지고 CTA 가 돌아온다.
  저장된 적도 retired 된 적도 없는 id 는 여전히 오타로 보고 `generate` 에서 실패한다 → `content/banners.json` 수정.
  `settings.json` 의 manual 선택 id 는 경고(`manual-id-missing`)만 내고 건너뛴다.
- 생성 파일이 손상됐다면: `site:portfolio-sync … --force` 로 live export 에서 다시 생성한다 (`git checkout` 으로 복구하지 않는다).

## 7. 한 대의 머신에서 로컬 end-to-end

```bash
# 터미널 A — 로컬 runtime (로컬 R2 상태 tmp/recon-runtime-state, http://localhost:8787)
pnpm runtime:dev

# 터미널 B — 로컬 BoostChat(http://127.0.0.1:<port>)에서 받아 로컬 publish + 검증
BOOSTCHAT_BASE_URL=http://127.0.0.1:<port> BOOSTCHAT_PUBLISHER_TOKEN=<token> \
  pnpm site:portfolio-sync --site <siteId> --host localhost --local --verify-base http://localhost:8787
```

runtime Worker 는 요청 hostname 으로 라우팅하므로 `--host localhost` 로 publish 해야 `http://localhost:8787` 에서 보인다.
로컬 publish 에는 origin guard 가 적용되지 않는다(`site:publish --local` 과 동일). 단, export 의 `site.publicOrigin` 은
site.json 의 `publicOrigin` 과 같아야 한다(P5) — 로컬 BoostChat 의 사이트 레코드도 같은 publicOrigin 이어야 한다.

## 8. 처음 managed 로 전환할 때

첫 실행은 손으로 만든 포트폴리오를 인수한다: export 가 이름을 댄 asset id 중 기존 `projects.json` 만 쓰던 항목은
그 자리에서 generated 로 넘어간다. export 에 없는 기존 포트폴리오 이미지는 **지워지지 않고** site-level 항목으로 남는다
(필요하면 손으로 정리). 먼저 `--dry-run` 으로 계획(`adoptedOnFirstConversion`, create/replace/remove)을 확인할 것.
전환 직후 내용이 같다면 siteSnapshotHash 가 그대로라 빌드는 `up-to-date` 이고 package 는 바뀌지 않는다.

### 8.1 도입(adopt) 단계 — rollout 시 한 번, 사람이 수행

sidecar 는 commit 하지 않으므로(9 절) "이 사이트는 BoostChat 이 소유한다"는 사실은 tracked 마커로 저장소에 남긴다.

1. publisher 전용 checkout 에서 첫 managed sync 를 성공시킨다 (`--adopt --legacy-v1` 을 붙이면 생성 직후 마커를 써 준다. 손으로 만들어도 된다. V1 로 도입하는 것은 호환 경로다 — 새 사이트는 0 절의 V2 절차).
   `data/sites/<siteId>/portfolio.source.json`:
   ```json
   {
     "schema": "portfolio-source@1",
     "managedBy": "boostchat"
   }
   ```
2. **이 파일 하나만** commit 한다 (snapshot 입력이 아니므로 siteSnapshotHash/buildInputId 는 바뀌지 않는다).
3. 그 뒤로 모든 checkout 에서: 마커가 있는데 sidecar 가 없으면 로더/`site:build` 실패, 수동 `site:publish` 거부.
   개발용 checkout 에서 이 사이트를 빌드하려면 `pnpm site:portfolio-sync --site <id> --host <host> --generate-only` (BoostChat 에서 받아 디렉터리만 생성)를 먼저 실행한다.

**`boost-interior-demo` 는 2026-10-07 에 도입됐다** — `data/sites/boost-interior-demo/portfolio.source.json` 이 commit 돼 있다(`03-demo-managed-marker.md`).

- 개발용 checkout(이 저장소의 일반 clone)에는 마커만 있고 sidecar 가 없다. 따라서 거기서 demo 는 load · `site:build` 가 실패하고(exit 1),
  수동 `site:publish` 는 거부된다(exit 2). commit 된 `content/projects.json` 은 2026-10-06 시점의 사본일 뿐 더 이상 원본이 아니다.
- demo 를 로컬에서 build 해야 하면 `pnpm site:portfolio-sync --site boost-interior-demo --host interior-demo.boostweb.co.kr --generate-only`
  (BoostChat env 필요)로 먼저 생성한다. 그 결과물(생성 파일 · sidecar)은 commit 하지 않는다.
  개발용 checkout 을 다시 commit 된 상태로 돌리려면 `git status -- data/sites/boost-interior-demo` 로 바뀐 것을 본 뒤
  `git restore data/sites/boost-interior-demo` + 추적되지 않는 생성물(`portfolio.managed.json`, 새 이미지) 삭제. (1 절의 "`git checkout` 으로 되돌리지 않는다" 는
  publisher checkout 의 생성 파일을 고칠 때의 규칙이다.) `git add -A` 로 sidecar · 생성 파일을 commit 하지 않도록 주의 — `.gitignore` 는 `data/sites/**` 를 전부 포함한다.
- guard 를 통과시키려고 `portfolio.managed.json` 을 손으로 만들거나 마커를 지우지 않는다.
- 오류 메시지가 안내하는 `site:portfolio-sync … --force [--remote]` 는 **publisher 전용 checkout 기준**이다. 개발용 checkout 에서는 `--generate-only` 만 쓴다(9 절: 개발용 checkout 에서 운영 sync 금지).
- `site:publish --rollback` 은 마커로 막지 않는 비상 경로다. portfolio-truth guard 가 "이 checkout 이 지금 서빙할 레코드" 를 로더로 읽으므로,
  생성된 포트폴리오가 없는 개발용 checkout 에서는 로더가 거부해 rollback 도 실패한다(fail closed). 예전에 `--generate-only` 해 둔 checkout 은 그 시점의 목록을 진실로 삼으므로
  **rollback 은 publisher 전용 checkout 에서, 방금 sync 된 상태로만** 실행한다.
- 운영 publisher 전용 checkout(`web-recon-track-b-publisher`, detached `8e1b06f`)은 그대로다: sidecar 를 갖고 있고 이 commit 을 받지 않았다.
  나중에 그 checkout 을 새 commit 으로 올려도 sidecar 가 있으므로 load · build · sync 는 지금과 같다(마커 + 일관된 sidecar = 정상 load).
  달라지는 것은 하나: 그 checkout 에서도 수동 `site:publish` 가 거부된다(의도된 동작 — 배포는 `site:portfolio-sync` 만).

## 9. V1 운영 정책 — publisher 전용 checkout

- publisher(`site:portfolio-sync`)는 이 저장소의 **전용(dedicated) checkout** 에서만 실행한다. 개발용 checkout 에서 운영 sync 를 돌리지 않는다.
- 그 checkout 에서 managed 사이트에 대해 생성되는 것은 모두 BoostChat 에서 파생된 산출물이며 **그 checkout 에서 commit 하지 않는다**:
  - `data/sites/<id>/content/projects.json`, `data/sites/<id>/content/categories.json`
  - managed 이미지(`data/sites/<id>/assets/…`)와 `assets/registry.json` 안의 해당 항목
  - `data/sites/<id>/portfolio.managed.json`
  - 다시 빌드된 `data/site-builds/<id>/…` (current.json, history.jsonl, packages/…)
- 개발용 checkout 은 commit 된 dataset 을 그대로 유지한다. 그래서 리터럴 pin 테스트(`portfolio-production-truth`, `integration`, `detail-facts`)는
  live 디렉터리가 아니라 frozen fixture(`platform/test/fixtures/boost-interior-demo-frozen`, `platform/test/demo-frozen-dataset.ts`)를 읽는다.
- **2026-10-07 (demo 도입) 이후**: demo 를 "build 되는 사이트" 로 쓰는 suite 는 모두 frozen composition 으로 읽는다(`frozenDemoRoot` / `testSiteRoot` — live 디렉터리의
  사이트 소유 파일 + frozen 포트폴리오, 마커 · sidecar 제외): `step6`, `inquiry162`, `inquiry163`, `inquiry163-browser`, `publish`(RT0 의 served set), `publish-e2e`(contact smoke).
  `[live]` 검사(`portfolio-production-truth` LV1–LV3/LB, `integration` V1, `detail-facts` LIVE)는 live 디렉터리가 dataset 인 checkout(도입 전 또는 sidecar 있음)에서는 예전 그대로 내용을 검사하고,
  마커만 있는 checkout 에서는 **거부를 검증**한다(LVA: 로더 · 실제 build 모두 거부, package 미생성). guard 자체는 `portfolio-sync` F2(fixture) · L3(저장소의 도입 사이트),
  `publish` P14(실제 demo 의 수동 publish 거부, usage error 별 메시지)가 검증한다. 마커가 지워지면 `portfolio-production-truth` LV1 과 `portfolio-sync` L3 가 실패한다.
- managed 사이트 데이터와 빌드 산출물을 git tree 밖으로 옮기는 것은 **Phase 2** 항목이다.
- 누군가 변경된 managed 내용을 의도적으로 commit 한다면, 아래 테스트는 여전히 live demo 디렉터리의 사이트 소유 파일 또는 tracked `data/site-builds/boost-interior-demo` 를 직접 읽으므로 rollout 갱신이 필요하다
  (포트폴리오 dataset 자체는 위 항목대로 frozen composition 에서 읽는다):
  - `platform/test/demo-rollout.ts` (helper: current/previous package 리터럴)
  - `platform/test/integration.test.ts` — rollout/lineage 검사(B2, B2b, R2, G1–G6 등; dataset pin 은 이미 frozen 으로 이동)
  - `platform/test/publish.test.ts` (RT0 "served set = bi-01 … bi-08", current package 검사), `platform/test/publish-e2e.test.ts`
  - `platform/test/step6.test.ts` (+ `portfolio-qa-corpus.ts` 의 기본 경로)
  - `platform/test/ia150.test.ts`, `ia151.test.ts`, `ia152.test.ts`
  - `platform/test/predemo.test.ts`, `predemo2.test.ts`
  - `platform/test/inquiry162.test.ts`, `inquiry163.test.ts`, `inquiry163-reuse.test.ts`, `inquiry163-browser.test.ts`
  - (갱신 불필요: `portfolio-sync.test.ts`, 그리고 위 3개 리터럴 pin 테스트의 `[live]` 검사 — 어떤 dataset 에도 성립)
