# Root `tsc --noEmit` cleanup — 2026-09-21

Closes open item O11 (`docs/result/recon-template-platform-step6-demo/06-open-items.md`).

## Cause

`scripts/template-platform-polish-visual-smoke.ts:1088,1090` — two `fixture-empty` visits used a
concise arrow body `run: async (s) => check(...)`. `check()` returns `boolean`, so the arrow's type was
`(s: Session) => Promise<boolean>`, which is not assignable to `VisitSpec.run: (s: Session) => Promise<void>`
(line 965). TS2322 ×2. The caller (`if (v.run) await v.run(s);`, line 981) discards the value — the
result is recorded inside `check()` itself — so the return was never meaningful.

## Change

Only file: `scripts/template-platform-polish-visual-smoke.ts`, lines 1088 and 1090.
Concise body → block body: `run: async (s) => { check(...); }`. Same check name, same predicate,
no `any` / `@ts-ignore` / type widening. No runtime, template, release, site pin, asset or content change.

## Verification

| Step | Result |
|---|---|
| root `tsc --noEmit` | exit 0, **0 errors** (was 2) |
| `pnpm typecheck:platform` | exit 0 |
| `pnpm test:platform` | exit 0, **250 ok / 0 fail** |
| `tsx scripts/template-platform-polish-visual-smoke.ts <scratch>` | exit 0, **962/962 checks, 30 visits** (same as Step 6 baseline); both `no-floating-cta-without-destination` checks (`fixture-empty /`, `/no-such-page`) present and passing |

Smoke output was written to the session scratchpad, not the repo.
