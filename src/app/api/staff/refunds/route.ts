import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { getRefunds, PaymentError } from '@/lib/staff-payments-write'

/**
 * Staff refunds — GET /api/staff/refunds
 *   Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&branchId=1&status=REQUESTED
 *   Owner sees all branches; others see own branch only.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

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
