# Implementation Roadmap & Backlog (Phases C–E)

**Subject:** Skoon cafe management system — phased implementation plan
**Date:** 2026-10-15 · **Mode:** Audit / plan-only
**Constraint:** audit + plan only — **no source/schema/migration/test/git changes** in this session. Docs are the deliverable.

## 1. Purpose

This is the authoritative roadmap for remaining implementation, grounded in the verified current state (inventory doc is the source of truth). Item #25 (Notifications) is the one feature already implemented and committed in this branch; it is excluded from the backlog because it is done.

## 2. Phase C — Financial & inventory business rules (missing-feature spec)

### Finding (MISSING + models)

| Missing feature | Models | Current state | Business rationale |
|----------------|--------|---------------|-------------------|
| Expense capture & income ledger | `Expense`, `Income` | none | Profit = income − (COGS + expenses). Without an expense/income ledger, operating profit is not auditable. |
| Purchasing & stock counts | `Supplier`, `StockCount` (needed: `PurchaseOrder`) | none | Chef/inventory management needs purchases + physical stock counts and variance (book vs actual). |
| Waste tracking | (optional `Waste` log) | none | Cost control and COGS accuracy. |
| Stock transfers (cross-branch) | `InventoryTransfer` | none | Multi-branch scaling; transfers must be atomic + branch-scoped. |
| Cash register / till | `CashRegister` | none | Daily cash reconciliation (till count ↔ POS cash ledger) is a required control for payments (Phase C). |
| Reservations | `Reservation` | none | Table utilization; future growth. |

### Recommended business rules (Phase C spec)

- **Payments (existing, verified):** no partial payments — every `finalize` covers the full outstanding balance; `outstanding = total − completed payments`. Any attempt to finalize when outstanding ≠ 0 is rejected (409). Refund marks all completed payments `refunded`; `paymentStatus = 'refunded'`. **External money movement is a manual operator step** (the API must never claim funds left the business; receipt/text says "استرداد داخلي مس Logged" / internal registration only).
- **Cash reconciliation (new, Phase C):** a `CashRegister` row per branch+till, seeded at shift open; `cash_in` (collected) and `cash_out` (drawer restock) recorded; daily reconciliation compares expected collections vs actual till count.
- **Rate/price:** `Product.price` serialized to `string` (Decimal); unit price computed server-side, never client. Discounts exist as `Discount`/`DiscountRedemption` but have no UI — treat as Phase D.
- **COGS/costing:** `Recipe`/`RecipeItem` exist (materialized ingredients per product); a costing query per product/branch can be derived, but formal "menu costing" is Phase E.
- **Shifts (modeled only as page):** `shifts/page.tsx` exists but there is **no `Shift` model** and no `staff-shifts.ts` service. Phase C must add `Shift` + staffing rules **before** any scheduling UX is built.

## 3. Phase D — Core financial & inventory feature implementation

Ordered by dependency. Each declares inputs, outputs, owners, acceptance criteria.

| Phase | Deliverable | Key new/changed models | Owner | Acceptance criteria |
|-------|-------------|------------------------|-------|---------------------|
| D1 | Shift schedule + closing | `Shift`, `ShiftStaffing` | manager | Shifts have open/close dates; closing computes shift ledger (income/expenses) and resets daily cash register; auditable. |
| D2 | Cash reconciliation | `CashRegister`, reconciliation journal | cashier+ | Daily till count <-> ledger; out-of-reconciliation volume is flagged, not silently accepted. |
| D3 | Expense & income ledger | `Expense`, `Income`, `PurchaseOrder` | manager | Journal create (expense, purchase, income); credits/debits; period report. |
| D4 | Purchasing & stock | `Supplier`, `PurchaseOrder`, `StockCount` | manager | Purchase orders created, received into stock (with cost), stock counts record variance. |
| D5 | Waste tracking | `Waste` | kitchen+ | Waste events recorded per product with reason; reported as % of COGS. |
| D6 | Cross-branch transfers | `InventoryTransfer` | manager | Transfer moves stock between branches atomically; decrements source, increments target. |
| D7 | Discounts/promotions (UI) | `Discount`, `DiscountRedemption` | manager | Promo applied at order time; redemption tracked; not applied twice to one order. |
| D8 | Loyalty redemption (UI) | `DiscountRedemption` | waiter/cashier | Points balance shown on customer profile; redemption applied at checkout. |

