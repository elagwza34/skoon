import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { appendOrderItems, appendOrderItemsSchema, OrderError } from '@/lib/staff-orders'

/** Staff order item append — POST /api/staff/orders/[id]/items/append.
 * Body: { items: [{ productId, variantId?, modifierSelections[], qty, note? }], idempotencyKey? }
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

  try {
    const result = await appendOrderItems(session, id, body)
    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    console.error('[Order items append] unexpected error:', e)
    if (e instanceof OrderError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Failed to append items' }, { status: 500 })
  }
}
