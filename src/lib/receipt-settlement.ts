import type { InvoiceRow } from '@/lib/staff-invoices'

export type ReceiptPayment = { paid: string; change: string; method: string }

/**
 * Rejects a stale pre-settlement snapshot. Receipt rendering is permitted only
 * with the persisted invoice returned by the payment endpoint.
 */
export function receiptInvoiceForSettlement(orderId: string, invoice: InvoiceRow | null | undefined): InvoiceRow | null {
  if (!invoice || invoice.id !== orderId || Number(invoice.paid) <= 0) return null
  return invoice
}

/** Presentation-only breakdown of persisted values; it never recalculates money. */
export function receiptSettlementBreakdown(invoice: InvoiceRow, payment?: ReceiptPayment) {
  const itemDiscount = Number(invoice.itemDiscount ?? 0)
  const totalDiscount = Number(invoice.discount ?? 0)
  const generalDiscount = Math.max(0, totalDiscount - itemDiscount)
  const generalDiscountPercent = invoice.discountType === 'percentage' ? Number(invoice.discountValue ?? 0) : null
  return {
    subtotal: invoice.subtotal,
    itemDiscount: itemDiscount.toFixed(2),
    generalDiscount: generalDiscount.toFixed(2),
    generalDiscountPercent,
    finalTotal: invoice.total,
    paid: payment?.paid ?? invoice.paid,
    method: payment?.method ?? invoice.payments.map((row) => row.method).join(' / '),
    change: payment?.change ?? '0.00',
  }
}
