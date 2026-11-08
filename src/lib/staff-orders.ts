import { createHash } from 'node:crypto'
import { mayAppendToOrder } from '@/lib/table-order-policy'
import { validateModifierSelections } from '@/lib/staff-pos-write'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, hasPermission, requiresOperationalShift, type RoleSlug } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { notifyRole, type NotificationType } from '@/lib/notifications'
import { lockAndReadShift } from '@/lib/financial-shift-lock'
import { getOpenShift, ShiftError } from '@/lib/staff-shifts'
import { consumeOrderReservations, markOrderPreparation, releaseOrderReservations, reserveOrderInventory, reserveOrderItemInventory, serveOrderItemInventory, StockError } from '@/lib/staff-inventory-engine'
import { createOrderItemVariantSnapshot, orderedVariantLabels, resolveOrderItemVariantLabels } from '@/lib/order-item-variant'
import { modifierSnapshotLabels } from '@/lib/order-item-options'
import { centsText, invoiceDiscountKind, invoiceDiscountValue, recalculateOpenOrderInvoice } from '@/lib/invoice-recalculation'

/**
 * Staff order lifecycle — server-only.
 *
 * STATUS MODEL (lowercase, matches the public-order writer and the UI labels):
 *   new → preparing → ready → served   (happy path)
 *   new / preparing → cancelled        (before it leaves the kitchen)
 * `served` and `cancelled` are terminal.
 *
 * SECURITY: every transition is (a) branch-scoped to the caller, (b) gated by a
 * minimum role, and (c) appended to `order_status_history` in the SAME
 * transaction as the status change — the audit trail can never drift from the
 * order. Prices are never touched here.
 */

export const ORDER_FLOW = ['pending', 'new', 'preparing', 'ready', 'served'] as const
export type OrderStatus = (typeof ORDER_FLOW)[number] | 'cancelled'

export function isOrderStatus(v: string): v is OrderStatus {
  return v === 'pending' || v === 'new' || v === 'preparing' || v === 'ready' || v === 'served' || v === 'cancelled'
}

/** Pure counterpart of the kitchen queue predicate, kept testable without a DB. */
export function isKitchenTicketVisible(status: string, sentToKitchen: boolean, orderType = 'dine_in', paymentStatus = 'unpaid', source = ''): boolean {
  return sentToKitchen && (orderType !== 'takeaway' || paymentStatus === 'paid') && (source !== 'qr' || paymentStatus === 'paid') && (status === 'new' || status === 'preparing' || status === 'ready')
}

export function takeawayDispatchBlocker(orderType: string, paymentStatus: string): 'unpaid' | null {
  return orderType === 'takeaway' && paymentStatus !== 'paid' ? 'unpaid' : null
}

/** Minimum role required to move `from → to`. Absent = transition is illegal. */
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, RoleSlug>>> = {
  pending: { new: ROLE.WAITER, cancelled: ROLE.WAITER },
  new: { preparing: ROLE.KITCHEN, cancelled: ROLE.CASHIER },
  preparing: { ready: ROLE.KITCHEN, cancelled: ROLE.CASHIER },
  ready: { served: ROLE.WAITER },
  served: {},
  cancelled: {},
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.[to] !== undefined
}

/** Error carrying an intended HTTP status so the route can map it cleanly. */
export class OrderError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'OrderError'
    this.status = status
  }
}

/** Serializable order row for the staff board (no BigInt/Decimal leakage). */
export interface StaffOrderRow {
  id: string
  number: string
  status: string
  paymentStatus: string
  orderType: string
  total: number
  customerName: string | null
  source: string
  orderNotes: string | null
  tableNumber: string
  createdAt: string
  updatedAt: string
  items: { id: string; productId: string; variantId: string | null; name: string; variantLabel: string | null; details: string[]; qty: number; servedQty: number; preparedQty: number; preparationStartedAt: string | null; unitPrice: number; lineTotal?: number; note: string | null; updatedAt: string }[]
  itemsCount: number
  createdById?: string | null
  qrClaimedAt?: string | null
  qrApprovedAt?: string | null
  qrRejectedAt?: string | null
  qrDecisionById?: string | null
  /** Set once the waiter has pushed the order to the kitchen ("إرسال للمطبخ"). */
  sentToKitchen: boolean
  sentToKitchenAt: string | null
  cancelReason: string | null
}

/**
 * List orders for the caller's branch (Owner sees all branches). Newest first.
 * `status` filter is optional ('all' or a concrete status).
 */
export async function listStaffOrders(
  session: StaffSession,
  opts: { status?: string; limit?: number } = {},
): Promise<StaffOrderRow[]> {
  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }
  const statusFilter = opts.status && opts.status !== 'all' && isOrderStatus(opts.status) ? opts.status : undefined

  const orders = await prisma.order.findMany({
    where: { ...branchScope, ...(statusFilter ? { status: statusFilter } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 100, 200),
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      orderType: true,
      total: true,
      customerName: true,
      source: true, notes: true,
      createdAt: true, updatedAt: true,
      sentToKitchenAt: true,
      cancelReason: true,
      cafeTable: { select: { number: true } },
      items: {
        where: { isVoided: false },
        orderBy: { id: 'asc' },
        select: { id: true, productId: true, productName: true, productVariantId: true, productVariantSnapshot: true, optionsSnapshot: true, productVariant: { select: { values: { select: { value: { select: { label: true, attribute: { select: { sortOrder: true } } } } } } } }, quantity: true, servedQuantity: true, preparedQuantity: true, preparationStartedAt: true, unitPrice: true, notes: true, updatedAt: true },
      },
    },
  })

  return orders.map((o) => ({
    id: o.id.toString(),
    number: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    orderType: o.orderType,
    total: Number(o.total), orderNotes: o.notes,
    customerName: o.customerName,
    source: o.source,
    tableNumber: o.cafeTable.number,
    createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(),
    sentToKitchen: o.sentToKitchenAt != null,
    sentToKitchenAt: o.sentToKitchenAt?.toISOString() ?? null,
    cancelReason: o.cancelReason ?? null,
    items: o.items.map((i) => { const labels = i.productVariantId || i.productVariantSnapshot ? resolveOrderItemVariantLabels(i.productVariantSnapshot, orderedVariantLabels(i.productVariant?.values.map((entry) => entry.value) ?? [])) : []; return { id: i.id.toString(), productId: i.productId.toString(), variantId: i.productVariantId?.toString() ?? null, name: i.productName, variantLabel: labels.length ? labels.join(' · ') : null, details: modifierSnapshotLabels(i.optionsSnapshot), qty: i.quantity, servedQty: i.servedQuantity, preparedQty: i.preparedQuantity, preparationStartedAt: i.preparationStartedAt?.toISOString() ?? null, unitPrice: Number(i.unitPrice), note: i.notes, updatedAt: i.updatedAt.toISOString() } }),
    itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
  }))
}

