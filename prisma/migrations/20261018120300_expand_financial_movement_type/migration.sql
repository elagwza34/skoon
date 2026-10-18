-- Existing reversal type names exceed VARCHAR(30):
-- fixed_float_withdrawal_reversal is 31 characters. This is a widening-only
-- change; it neither rewrites nor removes posted ledger rows.
ALTER TABLE "financial_movements" ALTER COLUMN "type" TYPE VARCHAR(40);
