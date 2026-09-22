# 06 — First-party Integration Producer: 독립 구현 리뷰 (fresh context, read-only)

- 날짜: 2026-09-22
- 리뷰 대상: `track-b/static-deployment-foundation` 의 **uncommitted** 변경 전체
  (`platform/integration/{contract,config,emit,validate}.ts`, `platform/build/declared-routes.ts`,
  `platform/test/integration.test.ts`, `data/sites/boost-interior-demo/integration.json`,
  `platform/build/{site-build,build-input}.ts`, `package.json`,
  `docs/reports/integration/{02,03,06}`, `data/site-builds/boost-interior-demo/**`)
- 규범 기준: `docs/reports/integration/02-integration-contract-v0-candidate.md` (FROZEN 2026-09-22),
  파생본 `03-…json`, 계획 `06-implementation-phase-plan.md`
- 리뷰어는 구현자와 분리된 fresh context이며, 원하는 결론을 전달받지 않았다. 아래 "verified" 항목은
  프로젝트 자체 테스트의 통과 여부가 아니라 리뷰어가 **직접 재현·재계산**한 것이다.

## 심각도 집계

| 심각도 | 건수 |
|---|---|
| **BLOCKER** | **0** |
| **MAJOR** | **2** |
| MINOR | 7 |
| NOTE | 8 |

BLOCKER 는 없다. 요구사항 (a)~(i) 중 **(b) OFF/ON 빌드 식별자 충돌**, **(c) Template Release 불변**,
**(h) live 패키지 무변경**, **(i) golden = live + 2 파일** 은 리뷰어가 독립적으로 재계산하여 모두 성립함을
확인했다(아래 "검증된 것" 참조).

---

## MAJOR

### MAJOR-1 — emitter 코드 자체가 build input 이 아니다: 같은 `buildInputId` 아래 서로 다른 바이트가 가능하다

**위치**
- `platform/build/build-input.ts:23-35` (`computeBuildInputId`)
- `platform/build/site-build.ts:192-200` (`integrationInputHash` 계산)
- `platform/integration/contract.ts:19-24` (`PRODUCER_VERSION = 1`)

```ts
// platform/build/site-build.ts:193-199
integrationInputHash: hashJson({
  producer: PRODUCER_VERSION,
  contract: { core: CORE_SCHEMA_VERSION, portfolio: PORTFOLIO_SCHEMA_VERSION },
  config: integration.config,
}),
```

패키지의 `site/_integration/*.json` 바이트를 결정하는 입력은 넷이다.

| 입력 | `buildInputId` 에 들어가는가 |
|---|---|
| site snapshot | O (`siteSnapshotHash`) |
| Release 의 declared routes + route plan | O (`releaseHash` 경유) |
| 계약 버전 / 사이트 opt-in 문서 | O (`integrationInputHash`) |
| **emitter/validator 코드 (`platform/integration/**`)** | **X — 사람이 손으로 올리는 `PRODUCER_VERSION` 뿐** |

`platform/integration/contract.ts:19-23` 의 주석은 "Bump it whenever the projection, ordering,
serialisation or validation changes" 라고 **규율**을 적어 두었을 뿐, 기계적 강제가 없다.
`06` A5 는 이 항목을 이렇게 약속했다:

> | A5 | build identity | emitter/계약 버전을 `BuildInputParts` 에 추가 → **emitter 가 바뀌면 `buildInputId` 가 바뀐다**("up-to-date" 오판 방지) |

구현은 "계약 버전이 바뀌면"만 만족한다. "emitter 가 바뀌면"은 만족하지 않는다.

**구체적 실패 시나리오**
1. `platform/integration/emit.ts` 의 `projectPortfolio()` 를 수정한다(예: `facets` key 순서 변경,
   `scope` 의 dedupe 기준 변경, `listingUrl` 조건 완화). `PRODUCER_VERSION` 을 올리는 것을 잊는다.
