import { redirect } from 'next/navigation'
import { requirePageAccess } from '@/lib/require-page-access'
import { getStaffTables } from '@/lib/staff-tables'
import { TablesBoard } from '@/components/tables/tables-board'
import { getOpenShift } from '@/lib/staff-shifts'
import { isOwner, requiresOperationalShift } from '@/lib/authz'

export const dynamic = 'force-dynamic'

/**
 * Tables — server component. Real branch tables + live occupancy from
 * open orders (no local demo state).
 */
export default async function TablesPage() {
  const session = await requirePageAccess('/tables')

  // Operational staff must have an open shift before managing tables.
  if (requiresOperationalShift(session.role) && session.branchId) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) redirect('/shifts')
  }

  const tables = await getStaffTables(session)
  return <TablesBoard tables={tables} canEditLayout={isOwner(session.role)} />
}
