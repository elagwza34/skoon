# Production Database Safety & Recovery Audit

Date: 2026-10-26
Scope: read-only local configuration and documented-evidence review for the
Supabase PostgreSQL database used by `sokooncafe.com`. No production query,
write, schema change, backup, restore, migration, deployment, or credential
change was performed in this audit.

## Decision

**NO-GO for deployment of the shift-concurrency release until the read-only
checks and recovery prerequisites below are completed.** The application-side
locking fix is local work; it must not be treated as a substitute for the
database invariant or a recoverable production backup.

## Verified facts and limits

| Item | Status | Evidence / limit |
| --- | --- | --- |
| ORM datasource | Verified | `prisma/schema.prisma` uses PostgreSQL with `DATABASE_URL` and `DIRECT_URL`; its header explicitly prohibits `prisma migrate deploy` for production changes. |
| Connection topology | Verified locally, not live | Local configuration identifies the Supabase shared pooler host on port 6543 for `DATABASE_URL` and port 5432 for `DIRECT_URL`. Values and credentials were not printed. This is not proof of deployed Hostinger configuration. |
| Windows-to-Supabase connectivity | Blocked | Earlier bounded DNS/TCP probes resolved the pooler hostname but could not establish TCP to either 6543 or 5432. Prior Prisma metadata attempts were stopped rather than allowed to hang. No new connection attempt was made in this audit. |
| Production project health | Historical read-only evidence | Existing release documentation records an administrator read-only check of project `bkgxjutnfkslpgshufhb` as PostgreSQL 17.11 and `ACTIVE_HEALTHY`. It is not a fresh runtime-credential or application-role check. |
| Production Prisma role and permissions | Not verified | The prior administrator/MCP identity was not the deployed application role. |
| Shift uniqueness migration | Local, not physically verified | `supabase/migrations/20261024125607_enforce_one_open_shift_per_employee_branch.sql` exists locally. This audit did not prove that its index or migration-history entry exists remotely. |
| Existing duplicate open shifts | Not verified | Requires the read-only query below against production. |
| Automated backups / PITR | Not verified | No Supabase Dashboard backup/PITR entitlement or schedule was accessible from this environment. |
| Restore verification | Not verified | See documented recovery evidence below. |
| Hostinger deployment configuration | Not verified | Repository deployment documents contain historical and internally superseded Hostinger/MySQL guidance; no committed live deployment descriptor proves the current runtime settings or auto-deploy policy. |

## Configuration and connectivity assessment

The Prisma runtime is correctly modeled as PostgreSQL with a pooled URL and a
separate direct URL. Existing local validation code also expects a pooler-safe
runtime URL and an explicitly identified direct endpoint. That is a sound
separation, but a local environment file cannot establish the identity,
privileges, or reachability of the deployed Hostinger process.

The only safe conclusion from the current Windows environment is **network
connectivity blocked before authentication**. Possible causes include outbound
TCP policy, IPv4/IPv6 routing, host allow-listing, or a stale endpoint; none can
be distinguished without a bounded probe from the actual Hostinger application
host. Do not change URLs, SSL parameters, credentials, firewall rules, or
Supabase network settings based on this local failure.

### Minimal Hostinger-side diagnostic

From the application host, use the deployed runtime connection configuration
without printing it. Apply a five-second connection timeout and a five-second
statement timeout, then run exactly one read-only command returning only:

```sql
SELECT current_database(), current_user, session_user, version();
```

Record only its success/failure, database name, role names, and server version
in the release ticket. A failure before authentication should be escalated to
the host/network administrator with the destination host, port, UTC timestamp,
and error class—never with a password or full URL.

## Read-only production SQL for Supabase SQL Editor

Run each query separately in the SQL Editor with its query timeout set to five
seconds where supported. Every statement below is a `SELECT`; none changes
data, schema, permissions, or migration history. If the migration-history
schema is inaccessible, record the permission error and stop that portion.

