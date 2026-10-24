import { prisma } from '@/lib/prisma'
import { ROLE, requiresOperationalShift } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import type { StaffOrderRow } from '@/lib/staff-orders'
import { getOpenShift, ShiftError } from '@/lib/staff-shifts'

/**
 * Waiter workspace — branch tables + open orders + POS catalog.
 * All real DB. Server-only.
 * Requires the waiter to have an open shift for their branch.
 */
export type WaiterOrderRow = StaffOrderRow & {
  /** Current operational owner; distinct from immutable order.createdById. */
  responsibleWaiterId: string | null
  responsibleWaiterName: string | null
}

export interface IncomingWaiterHandover {
  id: string
  senderName: string
  requestedAt: string
  notes: string | null
  outstandingOrders: { id: string; number: string; tableNumber: string; status: string }[]
}

export interface WaiterWorkspace {
  currentUserId: string
  branchName: string
  employeeName: string
  shift: { id: string; openedAt: string } | null
  tables: { id: string; number: string; name: string | null; capacity: number; openOrders: number }[]
  openOrders: WaiterOrderRow[]
  categories: { id: string; name: string }[]
  products: { id: string; name: string; price: string; categoryId: string; isAvailable: boolean }[]
  incomingHandovers: IncomingWaiterHandover[]
}

/** Only active, non-terminal orders occupy a table in the waiter workspace. */
export function isWaiterTableOrderActive(status: string): boolean {
  return status === 'new' || status === 'preparing' || status === 'ready'
}

export async function getWaiterWorkspace(session: StaffSession): Promise<WaiterWorkspace> {
  // Waiter must have an open shift before performing waiter duties.
  if (session.branchId === null) throw new ShiftError('غير مصرح — لا فرع مرتبط بالمستخدم', 403)
  const shift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, BigInt(session.branchId)) : null
  if (requiresOperationalShift(session.role) && !shift) throw new ShiftError('لا توجد وردية مفتوحة لهذا الويتر — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)

  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [branch, tables, orders, categories, products, incomingHandovers] = await Promise.all([
    prisma.cafeBranch.findUnique({ where: { id: BigInt(session.branchId) }, select: { name: true } }),
    prisma.cafeTable.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, name: true, capacity: true },
    }),
    prisma.order.findMany({
      where: { ...branchScope, status: { in: ['new', 'preparing', 'ready', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, orderNumber: true, status: true, paymentStatus: true, total: true, customerName: true,
        source: true, notes: true, createdAt: true, sentToKitchenAt: true, cancelReason: true, responsibleWaiterId: true,
        responsibleWaiter: { select: { name: true } },
        cafeTable: { select: { number: true } },
        items: {
          where: { isVoided: false }, orderBy: { id: 'asc' },
          select: { id: true, productId: true, productName: true, quantity: true, servedQuantity: true, preparedQuantity: true, preparationStartedAt: true, unitPrice: true, notes: true },
        },
      },
    }),
    prisma.category.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, price: true, categoryId: true, isAvailable: true },
    }),
    prisma.waiterShiftHandover.findMany({
      where: { recipientWaiterId: session.id, branchId: BigInt(session.branchId), status: 'pending' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, requestedById: true, createdAt: true, notes: true, requestedBy: { select: { name: true } } },
    }),
  ])

  const openByTable = new Map<string, number>()
  for (const o of orders) {
    if (!isWaiterTableOrderActive(o.status)) continue
    const key = o.cafeTable.number
    openByTable.set(key, (openByTable.get(key) ?? 0) + 1)
  }

  return {
    currentUserId: session.id,
    branchName: branch?.name ?? '—',
    employeeName: session.name,
    shift: shift ? { id: shift.id.toString(), openedAt: shift.openedAt.toISOString() } : null,
    tables: tables.map((t) => ({
      id: t.id.toString(), number: t.number, name: t.name, capacity: t.capacity,
      openOrders: openByTable.get(t.number) ?? 0,
    })),
    openOrders: orders.map((o) => ({
      id: o.id.toString(), number: o.orderNumber, status: o.status,
      paymentStatus: o.paymentStatus,
      total: Number(o.total), customerName: o.customerName, source: o.source, orderNotes: o.notes,
      tableNumber: o.cafeTable.number, createdAt: o.createdAt.toISOString(),
      sentToKitchen: o.sentToKitchenAt != null,
      sentToKitchenAt: o.sentToKitchenAt?.toISOString() ?? null,
      cancelReason: o.cancelReason ?? null,
      responsibleWaiterId: o.responsibleWaiterId,
      responsibleWaiterName: o.responsibleWaiter?.name ?? null,
      items: o.items.map((i) => ({ id: i.id.toString(), productId: i.productId.toString(), name: i.productName, qty: i.quantity, servedQty: i.servedQuantity, preparedQty: i.preparedQuantity, preparationStartedAt: i.preparationStartedAt?.toISOString() ?? null, unitPrice: Number(i.unitPrice), note: i.notes })),
      itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
    })),
    categories: categories.map((c) => ({ id: c.id.toString(), name: c.name })),
    products: products.map((p) => ({
      id: p.id.toString(), name: p.name, price: p.price.toString(),
      categoryId: p.categoryId.toString(), isAvailable: p.isAvailable,
    })),
    incomingHandovers: incomingHandovers.map((handover) => ({
      id: handover.id.toString(), senderName: handover.requestedBy.name,
      requestedAt: handover.createdAt.toISOString(), notes: handover.notes,
      outstandingOrders: orders.filter((order) => order.responsibleWaiterId === handover.requestedById && isWaiterTableOrderActive(order.status)).map((order) => ({
        id: order.id.toString(), number: order.orderNumber, tableNumber: order.cafeTable.number, status: order.status,
      })),
    })),
  }
}
