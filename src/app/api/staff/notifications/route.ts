import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { listNotifications, countUnread } from '@/lib/notifications'

/**
 * Signed-in user's notifications — GET /api/staff/notifications.
 * Polled by the bell so every role (waiter/kitchen/cashier/manager/owner) sees
 * its own branch-scoped alerts. Read-only; identity comes from the session, so
 * a user can never read another user's bell.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const [items, unread] = await Promise.all([
    listNotifications(session.id),
    countUnread(session.id),
  ])
  return NextResponse.json({ items, unread })
}
