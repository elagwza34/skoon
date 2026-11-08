/** Service transaction doubles; no sockets/data fixtures. NOT PostgreSQL concurrency evidence. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Prisma } from '@prisma/client'
import { executeRefund, requestRefund, cancelRefund, refundRequestSchema } from '../src/lib/staff-payments-write'
import { readShiftCashState, closeShift } from '../src/lib/staff-shifts'
import type { StaffSession } from '../src/lib/session'

const cashierId = '11111111-1111-4111-8111-111111111111'
const nextId = '22222222-2222-4222-8222-222222222222'
const actor = (id = cashierId, role: StaffSession['role'] = 'cashier', branchId = '1'): StaffSession => ({ id, role, branchId, permissions: ['orders.payment'], name: role, email: null })
const d = (n: unknown) => new Prisma.Decimal(String(n))

function fixture(amount = 30, method = 'cash') {
  // any is confined to test doubles, never production financial types.
  const s: any = {
    shift: { id: 10n, branchId: 1n, cashierId, openingCash: d(0), expectedCash: d(0), closingCash: d(0), cashDifference: d(0), openedAt: new Date(), closedAt: null, status: 'open', openBy: 'Cashier' },
    payment: { id: 20n, branchId: 1n, orderId: 2n, shiftId: 10n, method, status: 'completed', amount: d(100) },
    refunds: [{ id: 3n, branchId: 1n, orderId: 2n, paymentId: 20n, amount: d(amount), method, status: 'APPROVED', requestedById: nextId }],
    movements: [{ id: 1n, branchId: 1n, sourceShiftId: 10n, type: 'historical', amount: d(7), status: 'posted' }],
    audits: [{ action: 'historical' }], operations: [], handovers: [], failAudit: false, locks: [],
  }
  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => typeof v === 'object' && v !== null && 'in' in v ? (v as any).in.includes(row[k]) : row[k] === v)
  const tx: any = {
    $executeRaw: async () => 1, $executeRawUnsafe: async () => 1,
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join(''); s.locks.push(sql.includes('FROM shifts') ? 'shift' : sql.includes('FROM payments') ? 'payment' : 'refund')
      if (sql.includes('FROM shifts')) return [{ ...s.shift }]
      if (sql.includes('FROM payments')) return values[0] === s.payment.id && values[1] === s.payment.branchId ? [{ id: s.payment.id }] : []
      const r = s.refunds.find((r: any) => r.id === values[0] && r.paymentId === values[1] && r.branchId === values[2]); return r ? [{ id: r.id }] : []
    },
    shift: { findFirst: async ({ where }: any) => s.shift.cashierId === where.cashierId && s.shift.branchId === where.branchId && s.shift.status === 'open' ? { ...s.shift } : null, findUnique: async () => ({ ...s.shift }), updateMany: async ({ where, data }: any) => { if (!matches(s.shift, where)) return { count: 0 }; Object.assign(s.shift, data); return { count: 1 } } },
    payment: { findUnique: async () => ({ ...s.payment }), findMany: async ({ where }: any) => matches(s.payment, where) ? [{ ...s.payment }] : [] },
    refund: {
      findUnique: async ({ where }: any) => { const r = s.refunds.find((r: any) => r.id === where.id); return r ? { ...r } : null },
      aggregate: async ({ where }: any) => ({ _sum: { amount: d(s.refunds.filter((r: any) => matches(r, where)).reduce((n: number, r: any) => n + Number(r.amount), 0)) } }),
      updateMany: async ({ where, data }: any) => { const rows = s.refunds.filter((r: any) => matches(r, where)); rows.forEach((r: any) => Object.assign(r, data)); return { count: rows.length } },
      create: async ({ data }: any) => { const row = { ...data, id: BigInt(s.refunds.length + 3), amount: d(data.amount) }; s.refunds.push(row); return row },
    },
    financialMovement: {
      aggregate: async ({ where }: any) => ({ _sum: { amount: d(s.movements.filter((m: any) => matches(m, where)).reduce((n: number, m: any) => n + Number(m.amount), 0)) } }),
      findFirst: async ({ where }: any) => s.movements.find((m: any) => m.type === where.type && m.branchId === where.branchId && m.metadata?.refundId === where.metadata?.equals) ?? null,
      findMany: async () => [],
      create: async ({ data }: any) => { const row = { ...data, id: BigInt(s.movements.length + 1), amount: d(data.amount) }; s.movements.push(row); return row },
    },
    financialOperation: { findUnique: async ({ where }: any) => s.operations.find((r: any) => matches(r, where.branchId_actorId_operationType_idempotencyKey)) ?? null, create: async ({ data }: any) => { s.operations.push(data); return data } },
    auditLog: { create: async ({ data }: any) => { if (s.failAudit) throw Error('audit failure'); s.audits.push(data); return data } },
    order: { findUnique: async () => ({ id: 2n, branchId: 1n, orderNumber: 'TEST', paymentStatus: 'paid' }), findMany: async () => [] },
    user: { findFirst: async () => ({ id: nextId, name: 'Recipient' }) },
    cafeBranch: { findUnique: async () => ({ timezone: 'Africa/Cairo' }) },
    cashHandover: { create: async ({ data }: any) => { const row = { ...data, id: 9n }; s.handovers.push(row); return row } },
  }
  let queue = Promise.resolve()
  const client = { ...tx, $transaction: (fn: (tx: any) => Promise<any>) => {
    const result = queue.then(async () => {
      const before = { shift: { ...s.shift }, refunds: s.refunds.map((r: any) => ({ ...r })), movements: [...s.movements], audits: [...s.audits], operations: [...s.operations], handovers: [...s.handovers] }
      try { return await fn(tx) } catch (e) { Object.assign(s, before); throw e }
    }); queue = result.then(() => undefined, () => undefined); return result
  } }
  ;(globalThis as any).prisma = client
  return { s, client, cash: async () => (await readShiftCashState(client, s.shift)).expectedCash }
}
const execute = (id = '3', key = 'refund-execute-01', who = actor()) => executeRefund(who, { refundId: id, idempotencyKey: key })

test('refund: full cash refund consumes collected cash, not stale expectedCash', async () => { const f = fixture(100); await execute(); assert.equal(await f.cash(), 0); assert.equal(f.s.movements[1].amount.toFixed(2), '100.00'); assert.deepEqual(f.s.locks.slice(0, 3), ['shift', 'payment', 'refund']) })
test('refund: partial cash refund leaves 70 from 100', async () => { const f = fixture(); await execute(); assert.equal(await f.cash(), 70) })
test('refund: two partial cash refunds deduct each once', async () => { const f = fixture(); f.s.refunds.push({ ...f.s.refunds[0], id: 4n, amount: d(20) }); await execute(); await execute('4', 'refund-execute-02'); assert.equal(await f.cash(), 50) })
test('refund: electronic execution requires evidence and never affects physical till', async () => { const f = fixture(30, 'card'); f.s.shift.openingCash = d(100); await assert.rejects(execute()); await assert.rejects(execute('3', 'refund-execute-01', actor(nextId, 'manager'))); await executeRefund(actor(nextId, 'manager'), { refundId: '3', externalReference: 'bank-123', evidenceNote: 'Operator verified', idempotencyKey: 'electronic-01' }); assert.equal(await f.cash(), 100); assert.equal(f.s.movements.length, 1) })
for (const status of ['REQUESTED', 'APPROVED', 'CANCELLED']) test('refund: unexecuted ' + status + ' does not reduce till', async () => { const f = fixture(); f.s.refunds[0].status = status; assert.equal(await f.cash(), 100); if (status !== 'APPROVED') await assert.rejects(execute()); assert.equal(f.s.movements.length, 1) })
test('refund: later executing shift does not change original shift cash', async () => { const f = fixture(); f.s.shift.id = 11n; f.s.shift.openingCash = d(100); await execute(); assert.equal(await f.cash(), 70); assert.equal((await readShiftCashState(f.client, { id: 10n, branchId: 1n, openingCash: 0 })).expectedCash, 100) })
test('refund: different authorized cashier owns execution attribution', async () => { const f = fixture(); f.s.shift.cashierId = nextId; await execute('3', 'refund-execute-01', actor(nextId)); assert.equal(f.s.movements[1].actorId, nextId); assert.equal(f.s.refunds[0].executedById, nextId) })
test('refund: durable retry after shift close returns result without another movement', async () => { const f = fixture(); const a = await execute(); f.s.shift.status = 'closed'; assert.deepEqual(await execute(), a); assert.equal(f.s.movements.length, 2) })
test('refund: competing execution and cancellation serialize in transaction double only', async () => { const f = fixture(); const results = await Promise.allSettled([execute(), cancelRefund(actor(nextId), { refundId: '3' })]); assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); assert.ok(['COMPLETED', 'CANCELLED'].includes(f.s.refunds[0].status)); assert.equal(f.s.movements.length, f.s.refunds[0].status === 'COMPLETED' ? 2 : 1) })
test('refund: duplicate concurrent execution posts once in transaction double only', async () => { const f = fixture(); const [a, b] = await Promise.all([execute(), execute()]); assert.deepEqual(a, b); assert.equal(f.s.movements.length, 2); assert.equal(f.s.audits.length, 2) })
test('refund: closed shift cannot disburse even if preflight observed it open', async () => { const f = fixture(); const read = f.client.shift.findFirst; f.client.shift.findFirst = async (args: any) => { const row = await read(args); f.s.shift.status = 'closed'; return row }; await assert.rejects(execute()); assert.equal(f.s.movements.length, 1); assert.equal(f.s.refunds[0].status, 'APPROVED') })
test('refund: cross-branch attempt leaves records unchanged', async () => { const f = fixture(); await assert.rejects(execute('3', 'refund-execute-01', actor(cashierId, 'cashier', '2'))); assert.equal(f.s.movements.length, 1) })
test('refund: over-refund and sub-cent requests are rejected', async () => { const f = fixture(101); await assert.rejects(execute()); assert.equal(f.s.movements.length, 1); assert.equal(refundRequestSchema.safeParse({ orderId: '2', paymentId: '20', amount: 0.001, reason: 'reason' }).success, false) })
test('refund: payment lock prevents over-reserving partial requests in transaction double', async () => { const f = fixture(); f.s.refunds = []; const input = { orderId: '2', paymentId: '20', amount: 60, reason: 'Customer return' }; const r = await Promise.allSettled([requestRefund(actor(), '2', { ...input, idempotencyKey: 'request-001' }), requestRefund(actor(), '2', { ...input, idempotencyKey: 'request-002' })]); assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1) })
test('refund: close/handover uses 70 after refund and preserves historical ledger', async () => { const f = fixture(); const old = { ...f.s.movements[0] }; await execute(); const closed = await closeShift(actor(), '10', { closingCash: 70, handoverRecipientId: nextId }); assert.equal(closed.expectedCash, '70.00'); assert.equal(closed.cashDifference, '0.00'); assert.equal(closed.cashOut, '30.00'); assert.equal(f.s.handovers[0].amount, '70.00'); assert.deepEqual(f.s.movements[0], old); assert.equal(f.s.audits[0].action, 'historical'); await assert.rejects(execute('3', 'different-key')); assert.equal(f.s.movements.length, 2) })
test('refund: audit failure rolls back completion and cash movement in transaction double', async () => { const f = fixture(); f.s.failAudit = true; await assert.rejects(execute(), /audit failure/); assert.equal(f.s.refunds[0].status, 'APPROVED'); assert.equal(f.s.movements.length, 1); assert.equal(await f.cash(), 100) })
test('refund: operational withdrawals reduce available cash before disbursement', async () => { const f = fixture(60); f.s.movements.push({ id: 2n, branchId: 1n, sourceShiftId: 10n, type: 'operational_withdrawal', status: 'posted', amount: d(50) }); assert.equal(await f.cash(), 50); await assert.rejects(execute()); assert.equal(f.s.refunds[0].status, 'APPROVED') })
test('refund: non-posted, other-branch and other-shift movements are excluded', async () => { const f = fixture(); const movement = { type: 'cash_refund', sourceAccount: 'CASHIER_TILL', destinationAccount: 'CUSTOMER', amount: d(90), sourceShiftId: 10n, branchId: 1n, status: 'posted' }; f.s.movements.push({ ...movement, status: 'pending' }, { ...movement, branchId: 2n }, { ...movement, sourceShiftId: 11n }); assert.equal(await f.cash(), 100) })
test('refund: mixed electronic collection cannot fund a physical refund', async () => { const f = fixture(60); f.s.payment.amount = d(40); const original = f.client.payment.findMany; f.client.payment.findMany = async (args: any) => [...await original(args), { method: 'card', status: 'completed', amount: d(60) }]; assert.equal(await f.cash(), 40); await assert.rejects(execute()); assert.equal(f.s.movements.length, 1) })
test('refund: existing ledger evidence prevents duplicate disbursement on inconsistent state', async () => { const f = fixture(); f.s.movements.push({ id: 2n, branchId: 1n, sourceShiftId: 10n, type: 'cash_refund', status: 'posted', sourceAccount: 'CASHIER_TILL', destinationAccount: 'CUSTOMER', amount: d(30), metadata: { refundId: '3' } }); await assert.rejects(execute()); assert.equal(f.s.refunds[0].status, 'APPROVED'); assert.equal(f.s.movements.length, 2); assert.equal(await f.cash(), 70) })
