/** Production services with transaction doubles; no DB, sockets, seeds or migrations.
 * Serialized promises below are NOT evidence of PostgreSQL lock/isolation behavior. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseOrderItemQuantity } from '../src/lib/order-item-quantity'
import { orderItemAdjustmentSchema } from '../src/lib/staff-order-item-adjustment'
import { prepareOrderItems, serveOrderItems, transitionOrderStatus } from '../src/lib/staff-orders'
import type { StaffSession } from '../src/lib/session'

const actorId = '11111111-1111-4111-8111-111111111111'
const actor = (role: StaffSession['role'] = 'waiter', branchId = '1'): StaffSession => ({ id: actorId, role, branchId, name: role, email: null, permissions: [] })
const stamp = '2026-11-06T10:00:00.000Z'

for (const raw of ['1', '2', '99', ' 12 ']) test(`quantity accepts ${JSON.stringify(raw)} and satisfies adjustment API contract`, () => {
  const parsed = parseOrderItemQuantity(raw)
  assert.equal(parsed.error, undefined)
  assert.equal(orderItemAdjustmentSchema.safeParse({ action: 'quantity', targetQuantity: parsed.quantity, reason: 'تعديل الكمية', expectedUpdatedAt: stamp, idempotencyKey: 'quantity-contract-01' }).success, true)
})
for (const raw of ['', ' ', '0', '-1', '1.5', '1e1', '0x10', '2x', '+2', '100', '9999999999999999999999', '\\dd']) test(`quantity rejects ${JSON.stringify(raw)} with Arabic feedback`, () => {
  const parsed = parseOrderItemQuantity(raw)
  assert.ok(parsed.error && /[\u0600-\u06ff]/.test(parsed.error))
  assert.equal(parsed.quantity, undefined)
})
test('workspace quantity contract uses parser, actual adjustment URL, stale-item token, ownership and duplicate guards', () => {
  const source = readFileSync('src/components/waiter/waiter-table-workspace.tsx', 'utf8')
  assert.ok(source.includes('parseOrderItemQuantity(raw)'))
  assert.ok(source.includes('setError(parsed.error)'))
  assert.ok(source.includes('targetQuantity: parsed.quantity'))
  assert.ok(source.includes('/items/${item.id}/adjust'))
  assert.ok(source.includes('expectedUpdatedAt: item.updatedAt, idempotencyKey: key'))
  assert.ok(source.includes('inFlight.current || !order || !canManage || item.servedQty > 0'))
})

function fixture(tracked = [false], quantity = 3) {
  // any is limited to explicit Prisma transaction doubles, as in existing suites.
  const s: any = {
    order: { id: 10n, branchId: 1n, orderNumber: 'BATCH-1', status: 'ready', orderType: 'dine_in', paymentStatus: 'unpaid', sentToKitchenAt: new Date(stamp), source: 'waiter', qrApprovedAt: null, responsibleWaiterId: actorId },
    shift: { id: 5n, branchId: 1n, cashierId: actorId, status: 'open' },
    items: tracked.map((isTracked, index) => ({ id: BigInt(index + 1), orderId: 10n, quantity, preparedQuantity: quantity, servedQuantity: 0, isVoided: false, preparationStartedAt: null, preparationStartedById: null, product: { inventoryItemId: isTracked ? 1n : null, recipes: [] }, productVariant: null })),
    reservations: tracked.flatMap((isTracked, index) => isTracked ? [{ id: BigInt(index + 1), orderItemId: BigInt(index + 1), inventoryItemId: 1n, quantity, consumedQuantity: 0, releasedQuantity: 0, status: 'active' }] : []),
    stock: 20, batch: { id: 1n, remainingQuantity: 20, remainingCostQuantity: 20, unitCost: 2 },
    movements: [], allocations: [], audits: [], histories: [], operations: [], locks: [], failAudit: false,
  }
  const match = (row: any, where: any) => Object.entries(where ?? {}).every(([key, value]: any) => value === undefined || (value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value))
  const apply = (row: any, data: any) => { for (const [key, value] of Object.entries(data) as any) row[key] = value && typeof value === 'object' && 'increment' in value ? Number(row[key]) + value.increment : value; return row }
  const tx: any = {
    $executeRaw: async () => 1, $executeRawUnsafe: async () => 1,
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join(''); s.locks.push(sql)
      if (sql.includes('FROM shifts')) return [{ ...s.shift }]
      if (sql.includes('FROM orders')) return [{ status: s.order.status, branch_id: s.order.branchId, order_type: s.order.orderType, payment_status: s.order.paymentStatus, sent_to_kitchen_at: s.order.sentToKitchenAt, source: s.order.source, qr_approved_at: s.order.qrApprovedAt, responsible_waiter_id: s.order.responsibleWaiterId }]
      if (sql.includes('FROM inventory_items')) return [{ id: 1n, current_stock: s.stock }]
      if (sql.includes('FROM inventory_batches')) return [{ id: 1n }]
      throw Error('Unexpected SQL: ' + sql)
    },
    shift: { findFirst: async ({ where }: any) => match(s.shift, where) ? { ...s.shift } : null },
    order: { findUnique: async () => ({ ...s.order }), findUniqueOrThrow: async () => ({ ...s.order }), update: async ({ data }: any) => apply(s.order, data) },
    orderItem: {
      findMany: async ({ where }: any) => s.items.filter((line: any) => match(line, where)).map((line: any) => ({ ...line })),
      update: async ({ where, data }: any) => apply(s.items.find((line: any) => line.id === where.id), data),
      updateMany: async ({ where, data }: any) => { const rows = s.items.filter((line: any) => match(line, where)); rows.forEach((line: any) => apply(line, data)); return { count: rows.length } },
    },
    inventoryReservation: {
      findMany: async ({ where }: any) => s.reservations.filter((r: any) => r.status === where.status && (!where.inventoryItemId || r.inventoryItemId === where.inventoryItemId)).map((r: any) => ({ ...r, orderItem: { ...s.items.find((line: any) => line.id === r.orderItemId) }, inventoryItem: { id: 1n, branchId: 1n } })),
      update: async ({ where, data }: any) => apply(s.reservations.find((r: any) => r.id === where.id), data),
    },
    inventoryBatch: { findMany: async () => [{ ...s.batch }], findUniqueOrThrow: async () => ({ ...s.batch }), update: async ({ data }: any) => apply(s.batch, data) },
    inventoryItem: { update: async ({ data }: any) => { s.stock = Number(data.currentStock); return { id: 1n } } },
    inventoryTransaction: { create: async ({ data }: any) => { const row = { id: BigInt(s.movements.length + 1), ...data }; s.movements.push(row); return row } },
    inventoryBatchAllocation: { createMany: async ({ data }: any) => { s.allocations.push(...data); return { count: data.length } } },
    auditLog: { create: async ({ data }: any) => { if (s.failAudit) throw Error('audit failure'); s.audits.push(data); return data } },
    orderStatusHistory: { create: async ({ data }: any) => { s.histories.push(data); return data } },
    financialOperation: { findUnique: async ({ where }: any) => s.operations.find((row: any) => match(row, where.branchId_actorId_operationType_idempotencyKey)) ?? null, create: async ({ data }: any) => { s.operations.push(data); return data } },
    user: { findMany: async () => [] },
  }
  let queue = Promise.resolve()
  let beforeTransaction: (() => void) | undefined
  const client = { ...tx, $transaction: (fn: (tx: any) => Promise<any>) => {
    const result = queue.then(async () => {
      beforeTransaction?.(); beforeTransaction = undefined
      const before = structuredClone(s)
      try { return await fn(tx) } catch (error) { Object.assign(s, before); throw error }
    }); queue = result.then(() => undefined, () => undefined); return result
  } }
  ;(globalThis as any).prisma = client
  return { s, beforeTransaction: (fn: () => void) => { beforeTransaction = fn } }
}
const serving = (key = 'serving-key-01', quantity = 1, ids = ['1']) => ({ items: ids.map((orderItemId) => ({ orderItemId, quantity })), idempotencyKey: key })
const prepare = (mode: 'start' | 'ready' = 'start') => prepareOrderItems(actor('kitchen'), '10', { mode, itemIds: ['1'] })

test('untracked partial serving advances operational quantity without inventory movement', async () => {
  const { s } = fixture(); const result = await serveOrderItems(actor(), '10', serving())
  assert.equal(s.items[0].servedQuantity, 1); assert.equal(result.orderComplete, false); assert.equal(s.movements.length, 0); assert.equal(s.stock, 20)
})
test('untracked final serving completes order and records audit/history once', async () => {
  const { s } = fixture(); await serveOrderItems(actor(), '10', serving('serving-full-01', 3))
  assert.equal(s.items[0].servedQuantity, 3); assert.equal(s.order.status, 'served'); assert.equal(s.audits.length, 1); assert.equal(s.histories.length, 1)
})
test('tracked partial and final serving conserve stock, reservation, physical and cost layers', async () => {
  const { s } = fixture([true]); await serveOrderItems(actor(), '10', serving())
  assert.equal(s.items[0].servedQuantity, 1); assert.equal(s.stock, 19); assert.equal(Number(s.reservations[0].consumedQuantity), 1)
  await serveOrderItems(actor(), '10', serving('serving-final-02', 2))
  assert.equal(s.items[0].servedQuantity, 3); assert.equal(s.stock, 17); assert.equal(Number(s.batch.remainingQuantity), 17); assert.equal(Number(s.batch.remainingCostQuantity), 17)
  assert.equal(s.reservations[0].status, 'consumed'); assert.equal(s.movements.length, 2); assert.equal(s.allocations.length, 4)
})
test('mixed order advances each selected line exactly once', async () => {
  const { s } = fixture([true, false]); await serveOrderItems(actor(), '10', serving('mixed-serving-01', 2, ['1', '2']))
  assert.deepEqual(s.items.map((line: any) => line.servedQuantity), [2, 2]); assert.equal(s.stock, 18); assert.equal(s.movements.length, 1)
})
test('multiple ingredient reservations advance menu units only once', async () => {
  const { s } = fixture([true]); s.reservations.push({ ...s.reservations[0], id: 2n })
  await serveOrderItems(actor(), '10', serving()); assert.equal(s.items[0].servedQuantity, 1); assert.equal(s.stock, 18); assert.equal(s.movements.length, 2)
})
for (const tracked of [false, true]) test(`same-key concurrent partial retries replay without duplicate progress (tracked=${tracked}; double only)`, async () => {
  const { s } = fixture([tracked]); const input = serving()
  const results = await Promise.all([serveOrderItems(actor(), '10', input), serveOrderItems(actor(), '10', input)])
  assert.deepEqual(results[0], results[1]); assert.equal(s.items[0].servedQuantity, 1); assert.equal(s.audits.length, 1); assert.equal(s.operations.length, 1); assert.equal(s.movements.length, tracked ? 1 : 0)
  await assert.rejects(serveOrderItems(actor(), '10', serving(input.idempotencyKey, 2)), /مفتاح/)
})
test('completed serving replays after order and shift close', async () => {
  const { s } = fixture(); const input = serving('complete-replay-01', 3); const result = await serveOrderItems(actor(), '10', input)
  s.shift.status = 'closed'; assert.deepEqual(await serveOrderItems(actor(), '10', input), result); assert.equal(s.items[0].servedQuantity, 3)
})
test('competing distinct serving operations cannot exceed remaining units (double only)', async () => {
  const { s } = fixture([true])
  const results = await Promise.allSettled([serveOrderItems(actor(), '10', serving('competing-serve-01', 2)), serveOrderItems(actor(), '10', serving('competing-serve-02', 2))])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1); assert.equal(s.items[0].servedQuantity, 2); assert.equal(s.stock, 18); assert.equal(s.movements.length, 1)
})
test('full tracked serving reaches zero stock; fresh-key repeated full serving rejects', async () => {
  const { s } = fixture([true]); s.stock = 3; s.batch.remainingQuantity = 3; s.batch.remainingCostQuantity = 3
  await serveOrderItems(actor(), '10', serving('zero-stock-serve-01', 3))
  await assert.rejects(serveOrderItems(actor(), '10', serving('zero-stock-serve-02', 3)))
  assert.equal(s.stock, 0); assert.equal(Number(s.batch.remainingQuantity), 0); assert.equal(s.items[0].servedQuantity, 3); assert.equal(s.movements.length, 1)
})
test('missing operation key, duplicate item, over-serving and unready serving reject', async () => {
  const { s } = fixture()
  await assert.rejects(serveOrderItems(actor(), '10', { items: serving().items }))
  await assert.rejects(serveOrderItems(actor(), '10', serving('duplicate-item-01', 1, ['1', '1'])))
  await assert.rejects(serveOrderItems(actor(), '10', serving('excess-serving-01', 4)))
  s.items[0].preparedQuantity = 0; await assert.rejects(serveOrderItems(actor(), '10', serving()))
  assert.equal(s.items[0].servedQuantity, 0); assert.equal(s.audits.length, 0)
})
test('insufficient stock and missing tracked reservations fail without operational progress', async () => {
  const { s } = fixture([true]); s.stock = 0
  await assert.rejects(serveOrderItems(actor(), '10', serving())); assert.equal(s.stock, 0); assert.equal(s.items[0].servedQuantity, 0); assert.equal(s.movements.length, 0)
  s.stock = 20; s.reservations = []; await assert.rejects(serveOrderItems(actor(), '10', serving()), /حجز/); assert.equal(s.items[0].servedQuantity, 0)
})
test('audit failure rolls back mixed serving, inventory and operation result in double', async () => {
  const { s } = fixture([true, false]); s.failAudit = true
  await assert.rejects(serveOrderItems(actor(), '10', serving('rollback-serving-01', 1, ['1', '2'])), /audit failure/)
  assert.deepEqual(s.items.map((line: any) => line.servedQuantity), [0, 0]); assert.equal(s.stock, 20); assert.equal(s.movements.length, 0); assert.equal(s.operations.length, 0)
})
test('serving permissions and locked shift are enforced', async () => {
  const f = fixture()
  await assert.rejects(serveOrderItems(actor('kitchen'), '10', serving()))
  await assert.rejects(serveOrderItems(actor('waiter', '2'), '10', serving()))
  await assert.rejects(serveOrderItems(actor('cashier'), '10', serving()))
  f.beforeTransaction(() => { f.s.shift.status = 'closed' }); await assert.rejects(serveOrderItems(actor(), '10', serving()))
  assert.equal(f.s.items[0].servedQuantity, 0)
})

for (const gate of ['undispatched', 'pending-qr', 'unapproved-qr', 'unpaid-takeaway', 'partial-takeaway']) test(`preparation rejects ${gate} without mutations`, async () => {
  const { s } = fixture(); s.order.status = 'new'
  if (gate === 'undispatched') s.order.sentToKitchenAt = null
  if (gate === 'pending-qr') { s.order.source = 'qr'; s.order.status = 'pending' }
  if (gate === 'unapproved-qr') s.order.source = 'qr'
  if (gate.endsWith('takeaway')) { s.order.orderType = 'takeaway'; s.order.paymentStatus = gate.startsWith('partial') ? 'partial' : 'unpaid' }
  await assert.rejects(prepare()); assert.equal(s.audits.length, 0); assert.equal(s.histories.length, 0); assert.equal(s.order.status, gate === 'pending-qr' ? 'pending' : 'new')
})
for (const type of ['dine_in', 'takeaway', 'qr']) test(`valid dispatched ${type} can start then become ready`, async () => {
  const { s } = fixture(); s.order.status = 'new'; s.items[0].preparedQuantity = 0
  if (type === 'takeaway') { s.order.orderType = type; s.order.paymentStatus = 'paid' }
  if (type === 'qr') { s.order.source = 'qr'; s.order.qrApprovedAt = new Date(stamp) }
  await prepare(); assert.equal(s.order.status, 'preparing'); await prepare('ready'); assert.equal(s.order.status, 'ready'); assert.equal(s.items[0].preparedQuantity, 3); assert.equal(s.movements.length, 0)
})
test('preparation validates role, branch, missing shift and shift closed under lock', async () => {
  const f = fixture(); f.s.order.status = 'new'
  await assert.rejects(prepareOrderItems(actor('waiter'), '10', { mode: 'start', itemIds: ['1'] }))
  await assert.rejects(prepareOrderItems(actor('kitchen', '2'), '10', { mode: 'start', itemIds: ['1'] }))
  f.s.shift.status = 'closed'; await assert.rejects(prepare()); f.s.shift.status = 'open'
  f.beforeTransaction(() => { f.s.shift.status = 'closed' }); await assert.rejects(prepare()); assert.equal(f.s.audits.length, 0)
})
for (const change of ['dispatch', 'branch', 'payment', 'qr']) test(`preparation revalidates ${change} inside transaction`, async () => {
  const f = fixture(); f.s.order.status = 'new'
  f.beforeTransaction(() => {
    if (change === 'dispatch') f.s.order.sentToKitchenAt = null
    if (change === 'branch') f.s.order.branchId = 2n
    if (change === 'payment') { f.s.order.orderType = 'takeaway'; f.s.order.paymentStatus = 'unpaid' }
    if (change === 'qr') f.s.order.source = 'qr'
  })
  await assert.rejects(prepare()); assert.equal(f.s.audits.length, 0)
})
test('legacy whole-order preparation cannot bypass dispatch gate', async () => {
  const { s } = fixture(); s.order.status = 'new'; s.order.sentToKitchenAt = null
  await assert.rejects(transitionOrderStatus(actor('kitchen'), '10', 'preparing'), /إرساله/); assert.equal(s.histories.length, 0)
})
test('legacy ready transition rejects unpaid takeaway and accepts dispatched dine-in preparation', async () => {
  const f = fixture(); f.s.order.status = 'preparing'; f.s.order.orderType = 'takeaway'
  await assert.rejects(transitionOrderStatus(actor('kitchen'), '10', 'ready'), /تحصيل/)
  f.s.order.status = 'new'; f.s.order.orderType = 'dine_in'
  await transitionOrderStatus(actor('kitchen'), '10', 'preparing'); assert.equal(f.s.order.status, 'preparing')
})
test('preparation audit failure rolls back item and order state in double', async () => {
  const { s } = fixture(); s.order.status = 'new'; s.items[0].preparedQuantity = 0; s.failAudit = true
  await assert.rejects(prepare('ready'), /audit failure/)
  assert.equal(s.order.status, 'new'); assert.equal(s.items[0].preparedQuantity, 0); assert.equal(s.items[0].preparationStartedAt, null); assert.equal(s.histories.length, 0)
})
test('serving API adapters and POS retain the idempotency contract', () => {
  for (const path of ['src/app/api/staff/orders/[id]/status/route.ts', 'src/app/api/staff/orders/[id]/items/serve/route.ts']) {
    const source = readFileSync(path, 'utf8'); assert.ok(source.includes("headers.get('idempotency-key') ?? body.idempotencyKey")); assert.ok(source.includes('interventionReason: body.interventionReason'))
  }
  const pos = readFileSync('src/components/pos/pos-checkout.tsx', 'utf8'); assert.ok(pos.includes('idempotencyKey: servingAttempt.current.key')); assert.ok(pos.includes('servingInFlight.current'))
})
test('PostgreSQL workspace fixture declares category slug and checks role prerequisites', () => {
  const source = readFileSync('tests/table-workspace-postgres.test.ts', 'utf8'); assert.ok(source.includes("slug: 'test-drinks'")); assert.ok(source.includes('Existing ${slug} role required'))
})
