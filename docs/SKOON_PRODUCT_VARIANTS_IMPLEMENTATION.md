# Product attributes, units, and variants — implementation status

## Decision

**Schema-dependent implementation is blocked pending an approved migration and
an isolated database test.** No database, production record, migration, or
deployment was changed in this pass.

The current database contract cannot safely represent reusable attributes,
measurement units, sellable variants, or their historical snapshots. Adding a
client-only form, a JSON field, browser storage, or an untracked lookup table
would create a second catalogue and violate the stated requirements.

## Current status matrix

| Area | Status | Evidence |
| --- | --- | --- |
| Exact quantity, conversion, duplicate-combination and delete-error policy | Implemented and verified offline | `product-configuration-policy.ts`, offline tests. |
| Proposed normalized Prisma contract | Prepared, not applied | `prisma/schema.prisma` validates; migration is intentionally unapplied. |
| Database tables, restrictive FKs and RLS | Blocked by migration approval | `prisma/migrations/20261026000000_product_configuration_variants/migration.sql`. |
| Attribute/value/unit admin APIs and Arabic RTL UI | Missing | Cannot be database-backed until the additive tables exist. |
| Product variant configuration UI | Missing | Depends on persistent assignments, values and variants. |
| POS / waiter / QR / kitchen selection | Missing | Current order contracts accept only `productId`. |
| Historical variant snapshots | Prepared in schema/migration, unverified | Nullable `OrderItem.productVariantId` and snapshot are additive. |
| Variant inventory consumption | Prepared in schema/migration, unverified | Explicit mapping table; no label-based deduction is proposed. |

## Existing architecture

| Area | Current implementation | Result |
| --- | --- | --- |
| Products/categories | `Product` belongs to a branch/category; product writes use `resolveCatalogBranch` and authoritative server prices. | Reusable. |
| Existing options | `ProductOption` and `ProductOptionValue` belong directly to one product. They have `deletedAt`, but no branch, reusable definition, active state, canonical numeric value, or variant relation. | Not a dynamic attribute system. |
| Units | `Product.unit` and `InventoryItem.unit` are free-form strings. | No unit identity, conversion, archive state, or referential protection. |
| Variants | No `ProductVariant` model; POS, waiter, QR, kitchen, and public-order writes only accept `productId`. | Not implemented. |
| History | `OrderItem` has product name/price and optional option snapshot; `OrderItemOption` references the current product option/value. | A variant id/snapshot contract is missing. |
| Inventory | Recipes, direct product-to-inventory mappings, reservations, batches, and transactions already exist. | Must be reused, not replaced. |

`ProductOption -> Product` and `ProductOptionValue -> ProductOption` currently
use `ON DELETE CASCADE`. Inventory transaction and batch links to an inventory
item also use `ON DELETE CASCADE`. Those behaviours contradict strict
referential deletion protection and must not be left in place for any new
management APIs.

## Safe implementation completed locally

`src/lib/product-configuration-policy.ts` provides tested, server-oriented
building blocks:

* exact decimal/fraction quantity parsing using `bigint`, not floating point;
* canonical sorted variant combinations to reject duplicate selections;
* same-dimension unit-conversion validation using exact factors;
* an Arabic, API-compatible `409 Conflict` deletion error, with an authorized
  bounded product-name list.

The policy intentionally makes no database call. A future write service must
query every dependency in the same serializable transaction/lock scope, call
`assertConfigurationCanBeDeleted`, and only then delete. This prevents a
check-then-delete race; the restrictive foreign keys below remain the final
database guarantee.

## Required proposed data contract

The following normalized models are required; they are a proposal, not applied
schema changes:

