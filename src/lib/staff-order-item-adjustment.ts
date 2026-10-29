import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ROLE, requiresOperationalShift } from '@/lib/authz'
import { centsText, invoiceDiscountKind, invoiceDiscountValue, recalculateOpenOrderInvoice } from '@/lib/invoice-recalculation'
import { notifyRole } from '@/lib/notifications'
import { createOrderItemVariantSnapshot } from '@/lib/order-item-variant'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import { staffCanAccessBranch } from '@/lib/session'
import { consumeOrderReservations, releaseOrderItemReservationUnits, releaseOrderItemReservations, reserveOrderItemInventory, StockError } from '@/lib/staff-inventory-engine'
import { getOpenShift } from '@/lib/staff-shifts'
import { lockAndReadShift } from '@/lib/financial-shift-lock'

export class OrderItemAdjustmentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'OrderItemAdjustmentError' }
}

export const orderItemAdjustmentSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('quantity'), targetQuantity: z.number().int().min(1).max(99), reason: z.string().trim().min(3).max(255), expectedUpdatedAt: z.string().datetime(), idempotencyKey: z.string().trim().min(8).max(100) }).strict(),
  z.object({ action: z.literal('variant'), variantId: z.string().regex(/^\d+$/), replaceQuantity: z.number().int().min(1).max(99), reason: z.string().trim().min(3).max(255), expectedUpdatedAt: z.string().datetime(), idempotencyKey: z.string().trim().min(8).max(100) }).strict(),
])

export function planOrderItemAdjustment(input:
  | { action: 'quantity'; currentQuantity: number; preparedQuantity: number; servedQuantity: number; targetQuantity: number }
  | { action: 'variant'; currentQuantity: number; preparedQuantity: number; servedQuantity: number; replaceQuantity: number },
) {
  if (input.servedQuantity > 0) return { blocked: 'served' as const, wasteQuantity: 0, releasedUnits: 0, addedUnits: 0 }
  if (input.action === 'quantity') {
    if (input.targetQuantity > input.currentQuantity) return { blocked: null, wasteQuantity: 0, releasedUnits: 0, addedUnits: input.targetQuantity - input.currentQuantity }
    const removed = input.currentQuantity - input.targetQuantity
    return { blocked: null, wasteQuantity: Math.max(0, input.preparedQuantity - input.targetQuantity), releasedUnits: Math.min(removed, Math.max(0, input.currentQuantity - input.preparedQuantity)), addedUnits: 0 }
  }
  if (input.replaceQuantity > input.currentQuantity) return { blocked: 'quantity' as const, wasteQuantity: 0, releasedUnits: 0, addedUnits: 0 }
  const unprepared = Math.max(0, input.currentQuantity - input.preparedQuantity)
  return { blocked: null, wasteQuantity: Math.max(0, input.replaceQuantity - unprepared), releasedUnits: Math.min(input.replaceQuantity, unprepared), addedUnits: input.replaceQuantity }
}

type Tx = Prisma.TransactionClient
type LockedItem = Awaited<ReturnType<typeof loadItem>>

async function loadItem(tx: Tx, orderId: bigint, itemId: bigint) {
  return tx.orderItem.findFirstOrThrow({
    where: { id: itemId, orderId, isVoided: false },
    include: {
      options: true,
      productVariant: { include: { values: { include: { value: { include: { attribute: true } } } } } },
    },
  })
}

function splitDiscount(item: LockedItem, quantity: number) {
  if (!item.discountType) return { discountType: null, discountValue: '0' }
  if (item.discountType === 'percentage') return { discountType: item.discountType, discountValue: item.discountValue.toString() }
  return { discountType: item.discountType, discountValue: (Number(item.discountValue) * quantity / item.quantity).toFixed(2) }
}

function adjustedDiscountValue(item: LockedItem, quantity: number) {
  return item.discountType === 'amount' ? (Number(item.discountValue) * quantity / item.quantity).toFixed(2) : item.discountValue.toString()
}

