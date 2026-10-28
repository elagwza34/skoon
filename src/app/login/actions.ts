'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { normalizeStaffUsername, staffLoginEmail } from '@/lib/staff-username'
import { resolveRoleHome } from '@/lib/route-access'

/** Login schema for staff authentication. */
const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(150),
  password: z.string().min(1),
})

export interface LoginState {
  error?: string
}

/** Staff sign-in — Supabase Auth (legacy email or staff username + password). */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get('identifier'),
    password: formData.get('password'),
  })
  if (!parsed.success) {
    return { error: 'Invalid data' }
  }

  const identifier = parsed.data.identifier
  
  // Step 1: Try as email
  let email = identifier.includes('@') ? identifier : null
  
  // Step 2: If no email, try as username
  if (!email) {
    const username = normalizeStaffUsername(identifier)
    if (username) {
      // Look up the user by username to get their internal email
      const user = await prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' }, isActive: true, deletedAt: null },
        select: { email: true },
      })
      email = user?.email ?? null
    }
    // Step 2b: Username not set (null) — fall back to email lookup by local part.
    // Covers legacy users provisioned before username existed (e.g. owner abokamel
    // with email abokamel@gmail.com but no username yet).
    if (!email) {
      const userByEmailLocal = await prisma.user.findFirst({
        where: { email: { startsWith: `${identifier}@`, mode: 'insensitive' }, isActive: true, deletedAt: null },
        select: { email: true },
      })
      email = userByEmailLocal?.email ?? null
    }
  }
  
  // Step 3: Fallback - use staffLoginEmail (creates opaque internal identity)
  if (!email) {
    email = staffLoginEmail(identifier)
  }
  if (!email) return { error: 'Identifier required' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password })

  if (error) {
    return { error: 'Invalid credentials' }
  }

  const currentUser = await supabase.auth.getUser()
  if (!currentUser.data.user) {
    await supabase.auth.signOut()
    return { error: 'Session invalid' }
  }

  const requested = formData.get('next') as string | undefined
  let session
  try {
    session = await getStaffSession()
  } catch (error) {
    await supabase.auth.signOut()
    return { error: 'Session resolution failed' }
  }
  if (!session) {
    await supabase.auth.signOut()
    return { error: 'Session resolution failed' }
  }
  const home = resolveRoleHome(session.role)
  redirect(requested ?? home ?? '/login')
}

export async function logoutAction(): Promise<void> {
  const session = await getStaffSession()

  if (!session) {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }

  if (session.role === 'owner' || session.branchId === null) {
    // Owner or no branch - proceed
  } else {
    const branchId = BigInt(session.branchId ?? '')
    const shift = await prisma.$executeRaw`SELECT 1 FROM shifts WHERE branch_id = ${branchId} AND status = 'open' LIMIT 1`
    if (shift) {
      return
    }
  }

  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}