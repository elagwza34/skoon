import { requirePageAccess } from '@/lib/require-page-access'
import { getOwnerFinanceWorkspace } from '@/lib/staff-finance'
import { OwnerFinanceBoard } from '@/components/finance/owner-finance-board'

export const dynamic = 'force-dynamic'

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; branchId?: string }> }) {
  const session = await requirePageAccess('/finance')
  const filters = await searchParams
  return <OwnerFinanceBoard data={await getOwnerFinanceWorkspace(session, filters)} />
}


