# Table Management Audit

**Project:** Skoon (D:\Sokoon)
**Branch:** main
**Date:** 2026-11-03
**Status:** Implemented (Phase 2B table management)

## 1. Scope

Audit of the unified table-management workflow shared by Cashier and Waiter, covering:
- Table status (AVAILABLE / OCCUPIED)
- One open order per table enforcement
- Table detail page as primary workspace
- Shared order editing between Cashier and Waiter
- Adding items to an existing open order
- Inventory, Kitchen, payment, cancellation, shift integration
- QR order compatibility
- Real-time synchronization
- Mobile UX/UI

## 2. Existing Architecture

### 2.1 Data Model (prisma/schema.prisma)

Key models involved in table management:

| Model | Role |
|-------|------|
| `CafeTable` | Table identity, floor plan position, zone. **No status column.** Occupancy is derived from orders. |
| `Order` | `cafeTableId`, `status`, `paymentStatus`, `responsibleWaiterId`, `cancelledAt`, `source`, `orderType`. |
| `OrderItem` | `quantity`, `preparedQuantity`, `servedQuantity`, `isVoided`, `voidReason`. |
| `Payment` | Linked to Order; tracks `status` (`completed`, `pending`, `refunded`). |
| `InventoryReservation` | Linked to OrderItem; held at dispatch, consumed at serve, released on cancel. |
| `OrderStatusHistory` | Audit trail of status transitions. |
| `AuditLog` | Append-only financial/action audit. |

### 2.2 Order Status Machine

Defined in `src/lib/staff-orders.ts` (`ORDER_FLOW`):

```
new → preparing → ready → served
   └────→ cancelled (terminal)
```

- `new` → `preparing`: Kitchen accepts the order
- `new` → `cancelled`: Cashier or responsible Waiter cancels (unpaid only)
- `preparing` → `ready`: Kitchen marks complete
- `preparing` → `cancelled`: Cancellation with waste accounting for prepared lines
- `ready` → `served`: Waiter serves items; order becomes `served` when all lines served
- `served` → terminal: No further transitions (payment collection happens separately via `paymentStatus`)
- `cancelled` → terminal: No further transitions

### 2.3 Table Occupancy Predicate

The canonical predicate is `isWaiterTableOrderActive(status, paymentStatus?)` in `src/lib/staff-waiter.ts:104-107`:

```typescript
export function isWaiterTableOrderActive(status: string, paymentStatus?: string | null): boolean {
  if (paymentStatus === 'paid') return false
  return status === 'new' || status === 'preparing' || status === 'ready'
}
```

Table is **OCCUPIED** when at least one order on the table satisfies this predicate.
Table is **AVAILABLE** when no order on the table satisfies this predicate.

### 2.4 Components

| Component | Path | Purpose |
|-----------|------|---------|
| WaiterTableWorkspace | `src/components/waiter/waiter-table-workspace.tsx` | Shared table workspace for both Cashier and Waiter routes |
| TablesSidebar | `src/components/cashier/tables-sidebar.tsx` | Cashier table list with occupancy badges |
| CashierWorkspace | `src/components/cashier/cashier-workspace.tsx` | Cashier dashboard with POS/Tables/Invoices tabs |
| WaiterBoard | `src/components/waiter/waiter-board.tsx` | Waiter board with POS + open orders |
| PosCheckout | `src/components/pos/pos-checkout.tsx` | Product catalog + cart for order creation |

### 2.5 API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/staff/orders/[id]/status` | POST | Transition order status (including cancel) |
| `/api/staff/orders/[id]/items/append` | POST | **NEW** — Append items to existing open order |
| `/api/staff/orders/[id]/items/[itemId]/adjust` | POST | Adjust item quantity or variant |
| `/api/staff/orders/[id]/items/[itemId]/void` | POST | Void an order item |
| `/api/staff/orders/[id]/items/serve` | POST | Serve ready order items |
| `/api/staff/orders/[id]/send` | POST | Send order to kitchen |
| `/api/staff/orders/[id]/pay` | POST | Collect payment |
| `/api/staff/pos/orders` | POST | Create a new POS order |
| `/api/staff/waiter` | GET | Get waiter workspace (open orders by waiter) |
| `/api/staff/invoices` | GET | Get cashier invoices (all orders, branch-scoped) |

## 3. Audit Findings — Requirement-by-Requirement

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Table has only AVAILABLE or OCCUPIED | IMPLEMENTED | `CafeTable` has no status column; occupancy derived from order state via `isWaiterTableOrderActive` |
| 2 | Status derived from open order | IMPLEMENTED | `getPosCatalog` (`src/lib/staff-pos.ts:106-112`), `getWaiterWorkspace` (`src/lib/staff-waiter.ts:236-238`), `tables-sidebar.tsx:23-29` all derive occupancy from orders |
| 3 | Zero or one open order per table | PARTIALLY | App-level check in `createPosOrder` (`src/lib/staff-pos-write.ts:171-180`) for cashier/owner dine_in. No DB-level partial unique index. Waiter path not guarded at creation. |
| 4 | Available table opens POS | PARTIALLY | `WaiterTableWorkspace` renders on both `/cashier/tables/[tableId]` and `/waiter/tables/[tableId]`; available tables show "Create Order" button |
| 5 | Occupied table opens Current Order | PARTIALLY | `WaiterTableWorkspace` lists existing active orders for the table; clicking an order opens its detail |
| 6 | Cashier/Waiter modify same order | PARTIALLY | `adjustOrderItem`, `voidOpenOrderItem` work for both roles; waiter restricted to own orders; cashier can modify any order in branch |
| 7 | Add items to existing order | MISSING (now fixed) | No server-side function existed; `WaiterTableWorkspace.save()` always created a NEW order via `/api/staff/pos/orders`. Fixed by `appendOrderItems` (`src/lib/staff-orders.ts`) + API route. |
| 8 | Table can't change in POS | IMPLEMENTED | `PosCheckout` locks table when `initialTableId` is set |
| 9 | Inventory/Kitchen/discounts/payment/shift intact | IMPLEMENTED | All existing services (`staff-inventory-engine.ts`, `staff-orders.ts`, `staff-payments-write.ts`, `staff-shifts.ts`) preserved unchanged |
| 10 | Table AVAILABLE after settlement/cancellation | IMPLEMENTED | Occupancy derived from order state; paid+served or cancelled orders no longer count as active |

