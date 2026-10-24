# Skoon Prisma runtime verification — Hostinger Phase 3A

Date: 2026-10-24
Scope: read-only inspection of the deployed Hostinger configuration, local runtime wiring, and the Supabase catalog. No deployment, database write, migration, grant, configuration change, or credential disclosure occurred.

## Decision

**UNVERIFIED / NO-GO for Waiter release.** The deployed Hostinger build is healthy, the expected variables are configured, and the required waiter tables exist with the expected administrator and service-role privileges. The actual PostgreSQL role used by the live Prisma process cannot be established from masked Hostinger environment metadata or from an administrator MCP connection. A restricted, server-side, read-only diagnostic must run in the actual application runtime before dependent Waiter operations can be approved.

### Phase 3A execution result

**Private runtime execution: NOT AVAILABLE through the connected Hostinger API.** On 2026-10-24, the Hostinger operation catalogue was searched explicitly for Node.js command execution, runtime shell, terminal, and SSH capabilities. It exposes deployment/build status, masked environment-variable names, runtime logs, restart, and destructive configuration operations, but no private command executor, SSH session, terminal, or one-off Node-process invocation. No write-capable workaround was used: no diagnostic route/code was deployed, no environment value changed, no restart was requested, and no log was cleared.

Consequently, the diagnostic below was **not executed** and the actual runtime role, database name, `rolbypassrls`, and role-specific table/sequence privileges remain **UNVERIFIED**.

## 1. Verified deployment architecture

| Area | Result | Evidence |
| --- | --- | --- |
| Hosting | PASS | Both `skoon.awexen.com` and `sokooncafe.com` are Hostinger Node.js applications, configured as Next.js on Node 22 with npm. |
| Source and deployment | PASS | Both applications deploy `elagwza34/skoon`, branch `main`, with auto-deploy enabled. |
| Build process | PASS | Hostinger runs `npm run build`; `postinstall` ran `prisma generate` (Prisma 6.19.3) in the latest completed deployment. |
| Latest Hostinger deployment | PASS | The observed deployment of commit `9a216a55…` completed and restarted the application. This proves that deployment's build, not the current uncommitted workspace. |
| Runtime variables | PARTIAL | Hostinger lists masked `DATABASE_URL` and `DIRECT_URL` on both Skoon applications, plus the expected Supabase keys and `APP_URL`. Values, hosts, ports, database names, and PostgreSQL users are intentionally unavailable through that read-only API. |
| Runtime errors | OBSERVED | One-day Hostinger logs contain unrelated fetch/Server Action warnings, but no Prisma authentication, permission, or waiter-table error. Absence of an error is not a privilege proof. |

`docs/HOSTINGER-DEPLOYMENT.md` contains historical MySQL instructions that conflict with its current PostgreSQL/Supabase banner. This document treats the live Hostinger application metadata and the current Prisma schema as authoritative; the old MySQL examples must not be used for this release.

## 2. Prisma connection and execution path

`prisma/schema.prisma` declares PostgreSQL with:

```prisma
url       = env("DATABASE_URL")
directUrl = env("DIRECT_URL")
```

`src/lib/prisma.ts` creates `new PrismaClient()` lazily without a datasource override. Therefore normal application reads and writes use the process's `DATABASE_URL`. `DIRECT_URL` is schema-engine/CLI configuration; it is not an application-query override in this client construction.

`next.config.ts` externalizes `@prisma/client`, so the Node runtime loads the client produced by the Hostinger `postinstall`. `package.json` intentionally blocks `prisma:migrate:deploy`; schema changes are not deployed by this application script.

The local `.env` connection layout is not evidence of the Hostinger value or role and was not used as such.

## 3. Required Waiter runtime permissions

The currently deployed Waiter operational code uses Prisma transactions and the following model operations:

| Operation | Tables / facilities | Minimum runtime capability |
| --- | --- | --- |
| QR claim and manager reassignment | `orders`, `order_responsibility_history`, `audit_logs`, notifications | read/update `orders`; insert history and audit/notification rows |
| Table transfer | `orders`, `cafe_tables`, `order_table_transfers`, audit log | read/update order and table context; insert transfer history; `pg_advisory_xact_lock` |
| Waiter handover | `orders`, `waiter_shift_handovers`, `order_responsibility_history`, `shifts`, audit/notifications | read/update orders/handover rows; insert handover/history/audit rows; advisory locks |
| Emergency serving | existing orders/items/inventory models | existing serving privileges; it is not a grant to bypass inventory controls |

The code uses `pg_advisory_xact_lock` inside Prisma transactions for table transfer and handover serialization. This is a built-in PostgreSQL function, not a custom `SECURITY DEFINER` dependency. No new custom privileged function was found in the Waiter operation path.

## 4. Read-only catalog findings

Read-only Supabase catalog checks against `bkgxjutnfkslpgshufhb` verified:

| Object | RLS | Policies | `postgres` / `service_role` SELECT, INSERT, UPDATE | Sequence `USAGE` |
| --- | --- | --- | --- |
| `order_responsibility_history` | enabled, not forced | none | yes / yes | `order_responsibility_history_id_seq`: yes / yes |
| `order_table_transfers` | enabled, not forced | none | yes / yes | `order_table_transfers_id_seq`: yes / yes |
| `waiter_shift_handovers` | enabled, not forced | none | yes / yes | `waiter_shift_handovers_id_seq`: yes / yes |

The expected foreign keys and checks are present: responsibility history is linked to order, branch, and assigning/assigned users; transfers retain both table references and reject same-table transfers; handovers retain branch, sender shift, requester and recipient with pending/accepted/cancelled and distinct-participant checks. Earlier schema-equivalence review also verified the expected indexes and floor-plan/order responsibility fields.

