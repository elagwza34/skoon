# HR and payroll financial audit

Audit date: 2026-11-16. Review only. No application fixes, migrations, database queries, or database writes were performed. Existing application changes were preserved.

## Evidence and limits

Executed from the repository root:

```powershell
node --require ./tests/node-userinfo-workaround.cjs --import tsx docs/audits/financial-2026-11-16/hr-offline-reproduction.ts
```

Result: exit code 0. The script invokes actual payroll and attendance services against a strict in-memory Prisma substitute, with a dummy datasource on localhost port 1. It also invokes the actual pure time calculator and native NextResponse serializer. The concurrency finding uses an explicitly controlled service interleaving; no live PostgreSQL concurrency test was run. Static findings below are identified separately.

P1 means material incorrect payment amounts or an ordinary workflow that is blocked. P2 means a narrower correctness or operational defect.

## Findings confirmed by execution

### HR-01 — P1: successful HR mutations return HTTP 500 after committing

Locations: `src/app/api/staff/hr/payroll/route.ts:7`, `src/app/api/staff/hr/financials/route.ts:7`, `src/app/api/staff/hr/payroll/[id]/route.ts:5`, `src/app/api/staff/hr/payroll/lines/[id]/payments/route.ts:5`. Equivalent raw-record responses occur in overtime routes.

The routes await writes and pass their raw Prisma records to `NextResponse.json`. Records contain bigint identifiers. Executing `NextResponse.json({ period: { id: 1n } })` throws `Do not know how to serialize a BigInt`. A repository search found no global bigint serialization override. Mutation success therefore becomes a generic 500 after the write has returned. GET responses also fail once records exist. The payroll UI cannot receive the created period ID and create its run. Retrying an adjustment or advance can create another record because those creation endpoints have no idempotency key.

Recommendation: convert the entire response to explicit JSON DTOs, using string IDs, before response construction. Add route-level mutation-and-response coverage, including committed writes and retries.

### HR-02 — P1: mid-period monthly salary changes pay a complete salary for every segment

Locations: `src/lib/staff-payroll-write.ts:145`, `src/lib/staff-payroll-write.ts:146`, `src/lib/hr-payroll-calculation.ts:26`.

The generator passes each compensation segment's scheduled minutes as its monthly divisor. A fully attended segment therefore receives the full monthly amount regardless of its fraction of the month. Actual service reproduction: August 1–15 at EGP 5,000 and August 16–30 at EGP 6,000 produces EGP 11,000; equal fifteen-day proration produces EGP 5,500. The same denominator also pays a complete monthly amount for an arbitrary shorter payroll period; the period schema imposes no month boundary.

Recommendation: establish the contractual full-month schedule basis independently of each segment, prorate each effective salary against that basis, and define behavior for periods spanning multiple months.

### HR-03 — P1: any approved leave blocks the entire branch payroll

Locations: `src/lib/staff-attendance-summary.ts:37`, `src/lib/staff-attendance-summary.ts:42`, `src/lib/hr-time-calculation.ts:124`, `src/lib/staff-payroll-write.ts:126`.

Persisted leave has `isPaid`; the calculator expects `paid`. The attendance service passes database rows unchanged. Actual-service reproduction with both `isPaid: true` and `isPaid: false` gives zero payable leave minutes and `leaveClassificationUnknown: true`; generation throws a classification blocker. One employee's blocker stops the entire run at line 151.

Recommendation: map persisted classification explicitly and retain the intended fail-closed treatment for null classification.

### HR-04 — P1: paid official holidays are silently deducted

Locations: `src/lib/staff-attendance-summary.ts:38`, `src/lib/hr-time-calculation.ts:123`, `src/lib/hr-time-calculation.ts:126`.

The database retrieves holiday `isPaid`, but the holiday input type contains no classification and the calculator uses holiday rows only as a flag. Actual-service reproduction: a scheduled eight-hour paid holiday without attendance returns zero payable minutes and 480 missing minutes. `isPaid: null` gives the same result without triggering the missing-classification blocker. Monthly and hourly payroll can therefore underpay classified paid holidays without an error.

Recommendation: include holiday paid classification in the calculation and pay scheduled eligible minutes; block unknown classification consistently.

### HR-05 — P1: effective-rate changes cause approved deductions to be discarded

Locations: `src/lib/staff-payroll-write.ts:146`, `src/lib/hr-payroll-calculation.ts:43`.

