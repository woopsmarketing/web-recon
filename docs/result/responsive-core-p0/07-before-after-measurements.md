# 07. BEFORE / AFTER 측정 (연속 반응형 QA)

## 1. 측정 설계

| 라벨 | 코드 | 스펙 (캡처) | 재구성 run | QA 결과 |
|---|---|---|---|---|
| BEFORE2 (참고) | pre-P0 | 옛 스펙 (2026-09-04~14 캡처) | `2026-09-14T10-13…`, `10-14-40-104Z`, `10-15-08-780Z`, `10-15-56-336Z` | `tmp/wrp0/baselines/before2-<host>` (리뷰 수정 전 harness) |
| **CONTROL** (주 기준선) | pre-P0 스냅샷 (`tmp/wrp0/pre-p0-snapshot`) | P0 observer 캡처 (apart `11-17-22-331Z`, linear `02-13-21-225Z`, channel `11-16-18-508Z`, rosee `02-18-01-365Z`) | apart `2026-09-15T03-27-19-103Z`, linear `03-30-21-666Z`, channel `03-31-06-863Z`, rosee `03-32-07-471Z` | `tmp/wrp0/qa/prep0-newspec/<host>` (최종 harness) |
| OWN_PREFIX | P0, 모바일 fallback 버그 포함 | apart `11-17-22-331Z` | `2026-09-15T04-14-02-862Z` | `tmp/wrp0/qa/preview` |
| OWN_MOBFIX | P0 + 모바일 fix | apart `11-17-22-331Z` (coverage 필드 없음) | `2026-09-15T05-15-07-220Z` | `tmp/wrp0/qa/preview2` |
| **AFTER (FINAL3)** | P0 + 모바일 fix (root-cause fix 이전) | 최종 캡처 apart `05-19-26-498Z`, linear `04-54-56-058Z`, channel `04-57-26-336Z` | apart `2026-09-15T05-38-27-729Z`, linear `05-38-29-052Z`, channel `05-38-28-410Z` | `tmp/wrp0/final3/qa-<host>` |

- **대조군(CONTROL)을 둔 이유:** 소스 사이트가 옛 캡처 이후 바뀌었습니다(예: channel `/kr/pricing` 배너 삽입). 그래서 같은 날 캡처한 스펙에 수정 전 코드를 돌려, 생성기 변화의 효과만 분리했습니다.
- **고정 보고 구간:** 390–600 / 600–900 / 900–1200 / 1200–1440 / 1440 / 1441–1920 / 1920–2560. 소스 경계 분할이 JS reflow 구간에서 흔들리므로 interval id가 아니라 이 구간으로 비교합니다. 도구는 `tmp/wrp0/tools/band-summary.py`입니다.
- **지표 정의:**
  - `cls%`: interval 노드 behavior-class 일치율을 구간 겹침 길이로 가중한 값
  - `R11/n`: 샘플당 비교 노드 1개당 R11(x/w 허용오차 초과) 위반 수
  - `hard`: 샘플당 H1–H8 위반 합
  - `H1`: 가로 넘침이 난 샘플 수
  - `tm`: tree-mismatch 샘플 수
- **원표:** `data/bands-<host>.txt`.
- **판정:** 어떤 경로도 interval PASS는 0입니다. 수정 전과 후 모두 연속 QA 기준으로는 FAIL이며, 아래는 개선 폭을 보여주는 값입니다.
- **AFTER의 코드 시점:** FINAL3는 마지막 root-cause fix(페이지 로드 retry, phase-A 분리 bisection, render budget 개선)보다 **이전** 코드입니다. 최종 코드로 다시 빌드·QA하는 것은 사용자 직접 검수로 넘겼습니다(§6).

## 2. Apartmentary (진단 대상) — CONTROL → AFTER(FINAL3)

| route | band | cls% C→A | R11/n C→A | hard C→A | 비고 |
|---|---|---|---|---|---|
| `/` | 390–600 | 83.6 → **91.1** | 0.26 → 0.16 | 0 → 0 | |
| `/` | 600–900 | 84.0 → **91.5** | 0.13 → 0.16 | 0.4 → 0 | tm 8 → 0 (801–899 tree 불일치 해소) |
| `/` | 900–1200 | 31.1 → **42.3** | 1.32 → 1.03 | 38.3 → 31.1 | |
| `/` | 1200–1440 | 15.1 → **42.7** | 1.08 → 0.86 | 24.2 → 25.6 | |
| `/` | 1441–1920 | 7.7 → **44.5** | 1.34 → 0.91 | 6.0 → 9.1 | |
| `/` | 1920–2560 | 4.1 → **45.9** | 1.61 → 0.98 | 6.0 → 9.0 | |
| `/service` | 390–600 | 69.9 → 71.7 | 0.15 → 0.15 | 33 → 33 | |
| `/service` | 600–900 | 69.9 → 71.7 | 0.10 → 0.17 | 18.6 → 33.0 | hard 전부 H8(clone-only visible content, 샘플 390–600과 동일 수준 33). CONTROL은 801–899가 데스크톱 트리로 서빙돼 비교 노드 0이라 H8이 안 잡혀 평균이 낮아 보임 |
| `/service` | 900–1200 | 40.1 → **52.4** | 1.07 → 0.64 | 40.6 → 40.2 | |
| `/service` | 1200–1440 | 22.4 → **51.7** | 0.73 → 0.41 | 29.8 → 35.4 | |
| `/service` | 1441–1920 | 9.4 → **61.9** | 1.04 → 0.32 | 21 → 21 | |
| `/service` | 1920–2560 | 5.5 → **65.3** | 1.35 → 0.41 | 21.7 → 21.7 | |

