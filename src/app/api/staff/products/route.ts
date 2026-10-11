import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { createStaffProduct } from '@/lib/staff-catalog-write'
import { CatalogError } from '@/lib/staff-catalog'

/** Create product — POST /api/staff/products (owner/manager, server-priced). */
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  // Owner may target a branch via body.branchId; staff are locked to their own.
  const branchIdRaw =
    typeof (body as { branchId?: unknown })?.branchId === 'string'
      ? (body as { branchId: string }).branchId
      : undefined
  try {
    const result = await createStaffProduct(session, branchIdRaw, body)
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    if (e instanceof CatalogError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  }
}
