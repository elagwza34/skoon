import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { addEmployeeContract, EmployeeHrError } from '@/lib/staff-employee-write'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) }
  const { id } = await ctx.params
  try {
    return NextResponse.json(await addEmployeeContract(session, id, body), { status: 201 })
  } catch (error) {
    if (error instanceof EmployeeHrError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Unable to create contract' }, { status: 500 })
  }
}
