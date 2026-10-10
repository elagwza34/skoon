import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { transitionOrderStatus, OrderError } from '@/lib/staff-orders'

/**
 * Staff order status transition — POST /api/staff/orders/[id]/status.
 * Body: { to: 'preparing' | 'ready' | 'served' | 'cancelled' }.
 *
 * Authorization: a valid staff session is required (middleware guarantees
 * identity; here we resolve the trusted role/branch). The legal transition and
 * minimum role are enforced in transitionOrderStatus; each change is recorded
 * in order_status_history within the same transaction.
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const to = (body as { to?: unknown })?.to
  if (typeof to !== 'string') {
    return NextResponse.json({ error: 'Missing "to" status' }, { status: 400 })
  }

  try {
    const result = await transitionOrderStatus(session, id, to)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'Status update failed' }, { status: 500 })
  }
}
