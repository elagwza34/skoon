/** Offline financial regression. Uses the real HR services with an in-memory Prisma substitute.
 * Run from repository root:
 * node --require ./tests/node-userinfo-workaround.cjs --import tsx docs/audits/financial-2026-11-16/hr-offline-reproduction.ts
 * No database client is constructed; unknown mock accesses throw immediately.
 */
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { financialJson } from '../src/lib/financial-json'

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
  const { generatePayrollDraft } = await import('../src/lib/staff-payroll-write')
  const { getAttendanceSummary } = await import('../src/lib/staff-attendance-summary')
  const { calculateHrTimeSummary } = await import('../src/lib/hr-time-calculation')

  // Actual service: database-shaped isPaid never reaches calculator's paid field.
  for (const isPaid of [true, false]) {
    state.leaves = [{ status: 'approved', startsOn: date('2026-08-03'), endsOn: date('2026-08-03'), isPaid }]
    const summary = await getAttendanceSummary(owner, { employeeId, startsOn: '2026-08-03', endsOn: '2026-08-03' })
    assert.equal(summary.totals.leaveClassificationUnknown, false)
    assert.equal(summary.totals.payableMinutes, isPaid === true ? 480 : 0)

  }
  state.leaves = []

  // Actual service: classified paid holiday is silently unpaid; null does not block.
  for (const isPaid of [true, null]) {
    state.holidays = [{ startsOn: date('2026-08-03'), endsOn: date('2026-08-03'), isPaid }]
    const summary = await getAttendanceSummary(owner, { employeeId, startsOn: '2026-08-03', endsOn: '2026-08-03' })
    assert.equal(summary.days[0].holiday, true)
    assert.equal(summary.totals.payableMinutes, isPaid === true ? 480 : 0)
    assert.equal(summary.totals.leaveClassificationUnknown, isPaid === null)
  }
  state.holidays = []
  state.shifts = Array.from({ length: 30 }, (_, index) => {
    const key = `2026-08-${String(index + 1).padStart(2, '0')}`
    return { id: BigInt(index + 1), openedAt: new Date(`${key}T06:00:00.000Z`), closedAt: new Date(`${key}T14:00:00.000Z`) }
  })

  // Actual generator: two fifteen-day salary segments each receive a whole month.
  state.rates = [{ ...firstRate, effectiveUntil: date('2026-08-15') }, { ...firstRate, amount: amount(6000), effectiveFrom: date('2026-08-16') }]
  await generatePayrollDraft(owner, 1n)
  assert.equal(String(state.lines[0].grossAmount), '5322.58')

  // Actual generator: all overtime uses the first rate, even when worked after a raise.
  state.rates = [{ ...firstRate, compensationType: 'hourly', amount: amount(100), effectiveUntil: date('2026-08-15') }, { ...firstRate, compensationType: 'hourly', amount: amount(200), effectiveFrom: date('2026-08-16') }]
  state.overtime = [{ startsAt: new Date('2026-08-20T14:00:00.000Z'), category: 'regular', approvedMinutes: 60 }]
  state.policies = [{ effectiveFrom: date('2026-08-01'), effectiveUntil: null, employeeId, roleId: null, branchId: null, regularMultiplier: amount(1.5), premiumOnly: true, fixedHourlyRate: null }]
  await generatePayrollDraft(owner, 1n)
  assert.equal(state.lines[0].snapshot.totals.overtimeCents, 10000)

  // Actual generator: deductions are capped against the first segment, not full-period gross.
  state.overtime = []; state.policies = []
  state.adjustments = [{ type: 'deduction', amount: amount(15000) }]
  await generatePayrollDraft(owner, 1n)
  assert.equal(String(state.lines[0].grossAmount), '36000')
  assert.equal(String(state.lines[0].deductionAmount), '15000')
  assert.equal(String(state.lines[0].netAmount), '21000')
  state.adjustments = []

  // Actual generator: endpoint coverage check accepts an internal effective-rate gap.
  state.rates = [{ ...firstRate, compensationType: 'hourly', amount: amount(100), effectiveUntil: date('2026-08-10') }, { ...firstRate, compensationType: 'hourly', amount: amount(100), effectiveFrom: date('2026-08-20') }]
  await assert.rejects(() => generatePayrollDraft(owner, 1n), /Compensation history does not cover/)
  state.overtime = []; state.policies = []; state.rates = [firstRate]
  state.advances = [{ amount: amount(100), repaidAmount: amount(0) }]
  await generatePayrollDraft(owner, 1n)
  assert.equal(state.lines[0].snapshot.outstandingAdvanceCents, 10000)
  assert.equal(state.lines[0].snapshot.advanceRecovery, 'explicit_receipted_repayment')
  state.advances = []


}
test('payroll generation prorates monthly salary, dates overtime, applies full deductions, rejects gaps and preserves advance debt', main)

import { test } from 'node:test'

