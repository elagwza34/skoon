import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Inventory engine used only from authoritative order transactions.
 *
 * Physical stock is held in InventoryItem.currentStock.  An active
 * InventoryReservation makes that quantity unavailable but does not change
 * physical stock.  When a line is served, reservations become immutable
 * consumption movements.  PostgreSQL row locks serialize every stock decision.
 */

type Tx = Prisma.TransactionClient
export class StockError extends Error {
  constructor(message: string, readonly status = 409) { super(message); this.name = 'StockError' }
}

type Demand = { orderItemId: bigint; inventoryItemId: bigint; quantity: number }

function round3(n: number) { return Math.round((n + Number.EPSILON) * 1000) / 1000 }
function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100 }

async function lockItem(tx: Tx, id: bigint) {
  const rows = await tx.$queryRaw<{ id: bigint; current_stock: unknown }[]>`
    SELECT id, current_stock FROM inventory_items WHERE id = ${id} FOR UPDATE
  `
  if (!rows[0]) throw new StockError('صنف المخزون غير موجود', 404)
  return Number(rows[0].current_stock)
}

async function lockBatch(tx: Tx, id: bigint) {
  await tx.$queryRaw`SELECT id FROM inventory_batches WHERE id = ${id} FOR UPDATE`
}

/** Builds recipe ingredient demand, or one direct packaged-stock demand. */
async function orderDemand(tx: Tx, orderId: bigint): Promise<Demand[]> {
  const lines = await tx.orderItem.findMany({
    where: { orderId, isVoided: false },
    select: {
      id: true, quantity: true,
      product: { select: {
        inventoryItemId: true,
        recipes: { where: { isActive: true, deletedAt: null }, select: { yieldQuantity: true, items: { select: { inventoryItemId: true, quantity: true, wastePercent: true } } } },
      } },
    },
  })
  const demands: Demand[] = []
  for (const line of lines) {
    const recipe = line.product.recipes[0]
    if (recipe) {
      if (line.product.inventoryItemId) throw new StockError('المنتج لا يمكن أن يملك وصفة ومخزونًا مباشرًا معًا', 422)
      const yieldQuantity = Number(recipe.yieldQuantity)
      if (yieldQuantity <= 0) throw new StockError('كمية إنتاج الوصفة غير صالحة', 422)
      for (const ingredient of recipe.items) {
        const qty = Number(ingredient.quantity) * line.quantity / yieldQuantity * (1 + Number(ingredient.wastePercent) / 100)
        demands.push({ orderItemId: line.id, inventoryItemId: ingredient.inventoryItemId, quantity: round3(qty) })
      }
    } else if (line.product.inventoryItemId) {
      demands.push({ orderItemId: line.id, inventoryItemId: line.product.inventoryItemId, quantity: line.quantity })
    }
  }
  return demands
}

/**
 * Reserve all tracked inputs before a ticket can reach the kitchen. Existing
 * stock without an opening/receipt layer intentionally fails closed: historical
 * cost must be reconciled explicitly, never guessed.
 */
export async function reserveOrderInventory(tx: Tx, orderId: bigint): Promise<void> {
  const demand = await orderDemand(tx, orderId)
  if (!demand.length) return
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { branchId: true } })
  if (!order) throw new StockError('الطلب غير موجود', 404)

  const existing = await tx.inventoryReservation.count({ where: { orderItem: { orderId }, status: 'active' } })
  if (existing) throw new StockError('للطلب حجز مخزون قائم بالفعل')

  const totals = new Map<string, { id: bigint; quantity: number }>()
  for (const d of demand) {
    const old = totals.get(d.inventoryItemId.toString())
    totals.set(d.inventoryItemId.toString(), { id: d.inventoryItemId, quantity: round3((old?.quantity ?? 0) + d.quantity) })
  }

  for (const total of [...totals.values()].sort((a, b) => Number(a.id - b.id))) {
    const onHand = await lockItem(tx, total.id)
    const reserved = await tx.inventoryReservation.aggregate({ where: { inventoryItemId: total.id, status: 'active' }, _sum: { quantity: true } })
    const batches = await tx.inventoryBatch.findMany({
      where: { inventoryItemId: total.id, remainingQuantity: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
      select: { remainingQuantity: true, remainingCostQuantity: true },
    })
    const usablePhysical = batches.reduce((sum, b) => sum + Number(b.remainingQuantity), 0)
    const usableCost = batches.reduce((sum, b) => sum + Number(b.remainingCostQuantity), 0)
    const available = onHand - Number(reserved._sum.quantity ?? 0)
    if (total.quantity > available + 1e-9 || total.quantity > usablePhysical + 1e-9 || total.quantity > usableCost + 1e-9) {
      throw new StockError('المخزون المتاح غير كافٍ أو يحتاج إلى طبقة رصيد افتتاحي موثقة', 422)
    }
  }
  await tx.inventoryReservation.createMany({ data: demand.map((d) => ({ orderItemId: d.orderItemId, inventoryItemId: d.inventoryItemId, branchId: order.branchId, quantity: d.quantity.toFixed(3) })) })
}

