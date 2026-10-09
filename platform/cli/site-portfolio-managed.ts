/**
 * pnpm site:portfolio-managed --site <siteId> [--dry-run] [--upgrade-v1]
 *
 * Declares a site as BoostChat-managed — the one supported way (platform/portfolio-sync/declare.ts).
 * It writes the tracked marker data/sites/<siteId>/portfolio.source.json as `portfolio-source@2`
 * (Portfolio Publishing V2: the site is built once as a shell package and BoostChat publishes its
 * portfolio incrementally). A new managed site is V2; there is no flag for anything else here.
 *
 *  REFUSED (exit 1, nothing written) when the site could not be published that way:
 *    - its pinned release does not support the portfolio runtime (the message says what to pin / cut)
 *    - site.json has no identity.publicOrigin
 *    - the site is a V1 (`portfolio-source@1`) managed site and --upgrade-v1 was not given
 *  --dry-run      check everything and print what would be written; the site directory is not touched
 *  --upgrade-v1   convert an existing V1 managed site to V2 (BoostChat must be switched to V2 for the
 *                 site as well; site:publish reports `mode_v1` and stops until it is)
 *  Idempotent: a site that already carries the `@2` marker is left as it is (exit 0).
 *
 * Nothing is built, published or sent anywhere. Afterwards:
 *   git add data/sites/<siteId>/portfolio.source.json   (commit it: every checkout then builds the shell)
 *   pnpm site:build <siteId>
 *   pnpm site:publish --site <siteId> --host <hostname> --remote     (one command: upload → announce → wait → switch)
 *
 * V1 stays available as a compatibility path only: `pnpm site:portfolio-sync … --adopt --legacy-v1`.
 *
 * Exit codes: 0 written / already declared / dry run · 1 refused · 2 usage.
 */
import { declareManagedPortfolio } from "../portfolio-sync/declare";
import { ManagedPortfolioError } from "../portfolio-sync/managed";

const args = process.argv.slice(2);
const VALUE_FLAGS = ["--site"];
const BOOL_FLAGS = ["--dry-run", "--upgrade-v1"];
const usage = "usage: pnpm site:portfolio-managed --site <siteId> [--dry-run] [--upgrade-v1]";
function usageError(message?: string): never {
  console.error(message ? `site:portfolio-managed: ${message}\n${usage}` : usage);
  process.exit(2);
}
const unknown = args.filter((a, i) => (a.startsWith("--") ? !VALUE_FLAGS.includes(a) && !BOOL_FLAGS.includes(a) : !VALUE_FLAGS.includes(args[i - 1] ?? "")));
if (unknown.length > 0) usageError(`unknown arguments: ${unknown.join(" ")}`);
const siteId = args.includes("--site") ? args[args.indexOf("--site") + 1] : undefined;
if (!siteId || siteId.startsWith("--")) usageError();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteId) || siteId.length > 64) usageError(`invalid --site "${siteId}"`);
const dryRun = args.includes("--dry-run");

try {
  const r = await declareManagedPortfolio({ repoRoot: process.cwd(), siteId, dryRun, upgradeV1: args.includes("--upgrade-v1") });
  const host = new URL(r.publicOrigin).hostname;
  if (r.status === "written") console.log(`[${siteId}] wrote ${r.marker} (${r.schema}): the site is BoostChat-managed and published incrementally. Commit it.`);
  else if (r.status === "unchanged") console.log(`[${siteId}] ${r.marker} already declares ${r.schema} — nothing to do.`);
  else console.log(`[${siteId}] DRY RUN — would write ${r.marker} (${r.schema}); nothing written.`);
  console.log(`[${siteId}] pinned release ${r.releaseId} supports the portfolio runtime (${r.runtime.contract}, declared by: ${r.runtime.declared}).`);
  console.log(`[${siteId}] next: pnpm site:build ${siteId} && pnpm site:publish --site ${siteId} --host ${host} --remote   (link the site to its BoostChat tenant first — portfolio adoption; site:publish says so if it is not)`);
  console.log(JSON.stringify(r, null, 2));
} catch (error) {
  if (!(error instanceof ManagedPortfolioError)) throw error;
  console.error(`site:portfolio-managed REFUSED: ${error.message}`);
  process.exit(1);
}
