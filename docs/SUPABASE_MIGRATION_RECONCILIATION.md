# Supabase Migration-History Reconciliation

Date: 2026-10-26
Production project: `bkgxjutnfkslpgshufhb` (`skoon`, `eu-west-1`, PostgreSQL
17.11, `ACTIVE_HEALTHY`)
Scope: local inspection plus authorised **read-only** Supabase catalog and
migration-history queries. No migration, repair, push, DDL, DML, deployment,
commit, or credential change was performed.

## Final status

**NO-GO — do not run `supabase migration repair` yet.**

The open-shift partial unique index is present and healthy, but migration
history has several independent discrepancies. Marking only `20261024125607`
as applied would hide one known discrepancy while leaving older timestamp and
source-of-truth conflicts unresolved.

## CLI parsing diagnosis

The requested command was attempted twice, including from `supabase/` with
`--workdir ..`:

```powershell
npx.cmd supabase migration list --linked
```

Both attempts stopped before the remote database was contacted with the exact
CLI error:

```text
DbConfigLoadError: failed to parse environment file: .env
```

A non-secret structural scan found three non-empty, non-comment lines at the
start of `.env` that are not valid environment-variable assignments. All
subsequent actual settings use valid `KEY="..."` assignment syntax. Values,
keys that could contain credentials, and file contents were not printed.

The CLI gives no line/column detail beyond that error. Its `--workdir` option
does not provide a non-mutating workaround: it loads the repository `.env`, so
using the `supabase/` subdirectory still fails. No temporary project was
created and no local environment file was copied, moved, edited, or deleted.

The safe read-only fallback used for this report is the authorised Supabase
management connection, not an altered environment. To restore CLI use later,
an owner must correct or remove only the three malformed non-secret lines under
a separate explicit environment-file approval; do not copy secrets into a
temporary project and do not bypass the error by passing a production database
URL on a command line.

## Migration tracking model

This repository has two distinct histories:

| System | Local source | Remote tracking | Finding |
| --- | --- | --- | --- |
| Supabase imperative migrations | `supabase/migrations/*.sql` | `supabase_migrations.schema_migrations` | Drifted; this is the history addressed by `supabase migration repair`. |
| Prisma migrations | `prisma/migrations/*/migration.sql` | `public._prisma_migrations` | Separate history; production Prisma deployment is deliberately blocked by `scripts/forbid-prisma-production-migrate.cjs`. |

The production Prisma history contains completed migrations from
`20261009231834_init` through
`20261018140000_add_product_cost_unit_tax_and_user_salary`, with one earlier
rolled-back `20261018_advance_repayment_links` attempt and its later completed
replacement. It does **not** record
`20261023120000_inventory_reservations_batches_accountability` or the local
product-variants migration. This fact must not be repaired with a Supabase
history command.

## Supabase migration comparison

`supabase migration list --linked` could not run because of the local parser
failure. The authorised remote migration list returned the entries below; it is
the authoritative remote evidence for this report.

| Local version / file | Remote version / name | Classification | Verified production schema evidence | Recommended action |
| --- | --- | --- | --- | --- |
| `20261023130000_stock_counts.sql` | `20261023030511` / `20261023130000_stock_counts` | **VERSION_MISMATCH** | `stock_counts`, `stock_count_lines`, both sentinel unique indexes, RLS, and expected FK counts exist. | Preserve; compare complete DDL before any paired history repair. |
| `20261023140000_waste_idempotency.sql` | — | **LOCAL_ONLY** | `waste_operations` and its sentinel index are absent. | Genuine pending schema work; never mark applied. Review separately before a future approved migration. |
| `20261023150000_hr_employee_foundation.sql` | `20261023051916` / `20261023150000_hr_employee_foundation` | **VERSION_MISMATCH** | `employee_profiles`, `employment_contracts`, `compensation_rates`, RLS, expected FK counts, and the unique compensation index exist. | Preserve; compare complete DDL before any paired history repair. |
| `20261023160000_hr_scheduling_attendance.sql` | — | **LOCAL_ONLY** | `work_schedules`, `work_schedule_days`, `attendance_corrections`, and sentinel index are absent. | Genuine pending schema work; never mark applied. |
| `20261023161000_hr_leave_holidays.sql` | — | **LOCAL_ONLY** | `leave_requests`, `official_holidays`, and sentinel index are absent. | Genuine pending schema work; never mark applied. |
| `20261023162000_manager_service_requests.sql` | `20261023092128` / `20261023162000_manager_service_requests` | **VERSION_MISMATCH** | `service_requests`, its sentinel index, RLS, and five foreign keys exist. | Preserve; compare complete DDL before any paired history repair. |
| `20261024100000_waiter_responsibility_operations.sql` | `20261024100000` / `waiter_responsibility_operations` | **MATCHED** | All three tables, sentinel unique index, RLS, and expected FK counts exist. | No history action in this pass. Existing Waiter drift report remains applicable for provenance concerns. |
| `20261024110000_waiter_order_reconciliation_reviews.sql` | — | **LOCAL_ONLY** | Both reconciliation tables and sentinel index are absent. | Genuine pending schema work; do not mark applied. |
| `20261024125607_enforce_one_open_shift_per_employee_branch.sql` | — | **MANUALLY_APPLIED** | Exact semantic index match on `public.shifts(branch_id, cashier_id)`, unique/valid/ready, predicate `status = 'open' AND cashier_id IS NOT NULL`. | Do not recreate. Defer metadata repair until the complete history reconciliation is approved. |
| No Supabase file; related Prisma file `20261023120000_inventory_reservations_batches_accountability` | `20261023023014` / `20261023120000_inventory_reservations_batches_accountability` | **REMOTE_ONLY / UNKNOWN** | Inventory batches, reservations, allocations, waste events, accountability, waivers, and payroll-deduction tables exist with RLS and expected FK counts; a sentinel batch index exists. | Establish execution provenance and compare complete DDL. Do not add a synthetic Supabase file or mark a Prisma migration through Supabase repair. |

