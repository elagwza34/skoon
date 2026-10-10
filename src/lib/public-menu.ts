import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { TABLE_TOKEN_RE } from '@/lib/qr'

/** Token guard shared by all public table-scoped reads. */
export const tokenSchema = z.string().regex(TABLE_TOKEN_RE, 'Invalid table code')

export interface PublicTable {
  id: string
  number: string
  name: string | null
  capacity: number
  branchId: string
  branchName: string
  token: string
}

export interface PublicMenuCategory {
  id: string
  name: string
  sortOrder: number | null
}

export interface PublicMenuProduct {
  id: string
  name: string
  description: string | null
  price: string
  imagePath: string | null
  categoryId: string
}

export interface PublicMenu {
  table: PublicTable
  categories: PublicMenuCategory[]
  products: PublicMenuProduct[]
}

/**
 * Resolve a QR token to its table + branch, enforcing active/non-deleted.
 * Returns null for unknown, inactive, or deleted tables (no enumeration).
 */
export async function getTableByToken(token: string): Promise<PublicTable | null> {
  const parsed = tokenSchema.safeParse(token)
  if (!parsed.success) return null
  const row = await prisma.cafeTable.findUnique({
    where: { publicToken: parsed.data },
    select: {
      id: true,
      number: true,
      name: true,
      capacity: true,
      branchId: true,
      isActive: true,
      deletedAt: true,
      branch: { select: { name: true, isActive: true } },
    },
  })
  if (!row || !row.isActive || row.deletedAt || !row.branch.isActive) return null
  return {
    id: row.id.toString(),
    number: row.number,
    name: row.name,
    capacity: row.capacity,
    branchId: row.branchId.toString(),
    branchName: row.branch.name,
    token: parsed.data,
  }
}

/**
 * Public menu for one branch — active categories, active + available products.
 * Prices are read from the DB (never trusted from the client).
 */
export async function getPublicMenu(table: PublicTable): Promise<PublicMenu> {
  const branchId = BigInt(table.branchId)
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { branchId, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sortOrder: true },
    }),
    prisma.product.findMany({
      where: { branchId, isActive: true, deletedAt: null, isAvailable: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        imagePath: true,
        categoryId: true,
      },
    }),
  ])
  return {
    table,
    categories: categories.map((c) => ({
      id: c.id.toString(),
      name: c.name,
      sortOrder: c.sortOrder,
    })),
    products: products.map((p) => ({
      id: p.id.toString(),
      name: p.name,
      description: p.description,
      price: p.price.toString(),
      imagePath: p.imagePath,
      categoryId: p.categoryId.toString(),
    })),
  }
}
