# Remediation Roadmap

## Phase 0 — Immediate containment

1. Remove/disable runtime hard invoice DELETE.
2. Upgrade Next.js to a patched version; update lockfile and verify advisory closure.
3. Add temporary monitoring/rate controls for public order creation.

Exit: no P0 finding remains reproducible.

## Phase 1 — Financial and inventory correctness

1. Fix eligible/excluded invoice discount bases.
2. Unify Cashier invoice item changes with inventory-aware adjustment logic.
3. Make settled financial records immutable and correction-only.
4. Add transaction tests for discount, payment, refund, shift, and inventory interactions.

Exit: P1 financial/inventory suites pass on disposable PostgreSQL.

## Phase 2 — Operational workflows and authorization

1. Repair Waiter serving contract.
2. Approve and implement one Manager shift/action policy.
3. Run endpoint IDOR/branch matrix for every staff API.
4. Add QR variants/modifiers if the public catalog exposes them.

Exit: all role E2E journeys pass on desktop/mobile RTL.

## Phase 3 — Database and deployment assurance

1. Restore backup to isolated staging.
2. Reconcile Prisma/Supabase migration history and checksums.
3. Verify constraints, RLS, grants, runtime role, and connection pooling.
4. Perform backup restore, rollback, and Hostinger smoke rehearsal.

Exit: signed release checklist and repeatable migration/rollback plan.

## Phase 4 — Maintainability and performance

1. Split Waiter board by feature behind typed contracts.
2. Add pagination and visibility-aware polling.
3. Profile queries before index/cache changes.
4. Move deprecated Prisma configuration and complete printer/accessibility certification.

No phase should apply production DB changes without backup, reviewed SQL, staging evidence, and explicit approval.
