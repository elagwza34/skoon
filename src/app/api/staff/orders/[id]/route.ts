import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { editWaiterOrder, OrderError } from '@/lib/staff-orders'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  try {
    const body: unknown = await req.json()
    return NextResponse.json(await editWaiterOrder(session, id, body))
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Order edit failed' }, { status: 500 })
  }
}
