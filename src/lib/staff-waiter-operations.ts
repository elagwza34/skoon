import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'
import { notifyRole, notifyUser } from '@/lib/notifications'
import { reserveOrderInventory, StockError } from '@/lib/staff-inventory-engine'
import { OrderError } from '@/lib/staff-orders'

const idSchema = z.string().regex(/^\d+$/)
const reasonSchema = z.string().trim().min(3).max(255)
const transferSchema = z.object({ tableId: idSchema, reason: reasonSchema })
const reassignSchema = z.object({ waiterId: z.string().uuid(), reason: reasonSchema })
const rejectSchema = z.object({ reason: reasonSchema })
const handoverSchema = z.object({ recipientWaiterId: z.string().uuid(), notes: z.string().trim().max(500).optional() })
const tableTransferRequestSchema = z.object({
  tableId: idSchema,
  recipientWaiterId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
})

/** Pure policy helpers keep the high-risk state rules testable without a DB. */
export function isTransferEligible(status: string, paymentStatus: string): boolean {
  return ['new', 'preparing', 'ready'].includes(status) && paymentStatus === 'unpaid'
}

export function requiresEmergencyServing(role: string, responsibleWaiterId: string | null, actorId: string): boolean {
  return role === ROLE.WAITER && responsibleWaiterId !== actorId
}

async function requireOperationalShift(session: StaffSession, branchId: bigint) {
  if (!requiresOperationalShift(session.role)) return null
  if (!staffCanAccessBranch(session, branchId)) throw new OrderError('Forbidden', 403)
  const shift = await getOpenShift(session.id, branchId)
  if (!shift) throw new OrderError('An open shift is required', 409)
  return shift
}

function requireWaiter(session: StaffSession) {
  if (session.role !== ROLE.WAITER) throw new OrderError('Waiter role required', 403)
}

async function eligibleWaiter(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], id: string, branchId: bigint) {
  const user = await tx.user.findFirst({ where: { id, branchId, isActive: true, deletedAt: null, role: { slug: ROLE.WAITER } }, select: { id: true, name: true } })
  if (!user) throw new OrderError('Receiving waiter is not eligible for this branch', 422)
  const shift = await tx.shift.findFirst({ where: { cashierId: id, branchId, status: 'open' }, select: { id: true } })
  if (!shift) throw new OrderError('Receiving waiter must have an open shift', 409)
  return user
}

/** First waiter to claim a pending QR order becomes its current owner. */
export async function claimQrOrder(session: StaffSession, orderIdRaw: string) {
  requireWaiter(session)
  if (!idSchema.safeParse(orderIdRaw).success) throw new OrderError('Order not found', 404)
  const orderId = BigInt(orderIdRaw)
  const preflight = await prisma.order.findUnique({ where: { id: orderId }, select: { branchId: true } })
  if (!preflight) throw new OrderError('Order not found', 404)
  await requireOperationalShift(session, preflight.branchId)
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ branch_id: bigint; source: string; status: string; sent_to_kitchen_at: Date | null; responsible_waiter_id: string | null }[]>`
      SELECT branch_id, source, status, sent_to_kitchen_at, responsible_waiter_id FROM orders WHERE id = ${orderId} FOR UPDATE`
    const row = rows[0]
    if (!row || !staffCanAccessBranch(session, row.branch_id)) throw new OrderError('Order not found', 404)
    if (row.source !== 'qr' || row.status !== 'new' || row.sent_to_kitchen_at) throw new OrderError('Only pending QR orders can be claimed', 409)
    if (row.responsible_waiter_id && row.responsible_waiter_id !== session.id) throw new OrderError('QR order is already claimed', 409)
    if (row.responsible_waiter_id === session.id) return { id: orderIdRaw, claimed: true, idempotent: true }
    await tx.order.update({ where: { id: orderId }, data: { responsibleWaiterId: session.id, qrClaimedAt: new Date() } })
    await tx.orderResponsibilityHistory.create({ data: { orderId, branchId: row.branch_id, assignedToId: session.id, assignedById: session.id, source: 'qr_claim', reason: 'QR order claimed by waiter' } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branch_id, action: 'waiter.qr_claim', entityType: 'order', entityId: orderId } })
    return { id: orderIdRaw, claimed: true, idempotent: false }
  })
}

