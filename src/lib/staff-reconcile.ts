import { prisma } from '@/lib/prisma'
import { ROLE } from '@/lib/authz'
import { canManageEmployeeLifecycle } from '@/lib/hr-authz'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

/** Reconciliation — the controlled, Owner-gated path for linking an existing
 *  Supabase Auth identity to a public.users profile row when the identity
 *  was orphaned (inviteStaff() rejects automatic adoption to prevent
 *  impersonation). No Auth identity is deleted; the profile row is created
 *  with an explicit per-identity Owner confirmation.
 *
 *  SECURITY — the `confirmOwnership` flag is a separate, server-enforced
 *  field (never client-inferred). It can only be set true with a valid Owner
 *  session and a valid role/branch assignment.
 */

export const RECONCILE_SCHEMA = z.object({
  /** Exact Supabase Auth UUID of the orphaned identity. */
  authUserId: z.string().uuid('معرف حساب الدخول غير صالح'),
  /** Owner-selected role (never infer from email). */
  role: z.string().trim().refine((v) => {
    const known = ['manager', 'cashier', 'waiter', 'kitchen']
    return known.includes(v.toLowerCase())
  }, 'دور غير معروف'),
  /** Owner-entered display name. Authorization never derives from Auth metadata. */
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(100),
  /** Owner-selected branch id. For owner role, must be null. */
  branchId: z.string().regex(/^\d+$/, 'فرع غير صالح').or(z.literal('null')).or(z.literal('')).optional(),
  /** Explicit Owner confirmation that they are authorizing this specific identity. */
  confirmOwnership: z.boolean().refine((v) => v === true, 'يجب الموافقة الضمنية على هذه الرسالة'),
})

export const RECONCILE_PARTIAL_SCHEMA = z.object({
  idempotencyKey: z.string().uuid('مفتاح المعاملة غير صالح'),
  authUserId: z.string().uuid('معرف حساب الدخول غير صالح'),
  role: z.string().trim().refine((v) => {
    const known = ['owner', 'manager', 'cashier', 'waiter', 'kitchen']
    return known.includes(v.toLowerCase())
  }, 'دور غير معروف'),
  branchId: z.string().regex(/^\d+$/, 'فرع غير صالح').or(z.literal('null')).or(z.literal('')).optional(),
  confirmOwnership: z.boolean().refine((v) => v === true, 'يجب الموافقة الضمنية على هذه الرسالة'),
})

export interface ReconcileResult {
  success: boolean
  userId: string | null
  error?: string
  auditLogged: boolean
}

type AuthAdmin = {
  auth: { admin: { getUserById(id: string): Promise<{ data: { user: { id: string; email?: string | null } | null }; error: unknown }> } }
}

function authAdminClient(): AuthAdmin {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing server-side Supabase configuration')
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as AuthAdmin
}

function normalizeBranchId(raw: string | undefined | null): bigint | null {
  if (!raw) return null
  return BigInt(raw)
}

function parseBranch(raw: string | undefined | null): string | null {
  if (!raw) return null
  if (raw === 'null' || raw === '') return null
  return raw
}

export function validateOwnerAuthority(
  sessionRole: string | null,
  sessionBranchId: string | null,
  role: string,
  branchRaw: string | undefined | null,
): string | null {
  if (sessionRole !== ROLE.OWNER) return 'تسجيل الدخول غير مصرح به لإعادة المطابقة'
  const targetRole = role.toLowerCase()
  if (targetRole === ROLE.OWNER) return 'لا يمكن ربط الهوية بدور المالك'
  const targetBranch = normalizeBranchId(parseBranch(branchRaw))
  if (targetRole === ROLE.OWNER) return 'دور المالك دائمًا صفر الفرع'
  return null
}

export async function reconcileAuthIdentity(
  session: { id: string; role: string; branchId: string | null },
  input: z.infer<typeof RECONCILE_SCHEMA>,
  admin: AuthAdmin = authAdminClient(),
): Promise<ReconcileResult> {
  if (!canManageEmployeeLifecycle(session.role)) {
    return { success: false, userId: null, error: 'تسجيل الدخول غير مصرح به', auditLogged: false }
  }

  const existing = await prisma.user.findUnique({ where: { id: input.authUserId }, select: { id: true } })
  if (existing) {
    return { success: false, userId: existing.id, error: 'هوية الدخول موجودة بالفعل في قاعدة البيانات', auditLogged: false }
  }

  const authorityError = validateOwnerAuthority(session.role, session.branchId, input.role, input.branchId)
  if (authorityError) return { success: false, userId: null, error: authorityError, auditLogged: false }

  const { data: authData, error: authError } = await admin.auth.admin.getUserById(input.authUserId)
  if (authError || !authData.user || authData.user.id !== input.authUserId) {
    return { success: false, userId: null, error: 'تعذر التحقق من هوية الدخول المطلوبة', auditLogged: false }
  }

  const role = await prisma.role.findUnique({ where: { slug: input.role }, select: { id: true } })
  if (!role) return { success: false, userId: null, error: 'الدور المحدد غير موجود في قاعدة البيانات', auditLogged: false }

  let targetBranchId: bigint | null = null
  if (input.role !== ROLE.OWNER) {
    if (!parseBranch(input.branchId)) {
      return { success: false, userId: null, error: 'اختر فرعًا للدور المحدد', auditLogged: false }
    }
    targetBranchId = normalizeBranchId(parseBranch(input.branchId))
    if (isNaN(Number(targetBranchId))) return { success: false, userId: null, error: 'فرع غير صالح', auditLogged: false }
    if (targetBranchId === null) return { success: false, userId: null, error: 'فرع غير صالح', auditLogged: false }
    const branch = await prisma.cafeBranch.findFirst({ where: { id: targetBranchId, isActive: true }, select: { id: true } })
    if (!branch) return { success: false, userId: null, error: 'الفرع المحدد غير موجود أو غير نشط', auditLogged: false }
  }

  try {
    const authEmail = authData.user.email?.trim().toLowerCase() || null
    if (authEmail) {
      const emailLinkedElsewhere = await prisma.user.findFirst({ where: { email: authEmail }, select: { id: true } })
      if (emailLinkedElsewhere) {
        return { success: false, userId: null, error: 'يوجد حساب موظف مرتبط بالبريد المسجل بالفعل', auditLogged: false }
      }
    }
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: input.authUserId,
          name: input.name,
          email: authEmail,
          roleId: role.id,
          branchId: targetBranchId,
          isActive: true,
        },
        select: { id: true },
      })
      await tx.employeeProfile.create({
        data: { userId: user.id, branchId: targetBranchId, hireDate: new Date() },
      })
      await tx.auditLog.create({
        data: {
          userId: session.id,
          branchId: targetBranchId,
          action: 'staff.reconcile',
          entityType: 'user',
          newValues: {
            authUserId: input.authUserId,
            role: input.role,
            branchId: targetBranchId?.toString(),
          },
        },
      })
      return user
    })
    return { success: true, userId: created.id, error: undefined, auditLogged: true }
  } catch {
    return { success: false, userId: null, error: 'تعذر إنشاء ربط الحساب. لم يتم إجراء أي تغيير.', auditLogged: false }
  }
}

export function mapReconcileError(e: unknown): string {
  if (e instanceof Error) return e.message
  return 'حدث خطأ غير متوقع'
}
