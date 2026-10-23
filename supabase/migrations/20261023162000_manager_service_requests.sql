-- LOCAL ONLY. Additive customer service-request queue; requires explicit approval.
CREATE TABLE "service_requests" (
  "id" BIGSERIAL PRIMARY KEY, "branch_id" BIGINT NOT NULL, "table_id" BIGINT NOT NULL, "order_id" BIGINT,
  "type" VARCHAR(30) NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'pending', "priority" SMALLINT NOT NULL DEFAULT 0,
  "details" VARCHAR(500), "claimed_by" UUID, "claimed_at" TIMESTAMP(3), "resolved_by" UUID, "resolved_at" TIMESTAMP(3), "resolution" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_requests_type_valid" CHECK ("type" IN ('waiter_call','bill','water','utensils','assistance','complaint')),
  CONSTRAINT "service_requests_status_valid" CHECK ("status" IN ('pending','accepted','in_progress','resolved','cancelled')),
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("table_id") REFERENCES "cafe_tables"("id") ON DELETE RESTRICT,
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL,
  FOREIGN KEY ("claimed_by") REFERENCES "users"("id") ON DELETE SET NULL,
  FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX "service_requests_branch_status_priority_created_at_idx" ON "service_requests" ("branch_id", "status", "priority", "created_at");
CREATE INDEX "service_requests_table_status_idx" ON "service_requests" ("table_id", "status");
-- A time-window cooldown cannot be safely represented by a partial unique
-- index: such an index would permanently block a legitimate later request
-- while an old request remained open. The application instead acquires a
-- transaction advisory lock per table before checking/inserting, so concurrent
-- QR posts serialize and the configured 60-second cooldown remains enforceable.
ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "service_requests" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "service_requests_id_seq" FROM PUBLIC, anon, authenticated;
