-- Production recovery candidate: missing waiter operational tables.
-- Additive only. Never run through `prisma db push`.
--
-- Preconditions before approval/execution:
--   1. Confirm the target project and an available PITR/backup restore point.
--   2. Re-run the read-only catalog query in the incident runbook.
--   3. Confirm all three relations below are absent and the referenced tables
--      (`orders`, `branches`, `cafe_tables`, `shifts`, `users`) exist.
-- This transaction fails closed on a partial schema instead of silently
-- accepting a potentially incompatible relation.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.order_responsibility_history') IS NOT NULL
     OR to_regclass('public.order_table_transfers') IS NOT NULL
     OR to_regclass('public.waiter_shift_handovers') IS NOT NULL THEN
    RAISE EXCEPTION 'Waiter recovery aborted: an operational waiter relation already exists; inspect its shape before any repair.';
  END IF;

  IF to_regclass('public.orders') IS NULL
     OR to_regclass('public.branches') IS NULL
     OR to_regclass('public.cafe_tables') IS NULL
     OR to_regclass('public.shifts') IS NULL
     OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Waiter recovery aborted: a required base relation is missing.';
  END IF;
END $$;

CREATE TABLE "order_responsibility_history" (
  "id" BIGSERIAL PRIMARY KEY,
  "order_id" BIGINT NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "assigned_to" UUID,
  "assigned_by" UUID NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "source" VARCHAR(30) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_responsibility_history_source_valid"
    CHECK ("source" IN ('manual_create', 'qr_claim', 'manager_reassign', 'shift_handover', 'legacy_reconcile')),
  CONSTRAINT "order_responsibility_history_order_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_responsibility_history_branch_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_responsibility_history_assigned_to_fkey"
    FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "order_responsibility_history_assigned_by_fkey"
    FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "order_responsibility_history_order_created_idx"
  ON "order_responsibility_history" ("order_id", "created_at");
CREATE INDEX "order_responsibility_history_branch_assigned_created_idx"
  ON "order_responsibility_history" ("branch_id", "assigned_to", "created_at");

CREATE TABLE "order_table_transfers" (
  "id" BIGSERIAL PRIMARY KEY,
  "order_id" BIGINT NOT NULL,
  "branch_id" BIGINT NOT NULL,
  "from_table_id" BIGINT NOT NULL,
  "to_table_id" BIGINT NOT NULL,
  "transferred_by" UUID NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_table_transfers_distinct_tables" CHECK ("from_table_id" <> "to_table_id"),
  CONSTRAINT "order_table_transfers_order_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_table_transfers_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_table_transfers_from_table_fkey" FOREIGN KEY ("from_table_id") REFERENCES "cafe_tables"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_table_transfers_to_table_fkey" FOREIGN KEY ("to_table_id") REFERENCES "cafe_tables"("id") ON DELETE RESTRICT,
  CONSTRAINT "order_table_transfers_by_fkey" FOREIGN KEY ("transferred_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "order_table_transfers_order_created_idx" ON "order_table_transfers" ("order_id", "created_at");
CREATE INDEX "order_table_transfers_branch_to_table_created_idx" ON "order_table_transfers" ("branch_id", "to_table_id", "created_at");

CREATE TABLE "waiter_shift_handovers" (
  "id" BIGSERIAL PRIMARY KEY,
  "branch_id" BIGINT NOT NULL,
  "sender_shift_id" BIGINT NOT NULL,
  "requested_by" UUID NOT NULL,
  "recipient_waiter_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "notes" VARCHAR(500),
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waiter_shift_handovers_status_valid" CHECK ("status" IN ('pending', 'accepted', 'cancelled')),
  CONSTRAINT "waiter_shift_handovers_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_shift_handovers_sender_shift_fkey" FOREIGN KEY ("sender_shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_shift_handovers_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_shift_handovers_recipient_fkey" FOREIGN KEY ("recipient_waiter_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_shift_handovers_distinct_participants" CHECK ("requested_by" <> "recipient_waiter_id")
);
CREATE INDEX "waiter_shift_handovers_branch_recipient_status_idx"
  ON "waiter_shift_handovers" ("branch_id", "recipient_waiter_id", "status");
CREATE INDEX "waiter_shift_handovers_sender_shift_status_idx"
  ON "waiter_shift_handovers" ("sender_shift_id", "status");
CREATE UNIQUE INDEX "waiter_shift_handovers_one_pending_per_sender_idx"
  ON "waiter_shift_handovers" ("sender_shift_id") WHERE "status" = 'pending';

-- These records are server-only Prisma data, never browser Data API resources.
ALTER TABLE "order_responsibility_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_table_transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "waiter_shift_handovers" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "order_responsibility_history", "order_table_transfers", "waiter_shift_handovers" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "order_responsibility_history_id_seq", "order_table_transfers_id_seq", "waiter_shift_handovers_id_seq" FROM PUBLIC, anon, authenticated;

COMMIT;
