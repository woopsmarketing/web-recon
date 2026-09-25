# 25 — Re-baseline of the 1.6.0 pin constants + I2b restored (2026-09-24)

Follows [`23-release-1.6.0-cut.md`](23-release-1.6.0-cut.md) §7.2/§7.3. Scope: the three checks that
the `1.5.2 → 1.6.0` re-pin left failing (`I1`, `B2`, `B4`), and the unconditional `skip()` on `I2b`.
Only `platform/test/integration.test.ts` was edited. No source file, no stored release, no site
document, no git command.

**Outcome: 61 passed / 0 failed / 9 skipped (exit 0), typecheck clean.** Every delta was fully
explained by the re-pin — no residue. One reportable finding about the *contents* of 1.6.0 (§6),
confirmed and left alone.

---

## 1. Step 1 — the deltas, proved before anything was edited

The whole proof rests on one experiment: copy `data/sites/boost-interior-demo/` to a throwaway root,
change **only** `site.json`'s `.template` object back to the 1.5.2 pin, and re-run
`prepareSiteInput()` against it. If the re-pin is the entire delta, the old values must come back
byte-exactly. They do.

### 1.1 What the re-pin moved, part by part

`buildInputId = hashJson({releaseHash, siteSnapshotHash, mode, toolchainHash[, integrationInputHash]})`
(`platform/build/build-input.ts:23-32`).

| build-input part | pin reverted to 1.5.2 | current (1.6.0) | |
|---|---|---|---|
| `releaseHash` | `d87807590d64ea…77a08` | `e657952021911f…ef034` | **MOVED** — it *is* the pin |
| `siteSnapshotHash` | `df04f8775a2d28…64e54` | `918e6ce713ec34…6b589` | **MOVED** — see 1.2 |
| `mode` | `public` | `public` | same |
| `toolchainHash` | `22e72379efb13d…93d1` | `22e72379efb13d…93d1` | same |
| `integrationInputHash` | `2c453f81b19a89…051fc` | `2c453f81b19a89…051fc` | same |

Two parts moved, and both are the pin. `siteSnapshotHash` is not an independent mover: the pin is
*inside* the snapshot (`prepareSiteInput` → `siteSnapshotHash: hashJson(snapshot)`,
`site-build.ts:194`; `SiteSnapshotSchema.site` = the whole site instance, `platform/site/instance.ts:98-128`).

### 1.2 The snapshot delta is exactly three fields, all of them the pin

Full recursive diff of the two snapshots (reverted → current):

```
site.template.templateVersion : "1.5.2"                          -> "1.6.0"
site.template.releaseId       : "interior-01-1.5.2-d87807590d64" -> "interior-01-1.6.0-e65795202191"
site.template.releaseHash     : "d87807590d64ea…77a08"           -> "e657952021911f…ef034"
count: 3
```

Nothing else in the snapshot moved: no content, settings, theme, slots, assets or identity field.
That is the (a)+(b)+(c) test from the task, satisfied exhaustively rather than by sampling.

### 1.3 The old values come back exactly

With the pin reverted and nothing else touched:

```
OFF identity  = 18c0a5eff5abce3fef1cc3f86c0498a3a49dbd03350245eb84e56b46dc60911f  == LIVE_BUILD_INPUT_ID
```

and the live package's own `build-record.json`
(`data/site-builds/boost-interior-demo/packages/18c0a5ef…/build-record.json`) records exactly the
reverted parts — `releaseHash d87807590d64…`, `siteSnapshotHash df04f8775a2d…`, `mode public`,
`toolchainHash 22e72379efb1…`, no integration part. Substituting only `releaseHash` reproduces
nothing (`96e6b6ba66…`); substituting `releaseHash` **and** `siteSnapshotHash` reproduces
`18c0a5ef…` exactly. **Residue: none.**

### 1.4 Per failure: old value, new value, derivation

