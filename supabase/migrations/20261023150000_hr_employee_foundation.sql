-- Additive HR foundation only. This migration is intentionally NOT applied by
-- application code. Review RLS policies and private-storage integration before
-- deploying it through the approved Supabase migration workflow.

CREATE TABLE "employee_profiles" (
  "id" BIGSERIAL PRIMARY KEY,
  "user_id" UUID NOT NULL UNIQUE,
  -- Owners are cross-branch and therefore have a NULL branch_id.
  "branch_id" BIGINT,
  "employment_status" VARCHAR(30) NOT NULL DEFAULT 'active',
  "employment_type" VARCHAR(30),
  "hire_date" DATE,
  "probation_start" DATE,
  "probation_end" DATE,
  "probation_status" VARCHAR(30),
  "probation_reviewed_at" TIMESTAMP(3),
  "probation_decision" VARCHAR(30),
  "personal_email" VARCHAR(150),
  "personal_phone" VARCHAR(30),
  "address" VARCHAR(500),
  "emergency_contact_name" VARCHAR(150),
  "emergency_contact_phone" VARCHAR(30),
  "national_id_ciphertext" TEXT,
  "archived_at" TIMESTAMP(3),
  "archived_by" UUID,
  "archive_reason" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_profiles_status_valid" CHECK ("employment_status" IN ('active', 'inactive', 'archived', 'terminated')),
  CONSTRAINT "employee_profiles_probation_valid" CHECK (
    ("probation_start" IS NULL AND "probation_end" IS NULL AND "probation_status" IS NULL)
    OR ("probation_start" IS NOT NULL AND "probation_end" IS NOT NULL AND "probation_end" >= "probation_start")
  ),
  CONSTRAINT "employee_profiles_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "employee_profiles_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "employee_profiles_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE TABLE "employment_contracts" (
  "id" BIGSERIAL PRIMARY KEY,
  "employee_id" BIGINT NOT NULL,
  "branch_id" BIGINT,
  "contract_type" VARCHAR(30) NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "document_path" VARCHAR(500),
  "notes" TEXT,
  "supersedes_id" BIGINT,
  "uploaded_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employment_contract_dates_valid" CHECK ("effective_until" IS NULL OR "effective_until" >= "effective_from"),
  CONSTRAINT "employment_contract_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "employment_contract_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "employment_contract_supersedes_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "employment_contracts"("id") ON DELETE RESTRICT,
  CONSTRAINT "employment_contract_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE TABLE "compensation_rates" (
  "id" BIGSERIAL PRIMARY KEY,
  "employee_id" BIGINT NOT NULL,
  "branch_id" BIGINT,
  "compensation_type" VARCHAR(20) NOT NULL,
  "payment_frequency" VARCHAR(20) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EGP',
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "set_by" UUID NOT NULL,
  "reason" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "compensation_rates_amount_positive" CHECK ("amount" >= 0),
  CONSTRAINT "compensation_rates_type_valid" CHECK ("compensation_type" IN ('monthly', 'daily', 'hourly', 'per_shift')),
  CONSTRAINT "compensation_rates_frequency_valid" CHECK ("payment_frequency" IN ('weekly', 'semi_monthly', 'monthly')),
  CONSTRAINT "compensation_rates_dates_valid" CHECK ("effective_until" IS NULL OR "effective_until" >= "effective_from"),
  CONSTRAINT "compensation_rates_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "compensation_rates_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "compensation_rates_set_by_fkey" FOREIGN KEY ("set_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX "employee_profiles_branch_status_idx" ON "employee_profiles" ("branch_id", "employment_status");
CREATE INDEX "employee_profiles_archived_at_idx" ON "employee_profiles" ("archived_at");
CREATE INDEX "employment_contracts_employee_effective_from_idx" ON "employment_contracts" ("employee_id", "effective_from");
CREATE INDEX "employment_contracts_branch_effective_until_idx" ON "employment_contracts" ("branch_id", "effective_until");
CREATE INDEX "compensation_rates_employee_effective_from_idx" ON "compensation_rates" ("employee_id", "effective_from");
CREATE INDEX "compensation_rates_branch_effective_from_idx" ON "compensation_rates" ("branch_id", "effective_from");
CREATE UNIQUE INDEX "compensation_rates_employee_effective_from_key" ON "compensation_rates" ("employee_id", "effective_from");

-- Existing staff are preserved and become visible in HR immediately after
-- deployment. This is additive and idempotent; it neither deletes nor edits
-- user rows. NULL branch_id intentionally represents the existing Owner.
INSERT INTO "employee_profiles" ("user_id", "branch_id", "employment_status", "hire_date")
SELECT "id", "branch_id", CASE WHEN "is_active" THEN 'active' ELSE 'inactive' END, "created_at"::date
FROM "users"
ON CONFLICT ("user_id") DO NOTHING;

ALTER TABLE "employee_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employment_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compensation_rates" ENABLE ROW LEVEL SECURITY;

-- This application uses trusted server-side Prisma services for HR reads and
-- writes.  Do not expose personal or compensation data through the Data API.
-- The project has broad default grants for API roles, so make the intended
-- deny-by-default boundary explicit in addition to enabling RLS above.
REVOKE ALL ON TABLE "employee_profiles", "employment_contracts", "compensation_rates"
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "employee_profiles_id_seq", "employment_contracts_id_seq", "compensation_rates_id_seq"
  FROM PUBLIC, anon, authenticated;
