/**
 * Authorization helpers — pure functions, no database or network access.
 *
 * These encode the privilege model derived from the Prisma schema
 * (`Role`, `Permission`, `RolePermission`). They are intentionally side-effect
 * free so they can be unit-tested offline and reused on the server.
 *
 * SECURITY: a caller's role/permissions must come from a trusted server-side
 * source (database lookup), NEVER from client-supplied claims or user_metadata.
 */

/** Canonical role slugs (seeded in `roles.slug`). */
export const ROLE = {
  OWNER: 'owner',
  MANAGER: 'manager',
  CASHIER: 'cashier',
  WAITER: 'waiter',
  KITCHEN: 'kitchen',
} as const

export type RoleSlug = (typeof ROLE)[keyof typeof ROLE]

/**
 * Roles that must be inside an active operational shift before branch work.
 * This is intentionally separate from authorization permissions: Owner and
 * Manager may supervise authorized work without opening a workstation shift.
 */
export const OPERATIONAL_SHIFT_REQUIRED_ROLES = [
  ROLE.CASHIER,
  ROLE.WAITER,
  ROLE.KITCHEN,
] as const satisfies readonly RoleSlug[]

/** Authoritative, type-safe operational-shift policy for server guards. */
export function requiresOperationalShift(role: string): role is (typeof OPERATIONAL_SHIFT_REQUIRED_ROLES)[number] {
  return (OPERATIONAL_SHIFT_REQUIRED_ROLES as readonly string[]).includes(role)
}

/**
 * Privilege rank (higher = more privileged). Used for "at least" checks.
 * Owner > Manager > Cashier > Waiter > Kitchen.
 */
const RANK: Record<RoleSlug, number> = {
  owner: 100,
  manager: 80,
  cashier: 60,
  waiter: 40,
  kitchen: 20,
}

/** True if `role` exists in the known set. */
export function isKnownRole(role: string): role is RoleSlug {
  return Object.prototype.hasOwnProperty.call(RANK, role)
}

/** True if `role` has at least the privilege of `required`. */
export function hasAtLeast(role: string, required: RoleSlug): boolean {
  if (!isKnownRole(role) || !isKnownRole(required)) return false
  return RANK[role] >= RANK[required]
}

/** True only for the Owner role. */
export function isOwner(role: string): boolean {
  return isKnownRole(role) && role === ROLE.OWNER
}

/**
 * Branch-scoped access check.
 * - Owner (`branchId === null`) may access any branch.
 * - Other staff may access only their own branch.
 * Multi-branch membership is a future model change; today a user has one branch.
 */
export function canAccessBranch(userBranchId: bigint | number | null, targetBranchId: bigint | number): boolean {
  if (userBranchId === null) return true // owner
  if (userBranchId === undefined) return false
  return BigInt(userBranchId) === BigInt(targetBranchId)
}

/**
 * Permission check against a set of granted permission slugs (from
 * `RolePermission`). Exact slug match; no wildcard expansion.
 */
export function hasPermission(granted: ReadonlySet<string> | readonly string[], required: string): boolean {
  const set = granted instanceof Set ? granted : new Set(granted)
  return set.has(required)
}