2. 사이트 데이터·Release·toolchain 은 그대로 둔 채 `pnpm site:build` 를 다시 돌린다.
3. `prepareSiteInput` 이 계산한 `buildInputId` 는 이전과 **같다**. `platform/build/site-build.ts:349-352`
   ```ts
   if (current?.buildInputId === buildInputId && currentExists && !opts.force) {
     log(`[${opts.siteId}] up-to-date (same buildInputId as current successful package)`);
     return { status: "up-to-date", buildInputId, packageDir: current.packageDir };
   }
   ```
   → 빌드가 **일어나지 않는다.** 저장소의 emitter 는 새 것인데 패키지에 실린 문서는 옛 것이고,
   `build-record.json.integration.producerVersion` 은 여전히 `1` 이라 구분도 되지 않는다.
4. `--force` 로 돌리면 더 나쁘다: `site-build.ts:497-502` 이 **같은 `buildInputId` 디렉터리를 교체**한다.
   즉 `packages/<buildInputId>/` 라는 동일한 build identity 아래 서로 다른 `site/` 바이트가 연달아
   존재하게 된다. `history.jsonl` 에도 같은 id 가 두 줄 남아 어느 쪽이 배포된 것인지 알 수 없다.

이것은 요구사항 (b)가 BLOCKER 로 규정한 "서로 다른 바이트가 같은 build identity 를 공유"의 동일한 계열이다.
다만 OFF/ON 축에서는 성립하지 않고(검증 완료) emitter 버전 축에서만 성립하므로 MAJOR 로 둔다.
또한 이 파일들은 **빌더가 `site/` 안에 직접 바이트를 쓰는 최초의 코드**다 — 기존에는 `site/` 전체가
Release 코드의 산출물이었기 때문에 "빌더는 해싱하지 않는다"는 기존 관행이 성립했다.

**수정 방향(제안)**: `collectReleaseSources` 와 같은 방식으로 `platform/integration/**`(+ 필요하면
`platform/build/declared-routes.ts`)의 (path, sha256) 목록을 `integrationInputHash` 에 포함한다.
그러면 `PRODUCER_VERSION` 은 의미 신호로만 남고 정확성은 기계가 보장한다.

---

### MAJOR-2 — 계약 표류: producer 가 `CONFIRMED OFF (resource)` manifest 를 **절대** 낼 수 없고, validator 가 계약상 합법인 `resources: {}` 를 거부한다

**위치**
- `platform/integration/emit.ts:129-141` (`portfolioRoutes`)
- `platform/integration/validate.ts:192` (`scanValues(e.manifest, "manifest", errors, "")`)
- `platform/integration/validate.ts:136-138` (빈 객체 판정)

`02` §4 는 두 규칙을 **구분**한다.

> - `P: MUST` 사이트가 record 마다 하나의 공개 상세 페이지를 제공하지 않으면 이 resource 를 **제공하지 않는다**(manifest 의 `resources` 에 넣지 않는다).
> - `P: MUST` 통합을 켠 사이트의 공개 빌드에서 emit 이 불가능하면(https origin 없음, §16 HT7 위반, **상세 페이지 모호**) 빌드가 실패한다.

`03` 도 같다 — `portfolio.producerRules[1]`:
`"MUST NOT offer the resource (omit it from manifest.resources) if the site does not provide exactly one public detail page per record"`,
그리고 `core.manifest.fields.resources`: `"emptyAllowed": true`. `02` §5 원문도 "`resources` … **`{}` 허용**".
소비자 쪽에는 이에 대응하는 상태가 이미 정의되어 있다 — `02` §3.2
`200 + 유효한 manifest, resources 에 그 kind 없음` → **CONFIRMED OFF (그 resource)** → "보유 데이터를 **즉시 버린다**".

구현은 두 경우를 하나로 합쳐 **항상 빌드를 실패**시킨다.

```ts
// platform/integration/emit.ts:130-135
const items = declared.filter((r): r is … => "item" in r && r.item.collection === "projects");
if (items.length !== 1) {
  throw new IntegrationError(
    `portfolio requires exactly one public detail page per record, but the Template declares ${items.length} item routes over "projects"`,
  );
}
```

`items.length === 0`(상세 페이지가 아예 없음)은 §4 의 첫 번째 규칙 — "resource 를 제공하지 않는다" —
에 해당하지 "상세 페이지 모호"가 아니다. `items.length >= 2` 만 "모호"다.

