import { toCents } from '@/lib/finance-metrics'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, isOwner } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'
import { FinancialShiftLockError, type FinancialTransaction, lockAndReadShift } from '@/lib/financial-shift-lock'

export class FloatError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'FloatError' }
}

/** Revalidate a pre-transaction shift lookup under the shared cash lock. */
async function lockCashierShiftForMovement(tx: FinancialTransaction, shiftId: bigint, session: StaffSession, branchId: bigint) {
  try {
    const locked = await lockAndReadShift(tx, shiftId)
    if (!locked || locked.status !== 'open' || locked.cashierId !== session.id || locked.branchId !== branchId) {
      throw new FloatError('لا توجد وردية مفتوحة لهذا الموظف', 409)
    }
    return locked
  } catch (error) {
    if (error instanceof FinancialShiftLockError) throw new FloatError(error.message, error.status)
    throw error
  }
}

export const floatMovementSchema = z.object({
  amount: z.coerce.number().positive().max(9_999_999),
  direction: z.enum(['addition', 'withdrawal']),
  reason: z.string().trim().min(3).max(255),
  branchId: z.coerce.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

export interface FixedFloatBoard {
  branchId: string; balance: string; additions: string; withdrawals: string
  available: string; baseline: string; outstanding: string; requiresReconciliation: boolean
  movements: { id: string; type: string; amount: string; source: string; destination: string; reason: string; occurredAt: string; actor: string | null }[]
}

export interface SharedFloatSummary {
  available: string; baseline: string; outstanding: string; requiresReconciliation: boolean
  advances: { cashierId: string; cashier: string; outstanding: string }[]
  advanceDetails: { id: string; cashierId: string | null; cashier: string; amount: string; returned: string; outstanding: string; reason: string; shiftId: string | null; createdAt: string }[]
  unallocatedReturns: string
  movements: FixedFloatBoard['movements']
}

const advanceSchema = z.object({ amount: z.coerce.number().positive().max(9_999_999), reason: z.string().trim().min(3).max(255), advanceId: z.string().regex(/^\d+$/).optional(), idempotencyKey: z.string().trim().min(8).max(100).optional() })

/**
 * Available float is the net effect of persisted account directions, not names:
 * +amount when FIXED_FLOAT is destination; −amount when it is source. Therefore
 * compensating reversals are naturally applied exactly once. The invariant is
 * available + linked outstanding = verified baseline + net additions − net withdrawals.
 */
export function sharedFloatTotals(rows: { type: string; amount: unknown; sourceAccount: string; destinationAccount: string }[]) {
  let available = 0, baseline = 0, additions = 0, withdrawals = 0
  for (const row of rows) {
    const value = Number(row.amount)
    // Legacy paired transfers used MAIN_SAFE -> FIXED_FLOAT twice. Only the addition is the float leg.
    if (row.type === 'main_safe_withdrawal') continue
    const effect = (row.destinationAccount === 'FIXED_FLOAT' ? value : 0) - (row.sourceAccount === 'FIXED_FLOAT' ? value : 0)
    available += effect
    if (row.type === 'fixed_float_baseline') baseline += effect
    else if (row.type === 'fixed_float_addition' || row.type === 'fixed_float_addition_reversal' || row.type === 'fixed_float_reconciliation') additions += effect
    else if (row.type === 'fixed_float_withdrawal' || row.type === 'fixed_float_withdrawal_reversal') withdrawals -= effect
  }
  return { baseline, additions, withdrawals, available, requiresReconciliation: !rows.some((row) => row.type === 'fixed_float_baseline') }
}

export async function getSharedFloatSummary(session: StaffSession, branchIdRaw?: string): Promise<SharedFloatSummary> {
  let branchId: bigint | null = session.branchId ? BigInt(session.branchId) : null
  if (session.role === ROLE.OWNER && branchIdRaw && /^\d+$/.test(branchIdRaw)) branchId = BigInt(branchIdRaw)
  if (session.role === ROLE.OWNER && !branchId) branchId = await firstBranchId()
  if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('Choose a branch', 400)
  const movements = await prisma.financialMovement.findMany({ where: { branchId }, orderBy: { occurredAt: 'desc' }, select: { id: true, type: true, amount: true, sourceAccount: true, destinationAccount: true, reason: true, occurredAt: true, actorId: true, advanceId: true, metadata: true, sourceShiftId: true, actor: { select: { name: true } } } })
  const totals = sharedFloatTotals(movements)
  const balances = new Map<string, { cashier: string; amount: number }>()
  for (const row of movements) {
    const debtorId = row.type === 'fixed_float_settlement' && row.metadata && typeof row.metadata === 'object' && 'debtorId' in row.metadata ? String(row.metadata.debtorId) : row.actorId
    if (!debtorId || !['fixed_float_advance', 'fixed_float_return', 'fixed_float_settlement'].includes(row.type)) continue
    const entry = balances.get(debtorId) ?? { cashier: row.actor?.name ?? '—', amount: 0 }
    entry.amount += row.type === 'fixed_float_advance' ? Number(row.amount) : -Number(row.amount); balances.set(debtorId, entry)
  }
  const advanceDetails = movements.filter(m => m.type === 'fixed_float_advance').map(a => { const returned = movements.filter(m => m.advanceId === a.id && ['fixed_float_return','fixed_float_settlement'].includes(m.type)).reduce((n,m) => n + Number(m.amount), 0); return { id: a.id.toString(), cashierId: a.actorId, cashier: a.actor?.name ?? '—', amount: Number(a.amount).toFixed(2), returned: returned.toFixed(2), outstanding: (Number(a.amount)-returned).toFixed(2), reason: a.reason, shiftId: a.sourceShiftId?.toString() ?? null, createdAt: a.occurredAt.toISOString() } })
  const unallocatedReturns = movements.filter(m => ['fixed_float_return','fixed_float_settlement'].includes(m.type) && !m.advanceId).reduce((n,m) => n + Number(m.amount), 0)
  const outstanding = advanceDetails.reduce((n, a) => n + Number(a.outstanding), 0)
  return { available: totals.available.toFixed(2), baseline: totals.baseline.toFixed(2), outstanding: outstanding.toFixed(2), requiresReconciliation: totals.requiresReconciliation || unallocatedReturns > 0, advances: [...balances.entries()].filter(([, v]) => v.amount > 0).map(([cashierId, v]) => ({ cashierId, cashier: v.cashier, outstanding: v.amount.toFixed(2) })), advanceDetails, unallocatedReturns: unallocatedReturns.toFixed(2), movements: movements.slice(0, 300).map((m) => ({ id: m.id.toString(), type: m.type, amount: Number(m.amount).toFixed(2), source: m.sourceAccount, destination: m.destinationAccount, reason: m.reason, occurredAt: m.occurredAt.toISOString(), actor: m.actor?.name ?? null })) }
}

export async function recordSharedFloatAdvance(session: StaffSession, input: unknown) {
  if (session.role !== ROLE.CASHIER) throw new FloatError('Only cashiers may take a float advance', 403)
  if (session.branchId === null) throw new FloatError('Forbidden', 403)
  const parsed = advanceSchema.safeParse(input); if (!parsed.success) throw new FloatError(parsed.error.issues[0]?.message ?? 'Invalid advance')
  const branchId = BigInt(session.branchId); const shift = await getOpenShift(session.id, branchId); if (!shift) throw new FloatError('An open shift is required', 409)
  const key = parsed.data.idempotencyKey ?? createHash('sha256').update(`${session.id}:${Date.now()}:${Math.random()}`).digest('hex'); const type = 'fixed_float_advance'; const fingerprint = createHash('sha256').update(JSON.stringify({ amount: parsed.data.amount, reason: parsed.data.reason, branchId: branchId.toString() })).digest('hex')
  return prisma.$transaction(async (tx) => {
    await lockCashierShiftForMovement(tx, shift.id, session, branchId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shared-float:' || ${branchId.toString()}))`
    const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType: type, idempotencyKey: key } } }); if (prior) { if (prior.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409); return prior.result }
    const rows = await tx.financialMovement.findMany({ where: { branchId }, select: { type: true, amount: true, sourceAccount: true, destinationAccount: true } }); const summary = sharedFloatTotals(rows); if (summary.requiresReconciliation) throw new FloatError('Shared fixed float requires an authorized baseline reconciliation', 409); if (parsed.data.amount > summary.available) throw new FloatError('Insufficient shared fixed-float balance', 409)
    const movement = await tx.financialMovement.create({ data: { branchId, type, amount: parsed.data.amount.toFixed(2), sourceAccount: 'FIXED_FLOAT', destinationAccount: 'CASHIER_ADVANCE', sourceShiftId: shift.id, actorId: session.id, reason: parsed.data.reason } }); const result = { id: movement.id.toString(), outstanding: parsed.data.amount.toFixed(2) }
    await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType: type, idempotencyKey: key, fingerprint, result } }); await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'fixed_float.advance', entityType: 'financial_movement', entityId: movement.id, newValues: result } }); return result
  })
}

