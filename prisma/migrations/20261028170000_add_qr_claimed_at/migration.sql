-- Migration: add-qr-claimed-at-to-orders
-- Date: 2026-10-28
-- Description: Add qr_claimed_at column to orders table (additive)
-- Safety: No data changes, additive only, no destructive operations.

-- Add qr_claimed_at column to orders
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "qr_claimed_at" TIMESTAMP WITHOUT TIME ZONE;
