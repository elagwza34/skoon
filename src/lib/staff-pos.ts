import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import { orderedVariantLabels } from '@/lib/order-item-variant'

/**
 * Staff POS catalog — real products + tables for the cashier screen.
 * Branch-scoped. Server-only.
 */

export interface PosCatalogVariant {
  id: string
  label: string
  price: string
  priceAdjustment: string
  isAvailable: boolean
}

export interface PosCatalogModifierGroup {
  id: string
  name: string
  description: string | null
  isRequired: boolean
  minSelections: number
  maxSelections: number
  sortOrder: number
  options: { id: string; label: string; priceAdjustment: string; isActive: boolean }[]
}

export interface PosCatalogProduct {
  id: string
  name: string
  price: string
  categoryId: string
  categoryName: string
  isAvailable: boolean
  variants: PosCatalogVariant[]
  modifierGroups: PosCatalogModifierGroup[]
}

export interface PosCatalog {
  /** Browser-only draft isolation key; never used as server-side authority. */
  draftScope: { userId: string; branchId: string | null }
  categories: { id: string; name: string }[]
  products: PosCatalogProduct[]
  tables: { id: string; number: string; name: string | null }[]
}

export class PosError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'PosError'
    this.status = status
  }
}

export async function getPosCatalog(session: StaffSession): Promise<PosCatalog> {
  if (session.role === ROLE.KITCHEN) throw new PosError('Forbidden', 403)
  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [categories, products, tables] = await Promise.all([
    prisma.category.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, price: true, categoryId: true, isAvailable: true,
        category: { select: { name: true } },
        variants: {
          where: { isActive: true, isAvailable: true, archivedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: { id: true, combinationKey: true, price: true, isAvailable: true, values: { select: { value: { select: { label: true, attribute: { select: { sortOrder: true } } } } } } },
        },
        optionAssignments: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            sortOrder: true,
            productOption: {
              select: {
                id: true, name: true, description: true, type: true, isRequired: true,
                minSelections: true, maxSelections: true, isActive: true,
                values: {
                  where: { isActive: true, deletedAt: null },
                  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                  select: { id: true, value: true, priceAdjustment: true, isActive: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.cafeTable.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, name: true },
    }),
  ])
  return {
    draftScope: { userId: session.id, branchId: session.branchId },
    categories: categories.map((c) => ({ id: c.id.toString(), name: c.name })),
    products: products.map((p) => {
      const modifierGroups: PosCatalogModifierGroup[] = p.optionAssignments
        .filter((assignment) => assignment.productOption.isActive)
        .map((assignment) => {
        const group = assignment.productOption
        return {
          id: group.id.toString(), name: group.name, description: group.description,
          isRequired: group.isRequired, minSelections: group.minSelections,
          maxSelections: group.type === 'single' ? 1 : group.maxSelections,
          sortOrder: assignment.sortOrder,
          options: group.values.map((option) => ({ id: option.id.toString(), label: option.value, priceAdjustment: option.priceAdjustment.toFixed(2), isActive: option.isActive })),
        }
      })
      return {
        id: p.id.toString(), name: p.name, price: p.price.toString(),
        categoryId: p.categoryId.toString(), categoryName: p.category.name,
        isAvailable: p.isAvailable,
        variants: p.variants.map((v) => ({
          id: v.id.toString(),
          label: orderedVariantLabels(v.values.map((entry) => entry.value), v.combinationKey).join(' · '),
          price: v.price.toString(),
          priceAdjustment: (Number(v.price) - Number(p.price)).toFixed(2),
          isAvailable: v.isAvailable,
        })),
        modifierGroups,
      }
    }),
    tables: tables.map((t) => ({ id: t.id.toString(), number: t.number, name: t.name })),
  }
}

export const posItemSchema = z.object({
  productId: z.string().regex(/^\d+$/, 'Invalid product id'),
  variantId: z.string().regex(/^\d+$/, 'Invalid variant id').optional(),
  modifierSelections: z.array(z.object({
    groupId: z.string().regex(/^\d+$/),
    valueIds: z.array(z.string().regex(/^\d+$/)).max(20),
  })).max(20).default([]),
  qty: z.number().int().min(1).max(20),
  note: z.string().max(255).optional(),
  discountType: z.enum(['percentage', 'amount']).optional(),
  discountValue: z.coerce.number().min(0).max(9_999_999).optional(),
})

export const posOrderSchema = z.object({
  orderType: z.enum(['dine_in', 'takeaway']).default('dine_in'),
  tableId: z.string().regex(/^\d+$/, 'اختر الطاولة').optional(),
  customerName: z.string().trim().max(60).optional(),
  customerPhone: z.string().trim().regex(/^[0-9+()\-\s]{6,30}$/).optional(),
  notes: z.string().trim().max(2_000).optional(),
  discountType: z.enum(['percentage', 'amount']).optional(),
  discountValue: z.coerce.number().min(0).max(9_999_999).optional(),
  items: z.array(posItemSchema).min(1, 'السلة فارغة').max(30),
}).superRefine((value, context) => {
  if (value.orderType === 'dine_in' && !value.tableId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['tableId'], message: 'اختر الطاولة' })
  if (value.discountType === 'percentage' && (value.discountValue ?? 0) > 100) context.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'نسبة الخصم لا تتجاوز 100%' })
  value.items.forEach((item, index) => {
    if (item.discountType === 'percentage' && (item.discountValue ?? 0) > 100) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'discountValue'], message: 'نسبة الخصم لا تتجاوز 100%' })
  })
})
