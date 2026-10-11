import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { toggleProductAvailability } from '@/lib/staff-catalog-write'
import { CatalogError } from '@/lib/staff-catalog'

/** Toggle product availability — POST /api/staff/products/[id]/toggle. */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  try {
    const result = await toggleProductAvailability(session, id)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof CatalogError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
