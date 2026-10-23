# Skoon HR — Implementation Report

**Report status:** HR foundation migration and Employee Management verification completed on 2026-10-23.
**Implementation status:** The HR foundation is deployed to the explicitly authorised Skoon development project. Employee-management code, protected APIs, Arabic RTL UI, and a guarded PostgreSQL acceptance test are implemented. No commit or push was performed.

## Existing components to reuse

- Supabase Auth + trusted local `User` authorization resolution: `src/lib/session.ts`.
- Core roles, branch scoping and permissions: `src/lib/authz.ts` and database `Role`/`Permission` tables.
- Staff provisioning service and audited staff profile creation: `src/lib/staff-provision-write.ts`.
- Open/close shift and financial handover services: `src/lib/staff-shifts.ts`.
- Immutable financial movements/idempotency: `FinancialMovement`, `FinancialOperation`, and the staff payment/fixed-float services.
- In-app notifications and audit logs: `src/lib/notifications.ts`, `AuditLog`.

## Planned safe implementation sequence

1. HR foundation is deployed: retain the Owner-only employee profile/archive APIs and Arabic RTL views as the base for later phases.
2. Next: add schedules and attendance derived from the existing `Shift` records in a separate additive migration requiring approval.
3. Add leave and holiday workflow.
4. Add payroll and salary advances using effective-dated compensation and the authoritative financial ledger.
5. Add performance, discipline, custody, documents and termination workflow.
6. Complete Owner/Manager/employee views and database-backed hardening tests.

## Deployment and verification status

| Item | Status |
|---|---|
| HR schema migration | `supabase/migrations/20261023150000_hr_employee_foundation.sql` was applied through Supabase MCP only to approved project `bkgxjutnfkslpgshufhb` as `20261023150000_hr_employee_foundation`. |
| HR APIs/UI | Owner-only lifecycle, directory/detail/profile, archive/reactivate, contract history and effective-dated compensation APIs plus Arabic RTL UI are implemented. Payroll is deliberately absent. |
| HR offline tests | 3 HR authorization tests are included in the offline suite. |
| HR PostgreSQL integration tests | Passed: Owner lifecycle, Manager isolation, contract creation, effective-dated compensation, archive/reactivate, and cleanup. |
| Existing application data | Existing users were preserved; the approved backfill created one profile per existing user. The integration fixture removed all rows it created. |
| Existing cashier/POS/shift/finance behavior | Not modified by this HR work |

## Implemented in this pass

- `src/lib/hr-authz.ts` makes lifecycle authority an Owner-only invariant, independent of editable permissions.
- `inviteStaff` and `updateStaff` now fail server-side for Manager callers; the staff directory stops presenting lifecycle controls to Managers.
- Account creation supports a Supabase invitation or Owner-supplied initial permanent password. Passwords are passed directly to Supabase Auth and are never persisted in Skoon or returned in API responses.
- `POST /api/staff/users/:id/password` resets passwords through the server-only Supabase admin client. Owner may reset any active employee; Manager is limited to a non-Manager/non-Owner employee in the same branch. Each successful reset is audited.
- `EmployeeProfile`, `EmploymentContract`, and `CompensationRate` are additive Prisma models. Profiles support active/inactive/archived status, probation state, owner-only personal/emergency data, and a nullable branch for the cross-branch Owner account.
- The deployed migration enables RLS and explicitly revokes table and sequence privileges from `PUBLIC`, `anon`, and `authenticated`. Prisma uses the trusted `postgres` role; it owns these tables and retains access. No browser Data API policy is provided for HR records.
- Contracts are append-only renewal records. Compensation rates are effective dated, constrained to one start date per employee, and serialized with a transaction lock when a new rate closes a preceding rate window.
- `src/lib/staff-employee-write.ts` exposes branch-scoped Manager operational reads only; Owner is required for profiles, archive/reactivate, contracts, and compensation. Cashier/waiter/kitchen roles receive a 403 from the employee-directory API.
- `src/components/staff/employee-management-board.tsx` adds Arabic RTL directory filtering, details, owner-only profile editing, archive/reactivation, contract history, and compensation history. It intentionally states that no payroll or financial movement is created.

## Validation performed

