import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { canManageEmployeeLifecycle, canReadEmployeeDirectory, employeeDeactivationBlocker } from '@/lib/hr-authz'
import { usernameFromStaffEmail, normalizeStaffUsername } from '@/lib/staff-username'

export class EmployeeHrError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
    this.name = 'EmployeeHrError'
  }
}

const date = z.coerce.date()
const optionalDate = z.union([date, z.null()]).optional()
const optionalText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional()

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  username: z.string().trim().min(3, 'اسم المستخدم قصير جداً').max(40).optional(),
  phone: optionalText(20),
  personalEmail: optionalText(150),
  personalPhone: optionalText(30),
  address: optionalText(500),
  emergencyContactName: optionalText(150),
  emergencyContactPhone: optionalText(30),
  employmentType: optionalText(30),
  hireDate: optionalDate,
  probationStart: optionalDate,
  probationEnd: optionalDate,
  probationStatus: z.enum(['active', 'passed', 'failed', 'cancelled']).nullable().optional(),
  probationDecision: z.enum(['confirmed', 'extended', 'ended']).nullable().optional(),
}).superRefine((value, ctx) => {
  if ((value.probationStart && !value.probationEnd) || (!value.probationStart && value.probationEnd)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probationEnd'], message: 'Probation needs both start and end dates' })
  }
  if (value.probationStart && value.probationEnd && value.probationEnd < value.probationStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probationEnd'], message: 'Probation end cannot precede its start' })
  }
  // Normalize and validate username if provided
  if (value.username !== undefined && value.username !== null && value.username !== '') {
    const normalized = normalizeStaffUsername(value.username)
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['username'], message: 'اسم المستخدم يجب أن يحتوي أحرفاً إنجليزية صغيرة أو أرقاماً أو . _ - فقط' })
    }
  }
})

const contractSchema = z.object({
  contractType: z.string().trim().min(1).max(30),
  effectiveFrom: date,
  effectiveUntil: z.union([date, z.null()]).optional(),
  documentPath: optionalText(500),
  notes: optionalText(10_000),
  supersedesId: z.string().regex(/^\d+$/).optional(),
}).superRefine((value, ctx) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveUntil'], message: 'Contract end cannot precede its start' })
  }
})

const compensationSchema = z.object({
  compensationType: z.enum(['monthly', 'daily', 'hourly', 'per_shift']),
  paymentFrequency: z.enum(['weekly', 'semi_monthly', 'monthly']),
  amount: z.coerce.number().finite().min(0).max(10_000_000),
  effectiveFrom: date,
  effectiveUntil: z.union([date, z.null()]).optional(),
  reason: optionalText(255),
}).superRefine((value, ctx) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['effectiveUntil'], message: 'Rate end cannot precede its start' })
  }
})

function ownerOnly(session: StaffSession) {
  if (!canManageEmployeeLifecycle(session.role)) throw new EmployeeHrError('Owner access is required', 403)
}

function hrSchemaError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
    throw new EmployeeHrError('HR foundation migration is not applied yet', 503)
  }
  throw error
}

function onlyDate(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function priorDay(value: Date) {
  const day = onlyDate(value)
  day.setUTCDate(day.getUTCDate() - 1)
  return day
}

export type EmployeeFilter = { query?: string; status?: 'active' | 'inactive' | 'archived' | 'terminated' | 'all' }

/** Managers receive operational directory data only; Owner receives HR status but never rate amounts in a list. */
export async function listEmployees(session: StaffSession, filter: EmployeeFilter = {}) {
  if (!canReadEmployeeDirectory(session.role)) throw new EmployeeHrError('Employee directory access is not permitted', 403)
  const query = filter.query?.trim().slice(0, 100)
  const owner = session.role === ROLE.OWNER
  const where = {
    ...(owner ? {} : { branchId: BigInt(session.branchId ?? '0') }),
    ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { username: { contains: query, mode: 'insensitive' as const } }, { email: { contains: query, mode: 'insensitive' as const } }] } : {}),
  }
  try {
    const rows = await prisma.user.findMany({
      where: { ...where, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      take: 200,
      select: {
        id: true, name: true, email: true, username: true, phone: true, isActive: true, branchId: true,
        role: { select: { slug: true, name: true } },
        employeeProfile: { select: { id: true, employmentStatus: true, hireDate: true, probationStatus: true, archivedAt: true } },
      },
    })
    return rows
      .filter((row) => filter.status === 'all' || !filter.status || row.employeeProfile?.employmentStatus === filter.status || (!row.employeeProfile && filter.status === 'active'))
      .map((row) => ({
        id: row.id, name: row.name,
        // Direct staff usernames are represented by non-routable Auth emails;
        // never expose that implementation detail as an employee contact.
        email: (row.username || usernameFromStaffEmail(row.email)) ? null : row.email,
        username: row.username ?? usernameFromStaffEmail(row.email), phone: owner ? row.phone : null,
        role: row.role.slug, roleName: row.role.name, branchId: row.branchId?.toString() ?? null,
        active: row.isActive, status: row.employeeProfile?.employmentStatus ?? (row.isActive ? 'active' : 'inactive'),
        hireDate: owner ? row.employeeProfile?.hireDate?.toISOString().slice(0, 10) ?? null : null,
        probationStatus: owner ? row.employeeProfile?.probationStatus ?? null : null,
      }))
  } catch (error) {
    return hrSchemaError(error)
  }
}

