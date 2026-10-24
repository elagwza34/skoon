# Waiter migration final safety audit — 2026-10-24

## Executive summary

**Decision: NOT READY (NO-GO).** Do not execute `20261024100000_waiter_responsibility_operations.sql` against project `bkgxjutnfkslpgshufhb`.

The live schema already contains every reviewed Waiter column, table, foreign key, check, index, RLS setting, and direct-role revocation from that migration, but Supabase migration history does not contain the migration. Re-running this non-idempotent SQL would fail on duplicate columns/tables/indexes and must not be used to “repair” history. In addition, 27 active legacy orders have no current responsible waiter.

## Database compatibility matrix

| Change | Prisma mapping | Live schema (read-only verified) | Result |
| --- | --- | --- | --- |
| `orders.responsible_waiter_id`, QR fields | Nullable UUID / timestamp fields, `@map` names match | Present; UUID fields nullable | Aligned |
| Order responsibility FKs | `SetNull` user relations | Present with `ON DELETE SET NULL` | Aligned |
| `orders_branch_responsible_waiter_status_idx` | `@@index([branchId, responsibleWaiterId, status])` | Present | Aligned |
| Floor-plan fields/index/check | Numeric nullable coordinates; smallint rotation default 0 | Present with bounded rotation check | Aligned |
| `order_responsibility_history` | Required order/branch/assigner, optional assignee | Present with matching FKs/check/indexes | Aligned |
| `order_table_transfers` | Required source/destination/actor and non-equal tables | Present with matching FKs/check/indexes | Aligned |
| `waiter_shift_handovers` | Required branch/sender/requester/recipient; status default pending | Present with matching FKs/check/indexes and pending partial unique index | Aligned |
| Supabase migration ledger | Local file should be recorded once applied | Not listed in Supabase migration history | **Drift / blocker** |

No `DROP`, `TRUNCATE`, data deletion, or data rewrite appears in the local SQL. It would nevertheless take `ACCESS EXCLUSIVE` locks for `ALTER TABLE` operations and can block operational traffic while indexes/constraints are installed. This is a release-window consideration, not permission to rerun it.

## Prisma alignment and discrepancies

The reviewed models and SQL names/types/nullability/referential actions match. The partial unique handover index exists live and is intentionally not represented in Prisma because Prisma has no matching partial-index declaration.

The material discrepancy is not model shape: it is **schema-history drift**. The database has the objects, while its Supabase migration history lacks this migration. Do not use Prisma migration commands or manually mark the migration as applied without an approved reconciliation process.

## Security assessment

- RLS is enabled on the three new operational tables. No RLS policies were returned for them.
- Read-only grants show `anon` and `authenticated` have no direct grants on the new tables; `postgres` and `service_role` do.
- Existing `orders` and `cafe_tables` have broader pre-existing Data API grants and RLS policies; that is outside this migration but remains a separate security review concern.
- No `SECURITY DEFINER` function referencing `orders`, `shifts`, or `cafe_tables` was found in the read-only function search.
- The exact role established by the application’s pooler connection was not verified because local PostgreSQL TCP connectivity is unavailable. Therefore SELECT/INSERT/UPDATE/sequence access for the actual runtime session is **unverified**. The MCP session’s privileges cannot prove Prisma runtime access.

## Legacy-data compatibility

Read-only counts: 35 total orders; all 35 have null current responsibility; 27 are active (`new`, `preparing`, or `ready`) without responsibility. No open shift currently has a matching responsible active order.

- Nullable fields preserve old rows and no migration assigns historical orders automatically.
- Existing payment and inventory records are not referenced or rewritten by the SQL.
- Kitchen and cashier queries that do not select new fields remain structurally compatible.
- New waiter workflow code will treat the 27 active legacy orders as unowned: normal responsible-waiter actions and “My Orders” do not apply. The new waiter close guard also cannot detect them until explicitly assigned.

Required reconciliation: before enabling Waiter responsibility UI, an authorized manager must review each active legacy order and either resolve/cancel it under existing rules or explicitly create an audited `legacy_reconcile` assignment through a reviewed operational procedure. Do not bulk assign based only on creator, shift, or table.

## Application dependency analysis

The following code requires the schema objects already present live:

- `src/lib/staff-waiter.ts`: selects responsibility and handover data.
- `src/lib/staff-waiter-operations.ts`: locks and writes QR claims, reassignment, table transfers, and handovers using transactions/advisory locks.
- `src/lib/staff-orders.ts`: enforces responsible-waiter dispatch and emergency-service audit/ready-quantity guards.
- `src/lib/staff-shifts.ts`: blocks a waiter closing with explicitly assigned active responsibility.
- `src/lib/staff-tables.ts`, `src/app/api/staff/tables/layout/route.ts`, and table/waiter components: select and write floor-plan metadata.

The code uses transaction row locks for QR claims/handovers, an advisory lock plus row lock for table transfer, and locked inventory serving. These are code-reviewed only; PostgreSQL concurrency behavior is unverified because local integration tests cannot reach the pooler.

## Required pre-deployment actions

1. Stop: do not execute the local migration on this project.
2. Establish an approved migration-history reconciliation procedure. It must record the real prior deployment evidence without replaying DDL or rewriting business data; obtain explicit approval before any history operation.
3. Verify the actual Prisma runtime role against the new tables: SELECT, INSERT, UPDATE, and sequence usage under RLS.
4. Restore local/CI PostgreSQL TCP connectivity and run isolated, cleanup-safe integration tests.
5. Reconcile the 27 active legacy orders explicitly and audit each assignment or disposition.
6. Capture a final `next build` exit code in CI or a terminal that preserves the parent process.

## Safe migration execution plan

There is no safe execution plan for the current SQL on this target because its DDL is already present. The safe plan is a **history-reconciliation review**, followed by a no-DDL release only after the listed verifications pass. Do not replace the migration with `IF NOT EXISTS` clauses: that would hide drift and does not reconcile partial/incorrect prior deployment.

## Post-reconciliation read-only verification SQL

```sql
select version, name
from supabase_migrations.schema_migrations
where version like '20261024%' or name ilike '%waiter%';

select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('order_responsibility_history', 'order_table_transfers', 'waiter_shift_handovers');

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('orders', 'cafe_tables', 'waiter_shift_handovers');

select count(*) as active_orders_without_responsibility
from public.orders
where status in ('new', 'preparing', 'ready')
  and responsible_waiter_id is null;
```

## Recovery considerations

Do not drop or recreate the existing objects. Preserve audit records and migration metadata. If an approved history reconciliation fails, stop and restore migration-tooling state using the platform’s approved metadata/recovery procedure; do not attempt destructive schema rollback. Existing nullable fields and audit tables do not require data rollback.

## Severity summary

| Severity | Finding |
| --- | --- |
| **BLOCKER** | DDL exists but migration history is missing; current migration will fail if rerun. |
| **BLOCKER** | 27 active orders lack current responsibility; enabling the workflow would leave them unowned. |
| **HIGH** | Actual Prisma runtime role access under new-table RLS is not verified. |
| **HIGH** | PostgreSQL concurrency/inventory integration tests are blocked by local network connectivity. |
| **MEDIUM** | `ALTER TABLE` migration would require locks if it were ever applied elsewhere. |
| **LOW** | Build exit code remains unobserved despite complete output. |
