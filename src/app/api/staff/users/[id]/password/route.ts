import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { resetStaffPassword, StaffProvisionError } from '@/lib/staff-provision-write'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { id } = await ctx.params
  try {
    await resetStaffPassword(session, id, body)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    if (error instanceof StaffProvisionError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'Password reset failed' }, { status: 500 })
  }
}
