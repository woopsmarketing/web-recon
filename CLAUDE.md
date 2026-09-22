# 에이전트 작업 규칙

## 1. 메인 에이전트

메인 에이전트는 오케스트레이터다.

가능하면 Opus / Ultracode 등 가장 강한 모델을 사용한다.

메인 에이전트의 역할:

- 전체 작업 계획
- 작업 순서 결정
- 하위 에이전트 배정
- 중요한 기술 판단
- 아키텍처 결정
- 충돌 관리
- 결과 통합
- 최종 검증
- 최종 판정

메인 에이전트가 모든 탐색과 단순 작업을 직접 하지 않는다.

토큰과 시간을 아끼기 위해 가능한 작업은 하위 에이전트에 위임한다.


## 2. 모델은 작업 난이도에 따라 선택

항상 최고 모델을 사용하지 않는다.

### 빠르고 저렴한 모델 사용

다음 작업은 작은/빠른 모델을 우선한다.

- READ-ONLY 탐색
- 파일 찾기
- grep/search
- 코드 위치 찾기
- dependency 조사
- route 목록 조사
- 테스트 목록 조사
- 로그 정리
- 결과 요약
- 단순 문서 확인
- 단순 반복 수정

### 중간급 모델 사용

- 범위가 명확한 구현
- UI 수정
- API 구현
- 테스트 추가
- 단순 리팩터링
- 명확한 버그 수정

### 강한 모델 사용

- 아키텍처
- 복잡한 버그
- DB migration
- 보안
- 인증/권한
- 데이터 무결성
- 여러 모듈에 걸친 변경
- 애매한 요구사항 판단
- 독립 코드 리뷰
- 최종 Release 판단

READ-ONLY라도 보안/아키텍처 판단이 핵심이면 강한 모델을 사용할 수 있다.


## 3. Fresh Context 우선

하위 에이전트는 가능한 한 새 context로 시작한다.

전체 프로젝트 히스토리를 모두 전달하지 않는다.

필요한 것만 전달한다.

- 작업 목표
- 관련 파일
- 반드시 지킬 제약
- 완료 기준
- 필요한 테스트
- 결과 보고 형식

불필요한 로그와 과거 대화 전체를 전달하지 않는다.


## 4. 작업은 작고 명확하게 나눈다

좋은 작업:

- 로그인 흐름 read-only 조사
- 이 3개 파일에서 pagination 구현
- migration FK 검증
- landing mobile 문제 수정

나쁜 작업:

- 프로젝트 전체 개선
- 아무 문제나 찾아서 전부 수정
- 완벽해질 때까지 계속 작업

하위 에이전트는 맡은 범위가 끝나면 STOP한다.


## 5. 병렬 작업 규칙

READ-ONLY 작업은 적극적으로 병렬화한다.

서로 다른 파일을 수정하는 독립 작업도 병렬 가능하다.

하지만 다음 영역은 동시 writer를 피한다.

- migration
- schema
- shared types
- auth
- security
- prompt
- core runtime
- shared repository
- package/config
- 공용 layout
- 공용 test fixture

같은 파일이나 강하게 연결된 모듈은 한 에이전트만 수정한다.

애매하면 직렬 처리한다.


## 6. 같은 Worktree 충돌 방지

기본적으로 하나의 canonical worktree를 사용한다.

다른 세션이 같은 파일을 수정 중이면 동시에 수정하지 않는다.

내가 수정하지 않은 파일이 작업 중 갑자기 바뀌면 원인을 먼저 확인한다.

다른 작업을 자동으로:

- reset
- stash
- restore
- checkout

하지 않는다.


## 7. 먼저 읽고, 그 다음 수정

구현 전에 최소한 다음을 확인한다.

1. 현재 코드
2. 관련 테스트
3. 기존 helper/abstraction
4. 기존 데이터 흐름

이미 있는 기능을 다시 만드는 두 번째 시스템을 만들지 않는다.

문서와 코드가 다르면 현재 코드를 우선하되 차이는 기록한다.


## 8. 검증은 작업 크기에 맞춘다

작은 수정 하나마다 전체 검증을 반복하지 않는다.

예:

