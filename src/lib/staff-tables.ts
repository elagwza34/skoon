import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'

/** Staff tables — real branch tables + live occupancy from open orders. */
export interface StaffTable {
  id: string
  number: string
  name: string | null
  capacity: number
  status: 'available' | 'occupied'
  publicToken: string
  openOrders: number
  floorPlanZone: string | null
  floorPlanX: number | null
  floorPlanY: number | null
  floorPlanRotation: number
}

export async function getStaffTables(session: StaffSession): Promise<StaffTable[]> {
  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [tables, active] = await Promise.all([
    prisma.cafeTable.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, name: true, capacity: true, publicToken: true, sortOrder: true, floorPlanZone: true, floorPlanX: true, floorPlanY: true, floorPlanRotation: true },
    }),
    prisma.order.groupBy({
      by: ['cafeTableId'],
      where: { ...branchScope, status: { in: ['new', 'preparing', 'ready'] } },
      _count: { _all: true },
    }),
  ])
  const openByTable = new Map(active.map((a) => [a.cafeTableId.toString(), a._count._all]))
  return tables.map((t) => {
    const open = openByTable.get(t.id.toString()) ?? 0
    return {
      id: t.id.toString(), number: t.number, name: t.name, capacity: t.capacity,
      status: open > 0 ? ('occupied' as const) : ('available' as const),
      publicToken: t.publicToken, openOrders: open,
      floorPlanZone: t.floorPlanZone, floorPlanX: t.floorPlanX === null ? null : Number(t.floorPlanX), floorPlanY: t.floorPlanY === null ? null : Number(t.floorPlanY), floorPlanRotation: t.floorPlanRotation,
    }
  })
}

/**
 * Re-number all active tables in a branch so their `number` and `sortOrder`
 * are consecutive starting at 1, ordered by current sortOrder then number.
 * Safe to call after create/update/archive because orders reference cafeTableId,
 * not the display number.
 */
export async function renumberTables(branchId: bigint): Promise<void> {
  const tables = await prisma.cafeTable.findMany({
    where: { branchId, isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
    select: { id: true },
  })
  await prisma.$transaction(
    tables.map((table, index) =>
      prisma.cafeTable.update({
        where: { id: table.id },
        data: { number: String(index + 1), sortOrder: index + 1 },
      })
    )
  )
}
