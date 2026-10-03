# Live proof scripts — shared inquiry form v2 (interior-01 1.6.3)

> **Archived (2026-10-04).** The run is over: the scripts are kept as inert `*.mts.txt` files, the way earlier
> tasks archived theirs — nothing here can be started by accident, and nothing is type-checked or linted. The
> commands below name the files as they were run (`*.mts`). To reuse the read-only / stubbed ones for a later
> publish, copy them back to `*.mts`. **`real-submit` already ran once** (`real-submit.sentinel.json`,
> `../40-live-real-submission.json`) and must not be run again for this task.

Target: `https://interior-demo.boostweb.co.kr` (site `boost-interior-demo`), after the production publish of
the package named by `data/site-builds/boost-interior-demo/current.json`.

**The inquiry endpoint `https://boostchat.co.kr/api/widget/<key>/lead` stores a REAL lead and e-mails a real
person on every un-stubbed POST.** Exactly one script here sends a real request — `real-submit.mts` — and it
may run exactly once. Everything else answers the endpoint itself (a stub) or never opens a browser.

Run everything from the repo root, never with `pnpm`:

```sh
run() { ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json "$@"; }   # a function: zsh does not word-split a variable
D=docs/result/shared-inquiry-form-v2/proof/scripts
```

## Order after the publish

