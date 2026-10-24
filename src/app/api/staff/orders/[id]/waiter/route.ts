import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import {
  approveQrOrder,
  claimQrOrder,
  reassignOrderResponsibility,
  rejectQrOrder,
  transferOrderTable,
} from '@/lib/staff-waiter-operations'
import { OrderError } from '@/lib/staff-orders'

export const dynamic = 'force-dynamic'

/**
 * Waiter-only operational actions. Each writer owns its branch, shift, state,
 * and transaction checks; this route never accepts a branch or actor ID.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  let body: { action?: unknown; [key: string]: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  try {
    let result: unknown
    if (body.action === 'claim_qr') result = await claimQrOrder(session, id)
    else if (body.action === 'approve_qr') result = await approveQrOrder(session, id)
    else if (body.action === 'reject_qr') result = await rejectQrOrder(session, id, body)
    else if (body.action === 'reassign') result = await reassignOrderResponsibility(session, id, body)
    else if (body.action === 'transfer_table') result = await transferOrderTable(session, id, body)
    else return NextResponse.json({ error: 'Unsupported waiter action' }, { status: 400 })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Waiter operation failed' }, { status: 500 })
  }
}
