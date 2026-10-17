import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import type { StaffOrderRow } from '@/lib/staff-orders'
import { getOpenShift, ShiftError } from '@/lib/staff-shifts'

/**
 * Waiter workspace — branch tables + open orders + POS catalog.
 * All real DB. Server-only.
 * Requires the waiter to have an open shift for their branch.
 */
export interface WaiterWorkspace {
  tables: { id: string; number: string; name: string | null; capacity: number; openOrders: number }[]
  openOrders: StaffOrderRow[]
  categories: { id: string; name: string }[]
  products: { id: string; name: string; price: string; categoryId: string; isAvailable: boolean }[]
}

export async function getWaiterWorkspace(session: StaffSession): Promise<WaiterWorkspace> {
  // Waiter must have an open shift before performing waiter duties.
  if (session.branchId === null) throw new ShiftError('غير مصرح — لا فرع مرتبط بالمستخدم', 403)
  const shift = await getOpenShift(session.id, BigInt(session.branchId))
  if (!shift) throw new ShiftError('لا توجد وردية مفتوحة لهذا الويتر — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)

  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [tables, orders, categories, products] = await Promise.all([
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
        source: true, createdAt: true, sentToKitchenAt: true, cancelReason: true,
        cafeTable: { select: { number: true } },
        items: {
          where: { isVoided: false }, orderBy: { id: 'asc' },
          select: { productName: true, quantity: true, notes: true },
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
  ])

  const openByTable = new Map<string, number>()
  for (const o of orders) {
    const key = o.cafeTable.number
    openByTable.set(key, (openByTable.get(key) ?? 0) + 1)
  }

  return {
    tables: tables.map((t) => ({
      id: t.id.toString(), number: t.number, name: t.name, capacity: t.capacity,
      openOrders: openByTable.get(t.number) ?? 0,
    })),
    openOrders: orders.map((o) => ({
      id: o.id.toString(), number: o.orderNumber, status: o.status,
      paymentStatus: o.paymentStatus,
      total: Number(o.total), customerName: o.customerName, source: o.source,
      tableNumber: o.cafeTable.number, createdAt: o.createdAt.toISOString(),
      sentToKitchen: o.sentToKitchenAt != null,
      sentToKitchenAt: o.sentToKitchenAt?.toISOString() ?? null,
      cancelReason: o.cancelReason ?? null,
      items: o.items.map((i) => ({ name: i.productName, qty: i.quantity, note: i.notes })),
      itemsCount: o.items.reduce((n, i) => n + i.quantity, 0),
    })),
    categories: categories.map((c) => ({ id: c.id.toString(), name: c.name })),
    products: products.map((p) => ({
      id: p.id.toString(), name: p.name, price: p.price.toString(),
      categoryId: p.categoryId.toString(), isAvailable: p.isAvailable,
    })),
  }
}