### SQL-operation and dependency assessment

* **Stock counts** creates two inventory-count tables, partial/functional unique
  indexes, ordinary indexes, foreign keys, and enables RLS. It depends on
  inventory items, batches, users, and branches. No data statement was found.
* **Waste idempotency** creates `waste_operations`, an index, foreign keys, and
  enables RLS. It is additive but is absent from production.
* **HR foundation** creates three HR tables and indexes, enables RLS, revokes
  public/API table and sequence access, and backfills `employee_profiles` from
  existing users. This is data-changing; equivalence cannot be inferred merely
  from the currently existing tables.
* **HR scheduling and leave** create HR tables, indexes, enable RLS, and revoke
  broad table/sequence access. Their tables are absent, so they are pending—not repairable
  metadata.
* **Manager service requests** creates the service-request table, indexes,
  foreign keys, enables RLS, and revokes broad access. Its table exists, but full
  grant, column, and constraint equivalence remains to be compared.
* **Waiter operations** alters `orders` and `cafe_tables` and creates three
  operational tables/indexes, enables RLS, and revokes broad access. Its history timestamp is matched;
  no repair is proposed.
* **Waiter reconciliation** is additive and creates review/audit tables,
  indexes, enables RLS, and revokes broad access. Both tables are absent.
* **Open-shift uniqueness** has one executable index statement and no data,
  RLS, grant, or policy operation. Its production index was manually created
  concurrently and has the intended final definition.
* **Inventory/accountability** is a Prisma migration containing table/column
  changes, indexes, foreign keys, and RLS enablement. It has a similarly named
  remote Supabase record, but neither name similarity nor object presence proves
  byte-for-byte execution of the local Prisma SQL.

The existing local reports `WAITER_SCHEMA_DRIFT_RECOVERY.md`,
`WAITER_MIGRATION_FINAL_AUDIT.md`, and
`PRODUCTION_DATABASE_SAFETY_AUDIT.md` are consistent with this conclusion:
physical schema evidence and migration history must be reconciled separately.

## Safe reconciliation order

1. Obtain a fresh production backup and prove a restore in an isolated
   Supabase-compatible recovery environment. A backup creation alone is not a
   recovery guarantee.
2. Under a separate read-only approval, capture a complete catalog equivalence
   matrix for each **VERSION_MISMATCH** and **REMOTE_ONLY** item: columns,
   defaults, checks, foreign keys and delete actions, indexes/predicates,
   RLS-enabled state, policies, grants, functions, and triggers.
3. Establish provenance from Supabase activity/CI/SQL Editor audit records for
   remote versions `20261023023014`, `20261023030511`, `20261023051916`, and
   `20261023092128`. Do not guess that their descriptive names prove origin.
4. Treat **LOCAL_ONLY** files as future schema changes. Review their DDL,
   dependencies, RLS and operational impact independently; never repair their
   history to skip deployment.
5. Choose a single approved migration source of truth for each historical
   change. Do not cross-repair `public._prisma_migrations` with Supabase CLI.
6. Only after steps 1–5, prepare an explicit repair plan pairing each confirmed
   obsolete remote timestamp with a verified local counterpart. Each pair
   requires its own approval and before/after `migration list` evidence.
7. Repair `20261024125607` last, not first, if the resulting reconciled order
   still includes it. Re-run catalog and duplicate-open-shift checks afterward.

## Commands requiring explicit approval

The following commands are shown for future review only; none was executed:

```powershell
# Metadata mutation only; it does not run SQL. Run only after full reconciliation.
npx.cmd supabase migration repair 20261024125607 --status applied --linked

# Potentially removes a remote history entry. Never run without a documented
# paired replacement and explicit approval.
npx.cmd supabase migration repair <obsolete-remote-version> --status reverted --linked
```

Do not use `supabase db push`, `supabase db pull`, `supabase db reset`, Prisma
`migrate deploy`, direct inserts into `supabase_migrations.schema_migrations`,
or direct edits to `_prisma_migrations` as reconciliation shortcuts.

## Rollback and recovery

Migration-history repair changes metadata, not schema. Its safe rollback is a
separately approved reverse history repair only when the repaired record is
proven incorrect. It must not be used to roll back physical objects or data.
For a failed future DDL release, roll back application code first and use the
tested Supabase recovery procedure only under the database owner's incident
authority. No current evidence proves an end-to-end recoverable Supabase
platform restore.

## Safe checks run

* Read-only project identity, remote migration list, production catalog/index,
  RLS, FK-count, and Prisma-history queries: completed.
* Supabase CLI `migration list --linked`: blocked before remote connection by
  `.env` parsing failure.
* `git diff --check`: passed (line-ending warnings only).

No production state changed.
