# PHASE_0_EXISTING_SYSTEM_AUDIT.md — SOKOON Table-Centric POS & Real-Time Order Management

**Project:** SKOON (D:\Projects-code\Sokoon)  
**Scope:** Read-only audit of existing table/order/POS/kitchen/inventory/payment systems before implementing unified table-centric workflow.  
**Constraint:** Read-only audit only. No application code changes. No database or migration changes. No production access. No deployment or Git push.  
**Status:** Draft — for review before implementation.

---

## 1. Executive Summary

SKOON already contains a substantial production-grade café management platform with:

- **Staff roles:** owner, manager, cashier, waiter, kitchen (via `ROLE` in `src/lib/authz.ts`)
- **Session + authorization:** Supabase Auth for identity, Prisma `public.users` for role/branch/permissions (server-side, fail-closed)
- **Tables:** `cafeTable` model with `status` (available/occupied) derived from active orders (`staff-tables.ts`)
- **Orders:** Full lifecycle `pending → new → preparing → ready → served` / `cancelled` (`staff-orders.ts`)
- **Waiter workspace:** `WaiterTableWorkspace` component + `getWaiterWorkspace` server function with branch scope, open-shift requirement, QR order claiming/approve
- **POS:** `pos-view.tsx` — **demo-only** client-side cart, no real writes (`use-pos-cart.ts` uses `@/lib/demo` data)
- **Cashier:** `cashier-workspace.tsx`, `cart-sidebar.tsx`, `invoice-board.tsx`, `tables-sidebar.tsx`
- **Kitchen:** `kitchen-board.tsx`
- **Inventory:** `staff-inventory-engine.ts` with reservations, consumption, waste, batch/FIFO
- **Payments:** `staff-payments-write.ts`, `staff-float.ts`, invoice routes
- **Shifts:** `staff-shifts.ts`, `staff-float.ts` (cashier shift required for operational roles)
- **Notifications:** `notifications.ts` (role-based, branch-scoped)
- **Middleware:** fail-closed path protection, session cookie rotation

**Key finding:** The table-centric workflow is **partially implemented** already. `WaiterTableWorkspace` exists with add-items, edit, void, send-to-kitchen. However:
- POS (`pos-view.tsx`) is **demo-only** (client-side, no real DB writes)
- No unified table workspace with `Current Order` / `POS` tabs shared by waiter and cashier
- Automatic kitchen dispatch on confirm exists only partially (waiter `sendToKitchen` is manual button)
- OCC (Optimistic Concurrency Control) exists partially via `expectedUpdatedAt` in `waiterOrderEditSchema` but not across all write paths
- Real-time sync needs audit (Supabase Realtime vs polling vs cache invalidation)
- Owner `OwnerCommandCenter` mobile layout needs `overflow-x` fixes (already identified in prior work)

---

## 2. Existing Architecture & Components Map

### 2.1 Route Groups & Pages

| Route | Group | Purpose | Role(s) | Status |
|-------|-------|---------|---------|--------|
| `/` | root | Landing page | public | Implemented |
| `/login` | root | Staff sign-in | public | Implemented |
| `/order-type` | (public) | Guest order mode picker | public | Implemented |
| `/select-table` | (public) | Guest table picker | public | Implemented |
| `/menu/[token]` | (public) | QR menu + cart | public | Implemented |
| `/order/[id]?n=` | (public) | Order tracking | public | Implemented |
| `/api/public/orders` | api | Public QR order creation | public | Implemented |
| `/api/public/service-requests` | api | Public service requests | public | Implemented |
| `/(app)/dashboard` | (app) | Owner dashboard | owner | Implemented |
| `/(app)/waiter` | (app) | Waiter board | waiter | Implemented |
| `/(app)/waiter/tables/[tableId]` | (app) | Waiter table workspace | waiter | Implemented |
| `/(app)/cashier` | (app) | Cashier board | cashier | Implemented |
| `/(app)/cashier/tables/[tableId]` | (app) | Cashier table view | cashier | Exists |
| `/(app)/kitchen` | (app) | Kitchen board | kitchen | Implemented |
| `/(app)/pos` | (app) | Main POS | cashier | Implemented (demo) |
| `/(app)/pos/checkout` | (app) | POS checkout | cashier | Implemented (demo) |
| `/(app)/tables` | (app) | Tables management | owner/manager | Implemented |
| `/(app)/products` | (app) | Products management | owner/manager | Implemented |
| `/(app)/shifts` | (app) | Shifts management | cashier/waiter/kitchen/manager | Implemented |
| `/(app)/staff` | (app) | Staff management | owner/manager | Implemented |
| `/(app)/reports` | (app) | Reports | owner/manager | Implemented |
| `/(app)/settings` | (app) | Settings | owner | Implemented |
| `/api/staff/*` | api | Staff JSON APIs (fail-closed) | auth roles | Implemented |

