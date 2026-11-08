import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import {
  finalizeOrderPayment,
  confirmElectronicPayment,
  requestRefund,
  decideRefund,
  executeRefund,
  cancelRefund,
  getRefunds,
  PaymentError,
  type RefundResult,
} from '@/lib/staff-payments-write'
import { FinancialShiftLockError } from '@/lib/financial-shift-lock'
import { getCashierInvoices } from '@/lib/staff-invoices'
import { paymentServiceInputFromRequest } from '@/lib/payment-request'

/**
 * Staff payments — POST /api/staff/orders/[id]/pay
 *   { action: 'pay',    method, received?, electronicPaymentConfirmed?,
 *             externalTransactionReference?, confirmationNote? }  cashier+
 *   { action: 'refund_request', orderId, paymentId, amount, reason }    cashier+
 *   { action: 'refund_decide',   refundId, approve, note? }            manager+
 *   { action: 'refund_execute',  refundId, externalReference?, evidenceNote? } cashier+/manager+
 *   { action: 'refund_cancel',   refundId, reason? }                    requester/manager+
 * Amounts are always computed server-side from the order row.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Waiters and Managers cannot collect payments or settle invoices — cash custody is Cashier/Owner only
  if (session.role === 'waiter' || session.role === 'manager') return NextResponse.json({ error: 'غير مصرح — التحصيل والحصر النقدي للكاشير أو المالك فقط' }, { status: 403 })

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
      const input = paymentServiceInputFromRequest(body, idempotencyKey)
      const method = typeof body.method === 'string' ? body.method : null
      const result = method === 'cash'
        ? await finalizeOrderPayment(session, id, input)
        : await confirmElectronicPayment(session, id, input)
      const invoice = (await getCashierInvoices(session, { orderId: BigInt(result.orderId) }))[0]
      if (!invoice) return NextResponse.json({ error: 'Payment recorded but the updated invoice could not be loaded.' }, { status: 503 })
      return NextResponse.json({ ...result, invoice }, { status: 201 })
    }

    if (body.action === 'refund_request') {
      const result = await requestRefund(session, id, { ...body, idempotencyKey: idempotencyKey ?? undefined })
      return NextResponse.json(result, { status: 201 })
    }

    if (body.action === 'refund_decide') {
      const result = await decideRefund(session, body)
      return NextResponse.json(result, { status: 200 })
    }

    if (body.action === 'refund_execute') {
      const result = await executeRefund(session, { ...body, idempotencyKey: idempotencyKey ?? undefined })
      return NextResponse.json(result, { status: 200 })
    }

    if (body.action === 'refund_cancel') {
      const result = await cancelRefund(session, body)
      return NextResponse.json(result, { status: 200 })
    }

    // Legacy refund action — replaced by refund_request lifecycle.
    if (body.action === 'refund') {
      return NextResponse.json({ error: 'استخدم إجراء refund_request لإنشاء طلب استرداد جديد' }, { status: 410 })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (e) {
    if (e instanceof PaymentError) return NextResponse.json({ error: e.message }, { status: e.status })
    if (e instanceof FinancialShiftLockError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'فشلت العملية' }, { status: 500 })
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  const search = new URL(req.url).searchParams
  const from = search.get('from') ?? undefined
  const to = search.get('to') ?? undefined
  const branchId = search.get('branchId') ?? undefined
  const status = search.get('status') ?? undefined

  try {
    const refunds = await getRefunds(session, { from, to, branchId, status })
    return NextResponse.json({ refunds }, { status: 200 })
  } catch (e) {
    if (e instanceof PaymentError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'فشلت جلب طلبات الاسترداد' }, { status: 500 })
  }
}
