import { ROLE } from '@/lib/authz'
import { centsToAmount, summarizePayments, toCents } from '@/lib/finance-metrics'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import { getCashierInvoices, type InvoiceRow } from '@/lib/staff-invoices'
import { getSharedFloatSummary, type SharedFloatSummary } from '@/lib/staff-float'
import { getVatReport, type VatReport } from '@/lib/vat-report'

export class FinanceError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = 'FinanceError' } }
export type FinanceFilters = { from?: string; to?: string; branchId?: string }
export interface OwnerFinanceWorkspace {
  invoices: InvoiceRow[]; payments: { id: string; orderNumber: string; branch: string; amount: number; method: string; status: string; createdAt: string; cashier: string | null }[]
  shifts: { id: string; branch: string; cashier: string | null; status: string; openedAt: string; closedAt: string | null; expectedCash: number; closingCash: number; difference: number; handoverTo: string | null }[]
  summary: { collected: number; refunded: number; netCollected: number; completedPayments: number; openInvoices: number; paidInvoices: number; outstanding: number }
  float: SharedFloatSummary; vat: VatReport; branches: { id: string; name: string }[]
}
function ranges(input: FinanceFilters) {
  const parse = (value: string | undefined, end = false) => { if (!value) return undefined; if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FinanceError('Dates must use YYYY-MM-DD'); return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`) }
  const from = parse(input.from); const to = parse(input.to, true)
  if (from && to && from > to) throw new FinanceError('The start date must not be after the end date')
  if (from && to && to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) throw new FinanceError('Date range may not exceed 366 days')
  if (input.branchId && !/^\d+$/.test(input.branchId)) throw new FinanceError('Invalid branch')
  return { from, to, branchId: input.branchId ? BigInt(input.branchId) : undefined }
}

/** Owner-only consolidated, read-only financial workspace. */
export async function getOwnerFinanceWorkspace(session: StaffSession, input: FinanceFilters = {}): Promise<OwnerFinanceWorkspace> {
  if (session.role !== ROLE.OWNER) throw new FinanceError('Owner access is required', 403)
  const { from, to, branchId } = ranges(input); const date = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined
  const [allInvoices, paymentRows, shiftRows, float, vat, branches] = await Promise.all([
    getCashierInvoices(session, { from, to, branchId }),
    prisma.payment.findMany({ where: { ...(branchId ? { branchId } : {}), ...(date ? { createdAt: date } : {}) }, orderBy: { createdAt: 'desc' }, take: 300, select: { id: true, amount: true, method: true, status: true, createdAt: true, order: { select: { orderNumber: true, branch: { select: { name: true } } } }, paidBy: { select: { name: true } } } }),
    prisma.shift.findMany({ where: { ...(branchId ? { branchId } : {}), ...(date ? { openedAt: date } : {}) }, orderBy: { openedAt: 'desc' }, take: 150, select: { id: true, status: true, openedAt: true, closedAt: true, expectedCash: true, closingCash: true, cashDifference: true, handoverTo: true, branch: { select: { name: true } }, cashier: { select: { name: true } } } }),
    getSharedFloatSummary(session, input.branchId), getVatReport(session, input), prisma.cafeBranch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true } }),
  ])
  const invoices = allInvoices
  const summaryPayments = summarizePayments(paymentRows.map((payment) => ({ status: payment.status, method: payment.method, amount: payment.amount })))
  const open = invoices.filter((invoice) => invoice.status !== 'cancelled' && Number(invoice.remaining) > 0); const paid = invoices.filter((invoice) => invoice.status !== 'cancelled' && Number(invoice.remaining) <= 0)
  return { invoices, payments: paymentRows.map((payment) => ({ id: payment.id.toString(), orderNumber: payment.order.orderNumber, branch: payment.order.branch.name, amount: centsToAmount(toCents(payment.amount)), method: payment.method, status: payment.status, createdAt: payment.createdAt.toISOString(), cashier: payment.paidBy?.name ?? null })), shifts: shiftRows.map((shift) => ({ id: shift.id.toString(), branch: shift.branch.name, cashier: shift.cashier?.name ?? null, status: shift.status, openedAt: shift.openedAt.toISOString(), closedAt: shift.closedAt?.toISOString() ?? null, expectedCash: centsToAmount(toCents(shift.expectedCash)), closingCash: centsToAmount(toCents(shift.closingCash)), difference: centsToAmount(toCents(shift.cashDifference)), handoverTo: shift.handoverTo })), summary: { collected: centsToAmount(summaryPayments.collectedCents), refunded: centsToAmount(summaryPayments.refundedCents), netCollected: centsToAmount(summaryPayments.collectedCents - summaryPayments.refundedCents), completedPayments: summaryPayments.completedCount, openInvoices: open.length, paidInvoices: paid.length, outstanding: centsToAmount(open.reduce((total, invoice) => total + toCents(invoice.remaining), 0)) }, float, vat, branches: branches.map((branch) => ({ id: branch.id.toString(), name: branch.name })) }
}
