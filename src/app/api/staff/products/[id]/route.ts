import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { updateStaffProduct } from '@/lib/staff-catalog-write'
import { CatalogError } from '@/lib/staff-catalog'

/** Update product — PATCH /api/staff/products/[id] (owner/manager). */
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  try {
    const result = await updateStaffProduct(session, id, body)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof CatalogError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
