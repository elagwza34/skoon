import { financialJson } from '@/lib/financial-json'
import { getStaffSession } from '@/lib/session'
import { decideAttendanceCorrection, SchedulingError } from '@/lib/staff-scheduling-write'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return financialJson({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await context.params
  if (!/^\d+$/.test(id)) return financialJson({ error: 'Invalid correction id' }, { status: 400 })
  try {
    const body = await req.json() as { approve?: unknown }
    if (typeof body.approve !== 'boolean') return financialJson({ error: 'approve is required' }, { status: 400 })
    return financialJson({ correction: await decideAttendanceCorrection(session, BigInt(id), body.approve) })
  } catch (error) { return financialJson({ error: error instanceof SchedulingError ? error.message : 'Unable to decide correction' }, { status: error instanceof SchedulingError ? error.status : 500 }) }
}
