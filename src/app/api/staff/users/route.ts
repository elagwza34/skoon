import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { inviteStaff, StaffProvisionError } from '@/lib/staff-provision-write'
import { getStaffDirectory } from '@/lib/staff-directory'
import { ROLE } from '@/lib/authz'

/**
 * Staff provisioning — POST /api/staff/users
 *   { email, name, role, branchId? }     owner/manager
 * Sends a Supabase Auth invitation and creates the trusted profile row.
 */
export const dynamic = 'force-dynamic'

/**
 * Read-only assignment directory for operational supervisors. It deliberately
 * returns only active waiters and no compensation or private HR fields.
 */
export async function GET() {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (session.role !== ROLE.MANAGER && session.role !== ROLE.OWNER) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  const directory = await getStaffDirectory(session)
  return NextResponse.json({
    users: directory.rows
      .filter((row) => row.isActive && row.role === ROLE.WAITER)
      .map(({ id, name }) => ({ id, name })),
  })
}

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await inviteStaff(session, body)
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    if (e instanceof StaffProvisionError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'تعذر إنشاء الحساب' }, { status: 500 })
  }
}
