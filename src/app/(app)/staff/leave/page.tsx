import { requirePageAccess } from '@/lib/require-page-access'
import { listLeaveRequests } from '@/lib/staff-leave-write'
import { LeaveReviewBoard, type LeaveReviewRow } from '@/components/staff/leave-review-board'

export const dynamic = 'force-dynamic'

export default async function LeaveRequestsPage() {
  const session = await requirePageAccess('/staff/leave')
  const requests = await listLeaveRequests(session)
  const rows: LeaveReviewRow[] = requests.map((request) => ({
    id: request.id.toString(),
    employeeName: request.employee.name,
    type: request.type,
    status: request.status,
    startsOn: request.startsOn.toISOString(),
    endsOn: request.endsOn.toISOString(),
    days: request.days.toString(),
    reason: request.reason,
    reviewerName: request.reviewer?.name ?? null,
    decisionNote: request.decisionNote,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  }))

  return <LeaveReviewBoard rows={rows} canDecide={session.role === 'owner' || session.role === 'manager'} />
}
