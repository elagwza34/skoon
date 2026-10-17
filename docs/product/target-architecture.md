# Target Architecture & Structural Map (Phase B)

**Subject:** Skoon cafe management system — documented target architecture
**Date:** 2026-10-15 · **Mode:** Audit / plan-only
**Source of truth:** verified live source tree (see inventory §5 for live evidence, not assumptions).

## 1. Architectural principles

1. **One source of truth per concern.** RBAC in `authz.ts` + `route-access.ts`; order status in `order-status.ts`; notifications in `notifications.ts`. UI never encodes policy.
2. **Server components default; client components opt-in.** `(app)` tree is server-first. Operational boards (`/waiter`, `/kitchen`, `/pos`) strip the admin sidebar for focus.
3. **Write path = server-only, Zod-gated, transactional.** Prices, money, role/branch checks never trusted from client. Zod parsers gate all writes.
4. **Events materialized, not broadcast.** Every state change appends to `order_status_history` and fans out notifications inside the same Prisma `$transaction`. No out-of-band writes.
5. **Notifications are user-scoped, not role-broadcast.** A `Notification` row addresses one `userId`; `notifyRole()` resolves active users of a role in a branch and creates one row per user. Owner (`branchId=null`) cross-branch.
6. **Public and staff share the same data layer.** `public-orders.ts` and `staff-orders.ts` read/write the same `Order` model through the same Prisma client.

## 2. Portfolio map (Next.js 15 App Router convention)

Next.js 15 **does not** use parent/child "parallel routes" for these folders. `(app)` and `(public)` are grouping directories; parentheses are route-group markers (no route segments, no layout inheritance between them).

```
src/app/
  (app)/                    # staff account area
    layout.tsx              # server-side route guard + Topbar/sidebar shell
    page.tsx                # redirect to homeForRole()
    dashboard/              # owner/manager
    kitchen/                # operational board
    waiter/                 # operational board
    pos/                    # operational board
    orders/, tables/, products/, inventory/, customers/, staff/, reports/, settings/, shifts/, categories/
  (public)/                 # guest area
    layout.tsx              # public shell + topbar
    menu/[token]/, order/[id]/, select-table/, order-type/
  api/                      # route handlers
    public/orders, public/orders/[id], staff/...
  login/                    # Supabase auth + actions
  middleware.ts             # identity + branch scoping
```

## 3. Request lifecycle (end to end)

```
Client (board/URL)
  -> client component (ops board, bell, form)
  -> route handler (force-dynamic where data changes frequently)
  -> service (staff-orders | staff-payments-write | staff-pos-write | ...)
  -> Prisma transaction
  -> emit notifications in-tx
  -> NextResponse.json
  <- revalidation (router.refresh() / cache: 'no-store' on bell)
```

Key properties:
- Staff routes are `dynamic = 'force-dynamic'`. Public order routes are force-dynamic; read-mostly catalog may be cached.
- Staff routes derive identity from `getStaffSession()` (Supabase + role/branch). Never trust client-supplied role.

## 4. Data flow: public vs staff

| Concern | Public (guest) | Staff |
|---------|----------------|-------|
| Catalog read | `api/public/orders` (Product/Category) | `staff-catalog.ts` (same model, branch-scoped) |
| Order create | `api/public/orders` (`source=qr`\|`waiter`\|`pos`) | `staff-pos-write.ts` (`createPosOrder`) |
| Order list | `public-orders.ts` (latest N) | `staff-orders.ts` (`listStaffOrders`, branch-scoped) |
| Status write | none | `status/route.ts` + `transitionOrderStatus` |
| Payment write | none | `pay/route.ts` + `finalizeOrderPayment` |
| Notifications | bell polls `staff/notifications` | same route; per-user |

## 5. Current component tree

