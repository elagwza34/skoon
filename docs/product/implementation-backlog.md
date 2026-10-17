# Implementation Backlog (Phases C–E)

**Subject:** Skoon cafe management system — prioritized backlog
**Date:** 2026-10-15 · **Mode:** Audit / plan-only
**Order rule:** `I` = now (blocks later phases), `N` = next, `P` = later. Priority is driven by dependency + business value; NOT by implementation ease.

## 1. Priority overview

| Priority | Count | Theme |
|----------|-------|-------|
| I (Now) | 6 | Financial & inventory controls — required before reporting is trustworthy and before Phase E reports. |
| N (Next) | 5 | Sales-levers business features (discounts, loyalty) + host hardening (SSE, seed, CI). |
| P (Later) | 6 | Reporting/costing/analytics + future-scaling items (multi-branch, reservations). |

## 2. Detailed backlog

### I-01 — Shift schedule + closing
- **Priority:** I · **Phase:** D1
- **Description:** Add a `Shift` model (open/close datetime, status) and `ShiftStaffing` (who works which shift/role). Closing computes the shift ledger (income + expenses) and resets the daily cash register.
- **Business value:** Anchor for everything else — daily profit, tie-outs, and the cash register exist only relative to a closed shift.
- **Effort:** Medium
- **Dependencies:** none (blocks all of D2–E reporting)
- **Acceptance:** Shifts can be opened/closed; closing produces an auditable shift ledger; cash register resets to seed.

### I-02 — Cash reconciliation (till)
- **Priority:** I · **Phase:** D2
- **Description:** `CashRegister` per branch+till, seeded at shift open; `cash_in` (collected) and `cash_out` (restock). Daily: actual till count vs ledger → variance flagged.
- **Business value:** Required control for payments (per spec). Without it, cash inflows/outflows are not auditable.
- **Effort:** Medium
- **Dependencies:** I-01 (shift close resets the register)
- **Acceptance:** Till count reconciles or variance > tolerance is flagged to the operator; journal is immutable.

### I-03 — Expense & income ledger
- **Priority:** I · **Phase:** D3
- **Description:** `Expense`, `Income`, `PurchaseOrder` models + journal CRUD. Credits/debits per period; report period income statement.
- **Business value:** Makes operating profit auditable (profit = income − COGS − expenses). Required before profitability reports (Phase E).
- **Effort:** Medium
- **Dependencies:** I-02 (journal format)
- **Acceptance:** Journal entries are created and immutable; period report totals match seeded/expected values.

### I-04 — Purchasing & stock counts
- **Priority:** I · **Phase:** D4
- **Description:** `Supplier`, `PurchaseOrder`, `StockCount`; receiving a PO increments stock with cost; stock count records variance.
- **Business value:** Core inventory control; protects COGS accuracy across branches.
- **Effort:** Medium

### P-01 — Profitability report (time/branch/role)
- **Priority:** P · **Phase:** E
- **Description:** Aggregation: revenue − COGS − expenses per branch/day/week; role-based rollup.
- **Business value:** Core owner/manager reporting.
- **Effort:** Medium
- **Dependencies:** I-01..I-03, I-05
- **Acceptance:** Report answers "branch over period" with source-of-truth traceability.

### P-02 — Menu costing from Recipe
- **Priority:** P · **Phase:** E
- **Description:** Per-product COGS from `Recipe`/`RecipeItem` + current ingredient costs.
- **Business value:** Menu pricing validation.
- **Effort:** Low–Medium
- **Dependencies:** I-05 (ingredient costs)
- **Acceptance:** Costing query returns per-product COGS consistent with materialized ingredients.

### P-03 — Cash register / till closing report
- **Priority:** P · **Phase:** E
- **Description:** Daily + monthly till closing summary (expected vs actual cash).
- **Business value:** Audit artifact for cash control.
- **Effort:** Low
- **Dependencies:** I-02, I-03
- **Acceptance:** Report reconciles at shift/period close.

### P-04 — Loyalty analytics
- **Priority:** P · **Phase:** E
- **Description:** Active customers, redemption trends via `DiscountRedemption` + customer table.
- **Business value:** Retention analytics.
- **Effort:** Low
- **Dependencies:** N-02
- **Acceptance:** Aggregates render; trends visible.

### P-05 — Multi-branch support (future-scaling)
- **Priority:** P · **Phase:** future
- **Description:** Allow staff to belong to multiple branches; refactor the `branchId` assumptions (breaks the single-tenant `branchId: BigInt(session.branchId)` pattern).
- **Business value:** If the cafe expands branches, this becomes required. **Not required now.**
- **Effort:** High
- **Dependencies:** I-06 (transfer already branch-aware)
- **Acceptance:** Staff can belong to N branches; UI is branch-scoped per-session.

