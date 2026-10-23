-- LOCAL ONLY. Additive HR leave and holiday foundation; requires explicit approval.
CREATE TABLE "leave_requests" (
  "id" BIGSERIAL PRIMARY KEY, "branch_id" BIGINT NOT NULL, "employee_id" UUID NOT NULL, "type" VARCHAR(30) NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "starts_on" DATE NOT NULL, "ends_on" DATE NOT NULL, "days" NUMERIC(6,2) NOT NULL, "reason" VARCHAR(500) NOT NULL, "reviewer_id" UUID, "decision_note" VARCHAR(500), "decided_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_requests_dates_valid" CHECK ("ends_on" >= "starts_on"), CONSTRAINT "leave_requests_days_valid" CHECK ("days" > 0), CONSTRAINT "leave_requests_status_valid" CHECK ("status" IN ('pending','approved','rejected','cancelled')),
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT, FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE RESTRICT, FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "leave_requests_employee_status_starts_on_idx" ON "leave_requests" ("employee_id", "status", "starts_on");
CREATE INDEX "leave_requests_branch_status_starts_on_idx" ON "leave_requests" ("branch_id", "status", "starts_on");
CREATE TABLE "official_holidays" (
  "id" BIGSERIAL PRIMARY KEY, "branch_id" BIGINT, "name" VARCHAR(150) NOT NULL, "starts_on" DATE NOT NULL, "ends_on" DATE NOT NULL, "created_by" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "official_holidays_dates_valid" CHECK ("ends_on" >= "starts_on"), FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT, FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "official_holidays_branch_starts_on_idx" ON "official_holidays" ("branch_id", "starts_on");
ALTER TABLE "leave_requests" ENABLE ROW LEVEL SECURITY; ALTER TABLE "official_holidays" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "leave_requests", "official_holidays" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "leave_requests_id_seq", "official_holidays_id_seq" FROM PUBLIC, anon, authenticated;
