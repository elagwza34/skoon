import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { markAllRead } from '@/lib/notifications'

/**
 * Mark all of the signed-in user's notifications as read — POST
 * /api/staff/notifications/read. Called when the bell popover opens, so the
 * unread badge clears the moment the user looks. Idempotent (0 rows if none).
 */
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const updated = await markAllRead(session.id)
  return NextResponse.json({ updated })
}
