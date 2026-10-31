# Skoon full codebase audit — preliminary evidence report

Date: 2026-10-27. Scope: repository source/configuration and prior read-only
production observations. This is an audit only; no production records,
migrations, deployments, or account credentials were changed.

## Health assessment

The repository has a clear Next.js App Router structure and Prisma schema
validation passes. The highest risk area is authentication/routing: it has
received several recent, overlapping fixes and still needs an authenticated
production trace. Financial, inventory, HR and public-order paths are present
but were not fully traced end-to-end in this preliminary pass.

## Route and redirect map

| Entry | Gate | Canonical result |
|---|---|---|
| `/login` | Supabase Auth + `public.users` role lookup | role home |
| `/owner` | middleware identity + app layout RBAC | Owner home |
| `/manager` | middleware identity + app layout RBAC | Manager home |
| `/cashier` | middleware identity + app layout RBAC | Cashier board |
| `/kitchen` | middleware identity + app layout RBAC | Kitchen board |
| `/waiter` | middleware identity + app layout RBAC | Waiter board |
| `/dashboard` | removed as a route in current worktree | no canonical use |

Unauthenticated production `HEAD /owner` returned one 307 to
`/login?next=%2Fowner`, which is expected. It did not demonstrate an HTTPS,
www, or unauthenticated redirect loop. An authenticated production trace was
not available in this audit.

## Confirmed findings

### AUTH-001 — P0 — historical canonical-home redirect loop

Affected: `src/middleware.ts`, prior dashboard route implementation.

Evidence: prior middleware rewrote `/owner` and `/manager` to `/dashboard`;
the dashboard implementation redirected a role back to its canonical home.
That forms `/owner → /dashboard → /owner` when the rewritten pathname reaches
the guard. Recent commits `995efc6` and `62a7805` remove the rewrite and make
role homes independently reachable. Deployment verification is still required.

Recommendation: retain exactly one identity redirect (middleware for no
session) and one role decision (server layout/session resolver). Capture a
request-id across both layers for an authenticated production test.

### AUTH-002 — P1 — authenticated-but-unprovisioned was formerly treated as login navigation

Affected: `src/app/(app)/layout.tsx`, `src/app/login/page.tsx`,
`src/app/login/actions.ts`, `src/lib/session.ts`.

Evidence: Supabase identity and application authorization are separate;
`public.users` is authoritative. A valid Auth user without an active matching
row cannot safely be assigned a role. Current work renders a terminal account
configuration state rather than redirecting this state repeatedly through
`/login`.

Recommendation: log classification only (`unauthenticated`, `unprovisioned`,
`disabled`, `database_failure`) and never use employee profile existence as a
login predicate.

### AUTH-003 — P1 — mutable permissions can produce role-home self redirects

Affected: `src/lib/route-access.ts`, role pages.

Evidence: a role home guarded by a permission that the same role lacks can
redirect to `homeForRole(role)`, i.e. to itself. Current work exempts each
role's own home from mutable permission gating while retaining API/mutation
authorization.

### LEGACY-001 — P2 — residual dashboard terminology and compatibility references

Affected: `src/lib/navigation.ts`, `src/lib/route-access.ts`,
`src/lib/pos/use-pos-cart.ts`, comments and dashboard-named components.

Status: mostly compatibility/naming, not proof of active legacy route use.
`navigation.ts` maps the dashboard link to each role home at runtime. Do not
delete dashboard-named components without import and user-flow review.

### CONFIG-001 — P2 — Prisma 7 migration warning

Affected: `package.json`, Prisma configuration.

Evidence: `npx prisma validate` succeeds but reports deprecated
`package.json#prisma` configuration.

Recommendation: schedule a separate Prisma-config migration and CI validation;
do not combine it with authentication remediation.

## Database compatibility

`npx prisma validate` succeeded. Earlier read-only production inspection found
Supabase Auth identities and `public.users` can diverge; no automatic repair
is safe because roles and branches must be verified. No production schema
comparison, RLS policy inventory, index-plan analysis, or migration-history
comparison was completed in this preliminary report.