async function cloneLine(tx: Tx, item: LockedItem, input: { quantity: number; preparedQuantity?: number; variant?: { id: bigint; price: Prisma.Decimal; combinationKey: string; values: { value: { label: string; attribute: { name: string; sortOrder: number } } }[] } }) {
  const optionAdjustment = item.options.reduce((sum, option) => sum + Number(option.priceAdjustment), 0)
  const unitPrice = input.variant ? Number(input.variant.price) + optionAdjustment : Number(item.unitPrice)
  const discount = splitDiscount(item, input.quantity)
  return tx.orderItem.create({
    data: {
      orderId: item.orderId, productId: item.productId, productName: item.productName,
      productVariantId: input.variant?.id ?? item.productVariantId,
      productVariantSnapshot: input.variant ? createOrderItemVariantSnapshot(input.variant.combinationKey, input.variant.values.map((entry) => entry.value)) : item.productVariantSnapshot ?? undefined,
      optionsSnapshot: item.optionsSnapshot ?? undefined,
      unitPrice: unitPrice.toFixed(2), quantity: input.quantity, lineTotal: (unitPrice * input.quantity).toFixed(2),
      discountType: discount.discountType, discountValue: discount.discountValue, discountAmount: '0', eligibleForInvoiceDiscount: item.eligibleForInvoiceDiscount,
      notes: item.notes, prepTimeMinutes: item.prepTimeMinutes,
      preparedQuantity: input.preparedQuantity ?? 0,
      preparationStartedAt: (input.preparedQuantity ?? 0) > 0 ? item.preparationStartedAt : null,
      preparationStartedById: (input.preparedQuantity ?? 0) > 0 ? item.preparationStartedById : null,
      options: { create: item.options.map((option) => ({ productOptionId: option.productOptionId, optionValueId: option.optionValueId, optionName: option.optionName, valueLabel: option.valueLabel, priceAdjustment: option.priceAdjustment })) },
    },
  })
}

async function recalculate(tx: Tx, orderId: bigint, order: { discount_type: string | null; discount_value: unknown; tax_rate: unknown }) {
  const kind = invoiceDiscountKind(order.discount_type)
  const result = await recalculateOpenOrderInvoice(tx, orderId, kind, invoiceDiscountValue(kind, order.discount_value), order.tax_rate)
  await tx.order.update({ where: { id: orderId }, data: {
    itemsSubtotal: centsText(result.calculated.subtotalCents), itemDiscountAmount: centsText(result.calculated.itemDiscountCents),
    discountEligibleBase: centsText(result.calculated.eligibleBaseCents), discountAmount: centsText(result.calculated.itemDiscountCents + result.calculated.invoiceDiscountCents),
    taxAmount: centsText(result.tax), total: centsText(result.total),
  } })
  return centsText(result.total)
}

