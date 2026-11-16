# Owner orders and invoice views

**Goal:** Make the Owner orders tab a read-only list of open unsettled orders, and make invoice date filters, status labels and period totals accurate.

**Authorized design:** The user's request specifies open unpaid orders, read-only detail modal, kitchen preparation stages in Kitchen monitoring, working invoice date selection, no false open badge on paid invoices, and four period total cards. Retain existing styles and modal primitives. No financial data migration or write is needed.

**Definitions:** Open orders exclude cancelled/archived records and require an actual remaining invoice balance, including partially paid and served/unpaid orders. Invoice cards and rows share Cairo creation-date bounds: today, trailing seven calendar days, current month, custom or all. Archived invoices are the existing deleted category. Paid/cancelled/archived cards show invoice values; open shows outstanding balance. These are invoice-state summaries, not bank reconciliation.

- [x] Add failing open-order and owner page wiring tests, then implement Owner-only read-only orders board with detail modal.
- [x] Add failing invoice classification/range/total tests, then fix invoice component and date/export controls.
- [x] Check desktop/mobile dialog behavior, filter results, status badges and totals with synthetic browser fixtures.
- [x] Integrate regression suites; run full tests, lint, typecheck and build; review the changes.
- [ ] Commit and push the authorized changes, verify production deployment and public/auth boundary checks.

Existing non-owner order controls, kitchen workflows and permission checks stay in their current components. Selected-order links never override the Owner open-order rule.

Integration verification: 447 offline tests, 12 browser checks, typecheck, lint and production build passed. The authorized Git and hosting integration is recorded in the final response; no financial data mutation or schema migration is required.
