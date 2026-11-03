# Table Management Implementation

**Project:** Skoon (D:\Sokoon)
**Branch:** main
**Date:** 2026-11-03

## 1. Summary of Changes

This document records the implementation of the unified table-management workflow. Changes are limited to fixing gaps in the existing architecture — no existing functionality was removed or replaced.

### Files Changed

| File | Change | Reason |
|------|--------|--------|
| `src/lib/staff-orders.ts` | Added `createHash` import, `lockAndReadShift` import, `appendOrderItemsSchema`, `appendOrderItems` function | Server-side append-items-to-existing-order with inventory, totals, idempotency |
| `src/app/api/staff/orders/[id]/items/append/route.ts` | New API route | Exposes `appendOrderItems` to clients |
| `src/lib/staff-waiter.ts` | Added `paymentStatus: { not: 'paid' }` to `getWaiterWorkspace` DB query | Consistency with `getPosCatalog` and `isWaiterTableOrderActive` |
| `src/components/waiter/waiter-table-workspace.tsx` | Added `paymentStatus !== 'paid'` to occupancy filter; changed `save()` to append to existing order | Consistent table occupancy; prevent second open order per table |
| `tests/offline.test.ts` | Added 6 regression tests + `appendOrderItemsSchema` import | Test coverage for table management |

### Files Created

| File | Purpose |
|------|---------|
| `src/app/api/staff/orders/[id]/items/append/route.ts` | Append items to existing order API |
| `docs/audits/TABLE_MANAGEMENT_AUDIT.md` | Audit findings |
| `docs/architecture/TABLE_ORDER_LIFECYCLE.md` | Architecture document |
| `docs/audits/TABLE_MANAGEMENT_IMPLEMENTATION.md` | This document |

## 2. Key Implementation Details

### 2.1 `isWaiterTableOrderActive` Predicate

**Location:** `src/lib/staff-waiter.ts:104-107`

```typescript
export function isWaiterTableOrderActive(status: string, paymentStatus?: string | null): boolean {
  if (paymentStatus === 'paid') return false
  return status === 'new' || status === 'preparing' || status === 'ready'
}
```

Used by:
- `getWaiterWorkspace` (DB query + JS filter)
- `getPosCatalog` (DB query)
- `tables-sidebar.tsx` (JS filter)
- `waiter-table-workspace.tsx` (JS filter — fixed)

### 2.2 `appendOrderItems` Function

**Location:** `src/lib/staff-orders.ts`

Server-side function that appends items to an existing open order:

1. **Authorization:** Cashier or Waiter; Waiter must be responsible for the order
2. **Validation:** Order must exist, be in branch scope, have status `new`/`preparing`/`ready`, and `paymentStatus !== 'paid'`
3. **Shift check:** Open shift required for Cashier/Waiter
4. **Idempotency:** Optional idempotency key with fingerprint check via `financialOperation` table
5. **Locking:** `pg_advisory_xact_lock` on order ID + shift lock
6. **Inventory:** `reserveOrderItemInventory` for each new item
7. **Status revert:** If order was `ready`, reverts to `preparing` (new items need kitchen work)
8. **Totals:** Recalculated via `recalculateOpenOrderInvoice`
9. **Notifications:** Kitchen notified of new items
10. **Audit:** Audit log entry created

### 2.3 WaiterTableWorkspace.save() Fix

**Location:** `src/components/waiter/waiter-table-workspace.tsx`

Before: `save()` always created a NEW order via `POST /api/staff/pos/orders` when pending items existed, even if an order was already open on the table.

After: `save()` determines the target order:
1. `editableOrder` (if exists — the order being edited)
2. `orders[0]` (first active order on the table)
3. Falls back to creating a new order via POS API only if no order exists

If a target order exists, pending items are appended via `POST /api/staff/orders/[id]/items/append`.

## 3. Concurrency Guarantees

### 3.1 Application-Level

