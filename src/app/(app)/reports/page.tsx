import { requirePageAccess } from '@/lib/require-page-access'
import { getReportsSummary } from '@/lib/staff-reports'
import { ReportsBoard } from '@/components/reports/reports-board'

export const dynamic = 'force-dynamic'

/** Reports — server component. Real aggregates, Cairo day boundaries. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const session = await requirePageAccess('/reports')

  const { days } = await searchParams
  const summary = await getReportsSummary(session, days)
  return <ReportsBoard summary={summary} />
}