```sql
-- Identity, server version, and basic access context.
SELECT current_database() AS database_name,
       current_user AS effective_role,
       session_user AS login_role,
       version() AS postgresql_version;

-- Database health counters (permission may be restricted by the platform).
SELECT datname,
       numbackends,
       xact_commit,
       xact_rollback,
       deadlocks,
       temp_files,
       temp_bytes
FROM pg_stat_database
WHERE datname = current_database();

-- Production data preflight: this result must be empty before the unique index
-- can be created.
SELECT branch_id, cashier_id, COUNT(*) AS open_shift_count
FROM public.shifts
WHERE status = 'open' AND cashier_id IS NOT NULL
GROUP BY branch_id, cashier_id
HAVING COUNT(*) > 1
ORDER BY branch_id, cashier_id;

-- Physical index definition and validity. A valid, ready index with the exact
-- predicate is the durable invariant; migration history alone is not enough.
SELECT c.relname AS index_name,
       i.indisvalid AS is_valid,
       i.indisready AS is_ready,
       i.indisunique AS is_unique,
       pg_get_indexdef(i.indexrelid) AS index_definition,
       pg_get_expr(i.indpred, i.indrelid) AS predicate
FROM pg_index AS i
JOIN pg_class AS c ON c.oid = i.indexrelid
WHERE i.indrelid = 'public.shifts'::regclass
  AND c.relname = 'shifts_one_open_per_employee_branch_idx';

-- All shift constraints and foreign keys, including their validation state.
SELECT conname AS constraint_name,
       contype AS constraint_type,
       convalidated AS is_validated,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.shifts'::regclass
ORDER BY contype, conname;

-- Migration tracking. This is supporting evidence only; compare it with the
-- physical-index result above.
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version = '20261024125607';
```

Expected safe outcomes are: no duplicate rows; one valid, ready, unique index
whose predicate is `status = 'open'` and `cashier_id IS NOT NULL`; and a
corresponding migration version if the approved Supabase migration workflow
records it. Any other result is a deployment blocker.

## Shift uniqueness migration review

The local migration is additive and contains no data modification:

```sql
CREATE UNIQUE INDEX "shifts_one_open_per_employee_branch_idx"
  ON "shifts" ("branch_id", "cashier_id")
  WHERE "status" = 'open' AND "cashier_id" IS NOT NULL;
```

It matches the intended invariant: at most one open shift per non-null employee
and branch. It deliberately excludes legacy/unassigned (`cashier_id IS NULL`)
rows, so it cannot silently reinterpret their ownership. It protects against
concurrent writers at the database level, complementing the application
advisory-lock contract introduced by P0 Fix 01 and P0 Fix 02.

### Deployment risk and procedure

The checked-in statement is ordinary `CREATE UNIQUE INDEX`, not `CREATE UNIQUE
INDEX CONCURRENTLY`. It can block conflicting writes while built and will fail
if the duplicate preflight returns any row. It must not be run until an approved
maintenance/traffic-control plan exists.

For a high-traffic production change, a PostgreSQL administrator may choose an
approved, separately reviewed `CREATE UNIQUE INDEX CONCURRENTLY` procedure.
That command cannot run inside a transaction block and must be tracked using the
approved Supabase migration process; it must not be substituted silently for the
reviewed migration. The migration tool's recorded version and the physical
index must both be reconciled before release.

The index is additive. Its rollback, if an approved post-change incident
requires it, is an explicit separately authorized index removal; it neither
restores nor changes data. Do not attempt rollback merely because a later
application deployment fails—roll back application code first and preserve the
index unless a database owner determines otherwise.

## Backup and recovery readiness

`docs/BACKUP_RECOVERY_VALIDATION.md` contains the following historical,
verifiable local evidence for `Skoon_Full_Backup.dump`:

* PostgreSQL 17.11 `pg_restore --list` successfully read its custom archive.
* A plain PostgreSQL 17 full restore stopped at the missing Supabase role
  `supabase_admin`; a public-schema restore later stopped at missing role
  `authenticated` while creating an RLS policy.
* The recovered public objects included 47 primary keys, 112 validated foreign
  keys, 154 indexes, 43 sequences, and RLS enabled on 21 tables. This does not
  demonstrate a complete Supabase-platform recovery.
* Its aggregate comparison was already stale relative to a historical
  production read-only count comparison.

Therefore both **automated backup/PITR availability** and **a current,
full-platform restore** are **NOT VERIFIED**. The local archive is classified
only as **ARCHIVE VALID, RESTORE NOT VERIFIED**; it is not a release recovery
guarantee.

