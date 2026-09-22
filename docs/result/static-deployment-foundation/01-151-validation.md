# interior-01 1.5.1 — fixes from the 1.5.0 review: validation (2026-09-21)

**STATUS: PASS for the 1.5.1 scope.** 3 checks in `test:platform` fail. All 3 come from files that another concurrent session added to `platform/`. None comes from 1.5.1 (see §4).

> **Timeline (read this first).** The line above and §4 / §6.4 are the *first session's* record (2026-09-21 ≈18:00): 272 passed / 3 failed. → The second session resolved the 3 external failures without weakening an assertion (§8): **275 passed, 0 failed.** → Re-verified on the consolidated tree on 2026-09-22: **275 / 0**, ia151 smoke **65 / 65** (`docs/result/foundation-consolidation/04-final-local-verification.md`). The first-session text is kept as history.

This is a Template-only patch. No existing release changed, and no `platform/**` file was touched by this work.

## 1. Identifiers

| item | value |
| --- | --- |
| release | **`interior-01-1.5.1-6bbdd07eb9bf`** · releaseHash `6bbdd07eb9bf07aef7f9d975f4a0fce977820874246bc4403cc8af5d89425d02` · templateSourceHash `10fdd0744f82…` · 62 files · release gate passed |
| boost-interior-demo | buildInputId **`aa71b829ec7046f223904d42d38d1fe58a7b3fc61a245d6d3f6a4112c710b171`** · packageHash **`613cd9e00e73d8428efcb9afa4249bb353952994c0653568da59adc407890266`** · QA pass · 15 HTML · 0 warnings |
| rollback | `previous` = the 1.5.0 package `6c74d34c2ecd…` (packageHash `c28ad0131b71…`). The 1.4.2 package `fb723e09…` was pruned under the one-rollback rule; the 1.4.2 release itself is intact. |
| fixtures (re-pinned with `fixtures:generate`) | large `986ca47e…` / pkg `68e08fb6…` · small `36c3a04c…` / pkg `37ffbf66…` · empty `1deb02ec…` / pkg `a93cac84…` |

Method: a scratch devroot built a candidate first. It used symlinks to platform, templates and the other shared folders, plus copies of `data/{template-releases,sites,site-builds}`. The candidate ran the full cycle of cut, fixtures, 4 builds, 11 tests and 6 smokes. After that, the repo root was cut **once**. The root's release id, all 4 buildInputIds and all 4 packageHashes are identical to the devroot's. The demo was built once in the root. A pre-change capture is in `proof-151/before.json`: every release dir, the 62 demo files, the pins and pointers, `platform/` (without test/) and the template tree. Logs are in `proof-151/logs/`.

## 2. What changed, per review item

| item | change (file:line, `templates/interior-01/v1/`) |
| --- | --- |
| **M1** long mailto | `components/InquiryForm.tsx:38-46`: message `maxLength` 500, each one-line field 100, `MAILTO_MAX_LENGTH = 2000`. `:77-80`: if the encoded `mailto:` is longer than 2,000 characters, no link is opened. The hidden link's href is removed and the success status is not set. The status then shows the `tooLong` text: nothing has been sent, plus the address. `:141-160`: the fallback block shows the address as `mailto:` with no body, a read-only textarea with the composed text (subject, blank line, body) and a "select all text" button (44 px). A short inquiry afterwards hands off normally, and the fallback disappears. |
| | `template.ts:184-190`: 3 optional contact.page slots with neutral English defaults: `tooLong` (includes `{email}`), `tooLongTextLabel`, `selectTextLabel`. `sections/ContactPage.tsx:48-51` fills them in. `styles/template.css:1207-1238`: 4 fallback rules. Demo `slots.json`: Korean copy for the 3 slots only. |
| **m1** CRLF | `InquiryForm.tsx:71`: `value("message").replace(/\r?\n/g, "\r\n")` |
| **m2** re-announcement | `InquiryForm.tsx:139`: the status `<p role=status>` stays in place, and its text sits in `<span key={status.n}>`. Every press creates a new node, which counts as a live-region addition. The server HTML is unchanged: an empty `<p>`. |
| **m3** focus on resize | `components/MobileMenu.tsx:61, 69-91`: `returnFocus` uses the menu button only if the button is rendered (`getClientRects`). Otherwise it uses the first rendered `a[href]` or button in the header, and failing that the header itself (`tabIndex=-1`). In the browser, focus lands on the brand logo link `a.i1-header__brand`. |
| **m4** /contact on sites without a channel | `sections/links.ts:20-29`: new `listedPaths(ctx)` = route-plan paths, minus `/contact` when the site has no email. `app/sitemap.ts:17` and `liveLink` (`links.ts:46`, operator link slots) use it. Other contact CTAs were already absent without a channel (`contactHref`). |
| version | `template.ts:67-75, 78`: 1.5.1 history note. |

