/**
 * Environment variable validation — SERVER-ONLY secrets.
 *
 * Import this module ONLY from server code (Route Handlers, Server Actions,
 * server components, scripts). It holds privileged secrets that must never
 * reach the browser bundle. The `.server.ts` suffix marks it server-only by
 * convention; never import it from a `'use client'` module or client bundle.
 */
import { z } from 'zod'

const serverEnvSchema = z.object({
  // Service-role key bypasses Row Level Security. Server-only, never NEXT_PUBLIC_*.
  SUPABASE_SERVICE_ROLE_KEY: z
    .string({ required_error: 'SUPABASE_SERVICE_ROLE_KEY is required' })
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  // Shared secret protecting scheduled (cron) routes. Server-only.
  CRON_SECRET: z
    .string({ required_error: 'CRON_SECRET is required' })
    .min(1, 'CRON_SECRET is required'),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

/**
 * Validate and return server-only secrets.
 * Throws a descriptive, secret-free error listing missing variables.
 * Never logs or returns the secret values themselves.
 */
export function getServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
  })
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid server environment configuration:\n- ${issues.join('\n- ')}`)
  }
  return parsed.data
}
