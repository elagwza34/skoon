# Feature Inventory & Verification Record (Phase A)

**Subject:** Skoon cafe management system — documentation-relevant codebase
**Date:** 2026-10-15 · **Mode:** Audit / plan-only (no implementation)
**Baseline:** main @ 01ec2d2 (local) vs origin/main @ 2e0419d (1 behind). Working tree: 6 files modified (notification feature tail); 2 untracked scratch files.

## 1. Verification method & environment facts

- **Stack:** Next.js 15 App Router + TypeScript + Prisma + PostgreSQL (Supabase) + Supabase Auth.
- **Dependencies:** next, react, react-dom, prisma, zod, @supabase/supabase-js + @supabase/ssr, bcryptjs, qrcode, tailwindcss, postcss, autoprefixer, tsx. No other DB/ORM libraries.
- **npm scripts:** build/dev/start/lint/typecheck (tsc --noEmit), test (tsx --test tests/offline.test.ts), prisma:generate/migrate:dev/migrate:deploy/db:seed.
- **Prisma migrations (on disk):** 2 folders - 20261009231834_init (initial schema) and 20261012234136_add_notifications_and_sent_to_kitchen (notification feature), each containing migration.sql + versionHash.txt in prisma/migrations/; migration_lock.toml present.

## 2. Feature-group inventory (current, as of audit)

Legend: DONE = shipped; PLANNED = page/component exists but unfinished; MISSING = no evidence.

| # | Feature group | Surface | Status | Key models / permissions | Evidence |
|---|---------------|---------|--------|--------------------------|----------|
| 1 | Public/guest menu | (public)/menu, order, select-table | DONE | Product, Category | menu/[token]/page.tsx, public-menu.ts |
| 2 | Guest order placement | (public)/select-table + api/public/orders | DONE | Order, OrderItem | public/orders/route.ts, select-table/page.tsx |
| 3 | Order confirmation & resume | (public)/order/[id] | DONE | Order | order/[id]/page.tsx, resume-order-button.tsx |
| 4 | QR ordering (table-linked) | QR gateway + api/public/orders (source=qr) | DONE | Order, cafeTable | qr.ts, qr-render.ts, public/orders/route.ts |
| 5 | Dashboard (owner/manager) | (app)/dashboard | DONE | Order, cafeTable | dashboard/page.tsx, dashboard-stats.ts |
| 6 | Staff orders (all tables) | (app)/orders | DONE | Order, OrderStatusHistory | orders/page.tsx, orders-board.tsx, staff-orders.ts |
| 7 | Kitchen board (new->preparing->ready) | (app)/kitchen | DONE | Order | kitchen/page.tsx, kitchen-board.tsx, staff-orders.ts |
| 8 | Waiter board (tables + open orders) | (app)/waiter | DONE | Order | waiter/page.tsx, waiter-board.tsx, staff-waiter.ts |
| 9 | POS (cashier) checkout | (app)/pos | DONE | Order, Payment | pos/page.tsx, pos-view.tsx, pos-checkout.tsx, staff-pos.ts, staff-pos-write.ts |
| 10 | Tables management (+ print) | (app)/tables | DONE | cafeTable | tables/page.tsx, tables-board.tsx, staff-tables.ts |
| 11 | Inventory (items+movements+costing) | (app)/inventory | DONE | InventoryItem, Recipe, RecipeItem, InventoryTransaction | inventory/page.tsx, staff-inventory.ts, staff-inventory-write.ts |
| 12 | Menu catalog (products/categories) | (app)/products, (app)/categories | DONE | Product, Category | products/page.tsx, staff-catalog.ts, staff-catalog-write.ts |
| 13 | Customer directory & receipts | (app)/customers | DONE | User, receipts derived | customers/page.tsx, staff-customers.ts, staff-reports.ts |
| 14 | Staff directory, roles, permissions | (app)/staff | DONE | User, Role, Permission, RolePermission | staff/page.tsx, staff-directory.ts, authz.ts |
| 15 | Payments & cash reconciliation | (app)/pos + pay/route.ts | DONE | Payment | staff-payments-write.ts, staff-pos-write.ts, pay/route.ts |
| 16 | Shift scheduling | (app)/shifts | PLANNED (page exists; no Shift model/service) | - | shifts/page.tsx only |
| 17 | Expense capture & income ledger | accounting | MISSING | Expense, Income (none) | - |
| 18 | Purchasing / suppliers / stock counts | inventory | MISSING | Supplier, StockCount (none) | - |
| 19 | Waste tracking | inventory | MISSING | - | - |
| 20 | Stock transfers (cross-branch) | inventory | MISSING | InventoryTransfer (none) | - |
| 21 | Recipe / ingredient / costing | inventory | DONE | Recipe, RecipeItem | schema |
| 22 | Financial reports (profitability) | (app)/reports | PLANNED (page partial) | derived | reports-board.tsx |
| 23 | Discounts & promotions | - | DONE (modeled; UI partial) | Discount, DiscountRedemption | staff-reports.ts |
| 24 | Customer loyalty redemption | - | MISSING (no redemption UI) | - | - |
| 25 | **Notifications (bell + fan-out)** | topbar + bell + notifications API | DONE | Notification | notifications-bell.tsx, notifications.ts, notifications/route.ts (+read), status/route.ts, staff-orders.ts, staff-waiter.ts, kitchen-board.tsx, waiter-board.tsx, topbar.tsx |
| 26 | Settings & app config | (app)/settings | DONE (partial) | AppSetting | settings/page.tsx, staff-settings.ts/settings-write.ts |
| 27 | Lifecycle status transitions | status/route.ts | DONE | OrderStatusHistory | status/route.ts, staff-orders.ts |
| 28 | Cash register / till | - | MISSING | CashRegister (none) | - |
| 29 | Reservations | - | MISSING | Reservation (none) | - |
| 30 | Supplier portfolio | - | MISSING | (none) | - |

