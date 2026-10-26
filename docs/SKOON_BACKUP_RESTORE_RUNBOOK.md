# Skoon Backup Restore Runbook

Date: 2026-10-26
Production project: `bkgxjutnfkslpgshufhb`
Status: **RESTORE NOT VERIFIED**

This runbook prepares a recovery test only. It does not authorize creating a
database, restoring an archive, changing Supabase, or connecting the Skoon
application to a recovery target.

## 1. Backup identity and freshness

| Field | Verified value |
| --- | --- |
| Archive | `D:\Sokoon\backups\Skoon_Full_Backup.dump` |
| File size | 562,607 bytes |
| File last-write time | `2026-10-24T11:19:05.3616075Z` |
| SHA-256 revalidated 2026-10-26 | `E6A4628840B0ED849E80AE9AC0AA6B0D3A01F73C9E39D8ABB70AD2D27AC763E9` |
| Archive format | PostgreSQL custom archive, gzip compression, dump format `1.16-0` |
| Archive metadata | Created `2026-10-24 14:17:15`; dumped from and by PostgreSQL 17.11 |
| Compatible client | `pg_restore (PostgreSQL) 17.11` and `psql (PostgreSQL) 17.11` are installed locally |

The file timestamp and embedded archive creation timestamp differ; neither is
proof that this is the latest production backup. A historical aggregate
comparison on 2026-10-24 found the archive already behind current production
for audit logs, financial operations, inventory, orders, and shifts. Treat it
as a historical recovery artifact, not a current production recovery point.

## 2. Verified archive scope

`pg_restore --list` completed with exit code zero and recorded 1,030 archive
entries. The archive contains PostgreSQL schema and table-data entries for
Skoon application data, including:

* `orders`, `order_items`, `payments`, `shifts`, `financial_movements`,
  `financial_operations`, `inventory_items`, `inventory_batches`, and
  `audit_logs`;
* sequences, primary keys, foreign keys, indexes, functions, RLS state, and
  application schema objects;
* Supabase-managed schemas such as `auth`, `storage`, `realtime`, `vault`,
  `graphql`, `extensions`, and `supabase_migrations`;
* extensions including `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, and
  `supabase_vault`, plus realtime publication and Supabase event-trigger
  entries.

### Scope that requires care

| Area | What the PostgreSQL archive can cover | What it cannot prove or recover alone |
| --- | --- | --- |
| Public application data | Database tables, rows, constraints, indexes, functions, RLS metadata, and sequences in the archive. | Freshness after archive creation; external integrations; deployed application configuration. |
| Supabase Auth | `auth` schema database objects and any included row data. | Running Auth service configuration, JWT/signing configuration, managed roles/ownership, SMTP/OAuth secrets, and platform service state. |
| Supabase Storage | `storage` schema metadata such as bucket/object records if included. | The underlying object-storage files/blobs; database metadata is not a backup of external files. Verify storage objects separately through the platform recovery process. |
| Realtime/Vault/GraphQL | Included PostgreSQL objects where present. | Managed service configuration, role bootstrap, encryption/root-key material, and platform runtime behavior. |

Do not represent metadata rows in `storage.objects` as proof that the actual
files can be restored.

## 3. Existing restore evidence

The archive is valid and readable, but neither required recovery scope has
passed a complete restore:

| Scope | Evidence | Classification |
| --- | --- | --- |
| Full Supabase platform | Plain PostgreSQL 17 restore with `--exit-on-error` stopped at `ALTER SCHEMA auth OWNER TO supabase_admin` because the managed role did not exist. | **ARCHIVE VALID, RESTORE NOT VERIFIED** |
| Public application schema/data | A public-schema restore created data/constraints/indexes/sequences, then stopped at the first RLS policy granted to missing role `authenticated`. Errors were retained; no policy or ownership was skipped. | **ARCHIVE VALID, RESTORE NOT VERIFIED** |

The partial public restore recorded 47 primary keys, 112 validated foreign
keys, 154 indexes, 43 sequences, and RLS enabled on 21 public tables. Its
critical row counts were 35 orders, 18 payments, 15 shifts, 26 financial
operations, 9 financial movements, 68 audit logs, and zero inventory batches
and items. These figures are a baseline for this historical archive only.

## 4. Isolated recovery target prerequisites

An owner must provision one of the following before running this procedure.
Do not create it automatically.

### A. Full-platform recovery target — required for VERIFIED RESTORABLE

A disposable, isolated **Supabase-compatible** recovery environment with:

1. PostgreSQL 17-compatible server/runtime and a dedicated recovery project or
   cluster containing no production database or shared local databases.
2. Supabase-managed bootstrap roles, schemas, extensions, event triggers,
   policies, and service components compatible with the archive. Do not create
   placeholder roles in a shared PostgreSQL cluster; roles are cluster-global.
3. An administrator recovery credential supplied only through an interactive
   prompt or approved secret manager—not command arguments, logs, or checked-in
   environment files.
4. A fresh empty target database whose name includes a timestamp and recovery
   marker, and a read-only record proving it did not exist beforehand.
5. Outbound network isolation: no production app connection, webhooks, cron
   jobs, payment providers, or email delivery enabled for the recovery target.

For a hosted Supabase production recovery, prefer the platform's approved
backup/PITR restore path or Supabase Support procedure over importing a full
platform dump into an already initialized project. Existing managed objects can
conflict with the archive's ownership and bootstrap assumptions.

### B. Public-schema/data recovery target — diagnostic coverage only

A disposable standalone PostgreSQL 17 cluster may validate application public
data only if it is entirely dedicated to recovery. It must be explicitly
authorized to create the archive's required no-login role placeholders and
extensions. This is **not** a full Supabase recovery and cannot validate Auth,
Storage files, Realtime, Vault, or managed service behavior.

## 5. Controlled restore procedure

Perform this section only after target creation is explicitly approved.

### 5.1 Immutable archive preflight

```powershell
Get-FileHash 'D:\Sokoon\backups\Skoon_Full_Backup.dump' -Algorithm SHA256
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' --version
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' --list `
  'D:\Sokoon\backups\Skoon_Full_Backup.dump'
