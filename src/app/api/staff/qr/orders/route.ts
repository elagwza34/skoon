import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ROLE, isOwner } from '@/lib/authz'
import { staffCanAccessBranch, getStaffSession } from '@/lib/session'
import { getOpenShift } from '@/lib/staff-shifts'
import { listUnclaimedQrOrders, claimQrOrder } from '@/lib/staff-waiter-operations'

const bodySchema = z.object({ orderId: z.string().regex(/^\d+$/, 'Invalid order id') })

export async function GET() {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!isOwner(session.role) && session.role !== ROLE.WAITER) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (session.role === ROLE.WAITER && (!staffCanAccessBranch(session, BigInt(session.branchId as string)))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (session.role === ROLE.WAITER && session.branchId && !isOwner(session.role)) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) return NextResponse.json({ error: 'An open shift is required' }, { status: 409 })
  }
  const orders = await listUnclaimedQrOrders(session)
  return NextResponse.json({ orders })
}

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.WAITER) return NextResponse.json({ error: 'Waiter access required' }, { status: 403 })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid claim payload' }, { status: 400 })
  const orderId = parsed.data.orderId
  try {
    const result = await claimQrOrder(session, orderId)
    return NextResponse.json({ claimed: result, idempotent: result.idempotent })
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      return NextResponse.json({ error: error.message }, { status: (error as { status: number }).status })
    }
    return NextResponse.json({ error: 'Could not claim order' }, { status: 409 })
  }
}
