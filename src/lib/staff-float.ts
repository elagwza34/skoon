import { z } from 'zod'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast } from '@/lib/authz'
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
    const effect = (row.destinationAccount === 'FIXED_FLOAT' ? value : 0) - (row.sourceAccount === 'FIXED_FLOAT' ? value : 0)
    available += effect
    if (row.type === 'fixed_float_baseline') baseline += effect
    else if (row.type === 'fixed_float_addition' || row.type === 'fixed_float_addition_reversal') additions += effect
    else if (row.type === 'fixed_float_withdrawal' || row.type === 'fixed_float_withdrawal_reversal') withdrawals -= effect
  }
  return { baseline, additions, withdrawals, available, requiresReconciliation: !rows.some((row) => row.type === 'fixed_float_baseline') }
}

export async function getSharedFloatSummary(session: StaffSession, branchIdRaw?: string): Promise<SharedFloatSummary> {
  let branchId: bigint | null = session.branchId ? BigInt(session.branchId) : null
  if (session.role === ROLE.OWNER && branchIdRaw && /^\d+$/.test(branchIdRaw)) branchId = BigInt(branchIdRaw)
  if (session.role === ROLE.OWNER && !branchId) branchId = await firstBranchId()
  if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('Choose a branch', 400)
  const movements = await prisma.financialMovement.findMany({ where: { branchId }, orderBy: { occurredAt: 'desc' }, take: 300, select: { id: true, type: true, amount: true, sourceAccount: true, destinationAccount: true, reason: true, occurredAt: true, actorId: true, advanceId: true, metadata: true, sourceShiftId: true, actor: { select: { name: true } } } })
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
  return { available: totals.available.toFixed(2), baseline: totals.baseline.toFixed(2), outstanding: outstanding.toFixed(2), requiresReconciliation: totals.requiresReconciliation || unallocatedReturns > 0, advances: [...balances.entries()].filter(([, v]) => v.amount > 0).map(([cashierId, v]) => ({ cashierId, cashier: v.cashier, outstanding: v.amount.toFixed(2) })), advanceDetails, unallocatedReturns: unallocatedReturns.toFixed(2), movements: movements.map((m) => ({ id: m.id.toString(), type: m.type, amount: Number(m.amount).toFixed(2), source: m.sourceAccount, destination: m.destinationAccount, reason: m.reason, occurredAt: m.occurredAt.toISOString(), actor: m.actor?.name ?? null })) }
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
  return prisma.$transaction(async (tx) => { await lockCashierShiftForMovement(tx, shift.id, session, branchId); await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('advance-repayment:' || ${parsed.data.advanceId}))`; const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType: 'fixed_float_return', idempotencyKey: key } } }); if (prior) { if (prior.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409); return prior.result }; const advance = await tx.financialMovement.findFirst({ where: { id: advanceId, branchId, actorId: session.id, type: 'fixed_float_advance' }, select: { amount: true } }); if (!advance) throw new FloatError('Advance not found', 404); const repayments = await tx.financialMovement.aggregate({ where: { advanceId, type: { in: ['fixed_float_return','fixed_float_settlement'] } }, _sum: { amount: true } }); const owed = Number(advance.amount) - Number(repayments._sum.amount ?? 0); if (parsed.data.amount > owed) throw new FloatError('Return exceeds this advance outstanding balance', 409); const movement = await tx.financialMovement.create({ data: { branchId, type: 'fixed_float_return', amount: parsed.data.amount.toFixed(2), sourceAccount: 'CASHIER_ADVANCE', destinationAccount: 'FIXED_FLOAT', sourceShiftId: shift.id, actorId: session.id, advanceId, reason: parsed.data.reason } }); const result = { id: movement.id.toString(), outstanding: (owed - parsed.data.amount).toFixed(2) }; await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType: 'fixed_float_return', idempotencyKey: key, fingerprint, result } }); await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'fixed_float.return', entityType: 'financial_movement', entityId: movement.id, newValues: { ...result, advanceId: parsed.data.advanceId } } }); return result })
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('advance-repayment:' || ${advanceIdRaw}))`
    const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId: advance.branchId, actorId: session.id, operationType: 'fixed_float_settlement', idempotencyKey: key } } }); if (prior) { if (prior.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409); return prior.result }
    const priorReturns = await tx.financialMovement.findMany({ where: { advanceId, type: { in: ['fixed_float_return', 'fixed_float_settlement'] } }, select: { amount: true } })
    const returned = priorReturns.reduce((sum, r) => sum + Number(r.amount), 0); const remaining = Number(advance.amount) - returned
    if (parsed.data.amount > remaining) throw new FloatError('Settlement exceeds advance outstanding balance', 409)
    const movement = await tx.financialMovement.create({ data: { branchId: advance.branchId, type: 'fixed_float_settlement', amount: parsed.data.amount.toFixed(2), sourceAccount: 'CASHIER_ADVANCE', destinationAccount: 'FIXED_FLOAT', actorId: session.id, advanceId, reason: parsed.data.reason, metadata: { advanceId: advanceId.toString(), debtorId, originalShiftId: advance.sourceShiftId?.toString() ?? 'none', receiptVerifiedBy: session.id } } }); const result = { id: movement.id.toString(), advanceId: advanceId.toString(), remaining: (remaining - parsed.data.amount).toFixed(2) }
    await tx.financialOperation.create({ data: { branchId: advance.branchId, actorId: session.id, operationType: 'fixed_float_settlement', idempotencyKey: key, fingerprint, result } }); await tx.auditLog.create({ data: { userId: session.id, branchId: advance.branchId, action: 'fixed_float.settlement', entityType: 'financial_movement', entityId: movement.id, newValues: { ...result, originalReason: advance.reason, debtorId: advance.actorId } } }); return result
  })
}

