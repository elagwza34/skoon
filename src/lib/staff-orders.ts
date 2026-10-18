import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, isOwner, type RoleSlug } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { notifyRole, type NotificationType } from '@/lib/notifications'
import { getOpenShift, ShiftError } from '@/lib/staff-shifts'
import { recalculateInvoiceTotals } from '@/lib/staff-invoices'

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

export const ORDER_FLOW = ['new', 'preparing', 'ready', 'served'] as const
export type OrderStatus = (typeof ORDER_FLOW)[number] | 'cancelled'

export function isOrderStatus(v: string): v is OrderStatus {
  return v === 'new' || v === 'preparing' || v === 'ready' || v === 'served' || v === 'cancelled'
}

/** Pure counterpart of the kitchen queue predicate, kept testable without a DB. */
export function isKitchenTicketVisible(status: string, sentToKitchen: boolean): boolean {
  return sentToKitchen && (status === 'new' || status === 'preparing' || status === 'ready')
}

/** Minimum role required to move `from → to`. Absent = transition is illegal. */
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, RoleSlug>>> = {
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
  total: number
  customerName: string | null
  source: string
  orderNotes: string | null
  tableNumber: string
  createdAt: string
  items: { id: string; productId: string; name: string; qty: number; unitPrice: number; note: string | null }[]
  itemsCount: number
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
      total: true,
      customerName: true,
      source: true, notes: true,
      createdAt: true,
      sentToKitchenAt: true,
      cancelReason: true,
      cafeTable: { select: { number: true } },
      items: {
        where: { isVoided: false },
        orderBy: { id: 'asc' },
        select: { id: true, productId: true, productName: true, quantity: true, unitPrice: true, notes: true },
      },
    },
  })

  return orders.map((o) => ({
    id: o.id.toString(),
    number: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    total: Number(o.total), orderNotes: o.notes,
    customerName: o.customerName,
    source: o.source,
    tableNumber: o.cafeTable.number,
    createdAt: o.createdAt.toISOString(),
    sentToKitchen: o.sentToKitchenAt != null,
    sentToKitchenAt: o.sentToKitchenAt?.toISOString() ?? null,
    cancelReason: o.cancelReason ?? null,
    items: o.items.map((i) => ({ id: i.id.toString(), productId: i.productId.toString(), name: i.productName, qty: i.quantity, unitPrice: Number(i.unitPrice), note: i.notes })),
    itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
  }))
}

/** Kitchen-only queue: a new ticket is actionable only after dispatch. */
export async function listKitchenOrders(session: StaffSession, limit = 100): Promise<StaffOrderRow[]> {
  const branchScope = session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }
  const orders = await prisma.order.findMany({
    where: {
      ...branchScope,
      sentToKitchenAt: { not: null },
      status: { in: ['new', 'preparing', 'ready'] },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    select: {
      id: true, orderNumber: true, status: true, paymentStatus: true, total: true, customerName: true,
      source: true, notes: true, createdAt: true, sentToKitchenAt: true, cancelReason: true,
      cafeTable: { select: { number: true } },
      items: { where: { isVoided: false }, orderBy: { id: 'asc' }, select: { id: true, productId: true, productName: true, quantity: true, unitPrice: true, notes: true } },
    },
  })
  return orders.map((o) => ({
    id: o.id.toString(), number: o.orderNumber, status: o.status, paymentStatus: o.paymentStatus,
    total: Number(o.total), customerName: o.customerName, source: o.source, orderNotes: o.notes, tableNumber: o.cafeTable.number,
    createdAt: o.createdAt.toISOString(), sentToKitchen: o.sentToKitchenAt != null,
    sentToKitchenAt: o.sentToKitchenAt?.toISOString() ?? null, cancelReason: o.cancelReason ?? null,
    items: o.items.map((i) => ({ id: i.id.toString(), productId: i.productId.toString(), name: i.productName, qty: i.quantity, unitPrice: Number(i.unitPrice), note: i.notes })),
    itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
  }))
}