### DB-001 — P0 — production migration history materially lags repository migrations (confirmed)

Evidence (read-only): production Supabase migration history exposes six applied
migrations: inventory/accountability, stock counts, HR employee foundation,
manager service requests, waiter responsibility, and HR scheduling/attendance.
The repository contains fifteen local migration directories, including
`20261018120000_cash_ledger_and_handover`,
`20261018120100_financial_idempotency_reversals`,
`20261027100000_complete_hr_payroll_foundation`, and
`20261027130000_order_item_and_invoice_discounts`, none of which appear in
the production migration list.

Impact: code paths that query the missing tables/columns can fail in
production. This is a more plausible explanation for a role page failing after
authentication than an Auth redirect loop alone. It also means a local build
cannot prove production schema compatibility.

Required remediation: generate a non-destructive, idempotent schema
compatibility plan from the deployed schema and migration history; take a
backup and obtain explicit approval before applying migrations. Never use
`prisma db push` or re-run migration folders blindly.

## API and module inventory (inspected classification)

| Area | Evidence inspected | Status |
|---|---|---|
| Auth/routing | middleware, app layout, login action/page, session, route guard, safe redirects | inspected |
| Role homes | Owner, Manager, Cashier, Kitchen, Waiter routes and shared guard references | inspected at route/guard level; not browser integration-tested |
| Public ordering | public order, status and service-request route inventory | inventoried; handlers not fully reviewed |
| Orders/kitchen/waiter | `staff-orders`, role components and status endpoints found | partial review |
| Invoice/discounts | `staff-invoices` and discount migration located | partial review |
| Payments/refunds | payment routes and financial migrations located | partial review |
| Shift/handover | shift routes, financial shift lock, handover migrations located | partial review |
| Fixed float/main safe | `staff-float` reviewed for advisory locks/idempotency | reviewed at transaction-pattern level |
| Inventory | inventory engine/reservations/count/waste endpoints located | partial review |
| HR/payroll | HR API families and migration foundations located | partial review; production schema mismatch blocks validation |
| Printing | receipt preview component located | not behavior-tested |
| Notifications | bell polls `/api/staff/notifications` every 20 seconds | inspected at client call level |
| RLS policies | not exported in repository and not enumerated from production | uninspected |

There are 80 staff API route handlers referencing `getStaffSession` or
`requirePageAccess`; this is a useful baseline but not proof that every handler
has complete object-level authorization.

## Additional findings

### DB-002 — P1 — local migration naming/history cannot be assumed to map one-to-one to production (confirmed)

Affected: `prisma/migrations/*`, Supabase migration history.

Evidence: production migration versions/names differ from local directory
timestamps and include `stock_counts` and `manager_service_requests` entries
not represented by identically named local directories. A migration audit must
compare SQL checksums/schema state, not only names.

### PERF-001 — P2 — recurring client polling (confirmed)

Affected: `src/components/layout/notifications-bell.tsx:84`,
`src/components/waiter/waiter-board.tsx:55`,
`src/components/order/order-status-tracker.tsx:60`.

Evidence: notifications poll every 20 seconds and waiter/order tracking use
interval timers. Impact is workload-dependent and has not been profiled.
Recommendation: visibility-aware polling and server metrics before changing
intervals; do not cache cross-user operational data.

### PERF-002 — P2 — repeated server session resolution (confirmed code pattern; impact unmeasured)

Affected: `src/app/(app)/layout.tsx`, `src/lib/require-page-access.ts`, role
pages.

Evidence: the layout calls `getStaffSession()` and individual pages typically
call `requirePageAccess()`, which calls it again. Measure request/database
counts in production before deduplicating with request-scoped caching.

### QUALITY-001 — P2 — lint gate currently fails due warnings (confirmed)

