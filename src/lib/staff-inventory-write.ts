import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'

/**
 * Inventory write — server-only. Manager+ only, branch-scoped.
 *
 * Movement types (stored in InventoryTransaction.type, VarChar(20)):
 *   inbound    استلام/شراء  → currentStock += qty          (qty > 0)
 *   outbound   صرف/استهلاك  → currentStock -= qty          (qty > 0, cannot exceed stock)
 *   adjustment تسوية جرد    → currentStock = countedValue  (countedValue >= 0)
 *
 * Concurrency: the item row is locked with SELECT … FOR UPDATE inside the
 * transaction, so two concurrent adjustments cannot overwrite each other
 * (no lost updates, stock never corrupted). quantityAfter is written on every
 * movement so currentStock always equals the latest quantityAfter.
 */

export type MovementType = 'inbound' | 'outbound' | 'adjustment'

export class InventoryError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'InventoryError'
    this.status = status
  }
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  inbound: 'استلام',
  outbound: 'صرف',
  adjustment: 'تسوية جرد',
}

const movementSchema = z.object({
  type: z.enum(['inbound', 'outbound', 'adjustment']),
  // inbound/outbound: quantity to move. adjustment: the counted actual stock.
  quantity: z.coerce.number().positive('الكمية يجب أن تكون أكبر من صفر').max(9_999_999),
  notes: z.string().trim().max(255).optional(),
})

export interface MovementResult {
  id: string
  type: MovementType
  delta: string
  quantityAfter: string
}

export async function recordInventoryMovement(
  session: StaffSession,
  itemIdRaw: string,
  input: unknown,
): Promise<MovementResult> {
  if (!hasAtLeast(session.role, ROLE.MANAGER)) throw new InventoryError('غير مصرح', 403)
  if (!/^\d+$/.test(itemIdRaw)) throw new InventoryError('الصنف غير موجود', 404)

  const parsed = movementSchema.safeParse(input)
  if (!parsed.success) throw new InventoryError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { type, quantity, notes } = parsed.data

  const branchId = session.role === ROLE.OWNER ? null : BigInt(session.branchId as string)
  const item = await prisma.inventoryItem.findFirst({
    where: {
      id: BigInt(itemIdRaw),
      deletedAt: null,
      isActive: true,
      ...(branchId ? { branchId } : {}),
    },
    select: { id: true, branchId: true, name: true, currentStock: true },
  })
  if (!item) throw new InventoryError('الصنف غير موجود', 404)
  if (!staffCanAccessBranch(session, item.branchId)) throw new InventoryError('Forbidden', 403)

  const result = await prisma.$transaction(async (tx) => {
    // Lock the row for the duration of the transaction (Postgres row lock).
    const locked = await tx.$queryRaw<{ current_stock: unknown }[]>`
      SELECT current_stock FROM inventory_items WHERE id = ${item.id} FOR UPDATE
    `
    const currentStock = Number(locked[0]?.current_stock ?? 0)

    let delta: number
    let newStock: number
    if (type === 'inbound') {
      delta = quantity
      newStock = round2(currentStock + quantity)
    } else if (type === 'outbound') {
      if (quantity > currentStock + 1e-9)
        throw new InventoryError('الكمية المصروفة أكبر من المخزون الحالي', 400)
      delta = -quantity
      newStock = round2(currentStock - quantity)
    } else {
      // adjustment → set to the counted value
      delta = round2(quantity - currentStock)
      newStock = round2(quantity)
    }
    if (newStock < 0) throw new InventoryError('المخزون لا يمكن أن يكون سالباً', 400)

    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { currentStock: newStock.toFixed(2) },
    })

    const txn = await tx.inventoryTransaction.create({
      data: {
        inventoryItemId: item.id,
        branchId: item.branchId,
        type,
        quantity: delta.toFixed(2),
        quantityAfter: newStock.toFixed(2),
        referenceType: 'manual',
        createdById: session.id,
        notes: notes?.trim() || null,
      },
      select: { id: true },
    })

    return {
      id: txn.id.toString(),
      type,
      delta: delta.toFixed(2),
      quantityAfter: newStock.toFixed(2),
    }
  })

  return result
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
