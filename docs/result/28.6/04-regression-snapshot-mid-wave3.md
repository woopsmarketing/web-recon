# Task 28.6 — Regression Snapshot (taken during Wave 3, not a gate result)

Measured 2026-09-03 by the orchestrator, running every `scripts/smoke-*.ts` on disk directly with
`npx tsx`, not through `package.json`. Raw logs: `tmp/wr286/orch/logs/`. Parser:
`tmp/wr286/orch/parse-regression.sh`.

**This is a snapshot, not a gate.** It was taken while four Wave 3 lanes were actively editing
`src/`, so it reflects a tree mid-edit. The authoritative regression runs after Wave 3 lands.

## Result

| | |
|---|---|
| Suites on disk | 35 |
| Checks | 3,503 |
| Failures | **0** |
| Crashed | 1 (`smoke-reconstruction-qa`) |

The single crash is an in-flight artifact, not a regression:
`ReferenceError: testTallPageCoverage is not defined` at `scripts/smoke-reconstruction-qa.ts:2217`.
The QA-C lane is adding exactly that function right now. Its healthy count is 134, and it got
through 46 checks before hitting the undefined call, so the honest reading of this snapshot is
**3,457 checks across 34 healthy suites**, with `smoke-reconstruction-qa` pending.

## Three things this measurement establishes

**The suite total is larger than the task has been claiming.** 28.5B reported 34 suites / 3,354
checks. There are 35 suite files, and the wave-2 additions alone (sitespec 257 to 431,
multi-observer 62 to 80, layout-safety 67 to 107, reconstruction 217 to 222) account for most of
the difference.

**Four output formats are in use**, and a parser that knows only one silently reports 0 for the
other three. My first parse reported 13 suites at zero checks; all but one were format mismatches
(`— N checks, M failures`, `N passed, M failed`, and a bare-count suite). Any future count that
disagrees with this table should be suspected of the same error before it is believed.

**`smoke-playwright` contributes 0 checks.** It is a Chromium connectivity probe that prints one
OK line, not an assertion suite. It should not be counted as a suite in a "N suites / M checks"
claim without saying what it is.

## Not yet resolved

Roughly 14 of the 35 suites have no `package.json` entry, so nobody can run them the way the
reports imply, and several have been cited in this task as "permanent coverage" while untracked in
git and invoked by no runner. The SPEC-C lane owns making that honest in Wave 3 and will return the
authoritative table of suite name, wired-or-not, exit code, checks and failures.
