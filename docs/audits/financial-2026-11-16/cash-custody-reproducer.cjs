/** Read-only audit reproducer. All services use an in-memory Prisma double.
 * Run from repository root:
 * node --require ./tests/node-userinfo-workaround.cjs --import tsx docs/audits/financial-2026-11-16/cash-custody-reproducer.cjs
 * Demonstrates current defects; it does not assert corrected behavior.
 * No real database, migrations, credentials, or network access are used.
 */
const assert = require('node:assert/strict')
const path = require('node:path')
process.env.DATABASE_URL = 'postgresql://dummy:dummy@127.0.0.1:1/audit_dummy'
process.env.DIRECT_URL = process.env.DATABASE_URL
for (const name of ['node:net', 'node:tls']) {
  const transport = require(name)
  for (const method of ['connect', 'createConnection']) if (method in transport) transport[method] = () => { throw new Error('NETWORK FORBIDDEN: offline audit') }
}
globalThis.fetch = async () => { throw new Error('NETWORK FORBIDDEN: offline audit') }
const root = path.resolve(__dirname, '../../..')
const { Prisma } = require('@prisma/client')
const decimal = value => new Prisma.Decimal(value)
const cashierId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const managerId = '33333333-3333-4333-8333-333333333333'
const session = (role, id, branchId = '1') => ({ role, id, branchId, name: role, permissions: ['orders.payment'], email: null })
const cashier = session('cashier', cashierId)
const owner = session('owner', ownerId, null)
const manager = session('manager', managerId)
let state
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(clause => matches(row, clause))
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key])
      if ('not' in value) return row[key] !== value.not
      throw new Error(`Unsupported fixture filter ${key}`)
    }
    return row[key] === value
  })
}
function strict(object, label) {
  return new Proxy(object, { get(target, key) {
    if (!(key in target)) throw new Error(`REAL QUERY FALLBACK FORBIDDEN: ${label}.${String(key)}`)
    return target[key]
  } })
}
const rows = ({ where = {}, orderBy, take } = {}) => {
  let result = state.movements.filter(row => matches(row, where))
  if (orderBy) result = [...result].sort((a, b) => orderBy.occurredAt === 'desc' ? b.occurredAt - a.occurredAt : a.occurredAt - b.occurredAt)
  return take ? result.slice(0, take) : result
}
function movement(type, amount, sourceAccount, destinationAccount, extra = {}) {
  const row = { id: BigInt(state.movements.length + 1), branchId: 1n, type, amount: decimal(amount), sourceAccount, destinationAccount, status: 'posted', actorId: ownerId, actor: { name: 'Owner' }, sourceShiftId: null, advanceId: null, metadata: null, reason: 'Audit dummy', occurredAt: new Date(1700000000000 + state.movements.length), ...extra }
  state.movements.push(row)
  return row
}
const client = strict({
  financialMovement: strict({
    findMany: async query => rows(query),
    findFirst: async query => rows(query)[0] ?? null,
    findUnique: async ({ where, include }) => {
      const row = rows({ where })[0]
      return row ? { ...row, ...(include?.reversal ? { reversal: state.movements.find(other => other.reversalOfId === row.id) ?? null } : {}) } : null
    },
    aggregate: async query => ({ _sum: { amount: rows(query).reduce((sum, row) => sum + Number(row.amount), 0) } }),
    create: async ({ data }) => movement(data.type, data.amount, data.sourceAccount, data.destinationAccount, data),
  }, 'financialMovement'),
  financialOperation: strict({
    findUnique: async ({ where }) => state.operations.find(row => matches(row, Object.values(where)[0])) ?? null,
    create: async ({ data }) => { state.operations.push(data); return data },
  }, 'financialOperation'),
  auditLog: strict({ create: async ({ data }) => { state.audits.push(data); return data } }, 'auditLog'),
  shift: strict({
    findFirst: async ({ where }) => matches(state.shift, where) ? state.shift : null,
    findUnique: async ({ where }) => matches(state.shift, where) ? state.shift : null,
    updateMany: async ({ where, data }) => {
      if (!matches(state.shift, where)) return { count: 0 }
      Object.assign(state.shift, data)
      return { count: 1 }
    },
  }, 'shift'),
  user: strict({ findFirst: async ({ where }) => state.users.find(user => {
    const { role, ...scope } = where
    return matches(user, scope) && (!role || user.slug === role.is.slug)
  }) ?? null }, 'user'),
  cashHandover: strict({
    create: async ({ data }) => {
      const handover = { id: 1n, acceptedAt: null, countedAmount: null, difference: null, disputeReason: null, resolvedAt: null, resolvedById: null, movementId: null, ...data, amount: decimal(data.amount) }
      state.handovers.push(handover)
      return handover
    },
    findUnique: async ({ where }) => {
      const handover = state.handovers.find(row => matches(row, where))
      return handover ? { ...handover, fromShift: state.shift, movement: null } : null
    },
  }, 'cashHandover'),
  order: strict({ findMany: async ({ where }) => state.orders.filter(order => matches(order, where)) }, 'order'),
  payment: strict({ findMany: async ({ where }) => state.payments.filter(row => matches(row, where)) }, 'payment'),
  cafeBranch: strict({ findFirst: async () => ({ id: 1n }), findUnique: async () => ({ id: 1n, timezone: 'Africa/Cairo' }) }, 'cafeBranch'),
  $executeRaw: async () => 1,
  $executeRawUnsafe: async () => 1,
  $queryRaw: async (sql, ...values) => {
    if (sql.join('').includes('FROM cash_handovers')) return state.handovers.filter(row => row.id === values[0] && row.branchId === values[1]).map(row => ({ id: row.id }))
    assert(sql.join('').includes('FROM shifts'))
    return values[0] === state.shift.id ? [state.shift] : []
  },
  $transaction: async callback => callback(client),
}, 'prisma')
globalThis.prisma = client
const floats = require(path.join(root, 'src/lib/staff-float.ts'))
const shifts = require(path.join(root, 'src/lib/staff-shifts.ts'))
function reset() {
  state = { movements: [], operations: [], audits: [], payments: [], users: [], handovers: [], orders: [], shift: { id: 1n, branchId: 1n, cashierId, status: 'open', openingCash: decimal(0), expectedCash: decimal(0), closingCash: decimal(0), cashDifference: decimal(0), openedAt: new Date(), closedAt: null, openBy: 'Cashier', handoverNotes: null, handoverTo: null, handoverCompletedAt: null } }
}
async function proof(name, callback) {
  reset()
  const evidence = await callback()
  console.log(`CONFIRMED ${name}: ${JSON.stringify(evidence)}`)
}
async function main() {
  await proof('one safe transfer credits shared float twice', async () => {
    movement('fixed_float_baseline', 0, 'OPENING_RECONCILIATION', 'FIXED_FLOAT')
    movement('main_safe_deposit', 100, 'CASHIER_TILL', 'MAIN_SAFE')
    await floats.transferMainSafeToFixedFloat(owner, 100, 'Transfer actual cash')
    const available = floats.sharedFloatTotals(state.movements).available
    const safe = await floats.getMainSafeSummary(owner)
    assert.equal(available, 200)
    assert.equal(safe.balance, '0.00')
    return { actualTransferred: 100, recordedAvailable: available, recordedSafe: safe.balance }
  })
  await proof('fixed-float addition creates funds without debiting empty safe', async () => {
    movement('fixed_float_baseline', 0, 'OPENING_RECONCILIATION', 'FIXED_FLOAT')
    await floats.recordFixedFloatMovement(owner, { amount: 100, direction: 'addition', reason: 'Top up from safe', branchId: 1, idempotencyKey: 'audit-addition-1' })
    assert.equal(floats.sharedFloatTotals(state.movements).available, 100)
    const safe = await floats.getMainSafeSummary(owner)
    assert.equal(safe.balance, '0.00')
    return { safeBefore: 0, safeAfter: safe.balance, floatAfter: 100 }
  })
  await proof('operational withdrawal spends cash already refunded', async () => {
    state.payments.push({ shiftId: 1n, branchId: 1n, method: 'cash', status: 'completed', amount: decimal(100) })
    movement('cash_refund', 80, 'CASHIER_TILL', 'CUSTOMER', { sourceShiftId: 1n })
    const before = (await shifts.readShiftCashState(client, state.shift)).expectedCash
    await floats.recordFixedFloatMovement(cashier, { amount: 100, direction: 'withdrawal', reason: 'Operating supplies', idempotencyKey: 'audit-withdrawal-1' })
    const after = (await shifts.readShiftCashState(client, state.shift)).expectedCash
    assert.equal(before, 20)
    assert.equal(after, -80)
    return { availableBefore: before, acceptedWithdrawal: 100, expectedAfter: after }
  })
  await proof('manager reverses spent owner addition, creating negative float', async () => {
    movement('fixed_float_baseline', 0, 'OPENING_RECONCILIATION', 'FIXED_FLOAT')
    const addition = movement('fixed_float_addition', 100, 'MAIN_SAFE', 'FIXED_FLOAT')
    movement('fixed_float_advance', 100, 'FIXED_FLOAT', 'CASHIER_ADVANCE', { actorId: cashierId })
    await floats.reverseFixedFloatMovement(manager, addition.id.toString(), 'Reverse owner funding')
    const available = floats.sharedFloatTotals(state.movements).available
    assert.equal(available, -100)
    return { actor: manager.role, availableBefore: 0, availableAfter: available }
  })
  await proof('summary loses baseline and old unsettled advance after 300 rows', async () => {
    movement('fixed_float_baseline', 1000, 'OPENING_RECONCILIATION', 'FIXED_FLOAT')
    movement('fixed_float_advance', 100, 'FIXED_FLOAT', 'CASHIER_ADVANCE', { actorId: cashierId })
    for (let index = 0; index < 300; index++) movement('operational_withdrawal', 1, 'CASHIER_TILL', 'OPERATIONAL_EXPENSE')
    const summary = await floats.getSharedFloatSummary(cashier)
    assert.equal(floats.sharedFloatTotals(state.movements).available, 900)
    assert.equal(summary.available, '0.00')
    assert.equal(summary.outstanding, '0.00')
    assert.equal(summary.requiresReconciliation, true)
    return { actualAvailable: 900, displayedAvailable: summary.available, actualOutstanding: 100, displayedOutstanding: summary.outstanding, baselineHidden: summary.requiresReconciliation, oldAdvanceSelectable: summary.advanceDetails.length > 0 }
  })
  await proof('same safe withdrawal request posts twice', async () => {
    movement('main_safe_deposit', 100, 'CASHIER_TILL', 'MAIN_SAFE')
    const first = await floats.withdrawFromMainSafe(owner, 30, 'Same intended expense')
    const retry = await floats.withdrawFromMainSafe(owner, 30, 'Same intended expense')
    assert.notEqual(first.id, retry.id)
    assert.equal((await floats.getMainSafeSummary(owner)).balance, '40.00')
    return { intendedWithdrawal: 30, recordedWithdrawal: 60, firstId: first.id, retryId: retry.id }
  })
  await proof('fixed-float board ignores an applied reversal', async () => {
    movement('fixed_float_baseline', 100, 'OPENING_RECONCILIATION', 'FIXED_FLOAT')
    const addition = movement('fixed_float_addition', 50, 'MAIN_SAFE', 'FIXED_FLOAT')
    movement('fixed_float_addition_reversal', 50, 'FIXED_FLOAT', 'MAIN_SAFE', { reversalOfId: addition.id })
    const board = await floats.getFixedFloatBoard(owner)
    assert.equal(floats.sharedFloatTotals(state.movements).available, 100)
    assert.equal(board.balance, '150.00')
    return { actualBalance: 100, displayedBalance: board.balance }
  })
  await proof('main-safe balance truncates old deposits after 200 rows', async () => {
    movement('main_safe_deposit', 1000, 'CASHIER_TILL', 'MAIN_SAFE')
    for (let index = 0; index < 200; index++) movement('main_safe_withdrawal', 1, 'MAIN_SAFE', 'OPERATIONAL_EXPENSE')
    const summary = await floats.getMainSafeSummary(owner)
    assert.equal(summary.balance, '-200.00')
    return { actualBalance: 800, displayedBalance: summary.balance, actualDeposits: 1000, displayedDeposits: summary.deposits }
  })
  await proof('cashier closes with kitchen recipient who cannot accept or be resolved', async () => {
    const kitchenId = '44444444-4444-4444-8444-444444444444'
    state.users.push({ id: kitchenId, branchId: 1n, isActive: true, deletedAt: null, slug: 'kitchen', name: 'Kitchen' })
    state.shift.openingCash = decimal(100)
    const closed = await shifts.closeShift(cashier, '1', { closingCash: 100, handoverRecipientId: kitchenId })
    assert.equal(closed.status, 'closed')
    assert.equal(state.handovers[0].status, 'PENDING')
    await assert.rejects(shifts.acceptCashHandover(session('kitchen', kitchenId), '1', 100, { confirmed: true }), error => error.status === 403)
    await assert.rejects(shifts.resolveCashHandover(owner, '1', 100, 'Resolve failed recipient', { confirmed: true, branchId: '1' }), error => error.status === 409)
    return { shiftClosed: true, recipientRole: 'kitchen', pendingAmount: 100, recipientAccepts: false, ownerResolves: false }
  })
  await proof('waiter cannot close with open orders despite selecting valid handoff recipient', async () => {
    const waiterId = '55555555-5555-4555-8555-555555555555'
    state.users.push({ id: waiterId, branchId: 1n, isActive: true, deletedAt: null, slug: 'waiter', name: 'Next waiter' })
    state.orders.push({ id: 1n, shiftId: 1n, branchId: 1n, cafeTableId: 1n, responsibleWaiterId: cashierId, status: 'new', paymentStatus: 'unpaid', total: decimal(100), orderNumber: 'AUDIT-1' })
    await assert.rejects(shifts.closeShift(session('waiter', cashierId), '1', { closingCash: 0, tableHandoffRecipientId: waiterId }), error => error.status === 409)
    assert.equal(state.shift.status, 'open')
    return { selectedRecipient: waiterId, openUnpaidOrders: 1, closeStatus: 409, shiftStillOpen: true }
  })
}
main().catch(error => { console.error(error); process.exitCode = 1 })
