import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'

export class InvoiceError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = 'InvoiceError' } }

export type InvoiceRow = {
  id: string; number: string; createdAt: string; branch: string; table: string; creator: string | null
  status: string; paymentStatus: string; subtotal: string; discount: string; tax: string; total: string; paid: string; remaining: string
  cancelledAt: string | null; cancelReason: string | null
  items: { id: string; productId: string; name: string; quantity: number; unitPrice: string; lineTotal: string }[]
  payments: { id: string; method: string; amount: string; createdAt: string; collector: string | null }[]
}

const editSchema = z.object({ action: z.enum(['add', 'quantity']), productId: z.string().regex(/^\d+$/).optional(), orderItemId: z.string().regex(/^\d+$/).optional(), quantity: z.coerce.number().int().min(1).max(99) })

export function recalculateInvoiceTotals(subtotal: number, discountType: string | null, discountValue: number, taxRate: number) {
  const discount = discountType === 'percentage' ? subtotal * discountValue / 100 : Math.min(subtotal, discountValue)
  const tax = (subtotal - discount) * taxRate / 100
  return { discount: round(discount), tax: round(tax), total: round(subtotal - discount + tax) }
}
function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100 }
function settled(total: number, paid: number) { return paid >= total - 0.005 }

export async function getCashierInvoices(session: StaffSession, range: { from?: Date; to?: Date; branchId?: bigint } = {}): Promise<InvoiceRow[]> {
  const scope = session.role === ROLE.OWNER ? (range.branchId ? { branchId: range.branchId } : {}) : { branchId: BigInt(session.branchId as string) }
  const createdAt = range.from || range.to ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } : undefined
  const orders = await prisma.order.findMany({ where: { ...scope, ...(createdAt ? { createdAt } : {}) }, orderBy: { createdAt: 'desc' }, take: 150,
    select: { id: true, orderNumber: true, createdAt: true, cancelledAt: true, cancelReason: true, status: true, paymentStatus: true, itemsSubtotal: true, discountAmount: true, taxAmount: true, total: true,
      branch: { select: { name: true } }, cafeTable: { select: { number: true } }, createdBy: { select: { name: true } },
      items: { where: { isVoided: false }, select: { id: true, productId: true, productName: true, quantity: true, unitPrice: true, lineTotal: true } },
      payments: { where: { status: 'completed' }, select: { id: true, method: true, amount: true, createdAt: true, paidBy: { select: { name: true } } } },
    },
  })
  return orders.map((o) => {
    const paid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0)
    return { id: o.id.toString(), number: o.orderNumber, createdAt: o.createdAt.toISOString(), branch: o.branch.name, table: o.cafeTable.number, creator: o.createdBy?.name ?? null,
      status: o.status, paymentStatus: settled(Number(o.total), paid) ? 'paid' : o.paymentStatus, subtotal: Number(o.itemsSubtotal).toFixed(2), discount: Number(o.discountAmount).toFixed(2), tax: Number(o.taxAmount).toFixed(2), total: Number(o.total).toFixed(2), paid: paid.toFixed(2), remaining: Math.max(0, Number(o.total) - paid).toFixed(2), cancelledAt: o.cancelledAt?.toISOString() ?? null, cancelReason: o.cancelReason ?? null,
      items: o.items.map((i) => ({ id: i.id.toString(), productId: i.productId.toString(), name: i.productName, quantity: i.quantity, unitPrice: Number(i.unitPrice).toFixed(2), lineTotal: Number(i.lineTotal).toFixed(2) })),
      payments: o.payments.map((p) => ({ id: p.id.toString(), method: p.method, amount: Number(p.amount).toFixed(2), createdAt: p.createdAt.toISOString(), collector: p.paidBy?.name ?? null })),
    }
  })
}

/** Add a catalog item or change an existing line while the invoice is unsettled. */
export async function editOpenInvoice(session: StaffSession, orderIdRaw: string, input: unknown) {
  if (!hasAtLeast(session.role, ROLE.CASHIER)) throw new InvoiceError('Forbidden', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new InvoiceError('Invoice not found', 404)
  const parsed = editSchema.safeParse(input)
  if (!parsed.success || (parsed.data.action === 'add' && !parsed.data.productId) || (parsed.data.action === 'quantity' && !parsed.data.orderItemId)) throw new InvoiceError('Invalid invoice edit')
  const orderId = BigInt(orderIdRaw)
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { branchId: true } })
  if (!order || !staffCanAccessBranch(session, order.branchId)) throw new InvoiceError('Invoice not found', 404)
  if (requiresOperationalShift(session.role) && !await getOpenShift(session.id, order.branchId)) throw new InvoiceError('An open shift is required', 409)
  return prisma.$transaction(async (tx) => {
    const orderRows = await tx.$queryRaw<{ total: unknown; status: string; discount_type: string | null; discount_value: unknown; tax_rate: unknown }[]>`SELECT total, status, discount_type, discount_value, tax_rate FROM orders WHERE id = ${orderId} FOR UPDATE`
    const locked = orderRows[0]
    if (!locked || locked.status === 'cancelled') throw new InvoiceError('Invoice is not editable', 409)
    const existingPaid = await tx.payment.aggregate({ where: { orderId, status: 'completed' }, _sum: { amount: true } })
    if (settled(Number(locked.total), Number(existingPaid._sum.amount ?? 0))) throw new InvoiceError('A paid invoice cannot be edited', 409)
    if (parsed.data.action === 'add') {
      const product = await tx.product.findFirst({ where: { id: BigInt(parsed.data.productId!), branchId: order.branchId, isActive: true, isAvailable: true, deletedAt: null }, select: { id: true, name: true, price: true } })
      if (!product) throw new InvoiceError('Product is unavailable', 422)
      await tx.orderItem.create({ data: { orderId, productId: product.id, productName: product.name, unitPrice: product.price, quantity: parsed.data.quantity, lineTotal: (Number(product.price) * parsed.data.quantity).toFixed(2) } })
    } else {
      const item = await tx.orderItem.findFirst({ where: { id: BigInt(parsed.data.orderItemId!), orderId, isVoided: false }, select: { id: true, unitPrice: true } })
      if (!item) throw new InvoiceError('Invoice item not found', 404)
      await tx.orderItem.update({ where: { id: item.id }, data: { quantity: parsed.data.quantity, lineTotal: (Number(item.unitPrice) * parsed.data.quantity).toFixed(2) } })
    }
    const lines = await tx.orderItem.findMany({ where: { orderId, isVoided: false }, select: { lineTotal: true } })
    const subtotal = round(lines.reduce((sum, line) => sum + Number(line.lineTotal), 0))
    const calculated = recalculateInvoiceTotals(subtotal, locked.discount_type, Number(locked.discount_value), Number(locked.tax_rate))
    await tx.order.update({ where: { id: orderId }, data: { itemsSubtotal: subtotal.toFixed(2), discountAmount: calculated.discount.toFixed(2), taxAmount: calculated.tax.toFixed(2), total: calculated.total.toFixed(2), paymentStatus: 'unpaid' } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: 'invoice.edit', entityType: 'order', entityId: orderId, newValues: { action: parsed.data.action, quantity: parsed.data.quantity, subtotal, total: calculated.total } } })
    return { id: orderId.toString(), total: calculated.total.toFixed(2) }
  })
}

export function splitInvoices(invoices: readonly InvoiceRow[]) { return { open: invoices.filter((i) => i.status !== 'cancelled' && Number(i.remaining) > 0), paid: invoices.filter((i) => i.status !== 'cancelled' && Number(i.remaining) <= 0) } }