| # | expectation | old | new | why the new value is what it is |
|---|---|---|---|---|
| `I1` | `[site.template.releaseId, site.template.releaseHash]` | `["interior-01-1.5.2-d87807590d64", "d87807590d64ea…77a08"]` | `["interior-01-1.6.0-e65795202191", "e657952021911f…ef034"]` | The literal *was* a transcription of `site.json`'s pin. The re-pin (23 §3.4) rewrote that object; `releaseId = templateId-templateVersion-releaseHash[0:12]` holds for the new pair (`release.ts:55`, `RELEASE_ID_RE`), and the stored release record for that id carries the same four fields. `I1`'s first half (all 13 releases verify, 1.5.2 among them) never failed. |
| `B2` | `computeBuildInputId({...demo.parts, integrationInputHash: undefined})` | `18c0a5eff5abce…0911f` | `6e6443a6876bbb…dec0c` | = `hashJson` of the four parts in 1.1 with the two pin-derived ones at their 1.6.0 values. Confirmed both ways: recomputed forward from the current pin, and recovered backward by reverting the pin (1.3). Matches the actual reported in 23 §6.2. |
| `B4` | `prepareSiteInput(throwaway root, integration.json absent / disabled).buildInputId` | `18c0a5eff5abce…0911f` | `6e6443a6876bbb…dec0c` | Same single fact as `B2`: an OFF build drops only the integration part, so it lands on the same value. `B2` and `B4` were never two failures. |

---

## 2. Step 2 — what was re-baselined, and whether it is derived or literal

Design rule applied: **a value that describes a frozen artefact stays literal; a value that tracks
the demo's pin is derived from `site.json`.** The next re-pin needs no edit in this file.

### 2.1 New derived inputs (`platform/test/integration.test.ts`, the inputs block)

```ts
const demoPin   = (await readJson(.../data/sites/<DEMO>/site.json)).template;          // the single source of truth
const liveParts = (<live package build-record.json>).parts;                            // the frozen package's own parts
const DEMO_OFF_BUILD_INPUT_ID = computeBuildInputId({ ...liveParts,
  releaseHash:      demo.parts.releaseHash,
  siteSnapshotHash: demo.parts.siteSnapshotHash });
```

`DEMO_OFF_BUILD_INPUT_ID` is **derived**, and deliberately not derived from `demo.parts` alone —
`computeBuildInputId({...demo.parts, integrationInputHash: undefined})` compared against itself
would be a tautology. It is built from the *live package's recorded parts* with exactly the two
parts a re-pin moves replaced by the current input's. So the equality `B2`/`B4` assert still carries
the content "`mode` and `toolchainHash` are still the live build's", and it self-updates on any
future re-pin.

### 2.2 Constants that stay literal (and why)

| constant | value | why literal |
|---|---|---|
| `LIVE_BUILD_INPUT_ID` | `18c0a5eff5abce…0911f` | **unchanged.** It names a directory on disk (`data/site-builds/…/packages/18c0a5ef…`) and the `previous.json` rollback pointer that `G4` asserts is intact. Re-baselining *this* to `6e6443a6…` would have been the wrong fix: it would have broken `G4`, which currently passes. The comment above it now records that it is the 1.5.2-pinned package's identity, no longer the demo's OFF identity. |
| `LIVE_PACKAGE_HASH` | `cd048406311f…5202` | unchanged; same frozen artefact. |
| `RELEASE_152` | `interior-01-1.5.2-d87807590d64` | unchanged; 1.5.2 is still stored and still the golden package's release. |
| `RELEASE_152_HASH` *(new)* | `d87807590d64ea…77a08` | the **immutability golden**. It was previously an inline literal inside `I1`'s pin comparison; it is now named and asserted on its own, which is the point 23 §7.2 makes — that guarantee must survive the pin literal's removal. |
| `LIVE_PIN` *(new)* | the four 1.5.2 pin fields | the pin the live package was built from; used by `B2`'s roll-back assertion. |

### 2.3 The three checks after the edit

**`I1`** — renamed to *"every stored release verifies; 1.5.2's hash is unchanged and the demo's pin
resolves to a stored release"*. The literal pin comparison is replaced by four assertions, none of
them a self-comparison:

- all stored releases still verify (unchanged, `>= 12` floor left as-is — it was not failing);
- `loadRelease(1.5.2).releaseHash === RELEASE_152_HASH` — immutability, literal, kept;
- the pinned `releaseId` is present in `data/template-releases/interior-01/`;
- the stored release record's `{templateId, templateVersion, releaseId, releaseHash}` equal the
  pin's field for field, and `releaseId === templateId-templateVersion-releaseHash[0:12]`.

The last two are the real content: a pin that named a non-existent release, or one whose stored hash
disagreed, or an internally inconsistent pin, all fail.

**`B2`** — line 948's single `eq` became three:

```ts
eq(computeBuildInputId(liveParts), LIVE_BUILD_INPUT_ID, "the live package's recorded parts reproduce its identity");
eq(hashJson({ ...demo.snapshot, site: { ...demo.snapshot.site, template: LIVE_PIN } }), liveParts.siteSnapshotHash,
   "pin rolled back to 1.5.2 → the live package's snapshot hash (no other input moved)");
eq(computeBuildInputId({ ...demo.parts, integrationInputHash: undefined }), DEMO_OFF_BUILD_INPUT_ID,
   "without the integration part = the pre-integration identity of the current pin");
```

The middle one is §1.3's experiment promoted into the suite: it is the standing guard that the pin
remains the *only* delta between today's working data and the live package. Nothing was weakened —
the original claim ("the demo's OFF identity is the live package's") is preserved in the only form
that is still true after a deliberate re-pin.

**`B4`** — `eq(inp.buildInputId, LIVE_BUILD_INPUT_ID)` → `eq(inp.buildInputId, DEMO_OFF_BUILD_INPUT_ID)`;
title amended to "…the pre-integration buildInputId of its current pin (the live package's, modulo
the re-pin — B2)". The throwaway-root build is still independent of `demo.parts`, so the assertion
still has to be earned.

### 2.4 Negative controls (the assertions still bite)

Run against the real inputs, perturbing one thing at a time:

| perturbation | result |
|---|---|
| one release source file's sha flipped | `I2b` hash diverges — fails |
| one release source file removed | `I2b` hash diverges — fails |
| `site.identity.brandName` changed (non-pin field) | `B2` roll-back ≠ live snapshot hash — fails |
| `content.projects[0].title` changed | `B2` roll-back ≠ live snapshot hash — fails |
| `toolchainHash` drifted from the live build's | `DEMO_OFF_BUILD_INPUT_ID` ≠ actual OFF id — fails |
| `mode` drifted | `DEMO_OFF_BUILD_INPUT_ID` ≠ actual OFF id — fails |
| pin version vs. releaseId made inconsistent | `I1` consistency assertion — fails |
| unperturbed | all pass |

---

## 3. Step 3 — `I2b` restored

Its skip message stated its own restoration condition: *"Before any V0.2 field can be AUTHORED in
`data/sites/**`, a new Template Release must be cut"*. 1.6.0 is that release, and the demo is pinned
to it — condition met.

Restored form (`skip(` → `await check(`, body re-targeted from `RELEASE_152` to the pin):

```ts
await check("I2b the working tree still equals the release the demo is pinned to", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", demoPin.releaseId);
  const { sources } = await collectReleaseSources(repoRoot, "interior-01", 1);
  const files: { path: string; sha256: string }[] = [];
  for (const [p, abs] of sources) files.push({ path: p, sha256: sha256(await readFile(abs)) });
  eq(computeReleaseHash({ ...rel, files }), rel.releaseHash, `working tree = ${demoPin.releaseId}`);
});
```

**What it actually asserts.** It re-collects all 65 release sources from the *working tree*
(`templates/interior-01/v1/**` minus `TEMPLATE_EXCLUDE`, `platform/{content,settings,theme,assets,slots,site}/**`
minus `site/load.ts`, `platform/tsconfig.json`, and `package.json`/`pnpm-lock.yaml` from
`platform/runtime/`), hashes every one, and recomputes the release hash from that live file list
against the *stored* release's metadata. It passes only if the tree is byte-identical to the release
the demo is pinned to. It is not a tautology: `rel.releaseHash` is read from the immutable
`release.json` on disk, while `files` is read from the filesystem right now — §2.4 shows that
editing or removing a single source file breaks it. It is also not a no-op: it runs (it is counted
in the 61 passes) and it is the check that will catch the next unnoticed drift between the tree and
the pinned release.

Result: **`ok I2b the working tree still equals the release the demo is pinned to`** — the tree
hashes to `e657952021911f…ef034`, exactly `interior-01-1.6.0-e65795202191`.

The other nine skips were not touched: `E1b`, `E2b`, `B2b`, `G1`, `G2`, `G3`, `G5`, `T1`, `T3` — the
same `TODO(v0.2-data)` set, all waiting on the demo data re-authoring + golden rebuild, not on a
release.

---

## 4. Step 4 — verification

| command | result |
|---|---|
| `npm run typecheck:platform` | **exit 0**, no diagnostics |
| `npm run test:integration` | **exit 0 — 61 passed, 0 failed, 9 skipped** |

Target hit exactly (60 restored + `I2b` now live; skips 10 → 9). Relevant lines:

