import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { requestWaiterResponsibilityHandover } from '@/lib/staff-waiter-operations'
import { OrderError } from '@/lib/staff-orders'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  try { return NextResponse.json(await requestWaiterResponsibilityHandover(session, body)) }
  catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Waiter handover request failed' }, { status: 500 })
  }
}