export async function returnSharedFloatAdvance(session: StaffSession, input: unknown) {
  if (session.role !== ROLE.CASHIER || session.branchId === null) throw new FloatError('Forbidden', 403)
  const parsed = advanceSchema.safeParse(input); if (!parsed.success) throw new FloatError('Invalid return')
  if (!parsed.data.advanceId) throw new FloatError('Select the original advance to return', 400)
  const branchId = BigInt(session.branchId); const shift = await getOpenShift(session.id, branchId); if (!shift) throw new FloatError('An open shift is required', 409); const advanceId = BigInt(parsed.data.advanceId); const key = parsed.data.idempotencyKey ?? createHash('sha256').update(`${session.id}:${Date.now()}:${Math.random()}`).digest('hex'); const fingerprint = createHash('sha256').update(JSON.stringify({ advanceId: parsed.data.advanceId, amount: parsed.data.amount, reason: parsed.data.reason })).digest('hex')
  return prisma.$transaction(async (tx) => { await lockCashierShiftForMovement(tx, shift.id, session, branchId); await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('advance-repayment:' || ${advanceId.toString()}))`; const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType: 'fixed_float_return', idempotencyKey: key } } }); if (prior) { if (prior.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409); return prior.result }; const advance = await tx.financialMovement.findFirst({ where: { id: advanceId, branchId, actorId: session.id, type: 'fixed_float_advance' }, select: { amount: true } }); if (!advance) throw new FloatError('Advance not found', 404); const repayments = await tx.financialMovement.aggregate({ where: { advanceId, type: { in: ['fixed_float_return','fixed_float_settlement'] } }, _sum: { amount: true } }); const owed = Number(advance.amount) - Number(repayments._sum.amount ?? 0); if (parsed.data.amount > owed) throw new FloatError('Return exceeds this advance outstanding balance', 409); const movement = await tx.financialMovement.create({ data: { branchId, type: 'fixed_float_return', amount: parsed.data.amount.toFixed(2), sourceAccount: 'CASHIER_ADVANCE', destinationAccount: 'FIXED_FLOAT', sourceShiftId: shift.id, actorId: session.id, advanceId, reason: parsed.data.reason } }); const result = { id: movement.id.toString(), outstanding: (owed - parsed.data.amount).toFixed(2) }; await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType: 'fixed_float_return', idempotencyKey: key, fingerprint, result } }); await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'fixed_float.return', entityType: 'financial_movement', entityId: movement.id, newValues: { ...result, advanceId: parsed.data.advanceId } } }); return result })
}

/** Manager receipt against one original advance; works after its shift closes. */
export async function settleSharedFloatAdvance(session: StaffSession, advanceIdRaw: string, input: unknown) {
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new FloatError('Forbidden', 403)
  if (!/^\d+$/.test(advanceIdRaw)) throw new FloatError('Advance not found', 404)
  const parsed = advanceSchema.safeParse(input); if (!parsed.success) throw new FloatError('Invalid settlement')
  const advanceId = BigInt(advanceIdRaw)
  const advance = await prisma.financialMovement.findUnique({ where: { id: advanceId }, select: { id: true, branchId: true, actorId: true, type: true, amount: true, reason: true, sourceShiftId: true } })
  if (!advance || advance.type !== 'fixed_float_advance' || !advance.actorId || !staffCanAccessBranch(session, advance.branchId)) throw new FloatError('Advance not found', 404)
  const debtorId = advance.actorId
  const key = parsed.data.idempotencyKey ?? createHash('sha256').update(`${session.id}:${Date.now()}:${Math.random()}`).digest('hex'); const fingerprint = createHash('sha256').update(JSON.stringify({ advanceId: advanceIdRaw, amount: parsed.data.amount, reason: parsed.data.reason })).digest('hex')
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('advance-repayment:' || ${advanceId.toString()}))`
    const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId: advance.branchId, actorId: session.id, operationType: 'fixed_float_settlement', idempotencyKey: key } } }); if (prior) { if (prior.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409); return prior.result }
    const priorReturns = await tx.financialMovement.findMany({ where: { advanceId, type: { in: ['fixed_float_return', 'fixed_float_settlement'] } }, select: { amount: true } })
    const returned = priorReturns.reduce((sum, r) => sum + Number(r.amount), 0); const remaining = Number(advance.amount) - returned
    if (parsed.data.amount > remaining) throw new FloatError('Settlement exceeds advance outstanding balance', 409)
    const movement = await tx.financialMovement.create({ data: { branchId: advance.branchId, type: 'fixed_float_settlement', amount: parsed.data.amount.toFixed(2), sourceAccount: 'CASHIER_ADVANCE', destinationAccount: 'FIXED_FLOAT', actorId: session.id, advanceId, reason: parsed.data.reason, metadata: { advanceId: advanceId.toString(), debtorId, originalShiftId: advance.sourceShiftId?.toString() ?? 'none', receiptVerifiedBy: session.id } } }); const result = { id: movement.id.toString(), advanceId: advanceId.toString(), remaining: (remaining - parsed.data.amount).toFixed(2) }
    await tx.financialOperation.create({ data: { branchId: advance.branchId, actorId: session.id, operationType: 'fixed_float_settlement', idempotencyKey: key, fingerprint, result } }); await tx.auditLog.create({ data: { userId: session.id, branchId: advance.branchId, action: 'fixed_float.settlement', entityType: 'financial_movement', entityId: movement.id, newValues: { ...result, originalReason: advance.reason, debtorId: advance.actorId } } }); return result
  })
}

