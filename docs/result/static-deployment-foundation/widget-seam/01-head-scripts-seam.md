# 01 — Head-scripts seam (`data/sites/<siteId>/scripts.json`)

Status: implemented + verified (2026-09-24). Scope: the seam only. No site authors the document yet.

A generic, **vendor-agnostic** way for one site to declare third-party `<script>` tags in the
document head. A vendor is one entry of data — a URL plus its own `data-*` attributes. No vendor,
host, product or key name appears in platform code, Template code, the schema, a default or a test
fixture; `grep` for any vendor string over this diff returns nothing.

---

## 1. Files changed

| File | Why |
| --- | --- |
| `platform/site/head-scripts.ts` (new) | The document: strict schema, security rules, the attribute allowlist, and the pure document → `<script>` element projection. |
| `platform/site/instance.ts` | `SiteSnapshotSchema` gains `headScripts` (optional) — the data reaches the Template through the existing snapshot, and its schema is frozen into each Template Release like the rest of it. |
| `platform/site/context.ts` | `SiteContext.headScripts` — the single door Template code reads it through; `[]` for a site with no document. |
| `platform/site/load.ts` | Reads the optional `scripts.json`, validates it fail-closed (`SiteDataError`), and puts it in the snapshot only when the file exists. |
| `platform/build/qa.ts` | Package QA learns which remote script URLs this site declared; everything else remote still fails (see §4). |
| `platform/build/site-build.ts` | Passes the snapshot's declared `src` list into `qaStaticPackage`. |
| `templates/interior-01/v1/app/head-scripts.ts` (new) | Template-side placement: maps `ctx.headScripts` to `<script>` elements. Plain `createElement`, no markup, no vendor knowledge. |
| `templates/interior-01/v1/app/layout.tsx` | Renders them at the existing head assembly point, after `<style id="site-theme">`. |
| `platform/test/slice1.test.ts` | 14 new checks (unit + loader-level + package QA). |

Precedent followed exactly: `data/sites/<siteId>/integration.json` + `platform/integration/config.ts`
(optional per-site document, ENOENT ⇒ `undefined`, anything else ⇒ error), and the
`theme.json` / `slots.json` / `content/reviews.json` snapshot rule (absent file ⇒ **no key**, so a
site without the document snapshots — and builds — byte-identically to before the seam existed).

One deliberate difference from `integration.json`: that file is a *builder* input and stays out of
the snapshot. This one is rendered by Template code, so it must be *in* the snapshot and its schema
must live in a Template Release runtime dir (`platform/site/**`).

## 2. The schema as implemented

```jsonc
{
  "schemaVersion": 1,                      // literal 1
  "headScripts": [                         // 0..8 entries, .strict() everywhere
    {
      "id": "support-widget",              // ^[a-z0-9]+(?:-[a-z0-9]+)*$, ≤64, unique in the file
      "src": "https://cdn.example.com/w.js", // absolute, canonical https:// URL, ≤512, unique in the file
      "attrs": { "data-site-key": "…" }     // optional; allowlisted names, string values ≤512, ≤16 of them
    }
  ]
}
```

Enforced at validation (never filtered at render):

* **`src`** — must parse as a URL, `https:` only, no credentials, no fragment, and `url.href` must
  equal the authored string (canonical spelling). This refuses `http:`, `//host/x.js`, `/x.js`,
  `x.js`, `javascript:…`, `data:…`, `https://USER:PW@…`, `…#frag`, `https://CDN.Example…`.
* **No inline content** — there is no field for it and `.strict()` refuses one
  (`content`, `children`, `dangerouslySetInnerHTML`, … all rejected).
* **`attrs` keys** — `data-*` in canonical lowercase (`^data-[a-z0-9]+(?:-[a-z0-9]+)*$`) plus the
  four names in §3. Everything else is refused *by the schema*: `on*` handlers, `src`, `integrity`,
  `nonce`, `style`, `async`, camelCase `dataKey`, `data-Key`, the empty name.
* **`attrs` values** — the platform's HT7 forbidden-character set (C0/C1 controls, U+2028/2029, bidi
  overrides/isolates), plus each allowlisted attribute's own value grammar.
* **`id`** — slug shape, unique. `src` is unique too (see §6, "challenge me").
* Failure message: `<siteId>/scripts.json invalid: headScripts.0.attrs.onload: attribute "onload" is
  not allowed (…)` — the file and the offending path, same shape as every other `SiteDataError` in
  `platform/site/load.ts`.

**Determinism.** `headScriptElements(doc)` is pure and total: elements in authored order; attributes
inserted as `src`, then the load discipline, then the author's attributes **sorted by name**, so the
head does not even depend on the key order inside the JSON file. The build identity moves with the
document because the snapshot is hashed into `buildInputId` (`prepareSiteInput`).

**Render.** `async` unless the author wrote `defer` — a declared script never blocks the page.
React hoists `async` scripts to the top of `<head>` (in authored order) and leaves a deferred one
where the layout put it; both are deterministic, and the test asserts the exact head bytes.

