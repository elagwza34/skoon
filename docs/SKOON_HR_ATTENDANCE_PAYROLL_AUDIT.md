# HR, Attendance, Scheduling and Payroll Audit

## Scope and safety status

This assessment was performed locally on 2026-10-26. No production database,
Supabase Auth account, environment setting, migration, deployment, or financial
record was changed. Existing uncommitted P0 and product-configuration work was
preserved.

## Existing implementation

| Area | Current local state | Safety boundary |
| --- | --- | --- |
| Employee identity | Owner-only direct username/password provisioning plus legacy email login | Passwords are sent only to Supabase Auth and are neither stored nor returned by the app. |
| Employee lifecycle | Profile, effective-dated contracts and compensation, suspend, terminate, archive/reactivate | Historical user references use restrictive foreign keys; no employee history is cascade deleted. |
| Schedule planning | Effective-dated `WorkSchedule` and seven-day `WorkScheduleDay` revision model | Planned work is separate from till/operational shifts. |
| Attendance correction | Proposed corrections refer to an existing `Shift`; Owner finalizes decisions | A correction is an auditable proposal; it does not silently rewrite a Shift. |
| Leave | Request, overlap protection, branch-scoped review, final decision | Paid/unpaid treatment and balances are not implemented. |
| Operational shifts | Existing cash/till workflow, not an HR time clock | Cash close/reconciliation must not be modified for payroll. |
| Payroll | Not implemented | No period, line, approval, payment, reversal, salary-advance, or payslip model exists. |

## Database state and pending migrations

The HR foundation migration (`20261023150000_hr_employee_foundation`) has
historical evidence of having been applied, but current production schema access
was not used by this audit. The following local-only migrations remain pending
and must not be marked applied based on code presence:

1. `20261023160000_hr_scheduling_attendance.sql` — `work_schedules`,
   `work_schedule_days`, and `attendance_corrections`.
2. `20261023161000_hr_leave_holidays.sql` — `leave_requests` and
   `official_holidays`.

Both are additive, use restrictive foreign keys, enable RLS, and revoke direct
Data API privileges. Neither supplies a clock-in/clock-out event table or a
payroll ledger.

## Deliberate non-implementation: payroll

Payroll cannot safely be inferred from the current database. In particular,
customer payments, cash shifts, fixed-float movements, financial advances, and
inventory/accountability records are not salary payments and must never be
repurposed as such.

Before a payroll migration or writer is designed, the Owner must approve these
business contracts:

1. **Disbursement account:** the authorised accounting account/financial
   operation type used for salary payments and reversals.
2. **Rule versions:** monthly/daily/hourly calculation rules; overtime
   multiplier and approval; absence/late treatment; paid/unpaid leave; rounding;
   allowances and deductions. Statutory tax, insurance, and labour-law rules
   are explicitly out of scope until supplied by qualified payroll/legal owners.
3. **Period and locking:** branch-local versus company-wide periods, pay date,
   cutoff timezone, who can calculate/review/approve/pay, and the permitted
   post-approval adjustment/reversal workflow.
4. **Salary advances:** whether they are permitted, who approves them, and how
   recovery is linked to a payroll line without touching fixed-float advances.
5. **Documents:** approved private storage bucket, retention policy, and
   document-access roles before any national-ID or contract upload endpoint is
   enabled.

## Proposed additive design after approval

Do not apply this proposal until its business contracts and a restorable backup
are verified. A future migration should add, at minimum:

- `attendance_events` with server timestamps, branch timezone attribution,
  immutable source (`manual`, `operational_shift`, or `approved_correction`),
  and a partial unique constraint preventing simultaneous open punches.
- `payroll_rule_versions`, `payroll_periods`, and immutable `payroll_lines`.
- `payroll_adjustments`, `salary_advances`, `salary_payments`, and reversal
  references with restrictive foreign keys and durable idempotency keys.
- A `payroll_periods` lifecycle constrained to `draft`, `calculated`,
  `reviewed`, `approved`, and `paid`, with approvals/payment actors and times.
- Private storage metadata only; no public document URLs.

Each payroll write must run in a transaction, take a bounded period-scoped
advisory lock, re-check the period lifecycle after the lock, post exactly one
authoritative linked financial movement, and write an immutable audit record.
RLS must remain deny-by-default because these records contain compensation and
identity data.

## Safe deployment sequence

1. Approve the business contracts above and review exact migration SQL.
2. Verify a fresh, restorable production backup in an isolated
   Supabase-compatible environment.
3. Verify pending HR migration history and physical schema using read-only
   preflight queries.
4. Apply scheduling/leave migrations in an approved maintenance window, then
   run isolated PostgreSQL tests.
5. Apply the separately reviewed attendance/payroll migration only after its
   test fixtures prove locking, idempotency, reversals, and branch isolation.
6. Deploy application code only after build, browser, and isolated database
   acceptance tests pass.

## Current readiness

Scheduling/leave code is **not production-integrated** until its migrations
are verified and applied. Payroll is **not designed or implemented** pending
the explicit business and legal/accounting decisions above. This prevents an
unreviewed payroll change from corrupting financial history.
