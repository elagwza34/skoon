import { requirePageAccess } from '@/lib/require-page-access'
import { getWaiterWorkspace } from '@/lib/staff-waiter'
import { WaiterBoard } from '@/components/waiter/waiter-board'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'الويتر | Skoon',
}

/**
 * Waiter — server component. Real branch tables + open orders from the DB.
 */
export default async function WaiterPage() {
  const session = await requirePageAccess('/waiter')

  const workspace = await getWaiterWorkspace(session)
  return <WaiterBoard workspace={workspace} />
}
