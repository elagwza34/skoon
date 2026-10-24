import { ROLE } from '@/lib/authz'
import { centsToAmount, financeBranchScope, toCents } from '@/lib/finance-metrics'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'

export class VatReportError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'VatReportError' }
}

export type VatPayment = { status: string; amount: unknown; createdAt: Date }
export type VatInvoiceInput = {
  id: string; number: string; branchId: string; branch: string; createdAt: Date
  subtotal: unknown; discount: unknown; tax: unknown; total: unknown; taxRate: unknown
  payments: VatPayment[]
}
export type VatInvoiceRow = {
  id: string; number: string; branch: string; paymentAt: string; taxRate: string
  salesExcludingVat: number; vatCollected: number; salesIncludingVat: number
  state: 'collected' | 'refunded'; note: string | null
}
export type VatExcludedInvoice = { number: string; branch: string; reason: string }

export interface VatCalculation {
  collectedVatCents: number
  refundedVatCents: number
  netVatCents: number
  salesExcludingVatCents: number
  salesIncludingVatCents: number
  paidInvoices: number
  rows: VatInvoiceRow[]
  excluded: VatExcludedInvoice[]
}

/**
 * Reconciles immutable invoice tax with exactly one settled payment.
 * No rate is re-applied here: `tax` is the stored invoice snapshot. A legacy
 * partial/split payment cannot be attributed by date without an allocation
 * ledger, so it is explicitly excluded rather than estimated.
 */
export function calculateVat(invoices: readonly VatInvoiceInput[]): VatCalculation {
  const result: VatCalculation = { collectedVatCents: 0, refundedVatCents: 0, netVatCents: 0, salesExcludingVatCents: 0, salesIncludingVatCents: 0, paidInvoices: 0, rows: [], excluded: [] }
  for (const invoice of invoices) {
    const settled = invoice.payments.filter((payment) => payment.status === 'completed' || payment.status === 'refunded')
    if (settled.length !== 1) {
      result.excluded.push({ number: invoice.number, branch: invoice.branch, reason: settled.length > 1 ? 'multiple_settled_payments_no_tax_allocation' : 'no_settled_payment' })
      continue
    }
    const payment = settled[0]
    const totalCents = toCents(invoice.total)
    if (toCents(payment.amount) !== totalCents) {
      result.excluded.push({ number: invoice.number, branch: invoice.branch, reason: 'partial_or_mismatched_payment_no_tax_allocation' })
      continue
    }
    const taxCents = toCents(invoice.tax)
    const netSalesCents = totalCents - taxCents
    const state = payment.status === 'completed' ? 'collected' : 'refunded'
    if (state === 'collected') {
      result.collectedVatCents += taxCents
      result.salesExcludingVatCents += netSalesCents
      result.salesIncludingVatCents += totalCents
      result.paidInvoices += 1
    } else {
      result.refundedVatCents += taxCents
    }
    result.rows.push({
      id: invoice.id, number: invoice.number, branch: invoice.branch, paymentAt: payment.createdAt.toISOString(),
      taxRate: String(invoice.taxRate), salesExcludingVat: centsToAmount(netSalesCents),
      vatCollected: centsToAmount(taxCents), salesIncludingVat: centsToAmount(totalCents), state,
      note: state === 'refunded' ? 'Refund date is not recorded; payment creation date is shown.' : null,
    })
  }
  result.netVatCents = result.collectedVatCents - result.refundedVatCents
  return result
}

export interface VatReport {
  from: string | null
  to: string | null
  branchId: string | null
  totalCollectedVat: number
  totalRefundedVat: number
  netCollectedVat: number
  totalSalesExcludingVat: number
  totalSalesIncludingVat: number
  paidInvoices: number
  byDay: { label: string; vat: number }[]
  byMonth: { label: string; vat: number }[]
  byTaxRate: { rate: string; vat: number; invoices: number }[]
  invoices: VatInvoiceRow[]
  excluded: VatExcludedInvoice[]
  limitations: string[]
}

export function parseVatDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new VatReportError('Dates must use YYYY-MM-DD')
  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
  if (Number.isNaN(parsed.getTime())) throw new VatReportError('Invalid date')
  return parsed
}

