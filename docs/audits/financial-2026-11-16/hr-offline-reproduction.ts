/** Read-only audit evidence. Uses the real HR services with an in-memory Prisma substitute.
 * Run from repository root:
 * node --require ./tests/node-userinfo-workaround.cjs --import tsx docs/audits/financial-2026-11-16/hr-offline-reproduction.ts
 * No database client is constructed; unknown mock accesses throw immediately.
 */
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

async function main() {
  process.env.DATABASE_URL = 'postgresql://dummy:dummy@127.0.0.1:1/dummy'
  process.env.DIRECT_URL = process.env.DATABASE_URL
  const date = (key: string) => new Date(`${key}T00:00:00.000Z`)
  const amount = (value: number) => new Prisma.Decimal(value)
  const employeeId = '11111111-1111-4111-8111-111111111111'
  const owner = { id: '22222222-2222-4222-8222-222222222222', email: null, name: 'Audit owner', role: 'owner' as const, branchId: null, permissions: [] }
  const days = Array.from({ length: 7 }, (_, weekday) => ({ weekday, restDay: false, startsAt: '09:00', endsAt: '17:00', intervals: [] }))
  const schedule = { effectiveFrom: date('2026-08-01'), effectiveUntil: null, graceMinutes: 0, days }
  const firstRate = { compensationType: 'monthly', amount: amount(5000), effectiveFrom: date('2026-08-01'), effectiveUntil: null }
  const state: any = { rates: [firstRate], shifts: [], leaves: [], holidays: [], advances: [], overtime: [], policies: [], adjustments: [], lines: [] }
  const run = { id: 1n, status: 'draft', periodId: 1n, branchId: 1n }
  const mock: any = {
    user: { findMany: async () => [{ id: employeeId, roleId: 1n, employeeProfile: { id: 1n, contracts: [{ effectiveFrom: date('2026-08-01'), effectiveUntil: null }], compensationRates: state.rates } }], findFirst: async () => ({ id: employeeId, branchId: 1n }) },
    payrollRun: { findUnique: async () => ({ ...run }) },
    payrollPeriod: { findUnique: async () => ({ id: 1n, startsOn: date('2026-08-01'), endsOn: date('2026-08-30') }) },
    workSchedule: { findMany: async () => [schedule] },
    shift: { findMany: async () => state.shifts },
    attendanceCorrection: { findMany: async () => [] },
    leaveRequest: { findMany: async () => state.leaves },
    officialHoliday: { findMany: async () => state.holidays },
    hrAdjustment: { findMany: async () => state.adjustments },
    employeeAdvance: { findMany: async () => state.advances },
    overtimeRequest: { findMany: async () => state.overtime },
    overtimePolicy: { findMany: async () => state.policies },
    payrollLine: { deleteMany: async () => { state.lines = [] }, createMany: async ({ data }: any) => { state.lines = data } },
    $executeRaw: async () => 0,
  }
  mock.$transaction = async (work: any) => work(mock)
  ;(globalThis as any).prisma = new Proxy(mock, { get(target, key) { if (!(key in target)) throw new Error(`Unexpected mock access: ${String(key)}`); return target[key] } })
  const { generatePayrollDraft, recordPayrollPayment, transitionPayrollRun } = await import('../../../src/lib/staff-payroll-write')
  const { getAttendanceSummary } = await import('../../../src/lib/staff-attendance-summary')
  const { calculateHrTimeSummary } = await import('../../../src/lib/hr-time-calculation')

  // Actual service: database-shaped isPaid never reaches calculator's paid field.
  for (const isPaid of [true, false]) {
    state.leaves = [{ status: 'approved', startsOn: date('2026-08-03'), endsOn: date('2026-08-03'), isPaid }]
    const summary = await getAttendanceSummary(owner, { employeeId, startsOn: '2026-08-03', endsOn: '2026-08-03' })
    assert.equal(summary.totals.leaveClassificationUnknown, true)
    assert.equal(summary.totals.payableMinutes, 0)
    await assert.rejects(() => generatePayrollDraft(owner, 1n), /paid classification is missing/)
    console.log(`CONFIRMED: approved leave isPaid=${isPaid} blocks payroll as unknown`)
  }
  state.leaves = []

  // Actual service: classified paid holiday is silently unpaid; null does not block.
  for (const isPaid of [true, null]) {
    state.holidays = [{ startsOn: date('2026-08-03'), endsOn: date('2026-08-03'), isPaid }]
    const summary = await getAttendanceSummary(owner, { employeeId, startsOn: '2026-08-03', endsOn: '2026-08-03' })
    assert.equal(summary.days[0].holiday, true)
    assert.equal(summary.totals.payableMinutes, 0)
    assert.equal(summary.totals.leaveClassificationUnknown, false)
    console.log(`CONFIRMED: holiday isPaid=${isPaid} yields zero payable minutes and no blocker`)
  }
  state.holidays = []
  state.shifts = Array.from({ length: 30 }, (_, index) => {
    const key = `2026-08-${String(index + 1).padStart(2, '0')}`
    return { id: BigInt(index + 1), openedAt: new Date(`${key}T06:00:00.000Z`), closedAt: new Date(`${key}T14:00:00.000Z`) }
  })

  // Actual generator: two fifteen-day salary segments each receive a whole month.
  state.rates = [{ ...firstRate, effectiveUntil: date('2026-08-15') }, { ...firstRate, amount: amount(6000), effectiveFrom: date('2026-08-16') }]
  await generatePayrollDraft(owner, 1n)
  assert.equal(String(state.lines[0].grossAmount), '11000')
  console.log('CONFIRMED: 5000/6000 mid-month salary change generates EGP 11000; equal half-month proration is EGP 5500')

  // Actual generator: all overtime uses the first rate, even when worked after a raise.
  state.rates = [{ ...firstRate, compensationType: 'hourly', amount: amount(100), effectiveUntil: date('2026-08-15') }, { ...firstRate, compensationType: 'hourly', amount: amount(200), effectiveFrom: date('2026-08-16') }]
  state.overtime = [{ startsAt: new Date('2026-08-20T14:00:00.000Z'), category: 'regular', approvedMinutes: 60 }]
  state.policies = [{ effectiveFrom: date('2026-08-01'), effectiveUntil: null, employeeId, roleId: null, branchId: null, regularMultiplier: amount(1.5), premiumOnly: true, fixedHourlyRate: null }]
  await generatePayrollDraft(owner, 1n)
  assert.equal(state.lines[0].snapshot.totals.overtimeCents, 5000)
  console.log('CONFIRMED: overtime after hourly raise from 100 to 200 uses old rate, premium EGP 50 instead of EGP 100')

  // Actual generator: deductions are capped against the first segment, not full-period gross.
  state.overtime = []; state.policies = []
  state.adjustments = [{ type: 'deduction', amount: amount(15000) }]
  await generatePayrollDraft(owner, 1n)
  assert.equal(String(state.lines[0].grossAmount), '36000')
  assert.equal(String(state.lines[0].deductionAmount), '12000')
  assert.equal(String(state.lines[0].netAmount), '24000')
  console.log('CONFIRMED: approved EGP 15000 deduction on EGP 36000 gross is truncated to 12000; net 24000 instead of 21000')
  state.adjustments = []

  // Actual generator: endpoint coverage check accepts an internal effective-rate gap.
  state.rates = [{ ...firstRate, compensationType: 'hourly', amount: amount(100), effectiveUntil: date('2026-08-10') }, { ...firstRate, compensationType: 'hourly', amount: amount(100), effectiveFrom: date('2026-08-20') }]
  await generatePayrollDraft(owner, 1n)
  assert.equal(String(state.lines[0].grossAmount), '16800')
  console.log('CONFIRMED: effective-rate gap August 11–19 passes generation and silently omits nine worked days')

  state.overtime = []; state.policies = []; state.rates = [firstRate]
  state.advances = [{ amount: amount(100), repaidAmount: amount(0) }]
  await assert.rejects(() => generatePayrollDraft(owner, 1n), /Outstanding advance needs an approved repayment plan/)
  console.log('CONFIRMED: approved outstanding advance blocks entire branch run; source has no repayment-plan or repaidAmount writer')
  state.advances = []

  // Paid status cannot be reached when an approved employee line has zero net.
  run.status = 'approved'
  mock.payrollLine.findUnique = async () => ({ id: 1n, payrollRunId: 1n, status: 'approved', netAmount: amount(0), paidAmount: amount(0) })
  mock.payrollLine.findMany = async () => [{ id: 1n, status: 'approved' }]
  mock.payrollPayment = { findUnique: async () => null }
  mock.$queryRaw = async () => [{ id: 1n }]
  await assert.rejects(() => recordPayrollPayment(owner, 1n, { amount: '0.01', method: 'cash', idempotencyKey: '33333333-3333-4333-8333-333333333333' }), /exceeds the approved outstanding balance/)
  await assert.rejects(() => recordPayrollPayment(owner, 1n, { amount: '0', method: 'cash', idempotencyKey: '33333333-3333-4333-8333-333333333333' }), /must be positive/)
  await assert.rejects(() => transitionPayrollRun(owner, 1n, 'close'), /transition is not allowed/)
  console.log('CONFIRMED: zero-net approved line accepts no payment and run cannot close')

  // Deterministic service interleaving, matching default READ COMMITTED semantics.
  // One review pauses after reading draft; another review and approval finish first.
  run.status = 'draft'
  let lineStatus = 'draft'
  let delayNextRead = true
  let releaseRead!: () => void
  let signalRead!: () => void
  const blocked = new Promise<void>(resolve => { signalRead = resolve })
  const release = new Promise<void>(resolve => { releaseRead = resolve })
  mock.payrollLine.findMany = async () => {
    if (delayNextRead) { delayNextRead = false; signalRead(); await release }
    return [{ id: 1n, status: lineStatus }]
  }
  mock.payrollRun.update = async ({ data }: any) => { Object.assign(run, data); return { ...run } }
  mock.payrollLine.updateMany = async ({ data }: any) => { lineStatus = data.status; return { count: 1 } }
  const delayedReview = transitionPayrollRun(owner, 1n, 'review')
  await blocked
  await transitionPayrollRun(owner, 1n, 'review')
  await transitionPayrollRun(owner, 1n, 'approve')
  releaseRead()
  await delayedReview
  assert.equal(run.status, 'under_review')
  assert.equal(lineStatus, 'approved')
  console.log('CONFIRMED SERVICE INTERLEAVING: delayed review regresses approved run to under_review while line remains approved')

  // Pure calculation: unpaid break reduces schedule only, not payable shift time.
  const breakSummary = calculateHrTimeSummary({ startsOn: '2026-08-03', endsOn: '2026-08-03', schedules: [{ ...schedule, days: days.map(day => ({ ...day, intervals: [{ startsAt: '09:00', endsAt: '17:00', unpaidBreakMinutes: 60 }] })) }], shifts: [{ id: 1n, openedAt: '2026-08-03T06:00:00Z', closedAt: '2026-08-03T14:00:00Z' }] })
  assert.equal(breakSummary.totals.scheduledMinutes, 420)
  assert.equal(breakSummary.totals.payableMinutes, 480)
  console.log('CONFIRMED: 09:00–17:00 with 60 unpaid break minutes produces 480 payable minutes rather than 420')

  // Native route serializer, same raw result shape returned by HR writers.
  assert.throws(() => NextResponse.json({ period: { id: 1n } }), /serialize a BigInt/)
  console.log('CONFIRMED: NextResponse.json rejects raw Prisma bigint IDs after mutation has returned')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