/** My waiter orders: only orders currently assigned to the authenticated waiter. */
export async function listMyOrders(session: StaffSession, opts: { limit?: number } = {}): Promise<StaffOrderRow[]> {
  const branchScope = session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }
  const orders = await prisma.order.findMany({
    where: {
      ...branchScope,
      responsibleWaiterId: session.id,
      status: { in: ['new', 'preparing', 'ready', 'served', 'cancelled'] },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? 100, 200),
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      orderType: true,
      total: true,
      customerName: true,
      source: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      sentToKitchenAt: true,
      cancelReason: true,
      createdById: true,
      qrClaimedAt: true,
      qrApprovedAt: true,
      qrRejectedAt: true,
      qrDecisionById: true,
      cafeTable: { select: { number: true } },
      items: {
        where: { isVoided: false },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          productName: true,
          productId: true,
          productVariantId: true,
          productVariantSnapshot: true,
          optionsSnapshot: true,
          productVariant: { select: { values: { select: { value: { select: { label: true, attribute: { select: { sortOrder: true } } } } } } } },
          quantity: true,
          servedQuantity: true,
          preparedQuantity: true,
          preparationStartedAt: true,
          unitPrice: true,
          notes: true,
          updatedAt: true,
        },
      },
    },
  })

  return orders.map((o) => ({
    id: o.id.toString(),
    number: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    orderType: o.orderType,
    total: Number(o.total),
    customerName: o.customerName,
    source: o.source,
    orderNotes: o.notes,
    tableNumber: o.cafeTable.number,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    sentToKitchen: o.sentToKitchenAt != null,
    sentToKitchenAt: o.sentToKitchenAt?.toISOString() ?? null,
    cancelReason: o.cancelReason ?? null,
    createdById: o.createdById?.toString() ?? null,
    qrClaimedAt: o.qrClaimedAt?.toISOString() ?? null,
    qrApprovedAt: o.qrApprovedAt?.toISOString() ?? null,
    qrRejectedAt: o.qrRejectedAt?.toISOString() ?? null,
    qrDecisionById: o.qrDecisionById?.toString() ?? null,
    items: o.items.map((i) => {
      const labels = i.productVariantId || i.productVariantSnapshot ? resolveOrderItemVariantLabels(i.productVariantSnapshot, orderedVariantLabels(i.productVariant?.values.map((entry) => entry.value) ?? [])) : []
      return {
        id: i.id.toString(),
        productId: i.productId.toString(),
        variantId: i.productVariantId?.toString() ?? null,
        name: i.productName,
        variantLabel: labels.length ? labels.join(' · ') : null,
        details: modifierSnapshotLabels(i.optionsSnapshot),
        qty: i.quantity,
        servedQty: i.servedQuantity,
        preparedQty: i.preparedQuantity,
        preparationStartedAt: i.preparationStartedAt?.toISOString() ?? null,
        unitPrice: Number(i.unitPrice),
        note: i.notes,
        updatedAt: i.updatedAt.toISOString(),
      }
    }),
    itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
  }))
}


/** Kitchen-only queue: a new ticket is actionable only after dispatch. */
export async function listKitchenOrders(session: StaffSession, limit = 100): Promise<StaffOrderRow[]> {
  const branchScope = session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }
  // Completed tickets are a read-only, same-day history for the kitchen. They
  // never become actionable again and are deliberately capped with the live queue.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const orders = await prisma.order.findMany({
    where: {
      ...branchScope,
      sentToKitchenAt: { not: null },
      AND: [{ OR: [{ orderType: { not: 'takeaway' } }, { paymentStatus: 'paid' }] }],
      OR: [
        { status: { in: ['new', 'preparing', 'ready'] } },
        { status: 'served', servedAt: { gte: todayStart } },
      ],
    },
    // The oldest ticket is always presented first so the KDS cannot silently
    // starve an earlier table while a new one keeps arriving.
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 200),
    select: {
      id: true, orderNumber: true, status: true, paymentStatus: true, orderType: true, total: true, customerName: true,
      source: true, notes: true, createdAt: true, updatedAt: true, sentToKitchenAt: true, cancelReason: true,
      cafeTable: { select: { number: true } },
      items: { where: { isVoided: false }, orderBy: { id: 'asc' }, select: { id: true, productId: true, productName: true, productVariantId: true, productVariantSnapshot: true, optionsSnapshot: true, productVariant: { select: { values: { select: { value: { select: { label: true, attribute: { select: { sortOrder: true } } } } } } } }, quantity: true, servedQuantity: true, preparedQuantity: true, preparationStartedAt: true, unitPrice: true, notes: true, updatedAt: true } },
    },
  })
  return orders.map((o) => ({
    id: o.id.toString(), number: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus, orderType: o.orderType,
    total: Number(o.total), customerName: o.customerName, source: o.source, orderNotes: o.notes, tableNumber: o.cafeTable.number,
    createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(), sentToKitchen: o.sentToKitchenAt != null,
    sentToKitchenAt: o.sentToKitchenAt?.toISOString() ?? null, cancelReason: o.cancelReason ?? null,
    items: o.items.map((i) => { const labels = i.productVariantId || i.productVariantSnapshot ? resolveOrderItemVariantLabels(i.productVariantSnapshot, orderedVariantLabels(i.productVariant?.values.map((entry) => entry.value) ?? [])) : []; return { id: i.id.toString(), productId: i.productId.toString(), variantId: i.productVariantId?.toString() ?? null, name: i.productName, variantLabel: labels.length ? labels.join(' · ') : null, details: modifierSnapshotLabels(i.optionsSnapshot), qty: i.quantity, servedQty: i.servedQuantity, preparedQty: i.preparedQuantity, preparationStartedAt: i.preparationStartedAt?.toISOString() ?? null, unitPrice: Number(i.unitPrice), note: i.notes, updatedAt: i.updatedAt.toISOString() } }),
    itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
  }))
}

const toStatusSchema = z.enum(['preparing', 'ready', 'served', 'cancelled'])
const cancelReasonSchema = z.string().trim().min(3).max(255).optional()
export const waiterOrderEditSchema = z.object({
  items: z.array(z.object({ itemId: z.string().regex(/^\d+$/).optional(), productId: z.string().regex(/^\d+$/), qty: z.number().int().min(1).max(20), note: z.string().trim().max(255).optional() }).strict()).min(1).max(30),
  notes: z.string().trim().max(2000).optional(),
  expectedUpdatedAt: z.string().datetime(),
}).strict()
const serveItemsSchema = z.object({
  items: z.array(z.object({ orderItemId: z.string().regex(/^\d+$/), quantity: z.coerce.number().int().positive().max(99) })).min(1).max(30),
  interventionReason: z.string().trim().min(3).max(255).optional(),
  idempotencyKey: z.string().trim().min(8).max(100),
})
const prepareItemsSchema = z.object({
  mode: z.enum(['start', 'ready']),
  itemIds: z.array(z.string().regex(/^\d+$/)).min(1).max(30),
})