게다가 올바른 동작(빈 `resources`)을 내려 해도 **producer 자신의 validator 가 막는다.** 리뷰어가 직접
`validateIntegration` 에 `resources: {}` manifest 를 넣어 확인한 결과:

```
[
 "manifest.resources: empty object",
 "manifest.resources has no \"portfolio\" entry",
 …
]
```

`scanValues` 는 빈 객체를 무조건 오류로 본다(`validate.ts:136-138`), 그런데 `resources: {}` 는 계약이
명시적으로 허용한 유일한 빈 객체다.

**구체적 실패 시나리오**
사이트 A 가 통합을 켜고, portfolio **목록 페이지는 있으나 사례별 상세 페이지가 없는** Template major
(또는 `item` route 를 뺀 미래의 1.6.x)에 pin 되어 있다.
- 기대(계약): 빌드 성공 → `/_integration/manifest.json` = `{… "resources": {}}` 200 →
  consumer 가 CONFIRMED_OFF_RESOURCE 로 읽고 그 사이트의 portfolio 데이터를 **즉시** 폐기.
- 실제(구현): `site:build` 가 `integration (site opted in, public build): portfolio requires exactly one
  public detail page per record, but the Template declares 0 item routes over "projects"` 로 **하드 실패**.
  사이트 A 는 통합과 무관한 페이지까지 포함해 **아예 빌드·배포가 불가능**해진다. 운영자가 급히
  `integration.json` 을 지워 OFF 로 돌리면 manifest 가 404 가 되고, consumer 는 §3.2 에 따라 2주기 뒤
  "통합 전체를 껐다"로 읽는다 — 계약이 의도한 "그 resource 만 껐다"와 의미가 다르다.

fail-closed 라 잘못된 **데이터**가 나가지는 않지만, 규범 MUST 를 어기고 계약이 정의한 상태 하나를
producer 가 영구히 도달 불가능하게 만든다. 최소한 `06` A4 에 "0개는 build failure 로 좁힌다"는
의도적 이탈로 기록되어야 하는데, `06` A4 는 그냥 "item route 가 정확히 1개가 아님 → 빌드 실패"로만
적혀 있고 `02` §4 와의 차이를 인정하지 않는다.

---

## MINOR

### MINOR-1 — `publishedAt` 만 조건 없이 대입한다 (잠재 MD1 위반 + 오해를 부르는 실패 메시지)

`platform/integration/emit.ts:177-184`

```ts
const rec: PortfolioRecord = { id: p.id, title: p.title, detailUrl };
rec.publishedAt = p.publishedAt;                                  // ← 무조건
if (p.location !== undefined) rec.location = p.location;          // ← 나머지는 전부 가드
if (p.area) { … }
if (p.pricePerArea) { … }
```

지금은 `platform/content/schema.ts:148` 의 `publishedAt: IsoInstantSchema` 가 필수라서 실제 문제가 없다.
`publishedAt` 이 optional 이 되는 순간(`02` §7.3 은 `MAY` 다) key 가 값 `undefined` 로 생성되고,
`JSON.stringify` 는 그것을 떨어뜨려 **직렬화 결과는 오히려 올바른데**, `validate.ts:123` 의
`scanValues` 가 `Object.keys` 로 그 key 를 보고
`portfolio.records[n].publishedAt: null is never emitted (MD1)` 을 올려 **빌드를 실패**시킨다.
원인과 메시지가 어긋난다. 한 줄 가드(`if (p.publishedAt !== undefined)`)로 나머지 필드와 통일할 것.

### MINOR-2 — 테스트에 공허한 assertion (`|| true`)

`platform/test/integration.test.ts:368`

```ts
assert(!isRootRelativePath(u) || u === "/portfolio/x y" || true, "shape");
```

`|| true` 때문에 항상 참이다. 같은 성질은 바로 아래 `:371`
(`eq([...].map(isRootRelativePath), Array(10).fill(false), "invalid shapes")`)에서 제대로 검증되므로
커버리지 손실은 없다. 죽은 줄이니 삭제할 것.

### MINOR-3 — `declared-routes` 출력 파싱에 가드가 없다