export async function adjustOrderItem(session: StaffSession, orderIdRaw: string, itemIdRaw: string, input: unknown) {
  if (session.role !== ROLE.WAITER) throw new OrderItemAdjustmentError('صلاحية النادل مطلوبة', 403)
  if (!/^\d+$/.test(orderIdRaw) || !/^\d+$/.test(itemIdRaw)) throw new OrderItemAdjustmentError('الطلب أو الصنف غير موجود', 404)
  const parsed = orderItemAdjustmentSchema.safeParse(input)
  if (!parsed.success) throw new OrderItemAdjustmentError(parsed.error.issues[0]?.message ?? 'طلب التعديل غير صالح')
  const orderId = BigInt(orderIdRaw); const itemId = BigInt(itemIdRaw)
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { branchId: true, responsibleWaiterId: true } })
  if (!order || !staffCanAccessBranch(session, order.branchId)) throw new OrderItemAdjustmentError('الطلب غير موجود', 404)
  if (order.responsibleWaiterId !== session.id) throw new OrderItemAdjustmentError('لا يمكنك تعديل طلب نادل آخر', 403)
  const shift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, order.branchId) : null
  if (requiresOperationalShift(session.role) && !shift) throw new OrderItemAdjustmentError('يلزم وجود وردية مفتوحة', 409)
  const operationType = 'order_item_adjustment'
  const fingerprint = createHash('sha256').update(JSON.stringify({ orderId: orderIdRaw, itemId: itemIdRaw, ...parsed.data })).digest('hex')
  const operationKey = { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType, idempotencyKey: parsed.data.idempotencyKey } }
  const prior = await prisma.financialOperation.findUnique({ where: operationKey })
  if (prior) { if (prior.fingerprint !== fingerprint) throw new OrderItemAdjustmentError('مفتاح العملية مستخدم لتعديل مختلف', 409); return prior.result }

  return prisma.$transaction(async (tx) => {
    if (shift) {
      const lockedShift = await lockAndReadShift(tx, shift.id)
      if (!lockedShift || lockedShift.status !== 'open' || lockedShift.cashierId !== session.id || lockedShift.branchId !== order.branchId) throw new OrderItemAdjustmentError('الوردية لم تعد مفتوحة', 409)
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('order-item-adjustment:' || ${orderIdRaw}))`
    const rows = await tx.$queryRaw<{ status: string; payment_status: string; responsible_waiter_id: string | null; discount_type: string | null; discount_value: unknown; tax_rate: unknown }[]>`
      SELECT status, payment_status, responsible_waiter_id, discount_type, discount_value, tax_rate FROM orders WHERE id = ${orderId} FOR UPDATE`
    const lockedOrder = rows[0]
    if (!lockedOrder || !['new', 'preparing', 'ready'].includes(lockedOrder.status)) throw new OrderItemAdjustmentError('لا يمكن تعديل طلب مغلق', 409)
    if (lockedOrder.payment_status === 'paid' || await tx.payment.count({ where: { orderId, status: 'completed' } })) throw new OrderItemAdjustmentError('لا يمكن للنادل تعديل طلب تم تحصيله', 409)
    if (lockedOrder.responsible_waiter_id !== session.id) throw new OrderItemAdjustmentError('تغيّرت مسؤولية الطلب؛ حدّث الصفحة', 409)
    const repeated = await tx.financialOperation.findUnique({ where: operationKey })
    if (repeated) { if (repeated.fingerprint !== fingerprint) throw new OrderItemAdjustmentError('مفتاح العملية مستخدم لتعديل مختلف', 409); return repeated.result }
    await tx.$queryRaw`SELECT id FROM order_items WHERE id = ${itemId} AND order_id = ${orderId} FOR UPDATE`
    const item = await loadItem(tx, orderId, itemId)
    if (item.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) throw new OrderItemAdjustmentError('تغيّر الصنف في المطبخ؛ حدّث الصفحة وراجع الكميات', 409)
    const plan = planOrderItemAdjustment(parsed.data.action === 'quantity'
      ? { action: 'quantity', currentQuantity: item.quantity, preparedQuantity: item.preparedQuantity, servedQuantity: item.servedQuantity, targetQuantity: parsed.data.targetQuantity }
      : { action: 'variant', currentQuantity: item.quantity, preparedQuantity: item.preparedQuantity, servedQuantity: item.servedQuantity, replaceQuantity: parsed.data.replaceQuantity })
    if (plan.blocked === 'served') throw new OrderItemAdjustmentError('لا يمكن تعديل صنف تم تقديم جزء منه عبر مسار النادل', 409)
    if (plan.blocked === 'quantity') throw new OrderItemAdjustmentError('كمية الاستبدال أكبر من كمية الصنف')

    const createdIds: string[] = []
    let wasteQuantity = 0
    try {
      if (parsed.data.action === 'quantity') {
        const target = parsed.data.targetQuantity
        if (target === item.quantity) throw new OrderItemAdjustmentError('الكمية لم تتغير')
        if (target > item.quantity) {
          const extra = await cloneLine(tx, item, { quantity: target - item.quantity })
          await reserveOrderItemInventory(tx, orderId, extra.id)
          createdIds.push(extra.id.toString())
        } else if (target >= item.preparedQuantity) {
          await releaseOrderItemReservationUnits(tx, orderId, item.id, item.quantity - target, item.quantity)
          await tx.orderItem.update({ where: { id: item.id }, data: { quantity: target, lineTotal: (Number(item.unitPrice) * target).toFixed(2), discountValue: adjustedDiscountValue(item, target) } })
        } else {
          wasteQuantity = item.preparedQuantity - target
          if (wasteQuantity) await consumeOrderReservations(tx, orderId, session.id, 'waste', parsed.data.reason, [{ orderItemId: item.id, quantity: wasteQuantity }])
          await releaseOrderItemReservations(tx, orderId, item.id)
          await tx.orderItem.update({ where: { id: item.id }, data: { isVoided: true, voidReason: parsed.data.reason } })
          const retained = await cloneLine(tx, item, { quantity: target, preparedQuantity: target })
          await reserveOrderItemInventory(tx, orderId, retained.id)
          createdIds.push(retained.id.toString())
        }
      } else {
        if (parsed.data.replaceQuantity > item.quantity) throw new OrderItemAdjustmentError('كمية الاستبدال أكبر من كمية الصنف')
        const variant = await tx.productVariant.findFirst({ where: { id: BigInt(parsed.data.variantId), productId: item.productId, isActive: true, isAvailable: true, archivedAt: null }, include: { values: { include: { value: { include: { attribute: true } } } } } })
        if (!variant) throw new OrderItemAdjustmentError('المتغير البديل غير متاح', 422)
        if (item.productVariantId === variant.id) throw new OrderItemAdjustmentError('اختر متغيرًا مختلفًا')
        const replacing = parsed.data.replaceQuantity
        const unprepared = item.quantity - item.preparedQuantity
        if (replacing <= unprepared) {
          const remaining = item.quantity - replacing
          await releaseOrderItemReservationUnits(tx, orderId, item.id, replacing, item.quantity)
          if (remaining === 0) await tx.orderItem.update({ where: { id: item.id }, data: { isVoided: true, voidReason: parsed.data.reason } })
          else await tx.orderItem.update({ where: { id: item.id }, data: { quantity: remaining, lineTotal: (Number(item.unitPrice) * remaining).toFixed(2), discountValue: adjustedDiscountValue(item, remaining) } })
        } else {
          wasteQuantity = replacing - unprepared
          if (wasteQuantity) await consumeOrderReservations(tx, orderId, session.id, 'waste', parsed.data.reason, [{ orderItemId: item.id, quantity: wasteQuantity }])
          await releaseOrderItemReservations(tx, orderId, item.id)
          await tx.orderItem.update({ where: { id: item.id }, data: { isVoided: true, voidReason: parsed.data.reason } })
          const remaining = item.quantity - replacing
          const retainedPrepared = item.preparedQuantity - wasteQuantity
          if (remaining) {
            const retained = await cloneLine(tx, item, { quantity: remaining, preparedQuantity: retainedPrepared })
            await reserveOrderItemInventory(tx, orderId, retained.id); createdIds.push(retained.id.toString())
          }
        }
        const replacement = await cloneLine(tx, item, { quantity: replacing, variant })
        await reserveOrderItemInventory(tx, orderId, replacement.id); createdIds.push(replacement.id.toString())
      }
    } catch (error) {
      if (error instanceof StockError) throw new OrderItemAdjustmentError(error.message, error.status)
      throw error
    }
    if (createdIds.length && lockedOrder.status === 'ready') {
      await tx.order.update({ where: { id: orderId }, data: { status: 'preparing', readyAt: null } })
      await tx.orderStatusHistory.create({ data: { orderId, fromStatus: 'ready', toStatus: 'preparing', changedById: session.id, note: 'Additional or replacement preparation work created by waiter adjustment' } })
    }
    const total = await recalculate(tx, orderId, lockedOrder)
    const result = { orderId: orderIdRaw, orderItemId: itemIdRaw, action: parsed.data.action, createdItemIds: createdIds, wasteQuantity, total }
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: `order.item_${parsed.data.action}_adjusted`, entityType: 'order_item', entityId: item.id, oldValues: { quantity: item.quantity, variantId: item.productVariantId?.toString() ?? null, preparedQuantity: item.preparedQuantity }, newValues: { request: parsed.data, result } } })
    await notifyRole(tx, ROLE.KITCHEN, order.branchId, { type: 'order.created', title: parsed.data.action === 'quantity' ? 'تعديل كمية في طلب قيد التحضير' : 'استبدال متغير في طلب قيد التحضير', body: parsed.data.reason, orderId })
    await tx.financialOperation.create({ data: { branchId: order.branchId, actorId: session.id, operationType, idempotencyKey: parsed.data.idempotencyKey, fingerprint, result } })
    return result
  })
}
