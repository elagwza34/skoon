import { redirect } from 'next/navigation'
import { requirePageAccess } from '@/lib/require-page-access'
import { getShiftsBoard, getOpenShift } from '@/lib/staff-shifts'
import { CashierDashboard } from '@/components/cashier/cashier-dashboard'
import { prisma } from '@/lib/prisma'
import { isOwner } from '@/lib/authz'

export const dynamic = 'force-dynamic'

export default async function CashierPage() {
  const session = await requirePageAccess('/cashier')

  // Owner bypasses shift requirements; operational staff must have an open shift.
  if (!isOwner(session.role) && session.branchId) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) redirect('/shifts')
  }

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
