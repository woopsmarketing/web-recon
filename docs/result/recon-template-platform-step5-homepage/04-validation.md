# 04 — Validation

## Final run (repo root, 2026-09-19, the one final release)

| Step | Command | Result |
|---|---|---|
| Release | `pnpm template:release interior-01@1` | `interior-01-1.3.0-74a70c276f35` created |
| Fixtures | `pnpm fixtures:generate --release interior-01-1.3.0-74a70c276f35` | 3 fictional sites pinned to it |
| Builds | `pnpm site:build fixture-large` / `fixture-small` / `fixture-empty` | built, package QA pass, 0 builder warnings |
| Typecheck | `pnpm typecheck:platform` | exit 0 |
| Tests | the 4 `test:platform` suites | slice1 **72/72** · step4 **47/47** · step41 **35/35** · step5 **32/32** |
| Step 5 smoke | `tsx scripts/template-platform-step5-visual-smoke.ts` | **504/504** checks, 19 visits (screens in `screens/`) |
| Step 4.1 smoke | `tsx scripts/template-platform-step41-visual-smoke.ts <scratch>` | **180/180** checks, 7 visits (the Step 4.1 docs screens were not overwritten) |

**Release details.**
- `releaseHash` = `74a70c276f353446fb80d4419ed920533f371e5d16905310497702aab944f1f4`
- `templateSourceHash` = `ed1e1d14…`
- 54 files, read-only.
- The hash equals the last development release built in the scratch devroot from the same sources. The repo-root release is therefore byte-for-byte the code that passed the devroot cycle.

**Old releases are untouched.** Every file hash under `interior-01-1.2.0-93fb66acda7d` was compared before and after the final run: identical. step5 test C also proves this, including for 1.1.0.

### Build inputs and rollback

| Site | New buildInputId (1.3.0) | Previous package (1.2.0), kept for rollback |
|---|---|---|
| fixture-large | `1f30134eba1fa7cb735ab3ea98893a4b0294f3df13c88e274c59d64917bbc318` | `c1174a3fd9c07d3015926ecf53bed721faa316780c9aa228f8bf81cf3e186096` |
| fixture-small | `320e1889dc91a1836706634db465b9d7084dbd2099b4cc718eb10e2d31cb8cf4` | `2e157b28577584772a542ae87b98f12d98afea6ddd18f2c4b734a262181a3d43` |
| fixture-empty | `301ae02cd7f5a3e57cd0528c1ab77805e77b58e6e4a338d4c0781330e38cb515` | `092832a93731804bab730fad34310e933de07c81ca78c3991ba0141987180961` |

Retention is current + previous only: each site has exactly these two packages.

## Spec §35 test requirements → proof

| Req | Proof |
|---|---|
| A. Step 4.1 tests remain PASS | step41 suite 35/35 plus the step41 smoke 180/180 on the new release |
| B | step5 **B**: all three sites pin and were built with the same 1.3.0 release |
| C | step5 **C**: 1.2.0 (and 1.1.0) hash and every file unchanged, read-only, no Step 5 files |
| D | step5 **D** (static HTML) + smoke `section-order` / `header-first-footer-last` (live DOM) |
| E / F / G | step5 **E / F / G** + smoke (all sections present; Korean labels; empty = hero + intro only; `/portfolio` 404) |
| H. >1 slides, controls work | step5 **H** (markup) + smoke: autoplay, hover pause, tap never pauses, arrows, dots, pause/play, wrap, keyboard, swipe, inert inactive slides |
| I. 1 slide | step5 **I** + smoke `single-slide-static` |
| J. 0 slides | step5 throwaway **J/O/Q/R** (all banners draft → no hero; setting off → no hero) |
| K / L / N | step5 **K/L/N**: same collection, disjoint subsets per settings, cards → real detail routes |
| M | step5 **M**: placement fields refused by every canonical schema |
| O | step5 **O** + throwaway (reviews doc absent → section absent, no wrapper) |
| P | step5 **P**: no generated origin; `reference-fixture` refused under `data/sites`; no rating/date/photo fields |
| Q / R | step5 **Q / R** + throwaway (band absent, CTA disabled, no contact destination); smoke: CTA fixed, in the footer landmark, on top, `mailto:` |
| S / T / W | step5 **S/T/W** (AssetResolver, local hashed files) + smoke `no-broken-images-*` / `no-subresource-errors` on every visit |
| U | step5 **U** (package QA forbidden terms + explicit scan) |
| V | smoke `no-nonlocal-requests` (initial + final) on every visit: 0 |
| X | smoke `no-horizontal-overflow` on every visit + `hero:long-copy-no-overflow`: 0 |
| Y | step5 **Y** (static: nothing hidden in the reduced-motion block except the pause toggle) + smoke reduced-motion visits at 1440/390 |
| Z | step5 **Z**: per-item slot keys fail as unknown slots |
| AA | step5 **AA**: Template import/identifier gate (no timers, `window`, `fetch`, `Date`, `Intl`, …) |
| AB | step5 **AB**: `prepareSiteInput` twice = the current package's buildInputId |
| AC | step5 **AC**: every site's buildInputId (release part) changed |
| AD | step5 **AD**: every non-home page's `<main>` is byte-identical to the 1.2.0 package (list, pages, details, 404) + step41 filters suite + smoke |
| AE | step5 **AE**: sitemap.xml and robots.txt byte-identical to 1.2.0; home `<title>` unchanged |

