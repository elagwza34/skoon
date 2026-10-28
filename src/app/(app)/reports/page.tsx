import { requirePageAccess } from '@/lib/require-page-access'
import { ROLE } from '@/lib/authz'
import { getReportsSummary } from '@/lib/staff-reports'
import { getVatReport } from '@/lib/vat-report'
import { prisma } from '@/lib/prisma'
import { ReportsBoard } from '@/components/reports/reports-board'
import { VatReport } from '@/components/reports/vat-report'

export const dynamic = 'force-dynamic'

/** Reports â€” server component. Real aggregates, Cairo day boundaries. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; tab?: string; from?: string; to?: string; branchId?: string }>
}) {
  const session = await requirePageAccess('/reports')

  const { days, tab, from, to, branchId } = await searchParams
  if (tab === 'vat' && session.role === ROLE.OWNER) {
    const [report, branches] = await Promise.all([
      getVatReport(session, { from, to, branchId }),
      prisma.cafeBranch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 }),
    ])
    return <VatReport report={report} branches={branches.map((branch) => ({ id: branch.id.toString(), name: branch.name }))} />
  }
  const summary = await getReportsSummary(session, days)
  const vatSummary = session.role === ROLE.OWNER ? await getVatReport(session, {}) : null
  return <ReportsBoard summary={summary} vatSummary={vatSummary ? { netCollectedVat: vatSummary.netCollectedVat, paidInvoices: vatSummary.paidInvoices } : undefined} />
}


