# Skoon HR — Gap Analysis

**Audit date:** 2026-10-23
**Scope:** Existing `main` working tree; no database writes, migrations, or production data changes were made for this audit.
**Architecture constraint:** The application currently has one operating branch. Existing `branch_id` data isolation remains part of every new HR record, but no employee-transfer or branch-selection workflow is required.

## Evidence inspected

| Area | Primary evidence |
|---|---|
| Identity, roles and sessions | `prisma/schema.prisma`, `src/lib/session.ts`, `src/lib/authz.ts` |
| Provisioning and account changes | `src/lib/staff-provision-write.ts`, `src/app/api/staff/users/route.ts`, `src/app/api/staff/users/[id]/route.ts`, `prisma/seed-test-users.ts` |
| Staff page and route protection | `src/app/(app)/staff/page.tsx`, `src/components/staff/staff-board.tsx`, `src/lib/staff-directory.ts`, `src/lib/require-page-access.ts`, `src/lib/route-access.ts`, `src/middleware.ts` |
| Shifts and cash control | `src/lib/staff-shifts.ts`, `src/app/api/staff/shifts/**`, `prisma/schema.prisma` (`Shift`, `FinancialMovement`, `Payment`) |
| Financial, audit and reports | `src/lib/staff-payments-write.ts`, `src/lib/staff-float.ts`, `src/lib/staff-reports.ts`, `src/lib/notifications.ts`, `prisma/schema.prisma` |
| Existing HR-adjacent data | `prisma/schema.prisma` (`User.salary`, `EmployeeAccountability`, `AccountabilityWaiver`, `PayrollDeduction`) |
| Tests and migrations | `tests/offline.test.ts`, `tests/*postgres*`, `prisma/migrations/*`, `supabase/migrations/*`, `package.json` |

## Existing foundation

