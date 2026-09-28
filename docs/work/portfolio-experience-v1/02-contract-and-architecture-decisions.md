# Portfolio Experience V1 — contract and architecture decisions (orchestrator, 2026-09-29)

Decided once, before any parallel work. Every workstream builds against this document.
The same file exists in both repos (`web-recon-track-b` and `boost-chat`, `docs/work/portfolio-experience-v1/`).

## D1. Portfolio document 1.1 — additive `media` (producer contract)

What recon showed:
- The producer's `PORTFOLIO_SCHEMA_VERSION` is `"1.0"`. Its zod validator is `.strict()`, and `scanValues` rejects null, `""`, `{}`, `[]` and **booleans** ("booleans are not part of the V0 schema").
- The consumer checks only the **major** version (`SUPPORTED_PORTFOLIO_MAJORS = {0,1}`). It ignores unknown record keys, but its parser keeps only known fields, so today `media` would be dropped silently.
- Contract 02 §23.2 already names a same-origin `cover` as a future additive minor field. SV2 says an added field is a **minor** change.

Decision: minor bump to `schemaVersion: "1.1"`. Old consumers keep working (major 1). New consumers accept both `1.0` and `1.1`.

```ts
record.media?: {
  cover?: MediaImage;        // the record's authored cover (card thumbnail)
  gallery?: MediaImage[];    // 1..12 items, the authored primary gallery in authored order
  totalCount?: number;       // integer ≥ 1; present only together with gallery; ≥ gallery.length
}
MediaImage = {
  src: string;               // same-origin absolute PATH, e.g. "/assets/03c625140dc4df674fb8.jpg"
  alt?: string;              // authored alt only (≤160 chars); omitted when not authored
  width?: number;            // positive integers; width and height both present or both absent
  height?: number;
}
```

Rules:
- `src` is a path, the same way `detailUrl` is a path. It matches `^/(?!/)[A-Za-z0-9._~%/-]{1,511}$`: no `..` segment, no backslash, no scheme, no query and no fragment. Consumers resolve it against the document's **bound public origin**, never against anything in the document. An absolute URL is invalid.
- There is **no `hasMore` field**, because booleans are not part of the schema. `hasMore` is derived: it is true when `totalCount` is present and `totalCount > gallery.length`. A source "proves more images exist" only through a known `totalCount`.
- `gallery.length === min(totalCount, 12)`. The producer exports the first 12 images in authored order.
- If a record has neither a cover nor a gallery, `media` is omitted. An empty `{}` is never emitted.
- The producer never invents `alt`. When `alt` is missing, the consumer uses a title-based fallback (`<title> 사진 N`).
- Media is **presentation only**. No matcher or ranking code reads it, and neither does the model payload (`recordForModel`).
- An invalid `media` on a record makes the consumer drop the **media only**. The record is kept (07 §12 spirit).

Producer sourcing for boost-interior-demo:
- `cover` comes from `projects.json` `cover`.
- `gallery` comes from `galleryGroups[].items[].image`, **after images only**, in authored order.
- Before/after comparison images (`item.before`) are **not exported in V1** and are not counted in `totalCount`. They sit behind a toggle on the canonical page and are not the primary gallery.
- `width`/`height` come from `assets/registry.json` through the snapshot asset resolver. They are real metadata.
- `src` is the asset's `publicPath` (`/assets/<sha256[0:20]>.<ext>`).
- bi-09…bi-19 have no gallery, so they get `media = { cover }` only. Their covers are the authored covers that the live site itself renders, reused from bi-01…bi-08. The inventory records this as a reused authored asset, not a guessed relationship.
- bi-01 has 13 after images: 12 are exported and `totalCount` is 13, so `hasMore` is derived as true.
- og:image is never used. The site-wide default is `site-hero-01`, and no page has a project-specific og:image or JSON-LD.

## D2. Card transport stays light

- The `X-Boostchat-Portfolio-Cards` header gains **no URLs**. The encoder adds one header-level media version (the snapshot `resourceVersion`) and a per-card "has cover" flag. The wire names are up to the consumer implementation, as long as they fit the 2 KiB budget.
- The decoder exposes `PortfolioCard.coverVersion?: string` on each card whose record has a cover.
- The browser builds the cover URL as `portfolioMediaPath(surfaceBase, card.id, "cover", card.coverVersion)`.
- The full gallery is fetched **only when the viewer opens**.
- Viewer capability comes from the card's `id` (a snapshot record id, INV-D) plus a surface that provides `portfolioApiBase`.

## D3. Viewer data endpoint (scoped public read)

- Widget: `GET /api/widget/[publicKey]/portfolio/[recordId]`. The tenant comes from the channel. It requires the widget embed token, like the history GET.
- Hosted: `GET /api/public/[handle]/portfolio/[recordId]`. The tenant comes from the handle.
- The response is `PortfolioViewerData` (`src/lib/portfolio-viewer/contract.ts`), which carries only authored facts, price, ≤12 same-origin image paths, `totalCount`/`hasMore`, and a validated `detailUrl`.
- No tenant id ever comes from the client. There is no global record lookup.

## D4. Image delivery: same-origin record/slot endpoint, no URL proxy