| Operation | Lock Strategy | Location |
|-----------|--------------|----------|
| Create order | Table occupancy check in transaction | `staff-pos-write.ts:171-180` |
| Transition status | `FOR UPDATE` + status re-check | `staff-orders.ts:455-459` |
| Append items | `pg_advisory_xact_lock` + shift lock | `staff-orders.ts` |
| Adjust item | `pg_advisory_xact_lock` + `FOR UPDATE` | `staff-order-item-adjustment.ts:116-125` |
| Void item | `FOR UPDATE` | `staff-order-item-void.ts:60-63` |
| Table transfer | `pg_advisory_xact_lock` on destination table | `staff-waiter-operations.ts:147` |

### 3.2 Database-Level (NOT IMPLEMENTED)

No partial unique index exists for one open order per table. Proposed migration:

```sql
CREATE UNIQUE INDEX orders_one_open_order_per_table_idx
  ON orders (branchId, cafeTableId)
  WHERE status IN ('new', 'preparing', 'ready') AND paymentStatus != 'paid';
```

**Status:** Not executed — requires migration approval per project safety constraints.

## 4. Requirement Verification

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Table: AVAILABLE or OCCUPIED only | IMPLEMENTED | No status column on `CafeTable`; derived from orders |
| 2 | Status derived from open order | IMPLEMENTED | `isWaiterTableOrderActive` used consistently |
| 3 | Zero or one open order per table | PARTIALLY | App-level checks; no DB-level index |
| 4 | Available table opens POS | IMPLEMENTED | `WaiterTableWorkspace` on table detail pages |
| 5 | Occupied table opens Current Order | IMPLEMENTED | `WaiterTableWorkspace` lists existing orders |
| 6 | Cashier/Waiter modify same order | IMPLEMENTED | Shared `adjustOrderItem`, `voidOpenOrderItem`, `appendOrderItems` |
| 7 | Add items to existing order | IMPLEMENTED | `appendOrderItems` + API route; `WaiterTableWorkspace.save()` fix |
| 8 | Table can't change in POS | IMPLEMENTED | `PosCheckout` locks table |
| 9 | Inventory/Kitchen/discounts/payment/shift intact | IMPLEMENTED | All existing services preserved |
| 10 | Table AVAILABLE after settlement/cancellation | IMPLEMENTED | Derived from order state |

## 5. Test Results

| Check | Result |
|-------|--------|
| Offline tests (250 total) | 250 passed, 0 failed |
| TypeScript typecheck | Passed |
| ESLint | Passed |
| Next.js production build | Passed |
| `git diff --check` | Passed (only CRLF warnings) |

### New Tests Added (6)

| Test | What It Verifies |
|------|-----------------|
| table occupancy: paid orders do not occupy tables | `isWaiterTableOrderActive` with `paymentStatus='paid'` |
| table occupancy: cancelled and served orders do not occupy tables | Terminal orders don't occupy tables |
| table occupancy: undefined paymentStatus still counts active orders | Null/undefined payment status handling |
| table management: append order items schema validates input | Schema validation edge cases |
| table management: paid orders cannot be cancelled via status transition | `canTransitionOrder` guards |
| table management: served and cancelled are terminal — table released | Terminal status has no outgoing transitions |

## 6. Remaining Risks and Blockers

| Item | Severity | Description |
|------|----------|-------------|
| DB-level one-open-order-per-table index | High | No partial unique index; race condition possible under extreme concurrency. Migration proposed but not executed. |
| Waiter sees only own orders | Medium | By design; waiters manage their assigned tables. Cashier sees all open orders. |
| QR order merge with existing order | Medium | QR approval doesn't automatically append to existing open order on the same table. Manual merge via `appendOrderItems` needed. |
| Mobile E2E testing | Low | No browser automation available in this environment. |

## 7. Git Status

Working tree: Clean (all changes staged but not committed — per safety constraints, no commit was made).

Files modified:
- `src/lib/staff-orders.ts`
- `src/lib/staff-waiter.ts`
- `src/components/waiter/waiter-table-workspace.tsx`
- `tests/offline.test.ts`

Files created:
- `src/app/api/staff/orders/[id]/items/append/route.ts`
- `docs/audits/TABLE_MANAGEMENT_AUDIT.md`
- `docs/architecture/TABLE_ORDER_LIFECYCLE.md`
- `docs/audits/TABLE_MANAGEMENT_IMPLEMENTATION.md`
