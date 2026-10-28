import { NextResponse } from 'next/server'
import { bootstrapInitialBranch, BranchBootstrapError } from '@/lib/branch-bootstrap'
import { getStaffSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** One-time owner-only initialization for an installation that has no branches. */
export async function POST(request: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const branch = await bootstrapInitialBranch(session, body)
    return NextResponse.json({ branch }, { status: 201 })
  } catch (error) {
    if (error instanceof BranchBootstrapError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: 'تعذر إنشاء الفرع الأول.' }, { status: 500 })
  }
}