```
ok   B2 the demo is ON: emit true, integrationInputHash = hash(producer, contract, config) …
ok   B4 OFF = the pre-integration identity: … the pre-integration buildInputId of its current pin …
ok   G4 the live package 18c0a5eff5ab… is untouched (intact, packageHash cd048406311f…) and is the rollback
ok   I1 every stored release verifies; 1.5.2's hash is unchanged and the demo's pin resolves to a stored release
ok   I2 the producer itself is not a release source …, and the golden package was built from the stored 1.5.2 release
ok   I2b the working tree still equals the release the demo is pinned to
61 passed, 0 failed, 9 skipped
```

No assertion was deleted, weakened or narrowed; two were added (`B2`'s live-parts and roll-back
anchors) and one literal was promoted to a named golden (`RELEASE_152_HASH`). Nothing outside the
three named failures and `I2b` was re-baselined. No fourth failure appeared.

Files changed by this task: `platform/test/integration.test.ts` and this document. Nothing else.

---

## 5. Why `LIVE_BUILD_INPUT_ID` was NOT re-baselined — the trap in the brief

The failure text points at `LIVE_BUILD_INPUT_ID`, and the obvious move is to set it to
`6e6443a6876bbb…dec0c`. That would be wrong. The constant has two jobs, and the re-pin only
invalidated one of them:

- `G4` (and `previous.json`, and `G5`) use it as the **name of the live Cloudflare-pilot package
  directory on disk**. That package is 1.5.2's and is untouched — `G4` passes today. Changing the
  constant would have made `G4` look for `packages/6e6443a6…`, which does not exist, turning one
  green check red while three went green.
- `B2`/`B4` used it as a **stand-in for the demo's pre-integration identity** — true only while the
  demo was pinned to the same release the live package was built from. That coincidence ended with
  the re-pin.

Splitting the two roles (`LIVE_BUILD_INPUT_ID` frozen, `DEMO_OFF_BUILD_INPUT_ID` derived) is what
keeps both guarantees. This is the substantive judgement in the task.

---

## 6. Reported, not acted on — what 1.6.0 actually contains

23 §5 D1's claim is **CONFIRMED against the stored snapshot**, not just against the cut log. Read
from `data/template-releases/interior-01/interior-01-1.6.0-e65795202191/release.json` and compared
with 1.5.2's (63 files → 65):

**Added in 1.6.0, absent from 1.5.2 (2):**

- `platform/site/head-scripts.ts`
- `templates/interior-01/v1/app/head-scripts.ts`

**Changed vs 1.5.2 (5), of which four are non-schema:**

- `platform/site/context.ts`
- `platform/site/instance.ts`
- `templates/interior-01/v1/app/layout.tsx`
- `templates/interior-01/v1/template.ts` — the intended `1.5.2 → 1.6.0` version bump + changelog
- `platform/content/schema.ts` — the intended V0.2 `ProjectSchema` annex

**Removed: none.**

So the **non-schema files 1.6.0 carries beyond the intended change** are exactly five:
`platform/site/head-scripts.ts` and `templates/interior-01/v1/app/head-scripts.ts` (both entirely
new to the release), plus `platform/site/context.ts`, `platform/site/instance.ts` and
`templates/interior-01/v1/app/layout.tsx` (changed). Counting `template.ts` as intended
release bookkeeping, that is the widget-seam / head-scripts work and nothing else.

Corroboration: the release stores file bodies under `<releaseDir>/files/`, and
`sha256(<releaseDir>/files/platform/site/head-scripts.ts)` equals the working tree's copy
(`4d14a2b70a02…5700`), likewise `templates/interior-01/v1/app/head-scripts.ts` (`9a73472c1e60…0f68`).
Both are **untracked** in git (`?? …`), and the other three are uncommitted modifications — i.e.
1.6.0 froze in-progress work. `platform/site/load.ts` is also dirty but is excluded by
`PLATFORM_RUNTIME_EXCLUDE` and did not enter the release.

**Consequence for this task: none.** The re-baseline above is correct whatever the owner decides,
because every delta traced back to the pin alone. But note the coupling: `I2b` is now a live guard
that the working tree equals 1.6.0, so **any further edit to a release source — including finishing
the widget-seam work — will make `I2b` fail until a new release is cut and the demo re-pinned.**
That is the intended behaviour of the check (it is what "the working tree still equals the pinned
release" means), not a defect, but it is the next thing that will go red. Nothing was re-cut and
none of those source files was modified.

Owner decision still open, unchanged from 23 §7.1: accept 1.6.0 with the widget-seam work inside it
and widen its changelog paragraph, or re-cut once that work settles.
