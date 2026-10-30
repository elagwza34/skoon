import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasPermission, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'
import { lockAndReadShift } from '@/lib/financial-shift-lock'
import { consumeOrderReservations, releaseOrderItemReservations, StockError } from '@/lib/staff-inventory-engine'
import { invoiceDiscountKind, invoiceDiscountValue, InvoiceCalculationError, recalculateOpenOrderInvoice, centsText } from '@/lib/invoice-recalculation'

export class OrderItemVoidError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'OrderItemVoidError' }
}

const inputSchema = z.object({
  reason: z.string().trim().min(3, 'سبب إزالة الصنف مطلوب').max(255),
  idempotencyKey: z.string().trim().min(8).max(100),
  releaseStock: z.preprocess((value) => value === 'true' || value === true, z.boolean().default(true)).optional(),
})

export type OrderItemVoidResult = { orderId: string; orderItemId: string; total: string; status: string; alreadyRemoved?: boolean }

export function canVoidOrderItemForOrder(session: Pick<StaffSession, 'id' | 'role' | 'permissions'>, responsibleWaiterId: string | null): boolean {
  if (session.role === ROLE.CASHIER) return true
  return session.role === ROLE.WAITER && (responsibleWaiterId === session.id || hasPermission(session.permissions, 'orders.cancel'))
}

export function orderItemVoidBlocker(input: { status: string; paymentStatus: string; completedPayments: number; servedQuantity: number; activeItems: number }): string | null {
  if (!['new', 'preparing', 'ready'].includes(input.status)) return 'closed'
  if (input.paymentStatus === 'paid' || input.completedPayments > 0) return 'paid'
  if (input.servedQuantity > 0) return 'served'
  if (input.activeItems <= 1) return 'last_item'
  return null
}