type DispatchState = { status: string; branch_id: bigint; order_type: string; payment_status: string; sent_to_kitchen_at: Date | null; source: string; qr_approved_at: Date | null }

function requireKitchenDispatch(order: DispatchState) {
  if (order.status === 'pending' || !order.sent_to_kitchen_at || (order.source === 'qr' && !order.qr_approved_at)) throw new OrderError('يجب اعتماد الطلب وإرساله للمطبخ قبل التحضير', 409)
  if (takeawayDispatchBlocker(order.order_type, order.payment_status)) throw new OrderError('يجب تحصيل طلب التيك أواي بالكامل قبل التحضير', 409)
}

/** A small, DB-free status projection shared by the KDS and its tests. */
export function itemPreparationState(item: { qty: number; preparedQty: number; preparationStartedAt: string | null }): 'new' | 'preparing' | 'ready' {
  if (item.preparedQty >= item.qty) return 'ready'
  return item.preparationStartedAt ? 'preparing' : 'new'
}

/**
 * Start or finish selected kitchen lines. Preparation only records operational
 * progress; reservations are converted to inventory consumption exclusively by
 * the waiter-serving writer. The order row is locked first, which is the same
 * serialization point used by the existing status and serving writers.
 */
export async function prepareOrderItems(session: StaffSession, orderIdRaw: string, input: unknown) {
  // Owners supervise kitchen activity but are not kitchen operators. Keeping
  // this server-side prevents direct API calls from bypassing the read-only UI.
  if (session.role !== ROLE.KITCHEN) throw new OrderError('Kitchen role required', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new OrderError('Order not found', 404)
  const parsed = prepareItemsSchema.safeParse(input)
  if (!parsed.success) throw new OrderError('Invalid item-preparation request', 400)
  const orderId = BigInt(orderIdRaw)
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, branchId: true, orderNumber: true } })
  if (!order || !staffCanAccessBranch(session, order.branchId)) throw new OrderError('Order not found', 404)
  const activeShift = await getOpenShift(session.id, order.branchId)
  if (!activeShift) throw new OrderError('An open shift is required', 409)

  return prisma.$transaction(async (tx) => {
    const shift = await lockAndReadShift(tx, activeShift.id)
    if (!shift || shift.status !== 'open' || shift.cashierId !== session.id || shift.branchId !== order.branchId) throw new OrderError('الوردية لم تعد مفتوحة', 409)
    const locked = await tx.$queryRaw<DispatchState[]>`SELECT status, branch_id, order_type, payment_status, sent_to_kitchen_at, source, qr_approved_at FROM orders WHERE id = ${orderId} FOR UPDATE`
    if (!locked[0] || locked[0].branch_id !== order.branchId || !staffCanAccessBranch(session, locked[0].branch_id)) throw new OrderError('Order not found', 404)
    requireKitchenDispatch(locked[0])
    if (!locked[0] || !['new', 'preparing'].includes(locked[0].status)) throw new OrderError('Only active kitchen orders can be prepared', 409)
    const uniqueIds = [...new Set(parsed.data.itemIds)]
    if (uniqueIds.length !== parsed.data.itemIds.length) throw new OrderError('An item may only be prepared once per request', 400)
    const itemIds = uniqueIds.map((id) => BigInt(id))
    const lines = await tx.orderItem.findMany({ where: { id: { in: itemIds }, orderId, isVoided: false }, select: { id: true, quantity: true, preparedQuantity: true, preparationStartedAt: true } })
    if (lines.length !== itemIds.length) throw new OrderError('A selected order item is unavailable', 404)
    const now = new Date()
    const starting = locked[0].status === 'new'
    if (starting) {
      await tx.order.update({ where: { id: orderId }, data: { status: 'preparing', acceptedAt: now } })
      await tx.orderStatusHistory.create({ data: { orderId, fromStatus: 'new', toStatus: 'preparing', changedById: session.id } })
      await emitStatusNotifications(tx, { to: 'preparing', orderId, branchId: order.branchId, orderNumber: order.orderNumber })
    }
    await tx.orderItem.updateMany({ where: { id: { in: itemIds }, preparationStartedAt: null }, data: { preparationStartedAt: now, preparationStartedById: session.id } })
    if (parsed.data.mode === 'ready') {
      // A line becomes ready as a whole. Partial order readiness is represented
      // by completing some lines while others remain in preparation.
      await Promise.all(lines.map((line) => tx.orderItem.update({ where: { id: line.id }, data: { preparedQuantity: line.quantity } })))
      const refreshed = await tx.orderItem.findMany({ where: { orderId, isVoided: false }, select: { quantity: true, preparedQuantity: true } })
      if (refreshed.every((line) => line.preparedQuantity >= line.quantity)) {
        await tx.order.update({ where: { id: orderId }, data: { status: 'ready', readyAt: now } })
        await tx.orderStatusHistory.create({ data: { orderId, fromStatus: 'preparing', toStatus: 'ready', changedById: session.id } })
        await emitStatusNotifications(tx, { to: 'ready', orderId, branchId: order.branchId, orderNumber: order.orderNumber })
      }
    }
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: `order.items_${parsed.data.mode === 'start' ? 'preparation_started' : 'ready'}`, entityType: 'order', entityId: orderId, newValues: { itemIds: uniqueIds } } })
    const status = parsed.data.mode === 'ready' && (await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } })).status
    return { id: orderId.toString(), status: status || 'preparing', mode: parsed.data.mode, itemIds: uniqueIds }
  })
}

