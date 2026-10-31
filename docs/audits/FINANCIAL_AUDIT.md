# Financial Integrity Audit

## Assessment: NOT READY

### FIN-001 — P0 — Hard deletion of invoices/payments

`src/app/api/staff/invoices/[id]/route.ts:12-25` permits an Owner to delete completed payment rows and the order itself. There is no settled-state prohibition, reversal entry, reason, idempotency key, or audit log. This must be disabled before production sign-off.

### FIN-002 — P1 — Incorrect global-discount eligible base

The UI and DB support excluding lines from a global discount, but `calculateInvoiceDiscounts` ignores the flag (`src/lib/invoice-discounts.ts:33-41`). The confirmed root cause fits the report that discounts differ by invoice composition. Existing tests include an ineligible line but assert the all-lines formula, so they preserve the defect rather than detecting it.

### INV-001 interaction — P1

Cashier invoice add/quantity operations recalculate money but bypass stock reservations and kitchen lifecycle (`src/lib/staff-invoices.ts:122-165`). A financially correct invoice can therefore be operationally incorrect.

## Strong controls

- Payment amount is server-calculated from outstanding balance.
- Non-cash collection requires explicit confirmation.
- Order row lock prevents simultaneous double settlement.
- Optional idempotency key has a persisted fingerprint/result record.
- Refund writer is documented as internal accounting, not proof of an external gateway refund.
- Ledger reversal concepts and unique reversal references exist.

## Remaining risks

- No database integration run confirmed payment/refund/shift/ledger behavior against the current schema.
- `Number(...)` remains in some reporting/display arithmetic; authoritative discount calculation uses integer cents.
- Partial payments are intentionally unsupported; UI and business documentation must state this.
- Settled records must become immutable at both API and database levels.

## Mandatory test cases

Mixed eligible/ineligible lines; item plus global discount; tax before/after policy; 100% and fixed discounts; concurrent settlement; idempotency replay/fingerprint conflict; refund/shift race; attempt to edit/delete settled invoices; report/receipt reconciliation to ledger totals.