```
src/components/
  layout/          app-shell.tsx, topbar.tsx, notifications-bell.tsx, sidebar.tsx, topbar-search.tsx
  auth/            login-form.tsx
  dashboard/       demo-banner, quick-actions, recent-orders-table, sales-card, tables-status, top-products
  kitchen/         kitchen-board.tsx        (send-to-kitchen gate; new/preparing/ready)
  orders/          orders-board.tsx
  order/           copy-order-link-button, order-status-tracker, resume-order-button
  pos/             pos-checkout.tsx, pos-view.tsx
  reports/         reports-board.tsx
  settings/        settings-board.tsx
  staff/           staff-board.tsx
  tables/          tables-board.tsx, print-button
  ui/              badge, button, card, dropdown, empty-state, icon, input, popover, segmented, stat, switch, theme-toggle, avatar
  waiter/          waiter-board.tsx         (send-to-kitchen + served; cancelled tab)
  menu/            menu-order-view.tsx
  placeholder-page.tsx
```

## 6. Interface contract map (Prisma <-> serializable DTOs)

| Layer | Shape | Notes |
|-----|-------|-------|
| Prisma row (`Order`) | `id` BigInt, `branchId`, `cafeTableId`, `total` Decimal, `paymentStatus` | internal |
| `StaffOrderRow` | `id: string`, `number: string`, `status`, `paymentStatus`, `total: number`, `tableNumber: string`, `sentToKitchen: boolean`, `sentToKitchenAt: string|null`, `cancelReason: string|null`, `items[]`, `itemsCount` | serializes BigInt/Decimal -> string/number; maps `orderNumber`/`cafeTable.number`/`items.productName` |
| `WaiterWorkspace` | `{tables[], openOrders[], categories[], products[]}` | reads multiple models; counts open orders per table |
| `PaymentResult`/`RefundResult` | money as `string` | `staff-payments-write.ts` |
| `StaffNotification` | `{id, type, title, body, isRead, createdAt, orderId}` | `notifications.ts::listNotifications` |

## 7. Server vs client boundary

- **Server-only (correct):** `session.ts`, `require-page-access.ts`, `notifications.ts`, all `staff-*-write.ts`, all `api/*` handlers, `navigation.ts`, `dashboard-stats.ts`, `public-orders.ts` (server).
- **Client-only (correct):** `kitchen-board.tsx`, `waiter-board.tsx`, `pos-view.tsx`, `pos-checkout.tsx`, `notifications-bell.tsx`, `orders-board.tsx`, `app-shell.tsx`, `login-form.tsx`, `topbar.tsx`.
- **Shared (pure, no DB/next/headers):** `authz.ts`, `route-access.ts`, `order-status.ts`, `format.ts`, `utils.ts`, `navigation.ts`, `public-menu.ts`.
- Rule: never import `next/headers` from a client component. Keep guards in separate modules (`route-access.ts` pure + `require-page-access.ts` session-aware).

## 8. Known friction points & recommended locations

| Friction | Where it must live | Why |
|----------|-------------------|-----|
| Branch scoping (multi-tenant, single-tenant today) | `authz.ts::canAccessBranch` + all services | Owner cross-branch; staff own-branch |
| Money/Decimal leak | Every service returning Order/Payment | Serialize to `string`/`number` in DTOs |
| Notifications edge cases | `notifications.ts` + `emitStatusNotifications` | Role fan-out, no duplicate, atomic with tx |
| Shift scheduling (future) | New `Shift` model + `staff-shifts.ts` | Draft/pending rules live here |
| Cash reconciliation (future) | `payments/route.ts` extra action + `cash-register` table | Separate from order payment |

## 9. Path & routing convention

- App Router file-based routing; page paths map directly to URLs.
- API routes: `/api/public/orders`, `/api/staff/orders/[id]/status`, `/api/staff/orders/[id]/pay`, `/api/staff/pos/orders`, `/api/staff/notifications`, `/api/staff/notifications/read`, `/api/staff/search`, `/api/staff/settings`, `/api/staff/users/[id]`, etc.
- Dynamic segments use `[id]`. No REST middleware — each route handler self-guards.