| # | command | sends to the lead endpoint | result |
|---|---|---|---|
| 1 | `run $D/live-parity.mts` | nothing (no browser; GET to the site's own host only) | `proof/30-live-http-parity.json` |
| 2 | `run $D/live-browser-qa.mts` | nothing (stubbed) | `proof/31-live-browser-qa.json`, `screenshots/live/qa-*.jpg` |
| 3 | `run $D/rehearse-submit.mts` | nothing (stubbed) | `proof/32-live-stubbed-rehearsal.json`, `screenshots/live/rehearse-submit-*.jpg` |
| 4 | `I_UNDERSTAND_THIS_SENDS_ONE_REAL_LEAD=yes run $D/real-submit.mts` | **1 form POST + 1 replay = one stored lead** | `proof/40-live-real-submission.json`, `screenshots/live/real-submit-*.jpg` |

Go on to the next step only when the previous one printed `RESULT: PASS` (exit code 0). Step 4 is run **once**.
Each script prints one `PASS` / `FAIL` line per check, writes its JSON, and exits non-zero on failure.
Steps 2–4 load the live page with its real chat widget; page loads are paced across all scripts (at most 4 per
65 s — the widget's bootstrap budget), so step 2 takes about 4 minutes and steps 3 and 4 may wait up to a minute
before they start.

Before the publish the same scripts run against a local static server over the built package:
`QA_BASE=local run $D/live-parity.mts`, `QA_BASE=local run $D/live-browser-qa.mts`,
`QA_BASE=local run $D/rehearse-submit.mts` → `proof/rehearsal/*.json`.

## What each script proves

**`live-parity.mts` (30)** — every addressable file of the current package's `site/` directory is served
byte-identically by the base (status 200, size, sha256; `X.html` at `/X`, `index.html` at `/`), an unknown path
answers 404 with the package's `404.html`, and the served `/contact` is the package's `/contact` whose inquiry
door chunk contains `submission_id`. Before the publish it is EXPECTED to fail against the live site (the 1.6.2 package was served: door chunk
`357lobkhknrl3.js` without `submission_id`).

**`live-browser-qa.mts` (31)** — the form in a real browser, endpoint stubbed. Six profiles (Chromium 1440×900,
1024×768, 768×1024, 390×844, 375×667; WebKit `devices["iPhone 13"]`), two page loads each:

- A: initial → validation (empty name; bad phone — no request) → loading (the stub holds the answer: button
  disabled, "접수 중…", a second press sends nothing) → error with fallback contacts (network failure: fields kept,
  nothing retried by itself) → rate-limited (429 `rate_limited`, `Retry-After: 2`: button disabled, a press sends
  nothing, the fallback contacts offered under the lead during the pause, then enabled again and the alert
  cleared; the retry carried the SAME `submission_id`) → conflict (409: its own text, NO contacts, same id) → success (200: confirmation, fields removed, a NEW id after the conflict).
- B: keyboard — Tab order name → phone → region → area → work type → schedule → message → consent → submit;
  100-character name + 500-character message; Enter in a field submits exactly once.
- In every state: no horizontal overflow; form, button, alert and confirmation inside the viewport width; on
  phones the button and the fallback links are at least 44 px tall.
- Widget (live only; asserted at 1440, 768, 390, 375; recorded at 1024): the launcher's box does not intersect
  the submit button, the alert, the consent checkbox (failure alert visible) or the confirmation headline (success
  visible), and `elementFromPoint` at the centre of the submit button is the button — at the position the page is
  left in and again with the element centred. A launcher that does not appear within 10 s is a NOTE, not a failure.
- Across the run: every stubbed body has exactly the keys `consent, name, phone, message, hp, submission_id`
  (never `source` / `turnstile_token`), every id is a v4 UUID, no cookie, no request to a host containing
  `turnstile` or `challenges.cloudflare.com`, no console / page error (the browser's own lines for the stub's
  deliberately failing answers are counted apart).

**`rehearse-submit.mts` (32 live / 40 local)** — the exact flow of the real submission (`submit-flow.mts`) with a
stub that implements the endpoint's idempotent contract in memory (new id → stored; same id + same values → 200,
nothing stored; same id + other values → 409). Asserts one POST from the double click, the success UI, the
replay answered 200, exactly 2 POSTs, and a store count of exactly 1. Run against the live site it is the
go / no-go for step 4: `real-submit.mts` refuses to start without a PASS on the very build that is being served.

**`real-submit.mts` (40)** — the one real submission. Chromium 1440×900, `/contact`, values
`[TEST] Shared Inquiry V2` / `010-0000-0000` / `테스트` / `0평` / `테스트` / `[TEST] Shared Inquiry Form V2 E2E
2026-10-04 — …`, consent ticked. The press is a fast double click (two `click()` calls in one tick) → exactly
ONE POST expected. Recorded: the preflight (via CDP) and the POST's status, body and headers of interest
(`access-control-allow-origin`, `retry-after`), the request's header names (no cookie), the body KEYS, the
folded message, the success UI, no navigation, console errors 0. Then the REPLAY: the exact captured body, sent
once more by a `fetch` from the same page → expected `200 {"received":true}`. The endpoint is addressed by
exactly 2 POSTs. The replay is only sent after exactly one POST answered `200 {"received":true}`; otherwise no
further request is made.

## Safety guards

**The stub (steps 2, 3 and every local run)** — `qa-lib.mts` `installLeadStub()`:

- It is called on a context that has no page yet (it stops the process otherwise) and registers three routes for
  the endpoint: the exact URL from `data/sites/boost-interior-demo/inquiry.json`, the glob
  `**/api/widget/*/lead`, and a predicate over the path (query string, trailing slash).
- Before the target page is opened it proves the interception in that context with two canary requests to a
  host that cannot resolve (`lead-stub-selftest.invalid`): one must be caught by the glob route, one by the
  predicate route. If not: `SAFETY VIOLATION`, exit code 97, nothing was opened.
- Every answer carries `x-qa-stub: 1`. A lead response without that mark, or with a server address, stops the
  process at once (`SAFETY VIOLATION`, exit code 97).
- At the end of each context: lead requests seen by the context = requests answered by the stub, every form
  request was caught by the exact-URL route, and (browser QA) no request the script had not scripted.
- Service workers are blocked in every context (a worker's requests would not pass through routes).
- `QA_BASE=local`: every request that is neither the local origin nor the endpoint is aborted (the chat widget
  script included), and Chromium is started unable to resolve any host name — nothing leaves the machine.
- `live-parity.mts` starts no browser; its HTTP helper can only address the base's own host.

**The real submission (step 4)** — `real-submit.mts` installs no route and imports no stub. It refuses to start
(exit 2; nothing opened, nothing sent, no sentinel written) unless all of these hold
(`real-guard.mts` — pure functions):

1. `I_UNDERSTAND_THIS_SENDS_ONE_REAL_LEAD=yes`;
2. `QA_BASE` unset or the live URL;
3. it never ran: no `proof/scripts/real-submit.sentinel.json`, no `proof/40-live-real-submission.json`;
4. the live site serves the 1.6.3 form of the current package: `/contact` is the package's `contact.html`,
   its door chunk contains `submission_id`, and it declares the site's endpoint;
5. `proof/32-live-stubbed-rehearsal.json` is a PASS made on that same `/contact`
   (`SKIP_LIVE_REHEARSAL_GATE=yes` goes without it).

Then the sentinel is CREATED (`started`; exclusive create — of two launches that both passed check 3 only one
gets past this point) and written again right before the press (`CLICKED — never re-run`); a second run refuses. In the browser, before the press, the page is checked once more: the door script it
really loaded contains `submission_id`, the fields hold the values, and no lead request was made. If any of that
fails the button is NOT pressed: the script prints `NOT CLICKED`, marks the sentinel `aborted-before-click`, and
names the two files to remove by hand to arm it again.

**If anything fails after the press the script prints `DO NOT RE-RUN`.** The lead may already be stored and
e-mailed; report `proof/40-live-real-submission.json` as it is.

**Submission ids** are never written down. Files and console lines carry only the first 8 characters and whether
the id is a v4 UUID; every known id is scrubbed from all output before it is written, and each result has a
check that no full id was found.

## Environment

| variable | effect |
|---|---|
| `QA_BASE` | unset or the live URL → the live site; `local` → static server on 127.0.0.1 over the built package (results under `proof/rehearsal/`, screenshots under `proof/rehearsal/screenshots/`). Anything else is refused. |
| `QA_OUT_TAG` | parity / browser QA / rehearsal: writes `<name>.<tag>.json` — a run that must not be taken for the final proof. |
| `QA_PROFILES` | browser QA: comma list of `c1440,c1024,c768,c390,c375,w390` (the result is then marked `partial`). |
| `QA_FAKE_LAUNCHER=1` | browser QA, LOCAL only: a simulated launcher (the live geometry of 2026-10-03) to rehearse the widget check → `31-live-browser-qa.fake-launcher.json`. Not evidence about the real widget. |
| `I_UNDERSTAND_THIS_SENDS_ONE_REAL_LEAD=yes` | required by `real-submit.mts`. |
| `SKIP_LIVE_REHEARSAL_GATE=yes` | `real-submit.mts` starts without a passed live rehearsal. |

## Notes

- The launcher is taken to be the widget's element in the TOP document — tried in this order:
  `iframe[data-boost-chat-frame]`, an iframe whose `src` starts with the widget origin + `/widget/`, any iframe
  of the widget origin, any `position: fixed` iframe. Its own box is what is intersected (the closed launcher
  measured 60×60 at ≥ 768 px and 56×56 on phones on 2026-10-03). The widget is never opened and nothing is typed
  into it. Which selector matched is recorded (`widget.launcher.detectedBy`).
- WebKit follows the Safari convention: plain Tab stops at text fields and menus only. There the full order is
  walked with Option+Tab, and what plain Tab does is recorded next to it.
- Local screenshots go to `proof/rehearsal/screenshots/`, live ones to `screenshots/live/`.
- Files next to the scripts that are state, not code: `real-submit.sentinel.json` (after step 4) and
  `page-load-times.json` (the pacing of live page loads).
