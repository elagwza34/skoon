# Skoon Manual Testing Guide

## Safety legend

* **SAFE TO VIEW**: opens or reads data only.
* **ISOLATED TEST DATA**: creates or changes records; use a dedicated branch,
  table, products, and test accounts with a `SKOON-E2E-YYYYMMDD` marker.
* **DO NOT EXECUTE YET**: financial/shared-inventory actions until a fresh,
  fully restorable Supabase-compatible backup is verified.

Current recovery evidence does **not** permit production writes. Do not use
real customer, inventory, or cash records for exploration.

## 1. Owner walkthrough

1. **SAFE TO VIEW**: sign in at `/login`; expected landing is `/dashboard` and
   no shift prompt. Open `/dashboard`, `/orders`, `/tables`, `/products`,
   `/inventory`, `/staff`, `/reports`, `/settings`, `/fixed-float` and
   `/customers`. Expect permission-filtered navigation and read-only data to
   match the selected branch/cross-branch owner scope.
2. **SAFE TO VIEW**: open `/tables/print`; verify QR URLs use
   `https://sokooncafe.com`, not localhost. Printing itself is browser-local.
3. **ISOLATED TEST DATA**: create a dedicated product/category/table only after
   recovery safeguards are satisfied. Confirm it appears in catalog and table
   UI, then preserve its IDs in a test manifest.
4. **DO NOT EXECUTE YET**: settings edits, staff provisioning, float baseline,
   ledger reversals, refunds, or employee archive actions.

## 2. Manager walkthrough

1. **SAFE TO VIEW**: sign in; expected landing `/dashboard`, with no mandatory
   operational shift. Review operations center, service-request panel, reports,
   inventory, staff directory, and settings according to granted permissions.
2. **SAFE TO VIEW**: try a forbidden URL such as `/cashier` without relevant
   permission; expected server redirect to the manager home route, not data
   exposure.
3. **ISOLATED TEST DATA**: claim/resolve a dedicated service request. Expected:
   branch-scoped assignment, audit record, and second claimant rejection.

## 3. HR and staff

* **SAFE TO VIEW**: `/staff` as owner/authorized manager. Check active staff,
  role, branch, schedule data, and status without editing.
* **ISOLATED TEST DATA**: test employee lifecycle, schedules, contracts, or
  compensation only with a designated test employee. Record ID and branch.
* **DO NOT EXECUTE YET**: password resets, archive/reactivation, payroll-like
  changes, leave decisions, or attendance corrections on real employees.

## 4. Inventory and catalog

1. **SAFE TO VIEW**: `/products` and `/inventory`; inspect products, batches,
   movements, stock counts, waste/accountability, and branch scope.
2. **ISOLATED TEST DATA**: add a dedicated low-value test item/product and a
   dedicated test table. Test stock movement, count draft, and visibility.
   Expected: server validation and branch isolation.
3. **DO NOT EXECUTE YET**: posting counts, waste, accountability waiver,
   reservation/consumption, or any adjustment against shared production stock.

## 5. Cashier, shift, POS, invoice and payment

1. **SAFE TO VIEW**: cashier opens `/cashier`; without active shift, expect
   operational lock/open-shift workflow. Owner/Manager should not be forced to
   `/shifts` merely because no shift exists.
2. **ISOLATED TEST DATA**: with a designated cashier, dedicated branch/table
   and products, open one shift at `/shifts` or cashier workflow. Record shift
   ID and `openedAt`; refresh and re-login to confirm it persists.
3. Create a POS order at `/pos`; verify server-calculated totals, branch/table,
   kitchen/waiter visibility, and idempotency behavior using a single test key.
4. **DO NOT EXECUTE YET**: payment settlement, refund, shift close, handover,
   cash withdrawal, fixed-float actions, advances, returns, and reversals.

## 6. Public QR customer flow

1. **SAFE TO VIEW**: `/`, `/order-type`, `/select-table`, and a valid existing
   `/menu/[token]`; invalid tokens should return 404. Do not submit a cart.
2. **ISOLATED TEST DATA**: use only a dedicated test table token; choose dine-in,
   add dedicated products, submit once, and record order ID/order number.
3. Verify `/order/[id]?n=[orderNumber]` displays only that tracking record.
   Expected: no access to another order without its number.

## 7. Waiter and kitchen workflow

1. **SAFE TO VIEW**: waiter `/waiter` and kitchen `/kitchen`; without active
   operational shift expect a shift requirement rather than silent access.
2. **ISOLATED TEST DATA**: from a dedicated order, verify QR approval or manual
   dispatch, kitchen start, per-item ready, waiter serve item/serve all, and
   final status. Refresh each station to observe authoritative state.
3. Use two designated waiters only to test claim/handover conflicts. Expected:
   second claim is rejected and cross-branch access is denied.

## 8. Reports, customers, settings, and notifications

* **SAFE TO VIEW**: `/reports`, `/customers`, notifications bell, `/settings`.
  Change report day filters only. Customer data is derived from order history.
* **DO NOT EXECUTE YET**: settings save, mark notifications read if audit/state
  impact matters, or fixed-float baseline/settlement/reversal.

## HTTP and redirect checks

* Open a protected page signed out: expect `/login` redirect.
* Call a staff API signed out after pending middleware is deployed: expect JSON
  `401`, not HTML login redirect.
* Test insufficient permission with a designated role: expect `403` or safe
  page redirect; never data leakage.
* Test missing operational shift through a safe dedicated account: expect `409`
  from the service-level API or the shift-opening UI.

## Recommended exploration order

1. Owner read-only dashboard/navigation
2. Manager read-only dashboard and reports
3. Staff/HR view
4. Catalog and inventory view
5. Cashier shift UI view
6. POS view
7. Public QR view without submit
8. Waiter and kitchen views
9. Invoice/payment views
10. Fixed float/settings/reports views

Only proceed to isolated-data workflows after a fresh backup is verified in a
Supabase-compatible recovery environment. Keep a manifest containing test
account, branch, table, product, order, shift, and financial-operation IDs.