| Model | Purpose | Essential restrictions |
| --- | --- | --- |
| `product_attributes` | Reusable branch-scoped definition with name, description, sort order, active/archive fields and audit fields. | Unique active name per branch; no deletion while `product_attribute_assignments` exists. |
| `product_attribute_values` | A labelled value with optional exact canonical numerator/denominator. | Unique active label/canonical value per attribute; no deletion while assignments/variants/history exist. |
| `measurement_units` | Branch-scoped unit identity, symbol, dimension, optional base unit and exact conversion numerator/denominator. | Unit/base must share dimension; no deletion while products, variants, inventory items, mappings, movements, or history exist. |
| `product_attribute_assignments` | Product ↔ reusable attribute, required/selection bounds/order. | `ON DELETE RESTRICT` both sides. |
| `product_variant_values` | Explicit selected values for one variant. | Unique `(variant_id, attribute_value_id)`; restrictive FKs. |
| `product_variants` | Sellable combination, price, SKU, status/archive fields and display order. | Unique `(product_id, canonical_combination)`; restrictive history and inventory mapping links. |
| `variant_inventory_mappings` | Explicit consumption quantity + unit/item reference. | Restrictive FKs; never infer from a displayed label. |
| `order_item_variant_snapshot` (or immutable columns) | Variant id plus name, price, selected value labels and unit snapshot at order time. | Restrict variant deletion when referenced. |

Existing legacy cascade constraints should be reviewed in a **separate**
hardening migration, including
`product_options_product_id_fkey`,
`product_option_values_product_option_id_fkey`,
`inventory_transactions_inventory_item_id_fkey`, and
`inventory_batches_inventory_item_id_fkey`, after an exact dependency review.
It must not alter or delete existing rows. It is intentionally separated from
the additive variants migration so introducing the new catalogue does not take
exclusive locks on high-value operational tables.

## Prepared migration

`prisma/migrations/20261026000000_product_configuration_variants/migration.sql`
is an **unapplied, review-only additive** migration. It creates the normalized
tables, adds nullable product/inventory/order references, creates the indexes
and checks, and enables RLS on the new tables. It does not alter existing
foreign keys or legacy data.

Before approval it needs two live, read-only checks in an isolated clone:

1. confirm every named legacy constraint matches the deployed schema; and
2. inspect locks and validate that no unsupported direct Data API/RLS policy
will affect server access.

The migration does not backfill legacy `ProductOption` records because their
semantics, quantities, units, and valid combinations cannot be inferred
without business review. It does not run `CREATE INDEX CONCURRENTLY`, since a
single transactional migration cannot do so; production lock planning is
therefore explicitly required.

## Production read-only inspection status (2026-10-26)

The configured runtime and direct URLs were identified without exposing their
credentials: both resolve to a non-local Supabase PostgreSQL pooler and the
`postgres` database. Two explicitly read-only Prisma metadata transactions
were attempted; neither returned within the bounded wait period, so both
client processes were stopped. No SQL result, production row, schema change,
or migration was obtained. Production constraint/index/RLS compatibility is
therefore **not verified** and must not be inferred from local migration
history.

### Connectivity evidence (2026-10-26)

Bounded transport diagnostics resolved the configured Supabase pooler hostname
to IPv4 addresses, but TCP connection attempts to the configured transaction
pooler port (`6543`) and direct port (`5432`) both failed before PostgreSQL or
TLS authentication. This explains the earlier Prisma metadata-query hangs: the
runtime has DNS resolution but no usable database TCP path. Evidence required
to distinguish egress filtering from provider reachability is a successful
bounded TCP check from the intended application host or an approved network
administrator review; credentials, firewall configuration, and provider
settings were not changed.

### Generated Prisma client status

`npx.cmd prisma generate` was attempted after the new Prisma models were
prepared. It failed locally with Windows `EPERM` while unlinking the generated
`node_modules/.prisma/client/index.js`. No generated file was deleted and no
Node process was terminated. Until this scoped local lock is released and the
client is regenerated, writing typed Prisma services for the new models would
be unsafe because the checked-in schema and generated client disagree.

Scoped follow-up diagnostics found many unrelated `node.exe` processes but no
process command line, parent working directory, file-handle ownership, or
development listener that could positively associate any of them with
`D:\Sokoon`. An exclusive non-mutating open of the generated client file also
returned `Access denied`. No process was stopped because its ownership could
not be proven. The minimum safe remediation is to close the known Skoon
editor/development process from the owning interactive session, or approve a
tool that can identify the file handle; then rerun `npx.cmd prisma generate`.

## Isolated-migration preflight (2026-10-26)

The migration was **not executed**. The repository's read-only staging guard
was run before any database command and exited with code `1` because the local
ignored staging configuration has a `DATABASE_URL` that does not exactly equal
`SKOON_STAGING_DATABASE_URL`. The guard therefore could not bind the command
to the declared isolated target and no database connection, query, migration,
or test write was attempted.

