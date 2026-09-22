# 05 — Template Reuse Proof

> **2026-09-20 재확인:** `step6-proof verify` = `verified: true`, `changed: []` (실행 전·후 2회). 독립 sha256 tree 비교로 template 38 · release 306 · platform(test 제외) 26 · fixture site 135개 파일이 작업 전과 동일함을 다시 확인했다 (`04` §0.3). 새 release 0, 기존 release 7개 불변.

> 질문: 하나의 immutable Template Release가 **Site data / settings / theme / assets / SEO·identity만** 바꿔서
> 실제로 다른 고객 사이트를 만들 수 있는가?
>
> 답: **YES.** `boost-interior-demo`는 `interior-01-1.4.0-9e1ea20da947`을 한 바이트도 바꾸지 않고 만들어졌다.

## 1. Same Template Release

```
Template Release  interior-01-1.4.0-9e1ea20da947
  releaseHash         9e1ea20da9472d3bb003a27ff5f7374c76fa350c5941beb79457441576130961
  templateSourceHash  93d7da0fc06e1583d30af6aa40dd0e95297ab3b7a5e83bd73fea95fd82b8ea83
  toolchainHash       22e72379efb13d9ac8fe2cc0b5e7000566df689d540da253428c26ad2d7393d1
        │
        ├── fixture-large         (Harbor & Pine Studio, en-US, 150 projects)
        ├── fixture-small         (regression fixture)
        ├── fixture-empty         (regression fixture)
        └── boost-interior-demo   ← NEW (부스트 인테리어, ko-KR, 8 projects)
```

## 2. Different Site Instances (현재 package의 build record에서 읽은 값)

| Site | releaseId | siteSnapshotHash | buildInputId | packageHash | HTML pages |
|---|---|---|---|---|---|
| fixture-large | interior-01-1.4.0-9e1ea20da947 | `da09eba813ab1886…` | `d0837ea41ecfb508…` | `31850d292a2142e9…` | 182 |
| fixture-small | interior-01-1.4.0-9e1ea20da947 | `7a08869ac1a16973…` | `9556a277e62a745c…` | `4fac751f9aede280…` | 16 |
| fixture-empty | interior-01-1.4.0-9e1ea20da947 | `67d0bb308d533006…` | `3eaf7f4af8651d07…` | `d3f62c3ceb116cdf…` | 3 |
| **boost-interior-demo** | interior-01-1.4.0-9e1ea20da947 | **`432bc438dc97e158…`** | **`4d3d08f4d35b11e9…`** | **`0830462fb5d5cd96…`** | 12 |

같은 release hash · 같은 templateSourceHash · 같은 toolchainHash, **다른** snapshot · buildInputId · package · 렌더 결과
(테스트 V: 4개 사이트의 home `<main>` sha256이 모두 다름).

## 3. boost-interior-demo가 바꾼 것 / 바꾸지 않은 것

### Changed — Site Instance 입력만

| 범주 | 파일 (`data/sites/boost-interior-demo/`) | 내용 |
|---|---|---|
| Identity | `site.json` | brandName `부스트 인테리어`, legalName(데모용 가상 브랜드 명시), locale `ko-KR`, origin `https://boost-interior-demo.example`, logo |
| Content | `content/projects.json` `categories.json` `reviews.json` `banners.json` `business.json` | 8 프로젝트(Flagship 13컷), 4 공사 유형, 6 후기, 3 hero 슬라이드, 회사 소개·연락처 |
| Settings | `settings.json` | Projects A/B = 같은 collection의 manual selection 2개, B 켬, `areaScale: pyeong`, `priceScale: krw-pyeong` |
| Slots (section copy) | `slots.json` | 모든 섹션 제목·설명·UI 라벨 한국어 (12 섹션, 81 slot) |
| Theme | `theme.json` | Template이 consume하는 13개 token만: warm off-white canvas, charcoal text, restrained orange action, radius 10px, 한글 시스템 폰트 스택 |
| Assets | `assets/registry.json` + 52 files | 로고 + 51 shot seat (현재는 일러스트 stand-in; §03) |
| SEO | identity + `business.summary` | `<html lang>`, title, description, canonical/sitemap origin |
| BuildInputId | — | 위 입력의 해시 → 새 값 |

### Unchanged — 자동 검증으로 증명

| 범주 | 증명 |
|---|---|
| Template Source (`templates/interior-01/v1/**`) | live `templateSourceHash` = baseline = release record = demo build record `93d7da0f…`; raw tree hash 동일 (38 files) — 테스트 **D** |
| Platform Runtime (`platform/{content,settings,theme,assets,slots,site}`) | release source 54개 파일이 release의 frozen 사본과 파일 단위로 동일 (drift `[]`); `platform/`(test 제외) tree hash 동일 — **D** |
| Template Release | release 목록 7개 그대로 (추가·삭제 0), 1.4.0 `verifyRelease` 통과, 7개 release tree 전부 byte-identical — **C** |
| Routing Architecture | route plan은 Template 선언(`template.ts`) → 위 D에 포함. demo는 `home · portfolio.index · portfolio.detail×8`, `portfolio.page`는 8 < 30이라 자동 prune |
| Filter Evaluator (`platform/content/project-filter.ts`) | 위 D에 포함. demo는 기존 scale id(`pyeong`, `krw-pyeong`)를 **선택**만 함 — **N** |
| CTA implementation (`FloatingCta.tsx`, `SiteFooter.tsx`, `app/layout.tsx`) | 위 D에 포함. demo는 label slot + 연락처만 제공 — **O**, 끄면 사라짐 **P** |
| 기존 fixtures | `data/sites/fixture-*`, `data/site-builds/fixture-*` (pointer·history·package 전부) byte-identical — **E**; polish visual smoke 962/962 |
| Legacy pipeline (`src/**`), Supabase | baseline 이후 수정된 파일 0 (`find -newer baseline.json`) |

