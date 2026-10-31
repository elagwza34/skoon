# Production Readiness

## Verdict: NOT READY

Local compilation is healthy, but production readiness is blocked by SEC-001 and FIN-001 and by unverified database/runtime compatibility.

## Local evidence

- Next.js production build succeeds.
- 76 API routes are emitted (73 staff, 3 public).
- TypeScript and strict lint pass.
- 225 offline tests pass.
- Required environment variable names are documented in `.env.example`; no values were inspected.

## Release blockers

1. Patch vulnerable Next.js/Zod/dependency chain.
2. Remove hard invoice deletion.
3. Correct discount eligibility and inventory-aware invoice editing.
4. Repair Waiter serving API contract.
5. Reconcile migration/schema/RLS state in isolated staging.
6. Run DB concurrency and browser role suites.

## Hostinger/Supabase preflight (read-only)

- Confirm Node/build/start commands and exact lockfile deployment.
- Confirm all required variable names exist, without exposing values.
- Confirm pooled/runtime vs direct Prisma URLs and runtime DB role privileges.
- Compare migration history and deployed columns/constraints.
- Enumerate RLS policies, grants, SECURITY DEFINER functions, and exposed schemas.
- Confirm proxy headers, HTTPS canonical domain, cookie behavior, and refresh/404 handling.
- Confirm logs, request IDs, alerting, retention, backups, restore drill, rollback procedure, and resource limits.

## Smoke plan after remediation

One authenticated journey per role; create/edit/prepare/serve/pay/refund order; QR creation/status; inventory reconciliation; shift close; invoice/receipt print; mobile RTL; refresh every canonical route. Use test data in isolated staging, not production.