export async function voidOpenOrderItem(session: StaffSession, orderIdRaw: string, orderItemIdRaw: string, input: unknown): Promise<OrderItemVoidResult> {
  if (session.role !== ROLE.CASHIER && session.role !== ROLE.WAITER) throw new OrderItemVoidError('غير مصرح بإزالة أصناف الطلب', 403)
  if (!/^\d+$/.test(orderIdRaw) || !/^\d+$/.test(orderItemIdRaw)) throw new OrderItemVoidError('الطلب أو الصنف غير موجود', 404)
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) throw new OrderItemVoidError(parsed.error.issues[0]?.message ?? 'بيانات الإزالة غير صالحة', 400)
  const orderId = BigInt(orderIdRaw)
  const orderItemId = BigInt(orderItemIdRaw)
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, branchId: true, responsibleWaiterId: true } })
  if (!order || !staffCanAccessBranch(session, order.branchId)) throw new OrderItemVoidError('الطلب غير موجود', 404)
  if (!canVoidOrderItemForOrder(session, order.responsibleWaiterId)) throw new OrderItemVoidError('لا يمكنك تعديل طلب ويتر آخر', 403)
  const openShift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, order.branchId) : null
  if (requiresOperationalShift(session.role) && !openShift) throw new OrderItemVoidError('يلزم وجود وردية مفتوحة لإزالة الصنف', 409)

  const fingerprint = createHash('sha256').update(JSON.stringify({ orderId: orderIdRaw, orderItemId: orderItemIdRaw, reason: parsed.data.reason })).digest('hex')
  const operationKey = { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType: 'order_item_void', idempotencyKey: parsed.data.idempotencyKey } }
  const prior = await prisma.financialOperation.findUnique({ where: operationKey })
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new OrderItemVoidError('مفتاح العملية استُخدم لطلب مختلف', 409)
    return { ...(prior.result as OrderItemVoidResult), alreadyRemoved: true }
  }

  return prisma.$transaction(async (tx) => {
    const lockedShift = await lockAndReadShift(tx, openShift!.id)
    if (!lockedShift || lockedShift.status !== 'open' || lockedShift.cashierId !== session.id || lockedShift.branchId !== order.branchId) throw new OrderItemVoidError('الوردية لم تعد مفتوحة', 409)
    const lockedRows = await tx.$queryRaw<{ status: string; payment_status: string; responsible_waiter_id: string | null; discount_type: string | null; discount_value: unknown; tax_rate: unknown }[]>`
      SELECT status, payment_status, responsible_waiter_id, discount_type, discount_value, tax_rate FROM orders WHERE id = ${orderId} FOR UPDATE
    `
    const locked = lockedRows[0]
    if (!locked) throw new OrderItemVoidError('الطلب غير موجود', 404)
    if (!canVoidOrderItemForOrder(session, locked.responsible_waiter_id)) throw new OrderItemVoidError('تغيرت مسؤولية الطلب؛ حدّث الصفحة', 409)
    const paid = await tx.payment.count({ where: { orderId, status: 'completed' } })
    const repeated = await tx.financialOperation.findUnique({ where: operationKey })
    if (repeated) {
      if (repeated.fingerprint !== fingerprint) throw new OrderItemVoidError('مفتاح العملية استُخدم لطلب مختلف', 409)
      return { ...(repeated.result as OrderItemVoidResult), alreadyRemoved: true }
    }
    const item = await tx.orderItem.findFirst({
      where: { id: orderItemId, orderId },
      select: { id: true, productName: true, quantity: true, isVoided: true, preparedQuantity: true, servedQuantity: true, preparationStartedAt: true },
    })
    if (!item) throw new OrderItemVoidError('الصنف غير موجود داخل هذا الطلب', 404)
    if (item.isVoided) throw new OrderItemVoidError('تمت إزالة الصنف بالفعل', 409)
    const activeItems = await tx.orderItem.count({ where: { orderId, isVoided: false } })
    const blocker = orderItemVoidBlocker({ status: locked.status, paymentStatus: locked.payment_status, completedPayments: paid, servedQuantity: item.servedQuantity, activeItems })
    if (blocker === 'closed') throw new OrderItemVoidError('لا يمكن إزالة أصناف من طلب مغلق أو ملغى', 409)
    if (blocker === 'paid') throw new OrderItemVoidError('لا يمكن إزالة صنف من فاتورة تم تحصيلها', 409)
    if (blocker === 'served') throw new OrderItemVoidError('لا يمكن إزالة صنف تم تقديمه؛ يلزم إجراء تصحيح مصرح دون إعادة المخزون تلقائيًا', 409)
    if (blocker === 'last_item') throw new OrderItemVoidError('هذا آخر صنف؛ استخدم إلغاء الطلب بالكامل مع تسجيل السبب', 409)

    try {
      if (item.preparationStartedAt || item.preparedQuantity > 0) {
        await consumeOrderReservations(tx, orderId, session.id, 'waste', parsed.data.reason, [{ orderItemId, quantity: item.quantity }])
      }
      if (parsed.data.releaseStock !== false) {
        await releaseOrderItemReservations(tx, orderId, orderItemId)
      }
    } catch (error) {
      if (error instanceof StockError) throw new OrderItemVoidError(error.message, error.status)
      throw error
    }
    await tx.orderItem.update({ where: { id: orderItemId }, data: { isVoided: true, voidReason: parsed.data.reason } })
    let recalculated
    try {
      recalculated = await recalculateOpenOrderInvoice(tx, orderId, invoiceDiscountKind(locked.discount_type), invoiceDiscountValue(invoiceDiscountKind(locked.discount_type), locked.discount_value), locked.tax_rate)
    } catch (error) {
      if (error instanceof InvoiceCalculationError || error instanceof Error) throw new OrderItemVoidError(error.message, 422)
      throw error
    }
    const nextStatus = locked.status === 'ready' ? 'ready' : locked.status
    await tx.order.update({ where: { id: orderId }, data: {
      itemsSubtotal: centsText(recalculated.calculated.subtotalCents),
      itemDiscountAmount: centsText(recalculated.calculated.itemDiscountCents),
      discountEligibleBase: centsText(recalculated.calculated.eligibleBaseCents),
      discountAmount: centsText(recalculated.calculated.itemDiscountCents + recalculated.calculated.invoiceDiscountCents),
      taxAmount: centsText(recalculated.tax), total: centsText(recalculated.total), status: nextStatus,
    } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: 'order.item_void', entityType: 'order_item', entityId: orderItemId, oldValues: { productName: item.productName, quantity: item.quantity }, newValues: { orderId: orderIdRaw, reason: parsed.data.reason, total: centsText(recalculated.total), actorRole: session.role } } })
    const result: OrderItemVoidResult = { orderId: orderIdRaw, orderItemId: orderItemIdRaw, total: centsText(recalculated.total), status: nextStatus }
    await tx.financialOperation.create({ data: { branchId: order.branchId, actorId: session.id, operationType: 'order_item_void', idempotencyKey: parsed.data.idempotencyKey, fingerprint, result } })
    return result
  })
}