export async function establishFixedFloatBaseline(session: StaffSession, input: unknown) {
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new FloatError('Forbidden', 403)
  const parsed = z.object({ amount: z.coerce.number().min(0).max(9_999_999), reason: z.string().trim().min(3).max(255), confirmed: z.literal(true), idempotencyKey: z.string().trim().min(8).max(100).optional(), branchId: z.coerce.number().int().positive().optional() }).safeParse(input)
  if (!parsed.success) throw new FloatError('Opening baseline, reason, and receipt confirmation are required')
  const branchId = session.branchId ? BigInt(session.branchId) : BigInt(parsed.data.branchId ?? 0); if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('Forbidden', 403)
  const key = parsed.data.idempotencyKey ?? createHash('sha256').update(`${session.id}:${Date.now()}:${Math.random()}`).digest('hex'); const fingerprint = createHash('sha256').update(JSON.stringify({ branchId: branchId.toString(), amount: parsed.data.amount, reason: parsed.data.reason })).digest('hex')
  return prisma.$transaction(async tx => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('fixed-float-baseline:' || ${branchId.toString()}))`; const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType: 'fixed_float_baseline', idempotencyKey: key } } }); if (prior) { if (prior.fingerprint !== fingerprint) throw new FloatError('Idempotency key was reused with a different request', 409); return prior.result }; const existing = await tx.financialMovement.findFirst({ where: { branchId, type: 'fixed_float_baseline' } }); if (existing) throw new FloatError('This branch already has a verified baseline', 409); const legacy = await tx.financialMovement.findFirst({ where: { branchId, OR: [{ sourceAccount: { in: ['FIXED_FLOAT','CASHIER_ADVANCE'] } }, { destinationAccount: { in: ['FIXED_FLOAT','CASHIER_ADVANCE'] } }] } }); if (legacy) throw new FloatError('Historical shared-float movements require an authorized manual reconciliation before baseline establishment', 409); const movement = await tx.financialMovement.create({ data: { branchId, type: 'fixed_float_baseline', amount: parsed.data.amount.toFixed(2), sourceAccount: 'OPENING_RECONCILIATION', destinationAccount: 'FIXED_FLOAT', actorId: session.id, reason: parsed.data.reason, metadata: { actualCashConfirmed: true, reconciledBy: session.id } } }); const result = { id: movement.id.toString(), baseline: parsed.data.amount.toFixed(2) }; await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType: 'fixed_float_baseline', idempotencyKey: key, fingerprint, result } }); await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'fixed_float.baseline', entityType: 'financial_movement', entityId: movement.id, newValues: result } }); return result })
}

export async function getFixedFloatBoard(session: StaffSession): Promise<FixedFloatBoard> {
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new FloatError('Forbidden', 403)
  const branchId = session.branchId ? BigInt(session.branchId) : await firstBranchId()
  if (!branchId || !staffCanAccessBranch(session, branchId)) throw new FloatError('Forbidden', 403)
  const movements = await prisma.financialMovement.findMany({ where: { branchId }, orderBy: { occurredAt: 'desc' }, take: 200,
    select: { id: true, type: true, amount: true, sourceAccount: true, destinationAccount: true, reason: true, occurredAt: true, actor: { select: { name: true } } },
  })
  const fixed = movements.filter((m) => m.type === 'fixed_float_addition' || m.type === 'fixed_float_withdrawal')
  const additions = fixed.filter((m) => m.type === 'fixed_float_addition').reduce((n, m) => n + Number(m.amount), 0)
  const withdrawals = fixed.filter((m) => m.type === 'fixed_float_withdrawal').reduce((n, m) => n + Number(m.amount), 0)
  return { branchId: branchId.toString(), balance: (additions - withdrawals).toFixed(2), additions: additions.toFixed(2), withdrawals: withdrawals.toFixed(2), movements: movements.map((m) => ({ id: m.id.toString(), type: m.type, amount: Number(m.amount).toFixed(2), source: m.sourceAccount, destination: m.destinationAccount, reason: m.reason, occurredAt: m.occurredAt.toISOString(), actor: m.actor?.name ?? null })) }
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
  if (!operational && !hasAtLeast(session.role, ROLE.MANAGER)) throw new FloatError('غير مصرح', 403)
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
    if (!operational && data.direction === 'withdrawal') {
      const rows = await tx.financialMovement.findMany({ where: { branchId }, select: { type: true, amount: true, sourceAccount: true, destinationAccount: true } })
      const summary = sharedFloatTotals(rows)
      if (summary.requiresReconciliation || data.amount > summary.available) throw new FloatError('Insufficient reconciled fixed-float balance', 409)
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
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new FloatError('Forbidden', 403)
  if (!/^\d+$/.test(movementIdRaw) || reason.trim().length < 3) throw new FloatError('Invalid reversal request')
  const id = BigInt(movementIdRaw)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('movement-reverse:' || ${movementIdRaw}))`
    const original = await tx.financialMovement.findUnique({ where: { id }, include: { reversal: true } })
    if (!original || !staffCanAccessBranch(session, original.branchId)) throw new FloatError('Movement not found', 404)
    if (original.reversal || !['fixed_float_addition', 'fixed_float_withdrawal'].includes(original.type)) throw new FloatError('Movement is not eligible for reversal', 409)
    const reversal = await tx.financialMovement.create({ data: { branchId: original.branchId, type: `${original.type}_reversal`, amount: original.amount, sourceAccount: original.destinationAccount, destinationAccount: original.sourceAccount, actorId: session.id, reason: reason.trim(), reversalOfId: original.id, metadata: { originalMovementId: original.id.toString() } } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: original.branchId, action: 'financial_movement.reverse', entityType: 'financial_movement', entityId: reversal.id, newValues: { originalMovementId: original.id.toString(), reversalMovementId: reversal.id.toString(), reason: reason.trim() } } })
    return { id: reversal.id.toString(), reversedMovementId: original.id.toString() }
  })
}
