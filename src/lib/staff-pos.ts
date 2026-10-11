import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'

/**
 * Staff POS catalog — real products + tables for the cashier screen.
 * Branch-scoped. Server-only.
 */

export interface PosCatalogProduct {
  id: string
  name: string
  price: string
  categoryId: string
  categoryName: string
  isAvailable: boolean
}

export interface PosCatalog {
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
      },
    }),
    prisma.cafeTable.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { number: 'asc' }],
      select: { id: true, number: true, name: true },
    }),
  ])
  return {
    categories: categories.map((c) => ({ id: c.id.toString(), name: c.name })),
    products: products.map((p) => ({
      id: p.id.toString(), name: p.name, price: p.price.toString(),
      categoryId: p.categoryId.toString(), categoryName: p.category.name,
      isAvailable: p.isAvailable,
    })),
    tables: tables.map((t) => ({ id: t.id.toString(), number: t.number, name: t.name })),
  }
}

export const posItemSchema = z.object({
  productId: z.string().regex(/^\d+$/, 'Invalid product id'),
  qty: z.number().int().min(1).max(20),
  note: z.string().max(255).optional(),
})

export const posOrderSchema = z.object({
  tableId: z.string().regex(/^\d+$/, 'اختر الطاولة').optional(),
  customerName: z.string().trim().max(60).optional(),
  items: z.array(posItemSchema).min(1, 'السلة فارغة').max(30),
})