All adjustments are attached to the first segment, and the calculator caps deductions against that segment's gross. The generator then sums the capped results. Actual-service reproduction: fifteen days at EGP 100/hour plus fifteen at EGP 200/hour produces EGP 36,000 gross; an approved EGP 15,000 deduction is reduced to EGP 12,000 and net becomes EGP 24,000 instead of EGP 21,000. No source record marks the unapplied EGP 3,000 for recovery.

Recommendation: aggregate period earnings first and apply period adjustments once against the full-period gross.

### HR-06 — P2: overtime after a pay change uses the first effective rate

Location: `src/lib/staff-payroll-write.ts:146`.

The generator assigns the whole overtime array to the segment starting at period start. Actual-service reproduction: an hourly rate increases from EGP 100 to EGP 200 on August 16; sixty approved overtime minutes on August 20 receive a 50% premium of EGP 50, rather than EGP 100. The reverse rate change overpays.

Recommendation: associate overtime with its actual work date and effective compensation rate before aggregation.

### HR-07 — P2: an internal compensation-history gap passes full-coverage validation

Locations: `src/lib/staff-payroll-write.ts:121`, `src/lib/staff-payroll-write.ts:122`.

The check validates the earliest start and maximum end, without checking adjacency. Actual-service reproduction: hourly rates cover August 1–10 and August 20 onward. Generation succeeds for August 1–30 and pays EGP 16,800 at EGP 100/hour, silently omitting nine worked days. The history writer accepts an explicit end before a later rate, so a gap can arise through supported writes.

Recommendation: validate complete continuous coverage and reject internal gaps before generating any lines.

### HR-08 — P2: approving an advance creates an unrecoverable payroll blocker

Locations: `src/lib/staff-payroll-write.ts:129`, `src/lib/staff-payroll-write.ts:130`, `src/lib/staff-hr-financial-write.ts:21`.

Actual-service reproduction: an approved EGP 100 advance with zero repaid amount blocks the whole run. The error requires an approved repayment plan, but the repository has no repayment-plan model or service and no writer for `repaidAmount`. An approved advance cannot be rejected or cancelled through its pending-only decision service. This is an incomplete workflow rather than an unsafe calculation: the fail-closed guard itself is appropriate.

Recommendation: finish repayment allocation, settlement, and cancellation before enabling advance approval, or expose an explicit supported way to resolve the blocker.

### HR-09 — P2: zero-net lines permanently prevent payroll completion

Locations: `src/lib/staff-payroll-write.ts:191`, `src/lib/staff-payroll-write.ts:22`, `src/lib/staff-payroll-write.ts:221`, `src/lib/staff-payroll-write.ts:227`.

Approval assigns `approved` to every draft line, including net zero. A zero-net line permits no positive payment because the outstanding amount is zero; zero payment fails schema validation. No other path marks the line paid. A mixed run remains partially paid after other staff are paid, and a zero-only run remains approved. Actual-service reproduction confirms both payment rejections and failure to close.

Recommendation: finalize zero-outstanding lines during approval and derive run/period completion from outstanding obligations.

### HR-10 — P2: unpaid breaks are included in payable hourly time

Locations: `src/lib/hr-time-calculation.ts:90`, `src/lib/hr-time-calculation.ts:126`.

Pure-calculator reproduction: a 09:00–17:00 schedule with a sixty-minute unpaid break and matching shift yields 420 scheduled minutes but 480 payable minutes. The break reduces only scheduled time; payroll pays the full raw shift duration. At EGP 100/hour, the shift pays EGP 800 instead of EGP 700. The extra sixty minutes also appear as extra work.

Recommendation: calculate payable working time after the documented unpaid-break rule while retaining raw attendance separately.

### HR-11 — P2: a delayed review can reverse an already-approved run

Locations: `src/lib/staff-payroll-write.ts:179`, `src/lib/staff-payroll-write.ts:186`.

The transition transaction reads status and later updates by ID only. Unlike generation, it takes no shared advisory or row lock, and it uses no compare-and-set status predicate. Controlled actual-service interleaving: review A reads draft and pauses; review B completes; approval completes; review A resumes and writes `under_review`. Final state is an under-review run with approved lines. Payments reject the run, and another approval rejects the already-approved lines. PostgreSQL concurrency was not exercised; the deterministic reproduction models the code's default READ COMMITTED statement ordering.

