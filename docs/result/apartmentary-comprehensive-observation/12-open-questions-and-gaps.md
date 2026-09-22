# 12 — Open questions and gaps

Each gap lists why it matters, whether it blocks implementation, and when to revisit. "Blocks" means a concrete blocker for
the **next step (Slice 1)** or for Step 4 (portfolio list + detail), per `docs/status/source-preservation-v2.md`.

## A. Blocking gaps

**None found.**
- Slice 1 needs a small Apartmentary section, one Template, the platform read path and fictional Site Instances. This pass
  covers the section anatomy, data contracts, header/footer/logo, responsive bands and navigation.
- Step 4 (list + detail + pagination) is covered at Level C, with live interaction evidence.

**One process blocker (not an implementation blocker):** G15. The standard Source Package observer must not be used again on
pages with view counters until it aborts first-party non-GET.

## B. Non-blocking gaps

| # | Gap | Why it matters | Blocks? | Revisit when |
|---|---|---|---|---|
| G1 | Home banner `type` values other than `GENERAL`, and video banners (`isPcVideo`/`isMobileVideo`) — no live example | Hero media variants for the PROVISIONAL banners concept | No (banners are provisional presentation media) | Step 5 (home Template), only if video hero is in scope |
| G2 | `getServerSideProps` bodies are server-only (never in client JS). Server-side data sources for shell props (`bannerData`/`popupData`/`footerData`) and detail props are inferred from props and API names | Only matters for source replay, not the template | No | Never, unless the preservation layer needs real-data SSR replay (3F not scheduled) |
| G3 | Line banner (`bannerData.isDisplay=false`) and promo popup (`isPcDisplay`/`isMobileDisplay=false`) were **not displayed** at capture time. Their rendered look is known only from code | Optional site-wide announcement surfaces | No | When an announcement-bar slot is designed (optional setting) |
| G4 | Portfolio share dialog channels (Kakao share SDK is loaded; the dialog content was mounted but channels were not enumerated) | Optional share feature | No | Step 4 detail polish, if share is in scope |
| G5 | Store-detail dialog: observed live for 1 branch (도산): static intro + representative-projects text + CTA, no API (`08` §2). The other 16 branches' dialog content (module `7140`) was not enumerated | Locations page detail content | No | Locations page work |
| G6 | `inquiry` fields `serviceType`/`addonTypes` exist in the store, but their UI control was not located, and the submit always sends `addOns:["none"]` | Only relevant to copying the source form, which is out of scope | No | Never (the contact destination is operator-configured) |
| G7 | Why the portfolio list and detail keep mobile chrome up to 1280 (explicit `max-width:1280px` flag) — the design intent is unknown | Template responsive band choice for portfolio pages | No (template design decision; the evidence documents the behaviour) | Step 4 design |
| G8 | Journal ordering: "이전" = newer, "다음" = older is now OBSERVED (SSR `prevUuid`/`nextUuid` + live clicks, `07` §2/§5). Open: the chain order was checked on 4 records only, and the server's ordering key (creation date vs manual) is unknown. Correction: the earlier "bjqdfkodlo 다음 did nothing" came from a mis-targeted click on a body paragraph, and that post has a `nextUuid` | Post navigation order in a future posts view | No | Posts page work |
| G9 | Journal "content-duplicate" crawler label: likely an extraction artefact, UNPROVEN | Crawler quality only | No | Crawler work, if ever |
| G10 | `pricePerSize` 3435 outlier (INFERRED data-entry error) | Bucket rendering robustness; the template must not crash on out-of-range values | No | Step 4 (add a test fixture with an outlier) |
| G11 | News per-year cap (≤14 observed) — server-side rule unknown | About page press list size | No | About page work |
| G13 | Posts body format for a future model (source = Unlayer XHTML + design JSON, two authoring styles) | Import/migration and rich-text format | No | When `posts` enters scope |
| G15 | View-count POSTs fire during every real visit, including the observer captures (32 in this pass; up to 2 more possible from the failed `jqodqrfdpw` attempts). The observer's portfolio captures produced 3 per viewport vs 1 per plain load; the cause was not isolated | Evidence-capture side effect on the source site: real public counters were incremented (all 32 returned 200). The side effect was foreseeable after the first detail capture, yet the standard observer was used for 7 more | No for the template. **Yes, as a process blocker:** do not run the standard observer on pages with view counters until it can abort first-party non-GET (the pass's own harnesses already did) | Before the next observer run on any site |
| G16 | `/journal/jqodqrfdpw` Source Package capture BLOCKED: the observer exited rc=1 on a `load` timeout twice (initial + one retry). A DOM-ready fallback + Level A exist (`07` §4) | Only this page's own network manifest/screenshot pair is missing. The html-block variant is covered by `ibrdwjrdqw` | No | Only if this specific post is ever needed as a faithful reference (capture with a DOM-ready wait) |
| G17 | Journal desktop prev/next buttons not exercised live (the harness hit the disabled "prev"). Mechanism from code + direct-load `?page=1` captures (`07` §5) | Desktop post-list paging UX | No (the page param and API are observed) | Posts page work |
| G18 | `/stores` per-card 상담 신청 → `/inquiry?storeName=<slug>`: code only (the live click matched the floating CTA) | Per-location contact deep link | No (`contactDestination` param is optional) | Locations page work |
| G19 | `/portfolio/[uuid]/images` swipe not exercised; fresh `/` load at 900 not measured (load timeout) | Minor: gallery sub-view gesture; home 900 media sizing | No (structure is known from the probe and captures) | Step 4 (gallery) / Step 5 (home) if relevant |
| G20 | 3 of 23 journal posts unclassified by body variant: `kqidolldbf` (known only as a `nextUuid`) and 2 never seen. 20 are classified (15 Level A + 5 from captured list bodies; 14 native / 6 html-block, `07` §3) | Completeness of the posts body-format census | No (both variants are already known and sampled) | When `posts` import/migration is planned (fetch all 23 bodies then) |