export async function getEmployee(session: StaffSession, id: string) {
  if (!canReadEmployeeDirectory(session.role)) throw new EmployeeHrError('Employee directory access is not permitted', 403)
  const owner = session.role === ROLE.OWNER

  // Owner is cross-branch (branchId = null), so no branch filter is applied.
  // Non-owners are scoped to their own branch; safely parse branchId.
  let branchFilter: { branchId: bigint } | {} = {}
  if (!owner) {
    const branchIdRaw = session.branchId ?? '0'
    let branchId: bigint
    try {
      branchId = BigInt(branchIdRaw)
    } catch {
      throw new EmployeeHrError('معرف الفرع غير صالح', 400)
    }
    branchFilter = { branchId }
  }

  try {
    const employee = await prisma.user.findFirst({
      where: { id, deletedAt: null, ...branchFilter },
      select: {
        id: true, name: true, email: true, username: true, phone: true, isActive: true, branchId: true,
        role: { select: { slug: true, name: true } },
        employeeProfile: {
          select: {
            id: true, employmentStatus: true, employmentType: true, hireDate: true,
            personalEmail: true, personalPhone: true, address: true, emergencyContactName: true, emergencyContactPhone: true,
            probationStart: true, probationEnd: true, probationStatus: true, probationReviewedAt: true, probationDecision: true,
            archivedAt: true, archiveReason: true,
            contracts: { orderBy: { effectiveFrom: 'desc' }, select: { id: true, contractType: true, effectiveFrom: true, effectiveUntil: true, documentPath: true, notes: true, supersedesId: true, createdAt: true } },
            compensationRates: { orderBy: { effectiveFrom: 'desc' }, select: { id: true, compensationType: true, paymentFrequency: true, amount: true, currency: true, effectiveFrom: true, effectiveUntil: true, reason: true } },
          },
        },
      },
    })
    if (!employee) throw new EmployeeHrError('Employee not found', 404)
    if (!owner) {
      return { id: employee.id, name: employee.name, role: employee.role.slug, roleName: employee.role.name, active: employee.isActive, status: employee.employeeProfile?.employmentStatus ?? 'active' }
    }
    return {
      ...employee,
      email: (employee.username || usernameFromStaffEmail(employee.email)) ? null : employee.email,
      username: employee.username ?? usernameFromStaffEmail(employee.email),
    }
  } catch (error) {
    return hrSchemaError(error)
  }
}

