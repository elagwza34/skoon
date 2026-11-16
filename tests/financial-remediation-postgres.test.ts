/** Opt-in acceptance against a newly provisioned local scratch database only. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

const target = process.env.SKOON_REMEDIATION_TEST_DATABASE_URL
function isolated() {
  if (!target || target !== process.env.DATABASE_URL) return false
  const url = new URL(target)
  return url.hostname === '127.0.0.1' && url.pathname === '/skoon_financial_test' && process.env.SKOON_REMEDIATION_TEST_ACK === 'fresh-local-scratch-only'
}

test('financial remediation PostgreSQL concurrency and ledger acceptance', { skip: isolated() ? false : 'Fresh isolated local test database required' }, async t => {
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: target! } } })
  ;(globalThis as any).prisma = db
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const role = await db.role.upsert({ where: { slug: 'owner' }, create: { slug: 'owner', name: 'Owner' }, update: {} })
  const branch = await db.cafeBranch.create({ data: { code: `FIX-${suffix}`, name: 'Isolated financial remediation' } })
  const user = await db.user.create({ data: { id: randomUUID(), branchId: branch.id, roleId: role.id, name: 'Audit owner' } })
  const table = await db.cafeTable.create({ data: { branchId: branch.id, number: '1', publicToken: randomUUID().replaceAll('-', '').slice(0, 16) } })
  const owner = { id: user.id, role: 'owner' as const, branchId: branch.id.toString(), permissions: [], name: user.name, email: null }
  const payments = await import('../src/lib/staff-payments-write')
  const float = await import('../src/lib/staff-float')
  const payroll = await import('../src/lib/staff-payroll-write')
  const order = () => db.order.create({ data: { branchId: branch.id, cafeTableId: table.id, orderNumber: `FIX-${randomUUID().slice(0, 8)}`, orderRef: randomUUID().replaceAll('-', '').slice(0, 24), status: 'served', source: 'pos', itemsSubtotal: '100', total: '100', paymentStatus: 'unpaid' } })
  try {
    await t.test('same bank reference concurrently settles exactly one of two orders', async () => {
      const [one, two] = await Promise.all([order(), order()])
      const input = { method: 'instapay', electronicPaymentConfirmed: true, externalTransactionReference: `BANK-${suffix}` }
      const results = await Promise.allSettled([payments.confirmElectronicPayment(owner, one.id.toString(), input), payments.confirmElectronicPayment(owner, two.id.toString(), input)])
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      const rejection = results.find(result => result.status === 'rejected') as PromiseRejectedResult
      assert.equal(rejection.reason.status, 409)
      assert.equal(await db.payment.count({ where: { branchId: branch.id, transactionRef: input.externalTransactionReference } }), 1)
      const paid = await db.payment.findFirstOrThrow({ where: { branchId: branch.id, transactionRef: input.externalTransactionReference } })
      const other = paid.orderId === one.id ? two : one
      await assert.rejects(db.payment.create({ data: { branchId: branch.id, orderId: other.id, amount: '100', amountDue: '100', method: 'instapay', status: 'completed', transactionRef: input.externalTransactionReference } }), (error: any) => error.code === 'P2002')
    })
    await t.test('concurrent transfer retries post one balanced pair and spent funding cannot be reversed', async () => {
      await db.financialMovement.createMany({ data: [
        { branchId: branch.id, type: 'fixed_float_baseline', amount: '0', sourceAccount: 'OPENING_RECONCILIATION', destinationAccount: 'FIXED_FLOAT', reason: 'Verified fixture baseline' },
        { branchId: branch.id, type: 'main_safe_deposit', amount: '100', sourceAccount: 'CASHIER_TILL', destinationAccount: 'MAIN_SAFE', reason: 'Fixture deposit' },
      ] })
      const key = randomUUID()
      const [first, retry] = await Promise.all([float.transferMainSafeToFixedFloat(owner, 60, 'Fixture transfer', key), float.transferMainSafeToFixedFloat(owner, 60, 'Fixture transfer', key)])
      assert.deepEqual(first, retry)
      assert.equal((await float.getSharedFloatSummary(owner)).available, '60.00')
      assert.equal((await float.getMainSafeSummary(owner)).balance, '40.00')
      await db.financialMovement.create({ data: { branchId: branch.id, type: 'fixed_float_advance', amount: '60', sourceAccount: 'FIXED_FLOAT', destinationAccount: 'CASHIER_ADVANCE', reason: 'Fixture spent funding', actorId: owner.id } })
      await assert.rejects(float.reverseFixedFloatMovement(owner, first.additionId, 'Reverse spent funding'), (error: any) => error.status === 409)
      assert.equal((await float.getSharedFloatSummary(owner)).available, '0.00')
    })
    await t.test('concurrent reviews cannot regress payroll; zero-net line settles and run closes', async () => {
      const period = await db.payrollPeriod.upsert({ where: { startsOn_endsOn: { startsOn: new Date('2026-08-01'), endsOn: new Date('2026-08-30') } }, create: { startsOn: new Date('2026-08-01'), endsOn: new Date('2026-08-30'), createdById: owner.id }, update: {} })
      const run = await db.payrollRun.create({ data: { branchId: branch.id, periodId: period.id, createdById: owner.id } })
      const line = await db.payrollLine.create({ data: { payrollRunId: run.id, employeeId: owner.id, grossAmount: '0', deductionAmount: '0', netAmount: '0', snapshot: {} } })
      const results = await Promise.allSettled([payroll.transitionPayrollRun(owner, run.id, 'review'), payroll.transitionPayrollRun(owner, run.id, 'review')])
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      await payroll.transitionPayrollRun(owner, run.id, 'approve')
      await assert.rejects(payroll.transitionPayrollRun(owner, run.id, 'review'), (error: any) => error.status === 409)
      assert.equal((await db.payrollLine.findUniqueOrThrow({ where: { id: line.id } })).status, 'paid')
      assert.equal(await db.payrollPayment.count({ where: { payrollLineId: line.id } }), 0)
      assert.equal((await payroll.transitionPayrollRun(owner, run.id, 'close')).status, 'closed')
      assert.equal((await db.payrollPeriod.findUniqueOrThrow({ where: {id: period.id} })).status, 'paid')
    })
    await t.test('leading-zero advance IDs share one repayment lock and preserve every cent', async () => {
      const advance = await db.employeeAdvance.create({ data: { branchId: branch.id, employeeId: owner.id, requestedById: owner.id, status: 'approved', amount: '100', reason: 'Verified fixture advance' } })
      const { recordAdvanceRepayment } = await import('../src/lib/staff-hr-financial-write')
      const [one, two] = await Promise.allSettled([
        recordAdvanceRepayment(owner, { advanceId: advance.id.toString(), amount: '60', receiptReference: 'Fixture receipt 1', idempotencyKey: randomUUID() }),
        recordAdvanceRepayment(owner, { advanceId: `0${advance.id}`, amount: '60', receiptReference: 'Fixture receipt 2', idempotencyKey: randomUUID() }),
      ])
      assert.equal([one, two].filter(result => result.status === 'fulfilled').length, 1)
      assert.equal((await db.employeeAdvance.findUniqueOrThrow({where:{id:advance.id}})).repaidAmount.toString(), '60')
    })
    await t.test('legacy unbacked funding cannot be converted into a safe deposit', async () => {
      const before = (await float.getMainSafeSummary(owner)).balance
      const addition = await db.financialMovement.create({ data: { branchId: branch.id, type: 'fixed_float_addition', amount: '100', sourceAccount: 'OPERATIONAL_EXPENSE', destinationAccount: 'FIXED_FLOAT', reason: 'Unbacked legacy fixture' } })
      await assert.rejects(float.reverseFixedFloatMovement(owner, addition.id.toString(), 'Reverse legacy addition'), (error: any) => error.status === 409)
      assert.equal((await float.getMainSafeSummary(owner)).balance, before)
    })
  } finally { await db.$disconnect() }
})