/** Approval reserves stock and dispatches a claimed QR order atomically. */
export async function approveQrOrder(session: StaffSession, orderIdRaw: string) {
  requireWaiter(session)
  if (!idSchema.safeParse(orderIdRaw).success) throw new OrderError('Order not found', 404)
  const orderId = BigInt(orderIdRaw)
  const preflight = await prisma.order.findUnique({ where: { id: orderId }, select: { branchId: true } })
  if (!preflight) throw new OrderError('Order not found', 404)
  await requireOperationalShift(session, preflight.branchId)
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ branch_id: bigint; order_number: string; source: string; status: string; sent_to_kitchen_at: Date | null; responsible_waiter_id: string | null; qr_rejected_at: Date | null }[]>`
      SELECT branch_id, order_number, source, status, sent_to_kitchen_at, responsible_waiter_id, qr_rejected_at FROM orders WHERE id = ${orderId} FOR UPDATE`
    const row = rows[0]
    if (!row || !staffCanAccessBranch(session, row.branch_id)) throw new OrderError('Order not found', 404)
    if (row.source !== 'qr' || row.responsible_waiter_id !== session.id) throw new OrderError('Only the responsible waiter may approve this QR order', 403)
    if (row.qr_rejected_at || row.status !== 'new') throw new OrderError('QR order is no longer approvable', 409)
    if (row.sent_to_kitchen_at) return { id: orderIdRaw, approved: true, idempotent: true }
    try { await reserveOrderInventory(tx, orderId) } catch (error) { if (error instanceof StockError) throw new OrderError(error.message, error.status); throw error }
    const now = new Date()
    await tx.order.update({ where: { id: orderId }, data: { sentToKitchenAt: now, qrApprovedAt: now, qrDecisionById: session.id } })
    await notifyRole(tx, ROLE.KITCHEN, row.branch_id, { type: 'order.sent_to_kitchen', title: `طلب QR معتمد للمطبخ: ${row.order_number}`, orderId })
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branch_id, action: 'waiter.qr_approve', entityType: 'order', entityId: orderId } })
    return { id: orderIdRaw, approved: true, idempotent: false }
  })
}

export async function rejectQrOrder(session: StaffSession, orderIdRaw: string, input: unknown) {
  requireWaiter(session)
  if (!idSchema.safeParse(orderIdRaw).success) throw new OrderError('Order not found', 404)
  const parsed = rejectSchema.safeParse(input); if (!parsed.success) throw new OrderError('A rejection reason is required', 400)
  const orderId = BigInt(orderIdRaw)
  const preflight = await prisma.order.findUnique({ where: { id: orderId }, select: { branchId: true } }); if (!preflight) throw new OrderError('Order not found', 404)
  await requireOperationalShift(session, preflight.branchId)
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ branch_id: bigint; source: string; status: string; sent_to_kitchen_at: Date | null; responsible_waiter_id: string | null }[]>`SELECT branch_id, source, status, sent_to_kitchen_at, responsible_waiter_id FROM orders WHERE id = ${orderId} FOR UPDATE`
    const row = rows[0]
    if (!row || !staffCanAccessBranch(session, row.branch_id)) throw new OrderError('Order not found', 404)
    if (row.source !== 'qr' || row.responsible_waiter_id !== session.id) throw new OrderError('Only the responsible waiter may reject this QR order', 403)
    if (row.status !== 'new' || row.sent_to_kitchen_at) throw new OrderError('Dispatched QR orders cannot be rejected', 409)
    const now = new Date()
    await tx.order.update({ where: { id: orderId }, data: { status: 'cancelled', cancelledAt: now, cancelReason: parsed.data.reason, qrRejectedAt: now, qrDecisionById: session.id } })
    await tx.orderStatusHistory.create({ data: { orderId, fromStatus: 'new', toStatus: 'cancelled', changedById: session.id, note: parsed.data.reason } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branch_id, action: 'waiter.qr_reject', entityType: 'order', entityId: orderId, newValues: { reason: parsed.data.reason } } })
    return { id: orderIdRaw, rejected: true }
  })
}

