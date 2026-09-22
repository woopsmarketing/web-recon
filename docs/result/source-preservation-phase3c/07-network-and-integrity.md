# 07 — Network safety and integrity

## Escaped outbound: **0**

The protections are the unchanged reviewed 3B guard:
- a fail-closed `context.route` router, installed before any navigation;
- `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`;
- WebSockets closed; service workers blocked.

Router decisions (attempt 2):

| phase | allow-local | stub-fulfilled (fixtures) | blocked |
|---|---|---|---|
| runtime preflight (not experiment traffic) | 1 | 1 | 1 |
| pre-execution | 43 | 0 | 1 |
| boot | 27 | **4** | 0 |
| resize | 25 | 0 | 0 |

- **Blocked (1):** `GET …apartmentary-static.s3…/main-introduce.mp4` (media), the known hero-video
  residual from the frozen Phase 2 markup. Blocked, not served.
- **API:** 4/4 GETs fulfilled from fixtures with 0 preflights reaching the handler. `authorization` was
  `<empty>` on all 4. **The real source API was never contacted** (`B7`), and no real API body exists in
  the artifact (`content.noRealApiBodiesInArtifact`).
- **Trackers/widgets:**
  - requests attempted: **0**;
  - executable non-replay scripts: **0** (gate 11/11);
  - real Karrot, `fbq` or Kakao code executed: **no**;
  - stand-ins: only `karrotPixel {track}`, unchanged, called once;
  - no same-class crash occurred, so **no `fbq`/`Kakao` stand-in** was added.
- **Images:** all 46 synthetic placeholders were requested from the local origin, and all were served 200
  with the manifest sha256. **0 remote images** were continued. No `/_next/image` path was needed or
  requested.
- **WebSocket attempts:** 0.

## Local server (96 responses)

| resolved by | count |
|---|---|
| experiment document `/` | 1 |
| evidence path map: 9 replay scripts, font, bundled bottom images, **46 synthetic images** | 61 |
| frozen-clone static (`/assets/`, `/styles/`) | 33 |
| 404 | 1 (`/__runtime_preflight_probe__`, preflight only) |

No `pages/_error` request and no other local 404.

## Source-JS integrity: byte-identical

All 9 replay scripts were served with status 200 and **sha256 equal to the runtime-graph value**.
`check-result` recomputes this from `network-log.json`. `bytePatchRequired: false`. Synthetic data needed
**no source-JS change**.

## Baseline integrity: unchanged

| tree | before | after | changed files |
|---|---|---|---|
| Phase 2 clone `2026-09-16T06-42-28-282Z` | `cfd97f47…a2a568` | identical | **0** |
| Phase 1 run `2026-09-16T05-27-10-722Z` | `e13a81f3…991cb5` | identical | **0** |

- The parent 3B.1 artifact `2026-09-16T09-59-25-874Z` was read only.
- Both 3C attempts are new directories.
- Attempt 1 was not modified after its run, except that `SUPERSEDED.json` was added beside it.

## Validation (proportional)

| check | result |
|---|---|
| contract evidence snippets re-found at offsets | 80/80 |
| fixture schema consistency (`validateFixturesAgainstContract`) | 216/216 |
| deterministic fixtures (`generate-fixtures.mjs --check`) | pass |
| static preflight (`prepare.mjs`) | 117/117 |
| runtime preflight / pre-execution gate | 4/4 · 11/11 |
| result consistency (`check-result.mjs`) | **147/147** |

`check-result.mjs` covers the following:
- files present;
- 4/4 fulfilled from the frozen fixture copies, logged with fixtureId, bytes and items;
- synthetic images local with matching bytes;
- raw-log network recomputation;
- byte identity of the 9 scripts;
- baselines;
- fatal count from the raw console log;
- mounted/boot consistency;
- carousel instances: none before release, 4 live at settle, slides equal fixture items and all synthetic;
- the autoplay advance and the click effect;
- no component construction in harness code (a regex over `run.mjs` and the 3 3C libs; the config and the 3B/3B.1 libs are outside its scope, and the reviewer grepped them manually: clean);
- F0/F1/F2/390 footer probes complete, with F1 timed inside the commit point;
- scroll at release `[0,0]`;
- style inventory present;
- genericity guard over the 3B, 3B.1 and 3C `lib/` directories, plus its mutation self-test;
- inertness guard.

No full repository regression was run (out of scope).
