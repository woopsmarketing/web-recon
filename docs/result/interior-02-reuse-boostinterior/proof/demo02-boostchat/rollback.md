# Rollback — `boost-interior-demo-02` (neutralise without deleting data)

Every step below uses a product function or route; none deletes rows. Order = reverse of
provisioning so that exposure closes first. All ops functions take `(pool, { tenantSlug, …,
reason, operator:{id,email} })` with the operator from `OPS_OPERATOR_EMAILS` (same as apply).
Run them through `scripts/prod-run.mjs` (no `--read-only`) from a scratch `.mts`, or via the
`/ops` HTTP routes with an operator session. Each leaves an `ops_audit_log` / `admin_audit_log` row.

| # | Neutralises | Function / route | Effect | Data kept |
|---|---|---|---|---|
| 1 | first-party refresh/snapshot | `setFirstPartyBindingEnabled(pool, { tenantSlug, capability:"portfolio.search", enabled:false, reason, operator })` — `PATCH /api/ops/first-party-integrations` `{enabled:false}` | integration `enabled=false`; **snapshots for that integration are deleted inside the same tx** (`snapshotsDeleted`) — the snapshot is a derived cache, re-created by the next refresh | integration row (origin, label) kept |
| 2 | binding registration | nothing to undo without delete; leave the disabled row. (`deleteFirstPartyBinding` exists but deletes — out of scope) | — | row kept, disabled |
| 3 | widget exposure | `runTenantMutation(actor, plan)` with the admin route's `update` statement: `update tenant_public_widget set enabled=false, version=version+1, updated_at=now() where tenant_id=$1 and version=$2` (audit `widget.update` / `enabled`) — or in `/admin/boost-interior-demo-02/install` toggle off, or `POST /api/admin/tenants/boost-interior-demo-02/widget {action:"update", enabled:false, fingerprint}` | `resolveWidgetChannel` returns 0 rows → bootstrap/chat/lead all uniform 404 on the host site | key, origins kept |
| 3b | widget origin (optional, stronger) | same mutation with the `set_origins` statement and `origins=[]` (audit `widget.update` / `allowed_origins`), or `POST …/widget {action:"set_origins", origins:[]}`, or ops `setWidgetAllowedOrigins(pool,{slug, origins:[], operator})` (`ops.widget.origins.update`) | no site can embed the widget even if re-enabled | key kept |
| 3c | emergency stop (operator) | `setWidgetApproval(pool, { slug, action:"revoke", operator })` — `POST /api/ops/widget` | `approval_status=revoked` → serving blocked and the tenant **cannot re-enable** from /admin (`widget_revoked`) | enabled/origins untouched (orthogonal) |
| 4 | capability | `setTenantCapabilityByOperator(pool, { tenantSlug, capability:"portfolio.search", enabled:false, reason, operator })` — `POST /api/ops/capability` | row stays, `enabled=false` (fail-closed) | row kept |
| 5 | action pilot | `setTenantActionPilotByOperator(pool, { tenantSlug, enabled:false, reason, operator })` — `POST /api/ops/action-pilot` | `tenant.action_pilot_enabled=false`; with pilot off the capability switch is moot | — |
| 6 | plan | `restoreTenantPlanToLegacy(pool, { tenantSlug, reason, operator })` (`ops.plan.restore_legacy`, deletes only the **assignment row**, which is what "legacy" means) — or `setTenantPlanByOperator(... plan:"free")` to keep a row | commercial entitlements removed | tenant data untouched |
| 7 | public profile page | `runTenantMutation` + `unpublishPublicProfile(client, tenantId, version)` (audit `public_profile.unpublish`) — or `/admin/<slug>/profile` "게시 취소", `POST /api/admin/tenants/<slug>/profile {action:"unpublish", fingerprint}` | `/boost-interior-2` → not found; `published_at` is kept by design | profile row kept, handle stays reserved |
| 8 | FAQ (if phase `faq` ran) | `setFaqEnabled(actor, { id, enabled:false })` per entry (each republishes; disabling all → `publishOwnerAuthoredSource` with 0 docs deactivates the publication, **no embedding call**) | FAQ out of retrieval | rows kept |
| 9 | business facts / AI config | no "unset" path in the product (chat needs both; absence = `core_data_missing` 503). Leave as is; they are fictional brand facts. If needed edit via `/admin/<slug>/settings` (audited) | — | — |
| 10 | tenant itself | `update tenant set status='suspended' where slug='boost-interior-demo-02'` — **no product function exists** for suspension (only the CHECK allows it); `findTenantBySlug` then treats the tenant as not found on every public surface (chat, widget, profile, leads) | everything closes at once | all rows kept; membership kept |
| 11 | owner membership / user | nothing to undo: no user was created (bootstrap reuses the existing owner); the membership row is harmless once the tenant is suspended | — | — |

Notes
- Steps 1, 4, 5, 6, 3c write `ops_audit_log`; steps 3, 3b, 7, 8 write `admin_audit_log` (actor = operator's user id).
- Nothing above touches `boost-interior-demo`; every function is keyed by the target slug/tenant id.
- Re-provisioning after rollback: `provision.mts --apply` is idempotent (reads before each write) and will re-enable
  exactly what was turned off; a widget key is never rotated by the script.
- `verify.sh` after each step shows the resulting state and that the template tenant is unchanged.
