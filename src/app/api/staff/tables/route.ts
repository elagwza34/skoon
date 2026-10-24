import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isOwner } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { getStaffSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

const id = z.string().regex(/^\d+$/)
const tableInput = z.object({ branchId: id, number: z.string().trim().min(1).max(20), name: z.string().trim().max(50).nullable().optional(), capacity: z.coerce.number().int().min(1).max(100), zone: z.string().trim().max(80).nullable().optional() })

function token() { return randomBytes(8).toString('hex') }
function denied() { return NextResponse.json({ error: 'Owner authorization is required' }, { status: 403 }) }

/** Owner-only administrative table CRUD. Operational occupancy is never mutated here. */
export async function POST(req: Request) {
  const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); if (!isOwner(session.role)) return denied()
  const parsed = tableInput.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: 'Invalid table details' }, { status: 400 })
  const value = parsed.data; const branchId = BigInt(value.branchId)
  try {
    const row = await prisma.$transaction(async (tx) => {
      const branch = await tx.cafeBranch.findFirst({ where: { id: branchId, isActive: true }, select: { id: true } }); if (!branch) throw new Error('Branch is unavailable')
      const exists = await tx.cafeTable.findFirst({ where: { branchId, number: value.number, deletedAt: null }, select: { id: true } }); if (exists) throw new Error('A table with this number already exists')
      const created = await tx.cafeTable.create({ data: { branchId, number: value.number, name: value.name || null, capacity: value.capacity, floorPlanZone: value.zone || null, publicToken: token() } })
      await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'tables.create', entityType: 'cafe_table', entityId: created.id, newValues: { number: value.number, capacity: value.capacity } } })
      return created
    })
    return NextResponse.json({ table: { id: row.id.toString(), number: row.number } }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create table' }, { status: 409 }) }
}

export async function PATCH(req: Request) {
  const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); if (!isOwner(session.role)) return denied()
  const body = await req.json().catch(() => null); const tableId = typeof body?.id === 'string' ? body.id : ''; const parsed = tableInput.omit({ branchId: true }).safeParse(body); if (!id.safeParse(tableId).success || !parsed.success) return NextResponse.json({ error: 'Invalid table details' }, { status: 400 })
  try { await prisma.$transaction(async (tx) => { const current = await tx.cafeTable.findFirst({ where: { id: BigInt(tableId), deletedAt: null }, select: { id: true, branchId: true } }); if (!current) throw new Error('Table not found'); const clash = await tx.cafeTable.findFirst({ where: { branchId: current.branchId, number: parsed.data.number, deletedAt: null, id: { not: current.id } }, select: { id: true } }); if (clash) throw new Error('A table with this number already exists'); await tx.cafeTable.update({ where: { id: current.id }, data: { number: parsed.data.number, name: parsed.data.name || null, capacity: parsed.data.capacity, floorPlanZone: parsed.data.zone || null } }); await tx.auditLog.create({ data: { userId: session.id, branchId: current.branchId, action: 'tables.update', entityType: 'cafe_table', entityId: current.id, newValues: { number: parsed.data.number } } }) }); return NextResponse.json({ updated: true }) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update table' }, { status: 409 }) }
}

export async function DELETE(req: Request) {
  const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 }); if (!isOwner(session.role)) return denied()
  const tableId = new URL(req.url).searchParams.get('id') ?? ''; if (!id.safeParse(tableId).success) return NextResponse.json({ error: 'Invalid table id' }, { status: 400 })
  try { await prisma.$transaction(async (tx) => { const table = await tx.cafeTable.findFirst({ where: { id: BigInt(tableId), deletedAt: null }, select: { id: true, branchId: true } }); if (!table) throw new Error('Table not found'); const active = await tx.order.count({ where: { cafeTableId: table.id, status: { in: ['new', 'preparing', 'ready'] } } }); if (active) throw new Error('A table with active orders cannot be archived'); await tx.cafeTable.update({ where: { id: table.id }, data: { isActive: false, deletedAt: new Date() } }); await tx.auditLog.create({ data: { userId: session.id, branchId: table.branchId, action: 'tables.archive', entityType: 'cafe_table', entityId: table.id, newValues: {} } }) }); return NextResponse.json({ archived: true }) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not archive table' }, { status: 409 }) }
}