**Other step5 checks:**
- banners model and reader;
- homepage settings defaults (projects-b off);
- builder warnings unit;
- rollback = the 1.2.0 packages, intact;
- hero CTA targets (unserved → no CTA, unknown → build fails);
- link slots: `#reviews` kept and dropped, `/portfolio` kept, `/portfolio/nope` hidden and warned;
- preview vs public drafts;
- old-release compatibility (1.2.0-shaped data re-pinned to 1.2.0 reproduces each retained 1.2.0 buildInputId exactly, and the current builder still builds it).

## Visual smoke (§36)

**The 18 full visits:**
- fixture-large home: 1440, 1000, 390, 1440×700, 1920, and reduced motion at 1440 and 390. The 1440/1000/390 visits also capture each section: projects A, projects B, reviews, image band, and a mid-page floating-CTA view.
- fixture-small home: 1440, 390, 900×600, 320.
- fixture-empty home: 1440, 390, 1440×700.
- fixture-large `/portfolio` and one detail page, each at 1440 and 390.

The 19th visit is a status check: fixture-empty `/portfolio` returns 404.

**Every full visit asserts:**
- HTTP 200;
- 0 console errors and 0 page errors (initial + after interactions);
- 0 non-local requests;
- 0 subresource errors;
- 0 broken images (fetch + visible);
- 0 horizontal overflow;
- internal links resolve, and no external links.

Counts: 18 of each, all passing.

**Stress checks.** Maximum-length hero copy (80/160/32 chars, Korean worst case) at 320, 390, 900×600, 1440×700 and 1920. Copy stays inside the hero, with no inner overflow; the scrim spans the slide; the arrows stay clear; there is no overflow.

**Headline and text contrast.** Worst pixel, with text colour and shadow removed; 49 boxes per element across 3 fixtures × 7 viewports:

| Copy | Headline | Text |
|---|---|---|
| Normal fixture copy | ≥ 5.16:1 | ≥ 5.93:1 |
| Maximum-length copy | ≥ 5.08:1 | ≥ 6.10:1 |

## Changes to earlier suites (none weakened)

The homepage legitimately changed, so a few Slice 1 / Step 4 / 4.1 assertions that pinned the old homepage or the exact 1.2.0 release were generalised. Every generalisation is compensated by a stricter Step 5 check.

**slice1**
- The unknown-section tests now use `home.faq`, because `home.hero` is now a real section. They still prove that an unknown section fails.
- Card-count checks now count inside `home.projects-a`, because the home now has two showcases.
- The fixture-empty home check asserts the exact section list `home.hero, home.intro` (stricter than before).

**step4**
- **Y**: the re-pin-to-1.1.0 throwaway strips the 1.3.0 settings, slots and content documents first. Old strict schemas refuse them, which is the documented migrate-before-re-pin rule.

**step41**
- The release check is "≥ 1.2.0" instead of "= 1.2.0".
- Rollback: previous is earlier than current and ≥ 1.1.0.
- **A** no longer byte-compares `index.html`. step5 **AD** compensates: every non-home `<main>` is byte-identical to 1.2.0.
- The filters-off comparison runs against a stored 1.1.0 re-pin, made first and stripped to the 1.1.0 data shape.

**Also verified:** step5 **C**, the rollback checks and the compat check pin the exact old release ids and hashes.

## Process and reviews

**Development.**
- Development ran in a scratch devroot: symlinked sources and copied `data/`.
- There were many development releases there. The repo got exactly **one** release, the final one.
- No source observation was run (G15).

**Reviews.** All reviewers were read-only subagents with fresh context; the main agent was the only writer.

| Review | Result | Disposition |
|---|---|---|
| Reviewer 1: architecture / regression | 0 BLOCKER, 0 MAJOR | MINORs fixed (hero a11y, pinch-zoom, hydration race, link slots → `mailto:` + builder warnings); NITs fixed or recorded (06) |
| Reviewer 2: homepage visual | 4 MAJOR | All fixed: arrow/copy overlap, headline contrast, tap-stuck pause, tracks below 900. MINORs and NITs fixed or recorded |
| Fix verification | 0 BLOCKER, 0 MAJOR; 4 MINOR, 3 NIT | Fixed: long-copy clipping (hero grows + copy-anchored scrim), wide-screen inset, CTA landmark, `/path` link tests, tab stop only when scrollable, warning wording. Tab-order NIT accepted (06) |
| Delta review of the last fixes | 0 BLOCKER, 0 MAJOR; 3 MINOR, 6 NIT | Fixed: CTA hit-test + footer containing-block note, stronger scrim-geometry and inner-overflow checks, 32-char CTA stress, `overflow: clip`, single-slide padding, slide-count selector, vacuous-test guard, dead class. Recorded: focus-drop NIT, Chromium-only coverage, font-swap note |

## Limits of this validation

- **Browser proof is Chromium (Playwright headless) only.** Not covered:
  - WebKit and Gecko;
  - real touch devices;
  - classic always-visible scrollbars (headless hides them).
- The contrast numbers are measured on the fictional SVG fixture images, not on customer photos. By construction, the scrim is at least `.55` black everywhere behind the copy. Over a pure-white photo, that composites to sRGB 0.45, so white text is still ≥ 4.76:1 there.