## 4. Phase E — Reporting & finishing touches

- **Profitability report** (revenue − COGS − expenses) per branch/day/week, using `Order`, `InventoryTransaction`, `Expense`, `Income`; via time+branch+role aggregation.
- **Menu costing** from `Recipe`/`RecipeItem` + current ingredient costs.
- **Cash register / till closing report** daily + monthly.
- **Loyalty analytics** (active customers, redemption trends) via `DiscountRedemption` + customer table.
- **UX hardening:** migrate notifications from 20s polling to a Server-Sent Events (SSE) endpoint (one small, low-risk refactor); add tests for the new financial/inventory services; update docs.

## 5. Preservation list (keep as-is)

The following are **verified working** and must not change except for strictly necessary, backward-compatible fixes:

- Core ops: `(app)/dashboard`, `(app)/orders`, `(app)/kitchen`, `(app)/waiter`, `(app)/pos` — real-DB boards with send-to-kitchen and lifecycle fan-out (Notifications #25).
- Payments: `pay/route.ts`, `staff-payments-write.ts` (no partial payments; internal refunds only).
- Inventory core: `staff-inventory.ts` + `staff-inventory-write.ts` (items, movements, costing via `Recipe`).
- RBAC: `authz.ts` + `route-access.ts` + `require-page-access.ts` (server page guards).
- Notifications: bell + routes + `notifications.ts` (atomic fan-out).

## 6. Improvement list (improve without new features)

1. **Typecheck gate:** `tsc --noEmit` passes; keep it green on every PR (CI).
2. **Real-time notifications:** migrate the live bell from 20s polling + client fetch to an SSE endpoint (no extra DB); polling must not ship as "live".
3. **Seed parity:** `prisma/seed.ts` must seed financial/inventory fixtures (`Recipe` ingredients, discount catalog, default cash registers) so D1–D8 demo end-to-end.
4. **Amount serialization:** audit every `{amount: string}` vs `Decimal` boundary to avoid float drift in reports.
5. **Authorization regression:** audit a sample of every `staff-*-write.ts` (already branch-scoped + role-gated); add regression tests for owner cross-branch access.

## 7. Recommended phase sequence (dependencies)

```
C (rules spec) -> D1 (shifts) -> D2 (cash reconcile) -> D3 (ledger) -> D4 (purchase/stock)
-> D5 (waste) -> D6 (transfers) -> D7 (discounts UI) -> D8 (loyalty UI) -> E (reports + SSE + tests)
```

Dependencies: D1 precedes D2 (shift close produces the cash ledger); D3 depends on D2 (journal format). D4–E have no strict code ordering but D-stage order reflects "shipable value". D7/D8 depend on `Discount`/`DiscountRedemption` models (present, UI missing).

## 8. Owner-approval business decisions (recorded)

1. **No partial payments.** Every finalize covers the full remaining balance; outstanding=0 mandatory. *Rationale:* simplifies cash handling; incompatible with "tip"/"downgrade partial" today. If needed later, allocate the payment into multiple money movements.
2. **Refund = internal-only mark.** The API flips `Payment.status='refunded'` and `order.paymentStatus='refunded'`; it never claims external funds left. External cash/card reversal is a separate manual operator step. *Rationale:* prevents overstating money movement; receipt says "internal registration".
3. **Branch scoping model.** Single-tenant today (one branch per user). Owner sees all; staff see own. Multi-branch membership is a future model change (and breaks `branchId: BigInt(session.branchId)` assumptions). *Rationale:* keep model simple; transfer features are branch-aware but single-tenant.
4. **Shift model first.** Add `Shift` + `ShiftStaffing` before any scheduling UI; `shifts/page.tsx` currently has no backing model. *Rationale:* avoids building UI against an unimplemented schema.
5. **"Live" = SSE, not polling.** The first routing decision is an SSE endpoint so the bell is truly live without 20s polling. *Rationale:* "live" is ambiguous; shipping polling as "live" blocks a small, reversible refactor.

## 9. Summary scorecard

| Milestone | Status |
|-----------|--------|
| Denominators (core ops + images) | Complete; backlog only for new/finishing items |
| Notifications (feature #25) | DONE — committed in branch |
| Financial/inventory business rules | Undefined (Phase C spec) |
| Financial/inventory features | Below |
| Reports (profitability/longevity) | Partial |
| Real-time push transport | Partial (polling only) |
| Tests | Not run (offline, no DB) |

