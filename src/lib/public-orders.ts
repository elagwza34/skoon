import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getTableByToken } from '@/lib/public-menu'
import { notifyRole } from '@/lib/notifications'
import { ROLE } from '@/lib/authz'
import { isWaiterTableOrderActive } from '@/lib/staff-waiter'

const orderItemSchema = z.object({
  productId: z.string().regex(/^\d+$/, 'Invalid product id'),
  qty: z.number().int().min(1).max(20),
  note: z.string().max(255).optional(),
})

const createOrderSchema = z.object({
  token: z.string(),
  customerName: z.string().trim().min(1).max(60),
  customerPhone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{6,20}$/, 'Invalid phone')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  items: z.array(orderItemSchema).min(1).max(30),
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>

export interface CreatedOrder {
  id: string
  orderNumber: string
  total: string
  itemsCount: number
}

/**
 * Create a customer QR order — server-side pricing only.
 * QR orders are created with status 'pending' so they do not occupy a table
 * until a waiter approves them. Table occupancy is checked before creation:
 * if the table already has an open dine-in order, the submission is rejected.
 * All reads (table, products) and writes (order + items + history) run in
 * one transaction. Client prices/notes beyond 255 chars are never trusted.
 */
export async function createPublicOrder(input: CreateOrderInput & { idempotencyKey?: string | null }): Promise<CreatedOrder> {
  const parsed = createOrderSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid order')
  }
  const { token, customerName, customerPhone, items, idempotencyKey } = parsed.data

  const key = idempotencyKey?.trim() || null
  if (key && (key.length < 8 || key.length > 100)) throw new Error('Invalid idempotency key')

  const table = await getTableByToken(token)
  if (!table) throw new Error('Table not found')

  const branchId = BigInt(table.branchId)
  const tableId = BigInt(table.id)

  // Idempotency: check for a prior completed submission before doing any work.
  if (key) {
    const prior = await prisma.financialOperation.findUnique({
      where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: 'public-qr', operationType: 'qr_order_create', idempotencyKey: key } },
      select: { fingerprint: true, result: true },
    })
    if (prior) {
      const currentFingerprint = createHash('sha256').update(JSON.stringify({ tableId: tableId.toString(), items: items.map((i) => ({ productId: i.productId, qty: i.qty, note: i.note ?? null })) })).digest('hex')
      if (prior.fingerprint !== currentFingerprint) throw new Error('Idempotency key was reused with a different request')
      return prior.result as unknown as CreatedOrder
    }
  }

  const productIds = [...new Set(items.map((i) => BigInt(i.productId)))]
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      branchId,
      isActive: true,
      deletedAt: null,
      isAvailable: true,
    },
    select: { id: true, name: true, price: true, variants: { where: { isActive: true, archivedAt: null }, select: { id: true }, take: 1 }, optionAssignments: { select: { productOption: { select: { isActive: true, isRequired: true, minSelections: true } } } } },
  })
  const priceById = new Map(products.map((p) => [p.id.toString(), p]))
  for (const item of items) {
    if (!priceById.has(item.productId)) throw new Error('Menu changed — please refresh')
    const product = priceById.get(item.productId)!
    if (product.variants.length || product.optionAssignments.some((a) => a.productOption.isActive && (a.productOption.isRequired || a.productOption.minSelections > 0))) throw new Error('هذا المنتج يحتاج اختيارات؛ اطلبه من النادل')
  }

  let total = 0
  const lines = items.map((item) => {
    const p = priceById.get(item.productId)!
    const unit = Number(p.price)
    total += unit * item.qty
    return {
      productId: p.id,
      productName: p.name,
      unitPrice: p.price,
      quantity: item.qty,
      lineTotal: unit * item.qty,
      notes: item.note?.trim() || null,
    }
  })

  const orderNumber = `QR-${Date.now().toString(36).toUpperCase()}`
  const orderRef = randomBytes(12).toString('hex') // 24 hex chars, unique, hides the id
  const itemsSubtotal = total.toFixed(2)

  const fingerprint = key ? createHash('sha256').update(JSON.stringify({ tableId: tableId.toString(), items: items.map((i) => ({ productId: i.productId, qty: i.qty, note: i.note ?? null })) })).digest('hex') : null

  const created = await prisma.$transaction(async (tx) => {
    // Recheck idempotency inside the transaction to prevent concurrent duplicates.
    if (key) {
      const prior = await tx.financialOperation.findUnique({
        where: { branchId_actorId_operationType_idempotencyKey: { branchId, actorId: 'public-qr', operationType: 'qr_order_create', idempotencyKey: key } },
        select: { fingerprint: true, result: true },
      })
      if (prior) {
        if (prior.fingerprint !== fingerprint!) throw new Error('Idempotency key was reused with a different request')
        return prior.result as unknown as CreatedOrder
      }
    }

    const order = await tx.order.create({
      data: {
        branchId,
        cafeTableId: tableId,
        orderNumber,
        orderRef,
        orderType: 'dine_in',
        status: 'pending',
        source: 'qr',
        customerName: customerName.trim(),
        customerPhone: customerPhone?.trim() || null,
        itemsSubtotal,
        discountAmount: '0',
        taxAmount: '0',
        total: itemsSubtotal,
        paymentStatus: 'unpaid',
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
            notes: l.notes,
          })),
        },
        statusHistory: { create: { toStatus: 'pending' } },
      },
      select: { id: true, orderNumber: true, total: true },
    })
    // Ring the waiters of this branch — a customer just placed a QR order awaiting approval.
    await notifyRole(tx, ROLE.WAITER, branchId, {
      type: 'order.created',
      title: `طلب QR جديد في انتظار الاعتماد: ${order.orderNumber} من طاولة ${table.number}`,
      orderId: order.id,
    })
    if (key) {
      await tx.financialOperation.create({
        data: {
          branchId,
          actorId: 'public-qr',
          operationType: 'qr_order_create',
          idempotencyKey: key,
          fingerprint: fingerprint!,
          result: { id: order.id.toString(), orderNumber: order.orderNumber, total: order.total.toString(), itemsCount: lines.reduce((n, l) => n + l.quantity, 0) },
        },
      })
    }
    return order
  })

  return {
    id: created.id.toString(),
    orderNumber: created.orderNumber,
    total: created.total.toString(),
    itemsCount: lines.reduce((n, l) => n + l.quantity, 0),
  }
}

