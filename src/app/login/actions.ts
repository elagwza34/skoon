'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { homeForRole } from '@/lib/route-access'
import { requiresOperationalShift } from '@/lib/authz'
import { getOpenShift } from '@/lib/staff-shifts'

/**
 * Staff sign-in — Supabase Auth (email + password). Identity only.
 *
 * Authorization (role, branch, permissions) is resolved server-side from the
 * trusted `public.users` row on each request (see src/lib/session.ts); we never
 * trust JWT claims here. On success the user is bounced to `next` (validated to
 * be a safe internal path) or the dashboard. Errors are returned as a plain
 * message so the form can render them without leaking whether the email exists.
 */
const loginSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
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
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'بيانات غير صالحة' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) {
    // Do not distinguish "user not found" vs "wrong password" (anti-enumeration).
    return { error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }
  }

  const next = formData.get('next')
  const requested =
    typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
      ? next
      : null

  // If the user came here to reach a specific page (the middleware set ?next),
  // honour it; the (app) layout's route guard will bounce them if it's outside
  // their role. Otherwise land them on the screen for their role (operational
  // staff go straight to their board, owner/manager to the dashboard).
  // Operational staff without an open shift are sent to /shifts first.
  if (!requested) {
    const session = await getStaffSession()
    if (!session) redirect('/dashboard')
    // Login is identity-only. Only operational roles are routed through the
    // existing shift-opening workflow; it never writes attendance itself.
    if (requiresOperationalShift(session.role) && session.branchId) {
      const shift = await getOpenShift(session.id, BigInt(session.branchId))
      if (!shift) redirect('/shifts')
    }
    redirect(homeForRole(session.role))
  }
  redirect(requested)
}

/** Sign out and return to the login screen. */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
