import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { FloatError, reverseFixedFloatMovement } from '@/lib/staff-float'
export const dynamic = 'force-dynamic'
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession(); if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try { const body = await req.json() as { reason?: string }; return NextResponse.json(await reverseFixedFloatMovement(session, (await params).id, body.reason ?? '')) }
  catch (error) { return NextResponse.json({ error: error instanceof FloatError ? error.message : 'Reversal failed' }, { status: error instanceof FloatError ? error.status : 500 }) }
}