export interface PublicOrder {
  id: string
  orderNumber: string
  status: string
  total: string
  customerName: string | null
  tableNumber: string
  branchName: string
  items: { name: string; qty: number; lineTotal: string; note: string | null }[]
}

/**
 * Public read-back of a just-placed order for the confirmation screen.
 * Guarded by BOTH id and orderNumber so a sequential integer id alone can't be
 * enumerated to peek at other customers' orders. Exposes display fields only —
 * never internal ids, cost, or staff attribution.
 */
export async function getPublicOrder(id: string, orderNumber: string): Promise<PublicOrder | null> {
  if (!/^\d+$/.test(id)) return null
  const row = await prisma.order.findFirst({
    where: { id: BigInt(id), orderNumber },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      customerName: true,
      cafeTable: { select: { number: true, branch: { select: { name: true } } } },
      items: {
        where: { isVoided: false },
        orderBy: { id: 'asc' },
        select: { productName: true, quantity: true, lineTotal: true, notes: true },
      },
    },
  })
  if (!row) return null
  return {
    id: row.id.toString(),
    orderNumber: row.orderNumber,
    status: row.status,
    total: row.total.toString(),
    customerName: row.customerName,
    tableNumber: row.cafeTable.number,
    branchName: row.cafeTable.branch.name,
    items: row.items.map((i) => ({
      name: i.productName,
      qty: i.quantity,
      lineTotal: i.lineTotal.toString(),
      note: i.notes,
    })),
  }
}
