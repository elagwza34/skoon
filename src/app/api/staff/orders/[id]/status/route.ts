import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { transitionOrderStatus, sendOrderToKitchen, OrderError } from '@/lib/staff-orders'

/**
 * Staff order status transition — POST /api/staff/orders/[id]/status.
 * Body: { action: 'status', to: 'preparing' | 'ready' | 'served' | 'cancelled' }
 *    or { action: 'send_to_kitchen' }   (waiter pushes a `new` order to the kitchen)
 *
 * Authorization: a valid staff session is required (middleware guarantees
 * identity; here we resolve the trusted role/branch). The legal transition and
 * minimum role are enforced in the writers; each change is recorded in
 * order_status_history within the same transaction (status) or stamped with a
 * kitchen notification (send_to_kitchen).
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params

  let body: { action?: string; to?: unknown; reason?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // "إرسال للمطبخ" — the waiter hands a new order to the kitchen (no status change).
  if (body.action === 'send_to_kitchen') {
    try {
      return NextResponse.json(await sendOrderToKitchen(session, id))
    } catch (e) {
      if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status })
      return NextResponse.json({ error: 'Send to kitchen failed' }, { status: 500 })
    }
  }

  const to = body.to
  if (typeof to !== 'string') {
    return NextResponse.json({ error: 'Missing "to" status' }, { status: 400 })
  }

  try {
    const result = await transitionOrderStatus(session, id, to, body.reason)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'Status update failed' }, { status: 500 })
  }
}