### P-06 — Reservations
- **Priority:** P · **Phase:** future
- **Description:** `Reservation` model + booking UI; protects table utilization.
- **Business value:** Future growth; low ROI today.
- **Effort:** Medium
- **Dependencies:** none
- **Acceptance:** Reservation create/confirm/cancel; no double-booking.

## 3. Ordering rules

1. **I before N before P.** I items gate later reporting and ease.
2. **D-phase order is C → D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8 → E.** Deliberate: the shift model, cash reconciliation, and ledger must land before reporting can be trusted.
3. **N items can ship interleaved with D items** once their dependencies exist (e.g., N-04 seed whenever convenient).
4. **P items are outside the current roadmap scope** (they restate report work that needs D1–D3 first).

## 4. Notes

- `Shift`, `Expense`, `Income`, `Supplier`, `StockCount`, `InventoryTransfer`, `Waste`, `CashRegister`, `Reservation` are **not in the schema**; they must be added via migrations (out of scope for this audit session).
- The Notifications feature (#25) is **done** and therefore is **not** in this backlog.
- Effort estimates assume this codebase; a first implementation pass would take longer and should be treated as "rough order of magnitude" only.

- **Dependencies:** none
- **Acceptance:** PO create → receive → stock count; variance is visible; branch-scoped.

### I-05 — Waste tracking
- **Priority:** I · **Phase:** D5
- **Description:** `Waste` log (product, qty, reason, timestamp); reported as waste % of COGS.
- **Business value:** Cost control.
- **Effort:** Low
- **Dependencies:** I-04 (needs product/item costing)
- **Acceptance:** Waste events are recorded and summable; report shows waste %.

### I-06 — Cross-branch stock transfers
- **Priority:** I · **Phase:** D6
- **Description:** `InventoryTransfer`; atomic move between branches (decrement source, increment target); auditable.
- **Business value:** Multi-branch scaling; corrects stock imbalances.
- **Effort:** Medium
- **Dependencies:** none (single-tenant today, but branch-aware by design)
- **Acceptance:** Transfer idempotent & atomic; target/source totals consistent.

### N-01 — Discounts & promotions UI
- **Priority:** N · **Phase:** D7
- **Description:** UI to create/apply `Discount`/`DiscountRedemption` at order time; redemption tracked; double-apply blocked.
- **Business value:** Revenue control and marketing lever. (Models exist; only UI is missing.)
- **Effort:** Low–Medium
- **Dependencies:** none (models present)
- **Acceptance:** Promo applies, redemption tracked, double-apply blocked, server-side enforced.

### N-02 — Loyalty program UI
- **Priority:** N · **Phase:** D8
- **Description:** Points balance on customer profile; redemption at checkout.
- **Business value:** Customer retention; links to `DiscountRedemption` + customer table.
- **Effort:** Medium
- **Dependencies:** N-01 (or shared redemption model)
- **Acceptance:** Points balance visible; redemption applied at checkout; ledger recorded.

### N-03 — Notifications → real-time (SSE)
- **Priority:** N · **Phase:** host hardening
- **Description:** Migrate the bell from 20s polling to a Server-Sent Events endpoint (no extra DB).
- **Business value:** "Live notifications" requirement; low-risk, reversible, improves perceived reliability.
- **Effort:** Low
- **Dependencies:** none
- **Acceptance:** Bell updates within <1s of an event; badge stays honest; no polling loop.

### N-04 — Seed data parity
- **Priority:** N · **Phase:** prep for demo
- **Description:** Seed financial/inventory fixtures: `Recipe` ingredients, discount catalog, default cash registers, sample shifts.
- **Business value:** Demos/D1–D8 end-to-end without manual DB setup.
- **Effort:** Low
- **Dependencies:** none
- **Acceptance:** Seed runs cleanly; sample data covers D1–D8 happy paths.

### N-05 — CI typecheck + amount-serialization audit
- **Priority:** N · **Phase:** code hygiene
- **Description:** Add `tsc --noEmit` as a CI gate; audit every `{amount: string}` vs `Decimal` boundary for float drift.
- **Business value:** Prevents the #1 class of financial-report regressions.
- **Effort:** Low
- **Dependencies:** none
- **Acceptance:** `npm run typecheck` green on PR; amount boundaries documented + tested.
