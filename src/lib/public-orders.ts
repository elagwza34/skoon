import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getTableByToken } from '@/lib/public-menu'

const orderItemSchema = z.object({
  productId: z.string().regex(/^\d+$/, 'Invalid product id'),
  qty: z.number().int().min(1).max(20),
  note: z.string().max(255).optional(),
})

const createOrderSchema = z.object({
  token: z.string(),
  customerName: z.string().trim().min(1).max(60),
  items: z.array(orderItemSchema).min(1).max(30),
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
 * All reads (table, products) and writes (order + items + history) run in
 * one transaction. Client prices/notes beyond 255 chars are never trusted.
 */
export async function createPublicOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const parsed = createOrderSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid order')
  }
  const { token, customerName, items } = parsed.data

  const table = await getTableByToken(token)
  if (!table) throw new Error('Table not found')

  const productIds = [...new Set(items.map((i) => BigInt(i.productId)))]
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      branchId: BigInt(table.branchId),
      isActive: true,
      deletedAt: null,
      isAvailable: true,
    },
    select: { id: true, name: true, price: true },
  })
  const priceById = new Map(products.map((p) => [p.id.toString(), p]))
  for (const item of items) {
    if (!priceById.has(item.productId)) throw new Error('Menu changed — please refresh')
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

  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        branchId: BigInt(table.branchId),
        cafeTableId: BigInt(table.id),
        orderNumber,
        orderRef,
        orderType: 'dine_in',
        status: 'new',
        source: 'qr',
        customerName: customerName.trim(),
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
        statusHistory: { create: { toStatus: 'new' } },
      },
      select: { id: true, orderNumber: true, total: true },
    })
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
