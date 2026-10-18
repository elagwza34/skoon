import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { FloatError, recordFixedFloatMovement, recordSharedFloatAdvance, returnSharedFloatAdvance, settleSharedFloatAdvance, establishFixedFloatBaseline } from '@/lib/staff-float'

export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const body = await req.json() as Record<string, unknown>
    body.idempotencyKey = req.headers.get('idempotency-key') ?? body.idempotencyKey
    if (body.action === 'advance') return NextResponse.json(await recordSharedFloatAdvance(session, body), { status: 201 })
    if (body.action === 'return') return NextResponse.json(await returnSharedFloatAdvance(session, body), { status: 201 })
    if (body.action === 'settle' && typeof body.advanceId === 'string') return NextResponse.json(await settleSharedFloatAdvance(session, body.advanceId, body), { status: 201 })
    if (body.action === 'baseline') return NextResponse.json(await establishFixedFloatBaseline(session, body), { status: 201 })
    return NextResponse.json(await recordFixedFloatMovement(session, body), { status: 201 })
  }
  catch (error) {
    if (error instanceof FloatError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Fixed float movement failed' }, { status: 500 })
  }
}