export async function establishFixedFloatBaseline(session: StaffSession, input: unknown) {
  if (!isOwner(session.role)) throw new FloatError('فقط المالك يمكنه تأسيس/تسوية خط أساس العهدة الثابتة', 403)
  const parsed = z.object({
    amount: z.coerce.number().min(0).max(9_999_999),
    reason: z.string().trim().min(3).max(255),
    confirmed: z.literal(true),
    reconcileFromNow: z.boolean().optional(),
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
    branchId: z.coerce.number().int().positive().optional(),
  }).safeParse(input)
  if (!parsed.success) throw new FloatError('مطلوب: المبلغ، سبب واضح، وتأكيد الجرد الفعلي')
  const branchId = session.branchId ? BigInt(session.branchId) : BigInt(parsed.data.branchId ?? 0)
  if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('Forbidden', 403)
  const key = parsed.data.idempotencyKey ?? createHash('sha256').update(`${session.id}:${Date.now()}:${Math.random()}`).digest('hex')
  const fingerprint = createHash('sha256').update(JSON.stringify({ branchId: branchId.toString(), amount: parsed.data.amount, reason: parsed.data.reason, reconcileFromNow: !!parsed.data.reconcileFromNow })).digest('hex')
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fixed-float-baseline:' || ${branchId.toString()}))`
    const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType: 'fixed_float_baseline', idempotencyKey: key } } })
    if (prior) { if (prior.fingerprint !== fingerprint) throw new FloatError('تم إعادة استخدام مفتاح العملية مع بيانات مختلفة', 409); return prior.result }
    const existing = await tx.financialMovement.findFirst({ where: { branchId, type: 'fixed_float_baseline' } })
    if (existing) throw new FloatError('يوجد خط أساس موثق لهذا الفرع بالفعل', 409)

    const rows = await tx.financialMovement.findMany({ where: { branchId }, select: { type: true, amount: true, sourceAccount: true, destinationAccount: true } })
    const hasFloatHistory = rows.some((r) => r.sourceAccount === 'FIXED_FLOAT' || r.sourceAccount === 'CASHIER_ADVANCE' || r.destinationAccount === 'FIXED_FLOAT' || r.destinationAccount === 'CASHIER_ADVANCE')
    if (hasFloatHistory && !parsed.data.reconcileFromNow) {
      throw new FloatError('توجد حركات عهدة سابقة. فعّل خيار "تسوية وبدء من الآن" بعد الجرد الفعلي لاعتماد الرصيد الحالي وتصفير أثر السجل السابق محاسبيًا.', 409)
    }

    const target = Number(parsed.data.amount.toFixed(2))
    let adjustmentMovementId: string | null = null
    if (hasFloatHistory && parsed.data.reconcileFromNow) {
      const currentNet = sharedFloatTotals(rows).available
      const deltaToZero = Number((-currentNet).toFixed(2))
      if (Math.abs(deltaToZero) >= 0.005) {
        const adj = await tx.financialMovement.create({
          data: {
            branchId,
            type: 'fixed_float_reconciliation',
            amount: Math.abs(deltaToZero).toFixed(2),
            sourceAccount: deltaToZero >= 0 ? 'OPENING_RECONCILIATION' : 'FIXED_FLOAT',
            destinationAccount: deltaToZero >= 0 ? 'FIXED_FLOAT' : 'OPENING_RECONCILIATION',
            actorId: session.id,
            reason: `[تسوية وبدء من الآن] تصفير أثر السجل السابق: ${parsed.data.reason}`,
            metadata: { reconcileFromNow: true, previousNet: Number(currentNet.toFixed(2)), target, reconciledBy: session.id },
          },
          select: { id: true },
        })
        adjustmentMovementId = adj.id.toString()
      }
    }

    const movement = await tx.financialMovement.create({
      data: {
        branchId,
        type: 'fixed_float_baseline',
        amount: target.toFixed(2),
        sourceAccount: 'OPENING_RECONCILIATION',
        destinationAccount: 'FIXED_FLOAT',
        actorId: session.id,
        reason: parsed.data.reason,
        metadata: { actualCashConfirmed: true, reconciledBy: session.id, reconcileFromNow: !!parsed.data.reconcileFromNow, adjustmentMovementId },
      },
    })
    const result = { id: movement.id.toString(), baseline: target.toFixed(2), adjustmentMovementId }
    await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType: 'fixed_float_baseline', idempotencyKey: key, fingerprint, result } })
    await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'fixed_float.baseline', entityType: 'financial_movement', entityId: movement.id, newValues: result } })
    return result
  })
}

