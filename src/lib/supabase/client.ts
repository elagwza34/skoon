/**
 * Browser Supabase client.
 *
 * Uses ONLY the public URL + anon (publishable) key. Runs in the browser and
 * is subject to Row Level Security — it can never bypass RLS and must never
 * be given the service-role key.
 */
'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getPublicEnv } from '@/lib/env'

export function createClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv()
  return createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
