import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { createPosOrder } from '@/lib/staff-pos-write'
import { PosError } from '@/lib/staff-pos'

/** Staff POS order — POST /api/staff/pos/orders (server-side pricing). */
export const dynamic = 'force-dynamic'

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
    const result = await createPosOrder(session, body)
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    if (e instanceof PosError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Order failed' }, { status: 500 })
  }
}
