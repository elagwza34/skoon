import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { CatalogError } from '@/lib/staff-catalog'

/**
 * Deterministic selection rule for catalog writes. A missing requested branch
 * is resolved only when exactly one eligible active branch exists; it never
 * falls back to an arbitrary first row in a multi-branch deployment.
 */
export function selectCatalogBranch(
  eligibleBranchIds: readonly bigint[],
  requestedBranchId?: string,
): bigint {
  if (requestedBranchId !== undefined && !/^\d+$/.test(requestedBranchId)) {
    throw new CatalogError('معرّف الفرع غير صالح', 400)
  }
  if (eligibleBranchIds.length === 0) {
    throw new CatalogError('إعداد الفروع غير مكتمل: لا يوجد فرع نشط مصرح به', 503)
  }
  if (requestedBranchId !== undefined) {
    const requested = BigInt(requestedBranchId)
    if (!eligibleBranchIds.some((id) => id === requested)) throw new CatalogError('غير مصرح بهذا الفرع', 403)
    return requested
  }
  if (eligibleBranchIds.length !== 1) {
    throw new CatalogError('اختر فرعًا مصرحًا به قبل إدارة الكتالوج', 409)
  }
  return eligibleBranchIds[0]
}

/** Resolve an active, authorized branch for catalog/category writes. */
export async function resolveCatalogBranch(session: StaffSession, requestedBranchId?: string): Promise<bigint> {
  // Branch staff have one trusted branch assignment. A client-supplied branch
  // cannot expand that scope and is rejected when it disagrees.
  if (session.role !== ROLE.OWNER) {
    if (!session.branchId) throw new CatalogError('حسابك غير مرتبط بفرع نشط', 503)
    const assigned = BigInt(session.branchId)
    if (requestedBranchId !== undefined && requestedBranchId !== session.branchId) {
      throw new CatalogError('غير مصرح بهذا الفرع', 403)
    }
    const branch = await prisma.cafeBranch.findFirst({
      where: { id: assigned, isActive: true }, select: { id: true },
    })
    return selectCatalogBranch(branch ? [branch.id] : [], requestedBranchId)
  }

  // Owner has cross-branch authority, but an implicit selection is safe only
  // in the single-branch deployment. Read at most two rows to distinguish 0/1/many.
  const branches = await prisma.cafeBranch.findMany({
    where: { isActive: true }, orderBy: { id: 'asc' }, take: 2, select: { id: true },
  })
  const eligible = branches.filter((branch) => staffCanAccessBranch(session, branch.id)).map((branch) => branch.id)
  return selectCatalogBranch(eligible, requestedBranchId)
}
