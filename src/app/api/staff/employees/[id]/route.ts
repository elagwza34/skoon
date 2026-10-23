import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { EmployeeHrError, getEmployee, updateEmployeeProfile } from '@/lib/staff-employee-write'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await ctx.params
  try {
    return NextResponse.json(await getEmployee(session, id))
  } catch (error) {
    if (error instanceof EmployeeHrError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Unable to load employee' }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const { id } = await ctx.params
  try {
    return NextResponse.json(await updateEmployeeProfile(session, id, body))
  } catch (error) {
    if (error instanceof EmployeeHrError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Unable to update employee' }, { status: 500 })
  }
}
