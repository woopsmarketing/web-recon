# Rollback production-truth guard — runbook (2026-09-29)

`site:publish --rollback` 은 `routing/<host>.json` 을 포인터의 `previous` 패키지로 되돌린다. 그 패키지가 **지금 source 에서 삭제된 포트폴리오 레코드**를 서빙하면 롤백만으로 그 레코드가 다시 노출된다 (boost-interior-demo: live 8건 bi-01…08 → previous 19건, TEST_ONLY bi-09…19 포함). 이 가드는 그것을 코드로 막는다.

## 무엇을 검사하나 (`platform/publish/publish.ts` `assertRollbackPortfolioTruth`, pointer write 이전)
1. 대상 패키지 seal 에 `_integration/manifest.json` 이 없거나 manifest 에 `resources.portfolio` 가 없으면 → 포트폴리오 패키지 아님, 통과 (authoritative data 로드 안 함).
2. manifest 와 그것이 가리키는 portfolio 문서를 store 에서 읽어 **seal 의 sha256/size 와 대조**, JSON 파싱, `records[].id`(string) 확인. 하나라도 실패 → 거부 (fail closed).
3. authoritative id 집합 = `buildSiteSnapshot({ mode: "public", at: now })` 의 `content.projects` — 새 빌드가 portfolio 문서에 넣을 served 집합과 같다 (CLI 가 자동 공급). 공급되지 않으면 거부.
4. 대상 id ⊄ authoritative → 거부. 부분집합(같거나 더 적음)은 허용.

## 거부 메시지 (sabotage 테스트 실측)
```
Rollback target would reintroduce portfolio records no longer present in current authoritative site data: 11 record id(s) served by target package 77cc7f9f47adda09… are not in data/sites/boost-interior-demo/content/projects.json (served at <at>): bi-09, bi-10, …, bi-19 — routing pointer NOT written. To restore content, restore the wanted state in source, build a new package and publish it forward — see docs/result/sales-demo-final-closeout-v1/rollback-truth-runbook.md
```
거부 시 routing pointer 는 한 바이트도 바뀌지 않는다 (테스트: put-spy 로 routing key write 0 회 확인).

## 왜 bypass flag 가 없나
롤백은 "검증된 과거 상태로 즉시 복귀"라서 리뷰 없이 실행되기 쉽다. 삭제된 레코드(합성·미검증 데이터 포함)를 되살리는 것은 복귀가 아니라 **새 콘텐츠 결정**이므로 source 에 기록되고 새 빌드의 QA 를 통과해야 한다. override 가 있으면 그 경로가 우회된다.

## 정당한 복원 경로 (forward publish)
1. 원하는 콘텐츠를 git/source (`data/sites/<site>/content/…`) 에 복원하고 리뷰.
2. `site:build <site>` → 새 immutable 패키지 (QA pass, 새 packageHash 기록).
3. `site:publish --site <site> --host <host> --remote --dry-run --check-store` (읽기 전용 검토).
4. `site:publish … --remote --no-activate` (업로드 + seal, 포인터 안 건드림).
5. `site:publish … --remote --reverify --no-activate` (seal 된 객체 전수 재검증).
6. `site:publish … --remote --expect-live <현재 live packageHash> --expect-package <새 packageHash>` (활성화).
7. live HTTP 확인: `/`, `/portfolio`, `/_integration/manifest.json` → 문서 레코드 수/ids.
(`--remote` 는 `RECON_PUBLISH_ALLOW_REMOTE=1` 필요. 각 단계 기존 07-live-deploy-plan 과 동일.)

## Owner policy
boost-interior-demo: 19건 패키지 `77cc7f9f47adda09d119c6ec5a02626624b4e068b546e15185d39c1658bdbda0` 를 직접 재활성화(rollback 또는 그 패키지로의 publish)하는 것은 **금지**. production = bi-01…08. bi-09…19 는 TEST_ONLY.
