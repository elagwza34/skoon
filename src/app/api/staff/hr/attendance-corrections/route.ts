import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { requestAttendanceCorrection, SchedulingError } from '@/lib/staff-scheduling-write'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try { return NextResponse.json({ correction: await requestAttendanceCorrection(session, await req.json()) }, { status: 201 }) }
  catch (error) { return NextResponse.json({ error: error instanceof SchedulingError ? error.message : 'Unable to request attendance correction' }, { status: error instanceof SchedulingError ? error.status : 500 }) }
}