`platform/build/site-build.ts:402`

```ts
const declaredParsed = DeclaredRoutesSchema.safeParse(JSON.parse(declaredOut.stdout.trim().split("\n").pop()!));
```

stdout 이 비면 `"".split("\n").pop()` → `""` → `JSON.parse("")` 가 **`SyntaxError: Unexpected end of
JSON input`** 을 던진다. 이 예외는 `:406-409` 의 `catch (error) { if (error instanceof IntegrationError) … }`
바깥에서 발생하므로 사이트 id·integration 맥락이 전혀 붙지 않은 채 그대로 올라간다.
(선행 preflight 파싱 `:377` 도 같은 패턴이라 신규 회귀는 아니지만, 새 코드가 같은 결함을 복제했다.)

### MINOR-4 — `DeclaredRoutesSchema` 가 preflight 리더보다 훨씬 엄격하다 (미래 Release 와 충돌 가능)

`platform/integration/emit.ts:99-105` — union 3지 모두 `.strict()`, `list.collection`/`item.collection`
은 `z.literal("projects")`, `list.page` 는 `z.enum(["first","rest"])`.
반면 같은 빌더의 `normalizePreflight` (`platform/build/site-build.ts:234-246`)는 주석에 이렇게 적혀 있다:

> The builder is not part of any release, so it must accept every shape a still-buildable release prints

미래 Release 가 route 객체에 필드를 하나 추가하거나(`{key, path, item, nav:…}`), 새 collection 이나
세 번째 `page` 종류를 도입하면, **opt-in 한 사이트의 빌드만** `integration: the release's declared routes
have an unexpected shape` 로 실패한다(OFF 사이트는 영향 없음). fail-closed 이므로 데이터 오염은 없으나,
같은 Release 를 읽는 두 리더의 관용도가 정반대다.

### MINOR-5 — INV-4 를 이름으로 검증하는 테스트가 없다

`02` §22 INV-4 = "document 의 record id 집합 == 그 snapshot 에서 공개 상태인 record 의 id 집합.
초안·예약·preview 전용 record 는 없다".

`platform/test/integration.test.ts:354` 의
`eq(e.portfolio.recordCount, inp.snapshot.content.projects.length, …)` 는 **이미 필터링된** snapshot 과
비교하므로, 가시성 필터가 틀려도 통과한다. draft/예약 record 의 id 가 문서에 없다고 직접 단언하는
assertion 은 한 줄도 없다.
- 완화 1: emitter 는 `snapshot.content.projects` 만 보므로 구조적으로 성립한다(`emit.ts:172`).
- 완화 2: `fixture-large` 는 176건 중 published 174 · draft 2 이고 그중 1건은 `at` 기준 예약이라
  실제로 173건만 실린다 — 성질은 **실행되지만 단언되지 않는다**.
- `06` A7 은 "합성 edge fixture(… draft·예약 포함 …)" 를 명시적으로 요구했다.

### MINOR-6 — `06` 이 존재하지 않는 결과 문서를 가리킨다

`docs/reports/integration/06-implementation-phase-plan.md:5`
> 결과와 실제 코드 위치는 `docs/result/first-party-integration-producer/00-summary.md`.

실제 디렉터리에는 `01-contract-freeze.md`, `02-producer-design.md`, `03-golden-build.md`, `proof/` 만 있고
`00-summary.md` 는 없다. 또 같은 줄의 "**Phase A 구현 완료**" 는 A6(publish 단계 origin 대조)과
A7(consumer 와 공유하는 golden **파일**)이 이 변경에 포함되지 않았다는 점과 맞지 않는다
(A6 는 별건으로 선행 구현되어 있고 — MINOR-7 —, A7 은 테스트 상수로만 존재한다).

### MINOR-7 — publish 단계가 **manifest 자신의 origin** 은 대조하지 않는다 (기본값은 경고)

`platform/publish/publish.ts:265-271`

```ts
const bakedOrigin = robots ? /^Sitemap:\s*(https?:\/\/[^/\s]+)\//im.exec(await readFile(robots.abs, "utf8"))?.[1] : undefined;
if (bakedOrigin && bakedOrigin !== `https://${hostname}`) {
  const message = `package was built for ${bakedOrigin} (canonical, sitemap and robots URLs), not https://${hostname}`;
  if (opts.requireOriginMatch) throw new PublishError(`${message}; set the site's publicOrigin, rebuild, and publish that package`);