```

Require the SHA-256 above, PostgreSQL 17-compatible client output, and archive
listing exit code zero. Keep the original archive read-only and write logs only
to the recovery record.

### 5.2 Full platform attempt

From the dedicated target, verify the database name is newly created and that
the target is not production. Use interactive password entry only:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' -W `
  --exit-on-error --verbose `
  --host <isolated-host> --port <isolated-port> --username <recovery-admin> `
  --dbname <fresh-recovery-database> `
  'D:\Sokoon\backups\Skoon_Full_Backup.dump'
```

Do not add `--no-owner`, `--no-privileges`, `--schema public`, selective TOC
filters, or error suppression to a full-platform validation. Capture the real
exit code. Any missing managed role, extension, ownership, policy, trigger, or
publication error is a **full-platform restore failure**, not a warning to
skip.

### 5.3 Public-schema diagnostic attempt

Use this only when the full-platform path is unavailable and label its result
as application-data coverage, not platform recovery. Its target must still be
new and isolated. It is successful only if all public objects, including RLS
policies and grants, restore with exit code zero; do not suppress missing-role
errors merely to obtain a successful exit code.

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' -W `
  --exit-on-error --verbose --schema public `
  --host <isolated-host> --port <isolated-port> --username <recovery-admin> `
  --dbname <fresh-recovery-database> `
  'D:\Sokoon\backups\Skoon_Full_Backup.dump'
```

Never point either command at `bkgxjutnfkslpgshufhb`, the production pooler,
the application `DATABASE_URL`, or an existing local database.

## 6. Verification queries for the restored database

Run after a restore whose command completed. These are read-only queries
against the recovery database; replace no identifiers with production values.