### 2.2 Core Server Libraries

| File | Purpose | Role(s) | Status |
|------|---------|---------|--------|
| `src/lib/session.ts` | Staff session, role, branch, bootstrap | all | Implemented |
| `src/lib/authz.ts` | Roles, permissions, rank, branch access | all | Implemented |
| `src/lib/table-order-policy.ts` | Active order invariant, canManage, mayAppend | waiter/cashier | Implemented |
| `src/lib/staff-waiter.ts` | Waiter workspace data + owner monitor | waiter/owner | Implemented |
| `src/lib/staff-orders.ts` | Order lifecycle, transitions, append, serve, edit | waiter/cashier/kitchen | Implemented |
| `src/lib/staff-tables.ts` | Staff tables + live occupancy | all | Implemented |
| `src/lib/staff-inventory-engine.ts` | Reservations, consumption, waste, batches | kitchen/waiter | Implemented |
| `src/lib/staff-invoices.ts` | Invoices | cashier/owner | Implemented |
| `src/lib/staff-payments-write.ts` | Payments write logic | cashier | Implemented |
| `src/lib/staff-float.ts` | Cash float | cashier | Implemented |
| `src/lib/staff-shifts.ts` | Shift management | cashier/waiter/kitchen/manager | Implemented |
| `src/lib/financial-shift-lock.ts` | Shift locking for financial ops | cashier | Implemented |
| `src/lib/invoice-recalculation.ts` | Invoice recalculation | cashier | Implemented |
| `src/lib/notifications.ts` | Role-based, branch-scoped notifications | all | Implemented |
| `src/lib/prisma.ts` | Prisma client | all | Implemented |

### 2.3 Client Components (Relevant to Table Workflow)

| File | Purpose | Role(s) | Status |
|------|---------|---------|--------|
| `src/components/waiter/waiter-table-workspace.tsx` | Waiter single-table workspace | waiter | Implemented (complex, 460 lines) |
| `src/components/waiter/waiter-view.tsx` | Waiter board view | waiter | Implemented |
| `src/components/waiter/table-qr-requests.tsx` | QR service requests | waiter | Implemented |
| `src/components/waiter/owner-waiter-monitor.tsx` | Owner waiter monitor | owner | Implemented |
| `src/components/cashier/cashier-workspace.tsx` | Cashier workspace | cashier | Implemented |
| `src/components/cashier/cart-sidebar.tsx` | Cashier cart | cashier | Implemented |
| `src/components/cashier/tables-sidebar.tsx` | Cashier tables sidebar | cashier | Implemented |
| `src/components/cashier/invoice-board.tsx` | Cashier invoice board | cashier | Implemented |
| `src/components/pos/pos-view.tsx` | POS view (demo) | cashier | **Demo-only** |
| `src/components/pos/pos-checkout.tsx` | POS checkout (demo) | cashier | **Demo-only** |
| `src/components/kitchen/kitchen-board.tsx` | Kitchen board | kitchen | Implemented |
| `src/components/tables/tables-board.tsx` | Tables board + floor plan | owner/manager | Implemented |
| `src/components/order/order-status-tracker.tsx` | Order status tracker | public/staff | Implemented |
| `src/components/order/resume-order-button.tsx` | Resume order button | public | Implemented |
| `src/components/owner/owner-command-center.tsx` | Owner command center | owner | **Mobile overflow issue** |
| `src/components/owner/owner-invoice-board.tsx` | Owner invoice board | owner | Implemented |

