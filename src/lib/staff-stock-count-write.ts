import 'server-only'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ROLE, hasPermission } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { planStockCount } from '@/lib/stock-count-policy'

export class StockCountError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
const id = (v: string) => /^\d+$/.test(v) ? BigInt(v) : (() => { throw new StockCountError('Invalid identifier', 400) })()
const countInput = z.object({ branchId: z.string(), type: z.enum(['weekly', 'monthly', 'ad_hoc']), idempotencyKey: z.string().min(8).max(100).optional() })
const lineInput = z.array(z.object({ lineId: z.string(), countedQuantity: z.coerce.number().min(0), positiveUnitCost: z.coerce.number().min(0).optional() })).min(1)
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Inventory officers are represented by the database permission, not by a
 * fabricated role slug. Owners retain full access even if historic role grants
 * have not yet been seeded. */
function manager(session: StaffSession) {
  if (session.role !== ROLE.OWNER && !hasPermission(session.permissions, 'inventory.manage')) {
    throw new StockCountError('Forbidden', 403)
  }
}
function branch(session: StaffSession, value: string) { const result = id(value); if (!staffCanAccessBranch(session, result)) throw new StockCountError('Forbidden', 403); return result }

/** Creates a physical on-hand snapshot. Reservations are deliberately not subtracted. */
export async function createStockCount(session: StaffSession, raw: unknown) {
  manager(session); const input = countInput.parse(raw); const branchId = branch(session, input.branchId)
  return prisma.$transaction(async tx => {
    if (input.idempotencyKey) { const prior = await tx.stockCount.findFirst({ where: { branchId, idempotencyKey: input.idempotencyKey } }); if (prior) return prior }
    const items = await tx.inventoryItem.findMany({ where: { branchId, deletedAt: null, isActive: true }, select: { id: true, currentStock: true } })
    const count = await tx.stockCount.create({ data: { branchId, responsibleId: session.id, type: input.type, idempotencyKey: input.idempotencyKey ?? null, lines: { create: items.map(item => ({ inventoryItemId: item.id, expectedQuantity: item.currentStock })) } } })
    await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'stock_count.create', entityType: 'stock_count', entityId: count.id, newValues: { type: input.type, lines: items.length } } })
    return count
  }, { isolationLevel: 'Serializable' })
}

async function ownedCount(session: StaffSession, countId: string) { const count = await prisma.stockCount.findUnique({ where: { id: id(countId) } }); if (!count) throw new StockCountError('Stock count not found', 404); branch(session, count.branchId.toString()); return count }

export async function startStockCount(session: StaffSession, countId: string) { manager(session); const count = await ownedCount(session, countId); const changed = await prisma.stockCount.updateMany({ where: { id: count.id, status: 'draft' }, data: { status: 'counting' } }); if (!changed.count) throw new StockCountError('Count cannot be started', 409); return prisma.stockCount.findUniqueOrThrow({ where: { id: count.id } }) }

export async function saveStockCountLines(session: StaffSession, countId: string, raw: unknown) {
  manager(session); const count = await ownedCount(session, countId); const lines = lineInput.parse(raw); if (!['draft', 'counting'].includes(count.status)) throw new StockCountError('Posted or submitted counts are immutable', 409)
  return prisma.$transaction(async tx => {
    for (const line of lines) { const updated = await tx.stockCountLine.updateMany({ where: { id: id(line.lineId), stockCountId: count.id }, data: { countedQuantity: line.countedQuantity, valuationMetadata: line.positiveUnitCost === undefined ? undefined : { positiveUnitCost: line.positiveUnitCost } } }); if (!updated.count) throw new StockCountError('Count line not found', 404) }
    return tx.stockCount.findUniqueOrThrow({ where: { id: count.id }, include: { lines: true } })
  })
}

