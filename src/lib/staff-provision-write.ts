import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { ROLE, isKnownRole, type RoleSlug } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'

/**
 * Staff provisioning — server-only, trusted path (docs/OWNER-PROVISIONING.md).
 *
 * INVITE: Supabase Auth creates the identity (invitation email; the user sets
 * their own password). We then create the `public.users` profile row bound to
 * that auth id with the assigned role/branch. The client can NEVER create users
 * or choose its own role: this module is only reachable through an authenticated
 * owner/manager API route; role/branch come from validated server input.
 *
 * PRIVILEGE RULES (enforced here, not in the UI):
 *   - assigning the owner role requires the caller to BE the owner
 *   - a manager may only touch users of their own branch, never an owner
 *   - owner accounts always have branchId = NULL (cross-branch)
 *   - a user cannot deactivate their own account (lockout guard)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (server-only).
 * Fails closed with a clear Arabic message when they are missing.
 */

export class StaffProvisionError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = 'StaffProvisionError'
    this.status = status
  }
}

const inviteSchema = z.object({
  email: z.string().trim().email('بريد إلكتروني غير صالح').max(150),
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(100),
  role: z.string().trim().refine(isKnownRole, 'دور غير معروف'),
  branchId: z.string().regex(/^\d+$/, 'فرع غير صالح').optional(),
})

const updateSchema = z.object({
  role: z.string().trim().refine(isKnownRole, 'دور غير معروف').optional(),
  branchId: z.string().regex(/^\d+$/, 'فرع غير صالح').nullable().optional(),
  isActive: z.boolean().optional(),
})

export interface ProvisionedStaff {
  id: string
  name: string
  email: string
  role: RoleSlug
  branchId: string | null
}

/** Admin client using the service-role key — server-only, bypasses RLS. */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new StaffProvisionError(
      'الدعوة غير متاحة: متغيرات الخادم الخاصة بالمصادقة غير مضبوطة (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)',
      503,
    )
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Validate + resolve the target role/branch under the caller's authority. */
async function resolveAssignment(
  session: StaffSession,
  roleSlug: RoleSlug,
  branchIdRaw: string | undefined | null,
): Promise<{ roleId: bigint; branchId: bigint | null }> {
  // Owner role is owner-only to assign, and is always cross-branch.
  if (roleSlug === ROLE.OWNER) {
    if (session.role !== ROLE.OWNER) throw new StaffProvisionError('منح دور المالك متاح للمالك فقط', 403)
    const ownerRole = await prisma.role.findUnique({ where: { slug: ROLE.OWNER }, select: { id: true } })
    if (!ownerRole) throw new StaffProvisionError('دور المالك غير موجود في قاعدة البيانات', 500)
    return { roleId: ownerRole.id, branchId: null }
  }

  const role = await prisma.role.findUnique({ where: { slug: roleSlug }, select: { id: true } })
  if (!role) throw new StaffProvisionError('الدور غير موجود في قاعدة البيانات', 500)

  let branchId: bigint
  if (session.role === ROLE.OWNER) {
    if (!branchIdRaw) throw new StaffProvisionError('اختر الفرع', 400)
    branchId = BigInt(branchIdRaw)
  } else {
    if (!session.branchId) throw new StaffProvisionError('حسابك غير مرتبط بفرع', 400)
    branchId = BigInt(session.branchId)
    if (branchIdRaw && !staffCanAccessBranch(session, branchIdRaw))
      throw new StaffProvisionError('غير مصرح بهذا الفرع', 403)
  }

  const branch = await prisma.cafeBranch.findFirst({
    where: { id: branchId, isActive: true },
    select: { id: true },
  })
  if (!branch) throw new StaffProvisionError('الفرع غير موجود', 404)
  return { roleId: role.id, branchId }
}

