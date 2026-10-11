import { redirect } from 'next/navigation'
import { getStaffSession } from '@/lib/session'
import { getReportsSummary } from '@/lib/staff-reports'
import { ReportsBoard } from '@/components/reports/reports-board'

export const dynamic = 'force-dynamic'

/** Reports — server component. Real aggregates, Cairo day boundaries. */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const session = await getStaffSession()
  if (!session) redirect('/login')

  const { days } = await searchParams
  const summary = await getReportsSummary(session, days)
  return <ReportsBoard summary={summary} />
}