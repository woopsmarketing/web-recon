# Site starters

`data/site-starters/<templateId>/` is what a **brand-new site** of one Template begins with when it is
created by the hosted provisioning runner (`platform/provision/`, `.github/workflows/provision-site.yml`).

A starter is two things at once:

1. **The content of a new site** — the site documents a person used to write by hand
   (`settings.json`, `slots.json`, `theme.json`, `content/business.json`, `content/banners.json`, the design
   images), with tokens where a value comes from the provisioning spec.
2. **The allowlist** — a site can be provisioned only for a template that has a starter directory, and only
   with a release that `starter.json` lists. A spec that names anything else is refused
   (`template_not_allowed`, `release_not_allowed`).

A starter is **not** a site: it has no `site.json`, no widget key, no lead endpoint, no portfolio. Those are
written by `platform/provision/scaffold.ts` from the spec. A starter is never built or published by itself.

## Files

| File | | Notes |
|---|---|---|
| `starter.json` | required | `{ "schema": "site-starter@1", "templateId": "<dir name>", "releaseIds": ["<releaseId>", …] }` |
| `settings.json` | required | section settings of the Template |
| `content/business.json` | required | `origin: "customer"`; no fact about the customer |
| `assets/registry.json` | required | plus **exactly** the image files it lists, in `assets/` |
| `slots.json` | optional | the copy and the images of the pages |
| `theme.json` | optional | |
| `content/banners.json` | optional | |

Any other file in the directory is refused (the loader lists what it found). Symlinks are refused.

## Tokens

Tokens are resolved on the **parsed JSON values**, never on the text of a file, so a brand name with quotes,
backslashes or `${…}` cannot change the structure of a document.

| Token | Value | Where it may appear |
|---|---|---|
| `{{brandName}}` | `spec.identity.brandName` | inside any string value |
| `{{phone}}` | `spec.contact.phone` as written | only inside `{ "$if": "phone", … }` |
| `{{phoneHref}}` | `tel:` + its digits | only inside `{ "$if": "phone", … }` |
| `{{email}}` | `spec.contact.email` | only inside `{ "$if": "email", … }` |

`{ "$if": "phone" | "email", "then": <value>, "else": <value> }` stands for `then` when the spec has that
contact detail. Otherwise it stands for `else`, or — when there is no `else` — the key (or the array element)
is **left out**. A whole document cannot be conditional. There is no other directive and no other token.

## The rules (product policy — the loader and `platform/test/provision.test.ts` enforce what a machine can)

A new site knows only what the spec says: a brand name, maybe a phone number, maybe an e-mail address.

- **No portfolio.** No project, no category list, no review, no manual project pick. Every project selection
  is `{ "mode": "latest" }`; a banner CTA never targets a project. The customer adds projects in BoostChat.
- **No fact we cannot know.** No years in business, project counts, awards, certificates, prices, addresses,
  staff, guarantees, "No.1", customer counts, service areas. Rewrite the sentence so it is true for any
  customer of this Template, or remove the slot.
- **The brand comes from the token.** Never the name of a demo site. Use `{{brandName}}` standalone (no Korean
  particle attached to it — the right particle depends on the name) and only in a slot whose maximum length
  leaves room for 80 characters.
- **No trace of another site**: no other site's name, hostname, e-mail address, phone number or URL.
- **Images are named `site-*`** and are design images of the Template, not a customer's project photos. The
  registry lists only images a slot or a banner shows. No logo (the Template's wordmark fallback shows the
  brand name) unless the Template requires one.
- **Phone**: fills the call slot with a `tel:` link when the spec has one; otherwise the slot is left out.
  Never a placeholder number.
- **E-mail**: shown only when the spec has one. If a Template *requires* a phone number or an e-mail address,
  do not invent one — the Template cannot have a starter until that is solved.
- **Empty-state copy must be true for an empty portfolio** (a new site shows it on day one).
- **`site.seo.indexing` is `noindex` in V1.** A new site is not offered to search engines until its owner has
  put real content on it; turning indexing on is a later, deliberate step.

## Adding a starter for another Template

1. The release must support incremental portfolio publishing (`pnpm site:portfolio-managed` would accept a
   site of it) and its release gate must have recorded `emptyState: supported`.
2. Create `data/site-starters/<templateId>/` with `starter.json` listing that release id.
3. Write the documents from the Template's own manifests (which sections and slots exist), not by copying a
   demo site and deleting lines — every sentence must pass the rules above.
4. Add the Template to the cases of `platform/test/provision.test.ts` if it needs checks of its own, and run it:
   `tsx --tsconfig platform/tsconfig.json platform/test/provision.test.ts`.
5. Build it once without touching anything outside the checkout:
   `tsx --tsconfig platform/tsconfig.json platform/cli/site-provision.ts --build-only --spec-file <a spec for it>`
   and read the pages. Remove `data/sites/<siteId>/` and `data/site-builds/<siteId>/` afterwards.
6. A new release of a Template that already has a starter: add its id to `releaseIds` after step 5 passes
   with it. Removing an id stops new sites from being created with that release; existing sites are untouched.
