import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ROLE, isKnownRole, type RoleSlug } from '@/lib/authz'
import { staffCanAccessBranch, type StaffSession } from '@/lib/session'
import { canManageEmployeeLifecycle, canResetEmployeePassword } from '@/lib/hr-authz'
import { employeeDeactivationBlocker } from '@/lib/hr-authz'
import { normalizeStaffUsername, staffIdentityEmail, staffUsernameEmail } from '@/lib/staff-username'

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
 *   - employee creation, official assignment and activation require the Owner
 *   - password resets are a separate, narrowly scoped action
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
  // Legacy email invites remain supported for existing Owner workflows. New
  // employee accounts use `username` and never send an invitation email.
  email: z.string().trim().email('بريد إلكتروني غير صالح').max(150).optional(),
  username: z.string().trim().min(3, 'اسم المستخدم قصير جداً').max(32).optional(),
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(100),
  role: z.string().trim().refine(isKnownRole, 'دور غير معروف'),
  branchId: z.string().regex(/^\d+$/, 'فرع غير صالح').optional(),
  accountMode: z.enum(['invite', 'password']).default('invite'),
  phone: z.string().trim().max(20).optional(),
  personalEmail: z.string().trim().email('البريد الشخصي غير صالح').max(150).optional(),
  personalPhone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  emergencyContactName: z.string().trim().max(150).optional(),
  emergencyContactPhone: z.string().trim().max(30).optional(),
  employmentType: z.string().trim().max(30).optional(),
  hireDate: z.coerce.date().optional(),
  probationStart: z.coerce.date().optional(),
  probationEnd: z.coerce.date().optional(),
  permanentPassword: z.string().min(12, 'كلمة المرور يجب أن تكون 12 حرفاً على الأقل').max(72).optional(),
}).superRefine((value, ctx) => {
  const username = value.username ? normalizeStaffUsername(value.username) : null
  if (value.username && !username) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['username'], message: 'اسم المستخدم يجب أن يحتوي أحرفاً إنجليزية صغيرة أو أرقاماً أو . _ - فقط' })
  }
  if (!value.email && !username) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['username'], message: 'أدخل اسم مستخدم أو بريداً إلكترونياً' })
  }
  if ((value.accountMode === 'password' || username) && !value.permanentPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['permanentPassword'], message: 'أدخل كلمة المرور الدائمة' })
  }
  if ((value.probationStart && !value.probationEnd) || (!value.probationStart && value.probationEnd)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probationEnd'], message: 'فترة التجربة تحتاج تاريخ بداية ونهاية' })
  }
  if (value.probationStart && value.probationEnd && value.probationEnd < value.probationStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probationEnd'], message: 'نهاية فترة التجربة يجب أن تكون بعد بدايتها' })
  }
})

function asDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

const updateSchema = z.object({
  role: z.string().trim().refine(isKnownRole, 'دور غير معروف').optional(),
  branchId: z.string().regex(/^\d+$/, 'فرع غير صالح').nullable().optional(),
  isActive: z.boolean().optional(),
})

const resetPasswordSchema = z.object({
  password: z.string().min(12, 'Password must be at least 12 characters').max(72),
})

