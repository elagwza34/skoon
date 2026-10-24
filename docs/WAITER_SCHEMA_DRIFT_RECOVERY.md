# Waiter schema drift: read-only investigation and recovery plan

Date: 2026-10-24
Target: Supabase project `bkgxjutnfkslpgshufhb` (`skoon`, `eu-west-1`, PostgreSQL 17.11)
Scope: `supabase/migrations/20261024100000_waiter_responsibility_operations.sql`

## Decision

**NO-GO / FAIL.** Do not execute the local Waiter SQL migration and do not repair migration history yet.

The deployed `public` schema contains the Waiter objects, but Supabase migration history has no corresponding `20261024100000` entry. The local SQL file is non-idempotent, so replaying it will fail on existing columns, constraints, tables, and indexes. The source of the deployed DDL cannot be established from read-only repository, migration-history, or database-metadata evidence and is therefore **UNKNOWN**.

This investigation made no database, configuration, Git, or application-code change.

## 1. Verified facts

| Check | Status | Evidence |
| --- | --- | --- |
| Target identity | PASS | Supabase MCP returned reference `bkgxjutnfkslpgshufhb`, name `skoon`, status `ACTIVE_HEALTHY`, PostgreSQL `17.11`. |
| Remote migration entry | FAIL | Remote history lists inventory, stock-count, HR foundation, and service-request migrations; it has no `20261024100000`/Waiter entry. |
| Local migration tracked in Git | FAIL | `git ls-files --error-unmatch supabase/migrations/20261024100000_waiter_responsibility_operations.sql` failed; the file is currently untracked. |
| Live schema objects | PASS | All reviewed Waiter columns, tables, constraints, indexes, RLS settings, and relevant grants exist. |
| DDL origin | UNVERIFIED / UNKNOWN | The objects have no comments, all three new operational tables have zero rows, and neither Git history nor the remote migration ledger provides an origin record. |
| Database mutation during this audit | PASS | Read-only catalog and aggregate queries only. |

Older local readiness documents that say the three tables do not exist are stale relative to the current read-only catalog result; they are not evidence of how the schema was created.

## 2. Root-cause evidence

The following sources were inspected:

- The complete local Waiter migration and the local Prisma schema.
- Supabase remote migration history and PostgreSQL catalog metadata.
- Repository Git history, migration references, deployment scripts, and existing Waiter documentation.

The Waiter SQL file has no Git history and is untracked. No repository automation or committed migration references were found that could have created the deployed objects. Remote migration history contains no similarly named migration. PostgreSQL catalog metadata proves the objects exist but does not retain a trustworthy authoring path or original DDL executor. It is consequently unsafe to attribute the drift to SQL Editor, Prisma synchronization, Supabase MCP, or an automated deployment without external audit/log evidence.

**Classification: UNKNOWN.** If an administrator needs provenance, inspect the Supabase dashboard activity/audit logs and the deployment/CI records for the period when the objects first appeared. Do not infer it from object names or timestamps.

## 3. Exact schema-diff matrix

| Object | Local migration / Prisma contract | Live database | Classification |
| --- | --- | --- | --- |
| `orders.responsible_waiter_id` | nullable `UUID`; `ON DELETE SET NULL` FK to `users(id)` | Same type, nullability, and FK action | EXACT MATCH |
| `orders.qr_claimed_at`, `qr_approved_at`, `qr_rejected_at` | nullable `TIMESTAMP(3)` | nullable `timestamp without time zone` | EXACT MATCH |
| `orders.qr_decision_by` | nullable `UUID`; `ON DELETE SET NULL` FK to `users(id)` | Same type, nullability, and FK action | EXACT MATCH |
| `orders_branch_responsible_waiter_status_idx` | `(branch_id, responsible_waiter_id, status)` | Same btree index | EXACT MATCH |
| `cafe_tables.floor_plan_zone` | nullable `VARCHAR(80)` | same | EXACT MATCH |
| `cafe_tables.floor_plan_x`, `floor_plan_y` | nullable `NUMERIC(7,2)` | same precision and scale | EXACT MATCH |
| `cafe_tables.floor_plan_rotation` | `SMALLINT NOT NULL DEFAULT 0`; range check 0–359 | same default, nullability, and check | EXACT MATCH |
| `cafe_tables_branch_floor_plan_zone_idx` | `(branch_id, floor_plan_zone)` | Same btree index | EXACT MATCH |
| `order_responsibility_history` | columns, BIGSERIAL default, four FKs, source check, two indexes | Same | EXACT MATCH |
| `order_table_transfers` | columns, BIGSERIAL default, five FKs, distinct-table check, two indexes | Same | EXACT MATCH |
| `waiter_shift_handovers` | columns, BIGSERIAL default, four FKs, status/participant checks, three indexes including pending partial unique | Same | EXACT MATCH |
| RLS and direct data access | RLS enabled; revoke table/sequence access from `PUBLIC`, `anon`, `authenticated` | RLS enabled; no policies; direct table grants only for `postgres` and `service_role`; sequence `USAGE` only for those roles | EXACT MATCH |
| `WaiterShiftHandover.updatedAt` | Prisma `@updatedAt` | Database default only; no trigger | FUNCTIONALLY EQUIVALENT **only when updates use Prisma**. Direct SQL updates would not automatically refresh the field. |
| Prisma representation of checks / partial unique index | Prisma cannot encode the DB check constraints or partial unique index | Present in PostgreSQL | EXPECTED ORM LIMITATION; SQL migration remains the authority for those invariants. |

