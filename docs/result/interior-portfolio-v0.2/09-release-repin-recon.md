# 09 — Template Release cut + site re-pin: mechanism recon (READ-ONLY, 2026-09-24)

Scope: document how a new Template Release is cut and how a site is re-pinned to it, in this repo,
as it exists right now. Nothing was run, edited, or committed. Every claim below is a `file:line`
citation of code or docs already in the tree, or a `git show`/`git log` observation.

Trigger for this recon: `platform/content/schema.ts` has 5 new optional `ProjectSchema` fields
(uncommitted, working tree). `platform/content/` is a release source
(`platform/release/release.ts:52` `PLATFORM_RUNTIME_DIRS`), so the working tree no longer hashes to
the currently pinned release `interior-01-1.5.2-d87807590d64`. This exact situation is already
narrated in the repo's own `skip()`-ped test, `platform/test/integration.test.ts:1214-1223` ("I2b"):
> "Before any V0.2 field can be AUTHORED in `data/sites/**`, a new Template Release must be cut:
> release 1.5.2's frozen, strict ProjectSchema would reject the new keys in the build workspace."

---

## 1. What is a Template Release here

Defined and implemented entirely in `platform/release/release.ts`.

**On-disk layout** (`platform/release/release.ts:22,315-324,391-403`):
```
data/template-releases/<templateId>/<releaseId>/
  release.json                 (record, chmod 0444)
  files/<snapshot-relative path>   (every collected file, chmod 0444)
```
`RELEASES_DIR = "data/template-releases"` (`release.ts:22`). `releaseDir()` (`release.ts:315-324`)
builds and validates that path, refusing anything that would escape the release store.

**What goes into a release** — `collectReleaseSources()` (`release.ts:71-86`):
- `templates/<templateId>/v<major>/**`, excluding `provenance.json, node_modules, .next, out,
  public, next-env.d.ts, fixtures` (`release.ts:50,58-68,72-75`);
- `platform/{content,settings,theme,assets,slots,site}/**`, excluding `site/load.ts`
  (`release.ts:52-53,76-81`) — this is why `platform/content/schema.ts` is a release source;
- `platform/tsconfig.json`, and `package.json`/`pnpm-lock.yaml` sourced from
  `platform/runtime/package.json` / `platform/runtime/pnpm-lock.yaml` (scoped runtime manifest,
  never the repo-root manifest) (`release.ts:82-84`).

