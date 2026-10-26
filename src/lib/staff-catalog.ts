import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import type { StaffSession } from '@/lib/session'
import { Prisma } from '@prisma/client'

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
  branchId: string
  name: string
  description: string | null
  price: string
  imagePath: string | null
  categoryId: string
  categoryName: string
  isActive: boolean
  isAvailable: boolean
  taxRate: string
  inventoryItemId: string | null
  sortOrder: number | null
  // ---- Product Variants extension ----
  isVariable: boolean
  variantCount: number
  variantIds: string[]
}

export interface StaffCatalog {
  categories: CatalogCategory[]
  products: CatalogProduct[]
  inventoryItems: { id: string; branchId: string; name: string }[]
}

export async function getStaffCatalog(session: StaffSession): Promise<StaffCatalog> {
  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [categories, products, inventoryItems] = await Promise.all([
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
        id: true, branchId: true, name: true, description: true, price: true, imagePath: true,
        categoryId: true, isActive: true, isAvailable: true, taxRate: true, inventoryItemId: true, sortOrder: true,
        category: { select: { name: true } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: { ...branchScope, isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
      take: 500,
      select: { id: true, branchId: true, name: true },
    }),
  ])

  // Variant aggregation: product_id -> { count, ids[] }
  const productIds = products.map((p) => p.id)
  const variantAgg = new Map<string, { count: number; ids: string[] }>()
  // Product Variants is an additive deployment. A legacy database that has not
  // received that migration must continue to serve its simple-product catalog;
  // only the known missing-table condition is tolerated here.
  let variantRows: Array<{ productId: bigint; id: bigint }> = []
  if (productIds.length > 0) {
    try {
      variantRows = await prisma.productVariant.findMany({
        where: { productId: { in: productIds } },
        select: { productId: true, id: true },
      })
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2021') {
        throw error
      }
    }
  }
  for (const p of products) {
    variantAgg.set(p.id.toString(), { count: 0, ids: [] })
  }
  for (const v of variantRows) {
    const entry = variantAgg.get(v.productId.toString())
    if (entry) {
      entry.count += 1
      entry.ids.push(v.id.toString())
    }
  }

  return {
    categories: categories.map((c) => ({
      id: c.id.toString(), name: c.name, sortOrder: c.sortOrder,
      branchId: c.branchId.toString(),
      productsCount: c._count.products,
    })),
    products: products.map((p) => {
      const agg = variantAgg.get(p.id.toString()) ?? { count: 0, ids: [] }
      return {
        id: p.id.toString(), branchId: p.branchId.toString(), name: p.name, description: p.description,
        price: p.price.toString(), imagePath: p.imagePath,
        categoryId: p.categoryId.toString(), categoryName: p.category.name,
        isActive: p.isActive, isAvailable: p.isAvailable, taxRate: p.taxRate.toString(),
        inventoryItemId: p.inventoryItemId?.toString() ?? null, sortOrder: p.sortOrder,
        isVariable: agg.count > 0,
        variantCount: agg.count,
        variantIds: agg.ids,
      }
    }),
    inventoryItems: inventoryItems.map((item) => ({ id: item.id.toString(), branchId: item.branchId.toString(), name: item.name })),
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
