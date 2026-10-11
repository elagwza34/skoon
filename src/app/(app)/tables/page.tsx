import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { getStaffTables } from '@/lib/staff-tables'
import { TablesBoard } from '@/components/tables/tables-board'

export const dynamic = 'force-dynamic'

/**
 * Tables — server component. Real branch tables + live occupancy from
 * open orders (no local demo state).
 */
export default async function TablesPage() {
  const session = await getStaffSession()
  if (!session) redirect('/login')

  const tables = await getStaffTables(session)
  return <TablesBoard tables={tables} />
}