- 문구 수정
- 작은 CSS 수정
- 단순 rename
- 독립 helper 추가
- 작은 component 수정

이런 작업은 여러 개를 묶어서 검증한다.

### 큰 작업 단위가 끝나면 검증

예:

- 하나의 WP 완료
- API 기능 완료
- migration 완료
- auth/security 변경 완료
- 여러 파일 리팩터링 완료
- 사용자 흐름 하나 완료

그때 관련 테스트를 실행한다.

필요에 따라:

- relevant tests
- typecheck
- lint
- build
- runtime/browser test

를 수행한다.

전체 regression은 Release/큰 milestone 마지막에 한 번 수행한다.


## 9. 위험한 변경은 즉시 검증

다음은 작은 변경이라도 바로 검증한다.

- migration
- auth
- permission
- tenant isolation
- payment
- security boundary
- destructive data logic
- retention
- production startup
- cost/budget enforcement

위험도가 높은 변경은 빠른 피드백이 더 중요하다.



## 10. 컨텍스트 절약

메인 context를 불필요하게 소비하지 않는다.

하위 에이전트 결과는 요약해서 전달한다.

전체 파일 대신 필요한 부분만 읽는다.

전체 로그 대신:

- 실패 부분
- 요약
- assertion count
- exit code

만 가져온다.

이미 확인한 내용을 반복해서 다시 조사하지 않는다.


## 11. 독립 리뷰

보안, 아키텍처, Release 작업은 구현자가 자기 코드만 보고 PASS시키지 않는다.

큰 작업이 끝난 후 fresh-context reviewer를 사용할 수 있다.

Reviewer에게 원하는 결론을 알려주지 않는다.

예:

좋음:
"보안 문제와 release blocker를 독립적으로 검토하라."

나쁨:
"PASS인지 확인하라."


## 12. 실패 처리

테스트가 실패하면 PASS가 나올 때까지 무작정 반복하지 않는다.

순서:

1. 실패 기록
2. 원인 파악
3. 수정
4. 필요한 범위만 재검증

테스트를 통과시키기 위해 정상적인 assertion을 삭제하거나 약화하지 않는다.


## 13. Git 규칙

Git은 작업을 막는 gate가 아니다.

별도 요청이 없으면:

- clean tree 요구하지 않음
- branch 필수 아님
- commit 필수 아님
- push 필수 아님

현재 local worktree를 기준으로 작업한다.

사용자의 기존 변경을 임의로 되돌리지 않는다.


## 14. 기본 작업 흐름

큰 작업은 기본적으로 다음 순서를 따른다.

READ-ONLY 정찰
→ 계획
→ 하위 작업 병렬 배정
→ 구현
→ 큰 작업 단위 완료
→ 관련 검증
→ 다음 작업
→ 전체 통합
→ 전체 regression
→ fresh review
→ 수정
→ 최종 검증
→ 보고
→ STOP


## 15. 우선순위

기본 우선순위:

1. 정확성
2. 작업 속도
3. 안전성
4. 컨텍스트 절약
5. 모델 비용 절약

최고 모델은 판단이 중요한 곳에 집중해서 사용한다.

단순 탐색과 반복 작업에 최고 모델을 낭비하지 않는다.

## 결과보고서
결과 보고서는 기본적으로 `docs/result/<task-name>/`에 .md로 저장한다 (작은 단위 보고서 + 종합보고서). cli 출력은 보조.
`docs/status/`는 현재 milestone/상태가 바뀔 때만, `docs/architecture/`는 아키텍처 결정이 accepted될 때만 수정한다.


## Project documentation

If `AUTHORITATIVE_WORKTREE.md` exists in the repo root, read it first: it says whether this folder
is the current official worktree and where the other copy is.

Do not duplicate project history in CLAUDE.md. Start from `docs/README.md`
(→ `docs/architecture/runtime-preservation.md`, `docs/status/source-preservation-v2.md`, `docs/result/`).

Core invariant: interactive runtime replay starts from a bootstrap document/state
compatible with the source application's original startup lifecycle.
Do not automatically treat settled runtime DOM as hydration/mount base.
Detailed reasoning and proof live in the architecture/result documents.
