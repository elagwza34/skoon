import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { closeShift, ShiftError } from '@/lib/staff-shifts'

/**
 * Close a shift — POST /api/staff/shifts/[id]/close.
 * Body: { closingCash: number } (the physical count of the drawer).
 * The service recomputes expected cash from the shift's linked payments and
 * stores variance = counted − expected (positive = excess, negative = shortage).
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
    return NextResponse.json(await closeShift(session, id, body))
  } catch (e) {
    if (e instanceof ShiftError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'تعذر إغلاق الوردية' }, { status: 500 })
  }
}
