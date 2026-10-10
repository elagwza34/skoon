import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, type RoleSlug } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'

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

/** Minimum role required to move `from → to`. Absent = transition is illegal. */
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, RoleSlug>>> = {
  new: { preparing: ROLE.KITCHEN, cancelled: ROLE.CASHIER },
  preparing: { ready: ROLE.KITCHEN, cancelled: ROLE.CASHIER },
  ready: { served: ROLE.WAITER },
  served: {},
  cancelled: {},
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
  total: number
  customerName: string | null
  source: string
  tableNumber: string
  createdAt: string
  items: { name: string; qty: number; note: string | null }[]
  itemsCount: number
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
      total: true,
      customerName: true,
      source: true,
      createdAt: true,
      cafeTable: { select: { number: true } },
      items: {
        where: { isVoided: false },
        orderBy: { id: 'asc' },
        select: { productName: true, quantity: true, notes: true },
      },
    },
  })

  return orders.map((o) => ({
    id: o.id.toString(),
    number: o.orderNumber,
    status: o.status,
    total: Number(o.total),
    customerName: o.customerName,
    source: o.source,
    tableNumber: o.cafeTable.number,
    createdAt: o.createdAt.toISOString(),
    items: o.items.map((i) => ({ name: i.productName, qty: i.quantity, note: i.notes })),
    itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
  }))
}

const toStatusSchema = z.enum(['preparing', 'ready', 'served', 'cancelled'])

/**
 * Move an order to `to`, enforcing branch scope, legal transition, and role
 * authority, and recording the change in `order_status_history` atomically.
 */
export async function transitionOrderStatus(
  session: StaffSession,
  orderId: string,
  toRaw: string,
) {
  if (!/^\d+$/.test(orderId)) throw new OrderError('Order not found', 404)
  const parsed = toStatusSchema.safeParse(toRaw)
  if (!parsed.success) throw new OrderError('Invalid target status', 400)
  const to = parsed.data

  const order = await prisma.order.findUnique({
    where: { id: BigInt(orderId) },
    select: { id: true, branchId: true, status: true, orderNumber: true },
  })
  if (!order) throw new OrderError('Order not found', 404)
  if (!staffCanAccessBranch(session, order.branchId)) throw new OrderError('Forbidden', 403)

  const current = order.status as OrderStatus
  const minRole = TRANSITIONS[current]?.[to]
  if (!minRole) throw new OrderError(`لا يمكن نقل الطلب من "${current}" إلى "${to}"`, 409)
  if (!hasAtLeast(session.role, minRole)) throw new OrderError('Forbidden', 403)

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: to,
        ...(to === 'preparing' ? { acceptedAt: new Date() } : {}),
        ...(to === 'ready' ? { readyAt: new Date() } : {}),
        ...(to === 'served' ? { servedAt: new Date() } : {}),
        ...(to === 'cancelled' ? { cancelledAt: new Date() } : {}),
      },
    })
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: current, toStatus: to, changedById: session.id },
    })
  })

  return { id: order.id.toString(), orderNumber: order.orderNumber, status: to }
}