export async function submitStockCount(session: StaffSession, countId: string) {
  manager(session); const count = await ownedCount(session, countId)
  return prisma.$transaction(async tx => { const missing = await tx.stockCountLine.count({ where: { stockCountId: count.id, countedQuantity: null } }); if (missing) throw new StockCountError('All quantities must be counted before submission', 409); const result = await tx.stockCount.updateMany({ where: { id: count.id, status: { in: ['draft', 'counting'] } }, data: { status: 'submitted', submittedAt: new Date() } }); if (!result.count) throw new StockCountError('Count cannot be submitted', 409); return tx.stockCount.findUniqueOrThrow({ where: { id: count.id }, include: { lines: true } }) })
}

/** Preview is read-only; posting re-runs every gate while rows are locked. */
export async function previewStockCountVariances(session: StaffSession, countId: string) {
  manager(session); const count = await ownedCount(session, countId); const lines = await prisma.stockCountLine.findMany({ where: { stockCountId: count.id }, include: { inventoryItem: { select: { currentStock: true } } } })
  return Promise.all(lines.map(async line => {
    const reserved = await prisma.inventoryReservation.aggregate({ where: { branchId: count.branchId, inventoryItemId: line.inventoryItemId, status: 'active' }, _sum: { quantity: true } })
    const batches = await prisma.inventoryBatch.findMany({ where: { branchId: count.branchId, inventoryItemId: line.inventoryItemId, remainingCostQuantity: { gt: 0 } }, orderBy: { receivedAt: 'asc' }, select: { remainingCostQuantity: true, unitCost: true } })
    return { lineId: line.id.toString(), ...planStockCount({ snapshot: Number(line.expectedQuantity), current: Number(line.inventoryItem.currentStock), counted: Number(line.countedQuantity ?? NaN), reserved: Number(reserved._sum.quantity ?? 0), fifo: batches.map(b => ({ quantity: Number(b.remainingCostQuantity), unitCost: Number(b.unitCost) })), positiveUnitCost: (line.valuationMetadata as { positiveUnitCost?: number } | null)?.positiveUnitCost }) }
  }))
}

/**
 * Reconciles a submitted physical count. Item rows are locked in ascending id
 * order, exactly like reservation/consumption, then batch rows are locked
 * before their balances change. Serializable isolation retries are deliberately
 * left to the caller: a failed serialization commits no partial movement.
 */
