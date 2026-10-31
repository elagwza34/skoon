import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ROLE, isOwner } from '@/lib/authz'
import { staffCanAccessBranch, getStaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'
import { listMyOrders } from '@/lib/staff-orders'

const bodySchema = z.object({ limit: z.number().int().min(1).max(200).optional() })

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!isOwner(session.role) && session.role !== ROLE.WAITER) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.role === ROLE.WAITER && (!staffCanAccessBranch(session, BigInt(session.branchId as string))) ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (session.role === ROLE.WAITER && session.branchId && !isOwner(session.role)) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) return NextResponse.json({ error: 'An open shift is required' }, { status: 409 })
  }
  const parsed = bodySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  const orders = await listMyOrders(session, { limit: parsed.success ? parsed.data.limit : undefined })
  return NextResponse.json({ orders })
}
