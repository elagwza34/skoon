import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { sendOrderToKitchen, OrderError } from '@/lib/staff-orders'

/**
 * Send a `new` order to the kitchen — POST /api/staff/orders/[id]/send.
 * The waiter's "إرسال للمطبخ" action: stamps sent_to_kitchen_at and rings the
 * kitchen bell, all inside one transaction. The order stays `new` until a cook
 * accepts it. Idempotency and the status guard live in sendOrderToKitchen.
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  try {
    const result = await sendOrderToKitchen(session, id)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: 'Send failed' }, { status: 500 })
  }
}
