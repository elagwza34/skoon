-- Inventory engine cutover.  Additive only: no historical stock, orders,
-- movements or payroll balances are rewritten.  Existing on-hand quantities
-- deliberately remain unlayered until an authorised opening-balance receipt is
-- recorded with a real cost and (where known) expiry date.

ALTER TABLE "products" ADD COLUMN "inventory_item_id" BIGINT;
ALTER TABLE "order_items" ADD COLUMN "prepared_quantity" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN "served_quantity" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "order_items" ADD COLUMN "preparation_started_at" TIMESTAMP(3);
ALTER TABLE "order_items" ADD COLUMN "preparation_started_by" UUID;
ALTER TABLE "inventory_transactions" ADD COLUMN "cost_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "inventory_transactions" ADD COLUMN "order_item_id" BIGINT;

CREATE TABLE "inventory_batches" (
  "id" BIGSERIAL NOT NULL,
  "inventory_item_id" BIGINT NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "original_quantity" DECIMAL(12,3) NOT NULL,
  "remaining_quantity" DECIMAL(12,3) NOT NULL,
  "remaining_cost_quantity" DECIMAL(12,3) NOT NULL,
  "unit_cost" DECIMAL(12,4) NOT NULL,
  "supplier_reference" VARCHAR(120),
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_batches_quantity_nonnegative" CHECK ("original_quantity" >= 0 AND "remaining_quantity" >= 0 AND "remaining_cost_quantity" >= 0)
);

CREATE TABLE "inventory_reservations" (
  "id" BIGSERIAL NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "order_item_id" BIGINT NOT NULL,
  "inventory_item_id" BIGINT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "consumed_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "released_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("quantity" > 0 AND "consumed_quantity" >= 0 AND "released_quantity" >= 0 AND "consumed_quantity" + "released_quantity" <= "quantity"),
  CONSTRAINT "inventory_reservations_status_valid" CHECK ("status" IN ('active', 'released', 'consumed')),
  CONSTRAINT "inventory_reservations_order_item_id_inventory_item_id_key" UNIQUE ("order_item_id", "inventory_item_id")
);

CREATE TABLE "inventory_batch_allocations" (
  "id" BIGSERIAL NOT NULL,
  "inventory_batch_id" BIGINT NOT NULL,
  "inventory_transaction_id" BIGINT NOT NULL,
  "allocation_type" VARCHAR(12) NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unit_cost" DECIMAL(12,4) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_batch_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_batch_allocations_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "inventory_batch_allocations_type_valid" CHECK ("allocation_type" IN ('physical', 'fifo_cost'))
);

CREATE TABLE "waste_events" (
  "id" BIGSERIAL NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "order_item_id" BIGINT,
  "responsible_id" UUID,
  "recorded_by" UUID,
  "quantity" DECIMAL(12,3) NOT NULL,
  "cause" VARCHAR(40) NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "cost_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waste_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "waste_events_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "employee_accountability" (
  "id" BIGSERIAL NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "employee_id" UUID NOT NULL,
  "waste_event_id" BIGINT,
  "amount" DECIMAL(12,2) NOT NULL,
  "waived_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "deducted_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "review_status" VARCHAR(30) NOT NULL DEFAULT 'pending_review',
  "legal_approved_at" TIMESTAMP(3),
  "reviewed_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_accountability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_accountability_waste_event_id_key" UNIQUE ("waste_event_id"),
  CONSTRAINT "employee_accountability_amounts_nonnegative" CHECK ("amount" >= 0 AND "waived_amount" >= 0 AND "deducted_amount" >= 0 AND "waived_amount" + "deducted_amount" <= "amount")
);

CREATE TABLE "accountability_waivers" (
  "id" BIGSERIAL NOT NULL,
  "accountability_id" BIGINT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "manager_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accountability_waivers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accountability_waivers_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "payroll_deductions" (
  "id" BIGSERIAL NOT NULL,
  "accountability_id" BIGINT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "payroll_period" VARCHAR(20) NOT NULL,
  "approved_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_deductions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_deductions_accountability_id_payroll_period_key" UNIQUE ("accountability_id", "payroll_period"),
  CONSTRAINT "payroll_deductions_amount_positive" CHECK ("amount" > 0)
);

CREATE INDEX "products_inventory_item_id_idx" ON "products"("inventory_item_id");
CREATE INDEX "order_items_preparation_started_by_idx" ON "order_items"("preparation_started_by");
CREATE INDEX "inventory_transactions_order_item_id_idx" ON "inventory_transactions"("order_item_id");
CREATE INDEX "inventory_batches_inventory_item_id_expires_at_received_at_idx" ON "inventory_batches"("inventory_item_id", "expires_at", "received_at");
CREATE INDEX "inventory_batches_inventory_item_id_received_at_idx" ON "inventory_batches"("inventory_item_id", "received_at");
CREATE INDEX "inventory_reservations_inventory_item_id_status_idx" ON "inventory_reservations"("inventory_item_id", "status");
CREATE INDEX "inventory_reservations_branch_id_status_idx" ON "inventory_reservations"("branch_id", "status");
CREATE INDEX "inventory_batch_allocations_inventory_batch_id_allocation_type_idx" ON "inventory_batch_allocations"("inventory_batch_id", "allocation_type");
CREATE INDEX "inventory_batch_allocations_inventory_transaction_id_idx" ON "inventory_batch_allocations"("inventory_transaction_id");
CREATE INDEX "waste_events_branch_id_created_at_idx" ON "waste_events"("branch_id", "created_at");
CREATE INDEX "employee_accountability_branch_id_employee_id_review_status_idx" ON "employee_accountability"("branch_id", "employee_id", "review_status");
CREATE INDEX "accountability_waivers_accountability_id_created_at_idx" ON "accountability_waivers"("accountability_id", "created_at");

ALTER TABLE "products" ADD CONSTRAINT "products_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_preparation_started_by_fkey" FOREIGN KEY ("preparation_started_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batch_allocations" ADD CONSTRAINT "inventory_batch_allocations_inventory_batch_id_fkey" FOREIGN KEY ("inventory_batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batch_allocations" ADD CONSTRAINT "inventory_batch_allocations_inventory_transaction_id_fkey" FOREIGN KEY ("inventory_transaction_id") REFERENCES "inventory_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waste_events" ADD CONSTRAINT "waste_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "waste_events" ADD CONSTRAINT "waste_events_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "waste_events" ADD CONSTRAINT "waste_events_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "waste_events" ADD CONSTRAINT "waste_events_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_accountability" ADD CONSTRAINT "employee_accountability_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_accountability" ADD CONSTRAINT "employee_accountability_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_accountability" ADD CONSTRAINT "employee_accountability_waste_event_id_fkey" FOREIGN KEY ("waste_event_id") REFERENCES "waste_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_accountability" ADD CONSTRAINT "employee_accountability_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accountability_waivers" ADD CONSTRAINT "accountability_waivers_accountability_id_fkey" FOREIGN KEY ("accountability_id") REFERENCES "employee_accountability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accountability_waivers" ADD CONSTRAINT "accountability_waivers_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_deductions" ADD CONSTRAINT "payroll_deductions_accountability_id_fkey" FOREIGN KEY ("accountability_id") REFERENCES "employee_accountability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- These are internal ERP tables in the exposed public schema. The application
-- uses its server-side database role; RLS prevents accidental Data API access
-- until deliberate policies are introduced.
ALTER TABLE "inventory_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_batch_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "waste_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_accountability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accountability_waivers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_deductions" ENABLE ROW LEVEL SECURITY;