/** Validated, server-side-only filters. The client can never provide a scope wider than Owner access. */
export function normalizeVatReportFilters(input: { from?: string; to?: string; branchId?: string }) {
  const from = parseVatDate(input.from)
  const to = parseVatDate(input.to, true)
  if (from && to && from > to) throw new VatReportError('The start date must not be after the end date')
  if (from && to && to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new VatReportError('Date range may not exceed 366 days')
  if (input.branchId && !/^\d+$/.test(input.branchId)) throw new VatReportError('Invalid branch')
  return { from, to, branchId: input.branchId ? BigInt(input.branchId) : undefined }
}

export async function getVatReport(session: StaffSession, input: { from?: string; to?: string; branchId?: string } = {}): Promise<VatReport> {
  if (session.role !== ROLE.OWNER) throw new VatReportError('Owner access is required', 403)
  const { from, to, branchId } = normalizeVatReportFilters(input)
  const paymentDate = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined
  const invoices = await prisma.order.findMany({
    where: { ...financeBranchScope(session), ...(branchId ? { branchId } : {}), payments: { some: { status: { in: ['completed', 'refunded'] }, ...(paymentDate ? { createdAt: paymentDate } : {}) } } },
    orderBy: { createdAt: 'desc' }, take: 1000,
    select: { id: true, orderNumber: true, branchId: true, createdAt: true, itemsSubtotal: true, discountAmount: true, taxAmount: true, total: true, taxRate: true, branch: { select: { name: true } }, payments: { select: { status: true, amount: true, createdAt: true } } },
  })
  const calculated = calculateVat(invoices.map((invoice) => ({ id: invoice.id.toString(), number: invoice.orderNumber, branchId: invoice.branchId.toString(), branch: invoice.branch.name, createdAt: invoice.createdAt, subtotal: invoice.itemsSubtotal, discount: invoice.discountAmount, tax: invoice.taxAmount, total: invoice.total, taxRate: invoice.taxRate, payments: invoice.payments })))
  const day = new Map<string, number>(); const month = new Map<string, number>(); const rates = new Map<string, { vat: number; invoices: number }>()
  for (const row of calculated.rows) {
    const signed = row.state === 'refunded' ? -toCents(row.vatCollected) : toCents(row.vatCollected)
    const date = new Date(row.paymentAt); const dayKey = date.toISOString().slice(0, 10); const monthKey = dayKey.slice(0, 7)
    day.set(dayKey, (day.get(dayKey) ?? 0) + signed); month.set(monthKey, (month.get(monthKey) ?? 0) + signed)
    const existing = rates.get(row.taxRate) ?? { vat: 0, invoices: 0 }; existing.vat += signed; existing.invoices += 1; rates.set(row.taxRate, existing)
  }
  return {
    from: input.from ?? null, to: input.to ?? null, branchId: input.branchId ?? null,
    totalCollectedVat: centsToAmount(calculated.collectedVatCents), totalRefundedVat: centsToAmount(calculated.refundedVatCents), netCollectedVat: centsToAmount(calculated.netVatCents), totalSalesExcludingVat: centsToAmount(calculated.salesExcludingVatCents), totalSalesIncludingVat: centsToAmount(calculated.salesIncludingVatCents), paidInvoices: calculated.paidInvoices,
    byDay: [...day].map(([label, cents]) => ({ label, vat: centsToAmount(cents) })).sort((a, b) => a.label.localeCompare(b.label)),
    byMonth: [...month].map(([label, cents]) => ({ label, vat: centsToAmount(cents) })).sort((a, b) => a.label.localeCompare(b.label)),
    byTaxRate: [...rates].map(([rate, value]) => ({ rate, vat: centsToAmount(value.vat), invoices: value.invoices })).sort((a, b) => a.rate.localeCompare(b.rate)),
    invoices: calculated.rows, excluded: calculated.excluded,
    limitations: ['VAT uses the immutable order taxAmount and taxRate snapshots; it never applies current product rates.', 'The current payment writer supports full-order collection and full refunds only. Legacy partial or multiple settled payments are excluded because no tax-allocation ledger exists.', 'Refunded payments have no refundedAt timestamp, so refund date reporting is unavailable; the original payment timestamp is displayed only as context.', 'Tax-rate breakdown is invoice-level. Mixed tax rates within one invoice cannot be reconstructed because order items do not persist tax snapshots.'],
  }
}