### 2.4 Prisma Models (Relevant)

| Model | Purpose | Status |
|-------|---------|--------|
| `CafeBranch` | Café branch | Implemented |
| `CafeTable` | Table with `publicToken`, floor plan | Implemented |
| `Category` | Product category | Implemented |
| `Product` | Product with variants, options | Implemented |
| `ProductVariant` | Product variant | Implemented |
| `ProductOption` / `ProductOptionValue` | Modifiers | Implemented |
| `Order` | Order with status, paymentStatus, orderType | Implemented |
| `OrderItem` | Order item with variant, modifiers, notes | Implemented |
| `OrderStatusHistory` | Audit trail for status changes | Implemented |
| `Payment` | Payment records | Implemented |
| `Invoice` | Invoice | Implemented |
| `InventoryItem` | Physical stock | Implemented |
| `InventoryReservation` | Stock reservation | Implemented |
| `InventoryMovement` | Consumption/waste | Implemented |
| `InventoryBatch` | Batch/FIFO | Implemented |
| `StaffShift` | Operational shifts | Implemented |
| `StaffShiftHandover` | Waiter handover | Implemented |
| `WaiterTableTransfer` | Table transfer | Implemented |
| `ServiceRequest` | QR service requests | Implemented |
| `FinancialOperation` | Idempotency + audit | Implemented |
| `AuditLog` | Audit trail | Implemented |

---

## 3. Dependency Map: Waiter → Cashier → Kitchen → Inventory → Finance

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Waiter    │────▶│   Cashier   │────▶│   Kitchen   │────▶│  Inventory  │────▶│   Finance   │
│  (owner of  │     │  (read-only │     │  (prepares │     │  (reserves, │     │  (payments, │
│   table     │     │   in table   │     │   items)    │     │  consumes)  │     │  refunds)   │
│   order)    │     │  workspace)  │     │             │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
        │                   │                   │                   │                   │
        ▼                   ▼                   ▼                   ▼                   ▼
  staff-waiter.ts   cashier-workspace.tsx  kitchen-board.tsx  staff-inventory-engine.ts  staff-payments-write.ts
  staff-orders.ts   tables-sidebar.tsx     kitchen-board.tsx  staff-orders.ts            staff-invoices.ts
  staff-tables.ts   invoice-board.tsx      staff-orders.ts    staff-shifts.ts            staff-float.ts
  table-order-policy.ts                   notifications.ts     staff-shifts.ts            invoice-recalculation.ts
