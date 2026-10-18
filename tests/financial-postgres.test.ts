/**
 * PostgreSQL financial acceptance tests.
 *
 * These are deliberately opt-in. They refuse to connect unless the caller has
 * explicitly supplied the same URL as both DATABASE_URL and
 * SKOON_FINANCIAL_TEST_DATABASE_URL. A non-test-named shared development
 * database additionally requires a one-process explicit acknowledgement. The
 * suite never migrates, drops, or truncates a database; each fixture creates
 * and removes only its own branch.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

const configuredTestUrl = process.env.SKOON_FINANCIAL_TEST_DATABASE_URL
const activeUrl = process.env.DATABASE_URL
const sharedDatabaseAcknowledged = process.env.SKOON_FINANCIAL_ACCEPTANCE_SHARED_DATABASE === 'allow-test-fixtures'

function hasTestIdentity(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return /(^|[_-])(test|ci|sandbox)([_-]|$)/i.test(url.pathname) || /(^|[_-])(test|ci|sandbox)([_-]|$)/i.test(url.searchParams.get('schema') ?? '')
  } catch { return false }
}

const safeDatabase = Boolean(configuredTestUrl && activeUrl && configuredTestUrl === activeUrl && (hasTestIdentity(configuredTestUrl) || sharedDatabaseAcknowledged))
const skip = safeDatabase ? false : 'Set DATABASE_URL and SKOON_FINANCIAL_TEST_DATABASE_URL to the same URL; a shared database additionally requires SKOON_FINANCIAL_ACCEPTANCE_SHARED_DATABASE=allow-test-fixtures.'

test('financial PostgreSQL acceptance suite is explicitly isolated', { skip }, async () => {
  // Dynamic imports ensure an unconfigured invocation cannot initialise Prisma.
  const { prisma } = await import('../src/lib/prisma')
  const float = await import('../src/lib/staff-float')
  const { ROLE } = await import('../src/lib/authz')
  type Session = import('../src/lib/session').StaffSession
  // Roles are application configuration, not fixture data. Do not create or
  // update them on a shared database merely to make a test runnable.
  const roles = await prisma.role.findMany({ where: { slug: { in: [ROLE.MANAGER, ROLE.CASHIER] } }, select: { id: true, slug: true } })
  const managerRole = roles.find((role) => role.slug === ROLE.MANAGER)
  const cashierRole = roles.find((role) => role.slug === ROLE.CASHIER)
  if (!managerRole || !cashierRole) throw new Error('The existing database must have manager and cashier roles')
  const managerRoleId = managerRole.id
  const cashierRoleId = cashierRole.id
  try {
    await prisma.financialMovement.count()
    await prisma.financialOperation.count()
  } catch (error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'unknown'
    throw new Error(`Financial acceptance requires the financial Prisma migrations to be deployed (preflight ${code}). No fixtures were created.`)
  }

  const suffix = randomUUID().replaceAll('-', '')
  const users = {
    manager: randomUUID(), managerTwo: randomUUID(), cashierA: randomUUID(), cashierB: randomUUID(), outsider: randomUUID(),
  }

  async function fixture() {
    const branchIds: bigint[] = []
    try {
      const branch = await prisma.cafeBranch.create({ data: { name: `Financial acceptance ${suffix}`, code: `FIN-${suffix.slice(0, 12)}`, timezone: 'Africa/Cairo' } })
      branchIds.push(branch.id)
      const otherBranch = await prisma.cafeBranch.create({ data: { name: `Other ${suffix}`, code: `OTH-${suffix.slice(0, 12)}`, timezone: 'Africa/Cairo' } })
      branchIds.push(otherBranch.id)
      await prisma.user.createMany({ data: [
        { id: users.manager, roleId: managerRoleId, branchId: branch.id, name: 'Manager' },
        { id: users.managerTwo, roleId: managerRoleId, branchId: branch.id, name: 'Manager Two' },
        { id: users.cashierA, roleId: cashierRoleId, branchId: branch.id, name: 'Cashier A' },
        { id: users.cashierB, roleId: cashierRoleId, branchId: branch.id, name: 'Cashier B' },
        { id: users.outsider, roleId: cashierRoleId, branchId: otherBranch.id, name: 'Outsider' },
      ] })
      const open = await prisma.shift.createManyAndReturn({ data: [
        { branchId: branch.id, cashierId: users.cashierA, openBy: 'Cashier A', status: 'open' },
        { branchId: branch.id, cashierId: users.cashierB, openBy: 'Cashier B', status: 'open' },
        { branchId: otherBranch.id, cashierId: users.outsider, openBy: 'Outsider', status: 'open' },
      ] })
      const manager: Session = { id: users.manager, email: null, name: 'Manager', role: ROLE.MANAGER, branchId: branch.id.toString(), permissions: [] }
      const managerTwo: Session = { id: users.managerTwo, email: null, name: 'Manager Two', role: ROLE.MANAGER, branchId: branch.id.toString(), permissions: [] }
      const cashierA: Session = { id: users.cashierA, email: null, name: 'Cashier A', role: ROLE.CASHIER, branchId: branch.id.toString(), permissions: [] }
      const cashierB: Session = { id: users.cashierB, email: null, name: 'Cashier B', role: ROLE.CASHIER, branchId: branch.id.toString(), permissions: [] }
      const outsider: Session = { id: users.outsider, email: null, name: 'Outsider', role: ROLE.CASHIER, branchId: otherBranch.id.toString(), permissions: [] }
      return { branch, otherBranch, open, manager, managerTwo, cashierA, cashierB, outsider }
    } catch (error) {
      await destroy(branchIds)
      throw error
    }
  }

  async function destroy(branchIds: bigint[]) {
    await prisma.financialOperation.deleteMany({ where: { branchId: { in: branchIds } } })
    await prisma.auditLog.deleteMany({ where: { branchId: { in: branchIds } } })
    await prisma.financialMovement.deleteMany({ where: { branchId: { in: branchIds } } })
    await prisma.shift.deleteMany({ where: { branchId: { in: branchIds } } })
    await prisma.user.deleteMany({ where: { id: { in: Object.values(users) } } })
    await prisma.cafeBranch.deleteMany({ where: { id: { in: branchIds } } })
  }

  async function balance(session: Session) {
    const summary = await float.getSharedFloatSummary(session)
    return { available: Number(summary.available), outstanding: Number(summary.outstanding), summary }
  }
  async function expectFloatError(action: () => Promise<unknown>, status: number) {
    await assert.rejects(action, (error: unknown) => error instanceof float.FloatError && error.status === status)
  }
  const key = (name: string) => `${suffix}-${name}`

  // A/B: baseline, two advances, a linked return, and post-close settlement.
  let f = await fixture()
  try {
    console.log('financial acceptance: baseline, advances, return, settlement')
    await float.establishFixedFloatBaseline(f.manager, { amount: 1000, reason: 'Verified opening cash', confirmed: true, idempotencyKey: key('baseline') })
    const advanceA = await float.recordSharedFloatAdvance(f.cashierA, { amount: 400, reason: 'A advance', idempotencyKey: key('advance-a') }) as { id: string; outstanding: string }
    const advanceB = await float.recordSharedFloatAdvance(f.cashierB, { amount: 200, reason: 'B advance', idempotencyKey: key('advance-b') }) as { id: string; outstanding: string }
    let state = await balance(f.manager)
    assert.deepEqual([state.available, state.outstanding], [400, 600])
    assert.equal(state.available + state.outstanding, 1000)

    const returned = await float.returnSharedFloatAdvance(f.cashierA, { advanceId: advanceA.id, amount: 100, reason: 'Partial return', idempotencyKey: key('return-a') })
    const retried = await float.returnSharedFloatAdvance(f.cashierA, { advanceId: advanceA.id, amount: 100, reason: 'Partial return', idempotencyKey: key('return-a') })
    assert.deepEqual(retried, returned)
    assert.equal(await prisma.financialMovement.count({ where: { branchId: f.branch.id, type: 'fixed_float_return', advanceId: BigInt(advanceA.id) } }), 1)
    await expectFloatError(() => float.returnSharedFloatAdvance(f.cashierA, { advanceId: advanceA.id, amount: 99, reason: 'Changed payload', idempotencyKey: key('return-a') }), 409)
    state = await balance(f.manager)
    assert.deepEqual([state.available, state.outstanding], [500, 500])

    await prisma.shift.update({ where: { id: f.open[0].id }, data: { status: 'closed', closedAt: new Date() } })
    await float.settleSharedFloatAdvance(f.manager, advanceA.id, { amount: 300, reason: 'Manager received cash', idempotencyKey: key('settle-a') })
    state = await balance(f.manager)
    assert.deepEqual([state.available, state.outstanding], [800, 200])
    assert.equal(state.available + state.outstanding, 1000)
    assert.equal(state.summary.advanceDetails.find((x) => x.id === advanceA.id)?.outstanding, '0.00')
    assert.equal(state.summary.advanceDetails.find((x) => x.id === advanceB.id)?.outstanding, '200.00')
  } finally { await destroy([f.branch.id, f.otherBranch.id]) }

  // C/D: identical concurrent return retries create one record; competing
  // return/settlement cannot repay the same advance beyond its remainder.
  f = await fixture()
  try {
    console.log('financial acceptance: idempotency and concurrent repayments')
    await float.establishFixedFloatBaseline(f.manager, { amount: 500, reason: 'Verified opening cash', confirmed: true, idempotencyKey: key('baseline-2') })
    const advance = await float.recordSharedFloatAdvance(f.cashierA, { amount: 400, reason: 'Concurrent advance', idempotencyKey: key('advance-2') }) as { id: string; outstanding: string }
    const same = { advanceId: advance.id, amount: 100, reason: 'Concurrent retry', idempotencyKey: key('concurrent-same') }
    const [first, second] = await Promise.all([float.returnSharedFloatAdvance(f.cashierA, same), float.returnSharedFloatAdvance(f.cashierA, same)])
    assert.deepEqual(first, second)
    assert.equal(await prisma.financialMovement.count({ where: { branchId: f.branch.id, type: 'fixed_float_return', advanceId: BigInt(advance.id) } }), 1)
    await prisma.shift.update({ where: { id: f.open[0].id }, data: { status: 'closed', closedAt: new Date() } })
    const competing = await Promise.allSettled([
      float.settleSharedFloatAdvance(f.manager, advance.id, { amount: 300, reason: 'Settle remainder one', idempotencyKey: key('settle-r1') }),
      float.settleSharedFloatAdvance(f.managerTwo, advance.id, { amount: 300, reason: 'Settle remainder two', idempotencyKey: key('settle-r2') }),
    ])
    assert.equal(competing.filter((x) => x.status === 'fulfilled').length, 1)
    assert.equal(competing.filter((x) => x.status === 'rejected').length, 1)
    const state = await balance(f.manager)
    assert.equal(state.summary.advanceDetails[0].outstanding, '0.00')
    assert.equal(state.available, 500)
  } finally { await destroy([f.branch.id, f.otherBranch.id]) }

  // E/G: account-direction reversals, serialised administrative debits, and
  // operational-till withdrawals never alter the shared fund.
  f = await fixture()
  try {
    console.log('financial acceptance: reversals and concurrent debits')
    await float.establishFixedFloatBaseline(f.manager, { amount: 100, reason: 'Verified opening cash', confirmed: true, idempotencyKey: key('baseline-3') })
    const addition = await float.recordFixedFloatMovement(f.manager, { amount: 50, direction: 'addition', reason: 'Safe top-up', idempotencyKey: key('add') })
    assert.equal((await balance(f.manager)).available, 150)
    await float.reverseFixedFloatMovement(f.manager, addition.id, 'Reverse top-up')
    assert.equal((await balance(f.manager)).available, 100)
    await expectFloatError(() => float.reverseFixedFloatMovement(f.manager, addition.id, 'Duplicate reversal'), 409)
    const withdrawal = await float.recordFixedFloatMovement(f.manager, { amount: 60, direction: 'withdrawal', reason: 'Approved withdrawal', idempotencyKey: key('withdraw') })
    assert.equal((await balance(f.manager)).available, 40)
    await float.reverseFixedFloatMovement(f.manager, withdrawal.id, 'Reverse withdrawal')
    assert.equal((await balance(f.manager)).available, 100)
    await expectFloatError(() => float.recordFixedFloatMovement(f.manager, { amount: 101, direction: 'withdrawal', reason: 'Too large', idempotencyKey: key('too-large') }), 409)
    const debits = await Promise.allSettled([
      float.recordFixedFloatMovement(f.manager, { amount: 60, direction: 'withdrawal', reason: 'Concurrent one', idempotencyKey: key('debit-1') }),
      float.recordFixedFloatMovement(f.manager, { amount: 60, direction: 'withdrawal', reason: 'Concurrent two', idempotencyKey: key('debit-2') }),
    ])
    assert.equal(debits.filter((x) => x.status === 'fulfilled').length, 1)
    assert.equal((await balance(f.manager)).available, 40)
    await float.recordFixedFloatMovement(f.cashierB, { amount: 10, direction: 'withdrawal', reason: 'Till supplies', idempotencyKey: key('operational') })
    assert.equal((await balance(f.manager)).available, 40)
  } finally { await destroy([f.branch.id, f.otherBranch.id]) }

  // F/H: fail closed for legacy history, duplicate baselines, cross-branch
  // denial, and role denial all leave ledger state unchanged.
  f = await fixture()
  try {
    console.log('financial acceptance: baseline rejection and authorization')
    await prisma.financialMovement.create({ data: { branchId: f.branch.id, type: 'fixed_float_addition', amount: '10.00', sourceAccount: 'MAIN_SAFE', destinationAccount: 'FIXED_FLOAT', actorId: users.manager, reason: 'Legacy un-reconciled entry' } })
    await expectFloatError(() => float.establishFixedFloatBaseline(f.manager, { amount: 100, reason: 'Must reject legacy', confirmed: true, idempotencyKey: key('legacy-baseline') }), 409)
    assert.equal(await prisma.financialMovement.count({ where: { branchId: f.branch.id, type: 'fixed_float_baseline' } }), 0)
  } finally { await destroy([f.branch.id, f.otherBranch.id]) }

  f = await fixture()
  try {
    await float.establishFixedFloatBaseline(f.manager, { amount: 100, reason: 'Verified opening cash', confirmed: true, idempotencyKey: key('baseline-4') })
    await expectFloatError(() => float.establishFixedFloatBaseline(f.manager, { amount: 100, reason: 'Duplicate baseline', confirmed: true, idempotencyKey: key('baseline-duplicate') }), 409)
    const advance = await float.recordSharedFloatAdvance(f.cashierA, { amount: 20, reason: 'Branch protected', idempotencyKey: key('advance-4') }) as { id: string; outstanding: string }
    await expectFloatError(() => float.returnSharedFloatAdvance(f.outsider, { advanceId: advance.id, amount: 10, reason: 'Cross branch', idempotencyKey: key('cross-return') }), 404)
    await expectFloatError(() => float.settleSharedFloatAdvance(f.cashierA, advance.id, { amount: 10, reason: 'Cashier settlement', idempotencyKey: key('cashier-settle') }), 403)
  } finally { await destroy([f.branch.id, f.otherBranch.id]); await prisma.$disconnect() }
})