| Requirement | Status | What exists | Gap / preservation requirement |
|---|---|---|---|
| Supabase Auth identity bound to local staff profile | **EXISTS** | `User.id` is the Auth UUID. `getStaffSession()` reads a trusted active `public.users` row rather than JWT metadata. | Preserve this source of authorization; never accept role or branch from a browser payload. |
| Core roles | **EXISTS** | `owner`, `manager`, `cashier`, `waiter`, `kitchen` are canonical in `src/lib/authz.ts`; database `Role`/`Permission`/`RolePermission` supports grants. | No HR-specific role is required. Per-employee exceptions do not exist and must not undermine owner-only HR invariants. |
| Active/inactive profile state | **PARTIAL** | `User.isActive`, `deletedAt`, and `getStaffSession()` reject inactive/deleted rows. | No HR archive state, archive reason/actor/date, reactivation workflow, or Auth-session invalidation. Do not delete historical users. |
| Invitation-based staff creation | **PARTIAL** | `inviteStaff()` uses server-only `SUPABASE_SERVICE_ROLE_KEY`, Auth invitation, local profile creation, rollback attempt, and audit record. | Current route permits both Owner and Manager. New HR rule requires Owner only. No permanent-password creation, reset-password flow, employee personal/employment profile, or invitation lifecycle. |
| User role/branch/activation updates | **PARTIAL / SECURITY GAP** | `updateStaff()` checks branch scope and blocks self-deactivation; audit event is created. | Current Manager can change a non-owner's role and active state, including another Manager. This conflicts with required owner-only role/activation control and subordinate-only password reset. Must be tightened before exposing HR administration. |
| Staff directory UI | **PARTIAL** | `/staff` is a guarded page with Arabic RTL-oriented UI, directory, invite form, role select, and activate/deactivate action. | It exposes management actions to Manager and has no employee profile, archive/default filtering, contracts, documents, schedules, leave, payroll, or self-service view. |
| Page authorization | **EXISTS** | `requirePageAccess()` and `route-access.ts` use trusted sessions; layout/middleware refresh Supabase sessions. | APIs must still enforce their own authorization; UI route visibility is not sufficient. |
| Operational shifts | **PARTIAL** | `Shift` tracks opening/closing timestamps, an employee UUID (`cashierId`), owner exemption in `requireOpenShift()`, one open shift per employee/branch via advisory lock, and audit rows. Cash reconciliation/handover has ledger integration. | Model and UI are till-oriented (`cashierId`, opening/closing cash). It does not provide schedules, attendance corrections, automatic closure review, or an immutable attendance layer. The existing open-shift unique behavior is application-lock based; a database partial unique index is absent. |
| Mandatory open shift | **PARTIAL** | `requireOpenShift()` exists and Owner is exempt. POS, waiter, inventory, and cash mutations use it in several service paths. | Audit found no central route middleware; each operational API must be enumerated and tested. HR must reuse shift timestamps as attendance rather than build a second clock-in system. |
| Financial ledger and idempotency | **EXISTS** | Immutable `FinancialMovement`, `FinancialOperation`, `Payment`, shift handover and fixed-float services use transactions/idempotency/audit records. | There is no payroll obligation/payment model. Payroll must call an authoritative financial service and create exactly one linked movement; it must never repurpose customer payments or fixed-float advances. |
| Existing salary field | **PARTIAL / RISK** | `User.salary Decimal(10,2)` is in the schema, introduced by `20261018140000_add_product_cost_unit_tax_and_user_salary`. | It has no compensation type, effective date, currency/frequency, approval or history. Its comment says owner/manager editable, conflicting with owner-only compensation. It must be retained for compatibility and migrated into history without retroactively changing past pay. |
| Employee accountability | **PARTIAL** | Inventory loss accountability, waivers, and an intentionally separate `PayrollDeduction` model exist. | It is not HR discipline or payroll. Existing code explicitly avoids automatic payroll deduction; HR must preserve that rule. |
| Notifications bell | **PARTIAL** | `Notification` and `src/lib/notifications.ts` provide in-app per-user fan-out, transactional with order changes. | Types are order-only, and no HR-sensitive recipient policy exists. Extend with stable HR event types only after authorization is defined. No WhatsApp/SMS/general HR email mechanism exists. |
| Reports | **PARTIAL** | Operational sales/payment reports exist and distinguish order intent from collected revenue. | No attendance, payroll, leave, HR compliance, or employee KPI reports. HR reports must not leak salaries to Manager/employee roles. |
| Private documents / storage | **MISSING** | No employee document model or private storage access service was found. | Must use private Supabase Storage with authenticated, owner-scoped signed access; never store public URLs or sensitive IDs in `User`. |
| Payroll | **MISSING** | Only `User.salary` and unrelated accountability deductions exist. | Requires effective-dated compensation, payroll periods/lines, approval/payment separation, overlap constraints, financial linkage, idempotency, and tests. |
| Salary advances | **MISSING** | Fixed-float advances are a separate cash-accounting feature. | Never reinterpret fixed-float advances as salary advances. Requires request/approval/disbursement/recovery states and payroll linkage. |
| Leave | **MISSING** | No leave models/routes/screens. | Requires overlap prevention, recommendation/final-approval separation, and approved-leave attendance treatment. |
| Schedules and attendance corrections | **MISSING** | Shift timestamps can be reused as actual attendance. | Requires weekly schedule/revision history, corrections proposed by Manager and approved by Owner, overnight/time-zone rules, holiday/rest calendars, and no silent timestamp rewrite. |
| Contracts, probation and termination | **MISSING** | No models/routes/screens. | Requires archival/access-disable coordination, document protections, custody/advance/shift review, and no automatic renewal/deduction. |
| Performance and disciplinary workflow | **MISSING** | Operational data exists; accountability is inventory-only. | Must be separate from accountability and hidden from employees; reports must treat missing telemetry as unknown, never poor performance. |
| Custody register | **MISSING** | No model/routes/screens. | Must be distinct from cashier till/fixed float and not cause salary deduction. |
| HR tests | **MISSING** | 90 offline tests cover existing app/inventory workflows; PostgreSQL suites are guarded and not HR-specific. | Must add authorization, shift/attendance, financial idempotency, and self-service leakage tests. Database-write tests remain blocked unless an authorized isolated target is available. |

## Data-model gap and required additive entities

The existing `User` record is a staff identity/profile, not a complete HR employee record. A compatible implementation should retain it and introduce separately keyed, append/history-oriented entities:

1. `EmployeeProfile` (one-to-one with `User`): non-sensitive operational contact and employment metadata; sensitive identifiers should be encrypted or isolated, not included in broad directory queries.
2. `EmploymentContract`, `EmployeeDocument`, `ProbationReview`, `EmployeeCustody` and archival/termination records.
3. `WorkSchedule`, schedule revisions, `AttendanceCorrection`, and `OfficialHoliday`; actual attendance derives from `Shift` rather than a parallel clock table.
4. `LeaveRequest` and configurable leave policy/balance records.
5. `CompensationRate` with `[effective_from, effective_to)` semantics; `PayrollRun`, `PayrollLine`, `PayrollPayment`/financial reference; `SalaryAdvanceRequest`, disbursement and recovery rows.
6. `PerformanceReview`, `DisciplinaryReport`, immutable decision/history rows.
7. Optional dedicated HR idempotency records for financial HR operations, reusing the proven `FinancialOperation` pattern only when its scope and result shape fit.

