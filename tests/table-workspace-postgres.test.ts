/** Real DB tests; never loads dotenv, seeds or migrates. Provision/verify separately. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import type { StaffSession } from '../src/lib/session'
const target = process.env.SKOON_TABLE_TEST_DATABASE_URL
function isolated() {
  if (!target || process.env.SKOON_TABLE_TEST_ACK !== 'isolated-local-test-only') return false
  try { const u = new URL(target); return ['postgres:', 'postgresql:'].includes(u.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && u.pathname === '/skoon_table_test' && [...u.searchParams.keys()].every((k) => k === 'schema') && (!u.searchParams.has('schema') || u.searchParams.get('schema') === 'public') } catch { return false }
}
test('table workspace PostgreSQL acceptance (verified isolated DB only)', { skip: isolated() ? false : 'BLOCKED: no independently verified skoon_table_test DB' }, async (t) => {
  const { PrismaClient } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: target! } } })
  ;(globalThis as unknown as { prisma: unknown }).prisma = db
  const { createPosOrder } = await import('../src/lib/staff-pos-write')
  const { appendOrderItems, sendOrderToKitchen, prepareOrderItems, serveOrderItems } = await import('../src/lib/staff-orders')
  const { getWaiterWorkspace } = await import('../src/lib/staff-waiter')
  const { getStaffTables } = await import('../src/lib/staff-tables')
  const { voidOpenOrderItem } = await import('../src/lib/staff-order-item-void')
  const { openShift } = await import('../src/lib/staff-shifts')
  const branches: bigint[] = []
  try {
    const roles = await db.role.findMany({ where: { slug: { in: ['cashier', 'waiter', 'kitchen'] } } })
    for (const slug of ['cashier', 'waiter', 'kitchen']) assert.ok(roles.some((role) => role.slug === slug), `Existing ${slug} role required`)
    const branch = await db.cafeBranch.create({ data: { code: 'TW-' + randomUUID().slice(0, 8), name: 'Isolated table workspace', timezone: 'Africa/Cairo' } }); branches.push(branch.id)
    const category = await db.category.create({ data: { branchId: branch.id, name: 'Test drinks', slug: 'test-drinks' } })
    const product = await db.product.create({ data: { branchId: branch.id, categoryId: category.id, name: 'Test coffee', price: 10 } })
    async function actor(role: 'cashier' | 'waiter' | 'kitchen'): Promise<StaffSession> {
      const roleRow = roles.find((r) => r.slug === role); assert.ok(roleRow, 'Existing application roles/schema required')
      const id = randomUUID(); await db.user.create({ data: { id, name: 'Workspace test', branchId: branch.id, roleId: roleRow.id, isActive: true } })
      const session: StaffSession = { id, name: role, role, branchId: String(branch.id), email: null, permissions: ['orders.update', 'orders.cancel', 'tables.view'] }
      await openShift(session, { openingCash: 0 }); return session
    }
    const waiter = await actor('waiter'), cashier = await actor('cashier'), stranger = await actor('waiter'), kitchen = await actor('kitchen')
    async function table() { return db.cafeTable.create({ data: { branchId: branch.id, number: randomUUID().slice(0, 8), publicToken: randomUUID().replaceAll('-', '').slice(0, 16) } }) }
    const lines = [{ productId: String(product.id), qty: 1 }]
    async function created() { const seat = await table(); const order = await createPosOrder(waiter, { orderType: 'dine_in', tableId: String(seat.id), items: lines }, randomUUID()); return { seat, order } }
    await t.test('dispatch gate and untracked partial serving with concurrent same-key replay', async () => {
      const seat = await table()
      const order = await createPosOrder(waiter, { orderType: 'dine_in', tableId: String(seat.id), items: [{ productId: String(product.id), qty: 3 }] }, randomUUID())
      const line = await db.orderItem.findFirstOrThrow({ where: { orderId: BigInt(order.id) } })
      const preparation = { mode: 'ready', itemIds: [String(line.id)] }
      await assert.rejects(prepareOrderItems(kitchen, order.id, preparation))
      assert.equal((await db.orderItem.findUniqueOrThrow({ where: { id: line.id } })).preparedQuantity, 0)
      await sendOrderToKitchen(waiter, order.id)
      await prepareOrderItems(kitchen, order.id, preparation)
      const input = { items: [{ orderItemId: String(line.id), quantity: 1 }], idempotencyKey: randomUUID() }
      const results = await Promise.all([serveOrderItems(waiter, order.id, input), serveOrderItems(waiter, order.id, input)])
      assert.deepEqual(results[0], results[1])
      assert.equal((await db.orderItem.findUniqueOrThrow({ where: { id: line.id } })).servedQuantity, 1)
      assert.equal(await db.inventoryTransaction.count({ where: { orderItemId: line.id } }), 0)
      assert.equal(await db.auditLog.count({ where: { branchId: branch.id, entityId: BigInt(order.id), action: 'order.items_served' } }), 1)
      await serveOrderItems(waiter, order.id, { items: [{ orderItemId: String(line.id), quantity: 2 }], idempotencyKey: randomUUID() })
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: BigInt(order.id) } })).status, 'served')
      assert.equal((await db.orderItem.findUniqueOrThrow({ where: { id: line.id } })).servedQuantity, 3)
    })
    await t.test('concurrent creators on one table have one active winner', async () => {
      const seat = await table(); const input = { orderType: 'dine_in', tableId: String(seat.id), items: lines }
      const result = await Promise.allSettled([createPosOrder(waiter, input, randomUUID()), createPosOrder(cashier, input, randomUUID())])
      assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1)
      assert.equal(await db.order.count({ where: { cafeTableId: seat.id, orderType: 'dine_in', status: { notIn: ['pending', 'cancelled'] }, paymentStatus: { not: 'paid' } } }), 1)
    })
    await t.test('cashier resolves waiter order; another waiter sees occupancy but cannot edit', async () => {
      const { seat, order } = await created()
      const cashView = await getWaiterWorkspace(cashier), other = await getWaiterWorkspace(stranger)
      assert.equal(cashView.openOrders.find((o) => o.tableId === String(seat.id))?.id, order.id)
      assert.ok(other.tables.find((t) => t.id === String(seat.id))?.openOrders)
      assert.equal(other.openOrders.some((o) => o.id === order.id), false)
      await assert.rejects(appendOrderItems(stranger, order.id, { items: lines, idempotencyKey: randomUUID() }))
    })
    await t.test('concurrent additions and replay preserve order identity and existing progress', async () => {
      const { seat, order } = await created(); await sendOrderToKitchen(waiter, order.id)
      const before = await db.orderItem.findFirstOrThrow({ where: { orderId: BigInt(order.id) } })
      const one = { items: lines, idempotencyKey: randomUUID() }, two = { items: lines, idempotencyKey: randomUUID() }
      await Promise.all([appendOrderItems(cashier, order.id, one), appendOrderItems(waiter, order.id, two)])
      await appendOrderItems(cashier, order.id, one)
      const stored = await db.order.findUniqueOrThrow({ where: { id: BigInt(order.id) }, include: { items: true } })
      assert.equal(stored.cafeTableId, seat.id); assert.equal(stored.items.length, 3)
      const old = stored.items.find((i) => i.id === before.id)!
      assert.equal(old.preparedQuantity, before.preparedQuantity); assert.equal(old.servedQuantity, before.servedQuantity)
      assert.equal(await db.auditLog.count({ where: { branchId: branch.id, entityId: stored.id, action: 'order.items_append' } }), 2)
    })
    await t.test('served unpaid occupies; new additions resume preparation without erasing served lines', async () => {
      const { seat, order } = await created(); await sendOrderToKitchen(waiter, order.id)
      await db.order.update({ where: { id: BigInt(order.id) }, data: { status: 'served' } })
      const old = await db.orderItem.findFirstOrThrow({ where: { orderId: BigInt(order.id) } })
      await db.orderItem.update({ where: { id: old.id }, data: { servedQuantity: 1, preparedQuantity: 1 } })
      assert.equal((await getStaffTables(cashier)).find((t) => t.id === String(seat.id))?.status, 'occupied')
      await appendOrderItems(cashier, order.id, { items: lines, idempotencyKey: randomUUID() })
      assert.equal((await db.order.findUniqueOrThrow({ where: { id: BigInt(order.id) } })).status, 'preparing')
      await assert.rejects(voidOpenOrderItem(cashier, order.id, String(old.id), { reason: 'Served must survive', idempotencyKey: randomUUID() }))
      assert.equal((await db.orderItem.findUniqueOrThrow({ where: { id: old.id } })).servedQuantity, 1)
    })
    await t.test('cross-branch input fails and cancelled/paid tables release', async () => {
      const { seat, order } = await created()
      await assert.rejects(appendOrderItems({ ...cashier, branchId: '0' }, order.id, { items: lines, idempotencyKey: randomUUID() }))
      await db.order.update({ where: { id: BigInt(order.id) }, data: { status: 'cancelled' } })
      assert.equal((await getStaffTables(cashier)).find((t) => t.id === String(seat.id))?.status, 'available')
    })
  } finally {
    if (branches.length) {
      const scope = { branchId: { in: branches } }
      await db.notification.deleteMany({ where: { order: { branchId: { in: branches } } } })
      await db.auditLog.deleteMany({ where: scope }); await db.financialOperation.deleteMany({ where: scope })
      await db.orderStatusHistory.deleteMany({ where: { order: { branchId: { in: branches } } } })
      await db.orderResponsibilityHistory.deleteMany({ where: scope })
      await db.orderItemOption.deleteMany({ where: { orderItem: { order: { branchId: { in: branches } } } } })
      await db.orderItem.deleteMany({ where: { order: { branchId: { in: branches } } } })
      await db.order.deleteMany({ where: scope }); await db.shift.deleteMany({ where: scope })
      await db.product.deleteMany({ where: scope }); await db.category.deleteMany({ where: scope })
      await db.cafeTable.deleteMany({ where: scope }); await db.user.deleteMany({ where: scope })
      await db.cafeBranch.deleteMany({ where: { id: { in: branches } } })
    }
    await db.$disconnect()
  }
})
