# 03 — Template Release pinning: "4개 site 모두 1.5.2 로 re-pin 해야 한다"는 요구인가? (2026-09-22)

**결론: architecture 요구가 아니라 test 가정이었다.** platform 은 처음부터 site 별 exact pin 을 지원한다. 테스트를 release-pin aware 하게 고쳤고, **boost-interior-demo 만 1.5.2 로 올렸다. fixture 3개는 1.5.1 pin 과 1.5.1 package 를 그대로 유지한다.**

## 1. platform 코드 (바꾸지 않음)

| 사실 | 근거 |
|---|---|
| build 는 working tree Template 이 아니라 **site 가 pin 한 release 의 frozen files** 를 임시 workspace 에 복사해 빌드한다 | `platform/build/site-build.ts` `buildSite` → `materializeRelease` (`platform/release/release.ts`) |
| pin(releaseId + releaseHash + version)이 저장된 release 와 다르면 거부, release 파일 hash 재검증 | `site-build.ts` `prepareSiteInput`, `verifyRelease` |
| `--release` 는 pin 과 같아야 하는 확인용일 뿐, 자동 upgrade 없음 | `site-build.ts` |
| pin schema: "Exact immutable Template Release pin. Never 'latest in major'." | `platform/site/instance.ts` `TemplateReleasePinSchema` |
| release 생성은 `data/template-releases/` 에만 쓴다 (site data / build 불변) | `platform/cli/template-release.ts` → `createRelease` |
| site 사이 pin 을 비교하거나 "모두 latest" 를 요구하는 platform 코드 | **없음** |

그래서 `site A → 1.5.1`, `site B → 1.5.2` 는 원래 가능한 상태다.

## 2. "모두 latest" 를 가정한 테스트 — 그리고 고친 방법

1.5.2 release 를 만들고 demo 만 re-pin 한 직후 `test:platform` 은 **4 suite 8 check** 가 실패했다. `step6` 과 `ia152` 는 미리 고쳐 두었기 때문에 통과했다. 모두 같은 가정이었다: "fixture pin == working-tree Template version" 또는 "모든 site pin == demo pin".

| 위치 | 원래 가정 | 바꾼 기준 (약화 없음) |
|---|---|---|
| `slice1` I (`createSiteContext` release 불일치 3종), I (unknown category), preview drafts | working-tree `template` 코드를 fixture snapshot + **fixture pin(1.5.1)** 으로 context 생성 → `release 1.5.1 does not describe template code 1.5.2` | `livePin` = working-tree Template version 의 release (정확히 1개, 검증). unit check 는 snapshot 에 이 pin 을 준다 — 실제 build 가 만드는 조합 (pin 된 release 의 코드) 과 같다. 기대하는 error 는 그대로 |
| `slice1` "no drift since release" | fixture pin == working tree | **working-tree version 의 release** == working tree. Template 을 고치고 release 를 안 만들면 여전히 실패 |
| `slice1` release 재실행 idempotent | throwaway release == fixture pin | == `livePin` |
| `step4` A, `step41` release, `step5` B | fixture pin version `===` `template.version` | `versionAtLeast(template.version, pin.version)`: pin 은 Template 보다 **뒤처질 수 있지만 앞설 수는 없다**. "fixture 3개가 같은 release" 와 "그 release 로 빌드됨", 검증은 그대로 |
| `step6` B | 모든 fixture pin == demo pin | demo 포함 각 site pin 이 **자기** verified release (id/hash 일치, ≥ 1.4.1) |
| `step6` E | fixture build record == demo pin | == **그 fixture 의** pin |
| `step6` V | 4 site 가 한 release 공유 | 각 site package = 자기 pin 의 releaseId + templateSourceHash, **그리고 ≥ 2 site 가 한 release 를 공유** (Step 6 의 질문 "한 release → 서로 다른 site" 는 fixture 3개로 계속 증명), buildInputId / snapshot / home 모두 다름 |
| `ia152` R3 | 4 site 가 demo 와 같은 pin, 모두 rollback rotation | demo: ≥ 1.5.2, rollback = cut 전 package. fixture: 자기 pin 으로 빌드됨; pin 을 안 바꾼 fixture 는 current = cut 전 package (pointer 불변, rotation 없음). cut 시점에는 **fixture 3개 모두 1.5.1 유지** 를 명시적으로 assert |
| `ia152` D2 | fixture 는 site.json(pin)만 바뀜 | pin 을 안 바꾼 fixture 는 **전부 byte-identical** |
| `ia152` F1 | fixture package 에 1.5.2 출력 (홈 canonical, OG) | fixture package 를 **자기 pin 의 version 기준**으로 검사 (1.5.1 = 홈 canonical/OG 없음, site robots meta 없음) |
| `ia152` F2 (신규) | — | 1.5.2 기본 동작(indexable, 홈 canonical, OG = title/description/canonical, SVG hero → og:image 없음, body/robots/sitemap = 1.5.1 package)을 **fixture-small 의 throwaway-root 사본**을 1.5.2 로 re-pin 해 빌드해서 증명. `data/sites` / `data/site-builds` 는 건드리지 않음 (step41 과 같은 패턴) |

이전 세션의 `ia152` 는 fixture 까지 1.5.2 로 re-pin 해야 통과하게 쓰여 있었다 (header: "Run AFTER the 1.5.2 builds of the four sites"). 그 방식은 버렸다.

## 3. 결과

| site | pin | current package |
|---|---|---|
| boost-interior-demo | `interior-01-1.5.2-d87807590d64` | `18c0a5ef…` (신규) · previous = `aa71b829…` (1.5.1) |
| fixture-large | `interior-01-1.5.1-6bbdd07eb9bf` (불변) | `986ca47e…` (불변) |
| fixture-small | 1.5.1 (불변) | `36c3a04c…` (불변) |
| fixture-empty | 1.5.1 (불변) | `1deb02ec…` (불변) |

`git status` 로 확인: `data/sites/fixture-*`, `data/site-builds/fixture-*` 변경 0.

**MIXED_TEMPLATE_RELEASE_PINS_SUPPORTED = YES** · **OTHER_SITES_REPINNED = NO**

## 4. build rotation (정책은 바꾸지 않음)

`buildSite` 는 성공할 때 `current` 와 `previous` 두 package 만 남기고 나머지 `packages/*` 를 지운다. demo 를 1.5.2 로 빌드하면서:

- current = `18c0a5ef…` (1.5.2), previous = `aa71b829…` (cut 직전 current, 1.5.1)
- 그 전 previous `6c74d34c…` (1.5.0 package) 는 working tree 에서 지워졌다 — **정상적인 current/previous 동작**. 이 package 는 commit `14c49a6` 에 그대로 있다 (`git show 14c49a6:data/site-builds/boost-interior-demo/packages/6c74d34c…/build-record.json`).
- 이 package 를 필요로 하는 테스트는 없다. `ia151` P1 의 1.5.0 비교는 demo pin 이 1.5.1 일 때만 도는 point-in-time 검사라 1.5.2 pin 에서는 건너뛴다 (이전부터 그렇게 쓰여 있음). 1.5.2 테스트가 쓰는 rollback 비교 대상은 `aa71b829…` 이고 남아 있다.
- fixture 는 빌드하지 않았으므로 fixture package 는 하나도 지워지지 않았다.

build-history 보존 정책은 이번 범위가 아니다 (사람 결정 H7).
