# TABLE_WORKFLOW_ARCHITECTURE.md — SOKOON Table-Centric Workflow Architecture

**Project:** SKOON  
**Phase:** Table-Centric POS & Real-Time Order Management  
**Status:** Draft — architecture decisions

---

## 1. Unified Table Workspace Architecture

### 1.1 Component Structure

```
WaiterTableWorkspace (shared component)
├── LandingNav (fixed top, RTL)
├── LandingHero (cinematic gradient)
├── TabBar (order | pos)
│   └── tab: 'order' | 'pos'
├── OrderTab (when tab === 'order')
│   ├── Header (table number, status, totals)
│   ├── Items list (each with status badge, qty edit, void)
│   ├── Kitchen progress section
│   ├── Order history section
│   ├── Invoice summary section
│   └── Reassign responsibility section (manager only)
├── PosTab (when tab === 'pos')
│   ├── Product search + category filter
│   ├── Product grid (with variant + modifier selection)
│   ├── Pending cart (lines with remove)
│   └── Confirm/save action (auto-dispatch to kitchen)
└── AddItemsPanel (slide-over or inline)
    ├── Product search
    ├── Category filter
    ├── Product grid
    ├── Variant + modifier selection
    ├── Qty + kitchen note
    └── Confirm action (append to existing or create new)
```

### 1.2 Role-Based Access

| Role | Tab Access | Permissions |
|------|-----------|-------------|
| Waiter | order + pos | Full: create, add, edit, void, send-to-kitchen |
| Cashier | order (read-only) | Read-only: inspect order, items, totals, payment status |
| Manager | order + pos + reassign | Full + reassign responsibility |
| Owner | order + pos (cross-branch) | Full + cross-branch visibility |
| Kitchen | N/A | Sees dispatched orders only |

### 1.3 Table Context Immutability

- `tableId` is set at order creation and **cannot be changed** from inside the POS workspace.
- Table occupancy is derived from active orders (`staff-tables.ts`).
- A table remains occupied until: (a) invoice fully settled + order closed; or (b) unpaid order validly cancelled.
- Server-side validation: `staffCanAccessBranch` + `branchScope` in all Prisma queries.

---

## 2. Order Identity & Automatic Kitchen Dispatch

### 2.1 Order Creation Flow

1. Waiter/Cashier adds items to pending cart (POS tab).
2. Click "تأكيد الطلب وتوزيعه على المطبخ تلقائياً" → `POST /api/staff/pos/orders`.
3. Server creates order with `status='new'`, `source='dine_in'`, `paymentStatus='unpaid'`.
4. Server automatically sends to kitchen via `POST /api/staff/orders/[id]/send` (reserves inventory, sets `sentToKitchenAt`).
5. No separate manual "Send to Kitchen" action required for new orders.

### 2.2 Append to Existing Order

1. If table already has active order, items are appended via `POST /api/staff/orders/[id]/items/append`.
2. Order ID is preserved; existing kitchen states and payments are untouched.
3. Only newly added items are dispatched to kitchen (if order was already sent).
4. If order was `ready`, it reverts to `preparing` so kitchen sees new work.

### 2.3 Idempotency

- All public and staff writes use `idempotency-key` header.
- `financialOperation` table stores fingerprint + result for replay-safe retries.
- `POST /api/staff/orders/[id]/items/append` is idempotent per key.

---

## 3. Order Item Lifecycle

```
DISPATCHED (new) → PREPARING → READY → SERVED
                                      ↳ CANCELLED (before READY)
```

| Transition | Role | Condition | Inventory |
|------------|------|-----------|-----------|
| new → preparing | KITCHEN | Dispatch required | None (acceptance only) |
| preparing → ready | KITCHEN | All lines prepared | None |
| ready → served | WAITER | All lines served | Consume reservation → consumption |
| new/preparing → cancelled | WAITER/CASHIER | Before READY | Release reservation or record waste |

### 3.1 Item-Level States

Each item retains its own lifecycle state within the same order:
- Product A: READY
- Product B: PREPARING
- Product C: DISPATCHED
- Product D: newly added

---

## 4. Optimistic Concurrency Control (OCC)

### 4.1 Existing Protection

- `editWaiterOrder`: uses `expectedUpdatedAt` in Zod schema + `FOR UPDATE` row lock.
- `appendOrderItems`: uses `FOR UPDATE` row lock on orders table + `pg_advisory_xact_lock`.
- `serveOrderItems`: uses `FOR UPDATE` row lock + `idempotencyKey`.
- `transitionOrderStatus`: uses `FOR UPDATE` row lock + `expectedUpdatedAt` check.

### 4.2 Gap

OCC is not uniformly applied across all write paths. The `waiterOrderEditSchema` includes `expectedUpdatedAt`, but `appendOrderItems` and `transitionOrderStatus` rely on row locks only. **Recommendation:** Add `expectedUpdatedAt` to all write schemas for client-side conflict detection.

---

## 5. Real-Time Synchronization

### 5.1 Existing Infrastructure

