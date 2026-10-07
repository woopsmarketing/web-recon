# Portfolio Content System V1 — 운영 첫 실행 기록 (`site:portfolio-sync --remote`)

작성: 2026-10-06 · publisher commit `8e1b06f` · 대상 host `interior-demo.boostweb.co.kr` · bucket `boost-sites-artifacts`

`00-summary.md` 는 "운영 접촉 없음" 상태에서 쓰였다. 이 문서는 그 뒤 운영에서 처음 돌린 결과다.
BoostChat 쪽 상세 기록: `boost-chat/docs/reports/portfolio-cms/09-production-rollout-and-smoke.md`.

## 결과

| 단계 | 결과 |
|---|---|
| `--dry-run` (운영 export, revision 0) | 무손실: `content/projects.json` 동일 · 이미지 44/44 동일 · `assets/registry.json` 동일 · 제거 0 · siteSnapshotHash `f15f2d20c9705842…` |
| 첫 `--remote` 실행 | `nothing-to-do` + `regeneratedThisCheckout: true` (build · publish · 보고 없음) |
| 직후 `site:build boost-interior-demo` | `up-to-date`, buildInputId `8a0c21182f47…` — 재생성된 디렉터리 = live package 의 입력 |
| `--remote --watch --interval 30` | 실행 중(전용 checkout) |
| revision 1 (새 record 1건 게시) | build `5bc9ab7c2377…` → package `081f8be94d31…` · 152 파일 업로드 → 재확인 → seal → pointer 전환 → live 바이트 대조 통과 → `succeeded` 보고 |
| revision 2 (그 record 제거) | build `8a0c21182f47…` → package `3d2501990056…`(이미 seal 됨, 업로드 0) → pointer 전환 → 상세 404 확인 → `succeeded` 보고 |

revision 2 뒤의 live 상태는 실행 전과 같다: package `3d2501990056…`, portfolio 문서 version `968afbccb944940d8d3c099dd54df5be`, `/portfolio` 응답 바이트 동일.

## 측정값

| 구간 | 소요 |
|---|---|
| export 수신 → 생성 → build | 12초 |
| R2 업로드 152개(concurrency 4) | 66초 |
| 업로드 재확인(sha256 + size) | 53초 |
| seal + pointer 전환 | 8초 |
| live 확인 + 결과 보고 | 5초 |
| 한 주기(새 package) | 약 2분 25초 |
| 한 주기(이미 seal 된 package) | 약 26초 |

## `00-summary.md` 의 남은 위험 (1) — 닫힘

"운영 zone 이 HTML/이미지를 변형하면 바이트 비교가 실패한다" → 첫 `--remote` 실행에서 상세 페이지 · 대표 사진 · 목록의 바이트 대조가 통과했다.
zone 설정에서 HTML minify · 이메일 난독화 · 이미지 최적화를 켜면 다시 실패한다.

## 지금 상태와 주의할 것

1. **운영 publisher 는 전용 checkout `/Users/woops/projects/web-recon-track-b-publisher`(detached `8e1b06f`)에서 돈다.**
   pid `~/.config/boostchat/portfolio-publisher.pid`, 로그 `~/.config/boostchat/portfolio-publisher.log`. 그 checkout 의 작업 트리는
   생성 파일과 build 저장소 때문에 바뀌어 있다 — 거기서 커밋하지 않는다(runbook §9).
2. **이 host 에서 `site:publish --rollback` 을 쓰지 않는다.** pointer 의 `previous` 가 revision 1 의 package(`081f8be9…`, 테스트 record 포함)다.
   rollback 하면 그 페이지가 다시 공개된다. 다음 정상 게시가 한 번 지나가면 `previous` 는 `3d250199…` 가 된다.
   비상시 pointer 만 되돌릴 때는 `--expect-package 3d2501990056f8da6d5e2d9cbed8491a518ca7934bb55309956cd721ad04733b --expect-live <현재 hash>`.
3. **[닫힘 2026-10-07] demo 의 managed marker(`portfolio.source.json`)를 커밋했다**(runbook §8.1, `03-demo-managed-marker.md`). 이 checkout 에서
   demo 의 `site:build` 와 수동 `site:publish` 는 거부된다 — 커밋된 옛 포트폴리오가 올라갈 수 없다.
4. 이 checkout(`web-recon-track-b`)의 `data/` 는 실행 전후로 변화가 없다.