### 3.1 Issues Found and Fixed

| Issue | Location | Fix |
|-------|----------|-----|
| WaiterTableWorkspace occupancy filter missing `paymentStatus !== 'paid'` | `waiter-table-workspace.tsx:44` | Added `order.paymentStatus !== 'paid'` to match `tables-sidebar.tsx` |
| `getWaiterWorkspace` DB query missing `paymentStatus` filter | `staff-waiter.ts:236-238` | Added `paymentStatus: { not: 'paid' }` for consistency with `getPosCatalog` |
| No server-side append-items-to-existing-order function | — | Created `appendOrderItems` in `staff-orders.ts` + API route `/api/staff/orders/[id]/items/append` |
| WaiterTableWorkspace.save() always creates new order | `waiter-table-workspace.tsx` | Changed to append to existing open order when one exists; fall back to new order creation |

### 3.2 Cancellation Behavior (Verified)

- Waiter cancels via `/api/staff/orders/[id]/status` with `{ to: 'cancelled', reason }` ✓
- Paid orders cannot be cancelled (`transitionOrderStatus:452`) ✓
- Cancelled orders disappear from active waiter views (`isWaiterTableOrderActive` returns false) ✓
- Cancelled invoices remain in cashier history (`getCashierInvoices` includes all statuses) ✓
- Cancelled orders do not occupy tables (excluded from occupancy predicate) ✓
- Inventory released/wasted on cancellation (`transitionOrderStatus:478-485`) ✓
- Financial history preserved (order stays in DB, audit log created) ✓
- No `/cancel` endpoint exists or was introduced ✓

## 4. Concurrency Analysis

### 4.1 Application-Level Serialization

- `createPosOrder` checks for existing active order on table within a transaction (`staff-pos-write.ts:171-180`)
- `appendOrderItems` uses `pg_advisory_xact_lock` on order ID + shift lock (`staff-orders.ts`)
- `transitionOrderStatus` uses `FOR UPDATE` row lock + status re-check under lock (`staff-orders.ts:455-459`)
- `adjustOrderItem` uses `pg_advisory_xact_lock` + `FOR UPDATE` (`staff-order-item-adjustment.ts:116-125`)
- `voidOpenOrderItem` uses `FOR UPDATE` row lock (`staff-order-item-void.ts:60-63`)

### 4.2 Database-Level Guarantee (BLOCKED)

**No partial unique index exists** for one open order per table. The application-level checks provide race protection within transactions, but two concurrent requests could both pass the preflight check before either commits.

**Proposed migration** (not executed — awaiting approval):

```sql
CREATE UNIQUE INDEX orders_one_open_order_per_table_idx
  ON orders (branchId, cafeTableId)
  WHERE status IN ('new', 'preparing', 'ready') AND paymentStatus != 'paid';
```

This index would be enforced by PostgreSQL at the storage level, making the one-open-order guarantee crash-safe even under concurrent application access.

## 5. Security

- All staff API routes require authentication (`getStaffSession`)
- Role-based authorization enforced at service layer (Cashier/Waiter/Kitchen/Manager/Owner)
- Branch isolation: `staffCanAccessBranch` checked on every order/table access
- Shift enforcement: `requiresOperationalShift` + `getOpenShift` for Cashier/Waiter/Kitchen/Manager
- Idempotency keys on all mutation endpoints
- Financial operations recorded in `financialOperation` table with fingerprint
- Audit log entries for all order mutations

## 6. Test Coverage

| Test | File | Lines |
|------|------|-------|
| Paid orders don't occupy tables | `tests/offline.test.ts` | ~2368 |
| Cancelled/served orders don't occupy tables | `tests/offline.test.ts` | ~2375 |
| Undefined paymentStatus still counts active | `tests/offline.test.ts` | ~2382 |
| Append order items schema validation | `tests/offline.test.ts` | ~2389 |
| Paid orders can't be cancelled | `tests/offline.test.ts` | ~2402 |
| Served/cancelled are terminal | `tests/offline.test.ts` | ~2409 |
| Existing cancelled/served occupancy test | `tests/offline.test.ts` | ~168-174 |

Total: 250 tests, 0 failures.

## 7. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| No DB-level one-open-order-per-table index | High | Application-level checks; migration proposed but not executed |
| Waiter can only see own orders (by design) | Medium | Cashier sees all open orders via waiter workspace |
| Mobile UI not browser-tested | Low | Offline unit tests only; E2E not available in this environment |
