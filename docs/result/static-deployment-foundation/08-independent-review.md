# 08 — Independent review (fresh context) and disposition

Date: 2026-09-21. Reviewer: a fresh-context agent on the strong model, read-only on the repository, with no knowledge of the expected outcome. It worked in the isolated copy `/Users/woops/projects/web-recon-track-b`, wrote its scratch scripts outside the repository, started its own local runtime on its own state directory, and was told not to read the earlier session's review (`_session1/05-independent-review.md`).

Scope: the 1.5.1 Template delta, `site:publish`, `recon-runtime`, their tests, and documents 02–05, 07 and 09. Areas A–L of the brief.

**Reviewer's counts: BLOCKER 0 · MAJOR 4 · MINOR 12 · NOTE 9.**

**After disposition: BLOCKER 0 · MAJOR open 0 in the delivery code · 1 MAJOR (R3, Template UX) intentionally deferred, with 2 Template MINORs, to a 1.5.2 decision.**

## 1. MAJOR findings

| Id | Area | Finding | Disposition |
|---|---|---|---|
| R1 | C, E | A request whose R2 key is longer than 1024 bytes made `R2.get` throw. The answer was **500** instead of 404, and the whole attacker-chosen path went into the log. Reproduced on a local runtime: paths of 1,000–2,000 characters gave 500. | **FIXED.** `index.ts`: a resolved key longer than 1024 bytes is a miss, R2 is not asked, and the package's 404 page is returned. The logged `path` is capped at 256 characters. Test `R1` in `publish.test.ts`: 12 long paths (ASCII and Korean) give 404 with the 404 page, no over-long key reaches the bucket, and the log line's path is ≤ 256. |
| R2 | E | The immutable-path guard **failed open**: when the live package's seal was missing or unreadable, the publisher logged a skip and moved the pointer. The contract stated the rule without that exception. | **FIXED.** `assertImmutablePathsStable` now refuses, with a recovery hint (inspect the seal, or delete the pointer and publish again). No new flag was added. Test `G2` covers a missing and a garbage live seal; the pointer stays byte-identical. Contract §3 now says so, and says why rollback needs no check of its own (R5). |
| R3 | A | `InquiryForm.tsx`: the message cap is 500 characters, but the guard measures the encoded `mailto:` against 2,000. Korean is 9 URL characters per character, so the real budget is about 165 characters. A visitor who writes 250 characters, inside the stated cap, gets the copy fallback instead of a mail hand-off. | **DEFERRED, intentionally, and documented.** The behaviour is honest: no success is claimed, nothing is lost, and the address and the composed text are shown to copy. Public demo safety is not affected. The earlier session already listed it as limitation 2 of `01-151-validation.md`. The fix changes Template source, so it needs a new immutable release (1.5.2), a re-pin, a rebuild and test generalisation. The brief asks for a bounded 1.5.1 and warns against over-building the transitional mailto path. **Recommendation:** decide on a small 1.5.2 that adds a budget-aware remaining-characters hint, and take R10 and R14 with it. The real fix is an inquiry backend, which is out of scope. |
| R4 | docs | `04-site-publish-design.md` said the new flags had no tests and pointed at a missing `06`. It was written while the tests were being added. | **FIXED.** 04 now carries a measured coverage map; `06-local-validation.md` exists. |

## 2. MINOR findings

| Id | Finding | Disposition |
|---|---|---|
| R5 | `rollbackHost` does not run the immutable-path guard. | **No code change.** Rollback only returns to `previous`. That is the pair the forward publish compared, and the forward guard now fails closed (R2). Stated in contract §3. |
| R6 | `--remote --dry-run --check-store` read the live bucket without `RECON_PUBLISH_ALLOW_REMOTE=1`. The reviewer also found that this machine has a wrangler OAuth login. | **FIXED.** Every `--remote` run that reaches the bucket, reads included, needs the variable. Only the offline `--remote --dry-run` does not. CLI test row added (P14). The live plan lists the logged-in machine as a risk. |
| R7 | On the sealed-skip path nothing confirmed that the objects still exist. Reproduced: all objects deleted, seal kept, host activated onto an empty prefix. | **FIXED.** Before a sealed package is activated, `index.html` and `404.html` are read back and compared with the seal. `--reverify` still checks every object. Test `G4`: missing and damaged file, no write, no pointer. |
| R8 | `--expect-live` was evaluated only at step 8, after a full upload. | **FIXED.** It is checked before any upload and again just before the write. Test `G5`: a stale expectation leaves zero writes. |
| R9 | `rollbackHost` threw a raw `SyntaxError` on a corrupt previous seal. | **FIXED.** Clean refusal. Test `G6`. |
| R10 | On a site without a contact channel, `/contact` is still generated, indexable and self-canonical. | **DEFERRED** to the 1.5.2 decision (Template-only `noindex`). `/contact` is already out of the sitemap and out of every link. The demo site has an email address, so it is not affected. Removing the route itself needs a Platform route-gating seam; that is recorded, not built. |
| R11 | Four dangling cross-references in 04, 05 and 09 after the report set was renumbered. | **FIXED** in the document refresh. |
| R12 | `.wrangler/` is not in `.gitignore`. | **Recommended, not applied.** It is precondition 1 of `09-git-checkpoint.md`. `.gitignore` is a shared tracked file and nothing is committed in this pass. *2026-09-22: applied in the foundation consolidation (`docs/result/foundation-consolidation/03-gitignore-and-checkpoint.md`).* |
| R13 | `file:line` anchors in 04 and 05 were off by a few lines. | **FIXED** in the document refresh, after the last code change. |
| R14 | `MobileMenu.tsx` `isRendered` uses `getClientRects` only, so a `visibility:hidden` control could be chosen as the focus target. | **DEFERRED** to the 1.5.2 decision. In the shipped Template the chosen element is the brand link, which is visible; both browser runs confirm focus lands there. The risk is latent. |
| R15 | Three `ia151` checks are gated on pin == 1.5.1 and will assert nothing after the next re-pin. | **NOTE for the next cut.** This is the repository's existing point-in-time pattern. The next release has to generalise them, as every cut so far has done. |
| R16 | `01-151-validation.md` said that 3 platform checks fail and that no `platform/**` file was touched. Both statements are stale. | **FIXED** by an addendum in 01: 275 passed, 0 failed in this copy. |

