import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast, requiresOperationalShift } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'
import { calculateInvoiceDiscounts, type DiscountKind } from '@/lib/invoice-discounts'

export class InvoiceError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = 'InvoiceError' } }

export type InvoiceRow = {
  id: string; number: string; createdAt: string; branch: string; table: string; creator: string | null; cashier: string | null
  status: string; paymentStatus: string; orderType?: string; notes?: string | null; discountType?: 'percentage' | 'amount' | null; discountValue?: string; subtotal: string; itemDiscount?: string; discountEligibleBase?: string; discount: string; tax: string; total: string; paid: string; remaining: string
  cancelledAt: string | null; cancelReason: string | null
  items: { id: string; productId: string; name: string; quantity: number; unitPrice: string; lineTotal: string; discountType: 'percentage' | 'amount' | null; discountValue: string; discountAmount: string; eligibleForInvoiceDiscount: boolean; variantId: string | null; variantLabel: string | null; notes?: string | null; details?: string[] }[]
  payments: { id: string; method: string; amount: string; createdAt: string; collector: string | null }[]
}

const editSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), productId: z.string().regex(/^\d+$/), variantId: z.string().regex(/^\d+$/).optional(), quantity: z.coerce.number().int().min(1).max(99) }),
  z.object({ action: z.literal('quantity'), orderItemId: z.string().regex(/^\d+$/), quantity: z.coerce.number().int().min(1).max(99) }),
  z.object({ action: z.literal('line_discount'), orderItemId: z.string().regex(/^\d+$/), discountType: z.enum(['percentage', 'amount', 'none']), discountValue: z.union([z.string().trim().min(1).max(32), z.number().finite()]), eligibleForInvoiceDiscount: z.boolean() }),
  z.object({ action: z.literal('financials'), discountType: z.enum(['percentage', 'amount', 'none']), discountValue: z.union([z.string().trim().min(1).max(32), z.number().finite()]), notes: z.string().trim().max(2_000).optional() }),
])

function settled(total: number, paid: number) { return paid >= total - 0.005 }
/** Compatibility helper for non-itemized call sites. Invoice editing itself uses
 * the integer-cent calculator below so discount persistence never uses floats. */
