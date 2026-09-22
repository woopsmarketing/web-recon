# 06 — Service and FAQ

Evidence:
- Captures:
  - `/service` `data/apartmentary.com/2026-09-18T08-32-43-675Z/`
  - `/faq` `…08-33-12-575Z/`
  - desktop 1440 + mobile 390, `--source-package`
- Code: `static-analysis/journal-and-other-pages.md` §4–§5
- Live interactions: `interactions/interactions.json` (scenarios `service-*`, `faq-*`)
- Responsive: `responsive/responsive-probe.json`

## 1. `/service` (Level B)

**Data: fully static.**
- 0 first-party API calls in both viewports.
- The page chunk contains no service-registry call. All copy and images are literals or imports.
- The MobX store holds only UI flags (`transparentOpen`, `fairPriceOpen`, 3 scroll-reveal animation flags).

**Render order (live runtime DOM, desktop):**

| # | Section | Content shape |
|---|---|---|
| 1 | Hero | headline "기대와 설렘만 가득한 인테리어" + one sub-line + image |
| 2 | Intro | title "기분 좋은 인테리어의 시작과 끝" + paragraph |
| 3 | 3 value pillars | each: title + paragraph + image. Pillars 1–2 have a **"자세히 보기"** button that opens a **hash-modal dialog** (`#transparent` / `#price`, via the same hash-modal primitive as the drawer; store flags `transparentOpen` / `fairPriceOpen`). Live: pillar 1 → `/service#transparent`, dialog mounted. Pillar 3 has no button. The process pillar uses a layered, scroll-triggered frame animation (`service-process-frame*.png`) |
| 4 | Service types | "어떤 리모델링 서비스가 필요하신가요?" + **2 cards**: 전체 리모델링 / FULL RENOVATION, 주방 리모델링 / KITCHEN RENOVATION (Korean title, English kicker, one line) |
| 5 | Add-on services | "아파트멘터리만의 서비스" + note "자세한 내용은 방문 상담에서 안내해 드립니다." + **5 items** (A-MOVE, A-STAY, A-PAY, A-STYLING, A-MEMBERS), each: situation line + name + one-line description. Swiper with prev/next arrows |
| 6 | Footer | shared |

**Interactions and navigation:**
- Code: exactly 4 `onClick`s (2 detail dialogs + 2 Swiper arrows).
- **No `router.push`, no `window.open`**: the service-type cards are **not links**, and there are no per-service detail routes.
- Live verification: §3.

**Template value and handling:**

| Part | Classification | Template handling |
|---|---|---|
| Hero, intro | generic "services overview" page | slots (copy + media) |
| Value pillars with detail dialog | generic pattern | small typed list (title, body, optional detail body, media) or slots. Dialog vs inline expansion = presentation behaviour |
| Service types (full / kitchen) | **vertical content** (interior services the business offers) | `services[]` in the interior vertical extension (name, subtitle, description, image). Must not be defaulted to the source's two |
| Add-on services (A-*) | business-specific offerings | same `services[]` collection with a kind/group, or omitted. The A-* names are brand terms, never reused |
| Process animation | brand presentation | template visual behaviour; no content model |

Relationship to other data: `serviceTypes` on portfolio records (`OLD`/`NEW`/`KITCHEN`, plus `PET`/`GARDEN` in one enum) is
the portfolio-side classification. The `/service` page does **not** read it; the two are linked only by meaning.
For the template, "services offered" (content) and a portfolio's service tag (an item attribute) stay separate.
A future filter can reference the same closed vocabulary. That is a Slice-4+ decision, not evidence-blocking.

## 2. `/faq` (Level B)

**Data: static in the JS chunk.**
- The FAQ object literal ships in `pages__faq-*.js` and is SSR-rendered (the answers are present in the SSR HTML and the runtime DOM).
- No FAQ API: the imported `loggingService` is unused. 0 first-party API calls in the capture.

**Taxonomy (6 categories, tab order = object order):**

