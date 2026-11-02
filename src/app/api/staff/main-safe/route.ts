import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import {
  getMainSafeSummary,
  withdrawFromMainSafe,
  transferMainSafeToFixedFloat,
  FloatError,
} from '@/lib/staff-float'

/**
 * Main Safe management — /api/staff/main-safe.
 *   GET  → balance and history (manager+)
 *   POST → { action: 'withdraw', amount, reason } (manager+)
 *   POST → { action: 'transfer_to_fixed_float', amount, reason } (manager+)
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const summary = await getMainSafeSummary(session)
    return NextResponse.json(summary, { status: 200 })
  } catch (e) {
    if (e instanceof FloatError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'تعذر جلب ملخص الخزنة الرئيسية' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: { action?: string } & Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    if (body.action === 'withdraw') {
      const amount = typeof body.amount === 'number' ? body.amount : null
      const reason = typeof body.reason === 'string' ? body.reason : null
      if (amount === null || amount <= 0 || !reason) {
        return NextResponse.json({ error: 'المبلغ والسبب مطلوبان' }, { status: 400 })
      }
      const result = await withdrawFromMainSafe(session, amount, reason)
      return NextResponse.json(result, { status: 200 })
    }

    if (body.action === 'transfer_to_fixed_float') {
      const amount = typeof body.amount === 'number' ? body.amount : null
      const reason = typeof body.reason === 'string' ? body.reason : null
      if (amount === null || amount <= 0 || !reason) {
        return NextResponse.json({ error: 'المبلغ والسبب مطلوبان' }, { status: 400 })
      }
      const result = await transferMainSafeToFixedFloat(session, amount, reason)
      return NextResponse.json(result, { status: 200 })
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 })
  } catch (e) {
    if (e instanceof FloatError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'فشلت العملية' }, { status: 500 })
  }
}
