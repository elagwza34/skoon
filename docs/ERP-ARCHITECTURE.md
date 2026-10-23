# Skoon ERP architecture baseline

## Authoritative boundaries

The Next.js server and Prisma transactions are the authoritative writers. UI
state, polling, notifications, and Supabase client messages are never financial
or inventory records. Every branch-scoped write derives actor and branch from
the trusted staff session, not from a browser payload.

## Existing domains

- Sales: `Order`, `OrderItem`, `Payment`, status history and invoice services.
- Cash custody: `Shift`, `FinancialMovement`, `FinancialOperation`.
- Inventory: `InventoryItem`, `Recipe`, `RecipeItem`, `InventoryTransaction`.
- New pending inventory extension: `InventoryBatch`, `InventoryReservation`,
  `InventoryBatchAllocation`, `WasteEvent`, `EmployeeAccountability`.

## Inventory event flow after migration

1. Draft/unsent order: no inventory change.
2. Kitchen dispatch: create active reservations under stock row locks.
3. Kitchen preparation: record attributed preparer only.
4. Serving: convert only active reservation rows into immutable consumption
   movements, FEFO physical allocations and FIFO cost allocations.
5. New-order cancellation: release reservation.
6. Preparing cancellation: convert reservation to waste; create proposed
   employee accountability, never a payroll deduction.

Legacy stock remains outside automated consumption until a documented opening
batch exists. This intentionally fails closed rather than fabricating cost.

## Design constraints

- FinancialMovement is not a general ledger; adding ERP accounting requires a
  separate balanced journal model and event-posting adapter.
- Operational shifts are not HR attendance.
- Customer invoices remain full-payment only; supplier settlement policy is a
  separate future domain.
- One branch is operational, but all domain tables retain branch scoping.
