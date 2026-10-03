#!/bin/sh
# READ-ONLY production check for the one "[TEST] Shared Inquiry V2" lead.
#
#   sh docs/result/shared-inquiry-form-v2/proof/scripts/prod-db-check.sh > proof/4x-….txt
#
# One READ ONLY transaction over the Railway public proxy, guarded by the database's system identifier.
# Prints counts, booleans, timestamps and 8-character id prefixes only — never a name, a phone number, a
# message, a full submission id or the connection string. Writes nothing; deletes nothing.
set -eu
EXPECT_SID="${EXPECT_SYSTEM_IDENTIFIER:-7675084143306387491}"
LINKED_DIR="${RAILWAY_LINKED_DIR:-/Users/woops/projects/boost-chat}"
DBURL=$(cd "$LINKED_DIR" && railway variables -e production -s pgvector --kv 2>/dev/null | grep '^DATABASE_URL=' | cut -d= -f2-)
[ -n "$DBURL" ] || { echo "FAILED: no DATABASE_URL from railway"; exit 1; }
PGOPTIONS='-c default_transaction_read_only=on' PGCONNECT_TIMEOUT=20 psql "$DBURL" -X -q -v ON_ERROR_STOP=1 -v sid="$EXPECT_SID" -P pager=off 2>&1 <<'SQL' | sed -E 's#postgres(ql)?://[^ ]+#<redacted>#g'
begin transaction read only;
select set_config('check.sid', :'sid', true) as "guard: expected system identifier";
do $$ begin
  if (select system_identifier::text from pg_control_system()) <> current_setting('check.sid') then
    raise exception 'system_identifier mismatch';
  end if;
end $$;
select now() as now_utc, current_setting('transaction_read_only') as read_only;
\echo
\echo ## rows named exactly [TEST] Shared Inquiry V2
select count(*)::int                                            as lead_rows,
       count(*) filter (where source = 'website_form')::int    as source_website_form,
       count(*) filter (where submission_id is not null)::int  as submission_id_not_null,
       count(distinct submission_id)::int                      as distinct_submission_ids,
       count(*) filter (where notified_at is not null)::int    as notified
  from lead_request where name = '[TEST] Shared Inquiry V2';
\echo
\echo ## each such row (no contents)
select left(id::text, 8) as id, left(tenant_id::text, 8) as tenant, created_at, source,
       left(submission_id::text, 8) as submission_id_prefix, submission_fingerprint is not null as has_fingerprint,
       conversation_id is null as no_conversation, notified_at, status
  from lead_request where name = '[TEST] Shared Inquiry V2' order by created_at;
\echo
\echo ## lead_request by source (whole table)
select coalesce(source, '(null)') as source, count(*)::int as rows from lead_request group by 1 order by 1;
rollback;
SQL
