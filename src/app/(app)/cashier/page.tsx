import { requirePageAccess } from '@/lib/require-page-access'
import { isOwner } from '@/lib/authz'
import { redirect } from 'next/navigation'
import { getShiftsBoard } from '@/lib/staff-shifts'
import { prisma } from '@/lib/prisma'
import { getCashierInvoices } from '@/lib/staff-invoices'
import { getPosCatalog } from '@/lib/staff-pos'
import { getSharedFloatSummary } from '@/lib/staff-float'
import { CashierWorkspace } from '@/components/cashier/cashier-workspace'

export const dynamic = 'force-dynamic'

export default async function CashierPage() {
  const session = await requirePageAccess('/cashier')
  // Owner oversight belongs to the non-operational financial workspace.
  if (isOwner(session.role)) redirect('/finance')

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

  const [board, invoices, catalog, sharedFloat] = await Promise.all([getShiftsBoard(session), getCashierInvoices(session), getPosCatalog(session), getSharedFloatSummary(session)])

  return <CashierWorkspace
    session={session}
    board={board}
    branchName={branchName}
    invoices={invoices}
    catalog={catalog}
    products={catalog.products.map(({ id, name, price }) => ({ id, name, price }))}
    sharedFloat={sharedFloat}
  />
}
