import { NextResponse } from 'next/server'
import { getStaffSession } from '@/lib/session'
import { reconcileAuthIdentity, RECONCILE_SCHEMA, validateOwnerAuthority } from '@/lib/staff-reconcile'
import { canManageEmployeeLifecycle } from '@/lib/hr-authz'
import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'

/** POST /api/staff/reconcile
 *  Owner-gated reconciliation of an orphaned Auth identity.
 *
 *  BODY (JSON):
 *  {
 *    authUserId: string (UUID),   // Exact Supabase Auth UUID (from diagnosis)
 *    role: 'waiter' | 'cashier' | 'kitchen' | 'manager',  // Owner-chosen
 *    branchId: string (digits),   // Owner-chosen (null for owner)
 *    confirmOwnership: true       // Explicit confirmation, never client-inferred
 *  }
 *
 *  SECURITY — The authUserId MUST match a Supabase Auth identity that the
 *  diagnosis found unlinked. This endpoint never guesses or auto-detected; it
 *  only accepts exact UUIDs. The `confirmOwnership` flag is a separate
 *  server-enforced field (hard to spoof client-side) and is the mechanism that
 *  satisfies the "explicit identity confirmation" requirement.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const session = await getStaffSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!canManageEmployeeLifecycle(session.role)) return NextResponse.json({ error: 'Not authorised' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = RECONCILE_SCHEMA.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', auditLogged: false }, { status: 400 })
  }

  const { authUserId, role, branchId, confirmOwnership, name } = parsed.data

  const authorityError = validateOwnerAuthority(session.role, session.branchId, role, branchId)
  if (authorityError) return NextResponse.json({ error: authorityError, auditLogged: false }, { status: 403 })

  // Idempotency: if a profile row already exists, we're idempotent
  const alreadyLinked = await prisma.user.findUnique({ where: { id: authUserId } })
  if (alreadyLinked && session.role === ROLE.OWNER) {
    return NextResponse.json({
      success: false,
      message: 'هوية الدخول مرتبطة بالفعل في قاعدة البيانات',
      auditLogged: false
    }, { status: 409 })
  }

  const result = await reconcileAuthIdentity(session, { authUserId, role, branchId, confirmOwnership, name })
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'فشل إعادة المطابقة', auditLogged: result.auditLogged }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: result.userId, auditLogged: true }, { status: 200 })
}
