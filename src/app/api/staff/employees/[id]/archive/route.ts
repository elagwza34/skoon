import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { archiveEmployee, EmployeeHrError } from '@/lib/staff-employee-write'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: { reason?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const { id } = await ctx.params
  try {
    return NextResponse.json(await archiveEmployee(session, id, typeof body.reason === 'string' ? body.reason : ''))
  } catch (error) {
    if (error instanceof EmployeeHrError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Unable to archive employee' }, { status: 500 })
  }
}