`anon` and `authenticated` have no sequence `USAGE` for the three operational sequences. The tables deliberately have RLS enabled with no direct client policy. This is secure only if trusted server access uses a role that can bypass RLS or has applicable policies.

**Important limitation:** these catalog checks were performed through administrative Supabase access. They prove the configuration for named roles, not the identity, privileges, or RLS behavior of the deployed Prisma connection.

## 5. Actual Prisma runtime role

**Status: UNVERIFIED.** Hostinger masks environment values and exposes no safe read-only process-command runner. The Phase 3A Hostinger capability check confirms that the connected API does not offer private Node command/SSH/terminal execution. The current deployment metadata cannot reveal the PostgreSQL username, database target, or whether it uses `postgres`, a pooled database role, or another restricted role. Neither `SUPABASE_SERVICE_ROLE_KEY` nor an MCP administrator query proves which PostgreSQL role Prisma uses.

No public API endpoint was added. No temporary diagnostic was deployed.

## 6. Required one-off server-side diagnostic

This command was **not executable through the connected Hostinger API**. An authorized Hostinger operator may execute it only through a private server shell/one-off runtime command in the currently deployed application directory. It uses the same `DATABASE_URL` path as `new PrismaClient()`, runs only `SELECT`, prints no URL/password/key, returns no business rows, and disconnects the client in `finally`.

```js
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const result = await prisma.$queryRawUnsafe(`
    WITH waiter_tables AS (
      SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'order_responsibility_history',
          'order_table_transfers',
          'waiter_shift_handovers'
        )
    )
    SELECT current_user, session_user,
      relname,
      relrowsecurity AS rls_enabled,
      relforcerowsecurity AS rls_forced,
      has_table_privilege(current_user, oid, 'SELECT') AS can_select,
      has_table_privilege(current_user, oid, 'INSERT') AS can_insert,
      has_table_privilege(current_user, oid, 'UPDATE') AS can_update
    FROM waiter_tables ORDER BY relname
  `)
  console.log(JSON.stringify(result))
  for (const table of [
    'order_responsibility_history',
    'order_table_transfers',
    'waiter_shift_handovers',
  ]) {
    await prisma.$queryRawUnsafe(`SELECT 1 FROM public.${table} LIMIT 0`)
  }
  const sequences = await prisma.$queryRawUnsafe(`
    SELECT c.relname,
      has_sequence_privilege(current_user, c.oid, 'USAGE') AS can_use_sequence
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND c.relname IN (
        'order_responsibility_history_id_seq',
        'order_table_transfers_id_seq',
        'waiter_shift_handovers_id_seq'
      )
    ORDER BY c.relname
  `)
  console.log(JSON.stringify(sequences))
}
main().catch((error) => {
  console.error('PRISMA_RUNTIME_DIAGNOSTIC_FAILED', error.code || error.name)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
```

Acceptance requires the expected three rows, `can_select`, `can_insert`, `can_update`, and `can_use_sequence` all `true`, and successful `LIMIT 0` queries. Record only the returned database role names and booleans in the release evidence. Do not compensate for a failure with broad grants, RLS removal, role changes, or a public diagnostic route.

## 7. Schema and migration dependency status

The deployed database already contains the Waiter tables/columns expected by `src/lib/staff-waiter-operations.ts` and its Prisma models. However, the remote migration ledger lacks `20261024100000_waiter_responsibility_operations`; its origin is unknown and replaying the local non-idempotent SQL is unsafe. See `docs/WAITER_SCHEMA_DRIFT_RECOVERY.md`.

The local `20261024110000_waiter_order_reconciliation_reviews.sql` is still unapplied. The deployed application commit observed in Hostinger predates the current local, uncommitted Waiter/reconciliation code, so neither it nor its migration may be considered released.

## 8. PostgreSQL integration-test readiness

**BLOCKED.** No disposable PostgreSQL test environment was identified. The known shared Supabase project is not an acceptable mutation-test target for release verification. No test fixtures were created.

Before mutation testing, provide an isolated target and run test cases for concurrent QR claims, claim approval/rejection, reassignment, handover acceptance/rejection and shift-close blocking, transfer collision, emergency serving reason/audit, branch/role enforcement, and non-duplication of inventory/financial movements. Fixtures must be uniquely scoped and removed in `finally` cleanup.

## 9. Next actions and release recommendation

| Priority | Action | Approval needed |
| --- | --- | --- |
| BLOCKER | Have a Hostinger operator run the private read-only diagnostic above and preserve the sanitized result. The connected API cannot do this. | Approval/access to the private Hostinger shell or equivalent one-off runtime command facility. |
| BLOCKER | Resolve the missing migration-history provenance and obtain explicit metadata-only repair approval before any repair; never replay the migration. | Explicit Owner approval for the exact version/target. |
| BLOCKER | Obtain Owner/Manager decisions for the 15 nonterminal legacy orders with no responsible waiter; no bulk assignment. | Operational Owner/Manager decisions. |
| HIGH | Obtain a disposable PostgreSQL environment and execute the waiter integration suite with fixture cleanup. | Approval/infrastructure access. |
| MEDIUM | Update/archive the stale MySQL guidance in `docs/HOSTINGER-DEPLOYMENT.md` after separate review. | Documentation-only approval is sufficient. |

**Final recommendation: NO-GO.** The Hostinger deployment build is verified for its deployed commit, but the role and privilege path needed by the live Prisma client is not yet proven, migration history remains inconsistent, legacy ownership remains unresolved, and behavioral tests have not run against an isolated PostgreSQL target.
