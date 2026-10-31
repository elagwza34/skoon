# Business Logic Audit

## Owner

Canonical role home and cross-branch scoping exist. Owner is intentionally read-only in direct Waiter/Kitchen operations in tested paths. Critical exception: invoice hard deletion provides unsafe financial mutation power (FIN-001).

## Manager

Supervisory pages and permissions exist, but operational shift policy is contradictory (AUTH-001). Decide whether Manager is exempt, then align pages, writers, comments, and tests.

## Cashier

Server-side settlement, electronic confirmation, row locks, and idempotency are strong. Global discount eligibility is broken (FIN-002), invoice editing bypasses inventory (INV-001), and hard deletion breaks immutability.

## Waiter

- Unified POS cart modal and table-isolated drafts are covered by offline tests.
- Table Workspace supports multiple active orders and collapsible order details.
- Variants/modifiers and item adjustment services exist.
- Ready-item serving from the legacy/current Waiter board targets a missing API route (OPS-001).
- `waiter-board.tsx` remains a large mixed-responsibility client module with stale route contracts.

## Kitchen

Item-level prepared/served quantities, legal transitions, waste, and notifications are represented. No browser or database integration test was run, so realtime behavior, timers, priority, and cancellation delivery remain unverified.

## QR ordering

Table token lookup, branch product filtering, server price lookup, transaction creation, and safe status response are present. Product variants/modifiers are not accepted by `src/lib/public-orders.ts:8-24`; if public menus display them, the public checkout contract is incomplete. Abuse/rate limiting is absent (SEC-002).

## Inventory/finance interaction

Canonical Waiter adjustment logic is inventory-aware, while Cashier invoice editing is not. There must be one lifecycle-aware mutation service shared by role-specific authorization wrappers.

## UI/UX and printing

Arabic RTL and responsive Tailwind patterns are widespread. Build output shows manageable first-load sizes (largest listed page `/staff` 124 kB; shared 103 kB), but no device testing was performed. Receipt uses an 80mm-oriented preview and `window.print()`; silent printing and XP80TS compatibility require kiosk/local bridge and physical testing.
