# 23 — Template Release 1.6.0 cut + demo re-pin (2026-09-24)

Scope: bump `templates/interior-01/v1/template.ts` to `1.6.0`, cut the release with the project's
own CLI, re-pin `boost-interior-demo`, verify. Procedure followed:
[`09-release-repin-recon.md`](09-release-repin-recon.md).

**Outcome: the cut and the re-pin SUCCEEDED. The verification is RED and was left red on purpose.**
`I2b` still skips and three checks (`B2`, `B4`, `I1`) now fail. All four are pin-baseline
constants in `platform/test/integration.test.ts`, exactly the re-baselining the recon predicted in
§5. Per the task's stop rule, **no test file was edited** — nothing was forced green. §7 states what
the re-baseline needs.

---

## 1. Preconditions confirmed

| # | Claim (recon) | Verified how | Result |
|---|---|---|---|
| P1 | Release sources = `templates/<id>/v<major>/**` (minus `TEMPLATE_EXCLUDE`) + `platform/{content,settings,theme,assets,slots,site}/**` (minus `site/load.ts`) + `platform/tsconfig.json` + `package.json`/`pnpm-lock.yaml` from `platform/runtime/` | read `platform/release/release.ts:50-53,71-86` (`TEMPLATE_EXCLUDE`, `PLATFORM_RUNTIME_DIRS`, `PLATFORM_RUNTIME_EXCLUDE`, `collectReleaseSources`) | CONFIRMED, verbatim |
| P2 | `platform/content/schema.ts` IS a release source | `content` ∈ `PLATFORM_RUNTIME_DIRS`; present in 1.5.2's `files[]` | CONFIRMED |
| P3 | `platform/integration/**` is NOT release-collected | `integration` ∉ `PLATFORM_RUNTIME_DIRS`; `release.json` of 1.5.2 has **0** files whose path contains `integration`. Top-level prefixes in 1.5.2: `templates/interior-01`, `platform/{assets,content,settings,site,slots,theme}`, `platform/tsconfig.json`, `package.json`, `pnpm-lock.yaml` — nothing else | CONFIRMED |
| P4 | Demo pinned to 1.5.2 | `data/sites/boost-interior-demo/site.json` `.template` = `{interior-01, 1.5.2, interior-01-1.5.2-d87807590d64, d87807590d64ea…}` | CONFIRMED |
| P5 | Cutting is additive-only, never rewrites a stored release | `createRelease` (`release.ts:326-404`) writes `<dir>.tmp-<pid>` then `rename`s it into a **new** `releaseId` dir; if the id exists with a different hash it throws `refusing to overwrite`; it never deletes or opens another release dir | CONFIRMED |
| P6 | `template:release` is the cut CLI; it takes no version argument | `platform/cli/template-release.ts:14-21,31-33` — `process.argv[2]` must match `templateId@major`; the version is read from `template.ts`'s `manifest.version` | CONFIRMED |
| P7 | No clean git tree required; the dirty working tree is what gets snapshotted | no `git`/`execSync` anywhere in `release.ts` or `template-release.ts`; `collectReleaseSources` reads the filesystem | CONFIRMED |

### Scripts inspected before running (task input 3)

| Script | What it actually is | Used here |
|---|---|---|
| `template:release` | `tsx platform/cli/template-release.ts` → `createRelease()` → `data/template-releases/**`. **This is the Template Release cut.** | YES |
| `site:build` | `tsx platform/cli/site-build.ts` → `buildSite()` → `data/site-builds/**`. `--release` is a *guard*, not an upgrade mechanism (`platform/build/site-build.ts:169-172` throws on mismatch). | NO — see §5 |
| `release:prepare` / `release:plan` / `release:resolve` / `release:build` | `tsx src/cli-release-*.ts` → `src/release/index.js`, operating on `data/<host>/release-projects/<projectId>/` (Task 23/27 "release project": requirement collection, operator checklist, selective rebuild). **A different subsystem entirely — nothing to do with `data/template-releases/`.** | NO — not applicable |
| `typecheck:platform` | `tsc -p platform/tsconfig.json` | YES |
| `test:integration` | `tsx platform/test/integration.test.ts` | YES |

---

## 2. Baseline captured BEFORE any change