This is an isolation failure, not a migration failure. It means none of the
following can yet be truthfully verified: independent database identity,
separate credentials, direct-host/project-ref consistency, current live
constraint names, RLS state, recovery readiness, or legacy-data compatibility.
Do not change the environment file automatically. An operator must correct the
staging binding, confirm a separate non-production project and recovery path,
then rerun `npm.cmd run staging:check` successfully before a read-only
preflight and isolated migration can proceed.

### Local PostgreSQL alternative

The staging guard now also supports a deliberately narrow local mode. It is
enabled only with `SKOON_LOCAL_DEVELOPMENT_DATABASE=localhost-only`; both URLs
must be PostgreSQL URLs to `localhost`, `127.0.0.1`, or `::1`, use the exact
database name `skoon_variants_dev`, and `DATABASE_URL` must still exactly
match `SKOON_STAGING_DATABASE_URL`. This mode never accepts a Supabase/Neon or
arbitrary network host. A password and the local administrator credential are
still intentionally not created, read, or logged by the application.

### Local PostgreSQL setup status (2026-10-26)

PostgreSQL 17 client tools and a local PostgreSQL 17 service were found. A
credential-free probe to its localhost listener was rejected with `fe_sendauth:
no password supplied`, so no database identity beyond the local listener and
no administrator capability could be established. No role, database, schema,
or environment file was created or changed.

An operator who owns the local PostgreSQL administrator credential can run the
following only in a local terminal, responding to the native password prompt
without pasting the password into a chat, script, or command history:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -W -h 127.0.0.1 -p 4444 -U postgres -d postgres
```

Then, after selecting a unique development-only password locally:

```sql
CREATE ROLE skoon_variants_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '<local-only-password>';
CREATE DATABASE skoon_variants_dev OWNER skoon_variants_dev;
```

Create the ignored `.env.staging` only after those commands succeed, using
local URLs for both `DATABASE_URL` and `DIRECT_URL`, the same value in
`SKOON_STAGING_DATABASE_URL`, `SKOON_STAGING_PROJECT_REF=local-postgres-17`,
`SKOON_STAGING_ACKNOWLEDGEMENT=isolated-staging-only`, and
`SKOON_LOCAL_DEVELOPMENT_DATABASE=localhost-only`. Run
`npm.cmd run staging:check`; it must pass before running the guarded migration
command. This database must remain empty/synthetic and must never use a
production password or Supabase URL.

## Migration and backfill plan requiring approval

1. Obtain an isolated PostgreSQL/Supabase-compatible database with the current
   schema and a verified recovery path.
2. Inspect real constraint names and current orphan/duplicate candidates in a
   read-only transaction. Do not assume migration-history files equal the live
   schema.
3. Create additive tables/columns and restrictive indexes/FKs. Keep legacy
   `ProductOption` data untouched.
4. Backfill only an explicit, reviewed mapping from existing options to the new
   definitions. Ambiguous options remain legacy; do not invent variants or
   quantity conversions.
5. Add server services and Arabic RTL admin screens, then extend POS, QR,
   waiter, kitchen, invoices, and inventory only after the new persisted
   contract exists.
6. Run concurrency, delete-protection, snapshot, branch/RLS, and end-to-end
   tests on isolated data. Apply to production only under separate approval.

## Required future authorization

Owner manages attributes, values, units, and variants. Manager and Cashier may
manage products/variants only in their authorized branch. Waiter and Kitchen
have no catalogue administration. Every lookup and mutation must resolve the
branch on the server using the existing `resolveCatalogBranch` pattern.

## Current limitations

No persistent dynamic attribute/unit/variant feature, no product-management
screens for it, and no sales/inventory integration were claimed as completed.
Those depend on the approved migration above. Existing historical orders,
invoices, and inventory ledgers were not changed.

## Local verification

| Check | Exit code | Result |
| --- | ---: | --- |
| `npx.cmd prisma validate` | 0 | Pass |
| `npm.cmd run typecheck` | 0 | Pass |
| `npm.cmd run lint` | 0 | Pass |
| `npm.cmd test` | 0 | Pass, 127/127 offline tests |
| `npm.cmd run build` | 0 | Pass |
| `git diff --check` | 0 | Pass |

The Next.js build emitted the pre-existing Windows `EPERM` warning while
opening its ESLint cache, but completed compilation, type validation, static
generation, traces, and route output with exit code zero.
