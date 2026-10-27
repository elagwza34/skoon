'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { homeForRole, resolveRoleHome } from '@/lib/route-access'
import { safeInternalRedirect } from '@/lib/auth/safe-redirect'
import { staffLoginEmail } from '@/lib/staff-username'
import { getLogoutEligibility } from '@/lib/logout-eligibility'
import { prisma } from '@/lib/prisma'

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

  const email = staffLoginEmail(parsed.data.identifier)
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

  const employee = await prisma.user.findUnique({
    where: { id: currentUser.data.user.id },
    select: { isActive: true, deletedAt: true, branchId: true, role: { select: { slug: true } } },
  })
  if (!employee) {
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

  const requested = safeInternalRedirect(formData.get('next'))

  // If the user came here to reach a specific page (the middleware set ?next),
  // honour it; the (app) layout's route guard will bounce them if it's outside
  // their role. Otherwise land them on the screen for their role (operational
  // staff go straight to their board, owner/manager to the dashboard).
  // Operational staff without an open shift are sent to /shifts first.
  const session = await getStaffSession()
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
    const eligibility = await getLogoutEligibility(session)
    if (!eligibility.allowed) redirect('/logout-blocked')
  }

  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
