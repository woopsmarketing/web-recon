# 01 — Source component (Q1, Q2, §3, §6)

## Q1. What creates the left visual — `<video>` (a React `"video"` element with one `<source>`)

**Source code** (captured Phase 1 bundle, unmodified):

- File: `data/apartmentary.com/2026-09-16T05-27-10-722Z/viewports/desktop/source-package/scripts/sc0027.f3f2a3778df4.js`
  (sha256 `f3f2a3778df4…edfd`, source `/_next/static/chunks/7925-44556921d193a2a3.js`), webpack module **1251**:

```js
M=function(A){var e=A.video,i=void 0!==e&&e, M=A.isPortfolio,E=void 0!==M&&M,
  Q=(0,c.Z)(I.breakpoints.up("md")),                    // useMediaQuery(theme.breakpoints.up("md"))
  C=(0,c.Z)("(max-width:1280px)")&&Q&&E, …
 return Box{display:flex, paddingX:Q?0:"20px",
  children: Box{display:"flex", flexDirection:Q?"row":"column", children:[
   i ? "video"{style:{objectFit:"cover",width:"510px",maxWidth:"55%"}, muted:!0, loop:!0, autoPlay:!0, playsInline:!0,
          children:"source"{src:"https://apartmentary-static.s3.ap-northeast-2.amazonaws.com/main-introduce.mp4", type:"video/mp4"}}
     : Image{"data-aos":"fade-up", src:Q?"/_next/static/media/main-introduce.93c80796.jpg":"…/main-introduce-mobile.ac8f0cb5.jpg", …},
   Box{width:"80px"},
   Box{…(i?{}:{"data-aos":"fade-up","data-aos-delay":"300"}), children:[ Typography "기대와 설렘이 가득한\n리모델링 경험", …, Button "서비스 알아보기" ]}
 ]}}
```

- Caller: `sc0028.dba4c3c5f366.js` (sha256 `dba4c3c5…d3ef`, source `/_next/static/chunks/pages/index-798ca695bc5c80ee.js`),
  homepage `G` component: `C=i(1251)` … `(0,r.tZ)(u.Z,{children:(0,r.tZ)(C.Z,{video:!0})})`.
  → The homepage always takes the **`video` branch**. The `main-introduce*.jpg` `<Image>` branch is dead on this page
  (used only by other callers with `video` falsy).

**Captured DOM** (Phase 1 `dom.json`, desktop 1440): `video` e000165, inline style `object-fit:cover;width:510px;max-width:55%`,
box **x 224.1, y 1026.2, 510×700**, `effectiveVisible:true`; child `source` src = the S3 URL. The heading
`<p>기대와 설렘이 가득한\n리모델링 경험` is in the sibling Box of the same flex row (x 814). No other `<video>` exists on the page.

**Pixel evidence:** Phase 1 `viewports/desktop/screenshot.png` shows a yellow frame with the "A" mark at exactly that box;
`viewports/mobile/screenshot.png` shows a live-footage frame (vase) at x 20, 192.5×264.2 — i.e. video frames, not a static image.

Not img / background-image / picture / canvas / dynamically-inserted media (it is in the SSR `response.html` markup already).

## Q2. Is it `main-introduce.mp4`? — **YES, proven (not inferred from filename)**

| Evidence | Value |
|---|---|
| source code | module 1251 `source.src` literal = the S3 URL (only media source in the video branch) |
| captured DOM | `source[src]` = S3 URL; `assets/manifest.json` as0066 `video.currentSrc` = S3 URL |
| network | `network/manifest.json` n0028/n0039/n0058/n0059: `resourceType:"media"`, 206, `video/mp4`, `content-length 97941978` (range requests), etag `79a6e1fe…-6` |
| initiator | `{type:"parser", url:"https://apartmentary.com/", lineNumber:35}` — the SSR document line holding the `<video>` |
| asset join | as0066/as0067 `network.requestId: n0028` ↔ elementPath `…>video[0]` |
| repro | `readyState 4`, `videoWidth×videoHeight 1020×1400` from that URL; 1020/1400 = 510/700 = the captured box ratio |

## §3. Media behaviour (captured build)

| Property | Value |
|---|---|
| src | `<source src=…main-introduce.mp4 type=video/mp4>` (no `src` on `<video>`) |
| poster | **none** |
| preload | no attribute (Chrome reports `metadata`) |
| autoplay / muted / loop / playsInline | true / true / true / true |
| controls | none |
| object-fit | cover, width 510px, max-width 55% |
| AOS | **none on the video branch** (`data-aos` only on the image branch and on the text box when `video` is falsy) |
| load start | immediately at parse (initiator `parser`, startedAt 398 ms desktop / 381 ms mobile) — not intersection/scroll gated |

Live site was not contacted for HTML/JS; the captured build is authoritative. (The repro fetched only the MP4 from S3.)

## §6. Responsive intent

The `<video>` is **not width-gated** — it renders at every width. `md` only switches layout:

| Width | `Q = up("md")` | Layout | Captured evidence |
|---|---|---|---|
| ≥ md (desktop/intermediate ≥ 900) | true | row: video **left** (510px, ≤55%), 80px gap, text right | 1440: 510×700 at x 224 |
| < md (tablet < 900, mobile) | false | column: video **on top** (55% of content width), text below, paddingX 20 | 390: 192.5×264.2 at x 20, heading below at y 1014 |

`md` value: no custom `breakpoints.values` found in captured chunks; MUI default `{xs:0,sm:600,md:900,lg:1200,xl:1536}`
appears in `sc0025.e6a0597718ac.js` (`_app`). So md = **900 px** for this component too.
`C` (340px variant) requires `isPortfolio`, which the homepage does not pass → irrelevant here.
SSR markup is the `<md` variant (`useMediaQuery` is false on the server), switched after hydration.

**Mobile must NOT omit the visual** — it is intended to appear above the heading.