**Moved out of this register** (not unknowns, per spec §29):
- G12 (static filters under the per-site static build) is a template **decision**; see `11` §4 and `04` §6.
- G14 (`/service` overflow) is a **confirmed source defect**; see `11` §5 and `09` §1c–d. The unidentified exact element does not
  matter because the defect is not reproduced.

## C. Items that were open before this pass and are now closed

| Earlier unknown | Now |
|---|---|
| Real API anonymous access / content type (3D-A "biggest open UNKNOWN") | 200, `application/json;charset=UTF-8` (`03`) |
| `textColor` type, reviews `totalCount` | boolean; present (`03`) |
| Full portfolio record shape | 45 keys, census (`10` §3) |
| Portfolio detail families (f000011/f000012) | one template, data-driven (before-images) (`05`) |
| Journal families (f5–f9) | one template, two body-authoring styles (`07`) |
| 상담 신청 destination | internal `/inquiry` from every entry point (`01` §3) |
| Header/footer logo mechanism | inline data-URI SVG `<img>`, 3 assets, no scroll swap (`01` §4) |
| Map provider on `/stores` | none (`08` §2) |
| FAQ category URL state | none (local state) (`06`) |
| Terms `termsType` switching | shallow `router.replace ?termsType=`, deep-linkable (`08` §3) |
| Portfolio pagination semantics | 0-based `page`, 30/page, 1-based labels, numbered on mobile too (`04`) |
| FAQ accordion default | collapsed in every category (live, `06` §3) |
| Portfolio/service hero blank at 900 | resize artefact; fresh loads render the hero (`09` §1d) |
| `/service` overflow real or artefact | real (fresh load, `09` §1d) |
| Journal mobile paging | load-more (append), URL unchanged (live, `07` §5) |
| Journal 목록 behaviour | `router.back()` (live) |
| Terms `MARKETING` tab | 1 GET per switch, deep-linkable (live, `08` §3) |
