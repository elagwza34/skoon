import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { updateStaffCategory, deleteStaffCategory } from '@/lib/staff-category-write'
import { CatalogError } from '@/lib/staff-catalog'

/** Update category — PATCH /api/staff/categories/[id] (owner/manager). */
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
    const result = await updateStaffCategory(session, id, body)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof CatalogError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

/** Delete (soft) category — DELETE /api/staff/categories/[id] (owner/manager). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const { id } = await params
  try {
    const result = await deleteStaffCategory(session, id)
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof CatalogError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