const toStatusSchema = z.enum(['preparing', 'ready', 'served', 'cancelled'])
const cancelReasonSchema = z.string().trim().min(3).max(255).optional()
const waiterOrderEditSchema = z.object({
  items: z.array(z.object({ productId: z.string().regex(/^\d+$/), qty: z.number().int().min(1).max(20), note: z.string().trim().max(255).optional() })).min(1).max(30),
  notes: z.string().trim().max(2000).optional(),
})

/** Replace lines on an unsent waiter order. Prices and totals are always re-derived on the server. */
export async function editWaiterOrder(session: StaffSession, orderIdRaw: string, input: unknown) {
  if (!hasAtLeast(session.role, ROLE.WAITER)) throw new OrderError('Forbidden', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new OrderError('Order not found', 404)
  const parsed = waiterOrderEditSchema.safeParse(input)
  if (!parsed.success) throw new OrderError('Invalid order edit', 400)
  const orderId = BigInt(orderIdRaw)
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, branchId: true, createdById: true } })
  if (!order || !staffCanAccessBranch(session, order.branchId)) throw new OrderError('Order not found', 404)
  if (session.role === ROLE.WAITER && order.createdById !== session.id) throw new OrderError('Forbidden', 403)
  if (!isOwner(session.role)) {
    if (session.branchId === null || !await getOpenShift(session.id, order.branchId)) throw new OrderError('An open shift is required', 409)
  }

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string; sent_to_kitchen_at: Date | null; discount_type: string | null; discount_value: unknown; tax_rate: unknown }[]>`
      SELECT status, sent_to_kitchen_at, discount_type, discount_value, tax_rate FROM orders WHERE id = ${orderId} FOR UPDATE
    `
    const row = locked[0]
    if (!row || row.status !== 'new' || row.sent_to_kitchen_at) throw new OrderError('Only unsent new orders can be edited', 409)
    const productIds = [...new Set(parsed.data.items.map((item) => BigInt(item.productId)))]
    const products = await tx.product.findMany({ where: { id: { in: productIds }, branchId: order.branchId, isActive: true, isAvailable: true, deletedAt: null }, select: { id: true, name: true, price: true } })
    const byId = new Map(products.map((product) => [product.id.toString(), product]))
    if (byId.size !== productIds.length) throw new OrderError('A selected product is unavailable', 422)
    const lines = parsed.data.items.map((item) => {
      const product = byId.get(item.productId)!
      return { productId: product.id, productName: product.name, unitPrice: product.price, quantity: item.qty, lineTotal: (Number(product.price) * item.qty).toFixed(2), notes: item.note || null }
    })
    const subtotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0)
    const totals = recalculateInvoiceTotals(subtotal, row.discount_type, Number(row.discount_value), Number(row.tax_rate))
    await tx.orderItem.deleteMany({ where: { orderId } })
    await tx.orderItem.createMany({ data: lines.map((line) => ({ ...line, orderId })) })
    await tx.order.update({ where: { id: orderId }, data: { notes: parsed.data.notes || null, itemsSubtotal: subtotal.toFixed(2), discountAmount: totals.discount.toFixed(2), taxAmount: totals.tax.toFixed(2), total: totals.total.toFixed(2) } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: 'waiter.order_edit', entityType: 'order', entityId: orderId, newValues: { itemsCount: lines.reduce((sum, line) => sum + line.quantity, 0), total: totals.total, notes: parsed.data.notes || null } } })
    return { id: orderId.toString(), total: totals.total.toFixed(2), itemsCount: lines.reduce((sum, line) => sum + line.quantity, 0) }
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
  if (!/^\d+$/.test(orderId)) throw new OrderError('Order not found', 404)
  const parsed = toStatusSchema.safeParse(toRaw)
  if (!parsed.success) throw new OrderError('Invalid target status', 400)
  const to = parsed.data
  const reason = cancelReasonSchema.safeParse(reasonRaw)
  if (!reason.success) throw new OrderError('Invalid cancellation reason', 400)
  if (to === 'cancelled' && !reason.data) throw new OrderError('A cancellation reason is required', 400)

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderId) },
    select: { id: true, branchId: true, status: true, paymentStatus: true, orderNumber: true },
  })
  if (!order) throw new OrderError('Order not found', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new OrderError('Forbidden', 403)

  // The acting employee must have an open shift for their branch.
  if (!isOwner(session.role)) {
  if (session.branchId === null) throw new OrderError('غير مصرح — لا فرع مرتبط بالمستخدم', 403)
  const activeShift = await getOpenShift(session.id, BigInt(session.branchId))
  if (!activeShift) throw new OrderError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)
  }

  const current = order.status as OrderStatus
  const minRole = TRANSITIONS[current]?.[to]
  if (!minRole) throw new OrderError(`لا يمكن نقل الطلب من "${current}" إلى "${to}"`, 409)
  if (!hasAtLeast(session.role, minRole)) throw new OrderError('Forbidden', 403)
  if (to === 'cancelled' && order.paymentStatus === 'paid') throw new OrderError('A paid order must be refunded through the payment correction flow', 409)

  await prisma.$transaction(async (tx) => {
    const lockedRows = await tx.$queryRaw<{ status: string; payment_status: string }[]>`
      SELECT status, payment_status FROM orders WHERE id = ${order.id} FOR UPDATE
    `
    const locked = lockedRows[0]
    if (!locked || locked.status !== current) throw new OrderError('Order status changed; refresh and retry', 409)
    if (to === 'cancelled' && locked.payment_status === 'paid') throw new OrderError('A paid order must be refunded through the payment correction flow', 409)
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
 * Waiter pushes a `new` order to the kitchen ("إرسال للمطبخ").
 *
 * This is DISTINCT from the new→preparing transition (which the KITCHEN owns).
 * Sending only flips `sentToKitchenAt` and rings the kitchen bell; the order
 * stays `new` until a cook accepts it as `preparing`. Branch-scoped to the
 * caller; the timestamp is stamped atomically with the notification so the
 * kitchen board and the bell can never disagree.
 */
export async function sendOrderToKitchen(session: StaffSession, orderId: string) {
  if (!hasAtLeast(session.role, ROLE.WAITER)) throw new OrderError('Forbidden', 403)
  if (!/^\d+$/.test(orderId)) throw new OrderError('الطلب غير موجود', 404)

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderId) },
    select: { id: true, branchId: true, status: true, orderNumber: true, sentToKitchenAt: true },
  })
  if (!order) throw new OrderError('الطلب غير موجود', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new OrderError('غير مصرح', 403)
  if (order.status !== 'new') throw new OrderError('لا يمكن إرسال طلب ليس في حالة "جديد" للمطبخ', 409)
  if (order.sentToKitchenAt) throw new OrderError('تم إرسال الطلب للمطبخ مسبقاً', 409)

  // The waiter must have an open shift for their branch.
  if (!isOwner(session.role)) {
  if (session.branchId === null) throw new OrderError('غير مصرح — لا فرع مرتبط بالمستخدم', 403)
  const activeShift = await getOpenShift(session.id, BigInt(session.branchId))
  if (!activeShift) throw new OrderError('لا توجد وردية مفتوحة لهذا الويتر — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)
  }

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: string; sent_to_kitchen_at: Date | null }[]>`
      SELECT status, sent_to_kitchen_at FROM orders WHERE id = ${order.id} FOR UPDATE
    `
    if (locked[0]?.status !== 'new') throw new OrderError('Order is no longer dispatchable', 409)
    if (locked[0]?.sent_to_kitchen_at) throw new OrderError('Order was already sent to kitchen', 409)
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
