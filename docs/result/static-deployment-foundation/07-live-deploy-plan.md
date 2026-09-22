# 07 — Live deploy plan (NOT executed)

**Nothing in this document has been run.** No bucket, Worker, route, custom domain, DNS record or token exists because of this task. `wrangler login` was not used and no command was run with `--remote`. Every step from §3 on needs the user's separate, explicit authorisation.

Out of bounds for the live run too: BoostChat, BoostWeb, Site Factory, Supabase, Railway, and **every existing Cloudflare route, DNS record, Worker and bucket**. The pilot adds one new bucket, one new Worker and one new exact hostname.

Commands are the ones implemented in this branch (wrangler 4.135.0 from the repo's `node_modules`). Run them from the repo root. `<pilot-host>` and `<zone>` are chosen by the operator; `<A>` is the `packageHash` printed by the dry run.

## 1. Blockers before a live run

| # | Blocker | Why | Who |
|---|---|---|---|
| L1 | **The demo package is built for `https://boost-interior-demo.example`.** Canonical URLs, `sitemap.xml` and the `Sitemap:` line in `robots.txt` carry that origin (`data/sites/boost-interior-demo/site.json` → `publicOrigin`). | Serving it on a real hostname would publish canonicals that point at a domain that does not exist. `site:publish --remote` refuses this package for any other host. | Operator sets `publicOrigin` to `https://<pilot-host>` and rebuilds. That is a Site Data change and gives a new `packageHash`. `ia151` D1 compares the demo's site files with a capture, so that gate has to be generalised in the same change, not weakened. |
| L2 | Pilot hostname and attachment form not chosen | It must be a **new, unused** exact hostname in a zone on the account. No wildcard, and no hostname that already has a DNS record. The example in the brief, `interior-demo.boostweb.co.kr`, sits in a zone that belongs to another product and is known to carry a wildcard Worker route (`*.boostweb.co.kr/*`). That needs the zone owner's sign-off and attachment form (b) in step 4; a hostname in a zone without matching routes is simpler. | User |
| L3 | No scoped Cloudflare API token | See §2. | User |
| L4 | Explicit authorisation for bucket creation, Worker deploy, custom domain, R2 writes and the pointer write | Stop gate of this task | User |
| L5 | Indexing decision for a public demo | The package ships `robots.txt` `Allow: /` and a sitemap. The demo shows a fictional business with AI-generated photos. Whether search engines may index it is a Site Data / Template decision, not a delivery one. | User |

Not blockers, but known: 1.5.0/1.5.1 limitations still apply (`.example` contact details, mailto hand-off only, no OG tags), and Track A's branch must not be merged with this one before Track A completes.

## 2. Credentials

Use one scoped API token in the operator's shell as `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`. Do not use `wrangler login`. Nothing is written to the repo, and the publisher never reads or prints these variables; wrangler does.

Scopes, reduced from wrangler's "Edit Cloudflare Workers" template. **Re-check the current Cloudflare documentation when creating the token.**

| Scope | Permission | Used by |
|---|---|---|
| Account | Workers R2 Storage: Edit | bucket create, `site:publish --remote` |
| Account | Workers Scripts: Edit | `wrangler deploy --env pilot` |
| Account | Account Settings: Read | wrangler account lookup |
| Zone, **pilot zone only** | Workers Routes: Edit | custom domain |
| Zone, **pilot zone only** | DNS: Edit | the custom domain creates its DNS record (verify that it is required) |
| User | User Details: Read, Memberships: Read | `wrangler whoami` |

A later step can split this into a publish token (R2 only) and a deploy token.

## 3. Sequence

```sh
# ── 0. Local gates, on the package that will go live (after L1's rebuild) ─────────────────────
pnpm typecheck:platform && pnpm typecheck:runtime
pnpm test:platform
pnpm test:publish                # publisher + resolver + Worker handler
pnpm test:publish:e2e            # local wrangler publish + wrangler dev + Playwright
pnpm site:publish --site boost-interior-demo --host <pilot-host> --remote --dry-run
#   offline plan: keys, types, cache classes, pointer. Must NOT fail on "built for …" (L1).
#   Note <A> = packageHash.

# ── 1. Cloudflare authentication ─────────────────────────────────────────────────────────────
export CLOUDFLARE_API_TOKEN=…  CLOUDFLARE_ACCOUNT_ID=…        # shell only, never a file
./node_modules/.bin/wrangler whoami

# ── 2. R2 bucket (private) ───────────────────────────────────────────────────────────────────
./node_modules/.bin/wrangler r2 bucket list                   # boost-sites-artifacts must NOT exist
./node_modules/.bin/wrangler r2 bucket create boost-sites-artifacts --location apac
./node_modules/.bin/wrangler r2 bucket dev-url get boost-sites-artifacts   # expect: disabled
./node_modules/.bin/wrangler r2 bucket domain list boost-sites-artifacts   # expect: none

# ── 3. Deploy recon-runtime (no hostname yet: env.pilot.routes is still commented out) ───────
./node_modules/.bin/wrangler deploy -c workers/recon-runtime/wrangler.jsonc --env pilot --dry-run
./node_modules/.bin/wrangler deploy -c workers/recon-runtime/wrangler.jsonc --env pilot
#   workers_dev and preview_urls are false, so nothing is reachable yet.

# ── 4. Exact pilot hostname ──────────────────────────────────────────────────────────────────
#   Before: record the zone's existing Worker routes and DNS records. <pilot-host> must have no DNS record.
#   Edit workers/recon-runtime/wrangler.jsonc → env.pilot and uncomment ONE form:
#   (a) no existing route in the zone matches <pilot-host>  → Workers Custom Domain
#         "routes": [ { "pattern": "<pilot-host>", "custom_domain": true } ]
#   (b) an existing route matches it (e.g. a wildcard "*.<zone>/*") → exact route + a proxied DNS
#       record for <pilot-host> created by hand. Reason (Cloudflare docs, checked 2026-09-21):
#       "A Worker running on a Custom Domain is treated as an origin. Any Workers running on routes
#       before your Custom Domain can optionally call [it]", so with (a) the OTHER product's Worker
#       would answer first; and "the most specific route pattern wins", so an exact route does win.
#         "routes": [ { "pattern": "<pilot-host>/*", "zone_name": "<zone>" } ]
#   Neither form edits or removes an existing route.
./node_modules/.bin/wrangler deploy -c workers/recon-runtime/wrangler.jsonc --env pilot
curl -s -w ' %{http_code}\n' https://<pilot-host>/           # expect: "unknown host 404" (fails closed, no pointer yet)
#   After: the zone's other routes and DNS records are unchanged.

# ── 5. Upload the immutable package (pointer untouched) ──────────────────────────────────────
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> \
  --remote --dry-run --check-store
#   read-only look at the bucket (reads of the live account are gated too): expect seal absent →
#   would upload N; host serves nothing
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> \
  --remote --no-activate --expect-package <A>
#   expect: status "uploaded", uploaded N, verified N, pointerWrite "not-activated"

# ── 6. Verify the package in the bucket ──────────────────────────────────────────────────────
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> \
  --remote --no-activate --reverify --expect-package <A>
#   expect: skipped-sealed, "reverified N/N sealed objects"
curl -s -w ' %{http_code}\n' https://<pilot-host>/           # still "unknown host 404"

# ── 7. Activate the pointer (the only step that changes what visitors get) ───────────────────
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> \
  --remote --expect-package <A> --expect-live none
#   expect: skipped-sealed, uploaded 0, pointerWrite "written", previous null

# ── 8. HTTP smoke ────────────────────────────────────────────────────────────────────────────
curl -sI https://<pilot-host>/                               # 200 text/html, max-age=0 must-revalidate, ETag, nosniff
curl -sI https://<pilot-host>/robots.txt                     # 200 text/plain
curl -sI https://<pilot-host>/sitemap.xml                    # 200 application/xml
curl -s -o /dev/null -w '%{http_code}\n' https://<pilot-host>/no-such-page     # 404
curl -s -o /dev/null -w '%{http_code}\n' https://<pilot-host>/about/           # 404 (no trailing-slash pages)
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<pilot-host>/         # 405
curl -s -o /dev/null -w '%{http_code}\n' "https://<pilot-host>/..%2f..%2fx"    # 400

# ── 9 + 10. Browser smoke and SEO smoke, read-only, against the live host ────────────────────
E2E_BASE=https://<pilot-host> pnpm test:publish:e2e
#   No publish, no wrangler dev, zero writes. Byte-compares every served file with the local
#   package, then 404 / HEAD / 304 / 405 / traversal, Playwright at 390 and 1440 (menu, gallery,
#   contact form, client navigation), JS-disabled pages, title / description / canonical / JSON-LD,
#   robots, every sitemap URL, and "canonical origin = live origin".
#   Result: docs/result/static-deployment-foundation/proof/live-e2e.json
./node_modules/.bin/wrangler tail recon-runtime-pilot         # status >= 400 lines only; watch for 5xx

# ── 11. Rollback drill (needs a second sealed package <B>: the first real site update) ───────
pnpm site:build boost-interior-demo                           # after a Site Data change → <B>
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> \
  --remote --expect-package <B> --expect-live <A>             # pointer A → B, previous = A
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> \
  --remote --rollback --expect-live <B>                       # pointer B → A, nothing uploaded
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> \
  --remote --dry-run --check-store
#   read-only: expect "host serves <A> … → pointer write" (the local current package is <B>), and a
#   page that differs between A and B shows A's content in the browser
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> \
  --remote --rollback --expect-live <A>                       # roll forward to B again
E2E_BASE=https://<pilot-host> pnpm test:publish:e2e           # B is served byte for byte
```

## 4. Updating the site later

1. `pnpm site:build <siteId>` gives a new package and a new `packageHash`.
2. `RECON_PUBLISH_ALLOW_REMOTE=1 site:publish … --remote --dry-run --check-store`, then `RECON_PUBLISH_ALLOW_REMOTE=1 site:publish … --remote --expect-package <new> --expect-live <current>`.

The new package is live on the next request. The runtime does not use the Cache API, so there is no purge.

## 5. Rollback and taking the pilot down

| What | How | Effect |
|---|---|---|
| Bad package | `site:publish --site <siteId> --host <pilot-host> --remote --rollback [--expect-live <hash>]` | the pointer returns to `previous`. Refused unless that package's seal is in the bucket. No upload. Running it again rolls forward. |
| Bad Worker version | `./node_modules/.bin/wrangler rollback --env pilot -c workers/recon-runtime/wrangler.jsonc` | previous Worker version |
| Take the pilot offline | re-comment `env.pilot.routes`, deploy again, or remove the custom domain in the dashboard | the hostname stops reaching the Worker. Bucket and packages stay. |
| Unpublish a hostname | delete `routing/<host>.json` (`wrangler r2 object delete`) | the Worker answers `404 unknown host`, never another site |

No package prefix is deleted by any of these.

## 6. Risks to decide at the live run

| Risk | Note |
|---|---|
| Version skew after a publish | A tab that still runs the old package's JS asks for old `_next/static/*` chunks and RSC files. The pointer now serves only the new package, so those requests get 404. Next falls back to a full navigation when an RSC fetch fails; a lazy chunk may error until reload. Possible later mitigation: serve `_next/static/**` misses from `previous.packageHash`. Not built. |
| Two R2 reads per request | pointer + object, no Cache API. Correct first. If volume matters, add a short in-isolate pointer memo, or the Cache API with `packageHash` + object key as the cache key. |
| Publish speed | one wrangler process per object: about 160 objects, uploaded and read back. Fine for a pilot. For many sites move `ObjectStore` to the R2 S3 API; the interface stays. |
| Concurrent operators | the pointer write is not atomic. Use `--expect-live` on every live publish and rollback. Two publishers that interleave inside the read-then-write window are not detected: the last writer wins, `previous` may be wrong, and the site-change guard can be passed. A conditional put needs the S3 API or a Worker-side writer. |
| Operator machine is already logged in to wrangler | This machine has a wrangler OAuth login, so any `--remote` command would reach a real account without a token being exported. The CLI gates every bucket contact behind `RECON_PUBLISH_ALLOW_REMOTE=1`; `wrangler deploy` and `wrangler r2 bucket …` have no such gate. Run `wrangler whoami` first and check that it is the intended account. |
| Host header | The Worker selects the site by the request's hostname. With `workers_dev` and `preview_urls` off, the only entry point is the attached hostname. Package bytes are public anyway. |
| Security headers | The runtime adds `nosniff` only. No CSP, HSTS or frame rules; SVG is served same-origin. Acceptable for a static marketing pilot; decide before real customer sites. |
| Bucket-level immutability | `wrangler r2 bucket lock` may be able to forbid overwrites under `sites/`. It was not evaluated. It would conflict with re-uploading an unsealed (interrupted) prefix. Verify against current documentation first. |
| Edge behaviour not testable locally | automatic compression and the resulting weak `ETag`s (the 304 comparison is weak, so both forms match), `Content-Length` on streamed bodies, HEAD on a custom domain, the wrangler **remote** error text for a missing key (only "specified key does not exist" is treated as "absent"; any other wording fails closed on the first remote read). |
| Token scope | zone scopes limited to the pilot zone; the token is never committed. |