```
data/template-releases/interior-01/  → 12 releases
1.5.2 releaseHash          d87807590d64ea7901b226d43526795793805527647313ee4af22f8511577a08
1.5.2 templateSourceHash   2f675577f95459c38c4399300014a25271363d3ecbfbf88100e095417d5e19c3
1.5.2 createdAt            2026-09-22T05:31:40.348Z   (63 files)
sha256(1.5.2/release.json) 83c521c570daebcaee430eb1a9e248fc93454256a67a16fdc79a893328878b61
digest(whole 1.5.2 dir)    97772b85c24495bfd6236a7af8467f766468a3ca1c47c32483abdceac5d9e208
      (= shasum -a 256 of every file under the dir, sorted, hashed again)

npm run typecheck:platform   → exit 0, no output
npm run test:integration     → exit 0 — 60 passed, 0 failed, 10 skipped
      I1  ok      I2  ok      I2b  SKIP
```

---

## 3. Commands run, in order

**1. Version bump** — `templates/interior-01/v1/template.ts`
`version: "1.5.2"` → `version: "1.6.0"`, plus a `1.6.0` changelog paragraph in the JSDoc block
above `defineTemplate(...)`, following the 1.1.0–1.5.2 pattern. Minor, not patch: the release's
*authorable surface* grew (five optional `ProjectSchema` fields + `INV-28/29/30`), with no renderer,
route, section, slot or settings change — a 1.5.2 site document that authors none of the new fields
is still valid and produces byte-identical output.

**2. Cut**
```
npm run template:release -- interior-01@1
```
```json
{
  "status": "created",
  "templateId": "interior-01",
  "templateVersion": "1.6.0",
  "releaseId": "interior-01-1.6.0-e65795202191",
  "releaseHash": "e657952021911f2c2fabc22e41c32f50d3fa79e0116fbd8b0560058c908ef034",
  "templateSourceHash": "f99f68c1e388da733e6fa5c847eb5eb960f9566e4abc44b27d576c4c8c0b4086",
  "files": 65,
  "dir": "data/template-releases/interior-01/interior-01-1.6.0-e65795202191"
}
```
exit 0. Both gates recorded `pass: true` (`source-isolation`: 65 files scanned for 9 forbidden
terms; `template-code-rules`: allowlist clean). `createdAt` `2026-09-24T11:44:16.868Z`;
`release.json` written `0444`. `data/template-releases/interior-01/` now holds **13** releases.

**3. 1.5.2 immutability re-checked immediately after the cut** — see §4.

**4. Re-pin** — `data/sites/boost-interior-demo/site.json`, the `.template` object only (the recon's
procedure: a direct edit, there is no re-pin CLI):
```diff
-    "templateVersion": "1.5.2",
-    "releaseId": "interior-01-1.5.2-d87807590d64",
-    "releaseHash": "d87807590d64ea7901b226d43526795793805527647313ee4af22f8511577a08"
+    "templateVersion": "1.6.0",
+    "releaseId": "interior-01-1.6.0-e65795202191",
+    "releaseHash": "e657952021911f2c2fabc22e41c32f50d3fa79e0116fbd8b0560058c908ef034"
```
`TemplateReleasePinSchema`'s consistency rule re-checked by hand:
`releaseId === templateId-templateVersion-releaseHash[0:12]` → true.

**5. `npm run typecheck:platform`** → exit 0.
**6. `npm run test:integration`** → exit 1 — see §6.

Files this task changed: `templates/interior-01/v1/template.ts`,
`data/sites/boost-interior-demo/site.json`, and the new
`data/template-releases/interior-01/interior-01-1.6.0-e65795202191/`. Nothing else in the working
tree was touched; the owner's other uncommitted files are as they were. No git command was run.

---

## 4. Before / after hashes

### 1.5.2 — UNCHANGED (the point of the check)

| | before the cut | after the cut | after the re-pin + test run |
|---|---|---|---|
| `sha256(release.json)` | `83c521c570daebcaee430eb1a9e248fc93454256a67a16fdc79a893328878b61` | identical | identical |
| recursive dir digest | `97772b85c24495bfd6236a7af8467f766468a3ca1c47c32483abdceac5d9e208` | identical | identical |
| `releaseHash` in the record | `d87807590d64ea…77a08` | identical | identical |

Independently, `I1`'s `verifyRelease` loop ran over all **13** stored releases without throwing
before it reached its failing assertion (§6), so 1.5.2 also still passes the platform's own
four-part integrity check (file set, per-file sha256, `releaseHash`, `templateSourceHash`).

### 1.6.0 — new