export async function releaseOrderReservations(tx: Tx, orderId: bigint): Promise<void> {
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderItem: { orderId }, status: 'active' },
    select: { id: true, quantity: true, consumedQuantity: true },
  })
  for (const reservation of reservations) {
    await tx.inventoryReservation.update({ where: { id: reservation.id }, data: {
      releasedQuantity: round3(Number(reservation.quantity) - Number(reservation.consumedQuantity)).toFixed(3),
      status: 'released', releasedAt: new Date(),
    } })
  }
}

/** Store reliable preparation attribution before kitchen work begins. */
export async function markOrderPreparation(tx: Tx, orderId: bigint, employeeId: string): Promise<void> {
  await tx.orderItem.updateMany({
    where: { orderId, isVoided: false, preparationStartedAt: null },
    data: { preparationStartedAt: new Date(), preparationStartedById: employeeId },
  })
}

type ConsumeMode = 'consumption' | 'waste'

/** Converts active reservations to physical movements exactly once. */
export async function consumeOrderReservations(
  tx: Tx,
  orderId: bigint,
  actorId: string,
  mode: ConsumeMode,
  reason?: string,
  requestedItems?: readonly { orderItemId: bigint; quantity: number }[],
): Promise<void> {
  const requestedByItem = new Map((requestedItems ?? []).map((item) => [item.orderItemId.toString(), item.quantity]))
  const reservations = await tx.inventoryReservation.findMany({
    where: { orderItem: { orderId }, status: 'active' },
    orderBy: { id: 'asc' },
    include: { orderItem: { select: { id: true, quantity: true, servedQuantity: true, preparationStartedById: true } }, inventoryItem: { select: { id: true, branchId: true } } },
  })
  const servedDeltas = new Map<string, number>()
  for (const reservation of reservations) {
    if (requestedItems && !requestedByItem.has(reservation.orderItemId.toString())) continue
    const lineQuantity = reservation.orderItem.quantity
    const requested = requestedByItem.get(reservation.orderItemId.toString()) ?? (lineQuantity - reservation.orderItem.servedQuantity)
    if (!Number.isInteger(requested) || requested <= 0 || requested > lineQuantity - reservation.orderItem.servedQuantity) {
      throw new StockError('كمية التقديم غير صالحة', 409)
    }
    const remainingReservation = Number(reservation.quantity) - Number(reservation.consumedQuantity) - Number(reservation.releasedQuantity)
    const quantity = round3(Number(reservation.quantity) * requested / lineQuantity)
    if (quantity <= 0 || quantity > remainingReservation + 1e-9) throw new StockError('حجز المخزون لا يغطي كمية التقديم', 409)
    const onHand = await lockItem(tx, reservation.inventoryItemId)
    if (onHand + 1e-9 < quantity) throw new StockError('المخزون الفعلي غير كافٍ للاستهلاك', 409)
    const batches = await tx.inventoryBatch.findMany({
      where: { inventoryItemId: reservation.inventoryItemId, remainingQuantity: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] },
      orderBy: [{ expiresAt: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
    })
    const costLayers = await tx.inventoryBatch.findMany({
      where: { inventoryItemId: reservation.inventoryItemId, remainingCostQuantity: { gt: 0 } },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    })
    let physicalRemaining = quantity
    const physical: { id: bigint; quantity: number; unitCost: number }[] = []
    for (const batch of batches) {
      if (physicalRemaining <= 1e-9) break
      await lockBatch(tx, batch.id)
      const take = Math.min(physicalRemaining, Number(batch.remainingQuantity))
      if (take > 0) { physical.push({ id: batch.id, quantity: take, unitCost: Number(batch.unitCost) }); physicalRemaining = round3(physicalRemaining - take) }
    }
    if (physicalRemaining > 1e-9) throw new StockError('لا توجد دفعات صالحة كافية للاستهلاك', 409)
    let costRemaining = quantity
    const costing: { id: bigint; quantity: number; unitCost: number }[] = []
    for (const batch of costLayers) {
      if (costRemaining <= 1e-9) break
      await lockBatch(tx, batch.id)
      const take = Math.min(costRemaining, Number(batch.remainingCostQuantity))
      if (take > 0) { costing.push({ id: batch.id, quantity: take, unitCost: Number(batch.unitCost) }); costRemaining = round3(costRemaining - take) }
    }
    if (costRemaining > 1e-9) throw new StockError('لا توجد طبقات FIFO كافية للاستهلاك', 409)
    const costTotal = round2(costing.reduce((sum, a) => sum + a.quantity * a.unitCost, 0))
    const after = round3(onHand - quantity)
    const movement = await tx.inventoryTransaction.create({ data: {
      inventoryItemId: reservation.inventoryItemId, branchId: reservation.inventoryItem.branchId,
      orderItemId: reservation.orderItemId, type: mode, quantity: (-quantity).toFixed(3), quantityAfter: after.toFixed(3),
      unitCost: quantity ? (costTotal / quantity).toFixed(4) : '0', costTotal: costTotal.toFixed(2),
      referenceType: mode === 'waste' ? 'order_prepared_cancel' : 'order_served', referenceId: orderId,
      createdById: actorId, notes: reason ?? null,
    } })
    for (const a of physical) {
      const batch = await tx.inventoryBatch.findUniqueOrThrow({ where: { id: a.id }, select: { remainingQuantity: true } })
      await tx.inventoryBatch.update({ where: { id: a.id }, data: { remainingQuantity: round3(Number(batch.remainingQuantity) - a.quantity).toFixed(3) } })
    }
    for (const a of costing) {
      const batch = await tx.inventoryBatch.findUniqueOrThrow({ where: { id: a.id }, select: { remainingCostQuantity: true } })
      await tx.inventoryBatch.update({ where: { id: a.id }, data: { remainingCostQuantity: round3(Number(batch.remainingCostQuantity) - a.quantity).toFixed(3) } })
    }
    await tx.inventoryBatchAllocation.createMany({ data: [
      ...physical.map((a) => ({ inventoryBatchId: a.id, inventoryTransactionId: movement.id, allocationType: 'physical', quantity: a.quantity.toFixed(3), unitCost: a.unitCost.toFixed(4) })),
      ...costing.map((a) => ({ inventoryBatchId: a.id, inventoryTransactionId: movement.id, allocationType: 'fifo_cost', quantity: a.quantity.toFixed(3), unitCost: a.unitCost.toFixed(4) })),
    ] })
    await tx.inventoryItem.update({ where: { id: reservation.inventoryItemId }, data: { currentStock: after.toFixed(3) } })
    const consumedAfter = round3(Number(reservation.consumedQuantity) + quantity)
    await tx.inventoryReservation.update({ where: { id: reservation.id }, data: {
      consumedQuantity: consumedAfter.toFixed(3),
      status: consumedAfter + Number(reservation.releasedQuantity) >= Number(reservation.quantity) - 1e-9 ? 'consumed' : 'active',
      ...(consumedAfter + Number(reservation.releasedQuantity) >= Number(reservation.quantity) - 1e-9 ? { consumedAt: new Date() } : {}),
    } })
    if (mode === 'waste') {
      const waste = await tx.wasteEvent.create({ data: { branchId: reservation.inventoryItem.branchId, orderItemId: reservation.orderItemId, responsibleId: reservation.orderItem.preparationStartedById, recordedById: actorId, quantity: quantity.toFixed(3), cause: 'prepared_cancellation', reason: reason ?? 'إلغاء بعد بدء التحضير', costTotal: costTotal.toFixed(2) } })
      if (reservation.orderItem.preparationStartedById) {
        await tx.employeeAccountability.create({ data: { branchId: reservation.inventoryItem.branchId, employeeId: reservation.orderItem.preparationStartedById, wasteEventId: waste.id, amount: costTotal.toFixed(2) } })
      }
    }
    if (mode === 'consumption') servedDeltas.set(reservation.orderItemId.toString(), requested)
  }
  if (mode === 'consumption') {
    for (const [orderItemId, delta] of servedDeltas) {
      await tx.orderItem.update({ where: { id: BigInt(orderItemId) }, data: { servedQuantity: { increment: delta } } })
    }
  }
}

/** Item-level serving entry point. Only the selected line's proportional input
 * reservations become consumption; every other line remains actively reserved. */
export async function serveOrderItemInventory(tx: Tx, orderId: bigint, orderItemId: bigint, quantity: number, actorId: string): Promise<void> {
  await consumeOrderReservations(tx, orderId, actorId, 'consumption', undefined, [{ orderItemId, quantity }])
}

/** Read model used by boards: available-to-promise always excludes reservations. */
export async function inventoryAvailability(branchId: bigint, itemId: bigint) {
  const [item, reserved] = await Promise.all([
    prisma.inventoryItem.findFirst({ where: { id: itemId, branchId, deletedAt: null }, select: { currentStock: true } }),
    prisma.inventoryReservation.aggregate({ where: { branchId, inventoryItemId: itemId, status: 'active' }, _sum: { quantity: true } }),
  ])
  if (!item) return null
  return { physical: Number(item.currentStock), reserved: Number(reserved._sum.quantity ?? 0), available: round3(Number(item.currentStock) - Number(reserved._sum.quantity ?? 0)) }
}
