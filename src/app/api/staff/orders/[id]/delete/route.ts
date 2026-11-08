import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { deleteOrderSafely } from '@/lib/staff-orders'
import { OrderError } from '@/lib/staff-orders'

export const dynamic = 'force-dynamic'

/**
 * Safe physical deletion of an unpaid order before any item becomes READY.
 * Releases inventory reservations back to stock, voids order items,
 * then deletes the order row. Protected records (payments, inventory
 * consumption/waste, audit logs) are never deleted.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  let body: { reason?: string } = {}
  try { body = await req.json() } catch { body = {} }

  try {
    const result = await deleteOrderSafely(session, id, body.reason)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Order deletion failed' }, { status: 500 })
  }
}