| | value |
|---|---|
| `releaseId` | `interior-01-1.6.0-e65795202191` |
| `releaseHash` | `e657952021911f2c2fabc22e41c32f50d3fa79e0116fbd8b0560058c908ef034` |
| `templateSourceHash` | `f99f68c1e388da733e6fa5c847eb5eb960f9566e4abc44b27d576c4c8c0b4086` |
| files | 65 (1.5.2 had 63) |

Content delta 1.5.2 → 1.6.0 (from the two `release.json` file tables):

- **added (2):** `platform/site/head-scripts.ts`, `templates/interior-01/v1/app/head-scripts.ts`
- **removed:** none
- **changed (5):** `platform/content/schema.ts`, `platform/site/context.ts`,
  `platform/site/instance.ts`, `templates/interior-01/v1/app/layout.tsx`,
  `templates/interior-01/v1/template.ts`

---

## 5. Drift from the recon

**D1 — the cut carries more than the V0.2 schema change. This is the material one.**
The recon's precondition list (§7) names only `platform/content/schema.ts` as the dirty release
source. At cut time the working tree had **seven** dirty release-source paths, listed above: besides
`schema.ts` and the `template.ts` bump this task made, the cut also snapshotted the owner's
in-progress **widget-seam / head-scripts** work (`platform/site/head-scripts.ts`,
`templates/interior-01/v1/app/head-scripts.ts`, `platform/site/context.ts`,
`platform/site/instance.ts`, `templates/interior-01/v1/app/layout.tsx`; cf. the untracked
`docs/result/static-deployment-foundation/widget-seam/`). This is not a malfunction — `release.ts`
has no git awareness and the recon itself says "a dirty working tree is exactly what gets
snapshotted" (§7) — but it means **1.6.0 is not a pure "V0.2 schema annex" release**, and the
changelog paragraph in `template.ts`, which describes only the content-model change, understates
it. `platform/site/load.ts` (also dirty) is excluded by `PLATFORM_RUNTIME_EXCLUDE` and did not enter
the release. Owner decision needed: accept 1.6.0 as-is and extend its changelog paragraph, or
re-cut from a tree where the widget-seam work is finished.

**D2 — the recon's blast-radius list (§5) is incomplete.**
It named `I1`, `I2`, `G4` and `I2b`. Re-pinning also broke `B2` and `B4`
(`integration.test.ts:948,970`), which assert `computeBuildInputId(...) === LIVE_BUILD_INPUT_ID` —
the release hash is a build-input part, so the pin move changes the derived id. `G4` did **not**
break (it only fails on a *rebuild*, which was not run). `I2` did not break either, for the same
reason: it compares against the golden `build-record.json` on disk, which a re-pin alone does not
move.

**D3 — `I2b` cannot un-skip by itself.** The recon calls `I2b` "already `skip()`-ped … the one check
that already, correctly, anticipates the need to re-cut", which is accurate but easy to read as "it
will start running once the release is cut". It will not. `skip()`
(`integration.test.ts:112-115`) is an unconditional call that pushes a string and **never invokes
its body** — there is no version guard. Worse, the body is hard-pinned to `RELEASE_152`
(`const rel = await loadRelease(repoRoot, "interior-01", RELEASE_152)`) and asserts the working tree
hashes to **1.5.2**, which is now permanently false and cannot be made true by any cut. Un-skipping
`I2b` is therefore a deliberate test edit, not a consequence of this task.

**No other drift.** Every file:line the recon cited matched what is on disk; the CLI's argument
parsing, output shape, exit codes, gate names and on-disk layout were exactly as described.

---

## 6. Verification results

### 6.1 `npm run typecheck:platform` — **PASS**
exit 0, no diagnostics. (Same as the baseline, so the bump and the re-pin introduced no type error.)

### 6.2 `npm run test:integration` — **FAIL (exit 1)**

```
57 passed, 3 failed, 10 skipped        (baseline: 60 passed, 0 failed, 10 skipped)
```

The 10 skips are unchanged from the baseline — the same `TODO(v0.2-data)` set (`E1b`, `E2b`, `B2b`,
`G1`, `G2`, `G3`, `G5`, `T1`, `T3`) plus `I2b`. Nothing newly skipped, nothing newly un-skipped.

The 3 failures, all of them pin-derived expected-value constants:

```
FAIL I1 every stored release verifies; the demo is pinned to 1.5.2 and that release's hash is unchanged
     pin: ["interior-01-1.6.0-e65795202191","e657952021911f2c2fabc22e41c32f50d3fa79e0116fbd8b0560058c908ef034"]
        ≠ ["interior-01-1.5.2-d87807590d64","d87807590d64ea7901b226d43526795793805527647313ee4af22f8511577a08"]

FAIL B2 the demo is ON: emit true, integrationInputHash = hash(producer, contract, config) with the
        V0.2 contract pair, and the V0.2 producer's identity ≠ the V0 one ≠ the live package
     without the integration part = the live package's identity:
       "6e6443a6876bbb474521600c1fc7776cd4fa278074b483817706435a574dec0c"
     ≠ "18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f"

FAIL B4 OFF = the pre-integration identity: the demo without integration.json (or enabled:false)
        has exactly the LIVE package's buildInputId
     absent: identity:
       "6e6443a6876bbb474521600c1fc7776cd4fa278074b483817706435a574dec0c"
     ≠ "18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f"
```

**`I1` — partially.** Its first and load-bearing half, *"every stored release verifies"*
(`ids.length >= 12 && ids.includes(RELEASE_152)`, then `verifyRelease` over every id), **passed**
for all 13 releases including 1.5.2 — execution reached the later assertion, which is the proof the
loop threw nothing. What failed is the *second* half, the literal `[RELEASE_152, "d878…"]` pin
comparison, which the re-pin invalidated by design.

**`B2`/`B4`** are the same single fact twice: `LIVE_BUILD_INPUT_ID` is a frozen constant derived
from the 1.5.2 pin, and the pin moved. Both failures are stale expected values, not rule violations.

### 6.3 `I2b` status — **STILL SKIPPED**

Verbatim, unchanged from the baseline:
```
SKIP I2b the working tree still equals the pinned 1.5.2 release
     TODO(v0.2-release): NOT a data problem. `platform/content/` is a Template Release runtime
     source, and the V0.2 authored fields … so the working tree no longer hashes to release 1.5.2.
```
Cause: D3 above — unconditional `skip()`, and a body hard-pinned to `RELEASE_152`.

### 6.4 1.5.2 hash — **UNCHANGED**
Both digests in §4 are byte-identical before and after. No stored release was modified or deleted;
the only write under `data/template-releases/` was the new `interior-01-1.6.0-e65795202191/` dir.

---

## 7. Stopping here, and what the next task needs

The task's rule — *"If `I2b` still skips, or a new test fails, do not force it green. Report the
failure with its output and stop"* — applies. `platform/test/integration.test.ts` was **not**
edited: no assertion was weakened, deleted or skipped, and no constant was silently re-baselined.

The blocker this task existed to remove **is removed**: release `interior-01-1.6.0-e65795202191`
exists, verifies, carries the V0.2 `ProjectSchema`, and `boost-interior-demo` is pinned to it — so
a V0.2 field authored into `data/sites/**` will now validate in the build workspace.

What remains, for an owner decision (none of it done here):

1. **Decide on D1** — accept 1.6.0 with the widget-seam work inside it (and widen the changelog
   paragraph accordingly), or re-cut once that work settles. Everything below depends on this.
2. **Re-baseline four constants** in `platform/test/integration.test.ts`, preserving every rule:
   `RELEASE_152` → the new release for `I1`'s pin half, and `LIVE_BUILD_INPUT_ID` for `B2`/`B4`.
   `I1`'s "1.5.2's hash is unchanged" guarantee should be *kept* as its own assertion rather than
   dropped with the pin literal — it is the immutability check, and it still holds.
3. **Un-skip `I2b`**: `skip(` → `await check(` and re-target its body from `RELEASE_152` to the new
   release. Only then does it become a live guard ("the working tree still equals the pinned
   release"). It cannot pass against 1.5.2 under any circumstances.
4. **Author the V0.2 fields** in `data/sites/boost-interior-demo/**` — the actual next task.
5. **Then rebuild** (`npm run site:build -- boost-interior-demo`). Deliberately **not** run here:
   `buildSite()` keeps only `current` + `previous` and prunes older packages, and the package it
   would prune is `18c0a5eff5…` — the live Cloudflare-pilot package that `G4` asserts must stay
   intact and that `docs/result/cloudflare-live-pilot/proof/final-pointer.json` records as serving
   `interior-demo.boostweb.co.kr`. Rebuilding is also what clears the nine `TODO(v0.2-data)` skips,
   so it belongs with step 4, not with a release cut.

Nothing was published: no `site:publish`, no `--remote`, no network call. The live pointer still
names `interior-01-1.5.2-d87807590d64`, whose release directory is intact, so re-pinning back to
1.5.2 remains possible exactly as the recon describes (§6).
