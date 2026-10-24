# Backup Recovery Validation

## Decision

**BLOCKED BY MISSING TOOLS.** The backup must not be treated as restorable until
a compatible `pg_restore` performs a real restore into an isolated database and
the checks below pass.

## Backup identity

| Field | Value |
| --- | --- |
| Path | `D:\Sokoon\backups\Skoon_Full_Backup.dump` |
| Size | 562,607 bytes |
| Last-write time (UTC) | 2026-10-24T11:19:05.3616075Z |
| SHA-256 | `E6A4628840B0ED849E80AE9AC0AA6B0D3A01F73C9E39D8ABB70AD2D27AC763E9` |

The original archive was read only and was not overwritten or moved.

## Tool discovery and archive inspection

* A local PostgreSQL 16 installation was found at
  `C:\Program Files\PostgreSQL\16\bin`.
* The local PostgreSQL service `postgresql-x64-16` is running.
* `pg_restore --version` reports PostgreSQL 16.15.
* `pg_restore --list` against the archive exited with code `1` and reported:
  `unsupported version (1.16) in file header`.
* No PostgreSQL 17+ `pg_restore`, Docker runtime, or other compatible local
  runtime was found.

This error shows that the archive has a PostgreSQL custom-archive header, but
PostgreSQL 16 cannot inspect its contents. It does **not** prove that all
archive objects or data are complete.

The first bytes of the archive identify the PostgreSQL custom format (`PGDMP`).
Archive format `1.16` requires a PostgreSQL 17-or-newer `pg_restore`; the
installed PostgreSQL 16.15 client is not compatible. The archive header alone
does not safely establish the source server major version, so that version must
be captured from the compatible archive listing or backup job metadata.

### Approved installation prerequisite

Install PostgreSQL 17 Windows **Command Line Tools only**, alongside the
existing PostgreSQL 16 installation. Use the official PostgreSQL Windows
download page, choose a custom installation, select only Command Line Tools,
and do not select PostgreSQL Server, initialize a cluster, or create/change a
Windows service. Install to a versioned directory such as
`C:\Program Files\PostgreSQL\17`. This adds `pg_restore.exe` without altering
the running PostgreSQL 16 service.

After installation, confirm:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' --version
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' --list \
  'D:\Sokoon\backups\Skoon_Full_Backup.dump'
```

## Required validation procedure

1. Provide PostgreSQL client tools with a `pg_restore` compatible with archive
   version 1.16 (PostgreSQL 17 or newer), without changing production.
2. Prefer an isolated PostgreSQL server of the same major version as the source
   backup. Do not reuse the running local PostgreSQL 16 service without an
   explicit isolated temporary database and service plan.
3. Run `pg_restore --list` and retain its exit code and object listing.
4. Create a temporary local recovery database, then restore with a command of
   this form (with a local, non-production connection only):

   ```powershell
   pg_restore --exit-on-error --verbose --dbname <temporary-local-database> \
     "D:\Sokoon\backups\Skoon_Full_Backup.dump"
   ```

5. Verify, at minimum, table definitions and data for `users`, `shifts`,
   `orders`, `order_items`, `invoices`, `payments`, `financial_movements`,
   `inventory_items`, `inventory_batches`, `audit_logs`, and their sequences,
   indexes, foreign keys, and constraints.
6. Compare the restored schema with the current Prisma schema and recorded
   production read-only metadata. Do not apply migrations to the recovered
   database as part of this validation.
7. Record row counts and referential-integrity results. Only a restore with
   exit code zero and successful checks can be classified as `VERIFIED
   RESTORABLE`.

## Recovery limitations

* No archive listing, object coverage, or table-data validation was possible
  with PostgreSQL 16 tools.
* No local restore was attempted; therefore there are no restored row counts,
  schema-coverage results, or recovery timing measurements.
* No production connection or production write was used.

## Next action

Install or provide an approved PostgreSQL 17+ client/runtime, then repeat this
documented isolated restore procedure before authorised production E2E writes.

## PostgreSQL 17 compatibility follow-up

PostgreSQL 17.11 tools and a local PostgreSQL 17 service subsequently became
available. The following read-only archive inspection succeeded:

```text
pg_restore (PostgreSQL) 17.11
pg_restore --list exit code: 0
Archive created at: 2026-10-24 14:17:15
Format: CUSTOM
Compression: gzip
Dump version: 1.16-0
Dumped from database version: 17.11
Dumped by pg_dump version: 17.11
TOC entries: 1030
```

The archive contains Skoon public tables and table data, including `orders`,
`payments`, `shifts`, `inventory_items`, `inventory_batches`,
`financial_movements`, `financial_operations`, and `audit_logs`. It also
contains Supabase-managed schemas (`auth`, `storage`, `realtime`, `vault`,
`graphql`, `extensions`, and `supabase_migrations`), extensions (`pgcrypto`,
`uuid-ossp`, `pg_stat_statements`, and `supabase_vault`), RLS entries,
Supabase event triggers, a realtime publication, and ownership references to
Supabase roles. These dependencies mean a plain PostgreSQL recovery runtime
may reject parts of a full platform restore; such errors must be retained and
reported rather than skipped.

The PostgreSQL 17 service accepts connections on `127.0.0.1:4444`. A
credential-free connection probe as local user `postgres` was rejected with
`fe_sendauth: no password supplied`. No password was requested, extracted, or
changed, and no database was created. The remaining prerequisite is a local,
non-production PostgreSQL 17 administrator credential or an approved
credential-free local recovery role with `CREATEDB` rights. Once supplied,
create a uniquely named recovery database and restore with `--exit-on-error`;
do not use production credentials or the application connection string.

## Controlled restore evidence

Interactive PostgreSQL authentication was performed only in the native local
client prompt. No password was stored, logged, passed in an argument, or added
to an environment variable.

The local recovery administrator was confirmed on PostgreSQL 17.11, port 4444,
as user `postgres`, with both `CREATEDB` and `SUPERUSER` privileges. Three
isolated recovery databases were created; none was an existing database and no
production connection was used.

### Full platform restore

`pg_restore --exit-on-error --verbose` to
`skoon_recovery_20261024_20261024_interactive` exited with code `1` at the
first Supabase ownership dependency:

```text
ALTER SCHEMA auth OWNER TO supabase_admin;
ERROR: role "supabase_admin" does not exist
```

This is an expected dependency gap in plain local PostgreSQL, not an archive
corruption finding. No Supabase role was fabricated and no archive object was
skipped to obtain a successful exit code.

### Application public-schema recovery

A separate fresh database, `skoon_recovery_20261024_20261024_public`, was
restored with:

```powershell
pg_restore -W --exit-on-error --verbose --schema public \
  --host 127.0.0.1 --port 4444 --username postgres \
  --dbname skoon_recovery_20261024_20261024_public \
  "D:\Sokoon\backups\Skoon_Full_Backup.dump"
