import { financialJson } from '@/lib/financial-json'
import { getStaffSession } from '@/lib/session'
import { createWorkSchedule, listWorkSchedules, SchedulingError } from '@/lib/staff-scheduling-write'

export const dynamic = 'force-dynamic'

function failure(error: unknown, fallback: string) {
  if (error instanceof SchedulingError) return financialJson({ error: error.message }, { status: error.status })
  return financialJson({ error: fallback }, { status: 500 })
}

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: 'Not authenticated' }, { status: 401 })
  try { return financialJson({ schedules: await listWorkSchedules(session, new URL(req.url).searchParams.get('employeeId') ?? undefined) }) }
  catch (error) { return failure(error, 'Unable to list schedules') }
}

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: 'Not authenticated' }, { status: 401 })
  try { return financialJson({ schedule: await createWorkSchedule(session, await req.json()) }, { status: 201 }) }
  catch (error) { return failure(error, 'Unable to create schedule') }
}
