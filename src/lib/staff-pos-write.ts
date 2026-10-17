import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { PosError, posOrderSchema } from '@/lib/staff-pos'
import { notifyRole } from '@/lib/notifications'
import { getOpenShift } from '@/lib/staff-shifts'

/**
 * Staff POS order creation — server-side pricing, one transaction.
 * Cashier+ and waiter (own branch). Kitchen is forbidden.
 */
export async function createPosOrder(session: StaffSession, input: unknown) {
  if (session.role === ROLE.KITCHEN) throw new PosError('Forbidden', 403)
  const parsed = posOrderSchema.safeParse(input)
  if (!parsed.success) throw new PosError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)

  const branchId =
    session.role === ROLE.OWNER
      ? await resolveOwnerBranch(session, parsed.data.tableId)
      : BigInt(session.branchId as string)

  // Till discipline: a POS order may only be created inside an open shift,
  // so every order/payment of this branch belongs to a reconcilable session.
  const openShift = await getOpenShift(session.id, branchId)
  if (!openShift) {
    throw new PosError('لا توجد وردية مفتوحة لهذا الموظف — افتح وردية أولًا من صفحة الورديات (/shifts)', 409)
  }

  let tableId: bigint
  if (parsed.data.tableId) {
    const table = await prisma.cafeTable.findFirst({
      where: { id: BigInt(parsed.data.tableId), branchId, isActive: true, deletedAt: null },
      select: { id: true },
    })
    if (!table) throw new PosError('الطاولة غير موجودة في هذا الفرع', 404)
    tableId = table.id
  } else if (session.role !== ROLE.OWNER) {
    const firstTable = await prisma.cafeTable.findFirst({
      where: { branchId, isActive: true, deletedAt: null },
      orderBy: { number: 'asc' },
      select: { id: true },
    })
    if (!firstTable) throw new PosError('لا توجد طاولات نشطة في الفرع', 400)
    tableId = firstTable.id
  } else {
    throw new PosError('اختر الطاولة', 400)
  }

  const productIds = [...new Set(parsed.data.items.map((i) => BigInt(i.productId)))]
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, branchId, isActive: true, deletedAt: null, isAvailable: true },
    select: { id: true, name: true, price: true },
  })
  const priceById = new Map(products.map((p) => [p.id.toString(), p]))
  for (const item of parsed.data.items) {
    if (!priceById.has(item.productId)) throw new PosError('تغيّرت القائمة — حدّث الصفحة', 400)
  }

  let total = 0
  const lines = parsed.data.items.map((item) => {
    const p = priceById.get(item.productId)!
    const unit = Number(p.price)
    total += unit * item.qty
    return {
      productId: p.id, productName: p.name, unitPrice: p.price,
      quantity: item.qty, lineTotal: unit * item.qty,
      notes: item.note?.trim() || null,
    }
  })

  const orderNumber = `POS-${Date.now().toString(36).toUpperCase()}`
  const orderRef = randomBytes(12).toString('hex')
  const subtotal = total.toFixed(2)

  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        branchId, cafeTableId: tableId,
        orderNumber, orderRef, orderType: 'dine_in', status: 'new', source: 'pos',
        customerName: parsed.data.customerName?.trim() || null,
        createdById: session.id,
        shiftId: openShift.id,
        itemsSubtotal: subtotal, discountAmount: '0', taxAmount: '0',
        total: subtotal, paymentStatus: 'unpaid',
        items: {
          create: lines.map((l) => ({
            productId: l.productId, productName: l.productName,
            unitPrice: l.unitPrice, quantity: l.quantity,
            lineTotal: l.lineTotal, notes: l.notes,
          })),
        },
        statusHistory: { create: { toStatus: 'new', changedById: session.id } },
      },
      select: { id: true, orderNumber: true, total: true },
    })
    // Ring the branch's waiters — a new POS order needs their attention (or, if
    // the waiter placed it themselves, it still shows on their own board).
    await notifyRole(tx, ROLE.WAITER, branchId, {
      type: 'order.created',
      title: `طلب جديد ${order.orderNumber}`,
      orderId: order.id,
    })
    return order
  })

  return {
    id: created.id.toString(), orderNumber: created.orderNumber,
    total: created.total.toString(),
    itemsCount: lines.reduce((n, l) => n + l.quantity, 0),
  }
}

async function resolveOwnerBranch(session: StaffSession, tableIdRaw?: string): Promise<bigint> {
  if (tableIdRaw) {
    const table = await prisma.cafeTable.findUnique({
      where: { id: BigInt(tableIdRaw) }, select: { branchId: true },
    })
    if (!table) throw new PosError('الطاولة غير موجودة', 404)
    if (!staffCanAccessBranch(session, table.branchId)) throw new PosError('Forbidden', 403)
    return table.branchId
  }
  const first = await prisma.cafeTable.findFirst({
    where: { isActive: true, deletedAt: null }, orderBy: { id: 'asc' }, select: { branchId: true },
  })
  if (!first) throw new PosError('لا توجد طاولات نشطة', 400)
  return first.branchId
}