export function recalculateInvoiceTotals(subtotal: number, discountType: string | null, discountValue: number, taxRate: number) {
  const discount = discountType === 'percentage' ? subtotal * discountValue / 100 : Math.min(subtotal, discountValue)
  const tax = (subtotal - discount) * taxRate / 100
  return { discount: Math.round((discount + Number.EPSILON) * 100) / 100, tax: Math.round((tax + Number.EPSILON) * 100) / 100, total: Math.round((subtotal - discount + tax + Number.EPSILON) * 100) / 100 }
}
function cents(value: unknown): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim())
  if (!match) throw new InvoiceError('Invalid monetary value', 422)
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
}
function centsText(value: bigint) { return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}` }
function percentage(value: unknown): bigint {
  const text = String(value).trim()
  const match = /^(\d+)(?:\.0{1,2})?$/.exec(text)
  if (!match) throw new InvoiceError('Percentage discount must be a whole number', 422)
  const result = BigInt(match[1])
  if (result > 100n) throw new InvoiceError('Percentage discount cannot exceed 100', 422)
  return result
}
function discountKind(value: string | null | undefined): DiscountKind { return value === 'percentage' || value === 'amount' ? value : 'none' }
function discountValue(kind: DiscountKind, value: unknown): bigint { return kind === 'none' ? 0n : kind === 'percentage' ? percentage(value) : cents(value) }
function taxCents(base: bigint, rate: unknown) {
  const rateCents = cents(rate)
  return (base * rateCents + 5_000n) / 10_000n
}

export async function getCashierInvoices(session: StaffSession, range: { from?: Date; to?: Date; branchId?: bigint } = {}): Promise<InvoiceRow[]> {
  const scope = session.role === ROLE.OWNER ? (range.branchId ? { branchId: range.branchId } : {}) : { branchId: BigInt(session.branchId as string) }
  const createdAt = range.from || range.to ? { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } : undefined
  const orders = await prisma.order.findMany({ where: { ...scope, ...(createdAt ? { createdAt } : {}) }, orderBy: { createdAt: 'desc' }, take: 150,
      select: { id: true, orderNumber: true, createdAt: true, cancelledAt: true, cancelReason: true, status: true, paymentStatus: true, orderType: true, notes: true, discountType: true, discountValue: true, itemsSubtotal: true, itemDiscountAmount: true, discountEligibleBase: true, discountAmount: true, taxAmount: true, total: true,
        branch: { select: { name: true } }, cafeTable: { select: { number: true } }, createdBy: { select: { name: true } },
        items: { where: { isVoided: false }, select: { id: true, productId: true, productVariantId: true, productName: true, quantity: true, unitPrice: true, lineTotal: true, discountType: true, discountValue: true, discountAmount: true, eligibleForInvoiceDiscount: true, notes: true, optionsSnapshot: true, productVariantSnapshot: true } },
      payments: { where: { status: 'completed' }, select: { id: true, method: true, amount: true, createdAt: true, paidBy: { select: { name: true } } } },
    },
  })
  return orders.map((o) => {
    const paid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0)
    return { id: o.id.toString(), number: o.orderNumber, createdAt: o.createdAt.toISOString(), branch: o.branch.name, table: o.cafeTable.number, creator: o.createdBy?.name ?? null, cashier: o.payments.length > 0 ? o.payments[o.payments.length - 1]?.paidBy?.name ?? null : null, orderType: o.orderType, notes: o.notes, discountType: o.discountType === 'percentage' || o.discountType === 'amount' ? o.discountType : null, discountValue: Number(o.discountValue).toFixed(2),
      status: o.status, paymentStatus: settled(Number(o.total), paid) ? 'paid' : o.paymentStatus, subtotal: Number(o.itemsSubtotal).toFixed(2), itemDiscount: Number(o.itemDiscountAmount).toFixed(2), discountEligibleBase: Number(o.discountEligibleBase).toFixed(2), discount: Number(o.discountAmount).toFixed(2), tax: Number(o.taxAmount).toFixed(2), total: Number(o.total).toFixed(2), paid: paid.toFixed(2), remaining: Math.max(0, Number(o.total) - paid).toFixed(2), cancelledAt: o.cancelledAt?.toISOString() ?? null, cancelReason: o.cancelReason ?? null,
      items: o.items.map((i) => ({ id: i.id.toString(), productId: i.productId.toString(), variantId: i.productVariantId?.toString() ?? null, variantLabel: snapshotLabels(i.productVariantSnapshot, i.optionsSnapshot)[0] ?? null, name: i.productName, quantity: i.quantity, unitPrice: Number(i.unitPrice).toFixed(2), lineTotal: Number(i.lineTotal).toFixed(2), discountType: i.discountType === 'percentage' || i.discountType === 'amount' ? i.discountType : null, discountValue: Number(i.discountValue).toFixed(2), discountAmount: Number(i.discountAmount).toFixed(2), eligibleForInvoiceDiscount: i.eligibleForInvoiceDiscount, notes: i.notes, details: snapshotLabels(i.productVariantSnapshot, i.optionsSnapshot) })),
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
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${String(i.path.join('.'))}: ${i.message}`).join(', ')
    throw new InvoiceError(`Invalid invoice edit: ${issues}`, 400)
  }
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
    let financials: { discountType: DiscountKind; discountValue: bigint; notes: string | null } | null = null
    if (parsed.data.action === 'add') {
      const product = await tx.product.findFirst({ where: { id: BigInt(parsed.data.productId!), branchId: order.branchId, isActive: true, isAvailable: true, deletedAt: null }, select: { id: true, name: true, price: true } })
      if (!product) throw new InvoiceError('Product is unavailable', 422)
      let unitPrice = product.price
      let productVariantId: string | null = null
      if (parsed.data.variantId) {
        const variant = await tx.productVariant.findFirst({ where: { id: BigInt(parsed.data.variantId), productId: product.id, isActive: true, isAvailable: true, archivedAt: null }, select: { id: true, price: true, combinationKey: true, values: { select: { value: { select: { label: true } } } } } })
        if (!variant) throw new InvoiceError('Product variant is unavailable', 422)
        unitPrice = variant.price
        productVariantId = variant.id.toString()
        await tx.orderItem.create({ data: { orderId, productId: product.id, productVariantId: BigInt(productVariantId), productName: `${product.name} — ${variant.values[0]?.value.label ?? variant.combinationKey}`, unitPrice: variant.price, quantity: parsed.data.quantity, lineTotal: (Number(variant.price) * parsed.data.quantity).toFixed(2) } })
      } else {
        await tx.orderItem.create({ data: { orderId, productId: product.id, productName: product.name, unitPrice: product.price, quantity: parsed.data.quantity, lineTotal: (Number(product.price) * parsed.data.quantity).toFixed(2) } })
      }
    } else if (parsed.data.action === 'quantity') {
      const item = await tx.orderItem.findFirst({ where: { id: BigInt(parsed.data.orderItemId!), orderId, isVoided: false }, select: { id: true, unitPrice: true } })
      if (!item) throw new InvoiceError('Invoice item not found', 404)
      await tx.orderItem.update({ where: { id: item.id }, data: { quantity: parsed.data.quantity, lineTotal: (Number(item.unitPrice) * parsed.data.quantity).toFixed(2) } })
    } else if (parsed.data.action === 'line_discount') {
      const item = await tx.orderItem.findFirst({ where: { id: BigInt(parsed.data.orderItemId), orderId, isVoided: false }, select: { id: true } })
      if (!item) throw new InvoiceError('Invoice item not found', 404)
      const kind = parsed.data.discountType
      const value = discountValue(kind, parsed.data.discountValue)
      await tx.orderItem.update({ where: { id: item.id }, data: { discountType: kind === 'none' ? null : kind, discountValue: kind === 'amount' ? centsText(value) : value.toString(), eligibleForInvoiceDiscount: parsed.data.eligibleForInvoiceDiscount } })
    } else {
      const kind = parsed.data.discountType
      financials = { discountType: kind, discountValue: discountValue(kind, parsed.data.discountValue), notes: parsed.data.notes?.trim() || null }
    }
    const lines = await tx.orderItem.findMany({ where: { orderId, isVoided: false }, select: { id: true, unitPrice: true, quantity: true, discountType: true, discountValue: true, eligibleForInvoiceDiscount: true } })
    const invoiceKind = financials?.discountType ?? discountKind(locked.discount_type)
    const invoiceValue = financials?.discountValue ?? discountValue(invoiceKind, locked.discount_value)
    let calculated
    try {
      calculated = calculateInvoiceDiscounts(lines.map((line) => ({ unitCents: cents(line.unitPrice), quantity: line.quantity, discountType: discountKind(line.discountType), discountValue: discountValue(discountKind(line.discountType), line.discountValue), eligibleForInvoiceDiscount: line.eligibleForInvoiceDiscount })), invoiceKind, invoiceValue)
    } catch (error) {
      throw new InvoiceError(error instanceof Error ? error.message : 'Invalid discount', 422)
    }
    await Promise.all(lines.map((line, index) => tx.orderItem.update({ where: { id: line.id }, data: { lineTotal: centsText(calculated.lineTotals[index].afterDiscountCents), discountAmount: centsText(calculated.lineTotals[index].itemDiscountCents) } })))
    const tax = taxCents(calculated.finalCents, locked.tax_rate)
    const total = calculated.finalCents + tax
    await tx.order.update({ where: { id: orderId }, data: { itemsSubtotal: centsText(calculated.subtotalCents), itemDiscountAmount: centsText(calculated.itemDiscountCents), discountEligibleBase: centsText(calculated.eligibleBaseCents), discountAmount: centsText(calculated.itemDiscountCents + calculated.invoiceDiscountCents), taxAmount: centsText(tax), total: centsText(total), paymentStatus: 'unpaid', ...(financials ? { discountType: financials.discountType === 'none' ? null : financials.discountType, discountValue: financials.discountType === 'amount' ? centsText(financials.discountValue) : financials.discountValue.toString(), notes: financials.notes } : {}) } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: order.branchId, action: 'invoice.edit', entityType: 'order', entityId: orderId, newValues: { action: parsed.data.action, subtotal: centsText(calculated.subtotalCents), itemDiscount: centsText(calculated.itemDiscountCents), invoiceDiscount: centsText(calculated.invoiceDiscountCents), total: centsText(total) } } })
    return { id: orderId.toString(), total: centsText(total) }
  })
}

export function splitInvoices(invoices: readonly InvoiceRow[]) { return { open: invoices.filter((i) => i.status !== 'cancelled' && Number(i.remaining) > 0), paid: invoices.filter((i) => i.status !== 'cancelled' && Number(i.remaining) <= 0) } }
