# Final regression report

Date: 2026-10-28

## Updated counts

- Passed: offline suite (176/176), staff-provision unit suite (9/9), TypeScript, and ESLint with zero warnings. The production-build attempt completed compilation, static-page generation, optimization, trace collection, and emitted `.next/BUILD_ID`.
- Failed: `staging:check` (correctly rejects an unconfigured template target). The command runner did not return the final build exit status before its time limit, so production-build success is not yet a formal sign-off.
- Blocked: live Auth provisioning/login E2E, database integration, browser E2E, printer hardware validation.
- Skipped: destructive production tests, production repair, deployment, and migrations by design.

## Readiness

Not production-ready for a full sign-off. Complete the isolated staging configuration and run real user-provisioning/login tests for every role. Reconcile the four unmatched Auth identities only with explicit Owner approval. Address Supabase Advisor findings through separately reviewed, non-destructive changes.

Production repair is additionally blocked until an approved active branch exists. Any reconciliation must be per-identity, Owner-approved, and use the exact Auth UUID after out-of-band identity verification; no email-only or bulk mapping is permitted.

## 2026-10-28 production branch recovery preparation

- Confirmed production has zero branch records. The initial migration defines `branches` with required `name` and unique `code`; `timezone` defaults to `Africa/Cairo` and `is_active` defaults to true.
- No pre-existing production branch-management API or UI exists. `prisma/seed-demo.ts` creates a `MAIN` branch but also seeds demo data and must never be used for production recovery.
- Added a one-time, Owner-only initial-branch bootstrap. It validates name/code, creates one active Cairo branch only when the table is empty, serializes concurrent attempts with a transaction-scoped PostgreSQL advisory lock, and writes an audit event. The UI requests the business details rather than hard-coding them.
- No production record, Auth identity, migration, deployment, or credential was changed. Deployment and live verification remain blocked pending an approved branch name/code and explicit release authorization.
