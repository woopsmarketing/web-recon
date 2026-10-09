# interior-03 — 08. 독립 리뷰

작성일 2026-10-09. 시각은 UTC.

## 요약

```
INDEPENDENT_REVIEW = 2회 (release 전 1회 · 전체 구현 뒤 1회), 둘 다 fresh context · 읽기 전용
최종 리뷰          = BLOCKER 0 · MAJOR 2 · MINOR 8
처리               = MAJOR 1건 수정(release 다시 만듦 · 다시 publish · 다시 검증), MAJOR 1건은 zone 전체의 기존 상태라 owner 결정으로 남김
작업 전체의 열린 MAJOR = 2 (http 접속이 https로 넘어가지 않음 · 문의 접수 403 — 둘 다 이 repo 밖의 설정)
```

리뷰어에게는 무엇이 만들어졌는지와 지켜야 할 요구 사항만 줬고, 기대하는 결론은 알려 주지 않았다.
리뷰어의 판단은 그대로 받지 않고 MASTER가 code와 실제 응답으로 다시 확인했다.

**지시와 다른 점**: 최종 리뷰는 Fable 5.1 xhigh로 하라는 지시였지만 Fable 사용 한도에 걸려(10:58Z 재시도도 실패) Opus 5.5 xhigh로 했다. release 전 리뷰는 Fable 5.1이었다.

## 1. release 전 리뷰 (template만, Fable 5.1)

| 등급 | 지적 | MASTER 확인 | 처리 |
|---|---|---|---|
| MAJOR | 필터가 걸린 목록에서 header의 같은 메뉴를 누르면 주소만 바뀌고 filter와 `noindex`가 남음 | 재현됨 | 수정. 현재 메뉴는 일반 link로(전체 load). browser에서 확인 |
| MAJOR | hero 자동 회전을 멈출 수단이 없음 | 사실 | 수정. 정지 · 재생 버튼. 확인 중 "재생 뒤에도 멈춰 있는" 결함을 찾아 같이 고침 |
| MAJOR | mail mode에서 hydrate 전에 제출하면 입력값이 주소에 실릴 수 있음 | 사실 | 수정. 두 mode 모두 mount 전 비활성. raw HTML과 no-JS에서 확인 |
| MAJOR | 기본 theme의 강조색 대비가 AA 미달 | 사실 | 유지. 기본 theme는 reference palette이고 site가 token으로 바꾼다. 오류 문구만 본문색으로 |
| MINOR 6 | drawer 위의 to-top, FAQ landmark, 인용문 `aria-hidden`, 긴 낱말 넘침, gallery 행 간격, category link encoding | 사실 | 수정 |
| MINOR 3 | 최대 길이 문구의 좁은 폭 넘침, 기본 muted 색 대비, favicon 없음 | 사실 | 기록 |

그 뒤 release 1.0.0을 만들었다.

## 2. 최종 리뷰 (전체, Opus 5.5 xhigh, 10:58 → 11:27)

범위: template, release, 두 site의 data와 package, test 변경, Worker route, publish log, 공개 host의 응답(`curl`), BoostChat tenant의 읽기 전용 dump.
리뷰어는 실제 domain을 browser로 열지 않았고 BoostChat host에 요청하지 않았다(진행 중이던 E2E의 속도 제한 때문에 금지함).

### MAJOR 1 — 금지어 목록에 source의 개인 값이 그대로 있음 → 수정

- **지적**: `templates/interior-03/v1/provenance.json`의 `forbiddenTerms`와, 그것을 복사한 release의 `release.json`에 reference 회사의 이름, 사업자 등록 번호,
  사람 이름 3개, 길 이름 2개, 전화 조각 2개, 계정 id가 그대로 있다. `data/template-releases/**`는 git에 올라가므로 commit하면 그대로 남는다.
- **MASTER 확인**: 사실. 14개 중 11개가 개인이나 계정을 가리킬 수 있는 값이었다. interior-01 · 02의 목록은 brand · 회사 계정 id · 회사 번호 수준이라, 사람 이름과 사업자 등록 번호까지 넣은 이번 목록만 그 범위를 넘었다.
  MASTER의 source isolation 감사는 이 두 file을 검사 대상에서 빼고 있어서 잡지 못했다.
- **수정** (commit 전):
  1. `provenance.json`을 brand 수준 5개로 줄이고, 왜 개인 값을 넣지 않는지 file의 note에 적었다. 뺀 11개는 repo 밖의 목록으로 옮겼다.
  2. 목록이 release hash의 입력이라 release를 다시 만들었다: `interior-03-1.0.0-f353e5954217` → `interior-03-1.0.0-2a949e9f0247`. template source hash는 같다(template file 변경 0).
     앞의 release와 그 package는 commit한 적이 없고 정식 트리에서 치웠다.
  3. 두 site의 pin을 바꾸고 다시 build했다. build id · release id를 가리고 비교하면 `build-record.json` 말고 모든 file이 앞의 package와 같다(`proof/recut-package-equivalence.txt`).
  4. 감사 script가 `provenance.json` · `release.json`도 개인 값 종류로 검사하게 했다. commit할 file 전체(791개)에서 repo 밖 목록의 개인 값 16개를 찾았고 0건이다.
- **다시 검증**: typecheck 3종, `test:platform` 17 suite 전부 통과(`proof/regression-summary-after-recut.tsv`), 7폭 sweep 두 site 문제 0, 감사 0건,
  다시 publish(11:37:07 → 11:40:36, live byte가 새 package와 일치), 실도메인 E2E 다시 실행(11:41:28 → 11:50:03, pass 148 · fail 1 · blocked 2, `05` §3 · §4).

