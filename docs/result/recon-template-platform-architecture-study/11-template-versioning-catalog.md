# 11 — Template Versioning and Template Catalog (Parts M + N · 템플릿 버전 / 카탈로그)

## Part M — Versioning

### Decision

| Element | Rule |
|---|---|
| Pin | Site Instance stores `templateRef = "<id>@<major>"`, e.g. `interior-01@1` (`08`) |
| Version | Template manifest carries semver `version`, e.g. `1.4.2`. Major = directory `templates/<id>/v<major>/`, **from day one** (`v1/` exists before any breaking change, so paths, import aliases and the drift-test mapping never move) |
| Release snapshot | Customer builds never read the working tree. `template:release` first copies an immutable, **content-addressed release snapshot** (contents below), then runs the gates **on that snapshot**. Each major has one **promoted** release at a time |
| Within a major | Minor/patch changes → new release snapshot → gates → canary → promote. Pinned sites receive the promoted release on their **next build** (automatic), except a site under a last-good hold (below) |
| Across majors | A new major is a **new directory** living beside the old one. Sites move **explicitly**, one at a time, through the same dry-run → preview → accept flow as a template switch (`12` Scenario 5) |
| Build input identity | One definition for every build (below). Recorded in the build record (EXTEND ProductionSpec lineage, `02`) |
| Rollback | Site: redeploy the previous package (kept), or flip the pin back; settings are stored per `templateRef`, so the old document is intact (`08`). Release: promote the previous release hash again, after the settings compatibility check (below) |

Today a site pins one exact template **run directory** by hash, and no upgrade path exists (`01` §23).
Hash pinning and refusal on drift are kept as build-record doctrine. The exact-run pin is replaced by a
major pin plus promoted release snapshots, so that a bug fix does not need N manual re-pins.

### Release snapshot contents and hermetic builds

```
release snapshot (immutable, content-addressed)
  templates/<id>/v<major>/     without fixtures/ and provenance.json
  platform/                    content model, reader, settings, SEO, theme, builder (snapshot · prune · QA · packaging)
  package.json + lockfile      scoped to templates + platform; never the repository root lockfile, which also
                               carries the legacy pipeline's dependencies
  framework configs            next.config, tsconfig
  forbidden-terms.json         frozen at release from provenance.json + the source SEO snapshot (gate 3, 04)

recorded beside it, not hashed into it: fixtures/ hash, provenance.json hash, gate and canary records
```

- **Dependencies** are installed once per snapshot from its own lockfile (frozen) into that snapshot's
  directory. Nothing resolves upward into the repository, which today's bake does (`bake.ts:135-145`, `02`).
- **Workspaces** live outside the repository tree. The build process receives an allowlisted environment
  (e.g. `PATH`, `NODE_ENV`, `NEXT_TELEMETRY_DISABLED`), never the operator's full `process.env`.
- **The builder runs from the snapshot.** A frozen major keeps its own builder, platform code and
  dependencies, so later changes cannot alter its builds.

### Build input identity (single definition)

```
buildInputId = sha256( releaseHash, siteSnapshotHash, mode, toolchainHash )

releaseHash       content hash of the release snapshot (above)
siteSnapshotHash  hash of the canonical site snapshot copied into the build workspace (09):
                  site.json + settings of the templateRef being built + content visible in `mode` at T
                  + referenced asset registry entries
mode              public | preview
toolchainHash     Node.js version + package manager version
```

- The templateRef being built is the release's templateRef: the pin for public builds, a candidate for
  candidate previews (`12` Scenarios 5 and 8).
- `site:build` skips only when the site's last **successful, deployed** build has the same `buildInputId`.
  Builds of one site are serialized (`10`).
- Templates cannot read the wall clock (`09`). T affects output only through visibility, which the site
  snapshot captures.
- The build record stores `buildInputId`, its four parts, `templateRef`, the manifest `version`, T, the
  output package hash, the QA result and whether it was deployed.
- **A git SHA is not part of the identity.** It cannot describe uncommitted work, and this repository
  currently carries a large uncommitted diff (`git status` at study time). Content hashing (reused
  `hashDirectory`) describes exactly what was built.

### Shared platform, content model and dependencies

The `platform/` package is shared by every template. A platform change can therefore change every site of
every template. Rules:

| Change | Handling |
|---|---|
| Platform code change (bug fix, helper change, builder change) | Accepted into `platform/` only when `template:verify --all` passes for **every active major**. A failure means fixing the change or the affected template first; there is no partially applied platform. Each major then gets its own candidate → canary → promote, so the rollout is staged |
| Dependency upgrade (Next.js, React, zod) | Same as a platform change, through the scoped lockfile. The change class comes from the gate evidence, not from the version number |
| Content model: additive (new optional field, new vertical type) | Allowed. Readers **strip unknown keys**, so older release snapshots keep building data written with a newer model. A field that restricts publication (approval, consent, visibility) raises the data's `minReaderVersion`; an older snapshot then refuses that site loudly instead of dropping the field (`03`) |
| Content model: breaking (rename, remove, retype, enum widening, new required field) | A content-model migration + new releases for every major still pinned by a site, **frozen majors included** (the one exception to "security fixes only"). Avoid; design fields additively (`03`) |
| Frozen majors (successor shipped) | Keep building from their last promoted snapshot. A security fix is made in a **maintenance worktree materialized from that snapshot** (`template:release --from <releaseHash>`), so it does not drag in platform changes made since the freeze. When the active line needs the same fix, it is applied twice (accepted cost, `15` S11) |

### Release flow (enforced order)

```
template:release interior-01@1          (or --from <releaseHash> for a frozen-major maintenance fix)
  → copy the snapshot contents (above) into the release store (immutable) and install its dependencies
  → gates 1–5 run on the snapshot (04); results are stored under the release hash
  → status: candidate
template:canary <releaseHash> --sites <list>
  → preview-mode builds (noindex; the deploy step refuses them for live domains) for fixture sites and
    consenting canary sites
  → visual diff against their current packages; a person records the canary review under the release hash
template:promote <releaseHash>
  → refuses unless passing gate results and a canary review are recorded for that hash
  → an older hash (rollback) first validates every pinned site's settings against that release's schemas
    (08); incompatible sites are reported and keep their last good package
  → the major's promoted pointer = {releaseHash, version, promotedAt}
  → sites:rebuild --release <releaseHash>   (pinned sites, batched, per-site QA)
```

- Only a promoted release can produce a package for a live domain. Candidate releases build in preview
  mode only.
- The release store lives outside the working tree, e.g. `data/template-releases/<id>@<major>/<hash>/`.
  A snapshot is retained while any deployed package, rollback package or hold references it.

### Last-good release hold (the only per-site exception)

- A site that fails QA on a newly promoted release keeps its deployed package. It also gets a **hold**:
  `{heldRelease: <its last good release hash>, failedRelease, since}`, stored with its build records and
  listed in the site index.
- While held, the site's content builds use the held release, so publishing is never blocked by a
  template regression it did not cause.
- The hold clears automatically when a later promoted release passes QA for that site, or when the
  operator clears it. Every batch report lists open holds.

### Answers

| Question | Answer |
|---|---|
| Should a Site Instance pin a Template version? | Yes, the **major**. The exact release is recorded per build, not pinned; the automatic hold is the only per-site exception |
| How do safe bug fixes work? | Fix in the major directory → `template:release` (gates on the snapshot) → canary → `template:promote` → `sites:rebuild --release <hash>` in batches, each with isolated QA. A failing site keeps its last good package and gets a hold |
| How do breaking visual/schema changes work? | New major directory. Sites stay on the old major untouched until explicitly upgraded |
| When do customers receive fixes automatically? | Patch/minor within their major, once promoted, at their next build (content publish or batch rebuild) |
| When must upgrades be explicit? | Any MAJOR change (table below) |
| Smallest viable first implementation | `version` in the manifest; `templates/<id>/v1/`; `templateRef` on the site; snapshot-first `template:release` with stored gate results; minimal `template:canary` and `template:promote` preconditions; hermetic per-snapshot installs; `buildInputId` in the build record; the hold; the rollback settings check (`14` Slice 5). Batch tooling stays minimal until real sites exist |

### Change classification

| Class | Allowed changes | Gate evidence |
|---|---|---|
| PATCH | Bug fix restoring intended output; no settings/schema/route/requirement/default change | Fixture-site visual diffs limited to the defect area |
| MINOR | Additive only: new optional setting/variant/slot whose default preserves current output; new optional section or route **disabled by default**; a11y/perf fixes without visible change | Fixture diffs ≈ none by default; new options exercised by an extra fixture |
| MAJOR | **Any intentional change of a default value or of default visual output**; remove/rename/retype a setting or slot; narrow allowed values; new `REQUIRED` content; route path change; section removal | Any of these → new directory + explicit upgrades |

