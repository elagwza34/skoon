'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { homeForRole, resolveRoleHome } from '@/lib/route-access'
import { safeInternalRedirect } from '@/lib/auth/safe-redirect'
import { normalizeStaffUsername, staffLoginEmail } from '@/lib/staff-username'
import { prisma } from '@/lib/prisma'
import { ROLE, isOwner, requiresOperationalShift } from '@/lib/authz'
import { getOpenShift } from '@/lib/staff-shifts'

/**
 * Staff sign-in — Supabase Auth (legacy email or staff username + password).
 *
 * Authorization (role, branch, permissions) is resolved server-side from the
 * trusted `public.users` row on each request (see src/lib/session.ts); we never
 * trust JWT claims here. On success the user is bounced to `next` (validated to
 * be a safe internal path) or the dashboard. Errors are returned as a plain
 * message so the form can render them without leaking whether the email exists.
 */
const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'أدخل اسم المستخدم أو البريد الإلكتروني').max(150),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
})

export interface LoginState {
  error?: string
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get('identifier'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  }

  const identifier = parsed.data.identifier
  let email = identifier.includes('@') ? staffLoginEmail(identifier) : null
  if (!email) {
    const username = normalizeStaffUsername(identifier)
    if (username) {
      // Username is only a login alias. The password is still verified by
      // Supabase against the opaque internal Auth identity; no client metadata
      // or role information is trusted here.
      const user = await prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' }, isActive: true, deletedAt: null },
        select: { email: true },
      })
      email = user?.email ?? null
    }
    // Backward-compatible login for old username-derived internal identities.
    email ??= staffLoginEmail(identifier)
  }
  if (!email) return { error: 'اسم المستخدم أو البريد الإلكتروني أو كلمة المرور غير صحيحة' }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password })

  if (error) {
    // Do not distinguish "user not found" vs "wrong password" (anti-enumeration).
    return { error: 'اسم المستخدم أو البريد الإلكتروني أو كلمة المرور غير صحيحة' }
  }

  // Credential verification completed. Resolve employee authorization directly
  // so a missing/inactive staff row never gets mislabeled as a bad password.
  const currentUser = await supabase.auth.getUser()
  if (!currentUser.data.user) {
    await supabase.auth.signOut()
    return { error: 'تعذر التحقق من جلسة تسجيل الدخول. حاول مرة أخرى.' }
  }
  const requested = safeInternalRedirect(formData.get('next'))

  let employee: {
    isActive: boolean
    deletedAt: Date | null
    branchId: bigint | null
    role: { slug: string }
  } | null
  try {
    employee = await prisma.user.findUnique({
      where: { id: currentUser.data.user.id },
      select: { isActive: true, deletedAt: true, branchId: true, role: { select: { slug: true } } },
    })
  } catch (error) {
    // This is an infrastructure failure, not an unprovisioned account. Keep the
    // diagnostic server-side and return a distinct, non-sensitive message.
    console.error('[auth] staff authorization lookup failed', {
      code: error instanceof Error && 'code' in error ? error.code : undefined,
    })
    await supabase.auth.signOut()
    return { error: 'تعذر التحقق من صلاحيات الحساب بسبب خطأ مؤقت. حاول مرة أخرى أو راجع مدير النظام.' }
  }
  if (!employee) {
    // Preserve the original, self-closing first-owner bootstrap. It is only
    // eligible while public.users is empty; all later unassociated Auth users
    // remain denied below.
    try {
      const bootstrapSession = await getStaffSession()
      if (bootstrapSession) {
        redirect(requested ?? resolveRoleHome(bootstrapSession.role) ?? homeForRole(bootstrapSession.role))
      }
    } catch (error) {
      console.error('[auth] first-owner bootstrap lookup failed', {
        code: error instanceof Error && 'code' in error ? error.code : undefined,
      })
      await supabase.auth.signOut()
      return { error: 'تعذر التحقق من صلاحيات الحساب بسبب خطأ مؤقت. حاول مرة أخرى أو راجع مدير النظام.' }
    }
    await supabase.auth.signOut()
    return { error: 'تم التحقق من بيانات الدخول، لكن الحساب غير مرتبط بموظف في النظام. راجع مدير النظام.' }
  }
  if (!employee.isActive || employee.deletedAt) {
    await supabase.auth.signOut()
    return { error: 'الحساب غير مفعّل في النظام. راجع مدير النظام لتفعيل حسابك.' }
  }
  const canonicalHome = resolveRoleHome(employee.role.slug)
  if (!canonicalHome) {
    await supabase.auth.signOut()
    return { error: 'الحساب ليس له دور تشغيلي صالح. راجع مدير النظام.' }
  }
  if (employee.role.slug === 'cashier' && employee.branchId === null) {
    await supabase.auth.signOut()
    return { error: 'حساب الكاشير غير مرتبط بفرع. راجع مدير النظام.' }
  }

  // If the user came here to reach a specific page (the middleware set ?next),
  // honour it; the (app) layout's route guard will bounce them if it's outside
  // their role. Otherwise land them on the screen for their role (operational
  // staff go straight to their board, owner/manager to the dashboard).
  // Operational staff without an open shift are sent to /shifts first.
  let session
  try {
    session = await getStaffSession()
  } catch (error) {
    console.error('[auth] staff session resolution failed', {
      code: error instanceof Error && 'code' in error ? error.code : undefined,
    })
    await supabase.auth.signOut()
    return { error: 'تعذر تجهيز صلاحيات الحساب بسبب خطأ مؤقت. حاول مرة أخرى أو راجع مدير النظام.' }
  }
  // This is defense in depth after the explicit employee status messages above.
  if (!session) {
    await supabase.auth.signOut()
    return { error: 'تعذر تهيئة صلاحيات الحساب. راجع مدير النظام.' }
  }
  // Shift enforcement belongs to the role workspace, not to identity login.
  // This preserves one canonical home for each role and avoids role-routing
  // loops; an operational screen will direct an employee to /shifts when its
  // work actually requires an open shift.
  redirect(requested ?? canonicalHome ?? homeForRole(session.role))
}

/** Sign out and return to the login screen. */
export async function logoutAction(): Promise<void> {
  const session = await getStaffSession()
  if (session) {
    // Owner does not operate mandatory shifts and must never be blocked by staff operations
    if (isOwner(session.role) || session.branchId === null) {
      // Owner or no branch - proceed with normal logout flow below
    } else if (requiresOperationalShift(session.role)) {
      // Operational role (cashier, waiter, kitchen) - check if there's an open shift
      const branchId = BigInt(session.branchId ?? '')
      const shift = await getOpenShift(session.id, branchId)
      if (shift) {
        // Has open shift - block logout and show message via /logout-blocked
        redirect('/logout-blocked')
      }
    }
  }

  // Destroy the Supabase session cookies to fully end the browser session.
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