Affected: `src/components/cashier/thermal-receipt-preview.tsx:105`,
`src/components/staff/employee-management-board.tsx:180`,
`src/components/staff/hr-reports-board.tsx:28`,
`src/components/staff/payroll-management-board.tsx:37`.

Evidence: `npm run lint` runs `eslint --max-warnings=0` and fails on one image
optimization warning and three missing React-hook dependencies. Next build
compiles but repeats these warnings.

### CONFIG-002 — P3 — Next ESLint integration warning (confirmed)

Evidence: `npm run build` reports that the Next.js plugin was not detected in
the ESLint configuration. Investigate the ESLint flat configuration before
changing lint behavior.

### SECURITY-001 — P2 — complete API object-authorization/RLS proof absent (not verified)

Affected: all `src/app/api/staff/**/route.ts` handlers and production RLS.

Evidence: route inventory is broad (80 session-gated handlers), but neither
all handler predicates nor production policy definitions were read in this
audit. This is not a confirmed vulnerability; it is a material audit gap.

## Validation update

- `npx prisma validate` — passed; warns `package.json#prisma` is deprecated.
- `npx prisma generate` — passed.
- `npm run typecheck` — passed in prior validation.
- `npm test` — passed, 166 tests, in prior validation.
- `npm run lint` — failed as designed on 4 warnings (QUALITY-001).
- `npm run build` — compilation and type checking completed successfully; it
  emitted the same lint warnings. No authenticated production E2E test ran.
- `git diff --check` — previously passed before this report; re-run before any
  future commit because the report itself is uncommitted.

## Security observations

- Role resolution uses server-side `public.users`/roles rather than editable
  Auth user metadata: correct pattern.
- Middleware validates identity without performing a database role lookup:
  appropriate for edge cost and separation of concerns.
- API coverage is broad; a complete IDOR/RLS audit remains unperformed.
- No secrets were inspected or exposed.

## Financial and operational review status

Route inventory contains payment, invoice, refund-adjacent, shift, fixed-float,
inventory, kitchen, waiter and HR/payroll handlers. Their transaction
boundaries, locks, idempotency and ledger semantics were not fully reviewed in
this pass. They must not be changed based on this report alone.

## Performance backlog (hypotheses until profiled)

1. Profile `getStaffSession()` and repeated layout/page session resolution on
   role-home requests.
2. Inspect list endpoints for pagination and N+1 Prisma includes, prioritizing
   POS, orders, kitchen and owner dashboard.
3. Inspect client polling (notifications, operational boards) for duplicate
   requests and visibility-aware throttling.
4. Use production query logs/EXPLAIN before adding indexes or caching.

## Safe cleanup candidates

| Item | Classification | Action |
|---|---|---|
| Legacy `/dashboard` route | currently being removed | verify build + deployed route behaviour first |
| `package.json#prisma` config | deprecated | planned isolated migration |
| Untracked `scripts/purge-*`, `preview-*`, `inspect-*` | uncertain | do not delete; review ownership and safety first |
| `.agents/`, `.codex/` | tooling metadata | do not commit unless explicitly intended |

## Validation performed

- `npx prisma validate` — passed, with Prisma config deprecation warning.
- Prior routing validation: TypeScript and offline tests passed before this
  audit; rerun complete build/lint after audit worktree changes settle.

## Ordered remediation plan

1. Deploy current auth fixes and execute one authenticated browser trace per
   canonical role while collecting request-id logs.
2. Resolve only confirmed production configuration/data mismatches.
3. Add integration tests that execute middleware + layout + role page redirect
   chains with bounded hops.
4. Complete payment/shift/inventory transaction audit before refactoring.
5. Complete production schema/RLS/index comparison read-only.
6. Address Prisma configuration deprecation in a separate PR.

## Uninspected or incomplete areas

Full dependency graph, all API authorization handlers, dynamic imports,
deployment configuration, Hostinger logs, production RLS policies, migration
history, query plans, bundle metrics, and full financial/HR workflow review
remain incomplete. This report must not be treated as a full sign-off.
