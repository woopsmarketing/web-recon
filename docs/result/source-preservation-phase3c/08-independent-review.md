# 08 — Independent review

**Reviewer:** one fresh-context, read-only agent (strong model). It was given the brief's question verbatim,
file locations only, and no expected conclusion. It checked the claims against the bytes and the artifact
JSON.

**Result: 0 BLOCKER · 0 MAJOR · 5 MINOR · 4 NOTE.** Every finding was accepted. All are report or wording
corrections: **no rerun, and no verdict change.**

## What the reviewer verified independently

| area | result |
|---|---|
| contract | all 80 snippets re-found at their offsets |
| fixtures | only code-read fields; no source text. Checked against the SSR document, the Phase 2 HTML and all decoded bundles; the only match is the enum literal `GENERAL` |
| images | 46/46 served with manifest sha256; none equal to a clone file |
| source bytes | the 9 served scripts are byte-identical to sc0022–sc0030 |
| network | 103 GETs recomputed; non-local = 4 fixture-served API calls + 1 blocked mp4 + 2 preflight probes; 0 WebSocket |
| baselines | no files newer than the run in the Phase 2 clone, the Phase 1 run or the 3B.1 artifact |
| genericity | 3B, 3B.1 and 3C lib directories clean of site-specific strings |
| carousel construction | the harness never constructs or drives a carousel |
| footer | children classes in 3B.1 and 3C `dom-after.html` are identical |
| rerun | justified: attempt 1 lacks every F1 role; same document bytes; boot, mount, instance and footer results match attempt 2 |

## Findings and corrections

| # | sev | finding | correction applied |
|---|---|---|---|
| 1 | MINOR | "4 same-origin endpoints" / "same origin". The API host `dev-api.apartmentary.com` is **cross-origin** from the page | `01`, `09`: "one shared cross-origin API host"; host/CORS added to the capture-policy questions |
| 2 | MINOR | The md flip was called the "first passive re-render". MUI `useMediaQuery` uses module 6600 = `useLayoutEffect` in the browser, so the flip is a sync re-render flushed right after the commit (records at 896.7–896.9 ms vs the 887 ms probe) | `05`: "first post-commit sync re-render (layout-effect setState)". I verified module 6600 at sc0025 @80019 |
| 3 | MINOR | At 390, "the 43 px and 60 px boxes are new nodes". The logo box is index 0 in both branches and is reused with its class rewritten; only the 60 px box is new; there is no identity record after the resize | `05` step 5 and the 390 table row corrected |
| 4 | MINOR | `rowAtCommit.childrenAtCommit[*].childElementCountNow` was cited as commit-time counts, but it is read at settle. Commit-time counts come from `F1.elements[*].childElementCount` (0 and 7) and agree | `05` node-identity section cites F1 for counts |
| 5 | MINOR | Portfolio `uuid` was called "required (unguarded)". A missing `uuid` does not throw (key `undefined-i`, link `/portfolio/undefined`); a null item throws (`e.title`) | `01`, `09`, `00` reworded |
| 6 | NOTE | 80 snippets verified in the evidence file; `data-contract.json` carries 77 | `01` states both numbers |
| 7 | NOTE | `fixtures.noSourceTextCopied` covers 2 documents; the harness-construction regex covers 4 files | scopes stated in `02` and `07`; the reviewer's wider manual checks were clean |
| 8 | NOTE | The authoritative desktop screenshot has blank cards (AOS); pixel evidence of cards comes from attempt 1 and mobile area 1 | `10` warns not to read `desktop-synthetic.png` alone as proof |
| 9 | NOTE | Placeholders are 580×360, while the code container ratio is 580/380, so image size does not set card height | `02` names what was measured |

## Reviewer's independent assessment (summarised)

- **(a) Primary verdict: "RUNTIME DATA REPLAY WORKS — FIDELITY BLOCKER REMAINS".** "READY TO DESIGN REAL
  DATA CAPTURE/REPLAY" would be premature, because the hydration base decides where data enters and the
  footer defect is independent of data.
- **(b) Footer: FOOTER_STRATEGY_A_MISMATCH_SUSPECTED.**
  - Style conflict is correctly rejected; data geometry is refuted.
  - The mechanism is supported by the source child list at the cited offsets, the F1 probe, mutation
    `oldValue`s proving client-created columns, a single constant `width:100px` rule, and the SSR
    below-md classes.
  - "Suspected" is right only because no matching-base run exists.
- **(c) Strategy B:** justified as **one bounded control, not a build**. The brief's condition is met by
  observed evidence. Two additions were accepted into `09`:
  - judge the control on commit-point row identity and classes, and note that it also changes the
    style-tag makeup;
  - a cheaper discriminator is Strategy A over the Phase 2 mobile DOM at 390, followed by a resize to 1440.
