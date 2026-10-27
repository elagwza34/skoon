'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { homeForRole } from '@/lib/route-access'
import { safeInternalRedirect } from '@/lib/auth/safe-redirect'
import { staffLoginEmail } from '@/lib/staff-username'
import { manageSingleActiveSession, deviceFingerprint, clientIp } from '@/lib/single-active-session'
import { getLogoutEligibility } from '@/lib/logout-eligibility'

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

  // A login failure must never create or mutate an application session record.
  const currentUser = await supabase.auth.getUser()
  if (currentUser.data.user) {
    const userAgent = formData.get('user-agent') as string | undefined
    const forwardedFor = formData.get('x-forwarded-for') as string | string[] | undefined
    const reqIp = formData.get('x-forwarded-for') as string | undefined
    await manageSingleActiveSession(
      currentUser.data.user.id,
      deviceFingerprint(userAgent),
      clientIp(reqIp, forwardedFor),
    )
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
  // Shift enforcement belongs to the role workspace, not to identity login.
  // This preserves one canonical home for each role and avoids role-routing
  // loops; an operational screen will direct an employee to /shifts when its
  // work actually requires an open shift.
  redirect(requested ?? homeForRole(session.role))
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
