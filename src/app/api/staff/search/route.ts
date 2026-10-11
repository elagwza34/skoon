import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import { getStaffSession } from '@/lib/session'

/**
 * Staff global search — GET /api/staff/search?q=...
 * Branch-scoped: products + orders of the caller's branch only.
 * No auth bypass: requires a valid staff session.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''
  if (q.length < 1) return NextResponse.json({ products: [], orders: [] })
  if (q.length > 60) return NextResponse.json({ error: 'Query too long' }, { status: 400 })

  const branchScope =
    session.role === ROLE.OWNER ? {} : { branchId: BigInt(session.branchId as string) }

  const [products, orders] = await Promise.all([
    prisma.product.findMany({
      where: { ...branchScope, deletedAt: null, name: { contains: q, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 5,
      select: { id: true, name: true, price: true },
    }),
    prisma.order.findMany({
      where: {
        ...branchScope,
        OR: [
          { orderNumber: { contains: q, mode: 'insensitive' } },
          { customerName: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true, orderNumber: true, status: true,
        cafeTable: { select: { number: true } },
      },
    }),
  ])

  return NextResponse.json({
    products: products.map((p) => ({
      id: p.id.toString(), name: p.name, price: p.price.toString(),
    })),
    orders: orders.map((o) => ({
      id: o.id.toString(), number: o.orderNumber, status: o.status,
      tableNumber: o.cafeTable.number,
    })),
  })
}