| Category | Items | Note |
|---|---|---|
| 상담 신청 | 5 (id 1–5) | **default** (store default `selectedFaq = "상담 신청"`) |
| 방문 상담 | 9 (6–14) | |
| 견적 및 계약 | 5 (15–17, 19–20) | **id 18 missing**: authored gap |
| 시공 및 검수 | 6 (21–26) | |
| 마감 및 관리 | 6 (27–32) | |
| 서비스 관련 | 1 (33) | |

**Render (live DOM, both viewports):**

1. Title "자주 묻는 질문" + sub-line.
2. A **고객센터** panel: hours, phone as text (**not `tel:`**), and "1:1 문의" → `window.open("http://pf.kakao.com/…")` (KakaoTalk
   channel, external, 3rd party, **http**).
3. A consult banner "…간편하게 상담 신청하세요." + 상담 신청 → `fbq Lead` + `router.push("/inquiry")`.
4. Category pill row "name (count)", horizontally scrollable.
5. An accordion of `Q.`/`A.` items for the selected category.
6. The shared bottom banner "기대와 설렘이 가득한 리모델링 경험 … 서비스 알아보기".
   - `/faq` is the only page with `getLayout service:true`.
   - Code note: the button → `/service`.

**Category switching:**
- Local MobX state (`selectedFaq = name`) with **no URL change**, so a category is not deep-linkable.
- Only the default category's items are in the SSR HTML. The other categories exist only in JS.
- SEO consequence: 27 of the 32 Q&As (5+9+5+6+6+1) are not in the initial HTML.

**Accordion default:** see §3 for the live state. The SSR/runtime DOM contains the 5 default answers as text either way (MUI
Accordion keeps collapsed content mounted).

**Template handling:**
- `faqs[]` is a typed collection: category, question, answer (rich text), order.
- Categories are a small closed list defined per site, or derived from the items.
- The page renders all items server-side (every Q&A in HTML), with category filtering as progressive enhancement. It
  optionally emits `FAQPage` structured data (SEO helper, platform class B).
- The contact panel (hours, phone, messenger link) is **site contact data** (`contact` in site settings), not FAQ content.
  Phone should be `tel:`.
- The source FAQ text and taxonomy are **never** defaulted (invariant 5). A missing FAQ → the page is omitted or needs input.

## 3. Live interaction results

(See `09` §2 for the full step log.)

Sources:
- pass 1 (`interactions.json`): `service-desktop`, `service-cards`, `service-kitchen`, `faq-desktop`, `faq-mobile`
- follow-up (`interactions-followup.json`): `faq-kakao`, `fresh-w900-service`

Nothing was typed or submitted. First-party non-GET requests were aborted; none were attempted on these pages.

**`/service`:**

| Action (desktop) | Result |
|---|---|
| pillar 1 "자세히 보기" | URL → `/service#transparent`; a dialog mounts (0 → 2 dialog nodes); no request |
| click "전체 리모델링" card | nothing: no URL change, no dialog, no text change |
| click "주방 리모델링" card | nothing (same) |
| fresh load at 900 | the hero image renders (900×328, complete), but **`scrollWidth` = 1354** on a fresh load too. The horizontal overflow is a **real source defect**, not a resize artefact (`09` §1d) |

**`/faq`:**

| Action | Result |
|---|---|
| initial state (desktop and mobile) | accordion **collapsed**: only `Q.` rows are visible; answers are not visible |
| toggle the first question | "A." + answer text appear, doc height +204 (desktop) / +194 (mobile); URL unchanged; no request |
| category "서비스 관련 (1)" | the list swaps to 1 item (5 disappear); **URL unchanged**; no request |
| category "견적 및 계약 (5)" | 5 items appear. The pill label includes the count; pass 1 missed it because the text is split across nodes |
| toggle in the new category | its answer appears (collapsed by default in every category) |
| "1:1 문의" | `window.open("http://pf.kakao.com/…", "_blank", "noopener,noreferrer")`, recorded by the hook and not executed. KakaoTalk channel, **http** |
| 상담 신청 (banner/CTA) | client transition to `/inquiry` (`_next/data/<buildId>/inquiry.json`) |

**Result:** category switching and accordion state are purely local and never reach the network. FAQ content is complete in
the JS chunk (§2). A template renders every Q&A server-side, and can use `<details>`/progressive enhancement for the same UX.
