-- Migration: add-username-to-user
-- Date: 2026-10-28
-- Description: Add username column to users table (additive, unique index)
-- Safety: No data changes, additive only, no destructive operations.

-- Add username column to users table
ALTER TABLE "users"
  ADD COLUMN "username" VARCHAR(40);

-- Add unique constraint on username (nullable - allows multiple NULLs)
CREATE UNIQUE INDEX "users_username_key" ON "users" ("username");
