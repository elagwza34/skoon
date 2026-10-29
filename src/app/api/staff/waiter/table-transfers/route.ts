import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { requestTableTransfer } from '@/lib/staff-waiter-operations'
import { OrderError } from '@/lib/staff-orders'

export const dynamic = 'force-dynamic'

/**
 * POST /api/staff/waiter/table-transfers
 * Body: { tableId, recipientWaiterId, notes? }
 * Waiter requests to transfer a table they manage to another eligible waiter.
 */
export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  try { return NextResponse.json(await requestTableTransfer(session, body)) }
  catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Table transfer request failed' }, { status: 500 })
  }
}