The three sequences are owned by `postgres`, attached through their BIGSERIAL defaults, and expose only `USAGE` to `postgres` and `service_role`. No `anon` or `authenticated` grant was found.

## 4. Runtime permissions assessment

| Role / property | Status |
| --- | --- |
| `postgres` | Has table and sequence privileges; `BYPASSRLS = true`. |
| `service_role` | Has table and sequence privileges; `BYPASSRLS = true`. |
| `anon` / `authenticated` | No direct grants on the three operational tables or sequences; `BYPASSRLS = false`; no RLS policies exist. Direct access is denied by design. |
| Actual deployed Prisma role | **UNVERIFIED.** Local PostgreSQL connectivity to the configured pooler remains blocked before authentication, so it was not possible to identify the role from the application connection or prove it can read/write these tables. |

The MCP administrator query is not proof of application-runtime access. The minimum safe verification is a read-only production-equivalent connection using the exact deployed runtime URL, followed by `current_user`, `has_table_privilege`, `has_sequence_privilege`, and a `SELECT ... LIMIT 0` on each operational table. For write access, validate in an isolated approved environment or as an explicitly authorized post-deployment smoke test—not through a broad grant.

## 5. Legacy-order classification

All 35 current orders with `responsible_waiter_id IS NULL` were classified using aggregate-only, non-personal data. None was assigned or altered.

| Bucket | Count | Observed groups | Required action |
| --- | ---: | --- | --- |
| Active operational review | 6 | 2 QR/unpaid/preparing; 4 QR/unpaid/served; no recorded shift | Owner/Manager must choose a responsible waiter or explicitly close/cancel through the normal workflow. |
| Ambiguous review | 9 | 6 new/unpaid QR; 2 new/unpaid POS; 1 new/unpaid waiter order on an open shift | Per-order Owner/Manager decision. Do not infer responsibility from creator, table, or source. |
| Historical or settled; no automatic assignment | 20 | 2 cancelled/unpaid; 15 new/paid; 1 ready/paid; 2 served/paid | Retain as history unless a business owner identifies a current operational need. Do not backfill automatically. |

The new responsibility, transfer, and handover tables currently contain zero rows. That supports no claim about their origin and means no existing audit records can safely resolve ownership. Historical creator and responsibility are intentionally separate; preserving `created_by` does not authorize bulk copying it to `responsible_waiter_id`.

## 6. Proposed reconciliation procedure — requires approval

Supabase’s current CLI documentation describes `supabase migration repair <version> --status applied` as the supported operation to insert a missing remote migration-history record. It requires a linked project and **changes remote migration history**. It must not be run until all steps below are complete.