The database owner must check the actual Supabase project dashboard and plan
details for: backup/PITR availability, most recent successful backup timestamp,
retention window, restore target options, and restoration runbook. The owner
must then retain evidence of a successful restore of a fresh backup into an
isolated Supabase-compatible recovery environment. Do not use the existing
plain PostgreSQL recovery as proof that Auth, Storage, Realtime, role ownership,
or RLS policies can be restored.

## Controlled deployment sequence

1. Freeze this release until a database owner confirms a current recoverable
   backup/PITR policy, recovery owner, and rollback decision path.
2. From Supabase SQL Editor, run the read-only preflight queries above and
   attach their aggregate/metadata results to the release record.
3. Stop if duplicates exist, the index is absent/invalid, migration history and
   physical schema disagree, or the deployed application role is not proven.
4. If the index is absent and preflight is clean, obtain a separate explicit
   production-migration approval and choose the reviewed maintenance or
   concurrent-index procedure. Apply no unrelated migrations.
5. Re-run the duplicate and physical-index queries. Confirm application
   deployment configuration and Hostinger outbound connectivity from the actual
   runtime host.
6. Deploy the P0 application changes only after the database invariant is
   confirmed. Observe error rates, lock timeouts, failed payments, and shift
   close failures with a named rollback owner.
7. Do not run production write tests to prove this behavior. Execute
   PostgreSQL concurrency coverage only in an independently verified
   non-production environment.

## Remaining blockers and risks

* Production TCP/runtime-role verification is blocked from this Windows host.
* Duplicate-shift and physical-index status are **NOT VERIFIED**.
* The migration has not been approved or applied in this audit.
* Automated backup/PITR status, freshness, and successful full Supabase restore
  are **NOT VERIFIED**.
* Existing recovery evidence is stale and does not restore Supabase-managed
  roles/policies end to end.
* Hostinger auto-deploy behavior and current deployment configuration must be
  confirmed in hPanel before any push; repository documents alone are not
  authoritative.

No production mutation was performed.

## Migration-history reconciliation addendum (2026-10-26)

### Confirmed production facts supplied by the database owner

* The duplicate-open-shift preflight returned no rows.
* `shifts_one_open_per_employee_branch_idx` was created manually with
  `CREATE UNIQUE INDEX CONCURRENTLY`.
* PostgreSQL reports the index as valid and ready.
* Version `20261024125607` was not in remote migration history before that
  manual creation.
* A backup was created, but a successful restore remains unverified.

### Local migration equivalence

`supabase/migrations/20261024125607_enforce_one_open_shift_per_employee_branch.sql`
contains comments plus exactly one executable statement:

```sql
CREATE UNIQUE INDEX "shifts_one_open_per_employee_branch_idx"
  ON "shifts" ("branch_id", "cashier_id")
  WHERE "status" = 'open' AND "cashier_id" IS NOT NULL;
```

It has no data change, RLS/grant change, function, trigger, constraint, or
additional index. A concurrent creation changes the lock/transaction behavior
of deployment, not the resulting index definition. Therefore recording this
version as applied is appropriate **only if** the catalog output proves the
production index is unique, valid, ready, named exactly as above, built on
`public.shifts (branch_id, cashier_id)`, and has the exact partial predicate.

### Approved-command candidate — do not run without explicit approval

First confirm the CLI is linked to the intended Supabase project and list the
local/remote history. Do not supply a database URL or password on the command
line.

```powershell
npx.cmd supabase migration list --linked
```

If that output shows local `20261024125607` missing remotely, and the physical
index equivalence check is retained in the change record, the exact metadata
repair command is:

```powershell
npx.cmd supabase migration repair 20261024125607 --status applied --linked
```

The command updates only `supabase_migrations.schema_migrations`; it does not
run the local SQL or recreate the index. Immediately verify both history and
catalog state:

```powershell
npx.cmd supabase migration list --linked
```

```sql
SELECT c.relname AS index_name,
       i.indisvalid AS is_valid,
       i.indisready AS is_ready,
       i.indisunique AS is_unique,
       pg_get_indexdef(i.indexrelid) AS index_definition,
       pg_get_expr(i.indpred, i.indrelid) AS predicate
FROM pg_index AS i
JOIN pg_class AS c ON c.oid = i.indexrelid
WHERE i.indrelid = 'public.shifts'::regclass
  AND c.relname = 'shifts_one_open_per_employee_branch_idx';

SELECT version
FROM supabase_migrations.schema_migrations
WHERE version = '20261024125607';
```

