import { NextResponse } from 'next/server'
import { getPublicOrder } from '@/lib/public-orders'

/**
 * Public order tracking — GET /api/public/orders/[id]?n=<orderNumber>.
 *
 * Guarded by BOTH id and orderNumber (same rule as the confirmation page) so the
 * sequential integer id alone can't be enumerated to peek at other customers.
 * Returns only the display-safe status fields for polling. No auth.
 */
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const n = new URL(req.url).searchParams.get('n')
  if (!n) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const order = await getPublicOrder(id, n)
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(
      { id: order.id, orderNumber: order.orderNumber, status: order.status, total: order.total },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 })
  }
}
