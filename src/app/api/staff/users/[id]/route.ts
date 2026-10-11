import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { updateStaff, StaffProvisionError } from '@/lib/staff-provision-write'

/**
 * Staff update — PATCH /api/staff/users/[id]
 *   { role?, branchId?, isActive? }      owner/manager
 * Role/branch/activation only; auth identity stays with Supabase Auth.
 */
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await ctx.params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await updateStaff(session, id, body)
    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    if (e instanceof StaffProvisionError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'تعذر تحديث الحساب' }, { status: 500 })
  }
}