/** Replace lines on an unsent waiter order. Prices and totals are always re-derived on the server. */
export async function editWaiterOrder(session: StaffSession, orderIdRaw: string, input: unknown) {
  if (session.role !== ROLE.WAITER) throw new OrderError('Waiter role required', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new OrderError('Order not found', 404)
  const parsed = waiterOrderEditSchema.safeParse(input)
  if (!parsed.success) throw new OrderError('Invalid order edit', 400)
  const orderId = BigInt(orderIdRaw)
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, branchId: true, responsibleWaiterId: true } })
  if (!order || !staffCanAccessBranch(session, order.branchId)) throw new OrderError('Order not found', 404)
  if (session.role === ROLE.WAITER && order.responsibleWaiterId !== session.id) throw new OrderError('Forbidden', 403)
  const editingShift = await getOpenShift(session.id, order.branchId)
  if (!editingShift) throw new OrderError('An open shift is required', 409)

  return prisma.$transaction(async (tx) => {
    const lockedShift = await lockAndReadShift(tx, editingShift.id)
    if (!lockedShift || lockedShift.status !== 'open' || lockedShift.cashierId !== session.id || lockedShift.branchId !== order.branchId) throw new OrderError('الوردية لم تعد مفتوحة', 409)
    const locked = await tx.$queryRaw<{ status: string; sent_to_kitchen_at: Date | null; discount_type: string | null; discount_value: unknown; tax_rate: unknown; updated_at: Date; responsible_waiter_id: string | null }[]>`
      SELECT status, sent_to_kitchen_at, discount_type, discount_value, tax_rate, updated_at, responsible_waiter_id FROM orders WHERE id = ${orderId} FOR UPDATE
    `
    const row = locked[0]
    if (!row || row.status !== 'new' || row.sent_to_kitchen_at) throw new OrderError('Only unsent new orders can be edited', 409)
    if (row.responsible_waiter_id !== session.id) throw new OrderError('تغيرت مسؤولية الطلب', 403)
    if (row.updated_at.toISOString() !== parsed.data.expectedUpdatedAt) throw new OrderError('تغيّر الطلب بواسطة موظف آخر؛ حدّث الصفحة وراجع التغييرات', 409)
    const submittedItemIds = parsed.data.items.flatMap((item) => item.itemId ? [BigInt(item.itemId)] : [])
    if (new Set(submittedItemIds.map(String)).size !== submittedItemIds.length) throw new OrderError('Duplicate order item', 400)
    const existingItems = await tx.orderItem.findMany({ where: { orderId, isVoided: false }, select: { id: true, productId: true } })
    if (parsed.data.items.some((item) => !item.itemId) || submittedItemIds.length !== existingItems.length) throw new OrderError('استخدم إضافة الأصناف أو الإلغاء الموثق بدل استبدال سطور الطلب', 409)
    const existingById = new Map(existingItems.map((item) => [item.id.toString(), item]))
    for (const item of parsed.data.items) {
      if (!item.itemId) continue
      const existing = existingById.get(item.itemId)
      if (!existing || existing.productId.toString() !== item.productId) throw new OrderError('Order item not found', 404)
    }
    const newProductIds = [...new Set(parsed.data.items.filter((item) => !item.itemId).map((item) => BigInt(item.productId)))]
    const products = newProductIds.length ? await tx.product.findMany({ where: { id: { in: newProductIds }, branchId: order.branchId, isActive: true, isAvailable: true, deletedAt: null }, select: { id: true, name: true, price: true } }) : []
    const byId = new Map(products.map((product) => [product.id.toString(), product]))
    if (byId.size !== newProductIds.length) throw new OrderError('A selected product is unavailable', 422)
    const newLines = parsed.data.items.filter((item) => !item.itemId).map((item) => {
      const product = byId.get(item.productId)!
      return { productId: product.id, productName: product.name, unitPrice: product.price, quantity: item.qty, lineTotal: (Number(product.price) * item.qty).toFixed(2), notes: item.note || null }
    })
    await Promise.all(parsed.data.items.filter((item) => item.itemId).map((item) => tx.orderItem.update({ where: { id: BigInt(item.itemId!) }, data: { quantity: item.qty, notes: item.note || null } })))
    await tx.orderItem.deleteMany({ where: { orderId, id: { notIn: submittedItemIds } } })
    if (newLines.length) await tx.orderItem.createMany({ data: newLines.map((line) => ({ ...line, orderId })) })
    const invoiceKind = invoiceDiscountKind(row.discount_type)
    const result = await recalculateOpenOrderInvoice(tx, orderId, invoiceKind, invoiceDiscountValue(invoiceKind, row.discount_value), row.tax_rate)
    const { calculated, tax, total } = result
    const collected = await tx.payment.aggregate({ where: { orderId: order.id, status: 'completed' }, _sum: { amount: true } })
    if (total < moneyCents(Number(collected._sum.amount ?? 0))) throw new OrderError('الإجمالي أقل من المبلغ المحصل؛ يلزم تصحيح مالي مصرح', 409)
    const itemsCount = parsed.data.items.reduce((sum, item) => sum + item.qty, 0)
    await tx.order.update({ where: { id: orderId }, data: { notes: parsed.data.notes || null, itemsSubtotal: centsText(calculated.subtotalCents), itemDiscountAmount: centsText(calculated.itemDiscountCents), discountEligibleBase: centsText(calculated.eligibleBaseCents), discountAmount: centsText(calculated.itemDiscountCents + calculated.invoiceDiscountCents), taxAmount: centsText(tax), total: centsText(total) } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: 'waiter.order_edit', entityType: 'order', entityId: orderId, newValues: { itemsCount, total: centsText(total), notes: parsed.data.notes || null } } })
    return { id: orderId.toString(), total: centsText(total), itemsCount }
  })
}

/**
 * Move an order to `to`, enforcing branch scope, legal transition, and role
 * authority, and recording the change in `order_status_history` atomically.
 */