Recommendation: serialize generation, review, approval, and closing through a common run lock, or atomically enforce the expected old status.

## Additional static findings and gaps

- **P1 candidate: overlapping payroll periods can repay the same work and adjustments.** `src/lib/staff-payroll-write.ts:51` creates any valid date range; only an identical pair is unique (`prisma/schema.prisma:550`). Run uniqueness is only by period and branch (`:565`). Lines are unique only within a run (`:582`). Payroll sources are selected anew by date and have no allocation linkage. August 1–30 followed by August 2–30 is structurally accepted and can include the same worked time, overtime, and adjustments. No database execution was performed. Recommend a defined nonoverlap/adjustment-run model with employee/source allocation controls.
- **Decision races:** `src/lib/staff-hr-financial-write.ts:19`, `:21`, `src/lib/staff-overtime-write.ts:25`, and `src/lib/staff-leave-write.ts:47` read pending then update by ID without locking or an expected-status predicate. Concurrent approval/rejection can overwrite a final decision. No database reproduction was run.
- **Overtime policy enforcement:** `dailyLimitMinutes`, `monthlyLimitMinutes`, and `graceMinutes` are stored but never applied by payroll generation or overtime approval. Requests can overlap or duplicate, and detected minutes are accepted from the caller without relation to elapsed interval or attendance. Newer global policies also win over older employee policies because selection orders only by effective date. These behaviors need an explicit policy contract and tests.
- **Overtime date boundaries:** `src/lib/staff-payroll-write.ts:131` selects UTC timestamps for a Cairo-date period; approved work shortly after local midnight on the first day is omitted, and early work on the following local day can be included. It also assigns all minutes according to request start instead of splitting intervals spanning a period boundary. Policy date ends are compared to full timestamps at `:135`, so most work on an inclusive end date misses that policy. Static only.
- **Historical employee scope:** `src/lib/staff-payroll-write.ts:98` selects currently active staff in their current branch, not staff employed during the payroll period. Terminated staff and transferred staff can be omitted from their earned historical payroll. There is no branch-employment history in the selected inputs. Static only.
- **Audit consistency:** payroll, financial adjustment, advance, and overtime writers do not create `auditLog` records. Creator/approver IDs exist, but generation snapshots omit source adjustment, overtime, policy, and rate IDs. Reconciliation cannot identify exactly which source records a calculation consumed. Leave and compensation writers do create transactional audit rows.
- **Ledger boundaries:** HR functions deliberately do not write cashier/POS ledgers. This protects operational tills, but payroll payment records represent recorded disbursements without a link to an actual bank/cash expense or financial ledger. Treat accounting integration and reconciliation as unfinished, not as demonstrated till corruption.
- **UI coverage:** payroll management displays only line counts, with no employee calculation/payment detail or payment controls. It picks the first employee branch when creating a run and always creates a new period, making multi-branch same-period creation unavailable through that UI. Static only.

## Sound controls

- Payroll, compensation, adjustments, advances, overtime, and private HR data use explicit Owner-role gates independent of editable permissions.
- Attendance access checks both employee identity and branch; managers are restricted to their branch.
- Payroll payment uses a serializable transaction, line row lock, positive exact-cent input, outstanding-balance guard, and a unique `(payrollLineId, idempotencyKey)` key.
- Generation serializes competing generation writes using a transaction-scoped advisory lock and rechecks draft status before replacing lines.
- Final decisions require a different requester/approver for adjustments, advances, and overtime. Leave blocks employee self-review.
- Payroll calculation uses integer cents and BigInt products for multiplication/division, and caps deductions/recovery so net cannot become negative.
- Local migration enables RLS on the new financial tables and revokes access from PUBLIC, anon, and authenticated. Database deployment was not checked.
- Missing contracts, unsupported compensation kinds, missing schedule basis, unresolved advances, and unknown leave classification fail closed.

## Existing test coverage gaps

`tests/offline.test.ts:1720` onward covers pure schedule arithmetic, overnight splitting, hand-constructed `paid` leave inputs, simple payroll arithmetic, and status helper transitions. It does not cover persisted `isPaid` mapping, actual generation with segmented salaries, adjustments against multiple segments, rate gaps, paid holidays, unpaid breaks, zero-net completion, serialized route responses, or concurrency between transitions. `tests/hr-postgres.test.ts` covers employee lifecycle, compensation history, and manager isolation, not payroll or HR financial services. No network database suite was executed for this audit.
