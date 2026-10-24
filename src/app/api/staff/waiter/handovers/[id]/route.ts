import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { acceptWaiterResponsibilityHandover, rejectWaiterResponsibilityHandover } from '@/lib/staff-waiter-operations'
import { OrderError } from '@/lib/staff-orders'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({})) as { action?: string; reason?: string }
    if (body.action === 'reject') return NextResponse.json(await rejectWaiterResponsibilityHandover(session, id, { reason: body.reason }))
    return NextResponse.json(await acceptWaiterResponsibilityHandover(session, id))
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Waiter handover action failed' }, { status: 500 })
  }
}