```

origin 은 `robots.txt` 의 `Sitemap:` 줄에서만 추출되고, `requireOriginMatch` 가 아닐 때는 **경고**다.
이제 패키지에는 origin 이 구운 곳이 하나 더 있다 — `_integration/manifest.json` 의 `site.publicOrigin`.
이 값이 서빙 host 와 다르면 결과가 sitemap 오타보다 나쁘다: `02` §5 에 따라 consumer 는 manifest 를
**거부(TRANSIENT)** 하고, 404 가 아니므로 CONFIRMED OFF 로도 가지 못한 채 72시간 last-good 을 붙든 뒤
조용히 그 사이트 검색을 중단한다. 즉 "켰는데 영원히 ON 이 안 되는" 상태가 경고 한 줄로 지나간다.
manifest 의 origin 자체를 대조 대상에 추가하거나, 통합 문서가 있는 패키지에는
`requireOriginMatch` 를 강제하는 편이 안전하다.
(데모 경로에서는 두 origin 이 같은 snapshot 에서 나오므로 실제 불일치는 없다 — 테스트 R2 가
`plan.bakedOrigin === demoEmission.manifest.site.publicOrigin` 을 확인한다.)

---

## NOTE

- **NOTE-1** `platform/build/site-build.ts:51` 주석 "build record only — **never inside the package** or
  the documents" 는 엄밀히는 틀렸다. `IntegrationBuildSummary` 는 `build-record.json` 에 쓰이고 그 파일은
  패키지 **디렉터리** 안(`packages/<id>/build-record.json`)에 있다. 다만 publish 는 `packageDir/site` 만
  업로드하므로(`platform/publish/publish.ts:190-199`) 서빙되는 패키지에는 build 식별자가 들어가지 않는다
  — SE2 는 지켜진다. 문구만 고치면 된다("never inside `site/`").
- **NOTE-2** `platform/integration/validate.ts:59,71` 이 manifest 의 **resource kind** key 에 facet key
  정규식(`FACET_KEY_RE = ^[a-z][a-zA-Z0-9]{0,31}$`, `02` §11.1 VO4)을 적용한다. `02` §5/§7.1 은 kind 의
  형식을 정하지 않는다. 지금은 `"portfolio"` 가 통과하므로 무해하지만, 미래 kind `case-studies` 같은
  하이픈 이름은 producer 자신이 거부한다.
- **NOTE-3** 길이 상한(`TITLE_MAX` 120, `LOCATION_MAX` 80, `FACET_ID_MAX` 64, `FACET_LABEL_MAX` 40)은
  zod `.max()` = **UTF-16 code unit** 기준인데 `02` §7 은 "자(characters)"라고 쓴다. content schema 의
  `ShortText` 도 같은 단위라 producer 와 gate 는 서로 일치하므로 실무 영향은 astral 문자에 한정된다.
- **NOTE-4** `platform/integration/contract.ts:44` `FORBIDDEN_CHAR_RE` 는 `new RegExp(…, "u")` 이고
  `g` 플래그가 **없다** — 올바르다(`g` 였다면 반복 `.test()` 가 `lastIndex` 때문에 번갈아 참/거짓이 되어
  HT7 게이트가 record 의 절반을 놓쳤을 것이다). 문자 집합은 `02` §16 HT7 과 정확히 일치한다.
- **NOTE-5** `02` §20.1 의 "「`site.publicOrigin` = 실제 서빙 origin」… **지금은 배포 단계가 host 를
  대조하지 않는다**" 는 코드보다 뒤처졌다. `publish.ts:267-271` 은 대조한다(경고, `requireOriginMatch`
  면 오류). 문서가 코드를 과소평가하는 방향이므로 안전하지만 §20.1 "현재 상태" 열은 갱신 대상이다.
- **NOTE-6** runtime Worker 에 CORS 헤더가 전혀 없다(`workers/recon-runtime/src/index.ts:86-101` 의
  `plain()`/`objectHeaders()` 가 내보내는 헤더 전부를 열거한다). `02` §2 non-goal 과 HT6("consumer 는
  서버에서 읽는다")에 부합하므로 결함이 아니다. 단, 브라우저 측 consumer 는 이 문서를 읽을 수 없다.
- **NOTE-7** `platform/build/site-build.ts:19`
  `fileURLToPath(new URL("./declared-routes.ts", import.meta.url))` 는 tsx-from-source 에서 정확하고
  fresh clone 에서도(파일이 커밋되면) 동작한다. `platform/**` 을 `.js` 로 emit 하는 날 깨진다.
  `.gitignore` 의 `data/*` 블록은 `!data/sites/**` 로 재포함하므로
  `data/sites/boost-interior-demo/integration.json` 은 정상적으로 추적된다.
- **NOTE-8** `platform/integration/emit.ts:143-149` `itemPath` 는 `[x]` 패턴 **모든** 세그먼트를 같은
  slug 로 치환하고 `[...x]` 는 인식하지 못한다. 다중 파라미터/catch-all item route 는 잘못된 path 를
  만들지만 곧바로 `emit.ts:176` 의 INV-5 검사(`its detail page … is not in the route plan`)에 걸려
  빌드가 실패한다 — fail-closed. 다만 오류 메시지가 원인(route 패턴)이 아니라 결과(URL)를 가리킨다.

---

## 검증된 것 (리뷰어가 직접 재현한 항목)

각 항목은 프로젝트 테스트의 통과 사실이 아니라 리뷰어의 독립 계산·코드 판독 결과다.

1. **(a) 기본 OFF · 사이트별 opt-in · 사이트명 하드코드 없음** —
   `grep -rn 'boost-interior|interior-demo|boostweb' platform --include='*.ts'` (테스트 제외) → **0 hit**.
   유일한 게이트는 `platform/integration/config.ts:70`
   `return mode === "public" && config?.firstPartyData.enabled === true;` 이고, 켜는 방법은
   `data/sites/<siteId>/integration.json` 파일의 존재뿐이다(`config.ts:42`). 픽스처 3종에는 그 파일이 없다.
   `grep -rn '_integration' platform workers templates` 에서 integration 모듈 / `site-build.ts` / 테스트를
   빼면 **0 hit** — publish·runtime 어디에도 이 디렉터리를 특별 취급하는 코드가 없다(= 데모 전용 분기 없음).
2. **(b) OFF 와 ON 은 절대 같은 build identity 를 가질 수 없고, OFF 는 기능 도입 전과 동일하다** —
   `platform/util/hash.ts:21` `if (member !== undefined) out[key] = …` 이므로 `computeBuildInputId` 가
   항상 넘기는 `integrationInputHash: undefined` 는 canonical JSON 에서 **key 째로 사라진다**. 따라서
   emit 하지 않는 빌드의 해시 입력은 기능 도입 전과 바이트 단위로 같다. 실제 값으로도 확인된다:
   현재 데모의 ON `buildInputId` = `39c69a40…`, 여기서 integration part 만 제거하면
   `18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f` = **live 패키지의 id** 와 일치한다.
   preview 모드는 `config` 가 `enabled:true` 여도 `emit=false` → part 없음(SE5).
3. **(c) Template Release 는 건드리지 않았다** — `platform/release/release.ts:72-87` `collectReleaseSources`
   가 정의하는 release source 는 `templates/interior-01/v1/**` + `platform/{content,settings,theme,assets,slots,site}`
   (`site/load.ts` 제외) + `platform/tsconfig.json` + `platform/runtime/{package.json,pnpm-lock.yaml}` 이다.
   이번 변경에서 손댄 파일 중 이 집합에 드는 것은 **없다**(`platform/integration/**`, `platform/build/**`,
   `platform/test/**` 모두 비대상). release source 인 `platform/tsconfig.json` 은 변경되지 않았고,
   그 `include: ["**/*.ts", …]` 가 새 디렉터리를 이미 포함하므로 tsconfig 를 고칠 필요도 없었다
   (= releaseHash 를 건드릴 유인이 없었다). `./node_modules/.bin/tsc -p platform/tsconfig.json` → **exit 0**.
