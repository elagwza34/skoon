import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { canManageEmployeeLifecycle } from '@/lib/hr-authz'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import { createHash } from 'node:crypto'

export class HrFinancialError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = 'HrFinancialError' } }
const money = z.string().regex(/^\d+(?:\.\d{1,2})?$/)
const adjustmentSchema = z.object({ employeeId: z.string().uuid(), type: z.enum(['bonus', 'deduction', 'penalty']), amount: money, effectiveOn: z.coerce.date(), reason: z.string().trim().min(3).max(500) })
const advanceSchema = z.object({ employeeId: z.string().uuid(), amount: money, reason: z.string().trim().min(3).max(500) })
function owner(session: StaffSession) { if (!canManageEmployeeLifecycle(session.role)) throw new HrFinancialError('Owner access is required', 403) }
function cents(input: string) { const [whole, fraction = ''] = input.split('.'); const value = Number(whole) * 100 + Number((fraction + '00').slice(0, 2)); if (!Number.isSafeInteger(value) || value <= 0) throw new HrFinancialError('Amount must be positive'); return value }
function decimal(c: number) { return new Prisma.Decimal(c).div(100) }
function unavailable(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') throw new HrFinancialError('Phase D HR migration is not applied yet', 503); throw error }
async function employee(employeeId: string) { const row = await prisma.user.findFirst({ where: { id: employeeId, isActive: true, deletedAt: null }, select: { id: true, branchId: true } }); if (!row?.branchId) throw new HrFinancialError('Active employee with a branch is required', 409); return row }

export async function listHrFinancials(session: StaffSession) { owner(session); try { const [adjustments, advances] = await Promise.all([prisma.hrAdjustment.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }), prisma.employeeAdvance.findMany({ orderBy: { createdAt: 'desc' }, take: 300 })]); return { adjustments, advances } } catch (error) { return unavailable(error) } }
export async function createAdjustment(session: StaffSession, input: unknown) { owner(session); const parsed = adjustmentSchema.safeParse(input); if (!parsed.success) throw new HrFinancialError(parsed.error.issues[0]?.message ?? 'Invalid adjustment'); try { const target = await employee(parsed.data.employeeId); return await prisma.hrAdjustment.create({ data: { employeeId: target.id, branchId: target.branchId!, type: parsed.data.type, amount: decimal(cents(parsed.data.amount)), effectiveOn: new Date(Date.UTC(parsed.data.effectiveOn.getUTCFullYear(), parsed.data.effectiveOn.getUTCMonth(), parsed.data.effectiveOn.getUTCDate())), reason: parsed.data.reason, requestedById: session.id } }) } catch (error) { return unavailable(error) } }
export async function decideAdjustment(session: StaffSession, id: bigint, approve: boolean) { owner(session); try { return await prisma.$transaction(async (tx) => { const row = await tx.hrAdjustment.findFirst({ where: { id, status: 'pending' } }); if (!row) throw new HrFinancialError('Pending adjustment not found', 404); if (row.requestedById === session.id) throw new HrFinancialError('A requester cannot approve their own adjustment', 403); return tx.hrAdjustment.update({ where: { id }, data: { status: approve ? 'approved' : 'rejected', approvedById: session.id, approvedAt: new Date() } }) }) } catch (error) { return unavailable(error) } }
export async function createAdvance(session: StaffSession, input: unknown) { owner(session); const parsed = advanceSchema.safeParse(input); if (!parsed.success) throw new HrFinancialError(parsed.error.issues[0]?.message ?? 'Invalid employee advance'); try { const target = await employee(parsed.data.employeeId); return await prisma.employeeAdvance.create({ data: { employeeId: target.id, branchId: target.branchId!, amount: decimal(cents(parsed.data.amount)), reason: parsed.data.reason, requestedById: session.id } }) } catch (error) { return unavailable(error) } }
export async function decideAdvance(session: StaffSession, id: bigint, approve: boolean) { owner(session); try { return await prisma.$transaction(async (tx) => { const row = await tx.employeeAdvance.findFirst({ where: { id, status: 'pending' } }); if (!row) throw new HrFinancialError('Pending advance not found', 404); if (row.requestedById === session.id) throw new HrFinancialError('A requester cannot approve their own advance', 403); return tx.employeeAdvance.update({ where: { id }, data: { status: approve ? 'approved' : 'rejected', approvedById: session.id, approvedAt: new Date() } }) }) } catch (error) { return unavailable(error) } }

/** Record a verified external recovery; this does not manufacture a till receipt. */
export async function recordAdvanceRepayment(session: StaffSession, input: unknown) {
  owner(session)
  const parsed = z.object({ advanceId: z.string().regex(/^\d+$/), amount: money, receiptReference: z.string().trim().min(3).max(150), idempotencyKey: z.string().trim().min(8).max(100) }).safeParse(input)
  if (!parsed.success) throw new HrFinancialError('Advance, amount, verified receipt reference and request key are required')
  const data = parsed.data, amount = cents(data.amount), id = BigInt(data.advanceId)
  const canonicalId = id.toString()
  const fingerprint = createHash('sha256').update(JSON.stringify({ advanceId: canonicalId, amount, receiptReference: data.receiptReference })).digest('hex')
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employee-advance:' || ${canonicalId}))`
    const row = await tx.employeeAdvance.findUnique({ where: { id } })
    if (!row) throw new HrFinancialError('Advance not found', 404)
    const operationType = 'employee_advance_repayment'
    const operationKey = { branchId_actorId_operationType_idempotencyKey: { branchId: row.branchId, actorId: session.id, operationType, idempotencyKey: data.idempotencyKey } }
    const previous = await tx.financialOperation.findUnique({ where: operationKey })
    if (previous) { if (previous.fingerprint !== fingerprint) throw new HrFinancialError('Request key was reused with different repayment details', 409); return previous.result }
    if (row.status !== 'approved') throw new HrFinancialError('Only an approved outstanding advance can be repaid', 409)
    const repaid = Math.round(Number(row.repaidAmount) * 100)
    const outstanding = Math.round(Number(row.amount) * 100) - repaid
    if (amount > outstanding) throw new HrFinancialError('Repayment exceeds the outstanding advance', 409)
    const updated = await tx.employeeAdvance.update({ where: { id }, data: { repaidAmount: decimal(repaid + amount), status: amount === outstanding ? 'repaid' : 'approved' } })
    const result = { advanceId: id.toString(), repaidAmount: updated.repaidAmount.toString(), status: updated.status }
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branchId, action: 'hr.advance_repayment', entityType: 'employee_advance', entityId: id, newValues: { amount: data.amount, receiptReference: data.receiptReference, ...result } } })
    await tx.financialOperation.create({ data: { ...operationKey.branchId_actorId_operationType_idempotencyKey, fingerprint, result } })
    return result
  })
}
