# Immutable Refund Accounting Architecture

## P0 decision

The prior refund implementation changed completed `payments.status` to
`refunded`. That changes historic collection facts, retroactively changes a
closed shift's computed cash-flow inputs, and cannot say when or from where
money was returned. The refund endpoint is therefore feature-gated with HTTP
503 until the additive `payment_refunds` migration and isolated PostgreSQL
coverage are approved.

## Proposed event model

`payments` remains the immutable collection event (`status = completed`). Each
refund is a separate `payment_refunds` row tied to exactly one original payment
and order. Recognized accounting states are `recorded` and
`externally_confirmed`; `requested`, `failed`, and `reversed` do not reduce net
revenue. `funding_source` distinguishes `cashier_till`, `main_safe`, and
`external`. Pending (`requested`) events reserve their amount while they await
resolution, preventing concurrent requests from exceeding the original
collection; `failed` and `reversed` events release the reservation.

Cashier-till refunds require an open current shift and a common financial shift
lock before the order/payment locks. They create an immutable
`financial_movements` cash-out linked to that **current** shift. Main-safe and
external refunds must not link to a cashier till. External `recorded` means an
internal accounting record only; it is not proof that a card/gateway reversal
has settled.

## Required follow-up implementation

The migration is intentionally not applied. After it is present, implement the
write path in one transaction: acquire till lock (if any), lock order, acquire
a stable payment-scoped advisory lock, lock the original payment/refund rows,
enforce `sum(recognized refunds) + requested <= original payment`, insert the
refund event and idempotency record, create a till movement where applicable,
and audit it. Do not update the original payment. Lock order is shift, order,
payment; non-till refund uses order, payment. Composite foreign keys in the
proposed migration prevent an event from referencing an order, payment, or
shift in a different branch.

Reports/VAT/invoices must derive collections from completed payments and
refunds from recognized refund events. Legacy `payments.status = refunded`
rows remain historical compatibility records and must not be backfilled or
reclassified automatically. A data-contract decision is still needed for their
unknown funding source and refund timestamp.

## Release status

**NO-GO.** This migration is additive but requires verified recovery,
migration-history reconciliation, an approved isolated database, database-level
concurrency tests, and report/VAT/invoice integration before any deployment.