## 3. Tests and smokes changed

- **New** `platform/test/ia151.test.ts` (10 checks):
  - S1: contract plus 1.5.0 slot documents still resolve.
  - R1: every earlier release is byte-identical to the capture, and there is exactly one new 1.5.1 dir.
  - R2: the 1.5.1 release equals 1.5.0 except the 7 declared Template files, and the platform files from the capture are unchanged.
  - R3: pin, record and rollback = the 1.5.0 package.
  - D1: only the pin and the 3 slot values changed.
  - P1: every page's main, header and footer and the sitemap equal the 1.5.0 package, except the /contact maxlength attributes.
  - P2: caps in the server HTML.
  - F1: sitemap per fixture versus the channel.
  - J1: source shape.
  - C1: the stylesheet is 1.5.0 plus the 4 rules.
- **New** `platform/test/canonical-151.ts`: `sitemapIaPaths(version, hasChannel)`.
- **New** `scripts/template-platform-ia151-smoke.ts`: browser smoke, 65 checks.
- **Generalised (no assertion weakened):**
  - `step4.test.ts` T: the expected sitemap for fixtures now uses `sitemapIaPaths`, which drops /contact only when the version is ≥ 1.5.1 and the site has no email. Everything else is still exact.
  - `ia150.test.ts` P1: the page set and sitemap comparison against the 1.4.2 package is now gated on pin == 1.5.0. This is the same point-in-time pattern as its R2/D1: the 1.4.2 package was pruned by this cut. The rest of P1 is still unconditional. ia151 P1 makes the equivalent comparison against 1.5.0.
  - `scripts/template-platform-ia-smoke.ts:122, 508`: for releases ≥ 1.5.1 the message line break is expected as `\r\n`, which is the m1 fix. 1.5.0 still expects `\n`.

## 4. Commands (repo root, after the cut)

| command | result |
| --- | --- |
| `tsx … platform/cli/template-release.ts interior-01@1` | created `interior-01-1.5.1-6bbdd07eb9bf` |
| `tsx … platform/dev/generate-fixtures.ts --release …` + 3 × `site:build` | built · QA pass · 0 warnings |
| demo re-pin (site.json template block only) + `site:build boost-interior-demo` (once) | built · QA pass · previous = 1.5.0 |
| `tsc -p platform/tsconfig.json` | 0 errors |
| root `tsc --noEmit` | 0 errors |
| test:platform + ia151 | slice1 71/1 · step4 47/0 · step41 35/0 · step5 32/0 · polish 4/0 · step52 12/0 · step6 28/1 · predemo 10/0 · predemo2 9/0 · ia150 14/1 · **ia151 10/0** → **272 passed / 3 failed (275 checks)** |
| `template-platform-ia151-smoke.ts` (new) | **65 / 65** |
| `template-platform-ia-smoke.ts` | 114 / 114 |
| `template-platform-predemo2-smoke.ts` | 177 / 177 |
| `template-platform-predemo-gallery-smoke.ts` | 35 / 35 |
| `template-platform-step6-visual-smoke.ts` | 237 / 237 |
| `template-platform-polish-visual-smoke.ts` (3 fixtures, 30 visits) | 962 / 962 |

Regression smokes wrote their screens to a scratch outDir, so earlier reports' screens were not overwritten.

