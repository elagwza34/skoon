# Inventory reservation and batch cutover

The `20261023120000_inventory_reservations_batches_accountability` migration is
additive. It does not backfill historical orders, stock consumption, waste,
employee charges, or inventory batches.

## Safe deployment sequence

1. Back up the target database and run `prisma migrate status` against the
   **direct** connection. Do not apply this migration until prior migration
   status is known.
2. Deploy the migration with `prisma migrate deploy` in a maintenance window.
3. For every tracked item that has historical `current_stock`, record an
   authorised opening receipt with its documented quantity, acquisition cost,
   and expiry date where known. This creates an `InventoryBatch`.
4. Reconcile the item's physical stock to the sum of its opening/receipt batch
   quantities before dispatching recipe or packaged-product orders.
5. Only then enable recipes or `products.inventory_item_id` for that item.

## Rollback

The migration is additive. If a deployment must be rolled back, deploy the
previous application version and stop creating new reservations. Do **not**
drop the new tables once they contain movements or accountability records;
preserve them for audit and use a forward corrective migration after review.

## Why opening layers are required

Reservations and consumption fail closed when usable batch quantities or FIFO
cost layers are insufficient. The system will not manufacture a historic
purchase cost from a current selling price or a later receipt. This protects
FIFO valuation but means legacy tracked stock needs an explicit reconciliation.

## Accounting rules

- Dispatch creates an `active` reservation; it does not change physical stock.
- `available = current_stock - active reservations`.
- Kitchen acceptance attributes preparation to the employee.
- Service converts a reservation to immutable `consumption` movements.
- `POST /api/staff/orders/:id/status` with `action: "serve_items"` consumes
  only the requested, not-yet-served quantities. The order is marked served
  only when all non-voided lines are fully served.
- A cancellation while still `new` releases the reservation; a cancellation
  after `preparing` converts it to `waste` and creates accountability for the
  attributed preparer where one exists.
- Physical selection is FEFO (earliest valid expiry), while independent cost
  allocations use FIFO receipt order. Both allocations are persisted.
- Accountability is not a payroll deduction. Payroll deductions need separate
  legal approval and must not exceed the remaining approved balance.
