# Recon Template Platform — Slice 1: First working multi-site Template

**Status: PASS.** 2026-09-18.

One Template codebase (`templates/interior-01/v1`), frozen as one immutable release
(`interior-01-1.0.0-f27823c3b837`), renders three fictional Site Instances. Each site has different content, settings, slot copy, theme and identity, with no per-site fork.
Each site builds into its own static package, and the previous good package is kept for rollback.

Read next: [01 implementation](01-implementation.md) · [02 three-site proof](02-three-site-proof.md) ·
[03 validation](03-validation.md) · [04 open items](04-open-items.md) · [screens/](screens/)

## Final report

```
SLICE1_STATUS = PASS
PLATFORM_PATH = platform/
TEMPLATE_PATH = templates/interior-01/v1/
TEMPLATE_ID = interior-01
TEMPLATE_VERSION = 1.0.0
TEMPLATE_RELEASE_ID = interior-01-1.0.0-f27823c3b837 (releaseHash f27823c3b837…a538b7a4, 26 files, read-only)
SITE_COUNT = 3
SITES = fixture-large, fixture-small, fixture-empty
SAME_TEMPLATE_CODE_PROVEN = YES (one templateSourceHash f489c9b2fbea… in all 3 build records; working tree = release)
SAME_EXACT_RELEASE_PROVEN = YES (all 3 pins + build records = f27823c3b837, full hash)
CONTENT_READER = YES (getSingleton + closed list descriptors: latest | category | manual, limit)
SITE_CONTEXT = YES (getSiteContext(template); no fs/DB/siteId/clock in template code, AST-gated)
SITE_SETTINGS = YES (template defaults ⊕ sparse overrides, strict: unknown key/field/template → FAIL)
ASSET_RESOLVER = YES (content-addressed /assets/<sha20>.<ext>, referenced assets only, SVG allowlist)
THEME = YES (theme-contract-v1 tokens, consumed-token check, per-token grammar, CSS vars)
STATIC_BUILD = YES (Next 16.3.0 output:export in a disposable out-of-repo workspace, package QA)
FIXTURE_LARGE = PASS (176 records → 173 visible, 3 categories, defaults → 8 latest cards)
FIXTURE_SMALL = PASS (12 projects, ko-KR identity, 9 theme tokens, limit 4 + category residential, custom title)
FIXTURE_EMPTY = PASS (0 projects → no section, no wrapper, no anchor, no fake card)
EMPTY_COLLECTION_BEHAVIOR = section omitted entirely; nav hides #projects; footer stays pinned
UNKNOWN_SETTING_REJECTION = YES (preflight + build fail; current package untouched)
TEMPLATE_RELEASE_MISMATCH_REJECTION = YES (other-template settings/slots, pin≠release, --release≠pin, id≠hash)
SOURCE_DEPENDENCY_CHECK = PASS (no src/ imports; no Apartmentary host/API/brand/assets/runtime in any emitted file)
BUILD_INPUT_ID = H(releaseHash, siteSnapshotHash, mode, toolchainHash);
  large 82412fcf4c14… · small 8c695e94ed81… · empty 63d1a815e182… (forced rebuild → identical packageHash)
PREVIOUS_GOOD_PACKAGE = YES (each site: current on f27823c3b837, previous on 1ddf327cb1b9, 2 package dirs)
DESKTOP_SMOKE = PASS (1440 × 3)
MOBILE_SMOKE = PASS (390 × 3)
PLATFORM_DEVELOPMENT_TIME ≈ majority of the session (platform modules, gates, builder, tests, 2 review-fix rounds)
TEMPLATE_SPECIFIC_AUTHORING_TIME ≈ 7 min (manifest, 3 sections, card, CSS, default theme)
BUILD_QA_TIME_PER_SITE ≈ 6.4 s build (install 1.5 s, next build 4.5 s, QA 0.01 s), ≈ 9 s wall incl. CLI
SLOT_MODEL = minimal section-level semantic slots (text · richText · link · media), declared in the section
  definition, sparse site values, fallback site → binding → neutral default → hide → needs-input
SLOTS_IMPLEMENTED = 8 (site.header: homeLinkLabel, projectsNavLabel, contactLabel;
  home.projects-a: title, description; site.footer: summary[→business.summary], companyLabel, emailLabel)
DOM_SLOT_DEPENDENCY = NO
PER_ITEM_SLOTS = NO
SLOT_OVERRIDE_PROOF = YES (same release: large "Selected projects"/"Projects"/"Company" (neutral defaults),
  small "주거 공간 프로젝트"/"프로젝트"/"상호" (site values); sources recorded per build, asserted on built HTML)
FILES_CHANGED = 50 new (platform/, templates/, visual-smoke script, this report) + package.json (5 scripts added)
  + docs/status/source-preservation-v2.md (Slice 1 DONE line)
TESTS = 72 passed / 0 failed
TYPECHECK = PASS (platform + root)
BUILD = PASS (3/3)
LEGACY_PIPELINE_CHANGED = NO
FROZEN_ARTIFACTS_CHANGED = NO
SUPABASE/CMS_CHANGED = NO
COMMIT/PUSH = NO
NEXT = Portfolio list + detail + pagination on the SAME Template, if Slice 1 PASS.
```

## Honest limits (details in 04)

- The builder runs from the repo tree; only rendered code comes from the release. Every build record says so in `hermeticity`.
- Gates are static scans, not a sandbox.
- Runtime network is checked only by the visual smoke.
- `link` and `media` slot types are implemented and tested, but no v1 section consumes them yet.
- The time split is an estimate from session timestamps; it was not instrumented.