**The 3 failures are external.** A concurrent session created `platform/cli/site-publish.ts` and `platform/publish/{media,publish,store,wrangler-store}.ts` at 17:28–17:30, after this work's capture at 17:24. Compared with the 1.5.0 capture, the only difference in `platform/` (without test/) is these 5 **added** files: 0 changed, 0 removed.
- slice1 "never import legacy src/": `platform/publish/{media,publish}.ts` import `../../workers/recon-runtime/src/contract`.
- step6 D: the platform tree hash differs.
- ia150 R3: `platform/` is not byte-identical to the 1.5.0 capture.

In the devroot run, before those files existed in their current form, the same code passed everything except these checks. The files are outside the release runtime dirs: ia151 R2 shows the 1.5.1 release's platform files are byte-identical to 1.5.0's. These gates belong to the owner of the publish work, so I did not change them.

## 5. Browser evidence (Playwright, built packages, `proof-151/logs/smoke-ia151.log`)

- **Layout:** 6 routes (/, /portfolio, a detail, /3d-portfolio, /about, /contact) × 5 widths (320 / 390 / 899 / 900 / 1440) = 30 checks. All return 200, with overflow 0, console errors 0 and non-local requests 0.
- **M1:**
  - Caps: message 500, fields 100. Typing 600 characters stops at 500.
  - A long Korean inquiry (12 lines, ~300 characters) produces a 2,699-character `mailto:`. At 320, 390 and 1440 it opens no link, and the hidden href is removed.
  - The status reads exactly "문의 내용이 길어 메일 앱으로 열 수 없습니다. 아직 전송된 것은 아닙니다. 아래 내용을 복사해 hello@…로 보내 주세요." It contains no success wording.
  - The fallback shows "이메일: hello@…" and a read-only textarea whose text exactly equals subject + body. "내용 전체 선택" selects 0..len.
  - With the fallback open: overflow 0, 0 network requests, still on /contact.
  - A short inquiry afterwards opens 1 link of ≤ 2,000 characters, and the fallback disappears.
  - Screens: `proof-151/contact-too-long-{320,390,1440}.png`. In the fullPage shot the sticky header overlaps the top of the fallback; this is a capture artefact.
- **m1:** typing "첫 줄\n둘째 줄\r\n셋째 줄" gives a body ending in `첫 줄\r\n둘째 줄\r\n셋째 줄`. There is no lone LF or CR anywhere.
- **m2:** 3 hand-off presses produce 3 live-region additions, each a new node with the same text. 2 too-long presses produce 2 more.
- **m3:**
  - At 390, Esc returns focus to the menu button.
  - With the menu open at 390, resizing to 1000 closes it. Focus lands on `a.i1-header__brand` (rendered, inside the header), not on body or the hidden button. Tab continues through the header.
- **m4:** the sitemap lists /contact for the demo (13 locs) and fixture-small (17). fixture-empty lists 3 locs (`/`, `/3d-portfolio`, `/about`), without /contact. fixture-empty's `/contact` still answers 200 with "Contact details are not available yet." and no form.
- **Negative control:** the same smoke run against the root's 1.5.0 packages before the cut gave 37 / 65. All 28 failures were the fix-specific checks in B–F; A layout passed. So the smoke tells 1.5.0 and 1.5.1 apart (`logs/smoke-ia151-negative-control-on-1.5.0.log`).

## 6. Limitations

1. **m4 remainder:** `/contact` is still **generated** on a site with no contact channel, and it is still directly reachable. The route plan has no per-site gating for static pages; that is a Platform seam. The page is no longer listed in the sitemap or linked from anywhere, and operator link slots to `/contact` are dropped too. It is not `noindex`: a cheap Template-only follow-up would add `robots: { index: false }` to its metadata when there is no channel. Removing the route itself needs the Platform route-gating seam.
2. **The 2,000-character mailto limit is conservative and fixed.** In Korean, about 150–200 characters of message already goes past it, so Korean users will see the copy fallback fairly often. That outcome is honest, but it is a UX cost. There is no clipboard "copy" button, because the release gate bans `navigator` (and so `navigator.clipboard`); it offers "select all" plus the OS copy instead.
3. No real Windows/Outlook or iOS device test. The mail hand-off was recorded, not opened.
4. The 3 external `test:platform` failures (§4) stay until the publish work updates or rebaselines slice1, step6 D and ia150 R3.
5. 1.5.0 limitations still apply: `.example` content, no OG tags, L2/L3, and no real inquiry backend.

