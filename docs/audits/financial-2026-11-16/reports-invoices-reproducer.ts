/** Run from repository root with node --import tsx <this-file>.
 * All database calls use strict in-memory doubles. Unexpected I/O fails closed.
 * These proofs establish application behavior, not PostgreSQL lock scheduling. */
import assert from 'node:assert/strict'
import net from 'node:net'
import tls from 'node:tls'

async function main() {
  const forbidden = () => { throw new Error('Network forbidden during isolated audit') }
  net.Socket.prototype.connect = forbidden as typeof net.Socket.prototype.connect
  tls.connect = forbidden as typeof tls.connect
  globalThis.fetch = forbidden as typeof fetch
  process.env.DATABASE_URL = 'postgresql://audit:audit@127.0.0.1:1/audit_forbidden'
  process.env.DIRECT_URL = process.env.DATABASE_URL
  const state = globalThis as typeof globalThis & { prisma: unknown }
  state.prisma = {}
  const strict = (object: Record<string, unknown>) => new Proxy(object, { get(target, key) {
    if (!(key in target)) throw new Error(`Unmocked database operation: ${String(key)}`)
    return target[key as string]
  } })
  const owner = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' as const, name: 'Audit Owner', branchId: null, email: null, permissions: [] }
  const { getOwnerFinanceWorkspace } = await import('../../../src/lib/staff-finance')
  const { getVatReport } = await import('../../../src/lib/vat-report')
  const { getCollectedStatsWithRefunds } = await import('../../../src/lib/finance-metrics')
  const { editOpenInvoice } = await import('../../../src/lib/staff-invoices')

  const paymentRows = Array.from({ length: 301 }, (_, index) => ({ id: BigInt(index + 1), amount: '100.00', method: 'cash', status: 'completed', createdAt: new Date('2026-11-16T10:00:00Z'), order: { orderNumber: String(index), branch: { name: 'Audit' } }, paidBy: { name: 'Cashier' } }))
  let refundQueries = 0
  let invoiceQueries: any[] = []
  let paymentQuery: any
  state.prisma = strict({
    order: strict({ findMany: async (query: any) => { invoiceQueries.push(query); return [] } }),
    payment: strict({ findMany: async (query: any) => { paymentQuery = query; return paymentRows.slice(0, query.take) } }),
    shift: strict({ findMany: async () => [] }),
    financialMovement: strict({ findMany: async () => [] }),
    cafeBranch: strict({ findMany: async () => [], findFirst: async () => ({ id: 1n }) }),
    refund: strict({ findMany: async () => { refundQueries++; return [{ amount: '40.00', status: 'COMPLETED' }] } }),
  })
  const workspace = await getOwnerFinanceWorkspace(owner)
  assert.equal(workspace.summary.collected, 30000)
  assert.equal(paymentRows.length * 100, 30100)
  assert.equal(refundQueries, 0)
  assert.equal(workspace.summary.refunded, 0)
  assert.equal(invoiceQueries[0].take, 150)
  console.log('CONFIRMED: owner totals use 300/301 payments, cap invoices at 150, and never query the active Refund ledger')

  let vatSelect: any
  state.prisma = strict({ order: strict({ findMany: async (query: any) => {
    vatSelect = query.select
    return [{ id: 1n, orderNumber: 'VAT-A', branchId: 1n, createdAt: new Date('2026-11-16T10:00:00Z'), itemsSubtotal: '100.00', discountAmount: '0.00', taxAmount: '14.00', total: '114.00', taxRate: '14.00', branch: { name: 'Audit' }, payments: [{ status: 'completed', amount: '114.00', createdAt: new Date('2026-11-16T10:00:00Z') }] }]
  } }) })
  const vat = await getVatReport(owner)
  assert.equal(vat.netCollectedVat, 14)
  assert.equal(vat.totalRefundedVat, 0)
  assert.equal('refunds' in vatSelect, false)
  console.log('CONFIRMED: VAT still reports 14.00 as collected for a payment whose new-model completed refund is not read')

  const requestedAt = new Date('2026-11-15T10:00:00Z')
  const executedAt = new Date('2026-11-16T10:00:00Z')
  let refundFilter: any
  state.prisma = strict({
    payment: strict({ groupBy: async () => [] }),
    refund: strict({ groupBy: async ({ where }: any) => {
      refundFilter = where
      return requestedAt >= where.createdAt.gte && requestedAt < where.createdAt.lt ? [{ status: 'COMPLETED', _sum: { amount: '40.00' } }] : []
    } }),
  })
  const stats = await getCollectedStatsWithRefunds(owner, new Date('2026-11-16T00:00:00Z'), new Date('2026-11-17T00:00:00Z'))
  assert.equal(stats.refundedCentsFromRefunds, 0)
  assert.ok(executedAt >= refundFilter.createdAt.gte && executedAt < refundFilter.createdAt.lt)
  assert.equal('executedAt' in refundFilter, false)
  console.log('CONFIRMED: an executed-today refund requested yesterday is omitted from today and backdated to its request day')

  // The owner date picker uses UTC midnight, unlike the Cairo business calendar.
  invoiceQueries = []
  state.prisma = strict({
    order: strict({ findMany: async (query: any) => { invoiceQueries.push(query); return [] } }),
    payment: strict({ findMany: async (query: any) => { paymentQuery = query; return [] } }),
    shift: strict({ findMany: async () => [] }), financialMovement: strict({ findMany: async () => [] }),
    cafeBranch: strict({ findMany: async () => [], findFirst: async () => ({ id: 1n }) }),
  })
  await getOwnerFinanceWorkspace(owner, { from: '2026-11-16', to: '2026-11-16' })
  const earlyCairoPayment = new Date('2026-11-15T22:30:00Z') // 00:30 in Cairo on 16 November
  assert.equal(paymentQuery.where.createdAt.gte.toISOString(), '2026-11-16T00:00:00.000Z')
  assert.ok(earlyCairoPayment < paymentQuery.where.createdAt.gte)
  console.log('CONFIRMED: date-filtered owner finance excludes 00:30 Cairo sales from the chosen business day')

  // Capture the write boundary, then deliberately abort before inventory/data writes.
  let created: any = null
  const stop = new Error('CAPTURE_ONLY_NO_WRITE')
  const product = { id: 10n, name: 'Coffee', price: '100.00', variants: [], optionAssignments: [{ productOption: { id: 1n, isRequired: true, minSelections: 1, maxSelections: 1, type: 'single', values: [{ id: 2n, isActive: true }] } }] }
  const tx = strict({
    $queryRaw: async () => [{ total: '100.00', status: 'preparing', discount_type: null, discount_value: '0', tax_rate: '0' }],
    $executeRaw: async () => 0,
    payment: strict({ aggregate: async () => ({ _sum: { amount: '0' } }) }),
    financialOperation: strict({ findUnique: async () => null }),
    product: strict({ findFirst: async () => product }),
    orderItem: strict({ create: async ({ data }: any) => { created = data; throw stop } }),
  })
  state.prisma = strict({ order: strict({ findUnique: async () => ({ branchId: 1n }) }), $transaction: async (callback: any) => callback(tx) })
  const input = { action: 'add', productId: '10', quantity: 1, idempotencyKey: 'audit-invoice-add-1' }
  await assert.rejects(editOpenInvoice(owner, '1', input), error => error === stop)
  assert.equal(created.unitPrice, '100.00')
  assert.equal(created.optionsSnapshot, undefined)
  console.log('CONFIRMED: adding an invoice item reaches the write boundary without its required modifier')
  created = null
  await assert.rejects(editOpenInvoice(owner, '1', { ...input, modifierSelections: [{ groupId: '1', valueIds: ['2'] }] }), (error: any) => error.status === 400)
  assert.equal(created, null)
  console.log('CONFIRMED: supplying the required modifier is rejected because invoice-add projects no group isActive field')

  const { createPosOrder } = await import('../../../src/lib/staff-pos-write')
  let createdOrder: any = null
  state.prisma = strict({
    cafeTable: strict({ findUnique: async () => ({ id: 1n, branchId: 1n }), findFirst: async () => ({ id: 1n }) }),
    product: strict({ findMany: async () => [{ id: 10n, name: 'Tax-configured product', price: '100.00', taxRate: '14.00', variants: [], optionAssignments: [] }] }),
    $transaction: async (callback: any) => callback(strict({ order: strict({ create: async ({ data }: any) => { createdOrder = data; throw stop } }) })),
  })
  await assert.rejects(createPosOrder(owner, { orderType: 'takeaway', tableId: '1', items: [{ productId: '10', qty: 1 }] }), error => error === stop)
  assert.equal(createdOrder.taxAmount, '0')
  assert.equal(createdOrder.taxRate, undefined)
  assert.equal(createdOrder.total, '100.00')
  console.log('CONFIRMED: configured 14% product tax produces a zero-tax POS order and no tax-rate snapshot')

  const { getReportsSummary } = await import('../../../src/lib/staff-reports')
  state.prisma = strict({
    order: strict({ findMany: async () => [], groupBy: async () => [] }),
    orderItem: strict({ groupBy: async () => [] }),
    payment: strict({ groupBy: async ({ by }: any) => by.includes('method') ? [{ status: 'completed', method: 'cash', _sum: { amount: '100.00' } }] : [{ orderId: 1n }] }),
    refund: strict({ groupBy: async () => [{ status: 'COMPLETED', _sum: { amount: '40.00' } }] }),
  })
  const report = await getReportsSummary(owner, '7')
  assert.equal(report.totalRevenue, 60)
  assert.equal(report.byMethod[0].value, 100)
  assert.equal(report.avgCollectedPerPaidOrder, 100)
  console.log('CONFIRMED: report net collected is 60 but its claimed matching method sum and average are both 100')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
