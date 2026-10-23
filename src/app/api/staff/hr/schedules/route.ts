import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { createWorkSchedule, listWorkSchedules, SchedulingError } from '@/lib/staff-scheduling-write'

export const dynamic = 'force-dynamic'

function failure(error: unknown, fallback: string) {
  if (error instanceof SchedulingError) return NextResponse.json({ error: error.message }, { status: error.status })
  return NextResponse.json({ error: fallback }, { status: 500 })
}

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try { return NextResponse.json({ schedules: await listWorkSchedules(session, new URL(req.url).searchParams.get('employeeId') ?? undefined) }) }
  catch (error) { return failure(error, 'Unable to list schedules') }
}

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try { return NextResponse.json({ schedule: await createWorkSchedule(session, await req.json()) }, { status: 201 }) }
  catch (error) { return failure(error, 'Unable to create schedule') }
}
