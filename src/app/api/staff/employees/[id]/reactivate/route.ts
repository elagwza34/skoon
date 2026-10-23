import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { EmployeeHrError, reactivateEmployee } from '@/lib/staff-employee-write'

export const dynamic = 'force-dynamic'

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await ctx.params
  try {
    return NextResponse.json(await reactivateEmployee(session, id))
  } catch (error) {
    if (error instanceof EmployeeHrError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Unable to reactivate employee' }, { status: 500 })
  }
}
