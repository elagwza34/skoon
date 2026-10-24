import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'

/**
 * Staff catalog — real products + categories from the database.
 * Branch-scoped (Owner sees all branches). Server-only.
 */

export interface CatalogCategory {
  id: string
  branchId: string
  name: string
  sortOrder: number | null
  productsCount: number
}

export interface CatalogProduct {
  id: string
  name: string
  description: string | null
  price: string
  imagePath: string | null
  categoryId: string
  categoryName: string
  isActive: boolean
  isAvailable: boolean
  sortOrder: number | null
}

export interface StaffCatalog {
  categories: CatalogCategory[]
  products: CatalogProduct[]
}

export async function getStaffCatalog(session: StaffSession): Promise<StaffCatalog> {
  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { ...branchScope, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, branchId: true, name: true, sortOrder: true,
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
    }),
    prisma.product.findMany({
      where: { ...branchScope, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, description: true, price: true, imagePath: true,
        categoryId: true, isActive: true, isAvailable: true, sortOrder: true,
        category: { select: { name: true } },
      },
    }),
  ])

  return {
    categories: categories.map((c) => ({
      id: c.id.toString(), name: c.name, sortOrder: c.sortOrder,
      branchId: c.branchId.toString(),
      productsCount: c._count.products,
    })),
    products: products.map((p) => ({
      id: p.id.toString(), name: p.name, description: p.description,
      price: p.price.toString(), imagePath: p.imagePath,
      categoryId: p.categoryId.toString(), categoryName: p.category.name,
      isActive: p.isActive, isAvailable: p.isAvailable, sortOrder: p.sortOrder,
    })),
  }
}

export class CatalogError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'CatalogError'
    this.status = status
  }
}
