import { requirePageAccess } from '@/lib/require-page-access'
import { getShiftsBoard } from '@/lib/staff-shifts'
import { ShiftsBoard } from '@/components/shifts/shifts-board'

export const dynamic = 'force-dynamic'

/**
 * Shifts — real open/close/reconciliation board (MVP P0).
 * Snapshot is fetched server-side (owner may switch branch via ?branchId=);
 * open/close mutations go through /api/staff/shifts and refresh the page.
 */
export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>
}) {
  const session = await requirePageAccess('/shifts')
  const { branchId } = await searchParams
  const board = await getShiftsBoard(session, branchId)

  return <ShiftsBoard initial={board} />
}