Every table must be branch-scoped (even though only one branch operates today), FK to staff identity, indexed by access/status/date queries, and have RLS enabled with policies aligned to trusted server access. Additive SQL migrations must use the established Supabase migration workflow; they must not use `prisma migrate deploy`, reset history, or alter prior migrations.

## Security and financial risks

| Risk | Severity | Evidence | Required remediation |
|---|---|---|---|
| Manager can invite staff and alter role/activation | Critical | `inviteStaff` and `updateStaff` accept Owner **or** Manager; `/staff` enables management for `Manager+`. | Before HR rollout, make employee creation, official profile changes, role/permission changes, activation/archive, compensation, contracts, termination and final settlement Owner-only on service/API layer. |
| Manager can modify another Manager | High | `updateStaff()` denies only target Owner for manager callers. | Explicitly enforce subordinate target role and no Manager/Owner password reset or role changes. |
| No session invalidation after archive/deactivation/reset | High | Profile lookup blocks future server session resolution but no Auth admin session-revocation path was found. | Use Supabase Auth administrative session invalidation where available and test it; do not expose service key. |
| Salary data is on broadly selected `User` model | High | `User.salary` exists; HR-specific projection policies do not exist. | Use strict owner-only selects for compensation; never return `salary` in directory/self-service/manager APIs. |
| Payroll does not exist | Critical | No payroll data model/service. | Separate calculate/approve/disburse; lock period coverage; transaction + durable idempotency + linked `FinancialMovement`; approval alone cannot pay. |
| Shift is a cash/till model | High | `Shift.cashierId`, cash fields, handover fields. | Do not change cash semantics while deriving attendance. Add HR metadata/review only by backward-compatible fields/tables. Administrative cash-shift closure must retain reconciliation safeguards. |
| Existing RLS policy coverage requires deployment audit | High | Current project has Prisma trusted-server access and prior security review noted tables with RLS/no policies. | New HR tables require explicit RLS enablement and policy/grant review before deployment. Do not assume RLS alone prevents API leaks. |
| Sensitive documents have no storage design | High | No document model/storage policy. | Use private bucket/object path only, owner-checked signed access, audit sensitive downloads, retention policy; never public bucket URLs. |
| Accountability could be mistaken for salary deduction | Medium | `PayrollDeduction` exists but is explicitly manual/legal only. | Preserve separation; no HR flow may auto-deduct waste, disciplinary or custody amounts. |

## Dependency order

1. **Foundation:** Tighten provisioning authorization and define owner-only HR authorization helper; add employee profile/archive/audit foundations. This is a prerequisite for every screen.
2. **Operational HR:** Use existing shifts for attendance; add schedules, corrections, probation, leave and holidays without changing cash close behavior.
3. **Financial HR:** Only after effective compensation and attendance verification: payroll, advances, idempotent financial posting, statements accessible only to Owner.
4. **Supporting HR:** contracts/documents/custody, performance, disciplinary decisions, termination review, HR notifications.
5. **Hardening:** API authorization tests, PostgreSQL transactional tests on an authorized non-production target, RLS/storage policy test, and regression of POS/cashier/waiter/kitchen/fixed-float behavior.

## Explicit preservation requirements

- Keep `User.id` equal to the Supabase Auth UUID; never persist a password in Prisma.
- Keep the current core roles and branch isolation, but do not add multi-branch employee flows.
- Do not repurpose `Shift`, `FinancialMovement`, `FinancialOperation`, fixed float, customer `Payment`, inventory accountability, or `PayrollDeduction` for unrelated HR states.
- Owner remains exempt from operational open-shift requirement. Non-owner shift enforcement must be strengthened only after route-by-route compatibility review.
- Historical orders, shifts, payments, inventory records, financial movements, audit logs and accountabilities must survive archival/termination.
- No automatic deductions, salary disbursements, contract renewals, attendance corrections, or payroll posting.
- Current dirty working-tree changes (especially inventory/stock-count/waste work) are outside HR scope and must not be overwritten.

## Audit conclusion

The codebase has a usable identity/RBAC/session, staff invitation, shift, financial-ledger, audit-log and notification foundation. It does **not** yet have an integrated HR domain. The first safe implementation is an Owner-only HR authorization/provisioning hardening pass plus additive employee profile lifecycle models. Financial HR must follow, rather than being built around the current single `User.salary` field.
