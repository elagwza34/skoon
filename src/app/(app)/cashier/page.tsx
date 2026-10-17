import { requirePageAccess } from '@/lib/require-page-access'
import { getShiftsBoard } from '@/lib/staff-shifts'
import { CashierDashboard } from '@/components/cashier/cashier-dashboard'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function CashierPage() {
  const session = await requirePageAccess('/cashier')

  let branchName: string | null = null
  if (session.branchId) {
    try {
      const branch = await prisma.cafeBranch.findUnique({
        where: { id: BigInt(session.branchId) },
        select: { name: true },
      })
      branchName = branch?.name ?? null
    } catch {
      branchName = null
    }
  }

  const board = await getShiftsBoard(session)

  return <CashierDashboard session={session} board={board} branchName={branchName} />
}
