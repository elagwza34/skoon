import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { CatalogError, canManageProducts, requireManager } from '@/lib/staff-catalog-write'
import { resolveCatalogBranch } from '@/lib/catalog-branch'

/** التصنيف الافتراضي الذي تنتقل إليه منتجات التصنيف المحذوف. */
const UNCATEGORIZED_CATEGORY_NAME = 'منتجات بدون تصنيف'

async function getOrCreateUncategorizedCategory(branchId: bigint): Promise<bigint> {
  const existing = await prisma.category.findFirst({
    where: { branchId, name: UNCATEGORIZED_CATEGORY_NAME, deletedAt: null },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await prisma.category.create({
    data: {
      branchId,
      name: UNCATEGORIZED_CATEGORY_NAME,
      slug: makeSlug(UNCATEGORIZED_CATEGORY_NAME),
      sortOrder: 9999,
      isActive: true,
    },
    select: { id: true },
  })
  return created.id
}

export interface CategoryRow {
  id: string
  name: string
  sortOrder: number | null
  productsCount: number
}

/** Server-side validation for category create/update (Arabic messages). */
const categorySchema = z.object({
  name: z.string().trim().min(1, 'اسم التصنيف مطلوب').max(100),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
})

/** URL-safe-ish slug; Arabic letters are preserved as words, plus a random
 * suffix so the per-branch unique constraint never collides. */
function makeSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'cat'}-${randomBytes(4).toString('hex')}`
}

export async function createStaffCategory(session: StaffSession, branchIdRaw: string | undefined, input: unknown) {
  if (!canManageProducts(session.role)) throw new CatalogError('Forbidden', 403)
  const parsed = categorySchema.safeParse(input)
  if (!parsed.success) throw new CatalogError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const branchId = await resolveCatalogBranch(session, branchIdRaw)

  const name = parsed.data.name.trim()
  const dup = await prisma.category.findFirst({
    where: { branchId, name, deletedAt: null },
    select: { id: true },
  })
  if (dup) throw new CatalogError('يوجد تصنيف بنفس الاسم في هذا الفرع', 409)

  const created = await prisma.category.create({
    data: {
      branchId,
      name,
      slug: makeSlug(name),
      sortOrder: parsed.data.sortOrder ?? 0,
      isActive: true,
    },
    select: { id: true },
  })
  return { id: created.id.toString() }
}

export async function updateStaffCategory(session: StaffSession, id: string, input: unknown) {
  requireManager(session)
  if (!/^\d+$/.test(id)) throw new CatalogError('التصنيف غير موجود', 404)
  const parsed = categorySchema.partial().safeParse(input)
  if (!parsed.success) throw new CatalogError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)

  const row = await prisma.category.findFirst({
    where: { id: BigInt(id), deletedAt: null },
    select: { id: true, branchId: true },
  })
  if (!row) throw new CatalogError('التصنيف غير موجود', 404)
  if (!staffCanAccessBranch(session, row.branchId)) throw new CatalogError('Forbidden', 403)

  const data: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim()
    const dup = await prisma.category.findFirst({
      where: { branchId: row.branchId, name, deletedAt: null, id: { not: row.id } },
      select: { id: true },
    })
    if (dup) throw new CatalogError('يوجد تصنيف بنفس الاسم في هذا الفرع', 409)
    data.name = name
  }
  if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder

  if (Object.keys(data).length === 0) return { id }
  await prisma.category.update({ where: { id: row.id }, data })
  return { id }
}

export async function deleteStaffCategory(session: StaffSession, id: string) {
  requireManager(session)
  if (!/^\d+$/.test(id)) throw new CatalogError('التصنيف غير موجود', 404)

  const row = await prisma.category.findFirst({
    where: { id: BigInt(id), deletedAt: null },
    select: { id: true, branchId: true, name: true },
  })
  if (!row) throw new CatalogError('التصنيف غير موجود', 404)
  if (!staffCanAccessBranch(session, row.branchId)) throw new CatalogError('Forbidden', 403)
  if (row.name === UNCATEGORIZED_CATEGORY_NAME)
    throw new CatalogError('لا يمكن حذف التصنيف الافتراضي "منتجات بدون تصنيف"', 409)

  const uncategorizedId = await getOrCreateUncategorizedCategory(row.branchId)

  // نقل كل المنتجات غير المحذوفة إلى التصنيف الافتراضي، ثم حذف التصنيف الأصل ناعماً.
  await prisma.$transaction([
    prisma.product.updateMany({
      where: { categoryId: row.id, branchId: row.branchId, deletedAt: null },
      data: { categoryId: uncategorizedId },
    }),
    prisma.category.update({ where: { id: row.id }, data: { deletedAt: new Date() } }),
  ])
  return { id }
}

