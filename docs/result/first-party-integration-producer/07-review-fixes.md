# 07 — 독립 리뷰 반영 내역

- 날짜: 2026-09-22
- 리뷰: `05-review-contract.md` (계약 02/03, fresh context) · `06-review-implementation.md` (구현, fresh context). 두 리뷰어에게 원하는 결론을 주지 않았다.
- 원칙: BLOCKER/MAJOR 는 전부 반영. MINOR 는 producer 쪽에서 닫을 수 있는 것은 반영, 나머지는 사유와 함께 기록.

## A. 구현 리뷰 (`06`) — BLOCKER 0 · MAJOR 2 · MINOR 7 · NOTE 8

| # | 판정 | 처리 | 근거·검증 |
|---|---|---|---|
| MAJOR-1 emitter 코드가 build input 이 아니다(`PRODUCER_VERSION` 수동 bump 에만 의존) | **반영** | `platform/integration/sources.ts` 신설: producer 소스 6개(`integration/{contract,config,emit,validate,sources}.ts`, `build/declared-routes.ts`)의 (path, sha256) 목록 hash 를 `integrationInputHash` 에 포함. 파일은 `import.meta.url` 기준으로 읽는다. build record 에 `integration.producerSourceHash` 기록 | 테스트 B2(hash 식·파일 목록·소스 변경 → identity 변경), G1(record 의 hash = working tree). golden 을 폐기·재빌드(`03-golden-build.md`) |
| MAJOR-2 계약 표류: item route 0개를 빌드 실패로 처리(02 §4 는 "resource 미제공 = manifest `resources: {}`"), validator 가 `resources: {}` 를 거부 | **반영** | `emit.ts portfolioRoutes`: 0개 → `undefined`(resource 미제공, manifest 만 emit), 2개 이상 → 모호 → 실패. `IntegrationEmission.portfolio` optional. `validate.ts`: `resources: {}` 는 계약이 허용한 유일한 빈 객체로 예외 처리, 미제공 시 pointer 없음·파일 = manifest 만 검증. builder 요약·로그 분기. `06` A3/A4 문구 정정 | 테스트 E9(manifest-only byte, validates), E10(2개 → ambiguous), V13(pointer 없는 document / document 없는 pointer 거부) |
| MINOR-1 `publishedAt` 무조건 대입 | 반영 | 다른 optional 필드와 같은 가드 | E4 |
| MINOR-2 테스트의 `\|\| true` 공허 assertion | 반영 | 삭제 | V3 의 `invalid shapes` 가 같은 성질을 검증 |
| MINOR-3 declared-routes stdout 파싱 가드 없음 | 반영 | 빈 출력/JSON 오류 → 사이트·stderr 맥락을 붙인 `SiteBuildError` | — |
| MINOR-4 `DeclaredRoutesSchema` 가 preflight 리더보다 엄격 | 반영 | 관용 schema(모르는 key 버림, collection/page 문자열); emitter 가 필요한 것만 고른다 | E9(모르는 key·collection·page 허용) |
| MINOR-5 INV-4 를 이름으로 검증하는 테스트 없음 | 반영 | V1b: fixture-large 원본 `projects.json` 에서 published ∧ publishedAt ≤ at 인 id 집합 == document id 집합, draft·예약 id 부재 | V1b |
| MINOR-6 `06` 이 없는 `00-summary.md` 를 가리키고 "Phase A 완료" 표현이 A6/A7 과 안 맞음 | 반영 | `00-summary.md` 작성; `06` 머리말에 A6(publish origin 대조로 충족)·A7(golden = 실제 패키지 + 테스트 상수) 명시 | — |
| MINOR-7 publish 가 manifest 의 origin 을 대조하지 않음 | 반영 | `planPublish`: `_integration/manifest.json` 의 `site.publicOrigin` 을 hostname 과 대조, `manifestOrigin` 노출. 정책은 sitemap origin 과 동일(원격 publish = 거부, 로컬/테스트 host = 경고) — consumer 가 origin 불일치 manifest 를 거부하므로 "켰는데 영원히 ON 이 안 되는" 상태를 막는다 | R2(일치 · `requireOriginMatch` 불일치 거부 · localhost 경고) |
| NOTE 1–8 | 기록 | 코드 변경 없음(리뷰어가 검증 완료로 표시한 항목 포함). 원문은 `06-review-implementation.md` §NOTE | — |

