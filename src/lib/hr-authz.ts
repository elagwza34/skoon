import { ROLE, type RoleSlug } from '@/lib/authz'

/**
 * HR lifecycle authority is deliberately independent from editable role
 * permissions. A custom permission must not grant compensation, archival, or
 * credential control reserved for the Owner.
 */
export function canManageEmployeeLifecycle(role: string): boolean {
  return role === ROLE.OWNER
}

/** Employee directories are an administrative/operational manager surface. */
export function canReadEmployeeDirectory(role: string): boolean {
  return role === ROLE.OWNER || role === ROLE.MANAGER
}

/** Compensation, private contacts, contracts, and archive reasons are Owner-only. */
export function canReadSensitiveEmployeeData(role: string): boolean {
  return role === ROLE.OWNER
}

/** Managers plan branch operations; Owners retain cross-branch authority. */
export function canManageWorkSchedules(role: string): boolean {
  return role === ROLE.OWNER || role === ROLE.MANAGER
}

/** Attendance corrections affect payroll inputs, so final approval remains Owner-only. */
export function canApproveAttendanceCorrections(role: string): boolean {
  return role === ROLE.OWNER
}

export interface PasswordResetActor {
  role: RoleSlug
  branchId: string | null
}

export interface PasswordResetTarget {
  role: RoleSlug
  branchId: bigint | null
}

/** Owner may reset any password; managers may reset only non-manager staff in their branch. */
export function canResetEmployeePassword(actor: PasswordResetActor, target: PasswordResetTarget): boolean {
  if (actor.role === ROLE.OWNER) return true
  if (actor.role !== ROLE.MANAGER || actor.branchId === null) return false
  if (target.role === ROLE.OWNER || target.role === ROLE.MANAGER) return false
  return target.branchId !== null && target.branchId.toString() === actor.branchId
}