export async function reassignOrderResponsibility(session: StaffSession, orderIdRaw: string, input: unknown) {
  if (session.role !== ROLE.MANAGER) throw new OrderError('Manager role required', 403)
  if (!idSchema.safeParse(orderIdRaw).success) throw new OrderError('Order not found', 404)
  const parsed = reassignSchema.safeParse(input); if (!parsed.success) throw new OrderError('Invalid reassignment', 400)
  const orderId = BigInt(orderIdRaw); const preflight = await prisma.order.findUnique({ where: { id: orderId }, select: { branchId: true } }); if (!preflight) throw new OrderError('Order not found', 404)
  await requireOperationalShift(session, preflight.branchId)
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ branch_id: bigint; status: string; payment_status: string }[]>`SELECT branch_id, status, payment_status FROM orders WHERE id = ${orderId} FOR UPDATE`
    const row = rows[0]; if (!row || !staffCanAccessBranch(session, row.branch_id)) throw new OrderError('Order not found', 404)
    if (['served', 'cancelled'].includes(row.status) || row.payment_status === 'paid') throw new OrderError('Terminal or paid orders cannot be reassigned', 409)
    await eligibleWaiter(tx, parsed.data.waiterId, row.branch_id)
    await tx.order.update({ where: { id: orderId }, data: { responsibleWaiterId: parsed.data.waiterId } })
    await tx.orderResponsibilityHistory.create({ data: { orderId, branchId: row.branch_id, assignedToId: parsed.data.waiterId, assignedById: session.id, source: 'manager_reassign', reason: parsed.data.reason } })
    await notifyUser(tx, parsed.data.waiterId, { type: 'order.created', title: 'تم إسناد طلب إليك', orderId })
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branch_id, action: 'manager.order_reassign', entityType: 'order', entityId: orderId, newValues: { waiterId: parsed.data.waiterId, reason: parsed.data.reason } } })
    return { id: orderIdRaw, responsibleWaiterId: parsed.data.waiterId }
  })
}

