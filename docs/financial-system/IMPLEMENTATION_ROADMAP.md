# SOKOON — Financial Implementation Roadmap

**Source:** Phase 0 audit + Requirements Gap Matrix + Financial Risk Register.
**Execution strategy:** Gates 0→4 (Audit → Design → Local implementation → Verification → Release review). No production DB, no migrations, no commits/pushes without explicit authorization.

---

## Gate 0 — Audit (COMPLETE)

Documents produced:
- `docs/financial-system/PHASE_0_AUDIT.md`
- `docs/financial-system/EXISTING_FINANCIAL_ARCHITECTURE.md`
- `docs/financial-system/REQUIREMENTS_GAP_MATRIX.md`
- `docs/financial-system/FINANCIAL_RISK_REGISTER.md`
- This roadmap.

Key findings:
- Rich existing financial surface (shifts, payments, fixed float, refunds, invoices, cash handover, accountability).
- Missing spec models: Main Safe, Fixed Float, Employee Advance, Expense, Financial Day, Day Closing, Shortage, Surplus, Shortage Evidence.
- Contradictions: Manager baseline authority (Owner-only per spec), cashier close blocked by advances (spec says advances survive close).
- Risk: floating-point invoice totals; unsafe invoice hard deletion.

---

## Gate 1 — Design (next)

Resolve contradictions and document minimal compatible architecture:

1. **Manager vs Owner fixed-float baseline**: Decide Owner-only (per spec C2/C4) and change `establishFixedFloatBaseline` gate from `hasAtLeast(ROLE.MANAGER)` to Owner-only.
2. **Cashier close with outstanding advances**: Decide per spec E2 (advances survive close; do not block close) vs. current blocking behavior.
3. **Model strategy**: Add dedicated Prisma models vs. extend `FinancialMovement` account-type approach. Recommendation: additive dedicated models for Main Safe, Fixed Float, Employee Advance, Expense, Financial Day, Day Closing, Shortage, Surplus, Shortage Evidence; keep `FinancialMovement` as the ledger mechanism.
4. **Floating-point fix**: Replace `recalculateInvoiceTotals` JS float math with cent-integer arithmetic.
5. **Drawer-to-safe deposit**: Add initiation + Owner confirmation + pending-transfer accounting.

Deliverable: Updated design notes + migration plan (additive only, dry-run on isolated DB).

---

## Gate 2 — Local implementation (safe, non-destructive, incremental)

### Phase 1 — Financial data model and invariants
- Add missing models (additive migrations only).
- Define cash location identity and balance ownership.
- Establish invariants: nonnegative cash, no double counting, no duplicate posting, no unbalanced transfers, no duplicate settlement, no role escalation, no historical mutation.
- DB constraints, FKs, indexes, transactions, concurrency controls.
- **Approval required:** Any migration.

### Phase 2 — Shared drawer and shift reconciliation
- Automatic expected balance carry-forward (A1).
- Mandatory physical count before opening (A2).
- Shortage evidence workflow with blocking (A3).
- Surplus pending-review (A4).
- Previous-cashier shortage attribution.
- Safe concurrent shift opening (advisory locks already exist).

### Phase 3 — Main Safe and cash transfers
- Owner-controlled Main Safe (fix Manager gate contradiction).
- Drawer-to-safe deposit initiation with pending transfer.
- Owner receipt confirmation; reconciliation; rejection/cancellation.
- Safe withdrawals by category (B3).
- Drawer↔safe↔float transfers.

### Phase 4 — Expenses, Fixed Float, Advances
- Categorized cashier expenses with immediate deduction (D).
- Multiple advances per employee; partial settlements (E).
- Owner settlement approval (fix Manager+ → Owner if spec requires).
- Returns to original cash source (E4).
- Settlements after shift closure (E5).
- Owner-only Fixed Float baseline change (fix C2 contradiction).

### Phase 5 — Financial Day close/reopen/corrections
- Independent financial day lifecycle (G1).
- Owner-only close/reopen (G4).
- Versioned immutable closing snapshots.
- Pending-item carry-forward (G2).
- Late transactions to current open day (G3).

### Phase 6 — Electronic settlements and refunds audit
- Verify existing implementation; no duplication (F6).
- Confirm electronic payments do not affect physical till.

### Phase 7 — Financial dashboard and reporting
- 20 required reports (safe balance, drawer balance, shift reconciliation, shortages, surpluses, pending transfers, expenses by category, float baseline, advances, settlements, liabilities, cash sales/refunds, electronic by method, settlement status, electronic refunds, day summaries, closed-day versions, reopening/correction history, full audit trail).

### Phase 8 — Security, concurrency, testing
- Unit tests: balance calculations, shortage/surplus, advance outstanding, partial settlement, expense classification, transfer accounting, day assignment, permission checks.
- Integration tests (isolated DB): concurrent cashier ops, duplicate payments/refunds/settlements, insufficient cash, shift boundary races, day close/reopen races, owner-only ops, unauthorized Manager/Cashier, cross-branch access, reversal consistency.
- Financial reconciliation tests: cash conservation across transfers, pending transfers not double counted, advances not expenses on disbursal, confirmed returns reduce liabilities once, surplus not revenue, shortage no auto payroll deduction, snapshots immutable, drawer continuity across shifts.
- Regression tests: existing cashier login/shift-open, `/cashier` dashboard, open/paid invoices, POS checkout, payment confirmation, refunds, waiter ordering, QR ordering, kitchen progression, inventory, fixed float, handovers, thermal printing.

### Phase 9 — Final validation and release readiness
- TypeScript type checking, linting, unit tests, integration tests, Prisma schema validation, migration consistency, local production build.
- Final working-tree diff inspection (no unrelated modifications, no missing auth, no duplicate postings, no race conditions, no unsafe arithmetic, no untracked migrations, no secrets, no destructive SQL).
- Produce final reports: `FINAL_IMPLEMENTATION_REPORT.md`, `FINANCIAL_TEST_RESULTS.md`, `FINANCIAL_RECONCILIATION_REPORT.md`, `SECURITY_AND_RBAC_AUDIT.md`, `RELEASE_READINESS_GATE.md`.
- GO / NO-GO recommendation (does not authorize deployment).

---

## Approvals required before Gate 2 implementation

| Item | Decision needed | Decider |
|------|----------------|---------|
| Migration approach | Additive models vs. FinancialMovement extension | Business + Architect |
| Fixed-float baseline authority | Owner-only vs. Manager+ | Business |
| Cashier close with advances | Block (current) vs. allow (spec E2) | Business |
| Isolated test DB URL | Provision for integration tests | Ops/Infra |
| Any production migration | Never without explicit approval | Business |

---

## Estimated sequence (subject to approval)

```
Gate 1 Design  →  Phase 1 Schema  →  Phase 2 Shifts  →  Phase 3 Main Safe
   →  Phase 4 Expenses/Float/Advances  →  Phase 5 Financial Day
   →  Phase 6 Electronic/Refunds audit  →  Phase 7 Reporting
   →  Phase 8 Testing  →  Phase 9 Release review  →  GO/NO-GO
```

---

*End of IMPLEMENTATION_ROADMAP.md.*