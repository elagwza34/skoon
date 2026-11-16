/**
 * Read-only payment audit reproducer. Run from the repository root:
 * node --import tsx docs/audits/financial-2026-11-16/payments-offline-reproducer.ts
 *
 * Every Prisma operation uses an in-memory double. No database is constructed.
 * The concurrent case demonstrates an allowed application interleaving, not a
 * real PostgreSQL concurrency test. Schema inspection separately confirms the
 * absence of a unique (branch_id, method, transaction_ref) constraint.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import net from 'node:net'
import tls from 'node:tls'
import ts from 'typescript'

async function main() {
  // Refuse socket creation even if a future import accidentally reaches a client.
  const forbidden = () => { throw new Error('Network forbidden in this offline audit') }
  net.Socket.prototype.connect = forbidden as typeof net.Socket.prototype.connect
  tls.connect = forbidden as typeof tls.connect
  process.env.DATABASE_URL = 'postgresql://audit:audit@127.0.0.1:1/audit_forbidden'
  process.env.DIRECT_URL = process.env.DATABASE_URL
  process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL
  const state = globalThis as typeof globalThis & { prisma: unknown }
  state.prisma = {}

  const paymentsModule = await import('../../../src/lib/staff-payments-write')
  const { getRefunds, confirmElectronicPayment, paymentCollectionSchema } = paymentsModule
  const { buildPaymentRequestPayload } = await import('../../../src/lib/payment-request')
  const owner = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' as const, branchId: null, permissions: [], name: 'Owner', email: null }
  const cashier = { ...owner, role: 'cashier' as const, branchId: '1' }

  let queriedBranch: bigint | undefined
  state.prisma = {
    refund: { findMany: async ({ where }: any) => {
      queriedBranch = where.branchId
      return [{ id: 20n, orderId: 21n, paymentId: 22n, amount: '100.00', method: 'cash', status: 'COMPLETED' }]
    } },
    order: { findMany: async () => [{ id: 21n, orderNumber: 'OTHER-BRANCH' }] },
  }
  const leaked = await getRefunds(cashier, { branchId: '2' })
  assert.equal(queriedBranch, 2n)
  assert.equal(leaked[0].orderNumber, 'OTHER-BRANCH')
  console.log('CONFIRMED: branch-1 cashier can select branch-2 refunds')

  const input = { method: 'instapay', electronicPaymentConfirmed: true, externalTransactionReference: 'bank-transfer-1', idempotencyKey: 'electronic-retry-1' }
  const fingerprint = createHash('sha256').update(JSON.stringify({ orderId: '1', method: input.method, externalTransactionReference: input.externalTransactionReference })).digest('hex')
  let replayLookups = 0
  state.prisma = {
    order: { findUnique: async () => ({ id: 1n, branchId: 1n, orderNumber: 'A', status: 'served', paymentStatus: 'paid' }) },
    financialOperation: { findUnique: async () => { replayLookups++; return { fingerprint, result: { paymentId: '1' } } } },
  }
  await assert.rejects(confirmElectronicPayment(owner, '1', input), (error: any) => error.status === 409)
  assert.equal(replayLookups, 0)
  console.log('CONFIRMED: electronic retry rejects before consulting its matching durable operation')

  assert.equal(paymentCollectionSchema.safeParse(buildPaymentRequestPayload('instapay', '100', true)).success, false)
  assert.equal(paymentCollectionSchema.safeParse(buildPaymentRequestPayload('mobile_wallet', '100', true)).success, false)
  console.log('CONFIRMED: the three-argument POS electronic payload fails the production schema')

  const orders = new Map([
    ['1', { id: 1n, branchId: 1n, orderNumber: 'A', total: 100, status: 'served', paymentStatus: 'unpaid' }],
    ['2', { id: 2n, branchId: 1n, orderNumber: 'B', total: 100, status: 'served', paymentStatus: 'unpaid' }],
  ])
  const collected: any[] = []
  let reachedDuplicateCheck = 0
  let release!: () => void
  const preflightGate = new Promise<void>((resolve) => { release = resolve })
  const client: any = {
    order: {
      findUnique: async ({ where }: any) => ({ ...orders.get(String(where.id))! }),
      update: async ({ where, data }: any) => Object.assign(orders.get(String(where.id))!, data),
    },
    payment: {
      findFirst: async () => { if (++reachedDuplicateCheck === 2) release(); await preflightGate; return null },
      aggregate: async ({ where }: any) => ({ _sum: { amount: collected.filter((row) => row.orderId === where.orderId).reduce((sum, row) => sum + Number(row.amount), 0) } }),
      create: async ({ data }: any) => { const row = { ...data, id: BigInt(collected.length + 1) }; collected.push(row); return row },
    },
    user: { findMany: async () => [] },
    auditLog: { create: async () => ({}) },
    $queryRaw: async (_strings: TemplateStringsArray, ...values: any[]) => {
      const order = orders.get(String(values[0]))!
      return [{ total: order.total, status: order.status, payment_status: order.paymentStatus }]
    },
    $transaction: async (body: (tx: any) => Promise<unknown>) => body(client),
  }
  state.prisma = client
  const sameReference = { method: 'instapay', electronicPaymentConfirmed: true, externalTransactionReference: 'one-bank-transfer' }
  await Promise.all([confirmElectronicPayment(owner, '1', sameReference), confirmElectronicPayment(owner, '2', sameReference)])
  assert.equal(collected.length, 2)
  assert.equal(collected[0].transactionRef, collected[1].transactionRef)
  assert.equal(orders.get('1')!.paymentStatus, 'paid')
  assert.equal(orders.get('2')!.paymentStatus, 'paid')
  console.log('CONFIRMED APPLICATION INTERLEAVING: one external reference settles two different orders')

  // Execute the actual route after TypeScript transpilation, with all imports
  // replaced. This avoids Next cookie state and never calls a live service.
  const source = readFileSync('src/app/api/staff/orders/[id]/pay/route.ts', 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  let lifecycleCalls = 0
  const routeExports: any = {}
  const mockedRequire = (name: string) => {
    if (name === 'next/server') return { NextResponse: { json: (body: unknown, init: any) => ({ body, status: init.status }) } }
    if (name === '@/lib/session') return { getStaffSession: async () => ({ ...cashier, role: 'manager' }) }
    if (name === '@/lib/staff-payments-write') return { ...paymentsModule, decideRefund: async () => { lifecycleCalls++; return {} }, executeRefund: async () => { lifecycleCalls++; return {} } }
    if (name === '@/lib/financial-shift-lock') return { FinancialShiftLockError: class extends Error {} }
    if (name === '@/lib/staff-invoices') return { getCashierInvoices: async () => [] }
    if (name === '@/lib/payment-request') return { paymentServiceInputFromRequest: () => ({}) }
    throw new Error(`Unexpected import: ${name}`)
  }
  new Function('require', 'exports', 'module', compiled)(mockedRequire, routeExports, { exports: routeExports })
  for (const action of ['refund_decide', 'refund_execute']) {
    const response = await routeExports.POST({ json: async () => ({ action, refundId: '3', approve: true }), headers: new Headers() }, { params: Promise.resolve({ id: '1' }) })
    assert.equal(response.status, 403)
  }
  assert.equal(lifecycleCalls, 0)
  console.log('CONFIRMED: manager refund approval/execution HTTP requests fail before lifecycle dispatch')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