export async function transferOrderTable(session: StaffSession, orderIdRaw: string, input: unknown) {
  if (session.role !== ROLE.WAITER) throw new OrderError('Waiter role required', 403)
  if (!idSchema.safeParse(orderIdRaw).success) throw new OrderError('Order not found', 404)
  const parsed = transferSchema.safeParse(input); if (!parsed.success) throw new OrderError('Invalid table transfer', 400)
  const orderId = BigInt(orderIdRaw); const destinationId = BigInt(parsed.data.tableId)
  const preflight = await prisma.order.findUnique({ where: { id: orderId }, select: { branchId: true } }); if (!preflight) throw new OrderError('Order not found', 404)
  await requireOperationalShift(session, preflight.branchId)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('table-transfer:' || ${preflight.branchId.toString()} || ':' || ${destinationId.toString()}))`
    const rows = await tx.$queryRaw<{ branch_id: bigint; cafe_table_id: bigint; status: string; payment_status: string; responsible_waiter_id: string | null }[]>`SELECT branch_id, cafe_table_id, status, payment_status, responsible_waiter_id FROM orders WHERE id = ${orderId} FOR UPDATE`
    const order = rows[0]; if (!order || !staffCanAccessBranch(session, order.branch_id)) throw new OrderError('Order not found', 404)
    if (order.cafe_table_id === destinationId) throw new OrderError('Order is already assigned to this table', 409)
    if (!isTransferEligible(order.status, order.payment_status)) throw new OrderError('Only unpaid active orders may be transferred', 409)
    if (!hasAtLeast(session.role, ROLE.MANAGER) && order.responsible_waiter_id !== session.id) throw new OrderError('Only the responsible waiter may transfer this order', 403)
    const destination = await tx.cafeTable.findFirst({ where: { id: destinationId, branchId: order.branch_id, isActive: true, deletedAt: null }, select: { id: true } })
    if (!destination) throw new OrderError('Destination table is unavailable', 422)
    const occupied = await tx.order.findFirst({ where: { cafeTableId: destinationId, id: { not: orderId }, status: { in: ['new', 'preparing', 'ready'] } }, select: { id: true } })
    if (occupied) throw new OrderError('Destination table already has an active order', 409)
    await tx.order.update({ where: { id: orderId }, data: { cafeTableId: destinationId } })
    await tx.orderTableTransfer.create({ data: { orderId, branchId: order.branch_id, fromTableId: order.cafe_table_id, toTableId: destinationId, transferredById: session.id, reason: parsed.data.reason } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branch_id, action: 'waiter.order_table_transfer', entityType: 'order', entityId: orderId, newValues: { fromTableId: order.cafe_table_id.toString(), toTableId: destinationId.toString(), reason: parsed.data.reason } } })
    return { id: orderIdRaw, tableId: destinationId.toString() }
  })
}

export async function requestWaiterResponsibilityHandover(session: StaffSession, input: unknown) {
  requireWaiter(session); const parsed = handoverSchema.safeParse(input); if (!parsed.success) throw new OrderError('Invalid handover request', 400)
  if (session.branchId === null) throw new OrderError('Branch required', 403)
  const branchId = BigInt(session.branchId); const shift = await requireOperationalShift(session, branchId)
  if (!shift) throw new OrderError('An open shift is required', 409)
  return prisma.$transaction(async (tx) => {
    await eligibleWaiter(tx, parsed.data.recipientWaiterId, branchId)
    const outstanding = await tx.order.count({ where: { branchId, responsibleWaiterId: session.id, status: { in: ['new', 'preparing', 'ready'] } } })
    if (outstanding === 0) return { requested: false, outstanding: 0, message: 'No outstanding responsibilities; the shift can close now.' }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('waiter-handover:' || ${shift.id.toString()}))`
    const pending = await tx.waiterShiftHandover.findFirst({ where: { senderShiftId: shift.id, status: 'pending' }, select: { id: true } })
    if (pending) throw new OrderError('A responsibility handover is already pending', 409)
    const handover = await tx.waiterShiftHandover.create({ data: { branchId, senderShiftId: shift.id, requestedById: session.id, recipientWaiterId: parsed.data.recipientWaiterId, notes: parsed.data.notes || null } })
    await notifyUser(tx, parsed.data.recipientWaiterId, { type: 'order.created', title: 'يوجد تسليم مسؤوليات بانتظار قبولك' })
    return { requested: true, id: handover.id.toString(), outstanding }
  })
}