export async function getFixedFloatBoard(session: StaffSession): Promise<FixedFloatBoard> {
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new FloatError('Forbidden', 403)
  const branchId = session.branchId ? BigInt(session.branchId) : await firstBranchId()
  if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('Forbidden', 403)
  const movements = await prisma.financialMovement.findMany({
    where: { branchId },
    orderBy: { occurredAt: 'desc' },
    select: { id: true, type: true, amount: true, sourceAccount: true, destinationAccount: true, reason: true, occurredAt: true, advanceId: true, actor: { select: { name: true } } },
  })
  const totals = sharedFloatTotals(movements)
  const { additions, withdrawals } = totals
  const advanceRows = movements.filter(m => m.type === 'fixed_float_advance')
  const outstanding = advanceRows.reduce((sum, advance) => {
    const returned = movements.filter(m => m.advanceId === advance.id && ['fixed_float_return', 'fixed_float_settlement'].includes(m.type)).reduce((n, m) => n + Number(m.amount), 0)
    return sum + Math.max(0, Number(advance.amount) - returned)
  }, 0)
  const unallocatedReturns = movements.filter(m => ['fixed_float_return', 'fixed_float_settlement'].includes(m.type) && !m.advanceId).reduce((n, m) => n + Number(m.amount), 0)
  return {
    branchId: branchId.toString(),
    balance: (totals.baseline + additions - withdrawals).toFixed(2),
    additions: additions.toFixed(2),
    withdrawals: withdrawals.toFixed(2),
    available: totals.available.toFixed(2),
    baseline: totals.baseline.toFixed(2),
    outstanding: outstanding.toFixed(2),
    requiresReconciliation: totals.requiresReconciliation || unallocatedReturns > 0,
    movements: movements.slice(0, 200).map((m) => ({ id: m.id.toString(), type: m.type, amount: Number(m.amount).toFixed(2), source: m.sourceAccount, destination: m.destinationAccount, reason: m.reason, occurredAt: m.occurredAt.toISOString(), actor: m.actor?.name ?? null })),
  }

}

