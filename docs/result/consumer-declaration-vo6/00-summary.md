# Consumer 선언값 변경 반영 (VO6) — 2026-09-23

입력: BoostChat Phase 2B 통보 `boost-chat/docs/reports/integration/web-recon-consumer-declaration-change-2026-09-22.md` (READ-ONLY 로 읽음, BoostChat repo 수정 없음)

## 변경한 선언값

| 항목 | 이전 | 이후 |
|---|---|---|
| 확인 최소 간격 | 10분 | 10분 (유지) |
| 확인 최대 간격 / background polling | 10분 (in-process timer) | **없음 — on-demand**. 트리거: ① ops/manual refresh ② publish 직후 트리거(후속) ③ 방문자 사용 시 사본 >24h lazy refresh |
| 24h 신선도 | (미선언) | 24시간 (lazy trigger 조건, consumer 선언) |
| last-good 최대 수명 | 72h | 72h (유지). ②가 생기기 전의 실효 전파 상한 |
| schemaVersion / contractVersion | 0.1 | 0.1 (유지) |

## 수정한 파일 (docs 2개만)

- `docs/reports/integration/02-integration-contract-v0-candidate.md`: 헤더에 변경 반영 bullet 추가, §3.2 최대 간격 문단 교체, §11.1 VO6 문장 교체. PC5·PC7 행 본문은 그대로 두고, §3.2 에 읽는 방법을 적었다("다음 성공 주기" → "다음 성공한 확인", "2주기" → "서로 다른 두 번의 확인", PC5 최악의 경우에 '확인 없음'도 포함).
- `docs/reports/integration/03-integration-contract-v0-candidate.json`: 값 4개만 바꿨다(`proseRevisions`, `core.availabilityStates.checkInterval.{rule,currentlyDeclared,currentDeclaredMax}`). **key 집합은 HEAD 와 같다** (스크립트로 확인). JSON parse OK, `contractVersion` = "0.1".

producer, emitter, site package, workers 는 바꾸지 않았다. Cloudflare publish 도 하지 않았다.

## 검증

- `platform/test/integration.test.ts`: **50 passed, 0 failed**, exit 0. golden emission 과 release 1.5.2 hash 가 그대로다 → producer 출력 불변.
- contract 문서를 읽는 test 는 없다(grep 으로 확인). 그래서 parity 는 key-diff 스크립트와 리뷰로 확인했다.

## Fresh review (이 delta 만, 독립)

BLOCKER 0 · MAJOR 0. 반영한 것: 24h 신선도를 선언값으로 명시, PC5 최악의 경우 읽는 방법, `currentlyDeclared` 에 "(minimum)" 표기.

반영하지 않고 남긴 것:
- `03` VO6 `alsoDeclaredThisWay` 에 max 항목이 없다. 이 gap 은 원래부터 있었다. key 를 추가하면 field 변경이 되므로 넣지 않았다. max 값은 `checkInterval` 에 있다.
- "확인 주기 / check cycle" 표현(§3.2 표, CH-R11a, PC5/PC7 행)은 그대로다. 규칙 본문 문구를 바꾸는 일이라 이번 범위 밖이다.
- PC5/PC7 해석 변경(전파 상한이 10분 → 실효 72h)은 consumer 가 스스로 통보한 영향이다. producer 쪽 publish 트리거(②)는 후속 작업이다.
- 다른 문서(`04`, `06`, `docs/result/**`)에 남은 10분 언급은 역사 기록이라 고치지 않았다.

## 판정

```
VO6_DECLARATION_UPDATED    = YES
CONTRACT_VERSION_UNCHANGED = YES (schemaVersion 0.1, key 집합 불변)
PRODUCER_OUTPUT_UNCHANGED  = YES (integration.test 50/0, producer 코드 diff 없음)
```

WEB_RECON_CONSUMER_DECLARATION_UPDATED
READY_FOR_PHASE3