- **1440 부근 고정 완화:** 수정 전에는 데스크톱 폭이 1440에서 멀어질수록 일치율이 4–31%로 무너졌습니다. 수정 후에는 900–2560 전 구간이 42–65%로 유지됩니다. 즉 1440 주변에 얼어붙어 있던 폭 계열 영역이 상당 부분 풀렸습니다. 다만 아직 절반 가까이는 불일치입니다.
- **증거 기반 switch:** 900(authored + observed)으로 서빙합니다. 수정 전 801 서빙에서는 801–899에서 소스는 모바일, 클론은 데스크톱이었고 비교 가능한 노드가 0이었습니다(tree-mismatch). 수정 후에는 이 문제가 해소됐습니다.

### 모바일 연속 구간 390→900 (`/`, 샘플별)
- **R11 위반:** 수정 전 57/213 노드(430–800 전 샘플) → 수정 후 33–39/213.
- **서빙 트리:** 수정 전에는 801부터 데스크톱 트리였고, 수정 후에는 899까지 모바일 트리입니다.
- **남은 결함 — 높이:** 페이지 높이 비율(클론/소스)은 두 코드 모두 390에서 0.948이고, 900 쪽으로 갈수록 떨어집니다. 수정 전은 800에서 0.836, 수정 후는 899에서 0.817입니다. 폭은 연속적으로 따라가지만 텍스트 줄바꿈과 높이 계열은 여전히 390 캡처 값에 가깝게 고정돼 있습니다. P0 범위(폭 계열) 밖이며 P1 항목입니다.

### 경로 문제 증거 (중간 run)
- **OWN_PREFIX:**
  - **증상:** 모바일이 11%로 붕괴했습니다.
  - **원인:** 계획이 제안된 노드는 fallback을 건너뛰었습니다. 그 계획이 탈락하면 규칙이 없어 390px로 고정됐습니다.
  - **조치:** 수정 완료.
- **OWN_MOBFIX:**
  - **증상:** 데스크톱 `/`가 5%로 붕괴했습니다.
  - **원인:** 기계 부하로 1200px 검증 렌더 1회가 30초 timeout에 걸렸고, 그 한 번의 실패로 p000001/desktop 샘플 규칙 312개가 전부 탈락했습니다.
  - **조치:** 로드 retry ×3 추가(`tmp/wrp0/handoffs/RECI2-rootcause.md`).

## 3. Canary — CONTROL → AFTER(FINAL3)

### linear.app
| route | 390–600 | 600–900 | 900–1200 | 1200–1440 | 1440 | 1441–1920 |
|---|---|---|---|---|---|---|
| `/pricing` (served 1025, per-route) | 67.7→**90.9** | 33.5→**51.0** | 25.4→**45.4** | 54.4→**78.3** | 99.1→99.5 | 96.8→97.3 |
| `/` (served 641) | 35.9→**54.6** | 31.6→43.3 | 45.2→45.2 | 50.2→49.5 | 84.2→84.2 | 93.0→93.0 |

**악화:** `/` 600–900에서 H1 가로 넘침 샘플이 4에서 22로 늘었고, hard는 18.8에서 45.4가 됐습니다.
- **원인:** switch가 801(제품 정책)에서 641(authored)로 바뀌었습니다. 그래서 641–900 구간에 데스크톱 트리가 서빙되는데, 그 트리에는 폭 계열 소유권 밖의 frozen px 노드가 남아 있습니다. 예로 n000575는 두 빌드 모두 1250px입니다.
- **판단:** switch 자체는 소스의 DOM family 변화(1136개 요소)와 authored @media가 함께 지지합니다. 넘침은 데스크톱 트리의 남은 frozen 폭 문제입니다.

### channel.io
| route | 390–600 | 600–900 | 900–1200 | 1200–1440 | 1441–1920 | 1920–2560 |
|---|---|---|---|---|---|---|
| `/kr` (served 992) | 71.8→72.3 | 54.2→**72.3** | 34.3→**50.9** | 71.6→**81.0** | 90.0→**96.4** | 92.7→**99.5** |
| `/kr/pricing` (served 992) | 66.4→66.8 | 41.6→42.0 | 21.8→27.3 | 42.2→**36.7** | 48.2→**35.9** | 61.3→63.1 |

