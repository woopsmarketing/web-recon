# 04 — 독립 리뷰

리뷰어: fresh-context subagent, `claude-fable-5-1` (effort xhigh), READ ONLY, BLOCKER / MAJOR만 보고.
원하는 결론은 알려주지 않았고, 11개 질문과 변경 범위(`git status`)만 줬습니다. tool 호출 32회, 약 7분.

```
BLOCKER = 0
MAJOR   = 1   (repo 밖의 결정이 필요한 것 — 아래)
```

## MAJOR 1 — BoostChat 연결은 이 사이트 자신의 origin에서는 동작하지 않고, 켜더라도 두 사이트를 구분하지 못한다

리뷰어의 근거와 MASTER가 직접 확인한 것:

| 리뷰어 주장 | MASTER 확인 |
|---|---|
| key의 허용 origin은 `https://interior-demo.boostweb.co.kr` 하나 | 운영 DB 읽기 전용 조회로 확인 (`proof/prod-usage-check.txt`) |
| bootstrap·lead 모두 origin이 목록과 **정확히** 일치해야 함 | boost-chat `src/lib/widget/origins.ts:157-163` (`allowedOrigins.includes(origin)`) 직접 읽음. 실제 동작도 확인: localhost는 launcher 없음, lead preflight `403` / 허용 origin `204` |
| `inquiry.json`이 있어 폼이 online mode가 되므로, 허용되지 않은 origin에서는 폼이 실패 안내를 보여 줌 | 맞음. online mode는 `02-boostchat-qa.md` §4에서 확인, 실패 화면은 stub 500으로 확인 |
| origin을 추가해도 `lead_request`에는 origin·site 열이 없어 두 사이트의 문의가 한 수신함에서 구분되지 않음 | boost-chat `src/lib/lead/site-lead.ts:207-211` insert 문 직접 읽음: `tenant_id, …, source, submission_id, …`뿐 |
| 채팅의 시공사례 카드는 tenant의 first-party origin(첫 번째 demo)으로 이동 | QA에서 카드가 `https://interior-demo.boostweb.co.kr/portfolio/<slug>`로 여는 것을 확인 |

**판정: 사실입니다.** repo 안에서 고칠 수 있는 결함이 아니라, 한 tenant의 key를 두 사이트가 함께 쓰는 선택의 결과입니다.
이번 작업 범위("기존 integration 재사용, 새 기능 없음, production publish 없음")에서는 이 상태가 맞고, 다음은 owner 결정입니다.

1. localhost에서 widget을 보려면: BoostChat 허용 origin에 `http://127.0.0.1:4322` 추가 (loopback http는 등록 가능).
2. Demo 02를 별도 domain으로 publish한다면: 전용 BoostChat tenant / key를 만들고 이 사이트의
   `scripts.json`·`inquiry.json` 두 파일의 값만 바꾸는 것이 깔끔합니다(template 변경 없음). 같은 tenant에 origin만
   추가하면 문의 출처가 섞이고 카드가 첫 번째 사이트로 이동합니다.

## 문제 없음으로 확인된 것 (리뷰어 요약, MASTER가 같은 결과를 따로 갖고 있는 항목은 표시)

| # | 질문 | 리뷰어가 본 것 | MASTER |
|---|---|---|---|
| 1 | template / release에 BoostInterior hard-coding | `boost`, `부스트`, `wgt_`, `boostchat`, 새 theme 색 literal, asset id를 template·release 전체에서 grep → 0 | 검사 O |
| 2 | 브랜드·source term 누출 | 새 사이트 data + package에 `ongyeol`·`온결` 0, Ongyeol 쪽에 `부스트`·`boostchat`·`wgt_` 0, 두 template의 금지어 0 | 검사 J, N + browser sweep |
| 3 | theme | `templates/`, `platform/`(test 제외) 변경 없음. 19개 token이 새 package CSS에 그대로, Ongyeol package는 기본값 | — |
| 4 | key 일관성 | `scripts.json`·`inquiry.json`·모든 HTML에 같은 key. key ↔ tenant `boost-interior-demo` 1:1 | QA의 API 경로 기록 |
| 5 | Ongyeol | data·package diff 없음, 같은 pin, 검사 H/I/J 통과 | browser sweep 77쪽 |
| 6 | interior-01 | `boost-interior-demo`, `fixture-*`, 그 build·release 변경 없음. `step6` 34, `step5` 32, `slice1` 86, `portfolio-sync` 40 통과 | 18개 suite |
| 7 | release | 두 사이트 pin의 id + hash 동일, 검사 E/G 통과, `data/template-releases` 변경 없음 | release gate `exists-verified` |
| 8 | package | `buildInputId`를 현재 data에서 다시 계산해 일치, package QA pass, 계획된 15쪽 존재, local 참조 1402개 모두 해결 | 검사 L |
| 9 | platform 변경 | `platform/test/` 밖 변경 0, `tsc` exit 0 | — |
| 10 | 테스트 | 기존 assertion 삭제·약화 없음. K는 "정확히 두 사이트"로 더 좁아짐. L–O는 실제로 실패할 수 있는 검사 | — |
| 11 | 회사 사실 | `content/*.json`과 사진 51장이 기존 demo와 바이트 동일. `slots.json`의 모든 숫자를 `projects.json`에서 다시 계산해 일치. 전화·주소·사업자·수상·연혁 없음 | 같은 계산을 따로 수행 |

## 리뷰어가 확인하지 못한 것

- 운영 `allowed_origins` 값(DB 조회 금지 조건) — MASTER의 읽기 전용 조회 결과를 인용.
- Playwright widget QA와 320px header overflow — browser로 다시 돌리지 않음. 둘 다 MASTER가 직접 실행한 결과입니다.
- `portfolio-sync`의 opt-in `[e2e]` block.

## 리뷰 이후에 바뀐 것

리뷰는 최종 build 전에 시작했습니다. 리뷰 시작 후의 변경은 site data 문구 조정과 깨끗한 최종 build이고
(`00-summary.md` §5), 변경 뒤 `interior-02` · `step6` · `portfolio-sync` suite와 browser sweep을 다시 돌렸습니다.
