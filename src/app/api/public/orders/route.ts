import { NextResponse } from 'next/server'
import { createPublicOrder } from '@/lib/public-orders'

/**
 * Public QR order endpoint — POST /api/public/orders.
 * No auth (customer scans a table QR). All pricing is done server-side
 * from the DB in createPublicOrder; the client price is never trusted.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const order = await createPublicOrder(body as never)
    return NextResponse.json(order, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Order failed'
    // Client-controllable input problems are 4xx; anything else is a server fault.
    const clientErrors = [
      'Invalid',
      'Table not found',
      'Menu changed',
    ]
    const status = clientErrors.some((m) => message.includes(m)) ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
