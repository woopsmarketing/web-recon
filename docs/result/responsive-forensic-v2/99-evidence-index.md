# 99. 증거 색인

루트: `tmp/wr-responsive-forensic-v2/` (조사 전용, 생산 코드 아님)

| 경로 | 내용 |
|---|---|
| `tools/snap.mjs` | 소스/클론 스냅샷(구조경로, bbox, computed). `INJECT_CSS`, `LABEL` 지원 |
| `tools/sweep.sh`, `exp.sh`, `exp2.sh` | 폭 스윕 / 실험 배치 |
| `tools/compare.mjs`, `toplevel.mjs`, `chain.mjs`, `subtree.mjs` | 1:1 비교, 최상위 섹션, 체인/서브트리 덤프 |
| `tools/aggregate.mjs` | 첫 파손 관계 분류 |
| `tools/varmap.mjs`, `mechmap.mjs`, `mechtotals.mjs` | 일관성 지표, 메커니즘 맵 |
| `tools/nodeinfo.mjs` | 노드별 spec/probe/authored/recovered 규칙 덤프 |
| `tools/nonowned-census.mjs` | probe 유효인데 미소유인 노드 census |
| `tools/gen-override.mjs` | authored 번역 실험 CSS 생성 |
| `tools/hero-probe.mjs` | hero 런타임 probe(클론 측 셀렉터 오류로 클론 출력은 미사용) |
| `tools/agent-analyze-probe.mjs` | 원본 probe 0-행 분석(하위 에이전트) |
| `evidence/snap/{source,clone,cloneH,cloneA,cloneP}-{home,service}-<w>.json` | 스냅샷 |
| `evidence/components.json` | 컴포넌트 루트 경로 정의 |
| `evidence/override/*.css` | 실험 주입 CSS (앱에 미기록) |
| `logs/next-3461.log`, `sweep.log`, `exp.log`, `exp2.log` | 클론 서버(포트 3461), 스윕/실험 로그 |

참조 아티팩트(읽기만): `data/apartmentary.com/reconstructions/2026-09-15T07-43-23-840Z/{reconstruction-manifest.json, app/public/wr/generated-styles.css, app/reconstruction-data/pages/p00000{1,6}.json}`, `data/apartmentary.com/site-specs/2026-09-15T05-19-26-498Z/pages/p00000{1,6}.json`, `data/apartmentary.com/site-observations/2026-09-15T05-10-38-532Z/pages/*/layout-probe*.json`.

코드 참조: `src/observer/layout-probe.ts:1206, 1215-1218, 817-819`; `src/sitespec/compile-page.ts:487-491, 520`; `src/reconstruction/responsive-decl/plan.ts:74, 788`; `src/reconstruction/layout-truth-check.ts:2917, 3145-3189, 3395-3510`; `src/reconstruction/plan-reconstruction.ts:434`; `src/reconstruction/style-generator.ts:568-581`.
