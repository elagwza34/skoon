import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { adjustOrderItem, OrderItemAdjustmentError } from '@/lib/staff-order-item-adjustment'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id, itemId } = await params
  try {
    const body: unknown = await req.json()
    const record = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
    return NextResponse.json(await adjustOrderItem(session, id, itemId, { ...record, idempotencyKey: req.headers.get('idempotency-key') ?? record.idempotencyKey }))
  } catch (error) {
    if (error instanceof OrderItemAdjustmentError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Order item adjustment failed' }, { status: 500 })
  }
}
