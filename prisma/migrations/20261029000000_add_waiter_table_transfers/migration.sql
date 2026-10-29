-- Migration: add-waiter-table-transfers
-- Date: 2026-10-29
-- Description: Add waiter_table_transfers table for waiter-to-waiter table
-- responsibility transfer requests during an active shift.
-- Safety: Additive only, no data changes, no destructive operations.

CREATE TABLE "waiter_table_transfers" (
  "id"                BIGSERIAL PRIMARY KEY,
  "branch_id"         BIGINT NOT NULL,
  "table_id"          BIGINT NOT NULL,
  "sender_waiter_id"  UUID NOT NULL,
  "recipient_waiter_id" UUID NOT NULL,
  "status"            VARCHAR(20) NOT NULL DEFAULT 'pending',
  "notes"             VARCHAR(500),
  "accepted_at"       TIMESTAMP WITHOUT TIME ZONE,
  "created_at"        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now(),

  CONSTRAINT "waiter_table_transfers_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_table_transfers_table_id_fkey"
    FOREIGN KEY ("table_id") REFERENCES "cafe_tables"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_table_transfers_sender_waiter_id_fkey"
    FOREIGN KEY ("sender_waiter_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "waiter_table_transfers_recipient_waiter_id_fkey"
    FOREIGN KEY ("recipient_waiter_id") REFERENCES "users"("id") ON DELETE RESTRICT,

  CONSTRAINT "waiter_table_transfers_status_check"
    CHECK ("status" IN ('pending', 'accepted', 'rejected', 'cancelled'))
);

CREATE INDEX "waiter_table_transfers_branch_id_table_id_status_idx"
  ON "waiter_table_transfers"("branch_id", "table_id", "status");

CREATE INDEX "waiter_table_transfers_branch_id_recipient_waiter_id_status_idx"
  ON "waiter_table_transfers"("branch_id", "recipient_waiter_id", "status");

CREATE INDEX "waiter_table_transfers_sender_waiter_id_status_idx"
  ON "waiter_table_transfers"("sender_waiter_id", "status");

-- PostgreSQL does not automatically index foreign-key columns. These leading
-- indexes keep referenced table/user deletes and integrity checks bounded.
CREATE INDEX "waiter_table_transfers_table_id_idx"
  ON "waiter_table_transfers"("table_id");

CREATE INDEX "waiter_table_transfers_recipient_waiter_id_idx"
  ON "waiter_table_transfers"("recipient_waiter_id");
