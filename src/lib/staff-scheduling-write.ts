import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/notifications'
import { canApproveAttendanceCorrections, canManageWorkSchedules } from '@/lib/hr-authz'
import { effectivePeriodsOverlap, validateWeeklySchedule } from '@/lib/hr-scheduling-policy'

export class SchedulingError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'SchedulingError' }
}

const daySchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6), restDay: z.boolean(),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  intervals: z.array(z.object({ startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), unpaidBreakMinutes: z.coerce.number().int().min(0).max(720).default(0) })).max(6).optional(),
})
const scheduleSchema = z.object({
  employeeId: z.string().uuid(), branchId: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  effectiveFrom: z.coerce.date(), effectiveUntil: z.coerce.date().nullable().optional(),
  timezone: z.string().trim().min(1).max(50).default('Africa/Cairo'), graceMinutes: z.coerce.number().int().min(0).max(240).default(0),
  days: z.array(daySchema).length(7),
}).superRefine((value, ctx) => {
  const issue = validateWeeklySchedule(value.days)
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['days'], message: issue })
  if (value.effectiveUntil && value.effectiveUntil <= value.effectiveFrom) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveUntil'], message: 'End date must follow start date' })
})

const correctionSchema = z.object({
  employeeId: z.string().uuid(), shiftId: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).nullable().optional(),
  reason: z.string().trim().min(3).max(500), proposedOpenedAt: z.coerce.date().nullable().optional(), proposedClosedAt: z.coerce.date().nullable().optional(),
}).superRefine((value, ctx) => { if (value.proposedOpenedAt && value.proposedClosedAt && value.proposedClosedAt <= value.proposedOpenedAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proposedClosedAt'], message: 'Close time must follow open time' }) })

function dateOnly(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())) }
function branchFor(session: StaffSession, raw: string | number) {
  const branchId = BigInt(raw)
  if (session.role !== ROLE.OWNER && session.branchId !== branchId.toString()) throw new SchedulingError('Branch access is not permitted', 403)
  return branchId
}
function migrationError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') throw new SchedulingError('Scheduling migration is not applied yet', 503)
  throw error
}

/** Creates an effective-dated schedule after serializing revisions per employee. */
export async function createWorkSchedule(session: StaffSession, input: unknown) {
  if (!canManageWorkSchedules(session.role)) throw new SchedulingError('Schedule management is not permitted', 403)
  const parsed = scheduleSchema.safeParse(input)
  if (!parsed.success) throw new SchedulingError(parsed.error.issues[0]?.message ?? 'Invalid schedule')
  const value = parsed.data; const branchId = branchFor(session, value.branchId); const from = dateOnly(value.effectiveFrom); const until = value.effectiveUntil ? dateOnly(value.effectiveUntil) : null
  try { return await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hr-schedule:' || ${value.employeeId}))`
    const employee = await tx.user.findFirst({ where: { id: value.employeeId, branchId, isActive: true, deletedAt: null }, select: { id: true } })
    if (!employee) throw new SchedulingError('Employee is not active in this branch', 404)
    const existing = await tx.workSchedule.findMany({ where: { employeeId: value.employeeId, status: 'active' }, select: { effectiveFrom: true, effectiveUntil: true } })
    if (existing.some((row) => effectivePeriodsOverlap(from, until, row.effectiveFrom, row.effectiveUntil))) throw new SchedulingError('Schedule overlaps an active effective period', 409)
    const created = await tx.workSchedule.create({ data: { employeeId: value.employeeId, branchId, effectiveFrom: from, effectiveUntil: until, timezone: value.timezone, graceMinutes: value.graceMinutes, createdById: session.id, days: { create: value.days.map((day) => { const intervals = day.restDay ? [] : day.intervals?.length ? day.intervals : day.startsAt && day.endsAt ? [{ startsAt: day.startsAt, endsAt: day.endsAt, unpaidBreakMinutes: 0 }] : []; return { weekday: day.weekday, restDay: day.restDay, startsAt: intervals[0]?.startsAt ?? null, endsAt: intervals[0]?.endsAt ?? null, intervals: { create: intervals } } }) } }, include: { days: { orderBy: { weekday: 'asc' }, include: { intervals: { orderBy: { id: 'asc' } } } } } })
    await tx.auditLog.create({ data: { userId: session.id, branchId, action: 'hr.schedule.create', entityType: 'work_schedule', entityId: created.id, newValues: { employeeId: value.employeeId, effectiveFrom: from.toISOString().slice(0, 10) } } })
    await notifyUser(tx, value.employeeId, { type: 'hr.schedule.published', title: 'تم نشر جدول عملك' })
    return created
  }) } catch (error) { return migrationError(error) }
}

