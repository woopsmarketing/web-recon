# 04 — Live deploy plan (NOT executed)

Nothing in this document has been run. No bucket, Worker, route, custom domain, DNS record, or token exists because of this task, and `wrangler login` was not used. The only Cloudflare-adjacent step already done is local: `wrangler deploy --dry-run` bundles both envs (6.09 KiB / 2.24 KiB gzip, binding `SITES → recon-sites`).

Out of bounds for the live run as well: BoostChat, BoostWeb, Supabase, and **any existing Cloudflare route, DNS record, or Worker**. The pilot adds one new hostname only.

## Cloudflare resources

| Resource | Name / value | Notes |
|---|---|---|
| R2 bucket | `recon-sites` | location hint `apac`. **No public access**: r2.dev URL stays disabled and no bucket custom domain. Only the Worker binding reads it. |
| Worker | `recon-runtime-pilot` (`wrangler.jsonc` → `env.pilot`) | module Worker `workers/recon-runtime/src/index.ts`, `compatibility_date 2026-09-15`, `workers_dev: false`, `preview_urls: false`, observability on |
| Binding | `SITES` → `recon-sites` | the only binding. No secrets and no vars. |
| Hostname | `<pilot-host>`: one **new, unused** exact hostname in a zone on the account, e.g. `recon-pilot.<zone>` | attached as a **Workers Custom Domain** (`routes: [{ pattern: "<pilot-host>", custom_domain: true }]` in `env.pilot`, currently commented out). Cloudflare creates the proxied DNS record and certificate. **Refuse any hostname that already has a DNS record or route.** |
| DNS | created by the Custom Domain | no manual DNS edits and no wildcard |
| Top-level Worker `recon-runtime` | **not deployed** | has no routes. Deploying it would expose nothing, so it is not needed. |

## API token (operator-created, stored only in the operator's shell)

Use one scoped API token passed as `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, not `wrangler login`. It needs these scopes, based on wrangler's "Edit Cloudflare Workers" template reduced to what is used. **Re-check the current Cloudflare docs when creating it.**

| Scope | Permission | Why |
|---|---|---|
| Account | Workers R2 Storage: Edit | bucket create, `r2 object put/get --remote` (site:publish) |
| Account | Workers Scripts: Edit | `wrangler deploy --env pilot` |
| Account | Account Settings: Read | wrangler account lookup |
| Zone (**only** the pilot zone) | Workers Routes: Edit | attach the Custom Domain |
| Zone (**only** the pilot zone) | DNS: Edit | Custom Domain creates its DNS record (verify it is required) |
| User | User Details: Read, Memberships: Read | wrangler identity checks |

A later step can split this into a **publish token** (R2 Storage Edit only, used by `site:publish`) and a **deploy token** (Workers Scripts + zone scopes).

## Ordered commands for the future live run

Run from the repo root. `<pilot-host>` is filled in by the operator.

```sh
# 0. Local gates (must all pass on the package that will go live)
pnpm test:publish                       # unit: mapper, ordering, failures, handler, package identity
pnpm test:publish:e2e                   # local wrangler publish + wrangler dev + Playwright
pnpm typecheck:runtime
pnpm site:publish --site boost-interior-demo --host <pilot-host> --dry-run   # review keys / counts

# 1. Credentials (no wrangler login)
export CLOUDFLARE_API_TOKEN=…  CLOUDFLARE_ACCOUNT_ID=…
npx wrangler whoami

# 2. Pre-checks: nothing existing is touched
npx wrangler r2 bucket list                          # recon-sites must NOT exist yet (or be ours and empty)
# In the dashboard or DNS API: <pilot-host> has NO DNS record and NO Worker route; record the zone's existing routes for later comparison

# 3. Bucket (private)
npx wrangler r2 bucket create recon-sites --location apac
npx wrangler r2 bucket dev-url get recon-sites       # expect: disabled

# 4. Publish package + pointer (upload → verify → seal → pointer)
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> --remote
#    expect: uploaded N / verified N / pointerWrite written / previous null
RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> --remote
#    expect: skipped-sealed, pointer unchanged (immutability check)

# 5. Worker: enable the pilot Custom Domain in wrangler.jsonc (uncomment env.pilot.routes, set <pilot-host>), then
npx wrangler deploy -c workers/recon-runtime/wrangler.jsonc --env pilot --dry-run
npx wrangler deploy -c workers/recon-runtime/wrangler.jsonc --env pilot

# 6. Smoke (live)
curl -sI https://<pilot-host>/                       # 200 text/html, must-revalidate, ETag, nosniff
curl -sI https://<pilot-host>/_next/static/chunks/<any>.js   # immutable
curl -s -o /dev/null -w '%{http_code}\n' https://<pilot-host>/no-such-page      # 404
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<pilot-host>/          # 405
curl -s -o /dev/null -w '%{http_code}\n' -H "If-None-Match: <etag>" https://<pilot-host>/   # 304
#    Then the Playwright part of publish-e2e against https://<pilot-host> (to add: E2E_BASE override, read-only)
npx wrangler tail --env pilot -c workers/recon-runtime/wrangler.jsonc   # watch for 5xx

# 7. Post-check: the zone's other routes / DNS records are unchanged (compare with step 2)
```

## Updating the site later

1. `pnpm site:build boost-interior-demo`. This produces a new package and a new `packageHash`.
2. `RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> --remote`. This uploads under a new prefix, seals it, and moves the pointer. `previous` records the old package.

The new version is live on the next request. The Worker does not use the Cache API, so there is nothing to purge.

## Rollback

| What | How | Effect |
|---|---|---|
| **Content** (bad package) | `RECON_PUBLISH_ALLOW_REMOTE=1 pnpm site:publish --site boost-interior-demo --host <pilot-host> --remote --rollback` | re-points `routing/<pilot-host>.json` at `previous.packageHash`. Refused unless that package's seal is in the bucket. No upload. Running it again rolls forward. |
| **Worker code** | `npx wrangler rollback --env pilot -c workers/recon-runtime/wrangler.jsonc` (or `wrangler deployments list` → pick a version) | previous Worker version |
| **Take the pilot offline** | re-comment `env.pilot.routes`, then `npx wrangler deploy --env pilot`, or remove the Custom Domain in the dashboard | the hostname stops resolving to the Worker. Bucket and packages stay. |
| **Unknown/removed host** | delete `routing/<host>.json` | Worker answers `404 unknown host` (never another site) |

Package prefixes are never deleted by any of these. Old bytes stay addressable for rollback.

## Risks to decide before or at the live run

| Risk | Note |
|---|---|
| Version skew after a publish | A tab still running the OLD package's JS asks for the old `_next/static/*` chunks and RSC files. The pointer now serves only the NEW package, so those requests get 404. Next falls back to a hard navigation on a failed RSC fetch; lazy chunk loads may error until reload. Mitigation, if it shows up: fall back to `previous.packageHash` for `_next/static/**` misses only. |
| Two R2 reads per request | pointer + object, with no Cache API. Fine for a pilot. If volume grows, add a short in-isolate pointer memo or Cache API for immutable keys. |
| Remote publish speed | one wrangler process per object (serial locally; remote defaults to concurrency 4). About 160 objects is fine. For many sites, switch the store to the R2 S3 API (SigV4) behind the same `ObjectStore` interface. |
| Token scope | zone scopes must be limited to the pilot zone. The token must never be committed. |
| Hostname choice | must be new. Attaching to a hostname already served by BoostWeb or others is out of scope. |
