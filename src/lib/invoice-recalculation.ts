import type { Prisma } from '@prisma/client'
import { calculateInvoiceDiscounts, type DiscountKind } from '@/lib/invoice-discounts'

type Tx = Prisma.TransactionClient

export class InvoiceCalculationError extends Error {}

function cents(value: unknown): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value).trim())
  if (!match) throw new InvoiceCalculationError('Invalid monetary value')
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'))
}

export function centsText(value: bigint) {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`
}

export function invoiceDiscountKind(value: string | null | undefined): DiscountKind {
  return value === 'percentage' || value === 'amount' ? value : 'none'
}

export function invoiceDiscountValue(kind: DiscountKind, value: unknown): bigint {
  if (kind === 'none') return 0n
  if (kind === 'amount') return cents(value)
  const match = /^(\d+)(?:\.0{1,2})?$/.exec(String(value).trim())
  if (!match) throw new InvoiceCalculationError('Percentage discount must be a whole number')
  const result = BigInt(match[1])
  if (result > 100n) throw new InvoiceCalculationError('Percentage discount cannot exceed 100')
  return result
}

export function calculateInvoiceTaxCents(base: bigint, rate: unknown) {
  return (base * cents(rate) + 5_000n) / 10_000n
}

/** Recalculate every persisted invoice amount from active order-item snapshots. */
export async function recalculateOpenOrderInvoice(
  tx: Tx,
  orderId: bigint,
  invoiceKind: DiscountKind,
  invoiceValue: bigint,
  taxRate: unknown,
) {
  const lines = await tx.orderItem.findMany({
    where: { orderId, isVoided: false },
    orderBy: { id: 'asc' },
    select: { id: true, unitPrice: true, quantity: true, discountType: true, discountValue: true, eligibleForInvoiceDiscount: true },
  })
  if (!lines.length) throw new InvoiceCalculationError('An invoice cannot remain without active items')
  const calculated = calculateInvoiceDiscounts(lines.map((line) => ({
    unitCents: cents(line.unitPrice),
    quantity: line.quantity,
    discountType: invoiceDiscountKind(line.discountType),
    discountValue: invoiceDiscountValue(invoiceDiscountKind(line.discountType), line.discountValue),
    eligibleForInvoiceDiscount: line.eligibleForInvoiceDiscount,
  })), invoiceKind, invoiceValue)
  await Promise.all(lines.map((line, index) => tx.orderItem.update({
    where: { id: line.id },
    data: { lineTotal: centsText(calculated.lineTotals[index].afterDiscountCents), discountAmount: centsText(calculated.lineTotals[index].itemDiscountCents) },
  })))
  const tax = calculateInvoiceTaxCents(calculated.finalCents, taxRate)
  const total = calculated.finalCents + tax
  return { calculated, tax, total }
}
