import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { canManageEmployeeLifecycle } from '@/lib/hr-authz'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import { calculatePayroll, type PayrollAdjustment, type PayrollOvertime } from '@/lib/hr-payroll-calculation'
import { getAttendanceSummary } from '@/lib/staff-attendance-summary'

/** Payroll mutations are deliberately Owner-only. They never create POS, till,
 * inventory, shift, or ledger entries. Amounts are accepted as decimal strings
 * and converted to integer cents before any comparison. */
export class PayrollError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'PayrollError' }
}

const date = z.coerce.date()
const periodSchema = z.object({ startsOn: date, endsOn: date }).refine((v) => v.endsOn >= v.startsOn, { message: 'Period end cannot precede its start' })
const paymentSchema = z.object({
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/, 'Amount must be a positive EGP amount'),
  method: z.enum(['cash', 'bank_transfer', 'wallet', 'other']),
  idempotencyKey: z.string().uuid(),
}).superRefine((value, ctx) => { if (toCents(value.amount) <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Payment amount must be positive' }) })

function owner(session: StaffSession) { if (!canManageEmployeeLifecycle(session.role)) throw new PayrollError('Owner access is required', 403) }
function unavailable(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') throw new PayrollError('Phase D HR migration is not applied yet', 503)
  throw error
}
function day(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())) }
function decimalCents(value: Prisma.Decimal | string | number): number { return toCents(String(value)) }
function centsDecimal(cents: number) { return new Prisma.Decimal(cents).div(100) }
export function toCents(value: string): number {
  const [whole, fraction = ''] = value.split('.')
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
  if (!Number.isSafeInteger(cents) || cents < 0) throw new PayrollError('Invalid monetary amount')
  return cents
}

export function nextPayrollStatus(current: string, event: 'review' | 'approve' | 'close'): string {
  if (event === 'review' && current === 'draft') return 'under_review'
  if (event === 'approve' && current === 'under_review') return 'approved'
  if (event === 'close' && current === 'paid') return 'closed'
  throw new PayrollError('This payroll status transition is not allowed', 409)
}

export async function createPayrollPeriod(session: StaffSession, input: unknown) {
  owner(session)
  const parsed = periodSchema.safeParse(input)
  if (!parsed.success) throw new PayrollError(parsed.error.issues[0]?.message ?? 'Invalid payroll period')
  try {
    return await prisma.payrollPeriod.create({ data: { startsOn: day(parsed.data.startsOn), endsOn: day(parsed.data.endsOn), createdById: session.id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new PayrollError('A payroll period already exists for these dates', 409)
    return unavailable(error)
  }
}

/** Creates the empty draft container only. Server-side generation must add
 * authoritative calculation snapshots before the run can be reviewed. */
export async function createPayrollRun(session: StaffSession, periodId: bigint, branchId: bigint) {
  owner(session)
  try {
    const branch = await prisma.cafeBranch.findUnique({ where: { id: branchId }, select: { id: true } })
    if (!branch) throw new PayrollError('Branch not found', 404)
    return await prisma.payrollRun.create({ data: { periodId, branchId, createdById: session.id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new PayrollError('A payroll run already exists for this branch and period', 409)
    return unavailable(error)
  }
}

function key(date: Date) { return date.toISOString().slice(0, 10) }
function addDays(date: Date, amount: number) { const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + amount)); return next }
function rangeOverlaps(start: Date, end: Date, from: Date, until: Date | null) { return from <= end && (!until || until >= start) }
function decimalBasisPoints(value: Prisma.Decimal | null) {
  if (!value) return 10_000
  const [whole, fraction = ''] = value.toString().split('.')
  const result = Number(whole) * 10_000 + Number((fraction + '0000').slice(0, 4))
  if (!Number.isSafeInteger(result) || result < 0) throw new PayrollError('Invalid overtime policy multiplier')
  return result
}

/**
 * Builds only draft lines from authoritative HR records. It intentionally
 * fails closed for any employee without a spanning contract/rate/schedule,
 * unclassified leave, unsupported compensation model, or unresolved advance
 * recovery plan. It never writes shifts, cash, inventory, or ledgers.
 */
export async function generatePayrollDraft(session: StaffSession, runId: bigint) {
  owner(session)
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId } })
    if (!run) throw new PayrollError('Payroll run not found', 404)
    if (run.status !== 'draft') throw new PayrollError('Only a draft payroll run can be recalculated', 409)
    const period = await prisma.payrollPeriod.findUnique({ where: { id: run.periodId } })
    if (!period) throw new PayrollError('Payroll period not found', 409)
    const staff = await prisma.user.findMany({
      where: { branchId: run.branchId, isActive: true, deletedAt: null, employeeProfile: { is: { employmentStatus: 'active', archivedAt: null } } },
      select: {
        id: true, roleId: true,
        employeeProfile: {
          select: {
            id: true,
            contracts: { select: { effectiveFrom: true, effectiveUntil: true } },
            compensationRates: { select: { compensationType: true, amount: true, effectiveFrom: true, effectiveUntil: true } },
          },
        },
      },
    })
    const periodStart = day(period.startsOn), periodEnd = day(period.endsOn)
    const lineInputs: Array<{ employeeId: string; grossCents: number; deductionCents: number; netCents: number; snapshot: Prisma.InputJsonValue }> = []
    const blockers: Array<{ employeeId: string; reason: string }> = []

    for (const worker of staff) {
      const profile = worker.employeeProfile
      if (!profile) { blockers.push({ employeeId: worker.id, reason: 'Missing HR profile' }); continue }
      const hasContract = profile.contracts.some((contract) => contract.effectiveFrom <= periodStart && (!contract.effectiveUntil || contract.effectiveUntil >= periodEnd))
      if (!hasContract) { blockers.push({ employeeId: worker.id, reason: 'No active employment contract spans this payroll period' }); continue }
      const rates = profile.compensationRates.filter((rate) => rangeOverlaps(periodStart, periodEnd, rate.effectiveFrom, rate.effectiveUntil)).sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())
      if (!rates.length) { blockers.push({ employeeId: worker.id, reason: 'Missing effective compensation rate' }); continue }
      const coverageEnd = rates.reduce((latest, rate) => !rate.effectiveUntil || rate.effectiveUntil > latest ? (rate.effectiveUntil ?? periodEnd) : latest, periodStart)
      if (rates[0].effectiveFrom > periodStart || coverageEnd < periodEnd) { blockers.push({ employeeId: worker.id, reason: 'Compensation history does not cover the full payroll period' }); continue }
      if (rates.some((rate) => !['monthly', 'hourly'].includes(rate.compensationType))) { blockers.push({ employeeId: worker.id, reason: 'Only monthly and hourly compensation are supported for automated payroll' }); continue }

      const attendance = await getAttendanceSummary(session, { employeeId: worker.id, startsOn: key(periodStart), endsOn: key(periodEnd) })
      if (attendance.totals.leaveClassificationUnknown) { blockers.push({ employeeId: worker.id, reason: 'Leave or holiday paid classification is missing' }); continue }
      if (attendance.totals.scheduledMinutes === 0) { blockers.push({ employeeId: worker.id, reason: 'Missing effective work schedule' }); continue }
      const adjustments = await prisma.hrAdjustment.findMany({ where: { employeeId: worker.id, status: 'approved', effectiveOn: { gte: periodStart, lte: periodEnd } }, select: { type: true, amount: true } })
      const advances = await prisma.employeeAdvance.findMany({ where: { employeeId: worker.id, status: 'approved' }, select: { amount: true, repaidAmount: true } })
      if (advances.some((advance) => decimalCents(advance.amount) > decimalCents(advance.repaidAmount))) { blockers.push({ employeeId: worker.id, reason: 'Outstanding advance needs an approved repayment plan' }); continue }
      const overtimeRows = await prisma.overtimeRequest.findMany({ where: { employeeId: worker.id, status: 'approved', startsAt: { gte: periodStart, lt: addDays(periodEnd, 1) } }, select: { startsAt: true, category: true, approvedMinutes: true } })
      const policies = await prisma.overtimePolicy.findMany({ where: { effectiveFrom: { lte: periodEnd }, AND: [{ OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: periodStart } }] }, { OR: [{ employeeId: worker.id }, { roleId: worker.roleId }, { branchId: run.branchId }, { employeeId: null, roleId: null, branchId: null }] }] }, orderBy: { effectiveFrom: 'desc' } })
      const overtime: PayrollOvertime[] = []
      for (const overtimeRow of overtimeRows) {
        const policy = policies.find((candidate) => candidate.effectiveFrom <= overtimeRow.startsAt && (!candidate.effectiveUntil || candidate.effectiveUntil >= overtimeRow.startsAt) && (candidate.employeeId === worker.id || candidate.roleId === worker.roleId || candidate.branchId === run.branchId || (!candidate.employeeId && !candidate.roleId && !candidate.branchId)))
        if (!policy) { blockers.push({ employeeId: worker.id, reason: 'Approved overtime has no effective overtime policy' }); break }
        const multiplier = overtimeRow.category === 'rest_day' ? policy.restDayMultiplier : overtimeRow.category === 'holiday' ? policy.holidayMultiplier : overtimeRow.category === 'night' ? policy.nightMultiplier : policy.regularMultiplier
        overtime.push({ approvedMinutes: overtimeRow.approvedMinutes ?? 0, multiplierBasisPoints: decimalBasisPoints(multiplier), premiumOnly: policy.premiumOnly, ...(policy.fixedHourlyRate ? { hourlyRateCents: decimalCents(policy.fixedHourlyRate) } : {}) })
      }
      if (blockers.some((blocker) => blocker.employeeId === worker.id)) continue
      const total: { baseCents: number; overtimeCents: number; bonusCents: number; deductionCents: number; advanceRecoveryCents: number; grossCents: number; netCents: number; segments: Prisma.InputJsonValue[] } = { baseCents: 0, overtimeCents: 0, bonusCents: 0, deductionCents: 0, advanceRecoveryCents: 0, grossCents: 0, netCents: 0, segments: [] }
      for (const rate of rates) {
        const start = rate.effectiveFrom > periodStart ? rate.effectiveFrom : periodStart; const end = rate.effectiveUntil && rate.effectiveUntil < periodEnd ? rate.effectiveUntil : periodEnd
        if (start > end) continue
        const segment = await getAttendanceSummary(session, { employeeId: worker.id, startsOn: key(start), endsOn: key(end) })
        const calculation = calculatePayroll({ compensation: { kind: rate.compensationType as 'monthly' | 'hourly', cents: decimalCents(rate.amount), scheduledMinutes: segment.totals.scheduledMinutes, payableMinutes: segment.totals.payableMinutes }, overtime: start.getTime() === periodStart.getTime() ? overtime : [], adjustments: start.getTime() === periodStart.getTime() ? adjustments.map((item): PayrollAdjustment => ({ type: item.type as 'bonus' | 'deduction' | 'penalty', cents: decimalCents(item.amount), approved: true })) : [] })
        total.baseCents += calculation.baseCents; total.overtimeCents += calculation.overtimeCents; total.bonusCents += calculation.bonusCents; total.deductionCents += calculation.deductionCents; total.advanceRecoveryCents += calculation.advanceRecoveryCents; total.grossCents += calculation.grossCents; total.netCents += calculation.netCents; total.segments.push({ startsOn: key(start), endsOn: key(end), calculation })
      }
      lineInputs.push({ employeeId: worker.id, grossCents: total.grossCents, deductionCents: total.deductionCents + total.advanceRecoveryCents, netCents: total.netCents, snapshot: { version: 1, period: { startsOn: key(periodStart), endsOn: key(periodEnd) }, totals: total } })
    }
    if (blockers.length) throw new PayrollError(`Payroll generation blocked: ${blockers.map((b) => `${b.employeeId}: ${b.reason}`).join('; ')}`, 409)
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hr-payroll:' || ${runId.toString()}))`
      const locked = await tx.payrollRun.findUnique({ where: { id: runId }, select: { status: true } })
      if (!locked || locked.status !== 'draft') throw new PayrollError('Only a draft payroll run can be recalculated', 409)
      await tx.payrollLine.deleteMany({ where: { payrollRunId: runId, status: 'draft' } })
      await tx.payrollLine.createMany({ data: lineInputs.map((line) => ({ payrollRunId: runId, employeeId: line.employeeId, grossAmount: centsDecimal(line.grossCents), deductionAmount: centsDecimal(line.deductionCents), netAmount: centsDecimal(line.netCents), snapshot: line.snapshot })) })
      return { generated: lineInputs.length, runId }
    })
  } catch (error) { return unavailable(error) }
}

