# 04 — Source-bound dependencies, API, external runtime

## The four content endpoints

All first-party API traffic goes to one origin: **`dev-api.apartmentary.com`** — note
that a production site is pointed at a `dev-` host. Identical on desktop and mobile.

*Attribution corrected after independent review (M6).*

| endpoint (GET) | direct caller | base URL from | client code in | UI dependence |
|---|---|---|---|---|
| `/api/v1/main-banners/action/get-displays` | **sc0028** `mainBannerService` @4747 | sc0027 | sc0025 | **HIGH** — hero carousel |
| `/api/v1/portfolios/action/get-by-paging?…isBottomArea1Display=true` | **sc0028** `portfolioService` @4723 | sc0027 | sc0025 | **HIGH** — portfolio grid 1 |
| `/api/v1/portfolios/action/get-by-paging?…isBottomArea2Display=true` | **sc0028** `portfolioService` @4723 | sc0027 | sc0025 | **HIGH** — portfolio grid 2 |
| `/api/v1/reviews/action/get-by-paging?count=6` | **sc0028** `reviewService` @1932 → `getReviewsByPagingUsingGET1` @2084 | sc0027 | sc0025 | **HIGH** — review carousel |

The three chunks play three distinct parts: **`pages/index` calls**, **7925 supplies the
base URL** and the service registry, **`_app` holds the generated client and the axios
XHR adapter**. The earlier version of this table credited `_app` alone for main-banners;
the page chunk is the caller for all four.

Mechanism: axios via an **openapi-generator `typescript-axios`** client. Network ids
n0030–n0033 on desktop, **n0032–n0035 on mobile**. The earlier claim that all four are
CORS-preflighted is **withdrawn** — on desktop, n0030 and n0031 carry
`initiator.type: "preflight"`, but no OPTIONS entry backs a claim about all four.

`sc0027` additionally wires **12** generated service clients (band, popup, footer, news,
brand, journal, terms, store, logging, review, portfolio, mainBanner) onto one shared
axios instance with an `Authorization: Bearer` request interceptor. Only 4 of the 12 fire
on the homepage; the other 8 are dormant.

## The blocker: those four response bodies were never captured

Phase 1's body policy — confirmed in the canonical run's own manifest — is
`json: false`. §12 of the Source Package design states that API/data bodies are never
kept. So the data behind every visible content section on this page **exists nowhere in
the evidence**, by deliberate design.

This is not a capture bug. It is a policy boundary that Phase 3 is the first phase to
actually collide with, because Phase 3 is the first phase that needs the page to *run*
rather than *look right*.

## Base URL configuration: two literals, one origin

**Not** a single shared constant, and **not** scattered:

| script | expression | literal |
|---|---|---|
| sc0025 (`_app`) | `var w="https://dev-api.apartmentary.com:443".replace(/\/+$/,"")` @257488 | generated `Configuration` **default** only |
| sc0027 (7925) | `var c="https://dev-api.apartmentary.com",l=(0,a.PEn)(void 0,c,o)` @260409 | **effective** — passed as `basePath` to all 12 clients |

Both are baked at build time into different webpack chunks. **No `process.env`
indirection, no `runtimeConfig`, no relative fallback, no runtime override switch.**

Replay implication *(corrected after review, M1 + M3)*: the effective origin is sc0027's
literal; sc0025's is a default that `basePath` overrides. Patching bytes would therefore
mean one literal, not two — but it remains bundle surgery against Phase 2's principle
that preserved bytes stay untouched.

**The byte-preserving alternatives this report first proposed do not work:**

- A **same-origin proxying preview server** never sees these requests. The XHRs target an
  absolute cross-origin host and go straight there.
- A **service worker** does not control the first page load, and these fetches fire in
  the first `useEffect` of that load.
- Phase 2's preview server is not "positioned" for either — it is a static file server
  with no proxy, sending `script-src 'none'`.

What does work without touching bytes is **browser-level request routing**: request
interception in the automation layer, or host-resolver rules mapping the API host to a
local stub. That is the route Phase 3B should take.

Contrast: `NEXT_PUBLIC_NAVER_ACCOUNT_ID` *is* genuinely config-derived — and still falls
back to a baked-in literal.