**악화:** `/kr/pricing`에서 1200–1920 일치율이 떨어졌고, 900–1200 hard가 31.1에서 76.4로 늘었습니다.
- **원인 1 — phase-A 동반 탈락:** 조상 규칙 하나의 1199px 오류 때문에 하위 규칙들이 함께 탈락했습니다.
- **원인 2 — render budget:** desktop 그룹 988개 중 872개가 판정 없이 예산 소진으로 거부됐습니다.
- **조치:** 두 원인 모두 수정했습니다. 오프라인 재현에서 pricing desktop 채택 그룹이 45개에서 728개로 늘었습니다. **이 수정의 실사이트 QA 효과는 아직 측정하지 않았습니다.**

### beomeo.roseeskin.com
- **측정한 것:** CONTROL(`tmp/wrp0/qa/prep0-newspec/beomeo.roseeskin.com`)만 있습니다.
- **AFTER가 없는 이유:** 1차 최종 캡처에서 홈 페이지 NAV-ERR(부하로 goto 45초 초과)가 났고, 재캡처(`05-22-27-145Z`) 뒤 재구성은 사용자 결정으로 중단했습니다.
- **예상 경로:** rosee는 `ruleIndexCapHit=true`라 all-initial 계획이 `coverage-incomplete`로 거부되는 경로를 탑니다.

## 4. 390 / 1440 고정 폭 회귀

**CONTROL → AFTER, 샘플 폭 390 및 1440(없으면 1430)**

| route | 390 R11/n, hard | 1440 R11/n, hard |
|---|---|---|
| apart `/` | 0.11→0.11, 0→0 | (1430) 0.11→0.06, 10→15 |
| apart `/service` | 0→0, 33→33 | 0→0, 21→21 |
| linear `/pricing` | 0→0, 1→1 | 0→0, 0→0 |
| linear `/` | 0→0, 0→0 | 0→0, 1→1 |
| channel `/kr/pricing` | 0.01→0.01, 1→1 | (1430) 0.05→0.07, 5→4 |
| channel `/kr` | 0.01→0, 2→0 | (1430) 0.01→0, 4→3 |

390과 1440의 기하 오차(R11)는 악화되지 않았습니다. 예외는 channel pricing 1430의 +0.02와 apart `/` 1430의 hard +5이며, 둘 다 경미합니다.

## 5. 크기 영향 (Apartmentary)

| 항목 | 이전 | 이후 | 변화 |
|---|---|---|---|
| `generated-styles.css` (CONTROL `03-27-19-103Z` → AFTER `05-38-27-729Z`) | 4,264,673 B | 4,976,048 B | +711,375 B (+16.7%) |
| 그중 ownership 순증 (manifest `cssBytesDelta`) | — | +175,501 B | 제거된 recovered 265,168 / split 규칙 +4,722개 / marker +223,563 B |
| 스타일 token 수 | — | — | **0** (구조상 불변: split은 token을 나누지 않고 소유 속성만 `:where()` 규칙으로 옮김) |
| `reconstruction-data` (runtime JSON) | 844 KB | 1,060 KB | +25.6% (marker class) |
| observer `dom.json` 합계 (7 페이지: `04-22-26-242Z` → `05-10-38-532Z`) | 7.51 MB | 15.46 MB | +106% (cascade metadata, inline style) |
| SiteSpec `pages/*.json` (`04-58-45-517Z` → `05-19-26-498Z`) | 16.3 MB | 32.9 MB | +101% |
| `style-catalog.json` | 6.35 MB | 6.57 MB | +3.4% |

- **CSS 증가분의 나머지:** ownership 외의 약 +536 KB는 switch가 801에서 900으로 바뀌며 달라진 band/recovered 규칙과 interval 검증 결과에서 옵니다.
- **Recon Template parity 영향:** `smoke-recon-template`은 전체 회귀에 포함돼 있습니다. 결과는 종합보고서의 회귀 표를 봅니다. 실제 앱 템플릿 컴파일은 사용자 검수 범위입니다.

## 6. 사용자 직접 검수용 명령

```bash
# 최종 코드로 재구성 (빌드 포함). 스펙은 최종 캡처.
npx tsx src/cli-reconstruct.ts data/apartmentary.com/site-specs/2026-09-15T05-19-26-498Z/site-spec.json
npx tsx src/cli-reconstruct.ts data/linear.app/site-specs/2026-09-15T04-54-56-058Z/site-spec.json
npx tsx src/cli-reconstruct.ts data/channel.io/site-specs/2026-09-15T04-57-26-336Z/site-spec.json
npx tsx src/cli-reconstruct.ts data/beomeo.roseeskin.com/site-specs/2026-09-15T05-22-27-145Z/site-spec.json
# 로그의 "wrote data/<host>/reconstructions/<run>" 경로를 사용 (newest 자동 선택 금지)

# 연속 QA (선택)
pnpm qa:continuous data/<host>/reconstructions/<run> --site-spec <위 스펙> --routes /,/service --out tmp/my-qa/<host>
# 대조군과 구간 비교
python3 tmp/wrp0/tools/band-summary.py CONTROL=tmp/wrp0/qa/prep0-newspec/<host> MINE=tmp/my-qa/<host>

# 대조군 앱 (수정 전 코드, 같은 날 캡처) — 나란히 띄워 비교
#   data/apartmentary.com/reconstructions/2026-09-15T03-27-19-103Z/app  (cd app && npx next start -p 3101)
```
