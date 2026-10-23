import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'

/**
 * Staff inventory — real stock items + recent movements from the DB.
 * Branch-scoped. Server-only. Quantities shown as recorded (no fabrication).
 */
export interface InventoryRow {
  id: string
  name: string
  unit: string
  qty: string
  reservedQty: string
  availableQty: string
  minQty: string | null
  isLow: boolean
}

export interface InventoryMovement {
  id: string
  itemName: string
  type: string
  qty: string
  reason: string | null
  createdAt: string
}
export interface InventoryBatchRow {
  id: string; itemName: string; remainingQty: string; remainingCostQty: string
  unitCost: string; expiresAt: string | null; receivedAt: string; supplierReference: string | null
  state: 'expired' | 'expiring' | 'available'
}

export async function getStaffInventory(session: StaffSession): Promise<{ items: InventoryRow[]; movements: InventoryMovement[]; batches: InventoryBatchRow[] }> {
  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [items, movements, reservations, batches] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { ...branchScope, deletedAt: null },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, name: true, unit: true, currentStock: true, minStock: true },
    }),
    prisma.inventoryTransaction.findMany({
      where: { ...branchScope },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, type: true, quantity: true, notes: true, createdAt: true,
        inventoryItem: { select: { name: true } },
      },
    }),
    prisma.inventoryReservation.groupBy({
      by: ['inventoryItemId'],
      where: { ...branchScope, status: 'active' },
      _sum: { quantity: true },
    }),
    prisma.inventoryBatch.findMany({ where: { ...branchScope, remainingQuantity: { gt: 0 } }, orderBy: [{ expiresAt: 'asc' }, { receivedAt: 'asc' }], take: 200, select: { id: true, remainingQuantity: true, remainingCostQuantity: true, unitCost: true, expiresAt: true, receivedAt: true, supplierReference: true, inventoryItem: { select: { name: true } } } }),
  ])

  const reservedByItem = new Map(reservations.map((r) => [r.inventoryItemId.toString(), Number(r._sum.quantity ?? 0)]))

  return {
    items: items.map((i) => {
      const qty = Number(i.currentStock)
      const min = Number(i.minStock)
      const reserved = reservedByItem.get(i.id.toString()) ?? 0
      const available = qty - reserved
      return {
        id: i.id.toString(), name: i.name, unit: i.unit,
        qty: i.currentStock.toString(), reservedQty: reserved.toFixed(3), availableQty: available.toFixed(3), minQty: i.minStock.toString(),
        isLow: available <= min,
      }
    }),
    movements: movements.map((m) => ({
      id: m.id.toString(), itemName: m.inventoryItem.name, type: m.type,
      qty: m.quantity.toString(), reason: m.notes,
      createdAt: m.createdAt.toISOString(),
    })),
    batches: batches.map((b) => {
      const days = b.expiresAt ? (b.expiresAt.getTime() - Date.now()) / 86_400_000 : Infinity
      return { id: b.id.toString(), itemName: b.inventoryItem.name, remainingQty: b.remainingQuantity.toString(), remainingCostQty: b.remainingCostQuantity.toString(), unitCost: b.unitCost.toString(), expiresAt: b.expiresAt?.toISOString() ?? null, receivedAt: b.receivedAt.toISOString(), supplierReference: b.supplierReference, state: days < 0 ? 'expired' : days <= 7 ? 'expiring' : 'available' }
    }),
  }
}
