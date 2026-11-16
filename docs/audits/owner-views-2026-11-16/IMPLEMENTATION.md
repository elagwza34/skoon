# Owner orders and invoices — implementation

## Requested behavior

The Owner's `/orders` page now uses a dedicated read-only open-order board. Kitchen preparation stages remain in `/kitchen`; the generic operational order controls remain available to their existing non-Owner roles.

Open means an unarchived, non-cancelled invoice with a positive remaining balance. Served/unpaid orders and partial payments remain visible. Fully settled and archived invoices do not enter this queue, including through selected-order links. Source invoices are not capped to a recent order window.

Every row has a details button. Its modal displays item quantities, variant/modifier snapshots, notes, prices, discounts, tax, total, paid amount and outstanding balance. It contains no edit, payment, preparation, cancellation or deletion controls. The existing modal handles focus containment, Escape, focus restoration and body scroll locking.

## Invoice filtering and totals

- One period controls both rows and four summary cards: Cairo today, the last seven calendar days, the current calendar month, custom dates, or all history.
- All date filtering uses invoice creation time, explicitly labelled in the UI. It does not represent cash received on a different payment date.
- Dates are validated; invalid/reversed/missing custom bounds block the results and export. A custom range includes at most 366 calendar days, matching the CSV endpoint.
- Paid classification uses settlement balance, not kitchen status. A served-but-paid invoice displays “مدفوعة”.
- Buckets are exclusive: archived/deleted first, cancelled second, then paid or open. Paid, cancelled and deleted cards show invoice face values; open shows the remaining amount to collect. Counts accompany each amount. These are invoice-state summaries, not bank/cash reconciliation.
- Search filters rows; it does not silently change period totals.
- CSV uses the same effective date range and excludes archived invoices from the paid export.
- New server invoice props replace the local snapshot, preserving the selected period.

No database schema or financial records were modified. Deleted invoices use the existing archival state.

## Verification

The full offline suite passed **447/447**. The new tests cover settlement filtering, old served/unpaid orders, selected-order page wiring, date ranges, exact-cent totals, status precedence and real CSV handler output.

The real browser harness passed **12 checks**, including both boards at mobile/desktop widths, read-only details, keyboard focus, date controls, displayed totals, paid badges, export parameters, and incoming prop refresh. Screenshots and fixture-only results are in this directory. No authenticated production session or financial write was used for testing.

Typecheck and lint passed. The final production build passed before integration. Independent review found no blocking issue. Period presets are evaluated for the current page snapshot; refresh the page or change the range after leaving it open across midnight.