- `notifications.ts`: role-based, branch-scoped notifications via `notifyRole`.
- `emitStatusNotifications` in `staff-orders.ts`: atomic notification within transaction.
- Socket.io / Supabase Realtime: audit needed to confirm which is used.

### 5.2 Required Sync

| Event | From → To | Trigger |
|-------|-----------|---------|
| Order created/appended | Waiter → Cashier | `order.items_append` |
| Kitchen dispatch | Waiter → Kitchen | `order.sent_to_kitchen` |
| Item ready | Kitchen → Waiter | `order.ready` (audio + UI) |
| Order served | Waiter → Cashier | `order.awaiting_payment` |
| Order cancelled | Waiter → Manager + Kitchen | `order.cancelled` |
| Table occupancy change | All authorized boards | `table.occupancy` |

### 5.3 Audio Notification

- Ready items trigger audio alert (`/audio/ready-alert.mp3`) for responsible waiter.
- `readyAlertPlayed` state prevents duplicate audio alerts per item.
- Browser audio playback restrictions handled with try/catch.

---

## 6. Waiter Reassignment (Phase 5b — Blocked)

### 6.1 Requirement

When responsible waiter's shift ends while order remains active:
- Find another eligible waiter (same branch, active shift, not inactive).
- Preserve original creator attribution.
- Record reassignment history in `orderResponsibilityHistory`.
- Update responsible waiter atomically.
- Redirect readiness notifications to new waiter.

### 6.2 Existing Code

- `reassignOrderResponsibility` in `staff-waiter-operations.ts`: exists but requires **Manager** role.
- `acceptWaiterResponsibilityHandover`: waiter-to-waiter handover via `waiterShiftHandover`.
- `WaiterTableTransfer`: Prisma model exists for table transfers.

### 6.3 Blocker

Automatic reassignment on shift end requires:
1. Background job or shift-close hook to detect ended shifts with active orders.
2. Eligible waiter selection algorithm (deterministic, branch-scoped).
3. API route for automatic reassignment (not yet implemented).

**Verdict:** BLOCKED — requires backend API implementation and business approval for deterministic selection policy.

---

## 7. Safe Deletion (Phase 6 — Blocked)

### 7.1 Requirement

Waiter may request physical deletion of unpaid order before any item becomes READY.

### 7.2 Existing Code

- `transitionOrderStatus` supports `cancelled` status (soft cancel with audit trail).
- No hard delete for orders exists in `staff-orders.ts`.
- Invoice deletion policy (`invoice-deletion-policy.ts`) protects invoices with payments, inventory activity, audit history.

### 7.3 Critical Data-Integrity Constraints

Before physical deletion, must inspect:
- Payment records (never delete settled payment evidence)
- Refund records (never delete)
- Inventory reservations/consumption (never delete)
- Waste records (never delete)
- Batch allocations (never delete)
- Audit logs (never delete)
- Kitchen events (never delete)
- Employee accountability (never delete)
- Referential integrity constraints

### 7.3 Verdict

**BLOCKED — REQUIRES BUSINESS APPROVAL.**

Full order deletion is not implemented. Only cancellation exists, which preserves audit trail. Hard deletion is forbidden if any protected records exist.

---

## 8. Inventory Safety

| Operation | Timing | Action |
|-----------|--------|--------|
| Reserve stock | At kitchen dispatch | `reserveOrderInventory` / `reserveOrderItemInventory` |
| Consume stock | At serving | `consumeOrderReservations` (immutable) |
| Release reservation | On cancellation before preparation | `releaseOrderReservations` |
| Record waste | On cancellation after preparation | `consumeOrderReservations` with waste type |

- Pg row locks (`FOR UPDATE`) serialize every stock decision.
- No negative available stock allowed.
- Batch/FIFO allocation preserved.
- Employee accountability maintained.

---

## 9. Financial Safety

| Record | Protected? | Notes |
|--------|------------|-------|
| Payment records | ✅ Yes | Never deleted or silently altered |
| Partial payments | ✅ Yes | Preserved |
| Electronic confirmation | ✅ Yes | Preserved |
| Cash shift attribution | ✅ Yes | Preserved |
| Refund lifecycle | ✅ Yes | Preserved |
| Ledger records | ✅ Yes | Preserved |
| Financial audit trails | ✅ Yes | Preserved |
| Manager supervisory-only | ✅ Yes | Enforced |

Table release depends on authoritative payment + order closure state.

---

## 10. File Changes Summary

| File | Change | Phase |
|------|--------|-------|
| `src/components/waiter/waiter-table-workspace.tsx` | Unified workspace with order/pos tabs, cashier read-only, auto-dispatch, audio notifications, reassign section | 1, 2, 3, 5a |
| `src/app/(public)/page.tsx` | Premium café landing page (separate project) | Café website |
| `src/components/public/*` | 7 new landing components (separate project) | Café website |
| `docs/table-workflow/PHASE_0_EXISTING_SYSTEM_AUDIT.md` | Initial audit | 0 |
| `docs/table-workflow/TABLE_WORKFLOW_ARCHITECTURE.md` | Architecture decisions | 1-7 |

---

**End of Architecture Document.**
