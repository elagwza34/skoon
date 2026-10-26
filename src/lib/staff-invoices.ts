import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'

export class InvoiceError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = 'InvoiceError' } }

export type InvoiceRow = {
  id: string; number: string; createdAt: string; branch: string; table: string; creator: string | null
  status: string; paymentStatus: string; orderType?: string; notes?: string | null; discountType?: 'percentage' | 'amount' | null; discountValue?: string; subtotal: string; discount: string; tax: string; total: string; paid: string; remaining: string
  cancelledAt: string | null; cancelReason: string | null
  items: { id: string; productId: string; name: string; quantity: number; unitPrice: string; lineTotal: string; notes?: string | null; details?: string[] }[]
  payments: { id: string; method: string; amount: string; createdAt: string; collector: string | null }[]
}

const editSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), productId: z.string().regex(/^\d+$/), quantity: z.coerce.number().int().min(1).max(99) }),
  z.object({ action: z.literal('quantity'), orderItemId: z.string().regex(/^\d+$/), quantity: z.coerce.number().int().min(1).max(99) }),
  z.object({ action: z.literal('financials'), discountType: z.enum(['percentage', 'amount', 'none']), discountValue: z.coerce.number().finite().min(0).max(1_000_000), notes: z.string().trim().max(2_000).optional() }),
])

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
    select: { id: true, orderNumber: true, createdAt: true, cancelledAt: true, cancelReason: true, status: true, paymentStatus: true, orderType: true, notes: true, discountType: true, discountValue: true, itemsSubtotal: true, discountAmount: true, taxAmount: true, total: true,
      branch: { select: { name: true } }, cafeTable: { select: { number: true } }, createdBy: { select: { name: true } },
      items: { where: { isVoided: false }, select: { id: true, productId: true, productName: true, quantity: true, unitPrice: true, lineTotal: true, notes: true, optionsSnapshot: true, productVariantSnapshot: true } },
      payments: { where: { status: 'completed' }, select: { id: true, method: true, amount: true, createdAt: true, paidBy: { select: { name: true } } } },
    },
  })
  return orders.map((o) => {
    const paid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0)
    return { id: o.id.toString(), number: o.orderNumber, createdAt: o.createdAt.toISOString(), branch: o.branch.name, table: o.cafeTable.number, creator: o.createdBy?.name ?? null, orderType: o.orderType, notes: o.notes, discountType: o.discountType === 'percentage' || o.discountType === 'amount' ? o.discountType : null, discountValue: Number(o.discountValue).toFixed(2),
      status: o.status, paymentStatus: settled(Number(o.total), paid) ? 'paid' : o.paymentStatus, subtotal: Number(o.itemsSubtotal).toFixed(2), discount: Number(o.discountAmount).toFixed(2), tax: Number(o.taxAmount).toFixed(2), total: Number(o.total).toFixed(2), paid: paid.toFixed(2), remaining: Math.max(0, Number(o.total) - paid).toFixed(2), cancelledAt: o.cancelledAt?.toISOString() ?? null, cancelReason: o.cancelReason ?? null,
      items: o.items.map((i) => ({ id: i.id.toString(), productId: i.productId.toString(), name: i.productName, quantity: i.quantity, unitPrice: Number(i.unitPrice).toFixed(2), lineTotal: Number(i.lineTotal).toFixed(2), notes: i.notes, details: snapshotLabels(i.productVariantSnapshot, i.optionsSnapshot) })),
      payments: o.payments.map((p) => ({ id: p.id.toString(), method: p.method, amount: Number(p.amount).toFixed(2), createdAt: p.createdAt.toISOString(), collector: p.paidBy?.name ?? null })),
    }
  })
}

