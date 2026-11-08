import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { serveOrderItems, OrderError } from '@/lib/staff-orders'

/**
 * Serve order items — POST /api/staff/orders/[id]/items/serve.
 * Waiter marks specific order items as served. Idempotency handled in the writer.
 */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params

  let body: { items?: { orderItemId: string; quantity: number }[]; idempotencyKey?: unknown; interventionReason?: unknown }
  try {
    body = await _req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await serveOrderItems(session, id, { items: body.items ?? [], interventionReason: body.interventionReason, idempotencyKey: _req.headers.get('idempotency-key') ?? body.idempotencyKey })
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Item serving failed' }, { status: 500 })
  }
}