리뷰가 "검증됨"으로 확인한 것(리뷰어 직접 재현): OFF/ON identity 분리, live 패키지 무결, golden = live + 2 파일, release source 불변, 사이트 하드코드 없음, §21 golden 재현, UR2/HT7/순서/allowlist. 원문 `06-review-implementation.md` §"검증된 것".

## B. 계약 리뷰 (`05`) — BLOCKER 1 · MAJOR 8 · MINOR 12 · NOTE 7

전부 **반영**(문구 명확화 — 필드·enum·`schemaVersion` 변경 없음). 02 의 각 삽입 문장에 `(freeze 검토 2026-09-22, \`05\` C-nn)` 표시(24곳), 03 에 `freeze review 2026-09-22` 인용(21곳). consumer 의 CH-R10/CH-R11a/b/c 원문 행은 byte 그대로다(기계 대조). 원칙: consumer 가 확인 문서에서 **이미 선언·구현한 동작**을 계약 문장으로 옮기거나, 두 구현이 갈릴 수 있는 빈칸을 메운다. 새 의무를 consumer 에 지우는 것은 없다(C-02 의 최대 간격도 consumer 가 선언한 10분의 기록). **consumer 통보 필요** — Phase B 착수 전 `02` 의 표시된 문장을 확인받는다.

