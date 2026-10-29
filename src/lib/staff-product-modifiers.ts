import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import { CatalogError } from '@/lib/staff-catalog'
import { resolveCatalogBranch } from '@/lib/catalog-branch'

const money = z.coerce.number().min(-999999.99).max(999999.99)
export const modifierMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('group.create'), branchId: z.string().regex(/^\d+$/), name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional(), type: z.enum(['single', 'multi']), isRequired: z.boolean(), minSelections: z.number().int().min(0).max(20), maxSelections: z.number().int().min(1).max(20) }),
  z.object({ action: z.literal('group.update'), id: z.string().regex(/^\d+$/), name: z.string().trim().min(1).max(100).optional(), description: z.string().trim().max(500).nullable().optional(), type: z.enum(['single', 'multi']).optional(), isRequired: z.boolean().optional(), minSelections: z.number().int().min(0).max(20).optional(), maxSelections: z.number().int().min(1).max(20).optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional() }),
  z.object({ action: z.literal('option.create'), groupId: z.string().regex(/^\d+$/), label: z.string().trim().min(1).max(100), priceAdjustment: money, sortOrder: z.number().int().min(0).max(100000).optional() }),
  z.object({ action: z.literal('option.update'), id: z.string().regex(/^\d+$/), label: z.string().trim().min(1).max(100).optional(), priceAdjustment: money.optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional() }),
  z.object({ action: z.literal('assignment.set'), productId: z.string().regex(/^\d+$/), groupIds: z.array(z.string().regex(/^\d+$/)).max(30) }),
])

function owner(session: StaffSession) { if (session.role !== ROLE.OWNER) throw new CatalogError('إدارة الإضافات متاحة للمالك فقط.', 403) }

export async function getModifierConfiguration(session: StaffSession, requestedBranchId?: string) {
  owner(session)
  const branchId = await resolveCatalogBranch(session, requestedBranchId)
  const [groups, products] = await Promise.all([
    prisma.productOption.findMany({ where: { branchId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, name: true, description: true, type: true, isRequired: true, minSelections: true, maxSelections: true, isActive: true, sortOrder: true, values: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, value: true, priceAdjustment: true, isActive: true, sortOrder: true } }, assignments: { select: { productId: true } } } }),
    prisma.product.findMany({ where: { branchId, deletedAt: null }, orderBy: { name: 'asc' }, select: { id: true, name: true, optionAssignments: { select: { productOptionId: true } } } }),
  ])
  return { branchId: branchId.toString(), groups: groups.map((group) => ({ ...group, id: group.id.toString(), values: group.values.map((value) => ({ ...value, id: value.id.toString(), priceAdjustment: value.priceAdjustment.toFixed(2) })), productIds: group.assignments.map((assignment) => assignment.productId.toString()), assignments: undefined })), products: products.map((product) => ({ id: product.id.toString(), name: product.name, groupIds: product.optionAssignments.map((assignment) => assignment.productOptionId.toString()) })) }
}

export async function mutateModifierConfiguration(session: StaffSession, input: unknown) {
  owner(session)
  const parsed = modifierMutationSchema.safeParse(input)
  if (!parsed.success) throw new CatalogError(parsed.error.issues[0]?.message ?? 'بيانات إضافات غير صالحة.', 400)
  const value = parsed.data
  if (value.action === 'group.create') {
    const branchId = await resolveCatalogBranch(session, value.branchId)
    validateLimits(value.type, value.isRequired, value.minSelections, value.maxSelections)
    const row = await prisma.productOption.create({ data: { branchId, name: value.name, description: value.description || null, type: value.type, isRequired: value.isRequired, minSelections: value.minSelections, maxSelections: value.type === 'single' ? 1 : value.maxSelections }, select: { id: true } })
    return { id: row.id.toString() }
  }
  if (value.action === 'group.update') {
    const current = await prisma.productOption.findUnique({ where: { id: BigInt(value.id) } })
    if (!current) throw new CatalogError('مجموعة الإضافات غير موجودة.', 404)
    validateLimits(value.type ?? current.type, value.isRequired ?? current.isRequired, value.minSelections ?? current.minSelections, value.maxSelections ?? current.maxSelections)
    await prisma.productOption.update({ where: { id: current.id }, data: { ...(value.name !== undefined ? { name: value.name } : {}), ...(value.description !== undefined ? { description: value.description || null } : {}), ...(value.type !== undefined ? { type: value.type, ...(value.type === 'single' ? { maxSelections: 1 } : {}) } : {}), ...(value.isRequired !== undefined ? { isRequired: value.isRequired } : {}), ...(value.minSelections !== undefined ? { minSelections: value.minSelections } : {}), ...(value.maxSelections !== undefined && (value.type ?? current.type) !== 'single' ? { maxSelections: value.maxSelections } : {}), ...(value.isActive !== undefined ? { isActive: value.isActive } : {}), ...(value.sortOrder !== undefined ? { sortOrder: value.sortOrder } : {}) } })
    return { id: value.id }
  }
  if (value.action === 'option.create') {
    const group = await prisma.productOption.findUnique({ where: { id: BigInt(value.groupId) }, select: { id: true } }); if (!group) throw new CatalogError('مجموعة الإضافات غير موجودة.', 404)
    const row = await prisma.productOptionValue.create({ data: { productOptionId: group.id, value: value.label, priceAdjustment: value.priceAdjustment, sortOrder: value.sortOrder ?? 0 }, select: { id: true } }); return { id: row.id.toString() }
  }
  if (value.action === 'option.update') {
    const row = await prisma.productOptionValue.findUnique({ where: { id: BigInt(value.id) }, select: { id: true } }); if (!row) throw new CatalogError('الخيار غير موجود.', 404)
    await prisma.productOptionValue.update({ where: { id: row.id }, data: { ...(value.label !== undefined ? { value: value.label } : {}), ...(value.priceAdjustment !== undefined ? { priceAdjustment: value.priceAdjustment } : {}), ...(value.isActive !== undefined ? { isActive: value.isActive } : {}), ...(value.sortOrder !== undefined ? { sortOrder: value.sortOrder } : {}) } }); return { id: value.id }
  }
  const product = await prisma.product.findUnique({ where: { id: BigInt(value.productId) }, select: { id: true, branchId: true } }); if (!product) throw new CatalogError('المنتج غير موجود.', 404)
  const unique = [...new Set(value.groupIds)]
  const count = await prisma.productOption.count({ where: { id: { in: unique.map(BigInt) }, branchId: product.branchId } }); if (count !== unique.length) throw new CatalogError('إحدى مجموعات الإضافات لا تتبع فرع المنتج.', 422)
  await prisma.$transaction(async (tx) => { await tx.productOptionAssignment.deleteMany({ where: { productId: product.id } }); if (unique.length) await tx.productOptionAssignment.createMany({ data: unique.map((id, index) => ({ productId: product.id, productOptionId: BigInt(id), sortOrder: index })) }) })
  return { id: value.productId }
}

function validateLimits(type: string, required: boolean, min: number, max: number) {
  const effectiveMax = type === 'single' ? 1 : max
  if (min > effectiveMax || (required && min < 1)) throw new CatalogError('حدود الاختيار غير صالحة.', 400)
}