export async function postStockCount(session: StaffSession, countId: string) {
  manager(session); const count = await ownedCount(session, countId)
  // Deployment is fail-closed. This cannot be turned on from the browser and
  // production has no default that enables it.
  if (process.env.STOCK_COUNT_POSTING_ENABLED !== 'true') {
    throw new StockCountError('ترحيل الجرد واختبارات Staging مطلوبة قبل تفعيل التسوية', 503)
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM stock_counts WHERE id = ${count.id} FOR UPDATE`
    const locked = await tx.stockCount.findUniqueOrThrow({ where: { id: count.id }, include: { lines: true } })
    if (locked.status === 'posted') return { id: locked.id.toString(), status: 'posted', idempotent: true }
    if (locked.status !== 'submitted' || locked.postedAt) throw new StockCountError('Count is not ready for posting', 409)
    if (locked.lines.some(line => line.countedQuantity === null)) throw new StockCountError('All count lines must be completed', 409)

    const results: { lineId: string; transactionId?: string; variance: number; cost: number }[] = []
    // Lock item rows deterministically before locking any batch rows.
    const lines = [...locked.lines].sort((a, b) => Number(a.inventoryItemId - b.inventoryItemId) || Number(a.id - b.id))
    for (const line of lines) {
      const itemRows = await tx.$queryRaw<{ current_stock: unknown }[]>`SELECT current_stock FROM inventory_items WHERE id = ${line.inventoryItemId} AND branch_id = ${locked.branchId} FOR UPDATE`
      if (!itemRows[0]) throw new StockCountError('Inventory item is outside this branch', 409)
      const current = Number(itemRows[0].current_stock)
      const reservations = await tx.inventoryReservation.findMany({ where: { branchId: locked.branchId, inventoryItemId: line.inventoryItemId, status: 'active' }, select: { quantity: true, consumedQuantity: true, releasedQuantity: true } })
      const reserved = round3(reservations.reduce((sum, r) => sum + Number(r.quantity) - Number(r.consumedQuantity) - Number(r.releasedQuantity), 0))
      const fifo = await tx.inventoryBatch.findMany({ where: { branchId: locked.branchId, inventoryItemId: line.inventoryItemId, remainingCostQuantity: { gt: 0 } }, orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }], select: { id: true, remainingCostQuantity: true, unitCost: true } })
      const basis = (line.valuationMetadata as { positiveUnitCost?: number } | null)?.positiveUnitCost
      const plan = planStockCount({ snapshot: Number(line.expectedQuantity), current, counted: Number(line.countedQuantity), reserved, fifo: fifo.map(b => ({ quantity: Number(b.remainingCostQuantity), unitCost: Number(b.unitCost) })), positiveUnitCost: basis })
      if (plan.blocked) throw new StockCountError(`Stock count cannot post: ${plan.blocked}`, 409)
      if (plan.direction === 'zero') { await tx.stockCountLine.update({ where: { id: line.id }, data: { varianceQuantity: '0', fifoCostTotal: '0', valuationMetadata: { ...(line.valuationMetadata as object ?? {}), reservedAtPost: reserved } } }); results.push({ lineId: line.id.toString(), variance: 0, cost: 0 }); continue }

      const quantity = Math.abs(plan.variance)
      let movement: { id: bigint }
      if (plan.direction === 'positive') {
        const unitCost = Number(basis)
        // This is explicitly an adjustment layer, never a supplier receipt.
        const batch = await tx.inventoryBatch.create({ data: { inventoryItemId: line.inventoryItemId, branchId: locked.branchId, originalQuantity: quantity.toFixed(3), remainingQuantity: quantity.toFixed(3), remainingCostQuantity: quantity.toFixed(3), unitCost: unitCost.toFixed(4), supplierReference: `stock-count-adjustment:${locked.id.toString()}`, createdById: session.id } })
        movement = await tx.inventoryTransaction.create({ data: { inventoryItemId: line.inventoryItemId, branchId: locked.branchId, type: 'adjustment', quantity: quantity.toFixed(3), quantityAfter: round3(current + quantity).toFixed(3), unitCost: unitCost.toFixed(4), costTotal: plan.cost.toFixed(2), referenceType: 'stock_count_positive', referenceId: locked.id, createdById: session.id, notes: 'Stock count positive variance' } })
        await tx.inventoryBatchAllocation.createMany({ data: [{ inventoryBatchId: batch.id, inventoryTransactionId: movement.id, allocationType: 'physical', quantity: quantity.toFixed(3), unitCost: unitCost.toFixed(4) }, { inventoryBatchId: batch.id, inventoryTransactionId: movement.id, allocationType: 'fifo_cost', quantity: quantity.toFixed(3), unitCost: unitCost.toFixed(4) }] })
        await tx.inventoryItem.update({ where: { id: line.inventoryItemId }, data: { currentStock: round3(current + quantity).toFixed(3) } })
      } else {
        const physical = await tx.inventoryBatch.findMany({ where: { branchId: locked.branchId, inventoryItemId: line.inventoryItemId, remainingQuantity: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }, orderBy: [{ expiresAt: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }] })
        let leftPhysical = quantity; const physicalParts: { id: bigint; quantity: number; unitCost: number }[] = []
        for (const batch of physical) { if (leftPhysical <= 1e-9) break; await tx.$queryRaw`SELECT id FROM inventory_batches WHERE id = ${batch.id} FOR UPDATE`; const take = Math.min(leftPhysical, Number(batch.remainingQuantity)); if (take > 0) { physicalParts.push({ id: batch.id, quantity: take, unitCost: Number(batch.unitCost) }); leftPhysical = round3(leftPhysical - take) } }
        if (leftPhysical > 1e-9) throw new StockCountError('Insufficient FEFO physical batches for negative variance', 409)
        let leftCost = quantity; const costParts: { id: bigint; quantity: number; unitCost: number }[] = []
        for (const batch of fifo) { if (leftCost <= 1e-9) break; await tx.$queryRaw`SELECT id FROM inventory_batches WHERE id = ${batch.id} FOR UPDATE`; const take = Math.min(leftCost, Number(batch.remainingCostQuantity)); if (take > 0) { costParts.push({ id: batch.id, quantity: take, unitCost: Number(batch.unitCost) }); leftCost = round3(leftCost - take) } }
        if (leftCost > 1e-9) throw new StockCountError('Insufficient FIFO cost layers for negative variance', 409)
        movement = await tx.inventoryTransaction.create({ data: { inventoryItemId: line.inventoryItemId, branchId: locked.branchId, type: 'adjustment', quantity: (-quantity).toFixed(3), quantityAfter: round3(current - quantity).toFixed(3), unitCost: quantity ? (plan.cost / quantity).toFixed(4) : '0', costTotal: plan.cost.toFixed(2), referenceType: 'stock_count_negative', referenceId: locked.id, createdById: session.id, notes: 'Stock count negative variance' } })
        for (const p of physicalParts) { const b = physical.find(x => x.id === p.id)!; await tx.inventoryBatch.update({ where: { id: p.id }, data: { remainingQuantity: round3(Number(b.remainingQuantity) - p.quantity).toFixed(3) } }) }
        for (const p of costParts) { const b = fifo.find(x => x.id === p.id)!; await tx.inventoryBatch.update({ where: { id: p.id }, data: { remainingCostQuantity: round3(Number(b.remainingCostQuantity) - p.quantity).toFixed(3) } }) }
        await tx.inventoryBatchAllocation.createMany({ data: [...physicalParts.map(p => ({ inventoryBatchId: p.id, inventoryTransactionId: movement.id, allocationType: 'physical', quantity: p.quantity.toFixed(3), unitCost: p.unitCost.toFixed(4) })), ...costParts.map(p => ({ inventoryBatchId: p.id, inventoryTransactionId: movement.id, allocationType: 'fifo_cost', quantity: p.quantity.toFixed(3), unitCost: p.unitCost.toFixed(4) }))] })
        await tx.inventoryItem.update({ where: { id: line.inventoryItemId }, data: { currentStock: round3(current - quantity).toFixed(3) } })
        const waste = await tx.wasteEvent.create({ data: { branchId: locked.branchId, responsibleId: locked.responsibleId, recordedById: session.id, quantity: quantity.toFixed(3), cause: 'stock_count_variance', reason: `Stock count #${locked.id.toString()} negative variance`, costTotal: plan.cost.toFixed(2) } })
        await tx.employeeAccountability.create({ data: { branchId: locked.branchId, employeeId: locked.responsibleId, wasteEventId: waste.id, amount: plan.cost.toFixed(2) } })
      }
      await tx.stockCountLine.update({ where: { id: line.id }, data: { varianceQuantity: plan.variance.toFixed(3), fifoCostTotal: plan.cost.toFixed(2), postedTransactionId: movement.id, valuationMetadata: { ...(line.valuationMetadata as object ?? {}), reservedAtPost: reserved, fifoCost: plan.cost, postingDirection: plan.direction } } })
      results.push({ lineId: line.id.toString(), transactionId: movement.id.toString(), variance: plan.variance, cost: plan.cost })
    }
    const posted = await tx.stockCount.update({ where: { id: locked.id }, data: { status: 'posted', postedAt: new Date(), postedById: session.id } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: locked.branchId, action: 'stock_count.post', entityType: 'stock_count', entityId: locked.id, newValues: { lines: results } } })
    return { id: posted.id.toString(), status: posted.status, idempotent: false, lines: results }
  }, { isolationLevel: 'Serializable' })
}

export async function cancelStockCount(session: StaffSession, countId: string, reason: string) { manager(session); const count = await ownedCount(session, countId); if (!reason.trim()) throw new StockCountError('Cancellation reason is required', 400); const result = await prisma.stockCount.updateMany({ where: { id: count.id, status: { in: ['draft', 'counting', 'submitted'] } }, data: { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason.trim() } }); if (!result.count) throw new StockCountError('Posted counts are immutable', 409); return prisma.stockCount.findUniqueOrThrow({ where: { id: count.id } }) }