test('financial JSON serializes bigint identifiers after successful mutations', async () => {
  const response = financialJson({ id: 1n, nested: [{ periodId: 2n }], amount: new Prisma.Decimal('1.25') })
  assert.deepEqual(await response.json(), { id: '1', nested: [{ periodId: '2' }], amount: '1.25' })
})

test('unpaid breaks reduce actual payable minutes', async () => {
  const { calculateHrTimeSummary } = await import('../src/lib/hr-time-calculation')
  const result = calculateHrTimeSummary({ startsOn: '2026-08-03', endsOn: '2026-08-03', timezone: 'UTC', schedules: [{ effectiveFrom: '2026-08-01', graceMinutes: 0, days: [{ weekday: 1, restDay: false, intervals: [{ startsAt: '09:00', endsAt: '17:00', unpaidBreakMinutes: 60 }] }] }], shifts: [{ id: 1n, openedAt: '2026-08-03T09:00:00Z', closedAt: '2026-08-03T17:00:00Z' }] })
  assert.equal(result.totals.payableMinutes, 420)
  assert.equal(result.totals.missingMinutes, 0)
})

test('zero-net payroll is settled at approval and closes without manufacturing a payment', async () => {
  const state: any = { periodStatus: 'draft', run: { id: 1n, periodId: 1n, status: 'under_review' }, line: { id: 1n, payrollRunId: 1n, status: 'draft', netAmount: new Prisma.Decimal(0) }, locks: 0 }
  const client: any = {
    $executeRaw: async () => { state.locks++; return 1 },
    payrollPeriod: { update: async ({data}: any) => {state.periodStatus=data.status} },
    payrollRun: { count: async ({where}: any) => { assert.deepEqual(where.status.notIn, ['paid', 'closed']); return 0 }, findUnique: async () => ({ ...state.run }), update: async ({ data }: any) => Object.assign(state.run, data) },
    payrollLine: {
      findMany: async () => [state.line],
      updateMany: async ({ where, data }: any) => { if (state.line.status === where.status && where.netAmount === 0) Object.assign(state.line, data); return { count: 1 } },
    },
    $transaction: async (body: any) => body(client),
  }
  ;(globalThis as any).prisma = client
  const { transitionPayrollRun } = await import('../src/lib/staff-payroll-write')
  const owner = { id: '22222222-2222-4222-8222-222222222222', role: 'owner' as const, branchId: null, permissions: [], name: 'Owner', email: null }
  await transitionPayrollRun(owner, 1n, 'approve')
  assert.equal(state.run.status, 'paid')
  assert.equal(state.periodStatus, 'paid')
  assert.equal(state.line.status, 'paid')
  await assert.rejects(transitionPayrollRun(owner, 1n, 'review'), (error: any) => error.status === 409)
  await transitionPayrollRun(owner, 1n, 'close')
  assert.equal(state.run.status, 'closed')
  assert.equal(state.locks, 4)
})

test('advance recovery is receipted, capped, durable and owner-only', async () => {
  const row: any = { id: 1n, branchId: 1n, amount: new Prisma.Decimal(100), repaidAmount: new Prisma.Decimal(0), status: 'approved' }
  const operations: any[] = [], audits: any[] = []
  const client: any = {
    $executeRaw: async () => 1,
    employeeAdvance: { findUnique: async () => row, update: async ({ data }: any) => Object.assign(row, data) },
    financialOperation: {
      findUnique: async ({ where }: any) => operations.find(operation => operation.idempotencyKey === where.branchId_actorId_operationType_idempotencyKey.idempotencyKey) ?? null,
      create: async ({ data }: any) => { operations.push(data); return data },
    },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return data } },
    $transaction: async (body: any) => body(client),
  }
  ;(globalThis as any).prisma = client
  const { recordAdvanceRepayment } = await import('../src/lib/staff-hr-financial-write')
  const owner = { id: '22222222-2222-4222-8222-222222222222', role: 'owner' as const, branchId: null, permissions: [], name: 'Owner', email: null }
  const input = { advanceId: '1', amount: '60', receiptReference: 'verified-bank-receipt-1', idempotencyKey: 'advance-repayment-key-1' }
  const first = await recordAdvanceRepayment(owner, input)
  assert.deepEqual(await recordAdvanceRepayment(owner, { ...input, advanceId: '01' }), first)
  assert.equal(String(row.repaidAmount), '60')
  assert.equal(operations.length, 1)
  assert.equal(audits.length, 1)
  await assert.rejects(recordAdvanceRepayment(owner, { ...input, amount: '50', idempotencyKey: 'advance-repayment-key-2' }), (error: any) => error.status === 409)
  await assert.rejects(recordAdvanceRepayment({ ...owner, role: 'cashier', branchId: '1' }, input), (error: any) => error.status === 403)
  await recordAdvanceRepayment(owner, { ...input, amount: '40', receiptReference: 'verified-bank-receipt-2', idempotencyKey: 'advance-repayment-key-2' })
  assert.equal(row.status, 'repaid')
  assert.equal(String(row.repaidAmount), '100')
})