export async function listPayrollRuns(session: StaffSession) {
  owner(session)
  try {
    const runs = await prisma.payrollRun.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    const [periods, lines] = await Promise.all([
      prisma.payrollPeriod.findMany({ where: { id: { in: runs.map((run) => run.periodId) } } }),
      prisma.payrollLine.findMany({ where: { payrollRunId: { in: runs.map((run) => run.id) } }, orderBy: { id: 'asc' } }),
    ])
    return runs.map((run) => ({ ...run, period: periods.find((period) => period.id === run.periodId) ?? null, lines: lines.filter((line) => line.payrollRunId === run.id) }))
  } catch (error) { return unavailable(error) }
}

export async function transitionPayrollRun(session: StaffSession, runId: bigint, event: 'review' | 'approve' | 'close') {
  owner(session)
  try {
    return await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { id: runId } })
      if (!run) throw new PayrollError('Payroll run not found', 404)
      const lines = await tx.payrollLine.findMany({ where: { payrollRunId: run.id }, select: { id: true, status: true } })
      const status = nextPayrollStatus(run.status, event)
      if ((event === 'review' || event === 'approve') && lines.length === 0) throw new PayrollError('Payroll run has no calculated employee lines', 409)
      if (event === 'approve' && lines.some((line) => line.status !== 'draft')) throw new PayrollError('Only untouched draft lines can be approved', 409)
      const now = new Date()
      const updated = await tx.payrollRun.update({ where: { id: run.id }, data: {
        status,
        ...(event === 'review' ? { reviewedById: session.id } : {}),
        ...(event === 'approve' ? { approvedById: session.id, approvedAt: now } : {}),
      } })
      if (event === 'approve') await tx.payrollLine.updateMany({ where: { payrollRunId: run.id, status: 'draft' }, data: { status: 'approved' } })
      return updated
    })
  } catch (error) { return unavailable(error) }
}