## 3. The attribute allowlist

| Name | Value grammar | Renders as | Why it is in |
| --- | --- | --- | --- |
| `data-*` | any string (HT7-clean, ≤512) | as written | The whole point: it is how an arbitrary vendor's configuration (site key, position, locale…) is expressible as *data*. Lowercase-hyphen only, which is what an HTML parser produces anyway. |
| `defer` | `""` (boolean attribute) | `defer` | The only way an author opts out of the `async` default, which the requirement demands exist. |
| `crossorigin` | `anonymous` \| `use-credentials` | `crossOrigin` | Needed by a vendor that serves its script CORS-enabled, and it is what turns an opaque `Script error.` into a real, reportable error. Two spec values, nothing else. |
| `referrerpolicy` | `no-referrer` \| `origin` \| `same-origin` \| `strict-origin` \| `strict-origin-when-cross-origin` | `referrerPolicy` | Lets the *site* decide how much of its own URL the third party sees. Only tokens **at least as strict as the browser default** are offered — `unsafe-url`, `no-referrer-when-downgrade` and `origin-when-cross-origin` would leak more than the default, so the seam cannot express them. |
| `type` | `module` | `type` | The single value that changes how an *external* script is parsed. Any other value is either the default (a classic-script MIME type) or turns the element into an inline data block (`importmap`, `speculationrules`) — which this document cannot carry and must not learn to. |

Deliberately **not** on the list:

* `async` — it is the seam's default and the renderer owns it. Two sources of truth for one
  attribute would stop the head from being a pure function of the document.
* `integrity` / `nonce` — they belong to a signed-resource / CSP seam that does not exist yet.
  Half of one (an `integrity` an author can typo into silence) is worse than none.
* `src` — it is a field of its own; an attrs-level `src` could only shadow it.
* everything else, including every `on*` handler, by construction: this is an allowlist.

## 4. Requirement 6 — what package QA already did

**It already rejects remote script hosts, in two independent places, and neither was weakened.**

1. `platform/build/qa.ts:126` — the HTML reference scan (`src|href|srcset|imagesrcset|poster|action`)
   fails any remote reference that is not the site's own origin: `remote reference <url>`. A
   `<script src="https://…">` hits this.
2. `platform/build/qa.ts:113` — the absolute-URL scan over *every* emitted text file (HTML, RSC
   flight `.txt`, JS chunks, CSS, JSON) fails any URL that is neither the site's own origin nor an
   exact framework-internal prefix: `absolute URL <url> (not own origin / framework-internal)`.

Extension: `qaStaticPackage` takes `declaredScriptSrcs` (`platform/build/qa.ts:79`, fed at
`platform/build/site-build.ts:479` from `snapshot.headScripts`). The allowlist is matched as **whole
URLs, not hosts** (`qa.ts:111`, `qa.ts:124`), in both the authored and the `&amp;`-escaped spelling.
So a second file on the same declared host — an image, a link, another script — still fails, and an
undeclared host fails exactly as before. The 1.5.2 `release.forbiddenTerms` scan
(`scanForbiddenTerms`) is untouched: a declared URL containing a forbidden source term still fails.

## 5. Tests (all in `platform/test/slice1.test.ts`, where the comparable checks already live)

`[unit] assets / QA scanners`
1. package QA: only declared script URLs may be remote — other host fails, other URL on the declared
   host fails, the same package without the declaration fails, a package whose only remote URLs are
   the declared ones (incl. a `&`-query in both spellings) passes.

`[unit] head scripts`
2. `src` must be absolute/canonical `https://` — 9 rejection cases.
3. no inline-content field — 4 rejection cases.
4. `attrs` allowlist — 12 rejection cases (`onload`/`onerror`/`onclick`, `src`, `integrity`,
   `nonce`, `style`, `async`, `dataKey`, `data-Key`, `data-`, `""`), plus the allowlist's exact
   contents.
5. allowlisted attrs' value grammar — 6 rejection cases.
6. attribute values reject the HT7 characters (6 code points) and still accept real copy (Korean,
   `·`, parentheses, `café`).
7. the re-declared forbidden-character set is character-for-character
   `platform/integration/contract.ts`'s (see §6).
8. ids are slugs (8 shapes), unique; `src` unique; list cap; empty list legal; `schemaVersion: 2` and
   unknown top-level keys refused.
9. document → elements: authored order, `async` by default, `defer` opts out, canonical attribute
   order, and attribute key order in the JSON does not leak into the head.
10. head scripts reach the Template through the snapshot **file** and render deterministically:
    absent document ⇒ the exact head as before the seam; with a document ⇒ exact expected head bytes,
    two renders identical.
11. a snapshot carrying an invalid head script is refused by the Template-side schema too.
12. all three fixture sites have no `scripts.json` ⇒ no `headScripts` key in the snapshot.

`[integration] lifecycle (throwaway repo root)`
13. adding `scripts.json` changes `buildInputId`; removing it restores the previous identity exactly.
14. malformed `scripts.json` fails the build naming the file and the offending path — 10 documents
    plus unparseable JSON; never degrades to "no scripts".