async function firstBranchId(): Promise<bigint | null> {
  const branch = await prisma.cafeBranch.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' }, select: { id: true } })
  return branch?.id ?? null
}

/** Post an immutable fixed-float transfer; it is deliberately not a Payment. */
export async function recordFixedFloatMovement(session: StaffSession, input: unknown) {
  const parsed = floatMovementSchema.safeParse(input)
  if (!parsed.success) throw new FloatError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة')
  const branchId = session.branchId ? BigInt(session.branchId) : BigInt(parsed.data.branchId ?? 0)
  if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('غير مصرح', 403)
  const operational = session.role === ROLE.CASHIER && parsed.data.direction === 'withdrawal'
  if (!operational && session.role !== ROLE.OWNER) throw new FloatError('غير مصرح — تحويلات الخزنة الثابتة للمالك فقط', 403)
  if (!operational && parsed.data.direction === 'addition') {
    const result = await transferMainSafeToFixedFloat({ ...session, branchId: branchId.toString() }, parsed.data.amount, parsed.data.reason, parsed.data.idempotencyKey)
    return { id: result.additionId }
  }
  const shift = operational ? await getOpenShift(session.id, branchId) : null
  if (operational && !shift) throw new FloatError('يلزم وجود وردية كاشير مفتوحة', 409)
  const data = parsed.data
  const key = data.idempotencyKey ?? createHash('sha256').update(`${session.id}:${Date.now()}:${Math.random()}`).digest('hex')
  const operationType = operational ? 'cashier_operational_withdrawal' : `fixed_float_${data.direction}`
  const fingerprint = createHash('sha256').update(JSON.stringify({ amount: data.amount, direction: data.direction, reason: data.reason, operational, branchId: branchId.toString() })).digest('hex')
  const previous = await prisma.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType, idempotencyKey: key } } })
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409)
    return previous.result as { id: string; occurredAt: string }
  }
  try { return await prisma.$transaction(async (tx) => {
    if (operational) await lockCashierShiftForMovement(tx, shift!.id, session, branchId)
    // Serialise fixed-float debits per branch, then calculate availability in
    // the same transaction. Cashier drawer withdrawals do not consume float.
    if (!operational) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shared-float:' || ${branchId.toString()}))`
    // For operational withdrawals (cashier till), enforce available till cash.
    if (operational && data.direction === 'withdrawal') {
      const [payments, refunds, withdrawals, cashRefunds] = await Promise.all([
        tx.payment.findMany({ where: { shiftId: shift!.id }, select: { method: true, status: true, amount: true } }),
        tx.payment.findMany({ where: { shiftId: shift!.id, status: 'refunded', method: 'cash' }, select: { amount: true } }),
        tx.financialMovement.aggregate({ where: { sourceShiftId: shift!.id, type: 'operational_withdrawal', status: 'posted' }, _sum: { amount: true } }),
        tx.financialMovement.aggregate({ where: { sourceShiftId: shift!.id, type: 'cash_refund', status: 'posted' }, _sum: { amount: true } }),
      ])
      const cashIn = payments.filter(p => p.method === 'cash' && p.status === 'completed').reduce((n,p) => n + Number(p.amount), 0)
      const cashOut = refunds.reduce((n,p) => n + Number(p.amount), 0)
      const w = Number(withdrawals._sum.amount ?? 0)
      const available = Number((cashIn - cashOut - w - Number(cashRefunds._sum.amount ?? 0)).toFixed(2))
      if (data.amount > available) throw new FloatError('رصيد الصندوق غير كافٍ للسحب التشغيلي', 409)
    }
    if (!operational && data.direction === 'withdrawal') {
      const rows = await tx.financialMovement.findMany({ where: { branchId }, select: { type: true, amount: true, sourceAccount: true, destinationAccount: true } })
      const summary = sharedFloatTotals(rows)
      if (summary.requiresReconciliation) throw new FloatError('العهدة الثابتة تحتاج تأسيس/تسوية خط أساس موثق قبل السحب. أنشئ خط أساس للفرع (إن لم توجد حركات سابقة) أو نفّذ تسوية يدوية معتمدة.', 409)
      if (data.amount > summary.available) throw new FloatError('رصيد العهدة الثابتة المتاح غير كافٍ للسحب', 409)
    }
    const movement = await tx.financialMovement.create({
      data: {
        branchId, type: operational ? 'operational_withdrawal' : `fixed_float_${data.direction}`,
        amount: data.amount.toFixed(2), sourceAccount: operational ? 'CASHIER_TILL' : data.direction === 'addition' ? 'MAIN_SAFE' : 'FIXED_FLOAT',
        destinationAccount: data.direction === 'addition' ? 'FIXED_FLOAT' : 'OPERATIONAL_EXPENSE',
        actorId: session.id, sourceShiftId: shift?.id, reason: data.reason,
      }, select: { id: true, occurredAt: true },
    })
    await tx.auditLog.create({ data: {
      userId: session.id, branchId, action: 'fixed_float.movement', entityType: 'financial_movement', entityId: movement.id,
      newValues: { direction: data.direction, amount: data.amount.toFixed(2), reason: data.reason, operational },
    } })
    const result = { id: movement.id.toString(), occurredAt: movement.occurredAt.toISOString() }
    await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType, idempotencyKey: key, fingerprint, result } })
    return result
  }) } catch (error) {
    const retried = await prisma.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType, idempotencyKey: key } } })
    if (retried) { if (retried.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409); return retried.result as { id: string; occurredAt: string } }
    throw error
  }
}

