import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import { CatalogError } from '@/lib/staff-catalog'
import { resolveCatalogBranch } from '@/lib/catalog-branch'

const createSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('attribute'), name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional(), branchId: z.string().regex(/^\d+$/).optional() }),
  z.object({ kind: z.literal('value'), attributeId: z.string().regex(/^\d+$/), label: z.string().trim().min(1).max(100) }),
  z.object({ kind: z.literal('unit'), name: z.string().trim().min(1).max(100), symbol: z.string().trim().min(1).max(20), dimension: z.string().trim().min(1).max(30), branchId: z.string().regex(/^\d+$/).optional() }),
])

function requireConfigurationManager(session: StaffSession) {
  if (session.role !== ROLE.OWNER) throw new CatalogError('إدارة الخصائص والوحدات متاحة للمالك فقط.', 403)
}

export async function getProductConfiguration(session: StaffSession, requestedBranchId?: string) {
  requireConfigurationManager(session)
  const branchId = await resolveCatalogBranch(session, requestedBranchId)
  const [attributes, units] = await Promise.all([
    prisma.productAttribute.findMany({
      where: { branchId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, description: true, isActive: true, values: { where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: { id: true, label: true, isActive: true } } },
    }),
    prisma.measurementUnit.findMany({
      where: { branchId, archivedAt: null }, orderBy: [{ dimension: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, symbol: true, dimension: true, isActive: true },
    }),
  ])
  return {
    branchId: branchId.toString(),
    attributes: attributes.map((attribute) => ({ ...attribute, id: attribute.id.toString(), values: attribute.values.map((value) => ({ ...value, id: value.id.toString() })) })),
    units: units.map((unit) => ({ ...unit, id: unit.id.toString() })),
  }
}

export async function createProductConfiguration(session: StaffSession, input: unknown) {
  requireConfigurationManager(session)
  const parsed = createSchema.safeParse(input)
  if (!parsed.success) throw new CatalogError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة.', 400)

  if (parsed.data.kind === 'value') {
    const attribute = await prisma.productAttribute.findUnique({ where: { id: BigInt(parsed.data.attributeId) }, select: { id: true, branchId: true, archivedAt: true } })
    if (!attribute || attribute.archivedAt) throw new CatalogError('الخاصية غير موجودة.', 404)
    const branchId = await resolveCatalogBranch(session, attribute.branchId.toString())
    const value = await prisma.productAttributeValue.create({ data: { attributeId: attribute.id, label: parsed.data.label }, select: { id: true, label: true } })
    await prisma.auditLog.create({ data: { userId: session.id, branchId, action: 'product_attribute_value_created', entityType: 'product_attribute_value', entityId: value.id, newValues: { attributeId: attribute.id.toString(), label: value.label } } })
    return { kind: 'value' as const, id: value.id.toString(), label: value.label }
  }

  const branchId = await resolveCatalogBranch(session, parsed.data.branchId)
  if (parsed.data.kind === 'attribute') {
    const attribute = await prisma.productAttribute.create({ data: { branchId, name: parsed.data.name, description: parsed.data.description || null }, select: { id: true, name: true } })
    await prisma.auditLog.create({ data: { userId: session.id, branchId, action: 'product_attribute_created', entityType: 'product_attribute', entityId: attribute.id, newValues: { name: attribute.name } } })
    return { kind: 'attribute' as const, id: attribute.id.toString(), name: attribute.name }
  }

  const unit = await prisma.measurementUnit.create({ data: { branchId, name: parsed.data.name, symbol: parsed.data.symbol, dimension: parsed.data.dimension }, select: { id: true, name: true } })
  await prisma.auditLog.create({ data: { userId: session.id, branchId, action: 'measurement_unit_created', entityType: 'measurement_unit', entityId: unit.id, newValues: { name: unit.name, symbol: parsed.data.symbol } } })
  return { kind: 'unit' as const, id: unit.id.toString(), name: unit.name }
}