### MAJOR 2 — http 접속이 https로 넘어가지 않고 HSTS가 없음 → owner 결정으로 남김

- **지적**: `http://interior-demo-3.boostweb.co.kr/contact`가 redirect 없이 200이고, https 응답에 `Strict-Transport-Security`가 없다. 이름 · 전화를 받는 form이 있는 page다.
- **MASTER 확인**: 사실. 다만 이 작업이 만든 상태가 아니다. `http://boostweb.co.kr/`와 기존 demo host 둘도 같고,
  `docs/result/cloudflare-live-pilot/00-summary.md`가 "zone-wide, pre-existing"으로, 그 리뷰가 "zone에서 결정할 일"로 이미 적어 둔 항목이다.
  canonical · sitemap · 모든 내부 link는 https이고, form의 전송 주소도 https다.
- **고치지 않은 이유**: 고치는 방법은 zone의 "Always Use HTTPS" 설정이나 공용 Worker의 redirect인데, 둘 다 같은 zone의 다른 제품과 기존 두 demo host의 동작을 바꾼다.
- **필요한 결정**: zone에서 "Always Use HTTPS"와 HSTS를 켤지. 실제 고객 site를 올리기 전에는 정해야 한다(pilot 문서의 기존 결론과 같음).

### MINOR 8건

| # | 지적 | MASTER | 처리 |
|---|---|---|---|
| 1 | 414 px 이하에서 page 맨 아래로 가면 to-top이 footer 저작권 줄의 끝을 가림 | 재현(360 · 390 · 414에서 가로 5–32 px · 세로 12 px 겹침. 430부터 없음) | 기록. 고치려면 template을 바꾸고 release를 새로 내야 한다. 다음 release에서 좁은 폭의 footer 아래 여백을 to-top 높이만큼 늘리면 된다 |
| 2 | Demo 03 목록의 category 탭 label이 481 · 540 · 600 · 769 px에서 말줄임 | 확인 안 함 | 기록. 넘치지 않고 줄여서 보인다 |
| 3 | 금지어 목록이 고객 이름 · e-mail · host · analytics id를 다 담지 않음 | 사실 | 의도. 개인 값은 repo에 두지 않고 repo 밖 목록으로 검사한다(MAJOR 1) |
| 4 | route · release · site가 commit되지 않은 상태라 HEAD에서 Worker를 배포하면 Demo 03이 내려감 | 사실 | commit · push로 해소 |
| 5 | Worker가 CSP · `frame-ancestors` · `Referrer-Policy`를 보내지 않음 | 사실, 기존 상태 | 기록. pilot 문서의 알려진 항목 |
| 6 | `/portfolio`의 주소 정리가 `utm_*` 같은 모르는 query를 지움 | 확인 안 함 | 기록 |
| 7 | JavaScript가 없으면 mobile header에 page link가 없음(drawer가 script로만 열림) | 사실 | 기록 |
| 8 | 공개 footer에 개인 gmail 주소 | 사실 | 기존 demo 둘과 같은 business e-mail이다. owner가 정할 일 |

### 리뷰어가 문제없다고 본 것 (요약)

source isolation(자체 낱말 목록 추가, 문장 겹침 0, 이미지 hash 일치 0, class 이름 겹침 0), template에 site 고유 값 없음(색 literal · brand · key · host · 좌표),
release 검증(19개 release 모두 통과, 기존 release 변경 없음, 두 site가 같은 release), theme 분리, 320–1920 px 26개 폭의 layout과 interaction(Demo 03 85/85 · fixture 72/72, local),
tenant 격리(package에 key 하나 · origin 하나, feed의 주소가 모두 자기 package 안), publish(live file 49개가 package와 byte 단위로 같음, 404 · cache · 숨김 file),
test 변경(추가뿐. 기대값이 바뀐 검사는 interior-02 test의 K 하나).

### 리뷰어가 확인하지 못했다고 한 것과 MASTER의 보완

| 리뷰어 | MASTER |
|---|---|
| 실제 widget의 크기와 위치, chat, 카드 | 실도메인 E2E에서 측정(launcher 64×64 / mobile 60×60, to-top과 겹침 0, chat · 카드 통과) |
| 기존 tenant `boost-interior-demo`의 09:44:03 audit 행 | 읽기 전용으로 확인: 제품의 예약된 24시간 갱신(`reason: scheduled:24h`, system 계정)이고 이 작업과 무관 |
| `test:platform` 전체 | MASTER가 두 번 실행(release 다시 만들기 전 · 후), 모두 통과 |
| WebKit · 실제 기기의 interaction | mobile widget과 drawer만 WebKit(iPhone 13 emulation)으로 확인. 실제 기기는 쓰지 않음 |
| live file 168개 중 119개 | publish 도구가 upload 뒤 168/168의 sha256 · 크기를 검증하고 다시 한 번 검증함 |
| `approval_status pending`의 뜻 | 확인하지 않음. 기존 demo tenant도 같은 값이고 widget은 동작한다 |

## 3. 작업 전체의 최종 상태

```
BLOCKER = 0
MAJOR   = 2 (열림)
  1. http → https redirect와 HSTS 없음 — zone 전체의 기존 상태. owner 결정
  2. 공개 site의 문의 form 접수가 server에서 403 — BoostChat의 WIDGET_SITE_LEAD_KEYS에 key 없음. owner 조치 (`05` §5)
MINOR   = 8 (기록) + release 전 리뷰의 기록 3
```
