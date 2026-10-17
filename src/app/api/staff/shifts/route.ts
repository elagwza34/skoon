import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { getShiftsBoard, openShift, ShiftError } from '@/lib/staff-shifts'

/**
 * Staff shifts — /api/staff/shifts.
 *   GET  → board snapshot (current open shift + last shifts) for the caller's
 *          branch; owners may pass ?branchId=.
 *   POST → open a till session. Body: { openingCash: number, branchId? }
 *          branchId is required for the (cross-branch) owner only.
 *
 * Authorization: a valid staff session is required; role/branch checks live
 * in the service (cashier+, own branch).
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const branchId = new URL(req.url).searchParams.get('branchId') ?? undefined
  try {
    return NextResponse.json(await getShiftsBoard(session, branchId))
  } catch (e) {
    if (e instanceof ShiftError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'تعذر جلب الورديات' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    return NextResponse.json(await openShift(session, body))
  } catch (e) {
    if (e instanceof ShiftError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'تعذر فتح الوردية' }, { status: 500 })
  }
}
