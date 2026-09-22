# 03 — Validation

Final state: release `interior-01-1.0.0-f27823c3b837`, all three fixtures built on it.

| Check | Result |
|---|---|
| `pnpm test:platform` (`platform/test/slice1.test.ts`) | **72 passed, 0 failed** |
| `pnpm typecheck:platform` (platform + templates tsc) | exit 0 |
| root `tsc --noEmit` | exit 0 |
| `pnpm site:build` × 3 (fixture-large / small / empty) | 3 × PASS, package QA 0 failures |
| forced rebuild of fixture-large | identical packageHash `c81867e68fdc…` (deterministic) |
| visual smoke 1440 + 390 × 3 sites | **6/6 PASS** (0 broken images, 0 console errors, 0 non-local requests, no horizontal overflow) |
| independent fresh-context reviews | 2 rounds; every BLOCKER/MAJOR was fixed and re-tested (below) |

## Required checks A–Q → tests

| Spec | Test(s) in `slice1.test.ts` | Result |
|---|---|---|
| A same exact release | "A all three sites pin and were built with the SAME exact release" | PASS |
| B same template source | "B … SAME Template source (templateSourceHash)", "templates/ contains exactly one Template major", "pinned release == working tree (no drift)" | PASS |
| C large default count | "C fixture-large renders the default count (8) of the latest 173 visible projects" | PASS |
| D small 4 + custom title | "D fixture-small renders 4 residential projects + custom title" | PASS |
| E empty = no section, no wrapper | "E fixture-empty: NO projects section, NO wrapper, NO anchor, NO fake card" | PASS |
| F theme differs | "F theme differs where expected" + visual smoke canvas rgb(250,245,238) vs rgb(255,255,255) | PASS |
| G identity/content differ | "G identity/content differ where expected" | PASS |
| H unknown settings key | "H unknown section key / field / title-in-settings / out-of-range → FAIL", lifecycle "H unknown settings key → build FAILS and current package is untouched" | PASS |
| I template/release mismatch | "I settings for another template", "I createSiteContext with a different release than the pin", "I site:build with an explicit different release", "I unknown category" → all FAIL as required | PASS |
| J manual missing id | "J manual: order kept, missing/unpublished ids skipped AND reported" (warning contract) | PASS |
| K reference-fixture origin | "K reference-fixture origin under data/sites → FAIL" | PASS |
| L no supabase/fs/legacy | "L/M/N no fs/Supabase/DB/legacy imports …", "platform/ + templates/ never import the legacy src/ pipeline", scanner self-test | PASS |
| M no siteId literals | same AST gate (fixture site ids are banned string literals) | PASS |
| N no wall clock | same AST gate (`Date`, `Intl`, `performance`, timers, `Math.random`, `process`) + `at` not exposed to templates | PASS |
| O same inputs → same id | "O same inputs → same buildInputId", "O rebuild with identical inputs → up-to-date" | PASS |
| P changes → new id | "P changed content / settings / theme / slot value / asset bytes → changed buildInputId", "mode is part of the identity" | PASS |
| Q no Apartmentary in package | "Q templates/**: forbidden terms only in provenance.json", "Q packages: no source host/API/brand/assets/runtime (all emitted files) + no remote refs" | PASS |

Additional checks beyond A–Q:
- Slot model: fallback chain, needs-input, unknown keys, narrow types, link/media schemas, validated defaults and bindings, undeclared-read guard, and the **SLOT override proof**.
- Rollback lifecycle: previous kept, atomic swap, A→B→A, pruning.
- Locking: the per-site lock and stale-lock recovery.
- Integrity: a damaged package is never up-to-date; releases are immutable and tampering is detected; release creation is idempotent.
- Input hardening: releaseId traversal, the prototype-key reviver, SVG inertness, and package QA against inline CSS and look-alike origins.

## Independent reviews (fresh context, no desired verdict given)

**Review 1:** 1 BLOCKER and 6 MAJORs, all fixed.
- **BLOCKER:** releaseId path traversal. Fixed: `releaseId` must match a regex, the id must equal the hash, and the path is contained in the release store.
- **MAJOR:** timestamps sorted as strings. Fixed: sort by `Date.parse`, with id as the tie-break.
- **MAJOR:** remote leaks through the theme and QA, including `image-set()`. Fixed:
  - per-token theme grammar
  - QA scans inline `<style>` and `style=`
  - SVG check
- **MAJOR:** the template gate was a blocklist. Fixed: allowlist.
- **MAJOR:** the test wrote to the real release store. Fixed: the test runs in a throwaway root.
- **MAJOR:** release metadata was not hashed. Fixed: `releaseHash` covers the metadata.
- Minor fixes applied:
  - the package swap is now atomic
  - builds take a per-site lock
  - `at` is no longer exposed to templates
  - preview mode includes drafts
  - an unknown category fails
  - manual ids must be unique
  - the hermeticity wording is honest

**Review 2:** 3 MAJORs, all fixed.
- **MAJOR:** the regex gate could be bypassed. Fixed: TypeScript-AST gate that runs before `template.ts` is imported.
- **MAJOR:** SVG could be bypassed with `s:script`, entities or animate. Fixed: element/attribute allowlist.
- **MAJOR:** QA scope was incomplete. Fixed:
  - absolute-URL allowlist over every text file, including JS and RSC `.txt`
  - `srcset` is split per candidate
  - exact origin comparison
- Minor fixes applied:
  - defaults and bindings are validated against the slot contract
  - hard-coded English labels became slots
  - `https` and `//` are refused in link slots
  - pointer edge cases fixed
  - stale-lock takeover
  - overstated comments corrected
  - materialize re-hashes
  - `__proto__` is refused

## Visual smoke

`npx tsx scripts/template-platform-visual-smoke.ts` → `screens/visual-smoke.json` + 6 PNGs.
Every viewport confirmed four things: page loads (200), header and footer visible, card count equal to expected (large 8, small 4, empty no section), and no issues.
fixture-small is visibly re-themed (warm canvas, serif headings, rounded cards). fixture-empty keeps the footer at the bottom.

## Reproduce

```
pnpm template:release interior-01@1                          # → interior-01-1.0.0-f27823c3b837 (idempotent)
pnpm fixtures:generate --release interior-01-1.0.0-f27823c3b837
pnpm site:build fixture-large   # also fixture-small, fixture-empty
pnpm test:platform
pnpm typecheck:platform
npx tsx scripts/template-platform-visual-smoke.ts
```
