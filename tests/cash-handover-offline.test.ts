/** Service regression tests with an in-memory transaction double, NOT PostgreSQL.
 * No credentials, sockets, financial records, or migrations are used. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Prisma } from '@prisma/client'
import { acceptCashHandover, disputeCashHandover, resolveCashHandover, closeShift, openShift, getPendingHandovers, cashHandoverActionSchema } from '../src/lib/staff-shifts'
import type { StaffSession } from '../src/lib/session'
import { cashHandoverRequest } from '../src/lib/cash-handover-request'

test('browser handover requests require explicit count and confirmation and match the API contract', () => {
  for (const count of ['', ' ', '-1', 'NaN', 'Infinity', '1.001', '10000000']) {
    assert.throws(() => cashHandoverRequest('accept', '1', '1', count, true, ''))
  }
  assert.throws(() => cashHandoverRequest('accept', '1', '1', '100', false, ''))
  for (const action of ['accept', 'dispute', 'resolve'] as const) {
    const request = cashHandoverRequest(action, '1', '1', '95.00', true, 'Confirmed reason')
    assert.equal(cashHandoverActionSchema.safeParse(request).success, true)
    assert.equal(request.confirmed, true)
    assert.equal('resolvedAmount' in request ? request.resolvedAmount : request.countedAmount, 95)
  }
  assert.equal(cashHandoverActionSchema.safeParse(cashHandoverRequest('accept', '1', '1', '0', true, '')).success, true)
  assert.throws(() => cashHandoverRequest('resolve', '1', '1', '95', true, ''))
})

const senderId = '11111111-1111-4111-8111-111111111111'
const recipientId = '22222222-2222-4222-8222-222222222222'
const managerId = '33333333-3333-4333-8333-333333333333'
const session = (id = recipientId, role: StaffSession['role'] = 'cashier', branchId: string | null = '1'): StaffSession => ({ id, role, branchId, permissions: ['orders.payment'], email: null, name: role })
const context = { confirmed: true, fromShiftId: '10' }
const decimal = (n: number) => new Prisma.Decimal(n)

function fixture() {
  // Deliberately typed test doubles: they model rollback and scheduling only;
  // they cannot prove PostgreSQL locks, constraints, or isolation semantics.
  const state: any = {
    h: { id: 44n, branchId: 1n, fromShiftId: 10n, fromCashierId: senderId, toCashierId: recipientId, amount: decimal(100), countedAmount: null, difference: null, status: 'PENDING', notes: 'Sender evidence', disputeReason: null, resolvedById: null, resolvedAt: null, movementId: null, acceptedAt: null },
    shift: { id: 10n, branchId: 1n, cashierId: senderId, status: 'closed', openingCash: decimal(100), closingCash: decimal(100), expectedCash: decimal(100), openedAt: new Date(), closedAt: new Date() },
    movements: [{ id: 1n, type: 'historical', amount: decimal(12), reason: 'Existing ledger entry' }],
    audits: [{ id: 1n, action: 'historical' }], failAudit: false, advances: [], repayments: [], recipientOpen: false, locks: 0,
  }
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: any) => row[key] === value)
  let queue: Promise<unknown> = Promise.resolve()
  const tx: any = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: any[]) => {
      state.locks++
      if (sql.join('').includes('cash_handovers')) return values[0] === state.h.id && values[1] === state.h.branchId ? [{ id: state.h.id }] : []
      if (sql.join('').includes('FROM shifts')) return [{ ...state.shift }]
      throw new Error('Unexpected SQL in test double')
    },
    $executeRaw: async () => 1, $executeRawUnsafe: async () => 1,
    user: { findFirst: async ({ where }: any) => where.id === recipientId && where.branchId === 1n ? { id: recipientId, name: 'Recipient' } : null },
    cashHandover: {
      findUnique: async () => ({ ...state.h, countedAmount: state.h.countedAmount === null ? null : new Prisma.Decimal(state.h.countedAmount), difference: state.h.difference === null ? null : new Prisma.Decimal(state.h.difference), fromShift: { ...state.shift }, movement: state.movements.find((m: any) => m.id === state.h.movementId) ?? null }),
      findFirst: async () => ['PENDING', 'DISPUTED'].includes(state.h.status) ? { id: state.h.id } : null,
      findMany: async ({ where }: any) => { assert.equal(where.toCashierId, recipientId); return [] },
      updateMany: async ({ where, data }: any) => { if (!matches(state.h, where)) return { count: 0 }; Object.assign(state.h, data); return { count: 1 } },
    },
    financialMovement: {
      create: async ({ data }: any) => { const row = { ...data, id: BigInt(state.movements.length + 1), amount: new Prisma.Decimal(data.amount) }; state.movements.push(row); return row },
      findMany: async ({ where }: any) => where.type === 'cashier_handover' ? state.movements.filter((m: any) => m.type === 'cashier_handover' && !m.consumedAt) : where.type === 'fixed_float_advance' ? state.advances : state.repayments,
      updateMany: async ({ where, data }: any) => { const rows = state.movements.filter((m: any) => where.id.in.includes(m.id) && !m.consumedAt); rows.forEach((m: any) => Object.assign(m, data)); return { count: rows.length } },
    },
    auditLog: { create: async ({ data }: any) => { if (state.failAudit) throw new Error('audit unavailable'); state.audits.push(data); return data } },
    shift: {
      findFirst: async ({ where }: any) => where.cashierId === recipientId ? state.recipientOpen ? { id: 20n } : null : state.shift.status === 'open' ? state.shift : null,
      findUnique: async () => state.shift,
      create: async ({ data }: any) => { state.recipientOpen = true; return { ...state.shift, ...data, id: 20n } },
    },
    cafeBranch: { findUnique: async () => ({ timezone: 'Africa/Cairo' }) },
  }
  const client: any = { ...tx, $transaction: (work: (tx: any) => Promise<unknown>) => {
    const result = queue.then(async () => {
      const snapshot = { h: { ...state.h }, movements: [...state.movements], audits: [...state.audits] }
      try { return await work(tx) } catch (error) { Object.assign(state, snapshot); throw error }
    })
    queue = result.catch(() => {})
    return result
  } }
  ;(globalThis as any).prisma = client
  return state
}

test('handover: recipient accepts equal counted cash once with linked ledger and audit', async () => {
  const s = fixture(); const before = { ...s.movements[0] }
  const result = await acceptCashHandover(session(), '44', 100, context)
  assert.equal(result.status, 'ACCEPTED'); assert.equal(result.movementId, '2')
  assert.equal(s.h.amount.toFixed(2), '100.00'); assert.equal(s.h.countedAmount, '100.00')
  assert.equal(s.audits[1].userId, recipientId); assert.equal(s.audits[1].action, 'cash_handover.accept')
  assert.deepEqual(s.movements[0], before); assert.equal(s.audits[0].action, 'historical')
})

test('handover: wrong recipient and non-cashier cannot confirm or dispute; no writes', async () => {
  const s = fixture()
  for (const actor of [session(senderId), session(managerId, 'manager'), session(recipientId, 'waiter')]) {
    await assert.rejects(acceptCashHandover(actor, '44', 100, context))
    await assert.rejects(disputeCashHandover(actor, '44', 'Refuse transfer', 90, context))
  }
  assert.equal(s.h.status, 'PENDING'); assert.equal(s.movements.length, 1); assert.equal(s.audits.length, 1)
})

test('handover: differing count disputes automatically without posting sender amount', async () => {
  const s = fixture(); const result = await acceptCashHandover(session(), '44', 90, context)
  assert.equal(result.status, 'DISPUTED'); assert.equal(s.h.countedAmount, '90.00'); assert.equal(s.h.difference, '-10.00')
  assert.equal(s.h.amount.toFixed(2), '100.00'); assert.equal(s.movements.length, 1); assert.equal(s.h.acceptedAt, null)
  await assert.rejects(acceptCashHandover(session(), '44', 100, context))
  assert.equal(s.h.countedAmount, '90.00')
})

test('handover: designated recipient rejection records reason/count without a movement', async () => {
  const s = fixture(); await disputeCashHandover(session(), '44', 'Count rejected by recipient', 95, context)
  assert.equal(s.h.status, 'DISPUTED'); assert.equal(s.h.difference, '-5.00'); assert.equal(s.movements.length, 1)
  assert.equal(s.audits[1].newValues.confirmed, true)
  await assert.rejects(disputeCashHandover(session(senderId), '44', 'Overwrite evidence', 100, context))
})

test('handover: only independently authorized Manager/Owner resolves and cannot rewrite count', async () => {
  const s = fixture(); await acceptCashHandover(session(), '44', 90, context)
  for (const actor of [session(), session(senderId), session(managerId, 'kitchen'), { ...session(managerId, 'manager'), permissions: [] }]) await assert.rejects(resolveCashHandover(actor, '44', 90, 'Verified shortage', context))
  await assert.rejects(resolveCashHandover(session(managerId, 'manager'), '44', 100, 'Overwrite original count', context))
  const result = await resolveCashHandover(session(managerId, 'manager'), '44', 90, 'Verified shortage', context)
  assert.equal(result.status, 'RESOLVED'); assert.equal(result.movementId, '2')
  assert.equal(s.h.countedAmount, '90.00'); assert.equal(s.h.difference, '-10.00'); assert.equal(s.h.notes, 'Sender evidence')
  assert.equal(s.movements[1].amount.toFixed(2), '90.00'); assert.equal(s.audits[2].oldValues.difference, '-10.00')
  const replay = await resolveCashHandover(session(managerId, 'manager'), '44', 90, 'Verified shortage', context)
  assert.equal(replay.idempotent, true); assert.equal(s.movements.length, 2); assert.equal(s.audits.length, 3)
})

test('handover: duplicate and scheduled concurrent confirmations are replay-safe (test double)', async () => {
  const s = fixture(); const results = await Promise.all([acceptCashHandover(session(), '44', 100, context), acceptCashHandover(session(), '44', 100, context)])
  assert.equal(results[0].movementId, results[1].movementId); assert.equal(results[1].idempotent, true)
  assert.equal(s.movements.length, 2); assert.equal(s.audits.length, 2); assert.equal(s.locks, 2)
})

test('handover: competing confirmation/dispute cannot create conflicting terminal states (test double)', async () => {
  const s = fixture(); const results = await Promise.allSettled([acceptCashHandover(session(), '44', 100, context), disputeCashHandover(session(), '44', 'Conflicting count', 90, context)])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(s.h.status, 'ACCEPTED'); assert.equal(s.movements.length, 2)
})

test('handover: cross-branch and wrong path shift requests leave no effects', async () => {
  const s = fixture()
  await assert.rejects(acceptCashHandover(session(recipientId, 'cashier', '2'), '44', 100, context))
  await assert.rejects(acceptCashHandover(session(), '44', 100, { ...context, fromShiftId: '999' }))
  await assert.rejects(resolveCashHandover(session(managerId, 'owner', null), '44', 100, 'Choose branch', context))
  assert.equal(s.h.status, 'PENDING'); assert.equal(s.audits.length, 1)
})

test('handover: explicit confirmation, finite cents and strict request fields are required', async () => {
  fixture()
  for (const amount of [NaN, Infinity, -1, 1.001]) await assert.rejects(acceptCashHandover(session(), '44', amount, context))
  await assert.rejects(acceptCashHandover(session(), '44', 100))
  assert.equal(cashHandoverActionSchema.safeParse({ action: 'accept', handoverId: '44', countedAmount: 100 }).success, false)
  assert.equal(cashHandoverActionSchema.safeParse({ action: 'accept', handoverId: '44', countedAmount: 100, confirmed: true, amount: 1 }).success, false)
})

test('handover: audit failure rolls back both status and financial movement (test double)', async () => {
  const s = fixture(); s.failAudit = true
  await assert.rejects(acceptCashHandover(session(), '44', 100, context), /audit unavailable/)
  assert.equal(s.h.status, 'PENDING'); assert.equal(s.movements.length, 1); assert.equal(s.audits.length, 1)
})

test('handover: cashier close cannot transfer outstanding personal float advances', async () => {
  const s = fixture(); s.shift.status = 'open'; s.advances = [{ id: 9n, amount: decimal(20) }]; s.repayments = [{ advanceId: 9n, amount: decimal(5) }]
  await assert.rejects(closeShift(session(senderId), '10', { closingCash: 100, handoverRecipientId: recipientId }), /سلف العهدة/)
  assert.equal(s.shift.status, 'open'); assert.equal(s.movements.length, 1); assert.equal(s.audits.length, 1)
})

test('handover: pending receipt blocks manual opening and active recipient till blocks posting', async () => {
  const s = fixture()
  await assert.rejects(openShift(session(), { openingCash: 100 }), /استلام النقد/)
  s.recipientOpen = true
  await assert.rejects(acceptCashHandover(session(), '44', 100, context), /وردية المستلم/)
  assert.equal(s.h.status, 'PENDING'); assert.equal(s.movements.length, 1)
})

test('handover: cashiers cannot enumerate another recipient queue', async () => {
  fixture(); await getPendingHandovers(session())
  await assert.rejects(getPendingHandovers(session(), '1', senderId))
})

test('handover: Owner must explicitly select a branch and a party cannot self-resolve after promotion', async () => {
  const s = fixture(); await acceptCashHandover(session(), '44', 90, context)
  await assert.rejects(resolveCashHandover(session(senderId, 'manager'), '44', 90, 'Self approval', context))
  await assert.rejects(resolveCashHandover(session(recipientId, 'manager'), '44', 90, 'Self approval', context))
  const result = await resolveCashHandover(session(managerId, 'owner', null), '44', 90, 'Independent owner review', { ...context, branchId: '1' })
  assert.equal(result.status, 'RESOLVED'); assert.equal(s.h.countedAmount, '90.00')
})

test('handover: resolution audit failure rolls back release without erasing original discrepancy (test double)', async () => {
  const s = fixture(); await acceptCashHandover(session(), '44', 90, context); s.failAudit = true
  await assert.rejects(resolveCashHandover(session(managerId, 'manager'), '44', 90, 'Verified shortage', context), /audit unavailable/)
  assert.equal(s.h.status, 'DISPUTED'); assert.equal(s.h.countedAmount, '90.00'); assert.equal(s.h.difference, '-10.00')
  assert.equal(s.h.movementId, null); assert.equal(s.movements.length, 1); assert.equal(s.audits.length, 2)
})

test('handover: next opening consumes confirmed cash once without changing the posted amount', async () => {
  const s = fixture(); await acceptCashHandover(session(), '44', 100, context)
  const opened = await openShift(session(), { openingCash: 999 })
  assert.equal(opened.openingCash, '100.00'); assert.ok(s.movements[1].consumedAt)
  assert.equal(s.movements[1].amount.toFixed(2), '100.00')
  await assert.rejects(openShift(session(), { openingCash: 999 }))
  assert.equal(s.movements.length, 2)
})
