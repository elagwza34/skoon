import { requirePageAccess } from '@/lib/require-page-access'
import { listAttendanceCorrections } from '@/lib/staff-scheduling-write'
import { AttendanceCorrectionsBoard, type AttendanceCorrectionRow } from '@/components/staff/attendance-corrections-board'

export const dynamic = 'force-dynamic'

export default async function AttendanceCorrectionsPage() {
  const session = await requirePageAccess('/staff/attendance-corrections')
  const corrections = await listAttendanceCorrections(session)
  const rows: AttendanceCorrectionRow[] = corrections.map((correction) => ({
    id: correction.id.toString(), employeeName: correction.employee.name, proposedByName: correction.proposedBy.name,
    approvedByName: correction.approvedBy?.name ?? null, status: correction.status, reason: correction.reason,
    proposedOpenedAt: correction.proposedOpenedAt?.toISOString() ?? null, proposedClosedAt: correction.proposedClosedAt?.toISOString() ?? null,
    shiftId: correction.shift?.id.toString() ?? null, originalOpenedAt: correction.shift?.openedAt.toISOString() ?? null,
    originalClosedAt: correction.shift?.closedAt?.toISOString() ?? null, createdAt: correction.createdAt.toISOString(), decidedAt: correction.decidedAt?.toISOString() ?? null,
  }))
  return <AttendanceCorrectionsBoard rows={rows} />
}
