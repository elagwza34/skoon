import { notFound, redirect } from 'next/navigation'
import { isOwner, requiresOperationalShift } from '@/lib/authz'
import { requirePageAccess } from '@/lib/require-page-access'
import { getOpenShift } from '@/lib/staff-shifts'
import { getWaiterWorkspace } from '@/lib/staff-waiter'
import { WaiterTableWorkspace } from '@/components/waiter/waiter-table-workspace'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'مساحة الطاولة | Skoon' }

export default async function WaiterTablePage({ params }: { params: Promise<{ tableId: string }> }) {
  const session = await requirePageAccess('/waiter')
  if (isOwner(session.role)) redirect('/waiter')
  if (requiresOperationalShift(session.role) && session.branchId) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) redirect('/shifts')
  }

  const { tableId } = await params
  if (!/^\d+$/.test(tableId)) notFound()
  const workspace = await getWaiterWorkspace(session)
  const table = workspace.tables.find((candidate) => candidate.id === tableId)
  if (!table) notFound()

  return <WaiterTableWorkspace workspace={workspace} table={table} />
}
