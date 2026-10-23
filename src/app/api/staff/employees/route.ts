import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { EmployeeHrError, listEmployees } from '@/lib/staff-employee-write'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const params = new URL(req.url).searchParams
  const status = params.get('status')
  try {
    const employees = await listEmployees(session, {
      query: params.get('q') ?? undefined,
      status: status === 'active' || status === 'inactive' || status === 'archived' || status === 'terminated' || status === 'all' ? status : undefined,
    })
    return NextResponse.json({ employees })
  } catch (error) {
    if (error instanceof EmployeeHrError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Unable to list employees' }, { status: 500 })
  }
}
