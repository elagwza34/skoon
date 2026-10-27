import { z } from 'zod'
import { ROLE } from '@/lib/authz'
import { canManageWorkSchedules } from '@/lib/hr-authz'
import { prisma } from '@/lib/prisma'
import type { StaffSession } from '@/lib/session'
import { calculateHrTimeSummary } from '@/lib/hr-time-calculation'

export class AttendanceSummaryError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'AttendanceSummaryError' }
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const inputSchema = z.object({ employeeId: z.string().uuid().optional(), startsOn: dateOnly, endsOn: dateOnly }).refine((value) => value.endsOn >= value.startsOn, { path: ['endsOn'], message: 'End date cannot precede start date' })
const utcDay = (key: string) => new Date(`${key}T00:00:00.000Z`)
const plusDays = (key: string, amount: number) => new Date(utcDay(key).getTime() + amount * 86_400_000)

/**
 * Read-only HR attendance view derived from operational shifts and approved HR
 * corrections. It never updates a shift, applies payroll, or posts finance.
 */
export async function getAttendanceSummary(session: StaffSession, input: unknown) {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) throw new AttendanceSummaryError(parsed.error.issues[0]?.message ?? 'Invalid attendance range')
  const value = parsed.data; const employeeId = value.employeeId ?? session.id
  const own = employeeId === session.id
  if (!own && !canManageWorkSchedules(session.role)) throw new AttendanceSummaryError('Attendance access is not permitted', 403)

  const employee = await prisma.user.findFirst({ where: { id: employeeId, isActive: true, deletedAt: null }, select: { id: true, branchId: true } })
  if (!employee?.branchId) throw new AttendanceSummaryError('Employee is not active in an assigned branch', 404)
  if (session.role !== ROLE.OWNER && session.branchId !== employee.branchId.toString()) throw new AttendanceSummaryError('Branch access is not permitted', 403)

  const queryStart = plusDays(value.startsOn, -1); const queryEnd = plusDays(value.endsOn, 2)
  const [schedules, shifts, corrections, leaves, holidays] = await Promise.all([
    prisma.workSchedule.findMany({ where: { employeeId, effectiveFrom: { lte: utcDay(value.endsOn) }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: utcDay(value.startsOn) } }] }, include: { days: { orderBy: { weekday: 'asc' } } }, orderBy: { effectiveFrom: 'asc' } }),
    prisma.shift.findMany({ where: { cashierId: employeeId, openedAt: { gte: queryStart, lt: queryEnd } }, select: { id: true, openedAt: true, closedAt: true } }),
    prisma.attendanceCorrection.findMany({ where: { employeeId, status: 'approved' }, select: { shiftId: true, status: true, proposedOpenedAt: true, proposedClosedAt: true, decidedAt: true } }),
    prisma.leaveRequest.findMany({ where: { employeeId, status: 'approved', startsOn: { lte: utcDay(value.endsOn) }, endsOn: { gte: utcDay(value.startsOn) } }, select: { status: true, startsOn: true, endsOn: true, isPaid: true } }),
    prisma.officialHoliday.findMany({ where: { startsOn: { lte: utcDay(value.endsOn) }, endsOn: { gte: utcDay(value.startsOn) }, OR: [{ branchId: null }, { branchId: employee.branchId }] }, select: { startsOn: true, endsOn: true, isPaid: true } }),
  ])
  return calculateHrTimeSummary({
    startsOn: value.startsOn, endsOn: value.endsOn, timezone: 'Africa/Cairo', schedules, shifts,
    corrections, leaves, holidays,
  })
}
