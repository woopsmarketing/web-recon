# 04 — `site:publish` Design

Design and operating notes for the publisher. `03-static-delivery-contract.md` is the **normative
contract** (key layout, pointer/seal schema, MIME table, HTTP status, caching rule); this document
does not repeat those tables and never contradicts it. `_session1/02-publish-contract.md` is
**superseded history** — the first version of this code, written before the contract doc was
split out; where it conflicts with anything here, the code below is the current behaviour.

## 1. Purpose & boundary

Static delivery only. `site:publish` reads a finished, QA-passed Site Build Package from
`data/site-builds/<siteId>/**` and copies its bytes to an object store, then moves one pointer.
It defines no data or template semantics — every package file is an opaque static object.

| Boundary | Detail |
|---|---|
| Reads | `data/site-builds/<siteId>/current.json`, `.../packages/<buildInputId>/build-record.json`, `.../site/**` |
| Never writes under | `data/site-builds/**` (`platform/publish/publish.ts:1-3` header; no `writeFile`/`rm` call touches that tree anywhere in `publish.ts`) |
| Writes to | one R2-shaped bucket: package files, one seal per package, one pointer per hostname (`workers/recon-runtime/src/contract.ts:5-17`) |
| Does not | rebuild, template-render, rewrite content, or make any integration/data decision |

## 2. Command reference

```
pnpm site:publish --site <siteId> --host <hostname> [--bucket boost-sites-artifacts] [--dry-run [--check-store]]
                  [--local | --remote] [--persist-to <dir>] [--concurrency N] [--allow-site-change]
                  [--expect-package <packageHash>] [--expect-live <packageHash|none>]
                  [--no-activate] [--reverify] [--allow-origin-mismatch]
pnpm site:publish --site <siteId> --host <hostname> --rollback [--expect-live <packageHash>] [--local|--remote] [--persist-to <dir>]
```
(`platform/cli/site-publish.ts:1-33` header; flag lists `:38-39`)

