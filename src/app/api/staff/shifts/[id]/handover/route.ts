import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import {
  acceptCashHandover,
  disputeCashHandover,
  resolveCashHandover,
  getPendingHandovers,
  ShiftError,
} from '@/lib/staff-shifts'

/**
 * Staff cash handover actions — POST /api/staff/shifts/[id]/handover.
 *   { action: 'accept',   handoverId, countedAmount }   recipient cashier
 *   { action: 'dispute',  handoverId, disputeReason }   recipient cashier
 *   { action: 'resolve',  handoverId, resolvedAmount, resolutionNote }   manager+
 *   GET  → list pending handovers (query: ?branchId=&toCashierId=)
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const search = new URL(req.url).searchParams
  const branchId = search.get('branchId') ?? undefined
  const toCashierId = search.get('toCashierId') ?? undefined

  try {
    const handovers = await getPendingHandovers(session, branchId, toCashierId)
    return NextResponse.json({ handovers }, { status: 200 })
  } catch (e) {
    if (e instanceof ShiftError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'تعذر جلب الطلبات المعلقة' }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { action?: string } & Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    if (body.action === 'accept') {
      const handoverId = typeof body.handoverId === 'string' ? body.handoverId : null
      const countedAmount = typeof body.countedAmount === 'number' ? body.countedAmount : null
      if (!handoverId || countedAmount === null || countedAmount < 0) {
        return NextResponse.json({ error: 'معرف التسليم والمبلغ المعدود مطلوبان' }, { status: 400 })
      }
      const result = await acceptCashHandover(session, handoverId, countedAmount)
      return NextResponse.json(result, { status: 200 })
    }

    if (body.action === 'dispute') {
      const handoverId = typeof body.handoverId === 'string' ? body.handoverId : null
      const disputeReason = typeof body.disputeReason === 'string' ? body.disputeReason : null
      if (!handoverId || !disputeReason) {
        return NextResponse.json({ error: 'معرف التسليم وسبب النزاع مطلوبان' }, { status: 400 })
      }
      const result = await disputeCashHandover(session, handoverId, disputeReason)
      return NextResponse.json(result, { status: 200 })
    }

    if (body.action === 'resolve') {
      const handoverId = typeof body.handoverId === 'string' ? body.handoverId : null
      const resolvedAmount = typeof body.resolvedAmount === 'number' ? body.resolvedAmount : null
      const resolutionNote = typeof body.resolutionNote === 'string' ? body.resolutionNote : null
      if (!handoverId || resolvedAmount === null || resolvedAmount < 0 || !resolutionNote) {
        return NextResponse.json({ error: 'معرف التسليم والمبلغ المنزلي والملاحظة مطلوبان' }, { status: 400 })
      }
      const result = await resolveCashHandover(session, handoverId, resolvedAmount, resolutionNote)
      return NextResponse.json(result, { status: 200 })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (e) {
    if (e instanceof ShiftError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'فشلت العملية' }, { status: 500 })
  }
}
