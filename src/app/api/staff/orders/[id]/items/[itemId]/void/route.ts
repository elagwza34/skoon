import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { OrderItemVoidError, voidOpenOrderItem } from '@/lib/staff-order-item-void'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id, itemId } = await params
  try {
    const body = await req.json() as Record<string, unknown>
    return NextResponse.json(await voidOpenOrderItem(session, id, itemId, { ...body, idempotencyKey: req.headers.get('idempotency-key') ?? body.idempotencyKey }))
  } catch (error) {
    if (error instanceof OrderItemVoidError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Item removal failed' }, { status: 500 })
  }
}
