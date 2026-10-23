import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { StockCountError, createStockCount } from '@/lib/staff-stock-count-write'
import { ROLE, hasPermission } from '@/lib/authz'

function mayView(session: NonNullable<Awaited<ReturnType<typeof getStaffSession>>>) {
  return session.role === ROLE.OWNER || hasPermission(session.permissions, 'inventory.view') || hasPermission(session.permissions, 'inventory.manage')
}
export async function GET() {
  const session = await getStaffSession(); if (!session || !mayView(session)) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  const branchId = session.role === ROLE.OWNER ? undefined : BigInt(session.branchId!)
  const rows = await prisma.stockCount.findMany({ where: branchId ? { branchId } : {}, include: { responsible: { select: { name: true } }, _count: { select: { lines: true } } }, orderBy: { createdAt: 'desc' }, take: 100 })
  return NextResponse.json({ counts: rows.map(r => ({ ...r, id: r.id.toString(), branchId: r.branchId.toString(), responsible: r.responsible.name })) })
}
export async function POST(request: Request) {
  const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
  try { const count = await createStockCount(session, await request.json()); return NextResponse.json({ count: { id: count.id.toString(), status: count.status } }, { status: 201 }) }
  catch (error) { const e = error instanceof StockCountError ? error : null; return NextResponse.json({ error: e?.message ?? 'بيانات غير صالحة' }, { status: e?.status ?? 400 }) }
}
