# Skoon Feature Inventory

## Evidence scope

This is a source-code inventory, not a production certification. Local static
checks and offline tests previously passed; deployed parity is **UNKNOWN** until
the current local changes are deployed and retested. All protected pages use
the `(app)` layout, trusted Supabase identity, the `public.users` role row, and
server-side `canSeeRoute` checks. UI hiding is not the authorization boundary.

## Role map

| Role | Default route | Shift required | Workspace and access |
| --- | --- | --- | --- |
| Owner | `/dashboard` | No | All navigation and cross-branch authority |
| Manager | `/dashboard` | No | Permission-scoped admin/dashboard access; own branch |
| Cashier | `/cashier` | Yes | Full-screen cashier/POS workspace; `/shifts` exception |
| Waiter | `/waiter` | Yes | Full-screen waiter workstation; `/shifts` exception |
| Kitchen | `/kitchen` | Yes | Full-screen kitchen station; `/shifts` exception |

Operational roles are blocked by service guards without an open shift. Login
does not open a shift; logout does not close one. Pages use redirect guards;
staff APIs return `401` locally after the pending middleware change, `403` for
authorization/branch denial, and service-level shift conflicts normally use
`409`.

## Feature matrix

| Module | Feature | Status | UI route | API/service | Roles | Shift | Limits / evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | Email/password login, safe return path | COMPLETE | `/login` | `loginAction`, Supabase SSR | staff | no | No app-managed password persistence |
| Auth | Logout/session cookie refresh | COMPLETE | shell | `logoutAction`, middleware | staff | no | Logout does not close shift |
| Auth | Request correlation | PARTIAL | n/a | `middleware.ts` | n/a | no | Local change pending production deployment |
| Dashboard | sales, orders, tables, top products | COMPLETE | `/dashboard` | `dashboard-stats`, `manager-operations` | authenticated staff | role route | Live DB aggregates; production parity unknown |
| Navigation | permission-filtered sidebar/search | COMPLETE | app shell | `navigation.ts`, `route-access.ts` | owner/manager primarily | no | Operational boards are full-screen |
| Orders | staff order list, edit, cancellation/status | COMPLETE | `/orders` | `staff-orders`, order routes | `orders.view`/actions | operational roles yes | State checks and branch scope server-side |
| POS | cart, server pricing, create order | COMPLETE | `/pos` | `staff-pos-write`, `/api/staff/pos/orders` | cashier/payment permission | yes | Write operation; use isolated data |
| POS | table assignment and checkout UI | COMPLETE | `/cashier` | cashier workspace, payments | cashier | yes | Financial impact |
| Invoices | list, unpaid editing, settlement view | COMPLETE | cashier workspace | `staff-invoices` | payment permission | operational roles yes | Paid changes guarded server-side |
| Payments | cash/card/online records, idempotency | COMPLETE | `/orders`, `/cashier` | `staff-payments-write` | cashier+ | cashier shift | No external gateway implementation found; records still financial |
| Refunds | authorized refund/idempotency | BACKEND ONLY / PARTIAL UI | order/payment UI | `staff-payments-write` | manager+ | role policy | Treat as financial write; inspect role UI before use |
| Tables | table list, status, layout edit | COMPLETE | `/tables` | `staff-tables`, layout route | `tables.view`; layout owner | operational roles yes | QR print page at `/tables/print` |
| QR | public landing/type/table/menu/cart/track | COMPLETE | `/`, `/order-type`, `/select-table`, `/menu/[token]`, `/order/[id]` | `public-menu`, `public-orders` | public | n/a | Takeaway explicitly unavailable; submissions write orders |
| Waiter | workstation, tables, QR approval, serve items | COMPLETE | `/waiter` | `staff-waiter`, `staff-waiter-operations` | waiter/authorized manager | yes for waiter | Polling/refresh; branch and ownership checks |
| Waiter | handover/reconciliation readiness | PARTIAL | `/waiter`, dashboard panel | handover routes/readiness services | waiter/manager | yes for waiter | Legacy reconciliation is review/proposal oriented |
| Kitchen | queue, start/ready per item, timers | COMPLETE | `/kitchen` | order status service | kitchen permission | yes | No confirmed sound/print feature in source |
| Service requests | public request and staff claim/resolve | COMPLETE | waiter/dashboard panels | `staff-service-requests` | waiter/manager/owner by permission | operational roles yes | Requires migration; returns 503 if missing |
| Catalog | products, categories, availability | COMPLETE | `/products` | catalog/category write services | `menu.view/update` | operational roles yes | Writes affect ordering |
| Inventory | item/batch view and movement recording | COMPLETE | `/inventory` | `staff-inventory`, inventory write | view/manage | operational roles yes | Movement is manager+; branch scoped |
| Inventory | reservation/consumption engine | BACKEND ONLY | n/a | `staff-inventory-engine` | order workflow | yes where applicable | Must be tested only with isolated inventory data |
| Inventory | stock counts | COMPLETE | `/inventory` | stock count routes/service | inventory manage | role/service guard | Multi-step write workflow |
| Inventory | waste/accountability/waiver | COMPLETE | `/inventory` | waste/accountability routes | inventory manage/owner | role/service guard | Waste feature has idempotency feature flag |
| Shifts/attendance | open, close, cash reconcile, handover | COMPLETE | `/shifts` | `staff-shifts` | non-owner operational staff | n/a | `openedAt`/`closedAt` are attendance source |
| HR | employee directory, provision, archive/reactivate | COMPLETE | `/staff` | directory/employee/provision services | owner; some manager scope | no | Staff records are production-sensitive |
| HR | compensation/contracts/schedules | PARTIAL | `/staff` schedule board | HR routes/services | owner/manager per service | no | Contract/compensation APIs exist; verify UI controls per role |
| HR | leave/corrections | BACKEND ONLY | n/a | leave and attendance-correction APIs | role-specific | no | No dedicated page found |
| Financial | fixed float baseline, movement, reversal | COMPLETE | `/fixed-float`, `/fixed-float/baseline` | `staff-float` | settings manage | cashier operations need shift | Immutable ledger effects |
| Financial | advance settlement | COMPLETE | `/fixed-float/settlements` | `staff-float` | manager/authorized | no/defined by service | Do not use shared production float for exploration |
| Reports | sales, cash, product/order aggregates | COMPLETE | `/reports` | `staff-reports` | `reports.view` | no for manager/owner | Read-only UI |
| Customers | derived customer history | COMPLETE | `/customers` | `staff-customers` | `reports.view` | no | No standalone customer table/CRM |
| Settings | allowlisted branch settings | COMPLETE | `/settings` | settings service | settings manage | no | Writes are allowlisted, branch scoped |
| Notifications | bell, read state, polling | COMPLETE | shell/ops boards | notifications routes | staff | no | Polls every ~20 seconds |

## Explicitly absent or not confirmed

* No dedicated customer-account CRM; customer page is derived order history.
* No confirmed external payment gateway settlement integration.
* No confirmed kitchen sound notification or kitchen printing implementation.
* No dedicated leave/attendance-correction page, despite backend routes.
* No browser-engine or real-device acceptance evidence.
* Production deployment parity is unknown; current local pending middleware,
  domain, and security changes may not be live.

## Source anchors

Routes: `src/app/(app)`, `src/app/(public)`, and `src/app/api`. Access:
`src/lib/authz.ts`, `src/lib/route-access.ts`, `src/lib/session.ts`.
Operational services: `staff-orders`, `staff-pos-write`, `staff-payments-write`,
`staff-shifts`, `staff-waiter*`, `staff-inventory*`, `staff-float`, and
`staff-reports`. Schema/migrations: `prisma/schema.prisma`, `prisma/migrations`,
and `supabase/migrations`.
