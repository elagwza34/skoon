import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ROLE } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'
import { notifyRole } from '@/lib/notifications'

export class ServiceRequestError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = 'ServiceRequestError' } }
const requestSchema = z.object({ token: z.string().length(16), type: z.enum(['waiter_call','bill','water','utensils','assistance','complaint']), details: z.string().trim().max(500).optional() })
const actionSchema = z.object({ action: z.enum(['accept','in_progress','resolve','cancel','reassign','prioritize']), assigneeId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(500).optional() })
const filterSchema = z.object({ status: z.string().max(20).optional(), type: z.string().max(30).optional(), priority: z.enum(['all','normal','high']).optional(), table: z.string().max(20).optional(), assignedTo: z.string().uuid().optional(), from: z.coerce.date().optional() })
function unavailable(error: unknown): never { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') throw new ServiceRequestError('Service-request migration is not applied yet', 503); throw error }

export async function createPublicServiceRequest(input: unknown) {
  const parsed = requestSchema.safeParse(input); if (!parsed.success) throw new ServiceRequestError(parsed.error.issues[0]?.message ?? 'Invalid service request')
  try { return await prisma.$transaction(async (tx) => {
    const table = await tx.cafeTable.findFirst({ where: { publicToken: parsed.data.token, isActive: true, deletedAt: null }, select: { id: true, branchId: true, number: true } })
    if (!table) throw new ServiceRequestError('Table not found', 404)
    // Serializes duplicate/rate-limit decisions for one physical table. The partial
    // unique index in the migration remains the durable final backstop.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('service-request:' || ${table.id.toString()}))`
    if (parsed.data.type !== 'complaint') {
      const active = await tx.serviceRequest.findFirst({ where: { tableId: table.id, type: parsed.data.type, status: { in: ['pending', 'accepted', 'in_progress'] }, createdAt: { gte: new Date(Date.now() - 60_000) } }, select: { id: true } })
      if (active) throw new ServiceRequestError('A matching request is already active', 429)
    }
    if (parsed.data.type === 'complaint') {
      const complaints = await tx.serviceRequest.count({ where: { tableId: table.id, type: 'complaint', createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } })
      if (complaints >= 3) throw new ServiceRequestError('Too many complaint requests; please ask a staff member directly', 429)
    }
    const row = await tx.serviceRequest.create({ data: { branchId: table.branchId, tableId: table.id, type: parsed.data.type, details: parsed.data.details ?? null, priority: parsed.data.type === 'complaint' ? 10 : 0 } })
    await notifyRole(tx, ROLE.WAITER, table.branchId, { type: 'service.request.created', title: `طلب خدمة من طاولة ${table.number}`, body: parsed.data.type })
    return { id: row.id.toString(), status: row.status }
  }) } catch (error) { return unavailable(error) }
}

/** Read-only, branch-scoped queue. Waiters see all available work and their own assignments. */
export async function listServiceRequests(session: StaffSession, input: unknown) {
  if (session.role !== ROLE.WAITER && session.role !== ROLE.MANAGER && session.role !== ROLE.OWNER) throw new ServiceRequestError('Service-request access is not permitted', 403)
  const filter = filterSchema.safeParse(input); if (!filter.success) throw new ServiceRequestError('Invalid service-request filter')
  const value = filter.data; const branchScope = session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId ?? '0') }
  try { return await prisma.serviceRequest.findMany({ where: { ...branchScope, ...(value.status ? { status: value.status } : {}), ...(value.type ? { type: value.type } : {}), ...(value.priority === 'high' ? { priority: { gt: 0 } } : value.priority === 'normal' ? { priority: 0 } : {}), ...(value.table ? { table: { number: value.table } } : {}), ...(value.assignedTo ? { claimedById: value.assignedTo } : {}), ...(value.from ? { createdAt: { gte: value.from } } : {}) }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }], take: 200, include: { table: { select: { number: true, name: true } }, claimedBy: { select: { id: true, name: true } }, resolvedBy: { select: { id: true, name: true } } } }) } catch (error) { return unavailable(error) }
}

/** Atomic claim prevents two waiters from accepting the same available request. */
export async function actOnServiceRequest(session: StaffSession, id: bigint, input: unknown) {
  const parsed = actionSchema.safeParse(input); if (!parsed.success) throw new ServiceRequestError('Invalid service-request action')
  if (session.role !== ROLE.WAITER && session.role !== ROLE.MANAGER && session.role !== ROLE.OWNER) throw new ServiceRequestError('Service supervision is not permitted', 403)
  if (session.role !== ROLE.OWNER && (!session.branchId || !await getOpenShift(session.id, BigInt(session.branchId)))) throw new ServiceRequestError('An open shift is required', 409)
  try { return await prisma.$transaction(async (tx) => {
    const scope = session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId!) }
    const row = await tx.serviceRequest.findFirst({ where: { id, ...scope }, select: { id: true, branchId: true, status: true, claimedById: true } })
    if (!row) throw new ServiceRequestError('Service request not found', 404)
    if (parsed.data.action === 'accept') {
      const claimed = await tx.serviceRequest.updateMany({ where: { id, status: 'pending', claimedById: null }, data: { status: 'accepted', claimedById: session.id, claimedAt: new Date() } })
      if (claimed.count !== 1) throw new ServiceRequestError('Service request is already being handled', 409)
    } else if (parsed.data.action === 'resolve' || parsed.data.action === 'cancel') {
      if (session.role === ROLE.WAITER && row.claimedById !== session.id) throw new ServiceRequestError('Only the assigned waiter may complete this request', 403)
      if (!parsed.data.reason) throw new ServiceRequestError('A resolution reason is required')
      await tx.serviceRequest.update({ where: { id }, data: { status: parsed.data.action === 'resolve' ? 'resolved' : 'cancelled', resolvedById: session.id, resolvedAt: new Date(), resolution: parsed.data.reason } })
    } else if (parsed.data.action === 'in_progress') {
      if (session.role === ROLE.WAITER && row.claimedById !== session.id) throw new ServiceRequestError('Only the assigned waiter may start this request', 403)
      await tx.serviceRequest.update({ where: { id }, data: { status: 'in_progress' } })
    } else {
      if (session.role !== ROLE.MANAGER && session.role !== ROLE.OWNER) throw new ServiceRequestError('Manager authority is required', 403)
      if (parsed.data.action === 'reassign' && !parsed.data.assigneeId) throw new ServiceRequestError('Assignee is required')
      await tx.serviceRequest.update({ where: { id }, data: parsed.data.action === 'reassign' ? { claimedById: parsed.data.assigneeId, claimedAt: new Date(), status: 'accepted' } : { priority: 10 } })
    }
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branchId, action: `manager.service_request.${parsed.data.action}`, entityType: 'service_request', entityId: id, newValues: {} } })
    return { id: id.toString(), action: parsed.data.action }
  }) } catch (error) { return unavailable(error) }
}