export async function updateEmployeeProfile(session: StaffSession, id: string, input: unknown) {
  ownerOnly(session)
  const parsed = profileSchema.safeParse(input)
  if (!parsed.success) throw new EmployeeHrError(parsed.error.issues[0]?.message ?? 'Invalid employee profile', 400)
  try {
    return await prisma.$transaction(async (tx) => {
      const employee = await tx.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, branchId: true, username: true, email: true, name: true, role: { select: { slug: true } } } })
      if (!employee) throw new EmployeeHrError('Employee not found', 404)
      const value = parsed.data

      // Username change: normalize, validate uniqueness, preserve Auth identity and user ID.
      let normalizedUsername: string | null = null
      if (value.username !== undefined) {
        normalizedUsername = value.username ? normalizeStaffUsername(value.username) : null
        if (value.username && !normalizedUsername) throw new EmployeeHrError('اسم المستخدم غير صالح', 400)
        if (normalizedUsername && normalizedUsername !== (employee.username ?? null)) {
          const duplicate = await tx.user.findFirst({
            where: { username: { equals: normalizedUsername, mode: 'insensitive' } },
            select: { id: true },
          })
          if (duplicate) throw new EmployeeHrError('اسم المستخدم مستخدم بالفعل', 409)
        }
      }

      const profile = await tx.employeeProfile.upsert({
        where: { userId: id },
        create: {
          userId: id, branchId: employee.branchId, employmentType: value.employmentType ?? null, hireDate: value.hireDate ? onlyDate(value.hireDate) : null,
          personalEmail: value.personalEmail ?? null, personalPhone: value.personalPhone ?? null, address: value.address ?? null,
          emergencyContactName: value.emergencyContactName ?? null, emergencyContactPhone: value.emergencyContactPhone ?? null,
          probationStart: value.probationStart ? onlyDate(value.probationStart) : null, probationEnd: value.probationEnd ? onlyDate(value.probationEnd) : null,
          probationStatus: value.probationStatus ?? null, probationDecision: value.probationDecision ?? null,
        },
        update: {
          ...(value.employmentType !== undefined ? { employmentType: value.employmentType } : {}),
          ...(value.hireDate !== undefined ? { hireDate: value.hireDate ? onlyDate(value.hireDate) : null } : {}),
          ...(value.personalEmail !== undefined ? { personalEmail: value.personalEmail } : {}),
          ...(value.personalPhone !== undefined ? { personalPhone: value.personalPhone } : {}),
          ...(value.address !== undefined ? { address: value.address } : {}),
          ...(value.emergencyContactName !== undefined ? { emergencyContactName: value.emergencyContactName } : {}),
          ...(value.emergencyContactPhone !== undefined ? { emergencyContactPhone: value.emergencyContactPhone } : {}),
          ...(value.probationStart !== undefined ? { probationStart: value.probationStart ? onlyDate(value.probationStart) : null } : {}),
          ...(value.probationEnd !== undefined ? { probationEnd: value.probationEnd ? onlyDate(value.probationEnd) : null } : {}),
          ...(value.probationStatus !== undefined ? { probationStatus: value.probationStatus } : {}),
          ...(value.probationDecision !== undefined ? { probationDecision: value.probationDecision, probationReviewedAt: value.probationDecision ? new Date() : null } : {}),
        },
      })
      const userUpdates: Record<string, unknown> = {}
      if (value.name !== undefined) userUpdates.name = value.name
      if (value.phone !== undefined) userUpdates.phone = value.phone
      if (normalizedUsername !== null) userUpdates.username = normalizedUsername
      if (Object.keys(userUpdates).length > 0) await tx.user.update({ where: { id }, data: userUpdates })
      await tx.auditLog.create({ data: { userId: session.id, branchId: employee.branchId, action: 'hr.employee_profile.update', entityType: 'employee_profile', entityId: profile.id, newValues: { employeeId: id, ...(value.name !== undefined ? { name: value.name } : {}), ...(normalizedUsername !== null ? { username: normalizedUsername } : {}), ...(value.phone !== undefined ? { phone: value.phone } : {}) } } })
      return profile
    })
  } catch (error) { return hrSchemaError(error) }
}

