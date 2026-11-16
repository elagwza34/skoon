import { financialDayBoundary } from '@/lib/financial-calendar'
import { ROLE } from '@/lib/authz'
import { centsToAmount, financeBranchScope, toCents } from '@/lib/finance-metrics'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'

export class VatReportError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'VatReportError' }
}

export type VatPayment = { id?: string | bigint; status: string; amount: unknown; createdAt: Date }
export type VatInvoiceInput = {
  id: string; number: string; branchId: string; branch: string; createdAt: Date
  subtotal: unknown; discount: unknown; tax: unknown; total: unknown; taxRate: unknown
  payments: VatPayment[]
  refunds?: { id: string | bigint; paymentId: string | bigint; status: string; amount: unknown; executedAt: Date | null }[]
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
export function calculateVat(invoices: readonly VatInvoiceInput[], window: { from?: Date; to?: Date } = {}): VatCalculation {
  const result: VatCalculation = { collectedVatCents: 0, refundedVatCents: 0, netVatCents: 0, salesExcludingVatCents: 0, salesIncludingVatCents: 0, paidInvoices: 0, rows: [], excluded: [] }
  const inWindow = (at: Date) => (!window.from || at >= window.from) && (!window.to || at <= window.to)
  for (const invoice of invoices) {
    const total = toCents(invoice.total), tax = toCents(invoice.tax)
    const settled = invoice.payments.filter(payment => ['completed', 'refunded'].includes(payment.status)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || String(a.id ?? '').localeCompare(String(b.id ?? '')))
    if (!settled.length || total <= 0 || tax < 0 || tax > total || settled.reduce((sum, payment) => sum + toCents(payment.amount), 0) > total) {
      result.excluded.push({ number: invoice.number, branch: invoice.branch, reason: 'invalid_or_unsettled_invoice' }); continue
    }
    let collectedBase = 0, allocatedTax = 0, counted = false
    const add = (id: string, amount: number, vat: number, at: Date, state: 'collected' | 'refunded', note: string | null = null) => {
      if (!inWindow(at)) return
      if (state === 'collected') {
        result.collectedVatCents += vat; result.salesExcludingVatCents += amount - vat; result.salesIncludingVatCents += amount; counted = true
      } else { result.refundedVatCents += vat }
      result.rows.push({ id, number: invoice.number, branch: invoice.branch, paymentAt: at.toISOString(), taxRate: String(invoice.taxRate), salesExcludingVat: centsToAmount(amount - vat), vatCollected: centsToAmount(vat), salesIncludingVat: centsToAmount(amount), state, note })
    }
    for (const [index, payment] of settled.entries()) {
      const amount = toCents(payment.amount)
      collectedBase += amount
      const nextTax = Number((BigInt(tax) * BigInt(collectedBase) + BigInt(Math.floor(total / 2))) / BigInt(total))
      const paymentTax = nextTax - allocatedTax; allocatedTax = nextTax
      if (payment.status === 'refunded') {
        add(`${invoice.id}:legacy:${index}`, amount, paymentTax, payment.createdAt, 'refunded', 'Legacy refund has no execution timestamp; original payment date is used.')
        continue
      }
      add(`${invoice.id}:payment:${index}`, amount, paymentTax, payment.createdAt, 'collected')
      let returned = 0, returnedTax = 0
      const refunds = (invoice.refunds ?? []).filter(refund => refund.status === 'COMPLETED' && String(refund.paymentId) === String(payment.id)).sort((a,b) => (a.executedAt?.getTime() ?? 0) - (b.executedAt?.getTime() ?? 0) || String(a.id).localeCompare(String(b.id)))
      for (const refund of refunds) {
        if (!refund.executedAt) { result.excluded.push({ number: invoice.number, branch: invoice.branch, reason: 'completed_refund_missing_execution_date' }); continue }
        returned += toCents(refund.amount)
        if (returned > amount || amount <= 0) { result.excluded.push({ number: invoice.number, branch: invoice.branch, reason: 'refund_exceeds_payment' }); continue }
        const nextReturnedTax = Number((BigInt(paymentTax) * BigInt(returned) + BigInt(Math.floor(amount / 2))) / BigInt(amount))
        add(`${invoice.id}:refund:${refund.id}`, toCents(refund.amount), nextReturnedTax - returnedTax, refund.executedAt, 'refunded')
        returnedTax = nextReturnedTax
      }
    }
    if (counted) result.paidInvoices++
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
  return financialDayBoundary(value, endOfDay)
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
    where: { ...financeBranchScope(session), ...(branchId ? { branchId } : {}), OR: [{ payments: { some: { status: { in: ['completed', 'refunded'] }, ...(paymentDate ? { createdAt: paymentDate } : {}) } } }, { refunds: { some: { status: 'COMPLETED', ...(paymentDate ? { executedAt: paymentDate } : {}) } } }] },
    orderBy: { createdAt: 'desc' },
    select: { id: true, orderNumber: true, branchId: true, createdAt: true, itemsSubtotal: true, discountAmount: true, taxAmount: true, total: true, taxRate: true, branch: { select: { name: true } }, payments: { select: { id: true, status: true, amount: true, createdAt: true } }, refunds: { where: { status: 'COMPLETED' }, select: { id: true, paymentId: true, status: true, amount: true, executedAt: true } } },
  })
  const calculated = calculateVat(invoices.map((invoice) => ({ id: invoice.id.toString(), number: invoice.orderNumber, branchId: invoice.branchId.toString(), branch: invoice.branch.name, createdAt: invoice.createdAt, subtotal: invoice.itemsSubtotal, discount: invoice.discountAmount, tax: invoice.taxAmount, total: invoice.total, taxRate: invoice.taxRate, payments: invoice.payments, refunds: invoice.refunds })), { from, to })
  const day = new Map<string, number>(); const month = new Map<string, number>(); const rates = new Map<string, { vat: number; invoices: number }>()
  for (const row of calculated.rows) {
    const signed = row.state === 'refunded' ? -toCents(row.vatCollected) : toCents(row.vatCollected)
    const date = new Date(row.paymentAt); const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); const monthKey = dayKey.slice(0, 7)
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
    limitations: ['VAT uses the immutable order taxAmount and taxRate snapshots; it never applies current product rates.', 'Partial and split payments allocate the immutable invoice VAT proportionally with cumulative cent rounding; refunds reverse the corresponding payment allocation.', 'Current refunds are attributed to executedAt. Legacy payment-status refunds have no execution timestamp and use the original payment date.', 'Tax-rate breakdown is invoice-level. Mixed tax rates within one invoice cannot be reconstructed because legacy order items lack tax snapshots; new items preserve product tax rates in optionsSnapshot.taxRate.'],
  }
}