```

**Data flow:**
1. **Waiter** creates/appends to order via `POST /api/staff/orders/[id]/items/append` or `POST /api/staff/pos/orders`
2. **Waiter** sends to kitchen via `POST /api/staff/orders/[id]/send`
3. **Kitchen** prepares via `POST /api/staff/orders/[id]/items/prepare` (mode: start/ready)
4. **Waiter/Cashier** serves via `POST /api/staff/orders/[id]/items/serve`
5. **Inventory engine** reserves at dispatch, consumes at serve, records waste on cancellation
6. **Cashier** collects payment via existing payment routes (outside table workspace per policy)
7. **Notifications** branch-scoped via `notifyRole`

---

## 4. Reusable Components vs. Unsafe Duplication

### 4.1 Reusable (Preserve & Extend)

| Component | Reuse For |
|-----------|-----------|
| `WaiterTableWorkspace` | Base for unified table workspace (has add-items, edit, void, send-to-kitchen) |
| `TablesBoard` | Table selection, occupancy display |
| `pos-view.tsx` | UI pattern for product browser + cart (but **demo logic must be replaced** with real server writes) |
| `staff-orders.ts` | `appendOrderItems`, `editWaiterOrder`, `transitionOrderStatus`, `serveOrderItems` — all server-side, transactional |
| `staff-inventory-engine.ts` | `reserveOrderInventory`, `reserveOrderItemInventory`, `consumeOrderReservations`, `releaseOrderReservations` |
| `staff-invoices.ts` | Invoice read/write (preserve, do not duplicate) |
| `staff-payments-write.ts` | Payment write logic (preserve) |
| `staff-shifts.ts` | Open-shift requirement (preserve) |
| `notifications.ts` | Branch-scoped real-time notifications (preserve, extend) |
| `table-order-policy.ts` | `activeTableOrderWhere`, `isActiveTableOrder`, `canManageTableOrder`, `mayAppendToOrder` |

### 4.2 Unsafe Duplication / Gaps to Address

| Gap | Current State | Required Action |
|-----|---------------|-----------------|
| POS (`pos-view.tsx`) | **Demo-only**, client-side, `@/lib/demo` data, no DB writes | Replace with real server-backed POS that writes orders via existing APIs |
| Unified table workspace | `WaiterTableWorkspace` exists but waiter-only UI patterns | Extend to support both waiter (write) and cashier (read-only) tabs: `Current Order` / `POS` |
| Automatic kitchen dispatch | Waiter `sendToKitchen` is manual button | Make dispatch automatic on order confirm (no separate manual action for new orders) |
| OCC across all writes | `expectedUpdatedAt` exists in `waiterOrderEditSchema` only | Extend to `appendOrderItems`, `serveOrderItems`, `transitionOrderStatus` |
| Real-time sync | Audit needed (Supabase Realtime vs polling) | Prefer existing `notifications.ts` + Supabase Realtime; no second system |
| Kitchen ready notifications | `emitStatusNotifications` exists in `staff-orders.ts` | Verify waiter-targeted, audio notification, duplicate prevention |
| Waiter reassignment | `StaffShiftHandover`, `WaiterTableTransfer` exist | Verify automatic reassignment on shift end |
| Full order deletion | No physical delete in `staff-orders.ts` | Only cancellation exists; hard delete blocked if payments/inventory exist |

---

## 5. Conflicts Between Requested Workflow & Existing Business Rules

| Requested | Existing Rule | Conflict? | Resolution |
|-----------|---------------|-----------|------------|
| Automatic kitchen dispatch on confirm | Waiter must click "إرسال للمطبخ" manually | **Yes** | Change UI to auto-dispatch on confirm; preserve manual button as fallback/override |
| Cashier read-only in table workspace | Cashier can currently edit orders via `editWaiterOrder`? | **No** — `editWaiterOrder` requires `ROLE.WAITER` | Cashier already restricted to `appendOrderItems` (waiter OR cashier) and `serveOrderItems` (waiter OR cashier for paid takeaway). Table workspace UI must enforce read-only for cashier |
| Full order deletion before READY | Only cancellation exists in `staff-orders.ts`; no hard delete | **No conflict** | Cancellation preserves audit trail. Hard delete not implemented; document as blocked if protected records exist |
| OCC on all writes | `expectedUpdatedAt` only in `editWaiterOrder` | **Gap** | Extend to `appendOrderItems` and `transitionOrderStatus` |
| Table context immutable | `tableId` set at order creation | **No conflict** | Already enforced; table cannot be changed in POS workspace |

---

## 6. Security & Integration Risks

| Risk | Detail | Severity | Existing Mitigation |
|------|--------|----------|---------------------|
| Concurrent order edits | Two waiters edit same order simultaneously | High | `expectedUpdatedAt` in `editWaiterOrder`; `FOR UPDATE` row locks in transactions |
| Duplicate kitchen dispatch | Retry sends same items to kitchen twice | High | `idempotencyKey` + `financialOperation` table in `appendOrderItems` |
| Cashier mutating table order | Cashier bypasses read-only policy | High | `editWaiterOrder` requires `ROLE.WAITER`; UI must enforce read-only |
| Inventory negative stock | Concurrent consumption | High | `FOR UPDATE` row locks on `inventory_items`; `StaffError` on insufficient stock |
| Payment history alteration | Silent delete/modify of payments | Critical | `staff-payments-write.ts` idempotency; `FinancialOperation` audit; no cascading deletes |
| Cross-branch data leak | Waiter accesses other branch orders | High | `staffCanAccessBranch` + `branchScope` in all Prisma queries |
| Shift expiry mid-operation | Shift closes while order active | Medium | `lockAndReadShift` + `getOpenShift` checks in every mutation |
| Real-time event replay | Duplicate audio alerts | Medium | `idempotencyKey` + fingerprint check in `serveOrderItems` |

---

## 7. Existing PHASE_0 (Café Website) — Preserved

The café website landing page work (completed in prior session) is in:
- `docs/cafe-website/PHASE_0_AUDIT.md`
- `docs/cafe-website/IMPLEMENTATION_REPORT.md`
- Components: `src/components/public/landing-*` (7 new files)
- Modified: `src/app/(public)/page.tsx`, `src/components/menu/menu-order-view.tsx`, `src/app/globals.css`, `tailwind.config.ts`

**Preservation rule:** Café website work is separate from table workflow. No overlap.

---

## 8. Route Regression Matrix (Table Workflow)

| Route | Group | Preserve? | Notes |
|-------|-------|-----------|-------|
| `/(app)/waiter/tables/[tableId]` | (app) | ✅ | `WaiterTableWorkspace` — extend, don't replace |
| `/(app)/cashier/tables/[tableId]` | (app) | ✅ | Cashier table view — make read-only in table workspace |
| `/(app)/pos` | (app) | ✅ | Demo POS — replace logic with real server writes |
| `/(app)/kitchen` | (app) | ✅ | Kitchen board — preserve |
| `/(app)/tables` | (app) | ✅ | Tables board — preserve |
| `/api/staff/orders/[id]/items/append` | api | ✅ | Extend with OCC |
| `/api/staff/orders/[id]/send` | api | ✅ | Auto-dispatch on confirm |
| `/api/staff/orders/[id]/items/prepare` | api | ✅ | Kitchen prepare — preserve |
| `/api/staff/orders/[id]/items/serve` | api | ✅ | Serve — preserve |
| `/api/staff/orders/[id]/items/void` | api | ✅ | Void — preserve |
| `/api/staff/orders/[id]/items/adjust` | api | ✅ | Adjust quantity — preserve |
| `/api/staff/orders/[id]/status` | api | ✅ | Status transition — preserve |
| `/api/staff/pos/orders` | api | ✅ | Create order — extend for auto-dispatch |
| `/api/staff/shifts` | api | ✅ | Shift management — preserve |
| `/api/staff/invoices/*` | api | ✅ | Invoices — preserve, no changes |
| `/api/staff/payments/*` | api | ✅ | Payments — preserve, no changes |
| `src/middleware.ts` | root | ✅ | Fail-closed — preserve |
| `prisma/schema.prisma` | root | ✅ | No schema changes |

---

## 9. Implementation Readiness Verdict

**READY — with conditions.**

The repository has a complete, authenticated staff operations platform with most table workflow building blocks already implemented. The table-centric POS workflow can be implemented by:

1. **Extending** `WaiterTableWorkspace` into a unified table workspace (waiter + cashier tabs)
2. **Replacing** demo `pos-view.tsx` logic with real server-backed order writes
3. **Adding** automatic kitchen dispatch on order confirm
4. **Extending** OCC to all write paths
5. **Verifying** real-time sync uses existing `notifications.ts` + Supabase Realtime

**Conditions before implementation:**
1. Do NOT modify `prisma/schema.prisma` without explicit approval
2. Do NOT modify `src/middleware.ts` or authentication
3. Do NOT modify payment/invoice financial logic
4. All mutations must go through existing transactional services (`staff-orders.ts`, `staff-inventory-engine.ts`)
5. No destructive database operations (no hard deletes of payments/inventory/audit)

**Next step:** Create `docs/table-workflow/` directory and write Phase 0 audit, then proceed to Phase 1 (shared table workspace).

---

**End of Phase 0 Audit.** Read-only. No code, database, or Git changes made as part of this audit.