Baseline(`proof/baseline.json`, 2026-09-19T11:08:42Z)은 Step 6의 site 입력·asset·테스트·보고서가 하나도 없을 때 캡처했다
(Step 6 경로에서 가장 오래된 파일; 그보다 먼저 존재한 것은 캡처 스크립트 자신뿐). 최종 재측정은 `proof/final.json`.

증명의 anchor는 세 겹이다 (독립 리뷰 지적 반영):

| 강도 | anchor | 덮는 범위 |
|---|---|---|
| 1 | release 안의 frozen 파일별 sha256 (release.json은 `0444`, `verifyRelease` 통과) | Template 전체 + release source인 platform 파일 = 54 files |
| 2 | baseline tree hash — baseline 파일 자체의 sha256을 테스트에 고정 (**C0**): 다시 캡처하면 테스트가 실패한다 | release가 덮지 않는 platform 11 files (`build/*`, `cli/*`, `release/release.ts`, `util/hash.ts`, `site/load.ts`, `dev/*`), fixtures, release 디렉터리 |
| 3 | mtime — 1.4.0 release cut(19:38:11 KST) 이후 수정된 Template/Platform 구현 파일 0 (**D2**). 위조 가능하므로 보조 증거 | templates/**, platform/** (test 제외) |

2번이 자기참조적이라는 점은 남는다: hash를 계산하는 `util/hash.ts`·`release/release.ts` 자신은 1번이 덮지 않는다.
독립 리뷰어가 mtime과 release hash 재계산으로 따로 확인했다 (모두 release cut 이전, 02:27 KST가 마지막 수정).

git으로는 이 증명을 할 수 없다 — `platform/`과 `templates/`가 아직 untracked라 diff가 없다.
그래서 (a) release 안에 frozen된 파일 사본과의 파일 단위 비교, (b) 사전 캡처한 tree hash, 두 가지를 anchor로 썼다.
release 자체는 Step 5.2에서 잘린 것이고 그 hash(`9e1ea20da947`)는 이 Step의 입력으로 주어진 값이다.

## 4. Data-only가 실제로 필요했던 일

| 하려던 것 | 쓴 입력 | Template 변경 |
|---|---|---|
| 한국어 사이트 | identity.locale + slots | 없음 |
| 평형 필터 / 평당 공사비 필터 | settings `areaScale` / `priceScale` (기존 id 선택) | 없음 |
| 대표 프로젝트 / 다른 시공 사례 | settings selection 2개 (한 collection) | 없음 |
| 공사 전/후 | `galleryGroups[].items[].before` (data) | 없음 |
| 브랜드 컬러 | theme token | 없음 |
| 한글 줄바꿈 | — (Template이 이미 `word-break: keep-all`) | 없음 |
| "34평 = 공급면적" 표시 | `area.basis: supply` + detail `areaLabel` slot `공급면적` | 없음 |

첫 빌드(`8398272c…`)가 수정 없이 성공했다(9초). 이후 두 번의 rebuild(`eca5cb39…`, `4d3d08f4…`)는 전부 **content 문구 수정**이었다
(320px에서 가운뎃점으로 시작하는 줄, 독립 copy 리뷰의 용어·표기 통일, 푸터의 데모 고지 문구 제거). Template·Platform 수정은 0건.

## 5. 재현성 (테스트 U)

- 같은 release + snapshot + settings + theme + assets → `prepareSiteInput` 두 번 모두 같은 `buildInputId` = current.
- throwaway root에서의 **독립 rebuild**가 같은 `buildInputId`와 같은 `packageHash`를 냈다.
- asset/prompt 생성 스크립트는 clock·random이 없어 재실행해도 byte-identical (재실행 후 `site:build` = `up-to-date`).

## 6. 발견된 Template 경계

data-only로 **막힌 요구는 없었다.** 다만 Site 입력으로 바꿀 수 없는 표현 3가지를 기록한다 (`06-open-items.md`):

1. 평당 공사비 표기 `KRW 2,900,000 / 평` — Template 소유 포맷, 로케일 표기(`평당 290만 원`) 불가.
2. `area.basis`는 화면에 렌더되지 않는다 — demo는 전 프로젝트가 supply라 label slot으로 해결했지만, basis가 섞인 사이트는 표현 수단이 없다.
3. banner CTA의 closed target(project | contact)에 "포트폴리오 목록"이 없다 — intro의 link slot(`/portfolio`)으로 우회.

어느 것도 Template을 몰래 고쳐서 해결하지 않았다.