export async function acceptWaiterResponsibilityHandover(session: StaffSession, handoverIdRaw: string) {
  requireWaiter(session); if (!idSchema.safeParse(handoverIdRaw).success) throw new OrderError('Handover not found', 404)
  const handoverId = BigInt(handoverIdRaw)
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ branch_id: bigint; sender_shift_id: bigint; requested_by: string; recipient_waiter_id: string; status: string }[]>`SELECT branch_id, sender_shift_id, requested_by, recipient_waiter_id, status FROM waiter_shift_handovers WHERE id = ${handoverId} FOR UPDATE`
    const row = rows[0]; if (!row || row.recipient_waiter_id !== session.id || !staffCanAccessBranch(session, row.branch_id)) throw new OrderError('Handover not found', 404)
    const senderShift = await tx.shift.findUnique({ where: { id: row.sender_shift_id }, select: { id: true, status: true } })
    if (!senderShift || senderShift.status !== 'open') throw new OrderError('The sending shift is no longer open', 409)
    const receivingShift = await tx.shift.findFirst({ where: { cashierId: session.id, branchId: row.branch_id, status: 'open' }, select: { id: true } })
    if (!receivingShift) throw new OrderError('Receiving waiter must have an open shift', 409)
    if (row.status !== 'pending') throw new OrderError('Handover is no longer pending', 409)
    await eligibleWaiter(tx, session.id, row.branch_id)
    const orders = await tx.order.findMany({ where: { branchId: row.branch_id, responsibleWaiterId: row.requested_by, status: { in: ['new', 'preparing', 'ready'] } }, select: { id: true } })
    for (const order of orders) {
      await tx.order.update({ where: { id: order.id }, data: { responsibleWaiterId: session.id } })
      await tx.orderResponsibilityHistory.create({ data: { orderId: order.id, branchId: row.branch_id, assignedToId: session.id, assignedById: session.id, source: 'shift_handover', reason: `Accepted handover ${handoverId.toString()}` } })
    }
    await tx.waiterShiftHandover.update({ where: { id: handoverId }, data: { status: 'accepted', acceptedAt: new Date() } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branch_id, action: 'waiter.handover_accept', entityType: 'waiter_shift_handover', entityId: handoverId, newValues: { transferredOrders: orders.length, senderShiftId: row.sender_shift_id.toString() } } })
    return { id: handoverIdRaw, accepted: true, transferredOrders: orders.length }
  })
}

/** Recipient may decline before any responsibility is moved; the immutable audit log records why. */
export async function rejectWaiterResponsibilityHandover(session: StaffSession, handoverIdRaw: string, input: unknown) {
  requireWaiter(session)
  if (!idSchema.safeParse(handoverIdRaw).success) throw new OrderError('Handover not found', 404)
  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) throw new OrderError('A rejection reason is required', 400)
  const handoverId = BigInt(handoverIdRaw)
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ branch_id: bigint; requested_by: string; recipient_waiter_id: string; status: string }[]>`
      SELECT branch_id, requested_by, recipient_waiter_id, status FROM waiter_shift_handovers WHERE id = ${handoverId} FOR UPDATE`
    const row = rows[0]
    if (!row || row.recipient_waiter_id !== session.id || !staffCanAccessBranch(session, row.branch_id)) throw new OrderError('Handover not found', 404)
    await requireOperationalShift(session, row.branch_id)
    if (row.status !== 'pending') throw new OrderError('Handover is no longer pending', 409)
    await tx.waiterShiftHandover.update({ where: { id: handoverId }, data: { status: 'cancelled' } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branch_id, action: 'waiter.handover_reject', entityType: 'waiter_shift_handover', entityId: handoverId, newValues: { reason: parsed.data.reason } } })
    await notifyUser(tx, row.requested_by, { type: 'order.created', title: 'تم رفض طلب تسليم المسؤوليات' })
    return { id: handoverIdRaw, rejected: true }
  })
}
/**
 * Waiter requests to transfer a table they currently manage to another eligible
 * waiter. The original waiter retains responsibility until the recipient
 * accepts. One pending transfer per (table, sender) is allowed.
 */