export async function transitionOrderStatus(
  session: StaffSession,
  orderId: string,
  toRaw: string,
  reasonRaw?: unknown,
) {
  // Owners monitor waiter operations but never perform their state changes.
  if (session.role === ROLE.OWNER) throw new OrderError('Owner waiter monitoring is read-only', 403)
  if (!/^\d+$/.test(orderId)) throw new OrderError('Order not found', 404)
  const parsed = toStatusSchema.safeParse(toRaw)
  if (!parsed.success) throw new OrderError('Invalid target status', 400)
  const to = parsed.data
  const reason = cancelReasonSchema.safeParse(reasonRaw)
  if (!reason.success) throw new OrderError('Invalid cancellation reason', 400)
  if (to === 'cancelled' && !reason.data) throw new OrderError('A cancellation reason is required', 400)

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderId) },
    select: { id: true, branchId: true, status: true, paymentStatus: true, orderNumber: true, responsibleWaiterId: true, orderType: true },
  })
  if (!order) throw new OrderError('Order not found', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new OrderError('Forbidden', 403)

  // The acting employee must have an open shift for their branch.
  let activeShift: Awaited<ReturnType<typeof getOpenShift>> = null
  if (requiresOperationalShift(session.role)) {
  if (session.branchId === null) throw new OrderError('غير مصرح — لا فرع مرتبط بالمستخدم', 403)
  activeShift = await getOpenShift(session.id, BigInt(session.branchId))
  if (!activeShift) throw new OrderError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)
  }

  const current = order.status as OrderStatus
  const minRole = TRANSITIONS[current]?.[to]
  if (!minRole) throw new OrderError(`لا يمكن نقل الطلب من "${current}" إلى "${to}"`, 409)
  const waiterMayCancel = to === 'cancelled' && session.role === ROLE.WAITER && (order.responsibleWaiterId === session.id || hasPermission(session.permissions, 'orders.cancel'))
  if (!hasAtLeast(session.role, minRole) && !waiterMayCancel) throw new OrderError('Forbidden', 403)
  // The legacy whole-order "served" endpoint may only be used by the
  // responsible waiter. Cross-waiter service must use serveOrderItems with an
  // explicit intervention reason, which preserves the emergency audit trail.
  if (to === 'served' && session.role === ROLE.WAITER && order.responsibleWaiterId !== session.id) {
    throw new OrderError('Emergency serving must use item serving with an intervention reason', 403)
  }
  if (to === 'cancelled' && order.paymentStatus === 'paid') throw new OrderError('A paid order must be refunded through the payment correction flow', 409)

  await prisma.$transaction(async (tx) => {
    if (activeShift) {
      const shift = await lockAndReadShift(tx, activeShift.id)
      if (!shift || shift.status !== 'open' || shift.cashierId !== session.id || shift.branchId !== order.branchId) throw new OrderError('الوردية لم تعد مفتوحة', 409)
    }
    const lockedRows = await tx.$queryRaw<(DispatchState & { responsible_waiter_id: string | null })[]>`
      SELECT status, branch_id, order_type, payment_status, sent_to_kitchen_at, source, qr_approved_at, responsible_waiter_id FROM orders WHERE id = ${order.id} FOR UPDATE
    `
    const locked = lockedRows[0]
    if (!locked || locked.status !== current) throw new OrderError('Order status changed; refresh and retry', 409)
    if (locked.branch_id !== order.branchId || !staffCanAccessBranch(session, locked.branch_id)) throw new OrderError('Forbidden', 403)
    if (to === 'preparing' || to === 'ready') requireKitchenDispatch(locked)
    if (to === 'cancelled' && session.role === ROLE.WAITER && locked.responsible_waiter_id !== session.id && !hasPermission(session.permissions, 'orders.cancel')) throw new OrderError('Order responsibility changed; refresh and retry', 409)
    if (to === 'cancelled' && locked.payment_status === 'paid') throw new OrderError('A paid order must be refunded through the payment correction flow', 409)
    // Inventory is deliberately not consumed at acceptance/ready. Preparation
    // attribution starts when the kitchen accepts; service converts the held
    // reservation to immutable consumption. A prepared cancellation becomes
    // waste, while an unprepared one only releases its hold.
    try {
      if (to === 'preparing') await markOrderPreparation(tx, order.id, session.id)
      // Retain synchronization for the legacy whole-ticket kitchen endpoint:
      // when it declares a ticket ready, every active line is ready as well.
      if (to === 'ready') await tx.$executeRaw`
        UPDATE order_items
        SET prepared_quantity = quantity,
            preparation_started_at = COALESCE(preparation_started_at, ${new Date()}),
            preparation_started_by_id = COALESCE(preparation_started_by_id, ${session.id})
        WHERE order_id = ${order.id} AND is_voided = false
      `
      if (to === 'served') await consumeOrderReservations(tx, order.id, session.id, 'consumption')
      if (to === 'cancelled' && current === 'new') await releaseOrderReservations(tx, order.id)
      if (to === 'cancelled' && current === 'preparing') {
        // With item-level preparation, only lines whose kitchen work started
        // become cancellation waste; untouched reservations are released.
        const started = await tx.orderItem.findMany({ where: { orderId: order.id, isVoided: false, preparationStartedAt: { not: null } }, select: { id: true, quantity: true } })
        if (started.length) await consumeOrderReservations(tx, order.id, session.id, 'waste', reason.data, started.map((item) => ({ orderItemId: item.id, quantity: item.quantity })))
        await releaseOrderReservations(tx, order.id)
      }
    } catch (error) {
      if (error instanceof StockError) throw new OrderError(error.message, error.status)
      throw error
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: to,
        ...(to === 'preparing' ? { acceptedAt: new Date() } : {}),
        ...(to === 'ready' ? { readyAt: new Date() } : {}),
        ...(to === 'served' ? { servedAt: new Date() } : {}),
        ...(to === 'cancelled' ? { cancelledAt: new Date(), cancelReason: reason.data } : {}),
      },
    })
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: current, toStatus: to, changedById: session.id },
    })
    if (to === 'cancelled') {
      await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: 'order.cancel', entityType: 'order', entityId: order.id, newValues: { reason: reason.data } } })
    }
    // Notify the staff who must act on the NEW status (same tx — atomic).
    await emitStatusNotifications(tx, { to, orderId: order.id, branchId: order.branchId, orderNumber: order.orderNumber })
  })

  return { id: order.id.toString(), orderNumber: order.orderNumber, status: to }
}

/**
 * Append new items to an existing open order without creating a second order.
 * Used when a cashier or waiter adds products to a table that already has an
 * active order. Inventory is reserved per new item; the order is reverted to
 * `preparing` if it was `ready` so the kitchen sees the new work.
 */