```

The restore created application functions, tables, data, sequences, primary
keys, foreign keys, indexes, and enabled RLS. It exited with code `1` only when
creating the first policy addressed to the missing Supabase role
`authenticated`. The failed policy was not bypassed. Therefore this is useful
application-data recovery evidence, but it is not a full platform restore.

Exact recovered application row counts:

| Table | Rows |
| --- | ---: |
| `audit_logs` | 68 |
| `financial_movements` | 9 |
| `financial_operations` | 26 |
| `inventory_batches` | 0 |
| `inventory_items` | 0 |
| `orders` | 35 |
| `payments` | 18 |
| `shifts` | 15 |

Recovered structural checks reported 47 primary keys, 112 foreign keys, 154
indexes, 43 sequences, and RLS enabled on 21 public tables. All 112 recovered
foreign keys were marked validated. The application tables and critical
business entities correspond to the current Prisma schema; no migration was
applied during recovery validation.

## Final confidence assessment

**ARCHIVE VALID, RESTORE NOT VERIFIED** for a complete Supabase platform
recovery. The archive is readable with its matching PostgreSQL 17.11 tools and
the application public schema/data recovered through all critical data,
constraint, index, sequence, and foreign-key stages. A full restore requires a
compatible isolated Supabase runtime (including its managed roles and policy
roles) before it can be called `VERIFIED RESTORABLE`.

## Production freshness comparison

On 2026-10-24, a production comparison was run through a transaction whose
first statement was `SET TRANSACTION READ ONLY`. It returned aggregate counts
only; no production rows or schema were changed.

| Table | Recovered backup | Current production | Difference |
| --- | ---: | ---: | ---: |
| `audit_logs` | 68 | 69 | +1 |
| `financial_movements` | 9 | 9 | 0 |
| `financial_operations` | 26 | 27 | +1 |
| `inventory_batches` | 0 | 2 | +2 |
| `inventory_items` | 0 | 1 | +1 |
| `orders` | 35 | 36 | +1 |
| `payments` | 18 | 18 | 0 |
| `shifts` | 15 | 18 | +3 |

The archive is therefore a valid, internally consistent historical backup but
is not a current production snapshot. The observed differences are consistent
with activity after the archive was created; their exact business origin was
not inspected because only aggregate read-only comparison was authorised.

## Role-isolation decision

The `supabase_admin` and `authenticated` dependencies cannot safely be
fabricated on the existing PostgreSQL 17 server: PostgreSQL roles are
cluster-global, so even no-login placeholder roles would alter shared server
state. No placeholder role was created. A full restore must instead use a
separate Supabase-compatible recovery cluster or disposable PostgreSQL cluster
that has no existing databases requiring protection.

## Independent recovery classifications

| Scope | Classification | Basis |
| --- | --- | --- |
| Application public schema/data | **ARCHIVE VALID, RESTORE NOT VERIFIED** | Application data, keys, indexes, sequences, and validated FKs restored, but security policies could not complete without the Supabase `authenticated` role. The backup is also stale against current production aggregates. |
| Full Supabase platform | **ARCHIVE VALID, RESTORE NOT VERIFIED** | Full restore stopped at missing `supabase_admin`; managed roles, schemas, extensions, triggers, and policies require an isolated Supabase-compatible cluster. |

## E2E readiness consequence

Do not begin production E2E writes based on this backup alone. The next safe
executable step is to obtain a fresh production backup, repeat the aggregate
freshness comparison, then restore it in a disposable Supabase-compatible
cluster with exit code zero and policy validation before approving production
write tests.