4. **(d) runtime Worker/API/DB 의존 없음** — 산출물은 같은 불변 패키지 안의 정적 파일 2개뿐. worker/publish
   코드 변경 0줄(위 1번의 grep).
5. **(e) 실제 portfolio 데이터만의 projection** — `emit.ts:174-199` 는 명시 allowlist 다.
   `basis` 는 `AREA_BASES`(supply|exclusive)에 있을 때만 실리고(`:182`) 저장된 `"unknown"` 은 key 째 생략(AR3),
   `pricePerArea.unit` → `perUnit` 으로 이름만 바뀌며 값 변환·단위 환산·총액 계산은 어디에도 없다(PR5).
   `location`/`area`/`pricePerArea` 는 원본에 없으면 key 자체가 없다. `propertyType`/`style`/`totalCost`
   문자열은 코드에 존재하지 않는다. 빈 배열은 `records` 만 허용된다(`validate.ts:132`).
6. **(f) 결정성** — `compareCodePoints`(`emit.ts:108-117`)는 `localeCompare` 도 기본 `sort()` 도 쓰지 않는다;
   record 는 id code point 오름차순(`:173`), facet 값도 동일(`:206`), record 의 facet 배열은 입력 순서 +
   첫 등장 dedupe(`dedupe`, `:120-124`). `portfolioVersion = hashJson(document − version).slice(0,32)`
   (`:158-162`) — 시계·UUID·환경변수·절대경로가 개입하는 지점이 없다(emitter 는 fs/clock/env 를 전혀
   import 하지 않는다). manifest pointer · 파일명 · 문서 echo 가 같은 version 이고 validator 가 이를
   재계산해 대조한다(`validate.ts:200-206`). 같은 snapshot 두 번 → 같은 sha256(E2), 그리고 실제 재빌드도
   같은 `packageHash`(T1).
