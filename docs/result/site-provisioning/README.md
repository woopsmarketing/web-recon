# Hosted site provisioning — runbook

BoostChat's Super Admin creates a provisioning job; BoostChat dispatches `.github/workflows/provision-site.yml`
with the job id; the runner creates the site with **no human step and no Mac**.
Contract: `boost-chat/docs/reports/auto-onboarding-v1.md` §3.2 (runner API) and §7 (routing).

```
claim → scaffold (0 projects) → build → [built] → upload → announce → [announced]
      → Worker route → [route_ready] → wait for BoostChat's first revision → routing pointer → [activated]
```

The hostname becomes public in the last step only. Any failure after the claim sends one `failed` event
`{ step, code, message }`; nothing is deleted, and every step is an "ensure", so **re-running the same job is safe**.

| Code | Where |
|---|---|
| `platform/provision/` | spec, starter, scaffold, package check, routes, BoostChat client, the sequence |
| `platform/cli/site-provision.ts` | the runner (environment only; exit codes in its header) |
| `platform/cli/runtime-deploy.ts` | the only way to deploy the runtime Worker now |
| `data/site-starters/` | what a new site starts with + the template/release allowlist (`README.md` there) |

## One-time setup (GitHub repository settings)

| Name | Kind | What it is / permission |
|---|---|---|
| `BOOSTCHAT_BASE_URL` | variable | `https://boostchat.co.kr` |
| `BOOSTCHAT_PUBLISHER_TOKEN` | secret | BoostChat publisher API bearer token (the one `site:publish` uses) |
| `CLOUDFLARE_API_TOKEN` | secret | a token for the runner only: **Account · Workers R2 Storage: Edit** and **Zone `boostweb.co.kr` · Workers Routes: Edit**. Nothing else — it does not deploy a Worker |
| `CLOUDFLARE_ACCOUNT_ID` | secret | the account of the bucket `boost-sites-artifacts` |
| `CLOUDFLARE_ZONE_ID` | secret | zone id of `boostweb.co.kr` |

`data/site-starters/` must be **committed** (the root `.gitignore` ignores `data/*`; it needs
`!data/site-starters/` and `!data/site-starters/**` like the three directories already re-included).

## Which code the workflow runs (the trusted branch)

`source_ref` must be a **full commit SHA**, and that commit must be on the trusted branch named in the
workflow file (`TRUSTED_BRANCH`, today `portfolio-v2/incremental-runtime`): its head or one of its ancestors.
The second step of the workflow checks this through the compare API before anything from the checkout runs,
for smoke runs too. A pull-request head, a fork's commit, a branch name or a short SHA is refused.

- The workflow file is read from the ref the run is dispatched on — BoostChat dispatches on `main`
  (`SITE_PROVISIONING_GITHUB_REF`). **After changing `.github/workflows/provision-site.yml` on the working
  branch, copy the same file to `main`**; the test `H1` checks the file of the checkout, not the one on `main`.
- BoostChat's `SITE_PROVISIONING_SOURCE_REF` is the commit to run, and it accepts a 40-hex SHA only.
- If the working branch is renamed or retired, change `TRUSTED_BRANCH` (the workflow then fails closed until
  that is done).

## Smoke run (no secret, nothing leaves the runner)

Actions → `provision-site` → Run workflow → `source_ref` = the full SHA of the commit to test, `smoke` = true.
It installs, primes the pnpm store, and builds the fixture site
(`platform/provision/fixtures/smoke-spec.json`) with zero projects. Green = the checkout can build a new site
on a GitHub runner. Locally: `tsx --tsconfig platform/tsconfig.json platform/cli/site-provision.ts --build-only
--spec-file platform/provision/fixtures/smoke-spec.json` (then remove `data/sites/provision-smoke/` and
`data/site-builds/provision-smoke/`).

## When a job fails

The run's log names the step and the code; BoostChat shows the same `{ step, code, message }`.

| Step · code | Meaning | What to do |
|---|---|---|
| exit 3, no event | the claim was refused (job not found / not waiting / token) | check the job in BoostChat and `BOOSTCHAT_PUBLISHER_TOKEN` |
| `unknown` · `runner_config` | a Cloudflare variable is missing or malformed | fix the repository secret, retry the job |
| `scaffold` · `template_not_allowed` / `release_not_allowed` / `release_hash_mismatch` | the spec names a template or release this checkout has no starter for | align BoostChat's catalog with `data/site-starters/` at `source_ref` |
| `scaffold` · `site_exists_different` | `data/sites/<siteId>/` exists at `source_ref` with other content | the site id is taken — a new job needs another id |
| `build` · `build_failed` / `package_check_failed` | the build broke, or the package is not what the spec asked for | read the log; a starter or release problem, not the customer's |
| `upload` · `upload_failed` | R2 write or read-back failed | retry the job (sealed uploads are skipped) |
| `announce` · `site_not_found` / `mode_v1` / `announce_failed` | BoostChat did not accept the package | the BoostChat site record (tenant link, V2 mode) |
| `route` · `route_conflict` | a route for the hostname belongs to another Worker | **a person decides**; the runner never changes a foreign route |
| `route` · `host_serves_other_site` | the bucket already has a routing pointer for the hostname to another site | **a person decides** |
| `activate` · `overlay_timeout` | BoostChat did not publish the first (empty) revision within 5 min | check BoostChat's publisher; retry the job |
| any · `event_refused` | BoostChat answered 409: another attempt owns the job | nothing — this run was stale and stopped |

## Deploying the runtime Worker

Routes of provisioned sites exist only in Cloudflare, not in `workers/recon-runtime/wrangler.jsonc`.
`wrangler deploy --env pilot` from that file **removes them**. Deploy only with:

```
tsx --tsconfig platform/tsconfig.json platform/cli/runtime-deploy.ts --dry-run   # prints the merged list
tsx --tsconfig platform/tsconfig.json platform/cli/runtime-deploy.ts
```

It needs `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit + Workers Routes: Edit — a different, stronger token than
the runner's), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`. It refuses when the live route list cannot be read.
Do not run it while a provisioning run is in progress.

## Known limits (V1)

- A provisioned site's `data/sites/<siteId>/` exists only on the runner that built it. It is reproducible from
  the spec (same spec + same `source_ref` → same files), but it is not committed anywhere; a later rebuild of
  the site (new release, changed copy) needs the spec again.
- New sites are `noindex`.
- The repository is public: run logs are public. The runner prints site ids, hostnames, hashes and counts —
  never a token — but a customer's brand name can appear in a failure message.
