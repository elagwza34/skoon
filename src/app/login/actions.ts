'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { homeForRole } from '@/lib/route-access'
import { requiresOperationalShift } from '@/lib/authz'
import { getOpenShift } from '@/lib/staff-shifts'
import { safeInternalRedirect } from '@/lib/auth/safe-redirect'
import { staffLoginEmail } from '@/lib/staff-username'

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

  const requested = safeInternalRedirect(formData.get('next'))

  // If the user came here to reach a specific page (the middleware set ?next),
  // honour it; the (app) layout's route guard will bounce them if it's outside
  // their role. Otherwise land them on the screen for their role (operational
  // staff go straight to their board, owner/manager to the dashboard).
  // Operational staff without an open shift are sent to /shifts first.
  const session = await getStaffSession()
  // Authenticated identities without an active trusted staff row fail closed.
  // Keep /login reachable so middleware does not bounce this state in a loop.
  if (!session) {
    // An archived/suspended public.users record is authoritative. Remove the
    // just-created cookie so it cannot leave stale client identity state.
    await supabase.auth.signOut()
    return { error: 'اسم المستخدم أو البريد الإلكتروني أو كلمة المرور غير صحيحة' }
  }
  // Login is identity-only. Only operational roles are routed through the
  // existing shift-opening workflow; it never writes attendance itself.
  if (requiresOperationalShift(session.role) && session.branchId) {
    const shift = await getOpenShift(session.id, BigInt(session.branchId))
    if (!shift) redirect('/shifts')
  }
  redirect(requested ?? homeForRole(session.role))
}

/** Sign out and return to the login screen. */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
