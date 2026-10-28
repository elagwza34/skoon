'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getStaffSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(150),
  password: z.string().min(1),
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
    return { error: 'Invalid data' }
  }

  const identifier = parsed.data.identifier
  let email = identifier.includes('@') ? identifier : null
  if (!email) {
    email = identifier
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
  redirect(requested ?? '/dashboard')
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