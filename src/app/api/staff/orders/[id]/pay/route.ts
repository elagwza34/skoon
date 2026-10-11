import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { finalizeOrderPayment, refundOrderPayment, PaymentError } from '@/lib/staff-payments-write'

/**
 * Staff payments — POST /api/staff/orders/[id]/pay
 *   { action: 'pay',    method: 'cash'|'card'|'online', received? }  cashier+
 *   { action: 'refund', reason }                                      manager+
 * Amounts are always computed server-side from the order row.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  let body: { action?: string } & Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    if (body.action === 'pay') {
      const result = await finalizeOrderPayment(session, id, { method: body.method, received: body.received })
      return NextResponse.json(result, { status: 201 })
    }
    if (body.action === 'refund') {
      const result = await refundOrderPayment(session, id, { reason: body.reason })
      return NextResponse.json(result, { status: 200 })
    }
    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (e) {
    if (e instanceof PaymentError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'فشلت العملية' }, { status: 500 })
  }
}
