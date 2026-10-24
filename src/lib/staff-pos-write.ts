import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { ROLE, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { PosError, posOrderSchema } from '@/lib/staff-pos'
import { notifyRole } from '@/lib/notifications'
import { getOpenShift } from '@/lib/staff-shifts'

export type PosOrderResult = { id: string; orderNumber: string; total: string; itemsCount: number }

/**
 * Staff POS order creation — server-side pricing, one transaction.
 * Cashier+ and waiter (own branch). Kitchen is forbidden.
 */
export async function createPosOrder(session: StaffSession, input: unknown, idempotencyKey?: string | null) {
  if (session.role === ROLE.KITCHEN) throw new PosError('Forbidden', 403)
  const parsed = posOrderSchema.safeParse(input)
  if (!parsed.success) throw new PosError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)

  const branchId =
    session.role === ROLE.OWNER
      ? await resolveOwnerBranch(session, parsed.data.tableId)
      : BigInt(session.branchId as string)
  const key = idempotencyKey?.trim() || null
  if (key && (key.length < 8 || key.length > 100)) throw new PosError('Invalid idempotency key', 400)

  // Operational roles need a reconcilable shift. Supervisors may act without
  // one; their authorized order is deliberately not attributed to a till.
  const openShift = requiresOperationalShift(session.role) ? await getOpenShift(session.id, branchId) : null
  if (requiresOperationalShift(session.role) && !openShift) {
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

  const fingerprint = createHash('sha256').update(JSON.stringify({
    branchId: branchId.toString(), tableId: tableId.toString(), customerName: parsed.data.customerName?.trim() || null,
    items: parsed.data.items.map((item) => ({ productId: item.productId, qty: item.qty, note: item.note?.trim() || null })),
  })).digest('hex')
  // A completed retry remains retrievable even if a product was later disabled.
  if (key) {
    const prior = await prisma.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType: 'pos_order_create', idempotencyKey: key } } })
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new PosError('Idempotency key was reused with a different request', 409)
      return prior.result as unknown as PosOrderResult
    }
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
    // The lock makes the read/check/create sequence safe when a client retries
    // the same submission concurrently. The durable record commits with the order.
    if (key) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pos-order:' || ${branchId.toString()} || ':' || ${session.id} || ':' || ${key}))`
      const prior = await tx.financialOperation.findUnique({ where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: session.id, operationType: 'pos_order_create', idempotencyKey: key } } })
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new PosError('Idempotency key was reused with a different request', 409)
        return prior.result as unknown as PosOrderResult
      }
    }
    const order = await tx.order.create({
      data: {
        branchId, cafeTableId: tableId,
        orderNumber, orderRef, orderType: 'dine_in', status: 'new', source: session.role === ROLE.WAITER ? 'waiter' : 'pos',
        customerName: parsed.data.customerName?.trim() || null,
        createdById: session.id,
        // A waiter-created ticket is immediately their responsibility. The
        // immutable creator remains separate for audit and historical reports.
        responsibleWaiterId: session.role === ROLE.WAITER ? session.id : null,
        shiftId: openShift?.id ?? null,
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
    if (session.role === ROLE.WAITER) {
      await tx.orderResponsibilityHistory.create({
        data: { orderId: order.id, branchId, assignedToId: session.id, assignedById: session.id, source: 'manual_create', reason: 'Manual waiter order creation' },
      })
    }
    // Ring the branch's waiters — a new POS order needs their attention (or, if
    // the waiter placed it themselves, it still shows on their own board).
    await notifyRole(tx, ROLE.WAITER, branchId, {
      type: 'order.created',
      title: `طلب جديد ${order.orderNumber}`,
      orderId: order.id,
    })
    const result = {
      id: order.id.toString(), orderNumber: order.orderNumber,
      total: order.total.toString(), itemsCount: lines.reduce((n, l) => n + l.quantity, 0),
    }
    if (key) await tx.financialOperation.create({ data: { branchId, actorId: session.id, operationType: 'pos_order_create', idempotencyKey: key, fingerprint, result } })
    await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'pos.order_create', entityType: 'order', entityId: order.id, newValues: { orderNumber: order.orderNumber, total: order.total.toString(), itemsCount: result.itemsCount } } })
    return result
  })

  return created
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
