import { financialJson } from '@/lib/financial-json'
import { getStaffSession } from '@/lib/session'
import { AttendanceSummaryError, getAttendanceSummary } from '@/lib/staff-attendance-summary'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: 'Not authenticated' }, { status: 401 })
  const query = new URL(req.url).searchParams
  try {
    return financialJson({ summary: await getAttendanceSummary(session, { employeeId: query.get('employeeId') ?? undefined, startsOn: query.get('startsOn'), endsOn: query.get('endsOn') }) })
  } catch (error) {
    return financialJson({ error: error instanceof AttendanceSummaryError ? error.message : 'Unable to load attendance summary' }, { status: error instanceof AttendanceSummaryError ? error.status : 500 })
  }
}