- `npx prisma generate` — passed with normal Prisma Client `6.19.3`.
- `npm.cmd run test:hr` — passed: 1/1 guarded PostgreSQL acceptance test.
- `npx.cmd prisma format` — passed.
- `npx.cmd prisma validate` — passed.
- `npm.cmd run typecheck` — passed.
- `npm.cmd test` — passed: 93/93 offline tests, including Owner lifecycle, manager reset-scope, and directory/sensitive-data access rules.
- `git diff --check` — passed.

## Migration review and deployment prerequisites

The migration is additive: it creates three new tables, foreign keys, validation checks, targeted indexes, RLS enablement, and an idempotent backfill from existing `users`. It does not drop, truncate, rewrite, or delete existing application records. The backfill preserves existing active/inactive state and allows the existing cross-branch Owner to have a NULL `branch_id`.

Deployment verification found all three tables, expected primary/foreign/check/unique constraints and indexes, RLS enabled, and zero `anon`/`authenticated` table or sequence privileges. Eight existing users have eight profiles with no duplicate profile rows; both branchless Owners retained branchless profiles. Do **not** use `prisma migrate deploy`, `prisma db push`, reset, or forced synchronization.

Recommended read-only verification after an approved deployment:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('employee_profiles', 'employment_contracts', 'compensation_rates');

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('employee_profiles', 'employment_contracts', 'compensation_rates');
```

## Scheduling and attendance implementation (local, pending migration approval)

- Added `WorkSchedule`, `WorkScheduleDay`, and `AttendanceCorrection` Prisma models and the additive, un-applied migration `supabase/migrations/20261023160000_hr_scheduling_attendance.sql`. It creates only new tables, indexes, foreign keys, validation checks, RLS enablement, and deny-by-default grants; it must be reviewed and explicitly approved before any database execution.
- Added transactional schedule creation with a per-employee advisory transaction lock, effective-period overlap rejection, branch-scoped employee validation, seven-day/rest-day/overnight validation, immutable audit entries, and an employee bell notification. It is exposed through `GET`/`POST /api/staff/hr/schedules`.
- Added attendance-correction request and Owner-only final decision services/routes. The data model references existing operational `Shift` records; it does not introduce a second clock-in/out source. A manager may request a branch-local correction but cannot approve it.
- `npx prisma generate`, `npx prisma validate`, TypeScript checking, the 95-test offline suite, and `git diff --check` passed after this local implementation. Database execution and PostgreSQL integration tests are still blocked pending migration approval.

## Leave and holiday foundation (local, pending migration approval)

- Added `LeaveRequest` and `OfficialHoliday` Prisma models and `supabase/migrations/20261023161000_hr_leave_holidays.sql`. This is a separate additive migration and has not been applied.
- Added protected `GET`/`POST /api/staff/hr/leave` and `POST /api/staff/hr/leave/:id/decision`: a signed-in employee can request only their own leave; Owner/Manager can review only permitted branch requests; reviewers cannot approve their own request. Dates, overlap, branch identity, audit entries and final decision immutability are validated server-side.
- Leave balances, holiday management UI, paid/unpaid policy, payroll use of approved leave, notification fan-out, and PostgreSQL acceptance tests are still pending. No leave mutation can execute until the pending migration is approved and applied.

## Known limitations and next phase

- The scheduling/attendance migration is prepared but not applied. Scheduling persistence/services/APIs exist locally, while Arabic RTL schedule and attendance screens, actual attendance reporting, leave, advances, payroll, performance, discipline, documents, custody, termination, self-service, and dashboards remain to be implemented.
- The migration is present, so the protected HR APIs can operate against the deployed HR tables. Subsequent HR phases need separate additive migrations and explicit approval before database application.
- New accounts created after the migration need their profile completed by the Owner through the HR screen; a dedicated transactionally coordinated identity+profile provisioning flow is a follow-up hardening task.
- No private Supabase Storage document upload/download path exists yet. `document_path` is a reference only and must not be treated as a public URL.
- No payroll, payment, salary advance, leave, scheduling, attendance correction, disciplinary, performance, custody, or termination workflow was added in this phase.
- The guarded PostgreSQL acceptance test passed (1/1). It created and then removed its own two branches, four users, profiles, contracts, compensation rates, and audit rows; no fixture branches or users remained afterward.

See [HR_GAP_ANALYSIS.md](./HR_GAP_ANALYSIS.md) for the evidence, risk assessment, required migrations, and preservation constraints.