/**
 * Serializable transaction + row lock makes partial payments safe under
 * concurrent requests. The (line,idempotency key) unique constraint makes a
 * client retry return the original payment rather than charging twice.
 */
export async function recordPayrollPayment(session: StaffSession, lineId: bigint, input: unknown) {
  owner(session)
  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) throw new PayrollError(parsed.error.issues[0]?.message ?? 'Invalid payroll payment')
  const cents = toCents(parsed.data.amount)
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.payrollPayment.findUnique({ where: { payrollLineId_idempotencyKey: { payrollLineId: lineId, idempotencyKey: parsed.data.idempotencyKey } } })
      if (previous) return { payment: previous, replay: true }

      // PostgreSQL row lock protects the balance check even when two distinct
      // idempotency keys are submitted at the same time.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM payroll_lines WHERE id = ${lineId} FOR UPDATE`)
      const line = await tx.payrollLine.findUnique({ where: { id: lineId } })
      if (!line) throw new PayrollError('Payroll line not found', 404)
      const run = await tx.payrollRun.findUnique({ where: { id: line.payrollRunId } })
      if (!run) throw new PayrollError('Payroll run not found', 409)
      if (!['approved', 'partially_paid'].includes(line.status) || !['approved', 'partially_paid'].includes(run.status)) throw new PayrollError('Payroll must be approved before payment', 409)
      const outstanding = decimalCents(line.netAmount) - decimalCents(line.paidAmount)
      if (cents > outstanding) throw new PayrollError('Payment exceeds the approved outstanding balance', 409)
      const nextPaid = decimalCents(line.paidAmount) + cents
      const lineStatus = nextPaid === decimalCents(line.netAmount) ? 'paid' : 'partially_paid'
      const payment = await tx.payrollPayment.create({ data: { payrollLineId: line.id, amount: centsDecimal(cents), method: parsed.data.method, idempotencyKey: parsed.data.idempotencyKey, recordedById: session.id, recordedAt: new Date() } })
      await tx.payrollLine.update({ where: { id: line.id }, data: { paidAmount: centsDecimal(nextPaid), status: lineStatus } })

      const remaining = await tx.payrollLine.count({ where: { payrollRunId: line.payrollRunId, status: { not: 'paid' } } })
      const runStatus = remaining === 0 ? 'paid' : 'partially_paid'
      await tx.payrollRun.update({ where: { id: line.payrollRunId }, data: { status: runStatus } })
      const openRuns = await tx.payrollRun.count({ where: { periodId: run.periodId, status: { not: 'paid' } } })
      if (openRuns === 0) await tx.payrollPeriod.update({ where: { id: run.periodId }, data: { status: 'paid' } })
      return { payment, replay: false }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const replay = await prisma.payrollPayment.findUnique({ where: { payrollLineId_idempotencyKey: { payrollLineId: lineId, idempotencyKey: parsed.data.idempotencyKey } } })
      if (replay) return { payment: replay, replay: true }
    }
    return unavailable(error)
  }
}