export async function requestTableTransfer(session: StaffSession, input: unknown) {
  requireWaiter(session)
  const parsed = tableTransferRequestSchema.safeParse(input)
  if (!parsed.success) throw new OrderError('Invalid table transfer request', 400)
  if (session.branchId === null) throw new OrderError('Branch required', 403)
  const branchId = BigInt(session.branchId)
  const shift = await requireOperationalShift(session, branchId)
  if (!shift) throw new OrderError('An open shift is required', 409)

  const { tableId: tableIdRaw, recipientWaiterId, notes } = parsed.data
  const tableId = BigInt(tableIdRaw)

  return prisma.$transaction(async (tx) => {
    const table = await tx.cafeTable.findFirst({
      where: { id: tableId, branchId, isActive: true, deletedAt: null },
      select: { id: true, number: true },
    })
    if (!table) throw new OrderError('Table not found in this branch', 404)

    const managedOrder = await tx.order.findFirst({
      where: {
        cafeTableId: tableId,
        branchId,
        responsibleWaiterId: session.id,
        status: { in: ['new', 'preparing', 'ready'] },
      },
      select: { id: true },
    })
    if (!managedOrder) {
      throw new OrderError('You do not manage any active orders on this table', 403)
    }

    await eligibleWaiter(tx, recipientWaiterId, branchId)
    if (recipientWaiterId === session.id) {
      throw new OrderError('Cannot transfer a table to yourself', 400)
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('waiter-table-transfer:' || ${tableId.toString()}))`

    const existing = await tx.waiterTableTransfer.findFirst({
      where: { tableId, branchId, status: 'pending', senderWaiterId: session.id },
      select: { id: true },
    })
    if (existing) {
      throw new OrderError('A pending transfer for this table already exists', 409)
    }

    const transfer = await tx.waiterTableTransfer.create({
      data: {
        branchId,
        tableId,
        senderWaiterId: session.id,
        recipientWaiterId,
        status: 'pending',
        notes: notes ?? null,
      },
    })

    await notifyUser(tx, recipientWaiterId, {
      type: 'order.created',
      title: '\u062a\u0627\u0644\u0628 \u0646\u0642\u0644 \u0645\u0633\u0626\u0648\u0644\u064a\u0629 \u0627\u0644\u0637\u0627\u0648\u0644\u0629',
      body: '\u064a\u0648\u062c\u0648\u062f \u0637\u0644\u0628 \u0646\u0642\u0644 \u0645\u0633\u0626\u0648\u0644\u064a\u0629 \u0637\u0627\u0648\u0644\u0629 \u0628\u0627\u0646\u062a\u0638\u0627\u0631 \u0645\u0648\u0627\u0641\u0642\u0629\u0643',
    })

    return {
      requested: true,
      id: transfer.id.toString(),
      tableId: table.id.toString(),
      tableNumber: table.number,
      recipientWaiterId,
    }
  })
}
/**
 * Recipient accepts a pending table transfer. One atomic server-side operation:
 * validates both waiters and shifts, validates current table ownership, transfers
 * responsibility for the table and all eligible active orders, records history
 * and audit entries, and notifies all relevant views.
 */
export async function acceptTableTransfer(session: StaffSession, transferIdRaw: string) {
  requireWaiter(session)
  if (!idSchema.safeParse(transferIdRaw).success) throw new OrderError('Transfer not found', 404)
  const transferId = BigInt(transferIdRaw)

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{
      branch_id: bigint; table_id: bigint; sender_waiter_id: string;
      recipient_waiter_id: string; status: string; table_number: string;
    }[]>`
      SELECT wt.branch_id, wt.table_id, wt.sender_waiter_id, wt.recipient_waiter_id,
             wt.status, ct.number AS table_number
      FROM waiter_table_transfers wt
      JOIN cafe_tables ct ON ct.id = wt.table_id
      WHERE wt.id = ${transferId} FOR UPDATE
    `
    const row = rows[0]
    if (!row || row.recipient_waiter_id !== session.id) throw new OrderError('Transfer not found', 404)
    if (!staffCanAccessBranch(session, row.branch_id)) throw new OrderError('Forbidden', 403)

    const receivingShift = await tx.shift.findFirst({
      where: { cashierId: session.id, branchId: row.branch_id, status: 'open' },
      select: { id: true },
    })
    if (!receivingShift) throw new OrderError('Receiving waiter must have an open shift', 409)

    const senderShift = await tx.shift.findFirst({
      where: { cashierId: row.sender_waiter_id, branchId: row.branch_id, status: 'open' },
      select: { id: true },
    })
    if (!senderShift) throw new OrderError('Sender shift is no longer open', 409)

    if (row.status !== 'pending') throw new OrderError('Transfer is no longer pending', 409)

    await eligibleWaiter(tx, session.id, row.branch_id)

    const managedOrder = await tx.order.findFirst({
      where: {
        cafeTableId: row.table_id,
        branchId: row.branch_id,
        responsibleWaiterId: row.sender_waiter_id,
        status: { in: ['new', 'preparing', 'ready'] },
      },
      select: { id: true },
    })
    if (!managedOrder) {
      throw new OrderError('Sender no longer manages active orders on this table', 409)
    }

    const orders = await tx.order.findMany({
      where: {
        cafeTableId: row.table_id,
        branchId: row.branch_id,
        responsibleWaiterId: row.sender_waiter_id,
        status: { in: ['new', 'preparing', 'ready'] },
        paymentStatus: 'unpaid',
      },
      select: { id: true },
    })

    for (const order of orders) {
      await tx.order.update({
        where: { id: order.id },
        data: { responsibleWaiterId: session.id },
      })
      await tx.orderResponsibilityHistory.create({
        data: {
          orderId: order.id,
          branchId: row.branch_id,
          assignedToId: session.id,
          assignedById: row.sender_waiter_id,
          source: 'table_transfer',
          reason: 'Table responsibility transferred to recipient waiter',
        },
      })
    }

    await tx.waiterTableTransfer.update({
      where: { id: transferId },
      data: { status: 'accepted', acceptedAt: new Date() },
    })

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: row.branch_id,
        action: 'waiter.table_transfer_accept',
        entityType: 'waiter_table_transfer',
        entityId: transferId,
        newValues: {
          tableId: row.table_id.toString(),
          tableNumber: row.table_number,
          transferredOrders: orders.length,
          senderWaiterId: row.sender_waiter_id,
          recipientWaiterId: session.id,
        },
      },
    })

    await notifyUser(tx, row.sender_waiter_id, {
      type: 'order.created',
      title: '\u062a\u0645 \u0642\u0628\u0648\u0644 \u0646\u0642\u0644 \u0645\u0633\u0626\u0648\u0644\u064a\u0629 \u0627\u0644\u0637\u0627\u0648\u0644\u0629',
      body: '\u062a\u0645 \u0646\u0642\u0644 \u0645\u0633\u0626\u0648\u0644\u064a\u0629 \u0627\u0644\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0646\u0634\u0637\u0629 (\u0627\u0644\u063a) \u0625\u0644\u0649 \u0648\u064a\u062a\u0631 \u0622\u062e\u0631',
    })

    await notifyRole(tx, ROLE.KITCHEN, row.branch_id, {
      type: 'order.created',
      title: '\u062a\u063a\u064a\u064a\u0631 \u0645\u0633\u0626\u0648\u0644\u064a\u0629 \u0627\u0644\u0637\u0627\u0648\u0644\u0627\u062a',
      body: '\u062a\u0645 \u0646\u0642\u0644 \u0645\u0633\u0626\u0648\u0644\u064a\u0629 \u0637\u0627\u0648\u0644\u0629 \u0625\u0644\u0649 \u0648\u064a\u062a\u0631 \u0622\u062e\u0631',
    })

    return {
      accepted: true,
      id: transferId.toString(),
      tableId: row.table_id.toString(),
      tableNumber: row.table_number,
      transferredOrders: orders.length,
    }
  })
}
/**
 * Recipient rejects a pending table transfer. Responsibility stays with the
 * original waiter. Records the rejection and notifies the sender.
 */
export async function rejectTableTransfer(session: StaffSession, transferIdRaw: string, input: unknown) {
  requireWaiter(session)
  if (!idSchema.safeParse(transferIdRaw).success) throw new OrderError('Transfer not found', 404)
  const parsed = rejectSchema.safeParse(input)
  if (!parsed.success) throw new OrderError('A rejection reason is required', 400)
  const transferId = BigInt(transferIdRaw)

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{
      branch_id: bigint; sender_waiter_id: string; recipient_waiter_id: string; status: string;
    }[]>`
      SELECT branch_id, sender_waiter_id, recipient_waiter_id, status
      FROM waiter_table_transfers WHERE id = ${transferId} FOR UPDATE
    `
    const row = rows[0]
    if (!row || row.recipient_waiter_id !== session.id) throw new OrderError('Transfer not found', 404)
    if (!staffCanAccessBranch(session, row.branch_id)) throw new OrderError('Forbidden', 403)

    await requireOperationalShift(session, row.branch_id)
    if (row.status !== 'pending') throw new OrderError('Transfer is no longer pending', 409)

    await tx.waiterTableTransfer.update({
      where: { id: transferId },
      data: { status: 'rejected' },
    })

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: row.branch_id,
        action: 'waiter.table_transfer_reject',
        entityType: 'waiter_table_transfer',
        entityId: transferId,
        newValues: { reason: parsed.data.reason },
      },
    })

    await notifyUser(tx, row.sender_waiter_id, {
      type: 'order.created',
      title: '\u062a\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u0646\u0642\u0644 \u0645\u0633\u0626\u0648\u0644\u064a\u0629 \u0627\u0644\u0637\u0627\u0648\u0644\u0629',
      body: '\u0633\u0628\u0628 \u0627\u0644\u0631\u0641\u0636: ' + parsed.data.reason,
    })

    return { id: transferId.toString(), rejected: true }
  })
}

/**
 * Sender cancels a pending table transfer they initiated. Only the sender may
 * cancel, and only while the transfer is still pending.
 */
export async function cancelTableTransfer(session: StaffSession, transferIdRaw: string) {
  requireWaiter(session)
  if (!idSchema.safeParse(transferIdRaw).success) throw new OrderError('Transfer not found', 404)
  const transferId = BigInt(transferIdRaw)

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{
      branch_id: bigint; sender_waiter_id: string; recipient_waiter_id: string; status: string;
    }[]>`
      SELECT branch_id, sender_waiter_id, recipient_waiter_id, status
      FROM waiter_table_transfers WHERE id = ${transferId} FOR UPDATE
    `
    const row = rows[0]
    if (!row || row.sender_waiter_id !== session.id) throw new OrderError('Transfer not found', 403)
    if (!staffCanAccessBranch(session, row.branch_id)) throw new OrderError('Forbidden', 403)

    await requireOperationalShift(session, row.branch_id)
    if (row.status !== 'pending') throw new OrderError('Transfer is no longer pending', 409)

    await tx.waiterTableTransfer.update({
      where: { id: transferId },
      data: { status: 'cancelled' },
    })

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: row.branch_id,
        action: 'waiter.table_transfer_cancel',
        entityType: 'waiter_table_transfer',
        entityId: transferId,
      },
    })

    await notifyUser(tx, row.recipient_waiter_id as string, {
      type: 'order.created',
      title: '\u062a\u0645 \u0625\u0644\u063a\u0627\u0621 \u0637\u0644\u0628 \u0646\u0642\u0644 \u0645\u0633\u0626\u0648\u0644\u064a\u0629 \u0627\u0644\u0637\u0627\u0648\u0644\u0629',
      body: '\u0642\u0627\u0645 \u0627\u0644\u0645\u0631\u0633\u0644 \u0628\u0625\u0644\u063a\u0627\u0621 \u0637\u0644\u0628 \u0646\u0642\u0644 \u0627\u0644\u0645\u0633\u0626\u0648\u0644\u064a\u0629 \u0627\u0644\u0645\u0639\u0644\u0642.',
    })

    return { id: transferId.toString(), cancelled: true }
  })
}