## Other source-origin bindings

| binding | severity | evidence |
|---|---|---|
| API origin literals (above) | **BLOCKER** | sc0025:257488, sc0027 |
| 4 content XHRs with no captured bodies | **BLOCKER** | n0030–n0033, `bodyPolicy.json=false` |
| `/_next/image` optimizer endpoint | MEDIUM | sc0024:16480, :48641; sc0025:204564 — a static replay cannot serve it |
| `/_next/data/` route JSON | MEDIUM | sc0024:25240, :74808, :76686 — `<Link>` prefetch; with `gssp=true` and an empty SSG set, only a live Next server answers |
| buildId path segment | LOW | must be reproduced as `yMHNQjHujDVTgIp539WqR` exactly |
| absolute URLs in `bannerData.url` / `popupData.image*Url` | LOW | both records are display-disabled |
| publicPath `/_next/` | LOW | root-relative, **not** origin-bound — must be served from a server root |

## External runtime: widgets vs trackers, kept separate

**VISIBLE_THIRD_PARTY_WIDGET** — renders UI a user sees:

- **Channel Talk** — chat bubble; loader `cdn.channel.io/plugin/ch-plugin-web.js`
  (body captured, 1,802 B) + two inline snippets; boots against `api.channel.io`.
- **Kakao JS SDK** — `Kakao.Share.sendDefault` share dialog (body captured, 205,743 B).
  Declared src redirects to `t1.kakaocdn.net`.

**TRACKER** — analytics / ads / measurement, no UI:

Google Tag Manager, GA4, Google Ads/doubleclick beacons, Google Optimize, Facebook Pixel
(two container ids — one initialised by an inline snippet, one seen only on the wire and
likely GTM-injected), Naver wcslog + GFP-NAC, Karrot Pixel, Kakao Pixel/KAS.

**Kakao appears twice in genuinely distinct roles** and the two must not be merged:
`developers.kakao.com/sdk/js/kakao.js` is the sharing SDK (widget);
`t1.daumcdn.net/kas/static/kp.js` is the ad pixel (tracker). Different hosts, different
script ids, different provider hints, different functions.

Non-first-party API-shaped calls (`api.channel.io`, `bc.ad.daum.net/bc`,
`nam.veta.naver.com/nac/2`) are constructed *inside* third-party SDKs, not in the site's
own bundle.

Container and pixel ids are recorded in `runtime-graph.json` as provider identification
only; no user-identifying value, token or credential was copied out of the captured bytes.

## Residual ledger cross-check — three gaps

The Phase 2 ledger has 3 entries: 2 neutralized `<noscript>` trackers and the
over-budget hero video (confirmed **97,941,978 bytes** against an 8 MB cap).

It records **nothing** about the 4 API_DATA endpoints, and nothing about any
third-party widget or tracker.

1. **API endpoints are outside the ledger.** A clone that is later made to run would
   contact `dev-api.apartmentary.com` without that ever appearing as a recorded residual.
   Phase 2's own stated rule is *"unlocalized means absolutized and recorded — silence
   about a residual is the failure."* On the runtime axis, the ledger is currently silent.
2. **Phase 2's carried MINOR 7 is confirmed and is a class, not an instance.** The
   `<link rel=manifest>` href was localized, but the manifest asset's JSON body still
   contains unrewritten root-relative icon paths (`/android-chrome-192x192.png`,
   `/android-chrome-512x512.png`).
3. **The `__NEXT_DATA__` JSON blob embeds two absolute unrewritten
   `media-landing.apartmentary.com` URLs** inside the dormant `popupData`.

Both are URLs nested in embedded JSON that the rewriter does not walk — but **they must
not be fixed the same way** *(corrected after review, MINOR 6)*. This report first
called them "a single fixable rule". They are not:

- The **web manifest** is a static asset; rewriting its icon URLs is safe localization.
- **`__NEXT_DATA__` is hydration input** and must stay byte-exact. The runtime compares
  against it; rewriting it risks exactly the mismatch Phase 3B is trying to measure.

Both belong in the residual ledger. Only the first should be rewritten.
