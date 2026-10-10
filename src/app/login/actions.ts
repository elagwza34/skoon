'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

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
  const target =
    typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')
      ? next
      : '/dashboard'
  redirect(target)
}

/** Sign out and return to the login screen. */
export async function logoutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