export const appendOrderItemsSchema = z.object({
  items: z.array(z.object({
    productId: z.string().regex(/^\d+$/, 'Invalid product id'),
    variantId: z.string().regex(/^\d+$/, 'Invalid variant id').optional(),
    modifierSelections: z.array(z.object({
      groupId: z.string().regex(/^\d+$/),
      valueIds: z.array(z.string().regex(/^\d+$/)).max(20),
    })).max(20).default([]),
    qty: z.number().int().min(1).max(20),
    note: z.string().max(255).optional(),
  })).min(1, 'السلة فارغة').max(30),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

export async function appendOrderItems(
  session: StaffSession,
  orderIdRaw: string,
  input: unknown,
): Promise<{ orderId: string; orderNumber: string; itemsCount: number; total: string }> {
  if (session.role !== ROLE.WAITER && session.role !== ROLE.CASHIER) throw new OrderError('غير مصرح بإضافة أصناف إلى الطلب', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new OrderError('الطلب غير موجود', 404)

  const parsed = appendOrderItemsSchema.safeParse(input)
  if (!parsed.success) throw new OrderError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { items } = parsed.data

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderIdRaw) },
    select: { id: true, branchId: true, status: true, paymentStatus: true, orderNumber: true, responsibleWaiterId: true, orderType: true },
  })
  if (!order) throw new OrderError('الطلب غير موجود', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new OrderError('غير مصرح', 403)
  if (session.role === ROLE.WAITER && order.responsibleWaiterId !== session.id) throw new OrderError('لا يمكنك إضافة أصناف لطلب نادل آخر', 403)
  if (!mayAppendToOrder(order.status, order.paymentStatus)) throw new OrderError('لا يمكن إضافة أصناف لطلب مغلق', 409)
  if (order.paymentStatus === 'paid') throw new OrderError('لا يمكن إضافة أصناف لطلب تم تحصيله', 409)

  const openShift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, order.branchId) : null
  if (requiresOperationalShift(session.role) && !openShift) throw new OrderError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)

  const productIds = [...new Set(items.map((i) => BigInt(i.productId)))]
  const variantIds = [...new Set(items.map((i) => i.variantId).filter(Boolean) as string[])].map(BigInt)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, branchId: order.branchId, isActive: true, deletedAt: null, isAvailable: true },
    select: {
      id: true, name: true, price: true,
      variants: { where: { isActive: true, isAvailable: true, archivedAt: null }, select: { id: true, combinationKey: true, price: true } },
      optionAssignments: {
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          sortOrder: true,
          productOption: {
            select: {
              id: true, name: true, description: true, type: true, isRequired: true, minSelections: true, maxSelections: true, isActive: true,
              values: { where: { isActive: true, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, value: true, priceAdjustment: true, isActive: true } },
            },
          },
        },
      },
    },
  })
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds }, productId: { in: productIds }, isActive: true, isAvailable: true, archivedAt: null },
        select: { id: true, productId: true, price: true, combinationKey: true, values: { select: { value: { select: { label: true, attribute: { select: { sortOrder: true } } } } } } },
      })
    : []
  const priceById = new Map(products.map((p) => [p.id.toString(), p]))
  const variantById = new Map(variants.map((v) => [v.id.toString(), v]))

  for (const item of items) {
    if (!priceById.has(item.productId)) throw new OrderError('تغيّرت القائمة — حدّث الصفحة', 400)
    const variant = item.variantId ? variantById.get(item.variantId) : null
    if (!item.variantId && priceById.get(item.productId)!.variants.length) throw new OrderError('اختر متغير المنتج', 400)
    if (item.variantId && (!variant || variant.productId.toString() !== item.productId)) throw new OrderError('المتغير غير متوفر', 400)
  }

  const key = parsed.data.idempotencyKey?.trim() || null
  const fingerprint = key ? createHash('sha256').update(JSON.stringify({ orderId: orderIdRaw, items: items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, modifierSelections: i.modifierSelections, qty: i.qty, note: i.note ?? null })) })).digest('hex') : null
  if (key) {
    const prior = await prisma.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType: 'order_item_append', idempotencyKey: key } } })
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new OrderError('مفتاح العملية استُخدم لطلب مختلف', 409)
      return prior.result as unknown as { orderId: string; orderNumber: string; itemsCount: number; total: string }
    }
  }

  return prisma.$transaction(async (tx) => {
    if (openShift) {
      const lockedShift = await lockAndReadShift(tx, openShift.id)
      if (!lockedShift || lockedShift.status !== 'open' || lockedShift.cashierId !== session.id || lockedShift.branchId !== order.branchId) throw new OrderError('الوردية لم تعد مفتوحة', 409)
    }

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('order-item-append:' || ${orderIdRaw}))`
    const locked = await tx.$queryRaw<{ status: string; payment_status: string; responsible_waiter_id: string | null; sent_to_kitchen_at: Date | null }[]>`
      SELECT status, payment_status, responsible_waiter_id, sent_to_kitchen_at FROM orders WHERE id = ${order.id} FOR UPDATE
    `
    if (!locked[0] || !mayAppendToOrder(locked[0].status, locked[0].payment_status)) throw new OrderError('الطلب لم يعد مفتوحاً للتعديل', 409)
    if (locked[0].payment_status === 'paid') throw new OrderError('لا يمكن إضافة أصناف لطلب تم تحصيله', 409)
    if (session.role === ROLE.WAITER && locked[0].responsible_waiter_id !== session.id) throw new OrderError('تغيّرت مسؤولية الطلب؛ حدّث الصفحة', 409)

    if (key) {
      const repeated = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType: 'order_item_append', idempotencyKey: key } } })
      if (repeated) {
        if (repeated.fingerprint !== fingerprint!) throw new OrderError('مفتاح العملية استُخدم لطلب مختلف', 409)
        return repeated.result as unknown as { orderId: string; orderNumber: string; itemsCount: number; total: string }
      }
    }

    for (const item of items) {
      try { validateModifierSelections(priceById.get(item.productId)!, item.modifierSelections) }
      catch (error) { throw new OrderError(error instanceof Error ? error.message : 'اختيارات المنتج غير صالحة', 400) }
    }
    const now = new Date()
    const createdItemIds: string[] = []
    let totalAddedCents = 0n

    for (const item of items) {
      const p = priceById.get(item.productId)!
      const variant = item.variantId ? variantById.get(item.variantId)! : null

      // Compute modifier adjustments
      const modifierAdjustments: { groupId: bigint; groupName: string; optionId: bigint; optionLabel: string; priceAdjustment: bigint }[] = []
      for (const sel of item.modifierSelections) {
        const group = p.optionAssignments.find((a) => a.productOption.id.toString() === sel.groupId)?.productOption
        if (!group || !group.isActive) throw new OrderError('مجموعة إضافات غير متاحة لهذا المنتج', 400)
        for (const valueId of sel.valueIds) {
          const option = group.values.find((v) => v.id.toString() === valueId)
          if (!option || !option.isActive) throw new OrderError('اختيار غير متاح في مجموعة الإضافات', 400)
          modifierAdjustments.push({ groupId: group.id, groupName: group.name, optionId: option.id, optionLabel: option.value, priceAdjustment: moneyCents(Number(option.priceAdjustment)) })
        }
      }

      const variantAdjustmentCents = variant ? moneyCents(Number(variant.price)) : moneyCents(Number(p.price))
      const modifierTotalCents = modifierAdjustments.reduce((sum, m) => sum + m.priceAdjustment, 0n)
      const unitCents = variantAdjustmentCents + modifierTotalCents
      const lineCents = unitCents * BigInt(item.qty)
      totalAddedCents += lineCents

      const created = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: p.id,
          productVariantId: variant?.id ?? null,
          productName: p.name,
          unitPrice: centsText(unitCents),
          quantity: item.qty,
          lineTotal: centsText(lineCents),
          productVariantSnapshot: variant ? createOrderItemVariantSnapshot(variant.combinationKey, variant.values.map((entry) => entry.value)) : undefined,
          optionsSnapshot: { version: 1, groups: modifierAdjustments.map((m) => ({ groupId: m.groupId.toString(), groupName: m.groupName, optionId: m.optionId.toString(), optionLabel: m.optionLabel, priceAdjustment: m.priceAdjustment.toString() })) },
          options: { create: modifierAdjustments.map((m) => ({ productOptionId: m.groupId, optionValueId: m.optionId, optionName: m.groupName, valueLabel: m.optionLabel, priceAdjustment: m.priceAdjustment.toString() })) },
          notes: item.note?.trim() || null,
        },
      })
      if (locked[0].sent_to_kitchen_at) await reserveOrderItemInventory(tx, order.id, created.id)
      createdItemIds.push(created.id.toString())
    }

    // Revert to preparing if order was ready — new items need kitchen work
    const wasReady = ['ready', 'served'].includes(locked[0].status)
    if (wasReady && locked[0].sent_to_kitchen_at) {
      await tx.order.update({ where: { id: order.id }, data: { status: 'preparing', readyAt: null } })
      await tx.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: locked[0].status, toStatus: 'preparing', changedById: session.id, note: 'تم إضافة أصناف جديدة إلى طلب جاهز — عادت الحالة إلى قيد التحضير' } })
    }

    // Recalculate order totals
    const orderRow = await tx.order.findUnique({ where: { id: order.id }, select: { discountType: true, discountValue: true, taxRate: true } })
    const kind = invoiceDiscountKind(orderRow?.discountType ?? null)
    const result = await recalculateOpenOrderInvoice(tx, order.id, kind, invoiceDiscountValue(kind, orderRow?.discountValue ?? 0), orderRow?.taxRate ?? 0)
    const { calculated, tax, total } = result
    const collected = await tx.payment.aggregate({ where: { orderId: order.id, status: 'completed' }, _sum: { amount: true } })
    if (total < moneyCents(Number(collected._sum.amount ?? 0))) throw new OrderError('الإجمالي أقل من المحصل؛ يلزم تصحيح مالي مصرح', 409)
    await tx.order.update({
      where: { id: order.id },
      data: {
        itemsSubtotal: centsText(calculated.subtotalCents),
        itemDiscountAmount: centsText(calculated.itemDiscountCents),
        discountEligibleBase: centsText(calculated.eligibleBaseCents),
        discountAmount: centsText(calculated.itemDiscountCents + calculated.invoiceDiscountCents),
        taxAmount: centsText(tax),
        total: centsText(total),
      },
    })

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: order.branchId,
        action: 'order.items_append',
        entityType: 'order',
        entityId: order.id,
        newValues: { addedItemIds: createdItemIds, itemsAdded: items.length, totalAdded: totalAddedCents.toString(), newTotal: centsText(total), addedBy: session.id, addedAt: now.toISOString() },
      },
    })

    if (locked[0].sent_to_kitchen_at) await notifyRole(tx, ROLE.KITCHEN, order.branchId, {
      type: 'order.created',
      title: `إضافة أصناف إلى الطلب ${order.orderNumber}`,
      body: `أصناف جديدة فقط: ${createdItemIds.join(', ')}`,
      orderId: order.id,
    })

    const finalResult = {
      orderId: order.id.toString(),
      orderNumber: order.orderNumber,
      itemsCount: items.reduce((n, i) => n + i.qty, 0),
      total: centsText(total),
    }
    if (key) await tx.financialOperation.create({ data: { branchId: order.branchId, actorId: session.id, operationType: 'order_item_append', idempotencyKey: key, fingerprint: fingerprint!, result: finalResult } })
    return finalResult
  })
}

function moneyCents(value: number): bigint {
  return BigInt(Math.round(value * 100))
}

/**
 * Serve selected ready order lines. Each line is locked and converted through
 * the inventory engine, so a retry/concurrent waiter cannot consume it twice.
 * The order reaches `served` only after every non-voided line is fully served.
 */
export async function serveOrderItems(session: StaffSession, orderIdRaw: string, input: unknown) {
  if (session.role !== ROLE.WAITER && session.role !== ROLE.CASHIER) throw new OrderError('Waiter or cashier role required', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new OrderError('Order not found', 404)
  const parsed = serveItemsSchema.safeParse(input)
  if (!parsed.success) throw new OrderError('Invalid item-serving request', 400)
  const orderId = BigInt(orderIdRaw)
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, branchId: true, status: true, paymentStatus: true, orderType: true, orderNumber: true, responsibleWaiterId: true } })
  if (!order || !staffCanAccessBranch(session, order.branchId)) throw new OrderError('Order not found', 404)
  if (session.role === ROLE.CASHIER && (order.orderType !== 'takeaway' || order.paymentStatus !== 'paid')) throw new OrderError('Cashier handover is limited to paid takeaway orders', 403)
  const fingerprint = createHash('sha256').update(JSON.stringify({ orderId: orderIdRaw, items: parsed.data.items, interventionReason: parsed.data.interventionReason ?? null })).digest('hex')
  const operationWhere = { branchId_actorId_operationType_idempotencyKey: { branchId: order.branchId, actorId: session.id, operationType: 'order_items_serve', idempotencyKey: parsed.data.idempotencyKey } }
  type ServeResult = { id: string; served: { orderItemId: string; quantity: number }[]; orderComplete: boolean; status: string }
  const replay = (prior: { fingerprint: string; result: unknown } | null) => {
    if (!prior) return null
    if (prior.fingerprint !== fingerprint) throw new OrderError('مفتاح التقديم مستخدم لطلب مختلف', 409)
    return prior.result as ServeResult
  }
  const prior = replay(await prisma.financialOperation.findUnique({ where: operationWhere }))
  if (prior) return prior
  const activeShift = await getOpenShift(session.id, order.branchId)
  if (!activeShift) throw new OrderError('An open shift is required', 409)

  return prisma.$transaction(async (tx) => {
    const shift = await lockAndReadShift(tx, activeShift.id)
    if (!shift || shift.status !== 'open' || shift.cashierId !== session.id || shift.branchId !== order.branchId) throw new OrderError('الوردية لم تعد مفتوحة', 409)
    const locked = await tx.$queryRaw<(DispatchState & { responsible_waiter_id: string | null })[]>`SELECT status, branch_id, order_type, payment_status, sent_to_kitchen_at, source, qr_approved_at, responsible_waiter_id FROM orders WHERE id = ${orderId} FOR UPDATE`
    if (!locked[0] || locked[0].branch_id !== order.branchId || !staffCanAccessBranch(session, locked[0].branch_id)) throw new OrderError('Order not found', 404)
    const repeated = replay(await tx.financialOperation.findUnique({ where: operationWhere }))
    if (repeated) return repeated
    if (!['preparing', 'ready'].includes(locked[0]?.status ?? '')) throw new OrderError('Only prepared order items can be served', 409)
    requireKitchenDispatch(locked[0])
    if (session.role === ROLE.CASHIER && (locked[0].order_type !== 'takeaway' || locked[0].payment_status !== 'paid')) throw new OrderError('Cashier handover is limited to paid takeaway orders', 403)
    const emergency = session.role === ROLE.WAITER && locked[0].responsible_waiter_id !== session.id
    if (emergency && !parsed.data.interventionReason) throw new OrderError('Emergency serving requires an intervention reason', 400)
    // Emergency service is a fall-back, not a way to bypass a responsible
    // waiter who is currently on an operational shift.
    if (emergency && locked[0].responsible_waiter_id) {
      const responsibleShift = await tx.shift.findFirst({ where: { cashierId: locked[0].responsible_waiter_id, branchId: order.branchId, status: 'open' }, select: { id: true } })
      if (responsibleShift) throw new OrderError('The responsible waiter is still available; use normal responsibility handover', 409)
    }
    const requested = new Map<string, number>()
    for (const item of parsed.data.items) {
      if (requested.has(item.orderItemId)) throw new OrderError('An item may only be served once per request', 400)
      requested.set(item.orderItemId, item.quantity)
    }
    const lines = await tx.orderItem.findMany({ where: { orderId, isVoided: false }, select: { id: true, quantity: true, servedQuantity: true, preparedQuantity: true } })
    for (const [id, quantity] of requested) {
      const line = lines.find((candidate) => candidate.id.toString() === id)
      if (!line || quantity > line.quantity - line.servedQuantity || quantity > line.preparedQuantity - line.servedQuantity) throw new OrderError('Requested serving quantity is not ready', 409)
      try { await serveOrderItemInventory(tx, orderId, line.id, quantity, session.id) }
      catch (error) { if (error instanceof StockError) throw new OrderError(error.message, error.status); throw error }
    }
    const refreshed = await tx.orderItem.findMany({ where: { orderId, isVoided: false }, select: { quantity: true, servedQuantity: true } })
    const complete = refreshed.every((line) => line.servedQuantity >= line.quantity)
    if (complete) {
      await tx.order.update({ where: { id: orderId }, data: { status: 'served', servedAt: new Date() } })
      await tx.orderStatusHistory.create({ data: { orderId, fromStatus: locked[0].status, toStatus: 'served', changedById: session.id } })
      await emitStatusNotifications(tx, { to: 'served', orderId, branchId: order.branchId, orderNumber: order.orderNumber })
    }
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: emergency ? 'order.items_emergency_served' : 'order.items_served', entityType: 'order', entityId: orderId, newValues: { items: parsed.data.items, orderComplete: complete, responsibleWaiterId: locked[0].responsible_waiter_id, interventionReason: parsed.data.interventionReason ?? null, interventionAt: emergency ? new Date().toISOString() : null } } })
    const result: ServeResult = { id: orderId.toString(), served: parsed.data.items, orderComplete: complete, status: complete ? 'served' : locked[0].status }
    await tx.financialOperation.create({ data: { ...operationWhere.branchId_actorId_operationType_idempotencyKey, fingerprint, result } })
    return result
  })
}

/**
 * Waiter pushes a `new` order to the kitchen ("إرسال للمطبخ").
 *
 * This is DISTINCT from the new→preparing transition (which the KITCHEN owns).
 * Sending only flips `sentToKitchenAt` and rings the kitchen bell; the order
 * stays `new` until a cook accepts it as `preparing`. Branch-scoped to the
 * caller; the timestamp is stamped atomically with the notification so the
 * kitchen board and the bell can never disagree.
 */
export async function sendOrderToKitchen(session: StaffSession, orderId: string) {
  if (session.role !== ROLE.WAITER && session.role !== ROLE.CASHIER) throw new OrderError('Waiter or cashier role required', 403)
  if (!/^\d+$/.test(orderId)) throw new OrderError('الطلب غير موجود', 404)

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderId) },
    select: { id: true, branchId: true, status: true, paymentStatus: true, orderType: true, orderNumber: true, sentToKitchenAt: true, source: true, responsibleWaiterId: true, qrApprovedAt: true },
  })
  if (!order) throw new OrderError('الطلب غير موجود', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new OrderError('غير مصرح', 403)
  if (session.role === ROLE.WAITER && order.responsibleWaiterId !== session.id) throw new OrderError('Only the responsible waiter may dispatch this order', 403)
  if (order.source === 'qr' && !order.qrApprovedAt) throw new OrderError('QR orders must be claimed and approved before dispatch', 409)
  if (order.status !== 'new') throw new OrderError('لا يمكن إرسال طلب ليس في حالة "جديد" للمطبخ', 409)
  if (takeawayDispatchBlocker(order.orderType, order.paymentStatus)) throw new OrderError('يجب تحصيل طلب التيك أواي بالكامل قبل إرساله للمطبخ', 409)
  if (order.sentToKitchenAt) return { id: order.id.toString(), orderNumber: order.orderNumber, sent: true }

  // The waiter must have an open shift for their branch.
  const activeShift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, order.branchId) : null
  if (requiresOperationalShift(session.role) && !activeShift) throw new OrderError('يلزم وجود وردية مفتوحة', 409)

  await prisma.$transaction(async (tx) => {
    if (activeShift) {
      const shift = await lockAndReadShift(tx, activeShift.id)
      if (!shift || shift.status !== 'open' || shift.cashierId !== session.id || shift.branchId !== order.branchId) throw new OrderError('الوردية لم تعد مفتوحة', 409)
    }
    const locked = await tx.$queryRaw<{ status: string; payment_status: string; order_type: string; sent_to_kitchen_at: Date | null }[]>`
      SELECT status, payment_status, order_type, sent_to_kitchen_at FROM orders WHERE id = ${order.id} FOR UPDATE
    `
    if (locked[0]?.status !== 'new') throw new OrderError('Order is no longer dispatchable', 409)
    if (locked[0]?.sent_to_kitchen_at) return
    if (locked[0]?.order_type === 'takeaway' && locked[0]?.payment_status !== 'paid') throw new OrderError('Takeaway payment is not complete', 409)
    try {
      await reserveOrderInventory(tx, order.id)
    } catch (error) {
      if (error instanceof StockError) throw new OrderError(error.message, error.status)
      throw error
    }
    await tx.order.update({ where: { id: order.id }, data: { sentToKitchenAt: new Date() } })
    await notifyRole(tx, ROLE.KITCHEN, order.branchId, {
      type: 'order.sent_to_kitchen',
      title: `طلب جديد للمطبخ: ${order.orderNumber}`,
      orderId: order.id,
    })
  })

  return { id: order.id.toString(), orderNumber: order.orderNumber, sent: true }
}

/**
 * Fan out the bell for a status transition to the role that acts next:
 *   preparing  → waiter   ("طلبك قيد التحضير")
 *   ready      → waiter   ("تم تحضير الطلب — جاهز للتقديم")
 *   served     → cashier  ("فاتورة قيد التحصيل")
 *   cancelled  → waiter + manager + kitchen (so the kitchen can drop it too)
 * The recipients always see it on their own board; the bell is a nudge, not the
 * source of truth. Best-effort inside the caller's tx — never throws.
 */
async function emitStatusNotifications(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: { to: OrderStatus; orderId: bigint; branchId: bigint; orderNumber: string },
): Promise<void> {
  const { to, orderId, branchId, orderNumber } = input
  const num = orderNumber
  const targets: { role: RoleSlug; type: NotificationType; title: string }[] = []
  if (to === 'preparing') targets.push({ role: ROLE.WAITER, type: 'order.preparing', title: `الطلب ${num} قيد التحضير` })
  if (to === 'ready') targets.push({ role: ROLE.WAITER, type: 'order.ready', title: `الطلب ${num} جاهز للتقديم` })
  if (to === 'served') targets.push({ role: ROLE.CASHIER, type: 'order.awaiting_payment', title: `الطلب ${num} بانتظار التحصيل` })
  if (to === 'cancelled') {
    targets.push({ role: ROLE.WAITER, type: 'order.cancelled', title: `الطلب ${num} أُلغي` })
    targets.push({ role: ROLE.MANAGER, type: 'order.cancelled', title: `الطلب ${num} أُلغي` })
    targets.push({ role: ROLE.KITCHEN, type: 'order.cancelled', title: `الطلب ${num} أُلغي` })
  }
  for (const t of targets) {
    await notifyRole(tx, t.role, branchId, { type: t.type, title: t.title, orderId })
  }
}