| # | 판정 | 처리(02 위치 → 03 경로) | 근거 |
|---|---|---|---|
| C-01 **BLOCKER** "유효한 manifest/document" 미정의, 계약 위반 문서의 `C:` 동작 없음 | 반영 | §3.2 에 유효성 3수준 표: (a) 문서 수준 불변식 위반 = TRANSIENT(문서 통째 거부, last-good 유지) (b) record 수준 결함 = 그 record 만 폐기 (c) 모르는 값 = 그 값만 모름 → `core.availabilityStates.validity`. TRANSIENT 행에 origin 불일치·`site.id` 변경 추가(C-12·C-20 동시 해소) | consumer 확인 §15.4 U5 "record 단위 폐기", §13.1 행 T 와 02 §19 를 같은 뜻으로 고정. 이 producer 의 validator 는 (a)(b) 모두 빌드 실패로 막는다 |
| C-02 확인 주기 최대 간격 없음 | 반영 | §3.2 CH-R11 표 아래 + VO6: 최대 간격(전파 상한)도 VO6 형식 consumer 선언값, 현재 10분 → `checkInterval.currentDeclaredMax` | consumer 가 "10분 간격으로 돈다"고 선언한 값의 기록 |
| C-03 문서/record/manifest 한도 초과 동작 없음 | 반영 | VO6: `C: MUST` 초과 시 문서 통째 거부 = TRANSIENT, `P: SHOULD` 경고 → `P: MUST` 경고 → `VO6.overLimitBehaviour` | consumer §12.3 L1 / R12-5 선언. producer validator 는 항상 경고(V11) |
| C-04 origin 동일성 판정 규칙 없음 | 반영 | §5: WHATWG `origin` 직렬화 기준 비교, `P: SHOULD` 정규형으로 emit → `core.manifest.originComparison` | consumer R12-3(`URL.origin` 비교, producer SHOULD 제안). validator 는 `new URL(o).origin === o` 강제 |
| C-05 명시적 port: 02 허용 / consumer 거부 | 반영 | §7.1·§5: `https://host`, V0 는 명시적 port 없음 → `fields["site.publicOrigin"].form`. validator 도 port 거부(V13) | consumer R12-1 과 일치(producer 쪽 축소, 기존 배포 영향 없음) |
| C-06 CH-R11b 의 `P: MUST` 404 가 §16/§20.1/§22 에 없음 | 반영 | §16 HT9, §20.1 "코드 확인" 등급, §22 INV-15 → `httpRules.HT9`, `guaranteeClasses.confirmedInCodeLiveUnmeasured`, `INV-15` | 테스트 R1(fake R2). live 측정은 Phase D |
| C-07 URL 문자 집합·percent-encoding 규칙 없음 | 반영 | UR2: path = percent-encoded ASCII(RFC 3986 pchar + `/`), UR3 "변형 없이" = byte 그대로 → `urlRules.UR2/UR3`. validator 가 pchar 집합·`%XX` 강제(V13) | 이 플랫폼 slug 는 schema 상 ASCII |
| C-08 `category` 정확히 1개가 규범 표기 없음 | 반영 | §11.3 `P: MUST`, §22 INV-16, §20.1 기계적 → `wellKnownKeys.category.perRecord`, `INV-16`. validator 강제(V13) | emitter 는 항상 `[project.category]` |
| C-09 OD-1/OD-2 결정이 `04` 에 없음 (+C-14 `04` matrix stale) | 반영 | `04` 에 "OWNER DECISIONS — 결정 기록 (2026-09-22)" 절(OD-1 승인, OD-2 (a), owner 의 데이터 판단 8건) + readiness matrix 갱신; 02 머리말·SE6 인용처를 결정 기록으로 | 결정의 출처 = owner 의 master task prompt(2026-09-22) |
| C-10 산문 개정 절차 없음 | 반영 | 머리말: 산문 명확화 = 02 수정 + 03 재파생 + consumer 통보, `schemaVersion` 불변 → `proseRevisions` | — |
| C-11 첫 404 상태가 표에 없음 | 기록 | 이미 §3.2 에 "consumer 내부 규칙 SUSPECT, 요구도 금지도 않음" 으로 있음 | 변경 없음 |
| C-12 TRANSIENT 행에 origin 불일치 없음 | 반영 | C-01 과 함께 | 03 은 이미 갖고 있었다(parity 결함 해소) |
| C-13 03 의 `amount > 0` 이 02 에 없음 | 반영 | PR1 에 양수 명시 | validator 는 이미 강제(V5) |
| C-14 `04` 가 freeze 이전 상태 | 반영 | C-09 와 함께; §B 의 "emit 하지 않는다" 행에 정정(빌드 실패) 추가 | — |
| C-15/C-16 tag/scope cardinality 문구 충돌 | 반영 | §11.3: `scope`·`tag` 는 record 당 0개 이상(없으면 key 생략), 있으면 1개 이상 → `perRecordCardinalityNote` | emitter 동작과 일치(E4) |
| C-17 facets 맵 key 순서 없음 | 반영 | §6.1: key 의 code point 오름차순 → `determinism.facetKeyOrder` | emitter 동작과 일치(E3) |
| C-18 "모르는 major" 범위 | 반영 | SV3: major = `.` 앞 정수, 지원 집합 V0 = {0}, 문서 단위 판정 → `schemaVersionRules.SV3` | — |
| C-19 HT7 과 NFC/Default_Ignorable | 반영 | §16 참고: producer 는 정규화하지 않음, consumer 가 색인 시 자기 함수 사용 → `HT7.normalisation` | consumer R-3 |
| C-20 ID4 위반 결과 없음 | 반영 | C-01 (a) 에 포함 | — |
| C-21 수 직렬화 형식 | 반영 | §9/§10: JSON number, 지수 없음, 저장값 그대로(`JSON.stringify`); "원본 그대로" = 수치 동일성 → `determinism.numbers` | emitter 동작과 일치 |
| NOTE 1–7 | 기록 | 원문 `05-review-contract.md` §4 | — |

리뷰어가 정당하다고 확인한 것: freeze 자체(4건 반영·non-breaking·버전 불변), R-1…R-12 판정 정합, CH 원문 일치, availability 상태 기계(위 명확화 전제), §21 예시값. 원문 `05` §5–§6.

## C. 반영 후 재검증

반영 후 최종 working tree 로 전체 재실행(`04-verification.md` §2): platform 체인 13 suites 340 passed / 0 failed (integration 50, milestone 4 suite 전부 통과), test:publish 59, local e2e 45 (+1 skipped), typecheck 3종 clean. golden 은 MAJOR-1 반영으로 identity 가 바뀌어 재빌드했고(`03-golden-build.md` 이력), `_integration/` 두 파일은 첫 golden 과 byte 동일. 계약 명확화(§B)는 emitter 출력에 영향이 없다 — validator 만 엄격해졌고(V13) 데모·fixture 는 여전히 0 error. fresh clone 검증은 `04` §4.
