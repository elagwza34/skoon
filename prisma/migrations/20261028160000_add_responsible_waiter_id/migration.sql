-- Migration: add-responsible-waiter-id-to-orders
-- Date: 2026-10-28
-- Description: Add responsible_waiter_id column to orders table (additive)
-- Safety: No data changes, additive only, no destructive operations.

-- Add responsible_waiter_id column to orders
ALTER TABLE "orders"
  ADD COLUMN "responsible_waiter_id" UUID;
