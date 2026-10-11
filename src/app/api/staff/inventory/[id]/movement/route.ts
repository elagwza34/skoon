import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { recordInventoryMovement, InventoryError } from '@/lib/staff-inventory-write'

/** Record inventory movement — POST /api/staff/inventory/[id]/movement (manager+). */
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
    const result = await recordInventoryMovement(session, id, body)
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    if (e instanceof InventoryError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Movement failed' }, { status: 500 })
  }
}