A default change is MAJOR even when it looks like an improvement. Sites that never overrode the key would
otherwise change without consent (`08`).

The gate is a **reuse of the neutrality idea** (`02`): "the same inputs reproduce the accepted output".

- Render each fixture site (and optionally a private sample of real site snapshots) before and after.
- Screenshot-compare at standard widths. The legacy reconstruction-QA capture/compare modules are the
  candidate harness (EXTEND, API fit UNKNOWN).
- A diff over threshold in a change labeled PATCH/MINOR blocks release unless a human reclassifies it.

### Explicit upgrade flow (major, same machinery as a template switch)

```
site:upgrade <siteId> --to interior-01@2 --dry-run
  → settings migration: template-provided migrateSettings(@1 doc) → @2 doc (carried / adjusted / dropped)
  → requirements delta (new REQUIRED content?), route path changes → redirect list
  → theme compatibility (tokens consumed, contrast), asset needs (e.g. new wide hero media)
site:preview <siteId> --template interior-01@2        (promoted @2 release + settings/interior-01@2.json, noindex)
  → visual diff vs current live package; human acceptance
site:pin <siteId> interior-01@2 → build → QA → deploy  (old package retained for rollback)
```

### Old majors

- Frozen after the successor ships: security fixes (from a maintenance worktree, above) and required
  content-model compatibility releases only.
- `deprecated` in the catalog once there are no new sites.
- Deleted when **zero sites pin it**, no hold references it, and retention of their last packages has
  passed.
- "Who pins me" is a site-index query (`Part N`). It closes today's "no refcount on shared runs" gap
  (`01` §19).

### Not built

- package registry or npm publishing. The release store is a local directory of immutable snapshots with
  one promoted pointer per major; nothing is published, and nothing resolves versions or dependencies
- operator-chosen per-site version pins (the automatic last-good hold is the only per-site exception)
- git-tag checkout per build
- automatic cross-major upgrades
- a semver range solver

---

## Part N — Template Catalog

### Decision

A **code registry**, the smallest form that satisfies the real consumers.

- `templates/index.ts` statically imports every manifest.
- A generated `catalog.json` serves non-TypeScript consumers. It is a rebuildable cache, never
  authoritative (reused registry doctrine, `01` §19).
- No DB-backed catalog now. A later CMS may mirror `catalog.json` into a table, still derived from code,
  because templates **are** code and ship by release.

### Is a first-class catalog useful?

Yes, but only as a list with derived facts. Its consumers exist in the MVP/NEXT plan:

| Consumer | Needs |
|---|---|
| `site:create` / `site:switch` / `site:upgrade` | Template exists, status allows use, vertical matches the site's content, manifest schemas |
| `site:build` / `sites:rebuild --release` | The promoted release of each major. Which sites pin a major, and which are held, comes from the **site index**, not the catalog |
| Operator/customer template picker (later) | Display name, previews, route keys, section kinds, requirements summary |
| Template regression gate | Fixture list per template |

### Entry shape (derived from manifests, `04`, and the release store)

`id`, `majors[{major, version, status, supersedes?, release: {promoted?: {hash, version, promotedAt},
candidate?: {hash, version}}}]`, `vertical`, `displayName`, `preview[]` (fixture-site screenshots),
`routeKeys[]`, `sectionKinds[]`, `requirements{required[], recommended[]}`, `theme.consumes[]`.

- `release` is read from the release store pointers, never typed by hand.
- Provenance is not in the catalog. It stays in the operator-only `provenance.json` (`04`).

### Site index (companion, not part of the catalog)

- MVP: scan `data/sites/*/site.json` and the build records, and derive
  `{siteId, status, templateRef, hold?, lastDeployedBuild, updatedAt}`.
- Later: `select … from sites`.
- It answers "which sites use `interior-01@1`?" and "which sites are held?" for batch rebuilds,
  deprecation and deletion.

### Not built

- marketplace
- remote/plugin template loading
- DB rows as the template source of truth
- a template upload UI
- ratings or pricing