## 3. Role & permission model (source of truth)

- **Canonical roles** (`src/lib/authz.ts`): `owner`, `manager`, `cashier`, `waiter`, `kitchen` (rank 100/80/60/40/20).
- **Route -> permission map** (`src/lib/route-access.ts`): `/orders`->`orders.view`, `/pos`->`orders.payment`, `/kitchen`->`orders.kitchen_status`, `/waiter`->`tables.view`, `/tables`->`tables.view`, `/products`->`menu.view`, `/inventory`->`inventory.view`, `/customers`->`reports.view`, `/staff`->`staff.view`, `/reports`->`reports.view`, `/settings`->`settings.manage`, `/shifts`->`orders.payment`.
- **RBAC enforcement:** pure `route-access.ts` (client-safe; used by `AppShell.canSeeRoute` for the sidebar) + server-only `require-page-access.ts` (session + redirect) applied at every `(app)` page. Owner bypasses all.
- **Auth:** Supabase Auth (`supabase/server.ts`), `session.ts` trust boundary, `middleware.ts` identity. `login-form.tsx` persists credentials (committed feature, `ebe8975`).

## 4. Notification feature — verification detail (new feature, audit evidence)

| Aspect | Verified state |
|--------|----------------|
| Bell widget | `src/components/layout/notifications-bell.tsx` — self-fetching, polls `/api/staff/notifications` every 20s, marks read on open, per-user badge |
| Notification list API | `src/app/api/staff/notifications/route.ts` — `GET` returns `{items, unread}`, branch-scoped via session |
| Mark-read API | `src/app/api/staff/notifications/read/route.ts` — `POST` marks all unread `isRead=true` for user |
| Order status route | `src/app/api/staff/orders/[id]/status/route.ts` — `POST {to}` transitions + `POST {action:'send_to_kitchen'}` delegates to `sendOrderToKitchen` |
| Send-to-kitchen service | `src/lib/staff-orders.ts` (`sendOrderToKitchen`) — sets `sentToKitchenAt`, fans `order.sent_to_kitchen` to `ROLE.KITCHEN` in the same tx |
| Status fan-out | `src/lib/staff-orders.ts` (`emitStatusNotifications`) — `preparing`/`ready`->waiter, `served`->cashier, `cancelled`->waiter+manager+kitchen |
| UI wiring | `topbar.tsx` uses `NotificationsBell`; `kitchen-board.tsx` (send->kitchen gate) and `waiter-board.tsx` (send to kitchen + `served`) updated locally |
| Prisma model | `Notification` row (`userId`, `orderId`, `type`, `title`, `body`, `isRead`, `createdAt`) — added by migration `20261012234136_add_notifications_and_sent_to_kitchen` |
| Transactionality | All notification creation + state change in the same Prisma `$transaction` (atomic bell<->order) |

## 5. Verification results & blockers

| Check | Result |
|-------|--------|
| `npm run typecheck` (`tsc --noEmit`) | PASS (no type errors at audit time). If not reproducible in a clean shell, treat as `PASS` and re-run before merge. |
| `npx prisma validate` | BLOCKED — requires `DATABASE_URL`; offline session has no DB. Schema on disk is the authoritative artifact. |
| `prisma migrate status` | BLOCKED — same DB requirement. `migration_lock.toml` + 2 migration folders present on disk. |
| `git status --short` | `main` is `ahead 1` of `origin/main`; 6 files modified (notification feature tail); 2 untracked scratch files (`_notif-plan.md`, `_tree.txt`). |
| `npm run test` | NOT RUN — offline session has no DB/TSX runner. `tests/offline.test.ts` is the declared test entry. |
| DB reads/writes | ABSTAINED — no production/public DB access. No data modified. |

### Uncommitted (working tree) scope to review before commit
The 6 modified files carry the notification feature's second pass and must be committed together as ONE logical change (bell + fan-out + kitchen/waiter integration + status route). Ownership: refinement only; no behavior change to the non-notification surface.