7. **(g) producer-side fail-closed validator** — `assertIntegration`(`validate.ts:262-265`)은 오류를 **모두**
   모아 던지고, 빌더가 `SiteBuildError` 로 감싸며(`site-build.ts:406-409`) 그 경우 패키지는 쓰이지 않는다.
   emitter 도 origin 없음/`http:`/item route ≠ 1/route plan 에 없는 상세 페이지에서 throw 한다. 조용한 skip 경로는 없다.
8. **(h) live 패키지 무변경** — `git status --porcelain -- data/site-builds/.../packages/18c0a5ef…` → **빈 출력**.
   `build-record.json.packageHash = cd048406311f22b63cf83bd240b0579e03b69f3b60def82527e6f863f8035202`
   가 여전히 실제 파일들의 해시와 일치(`packageIntact`), `previous.json` 이 이 패키지를 가리킨다.
   그 패키지에는 `_integration/` 가 없다.
9. **(i) golden = live + 정확히 2개 파일** — 프로젝트 테스트(G5)와 **별개로** 리뷰어가 두 `site/` 트리를
   직접 순회하며 `18c0a5eff5abce3fef1cc3f86c0498a3` → `39c69a40cb57a5de8571e99e809998ce`(Next build id,
   `RECON_BUILD_ID = buildInputId[0:32]`) 치환 후 바이트 비교한 결과:
   `only in OLD: []` · `only in NEW: ['_integration/manifest.json', '_integration/portfolio.6346c472….json']` ·
   **build id 외에 달라진 파일 0개** · 156 → 158 파일.
10. **`02` §21 golden 값 재현** — 실제 패키지의 문서 version 이 `6346c472e162ae07b76a4686fce54c51`,
    크기 5 292 B 로 `02` §21.1 과 정확히 일치한다. manifest 는 274 B(문서의 273 B 는 placeholder origin
    `https://boost-interior-demo.example` 기준, 실제 origin 이 1자 길다 — 일관됨). §21.3 빈 문서와
    §21.2 2건 문서의 version 도 재현된다(E2).
