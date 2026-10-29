import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import {
  acceptTableTransfer,
  rejectTableTransfer,
  cancelTableTransfer,
} from '@/lib/staff-waiter-operations'
import { OrderError } from '@/lib/staff-orders'

export const dynamic = 'force-dynamic'

/**
 * POST /api/staff/waiter/table-transfers/[id]
 * Body: { action: 'accept' | 'reject' | 'cancel', reason? }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({})) as { action?: string; reason?: string }

    if (body.action === 'accept') {
      return NextResponse.json(await acceptTableTransfer(session, id))
    }
    if (body.action === 'reject') {
      return NextResponse.json(await rejectTableTransfer(session, id, { reason: body.reason }))
    }
    if (body.action === 'cancel') {
      return NextResponse.json(await cancelTableTransfer(session, id))
    }
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Table transfer action failed' }, { status: 500 })
  }
}