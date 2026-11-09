# SOKOON — Financial Risk Register

**Source:** Phase 0 audit of `D:\Projects-code\Sokoon`.
**Risk scale:** Impact (1–5) × Likelihood (1–5) = Score (1–25).
**Owner:** Financial Systems Architect (recommendation only; business accepts risk).

---

## Risk scoring

| Score | Band | Action |
|-------|------|--------|
| 1–4 | Low | Monitor; accept with documentation. |
| 5–9 | Medium | Mitigate in next release cycle. |
| 10–14 | High | Mitigate before production rollout of affected feature. |
| 15–25 | Critical | Do not deploy affected change until mitigated. |

---

## Register

| # | Risk | Area | Impact | Likelihood | Score | Band | Current control | Recommended mitigation |
|---|------|------|--------|------------|-------|------|-----------------|----------------------|
| F-001 | Invoice hard deletion provides unsafe financial mutation power | Invoices | 5 | 3 | 15 | Critical | `invoiceDeletionPolicy` guards; DELETE soft-archives only | Keep soft-archive only; never expose hard delete. Review BATCH_2 findings. |
| F-002 | Global discount eligibility broken | Invoices | 4 | 3 | 12 | High | `editSchema` line_discount has `eligibleForInvoiceDiscount` flag | Verify `financials` action respects eligibility; add server-side revalidation. |
| F-003 | `recalculateInvoiceTotals` uses JS floating-point | Invoices | 4 | 4 | 16 | Critical | None on that code path | Replace with cent-integer arithmetic (`toCents`/`centsToAmount`). |
| F-004 | Manager can establish fixed-float baseline (spec: Owner-only) | Fixed Float | 4 | 3 | 12 | High | `hasAtLeast(ROLE.MANAGER)` gate | Change to Owner-only per spec; document decision. |
| F-005 | Cashier close blocked by unsettled advances (spec: advances survive close) | Shifts | 4 | 3 | 12 | High | `assertCashierAdvancesSettled` blocks close | Decide: remove block (spec E2) or document as stricter policy. |
| F-006 | No Main Safe model; safe state inferred from movement types | Main Safe | 4 | 3 | 12 | High | Route exists; movement-type inference | Add `MainSafe` model or document account-type convention as authoritative. |
| F-007 | No Financial Day model; no day close/reopen/snapshot | Financial Day | 4 | 3 | 12 | High | None | Add `FinancialDay`/`DayClosing` models; Owner-only close/reopen. |
| F-008 | No Expense model | Expenses | 3 | 3 | 9 | Medium | None | Add `Expense` model with category/reason/shift/amount. |
| F-009 | No Shortage/Surplus blocking workflow at shift open | Shifts | 4 | 3 | 12 | High | `cashDifference` computed but no blocking | Add `Shortage`/`ShortageEvidence`; block open until evidence submitted. |
| F-010 | `FinancialMovement` source/destination are strings (no FK balance constraint) | Ledger | 3 | 3 | 9 | Medium | Application-level validation | Add DB check constraint or application invariant tests. |
| F-011 | No drawer-to-safe deposit initiation | Main Safe | 3 | 3 | 9 | Medium | Route lacks deposit action | Add deposit initiation + Owner confirmation + pending-transfer accounting. |
| F-012 | Electronic payment duplicate reference per branch+method | Payments | 2 | 2 | 4 | Low | Query check in `confirmElectronicPayment` | Accept; monitor. |
| F-013 | `FinancialOperation` idempotency prevents double posting | Payments/Float | 1 | 1 | 1 | Low | Unique constraint + fingerprint | Accept; verified by tests. |
| F-014 | `CashHandover` PENDING not spendable until accepted | Shifts | 2 | 2 | 4 | Low | Status gate | Accept; verified. |
| F-015 | Refund recognized statuses reduce refundable balance | Refunds | 3 | 2 | 6 | Medium | `refund-accounting.ts` helpers | Accept; add integration test for over-refund rejection. |
| F-016 | Invoice PATCH was 405 (blocked discount edits) | Invoices | 3 | 2 | 6 | Medium | Fixed in commit `872cb3d` | Verify regression tests cover discount PATCH. |
| F-017 | No cross-branch balance contamination guard at DB level | Multi-branch | 3 | 2 | 6 | Medium | `branchId` + `staffCanAccessBranch` | Add RLS or application tests for cross-branch access. |
| F-018 | No currency field; single currency assumed | Ledger | 1 | 1 | 1 | Low | All amounts NUMERIC(10,2) | Document assumption; add currency if multi-currency needed. |

---

## 10. Top critical risks (score ≥ 15)

| # | Risk | Score | Why critical | Required action before rollout |
|---|------|-------|--------------|------------------------------|
| F-001 | Unsafe invoice hard deletion | 15 | Could destroy financial history | Confirm soft-archive only; no hard delete endpoint. |
| F-003 | Floating-point invoice totals | 16 | Silent cent-level drift in invoices/tax | Replace with cent-integer math. |
| F-004 | Manager baseline authority (spec violation) | 12 | Non-Owner can set float baseline | Change gate to Owner-only. |
| F-005 | Close blocked by advances (spec conflict) | 12 | Cashiers cannot close shifts with open advances | Resolve spec vs. code; document decision. |
| F-006 | No Main Safe model | 12 | Safe balance not explicitly tracked | Add model or document convention. |
| F-007 | No Financial Day model | 12 | No day close/reopen/snapshot | Add models per spec G1–G5. |
| F-009 | No shortage blocking at shift open | 12 | Shortages not captured/blocked | Add Shortage/Evidence workflow. |

---

## 11. Accepted risks (monitor only)

- F-012, F-013, F-014, F-018: Low score; existing controls adequate.
- F-015: Medium; add integration test coverage.

---

*End of FINANCIAL_RISK_REGISTER.md.*