/** Invite a staff member: Supabase Auth invitation + trusted profile row. */
export async function inviteStaff(session: StaffSession, input: unknown): Promise<ProvisionedStaff> {
  if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER)
    throw new StaffProvisionError('غير مصرح', 403)

  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) throw new StaffProvisionError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { email, name } = parsed.data
  const roleSlug = parsed.data.role as RoleSlug

  const assignment = await resolveAssignment(session, roleSlug, parsed.data.branchId)

  const existing = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true },
  })
  if (existing) throw new StaffProvisionError('يوجد حساب مسجل بهذا البريد بالفعل', 409)

  const supabase = adminClient()
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name },
  })
  if (error || !data.user) {
    throw new StaffProvisionError(`تعذر إرسال الدعوة: ${error?.message ?? 'غير معروف'}`, 502)
  }

  try {
    const created = await prisma.user.create({
      data: {
        id: data.user.id,
        name,
        email,
        roleId: assignment.roleId,
        branchId: assignment.branchId,
        isActive: true,
      },
      select: { id: true, name: true, email: true, branchId: true },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.id,
        branchId: assignment.branchId,
        action: 'staff.invite',
        entityType: 'user',
        newValues: { userId: created.id, email, role: roleSlug },
      },
    })

    return {
      id: created.id,
      name: created.name,
      email: created.email as string,
      role: roleSlug,
      branchId: created.branchId?.toString() ?? null,
    }
  } catch {
    // Fail safe: roll the auth identity back ONLY if no profile row survived.
    // If the profile was created but a later step (audit) failed, deleting the
    // auth user would orphan the profile and wedge the email for future invites.
    const row = await prisma.user
      .findUnique({ where: { id: data.user.id }, select: { id: true } })
      .catch(() => null)
    if (!row) await supabase.auth.admin.deleteUser(data.user.id).catch(() => undefined)
    throw new StaffProvisionError('تعذر إنشاء الحساب — تم التراجع عن الدعوة', 500)
  }
}

export interface UpdatedStaff {
  id: string
  role: RoleSlug
  branchId: string | null
  isActive: boolean
}

/**
 * Update an existing staff member's role / branch / activation.
 * Auth identity (email, password) is untouched — that stays with Supabase Auth.
 */
export async function updateStaff(
  session: StaffSession,
  targetId: string,
  input: unknown,
): Promise<UpdatedStaff> {
  if (session.role !== ROLE.OWNER && session.role !== ROLE.MANAGER)
    throw new StaffProvisionError('غير مصرح', 403)

  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) throw new StaffProvisionError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { role, branchId, isActive } = parsed.data
  if (role === undefined && branchId === undefined && isActive === undefined)
    throw new StaffProvisionError('لا توجد تعديلات', 400)

  const target = await prisma.user.findFirst({
    where: { id: targetId, deletedAt: null },
    select: {
      id: true, branchId: true, isActive: true,
      role: { select: { slug: true } },
    },
  })
  if (!target) throw new StaffProvisionError('الموظف غير موجود', 404)

  const targetRole = target.role.slug as RoleSlug

  // A manager may only touch users inside their own branch — never an owner.
  if (session.role !== ROLE.OWNER) {
    if (targetRole === ROLE.OWNER) throw new StaffProvisionError('لا يمكن تعديل حساب المالك', 403)
    if (!target.branchId || !staffCanAccessBranch(session, target.branchId))
      throw new StaffProvisionError('غير مصرح بهذا الموظف', 403)
  }

  // Lockout guard: never let anyone deactivate themselves.
  if (isActive === false && target.id === session.id)
    throw new StaffProvisionError('لا يمكنك إيقاف حسابك الخاص', 400)

  // Resolve the resulting assignment (role and/or branch may change).
  const nextRoleSlug = (role ?? targetRole) as RoleSlug
  const nextBranchRaw =
    branchId !== undefined
      ? branchId === null
        ? undefined // keep current unless owner role forces null below
        : branchId
      : undefined
  const assignment =
    role !== undefined || (branchId !== undefined && branchId !== null)
      ? await resolveAssignment(session, nextRoleSlug, nextBranchRaw ?? (target.branchId?.toString() ?? undefined))
      : null

  // Owner semantics: an owner row always keeps branchId = NULL.
  const finalRoleSlug = nextRoleSlug
  const finalBranchId =
    finalRoleSlug === ROLE.OWNER ? null : assignment ? assignment.branchId : target.branchId

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: target.id },
      data: {
        ...(assignment ? { roleId: assignment.roleId } : {}),
        branchId: finalBranchId,
        ...(isActive !== undefined ? { isActive } : {}),
      },
      select: { id: true, branchId: true, isActive: true, role: { select: { slug: true } } },
    })

    await tx.auditLog.create({
      data: {
        userId: session.id,
        branchId: row.branchId,
        action: 'staff.update',
        entityType: 'user',
        newValues: {
          userId: row.id,
          ...(role !== undefined ? { role } : {}),
          ...(branchId !== undefined ? { branchId: branchId ?? null } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      },
    })
    return row
  })

  return {
    id: updated.id,
    role: updated.role.slug as RoleSlug,
    branchId: updated.branchId?.toString() ?? null,
    isActive: updated.isActive,
  }
}
