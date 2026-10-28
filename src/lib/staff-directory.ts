import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import { canManageEmployeeLifecycle, canManageWorkSchedules } from '@/lib/hr-authz'
import type { StaffSession } from '@/lib/session'
import { usernameFromStaffEmail } from '@/lib/staff-username'

/**
 * Staff directory — real users + roles + branches from the DB.
 * Owner sees all; manager sees own branch. Server-only.
 */
export interface StaffRow {
  id: string
  name: string
  email: string | null
  username: string | null
  role: string
  roleName: string
  branchId: string | null
  branchName: string | null
  isActive: boolean
  createdAt: string
}

export interface StaffDirectory {
  rows: StaffRow[]
  roles: { id: string; slug: string; name: string }[]
  branches: { id: string; name: string; code: string }[]
  canManage: boolean
  canSchedule: boolean
}

export async function getStaffDirectory(session: StaffSession): Promise<StaffDirectory> {
  const canManage = canManageEmployeeLifecycle(session.role)
  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [users, roles, branches] = await Promise.all([
    prisma.user.findMany({
      where: { ...branchScope, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, name: true, email: true, username: true, branchId: true, isActive: true, createdAt: true,
        role: { select: { slug: true, name: true } },
        branch: { select: { name: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { id: 'asc' }, select: { id: true, slug: true, name: true } }),
    session.role === ROLE.OWNER
      ? prisma.cafeBranch.findMany({
          where: { isActive: true }, orderBy: { name: 'asc' },
          select: { id: true, name: true, code: true },
        })
      : [],
  ])

  return {
    rows: users.map((u) => ({
      id: u.id, name: u.name, email: (u.username || usernameFromStaffEmail(u.email)) ? null : u.email, username: u.username ?? usernameFromStaffEmail(u.email),
      role: u.role.slug, roleName: u.role.name,
      branchId: u.branchId?.toString() ?? null,
      branchName: u.branch?.name ?? null,
      isActive: u.isActive, createdAt: u.createdAt.toISOString(),
    })),
    roles: roles.map((r) => ({ id: r.id.toString(), slug: r.slug, name: r.name })),
    branches: branches.map((b) => ({ id: b.id.toString(), name: b.name, code: b.code })),
    canManage,
    canSchedule: canManageWorkSchedules(session.role),
  }
}
