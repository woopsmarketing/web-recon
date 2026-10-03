/**
 * Teardown of last resort: removes whatever a KILLED run of b-api-proof.mts / c-browser-proof.mts
 * left in the local TEST database. A run that ends normally removes its own fixture and needs
 * nothing from here.
 *
 * It deletes only rows this harness created: tenants whose slug starts with
 * "trackb-inquiry-v2-e2e-" (their lead requests, widget channels, memberships and form settings go
 * with them by cascade), the owner users whose e-mail starts with the same prefix, and the
 * rate-limit buckets whose key carries one of those tenants' channel ids. Same guards as the
 * proofs: loopback database whose name contains "test", or nothing happens.
 *
 *   BOOSTCHAT_E2E_COPY=<copy> ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json \
 *     docs/work/track-b-shared-inquiry-v2/e2e/cleanup.mts
 */
import { FIXTURE_PREFIX, boostChatCopy, leftovers, log, openTestDb } from "./lib.mts";

const db = await openTestDb(boostChatCopy());
try {
  const before = await leftovers(db);
  log(`database: ${db.database} — fixtures under "${FIXTURE_PREFIX}" before: ${before.tenants} tenants, ${before.users} users, ${before.leads} leads`);
  const channels = await db.query<{ id: string }>("select w.id::text as id from tenant_public_widget w join tenant t on t.id = w.tenant_id where t.slug like $1", [`${FIXTURE_PREFIX}%`]);
  let buckets = 0;
  for (const channel of channels) buckets += (await db.query("delete from analytics_rate_limit_bucket where position($1 in client_id) > 0 returning 1", [channel.id])).length;
  const tenants = await db.query("delete from tenant where slug like $1 returning 1", [`${FIXTURE_PREFIX}%`]);
  const users = await db.query('delete from "user" where email like $1 and id like $1 returning 1', [`${FIXTURE_PREFIX}%`]);
  const after = await leftovers(db);
  log(`removed: ${tenants.length} tenants, ${users.length} users, ${buckets} rate-limit buckets`);
  log(`after: ${after.tenants} tenants, ${after.users} users, ${after.leads} leads`);
} finally {
  await db.end();
}