- Widget: `GET /api/widget/[publicKey]/portfolio/[recordId]/media/[slot]?v=<resourceVersion>`
- Hosted: `GET /api/public/[handle]/portfolio/[recordId]/media/[slot]?v=<resourceVersion>`
- `slot` is `cover`, or `0`…`11` (an index into the viewer image list, which is the gallery if one exists, otherwise `[cover]`).
- The fetch target is always `boundPublicOrigin + record.media.<…>.src`. The request never names the target.
- Checks:
  - tenant from the surface
  - record in the current snapshot
  - slot exists
  - https
  - URL origin must equal the bound origin, plus the existing net-guard `verifyExternalUrl`
  - redirects are **not followed**
  - timeout
  - byte cap
  - MIME allowlist (jpeg, png, webp, avif, gif) plus a magic-byte sniff; SVG is refused
  - `nosniff`
  - `Cross-Origin-Resource-Policy: same-origin`
  - `immutable` caching only when `v` equals the current resourceVersion
  - a bounded in-process cache
- The CSP is **not** widened. `img-src 'self'` stays as it is.

## D5. Parent ↔ iframe display mode and navigation (widget.js)

- New iframe → parent types, still gated by the existing triple check (`event.origin === scriptOrigin`, `event.source === iframe.contentWindow`, `data.source === "boost-chat"`):
  - `boost-chat:display-mode` with `mode ∈ {chat, portfolio}`. Any other value is ignored. The iframe never sends dimensions.
  - `boost-chat:navigate` with `destination`. The parent verifies it:
    - the URL parses
    - the protocol is `https:` (`http:` only on a loopback host, for the test harness)
    - `destination.origin === location.origin`
    - no credentials in the URL
    - `javascript:`, `data:` and `file:` are rejected by the protocol check
    - it then sets a one-time reopen marker and calls `location.assign(destination)`
- Portfolio mode: the parent makes the iframe cover the viewport (`inset:0`, 100vw × 100dvh, falling back to visualViewport height), removes the radius and shadow, and locks host scroll, restoring the previous inline values exactly.
- The iframe draws its own backdrop. On desktop it shows a centered panel of about 94vw and at most ~1120px. On mobile it goes full-bleed and safe-area aware.
- Chat mode restores the normal open geometry.

## D6. Cross-page continuity and resume security

What recon showed:
- The resume record `{conversationId, conversationProof}` lives in the **iframe's** `sessionStorage`. That storage is partitioned by (BoostChat origin, top-level site) and by tab. It survives **same-tab** navigation within the host site and is empty in a new tab.
- The proof is `HMAC(secret, conversationId + "\n" + principal)`.
- The server revalidates:
  - channel and approval
  - the embed token, whose origin is signed and allowlisted
  - rate budgets
  - the proof against the current requester's principal
  - tenant, `surface='widget'`, `actor_kind='external'`, `status='active'`, and a 15-minute idle window

Decision:
- Primary mechanism: parent-mediated **current-tab** navigation, plus the **existing** partitioned iframe resume record and HMAC proof. No new credential type is created.
- The credential never enters host-page storage. A raw conversation UUID alone is still useless, because the proof is required and bound to the requester.
- Host `sessionStorage` holds only the one-time reopen marker, `boostchat:<publicKey>:reopen` = `{v:1, t:<ms>, p:<destination pathname>}`. It contains no conversation material at all.
- On the destination page, widget.js reads and **removes** the marker. It is honoured only when it is at most 120 s old and `p === location.pathname`. When honoured, the parent adds `reopen: true` to hello, and the iframe restores and then opens.
- Ordinary site navigation never writes the marker, so it never auto-opens the widget.
- Known limit: if a browser blocks all third-party storage for the iframe, the widget cannot restore after a reload or after navigation. It starts a fresh conversation, as it does today.

## D7. "이 사례로 상담하기" is deterministic

- The public chat POST body gains an optional `portfolioSelect: <recordId>`.
- The client sends it along with the visible message `「<title>」 사례로 상담하고 싶어요.`
- The server validates that the id is in the current tenant snapshot. It then makes this turn's selection **exactly** that id through the existing `selectedPortfolioIds` merge path, overriding text-based reference resolution for this turn.
- No new state key is added. The strict state parser is unchanged.

## D8. Analytics — five events, collection only

The events are `portfolio_card_open`, `portfolio_gallery_interact`, `portfolio_select`, `portfolio_page_open` and `portfolio_viewer_close`.
- They are stored in a **new additive table** (migration 0053). The existing `analytics_event` has no properties column, and its CHECK is a closed list.
- Fields: tenant, conversation, surface, event type, portfolio id, optional image index, created_at.
- It stores no message body, name, phone or email.
- The endpoint follows the `/api/public/workflow/form` gate: conversation id plus resume proof, with the tenant read from the conversation row. It uses a prefixed analytics rate bucket.

## D9. Order (dependency-driven)

The consumer must be live **before** the producer publishes. A refresh re-parses only when the manifest version changes, and `force` does not override that. If the old consumer refreshed the 1.1 document, it would store it without media, and every later refresh would then report "unchanged".

1. Track B contract, producer and tests, then build (no publish yet).
2. BoostChat consumer, viewer, widget, analytics and selection, then tests, then deploy (media absent is still fine).
3. Track B controlled publish (rollback target preserved).
4. Audited refresh of the boost-interior-demo snapshot, then the matcher invariance check.
5. Live embedded desktop and mobile E2E, with screenshots.
