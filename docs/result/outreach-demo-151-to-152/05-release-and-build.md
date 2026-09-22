# 05 — interior-01 1.5.2 release + boost-interior-demo build (2026-09-22)

## 1. release

`tsx platform/cli/template-release.ts interior-01@1` (working tree `templates/interior-01/v1`, version `1.5.2`)

| 항목 | 값 |
|---|---|
| status | `created` |
| releaseId | `interior-01-1.5.2-d87807590d64` |
| releaseHash | `d87807590d64ea7901b226d43526795793805527647313ee4af22f8511577a08` |
| templateSourceHash | `2f675577f95459c38c4399300014a25271363d3ecbfbf88100e095417d5e19c3` |
| files | 63 (+ `release.json`), 전부 read-only (쓰기 가능 파일 0) |
| dir | `data/template-releases/interior-01/interior-01-1.5.2-d87807590d64` |

1.5.1 release 와의 차이 (ia152 R2): Template 파일 5개 변경 (`app/layout.tsx`, `app/page.tsx`, `lib/seo.ts`, `sections/HomeHero.tsx`, `template.ts`) + 1개 추가 (`sections/homeHeroData.ts`). platform runtime / `package.json` / lockfile 은 byte-identical.

### 기존 release 불변

- `git diff HEAD -- data/template-releases` = 변경 없음. 새 것은 1.5.2 디렉터리 하나 (untracked).
- ia152 R1: capture 시점 release 디렉터리 11개 (1.0.0 ×2 … 1.5.1) 전부 존재, 파일 hash 가 `proof/before.json` 과 같음, `verifyRelease` 통과. 1.5.2 는 정확히 1개.
- step4/41/5/6, ia150/151 의 release 불변 검사도 전부 통과.

**OLD_RELEASES_BYTE_IDENTICAL = YES**

## 2. boost-interior-demo build

`tsx platform/cli/site-build.ts boost-interior-demo --release interior-01-1.5.2-d87807590d64`

| 항목 | 값 |
|---|---|
| buildInputId | `18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f` |
| packageHash | `cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202` |
| siteSnapshotHash | `df04f8775a2d28c08ecff1544a28f0c268e0897517ed99501a7f4d6918264e54` |
| releaseHash (parts) | `d87807590d64…` |
| toolchainHash | `22e72379efb13d9ac8fe2cc0b5e7000566df689d540da253428c26ad2d7393d1` |
| mode | public |
| QA | pass, 156 files, 7,390,478 bytes, 15 HTML pages |
| routes | home 1 · portfolio.index 1 · portfolio.detail 8 · portfolio3d 1 · about 1 · contact 1 (portfolio.page pruned: 8 projects) |
| warnings | 없음 |
| previous | `aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171` (1.5.1, cut 직전 current) |

package dir: `data/site-builds/boost-interior-demo/packages/18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f`

rotation 으로 working tree 에서 빠진 package: `6c74d34c…` (1.5.0) — commit `14c49a6` 에 보존. 설명은 `03` §4.

fixture 는 빌드하지 않았다 (pin 불변, package 불변).

## 3. 빌드된 demo 의 SEO (홈)

```
<meta name="robots" content="noindex"/>
<link rel="canonical" href="https://interior-demo.boostweb.co.kr"/>
<meta property="og:title" content="부스트 인테리어"/>
<meta property="og:description" content="생활에 맞춘 설계로 … 설계를 합니다."/>
<meta property="og:url" content="https://interior-demo.boostweb.co.kr"/>
<meta property="og:image" content="https://interior-demo.boostweb.co.kr/assets/ae004e4b853e6c005daa.jpg"/>
<meta property="og:image:width" content="2400"/>  <meta property="og:image:height" content="1350"/>
<meta property="og:image:alt" content="우물천장 간접조명이 켜진 화이트톤 거실 전경"/>
<meta property="og:type" content="website"/>
(+ Next 가 파생한 twitter:card summary_large_image / title / description / image)
```

다른 페이지 13개 전부 canonical = origin + path, OG 동일 규칙, og:image 동일 (ia152 P1). 404 는 canonical/OG 없음, robots noindex (framework 태그 + site 태그, 두 개 동일 값 — ia152 P2 가 정확히 이 쌍을 assert).

알려진 표기 차이 (의도, 결정 수용): 홈 canonical/og:url 은 `https://interior-demo.boostweb.co.kr` (slash 없음), sitemap `<loc>` 는 `https://interior-demo.boostweb.co.kr/`. 같은 URL 이다.
