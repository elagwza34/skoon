import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isOwner } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { getStaffSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

const layoutSchema = z.object({
  tables: z.array(z.object({
    id: z.string().regex(/^\d+$/), zone: z.string().trim().max(80).nullable(),
    x: z.number().min(0).max(100).nullable(), y: z.number().min(0).max(100).nullable(),
    rotation: z.number().int().min(0).max(359),
  })).min(1).max(500),
})

/** Owner-only persisted table layout. Branch/table identity always comes from DB. */
export async function PATCH(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!isOwner(session.role)) return NextResponse.json({ error: 'Owner authorization is required' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const parsed = layoutSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid table layout' }, { status: 400 })
  try {
    await prisma.$transaction(async (tx) => {
      const ids = parsed.data.tables.map((table) => BigInt(table.id))
      const existing = await tx.cafeTable.findMany({ where: { id: { in: ids }, isActive: true, deletedAt: null }, select: { id: true, branchId: true } })
      if (existing.length !== ids.length) throw new Error('A selected table is unavailable')
      for (const table of parsed.data.tables) {
        const current = existing.find((row) => row.id === BigInt(table.id))!
        await tx.cafeTable.update({ where: { id: current.id }, data: { floorPlanZone: table.zone || null, floorPlanX: table.x, floorPlanY: table.y, floorPlanRotation: table.rotation } })
        await tx.auditLog.create({ data: { userId: session.id, branchId: current.branchId, action: 'tables.floor_plan_update', entityType: 'cafe_table', entityId: current.id, newValues: { zone: table.zone, x: table.x, y: table.y, rotation: table.rotation } } })
      }
    })
    return NextResponse.json({ saved: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save table layout' }, { status: 422 })
  }
}
