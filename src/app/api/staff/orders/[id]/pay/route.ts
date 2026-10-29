import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { finalizeOrderPayment, refundOrderPayment, PaymentError } from '@/lib/staff-payments-write'
import { FinancialShiftLockError } from '@/lib/financial-shift-lock'
import { getCashierInvoices } from '@/lib/staff-invoices'
import { paymentServiceInputFromRequest } from '@/lib/payment-request'

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

  // Waiters cannot collect payments or settle invoices
  if (session.role === 'waiter') return NextResponse.json({ error: 'غير مصرح — التحصيل والحصر النقدي للكاشير فقط' }, { status: 403 })

  const { id } = await ctx.params
  let body: { action?: string } & Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const bodyIdempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : null
    const idempotencyKey = req.headers.get('idempotency-key') ?? bodyIdempotencyKey
    if (body.action === 'pay') {
      const result = await finalizeOrderPayment(session, id, paymentServiceInputFromRequest(body, idempotencyKey))
      // Print only a post-settlement, persisted invoice. The client must never
      // render a receipt from its pre-payment editing snapshot.
      const invoice = (await getCashierInvoices(session)).find((row) => row.id === result.orderId)
      if (!invoice) return NextResponse.json({ error: 'Payment recorded but the updated invoice could not be loaded.' }, { status: 503 })
      return NextResponse.json({ ...result, invoice }, { status: 201 })
    }
    if (body.action === 'refund') {
      const result = await refundOrderPayment(session, id, { reason: body.reason, idempotencyKey })
      return NextResponse.json(result, { status: 200 })
    }
    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (e) {
    if (e instanceof PaymentError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (e instanceof FinancialShiftLockError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'فشلت العملية' }, { status: 500 })
  }
}