export async function archiveEmployee(session: StaffSession, id: string, reason: string) {
  ownerOnly(session)
  if (!reason.trim() || reason.length > 255) throw new EmployeeHrError('Archive reason is required', 400)
  try {
    return await prisma.$transaction(async (tx) => {
      const employee = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, branchId: true, role: { select: { slug: true } } },
      })
      if (!employee) throw new EmployeeHrError('Employee not found', 404)
      const [activeOwnerCount, openShift] = await Promise.all([
        employee.role.slug === ROLE.OWNER
          ? tx.user.count({ where: { isActive: true, deletedAt: null, role: { is: { slug: ROLE.OWNER } } } })
          : Promise.resolve(0),
        tx.shift.findFirst({ where: { cashierId: employee.id, status: 'open' }, select: { id: true } }),
      ])
      const blocker = employeeDeactivationBlocker({
        actorId: session.id, targetId: employee.id, targetRole: employee.role.slug,
        activeOwnerCount, hasOpenShift: Boolean(openShift),
      })
      if (blocker === 'SELF') throw new EmployeeHrError('Owner cannot archive the current account', 409)
      if (blocker === 'LAST_OWNER') throw new EmployeeHrError('The last active Owner cannot be archived', 409)
      if (blocker === 'OPEN_SHIFT') throw new EmployeeHrError('Settle or hand over the open shift before archiving this employee', 409)
      const profile = await tx.employeeProfile.upsert({
        where: { userId: id }, create: { userId: id, branchId: employee.branchId, employmentStatus: 'archived', archivedAt: new Date(), archivedById: session.id, archiveReason: reason.trim() },
        update: { employmentStatus: 'archived', archivedAt: new Date(), archivedById: session.id, archiveReason: reason.trim() },
      })
      await tx.user.update({ where: { id }, data: { isActive: false } })
      await tx.auditLog.create({ data: { userId: session.id, branchId: employee.branchId, action: 'hr.employee.archive', entityType: 'employee_profile', entityId: profile.id, newValues: { employeeId: id, reason: reason.trim() } } })
      return profile
    })
  } catch (error) { return hrSchemaError(error) }
}

/**
 * Termination revokes effective application access while retaining the durable
 * user identity and every financial/operational reference. It is deliberately
 * distinct from archival: HR history remains searchable as `terminated`.
 */
export async function terminateEmployee(session: StaffSession, id: string, reason: string) {
  ownerOnly(session)
  if (!reason.trim() || reason.length > 255) throw new EmployeeHrError('Termination reason is required', 400)
  try {
    return await prisma.$transaction(async (tx) => {
      const employee = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, branchId: true, role: { select: { slug: true } } },
      })
      if (!employee) throw new EmployeeHrError('Employee not found', 404)
      const [activeOwnerCount, openShift] = await Promise.all([
        employee.role.slug === ROLE.OWNER
          ? tx.user.count({ where: { isActive: true, deletedAt: null, role: { is: { slug: ROLE.OWNER } } } })
          : Promise.resolve(0),
        tx.shift.findFirst({ where: { cashierId: employee.id, status: 'open' }, select: { id: true } }),
      ])
      const blocker = employeeDeactivationBlocker({
        actorId: session.id, targetId: employee.id, targetRole: employee.role.slug,
        activeOwnerCount, hasOpenShift: Boolean(openShift),
      })
      if (blocker === 'SELF') throw new EmployeeHrError('Owner cannot terminate the current account', 409)
      if (blocker === 'LAST_OWNER') throw new EmployeeHrError('The last active Owner cannot be terminated', 409)
      if (blocker === 'OPEN_SHIFT') throw new EmployeeHrError('Settle or hand over the open shift before termination', 409)
      const profile = await tx.employeeProfile.upsert({
        where: { userId: id },
        create: { userId: id, branchId: employee.branchId, employmentStatus: 'terminated', archiveReason: reason.trim() },
        update: { employmentStatus: 'terminated', archiveReason: reason.trim() },
      })
      await tx.user.update({ where: { id }, data: { isActive: false } })
      await tx.auditLog.create({ data: { userId: session.id, branchId: employee.branchId, action: 'hr.employee.terminate', entityType: 'employee_profile', entityId: profile.id, newValues: { employeeId: id, reason: reason.trim() } } })
      return profile
    })
  } catch (error) { return hrSchemaError(error) }
}

export async function reactivateEmployee(session: StaffSession, id: string) {
  ownerOnly(session)
  try {
    return await prisma.$transaction(async (tx) => {
      const profile = await tx.employeeProfile.findFirst({ where: { userId: id, employmentStatus: { in: ['archived', 'terminated'] } }, select: { id: true, branchId: true } })
      if (!profile) throw new EmployeeHrError('Archived or terminated employee not found', 404)
      await tx.user.update({ where: { id }, data: { isActive: true } })
      const updated = await tx.employeeProfile.update({ where: { id: profile.id }, data: { employmentStatus: 'active', archivedAt: null, archivedById: null, archiveReason: null } })
      await tx.auditLog.create({ data: { userId: session.id, branchId: profile.branchId, action: 'hr.employee.reactivate', entityType: 'employee_profile', entityId: profile.id, newValues: { employeeId: id } } })
      return updated
    })
  } catch (error) { return hrSchemaError(error) }
}