**What goes into `releaseHash`** — `computeReleaseHash()` (`release.ts:96-104`): a JSON hash over
`{ templateId, templateVersion, forbiddenTerms, gates, files: [{path, sha256}] }`. Explicitly
excluded: timestamps, and per-file `size` (`release.ts:15-19`, doc comment: "no timestamps... editing
any of that metadata (or any file byte) is detected. `createdAt` and per-file `size` are informational
and NOT hashed"). `releaseId = <templateId>-<templateVersion>-<releaseHash[0:12]>`
(`release.ts:55-56`, `RELEASE_ID_RE`).

There is also `templateSourceHash` (`release.ts:106-108`, `computeTemplateSourceHash()`): the same
kind of hash but restricted to `templates/**` entries only — "same Template source code" identity,
independent of the platform runtime bytes.

**`gates`** (source-isolation checks run and recorded before a release is created,
`release.ts:110-306,342-363`):
- `source-isolation`: every collected file scanned for `provenance.json`'s `forbiddenTerms`
  (`release.ts:302-305,350`, terms come from `templates/<id>/v<major>/provenance.json`, e.g.
  `templates/interior-01/v1/provenance.json:7-16` — "apartmentary", the source host name, etc.);
- `template-code-rules`: an allowlist-based TypeScript AST scan of every `templates/**` file
  (`release.ts:186-288`) — import allowlist (`TEMPLATE_IMPORT_ALLOW`, `release.ts:118-133`), a
  named-import-only rule for `next/navigation`'s `notFound` (`release.ts:141`), type-only import
  for `next` (`release.ts:146`), and a banned-identifier list (`Date, Intl, performance, setTimeout,
  process, globalThis, window, fetch, crypto, Math.random`, …, `release.ts:153-174`) — plus a
  hard-coded-siteId scan (`release.ts:286`).
Both gates are re-run and recorded as `pass: true/false` with a one-line `detail` inside the
`gates` map that becomes part of the hash input (`release.ts:357-364`). A gate failure throws
`ReleaseError` before any file is written (`release.ts:353-355`).

**What `verifyRelease` checks** (`release.ts:427-447`, called by `loadRelease`-consumers and inside
`createRelease` itself when a release id already exists, `release.ts:368-376`):
1. the on-disk `files/` set (sorted, depth-first) equals `record.files`'s path list exactly
   (`release.ts:432-436`);
2. every stored file re-hashes to its recorded `sha256` (`release.ts:437-439`);
3. `computeReleaseHash(record) === record.releaseHash` (`release.ts:441-443`);
4. `computeTemplateSourceHash(record.files) === record.templateSourceHash` (`release.ts:444-446`).
Any mismatch throws `ReleaseError` naming the exact drift.

`materializeRelease()` (`release.ts:449-459`) is the only way release bytes are ever *used*: it
copies `files/` into a disposable build workspace, `chmod`s the copy writable, and **re-hashes the
copy** before returning — "the build compiles exactly the bytes the release recorded."

---

## 2. Exact commands

Per `AUTHORITATIVE_WORKTREE.md` (repo root) and `~/.claude/...MEMORY.md`: binaries in this worktree
are invoked as `./node_modules/.bin/tsx`, never `pnpm` directly. The scripts' own docstrings say
`pnpm template:release …` / `pnpm site:build …` (those are the `package.json` script aliases); the
tsx-direct equivalents used in this worktree, and recorded as literally run in
`docs/result/outreach-demo-151-to-152/05-release-and-build.md:5,28`, are:

**Cut a release** — `platform/cli/template-release.ts:1-52`:
```
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/template-release.ts <templateId>@<major>
```
Argument parsing (`template-release.ts:14-21`): `process.argv[2]` must match
`/^([a-z0-9]+(?:-[a-z0-9]+)*)@(\d+)$/` (`templateId@major`); on mismatch it prints
`usage: pnpm template:release <templateId>@<major>   e.g. interior-01@1` and `process.exit(2)`
(`template-release.ts:15-19`). No other flags exist. Example for this repo:
`interior-01@1`. It reads `manifest.version` from `templates/<templateId>/v<major>/template.ts`
(`template-release.ts:31-33`) — the CLI does not take a version argument; the version is whatever
`template.ts` currently declares.

**Re-pin a site**: there is **no dedicated re-pin CLI**. `git show a2500f9 -- data/sites/boost-interior-demo/site.json`
shows the only precedent: a direct hand-edit of the `template` object inside
`data/sites/<siteId>/site.json` (schema: `platform/site/instance.ts:60-73` `TemplateReleasePinSchema`,
doc comment "Exact immutable Template Release pin. Never 'latest in major'.", `instance.ts:61`):
```json
"template": {
  "templateId": "interior-01",
  "templateVersion": "1.5.2",
  "releaseId": "interior-01-1.5.2-d87807590d64",
  "releaseHash": "d87807590d64ea7901b226d43526795793805527647313ee4af22f8511577a08"
}
```
`TemplateReleasePinSchema` (`instance.ts:66-73`) validates the 4 fields are internally consistent
(`releaseId === templateId-templateVersion-releaseHash[0:12]`) but there is no code that writes
this object other than a human/agent edit of `site.json`.

**Rebuild the re-pinned site** — `platform/cli/site-build.ts:1-20`:
```
./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/cli/site-build.ts <siteId> [--mode public|preview] [--at ISO] [--release <releaseId>] [--force] [--keep-workspace]
```
Argument parsing (`site-build.ts:7-20`): `siteId` is the first bare (non-flag, non-flag-value)
token; `--mode` (`public|preview`, default `public`, validated by `BuildModeSchema`), `--at` (ISO
timestamp, default now), `--release <releaseId>`, `--force`, `--keep-workspace` are the only
recognised flags (`site-build.ts:9-16`). `--release`, per `platform/build/site-build.ts:106-108,168-171`,
is **not** an upgrade mechanism — `prepareSiteInput()` throws
`` `release mismatch: site "${siteId}" is pinned to ${pin.releaseId}; refusing to build with
${opts.releaseId} (upgrade the pin explicitly)` `` (`build/site-build.ts:169-172`) if it disagrees
with the site's own pin in `site.json`. Its only use is to fail loud if the pin drifted underneath
the caller. Confirmed literally run for the 1.5.2 cut:
```
tsx platform/cli/site-build.ts boost-interior-demo --release interior-01-1.5.2-d87807590d64
```
(`docs/result/outreach-demo-151-to-152/05-release-and-build.md:28`).

Both scripts print machine-readable JSON to stdout (`template-release.ts:37-52`,
`site-build.ts:33-57`) and a non-zero `process.exit` on failure.

---

## 3. Version numbering

**`1.5.2` is authored, not derived**, as a plain string field:
`templates/interior-01/v1/template.ts:89` — `version: "1.5.2"` inside the `defineTemplate({...})`
call. `TemplateManifest.version: string` (`platform/site/template-manifest.ts:30`) has no format
constraint at the manifest-type level. Format IS constrained downstream:
- `TemplateReleasePinSchema.templateVersion` requires `/^\d+\.\d+\.\d+$/` (`instance.ts:66`);
- `createRelease()` requires `templateVersion.startsWith(`${major}.`)` (`release.ts:335-337`), i.e.
  the version's major must match the `@<major>` argument (`1` for `interior-01@1`).

There is **no monotonicity check** anywhere in `release.ts`/`template-release.ts`: nothing prevents
authoring `version: "1.5.1"` again, or a non-increasing number, for different file content — the
resulting `releaseId` would simply carry a different hash suffix. Choosing the next version number
correctly is entirely a human/author judgment call recorded only in prose.

**`d87807590d64` is fully derived**: `releaseHash.slice(0, 12)` (`release.ts:365`), where
`releaseHash = computeReleaseHash({...})` (`release.ts:364,96-104`) — the sha256-based
`hashJson` of `{templateId, templateVersion, forbiddenTerms, gates, files}`. It cannot be chosen; it
falls out of the file bytes + version + forbidden terms + gate results.

**Release history**: `data/template-releases/interior-01/` (git-tracked, `.gitignore:80,83`
un-ignores it) is the literal, complete history — 12 entries currently:
```
interior-01-1.0.0-1ddf327cb1b9   interior-01-1.0.0-f27823c3b837   interior-01-1.1.0-512e4dd932b4
interior-01-1.2.0-93fb66acda7d   interior-01-1.3.0-74a70c276f35   interior-01-1.3.1-bd4ae8fb1769
interior-01-1.4.0-9e1ea20da947   interior-01-1.4.1-59179ca20368   interior-01-1.4.2-a223ccd0759c
interior-01-1.5.0-75f173939e77  interior-01-1.5.1-6bbdd07eb9bf   interior-01-1.5.2-d87807590d64
```
(two `1.0.0` entries with different hashes exist — an early re-cut before/without a version bump).
A parallel, human-readable changelog lives as one JSDoc paragraph per version directly above
`defineTemplate(...)` in `templates/interior-01/v1/template.ts` (one paragraph each for 1.1.0 through
1.5.2, e.g. the 1.5.2 paragraph at `template.ts:~76-86` — "Public demo SEO" — states exactly what
changed and why it is additive).

**Next release**: would be `interior-01-<next-version>-<newhash12>`, major still `1` (same
`templates/interior-01/v1/` directory / same `@1` argument) unless a `v2` directory were created.
The version string itself (e.g. `1.5.3` vs `1.6.0`) is an authoring decision to be written into
`template.ts`'s `version:` field and its own changelog paragraph, following the pattern of the 11
prior bumps; nothing in the code chooses it.

---

## 4. What re-pinning touches — full reference list

**The pin itself**: `data/sites/<siteId>/site.json`, the `.template` object
(`templateId, templateVersion, releaseId, releaseHash`) — schema
`platform/site/instance.ts:60-73`. Confirmed as the sole edit target by `git show a2500f9 --
data/sites/boost-interior-demo/site.json` (diff shown in §2).

**Everything else in the repo that names a release id/hash**, found by
`grep -rl "interior-01-1\.5\.[12]\|d87807590d64\|6bbdd07eb9bf" .` (excluding
`data/template-releases/` itself, which is the store, not a reference):

| File | What it is |
|---|---|
| `data/sites/boost-interior-demo/site.json` | the pin (the thing re-pinning edits) |
| `data/sites/{fixture-large,fixture-small,fixture-empty}/site.json` | their OWN pins (1.5.1/older) — untouched by a demo-only re-pin |
| `data/site-builds/boost-interior-demo/packages/<buildInputId>/build-record.json` (multiple dirs) | each build's `record.template.{releaseId,releaseHash,templateSourceHash}` (`platform/build/site-build.ts:71`) — historical, not live-mutated |
| `data/site-builds/{fixture-*}/packages/**/build-record.json` | same, for fixtures |
| `platform/test/integration.test.ts:75-77` | `LIVE_BUILD_INPUT_ID`, `LIVE_PACKAGE_HASH`, `RELEASE_152` — hard-coded constants, asserted in G4/I1/I2 (see §5) |
| `platform/test/ia151.test.ts:31` | `RELEASE_150 = "interior-01-1.5.0-75f173939e77"` |
| `platform/test/ia152.test.ts:38` | `RELEASE_151 = "interior-01-1.5.1-6bbdd07eb9bf"` |
| `workers/recon-runtime/src/contract.ts:49,75` | `PackageRef.releaseId` / `PackageSeal.releaseId` — the TYPE that flows into the published R2 seal and routing pointer (not a literal value) |
| `platform/publish/publish.ts:262,304,411` | build/publish-plan code that copies `record.template.releaseId` into the routing pointer / seal it writes |
| `docs/result/outreach-demo-151-to-152/*.md`, `docs/result/cloudflare-live-pilot/*.md`, `docs/result/static-deployment-foundation/*.md`, `docs/result/first-party-integration-producer/*.md`, `docs/result/recon-template-platform-ia-final/*.md`, `docs/reports/integration/*.md` (several) | historical report prose quoting the id/hash — informational, not read by code |
| `docs/result/cloudflare-live-pilot/proof/final-pointer.json` | a **local saved copy** of the routing pointer that was actually published to R2 for `interior-demo.boostweb.co.kr`, carrying `"releaseId": "interior-01-1.5.2-d87807590d64"` — the live external record |
| `docs/result/outreach-demo-151-to-152/proof/before.json`, `docs/result/recon-template-platform-ia-final/proof/logs/release.json`, `docs/result/static-deployment-foundation/proof-151/logs/release.json` | captured-state fixtures used by tests' "nothing else moved" baseline checks |

Not found anywhere: any reference to a release id/hash inside `scripts/**` or any other
`workers/**` file (`grep -rl` over `scripts/ workers/ platform/` only matched the three test files
above under `platform/`).

**Published pointer mechanics** (for completeness, since Q4 asks what a pointer is):
`workers/recon-runtime/src/contract.ts:1-17` describes the R2 layout —
`routing/<hostname>.json` (`RoutingPointer`, `contract.ts:54-59`) and
`sites/<siteId>/packages/<packageHash>/_package.json` (`PackageSeal`, `contract.ts:69-79`) both carry
`releaseId`. These are written only by `platform/cli/site-publish.ts` → `publishSite()`
(`platform/publish/publish.ts`), a separate, explicit step from cutting a release or editing
`site.json`.

---

## 5. Blast radius — tests that assert on the current release id/hash/bytes

**Hard, unconditional, would need re-baselining after a re-pin + rebuild of `boost-interior-demo`:**

- `platform/test/integration.test.ts:1197-1204` (**I1**) —
  `eq([site.template.releaseId, site.template.releaseHash], [RELEASE_152, "d87807590d64ea..."], "pin")`
  reads `data/sites/boost-interior-demo/site.json` live and compares to the literal constant
  `RELEASE_152` (line 77). Breaks the moment `site.json`'s pin changes.
- `platform/test/integration.test.ts:1205-1213` (**I2**) —
  `eq(goldenRecord.template.releaseHash, rel.releaseHash, "golden built from 1.5.2")` and a
  `stableStringify` equality against a literal object naming `templateVersion: "1.5.2"` /
  `releaseId: RELEASE_152` (line 1212). `goldenRecord` is the demo's **current** package's
  `build-record.json` (`integration.test.ts:208-209`, `packageOf(repoRoot, DEMO)`), so it changes
  the moment the demo is rebuilt against a new release.
- `platform/test/integration.test.ts:1003-1010` (**G4**) — asserts the package directory
  `data/site-builds/boost-interior-demo/packages/<LIVE_BUILD_INPUT_ID>/` is intact and that
  `data/site-builds/boost-interior-demo/previous.json` still points at `LIVE_BUILD_INPUT_ID`
  (line 75). `buildSite()` keeps only `current` + `previous`, pruning older packages
  (`platform/build/site-build.ts` build-record doc comment, step 7; behaviour recorded in
  `docs/result/outreach-demo-151-to-152/03-release-pinning.md:53-58`). Rebuilding the demo again
  rotates `current→previous`, and **this specific package can be pruned out of the working tree
  entirely** (it would become the *third* most recent), which breaks G4 outright, not just its
  expected value.
- `platform/test/integration.test.ts:1214-1223` (**I2b**) — already `skip()`-ped, with the TODO
  literally describing this recon's situation (quoted in the header above). This is the one check
  that already, correctly, anticipates the need to re-cut.

**Guarded / self-adapting, unlikely to need changes** (their own tests were written pin-aware):
- `platform/test/ia152.test.ts` gates its point-in-time assertions on
  `const atCut = pin.templateVersion === "1.5.2"` (`ia152.test.ts:129`) and otherwise uses
  `versionAtLeast(...)` (`ia152.test.ts:69,138,165,187`); `RELEASE_151` (`ia152.test.ts:38`) is
  only compared against **fixture** pins, which a demo-only re-pin does not move.
- `platform/test/ia151.test.ts` has the analogous `if (pin.templateVersion !== "1.5.1") return;`
  point-in-time guards (`ia151.test.ts:160,170,189`) around its own `RELEASE_150` comparisons
  (`ia151.test.ts:31,164`).
- `platform/test/integration.test.ts:1162-1179` (**R1**) uses `RELEASE_152` only as a synthetic
  input value baked into a hand-constructed `RoutingPointer` object for a pure Worker-routing unit
  test — it is not compared against any file on disk, so it would keep passing (with a stale label)
  rather than fail.

**Byte-count / doc-version constants already broken independent of a re-pin** (pre-existing,
`TODO(v0.2-data)`, `skip()`-ped): `DEMO_VERSION`, `DEMO_DOC_BYTES` (5292), `DEMO_MANIFEST_BYTES`
(274), `EMPTY_VERSION`, `TWO_RECORD_VERSION` (`integration.test.ts:85-90`) feed the `skip()`-ped
checks G1, G2, G3, G5, T3(-ish), and I2b's sibling TODOs (`integration.test.ts:266,285,895,957,974,
992,1011,1032,1066`) — these are already acknowledged stale by the current uncommitted work and
would be recomputed together with the golden-package rebuild, not as a new consequence of the
release cut itself.

**`platform/test/step6.test.ts:228-247` (D2)** — "no Template / Platform implementation file
(test/ excluded) was modified after the [pinned] release was cut" — uses `gitDirtyPaths()`
(`platform/test/git-checkout.ts:15-28`, `git status --porcelain`) restricted to
`templates/interior-01/v1` and `platform`, excluding `test/`, the publish surface and
`platform/test/integration-surface.ts:22-29`'s `isIntegrationSurface()` list (`integration/`,
`build/declared-routes.ts`, `build/build-input.ts`, `build/site-build.ts`, `site/load.ts`,
`publish/publish.ts`). **`platform/content/schema.ts` is not in that exclusion list.** Given the
current git status (`schema.ts` modified, uncommitted), this check would flag `schema.ts`'s mtime as
"late" relative to any pinned release's cut time — this is a currently-true fact about the working
tree, independent of whether/when a new release gets cut (see §7).

---

## 6. Irreversibility

- **Cutting a release is purely additive and purely local.** `createRelease()`
  (`release.ts:326-404`) only ever writes a brand-new directory under
  `data/template-releases/<templateId>/<releaseId>/` (`release.ts:391-403`); it never deletes,
  overwrites or touches any other stored release. If the target `releaseId` already exists,
  it *verifies and reuses* it (`release.ts:368-376`) rather than re-creating; if the same
  `releaseId` exists with a **different** hash it refuses
  (`` `release ${releaseId} exists with a different hash — refusing to overwrite` ``,
  `release.ts:371-373`). Neither `release.ts` nor `template-release.ts` makes any network call
  (no `fetch`, no `wrangler`, no git push) — every write is under `data/template-releases/`.
- **Re-pinning (`site.json` edit) is a local, reversible edit** of one JSON file, validated only by
  `TemplateReleasePinSchema` (`instance.ts:60-73`) — no code enforces "cannot go back."
  **Re-pinning back to `1.5.2` is possible**: `interior-01-1.5.2-d87807590d64`'s stored release
  directory is never deleted by any code path (release dirs are never pruned — only
  `data/site-builds/**/packages/*` are), so restoring the four `template.*` fields in `site.json`
  to the 1.5.2 values and re-running `site:build` would `loadRelease`+`verifyRelease` the same
  bytes (`build/site-build.ts:168-176`) and rebuild successfully.
- **Rebuilding after a re-pin is the destructive-ish part, and it is a *working-tree* deletion, not
  a release deletion.** `buildSite()` keeps exactly `current` + `previous` under
  `data/site-builds/<siteId>/packages/` and prunes older packages
  (`docs/result/outreach-demo-151-to-152/03-release-pinning.md:53-58`, "정상적인 current/previous
  동작"). Since `data/site-builds/**` is git-tracked (`.gitignore:79,82`), a pruned package is
  recoverable from git history (as `03-release-pinning.md:56` notes for the pruned 1.5.0 package,
  still present at commit `14c49a6`) but is gone from the live working tree — which is exactly what
  breaks `integration.test.ts` G4 (§5).
- **Nothing is published externally by cutting a release or by editing `site.json` or by running
  `site:build`.** All three write only to the local filesystem
  (`data/template-releases/**`, `data/sites/**/site.json`, `data/site-builds/**`). Publishing to the
  live bucket/routing is a distinct, explicit step — `platform/cli/site-publish.ts` → `publishSite()`
  — and even that refuses a `--remote` write unless `RECON_PUBLISH_ALLOW_REMOTE=1` is set
  (`platform/cli/site-publish.ts:79-82`). A live pointer already exists from a prior task
  (`docs/result/cloudflare-live-pilot/proof/final-pointer.json`, `"releaseId":
  "interior-01-1.5.2-d87807590d64"`, serving `interior-demo.boostweb.co.kr`), but cutting a *new*
  release does not touch it; only a subsequent `site:publish --remote` run would.

## 6-line answer
**Cutting a release: additive-only, local-only files under `data/template-releases/`. Re-pinning
back to 1.5.2 is possible (its release directory is never deleted). Rebuilding after a re-pin prunes
old `data/site-builds/**/packages/*` from the working tree (recoverable via git history, not live).
Nothing is published externally by any of this — only an explicit, separately-gated
`site:publish --remote` touches the live bucket/routing.**

---

## 7. Preconditions

- **`template-release.ts`/`release.ts` require no clean git tree.** They read files directly off
  disk (`collectReleaseSources`, `release.ts:71-86`) with zero `git` calls anywhere in
  `platform/release/release.ts` or `platform/cli/template-release.ts` (confirmed: no `git`/`execSync`
  usage in either file). A dirty working tree is exactly what gets snapshotted.
- **No passing-test-suite requirement is enforced by the release/build CLIs themselves.** Nothing in
  `createRelease()` or `buildSite()` shells out to `test:platform` or checks any test-result file.
  (Whether a *human* policy requires it first is outside what the code enforces — CLAUDE.md §9/§12
  in this repo is a human/agent workflow rule, not something `template-release.ts` reads.)
- **`provenance.json` is read, never written, by the cut.** `createRelease()` reads
  `templates/<id>/v<major>/provenance.json` once, for `forbiddenTerms`
  (`release.ts:339-340`), and that file is explicitly excluded from the snapshot itself
  (`TEMPLATE_EXCLUDE`, `release.ts:50`, doc comment at `release.ts:36` "Frozen from provenance.json
  at release time; builds never read provenance."). Cutting a release does **not** require editing
  `templates/interior-01/v1/provenance.json` unless the *forbidden-terms list itself* needs to
  change; it is otherwise untouched by the cut.
- **What actually would block/complicate a cut right now, given the current uncommitted diff:**
  1. `platform/content/schema.ts` is a release source and is currently modified — this is *the*
     reason a new release is needed at all (§ header), not a blocker to cutting one.
  2. `template.ts:89`'s `version: "1.5.2"` has not been bumped yet — cutting today with the
     unbumped version would either reuse/verify the existing `interior-01-1.5.2-d87807590d64`
     release (if content hashed identically, which it won't since `schema.ts` changed) or create a
     **second** `interior-01-1.5.2-<newhash12>` release under the same version number (allowed by
     the code — no monotonicity check, §3) — an authoring decision must set a new `version` string
     before running `template-release.ts` if a distinct, correctly-labelled release is wanted.
  3. `platform/test/step6.test.ts:228-247` (D2) would currently flag `platform/content/schema.ts`
     as "modified after the release cut" against **every** stored release's cut time, because
     `schema.ts` is dirty in git and not in `isIntegrationSurface()`'s exclusion list
     (`platform/test/integration-surface.ts:22-29`) — this is a fact about the present working tree,
     independent of cutting a new release (based on reading the check's logic against the actual
     `git status`, not from an executed test run — no test suite was run for this recon).
  4. `platform/integration/{contract,emit,validate}.ts` and `platform/test/integration.test.ts` are
     also modified, but `integration/**` and `test/**` are both excluded from D2's scan
     (`integration-surface.ts:22-29`'s `rel.startsWith("integration/")`, and `step6.test.ts:241`'s
     `f.startsWith("test/")`), so they don't add to that particular blast radius.
