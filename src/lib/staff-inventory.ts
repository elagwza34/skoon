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

export async function getStaffInventory(session: StaffSession): Promise<{ items: InventoryRow[]; movements: InventoryMovement[] }> {
  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [items, movements] = await Promise.all([
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
  ])

  return {
    items: items.map((i) => {
      const qty = Number(i.currentStock)
      const min = Number(i.minStock)
      return {
        id: i.id.toString(), name: i.name, unit: i.unit,
        qty: i.currentStock.toString(), minQty: i.minStock.toString(),
        isLow: qty <= min,
      }
    }),
    movements: movements.map((m) => ({
      id: m.id.toString(), itemName: m.inventoryItem.name, type: m.type,
      qty: m.quantity.toString(), reason: m.notes,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}