### Counts

| Suite | Before (baseline on the tree as received) | After |
| --- | --- | --- |
| `slice1.test.ts` (site loading, snapshot, package QA) | 69 passed / 3 failed | **83 passed / 3 failed** (same three) |
| `step4.test.ts` | 47 / 0 | 47 / 0 |
| `step5.test.ts` | 32 / 0 | 32 / 0 |
| `step52.test.ts` | 12 / 0 | 12 / 0 |
| `step6.test.ts` | 27 / 3 (D, D2, U) | 27 / 3 (same three) |
| `ia150.test.ts` | — | 14 / 1 (R3) |
| `ia151.test.ts` | — | 9 / 1 (R2) |
| `ia152.test.ts` | — | 13 / 1 (R2) |

`tsc -p platform/tsconfig.json --noEmit`: clean. `tsc -p templates/interior-01/v1/tsconfig.json
--noEmit` (the config `next build` uses): clean.
`platform/test/integration.test.ts` was **not** run (owned by another work package).

Every failure above is the **same pre-existing release-drift class**, not a regression:
`platform/content/schema.ts` (another work package) already made the working tree differ from the
pinned release `interior-01-1.5.2-d87807590d64`, and this change adds `platform/site/**` +
`templates/**` files to that same diff. Evidence that no check went from green to red:

* `slice1` 69 → 83 passed with the *same three* failing checks (release drift / release
  re-cut / release immutability in a throwaway root).
* `step6` is still exactly D, D2, U. D2 now lists
  `["templates/…/app/head-scripts.ts", "templates/…/app/layout.tsx", "platform/build/qa.ts",
  "platform/content/schema.ts", "platform/site/context.ts", "platform/site/head-scripts.ts",
  "platform/site/instance.ts"]` — my files *next to* the other work package's, in a check that was
  already red because of it.
* `ia150` R3 / `ia151` R2 / `ia152` R2 were each already red for `content/schema.ts`; they now also
  list `build/qa.ts`, `site/context.ts`, `site/instance.ts`. (`build/site-build.ts` and
  `site/load.ts` do not appear: `isIntegrationSurface()` already excludes them.)

A Template Release cut + re-pin + rebuild clears all of them, and that cut is the already-planned
follow-up work package. No assertion was deleted or weakened, and nothing was added to
`integration-surface.ts`.

## 6. What a reviewer should challenge

1. **`FORBIDDEN_CHAR_RE` is re-declared, not imported.** `platform/site/**` is collected into every
   Template Release; `platform/integration/**` is not (`PLATFORM_RUNTIME_DIRS` in
   `platform/release/release.ts`), so a release build would not have the module to import. The set
   is therefore re-declared in `platform/site/head-scripts.ts` and held identical by test 7. The
   alternative — moving the constant into a release runtime dir — means editing
   `platform/integration/contract.ts`, which another work package owns right now. Worth revisiting
   when that lands: one shared module in `platform/content` or a new release-collected `platform/util`
   would be better than two copies plus a guard test.
2. **Uniqueness of `src`, not just `id`.** Two entries with the same URL would collapse to one
   element under React's resource dedupe, so the head would stop being a 1:1 image of the document.
   Refusing it at authoring time is the strict reading; someone may argue it should be a warning.
3. **Exact-URL (not host) QA allowlisting.** Stricter than the requirement, which asked for the
   *host* to be permitted. A vendor that redirects to a second URL on the same host, or whose script
   pulls a sibling file that ends up in the package, would fail QA. That is intentional — the
   package must contain only what the site declared — but it is the most likely thing to need
   loosening in practice, and loosening it to origin-level is a one-line change.
4. **`type: "module"` is allowed.** It changes execution timing subtly (module scripts are deferred
   by default). The `async` default still applies, and the renderer does not reason about it.
5. **React hoists `async` scripts above `<style id="site-theme">`.** Deterministic, but it means the
   authored order in `scripts.json` is the order *among* async scripts; a deferred script renders
   after the theme style. Test 10 pins the exact bytes so a React upgrade that changes this is caught.
6. **No end-to-end build proof.** A real `next build` of a site carrying `scripts.json` is impossible
   until a Release containing this code is cut and a site is re-pinned (requirement 7). The render
   proof is therefore `renderToStaticMarkup` over the *actual* Template module
   (`templates/interior-01/v1/app/head-scripts.ts`) and a context built from a real snapshot — not
   over a copy of it. `app/head-scripts.ts` is deliberately a `.ts` module using `createElement` so
   the platform test suite can render it directly (`app/layout.tsx` cannot be imported by the test
   runner: it imports a `.css` file).
7. **`MAX_HEAD_SCRIPTS = 8`, `ATTR_VALUE_MAX = 512`, `MAX_ATTRS_PER_SCRIPT = 16`** are judgement
   calls, chosen to be generous for one or two widgets and small enough to be a real bound.
