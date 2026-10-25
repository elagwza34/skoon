import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { CatalogError } from '@/lib/staff-catalog'
import { resolveCatalogBranch } from '@/lib/catalog-branch'

// Re-export so category writes and API routes share one error type/source.
export { CatalogError }

/** Validation for product create/update (server-side, Arabic messages). */
const productSchema = z.object({
  name: z.string().trim().min(1, 'اسم المنتج مطلوب').max(150),
  description: z.string().trim().max(500).optional(),
  price: z.coerce.number().positive('السعر يجب أن يكون موجباً').max(999999.99),
  categoryId: z.string().regex(/^\d+$/, 'تصنيف غير صالح'),
  isAvailable: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  inventoryItemId: z.union([z.string().regex(/^\d+$/), z.null()]).optional(),
})

/** Resolve the branch a product write targets (owner passes branchId; staff = own). */
export function targetBranch(session: StaffSession, branchIdRaw?: string): bigint {
  if (session.role === ROLE.OWNER) {
    if (!branchIdRaw || !/^\d+$/.test(branchIdRaw)) throw new CatalogError('اختر الفرع', 400)
    return BigInt(branchIdRaw)
  }
  if (!session.branchId) throw new CatalogError('Forbidden', 403)
  return BigInt(session.branchId)
}

export function requireManager(session: StaffSession) {
  if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER)
    throw new CatalogError('Forbidden', 403)
}

/** Product writes are intentionally broader than category administration. */
export function canManageProducts(role: string): boolean {
  return role === ROLE.OWNER || role === ROLE.MANAGER || role === ROLE.CASHIER
}

function requireProductManager(session: StaffSession) {
  if (!canManageProducts(session.role)) throw new CatalogError('Forbidden', 403)
}

async function resolveInventoryItem(branchId: bigint, inventoryItemId: string | null | undefined) {
  if (inventoryItemId === undefined) return undefined
  if (inventoryItemId === null) return null
  const item = await prisma.inventoryItem.findFirst({
    where: { id: BigInt(inventoryItemId), branchId, isActive: true, deletedAt: null },
    select: { id: true },
  })
  if (!item) throw new CatalogError('Inventory item is not in this branch', 404)
  return item.id
}

export async function createStaffProduct(session: StaffSession, branchIdRaw: string | undefined, input: unknown) {
  requireProductManager(session)
  const parsed = productSchema.safeParse(input)
  if (!parsed.success) throw new CatalogError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const branchId = await resolveCatalogBranch(session, branchIdRaw)

  const category = await prisma.category.findFirst({
    where: { id: BigInt(parsed.data.categoryId), branchId, deletedAt: null },
    select: { id: true },
  })
  if (!category) throw new CatalogError('التصنيف غير موجود في هذا الفرع', 404)

  const inventoryItemId = await resolveInventoryItem(branchId, parsed.data.inventoryItemId)
  const created = await prisma.product.create({
    data: {
      branchId, categoryId: category.id,
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      price: parsed.data.price,
      ...(parsed.data.taxRate !== undefined ? { taxRate: parsed.data.taxRate } : {}),
      ...(inventoryItemId !== undefined ? { inventoryItemId } : {}),
      isActive: true, isAvailable: parsed.data.isAvailable ?? true,
    },
    select: { id: true },
  })
  return { id: created.id.toString() }
}

export async function updateStaffProduct(session: StaffSession, id: string, input: unknown) {
  requireProductManager(session)
  if (!/^\d+$/.test(id)) throw new CatalogError('المنتج غير موجود', 404)
  const parsed = productSchema.partial().safeParse(input)
  if (!parsed.success) throw new CatalogError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)

  const row = await prisma.product.findUnique({
    where: { id: BigInt(id) }, select: { id: true, branchId: true, isActive: true, deletedAt: true },
  })
  if (!row) throw new CatalogError('المنتج غير موجود', 404)
  if (!staffCanAccessBranch(session, row.branchId)) throw new CatalogError('Forbidden', 403)
  if (!row.isActive || row.deletedAt) throw new CatalogError('Product not found', 404)

  const data: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim()
  if (parsed.data.description !== undefined) data.description = parsed.data.description.trim() || null
  if (parsed.data.price !== undefined) data.price = parsed.data.price
  if (parsed.data.isAvailable !== undefined) data.isAvailable = parsed.data.isAvailable
  if (parsed.data.taxRate !== undefined) data.taxRate = parsed.data.taxRate
  if (parsed.data.inventoryItemId !== undefined) data.inventoryItemId = await resolveInventoryItem(row.branchId, parsed.data.inventoryItemId)
  if (parsed.data.categoryId !== undefined) {
    const cat = await prisma.category.findFirst({
      where: { id: BigInt(parsed.data.categoryId), branchId: row.branchId, deletedAt: null },
      select: { id: true },
    })
    if (!cat) throw new CatalogError('التصنيف غير موجود في هذا الفرع', 404)
    data.categoryId = cat.id
  }

  await prisma.product.update({ where: { id: row.id }, data })
  return { id }
}

export async function toggleProductAvailability(session: StaffSession, id: string) {
  requireProductManager(session)
  if (!/^\d+$/.test(id)) throw new CatalogError('المنتج غير موجود', 404)
  const row = await prisma.product.findUnique({
    where: { id: BigInt(id) }, select: { id: true, branchId: true, isAvailable: true, isActive: true, deletedAt: true },
  })
  if (!row) throw new CatalogError('المنتج غير موجود', 404)
  if (!staffCanAccessBranch(session, row.branchId)) throw new CatalogError('Forbidden', 403)
  if (!row.isActive || row.deletedAt) throw new CatalogError('Product not found', 404)
  const updated = await prisma.product.update({
    where: { id: row.id }, data: { isAvailable: !row.isAvailable }, select: { isAvailable: true },
  })
  return { id, isAvailable: updated.isAvailable }
}

/** Archives product availability without deleting historical order references. */
export async function archiveStaffProduct(session: StaffSession, id: string) {
  requireProductManager(session)
  if (!/^\d+$/.test(id)) throw new CatalogError('Product not found', 404)
  const row = await prisma.product.findUnique({
    where: { id: BigInt(id) }, select: { id: true, branchId: true, deletedAt: true },
  })
  if (!row || row.deletedAt) throw new CatalogError('Product not found', 404)
  if (!staffCanAccessBranch(session, row.branchId)) throw new CatalogError('Forbidden', 403)
  await prisma.product.update({
    where: { id: row.id },
    data: { isActive: false, isAvailable: false, deletedAt: new Date() },
  })
  return { id }
}
