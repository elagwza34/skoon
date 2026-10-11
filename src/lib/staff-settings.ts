import { prisma } from '@/lib/prisma'
import { ROLE, hasAtLeast } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'

/**
 * Branch settings — real app_settings rows + branch info from the DB.
 * Owner/manager may read; writes gated to owner/manager in the action.
 * Server-only.
 */
export interface BranchSetting {
  key: string
  value: string | null
}

export interface SettingsSnapshot {
  branchId: string | null
  branchName: string | null
  settings: BranchSetting[]
  canManage: boolean
}

export async function getSettingsSnapshot(session: StaffSession): Promise<SettingsSnapshot> {
  const canManage = hasAtLeast(session.role, ROLE.MANAGER)

  if (session.role === ROLE.OWNER) {
    const branches = await prisma.cafeBranch.findMany({
      where: { isActive: true }, orderBy: { name: 'asc' }, take: 1,
      select: { id: true, name: true },
    })
    const first = branches[0]
    if (!first) return { branchId: null, branchName: null, settings: [], canManage }
    const rows = await prisma.appSetting.findMany({
      where: { branchId: first.id }, orderBy: { key: 'asc' },
      select: { key: true, value: true },
    })
    return {
      branchId: first.id.toString(), branchName: first.name,
      settings: rows.map((r) => ({ key: r.key, value: r.value })), canManage,
    }
  }

  if (!session.branchId) return { branchId: null, branchName: null, settings: [], canManage }
  const branchId = BigInt(session.branchId)
  const [branch, rows] = await Promise.all([
    prisma.cafeBranch.findUnique({ where: { id: branchId }, select: { name: true } }),
    prisma.appSetting.findMany({
      where: { branchId }, orderBy: { key: 'asc' },
      select: { key: true, value: true },
    }),
  ])
  return {
    branchId: session.branchId, branchName: branch?.name ?? null,
    settings: rows.map((r) => ({ key: r.key, value: r.value })), canManage,
  }
}