export interface ProvisionedStaff {
  id: string
  name: string
  email: string | null
  username: string | null
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

/** Invite a staff member: Supabase Auth invitation + trusted profile row. *
 * @param _supabase Test-only injected Supabase admin client (production uses adminClient()). */
export async function inviteStaff(
  session: StaffSession,
  input: unknown,
  _supabase?: any,
  _identityToken?: string,
): Promise<ProvisionedStaff> {
  if (!canManageEmployeeLifecycle(session.role))
    throw new StaffProvisionError('غير مصرح', 403)

  const parsed = inviteSchema.safeParse(input)
  if (!parsed.success) throw new StaffProvisionError(parsed.error.issues[0]?.message ?? 'بيانات غير صالحة', 400)
  const { name, accountMode, permanentPassword } = parsed.data
  const username = parsed.data.username ? normalizeStaffUsername(parsed.data.username) : null
  // Auth requires an email/password identity. For username accounts this is an
  // opaque immutable address, not a transformation of a mutable username.
  const email = username ? staffIdentityEmail(_identityToken ?? randomUUID()) : parsed.data.email!
  const roleSlug = parsed.data.role as RoleSlug

  const assignment = await resolveAssignment(session, roleSlug, parsed.data.branchId)

  const existing = await prisma.user.findFirst({
    where: username
      ? { OR: [{ username: { equals: username, mode: 'insensitive' } }, { email: staffUsernameEmail(username) }] }
      : { email },
    select: { id: true, deletedAt: true, isActive: true },
  })
  if (existing) {
    if (existing.deletedAt) {
      throw new StaffProvisionError('هذا الحساب موجود مسبقاً وموقوف. راجع مدير النظام لإعادة التفعيل.', 409)
    }
    throw new StaffProvisionError('يوجد حساب مسجل بهذا البريد بالفعل', 409)
  }

  // Username uniqueness — case-insensitive check before Auth provisioning.
  // This prevents two employees from having the same username (only the
  // case differs), which would break login resolution.
  if (username) {
    const duplicateUsername = await prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    })
    if (duplicateUsername) {
      throw new StaffProvisionError('اسم المستخدم مستخدم بالفعل', 409)
    }
  }

  const supabase = _supabase ?? adminClient()
  const directPasswordAccount = Boolean(username) || accountMode === 'password'

  // Pre-check: does an Auth identity already exist with this email?
  // This prevents creating a duplicate Auth identity when re-provisioning
  // after a partial failure left an orphaned Auth user without a public.users row.
  // Only the Owner-controlled provisioning flow may adopt an existing identity;
  // login never does this.
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const existingAuth = listed?.users.find((user: { email?: string | null | undefined }) => user.email?.toLowerCase() === email.toLowerCase())

  let authUser: { id: string; email?: string | null | undefined } | null = null
  if (existingAuth) {
    // Auth identity already exists — verify it is not already linked to a profile.
    const linkedUser = await prisma.user.findUnique({ where: { id: existingAuth.id }, select: { id: true } })
    if (linkedUser) {
      throw new StaffProvisionError('يوجد حساب موظف موجود بهذه الهوية بالفعل', 409)
    }
    // SECURITY — Automatic adoption of unlinked Auth identities is DISABLED.
    // Matching by email alone does not establish that the identity belongs to the
    // intended employee. This orphaned identity must go through an explicit,
    // separately-authorized reconciliation workflow (see
    // docs/SKOON_ACCOUNT_RECONCILIATION_PLAN.md) with per-identity Owner approval
    // before any profile row is created. Do NOT auto-link unverified identities.
    throw new StaffProvisionError('هوية الدخول غير مرتبطة — يرجى إجراء الموافقة الضمنية لإعادة المطابقة', 409)
  } else if (!listError) {
    // No existing Auth identity — create a new one.
    const { data, error } = !directPasswordAccount
      ? await supabase.auth.admin.inviteUserByEmail(email, { data: { full_name: name } })
      : await supabase.auth.admin.createUser({
        email,
        password: permanentPassword as string,
        email_confirm: true,
        user_metadata: { full_name: name },
      })

    if (error || !data?.user) {
      // Never return an Auth provider error: it may expose account state or
      // provider internals. The authenticated Owner gets a deterministic result.
      throw new StaffProvisionError(username ? 'اسم المستخدم مستخدم بالفعل أو تعذر إنشاء الحساب' : 'تعذر إنشاء الحساب', 409)
    }
    authUser = data.user
  } else {
    throw new StaffProvisionError('تعذر التحقق من حسابات الدخول الحالية', 502)
  }

  if (!authUser) throw new StaffProvisionError('تعذر إنشاء الحساب', 502)

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: authUser.id,
          name,
          email,
          username,
          roleId: assignment.roleId,
          branchId: assignment.branchId,
          isActive: true,
          ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
        },
        select: { id: true, name: true, email: true, branchId: true },
      })

      await tx.employeeProfile.create({
        data: {
          userId: user.id,
          branchId: assignment.branchId,
          employmentType: parsed.data.employmentType || null,
          hireDate: asDateOnly(parsed.data.hireDate ?? new Date()),
          personalEmail: parsed.data.personalEmail || null,
          personalPhone: parsed.data.personalPhone || null,
          address: parsed.data.address || null,
          emergencyContactName: parsed.data.emergencyContactName || null,
          emergencyContactPhone: parsed.data.emergencyContactPhone || null,
          probationStart: parsed.data.probationStart ? asDateOnly(parsed.data.probationStart) : null,
          probationEnd: parsed.data.probationEnd ? asDateOnly(parsed.data.probationEnd) : null,
          probationStatus: parsed.data.probationStart ? 'active' : null,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: session.id,
          branchId: assignment.branchId,
          action: directPasswordAccount ? 'staff.create_with_password' : 'staff.invite',
          entityType: 'user',
          newValues: { userId: user.id, ...(username ? { username } : { email }), role: roleSlug, accountMode: directPasswordAccount ? 'password' : 'invite', employeeProfileCreated: true },
        },
      })
      return user
    })

    return {
      id: created.id,
      name: created.name,
      email: username ? null : created.email,
      username,
      role: roleSlug,
      branchId: created.branchId?.toString() ?? null,
    }
  } catch {
    // Fail safe: roll the auth identity back ONLY if no profile row survived.
    // If the profile was created but a later step (audit) failed, deleting the
    // auth user would orphan the profile and wedge the email for future invites.
    const row = await prisma.user
      .findUnique({ where: { id: authUser.id }, select: { id: true } })
      .catch(() => null)
    // Never delete an identity that existed before this Owner action. Doing so
    // could revoke an unrelated, legitimate legacy account.
    if (!row) {
      const deleteError = await supabase.auth.admin.deleteUser(authUser.id).catch((e: unknown) => e)
      if (deleteError) {
        // Rollback failed — do not claim the invitation was rolled back.
        // The Auth identity may remain orphaned; the Owner should retry, which
        // will adopt the existing identity via the pre-check above.
        throw new StaffProvisionError('تعذر إنشاء الحساب وفشل التراجع عن حساب الدخول. راجع مدير النظام.', 500)
      }
    }
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
  if (!canManageEmployeeLifecycle(session.role))
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
    if (isActive === false && target.isActive) {
      const [activeOwnerCount, openShift] = await Promise.all([
        targetRole === ROLE.OWNER
          ? tx.user.count({ where: { isActive: true, deletedAt: null, role: { is: { slug: ROLE.OWNER } } } })
          : Promise.resolve(0),
        tx.shift.findFirst({ where: { cashierId: target.id, status: 'open' }, select: { id: true } }),
      ])
      const blocker = employeeDeactivationBlocker({
        actorId: session.id, targetId: target.id, targetRole,
        activeOwnerCount, hasOpenShift: Boolean(openShift),
      })
      if (blocker === 'SELF') throw new StaffProvisionError('Cannot deactivate your own account', 409)
      if (blocker === 'LAST_OWNER') throw new StaffProvisionError('The last active Owner cannot be deactivated', 409)
      if (blocker === 'OPEN_SHIFT') throw new StaffProvisionError('Settle or hand over the open shift before deactivation', 409)
    }
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

/**
 * Passwords are accepted only for the one-time reset request, passed directly
 * to Supabase Auth, and never selected, stored, or returned by Skoon.
 */
export async function resetStaffPassword(session: StaffSession, targetId: string, input: unknown): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) throw new StaffProvisionError(parsed.error.issues[0]?.message ?? 'Invalid request', 400)

  const target = await prisma.user.findFirst({
    where: { id: targetId, isActive: true, deletedAt: null },
    select: { id: true, branchId: true, role: { select: { slug: true } } },
  })
  if (!target) throw new StaffProvisionError('Employee not found', 404)
  if (!canResetEmployeePassword(session, { role: target.role.slug as RoleSlug, branchId: target.branchId })) {
    throw new StaffProvisionError('Not authorized to reset this employee password', 403)
  }

  const { error } = await adminClient().auth.admin.updateUserById(target.id, { password: parsed.data.password })
  if (error) throw new StaffProvisionError('Password reset failed', 502)

  await prisma.auditLog.create({
    data: {
      userId: session.id,
      branchId: target.branchId,
      action: 'staff.password_reset',
      entityType: 'user',
      newValues: { userId: target.id },
    },
  })
}