export async function reverseFixedFloatMovement(session: StaffSession, movementIdRaw: string, reason: string) {
  if (!isOwner(session.role)) throw new FloatError('Forbidden', 403)
  if (!/^\d+$/.test(movementIdRaw) || reason.trim().length < 3) throw new FloatError('Invalid reversal request')
  const id = BigInt(movementIdRaw)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('movement-reverse:' || ${id.toString()}))`
    const original = await tx.financialMovement.findUnique({ where: { id }, include: { reversal: true } })
    if (!original || !staffCanAccessBranch(session, original.branchId)) throw new FloatError('Movement not found', 404)
    if (original.reversal || !['fixed_float_addition', 'fixed_float_withdrawal'].includes(original.type)) throw new FloatError('Movement is not eligible for reversal', 409)
    if (original.type === 'fixed_float_addition') {
      const metadata = original.metadata && typeof original.metadata === 'object' && !Array.isArray(original.metadata) ? original.metadata as Record<string, unknown> : null
      const withdrawalId = typeof metadata?.transferWithdrawalId === 'string' && /^\d+$/.test(metadata.transferWithdrawalId) ? BigInt(metadata.transferWithdrawalId) : null
      const funding = withdrawalId ? await tx.financialMovement.findUnique({ where: { id: withdrawalId } }) : null
      if (!funding || original.sourceAccount !== 'FLOAT_TRANSFER' || funding.type !== 'main_safe_withdrawal' || funding.branchId !== original.branchId || funding.sourceAccount !== 'MAIN_SAFE' || funding.destinationAccount !== 'FLOAT_TRANSFER' || toCents(funding.amount) !== toCents(original.amount)) throw new FloatError('Legacy or unverified funding requires manual reconciliation before reversal', 409)
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('main-safe:' || ${original.branchId.toString()}))`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shared-float:' || ${original.branchId.toString()}))`
    if (original.destinationAccount === 'FIXED_FLOAT') {
      const rows = await tx.financialMovement.findMany({ where: { branchId: original.branchId }, select: { type: true, amount: true, sourceAccount: true, destinationAccount: true } })
      if (toCents(original.amount) > toCents(sharedFloatTotals(rows).available.toFixed(2))) throw new FloatError('Insufficient fixed-float balance for reversal', 409)
    }
    const reversal = await tx.financialMovement.create({ data: { branchId: original.branchId, type: `${original.type}_reversal`, amount: original.amount, sourceAccount: original.destinationAccount, destinationAccount: original.type === 'fixed_float_addition' ? 'MAIN_SAFE' : original.sourceAccount, actorId: session.id, reason: reason.trim(), reversalOfId: original.id, metadata: { originalMovementId: original.id.toString() } } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: original.branchId, action: 'financial_movement.reverse', entityType: 'financial_movement', entityId: reversal.id, newValues: { originalMovementId: original.id.toString(), reversalMovementId: reversal.id.toString(), reason: reason.trim() } } })
    return { id: reversal.id.toString(), reversedMovementId: original.id.toString() }
  })
}

