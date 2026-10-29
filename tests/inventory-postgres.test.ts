/**
 * Isolated inventory acceptance. This file never enables itself from `.env`:
 * callers must bind DATABASE_URL to an explicitly acknowledged staging target.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

const safe = process.env.SKOON_TEST_DATABASE_AUTHORIZED === 'test-data-only'
  && process.env.SKOON_TEST_DATABASE_PROJECT_REF === 'bkgxjutnfkslpgshufhb'
const skip = safe ? false : 'Requires the explicitly authorised disposable Skoon test database; no fixtures were created.'

test('inventory PostgreSQL: reservations, partial service, FEFO/FIFO and cleanup', { skip }, async () => {
  const { prisma } = await import('../src/lib/prisma')
  const { ROLE } = await import('../src/lib/authz')
  const { createPosOrder } = await import('../src/lib/staff-pos-write')
  const { sendOrderToKitchen, serveOrderItems, prepareOrderItems } = await import('../src/lib/staff-orders')
  const { voidOpenOrderItem } = await import('../src/lib/staff-order-item-void')
  type Session = import('../src/lib/session').StaffSession

  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids = { waiter: randomUUID(), kitchen: randomUUID() }
  const roles = await prisma.role.findMany({ where: { slug: { in: [ROLE.WAITER, ROLE.KITCHEN] } }, select: { id: true, slug: true } })
  const waiterRole = roles.find((role) => role.slug === ROLE.WAITER)
  const kitchenRole = roles.find((role) => role.slug === ROLE.KITCHEN)
  if (!waiterRole || !kitchenRole) throw new Error('Staging roles waiter and kitchen are required')
  let branchId: bigint | null = null
  try {
    const branch = await prisma.cafeBranch.create({ data: { name: `Inventory test ${suffix}`, code: `INV-${suffix}`, timezone: 'Africa/Cairo' } })
    branchId = branch.id
    const [waiter, kitchen] = await Promise.all([
      prisma.user.create({ data: { id: ids.waiter, roleId: waiterRole.id, branchId, name: 'Inventory Waiter' } }),
      prisma.user.create({ data: { id: ids.kitchen, roleId: kitchenRole.id, branchId, name: 'Inventory Kitchen' } }),
    ])
    const [waiterShift, kitchenShift] = await Promise.all([
      prisma.shift.create({ data: { branchId, cashierId: waiter.id, openBy: 'Inventory Waiter', status: 'open' } }),
      prisma.shift.create({ data: { branchId, cashierId: kitchen.id, openBy: 'Inventory Kitchen', status: 'open' } }),
    ])
    const item = await prisma.inventoryItem.create({ data: { branchId, name: `Milk ${suffix}`, unit: 'ml', currentStock: '10.000', minStock: '0', unitCost: '2.00' } })
    // Earlier expiry is selected physically (FEFO); earlier receipt is charged
    // first (FIFO), so the two allocations are independently assertable.
    await prisma.inventoryBatch.createMany({ data: [
      { inventoryItemId: item.id, branchId, receivedAt: new Date('2026-01-01'), expiresAt: new Date('2027-02-01'), originalQuantity: '5', remainingQuantity: '5', remainingCostQuantity: '5', unitCost: '2.0000' },
      { inventoryItemId: item.id, branchId, receivedAt: new Date('2026-02-01'), expiresAt: new Date('2027-01-01'), originalQuantity: '5', remainingQuantity: '5', remainingCostQuantity: '5', unitCost: '3.0000' },
    ] })
    const category = await prisma.category.create({ data: { branchId, name: `Test ${suffix}`, slug: `test-${suffix}` } })
    const product = await prisma.product.create({ data: { branchId, categoryId: category.id, inventoryItemId: item.id, name: `Pack ${suffix}`, price: '20.00' } })
    const table = await prisma.cafeTable.create({ data: { branchId, number: `I-${suffix}`, publicToken: suffix.padEnd(16, '0') } })
    const waiterSession: Session = { id: waiter.id, email: null, name: waiter.name, role: ROLE.WAITER, branchId: branchId.toString(), permissions: [] }
    const kitchenSession: Session = { id: kitchen.id, email: null, name: kitchen.name, role: ROLE.KITCHEN, branchId: branchId.toString(), permissions: [] }
    const created = await createPosOrder(waiterSession, { tableId: table.id.toString(), items: [{ productId: product.id.toString(), qty: 2 }] }, `inventory-${suffix}`)
    await sendOrderToKitchen(waiterSession, created.id)
    const order = await prisma.order.findUniqueOrThrow({ where: { id: BigInt(created.id) }, include: { items: true } })
    const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderItemId: order.items[0].id } })
    assert.equal(Number(reservation.quantity), 2)
    // Competing starts must serialize on the order lock: exactly one lifecycle
    // transition is recorded even if the kitchen retries the same tap.
    await Promise.all([prepareOrderItems(kitchenSession, created.id, { mode: 'start', itemIds: [order.items[0].id.toString()] }), prepareOrderItems(kitchenSession, created.id, { mode: 'start', itemIds: [order.items[0].id.toString()] })])
    assert.equal(await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: 'preparing' } }), 1)
    await prepareOrderItems(kitchenSession, created.id, { mode: 'ready', itemIds: [order.items[0].id.toString()] })
    await serveOrderItems(waiterSession, created.id, { items: [{ orderItemId: order.items[0].id.toString(), quantity: 1 }] })
    const partial = await prisma.orderItem.findUniqueOrThrow({ where: { id: order.items[0].id } })
    assert.equal(partial.servedQuantity, 1)
    const partialReservation = await prisma.inventoryReservation.findUniqueOrThrow({ where: { id: reservation.id } })
    assert.equal(Number(partialReservation.consumedQuantity), 1)
    assert.equal(partialReservation.status, 'active')
    await assert.rejects(() => serveOrderItems(waiterSession, created.id, { items: [{ orderItemId: order.items[0].id.toString(), quantity: 2 }] }))
    await serveOrderItems(waiterSession, created.id, { items: [{ orderItemId: order.items[0].id.toString(), quantity: 1 }] })
    const movements = await prisma.inventoryTransaction.findMany({ where: { orderItemId: order.items[0].id, type: 'consumption' }, include: { allocations: true } })
    assert.equal(movements.length, 2)
    assert.equal(await prisma.inventoryReservation.count({ where: { id: reservation.id, status: 'consumed' } }), 1)
    assert.equal(await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }).then((row) => Number(row.currentStock)), 8)
    const physical = movements.flatMap((movement) => movement.allocations.filter((allocation) => allocation.allocationType === 'physical'))
    const costs = movements.flatMap((movement) => movement.allocations.filter((allocation) => allocation.allocationType === 'fifo_cost'))
    assert.equal(physical.length, 2); assert.equal(costs.length, 2)
    const unprepared = await createPosOrder(waiterSession, { tableId: table.id.toString(), items: [{ productId: product.id.toString(), qty: 1 }, { productId: product.id.toString(), qty: 1 }] }, `inventory-${suffix}-release`)
    await sendOrderToKitchen(waiterSession, unprepared.id)
    const unpreparedLines = await prisma.orderItem.findMany({ where: { orderId: BigInt(unprepared.id) }, orderBy: { id: 'asc' } })
    await voidOpenOrderItem(waiterSession, unprepared.id, unpreparedLines[0].id.toString(), { reason: 'Added by mistake', idempotencyKey: `inventory-${suffix}-release-item` })
    assert.equal(await prisma.inventoryReservation.count({ where: { orderItemId: unpreparedLines[0].id, status: 'released' } }), 1)
    assert.equal(await prisma.inventoryTransaction.count({ where: { orderItemId: unpreparedLines[0].id } }), 0)
    const prepared = await createPosOrder(waiterSession, { tableId: table.id.toString(), items: [{ productId: product.id.toString(), qty: 1 }, { productId: product.id.toString(), qty: 1 }] }, `inventory-${suffix}-waste`)
    await sendOrderToKitchen(waiterSession, prepared.id)
    const preparedLines = await prisma.orderItem.findMany({ where: { orderId: BigInt(prepared.id) }, orderBy: { id: 'asc' } })
    await prepareOrderItems(kitchenSession, prepared.id, { mode: 'start', itemIds: [preparedLines[0].id.toString()] })
    await voidOpenOrderItem(waiterSession, prepared.id, preparedLines[0].id.toString(), { reason: 'Prepared by mistake', idempotencyKey: `inventory-${suffix}-waste-item` })
    assert.equal(await prisma.inventoryTransaction.count({ where: { orderItemId: preparedLines[0].id, type: 'waste' } }), 1)
    assert.equal(await prisma.wasteEvent.count({ where: { orderItemId: preparedLines[0].id, cause: 'prepared_cancellation' } }), 1)
    assert.equal(await prisma.employeeAccountability.count({ where: { wasteEvent: { orderItemId: preparedLines[0].id } } }), 1)
    const stockAfterWaste = Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock)
    await assert.rejects(() => voidOpenOrderItem(waiterSession, created.id, order.items[0].id.toString(), { reason: 'Served already', idempotencyKey: `inventory-${suffix}-served` }))
    assert.equal(Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock), stockAfterWaste)
    await prisma.shift.updateMany({ where: { id: { in: [waiterShift.id, kitchenShift.id] } }, data: { status: 'closed', closedAt: new Date() } })
  } finally {
    if (branchId) {
      await prisma.financialOperation.deleteMany({ where: { branchId } }); await prisma.auditLog.deleteMany({ where: { branchId } }); await prisma.notification.deleteMany({ where: { order: { branchId } } })
      await prisma.order.deleteMany({ where: { branchId } }); await prisma.shift.deleteMany({ where: { branchId } })
      await prisma.product.deleteMany({ where: { branchId } }); await prisma.category.deleteMany({ where: { branchId } }); await prisma.cafeTable.deleteMany({ where: { branchId } })
      await prisma.inventoryItem.deleteMany({ where: { branchId } }); await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } }); await prisma.cafeBranch.delete({ where: { id: branchId } })
    }
  }
})

// Stock-count acceptance scenarios intentionally share the same staging gate.
// They must only be enabled after the additive stock-count migration is applied
// to an isolated project; production is never a fallback target.
for (const scenario of [
  'stock count PostgreSQL: positive variance creates adjustment batch and provenance',
  'stock count PostgreSQL: negative variance uses FIFO cost and FEFO physical allocations',
  'stock count PostgreSQL: active reservations block an unsafe negative variance',
  'stock count PostgreSQL: concurrent posts create one set of adjustments',
  'stock count PostgreSQL: concurrent reservation and serving preserve on-hand stock',
  'stock count PostgreSQL: stale snapshot and duplicate idempotency are rejected',
  'stock count PostgreSQL: transaction failure rolls back batches, movements and count status',
  'stock count PostgreSQL: branch scope and accountability linkage are enforced',
  'stock count PostgreSQL: count-loss accountability remains distinct from prepared-order waste',
]) {
  test(scenario, { skip: 'Scenario fixture has not been implemented; it must not be reported as a passing PostgreSQL test.' }, () => {
    // The executable fixture is deliberately gated until staging identity and
    // migration history are confirmed. Keeping each scenario named makes the
    // required acceptance surface explicit in CI output.
  })
}
