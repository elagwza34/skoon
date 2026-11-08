/** Opt-in real PostgreSQL suite. No dotenv, migration, seed or production fallback.
 * Must be independently provisioned and verified before setting the ACK. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { StaffSession } from '../src/lib/session'

const target = process.env.SKOON_REFUND_TEST_DATABASE_URL
function isolated() {
  if (!target || process.env.SKOON_REFUND_TEST_ACK !== 'isolated-local-test-only') return false
  try {
    const u = new URL(target)
    return ['postgres:', 'postgresql:'].includes(u.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && u.pathname === '/skoon_refund_test' && [...u.searchParams.keys()].every((k) => k === 'schema') && (!u.searchParams.has('schema') || u.searchParams.get('schema') === 'public')
  } catch { return false }
}

test('cash refund PostgreSQL suite (verified isolated local DB only)', { skip: isolated() ? false : 'BLOCKED: isolated skoon_refund_test not verified; no connection attempted' }, async (t) => {
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: target! } } })
  ;(globalThis as unknown as { prisma: unknown }).prisma = db
  const payments = await import('../src/lib/staff-payments-write')
  const shifts = await import('../src/lib/staff-shifts')
  const branches: bigint[] = []
  try {
    const roles = await db.role.findMany({ where: { slug: { in: ['cashier', 'manager'] } } })
    const roleId = (slug: string) => { const row = roles.find((r) => r.slug === slug); assert.ok(row, 'Existing application schema/roles required; no seed allowed'); return row.id }
    const branch = await db.cafeBranch.create({ data: { code: 'RF-' + randomUUID().slice(0, 8), name: 'Isolated refund tests', timezone: 'Africa/Cairo' } }); branches.push(branch.id)
    const table = await db.cafeTable.create({ data: { branchId: branch.id, number: 'R1', publicToken: randomUUID().replaceAll('-', '').slice(0, 16) } })
    async function actor(role: 'cashier' | 'manager' = 'cashier'): Promise<StaffSession> {
      const id = randomUUID(); await db.user.create({ data: { id, name: 'Refund test', roleId: roleId(role), branchId: branch.id, isActive: true } })
      return { id, name: role, email: null, role, branchId: String(branch.id), permissions: ['orders.payment', 'orders.refund'] }
    }
    const manager = await actor('manager')
    async function sale(method: 'cash' | 'card' = 'cash') {
      const cashier = await actor(), recipient = await actor()
      const opened = await shifts.openShift(cashier, { openingCash: method === 'cash' ? 0 : 100 })
      const order = await db.order.create({ data: { branchId: branch.id, cafeTableId: table.id, orderNumber: 'RF' + randomUUID().replaceAll('-', '').slice(0, 17), orderRef: randomUUID().replaceAll('-', '').slice(0, 24), itemsSubtotal: 100, total: 100, source: 'pos', orderType: 'takeaway', status: 'served', paymentStatus: 'unpaid', shiftId: BigInt(opened.id) } })
      const result = method === 'cash'
        ? await payments.finalizeOrderPayment(cashier, String(order.id), { method, received: 100, idempotencyKey: randomUUID() })
        : await payments.confirmElectronicPayment(cashier, String(order.id), { method, electronicPaymentConfirmed: true, externalTransactionReference: randomUUID(), idempotencyKey: randomUUID() })
      async function request(amount: number, approve = true) {
        const refund = await payments.requestRefund(cashier, String(order.id), { orderId: String(order.id), paymentId: result.paymentId, amount, reason: 'Isolated test return', idempotencyKey: randomUUID() })
        if (approve) await payments.decideRefund(manager, { refundId: refund.refundId, approve: true })
        return refund.refundId
      }
      const cash = async () => {
        const row = await db.shift.findUniqueOrThrow({ where: { id: BigInt(opened.id) } })
        return (await shifts.readShiftCashState(db, row)).expectedCash
      }
      return { cashier, recipient, opened, order, request, cash, result }
    }
    await t.test('real collection then full/partial/two partial cash refunds reconcile', async () => {
      for (const amounts of [[100], [30], [30, 20]]) {
        const f = await sale(); assert.equal(await f.cash(), 100)
        for (const amount of amounts) await payments.executeRefund(f.cashier, { refundId: await f.request(amount), idempotencyKey: randomUUID() })
        assert.equal(await f.cash(), 100 - amounts.reduce((a, b) => a + b, 0))
      }
    })
    await t.test('requested, approved and cancelled refunds do not affect till', async () => {
      const f = await sale(); const id = await f.request(30, false); assert.equal(await f.cash(), 100)
      await payments.decideRefund(manager, { refundId: id, approve: true }); assert.equal(await f.cash(), 100)
      await payments.cancelRefund(f.cashier, { refundId: id }); assert.equal(await f.cash(), 100)
      await assert.rejects(payments.executeRefund(f.cashier, { refundId: id }))
    })
    await t.test('electronic refund has no till ledger movement', async () => {
      const f = await sale('card'); const id = await f.request(30)
      await payments.executeRefund(manager, { refundId: id, externalReference: randomUUID(), evidenceNote: 'Isolated verification', idempotencyKey: randomUUID() })
      assert.equal(await f.cash(), 100)
      assert.equal(await db.financialMovement.count({ where: { branchId: branch.id, type: 'cash_refund', metadata: { path: ['refundId'], equals: id } } }), 0)
    })
    await t.test('later shift and different cashier carry disbursement, original close stays frozen', async () => {
      const f = await sale(); const id = await f.request(30)
      await shifts.closeShift(f.cashier, f.opened.id, { closingCash: 100, handoverRecipientId: f.recipient.id })
      const prior = await db.shift.findUniqueOrThrow({ where: { id: BigInt(f.opened.id) } })
      const other = await actor(); const next = await shifts.openShift(other, { openingCash: 100 })
      await payments.executeRefund(other, { refundId: id, idempotencyKey: randomUUID() })
      const row = await db.shift.findUniqueOrThrow({ where: { id: BigInt(next.id) } })
      assert.equal((await shifts.readShiftCashState(db, row)).expectedCash, 70)
      assert.deepEqual(await db.shift.findUniqueOrThrow({ where: { id: prior.id } }), prior)
      const movement = await db.financialMovement.findFirstOrThrow({ where: { branchId: branch.id, type: 'cash_refund', sourceShiftId: row.id } })
      assert.equal(movement.actorId, other.id)
    })
    await t.test('concurrent duplicates with one key and another key cannot disburse twice', async () => {
      const f = await sale(); const id = await f.request(30); const input = { refundId: id, idempotencyKey: randomUUID() }
      const [a, b] = await Promise.all([payments.executeRefund(f.cashier, input), payments.executeRefund(f.cashier, input)])
      assert.deepEqual(a, b); await assert.rejects(payments.executeRefund(f.cashier, { refundId: id, idempotencyKey: randomUUID() }))
      assert.equal(await f.cash(), 70)
      assert.equal(await db.financialMovement.count({ where: { branchId: branch.id, sourceShiftId: BigInt(f.opened.id), type: 'cash_refund' } }), 1)
    })
    await t.test('source payment lock prevents concurrent over-reservation', async () => {
      const f = await sale()
      const results = await Promise.allSettled([f.request(60), f.request(60)])
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    })
    await t.test('execute versus cancel has one winner', async () => {
      const f = await sale(); const id = await f.request(30)
      const results = await Promise.allSettled([payments.executeRefund(f.cashier, { refundId: id }), payments.cancelRefund(f.cashier, { refundId: id })])
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
      const row = await db.refund.findUniqueOrThrow({ where: { id: BigInt(id) } })
      assert.equal(await f.cash(), row.status === 'COMPLETED' ? 70 : 100)
    })
    await t.test('refund versus close freezes one consistent cash outcome', async () => {
      const f = await sale(); const id = await f.request(30)
      let acquired!: () => void; const ready = new Promise<void>((r) => { acquired = r })
      let release!: () => void; const gate = new Promise<void>((r) => { release = r })
      const blocker = db.$transaction(async (tx) => {
        const { lockAndReadShift } = await import('../src/lib/financial-shift-lock')
        await lockAndReadShift(tx, BigInt(f.opened.id)); acquired(); await gate
      })
      await ready
      const close = shifts.closeShift(f.cashier, f.opened.id, { closingCash: 100, handoverRecipientId: f.recipient.id })
      const execute = payments.executeRefund(f.cashier, { refundId: id })
      // Both use the same shift lock. The allowed outcomes are atomic: close
      // freezes 100 before execution, or freezes 70 after successful execution.
      release(); await blocker
      const [closed, executed] = await Promise.allSettled([close, execute])
      assert.equal(closed.status, 'fulfilled')
      const row = await db.shift.findUniqueOrThrow({ where: { id: BigInt(f.opened.id) } })
      assert.equal(row.expectedCash.toFixed(2), executed.status === 'fulfilled' ? '70.00' : '100.00')
      const refund = await db.refund.findUniqueOrThrow({ where: { id: BigInt(id) } })
      assert.equal(refund.status, executed.status === 'fulfilled' ? 'COMPLETED' : 'APPROVED')
    })
    await t.test('cross-branch execution and over-refund reject; ledger/history preserved', async () => {
      const f = await sale(); const id = await f.request(30)
      await assert.rejects(payments.executeRefund({ ...f.cashier, branchId: '0' }, { refundId: id }))
      await assert.rejects(f.request(101))
      const ledger = await db.financialMovement.findMany({ where: { branchId: branch.id } })
      const audits = await db.auditLog.findMany({ where: { branchId: branch.id } })
      await payments.executeRefund(f.cashier, { refundId: id })
      assert.deepEqual(await db.financialMovement.findMany({ where: { id: { in: ledger.map((r) => r.id) } } }), ledger)
      assert.deepEqual(await db.auditLog.findMany({ where: { id: { in: audits.map((r) => r.id) } } }), audits)
      const closed = await shifts.closeShift(f.cashier, f.opened.id, { closingCash: 70, handoverRecipientId: f.recipient.id })
      assert.equal(closed.expectedCash, '70.00'); assert.equal(closed.cashDifference, '0.00')
      const handover = await db.cashHandover.findFirstOrThrow({ where: { fromShiftId: BigInt(f.opened.id) } })
      assert.equal(handover.amount.toFixed(2), '70.00')
    })
  } finally {
    if (branches.length) {
      const scope = { branchId: { in: branches } }
      await db.auditLog.deleteMany({ where: scope }); await db.notification.deleteMany({ where: { order: { branchId: { in: branches } } } })
      await db.financialOperation.deleteMany({ where: scope }); await db.cashHandover.deleteMany({ where: scope })
      await db.financialMovement.deleteMany({ where: scope }); await db.refund.deleteMany({ where: scope })
      await db.payment.deleteMany({ where: scope }); await db.order.deleteMany({ where: scope })
      await db.shift.deleteMany({ where: scope }); await db.cafeTable.deleteMany({ where: scope })
      await db.user.deleteMany({ where: scope }); await db.cafeBranch.deleteMany({ where: { id: { in: branches } } })
    }
    await db.$disconnect()
  }
})