/** Branch-scoped operational schedule read; employees can see only their own rows. */
export async function listWorkSchedules(session: StaffSession, employeeId?: string) {
  const own = employeeId === session.id || !employeeId
  if (!own && !canManageWorkSchedules(session.role)) throw new SchedulingError('Schedule access is not permitted', 403)
  const targetId = employeeId ?? session.id
  try {
    const where = {
      employeeId: targetId,
      ...(session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId ?? '0') }),
    }
    return await prisma.workSchedule.findMany({
      where, orderBy: { effectiveFrom: 'desc' }, take: 100,
      include: { days: { orderBy: { weekday: 'asc' }, include: { intervals: { orderBy: { id: 'asc' } } } }, employee: { select: { id: true, name: true } } },
    })
  } catch (error) { return migrationError(error) }
}

export async function requestAttendanceCorrection(session: StaffSession, input: unknown) {
  const parsed = correctionSchema.safeParse(input)
  if (!parsed.success) throw new SchedulingError(parsed.error.issues[0]?.message ?? 'Invalid correction request')
  const value = parsed.data
  if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER && session.id !== value.employeeId) throw new SchedulingError('Correction request is not permitted', 403)
  try { return await prisma.$transaction(async (tx) => {
    const employee = await tx.user.findFirst({ where: { id: value.employeeId, isActive: true, deletedAt: null }, select: { branchId: true } })
    if (!employee?.branchId) throw new SchedulingError('Employee branch is required', 409)
    branchFor(session, employee.branchId.toString())
    if (value.shiftId) {
      const shiftId = BigInt(value.shiftId)
      const shift = await tx.shift.findFirst({ where: { id: shiftId, branchId: employee.branchId }, select: { id: true, cashierId: true } })
      if (!shift || (shift.cashierId && shift.cashierId !== value.employeeId)) throw new SchedulingError('Shift does not belong to this employee and branch', 409)
      const existing = await tx.attendanceCorrection.findFirst({ where: { shiftId, status: { in: ['pending', 'approved'] } }, select: { id: true } })
      if (existing) throw new SchedulingError('A pending or approved correction already exists for this shift', 409)
    }
    const row = await tx.attendanceCorrection.create({ data: { branchId: employee.branchId, employeeId: value.employeeId, shiftId: value.shiftId ? BigInt(value.shiftId) : null, proposedById: session.id, reason: value.reason, proposedOpenedAt: value.proposedOpenedAt ?? null, proposedClosedAt: value.proposedClosedAt ?? null } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: employee.branchId, action: 'hr.attendance_correction.request', entityType: 'attendance_correction', entityId: row.id, newValues: { employeeId: value.employeeId } } })
    return row
  }) } catch (error) { return migrationError(error) }
}

/**
 * Owner review queue for attendance corrections. Corrections affect payroll
 * inputs, so listing the cross-branch queue follows the same Owner-only
 * authority as the final decision.
 */
export async function listAttendanceCorrections(session: StaffSession) {
  if (!canApproveAttendanceCorrections(session.role)) {
    throw new SchedulingError('Attendance correction review is not permitted', 403)
  }
  try {
    return await prisma.attendanceCorrection.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        employee: { select: { id: true, name: true } },
        proposedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        shift: { select: { id: true, openedAt: true, closedAt: true } },
      },
    })
  } catch (error) {
    return migrationError(error)
  }
}

export async function decideAttendanceCorrection(session: StaffSession, id: bigint, approve: boolean) {
  if (!canApproveAttendanceCorrections(session.role)) throw new SchedulingError('Owner approval is required', 403)
  try { return await prisma.$transaction(async (tx) => {
    const row = await tx.attendanceCorrection.findFirst({ where: { id, status: 'pending' }, select: { id: true, employeeId: true, branchId: true, proposedById: true } })
    if (!row) throw new SchedulingError('Pending correction not found', 404)
    if (row.proposedById === session.id) throw new SchedulingError('A requester cannot approve their own attendance correction', 403)
    const updated = await tx.attendanceCorrection.update({ where: { id }, data: { status: approve ? 'approved' : 'rejected', approvedById: session.id, decidedAt: new Date() } })
    await tx.auditLog.create({ data: { userId: session.id, branchId: row.branchId, action: approve ? 'hr.attendance_correction.approve' : 'hr.attendance_correction.reject', entityType: 'attendance_correction', entityId: id, newValues: {} } })
    await notifyUser(tx, row.employeeId, { type: 'hr.attendance.correction_decided', title: approve ? 'تمت الموافقة على تصحيح الحضور' : 'تم رفض تصحيح الحضور' })
    return updated
  }) } catch (error) { return migrationError(error) }
}
