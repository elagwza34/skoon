import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { CatalogError } from '@/lib/staff-catalog'
import { resolveCatalogBranch } from '@/lib/catalog-branch'

// Re-export so category writes and API routes share one error type/source.
export { CatalogError }

const variantValueSchema = z.object({
  valueId: z.string().regex(/^\d+$/, 'قيمة غير صالحة'),
})

const variantSchema = z.object({
  valueIds: z.array(variantValueSchema).min(1, 'يجب تحديد قيمة واحدة على الأقل'),
  price: z.coerce.number().positive('سعر المتغير يجب أن يكون موجباً').max(999999.99),
  inventoryItemId: z.union([z.string().regex(/^\d+$/), z.null()]).optional(),
})

const attributeAssignmentSchema = z.object({
  attributeId: z.string().regex(/^\d+$/, 'خاصية غير صالحة'),
  isRequired: z.boolean().optional().default(false),
  minSelections: z.number().int().min(0).max(10).optional(),
  maxSelections: z.number().int().min(1).max(10).optional(),
})

const productSchema = z.object({
  name: z.string().trim().min(1, 'اسم المنتج مطلوب').max(150),
  description: z.string().trim().max(500).optional(),
  // Variant products persist a zero base only because the existing database
  // column is NOT NULL; it is never used as a sellable variant price.
  price: z.preprocess((value) => value === '' || value === null ? undefined : value, z.coerce.number().positive('السعر يجب أن يكون موجباً').max(999999.99).optional()),
  categoryId: z.string().regex(/^\d+$/, 'تصنيف غير صالح'),
  isAvailable: z.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  inventoryItemId: z.union([z.string().regex(/^\d+$/), z.null()]).optional(),
  isVariable: z.boolean().optional(),
  attributes: z.array(attributeAssignmentSchema).optional(),
  variants: z.array(variantSchema).optional(),
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

async function validateAttributeIds(branchId: bigint, attributeIds: string[]): Promise<void> {
  if (!attributeIds.length) return
  const found = await prisma.productAttribute.findMany({
    where: { branchId, id: { in: attributeIds.map((id) => BigInt(id)) }, isActive: true, archivedAt: null },
    select: { id: true },
  })
  const foundIds = new Set(found.map((a) => a.id.toString()))
  const missing = attributeIds.filter((id) => !foundIds.has(id))
  if (missing.length) throw new CatalogError(`الخاصية غير موجودة في هذا الفرع: ${missing.join(', ')}`, 404)
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

function normalizeBounds(assignment: z.infer<typeof attributeAssignmentSchema>): { minSelections: number; maxSelections: number } {
  const min = assignment.isRequired ? Math.max(1, assignment.minSelections ?? 1) : Math.max(0, assignment.minSelections ?? 0)
  const max = Math.max(min, assignment.maxSelections ?? min)
  return { minSelections: min, maxSelections: max }
}

function computeCombinationKey(attributeId: string, valueIds: string[]): string {
  return `${attributeId}:${[...valueIds].sort().join(',')}`
}

export interface ValidatedVariant {
  id: string
  combinationKey: string
  price: number
  inventoryItemId: string | null
  values: { attributeId: string; valueId: string }[]
}

export interface ValidatedAttributeAssignment {
  attributeId: string
  isRequired: boolean
  minSelections: number
  maxSelections: number
}

export interface CreateVariantsInput {
  attributeIds: string[] // validated attribute ids that belong to the branch
  variants: Array<{ valueIds: string[]; price: number; inventoryItemId: string | null }>
}

/**
 * Validates variants against the product's attributes and builds rows for
 * `product_variants`, `product_variant_values` and `variant_inventory_mappings`.
 * Returns the ids of the created variants.
 */
export async function createVariantsForProduct(
  productId: bigint,
  input: CreateVariantsInput,
): Promise<string[]> {
  if (!input.attributeIds.length) return []
  if (!input.variants.length) return []

  // Build a map: valueId -> owning attributeId
  const valueToAttribute = new Map<string, string>()
  for (const attrId of input.attributeIds) {
    const attrs = await prisma.productAttribute.findUnique({
      where: { id: BigInt(attrId) },
      select: { values: true },
    })
    if (!attrs) throw new CatalogError(`الخاصية غير موجودة: ${attrId}`, 404)
    for (const val of attrs.values) {
      valueToAttribute.set(val.id.toString(), attrId)
    }
  }

  const usedKeys = new Set<string>()
  const variantRows: { combinationKey: string; price: number; inventoryItemId: string | null }[] = []
  const variantValues: { variantId: bigint; valueId: bigint }[] = []
  const mappingRows: { variantId: bigint; inventoryItemId: bigint; quantity: string }[] = []

  for (let vi = 0; vi < input.variants.length; vi++) {
    const v = input.variants[vi]
    const seenValueIds = new Set<string>()
    const uniqueValues = new Set<string>()
    for (const valueId of v.valueIds) {
      if (!valueToAttribute.has(valueId)) {
        const sample = Array.from(valueToAttribute.entries()).find(([, attrId]) => attrId === valueId)
        throw new CatalogError(`القيمة غير معروفة في أي خاصية منتج: ${valueId}`, 400)
      }
      if (seenValueIds.has(valueId)) throw new CatalogError('تكرار قيمة داخل المتغير', 400)
      seenValueIds.add(valueId)
      uniqueValues.add(valueId)
    }

    // Sort values by attributeId for a deterministic combination key
    const sortedValues = [...uniqueValues].sort((a, b) => {
      const attrA = valueToAttribute.get(a)!
      const attrB = valueToAttribute.get(b)!
      return attrA.localeCompare(attrB)
    })

    let combinationKey = ''
    for (let ai = 0; ai < input.attributeIds.length; ai++) {
      const attrId = input.attributeIds[ai]
      const attrValues = sortedValues.filter((v) => valueToAttribute.get(v!) === attrId)
      combinationKey += `${attrId}:${attrValues.join(',')}|`
    }
    combinationKey = combinationKey.slice(0, -1)

    if (usedKeys.has(combinationKey)) {
      throw new CatalogError('تكوين متغير مكرر: تجميع القيم نفسه مرفوع مسبقاً', 409)
    }
    usedKeys.add(combinationKey)

    // Create the variant row
    const variant = await prisma.productVariant.create({
      data: {
        productId,
        combinationKey,
        sku: `VAR-${productId}-${vi + 1}`,
        price: v.price,
        isActive: true,
        isAvailable: true,
        sortOrder: vi,
      },
      select: { id: true },
    })
    const variantId = variant.id.toString()

    // Create variant value rows
    for (const valueId of uniqueValues) {
      variantValues.push({ variantId: BigInt(variantId), valueId: BigInt(valueId) })
    }

    // Inventory mapping (optional)
    if (v.inventoryItemId) {
      mappingRows.push({ variantId: BigInt(variantId), inventoryItemId: BigInt(v.inventoryItemId), quantity: '1' })
    }
  }

  // Bulk create variants (we already created them one by one in the loop; keep this for consistency).
  // The loop above already persisted each variant. Bulk insert bonus rows for speed is optional.

  await prisma.$transaction([
    prisma.productVariantValue.createMany({ data: variantValues }),
    prisma.variantInventoryMapping.createMany({ data: mappingRows }),
  ])

  const created = await prisma.productVariant.findMany({
    where: { productId, combinationKey: { in: Array.from(usedKeys) } },
    select: { id: true },
  })
  return created.map((v) => v.id.toString())
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

  const attributeIds = parsed.data.attributes?.map((a) => a.attributeId) ?? []
  const variants = parsed.data.variants ?? []
  if (!variants.length && parsed.data.price === undefined) throw new CatalogError('السعر مطلوب للمنتج بدون متغيرات', 400)

  // Resolve base fields
  const inventoryItemId = await resolveInventoryItem(branchId, parsed.data.inventoryItemId)

  const baseData: Record<string, unknown> = {
    branchId,
    categoryId: category.id,
    name: parsed.data.name.trim(),
    description: parsed.data.description?.trim() || null,
    price: parsed.data.price ?? 0,
    inventoryItemId: inventoryItemId !== undefined ? inventoryItemId : undefined,
    isActive: true,
    isAvailable: parsed.data.isAvailable ?? true,
  }
  if (parsed.data.taxRate !== undefined) baseData.taxRate = parsed.data.taxRate

  // Resolve attribute/variant payload
  if (attributeIds.length > 0 || variants.length > 0) {
    // Product is variable (or at least has attribute/variant payload)
    await validateAttributeIds(branchId, attributeIds)

    // Normalize attribute assignments
    const attributeAssignments: ValidatedAttributeAssignment[] = (parsed.data.attributes ?? []).map((a) => ({
      attributeId: a.attributeId,
      isRequired: a.isRequired ?? false,
      minSelections: normalizeBounds(a).minSelections,
      maxSelections: normalizeBounds(a).maxSelections,
    }))

    // Resolve inventory items for variants
    const resolvedVariants: Array<{ valueIds: { valueId: string }[]; price: number; inventoryItemId: string | null }> = []
    for (const v of variants) {
      let resolvedItemId: string | null = null
      if (v.inventoryItemId !== undefined && v.inventoryItemId !== null) {
        resolvedItemId = (await resolveInventoryItem(branchId, v.inventoryItemId))?.toString() ?? null
      }
      resolvedVariants.push({
        valueIds: v.valueIds,
        price: v.price,
        inventoryItemId: v.inventoryItemId === null ? null : resolvedItemId,
      })
    }

    // Create the product
    const product = await prisma.product.create({
      data: baseData as any,
      select: { id: true },
    })

    // Create attribute assignments
    if (attributeAssignments.length > 0) {
      await prisma.productAttributeAssignment.createMany({
        data: attributeAssignments.map((a, idx) => ({
          productId: product.id,
          attributeId: BigInt(a.attributeId),
          isRequired: a.isRequired,
          minSelections: a.minSelections,
          maxSelections: a.maxSelections,
          sortOrder: idx,
        })),
      })
    }

    const variantIds = await createVariantsForProduct(product.id, {
      attributeIds,
      variants: resolvedVariants.map((v) => ({
        valueIds: v.valueIds.map((x) => x.valueId),
        price: v.price,
        inventoryItemId: v.inventoryItemId,
      })),
    })

    return { id: product.id.toString(), variantCount: variantIds.length }
  }

  const product = await prisma.product.create({
    data: baseData as any,
    select: { id: true },
  })
  return { id: product.id.toString() }
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

  // Replace attributes if provided
  if (parsed.data.attributes !== undefined) {
    await prisma.productAttributeAssignment.deleteMany({ where: { productId: row.id } })
    if (parsed.data.attributes.length > 0) {
      await validateAttributeIds(row.branchId, parsed.data.attributes.map((a) => a.attributeId))
      await prisma.productAttributeAssignment.createMany({
        data: parsed.data.attributes.map((a, idx) => ({
          productId: row.id,
          attributeId: BigInt(a.attributeId),
          isRequired: a.isRequired ?? false,
          minSelections: a.isRequired ? Math.max(1, a.minSelections ?? 1) : Math.max(0, a.minSelections ?? 0),
          maxSelections: Math.max(a.isRequired ? Math.max(1, a.minSelections ?? 1) : Math.max(0, a.minSelections ?? 0), a.maxSelections ?? (a.isRequired ? Math.max(1, a.minSelections ?? 1) : Math.max(0, a.minSelections ?? 0))),
          sortOrder: idx,
        })),
      })
    }
  }

  // Replace variants if provided
  if (parsed.data.variants !== undefined) {
    const existing = await prisma.productVariant.findMany({ where: { productId: row.id }, select: { id: true } })
    const existingIds = existing.map((v) => v.id)
    if (existingIds.length > 0) {
      await prisma.productVariantValue.deleteMany({ where: { variantId: { in: existingIds } } })
      await prisma.variantInventoryMapping.deleteMany({ where: { variantId: { in: existingIds } } })
      await prisma.productVariant.deleteMany({ where: { id: { in: existingIds } } })
    }

    const attributeIds = parsed.data.attributes?.map((a) => a.attributeId) ?? (await (async () => {
      const assignments = await prisma.productAttributeAssignment.findMany({ where: { productId: row.id }, select: { attributeId: true } })
      return assignments.map((a) => a.attributeId.toString())
    })())

    if (parsed.data.variants.length > 0) {
      const resolvedVariants: Array<{ valueIds: string[]; price: number; inventoryItemId: string | null }> = []
      for (const v of parsed.data.variants) {
        let resolvedItemId: string | null = null
        if (v.inventoryItemId !== undefined && v.inventoryItemId !== null) {
          resolvedItemId = (await resolveInventoryItem(row.branchId, v.inventoryItemId))?.toString() ?? null
        }
        resolvedVariants.push({
          valueIds: v.valueIds.map((x) => x.valueId),
          price: v.price,
          inventoryItemId: v.inventoryItemId === null ? null : resolvedItemId,
        })
      }
      await createVariantsForProduct(row.id, {
        attributeIds,
        variants: resolvedVariants,
      })
    }
  }

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
