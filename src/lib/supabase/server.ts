/**
 * Server-side Supabase client for the Next.js App Router.
 *
 * Uses @supabase/ssr to read/write the auth session through cookies, so the
 * server can act on behalf of the signed-in user while still respecting Row
 * Level Security (anon key only). Privileged operations that must bypass RLS
 * should use a separate service-role client created explicitly and only from
 * trusted server code — never exposed to the browser.
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPublicEnv } from '@/lib/env'

export async function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv()
  const cookieStore = await cookies()

  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // `setAll` is called from a Server Component where cookie mutation is
          // not allowed. This is safe to ignore when middleware refreshes sessions.
        }
      },
    },
  })
}
