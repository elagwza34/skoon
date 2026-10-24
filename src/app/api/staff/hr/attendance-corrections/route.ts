import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { listAttendanceCorrections, requestAttendanceCorrection, SchedulingError } from '@/lib/staff-scheduling-write'

export const dynamic = 'force-dynamic'

function jsonValue(value: unknown): unknown {
  // Preserve Prisma Decimal/Date JSON representations while converting only
  // PostgreSQL bigint identifiers, which JSON cannot encode natively.
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item))
}

export async function GET() {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    return NextResponse.json({ corrections: jsonValue(await listAttendanceCorrections(session)) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof SchedulingError ? error.message : 'Unable to list attendance corrections' }, { status: error instanceof SchedulingError ? error.status : 500 })
  }
}

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try { return NextResponse.json({ correction: await requestAttendanceCorrection(session, await req.json()) }, { status: 201 }) }
  catch (error) { return NextResponse.json({ error: error instanceof SchedulingError ? error.message : 'Unable to request attendance correction' }, { status: error instanceof SchedulingError ? error.status : 500 }) }
}