function snapshotLabels(...snapshots: unknown[]): string[] {
  const labels = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === 'string') { const text = value.trim(); if (text) labels.add(text); return }
    if (Array.isArray(value)) { value.forEach(visit); return }
    if (!value || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    for (const key of ['label', 'name', 'value', 'title']) if (typeof record[key] === 'string') labels.add(record[key].trim())
    for (const value of Object.values(record)) if (typeof value !== 'string') visit(value)
  }
  snapshots.forEach(visit)
  return [...labels]
}

/** Add a catalog item or change an existing line while the invoice is unsettled. */
export async function editOpenInvoice(session: StaffSession, orderIdRaw: string, input: unknown) {
  if (!hasAtLeast(session.role, ROLE.CASHIER)) throw new InvoiceError('Forbidden', 403)
  if (!/^\d+$/.test(orderIdRaw)) throw new InvoiceError('Invoice not found', 404)
  const parsed = editSchema.safeParse(input)
  if (!parsed.success) throw new InvoiceError('Invalid invoice edit')
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
    let financials: { discountType: 'percentage' | 'amount' | null; discountValue: number; notes: string | null } | null = null
    if (parsed.data.action === 'add') {
      const product = await tx.product.findFirst({ where: { id: BigInt(parsed.data.productId!), branchId: order.branchId, isActive: true, isAvailable: true, deletedAt: null }, select: { id: true, name: true, price: true } })
      if (!product) throw new InvoiceError('Product is unavailable', 422)
      await tx.orderItem.create({ data: { orderId, productId: product.id, productName: product.name, unitPrice: product.price, quantity: parsed.data.quantity, lineTotal: (Number(product.price) * parsed.data.quantity).toFixed(2) } })
    } else if (parsed.data.action === 'quantity') {
      const item = await tx.orderItem.findFirst({ where: { id: BigInt(parsed.data.orderItemId!), orderId, isVoided: false }, select: { id: true, unitPrice: true } })
      if (!item) throw new InvoiceError('Invoice item not found', 404)
      await tx.orderItem.update({ where: { id: item.id }, data: { quantity: parsed.data.quantity, lineTotal: (Number(item.unitPrice) * parsed.data.quantity).toFixed(2) } })
    } else {
      if (parsed.data.discountType === 'percentage' && parsed.data.discountValue > 100) throw new InvoiceError('Percentage discount cannot exceed 100', 422)
      financials = { discountType: parsed.data.discountType === 'none' ? null : parsed.data.discountType, discountValue: parsed.data.discountType === 'none' ? 0 : parsed.data.discountValue, notes: parsed.data.notes?.trim() || null }
    }
    const lines = await tx.orderItem.findMany({ where: { orderId, isVoided: false }, select: { lineTotal: true } })
    const subtotal = round(lines.reduce((sum, line) => sum + Number(line.lineTotal), 0))
    const calculated = recalculateInvoiceTotals(subtotal, financials?.discountType ?? locked.discount_type, financials?.discountValue ?? Number(locked.discount_value), Number(locked.tax_rate))
    await tx.order.update({ where: { id: orderId }, data: { itemsSubtotal: subtotal.toFixed(2), discountAmount: calculated.discount.toFixed(2), taxAmount: calculated.tax.toFixed(2), total: calculated.total.toFixed(2), paymentStatus: 'unpaid', ...(financials ? { discountType: financials.discountType, discountValue: financials.discountValue.toFixed(2), notes: financials.notes } : {}) } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: 'invoice.edit', entityType: 'order', entityId: orderId, newValues: { action: parsed.data.action, quantity: parsed.data.action === 'financials' ? undefined : parsed.data.quantity, discountType: financials?.discountType, discountValue: financials?.discountValue, notesChanged: financials !== null, subtotal, total: calculated.total } } })
    return { id: orderId.toString(), total: calculated.total.toFixed(2) }
  })
}

export function splitInvoices(invoices: readonly InvoiceRow[]) { return { open: invoices.filter((i) => i.status !== 'cancelled' && Number(i.remaining) > 0), paid: invoices.filter((i) => i.status !== 'cancelled' && Number(i.remaining) <= 0) } }