## 3. NOTES

| Id | Note | Disposition |
|---|---|---|
| N1 | A pointer stored under one host's key but naming another hostname was accepted and rewritten. | **FIXED.** `readRoutingPointer` refuses it. Test `G6`. |
| N2 | The documented pointer race also defeats the site-change guard and can corrupt `previous`. | **Documented** in contract §3 and in the live plan's risks. |
| N3 | The Worker trusts the request hostname. | Accepted; documented in 05 and 07. `workers_dev` and `preview_urls` are off. |
| N4 | No CSP, HSTS or frame headers; SVG is served same-origin. | Accepted for the pilot; documented. The runtime changes no package bytes and adds only `nosniff`. |
| N5 | No `Range` support. | Known. The publisher warns when a package contains video. No package has any. |
| N6 | `--dry-run --check-store --local` created the local state directory. | **FIXED.** A read-only local store with no state directory answers "absent" without starting wrangler. |
| N7 | Many flags for a one-site pilot; `checkStore` without `dryRun` was silently ignored. | The silent case now throws (test `G6`). Flags kept: `--expect-live` is the cheap stale-write guard the brief asks for; `--no-activate` and `--reverify` are the separate upload, verify and activate steps of the live plan. |
| N8 | The CRLF regex misses a lone `\r`; the 900 px breakpoint is written in two places. | Template; not reachable from a standard textarea. Left. |
| N9 | The example pilot hostname sits in another product's zone. | **Live plan updated.** The example comes from the brief. Cloudflare's documentation was checked (2026-09-21): a Worker on a Custom Domain is treated as an origin, so an existing wildcard route's Worker would run first. The plan and `wrangler.jsonc` now give two attachment forms; the exact-route form wins by route specificity. The zone owner's sign-off is blocker L2. |

## 4. What the reviewer verified and found correct

- **A.** Both release directories re-hashed with the repository's own functions: 62 of 62 files, both release hashes reproduce, 1.5.0 untouched, the delta is exactly 7 files, and there is no customer-specific branching.
- **B.** Fault injection at **every one of the 146 write positions**: the live pointer stayed byte-identical and no seal was written, every time. Read-back caught corruption of a file, of the seal and of the pointer. The offline dry run made no store access and was identical across runs.
- **C.** 28 hostile paths through the real URL parser and 13 direct resolver calls: never a 200, never a key outside the package prefix, never the seal. Double-encoded traversal decodes once to a harmless literal. The only exception was R1, now fixed.
- **D.** Cross-site re-point and cross-site rollback are refused. A pointer naming another host gives 500 and never serves that site. Routing keys cannot be reached from any URL.
- **E.** A real 404 status with the package's own page, `no-store`, no `ETag`. 503 only when `404.html` is absent. No homepage fallback. 304 for strong, weak, list and `*`. Immutable policy only on `_next/static/**` and on verified content-addressed names. 0 same-name, different-bytes collisions across the local packages.
- **F.** The publisher only reads the package. `packageIntact` runs before and after the inventory. A file changed after planning is caught by the read-back comparison.
- **H.** No coupling to existing Cloudflare resources. The only names are the new Worker and the new bucket; routes are commented out; there is no account id.
- **I.** Zero hits for any integration term in the delta. The Worker reserves exactly four literals: `index.html`, the `.html` suffix, `_package.json`, and `404` / `_not-found`. Any future JSON file in a package is served as an ordinary static file.
- **J.** No secret is read, printed or stored. Wrangler is started with an argument array, never a shell.
- **K.** No sign of a live action. No wrangler log of the day has `--remote` in its arguments. The only uploads recorded are `--dry-run` bundles. There is no bucket, route, DNS or deployment id anywhere.
- Protected surfaces are byte-identical between the 1.5.0 and 1.5.1 release snapshots: `content/{schema,reader,project-filter}.ts`, `settings/settings.ts`, `site/{instance,context}.ts`. `docs/reports/integration/**` was not touched.
- The dry run prints every field the brief lists. Every command in the live plan exists with those flags.

## 5. What nobody could verify locally

- A real R2 bucket and a deployed Worker: the wrangler remote error text for a missing key, edge compression and weak `ETag`s, HEAD on a custom domain, hostname routing beside existing routes.
- Real mail clients with a mailto of about 2,000 characters, and real screen-reader output for the re-announced status.

## 6. Re-verification after the fixes

See `06-local-validation.md`: `test:publish`, both typechecks, `test:platform`, and a clean-state `test:publish:e2e` were run again on the final code.