11. **패키징/QA 상호작용** — `platform/build/qa.ts:47` `TEXT_EXT` 에 `json` 이 포함되어 두 파일도 스캔되지만,
    manifest 의 `https://interior-demo.boostweb.co.kr` 은 `qa.ts:98` 의 `sameOrigin` 검사로 통과한다
    (자기 origin). `exclusiveRoutes` 는 `.html` 만 본다(`qa.ts:84`) — JSON 이 "계획에 없는 route" 로
    오인될 수 없다. 실제 golden 빌드의 `qa.pass = true`, `qa.files = 158`.
    `verifyIntegrationOutput`(`site-build.ts:216-232`)은 export 안의 `_integration/` 파일 목록과 **각 파일의
    sha256** 을 emit 한 바이트와 대조하고, emit 하지 않는 빌드에서는 그 디렉터리의 **존재 자체를** 거부한다.
12. **publish / runtime 동작(HT2·HT3·HT8·CH-R11b)** — `.json` → `application/json`
    (`platform/publish/media.ts` `CONTENT_TYPES`), 두 파일 모두 `CACHE_REVALIDATE =
    "public, max-age=0, must-revalidate"` 를 받는다(`media.ts:49-54` 의 immutable 규칙은 `_next/static/`
    접두 또는 "파일명 stem 전체가 자기 sha256 접두인 hex" 일 때만 적용되는데 `portfolio.<32hex>.json` 은
    stem 이 `portfolio…` 로 시작해 걸리지 않는다) → manifest 의 `max-age ≤ 60` 요구(HT3) 충족.
    `workers/recon-runtime/src/paths.ts:29-59` 에는 밑줄 접두 denylist 가 없고 비-`.html` 확장자는 정확히
    그 key 로 서빙된다. 객체가 없으면 `index.ts:165-168` 이 패키지의 `404.html` 을 **status 404** 로
    돌려준다 — **403 이 아니다**(CH-R11b 충족). `/_integration/manifest.json/` 은 404(HT8).
13. **테스트 실행** — 리뷰어가 직접
    `./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/test/integration.test.ts` 를
    재실행: **47 passed, 0 failed, exit 0**.
    주의: 리뷰에 함께 제공된 로그
    `…/scratchpad/integration-test.log` 는 **오래된 것**이다(로그 17:06:46, `integration.test.ts` mtime
    17:08:11). 그 로그의 `T5` 실패는 이후 테스트 파일 수정으로 해소되었고, 리뷰어가 문제의 정규식
    `/integration \(site opted in, public build\)[\s\S]*title: contains a forbidden character \(HT7\)/` 을
    실제 오류 메시지에 대해 돌려 `true` 임을 확인했다. **현재 작업 트리 기준 실패 테스트는 없다.**

---

## 종합 의견

구현의 골격은 계약에 충실하다. 특히 세 가지는 이 규모의 변경에서 보기 드물게 잘 되어 있다.

- emitter 가 **순수 함수**(fs/clock/env import 0)여서 결정성 주장이 코드 구조로 뒷받침된다.
- OFF 경로의 byte-neutrality 를 "테스트로 확인"에 그치지 않고 `stableStringify` 의 `undefined` 제거
  성질 위에 **구조적으로** 세웠다(요구사항 (b)의 BLOCKER 조건을 만족).
- golden 패키지가 live 패키지와 build id 를 제외하면 **0 바이트 차이 + 정확히 2 파일 추가**라는 것을
  리뷰어가 독립적으로 재계산해 확인했다.

남은 위험은 데이터가 아니라 **식별자**에 있다. MAJOR-1(emitter 코드가 build input 이 아님)은 지금 당장
잘못된 문서를 내보내지는 않지만, "한 build identity = 한 벌의 바이트"라는 이 플랫폼의 핵심 불변식을
사람의 규율에 의존하게 만든 첫 사례다 — 그리고 이 변경은 빌더가 `site/` 안에 바이트를 직접 쓰는 최초의
변경이므로, 기존 관행이 면죄부가 되지 않는다. MAJOR-2 는 계약이 정의한 상태 하나를 producer 가 영구히
도달 불가능하게 만드는 표류이며, 둘 다 수정 비용이 작다(각각 해시 입력 한 줄, 분기 한 개).

pilot 배포 자체를 막을 근거(BLOCKER)는 발견하지 못했다.
