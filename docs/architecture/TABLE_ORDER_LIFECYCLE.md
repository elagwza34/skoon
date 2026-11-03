# Table Order Lifecycle

**Project:** Skoon (D:\Sokoon)
**Branch:** main
**Date:** 2026-11-03

## 1. Overview

This document describes the canonical lifecycle of a table order in Skoon, from table selection through final closure and table release. Both Cashier and Waiter share the same order through the table detail page workspace.

## 2. Table States

A table has exactly two operational states:

| State | Definition |
|-------|------------|
| **AVAILABLE** | No active/open order exists on the table |
| **OCCUPIED** | Exactly one active/open order exists on the table |

Table state is **derived** from order state. There is no manual status toggle on `CafeTable`.

### 2.1 Open Order Predicate

An order counts as "open" (occupying its table) when:

```typescript
status ∈ ['new', 'preparing', 'ready'] AND paymentStatus !== 'paid'
```

Orders with status `served` or `cancelled`, or with `paymentStatus === 'paid'`, do not occupy the table.

## 3. Order Status Transitions

```
┌─────────┐     ┌───────────┐     ┌───────┐     ┌────────┐
│   new   │────►│ preparing │────►│ ready │────►│ served │
└─────────┘     └───────────┘     └───────┘     └────────┘
      │               │               │
      │               │               └──────────┐
      │               └──────────────────────────┘
      │                      │
      ▼                      ▼
   ┌─────────┐          ┌─────────┐
   │cancelled│◄─────────│cancelled│
   └─────────┘          └─────────┘
      (terminal)          (terminal)
```

### Transition Rules

| From → To | Who | Preconditions | Effects |
|-----------|-----|---------------|---------|
| new → preparing | Kitchen | Order sent to kitchen | `acceptedAt` set; inventory reserved |
| new → cancelled | Cashier / responsible Waiter | `paymentStatus !== 'paid'` | Inventory reservations released; `cancelledAt` set |
| preparing → ready | Kitchen | All lines prepared | `preparedQuantity = quantity` for all lines; `readyAt` set |
| preparing → cancelled | Cashier / responsible Waiter | `paymentStatus !== 'paid'` | Prepared lines → waste; unprepared → release; `cancelledAt` set |
| ready → served | Waiter | All lines served | `servedQuantity = quantity` for all lines; inventory consumed; `servedAt` set |
| served → (terminal) | — | — | Order awaits payment; table remains OCCUPIED until paid |

### Table Release Points

| Event | Table State After |
|-------|-------------------|
| Order cancelled (new or preparing) | **AVAILABLE** |
| Order served + payment completed | **AVAILABLE** |
| Order paid but not served | **OCCUPIED** (awaiting service) |
| Order served but not paid | **OCCUPIED** (awaiting payment) |

## 4. Order Creation Flows

### 4.1 First Order on Available Table

1. Employee selects an AVAILABLE table
2. Table detail page opens in POS mode (product catalog)
3. Employee selects products, variants, modifiers, quantities
4. Employee confirms → `POST /api/staff/pos/orders` creates order with `status: 'new'`
5. Table becomes OCCUPIED

### 4.2 Adding Items to Existing Order (Occupied Table)

1. Employee selects an OCCUPIED table
2. Table detail page opens in Current Order mode
3. Employee clicks "Add Items", selects products
4. Employee confirms → `POST /api/staff/orders/[id]/items/append` appends items to existing order
5. Inventory reserved for new items; order totals recalculated
6. If order was `ready`, reverts to `preparing` (new items need kitchen work)
7. Kitchen notified

### 4.3 QR Order Flow

1. Customer scans QR → order created with `source: 'qr'`, `status: 'new'`
2. Waiter claims order → `responsibleWaiterId` set
3. Waiter approves → inventory reserved; `sentToKitchenAt` set; kitchen notified
4. If table has no open order: QR order becomes the table's order
5. If table already has an open order: QR items must be appended via `appendOrderItems` (not yet implemented at QR acceptance layer — manual merge required)

## 5. Item Lifecycle

```
┌─────────┐     ┌─────────────┐     ┌─────────┐
│  pending│────►│  preparing  │────►│  ready  │
└─────────┘     └─────────────┘     └─────────┘
                                                │
                                                ▼
                                              ┌─────────┐
                                              │ served  │
                                              └─────────┘
```