The local CLI help command could not be run in this sandbox because its
telemetry write under the user profile was denied by Windows. The command form
above was cross-checked against the current official Supabase migration
documentation; this local tooling issue must not be bypassed by direct SQL
insertion into the history table.

### Drift and P0 compatibility

The only intended drift is deployment method: the checked-in migration uses
ordinary `CREATE UNIQUE INDEX`, whereas production used its concurrent form.
That is acceptable when the resulting catalog definition matches exactly; do
not edit the historical migration merely to reflect execution mechanics.

P0 Fix 02 is compatible: it retains the per-employee/branch advisory lock and
maps Prisma unique violations (`P2002`) from the durable partial index to the
existing HTTP 409 shift contract. P0 Fix 01 is compatible: its common
transaction-scoped financial shift lock serializes reconciliation writers;
closing a shift changes the row out of the partial-index predicate and does not
invalidate the invariant. Neither fix requires a schema change beyond this
already-created index.

### Recommendation

**CONDITIONAL GO — migration-history repair only.** Proceed only after an
operator confirms the linked project identity and retains the exact physical
index query output. The repair command above then reconciles metadata without
replaying DDL.

**NO-GO — production deployment.** Successful backup restore remains
unverified, so do not deploy the P0 changes until the documented recovery
prerequisite is met and the post-repair checks pass.

## Final migration-repair preflight (2026-10-26)

**Result: BLOCKED — do not run migration repair.**

Read-only verification established that the local application Supabase URL, the
local CLI link file, and the Supabase management project all identify project
`bkgxjutnfkslpgshufhb` (`skoon`, `eu-west-1`, `ACTIVE_HEALTHY`, PostgreSQL
17.11). No secret was read or recorded. The requested local CLI command,
`npx.cmd supabase migration list --linked`, was attempted but stopped before
connecting because the CLI could not parse the local `.env` file. It was not
retried. A read-only Supabase migration listing and catalog query were used to
complete the safety check.

The physical index is an exact semantic match for the local file:

```text
CREATE UNIQUE INDEX shifts_one_open_per_employee_branch_idx
ON public.shifts USING btree (branch_id, cashier_id)
WHERE status = 'open' AND cashier_id IS NOT NULL
```

It is unique, valid, and ready. Version `20261024125607` is absent remotely.
However, remote history has additional discrepancies that make a one-version
repair unsafe without a complete history reconciliation:

| Local migration file | Remote migration evidence | Finding |
| --- | --- | --- |
| `20261023130000_stock_counts.sql` | Remote entry version `20261023030511`, name `20261023130000_stock_counts` | Recorded remote version differs from the local filename timestamp. |
| `20261023150000_hr_employee_foundation.sql` | Remote entry version `20261023051916`, name `20261023150000_hr_employee_foundation` | Recorded remote version differs from the local filename timestamp. |
| `20261023162000_manager_service_requests.sql` | Remote entry version `20261023092128`, name `20261023162000_manager_service_requests` | Recorded remote version differs from the local filename timestamp. |
| No corresponding local file | Remote entry version `20261023023014`, name `20261023120000_inventory_reservations_batches_accountability` | Remote-only migration requires provenance and schema comparison. |
| `20261023140000_waste_idempotency.sql`, `20261023160000_hr_scheduling_attendance.sql`, `20261023161000_hr_leave_holidays.sql`, `20261024110000_waiter_order_reconciliation_reviews.sql` | No corresponding remote entry in the listing | Local-only pending/drifted migrations must be reviewed before repair. |

The remote entry `20261024100000/waiter_responsibility_operations` does match
the local Waiter migration timestamp. Do not infer that all other objects are
safe from this one match.

The next safe step is read-only reconciliation of every local/remote migration
pair and a schema-equivalence review of the remote-only and locally missing
versions. Only after that review may an owner explicitly approve a targeted
history repair. The previously proposed command remains intentionally
unexecuted:

```powershell
npx.cmd supabase migration repair 20261024125607 --status applied --linked
```
