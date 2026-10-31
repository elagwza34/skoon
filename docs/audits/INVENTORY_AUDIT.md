# Inventory Audit

## Strengths

- Reservations separate availability from physical stock.
- Item and batch rows are locked during reservation/consumption.
- Consumption and waste write inventory movements and allocations.
- Partial release is proportional; serving consumes only remaining reservations.
- Prepared cancellation can create waste and employee accountability.
- Order-item adjustment uses an advisory lock plus row locks and audit events.

Primary evidence: `src/lib/staff-inventory-engine.ts:29-180,195-295`, `src/lib/staff-order-item-adjustment.ts:116-194`, `src/lib/staff-inventory-write.ts:83-139`.

## INV-001 — P1 — Invoice edits bypass reservations

The cashier invoice writer directly creates/updates order items and only recalculates money. It neither checks prepared/served quantities nor calls reserve/release/consume logic. This creates a second mutation path with different invariants.

## Other verification gaps

- No isolated PostgreSQL run covered concurrent reservation, preparation, serving, cancellation, variant replacement, stock count, or waste idempotency.
- Database CHECK constraints for non-negative quantities/status transitions were not comprehensively present in the Prisma model; service checks remain the main boundary.
- Served returns intentionally require a correction workflow and must not automatically restock.

## Required matrix

Test each of increase, decrease, partial decrease, variant replacement, cancellation, serving, and return in states new/preparing/partially prepared/ready/partially served/paid/cancelled, including two concurrent actors. Assert order totals, reservations, physical stock, cost batches, waste, accountability, audit logs, and kitchen/cashier views in one test transaction.
