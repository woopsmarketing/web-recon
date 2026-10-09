# interior-03 proof 산출물

주의: `.jpg` / `.png` 는 git-ignore 대상이라 이 폴더의 이미지는 이 머신에만 존재한다. JSON 과 `scripts/*.txt` 만 커밋된다.

## 폴더
- `fixture/` — 기준 fixture(누리담, :4340) 전 라우트 풀페이지 JPEG(q72). 1440·390 전 라우트, 768·1024 는 `/`, `/portfolio`, `/contact`. `state-*` 는 인터랙션 상태(드로어, FAQ 열림, 문의 검증, 메일 핸드오프).
- `demo03-local/` — Demo 03(:4341, boostchat.co.kr 차단) 동일 구성. `state-*` 는 드로어, FAQ 열림, 검증 상태, 스텁 성공 상태.
- `source-vs-template/` — 좌: 레퍼런스(기존 manual-observation 스크린샷), 우: fixture. 같은 높이로 스케일(레퍼런스 390 샷은 device scale 3). service 는 레퍼런스 blog 와 짝, detail 은 상단 2400px.
- `scripts/` — 실행한 스크립트 사본(`.txt`).
- `sweep-fixture.json`, `sweep-demo03.json` — 7폭 스윕 결과. `interaction-i03.json` — 인터랙션 결과.

## 생성 방법
- 스윕: `scripts/run-sweeps.sh.txt` (내부에서 `sweep-i03.mjs` 호출; 두 사이트 병렬)
- 인터랙션 + state 샷: `interact-i03.mjs <out.json> <proofDir>`
- 라우트 샷: `shots-i03.mjs <proofDir>`
- 비교 이미지: `pairs-i03.py <proofDir>` (PIL)
- 안전: 채팅 호스트는 모든 컨텍스트에서 abort, 리드 URL 은 항상 스텁(200 `{"received":true}`)으로 응답. 실제 전송 없음.

## 그 밖의 폴더 (MASTER가 추가)
- `demo03-publish/` — publish log. `00`–`07`은 첫 publish, `10`–`14`는 release를 다시 만든 뒤의 publish, `timeline.txt`는 두 번의 시각.
- `demo03-live/` — 실제 도메인 E2E. 바로 아래는 첫 package에서의 실행(기록), `final/`이 최종 package에서의 실행이다.
- `boostchat/` — tenant 생성 · binding · feed 갱신 log(e-mail 가림)와 적용 뒤 읽기 전용 dump.
- `accounting/` — Cloudflare · Railway · production DB의 읽기 전용 조회 결과(집계만. IP · request id 없음).
- `source-isolation-audit.json` — 감사 결과(종류와 건수만. 낱말 자체는 repo 밖).
- `recut-package-equivalence.txt` — release를 다시 만들기 전 · 후 package 비교.
- `regression-summary.tsv`, `regression-summary-after-recut.tsv`, `regression-live-and-untouched.txt` — test 실행 요약과 기존 site 확인.