export async function addEmployeeContract(session: StaffSession, id: string, input: unknown) {
  ownerOnly(session)
  const parsed = contractSchema.safeParse(input)
  if (!parsed.success) throw new EmployeeHrError(parsed.error.issues[0]?.message ?? 'Invalid contract', 400)
  try {
    return await prisma.$transaction(async (tx) => {
      const profile = await tx.employeeProfile.findFirst({ where: { userId: id }, select: { id: true, branchId: true } })
      if (!profile) throw new EmployeeHrError('Employee profile not found', 404)
      const supersedesId = parsed.data.supersedesId ? BigInt(parsed.data.supersedesId) : null
      if (supersedesId) {
        const prior = await tx.employmentContract.findFirst({ where: { id: supersedesId, employeeId: profile.id }, select: { id: true } })
        if (!prior) throw new EmployeeHrError('Superseded contract does not belong to this employee', 409)
      }
      const contract = await tx.employmentContract.create({ data: { employeeId: profile.id, branchId: profile.branchId, contractType: parsed.data.contractType, effectiveFrom: onlyDate(parsed.data.effectiveFrom), effectiveUntil: parsed.data.effectiveUntil ? onlyDate(parsed.data.effectiveUntil) : null, documentPath: parsed.data.documentPath ?? null, notes: parsed.data.notes ?? null, supersedesId, uploadedById: session.id } })
      await tx.auditLog.create({ data: { userId: session.id, branchId: profile.branchId, action: 'hr.contract.create', entityType: 'employment_contract', entityId: contract.id, newValues: { employeeId: id } } })
      return contract
    })
  } catch (error) { return hrSchemaError(error) }
}

export async function addCompensationRate(session: StaffSession, id: string, input: unknown) {
  ownerOnly(session)
  const parsed = compensationSchema.safeParse(input)
  if (!parsed.success) throw new EmployeeHrError(parsed.error.issues[0]?.message ?? 'Invalid compensation rate', 400)
  try {
    return await prisma.$transaction(async (tx) => {
      const profile = await tx.employeeProfile.findFirst({ where: { userId: id }, select: { id: true, branchId: true } })
      if (!profile) throw new EmployeeHrError('Employee profile not found', 404)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hr-compensation:' || ${profile.id.toString()}))`
      const start = onlyDate(parsed.data.effectiveFrom)
      const rates = await tx.compensationRate.findMany({ where: { employeeId: profile.id }, orderBy: { effectiveFrom: 'asc' } })
      if (rates.some((rate) => rate.effectiveFrom.getTime() === start.getTime())) throw new EmployeeHrError('A rate already starts on this effective date', 409)
      const next = rates.find((rate) => rate.effectiveFrom > start)
      const previous = [...rates].reverse().find((rate) => rate.effectiveFrom < start)
      const end = parsed.data.effectiveUntil ? onlyDate(parsed.data.effectiveUntil) : (next ? priorDay(next.effectiveFrom) : null)
      if (next && end && end >= next.effectiveFrom) throw new EmployeeHrError('Rate overlaps a later compensation rate', 409)
      if (previous && (!previous.effectiveUntil || previous.effectiveUntil >= start)) {
        await tx.compensationRate.update({ where: { id: previous.id }, data: { effectiveUntil: priorDay(start) } })
      }
      const rate = await tx.compensationRate.create({ data: { employeeId: profile.id, branchId: profile.branchId, compensationType: parsed.data.compensationType, paymentFrequency: parsed.data.paymentFrequency, amount: parsed.data.amount.toFixed(2), effectiveFrom: start, effectiveUntil: end, reason: parsed.data.reason ?? null, setById: session.id } })
      await tx.auditLog.create({ data: { userId: session.id, branchId: profile.branchId, action: 'hr.compensation.create', entityType: 'compensation_rate', entityId: rate.id, newValues: { employeeId: id, effectiveFrom: start.toISOString().slice(0, 10) } } })
      return rate
    })
  } catch (error) { return hrSchemaError(error) }
}
