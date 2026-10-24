import { NextResponse } from 'next/server'
import { getStaffSession, staffCanAccessBranch } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { ROLE, hasPermission } from '@/lib/authz'
import { forbiddenStaffResponse, unauthenticatedStaffResponse } from '@/lib/api-auth-response'
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession(); if (!session) return unauthenticatedStaffResponse(); if (session.role !== ROLE.OWNER && !hasPermission(session.permissions, 'inventory.view') && !hasPermission(session.permissions, 'inventory.manage')) return forbiddenStaffResponse()
  const { id } = await params; if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  const count = await prisma.stockCount.findUnique({ where: { id: BigInt(id) }, include: { responsible: { select: { name: true } }, postedBy: { select: { name: true } }, lines: { include: { inventoryItem: { select: { name: true, unit: true } }, inventoryBatch: { select: { id: true, expiresAt: true } } } } } })
  if (!count || !staffCanAccessBranch(session, count.branchId)) return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  // Prisma BigInt/Decimal values are not JSON serialisable by Next's response
  // helper. Convert only at the HTTP boundary; database values stay exact.
  return NextResponse.json({ count: JSON.parse(JSON.stringify(count, (_, value) => typeof value === 'bigint' ? value.toString() : value)) })
}