1. Confirm the project reference again and obtain recovery/PITR confirmation from the project owner.
2. Re-run the schema-equivalence matrix, including catalog definitions, index predicates, RLS, grants, sequence defaults, and row counts.
3. Confirm migration ordering: the local Waiter file’s `20261024100000` version must not collide with an existing remote or pending local migration.
4. Determine provenance from Supabase/CI activity logs if available; record the result as known or unknown.
5. Obtain written Owner approval specifically to reconcile **migration metadata only**, including the exact version and target project.
6. Use the supported Supabase CLI repair workflow to mark only version `20261024100000` as `applied`; never insert into `supabase_migrations.schema_migrations` directly, never rerun the SQL, and never use Prisma migration commands.
7. Immediately re-run `supabase migration list` and read-only catalog checks. Abort release if any discrepancy remains.

The local CLI could not be used to inspect help because it attempted to write telemetry under the user profile and received Windows `EPERM`; current Supabase documentation was used for the supported procedure. This is a local tooling limitation, not authorization to bypass the official workflow.

## 7. Release risks and minimum evidence for GO

| Risk | Severity | Status / minimum evidence |
| --- | --- | --- |
| Schema exists but migration history omits the version | BLOCKER | Approved metadata reconciliation after repeat equivalence and recovery checks. |
| 6 active and 9 ambiguous unassigned orders | BLOCKER | Documented Owner/Manager per-order decisions; no bulk assignment. |
| Application Prisma role not proven | HIGH | Role-specific read/write privilege verification using actual runtime credentials, without exposing them. |
| PostgreSQL integration suite unavailable locally | HIGH | Completed isolated database run for QR claim, handover, table transfer, emergency serving, branch/role and inventory/financial regression scenarios. |
| `updated_at` is Prisma-driven, not trigger-driven | MEDIUM | Ensure all operational handover updates remain through Prisma, or separately approve a future trigger migration. |
| `ALTER TABLE` / non-concurrent index DDL in original file | MEDIUM | Do not replay. If a clean environment ever needs the migration, schedule it with lock monitoring because it can take table locks. |
| Build output was complete but host exit code was not observed | LOW | Confirm `npm run build` exit code 0 in CI or a stable runner. |

## 8. Safe verification sequence

1. Stop release and retain the current database unchanged.
2. Obtain provenance evidence where available; otherwise formally record it as unknown.
3. Obtain Owner decisions for the 15 nonterminal unassigned orders, using a read-only candidate report and normal audited operational actions.
4. Verify runtime role access and RLS behavior with the deployed connection path.
5. Run PostgreSQL integration tests against an authorized safe target; verify fixture cleanup.
6. With explicit approval, reconcile only the remote migration-history record using the supported CLI command.
7. Verify history and schema again, then deploy application code that depends on the fields/tables.
8. Monitor QR claiming, handovers, transfers, emergency serving, and order ownership after release; do not use the migration replay as rollback.

## 9. Read-only post-reconciliation checks

```sql
-- Confirm the intended migration is recorded exactly once.
select version, name
from supabase_migrations.schema_migrations
where version = '20261024100000' or name ilike '%waiter%';

-- Confirm no schema object disappeared or changed shape.
select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'orders' and column_name in
       ('responsible_waiter_id','qr_claimed_at','qr_approved_at','qr_rejected_at','qr_decision_by'))
    or (table_name = 'cafe_tables' and column_name in
       ('floor_plan_zone','floor_plan_x','floor_plan_y','floor_plan_rotation'))
    or table_name in ('order_responsibility_history','order_table_transfers','waiter_shift_handovers'))
order by table_name, ordinal_position;

-- Confirm remaining legacy work without exposing personal data.
select status, payment_status, source, count(*)
from public.orders
where responsible_waiter_id is null
group by status, payment_status, source
order by status, payment_status, source;
```

## 10. Recovery considerations

There is no safe destructive rollback for this condition. Dropping the existing objects would risk active orders, future audit data, and application compatibility. If reconciliation fails, preserve the schema, stop deployment, restore only under the project’s approved recovery plan if a separate harmful action occurs, and investigate the ledger mismatch. A metadata reconciliation is not a data rollback and must be auditable, approved, and limited to the single confirmed version.

## Final status

| Area | Status |
| --- | --- |
| Schema equivalence | PASS, with the noted Prisma `@updatedAt` caveat |
| Migration history consistency | FAIL |
| DDL provenance | UNVERIFIED / UNKNOWN |
| Runtime Prisma permission | UNVERIFIED |
| Legacy responsibility reconciliation | NOT STARTED (no mutation performed) |
| PostgreSQL behavioral verification | BLOCKED |
| Release decision | **NO-GO** |
