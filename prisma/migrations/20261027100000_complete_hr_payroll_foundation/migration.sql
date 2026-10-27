-- LOCAL PROPOSAL ONLY. Do not apply to production without a separate review,
-- backup verification, and explicit approval. This migration is additive and
-- never touches operational shifts, orders, payments, inventory, or ledgers.

ALTER TABLE "leave_requests" ADD COLUMN "is_paid" BOOLEAN;
ALTER TABLE "official_holidays" ADD COLUMN "is_paid" BOOLEAN;

CREATE TABLE "work_schedule_intervals" (
  "id" BIGSERIAL PRIMARY KEY, "schedule_day_id" BIGINT NOT NULL,
  "starts_at" VARCHAR(5) NOT NULL, "ends_at" VARCHAR(5) NOT NULL,
  "unpaid_break_minutes" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "work_schedule_intervals_break_valid" CHECK ("unpaid_break_minutes" >= 0),
  CONSTRAINT "work_schedule_intervals_times_valid" CHECK ("starts_at" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND "ends_at" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "work_schedule_intervals_day_fkey" FOREIGN KEY ("schedule_day_id") REFERENCES "work_schedule_days"("id") ON DELETE CASCADE
);
CREATE INDEX "work_schedule_intervals_day_idx" ON "work_schedule_intervals" ("schedule_day_id");

CREATE TABLE "employee_documents" (
  "id" BIGSERIAL PRIMARY KEY, "employee_id" BIGINT NOT NULL, "kind" VARCHAR(40) NOT NULL,
  "storage_path" VARCHAR(500) NOT NULL, "uploaded_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_documents_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee_profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "employee_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "employee_documents_kind_valid" CHECK ("kind" IN ('national_id_front','national_id_back','signed_contract','other')),
  CONSTRAINT "employee_documents_employee_kind_path_key" UNIQUE ("employee_id","kind","storage_path")
);
CREATE INDEX "employee_documents_employee_kind_idx" ON "employee_documents" ("employee_id","kind");

CREATE TABLE "overtime_policies" (
  "id" BIGSERIAL PRIMARY KEY, "branch_id" BIGINT, "employee_id" UUID, "role_id" BIGINT,
  "effective_from" DATE NOT NULL, "effective_until" DATE,
  "regular_multiplier" DECIMAL(8,4), "rest_day_multiplier" DECIMAL(8,4), "holiday_multiplier" DECIMAL(8,4), "night_multiplier" DECIMAL(8,4), "fixed_hourly_rate" DECIMAL(12,2),
  "grace_minutes" INTEGER NOT NULL DEFAULT 0, "daily_limit_minutes" INTEGER, "monthly_limit_minutes" INTEGER,
  "premium_only" BOOLEAN NOT NULL DEFAULT true, "approval_required" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "overtime_policies_scope_valid" CHECK (num_nonnulls("employee_id","role_id","branch_id") <= 1),
  CONSTRAINT "overtime_policies_dates_valid" CHECK ("effective_until" IS NULL OR "effective_until" >= "effective_from"),
  CONSTRAINT "overtime_policies_limits_valid" CHECK ("grace_minutes" >= 0 AND ("daily_limit_minutes" IS NULL OR "daily_limit_minutes" >= 0) AND ("monthly_limit_minutes" IS NULL OR "monthly_limit_minutes" >= 0)),
  CONSTRAINT "overtime_policies_rates_valid" CHECK (("regular_multiplier" IS NULL OR "regular_multiplier" >= 0) AND ("rest_day_multiplier" IS NULL OR "rest_day_multiplier" >= 0) AND ("holiday_multiplier" IS NULL OR "holiday_multiplier" >= 0) AND ("night_multiplier" IS NULL OR "night_multiplier" >= 0) AND ("fixed_hourly_rate" IS NULL OR "fixed_hourly_rate" >= 0)),
  CONSTRAINT "overtime_policies_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "overtime_policies_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "overtime_policies_role_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT,
  CONSTRAINT "overtime_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "overtime_policies_employee_effective_idx" ON "overtime_policies" ("employee_id","effective_from");
CREATE INDEX "overtime_policies_role_effective_idx" ON "overtime_policies" ("role_id","effective_from");
CREATE INDEX "overtime_policies_branch_effective_idx" ON "overtime_policies" ("branch_id","effective_from");

CREATE TABLE "overtime_requests" (
  "id" BIGSERIAL PRIMARY KEY, "employee_id" UUID NOT NULL, "branch_id" BIGINT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL, "ends_at" TIMESTAMP(3) NOT NULL, "category" VARCHAR(30) NOT NULL,
  "detected_minutes" INTEGER NOT NULL, "approved_minutes" INTEGER, "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "requested_by" UUID NOT NULL, "decided_by" UUID, "decision_note" VARCHAR(500), "decided_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "overtime_requests_interval_valid" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "overtime_requests_minutes_valid" CHECK ("detected_minutes" >= 0 AND ("approved_minutes" IS NULL OR "approved_minutes" BETWEEN 0 AND "detected_minutes")),
  CONSTRAINT "overtime_requests_status_valid" CHECK ("status" IN ('pending','approved','rejected')),
  CONSTRAINT "overtime_requests_category_valid" CHECK ("category" IN ('regular','rest_day','holiday','night')),
  CONSTRAINT "overtime_requests_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "overtime_requests_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "overtime_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "overtime_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "overtime_requests_employee_status_starts_idx" ON "overtime_requests" ("employee_id","status","starts_at");
CREATE INDEX "overtime_requests_branch_status_starts_idx" ON "overtime_requests" ("branch_id","status","starts_at");

CREATE TABLE "hr_adjustments" (
  "id" BIGSERIAL PRIMARY KEY, "employee_id" UUID NOT NULL, "branch_id" BIGINT NOT NULL, "type" VARCHAR(30) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "currency" VARCHAR(3) NOT NULL DEFAULT 'EGP', "effective_on" DATE NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending', "reason" VARCHAR(500) NOT NULL, "requested_by" UUID NOT NULL,
  "approved_by" UUID, "approved_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hr_adjustments_type_valid" CHECK ("type" IN ('bonus','deduction','penalty')),
  CONSTRAINT "hr_adjustments_amount_valid" CHECK ("amount" > 0),
  CONSTRAINT "hr_adjustments_status_valid" CHECK ("status" IN ('pending','approved','rejected')),
  CONSTRAINT "hr_adjustments_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "hr_adjustments_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "hr_adjustments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "hr_adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "hr_adjustments_employee_status_effective_idx" ON "hr_adjustments" ("employee_id","status","effective_on");

CREATE TABLE "employee_advances" (
  "id" BIGSERIAL PRIMARY KEY, "employee_id" UUID NOT NULL, "branch_id" BIGINT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "repaid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0, "currency" VARCHAR(3) NOT NULL DEFAULT 'EGP',
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending', "reason" VARCHAR(500) NOT NULL, "requested_by" UUID NOT NULL,
  "approved_by" UUID, "approved_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_advances_amount_valid" CHECK ("amount" > 0 AND "repaid_amount" BETWEEN 0 AND "amount"),
  CONSTRAINT "employee_advances_status_valid" CHECK ("status" IN ('pending','approved','rejected','repaid')),
  CONSTRAINT "employee_advances_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "employee_advances_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "employee_advances_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "employee_advances_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "employee_advances_employee_status_created_idx" ON "employee_advances" ("employee_id","status","created_at");

CREATE TABLE "payroll_periods" (
  "id" BIGSERIAL PRIMARY KEY, "starts_on" DATE NOT NULL, "ends_on" DATE NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'draft', "created_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_periods_dates_valid" CHECK ("ends_on" >= "starts_on"),
  CONSTRAINT "payroll_periods_status_valid" CHECK ("status" IN ('draft','under_review','approved','partially_paid','paid','closed')),
  CONSTRAINT "payroll_periods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_periods_dates_key" UNIQUE ("starts_on","ends_on")
);

CREATE TABLE "payroll_runs" (
  "id" BIGSERIAL PRIMARY KEY, "period_id" BIGINT NOT NULL, "branch_id" BIGINT NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "created_by" UUID NOT NULL, "reviewed_by" UUID, "approved_by" UUID, "approved_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_runs_status_valid" CHECK ("status" IN ('draft','under_review','approved','partially_paid','paid','closed')),
  CONSTRAINT "payroll_runs_period_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_runs_branch_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_runs_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_runs_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_runs_period_branch_key" UNIQUE ("period_id","branch_id")
);
CREATE INDEX "payroll_runs_branch_status_idx" ON "payroll_runs" ("branch_id","status");

CREATE TABLE "payroll_lines" (
  "id" BIGSERIAL PRIMARY KEY, "payroll_run_id" BIGINT NOT NULL, "employee_id" UUID NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "gross_amount" DECIMAL(12,2) NOT NULL, "deduction_amount" DECIMAL(12,2) NOT NULL DEFAULT 0, "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0, "net_amount" DECIMAL(12,2) NOT NULL, "snapshot" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_lines_amounts_valid" CHECK ("gross_amount" >= 0 AND "deduction_amount" >= 0 AND "paid_amount" >= 0 AND "net_amount" >= 0 AND "paid_amount" <= "net_amount"),
  CONSTRAINT "payroll_lines_status_valid" CHECK ("status" IN ('draft','approved','partially_paid','paid','closed')),
  CONSTRAINT "payroll_lines_run_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_lines_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_lines_run_employee_key" UNIQUE ("payroll_run_id","employee_id")
);
CREATE INDEX "payroll_lines_employee_status_idx" ON "payroll_lines" ("employee_id","status");

CREATE TABLE "payroll_payments" (
  "id" BIGSERIAL PRIMARY KEY, "payroll_line_id" BIGINT NOT NULL, "amount" DECIMAL(12,2) NOT NULL, "method" VARCHAR(30) NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL, "recorded_by" UUID NOT NULL, "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_payments_amount_valid" CHECK ("amount" > 0),
  CONSTRAINT "payroll_payments_line_fkey" FOREIGN KEY ("payroll_line_id") REFERENCES "payroll_lines"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_payments_line_idempotency_key" UNIQUE ("payroll_line_id","idempotency_key")
);

ALTER TABLE "work_schedule_intervals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "overtime_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "overtime_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employee_advances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payroll_payments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "work_schedule_intervals", "employee_documents", "overtime_policies", "overtime_requests", "hr_adjustments", "employee_advances", "payroll_periods", "payroll_runs", "payroll_lines", "payroll_payments" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "work_schedule_intervals_id_seq", "employee_documents_id_seq", "overtime_policies_id_seq", "overtime_requests_id_seq", "hr_adjustments_id_seq", "employee_advances_id_seq", "payroll_periods_id_seq", "payroll_runs_id_seq", "payroll_lines_id_seq", "payroll_payments_id_seq" FROM PUBLIC, anon, authenticated;