```sql
-- Exact critical row counts, not planner estimates.
SELECT 'orders' AS table_name, COUNT(*) AS row_count FROM public.orders
UNION ALL SELECT 'payments', COUNT(*) FROM public.payments
UNION ALL SELECT 'shifts', COUNT(*) FROM public.shifts
UNION ALL SELECT 'financial_movements', COUNT(*) FROM public.financial_movements
UNION ALL SELECT 'financial_operations', COUNT(*) FROM public.financial_operations
UNION ALL SELECT 'inventory_items', COUNT(*) FROM public.inventory_items
UNION ALL SELECT 'inventory_batches', COUNT(*) FROM public.inventory_batches
UNION ALL SELECT 'audit_logs', COUNT(*) FROM public.audit_logs
ORDER BY table_name;

-- Constraint and index integrity inventory.
SELECT contype, COUNT(*) AS count, BOOL_AND(convalidated) AS all_validated
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
GROUP BY contype
ORDER BY contype;

SELECT COUNT(*) AS public_index_count
FROM pg_indexes
WHERE schemaname = 'public';

SELECT COUNT(*) AS public_sequence_count
FROM pg_sequences
WHERE schemaname = 'public';

SELECT COUNT(*) AS rls_enabled_table_count
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity;

-- Financial and order/payment relationships. FKs should make both orphan
-- counts zero; this is an explicit independent check.
SELECT
  (SELECT COUNT(*) FROM public.payments p
   LEFT JOIN public.orders o ON o.id = p.order_id WHERE o.id IS NULL) AS payments_without_order,
  (SELECT COUNT(*) FROM public.payments p
   LEFT JOIN public.shifts s ON s.id = p.shift_id
   WHERE p.shift_id IS NOT NULL AND s.id IS NULL) AS payments_without_shift,
  (SELECT COUNT(*) FROM public.financial_movements fm
   LEFT JOIN public.shifts s ON s.id = fm.source_shift_id
   WHERE fm.source_shift_id IS NOT NULL AND s.id IS NULL) AS movements_without_source_shift;

SELECT status, method, COUNT(*) AS payment_count, COALESCE(SUM(amount), 0) AS amount
FROM public.payments
GROUP BY status, method
ORDER BY status, method;

-- Shift-history consistency; review returned anomalies rather than altering them.
SELECT status, COUNT(*) AS shift_count,
       COUNT(*) FILTER (WHERE status = 'open' AND closed_at IS NOT NULL) AS open_with_closed_at,
       COUNT(*) FILTER (WHERE status = 'closed' AND closed_at IS NULL) AS closed_without_closed_at
FROM public.shifts
GROUP BY status
ORDER BY status;

-- Policies, triggers, and migration metadata.
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname IN ('public', 'auth', 'storage')
ORDER BY schemaname, tablename, policyname;

SELECT evtname, evtevent, evtenabled
FROM pg_event_trigger
ORDER BY evtname;

SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

SELECT migration_name, finished_at IS NOT NULL AS finished,
       rolled_back_at IS NOT NULL AS rolled_back
FROM public._prisma_migrations
ORDER BY started_at;
```

If a fresh production aggregate baseline is authorized, compare those counts
with a read-only production query captured at backup time. Do not compare the
historical archive to current production and call a difference corruption.

## 7. Objective pass/fail criteria

### Full Supabase platform: VERIFIED RESTORABLE only when all pass

1. Archive hash and `pg_restore --list` match the preflight.
2. Full, unsuppressed restore exits zero.
3. No TOC object is skipped because of missing role, extension, ownership,
   policy, trigger, function, or publication dependency.
4. Expected public table/data counts, constraints, indexes, sequences, RLS
   policy definitions, event triggers, and migration metadata match the archive
   baseline or a documented, approved exclusion.
5. Auth/Storage/Realtime recovery coverage is independently confirmed by the
   Supabase-compatible target owner, including whether external Storage files
   are present.
6. The recovery target remains isolated and no production data or credentials
   were altered.

### Application data: diagnostic success only

An isolated public-schema restore may be recorded as successful application-data
coverage when it exits zero with policies/grants included and all checks pass.
It must never be promoted to full-platform restoration.

## 8. Remaining blockers

* No actual complete Supabase-compatible restore has succeeded.
* The existing archive is historically stale; a fresh backup and same-time
  read-only aggregate baseline are required for deployment recovery readiness.
* Managed Supabase roles, service configuration, and Storage file recovery are
  not proven by the PostgreSQL archive.
* Migration-history drift must be reconciled separately; restoration must not
  apply migrations automatically after import.
* The recovery owner must provide an isolated target and an interactive recovery
  credential without exposing it to logs or environment files.

## Decision

**RESTORE NOT VERIFIED.** The archive is valid and useful for controlled
diagnostics, but it has not passed a complete isolated restore and integrity
verification. Do not use it as the sole approval basis for production migration
repair, deployment, or production write testing.