/** Main Safe balance — sum of deposits minus withdrawals. */
export interface MainSafeSummary {
  branchId: string
  balance: string
  deposits: string
  withdrawals: string
  movements: { id: string; type: string; amount: string; source: string; destination: string; reason: string; occurredAt: string; actor: string | null }[]
}

/** Read-only Main Safe balance and history (manager+). */
export async function getMainSafeSummary(session: StaffSession): Promise<MainSafeSummary> {
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new FloatError('Forbidden', 403)
  const branchId = session.branchId ? BigInt(session.branchId) : await firstBranchId()
  if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('Forbidden', 403)
  const movements = await prisma.financialMovement.findMany({
    where: {
      branchId,
      type: { in: ['main_safe_deposit', 'main_safe_withdrawal', 'fixed_float_addition_reversal'] },
    },
    orderBy: { occurredAt: 'desc' },

    select: { id: true, type: true, amount: true, sourceAccount: true, destinationAccount: true, reason: true, occurredAt: true, actor: { select: { name: true } } },
  })
  const deposits = movements.filter((m) => (m.type === 'main_safe_deposit' || m.type === 'fixed_float_addition_reversal')).reduce((n, m) => n + Number(m.amount), 0)
  const withdrawals = movements.filter((m) => m.type === 'main_safe_withdrawal').reduce((n, m) => n + Number(m.amount), 0)
  return {
    branchId: branchId.toString(),
    balance: (deposits - withdrawals).toFixed(2),
    deposits: deposits.toFixed(2),
    withdrawals: withdrawals.toFixed(2),
    movements: movements.slice(0, 300).map((m) => ({ id: m.id.toString(), type: m.type, amount: Number(m.amount).toFixed(2), source: m.sourceAccount, destination: m.destinationAccount, reason: m.reason, occurredAt: m.occurredAt.toISOString(), actor: m.actor?.name ?? null })),
  }
}