| Flag | Default | Validation | Source |
|---|---|---|---|
| `--site`, `--host` | required | missing either → usage error | `site-publish.ts:54-56` |
| `--bucket` | `boost-sites-artifacts` | `^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$` | `site-publish.ts:67-69` |
| `--local` / `--remote` | `--local` | mutually exclusive | `:57` |
| `--dry-run` | off | — | `:75` |
| `--check-store` | off | only with `--dry-run` | `:59` |
| `--concurrency` | `4` (capped to store's `maxConcurrency`) | positive integer | `:70-72` |
| `--allow-site-change` | off | — | `publish.ts` `decidePointer` `:350-351` |
| `--expect-package <hash>` | unset | 64-hex | `site-publish.ts:63-64` |
| `--expect-live <hash\|none>` | unset | `none` or 64-hex; incompatible with `--no-activate` | `:60, 65-66` |
| `--no-activate` | off (activate) | incompatible with `--expect-live` | `:60` |
| `--reverify` | off | — | — |
| `--allow-origin-mismatch` | off | only meaningful with `--remote` | `publish.ts:267-271`; wired at `site-publish.ts:117` |
| `--rollback` | off | only combines with `--expect-live` and store flags | `site-publish.ts:58` |
| `--persist-to` | `tmp/recon-runtime-state` | — | `:77` |

Unknown flags fail before any other check (`site-publish.ts:52-53`). Every `--remote` run that
reaches the bucket — **reads included** — is refused unless `RECON_PUBLISH_ALLOW_REMOTE=1`
(`:78-82`): `--remote --dry-run --check-store` still reads the seal and the live pointer through
the store, so it is gated too; only `--remote --dry-run` without `--check-store` is exempt
(fully offline).

**Exit codes.** `0` success. `2` usage error — unknown/missing/malformed flags, or the `--remote`
gate — always before any store access. `1` a validated run that failed during planning or at the
store (`res` stays `undefined`, `:126`). Every failure message states the pointer is untouched
unless it explicitly says otherwise (`:95, 122`; `publish.ts:541, 543` say "WRITTEN" when a write
happened but its read-back could not be confirmed).

**Examples**
```sh
pnpm site:publish --site boost-interior-demo --host localhost --dry-run --check-store
pnpm site:publish --site boost-interior-demo --host localhost --no-activate
pnpm site:publish --site boost-interior-demo --host localhost --rollback --expect-live 613cd9e0...
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host demo.example --remote --expect-live none
```

## 3. Pipeline (steps 1–8, `publish.ts:5-16` header; implementation `planPublish` `:202-292`, `publishSite` `:381-512`)

| # | Step | Where | Failure effect |
|---|---|---|---|
| 1 | `current.json` → `build-record.json` (zod), status/qa/siteId/buildInputId match, optional `--expect-package`, package has `index.html` and `404.html` | `:203-230` | throw, no store access |
| 2 | re-verify `packageHash` via the platform's own `packageIntact` | `:231` | throw, no store access |
| 3 | inventory `site/**`: sha256/size/content-type/cache-control per file, fail closed on unknown extension/non-regular file/reserved seal name, count/bytes = `qa.files`/`qa.bytes`, re-run `packageIntact` after reading | `:233-253` | throw, no store access |
| 4 | build every key under `sites/<siteId>/packages/<packageHash>/` (inline, `:246`), plus `bakedOrigin` + `warnings` (origin mismatch, video/Range) | `:255-291` | throw (origin mismatch only fatal with `--remote` and no `--allow-origin-mismatch`, `:267-271`) |
| 5 | seal present & identical → skip uploads (`index.html`/`404.html` re-read & compared before activation, `:462-467`, unless `--reverify` checks every object, `:452-461`); present & different → refuse (`:447-449`) | `:446-468` | refuse, nothing uploaded, pointer untouched |
| 6 | upload every file (pooled, `concurrency`), then read each back and compare sha256+size | `:470-482` | throw, no seal, pointer untouched; already-uploaded bytes stay (same `packageHash` ⇒ safe to retry) |
| 7 | seal `_package.json` last, read it back | `:487-492` | throw, pointer untouched; refuses to seal unless uploaded = verified = file count (`:483-486`) |
| 8 | read existing pointer, decide write/unchanged (site-change + `--expect-live` guards, immutable-path stability), write, read back | `:500-511` | throw; write-then-readback failure says the pointer **may have moved** (`:541, 543`) |

`--expect-live` is checked **twice**: early, before step 5, so a stale expectation causes zero
uploads (`:435-438`); and again at step 8 inside `decidePointer` (`:348`, called at `:502`).
`--no-activate` stops after step 7 (`:495-498`, status `"uploaded"`). `--dry-run` runs steps 1–4
only, no store access (`:399-401`); `--dry-run --check-store` additionally evaluates 5 and 8
read-only (`:402-425`, §4).

## 4. Dry run (+ `--check-store`)

`--dry-run` alone makes **no store access at all** — not even a read (`publishSite`, `:399-401`).
Output has no clock value (`pointer.publishedAt` = the constant `DRY_RUN_PUBLISHED_AT`,
`:126, 400`) and no machine path, so identical package + identical flags → byte-identical output.
`--dry-run --check-store` wraps the store in `readOnly()` (`:320-330`, `put` throws), reads the
seal (`:404-407`) and the live pointer (`:410-416`), and builds a `StoreCheck`
(`:129-136, 417-424`) that raises every refusal the real run would (site-change, `--expect-live`,
immutable-path instability) without writing anything.

| Requirement | Printed as | Source |
|---|---|---|
| siteId, build identity, packageHash, file count, total bytes | one log line `[siteId] package <hash> (build <id>, <releaseId>) · N files · B bytes …` (`:392`), and again in the trailing JSON: `packageHash` `:158`, `buildInputId`/`releaseId` `:159-160`, `files` `:162`, `bytes` `:163` | `publish.ts:392`, `site-publish.ts:158-163` |
| target bucket | `Target bucket: <bucket> (local\|remote…)` | `site-publish.ts:137` |
| target object keys/prefixes | one row per file `key\t…`, plus seal key and routing key rows | `:143-146` |
| content types | column 2 of the file table, and JSON `byContentType` | `:144`, `:165` |
| cache categories | column 3 of the file table, and JSON `byCachePolicy` (keyed `<reason>: <cache-control>`, built at `:129-134`) | `:144`, `:166` |
| pointer target | routing-key row + printed `pointer` object (hostname, siteId, packageHash, buildInputId, releaseId, `previous`) | `:146-147` |
| what would be skipped / uploaded | `StoreCheck.wouldSkip`/`wouldUpload` (seal identical → skip all; no seal → upload all); without `--check-store` the CLI prints a conditional sentence instead (`:141`) | `publish.ts:420-421`, `site-publish.ts:141` |
| validation failures | thrown `PublishError` before any of the above prints; `site:publish FAILED (routing pointer untouched …): <message>` on stderr | `:122` |

## 5. Identity & R2 layout

`packageHash` (`build-record.json#packageHash`) is the artifact identity, not `buildInputId`.
`packageHash` is a hash of the **served bytes** (every file and relative path under `site/`); two
packages with the same `packageHash` are byte-identical, so it is safe as an immutable storage
prefix (`PackageKey` = `sites/<siteId>/packages/<packageHash>/`, `contract.ts:32-37`).
`buildInputId` is a hash of **inputs** (release hash, site snapshot hash, mode, toolchain hash,
`02-current-package-reality.md` §2) computed *before* the build runs — two different builds can
share it only by producing byte-identical output, but it names the recipe, not the tree, so using
it as a storage key would either collide on rebuild-with-different-output or force a new prefix
for byte-identical output. It is carried in the seal and pointer for provenance only
(`contract.ts:45-51`).

## 6. Immutability rules

- **Sealed prefix** (`_package.json` present and byte-identical to the one this publish would
  write): never written again; all file uploads skipped (`publish.ts:446-451`).
- **Unsealed prefix**: treated as an interrupted upload — every file is re-uploaded (same
  `packageHash`, same bytes) and read back; the seal is refused unless uploaded = verified = file
  count (`:469-493`).
- **Immutable-path guard** (`assertImmutablePathsStable`, `:358-379`): before the pointer moves, a
  path served `immutable` by **both** the live package's seal and the new plan must carry the same
  sha256, else the publish is refused (`:376-378`). **Fails closed**: if the live package's seal
  is absent or unreadable, the switch is refused too (`:371-373`), with a recovery hint (inspect
  the seal at the printed key, or delete the pointer and publish again) — it no longer returns
  `"unchecked"` (verified by grep: no `unchecked` string anywhere in `publish.ts`).
- Publish and rollback never delete an object.

## 7. Pointer write, guards, rollback

Pointer (`routing/<hostname>.json`) is read once (after all uploads), decided, then written and
read back (`:501-511`). Guards, all before the write:

| Guard | Refuses when | Source |
|---|---|---|
| schema | existing pointer fails zod parse, or names another hostname | `readRoutingPointer` `:518-531` |
| site change | hostname currently serves another `siteId` and `--allow-site-change` absent | `decidePointer` `:350-351` |
| `--expect-live` | pointer's current `packageHash` ≠ expected (`"none"` = no pointer) | `assertExpectedLive` `:337-344` |
| immutable-path stability | §6 | `:358-379` |

Same package + same site → `"unchanged"`, no write (`:353`). A write that succeeds but fails its
read-back throws saying the pointer **may have moved** (`:541, 543`) — never claims "untouched".

`rollbackHost` (`:552-576`) re-points a hostname at its pointer's `previous`, no upload. Refused
when there is no `previous` (`:560`), `previous`/pointer names another site (`:558, 561`), or the
target's seal is missing/invalid (`:569-571`) — an unparsable previous seal is caught and turned
into that same clean refusal (`:563-568`), never a raw exception. The package being left becomes
the new `previous` (`:572`), so a second rollback rolls forward.

## 8. Concurrency

One operator per hostname is assumed; the pointer read→write is not atomic (`wrangler r2 object
put` has no conditional put, `wrangler-store.ts` header `:1-13`). `--expect-package` catches a
concurrent `site:build` replacing the current package between review and publish;
`--expect-live` catches a concurrent publish/rollback replacing the pointer between review and
write. Neither is atomic — both are read-then-compare, so a race inside that same window (another
process writing between the guard's read and this run's write) is not caught. Upgrade path: a
conditional put (R2 `onlyIf` / S3 `If-Match`) implemented behind the same `ObjectStore` interface
(`store.ts:16-23`), no caller change needed.

## 9. Credential handling

`publish.ts` and `wrangler-store.ts` never read, print or store `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` (grep-verified 2026-09-21: no reference in `platform/publish/` or
`platform/cli/site-publish.ts`). `WranglerStore.run()` passes the **entire** parent
`process.env` through to the `wrangler` subprocess unmodified except for
`WRANGLER_SEND_METRICS`/`NO_COLOR`/`FORCE_COLOR` (`wrangler-store.ts:57-63`) — wrangler itself
reads the Cloudflare credentials from that environment; the publisher's own code path never
touches them. Every `--remote` run that reaches the bucket, reads included, is refused unless
`RECON_PUBLISH_ALLOW_REMOTE=1` (`site-publish.ts:78-82`); only `--remote --dry-run` without
`--check-store` needs no such gate and never touches the store at all (§4).

## 10. ObjectStore backends

Single `ObjectStore` interface (`store.ts:16-23`): `get`/`put`, a `description`, an optional
`maxConcurrency`.

| Backend | Use | Notes |
|---|---|---|
| `MemoryStore` | unit tests | in-process `Map`; fault injection (`failPut`, `corruptPut`, `MemoryFaults`) for ordering/failure tests — test support, defined next to `MemoryStore` (`store.ts:30-56`) |
| `WranglerStore` local | `pnpm site:publish` default, `test:publish:e2e` | `wrangler r2 object put/get --local --persist-to <dir>`, the same state `runtime:dev` serves; `maxConcurrency = 1` — each call boots its own miniflare over the same SQLite state and parallel calls fail (`wrangler-store.ts:36-39, 48`) |
| `WranglerStore` remote | `--remote` (not executed to date) | requires `allowRemote` at construction, itself gated by `RECON_PUBLISH_ALLOW_REMOTE=1` at the CLI (`:46`); `maxConcurrency` unset → CLI default `4` applies |

Each `put`/`get` spawns its own `wrangler` child process — one process per object, body via a
private temp file for `put` and stdout for `get --pipe` (`:80-106`); `"specified key does not
exist"` is the only stderr pattern mapped to `null` (`:104`), every other non-zero exit throws
(`:93, 105`). A read-only **local** store whose persist directory does not exist yet returns
`null` from `get()` without spawning wrangler at all, so `--dry-run --check-store --local` creates
nothing on disk (`:100-101`).

## 11. Failure table

| Failure | Effect on bucket | Effect on pointer |
|---|---|---|
| Usage error / `--remote` gate | none (no store touched) | untouched |
| Validation (steps 1–4) / seal present with different content | none | untouched |
| Sealed-skip readback of `index.html`/`404.html` fails | none | untouched — refuses to activate ("incomplete/damaged") |
| Upload failure mid-file, verify mismatch, or count ≠ `plan.files.length` | some/uploaded bytes may remain under the still-unsealed prefix | untouched |
| Seal write failure / seal read-back mismatch | files uploaded, no valid seal | untouched |
| Pointer guard refusal (schema/foreign-hostname, site-change, `--expect-live`, immutable-path) | none (`--expect-live` checked early — zero uploads if set) | untouched — refuses to overwrite |
| Pointer write, read-back fails | — | **write may have happened**; message says "may have moved" |
| Same package already live | none | untouched (already correct) |
| Rollback: no / foreign / unsealed / unparsable `previous` | none | untouched |

## 12. Known limits / deferred

- Only the site's *current* package (`current.json`) can be published; rollback only reaches the
  pointer's `previous`, which must already be sealed.
- No garbage collection of old package prefixes — bytes are immutable, retention is a later
  decision.
- A matching seal is trusted without full re-verification unless `--reverify` is passed (the
  sealed-skip path always re-reads `index.html`/`404.html`, §3 step 5).
- Pointer/`--expect-*` guards are read-then-compare, not atomic (§8). Interleaved concurrent
  publishers are not detected: the last writer wins, `previous` may then name a package that was
  never live, and the site-change guard can be passed by the loser (§8).
- Local `WranglerStore` concurrency is 1; a large package publishes serially.
- Flag count (16 unique flags, `site-publish.ts:38-39`) is deliberately large for a one-site pilot
  — each one is a distinct guard or the upload/verify/activate split the live plan needs.
- **Test coverage**, measured against `platform/test/publish.test.ts` (grep-verified 2026-09-21;
  see `06-local-validation.md` for suite totals):

  | Feature | Covered by |
  |---|---|
  | `--expect-live` / `expectLivePackageHash` | `P4`, `P5b`, `G5`, `P14` usage errors (`--expect-live xyz`, `--no-activate --expect-live none`) |
  | `--no-activate` / `activate: false` | `P5`, `P5b`, `P14` usage errors (`--no-activate --expect-live none`) |
  | `--reverify` | `P6` |
  | `--check-store` | `P2a`, `P2b`, `P2c`, `P3`, `G6` (`checkStore` without `dryRun` throws) |
  | Immutable-path guard, fail-closed on missing/unreadable live seal | `G1`, `G2` |
  | Sealed-skip `index.html`/`404.html` readback (no `--reverify`) | `G4` |
  | Pointer-ownership guard (foreign hostname under this host's key) | `G6` |
  | Rollback onto an unparsable `previous` seal | `G6` |
  | `RECON_PUBLISH_ALLOW_REMOTE` gate, incl. `--remote --dry-run --check-store` | `P14` usage errors (`--remote without …`, `--remote --dry-run --check-store without … review R6`) |
  | `--allow-origin-mismatch` as a **CLI flag** | `P14` "`--remote --dry-run` (offline, no store)": without the flag the run exits 1 with "was built for"; with the flag it exits 0 and prints the plan. `G3` covers `requireOriginMatch` at the API level. |

  **Not covered, and not coverable locally:** a real (non-dry-run) `--remote` publish, with or
  without `--allow-origin-mismatch`. Every path that would reach Cloudflare is outside the local
  suites by design; the first such run is step 5 of `07-live-deploy-plan.md`.
