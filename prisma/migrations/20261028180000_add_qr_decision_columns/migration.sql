-- Migration: add-qr-decision-columns-to-orders
-- Date: 2026-10-28
-- Description: Add qr_approved_at, qr_rejected_at, qr_decision_by columns to orders table (additive)
-- Safety: No data changes, additive only, no destructive operations.

-- Add QR decision columns to orders
ALTER TABLE "orders"
  ADD COLUMN "qr_approved_at" TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN "qr_rejected_at" TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN "qr_decision_by" UUID;
