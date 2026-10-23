import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ROLE } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'

export class LeaveError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = 'LeaveError' } }
const requestSchema = z.object({ type: z.string().trim().min(2).max(30), startsOn: z.coerce.date(), endsOn: z.coerce.date(), reason: z.string().trim().min(3).max(500) }).refine((v) => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'End date cannot precede start date' })
const decideSchema = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() })
const day = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
const daysBetween = (from: Date, until: Date) => Math.floor((day(until).getTime() - day(from).getTime()) / 86_400_000) + 1
function reviewer(session: StaffSession) { if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER) throw new LeaveError('Leave review is not permitted', 403) }
function unavailable(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') throw new LeaveError('Leave migration is not applied yet', 503); throw error }

/** Employees request their own leave. The server derives employee and branch identity. */
export async function createLeaveRequest(session: StaffSession, input: unknown) {
  const parsed = requestSchema.safeParse(input); if (!parsed.success) throw new LeaveError(parsed.error.issues[0]?.message ?? 'Invalid leave request')
  try { return await prisma.$transaction(async (tx) => {
    const employee = await tx.user.findFirst({ where: { id: session.id, isActive: true, deletedAt: null }, select: { branchId: true } })
    if (!employee?.branchId) throw new LeaveError('An assigned branch is required', 409)
    const startsOn = day(parsed.data.startsOn), endsOn = day(parsed.data.endsOn)
    const overlap = await tx.leaveRequest.findFirst({ where: { employeeId: session.id, status: { in: ['pending', 'approved'] }, startsOn: { lte: endsOn }, endsOn: { gte: startsOn } }, select: { id: true } })
    if (overlap) throw new LeaveError('This leave period overlaps an existing request', 409)
    const row = await tx.leaveRequest.create({ data: { branchId: employee.branchId, employeeId: session.id, type: parsed.data.type, startsOn, endsOn, days: daysBetween(startsOn, endsOn), reason: parsed.data.reason } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: employee.branchId, action: 'hr.leave.request', entityType: 'leave_request', entityId: row.id, newValues: { type: row.type, days: row.days.toString() } } })
    return row
  }) } catch (error) { return unavailable(error) }
}

/** Branch-restricted managers see operational requests; users see only their own. */
export async function listLeaveRequests(session: StaffSession) {
  try { return await prisma.leaveRequest.findMany({ where: session.role === ROLE.OWNER ? {} : session.role === ROLE.MANAGER ? { branchId: BigInt(session.branchId ?? '0') } : { employeeId: session.id }, orderBy: { createdAt: 'desc' }, take: 200, include: { employee: { select: { id: true, name: true } }, reviewer: { select: { id: true, name: true } } } }) } catch (error) { return unavailable(error) }
}

export async function decideLeaveRequest(session: StaffSession, id: bigint, input: unknown) {
  reviewer(session); const parsed = decideSchema.safeParse(input); if (!parsed.success) throw new LeaveError('Invalid leave decision')
  try { return await prisma.$transaction(async (tx) => {
    const row = await tx.leaveRequest.findFirst({ where: { id, status: 'pending', ...(session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId ?? '0') }) }, select: { id: true, employeeId: true, branchId: true } })
    if (!row) throw new LeaveError('Pending leave request not found', 404)
    if (row.employeeId === session.id) throw new LeaveError('Employees cannot review their own leave', 403)
    const updated = await tx.leaveRequest.update({ where: { id }, data: { status: parsed.data.approve ? 'approved' : 'rejected', reviewerId: session.id, decisionNote: parsed.data.note ?? null, decidedAt: new Date() } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branchId, action: parsed.data.approve ? 'hr.leave.approve' : 'hr.leave.reject', entityType: 'leave_request', entityId: id, newValues: {} } })
    return updated
  }) } catch (error) { return unavailable(error) }
}
