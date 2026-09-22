# 03 — Feature mapping

Every mapping below rests on multiple independent pieces of evidence. Offsets are
byte offsets into the Phase 1 desktop bodies. Nothing was executed.

| Feature | Implemented by | Confidence |
|---|---|---|
| Carousel (Swiper) | library in **sc0026 / chunk 2924** — core module 2544 @104980, React module 2546 @92292; wrapper `Carousel` module 3640 in **sc0027** @41897; 4 call sites in **sc0028** | HIGH |
| Animation (AOS) | library bundled **inside sc0025 / `pages/_app`** @92450–94381; consumers sc0027, sc0028 | HIGH |
| Responsive switching | MUI `useMediaQuery` module 8396 in **sc0025** @55059 (`window.matchMedia` + `addListener`); decision point **sc0028** @4867 | HIGH |
| Navigation | `next/router` module 1163 in **sc0025** @295827; 8 `router.push` onClick sites in **sc0028** | HIGH |
| Menu / modal | MUI Portal + ModalManager in **sc0026** @37658; `createPortal` in **sc0023** @117518; popup app code **sc0027** @240214 | MEDIUM |
| Data fetching | axios XHR adapter **sc0025** @94608 + generated client @270791; service registry module 9267 **sc0027** @260142. **sc0028 has zero fetch/axios/XHR primitives** — call sites only | HIGH |

## Rendered DOM facts (verified directly, not inferred)

| | desktop | mobile |
|---|---|---|
| `<a href>` elements | **0** | **0** |
| swiper nodes | 38 | 35 |
| `data-aos` elements | 16 (plus `data-aos-*` config on `<body>`) | 16 (+ body) |
| `<button>` elements | 32 | 21 |

The Phase 2 clones match their respective source viewports exactly.

The **zero `<a href>`** figure is confirmed across all four DOM targets. Every route
change on this page is a `router.push` inside a click handler. Consequences: a static
clone has no working internal navigation at all, and any href-rewriting, link-graph or
internal-SEO step has literally nothing to operate on.

**The SSR document renders the empty-data state.** `document/response.html` contains
**0 swiper nodes** and 109 `<div>`s / 28,118 characters inside `#__next`. That is not
bare chrome *(corrected after review, MINOR 1)*: it holds the hero copy, the CTAs, both
portfolio headings — **each rendering a count of `0`** — and the full footer. The server
executed the page with empty collections and serialized the result. The carousels are
absent because their data is, not because the page is unrendered.

## Q11 — Is Swiper separable? **B — embedded in shared vendor chunk 2924.** Independent of React: **NO.**

Three pieces of evidence, each sufficient on its own:

1. **sc0026 @98936** — the Swiper React component is `forwardRef` + `useState("swiper")`
   and **renders `.swiper` / `.swiper-wrapper` / `.swiper-slide` itself**
   (`tag="div", wrapperTag="div"`). The React binding decides *which slides exist* with
   `n.Children.toArray` filtered on `displayName.includes("SwiperSlide")` (@95196).

   *Corrected after review (M5):* this report originally added that Swiper "never looks
   at the document to find its slides". **That is false.** Once React has rendered them,
   Swiper core discovers slides from the DOM — `.${slideClass}, swiper-slide` over the
   wrapper's children (sc0026 @114250, @121382, @123683) — and the app itself calls
   `e.el.getElementsByClassName("swiper-slide")` (sc0028 @6887).
2. **sc0028 @8002** — behaviour arrives as React props: `onSwiper` / `onAfterInit` /
   `onSlideChange` write into refs and a mobx store. The *configuration* is not in the
   DOM, but it **is** recoverable — as literals in the bundle: `autoplay:{delay:5e3,…},
   loop:!0` (sc0028 @7124), `spaceBetween` default 50 (sc0027 @42153).
3. **sc0027 @42952** — `slidesPerView: Q||(y?3:1)` where
   `y = useMediaQuery(breakpoints.up("md"))`. The progress bar, prev/next buttons,
   keyboard arrows and hero-video advance all reach `swiperRef.current` from React
   sibling components.

### What the verdict rests on, after correction

The verdict stands — **B, and not independent of the React runtime** — but on narrower
grounds than first stated. Swiper's *discovery* of slides is DOM-based and its
*parameters* are recoverable. What is not separable is its **behaviour**: slide state is
mirrored into a mobx store through React callbacks, `slidesPerView` is chosen by a React
hook, and five controls reach the instance through a React ref.

That makes a vanilla Swiper over the frozen Phase 2 DOM **more viable than this report
first claimed**: Swiper core (module 2544) can find the 38 preserved slides, and its
configuration can be read from literals rather than guessed. It would still drop every
store-driven behaviour — progress bar, controls, hero-video advance. It would be a
faithful-parameter **reconstruction**, not preservation. **No clean separation of the
source's behaviour exists.**

Two related isolation levers are also unavailable: **AOS is bundled inside `pages/_app`**,
so "drop the third-party animation script" is not an option, and Swiper is two webpack
module factories inside a 166 KB shared chunk, not a separable file.

## Q12 — UI / data coupling: **RUNTIME_COUPLED**

Not merely bundle-colocated. All four carousels sit behind a **length guard on a mobx
array that is populated only by `useEffect` axios calls**, with slides `.map()`ed out of
it:

- `N.length>0 &&` @6665 — hero banner
- `o.length ? … : null` @~2340 — reviews
- `totalCount: z.length` @11514 and `totalCount: E.length` @14541 — portfolio grids
- `useEffect(()=>{T();k();A()},[])` @5233 fires the three fetches

**No API response → no carousel nodes.** Not "a carousel with no slides" — the
components return `null`.

### The `__NEXT_DATA__` cross-check refutes the pre-rendered-data hypothesis

`__NEXT_DATA__` is 1,819 bytes (sha256 byte-identical to `config/cf0001…json`, so the
capture is complete, not truncated). `gssp: true`. `pageProps` has exactly three keys,
all contributed by `_app` (`appGip: true`) — the `/` page contributes **no** server props:

| key | state |
|---|---|
| `bannerData` | real text, but `isDisplay: false` — hidden |
| `popupData` | `isPcDisplay: false` / `isMobileDisplay: false` — hidden |
| `footerData` | genuinely complete (company, address, phone, socials) |

**Absent: hero banner carousel, both portfolio grids, review carousel.** The working
hypothesis posed in the Phase 3A task brief — that pre-rendered data might remove the API
dependency — is **false for this page**. *(Earlier wording attributed that hypothesis to
the Phase 2 handoff; review MINOR 7 found no trace of it there.)* Layout chrome is SSR-backed via `getLayout` (sc0027 @35213)
and is *not* coupled.

## A structural finding: there is no separate mobile build

Mobile ships **byte-identical chunks** (page chunk md5 `a43083e2baffb6ef5f17f8d4032eaa3e`).
Desktop and mobile are **two runtime states of one program**, selected at runtime by
`useMediaQuery`. Phase 2's decision to keep two static variants therefore remains correct
as an *evidence* decision — but it also means responsive differences can never be
resolved by swapping bundles. Only the running program produces the switch.

Per the standing instruction, no breakpoint number found near the responsive decision
point is treated as a rule; the switching mechanism, not any constant, is the finding.
