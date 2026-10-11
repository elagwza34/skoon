import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { createStaffCategory } from '@/lib/staff-category-write'
import { CatalogError } from '@/lib/staff-catalog'

/** Create category — POST /api/staff/categories (owner/manager). */
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
  const branchIdRaw =
    typeof (body as { branchId?: unknown })?.branchId === 'string'
      ? (body as { branchId: string }).branchId
      : undefined
  try {
    const result = await createStaffCategory(session, branchIdRaw, body)
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    if (e instanceof CatalogError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Create failed' }, { status: 500 })
  }
}