| Item State | Meaning | Can Modify? | Can Serve? |
|------------|---------|-------------|------------|
| pending | Not yet sent to kitchen | Yes (adjust/void) | No |
| preparing | Kitchen is working on it | Limited (adjust with waste) | No |
| ready | Kitchen completed | No | Yes (waiter serves) |
| served | Waiter delivered | No | No |
| voided | Removed from order | N/A | N/A |

### Inventory Rules

- **Reserve** at order dispatch (`sentToKitchenAt`)
- **Consume** when item served
- **Release** on cancel (before preparation)
- **Waste** on cancel (after preparation started)
- **Never restock** served items

## 6. Payment Flow

```
Order served → Cashier collects payment → Order marked paid → Table AVAILABLE
```

| Step | Actor | Endpoint | Effect |
|------|-------|----------|--------|
| Present bill | Cashier | `/api/staff/invoices` | Shows order total, remaining balance |
| Collect payment | Cashier | `/api/staff/orders/[id]/pay` | Creates Payment record; shifts `paymentStatus` |
| Refund | Cashier | `/api/staff/refunds` | Creates Refund record; reverses payment |

Payment is tracked separately from order status. An order can be `served` but `paymentStatus: 'unpaid'` (table still OCCUPIED).

## 7. Cancellation Flow

```
Waiter/Cashier requests cancel → Validate (not paid, own order or permission) → Lock order → Release/waste inventory → Update status → Audit log → Notify (waiter, manager, kitchen)
```

### Cancellation Guards

| Guard | Error |
|-------|-------|
| Order is `served` or `cancelled` | "Order status changed; refresh and retry" |
| `paymentStatus === 'paid'` | "A paid order must be refunded through the payment correction flow" |
| Waiter not responsible and no `orders.cancel` permission | "Order responsibility changed; refresh and retry" |

### Post-Cancellation

- Order remains in DB with `status: 'cancelled'`, `cancelledAt`, `cancelReason`
- Table becomes AVAILABLE
- Cancelled order appears in Cashier invoice history (cancelled tab)
- Cancelled order does NOT appear in active Waiter orders
- Kitchen notified to drop the order

## 8. Concurrency Protections

| Mechanism | Where | Purpose |
|-----------|-------|---------|
| `FOR UPDATE` row lock | `transitionOrderStatus`, `adjustOrderItem`, `voidOpenOrderItem` | Prevent concurrent status mutations on same order |
| `pg_advisory_xact_lock` | `appendOrderItems`, `adjustOrderItem`, table transfers | Serialize conflicting mutations |
| Idempotency keys | All mutation endpoints | Prevent duplicate processing on retry |
| Shift lock | `lockAndReadShift` | Ensure shift is open during financial operations |
| Application-level table occupancy check | `createPosOrder` | Prevent second order on occupied table |

## 9. Roles and Permissions

| Role | Can Create Order | Can Add Items | Can Cancel | Can Pay | Can Adjust Items | Can Serve |
|------|-----------------|---------------|------------|---------|-----------------|-----------|
| Cashier | Yes (dine_in) | Yes | Yes (unpaid) | Yes | Yes | Yes (takeaway only) |
| Waiter | Yes (own tables) | Yes (own orders) | Yes (own orders, unpaid) | No | Yes (own orders) | Yes |
| Kitchen | No | No | No | No | No | No (prepares only) |
| Manager | No | No | Yes (with permission) | No | No | No |
| Owner | No | No | No | No | No | No |

## 10. Files Involved

| File | Role |
|------|------|
| `prisma/schema.prisma` | Data model (Order, OrderItem, CafeTable, Payment, etc.) |
| `src/lib/staff-orders.ts` | Order status transitions, cancellation, append items |
| `src/lib/staff-waiter.ts` | Waiter workspace, `isWaiterTableOrderActive` predicate |
| `src/lib/staff-pos-write.ts` | POS order creation, table occupancy check |
| `src/lib/staff-order-item-adjustment.ts` | Item quantity/variant adjustment |
| `src/lib/staff-order-item-void.ts` | Item voiding |
| `src/lib/staff-inventory-engine.ts` | Inventory reserve/consume/release/waste |
| `src/lib/staff-payments-write.ts` | Payment collection |
| `src/lib/staff-shifts.ts` | Shift management |
| `src/components/waiter/waiter-table-workspace.tsx` | Shared table workspace UI |
| `src/components/cashier/tables-sidebar.tsx` | Cashier table list with occupancy |
| `src/components/pos/pos-checkout.tsx` | Product catalog + cart |