/** Withdraw from Main Safe — Owner only. Manager must not physically withdraw cash. */
export async function withdrawFromMainSafe(session: StaffSession, amount: number, reason: string, idempotencyKey?: string): Promise<{ id: string; occurredAt: string }> {
  if (session.role !== ROLE.OWNER) throw new FloatError('غير مصرح — السحب من الخزنة الرئيسية للمالك فقط', 403)
  if (!Number.isFinite(amount) || amount <= 0) throw new FloatError('Invalid amount', 400)
  if (!reason.trim() || reason.trim().length < 3) throw new FloatError('Reason required', 400)
  const branchId = session.branchId ? BigInt(session.branchId) : await firstBranchId()
  if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('Forbidden', 403)

  const key = validatedOperationKey(idempotencyKey)
  const operationType = 'main_safe_withdrawal'
  const fingerprint = createHash('sha256').update(JSON.stringify({ amount, reason: reason.trim(), branchId: branchId.toString() })).digest('hex')

  const previous = await prisma.financialOperation.findUnique({
    where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType, idempotencyKey: key } },
  })
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409)
    return previous.result as { id: string; occurredAt: string }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('main-safe:' || ${branchId.toString()}))`

    const replay = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType, idempotencyKey: key } } })
    if (replay) { if (replay.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409); return replay.result as never }
    // Enforce non-negative Main Safe balance
    const [deposits, withdrawals] = await Promise.all([
      tx.financialMovement.aggregate({ where: { branchId, type: { in: ['main_safe_deposit', 'fixed_float_addition_reversal'] }, status: 'posted' }, _sum: { amount: true } }),
      tx.financialMovement.aggregate({ where: { branchId, type: 'main_safe_withdrawal', status: 'posted' }, _sum: { amount: true } }),
    ])
    const currentBalance = Number(deposits._sum.amount ?? 0) - Number(withdrawals._sum.amount ?? 0)
    if (amount > currentBalance) throw new FloatError('رصيد الخزنة الرئيسية غير كافٍ', 409)

    const movement = await tx.financialMovement.create({
      data: {
        branchId, type: 'main_safe_withdrawal', status: 'posted',
        amount: amount.toFixed(2), sourceAccount: 'MAIN_SAFE', destinationAccount: 'OPERATIONAL_EXPENSE',
        actorId: session.id, reason: reason.trim(),
      },
      select: { id: true, occurredAt: true },
    })
    await tx.auditLog.create({ data: {
      userId: session.id, branchId, action: 'main_safe.withdrawal', entityType: 'financial_movement', entityId: movement.id,
      newValues: { amount: amount.toFixed(2), reason: reason.trim() },
    } })
    const result = { id: movement.id.toString(), occurredAt: movement.occurredAt.toISOString() }
    await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType, idempotencyKey: key, fingerprint, result } })
    return result
  })
}

/** Transfer from Main Safe to Fixed Float — Owner only. Manager must not physically move cash. */
export async function transferMainSafeToFixedFloat(session: StaffSession, amount: number, reason: string, idempotencyKey?: string): Promise<{ withdrawalId: string; additionId: string }> {
  if (session.role !== ROLE.OWNER) throw new FloatError('غير مصرح — التحويل من الخزنة الرئيسية للمالك فقط', 403)
  if (!Number.isFinite(amount) || amount <= 0) throw new FloatError('Invalid amount', 400)
  if (!reason.trim() || reason.trim().length < 3) throw new FloatError('Reason required', 400)
  const branchId = session.branchId ? BigInt(session.branchId) : await firstBranchId()
  if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('Forbidden', 403)

  const key = validatedOperationKey(idempotencyKey)
  const operationType = 'main_safe_to_fixed_float'
  const fingerprint = createHash('sha256').update(JSON.stringify({ amount, reason: reason.trim(), branchId: branchId.toString() })).digest('hex')

  const previous = await prisma.financialOperation.findUnique({
    where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType, idempotencyKey: key } },
  })
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409)
    return previous.result as { withdrawalId: string; additionId: string }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('main-safe:' || ${branchId.toString()}))`
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shared-float:' || ${branchId.toString()}))`

    const replay = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType, idempotencyKey: key } } })
    if (replay) { if (replay.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409); return replay.result as never }
    // Check Main Safe balance
    const [deposits, withdrawals] = await Promise.all([
      tx.financialMovement.aggregate({ where: { branchId, type: { in: ['main_safe_deposit', 'fixed_float_addition_reversal'] }, status: 'posted' }, _sum: { amount: true } }),
      tx.financialMovement.aggregate({ where: { branchId, type: 'main_safe_withdrawal', status: 'posted' }, _sum: { amount: true } }),
    ])
    const currentBalance = Number(deposits._sum.amount ?? 0) - Number(withdrawals._sum.amount ?? 0)
    if (amount > currentBalance) throw new FloatError('رصيد الخزنة الرئيسية غير كافٍ للتحويل', 409)

    // Withdrawal from Main Safe
    const withdrawal = await tx.financialMovement.create({
      data: {
        branchId, type: 'main_safe_withdrawal', status: 'posted',
        amount: amount.toFixed(2), sourceAccount: 'MAIN_SAFE', destinationAccount: 'FLOAT_TRANSFER',
        actorId: session.id, reason: reason.trim(),
      },
      select: { id: true, occurredAt: true },
    })

    // Addition to Fixed Float
    const addition = await tx.financialMovement.create({
      data: {
        branchId, type: 'fixed_float_addition', status: 'posted',
        amount: amount.toFixed(2), sourceAccount: 'FLOAT_TRANSFER', destinationAccount: 'FIXED_FLOAT',
        metadata: { transferWithdrawalId: withdrawal.id.toString() },
        actorId: session.id, reason: reason.trim(),
      },
      select: { id: true, occurredAt: true },
    })

    await tx.auditLog.create({ data: {
      userId: session.id, branchId, action: 'main_safe.to_fixed_float', entityType: 'financial_movement', entityId: withdrawal.id,
      newValues: { amount: amount.toFixed(2), reason: reason.trim(), withdrawalId: withdrawal.id.toString(), additionId: addition.id.toString() },
    } })

    const result = { withdrawalId: withdrawal.id.toString(), additionId: addition.id.toString() }
    await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType, idempotencyKey: key, fingerprint, result } })
    return result
  })
}

function validatedOperationKey(key: string | undefined) { if (!key || key.length < 8 || key.length > 100) throw new FloatError('A stable idempotency key is required', 400); return key }
