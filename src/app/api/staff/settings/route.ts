import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { updateBranchSettings, SettingsError } from '@/lib/staff-settings-write'

/**
 * Staff settings — PUT /api/staff/settings
 *   { branchId?, values: { key: value, … } }      owner/manager
 * Only allowlisted keys are accepted; see staff-settings-write.ts.
 */
export const dynamic = 'force-dynamic'

export async function PUT(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const result = await updateBranchSettings(session, body)
    return NextResponse.json(result, { status: 200 })
  } catch (e) {
    if (e instanceof SettingsError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'تعذر حفظ الإعدادات' }, { status: 500 })
  }
}
