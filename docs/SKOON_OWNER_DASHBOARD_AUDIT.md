# Owner Administration Workspace

## Implemented navigation

The Owner sidebar is now grouped around implemented, server-authorized routes:

| Group | Routes |
| --- | --- |
| Overview | `/dashboard` |
| Sales and operations | `/orders`, `/cashier`, `/pos`, `/tables`, `/tables/print`, `/kitchen`, `/waiter` |
| Inventory and catalog | `/products`, `/inventory` |
| People and HR | `/staff`, `/staff/leave`, `/staff/attendance-corrections`, `/shifts`, `/customers` |
| Financial administration | `/reports`, `/fixed-float`, `/fixed-float/baseline`, `/fixed-float/settlements` |
| Administration | `/settings` |

Every entry above corresponds to an existing App Router page. The layout still
uses `canSeeRoute` for non-Owner links and each page performs its own trusted,
server-side `requirePageAccess` check. `/staff/attendance-corrections` is an
explicit Owner-only route because approving a correction can affect payroll
inputs; it is hidden from other roles and direct navigation redirects safely.

## UI delivered in this change

* Added the previously absent Owner sidebar links for the Cashier workspace,
  Fixed Float baseline, and advance settlements.
* Added a Leave Requests review page at `/staff/leave`. It shows the existing
  branch-scoped request data, decision status, reviewer, dates, reason, and
  owner/manager approval or rejection controls. Decisions still use the
  existing audited server transaction.
* Added an Owner-only Attendance Corrections page at
  `/staff/attendance-corrections`. It compares the original shift timestamps
  with requested timestamps and makes the existing audited approval/rejection
  action discoverable.
* Added the missing read endpoint for the existing attendance-correction
  contract. It returns only a JSON-safe representation and applies the same
  Owner-only approval authority as the decision action.
* Corrected the existing Leave GET response to serialize database bigint and
  date values safely; it does not change the query scope or any leave rule.

## Existing pages reused

`/dashboard` already provides live, server-side order/revenue KPIs, sales
trend, order status distribution, tables, top products, service-request
operations, and real quick links. It deliberately distinguishes order value
from collected payments. `/staff` already provides employee directory,
provisioning, lifecycle controls, and schedule management. `/inventory`,
`/orders`, `/cashier`, `/pos`, `/shifts`, `/reports`, and fixed-float pages
remain their authoritative administration surfaces; no duplicate ledger or
inventory mutations were introduced.

## Deliberately not added

There is no confirmed standalone backend/page contract for a full audit-log
browser, refund-review queue, reservation/consumption history page, separate
open/paid-invoice management page, or dedicated notification center. Links for
those conceptual features were not created: a navigation item must lead to a
real, authorized interface. Financial movements, refunds, and inventory
reservation/consumption remain governed by their existing workflows and are
not made manually editable.

Attendance-correction approval records an authorized decision and audit event;
the established service does not automatically rewrite the referenced shift.
That distinction is surfaced in the UI so it cannot be mistaken for a payroll
adjustment engine.

## Security and data boundaries

* Owner retains the existing all-branch authority; managers retain their
  branch-scoped leave visibility.
* Attendance correction review/approval is Owner-only both in UI and the
  shared route guard.
* Leave and attendance decision actions call the existing authenticated API;
  browser state is not trusted for authorization.
* No financial calculation, payment/refund control, inventory mutation,
  authentication control, RLS policy, database schema, or migration changed.

## Validation

Run after this implementation:

* `npx.cmd prisma validate` — passed.
* `npm.cmd run typecheck` — passed.
* `npm.cmd run lint` — passed.
* `npm.cmd test` — passed: 107/107 offline tests.
* `git diff --check` — passed.
* `npm.cmd run build` — passed with exit code `0` when run through the approved
  Windows execution context. The sandboxed run still demonstrates a local
  `.next\\cache\\eslint` `EPERM`, which is a workspace/sandbox cache-lock issue,
  not a production-build failure.

No production database write, migration, deployment, commit, or push was made.

## Local preview

Use a non-production environment with valid Supabase configuration and a
non-production database only:

```powershell
cd D:\Sokoon
npm.cmd run dev
```

Open `http://localhost:3000/login`, authenticate as an Owner account available
in that safe environment, then open `/dashboard`. The current local `.env`
contains a live external Supabase target and service-role configuration, while
the staging file does not contain parseable connection URLs; no local server was
started with that unsafe configuration. Do not point a local preview with active
mutation controls at production credentials. Production deployment parity is
not verified, and the backup evidence remains **ARCHIVE VALID, RESTORE NOT
VERIFIED** for both public application recovery and full Supabase platform
recovery; see `BACKUP_RECOVERY_VALIDATION.md`.
