/** Real PostgreSQL integration suite. Never loads .env/.env.staging or migrates.
 * Only a separately provisioned LOCAL skoon_handover_test DB is permitted.
 * Requires existing application schema and cashier/manager roles. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { StaffSession } from '../src/lib/session'

const testUrl = process.env.SKOON_HANDOVER_TEST_DATABASE_URL
function isolatedTarget() {
  if (!testUrl || process.env.SKOON_HANDOVER_TEST_ACK !== 'isolated-local-test-only') return false
  try {
    const url = new URL(testUrl)
    return ['postgres:', 'postgresql:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/skoon_handover_test' && [...url.searchParams.keys()].every((key) => key === 'schema') && (!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public')
  } catch { return false }
}

test('cash handover PostgreSQL regression suite (isolated database only)', { skip: isolatedTarget() ? false : 'BLOCKED: no explicitly authorized isolated local skoon_handover_test database; no connection attempted.' }, async (t) => {
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: testUrl! } } })
  ;(globalThis as unknown as { prisma: unknown }).prisma = db
  const shifts = await import('../src/lib/staff-shifts')
  const float = await import('../src/lib/staff-float')
  const branchIds: bigint[] = []
  try {
    const roles = await db.role.findMany({ where: { slug: { in: ['cashier', 'manager', 'waiter'] } } })
    const roleId = (slug: string) => { const role = roles.find((r) => r.slug === slug); if (!role) throw new Error('Test schema must already have application roles; this suite does not seed/migrate'); return role.id }
    roleId('cashier'); roleId('manager'); roleId('waiter')
    const suffix = randomUUID().slice(0, 8)
    const branch = await db.cafeBranch.create({ data: { name: 'Handover test ' + suffix, code: 'HT-' + suffix, timezone: 'Africa/Cairo' } }); branchIds.push(branch.id)
    const other = await db.cafeBranch.create({ data: { name: 'Other handover test ' + suffix, code: 'HO-' + suffix, timezone: 'Africa/Cairo' } }); branchIds.push(other.id)
    async function actor(role: string, branchId = branch.id): Promise<StaffSession> {
      const id = randomUUID()
      await db.user.create({ data: { id, name: 'Handover test ' + role, roleId: roleId(role), branchId, isActive: true } })
      return { id, name: role, email: null, role: role as StaffSession['role'], branchId: branchId.toString(), permissions: ['orders.payment'] }
    }
    const sender = await actor('cashier'), recipient = await actor('cashier'), stranger = await actor('cashier'), manager = await actor('manager'), waiter = await actor('waiter'), outsider = await actor('cashier', other.id)
    async function pending(toCashierId = recipient.id) {
      const source = await db.shift.create({ data: { branchId: branch.id, cashierId: sender.id, openBy: sender.name, status: 'closed', openingCash: '100.00', expectedCash: '100.00', closingCash: '100.00', openedAt: new Date(), closedAt: new Date() } })
      const h = await db.cashHandover.create({ data: { branchId: branch.id, fromShiftId: source.id, fromCashierId: sender.id, toCashierId, amount: '100.00', status: 'PENDING', notes: 'Original sender evidence' } })
      return { h, context: { confirmed: true, fromShiftId: source.id.toString() } }
    }
    const countMovements = () => db.financialMovement.count({ where: { branchId: branch.id, type: 'cashier_handover' } })

    await t.test('authorized sender closes and designated recipient confirms', async () => {
      const source = await shifts.openShift(sender, { openingCash: 100 })
      await assert.rejects(shifts.closeShift(stranger, source.id, { closingCash: 100, handoverRecipientId: recipient.id }))
      await shifts.closeShift(sender, source.id, { closingCash: 100, handoverRecipientId: recipient.id })
      const h = await db.cashHandover.findFirstOrThrow({ where: { fromShiftId: BigInt(source.id) } })
      const result = await shifts.acceptCashHandover(recipient, h.id.toString(), 100, { confirmed: true, fromShiftId: source.id })
      assert.equal(result.status, 'ACCEPTED'); assert.ok(result.movementId)
      assert.equal(await db.auditLog.count({ where: { entityType: 'cash_handover', entityId: h.id, action: { in: ['cash_handover.create', 'cash_handover.accept'] } } }), 2)
    })
    await t.test('unauthorized employee confirmation/dispute writes nothing', async () => {
      const { h, context } = await pending(); const before = await countMovements()
      for (const actor of [stranger, waiter, sender]) {
        await assert.rejects(shifts.acceptCashHandover(actor, h.id.toString(), 100, context))
        await assert.rejects(shifts.disputeCashHandover(actor, h.id.toString(), 'Unauthorized dispute', 90, context))
      }
      assert.equal((await db.cashHandover.findUniqueOrThrow({ where: { id: h.id } })).status, 'PENDING')
      assert.equal(await countMovements(), before)
    })
    await t.test('different recipient count records discrepancy without spending it', async () => {
      const { h, context } = await pending(); const before = await countMovements()
      await shifts.acceptCashHandover(recipient, h.id.toString(), 90, context)
      const stored = await db.cashHandover.findUniqueOrThrow({ where: { id: h.id } })
      assert.equal(stored.amount.toFixed(2), '100.00'); assert.equal(stored.countedAmount?.toFixed(2), '90.00'); assert.equal(stored.difference?.toFixed(2), '-10.00'); assert.equal(stored.status, 'DISPUTED')
      assert.equal(await countMovements(), before)
      await assert.rejects(shifts.acceptCashHandover(recipient, h.id.toString(), 100, context))
    })
    await t.test('dispute resolution is role-scoped and keeps original evidence', async () => {
      const { h, context } = await pending()
      await shifts.disputeCashHandover(recipient, h.id.toString(), 'Recipient counted shortage', 95, context)
      for (const actor of [sender, recipient, stranger, waiter, { ...manager, permissions: [] }]) await assert.rejects(shifts.resolveCashHandover(actor, h.id.toString(), 95, 'Verified count', context))
      await assert.rejects(shifts.resolveCashHandover(manager, h.id.toString(), 100, 'Rewrite count', context))
      const before = await countMovements()
      const [result, replay] = await Promise.all([
        shifts.resolveCashHandover(manager, h.id.toString(), 95, 'Independent shortage review', context),
        shifts.resolveCashHandover(manager, h.id.toString(), 95, 'Independent shortage review', context),
      ])
      assert.equal(replay.movementId, result.movementId)
      assert.equal(await countMovements(), before + 1)
      assert.equal(await db.auditLog.count({ where: { entityType: 'cash_handover', entityId: h.id, action: 'cash_handover.resolve' } }), 1)
      const stored = await db.cashHandover.findUniqueOrThrow({ where: { id: h.id }, include: { movement: true } })
      assert.equal(stored.countedAmount?.toFixed(2), '95.00'); assert.equal(stored.difference?.toFixed(2), '-5.00'); assert.equal(stored.notes, 'Original sender evidence')
      assert.equal(stored.movement?.amount.toFixed(2), '95.00'); assert.equal(result.movementId, stored.movementId?.toString())
    })
    await t.test('duplicate confirmation returns same movement', async () => {
      const { h, context } = await pending(); const before = await countMovements()
      const a = await shifts.acceptCashHandover(recipient, h.id.toString(), 100, context)
      const b = await shifts.acceptCashHandover(recipient, h.id.toString(), 100, context)
      assert.equal(a.movementId, b.movementId); assert.equal(b.idempotent, true); assert.equal(await countMovements(), before + 1)
    })
    await t.test('actual PostgreSQL concurrent confirmations post once', async () => {
      const { h, context } = await pending(); const before = await countMovements()
      const results = await Promise.all([shifts.acceptCashHandover(recipient, h.id.toString(), 100, context), shifts.acceptCashHandover(recipient, h.id.toString(), 100, context)])
      assert.equal(results[0].movementId, results[1].movementId); assert.equal(await countMovements(), before + 1)
    })
    await t.test('confirmation versus dispute has only one PostgreSQL winner', async () => {
      const { h, context } = await pending(); const before = await countMovements()
      const results = await Promise.allSettled([shifts.acceptCashHandover(recipient, h.id.toString(), 100, context), shifts.disputeCashHandover(recipient, h.id.toString(), 'Conflicting recipient count', 90, context)])
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
      const stored = await db.cashHandover.findUniqueOrThrow({ where: { id: h.id } })
      assert.equal(await countMovements(), before + (stored.status === 'ACCEPTED' ? 1 : 0))
    })
    await t.test('cross-branch and wrong originating shift requests are rejected', async () => {
      const { h, context } = await pending()
      await assert.rejects(shifts.acceptCashHandover(outsider, h.id.toString(), 100, context))
      await assert.rejects(shifts.acceptCashHandover(recipient, h.id.toString(), 100, { ...context, fromShiftId: '999999999' }))
      assert.equal((await db.cashHandover.findUniqueOrThrow({ where: { id: h.id } })).status, 'PENDING')
    })
    await t.test('existing ledger and audit records remain unchanged after confirmation', async () => {
      const ledger = await db.financialMovement.findMany({ where: { branchId: branch.id }, orderBy: { id: 'asc' } })
      const audits = await db.auditLog.findMany({ where: { branchId: branch.id }, orderBy: { id: 'asc' } })
      const { h, context } = await pending(); await shifts.acceptCashHandover(recipient, h.id.toString(), 100, context)
      assert.deepEqual(await db.financialMovement.findMany({ where: { id: { in: ledger.map((r) => r.id) } }, orderBy: { id: 'asc' } }), ledger)
      assert.deepEqual(await db.auditLog.findMany({ where: { id: { in: audits.map((r) => r.id) } }, orderBy: { id: 'asc' } }), audits)
    })
    await t.test('concurrent next openings consume all confirmed receipts once', async () => {
      const receiver = await actor('cashier')
      const a = await pending(receiver.id), b = await pending(receiver.id)
      await shifts.acceptCashHandover(receiver, a.h.id.toString(), 100, a.context)
      await shifts.acceptCashHandover(receiver, b.h.id.toString(), 100, b.context)
      const results = await Promise.allSettled([shifts.openShift(receiver, { openingCash: 999 }), shifts.openShift(receiver, { openingCash: 999 })])
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
      const opened = await db.shift.findFirstOrThrow({ where: { cashierId: receiver.id, status: 'open' } })
      assert.equal(opened.openingCash.toFixed(2), '200.00')
      const receipts = await db.financialMovement.findMany({ where: { destinationUserId: receiver.id, type: 'cashier_handover' } })
      assert.equal(receipts.length, 2); assert.ok(receipts.every((r) => r.consumedAt && r.amount.toFixed(2) === '100.00'))
    })
    await t.test('outstanding cashier advance blocks close without transferring the debt', async () => {
      const source = await shifts.openShift(sender, { openingCash: 100 })
      await float.establishFixedFloatBaseline(manager, { amount: 100, reason: 'Isolated fixture fund', confirmed: true, idempotencyKey: randomUUID() })
      await float.recordSharedFloatAdvance(sender, { amount: 20, reason: 'Isolated fixture advance', idempotencyKey: randomUUID() })
      const before = await db.financialMovement.count({ where: { branchId: branch.id } })
      await assert.rejects(shifts.closeShift(sender, source.id, { closingCash: 100, handoverRecipientId: recipient.id }), /سلف العهدة/)
      assert.equal((await db.shift.findUniqueOrThrow({ where: { id: BigInt(source.id) } })).status, 'open')
      assert.equal(await db.financialMovement.count({ where: { branchId: branch.id } }), before)
    })
  } finally {
    // Only rows belonging to this suite's generated branch IDs; no global cleanup.
    if (branchIds.length) {
      await db.auditLog.deleteMany({ where: { branchId: { in: branchIds } } })
      await db.financialOperation.deleteMany({ where: { branchId: { in: branchIds } } })
      await db.cashHandover.deleteMany({ where: { branchId: { in: branchIds } } })
      await db.financialMovement.deleteMany({ where: { branchId: { in: branchIds } } })
      await db.shift.deleteMany({ where: { branchId: { in: branchIds } } })
      await db.user.deleteMany({ where: { branchId: { in: branchIds } } })
      await db.cafeBranch.deleteMany({ where: { id: { in: branchIds } } })
    }
    await db.$disconnect()
  }
})