## 7. `test:platform` addition (not applied: `package.json` is owned by another agent)

Append to the end of the `test:platform` script:

```
 && tsx --tsconfig platform/tsconfig.json platform/test/ia151.test.ts
```

---

## 8. Addendum — Track B re-validation in the isolated copy (2026-09-21, later session)

Sections 1–7 were written by the first session, in the main working tree. This addendum records what the Track B session found when it re-validated 1.5.1 in the isolated copy `/Users/woops/projects/web-recon-track-b` (start commit `6c2e723`). The release, the Template source and the demo package are byte-for-byte the ones described above; nothing was re-cut.

**Statements above that are no longer true**

| Where | Statement | Now |
|---|---|---|
| status line, §4, §6.4 | "3 checks in `test:platform` fail" (slice1, step6 D, ia150 R3) | **275 passed, 0 failed.** The owner of the publish work resolved them with `platform/test/publish-surface.ts`: the publish surface is excluded from the "platform unchanged" fingerprints, and the legacy-import scan resolves relative specifiers. No assertion was weakened. |
| line 5 | "no `platform/**` file was touched by this work" | The 1.5.1 work added `platform/test/ia151.test.ts` and `platform/test/canonical-151.ts` and generalised `step4.test.ts` and `ia150.test.ts` (§3). No platform *implementation* file changed: `ia151` R2 proves the release's platform files equal 1.5.0's. |
| §7 | "`test:platform` addition not applied" | Applied. `package.json` `test:platform` ends with `ia151.test.ts`. |

**Re-run in the copy**

| Command | Result |
|---|---|
| `tsc -p platform/tsconfig.json` | 0 errors |
| 11 `test:platform` suites | slice1 72 · step4 47 · step41 35 · step5 32 · polish 4 · step52 12 · step6 29 · predemo 10 · predemo2 9 · ia150 15 · ia151 10 = **275 passed, 0 failed** |
| `scripts/template-platform-ia151-smoke.ts` (scratch outDir) | **65 / 65** |
| 1.5.1 pages served through `recon-runtime` (local e2e) | see `06-local-validation.md` |

**Brief §7 against the release**

| Item | Verdict | Evidence |
|---|---|---|
| 7A mailto length | done | message cap 500, fields 100, encoded-URL guard 2,000 with the reason in the source comment (`InquiryForm.tsx:40-46`), no hand-off and no success wording when too long, address + copyable text fallback |
| 7B line endings | done | CRLF only, no double conversion (`InquiryForm.tsx:71`; smoke C) |
| 7C repeated submit | done | status text node re-created per press (`InquiryForm.tsx:139`; smoke D) |
| 7D mobile menu focus | done | focus goes to a rendered header element on resize; Esc, backdrop, close, link close, trap, scroll lock unchanged (smoke E; earlier suites) |
| 7E no-contact-channel routing | partly done, rest deferred | `/contact` is out of the sitemap and out of every link when there is no email. The page is still generated and indexable. Removing it needs a route-gating seam in the Platform; `noindex` needs a new Template release. |

**Independent review of the 1.5.1 delta** (`08-independent-review.md`): release immutability and the 7-file delta confirmed; no customer-specific branching. Open Template items, all deferred to a 1.5.2 decision because 1.5.1 is immutable:

- **R3 (MAJOR, UX):** the 500-character cap is larger than what a Korean message can use before the 2,000-character URL guard (about 165 characters). The visitor then gets the honest copy fallback, not a false success. It was already limitation 2 above.
- **R10 (MINOR):** the orphan `/contact` on a site without a channel is not `noindex`.
- **R14 (MINOR, latent):** the focus-target test ignores `visibility:hidden`.

None affects the safety of the public demo: the demo site has an email address, and the form never claims that anything was sent.
